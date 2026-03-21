import bpy
import bmesh
import math
import os

# ---------------------------------------------------------------------------
# Setup and Utilities
# ---------------------------------------------------------------------------

def clear_scene():
    if bpy.context.active_object and bpy.context.active_object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for col in bpy.data.collections:
        if col.name != "Collection":
            bpy.data.collections.remove(col)
    for mesh in bpy.data.meshes:
        bpy.data.meshes.remove(mesh)
    for arm in bpy.data.armatures:
        bpy.data.armatures.remove(arm)
    for mat in bpy.data.materials:
        bpy.data.materials.remove(mat)

def make_material(name: str, color: tuple) -> bpy.types.Material:
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = 0.9
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.5
    elif "Specular" in bsdf.inputs:
        bsdf.inputs["Specular"].default_value = 0.5
    return mat

def apply_transforms(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.select_set(False)

def make_box(name: str, loc: tuple, size: tuple, mat) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    obj.location = loc
    apply_transforms(obj)
    return obj

def make_cylinder(name: str, loc: tuple, radius: float, depth: float, rot: tuple, mat) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=12, radius1=radius, radius2=radius, depth=depth)
    # The cone comes aligned on Z axis. Rotate it appropriately using euler
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0,0,0), matrix=mathutils.Euler(rot, 'XYZ').to_matrix())
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    obj.location = loc
    apply_transforms(obj)
    return obj

def make_sphere(name: str, loc: tuple, radius: tuple, mat) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=1.0)
    bmesh.ops.scale(bm, vec=radius, verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    obj.location = loc
    apply_transforms(obj)
    return obj

import mathutils

# ---------------------------------------------------------------------------
# Armature & Rigging
# ---------------------------------------------------------------------------

def create_armature(char_name: str, h: float, ws: float) -> bpy.types.Object:
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    bpy.ops.object.armature_add(enter_editmode=True, align='WORLD', location=(0, 0, 0))
    arm_obj = bpy.context.active_object
    arm_obj.name = char_name + "_Rig"
    amt = arm_obj.data
    amt.name = char_name + "_Armature"
    
    Bone = amt.edit_bones[0]
    Bone.name = "Root"
    Bone.head = (0, 0, 5*h)
    Bone.tail = (0, 0, 8*h)

    def add_bone(name, head, tail, parent_name=None):
        b = amt.edit_bones.new(name)
        b.head = head
        b.tail = tail
        if parent_name:
            b.parent = amt.edit_bones[parent_name]
        return b

    add_bone("Head",  (0, 0, 8*h), (0, 0, 10*h), "Root")
    add_bone("Arm_L", (-1.5*ws, 0, 7.5*h), (-3.5*ws, 0, 4.0*h), "Root")
    add_bone("Arm_R", ( 1.5*ws, 0, 7.5*h), ( 3.5*ws, 0, 4.0*h), "Root")
    add_bone("Leg_L", (-0.8*ws, 0, 5*h), (-0.8*ws, 0, 0), "Root")
    add_bone("Leg_R", ( 0.8*ws, 0, 5*h), ( 0.8*ws, 0, 0), "Root")
    
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm_obj

def parent_mesh_to_bone(mesh_obj: bpy.types.Object, armature_obj: bpy.types.Object, bone_name: str):
    mod = mesh_obj.modifiers.new(name="Armature", type='ARMATURE')
    mod.object = armature_obj
    mesh_obj.parent = armature_obj
    mesh_obj.parent_type = 'OBJECT'
    vg = mesh_obj.vertex_groups.new(name=bone_name)
    vg.add(list(range(len(mesh_obj.data.vertices))), 1.0, 'REPLACE')

def set_bone_rx(frame, bone_name, angle):
    arm_obj = bpy.context.active_object
    pbone = arm_obj.pose.bones[bone_name]
    pbone.rotation_mode = 'XYZ'
    pbone.rotation_euler[0] = angle
    pbone.keyframe_insert(data_path="rotation_euler", index=0, frame=frame)

def set_bone_locZ(frame, bone_name, dz):
    arm_obj = bpy.context.active_object
    pbone = arm_obj.pose.bones[bone_name]
    pbone.location[2] = dz
    pbone.keyframe_insert(data_path="location", index=2, frame=frame)

def bake_animations(arm_obj: bpy.types.Object, h: float, ws: float):
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode='POSE')
    
    # ── IDLE ──
    idle_action = bpy.data.actions.new(name="Idle")
    arm_obj.animation_data_create()
    arm_obj.animation_data.action = idle_action

    bones = ["Leg_L", "Leg_R", "Arm_L", "Arm_R", "Head", "Root"]
    bpy.context.scene.frame_set(1)
    for b in bones:
        set_bone_rx(1, b, 0.0)
    # Body bobbing for idle
    set_bone_locZ(1, "Root", 0.0)
    set_bone_locZ(20, "Root", -0.2*h)
    set_bone_locZ(40, "Root", 0.0)
    idle_action.frame_range = (1, 40)

    # ── WALK ──
    walk_action = bpy.data.actions.new(name="Walk")
    arm_obj.animation_data.action = walk_action

    SWING = 0.87
    keyframes = {
        1:  {"Leg_L":  0.0,    "Leg_R":  0.0,    "Arm_L":  0.0,    "Arm_R":  0.0},
        11: {"Leg_L":  SWING,  "Leg_R": -SWING,  "Arm_L": -SWING,  "Arm_R":  SWING},
        21: {"Leg_L":  0.0,    "Leg_R":  0.0,    "Arm_L":  0.0,    "Arm_R":  0.0},
        31: {"Leg_L": -SWING,  "Leg_R":  SWING,  "Arm_L":  SWING,  "Arm_R": -SWING},
        40: {"Leg_L":  0.0,    "Leg_R":  0.0,    "Arm_L":  0.0,    "Arm_R":  0.0},
    }
    for frame, poses in keyframes.items():
        bpy.context.scene.frame_set(frame)
        for bone_name, angle in poses.items():
            set_bone_rx(frame, bone_name, angle)
    
    # Heavy body bobbing on walk to convey weight
    set_bone_locZ(1, "Root", -0.5*h)
    set_bone_locZ(11, "Root", 0.4*h)
    set_bone_locZ(21, "Root", -0.5*h)
    set_bone_locZ(31, "Root", 0.4*h)
    set_bone_locZ(40, "Root", -0.5*h)
    walk_action.frame_range = (1, 40)

    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end   = 40
    bpy.ops.object.mode_set(mode='OBJECT')

    # NLA Binding
    arm_obj.animation_data_create()
    for track in list(arm_obj.animation_data.nla_tracks):
        arm_obj.animation_data.nla_tracks.remove(track)
    for action in [idle_action, walk_action]:
        track = arm_obj.animation_data.nla_tracks.new()
        track.name = action.name
        strip = track.strips.new(action.name, int(action.frame_range[0]), action)
        strip.action_frame_start, strip.action_frame_end = action.frame_range

# ---------------------------------------------------------------------------
# Anatomy Builder
# ---------------------------------------------------------------------------

def build_anatomical_skeleton(char_name: str, size_mult: float, export_path: str):
    clear_scene()

    bone_col = (0.85, 0.82, 0.70, 1) # Realistic brownish bone
    drk_col  = (0.1, 0.1, 0.1, 1)    # Dark cavities (nose, spine gaps)
    
    # Make them taller! Increase height scalar considerably compared to width scalar
    total_height = 2.4 * size_mult # Was 2.0
    h = total_height / 10.0
    ws = (1.4 * size_mult) / 10.0 # Make them thinner
    
    arm_obj = create_armature(char_name, h, ws)
    
    mat_bone = make_material(char_name + "_BoneMat", bone_col)
    mat_dark = make_material(char_name + "_DarkMat", drk_col)
    
    # Glowing Red Eyes
    mat_glow = bpy.data.materials.new(name="RedGlow")
    mat_glow.use_nodes = True
    bsdf = mat_glow.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (1, 0, 0, 1)
    bsdf.inputs["Emission Color"].default_value = (1, 0, 0, 1)
    bsdf.inputs["Emission Strength"].default_value = 10.0
    
    meshes = []
    def add(mesh_obj, bone):
        parent_mesh_to_bone(mesh_obj, arm_obj, bone)
        meshes.append(mesh_obj)

    # --- 1. SKULL (Facing -Y) ---
    skull = make_sphere("Skull", (0, 0, 9*h), (1.3*ws, 1.5*ws, 1.4*h), mat_bone)
    jaw = make_box("Jaw", (0, -0.4*ws, 8.0*h), (0.9*ws, 1.2*ws, 0.8*h), mat_bone) # y is negative
    eyeL = make_sphere("Eye_L", (-0.4*ws, -1.2*ws, 8.8*h), (0.35*ws, 0.35*ws, 0.35*h), mat_glow)
    eyeR = make_sphere("Eye_R", ( 0.4*ws, -1.2*ws, 8.8*h), (0.35*ws, 0.35*ws, 0.35*h), mat_glow)
    nose = make_cylinder("Nose", (0, -1.3*ws, 8.3*h), 0.15*ws, 0.5*h, (math.pi/2,0,0), mat_dark)
    add(skull, "Head"); add(jaw, "Head"); add(eyeL, "Head"); add(eyeR, "Head"); add(nose, "Head")

    # --- 2. SPINE (Segmented) ---
    for i in range(13):
        z = 4.5*h + i * (3.5*h / 12)
        thick = 0.4*ws if i < 9 else 0.25*ws
        mat = mat_bone if i % 2 == 0 else mat_dark
        s = make_cylinder(f"Spine_{i}", (0, 0.2*ws, z), thick, 0.2*h, (0,0,0), mat) # Spine pushed slightly back (+Y)
        add(s, "Root")

    # --- 3. PELVIS ---
    pelvis_base = make_box("Pelvis_Base", (0, 0, 4.3*h), (1.4*ws, 0.8*ws, 0.8*h), mat_bone)
    il_L = make_sphere("Ilium_L", (-0.8*ws, -0.1*ws, 4.5*h), (0.9*ws, 0.5*ws, 0.9*h), mat_bone)
    il_R = make_sphere("Ilium_R", ( 0.8*ws, -0.1*ws, 4.5*h), (0.9*ws, 0.5*ws, 0.9*h), mat_bone)
    add(pelvis_base, "Root"); add(il_L, "Root"); add(il_R, "Root")
    
    # --- 4. RIBCAGE ---
    clr_L = make_cylinder("Collar_L", (-0.8*ws, -0.1*ws, 7.8*h), 0.2*ws, 1.8*ws, (0, math.pi/2, 0.2), mat_bone)
    clr_R = make_cylinder("Collar_R", ( 0.8*ws, -0.1*ws, 7.8*h), 0.2*ws, 1.8*ws, (0, math.pi/2, -0.2), mat_bone)
    sternum = make_box("Sternum", (0, -0.8*ws, 6.5*h), (0.25*ws, 0.15*ws, 1.8*h), mat_bone)
    add(clr_L, "Root"); add(clr_R, "Root"); add(sternum, "Root")

    for i in range(9): # More ribs
        z = 7.5*h - i * 0.3*h
        w = 1.3 - abs(i-4)*0.15
        d = 0.9 + (i*0.03)
        ribL = make_box(f"Rib_L_{i}", (-w*0.8*ws, -0.4*ws, z), (w*1.5*ws, d*1.2*ws, 0.1*h), mat_bone)
        ribR = make_box(f"Rib_R_{i}", ( w*0.8*ws, -0.4*ws, z), (w*1.5*ws, d*1.2*ws, 0.1*h), mat_bone)
        add(ribL, "Root"); add(ribR, "Root")

    # --- 5. ARMS ---
    sh_L = make_sphere("ShL", (-1.6*ws, 0, 7.6*h), (0.35*ws, 0.35*ws, 0.35*h), mat_bone)
    sh_R = make_sphere("ShR", ( 1.6*ws, 0, 7.6*h), (0.35*ws, 0.35*ws, 0.35*h), mat_bone)
    el_L = make_sphere("ElL", (-2.6*ws, -0.1*ws, 5.8*h), (0.25*ws, 0.25*ws, 0.25*h), mat_bone)
    el_R = make_sphere("ElR", ( 2.6*ws, -0.1*ws, 5.8*h), (0.25*ws, 0.25*ws, 0.25*h), mat_bone)
    add(sh_L, "Arm_L"); add(sh_R, "Arm_R"); add(el_L, "Arm_L"); add(el_R, "Arm_R")
    
    hum_L = make_cylinder("HumL", (-2.1*ws, -0.05*ws, 6.7*h), 0.2*ws, 2.0*h, (0, math.pi/4, 0), mat_bone)
    hum_R = make_cylinder("HumR", ( 2.1*ws, -0.05*ws, 6.7*h), 0.2*ws, 2.0*h, (0, -math.pi/4, 0), mat_bone)
    add(hum_L, "Arm_L"); add(hum_R, "Arm_R")
    
    for b_offset in [-0.1, 0.1]:
        lowL = make_cylinder(f"LowL_{b_offset}", (-3.1*ws+b_offset*ws, -0.15*ws, 4.8*h), 0.12*ws, 1.8*h, (0, math.pi/6, 0), mat_bone)
        lowR = make_cylinder(f"LowR_{b_offset}", ( 3.1*ws+b_offset*ws, -0.15*ws, 4.8*h), 0.12*ws, 1.8*h, (0, -math.pi/6, 0), mat_bone)
        add(lowL, "Arm_L"); add(lowR, "Arm_R")
        
    hand_L = make_box("HandL", (-3.6*ws, -0.2*ws, 3.8*h), (0.5*ws, 0.5*ws, 0.8*h), mat_bone)
    hand_R = make_box("HandR", ( 3.6*ws, -0.2*ws, 3.8*h), (0.5*ws, 0.5*ws, 0.8*h), mat_bone)
    add(hand_L, "Arm_L"); add(hand_R, "Arm_R")

    # --- 6. LEGS ---
    hip_L = make_sphere("HipL", (-0.8*ws, 0, 4.1*h), (0.35*ws, 0.35*ws, 0.35*h), mat_bone)
    hip_R = make_sphere("HipR", ( 0.8*ws, 0, 4.1*h), (0.35*ws, 0.35*ws, 0.35*h), mat_bone)
    kn_L  = make_sphere("KnL",  (-0.8*ws, -0.2*ws, 2.2*h), (0.3*ws, 0.3*ws, 0.3*h), mat_bone) # Knees point slightly forward (-Y)
    kn_R  = make_sphere("KnR",  ( 0.8*ws, -0.2*ws, 2.2*h), (0.3*ws, 0.3*ws, 0.3*h), mat_bone)
    add(hip_L, "Leg_L"); add(hip_R, "Leg_R"); add(kn_L, "Leg_L"); add(kn_R, "Leg_R")
    
    fem_L = make_cylinder("FemL", (-0.8*ws, -0.1*ws, 3.1*h), 0.25*ws, 2.2*h, (-0.1, 0, 0), mat_bone)
    fem_R = make_cylinder("FemR", ( 0.8*ws, -0.1*ws, 3.1*h), 0.25*ws, 2.2*h, (-0.1, 0, 0), mat_bone)
    add(fem_L, "Leg_L"); add(fem_R, "Leg_R")
    
    for b_offset in [-0.1, 0.1]:
        tibL = make_cylinder(f"TibL_{b_offset}", (-0.8*ws + b_offset*ws, -0.1*ws, 1.1*h), 0.13*ws, 2.2*h, (0.05,0,0), mat_bone)
        tibR = make_cylinder(f"TibR_{b_offset}", ( 0.8*ws + b_offset*ws, -0.1*ws, 1.1*h), 0.13*ws, 2.2*h, (0.05,0,0), mat_bone)
        add(tibL, "Leg_L"); add(tibR, "Leg_R")
    
    # Feet pointing forward (-Y)
    foot_L = make_box("FootL", (-0.8*ws, -0.6*ws, 0.2*h), (0.5*ws, 1.6*ws, 0.3*h), mat_bone)
    foot_R = make_box("FootR", ( 0.8*ws, -0.6*ws, 0.2*h), (0.5*ws, 1.6*ws, 0.3*h), mat_bone)
    add(foot_L, "Leg_L"); add(foot_R, "Leg_R")

    # ── 7. Bake and Export ──
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    bake_animations(arm_obj, h, ws)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.fbx(
        filepath               = export_path,
        use_selection          = False,
        object_types           = {'ARMATURE', 'MESH'},
        axis_forward           = '-Z',
        axis_up                = 'Y',
        bake_anim              = True,
        bake_anim_use_all_actions = True,
        bake_anim_step         = 1,
        bake_anim_simplify_factor = 0.0,
        add_leaf_bones         = False,
        mesh_smooth_type       = 'FACE'
    )
    print(f"[MegaZoida] Custom Anatomical Skeleton Exported: {export_path}")

p = r"c:\Users\chapa\Desktop\MegaZoida\public\assets\models\\"
build_anatomical_skeleton("AnatomicalSkeleton", 15.0, p + "Enemy_Skeleton.fbx")

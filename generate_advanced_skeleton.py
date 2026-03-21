import bpy
import bmesh
import math
from mathutils import Vector

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def create_bone_material():
    mat = bpy.data.materials.new(name="AdvancedBone")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    
    out = nodes.new('ShaderNodeOutputMaterial')
    out.location = (600, 0)
    pbr = nodes.new('ShaderNodeBsdfPrincipled')
    pbr.location = (300, 0)
    
    # Bone color: slightly yellowish/greyish white
    pbr.inputs['Base Color'].default_value = (0.85, 0.82, 0.75, 1.0)
    pbr.inputs['Roughness'].default_value = 0.8
    pbr.inputs['Metallic'].default_value = 0.0

    links.new(pbr.outputs['BSDF'], out.inputs['Surface'])
    return mat

def create_dark_material():
    mat = bpy.data.materials.new(name="BoneDark")
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.1, 0.1, 0.1, 1.0)
    return mat

def assign_weight(obj, bone_name):
    vg = obj.vertex_groups.new(name=bone_name)
    vg.add(range(len(obj.data.vertices)), 1.0, 'REPLACE')

def create_limb(name, loc, length, thickness, mat):
    # Create bone shaft
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=thickness, depth=length, location=loc)
    shaft = bpy.context.active_object
    shaft.name = name
    shaft.data.materials.append(mat)
    
    # Joint top
    bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=8, radius=thickness*1.4, location=(loc[0], loc[1], loc[2] + length/2))
    jt = bpy.context.active_object
    jt.data.materials.append(mat)
    
    # Joint bottom
    bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=8, radius=thickness*1.4, location=(loc[0], loc[1], loc[2] - length/2))
    jb = bpy.context.active_object
    jb.data.materials.append(mat)
    
    # Join them
    bpy.ops.object.select_all(action='DESELECT')
    shaft.select_set(True)
    jt.select_set(True)
    jb.select_set(True)
    bpy.context.view_layer.objects.active = shaft
    bpy.ops.object.join()
    
    return shaft

def build_advanced_skeleton(char_name, size_mult, export_path):
    clear_scene()
    
    mat = create_bone_material()
    dark_mat = create_dark_material()

    total_height = 2.0 * size_mult
    w = 1.6 * size_mult
    
    h = total_height / 10.0
    ws = w / 10.0
    depth = ws * 1.5 
    
    # ==========================================
    # 1. SKULL
    # ==========================================
    bpy.ops.mesh.primitive_cube_add(location=(0, 0, 8.5*h))
    skull = bpy.context.active_object
    skull.name = char_name + "_Head"
    skull.scale = (2.2*ws, depth*1.2, 1.5*h)
    bpy.ops.object.transform_apply(scale=True)
    
    # Bevel skull
    bevel = skull.modifiers.new("Bevel", 'BEVEL')
    bevel.width = 1.5
    bevel.segments = 3
    bpy.ops.object.modifier_apply(modifier="Bevel")
    
    # Eye sockets (Booleans)
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.8*ws, depth=2*depth, location=(-1.0*ws, -depth*0.8, 8.8*h))
    eye_l = bpy.context.active_object
    eye_l.rotation_euler = (math.radians(90), 0, 0)
    
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.8*ws, depth=2*depth, location=(1.0*ws, -depth*0.8, 8.8*h))
    eye_r = bpy.context.active_object
    eye_r.rotation_euler = (math.radians(90), 0, 0)
    
    # Nose socket
    bpy.ops.mesh.primitive_cone_add(vertices=3, radius1=0.6*ws, depth=2*depth, location=(0, -depth*0.8, 7.8*h))
    nose = bpy.context.active_object
    nose.rotation_euler = (math.radians(90), 0, 0)
    
    # Apply Booleans
    for cutter in [eye_l, eye_r, nose]:
        bool_mod = skull.modifiers.new(name="Bool", type='BOOLEAN')
        bool_mod.operation = 'DIFFERENCE'
        bool_mod.object = cutter
        bool_mod.solver = 'EXACT'
        bpy.context.view_layer.objects.active = skull
        bpy.ops.object.modifier_apply(modifier="Bool")
        bpy.data.objects.remove(cutter)
        
    skull.data.materials.append(mat)
    assign_weight(skull, "Head")
    
    # ==========================================
    # 2. RIBCAGE & SPINE
    # ==========================================
    # Spine
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.6*ws, depth=4*h, location=(0, 0, 5*h))
    spine = bpy.context.active_object
    spine.name = char_name + "_Spine"
    spine.data.materials.append(mat)
    
    # Ribcage base block
    bpy.ops.mesh.primitive_cube_add(location=(0, int(depth*0.2), 5.5*h))
    ribs = bpy.context.active_object
    ribs.name = char_name + "_Ribs"
    ribs.scale = (2.5*ws, depth*1.2, 2.0*h)
    bpy.ops.object.transform_apply(scale=True)
    
    # Boolean cutter for ribcage inner hollow
    bpy.ops.mesh.primitive_cube_add(location=(0, -depth*0.2, 5.5*h))
    hollow = bpy.context.active_object
    hollow.scale = (2.0*ws, depth*1.5, 2.5*h)
    bpy.ops.object.transform_apply(scale=True)
    
    # Boolean cutters for rib gaps (horizontal slots)
    gaps = []
    for i in range(4):
        bpy.ops.mesh.primitive_cube_add(location=(0, 0, 4.2*h + i*h*0.8))
        gap = bpy.context.active_object
        gap.scale = (3.5*ws, depth*2, h*0.2)
        bpy.ops.object.transform_apply(scale=True)
        gaps.append(gap)
        
    for cutter in [hollow] + gaps:
        bool_mod = ribs.modifiers.new(name="Bool", type='BOOLEAN')
        bool_mod.operation = 'DIFFERENCE'
        bool_mod.object = cutter
        bpy.context.view_layer.objects.active = ribs
        bpy.ops.object.modifier_apply(modifier="Bool")
        bpy.data.objects.remove(cutter)
        
    ribs.data.materials.append(mat)
    
    # Pelvis
    bpy.ops.mesh.primitive_cube_add(location=(0, 0, 3*h))
    pelvis = bpy.context.active_object
    pelvis.scale = (2.0*ws, depth*0.8, 0.6*h)
    bpy.ops.object.transform_apply(scale=True)
    
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=1.0*ws, depth=2*depth, location=(0, 0, 2.5*h))
    p_cut = bpy.context.active_object
    p_cut.rotation_euler = (math.radians(90), 0, 0)
    
    bool_mod = pelvis.modifiers.new(name="Bool", type='BOOLEAN')
    bool_mod.operation = 'DIFFERENCE'
    bool_mod.object = p_cut
    bpy.context.view_layer.objects.active = pelvis
    bpy.ops.object.modifier_apply(modifier="Bool")
    bpy.data.objects.remove(p_cut)
    
    pelvis.data.materials.append(mat)
    
    # Join Body Parts
    bpy.ops.object.select_all(action='DESELECT')
    spine.select_set(True)
    ribs.select_set(True)
    pelvis.select_set(True)
    bpy.context.view_layer.objects.active = spine
    bpy.ops.object.join()
    body = bpy.context.active_object
    body.name = char_name + "_Body"
    assign_weight(body, "Root")
    
    # ==========================================
    # 3. LIMBS
    # ==========================================
    arm_l = create_limb(char_name+"_Arm_L", (-2.8*ws, 0, 5.5*h), 3.5*h, 0.4*ws, mat)
    assign_weight(arm_l, "Arm_L")
    
    arm_r = create_limb(char_name+"_Arm_R", (2.8*ws, 0, 5.5*h), 3.5*h, 0.4*ws, mat)
    assign_weight(arm_r, "Arm_R")
    
    leg_l = create_limb(char_name+"_Leg_L", (-1.2*ws, 0, 1.5*h), 3.0*h, 0.5*ws, mat)
    assign_weight(leg_l, "Leg_L")
    
    leg_r = create_limb(char_name+"_Leg_R", (1.2*ws, 0, 1.5*h), 3.0*h, 0.5*ws, mat)
    assign_weight(leg_r, "Leg_R")

    # ==========================================
    # 4. JOIN ALL
    # ==========================================
    bpy.ops.object.select_all(action='DESELECT')
    parts = [skull, body, arm_l, arm_r, leg_l, leg_r]
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body.name = char_name

    # FIX: Set the mesh origin strictly to (0,0,0) before skinning!
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')

    # ==========================================
    # 5. RIGGING & ANIMATION
    # ==========================================
    bpy.ops.object.armature_add(enter_editmode=True, align='WORLD', location=(0, 0, 0))
    arm_obj = bpy.context.active_object
    arm_obj.name = char_name + "_Rig"
    armature = arm_obj.data

    bpy.ops.armature.select_all(action='SELECT')
    bpy.ops.armature.delete()

    def add_bone(name, head_loc, tail_loc, parent=None):
        bone = armature.edit_bones.new(name)
        bone.head = head_loc
        bone.tail = tail_loc
        if parent:
            bone.parent = armature.edit_bones[parent]
        return bone

    add_bone("Root", (0, 0, 3*h), (0, 0, 7*h))
    add_bone("Head", (0, 0, 7*h), (0, 0, 10*h), "Root")
    add_bone("Leg_L", (-1.2*ws, 0, 3*h), (-1.2*ws, 0, 0), "Root")
    add_bone("Leg_R", (1.2*ws, 0, 3*h), (1.2*ws, 0, 0), "Root")
    add_bone("Arm_L", (-2.8*ws, 0, 7*h), (-2.8*ws, 0, 3.5*h), "Root")
    add_bone("Arm_R", (2.8*ws, 0, 7*h), (2.8*ws, 0, 3.5*h), "Root")

    bpy.ops.object.mode_set(mode='OBJECT')

    mod = body.modifiers.new(name="Armature", type='ARMATURE')
    mod.object = arm_obj
    body.parent = arm_obj
    
    def set_kf_advanced(action_name, frame, rx_dict, root_dz=0.0):
        if action_name not in bpy.data.actions:
            act = bpy.data.actions.new(name=action_name)
        else:
            act = bpy.data.actions[action_name]
            
        arm_obj.animation_data_create()
        arm_obj.animation_data.action = act
        
        for bone_name, rx in rx_dict.items():
            pbo = arm_obj.pose.bones[bone_name]
            pbo.rotation_mode = 'XYZ'
            pbo.rotation_euler[0] = rx
            pbo.keyframe_insert(data_path="rotation_euler", index=0, frame=frame)
            
        root_pbo = arm_obj.pose.bones["Root"]
        root_pbo.location[2] = root_dz
        root_pbo.keyframe_insert(data_path="location", index=2, frame=frame)

    bpy.ops.object.mode_set(mode='POSE')
    
    # Idle (Gentle breathing bobbing)
    set_kf_advanced("Idle", 1, {"Leg_L": 0, "Leg_R": 0, "Arm_L": 0, "Arm_R": 0}, 0.0)
    set_kf_advanced("Idle", 20, {"Leg_L": 0, "Leg_R": 0, "Arm_L": 0, "Arm_R": 0}, -0.5)
    set_kf_advanced("Idle", 40, {"Leg_L": 0, "Leg_R": 0, "Arm_L": 0, "Arm_R": 0}, 0.0)

    # Walk (Wide steps with heavy Root bobbing to convey weight)
    w = 1.3
    set_kf_advanced("Walk", 1, {"Leg_L": -w, "Leg_R": w, "Arm_L": w, "Arm_R": -w}, -1.0)
    set_kf_advanced("Walk", 10, {"Leg_L": 0, "Leg_R": 0, "Arm_L": 0, "Arm_R": 0}, 0.8)
    set_kf_advanced("Walk", 20, {"Leg_L": w, "Leg_R": -w, "Arm_L": -w, "Arm_R": w}, -1.0)
    set_kf_advanced("Walk", 30, {"Leg_L": 0, "Leg_R": 0, "Arm_L": 0, "Arm_R": 0}, 0.8)
    set_kf_advanced("Walk", 40, {"Leg_L": -w, "Leg_R": w, "Arm_L": w, "Arm_R": -w}, -1.0)

    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 40
    bpy.ops.object.mode_set(mode='OBJECT')

    bpy.ops.export_scene.fbx(
        filepath=export_path, 
        use_selection=False, 
        bake_anim=True, 
        bake_anim_use_nla_strips=False, 
        bake_anim_use_all_actions=True,  # Crucial to export Idle AND Walk separate clips
        add_leaf_bones=False
    )

p = r"c:\Users\chapa\Desktop\MegaZoida\public\assets\models\\"
build_advanced_skeleton("Skeleton", 15.0, p+"Enemy_Skeleton.fbx")

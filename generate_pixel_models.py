"""
MegaZoida — Pixel Character Generator (Fixed)
==============================================
Architecture: Armature is created FIRST, then each mesh part is parented
to the armature with a vertex-group weight paint that covers all vertices.
NO bpy.ops.object.join() is used — join destroys vertex groups in Blender.

Correct order:
  1. Create armature + bones
  2. Create each mesh part separately
  3. Add Armature modifier to each mesh
  4. Create vertex group named after the bone, assign weight 1.0 to all verts
  5. Bake animations to NLA tracks
  6. Export FBX (bake_anim=True, bake_anim_step=1)
"""

import bpy
import bmesh
import math


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_material(name: str, color: tuple) -> bpy.types.Material:
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    # No specular — flat pixel look
    bsdf.inputs["Roughness"].default_value = 1.0
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.0
    elif "Specular" in bsdf.inputs:
        bsdf.inputs["Specular"].default_value = 0.0
    return mat


def make_box(name: str, location: tuple, size: tuple, mat: bpy.types.Material) -> bpy.types.Object:
    """Create a box mesh at world-space `location` with given `size`."""
    mesh = bpy.data.meshes.new(name)
    obj  = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()

    mesh.materials.append(mat)
    obj.location = location
    # Apply location so vertex positions are in world space — important for
    # correct bone-relative deformation after parenting.
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.select_set(False)
    return obj


def parent_mesh_to_bone(mesh_obj: bpy.types.Object,
                         armature_obj: bpy.types.Object,
                         bone_name: str):
    """
    Parent mesh_obj to armature_obj and assign all vertices to bone_name
    with weight 1.0.  This is the correct way to do rigid bone parenting
    in Blender's Python API (not bpy.ops.object.parent_set which needs
    context hacks).
    """
    # Add Armature modifier
    mod = mesh_obj.modifiers.new(name="Armature", type='ARMATURE')
    mod.object = armature_obj

    # Parent relationship (needed so FBX exporter sees the hierarchy)
    mesh_obj.parent = armature_obj
    mesh_obj.parent_type = 'OBJECT'

    # Vertex group = bone name, all verts weight 1.0
    vg = mesh_obj.vertex_groups.new(name=bone_name)
    all_vert_indices = [v.index for v in mesh_obj.data.vertices]
    vg.add(all_vert_indices, 1.0, 'REPLACE')


# ---------------------------------------------------------------------------
# Armature builder
# ---------------------------------------------------------------------------

def create_armature(char_name: str, h: float, ws: float) -> bpy.types.Object:
    """Create armature with 6 bones.  Returns the armature object."""
    bpy.ops.object.armature_add(enter_editmode=True,
                                align='WORLD',
                                location=(0, 0, 0))
    arm_obj      = bpy.context.active_object
    arm_obj.name = char_name + "_Rig"
    armature     = arm_obj.data
    armature.name = char_name + "_Armature"

    # Delete the default bone
    bpy.ops.armature.select_all(action='SELECT')
    bpy.ops.armature.delete()

    def add_bone(name, head_pos, tail_pos, parent_name=None):
        bone      = armature.edit_bones.new(name)
        bone.head = head_pos
        bone.tail = tail_pos
        if parent_name:
            bone.parent = armature.edit_bones[parent_name]
        return bone

    # Root at hip height, drives torso
    add_bone("Root",  (0,         0, 4*h),    (0,         0, 6*h))
    # Head
    add_bone("Head",  (0,         0, 8*h),    (0,         0, 10*h),  "Root")
    # Legs hang DOWN from hip
    add_bone("Leg_L", (-1.0*ws,  0, 4*h),    (-1.0*ws,  0,  0),    "Root")
    add_bone("Leg_R", ( 1.0*ws,  0, 4*h),    ( 1.0*ws,  0,  0),    "Root")
    # Arms hang DOWN from shoulder
    add_bone("Arm_L", (-2.6*ws,  0, 7.5*h),  (-2.6*ws,  0, 4*h),   "Root")
    add_bone("Arm_R", ( 2.6*ws,  0, 7.5*h),  ( 2.6*ws,  0, 4*h),   "Root")

    bpy.ops.object.mode_set(mode='OBJECT')
    return arm_obj


# ---------------------------------------------------------------------------
# Animation baker
# ---------------------------------------------------------------------------

def bake_animations(arm_obj: bpy.types.Object, h: float, _ws: float):
    """
    Create Idle (1 frame) and Walk (40 frames, 4-key BEZIER) actions,
    then push them to NLA so FBX bake_anim picks them up.
    """
    bpy.context.view_layer.objects.active = arm_obj
    arm_obj.select_set(True)
    bpy.ops.object.mode_set(mode='POSE')

    # ── helpers ──────────────────────────────────────────────────────────

    def get_action(name: str) -> bpy.types.Action:
        if name in bpy.data.actions:
            return bpy.data.actions[name]
        return bpy.data.actions.new(name=name)

    def set_bone_rx(frame: int, bone_name: str, angle: float):
        pbone = arm_obj.pose.bones[bone_name]
        pbone.rotation_mode = 'XYZ'
        pbone.rotation_euler[0] = angle
        pbone.keyframe_insert(data_path="rotation_euler", index=0, frame=frame)

    def smooth_fcurves(action: bpy.types.Action):
        """Set BEZIER + AUTO_CLAMPED handles on every fcurve."""
        for fc in action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation      = 'BEZIER'
                kp.handle_left_type  = 'AUTO_CLAMPED'
                kp.handle_right_type = 'AUTO_CLAMPED'

    # ── IDLE ─────────────────────────────────────────────────────────────
    idle_action = get_action("Idle")
    arm_obj.animation_data_create()
    arm_obj.animation_data.action = idle_action

    bones = ["Leg_L", "Leg_R", "Arm_L", "Arm_R", "Head", "Root"]
    bpy.context.scene.frame_set(1)
    for b in bones:
        set_bone_rx(1, b, 0.0)

    idle_action.frame_range = (1, 1)

    # ── WALK ─────────────────────────────────────────────────────────────
    # 4-keyframe walk with BEZIER interpolation so Three.js sees smooth motion.
    # Swing angle ~50° gives clearly visible steps without looking like a robot.
    walk_action = get_action("Walk")
    arm_obj.animation_data.action = walk_action

    SWING = 0.87   # radians ≈ 50°

    # frame → {bone: rotation_x}
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

    walk_action.frame_range = (1, 40)

    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end   = 40

    bpy.ops.object.mode_set(mode='OBJECT')

    # ── Push both actions to NLA so FBX exporter bakes them ──────────────
    arm_obj.animation_data_create()

    # Clear existing NLA tracks to avoid duplicates on re-run
    for track in list(arm_obj.animation_data.nla_tracks):
        arm_obj.animation_data.nla_tracks.remove(track)

    for action in [idle_action, walk_action]:
        track       = arm_obj.animation_data.nla_tracks.new()
        track.name  = action.name
        strip       = track.strips.new(action.name,
                                       int(action.frame_range[0]),
                                       action)
        strip.action_frame_start = action.frame_range[0]
        strip.action_frame_end   = action.frame_range[1]


# ---------------------------------------------------------------------------
# Main builder
# ---------------------------------------------------------------------------

def build_character(char_name: str,
                    size_mult: float,
                    head_col:  tuple,
                    body_col:  tuple,
                    arm_col:   tuple,
                    leg_col:   tuple,
                    export_path: str):

    clear_scene()

    total_height = 2.0 * size_mult
    w  = 1.6 * size_mult
    h  = total_height / 10.0
    ws = w / 10.0
    d  = ws * 1.5   # depth (thin flat look)

    # ── 1. Armature first ────────────────────────────────────────────────
    arm_obj = create_armature(char_name, h, ws)

    # ── 2. Mesh parts ────────────────────────────────────────────────────
    mh = make_material(char_name + "_Head",  head_col)
    mb = make_material(char_name + "_Body",  body_col)
    ma = make_material(char_name + "_Arm",   arm_col)
    ml = make_material(char_name + "_Leg",   leg_col)

    # Create special emissive materials
    glow_red = make_material(char_name + "_GlowR", (1, 0, 0, 1))
    glow_red.node_tree.nodes["Principled BSDF"].inputs["Emission Color"].default_value = (1, 0, 0, 1)
    glow_red.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 5.0

    wood = make_material("Wood", (0.4, 0.2, 0.05, 1))
    iron = make_material("Iron", (0.8, 0.8, 0.8, 1))

    # Base parts
    parts = [
        # (mesh_name,           location,              size,              material, bone)
        (char_name+"_Head",   (0,        0, 9*h),   (3.6*ws, d, 2*h),   mh, "Head"),
        (char_name+"_Body",   (0,        0, 6*h),   (3.6*ws, d, 4*h),   mb, "Root"),
        (char_name+"_Arm_L",  (-2.6*ws, 0, 6*h),   (1.2*ws, d, 3.5*h), ma, "Arm_L"),
        (char_name+"_Arm_R",  ( 2.6*ws, 0, 6*h),   (1.2*ws, d, 3.5*h), ma, "Arm_R"),
        (char_name+"_Leg_L",  (-1.0*ws, 0, 2*h),   (1.2*ws, d, 4*h),   ml, "Leg_L"),
        (char_name+"_Leg_R",  ( 1.0*ws, 0, 2*h),   (1.2*ws, d, 4*h),   ml, "Leg_R"),
    ]

    # --- CREATIVE DETAILS ---
    if char_name == "Skeleton":
        # Hollow eyes (red glowing blocks on face)
        parts.append((char_name+"_Eye_L", (-0.8*ws, -d/2 - 0.2, 9.2*h), (0.6*ws, 0.4, 0.6*h), glow_red, "Head"))
        parts.append((char_name+"_Eye_R", ( 0.8*ws, -d/2 - 0.2, 9.2*h), (0.6*ws, 0.4, 0.6*h), glow_red, "Head"))
        # Ribs (horizontal white stripes across the body)
        for i in range(3):
            parts.append((char_name+f"_Rib_{i}", (0, -d/2 - 0.2, (5.0 + i*1.2)*h), (4.5*ws, 0.4, 0.4*h), mh, "Root"))
        # Make the body thinner to look like a spine instead of a full block
        parts[1] = (char_name+"_Spine", (0, 0, 6*h), (1.0*ws, d*0.8, 4*h), mh, "Root")

    elif char_name == "Knight":
        # Helmet Visor (dark slit on face)
        visor_mat = make_material("Visor", (0.1, 0.1, 0.1, 1))
        parts.append((char_name+"_Visor", (0, -d/2 - 0.2, 9.0*h), (3.8*ws, 0.4, 0.6*h), visor_mat, "Head"))
        # Plume (red feather on top of helmet)
        plume_mat = make_material("Plume", (0.8, 0.1, 0.1, 1))
        parts.append((char_name+"_Plume", (0, 0, 10.5*h), (1.0*ws, d*0.8, 1.5*h), plume_mat, "Head"))
        # Huge Pauldrons (Shoulder pads)
        parts.append((char_name+"_Pauldron_L", (-3.0*ws, 0, 7.5*h), (2.0*ws, d*1.2, 1.5*h), iron, "Root"))
        parts.append((char_name+"_Pauldron_R", ( 3.0*ws, 0, 7.5*h), (2.0*ws, d*1.2, 1.5*h), iron, "Root"))
        # Massive Sword in Right Hand
        parts.append((char_name+"_SwordHilt", ( 2.6*ws, d, 4.0*h), (0.6*ws, 0.6*ws, 1.5*h), wood, "Arm_R"))
        parts.append((char_name+"_SwordGuard", ( 2.6*ws, d, 3.2*h), (2.0*ws, 0.8*ws, 0.4*h), iron, "Arm_R"))
        parts.append((char_name+"_SwordBlade", ( 2.6*ws, d+0.2, 0.0*h), (1.2*ws, 0.2, 6.0*h), iron, "Arm_R"))

    elif char_name == "Archer":
        # Green Robin Hood Hat
        hat_mat = make_material("Hat", (0.1, 0.6, 0.2, 1))
        parts.append((char_name+"_HatBase", (0, 0, 10.2*h), (4.0*ws, d*1.1, 0.6*h), hat_mat, "Head"))
        parts.append((char_name+"_HatTip", (0, 0, 11.0*h), (2.0*ws, d*0.8, 1.0*h), hat_mat, "Head"))
        # Quiver on back with arrows
        parts.append((char_name+"_Quiver", (-1.0*ws, d/2 + 0.5, 6.0*h), (1.2*ws, 1.0, 3.5*h), wood, "Root"))
        parts.append((char_name+"_ArrowFeather", (-1.2*ws, d/2 + 0.6, 8.2*h), (0.6*ws, 0.6, 1.0*h), iron, "Root"))
        # Longbow in Left Hand
        parts.append((char_name+"_BowWood", (-2.6*ws, d, 4.0*h), (0.5*ws, 0.5*ws, 6.0*h), wood, "Arm_L"))

    elif char_name == "Human":
        # Hair (Brown block on top/back)
        hair_mat = make_material("Hair", (0.3, 0.15, 0.05, 1))
        parts.append((char_name+"_HairTop", (0, 0, 10.2*h), (3.8*ws, d*1.1, 0.8*h), hair_mat, "Head"))
        parts.append((char_name+"_HairBack", (0, d/2 + 0.2, 9.0*h), (3.8*ws, 0.5, 2.0*h), hair_mat, "Head"))
        # Backpack
        bp_mat = make_material("Backpack", (0.4, 0.3, 0.2, 1))
        parts.append((char_name+"_Backpack", (0, d/2 + 1.0, 6.5*h), (3.0*ws, 1.5, 3.0*h), bp_mat, "Root"))


    mesh_objects = []
    for mesh_name, loc, size, mat, bone in parts:
        obj = make_box(mesh_name, loc, size, mat)
        parent_mesh_to_bone(obj, arm_obj, bone)
        mesh_objects.append(obj)

    # ── 3. Bake animations ───────────────────────────────────────────────
    bake_animations(arm_obj, h, ws)

    # ── 4. Export FBX ────────────────────────────────────────────────────
    # Select everything
    bpy.ops.object.select_all(action='SELECT')

    bpy.ops.export_scene.fbx(
        filepath               = export_path,
        use_selection          = False,
        object_types           = {'ARMATURE', 'MESH'},
        # Axis — Blender Z-up → Three.js Y-up conversion handled by FBX flags
        axis_forward           = '-Z',
        axis_up                = 'Y',
        bake_anim              = True,
        bake_anim_use_all_actions = True,
        bake_anim_step         = 1,          # every frame baked → no missing in-betweens
        bake_anim_simplify_factor = 0.0,     # no curve simplification
        add_leaf_bones         = False,
        mesh_smooth_type       = 'FACE',
        use_mesh_modifiers     = True,       # apply Armature modifier on export
    )

    print(f"[MegaZoida] Exported: {export_path}")


# ---------------------------------------------------------------------------
# Generate all four characters
# ---------------------------------------------------------------------------

p = r"c:\Users\chapa\Desktop\MegaZoida\public\assets\models\\"

build_character(
    "Skeleton", 15.0,
    (0.8, 0.8, 0.8, 1), (0.7, 0.7, 0.7, 1),
    (0.8, 0.8, 0.8, 1), (0.6, 0.6, 0.6, 1),
    p + "Enemy_Skeleton.fbx"
)
build_character(
    "Knight", 20.0,
    (0.6, 0.6, 0.6, 1), (0.1, 0.3, 0.8, 1),
    (0.4, 0.4, 0.4, 1), (0.3, 0.3, 0.3, 1),
    p + "Hero_Knight.fbx"
)
build_character(
    "Archer", 20.0,
    (0.8, 0.6, 0.2, 1), (0.2, 0.6, 0.2, 1),
    (0.6, 0.3, 0.1, 1), (0.3, 0.2, 0.1, 1),
    p + "Hero_Archer.fbx"
)
build_character(
    "Human", 20.0,
    (0.9, 0.7, 0.5, 1), (0.8, 0.2, 0.2, 1),
    (0.9, 0.7, 0.5, 1), (0.2, 0.3, 0.8, 1),
    p + "Hero_Human.fbx"
)

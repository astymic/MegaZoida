import bpy
import bmesh
import math

def clear_scene():
    # Avoid resetting Blender preferences (keeps addons, MCP, etc.)
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)
    for arm in list(bpy.data.armatures):
        bpy.data.armatures.remove(arm)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)

def create_material(name, color):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = color
    # Make a bit flatly shaded
    mat.node_tree.nodes["Principled BSDF"].inputs["Emission Color"].default_value = color
    mat.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 0.5
    return mat

def create_plane(name, loc, size, mat):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    
    bm = bmesh.new()
    verts = [
        bm.verts.new((-size[0]/2, -size[1]/2, 0)),
        bm.verts.new((size[0]/2, -size[1]/2, 0)),
        bm.verts.new((size[0]/2, size[1]/2, 0)),
        bm.verts.new((-size[0]/2, size[1]/2, 0)),
    ]
    bm.faces.new(verts)
    bm.to_mesh(mesh)
    bm.free()
    
    obj.data.materials.append(mat)
    # stand the plane up on the Y axis facing +Z (or depending on engine, facing camera)
    obj.rotation_euler = (math.pi/2, 0, 0)
    obj.location = loc
    return obj

def build_character(
    char_name,
    size_mult,
    arm_color,
    body_color,
    leg_color,
    accent_color,
    export_path,
    with_helmet=False,
    with_shield=False,
    with_bow=False,
    with_quiver=False,
    with_hood=False,
):
    clear_scene()
    
    mat_arm = create_material(char_name+"_Arm", arm_color)
    mat_body = create_material(char_name+"_Body", body_color)
    mat_leg = create_material(char_name+"_Leg", leg_color)
    mat_acc = create_material(char_name+"_Acc", accent_color)

    # Size logic
    total_height = 2.0 * size_mult
    width = 1.6 * size_mult
    
    h_s = total_height / 10.0
    w_s = width / 10.0

    head = create_plane("Head", (0, 8*h_s, 0), (4*w_s, 4*h_s), mat_arm)
    body = create_plane("Body", (0, 5*h_s, 0), (5*w_s, 5*h_s), mat_body)
    arm_l = create_plane("Arm_L", (-3*w_s, 5*h_s, 0), (1.5*w_s, 4*h_s), mat_arm)
    arm_r = create_plane("Arm_R", (3*w_s, 5*h_s, 0), (1.5*w_s, 4*h_s), mat_arm)
    leg_l = create_plane("Leg_L", (-1.5*w_s, 1.5*h_s, 0), (2*w_s, 3*h_s), mat_leg)
    leg_r = create_plane("Leg_R", (1.5*w_s, 1.5*h_s, 0), (2*w_s, 3*h_s), mat_leg)

    parts = [head, body, arm_l, arm_r, leg_l, leg_r]

    # Accessories for visual detail (2D planes)
    if with_helmet:
        helmet = create_plane("Helmet", (0, 9.3*h_s, 0.01), (4.5*w_s, 2*h_s), mat_acc)
        parts.append(helmet)

    if with_shield:
        shield = create_plane("Shield", (-5.0*w_s, 4.5*h_s, 0.02), (3.5*w_s, 4.5*h_s), mat_acc)
        parts.append(shield)

    if with_bow:
        bow = create_plane("Bow", (4.5*w_s, 4.0*h_s, 0.02), (1.0*w_s, 6*h_s), mat_acc)
        parts.append(bow)

    if with_quiver:
        quiver = create_plane("Quiver", (-4.2*w_s, 6.0*h_s, -0.02), (2.0*w_s, 3.5*h_s), mat_acc)
        parts.append(quiver)

    if with_hood:
        hood = create_plane("Hood", (0, 8.8*h_s, -0.01), (4.6*w_s, 3*h_s), mat_acc)
        parts.append(hood)

    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body.name = char_name

    # Armature
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

    add_bone("Root", (0, 3*h_s, 0), (0, 5*h_s, 0))
    add_bone("Head", (0, 5*h_s, 0), (0, 9*h_s, 0), "Root")
    add_bone("Leg_L", (-1.5*w_s, 3*h_s, 0), (-1.5*w_s, 0, 0), "Root")
    add_bone("Leg_R", (1.5*w_s, 3*h_s, 0), (1.5*w_s, 0, 0), "Root")
    add_bone("Arm_L", (-3*w_s, 7*h_s, 0), (-3*w_s, 3*h_s, 0), "Root")
    add_bone("Arm_R", (3*w_s, 7*h_s, 0), (3*w_s, 3*h_s, 0), "Root")

    bpy.ops.object.mode_set(mode='OBJECT')

    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')

    bpy.ops.object.mode_set(mode='POSE')
    action = bpy.data.actions.new(name="Walk")
    arm_obj.animation_data_create()
    arm_obj.animation_data.action = action

    def set_kf(bone_name, f, rx):
        pbo = arm_obj.pose.bones[bone_name]
        pbo.rotation_mode = 'XYZ'
        pbo.rotation_euler[0] = rx
        pbo.keyframe_insert(data_path="rotation_euler", index=0, frame=f)

    frames = [1, 15, 30]
    leg_rx = [0.6, -0.6, 0.6]
    arm_rx = [-0.6, 0.6, -0.6]

    for i, f in enumerate(frames):
        set_kf("Leg_L", f, leg_rx[i])
        set_kf("Leg_R", f, -leg_rx[i])
        set_kf("Arm_L", f, arm_rx[i])
        set_kf("Arm_R", f, -arm_rx[i])

    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 30

    bpy.ops.export_scene.fbx(filepath=export_path, use_selection=False, bake_anim=True, add_leaf_bones=False)

build_character(
    "Skeleton",
    15.0,
    (0.85, 0.85, 0.85, 1),
    (0.75, 0.75, 0.75, 1),
    (0.65, 0.65, 0.65, 1),
    (0.9, 0.9, 0.9, 1),
    r"c:\Users\chapa\Desktop\MegaZoida\public\assets\models\Enemy_Skeleton2D.fbx",
)
build_character(
    "Knight",
    20.0,
    (0.6, 0.6, 0.6, 1),
    (0.1, 0.3, 0.8, 1),
    (0.4, 0.4, 0.4, 1),
    (0.9, 0.85, 0.2, 1),
    r"c:\Users\chapa\Desktop\MegaZoida\public\assets\models\Hero_Knight2D.fbx",
    with_helmet=True,
    with_shield=True,
)
build_character(
    "Archer",
    18.0,
    (0.5, 0.3, 0.15, 1),
    (0.15, 0.5, 0.2, 1),
    (0.2, 0.35, 0.2, 1),
    (0.8, 0.7, 0.4, 1),
    r"c:\Users\chapa\Desktop\MegaZoida\public\assets\models\Hero_Archer2D.fbx",
    with_bow=True,
    with_quiver=True,
    with_hood=True,
)
build_character(
    "Human",
    17.0,
    (0.85, 0.75, 0.65, 1),
    (0.2, 0.2, 0.55, 1),
    (0.25, 0.25, 0.25, 1),
    (0.75, 0.2, 0.2, 1),
    r"c:\Users\chapa\Desktop\MegaZoida\public\assets\models\Hero_Human2D.fbx",
    with_hood=False,
)

import bpy
import bmesh
import math
from mathutils import Vector

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def create_material(name, color):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = color
    return mat

def create_box(name, loc, size, mat):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(size[0], size[1], size[2]), verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()
    
    obj.data.materials.append(mat)
    obj.location = loc
    return obj

def assign_weight(obj, bone_name):
    vg = obj.vertex_groups.new(name=bone_name)
    vg.add(range(len(obj.data.vertices)), 1.0, 'REPLACE')

def build_pixel_character(char_name, size_mult, head_col, body_col, arm_col, leg_col, export_path):
    clear_scene()
    
    mh = create_material(char_name+"_Head", head_col)
    mb = create_material(char_name+"_Body", body_col)
    ma = create_material(char_name+"_Arm", arm_col)
    ml = create_material(char_name+"_Leg", leg_col)

    total_height = 2.0 * size_mult
    w = 1.6 * size_mult
    
    h = total_height / 10.0
    ws = w / 10.0
    depth = ws * 1.5 
    
    head = create_box(char_name+"_Head", (0, 0, 9*h), (3.6*ws, depth, 2*h), mh)
    assign_weight(head, "Head")
    
    body = create_box(char_name+"_Body", (0, 0, 6*h), (3.6*ws, depth, 4*h), mb)
    assign_weight(body, "Root")
    
    arm_l = create_box(char_name+"_Arm_L", (-2.6*ws, 0, 6*h), (1.2*ws, depth, 3.5*h), ma)
    assign_weight(arm_l, "Arm_L")
    
    arm_r = create_box(char_name+"_Arm_R", (2.6*ws, 0, 6*h), (1.2*ws, depth, 3.5*h), ma)
    assign_weight(arm_r, "Arm_R")
    
    leg_l = create_box(char_name+"_Leg_L", (-1.0*ws, 0, 2*h), (1.2*ws, depth, 4*h), ml)
    assign_weight(leg_l, "Leg_L")
    
    leg_r = create_box(char_name+"_Leg_R", (1.0*ws, 0, 2*h), (1.2*ws, depth, 4*h), ml)
    assign_weight(leg_r, "Leg_R")

    bpy.ops.object.select_all(action='DESELECT')
    parts = [head, body, arm_l, arm_r, leg_l, leg_r]
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body.name = char_name

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

    add_bone("Root", (0, 0, 4*h), (0, 0, 6*h))
    add_bone("Head", (0, 0, 8*h), (0, 0, 10*h), "Root")
    add_bone("Leg_L", (-1.0*ws, 0, 4*h), (-1.0*ws, 0, 0), "Root")
    add_bone("Leg_R", (1.0*ws, 0, 4*h), (1.0*ws, 0, 0), "Root")
    add_bone("Arm_L", (-2.6*ws, 0, 7.5*h), (-2.6*ws, 0, 4*h), "Root")
    add_bone("Arm_R", (2.6*ws, 0, 7.5*h), (2.6*ws, 0, 4*h), "Root")

    bpy.ops.object.mode_set(mode='OBJECT')

    # Explicitly attach using Modifier instead of AUTO
    mod = body.modifiers.new(name="Armature", type='ARMATURE')
    mod.object = arm_obj
    body.parent = arm_obj
    
    def set_kf(action_name, frame, rx_dict):
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

    bpy.ops.object.mode_set(mode='POSE')
    
    # Idle
    set_kf("Idle", 1, {"Leg_L": 0, "Leg_R": 0, "Arm_L": 0, "Arm_R": 0})
    set_kf("Idle", 40, {"Leg_L": 0, "Leg_R": 0, "Arm_L": 0, "Arm_R": 0})

    # Walk (Wide steps)
    w = 1.3
    set_kf("Walk", 1, {"Leg_L": -w, "Leg_R": w, "Arm_L": w, "Arm_R": -w})
    set_kf("Walk", 10, {"Leg_L": 0, "Leg_R": 0, "Arm_L": 0, "Arm_R": 0})
    set_kf("Walk", 20, {"Leg_L": w, "Leg_R": -w, "Arm_L": -w, "Arm_R": w})
    set_kf("Walk", 30, {"Leg_L": 0, "Leg_R": 0, "Arm_L": 0, "Arm_R": 0})
    set_kf("Walk", 40, {"Leg_L": -w, "Leg_R": w, "Arm_L": w, "Arm_R": -w})

    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 40
    bpy.ops.object.mode_set(mode='OBJECT')

    bpy.ops.export_scene.fbx(
        filepath=export_path, 
        use_selection=False, 
        bake_anim=True, 
        bake_anim_use_nla_strips=False, 
        bake_anim_use_all_actions=True, 
        add_leaf_bones=False
    )

p = r"c:\Users\chapa\Desktop\MegaZoida\public\assets\models\\"
build_pixel_character("Knight", 20.0, (0.6,0.6,0.6,1), (0.1,0.3,0.8,1), (0.4,0.4,0.4,1), (0.3,0.3,0.3,1), p+"Hero_Knight.fbx")
build_pixel_character("Archer", 20.0, (0.8,0.6,0.2,1), (0.2,0.6,0.2,1), (0.6,0.3,0.1,1), (0.3,0.2,0.1,1), p+"Hero_Archer.fbx")
build_pixel_character("Human", 20.0, (0.9,0.7,0.5,1), (0.8,0.2,0.2,1), (0.9,0.7,0.5,1), (0.2,0.3,0.8,1), p+"Hero_Human.fbx")

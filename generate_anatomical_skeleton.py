"""
MegaZoida — Detailed Anatomical Skeleton Generator
======================================================
Generates a fully rigged skeleton with:
  - Skull + jaw
  - Spine (5 vertebrae segments)
  - Ribcage (10 pairs of ribs + sternum)
  - Pelvis
  - Upper/lower arms + hands with 3 fingers
  - Upper/lower legs + feet
  - Full walk animation (BEZIER, 40 frames)
  - Idle animation (1 frame)

Run inside Blender via: Text Editor → Run Script
"""

import bpy
import bmesh
import math
from mathutils import Vector, Matrix, Euler


# ─────────────────────────────────────────────────────────────────────────────
# Scene helpers
# ─────────────────────────────────────────────────────────────────────────────

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.scale_length = 1.0


def new_material(name: str, color: tuple, metallic=0.0, roughness=0.9) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    b = mat.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value  = color
    b.inputs["Metallic"].default_value    = metallic
    b.inputs["Roughness"].default_value   = roughness
    if "Specular IOR Level" in b.inputs:
        b.inputs["Specular IOR Level"].default_value = 0.15
    elif "Specular" in b.inputs:
        b.inputs["Specular"].default_value = 0.15
    return mat


def link(obj):
    bpy.context.collection.objects.link(obj)
    return obj


def apply_transforms(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.select_set(False)


# ─────────────────────────────────────────────────────────────────────────────
# Primitive mesh builders  (all return bpy.types.Object)
# ─────────────────────────────────────────────────────────────────────────────

def make_box(name, loc, size, mat, rot=(0,0,0)):
    mesh = bpy.data.meshes.new(name)
    obj  = link(bpy.data.objects.new(name, mesh))
    bm   = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    bm.to_mesh(mesh); bm.free()
    mesh.materials.append(mat)
    obj.location = loc
    obj.rotation_euler = rot
    apply_transforms(obj)
    return obj


def make_sphere(name, loc, radius, mat, segments=8):
    mesh = bpy.data.meshes.new(name)
    obj  = link(bpy.data.objects.new(name, mesh))
    bm   = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=segments//2, radius=radius)
    bm.to_mesh(mesh); bm.free()
    mesh.materials.append(mat)
    obj.location = loc
    apply_transforms(obj)
    return obj


def make_cylinder(name, loc, radius, depth, mat, rot=(0,0,0), segments=8):
    mesh = bpy.data.meshes.new(name)
    obj  = link(bpy.data.objects.new(name, mesh))
    bm   = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False,
                          segments=segments, radius1=radius, radius2=radius, depth=depth)
    bm.to_mesh(mesh); bm.free()
    mesh.materials.append(mat)
    obj.location = loc
    obj.rotation_euler = rot
    apply_transforms(obj)
    return obj


def make_cone(name, loc, r1, r2, depth, mat, rot=(0,0,0)):
    """Tapered cylinder — used for ribs and limb bones."""
    mesh = bpy.data.meshes.new(name)
    obj  = link(bpy.data.objects.new(name, mesh))
    bm   = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False,
                          segments=8, radius1=r1, radius2=r2, depth=depth)
    bm.to_mesh(mesh); bm.free()
    mesh.materials.append(mat)
    obj.location = loc
    obj.rotation_euler = rot
    apply_transforms(obj)
    return obj


# ─────────────────────────────────────────────────────────────────────────────
# Armature
# ─────────────────────────────────────────────────────────────────────────────

def create_armature(name: str) -> bpy.types.Object:
    arm_data = bpy.data.armatures.new(name + "_Armature")
    arm_obj  = link(bpy.data.objects.new(name + "_Rig", arm_data))
    bpy.context.view_layer.objects.active = arm_obj
    arm_obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    return arm_obj


def add_bone(armature_obj, name, head, tail, parent_name=None):
    arm = armature_obj.data
    b      = arm.edit_bones.new(name)
    b.head = head
    b.tail = tail
    if parent_name and parent_name in arm.edit_bones:
        b.parent = arm.edit_bones[parent_name]
    return b


# ─────────────────────────────────────────────────────────────────────────────
# Skinning helper
# ─────────────────────────────────────────────────────────────────────────────

def skin(mesh_obj, armature_obj, bone_name):
    """Attach mesh_obj rigidly to bone_name on armature_obj."""
    mod         = mesh_obj.modifiers.new("Armature", 'ARMATURE')
    mod.object  = armature_obj
    mesh_obj.parent      = armature_obj
    mesh_obj.parent_type = 'OBJECT'
    vg = mesh_obj.vertex_groups.new(name=bone_name)
    vg.add([v.index for v in mesh_obj.data.vertices], 1.0, 'REPLACE')


# ─────────────────────────────────────────────────────────────────────────────
# Skeleton geometry  (S = scale multiplier, default 1.0 = ~1.8 m tall)
# ─────────────────────────────────────────────────────────────────────────────

def build_skeleton(S: float, mat_bone: bpy.types.Material, mat_dark: bpy.types.Material, mat_glow: bpy.types.Material):
    """
    Returns dict of mesh objects keyed by bone name.
    Coordinate system: Z = up, origin at feet.
    Heights (S=1):
      feet   0.00
      ankle  0.08
      knee   0.48
      hip    0.92
      navel  1.02
      chest  1.20
      shoulder 1.42
      neck   1.52
      head_bot 1.56
      head_top 1.80
    """

    meshes = {}   # bone_name → list of mesh objects

    def add(bone, obj):
        meshes.setdefault(bone, []).append(obj)

    # ── SKULL ──────────────────────────────────────────────────────────────
    # Braincase — flattened sphere
    skull = make_sphere("Skull_brain", (0, 0, S*1.695), S*0.115, mat_bone, segments=12)
    skull.scale = (1.0, 0.85, 1.05)
    apply_transforms(skull)
    add("Head", skull)

    # Cheekbones / brow ridge — squashed box
    brow = make_box("Skull_brow", (0, S*0.06, S*1.665),
                    (S*0.17, S*0.06, S*0.04), mat_bone)
    add("Head", brow)

    # Nose bridge
    nose = make_box("Skull_nose", (0, S*0.085, S*1.62),
                    (S*0.04, S*0.04, S*0.06), mat_bone)
    add("Head", nose)

    # Eye sockets (dark holes with glowing red centers)
    for sx in (-1, 1):
        eye = make_sphere("Eye_socket", (sx*S*0.05, S*0.085, S*1.65),
                          S*0.024, mat_glow, segments=12)
        add("Head", eye)

    # Zygomatic arches
    for sx in (-1, 1):
        arch = make_box(f"Cheek_{sx}", (sx*S*0.1, S*0.055, S*1.635),
                        (S*0.04, S*0.06, S*0.05), mat_bone)
        add("Head", arch)

    # Jaw
    jaw = make_box("Jaw", (0, S*0.04, S*1.575),
                   (S*0.13, S*0.09, S*0.055), mat_bone)
    add("Head", jaw)

    # Teeth rows (simplified blocks)
    upper_teeth = make_box("Teeth_upper", (0, S*0.08, S*1.60),
                           (S*0.11, S*0.015, S*0.02), mat_bone)
    lower_teeth = make_box("Teeth_lower", (0, S*0.08, S*1.575),
                           (S*0.10, S*0.015, S*0.018), mat_bone)
    add("Head", upper_teeth)
    add("Head", lower_teeth)

    # ── SPINE ──────────────────────────────────────────────────────────────
    # 5 vertebra discs from neck down to sacrum
    spine_heights = [S*1.50, S*1.42, S*1.30, S*1.18, S*1.06]
    spine_radii   = [S*0.028, S*0.032, S*0.036, S*0.038, S*0.040]
    for i, (zh, r) in enumerate(zip(spine_heights, spine_radii)):
        bone_name = "Spine" if i < 3 else "Root"
        v = make_cylinder(f"Vertebra_{i}", (0, 0, zh), r, S*0.055, mat_bone,
                          rot=(0, math.pi/2, 0))
        # Spinous process (small nub sticking back)
        sp = make_box(f"SpinousProc_{i}", (0, -S*0.045, zh),
                      (S*0.02, S*0.04, S*0.025), mat_bone)
        add(bone_name, v)
        add(bone_name, sp)

    # ── RIBCAGE ────────────────────────────────────────────────────────────
    # Sternum
    sternum = make_box("Sternum", (0, S*0.06, S*1.28),
                       (S*0.04, S*0.025, S*0.24), mat_bone)
    add("Spine", sternum)

    # 10 rib pairs — curved using tapered cones arranged in arc
    for i in range(10):
        rib_z     = S * (1.44 - i * 0.025)
        rib_len   = S * (0.16 - i * 0.006)
        rib_r_big = S * 0.012
        rib_r_sml = S * 0.007
        for sx in (-1, 1):
            angle = sx * (0.35 + i * 0.02)   # flare out slightly lower
            lx = sx * rib_len * 0.5
            cx = sx * rib_len * 0.3
            rib = make_cone(f"Rib_{i}_{sx}",
                            (cx, S*0.01, rib_z),
                            rib_r_big, rib_r_sml, rib_len,
                            mat_bone,
                            rot=(angle * 0.3, 0.0, angle))
            add("Spine", rib)

    # ── CLAVICLES ──────────────────────────────────────────────────────────
    for sx in (-1, 1):
        clav = make_cone(f"Clavicle_{sx}",
                         (sx * S*0.09, S*0.02, S*1.47),
                         S*0.018, S*0.012, S*0.18,
                         mat_bone,
                         rot=(0, 0, sx * math.pi * 0.08))
        add("Spine", clav)

    # ── PELVIS ─────────────────────────────────────────────────────────────
    pelvis_body = make_box("Pelvis_body", (0, 0, S*0.96),
                           (S*0.22, S*0.14, S*0.12), mat_bone)
    add("Root", pelvis_body)

    # Iliac wings
    for sx in (-1, 1):
        wing = make_box(f"Iliac_{sx}", (sx*S*0.13, -S*0.02, S*0.99),
                        (S*0.06, S*0.10, S*0.14), mat_bone,
                        rot=(0, 0, sx*0.25))
        add("Root", wing)

    # Pubic arch
    pub = make_box("Pubis", (0, S*0.04, S*0.90),
                   (S*0.12, S*0.05, S*0.05), mat_bone)
    add("Root", pub)

    # Sacrum
    sac = make_box("Sacrum", (0, -S*0.04, S*0.95),
                   (S*0.08, S*0.06, S*0.12), mat_bone)
    add("Root", sac)

    # ── SCAPULAS ───────────────────────────────────────────────────────────
    for sx in (-1, 1):
        scap = make_box(f"Scapula_{sx}", (sx*S*0.14, -S*0.04, S*1.38),
                        (S*0.10, S*0.02, S*0.10), mat_bone,
                        rot=(0, sx*0.2, 0))
        add("Spine", scap)

    # ── UPPER ARMS ─────────────────────────────────────────────────────────
    for sx in (-1, 1):
        side   = "L" if sx < 0 else "R"
        bone_n = f"Arm_{side}"
        # Humerus shaft
        hum = make_cone(f"Humerus_{side}",
                        (sx*S*0.20, 0, S*1.25),
                        S*0.030, S*0.022, S*0.30,
                        mat_bone,
                        rot=(0, 0, sx*math.pi*0.5))
        # Humeral head (ball at shoulder)
        hhead = make_sphere(f"Humerus_head_{side}",
                            (sx*S*0.175, 0, S*1.415),
                            S*0.038, mat_bone)
        # Distal condyle (elbow knob)
        cond = make_sphere(f"Condyle_{side}",
                           (sx*S*0.225, 0, S*1.095),
                           S*0.025, mat_bone)
        add(bone_n, hum)
        add(bone_n, hhead)
        add(bone_n, cond)

    # ── FOREARMS ───────────────────────────────────────────────────────────
    for sx in (-1, 1):
        side   = "L" if sx < 0 else "R"
        bone_n = f"ForeArm_{side}"
        # Radius
        rad = make_cone(f"Radius_{side}",
                        (sx*S*0.225, 0, S*0.890),
                        S*0.020, S*0.014, S*0.28,
                        mat_bone,
                        rot=(0, 0, sx*math.pi*0.5))
        # Ulna (slightly offset)
        uln = make_cone(f"Ulna_{side}",
                        (sx*S*0.235, -S*0.015, S*0.890),
                        S*0.016, S*0.011, S*0.28,
                        mat_bone,
                        rot=(0.05, 0, sx*math.pi*0.5))
        # Olecranon (elbow point)
        olec = make_box(f"Olecranon_{side}",
                        (sx*S*0.228, -S*0.028, S*1.07),
                        (S*0.02, S*0.02, S*0.04), mat_bone)
        add(bone_n, rad)
        add(bone_n, uln)
        add(bone_n, olec)

    # ── HANDS ──────────────────────────────────────────────────────────────
    for sx in (-1, 1):
        side   = "L" if sx < 0 else "R"
        bone_n = f"Hand_{side}"
        # Carpal block
        carp = make_box(f"Carpals_{side}",
                        (sx*S*0.228, 0, S*0.670),
                        (S*0.065, S*0.035, S*0.055), mat_bone)
        add(bone_n, carp)

        # 3 metacarpals + 2 phalanges each
        for fi, fx_off in enumerate((-0.020, 0.0, 0.020)):
            fx = sx * (S*0.228 + fx_off * S)
            # Metacarpal
            mc = make_cone(f"Meta_{side}_{fi}",
                           (fx, 0, S*0.615),
                           S*0.010, S*0.007, S*0.060,
                           mat_bone,
                           rot=(0, 0, sx*math.pi*0.5 + fx_off*2))
            # Proximal phalanx
            pp = make_cone(f"Phal_P_{side}_{fi}",
                           (fx, 0, S*0.560),
                           S*0.009, S*0.007, S*0.048,
                           mat_bone,
                           rot=(0, 0, sx*math.pi*0.5))
            # Distal phalanx
            dp = make_cone(f"Phal_D_{side}_{fi}",
                           (fx, 0, S*0.516),
                           S*0.007, S*0.004, S*0.038,
                           mat_bone,
                           rot=(0, 0, sx*math.pi*0.5))
            add(bone_n, mc)
            add(bone_n, pp)
            add(bone_n, dp)

    # ── UPPER LEGS ─────────────────────────────────────────────────────────
    for sx in (-1, 1):
        side   = "L" if sx < 0 else "R"
        bone_n = f"Leg_{side}"
        # Femur shaft
        fem = make_cone(f"Femur_{side}",
                        (sx*S*0.095, 0, S*0.680),
                        S*0.038, S*0.028, S*0.44,
                        mat_bone,
                        rot=(0, 0, sx*0.12))
        # Femoral head
        fhead = make_sphere(f"FemHead_{side}",
                            (sx*S*0.090, 0, S*0.895),
                            S*0.040, mat_bone)
        # Greater trochanter
        tro = make_box(f"Trochanter_{side}",
                       (sx*S*0.125, 0, S*0.875),
                       (S*0.030, S*0.025, S*0.045), mat_bone)
        # Lateral condyle (knee knob)
        kcon = make_sphere(f"KneeCondyle_{side}",
                           (sx*S*0.095, 0, S*0.470),
                           S*0.032, mat_bone)
        add(bone_n, fem)
        add(bone_n, fhead)
        add(bone_n, tro)
        add(bone_n, kcon)

    # ── LOWER LEGS ─────────────────────────────────────────────────────────
    for sx in (-1, 1):
        side   = "L" if sx < 0 else "R"
        bone_n = f"Shin_{side}"
        # Tibia
        tib = make_cone(f"Tibia_{side}",
                        (sx*S*0.093, 0, S*0.275),
                        S*0.030, S*0.018, S*0.40,
                        mat_bone,
                        rot=(0, 0, sx*0.06))
        # Fibula (thin, lateral)
        fib = make_cone(f"Fibula_{side}",
                        (sx*S*0.108, -S*0.010, S*0.275),
                        S*0.013, S*0.009, S*0.38,
                        mat_bone,
                        rot=(0.04, 0, sx*0.07))
        # Patella
        pat = make_sphere(f"Patella_{side}",
                          (sx*S*0.093, S*0.025, S*0.464),
                          S*0.022, mat_bone)
        # Medial malleolus (ankle knob)
        mal = make_sphere(f"Malleolus_{side}",
                          (sx*S*0.088, 0, S*0.082),
                          S*0.018, mat_bone)
        add(bone_n, tib)
        add(bone_n, fib)
        add(bone_n, pat)
        add(bone_n, mal)

    # ── FEET ───────────────────────────────────────────────────────────────
    for sx in (-1, 1):
        side   = "L" if sx < 0 else "R"
        bone_n = f"Foot_{side}"
        # Calcaneus (heel)
        calc = make_box(f"Heel_{side}",
                        (sx*S*0.093, -S*0.035, S*0.035),
                        (S*0.055, S*0.080, S*0.045), mat_bone)
        # Talus
        tal = make_box(f"Talus_{side}",
                       (sx*S*0.093, S*0.010, S*0.050),
                       (S*0.045, S*0.055, S*0.035), mat_bone)
        # Metatarsals (3 toes)
        for ti, tz_off in enumerate((-0.015, 0.0, 0.015)):
            tx = sx * S * (0.093 + tz_off)
            mt = make_cone(f"Meta_foot_{side}_{ti}",
                           (tx, S*0.060, S*0.030),
                           S*0.011, S*0.007, S*0.080,
                           mat_bone,
                           rot=(math.pi*0.5, 0, sx*tz_off*3))
            tp = make_cone(f"Toe_{side}_{ti}",
                           (tx, S*0.105, S*0.028),
                           S*0.009, S*0.005, S*0.040,
                           mat_bone,
                           rot=(math.pi*0.5, 0, 0))
            add(bone_n, mt)
            add(bone_n, tp)
        add(bone_n, calc)
        add(bone_n, tal)

    return meshes


# ─────────────────────────────────────────────────────────────────────────────
# Rig builder — matches bone names used in geometry dict above
# ─────────────────────────────────────────────────────────────────────────────

def build_rig(name: str, S: float) -> bpy.types.Object:
    arm_obj = create_armature(name)
    arm     = arm_obj.data

    def B(n, h, t, p=None): add_bone(arm_obj, n, h, t, p)

    # Root / Pelvis
    B("Root",       (0, 0, S*0.92),  (0, 0, S*1.02))
    # Spine chain
    B("Spine",      (0, 0, S*1.02),  (0, 0, S*1.44),  "Root")
    # Head / neck
    B("Head",       (0, 0, S*1.52),  (0, 0, S*1.80),  "Spine")
    # Arms
    for sx, side in ((-1,"L"),(1,"R")):
        B(f"Arm_{side}",      (sx*S*0.17, 0, S*1.42),  (sx*S*0.23, 0, S*1.09),  "Spine")
        B(f"ForeArm_{side}",  (sx*S*0.23, 0, S*1.09),  (sx*S*0.23, 0, S*0.73),  f"Arm_{side}")
        B(f"Hand_{side}",     (sx*S*0.23, 0, S*0.73),  (sx*S*0.23, 0, S*0.50),  f"ForeArm_{side}")
    # Legs
    for sx, side in ((-1,"L"),(1,"R")):
        B(f"Leg_{side}",   (sx*S*0.09, 0, S*0.92),  (sx*S*0.09, 0, S*0.47),  "Root")
        B(f"Shin_{side}",  (sx*S*0.09, 0, S*0.47),  (sx*S*0.09, 0, S*0.08),  f"Leg_{side}")
        B(f"Foot_{side}",  (sx*S*0.09, 0, S*0.08),  (sx*S*0.09, S*0.09, 0),  f"Shin_{side}")

    bpy.ops.object.mode_set(mode='OBJECT')
    return arm_obj


# ─────────────────────────────────────────────────────────────────────────────
# Animation
# ─────────────────────────────────────────────────────────────────────────────

def bake_animations(arm_obj: bpy.types.Object):
    bpy.context.view_layer.objects.active = arm_obj
    arm_obj.select_set(True)
    bpy.ops.object.mode_set(mode='POSE')

    def get_action(n):
        return bpy.data.actions.get(n) or bpy.data.actions.new(n)

    def kf(action, bone, frame, axis, val):
        arm_obj.animation_data_create()
        arm_obj.animation_data.action = action
        pb = arm_obj.pose.bones[bone]
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler[axis] = val
        pb.keyframe_insert("rotation_euler", index=axis, frame=frame)

    def smooth(action):
        pass

    # ── IDLE ──────────────────────────────────────────────────────────────
    idle = get_action("Idle")
    bones_all = ["Root","Spine","Head",
                 "Arm_L","Arm_R","ForeArm_L","ForeArm_R","Hand_L","Hand_R",
                 "Leg_L","Leg_R","Shin_L","Shin_R","Foot_L","Foot_R"]
    for b in bones_all:
        for ax in range(3):
            kf(idle, b, 1, ax, 0.0)
    idle.frame_range = (1, 1)

    # ── WALK ──────────────────────────────────────────────────────────────
    walk = get_action("Walk")
    SW   = 0.55   # leg swing  ≈ 31°
    SA   = 0.40   # arm swing  ≈ 23°
    SH   = 0.12   # shin bend  at peak stance
    LEAN = 0.08   # slight forward torso lean when moving

    #  frame: {bone: (axis, value)}
    def pose(frame, data):
        arm_obj.animation_data.action = walk
        for bone, (axis, val) in data.items():
            kf(walk, bone, frame, axis, val)

    neutral = {
        "Leg_L":(0,0),"Leg_R":(0,0),
        "Shin_L":(0,0),"Shin_R":(0,0),
        "Arm_L":(0,0),"Arm_R":(0,0),
        "Spine":(0, LEAN),
    }

    step_right = {   # right foot forward
        "Leg_L":  (0,  SW),  "Leg_R":  (0, -SW),
        "Shin_L": (0,  SH),  "Shin_R": (0,  SH),
        "Arm_L":  (0, -SA),  "Arm_R":  (0,  SA),
        "Spine":  (0,  LEAN),
    }
    step_left = {    # left foot forward
        "Leg_L":  (0, -SW),  "Leg_R":  (0,  SW),
        "Shin_L": (0,  SH),  "Shin_R": (0,  SH),
        "Arm_L":  (0,  SA),  "Arm_R":  (0, -SA),
        "Spine":  (0,  LEAN),
    }

    for b, (ax, v) in neutral.items():    kf(walk, b, 1,  ax, v)
    for b, (ax, v) in step_right.items(): kf(walk, b, 11, ax, v)
    for b, (ax, v) in neutral.items():    kf(walk, b, 21, ax, v)
    for b, (ax, v) in step_left.items():  kf(walk, b, 31, ax, v)
    for b, (ax, v) in neutral.items():    kf(walk, b, 40, ax, v)

    smooth(walk)
    walk.frame_range = (1, 40)

    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end   = 40

    bpy.ops.object.mode_set(mode='OBJECT')

    # NLA tracks
    arm_obj.animation_data_create()
    for tr in list(arm_obj.animation_data.nla_tracks):
        arm_obj.animation_data.nla_tracks.remove(tr)
    for action in [idle, walk]:
        track = arm_obj.animation_data.nla_tracks.new()
        track.name = action.name
        strip = track.strips.new(action.name, int(action.frame_range[0]), action)
        strip.action_frame_start = action.frame_range[0]
        strip.action_frame_end   = action.frame_range[1]


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def build(export_path: str, S: float = 20.0):
    """
    S = scale in Blender units.  At S=20 the character is 20*1.8 = 36 Blender units tall.
    After the 0.01 scale fix in AssetManager it becomes ~0.36 Three.js units (36 cm) — matching
    the existing enemy radius=15 hitbox.  Increase S proportionally if you want bigger characters.
    """
    clear_scene()

    bone_color = (0.87, 0.82, 0.70, 1.0)
    dark_color = (0.10, 0.08, 0.07, 1.0)

    mat_bone = new_material("Bone",     bone_color, metallic=0.0, roughness=0.85)
    mat_dark = new_material("BoneDark", dark_color, metallic=0.0, roughness=0.95)
    
    mat_glow = bpy.data.materials.new("RedGlow")
    mat_glow.use_nodes = True
    b = mat_glow.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (1, 0, 0, 1)
    b.inputs["Emission Color"].default_value = (1, 0, 0, 1)
    b.inputs["Emission Strength"].default_value = 10.0

    # 1. Rig
    arm_obj = build_rig("Skeleton", S)

    # 2. Geometry
    meshes = build_skeleton(S, mat_bone, mat_dark, mat_glow)

    # 3. Skin each mesh group to its bone
    for bone_name, obj_list in meshes.items():
        for obj in obj_list:
            skin(obj, arm_obj, bone_name)

    # 4. Animate
    bake_animations(arm_obj)

    # 5. Export
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.fbx(
        filepath                  = export_path,
        use_selection             = False,
        object_types              = {'ARMATURE', 'MESH'},
        axis_forward              = 'Z',
        axis_up                   = 'Y',
        bake_anim                 = True,
        bake_anim_use_all_actions = True,
        bake_anim_step            = 1,
        bake_anim_simplify_factor = 0.0,
        add_leaf_bones            = False,
        mesh_smooth_type          = 'FACE',
        use_mesh_modifiers        = True,
    )
    print(f"[MegaZoida] Skeleton exported → {export_path}")


# ─── Run ───────────────────────────────────────────────────────────────────
p = r"c:\Users\chapa\Desktop\MegaZoida\public\assets\models\\"

build(p + "Enemy_Skeleton.fbx", S=23.0)   # TALL enemy skeleton size
# Uncomment to also generate hero-sized variants:
# build(p + "Hero_Human.fbx",    S=20.0)
# build(p + "Hero_Knight.fbx",   S=20.0)
# build(p + "Hero_Archer.fbx",   S=20.0)

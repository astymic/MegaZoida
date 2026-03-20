# 🧊 Методология Claude: Создание детализированных 3D моделей в Blender через MCP

> **Версия:** 1.0 | **Автор:** Claude (Anthropic) | **Дата:** 2026

---

## ⚠️ Почему стандартный подход AI-агентов — провал

Большинство AI-агентов работают с Blender по одному паттерну:
1. Создают один примитив
2. Немного деформируют его
3. Сразу накидывают материал
4. Рендерят

**Результат:** плоские, мёртвые модели с нулевой детализацией.

Мой подход принципиально другой — я думаю как профессиональный 3D-художник, а не как скрипт.

---

## 🧠 Философия моего метода

### Принцип 1: Референс перед кодом
Перед **любым** вызовом MCP-инструмента я формирую мысленный референс:
- Что это за объект? (органика / hard surface / архитектура)
- Какой уровень детализации нужен? (hero asset / фон / LOD)
- Как свет будет взаимодействовать с формой?

### Принцип 2: Силуэт → Форма → Детали → Материал
Никогда не пропускаю этапы. Детализацию добавляю только после утверждения базовой формы.

### Принцип 3: Чистая топология — основа всего
Правильные edge loops с самого начала экономят 80% работы по исправлению.

### Принцип 4: Пакетные операции
Группирую все операции одного этапа в один блок Python-кода, а не делаю 50 отдельных вызовов MCP.

---

## 📐 Этап 1: Планирование и настройка сцены

```python
import bpy
import bmesh
import math
from mathutils import Vector, Matrix

# 1. Очистка сцены (всегда начинаю с чистого листа)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# 2. Настройка единиц измерения
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0

# 3. Настройка рендер-движка под превью
scene.render.engine = 'CYCLES'
scene.cycles.preview_samples = 32
scene.cycles.samples = 128

# 4. Настройка viewport
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        for space in area.spaces:
            if space.type == 'VIEW_3D':
                space.shading.type = 'MATERIAL'
                space.overlay.show_wireframe = True
                space.overlay.wireframe_opacity = 0.3
```

---

## 🏗️ Этап 2: Базовая форма (Blockout)

**Правило:** Blockout должен занимать 60-70% правильного объёма СРАЗУ.

### Hard Surface объект (пример: механическая деталь)

```python
import bpy
import bmesh
from mathutils import Vector

def create_mechanical_part_blockout():
    """
    Создание blockout механической детали.
    Принцип: начинаем с правильного примитива, не деформируем мусор.
    """
    bpy.ops.object.select_all(action='DESELECT')
    
    # Основное тело — цилиндр с правильным числом вершин
    # Важно: 32 сегмента = баланс между качеством и редактируемостью
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=32,
        radius=0.5,
        depth=1.2,
        location=(0, 0, 0.6)
    )
    main_body = bpy.context.active_object
    main_body.name = "MechPart_Body"
    
    # Верхняя платформа — отдельный меш для чистой булевой операции
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=32,
        radius=0.65,
        depth=0.15,
        location=(0, 0, 1.275)
    )
    top_flange = bpy.context.active_object
    top_flange.name = "MechPart_Flange"
    
    return main_body, top_flange

create_mechanical_part_blockout()
```

### Органический объект (пример: камень / скала)

```python
def create_organic_blockout():
    """
    Органика требует другого подхода — начинаем с ico-сферы,
    не с UV-сферы (лучше для sculpting).
    """
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=3,  # Достаточно для начального sculpting
        radius=1.0,
        location=(0, 0, 0)
    )
    rock_base = bpy.context.active_object
    rock_base.name = "Rock_Base"
    
    # Добавляем Displace modifier для начальной неровности
    displace_mod = rock_base.modifiers.new(name="InitialNoise", type='DISPLACE')
    
    # Создаём текстуру для displacement
    noise_tex = bpy.data.textures.new("RockNoise", type='CLOUDS')
    noise_tex.noise_scale = 0.8
    noise_tex.noise_depth = 4
    displace_mod.texture = noise_tex
    displace_mod.strength = 0.3
    displace_mod.texture_coords = 'LOCAL'
    
    # Применяем для дальнейшей работы
    bpy.ops.object.modifier_apply(modifier="InitialNoise")
    
    return rock_base
```

---

## 🔪 Этап 3: Boolean операции (Hard Surface)

**Критически важно:** использую точные объекты-резаки, не примитивы наугад.

```python
def add_boolean_details(main_obj, cutter_objects):
    """
    Булевы операции с правильной последовательностью.
    Порядок важен — сначала большие cuts, потом детальные.
    """
    bpy.context.view_layer.objects.active = main_obj
    
    for cutter in cutter_objects:
        # Добавляем boolean modifier
        bool_mod = main_obj.modifiers.new(
            name=f"Bool_{cutter.name}", 
            type='BOOLEAN'
        )
        bool_mod.operation = 'DIFFERENCE'
        bool_mod.object = cutter
        bool_mod.solver = 'EXACT'  # Точный решатель, не Fast
        
        # Скрываем резак
        cutter.hide_render = True
        cutter.display_type = 'WIRE'
    
    return main_obj


def create_panel_lines(target_obj):
    """
    Panel lines — характерная деталь sci-fi / mechanical объектов.
    Создаём через knife project или отдельные меши-резаки.
    """
    panel_cutters = []
    
    # Горизонтальная панель
    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=(0, 0.501, 0.3)  # Чуть за пределами объекта
    )
    h_panel = bpy.context.active_object
    h_panel.name = "PanelCutter_H01"
    h_panel.scale = (0.8, 0.002, 0.002)
    bpy.ops.object.transform_apply(scale=True)
    panel_cutters.append(h_panel)
    
    return panel_cutters
```

---

## 🔲 Этап 4: Edge Loops и топология

**Главное правило:** edge loops должны следовать форме объекта, а не быть случайными.

```python
def add_support_loops(obj):
    """
    Support loops для SubD моделирования.
    Без них SubD "скруглит" все углы в кашу.
    """
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    
    # Используем bmesh для точного контроля
    bm = bmesh.from_edit_mesh(obj.data)
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    
    # Выбираем шарп-рёбра для поддержки
    for edge in bm.edges:
        if edge.calc_face_angle(None) is not None:
            angle_deg = math.degrees(edge.calc_face_angle(0))
            if angle_deg > 30:  # Острые рёбра требуют поддержки
                edge.select = True
    
    bmesh.update_edit_mesh(obj.data)
    
    # Добавляем support loops через bevel
    bpy.ops.mesh.bevel(
        offset=0.015,      # Маленький offset для чёткой грани
        offset_type='OFFSET',
        segments=2,        # 2 сегмента = достаточно для поддержки
        profile=1.0,       # Profile = 1 для острых углов
        affect='EDGES',
        clamp_overlap=True
    )
    
    bpy.ops.object.mode_set(mode='OBJECT')


def apply_subdivision(obj, levels_viewport=2, levels_render=3):
    """
    SubD с разными уровнями для viewport и рендера.
    Никогда не делаю render level > 4 без необходимости.
    """
    subd = obj.modifiers.new(name="Subdivision", type='SUBSURF')
    subd.levels = levels_viewport
    subd.render_levels = levels_render
    subd.quality = 3
    subd.use_limit_surface = False  # Отключаем для более чёткого результата
    
    return subd
```

---

## 🎨 Этап 5: UV Unwrap

**Правило:** хорошая UV-развёртка = половина хорошего материала.

```python
def smart_unwrap(obj):
    """
    Интеллектуальная развёртка с правильными seams.
    """
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(obj.data)
    
    # 1. Помечаем seams по шарп-рёбрам
    bpy.ops.mesh.select_all(action='SELECT')
    
    # Находим рёбра с большим углом
    for edge in bm.edges:
        if edge.calc_face_angle(None) is not None:
            if math.degrees(edge.calc_face_angle(0)) > 60:
                edge.seam = True
    
    bmesh.update_edit_mesh(obj.data)
    
    # 2. Умная развёртка
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(66),
        island_margin=0.02,  # Зазор между UV-островами
        area_weight=0.0,
        correct_aspect=True,
        scale_to_bounds=True
    )
    
    bpy.ops.object.mode_set(mode='OBJECT')


def pack_uvs(obj):
    """Упаковка UV с максимальным использованием пространства."""
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(
        udim_source='CLOSEST_UDIM',
        rotate=True,
        rotate_method='AXIS_ALIGNED',
        scale=True,
        margin_method='FRACTION',
        margin=0.003,
        pin=False,
        pin_method='LOCKED',
        shape_method='CONCAVE'
    )
    bpy.ops.object.mode_set(mode='OBJECT')
```

---

## 💡 Этап 6: Материалы (Principled BSDF — правильно)

**Проблема большинства AI:** они ставят одноцветный Principled BSDF и называют это материалом. Я делаю процедурные материалы с реальной сложностью.

### Металл с царапинами и пылью

```python
def create_metal_material(name="SciFi_Metal", base_color=(0.4, 0.42, 0.45, 1.0)):
    """
    Реалистичный металлический материал.
    Использует noise для вариации, не плоский цвет.
    """
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    
    # Очищаем дефолтные ноды
    nodes.clear()
    
    # === OUTPUT ===
    output = nodes.new('ShaderNodeOutputMaterial')
    output.location = (1200, 0)
    
    # === PRINCIPLED BSDF ===
    principled = nodes.new('ShaderNodeBsdfPrincipled')
    principled.location = (800, 0)
    principled.inputs['Metallic'].default_value = 1.0
    principled.inputs['Specular IOR Level'].default_value = 0.5
    
    # === TEXTURE COORDINATE ===
    tex_coord = nodes.new('ShaderNodeTexCoord')
    tex_coord.location = (-800, 0)
    
    mapping = nodes.new('ShaderNodeMapping')
    mapping.location = (-600, 0)
    mapping.inputs['Scale'].default_value = (4, 4, 4)
    
    # === BASE COLOR с вариацией ===
    # Noise для микро-вариации цвета
    noise_color = nodes.new('ShaderNodeTexNoise')
    noise_color.location = (-400, 200)
    noise_color.inputs['Scale'].default_value = 8.0
    noise_color.inputs['Detail'].default_value = 6.0
    noise_color.inputs['Roughness'].default_value = 0.7
    noise_color.inputs['Distortion'].default_value = 0.1
    
    color_ramp_base = nodes.new('ShaderNodeValToRGB')
    color_ramp_base.location = (-150, 200)
    color_ramp_base.color_ramp.elements[0].color = base_color
    color_ramp_base.color_ramp.elements[1].color = (
        base_color[0] * 1.3, 
        base_color[1] * 1.3, 
        base_color[2] * 1.3, 1.0
    )
    
    # === ROUGHNESS с царапинами ===
    # Anisotropic noise для царапин
    noise_scratch = nodes.new('ShaderNodeTexNoise')
    noise_scratch.location = (-400, -100)
    noise_scratch.inputs['Scale'].default_value = 200.0
    noise_scratch.inputs['Detail'].default_value = 12.0
    noise_scratch.inputs['Roughness'].default_value = 0.9
    
    wave_scratch = nodes.new('ShaderNodeTexWave')
    wave_scratch.location = (-400, -300)
    wave_scratch.wave_type = 'BANDS'
    wave_scratch.inputs['Scale'].default_value = 80.0
    wave_scratch.inputs['Distortion'].default_value = 5.0
    wave_scratch.inputs['Detail'].default_value = 6.0
    
    mix_scratch = nodes.new('ShaderNodeMixRGB')
    mix_scratch.location = (-150, -200)
    mix_scratch.blend_type = 'MULTIPLY'
    mix_scratch.inputs['Fac'].default_value = 0.4
    
    color_ramp_rough = nodes.new('ShaderNodeValToRGB')
    color_ramp_rough.location = (100, -200)
    # Металл: базовая roughness 0.1-0.2, царапины до 0.4
    color_ramp_rough.color_ramp.elements[0].position = 0.3
    color_ramp_rough.color_ramp.elements[0].color = (0.1, 0.1, 0.1, 1.0)
    color_ramp_rough.color_ramp.elements[1].color = (0.35, 0.35, 0.35, 1.0)
    
    # === BUMP MAP для микро-детали ===
    noise_bump = nodes.new('ShaderNodeTexNoise')
    noise_bump.location = (-400, -500)
    noise_bump.inputs['Scale'].default_value = 50.0
    noise_bump.inputs['Detail'].default_value = 8.0
    noise_bump.inputs['Roughness'].default_value = 0.65
    
    bump = nodes.new('ShaderNodeBump')
    bump.location = (100, -450)
    bump.inputs['Strength'].default_value = 0.3
    bump.inputs['Distance'].default_value = 0.02
    
    # === СОЕДИНЕНИЯ ===
    links.new(tex_coord.outputs['Object'], mapping.inputs['Vector'])
    links.new(mapping.outputs['Vector'], noise_color.inputs['Vector'])
    links.new(mapping.outputs['Vector'], noise_scratch.inputs['Vector'])
    links.new(mapping.outputs['Vector'], wave_scratch.inputs['Vector'])
    links.new(mapping.outputs['Vector'], noise_bump.inputs['Vector'])
    
    links.new(noise_color.outputs['Fac'], color_ramp_base.inputs['Fac'])
    links.new(color_ramp_base.outputs['Color'], principled.inputs['Base Color'])
    
    links.new(noise_scratch.outputs['Fac'], mix_scratch.inputs['Color1'])
    links.new(wave_scratch.outputs['Color'], mix_scratch.inputs['Color2'])
    links.new(mix_scratch.outputs['Color'], color_ramp_rough.inputs['Fac'])
    links.new(color_ramp_rough.outputs['Color'], principled.inputs['Roughness'])
    
    links.new(noise_bump.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], principled.inputs['Normal'])
    
    links.new(principled.outputs['BSDF'], output.inputs['Surface'])
    
    return mat


def create_emission_accent(name="Emission_Accent", color=(0.2, 0.8, 1.0, 1.0), strength=5.0):
    """
    Emission material для светящихся деталей.
    Добавляет жизнь в sci-fi объекты.
    """
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    
    output = nodes.new('ShaderNodeOutputMaterial')
    output.location = (400, 0)
    
    emission = nodes.new('ShaderNodeEmission')
    emission.location = (0, 0)
    emission.inputs['Color'].default_value = color
    emission.inputs['Strength'].default_value = strength
    
    links.new(emission.outputs['Emission'], output.inputs['Surface'])
    
    return mat
```

---

## 🌍 Этап 7: Освещение и рендер

```python
def setup_studio_lighting():
    """
    3-точечное студийное освещение — стандарт для showcase рендеров.
    """
    # Key light — основной свет
    bpy.ops.object.light_add(type='AREA', location=(3, -2, 4))
    key_light = bpy.context.active_object
    key_light.name = "Key_Light"
    key_light.data.energy = 800
    key_light.data.size = 2.0
    key_light.data.color = (1.0, 0.95, 0.9)  # Чуть тёплый
    key_light.rotation_euler = (math.radians(45), 0, math.radians(35))
    
    # Fill light — заполняющий свет
    bpy.ops.object.light_add(type='AREA', location=(-4, -1, 2))
    fill_light = bpy.context.active_object
    fill_light.name = "Fill_Light"
    fill_light.data.energy = 200  # В 4 раза слабее key
    fill_light.data.size = 3.0
    fill_light.data.color = (0.9, 0.95, 1.0)  # Чуть холодный
    fill_light.rotation_euler = (math.radians(30), 0, math.radians(-40))
    
    # Rim light — контровой свет
    bpy.ops.object.light_add(type='AREA', location=(0, 4, 3))
    rim_light = bpy.context.active_object
    rim_light.name = "Rim_Light"
    rim_light.data.energy = 400
    rim_light.data.size = 1.5
    rim_light.data.color = (0.8, 0.9, 1.0)  # Холодный для контура
    rim_light.rotation_euler = (math.radians(-30), math.radians(180), 0)
    
    # HDRI для ambient
    world = bpy.context.scene.world
    world.use_nodes = True
    world_nodes = world.node_tree.nodes
    world_links = world.node_tree.links
    
    bg_node = world_nodes.get('Background')
    if bg_node:
        bg_node.inputs['Strength'].default_value = 0.3  # Слабый ambient
        bg_node.inputs['Color'].default_value = (0.05, 0.07, 0.1, 1.0)


def setup_camera_for_showcase(target_location=(0, 0, 0), distance=4.0):
    """
    Камера на удобной позиции для showcase.
    """
    bpy.ops.object.camera_add()
    camera = bpy.context.active_object
    camera.name = "Showcase_Camera"
    
    # 3/4 вид — классика для product shots
    angle_h = math.radians(35)  # Горизонталь
    angle_v = math.radians(25)  # Вертикаль
    
    cam_x = target_location[0] + distance * math.cos(angle_v) * math.sin(angle_h)
    cam_y = target_location[1] - distance * math.cos(angle_v) * math.cos(angle_h)
    cam_z = target_location[2] + distance * math.sin(angle_v)
    
    camera.location = (cam_x, cam_y, cam_z)
    
    # Направляем камеру на объект
    direction = Vector(target_location) - camera.location
    rot_quat = direction.to_track_quat('-Z', 'Y')
    camera.rotation_euler = rot_quat.to_euler()
    
    # Настройки камеры
    camera.data.lens = 85  # 85mm — меньше искажений, лучше для продукта
    camera.data.dof.use_dof = True
    camera.data.dof.focus_distance = distance
    camera.data.dof.aperture_fstop = 5.6
    
    bpy.context.scene.camera = camera
    return camera
```

---

## 🔄 Полный пайплайн: Sci-Fi Terminal (пример)

Вот как я строю сложный объект от начала до конца:

```python
import bpy
import bmesh
import math
from mathutils import Vector

def build_scifi_terminal():
    """
    Полный пайплайн создания sci-fi терминала.
    Демонстрирует все принципы методологии.
    """
    
    # =============================================
    # ЭТАП 1: Очистка и настройка
    # =============================================
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    
    # =============================================
    # ЭТАП 2: Blockout
    # =============================================
    
    # Основание
    bpy.ops.mesh.primitive_cube_add(location=(0, 0, 0.4))
    base = bpy.context.active_object
    base.name = "Terminal_Base"
    base.scale = (0.6, 0.4, 0.4)
    bpy.ops.object.transform_apply(scale=True)
    
    # Экранная панель
    bpy.ops.mesh.primitive_cube_add(location=(0, -0.05, 1.1))
    screen = bpy.context.active_object
    screen.name = "Terminal_Screen"
    screen.scale = (0.55, 0.03, 0.35)
    bpy.ops.object.transform_apply(scale=True)
    
    # Стойка
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=16,
        radius=0.04,
        depth=0.6,
        location=(0, 0, 0.9)
    )
    pole = bpy.context.active_object
    pole.name = "Terminal_Pole"
    
    # =============================================
    # ЭТАП 3: Детализация основания
    # =============================================
    
    bpy.context.view_layer.objects.active = base
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(base.data)
    
    # Добавляем loop cuts для edge support
    # Вертикальные петли (через bmesh для точности)
    geom = bm.edges[:]
    ret = bmesh.ops.subdivide_edge_ring(
        bm, 
        edges=[e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 0.001 
               and abs(e.verts[0].co.x) > 0.3],
        cuts=1
    )
    
    bmesh.update_edit_mesh(base.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    
    # Bevel для скруглённых углов
    bevel_mod = base.modifiers.new(name="Bevel", type='BEVEL')
    bevel_mod.width = 0.02
    bevel_mod.segments = 3
    bevel_mod.profile = 0.5
    bevel_mod.limit_method = 'ANGLE'
    bevel_mod.angle_limit = math.radians(60)
    
    # SubD
    subd = base.modifiers.new(name="Subdivision", type='SUBSURF')
    subd.levels = 2
    subd.render_levels = 3
    
    # =============================================
    # ЭТАП 4: Экранная область
    # =============================================
    
    # Создаём экранное стекло (emission)
    bpy.ops.mesh.primitive_plane_add(
        size=1,
        location=(0, -0.075, 1.1)
    )
    screen_glass = bpy.context.active_object
    screen_glass.name = "Terminal_ScreenGlass"
    screen_glass.scale = (0.5, 0.31, 1)
    screen_glass.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    
    # =============================================
    # ЭТАП 5: Материалы
    # =============================================
    
    # Материал корпуса
    metal_mat = bpy.data.materials.new("Terminal_Metal")
    metal_mat.use_nodes = True
    mn = metal_mat.node_tree.nodes
    ml = metal_mat.node_tree.links
    mn.clear()
    
    out = mn.new('ShaderNodeOutputMaterial')
    out.location = (600, 0)
    pbr = mn.new('ShaderNodeBsdfPrincipled')
    pbr.location = (300, 0)
    pbr.inputs['Base Color'].default_value = (0.08, 0.09, 0.12, 1.0)
    pbr.inputs['Metallic'].default_value = 0.9
    pbr.inputs['Roughness'].default_value = 0.2
    
    noise = mn.new('ShaderNodeTexNoise')
    noise.location = (-100, 0)
    noise.inputs['Scale'].default_value = 30.0
    noise.inputs['Detail'].default_value = 8.0
    
    rough_ramp = mn.new('ShaderNodeValToRGB')
    rough_ramp.location = (100, -150)
    rough_ramp.color_ramp.elements[0].color = (0.15, 0.15, 0.15, 1.0)
    rough_ramp.color_ramp.elements[1].color = (0.3, 0.3, 0.3, 1.0)
    
    ml.new(noise.outputs['Fac'], rough_ramp.inputs['Fac'])
    ml.new(rough_ramp.outputs['Color'], pbr.inputs['Roughness'])
    ml.new(pbr.outputs['BSDF'], out.inputs['Surface'])
    
    base.data.materials.append(metal_mat)
    screen.data.materials.append(metal_mat)
    pole.data.materials.append(metal_mat)
    
    # Материал экрана (emission)
    screen_mat = bpy.data.materials.new("Terminal_Screen")
    screen_mat.use_nodes = True
    sn = screen_mat.node_tree.nodes
    sl = screen_mat.node_tree.links
    sn.clear()
    
    s_out = sn.new('ShaderNodeOutputMaterial')
    s_out.location = (500, 0)
    
    emission = sn.new('ShaderNodeEmission')
    emission.location = (200, 0)
    emission.inputs['Color'].default_value = (0.1, 0.6, 1.0, 1.0)
    emission.inputs['Strength'].default_value = 8.0
    
    sl.new(emission.outputs['Emission'], s_out.inputs['Surface'])
    screen_glass.data.materials.append(screen_mat)
    
    # =============================================
    # ЭТАП 6: Освещение
    # =============================================
    setup_studio_lighting()
    setup_camera_for_showcase(target_location=(0, 0, 0.9), distance=3.5)
    
    print("✅ Sci-Fi Terminal создан успешно!")
    return {
        'base': base,
        'screen': screen, 
        'pole': pole,
        'screen_glass': screen_glass
    }


# Запуск
objects = build_scifi_terminal()
```

---

## 📋 Мои правила при работе через MCP

### ✅ Делаю всегда

| Правило | Причина |
|---------|---------|
| Группирую код в логические блоки | Меньше вызовов MCP → меньше накладных расходов |
| Именую все объекты (`obj.name = "..."`) | Лёгкий поиск и редактирование позже |
| Применяю трансформации после scale (`transform_apply`) | Предотвращает баги с модификаторами |
| Проверяю результат перед следующим этапом | Ошибку легче исправить сразу |
| Использую `EXACT` solver для Boolean | Fast solver даёт артефакты |
| Сохраняю файл после каждого этапа | Никакой потери работы |

### ❌ Никогда не делаю

| Антипаттерн | Почему плохо |
|------------|-------------|
| 50+ отдельных вызовов MCP для одного объекта | Медленно, неэффективно |
| Материал = один цвет | Нереалистично, мёртво |
| Игнорирование топологии | Модель сломается при анимации/SubD |
| Scale без `transform_apply` | Модификаторы будут работать неверно |
| Случайные edge loops | Теряется форма при subdivision |
| Рендер без освещения | HDRI одного недостаточно |

---

## 🚀 Шаблон запроса к Claude

Когда просишь меня создать модель, используй этот формат для лучшего результата:

```
Создай [ОБЪЕКТ] в Blender со следующими параметрами:
- Стиль: [sci-fi / реализм / стилизация / архитектура]
- Уровень детализации: [LOD0 hero / LOD1 средний / LOD2 фон]
- Размер: [примерные размеры в метрах]
- Материал: [металл / органика / камень / пластик / стекло]
- Назначение: [рендер / анимация / игра / 3D-печать]
- Особые детали: [что должно быть обязательно]
```

---

## 🔧 Утилиты и вспомогательные функции

```python
def save_checkpoint(filename="model_checkpoint"):
    """Сохранение в процессе работы."""
    bpy.ops.wm.save_as_mainfile(
        filepath=f"/tmp/{filename}.blend",
        check_existing=False
    )
    print(f"💾 Сохранено: {filename}.blend")


def report_scene_stats():
    """Отчёт о состоянии сцены."""
    total_verts = sum(len(obj.data.vertices) for obj in bpy.data.objects 
                      if obj.type == 'MESH')
    total_faces = sum(len(obj.data.polygons) for obj in bpy.data.objects 
                      if obj.type == 'MESH')
    print(f"📊 Статистика сцены:")
    print(f"   Объекты: {len(bpy.data.objects)}")
    print(f"   Вершины: {total_verts:,}")
    print(f"   Полигоны: {total_faces:,}")


def cleanup_scene():
    """Очистка мусора из сцены."""
    # Удаляем неиспользуемые материалы
    for mat in bpy.data.materials:
        if mat.users == 0:
            bpy.data.materials.remove(mat)
    
    # Удаляем неиспользуемые меши
    for mesh in bpy.data.meshes:
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    
    print("🧹 Сцена очищена от неиспользуемых данных")
```

---

## 📚 Принципы, которые отличают мой подход

1. **Я думаю о форме, а не о командах** — сначала визуализирую результат
2. **Топология — это архитектура модели** — плохая топология = плохая модель
3. **Материал усиливает форму** — не заменяет недостающую геометрию  
4. **Свет — часть модели** — без правильного освещения лучшая модель выглядит плохо
5. **Меньше вызовов, больше смысла** — один хороший Python-блок лучше 100 мелких

---

*Этот документ — живое руководство. Подходы уточняются с каждым проектом.*

# Гайд: Как добавить свои 3D модели и создать классный ландшафт в Three.js

Теперь, когда игра полностью работает в 3D (Three.js), вы можете заменить базовые примитивы (сферы и кубы) на полноценные 3D-модели (например, рыцаря с мечом, орков, демонов) и добавить рельеф вместо плоской однотонной земли.

Ниже описаны шаги, как именно это сделать.

## 1. Загрузка 3D моделей (GLTF / GLB форматов)

Самый оптимальный, легкий и современный формат 3D-моделей для веба — это **GLTF** или **GLB** (бинарный GLTF). Вы можете бесплатно найти такие модели на сайте [Sketchfab](https://sketchfab.com/) или [Mixamo](https://www.mixamo.com/) (для персонажей с анимациями).

Чтобы загружать эти модели в игру, вам понадобится инструмент загрузки из Three.js: `GLTFLoader`.

### Подготовка
Сначала скопируйте файл модели (например `hero.glb`) в папку `public/assets/models/` (создайте эти папки).
Все файлы внутри `public` будут доступны при билде игры.

### Код (импорт лоадера)
Вам нужно будет добавить лоадер в файлы, где вы создаете сущности (например, `Player.ts` или `Enemy.ts`):

```typescript
// Импортируем загрузчик моделей
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ... внутри конструктора Player.ts или Enemy.ts ...
const loader = new GLTFLoader();

// Загружаем модель
loader.load(
    '/assets/models/hero.glb', // Путь к вашей модели (она должна лежать в public/assets/...)
    (gltf) => {
        const model = gltf.scene;
        
        // Масштабируем модель, если она слишком огромная
        model.scale.set(10, 10, 10); 
        
        // Включаем тени для всех обьектов в модели
        model.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // Добавляем модель внутрь вашей основной Mesh или Group
        this.mesh.add(model); 
        
        // Опционально: можно сделать базовую сферу/хитбокс абсолютно прозрачной
        (this.mesh.material as THREE.MeshStandardMaterial).visible = false;
    },
    undefined,
    (error) => {
        console.error('Ошибка загрузки модели:', error);
    }
);
```

### Как работать с анимациями?
Если вы скачали модель с запеченными анимациями (бег, атака, смерть), загрузчик вернет их в массиве `gltf.animations`. 
Вам понадобится `THREE.AnimationMixer` чтобы проигрывать их внутри метода `update(dt)`:
```typescript
this.mixer = new THREE.AnimationMixer(model);
this.actionRun = this.mixer.clipAction(gltf.animations[0]); // Пример: анимация бега
this.actionRun.play();

// Затем где-то в функции update(dt) писать:
if (this.mixer) this.mixer.update(dt);
```

---

## 2. Создание ландшафта (Terrain)

Сейчас земля — это плоский `PlaneGeometry` серого цвета (`0x333333`). Мы можем сделать красивый ландшафт несколькими способами.

### Способ А: Использование текстур (Материалы)
Простой способ улучшить землю — наложить на неё бесшовную текстуру травы или камня.
Найдите текстуру (например, `grass.jpg`), положите ее в `public/assets/textures/`.

**В Game.ts:**
```typescript
const textureLoader = new THREE.TextureLoader();
const grassTexture = textureLoader.load('/assets/textures/grass.jpg');

// Настроим тайлинг (повторение текстуры), чтобы она не растянулась на весь мир мыльно
grassTexture.wrapS = THREE.RepeatWrapping;
grassTexture.wrapT = THREE.RepeatWrapping;
grassTexture.repeat.set(100, 100);

const planeGeo = new THREE.PlaneGeometry(10000, 10000);
// Используем карту (map) вместо простого цвета
const planeMat = new THREE.MeshStandardMaterial({ map: grassTexture, roughness: 0.8 });
const plane = new THREE.Mesh(planeGeo, planeMat);
```

### Способ Б: Рельеф с помощью "Карты Высот" (Displacement Map)
Если вы хотите добавить бугры, ямы и горы, вы можете использовать черно-белую картинку (карту высот). Белые пиксели превратятся в горы, черные в ямы.
```typescript
const displacementMap = textureLoader.load('/assets/textures/heightmap.png');

// Геометрия должна быть более плотной (больше сегментов), чтобы было чему изгибаться
const planeGeo = new THREE.PlaneGeometry(10000, 10000, 200, 200);

const planeMat = new THREE.MeshStandardMaterial({ 
    map: grassTexture,
    displacementMap: displacementMap, 
    displacementScale: 200 // Сила искажения (высота гор)
});
```

### Декоративные объекты (Деревья, камни)
Вы можете создать функцию, которая случайным образом раскидывает по краям карты статические `THREE.Mesh` или подгруженные GLTF деревья (`tree.glb`).

**В Game.ts:**
```typescript
function spawnTrees(scene) {
    for(let i=0; i<50; i++) {
        const x = (Math.random() - 0.5) * 5000;
        const y = (Math.random() - 0.5) * 5000;
        
        // Создайте куб-дерево или загрузите модель дерева
        const geo = new THREE.CylinderGeometry(0, 30, 100, 8);
        const mat = new THREE.MeshStandardMaterial({color: 0x27ae60});
        const tree = new THREE.Mesh(geo, mat);
        
        tree.position.set(x, 50, y); // Высота 50
        scene.add(tree);
    }
}
```

Не забудьте что если добавить слишком много **разных** моделей деревьев, у телефонов будет падать FPS. Для оптимизации огромного леса в Three.js используется `THREE.InstancedMesh`.

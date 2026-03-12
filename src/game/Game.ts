import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { InputManager } from './InputManager';
import { Player } from './Player';
import { Enemy } from './Enemy';
import { ExpDrop } from './ExpDrop';
import { CoinDrop } from './CoinDrop';
import { Chest } from './Chest';
import { BasicSword } from './weapons/BasicSword';
import { Bow } from './weapons/Bow';
import { Staff } from './weapons/Staff';
import { BananaWeapon } from './weapons/BananaWeapon';
import { SwordWeapon } from './weapons/SwordWeapon';
import { BowWeapon } from './weapons/BowWeapon';
import { Projectile } from './Projectile';
import { UIManager } from './UIManager';

export enum GameState {
    MAIN_MENU,
    PLAYING,
    GAME_OVER
}

export class Game {
    private container: HTMLElement;
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;

    private isRunning: boolean = false;
    private lastTime: number = 0;
    private inputManager: InputManager;
    private uiManager: UIManager;
    private state: GameState = GameState.MAIN_MENU;

    private player!: Player;
    private enemies: Enemy[] = [];
    private expDrops: ExpDrop[] = [];
    private coinDrops: CoinDrop[] = [];
    private chests: Chest[] = [];
    private projectiles: Projectile[] = [];

    private lastSpawnTime: number = 0;
    private lastChestSpawnTime: number = 0;
    private isPaused: boolean = false;

    // Terrain
    private terrainMeshes: THREE.Mesh[] = [];  // All meshes to Raycast against
    private terrainRaycaster = new THREE.Raycaster();

    // TPS Camera Control
    private cameraAngle: number = 0;
    private cameraPitch: number = Math.PI / 6; // ~30 degrees
    private isDragging: boolean = false;
    private previousMousePosition = { x: 0, y: 0 };

    constructor(container: HTMLElement) {
        this.container = container;

        // Setup Three.js
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a1a);

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 10000);
        this.camera.position.set(0, 400, 300); // Top-down angled
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(100, 300, 100);
        dirLight.castShadow = true;
        this.scene.add(dirLight);

        // Ground + Mountain FBX terrain; loaded asynchronously
        this.loadMountainTerrain();

        this.inputManager = new InputManager();
        this.uiManager = new UIManager();

        window.addEventListener('resize', () => this.onWindowResize());

        // Setup HUD (initially hidden)
        this.setupHUD();

        // Setup Camera Control (Drag to rotate)
        this.container.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.previousMousePosition = { x: e.clientX, y: e.clientY };
        });
        this.container.addEventListener('mouseup', () => { this.isDragging = false; });
        this.container.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const deltaX = e.clientX - this.previousMousePosition.x;
                const deltaY = e.clientY - this.previousMousePosition.y;
                this.cameraAngle -= deltaX * 0.01;
                this.cameraPitch = Math.max(0.1, Math.min(Math.PI / 2.2, this.cameraPitch + deltaY * 0.01));
                this.previousMousePosition = { x: e.clientX, y: e.clientY };
            }
        });

        // Touch support for mobile camera
        this.container.addEventListener('touchstart', (e) => {
            this.isDragging = true;
            this.previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }, { passive: false });
        this.container.addEventListener('touchend', () => { this.isDragging = false; });
        this.container.addEventListener('touchmove', (e) => {
            if (this.isDragging) {
                const deltaX = e.touches[0].clientX - this.previousMousePosition.x;
                const deltaY = e.touches[0].clientY - this.previousMousePosition.y;
                this.cameraAngle -= deltaX * 0.01;
                this.cameraPitch = Math.max(0.1, Math.min(Math.PI / 2.2, this.cameraPitch + deltaY * 0.01));
                this.previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
        }, { passive: false });
    }

    private setupHUD() {
        const hud = document.createElement('div');
        hud.id = 'hud';
        hud.style.position = 'absolute';
        hud.style.top = '10px';
        hud.style.left = '10px';
        hud.style.color = 'white';
        hud.style.fontFamily = 'sans-serif';
        hud.style.fontSize = '20px';
        hud.style.pointerEvents = 'none';
        hud.style.display = 'none'; // Hidden until playing
        this.container.appendChild(hud);
    }

    private async loadMountainTerrain() {
        const loader = new FBXLoader();

        // Helper to load one FBX and register its geometry as terrain/decoration
        const load = (path: string): Promise<THREE.Group> => new Promise((res, rej) =>
            loader.load(path, res, undefined, rej)
        );

        // --- Base ground (flat fallback while FBX loads + always-present floor) ---
        const groundGeo = new THREE.PlaneGeometry(20000, 20000);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a7d44, roughness: 0.9 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
        this.terrainMeshes.push(ground);

        // Add fog for depth
        this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.0003);
        this.scene.background = new THREE.Color(0x87ceeb); // Sky blue

        try {
            // Load the Mountain01.fbx — tile 9 copies in a 3x3 grid
            const mountainFbx = await load('/assets/models/Mountain/Mountain01.fbx');
            const s = 3.0; // scale factor
            const tileSize = 1500; // world units between tile centers

            for (let tx = -1; tx <= 1; tx++) {
                for (let tz = -1; tz <= 1; tz++) {
                    const clone = mountainFbx.clone();
                    clone.scale.set(s, s, s);
                    clone.position.set(tx * tileSize, 0, tz * tileSize);
                    clone.receiveShadow = true;
                    clone.castShadow = true;
                    this.scene.add(clone);

                    // Register every mesh for raycasting
                    clone.traverse((child) => {
                        if ((child as THREE.Mesh).isMesh) {
                            const m = child as THREE.Mesh;
                            m.receiveShadow = true;
                            m.castShadow = true;
                            this.terrainMeshes.push(m);
                        }
                    });
                }
            }

            // --- Decorations: optimized for mobile/Android performance ---
            const decorFiles = [
                { path: '/assets/models/Mountain/Tree01.fbx', count: 15, scale: 2.5 },
                { path: '/assets/models/Mountain/Rock01.fbx', count: 10, scale: 2.0 },
                { path: '/assets/models/Mountain/Rock02.fbx', count: 8, scale: 1.8 },
                { path: '/assets/models/Mountain/Bush01.fbx', count: 12, scale: 2.0 },
                { path: '/assets/models/Mountain/Grass01.fbx', count: 15, scale: 1.5 },
                { path: '/assets/models/Mountain/Flower01.fbx', count: 8, scale: 1.5 },
            ];

            for (const def of decorFiles) {
                try {
                    const fbx = await load(def.path);
                    // Lower material quality for decorations
                    fbx.traverse((child) => {
                        if ((child as THREE.Mesh).isMesh) {
                            const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
                            if (mat) { mat.roughness = 1.0; mat.metalness = 0; }
                        }
                    });
                    for (let i = 0; i < def.count; i++) {
                        const c = fbx.clone();
                        c.scale.set(def.scale, def.scale, def.scale);
                        // Scatter in a ring away from player spawn
                        const angle = Math.random() * Math.PI * 2;
                        const dist = 400 + Math.random() * 3500;
                        c.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
                        c.rotation.y = Math.random() * Math.PI * 2;
                        // Don't cast shadows on decorations – expensive on mobile
                        c.castShadow = false;
                        c.receiveShadow = false;
                        this.scene.add(c);
                    }
                } catch (e) {
                    console.warn(`Could not load decoration: ${def.path}`, e);
                }
            }

        } catch (e) {
            console.warn('Mountain01.fbx failed to load, using flat ground fallback', e);
        }
    }

    // Raycaster-based height: shoot ray down from sky and find surface below (x,z)
    public getTerrainHeightAt(x: number, z: number): number {
        if (this.terrainMeshes.length === 0) return 0;

        const origin = new THREE.Vector3(x, 2000, z);
        const direction = new THREE.Vector3(0, -1, 0);
        this.terrainRaycaster.set(origin, direction);

        const hits = this.terrainRaycaster.intersectObjects(this.terrainMeshes, false);
        if (hits.length > 0) {
            return hits[0].point.y;
        }
        return 0; // fallback to ground
    }

    private updateHUD() {
        if (this.state !== GameState.PLAYING) return;
        const hud = document.getElementById('hud');
        if (hud) {
            hud.innerHTML = `
                <div>Level: ${this.player.level}</div>
                <div>Coins: ${this.player.coins} 🪙</div>
                <div>Weapons: ${this.player.weapons.map(w => w.data.icon).join(' ')}</div>
                <div style="margin-top:10px; color:#e74c3c">HP: ${Math.floor(Math.max(0, this.player.hp))} / ${this.player.maxHp}</div>
            `;
        }
    }

    private onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    public start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.state = GameState.MAIN_MENU;
        this.uiManager.showMainMenu((heroType) => this.initGame(heroType));
    }

    private initGame(heroType: 'human' | 'knight' | 'archer') {
        const hud = document.getElementById('hud');
        if (hud) hud.style.display = 'block';

        this.player = new Player(this.scene, 0, 0, heroType);

        // Equip Starting Weapons — meshes are self-managed lazily inside each weapon's tryAttack
        if (heroType === 'human') {
            this.player.addWeapon(new BananaWeapon());
        } else if (heroType === 'knight') {
            this.player.addWeapon(new SwordWeapon());
        } else if (heroType === 'archer') {
            this.player.addWeapon(new BowWeapon());
        }

        this.player.onLevelUp = () => this.handleLevelUp();

        this.state = GameState.PLAYING;
        this.lastTime = performance.now();
        requestAnimationFrame((time) => this.loop(time));
    }

    private resetGame(returnToMenu: boolean = true) {
        // Clear entities
        this.enemies.forEach(e => e.remove());
        this.expDrops.forEach(e => e.remove());
        this.coinDrops.forEach(c => c.remove());
        this.chests.forEach(c => c.remove());
        this.projectiles.forEach(p => p.remove());
        // Remove player mesh
        if (this.player && this.player.mesh) {
            this.scene.remove(this.player.mesh);
            // Quick cleanup of children
            while (this.player.mesh.children.length > 0) {
                this.player.mesh.remove(this.player.mesh.children[0]);
            }
        }

        this.enemies = [];
        this.expDrops = [];
        this.coinDrops = [];
        this.chests = [];
        this.projectiles = [];
        this.lastSpawnTime = 0;
        this.lastChestSpawnTime = 0;

        const hud = document.getElementById('hud');

        if (returnToMenu) {
            if (hud) hud.style.display = 'none';
            this.state = GameState.MAIN_MENU;
            this.uiManager.showMainMenu((heroType) => this.initGame(heroType));
        } else {
            // Instantly play with the same hero
            this.initGame(this.player.heroType);
        }
    }

    private handleGameOver() {
        this.state = GameState.GAME_OVER;
        const hud = document.getElementById('hud');
        if (hud) hud.style.display = 'none';

        this.uiManager.showGameOver(
            this.player.level,
            this.player.coinsEarned,
            this.player.enemiesKilled,
            () => this.resetGame(false), // Instant Restart
            () => this.resetGame(true)   // Return to Menu
        );
    }

    public stop() {
        this.isRunning = false;
    }

    private handleLevelUp() {
        this.isPaused = true;
        this.uiManager.showLevelUp(this.player, () => {
            this.isPaused = false;

            // Spawn boss if level is multiple of 10
            if (this.player.level > 1 && this.player.level % 10 === 0) {
                this.spawnBoss(this.lastTime / 1000);
            }

            this.lastTime = performance.now();
            requestAnimationFrame((time) => this.loop(time));
        });
    }

    private openChest() {
        this.isPaused = true;

        // Random generator pool
        const weaponTypes = [() => new BasicSword(), () => new Bow(), () => new Staff()];
        const possibleBuffs = ['damageMult', 'speedMult', 'rangeMult'] as const;

        // Based on user request, add more buffs at level scaling: max 5 at level 100
        const buffCount = Math.min(5, 1 + Math.floor(this.player.level / 20));

        const choices = Array.from({ length: 3 }).map(() => {
            const w = weaponTypes[Math.floor(Math.random() * weaponTypes.length)]();
            w.data.name += ` (+${buffCount})`;

            // Randomly pick buffs and apply them
            for (let i = 0; i < buffCount; i++) {
                const buffType = possibleBuffs[Math.floor(Math.random() * possibleBuffs.length)];
                if (buffType === 'damageMult') w.data.damageMult += 0.5;
                if (buffType === 'speedMult') w.data.speedMult *= 1.3;
                if (buffType === 'rangeMult') w.data.damageMult += 0.2; // Generic generic buff
            }
            return w;
        });

        this.uiManager.showWeaponChest(this.player, choices, (selectedWeapon: any | null) => {
            if (selectedWeapon) {
                this.player.addWeapon(selectedWeapon);
            }
            this.isPaused = false;
            this.lastTime = performance.now();
            requestAnimationFrame((time) => this.loop(time));
        });
    }

    private loop(time: number) {
        if (!this.isRunning || this.isPaused || this.state !== GameState.PLAYING) return;

        const deltaTime = (time - this.lastTime) / 1000;
        this.lastTime = time;

        this.update(deltaTime, time / 1000);
        this.render();

        requestAnimationFrame((time) => this.loop(time));
    }

    private update(dt: number, timeSeconds: number) {
        const inputMove = this.inputManager.getMovementVector();
        // Translate input based on camera yaw angle
        const move = {
            x: inputMove.x * Math.cos(this.cameraAngle) + inputMove.y * Math.sin(this.cameraAngle),
            y: -inputMove.x * Math.sin(this.cameraAngle) + inputMove.y * Math.cos(this.cameraAngle)
        };

        this.player.update(dt, move, timeSeconds, this.enemies, (p: Projectile) => {
            this.projectiles.push(p);
        }, this.scene);

        // Snap Player to Terrain
        const ph = this.getTerrainHeightAt(this.player.x, this.player.y);
        this.player.mesh.position.y = ph + this.player.radius;

        // Camera follow player (TPS View)
        const distance = 250;
        this.camera.position.x = this.player.x + Math.sin(this.cameraAngle) * distance * Math.cos(this.cameraPitch);
        this.camera.position.z = this.player.y + Math.cos(this.cameraAngle) * distance * Math.cos(this.cameraPitch);
        this.camera.position.y = this.player.mesh.position.y + Math.sin(this.cameraPitch) * distance;
        this.camera.lookAt(this.player.x, this.player.mesh.position.y, this.player.y);

        // Cap enemies to prevent FPS collapse on mobile (max 30 on screen at once)
        const MAX_ENEMIES = 30;
        const spawnMultiplier = Math.pow(1.3, Math.floor((this.player.level - 1) / 2));
        const spawnDelay = Math.max(0.4, 1.5 / spawnMultiplier); // minimum 0.4s between spawns
        if (timeSeconds - this.lastSpawnTime > spawnDelay && this.enemies.length < MAX_ENEMIES) {
            this.spawnEnemy(timeSeconds);
            this.lastSpawnTime = timeSeconds;
        }

        // Chest spawning
        if (timeSeconds - this.lastChestSpawnTime > 30.0) {
            this.spawnChest();
            this.lastChestSpawnTime = timeSeconds;
        }

        // Projectiles Update
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            const isAlive = proj.update(dt);
            const projH = this.getTerrainHeightAt(proj.x, proj.y);
            if (proj.mesh) proj.mesh.position.y = projH + proj.radius;

            if (!isAlive) {
                proj.remove();
                this.projectiles.splice(i, 1);
                continue;
            }

            for (const enemy of this.enemies) {
                const dx = enemy.x - proj.x;
                const dy = enemy.y - proj.y;
                const distSq = dx * dx + dy * dy;
                const collDist = enemy.radius + proj.radius;

                if (distSq <= collDist * collDist) {
                    enemy.hp -= proj.damage;
                    if (proj.pierce > 0) {
                        proj.pierce--;
                        proj.x += proj.vx * 0.1;
                        proj.y += proj.vy * 0.1;
                    } else {
                        proj.remove();
                        this.projectiles.splice(i, 1);
                        break;
                    }
                }
            }
        }

        // Enemies Update
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            enemy.update(dt, this.player);

            const eh = this.getTerrainHeightAt(enemy.x, enemy.y);
            enemy.mesh.position.y = eh + enemy.radius;

            // Damage player
            const pDx = this.player.x - enemy.x;
            const pDy = this.player.y - enemy.y;
            const pDistSq = pDx * pDx + pDy * pDy;
            const pCollDist = this.player.radius + enemy.radius;

            if (pDistSq <= pCollDist * pCollDist) {
                if (this.player.iFrameTimer <= 0) {
                    this.player.hp -= enemy.damage; // Full bump damage
                    this.player.iFrameTimer = 0.5; // Half second iframe
                }
            }

            if (enemy.hp <= 0) {
                this.player.enemiesKilled++;
                this.expDrops.push(new ExpDrop(this.scene, enemy.x, enemy.y, enemy.xpYield));

                // 100% coin drop. Multiplier based on bosses killed (levels / 10)
                const coinMultiplier = 1 + Math.floor(this.player.level / 10);
                this.coinDrops.push(new CoinDrop(this.scene, enemy.x + 10, enemy.y + 10, 1 * coinMultiplier));

                enemy.remove();
                this.enemies.splice(i, 1);
            }
        }

        // Check death
        if (this.player.hp <= 0) {
            this.handleGameOver();
            return;
        }

        // Enemy-Enemy Soft Collisions
        for (let i = 0; i < this.enemies.length; i++) {
            for (let j = i + 1; j < this.enemies.length; j++) {
                const e1 = this.enemies[i];
                const e2 = this.enemies[j];
                const dx = e2.x - e1.x;
                const dy = e2.y - e1.y;
                const distSq = dx * dx + dy * dy;
                const minDist = e1.radius + e2.radius;

                if (distSq < minDist * minDist && distSq > 0) {
                    const dist = Math.sqrt(distSq);
                    const overlap = minDist - dist;
                    const nx = dx / dist;
                    const ny = dy / dist;

                    e1.x -= nx * (overlap / 2);
                    e1.y -= ny * (overlap / 2);
                    e2.x += nx * (overlap / 2);
                    e2.y += ny * (overlap / 2);
                }
            }
        }

        const magnetRadius = 150;
        const pickupRadius = this.player.radius + 15;

        // ExpDrops processing
        for (let i = this.expDrops.length - 1; i >= 0; i--) {
            const drop = this.expDrops[i];
            drop.update(dt);
            const dropH = this.getTerrainHeightAt(drop.x, drop.y);
            drop.mesh.position.y = dropH + 5; // offset

            const dx = drop.x - this.player.x;
            const dy = drop.y - this.player.y;
            const distSq = dx * dx + dy * dy;

            if (distSq <= pickupRadius * pickupRadius) {
                this.player.addXp(drop.amount);
                drop.remove();
                this.expDrops.splice(i, 1);
            } else if (distSq <= magnetRadius * magnetRadius) {
                const dist = Math.sqrt(distSq);
                const speed = 400 * dt;
                drop.x -= (dx / dist) * speed;
                drop.y -= (dy / dist) * speed;
            }
        }

        // CoinDrops processing
        for (let i = this.coinDrops.length - 1; i >= 0; i--) {
            const drop = this.coinDrops[i];
            drop.update(dt);

            const cdropH = this.getTerrainHeightAt(drop.x, drop.y);
            drop.mesh.position.y = cdropH + 5; // offset

            const dx = drop.x - this.player.x;
            const dy = drop.y - this.player.y;
            const distSq = dx * dx + dy * dy;

            if (distSq <= pickupRadius * pickupRadius) {
                this.player.addCoins(drop.amount);
                drop.remove();
                this.coinDrops.splice(i, 1);
            } else if (distSq <= magnetRadius * magnetRadius) {
                const dist = Math.sqrt(distSq);
                const speed = 400 * dt;
                drop.x -= (dx / dist) * speed;
                drop.y -= (dy / dist) * speed;
            }
        }

        // Chests processing
        for (let i = this.chests.length - 1; i >= 0; i--) {
            const chest = this.chests[i];
            const ch = this.getTerrainHeightAt(chest.x, chest.y);
            chest.mesh.position.y = ch + chest.radius;

            const dx = chest.x - this.player.x;
            const dy = chest.y - this.player.y;
            const distSq = dx * dx + dy * dy;

            if (distSq <= Math.pow(this.player.radius + chest.radius, 2)) {
                if (this.player.coins >= chest.cost) {
                    this.player.coins -= chest.cost;
                    chest.remove();
                    this.chests.splice(i, 1);
                    this.openChest();
                }
            }
        }

        this.updateHUD();
    }

    private spawnEnemy(timeSeconds: number) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 600; // spawn outside view
        const x = this.player.x + Math.cos(angle) * dist;
        const y = this.player.y + Math.sin(angle) * dist;

        const level = 1 + Math.floor(timeSeconds / 60);
        this.enemies.push(new Enemy(this.scene, x, y, level));
    }

    private spawnBoss(timeSeconds: number) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 600;
        const x = this.player.x + Math.cos(angle) * dist;
        const y = this.player.y + Math.sin(angle) * dist;

        const level = 1 + Math.floor(timeSeconds / 60);
        this.enemies.push(new Enemy(this.scene, x, y, level, true)); // isBoss = true
    }

    private spawnChest() {
        const angle = Math.random() * Math.PI * 2;
        const dist = 300 + Math.random() * 200;
        const x = this.player.x + Math.cos(angle) * dist;
        const y = this.player.y + Math.sin(angle) * dist;

        // Multiplies by 1.5 at EACH level
        const costMultiplier = Math.pow(1.5, Math.max(0, this.player.level - 1));
        this.chests.push(new Chest(this.scene, x, y, 10 * costMultiplier));
    }

    private render() {
        this.renderer.render(this.scene, this.camera);
    }
}

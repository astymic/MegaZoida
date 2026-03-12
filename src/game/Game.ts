import * as THREE from 'three';
import { InputManager } from './InputManager';
import { Player } from './Player';
import { Enemy } from './Enemy';
import { ExpDrop } from './ExpDrop';
import { CoinDrop } from './CoinDrop';
import { Chest } from './Chest';
import { BasicSword } from './weapons/BasicSword';
import { Bow } from './weapons/Bow';
import { Staff } from './weapons/Staff';
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

        // Ground plane with procedural terrain
        const planeGeo = new THREE.PlaneGeometry(10000, 10000, 150, 150); // More vertices for displacement
        const mapTex = this.generateTerrainTexture(false);
        const dispTex = this.generateTerrainTexture(true);

        const planeMat = new THREE.MeshStandardMaterial({
            map: mapTex,
            displacementMap: dispTex,
            displacementScale: 150, // Height of mountains
            roughness: 0.8
        });
        const plane = new THREE.Mesh(planeGeo, planeMat);
        plane.rotation.x = -Math.PI / 2;
        // The plane physics logic thinks everything is at y=0.
        // We push the plane down slightly so the player runs "above" the lower parts
        // but it's a visual hack.
        plane.position.y = -50;
        plane.receiveShadow = true;
        this.scene.add(plane);

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

    private generateTerrainTexture(isDisplacement: boolean = false): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d')!;

        // Very basic procedural noise (using sine waves)
        for (let x = 0; x < 512; x++) {
            for (let y = 0; y < 512; y++) {
                // Low frequency waves
                const nx = x * 0.05;
                const ny = y * 0.05;
                const wave = (Math.sin(nx) * Math.cos(ny) + 1) / 2;

                // Add some pseudo-random high-frequency noise
                const detail = Math.random() * 0.2;
                const val = Math.min(1, wave * 0.8 + detail);

                if (isDisplacement) {
                    const c = Math.floor(val * 255);
                    ctx.fillStyle = `rgb(${c},${c},${c})`;
                } else {
                    const r = Math.floor(val * 40);
                    const g = Math.floor(val * 120 + 60);
                    const b = Math.floor(val * 30);
                    ctx.fillStyle = `rgb(${r},${g},${b})`;
                }
                ctx.fillRect(x, y, 1, 1);
            }
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(20, 20); // Tile texture across the entire map
        return tex;
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
        this.player.addWeapon(new BasicSword());
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

        // Camera follow player (TPS View)
        const distance = 250;
        this.camera.position.x = this.player.x + Math.sin(this.cameraAngle) * distance * Math.cos(this.cameraPitch);
        this.camera.position.z = this.player.y + Math.cos(this.cameraAngle) * distance * Math.cos(this.cameraPitch);
        this.camera.position.y = this.player.radius + Math.sin(this.cameraPitch) * distance;
        this.camera.lookAt(this.player.x, this.player.radius, this.player.y);

        // Faster spawn rate: scales 1.3x every 2 levels
        const spawnMultiplier = Math.pow(1.3, Math.floor((this.player.level - 1) / 2));
        const spawnDelay = Math.max(0.01, 0.5 / spawnMultiplier);
        if (timeSeconds - this.lastSpawnTime > spawnDelay) {
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

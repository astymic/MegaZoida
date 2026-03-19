import * as THREE from 'three';
import { InputManager } from './InputManager';
import { EnvironmentManager } from './EnvironmentManager';
import { EntityManager } from './EntityManager';
import { SpawnerManager } from './SpawnerManager';
import { BasicSword } from './weapons/BasicSword';
import { Bow } from './weapons/Bow';
import { Staff } from './weapons/Staff';
import { BananaWeapon } from './weapons/BananaWeapon';
import { SwordWeapon } from './weapons/SwordWeapon';
import { BowWeapon } from './weapons/BowWeapon';
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

    private isPaused: boolean = false;

    // Managers
    private envManager: EnvironmentManager;
    private entityManager: EntityManager;
    private spawnerManager: SpawnerManager;

    // TPS Camera Control
    private cameraAngle: number = 0;
    private cameraPitch: number = Math.PI / 2.6; // higher, more top-down
    private isDragging: boolean = false;
    private previousMousePosition = { x: 0, y: 0 };

    constructor(container: HTMLElement) {
        this.container = container;

        // Setup Three.js
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a1a);

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 4000);
        this.camera.position.set(0, 400, 300);
        this.camera.lookAt(0, 0, 0);

        // Renderer — optimized for mobile
        this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // cap for mobile
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.container.appendChild(this.renderer.domElement);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(500, 800, 300);
        dirLight.castShadow = false;
        this.scene.add(dirLight);

        this.renderer.shadowMap.enabled = false;

        // Initialize Managers
        this.envManager = new EnvironmentManager(this.scene);
        this.entityManager = new EntityManager(this.scene, this.envManager);
        this.spawnerManager = new SpawnerManager(this.scene, this.entityManager);

        this.envManager.loadArenaTerrain();

        this.inputManager = new InputManager();
        this.uiManager = new UIManager();

        window.addEventListener('resize', () => this.onWindowResize());
        this.setupHUD();
        this.setupCameraControls();
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

    private setupCameraControls() {
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
                this.cameraPitch = Math.max(0.35, Math.min(Math.PI / 1.9, this.cameraPitch + deltaY * 0.01));
                this.previousMousePosition = { x: e.clientX, y: e.clientY };
            }
        });

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
                this.cameraPitch = Math.max(0.35, Math.min(Math.PI / 1.9, this.cameraPitch + deltaY * 0.01));
                this.previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
        }, { passive: false });
    }

    private updateHUD() {
        if (this.state !== GameState.PLAYING || !this.entityManager.player) return;
        const hud = document.getElementById('hud');
        if (hud) {
            const p = this.entityManager.player;
            hud.innerHTML = `
                <div>Level: ${p.level}</div>
                <div>Coins: ${p.coins} 🪙</div>
                <div>Weapons: ${p.weapons.map(w => w.data.icon).join(' ')}</div>
                <div style="margin-top:10px; color:#e74c3c">HP: ${Math.floor(Math.max(0, p.hp))} / ${p.maxHp}</div>
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

        const p = this.entityManager.initPlayer(heroType, () => this.handleLevelUp());

        // Equip Starting Weapons
        if (heroType === 'human') {
            p.addWeapon(new BananaWeapon());
        } else if (heroType === 'knight') {
            p.addWeapon(new SwordWeapon());
        } else if (heroType === 'archer') {
            p.addWeapon(new BowWeapon());
        }

        this.spawnerManager.reset();

        this.state = GameState.PLAYING;
        this.lastTime = performance.now();
        requestAnimationFrame((time) => this.loop(time));
    }

    private resetGame(returnToMenu: boolean = true) {
        const lastHero = this.entityManager.player ? this.entityManager.player.heroType : 'human';
        this.entityManager.clear();
        this.spawnerManager.reset();

        const hud = document.getElementById('hud');

        if (returnToMenu) {
            if (hud) hud.style.display = 'none';
            this.state = GameState.MAIN_MENU;
            this.uiManager.showMainMenu((heroType) => this.initGame(heroType));
        } else {
            // Instantly play with the same hero
            this.initGame(lastHero);
        }
    }

    private handleGameOver() {
        this.state = GameState.GAME_OVER;
        const hud = document.getElementById('hud');
        if (hud) hud.style.display = 'none';

        const p = this.entityManager.player;
        this.uiManager.showGameOver(
            p.level,
            p.coinsEarned,
            p.enemiesKilled,
            () => this.resetGame(false), // Instant Restart
            () => this.resetGame(true)   // Return to Menu
        );
    }

    public stop() {
        this.isRunning = false;
    }

    private handleLevelUp() {
        this.isPaused = true;
        this.uiManager.showLevelUp(this.entityManager.player, () => {
            this.isPaused = false;

            // Spawn boss if level is multiple of 10
            if (this.entityManager.player.level > 1 && this.entityManager.player.level % 10 === 0) {
                this.spawnerManager.spawnBoss(this.lastTime / 1000);
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

        const p = this.entityManager.player;
        const buffCount = Math.min(5, 1 + Math.floor(p.level / 20));

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

        this.uiManager.showWeaponChest(p, choices, (selectedWeapon: any | null) => {
            if (selectedWeapon) {
                p.addWeapon(selectedWeapon);
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

        // Let EntityManager handle entities and collisions
        this.entityManager.update(dt, timeSeconds, inputMove, this.cameraAngle, () => this.openChest());

        // Update Camera
        const p = this.entityManager.player;
        const distance = 250; // Brought closer
        const lookTargetY = p.mesh.position.y + p.radius * 1.5; // Aim above hero center

        this.camera.position.x = p.x + Math.sin(this.cameraAngle) * distance * Math.cos(this.cameraPitch);
        this.camera.position.z = p.y + Math.cos(this.cameraAngle) * distance * Math.cos(this.cameraPitch);
        this.camera.position.y = lookTargetY + Math.sin(this.cameraPitch) * distance;
        this.camera.lookAt(p.x, lookTargetY, p.y);

        // Let SpawnerManager handle generating new mobs and chests
        this.spawnerManager.update(timeSeconds);

        // Check death
        if (p.hp <= 0) {
            this.handleGameOver();
            return;
        }

        this.updateHUD();
    }

    private render() {
        this.renderer.render(this.scene, this.camera);
    }
}

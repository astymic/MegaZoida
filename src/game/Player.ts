import * as THREE from 'three';
import { Enemy } from './Enemy';
import { Weapon } from './weapons/Weapon';
import { AssetManager } from './AssetManager';

export type HeroType = 'human' | 'knight' | 'archer';

export class Player {
    public x: number;
    public y: number;
    public radius: number = 20;

    // Base Stats
    public maxHp: number = 100;
    public hp: number = 100;
    public maxMana: number = 50;
    public mana: number = 50;
    public level: number = 1;
    public xp: number = 0;
    public xpToNextLevel: number = 10;
    public coins: number = 0;

    // Run Stats
    public enemiesKilled: number = 0;
    public coinsEarned: number = 0;

    public moveSpeed: number = 200; // pixels per second
    public attackSpeed: number = 1.0; // attacks per second
    public attackDamage: number = 10;
    public attackRange: number = 150;
    public defense: number = 0;

    public weapons: Weapon[] = [];
    public maxWeapons: number = 6;
    public heroType: HeroType;

    // State
    private lastAttackTime: number = 0;
    public onLevelUp?: () => void;
    public facingAngle: number = 0;
    public iFrameTimer: number = 0;

    // 3D Rendering
    public mesh: THREE.Mesh;
    private directionIndicator: THREE.Mesh;
    private scene: THREE.Scene;

    private mixer?: THREE.AnimationMixer;
    private actionRun?: THREE.AnimationAction;

    constructor(scene: THREE.Scene, x: number, y: number, type: HeroType = 'human') {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.heroType = type;

        // Apply Hero scaling
        if (type === 'knight') {
            this.maxHp = 150;
            this.hp = 150;
            this.defense = 5;
            this.attackDamage = 15;
            this.moveSpeed = 160;
            this.attackSpeed = 0.8;
        } else if (type === 'archer') {
            this.maxHp = 80;
            this.hp = 80;
            this.moveSpeed = 240;
            this.attackSpeed = 1.3;
        }

        const geometry = new THREE.SphereGeometry(this.radius, 32, 32);
        const material = new THREE.MeshStandardMaterial({ color: 0x4a90e2 });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(this.x, this.radius, this.y);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);

        // Add visual indicator of direction (a "nose")
        const dirGeo = new THREE.BoxGeometry(8, 8, 20);
        const dirMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
        this.directionIndicator = new THREE.Mesh(dirGeo, dirMat);
        // Position it "in front" of the sphere on the Z axis
        this.directionIndicator.position.set(0, 0, this.radius);
        this.mesh.add(this.directionIndicator);

        if (this.heroType === 'archer') {
            material.visible = false;
            this.directionIndicator.visible = false;

            const archerData = AssetManager.getArcherModel();

            // Adjust to the player bounds
            archerData.model.position.y = -this.radius;

            if (archerData.mixer && archerData.actionRun) {
                this.mixer = archerData.mixer;
                this.actionRun = archerData.actionRun;
            }

            this.mesh.add(archerData.model);
        }
    }

    public update(dt: number, moveVector: { x: number; y: number }, timeSeconds: number, enemies: Enemy[], addProjectile: (p: any) => void, scene: THREE.Scene) {
        const mat = this.mesh.material as THREE.MeshStandardMaterial;

        if (this.iFrameTimer > 0) {
            this.iFrameTimer -= dt;
            mat.opacity = 0.5;
            mat.transparent = true;
        } else {
            mat.opacity = 1.0;
        }

        // Movement
        this.x += moveVector.x * this.moveSpeed * dt;
        this.y += moveVector.y * this.moveSpeed * dt;

        if (moveVector.x !== 0 || moveVector.y !== 0) {
            this.facingAngle = Math.atan2(moveVector.y, moveVector.x);
        }

        // Sync 3D Mesh position and rotation (yaw)
        this.mesh.position.set(this.x, this.radius, this.y);
        this.mesh.rotation.y = -this.facingAngle + Math.PI / 2; // Offset for atan2 Z-axis correlation

        if (this.mixer) {
            this.mixer.update(dt);
        }

        // Handle animation state
        if (this.actionRun) {
            const isMoving = moveVector.x !== 0 || moveVector.y !== 0;
            this.actionRun.setEffectiveWeight(isMoving ? 1 : 0);
        }

        // Handle Weapon Attacks
        if (this.weapons.length > 0) {
            for (const w of this.weapons) {
                w.tryAttack(dt, timeSeconds, this, enemies, addProjectile, scene);
            }
        } else {
            // Base attack fallback if no weapons
            if (timeSeconds - this.lastAttackTime >= 1 / this.attackSpeed) {
                this.baseAutoAttack(enemies);
                this.lastAttackTime = timeSeconds;
            }
        }
    }

    // Fallback if no weapons
    private baseAutoAttack(enemies: Enemy[]) {
        let closestDist = Infinity;
        let target: Enemy | null = null;

        for (const enemy of enemies) {
            const dx = enemy.x - this.x;
            const dy = enemy.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < closestDist && dist <= this.attackRange) {
                closestDist = dist;
                target = enemy;
            }
        }

        if (target) {
            target.hp -= this.attackDamage;
        }
    }

    public addWeapon(newWeapon: Weapon) {
        if (this.weapons.length < this.maxWeapons) {
            this.weapons.push(newWeapon);
        } else {
            this.weapons[0] = newWeapon;
        }
    }

    public addXp(amount: number) {
        this.xp += amount;
        if (this.xp >= this.xpToNextLevel) {
            this.levelUp();
        }
    }

    public addCoins(amount: number) {
        this.coins += amount;
        this.coinsEarned += amount;
    }

    private levelUp() {
        this.xp -= this.xpToNextLevel;
        this.level++;
        this.xpToNextLevel = Math.floor(this.xpToNextLevel * 1.5);
        this.hp = this.maxHp;

        if (this.onLevelUp) {
            this.onLevelUp();
        }
    }
}

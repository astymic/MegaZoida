import * as THREE from 'three';
import { Enemy } from './Enemy';
import { Weapon } from './weapons/Weapon';

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

    public moveSpeed: number = 200; // pixels per second
    public attackSpeed: number = 1.0; // attacks per second
    public attackDamage: number = 10;
    public attackRange: number = 150;
    public defense: number = 0;

    public weapons: Weapon[] = [];
    public maxWeapons: number = 6;

    // State
    private lastAttackTime: number = 0;
    public onLevelUp?: () => void;
    public facingAngle: number = 0;
    public iFrameTimer: number = 0;

    // 3D Rendering
    public mesh: THREE.Mesh;
    private scene: THREE.Scene;

    constructor(scene: THREE.Scene, x: number, y: number) {
        this.scene = scene;
        this.x = x;
        this.y = y;

        const geometry = new THREE.SphereGeometry(this.radius, 32, 32);
        const material = new THREE.MeshStandardMaterial({ color: 0x4a90e2 });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(this.x, this.radius, this.y);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);
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

        // Sync 3D Mesh
        this.mesh.position.set(this.x, this.radius, this.y);

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

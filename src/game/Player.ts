import * as THREE from 'three';
import { Enemy } from './Enemy';
import { Weapon } from './weapons/Weapon';
import { AssetManager } from './AssetManager';

export type HeroType = 'human' | 'knight' | 'archer';

// How many world-units the character's feet travel in one full walk cycle.
// Derived from the model: leg length ≈ radius*2, stride ≈ leg_length * 1.5
// This matches the Blender script where legs swing ±0.87 rad over 20 frames.
// Formula: stride = 2 * leg_length * sin(swing_angle) ≈ 2 * 40 * sin(0.87) ≈ 62
// But because the camera is top-down and we want visual match, empirical ≈ 80.
// Change this ONE value if feet still slide: increase = slower leg animation.
const STRIDE_LENGTH = 80; // world units per full walk cycle

export class Player {
    public x: number;
    public y: number;
    public radius: number = 20;

    public maxHp: number = 100;
    public hp: number = 100;
    public maxMana: number = 50;
    public mana: number = 50;
    public level: number = 1;
    public xp: number = 0;
    public xpToNextLevel: number = 10;
    public coins: number = 0;

    public enemiesKilled: number = 0;
    public coinsEarned: number = 0;

    public moveSpeed: number = 200;
    public attackSpeed: number = 1.0;
    public attackDamage: number = 10;
    public attackRange: number = 150;
    public defense: number = 0;

    public weapons: Weapon[] = [];
    public maxWeapons: number = 6;
    public heroType: HeroType;

    private lastAttackTime: number = 0;
    public onLevelUp?: () => void;
    public facingAngle: number = 0;
    public iFrameTimer: number = 0;

    public mesh: THREE.Mesh;
    private directionIndicator: THREE.Mesh;
    private scene: THREE.Scene;

    private mixer?: THREE.AnimationMixer;
    private actionWalk?: THREE.AnimationAction;
    private actionIdle?: THREE.AnimationAction;
    private walkClipDuration: number = 40 / 24;
    private walkWeight: number = 0;

    constructor(scene: THREE.Scene, x: number, y: number, type: HeroType = 'human') {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.heroType = type;

        if (type === 'knight') {
            this.maxHp = 150; this.hp = 150;
            this.defense = 5; this.attackDamage = 15;
            this.moveSpeed = 160; this.attackSpeed = 0.8; this.radius = 22;
        } else if (type === 'archer') {
            this.maxHp = 80; this.hp = 80;
            this.moveSpeed = 240; this.attackSpeed = 1.3; this.radius = 18;
        } else {
            this.radius = 19;
        }

        const geometry = new THREE.SphereGeometry(this.radius, 32, 32);
        const material = new THREE.MeshStandardMaterial({ color: 0x4a90e2 });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(this.x, this.radius, this.y);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);

        const dirGeo = new THREE.BoxGeometry(8, 8, 20);
        const dirMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
        this.directionIndicator = new THREE.Mesh(dirGeo, dirMat);
        this.directionIndicator.position.set(0, 0, this.radius);
        this.mesh.add(this.directionIndicator);

        material.visible = false;
        this.directionIndicator.visible = false;

        const heroData = AssetManager.getModel(this.heroType);
        heroData.model.position.y = -this.radius;
        this.walkClipDuration = heroData.walkClipDuration;

        if (heroData.mixer) {
            this.mixer = heroData.mixer;
            this.actionWalk = heroData.actionWalk;
            this.actionIdle = heroData.actionIdle;
        }

        this.mesh.add(heroData.model);
    }

    public update(
        dt: number,
        moveVector: { x: number; y: number },
        timeSeconds: number,
        enemies: Enemy[],
        addProjectile: (p: any) => void,
        scene: THREE.Scene
    ) {
        const mat = this.mesh.material as THREE.MeshStandardMaterial;
        if (this.iFrameTimer > 0) {
            this.iFrameTimer -= dt;
            mat.opacity = 0.5;
            mat.transparent = true;
        } else {
            mat.opacity = 1.0;
        }

        const isMoving = moveVector.x !== 0 || moveVector.y !== 0;
        this.x += moveVector.x * this.moveSpeed * dt;
        this.y += moveVector.y * this.moveSpeed * dt;

        if (isMoving) {
            this.facingAngle = Math.atan2(moveVector.y, moveVector.x);
        }

        this.mesh.position.set(this.x, this.radius, this.y);
        this.mesh.rotation.y = -this.facingAngle + Math.PI / 2;

        if (this.mixer) this.mixer.update(dt);

        if (this.actionWalk && this.actionIdle) {
            // Smooth blend (0.1 s ramp)
            const targetWeight = isMoving ? 1 : 0;
            this.walkWeight += (targetWeight - this.walkWeight) * Math.min(1, dt * 10);
            this.actionWalk.setEffectiveWeight(this.walkWeight);
            this.actionIdle.setEffectiveWeight(1 - this.walkWeight);

            // EXACT timeScale so one animation cycle covers exactly STRIDE_LENGTH units:
            //   cycles/second = moveSpeed / STRIDE_LENGTH
            //   timeScale     = cycles/second * clipDuration
            //                 = (moveSpeed / STRIDE_LENGTH) * walkClipDuration
            // This means the animation plays faster when the character moves faster,
            // and the feet stay locked to the ground.
            this.actionWalk.timeScale =
                (this.moveSpeed / STRIDE_LENGTH) * this.walkClipDuration;
        }

        if (this.weapons.length > 0) {
            for (const w of this.weapons) {
                w.tryAttack(dt, timeSeconds, this, enemies, addProjectile, scene);
            }
        } else {
            if (timeSeconds - this.lastAttackTime >= 1 / this.attackSpeed) {
                this.baseAutoAttack(enemies);
                this.lastAttackTime = timeSeconds;
            }
        }
    }

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
        if (target) target.hp -= this.attackDamage;
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
        if (this.xp >= this.xpToNextLevel) this.levelUp();
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
        if (this.onLevelUp) this.onLevelUp();
    }
}

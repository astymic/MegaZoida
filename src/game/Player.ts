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
    public attackRange: number = 150; // simple melee/ranged distance for base attack
    public defense: number = 0;

    public weapons: Weapon[] = [];
    public maxWeapons: number = 6;

    // State
    private lastAttackTime: number = 0;
    public onLevelUp?: () => void;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    public update(dt: number, moveVector: { x: number; y: number }, timeSeconds: number, enemies: Enemy[], addProjectile: (p: any) => void) {
        // Movement
        this.x += moveVector.x * this.moveSpeed * dt;
        this.y += moveVector.y * this.moveSpeed * dt;

        // Handle Weapon Attacks
        if (this.weapons.length > 0) {
            for (const w of this.weapons) {
                w.tryAttack(dt, timeSeconds, this, enemies, addProjectile);
            }
        } else {
            // Base attack fallback if no weapons
            if (timeSeconds - this.lastAttackTime >= 1 / this.attackSpeed) {
                this.baseAutoAttack(enemies);
                this.lastAttackTime = timeSeconds;
            }
        }
    }

    public draw(ctx: CanvasRenderingContext2D) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#4a90e2'; // Blue hero
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw HP bar
        const barWidth = 40;
        const barHeight = 5;
        ctx.fillStyle = '#333';
        ctx.fillRect(this.x - barWidth / 2, this.y - this.radius - 12, barWidth, barHeight);
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(this.x - barWidth / 2, this.y - this.radius - 12, barWidth * (Math.max(0, this.hp) / this.maxHp), barHeight);

        // Draw XP bar below the character
        ctx.fillStyle = '#333';
        ctx.fillRect(this.x - barWidth / 2, this.y + this.radius + 5, barWidth, 3);
        ctx.fillStyle = '#00ffcc';
        ctx.fillRect(this.x - barWidth / 2, this.y + this.radius + 5, barWidth * (this.xp / this.xpToNextLevel), 3);
    }

    // Fallback if no weapons
    private baseAutoAttack(enemies: Enemy[]) {
        // Find closest enemy
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
            // Deal damage
            target.hp -= this.attackDamage;
            // In a more complex version, spawn a projectile or slash animation here
        }
    }

    public addWeapon(newWeapon: Weapon) {
        // Very simple add logic for now, later we do the "Replace if full" logic
        if (this.weapons.length < this.maxWeapons) {
            this.weapons.push(newWeapon);
        } else {
            // Replace oldest/weakest
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
        this.level++;
        this.xp -= this.xpToNextLevel;
        this.xpToNextLevel = Math.floor(this.xpToNextLevel * 1.5); // Exponential growth

        // Heal some HP on level up
        this.hp = Math.min(this.maxHp, this.hp + 20);

        // Trigger UI Buff Selection
        if (this.onLevelUp) {
            this.onLevelUp();
        }
    }
}

import { Player } from './Player';

export class Enemy {
    public x: number;
    public y: number;
    public radius: number = 15;

    public maxHp: number;
    public hp: number;
    public speed: number; // Slower than player
    public damage: number;
    public xpYield: number;

    public isBoss: boolean;
    public color: string = '#e74c3c';

    constructor(x: number, y: number, level: number = 1, isBoss: boolean = false) {
        this.x = x;
        this.y = y;
        this.isBoss = isBoss;

        // Base stats
        this.radius = 15;
        this.speed = 120;
        this.damage = 5;
        this.xpYield = 5;

        // Scale stats based on "level" or game time
        this.maxHp = 20 * Math.pow(1.2, level - 1);
        this.damage *= Math.pow(1.1, level - 1); // Apply level scaling to base damage

        if (this.isBoss) {
            this.radius = 40;
            this.maxHp *= 15;
            this.damage *= 3;
            this.speed = 100;
            this.xpYield = 100;
            this.color = '#8e44ad'; // Purple boss
        }

        this.hp = this.maxHp;
    }

    public update(dt: number, player: Player) {
        // Vector to player
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
            // Normalize and move
            this.x += (dx / dist) * this.speed * dt;
            this.y += (dy / dist) * this.speed * dt;
        }
    }

    public draw(ctx: CanvasRenderingContext2D) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color; // Red mob
        ctx.fill();
        ctx.strokeStyle = '#c0392b';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Small HP Bar
        if (this.hp < this.maxHp) {
            const barWidth = 24;
            const barHeight = 4;
            ctx.fillStyle = '#333';
            ctx.fillRect(this.x - barWidth / 2, this.y - this.radius - 8, barWidth, barHeight);
            ctx.fillStyle = '#2ecc71';
            ctx.fillRect(this.x - barWidth / 2, this.y - this.radius - 8, barWidth * (this.hp / this.maxHp), barHeight);
        }
    }
}

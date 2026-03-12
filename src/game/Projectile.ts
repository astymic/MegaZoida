export class Projectile {
    public x: number;
    public y: number;
    public vx: number;
    public vy: number;
    public damage: number;
    public radius: number = 4;
    public pierce: number = 0; // Number of enemies it can pierce
    public color: string = '#fff';
    private timeAlive: number = 0;
    public maxLifeTime: number = 2.0;

    constructor(x: number, y: number, vx: number, vy: number, damage: number, color: string = '#fff') {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.damage = damage;
        this.color = color;
    }

    public update(dt: number): boolean {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.timeAlive += dt;
        return this.timeAlive < this.maxLifeTime; // Return false to indicate death
    }

    public draw(ctx: CanvasRenderingContext2D) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
    }
}

export class ExpDrop {
    public x: number;
    public y: number;
    public amount: number;
    public radius: number = 5;
    private timeAlive: number = 0;

    constructor(x: number, y: number, amount: number) {
        this.x = x;
        this.y = y;
        this.amount = amount;
    }

    public update(dt: number) {
        this.timeAlive += dt;
    }

    public draw(ctx: CanvasRenderingContext2D) {
        ctx.beginPath();
        // slight bobbing animation
        const yOffset = Math.sin(this.timeAlive * 5) * 3;
        ctx.arc(this.x, this.y + yOffset, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#00ffcc'; // Cyan exp drops
        ctx.fill();
        ctx.strokeStyle = '#00b38f';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

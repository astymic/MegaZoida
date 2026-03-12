export class CoinDrop {
    public x: number;
    public y: number;
    public amount: number;
    public radius: number = 6;
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
        const yOffset = Math.sin(this.timeAlive * 8) * 4;
        ctx.arc(this.x, this.y + yOffset, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#f1c40f'; // Gold / Yellow
        ctx.fill();
        ctx.strokeStyle = '#f39c12';
        ctx.lineWidth = 1;
        ctx.stroke();

        // inner circle to look like a coin
        ctx.beginPath();
        ctx.arc(this.x, this.y + yOffset, this.radius * 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = '#e67e22';
        ctx.stroke();
    }
}

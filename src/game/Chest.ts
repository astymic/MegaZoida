export class Chest {
    public x: number;
    public y: number;
    public radius: number = 20; // Hitbox radius
    public cost: number = 10; // Costs 10 coins to open by default

    constructor(x: number, y: number, cost: number = 10) {
        this.x = x;
        this.y = y;
        this.cost = cost;
    }

    public draw(ctx: CanvasRenderingContext2D) {
        const width = 30;
        const height = 25;

        ctx.fillStyle = '#8e44ad'; // Purple chest
        ctx.fillRect(this.x - width / 2, this.y - height / 2, width, height);

        // Draw lock
        ctx.fillStyle = '#f1c40f';
        ctx.fillRect(this.x - 4, this.y - 4, 8, 8);

        // Draw cost label above
        ctx.fillStyle = '#fff';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${this.cost} 🪙`, this.x, this.y - height / 2 - 5);
    }
}

export class InputManager {
    public keys: Record<string, boolean> = {};

    constructor() {
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        window.addEventListener('keyup', (e) => this.handleKeyUp(e));
    }

    private handleKeyDown(e: KeyboardEvent) {
        this.keys[e.code] = true;
    }

    private handleKeyUp(e: KeyboardEvent) {
        this.keys[e.code] = false;
    }

    public isKeyPressed(code: string): boolean {
        return !!this.keys[code];
    }

    // Helper for WASD or Arrows to get a normalized direction vector
    public getMovementVector(): { x: number; y: number } {
        let dx = 0;
        let dy = 0;

        if (this.isKeyPressed('KeyW') || this.isKeyPressed('ArrowUp')) dy -= 1;
        if (this.isKeyPressed('KeyS') || this.isKeyPressed('ArrowDown')) dy += 1;
        if (this.isKeyPressed('KeyA') || this.isKeyPressed('ArrowLeft')) dx -= 1;
        if (this.isKeyPressed('KeyD') || this.isKeyPressed('ArrowRight')) dx += 1;

        // Normalize
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length > 0) {
            dx /= length;
            dy /= length;
        }

        return { x: dx, y: dy };
    }
}

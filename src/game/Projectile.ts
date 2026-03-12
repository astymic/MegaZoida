import * as THREE from 'three';

export class Projectile {
    public x: number;
    public y: number;
    public vx: number;
    public vy: number;
    public damage: number;
    public radius: number = 4;
    public pierce: number = 0; // Number of enemies it can pierce
    private timeAlive: number = 0;
    public maxLifeTime: number = 2.0;

    public mesh: THREE.Mesh;
    private scene: THREE.Scene;

    constructor(scene: THREE.Scene, x: number, y: number, vx: number, vy: number, damage: number, colorHex: number = 0xffffff) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.damage = damage;

        const geometry = new THREE.SphereGeometry(this.radius, 8, 8);
        const material = new THREE.MeshBasicMaterial({ color: colorHex });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(this.x, 10, this.y); // Raised slightly
        this.scene.add(this.mesh);
    }

    public update(dt: number): boolean {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.timeAlive += dt;

        this.mesh.position.set(this.x, 10, this.y);

        return this.timeAlive < this.maxLifeTime;
    }

    public remove() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        (this.mesh.material as THREE.Material).dispose();
    }
}

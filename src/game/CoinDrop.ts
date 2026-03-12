import * as THREE from 'three';

export class CoinDrop {
    public x: number;
    public y: number;
    public amount: number;
    public radius: number = 6;
    private timeAlive: number = 0;

    public mesh: THREE.Mesh;
    private scene: THREE.Scene;

    constructor(scene: THREE.Scene, x: number, y: number, amount: number) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.amount = amount;

        const geometry = new THREE.CylinderGeometry(this.radius, this.radius, 2, 16);
        const material = new THREE.MeshStandardMaterial({ color: 0xf1c40f, metalness: 0.8, roughness: 0.2 });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(this.x, this.radius, this.y);
        this.mesh.rotation.x = Math.PI / 2;
        this.scene.add(this.mesh);
    }

    public update(dt: number) {
        this.timeAlive += dt;
        // Spinning coin
        this.mesh.position.set(this.x, this.radius + Math.sin(this.timeAlive * 8) * 4, this.y);
        this.mesh.rotation.z += dt * 3;
    }

    public remove() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        (this.mesh.material as THREE.Material).dispose();
    }
}

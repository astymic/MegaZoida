import * as THREE from 'three';

export class Chest {
    public x: number;
    public y: number;
    public radius: number = 20; // Hitbox radius
    public cost: number = 10;

    public mesh: THREE.Mesh;
    private scene: THREE.Scene;

    constructor(scene: THREE.Scene, x: number, y: number, cost: number = 10) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.cost = cost;

        const geometry = new THREE.BoxGeometry(30, 25, 20);
        const material = new THREE.MeshStandardMaterial({ color: 0x8e44ad });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(this.x, 12.5, this.y);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);
    }

    public remove() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        (this.mesh.material as THREE.Material).dispose();
    }
}

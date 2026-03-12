import * as THREE from 'three';

export class ExpDrop {
    public x: number;
    public y: number;
    public amount: number;
    public radius: number = 8;
    private timeAlive: number = 0;

    public mesh: THREE.Mesh;
    private scene: THREE.Scene;

    constructor(scene: THREE.Scene, x: number, y: number, amount: number) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.amount = amount;

        const geometry = new THREE.OctahedronGeometry(this.radius);
        const material = new THREE.MeshStandardMaterial({ color: 0x2ecc71, emissive: 0x117733 });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(this.x, this.radius, this.y);
        this.scene.add(this.mesh);
    }

    public update(dt: number) {
        this.timeAlive += dt;
        this.mesh.position.set(this.x, this.radius + Math.sin(this.timeAlive * 5) * 5, this.y);
        this.mesh.rotation.y += dt;
    }

    public remove() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        (this.mesh.material as THREE.Material).dispose();
    }
}

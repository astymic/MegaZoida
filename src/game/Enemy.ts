import * as THREE from 'three';
import { Player } from './Player';

export class Enemy {
    public x: number;
    public y: number;
    public radius: number;

    public maxHp: number;
    public hp: number;
    public speed: number;
    public damage: number;
    public xpYield: number;

    public isBoss: boolean;
    public color: string = '#e74c3c';

    // 3D Rendering
    public mesh: THREE.Mesh;
    private scene: THREE.Scene;

    constructor(scene: THREE.Scene, x: number, y: number, level: number = 1, isBoss: boolean = false) {
        this.scene = scene;
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
        this.damage *= Math.pow(1.1, level - 1);

        let matColor = 0xe74c3c;

        if (this.isBoss) {
            this.radius = 40;
            this.maxHp *= 15;
            this.damage *= 3;
            this.speed = 100;
            this.xpYield = 100;
            this.color = '#8e44ad'; // Purple boss
            matColor = 0x8e44ad;
        }

        this.hp = this.maxHp;

        // Create Mesh
        const geometry = this.isBoss ? new THREE.BoxGeometry(this.radius * 2, this.radius * 2, this.radius * 2) : new THREE.BoxGeometry(this.radius * 2, this.radius * 2, this.radius * 2);
        const material = new THREE.MeshStandardMaterial({ color: matColor });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(this.x, this.radius, this.y);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);
    }

    public update(dt: number, player: Player) {
        // Simple chasing AI
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
            this.x += (dx / dist) * this.speed * dt;
            this.y += (dy / dist) * this.speed * dt;
        }

        this.mesh.position.set(this.x, this.radius, this.y);

        // Simple rolling animation
        this.mesh.rotation.x += this.speed * dt * 0.01;
        this.mesh.rotation.z -= this.speed * dt * 0.01;
    }

    public remove() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        if (Array.isArray(this.mesh.material)) {
            this.mesh.material.forEach(m => m.dispose());
        } else {
            this.mesh.material.dispose();
        }
    }
}

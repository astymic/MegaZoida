import * as THREE from 'three';
import { Player } from './Player';
import { AssetManager } from './AssetManager';

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
    public hpGroup: THREE.Group;
    public hpBar: THREE.Mesh;
    private scene: THREE.Scene;

    public walkWeight: number = 1.0;

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
        this.maxHp = 20 * Math.pow(1.3, Math.floor((level - 1) / 5));
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

        const { model, mixer, actionWalk, actionIdle } = AssetManager.getModel('skeleton');
        model.position.set(0, -this.radius, 0);

        const scaleRatio = this.isBoss ? (this.radius / 15.0) : 1.0;
        model.scale.multiplyScalar(scaleRatio);

        this.mesh.add(model);
        material.visible = false;

        (this as any)._skeletonMixer = mixer;
        (this as any)._skeletonActionWalk = actionWalk;
        (this as any)._skeletonActionIdle = actionIdle;

        // Health Bar setup
        this.hpGroup = new THREE.Group();
        this.scene.add(this.hpGroup);

        const bgGeo = new THREE.PlaneGeometry(this.radius * 2, 4);
        const bgMat = new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false }); // Render on top
        const bgMesh = new THREE.Mesh(bgGeo, bgMat);
        bgMesh.renderOrder = 999;
        this.hpGroup.add(bgMesh);

        const hpGeo = new THREE.PlaneGeometry(this.radius * 2, 4);
        const hpMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, depthTest: false });
        this.hpBar = new THREE.Mesh(hpGeo, hpMat);
        this.hpBar.renderOrder = 1000;
        // set origin to left so it scales left-to-right
        hpGeo.translate(this.radius, 0, 0);
        this.hpBar.position.x = -this.radius;
        this.hpGroup.add(this.hpBar);
        // Initially hidden
        this.hpGroup.visible = false;
    }

    public update(dt: number, player: Player) {
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq);
        const touchDist = player.radius + this.radius;

        let isWalking = false;

        if (dist > touchDist) {
            this.x += (dx / dist) * this.speed * dt;
            this.y += (dy / dist) * this.speed * dt;
            isWalking = true;
        }

        this.mesh.position.set(this.x, this.radius, this.y);

        if ((this as any)._skeletonMixer) {
            (this as any)._skeletonMixer.update(dt);
        }

        const aWalk = (this as any)._skeletonActionWalk;
        const aIdle = (this as any)._skeletonActionIdle;
        if (aWalk && aIdle) {
            if (isWalking) {
                this.walkWeight = Math.min(1.0, this.walkWeight + dt / 0.1);
            } else {
                this.walkWeight = Math.max(0.0, this.walkWeight - dt / 0.1);
            }
            aWalk.setEffectiveWeight(this.walkWeight);
            aIdle.setEffectiveWeight(1.0 - this.walkWeight);
        }

        if (dist > 0) {
            this.mesh.rotation.y = Math.atan2(dx, dy);
        }

        if (this.hp < this.maxHp && this.hp > 0) {
            this.hpGroup.visible = true;
            this.hpGroup.position.set(this.x, this.mesh.position.y + this.radius + 10, this.y);
            this.hpGroup.rotation.x = -Math.PI / 4;
            this.hpBar.scale.x = Math.max(0, this.hp / this.maxHp);
        } else {
            this.hpGroup.visible = false;
        }
    }

    public remove() {
        this.scene.remove(this.hpGroup);
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        if (Array.isArray(this.mesh.material)) {
            this.mesh.material.forEach(m => m.dispose());
        } else {
            this.mesh.material.dispose();
        }
    }
}

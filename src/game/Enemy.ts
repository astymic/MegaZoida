import * as THREE from 'three';
import { Player } from './Player';
import { AssetManager } from './AssetManager';

const STRIDE_LENGTH = 80;

export class Enemy {
    public x: number = 0;
    public y: number = 0;
    public radius: number = 15;

    public maxHp: number = 20;
    public hp: number = 20;
    public speed: number = 120;
    public damage: number = 5;
    public xpYield: number = 5;

    public isBoss: boolean = false;
    public color: string = '#e74c3c';

    public mesh: THREE.Mesh;
    public hpGroup: THREE.Group;
    public hpBar: THREE.Mesh;
    private scene: THREE.Scene;

    private mixer?: THREE.AnimationMixer;
    private actionWalk?: THREE.AnimationAction;
    private actionIdle?: THREE.AnimationAction;
    private walkClipDuration: number = 40 / 24;
    private walkWeight: number = 0;

    // Soft-push accumulator for grid collisions
    public pushX: number = 0;
    public pushY: number = 0;

    constructor(scene: THREE.Scene) {
        this.scene = scene;

        const geometry = new THREE.BoxGeometry(30, 30, 30);
        const material = new THREE.MeshStandardMaterial({ color: 0xe74c3c });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);

        const { model, mixer, actionWalk, actionIdle, walkClipDuration } = AssetManager.getModel('skeleton');
        model.position.set(0, -15, 0);
        this.mesh.add(model);
        material.visible = false;

        this.walkClipDuration = walkClipDuration;
        if (mixer) {
            this.mixer = mixer;
            this.actionWalk = actionWalk;
            this.actionIdle = actionIdle;
        }

        // HP bar
        this.hpGroup = new THREE.Group();
        this.scene.add(this.hpGroup);

        const bgGeo = new THREE.PlaneGeometry(30, 4);
        const bgMat = new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false });
        const bgMesh = new THREE.Mesh(bgGeo, bgMat);
        bgMesh.renderOrder = 999;
        this.hpGroup.add(bgMesh);

        const hpGeo = new THREE.PlaneGeometry(30, 4);
        const hpMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, depthTest: false });
        this.hpBar = new THREE.Mesh(hpGeo, hpMat);
        this.hpBar.renderOrder = 1000;
        hpGeo.translate(15, 0, 0);
        this.hpBar.position.x = -15;
        this.hpGroup.add(this.hpBar);
        this.hpGroup.visible = false;

        this.mesh.visible = false;
    }

    public spawn(x: number, y: number, level: number, isBoss: boolean) {
        this.x = x;
        this.y = y;
        this.isBoss = isBoss;

        this.radius = isBoss ? 40 : 15;
        this.speed = isBoss ? 100 : 120;
        this.damage = 5 * Math.pow(1.1, level - 1);
        this.xpYield = isBoss ? 100 : 5;
        this.maxHp = 20 * Math.pow(1.3, Math.floor((level - 1) / 5));

        if (isBoss) {
            this.maxHp *= 15;
            this.damage *= 3;
            (this.mesh.material as THREE.MeshStandardMaterial).color.setHex(0x8e44ad);
        } else {
            (this.mesh.material as THREE.MeshStandardMaterial).color.setHex(0xe74c3c);
        }

        this.hp = this.maxHp;

        const s = this.radius / 15.0;
        this.mesh.scale.setScalar(s);
        this.hpGroup.scale.setScalar(s);

        this.mesh.position.set(this.x, this.radius, this.y);

        this.mesh.visible = true;
        this.hpGroup.visible = false;

        this.pushX = 0;
        this.pushY = 0;
        this.walkWeight = 0;
        if (this.actionWalk) this.actionWalk.setEffectiveWeight(0);
        if (this.actionIdle) this.actionIdle.setEffectiveWeight(1);
    }

    public despawn() {
        this.mesh.visible = false;
        this.hpGroup.visible = false;
    }

    public update(dt: number, player: Player, cameraPos: THREE.Vector3) {
        if (!this.mesh.visible) return;

        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const touchDist = player.radius + this.radius;

        let isWalking = false;
        if (dist > touchDist) {
            this.x += (dx / dist) * this.speed * dt;
            this.y += (dy / dist) * this.speed * dt;
            isWalking = true;
        }

        this.x += this.pushX;
        this.y += this.pushY;
        this.pushX = 0;
        this.pushY = 0;

        this.mesh.position.set(this.x, this.radius, this.y);
        if (dist > 0) this.mesh.rotation.y = Math.atan2(dx, dy);

        // Animation LOD
        const distToCamSq = (this.x - cameraPos.x) ** 2 + (this.y - cameraPos.z) ** 2;

        if (distToCamSq > 400000) {
            // Too far — skip animation update
        } else {
            if (this.mixer) {
                if (distToCamSq > 90000) { // ~300 units
                    this.mixer.update(dt * 0.5); // Throttled animation
                } else {
                    this.mixer.update(dt);
                }
            }

            if (this.actionWalk && this.actionIdle) {
                const targetWeight = isWalking ? 1 : 0;
                this.walkWeight += (targetWeight - this.walkWeight) * Math.min(1, dt * 10);
                this.actionWalk.setEffectiveWeight(this.walkWeight);
                this.actionIdle.setEffectiveWeight(1 - this.walkWeight);
                this.actionWalk.timeScale = (this.speed / STRIDE_LENGTH) * this.walkClipDuration;
            }
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
}

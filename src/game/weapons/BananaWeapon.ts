import { Weapon } from './Weapon';
import { Player } from '../Player';
import { Enemy } from '../Enemy';

export class BananaWeapon extends Weapon {
    private bananaAngle: number = 0;
    private bananaMesh: import('three').Mesh | null = null;

    constructor() {
        super({
            id: 'banana',
            name: 'Банан (Banana)',
            type: 'melee',
            damageMult: 1.2,
            speedMult: 1.0,
            range: 120,
            icon: '🍌'
        });
    }

    /** Lazily create the 3D banana visual on first attack call */
    private ensureMesh(scene: any) {
        if (this.bananaMesh || !scene) return;
        const THREE = (window as any).THREE ?? null;
        if (!THREE) return;
        const geo = new THREE.CylinderGeometry(2, 2, 28, 8);
        const mat = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.5 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.z = Math.PI / 4;
        scene.add(mesh);
        this.bananaMesh = mesh;
    }

    protected attack(_timeSeconds: number, player: Player, enemies: Enemy[], _addProjectile: (p: any) => void, scene: any): boolean {
        this.ensureMesh(scene);

        // Find closest enemy in range
        let closestDist = Infinity;
        let target: Enemy | null = null;
        for (const enemy of enemies) {
            const dx = enemy.x - player.x;
            const dy = enemy.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < closestDist && dist <= this.data.range) {
                closestDist = dist;
                target = enemy;
            }
        }

        if (target) {
            target.hp -= player.attackDamage * this.data.damageMult;
            return true;
        }
        return false;
    }

    // Called each frame by tryAttack — orbit banana around player
    public override tryAttack(dt: number, timeSeconds: number, player: Player, enemies: Enemy[], addProjectile: (p: any) => void, scene: any): boolean {
        // Update visual orbit each frame regardless of attack cooldown
        if (this.bananaMesh) {
            this.bananaAngle += dt * 3;
            this.bananaMesh.position.x = player.mesh.position.x + Math.cos(this.bananaAngle) * 38;
            this.bananaMesh.position.y = player.mesh.position.y + 10;
            this.bananaMesh.position.z = player.mesh.position.z + Math.sin(this.bananaAngle) * 38;
            this.bananaMesh.rotation.y += dt * 5;
        }
        return super.tryAttack(dt, timeSeconds, player, enemies, addProjectile, scene);
    }
}

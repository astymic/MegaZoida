// SwordWeapon: Knight's starting weapon — re-export BasicSword with a visual mesh
import { Weapon } from './Weapon';
import { Player } from '../Player';
import { Enemy } from '../Enemy';

export class SwordWeapon extends Weapon {
    private swordMesh: import('three').Mesh | null = null;
    private swordAngle: number = 0;

    constructor() {
        super({
            id: 'knight_sword',
            name: 'Меч (Sword)',
            type: 'melee',
            damageMult: 1.5,
            speedMult: 0.8,
            range: 160,
            icon: '⚔️'
        });
    }

    private ensureMesh(scene: any) {
        if (this.swordMesh || !scene) return;
        const THREE = (window as any).THREE ?? null;
        if (!THREE) return;
        const blade = new THREE.BoxGeometry(4, 55, 4);
        const mat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.9, roughness: 0.2 });
        this.swordMesh = new THREE.Mesh(blade, mat);
        scene.add(this.swordMesh);
    }

    protected attack(_timeSeconds: number, player: Player, enemies: Enemy[], _addProjectile: (p: any) => void, _scene: any): boolean {
        let hit = false;
        const damage = player.attackDamage * this.data.damageMult;

        for (const enemy of enemies) {
            const dx = enemy.x - player.x;
            const dy = enemy.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= this.data.range) {
                const enemyAngle = Math.atan2(dy, dx);
                let diff = Math.abs(enemyAngle - player.facingAngle);
                if (diff > Math.PI) diff = 2 * Math.PI - diff;
                if (diff <= Math.PI / 3) {
                    enemy.hp -= damage;
                    hit = true;
                }
            }
        }
        return hit;
    }

    public override tryAttack(dt: number, timeSeconds: number, player: Player, enemies: Enemy[], addProjectile: (p: any) => void, scene: any): boolean {
        this.ensureMesh(scene);
        if (this.swordMesh) {
            this.swordAngle += dt * 2.5;
            this.swordMesh.position.x = player.mesh.position.x + Math.cos(this.swordAngle) * 45;
            this.swordMesh.position.y = player.mesh.position.y + 15;
            this.swordMesh.position.z = player.mesh.position.z + Math.sin(this.swordAngle) * 45;
            this.swordMesh.rotation.set(this.swordAngle, this.swordAngle * 0.5, 0);
        }
        return super.tryAttack(dt, timeSeconds, player, enemies, addProjectile, scene);
    }
}

import { Weapon } from './Weapon';
import { Player } from '../Player';
import { Enemy } from '../Enemy';
import { Projectile } from '../Projectile';

export class Bow extends Weapon {
    constructor() {
        super({
            id: 'bow',
            name: 'Лук (Bow)',
            type: 'projectile',
            damageMult: 0.8,
            speedMult: 1.5,
            range: 400,
            icon: '🏹'
        });
    }

    protected attack(_timeSeconds: number, player: Player, enemies: Enemy[], addProjectile: (p: Projectile) => void, scene: any): boolean {
        let closestDist = Infinity;
        let target: Enemy | null = null;

        const actualRange = this.data.range;

        for (const enemy of enemies) {
            const dx = enemy.x - player.x;
            const dy = enemy.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < closestDist && dist <= actualRange) {
                closestDist = dist;
                target = enemy;
            }
        }

        if (target) {
            const dx = target.x - player.x;
            const dy = target.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            const speed = 400; // Projectile speed
            const vx = (dx / dist) * speed;
            const vy = (dy / dist) * speed;

            const damage = player.attackDamage * this.data.damageMult;

            // Spawn projectile
            const proj = new Projectile(scene, player.x, player.y, vx, vy, damage, 0xbdc3c7);
            addProjectile(proj);

            return true;
        }

        return false;
    }
}

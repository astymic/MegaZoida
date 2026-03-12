import { Weapon } from './Weapon';
import { Player } from '../Player';
import { Enemy } from '../Enemy';
import { Projectile } from '../Projectile';

export class Staff extends Weapon {
    constructor() {
        super({
            id: 'staff',
            name: 'Посох (Staff)',
            type: 'magic',
            damageMult: 1.5,
            speedMult: 0.7,
            range: 300,
            icon: '🪄'
        });
    }

    protected attack(_timeSeconds: number, player: Player, enemies: Enemy[], addProjectile: (p: Projectile) => void): boolean {
        // Fire in a random direction or at multiple enemies
        // Let's fire a slow, piercing magic orb towards the closest enemy
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

            const speed = 150; // Slow orb
            const vx = (dx / dist) * speed;
            const vy = (dy / dist) * speed;

            const damage = player.attackDamage * this.data.damageMult;

            const proj = new Projectile(player.x, player.y, vx, vy, damage, '#9b59b6');
            proj.radius = 8;
            proj.pierce = 2; // Can hit 3 enemies total (pierce 2 means it survives 2 hits)

            addProjectile(proj);
            return true;
        }
        return false;
    }
}

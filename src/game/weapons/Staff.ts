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

    protected attack(_timeSeconds: number, player: Player, enemies: Enemy[], addProjectile: (p: Projectile) => void, scene: any): boolean {
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
            const targetAngle = Math.atan2(dy, dx);

            const speed = 800; // was 150
            const vx = (Math.cos(targetAngle) * speed);
            const vy = (Math.sin(targetAngle) * speed);

            const damage = player.attackDamage * this.data.damageMult;

            const proj = new Projectile(scene, player.x, player.y, vx, vy, damage, 0x9b59b6);
            proj.radius = 8;
            proj.pierce = 0;
            proj.maxLifeTime = 1.0;

            addProjectile(proj);
            return true;
        }
        return false;
    }
}

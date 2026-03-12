import { Weapon } from './Weapon';
import { Player } from '../Player';
import { Enemy } from '../Enemy';

export class BasicSword extends Weapon {
    constructor() {
        super({
            id: 'sword',
            name: 'Меч (Sword)',
            type: 'melee',
            damageMult: 1.0,
            speedMult: 1.0,
            range: 150,
            icon: '⚔️'
        });
    }

    protected attack(_timeSeconds: number, player: Player, enemies: Enemy[], _addProjectile: (p: any) => void): boolean {
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
            // Deal damage
            target.hp -= player.attackDamage * this.data.damageMult;
            return true; // We successfully attacked
        }

        return false; // Did not attack
    }
}

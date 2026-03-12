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

    protected attack(_timeSeconds: number, player: Player, enemies: Enemy[], _addProjectile: (p: any) => void, _scene: any): boolean {
        let hitCount = 0;
        const damage = player.attackDamage * this.data.damageMult;

        // Splash damage in front of the player (90 degree cone, max 100 range)
        for (const enemy of enemies) {
            const dx = enemy.x - player.x;
            const dy = enemy.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= 100) {
                const enemyAngle = Math.atan2(dy, dx);
                let angleDiff = Math.abs(enemyAngle - player.facingAngle);
                if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

                if (angleDiff <= Math.PI / 4) { // 45 degrees each side
                    enemy.hp -= damage;
                    hitCount++;
                }
            }
        }

        return hitCount > 0;
    }
}

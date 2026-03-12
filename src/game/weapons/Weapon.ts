import { Player } from '../Player';
import { Enemy } from '../Enemy';

export interface WeaponData {
    id: string;
    name: string;
    type: 'melee' | 'projectile' | 'magic';
    damageMult: number;     // Multiplies player base damage
    speedMult: number;      // Multiplies player base attack speed
    range: number;
    icon: string;
}

export abstract class Weapon {
    public data: WeaponData;
    protected lastAttackTime: number = 0;

    constructor(data: WeaponData) {
        this.data = data;
    }

    // Returns true if the weapon actually fired/attacked
    public tryAttack(_dt: number, timeSeconds: number, player: Player, enemies: Enemy[], addProjectile: (p: any) => void, scene: any): boolean {
        const cooldown = 1 / (player.attackSpeed * this.data.speedMult);
        if (timeSeconds - this.lastAttackTime >= cooldown) {
            const attacked = this.attack(timeSeconds, player, enemies, addProjectile, scene);
            if (attacked) {
                this.lastAttackTime = timeSeconds;
                return true;
            }
        }
        return false;
    }

    // To be implemented by subclasses
    // Should handle dealing damage to enemies, or creating projectiles
    protected abstract attack(timeSeconds: number, player: Player, enemies: Enemy[], addProjectile: (p: any) => void, scene: any): boolean;
}

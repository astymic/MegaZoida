/**
 * Enemy — pure logic / data class.
 *
 * NO THREE.Mesh. NO AnimationMixer. NO scene reference.
 * All GPU work is handled by EnemyRenderer via InstancedMesh.
 *
 * Pool-friendly: constructor builds defaults, spawn() re-initialises.
 */

import { Player } from './Player';

export class Enemy {
    // World position
    public x: number = 0;
    public y: number = 0;

    // Stats
    public radius: number = 15;
    public maxHp: number = 20;
    public hp: number = 20;
    public speed: number = 120;
    public damage: number = 5;
    public xpYield: number = 5;
    public isBoss: boolean = false;

    // Render data read by EnemyRenderer each frame
    public rotY: number = 0;
    public walkPhase: number = 0;
    public isWalking: boolean = false;

    // Soft-push accumulator (resolved by SpatialGrid + EnemyPool)
    public pushX: number = 0;
    public pushY: number = 0;

    // Iframe timer after hitting player
    public hitTimer: number = 0;

    /** Re-initialise from pool (avoids GC). */
    public spawn(x: number, y: number, level: number, isBoss: boolean) {
        this.x = x;
        this.y = y;
        this.isBoss = isBoss;

        this.radius = isBoss ? 40 : 15;
        this.speed = isBoss ? 100 : 120;
        this.damage = 5 * Math.pow(1.1, level - 1) * (isBoss ? 3 : 1);
        this.xpYield = isBoss ? 100 : 5;
        this.maxHp = 20 * Math.pow(1.3, Math.floor((level - 1) / 5)) * (isBoss ? 15 : 1);
        this.hp = this.maxHp;

        this.rotY = 0;
        this.walkPhase = Math.random() * Math.PI * 2; // stagger crowd
        this.isWalking = false;
        this.pushX = 0;
        this.pushY = 0;
        this.hitTimer = 0;
    }

    public update(dt: number, player: Player) {
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const stop = player.radius + this.radius;

        this.isWalking = dist > stop;

        if (this.isWalking) {
            const invDist = 1 / dist;
            this.x += dx * invDist * this.speed * dt;
            this.y += dy * invDist * this.speed * dt;

            // Advance walk phase for the GLSL shader
            this.walkPhase += dt * (this.speed / 40); // tuned for visible stride

            // Face the player
            this.rotY = Math.atan2(dx, dy);
        }

        // Apply soft-separation pushed by the spatial-grid collision resolve step
        this.x += this.pushX;
        this.y += this.pushY;
        this.pushX = 0;
        this.pushY = 0;

        if (this.hitTimer > 0) this.hitTimer -= dt;
    }
}

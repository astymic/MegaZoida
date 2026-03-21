/**
 * EntityManager — InstancedMesh pipeline edition
 *
 * Key changes vs. original:
 *  - Enemy objects have NO meshes; EnemyRenderer handles all GPU work
 *  - Object pool for enemies (zero GC pressure during gameplay)
 *  - SpatialGrid for O(n) enemy-enemy soft-separation (was O(n²))
 *  - Collision check throttled to 20/s
 */

import * as THREE from 'three';
import { Player } from './Player';
import { Enemy } from './Enemy';
import { EnemyRenderer } from './EnemyRenderer';
import { ExpDrop } from './ExpDrop';
import { CoinDrop } from './CoinDrop';
import { Chest } from './Chest';
import { Projectile } from './Projectile';
import { EnvironmentManager } from './EnvironmentManager';

// ── Spatial Grid ──────────────────────────────────────────────────────────────

class SpatialGrid {
    private cells = new Map<number, Enemy[]>();
    private readonly cellSize: number;
    private readonly invCell: number;

    constructor(cellSize = 80) {
        this.cellSize = cellSize;
        this.invCell = 1 / cellSize;
    }

    private key(x: number, y: number): number {
        const cx = Math.floor(x * this.invCell);
        const cy = Math.floor(y * this.invCell);
        return ((cx + cy) * (cx + cy + 1) >> 1) + cy;
    }

    public rebuild(enemies: Enemy[]) {
        this.cells.clear();
        for (const e of enemies) {
            const k = this.key(e.x, e.y);
            let cell = this.cells.get(k);
            if (!cell) { cell = []; this.cells.set(k, cell); }
            cell.push(e);
        }
    }

    public getNearby(x: number, y: number): Enemy[] {
        const result: Enemy[] = [];
        const cs = this.cellSize;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const cell = this.cells.get(this.key(x + dx * cs, y + dy * cs));
                if (cell) for (const e of cell) result.push(e);
            }
        }
        return result;
    }
}

// ── Enemy Pool ────────────────────────────────────────────────────────────────

class EnemyPool {
    private readonly pool: Enemy[] = [];

    public acquire(x: number, y: number, level: number, isBoss: boolean): Enemy {
        const e = this.pool.length > 0 ? this.pool.pop()! : new Enemy();
        e.spawn(x, y, level, isBoss);
        return e;
    }

    public release(e: Enemy) {
        this.pool.push(e);
    }
}

// ── EntityManager ─────────────────────────────────────────────────────────────

export class EntityManager {
    public player!: Player;
    public enemies: Enemy[] = [];
    public expDrops: ExpDrop[] = [];
    public coinDrops: CoinDrop[] = [];
    public chests: Chest[] = [];
    public projectiles: Projectile[] = [];

    private scene: THREE.Scene;
    private envManager: EnvironmentManager;
    private enemyRenderer: EnemyRenderer;
    private spatialGrid = new SpatialGrid(80);
    private enemyPool = new EnemyPool();



    constructor(scene: THREE.Scene, envManager: EnvironmentManager) {
        this.scene = scene;
        this.envManager = envManager;
        this.enemyRenderer = new EnemyRenderer(scene);
    }

    public initPlayer(heroType: 'human' | 'knight' | 'archer', onLevelUp: () => void): Player {
        this.player = new Player(this.scene, 0, 0, heroType);
        this.player.onLevelUp = onLevelUp;
        return this.player;
    }

    public spawnEnemy(x: number, y: number, level: number, isBoss = false): Enemy {
        const e = this.enemyPool.acquire(x, y, level, isBoss);
        this.enemies.push(e);
        return e;
    }

    public clear() {
        for (const e of this.enemies) this.enemyPool.release(e);
        this.enemies = [];

        this.expDrops.forEach(e => e.remove());
        this.coinDrops.forEach(c => c.remove());
        this.chests.forEach(c => c.remove());
        this.projectiles.forEach(p => p.remove());

        this.expDrops = [];
        this.coinDrops = [];
        this.chests = [];
        this.projectiles = [];

        if (this.player?.mesh) {
            this.scene.remove(this.player.mesh);
            while (this.player.mesh.children.length > 0) {
                this.player.mesh.remove(this.player.mesh.children[0]);
            }
        }

        // Reset instanced renderer counts
        this.enemyRenderer.update([]);
    }

    public update(
        dt: number,
        timeSeconds: number,
        inputMove: { x: number; y: number },
        cameraAngle: number,
        openChestCallback: () => void
    ) {
        const move = {
            x: inputMove.x * Math.cos(cameraAngle) + inputMove.y * Math.sin(cameraAngle),
            y: -inputMove.x * Math.sin(cameraAngle) + inputMove.y * Math.cos(cameraAngle),
        };

        this.player.update(dt, move, timeSeconds, this.enemies,
            (p: Projectile) => this.projectiles.push(p), this.scene);

        // Snap player to terrain
        const ph = this.envManager.getTerrainHeightAt(this.player.x, this.player.y);
        this.player.mesh.position.y = ph + this.player.radius;

        // Player-obstacle separation
        const pr = this.player.radius + 5;
        for (const obs of this.envManager.obstacles) {
            const dx = this.player.x - obs.x;
            const dz = this.player.y - obs.z;
            const d2 = dx * dx + dz * dz;
            const md = pr + obs.r;
            if (d2 < md * md && d2 > 0) {
                const d = Math.sqrt(d2);
                this.player.x += (dx / d) * (md - d);
                this.player.y += (dz / d) * (md - d);
            }
        }

        this.updateProjectiles(dt);
        this.updateEnemies(dt);
        this.updateDropsAndChests(dt, openChestCallback);

        // Single batch render call for ALL enemies — 3 draw calls total
        this.enemyRenderer.update(this.enemies);
    }

    // ── Projectiles ──────────────────────────────────────────────────────────

    private updateProjectiles(dt: number) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            if (!proj.update(dt)) {
                proj.remove();
                this.projectiles.splice(i, 1);
                continue;
            }

            const ph = this.envManager.getTerrainHeightAt(proj.x, proj.y);
            if (proj.mesh) proj.mesh.position.y = ph + proj.radius;

            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const e = this.enemies[j];
                const dx = e.x - proj.x;
                const dy = e.y - proj.y;
                if (dx * dx + dy * dy <= (e.radius + proj.radius) ** 2) {
                    e.hp -= proj.damage;
                    if (proj.pierce > 0) {
                        proj.pierce--;
                    } else {
                        proj.remove();
                        this.projectiles.splice(i, 1);
                        break;
                    }
                }
            }
        }
    }

    // ── Enemies ───────────────────────────────────────────────────────────────

    private updateEnemies(dt: number) {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            e.update(dt, this.player);

            // Player collision
            const pDx = this.player.x - e.x;
            const pDy = this.player.y - e.y;
            const pD2 = pDx * pDx + pDy * pDy;
            const pMd = this.player.radius + e.radius;

            if (pD2 <= pMd * pMd && this.player.iFrameTimer <= 0) {
                this.player.hp -= e.damage;
                this.player.iFrameTimer = 0.5;
            }

            if (e.hp <= 0) {
                this.player.enemiesKilled++;
                const coinMult = 1 + Math.floor(this.player.level / 10);
                this.expDrops.push(new ExpDrop(this.scene, e.x, e.y, e.xpYield));
                this.coinDrops.push(new CoinDrop(this.scene, e.x + 10, e.y + 10, coinMult));

                this.enemyPool.release(e);
                this.enemies.splice(i, 1);
            }
        }

        // Spatial grid is O(N) and fast, run every frame to prevent jitter
        this.spatialGrid.rebuild(this.enemies);
        this.resolveEnemyCollisions(dt);
    }

    private resolveEnemyCollisions(dt: number) {
        // Limit overlap resolve factor to prevent explosions 
        // 10.0 * dt yields a smooth slide out
        const smoothRate = Math.min(1.0, dt * 10.0);

        for (const e1 of this.enemies) {
            const nearby = this.spatialGrid.getNearby(e1.x, e1.y);
            for (const e2 of nearby) {
                if (e1 === e2) continue;
                const dx = e2.x - e1.x;
                const dy = e2.y - e1.y;
                const d2 = dx * dx + dy * dy;
                const min = e1.radius + e2.radius;
                if (d2 < min * min && d2 > 0) {
                    const d = Math.sqrt(d2);
                    const ov = (min - d) * 0.5 * smoothRate;
                    const nx = dx / d;
                    const ny = dy / d;
                    e1.pushX -= nx * ov;
                    e1.pushY -= ny * ov;
                    e2.pushX += nx * ov;
                    e2.pushY += ny * ov;
                }
            }
        }
    }

    // ── Drops & Chests ────────────────────────────────────────────────────────

    private updateDropsAndChests(dt: number, openChestCallback: () => void) {
        const magnetR2 = 150 * 150;
        const pickupR2 = (this.player.radius + 15) ** 2;

        for (let i = this.expDrops.length - 1; i >= 0; i--) {
            const d = this.expDrops[i];
            d.update(dt, this.envManager.getTerrainHeightAt(d.x, d.y));
            const dx = d.x - this.player.x;
            const dy = d.y - this.player.y;
            const d2 = dx * dx + dy * dy;
            if (d2 <= pickupR2) {
                this.player.addXp(d.amount);
                d.remove(); this.expDrops.splice(i, 1);
            } else if (d2 <= magnetR2) {
                const dist = Math.sqrt(d2);
                d.x -= (dx / dist) * 400 * dt;
                d.y -= (dy / dist) * 400 * dt;
            }
        }

        for (let i = this.coinDrops.length - 1; i >= 0; i--) {
            const d = this.coinDrops[i];
            d.update(dt, this.envManager.getTerrainHeightAt(d.x, d.y));
            const dx = d.x - this.player.x;
            const dy = d.y - this.player.y;
            const d2 = dx * dx + dy * dy;
            if (d2 <= pickupR2) {
                this.player.addCoins(d.amount);
                d.remove(); this.coinDrops.splice(i, 1);
            } else if (d2 <= magnetR2) {
                const dist = Math.sqrt(d2);
                d.x -= (dx / dist) * 400 * dt;
                d.y -= (dy / dist) * 400 * dt;
            }
        }

        for (let i = this.chests.length - 1; i >= 0; i--) {
            const c = this.chests[i];
            c.mesh.position.y = this.envManager.getTerrainHeightAt(c.x, c.y) + c.radius;
            const dx = c.x - this.player.x;
            const dy = c.y - this.player.y;
            const d2 = dx * dx + dy * dy;
            const md = this.player.radius + c.radius;
            if (d2 <= md * md && this.player.coins >= c.cost) {
                this.player.coins -= c.cost;
                c.remove(); this.chests.splice(i, 1);
                openChestCallback();
            }
        }
    }
}

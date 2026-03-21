import * as THREE from 'three';
import { Player } from './Player';
import { Enemy } from './Enemy';
import { ExpDrop } from './ExpDrop';
import { CoinDrop } from './CoinDrop';
import { Chest } from './Chest';
import { Projectile } from './Projectile';
import { EnvironmentManager } from './EnvironmentManager';

class SpatialGrid {
    private cells = new Map<number, Enemy[]>();
    private cellSize: number;
    private invCell: number;

    constructor(cellSize = 80) {
        this.cellSize = cellSize;
        this.invCell = 1 / cellSize;
    }

    private key(x: number, y: number): number {
        const cx = Math.floor(x * this.invCell);
        const cy = Math.floor(y * this.invCell);
        // Cantor pairing
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
                if (cell) {
                    for (const e of cell) result.push(e);
                }
            }
        }
        return result;
    }
}

class EnemyPool {
    private pool: Enemy[] = [];
    private scene: THREE.Scene;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    public acquire(x: number, y: number, level: number, isBoss: boolean): Enemy {
        if (this.pool.length > 0) {
            const e = this.pool.pop()!;
            e.spawn(x, y, level, isBoss);
            return e;
        }
        const newE = new Enemy(this.scene);
        newE.spawn(x, y, level, isBoss);
        return newE;
    }

    public release(e: Enemy) {
        e.despawn();
        this.pool.push(e);
    }
}

export class EntityManager {
    public player!: Player;
    public enemies: Enemy[] = [];
    public expDrops: ExpDrop[] = [];
    public coinDrops: CoinDrop[] = [];
    public chests: Chest[] = [];
    public projectiles: Projectile[] = [];

    private scene: THREE.Scene;
    private envManager: EnvironmentManager;

    private collisionTimer = 0;
    private readonly COLLISION_INTERVAL = 0.05;

    private spatialGrid = new SpatialGrid(80);
    private enemyPool: EnemyPool;

    constructor(scene: THREE.Scene, envManager: EnvironmentManager) {
        this.scene = scene;
        this.envManager = envManager;
        this.enemyPool = new EnemyPool(scene);
    }

    public initPlayer(heroType: 'human' | 'knight' | 'archer', onLevelUp: () => void) {
        this.player = new Player(this.scene, 0, 0, heroType);
        this.player.onLevelUp = onLevelUp;
        return this.player;
    }

    public spawnEnemy(x: number, y: number, level: number, isBoss: boolean = false) {
        const e = this.enemyPool.acquire(x, y, level, isBoss);
        this.enemies.push(e);
        return e;
    }

    public clear() {
        // Return to pool instead of destroying meshes
        for (const e of this.enemies) this.enemyPool.release(e);
        this.enemies = [];

        this.expDrops.forEach(e => e.remove());
        this.coinDrops.forEach(c => c.remove());
        this.chests.forEach(c => c.remove());
        this.projectiles.forEach(p => p.remove());

        if (this.player && this.player.mesh) {
            this.scene.remove(this.player.mesh);
            while (this.player.mesh.children.length > 0) {
                this.player.mesh.remove(this.player.mesh.children[0]);
            }
        }

        this.expDrops = [];
        this.coinDrops = [];
        this.chests = [];
        this.projectiles = [];
    }

    public update(dt: number, timeSeconds: number, inputMove: { x: number; y: number }, cameraAngle: number, camera: THREE.PerspectiveCamera, openChestCallback: () => void) {
        // Translate input based on camera yaw angle
        const move = {
            x: inputMove.x * Math.cos(cameraAngle) + inputMove.y * Math.sin(cameraAngle),
            y: -inputMove.x * Math.sin(cameraAngle) + inputMove.y * Math.cos(cameraAngle)
        };

        this.player.update(dt, move, timeSeconds, this.enemies, (p: Projectile) => {
            this.projectiles.push(p);
        }, this.scene);

        // Snap Player to Terrain
        const ph = this.envManager.getTerrainHeightAt(this.player.x, this.player.y);
        this.player.mesh.position.y = ph + this.player.radius;

        // Obstacle collision: push player out of trees/rocks
        const pr = this.player.radius + 5;
        for (const obs of this.envManager.obstacles) {
            const dx = this.player.x - obs.x;
            const dz = this.player.y - obs.z;
            const distSq = dx * dx + dz * dz;
            const minDist = pr + obs.r;
            if (distSq < minDist * minDist && distSq > 0) {
                const dist = Math.sqrt(distSq);
                const overlap = minDist - dist;
                this.player.x += (dx / dist) * overlap;
                this.player.y += (dz / dist) * overlap;
            }
        }

        this.updateProjectiles(dt);
        this.updateEnemies(dt, camera);
        this.updateDropsAndChests(dt, openChestCallback);
    }

    private updateProjectiles(dt: number) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            const isAlive = proj.update(dt);
            const projH = this.envManager.getTerrainHeightAt(proj.x, proj.y);
            if (proj.mesh) proj.mesh.position.y = projH + proj.radius;

            if (!isAlive) {
                proj.remove();
                this.projectiles.splice(i, 1);
                continue;
            }

            for (const enemy of this.enemies) {
                if (!enemy.mesh.visible) continue;

                const dx = enemy.x - proj.x;
                const dy = enemy.y - proj.y;
                const distSq = dx * dx + dy * dy;
                const collDist = enemy.radius + proj.radius;

                if (distSq <= collDist * collDist) {
                    enemy.hp -= proj.damage;
                    if (proj.pierce > 0) {
                        proj.pierce--;
                        proj.x += proj.vx * 0.1;
                        proj.y += proj.vy * 0.1;
                    } else {
                        proj.remove();
                        this.projectiles.splice(i, 1);
                        break;
                    }
                }
            }
        }
    }

    private updateEnemies(dt: number, camera: THREE.PerspectiveCamera) {
        const pr = this.player.radius;
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            enemy.update(dt, this.player, camera.position);

            const eh = this.envManager.getTerrainHeightAt(enemy.x, enemy.y);
            enemy.mesh.position.y = eh + enemy.radius;

            // Damage player
            const pDx = this.player.x - enemy.x;
            const pDy = this.player.y - enemy.y;
            const pDistSq = pDx * pDx + pDy * pDy;
            const pCollDist = pr + enemy.radius;

            if (pDistSq <= pCollDist * pCollDist) {
                if (this.player.iFrameTimer <= 0) {
                    this.player.hp -= enemy.damage;
                    this.player.iFrameTimer = 0.5;
                }
            }

            if (enemy.hp <= 0) {
                this.player.enemiesKilled++;
                this.expDrops.push(new ExpDrop(this.scene, enemy.x, enemy.y, enemy.xpYield));

                const coinMultiplier = 1 + Math.floor(this.player.level / 10);
                this.coinDrops.push(new CoinDrop(this.scene, enemy.x + 10, enemy.y + 10, 1 * coinMultiplier));

                // Pooled despawn instead of .remove()
                this.enemyPool.release(enemy);
                this.enemies.splice(i, 1);
            }
        }

        // Enemy-Enemy Soft Collisions
        this.collisionTimer += dt;
        if (this.collisionTimer >= this.COLLISION_INTERVAL) {
            this.collisionTimer = 0;
            this.spatialGrid.rebuild(this.enemies);

            for (const e1 of this.enemies) {
                const nearby = this.spatialGrid.getNearby(e1.x, e1.y);
                for (const e2 of nearby) {
                    if (e1 === e2) continue;
                    const dx = e2.x - e1.x;
                    const dy = e2.y - e1.y;
                    const distSq = dx * dx + dy * dy;
                    const minDist = e1.radius + e2.radius;

                    if (distSq < minDist * minDist && distSq > 0) {
                        const dist = Math.sqrt(distSq);
                        const overlap = (minDist - dist) * 0.5;
                        const nx = dx / dist;
                        const ny = dy / dist;

                        e1.pushX -= nx * overlap;
                        e1.pushY -= ny * overlap;
                        e2.pushX += nx * overlap;
                        e2.pushY += ny * overlap;
                    }
                }
            }
        }
    }

    private updateDropsAndChests(dt: number, openChestCallback: () => void) {
        const magnetRadiusSq = 150 * 150;
        const pickupRadiusSq = (this.player.radius + 15) * (this.player.radius + 15);

        // ExpDrops
        for (let i = this.expDrops.length - 1; i >= 0; i--) {
            const drop = this.expDrops[i];
            const dropH = this.envManager.getTerrainHeightAt(drop.x, drop.y);
            drop.update(dt, dropH);

            const dx = drop.x - this.player.x;
            const dy = drop.y - this.player.y;
            const distSq = dx * dx + dy * dy;

            if (distSq <= pickupRadiusSq) {
                this.player.addXp(drop.amount);
                drop.remove();
                this.expDrops.splice(i, 1);
            } else if (distSq <= magnetRadiusSq) {
                const dist = Math.sqrt(distSq);
                const speed = 400 * dt;
                drop.x -= (dx / dist) * speed;
                drop.y -= (dy / dist) * speed;
            }
        }

        // CoinDrops
        for (let i = this.coinDrops.length - 1; i >= 0; i--) {
            const drop = this.coinDrops[i];
            const dropH = this.envManager.getTerrainHeightAt(drop.x, drop.y);
            drop.update(dt, dropH);

            const dx = drop.x - this.player.x;
            const dy = drop.y - this.player.y;
            const distSq = dx * dx + dy * dy;

            if (distSq <= pickupRadiusSq) {
                this.player.addCoins(drop.amount);
                drop.remove();
                this.coinDrops.splice(i, 1);
            } else if (distSq <= magnetRadiusSq) {
                const dist = Math.sqrt(distSq);
                const speed = 400 * dt;
                drop.x -= (dx / dist) * speed;
                drop.y -= (dy / dist) * speed;
            }
        }

        // Chests
        for (let i = this.chests.length - 1; i >= 0; i--) {
            const chest = this.chests[i];
            const ch = this.envManager.getTerrainHeightAt(chest.x, chest.y);
            chest.mesh.position.y = ch + chest.radius;

            const dx = chest.x - this.player.x;
            const dy = chest.y - this.player.y;
            const distSq = dx * dx + dy * dy;
            const collDist = this.player.radius + chest.radius;

            if (distSq <= collDist * collDist) {
                if (this.player.coins >= chest.cost) {
                    this.player.coins -= chest.cost;
                    chest.remove();
                    this.chests.splice(i, 1);
                    openChestCallback();
                }
            }
        }
    }
}

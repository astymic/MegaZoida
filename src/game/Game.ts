import { InputManager } from './InputManager';
import { Player } from './Player';
import { Enemy } from './Enemy';
import { ExpDrop } from './ExpDrop';
import { CoinDrop } from './CoinDrop';
import { Chest } from './Chest';
import { BasicSword } from './weapons/BasicSword';
import { Bow } from './weapons/Bow';
import { Staff } from './weapons/Staff';
import { Projectile } from './Projectile';
import { UIManager } from './UIManager';

export class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private isRunning: boolean = false;
    private lastTime: number = 0;
    private inputManager: InputManager;
    private uiManager: UIManager;
    private player: Player;
    private enemies: Enemy[] = [];
    private expDrops: ExpDrop[] = [];
    private coinDrops: CoinDrop[] = [];
    private chests: Chest[] = [];
    private projectiles: Projectile[] = [];
    private lastSpawnTime: number = 0;
    private lastChestSpawnTime: number = 0;
    private isPaused: boolean = false;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to get 2D rendering context');
        }
        this.ctx = ctx;
        this.inputManager = new InputManager();
        this.uiManager = new UIManager();

        // Initialize Player in the center
        this.player = new Player(this.canvas.width / 2, this.canvas.height / 2);

        // Give player a basic sword initially
        this.player.addWeapon(new BasicSword());

        // Handle Level up
        this.player.onLevelUp = () => {
            this.handleLevelUp();
        };

        // Re-center on resize
        window.addEventListener('resize', () => {
            // Adjust canvas size // logic in main.ts
        });
    }

    public start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastTime = performance.now();
        requestAnimationFrame((time) => this.loop(time));
    }

    public stop() {
        this.isRunning = false;
    }

    private handleLevelUp() {
        this.isPaused = true;
        this.uiManager.showLevelUp(this.player, () => {
            this.isPaused = false;

            // Spawn boss if level is multiple of 5
            if (this.player.level > 1 && this.player.level % 5 === 0) {
                this.spawnBoss(this.lastTime / 1000);
            }

            this.lastTime = performance.now(); // Reset time to prevent huge delta
            requestAnimationFrame((time) => this.loop(time));
        });
    }

    private spawnBoss(timeSeconds: number) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.max(this.canvas.width, this.canvas.height) / 2 + 100;
        const x = this.player.x + Math.cos(angle) * dist;
        const y = this.player.y + Math.sin(angle) * dist;

        const level = 1 + Math.floor(timeSeconds / 60);
        this.enemies.push(new Enemy(x, y, level, true)); // isBoss = true
    }

    private openChest() {
        this.isPaused = true;
        this.uiManager.showWeaponChest(this.player, () => {
            // Randomly give Bow or Staff on chest open for now
            const w = Math.random() > 0.5 ? new Bow() : new Staff();
            this.player.addWeapon(w);
            this.isPaused = false;
            this.lastTime = performance.now();
            requestAnimationFrame((time) => this.loop(time));
        });
    }

    private loop(time: number) {
        if (!this.isRunning || this.isPaused) return;

        const deltaTime = (time - this.lastTime) / 1000; // in seconds
        this.lastTime = time;

        this.update(deltaTime, time / 1000);
        this.draw();

        requestAnimationFrame((time) => this.loop(time));
    }

    private update(dt: number, timeSeconds: number) {
        // Player Input
        const move = this.inputManager.getMovementVector();
        this.player.update(dt, move, timeSeconds, this.enemies, (p: Projectile) => {
            this.projectiles.push(p);
        });

        // Spawn Enemies
        if (timeSeconds - this.lastSpawnTime > 1.0) { // arbitrary 1s spawn
            this.spawnEnemy(timeSeconds);
            this.lastSpawnTime = timeSeconds;
        }

        // Spawn Chests (every 30 seconds)
        if (timeSeconds - this.lastChestSpawnTime > 30.0) {
            this.spawnChest();
            this.lastChestSpawnTime = timeSeconds;
        }

        // Projectiles Update
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            const isAlive = proj.update(dt);

            if (!isAlive) {
                this.projectiles.splice(i, 1);
                continue;
            }

            // Projectile-Enemy Collisions
            for (const enemy of this.enemies) {
                const dx = enemy.x - proj.x;
                const dy = enemy.y - proj.y;
                const distSq = dx * dx + dy * dy;
                const collDist = enemy.radius + proj.radius;

                if (distSq <= collDist * collDist) {
                    enemy.hp -= proj.damage;
                    if (proj.pierce > 0) {
                        proj.pierce--;
                        // To avoid multi-hit on same enemy in consecutive frames we could track hit enemies, but we skip for MVP
                        // For MVP, just teleport it slightly forward to avoid next-frame immediate hit
                        proj.x += proj.vx * 0.1;
                        proj.y += proj.vy * 0.1;
                    } else {
                        this.projectiles.splice(i, 1);
                        break;
                    }
                }
            }
        }

        // Update and check death of Enemies
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            enemy.update(dt, this.player);

            if (enemy.hp <= 0) {
                // Spawn XP
                this.expDrops.push(new ExpDrop(enemy.x, enemy.y, enemy.xpYield));
                // 30% chance for coin drop
                if (Math.random() < 0.3) {
                    this.coinDrops.push(new CoinDrop(enemy.x + 10, enemy.y + 10, 1));
                }
                // Remove enemy
                this.enemies.splice(i, 1);
            }
        }

        // Enemy-Enemy Soft Collisions
        for (let i = 0; i < this.enemies.length; i++) {
            for (let j = i + 1; j < this.enemies.length; j++) {
                const e1 = this.enemies[i];
                const e2 = this.enemies[j];
                const dx = e2.x - e1.x;
                const dy = e2.y - e1.y;
                const distSq = dx * dx + dy * dy;
                const minDist = e1.radius + e2.radius;

                if (distSq < minDist * minDist && distSq > 0) {
                    const dist = Math.sqrt(distSq);
                    const overlap = minDist - dist;
                    const nx = dx / dist;
                    const ny = dy / dist;

                    e1.x -= nx * (overlap / 2);
                    e1.y -= ny * (overlap / 2);
                    e2.x += nx * (overlap / 2);
                    e2.y += ny * (overlap / 2);
                }
            }
        }

        // Drop logic vars
        const magnetRadius = 100;
        const pickupRadius = this.player.radius + 10;

        // Player collision with ExpDrops
        for (let i = this.expDrops.length - 1; i >= 0; i--) {
            const drop = this.expDrops[i];
            drop.update(dt);

            const dx = drop.x - this.player.x;
            const dy = drop.y - this.player.y;
            const distSq = dx * dx + dy * dy;

            if (distSq <= pickupRadius * pickupRadius) {
                this.player.addXp(drop.amount);
                this.expDrops.splice(i, 1);
            } else if (distSq <= magnetRadius * magnetRadius) {
                // Magnetize towards player
                const dist = Math.sqrt(distSq);
                const speed = 300 * dt; // fast magnet
                drop.x -= (dx / dist) * speed;
                drop.y -= (dy / dist) * speed;
            }
        }

        // Player collision with CoinDrops
        for (let i = this.coinDrops.length - 1; i >= 0; i--) {
            const drop = this.coinDrops[i];
            drop.update(dt);

            const dx = drop.x - this.player.x;
            const dy = drop.y - this.player.y;
            const distSq = dx * dx + dy * dy;

            if (distSq <= pickupRadius * pickupRadius) {
                this.player.coins += drop.amount;
                this.coinDrops.splice(i, 1);
            } else if (distSq <= magnetRadius * magnetRadius) {
                // Magnetize
                const dist = Math.sqrt(distSq);
                const speed = 300 * dt;
                drop.x -= (dx / dist) * speed;
                drop.y -= (dy / dist) * speed;
            }
        }

        // Player collision with Chests
        for (let i = this.chests.length - 1; i >= 0; i--) {
            const chest = this.chests[i];
            const dx = chest.x - this.player.x;
            const dy = chest.y - this.player.y;
            const distSq = dx * dx + dy * dy;

            if (distSq <= Math.pow(this.player.radius + chest.radius, 2)) {
                if (this.player.coins >= chest.cost) {
                    this.player.coins -= chest.cost;
                    this.chests.splice(i, 1);
                    this.openChest();
                }
            }
        }
    }

    private spawnEnemy(timeSeconds: number) {
        // Spawn randomly outside of viewport
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.max(this.canvas.width, this.canvas.height) / 2 + 100;
        const x = this.player.x + Math.cos(angle) * dist;
        const y = this.player.y + Math.sin(angle) * dist;

        // Level increases over time
        const level = 1 + Math.floor(timeSeconds / 60); // 1 level per minute
        this.enemies.push(new Enemy(x, y, level));
    }

    private spawnChest() {
        const angle = Math.random() * Math.PI * 2;
        const dist = 300 + Math.random() * 200; // spawn slightly further from player
        const x = this.player.x + Math.cos(angle) * dist;
        const y = this.player.y + Math.sin(angle) * dist;

        this.chests.push(new Chest(x, y, 10)); // Base cost 10
    }

    private draw() {
        // Clear screen
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Camera transform: shift context so player is always in center
        this.ctx.save();

        // Center of screen
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;

        // Translate context opposite to player position + center
        this.ctx.translate(cx - this.player.x, cy - this.player.y);

        // Draw some test grid or background elements
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1;
        const gridSize = 100;

        // Infinite grid visualizer
        const startX = Math.floor((this.player.x - cx) / gridSize) * gridSize;
        const endX = startX + this.canvas.width + gridSize * 2;
        const startY = Math.floor((this.player.y - cy) / gridSize) * gridSize;
        const endY = startY + this.canvas.height + gridSize * 2;

        for (let x = startX; x < endX; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, startY);
            this.ctx.lineTo(x, endY);
            this.ctx.stroke();
        }
        for (let y = startY; y < endY; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(startX, y);
            this.ctx.lineTo(endX, y);
            this.ctx.stroke();
        }

        // Draw drops
        for (const drop of this.expDrops) drop.draw(this.ctx);
        for (const coin of this.coinDrops) coin.draw(this.ctx);

        // Draw chests
        for (const chest of this.chests) chest.draw(this.ctx);

        // Draw projectiles
        for (const proj of this.projectiles) {
            proj.draw(this.ctx);
        }

        // Draw enemies
        for (const enemy of this.enemies) enemy.draw(this.ctx);

        // Draw player
        this.player.draw(this.ctx);

        this.ctx.restore();

        // Draw HUD
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '24px sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`Level: ${this.player.level}`, 20, 40);
        this.ctx.fillText(`Coins: ${this.player.coins} 🪙`, 20, 70);

        // Weapon info
        this.ctx.font = '16px sans-serif';
        this.ctx.fillText(`Weapons: ${this.player.weapons.map(w => w.data.icon).join(' ')}`, 20, 100);
    }
}

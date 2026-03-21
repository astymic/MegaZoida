import * as THREE from 'three';
import { EntityManager } from './EntityManager';
import { Chest } from './Chest';

export class SpawnerManager {
    private scene: THREE.Scene;
    private entityManager: EntityManager;

    // Config - much higher now with perf fixes!
    private maxEnemies = 150;
    private chestSpawnInterval = 30.0;

    private lastSpawnTime = 0;
    private lastChestSpawnTime = 0;

    constructor(scene: THREE.Scene, entityManager: EntityManager) {
        this.scene = scene;
        this.entityManager = entityManager;
    }

    public reset() {
        this.lastSpawnTime = 0;
        this.lastChestSpawnTime = 0;
    }

    public update(timeSeconds: number) {
        if (!this.entityManager.player) return;

        // Mob spawning
        const spawnMultiplier = Math.pow(1.3, Math.floor((this.entityManager.player.level - 1) / 2));
        const spawnDelay = Math.max(0.15, 0.8 / spawnMultiplier);

        if (timeSeconds - this.lastSpawnTime > spawnDelay && this.entityManager.enemies.length < this.maxEnemies) {
            this.spawnEnemy(timeSeconds);
            this.lastSpawnTime = timeSeconds;
        }

        // Chest spawning
        if (timeSeconds - this.lastChestSpawnTime > this.chestSpawnInterval) {
            this.spawnChest();
            this.lastChestSpawnTime = timeSeconds;
        }
    }

    private spawnEnemy(timeSeconds: number) {
        const p = this.entityManager.player;
        const angle = Math.random() * Math.PI * 2;
        const dist = 600; // spawn outside view
        const x = p.x + Math.cos(angle) * dist;
        const y = p.y + Math.sin(angle) * dist;

        const level = 1 + Math.floor(timeSeconds / 60);
        this.entityManager.spawnEnemy(x, y, level, false);
    }

    public spawnBoss(timeSeconds: number) {
        const p = this.entityManager.player;
        const angle = Math.random() * Math.PI * 2;
        const dist = 600;
        const x = p.x + Math.cos(angle) * dist;
        const y = p.y + Math.sin(angle) * dist;

        const level = 1 + Math.floor(timeSeconds / 60);
        this.entityManager.spawnEnemy(x, y, level, true);
    }

    private spawnChest() {
        const p = this.entityManager.player;
        const angle = Math.random() * Math.PI * 2;
        const dist = 300 + Math.random() * 200;
        const x = p.x + Math.cos(angle) * dist;
        const y = p.y + Math.sin(angle) * dist;

        const costMultiplier = Math.pow(1.5, Math.max(0, p.level - 1));
        this.entityManager.chests.push(new Chest(this.scene, x, y, 10 * costMultiplier));
    }
}

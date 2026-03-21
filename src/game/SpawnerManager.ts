import { EntityManager } from './EntityManager';
import { Chest } from './Chest';
import * as THREE from 'three';

export class SpawnerManager {
    private scene: THREE.Scene;
    private entityManager: EntityManager;

    private maxEnemies = 200; // high cap — InstancedMesh is cheap!
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

        const p = this.entityManager.player;
        const mult = Math.pow(1.3, Math.floor((p.level - 1) / 2));
        const spawnDelay = Math.max(0.1, 0.7 / mult);

        if (timeSeconds - this.lastSpawnTime > spawnDelay &&
            this.entityManager.enemies.length < this.maxEnemies) {
            this.spawnEnemy(timeSeconds);
            this.lastSpawnTime = timeSeconds;
        }

        if (timeSeconds - this.lastChestSpawnTime > this.chestSpawnInterval) {
            this.spawnChest();
            this.lastChestSpawnTime = timeSeconds;
        }
    }

    private spawnEnemy(timeSeconds: number) {
        const p = this.entityManager.player;
        const angle = Math.random() * Math.PI * 2;
        const dist = 600;
        this.entityManager.spawnEnemy(
            p.x + Math.cos(angle) * dist,
            p.y + Math.sin(angle) * dist,
            1 + Math.floor(timeSeconds / 60),
            false
        );
    }

    public spawnBoss(timeSeconds: number) {
        const p = this.entityManager.player;
        const angle = Math.random() * Math.PI * 2;
        this.entityManager.spawnEnemy(
            p.x + Math.cos(angle) * 600,
            p.y + Math.sin(angle) * 600,
            1 + Math.floor(timeSeconds / 60),
            true
        );
    }

    private spawnChest() {
        const p = this.entityManager.player;
        const angle = Math.random() * Math.PI * 2;
        const dist = 300 + Math.random() * 200;
        const cost = 10 * Math.pow(1.5, Math.max(0, p.level - 1));
        this.entityManager.chests.push(new Chest(this.scene,
            p.x + Math.cos(angle) * dist,
            p.y + Math.sin(angle) * dist,
            cost
        ));
    }
}

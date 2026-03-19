import * as THREE from 'three';

export class EnvironmentManager {
    private scene: THREE.Scene;

    // Terrain
    public terrainMeshes: THREE.Mesh[] = [];  // All meshes to Raycast against
    private terrainRaycaster = new THREE.Raycaster();

    // Reusable Vector3 to prevent GC spikes in getTerrainHeightAt
    private rayOrigin = new THREE.Vector3();
    private rayDirection = new THREE.Vector3(0, -1, 0);

    // Static obstacle colliders (trees, rocks, etc.) — stored as {x,z,r}
    public obstacles: Array<{ x: number; z: number; r: number }> = [];

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    private resetEnvironment() {
        this.terrainMeshes = [];
        this.obstacles = [];
    }

    public async loadArenaTerrain() {
        this.resetEnvironment();
        // --- Flat arena base ---
        const groundGeo = new THREE.PlaneGeometry(20000, 20000);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x365f3a, roughness: 0.95 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
        this.terrainMeshes.push(ground);

        // --- Perimeter walls to define the play space ---
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x2d2b28, roughness: 0.9 });
        const wallHeight = 200;
        const wallThickness = 80;
        const half = 4500;

        const wallZGeo = new THREE.BoxGeometry(half * 2, wallHeight, wallThickness);
        const wallXGeo = new THREE.BoxGeometry(wallThickness, wallHeight, half * 2);

        const wallNorth = new THREE.Mesh(wallZGeo, wallMat);
        wallNorth.position.set(0, wallHeight / 2, -half);
        const wallSouth = new THREE.Mesh(wallZGeo, wallMat);
        wallSouth.position.set(0, wallHeight / 2, half);
        const wallWest = new THREE.Mesh(wallXGeo, wallMat);
        wallWest.position.set(-half, wallHeight / 2, 0);
        const wallEast = new THREE.Mesh(wallXGeo, wallMat);
        wallEast.position.set(half, wallHeight / 2, 0);

        this.scene.add(wallNorth, wallSouth, wallWest, wallEast);

        // Add wall colliders
        const wallR = wallThickness / 2;
        this.obstacles.push({ x: 0, z: -half, r: wallR });
        this.obstacles.push({ x: 0, z: half, r: wallR });
        this.obstacles.push({ x: -half, z: 0, r: wallR });
        this.obstacles.push({ x: half, z: 0, r: wallR });

        // --- Scatter varying rocks from pebbles to huge mountains ---
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.8 });
        for (let i = 0; i < 40; i++) {
            let size = 30 + Math.random() * 50; // Small (80%)
            let rand = Math.random();
            if (rand > 0.9) size = 600 + Math.random() * 500; // Huge mountain (10%)
            else if (rand > 0.8) size = 180 + Math.random() * 150; // Big rock (10%)

            const rockGeo = new THREE.DodecahedronGeometry(size, 0);
            const rock = new THREE.Mesh(rockGeo, rockMat);
            const x = (Math.random() - 0.5) * (half * 1.8);
            const z = (Math.random() - 0.5) * (half * 1.8);

            // Sink them slightly into the ground
            rock.position.set(x, size * 0.4, z);
            rock.castShadow = false;
            rock.receiveShadow = true;
            this.scene.add(rock);

            // Register collider
            const collisionRadius = size * 1.1;
            this.obstacles.push({ x, z, r: collisionRadius });
        }

        // Clean sky
        this.scene.fog = null;
        this.scene.background = new THREE.Color(0x82c7d9);
    }

    public async loadMountainTerrain() {
        this.resetEnvironment();
        // --- Base ground (fallback) ---
        const groundGeo = new THREE.PlaneGeometry(20000, 20000);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a7d44, roughness: 0.9 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
        this.terrainMeshes.push(ground);

        // Load the Mountain Map
        const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
        const loader = new FBXLoader();
        loader.load('/assets/models/Mountain/Mountain01.fbx', (fbx) => {
            fbx.scale.set(5.0, 5.0, 5.0); // Scale up the mountain
            fbx.position.set(0, 0, 0);

            fbx.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    this.terrainMeshes.push(child as THREE.Mesh);
                }
            });
            this.scene.add(fbx);
        }, undefined, (err) => {
            console.error('Failed to load Mountain map', err);
        });

        // Remove fog (depth map effect) for a clean look
        this.scene.fog = null;
        this.scene.background = new THREE.Color(0x87ceeb); // Sky blue
    }

    // Raycaster-based height: shoot down from sky and find surface below (x,z)
    public getTerrainHeightAt(x: number, z: number): number {
        if (this.terrainMeshes.length === 0) return 0;

        // Use pre-allocated Vector3 to avoid GC spikes
        this.rayOrigin.set(x, 2000, z);
        this.terrainRaycaster.set(this.rayOrigin, this.rayDirection);

        const hits = this.terrainRaycaster.intersectObjects(this.terrainMeshes, false);
        if (hits.length > 0) {
            return hits[0].point.y;
        }
        return 0; // fallback to ground
    }
}

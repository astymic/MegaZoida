import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export class AssetManager {
    public static archerFbx: THREE.Group | null = null;

    public static async preloadAll(onProgress?: (p: number) => void): Promise<void> {
        return new Promise((resolve) => {
            const loader = new FBXLoader();

            // The textures should be resolved automatically in the tex folder if they exist.
            loader.load('/assets/models/Chiori/Chiori.fbx', (fbx) => {
                // Determine scale based on new model (usually 0.2 is a good Mixamo default, but we'll try 0.26 as requested in phase 9)
                fbx.scale.set(0.26, 0.26, 0.26);

                // Fix Y-up vs Z-up FBX axis mismatch (common with Maya/DAZ exports)
                // Negative PI/2 on X rotates Z-up model to Y-up (Three.js coordinate system)
                fbx.rotation.x = -Math.PI / 2;
                fbx.rotation.y = 0;

                fbx.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;

                        // Disable specular highlights which sometimes break cartoon FBX models
                        if ((child as THREE.Mesh).material) {
                            const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
                            mat.roughness = 0.8;
                        }
                    }
                });

                AssetManager.archerFbx = fbx;
                resolve();
            }, (xhr) => {
                if (onProgress) {
                    onProgress(xhr.loaded / xhr.total);
                }
            }, (error) => {
                console.error("Asset loading error:", error);
                resolve(); // Still resolve so game continues
            });
        });
    }

    public static getArcherModel(): { model: THREE.Object3D, mixer?: THREE.AnimationMixer, actionRun?: THREE.AnimationAction } {
        if (!AssetManager.archerFbx) throw new Error("Archer model not preloaded!");
        const cloned = SkeletonUtils.clone(AssetManager.archerFbx);

        let mixer;
        let actionRun;
        // Search if Chiori has baked animations
        if (AssetManager.archerFbx.animations && AssetManager.archerFbx.animations.length > 0) {
            mixer = new THREE.AnimationMixer(cloned);
            actionRun = mixer.clipAction(AssetManager.archerFbx.animations[0]);
            actionRun.play();
        }

        return { model: cloned, mixer, actionRun };
    }
}

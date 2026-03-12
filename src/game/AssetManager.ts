import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export class AssetManager {
    public static archerFbx: THREE.Group | null = null;

    public static async preloadAll(onProgress?: (p: number) => void): Promise<void> {
        return new Promise((resolve) => {
            const loader = new FBXLoader();

            // The textures should be resolved automatically in Female1_T_Pose.fbm if they exist.
            loader.load('/assets/models/T-Pose Nude/Female1_T_Pose.Fbx', (fbx) => {
                // Increased 1.3x from original 0.2
                fbx.scale.set(0.26, 0.26, 0.26);

                // Fix "face down in floor" issue common with FBX imports
                fbx.rotation.x = Math.PI / 2;
                fbx.rotation.y = Math.PI;

                fbx.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
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
        if (AssetManager.archerFbx.animations && AssetManager.archerFbx.animations.length > 0) {
            mixer = new THREE.AnimationMixer(cloned);
            actionRun = mixer.clipAction(AssetManager.archerFbx.animations[0]);
            actionRun.play();
        }

        return { model: cloned, mixer, actionRun };
    }
}

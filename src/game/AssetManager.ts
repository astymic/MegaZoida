import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export class AssetManager {
    public static archerFbx: THREE.Group | null = null;
    public static skeletonFbx: THREE.Group | null = null;

    public static async preloadAll(onProgress?: (p: number) => void): Promise<void> {
        const loader = new FBXLoader();

        const loadFbx = (path: string, onProg?: (p: number) => void): Promise<THREE.Group> =>
            new Promise((resolve) => {
                loader.load(path, resolve, (xhr) => {
                    if (onProg) onProg(xhr.loaded / xhr.total);
                }, (err) => {
                    console.error('FBX load error', path, err);
                    resolve(new THREE.Group());
                });
            });

        // --- Load Archer (Chiori) ---
        // NOTE: FBX from Mixamo/Blender are already Y-up, NO rotation needed.
        // Only apply if model appears lying down after testing.
        const chiori = await loadFbx('/assets/models/Chiori/Chiori.fbx', onProgress);
        chiori.scale.set(0.5, 0.5, 0.5);
        // Start with ZERO rotation — if it comes out wrong, we adjust
        chiori.rotation.set(0, 0, 0);
        chiori.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
                if (mat) {
                    mat.roughness = 0.8;
                    mat.needsUpdate = true;
                }
            }
        });
        AssetManager.archerFbx = chiori;

        // --- Load Enemy Skeleton ---
        const skeleton = await loadFbx('/assets/models/lowpolyskeleton_rigged.fbx');
        skeleton.scale.set(7.0, 7.0, 7.0);
        skeleton.rotation.set(0, 0, 0); // Try zero first — adjust after seeing result
        skeleton.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                child.castShadow = false;
                child.receiveShadow = false;
            }
        });
        AssetManager.skeletonFbx = skeleton;
    }

    public static getArcherModel(): { model: THREE.Object3D, mixer?: THREE.AnimationMixer, actionRun?: THREE.AnimationAction } {
        if (!AssetManager.archerFbx) return { model: new THREE.Group() };
        const cloned = SkeletonUtils.clone(AssetManager.archerFbx);
        let mixer: THREE.AnimationMixer | undefined;
        let actionRun: THREE.AnimationAction | undefined;
        if (AssetManager.archerFbx.animations?.length > 0) {
            mixer = new THREE.AnimationMixer(cloned);
            actionRun = mixer.clipAction(AssetManager.archerFbx.animations[0]);
            actionRun.play();
        }
        return { model: cloned, mixer, actionRun };
    }

    public static getSkeletonModel(): { model: THREE.Object3D, mixer?: THREE.AnimationMixer } {
        if (!AssetManager.skeletonFbx) return { model: new THREE.Group() };
        const cloned = SkeletonUtils.clone(AssetManager.skeletonFbx);
        let mixer: THREE.AnimationMixer | undefined;
        if (AssetManager.skeletonFbx.animations?.length > 0) {
            mixer = new THREE.AnimationMixer(cloned);
            mixer.clipAction(AssetManager.skeletonFbx.animations[0]).play();
        }
        return { model: cloned, mixer };
    }
}

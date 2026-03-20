import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

interface ModelEntry {
    fbx: THREE.Group;
    animations: THREE.AnimationClip[];
}

export class AssetManager {
    // Store raw FBX + clips separately so we can re-use clips on cloned skeletons
    private static entries: { [key: string]: ModelEntry } = {};

    public static async preloadAll(onProgress?: (p: number) => void): Promise<void> {
        const loader = new FBXLoader();

        const loadFbx = (path: string): Promise<THREE.Group> =>
            new Promise((resolve) => {
                loader.load(
                    path,
                    resolve,
                    (xhr) => {
                        if (onProgress && xhr.total > 0) {
                            onProgress(xhr.loaded / xhr.total);
                        }
                    },
                    (err) => {
                        console.error('FBX load error:', path, err);
                        resolve(new THREE.Group());
                    }
                );
            });

        const keys = ['knight', 'archer', 'human', 'skeleton'];
        const paths = [
            '/assets/models/Hero_Knight.fbx',
            '/assets/models/Hero_Archer.fbx',
            '/assets/models/Hero_Human.fbx',
            '/assets/models/Enemy_Skeleton.fbx',
        ];

        for (let i = 0; i < keys.length; i++) {
            const fbx = await loadFbx(paths[i]);

            // Blender FBX is exported at 100x (cm→m). Scale down to game units.
            fbx.scale.setScalar(0.01);
            fbx.rotation.set(0, 0, 0);

            fbx.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
                    if (mat) {
                        mat.roughness = 0.8;
                        mat.side = THREE.DoubleSide;
                    }
                }
            });

            console.log(`[DEBUG] Model '${keys[i]}' loaded with ${fbx.animations?.length || 0} animations.`);

            if (fbx.animations) {
                fbx.animations.forEach(clip => {
                    console.log(`   - Clip: ${clip.name} (duration: ${clip.duration})`);
                });
            }

            AssetManager.entries[keys[i]] = {
                fbx,
                animations: fbx.animations ?? [],
            };

            if (onProgress) onProgress((i + 1) / keys.length);
        }
    }

    /**
     * Clone the model for a new entity instance.
     *
     * KEY FIX: We create the AnimationMixer on the *cloned* object, then re-use
     * the AnimationClip references from the original FBX.  Passing foreign clips
     * (from a different root) directly to clipAction() caused the mixer to create
     * a detached action that never drove the cloned skeleton — hence the "sliding"
     * where the mesh moves but bones stay frozen.
     */
    public static getModel(key: string): {
        model: THREE.Object3D;
        mixer?: THREE.AnimationMixer;
        actionWalk?: THREE.AnimationAction;
        actionIdle?: THREE.AnimationAction;
    } {
        const entry = AssetManager.entries[key];
        if (!entry) return { model: new THREE.Group() };

        // Deep-clone the skinned mesh hierarchy so bones are independent
        const cloned = SkeletonUtils.clone(entry.fbx) as THREE.Group;

        let mixer: THREE.AnimationMixer | undefined;
        let actionWalk: THREE.AnimationAction | undefined;
        let actionIdle: THREE.AnimationAction | undefined;

        if (entry.animations.length > 0) {
            // Mixer must target the cloned root so it drives the cloned skeleton
            mixer = new THREE.AnimationMixer(cloned);

            // Re-target clips from the source FBX onto the cloned hierarchy.
            // THREE.AnimationMixer.clipAction() accepts a root parameter that
            // tells it which object graph to search for bone tracks — this is
            // what was missing before.
            for (const clip of entry.animations) {
                const lower = clip.name.toLowerCase();
                const action = mixer.clipAction(clip, cloned);

                if (lower.includes('walk')) {
                    actionWalk = action;
                } else if (lower.includes('idle')) {
                    actionIdle = action;
                }
            }

            // Fallback assignment if naming doesn't match
            if (!actionWalk && entry.animations.length > 0) {
                actionWalk = mixer.clipAction(
                    entry.animations[entry.animations.length - 1],
                    cloned
                );
            }
            if (!actionIdle && entry.animations.length > 0) {
                actionIdle = mixer.clipAction(entry.animations[0], cloned);
            }

            // Start both actions; weight controls which is visible
            if (actionIdle) {
                actionIdle.play();
                actionIdle.setEffectiveWeight(1);
            }
            if (actionWalk) {
                actionWalk.play();
                actionWalk.setEffectiveWeight(0);
                // Sync walk speed to movement: character moves ~200 units/s.
                // Walk cycle is 40 frames @ 24 fps ≈ 1.67 s per cycle.
                // At timeScale 1.8 the legs visually match the ground speed.
                actionWalk.timeScale = 1.8;
            }
        }

        return { model: cloned, mixer, actionWalk, actionIdle };
    }
}

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

interface ModelEntry {
    fbx: THREE.Group;
    animations: THREE.AnimationClip[];
    walkClipDuration: number;
}

export class AssetManager {
    private static entries: { [key: string]: ModelEntry } = {};

    public static async preloadAll(onProgress?: (p: number) => void): Promise<void> {
        const loader = new FBXLoader();

        const loadFbx = (path: string): Promise<THREE.Group> =>
            new Promise((resolve) => {
                loader.load(path, resolve,
                    (xhr) => { if (onProgress && xhr.total > 0) onProgress(xhr.loaded / xhr.total); },
                    (err) => { console.error('FBX load error:', path, err); resolve(new THREE.Group()); }
                );
            });

        const keys  = ['knight', 'archer', 'human', 'skeleton'];
        const paths = [
            '/assets/models/Hero_Knight.fbx',
            '/assets/models/Hero_Archer.fbx',
            '/assets/models/Hero_Human.fbx',
            '/assets/models/Enemy_Skeleton.fbx',
        ];

        for (let i = 0; i < keys.length; i++) {
            const fbx = await loadFbx(paths[i]);

            fbx.scale.setScalar(0.01);
            fbx.rotation.set(0, 0, 0);
            fbx.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
                    if (mat) { mat.roughness = 0.8; mat.side = THREE.DoubleSide; }
                }
            });

            // Read actual walk clip duration from FBX — no guessing
            let walkClipDuration = 40 / 24; // fallback: 40 frames @ 24 fps
            for (const clip of fbx.animations) {
                if (clip.name.toLowerCase().includes('walk')) {
                    walkClipDuration = clip.duration;
                    break;
                }
            }

            console.log(`[AssetManager] ${keys[i]}: clips=[${fbx.animations.map(c => `${c.name}(${c.duration.toFixed(2)}s)`).join(', ')}]`);

            AssetManager.entries[keys[i]] = { fbx, animations: fbx.animations ?? [], walkClipDuration };

            if (onProgress) onProgress((i + 1) / keys.length);
        }
    }

    public static getModel(key: string): {
        model: THREE.Object3D;
        mixer?: THREE.AnimationMixer;
        actionWalk?: THREE.AnimationAction;
        actionIdle?: THREE.AnimationAction;
        walkClipDuration: number;
    } {
        const entry = AssetManager.entries[key];
        if (!entry) return { model: new THREE.Group(), walkClipDuration: 1 };

        // Deep-clone so bones are fully independent per entity
        const cloned = SkeletonUtils.clone(entry.fbx) as THREE.Group;

        let mixer: THREE.AnimationMixer | undefined;
        let actionWalk: THREE.AnimationAction | undefined;
        let actionIdle: THREE.AnimationAction | undefined;

        if (entry.animations.length > 0) {
            mixer = new THREE.AnimationMixer(cloned);

            for (const clip of entry.animations) {
                const lower = clip.name.toLowerCase();
                // CRITICAL: pass `cloned` as root so mixer resolves bone tracks
                // against this clone's skeleton, not the original FBX's skeleton
                const action = mixer.clipAction(clip, cloned);

                if (lower.includes('walk')) actionWalk = action;
                else if (lower.includes('idle')) actionIdle = action;
            }

            if (!actionWalk) actionWalk = mixer.clipAction(entry.animations[entry.animations.length - 1], cloned);
            if (!actionIdle) actionIdle = mixer.clipAction(entry.animations[0], cloned);

            if (actionIdle) {
                actionIdle.setLoop(THREE.LoopRepeat, Infinity);
                actionIdle.clampWhenFinished = false;
                actionIdle.play();
                actionIdle.setEffectiveWeight(1);
            }
            if (actionWalk) {
                actionWalk.setLoop(THREE.LoopRepeat, Infinity);
                actionWalk.clampWhenFinished = false;
                actionWalk.play();
                actionWalk.setEffectiveWeight(0);
            }
        }

        return { model: cloned, mixer, actionWalk, actionIdle, walkClipDuration: entry.walkClipDuration };
    }
}

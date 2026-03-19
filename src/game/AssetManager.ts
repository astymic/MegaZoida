import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export class AssetManager {
    public static models: { [key: string]: THREE.Group } = {};

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

        const loadAndSetup = async (key: string, path: string) => {
            const fbx = await loadFbx(path, onProgress);
            // Blender FBX exporter defaults to 100x scale (meters to cm). 
            // We generated them to exact size in python, so we correct the 100x down to 1x.
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
            AssetManager.models[key] = fbx;
        };

        await loadAndSetup('knight', '/assets/models/Hero_Knight.fbx');
        await loadAndSetup('archer', '/assets/models/Hero_Archer.fbx');
        await loadAndSetup('human', '/assets/models/Hero_Human.fbx');
        await loadAndSetup('skeleton', '/assets/models/Enemy_Skeleton.fbx');
    }

    public static getModel(key: string): { model: THREE.Object3D, mixer?: THREE.AnimationMixer, actionWalk?: THREE.AnimationAction, actionIdle?: THREE.AnimationAction } {
        const source = AssetManager.models[key];
        if (!source) return { model: new THREE.Group() };

        const cloned = SkeletonUtils.clone(source);
        let mixer: THREE.AnimationMixer | undefined;
        let actionWalk: THREE.AnimationAction | undefined;
        let actionIdle: THREE.AnimationAction | undefined;

        if (source.animations?.length > 0) {
            mixer = new THREE.AnimationMixer(cloned);
            source.animations.forEach(clip => {
                const lowerName = clip.name.toLowerCase();
                const action = mixer!.clipAction(clip);
                if (lowerName.includes('walk')) actionWalk = action;
                else if (lowerName.includes('idle')) actionIdle = action;
            });

            if (!actionWalk) actionWalk = mixer.clipAction(source.animations[source.animations.length - 1]);
            if (!actionIdle) actionIdle = mixer.clipAction(source.animations[0]);

            actionIdle?.play();
            actionWalk?.play();

            actionIdle?.setEffectiveWeight(1);
            actionWalk?.setEffectiveWeight(0);
        }
        return { model: cloned, mixer, actionWalk, actionIdle };
    }
}

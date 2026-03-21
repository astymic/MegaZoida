/**
 * EnemyRenderer — InstancedMesh + GLSL procedural walk animation
 *
 * 3 draw calls for up to MAX_ENEMIES enemies:
 *   1. Skeleton body  (InstancedMesh, custom ShaderMaterial)
 *   2. HP bar bg      (InstancedMesh, MeshBasicMaterial)
 *   3. HP bar fill    (InstancedMesh, MeshBasicMaterial)
 *
 * Animation trick:
 *   - Every vertex has a `boneGroup` attribute (0-5) baked in at build time
 *     that says which "bone" it belongs to (0=torso, 1=L-leg, 2=R-leg, 3=L-arm, 4=R-arm, 5=head)
 *   - Per-instance `instWalkPhase` / `instWalking` InstancedBufferAttribute
 *     drives a Math.sin offset in the vertex shader — no AnimationMixer, no bones.
 *   - Three.js instancing requires `#include <instanced_pars_vertex>` in the shader
 *     so that `instanceMatrix` (attribute mat4) + `gl_InstanceID` are declared.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const MAX_ENEMIES = 300;

// ─── Scratch objects — allocated once, reused every frame ─────────────────────
const _dummy = new THREE.Object3D();
const _zeroM4 = new THREE.Matrix4().makeScale(0, 0, 0);

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function labeled(geo: THREE.BufferGeometry, group: number): THREE.BufferGeometry {
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n).fill(group);
    geo.setAttribute('boneGroup', new THREE.BufferAttribute(arr, 1));
    return geo;
}

function box(ox: number, oy: number, oz: number,
    sx: number, sy: number, sz: number, g = 0): THREE.BufferGeometry {
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    geo.translate(ox, oy, oz);
    return labeled(geo, g);
}
function cyl(ox: number, oy: number, oz: number,
    r: number, h: number, rx = 0, rz = 0, g = 0): THREE.BufferGeometry {
    const geo = new THREE.CylinderGeometry(r * 0.7, r, h, 5, 1);
    geo.rotateX(rx);
    geo.rotateZ(rz);
    geo.translate(ox, oy, oz);
    return labeled(geo, g);
}
function sph(ox: number, oy: number, oz: number, r: number, g = 0): THREE.BufferGeometry {
    const geo = new THREE.SphereGeometry(r, 5, 4);
    geo.translate(ox, oy, oz);
    return labeled(geo, g);
}

// ─── Anatomical skeleton geometry ─────────────────────────────────────────────
// S = 1 → ~1.8 world-unit tall skeleton.
// We use S = 25 so the skeleton is ~45 units tall (matches radius=15 enemy well)

function buildSkeletonGeometry(S: number): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];

    // HEAD — group 5
    parts.push(sph(0, S * 1.695, 0, S * 0.115, 5));
    parts.push(box(0, S * 1.665, S * 0.06, S * 0.17, S * 0.04, S * 0.06, 5));
    parts.push(box(0, S * 1.575, S * 0.04, S * 0.13, S * 0.055, S * 0.09, 5));
    parts.push(sph(-S * 0.05, S * 1.66, S * 0.085, S * 0.028, 5));
    parts.push(sph(S * 0.05, S * 1.66, S * 0.085, S * 0.028, 5));

    // SPINE — group 0
    for (let i = 0; i < 5; i++)
        parts.push(cyl(0, S * (1.50 - i * 0.09), 0, S * 0.032, S * 0.055, 0, Math.PI / 2, 0));

    // RIBCAGE — group 0
    parts.push(box(0, S * 1.28, S * 0.06, S * 0.04, S * 0.24, S * 0.025, 0));
    for (let i = 0; i < 8; i++) {
        const ry = S * (1.44 - i * 0.025), rl = S * (0.16 - i * 0.006);
        parts.push(cyl(-rl * 0.3, ry, 0, S * 0.010, rl, 0, 0.4 + i * 0.02, 0));
        parts.push(cyl(rl * 0.3, ry, 0, S * 0.010, rl, 0, -(0.4 + i * 0.02), 0));
    }

    // PELVIS — group 0
    parts.push(box(0, S * 0.96, 0, S * 0.22, S * 0.12, S * 0.14, 0));
    parts.push(box(-S * 0.13, S * 0.99, -S * 0.02, S * 0.06, S * 0.14, S * 0.10, 0));
    parts.push(box(S * 0.13, S * 0.99, -S * 0.02, S * 0.06, S * 0.14, S * 0.10, 0));

    // LEFT ARM — group 3
    parts.push(sph(-S * 0.175, S * 1.415, 0, S * 0.035, 3));
    parts.push(cyl(-S * 0.20, S * 1.25, 0, S * 0.026, S * 0.30, 0, -Math.PI * 0.5, 3));
    parts.push(cyl(-S * 0.225, S * 0.890, 0, S * 0.018, S * 0.28, 0, -Math.PI * 0.5, 3));
    parts.push(box(-S * 0.228, S * 0.670, 0, S * 0.065, S * 0.055, S * 0.035, 3));
    for (const fo of [-0.020, 0.0, 0.020])
        parts.push(cyl(-S * 0.228 + fo * S, S * 0.610, 0, S * 0.009, S * 0.060, 0, -Math.PI * 0.5, 3));

    // RIGHT ARM — group 4
    parts.push(sph(S * 0.175, S * 1.415, 0, S * 0.035, 4));
    parts.push(cyl(S * 0.20, S * 1.25, 0, S * 0.026, S * 0.30, 0, Math.PI * 0.5, 4));
    parts.push(cyl(S * 0.225, S * 0.890, 0, S * 0.018, S * 0.28, 0, Math.PI * 0.5, 4));
    parts.push(box(S * 0.228, S * 0.670, 0, S * 0.065, S * 0.055, S * 0.035, 4));
    for (const fo of [-0.020, 0.0, 0.020])
        parts.push(cyl(S * 0.228 + fo * S, S * 0.610, 0, S * 0.009, S * 0.060, 0, Math.PI * 0.5, 4));

    // LEFT LEG — group 1
    parts.push(sph(-S * 0.090, S * 0.895, 0, S * 0.038, 1));
    parts.push(cyl(-S * 0.095, S * 0.680, 0, S * 0.034, S * 0.44, -0.08, 0, 1));
    parts.push(sph(-S * 0.095, S * 0.470, 0, S * 0.030, 1));
    parts.push(cyl(-S * 0.093, S * 0.275, 0, S * 0.026, S * 0.40, -0.04, 0, 1));
    parts.push(sph(-S * 0.093, S * 0.464, S * 0.025, S * 0.020, 1));
    parts.push(box(-S * 0.093, S * 0.035, -S * 0.035, S * 0.055, S * 0.045, S * 0.080, 1));
    parts.push(box(-S * 0.093, S * 0.050, S * 0.010, S * 0.045, S * 0.035, S * 0.055, 1));

    // RIGHT LEG — group 2
    parts.push(sph(S * 0.090, S * 0.895, 0, S * 0.038, 2));
    parts.push(cyl(S * 0.095, S * 0.680, 0, S * 0.034, S * 0.44, 0.08, 0, 2));
    parts.push(sph(S * 0.095, S * 0.470, 0, S * 0.030, 2));
    parts.push(cyl(S * 0.093, S * 0.275, 0, S * 0.026, S * 0.40, 0.04, 0, 2));
    parts.push(sph(S * 0.093, S * 0.464, S * 0.025, S * 0.020, 2));
    parts.push(box(S * 0.093, S * 0.035, -S * 0.035, S * 0.055, S * 0.045, S * 0.080, 2));
    parts.push(box(S * 0.093, S * 0.050, S * 0.010, S * 0.045, S * 0.035, S * 0.055, 2));

    const merged = mergeGeometries(parts, false)!;
    parts.forEach(g => g.dispose());
    return merged;
}

// ─── Instanced ShaderMaterial ─────────────────────────────────────────────────
// IMPORTANT: `#include <instanced_pars_vertex>` declares `attribute mat4 instanceMatrix`
// and is required for ShaderMaterial on an InstancedMesh.

const vertexShader = /* glsl */`
    // Three.js built-in instancing support — declares "instanceMatrix"
    #include <instanced_pars_vertex>

    // Per-vertex: which limb (0=torso, 1=Lleg, 2=Rleg, 3=Larm, 4=Rarm, 5=head)
    attribute float boneGroup;

    // Per-instance (InstancedBufferAttribute)
    attribute float instWalkPhase;
    attribute float instWalking;

    varying vec3 vNormal;
    varying vec3 vViewPos;

    void main() {
        // 1. Start from base vertex position
        vec3 pos = position;

        float phase   = instWalkPhase;
        float walking = instWalking;

        // 2. Apply procedural limb offsets BEFORE the instance transform
        float legAmp  = 6.0  * walking;   // world units — scaled to S=25 geometry
        float armAmp  = 4.5  * walking;
        float headBob = 1.2  * walking;

        if (boneGroup == 1.0) {
            // Left leg: forward on sin(phase)
            pos.z += sin(phase)                   * legAmp;
            pos.y += max(0.0, -sin(phase))        * legAmp * 0.35;
        } else if (boneGroup == 2.0) {
            // Right leg: opposite phase
            pos.z += sin(phase + 3.14159265)      * legAmp;
            pos.y += max(0.0, -sin(phase + 3.14159265)) * legAmp * 0.35;
        } else if (boneGroup == 3.0) {
            // Left arm: counter-swing
            pos.z += sin(phase + 3.14159265)      * armAmp;
        } else if (boneGroup == 4.0) {
            // Right arm
            pos.z += sin(phase)                   * armAmp;
        } else if (boneGroup == 5.0) {
            // Head bob
            pos.y += abs(sin(phase * 2.0))        * headBob;
        }

        // 3. Apply instance transform (rotation + translation per enemy instance)
        vec4 worldPos   = instanceMatrix * vec4(pos, 1.0);
        vec4 mvPosition = modelViewMatrix * worldPos;
        vViewPos = -mvPosition.xyz;

        // Normal transform (use the instance rotation, skip non-uniform scale)
        mat3 normalMat = mat3(transpose(inverse(mat3(modelMatrix) * mat3(instanceMatrix))));
        vNormal = normalize(normalMat * normal);

        gl_Position = projectionMatrix * mvPosition;
    }
`;

const fragmentShader = /* glsl */`
    uniform vec3 uBoneColor;
    uniform vec3 uEyeGlow;

    varying vec3 vNormal;
    varying vec3 vViewPos;

    void main() {
        vec3 n    = normalize(vNormal);
        // Simple half-Lambert diffuse
        float d   = dot(n, normalize(vec3(0.5, 1.0, 0.5))) * 0.5 + 0.5;
        // Rim light for spooky skeleton look
        float rim = pow(1.0 - abs(dot(n, normalize(vViewPos))), 2.0) * 0.15;
        vec3 col  = uBoneColor * d + rim;
        gl_FragColor = vec4(col, 1.0);
    }
`;

// ─── Public interface ─────────────────────────────────────────────────────────

export interface EnemyRenderData {
    x: number;
    y: number;
    rotY: number;
    hp: number;
    maxHp: number;
    radius: number;
    walkPhase: number;
    isBoss: boolean;
    isWalking: boolean;
}

export class EnemyRenderer {
    private bodyMesh: THREE.InstancedMesh;
    private hpBgMesh: THREE.InstancedMesh;
    private hpBarMesh: THREE.InstancedMesh;

    // Per-instance animation data
    private walkPhaseArr: Float32Array;
    private walkingArr: Float32Array;
    private walkPhaseBuf: THREE.InstancedBufferAttribute;
    private walkingBuf: THREE.InstancedBufferAttribute;

    // Scale constants — normal : boss
    private readonly NS = new THREE.Vector3(1, 1, 1);
    private readonly BS = new THREE.Vector3(2.67, 2.67, 2.67);

    constructor(scene: THREE.Scene) {
        // S=25 → skeleton ≈ 45 units tall.
        // After NORMAL_SCALE=1, enemy with radius=15 looks tall and imposing.
        const S = 25;
        const bodyGeo = buildSkeletonGeometry(S);

        // Instanced animation attributes
        this.walkPhaseArr = new Float32Array(MAX_ENEMIES);
        this.walkingArr = new Float32Array(MAX_ENEMIES);
        this.walkPhaseBuf = new THREE.InstancedBufferAttribute(this.walkPhaseArr, 1);
        this.walkingBuf = new THREE.InstancedBufferAttribute(this.walkingArr, 1);
        this.walkPhaseBuf.setUsage(THREE.DynamicDrawUsage);
        this.walkingBuf.setUsage(THREE.DynamicDrawUsage);
        bodyGeo.setAttribute('instWalkPhase', this.walkPhaseBuf);
        bodyGeo.setAttribute('instWalking', this.walkingBuf);

        const boneMat = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                uBoneColor: { value: new THREE.Color(0xd4c8a8) },
                uEyeGlow: { value: new THREE.Color(0xff2200) },
            },
        });

        this.bodyMesh = new THREE.InstancedMesh(bodyGeo, boneMat, MAX_ENEMIES);
        this.bodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.bodyMesh.count = 0;
        this.bodyMesh.frustumCulled = false;
        scene.add(this.bodyMesh);

        // HP bars
        const hpGeo = new THREE.PlaneGeometry(1, 1);
        const hpBgMat = new THREE.MeshBasicMaterial({ color: 0x880000, depthTest: false });
        const hpFgMat = new THREE.MeshBasicMaterial({ color: 0x00cc44, depthTest: false });

        this.hpBgMesh = new THREE.InstancedMesh(hpGeo, hpBgMat, MAX_ENEMIES);
        this.hpBgMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.hpBgMesh.renderOrder = 999;
        this.hpBgMesh.count = 0;
        this.hpBgMesh.frustumCulled = false;
        scene.add(this.hpBgMesh);

        this.hpBarMesh = new THREE.InstancedMesh(hpGeo.clone(), hpFgMat, MAX_ENEMIES);
        this.hpBarMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.hpBarMesh.renderOrder = 1000;
        this.hpBarMesh.count = 0;
        this.hpBarMesh.frustumCulled = false;
        scene.add(this.hpBarMesh);
    }

    public update(enemies: EnemyRenderData[]) {
        const count = Math.min(enemies.length, MAX_ENEMIES);
        this.bodyMesh.count = count;
        this.hpBgMesh.count = count;
        this.hpBarMesh.count = count;

        for (let i = 0; i < count; i++) {
            const e = enemies[i];
            const scale = e.isBoss ? this.BS : this.NS;

            // ── Body ────────────────────────────────────────────────────────
            _dummy.position.set(e.x, 0, e.y);
            _dummy.rotation.set(0, e.rotY, 0);
            _dummy.scale.copy(scale);
            _dummy.updateMatrix();
            this.bodyMesh.setMatrixAt(i, _dummy.matrix);

            // ── Animation attributes ─────────────────────────────────────
            this.walkPhaseArr[i] = e.walkPhase;
            this.walkingArr[i] = e.isWalking ? 1.0 : 0.0;

            // ── HP bar ───────────────────────────────────────────────────
            const showHp = e.hp > 0 && e.hp < e.maxHp;
            const barY = e.radius * scale.y * 2.5 + 10;
            const barW = e.radius * 2 * scale.x;

            if (showHp) {
                _dummy.rotation.set(-Math.PI / 5, 0, 0);

                _dummy.position.set(e.x, barY, e.y);
                _dummy.scale.set(barW, 4, 1);
                _dummy.updateMatrix();
                this.hpBgMesh.setMatrixAt(i, _dummy.matrix);

                const ratio = Math.max(0, e.hp / e.maxHp);
                const fillW = barW * ratio;
                _dummy.position.set(e.x - (barW - fillW) * 0.5, barY, e.y);
                _dummy.scale.set(fillW, 4, 1);
                _dummy.updateMatrix();
                this.hpBarMesh.setMatrixAt(i, _dummy.matrix);
            } else {
                this.hpBgMesh.setMatrixAt(i, _zeroM4);
                this.hpBarMesh.setMatrixAt(i, _zeroM4);
            }
        }

        this.bodyMesh.instanceMatrix.needsUpdate = true;
        this.hpBgMesh.instanceMatrix.needsUpdate = true;
        this.hpBarMesh.instanceMatrix.needsUpdate = true;
        this.walkPhaseBuf.needsUpdate = true;
        this.walkingBuf.needsUpdate = true;
    }

    public dispose() {
        this.bodyMesh.geometry.dispose();
        (this.bodyMesh.material as THREE.Material).dispose();
        this.hpBgMesh.geometry.dispose();
        (this.hpBgMesh.material as THREE.Material).dispose();
        this.hpBarMesh.geometry.dispose();
        (this.hpBarMesh.material as THREE.Material).dispose();
    }
}

/**
 * EnemyRenderer
 * =============
 * Renders ALL enemies with exactly 3 draw calls:
 *   1. Body (InstancedMesh with custom shader for procedural bone animation)
 *   2. HP bar background (InstancedMesh)
 *   3. HP bar fill (InstancedMesh)
 *
 * Architecture:
 *   - A full anatomical skeleton is built ONCE from primitives (merged geometry)
 *   - THREE.InstancedMesh renders N copies in a single draw call
 *   - Animation is procedural via Math.sin(walkPhase) applied to a custom
 *     vertex attribute (boneGroup) in a GLSL shader — ZERO AnimationMixer cost
 *   - Each enemy data object only stores x/y/rotY/walkPhase/hp numbers
 *   - HP bars are a 2nd+3rd InstancedMesh — billboarded per-instance
 *
 * This replaces the old "one clone per enemy + AnimationMixer" approach which
 * cost ~50 draw calls and ~2000 bone-matrix ops per frame on mobile.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const MAX_ENEMIES = 300;

// ─── Reusable scratch objects (never allocate inside update loop) ─────────────
const _dummy = new THREE.Object3D();
const _scaleZ = new THREE.Matrix4();

// ─── Procedural skeleton geometry ─────────────────────────────────────────────
// boneGroup attribute per vertex controls which "bone" sways in the shader:
//  0 = static (torso/pelvis)
//  1 = left leg
//  2 = right leg
//  3 = left arm
//  4 = right arm
//  5 = head

function labeled(
    geo: THREE.BufferGeometry,
    group: number
): THREE.BufferGeometry {
    const count = geo.attributes.position.count;
    const arr = new Float32Array(count).fill(group);
    geo.setAttribute('boneGroup', new THREE.BufferAttribute(arr, 1));
    return geo;
}

function buildSkeletonGeometry(S: number): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];

    const box = (ox: number, oy: number, oz: number, sx: number, sy: number, sz: number, g = 0): THREE.BufferGeometry => {
        const geo = new THREE.BoxGeometry(sx, sy, sz);
        geo.translate(ox, oy, oz);
        return labeled(geo, g);
    };
    const cyl = (ox: number, oy: number, oz: number, r: number, h: number, rx = 0, rz = 0, g = 0): THREE.BufferGeometry => {
        const geo = new THREE.CylinderGeometry(r * 0.7, r, h, 5, 1);
        geo.rotateX(rx);
        geo.rotateZ(rz);
        geo.translate(ox, oy, oz);
        return labeled(geo, g);
    };
    const sph = (ox: number, oy: number, oz: number, r: number, g = 0): THREE.BufferGeometry => {
        const geo = new THREE.SphereGeometry(r, 5, 4);
        geo.translate(ox, oy, oz);
        return labeled(geo, g);
    };

    // HEAD (group 5)
    parts.push(sph(0, S * 1.695, 0, S * 0.115, 5));
    parts.push(box(0, S * 1.665, S * 0.06, S * 0.17, S * 0.04, S * 0.06, 5));
    parts.push(box(0, S * 1.575, S * 0.04, S * 0.13, S * 0.055, S * 0.09, 5));
    // eye sockets (dark — still group 5)
    parts.push(sph(-S * 0.05, S * 1.66, S * 0.085, S * 0.028, 5));
    parts.push(sph(S * 0.05, S * 1.66, S * 0.085, S * 0.028, 5));

    // SPINE (group 0 — static)
    for (let i = 0; i < 5; i++) {
        parts.push(cyl(0, S * (1.50 - i * 0.09), 0, S * 0.032, S * 0.055, 0, Math.PI / 2, 0));
    }

    // RIBCAGE (group 0)
    parts.push(box(0, S * 1.28, S * 0.06, S * 0.04, S * 0.24, S * 0.025, 0));
    for (let i = 0; i < 8; i++) {
        const ry = S * (1.44 - i * 0.025);
        const rl = S * (0.16 - i * 0.006);
        parts.push(cyl(-rl * 0.3, ry, 0, S * 0.010, rl, 0, 0.4 + i * 0.02, 0));
        parts.push(cyl(rl * 0.3, ry, 0, S * 0.010, rl, 0, -(0.4 + i * 0.02), 0));
    }

    // PELVIS (group 0)
    parts.push(box(0, S * 0.96, 0, S * 0.22, S * 0.12, S * 0.14, 0));
    parts.push(box(-S * 0.13, S * 0.99, -S * 0.02, S * 0.06, S * 0.14, S * 0.10, 0));
    parts.push(box(S * 0.13, S * 0.99, -S * 0.02, S * 0.06, S * 0.14, S * 0.10, 0));

    // LEFT ARM (group 3)
    parts.push(sph(-S * 0.175, S * 1.415, 0, S * 0.035, 3));
    parts.push(cyl(-S * 0.20, S * 1.25, 0, S * 0.026, S * 0.30, 0, -Math.PI * 0.5, 3));
    parts.push(cyl(-S * 0.225, S * 0.890, 0, S * 0.018, S * 0.28, 0, -Math.PI * 0.5, 3));
    parts.push(box(-S * 0.228, S * 0.670, 0, S * 0.065, S * 0.055, S * 0.035, 3));
    for (const fo of [-0.020, 0.0, 0.020]) {
        parts.push(cyl(-S * 0.228 + fo * S, S * 0.610, 0, S * 0.009, S * 0.060, 0, -Math.PI * 0.5, 3));
    }

    // RIGHT ARM (group 4)
    parts.push(sph(S * 0.175, S * 1.415, 0, S * 0.035, 4));
    parts.push(cyl(S * 0.20, S * 1.25, 0, S * 0.026, S * 0.30, 0, Math.PI * 0.5, 4));
    parts.push(cyl(S * 0.225, S * 0.890, 0, S * 0.018, S * 0.28, 0, Math.PI * 0.5, 4));
    parts.push(box(S * 0.228, S * 0.670, 0, S * 0.065, S * 0.055, S * 0.035, 4));
    for (const fo of [-0.020, 0.0, 0.020]) {
        parts.push(cyl(S * 0.228 + fo * S, S * 0.610, 0, S * 0.009, S * 0.060, 0, Math.PI * 0.5, 4));
    }

    // LEFT LEG (group 1)
    parts.push(sph(-S * 0.090, S * 0.895, 0, S * 0.038, 1));  // femoral head
    parts.push(cyl(-S * 0.095, S * 0.680, 0, S * 0.034, S * 0.44, -0.08, 0, 1));
    parts.push(sph(-S * 0.095, S * 0.470, 0, S * 0.030, 1));  // knee
    parts.push(cyl(-S * 0.093, S * 0.275, 0, S * 0.026, S * 0.40, -0.04, 0, 1));
    parts.push(sph(-S * 0.093, S * 0.464, S * 0.025, S * 0.020, 1));
    parts.push(box(-S * 0.093, S * 0.035, -S * 0.035, S * 0.055, S * 0.045, S * 0.080, 1));
    parts.push(box(-S * 0.093, S * 0.050, S * 0.010, S * 0.045, S * 0.035, S * 0.055, 1));

    // RIGHT LEG (group 2)
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

// ─── Custom shaders ───────────────────────────────────────────────────────────
// Each instance passes a `walkPhase` float (via instanceMatrix row 3 w-component
// trick is fragile — instead we use a second InstancedBufferAttribute).

const vertexShader = /* glsl */`
    attribute float boneGroup;      // per-vertex: which limb (0-5)
    attribute float instWalkPhase;  // per-instance: animation phase
    attribute float instWalking;    // per-instance: 0=still, 1=walking

    #include <common>
    #include <color_pars_vertex>
    #include <fog_pars_vertex>
    #include <shadowmap_pars_vertex>

    varying vec3 vNormal;
    varying vec3 vViewPosition;

    void main() {
        #include <color_vertex>
        #include <beginnormal_vertex>
        #include <defaultnormal_vertex>
        vNormal = normalize(normalMatrix * objectNormal);

        vec3 pos = position;
        float phase = instWalkPhase;
        float walking = instWalking;

        // Leg swing ±0.35 world-units amplitude
        float legAmp  = 0.35 * walking;
        float armAmp  = 0.28 * walking;
        float headBob = 0.06 * walking;

        if (boneGroup == 1.0) {          // left leg — forward
            pos.z += sin(phase)              * legAmp;
            pos.y += (1.0 - cos(phase))      * legAmp * 0.4;
        } else if (boneGroup == 2.0) {   // right leg — out of phase
            pos.z += sin(phase + 3.14159)    * legAmp;
            pos.y += (1.0 - cos(phase + 3.14159)) * legAmp * 0.4;
        } else if (boneGroup == 3.0) {   // left arm — counter-swing
            pos.z += sin(phase + 3.14159)    * armAmp;
        } else if (boneGroup == 4.0) {   // right arm
            pos.z += sin(phase)              * armAmp;
        } else if (boneGroup == 5.0) {   // head bob
            pos.y += abs(sin(phase * 2.0))   * headBob;
        }

        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;

        #include <shadowmap_vertex>
        #include <fog_vertex>
    }
`;

const fragmentShader = /* glsl */`
    uniform vec3 uColor;
    uniform vec3 uEmissive;

    varying vec3 vNormal;
    varying vec3 vViewPosition;

    #include <common>
    #include <fog_pars_fragment>

    void main() {
        vec3 normal   = normalize(vNormal);
        vec3 lightDir = normalize(vec3(0.6, 1.0, 0.5));
        float diff    = max(dot(normal, lightDir), 0.0) * 0.8 + 0.2;
        gl_FragColor  = vec4(uColor * diff + uEmissive, 1.0);
        #include <fog_fragment>
    }
`;

// ─── EnemyRenderer ────────────────────────────────────────────────────────────

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

    // Per-instance animation attributes
    private walkPhaseArr: Float32Array;
    private walkingArr: Float32Array;
    private walkPhaseBuf: THREE.InstancedBufferAttribute;
    private walkingBuf: THREE.InstancedBufferAttribute;

    private readonly NORMAL_SCALE = new THREE.Vector3(1, 1, 1);
    private readonly BOSS_SCALE = new THREE.Vector3(2.67, 2.67, 2.67);

    constructor(scene: THREE.Scene) {
        const S = 15.0; // scale matching Enemy radius = 15

        const bodyGeo = buildSkeletonGeometry(S);

        // Per-instance animation attributes (updated every frame)
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
                uColor: { value: new THREE.Color(0xd4c8a8) },
                uEmissive: { value: new THREE.Color(0x330000) },
                fogColor: { value: new THREE.Color(0x1a1a1a) },
                fogNear: { value: 1000 },
                fogFar: { value: 4000 },
            },
            fog: true,
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
            const scale = e.isBoss ? this.BOSS_SCALE : this.NORMAL_SCALE;

            // Body matrix
            _dummy.position.set(e.x, 0, e.y);
            _dummy.rotation.set(0, e.rotY, 0);
            _dummy.scale.copy(scale);
            _dummy.updateMatrix();
            this.bodyMesh.setMatrixAt(i, _dummy.matrix);

            // Animation attributes
            this.walkPhaseArr[i] = e.walkPhase;
            this.walkingArr[i] = e.isWalking ? 1 : 0;

            // HP bar
            const showHp = e.hp > 0 && e.hp < e.maxHp;
            const barY = e.radius * scale.y * 2.2 + 8;
            const barW = e.radius * 2 * scale.x;

            if (showHp) {
                _dummy.position.set(e.x, barY, e.y);
                _dummy.rotation.set(-Math.PI / 5, 0, 0);
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
                _scaleZ.makeScale(0, 0, 0);
                this.hpBgMesh.setMatrixAt(i, _scaleZ);
                this.hpBarMesh.setMatrixAt(i, _scaleZ);
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

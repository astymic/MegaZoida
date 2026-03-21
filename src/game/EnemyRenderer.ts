/**
 * EnemyRenderer — InstancedMesh + procedural walk animation
 *
 * 3 draw calls total for all enemies.
 * Animation via per-instance walkPhase attribute in a custom shader.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const MAX_ENEMIES = 300;

const _dummy = new THREE.Object3D();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function tag(geo: THREE.BufferGeometry, g: number) {
    const n = geo.attributes.position.count;
    geo.setAttribute('boneGroup', new THREE.BufferAttribute(new Float32Array(n).fill(g), 1));
    return geo;
}
const B = (ox: number, oy: number, oz: number, sx: number, sy: number, sz: number, g = 0) => {
    const geo = new THREE.BoxGeometry(sx, sy, sz); geo.translate(ox, oy, oz); return tag(geo, g);
};
const C = (ox: number, oy: number, oz: number, r: number, h: number, rx = 0, rz = 0, g = 0) => {
    const geo = new THREE.CylinderGeometry(r * 0.7, r, h, 5, 1);
    geo.rotateX(rx); geo.rotateZ(rz); geo.translate(ox, oy, oz); return tag(geo, g);
};
const S = (ox: number, oy: number, oz: number, r: number, g = 0) => {
    const geo = new THREE.SphereGeometry(r, 5, 4); geo.translate(ox, oy, oz); return tag(geo, g);
};

function buildGeo(K: number): THREE.BufferGeometry {
    const p: THREE.BufferGeometry[] = [];
    // HEAD 5
    p.push(S(0, K * 1.70, 0, K * 0.115, 5), B(0, K * 1.67, K * 0.06, K * 0.17, K * 0.04, K * 0.06, 5));
    p.push(B(0, K * 1.58, K * 0.04, K * 0.13, K * 0.055, K * 0.09, 5));
    p.push(S(-K * 0.05, K * 1.66, K * 0.085, K * 0.028, 5), S(K * 0.05, K * 1.66, K * 0.085, K * 0.028, 5));
    // SPINE 0
    for (let i = 0; i < 5; i++) p.push(C(0, K * (1.50 - i * 0.09), 0, K * 0.032, K * 0.055, 0, Math.PI / 2, 0));
    // RIBCAGE 0
    p.push(B(0, K * 1.28, K * 0.06, K * 0.04, K * 0.24, K * 0.025, 0));
    for (let i = 0; i < 8; i++) {
        const ry = K * (1.44 - i * 0.025), rl = K * (0.16 - i * 0.006);
        p.push(C(-rl * 0.3, ry, 0, K * 0.010, rl, 0, 0.4 + i * 0.02, 0), C(rl * 0.3, ry, 0, K * 0.010, rl, 0, -(0.4 + i * 0.02), 0));
    }
    // PELVIS 0
    p.push(B(0, K * 0.96, 0, K * 0.22, K * 0.12, K * 0.14, 0));
    p.push(B(-K * 0.13, K * 0.99, -K * 0.02, K * 0.06, K * 0.14, K * 0.10, 0), B(K * 0.13, K * 0.99, -K * 0.02, K * 0.06, K * 0.14, K * 0.10, 0));
    // L-ARM 3
    p.push(S(-K * 0.175, K * 1.415, 0, K * 0.035, 3), C(-K * 0.20, K * 1.25, 0, K * 0.026, K * 0.30, 0, -Math.PI * 0.5, 3));
    p.push(C(-K * 0.225, K * 0.89, 0, K * 0.018, K * 0.28, 0, -Math.PI * 0.5, 3), B(-K * 0.228, K * 0.67, 0, K * 0.065, K * 0.055, K * 0.035, 3));
    for (const fo of [-0.020, 0.0, 0.020]) p.push(C(-K * 0.228 + fo * K, K * 0.610, 0, K * 0.009, K * 0.060, 0, -Math.PI * 0.5, 3));
    // R-ARM 4
    p.push(S(K * 0.175, K * 1.415, 0, K * 0.035, 4), C(K * 0.20, K * 1.25, 0, K * 0.026, K * 0.30, 0, Math.PI * 0.5, 4));
    p.push(C(K * 0.225, K * 0.89, 0, K * 0.018, K * 0.28, 0, Math.PI * 0.5, 4), B(K * 0.228, K * 0.67, 0, K * 0.065, K * 0.055, K * 0.035, 4));
    for (const fo of [-0.020, 0.0, 0.020]) p.push(C(K * 0.228 + fo * K, K * 0.610, 0, K * 0.009, K * 0.060, 0, Math.PI * 0.5, 4));
    // L-LEG 1
    p.push(S(-K * 0.09, K * 0.895, 0, K * 0.038, 1), C(-K * 0.095, K * 0.68, 0, K * 0.034, K * 0.44, -0.08, 0, 1));
    p.push(S(-K * 0.095, K * 0.47, 0, K * 0.030, 1), C(-K * 0.093, K * 0.275, 0, K * 0.026, K * 0.40, -0.04, 0, 1));
    p.push(S(-K * 0.093, K * 0.464, K * 0.025, K * 0.020, 1), B(-K * 0.093, K * 0.035, -K * 0.035, K * 0.055, K * 0.045, K * 0.080, 1));
    p.push(B(-K * 0.093, K * 0.050, K * 0.010, K * 0.045, K * 0.035, K * 0.055, 1));
    // R-LEG 2
    p.push(S(K * 0.09, K * 0.895, 0, K * 0.038, 2), C(K * 0.095, K * 0.68, 0, K * 0.034, K * 0.44, 0.08, 0, 2));
    p.push(S(K * 0.095, K * 0.47, 0, K * 0.030, 2), C(K * 0.093, K * 0.275, 0, K * 0.026, K * 0.40, 0.04, 0, 2));
    p.push(S(K * 0.093, K * 0.464, K * 0.025, K * 0.020, 2), B(K * 0.093, K * 0.035, -K * 0.035, K * 0.055, K * 0.045, K * 0.080, 2));
    p.push(B(K * 0.093, K * 0.050, K * 0.010, K * 0.045, K * 0.035, K * 0.055, 2));

    const merged = mergeGeometries(p, false)!;
    p.forEach(g => g.dispose());
    return merged;
}

// ─── Shaders (no Three.js includes — declare everything manually) ─────────────

const vert = /* glsl */`
precision highp float;

// Three.js built-ins
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

// InstancedMesh support — Three.js sets USE_INSTANCING and supplies this:
#ifdef USE_INSTANCING
  attribute mat4 instanceMatrix;
#endif

attribute vec3 position;
attribute vec3 normal;

// Per-vertex limb tag (0=torso,1=Lleg,2=Rleg,3=Larm,4=Rarm,5=head)
attribute float boneGroup;

// Per-instance animation state
attribute float instWalkPhase;
attribute float instWalking;

varying vec3 vNormal;

void main() {
    vec3 pos = position;
    float ph  = instWalkPhase;
    float w   = instWalking;
    float LA  = 5.5 * w;   // leg amplitude  (world units at K=25 scale)
    float AA  = 4.0 * w;   // arm amplitude
    float HB  = 1.0 * w;   // head bob

    if (boneGroup == 1.0) {
        pos.z += sin(ph) * LA;
        pos.y += max(0.0, -sin(ph)) * LA * 0.3;
    } else if (boneGroup == 2.0) {
        pos.z += sin(ph + 3.14159) * LA;
        pos.y += max(0.0, -sin(ph + 3.14159)) * LA * 0.3;
    } else if (boneGroup == 3.0) {
        pos.z += sin(ph + 3.14159) * AA;
    } else if (boneGroup == 4.0) {
        pos.z += sin(ph) * AA;
    } else if (boneGroup == 5.0) {
        pos.y += abs(sin(ph * 2.0)) * HB;
    }

    // Apply per-instance transform
#ifdef USE_INSTANCING
    vec4 worldPos = modelMatrix * instanceMatrix * vec4(pos, 1.0);
    vNormal = normalize(mat3(instanceMatrix) * normal);
#else
    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vNormal = normalize(normalMatrix * normal);
#endif

    gl_Position = projectionMatrix * modelViewMatrix * worldPos;
}
`;

const frag = /* glsl */`
precision mediump float;

varying vec3 vNormal;

void main() {
    vec3 n    = normalize(vNormal);
    float d   = dot(n, normalize(vec3(0.5, 1.0, 0.5))) * 0.5 + 0.5;
    vec3  col = vec3(0.83, 0.78, 0.66) * d;
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

    private walkPhaseArr: Float32Array;
    private walkingArr: Float32Array;
    private walkPhaseBuf: THREE.InstancedBufferAttribute;
    private walkingBuf: THREE.InstancedBufferAttribute;

    private readonly NS = new THREE.Vector3(1, 1, 1);
    private readonly BS = new THREE.Vector3(2.67, 2.67, 2.67);

    constructor(scene: THREE.Scene) {
        const K = 25; // skeleton scale — ≈45 world-unit tall
        const geo = buildGeo(K);

        this.walkPhaseArr = new Float32Array(MAX_ENEMIES);
        this.walkingArr = new Float32Array(MAX_ENEMIES);
        this.walkPhaseBuf = new THREE.InstancedBufferAttribute(this.walkPhaseArr, 1);
        this.walkingBuf = new THREE.InstancedBufferAttribute(this.walkingArr, 1);
        this.walkPhaseBuf.setUsage(THREE.DynamicDrawUsage);
        this.walkingBuf.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('instWalkPhase', this.walkPhaseBuf);
        geo.setAttribute('instWalking', this.walkingBuf);

        const mat = new THREE.ShaderMaterial({
            vertexShader: vert,
            fragmentShader: frag,
            // Force Three.js to define USE_INSTANCING in the shader
            defines: { USE_INSTANCING: '' },
        });

        this.bodyMesh = new THREE.InstancedMesh(geo, mat, MAX_ENEMIES);
        this.bodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.bodyMesh.count = 0;
        this.bodyMesh.frustumCulled = false;
        scene.add(this.bodyMesh);

        // HP bars — standard MeshBasicMaterial (no instancing issues)
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

            // Body instance matrix
            _dummy.position.set(e.x, 0, e.y);
            _dummy.rotation.set(0, e.rotY, 0);
            _dummy.scale.copy(scale);
            _dummy.updateMatrix();
            this.bodyMesh.setMatrixAt(i, _dummy.matrix);

            this.walkPhaseArr[i] = e.walkPhase;
            this.walkingArr[i] = e.isWalking ? 1.0 : 0.0;

            // HP bar
            const showHp = e.hp > 0 && e.hp < e.maxHp;
            const barY = e.radius * scale.y * 2.5 + 10;
            const barW = e.radius * 2 * scale.x;

            if (showHp) {
                _dummy.scale.set(barW, 4, 1);
                _dummy.rotation.set(-Math.PI / 5, 0, 0);

                _dummy.position.set(e.x, barY, e.y);
                _dummy.updateMatrix();
                this.hpBgMesh.setMatrixAt(i, _dummy.matrix);

                const ratio = Math.max(0, e.hp / e.maxHp);
                const fillW = barW * ratio;
                _dummy.position.set(e.x - (barW - fillW) * 0.5, barY, e.y);
                _dummy.scale.set(fillW, 4, 1);
                _dummy.updateMatrix();
                this.hpBarMesh.setMatrixAt(i, _dummy.matrix);
            } else {
                this.hpBgMesh.setMatrixAt(i, _zero);
                this.hpBarMesh.setMatrixAt(i, _zero);
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

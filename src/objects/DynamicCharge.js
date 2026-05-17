import * as THREE from 'three';
import { SimObject } from '../SimObject.js';
import { world } from '../WorldState.js';

const SUBSTEPS = 8;
const SOFTENING = 0.5;
const K = 20;
const MAX_TRAIL_POINTS = 2000;
const TRAIL_DURATION = 10000;

export class DynamicCharge extends SimObject {
    constructor(position) {
        super();
        this.velocity = new THREE.Vector3();
        this.accel = new THREE.Vector3();
        this.avgAccel = new THREE.Vector3();
        this.tempDir = new THREE.Vector3();
        this.forceArrow = null;
        this.trailData = [];
        this.trailLine = null;
        this.trailPosAttr = null;
        if (position) this.mesh.position.copy(position);
    }

    init(scene) {
        super.init(scene);
        this.forceArrow = new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0),
            this.position.clone(),
            1, 0x00ff00
        );
        this.forceArrow.visible = false;
        scene.add(this.forceArrow);

        const trailMat = new THREE.LineBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.4 });
        this.trailLine = new THREE.Line(new THREE.BufferGeometry(), trailMat);
        scene.add(this.trailLine);
    }

    destroy(scene) {
        if (this.forceArrow) scene.remove(this.forceArrow);
        if (this.trailLine) scene.remove(this.trailLine);
        super.destroy(scene);
    }

    update(dt) {
        const subDt = dt / SUBSTEPS;
        this.avgAccel.set(0, 0, 0);

        for (let step = 0; step < SUBSTEPS; step++) {
            this.accel.set(0, 0, 0);

            for (const other of world.objects) {
                if (other === this) continue;
                const ct = other.constructor.chargeType;
                if (!ct) continue;

                this.tempDir.subVectors(this.position, other.position);
                const distSq = this.tempDir.lengthSq() + SOFTENING * SOFTENING;

                const sameType = this.constructor.chargeType === ct;
                const forceMag = (sameType ? 1 : -1) * K / distSq;

                this.tempDir.normalize().multiplyScalar(forceMag);
                this.accel.add(this.tempDir);
            }

            this.avgAccel.add(this.accel);
            this.velocity.addScaledVector(this.accel, subDt);
            this.position.addScaledVector(this.velocity, subDt);
        }

        this.updateForceArrow();
        this.updateTrail();
    }

    updateForceArrow() {
        if (!this.forceArrow) return;
        this.avgAccel.divideScalar(SUBSTEPS);
        const len = this.avgAccel.length();

        if (len > 0.01) {
            this.forceArrow.position.copy(this.position);
            this.forceArrow.setDirection(this.avgAccel.normalize());
            this.forceArrow.setLength(Math.min(len * 3, 6), 0.5, 0.3);
            this.forceArrow.visible = true;
        } else {
            this.forceArrow.visible = false;
        }
    }

    updateTrail() {
        if (!this.trailLine) return;

        const now = performance.now();
        this.trailData.push({ x: this.position.x, y: this.position.y, z: this.position.z, time: now });
        const cutoff = now - TRAIL_DURATION;

        while (this.trailData.length > 0 && this.trailData[0].time < cutoff) {
            this.trailData.shift();
        }

        const count = this.trailData.length;
        if (count < 2) {
            this.trailLine.visible = false;
            return;
        }

        this.trailLine.visible = true;

        if (!this.trailPosAttr) {
            this.trailPosAttr = new THREE.Float32BufferAttribute(new Float32Array(MAX_TRAIL_POINTS * 3), 3);
            this.trailLine.geometry.setAttribute('position', this.trailPosAttr);
        }

        const arr = this.trailPosAttr.array;
        for (let i = 0; i < count; i++) {
            const p = this.trailData[i];
            arr[i * 3] = p.x;
            arr[i * 3 + 1] = p.y;
            arr[i * 3 + 2] = p.z;
        }

        this.trailPosAttr.needsUpdate = true;
        this.trailLine.geometry.setDrawRange(0, count);
    }
}

import * as THREE from 'three';
import { SimObject } from '../SimObject.js';
import { world } from '../WorldState.js';

const SUBSTEPS = 8;
const SOFTENING = 0.5;
const K = 20;

export class DynamicCharge extends SimObject {
    constructor(position) {
        super();
        this.velocity = new THREE.Vector3();
        this.acceleration = new THREE.Vector3();
        this.forceArrow = null;
        this.trail = [];
        this.trailLine = null;
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

    getSign(otherChargeType) {
        return 1;
    }

    update(dt) {
        const subDt = dt / SUBSTEPS;
        const avgAccel = new THREE.Vector3();

        for (let step = 0; step < SUBSTEPS; step++) {
            this.acceleration.set(0, 0, 0);

            for (const other of world.objects) {
                if (other === this) continue;
                const ct = other.constructor.chargeType;
                if (ct !== 'positive' && ct !== 'negative') continue;

                const dir = new THREE.Vector3().subVectors(this.position, other.position);
                const distSq = dir.lengthSq() + SOFTENING * SOFTENING;

                const sign = this.getSign(ct);
                const forceMag = sign * K / distSq;

                dir.normalize().multiplyScalar(forceMag);
                this.acceleration.add(dir);
            }

            avgAccel.add(this.acceleration);
            this.velocity.addScaledVector(this.acceleration, subDt);
            this.position.addScaledVector(this.velocity, subDt);
        }

        this.updateForceArrow(avgAccel);
        this.updateTrail();
    }

    updateForceArrow(totalAccel) {
        const avg = totalAccel.clone().divideScalar(SUBSTEPS);
        const len = avg.length();
        if (!this.forceArrow) return;

        if (len > 0.01) {
            this.forceArrow.position.copy(this.position);
            this.forceArrow.setDirection(avg.normalize());
            this.forceArrow.setLength(Math.min(len * 3, 6), 0.5, 0.3);
            this.forceArrow.visible = true;
        } else {
            this.forceArrow.visible = false;
        }
    }

    updateTrail() {
        if (!this.trailLine) return;

        const now = performance.now();
        this.trail.push({ pos: this.position.clone(), time: now });
        const cutoff = now - 10000;

        while (this.trail.length > 0 && this.trail[0].time < cutoff) {
            this.trail.shift();
        }

        if (this.trail.length < 2) {
            this.trailLine.visible = false;
            return;
        }

        this.trailLine.visible = true;
        const count = this.trail.length;
        const positions = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            const p = this.trail[i].pos;
            positions[i * 3] = p.x;
            positions[i * 3 + 1] = p.y;
            positions[i * 3 + 2] = p.z;
        }

        this.trailLine.geometry.dispose();
        this.trailLine.geometry = new THREE.BufferGeometry();
        this.trailLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    }
}

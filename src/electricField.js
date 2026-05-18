import * as THREE from 'three';
import { world } from './WorldState.js';

const GRID_SIZE = 30;
const HALF_SPAN = 15;
const GRID_Y = 0.5;

// A 30x30 grid of arrows at mid-height showing the net electric field from static charges
export class ElectricField {
    constructor(scene) {
        this.arrows = [];
        this.enabled = true;
        this.tempDir = new THREE.Vector3();
        this.field = new THREE.Vector3();
        // Semi-transparent plane under the arrows so the grid is visible
        const planeGeo = new THREE.PlaneGeometry(HALF_SPAN * 2, HALF_SPAN * 2);
        const planeMat = new THREE.MeshBasicMaterial({
            color: 0x333333, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false
        });
        this.plane = new THREE.Mesh(planeGeo, planeMat);
        this.plane.rotation.x = -Math.PI / 2;
        this.plane.position.set(0, GRID_Y - 0.01, 0);
        scene.add(this.plane);
        this.buildGrid(scene);
    }

    buildGrid(scene) {
        const step = (2 * HALF_SPAN) / (GRID_SIZE - 1);

        for (let ix = 0; ix < GRID_SIZE; ix++) {
            for (let iz = 0; iz < GRID_SIZE; iz++) {
                const x = -HALF_SPAN + ix * step;
                const z = -HALF_SPAN + iz * step;
                const origin = new THREE.Vector3(x, GRID_Y, z);

                const arrow = new THREE.ArrowHelper(
                    new THREE.Vector3(0, 0, 1), origin, 0.01, 0xffffff
                );
                arrow.visible = false;
                scene.add(arrow);
                this.arrows.push(arrow);
            }
        }
    }

    update() {
        if (!this.enabled) {
            for (const arrow of this.arrows) arrow.visible = false;
            return;
        }

        // For each grid point, sum E contributions from all static charges
        for (const arrow of this.arrows) {
            const origin = arrow.position;
            this.field.set(0, 0, 0);

            for (const obj of world.objects) {
                if (!obj.constructor.isStatic) continue;

                this.tempDir.subVectors(origin, obj.position);
                this.tempDir.y = 0;
                const distSq = this.tempDir.lengthSq();
                if (distSq < 0.01) continue;

                const sign = obj.constructor.chargeType === 'positive' ? 1 : -1;
                this.tempDir.normalize().multiplyScalar(sign / distSq);
                this.field.add(this.tempDir);
            }

            const len = this.field.length() * 2;
            if (len < 0.001) {
                arrow.visible = false;
                continue;
            }

            arrow.visible = true;
            this.field.normalize();
            arrow.setDirection(this.field);
            arrow.setLength(0.8, 0.3, 0.2);
        }
    }

    setVisible(v) {
        this.enabled = v;
        this.plane.visible = v;
        if (v) {
            this.update();
        } else {
            for (const arrow of this.arrows) arrow.visible = false;
        }
    }

    destroy() {
        for (const arrow of this.arrows) {
            arrow.parent?.remove(arrow);
        }
        this.arrows = [];
    }
}

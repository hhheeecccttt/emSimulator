import * as THREE from 'three';
import { world } from './WorldState.js';

const GRID_SIZE = 30;
const HALF_SPAN = 15;
const GRID_Y = 0.5;
const MAX_LEN = 1;
const MIN_LEN = 0.5;

export class ElectricField {
    constructor(scene) {
        this.arrows = [];
        const planeGeo = new THREE.PlaneGeometry(HALF_SPAN * 2, HALF_SPAN * 2);
        const planeMat = new THREE.MeshBasicMaterial({
            color: 0x333333, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false
        });
        const plane = new THREE.Mesh(planeGeo, planeMat);
        plane.rotation.x = -Math.PI / 2;
        plane.position.set(0, GRID_Y - 0.01, 0);
        scene.add(plane);
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
        for (const arrow of this.arrows) {
            const origin = arrow.position;
            const field = new THREE.Vector3();

            for (const obj of world.objects) {
                if (!obj.constructor.isStatic) continue;

                const dir = new THREE.Vector3().subVectors(origin, obj.position);
                dir.y = 0;
                const distSq = dir.lengthSq();
                if (distSq < 0.01) continue;

                const sign = obj.constructor.chargeType === 'positive' ? 1 : -1;
                dir.normalize().multiplyScalar(sign / distSq);
                field.add(dir);
            }

            const len = field.length() * 2;
            if (len < 0.001) {
                arrow.visible = false;
                continue;
            }

            arrow.visible = true;
            field.normalize();
            arrow.setDirection(field);
            arrow.setLength(0.8, 0.3, 0.2);
        }
    }

    destroy() {
        for (const arrow of this.arrows) {
            arrow.parent?.remove(arrow);
        }
        this.arrows = [];
    }
}

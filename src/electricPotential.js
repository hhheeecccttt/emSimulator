import * as THREE from 'three';
import { world } from './WorldState.js';

const WIDTH = 30;
const LENGTH = 30;
const SUBDIVISIONS = 50;

export class ElectricPotential {
  constructor(scene) {
    const geometry = new THREE.PlaneGeometry(WIDTH, LENGTH, SUBDIVISIONS, SUBDIVISIONS);

    const surfaceMat = new THREE.MeshStandardMaterial({
      color: 0x6b6b6b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
      depthWrite: false
    });
    this.surface = new THREE.Mesh(geometry, surfaceMat);
    this.surface.rotation.x = -Math.PI / 2;
    this.surface.position.y = 0.52;
    scene.add(this.surface);

    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x888888,
      wireframe: true,
      side: THREE.DoubleSide
    });
    this.wireframe = new THREE.Mesh(geometry, wireMat);
    this.wireframe.rotation.x = -Math.PI / 2;
    this.wireframe.position.y = 0.52;
    scene.add(this.wireframe);

    this.update();
  }

  update() {
    const pos = this.surface.geometry.attributes.position;
    const widthHalf = WIDTH / 2;
    const lengthHalf = LENGTH / 2;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = -pos.getY(i);

      let potential = 0;
      const vertexWorldPos = new THREE.Vector3(x, 0, y);

      for (const obj of world.objects) {
        if (!obj.constructor.isStatic) continue;
        const dir = new THREE.Vector3().subVectors(obj.position, vertexWorldPos);
        dir.y = 0;

        const distance = dir.length();
        if (distance < 0.01) continue;

        const sign = obj.constructor.chargeType === 'positive' ? 1 : -1;
        potential += sign / distance;
      }

      potential = Math.min(Math.max(potential * 4, -5), 5);
      pos.setZ(i, potential);
    }

    pos.needsUpdate = true;
    this.surface.geometry.computeVertexNormals();
  }
}

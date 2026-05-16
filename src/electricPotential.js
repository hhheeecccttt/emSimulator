import * as THREE from 'three';
import { world } from './WorldState.js';

const WIDTH = 30;
const LENGTH = 30;
const SUBDIVISIONS = 50;
const CONTOUR_LEVELS = [-4, -3, -2, -1, -0.5, 0, 0.5, 1, 2, 3, 4];

const SEGMENTS = [
    [],
    [[0, 3]],
    [[0, 1]],
    [[1, 3]],
    [[1, 2]],
    [[0, 1], [2, 3]],
    [[0, 2]],
    [[2, 3]],
    [[2, 3]],
    [[0, 2]],
    [[0, 3], [1, 2]],
    [[1, 2]],
    [[1, 3]],
    [[0, 1]],
    [[0, 3]],
    [],
];

export class ElectricPotential {
  constructor(scene) {
    const geometry = new THREE.PlaneGeometry(WIDTH, LENGTH, SUBDIVISIONS, SUBDIVISIONS);

    const colors = new Float32Array(geometry.attributes.position.count * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const surfaceMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
      depthWrite: false
    });
    this.surface = new THREE.Mesh(geometry, surfaceMat);
    this.surface.rotation.x = -Math.PI / 2;
    this.surface.position.y = 0.52;
    scene.add(this.surface);

    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x222222,
      wireframe: true,
      side: THREE.DoubleSide
    });
    this.wireframe = new THREE.Mesh(geometry, wireMat);
    this.wireframe.rotation.x = -Math.PI / 2;
    this.wireframe.position.y = 0.52;
    scene.add(this.wireframe);

    const contourMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        side: THREE.DoubleSide
    });
    this.contours = new THREE.Mesh(new THREE.BufferGeometry(), contourMat);
    this.contours.visible = false;
    this.contours.renderOrder = 1;
    scene.add(this.contours);

    this.update();
  }

  setVisible(v) {
    this.surface.visible = v;
    this.wireframe.visible = v;
  }

  setContoursVisible(v) {
    this.contours.visible = v;
    if (v) this.updateContours();
  }

  update() {
    const posAttr = this.surface.geometry.attributes.position;
    const colAttr = this.surface.geometry.attributes.color;
    const posArr = posAttr.array;
    const colArr = colAttr.array;
    const stride = 3;
    const count = posAttr.count;
    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const off = i * stride;
      const x = posArr[off];
      const ly = posArr[off + 1];
      const z = -ly;

      let potential = 0;
      const vx = x, vz = z;

      for (const obj of world.objects) {
        if (!obj.constructor.isStatic) continue;
        const dx = vx - obj.position.x;
        const dz = vz - obj.position.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < 0.0001) continue;

        const sign = obj.constructor.chargeType === 'positive' ? 1 : -1;
        potential += sign / Math.sqrt(distSq);
      }

      potential = Math.min(Math.max(potential * 4, -5), 5);
      posArr[off + 2] = potential;

      const t = (potential + 5) / 10;
      color.setHSL((1 - t) * 0.66, 1, 0.5);
      colArr[off] = color.r;
      colArr[off + 1] = color.g;
      colArr[off + 2] = color.b;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    this.surface.geometry.computeVertexNormals();

    this.updateContours();
  }

  updateContours() {
    if (!this.contours.visible) return;
    const posAttr = this.surface.geometry.attributes.position;
    const arr = posAttr.array;
    const stride = 3;
    const cols = SUBDIVISIONS + 1;
    const W = 0.06;
    const positions = [];
    const indices = [];

    for (let row = 0; row < SUBDIVISIONS; row++) {
      for (let col = 0; col < SUBDIVISIONS; col++) {
        const i00 = (row * cols + col) * stride;
        const i10 = (row * cols + (col + 1)) * stride;
        const i01 = ((row + 1) * cols + col) * stride;
        const i11 = ((row + 1) * cols + (col + 1)) * stride;

        const z00 = arr[i00 + 2];
        const z10 = arr[i10 + 2];
        const z01 = arr[i01 + 2];
        const z11 = arr[i11 + 2];

        for (const level of CONTOUR_LEVELS) {
          let caseIdx = 0;
          if (z00 > level) caseIdx |= 1;
          if (z10 > level) caseIdx |= 2;
          if (z11 > level) caseIdx |= 4;
          if (z01 > level) caseIdx |= 8;

          const segs = SEGMENTS[caseIdx];
          for (const [e0, e1] of segs) {
            const p0 = this.interpEdge(e0, row, col, level, arr, stride);
            const p1 = this.interpEdge(e1, row, col, level, arr, stride);

            const dx = p1.x - p0.x;
            const dz = p1.z - p0.z;
            const len = Math.sqrt(dx * dx + dz * dz);
            if (len < 1e-10) continue;
            const nx = -dz / len * W;
            const nz = dx / len * W;

            const y = 0.52 + level;
            const idx = positions.length / 3;
            positions.push(
              p0.x + nx, y, p0.z + nz,
              p0.x - nx, y, p0.z - nz,
              p1.x + nx, y, p1.z + nz,
              p1.x - nx, y, p1.z - nz
            );
            indices.push(idx, idx + 1, idx + 2, idx + 1, idx + 3, idx + 2);
          }
        }
      }
    }

    const geo = this.contours.geometry;
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeBoundingSphere();
  }

  interpEdge(edge, row, col, level, arr, stride) {
    const cols = SUBDIVISIONS + 1;
    let i0, i1;
    switch (edge) {
      case 0: i0 = (row * cols + col) * stride; i1 = (row * cols + (col + 1)) * stride; break;
      case 1: i0 = (row * cols + (col + 1)) * stride; i1 = ((row + 1) * cols + (col + 1)) * stride; break;
      case 2: i0 = ((row + 1) * cols + col) * stride; i1 = ((row + 1) * cols + (col + 1)) * stride; break;
      case 3: i0 = (row * cols + col) * stride; i1 = ((row + 1) * cols + col) * stride; break;
    }
    const z0 = arr[i0 + 2], z1 = arr[i1 + 2];
    const t = (level - z0) / (z1 - z0);
    const x0 = arr[i0], y0 = arr[i0 + 1];
    const x1 = arr[i1], y1 = arr[i1 + 1];
    return {
      x: x0 + t * (x1 - x0),
      z: -(y0 + t * (y1 - y0)),
    };
  }
}

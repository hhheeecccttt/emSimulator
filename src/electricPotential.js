import * as THREE from "three";
import { world } from "./WorldState.js";
import { isoLines } from "./libs/marchingsquares-esm.js";

const WIDTH = 30;
const LENGTH = 30;
const SUBDIVISIONS = 50;
const HALF_SPAN = WIDTH / 2;
const CONTOUR_LEVELS = [-4, -3, -2, -1, -0.5, 0, 0.5, 1, 2, 3, 4];

export class ElectricPotential {
  constructor(scene) {
    const geometry = new THREE.PlaneGeometry(
      WIDTH,
      LENGTH,
      SUBDIVISIONS,
      SUBDIVISIONS,
    );

    const colors = new Float32Array(geometry.attributes.position.count * 3);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const surfaceMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });

    this.surface = new THREE.Mesh(geometry, surfaceMat);
    this.surface.rotation.x = -Math.PI / 2;
    this.surface.position.y = 0.52;
    scene.add(this.surface);

    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x222222,
      wireframe: true,
      side: THREE.DoubleSide,
    });
    this.wireframe = new THREE.Mesh(geometry, wireMat);
    this.wireframe.rotation.x = -Math.PI / 2;
    this.wireframe.position.y = 0.52;
    scene.add(this.wireframe);

    const contourMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.DoubleSide,
    });
    this.contours = new THREE.Mesh(new THREE.BufferGeometry(), contourMat);
    this.contours.visible = false;
    this.contours.renderOrder = 1;
    scene.add(this.contours);

    this._colorOn = true;
    this.update();
  }

  setVisible(v) {
    this.surface.visible = v;
    this.wireframe.visible = v;
  }

  toggleColor() {
    this._colorOn = !this._colorOn;
    const colAttr = this.surface.geometry.attributes.color;
    const colArr = colAttr.array;
    const stride = 3;
    const count = colAttr.count;

    if (this._colorOn) {
      const posAttr = this.surface.geometry.attributes.position;
      const posArr = posAttr.array;
      const color = new THREE.Color();
      for (let i = 0; i < count; i++) {
        const off = i * stride;
        const potential = posArr[off + 2];
        const t = (potential + 7.5) / 15;
        color.setHSL((1 - t) * 0.66, 1, 0.5);
        colArr[off] = color.r;
        colArr[off + 1] = color.g;
        colArr[off + 2] = color.b;
      }
    } else {
      for (let i = 0; i < count; i++) {
        const off = i * stride;
        colArr[off] = 0.5;
        colArr[off + 1] = 0.5;
        colArr[off + 2] = 0.5;
      }
    }
    colAttr.needsUpdate = true;
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
      const vx = x,
        vz = z;

      for (const obj of world.objects) {
        if (!obj.constructor.isStatic) continue;
        const ct = obj.constructor.chargeType;
        if (!ct) continue;
        const dx = vx - obj.position.x;
        const dz = vz - obj.position.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < 0.0001) continue;

        const sign = obj.constructor.chargeType === "positive" ? 1 : -1;
        potential += sign / Math.sqrt(distSq);
      }

      potential = Math.min(Math.max(potential * 4, -7.5), 7.5);
      posArr[off + 2] = potential;

      const t = (potential + 7.5) / 15;
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
    const rows = SUBDIVISIONS + 1;
    const cols = SUBDIVISIONS + 1;
    const step = WIDTH / SUBDIVISIONS;

    const data = [];
    for (let r = 0; r < rows; r++) {
      data[r] = [];
      const rowOff = r * cols * stride;
      for (let c = 0; c < cols; c++) {
        data[r][c] = arr[rowOff + c * stride + 2];
      }
    }

    const W = 0.06;
    const positions = [];
    const indices = [];

    for (const level of CONTOUR_LEVELS) {
      const paths = isoLines(data, level, { noFrame: true });
      for (const path of paths) {
        for (let i = 0; i < path.length - 1; i++) {
          const cx0 = path[i][0];
          const cy0 = path[i][1];
          const cx1 = path[i + 1][0];
          const cy1 = path[i + 1][1];

          const wx0 = -HALF_SPAN + cx0 * step;
          const wz0 = -HALF_SPAN + cy0 * step;
          const wx1 = -HALF_SPAN + cx1 * step;
          const wz1 = -HALF_SPAN + cy1 * step;

          const dx = wx1 - wx0;
          const dz = wz1 - wz0;
          const len = Math.sqrt(dx * dx + dz * dz);
          if (len < 1e-10) continue;
          const nx = (-dz / len) * W;
          const nz = (dx / len) * W;

          const y = 0.52 + level;
          const idx = positions.length / 3;
          positions.push(
            wx0 + nx,
            y,
            wz0 + nz,
            wx0 - nx,
            y,
            wz0 - nz,
            wx1 + nx,
            y,
            wz1 + nz,
            wx1 - nx,
            y,
            wz1 - nz,
          );
          indices.push(idx, idx + 1, idx + 2, idx + 1, idx + 3, idx + 2);
        }
      }
    }

    const geo = this.contours.geometry;
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setIndex(indices);
    geo.computeBoundingSphere();
  }
}

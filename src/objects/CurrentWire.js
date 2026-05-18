import * as THREE from "three";
import { registerType } from "../ObjectRegistry.js";

const DEFAULT_CURRENT = 12;
const DEFAULT_RANGE = 6;

const _axis = new THREE.Vector3();
const _toPoint = new THREE.Vector3();
const _bDir = new THREE.Vector3();

export class CurrentWire {
  constructor(corner1, corner2) {
    this.active = true;
    this.current = DEFAULT_CURRENT;
    this.range = DEFAULT_RANGE;
    this.corner1 = corner1.clone();
    this.corner2 = corner2.clone();
    this.wireDir = new THREE.Vector3().subVectors(corner2, corner1);
    this.length = this.wireDir.length();
    this.wireDir.normalize();
    this.midpoint = new THREE.Vector3()
      .addVectors(corner1, corner2)
      .multiplyScalar(0.5);

    this.wireGroup = new THREE.Group();
    this.wireGroup.position.copy(this.midpoint);
    this.buildVisuals();
  }

  buildVisuals() {
    const len = this.length;
    if (len < 0.01) return;

    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, this.wireDir);
    this.wireGroup.quaternion.copy(quat);

    // Bounding cylinder showing range of influence
    const rangeGeo = new THREE.CylinderGeometry(
      this.range,
      this.range,
      len,
      24,
      1,
      true,
    );
    const rangeMat = new THREE.MeshPhongMaterial({
      color: 0xff8844,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const rangeMesh = new THREE.Mesh(rangeGeo, rangeMat);
    this.wireGroup.add(rangeMesh);

    const rangeEdges = new THREE.EdgesGeometry(rangeGeo);
    const rangeEdgeMat = new THREE.LineBasicMaterial({
      color: 0xff8844,
      transparent: true,
      opacity: 0.15,
    });
    this.wireGroup.add(new THREE.LineSegments(rangeEdges, rangeEdgeMat));

    // Solid cylinder for the wire itself
    const wireGeo = new THREE.CylinderGeometry(0.06, 0.06, len, 10);
    const wireMat = new THREE.MeshPhongMaterial({
      color: 0xcc8844,
      emissive: 0x553311,
    });
    this.wireMesh = new THREE.Mesh(wireGeo, wireMat);
    this.wireGroup.add(this.wireMesh);

    // Top and bottom end-caps on the bounding cylinder
    const capMat = new THREE.MeshBasicMaterial({
      color: 0xff8844,
      transparent: true,
      opacity: 0.04,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    for (const yOff of [-len / 2, len / 2]) {
      const capGeo = new THREE.RingGeometry(0.06, this.range, 24);
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = yOff;
      cap.rotation.x = -Math.PI / 2;
      this.wireGroup.add(cap);
    }

    // Current direction arrow
    const arrowOrigin = new THREE.Vector3(0, -len / 2 + 0.3, 0);
    this.currentArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      arrowOrigin,
      1.2,
      0xffaa00,
      0.4,
      0.25,
    );
    this.wireGroup.add(this.currentArrow);

    // "I" label sprite
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = "#ffaa00";
    ctx.font = "bold 48px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("I", 32, 34);
    const tex = new THREE.CanvasTexture(canvas);
    this.label = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: false,
      }),
    );
    this.label.position.set(0.3, len / 2 - 0.2, 0);
    this.label.scale.set(0.4, 0.4, 1);
    this.wireGroup.add(this.label);

    // Concentric rings + tangent arrows distributed along the wire length
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff8844,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const radii = [0.8, 1.6, 2.4];
    const sections = Math.max(1, Math.round(len / 4));
    const arrowCount = 8;

    for (let s = 0; s < sections; s++) {
      const yPos = -len / 2 + (s + 0.5) * (len / sections);

      for (const r of radii) {
        const ringGeo = new THREE.RingGeometry(r - 0.03, r + 0.03, 32);
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.y = yPos;
        ring.rotation.x = -Math.PI / 2;
        this.wireGroup.add(ring);
      }

      for (const r of radii) {
        for (let i = 0; i < arrowCount; i++) {
          const angle = (i / arrowCount) * Math.PI * 2;
          const px = r * Math.cos(angle);
          const pz = r * Math.sin(angle);
          const dir = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
          const arrow = new THREE.ArrowHelper(
            dir,
            new THREE.Vector3(px, yPos, pz),
            0.25,
            0xff8844,
            0.12,
            0.08,
          );
          this.wireGroup.add(arrow);
        }
      }
    }
  }

  init(scene) {
    scene.add(this.wireGroup);
  }

  destroy(scene) {
    scene.remove(this.wireGroup);
    this.wireGroup.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }

  getField(point) {
    _axis.copy(this.wireDir);
    _toPoint.subVectors(point, this.corner1);
    const t = _toPoint.dot(_axis);
    const closest = new THREE.Vector3()
      .copy(this.corner1)
      .addScaledVector(_axis, t);

    _toPoint.subVectors(point, closest);
    const rSq = _toPoint.lengthSq();
    if (rSq < 0.01) return null;
    const r = Math.sqrt(rSq);

    // Restrict to range
    if (r > this.range) return null;

    // B = I / (2πr) in direction: wireDir × r_hat
    _bDir.crossVectors(this.wireDir, _toPoint).divideScalar(r);
    const bLen = _bDir.length();
    if (bLen < 1e-10) return null;
    const bMag = this.current / (2 * Math.PI * r);
    return _bDir.clone().normalize().multiplyScalar(bMag);
  }

  update(dt) {}

  getTargetMeshes() {
    return [this.wireMesh];
  }

  static get id() {
    return "currentWire";
  }
  static get label() {
    return "Current-Carrying Wire";
  }
  static get ghostColor() {
    return 0xcc8844;
  }
  static get isStatic() {
    return true;
  }
  static get chargeType() {
    return null;
  }

  static createGhost() {
    const geo = new THREE.CylinderGeometry(0.06, 0.06, 2, 10);
    const mat = new THREE.MeshPhongMaterial({
      color: 0xcc8844,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 999;
    mesh.userData.typeId = "currentWire";
    return mesh;
  }

  static async loadModel() {}
}

registerType(CurrentWire);

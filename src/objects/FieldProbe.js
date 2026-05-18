import * as THREE from "three";
import { registerType } from "../ObjectRegistry.js";
import { world } from "../WorldState.js";
import {
  computeEAtPoint,
  computeVAtPoint,
  computeBAtPoint,
  fmtSI,
  fmtVector,
  fmtDir,
} from "../physics/units.js";

let _nextId = 0;

export class FieldProbe {
  constructor(position) {
    this.active = true;
    this.chargeValue = 0;
    this._id = _nextId++;
    this.probeGroup = new THREE.Group();
    this.probeGroup.position.copy(position);
    this.panelEl = null;
    this.buildVisuals();
  }

  buildVisuals() {
    const pos = this.probeGroup.position;

    // Central marker sphere
    const sphereGeo = new THREE.SphereGeometry(0.08, 12, 12);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.sphere = new THREE.Mesh(sphereGeo, sphereMat);
    this.probeGroup.add(this.sphere);

    // Outer glow ring
    const ringGeo = new THREE.RingGeometry(0.1, 0.16, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(ringGeo, ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.probeGroup.add(this.ring);

    // Stem from probe point down to ground
    const stemPositions = new Float32Array([
      0, 0, 0,
      0, -pos.y, 0,
    ]);
    const stemGeo = new THREE.BufferGeometry();
    stemGeo.setAttribute("position", new THREE.BufferAttribute(stemPositions, 3));
    const stemMat = new THREE.LineBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });
    this.stem = new THREE.Line(stemGeo, stemMat);
    this.probeGroup.add(this.stem);
  }

  init(scene) {
    scene.add(this.probeGroup);
    this.createPanel();
  }

  destroy(scene) {
    scene.remove(this.probeGroup);
    this.removePanel();
    this.probeGroup.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }

  createPanel() {
    this.panelEl = document.createElement("div");
    this.panelEl.className = "probe-panel";
    this.panelEl.id = "probe-" + this._id;
    document.body.appendChild(this.panelEl);
  }

  removePanel() {
    if (this.panelEl) {
      this.panelEl.remove();
      this.panelEl = null;
    }
  }

  update(dt) {
    if (!this.panelEl) return;
    this.updateReadings();
    this.updatePanelPosition();
  }

  updateReadings() {
    const point = this.probeGroup.position;
    const objects = world.objects;

    const e = computeEAtPoint(point, objects);
    const v = computeVAtPoint(point, objects);
    const b = computeBAtPoint(point, objects);

    const eMag = e.length();
    const bMag = b.length();
    const eDir = eMag > 1e-15 ? fmtDir(e.clone().normalize()) : "";

    this.panelEl.innerHTML = `
      <div class="probe-title">⚡ Field Probe</div>
      <div class="probe-pos">${fmtVector(point)}</div>
      <div class="probe-divider"></div>
      <div class="probe-row"><span class="probe-label">Electric Field</span><span class="probe-val">${fmtSI(eMag)} N/C ${eDir}</span></div>
      <div class="probe-row"><span class="probe-label">Electric Potential</span><span class="probe-val">${fmtSI(v)} V</span></div>
      <div class="probe-row"><span class="probe-label">Magnetic Field</span><span class="probe-val">${fmtSI(bMag)} T</span></div>
    `;
  }

  updatePanelPosition() {
    const cam = world.camera;
    if (!cam) { this.panelEl.style.display = "none"; return; }

    const v3 = this.probeGroup.position.clone().project(cam);

    // Hide if behind camera (z > 1 means behind the near plane after projection)
    if (v3.z > 1) {
      this.panelEl.style.display = "none";
      return;
    }
    this.panelEl.style.display = "block";

    const x = (v3.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v3.y * 0.5 + 0.5) * window.innerHeight;
    this.panelEl.style.left = (x + 24) + "px";
    this.panelEl.style.top = (y - 16) + "px";


  }

  getTargetMeshes() {
    return [this.sphere, this.ring];
  }

  static get id() { return "fieldProbe"; }
  static get label() { return "Field Probe"; }
  static get ghostColor() { return 0x00ff88; }
  static get isStatic() { return true; }
  static get chargeType() { return null; }

  static createGhost() {
    const geo = new THREE.SphereGeometry(0.08, 12, 12);
    const mat = new THREE.MeshPhongMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 999;
    mesh.userData.typeId = "fieldProbe";
    return mesh;
  }

  static async loadModel() {}
}

registerType(FieldProbe);

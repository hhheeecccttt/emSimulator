import * as THREE from "three";
import { SimObject } from "../SimObject.js";
import { world } from "../WorldState.js";

// Physics tuning — sub-steps keep things stable at high forces
const SUBSTEPS = 8;
const SOFTENING = 0.5;
const K = 20;
const MAX_TRAIL_POINTS = 2000;
const TRAIL_DURATION = 10000;

const lorentzTemp = new THREE.Vector3();

// Shared geom for thick arrows — avoids re-creating buffers for every charge
const _shaftGeo = new THREE.CylinderGeometry(0.08, 0.08, 1, 6);
const _headGeo = new THREE.ConeGeometry(0.2, 0.35, 8);

// Build a 3D arrow out of a cylinder shaft + cone head, returns a Group
function createThickArrow(color, length, headLength, headWidth) {
  const g = new THREE.Group();

  const shaftMat = new THREE.MeshBasicMaterial({ color });
  const headMat = new THREE.MeshBasicMaterial({ color });

  const shaft = new THREE.Mesh(_shaftGeo, shaftMat);
  shaft.position.y = 0.5;
  g.add(shaft);

  const head = new THREE.Mesh(_headGeo, headMat);
  g.add(head);

  updateThickArrow(g, length, headLength, headWidth);
  return g;
}

// Rescale shaft & head to match current velocity/force magnitude
function updateThickArrow(group, length, headLength, headWidth) {
  const shaftLen = Math.max(0.001, length - headLength);
  const shaft = group.children[0];
  const head = group.children[1];

  shaft.scale.set(1, shaftLen, 1);
  shaft.position.y = shaftLen / 2;

  head.scale.set(headWidth / 0.2, headLength / 0.35, headWidth / 0.2);
  head.position.y = shaftLen + headLength / 2;
}

// Orient the arrow group using the same math as Three.js ArrowHelper
function setThickArrowDir(group, dir) {
  if (dir.y > 0.99999) {
    group.quaternion.set(0, 0, 0, 1);
  } else if (dir.y < -0.99999) {
    group.quaternion.set(1, 0, 0, 0);
  } else {
    const axis = new THREE.Vector3(dir.z, 0, -dir.x).normalize();
    const radians = Math.acos(dir.y);
    group.quaternion.setFromAxisAngle(axis, radians);
  }
}

export class DynamicCharge extends SimObject {
  constructor(position) {
    super();
    this.velocity = new THREE.Vector3();
    this.accel = new THREE.Vector3();
    this.avgAccel = new THREE.Vector3();
    this.tempDir = new THREE.Vector3();
    this.forceArrow = null;
    this.velocityArrow = null;
    this.trailData = [];
    this.trailLine = null;
    this.trailPosAttr = null;
    if (position) this.mesh.position.copy(position);
  }

  init(scene) {
    super.init(scene);

    // Orange velocity arrow, green force arrow — both use thick 3D geom
    this.velocityArrow = createThickArrow(0xffaa00, 1, 0.4, 0.25);
    this.velocityArrow.position.copy(this.position);
    this.velocityArrow.visible = false;
    scene.add(this.velocityArrow);

    this.forceArrow = createThickArrow(0x00ff00, 1, 0.4, 0.25);
    this.forceArrow.position.copy(this.position);
    this.forceArrow.visible = false;
    scene.add(this.forceArrow);

    // Yellow fading trail — stores up to 10 seconds of movement
    const trailMat = new THREE.LineBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.4,
    });
    this.trailLine = new THREE.Line(new THREE.BufferGeometry(), trailMat);
    scene.add(this.trailLine);
  }

  destroy(scene) {
    if (this.forceArrow) scene.remove(this.forceArrow);
    if (this.velocityArrow) scene.remove(this.velocityArrow);
    if (this.trailLine) scene.remove(this.trailLine);
    super.destroy(scene);
  }

  update(dt) {
    const subDt = dt / SUBSTEPS;
    this.avgAccel.set(0, 0, 0);

    // Multiple sub-steps per frame = stable integration
    for (let step = 0; step < SUBSTEPS; step++) {
      this.accel.set(0, 0, 0);

      // Coulomb force from every other charge
      for (const other of world.objects) {
        if (other === this) continue;
        const ct = other.constructor.chargeType;
        if (!ct) continue;

        // Like charges repel, opposites attract — softened to avoid blow-ups
        this.tempDir.subVectors(this.position, other.position);
        const distSq = this.tempDir.lengthSq() + SOFTENING * SOFTENING;

        const sameType = this.constructor.chargeType === ct;
        const forceMag = ((sameType ? 1 : -1) * K) / distSq;

        this.tempDir.normalize().multiplyScalar(forceMag);
        this.accel.add(this.tempDir);
      }

      // Lorentz force from magnetic boxes: F = q * v × B
      const q = this.constructor.chargeType === "positive" ? 1 : -1;
      for (const obj of world.objects) {
        if (typeof obj.getField !== "function") continue;
        const B = obj.getField(this.position);
        if (!B) continue;
        lorentzTemp.crossVectors(this.velocity, B).multiplyScalar(q);
        this.accel.add(lorentzTemp);
      }

      // Semi-implicit Euler: update velocity first, then position
      this.avgAccel.add(this.accel);
      this.velocity.addScaledVector(this.accel, subDt);
      this.position.addScaledVector(this.velocity, subDt);
    }

    this.updateForceArrow();
    this.updateVelocityArrow();
    this.updateTrail();
  }

  updateVelocityArrow() {
    if (!this.velocityArrow) return;
    const len = this.velocity.length();
    if (len > 0.01) {
      this.velocityArrow.position.copy(this.position);
      const dir = this.velocity.clone().normalize();
      setThickArrowDir(this.velocityArrow, dir);
      // Scale length with speed but cap so it doesn't overwhelm the scene
      const arrowLen = Math.min(len * 0.8, 5);
      const headLen = Math.min(arrowLen * 0.35, 0.7);
      const headW = Math.min(headLen * 0.5, 0.4);
      updateThickArrow(this.velocityArrow, arrowLen, headLen, headW);
      this.velocityArrow.visible = true;
    } else {
      this.velocityArrow.visible = false;
    }
  }

  updateForceArrow() {
    if (!this.forceArrow) return;
    this.avgAccel.divideScalar(SUBSTEPS);
    const len = this.avgAccel.length();

    if (len > 0.01) {
      this.forceArrow.position.copy(this.position);
      const dir = this.avgAccel.clone().normalize();
      setThickArrowDir(this.forceArrow, dir);
      // Same sizing as velocity arrows but force can be bigger
      const arrowLen = Math.min(len * 3, 6);
      const headLen = Math.min(arrowLen * 0.3, 0.8);
      const headW = Math.min(headLen * 0.5, 0.4);
      updateThickArrow(this.forceArrow, arrowLen, headLen, headW);
      this.forceArrow.visible = true;
    } else {
      this.forceArrow.visible = false;
    }
  }

  updateTrail() {
    if (!this.trailLine) return;

    const now = performance.now();
    this.trailData.push({
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      time: now,
    });
    // Drop points older than TRAIL_DURATION
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
      this.trailPosAttr = new THREE.Float32BufferAttribute(
        new Float32Array(MAX_TRAIL_POINTS * 3),
        3,
      );
      this.trailLine.geometry.setAttribute("position", this.trailPosAttr);
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

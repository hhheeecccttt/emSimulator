import * as THREE from "three";
import { registerType } from "../ObjectRegistry.js";

const FIELD_STRENGTH = 2;

// An axis-aligned box that applies a uniform B-field to particles inside it
export class MagneticBox {
  constructor(corner1, corner2, fieldDir, fieldStrength) {
    this.active = true;

    // Compute the axis-aligned extents from the two user-placed corners
    this.min = new THREE.Vector3(
      Math.min(corner1.x, corner2.x),
      Math.min(corner1.y, corner2.y),
      Math.min(corner1.z, corner2.z),
    );
    this.max = new THREE.Vector3(
      Math.max(corner1.x, corner2.x),
      Math.max(corner1.y, corner2.y),
      Math.max(corner1.z, corner2.z),
    );
    this.center = new THREE.Vector3()
      .addVectors(this.min, this.max)
      .multiplyScalar(0.5);
    this.size = new THREE.Vector3().subVectors(this.max, this.min);

    this.fieldDir = (fieldDir || new THREE.Vector3(0, 1, 0))
      .clone()
      .normalize();
    this.fieldStrength = fieldStrength || FIELD_STRENGTH;

    this.boxGroup = new THREE.Group();
    this.boxGroup.position.copy(this.center);
    this.arrows = [];
    this.boxMesh = null;
    this.boxFrame = null;
  }

  init(scene) {
    scene.add(this.boxGroup);
    this.buildBoxVisuals();
  }

  destroy(scene) {
    scene.remove(this.boxGroup);
    // Walk the group and dispose everything so we don't leak
    this.boxGroup.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }

  buildBoxVisuals() {
    const w = this.size.x,
      h = this.size.y,
      d = this.size.z;
    if (w < 0.01 || h < 0.01 || d < 0.01) return;

    // Semi-transparent fill + wireframe edges
    const boxGeo = new THREE.BoxGeometry(w, h, d);
    const boxMat = new THREE.MeshPhongMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.boxMesh = new THREE.Mesh(boxGeo, boxMat);
    this.boxGroup.add(this.boxMesh);

    const edges = new THREE.EdgesGeometry(boxGeo);
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.7,
    });
    this.boxFrame = new THREE.LineSegments(edges, edgeMat);
    this.boxGroup.add(this.boxFrame);

    // Grid of arrows inside the box — uniform direction, fixed size
    const spacing = Math.max(w, h, d) / 3;
    const nx = Math.max(2, Math.round(w / spacing));
    const ny = Math.max(2, Math.round(h / spacing));
    const nz = Math.max(2, Math.round(d / spacing));

    for (let ix = 0; ix < nx; ix++) {
      for (let iy = 0; iy < ny; iy++) {
        for (let iz = 0; iz < nz; iz++) {
          const px = -w / 2 + (ix + 0.5) * (w / nx);
          const py = -h / 2 + (iy + 0.5) * (h / ny);
          const pz = -d / 2 + (iz + 0.5) * (d / nz);

          const arrow = new THREE.ArrowHelper(
            this.fieldDir,
            new THREE.Vector3(px, py, pz),
            0.8,
            0x44aaff,
            0.3,
            0.2,
          );
          this.boxGroup.add(arrow);
          this.arrows.push(arrow);
        }
      }
    }
  }

  getField(point) {
    // Returns the B-field vector if the point is inside the box, null otherwise
    if (point.x < this.min.x || point.x > this.max.x) return null;
    if (point.y < this.min.y || point.y > this.max.y) return null;
    if (point.z < this.min.z || point.z > this.max.z) return null;
    return this.fieldDir.clone().multiplyScalar(this.fieldStrength);
  }

  get position() {
    return this.center;
  }

  getTargetMeshes() {
    const meshes = [];
    this.boxGroup.traverse((child) => {
      if (child.isMesh) meshes.push(child);
    });
    return meshes;
  }

  update(dt) {}

  static get id() {
    return "magneticBox";
  }
  static get label() {
    return "Magnetic Field Box";
  }
  static get chargeType() {
    return null;
  }
  static get ghostColor() {
    return 0x4488ff;
  }

  static createGhost() {
    return null;
  }
  static async loadModel() {}
}

registerType(MagneticBox);

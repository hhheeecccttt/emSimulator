import * as THREE from "three";
import { SimObject } from "../SimObject.js";
import { registerType } from "../ObjectRegistry.js";

export class Sphere extends SimObject {
  static id = "sphere";
  static label = "Sphere";
  static ghostColor = 0x00ff00;
  static createGhostGeom() {
    return new THREE.SphereGeometry(0.6, 24, 24);
  }

  constructor(position) {
    super();
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 24, 24),
      new THREE.MeshPhongMaterial({ color: 0x00ff00 }),
    );
    if (position) this.mesh.position.copy(position);
  }
}
registerType(Sphere);

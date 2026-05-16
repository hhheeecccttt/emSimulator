import * as THREE from 'three';
import { SimObject } from '../SimObject.js';
import { registerType } from '../ObjectRegistry.js';

export class Cylinder extends SimObject {
    static id = 'cylinder';
    static label = 'Cylinder';
    static ghostColor = 0x0088ff;
    static createGhostGeom() { return new THREE.CylinderGeometry(0.5, 0.5, 1, 24); }

    constructor(position) {
        super();
        //Custom Variables Here
        this.mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 0.5, 1, 24),
            new THREE.MeshPhongMaterial({ color: 0x0088ff })
        );
        if (position) this.mesh.position.copy(position);
    }
}
registerType(Cylinder);

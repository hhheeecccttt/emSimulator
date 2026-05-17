import * as THREE from 'three';
import { SimObject } from '../SimObject.js';
import { registerType } from '../ObjectRegistry.js';

export class Cube extends SimObject {
    static id = 'cube';
    static label = 'Cube';
    static ghostColor = 0xff0000;
    static createGhostGeom() { return new THREE.BoxGeometry(1, 1, 1); }

    constructor(position) {
        super();
        this.mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshPhongMaterial({ color: 0xff0000 })
        );
        if (position) this.mesh.position.copy(position);
    }
}
registerType(Cube);

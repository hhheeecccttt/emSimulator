import * as THREE from 'three';
import { GLTFLoader } from '../three_local/GLTFLoader.js';

export class SimObject {
    constructor() {
        this.mesh = null;
        this.active = true;
        if (this.constructor._loadedScene) {
            this.mesh = this.constructor._loadedScene.clone(true);
            const s = this.constructor.scale;
            if (s !== 1) this.mesh.scale.set(s, s, s);
        }
    }

    init(scene) { if (this.mesh) scene.add(this.mesh); }
    destroy(scene) { if (this.mesh) scene.remove(this.mesh); }
    update(dt) {}

    get position() { return this.mesh?.position; }
    get rotation() { return this.mesh?.rotation; }

    static get id() { return ''; }
    static get label() { return ''; }
    static get ghostColor() { return 0xffffff; }
    static get modelUrl() { return null; }
    static get chargeType() { return null; }
    static get isStatic() { return false; }
    static get scale() { return 1; }

    static createGhostGeom() { return null; }

    static async loadModel() {
        if (!this.modelUrl || this._loadedScene) return;
        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();
            loader.load(this.modelUrl, (gltf) => {
                this._loadedScene = gltf.scene || gltf.scenes[0];
                resolve();
            }, undefined, reject);
        });
    }

    static createGhost() {
        if (this._loadedScene) {
            const ghost = this._loadedScene.clone(true);
            ghost.renderOrder = 999;
            ghost.traverse(child => {
                if (child.isMesh) {
                    child.material = child.material.clone();
                    child.material.transparent = true;
                    child.material.opacity = 0.75;
                    child.material.depthWrite = false;
                    child.renderOrder = 999;
                }
            });
            ghost.userData.typeId = this.id;
            return ghost;
        }
        const geo = this.createGhostGeom();
        if (!geo) return null;
        const mat = new THREE.MeshPhongMaterial({
            color: this.ghostColor,
            transparent: true,
            opacity: 0.4,
            depthWrite: false
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = 999;
        mesh.userData.typeId = this.id;
        return mesh;
    }
}

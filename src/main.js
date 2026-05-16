import * as THREE from 'three';
import { PointerLockControls } from '../three_local/PointerLockControls.js';

import './objects/Cube.js';
import './objects/Sphere.js';
import './objects/Cylinder.js';
import './objects/positiveCharge.js';
import './objects/negativeCharge.js';
import './objects/staticPositiveCharge.js';
import './objects/staticNegativeCharge.js';
import { initGhostSystem, startPlacement, updateGhostPosition, isPlacing, cancelPlacement, isCharging, isHolding, tickCharge, getChargeLevel } from './PlacementGhost.js';
import { initContextMenu } from './ContextMenu.js';
import { loadAllModels } from './ObjectRegistry.js';
import { world } from './WorldState.js';
import { ElectricField } from './electricField.js';
import { ElectricPotential } from './electricPotential.js';
import { DynamicCharge } from './objects/DynamicCharge.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x20232a);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const directionalLight1 = new THREE.DirectionalLight(0xffffff, 2);
const directionalLight2 = new THREE.DirectionalLight(0xffffff, 2);
directionalLight1.position.set(5, 10, 7);
directionalLight2.position.set(-5, 10, -7);
scene.add(directionalLight1);
scene.add(directionalLight2);
scene.add(new THREE.AmbientLight(0x404040));

const controls = new PointerLockControls(camera, renderer.domElement);

const placedObjects = [];
world.objects = placedObjects;

initGhostSystem(scene, camera);
const chargeMeterFill = document.getElementById('chargeMeterFill');
initContextMenu(controls, (typeId) => {
    startPlacement(typeId);
}, (obj) => {
    obj.init(scene);
    placedObjects.push(obj);
    fieldViz.update();
    potentialViz.update();
});

const move = { forward: false, backward: false, left: false, right: false, up: false, down: false };
const speed = 0.1;

document.addEventListener('keydown', e => {
    if (e.code === 'KeyQ' && isPlacing()) { cancelPlacement(); return; }
    if (e.code === 'KeyW') move.forward = true;
    if (e.code === 'KeyS') move.backward = true;
    if (e.code === 'KeyA') move.left = true;
    if (e.code === 'KeyD') move.right = true;
    if (e.code === 'Space') move.up = true;
    if (e.code === 'ShiftLeft') move.down = true;

    if (e.code === 'Digit1') {
        state.charges = !state.charges;
        for (const obj of placedObjects) {
            if (obj instanceof DynamicCharge) obj.active = state.charges;
        }
    } else if (e.code === 'Digit2') state.vectors = !state.vectors;
    else if (e.code === 'Digit3') fieldViz.setVisible(!fieldViz.enabled);
    else if (e.code === 'Digit4') potentialViz.setVisible(!potentialViz.surface.visible);
    else if (e.code === 'Digit5') potentialViz.setContoursVisible(!potentialViz.contours.visible);
});

document.addEventListener('keyup', e => {
    if (e.code === 'KeyW') move.forward = false;
    if (e.code === 'KeyS') move.backward = false;
    if (e.code === 'KeyA') move.left = false;
    if (e.code === 'KeyD') move.right = false;
    if (e.code === 'Space') move.up = false;
    if (e.code === 'ShiftLeft') move.down = false;
});

const dir = new THREE.Vector3(1, 0, 0);
const origin = new THREE.Vector3(0, 1, 0);
const arrow = new THREE.ArrowHelper(dir, origin, 2, 0xffff00);
scene.add(arrow);

const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper);

const fieldViz = new ElectricField(scene);
const potentialViz = new ElectricPotential(scene);

const state = { charges: true, vectors: true };

let lastTime = performance.now();
const cameraVelocity = new THREE.Vector3();

function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    cameraVelocity.set(0, 0, 0);
    if (move.forward) cameraVelocity.z += speed;
    if (move.backward) cameraVelocity.z -= speed;
    if (move.left) cameraVelocity.x -= speed;
    if (move.right) cameraVelocity.x += speed;
    if (move.up) cameraVelocity.y += speed;
    if (move.down) cameraVelocity.y -= speed;

    controls.moveRight(cameraVelocity.x);
    controls.moveForward(cameraVelocity.z);
    camera.position.y += cameraVelocity.y;

    if (isPlacing() && !isCharging() && !isHolding()) updateGhostPosition();

    tickCharge();

    if (isCharging()) {
        chargeMeterFill.style.width = (getChargeLevel() * 100) + '%';
    }

    for (const obj of placedObjects) {
        if (obj.active) obj.update(dt);
        if (obj instanceof DynamicCharge && obj.forceArrow) {
            obj.forceArrow.visible = state.vectors && obj.forceArrow.visible;
        }
    }

    renderer.render(scene, camera);
}

loadAllModels().then(() => {
    document.getElementById('loading')?.remove();
    animate();
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

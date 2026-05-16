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

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x20232a);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
directionalLight.position.set(5, 10, 7);
scene.add(directionalLight);
scene.add(new THREE.AmbientLight(0x404040));

const controls = new PointerLockControls(camera, renderer.domElement);

const placedObjects = [];
world.objects = placedObjects;

initGhostSystem(scene, camera);
initContextMenu(controls, (typeId) => {
    startPlacement(typeId);
}, (obj) => {
    obj.init(scene);
    placedObjects.push(obj);
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
});

document.addEventListener('keyup', e => {
    if (e.code === 'KeyW') move.forward = false;
    if (e.code === 'KeyS') move.backward = false;
    if (e.code === 'KeyA') move.left = false;
    if (e.code === 'KeyD') move.right = false;
    if (e.code === 'Space') move.up = false;
    if (e.code === 'ShiftLeft') move.down = false;
});

const groundGeo = new THREE.PlaneGeometry(100, 100);
const groundMat = new THREE.MeshPhongMaterial({ color: 0x808080 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const cubeGeo = new THREE.BoxGeometry();
const cubeMat = new THREE.MeshPhongMaterial({ color: 0xff0000 });
const cube = new THREE.Mesh(cubeGeo, cubeMat);
cube.position.set(0, 1, -5);
scene.add(cube);

const dir = new THREE.Vector3(1, 0, 0);
const origin = new THREE.Vector3(0, 1, 0);
const arrow = new THREE.ArrowHelper(dir, origin, 2, 0xffff00);
scene.add(arrow);

const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper);

const fieldViz = new ElectricField(scene);

let lastTime = performance.now();

function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    const velocity = new THREE.Vector3();
    if (move.forward) velocity.z += speed;
    if (move.backward) velocity.z -= speed;
    if (move.left) velocity.x -= speed;
    if (move.right) velocity.x += speed;
    if (move.up) velocity.y += speed;
    if (move.down && camera.position.y > 0.5) velocity.y -= speed;

    controls.moveRight(velocity.x);
    controls.moveForward(velocity.z);
    camera.position.y += velocity.y;

    if (isPlacing() && !isCharging() && !isHolding()) updateGhostPosition();

    tickCharge();

    if (isCharging()) {
        document.getElementById('chargeMeterFill').style.width = (getChargeLevel() * 100) + '%';
    }

    for (const obj of placedObjects) {
        if (obj.active) obj.update(dt);
    }

    fieldViz.update();

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

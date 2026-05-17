import * as THREE from "three";
import { PointerLockControls } from "../three_local/PointerLockControls.js";

import "./objects/Cube.js";
import "./objects/Sphere.js";
import "./objects/Cylinder.js";
import "./objects/positiveCharge.js";
import "./objects/negativeCharge.js";
import "./objects/staticPositiveCharge.js";
import "./objects/staticNegativeCharge.js";
import {
  initGhostSystem,
  startPlacement,
  updateGhostPosition,
  isPlacing,
  cancelPlacement,
  isCharging,
  isHolding,
  tickCharge,
  getChargeLevel,
} from "./PlacementGhost.js";
import { initContextMenu } from "./ContextMenu.js";
import { loadAllModels } from "./ObjectRegistry.js";
import { world } from "./WorldState.js";
import { ElectricField } from "./electricField.js";
import { ElectricPotential } from "./electricPotential.js";
import { DynamicCharge } from "./objects/DynamicCharge.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x20232a);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(0, 2, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const light1 = new THREE.DirectionalLight(0xffffff, 2);
const light2 = new THREE.DirectionalLight(0xffffff, 2);
light1.position.set(5, 10, 7);
light2.position.set(-5, 10, -7);
scene.add(light1, light2, new THREE.AmbientLight(0x404040));

const controls = new PointerLockControls(camera, renderer.domElement);

renderer.domElement.addEventListener("click", () => {
  if (!document.pointerLockElement) controls.lock();
});

const placedObjects = [];
world.objects = placedObjects;

initGhostSystem(scene, camera);
const chargeMeterFill = document.getElementById("chargeMeterFill");
initContextMenu(
  controls,
  (typeId) => {
    startPlacement(typeId);
  },
  (obj) => {
    obj.init(scene);
    placedObjects.push(obj);
    field.update();
    potential.update();
  },
);

const move = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  up: false,
  down: false,
};
const speed = 0.1;
const toggles = { physicsEnabled: true, showForceVectors: true };

document.addEventListener("keydown", (e) => {
  if (e.code === "KeyQ" && isPlacing()) {
    cancelPlacement();
    return;
  }
  if (e.code === "KeyW") move.forward = true;
  if (e.code === "KeyS") move.backward = true;
  if (e.code === "KeyA") move.left = true;
  if (e.code === "KeyD") move.right = true;
  if (e.code === "Space") move.up = true;
  if (e.code === "ShiftLeft") move.down = true;

  if (e.code === "Digit1") {
    toggles.physicsEnabled = !toggles.physicsEnabled;
    for (const obj of placedObjects) {
      if (obj instanceof DynamicCharge) obj.active = toggles.physicsEnabled;
    }
  } else if (e.code === "Digit2") {
    toggles.showForceVectors = !toggles.showForceVectors;
  } else if (e.code === "Digit3") {
    field.setVisible(!field.enabled);
  } else if (e.code === "Digit4") {
    potential.setVisible(!potential.surface.visible);
  } else if (e.code === "Digit5") {
    potential.toggleColor();
  } else if (e.code === "Digit6") {
    potential.setContoursVisible(!potential.contours.visible);
  }
});

document.addEventListener("keyup", (e) => {
  if (e.code === "KeyW") move.forward = false;
  if (e.code === "KeyS") move.backward = false;
  if (e.code === "KeyA") move.left = false;
  if (e.code === "KeyD") move.right = false;
  if (e.code === "Space") move.up = false;
  if (e.code === "ShiftLeft") move.down = false;
});

const field = new ElectricField(scene);
const potential = new ElectricPotential(scene);

const raycaster = new THREE.Raycaster();
const crosshair = document.getElementById("crosshair");
let targetedObject = null;

function getTargetInfo() {
  const meshes = [];
  const ownerMap = new Map();
  for (const obj of placedObjects) {
    if (!obj.mesh) continue;
    obj.mesh.traverse((child) => {
      if (child.isMesh) {
        meshes.push(child);
        ownerMap.set(child.uuid, obj);
      }
    });
  }
  return { meshes, ownerMap };
}

document.addEventListener("mousedown", (e) => {
  if (e.button !== 0 || isPlacing() || !targetedObject) return;
  const obj = targetedObject;
  targetedObject = null;
  obj.destroy(scene);
  const idx = placedObjects.indexOf(obj);
  if (idx >= 0) placedObjects.splice(idx, 1);
  startPlacement(obj.constructor.id);
  field.update();
  potential.update();
});

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

  if (!isPlacing()) {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const { meshes, ownerMap } = getTargetInfo();
    const hits = raycaster.intersectObjects(meshes, false);
    const closeHit = hits.find((h) => h.distance < 5);
    targetedObject = closeHit ? ownerMap.get(closeHit.object.uuid) : null;
  } else {
    targetedObject = null;
  }
  crosshair.classList.toggle("aiming", !!targetedObject);

  if (isPlacing() && !isCharging() && !isHolding()) updateGhostPosition();

  tickCharge();

  if (isCharging()) {
    chargeMeterFill.style.width = getChargeLevel() * 100 + "%";
  }

  for (const obj of placedObjects) {
    if (obj.active) obj.update(dt);
    if (obj instanceof DynamicCharge && obj.forceArrow) {
      obj.forceArrow.visible =
        toggles.showForceVectors && obj.forceArrow.visible;
    }
  }

  renderer.render(scene, camera);
}

loadAllModels().then(() => {
  document.getElementById("loading")?.remove();
  animate();
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

import * as THREE from "three";
import { PointerLockControls } from "../three_local/PointerLockControls.js";

import "./objects/Cube.js";
import "./objects/Sphere.js";
import "./objects/Cylinder.js";
import "./objects/positiveCharge.js";
import "./objects/negativeCharge.js";
import "./objects/staticPositiveCharge.js";
import "./objects/staticNegativeCharge.js";
import "./objects/MagneticBox.js";
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
import { loadAllModels, getType } from "./ObjectRegistry.js";
import { world } from "./WorldState.js";
import { ElectricField } from "./electricField.js";
import { ElectricPotential } from "./electricPotential.js";
import { DynamicCharge } from "./objects/DynamicCharge.js";
import { MagneticBox } from "./objects/MagneticBox.js";
import { PLACEMENT_DISTANCE } from "./constants.js";

// Scene, camera, renderer — standard three.js setup
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

// Directional + ambient so objects don't look flat
const light1 = new THREE.DirectionalLight(0xffffff, 2);
const light2 = new THREE.DirectionalLight(0xffffff, 2);
light1.position.set(5, 10, 7);
light2.position.set(-5, 10, -7);
scene.add(light1, light2, new THREE.AmbientLight(0x404040));

const controls = new PointerLockControls(camera, renderer.domElement);

// Click canvas to grab mouse pointer
renderer.domElement.addEventListener("click", () => {
  if (!document.pointerLockElement) controls.lock();
});

// Track all placed objects here
const placedObjects = [];
world.objects = placedObjects;

initGhostSystem(scene, camera);
const chargeMeterFill = document.getElementById("chargeMeterFill");

// Box placement mode state — click corner1, drag to corner2, release
let boxPlacementMode = false;
let boxCorner1 = null;
let boxPreview = null;
let groundDot = null;
let guideLine = null;
const boxPreviewMat = new THREE.MeshPhongMaterial({
  color: 0x4488ff,
  transparent: true,
  opacity: 0.1,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const boxPreviewWireMat = new THREE.LineBasicMaterial({
  color: 0x4488ff,
  transparent: true,
  opacity: 0.4,
});

// Project camera aim onto a point PLACEMENT_DISTANCE away, clamped above ground
function getPlacementPoint() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const p = camera.position.clone().add(dir.multiplyScalar(PLACEMENT_DISTANCE));
  if (p.y < 1) p.y = 1;
  return p;
}

function updateGroundDot() {
  if (!boxPlacementMode) {
    clearGroundDot();
    return;
  }
  const p = getPlacementPoint();
  if (!groundDot) {
    // Small green sphere — shows where the next corner will go
    const dotGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x44ff88 });
    groundDot = new THREE.Mesh(dotGeo, dotMat);
    scene.add(groundDot);
  }
  if (boxCorner1) {
    groundDot.position.copy(boxCorner1);
  } else {
    groundDot.position.copy(p);
  }
}

// Axis-aligned bounding box preview from two 3D corners
function buildBoxPreview(corner1, corner2) {
  clearBoxPreview();
  if (!corner1 || !corner2) return;
  const x1 = Math.min(corner1.x, corner2.x);
  const x2 = Math.max(corner1.x, corner2.x);
  const y1 = Math.min(corner1.y, corner2.y);
  const y2 = Math.max(corner1.y, corner2.y);
  const z1 = Math.min(corner1.z, corner2.z);
  const z2 = Math.max(corner1.z, corner2.z);
  const w = x2 - x1;
  const h = y2 - y1;
  const d = z2 - z1;
  if (w < 0.01 || h < 0.01 || d < 0.01) return;

  const center = new THREE.Vector3((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
  boxPreview = new THREE.Group();
  boxPreview.position.copy(center);

  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, boxPreviewMat);
  boxPreview.add(mesh);

  const edges = new THREE.EdgesGeometry(geo);
  const wire = new THREE.LineSegments(edges, boxPreviewWireMat);
  boxPreview.add(wire);

  scene.add(boxPreview);
}

function clearBoxPreview() {
  if (boxPreview) {
    scene.remove(boxPreview);
    // Clean up geometries so we don't leak memory each rebuild
    boxPreview.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
    });
    boxPreview = null;
  }
}

function clearGroundDot() {
  if (groundDot) {
    scene.remove(groundDot);
    groundDot = null;
  }
  if (guideLine) {
    scene.remove(guideLine);
    guideLine = null;
  }
}

function updateGuideLine() {
  const active = boxPlacementMode || isPlacing();
  if (!active) {
    if (guideLine) { scene.remove(guideLine); guideLine = null; }
    return;
  }
  // Vertical line from placement point down to ground
  let top;
  if (boxPlacementMode) {
    if (boxCorner1) top = boxCorner1;
    else top = getPlacementPoint();
  } else if (isPlacing()) {
    top = getPlacementPoint();
  } else {
    if (guideLine) { scene.remove(guideLine); guideLine = null; }
    return;
  }
  if (!guideLine) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(6);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.3 });
    guideLine = new THREE.Line(geo, mat);
    scene.add(guideLine);
  }
  const pos = guideLine.geometry.attributes.position.array;
  pos[0] = top.x; pos[1] = top.y; pos[2] = top.z;
  pos[3] = top.x; pos[4] = 0;     pos[5] = top.z;
  guideLine.geometry.attributes.position.needsUpdate = true;
}

// Build the actual box and push it into the scene
function confirmBoxPlacement(corner1, corner2) {
  if (!corner1 || !corner2) return;
  const box = new MagneticBox(corner1, corner2);
  box.init(scene);
  placedObjects.push(box);
  clearBoxPreview();
  clearGroundDot();
  boxCorner1 = null;
  boxPlacementMode = false;
}

// Wire up the right-click menu — magnetic boxes go through a special drag-to-place path
initContextMenu(
  controls,
  (typeId) => {
    if (typeId === "magneticBox") {
      cancelPlacement();
      boxPlacementMode = true;
      boxCorner1 = null;
      clearBoxPreview();
    } else {
      boxPlacementMode = false;
      boxCorner1 = null;
      clearBoxPreview();
      clearGroundDot();
      startPlacement(typeId);
    }
  },
  (obj) => {
    obj.init(scene);
    placedObjects.push(obj);
    field.update();
    potential.update();
  },
);

// Keyboard movement flags — polled each frame, not event-driven
const move = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  up: false,
  down: false,
};
const speed = 0.1;
// Shared physics / viz toggles
const toggles = {
  physicsEnabled: true,
  showForceVectors: true,
  showVelocityVectors: true,
};

document.addEventListener("keydown", (e) => {
  // Q = cancel current ghost, or grab a hovered object
  if (e.code === "KeyQ" && isPlacing()) {
    cancelPlacement();
    return;
  }
  if (e.code === "KeyQ" && !isPlacing() && targetedObject) {
    const obj = targetedObject;
    targetedObject = null;
    obj.destroy(scene);
    const idx = placedObjects.indexOf(obj);
    if (idx >= 0) placedObjects.splice(idx, 1);
    if (obj instanceof MagneticBox) {
      boxPlacementMode = true;
      boxCorner1 = null;
      clearBoxPreview();
    } else {
      startPlacement(obj.constructor.id);
    }
    field.update();
    potential.update();
    return;
  }
  // E = bail out of box placement
  if (e.code === "KeyE" && boxPlacementMode) {
    boxPlacementMode = false;
    boxCorner1 = null;
    clearBoxPreview();
    clearGroundDot();
    return;
  }
  if (e.code === "KeyW") move.forward = true;
  if (e.code === "KeyS") move.backward = true;
  if (e.code === "KeyA") move.left = true;
  if (e.code === "KeyD") move.right = true;
  if (e.code === "Space") move.up = true;
  if (e.code === "ShiftLeft") move.down = true;

  // Number keys toggle visual layers
  if (e.code === "Digit1") {
    toggles.physicsEnabled = !toggles.physicsEnabled;
    // Run physics + update arrows for every placed object
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
  } else if (e.code === "Digit7") {
    toggles.showVelocityVectors = !toggles.showVelocityVectors;
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

// Raycaster for object targeting — tells us what's under the crosshair
const field = new ElectricField(scene);
const potential = new ElectricPotential(scene);
const raycaster = new THREE.Raycaster();
const crosshair = document.getElementById("crosshair");
let targetedObject = null;

// Collect all meshes we can click on, mapped back to their owning object
function getTargetInfo() {
  const meshes = [];
  const ownerMap = new Map();
  for (const obj of placedObjects) {
    if (obj.mesh) {
      obj.mesh.traverse((child) => {
        if (child.isMesh) {
          meshes.push(child);
          ownerMap.set(child.uuid, obj);
        }
      });
    }
    if (typeof obj.getTargetMeshes === "function") {
      for (const m of obj.getTargetMeshes()) {
        meshes.push(m);
        ownerMap.set(m.uuid, obj);
      }
    }
  }
  return { meshes, ownerMap };
}

// Left click = set first corner when placing a box
document.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;

  if (boxPlacementMode) {
    const p = getPlacementPoint();
    if (p) {
      boxCorner1 = p.clone();
    }
    return;
  }

  if (isPlacing()) return;
});

// Release = finalize second corner and place the box
document.addEventListener("mouseup", (e) => {
  if (e.button !== 0) return;
  if (boxPlacementMode && boxCorner1) {
    const corner2 = getPlacementPoint();
    if (corner2) {
      confirmBoxPlacement(boxCorner1, corner2);
    } else {
      boxCorner1 = null;
      clearBoxPreview();
      clearGroundDot();
      boxPlacementMode = false;
    }
  }
});

// While dragging in box mode, update the preview box to match
document.addEventListener("mousemove", () => {
  if (boxPlacementMode && boxCorner1) {
    const corner2 = getPlacementPoint();
    if (corner2) {
      buildBoxPreview(boxCorner1, corner2);
    }
  }
});

let lastTime = performance.now();
const cameraVelocity = new THREE.Vector3();

// Main animation loop — delta time, camera movement, physics, render
function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  // WASD flying relative to camera heading
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

  // Crosshair targeting — only when not placing
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

  // Update ghost position and charge meter
  if (isPlacing() && !isCharging() && !isHolding()) updateGhostPosition();

  updateGroundDot();
  updateGuideLine();

  tickCharge();

  if (isCharging()) {
    chargeMeterFill.style.width = getChargeLevel() * 100 + "%";
  }

  for (const obj of placedObjects) {
    if (obj.active) obj.update(dt);
    if (obj instanceof DynamicCharge) {
      if (obj.forceArrow) {
        obj.forceArrow.visible =
          toggles.showForceVectors && obj.forceArrow.visible;
      }
      if (obj.velocityArrow) {
        obj.velocityArrow.visible =
          toggles.showVelocityVectors && obj.velocityArrow.visible;
      }
    }
  }

  renderer.render(scene, camera);
}

// Load all GLTF models first, then start the loop
loadAllModels().then(() => {
  document.getElementById("loading")?.remove();
  animate();
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

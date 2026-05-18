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
import "./objects/FieldProbe.js";
import "./objects/CurrentWire.js";
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
import { CurrentWire } from "./objects/CurrentWire.js";
import { PLACEMENT_DISTANCE } from "./constants.js";
import {
  getChargeSI,
  fmtSI,
  fmtVector,
  fmtDir,
} from "./physics/units.js";

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
world.camera = camera;

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

// Drag-to-place modes — click corner1, drag to corner2, release
let dragMode = null; // null, "magneticBox", "currentWire"
let dragCorner1 = null;
let dragPreview = null;
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
  if (!dragMode) {
    clearGroundDot();
    return;
  }
  const p = getPlacementPoint();
  if (!groundDot) {
    const dotGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x44ff88 });
    groundDot = new THREE.Mesh(dotGeo, dotMat);
    scene.add(groundDot);
  }
  if (dragCorner1) {
    groundDot.position.copy(dragCorner1);
  } else {
    groundDot.position.copy(p);
  }
}

function clearPreview() {
  if (dragPreview) {
    scene.remove(dragPreview);
    dragPreview.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
    });
    dragPreview = null;
  }
}

function buildBoxPreview(corner1, corner2) {
  clearPreview();
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
  dragPreview = new THREE.Group();
  dragPreview.position.copy(center);

  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, boxPreviewMat);
  dragPreview.add(mesh);

  const edges = new THREE.EdgesGeometry(geo);
  const wire = new THREE.LineSegments(edges, boxPreviewWireMat);
  dragPreview.add(wire);

  scene.add(dragPreview);
}

function buildWirePreview(corner1, corner2) {
  clearPreview();
  if (!corner1 || !corner2) return;
  const dir = new THREE.Vector3().subVectors(corner2, corner1);
  const len = dir.length();
  if (len < 0.05) return;
  const mid = new THREE.Vector3().addVectors(corner1, corner2).multiplyScalar(0.5);

  dragPreview = new THREE.Group();
  dragPreview.position.copy(mid);

  const cylGeo = new THREE.CylinderGeometry(0.06, 0.06, len, 8);
  const cylMat = new THREE.MeshPhongMaterial({
    color: 0xcc8844,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(cylGeo, cylMat);
  // Orient cylinder along the direction
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
  mesh.quaternion.copy(quat);
  dragPreview.add(mesh);

  scene.add(dragPreview);
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
  const active = dragMode || isPlacing();
  if (!active) {
    if (guideLine) {
      scene.remove(guideLine);
      guideLine = null;
    }
    return;
  }
  let top;
  if (dragMode) {
    if (dragCorner1) top = dragCorner1;
    else top = getPlacementPoint();
  } else if (isPlacing()) {
    top = getPlacementPoint();
  } else {
    if (guideLine) {
      scene.remove(guideLine);
      guideLine = null;
    }
    return;
  }
  if (!guideLine) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(6);
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.3,
    });
    guideLine = new THREE.Line(geo, mat);
    scene.add(guideLine);
  }
  const pos = guideLine.geometry.attributes.position.array;
  pos[0] = top.x;
  pos[1] = top.y;
  pos[2] = top.z;
  pos[3] = top.x;
  pos[4] = 0;
  pos[5] = top.z;
  guideLine.geometry.attributes.position.needsUpdate = true;
}

function confirmBoxPlacement(corner1, corner2) {
  if (!corner1 || !corner2) return;
  const box = new MagneticBox(corner1, corner2);
  box.init(scene);
  placedObjects.push(box);
  clearPreview();
  clearGroundDot();
  dragCorner1 = null;
  dragMode = null;
  field.update();
  potential.update();
}

function confirmWirePlacement(corner1, corner2) {
  if (!corner1 || !corner2) return;
  const wire = new CurrentWire(corner1, corner2);
  wire.init(scene);
  placedObjects.push(wire);
  clearPreview();
  clearGroundDot();
  dragCorner1 = null;
  dragMode = null;
  field.update();
  potential.update();
}

initContextMenu(
  controls,
  (typeId) => {
    if (typeId === "magneticBox" || typeId === "currentWire") {
      cancelPlacement();
      dragMode = typeId;
      dragCorner1 = null;
      clearPreview();
    } else {
      dragMode = null;
      dragCorner1 = null;
      clearPreview();
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
  if (e.code === "KeyQ") {
    if (dragMode) {
      dragMode = null;
      dragCorner1 = null;
      clearPreview();
      clearGroundDot();
      return;
    }
    // Cancel current ghost
    if (isPlacing()) {
      cancelPlacement();
      return;
    }
    // Grab a hovered object
    if (targetedObject) {
      const obj = targetedObject;
      targetedObject = null;
      obj.destroy(scene);
      const idx = placedObjects.indexOf(obj);
      if (idx >= 0) placedObjects.splice(idx, 1);
      if (obj instanceof MagneticBox || obj instanceof CurrentWire) {
        dragMode = obj.constructor.id;
        dragCorner1 = null;
        clearPreview();
      } else {
        startPlacement(obj.constructor.id);
      }
      field.update();
      potential.update();
      return;
    }
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

document.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  if (dragMode) {
    const p = getPlacementPoint();
    if (p) dragCorner1 = p.clone();
    return;
  }
  if (isPlacing()) return;
});

document.addEventListener("mouseup", (e) => {
  if (e.button !== 0) return;
  if (dragMode && dragCorner1) {
    const corner2 = getPlacementPoint();
    if (corner2) {
      if (dragMode === "magneticBox") confirmBoxPlacement(dragCorner1, corner2);
      else if (dragMode === "currentWire") confirmWirePlacement(dragCorner1, corner2);
    } else {
      dragCorner1 = null;
      clearPreview();
      clearGroundDot();
      dragMode = null;
    }
  }
});

document.addEventListener("mousemove", () => {
  if (dragMode && dragCorner1) {
    const corner2 = getPlacementPoint();
    if (corner2) {
      if (dragMode === "magneticBox") buildBoxPreview(dragCorner1, corner2);
      else if (dragMode === "currentWire") buildWirePreview(dragCorner1, corner2);
    }
  }
});

let lastTime = performance.now();
const cameraVelocity = new THREE.Vector3();

// ── Object info HUD ───────────────────────────────────────────────
const oiEl = document.getElementById("objectInfo");
const oiNameEl = document.getElementById("oiName");
const oiRowsEl = document.getElementById("oiRows");

function updateObjectHUD() {
  if (!oiEl || !targetedObject) {
    oiEl.style.display = "none";
    return;
  }
  const obj = targetedObject;
  oiEl.style.display = "block";
  oiNameEl.textContent = obj.constructor.label || "Object";

  const rows = [];
  if (typeof obj.position?.x === "number") {
    rows.push({
      label: "Position",
      val: fmtVector(
        new THREE.Vector3(obj.position.x, obj.position.y, obj.position.z),
      ),
    });
  }
  if (obj.constructor.chargeType) {
    const qSI = getChargeSI(obj);
    rows.push({ label: "Charge", val: fmtSI(qSI) + " C" });
  }
  if (obj instanceof DynamicCharge) {
    const v = obj.velocity;
    const speed = v.length();
    rows.push({ label: "Velocity", val: fmtSI(speed) + " m/s" });
    rows.push({ label: "Speed", val: fmtVector(v) });
  }
  if (obj.fieldStrength != null && obj.fieldDir) {
    rows.push({ label: "B-field", val: fmtSI(obj.fieldStrength) + " T " + fmtDir(obj.fieldDir) });
  }
  if (obj.current) {
    rows.push({ label: "Current", val: fmtSI(obj.current) + " A" });
  }
  if (obj.range) {
    rows.push({ label: "Range", val: fmtSI(obj.range) + " m" });
  }
  oiRowsEl.innerHTML = rows
    .map(
      (r) =>
        `<div class="oi-row"><span class="oi-label">${r.label}</span><span class="oi-value">${r.val}</span></div>`,
    )
    .join("");
}

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
  camera.position.y = Math.max(1, camera.position.y + cameraVelocity.y);

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

  updateObjectHUD();

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

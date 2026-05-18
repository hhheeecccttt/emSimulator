import * as THREE from 'three';
import { PLACEMENT_DISTANCE } from './constants.js';
import { getType } from './ObjectRegistry.js';

// Three-state click-hold mechanic: IDLE -> HOLDING (0.1s buffer) -> CHARGING (up to 2s)
const State = { IDLE: 0, HOLDING: 1, CHARGING: 2 };
const HOLD_DELAY = 0.1;
const MAX_CHARGE_TIME = 2;
const MAX_LAUNCH_SPEED = 5;

// Module-level state — only one ghost at a time
let placementGhost = null;
let scene = null;
let camera = null;
let state = State.IDLE;
let phaseStartTime = 0;

const meterEl = document.getElementById('chargeMeter');
const labelEl = document.getElementById('chargeLabel');

function showMeter() { meterEl.style.display = 'block'; labelEl.style.display = 'block'; }
function hideMeter() { meterEl.style.display = 'none'; labelEl.style.display = 'none'; }

export function initGhostSystem(sceneRef, cameraRef) {
  scene = sceneRef;
  camera = cameraRef;
}

// Create a ghost mesh and start following the camera
export function startPlacement(typeId) {
    cancelPlacement();
    const Cls = getType(typeId);
    if (!Cls) return;
    placementGhost = Cls.createGhost();
    scene.add(placementGhost);
    updateGhostPosition();
}

// Keep the ghost at a fixed distance in front of the camera
export function updateGhostPosition() {
    if (!placementGhost || !camera) return;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    placementGhost.position.copy(camera.position).add(dir.multiplyScalar(PLACEMENT_DISTANCE));
    if (placementGhost.position.y < 1) placementGhost.position.y = 1;
}

function confirmPlacement() {
    if (!placementGhost) return null;
    const typeId = placementGhost.userData.typeId;
    const Cls = getType(typeId);
    let obj = null;
    if (Cls) {
        obj = new Cls(placementGhost.position.clone());
    }
    cancelPlacement();
    return obj;
}

function placeWithVelocity(velocity) {
    const obj = confirmPlacement();
    if (obj) obj.velocity.copy(velocity);
    hideMeter();
    return obj;
}

export function cancelPlacement() {
    state = State.IDLE;
    hideMeter();
    if (!placementGhost || !scene) return;
    scene.remove(placementGhost);
    placementGhost = null;
}

export function isPlacing() {
    return placementGhost !== null;
}

export function isCharging() {
    return state === State.CHARGING;
}

export function isHolding() {
    return state === State.HOLDING;
}

export function getChargeLevel() {
    if (state !== State.CHARGING) return 0;
    return Math.min((performance.now() - phaseStartTime) / (MAX_CHARGE_TIME * 1000), 1);
}

// For static objects: instant placement. For dynamic: start the hold-charge sequence
export function onPlacementClick() {
    if (!placementGhost) return null;
    const Cls = getType(placementGhost.userData.typeId);
    if (Cls?.isStatic) {
        return confirmPlacement();
    }
    state = State.HOLDING;
    phaseStartTime = performance.now();
    return null;
}

// After the hold delay, switch to charging and show the meter
export function tickCharge() {
    if (state !== State.HOLDING) return;
    if ((performance.now() - phaseStartTime) / 1000 < HOLD_DELAY) return;
    state = State.CHARGING;
    phaseStartTime = performance.now();
    showMeter();
}

// On release: if still in holding (quick tap), place with zero velocity.
// If charging, launch with speed proportional to charge time.
export function onPlacementRelease() {
    if (state === State.IDLE || !placementGhost) return null;

    if (state === State.HOLDING) {
        state = State.IDLE;
        return placeWithVelocity(new THREE.Vector3(0, 0, 0));
    }

    const elapsed = (performance.now() - phaseStartTime) / (MAX_CHARGE_TIME * 1000);
    const speed = Math.min(elapsed, 1) * MAX_LAUNCH_SPEED;
    state = State.IDLE;

    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    return placeWithVelocity(dir.multiplyScalar(speed));
}

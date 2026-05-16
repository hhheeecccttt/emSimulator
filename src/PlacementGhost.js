import * as THREE from 'three';
import { PLACEMENT_DISTANCE } from './constants.js';
import { getType } from './ObjectRegistry.js';

let placementGhost = null;
let scene = null;
let camera = null;

let holdStartTime = 0;
let _isHolding = false;
let chargeStartTime = 0;
let _isCharging = false;
const HOLD_DELAY = 0.1;
const MAX_CHARGE_TIME = 2;
const MAX_LAUNCH_SPEED = 5;

const meterEl = document.getElementById('chargeMeter');
const labelEl = document.getElementById('chargeLabel');

function showMeter() { meterEl.style.display = 'block'; labelEl.style.display = 'block'; }
function hideMeter() { meterEl.style.display = 'none'; labelEl.style.display = 'none'; }

export function initGhostSystem(sceneRef, cameraRef) {
    scene = sceneRef;
    camera = cameraRef;
}

export function startPlacement(typeId) {
    cancelPlacement();
    const Cls = getType(typeId);
    if (!Cls) return;
    placementGhost = Cls.createGhost();
    scene.add(placementGhost);
    updateGhostPosition();
}

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

export function cancelPlacement() {
    _isHolding = false;
    _isCharging = false;
    hideMeter();
    if (!placementGhost || !scene) return;
    scene.remove(placementGhost);
    placementGhost = null;
}

export function isPlacing() {
    return placementGhost !== null;
}

export function isHolding() {
    return _isHolding;
}

export function startCharging() {
    if (!placementGhost) return null;
    const Cls = getType(placementGhost.userData.typeId);
    if (Cls?.isStatic) {
        return confirmPlacement();
    }
    _isHolding = true;
    holdStartTime = performance.now();
    return null;
}

export function tickCharge() {
    if (!_isHolding || _isCharging) return;
    if ((performance.now() - holdStartTime) / 1000 < HOLD_DELAY) return;
    _isCharging = true;
    chargeStartTime = performance.now();
    showMeter();
}

export function getChargeLevel() {
    if (!_isCharging) return 0;
    return Math.min((performance.now() - chargeStartTime) / (MAX_CHARGE_TIME * 1000), 1);
}

function placeWithVelocity(velocity) {
    const obj = confirmPlacement();
    if (obj) obj.velocity.copy(velocity);
    hideMeter();
    return obj;
}

export function releaseCharge() {
    if (!_isHolding || !placementGhost) return null;

    if (!_isCharging) {
        _isHolding = false;
        return placeWithVelocity(new THREE.Vector3(0, 0, 0));
    }

    const elapsed = (performance.now() - chargeStartTime) / (MAX_CHARGE_TIME * 1000);
    const charge = Math.min(elapsed, 1);
    const speed = charge * MAX_LAUNCH_SPEED;
    _isHolding = false;
    _isCharging = false;

    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);

    return placeWithVelocity(dir.multiplyScalar(speed));
}

export function isCharging() {
    return _isCharging;
}

import * as THREE from "three";

// SI physical constants (AP Physics C E&M)
export const K = 8.99e9;            // Coulomb constant (N·m²/C²)
export const EPSILON_0 = 8.854e-12; // permittivity of free space (F/m)
export const MU_0 = 1.257e-6;       // permeability of free space (T·m/A)
export const E_CHARGE = 1.602e-19;  // elementary charge (C)
export const E_MASS = 9.109e-31;    // electron mass (kg)
export const P_MASS = 1.673e-27;    // proton mass (kg)

// 1 internal charge unit = 1 µC
export const Q_SCALE = 1e-6;

// Shared temp vectors for computations
const _v = new THREE.Vector3();

// Returns the SI charge (Coulombs) for an object:
//   sign from chargeType, magnitude from chargeValue (default 1 µC)
export function getChargeSI(obj) {
  const sign = obj.constructor.chargeType === "positive" ? 1
    : obj.constructor.chargeType === "negative" ? -1 : 0;
  const val = obj.chargeValue != null ? obj.chargeValue : 1;
  return sign * val * Q_SCALE;
}

// Compute net electric field vector (N/C) at a point from all static charges
export function computeEAtPoint(point, objects) {
  const e = new THREE.Vector3();
  for (const obj of objects) {
    if (!obj.constructor.isStatic) continue;
    const qSI = getChargeSI(obj);
    if (qSI === 0) continue;
    _v.subVectors(point, obj.position);
    const rSq = _v.lengthSq();
    if (rSq < 1e-10) continue;
    const r = Math.sqrt(rSq);
    const eMag = K * Math.abs(qSI) / rSq;
    _v.normalize().multiplyScalar(qSI > 0 ? eMag : -eMag);
    e.add(_v);
  }
  return e;
}

// Compute net electric potential (V) at a point from all static charges
export function computeVAtPoint(point, objects) {
  let v = 0;
  for (const obj of objects) {
    if (!obj.constructor.isStatic) continue;
    const qSI = getChargeSI(obj);
    if (qSI === 0) continue;
    const r = point.distanceTo(obj.position);
    if (r < 1e-10) continue;
    v += K * qSI / r;
  }
  return v;
}

// Compute net magnetic field vector (T) at a point from magnetic boxes
export function computeBAtPoint(point, objects) {
  const b = new THREE.Vector3();
  for (const obj of objects) {
    if (typeof obj.getField === "function") {
      const f = obj.getField(point);
      if (f) b.add(f);
    }
  }
  return b;
}

// Compute Lorentz force (N) on a test charge qTest (C) moving at v (m/s)
export function computeForce(qTest, v, e, b) {
  const f = new THREE.Vector3();
  // Electric force: F = qE
  if (e) f.addScaledVector(e, qTest);
  // Magnetic force: F = q(v × B)
  if (b && v) {
    _v.crossVectors(v, b).multiplyScalar(qTest);
    f.add(_v);
  }
  return f;
}

// Format a number in a human-readable SI-prefixed string
export function fmtSI(num) {
  if (num === 0 || !isFinite(num)) return "0";
  const abs = Math.abs(num);
  const sign = num < 0 ? "-" : "";
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(3) + "G";
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(3) + "M";
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(3) + "k";
  if (abs >= 1)   return sign + abs.toFixed(3);
  if (abs >= 1e-3)  return sign + (abs * 1e3).toFixed(3) + "m";
  if (abs >= 1e-6)  return sign + (abs * 1e6).toFixed(3) + "µ";
  if (abs >= 1e-9)  return sign + (abs * 1e9).toFixed(3) + "n";
  return num.toExponential(3);
}

// Format a vector with each component in SI units
export function fmtVector(v) {
  return `(${fmtSI(v.x)}, ${fmtSI(v.y)}, ${fmtSI(v.z)})`;
}

// Format a unit direction label like "↑→"
export function fmtDir(v) {
  const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
  const max = Math.max(ax, ay, az);
  if (max < 1e-10) return "";
  const fx = v.x / max, fy = v.y / max, fz = v.z / max;
  const dx = fx > 0.5 ? "→" : fx < -0.5 ? "←" : "";
  const dy = fy > 0.5 ? "↑" : fy < -0.5 ? "↓" : "";
  const dz = fz > 0.5 ? "⊙" : fz < -0.5 ? "⊗" : "";
  return dx + dy + dz;
}

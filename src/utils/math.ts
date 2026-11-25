import * as THREE from 'three';

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Quartic ease-out for crisp weighted sword swings (per guizang-game-skill) */
export function easeOutQuart(t: number): number {
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 4);
}

export function easeInOutCubic(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function damp(a: number, b: number, lambda: number, dt: number): number {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

export function angleDiff(from: number, to: number): number {
  let d = (to - from + Math.PI) % (Math.PI * 2);
  if (d < 0) d += Math.PI * 2;
  return d - Math.PI;
}

export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  return current + angleDiff(current, target) * (1 - Math.exp(-lambda * dt));
}

const _ikRootToTarget = new THREE.Vector3();
const _ikDir = new THREE.Vector3();
const _ikPoleProj = new THREE.Vector3();
const _ikSide = new THREE.Vector3();
const _ikBendDir = new THREE.Vector3();

/**
 * Analytical two-bone IK solver in character space (+Y up, +Z forward, -X right).
 * Returns world/character-space joint (elbow/knee) and clamped end-effector positions
 * so limbs never twist awkwardly from guessed Euler angles.
 */
export function solveTwoBoneIK(
  root: THREE.Vector3,
  target: THREE.Vector3,
  poleHint: THREE.Vector3,
  len1: number,
  len2: number,
  outMid: THREE.Vector3,
  outEnd: THREE.Vector3,
): void {
  _ikRootToTarget.subVectors(target, root);
  const rawDist = _ikRootToTarget.length();
  const minDist = Math.abs(len1 - len2) + 0.015;
  const maxDist = len1 + len2 - 0.005;
  const dist = clamp(rawDist, minDist, maxDist);

  if (rawDist > 1e-5) {
    _ikDir.copy(_ikRootToTarget).divideScalar(rawDist);
  } else {
    _ikDir.set(0, -1, 0);
  }

  outEnd.copy(root).addScaledVector(_ikDir, dist);

  const cosAngle = clamp((len1 * len1 + dist * dist - len2 * len2) / (2 * len1 * dist), -1, 1);
  const along = len1 * cosAngle;
  const perp = Math.sqrt(Math.max(0, len1 * len1 - along * along));

  _ikPoleProj.copy(poleHint).sub(root);
  const projDot = _ikPoleProj.dot(_ikDir);
  _ikBendDir.copy(_ikPoleProj).addScaledVector(_ikDir, -projDot);
  if (_ikBendDir.lengthSq() < 1e-6) {
    _ikSide.set(0, 0, 1).cross(_ikDir);
    if (_ikSide.lengthSq() < 1e-6) _ikSide.set(1, 0, 0).cross(_ikDir);
    _ikBendDir.copy(_ikSide).normalize();
  } else {
    _ikBendDir.normalize();
  }

  outMid.copy(root).addScaledVector(_ikDir, along).addScaledVector(_ikBendDir, perp);
}

const _segA = new THREE.Vector3();
const _segB = new THREE.Vector3();
const _upY = new THREE.Vector3(0, 1, 0);

/** Positions & orients a tapered cylinder/capsule mesh spanning start -> end. */
export function placeLimbSegment(
  mesh: THREE.Object3D,
  start: THREE.Vector3,
  end: THREE.Vector3,
): void {
  _segA.copy(start).add(end).multiplyScalar(0.5);
  mesh.position.copy(_segA);
  _segB.subVectors(end, start);
  const len = _segB.length();
  if (len > 1e-5) {
    _segB.divideScalar(len);
    mesh.quaternion.setFromUnitVectors(_upY, _segB);
  }
}

export interface CircleObstacle {
  x: number;
  z: number;
  r: number;
}

export interface CapsuleObstacle {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  r: number;
}

/** Pushes a circle entity out of a static circle obstacle. Returns true if pushed. */
export function resolveCircleVsCircle(
  pos: THREE.Vector3,
  radius: number,
  obs: CircleObstacle,
): boolean {
  const dx = pos.x - obs.x;
  const dz = pos.z - obs.z;
  const minDist = radius + obs.r;
  const d2 = dx * dx + dz * dz;
  if (d2 >= minDist * minDist) return false;
  const d = Math.sqrt(d2);
  if (d > 1e-5) {
    const push = minDist - d;
    pos.x += (dx / d) * push;
    pos.z += (dz / d) * push;
  } else {
    pos.z += minDist;
  }
  return true;
}

/** Pushes a circle entity out of a static capsule (pill) segment so rows of obstacles never snag. */
export function resolveCircleVsCapsule(
  pos: THREE.Vector3,
  radius: number,
  cap: CapsuleObstacle,
): boolean {
  const abx = cap.bx - cap.ax;
  const abz = cap.bz - cap.az;
  const ab2 = abx * abx + abz * abz;
  const t = ab2 > 1e-6 ? clamp(((pos.x - cap.ax) * abx + (pos.z - cap.az) * abz) / ab2, 0, 1) : 0;
  const cx = cap.ax + abx * t;
  const cz = cap.az + abz * t;
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const minDist = radius + cap.r;
  const d2 = dx * dx + dz * dz;
  if (d2 >= minDist * minDist) return false;
  const d = Math.sqrt(d2);
  if (d > 1e-5) {
    const push = minDist - d;
    pos.x += (dx / d) * push;
    pos.z += (dz / d) * push;
  } else {
    pos.z += minDist;
  }
  return true;
}

import * as THREE from 'three';
import { clamp } from '../utils/math';

export type BodyBuildStyle = 'hero' | 'armored' | 'boss' | 'robe';

export interface ContinuousLimbRig {
  mesh: THREE.SkinnedMesh;
  rootBone: THREE.Bone;
  midBone: THREE.Bone;
  endBone: THREE.Bone;
  upperLen: number;
  lowerLen: number;
}

export interface ContinuousTorsoRig {
  mesh: THREE.SkinnedMesh;
  pelvisBone: THREE.Bone;
  chestBone: THREE.Bone;
}

/**
 * Evaluates the sculpted surface depth Z of the torso at local (x, y) on the front (+Z)
 * or back (-Z) side so curved lapels, straps, and armor fittings hug the human chest seamlessly.
 */
export function sampleTorsoSurfaceZ(x: number, y: number, broadness: number, front = true): number {
  const t = clamp((y + 0.14) / 0.75, 0, 1);
  // Matches profile radii in createSeamlessTorsoSkinnedMesh
  const baseRx =
    (t < 0.28
      ? THREE.MathUtils.lerp(0.168, 0.148, t / 0.28)
      : t < 0.72
        ? THREE.MathUtils.lerp(0.148, 0.214, (t - 0.28) / 0.44)
        : t < 0.88
          ? THREE.MathUtils.lerp(0.214, 0.145, (t - 0.72) / 0.16)
          : THREE.MathUtils.lerp(0.145, 0.066, (t - 0.88) / 0.12)) *
    1.12 *
    broadness;
  const baseRz = baseRx * 0.67;
  const nx = clamp(x / Math.max(0.04, baseRx), -0.96, 0.96);
  let z = Math.sqrt(Math.max(0.02, 1 - nx * nx)) * baseRz;
  if (front && y > 0.24 && y < 0.5) {
    const pec = Math.exp(-Math.pow((y - 0.39) / 0.085, 2)) * (0.55 + 0.45 * Math.cos((Math.abs(x) - 0.085) * 14));
    z += pec * 0.016;
  }
  return front ? z : -z;
}

/**
 * Builds ONE continuous, unbroken, smoothly vertex-weighted THREE.SkinnedMesh spanning
 * lower pelvis -> waist -> ribcage -> pectorals/lats -> deltoid-clavicle shelf -> trapezius -> neck collar.
 * Eliminates the disconnected toy seam between pelvis and upper torso.
 */
export function createSeamlessTorsoSkinnedMesh(
  style: BodyBuildStyle,
  material: THREE.Material,
): ContinuousTorsoRig {
  const broadness = style === 'boss' ? 1.15 : style === 'armored' ? 1.07 : 1.0;
  const radialSegs = 40;
  const heightSegs = 34;
  const yMin = -0.14;
  const yMax = 0.61;

  // Profile [y, rx, rz] in local pelvis space
  const profile: Array<[number, number, number]> = [
    [-0.14, 0.158, 0.118], // lower hip base
    [-0.04, 0.172, 0.128], // greater trochanter / hip fullness
    [0.05, 0.156, 0.114],  // belt / waist cinch
    [0.12, 0.149, 0.109],  // athletic narrow waist
    [0.24, 0.176, 0.122],  // lower ribcage / obliques
    [0.38, 0.212, 0.144],  // broad chest / pectorals / lats
    [0.48, 0.222, 0.140],  // clavicle / anterior deltoid shelf
    [0.545, 0.145, 0.104], // trapezius slope
    [0.61, 0.066, 0.064],  // neck collar root
  ];

  const sampleProfile = (y: number): [number, number] => {
    for (let i = 0; i < profile.length - 1; i++) {
      const a = profile[i];
      const b = profile[i + 1];
      if (y >= a[0] && y <= b[0]) {
        const u = (y - a[0]) / (b[0] - a[0]);
        const s = u * u * (3 - 2 * u);
        return [THREE.MathUtils.lerp(a[1], b[1], s), THREE.MathUtils.lerp(a[2], b[2], s)];
      }
    }
    const last = profile[profile.length - 1];
    return [last[1], last[2]];
  };

  const positions: number[] = [];
  const uvs: number[] = [];
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const indices: number[] = [];

  for (let iy = 0; iy <= heightSegs; iy++) {
    const v = iy / heightSegs;
    const y = THREE.MathUtils.lerp(yMin, yMax, v);
    const [rxBase, rzBase] = sampleProfile(y);
    const rx = rxBase * 1.12 * broadness;
    const rz = rzBase * (style === 'boss' ? 1.12 : 1.04);

    // Smooth cosine skinning weight across waist (y = 0.00 -> 0.24)
    const chestT = clamp((y - 0.01) / 0.22, 0, 1);
    const wChest = 0.5 - 0.5 * Math.cos(chestT * Math.PI);
    const wPelvis = 1 - wChest;

    for (let ix = 0; ix <= radialSegs; ix++) {
      const u = ix / radialSegs;
      const theta = u * Math.PI * 2;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);

      let x = sinT * rx;
      let z = cosT * rz;

      // Anatomical pectorals & sternum furrow (+Z)
      if (cosT > 0 && y > 0.22 && y < 0.52) {
        const pecVert = Math.exp(-Math.pow((y - 0.39) / 0.085, 2));
        const pecSide = Math.exp(-Math.pow((Math.abs(sinT) - 0.42) / 0.32, 2));
        const sternum = Math.exp(-Math.pow(sinT / 0.14, 2));
        z += (pecVert * pecSide * 0.018 - pecVert * sternum * 0.006) * cosT;
      }

      // Clavicle & trapezius ridge
      if (y > 0.45 && y < 0.55) {
        const clav = Math.exp(-Math.pow((y - 0.495) / 0.028, 2)) * Math.max(0, cosT) * Math.abs(sinT);
        z += clav * 0.009;
      }

      // Spine S-curve indentation & scapula fullness (-Z)
      if (cosT < 0 && y > 0.06 && y < 0.50) {
        const spine = Math.exp(-Math.pow(sinT / 0.16, 2));
        const scap = Math.exp(-Math.pow((Math.abs(sinT) - 0.48) / 0.24, 2)) * Math.exp(-Math.pow((y - 0.41) / 0.09, 2));
        z += spine * 0.012 - scap * 0.014;
      }

      // Subtle natural waist-cinch drapery creases or lamellar plate overlap tiers
      if (style === 'hero' || style === 'robe') {
        const fold = Math.sin(theta * 11 + y * 9.0) * 0.0032 * Math.exp(-Math.pow((y - 0.14) / 0.14, 2));
        // Diagonal Hanfu cross-collar fold ridge across chest
        if (cosT > 0.25 && y > 0.12 && y < 0.52) {
          const diagDist = Math.abs(x - (y - 0.34) * 0.55);
          const lapelStep = Math.exp(-Math.pow(diagDist / 0.025, 2)) * 0.0065;
          z += lapelStep;
        }
        x += sinT * fold;
        z += cosT * fold;
      } else {
        // Horizontal sculpted lamellar cuirass tiers + broad pectoral armor bevel
        const tier = Math.sin(y * 74) * 0.0038 * clamp((y - 0.08) / 0.32, 0, 1) * clamp((0.48 - y) / 0.12, 0, 1);
        x += sinT * tier;
        z += cosT * tier;
      }

      positions.push(x, y, z);
      uvs.push(u * 2.0, v * 1.6);
      skinIndices.push(0, 1, 0, 0);
      skinWeights.push(wPelvis, wChest, 0, 0);
    }
  }

  const stride = radialSegs + 1;
  for (let iy = 0; iy < heightSegs; iy++) {
    for (let ix = 0; ix < radialSegs; ix++) {
      const a = iy * stride + ix;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const pelvisBone = new THREE.Bone();
  pelvisBone.position.set(0, 0, 0);
  const chestBone = new THREE.Bone();
  chestBone.position.set(0, 0.09, 0);
  pelvisBone.add(chestBone);

  const mesh = new THREE.SkinnedMesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.add(pelvisBone);
  const skeleton = new THREE.Skeleton([pelvisBone, chestBone]);
  mesh.bind(skeleton);

  return { mesh, pelvisBone, chestBone };
}

export interface LimbMeshSpec {
  kind: 'arm' | 'leg';
  upperLen: number;
  lowerLen: number;
  topCapRadius: number;
  upperRadii: Array<[number, number]>; // [radius, t in 0..1 from root->mid]
  lowerRadii: Array<[number, number]>; // [radius, t in 0..1 from mid->end]
  splitT?: number; // t in 0..1 along total length where lowerMat starts (e.g., bracer or greave)
  clothFolds?: boolean;
  cuffRidge?: number;
}

/**
 * Creates ONE continuous unbroken 3-bone THREE.SkinnedMesh for an entire arm or leg.
 * - Top dome seamlessly seats into shoulder/hip (zero floating ball-joint spheres!).
 * - Smooth cosine bone weights across elbow/knee (zero crack or seam when bending 120 deg!).
 * - Supports 2 materials (e.g. silk sleeve -> leather bracer, or trousers -> forged shin greave)
 *   with a realistic sculpted overlapping cuff rim right at the transition.
 */
export function createSeamlessLimbSkinnedMesh(
  spec: LimbMeshSpec,
  upperMat: THREE.Material,
  lowerMat: THREE.Material,
): ContinuousLimbRig {
  const radialSegs = 24;
  const totalLen = spec.upperLen + spec.lowerLen;
  const jointFrac = spec.upperLen / totalLen;
  const splitFrac = spec.splitT ?? jointFrac + 0.04;

  // Rings from +topCap dome down through upper, elbow/knee transition, lower, to end cap
  const ySamples: Array<{ y: number; rx: number; rz: number; isCap?: boolean }> = [];
  const sampleTable = (table: Array<[number, number]>, t: number): number => {
    const ct = clamp(t, 0, 1);
    for (let i = 0; i < table.length - 1; i++) {
      const [r0, t0] = table[i];
      const [r1, t1] = table[i + 1];
      if (ct >= t0 && ct <= t1) {
        const u = (ct - t0) / Math.max(1e-4, t1 - t0);
        const s = u * u * (3 - 2 * u);
        return THREE.MathUtils.lerp(r0, r1, s);
      }
    }
    return table[table.length - 1][0];
  };

  // Rounded deltoid/hip top hemisphere (4 rings above y=0 so shoulder/hip socket stays 100% sealed!)
  for (let k = 0; k < 4; k++) {
    const ang = (k / 4) * (Math.PI * 0.5);
    const y = Math.cos(ang) * spec.topCapRadius * 0.82;
    const r = Math.max(0.004, Math.sin(ang) * spec.topCapRadius);
    ySamples.push({ y, rx: r * 1.04, rz: r * 0.98, isCap: true });
  }

  // Main limb rings (28 longitudinal rings)
  const mainRings = 28;
  for (let i = 0; i <= mainRings; i++) {
    const f = i / mainRings;
    const y = -f * totalLen;
    let r: number;
    let rxScale = 1.0;
    let rzScale = 1.0;
    if (f <= jointFrac) {
      const tu = f / jointFrac;
      r = sampleTable(spec.upperRadii, tu);
      if (spec.kind === 'leg') {
        // Subtle anatomical quadriceps front/back depth
        rzScale = 1.08;
        rxScale = 0.96;
      } else {
        // Slight deltoid/tricep depth
        rzScale = 1.05;
      }
    } else {
      const tl = (f - jointFrac) / (1 - jointFrac);
      r = sampleTable(spec.lowerRadii, tl);
      if (spec.kind === 'leg') {
        // Sculpted gastrocnemius calf fullness
        const calf = Math.exp(-Math.pow((tl - 0.34) / 0.22, 2)) * 0.011;
        rzScale = 1.06 + calf / Math.max(0.03, r);
      }
    }

    // Sculpted overlapping bracer / shin-greave cuff lip at material transition
    if (spec.cuffRidge && Math.abs(f - splitFrac) < 0.045) {
      const lip = Math.exp(-Math.pow((f - splitFrac) / 0.024, 2)) * spec.cuffRidge;
      r += lip;
    }

    ySamples.push({ y, rx: r * rxScale, rz: r * rzScale });
  }

  // Close bottom wrist/ankle slightly
  const lastSample = ySamples[ySamples.length - 1];
  ySamples.push({ y: -totalLen - 0.012, rx: lastSample.rx * 0.55, rz: lastSample.rz * 0.55, isCap: true });

  const positions: number[] = [];
  const uvs: number[] = [];
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];

  const ringCount = ySamples.length;
  const splitY = -splitFrac * totalLen;
  let splitRing = Math.floor(ringCount * 0.5);

  for (let iy = 0; iy < ringCount; iy++) {
    const s = ySamples[iy];
    if (s.y >= splitY) splitRing = iy;
    const f = clamp(-s.y / totalLen, 0, 1);

    // Smooth bone weighting across elbow/knee joint (half-width ~ 11% of limb length)
    const blendHalf = 0.105;
    let w0 = 0;
    let w1 = 0;
    let w2 = 0;
    if (f <= jointFrac - blendHalf) {
      w0 = 1;
    } else if (f < jointFrac + blendHalf) {
      const bt = (f - (jointFrac - blendHalf)) / (blendHalf * 2);
      w1 = 0.5 - 0.5 * Math.cos(bt * Math.PI);
      w0 = 1 - w1;
    } else if (f < 0.92) {
      w1 = 1;
    } else {
      const wt = clamp((f - 0.92) / 0.08, 0, 1);
      w2 = wt * 0.45;
      w1 = 1 - w2;
    }

    for (let ix = 0; ix <= radialSegs; ix++) {
      const u = ix / radialSegs;
      const theta = u * Math.PI * 2;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);

      let rx = s.rx;
      let rz = s.rz;

      // Subtle natural cloth sleeve/trouser drapery folds & elbow crease ripples
      if (!s.isCap && spec.clothFolds && f > 0.06 && f < splitFrac) {
        const crease = Math.sin(theta * 7 + f * 12) * 0.0038 + Math.cos(theta * 3 - f * 8) * 0.0025;
        rx += crease;
        rz += crease;
      }

      // Subtle anatomical knee cap bump (+Z) on legs
      if (!s.isCap && spec.kind === 'leg' && cosT > 0.3 && Math.abs(f - jointFrac) < 0.07) {
        const patella = Math.exp(-Math.pow((f - jointFrac) / 0.04, 2)) * Math.pow(cosT, 2) * 0.011;
        rz += patella;
      }

      positions.push(sinT * rx, s.y, cosT * rz);
      uvs.push(u * 1.5, f * 2.2);
      skinIndices.push(0, 1, 2, 0);
      skinWeights.push(w0, w1, w2, 0);
    }
  }

  const upperIndices: number[] = [];
  const lowerIndices: number[] = [];
  const stride = radialSegs + 1;
  for (let iy = 0; iy < ringCount - 1; iy++) {
    const target = iy < splitRing ? upperIndices : lowerIndices;
    for (let ix = 0; ix < radialSegs; ix++) {
      const a = iy * stride + ix;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      target.push(a, b, c, b, d, c);
    }
  }

  const allIndices = upperIndices.concat(lowerIndices);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geo.setIndex(allIndices);
  geo.addGroup(0, upperIndices.length, 0);
  geo.addGroup(upperIndices.length, lowerIndices.length, 1);
  geo.computeVertexNormals();

  const rootBone = new THREE.Bone();
  rootBone.position.set(0, 0, 0);
  const midBone = new THREE.Bone();
  midBone.position.set(0, -spec.upperLen, 0);
  const endBone = new THREE.Bone();
  endBone.position.set(0, -spec.lowerLen, 0);
  rootBone.add(midBone);
  midBone.add(endBone);

  const materials = upperMat === lowerMat ? upperMat : [upperMat, lowerMat];
  const mesh = new THREE.SkinnedMesh(geo, materials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.add(rootBone);
  const skeleton = new THREE.Skeleton([rootBone, midBone, endBone]);
  mesh.bind(skeleton);

  return { mesh, rootBone, midBone, endBone, upperLen: spec.upperLen, lowerLen: spec.lowerLen };
}

// Reusable scratch objects for zero-GC 60fps bone solving
const _y0 = new THREE.Vector3();
const _z0 = new THREE.Vector3();
const _x0 = new THREE.Vector3();
const _y1 = new THREE.Vector3();
const _z1 = new THREE.Vector3();
const _x1 = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _mat0 = new THREE.Matrix4();
const _mat1 = new THREE.Matrix4();
const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion();
const _q0Inv = new THREE.Quaternion();

/**
 * Twist-free orthonormal 3-bone limb solver.
 * Maps IK joint points (start -> mid -> end) cleanly onto the continuous SkinnedMesh bone chain
 * with pure anatomical hinge bending at elbows & knees and zero candy-wrapper twist.
 */
export function solveContinuousLimbBones(
  limb: ContinuousLimbRig,
  startPos: THREE.Vector3,
  midPos: THREE.Vector3,
  endPos: THREE.Vector3,
  polePos: THREE.Vector3,
  polePointsForward: boolean,
  outLowerWorldQuat?: THREE.Quaternion,
): void {
  limb.rootBone.position.copy(startPos);

  // Upper segment basis: bind pose extends along -Y, so local +Y points from mid -> start
  _y0.subVectors(startPos, midPos);
  if (_y0.lengthSq() < 1e-6) _y0.set(0, 1, 0);
  else _y0.normalize();

  _pole.subVectors(polePos, startPos);
  // Project pole perpendicular to _y0
  _pole.addScaledVector(_y0, -_pole.dot(_y0));
  if (_pole.lengthSq() < 1e-6) _pole.set(0, 0, polePointsForward ? 1 : -1);
  else _pole.normalize();

  // For legs, knee pole points +Z forward; for arms, elbow pole points -Z backward
  _z0.copy(_pole);
  if (!polePointsForward) _z0.negate();
  _x0.crossVectors(_y0, _z0).normalize();
  _z0.crossVectors(_x0, _y0).normalize();

  _mat0.makeBasis(_x0, _y0, _z0);
  _q0.setFromRotationMatrix(_mat0);
  limb.rootBone.quaternion.copy(_q0);

  // Lower segment basis keeps continuous hinge axis _x0 so elbow/knee never twists!
  _y1.subVectors(midPos, endPos);
  if (_y1.lengthSq() < 1e-6) _y1.copy(_y0);
  else _y1.normalize();

  _z1.crossVectors(_x0, _y1);
  if (_z1.lengthSq() < 1e-6) _z1.copy(_z0);
  else _z1.normalize();
  _x1.crossVectors(_y1, _z1).normalize();

  _mat1.makeBasis(_x1, _y1, _z1);
  _q1.setFromRotationMatrix(_mat1);

  _q0Inv.copy(_q0).invert();
  limb.midBone.quaternion.copy(_q0Inv).multiply(_q1);

  if (outLowerWorldQuat) outLowerWorldQuat.copy(_q1);
}

/**
 * Curved form-fitting Hanfu cross-collar lapel (交领右衽) hugging the sculpted chest contour.
 * Replaces flat floating BoxGeometry strips.
 */
export function createCurvedHanfuCollarGeo(broadness = 1.0, side: -1 | 1): THREE.BufferGeometry {
  const segsU = 4;
  const segsV = 18;
  const width = 0.042;
  const thick = 0.011;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iv = 0; iv <= segsV; iv++) {
    const v = iv / segsV;
    // Sweeps from neck collar side down across sternum to opposite waist sash
    const y = THREE.MathUtils.lerp(0.555, 0.145, v);
    const cx = side === 1 ? THREE.MathUtils.lerp(0.072, -0.055, v) : THREE.MathUtils.lerp(-0.072, 0.025, v);
    const cz = sampleTorsoSurfaceZ(cx, y, broadness, true) + (side === 1 ? 0.012 : 0.006);

    for (let iu = 0; iu <= segsU; iu++) {
      const u = iu / segsU;
      const offset = (u - 0.5) * width;
      const x = cx + offset;
      const arch = Math.sin(u * Math.PI) * thick;
      const z = sampleTorsoSurfaceZ(x, y, broadness, true) + (side === 1 ? 0.008 : 0.003) + arch;
      positions.push(x, y, Math.max(z, cz - 0.008));
      uvs.push(u, v * 2.5);
    }
  }

  const stride = segsU + 1;
  for (let iv = 0; iv < segsV; iv++) {
    for (let iu = 0; iu < segsU; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Curved leather sword-sling hugging the human chest & shoulder contour (replaces rigid BoxGeometry!).
 */
export function createCurvedCrossStrapGeo(broadness = 1.0, dirSign: -1 | 1): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = THREE.MathUtils.lerp(0.51, 0.05, t);
    const x = dirSign * THREE.MathUtils.lerp(-0.155 * broadness, 0.16 * broadness, t);
    const z = sampleTorsoSurfaceZ(x, y, broadness, true) + 0.014;
    pts.push(new THREE.Vector3(x, y, z));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 22, 0.015, 8, false);
  geo.scale(1, 1, 0.65);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpted curved multi-lame shoulder pauldron or layered Hanfu shoulder yoke
 * conforming naturally over the human deltoid curve.
 */
export function createSculptedPauldronGeo(armored: boolean): THREE.BufferGeometry {
  const segU = 18;
  const segV = 12;
  const geo = new THREE.SphereGeometry(0.118, segU, segV, -Math.PI * 0.55, Math.PI * 1.1, 0.12, Math.PI * 0.52);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const drop = clamp((0.1 - y) / 0.16, 0, 1);
    if (armored) {
      // Sculpted tiered Ming/Tang lamellar ridges + slight upward outer wing flare
      const lame = Math.sin(drop * Math.PI * 5.0) * 0.0065;
      x *= 1.16 + drop * 0.14;
      z *= 1.08 + drop * 0.08;
      y = y * 0.82 + lame;
    } else {
      // Draped tailored Hanfu shoulder mantle
      x *= 1.04 + drop * 0.06;
      z *= 0.96;
      y *= 0.68;
    }
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpted curved, tapered, ribbed ancient bronze/obsidian war-horn for Demon King Boss.
 * Replaces flat ConeGeometry party-hat horns!
 */
export function createCurvedWarHornGeo(side: -1 | 1): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(side * 0.065, 0.075, -0.01),
    new THREE.Vector3(side * 0.145, 0.165, 0.015),
    new THREE.Vector3(side * 0.185, 0.275, 0.048),
    new THREE.Vector3(side * 0.145, 0.375, 0.072),
  ];
  const curve = new THREE.CatmullRomCurve3(pts);
  const tubularSegs = 24;
  const radialSegs = 12;
  const geo = new THREE.TubeGeometry(curve, tubularSegs, 0.032, radialSegs, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  const colors = new Float32Array(pos.count * 3);
  const cRoot = new THREE.Color('#3b302a');
  const cMid = new THREE.Color('#7c6854');
  const cTip = new THREE.Color('#d2bfa0');
  const tmpC = new THREE.Color();

  for (let i = 0; i <= tubularSegs; i++) {
    const t = i / tubularSegs;
    const center = curve.getPointAt(t);
    // Natural organic horn taper from thick skull root to sharp curved point + keratin/bronze growth ribs
    const rib = Math.sin(t * Math.PI * 14) * (1 - t);
    const taper = Math.pow(1 - t, 0.78) * (1 + rib * 0.085);
    if (t < 0.45) tmpC.lerpColors(cRoot, cMid, t / 0.45);
    else tmpC.lerpColors(cMid, cTip, (t - 0.45) / 0.55);
    const ribLift = 1 + rib * 0.14;
    for (let j = 0; j <= radialSegs; j++) {
      const idx = i * (radialSegs + 1) + j;
      const vx = pos.getX(idx) - center.x;
      const vy = pos.getY(idx) - center.y;
      const vz = pos.getZ(idx) - center.z;
      pos.setXYZ(idx, center.x + vx * taper, center.y + vy * taper, center.z + vz * taper);
      colors[idx * 3] = clamp(tmpC.r * ribLift, 0, 1);
      colors[idx * 3 + 1] = clamp(tmpC.g * ribLift, 0, 1);
      colors[idx * 3 + 2] = clamp(tmpC.b * ribLift, 0, 1);
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sweeping curved horsehair helmet war-plume (replaces ConeGeometry!).
 */
export function createCurvedWarPlumeGeo(length = 0.28): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0.045, -length * 0.22),
    new THREE.Vector3(0, 0.025, -length * 0.58),
    new THREE.Vector3(0, -0.075, -length * 0.92),
    new THREE.Vector3(0, -0.155, -length),
  ];
  const curve = new THREE.CatmullRomCurve3(pts);
  const tubularSegs = 18;
  const radialSegs = 10;
  const geo = new THREE.TubeGeometry(curve, tubularSegs, 0.03, radialSegs, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  for (let i = 0; i <= tubularSegs; i++) {
    const t = i / tubularSegs;
    const center = curve.getPointAt(t);
    const widthScale = Math.sin(clamp(t * 0.92 + 0.08, 0, 1) * Math.PI) * 1.15 + 0.12 * (1 - t);
    for (let j = 0; j <= radialSegs; j++) {
      const idx = i * (radialSegs + 1) + j;
      const vx = (pos.getX(idx) - center.x) * widthScale * 0.78;
      const vy = (pos.getY(idx) - center.y) * widthScale * 1.18;
      const vz = (pos.getZ(idx) - center.z) * widthScale;
      pos.setXYZ(idx, center.x + vx, center.y + vy, center.z + vz);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpted anatomical human/gauntlet hand with rounded palm, thenar pad, and tapered two-segment fingers.
 * Replaces sharp-cornered BoxGeometry Lego palms!
 */
export function createRealisticHandGroup(
  mat: THREE.Material,
  style: 'grip' | 'swordFinger',
): THREE.Group {
  const g = new THREE.Group();

  // Organic rounded palm & knuckle ridge
  const palmGeo = new THREE.SphereGeometry(0.036, 12, 10);
  palmGeo.scale(0.92, 1.18, 0.44);
  const palm = new THREE.Mesh(palmGeo, mat);
  palm.position.set(0, -0.034, 0.002);
  g.add(palm);

  // Thenar thumb muscle pad
  const padGeo = new THREE.SphereGeometry(0.02, 10, 8);
  padGeo.scale(0.85, 1.25, 0.72);
  const pad = new THREE.Mesh(padGeo, mat);
  pad.position.set(-0.022, -0.03, 0.011);
  g.add(pad);

  const proxGeo = new THREE.CapsuleGeometry(0.0072, 0.024, 4, 8);
  const distGeo = new THREE.CapsuleGeometry(0.006, 0.02, 4, 8);
  const thumbGeo = new THREE.CapsuleGeometry(0.008, 0.026, 4, 8);

  const addFinger = (fx: number, lenScale: number, curlProx: number, curlDist: number) => {
    const root = new THREE.Group();
    root.position.set(fx, -0.068, 0.004);
    root.rotation.x = curlProx;
    const p = new THREE.Mesh(proxGeo, mat);
    p.scale.y = lenScale;
    p.position.y = -0.016 * lenScale;
    root.add(p);

    const tipGroup = new THREE.Group();
    tipGroup.position.set(0, -0.033 * lenScale, 0);
    tipGroup.rotation.x = curlDist;
    const d = new THREE.Mesh(distGeo, mat);
    d.scale.y = lenScale * 0.92;
    d.position.y = -0.012 * lenScale;
    tipGroup.add(d);
    root.add(tipGroup);
    g.add(root);
  };

  if (style === 'swordFinger') {
    addFinger(-0.016, 1.02, 0.08, 0.06);
    addFinger(-0.001, 1.08, 0.06, 0.05);
    addFinger(0.014, 0.96, 1.15, 1.05);
    addFinger(0.026, 0.82, 1.22, 1.05);
  } else {
    addFinger(-0.02, 0.98, 1.02, 0.95);
    addFinger(-0.006, 1.05, 1.08, 0.98);
    addFinger(0.008, 0.98, 1.12, 1.0);
    addFinger(0.021, 0.84, 1.18, 1.02);
  }

  const thumb = new THREE.Mesh(thumbGeo, mat);
  thumb.position.set(-0.031, -0.048, 0.022);
  thumb.rotation.set(0.68, 0.15, -0.52);
  g.add(thumb);

  return g;
}

/**
 * Tapered oval-section realistic sword scabbard with molded bronze throat & chape (replaces BoxGeometry!).
 */
export function createSculptedScabbardGroup(leatherMat: THREE.Material, bronzeMat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.028, 1.04, 14), leatherMat);
  body.scale.set(1.0, 1.0, 0.44);
  body.position.y = 0.44;
  const chape = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.024, 0.14, 14), bronzeMat);
  chape.scale.set(1.04, 1.0, 0.48);
  chape.position.y = 0.96;
  const locket = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.029, 0.09, 14), bronzeMat);
  locket.scale.set(1.06, 1.0, 0.5);
  locket.position.y = -0.06;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.045, 14), bronzeMat);
  band.scale.set(1.08, 1.0, 0.52);
  band.position.y = 0.3;
  g.add(body, chape, locket, band);
  return g;
}

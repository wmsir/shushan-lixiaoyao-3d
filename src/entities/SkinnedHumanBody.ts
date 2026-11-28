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

function getTorsoProfile(style: BodyBuildStyle): Array<[number, number, number]> {
  if (style === 'hero' || style === 'robe') {
    // Sleek athletic Donghua protagonist V-taper:
    // - Starts at y = -0.028 (tucked INSIDE the waist sash so ZERO white pelvis triangles poke out below the belt!)
    // - Closes solidly around the neck root up to y = 0.592 (eliminating ANY neck-to-collar hollow gap!)
    return [
      [-0.028, 0.146, 0.108], // lower waist base cleanly tucked inside waist sash
      [0.05, 0.138, 0.104],   // tailored waist cinch
      [0.14, 0.138, 0.105],   // slender athletic waist
      [0.26, 0.168, 0.118],   // lower ribcage
      [0.39, 0.198, 0.134],   // poised heroic chest / lats
      [0.485, 0.205, 0.128],  // smooth clavicle / shoulder shelf
      [0.542, 0.128, 0.095],  // trapezius slope
      [0.578, 0.070, 0.068],  // neck collar base (flush with inner collar!)
      [0.596, 0.050, 0.050],  // sealed upper neck socket rim (zero air slit!)
    ];
  }
  return [
    [-0.14, 0.158, 0.118],
    [-0.04, 0.172, 0.128],
    [0.05, 0.156, 0.114],
    [0.12, 0.149, 0.109],
    [0.24, 0.176, 0.122],
    [0.38, 0.212, 0.144],
    [0.48, 0.222, 0.140],
    [0.545, 0.145, 0.104],
    [0.60, 0.068, 0.065],
  ];
}

function sampleProfileArray(profile: Array<[number, number, number]>, y: number): [number, number] {
  if (y <= profile[0][0]) return [profile[0][1], profile[0][2]];
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i];
    const b = profile[i + 1];
    if (y >= a[0] && y <= b[0]) {
      const u = (y - a[0]) / Math.max(1e-4, b[0] - a[0]);
      const s = u * u * (3 - 2 * u);
      return [THREE.MathUtils.lerp(a[1], b[1], s), THREE.MathUtils.lerp(a[2], b[2], s)];
    }
  }
  const last = profile[profile.length - 1];
  return [last[1], last[2]];
}

/**
 * Evaluates the exact sculpted surface depth Z of the torso at local (x, y) on front (+Z)
 * or back (-Z) so flush Hanfu V-collars, shoulder drapes, and straps hug the chest with zero gap.
 */
export function sampleTorsoSurfaceZ(
  x: number,
  y: number,
  broadness: number,
  front = true,
  style: BodyBuildStyle = 'hero',
): number {
  const profile = getTorsoProfile(style);
  const [rxRaw, rzRaw] = sampleProfileArray(profile, y);
  const scaleX = (style === 'hero' || style === 'robe' ? 1.06 : 1.12) * broadness;
  const scaleZ = style === 'boss' ? 1.12 : 1.02;
  const rx = rxRaw * scaleX;
  const rz = rzRaw * scaleZ;
  const nx = clamp(x / Math.max(0.035, rx), -0.97, 0.97);
  let z = Math.sqrt(Math.max(0.015, 1 - nx * nx)) * rz;
  if (front && y > 0.24 && y < 0.50) {
    const pec =
      Math.exp(-Math.pow((y - 0.39) / 0.085, 2)) *
      Math.exp(-Math.pow((Math.abs(nx) - 0.42) / 0.34, 2));
    z += pec * (style === 'hero' || style === 'robe' ? 0.010 : 0.016);
  }
  return front ? z : -z;
}

/**
 * Builds ONE continuous, unbroken, outward-normal THREE.SkinnedMesh spanning
 * waist -> ribcage -> chest -> shoulders -> trapezius -> sealed neck collar.
 */
export function createSeamlessTorsoSkinnedMesh(
  style: BodyBuildStyle,
  material: THREE.Material,
): ContinuousTorsoRig {
  const broadness = style === 'boss' ? 1.14 : style === 'armored' ? 1.06 : 0.98;
  const radialSegs = 40;
  const heightSegs = 34;
  const profile = getTorsoProfile(style);
  const yMin = profile[0][0];
  const yMax = profile[profile.length - 1][0];
  const isCloth = style === 'hero' || style === 'robe';

  const positions: number[] = [];
  const uvs: number[] = [];
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const indices: number[] = [];

  for (let iy = 0; iy <= heightSegs; iy++) {
    const v = iy / heightSegs;
    const y = THREE.MathUtils.lerp(yMin, yMax, v);
    const [rxBase, rzBase] = sampleProfileArray(profile, y);
    const rx = rxBase * (isCloth ? 1.06 : 1.12) * broadness;
    const rz = rzBase * (style === 'boss' ? 1.12 : 1.02);

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

      if (cosT > 0 && y > 0.22 && y < 0.51) {
        const pecVert = Math.exp(-Math.pow((y - 0.39) / 0.085, 2));
        const pecSide = Math.exp(-Math.pow((Math.abs(sinT) - 0.42) / 0.34, 2));
        const sternum = Math.exp(-Math.pow(sinT / 0.14, 2));
        const pecAmp = isCloth ? 0.010 : 0.017;
        z += (pecVert * pecSide * pecAmp - pecVert * sternum * (isCloth ? 0.0025 : 0.006)) * cosT;
      }

      if (cosT < 0 && y > 0.08 && y < 0.50) {
        const spine = Math.exp(-Math.pow(sinT / 0.18, 2));
        const scap =
          Math.exp(-Math.pow((Math.abs(sinT) - 0.46) / 0.26, 2)) *
          Math.exp(-Math.pow((y - 0.41) / 0.095, 2));
        z += spine * (isCloth ? 0.005 : 0.011) - scap * (isCloth ? 0.007 : 0.013);
      }

      if (!isCloth) {
        const tier =
          Math.sin(y * 74) *
          0.0036 *
          clamp((y - 0.08) / 0.32, 0, 1) *
          clamp((0.48 - y) / 0.12, 0, 1);
        x += sinT * tier;
        z += cosT * tier;
      }

      positions.push(x, y, z);
      // Map v from top=0 -> bottom=1 so Donghua silk gradient illuminates upper chest & shades gracefully toward waist!
      uvs.push(u * 1.5, 1.0 - v);
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
      indices.push(a, b, c, b, d, c);
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
  upperRadii: Array<[number, number]>;
  lowerRadii: Array<[number, number]>;
  splitT?: number;
  clothFolds?: boolean;
  cuffRidge?: number;
}

/**
 * Continuous unbroken 3-bone THREE.SkinnedMesh for an entire arm or leg with outward normals.
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

  // Compact low-profile deltoid/hip top cap dome (flows inline BELOW the sloping trapezius shoulder line!)
  const capHeightScale = spec.kind === 'arm' ? 0.56 : 0.80;
  for (let k = 0; k < 4; k++) {
    const ang = (k / 4) * (Math.PI * 0.5);
    const y = Math.cos(ang) * spec.topCapRadius * capHeightScale;
    const r = Math.max(0.004, Math.sin(ang) * spec.topCapRadius);
    ySamples.push({ y, rx: r * 1.02, rz: r * 0.98, isCap: true });
  }

  const mainRings = 30;
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
        rzScale = 1.06;
        rxScale = 0.96;
      } else {
        rzScale = 1.03;
      }
    } else {
      const tl = (f - jointFrac) / (1 - jointFrac);
      r = sampleTable(spec.lowerRadii, tl);
      if (spec.kind === 'leg') {
        const calf = Math.exp(-Math.pow((tl - 0.34) / 0.22, 2)) * 0.010;
        rzScale = 1.05 + calf / Math.max(0.03, r);
      }
    }

    if (spec.cuffRidge && Math.abs(f - splitFrac) < 0.048) {
      const lip = Math.exp(-Math.pow((f - splitFrac) / 0.022, 2)) * spec.cuffRidge;
      r += lip;
    }
    if (spec.cuffRidge && f > 0.88 && f < 0.96) {
      const endLip = Math.exp(-Math.pow((f - 0.92) / 0.022, 2)) * (spec.cuffRidge * 0.48);
      r += endLip;
    }

    ySamples.push({ y, rx: r * rxScale, rz: r * rzScale });
  }

  const lastSample = ySamples[ySamples.length - 1];
  ySamples.push({ y: -totalLen - 0.014, rx: lastSample.rx * 0.65, rz: lastSample.rz * 0.65, isCap: true });

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

      if (!s.isCap && spec.clothFolds && f > 0.14 && f < splitFrac - 0.02) {
        const crease = Math.sin(theta * 4 + f * 7) * 0.0012;
        rx += crease;
        rz += crease;
      }

      if (!s.isCap && spec.kind === 'leg' && cosT > 0.3 && Math.abs(f - jointFrac) < 0.07) {
        const patella = Math.exp(-Math.pow((f - jointFrac) / 0.038, 2)) * Math.pow(cosT, 2) * 0.012;
        rz += patella;
      }

      positions.push(sinT * rx, s.y, cosT * rz);
      uvs.push(u * 1.4, f * 1.6);
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
      target.push(a, c, b, b, c, d);
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

  _y0.subVectors(startPos, midPos);
  if (_y0.lengthSq() < 1e-6) _y0.set(0, 1, 0);
  else _y0.normalize();

  _pole.subVectors(polePos, startPos);
  _pole.addScaledVector(_y0, -_pole.dot(_y0));
  if (_pole.lengthSq() < 1e-6) _pole.set(0, 0, polePointsForward ? 1 : -1);
  else _pole.normalize();

  _z0.copy(_pole);
  if (!polePointsForward) _z0.negate();
  _x0.crossVectors(_y0, _z0).normalize();
  _z0.crossVectors(_x0, _y0).normalize();

  _mat0.makeBasis(_x0, _y0, _z0);
  _q0.setFromRotationMatrix(_mat0);
  limb.rootBone.quaternion.copy(_q0);

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
 * Flush, ultra-smooth tailored Hanfu cross-collar lapel (交领右衽) lying strictly against
 * sampleTorsoSurfaceZ(x, y) from neck sides cleanly down across sternum into the waist sash.
 * ZERO protruding 2cm top corners, ZERO floating horizontal bar across the throat!
 */
export function createCurvedHanfuCollarGeo(broadness = 0.98, side: -1 | 1): THREE.BufferGeometry {
  const segsU = 6;
  const segsV = 22;
  const width = 0.044;
  const thick = 0.0052;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iv = 0; iv <= segsV; iv++) {
    const v = iv / segsV; // 0 = top neck-side anchor (y=0.562), 1 = waist sash tuck (y=0.075)
    const y = THREE.MathUtils.lerp(0.562, 0.075, v);
    // Smooth curve from neck side (x = ±0.064) diagonally down across chest (交领右衽: left overlaps right!)
    const startX = side * 0.064 * broadness;
    const endX = side === 1 ? -0.056 * broadness : 0.036 * broadness;
    const cx = THREE.MathUtils.lerp(startX, endX, Math.pow(v, 0.95));
    // Taper gently at top neck entry so there is ZERO sticking-out corner!
    const widthEase = v < 0.14 ? THREE.MathUtils.lerp(0.55, 1.0, v / 0.14) : 1.0;
    const localW = width * widthEase;
    const layerOffset = side === 1 ? 0.0055 : 0.0028;

    for (let iu = 0; iu <= segsU; iu++) {
      const u = iu / segsU;
      const offset = (u - 0.5) * localW;
      const x = cx + offset;
      // Soft pillowed silk edge contour, flush onto exact torso surface at every vertex!
      const arch = Math.sin(u * Math.PI) * thick;
      const z = sampleTorsoSurfaceZ(x, y, broadness, true, 'hero') + layerOffset + arch;
      positions.push(x, y, z);
      uvs.push(u, v * 2.2);
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
 * Flush tailored stand-up inner Hanfu neck collar (中衣领) wrapping cleanly around the smooth neck
 * and sitting seamlessly on the upper clavicle — ZERO air gap and ZERO floating horizontal bar!
 */
export function createInnerHanfuCollarGeo(broadness = 0.98): THREE.BufferGeometry {
  const segsU = 32;
  const segsV = 8;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iv = 0; iv <= segsV; iv++) {
    const v = iv / segsV; // 0 = base embedded smoothly into upper torso, 1 = crisp collar rim
    for (let iu = 0; iu <= segsU; iu++) {
      const u = iu / segsU;
      const phi = u * Math.PI * 2; // 0 = front (+Z), PI = back (-Z)
      const cosP = Math.cos(phi);
      const sinP = Math.sin(phi);
      // Graceful front V-dip revealing warm smooth neck, crisp high stand-collar at sides & back of neck!
      const frontV = Math.pow(clamp(cosP, 0, 1), 1.6);
      const yTop = 0.602 - frontV * 0.088;
      const yBot = 0.515 - frontV * 0.095;
      const y = THREE.MathUtils.lerp(yBot, yTop, v);
      const rBot = 0.088 * broadness;
      const rTop = 0.066 * broadness;
      const r = THREE.MathUtils.lerp(rBot, rTop, v);
      const x = sinP * r;
      const zBase = cosP * r * 0.96 + 0.005;
      const zSurf =
        cosP > 0.15 && y < 0.56
          ? Math.max(zBase, sampleTorsoSurfaceZ(x, y, broadness, true, 'hero') + 0.0025)
          : zBase;
      positions.push(x, y, zSurf);
      uvs.push(u * 2, v);
    }
  }

  const stride = segsU + 1;
  for (let iv = 0; iv < segsV; iv++) {
    for (let iu = 0; iu < segsU; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
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
 * Open-front sculpted Xianxia cloud-shoulder mantle (对襟云肩) flowing smoothly from the neck/trapezius
 * outward over both sloping deltoid shoulders and down into a pointed back capelet:
 * - OPEN across the front V-collar (ZERO horizontal bar cutting across the chest V-neck!)
 * - Smoothly covers the upper-arm sockets with a natural sloping human shoulder silhouette (ZERO marshmallow caps!)
 */
export function createFlushShoulderMantleGeo(broadness = 0.98): THREE.BufferGeometry {
  const segsU = 38;
  const segsV = 12;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Open front V-gap from -0.44..+0.44 rad so the crisp Hanfu cross-collar stays 100% unobstructed!
  const phiStart = 0.44;
  const phiEnd = Math.PI * 2 - 0.44;

  for (let iv = 0; iv <= segsV; iv++) {
    const v = iv / segsV; // 0 = lower draped shoulder-sleeve / back hem, 1 = snug neck/trapezius seam
    for (let iu = 0; iu <= segsU; iu++) {
      const u = iu / segsU;
      const phi = THREE.MathUtils.lerp(phiStart, phiEnd, u);
      const cosP = Math.cos(phi); // +1 front, -1 back
      const sinP = Math.sin(phi); // ±1 left/right shoulder
      const sideFactor = Math.pow(Math.abs(sinP), 1.35);
      const backFactor = Math.pow(clamp(-cosP, 0, 1), 1.4);
      // Soft taper right at the front open V-collar edges so mantle merges flush into lapels
      const edgeT = Math.min(u, 1 - u);
      const frontEdgeEase = clamp(edgeT / 0.14, 0, 1);

      // Natural sloping trapezius-to-deltoid contour mathematically clearing the lowered arm dome (pelvis.y=0.488..0.522):
      const slopeEase = Math.pow(1 - v, 0.50);
      const yTop = 0.562 - (1 - frontEdgeEase) * 0.025;
      const yBot = 0.448 - sideFactor * 0.026 - backFactor * 0.088 + (1 - frontEdgeEase) * 0.028;
      const shoulderArch = Math.sin(v * Math.PI) * sideFactor * 0.040;
      const y = THREE.MathUtils.lerp(yBot, yTop, v) + shoulderArch;

      const [rxRaw, rzRaw] = sampleProfileArray(getTorsoProfile('hero'), clamp(y, 0.36, 0.57));
      // Smoothly covers deltoid dome & upper bicep wall (rx≈0.268 over side deltoid, flush on front/back!)
      const deltoidCover = sideFactor * (0.016 + 0.062 * slopeEase);
      const frontTuck = frontEdgeEase * 0.008 + (1 - frontEdgeEase) * 0.002;
      const rx = rxRaw * 1.06 * broadness + frontTuck + deltoidCover;
      const rz = rzRaw * 1.02 + frontTuck + sideFactor * 0.018 * slopeEase + backFactor * 0.008 * (1 - v);

      positions.push(sinP * rx, y, cosP * rz);
      uvs.push(u * 2.0, 1.0 - v);
    }
  }

  const stride = segsU + 1;
  for (let iv = 0; iv < segsV; iv++) {
    for (let iu = 0; iu < segsU; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
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
 * Curved leather sword-sling hugging the human chest & shoulder contour.
 */
export function createCurvedCrossStrapGeo(broadness = 0.98, dirSign: -1 | 1): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const steps = 16;
  const style: BodyBuildStyle = broadness > 1.02 ? 'armored' : 'hero';
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = THREE.MathUtils.lerp(0.50, 0.07, t);
    const x = dirSign * THREE.MathUtils.lerp(-0.142 * broadness, 0.148 * broadness, t);
    const z = sampleTorsoSurfaceZ(x, y, broadness, true, style) + 0.011;
    pts.push(new THREE.Vector3(x, y, z));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 22, 0.012, 8, false);
  geo.scale(1, 1, 0.55);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpted tiered lamellar pauldron (armored=true) or sleek tailored sleeve cap (armored=false).
 */
export function createSculptedPauldronGeo(armored: boolean): THREE.BufferGeometry {
  if (!armored) {
    // Sleek low-profile flat-curved sleeve shoulder cap (ZERO bulbous hemisphere dome!)
    const segU = 18;
    const segV = 10;
    const geo = new THREE.SphereGeometry(0.088, segU, segV, -Math.PI * 0.55, Math.PI * 1.1, 0.14, Math.PI * 0.46);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      x *= 1.05;
      z *= 0.94;
      y *= 0.62;
      pos.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    return geo;
  }

  const segU = 18;
  const segV = 12;
  const geo = new THREE.SphereGeometry(0.116, segU, segV, -Math.PI * 0.55, Math.PI * 1.1, 0.12, Math.PI * 0.52);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const drop = clamp((0.1 - y) / 0.16, 0, 1);
    const lame = Math.sin(drop * Math.PI * 5.0) * 0.006;
    x *= 1.15 + drop * 0.13;
    z *= 1.06 + drop * 0.08;
    y = y * 0.82 + lame;
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpted form-fitting Donghua layered waist sash / brocade corset (锦缎腰封)
 * with curved heroic V-dip lower hem and smooth top/bottom trim bevels.
 */
export function createSculptedWaistSashGeo(broadness = 0.98): THREE.BufferGeometry {
  const segU = 36;
  const segV = 10;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iv = 0; iv <= segV; iv++) {
    const v = iv / segV;
    for (let iu = 0; iu <= segU; iu++) {
      const u = iu / segU;
      const phi = u * Math.PI * 2;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);
      const frontFocus = Math.pow(clamp(cosP, 0, 1), 2.2);

      const yTop = 0.122 + frontFocus * 0.012;
      const yBot = -0.036 - frontFocus * 0.024;
      const y = THREE.MathUtils.lerp(yBot, yTop, v);

      const [rxRaw, rzRaw] = sampleProfileArray(getTorsoProfile('hero'), clamp(y, -0.028, 0.14));
      const edgeLip = v < 0.14 || v > 0.86 ? 0.0045 : 0.002;
      const swell = Math.sin(v * Math.PI) * 0.005 + edgeLip;
      const rx = rxRaw * 1.06 * broadness + 0.012 + swell;
      const rz = rzRaw * 1.02 + 0.012 + swell;

      positions.push(sinP * rx, y, cosP * rz);
      uvs.push(u * 2.0, v);
    }
  }

  const stride = segU + 1;
  for (let iv = 0; iv < segV; iv++) {
    for (let iu = 0; iu < segU; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
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
 * Gracefully curved, multi-layered Donghua Hanfu coat-tail panels with sculpted Xianxia hem silhouettes.
 */
export function createFlowingCoatTailGeo(
  arcAngle: number,
  topR: number,
  botR: number,
  height: number,
  hemStyle: 'frontV' | 'sideSplit' | 'backSwallowtail' = 'frontV',
): THREE.BufferGeometry {
  const segU = 22;
  const segV = 12;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iv = 0; iv <= segV; iv++) {
    const v = iv / segV;
    for (let iu = 0; iu <= segU; iu++) {
      const u = iu / segU;
      const s = (u - 0.5) * 2.0;
      const ang = s * (arcAngle * 0.5);

      let hemLenScale = 1.0;
      if (hemStyle === 'frontV') {
        hemLenScale = 0.78 + 0.25 * (1 - Math.abs(s + 0.06) * 0.85);
      } else if (hemStyle === 'sideSplit') {
        hemLenScale = 0.82 + 0.18 * Math.cos(s * Math.PI * 0.5);
      } else {
        const swallow = 0.90 + 0.16 * Math.sin(Math.abs(s) * Math.PI * 0.85);
        const centerCut = Math.exp(-Math.pow(s / 0.20, 2)) * 0.14;
        hemLenScale = swallow - centerCut;
      }

      const y = -v * height * hemLenScale;
      const flareEase = Math.pow(v, 1.18);
      const baseR = THREE.MathUtils.lerp(topR, botR, flareEase);
      const pleat =
        Math.sin(s * Math.PI * 2.5) * 0.013 * v +
        Math.cos(s * Math.PI * 4.0 + v * 1.4) * 0.0045 * v;
      const r = baseR + pleat;
      const x = Math.sin(ang) * r * (1.0 + 0.03 * flareEase);
      const z = Math.cos(ang) * r * THREE.MathUtils.lerp(0.80, 0.95, v);

      positions.push(x, y, z);
      uvs.push(u, v);
    }
  }

  const stride = segU + 1;
  for (let iv = 0; iv < segV; iv++) {
    for (let iu = 0; iu < segU; iu++) {
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
 * Detailed sculpted Xianxia martial boot group with readable form, beveled sole,
 * upturned gold toe guard, fitted ankle cuff, instep strap, and bronze clasp.
 */
export function createDetailedMartialBootGroup(
  bootMat: THREE.Material,
  trimMat: THREE.Material,
  bronzeMat: THREE.Material,
): THREE.Group {
  const g = new THREE.Group();

  const upperShape = new THREE.Shape();
  upperShape.moveTo(-0.041, -0.088);
  upperShape.lineTo(0.041, -0.088);
  upperShape.quadraticCurveTo(0.050, 0.015, 0.036, 0.118);
  upperShape.quadraticCurveTo(0.0, 0.156, -0.036, 0.118);
  upperShape.quadraticCurveTo(-0.050, 0.015, -0.041, -0.088);
  const upperGeo = new THREE.ExtrudeGeometry(upperShape, {
    depth: 0.050,
    bevelEnabled: true,
    bevelThickness: 0.016,
    bevelSize: 0.011,
    bevelSegments: 3,
  });
  upperGeo.rotateX(Math.PI / 2);
  upperGeo.translate(0, 0.044, 0.022);
  upperGeo.computeVertexNormals();
  const upper = new THREE.Mesh(upperGeo, bootMat);
  upper.castShadow = true;
  upper.receiveShadow = true;

  const soleMat = new THREE.MeshStandardMaterial({
    color: '#1f2634',
    roughness: 0.78,
    metalness: 0.12,
  });
  const soleGeo = new THREE.ExtrudeGeometry(upperShape, {
    depth: 0.018,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.006,
    bevelSegments: 2,
  });
  soleGeo.rotateX(Math.PI / 2);
  soleGeo.translate(0, -0.004, 0.022);
  soleGeo.scale(1.06, 1.0, 1.03);
  soleGeo.computeVertexNormals();
  const sole = new THREE.Mesh(soleGeo, soleMat);
  sole.castShadow = true;

  const toeCap = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), bronzeMat);
  toeCap.scale.set(0.96, 0.54, 1.05);
  toeCap.position.set(0, 0.012, 0.132);
  toeCap.rotation.x = 0.24;

  const ankleCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.049, 0.052, 0.052, 16), trimMat);
  ankleCuff.position.set(0, 0.058, -0.008);
  const ankleGoldRim = new THREE.Mesh(new THREE.TorusGeometry(0.050, 0.0058, 8, 20), bronzeMat);
  ankleGoldRim.rotation.x = Math.PI / 2;
  ankleGoldRim.position.set(0, 0.082, -0.008);

  const instepStrap = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.0065, 8, 18, Math.PI * 1.15), trimMat);
  instepStrap.position.set(0, 0.034, 0.046);
  instepStrap.rotation.set(0.55, 0, -Math.PI * 0.075);

  const clasp = new THREE.Mesh(new THREE.OctahedronGeometry(0.011, 0), bronzeMat);
  clasp.scale.set(1.1, 0.85, 0.5);
  clasp.position.set(0, 0.058, 0.044);

  g.add(upper, sole, toeCap, ankleCuff, ankleGoldRim, instepStrap, clasp);
  return g;
}

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

export function createRealisticHandGroup(
  mat: THREE.Material,
  style: 'grip' | 'swordFinger',
  wristTrimMat?: THREE.Material,
  bracerCuffMat?: THREE.Material,
): THREE.Group {
  const g = new THREE.Group();

  if (wristTrimMat && bracerCuffMat) {
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.037, 0.034, 16), bracerCuffMat);
    cuff.position.set(0, 0.012, 0);
    const goldRim = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.0052, 8, 18), wristTrimMat);
    goldRim.rotation.x = Math.PI / 2;
    goldRim.position.set(0, -0.002, 0);
    g.add(cuff, goldRim);
  }

  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.031, 0.032, 12), mat);
  wrist.scale.set(1.05, 1.0, 0.72);
  wrist.position.set(0, -0.010, 0);
  g.add(wrist);

  const palmGeo = new THREE.SphereGeometry(0.044, 14, 12);
  palmGeo.scale(0.95, 1.24, 0.44);
  const palm = new THREE.Mesh(palmGeo, mat);
  palm.position.set(0, -0.050, 0.003);
  palm.castShadow = true;
  g.add(palm);

  const knuckle = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.056, 6, 10), mat);
  knuckle.rotation.z = Math.PI / 2;
  knuckle.scale.set(1.0, 1.0, 0.85);
  knuckle.position.set(0.002, -0.092, 0.004);
  g.add(knuckle);

  const padGeo = new THREE.SphereGeometry(0.025, 10, 8);
  padGeo.scale(0.86, 1.28, 0.72);
  const pad = new THREE.Mesh(padGeo, mat);
  pad.position.set(-0.028, -0.044, 0.014);
  g.add(pad);

  const proxGeo = new THREE.CapsuleGeometry(0.0086, 0.032, 5, 8);
  const distGeo = new THREE.CapsuleGeometry(0.0072, 0.028, 5, 8);
  const thumbProxGeo = new THREE.CapsuleGeometry(0.0098, 0.028, 5, 8);
  const thumbDistGeo = new THREE.CapsuleGeometry(0.0082, 0.022, 5, 8);

  const addFinger = (fx: number, lenScale: number, curlProx: number, curlDist: number, spreadZ = 0) => {
    const root = new THREE.Group();
    root.position.set(fx, -0.094, 0.005);
    root.rotation.set(curlProx, 0, spreadZ);
    const p = new THREE.Mesh(proxGeo, mat);
    p.scale.y = lenScale;
    p.position.y = -0.021 * lenScale;
    root.add(p);

    const tipGroup = new THREE.Group();
    tipGroup.position.set(0, -0.044 * lenScale, 0);
    tipGroup.rotation.x = curlDist;
    const d = new THREE.Mesh(distGeo, mat);
    d.scale.y = lenScale * 0.92;
    d.position.y = -0.017 * lenScale;
    tipGroup.add(d);
    root.add(tipGroup);
    g.add(root);
  };

  if (style === 'swordFinger') {
    addFinger(-0.022, 1.06, 0.06, 0.05, 0.02);
    addFinger(-0.003, 1.14, 0.05, 0.04, -0.01);
    addFinger(0.016, 0.98, 1.22, 1.12, -0.04);
    addFinger(0.032, 0.84, 1.32, 1.15, -0.08);
  } else {
    addFinger(-0.025, 1.02, 1.08, 1.02, 0.02);
    addFinger(-0.008, 1.10, 1.14, 1.04, 0);
    addFinger(0.010, 1.02, 1.18, 1.06, -0.02);
    addFinger(0.026, 0.86, 1.24, 1.08, -0.05);
  }

  const thumbRoot = new THREE.Group();
  thumbRoot.position.set(-0.036, -0.056, 0.022);
  thumbRoot.rotation.set(style === 'swordFinger' ? 0.85 : 0.72, 0.18, style === 'swordFinger' ? -0.78 : -0.52);
  const tp = new THREE.Mesh(thumbProxGeo, mat);
  tp.position.y = -0.016;
  const td = new THREE.Mesh(thumbDistGeo, mat);
  td.position.set(0, -0.040, 0.006);
  td.rotation.x = 0.42;
  thumbRoot.add(tp, td);
  g.add(thumbRoot);

  return g;
}

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

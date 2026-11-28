import * as THREE from 'three';
import { clamp } from '../utils/math';

export type AnimeFaceStyle = 'hero' | 'ally' | 'elder' | 'vanguard' | 'elite' | 'boss';

export interface AnimeHeadOptions {
  variant?: 'hero' | 'boss';
  jawStrength?: number;
  browDepth?: number;
}

/**
 * Core mathematical surface evaluator for the stylized 3D Donghua / Anime head
 * (Genshin Impact Xiao/Zhongli & Honor of Kings Li Bai aesthetic).
 * Balanced compact vertical ratio (~1.13 height:width), fuller smooth cranium,
 * slender cheeks, crisp heroic V-line jawline & tapered chin, delicate sculpted anime nose,
 * and refined subtle side-profile lips.
 */
export function evalAnimeHeadSurface(
  vx: number,
  vy: number,
  vz: number,
  options?: AnimeHeadOptions,
): THREE.Vector3 {
  const isBoss = options?.variant === 'boss';
  const jawStrength = options?.jawStrength ?? (isBoss ? 1.18 : 1.0);
  const browDepth = options?.browDepth ?? (isBoss ? 1.24 : 0.90);

  // 1. Balanced compact 3D anime cranium proportions (eliminates elongated egg face!)
  let x = vx * (isBoss ? 0.095 : 0.093);
  let y = vy * (isBoss ? 0.110 : 0.106);
  let z = vz * (isBoss ? 0.100 : 0.098);

  // Full smooth upper cranium dome for lush anime hair volume
  if (vy > 0.18) {
    const crownT = clamp((vy - 0.18) / 0.82, 0, 1);
    const domeLift = Math.sin(crownT * Math.PI * 0.5);
    x *= 1.0 + domeLift * 0.042;
    z *= 1.0 + domeLift * 0.032;
  }

  // Rounded natural occipital back skull (vz < 0)
  if (vz < 0) {
    z *= 1.09;
    if (vy > -0.14) y += 0.005 * (-vz);
  }

  // Smooth clean temples (zero harsh indents)
  if (vy > 0.08 && vy < 0.56 && Math.abs(vx) > 0.64) {
    const tMask =
      Math.exp(-Math.pow((vy - 0.30) / 0.22, 2)) * clamp((Math.abs(vx) - 0.64) / 0.36, 0, 1);
    x *= 1.0 - tMask * 0.026;
  }

  // 2. Crisp Heroic V-Line Anime Jawline & Compact Tapered Chin (vy < -0.16)
  if (vy < -0.16) {
    const jawT = clamp((-vy - 0.16) / 0.84, 0, 1);
    const frontFactor = clamp(vz * 0.52 + 0.48, 0, 1);
    // Smooth crisp anime V-jaw tapering neatly to a refined chin (not long/pointy-egg!)
    const vTaper = Math.pow(jawT, 1.16) * (isBoss ? 0.36 : 0.46) * (0.48 + 0.52 * frontFactor);
    x *= 1.0 - vTaper;

    // Subtle handsome anime jaw corner for crisp 3/4 & side profile
    const gonial =
      Math.exp(-Math.pow((Math.abs(vx) - 0.66) / 0.22, 2)) *
      Math.exp(-Math.pow((vy + 0.52) / 0.18, 2));
    x += Math.sign(vx) * gonial * 0.0044 * jawStrength;

    // Clean sculpted anime chin (compact vertical height, slight crisp forward projection)
    if (vz > 0.10) {
      const chin =
        Math.exp(-Math.pow(vx / (isBoss ? 0.30 : 0.24), 2)) *
        Math.exp(-Math.pow((vy + 0.86) / 0.18, 2));
      z += chin * (isBoss ? 0.0115 : 0.0102) * jawStrength;
      y += (1 - chin) * 0.002 * jawT;
    }

    // Crisp sub-chin jaw underside tuck so side profile jawline reads sharp & athletic
    if (vz < 0.28 && vy < -0.58) {
      const underT = clamp((-vy - 0.58) / 0.42, 0, 1) * clamp((0.28 - vz) / 0.68, 0, 1);
      y += underT * 0.012;
    }
  }

  // 3. Clean Stylized Donghua Front Face (vz > 0.05) — landmarks centered at true anime midpoint (eyeVy = -0.09)!
  if (vz > 0.05) {
    const fMask = clamp((vz - 0.05) / 0.45, 0, 1);

    // Gently flattened front eye-plane so anime eyes read wide, expressive, and clear in front & 3/4 view
    const eyePlane =
      Math.exp(-Math.pow(vx / 0.66, 2)) *
      Math.exp(-Math.pow((vy + 0.09) / 0.25, 2));
    z -= eyePlane * 0.0036 * fMask;

    // Subtle smooth brow plane above eyes (vy ≈ +0.11)
    const browArch =
      Math.exp(-Math.pow((vy - 0.11) / 0.095, 2)) *
      Math.exp(-Math.pow(vx / 0.60, 2));
    z += browArch * (isBoss ? 0.0072 : 0.0032) * browDepth * fMask;

    // Shallow smooth anime eye-bed recess aligned cleanly at eyeVy = -0.090
    const sockL =
      Math.exp(-Math.pow((vx + 0.375) / 0.185, 2)) *
      Math.exp(-Math.pow((vy + 0.090) / 0.098, 2));
    const sockR =
      Math.exp(-Math.pow((vx - 0.375) / 0.185, 2)) *
      Math.exp(-Math.pow((vy + 0.090) / 0.098, 2));
    z -= 0.0034 * (sockL + sockR) * fMask;

    // Soft youthful anime high-cheek fullness below outer eyes (vy ≈ -0.30)
    const cheekL =
      Math.exp(-Math.pow((vx + 0.48) / 0.24, 2)) *
      Math.exp(-Math.pow((vy + 0.30) / 0.18, 2));
    const cheekR =
      Math.exp(-Math.pow((vx - 0.48) / 0.24, 2)) *
      Math.exp(-Math.pow((vy + 0.30) / 0.18, 2));
    z += 0.0046 * (cheekL + cheekR) * fMask;

    // Crisp, refined small sculpted anime nose bridge (vy = -0.04 down to tip at vy = -0.34)
    const noseWidth = isBoss ? 0.076 : 0.062;
    const noseProfile = Math.exp(-Math.pow(vx / noseWidth, 2));
    const noseT = clamp((-0.02 - vy) / 0.34, 0, 1);
    const noseBridge = vy > -0.36 && vy < -0.02 ? Math.pow(Math.sin(noseT * Math.PI * 0.85), 1.05) : 0;
    const noseTip =
      Math.exp(-Math.pow(vx / (isBoss ? 0.080 : 0.066), 2)) *
      Math.exp(-Math.pow((vy + 0.340) / 0.064, 2));
    const underNose =
      Math.exp(-Math.pow(vx / 0.092, 2)) *
      Math.exp(-Math.pow((vy + 0.435) / 0.046, 2));
    z +=
      (noseProfile * noseBridge * (isBoss ? 0.0115 : 0.0102) +
        noseTip * (isBoss ? 0.0160 : 0.0148) -
        underNose * 0.0028) *
      fMask;

    // Subtle crisp anime upper/lower lip silhouette for charming side profile (mouth at vy = -0.58)
    const mouthW = Math.exp(-Math.pow(vx / 0.185, 2));
    const upperLip = mouthW * Math.exp(-Math.pow((vy + 0.555) / 0.038, 2));
    const lowerLip = mouthW * Math.exp(-Math.pow((vy + 0.625) / 0.042, 2));
    const chinHollow = mouthW * Math.exp(-Math.pow((vy + 0.720) / 0.048, 2));
    z += (upperLip * 0.0036 + lowerLip * 0.0032 - chinHollow * 0.0026) * fMask;
  }

  return new THREE.Vector3(x, y, z);
}

/**
 * Stylized 3D Donghua / Anime head mesh (64x48) with compact heroic proportions,
 * clean V-line jawline, refined small sculpted nose, and seamless front-projected UVs.
 */
export function createAnimeHeadGeometry(options?: AnimeHeadOptions): THREE.BufferGeometry {
  const segU = 64;
  const segV = 48;
  const geo = new THREE.SphereGeometry(1.0, segU, segV);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;

  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const p = evalAnimeHeadSurface(vx, vy, vz, options);
    pos.setXYZ(i, p.x, p.y, p.z);

    if (vz >= 0.02) {
      const u = clamp(0.5 + p.x / 0.200, 0.04, 0.96);
      const v = clamp(0.52 + p.y / 0.224, 0.04, 0.96);
      uv.setXY(i, u, v);
    } else {
      // Uniform pure base skin edge so back skull, temples, jaw, ears & neck blend with zero seam
      uv.setXY(i, 0.03, 0.50);
    }
  }

  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a 100% SEALED 3D anime hair cap geometry conforming directly to evalAnimeHeadSurface:
 * - Covers ALL of the back cranium & behind both ears smoothly down to the nape (vy = -0.84 — ZERO white bald patches in side/3/4/back view!)
 * - Sweeps smoothly down temples & sideburns in front of both ears (vy = -0.38)
 * - Clean natural forehead hairline at vy = +0.30 seamlessly joined into lush layered bangs!
 */
export function createAnimeHairCapGeometry(options?: {
  variant?: 'hero' | 'boss';
  volumeLift?: number;
}): THREE.BufferGeometry {
  const headOpts: AnimeHeadOptions = { variant: options?.variant ?? 'hero' };
  const volLift = options?.volumeLift ?? 0.013;
  const segU = 60;
  const segV = 36;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iv = 0; iv <= segV; iv++) {
    const tv = iv / segV; // 0 = crown top pole, 1 = hairline outer rim
    for (let iu = 0; iu <= segU; iu++) {
      const tu = iu / segU;
      const phi = tu * Math.PI * 2; // 0 = front (+Z), PI/2 = left (+X), PI = back (-Z)
      const cosP = Math.cos(phi);
      const sinP = Math.sin(phi);

      // Smooth piecewise hairline elevation rimVy around all 360°:
      // - Front face opening (cosP > 0.45): natural forehead hairline around vy = +0.28..+0.32
      // - Temple & sideburn zone (cosP in [0.05..0.45]): drops smoothly from +0.28 down to -0.44 right beside the ear!
      // - Behind ears & entire back skull (cosP <= 0.05): wraps ALL THE WAY down to nape vy = -0.84! ZERO bald scalp!
      let rimVy: number;
      if (cosP >= 0.48) {
        const ft = clamp((cosP - 0.48) / 0.52, 0, 1);
        const centerPeak = Math.pow(ft, 3.0) * 0.055;
        rimVy = THREE.MathUtils.lerp(0.18, 0.30, ft) - centerPeak;
      } else if (cosP >= 0.06) {
        const st = (cosP - 0.06) / 0.42; // 0 at ear, 1 at outer forehead
        const smoothS = st * st * (3 - 2 * st);
        rimVy = THREE.MathUtils.lerp(-0.52, 0.18, smoothS);
      } else {
        const bt = clamp((0.06 - cosP) / 0.48, 0, 1); // 0 right behind ear, 1 across full back nape
        const smoothB = bt * bt * (3 - 2 * bt);
        rimVy = THREE.MathUtils.lerp(-0.52, -0.84, smoothB);
      }

      const minTheta = 0.02;
      const maxTheta = Math.acos(clamp(rimVy, -0.92, 0.65));
      const theta = THREE.MathUtils.lerp(minTheta, maxTheta, tv);

      const vy = Math.cos(theta);
      const sinT = Math.sin(theta);
      const vx = sinT * sinP;
      const vz = sinT * cosP;

      const p = evalAnimeHeadSurface(vx, vy, vz, headOpts);

      // Lush anime hair crown & occiput volume, cleanly hugging nape/temples at hairline edge
      const backWeight = clamp(-cosP * 0.5 + 0.5, 0, 1);
      const edgeTuck = tv > 0.88 ? THREE.MathUtils.lerp(1.0, 0.44, (tv - 0.88) / 0.12) : 1.0;
      const crownFull = 0.86 + 0.48 * Math.sin(tv * Math.PI * 0.84) + backWeight * 0.38 * tv;
      const flowRib = Math.sin(phi * 16.0 + tv * 2.2) * 0.0014 * Math.sin(tv * Math.PI);
      const offset = volLift * crownFull * edgeTuck + flowRib;

      const nLen = Math.max(1e-4, Math.hypot(vx, vy, vz));
      const nx = vx / nLen;
      const ny = vy / nLen;
      const nz = vz / nLen;

      positions.push(
        p.x + nx * offset,
        p.y + ny * offset + (vy > 0.15 ? 0.0045 * (1 - tv * 0.5) : 0),
        p.z + nz * offset,
      );
      uvs.push(tu * 2.0, tv);
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

export interface AnimeEyeRigGeometries {
  center: THREE.Vector3;
  sclera: THREE.BufferGeometry;
  iris: THREE.BufferGeometry;
  cornea: THREE.BufferGeometry;
  upperLash: THREE.BufferGeometry;
  lowerLash: THREE.BufferGeometry;
  eyelidFold: THREE.BufferGeometry;
  brow: THREE.BufferGeometry;
}

/**
 * Generates surface-conformal 3D sculpted Donghua anime eyes & heroic sword eyebrows
 * positioned at the classic anime facial midpoint (eyeVy = -0.090, ~47% from chin to crown):
 * - Sleek ~1.45:1 almond 丹凤剑目 shape (wider horizontally, heroic poised gaze — NEVER startled!)
 * - Top ~24% of the jewel iris tucks cleanly under a bold dark upper lash/eyelid curve!
 * - Conformal to evalAnimeHeadSurface so zero floating/clipping occurs at any 360° view.
 */
export function createAnimeEyeGeometrySet(
  side: -1 | 1,
  options?: {
    variant?: 'hero' | 'boss';
    fierce?: boolean;
  },
): AnimeEyeRigGeometries {
  const headOpts: AnimeHeadOptions = { variant: options?.variant ?? 'hero' };
  const fierce = options?.fierce ?? options?.variant === 'boss';

  // Classic anime midpoint placement (~47% up from chin to crown — charismatic Genshin Xiao / Li Bai proportion!)
  const eyeVx0 = side * (fierce ? 0.382 : 0.374);
  const eyeVy0 = fierce ? -0.070 : -0.090;
  const eyeVz0 = Math.sqrt(Math.max(0.05, 1 - eyeVx0 * eyeVx0 - eyeVy0 * eyeVy0));
  const center = evalAnimeHeadSurface(eyeVx0, eyeVy0, eyeVz0, headOpts);

  const projectHead = (vx: number, vy: number, lift: number, relativeToCenter: boolean): THREE.Vector3 => {
    const vz = Math.sqrt(Math.max(0.06, 1 - vx * vx - vy * vy));
    const p = evalAnimeHeadSurface(vx, vy, vz, headOpts);
    const nx = vx / 0.093;
    const ny = vy / 0.106;
    const nz = vz / 0.098;
    const nl = Math.max(1e-4, Math.hypot(nx, ny, nz));
    p.x += (nx / nl) * lift;
    p.y += (ny / nl) * lift;
    p.z += (nz / nl) * lift;
    if (relativeToCenter) p.sub(center);
    return p;
  };

  // Wider sleek heroic almond (丹凤剑目): confident slightly narrowed upper lid, graceful outer lift
  const halfW = fierce ? 0.186 : 0.196;
  const halfH = fierce ? 0.078 : 0.092;
  const tilt = fierce ? 0.026 : 0.018;

  const sampleUpperEdge = (u: number): [number, number] => {
    const s = (u - 0.5) * 2.0;
    const vx = eyeVx0 + side * s * halfW;
    // Sleek poised upper lid arch (flatter across top center so upper iris tucks heroically underneath!)
    const arch = Math.pow(Math.sin(u * Math.PI), 0.62) * (0.92 + 0.14 * s);
    const vy = eyeVy0 + arch * halfH + s * tilt;
    return [vx, vy];
  };

  const sampleLowerEdge = (u: number): [number, number] => {
    const s = (u - 0.5) * 2.0;
    const vx = eyeVx0 + side * s * halfW;
    const curve = Math.pow(Math.sin(u * Math.PI), 0.88);
    const vy = eyeVy0 - curve * halfH * (fierce ? 0.66 : 0.74) + s * (tilt * 0.72);
    return [vx, vy];
  };

  const buildAlmondPatch = (
    segU: number,
    segV: number,
    liftBase: number,
    domeLift: number,
    relative: boolean,
  ): THREE.BufferGeometry => {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let iv = 0; iv <= segV; iv++) {
      const v = iv / segV;
      for (let iu = 0; iu <= segU; iu++) {
        const u = iu / segU;
        const [ux, uy] = sampleUpperEdge(u);
        const [lx, ly] = sampleLowerEdge(u);
        const vx = THREE.MathUtils.lerp(lx, ux, v);
        const vy = THREE.MathUtils.lerp(ly, uy, v);
        const bulge = Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * domeLift;
        const p = projectHead(vx, vy, liftBase + bulge, relative);
        positions.push(p.x, p.y, p.z);
        uvs.push(side > 0 ? u : 1 - u, v);
      }
    }
    const stride = segU + 1;
    for (let iv = 0; iv < segV; iv++) {
      for (let iu = 0; iu < segU; iu++) {
        const a = iv * stride + iu;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        if (side > 0) indices.push(a, b, c, b, d, c);
        else indices.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  };

  // 1. Curved Ivory Sclera Backing
  const sclera = buildAlmondPatch(16, 8, 0.0016, 0.0012, true);

  // 2. Curved 3D Anime Iris Disc — clipped cleanly against the upper eyelid curve so top ~25% tucks under the lash!
  const buildIrisPatch = (liftBase: number, domeLift: number, radiusScale = 1.0): THREE.BufferGeometry => {
    const segU = 14;
    const segV = 14;
    const irisRx = (fierce ? 0.098 : 0.108) * radiusScale;
    const irisRy = (fierce ? 0.092 : 0.104) * radiusScale;
    // Slight inward focus + raised vertical center so top of iris tucks under bold upper lash (confident heroic gaze!)
    const irisCx = eyeVx0 - side * 0.008;
    const irisCy = eyeVy0 + (fierce ? 0.010 : 0.014);

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let iv = 0; iv <= segV; iv++) {
      const v = iv / segV;
      const ny = (v - 0.5) * 2.0;
      for (let iu = 0; iu <= segU; iu++) {
        const u = iu / segU;
        const nx = (u - 0.5) * 2.0;
        const r2 = nx * nx + ny * ny;
        const dome = Math.max(0, 1 - r2) * domeLift;
        const vx = irisCx + nx * irisRx;
        // Clamp iris top smoothly underneath the upper lid edge so iris NEVER pokes above lash and ZERO white shows on top!
        const uEye = clamp(((vx - eyeVx0) * side) / (halfW * 2) + 0.5, 0.05, 0.95);
        const [, upperVy] = sampleUpperEdge(uEye);
        const [, lowerVy] = sampleLowerEdge(uEye);
        const rawVy = irisCy + ny * irisRy;
        const vy = clamp(rawVy, lowerVy + 0.002, upperVy + 0.002);
        const p = projectHead(vx, vy, liftBase + dome, true);
        positions.push(p.x, p.y, p.z);
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
        indices.push(a, b, c, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  };

  const iris = buildIrisPatch(0.0029, 0.0018, 1.0);
  const cornea = buildIrisPatch(0.0038, 0.0032, 1.04);

  const buildCurvedRibbon3D = (
    points: Array<{ vx: number; vy: number; halfThickVy: number; lift: number; depth: number }>,
    relative: boolean,
  ): THREE.BufferGeometry => {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      const u = i / Math.max(1, points.length - 1);
      const pBotBack = projectHead(pt.vx, pt.vy - pt.halfThickVy, pt.lift - 0.0006, relative);
      const pBotFront = projectHead(pt.vx, pt.vy - pt.halfThickVy * 0.85, pt.lift + pt.depth, relative);
      const pTopFront = projectHead(pt.vx, pt.vy + pt.halfThickVy * 0.85, pt.lift + pt.depth, relative);
      const pTopBack = projectHead(pt.vx, pt.vy + pt.halfThickVy, pt.lift - 0.0006, relative);
      const ring = [pBotBack, pBotFront, pTopFront, pTopBack];
      for (let k = 0; k < 4; k++) {
        positions.push(ring[k].x, ring[k].y, ring[k].z);
        uvs.push(u, k / 3);
      }
    }
    for (let i = 0; i < points.length - 1; i++) {
      const o0 = i * 4;
      const o1 = (i + 1) * 4;
      for (let k = 0; k < 4; k++) {
        const kn = (k + 1) % 4;
        if (side > 0) {
          indices.push(o0 + k, o1 + k, o0 + kn, o0 + kn, o1 + k, o1 + kn);
        } else {
          indices.push(o0 + k, o0 + kn, o1 + k, o0 + kn, o1 + kn, o1 + k);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  };

  // 3. Bold Sleek 3D Upper Eyelash (丹凤剑目 — thick sculpted dark lash curve cleanly capping the top of the iris!)
  const upperLashPts: Array<{ vx: number; vy: number; halfThickVy: number; lift: number; depth: number }> = [];
  const lashSegs = 16;
  for (let i = 0; i <= lashSegs; i++) {
    const rawU = i / lashSegs;
    const u = rawU * 1.13;
    let vx: number;
    let vy: number;
    if (u <= 1.0) {
      [vx, vy] = sampleUpperEdge(u);
    } else {
      const [ox, oy] = sampleUpperEdge(1.0);
      const wingT = (u - 1.0) / 0.13;
      vx = ox + side * wingT * 0.036;
      vy = oy + wingT * (fierce ? 0.026 : 0.020);
    }
    const thickProfile =
      u < 0.14
        ? THREE.MathUtils.lerp(0.008, 0.022, u / 0.14)
        : u < 0.86
          ? THREE.MathUtils.lerp(0.022, 0.030, (u - 0.14) / 0.72)
          : THREE.MathUtils.lerp(0.030, 0.005, (u - 0.86) / 0.27);
    upperLashPts.push({
      vx,
      vy: vy + thickProfile * 0.28,
      halfThickVy: thickProfile,
      lift: 0.0042,
      depth: 0.0030,
    });
  }
  const upperLash = buildCurvedRibbon3D(upperLashPts, true);

  // 4. Crisp 3D Lower Lash Rim (framing lower eye cleanly without looking hollow)
  const lowerLashPts: Array<{ vx: number; vy: number; halfThickVy: number; lift: number; depth: number }> = [];
  for (let i = 0; i <= 10; i++) {
    const u = THREE.MathUtils.lerp(0.18, 1.02, i / 10);
    const [vx, vy] = sampleLowerEdge(Math.min(1, u));
    const taper = Math.sin(((u - 0.18) / 0.84) * Math.PI);
    lowerLashPts.push({
      vx: vx + (u > 1 ? side * 0.01 : 0),
      vy: vy - 0.004,
      halfThickVy: 0.003 + taper * 0.0075,
      lift: 0.0035,
      depth: 0.0018,
    });
  }
  const lowerLash = buildCurvedRibbon3D(lowerLashPts, true);

  // 5. Delicate Double-Eyelid Crease Line (双眼皮)
  const foldPts: Array<{ vx: number; vy: number; halfThickVy: number; lift: number; depth: number }> = [];
  for (let i = 0; i <= 10; i++) {
    const u = THREE.MathUtils.lerp(0.10, 0.96, i / 10);
    const [vx, vy] = sampleUpperEdge(u);
    const taper = Math.sin(((u - 0.10) / 0.86) * Math.PI);
    foldPts.push({
      vx,
      vy: vy + 0.044 + taper * 0.006,
      halfThickVy: 0.002 + taper * 0.0035,
      lift: 0.0018,
      depth: 0.0012,
    });
  }
  const eyelidFold = buildCurvedRibbon3D(foldPts, true);

  // 6. Sculpted 3D Heroic Sword Eyebrow (剑眉 — poised firmly above eye at vy ≈ +0.075..+0.155!)
  const browPts: Array<{ vx: number; vy: number; halfThickVy: number; lift: number; depth: number }> = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const vx = side * THREE.MathUtils.lerp(fierce ? 0.135 : 0.150, fierce ? 0.635 : 0.620, t);
    const archVy = fierce
      ? THREE.MathUtils.lerp(0.055, 0.185, Math.pow(t, 0.86)) - (t > 0.82 ? (t - 0.82) * 0.12 : 0)
      : THREE.MathUtils.lerp(0.078, 0.158, Math.pow(t, 0.84)) - (t > 0.78 ? (t - 0.78) * 0.11 : 0);
    const halfThick =
      t < 0.12
        ? THREE.MathUtils.lerp(0.015, fierce ? 0.026 : 0.022, t / 0.12)
        : t < 0.72
          ? THREE.MathUtils.lerp(fierce ? 0.026 : 0.022, fierce ? 0.023 : 0.018, (t - 0.12) / 0.60)
          : THREE.MathUtils.lerp(fierce ? 0.023 : 0.018, 0.004, (t - 0.72) / 0.28);
    browPts.push({
      vx,
      vy: archVy,
      halfThickVy: halfThick,
      lift: 0.0030,
      depth: 0.0030,
    });
  }
  const brow = buildCurvedRibbon3D(browPts, false);

  return {
    center,
    sclera,
    iris,
    cornea,
    upperLash,
    lowerLash,
    eyelidFold,
    brow,
  };
}

/**
 * Clean 512x512 stylized commercial 3D Donghua / Anime face CanvasTexture.
 * Warm peach-ivory skin (#efc2a4 base — NEVER washes out to chalk-grey under studio fill!),
 * warm cheek blush, crisp sculpted anime nose-bridge & tip shading, and a clearly readable
 * confident stylized swordsman mouth calibrated pixel-for-pixel to eyeVy = -0.090 / noseVy = -0.34 / mouthVy = -0.58!
 */
export function createAnimeFaceTexture(style: AnimeFaceStyle): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const palettes: Record<
    AnimeFaceStyle,
    {
      base: string;
      foreheadLit: string;
      cheekBlush: string;
      cheekAlpha: number;
      noseShade: string;
      mouthColor: string;
      lipTint: string;
      jawShade: string;
    }
  > = {
    hero: {
      base: '#efc2a4',
      foreheadLit: '#ffe2cc',
      cheekBlush: '#e37e66',
      cheekAlpha: 0.25,
      noseShade: '#c2866a',
      mouthColor: '#a6564c',
      lipTint: '#d68274',
      jawShade: '#cb9478',
    },
    ally: {
      base: '#eec4a8',
      foreheadLit: '#ffe4d0',
      cheekBlush: '#df826c',
      cheekAlpha: 0.22,
      noseShade: '#be886e',
      mouthColor: '#a25850',
      lipTint: '#d08478',
      jawShade: '#c8967c',
    },
    elder: {
      base: '#e2c5ae',
      foreheadLit: '#f4dcc8',
      cheekBlush: '#c28a74',
      cheekAlpha: 0.16,
      noseShade: '#ae826c',
      mouthColor: '#8d584e',
      lipTint: '#b4786c',
      jawShade: '#bc9680',
    },
    vanguard: {
      base: '#d4a484',
      foreheadLit: '#e8bc9e',
      cheekBlush: '#ae664a',
      cheekAlpha: 0.18,
      noseShade: '#96664e',
      mouthColor: '#82463c',
      lipTint: '#a86454',
      jawShade: '#a47256',
    },
    elite: {
      base: '#c6aaa0',
      foreheadLit: '#dac0b6',
      cheekBlush: '#985656',
      cheekAlpha: 0.16,
      noseShade: '#886660',
      mouthColor: '#723a3e',
      lipTint: '#965458',
      jawShade: '#94726c',
    },
    boss: {
      base: '#c2b4c0',
      foreheadLit: '#d8ccd8',
      cheekBlush: '#8a586c',
      cheekAlpha: 0.14,
      noseShade: '#826e7e',
      mouthColor: '#683242',
      lipTint: '#8a4c5e',
      jawShade: '#8c7a8c',
    },
  };

  const pal = palettes[style];

  // 1. Uniform warm peach-ivory anime skin base (matches palette.skin 100% seamlessly on neck, ears, hands!)
  ctx.fillStyle = pal.base;
  ctx.fillRect(0, 0, size, size);

  // 2. Soft luminous anime center-face T-zone lift
  const tZone = ctx.createRadialGradient(size * 0.5, size * 0.44, size * 0.02, size * 0.5, size * 0.44, size * 0.25);
  tZone.addColorStop(0, pal.foreheadLit);
  tZone.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.save();
  ctx.globalAlpha = 0.36;
  ctx.fillStyle = tZone;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();

  // 3. Warm living Donghua peach blush across cheek highs (aligned to cheek vy=-0.30 -> canvasY ≈ 0.622)
  for (const cx of [0.29, 0.71]) {
    const blush = ctx.createRadialGradient(size * cx, size * 0.620, size * 0.01, size * cx, size * 0.620, size * 0.135);
    blush.addColorStop(0, pal.cheekBlush);
    blush.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.save();
    ctx.globalAlpha = pal.cheekAlpha;
    ctx.fillStyle = blush;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();
  }

  // 4. Soft warm upper-eyelid & brow-bridge shading (aligned to eyeVy=-0.090 -> canvasY ≈ 0.522)
  ctx.save();
  ctx.globalAlpha = style === 'hero' || style === 'ally' ? 0.22 : 0.34;
  for (const ex of [0.325, 0.675]) {
    const lidShade = ctx.createRadialGradient(size * ex, size * 0.495, size * 0.01, size * ex, size * 0.495, size * 0.095);
    lidShade.addColorStop(0, pal.noseShade);
    lidShade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lidShade;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.restore();

  // 5. Crisp anime nose-bridge contour shadow + highlight + underside tip shadow (nose tip vy=-0.34 -> canvasY ≈ 0.641)
  ctx.save();
  // Subtle warm side-of-nose shading so nose reads crisply from straight-on camera!
  ctx.globalAlpha = 0.24;
  ctx.fillStyle = pal.noseShade;
  ctx.beginPath();
  ctx.ellipse(size * 0.476, size * 0.585, size * 0.016, size * 0.058, 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(size * 0.524, size * 0.585, size * 0.012, size * 0.052, -0.08, 0, Math.PI * 2);
  ctx.fill();

  // Clean sunlit anime nose bridge highlight
  ctx.globalAlpha = 0.46;
  ctx.fillStyle = pal.foreheadLit;
  ctx.beginPath();
  ctx.ellipse(size * 0.502, size * 0.580, size * 0.012, size * 0.055, 0, 0, Math.PI * 2);
  ctx.fill();

  // Crisp small Genshin/anime triangular nose-tip under-shadow
  ctx.globalAlpha = style === 'hero' || style === 'ally' ? 0.52 : 0.60;
  ctx.fillStyle = pal.noseShade;
  ctx.beginPath();
  ctx.moveTo(size * 0.478, size * 0.642);
  ctx.quadraticCurveTo(size * 0.50, size * 0.664, size * 0.522, size * 0.642);
  ctx.quadraticCurveTo(size * 0.50, size * 0.652, size * 0.478, size * 0.642);
  ctx.fill();
  ctx.restore();

  // 6. Clean, crisp, confident Donghua swordsman mouth (mouth vy=-0.58 -> canvasY ≈ 0.754!)
  ctx.save();
  const my = size * 0.752;
  const mw = style === 'boss' || style === 'elite' ? size * 0.072 : size * 0.062;

  // Soft natural warm lip color wash
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = pal.lipTint;
  ctx.beginPath();
  ctx.moveTo(size * 0.5 - mw * 0.88, my);
  ctx.quadraticCurveTo(size * 0.5 - mw * 0.28, my - size * 0.014, size * 0.5, my - size * 0.007);
  ctx.quadraticCurveTo(size * 0.5 + mw * 0.28, my - size * 0.014, size * 0.5 + mw * 0.88, my);
  ctx.quadraticCurveTo(size * 0.5, my + size * 0.018, size * 0.5 - mw * 0.88, my);
  ctx.fill();

  // Crisp confident stylized anime mouth line (clearly legible at both close-up AND full-body distance!)
  ctx.globalAlpha = 0.96;
  ctx.strokeStyle = pal.mouthColor;
  ctx.lineWidth = 3.6;
  ctx.lineCap = 'round';
  const cornerLift = style === 'hero' || style === 'ally' ? -3.8 : style === 'elder' ? 0 : 3.2;
  ctx.beginPath();
  ctx.moveTo(size * 0.5 - mw, my + cornerLift);
  ctx.quadraticCurveTo(size * 0.5 - mw * 0.36, my + 2.6, size * 0.5, my + 0.8);
  ctx.quadraticCurveTo(size * 0.5 + mw * 0.36, my + 2.6, size * 0.5 + mw, my + cornerLift);
  ctx.stroke();

  // Subtle corner shading dots + lower-lip anime shadow dash
  ctx.fillStyle = pal.mouthColor;
  ctx.beginPath();
  ctx.arc(size * 0.5 - mw, my + cornerLift, 2.2, 0, Math.PI * 2);
  ctx.arc(size * 0.5 + mw, my + cornerLift, 2.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.36;
  ctx.strokeStyle = pal.noseShade;
  ctx.lineWidth = 3.8;
  ctx.beginPath();
  ctx.moveTo(size * 0.468, my + size * 0.032);
  ctx.quadraticCurveTo(size * 0.5, my + size * 0.040, size * 0.532, my + size * 0.032);
  ctx.stroke();
  ctx.restore();

  // 7. Archetype-Specific Crisp Donghua Markings (aligned cleanly with lowered eye/brow positions)
  if (style === 'elder') {
    ctx.save();
    ctx.strokeStyle = '#7e48d8';
    ctx.fillStyle = '#c89eff';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(size * 0.5, size * 0.385);
    ctx.lineTo(size * 0.516, size * 0.422);
    ctx.lineTo(size * 0.5, size * 0.458);
    ctx.lineTo(size * 0.484, size * 0.422);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  } else if (style === 'vanguard') {
    ctx.save();
    ctx.strokeStyle = '#9c221c';
    ctx.lineWidth = 6.5;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.80;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(size * (0.5 + s * 0.16), size * 0.605);
      ctx.lineTo(size * (0.5 + s * 0.30), size * 0.578);
      ctx.stroke();
      ctx.lineWidth = 4.2;
      ctx.beginPath();
      ctx.moveTo(size * (0.5 + s * 0.18), size * 0.642);
      ctx.lineTo(size * (0.5 + s * 0.29), size * 0.622);
      ctx.stroke();
      ctx.lineWidth = 6.5;
    }
    ctx.restore();
  } else if (style === 'elite' || style === 'boss') {
    ctx.save();
    const isBossStyle = style === 'boss';
    ctx.strokeStyle = isBossStyle ? '#b81832' : '#9c1c24';
    ctx.fillStyle = isBossStyle ? '#e83044' : '#b8222a';
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.88;
    ctx.beginPath();
    ctx.moveTo(size * 0.5, size * 0.355);
    ctx.quadraticCurveTo(size * 0.522, size * 0.405, size * 0.5, size * 0.450);
    ctx.quadraticCurveTo(size * 0.478, size * 0.405, size * 0.5, size * 0.355);
    ctx.fill();
    for (const s of [-1, 1]) {
      ctx.lineWidth = isBossStyle ? 5.2 : 4.2;
      ctx.beginPath();
      ctx.moveTo(size * (0.5 + s * 0.22), size * 0.555);
      ctx.quadraticCurveTo(size * (0.5 + s * 0.29), size * 0.615, size * (0.5 + s * 0.22), size * 0.690);
      ctx.stroke();
      if (isBossStyle) {
        ctx.lineWidth = 3.2;
        ctx.strokeStyle = '#d49a3c';
        ctx.beginPath();
        ctx.moveTo(size * (0.5 + s * 0.26), size * 0.535);
        ctx.quadraticCurveTo(size * (0.5 + s * 0.32), size * 0.605, size * (0.5 + s * 0.26), size * 0.665);
        ctx.stroke();
        ctx.strokeStyle = '#b81832';
      }
    }
    ctx.restore();
  }

  // 8. Soft chin-under transition shade
  const chinShade = ctx.createLinearGradient(0, size * 0.89, 0, size);
  chinShade.addColorStop(0, 'rgba(0,0,0,0)');
  chinShade.addColorStop(1, pal.jawShade);
  ctx.save();
  ctx.globalAlpha = 0.26;
  ctx.fillStyle = chinShade;
  ctx.fillRect(0, size * 0.89, size, size * 0.11);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Crisp 256x256 deeply saturated jewel-like 3D Anime Eye Iris Texture:
 * deep rich upper ocean/gem tone -> vibrant mid-iris -> glowing luminous lower crescent,
 * crisp dark pupil, bold upper eyelid shadow arc, thick dark limbal ring & twin glossy white catchlights.
 * Engineered to stay richly colored and jewel-like under studio fill lighting (ZERO pale grey washout!).
 */
export function createAnimeIrisTexture(
  primaryHex: string,
  brightHex: string,
  pupilHex = '#0a0d16',
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size * 0.5;
  const cy = size * 0.5;
  const r = size * 0.45;

  ctx.clearRect(0, 0, size, size);

  const primaryCol = new THREE.Color(primaryHex);
  const deepUpperCol = primaryCol.clone().multiplyScalar(0.26);
  const deepUpperHex = `#${deepUpperCol.getHexString()}`;
  const richMidCol = primaryCol.clone().multiplyScalar(0.68);
  const richMidHex = `#${richMidCol.getHexString()}`;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.96, r, 0, 0, Math.PI * 2);
  ctx.clip();

  // 1. Rich deeply saturated vertical jewel gradient (deep dark top -> intense primaryHex -> radiant lower crescent)
  const baseGrad = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  baseGrad.addColorStop(0.0, '#09101a');
  baseGrad.addColorStop(0.24, deepUpperHex);
  baseGrad.addColorStop(0.50, richMidHex);
  baseGrad.addColorStop(0.74, primaryHex);
  baseGrad.addColorStop(0.92, brightHex);
  baseGrad.addColorStop(1.0, primaryHex);
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, size, size);

  // 2. Vibrant glowing lower jewel crescent (classic Genshin / Donghua eye depth!)
  const glowCrescent = ctx.createRadialGradient(cx, cy + r * 0.46, r * 0.04, cx, cy + r * 0.42, r * 0.54);
  glowCrescent.addColorStop(0.0, brightHex);
  glowCrescent.addColorStop(0.55, primaryHex);
  glowCrescent.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = glowCrescent;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();

  // 3. Crystalline radial iris fibers
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    ctx.strokeStyle = i % 2 === 0 ? brightHex : '#080c14';
    ctx.globalAlpha = i % 2 === 0 ? 0.30 : 0.28;
    ctx.lineWidth = i % 3 === 0 ? 3.0 : 1.6;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.30, Math.sin(a) * r * 0.30);
    ctx.lineTo(Math.cos(a) * r * 0.90, Math.sin(a) * r * 0.90);
    ctx.stroke();
  }
  ctx.restore();

  // 4. Crisp bold dark anime pupil + delicate inner crescent rim highlight
  const pupilR = r * 0.38;
  ctx.save();
  ctx.fillStyle = pupilHex;
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.03, pupilR * 0.92, pupilR * 1.04, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = brightHex;
  ctx.globalAlpha = 0.65;
  ctx.lineWidth = 3.8;
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.05, pupilR * 1.08, Math.PI * 0.16, Math.PI * 0.84);
  ctx.stroke();
  ctx.restore();

  // 5. Bold upper eyelid cast shadow across upper ~38% of iris (cool composed charismatic anime gaze!)
  const upperShadow = ctx.createLinearGradient(0, cy - r, 0, cy + r * 0.05);
  upperShadow.addColorStop(0.0, 'rgba(6, 10, 18, 0.88)');
  upperShadow.addColorStop(0.55, 'rgba(8, 12, 22, 0.56)');
  upperShadow.addColorStop(1.0, 'rgba(8, 12, 22, 0.0)');
  ctx.fillStyle = upperShadow;
  ctx.fillRect(0, cy - r, size, r * 1.1);

  // 6. Thick deep dark outer limbal ring giving crisp contrast against ivory sclera
  ctx.strokeStyle = '#0c101a';
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.92, r * 0.98, 0, 0, Math.PI * 2);
  ctx.stroke();

  // 7. Crisp dual white anime catchlights (iconic upper-left diamond/oval + bright lower-right sparkle!)
  ctx.fillStyle = '#ffffff';
  ctx.save();
  ctx.translate(cx - r * 0.34, cy - r * 0.24);
  ctx.rotate(-0.32);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.20, r * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx + r * 0.32, cy + r * 0.28, r * 0.095, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * SOLID VOLUMETRIC 3D SCULPTED ANIME HAIR SPIKE / LOCK.
 * Full soft-edged arched ribbon volume tapering smoothly to a graceful anime tip
 * (wider, fuller & more sculptural than thin needles!).
 */
export function createAnimeHairSpikeGeo(
  len: number,
  width: number,
  depth: number,
  curveZ: number,
  curveX: number,
  twist = 0,
): THREE.BufferGeometry {
  const lenSegs = 12;
  const profilePts: Array<[number, number]> = [
    [0.0, 1.0],
    [0.62, 0.62],
    [1.0, 0.05],
    [0.60, -0.42],
    [0.0, -0.55],
    [-0.60, -0.42],
    [-1.0, 0.05],
    [-0.62, 0.62],
  ];
  const radSegs = profilePts.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iv = 0; iv <= lenSegs; iv++) {
    const t = iv / lenSegs;
    // Fuller across upper 60% of the lock so hair reads lush & cohesive (not skinny needles!), then graceful pointed tip
    const rootEase = t < 0.14 ? 0.72 + 0.28 * Math.sin((t / 0.14) * (Math.PI * 0.5)) : 1.0;
    const tipEase = t > 0.34 ? Math.pow(clamp(1 - (t - 0.34) / 0.66, 0, 1), 0.72) : 1.0;
    const wScale = Math.max(0.03, rootEase * tipEase);
    const dScale = Math.max(0.03, rootEase * Math.pow(clamp(1 - t * 0.88, 0.05, 1), 0.70));

    const halfW = width * 0.5 * wScale;
    const halfD = depth * 0.5 * dScale;

    const cy = -t * len;
    const cz = curveZ * t * t + Math.sin(t * Math.PI) * (Math.abs(curveZ) * 0.20 + depth * 0.20);
    const cx = curveX * Math.pow(t, 1.22) + Math.sin(t * Math.PI) * curveX * 0.12;

    const angTwist = twist * t;
    const cosTw = Math.cos(angTwist);
    const sinTw = Math.sin(angTwist);

    for (let ir = 0; ir <= radSegs; ir++) {
      const [px, pz] = profilePts[ir % radSegs];
      const lx0 = px * halfW;
      const lz0 = pz * halfD;
      const lx = lx0 * cosTw - lz0 * sinTw;
      const lz = lx0 * sinTw + lz0 * cosTw;
      positions.push(cx + lx, cy, cz + lz);
      uvs.push(ir / radSegs, t);
    }
  }

  const stride = radSegs + 1;
  for (let iv = 0; iv < lenSegs; iv++) {
    for (let ir = 0; ir < radSegs; ir++) {
      const a = iv * stride + ir;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const tipIdx = positions.length / 3;
  positions.push(curveX, -len * 1.018, curveZ);
  uvs.push(0.5, 1.0);
  const lastRing = lenSegs * stride;
  for (let ir = 0; ir < radSegs; ir++) {
    indices.push(lastRing + ir, tipIdx, lastRing + ir + 1);
  }

  const rootIdx = positions.length / 3;
  positions.push(0, 0.005, 0);
  uvs.push(0.5, 0.0);
  for (let ir = 0; ir < radSegs; ir++) {
    indices.push(rootIdx, ir, ir + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Rich stylized Donghua Silk & Auspicious-Cloud Brocade CanvasTexture with warm ivory-celadon
 * tonal gradient, visible delicate Xianxia cloud jacquard, and refined hem accent border
 * (eliminates flat chalk-white plastic cloth while tinting cleanly across all 5 Hero Skins!).
 */
export function createDonghuaSilkTexture(variant: 'inner' | 'brocade' = 'inner'): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 512;
  const cMap = document.createElement('canvas');
  const cBump = document.createElement('canvas');
  cMap.width = cBump.width = size;
  cMap.height = cBump.height = size;
  const ctx = cMap.getContext('2d')!;
  const bctx = cBump.getContext('2d')!;

  // Rich cel-inspired Donghua silk gradient (luminous upper chest -> cool celadon-shaded lower folds!)
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  if (variant === 'inner') {
    grad.addColorStop(0.0, '#eae3d6');
    grad.addColorStop(0.42, '#ded7ca');
    grad.addColorStop(0.78, '#c8ced4');
    grad.addColorStop(1.0, '#b2bec8');
  } else {
    grad.addColorStop(0.0, '#e8edf2');
    grad.addColorStop(0.48, '#ced8e2');
    grad.addColorStop(0.84, '#b0c0cf');
    grad.addColorStop(1.0, '#96aac0');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  // Subtle horizontal silk weave micro-shimmer
  ctx.save();
  ctx.globalAlpha = variant === 'inner' ? 0.05 : 0.065;
  for (let y = 0; y < size; y += 6) {
    ctx.fillStyle = y % 12 === 0 ? '#ffffff' : '#64768c';
    ctx.fillRect(0, y, size, 2);
  }
  ctx.restore();

  // Crisp readable Xianxia auspicious-cloud & mountain-wave silk jacquard weave (祥云暗纹)
  const drawCloudMotif = (
    target: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    sc: number,
    stroke: string,
    lw: number,
  ) => {
    target.strokeStyle = stroke;
    target.lineWidth = lw;
    target.lineCap = 'round';
    target.beginPath();
    target.arc(cx, cy, 20 * sc, Math.PI * 0.9, Math.PI * 2.1);
    target.arc(cx + 22 * sc, cy + 5 * sc, 14 * sc, Math.PI * 1.15, Math.PI * 2.35);
    target.arc(cx - 22 * sc, cy + 5 * sc, 14 * sc, Math.PI * 0.65, Math.PI * 1.85);
    target.stroke();
    target.beginPath();
    target.arc(cx, cy + 14 * sc, 26 * sc, Math.PI * 0.12, Math.PI * 0.88);
    target.stroke();
    // Delicate inner spiral swirl
    target.beginPath();
    target.arc(cx, cy + 2 * sc, 7 * sc, 0, Math.PI * 1.6);
    target.stroke();
  };

  ctx.save();
  bctx.save();
  const cols = 4;
  const rows = 4;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ox = (c + (r % 2 === 0 ? 0.25 : 0.75)) * (size / cols);
      const oy = (r + 0.5) * (size / rows);
      // Soft dark-indigo damask shadow + bright silk thread highlight for clear read!
      ctx.globalAlpha = variant === 'brocade' ? 0.16 : 0.09;
      drawCloudMotif(ctx, ox + 2, oy + 2, 1.0, '#44586c', 3.0);
      ctx.globalAlpha = variant === 'brocade' ? 0.24 : 0.14;
      drawCloudMotif(ctx, ox, oy, 1.0, '#fffaf0', 2.6);
      bctx.globalAlpha = variant === 'brocade' ? 0.30 : 0.14;
      drawCloudMotif(bctx, ox, oy, 1.0, '#b8b8b8', 2.6);
    }
  }
  ctx.restore();
  bctx.restore();

  // Elegant woven Xianxia border band near lower hem on brocade variant
  if (variant === 'brocade') {
    ctx.save();
    ctx.fillStyle = 'rgba(22, 38, 56, 0.24)';
    ctx.fillRect(0, size - 52, size, 42);
    ctx.strokeStyle = 'rgba(248, 224, 152, 0.52)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, size - 52);
    ctx.lineTo(size, size - 52);
    ctx.moveTo(0, size - 12);
    ctx.lineTo(size, size - 12);
    ctx.stroke();
    // Geometric Fretwork (回字纹) accent along hem band
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = 'rgba(248, 224, 152, 0.38)';
    for (let x = 8; x < size; x += 32) {
      ctx.strokeRect(x, size - 44, 22, 24);
      ctx.strokeRect(x + 5, size - 39, 12, 14);
    }
    ctx.restore();
  }

  const map = new THREE.CanvasTexture(cMap);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  map.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(cBump);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.anisotropy = 4;
  bumpMap.needsUpdate = true;

  return { map, bumpMap };
}

/**
 * Legacy compatibility helpers retained so zero external imports break.
 */
const SEAMLESS_FACE_CROP = {
  sx: 0.17,
  sy: 0.09,
  sw: 0.66,
  sh: 0.85,
  dx: 0.07,
  dy: 0.06,
  dw: 0.86,
  dh: 0.88,
} as const;

type ReadyImageLike = (HTMLImageElement | ImageBitmap | HTMLCanvasElement) & {
  width: number;
  height: number;
  naturalWidth?: number;
  naturalHeight?: number;
  complete?: boolean;
};

function getReadySourceImage(sourceTex: THREE.Texture): { img: ReadyImageLike; w: number; h: number } | null {
  const img = sourceTex.image as ReadyImageLike | null | undefined;
  if (!img) return null;
  if ('complete' in img && img.complete === false) return null;
  const w = typeof img.naturalWidth === 'number' && img.naturalWidth > 0 ? img.naturalWidth : img.width;
  const h = typeof img.naturalHeight === 'number' && img.naturalHeight > 0 ? img.naturalHeight : img.height;
  if (!w || !h) return null;
  return { img, w, h };
}

function subscribeSourceTextureReady(sourceTex: THREE.Texture, onReady: (img: ReadyImageLike, w: number, h: number) => void): void {
  let done = false;
  const attempt = (): boolean => {
    if (done) return true;
    const ready = getReadySourceImage(sourceTex);
    if (!ready) return false;
    done = true;
    onReady(ready.img, ready.w, ready.h);
    return true;
  };
  if (attempt()) return;
  const img = sourceTex.image as HTMLImageElement | null | undefined;
  if (img && typeof img.addEventListener === 'function') {
    img.addEventListener('load', () => { attempt(); }, { once: true });
  }
  const listeners = ((sourceTex.userData.__seamlessListeners ??= []) as Array<() => void>);
  listeners.push(() => { attempt(); });
}

function drawFeatheredPortraitCrop(
  targetCtx: CanvasRenderingContext2D,
  img: ReadyImageLike,
  srcW: number,
  srcH: number,
  canvasSize: number,
): void {
  const off = document.createElement('canvas');
  off.width = canvasSize;
  off.height = canvasSize;
  const octx = off.getContext('2d');
  if (!octx) return;
  const sx = SEAMLESS_FACE_CROP.sx * srcW;
  const sy = SEAMLESS_FACE_CROP.sy * srcH;
  const sw = SEAMLESS_FACE_CROP.sw * srcW;
  const sh = SEAMLESS_FACE_CROP.sh * srcH;
  const dx = SEAMLESS_FACE_CROP.dx * canvasSize;
  const dy = SEAMLESS_FACE_CROP.dy * canvasSize;
  const dw = SEAMLESS_FACE_CROP.dw * canvasSize;
  const dh = SEAMLESS_FACE_CROP.dh * canvasSize;
  octx.clearRect(0, 0, canvasSize, canvasSize);
  octx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  targetCtx.drawImage(off, 0, 0);
}

export function createSeamlessFaceTexture(sourceTex: THREE.Texture, skinEdgeHex = '#efc2a4'): THREE.Texture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = skinEdgeHex;
  ctx.fillRect(0, 0, size, size);
  const outTex = new THREE.CanvasTexture(canvas);
  outTex.colorSpace = THREE.SRGBColorSpace;
  outTex.needsUpdate = true;
  subscribeSourceTextureReady(sourceTex, (img, w, h) => {
    ctx.fillStyle = skinEdgeHex;
    ctx.fillRect(0, 0, size, size);
    drawFeatheredPortraitCrop(ctx, img, w, h, size);
    outTex.needsUpdate = true;
  });
  return outTex;
}

export function createSeamlessFaceAuxTexture(sourceTex: THREE.Texture, baseFillCss = '#8080ff'): THREE.Texture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = baseFillCss;
  ctx.fillRect(0, 0, size, size);
  const outTex = new THREE.CanvasTexture(canvas);
  outTex.colorSpace = THREE.NoColorSpace;
  outTex.needsUpdate = true;
  subscribeSourceTextureReady(sourceTex, (img, w, h) => {
    ctx.fillStyle = baseFillCss;
    ctx.fillRect(0, 0, size, size);
    drawFeatheredPortraitCrop(ctx, img, w, h, size);
    outTex.needsUpdate = true;
  });
  return outTex;
}

export function applyHumanSkinSss(
  mat: THREE.MeshPhysicalMaterial,
  tintHex = '#e06848',
  strength = 0.26,
): THREE.MeshPhysicalMaterial {
  const sssColor = new THREE.Color(tintHex);
  mat.customProgramCacheKey = () => 'anime-human-sss-v2';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSssColor = { value: sssColor };
    shader.uniforms.uSssStrength = { value: strength };
    shader.fragmentShader =
      `uniform vec3 uSssColor;\nuniform float uSssStrength;\n` +
      shader.fragmentShader.replace(
        'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
        `float rawNL = dot( geometryNormal, directLight.direction );
         float dotNL = saturate( rawNL );
         float sssBand = smoothstep( -0.42, 0.34, rawNL ) * ( 1.0 - smoothstep( 0.08, 0.72, rawNL ) );
         reflectedLight.directDiffuse += directLight.color * material.diffuseColor * uSssColor * ( sssBand * uSssStrength );`,
      );
  };
  return mat;
}

export interface SilhouetteRimHandle {
  uRimColor: { value: THREE.Color };
  uRimStrength: { value: number };
  uRimPower: { value: number };
}

export function applySilhouetteRim<T extends THREE.MeshStandardMaterial>(
  mat: T,
  rimHex: string,
  strength: number,
  power = 2.8,
  outHandles?: SilhouetteRimHandle[],
): T {
  const handle: SilhouetteRimHandle = {
    uRimColor: { value: new THREE.Color(rimHex) },
    uRimStrength: { value: strength },
    uRimPower: { value: power },
  };
  if (outHandles) outHandles.push(handle);
  mat.customProgramCacheKey = () => 'silhouette-rim-v1';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = handle.uRimColor;
    shader.uniforms.uRimStrength = handle.uRimStrength;
    shader.uniforms.uRimPower = handle.uRimPower;
    shader.fragmentShader =
      `uniform vec3 uRimColor;\nuniform float uRimStrength;\nuniform float uRimPower;\n` +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         vec3 _rimV = normalize( vViewPosition );
         float _rimNdV = saturate( abs( dot( normal, _rimV ) ) );
         float _rimTerm = pow( 1.0 - _rimNdV, uRimPower );
         totalEmissiveRadiance += uRimColor * ( _rimTerm * uRimStrength );`,
      );
  };
  return mat;
}

export function createAnatomicalHeadGeometry(options?: {
  faceSpanX?: number;
  faceSpanY?: number;
  uvCenterY?: number;
  jawStrength?: number;
  browDepth?: number;
  seamlessEdgeUv?: boolean;
}): THREE.BufferGeometry {
  return createAnimeHeadGeometry({
    variant: (options?.jawStrength ?? 1.0) > 1.15 ? 'boss' : 'hero',
    jawStrength: options?.jawStrength,
    browDepth: options?.browDepth,
  });
}

export function createSculptedHairLockGeo(
  len: number,
  width: number,
  curveZ: number,
  flareX = 0,
): THREE.BufferGeometry {
  return createAnimeHairSpikeGeo(len, width, width * 0.46, curveZ, flareX, 0);
}

export function createEarGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.023);
  shape.quadraticCurveTo(0.017, 0.020, 0.015, -0.004);
  shape.quadraticCurveTo(0.011, -0.024, 0.001, -0.026);
  shape.quadraticCurveTo(-0.006, -0.016, -0.003, 0.015);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.0052,
    bevelEnabled: true,
    bevelThickness: 0.0034,
    bevelSize: 0.0026,
    bevelSegments: 3,
  });
  geo.rotateY(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

export function createSculptedHumanTorsoGeometry(broadness = 1.0): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.145, 0.0),
    new THREE.Vector2(0.132, 0.09),
    new THREE.Vector2(0.162, 0.21),
    new THREE.Vector2(0.195, 0.36),
    new THREE.Vector2(0.205, 0.46),
    new THREE.Vector2(0.125, 0.525),
    new THREE.Vector2(0.062, 0.560),
  ];
  const geo = new THREE.LatheGeometry(pts, 28);
  geo.scale(1.08 * broadness, 1.0, 0.72);
  geo.computeVertexNormals();
  return geo;
}

export function createHairStrandAlphaTexture(
  baseColor = '#141213',
  midColor = '#272220',
  highlightColor = '#463f3a',
): {
  map: THREE.CanvasTexture;
  alphaMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const w = 128;
  const h = 256;
  const cMap = document.createElement('canvas');
  const cAlpha = document.createElement('canvas');
  const cBump = document.createElement('canvas');
  cMap.width = cAlpha.width = cBump.width = w;
  cMap.height = cAlpha.height = cBump.height = h;
  const m = cMap.getContext('2d')!;
  const a = cAlpha.getContext('2d')!;
  const b = cBump.getContext('2d')!;
  m.fillStyle = baseColor;
  m.fillRect(0, 0, w, h);
  a.fillStyle = '#ffffff';
  a.fillRect(0, 0, w, h);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, w, h);
  m.strokeStyle = midColor;
  m.fillStyle = highlightColor;
  const map = new THREE.CanvasTexture(cMap);
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, alphaMap: new THREE.CanvasTexture(cAlpha), bumpMap: new THREE.CanvasTexture(cBump) };
}

export function createCurvedHairCardGeo(
  len: number,
  width: number,
  curveBack: number,
  flareOut = 0,
): THREE.BufferGeometry {
  return createAnimeHairSpikeGeo(len, width, width * 0.34, -curveBack, flareOut, 0);
}

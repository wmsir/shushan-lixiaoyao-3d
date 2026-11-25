import * as THREE from 'three';
import { clamp } from '../utils/math';

/**
 * High-resolution 3D anatomical human head mesh with real sculpted facial relief:
 * brow ridge, recessed eye sockets, protruding nose bridge & tip, cheekbones,
 * lip contour, defined masculine jawline & chin, full occipital cranium,
 * and exact front-projected UV coordinates calibrated to a centered frontal portrait albedo.
 */
export function createAnatomicalHeadGeometry(options?: {
  faceSpanX?: number;
  faceSpanY?: number;
  uvCenterY?: number;
  jawStrength?: number;
  browDepth?: number;
}): THREE.BufferGeometry {
  const faceSpanX = options?.faceSpanX ?? 0.255;
  const faceSpanY = options?.faceSpanY ?? 0.305;
  const uvCenterY = options?.uvCenterY ?? 0.51;
  const jawStrength = options?.jawStrength ?? 1.0;
  const browDepth = options?.browDepth ?? 1.0;

  const segU = 44;
  const segV = 34;
  const geo = new THREE.SphereGeometry(0.105, segU, segV);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;

  for (let i = 0; i < pos.count; i++) {
    // Unit sphere coordinates
    const vx = pos.getX(i) / 0.105;
    const vy = pos.getY(i) / 0.105;
    const vz = pos.getZ(i) / 0.105;

    // 1. Realistic adult male cranium proportions (taller oval, fuller back skull, narrower temples)
    let x = vx * 0.084;
    let y = vy * 0.118;
    let z = vz * 0.098;

    // Fuller occipital back skull & tapered lower jaw/chin
    if (vz < 0) {
      z *= 1.14;
      if (vy > -0.1) y += 0.008 * (-vz);
    }
    if (vy < -0.15) {
      const jawT = clamp((-vy - 0.15) / 0.85, 0, 1);
      // Fuller natural masculine jawline & chin (no pointy V-pinch!)
      const frontFactor = clamp(vz * 0.5 + 0.5, 0, 1);
      x *= 1.0 - jawT * (0.31 - 0.05 * jawStrength) * (0.55 + 0.45 * frontFactor);
      const gonial = Math.exp(-Math.pow((Math.abs(vx) - 0.72) / 0.24, 2)) * Math.exp(-Math.pow((vy + 0.5) / 0.25, 2));
      x += Math.sign(vx) * gonial * 0.008 * jawStrength;
      if (vz > 0.2) {
        const chin = Math.exp(-Math.pow(vx / 0.34, 2)) * Math.exp(-Math.pow((vy + 0.84) / 0.22, 2));
        z += chin * 0.013 * jawStrength;
        y -= chin * 0.005;
      }
    }

    // 2. Front facial anatomical sculpting (vz > 0)
    if (vz > 0.05) {
      const fMask = clamp((vz - 0.05) / 0.55, 0, 1);

      // Brow ridge (眉弓) around vy ~ 0.22
      const brow = Math.exp(-Math.pow((vy - 0.21) / 0.11, 2)) * Math.exp(-Math.pow(vx / 0.62, 2));
      z += brow * 0.009 * browDepth * fMask;

      // Recessed eye sockets (眼窝) at vx ~ ±0.35, vy ~ +0.055 (matches calibrated pupils 0.37..0.63!)
      const eyeL = Math.exp(-Math.pow((vx + 0.35) / 0.16, 2)) * Math.exp(-Math.pow((vy - 0.055) / 0.11, 2));
      const eyeR = Math.exp(-Math.pow((vx - 0.35) / 0.16, 2)) * Math.exp(-Math.pow((vy - 0.055) / 0.11, 2));
      z -= (eyeL + eyeR) * 0.011 * fMask;

      // Subtle cheekbone contour (颧骨) at vx ~ ±0.48, vy ~ -0.16
      const cheekL = Math.exp(-Math.pow((vx + 0.48) / 0.2, 2)) * Math.exp(-Math.pow((vy + 0.16) / 0.16, 2));
      const cheekR = Math.exp(-Math.pow((vx - 0.48) / 0.2, 2)) * Math.exp(-Math.pow((vy + 0.16) / 0.16, 2));
      z += (cheekL + cheekR) * 0.008 * fMask;

      // Sculpted 3D Nose Bridge & Tip (鼻梁 + 鼻尖) calibrated to noseTipY ~ 0.60 (vy ~ -0.32)
      const noseProfile = Math.exp(-Math.pow(vx / 0.11, 2));
      const noseY = clamp((0.12 - vy) / 0.46, 0, 1);
      const noseMask = vy > -0.36 && vy < 0.14 ? Math.sin(noseY * Math.PI) * (0.45 + 0.55 * noseY) : 0;
      const noseTip = Math.exp(-Math.pow(vx / 0.125, 2)) * Math.exp(-Math.pow((vy + 0.32) / 0.095, 2));
      z += (noseProfile * noseMask * 0.015 + noseTip * 0.014) * fMask;

      // Subtle upper & lower lip contour (嘴唇起伏) calibrated to mouthY ~ 0.70 (vy ~ -0.56)
      const mouthW = Math.exp(-Math.pow(vx / 0.24, 2));
      const upperLip = mouthW * Math.exp(-Math.pow((vy + 0.52) / 0.055, 2));
      const lowerLip = mouthW * Math.exp(-Math.pow((vy + 0.62) / 0.06, 2));
      const mouthCrease = mouthW * Math.exp(-Math.pow((vy + 0.57) / 0.025, 2));
      z += (upperLip * 0.0065 + lowerLip * 0.0055 - mouthCrease * 0.004) * fMask;
    }

    pos.setXYZ(i, x, y, z);

    // 3. Exact Calibrated Front-Face UV Projection: avoids collar/background bleed on sides & back
    const uRaw = 0.5 + x / faceSpanX;
    const vRaw = uvCenterY + y / faceSpanY;
    if (vz >= 0.04) {
      // Gently clamp lower-side jaw UVs inward so dark collar corners in portrait never bleed onto neck/jaw
      const maxUDev = y < -0.055 ? 0.21 : 0.29;
      uv.setXY(i, clamp(uRaw, 0.5 - maxUDev, 0.5 + maxUDev), clamp(vRaw, 0.11, 0.96));
    } else if (vy < 0.08) {
      // Lower side/back neck-jaw samples clean mid-cheek skin (no dark collar artifacts)
      uv.setXY(i, x >= 0 ? 0.66 : 0.34, 0.44);
    } else {
      // Upper back cranium samples hair root at top edge (covered by layered 3D hair cards)
      uv.setXY(i, 0.5, 0.96);
    }
  }

  geo.computeVertexNormals();
  return geo;
}

/** Sculpted human ear silhouette attached seamlessly at temples. */
export function createEarGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.028);
  shape.quadraticCurveTo(0.022, 0.024, 0.02, -0.005);
  shape.quadraticCurveTo(0.016, -0.032, 0.002, -0.034);
  shape.quadraticCurveTo(-0.008, -0.02, -0.004, 0.018);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.007,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.003,
    bevelSegments: 2,
  });
  geo.rotateY(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Seamless sculpted upper torso + trapezius + broad clavicles + pectoral relief + waist taper.
 * Uses subtle 3D chest/back anatomy sculpting so robes and lamellar armor drape over real human volume.
 */
export function createSculptedHumanTorsoGeometry(broadness = 1.0): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.155, 0.0),
    new THREE.Vector2(0.148, 0.09),  // athletic narrow waist
    new THREE.Vector2(0.172, 0.21),  // lower ribcage
    new THREE.Vector2(0.208, 0.36),  // broad chest / lats
    new THREE.Vector2(0.218, 0.46),  // deltoid-clavicle shelf
    new THREE.Vector2(0.132, 0.525), // trapezius slope
    new THREE.Vector2(0.068, 0.565), // collar opening / neck base
  ];
  const geo = new THREE.LatheGeometry(pts, 24);
  geo.scale(1.1 * broadness, 1.0, 0.72);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    let z = pos.getZ(i);
    // Subtle pectoral chest contour on front (+Z) & scapula contour on back (-Z)
    if (z > 0 && y > 0.24 && y < 0.46) {
      const pec = Math.exp(-Math.pow((y - 0.36) / 0.08, 2)) * (0.5 + 0.5 * Math.cos((Math.abs(x) - 0.09) * 14));
      z += pec * 0.014;
    }
    if (z < 0 && y > 0.12 && y < 0.44) {
      // Natural spine S-curve indentation along back midline
      const spine = Math.exp(-Math.pow(x / 0.045, 2));
      z += spine * 0.011;
    }
    pos.setZ(i, z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpted anatomical gripping sword-hand OR Daoist Sword-Finger hand (剑指: index + middle extended!).
 */
export function createArticulatedHandGroup(
  skinOrGauntletMat: THREE.Material,
  style: 'grip' | 'swordFinger',
): THREE.Group {
  const g = new THREE.Group();
  // Tapered palm
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.072, 0.026), skinOrGauntletMat);
  palm.position.set(0, -0.028, 0);
  g.add(palm);

  const fingerGeo = new THREE.CylinderGeometry(0.0075, 0.009, 0.056, 6);
  const thumbGeo = new THREE.CylinderGeometry(0.0085, 0.01, 0.046, 6);

  if (style === 'swordFinger') {
    // Classic Li Xiaoyao Daoist Sword-Finger gesture (剑指): index & middle extended, ring/pinky curled
    for (const fx of [-0.014, 0.004]) {
      const f = new THREE.Mesh(fingerGeo, skinOrGauntletMat);
      f.position.set(fx, -0.088, 0.004);
      f.rotation.x = 0.08;
      g.add(f);
    }
    for (const fx of [0.018, 0.028]) {
      const f = new THREE.Mesh(fingerGeo, skinOrGauntletMat);
      f.scale.y = 0.65;
      f.position.set(fx, -0.055, 0.022);
      f.rotation.x = 1.25;
      g.add(f);
    }
    const thumb = new THREE.Mesh(thumbGeo, skinOrGauntletMat);
    thumb.position.set(-0.022, -0.046, 0.024);
    thumb.rotation.set(0.75, 0, -0.65);
    g.add(thumb);
  } else {
    // Realistic curled sword-gripping hand (4 curled fingers + opposing thumb)
    for (let i = 0; i < 4; i++) {
      const fx = -0.022 + i * 0.015;
      const f = new THREE.Mesh(fingerGeo, skinOrGauntletMat);
      f.scale.y = 0.85;
      f.position.set(fx, -0.062, 0.024);
      f.rotation.x = 1.15;
      g.add(f);
    }
    const thumb = new THREE.Mesh(thumbGeo, skinOrGauntletMat);
    thumb.position.set(-0.032, -0.04, 0.022);
    thumb.rotation.set(0.65, 0, -0.55);
    g.add(thumb);
  }
  return g;
}

/**
 * Generates an alpha-feathered multi-strand hair card texture so every 3D hair lock
 * has soft feathery individual hair strands instead of hard plastic dark wedges!
 */
export function createHairStrandAlphaTexture(baseColor = '#171518', highlightColor = '#3c3a42'): {
  map: THREE.CanvasTexture;
  alphaMap: THREE.CanvasTexture;
} {
  const w = 128;
  const h = 256;
  const cMap = document.createElement('canvas');
  const cAlpha = document.createElement('canvas');
  cMap.width = cAlpha.width = w;
  cMap.height = cAlpha.height = h;
  const m = cMap.getContext('2d')!;
  const a = cAlpha.getContext('2d')!;

  m.fillStyle = baseColor;
  m.fillRect(0, 0, w, h);
  a.fillStyle = '#000000';
  a.fillRect(0, 0, w, h);

  // Draw 48 fine vertical curved hair strands tapering toward wispy ends
  for (let i = 0; i < 52; i++) {
    const t = i / 51;
    const x0 = 14 + t * (w - 28);
    const centerWeight = 1 - Math.abs(t - 0.5) * 1.9;
    const len = h * (0.68 + 0.3 * Math.max(0, centerWeight) + ((i * 37) % 10) * 0.012);
    const alphaVal = Math.floor(clamp(165 + centerWeight * 90, 95, 255));

    m.strokeStyle = i % 5 === 0 ? highlightColor : baseColor;
    m.lineWidth = 2.4;
    m.beginPath();
    m.moveTo(x0, 0);
    m.quadraticCurveTo(x0 + Math.sin(i) * 5, len * 0.55, w * 0.5 + (x0 - w * 0.5) * 0.25, len);
    m.stroke();

    a.strokeStyle = `rgb(${alphaVal},${alphaVal},${alphaVal})`;
    a.lineWidth = 3.2;
    a.beginPath();
    a.moveTo(x0, 0);
    a.quadraticCurveTo(x0 + Math.sin(i) * 5, len * 0.55, w * 0.5 + (x0 - w * 0.5) * 0.25, len);
    a.stroke();
  }

  // Solid root opacity at top so hairline connects cleanly to skull
  const rootGrad = a.createLinearGradient(0, 0, 0, 48);
  rootGrad.addColorStop(0, 'rgba(255,255,255,1)');
  rootGrad.addColorStop(1, 'rgba(255,255,255,0)');
  a.fillStyle = rootGrad;
  a.fillRect(10, 0, w - 20, 48);

  const map = new THREE.CanvasTexture(cMap);
  map.colorSpace = THREE.SRGBColorSpace;
  const alphaMap = new THREE.CanvasTexture(cAlpha);
  return { map, alphaMap };
}

/** Curved multi-strand hair card geometry with subtle cross-arch volume. */
export function createCurvedHairCardGeo(len: number, width: number, curveBack: number, flareOut = 0): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(width, len, 4, 8);
  geo.translate(0, -len * 0.5, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const t = clamp(-y / len, 0, 1);
    const nx = x / (width * 0.5);
    const archCross = (1 - nx * nx) * 0.012 * (1 - t * 0.5);
    const sweepZ = -curveBack * t * t + flareOut * Math.sin(t * Math.PI);
    pos.setXYZ(i, x * (1 - t * 0.32), y, sweepZ + archCross);
  }
  geo.computeVertexNormals();
  return geo;
}

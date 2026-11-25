import * as THREE from 'three';
import { clamp } from '../utils/math';

/**
 * Applies physically-inspired Pre-Integrated Human Skin Subsurface Scattering (SSS)
 * to a MeshPhysicalMaterial via Three.js 0.184 RE_Direct_Physical wrap-diffuse hook.
 * Shifts harsh grey shadow terminators into warm living dermis/hemoglobin translucency
 * across cheekbones, nose bridge, brow ridge, ears, and jawline.
 */
export function applyHumanSkinSss(
  mat: THREE.MeshPhysicalMaterial,
  tintHex = '#c84b26',
  strength = 0.34,
): THREE.MeshPhysicalMaterial {
  const sssColor = new THREE.Color(tintHex);
  mat.customProgramCacheKey = () => 'photoreal-human-sss-v1';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSssColor = { value: sssColor };
    shader.uniforms.uSssStrength = { value: strength };
    shader.fragmentShader =
      `uniform vec3 uSssColor;\nuniform float uSssStrength;\n` +
      shader.fragmentShader.replace(
        'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
        `float rawNL = dot( geometryNormal, directLight.direction );
         float dotNL = saturate( rawNL );
         float sssBand = smoothstep( -0.38, 0.32, rawNL ) * ( 1.0 - smoothstep( 0.06, 0.72, rawNL ) );
         reflectedLight.directDiffuse += directLight.color * material.diffuseColor * uSssColor * ( sssBand * uSssStrength );`,
      );
  };
  return mat;
}

/**
 * High-resolution (60x44) sculpted anatomical human head mesh with live-action facial relief:
 * sculpted supraorbital brow arch, recessed orbital sockets, realistic nasal bridge + tip + alae,
 * zygomatic cheekbones, philtrum & vermilion lips, masculine mandible & chin, occipital cranium,
 * and exact front-projected UV coordinates calibrated to untouched 768px studio photographic portraits.
 */
export function createAnatomicalHeadGeometry(options?: {
  faceSpanX?: number;
  faceSpanY?: number;
  uvCenterY?: number;
  jawStrength?: number;
  browDepth?: number;
}): THREE.BufferGeometry {
  const faceSpanX = options?.faceSpanX ?? 0.252;
  const faceSpanY = options?.faceSpanY ?? 0.282;
  const uvCenterY = options?.uvCenterY ?? 0.51;
  const jawStrength = options?.jawStrength ?? 1.05;
  const browDepth = options?.browDepth ?? 1.0;

  const segU = 60;
  const segV = 44;
  const geo = new THREE.SphereGeometry(0.105, segU, segV);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;

  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i) / 0.105;
    const vy = pos.getY(i) / 0.105;
    const vz = pos.getZ(i) / 0.105;

    // 1. Live-action adult male cranium proportions (refined temple width, natural vertical oval, fuller occiput)
    let x = vx * 0.081;
    let y = vy * 0.118;
    let z = vz * 0.097;

    // Subtle temple narrowing above cheekbones for authentic realistic skull silhouette
    if (vy > 0.1 && vy < 0.65 && Math.abs(vx) > 0.55) {
      const templeMask = Math.exp(-Math.pow((vy - 0.36) / 0.22, 2)) * clamp((Math.abs(vx) - 0.55) / 0.45, 0, 1);
      x *= 1.0 - templeMask * 0.075;
    }

    // Fuller occipital back skull
    if (vz < 0) {
      z *= 1.15;
      if (vy > -0.1) y += 0.008 * (-vz);
    }

    // Sculpted mandible, gonial jaw angle, and defined chin
    if (vy < -0.14) {
      const jawT = clamp((-vy - 0.14) / 0.86, 0, 1);
      const frontFactor = clamp(vz * 0.5 + 0.5, 0, 1);
      x *= 1.0 - jawT * (0.33 - 0.045 * jawStrength) * (0.52 + 0.48 * frontFactor);
      const gonial = Math.exp(-Math.pow((Math.abs(vx) - 0.72) / 0.22, 2)) * Math.exp(-Math.pow((vy + 0.52) / 0.22, 2));
      x += Math.sign(vx) * gonial * 0.0095 * jawStrength;
      if (vz > 0.18) {
        const chin = Math.exp(-Math.pow(vx / 0.30, 2)) * Math.exp(-Math.pow((vy + 0.83) / 0.20, 2));
        z += chin * 0.0145 * jawStrength;
        y -= chin * 0.0055;
      }
    }

    // 2. High-detail front facial anatomy (vz > 0.04)
    if (vz > 0.04) {
      const fMask = clamp((vz - 0.04) / 0.52, 0, 1);

      // Supraorbital brow ridge + glabella
      const brow = Math.exp(-Math.pow((vy - 0.215) / 0.095, 2)) * Math.exp(-Math.pow(vx / 0.58, 2));
      z += brow * 0.0115 * browDepth * fMask;

      // Deep realistic eye sockets (orbital cavities) + gentle eyelid bulge inside sockets
      const eyeL = Math.exp(-Math.pow((vx + 0.345) / 0.155, 2)) * Math.exp(-Math.pow((vy - 0.055) / 0.105, 2));
      const eyeR = Math.exp(-Math.pow((vx - 0.345) / 0.155, 2)) * Math.exp(-Math.pow((vy - 0.055) / 0.105, 2));
      const eyeballL = Math.exp(-Math.pow((vx + 0.345) / 0.085, 2)) * Math.exp(-Math.pow((vy - 0.052) / 0.055, 2));
      const eyeballR = Math.exp(-Math.pow((vx - 0.345) / 0.085, 2)) * Math.exp(-Math.pow((vy - 0.052) / 0.055, 2));
      z += (-0.0135 * (eyeL + eyeR) + 0.0052 * (eyeballL + eyeballR)) * fMask;

      // Zygomatic cheekbones + sub-malar hollowing for real adult facial structure
      const cheekL = Math.exp(-Math.pow((vx + 0.49) / 0.19, 2)) * Math.exp(-Math.pow((vy + 0.14) / 0.14, 2));
      const cheekR = Math.exp(-Math.pow((vx - 0.49) / 0.19, 2)) * Math.exp(-Math.pow((vy + 0.14) / 0.14, 2));
      const hollowL = Math.exp(-Math.pow((vx + 0.46) / 0.18, 2)) * Math.exp(-Math.pow((vy + 0.38) / 0.14, 2));
      const hollowR = Math.exp(-Math.pow((vx - 0.46) / 0.18, 2)) * Math.exp(-Math.pow((vy + 0.38) / 0.14, 2));
      z += (0.0095 * (cheekL + cheekR) - 0.0045 * (hollowL + hollowR)) * fMask;

      // Sculpted 3D Nose: straight bridge + projecting tip + lateral nostril wings (alae) + under-nose shadow
      const noseProfile = Math.exp(-Math.pow(vx / 0.095, 2));
      const noseY = clamp((0.14 - vy) / 0.46, 0, 1);
      const noseMask = vy > -0.36 && vy < 0.15 ? Math.sin(noseY * Math.PI) * (0.42 + 0.58 * noseY) : 0;
      const noseTip = Math.exp(-Math.pow(vx / 0.11, 2)) * Math.exp(-Math.pow((vy + 0.305) / 0.082, 2));
      const alae =
        (Math.exp(-Math.pow((vx + 0.145) / 0.06, 2)) + Math.exp(-Math.pow((vx - 0.145) / 0.06, 2))) *
        Math.exp(-Math.pow((vy + 0.32) / 0.055, 2));
      const philtrum = Math.exp(-Math.pow(vx / 0.06, 2)) * Math.exp(-Math.pow((vy + 0.43) / 0.055, 2));
      z += (noseProfile * noseMask * 0.0175 + noseTip * 0.0165 + alae * 0.0068 - philtrum * 0.0032) * fMask;

      // Realistic vermilion upper & lower lip contour + mentolabial fold beneath lower lip
      const mouthW = Math.exp(-Math.pow(vx / 0.23, 2));
      const upperLip = mouthW * Math.exp(-Math.pow((vy + 0.515) / 0.048, 2));
      const lowerLip = mouthW * Math.exp(-Math.pow((vy + 0.615) / 0.056, 2));
      const mouthCrease = mouthW * Math.exp(-Math.pow((vy + 0.565) / 0.022, 2));
      const chinFold = Math.exp(-Math.pow(vx / 0.22, 2)) * Math.exp(-Math.pow((vy + 0.71) / 0.045, 2));
      z += (upperLip * 0.0075 + lowerLip * 0.0065 - mouthCrease * 0.0048 - chinFold * 0.0038) * fMask;
    }

    pos.setXYZ(i, x, y, z);

    // 3. Calibrated front-face UV projection
    const uRaw = 0.5 + x / faceSpanX;
    const vRaw = uvCenterY + y / faceSpanY;
    if (vz >= 0.04) {
      const maxUDev = y < -0.055 ? 0.22 : 0.30;
      uv.setXY(i, clamp(uRaw, 0.5 - maxUDev, 0.5 + maxUDev), clamp(vRaw, 0.10, 0.96));
    } else if (vy < 0.08) {
      uv.setXY(i, x >= 0 ? 0.67 : 0.33, 0.45);
    } else {
      uv.setXY(i, 0.5, 0.96);
    }
  }

  geo.computeVertexNormals();
  return geo;
}

/** Sculpted human ear with outer helix rim attached naturally at temples. */
export function createEarGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.028);
  shape.quadraticCurveTo(0.021, 0.024, 0.019, -0.004);
  shape.quadraticCurveTo(0.015, -0.031, 0.002, -0.033);
  shape.quadraticCurveTo(-0.007, -0.02, -0.004, 0.018);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.0065,
    bevelEnabled: true,
    bevelThickness: 0.0042,
    bevelSize: 0.0032,
    bevelSegments: 3,
  });
  geo.rotateY(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Legacy helper retained for compatibility if referenced elsewhere.
 */
export function createSculptedHumanTorsoGeometry(broadness = 1.0): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.155, 0.0),
    new THREE.Vector2(0.148, 0.09),
    new THREE.Vector2(0.172, 0.21),
    new THREE.Vector2(0.208, 0.36),
    new THREE.Vector2(0.218, 0.46),
    new THREE.Vector2(0.132, 0.525),
    new THREE.Vector2(0.068, 0.565),
  ];
  const geo = new THREE.LatheGeometry(pts, 28);
  geo.scale(1.1 * broadness, 1.0, 0.72);
  geo.computeVertexNormals();
  return geo;
}

/**
 * High-resolution (256x512) photorealistic multi-strand hair alpha + color + bump texture
 * with 150 fine natural individual hair filaments and feathery wispy ends.
 */
export function createHairStrandAlphaTexture(
  baseColor = '#141213',
  midColor = '#272220',
  highlightColor = '#463f3a',
): {
  map: THREE.CanvasTexture;
  alphaMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const w = 256;
  const h = 512;
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
  a.fillStyle = '#000000';
  a.fillRect(0, 0, w, h);
  b.fillStyle = '#404040';
  b.fillRect(0, 0, w, h);

  // Draw 156 ultra-fine tapered natural hair filaments with organic wave & staggered lengths
  for (let i = 0; i < 156; i++) {
    const t = i / 155;
    const jitter = Math.sin(i * 19.37) * 6;
    const x0 = 18 + t * (w - 36) + jitter;
    const centerWeight = 1 - Math.abs(t - 0.5) * 1.92;
    const len = h * clamp(0.58 + 0.38 * Math.max(0, centerWeight) + Math.sin(i * 7.13) * 0.08, 0.35, 0.99);
    const alphaVal = Math.floor(clamp(135 + centerWeight * 115 + Math.cos(i * 5.7) * 20, 75, 255));
    const ctrlX = x0 + Math.sin(i * 2.3) * 14;
    const endX = w * 0.5 + (x0 - w * 0.5) * (0.28 + Math.abs(Math.sin(i * 3.1)) * 0.24);

    m.strokeStyle = i % 7 === 0 ? highlightColor : i % 3 === 0 ? midColor : baseColor;
    m.lineWidth = 1.6 + (i % 3) * 0.55;
    m.beginPath();
    m.moveTo(x0, 0);
    m.quadraticCurveTo(ctrlX, len * 0.54, endX, len);
    m.stroke();

    a.strokeStyle = `rgb(${alphaVal},${alphaVal},${alphaVal})`;
    a.lineWidth = 2.4 + (i % 3) * 0.6;
    a.beginPath();
    a.moveTo(x0, 0);
    a.quadraticCurveTo(ctrlX, len * 0.54, endX, len);
    a.stroke();

    const bv = i % 2 === 0 ? 195 : 135;
    b.strokeStyle = `rgb(${bv},${bv},${bv})`;
    b.lineWidth = 1.6;
    b.beginPath();
    b.moveTo(x0, 0);
    b.quadraticCurveTo(ctrlX, len * 0.54, endX, len);
    b.stroke();
  }

  // Dense root band at scalp line tapering softly into individual strands
  const rootGrad = a.createLinearGradient(0, 0, 0, 96);
  rootGrad.addColorStop(0, 'rgba(255,255,255,0.96)');
  rootGrad.addColorStop(0.55, 'rgba(255,255,255,0.45)');
  rootGrad.addColorStop(1, 'rgba(255,255,255,0)');
  a.fillStyle = rootGrad;
  a.fillRect(16, 0, w - 32, 96);

  const map = new THREE.CanvasTexture(cMap);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const alphaMap = new THREE.CanvasTexture(cAlpha);
  alphaMap.anisotropy = 4;
  const bumpMap = new THREE.CanvasTexture(cBump);
  return { map, alphaMap, bumpMap };
}

/** Curved multi-strand hair card geometry with organic wind wave & volume arch. */
export function createCurvedHairCardGeo(
  len: number,
  width: number,
  curveBack: number,
  flareOut = 0,
): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(width, len, 5, 10);
  geo.translate(0, -len * 0.5, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const t = clamp(-y / len, 0, 1);
    const nx = x / (width * 0.5);
    const archCross = (1 - nx * nx) * 0.014 * (1 - t * 0.45);
    const sweepZ = -curveBack * t * t + flareOut * Math.sin(t * Math.PI);
    const naturalSwayX = Math.sin(t * Math.PI * 1.35) * width * 0.08;
    pos.setXYZ(i, x * (1 - t * 0.34) + naturalSwayX, y, sweepZ + archCross);
  }
  geo.computeVertexNormals();
  return geo;
}

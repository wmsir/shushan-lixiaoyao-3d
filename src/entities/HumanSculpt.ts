import * as THREE from 'three';
import { clamp } from '../utils/math';

/**
 * Shared crop/destination framing for seamless studio face portraits so albedo, normal,
 * and roughness maps align pixel-for-pixel across full cheek-to-cheek & chin-to-forehead
 * coverage while excluding outer gray studio borders & bottom shirt collars.
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
    img.addEventListener(
      'load',
      () => {
        attempt();
      },
      { once: true },
    );
  }

  // Hook optional callback list populated by loadTex() for 0ms reaction when TextureLoader resolves
  const listeners = ((sourceTex.userData.__seamlessListeners ??= []) as Array<() => void>);
  listeners.push(() => {
    attempt();
  });

  // Fallback watcher for plain THREE.TextureLoader().load() textures where .image is assigned asynchronously
  let attempts = 0;
  const poll = () => {
    if (done || attempts++ > 450) return;
    if (!attempt() && typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
      window.setTimeout(poll, 28);
    }
  };
  if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
    window.setTimeout(poll, 16);
  }
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

  // Wide smooth elliptical alpha feather mask: 100% solid across forehead/brows/eyes/cheeks/jaw,
  // tapering softly only at the extreme outer rim so zero gray borders or lower-corner shirt collar enter
  const cx = dx + dw * 0.5;
  const cy = dy + dh * 0.50;
  const rx = dw * 0.485;
  const ry = dh * 0.49;

  octx.save();
  octx.globalCompositeOperation = 'destination-in';
  octx.translate(cx, cy);
  octx.scale(rx, ry);
  const grad = octx.createRadialGradient(0, 0, 0.72, 0, 0, 1.0);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.78, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.90, 'rgba(255, 255, 255, 0.56)');
  grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  octx.fillStyle = grad;
  octx.beginPath();
  octx.arc(0, 0, 1.0, 0, Math.PI * 2);
  octx.fill();
  octx.restore();

  targetCtx.drawImage(off, 0, 0);
}

type SrgbRgb = [number, number, number];

function parseHexToSrgbBytes(hex: string): SrgbRgb {
  const clean = hex.replace('#', '').trim();
  const num = Number.parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
  if (!Number.isFinite(num)) return [200, 149, 117];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function lerpSrgb(a: SrgbRgb, b: SrgbRgb, t: number): SrgbRgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function paintDermisCanvas(
  ctx: CanvasRenderingContext2D,
  size: number,
  baseRgb: SrgbRgb,
): void {
  const highlightRgb = lerpSrgb(baseRgb, [238, 198, 168], 0.18);
  const cheekRgb = lerpSrgb(baseRgb, [186, 122, 96], 0.16);
  const jawShadeRgb = lerpSrgb(baseRgb, [142, 94, 70], 0.22);

  ctx.fillStyle = `rgb(${baseRgb[0]}, ${baseRgb[1]}, ${baseRgb[2]})`;
  ctx.fillRect(0, 0, size, size);

  // Subtle natural sunlit forehead lift (pure sRGB bytes — zero linear/sRGB double-gamma!)
  const browGrad = ctx.createRadialGradient(size * 0.5, size * 0.24, size * 0.04, size * 0.5, size * 0.26, size * 0.36);
  browGrad.addColorStop(0, `rgba(${highlightRgb[0]}, ${highlightRgb[1]}, ${highlightRgb[2]}, 0.28)`);
  browGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = browGrad;
  ctx.fillRect(0, 0, size, size);

  // Warm living dermis sub-cheek tone
  for (const cx of [0.24, 0.76]) {
    const cheekGrad = ctx.createRadialGradient(size * cx, size * 0.58, size * 0.02, size * cx, size * 0.58, size * 0.26);
    cheekGrad.addColorStop(0, `rgba(${cheekRgb[0]}, ${cheekRgb[1]}, ${cheekRgb[2]}, 0.22)`);
    cheekGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = cheekGrad;
    ctx.fillRect(0, 0, size, size);
  }

  // Gentle chin/underside shadow for seamless jaw-to-neck transition
  const jawGrad = ctx.createLinearGradient(0, size * 0.80, 0, size);
  jawGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  jawGrad.addColorStop(1, `rgba(${jawShadeRgb[0]}, ${jawShadeRgb[1]}, ${jawShadeRgb[2]}, 0.26)`);
  ctx.fillStyle = jawGrad;
  ctx.fillRect(0, size * 0.80, size, size * 0.20);
}

/**
 * Builds a seamless 512x512 photorealistic face CanvasTexture backed by warm natural East Asian dermis,
 * cropping the full cheek-to-cheek facial center of a studio portrait with a wide smooth elliptical alpha
 * feather mask so zero studio gray borders or dark shirt collars bleed onto the 3D cheeks, jawline, or ears.
 */
export function createSeamlessFaceTexture(
  sourceTex: THREE.Texture,
  skinEdgeHex = '#c89575',
): THREE.Texture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const baseRgb = parseHexToSrgbBytes(skinEdgeHex);
  paintDermisCanvas(ctx, size, baseRgb);

  const outTex = new THREE.CanvasTexture(canvas);
  outTex.colorSpace = THREE.SRGBColorSpace;
  outTex.anisotropy = 4;
  outTex.needsUpdate = true;

  subscribeSourceTextureReady(sourceTex, (img, w, h) => {
    // Sample true outer-cheek & jawline sRGB bytes directly from the portrait (zero double-gamma!)
    let surroundRgb: SrgbRgb = baseRgb;
    try {
      const sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = 64;
      sampleCanvas.height = 64;
      const sctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
      if (sctx) {
        sctx.drawImage(img, 0, 0, w, h, 0, 0, 64, 64);
        const pts: Array<[number, number]> = [
          [0.24, 0.56],
          [0.76, 0.56],
          [0.29, 0.70],
          [0.71, 0.70],
        ];
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let count = 0;
        for (const [px, py] of pts) {
          const d = sctx.getImageData(Math.round(64 * px), Math.round(64 * py), 1, 1).data;
          if (d[0] > 110 && d[0] > d[2] + 12) {
            sumR += d[0];
            sumG += d[1];
            sumB += d[2];
            count++;
          }
        }
        if (count > 0) {
          const sampledColor = new THREE.Color().setRGB(
            sumR / (count * 255),
            sumG / (count * 255),
            sumB / (count * 255),
            THREE.SRGBColorSpace,
          );
          const sampledRgb = parseHexToSrgbBytes(`#${sampledColor.getHexString()}`);
          surroundRgb = lerpSrgb(baseRgb, sampledRgb, 0.65);
        }
      }
    } catch {
      // Ignore cross-origin pixel read errors; fall back cleanly to skinEdgeHex
    }

    paintDermisCanvas(ctx, size, surroundRgb);
    drawFeatheredPortraitCrop(ctx, img, w, h, size);
    outTex.needsUpdate = true;
  });

  return outTex;
}

/**
 * Aligns auxiliary non-color face maps (normalMap / roughnessMap) to the exact same crop & elliptical
 * feather framing as createSeamlessFaceTexture so micro-pores, eyelids, and lips stay pixel-aligned
 * without projecting outer collar ridges or studio edge artifacts onto the cheeks and jaw.
 */
export function createSeamlessFaceAuxTexture(
  sourceTex: THREE.Texture,
  baseFillCss = '#8080ff',
): THREE.Texture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseFillCss;
  ctx.fillRect(0, 0, size, size);

  const outTex = new THREE.CanvasTexture(canvas);
  outTex.colorSpace = THREE.NoColorSpace;
  outTex.anisotropy = 4;
  outTex.needsUpdate = true;

  subscribeSourceTextureReady(sourceTex, (img, w, h) => {
    ctx.fillStyle = baseFillCss;
    ctx.fillRect(0, 0, size, size);
    drawFeatheredPortraitCrop(ctx, img, w, h, size);
    outTex.needsUpdate = true;
  });

  return outTex;
}

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

export interface SilhouetteRimHandle {
  uRimColor: { value: THREE.Color };
  uRimStrength: { value: number };
  uRimPower: { value: number };
}

/**
 * Attaches view-dependent Fresnel silhouette rim lighting to any MeshStandardMaterial /
 * MeshPhysicalMaterial without washing out surface albedo or breaking shared shader caching.
 */
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

/**
 * High-resolution (60x44) sculpted anatomical human head mesh with handsome East Asian live-action
 * facial relief: refined supraorbital brow arch, natural orbital sockets, sleek straight nasal bridge
 * + refined tip, subtle zygomatic cheekbones, smooth vermilion lips, V-tapered masculine mandible,
 * and front-projected UVs calibrated to the seamless 512x512 face canvas.
 */
export function createAnatomicalHeadGeometry(options?: {
  faceSpanX?: number;
  faceSpanY?: number;
  uvCenterY?: number;
  jawStrength?: number;
  browDepth?: number;
  seamlessEdgeUv?: boolean;
}): THREE.BufferGeometry {
  const faceSpanX = options?.faceSpanX ?? 0.184;
  const faceSpanY = options?.faceSpanY ?? 0.242;
  const uvCenterY = options?.uvCenterY ?? 0.535;
  const jawStrength = options?.jawStrength ?? 1.0;
  const browDepth = options?.browDepth ?? 1.0;
  const seamlessEdgeUv = options?.seamlessEdgeUv ?? true;

  const segU = 60;
  const segV = 44;
  const geo = new THREE.SphereGeometry(0.105, segU, segV);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;

  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i) / 0.105;
    const vy = pos.getY(i) / 0.105;
    const vz = pos.getZ(i) / 0.105;

    // 1. Natural handsome East Asian adult male cranium proportions
    let x = vx * 0.087;
    let y = vy * 0.121;
    let z = vz * 0.101;

    // Subtle temple narrowing above cheekbones for authentic realistic skull silhouette
    if (vy > 0.12 && vy < 0.66 && Math.abs(vx) > 0.56) {
      const templeMask = Math.exp(-Math.pow((vy - 0.36) / 0.22, 2)) * clamp((Math.abs(vx) - 0.56) / 0.44, 0, 1);
      x *= 1.0 - templeMask * 0.058;
    }

    // Fuller occipital back skull
    if (vz < 0) {
      z *= 1.13;
      if (vy > -0.1) y += 0.007 * (-vz);
    }

    // Smoother masculine V-tapered mandible, refined gonial angle, and sculpted chin
    if (vy < -0.14) {
      const jawT = clamp((-vy - 0.14) / 0.86, 0, 1);
      const frontFactor = clamp(vz * 0.5 + 0.5, 0, 1);
      x *= 1.0 - jawT * (0.345 - 0.036 * jawStrength) * (0.50 + 0.50 * frontFactor);
      const gonial = Math.exp(-Math.pow((Math.abs(vx) - 0.70) / 0.22, 2)) * Math.exp(-Math.pow((vy + 0.50) / 0.22, 2));
      x += Math.sign(vx) * gonial * 0.0065 * jawStrength;
      if (vz > 0.16) {
        const chin = Math.exp(-Math.pow(vx / 0.29, 2)) * Math.exp(-Math.pow((vy + 0.82) / 0.21, 2));
        z += chin * 0.0122 * jawStrength;
        y -= chin * 0.0042;
      }
    }

    // 2. High-detail front facial anatomy (vz > 0.04) calibrated to full-width seamless portrait landmarks
    if (vz > 0.04) {
      const fMask = clamp((vz - 0.04) / 0.50, 0, 1);

      // Refined supraorbital brow arch + glabella
      const brow = Math.exp(-Math.pow((vy - 0.28) / 0.092, 2)) * Math.exp(-Math.pow(vx / 0.62, 2));
      z += brow * 0.0085 * browDepth * fMask;

      // Natural recessed orbital sockets + gentle eyeball contour aligned with full-width portrait pupils
      const eyeL = Math.exp(-Math.pow((vx + 0.41) / 0.155, 2)) * Math.exp(-Math.pow((vy - 0.116) / 0.10, 2));
      const eyeR = Math.exp(-Math.pow((vx - 0.41) / 0.155, 2)) * Math.exp(-Math.pow((vy - 0.116) / 0.10, 2));
      const eyeballL = Math.exp(-Math.pow((vx + 0.41) / 0.085, 2)) * Math.exp(-Math.pow((vy - 0.114) / 0.052, 2));
      const eyeballR = Math.exp(-Math.pow((vx - 0.41) / 0.085, 2)) * Math.exp(-Math.pow((vy - 0.114) / 0.052, 2));
      z += (-0.0102 * (eyeL + eyeR) + 0.0042 * (eyeballL + eyeballR)) * fMask;

      // Subtle youthful zygomatic cheekbone contour + gentle cheek plane taper
      const cheekL = Math.exp(-Math.pow((vx + 0.52) / 0.20, 2)) * Math.exp(-Math.pow((vy + 0.12) / 0.15, 2));
      const cheekR = Math.exp(-Math.pow((vx - 0.52) / 0.20, 2)) * Math.exp(-Math.pow((vy + 0.12) / 0.15, 2));
      const hollowL = Math.exp(-Math.pow((vx + 0.48) / 0.18, 2)) * Math.exp(-Math.pow((vy + 0.38) / 0.14, 2));
      const hollowR = Math.exp(-Math.pow((vx - 0.48) / 0.18, 2)) * Math.exp(-Math.pow((vy + 0.38) / 0.14, 2));
      z += (0.0072 * (cheekL + cheekR) - 0.0028 * (hollowL + hollowR)) * fMask;

      // Sleek straight nasal bridge + refined tip (not bulbous) + delicate alae + philtrum
      const noseProfile = Math.exp(-Math.pow(vx / 0.088, 2));
      const noseY = clamp((0.18 - vy) / 0.50, 0, 1);
      const noseMask = vy > -0.36 && vy < 0.18 ? Math.sin(noseY * Math.PI) * (0.44 + 0.56 * noseY) : 0;
      const noseTip = Math.exp(-Math.pow(vx / 0.102, 2)) * Math.exp(-Math.pow((vy + 0.314) / 0.076, 2));
      const alae =
        (Math.exp(-Math.pow((vx + 0.146) / 0.056, 2)) + Math.exp(-Math.pow((vx - 0.146) / 0.056, 2))) *
        Math.exp(-Math.pow((vy + 0.326) / 0.052, 2));
      const philtrum = Math.exp(-Math.pow(vx / 0.058, 2)) * Math.exp(-Math.pow((vy + 0.455) / 0.052, 2));
      z += (noseProfile * noseMask * 0.0145 + noseTip * 0.0135 + alae * 0.0048 - philtrum * 0.0024) * fMask;

      // Smooth vermilion upper & lower lips + delicate mentolabial fold
      const mouthW = Math.exp(-Math.pow(vx / 0.225, 2));
      const upperLip = mouthW * Math.exp(-Math.pow((vy + 0.545) / 0.044, 2));
      const lowerLip = mouthW * Math.exp(-Math.pow((vy + 0.642) / 0.052, 2));
      const mouthCrease = mouthW * Math.exp(-Math.pow((vy + 0.595) / 0.020, 2));
      const chinFold = Math.exp(-Math.pow(vx / 0.22, 2)) * Math.exp(-Math.pow((vy + 0.735) / 0.044, 2));
      z += (upperLip * 0.0055 + lowerLip * 0.0048 - mouthCrease * 0.0036 - chinFold * 0.0028) * fMask;
    }

    pos.setXYZ(i, x, y, z);

    // 3. Calibrated full-width front-face UV projection (cheek-to-cheek portrait coverage, seamless dermis edge wrap)
    const uRaw = 0.5 + x / faceSpanX;
    const vRaw = uvCenterY + y / faceSpanY;
    if (vz >= 0.04) {
      if (seamlessEdgeUv) {
        uv.setXY(i, clamp(uRaw, 0.10, 0.90), clamp(vRaw, 0.08, 0.92));
      } else {
        const maxUDev = y < -0.055 ? 0.22 : 0.30;
        uv.setXY(i, clamp(uRaw, 0.5 - maxUDev, 0.5 + maxUDev), clamp(vRaw, 0.10, 0.96));
      }
    } else if (seamlessEdgeUv) {
      // Sample clean warm dermis edge on seamless face canvas so temples/jaw/back blend seamlessly with ears & neck
      uv.setXY(i, 0.03, 0.5);
    } else if (vy < 0.08) {
      uv.setXY(i, x >= 0 ? 0.67 : 0.33, 0.45);
    } else {
      uv.setXY(i, 0.5, 0.96);
    }
  }

  geo.computeVertexNormals();
  return geo;
}

/**
 * Smooth volumetric 3D curved tapered hair lock with arched rounded cross-section (zero boxy edges)
 * for photorealistic swept Xianxia bangs, cheek-framing temple locks, nape hair, and flowing ponytail.
 */
export function createSculptedHairLockGeo(
  len: number,
  width: number,
  curveZ: number,
  flareX = 0,
): THREE.BufferGeometry {
  const lenSegs = 12;
  const radSegs = 8;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iv = 0; iv <= lenSegs; iv++) {
    const t = iv / lenSegs;
    // Root swells smoothly out of scalp, tapers gracefully to a silky pointed tip
    const rootEase = t < 0.14 ? 0.48 + 0.52 * Math.sin((t / 0.14) * (Math.PI * 0.5)) : 1.0;
    const tipEase = t > 0.18 ? Math.pow(clamp(1 - (t - 0.18) / 0.82, 0, 1), 0.72) : 1.0;
    const profileScale = Math.max(0.035, rootEase * tipEase);

    const halfW = width * 0.5 * profileScale;
    const halfThick = width * 0.21 * profileScale;

    // Centerline spine curve
    const cy = -t * len;
    const cz = curveZ * t * t + Math.sin(t * Math.PI) * (Math.abs(curveZ) * 0.18 + 0.006);
    const cx = flareX * Math.pow(t, 1.3) + Math.sin(t * Math.PI * 1.15) * flareX * 0.14;

    for (let ir = 0; ir <= radSegs; ir++) {
      const u = ir / radSegs;
      const theta = u * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // Arched crescent/almond cross-section: rounded glossy spine on +Z, softly cupped underside on -Z
      const archLift = (1 - cosT * cosT) * halfThick * 0.36;
      const strandGroove = Math.sin(theta * 3.0) * halfThick * 0.09;
      const lx = cosT * halfW;
      const lz = sinT * halfThick + archLift + strandGroove;

      positions.push(cx + lx, cy, cz + lz);
      uvs.push(u, t);
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

  // Close tiny tip cap cleanly
  const tipCenterIdx = positions.length / 3;
  const tipZ = curveZ + 0.002;
  const tipX = flareX;
  positions.push(tipX, -len * 1.015, tipZ);
  uvs.push(0.5, 1.0);
  const lastRingStart = lenSegs * stride;
  for (let ir = 0; ir < radSegs; ir++) {
    indices.push(lastRingStart + ir, tipCenterIdx, lastRingStart + ir + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
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

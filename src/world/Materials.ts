import * as THREE from 'three';

function hash2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

/**
 * Generates weathered Shushan courtyard stone maps with matte-satin roughness (0.68-0.95)
 * so moonlight produces rich mineral variation WITHOUT blinding mirror-white specular glare.
 */
export function createCourtyardStoneMaps(): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const size = 512;
  const albedoC = document.createElement('canvas');
  const bumpC = document.createElement('canvas');
  const roughC = document.createElement('canvas');
  albedoC.width = bumpC.width = roughC.width = size;
  albedoC.height = bumpC.height = roughC.height = size;

  const aCtx = albedoC.getContext('2d')!;
  const bCtx = bumpC.getContext('2d')!;
  const rCtx = roughC.getContext('2d')!;

  aCtx.fillStyle = '#2d3642';
  aCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#888888';
  bCtx.fillRect(0, 0, size, size);
  rCtx.fillStyle = '#d8d8d8';
  rCtx.fillRect(0, 0, size, size);

  const rows = 8;
  const rowH = size / rows;
  for (let row = 0; row < rows; row++) {
    const cols = 4;
    const colW = size / cols;
    const offset = (row % 2) * (colW * 0.5);
    for (let col = -1; col <= cols; col++) {
      const x = col * colW + offset;
      const y = row * rowH;
      const h = hash2(col + row * 7, row * 13 + 3);
      const tone = Math.floor(36 + h * 22);
      const green = Math.floor(tone * 1.12 + 4);
      const blue = Math.floor(tone * 1.24 + 8);

      aCtx.fillStyle = `rgb(${tone},${green},${blue})`;
      aCtx.fillRect(x + 3, y + 3, colW - 6, rowH - 6);

      // Crisp moonlight bevel highlight (top/left) & recessed shadow edge (bottom/right)
      aCtx.strokeStyle = `rgba(156, 192, 214, ${(0.09 + h * 0.07).toFixed(3)})`;
      aCtx.lineWidth = 2;
      aCtx.beginPath();
      aCtx.moveTo(x + 5, y + rowH - 6);
      aCtx.lineTo(x + 5, y + 5);
      aCtx.lineTo(x + colW - 6, y + 5);
      aCtx.stroke();

      aCtx.strokeStyle = 'rgba(8, 13, 20, 0.42)';
      aCtx.beginPath();
      aCtx.moveTo(x + colW - 5, y + 6);
      aCtx.lineTo(x + colW - 5, y + rowH - 5);
      aCtx.lineTo(x + 6, y + rowH - 5);
      aCtx.stroke();

      const bVal = Math.floor(146 + h * 68);
      bCtx.fillStyle = `rgb(${bVal},${bVal},${bVal})`;
      bCtx.fillRect(x + 3, y + 3, colW - 6, rowH - 6);

      // Disciplined stone roughness (184..240 -> roughness 0.72..0.94) prevents whiteout glare
      const rVal = Math.floor(184 + h * 56);
      rCtx.fillStyle = `rgb(${rVal},${rVal},${rVal})`;
      rCtx.fillRect(x + 3, y + 3, colW - 6, rowH - 6);

      aCtx.strokeStyle = '#111720';
      aCtx.lineWidth = 5;
      aCtx.strokeRect(x, y, colW, rowH);
      bCtx.strokeStyle = '#181818';
      bCtx.lineWidth = 5;
      bCtx.strokeRect(x, y, colW, rowH);

      if (h > 0.68) {
        aCtx.fillStyle = 'rgba(30, 66, 54, 0.46)';
        aCtx.fillRect(x + 2, y + rowH - 8, colW * 0.44, 7);
      }
    }
  }

  for (let i = 0; i < 3200; i++) {
    const px = hash2(i, 1.3) * size;
    const py = hash2(i, 9.7) * size;
    const r = 1 + hash2(i, 4.1) * 3.0;
    const light = hash2(i, 6.2) > 0.5;
    aCtx.fillStyle = light ? 'rgba(170,192,214,0.05)' : 'rgba(8,12,18,0.12)';
    aCtx.fillRect(px, py, r, r);
  }

  const wrap = (c: HTMLCanvasElement, srgb: boolean) => {
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(9, 9);
    tex.anisotropy = 8;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  return {
    map: wrap(albedoC, true),
    bumpMap: wrap(bumpC, false),
    roughnessMap: wrap(roughC, false),
  };
}

/**
 * Carved moonlit jade-stone bridge deck maps with subtle side key-fret inlays
 * and disciplined satin roughness (0.58-0.88) for corridor bridges.
 */
export function createJadeBridgeDeckMaps(): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const w = 512;
  const h = 512;
  const albedoC = document.createElement('canvas');
  const bumpC = document.createElement('canvas');
  const roughC = document.createElement('canvas');
  albedoC.width = bumpC.width = roughC.width = w;
  albedoC.height = bumpC.height = roughC.height = h;

  const aCtx = albedoC.getContext('2d')!;
  const bCtx = bumpC.getContext('2d')!;
  const rCtx = roughC.getContext('2d')!;

  aCtx.fillStyle = '#334654';
  aCtx.fillRect(0, 0, w, h);
  bCtx.fillStyle = '#868686';
  bCtx.fillRect(0, 0, w, h);
  rCtx.fillStyle = '#c8c8c8';
  rCtx.fillRect(0, 0, w, h);

  const rows = 8;
  const rowH = h / rows;
  for (let row = 0; row < rows; row++) {
    const y = row * rowH;
    const hVal = hash2(row * 5, 11.3);
    const tone = Math.floor(54 + hVal * 18);
    aCtx.fillStyle = `rgb(${tone},${Math.floor(tone * 1.28 + 10)},${Math.floor(tone * 1.38 + 16)})`;
    aCtx.fillRect(28, y + 3, w - 56, rowH - 6);

    // Center spine stone seam & jade runner trim
    aCtx.strokeStyle = 'rgba(14, 22, 30, 0.55)';
    aCtx.lineWidth = 4;
    aCtx.strokeRect(28, y + 2, w - 56, rowH - 4);
    aCtx.strokeStyle = 'rgba(130, 214, 212, 0.18)';
    aCtx.lineWidth = 2;
    aCtx.strokeRect(34, y + 6, w - 68, rowH - 12);

    const bVal = Math.floor(156 + hVal * 52);
    bCtx.fillStyle = `rgb(${bVal},${bVal},${bVal})`;
    bCtx.fillRect(28, y + 3, w - 56, rowH - 6);
    bCtx.strokeStyle = '#202020';
    bCtx.lineWidth = 4;
    bCtx.strokeRect(28, y + 2, w - 56, rowH - 4);

    const rVal = Math.floor(152 + hVal * 48);
    rCtx.fillStyle = `rgb(${rVal},${rVal},${rVal})`;
    rCtx.fillRect(28, y + 3, w - 56, rowH - 6);
  }

  // Carved side border runners
  for (const bx of [0, w - 26]) {
    aCtx.fillStyle = '#283644';
    aCtx.fillRect(bx, 0, 26, h);
    aCtx.strokeStyle = 'rgba(218, 184, 108, 0.42)';
    aCtx.lineWidth = 2;
    aCtx.strokeRect(bx + 3, 2, 20, h - 4);
    bCtx.fillStyle = '#b4b4b4';
    bCtx.fillRect(bx, 0, 26, h);
    rCtx.fillStyle = '#b0b0b0';
    rCtx.fillRect(bx, 0, 26, h);
  }

  for (let i = 0; i < 1800; i++) {
    const px = hash2(i, 2.9) * w;
    const py = hash2(i, 7.3) * h;
    aCtx.fillStyle = hash2(i, 4.7) > 0.5 ? 'rgba(190,235,235,0.04)' : 'rgba(8,14,20,0.10)';
    aCtx.fillRect(px, py, 2, 2);
  }

  const wrap = (c: HTMLCanvasElement, srgb: boolean) => {
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 2.2);
    tex.anisotropy = 8;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  return {
    map: wrap(albedoC, true),
    bumpMap: wrap(bumpC, false),
    roughnessMap: wrap(roughC, false),
  };
}

export function createCarvedStoneTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#3a4656';
  ctx.fillRect(0, 0, w, h);

  for (let y = 0; y < h; y += 64) {
    const v = Math.floor(54 + hash2(y, 2.7) * 20);
    ctx.fillStyle = `rgb(${v},${v + 8},${v + 18})`;
    ctx.fillRect(0, y + 2, w, 60);
    ctx.fillStyle = '#181e28';
    ctx.fillRect(0, y, w, 3);
  }

  const drawFret = (y0: number) => {
    ctx.strokeStyle = 'rgba(14, 18, 24, 0.55)';
    ctx.lineWidth = 5;
    ctx.strokeRect(8, y0 + 2, w - 16, 42);
    ctx.strokeStyle = 'rgba(222, 184, 108, 0.54)';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, y0, w - 16, 42);
    for (let x = 18; x < w - 24; x += 28) {
      ctx.strokeRect(x, y0 + 8, 18, 26);
      ctx.strokeRect(x + 5, y0 + 14, 8, 14);
    }
  };
  drawFret(32);
  drawFret(h - 76);

  for (let i = 0; i < 1200; i++) {
    const px = hash2(i, 7.1) * w;
    const py = hash2(i, 12.3) * h;
    ctx.fillStyle = hash2(i, 3.3) > 0.5 ? 'rgba(180,200,220,0.08)' : 'rgba(20,26,34,0.13)';
    ctx.fillRect(px, py, 2, 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createLacquerWoodTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#5a1e1f';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 90; i++) {
    const x = (i / 90) * 256;
    const alpha = 0.04 + hash2(i, 5.1) * 0.08;
    ctx.fillStyle = i % 2 === 0 ? `rgba(128,44,38,${alpha})` : `rgba(28,8,10,${alpha})`;
    ctx.fillRect(x, 0, 3, 256);
  }
  ctx.fillStyle = 'rgba(220, 180, 98, 0.6)';
  ctx.fillRect(0, 14, 256, 5);
  ctx.fillRect(0, 236, 256, 5);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Crisp gold-on-lacquer carved archway plaque reading 「锁妖剑台」. */
export function createArchwayPlaqueTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 192;
  const ctx = c.getContext('2d')!;

  const bg = ctx.createLinearGradient(0, 0, 0, 192);
  bg.addColorStop(0, '#1e1416');
  bg.addColorStop(0.5, '#33171a');
  bg.addColorStop(1, '#1a1114');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 192);

  // Double antique gold carved frame
  ctx.strokeStyle = '#dfb864';
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, 496, 176);
  ctx.strokeStyle = 'rgba(246, 218, 145, 0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, 472, 152);

  // Corner cloud ornaments
  ctx.fillStyle = '#dfb864';
  for (const [cx, cy] of [[26, 26], [486, 26], [26, 166], [486, 166]]) {
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  // Carved gilded calligraphy
  ctx.font = 'bold 88px "STKaiti", "KaiTi", "Songti SC", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillText('锁 妖 剑 台', 259, 102);
  const gold = ctx.createLinearGradient(0, 50, 0, 140);
  gold.addColorStop(0, '#fff2c2');
  gold.addColorStop(0.5, '#e2bd68');
  gold.addColorStop(1, '#a97f32');
  ctx.fillStyle = gold;
  ctx.fillText('锁 妖 剑 台', 256, 98);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft radial circular sprite texture so ambient particles are luminous orbs/petals, never squares. */
export function createSoftParticleTexture(kind: 'orb' | 'petal'): THREE.CanvasTexture {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  if (kind === 'orb') {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    g.addColorStop(0.35, 'rgba(220, 250, 240, 0.72)');
    g.addColorStop(0.75, 'rgba(120, 215, 200, 0.18)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  } else {
    // Organic curved peach blossom petal silhouette
    ctx.save();
    ctx.translate(32, 32);
    ctx.rotate(-0.45);
    const g = ctx.createRadialGradient(0, -4, 2, 0, 0, 24);
    g.addColorStop(0, 'rgba(255, 240, 245, 0.98)');
    g.addColorStop(0.65, 'rgba(248, 186, 206, 0.85)');
    g.addColorStop(1, 'rgba(218, 128, 158, 0.0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createXiaoyaoRobeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;

  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#eef3f7');
  g.addColorStop(0.45, '#d6e4ee');
  g.addColorStop(0.55, '#254a78');
  g.addColorStop(1, '#19355a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let y = 0; y < 256; y += 8) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }
  ctx.fillStyle = '#d4af63';
  ctx.fillRect(0, 234, 256, 7);
  ctx.strokeStyle = '#f2d896';
  ctx.lineWidth = 2;
  for (let x = 8; x < 248; x += 24) {
    ctx.strokeRect(x, 214, 14, 14);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createShushanSkyDome(panoramaUrl?: string): THREE.Mesh {
  const geo = new THREE.SphereGeometry(140, 48, 32);

  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uPanorama: { value: null as THREE.Texture | null },
      uHasPanorama: { value: 0 },
      uMoonDir: { value: new THREE.Vector3(-0.35, 0.32, -0.88).normalize() },
      uSkyTint: { value: new THREE.Color('#ffffff') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      varying vec2 vUv;
      void main() {
        vDir = normalize(position);
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform sampler2D uPanorama;
      uniform float uHasPanorama;
      uniform vec3 uMoonDir;
      uniform vec3 uSkyTint;
      varying vec3 vDir;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p *= 2.04;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 d = normalize(vDir);
        vec3 zenith = vec3(0.025, 0.048, 0.112);
        vec3 midSky = vec3(0.072, 0.135, 0.228);
        vec3 horizon = vec3(0.135, 0.225, 0.31);
        vec3 below = vec3(0.05, 0.088, 0.145);
        vec3 col = d.y >= 0.0
          ? mix(horizon, mix(midSky, zenith, smoothstep(0.08, 0.72, d.y)), smoothstep(0.0, 0.38, d.y))
          : mix(horizon, below, smoothstep(0.0, -0.35, d.y));

        if (d.y > -0.05) {
          vec2 cuv = d.xz / (max(d.y, 0.08) + 0.22) * 1.4 + vec2(uTime * 0.008, 0.0);
          float cl = fbm(cuv * 1.7);
          float clMask = smoothstep(0.46, 0.78, cl) * smoothstep(-0.02, 0.25, d.y) * smoothstep(0.95, 0.22, d.y);
          col = mix(col, vec3(0.30, 0.45, 0.56), clMask * 0.40);
        }

        float mDot = max(dot(d, normalize(uMoonDir)), 0.0);
        float moonHalo = pow(mDot, 16.0) * 0.40 + pow(mDot, 90.0) * 0.56;
        float moonDisc = smoothstep(0.9968, 0.9984, mDot);
        col += vec3(0.52, 0.75, 0.88) * moonHalo;
        col = mix(col, vec3(1.06, 1.05, 0.94), moonDisc);

        if (uHasPanorama > 0.5) {
          vec3 pano = texture2D(uPanorama, vUv).rgb;
          col = mix(col, pano * 0.98, 0.76);
          col += vec3(0.40, 0.63, 0.78) * moonHalo * 0.26;
        }

        gl_FragColor = vec4(col * uSkyTint, 1.0);
      }
    `,
  });

  if (panoramaUrl) {
    const loader = new THREE.TextureLoader();
    loader.load(
      panoramaUrl,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        mat.uniforms.uPanorama.value = tex;
        mat.uniforms.uHasPanorama.value = 1;
      },
      undefined,
      () => {},
    );
  }

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Stratified emerald-slate cliff rock maps for Shushan canyon walls.
 */
export function createCanyonCliffMaps(): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const size = 512;
  const albedoC = document.createElement('canvas');
  const bumpC = document.createElement('canvas');
  const roughC = document.createElement('canvas');
  albedoC.width = bumpC.width = roughC.width = size;
  albedoC.height = bumpC.height = roughC.height = size;

  const aCtx = albedoC.getContext('2d')!;
  const bCtx = bumpC.getContext('2d')!;
  const rCtx = roughC.getContext('2d')!;

  aCtx.fillStyle = '#1f2d38';
  aCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);
  rCtx.fillStyle = '#dcdcdc';
  rCtx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 14) {
    const h = hash2(y, 3.7);
    const strataH = 8 + Math.floor(h * 10);
    const base = Math.floor(28 + h * 26);
    const r = base;
    const g = Math.floor(base * 1.24 + (h > 0.62 ? 12 : 4));
    const b = Math.floor(base * 1.32 + 10);

    aCtx.fillStyle = `rgb(${r},${g},${b})`;
    aCtx.fillRect(0, y, size, strataH);

    aCtx.fillStyle = 'rgba(8, 14, 20, 0.55)';
    aCtx.fillRect(0, y + strataH - 2, size, 3);

    if (h > 0.58) {
      aCtx.fillStyle = `rgba(34, 88, 72, ${(0.28 + h * 0.25).toFixed(2)})`;
      aCtx.fillRect(0, y, size, 4);
    }

    const bVal = Math.floor(105 + h * 110);
    bCtx.fillStyle = `rgb(${bVal},${bVal},${bVal})`;
    bCtx.fillRect(0, y, size, strataH);
    bCtx.fillStyle = '#202020';
    bCtx.fillRect(0, y + strataH - 2, size, 3);

    const rVal = Math.floor(190 + h * 48);
    rCtx.fillStyle = `rgb(${rVal},${rVal},${rVal})`;
    rCtx.fillRect(0, y, size, strataH);
  }

  for (let i = 0; i < 42; i++) {
    const fx = hash2(i, 8.3) * size;
    const fy = hash2(i, 19.1) * size;
    const fh = 32 + hash2(i, 5.4) * 90;
    aCtx.strokeStyle = 'rgba(10, 16, 24, 0.42)';
    aCtx.lineWidth = 2 + hash2(i, 2.2) * 2;
    aCtx.beginPath();
    aCtx.moveTo(fx, fy);
    aCtx.lineTo(fx + (hash2(i, 11.7) - 0.5) * 18, fy + fh);
    aCtx.stroke();

    bCtx.strokeStyle = '#181818';
    bCtx.lineWidth = 3;
    bCtx.beginPath();
    bCtx.moveTo(fx, fy);
    bCtx.lineTo(fx + (hash2(i, 11.7) - 0.5) * 18, fy + fh);
    bCtx.stroke();
  }

  for (let i = 0; i < 2400; i++) {
    const px = hash2(i, 4.9) * size;
    const py = hash2(i, 15.3) * size;
    aCtx.fillStyle = hash2(i, 6.1) > 0.5 ? 'rgba(130, 175, 190, 0.06)' : 'rgba(6, 10, 15, 0.14)';
    aCtx.fillRect(px, py, 2, 2);
  }

  const wrap = (c: HTMLCanvasElement, srgb: boolean) => {
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    tex.anisotropy = 8;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  return {
    map: wrap(albedoC, true),
    bumpMap: wrap(bumpC, false),
    roughnessMap: wrap(roughC, false),
  };
}

/**
 * Wet mossy river-bed pebble & slate maps for the Crossing 0 shallow stream ford.
 */
export function createStreamStoneMaps(): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const size = 512;
  const albedoC = document.createElement('canvas');
  const bumpC = document.createElement('canvas');
  const roughC = document.createElement('canvas');
  albedoC.width = bumpC.width = roughC.width = size;
  albedoC.height = bumpC.height = roughC.height = size;

  const aCtx = albedoC.getContext('2d')!;
  const bCtx = bumpC.getContext('2d')!;
  const rCtx = roughC.getContext('2d')!;

  aCtx.fillStyle = '#18333a';
  aCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#686868';
  bCtx.fillRect(0, 0, size, size);
  rCtx.fillStyle = '#7c7c7c';
  rCtx.fillRect(0, 0, size, size);

  for (let i = 0; i < 420; i++) {
    const px = hash2(i, 1.7) * size;
    const py = hash2(i, 5.9) * size;
    const rx = 8 + hash2(i, 9.1) * 16;
    const ry = 6 + hash2(i, 13.4) * 13;
    const rot = hash2(i, 2.3) * Math.PI;
    const h = hash2(i, 7.7);

    const tone = Math.floor(32 + h * 34);
    aCtx.save();
    aCtx.translate(px, py);
    aCtx.rotate(rot);
    aCtx.fillStyle = h > 0.72
      ? `rgb(${tone},${Math.floor(tone * 1.42)},${Math.floor(tone * 1.24)})`
      : `rgb(${tone},${Math.floor(tone * 1.24)},${Math.floor(tone * 1.38)})`;
    aCtx.beginPath();
    aCtx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    aCtx.fill();
    aCtx.strokeStyle = 'rgba(10, 22, 28, 0.55)';
    aCtx.lineWidth = 2;
    aCtx.stroke();
    aCtx.restore();

    const bVal = Math.floor(135 + h * 85);
    bCtx.save();
    bCtx.translate(px, py);
    bCtx.rotate(rot);
    bCtx.fillStyle = `rgb(${bVal},${bVal},${bVal})`;
    bCtx.beginPath();
    bCtx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    bCtx.fill();
    bCtx.restore();

    const rVal = Math.floor(88 + h * 62);
    rCtx.save();
    rCtx.translate(px, py);
    rCtx.rotate(rot);
    rCtx.fillStyle = `rgb(${rVal},${rVal},${rVal})`;
    rCtx.beginPath();
    rCtx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    rCtx.fill();
    rCtx.restore();
  }

  const wrap = (c: HTMLCanvasElement, srgb: boolean) => {
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3.5);
    tex.anisotropy = 8;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  return {
    map: wrap(albedoC, true),
    bumpMap: wrap(bumpC, false),
    roughnessMap: wrap(roughC, false),
  };
}

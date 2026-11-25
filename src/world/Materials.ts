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
      const tone = Math.floor(42 + h * 24);
      const green = Math.floor(tone * 1.08 + 2);
      const blue = Math.floor(tone * 1.2 + 6);

      aCtx.fillStyle = `rgb(${tone},${green},${blue})`;
      aCtx.fillRect(x + 3, y + 3, colW - 6, rowH - 6);

      aCtx.strokeStyle = `rgba(155, 178, 200, ${(0.06 + h * 0.06).toFixed(3)})`;
      aCtx.lineWidth = 2;
      aCtx.strokeRect(x + 5, y + 5, colW - 10, rowH - 10);

      const bVal = Math.floor(140 + h * 65);
      bCtx.fillStyle = `rgb(${bVal},${bVal},${bVal})`;
      bCtx.fillRect(x + 3, y + 3, colW - 6, rowH - 6);

      // Disciplined stone roughness (182..242 -> roughness 0.71..0.95) prevents whiteout glare
      const rVal = Math.floor(186 + h * 54);
      rCtx.fillStyle = `rgb(${rVal},${rVal},${rVal})`;
      rCtx.fillRect(x + 3, y + 3, colW - 6, rowH - 6);

      aCtx.strokeStyle = '#161c24';
      aCtx.lineWidth = 5;
      aCtx.strokeRect(x, y, colW, rowH);
      bCtx.strokeStyle = '#202020';
      bCtx.lineWidth = 5;
      bCtx.strokeRect(x, y, colW, rowH);

      if (h > 0.7) {
        aCtx.fillStyle = 'rgba(38, 68, 52, 0.48)';
        aCtx.fillRect(x + 2, y + rowH - 8, colW * 0.42, 7);
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

export function createCarvedStoneTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#485362';
  ctx.fillRect(0, 0, w, h);

  for (let y = 0; y < h; y += 64) {
    const v = Math.floor(64 + hash2(y, 2.7) * 20);
    ctx.fillStyle = `rgb(${v},${v + 7},${v + 16})`;
    ctx.fillRect(0, y + 2, w, 60);
    ctx.fillStyle = '#202630';
    ctx.fillRect(0, y, w, 3);
  }

  const drawFret = (y0: number) => {
    ctx.strokeStyle = 'rgba(210, 180, 115, 0.42)';
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
        vec3 zenith = vec3(0.035, 0.06, 0.13);
        vec3 midSky = vec3(0.08, 0.145, 0.24);
        vec3 horizon = vec3(0.15, 0.24, 0.32);
        vec3 below = vec3(0.06, 0.10, 0.16);
        vec3 col = d.y >= 0.0
          ? mix(horizon, mix(midSky, zenith, smoothstep(0.08, 0.72, d.y)), smoothstep(0.0, 0.38, d.y))
          : mix(horizon, below, smoothstep(0.0, -0.35, d.y));

        if (d.y > -0.05) {
          vec2 cuv = d.xz / (max(d.y, 0.08) + 0.22) * 1.4 + vec2(uTime * 0.008, 0.0);
          float cl = fbm(cuv * 1.7);
          float clMask = smoothstep(0.46, 0.78, cl) * smoothstep(-0.02, 0.25, d.y) * smoothstep(0.95, 0.22, d.y);
          col = mix(col, vec3(0.32, 0.46, 0.56), clMask * 0.42);
        }

        float mDot = max(dot(d, normalize(uMoonDir)), 0.0);
        float moonHalo = pow(mDot, 16.0) * 0.42 + pow(mDot, 90.0) * 0.58;
        float moonDisc = smoothstep(0.9968, 0.9984, mDot);
        col += vec3(0.55, 0.76, 0.88) * moonHalo;
        col = mix(col, vec3(1.1, 1.08, 0.95), moonDisc);

        if (uHasPanorama > 0.5) {
          vec3 pano = texture2D(uPanorama, vUv).rgb;
          col = mix(col, pano * 1.05, 0.76);
          col += vec3(0.42, 0.65, 0.78) * moonHalo * 0.28;
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

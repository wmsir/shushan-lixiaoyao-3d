import * as THREE from 'three';

function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

export interface PbrTexSet {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

/**
 * Generates weathered wuxia woven silk-linen fabric maps (albedo + weave bump + roughness)
 * with realistic subtle cloud-brocade fretwork, drapery folds, and hem weathering.
 */
export function createWovenClothPbr(
  baseHex: string,
  secondaryHex: string,
  trimGold = true,
  weatheredHem = true,
): PbrTexSet {
  const size = 512;
  const aC = document.createElement('canvas');
  const bC = document.createElement('canvas');
  const rC = document.createElement('canvas');
  aC.width = bC.width = rC.width = size;
  aC.height = bC.height = rC.height = size;

  const a = aC.getContext('2d')!;
  const b = bC.getContext('2d')!;
  const r = rC.getContext('2d')!;

  // Rich muted vertical gradient (darkening slightly toward lower weathered hem)
  const g = a.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, baseHex);
  g.addColorStop(0.58, secondaryHex);
  g.addColorStop(1, weatheredHem ? '#181e27' : secondaryHex);
  a.fillStyle = g;
  a.fillRect(0, 0, size, size);

  b.fillStyle = '#808080';
  b.fillRect(0, 0, size, size);
  r.fillStyle = '#d4d4d4';
  r.fillRect(0, 0, size, size);

  // Fine woven linen/silk cross-hatch threads
  for (let y = 0; y < size; y += 4) {
    const shade = (y % 8 === 0) ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)';
    a.fillStyle = shade;
    a.fillRect(0, y, size, 2);
    b.fillStyle = (y % 8 === 0) ? 'rgba(215,215,215,0.16)' : 'rgba(55,55,55,0.16)';
    b.fillRect(0, y, size, 2);
  }
  for (let x = 0; x < size; x += 4) {
    a.fillStyle = (x % 8 === 0) ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.045)';
    a.fillRect(x, 0, 2, size);
    b.fillStyle = (x % 8 === 0) ? 'rgba(205,205,205,0.13)' : 'rgba(65,65,65,0.13)';
    b.fillRect(x, 0, 2, size);
  }

  // Soft vertical cloth drapery crease folds
  for (let i = 0; i < 14; i++) {
    const fx = (i / 14) * size + (hash(i, 3.1) - 0.5) * 18;
    const fw = 18 + hash(i, 7.4) * 26;
    const fg = a.createLinearGradient(fx - fw, 0, fx + fw, 0);
    fg.addColorStop(0, 'rgba(0,0,0,0)');
    fg.addColorStop(0.45, 'rgba(5,9,14,0.22)');
    fg.addColorStop(0.65, 'rgba(220,228,236,0.07)');
    fg.addColorStop(1, 'rgba(0,0,0,0)');
    a.fillStyle = fg;
    a.fillRect(fx - fw, 0, fw * 2, size);

    const bg = b.createLinearGradient(fx - fw, 0, fx + fw, 0);
    bg.addColorStop(0, 'rgba(128,128,128,0)');
    bg.addColorStop(0.45, 'rgba(40,40,40,0.55)');
    bg.addColorStop(0.65, 'rgba(215,215,215,0.45)');
    bg.addColorStop(1, 'rgba(128,128,128,0)');
    b.fillStyle = bg;
    b.fillRect(fx - fw, 0, fw * 2, size);
  }

  // Subtle dark-silk cloud scroll damask brocade motif (云锦暗纹)
  a.strokeStyle = 'rgba(215, 224, 232, 0.06)';
  a.lineWidth = 2;
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      const cx = col * 88 + (row % 2) * 44 + 22;
      const cy = row * 84 + 26;
      a.beginPath();
      a.arc(cx, cy, 20, 0.2, Math.PI * 1.45);
      a.stroke();
      a.beginPath();
      a.arc(cx + 12, cy + 8, 12, Math.PI * 0.7, Math.PI * 2.1);
      a.stroke();
    }
  }

  // Tarnished antique-gold embroidered cloud-fretwork border near hem
  if (trimGold) {
    a.fillStyle = 'rgba(176, 142, 74, 0.78)';
    a.fillRect(0, size - 44, size, 5);
    a.fillRect(0, size - 16, size, 4);
    a.strokeStyle = 'rgba(196, 162, 92, 0.72)';
    a.lineWidth = 2.5;
    b.strokeStyle = 'rgba(235, 235, 235, 0.7)';
    b.lineWidth = 3;
    r.fillStyle = '#787878'; // Metallic embroidery is shinier than linen
    r.fillRect(0, size - 46, size, 34);
    for (let x = 10; x < size - 16; x += 32) {
      a.strokeRect(x, size - 36, 20, 16);
      a.strokeRect(x + 5, size - 31, 10, 6);
      b.strokeRect(x, size - 36, 20, 16);
    }
  }

  // Subtle road-dust & wear speckles near hem for grounded realism
  if (weatheredHem) {
    for (let i = 0; i < 1600; i++) {
      const px = hash(i, 1.9) * size;
      const py = size * 0.72 + hash(i, 5.2) * size * 0.28;
      const al = (py - size * 0.72) / (size * 0.28);
      a.fillStyle = `rgba(38, 36, 34, ${(al * 0.28).toFixed(3)})`;
      a.fillRect(px, py, 2 + hash(i, 8.1) * 3, 2);
    }
  }

  const wrap = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return {
    map: wrap(aC, true),
    bumpMap: wrap(bC, false),
    roughnessMap: wrap(rC, false),
  };
}

/**
 * Generates realistic ancient Chinese Mountain-Pattern Lamellar Armor (山文甲)
 * forged dark iron scales with tarnished bronze trim, hammer dents, and edge wear.
 */
export function createLamellarArmorPbr(
  ironBase = '#2e2b36',
  accentBronze = '#9c7c46',
  crimsonEmber = false,
): PbrTexSet {
  const size = 512;
  const aC = document.createElement('canvas');
  const bC = document.createElement('canvas');
  const rC = document.createElement('canvas');
  aC.width = bC.width = rC.width = size;
  aC.height = bC.height = rC.height = size;

  const a = aC.getContext('2d')!;
  const b = bC.getContext('2d')!;
  const r = rC.getContext('2d')!;

  a.fillStyle = '#141218';
  a.fillRect(0, 0, size, size);
  b.fillStyle = '#252525';
  b.fillRect(0, 0, size, size);
  r.fillStyle = '#c0c0c0';
  r.fillRect(0, 0, size, size);

  // Interlocking Chinese Mountain-Pattern (山文甲) lamellar scales
  const cellW = 32;
  const cellH = 26;
  for (let row = 0; row <= size / cellH; row++) {
    const ox = (row % 2) * (cellW * 0.5);
    for (let col = -1; col <= size / cellW + 1; col++) {
      const cx = col * cellW + ox;
      const cy = row * cellH;
      const h = hash(col + row * 17, row * 23);

      // Forged iron scale plate
      a.fillStyle = ironBase;
      a.beginPath();
      a.moveTo(cx, cy - 11);
      a.lineTo(cx + 13, cy + 1);
      a.lineTo(cx + 9, cy + 12);
      a.lineTo(cx - 9, cy + 12);
      a.lineTo(cx - 13, cy + 1);
      a.closePath();
      a.fill();

      // Worn metallic highlight along scale bevel
      a.strokeStyle = h > 0.72 ? accentBronze : 'rgba(182, 190, 206, 0.34)';
      a.lineWidth = 1.6;
      a.stroke();

      // Scale height bump
      const bv = Math.floor(165 + h * 60);
      b.fillStyle = `rgb(${bv},${bv},${bv})`;
      b.beginPath();
      b.moveTo(cx, cy - 10);
      b.lineTo(cx + 12, cy + 1);
      b.lineTo(cx + 8, cy + 11);
      b.lineTo(cx - 8, cy + 11);
      b.lineTo(cx - 12, cy + 1);
      b.closePath();
      b.fill();

      // Shinier worn ridges, rougher recessed crevices
      const rv = Math.floor(68 + h * 58);
      r.fillStyle = `rgb(${rv},${rv},${rv})`;
      r.fillRect(cx - 10, cy - 8, 20, 18);

      // Occasional molten demon fissure glint for Boss armor
      if (crimsonEmber && h > 0.88) {
        a.strokeStyle = 'rgba(218, 56, 48, 0.75)';
        a.lineWidth = 1.5;
        a.beginPath();
        a.moveTo(cx - 8, cy + 11);
        a.lineTo(cx + 8, cy + 11);
        a.stroke();
      }
    }
  }

  // Battle scratches & patina
  for (let i = 0; i < 420; i++) {
    const x1 = hash(i, 2.3) * size;
    const y1 = hash(i, 6.7) * size;
    const ang = hash(i, 9.1) * Math.PI;
    const len = 6 + hash(i, 4.4) * 18;
    a.strokeStyle = 'rgba(200, 206, 218, 0.14)';
    a.lineWidth = 1;
    a.beginPath();
    a.moveTo(x1, y1);
    a.lineTo(x1 + Math.cos(ang) * len, y1 + Math.sin(ang) * len);
    a.stroke();
  }

  const wrap = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return {
    map: wrap(aC, true),
    bumpMap: wrap(bC, false),
    roughnessMap: wrap(rC, false),
  };
}

/**
 * Generates realistic watered Damascus forged steel texture for Chinese jian & demon blades.
 */
export function createForgedSteelPbr(): PbrTexSet {
  const size = 256;
  const aC = document.createElement('canvas');
  const bC = document.createElement('canvas');
  const rC = document.createElement('canvas');
  aC.width = bC.width = rC.width = size;
  aC.height = bC.height = rC.height = size;

  const a = aC.getContext('2d')!;
  const b = bC.getContext('2d')!;
  const r = rC.getContext('2d')!;

  a.fillStyle = '#aeb8c4';
  a.fillRect(0, 0, size, size);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, size, size);
  r.fillStyle = '#525252';
  r.fillRect(0, 0, size, size);

  // Damascus wavy folded-steel grain
  for (let y = 0; y < size; y += 3) {
    a.beginPath();
    b.beginPath();
    for (let x = 0; x <= size; x += 8) {
      const wy = y + Math.sin(x * 0.08 + y * 0.11) * 4.5 + Math.cos(x * 0.17) * 2;
      if (x === 0) {
        a.moveTo(x, wy);
        b.moveTo(x, wy);
      } else {
        a.lineTo(x, wy);
        b.lineTo(x, wy);
      }
    }
    a.strokeStyle = y % 6 === 0 ? 'rgba(235,242,250,0.18)' : 'rgba(38,48,60,0.22)';
    a.lineWidth = 1.5;
    a.stroke();
    b.strokeStyle = y % 6 === 0 ? 'rgba(190,190,190,0.25)' : 'rgba(70,70,70,0.25)';
    b.lineWidth = 1.2;
    b.stroke();
  }

  // Polished razor edge highlights along left/right UV borders
  const edge = a.createLinearGradient(0, 0, size, 0);
  edge.addColorStop(0, 'rgba(245,250,255,0.45)');
  edge.addColorStop(0.25, 'rgba(0,0,0,0)');
  edge.addColorStop(0.5, 'rgba(25,35,45,0.22)');
  edge.addColorStop(0.75, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(245,250,255,0.45)');
  a.fillStyle = edge;
  a.fillRect(0, 0, size, size);

  const wrap = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return {
    map: wrap(aC, true),
    bumpMap: wrap(bC, false),
    roughnessMap: wrap(rC, false),
  };
}

/**
 * High-detail UV-mapped realistic facial skin texture for Li Xiaoyao
 * (replaces protruding cartoon sphere eyes & flat box eyebrows completely!).
 * Sphere/Lathe front face maps around u = 0.25 (+Z front when rotated -PI/2, or u = 0.5).
 * We orient our sculpted Lathe head so u = 0.5 faces directly +Z!
 */
export function createRealisticHeroFaceTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;

  // Natural warm tanned Asian skin gradient with subtle shadow under jaw & temples
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#be8e6e'); // hairline shadow
  bg.addColorStop(0.32, '#ddb090');
  bg.addColorStop(0.68, '#d4a382');
  bg.addColorStop(1, '#a9795c'); // under-chin shadow
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Subtle cheekbone warmth & skin micro-grain
  const cx = w * 0.5;
  for (const s of [-1, 1]) {
    const cheek = ctx.createRadialGradient(cx + s * 46, 286, 4, cx + s * 46, 286, 44);
    cheek.addColorStop(0, 'rgba(188, 108, 86, 0.22)');
    cheek.addColorStop(1, 'rgba(188, 108, 86, 0)');
    ctx.fillStyle = cheek;
    ctx.fillRect(cx - 110, 220, 220, 140);
  }
  for (let i = 0; i < 1800; i++) {
    const px = hash(i, 1.7) * w;
    const py = hash(i, 8.3) * h;
    ctx.fillStyle = hash(i, 3.9) > 0.5 ? 'rgba(255,232,212,0.05)' : 'rgba(92,58,42,0.06)';
    ctx.fillRect(px, py, 2, 2);
  }

  // Dark hair temple & nape base painted cleanly on back/top of UV
  ctx.fillStyle = '#18171a';
  ctx.fillRect(0, 0, w, 152);
  ctx.fillRect(0, 140, 128, 250);
  ctx.fillRect(w - 128, 140, 128, 250);

  // Subtle shaded eye sockets (creates authentic realistic depth around brow & eyes)
  for (const s of [-1, 1]) {
    const ex = cx + s * 32;
    const ey = 256;
    const sock = ctx.createRadialGradient(ex, ey - 2, 4, ex, ey, 28);
    sock.addColorStop(0, 'rgba(98, 64, 48, 0.36)');
    sock.addColorStop(1, 'rgba(98, 64, 48, 0)');
    ctx.fillStyle = sock;
    ctx.beginPath();
    ctx.ellipse(ex, ey, 28, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sword-hero arched eyebrows (剑眉 — crisp, resolute, upward-swept outer tail!)
    ctx.strokeStyle = '#151211';
    ctx.lineWidth = 5.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + s * 10, 232);
    ctx.quadraticCurveTo(cx + s * 31, 222, cx + s * 58, 218);
    ctx.stroke();

    // Realistic almond eye shape (crisp sclera + dark espresso iris + upper lash line + specular glint)
    ctx.fillStyle = '#ebe8e0';
    ctx.beginPath();
    ctx.moveTo(ex - s * 19, ey + 1.5);
    ctx.quadraticCurveTo(ex, ey - 9.5, ex + s * 19, ey - 1.5);
    ctx.quadraticCurveTo(ex, ey + 8, ex - s * 19, ey + 1.5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#241813';
    ctx.beginPath();
    ctx.arc(ex, ey - 0.5, 7.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#090706';
    ctx.beginPath();
    ctx.arc(ex, ey - 0.5, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(252, 254, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(ex - 2.2, ey - 2.8, 1.9, 0, Math.PI * 2);
    ctx.fill();

    // Sharp upper eyelid crease
    ctx.strokeStyle = '#18110e';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(ex - s * 20, ey + 1.5);
    ctx.quadraticCurveTo(ex, ey - 11, ex + s * 20, ey - 2);
    ctx.stroke();
  }

  // Sculpted nose bridge highlight & subtle nostril shadow
  const noseHi = ctx.createLinearGradient(cx, 248, cx, 304);
  noseHi.addColorStop(0, 'rgba(255,235,216,0.28)');
  noseHi.addColorStop(1, 'rgba(255,235,216,0.08)');
  ctx.fillStyle = noseHi;
  ctx.fillRect(cx - 4, 248, 8, 52);

  ctx.fillStyle = 'rgba(95, 58, 42, 0.45)';
  ctx.beginPath();
  ctx.ellipse(cx, 308, 13, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Natural composed lips (muted terracotta-rose, resolute expression)
  ctx.fillStyle = 'rgba(154, 82, 68, 0.72)';
  ctx.beginPath();
  ctx.moveTo(cx - 21, 340);
  ctx.quadraticCurveTo(cx, 334, cx + 21, 340);
  ctx.quadraticCurveTo(cx, 350, cx - 21, 340);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(84, 40, 32, 0.78)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(cx - 20, 341);
  ctx.quadraticCurveTo(cx, 343, cx + 20, 341);
  ctx.stroke();

  // Subtle jawline & chin contour shadow
  ctx.strokeStyle = 'rgba(102, 66, 48, 0.25)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, 300, 74, 0.35, Math.PI - 0.35);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Cracked ancient Nuo-opera funerary demon mask texture (傩面) for the Yin Talisman Caster.
 */
export function createNuoMaskTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;

  // Aged bone-ivory lacquered wood
  ctx.fillStyle = '#c8bfb0';
  ctx.fillRect(0, 0, size, size);

  // Weathered cinnabar & ink traditional Nuo mask face markings
  ctx.fillStyle = '#751f22';
  ctx.fillRect(0, 0, size, 48);
  ctx.strokeStyle = '#241e20';
  ctx.lineWidth = 5;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(128 + s * 16, 98);
    ctx.quadraticCurveTo(128 + s * 44, 80, 128 + s * 66, 94);
    ctx.stroke();
    // Slanted dark hollow eye slits
    ctx.fillStyle = '#120b18';
    ctx.beginPath();
    ctx.ellipse(128 + s * 36, 118, 22, 8, s * -0.22, 0, Math.PI * 2);
    ctx.fill();
    // Crimson cheek swirls
    ctx.strokeStyle = '#8b2426';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(128 + s * 46, 162, 16, 0, Math.PI * 1.5);
    ctx.stroke();
  }
  // Gold-leaf forehead talisman mark
  ctx.fillStyle = '#b99244';
  ctx.fillRect(122, 48, 12, 42);

  // Fine age cracks across lacquer
  ctx.strokeStyle = 'rgba(28, 22, 20, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(64, 32);
  ctx.lineTo(86, 108);
  ctx.lineTo(74, 178);
  ctx.moveTo(192, 54);
  ctx.lineTo(176, 140);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Aged Daoist paper talisman texture (符箓) with ink-brush cinnabar runes. */
export function createTalismanTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#b99c58';
  ctx.fillRect(0, 0, 128, 256);

  // Weathered paper edge burn
  ctx.strokeStyle = '#5c421d';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 120, 248);

  // Cinnabar Daoist cursive rune strokes
  ctx.strokeStyle = '#8f1f1c';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(64, 26);
  ctx.lineTo(64, 226);
  ctx.moveTo(32, 54);
  ctx.lineTo(96, 54);
  ctx.moveTo(38, 86);
  ctx.quadraticCurveTo(64, 108, 92, 86);
  ctx.moveTo(28, 132);
  ctx.lineTo(100, 124);
  ctx.moveTo(42, 164);
  ctx.bezierCurveTo(96, 174, 30, 198, 92, 212);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Realistic stitched dark leather PBR map for bracers, waist belt, boots & grips. */
export function createLeatherPbr(baseHex = '#2a201b'): PbrTexSet {
  const size = 256;
  const aC = document.createElement('canvas');
  const bC = document.createElement('canvas');
  const rC = document.createElement('canvas');
  aC.width = bC.width = rC.width = size;
  aC.height = bC.height = rC.height = size;
  const a = aC.getContext('2d')!;
  const b = bC.getContext('2d')!;
  const r = rC.getContext('2d')!;

  a.fillStyle = baseHex;
  a.fillRect(0, 0, size, size);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, size, size);
  r.fillStyle = '#a8a8a8';
  r.fillRect(0, 0, size, size);

  for (let i = 0; i < 1600; i++) {
    const px = hash(i, 3.7) * size;
    const py = hash(i, 9.2) * size;
    const light = hash(i, 5.5) > 0.5;
    a.fillStyle = light ? 'rgba(135,105,82,0.09)' : 'rgba(10,6,4,0.16)';
    a.fillRect(px, py, 3, 2);
    b.fillStyle = light ? 'rgba(175,175,175,0.22)' : 'rgba(65,65,65,0.22)';
    b.fillRect(px, py, 3, 2);
  }

  // Crossed strap wrap seams
  a.strokeStyle = 'rgba(15, 10, 8, 0.5)';
  a.lineWidth = 4;
  for (let y = 32; y < size; y += 44) {
    a.beginPath();
    a.moveTo(0, y);
    a.lineTo(size, y + 14);
    a.stroke();
  }

  const wrap = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return {
    map: wrap(aC, true),
    bumpMap: wrap(bC, false),
    roughnessMap: wrap(rC, false),
  };
}

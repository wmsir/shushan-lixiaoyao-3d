import * as THREE from 'three';
import { clamp, easeOutQuart, lerp, placeLimbSegment, solveTwoBoneIK } from '../utils/math';
import {
  createForgedSteelPbr,
  createLeatherPbr,
  createTalismanTexture,
  createWovenClothPbr,
} from './RealisticTextures';
import {
  createAnatomicalHeadGeometry,
  createArticulatedHandGroup,
  createCurvedHairCardGeo,
  createEarGeometry,
  createHairStrandAlphaTexture,
  createSculptedHumanTorsoGeometry,
} from './HumanSculpt';

import heroFaceUrl from '../assets/hero-face.jpg';
import heroFaceNrmUrl from '../assets/hero-face-nrm.jpg';
import allyFaceUrl from '../assets/ally-face.jpg';
import allyFaceNrmUrl from '../assets/ally-face-nrm.jpg';
import vanguardFaceUrl from '../assets/vanguard-face.jpg';
import vanguardFaceNrmUrl from '../assets/vanguard-face-nrm.jpg';
import priestFaceUrl from '../assets/priest-face.jpg';
import priestFaceNrmUrl from '../assets/priest-face-nrm.jpg';
import eliteFaceUrl from '../assets/elite-face.jpg';
import eliteFaceNrmUrl from '../assets/elite-face-nrm.jpg';
import bossFaceUrl from '../assets/boss-face.jpg';
import bossFaceNrmUrl from '../assets/boss-face-nrm.jpg';
import brocadeUrl from '../assets/hanfu-brocade.jpg';
import brocadeNrmUrl from '../assets/hanfu-brocade-nrm.jpg';
import shanwenUrl from '../assets/shanwen-armor.jpg';
import shanwenNrmUrl from '../assets/shanwen-armor-nrm.jpg';
import ironArmorUrl from '../assets/iron-armor.jpg';
import ironArmorNrmUrl from '../assets/iron-armor-nrm.jpg';

export type CharacterArchetype = 'xiaoyao' | 'ally' | 'bladesman' | 'caster' | 'elite' | 'boss';

export type PoseName =
  | 'idle'
  | 'combatIdle'
  | 'run'
  | 'combo1'
  | 'combo2'
  | 'combo3'
  | 'block'
  | 'parryCounter'
  | 'dodge'
  | 'castQ'
  | 'castE'
  | 'castR'
  | 'drink'
  | 'hit'
  | 'stagger'
  | 'dead'
  | 'enemyWindup'
  | 'enemySlash'
  | 'bossIntro'
  | 'bossSlam';

interface PoseFrame {
  t: number;
  pelvisOffset: [number, number, number];
  torsoPitch: number;
  torsoYaw: number;
  torsoRoll: number;
  headYaw: number;
  rHand: [number, number, number];
  lHand: [number, number, number];
  swordDir: [number, number, number];
  rFoot: [number, number, number];
  lFoot: [number, number, number];
  curve?: 'linear' | 'quart';
}

const COMBO1_FRAMES: PoseFrame[] = [
  { t: 0.0, pelvisOffset: [0, -0.04, 0], torsoPitch: 0.08, torsoYaw: -0.25, torsoRoll: 0, headYaw: 0.15, rHand: [-0.36, 1.06, 0.25], lHand: [0.37, 1.1, 0.3], swordDir: [-0.4, 0.4, 0.8], rFoot: [-0.19, 0, -0.14], lFoot: [0.19, 0, 0.18] },
  { t: 0.24, pelvisOffset: [0.02, -0.1, -0.05], torsoPitch: 0.14, torsoYaw: -0.68, torsoRoll: -0.08, headYaw: 0.55, rHand: [-0.58, 0.8, -0.28], lHand: [0.24, 1.16, 0.35], swordDir: [-0.85, -0.35, -0.4], rFoot: [-0.24, 0, -0.22], lFoot: [0.24, 0, 0.26] },
  { t: 0.36, pelvisOffset: [0.02, -0.11, -0.04], torsoPitch: 0.15, torsoYaw: -0.74, torsoRoll: -0.09, headYaw: 0.62, rHand: [-0.6, 0.76, -0.32], lHand: [0.22, 1.17, 0.36], swordDir: [-0.88, -0.4, -0.32], rFoot: [-0.24, 0, -0.22], lFoot: [0.24, 0, 0.26] },
  { t: 0.58, pelvisOffset: [-0.03, -0.06, 0.14], torsoPitch: 0.18, torsoYaw: 0.64, torsoRoll: 0.09, headYaw: -0.48, rHand: [0.46, 1.4, 0.52], lHand: [0.4, 1.02, -0.18], swordDir: [0.52, 0.62, 0.62], rFoot: [-0.22, 0, 0.32], lFoot: [0.22, 0, -0.18], curve: 'quart' },
  { t: 0.74, pelvisOffset: [-0.04, -0.05, 0.16], torsoPitch: 0.14, torsoYaw: 0.76, torsoRoll: 0.11, headYaw: -0.58, rHand: [0.54, 1.46, 0.42], lHand: [0.42, 0.98, -0.24], swordDir: [0.68, 0.58, 0.44], rFoot: [-0.22, 0, 0.32], lFoot: [0.22, 0, -0.18] },
  { t: 1.0, pelvisOffset: [0, -0.04, 0], torsoPitch: 0.08, torsoYaw: -0.25, torsoRoll: 0, headYaw: 0.15, rHand: [-0.36, 1.06, 0.25], lHand: [0.37, 1.1, 0.3], swordDir: [-0.4, 0.4, 0.8], rFoot: [-0.19, 0, -0.14], lFoot: [0.19, 0, 0.18] },
];

const COMBO2_FRAMES: PoseFrame[] = [
  { t: 0.0, pelvisOffset: [-0.02, -0.05, 0.08], torsoPitch: 0.12, torsoYaw: 0.62, torsoRoll: 0.06, headYaw: -0.45, rHand: [0.48, 1.36, 0.42], lHand: [0.4, 1.02, -0.18], swordDir: [0.6, 0.45, 0.6], rFoot: [-0.22, 0, 0.25], lFoot: [0.22, 0, -0.16] },
  { t: 0.26, pelvisOffset: [-0.04, -0.12, 0.02], torsoPitch: 0.16, torsoYaw: 0.82, torsoRoll: 0.1, headYaw: -0.62, rHand: [0.56, 1.2, 0.16], lHand: [0.44, 1.1, -0.12], swordDir: [0.85, 0.15, -0.2], rFoot: [-0.24, 0, 0.26], lFoot: [0.26, 0, -0.2] },
  { t: 0.38, pelvisOffset: [-0.04, -0.13, 0.02], torsoPitch: 0.17, torsoYaw: 0.88, torsoRoll: 0.11, headYaw: -0.68, rHand: [0.58, 1.18, 0.12], lHand: [0.46, 1.1, -0.1], swordDir: [0.88, 0.1, -0.28], rFoot: [-0.24, 0, 0.26], lFoot: [0.26, 0, -0.2] },
  { t: 0.6, pelvisOffset: [0.05, -0.08, 0.14], torsoPitch: 0.18, torsoYaw: -0.78, torsoRoll: -0.1, headYaw: 0.62, rHand: [-0.56, 1.08, 0.38], lHand: [0.26, 1.18, 0.34], swordDir: [-0.88, 0.06, 0.45], rFoot: [-0.24, 0, -0.22], lFoot: [0.24, 0, 0.32], curve: 'quart' },
  { t: 0.76, pelvisOffset: [0.06, -0.07, 0.14], torsoPitch: 0.15, torsoYaw: -0.88, torsoRoll: -0.12, headYaw: 0.72, rHand: [-0.62, 1.04, 0.22], lHand: [0.24, 1.16, 0.36], swordDir: [-0.92, -0.04, 0.22], rFoot: [-0.24, 0, -0.22], lFoot: [0.24, 0, 0.32] },
  { t: 1.0, pelvisOffset: [0, -0.04, 0], torsoPitch: 0.08, torsoYaw: -0.25, torsoRoll: 0, headYaw: 0.15, rHand: [-0.36, 1.06, 0.25], lHand: [0.37, 1.1, 0.3], swordDir: [-0.4, 0.4, 0.8], rFoot: [-0.19, 0, -0.14], lFoot: [0.19, 0, 0.18] },
];

const COMBO3_FRAMES: PoseFrame[] = [
  { t: 0.0, pelvisOffset: [0, -0.06, 0], torsoPitch: 0.1, torsoYaw: -0.3, torsoRoll: 0, headYaw: 0.22, rHand: [-0.36, 1.1, 0.22], lHand: [0.37, 1.1, 0.3], swordDir: [-0.35, 0.45, 0.8], rFoot: [-0.2, 0, -0.16], lFoot: [0.2, 0, 0.2] },
  { t: 0.28, pelvisOffset: [0, 0.34, 0.06], torsoPitch: -0.22, torsoYaw: -0.15, torsoRoll: 0, headYaw: 0.12, rHand: [-0.14, 1.92, -0.12], lHand: [0.16, 1.88, -0.08], swordDir: [0.0, 0.65, -0.75], rFoot: [-0.22, 0.36, -0.18], lFoot: [0.22, 0.28, 0.18] },
  { t: 0.42, pelvisOffset: [0, 0.42, 0.1], torsoPitch: -0.26, torsoYaw: -0.1, torsoRoll: 0, headYaw: 0.08, rHand: [-0.1, 2.0, -0.16], lHand: [0.12, 1.96, -0.1], swordDir: [0.0, 0.72, -0.68], rFoot: [-0.22, 0.42, -0.15], lFoot: [0.22, 0.35, 0.2] },
  { t: 0.6, pelvisOffset: [0, -0.18, 0.26], torsoPitch: 0.44, torsoYaw: 0.26, torsoRoll: 0.06, headYaw: -0.2, rHand: [-0.12, 0.68, 0.68], lHand: [0.4, 1.1, -0.2], swordDir: [0.05, -0.58, 0.82], rFoot: [-0.24, 0, 0.36], lFoot: [0.24, 0, -0.26], curve: 'quart' },
  { t: 0.78, pelvisOffset: [0, -0.16, 0.26], torsoPitch: 0.38, torsoYaw: 0.32, torsoRoll: 0.06, headYaw: -0.24, rHand: [-0.08, 0.64, 0.66], lHand: [0.42, 1.06, -0.24], swordDir: [0.08, -0.66, 0.75], rFoot: [-0.24, 0, 0.36], lFoot: [0.24, 0, -0.26] },
  { t: 1.0, pelvisOffset: [0, -0.04, 0], torsoPitch: 0.08, torsoYaw: -0.25, torsoRoll: 0, headYaw: 0.15, rHand: [-0.36, 1.06, 0.25], lHand: [0.37, 1.1, 0.3], swordDir: [-0.4, 0.4, 0.8], rFoot: [-0.19, 0, -0.14], lFoot: [0.19, 0, 0.18] },
];

const COUNTER_FRAMES: PoseFrame[] = [
  { t: 0.0, pelvisOffset: [0, -0.12, -0.08], torsoPitch: 0.24, torsoYaw: -0.6, torsoRoll: -0.08, headYaw: 0.5, rHand: [-0.48, 0.98, -0.26], lHand: [0.28, 1.12, 0.32], swordDir: [-0.4, 0.05, 0.9], rFoot: [-0.24, 0, -0.26], lFoot: [0.24, 0, 0.28] },
  { t: 0.3, pelvisOffset: [0, -0.14, 0.32], torsoPitch: 0.36, torsoYaw: 0.55, torsoRoll: 0.1, headYaw: -0.45, rHand: [-0.08, 1.16, 0.86], lHand: [0.44, 1.0, -0.24], swordDir: [0.08, 0.06, 0.99], rFoot: [-0.24, 0, 0.4], lFoot: [0.24, 0, -0.28], curve: 'quart' },
  { t: 0.62, pelvisOffset: [0, -0.06, 0.22], torsoPitch: 0.18, torsoYaw: 0.78, torsoRoll: 0.12, headYaw: -0.6, rHand: [0.52, 1.4, 0.46], lHand: [0.42, 1.02, -0.2], swordDir: [0.68, 0.45, 0.55], rFoot: [-0.24, 0, 0.34], lFoot: [0.24, 0, -0.22], curve: 'quart' },
  { t: 1.0, pelvisOffset: [0, -0.04, 0], torsoPitch: 0.08, torsoYaw: -0.25, torsoRoll: 0, headYaw: 0.15, rHand: [-0.36, 1.06, 0.25], lHand: [0.37, 1.1, 0.3], swordDir: [-0.4, 0.4, 0.8], rFoot: [-0.19, 0, -0.14], lFoot: [0.19, 0, 0.18] },
];

function samplePoseFrames(frames: PoseFrame[], t: number): PoseFrame {
  const ct = clamp(t, 0, 1);
  let i = 0;
  while (i < frames.length - 2 && frames[i + 1].t < ct) i++;
  const a = frames[i];
  const b = frames[i + 1];
  const rawU = b.t > a.t ? clamp((ct - a.t) / (b.t - a.t), 0, 1) : 1;
  const u = b.curve === 'quart' ? easeOutQuart(rawU) : rawU * rawU * (3 - 2 * rawU);
  const lv = (va: [number, number, number], vb: [number, number, number]): [number, number, number] => [
    lerp(va[0], vb[0], u),
    lerp(va[1], vb[1], u),
    lerp(va[2], vb[2], u),
  ];
  return {
    t: ct,
    pelvisOffset: lv(a.pelvisOffset, b.pelvisOffset),
    torsoPitch: lerp(a.torsoPitch, b.torsoPitch, u),
    torsoYaw: lerp(a.torsoYaw, b.torsoYaw, u),
    torsoRoll: lerp(a.torsoRoll, b.torsoRoll, u),
    headYaw: lerp(a.headYaw, b.headYaw, u),
    rHand: lv(a.rHand, b.rHand),
    lHand: lv(a.lHand, b.lHand),
    swordDir: lv(a.swordDir, b.swordDir),
    rFoot: lv(a.rFoot, b.rFoot),
    lFoot: lv(a.lFoot, b.lFoot),
  };
}

function createPleatedSkirtPanelGeo(arcAngle: number, topR: number, botR: number, height: number): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(topR, botR, height, 14, 7, true, -arcAngle * 0.5, arcAngle);
  geo.translate(0, -height * 0.5, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = clamp(-y / height, 0, 1);
    const ang = Math.atan2(x, z);
    const pleat = Math.sin(ang * 15.0) * 0.02 * t + Math.cos(ang * 7.0 + t * 2.0) * 0.008 * t;
    const r = Math.hypot(x, z) + pleat;
    pos.setX(i, Math.sin(ang) * r);
    pos.setZ(i, Math.cos(ang) * r);
  }
  geo.computeVertexNormals();
  return geo;
}

function createLatheLimbGeo(radii: Array<[number, number]>, len: number): THREE.BufferGeometry {
  const pts = radii.map(([r, t]) => new THREE.Vector2(r, (t - 0.5) * len));
  const geo = new THREE.LatheGeometry(pts, 12);
  geo.computeVertexNormals();
  return geo;
}

function createMartialBootGeo(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.044, -0.085);
  shape.lineTo(0.044, -0.085);
  shape.quadraticCurveTo(0.052, 0.03, 0.036, 0.115);
  shape.quadraticCurveTo(0.0, 0.145, -0.036, 0.115);
  shape.quadraticCurveTo(-0.052, 0.03, -0.044, -0.085);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.058,
    bevelEnabled: true,
    bevelThickness: 0.016,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0.035, 0.025);
  geo.computeVertexNormals();
  return geo;
}

function loadTex(url: string, srgb: boolean, repeat = 1): THREE.Texture {
  const tex = new THREE.TextureLoader().load(url);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat > 1) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
  }
  tex.anisotropy = 8;
  return tex;
}

let SHARED_ASSETS: {
  shadow: THREE.CircleGeometry;
  shadowTex: THREE.CanvasTexture;
  heroHead: THREE.BufferGeometry;
  bossHead: THREE.BufferGeometry;
  ear: THREE.BufferGeometry;
  torsoHero: THREE.BufferGeometry;
  torsoBoss: THREE.BufferGeometry;
  pelvis: THREE.BufferGeometry;
  belt: THREE.CylinderGeometry;
  neck: THREE.CylinderGeometry;
  frontSkirt: THREE.BufferGeometry;
  backSkirt: THREE.BufferGeometry;
  sideSkirt: THREE.BufferGeometry;
  capePanel: THREE.BufferGeometry;
  upperArm: THREE.BufferGeometry;
  foreArm: THREE.BufferGeometry;
  thigh: THREE.BufferGeometry;
  shin: THREE.BufferGeometry;
  jointElbow: THREE.SphereGeometry;
  jointKnee: THREE.SphereGeometry;
  jointShoulder: THREE.SphereGeometry;
  boot: THREE.BufferGeometry;
  shoulderDrapery: THREE.BufferGeometry;
  collarStrip: THREE.BoxGeometry;
  hairCardLong: THREE.BufferGeometry;
  hairCardMid: THREE.BufferGeometry;
  hairCardBang: THREE.BufferGeometry;
  hairDark: ReturnType<typeof createHairStrandAlphaTexture>;
  hairSilver: ReturnType<typeof createHairStrandAlphaTexture>;
  heroFaceTex: THREE.Texture;
  heroFaceNrm: THREE.Texture;
  allyFaceTex: THREE.Texture;
  allyFaceNrm: THREE.Texture;
  vanguardFaceTex: THREE.Texture;
  vanguardFaceNrm: THREE.Texture;
  priestFaceTex: THREE.Texture;
  priestFaceNrm: THREE.Texture;
  eliteFaceTex: THREE.Texture;
  eliteFaceNrm: THREE.Texture;
  bossFaceTex: THREE.Texture;
  bossFaceNrm: THREE.Texture;
  brocadeTex: THREE.Texture;
  brocadeNrm: THREE.Texture;
  shanwenTex: THREE.Texture;
  shanwenNrm: THREE.Texture;
  ironArmorTex: THREE.Texture;
  ironArmorNrm: THREE.Texture;
  steelPbr: ReturnType<typeof createForgedSteelPbr>;
  leatherPbr: ReturnType<typeof createLeatherPbr>;
  heroClothLinen: ReturnType<typeof createWovenClothPbr>;
  talismanTex: THREE.CanvasTexture;
} | null = null;

function getSharedAssets() {
  if (!SHARED_ASSETS) {
    const sc = document.createElement('canvas');
    sc.width = 64;
    sc.height = 64;
    const sctx = sc.getContext('2d')!;
    const sg = sctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    sg.addColorStop(0, 'rgba(3, 6, 10, 0.88)');
    sg.addColorStop(0.55, 'rgba(3, 6, 10, 0.44)');
    sg.addColorStop(1, 'rgba(3, 6, 10, 0)');
    sctx.fillStyle = sg;
    sctx.fillRect(0, 0, 64, 64);

    const shGeo = new THREE.SphereGeometry(0.118, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
    shGeo.scale(1.18, 0.64, 1.08);

    SHARED_ASSETS = {
      shadow: new THREE.CircleGeometry(0.64, 20),
      shadowTex: new THREE.CanvasTexture(sc),
      // Pixel-calibrated anatomical 3D heads (scaled slightly fuller + raised lower-face balance!)
      heroHead: createAnatomicalHeadGeometry({
        faceSpanX: 0.264,
        faceSpanY: 0.284,
        uvCenterY: 0.512,
        jawStrength: 1.05,
        browDepth: 0.9,
      }),
      bossHead: createAnatomicalHeadGeometry({
        faceSpanX: 0.28,
        faceSpanY: 0.292,
        uvCenterY: 0.522,
        jawStrength: 1.3,
        browDepth: 1.35,
      }),
      ear: createEarGeometry(),
      torsoHero: createSculptedHumanTorsoGeometry(1.0),
      torsoBoss: createSculptedHumanTorsoGeometry(1.14),
      pelvis: createLatheLimbGeo(
        [
          [0.165, 0.0],
          [0.186, 0.45],
          [0.162, 1.0],
        ],
        0.22,
      ),
      belt: new THREE.CylinderGeometry(0.182, 0.194, 0.11, 18),
      neck: new THREE.CylinderGeometry(0.056, 0.072, 0.092, 12),
      frontSkirt: createPleatedSkirtPanelGeo(1.08, 0.196, 0.305, 0.63),
      backSkirt: createPleatedSkirtPanelGeo(1.48, 0.2, 0.36, 0.7),
      sideSkirt: createPleatedSkirtPanelGeo(0.86, 0.195, 0.295, 0.57),
      capePanel: createPleatedSkirtPanelGeo(1.42, 0.25, 0.55, 1.22),
      upperArm: createLatheLimbGeo(
        [
          [0.056, 0.0],
          [0.061, 0.45],
          [0.075, 0.88],
          [0.062, 1.0],
        ],
        0.33,
      ),
      foreArm: createLatheLimbGeo(
        [
          [0.044, 0.0],
          [0.051, 0.35],
          [0.069, 0.75],
          [0.058, 1.0],
        ],
        0.31,
      ),
      thigh: createLatheLimbGeo(
        [
          [0.065, 0.0],
          [0.08, 0.45],
          [0.094, 0.9],
          [0.08, 1.0],
        ],
        0.47,
      ),
      shin: createLatheLimbGeo(
        [
          [0.046, 0.0],
          [0.058, 0.38],
          [0.068, 0.78],
          [0.062, 1.0],
        ],
        0.47,
      ),
      jointShoulder: new THREE.SphereGeometry(0.076, 10, 8),
      jointElbow: new THREE.SphereGeometry(0.056, 10, 8),
      jointKnee: new THREE.SphereGeometry(0.066, 10, 8),
      boot: createMartialBootGeo(),
      shoulderDrapery: shGeo,
      collarStrip: new THREE.BoxGeometry(0.048, 0.36, 0.028),
      hairCardLong: createCurvedHairCardGeo(0.42, 0.095, 0.16, 0.025),
      hairCardMid: createCurvedHairCardGeo(0.24, 0.072, 0.08, 0.015),
      hairCardBang: createCurvedHairCardGeo(0.085, 0.044, 0.015, 0.01),
      hairDark: createHairStrandAlphaTexture('#161418', '#3c3944'),
      hairSilver: createHairStrandAlphaTexture('#2b2a32', '#9ea4b2'),
      heroFaceTex: loadTex(heroFaceUrl, true, 1),
      heroFaceNrm: loadTex(heroFaceNrmUrl, false, 1),
      allyFaceTex: loadTex(allyFaceUrl, true, 1),
      allyFaceNrm: loadTex(allyFaceNrmUrl, false, 1),
      vanguardFaceTex: loadTex(vanguardFaceUrl, true, 1),
      vanguardFaceNrm: loadTex(vanguardFaceNrmUrl, false, 1),
      priestFaceTex: loadTex(priestFaceUrl, true, 1),
      priestFaceNrm: loadTex(priestFaceNrmUrl, false, 1),
      eliteFaceTex: loadTex(eliteFaceUrl, true, 1),
      eliteFaceNrm: loadTex(eliteFaceNrmUrl, false, 1),
      bossFaceTex: loadTex(bossFaceUrl, true, 1),
      bossFaceNrm: loadTex(bossFaceNrmUrl, false, 1),
      brocadeTex: loadTex(brocadeUrl, true, 2),
      brocadeNrm: loadTex(brocadeNrmUrl, false, 2),
      shanwenTex: loadTex(shanwenUrl, true, 2),
      shanwenNrm: loadTex(shanwenNrmUrl, false, 2),
      ironArmorTex: loadTex(ironArmorUrl, true, 2),
      ironArmorNrm: loadTex(ironArmorNrmUrl, false, 2),
      steelPbr: createForgedSteelPbr(),
      leatherPbr: createLeatherPbr('#261d18'),
      heroClothLinen: createWovenClothPbr('#cfc9be', '#9f9d96', false, true),
      talismanTex: createTalismanTexture(),
    };
  }
  return SHARED_ASSETS;
}

export class CharacterRig {
  readonly root = new THREE.Group();
  readonly bodyGroup = new THREE.Group();
  readonly weaponHandMount = new THREE.Group();
  readonly weaponBackMount = new THREE.Group();
  readonly weaponMesh: THREE.Group;
  readonly weaponTipLocal = new THREE.Vector3(0, 1.25, 0);
  readonly scale: number;
  readonly archetype: CharacterArchetype;

  private readonly pelvis = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();

  private readonly rUpperArm: THREE.Mesh;
  private readonly rForeArm: THREE.Mesh;
  private readonly lUpperArm: THREE.Mesh;
  private readonly lForeArm: THREE.Mesh;
  private readonly rThigh: THREE.Mesh;
  private readonly rShin: THREE.Mesh;
  private readonly lThigh: THREE.Mesh;
  private readonly lShin: THREE.Mesh;

  // Seamless anatomical joint bridge meshes (eliminates cylinder gaps at shoulders/elbows/knees!)
  private readonly rShoulderCap: THREE.Mesh;
  private readonly lShoulderCap: THREE.Mesh;
  private readonly rElbowCap: THREE.Mesh;
  private readonly lElbowCap: THREE.Mesh;
  private readonly rKneeCap: THREE.Mesh;
  private readonly lKneeCap: THREE.Mesh;

  private readonly rHandGroup: THREE.Group;
  private readonly lHandGroup: THREE.Group;
  private readonly rFootMesh: THREE.Mesh;
  private readonly lFootMesh: THREE.Mesh;

  private readonly ribbonSegs: THREE.Mesh[][] = [];
  private readonly skirtPanels: THREE.Object3D[] = [];
  private readonly capeMesh?: THREE.Mesh;
  private readonly floatingOrbitals: THREE.Object3D[] = [];
  private readonly weaponGlowMat: THREE.MeshStandardMaterial;
  private readonly flashMats: THREE.MeshStandardMaterial[] = [];
  private readonly gourdMesh?: THREE.Group;
  private readonly gourdHipMount?: THREE.Group;

  private weaponDrawn = true;
  private hitFlash = 0;
  private ribbonPhase = 0;
  private phase2Active = false;

  private readonly _rShoulder = new THREE.Vector3();
  private readonly _lShoulder = new THREE.Vector3();
  private readonly _rHip = new THREE.Vector3();
  private readonly _lHip = new THREE.Vector3();
  private readonly _rTarget = new THREE.Vector3();
  private readonly _lTarget = new THREE.Vector3();
  private readonly _rPole = new THREE.Vector3();
  private readonly _lPole = new THREE.Vector3();
  private readonly _mid = new THREE.Vector3();
  private readonly _end = new THREE.Vector3();
  private readonly _dir = new THREE.Vector3();
  private readonly _upY = new THREE.Vector3(0, 1, 0);

  private readonly hipY = 0.94;
  private readonly shoulderX = 0.23;
  private readonly hipX = 0.125;
  private readonly upperArmLen = 0.32;
  private readonly foreArmLen = 0.3;
  private readonly thighLen = 0.46;
  private readonly shinLen = 0.46;

  constructor(archetype: CharacterArchetype) {
    const assets = getSharedAssets();
    this.archetype = archetype;
    this.scale =
      archetype === 'boss'
        ? 1.54
        : archetype === 'elite'
          ? 1.24
          : archetype === 'bladesman'
            ? 1.08
            : archetype === 'caster'
              ? 1.04
              : 1.02;

    this.root.add(this.bodyGroup);
    this.bodyGroup.scale.setScalar(this.scale);

    // Grounded contact shadow
    const shadowMat = new THREE.MeshBasicMaterial({
      map: assets.shadowTex,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
    });
    const shadow = new THREE.Mesh(assets.shadow, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.032;
    this.bodyGroup.add(shadow);

    const palette = this.buildPalette(archetype, assets);
    this.weaponGlowMat = palette.weaponGlow;
    this.flashMats.push(palette.primary, palette.secondary, palette.armor);

    // Pelvis & Belt Assembly
    this.pelvis.position.set(0, this.hipY, 0);
    this.bodyGroup.add(this.pelvis);

    const hipCore = new THREE.Mesh(assets.pelvis, palette.secondary);
    hipCore.castShadow = true;
    this.pelvis.add(hipCore);

    const belt = new THREE.Mesh(assets.belt, palette.leather);
    belt.scale.set(1.06, 1, 0.84);
    belt.position.y = 0.04;
    this.pelvis.add(belt);

    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.076, 0.036), palette.bronze);
    buckle.position.set(0, 0.04, 0.168);
    this.pelvis.add(buckle);

    const sashCord = new THREE.Mesh(new THREE.TorusGeometry(0.188, 0.022, 6, 18), palette.accent);
    sashCord.rotation.x = Math.PI / 2;
    sashCord.scale.set(1.02, 0.85, 1);
    sashCord.position.y = 0.01;
    this.pelvis.add(sashCord);

    // Curved Pleated Robe Coat-Tails / Lamellar War Tassets
    const frontSkirt = new THREE.Mesh(assets.frontSkirt, palette.robeOuter);
    frontSkirt.position.set(0, 0.01, 0);
    frontSkirt.castShadow = true;
    this.pelvis.add(frontSkirt);
    this.skirtPanels.push(frontSkirt);

    const backSkirt = new THREE.Mesh(assets.backSkirt, palette.robeOuter);
    backSkirt.rotation.y = Math.PI;
    backSkirt.position.set(0, 0.01, 0);
    backSkirt.castShadow = true;
    this.pelvis.add(backSkirt);
    this.skirtPanels.push(backSkirt);

    const leftSkirt = new THREE.Mesh(assets.sideSkirt, palette.robeInner);
    leftSkirt.rotation.y = Math.PI / 2;
    leftSkirt.position.set(0, 0.01, 0);
    leftSkirt.castShadow = true;
    this.pelvis.add(leftSkirt);
    this.skirtPanels.push(leftSkirt);

    const rightSkirt = new THREE.Mesh(assets.sideSkirt, palette.robeInner);
    rightSkirt.rotation.y = -Math.PI / 2;
    rightSkirt.position.set(0, 0.01, 0);
    rightSkirt.castShadow = true;
    this.pelvis.add(rightSkirt);
    this.skirtPanels.push(rightSkirt);

    // Sculpted Anatomical Human Torso
    this.torso.position.set(0, 0.09, 0);
    this.pelvis.add(this.torso);

    const isHeroLike = archetype === 'xiaoyao' || archetype === 'ally';
    const chest = new THREE.Mesh(
      archetype === 'boss' || archetype === 'elite' ? assets.torsoBoss : assets.torsoHero,
      isHeroLike ? palette.primary : archetype === 'caster' ? palette.robeOuter : palette.armor,
    );
    chest.castShadow = true;
    chest.receiveShadow = true;
    this.torso.add(chest);

    const collarL = new THREE.Mesh(assets.collarStrip, palette.trim);
    collarL.position.set(-0.042, 0.34, 0.16);
    collarL.rotation.z = 0.38;
    this.torso.add(collarL);
    const collarR = new THREE.Mesh(assets.collarStrip, palette.trim);
    collarR.position.set(0.052, 0.37, 0.154);
    collarR.rotation.z = -0.38;
    this.torso.add(collarR);

    for (const side of [-1, 1]) {
      const sh = new THREE.Mesh(
        assets.shoulderDrapery,
        isHeroLike ? palette.secondary : palette.armor,
      );
      if (isHeroLike) {
        sh.scale.set(0.84, 0.62, 0.86);
        sh.position.set(side * 0.22, 0.46, 0);
        sh.rotation.z = side * -0.22;
      } else if (archetype === 'boss') {
        sh.scale.set(1.56, 1.12, 1.38);
        sh.position.set(side * 0.275, 0.48, 0);
        sh.rotation.z = side * -0.25;
      } else if (archetype === 'elite') {
        sh.scale.set(1.34, 0.98, 1.2);
        sh.position.set(side * 0.255, 0.47, 0);
        sh.rotation.z = side * -0.22;
      } else {
        sh.scale.set(1.12, 0.85, 1.05);
        sh.position.set(side * 0.24, 0.46, 0);
        sh.rotation.z = side * -0.2;
      }
      sh.castShadow = true;
      this.torso.add(sh);
    }

    this.weaponBackMount.position.set(0.04, 0.38, -0.178);
    this.weaponBackMount.rotation.set(0.1, 0, -2.52);
    this.torso.add(this.weaponBackMount);

    this.head.position.set(0, 0.505, 0.016);
    this.torso.add(this.head);
    this.buildHeadDetails(archetype, palette, assets);

    if (isHeroLike || archetype === 'caster') {
      const innerCollar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.072, 0.088, 0.085, 16, 1, true),
        palette.primary,
      );
      innerCollar.position.set(0, 0.545, 0.01);
      this.torso.add(innerCollar);
      const outerCollar = new THREE.Mesh(
        new THREE.TorusGeometry(0.084, 0.016, 8, 18),
        palette.secondary,
      );
      outerCollar.rotation.x = Math.PI / 2 + 0.14;
      outerCollar.position.set(0, 0.525, 0.015);
      this.torso.add(outerCollar);
    } else if (archetype === 'boss' || archetype === 'elite' || archetype === 'bladesman') {
      const gorget = new THREE.Mesh(
        new THREE.CylinderGeometry(0.095, 0.132, 0.11, 16),
        palette.armor,
      );
      gorget.position.set(0, 0.545, 0.01);
      this.torso.add(gorget);
      const gorgetTrim = new THREE.Mesh(
        new THREE.TorusGeometry(0.098, 0.014, 8, 20),
        palette.bronze,
      );
      gorgetTrim.rotation.x = Math.PI / 2 + 0.1;
      gorgetTrim.position.set(0, 0.59, 0.012);
      this.torso.add(gorgetTrim);
    }

    // Archetype Signature Accessories
    if (isHeroLike) {
      const chestStrap = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.54, 0.026), palette.leather);
      chestStrap.position.set(0.01, 0.29, 0.164);
      chestStrap.rotation.z = -0.58;
      this.torso.add(chestStrap);

      const scabbard = new THREE.Mesh(new THREE.BoxGeometry(0.052, 1.06, 0.024), palette.leather);
      scabbard.position.set(0, 0.44, 0);
      const scabbardChape = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.12, 0.032), palette.bronze);
      scabbardChape.position.set(0, 0.94, 0);
      const scabbardLocket = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.08, 0.034), palette.bronze);
      scabbardLocket.position.set(0, -0.07, 0);
      this.weaponBackMount.add(scabbard, scabbardChape, scabbardLocket);

      const jade = new THREE.Mesh(
        new THREE.TorusGeometry(0.036, 0.012, 6, 14),
        new THREE.MeshStandardMaterial({ color: archetype === 'ally' ? '#70c4b8' : '#4d9286', roughness: 0.28, metalness: 0.12 }),
      );
      jade.position.set(-0.18, -0.06, 0.12);
      this.pelvis.add(jade);

      this.gourdHipMount = new THREE.Group();
      this.gourdHipMount.position.set(0.24, -0.04, -0.1);
      this.pelvis.add(this.gourdHipMount);
      this.gourdMesh = this.buildWineGourd(palette.bronze, palette.accent);
      this.gourdHipMount.add(this.gourdMesh);
    } else if (archetype === 'bladesman') {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.56, 0.026), palette.leather);
      strap.position.set(-0.02, 0.29, 0.166);
      strap.rotation.z = 0.56;
      this.torso.add(strap);
      const mirror = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.095, 0.02, 18), palette.bronze);
      mirror.rotation.x = Math.PI / 2;
      mirror.position.set(0, 0.34, 0.168);
      this.torso.add(mirror);
    } else if (archetype === 'elite') {
      const cape = new THREE.Mesh(assets.capePanel, palette.accent);
      cape.rotation.y = Math.PI;
      cape.position.set(0, 0.48, -0.06);
      cape.castShadow = true;
      this.torso.add(cape);
      this.capeMesh = cape;

      const mirrorBezel = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.015, 10, 26), palette.bronze);
      mirrorBezel.position.set(0, 0.34, 0.172);
      this.torso.add(mirrorBezel);
      const mirrorDisc = new THREE.Mesh(
        new THREE.CircleGeometry(0.098, 22),
        new THREE.MeshStandardMaterial({ color: '#3b1518', roughness: 0.32, metalness: 0.84 }),
      );
      mirrorDisc.position.set(0, 0.34, 0.17);
      this.torso.add(mirrorDisc);
    } else if (archetype === 'caster') {
      const talMat = new THREE.MeshStandardMaterial({
        map: assets.talismanTex,
        emissive: new THREE.Color('#3d2a12'),
        emissiveIntensity: 0.3,
        roughness: 0.88,
        side: THREE.DoubleSide,
      });
      const talGeo = new THREE.PlaneGeometry(0.092, 0.27);
      for (let i = 0; i < 4; i++) {
        const tal = new THREE.Mesh(talGeo, talMat);
        tal.userData.orbitPhase = (i / 4) * Math.PI * 2;
        this.torso.add(tal);
        this.floatingOrbitals.push(tal);
      }
    } else if (archetype === 'boss') {
      // Heavy Draped Dark-Crimson Sovereign War Cape
      const cape = new THREE.Mesh(assets.capePanel, palette.accent);
      cape.rotation.y = Math.PI;
      cape.position.set(0, 0.49, -0.06);
      cape.castShadow = true;
      this.torso.add(cape);
      this.capeMesh = cape;

      // Ornate Oxidized-Bronze Chinese Chest Mirror (护心镜) with recessed molten ember radial core (replaces flat peach octagon!)
      const mirrorBezel = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.017, 12, 32), palette.bronze);
      mirrorBezel.position.set(0, 0.34, 0.172);
      this.torso.add(mirrorBezel);

      const mirrorBack = new THREE.Mesh(
        new THREE.CircleGeometry(0.108, 28),
        new THREE.MeshStandardMaterial({ color: '#1b1114', roughness: 0.35, metalness: 0.85 }),
      );
      mirrorBack.position.set(0, 0.34, 0.17);
      this.torso.add(mirrorBack);

      const emberMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            float r = length(vUv);
            if (r > 1.0) discard;
            float core = exp(-r * r * 5.5);
            float ring = smoothstep(0.09, 0.01, abs(r - 0.68)) * 0.45;
            vec3 col = mix(vec3(0.85, 0.16, 0.14), vec3(1.55, 0.72, 0.25), core);
            gl_FragColor = vec4(col, clamp(core * 0.92 + ring, 0.0, 0.95));
          }
        `,
      });
      const mirrorGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.21), emberMat);
      mirrorGlow.position.set(0, 0.34, 0.175);
      this.torso.add(mirrorGlow);

      // Sleek Translucent Crimson-Gold Spirit Seal Halos + 3 Floating Orbiting Ancient Demon Rune-Swords (国漫 3D 妖王标志剪影!)
      const haloMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.45, 0.42, 0.28),
        transparent: true,
        opacity: 0.58,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const outerHalo = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.015, 8, 40), haloMat);
      outerHalo.position.set(0, 0.54, -0.32);
      this.torso.add(outerHalo);
      this.floatingOrbitals.push(outerHalo);

      const innerHalo = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.011, 8, 32), haloMat);
      innerHalo.position.set(0, 0.54, -0.3);
      this.torso.add(innerHalo);
      this.floatingOrbitals.push(innerHalo);

      // 3 Floating Orbiting Demon Swords in crescent array behind Boss shoulders
      const demonBladeMat = new THREE.MeshStandardMaterial({
        color: '#2b1820',
        emissive: new THREE.Color('#d92c38'),
        emissiveIntensity: 0.85,
        roughness: 0.25,
        metalness: 0.88,
      });
      for (const ang of [-0.72, 0, 0.72]) {
        const sw = new THREE.Group();
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.036, 0.78, 4), demonBladeMat);
        b.scale.set(1, 1, 0.32);
        const g = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.028, 0.035), palette.bronze);
        g.position.y = -0.36;
        sw.add(b, g);
        sw.position.set(Math.sin(ang) * 0.68, 0.72 + Math.cos(ang) * 0.26, -0.36);
        sw.rotation.z = -ang * 0.85;
        this.torso.add(sw);
      }
    }

    // Seamless Limbs + Joint Bridge Caps + Articulated Sculpted Hands
    const upperArmMat = isHeroLike ? palette.primary : palette.armor;
    const foreArmMat = isHeroLike ? palette.leather : palette.armor;
    this.rUpperArm = new THREE.Mesh(assets.upperArm, upperArmMat);
    this.rForeArm = new THREE.Mesh(assets.foreArm, foreArmMat);
    this.lUpperArm = new THREE.Mesh(assets.upperArm, upperArmMat);
    this.lForeArm = new THREE.Mesh(assets.foreArm, foreArmMat);
    this.rThigh = new THREE.Mesh(assets.thigh, palette.pants);
    this.rShin = new THREE.Mesh(assets.shin, archetype === 'boss' || archetype === 'elite' ? palette.armor : palette.leather);
    this.lThigh = new THREE.Mesh(assets.thigh, palette.pants);
    this.lShin = new THREE.Mesh(assets.shin, archetype === 'boss' || archetype === 'elite' ? palette.armor : palette.leather);

    this.rShoulderCap = new THREE.Mesh(assets.jointShoulder, upperArmMat);
    this.lShoulderCap = new THREE.Mesh(assets.jointShoulder, upperArmMat);
    this.rElbowCap = new THREE.Mesh(assets.jointElbow, foreArmMat);
    this.lElbowCap = new THREE.Mesh(assets.jointElbow, foreArmMat);
    this.rKneeCap = new THREE.Mesh(assets.jointKnee, archetype === 'boss' || archetype === 'elite' ? palette.bronze : palette.pants);
    this.lKneeCap = new THREE.Mesh(assets.jointKnee, archetype === 'boss' || archetype === 'elite' ? palette.bronze : palette.pants);

    const handMat = isHeroLike || archetype === 'caster' ? palette.skin : archetype === 'boss' || archetype === 'elite' ? palette.armor : palette.leather;
    this.rHandGroup = createArticulatedHandGroup(handMat, 'grip');
    this.lHandGroup = createArticulatedHandGroup(handMat, isHeroLike ? 'swordFinger' : 'grip');

    this.rFootMesh = new THREE.Mesh(assets.boot, palette.leather);
    this.lFootMesh = new THREE.Mesh(assets.boot, palette.leather);

    for (const m of [
      this.rUpperArm,
      this.rForeArm,
      this.lUpperArm,
      this.lForeArm,
      this.rThigh,
      this.rShin,
      this.lThigh,
      this.lShin,
      this.rShoulderCap,
      this.lShoulderCap,
      this.rElbowCap,
      this.lElbowCap,
      this.rKneeCap,
      this.lKneeCap,
      this.rFootMesh,
      this.lFootMesh,
    ]) {
      m.castShadow = true;
      this.bodyGroup.add(m);
    }
    this.bodyGroup.add(this.rHandGroup, this.lHandGroup);

    this.bodyGroup.add(this.weaponHandMount);
    this.weaponMesh = this.buildWeapon(archetype, palette, assets);
    this.weaponHandMount.add(this.weaponMesh);
    this.setWeaponDrawn(true);
    this.applyPose('combatIdle', 0, 0, 0.016);
  }

  private buildPalette(
    archetype: CharacterArchetype,
    assets: ReturnType<typeof getSharedAssets>,
  ) {
    const bronze = new THREE.MeshStandardMaterial({
      color: '#b49254',
      roughness: 0.4,
      metalness: 0.84,
    });
    const leather = new THREE.MeshStandardMaterial({
      map: assets.leatherPbr.map,
      bumpMap: assets.leatherPbr.bumpMap,
      bumpScale: 0.04,
      roughnessMap: assets.leatherPbr.roughnessMap,
      roughness: 0.82,
      metalness: 0.1,
    });

    // Real Photographic Macro Silk Brocade Material with physical fabric sheen!
    const indigoBrocade = new THREE.MeshPhysicalMaterial({
      map: assets.brocadeTex,
      normalMap: assets.brocadeNrm,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.82,
      metalness: 0.08,
      sheen: 0.45,
      sheenColor: new THREE.Color('#6b88a8'),
      sheenRoughness: 0.72,
      side: THREE.DoubleSide,
    });

    // Real Photographic Macro Tang/Ming Mountain-Pattern Lamellar Iron Armor (山文甲)!
    const shanwenArmor = new THREE.MeshStandardMaterial({
      map: assets.shanwenTex,
      normalMap: assets.shanwenNrm,
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughness: 0.46,
      metalness: 0.76,
      color: new THREE.Color('#c8c4cc'),
      side: THREE.DoubleSide,
    });

    if (archetype === 'xiaoyao') {
      return {
        primary: new THREE.MeshPhysicalMaterial({
          map: assets.heroClothLinen.map,
          bumpMap: assets.heroClothLinen.bumpMap,
          bumpScale: 0.035,
          roughness: 0.88,
          metalness: 0.03,
          sheen: 0.25,
          sheenColor: new THREE.Color('#e6dfd4'),
          sheenRoughness: 0.82,
        }),
        secondary: indigoBrocade,
        robeOuter: indigoBrocade,
        robeInner: new THREE.MeshPhysicalMaterial({
          map: assets.heroClothLinen.map,
          bumpMap: assets.heroClothLinen.bumpMap,
          bumpScale: 0.035,
          roughness: 0.9,
          metalness: 0.03,
          side: THREE.DoubleSide,
        }),
        armor: leather,
        accent: new THREE.MeshPhysicalMaterial({
          color: '#7d2220',
          roughness: 0.76,
          metalness: 0.04,
          sheen: 0.35,
          sheenColor: new THREE.Color('#b54b44'),
          side: THREE.DoubleSide,
        }),
        trim: new THREE.MeshStandardMaterial({ color: '#1b2c40', roughness: 0.78, metalness: 0.08 }),
        bronze,
        leather,
        // Slightly shaded warm neck matching jaw shadow so head->neck blends seamlessly
        skin: new THREE.MeshPhysicalMaterial({
          color: '#b48668',
          roughness: 0.66,
          metalness: 0.0,
          sheen: 0.22,
          sheenColor: new THREE.Color('#d48e70'),
          sheenRoughness: 0.7,
          emissive: new THREE.Color('#1c0e08'),
          emissiveIntensity: 0.12,
        }),
        // 3D Donghua Anime Luminous Porcelain Face Material (silky cel sheen + crisp rim lift)
        faceMat: new THREE.MeshPhysicalMaterial({
          map: assets.heroFaceTex,
          normalMap: assets.heroFaceNrm,
          normalScale: new THREE.Vector2(0.24, 0.24),
          color: new THREE.Color('#fff8f2'),
          roughness: 0.44,
          metalness: 0.0,
          sheen: 0.42,
          sheenColor: new THREE.Color('#bfe8ff'),
          sheenRoughness: 0.5,
          emissive: new THREE.Color('#38241a'),
          emissiveIntensity: 0.34,
        }),
        hair: new THREE.MeshStandardMaterial({
          map: assets.hairDark.map,
          alphaMap: assets.hairDark.alphaMap,
          alphaTest: 0.18,
          roughness: 0.58,
          metalness: 0.14,
          side: THREE.DoubleSide,
        }),
        hairBase: new THREE.MeshStandardMaterial({
          color: '#171518',
          roughness: 0.66,
          metalness: 0.12,
        }),
        pants: new THREE.MeshStandardMaterial({ color: '#1b212a', roughness: 0.88 }),
        weaponGlow: new THREE.MeshStandardMaterial({
          map: assets.steelPbr.map,
          color: '#bfe6ee',
          emissive: new THREE.Color('#2ca2b8'),
          emissiveIntensity: 0.48,
          roughness: 0.28,
          metalness: 0.88,
        }),
      };
    }

    const ironArmor = new THREE.MeshStandardMaterial({
      map: assets.ironArmorTex,
      normalMap: assets.ironArmorNrm,
      normalScale: new THREE.Vector2(1.25, 1.25),
      roughness: 0.38,
      metalness: 0.72,
      color: new THREE.Color('#cfd6df'),
      side: THREE.DoubleSide,
    });

    if (archetype === 'ally') {
      const silverBrocade = indigoBrocade.clone();
      silverBrocade.color.set('#7aa0b8');
      return {
        primary: new THREE.MeshPhysicalMaterial({
          map: assets.heroClothLinen.map,
          bumpMap: assets.heroClothLinen.bumpMap,
          bumpScale: 0.035,
          color: '#253548',
          roughness: 0.84,
          metalness: 0.05,
          sheen: 0.35,
          sheenColor: new THREE.Color('#8cbcd4'),
          sheenRoughness: 0.75,
        }),
        secondary: silverBrocade,
        robeOuter: silverBrocade,
        robeInner: new THREE.MeshPhysicalMaterial({
          map: assets.heroClothLinen.map,
          color: '#d4dfe8',
          roughness: 0.88,
          side: THREE.DoubleSide,
        }),
        armor: leather,
        accent: new THREE.MeshPhysicalMaterial({
          color: '#1e6e68',
          roughness: 0.72,
          metalness: 0.06,
          sheen: 0.4,
          sheenColor: new THREE.Color('#66e0d2'),
          side: THREE.DoubleSide,
        }),
        trim: new THREE.MeshStandardMaterial({ color: '#c4d4e0', roughness: 0.6, metalness: 0.25 }),
        bronze,
        leather,
        skin: new THREE.MeshPhysicalMaterial({
          color: '#9c7160',
          roughness: 0.64,
          sheen: 0.22,
          sheenColor: new THREE.Color('#cc9480'),
          emissive: new THREE.Color('#1c0f0a'),
          emissiveIntensity: 0.14,
        }),
        faceMat: new THREE.MeshPhysicalMaterial({
          map: assets.allyFaceTex,
          normalMap: assets.allyFaceNrm,
          normalScale: new THREE.Vector2(0.45, 0.45),
          color: new THREE.Color('#fff4ec'),
          roughness: 0.56,
          sheen: 0.24,
          sheenColor: new THREE.Color('#e0a68e'),
          emissive: new THREE.Color('#281812'),
          emissiveIntensity: 0.22,
        }),
        hair: new THREE.MeshStandardMaterial({
          map: assets.hairDark.map,
          alphaMap: assets.hairDark.alphaMap,
          alphaTest: 0.18,
          roughness: 0.56,
          metalness: 0.15,
          side: THREE.DoubleSide,
        }),
        hairBase: new THREE.MeshStandardMaterial({ color: '#14161c', roughness: 0.64, metalness: 0.14 }),
        pants: new THREE.MeshStandardMaterial({ color: '#161e2a', roughness: 0.88 }),
        weaponGlow: new THREE.MeshStandardMaterial({
          map: assets.steelPbr.map,
          color: '#c8f0e8',
          emissive: new THREE.Color('#38c8a8'),
          emissiveIntensity: 0.52,
          roughness: 0.26,
          metalness: 0.9,
        }),
      };
    }

    if (archetype === 'bladesman') {
      return {
        primary: ironArmor,
        secondary: new THREE.MeshStandardMaterial({ color: '#3b1c1e', roughness: 0.8, metalness: 0.14 }),
        robeOuter: ironArmor,
        robeInner: new THREE.MeshStandardMaterial({ color: '#321718', roughness: 0.86, side: THREE.DoubleSide }),
        armor: ironArmor,
        accent: new THREE.MeshPhysicalMaterial({
          color: '#6e201b',
          roughness: 0.78,
          sheen: 0.3,
          sheenColor: new THREE.Color('#a84238'),
          side: THREE.DoubleSide,
        }),
        trim: new THREE.MeshStandardMaterial({ color: '#4d221c', roughness: 0.72 }),
        bronze,
        leather,
        skin: new THREE.MeshPhysicalMaterial({
          color: '#735340',
          roughness: 0.7,
          sheen: 0.18,
          sheenColor: new THREE.Color('#9e745a'),
          emissive: new THREE.Color('#180e08'),
          emissiveIntensity: 0.14,
        }),
        faceMat: new THREE.MeshPhysicalMaterial({
          map: assets.vanguardFaceTex,
          normalMap: assets.vanguardFaceNrm,
          normalScale: new THREE.Vector2(0.7, 0.7),
          color: new THREE.Color('#f4e8de'),
          roughness: 0.62,
          sheen: 0.2,
          sheenColor: new THREE.Color('#c29478'),
          emissive: new THREE.Color('#2c1c12'),
          emissiveIntensity: 0.32,
        }),
        hair: new THREE.MeshStandardMaterial({
          map: assets.hairDark.map,
          alphaMap: assets.hairDark.alphaMap,
          alphaTest: 0.18,
          roughness: 0.68,
          side: THREE.DoubleSide,
        }),
        hairBase: new THREE.MeshStandardMaterial({ color: '#1b1615', roughness: 0.78 }),
        pants: new THREE.MeshStandardMaterial({ color: '#221c1c', roughness: 0.88 }),
        weaponGlow: new THREE.MeshStandardMaterial({
          map: assets.steelPbr.map,
          color: '#d8b298',
          emissive: new THREE.Color('#9c3b1a'),
          emissiveIntensity: 0.42,
          roughness: 0.32,
          metalness: 0.88,
        }),
      };
    }

    if (archetype === 'elite') {
      // Unmistakable Burnished Blood-Crimson Lacquered Lamellar War Armor (血甲剑魔)!
      const eliteArmor = ironArmor.clone();
      eliteArmor.color.set('#c85a60');
      eliteArmor.emissive.set('#3a0d14');
      eliteArmor.emissiveIntensity = 0.28;
      eliteArmor.roughness = 0.34;
      eliteArmor.metalness = 0.68;
      return {
        primary: eliteArmor,
        secondary: new THREE.MeshStandardMaterial({ color: '#4c161d', roughness: 0.76, metalness: 0.22 }),
        robeOuter: eliteArmor,
        robeInner: new THREE.MeshStandardMaterial({ color: '#3b1218', roughness: 0.84, side: THREE.DoubleSide }),
        armor: eliteArmor,
        accent: new THREE.MeshPhysicalMaterial({
          color: '#6d1820',
          roughness: 0.8,
          sheen: 0.35,
          sheenColor: new THREE.Color('#aa3a44'),
          side: THREE.DoubleSide,
        }),
        trim: new THREE.MeshStandardMaterial({ color: '#8a2b2b', roughness: 0.62, metalness: 0.32 }),
        bronze,
        leather,
        skin: new THREE.MeshPhysicalMaterial({
          color: '#765242',
          roughness: 0.68,
          emissive: new THREE.Color('#1a0e0a'),
          emissiveIntensity: 0.16,
        }),
        faceMat: new THREE.MeshPhysicalMaterial({
          map: assets.eliteFaceTex,
          normalMap: assets.eliteFaceNrm,
          normalScale: new THREE.Vector2(0.75, 0.75),
          color: new THREE.Color('#f6ebe4'),
          roughness: 0.58,
          sheen: 0.22,
          sheenColor: new THREE.Color('#cc9682'),
          emissive: new THREE.Color('#2e1c14'),
          emissiveIntensity: 0.32,
        }),
        hair: new THREE.MeshStandardMaterial({
          map: assets.hairDark.map,
          alphaMap: assets.hairDark.alphaMap,
          alphaTest: 0.18,
          roughness: 0.62,
          side: THREE.DoubleSide,
        }),
        hairBase: new THREE.MeshStandardMaterial({ color: '#1a1516', roughness: 0.72 }),
        pants: new THREE.MeshStandardMaterial({ color: '#21191d', roughness: 0.84 }),
        weaponGlow: new THREE.MeshStandardMaterial({
          map: assets.steelPbr.map,
          color: '#e0a292',
          emissive: new THREE.Color('#b82834'),
          emissiveIntensity: 0.72,
          roughness: 0.3,
          metalness: 0.88,
        }),
      };
    }

    if (archetype === 'caster') {
      const casterBrocade = indigoBrocade.clone();
      casterBrocade.color.set('#5e5a74');
      return {
        primary: casterBrocade,
        secondary: new THREE.MeshStandardMaterial({ color: '#2c263b', roughness: 0.82 }),
        robeOuter: casterBrocade,
        robeInner: new THREE.MeshStandardMaterial({ color: '#211d2e', roughness: 0.88, side: THREE.DoubleSide }),
        armor: casterBrocade,
        accent: new THREE.MeshPhysicalMaterial({
          color: '#4e3c6b',
          roughness: 0.78,
          sheen: 0.28,
          sheenColor: new THREE.Color('#8674a8'),
          side: THREE.DoubleSide,
        }),
        trim: new THREE.MeshStandardMaterial({ color: '#6b5c82', roughness: 0.74 }),
        bronze,
        leather,
        skin: new THREE.MeshPhysicalMaterial({
          color: '#887b75',
          roughness: 0.72,
          emissive: new THREE.Color('#181414'),
          emissiveIntensity: 0.14,
        }),
        faceMat: new THREE.MeshPhysicalMaterial({
          map: assets.priestFaceTex,
          normalMap: assets.priestFaceNrm,
          normalScale: new THREE.Vector2(0.72, 0.72),
          color: new THREE.Color('#f0ece8'),
          roughness: 0.62,
          sheen: 0.18,
          sheenColor: new THREE.Color('#b8aea8'),
          emissive: new THREE.Color('#262224'),
          emissiveIntensity: 0.28,
        }),
        hair: new THREE.MeshStandardMaterial({
          map: assets.hairSilver.map,
          alphaMap: assets.hairSilver.alphaMap,
          alphaTest: 0.18,
          roughness: 0.66,
          side: THREE.DoubleSide,
        }),
        hairBase: new THREE.MeshStandardMaterial({ color: '#3b3c44', roughness: 0.74 }),
        pants: new THREE.MeshStandardMaterial({ color: '#191924', roughness: 0.9 }),
        weaponGlow: new THREE.MeshStandardMaterial({
          color: '#a894cc',
          emissive: new THREE.Color('#6a38ba'),
          emissiveIntensity: 0.78,
          roughness: 0.32,
          metalness: 0.56,
        }),
      };
    }

    // Boss: Photorealistic Fallen Warlord / Demon Sovereign with lifelike scarred human-demon visage + macro 山文甲!
    const bossArmor = shanwenArmor.clone();
    bossArmor.color.set('#d8ced8');
    bossArmor.emissive.set('#221118');
    bossArmor.emissiveIntensity = 0.28;

    return {
      primary: bossArmor,
      secondary: new THREE.MeshStandardMaterial({ color: '#541a24', roughness: 0.74, metalness: 0.24 }),
      robeOuter: bossArmor,
      robeInner: new THREE.MeshStandardMaterial({ color: '#47151f', roughness: 0.82, side: THREE.DoubleSide }),
      armor: bossArmor,
      accent: new THREE.MeshPhysicalMaterial({
        color: '#681922',
        roughness: 0.82,
        metalness: 0.06,
        sheen: 0.38,
        sheenColor: new THREE.Color('#a43642'),
        sheenRoughness: 0.72,
        side: THREE.DoubleSide,
      }),
      trim: new THREE.MeshStandardMaterial({ color: '#8f2832', roughness: 0.62, metalness: 0.35 }),
      bronze,
      leather,
      // Darker shadowed ashen neck matching Boss bearded jawline
      skin: new THREE.MeshPhysicalMaterial({
        color: '#625e5e',
        roughness: 0.72,
        emissive: new THREE.Color('#120e12'),
        emissiveIntensity: 0.12,
      }),
      // 3D Donghua Demon Sovereign Face Material (luminous stylized cel-rim contrast so demon crest & blazing eyes pop!)
      faceMat: new THREE.MeshPhysicalMaterial({
        map: assets.bossFaceTex,
        normalMap: assets.bossFaceNrm,
        normalScale: new THREE.Vector2(0.35, 0.35),
        color: new THREE.Color('#f7eee8'),
        roughness: 0.46,
        metalness: 0.02,
        sheen: 0.42,
        sheenColor: new THREE.Color('#ff8a66'),
        emissive: new THREE.Color('#422620'),
        emissiveIntensity: 0.42,
      }),
      hair: new THREE.MeshStandardMaterial({
        map: assets.hairSilver.map,
        alphaMap: assets.hairSilver.alphaMap,
        alphaTest: 0.18,
        roughness: 0.62,
        metalness: 0.12,
        side: THREE.DoubleSide,
      }),
      hairBase: new THREE.MeshStandardMaterial({ color: '#26252c', roughness: 0.72 }),
      pants: new THREE.MeshStandardMaterial({ color: '#221d2b', roughness: 0.76 }),
      weaponGlow: new THREE.MeshStandardMaterial({
        map: assets.steelPbr.map,
        color: '#e59a8e',
        emissive: new THREE.Color('#c4283c'),
        emissiveIntensity: 0.95,
        roughness: 0.28,
        metalness: 0.86,
      }),
    };
  }

  private buildHeadDetails(
    archetype: CharacterArchetype,
    palette: ReturnType<CharacterRig['buildPalette']>,
    assets: ReturnType<typeof getSharedAssets>,
  ): void {
    const neck = new THREE.Mesh(assets.neck, palette.skin);
    neck.position.y = 0.03;
    this.head.add(neck);

    const headScale = archetype === 'boss' || archetype === 'elite' || archetype === 'xiaoyao' || archetype === 'ally' ? 1.1 : 1.08;
    const headGeo = archetype === 'boss' || archetype === 'elite' || archetype === 'bladesman' ? assets.bossHead : assets.heroHead;
    const skull = new THREE.Mesh(headGeo, palette.faceMat);
    skull.scale.setScalar(headScale);
    skull.position.y = 0.145;
    skull.castShadow = true;
    this.head.add(skull);

    // Subtle 3D Donghua Anime Inked Silhouette Contour Shell around Hero / Ally / Boss heads!
    if (archetype === 'xiaoyao' || archetype === 'ally' || archetype === 'boss') {
      const inkMat = new THREE.MeshBasicMaterial({
        color: archetype === 'boss' ? '#1c090e' : '#121b2b',
        side: THREE.BackSide,
      });
      const outline = new THREE.Mesh(headGeo, inkMat);
      outline.scale.setScalar(headScale * 1.036);
      outline.position.y = 0.145;
      this.head.add(outline);
    }

    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(assets.ear, palette.skin);
      ear.position.set(s * 0.09, 0.142, -0.008);
      ear.rotation.y = s * 0.28;
      this.head.add(ear);
    }

    if (archetype === 'xiaoyao' || archetype === 'ally') {
      const crown = new THREE.Mesh(
        new THREE.SphereGeometry(0.104, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
        palette.hairBase,
      );
      crown.scale.set(0.96, 1.02, 1.15);
      crown.position.set(0, 0.172, -0.02);
      crown.rotation.x = -0.22;
      this.head.add(crown);

      const bangSpecs: Array<[number, number, number, number, number, number]> = [
        [-0.082, 0.236, 0.06, 0.05, 0.35, 0.42],
        [0.082, 0.236, 0.06, 0.05, -0.35, -0.42],
        [-0.094, 0.214, 0.022, 0.12, 0.65, 0.18],
        [0.094, 0.214, 0.022, 0.12, -0.65, -0.18],
      ];
      for (const [bx, by, bz, rx, ry, rz] of bangSpecs) {
        const card = new THREE.Mesh(assets.hairCardBang, palette.hair);
        card.position.set(bx, by, bz);
        card.rotation.set(rx, ry, rz);
        this.head.add(card);
      }

      const sideSpecs: Array<[number, number, number, number, number]> = [
        [-0.096, 0.205, -0.032, 0.22, -0.45],
        [0.096, 0.205, -0.032, 0.22, 0.45],
        [-0.066, 0.215, -0.092, 0.32, -0.25],
        [0.066, 0.215, -0.092, 0.32, 0.25],
      ];
      for (const [sx, sy, sz, rx, ry] of sideSpecs) {
        const lock = new THREE.Mesh(assets.hairCardMid, palette.hair);
        lock.position.set(sx, sy, sz);
        lock.rotation.set(rx, ry, 0);
        this.head.add(lock);
      }

      const knot = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.011, 6, 14), palette.bronze);
      knot.position.set(0, 0.278, -0.085);
      knot.rotation.x = 0.62;
      this.head.add(knot);
      for (const ang of [-0.36, -0.12, 0.12, 0.36]) {
        const strand = new THREE.Mesh(assets.hairCardLong, palette.hair);
        strand.position.set(Math.sin(ang) * 0.028, 0.272, -0.102);
        strand.rotation.set(0.32, ang, 0);
        this.head.add(strand);
      }

      const band = new THREE.Mesh(new THREE.TorusGeometry(0.106, 0.011, 6, 22), palette.accent);
      band.rotation.x = Math.PI / 2 - 0.14;
      band.scale.set(0.93, 1.13, 1);
      band.position.set(0, 0.215, -0.008);
      this.head.add(band);

      const segGeo = new THREE.BoxGeometry(0.026, 0.006, 0.155);
      segGeo.translate(0, 0, -0.078);
      for (const side of [-0.02, 0.02]) {
        const chain: THREE.Mesh[] = [];
        let parent: THREE.Object3D = this.head;
        for (let i = 0; i < 4; i++) {
          const seg = new THREE.Mesh(segGeo, palette.accent);
          seg.scale.x = 1 - i * 0.14;
          if (i === 0) seg.position.set(side, 0.205, -0.12);
          else seg.position.set(0, 0, -0.145);
          parent.add(seg);
          chain.push(seg);
          parent = seg;
        }
        this.ribbonSegs.push(chain);
      }
    } else if (archetype === 'bladesman') {
      const helm = new THREE.Mesh(
        new THREE.SphereGeometry(0.114, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
        palette.armor,
      );
      helm.scale.set(0.98, 1.02, 1.12);
      helm.position.set(0, 0.195, -0.012);
      helm.rotation.x = -0.18;
      this.head.add(helm);

      const brim = new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.014, 8, 22), palette.bronze);
      brim.rotation.x = Math.PI / 2 - 0.16;
      brim.scale.set(0.95, 1.1, 1);
      brim.position.set(0, 0.218, -0.008);
      this.head.add(brim);

      const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.026, 0.085, 8), palette.bronze);
      finial.position.set(0, 0.33, -0.025);
      this.head.add(finial);
      const plume = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.16, 8), palette.accent);
      plume.position.set(0, 0.34, -0.075);
      plume.rotation.x = -0.75;
      this.head.add(plume);

      const flapGeo = new THREE.BoxGeometry(0.02, 0.13, 0.085);
      for (const s of [-1, 1]) {
        const flap = new THREE.Mesh(flapGeo, palette.armor);
        flap.position.set(s * 0.105, 0.135, -0.028);
        flap.rotation.z = s * 0.14;
        this.head.add(flap);
      }
      for (const ang of [-0.35, 0, 0.35]) {
        const strand = new THREE.Mesh(assets.hairCardMid, palette.hair);
        strand.position.set(Math.sin(ang) * 0.065, 0.19, -0.1);
        strand.rotation.set(0.2, ang, 0);
        this.head.add(strand);
      }
    } else if (archetype === 'caster') {
      const hairDome = new THREE.Mesh(
        new THREE.SphereGeometry(0.104, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
        palette.hairBase,
      );
      hairDome.scale.set(0.96, 1.02, 1.14);
      hairDome.position.set(0, 0.175, -0.02);
      hairDome.rotation.x = -0.2;
      this.head.add(hairDome);

      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.056, 0.12, 8), palette.bronze);
      crown.position.set(0, 0.305, -0.03);
      this.head.add(crown);
      const hairpin = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.24, 6), palette.bronze);
      hairpin.rotation.z = Math.PI / 2;
      hairpin.position.set(0, 0.31, -0.03);
      this.head.add(hairpin);

      for (const ang of [-0.58, -0.28, 0, 0.28, 0.58]) {
        const strand = new THREE.Mesh(assets.hairCardLong, palette.hair);
        strand.position.set(Math.sin(ang) * 0.072, 0.225, -0.088);
        strand.rotation.set(0.2, ang, 0);
        this.head.add(strand);
      }
    } else if (archetype === 'elite') {
      const hairDome = new THREE.Mesh(
        new THREE.SphereGeometry(0.106, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
        palette.hairBase,
      );
      hairDome.scale.set(0.98, 1.04, 1.15);
      hairDome.position.set(0, 0.178, -0.02);
      hairDome.rotation.x = -0.22;
      this.head.add(hairDome);

      const warCrown = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.016, 8, 22), palette.bronze);
      warCrown.rotation.x = Math.PI / 2 - 0.15;
      warCrown.scale.set(0.95, 1.13, 1);
      warCrown.position.set(0, 0.224, -0.006);
      this.head.add(warCrown);

      const crest = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.042, 0.12, 8), palette.armor);
      crest.position.set(0, 0.312, -0.035);
      this.head.add(crest);
      const crimsonPlume = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.24, 8), palette.accent);
      crimsonPlume.position.set(0, 0.34, -0.09);
      crimsonPlume.rotation.x = -0.7;
      this.head.add(crimsonPlume);

      for (const ang of [-0.55, -0.24, 0, 0.24, 0.55]) {
        const strand = new THREE.Mesh(assets.hairCardLong, palette.hair);
        strand.position.set(Math.sin(ang) * 0.078, 0.23, -0.09);
        strand.rotation.set(0.24, ang, 0);
        this.head.add(strand);
      }
    } else {
      // BOSS: Open-front bronze war-crown + piercing amber-gold iris pinpoints + dark ruby brow jewel!
      const hairDome = new THREE.Mesh(
        new THREE.SphereGeometry(0.106, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
        palette.hairBase,
      );
      hairDome.scale.set(0.98, 1.04, 1.16);
      hairDome.position.set(0, 0.178, -0.02);
      hairDome.rotation.x = -0.22;
      this.head.add(hairDome);

      const diadem = new THREE.Mesh(new THREE.TorusGeometry(0.108, 0.015, 6, 20), palette.bronze);
      diadem.rotation.x = Math.PI / 2 - 0.14;
      diadem.scale.set(0.94, 1.14, 1);
      diadem.position.set(0, 0.226, -0.006);
      this.head.add(diadem);

      const topCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.046, 0.14, 8), palette.bronze);
      topCrown.position.set(0, 0.32, -0.04);
      this.head.add(topCrown);

      // Deep ruby antique brow jewel (no white clipping!)
      const rubyMat = new THREE.MeshStandardMaterial({
        color: '#8f1822',
        emissive: new THREE.Color('#5a0e16'),
        emissiveIntensity: 0.7,
        roughness: 0.22,
        metalness: 0.35,
      });
      const centerGem = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), rubyMat);
      centerGem.scale.set(0.85, 1.25, 0.6);
      centerGem.position.set(0, 0.236, 0.106);
      this.head.add(centerGem);

      // Piercing glowing amber-gold demon irises nested cleanly inside his sculpted orbital sockets!
      const amberIrisMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.1, 1.18, 0.25) });
      const irisGeo = new THREE.SphereGeometry(0.0068, 8, 8);
      for (const s of [-1, 1]) {
        const iris = new THREE.Mesh(irisGeo, amberIrisMat);
        iris.scale.set(1.1, 0.75, 0.55);
        iris.position.set(s * 0.032, 0.151, 0.095);
        this.head.add(iris);
      }

      const hornGeo = new THREE.ConeGeometry(0.038, 0.4, 7);
      for (const s of [-1, 1]) {
        const horn = new THREE.Mesh(hornGeo, palette.bronze);
        horn.position.set(s * 0.12, 0.34, -0.01);
        horn.rotation.set(0.18, 0, s * -0.58);
        this.head.add(horn);
      }

      for (const ang of [-0.62, -0.32, 0, 0.32, 0.62]) {
        const strand = new THREE.Mesh(assets.hairCardLong, palette.hair);
        strand.position.set(Math.sin(ang) * 0.082, 0.235, -0.09 - Math.cos(ang) * 0.02);
        strand.rotation.set(0.24, ang, 0);
        this.head.add(strand);
      }
    }
  }

  private buildWineGourd(bronzeMat: THREE.Material, accentMat: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    const gourdMat = new THREE.MeshStandardMaterial({
      color: '#a3682a',
      roughness: 0.56,
      metalness: 0.08,
    });
    const pts = [
      new THREE.Vector2(0.001, -0.11),
      new THREE.Vector2(0.074, -0.075),
      new THREE.Vector2(0.076, -0.025),
      new THREE.Vector2(0.036, 0.018),
      new THREE.Vector2(0.056, 0.058),
      new THREE.Vector2(0.032, 0.095),
      new THREE.Vector2(0.016, 0.115),
    ];
    const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 12), gourdMat);
    const cord = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.009, 6, 12), accentMat);
    cord.rotation.x = Math.PI / 2;
    cord.position.y = 0.018;
    const stopper = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.034, 6), bronzeMat);
    stopper.position.y = 0.125;
    g.add(body, cord, stopper);
    return g;
  }

  private buildWeapon(
    archetype: CharacterArchetype,
    palette: ReturnType<CharacterRig['buildPalette']>,
    assets: ReturnType<typeof getSharedAssets>,
  ): THREE.Group {
    const g = new THREE.Group();
    const steelMat = new THREE.MeshStandardMaterial({
      map: assets.steelPbr.map,
      bumpMap: assets.steelPbr.bumpMap,
      bumpScale: 0.022,
      roughnessMap: assets.steelPbr.roughnessMap,
      color: '#dce4ec',
      roughness: 0.24,
      metalness: 0.84,
    });

    if (archetype === 'xiaoyao' || archetype === 'ally') {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.23, 8), palette.leather);
      grip.position.y = -0.05;
      const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.026, 0), palette.bronze);
      pommel.position.y = -0.175;
      const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.16, 6), palette.accent);
      tassel.position.y = -0.26;

      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.165, 0.028, 0.036), palette.bronze);
      guard.position.y = 0.068;
      const guardCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.032, 0), palette.bronze);
      guardCore.position.y = 0.072;

      const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.026, 0.98, 4), steelMat);
      blade.scale.set(1.0, 1.0, 0.32);
      blade.rotation.y = Math.PI / 4;
      blade.position.y = 0.57;
      blade.castShadow = true;

      const fuller = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.011, 0.9, 4), this.weaponGlowMat);
      fuller.scale.set(1.0, 1.0, 0.5);
      fuller.rotation.y = Math.PI / 4;
      fuller.position.y = 0.56;

      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.22, 4), steelMat);
      tip.scale.set(1.0, 1.0, 0.32);
      tip.rotation.y = Math.PI / 4;
      tip.position.y = 1.17;

      // Subtle Donghua Anime Jade-Cyan Spirit Sword Aura Sheath
      const auraSheath = new THREE.Mesh(
        new THREE.CylinderGeometry(0.024, 0.038, 1.06, 6, 1, true),
        new THREE.MeshBasicMaterial({
          color: archetype === 'ally' ? new THREE.Color(0.45, 1.9, 1.55) : new THREE.Color(0.42, 1.75, 2.05),
          transparent: true,
          opacity: 0.22,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      auraSheath.scale.set(1.0, 1.0, 0.45);
      auraSheath.position.y = 0.62;

      g.add(grip, pommel, tassel, guard, guardCore, blade, fuller, tip, auraSheath);
      this.weaponTipLocal.set(0, 1.28, 0);
    } else if (archetype === 'bladesman') {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.021, 0.34, 8), palette.leather);
      grip.position.y = -0.08;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.009, 6, 14), palette.bronze);
      ring.position.y = -0.27;
      const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.062, 0.024, 10), palette.bronze);
      guard.position.y = 0.09;
      const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.056, 1.04, 4), steelMat);
      blade.scale.set(1.0, 1.0, 0.26);
      blade.rotation.y = Math.PI / 4;
      blade.position.set(0.012, 0.62, 0);
      blade.castShadow = true;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.22, 4), steelMat);
      tip.scale.set(1.0, 1.0, 0.26);
      tip.rotation.y = Math.PI / 4;
      tip.position.set(0.012, 1.25, 0);
      const emberEdge = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.96, 0.018), this.weaponGlowMat);
      emberEdge.position.set(-0.028, 0.62, 0);
      g.add(grip, ring, guard, blade, tip, emberEdge);
      this.weaponTipLocal.set(0, 1.32, 0);
    } else if (archetype === 'elite') {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.42, 8), palette.leather);
      grip.position.y = -0.14;
      const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.042, 1), palette.bronze);
      pommel.position.y = -0.36;
      const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.038, 0.34, 6), palette.bronze);
      guard.rotation.z = Math.PI / 2;
      guard.position.y = 0.08;
      const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.072, 1.28, 4), steelMat);
      blade.scale.set(1.0, 1.0, 0.32);
      blade.rotation.y = Math.PI / 4;
      blade.position.y = 0.74;
      blade.castShadow = true;
      const runeCore = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.014, 1.14, 4), this.weaponGlowMat);
      runeCore.scale.set(1.0, 1.0, 0.6);
      runeCore.rotation.y = Math.PI / 4;
      runeCore.position.y = 0.72;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.044, 0.3, 4), steelMat);
      tip.scale.set(1.0, 1.0, 0.32);
      tip.rotation.y = Math.PI / 4;
      tip.position.y = 1.52;
      g.add(grip, pommel, guard, blade, runeCore, tip);
      this.weaponTipLocal.set(0, 1.66, 0);
    } else if (archetype === 'caster') {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 1.7, 8), palette.leather);
      shaft.position.y = 0.56;
      const finial = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.018, 6, 16), palette.bronze);
      finial.position.y = 1.5;
      const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.068, 1), this.weaponGlowMat);
      orb.position.y = 1.5;
      g.add(shaft, finial, orb);
      this.weaponTipLocal.set(0, 1.56, 0);
    } else {
      // Boss: Sculpted Beveled Diamond-Section Damascus Greatsword (九幽断岳重剑 — metallic spine + narrow ember fuller!)
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.44, 8), palette.leather);
      grip.position.y = -0.15;
      const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.048, 1), palette.bronze);
      pommel.position.y = -0.38;
      // Sculpted bronze wing-guard (not a flat box!)
      const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.044, 0.42, 6), palette.bronze);
      guard.rotation.z = Math.PI / 2;
      guard.position.y = 0.08;
      const guardCenter = new THREE.Mesh(new THREE.OctahedronGeometry(0.068, 1), palette.bronze);
      guardCenter.scale.set(1.2, 0.85, 0.65);
      guardCenter.position.y = 0.085;

      // Beveled diamond cross-section Damascus blade (catches crisp metallic specular highlights!)
      const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.095, 1.44, 4), steelMat);
      blade.scale.set(1.0, 1.0, 0.34);
      blade.rotation.y = Math.PI / 4;
      blade.position.y = 0.82;
      blade.castShadow = true;

      // Narrow recessed crimson rune fuller along central spine (not thick neon red stripe!)
      const runeCore = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.018, 1.28, 4), this.weaponGlowMat);
      runeCore.scale.set(1.0, 1.0, 0.62);
      runeCore.rotation.y = Math.PI / 4;
      runeCore.position.y = 0.8;

      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.056, 0.36, 4), steelMat);
      tip.rotation.y = Math.PI / 4;
      tip.scale.set(1, 1, 0.34);
      tip.position.y = 1.72;
      g.add(grip, pommel, guard, guardCenter, blade, runeCore, tip);
      this.weaponTipLocal.set(0, 1.9, 0);
    }

    return g;
  }

  setWeaponDrawn(drawn: boolean): void {
    if (this.weaponDrawn === drawn) return;
    this.weaponDrawn = drawn;
    if (drawn) {
      this.weaponHandMount.add(this.weaponMesh);
      this.weaponMesh.position.set(0, 0, 0);
      this.weaponMesh.rotation.set(0, 0, 0);
    } else {
      this.weaponBackMount.add(this.weaponMesh);
      this.weaponMesh.position.set(0, -0.05, 0.02);
      this.weaponMesh.rotation.set(0, 0, 0);
    }
  }

  setPhase2(active: boolean): void {
    this.phase2Active = active;
    if (this.archetype === 'boss') {
      this.weaponGlowMat.emissive.set(active ? '#e82a34' : '#c4283c');
      this.weaponGlowMat.emissiveIntensity = active ? 1.55 : 0.95;
    }
  }

  triggerHitFlash(strength = 1.0): void {
    this.hitFlash = Math.max(this.hitFlash, strength);
  }

  setSwordGlow(intensity: number): void {
    this.weaponGlowMat.emissiveIntensity = Math.min(1.4, intensity * 0.62);
  }

  getWeaponTipWorld(out: THREE.Vector3): THREE.Vector3 {
    out.copy(this.weaponTipLocal);
    return this.weaponMesh.localToWorld(out);
  }

  applyPose(pose: PoseName, t: number, elapsed: number, dt: number, moveSpeed = 0): void {
    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt * 7.5);
      for (const m of this.flashMats) {
        m.emissive.setRGB(this.hitFlash * 0.72, this.hitFlash * 0.2, this.hitFlash * 0.18);
        m.emissiveIntensity = this.hitFlash > 0.01 ? 0.9 : 0;
      }
    }

    let pelX = 0;
    let pelY = -0.03 + Math.sin(elapsed * 2.5) * 0.018;
    let pelZ = 0;
    let tPitch = 0.07;
    let tYaw = -0.22;
    let tRoll = 0;
    let hYaw = 0.16;
    let rHand: [number, number, number] = [-0.36, 1.06 + Math.sin(elapsed * 2.5) * 0.02, 0.25];
    let lHand: [number, number, number] = [0.37, 1.1 - Math.sin(elapsed * 2.5) * 0.018, 0.3];
    let swordDir: [number, number, number] = [-0.38, 0.42, 0.82];
    let rFoot: [number, number, number] = [-0.18, 0, -0.12];
    let lFoot: [number, number, number] = [0.18, 0, 0.16];
    let drinking = false;

    if (pose === 'idle') {
      tPitch = 0.02;
      tYaw = 0;
      hYaw = Math.sin(elapsed * 0.9) * 0.07;
      rHand = [-0.32, 0.98 + Math.sin(elapsed * 2.0) * 0.015, 0.1];
      lHand = [0.34, 1.0 - Math.sin(elapsed * 2.0) * 0.015, 0.15];
      swordDir = [-0.25, -0.5, 0.8];
      rFoot = [-0.16, 0, 0];
      lFoot = [0.16, 0, 0.03];
    } else if (pose === 'run') {
      const cyc = elapsed * (this.archetype === 'boss' ? 7.0 : 11.2);
      const stride = Math.sin(cyc);
      const liftR = Math.max(0, Math.cos(cyc)) * 0.2;
      const liftL = Math.max(0, -Math.cos(cyc)) * 0.2;
      pelY = -0.06 + Math.abs(Math.sin(cyc)) * 0.075;
      tPitch = 0.22;
      tYaw = stride * 0.16;
      tRoll = -stride * 0.05;
      hYaw = -tYaw * 0.7;
      rHand = [-0.38, 1.04 + stride * 0.08, -0.18 - stride * 0.12];
      lHand = [0.36, 1.1 - stride * 0.08, 0.24 + stride * 0.2];
      swordDir = [-0.32, -0.22, -0.92];
      rFoot = [-0.18, liftR, stride * 0.44];
      lFoot = [0.18, liftL, -stride * 0.44];
    } else if (pose === 'combo1' || pose === 'combo2' || pose === 'combo3' || pose === 'parryCounter') {
      const table =
        pose === 'combo1'
          ? COMBO1_FRAMES
          : pose === 'combo2'
            ? COMBO2_FRAMES
            : pose === 'combo3'
              ? COMBO3_FRAMES
              : COUNTER_FRAMES;
      const f = samplePoseFrames(table, t);
      [pelX, pelY, pelZ] = f.pelvisOffset;
      tPitch = f.torsoPitch;
      tYaw = f.torsoYaw;
      tRoll = f.torsoRoll;
      hYaw = f.headYaw;
      rHand = f.rHand;
      lHand = f.lHand;
      swordDir = f.swordDir;
      rFoot = f.rFoot;
      lFoot = f.lFoot;
    } else if (pose === 'block') {
      pelY = -0.1;
      tPitch = 0.14;
      tYaw = -0.35;
      hYaw = 0.32;
      rHand = [-0.18, 1.22, 0.36];
      lHand = [0.16, 1.28, 0.38];
      swordDir = [0.72, 0.66, 0.14];
      rFoot = [-0.24, 0, -0.22];
      lFoot = [0.24, 0, 0.26];
    } else if (pose === 'dodge') {
      pelY = -0.22;
      pelZ = 0.15;
      tPitch = 0.56;
      tYaw = -0.38;
      hYaw = 0.34;
      rHand = [-0.46, 0.98, -0.34];
      lHand = [0.36, 1.02, 0.38];
      swordDir = [-0.35, -0.1, -0.92];
      rFoot = [-0.22, 0.12, -0.38];
      lFoot = [0.22, 0.05, 0.34];
    } else if (pose === 'castQ') {
      const u = easeOutQuart(t);
      pelY = -0.08;
      tPitch = 0.15;
      tYaw = lerp(-0.55, 0.45, u);
      hYaw = -tYaw * 0.7;
      rHand = [lerp(-0.4, -0.12, u), 1.3, lerp(-0.1, 0.62, u)];
      lHand = [0.22, 1.32, 0.42];
      swordDir = [0.05, 0.15, 0.98];
      rFoot = [-0.22, 0, -0.22];
      lFoot = [0.24, 0, 0.3];
    } else if (pose === 'castE' || pose === 'castR') {
      const rise = clamp(t * 2.2, 0, 1);
      pelY = pose === 'castR' ? Math.sin(clamp(t, 0, 1) * Math.PI) * 0.32 : -0.04;
      tPitch = -0.14 * rise;
      tYaw = 0;
      rHand = [-0.14, lerp(1.14, 1.94, rise), 0.14];
      lHand = [0.24, lerp(1.1, 1.48, rise), 0.34];
      swordDir = [0.0, 0.98, 0.12];
      rFoot = [-0.22, pelY > 0.05 ? 0.16 : 0, -0.1];
      lFoot = [0.22, pelY > 0.05 ? 0.22 : 0, 0.14];
    } else if (pose === 'drink') {
      drinking = true;
      pelY = -0.02;
      tPitch = -0.16 * Math.sin(clamp(t, 0, 1) * Math.PI);
      tYaw = 0.12;
      rHand = [-0.36, 1.02, 0.14];
      lHand = [0.08, 1.56, 0.24];
      swordDir = [-0.3, -0.45, 0.84];
    } else if (pose === 'hit' || pose === 'stagger') {
      const sway = pose === 'stagger' ? Math.sin(elapsed * 8.5) * 0.14 : (1 - t) * 0.38;
      pelY = -0.1;
      pelZ = -0.14 * (1 - t);
      tPitch = -0.32 - sway * 0.5;
      tYaw = sway;
      rHand = [-0.46, 1.16, -0.08];
      lHand = [0.46, 1.18, 0.04];
      swordDir = [-0.7, 0.5, 0.35];
    } else if (pose === 'enemyWindup') {
      const u = clamp(t, 0, 1);
      pelY = -0.08 - u * 0.06;
      tPitch = 0.12 - u * 0.26;
      tYaw = -0.78 * u;
      hYaw = 0.65 * u;
      rHand = [-0.52, 1.24 + u * 0.62, -0.22 * u];
      lHand = [0.34, 1.18, 0.28];
      swordDir = [-0.4, 0.62, -0.65];
      rFoot = [-0.24, 0, -0.24];
      lFoot = [0.24, 0, 0.28];
    } else if (pose === 'enemySlash' || pose === 'bossSlam') {
      const u = easeOutQuart(t);
      pelY = pose === 'bossSlam' ? -0.22 * u : -0.1;
      pelZ = 0.24 * u;
      tPitch = lerp(-0.18, 0.44, u);
      tYaw = pose === 'bossSlam' ? 0.15 * u : lerp(-0.75, 0.78, u);
      hYaw = -tYaw * 0.65;
      rHand =
        pose === 'bossSlam'
          ? [-0.12, lerp(1.9, 0.66, u), lerp(-0.1, 0.74, u)]
          : [lerp(-0.54, 0.56, u), lerp(1.46, 1.0, u), lerp(-0.1, 0.54, u)];
      lHand = [0.36, 1.06, -0.14];
      swordDir =
        pose === 'bossSlam'
          ? [0.0, lerp(0.7, -0.58, u), lerp(-0.6, 0.82, u)]
          : [lerp(-0.7, 0.75, u), 0.1, 0.65];
      rFoot = [-0.25, 0, 0.34];
      lFoot = [0.25, 0, -0.22];
    } else if (pose === 'bossIntro') {
      const u = easeOutQuart(clamp(t, 0, 1));
      pelY = lerp(-0.44, 0.0, u);
      tPitch = lerp(0.55, -0.08, u);
      tYaw = lerp(-0.2, 0, u);
      rHand = [-0.36, lerp(0.78, 1.58, u), 0.35];
      lHand = [0.38, lerp(0.7, 1.28, u), 0.22];
      swordDir = [0.1, lerp(-0.85, 0.65, u), 0.5];
      rFoot = [-0.26, 0, -0.14];
      lFoot = [0.26, 0, 0.22];
    } else if (pose === 'dead') {
      const u = easeOutQuart(clamp(t, 0, 1));
      pelY = lerp(-0.08, -0.78, u);
      tPitch = lerp(0.1, -1.42, u);
      rHand = [-0.45, lerp(1.04, 0.22, u), 0.1];
      lHand = [0.45, lerp(1.04, 0.2, u), 0.1];
      swordDir = [-0.8, -0.2, 0.4];
      rFoot = [-0.2, 0, 0.2];
      lFoot = [0.2, 0, 0.24];
    }

    const hoverY = this.archetype === 'caster' && pose !== 'dead' ? 0.34 + Math.sin(elapsed * 2.9) * 0.1 : 0;

    this.pelvis.position.set(pelX, this.hipY + pelY + hoverY, pelZ);
    this.torso.rotation.set(tPitch, tYaw, tRoll);
    this.head.rotation.y = hYaw;

    this.bodyGroup.updateMatrixWorld(true);

    const cosY = Math.cos(tYaw);
    const sinY = Math.sin(tYaw);
    const shY = this.hipY + pelY + hoverY + 0.54;
    this._rShoulder.set(pelX - this.shoulderX * cosY, shY, pelZ + this.shoulderX * sinY);
    this._lShoulder.set(pelX + this.shoulderX * cosY, shY, pelZ - this.shoulderX * sinY);
    this._rHip.set(pelX - this.hipX, this.hipY + pelY + hoverY - 0.04, pelZ);
    this._lHip.set(pelX + this.hipX, this.hipY + pelY + hoverY - 0.04, pelZ);

    this.rShoulderCap.position.copy(this._rShoulder);
    this.lShoulderCap.position.copy(this._lShoulder);

    // Right arm IK + seamless elbow joint
    this._rTarget.set(rHand[0], rHand[1] + hoverY, rHand[2]);
    this._rPole.set(this._rShoulder.x - 0.35, this._rShoulder.y - 0.25, this._rShoulder.z - 0.42);
    solveTwoBoneIK(
      this._rShoulder,
      this._rTarget,
      this._rPole,
      this.upperArmLen,
      this.foreArmLen,
      this._mid,
      this._end,
    );
    placeLimbSegment(this.rUpperArm, this._rShoulder, this._mid);
    placeLimbSegment(this.rForeArm, this._mid, this._end);
    this.rElbowCap.position.copy(this._mid);
    this.rHandGroup.position.copy(this._end);
    this.rHandGroup.quaternion.copy(this.rForeArm.quaternion);

    if (this.weaponDrawn) {
      this.weaponHandMount.position.copy(this._end);
      this._dir.set(swordDir[0], swordDir[1], swordDir[2]).normalize();
      this.weaponHandMount.quaternion.setFromUnitVectors(this._upY, this._dir);
    }

    // Left arm IK + seamless elbow joint
    this._lTarget.set(lHand[0], lHand[1] + hoverY, lHand[2]);
    this._lPole.set(this._lShoulder.x + 0.35, this._lShoulder.y - 0.25, this._lShoulder.z - 0.38);
    solveTwoBoneIK(
      this._lShoulder,
      this._lTarget,
      this._lPole,
      this.upperArmLen,
      this.foreArmLen,
      this._mid,
      this._end,
    );
    placeLimbSegment(this.lUpperArm, this._lShoulder, this._mid);
    placeLimbSegment(this.lForeArm, this._mid, this._end);
    this.lElbowCap.position.copy(this._mid);
    this.lHandGroup.position.copy(this._end);
    this.lHandGroup.quaternion.copy(this.lForeArm.quaternion);

    if (this.gourdMesh && this.gourdHipMount) {
      if (drinking) {
        if (this.gourdMesh.parent !== this.bodyGroup) this.bodyGroup.add(this.gourdMesh);
        this.gourdMesh.position.copy(this._end).add(new THREE.Vector3(-0.04, 0.04, 0.05));
        this.gourdMesh.rotation.set(-0.9, 0, -0.5);
      } else if (this.gourdMesh.parent !== this.gourdHipMount) {
        this.gourdHipMount.add(this.gourdMesh);
        this.gourdMesh.position.set(0, 0, 0);
        this.gourdMesh.rotation.set(0, 0, 0);
      }
    }

    // Right & Left Leg IK + seamless knee caps
    this._rTarget.set(rFoot[0], rFoot[1] + 0.045 + hoverY * 0.85, rFoot[2]);
    this._rPole.set(this._rHip.x - 0.06, this._rHip.y - 0.22, this._rHip.z + 0.58);
    solveTwoBoneIK(
      this._rHip,
      this._rTarget,
      this._rPole,
      this.thighLen,
      this.shinLen,
      this._mid,
      this._end,
    );
    placeLimbSegment(this.rThigh, this._rHip, this._mid);
    placeLimbSegment(this.rShin, this._mid, this._end);
    this.rKneeCap.position.copy(this._mid);
    this.rFootMesh.position.set(this._end.x, Math.max(0.036, this._end.y - 0.012), this._end.z + 0.02);

    this._lTarget.set(lFoot[0], lFoot[1] + 0.045 + hoverY * 0.85, lFoot[2]);
    this._lPole.set(this._lHip.x + 0.06, this._lHip.y - 0.22, this._lHip.z + 0.58);
    solveTwoBoneIK(
      this._lHip,
      this._lTarget,
      this._lPole,
      this.thighLen,
      this.shinLen,
      this._mid,
      this._end,
    );
    placeLimbSegment(this.lThigh, this._lHip, this._mid);
    placeLimbSegment(this.lShin, this._mid, this._end);
    this.lKneeCap.position.copy(this._mid);
    this.lFootMesh.position.set(this._end.x, Math.max(0.036, this._end.y - 0.012), this._end.z + 0.02);

    // Secondary Cloth Motion
    this.ribbonPhase += dt * (4.2 + moveSpeed * 1.35);
    const windPitch = clamp(0.18 + moveSpeed * 0.09, 0.14, 0.92);
    for (let c = 0; c < this.ribbonSegs.length; c++) {
      const chain = this.ribbonSegs[c];
      for (let i = 0; i < chain.length; i++) {
        const wave = Math.sin(this.ribbonPhase - i * 0.85 + c * 1.2);
        chain[i].rotation.x = i === 0 ? -0.55 + windPitch * 0.45 : 0.12 * wave;
        chain[i].rotation.y = wave * (0.15 + i * 0.065);
      }
    }

    const flapLift = clamp(moveSpeed * 0.055, 0, 0.36);
    if (this.skirtPanels.length === 4) {
      this.skirtPanels[0].rotation.x = -0.04 - flapLift * 0.3;
      this.skirtPanels[1].rotation.x = -0.06 - flapLift * 1.05;
    }
    if (this.capeMesh) {
      this.capeMesh.rotation.x = -0.14 - flapLift * 0.85 + Math.sin(elapsed * 2.4) * 0.04;
    }

    if (this.archetype === 'caster') {
      for (const orb of this.floatingOrbitals) {
        const ph = (orb.userData.orbitPhase as number) + elapsed * 1.65;
        orb.position.set(Math.cos(ph) * 0.78, 0.26 + Math.sin(ph * 2) * 0.1, Math.sin(ph) * 0.78);
        orb.rotation.y = -ph + Math.PI / 2;
      }
    } else if (this.archetype === 'boss' && this.floatingOrbitals.length >= 2) {
      const spd = this.phase2Active ? 2.1 : 0.9;
      this.floatingOrbitals[0].rotation.z = elapsed * spd;
      this.floatingOrbitals[1].rotation.z = -elapsed * spd * 1.35;
    }
  }
}

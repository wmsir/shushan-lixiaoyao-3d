import * as THREE from 'three';
import { clamp, easeOutQuart, lerp, solveTwoBoneIK } from '../utils/math';
import type { EquipRarity, HeroSkinVisual, WeaponVisual } from '../game/EquipmentData';
import {
  createForgedSteelPbr,
  createLeatherPbr,
  createTalismanTexture,
  createWovenClothPbr,
} from './RealisticTextures';
import {
  applyHumanSkinSss,
  applySilhouetteRim,
  createAnatomicalHeadGeometry,
  createCurvedHairCardGeo,
  createEarGeometry,
  createHairStrandAlphaTexture,
  createSculptedHairLockGeo,
  createSeamlessFaceAuxTexture,
  createSeamlessFaceTexture,
  type SilhouetteRimHandle,
} from './HumanSculpt';
import {
  ContinuousLimbRig,
  ContinuousTorsoRig,
  createCurvedCrossStrapGeo,
  createCurvedHanfuCollarGeo,
  createCurvedWarHornGeo,
  createCurvedWarPlumeGeo,
  createRealisticHandGroup,
  createSculptedPauldronGeo,
  createSculptedScabbardGroup,
  createSeamlessLimbSkinnedMesh,
  createSeamlessTorsoSkinnedMesh,
  solveContinuousLimbBones,
} from './SkinnedHumanBody';

import heroFaceUrl from '../assets/hero-face.jpg';
import heroFaceNrmUrl from '../assets/hero-face-nrm.jpg';
import heroFaceRoughUrl from '../assets/hero-face-rough.jpg';
import allyFaceUrl from '../assets/ally-face.jpg';
import allyFaceNrmUrl from '../assets/ally-face-nrm.jpg';
import allyFaceRoughUrl from '../assets/ally-face-rough.jpg';
import vanguardFaceUrl from '../assets/vanguard-face.jpg';
import vanguardFaceNrmUrl from '../assets/vanguard-face-nrm.jpg';
import vanguardFaceRoughUrl from '../assets/vanguard-face-rough.jpg';
import priestFaceUrl from '../assets/priest-face.jpg';
import priestFaceNrmUrl from '../assets/priest-face-nrm.jpg';
import priestFaceRoughUrl from '../assets/priest-face-rough.jpg';
import eliteFaceUrl from '../assets/elite-face.jpg';
import eliteFaceNrmUrl from '../assets/elite-face-nrm.jpg';
import eliteFaceRoughUrl from '../assets/elite-face-rough.jpg';
import bossFaceUrl from '../assets/boss-face.jpg';
import bossFaceNrmUrl from '../assets/boss-face-nrm.jpg';
import bossFaceRoughUrl from '../assets/boss-face-rough.jpg';
import brocadeUrl from '../assets/hanfu-brocade.jpg';
import brocadeNrmUrl from '../assets/hanfu-brocade-nrm.jpg';
import shanwenUrl from '../assets/shanwen-armor.jpg';
import shanwenNrmUrl from '../assets/shanwen-armor-nrm.jpg';
import ironArmorUrl from '../assets/iron-armor.jpg';
import ironArmorNrmUrl from '../assets/iron-armor-nrm.jpg';

export type CharacterArchetype = 'xiaoyao' | 'ally' | 'bladesman' | 'caster' | 'elite' | 'boss';
export type BossArchetype = 'titan' | 'phantom' | 'inferno' | 'celestial' | 'astral';

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
  | 'bossSlam'
  | 'mountHorse'
  | 'mountSword'
  | 'showcaseFlourish';

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
  { t: 0.0, pelvisOffset: [0, -0.04, 0], torsoPitch: 0.08, torsoYaw: -0.25, torsoRoll: 0, headYaw: 0.15, rHand: [-0.36, 1.09, 0.25], lHand: [0.37, 1.13, 0.3], swordDir: [-0.4, 0.4, 0.8], rFoot: [-0.19, 0, -0.14], lFoot: [0.19, 0, 0.18] },
  { t: 0.24, pelvisOffset: [0.02, -0.1, -0.05], torsoPitch: 0.14, torsoYaw: -0.68, torsoRoll: -0.08, headYaw: 0.55, rHand: [-0.58, 0.83, -0.28], lHand: [0.24, 1.19, 0.35], swordDir: [-0.85, -0.35, -0.4], rFoot: [-0.24, 0, -0.22], lFoot: [0.24, 0, 0.26] },
  { t: 0.36, pelvisOffset: [0.02, -0.11, -0.04], torsoPitch: 0.15, torsoYaw: -0.74, torsoRoll: -0.09, headYaw: 0.62, rHand: [-0.6, 0.79, -0.32], lHand: [0.22, 1.2, 0.36], swordDir: [-0.88, -0.4, -0.32], rFoot: [-0.24, 0, -0.22], lFoot: [0.24, 0, 0.26] },
  { t: 0.58, pelvisOffset: [-0.03, -0.06, 0.14], torsoPitch: 0.18, torsoYaw: 0.64, torsoRoll: 0.09, headYaw: -0.48, rHand: [0.46, 1.43, 0.52], lHand: [0.4, 1.05, -0.18], swordDir: [0.52, 0.62, 0.62], rFoot: [-0.22, 0, 0.32], lFoot: [0.22, 0, -0.18], curve: 'quart' },
  { t: 0.74, pelvisOffset: [-0.04, -0.05, 0.16], torsoPitch: 0.14, torsoYaw: 0.76, torsoRoll: 0.11, headYaw: -0.58, rHand: [0.54, 1.49, 0.42], lHand: [0.42, 1.01, -0.24], swordDir: [0.68, 0.58, 0.44], rFoot: [-0.22, 0, 0.32], lFoot: [0.22, 0, -0.18] },
  { t: 1.0, pelvisOffset: [0, -0.04, 0], torsoPitch: 0.08, torsoYaw: -0.25, torsoRoll: 0, headYaw: 0.15, rHand: [-0.36, 1.09, 0.25], lHand: [0.37, 1.13, 0.3], swordDir: [-0.4, 0.4, 0.8], rFoot: [-0.19, 0, -0.14], lFoot: [0.19, 0, 0.18] },
];

const COMBO2_FRAMES: PoseFrame[] = [
  { t: 0.0, pelvisOffset: [-0.02, -0.05, 0.08], torsoPitch: 0.12, torsoYaw: 0.62, torsoRoll: 0.06, headYaw: -0.45, rHand: [0.48, 1.39, 0.42], lHand: [0.4, 1.05, -0.18], swordDir: [0.6, 0.45, 0.6], rFoot: [-0.22, 0, 0.25], lFoot: [0.22, 0, -0.16] },
  { t: 0.26, pelvisOffset: [-0.04, -0.12, 0.02], torsoPitch: 0.16, torsoYaw: 0.82, torsoRoll: 0.1, headYaw: -0.62, rHand: [0.56, 1.23, 0.16], lHand: [0.44, 1.13, -0.12], swordDir: [0.85, 0.15, -0.2], rFoot: [-0.24, 0, 0.26], lFoot: [0.26, 0, -0.2] },
  { t: 0.38, pelvisOffset: [-0.04, -0.13, 0.02], torsoPitch: 0.17, torsoYaw: 0.88, torsoRoll: 0.11, headYaw: -0.68, rHand: [0.58, 1.21, 0.12], lHand: [0.46, 1.13, -0.1], swordDir: [0.88, 0.1, -0.28], rFoot: [-0.24, 0, 0.26], lFoot: [0.26, 0, -0.2] },
  { t: 0.6, pelvisOffset: [0.05, -0.08, 0.14], torsoPitch: 0.18, torsoYaw: -0.78, torsoRoll: -0.1, headYaw: 0.62, rHand: [-0.56, 1.11, 0.38], lHand: [0.26, 1.21, 0.34], swordDir: [-0.88, 0.06, 0.45], rFoot: [-0.24, 0, -0.22], lFoot: [0.24, 0, 0.32], curve: 'quart' },
  { t: 0.76, pelvisOffset: [0.06, -0.07, 0.14], torsoPitch: 0.15, torsoYaw: -0.88, torsoRoll: -0.12, headYaw: 0.72, rHand: [-0.62, 1.07, 0.22], lHand: [0.24, 1.19, 0.36], swordDir: [-0.92, -0.04, 0.22], rFoot: [-0.24, 0, -0.22], lFoot: [0.24, 0, 0.32] },
  { t: 1.0, pelvisOffset: [0, -0.04, 0], torsoPitch: 0.08, torsoYaw: -0.25, torsoRoll: 0, headYaw: 0.15, rHand: [-0.36, 1.09, 0.25], lHand: [0.37, 1.13, 0.3], swordDir: [-0.4, 0.4, 0.8], rFoot: [-0.19, 0, -0.14], lFoot: [0.19, 0, 0.18] },
];

const COMBO3_FRAMES: PoseFrame[] = [
  { t: 0.0, pelvisOffset: [0, -0.06, 0], torsoPitch: 0.1, torsoYaw: -0.3, torsoRoll: 0, headYaw: 0.22, rHand: [-0.36, 1.13, 0.22], lHand: [0.37, 1.13, 0.3], swordDir: [-0.35, 0.45, 0.8], rFoot: [-0.2, 0, -0.16], lFoot: [0.2, 0, 0.2] },
  { t: 0.28, pelvisOffset: [0, 0.34, 0.06], torsoPitch: -0.22, torsoYaw: -0.15, torsoRoll: 0, headYaw: 0.12, rHand: [-0.14, 1.95, -0.12], lHand: [0.16, 1.91, -0.08], swordDir: [0.0, 0.65, -0.75], rFoot: [-0.22, 0.36, -0.18], lFoot: [0.22, 0.28, 0.18] },
  { t: 0.42, pelvisOffset: [0, 0.42, 0.1], torsoPitch: -0.26, torsoYaw: -0.1, torsoRoll: 0, headYaw: 0.08, rHand: [-0.1, 2.03, -0.16], lHand: [0.12, 1.99, -0.1], swordDir: [0.0, 0.72, -0.68], rFoot: [-0.22, 0.42, -0.15], lFoot: [0.22, 0.35, 0.2] },
  { t: 0.6, pelvisOffset: [0, -0.18, 0.26], torsoPitch: 0.44, torsoYaw: 0.26, torsoRoll: 0.06, headYaw: -0.2, rHand: [-0.12, 0.71, 0.68], lHand: [0.4, 1.13, -0.2], swordDir: [0.05, -0.58, 0.82], rFoot: [-0.24, 0, 0.36], lFoot: [0.24, 0, -0.26], curve: 'quart' },
  { t: 0.78, pelvisOffset: [0, -0.16, 0.26], torsoPitch: 0.38, torsoYaw: 0.32, torsoRoll: 0.06, headYaw: -0.24, rHand: [-0.08, 0.67, 0.66], lHand: [0.42, 1.09, -0.24], swordDir: [0.08, -0.66, 0.75], rFoot: [-0.24, 0, 0.36], lFoot: [0.24, 0, -0.26] },
  { t: 1.0, pelvisOffset: [0, -0.04, 0], torsoPitch: 0.08, torsoYaw: -0.25, torsoRoll: 0, headYaw: 0.15, rHand: [-0.36, 1.09, 0.25], lHand: [0.37, 1.13, 0.3], swordDir: [-0.4, 0.4, 0.8], rFoot: [-0.19, 0, -0.14], lFoot: [0.19, 0, 0.18] },
];

const COUNTER_FRAMES: PoseFrame[] = [
  { t: 0.0, pelvisOffset: [0, -0.12, -0.08], torsoPitch: 0.24, torsoYaw: -0.6, torsoRoll: -0.08, headYaw: 0.5, rHand: [-0.48, 1.01, -0.26], lHand: [0.28, 1.15, 0.32], swordDir: [-0.4, 0.05, 0.9], rFoot: [-0.24, 0, -0.26], lFoot: [0.24, 0, 0.28] },
  { t: 0.3, pelvisOffset: [0, -0.14, 0.32], torsoPitch: 0.36, torsoYaw: 0.55, torsoRoll: 0.1, headYaw: -0.45, rHand: [-0.08, 1.19, 0.86], lHand: [0.44, 1.03, -0.24], swordDir: [0.08, 0.06, 0.99], rFoot: [-0.24, 0, 0.4], lFoot: [0.24, 0, -0.28], curve: 'quart' },
  { t: 0.62, pelvisOffset: [0, -0.06, 0.22], torsoPitch: 0.18, torsoYaw: 0.78, torsoRoll: 0.12, headYaw: -0.6, rHand: [0.52, 1.43, 0.46], lHand: [0.42, 1.05, -0.2], swordDir: [0.68, 0.45, 0.55], rFoot: [-0.24, 0, 0.34], lFoot: [0.24, 0, -0.22], curve: 'quart' },
  { t: 1.0, pelvisOffset: [0, -0.04, 0], torsoPitch: 0.08, torsoYaw: -0.25, torsoRoll: 0, headYaw: 0.15, rHand: [-0.36, 1.09, 0.25], lHand: [0.37, 1.13, 0.3], swordDir: [-0.4, 0.4, 0.8], rFoot: [-0.19, 0, -0.14], lFoot: [0.19, 0, 0.18] },
];

// Honor-of-Kings style dramatic ~1.15s try-on sword flourish settling into an unobstructed heroic front showcase pose
const SHOWCASE_FLOURISH_FRAMES: PoseFrame[] = [
  { t: 0.0, pelvisOffset: [0.02, -0.06, -0.02], torsoPitch: 0.07, torsoYaw: -0.34, torsoRoll: -0.04, headYaw: 0.30, rHand: [-0.44, 0.96, 0.22], lHand: [0.26, 1.24, 0.34], swordDir: [-0.62, -0.18, 0.76], rFoot: [-0.21, 0, -0.16], lFoot: [0.20, 0, 0.18] },
  { t: 0.28, pelvisOffset: [-0.02, 0.01, 0.05], torsoPitch: -0.06, torsoYaw: 0.36, torsoRoll: 0.06, headYaw: -0.26, rHand: [0.44, 1.56, 0.38], lHand: [0.42, 1.16, 0.04], swordDir: [0.64, 0.68, 0.36], rFoot: [-0.19, 0, 0.14], lFoot: [0.21, 0, -0.08], curve: 'quart' },
  { t: 0.56, pelvisOffset: [0.01, -0.04, 0.02], torsoPitch: 0.04, torsoYaw: -0.26, torsoRoll: -0.03, headYaw: 0.24, rHand: [-0.46, 1.32, 0.32], lHand: [0.24, 1.36, 0.36], swordDir: [-0.54, 0.72, 0.44], rFoot: [-0.19, 0, -0.10], lFoot: [0.19, 0, 0.15], curve: 'quart' },
  { t: 0.84, pelvisOffset: [0, -0.02, 0], torsoPitch: 0.015, torsoYaw: -0.14, torsoRoll: 0, headYaw: 0.14, rHand: [-0.40, 1.07, 0.16], lHand: [0.31, 1.22, 0.26], swordDir: [-0.44, 0.50, 0.74], rFoot: [-0.18, 0, -0.08], lFoot: [0.18, 0, 0.13], curve: 'quart' },
  { t: 1.0, pelvisOffset: [0, -0.02, 0], torsoPitch: 0.015, torsoYaw: -0.14, torsoRoll: 0, headYaw: 0.14, rHand: [-0.40, 1.07, 0.16], lHand: [0.31, 1.22, 0.26], swordDir: [-0.44, 0.50, 0.74], rFoot: [-0.18, 0, -0.08], lFoot: [0.18, 0, 0.13] },
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
  const geo = new THREE.CylinderGeometry(topR, botR, height, 20, 9, true, -arcAngle * 0.5, arcAngle);
  geo.translate(0, -height * 0.5, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = clamp(-y / height, 0, 1);
    const ang = Math.atan2(x, z);
    const pleat = Math.sin(ang * 16.0) * 0.018 * t + Math.cos(ang * 7.0 + t * 2.2) * 0.008 * t;
    const r = Math.hypot(x, z) + pleat;
    pos.setX(i, Math.sin(ang) * r);
    pos.setZ(i, Math.cos(ang) * r);
  }
  geo.computeVertexNormals();
  return geo;
}

function createMartialBootGeo(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.043, -0.088);
  shape.lineTo(0.043, -0.088);
  shape.quadraticCurveTo(0.052, 0.025, 0.035, 0.118);
  shape.quadraticCurveTo(0.0, 0.148, -0.035, 0.118);
  shape.quadraticCurveTo(-0.052, 0.025, -0.043, -0.088);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.056,
    bevelEnabled: true,
    bevelThickness: 0.017,
    bevelSize: 0.013,
    bevelSegments: 3,
  });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0.036, 0.024);
  geo.computeVertexNormals();
  return geo;
}

function loadTex(url: string, srgb: boolean, repeat = 1): THREE.Texture {
  const tex = new THREE.TextureLoader().load(url, (loaded) => {
    const listeners = loaded.userData.__seamlessListeners as Array<() => void> | undefined;
    if (listeners && listeners.length > 0) {
      for (const fn of listeners) fn();
      listeners.length = 0;
    }
  });
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat > 1) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
  }
  tex.anisotropy = 8;
  return tex;
}

function createSilkRibbonSegGeo(width = 0.024, len = 0.11): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(width, len, 3, 4);
  geo.translate(0, -len * 0.5, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const t = clamp(-y / len, 0, 1);
    const nx = x / (width * 0.5);
    const archZ = (1 - nx * nx) * 0.0028;
    const drapeZ = -0.008 * Math.sin(t * Math.PI);
    pos.setXYZ(i, x * (1 - t * 0.12), y, archZ + drapeZ);
  }
  geo.computeVertexNormals();
  return geo;
}

let SHARED_ASSETS: {
  shadow: THREE.CircleGeometry;
  shadowTex: THREE.CanvasTexture;
  heroHead: THREE.BufferGeometry;
  bossHead: THREE.BufferGeometry;
  ear: THREE.BufferGeometry;
  neck: THREE.BufferGeometry;
  belt: THREE.CylinderGeometry;
  frontSkirt: THREE.BufferGeometry;
  backSkirt: THREE.BufferGeometry;
  sideSkirt: THREE.BufferGeometry;
  capePanel: THREE.BufferGeometry;
  boot: THREE.BufferGeometry;
  pauldronArmor: THREE.BufferGeometry;
  pauldronCloth: THREE.BufferGeometry;
  collarHeroL: THREE.BufferGeometry;
  collarHeroR: THREE.BufferGeometry;
  strapHero: THREE.BufferGeometry;
  strapVanguard: THREE.BufferGeometry;
  hornL: THREE.BufferGeometry;
  hornR: THREE.BufferGeometry;
  plumeShort: THREE.BufferGeometry;
  plumeLong: THREE.BufferGeometry;
  hairCardLong: THREE.BufferGeometry;
  hairCardMid: THREE.BufferGeometry;
  hairCardTemple: THREE.BufferGeometry;
  hairCardBang: THREE.BufferGeometry;
  hairLockBangSweepL: THREE.BufferGeometry;
  hairLockBangSweepR: THREE.BufferGeometry;
  hairLockBangSideL: THREE.BufferGeometry;
  hairLockBangSideR: THREE.BufferGeometry;
  hairLockTempleL: THREE.BufferGeometry;
  hairLockTempleR: THREE.BufferGeometry;
  hairLockNape: THREE.BufferGeometry;
  hairLockTailMain: THREE.BufferGeometry;
  hairLockTailSideL: THREE.BufferGeometry;
  hairLockTailSideR: THREE.BufferGeometry;
  silkRibbonSeg: THREE.BufferGeometry;
  hairDark: ReturnType<typeof createHairStrandAlphaTexture>;
  hairSilver: ReturnType<typeof createHairStrandAlphaTexture>;
  heroFaceTex: THREE.Texture;
  heroFaceNrm: THREE.Texture;
  heroFaceRough: THREE.Texture;
  allyFaceTex: THREE.Texture;
  allyFaceNrm: THREE.Texture;
  allyFaceRough: THREE.Texture;
  vanguardFaceTex: THREE.Texture;
  vanguardFaceNrm: THREE.Texture;
  vanguardFaceRough: THREE.Texture;
  priestFaceTex: THREE.Texture;
  priestFaceNrm: THREE.Texture;
  priestFaceRough: THREE.Texture;
  eliteFaceTex: THREE.Texture;
  eliteFaceNrm: THREE.Texture;
  eliteFaceRough: THREE.Texture;
  bossFaceTex: THREE.Texture;
  bossFaceNrm: THREE.Texture;
  bossFaceRough: THREE.Texture;
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
    sg.addColorStop(0, 'rgba(3, 6, 10, 0.9)');
    sg.addColorStop(0.55, 'rgba(3, 6, 10, 0.45)');
    sg.addColorStop(1, 'rgba(3, 6, 10, 0)');
    sctx.fillStyle = sg;
    sctx.fillRect(0, 0, 64, 64);

    // Sculpted anatomical neck with muscular sternocleidomastoid flare into trapezius (never pinched!)
    const neckPts = [
      new THREE.Vector2(0.072, -0.015),
      new THREE.Vector2(0.061, 0.025),
      new THREE.Vector2(0.058, 0.065),
      new THREE.Vector2(0.060, 0.105),
    ];
    const neckGeo = new THREE.LatheGeometry(neckPts, 20);
    neckGeo.computeVertexNormals();

    SHARED_ASSETS = {
      shadow: new THREE.CircleGeometry(0.66, 24),
      shadowTex: new THREE.CanvasTexture(sc),
      heroHead: createAnatomicalHeadGeometry({
        faceSpanX: 0.184,
        faceSpanY: 0.242,
        uvCenterY: 0.535,
        jawStrength: 1.0,
        browDepth: 0.96,
        seamlessEdgeUv: true,
      }),
      bossHead: createAnatomicalHeadGeometry({
        faceSpanX: 0.266,
        faceSpanY: 0.288,
        uvCenterY: 0.518,
        jawStrength: 1.28,
        browDepth: 1.38,
        seamlessEdgeUv: false,
      }),
      ear: createEarGeometry(),
      neck: neckGeo,
      belt: new THREE.CylinderGeometry(0.182, 0.194, 0.105, 24),
      frontSkirt: createPleatedSkirtPanelGeo(1.06, 0.194, 0.305, 0.66),
      backSkirt: createPleatedSkirtPanelGeo(1.48, 0.198, 0.36, 0.74),
      sideSkirt: createPleatedSkirtPanelGeo(0.86, 0.192, 0.295, 0.6),
      capePanel: createPleatedSkirtPanelGeo(1.46, 0.25, 0.56, 1.28),
      boot: createMartialBootGeo(),
      pauldronArmor: createSculptedPauldronGeo(true),
      pauldronCloth: createSculptedPauldronGeo(false),
      collarHeroL: createCurvedHanfuCollarGeo(1.0, -1),
      collarHeroR: createCurvedHanfuCollarGeo(1.0, 1),
      strapHero: createCurvedCrossStrapGeo(1.0, -1),
      strapVanguard: createCurvedCrossStrapGeo(1.07, 1),
      hornL: createCurvedWarHornGeo(-1),
      hornR: createCurvedWarHornGeo(1),
      plumeShort: createCurvedWarPlumeGeo(0.22),
      plumeLong: createCurvedWarPlumeGeo(0.32),
      hairCardLong: createCurvedHairCardGeo(0.45, 0.088, 0.16, 0.022),
      hairCardMid: createCurvedHairCardGeo(0.26, 0.068, 0.085, 0.014),
      hairCardTemple: createCurvedHairCardGeo(0.21, 0.044, -0.015, 0.018),
      hairCardBang: createCurvedHairCardGeo(0.095, 0.042, 0.016, 0.008),
      hairLockBangSweepL: createSculptedHairLockGeo(0.086, 0.028, 0.022, -0.036),
      hairLockBangSweepR: createSculptedHairLockGeo(0.074, 0.026, 0.022, 0.032),
      hairLockBangSideL: createSculptedHairLockGeo(0.114, 0.024, 0.015, -0.018),
      hairLockBangSideR: createSculptedHairLockGeo(0.114, 0.024, 0.015, 0.018),
      hairLockTempleL: createSculptedHairLockGeo(0.165, 0.021, 0.012, 0.008),
      hairLockTempleR: createSculptedHairLockGeo(0.165, 0.021, 0.012, -0.008),
      hairLockNape: createSculptedHairLockGeo(0.175, 0.042, 0.022, 0.0),
      hairLockTailMain: createSculptedHairLockGeo(0.41, 0.056, 0.076, 0.0),
      hairLockTailSideL: createSculptedHairLockGeo(0.35, 0.042, 0.068, 0.032),
      hairLockTailSideR: createSculptedHairLockGeo(0.35, 0.042, 0.068, -0.032),
      silkRibbonSeg: createSilkRibbonSegGeo(0.023, 0.108),
      hairDark: createHairStrandAlphaTexture('#131112', '#26211e', '#463d37'),
      hairSilver: createHairStrandAlphaTexture('#25252b', '#565964', '#9aa0ae'),
      heroFaceTex: createSeamlessFaceTexture(loadTex(heroFaceUrl, true, 1), '#c89575'),
      heroFaceNrm: createSeamlessFaceAuxTexture(loadTex(heroFaceNrmUrl, false, 1), '#8080ff'),
      heroFaceRough: createSeamlessFaceAuxTexture(loadTex(heroFaceRoughUrl, false, 1), '#b8b8b8'),
      allyFaceTex: createSeamlessFaceTexture(loadTex(allyFaceUrl, true, 1), '#c89575'),
      allyFaceNrm: createSeamlessFaceAuxTexture(loadTex(allyFaceNrmUrl, false, 1), '#8080ff'),
      allyFaceRough: createSeamlessFaceAuxTexture(loadTex(allyFaceRoughUrl, false, 1), '#b8b8b8'),
      vanguardFaceTex: loadTex(vanguardFaceUrl, true, 1),
      vanguardFaceNrm: loadTex(vanguardFaceNrmUrl, false, 1),
      vanguardFaceRough: loadTex(vanguardFaceRoughUrl, false, 1),
      priestFaceTex: loadTex(priestFaceUrl, true, 1),
      priestFaceNrm: loadTex(priestFaceNrmUrl, false, 1),
      priestFaceRough: loadTex(priestFaceRoughUrl, false, 1),
      eliteFaceTex: loadTex(eliteFaceUrl, true, 1),
      eliteFaceNrm: loadTex(eliteFaceNrmUrl, false, 1),
      eliteFaceRough: loadTex(eliteFaceRoughUrl, false, 1),
      bossFaceTex: loadTex(bossFaceUrl, true, 1),
      bossFaceNrm: loadTex(bossFaceNrmUrl, false, 1),
      bossFaceRough: loadTex(bossFaceRoughUrl, false, 1),
      brocadeTex: loadTex(brocadeUrl, true, 2),
      brocadeNrm: loadTex(brocadeNrmUrl, false, 2),
      shanwenTex: loadTex(shanwenUrl, true, 2),
      shanwenNrm: loadTex(shanwenNrmUrl, false, 2),
      ironArmorTex: loadTex(ironArmorUrl, true, 2),
      ironArmorNrm: loadTex(ironArmorNrmUrl, false, 2),
      steelPbr: createForgedSteelPbr(),
      leatherPbr: createLeatherPbr('#241b16'),
      heroClothLinen: createWovenClothPbr('#cfc8bc', '#9c9890', false, true),
      talismanTex: createTalismanTexture(),
    };
  }
  return SHARED_ASSETS;
}

export interface HeroArmorVisual {
  rarity: EquipRarity;
  tintHex?: string;
}

export interface HeroRelicVisual {
  rarity: EquipRarity;
  auraHex?: string;
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

  // Seamless continuous SkinnedMesh anatomical body (zero ball-and-cylinder toy seams!)
  private readonly torsoRig: ContinuousTorsoRig;
  private readonly rArmRig: ContinuousLimbRig;
  private readonly lArmRig: ContinuousLimbRig;
  private readonly rLegRig: ContinuousLimbRig;
  private readonly lLegRig: ContinuousLimbRig;

  private readonly rHandGroup: THREE.Group;
  private readonly lHandGroup: THREE.Group;
  private readonly rFootMesh: THREE.Mesh;
  private readonly lFootMesh: THREE.Mesh;

  private readonly ribbonSegs: THREE.Mesh[][] = [];
  private readonly skirtPanels: THREE.Object3D[] = [];
  private readonly capeMesh?: THREE.Mesh;
  private readonly floatingOrbitals: THREE.Object3D[] = [];
  private readonly weaponGlowMat: THREE.MeshStandardMaterial;
  private bladeSteelMat?: THREE.MeshPhysicalMaterial;
  private weaponEdgeMat?: THREE.MeshStandardMaterial;
  private guardCrystalMat?: THREE.MeshPhysicalMaterial;
  private bossRelicEmberMat?: THREE.MeshStandardMaterial;
  private readonly bossRimHandles: SilhouetteRimHandle[] = [];
  private bossArmorMat?: THREE.MeshStandardMaterial;
  private bossTrimMat?: THREE.MeshStandardMaterial;
  private bossOrnamentGroup: THREE.Group | null = null;
  private bossWheelMesh: THREE.Object3D | null = null;
  private bossWingBlades: THREE.Object3D[] = [];
  private readonly skinPrimaryMat?: THREE.MeshPhysicalMaterial;
  private readonly skinSecondaryMat?: THREE.MeshPhysicalMaterial;
  private readonly skinRobeInnerMat?: THREE.MeshPhysicalMaterial;
  private readonly skinAccentMat?: THREE.MeshPhysicalMaterial;
  private readonly skinTrimMat?: THREE.MeshStandardMaterial;
  private readonly skinBronzeMat?: THREE.MeshStandardMaterial;
  private readonly heroHairMat?: THREE.MeshPhysicalMaterial;
  private readonly heroHairBaseMat?: THREE.MeshPhysicalMaterial;
  private heroPonytailGroup?: THREE.Group;
  private readonly heroCrownVariants: Partial<Record<string, THREE.Group>> = {};
  private readonly heroSkinOrnaments: Partial<Record<string, THREE.Group>> = {};
  private heroFrostCrystals: THREE.Object3D[] = [];
  private heroFlamePlumes: THREE.Object3D[] = [];
  private heroStarWheel: THREE.Object3D | null = null;
  private heroSunHalo: THREE.Object3D | null = null;
  private heroSunFeathers: THREE.Object3D[] = [];
  private activeHeroSkinId = 'skin_xiaoyao';
  private heroArmorGroup?: THREE.Group;
  private heroArmorPlateMat?: THREE.MeshPhysicalMaterial;
  private heroArmorTrimMat?: THREE.MeshStandardMaterial;
  private heroArmorRarity: EquipRarity = 'common';
  private heroRelicGroup?: THREE.Group;
  private heroRelicOrbitals: THREE.Object3D[] = [];
  private heroRelicHalo?: THREE.Mesh;
  private heroRelicOrbMat?: THREE.MeshStandardMaterial;
  private heroRelicTalMat?: THREE.MeshStandardMaterial;
  private heroRelicHaloMat?: THREE.MeshBasicMaterial;
  private heroRelicRarity: EquipRarity = 'common';
  private readonly flashMats: THREE.MeshStandardMaterial[] = [];
  private readonly flashMatBase: Array<{ mat: THREE.MeshStandardMaterial; emissive: THREE.Color; intensity: number }> = [];
  private readonly gourdMesh?: THREE.Group;
  private readonly gourdHipMount?: THREE.Group;

  private weaponDrawn = true;
  private hitFlash = 0;
  private ribbonPhase = 0;
  private phase2Active = false;
  private weaponTierFactor = 0.08;
  private weaponTierBoost = 0.65;
  private swordGlowInput = 0.85;

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
  private readonly _lowerQuat = new THREE.Quaternion();
  private readonly _shoulderLocalR = new THREE.Vector3();
  private readonly _shoulderLocalL = new THREE.Vector3();

  // True 7.7-head live-action athletic adult human proportions
  private readonly hipY = 0.98;
  private readonly shoulderX: number;
  private readonly hipX = 0.122;
  private readonly upperArmLen = 0.32;
  private readonly foreArmLen = 0.30;
  private readonly thighLen = 0.48;
  private readonly shinLen = 0.48;

  constructor(archetype: CharacterArchetype) {
    const assets = getSharedAssets();
    this.archetype = archetype;
    this.scale =
      archetype === 'boss'
        ? 1.52
        : archetype === 'elite'
          ? 1.22
          : archetype === 'bladesman'
            ? 1.07
            : archetype === 'caster'
              ? 1.04
              : 1.02;

    const isHeroLike = archetype === 'xiaoyao' || archetype === 'ally';
    const isBossOrElite = archetype === 'boss' || archetype === 'elite';
    this.shoulderX = archetype === 'boss' ? 0.272 : archetype === 'elite' ? 0.252 : isHeroLike ? 0.232 : 0.242;
    this._shoulderLocalR.set(-this.shoulderX, 0.455, 0.0);
    this._shoulderLocalL.set(this.shoulderX, 0.455, 0.0);

    this.root.add(this.bodyGroup);
    this.bodyGroup.scale.setScalar(this.scale);

    // Grounded contact shadow
    const shadowMat = new THREE.MeshBasicMaterial({
      map: assets.shadowTex,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    const shadow = new THREE.Mesh(assets.shadow, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.032;
    this.bodyGroup.add(shadow);

    const palette = this.buildPalette(archetype, assets);
    this.weaponGlowMat = palette.weaponGlow;
    if (archetype === 'xiaoyao') {
      this.skinPrimaryMat = palette.primary as THREE.MeshPhysicalMaterial;
      this.skinSecondaryMat = palette.secondary as THREE.MeshPhysicalMaterial;
      this.skinRobeInnerMat = palette.robeInner as THREE.MeshPhysicalMaterial;
      this.skinAccentMat = palette.accent as THREE.MeshPhysicalMaterial;
      this.skinTrimMat = palette.trim as THREE.MeshStandardMaterial;
      this.skinBronzeMat = palette.bronze;
      this.heroHairMat = palette.hair as THREE.MeshPhysicalMaterial;
      this.heroHairBaseMat = palette.hairBase as THREE.MeshPhysicalMaterial;
    } else if (archetype === 'boss') {
      this.bossArmorMat = palette.primary as THREE.MeshStandardMaterial;
      this.bossTrimMat = palette.trim as THREE.MeshStandardMaterial;
    }
    this.flashMats.push(palette.primary, palette.secondary, palette.armor);
    for (const m of this.flashMats) {
      this.flashMatBase.push({
        mat: m,
        emissive: m.emissive.clone(),
        intensity: m.emissiveIntensity,
      });
    }

    // Pelvis Root & Seamless Continuous Torso SkinnedMesh
    this.pelvis.position.set(0, this.hipY, 0);
    this.bodyGroup.add(this.pelvis);

    const torsoStyle =
      archetype === 'boss'
        ? 'boss'
        : archetype === 'elite' || archetype === 'bladesman'
          ? 'armored'
          : archetype === 'caster'
            ? 'robe'
            : 'hero';
    const torsoMat = isHeroLike ? palette.primary : archetype === 'caster' ? palette.robeOuter : palette.armor;
    this.torsoRig = createSeamlessTorsoSkinnedMesh(torsoStyle, torsoMat);
    this.pelvis.add(this.torsoRig.mesh);

    // Sculpted Waist Belt & Ornate Cast-Bronze Clasp
    const belt = new THREE.Mesh(assets.belt, palette.leather);
    belt.scale.set(1.06, 1, 0.80);
    belt.position.y = 0.04;
    this.pelvis.add(belt);

    const buckleBase = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.045, 0.022, 16), palette.bronze);
    buckleBase.rotation.x = Math.PI / 2;
    buckleBase.scale.set(1.12, 0.92, 0.72);
    buckleBase.position.set(0, 0.04, 0.156);
    this.pelvis.add(buckleBase);

    const sashCord = new THREE.Mesh(new THREE.TorusGeometry(0.182, 0.016, 10, 26), palette.accent);
    sashCord.rotation.x = Math.PI / 2;
    sashCord.scale.set(1.04, 0.80, 1);
    sashCord.position.y = 0.008;
    this.pelvis.add(sashCord);

    // Draped Pleated Robe Coat-Tails / Lamellar War Tassets
    const frontSkirt = new THREE.Mesh(assets.frontSkirt, palette.robeOuter);
    frontSkirt.position.set(0, 0.005, 0);
    frontSkirt.castShadow = true;
    this.pelvis.add(frontSkirt);
    this.skirtPanels.push(frontSkirt);

    const backSkirt = new THREE.Mesh(assets.backSkirt, palette.robeOuter);
    backSkirt.rotation.y = Math.PI;
    backSkirt.position.set(0, 0.005, 0);
    backSkirt.castShadow = true;
    this.pelvis.add(backSkirt);
    this.skirtPanels.push(backSkirt);

    const leftSkirt = new THREE.Mesh(assets.sideSkirt, palette.robeInner);
    leftSkirt.rotation.y = Math.PI / 2;
    leftSkirt.position.set(0, 0.005, 0);
    leftSkirt.castShadow = true;
    this.pelvis.add(leftSkirt);
    this.skirtPanels.push(leftSkirt);

    const rightSkirt = new THREE.Mesh(assets.sideSkirt, palette.robeInner);
    rightSkirt.rotation.y = -Math.PI / 2;
    rightSkirt.position.set(0, 0.005, 0);
    rightSkirt.castShadow = true;
    this.pelvis.add(rightSkirt);
    this.skirtPanels.push(rightSkirt);

    // Upper Torso Attachment Group (locked to chestBone pivot at y = 0.09)
    this.torso.position.set(0, 0.09, 0);
    this.pelvis.add(this.torso);

    // Form-Fitting Curved Hanfu Cross-Collar Lapels (交领右衽) for cloth characters
    if (isHeroLike || archetype === 'caster') {
      const collarL = new THREE.Mesh(assets.collarHeroL, palette.trim);
      collarL.position.y = -0.09;
      const collarR = new THREE.Mesh(assets.collarHeroR, palette.trim);
      collarR.position.y = -0.09;
      this.torso.add(collarL, collarR);
    }

    // Sculpted Curved Shoulder Pauldrons / Draped Hanfu Shoulder Yokes
    for (const side of [-1, 1]) {
      const sh = new THREE.Mesh(
        isHeroLike ? assets.pauldronCloth : assets.pauldronArmor,
        isHeroLike ? palette.secondary : palette.armor,
      );
      if (isHeroLike) {
        sh.scale.set(0.92, 0.85, 0.94);
        sh.position.set(side * 0.215, 0.458, 0.0);
        sh.rotation.set(0, side > 0 ? 0 : Math.PI, side * -0.18);
      } else if (archetype === 'boss') {
        sh.scale.set(1.42, 1.18, 1.32);
        sh.position.set(side * 0.272, 0.478, 0.0);
        sh.rotation.set(0, side > 0 ? 0 : Math.PI, side * -0.24);
      } else if (archetype === 'elite') {
        sh.scale.set(1.24, 1.04, 1.18);
        sh.position.set(side * 0.252, 0.468, 0.0);
        sh.rotation.set(0, side > 0 ? 0 : Math.PI, side * -0.22);
      } else {
        sh.scale.set(1.06, 0.94, 1.04);
        sh.position.set(side * 0.236, 0.46, 0.0);
        sh.rotation.set(0, side > 0 ? 0 : Math.PI, side * -0.2);
      }
      sh.castShadow = true;
      this.torso.add(sh);
    }

    this.weaponBackMount.position.set(0.04, 0.39, -0.175);
    this.weaponBackMount.rotation.set(0.1, 0, -2.52);
    this.torso.add(this.weaponBackMount);

    // Anatomically Proportioned Head Mounted Seamlessly Above Sculpted Neck Root
    this.head.position.set(0, isHeroLike ? 0.524 : 0.512, 0.01);
    this.torso.add(this.head);
    this.buildHeadDetails(archetype, palette, assets);

    // Tailored Collar / Lowered Forged Iron Gorget (cleanly seals torso linen top at y=0.520 so smooth warm skin neck shows above!)
    if (isHeroLike || archetype === 'caster') {
      const innerCollar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.064, 0.080, 0.028, 22, 1, true),
        palette.primary,
      );
      innerCollar.position.set(0, 0.504, 0.008);
      this.torso.add(innerCollar);
      const outerCollar = new THREE.Mesh(
        new THREE.TorusGeometry(0.075, 0.010, 10, 24),
        palette.secondary,
      );
      outerCollar.rotation.x = Math.PI / 2 + 0.14;
      outerCollar.position.set(0, 0.520, 0.012);
      this.torso.add(outerCollar);
    } else {
      const gorget = new THREE.Mesh(
        new THREE.CylinderGeometry(0.084, 0.122, 0.068, 22),
        palette.armor,
      );
      gorget.position.set(0, 0.504, 0.01);
      this.torso.add(gorget);
      const gorgetTrim = new THREE.Mesh(
        new THREE.TorusGeometry(0.086, 0.011, 10, 24),
        palette.bronze,
      );
      gorgetTrim.rotation.x = Math.PI / 2 + 0.1;
      gorgetTrim.position.set(0, 0.536, 0.012);
      this.torso.add(gorgetTrim);
    }

    // Grounded Realistic Archetype Accessories
    if (isHeroLike) {
      const chestStrap = new THREE.Mesh(assets.strapHero, palette.leather);
      chestStrap.position.y = -0.09;
      this.torso.add(chestStrap);

      const scabbard = createSculptedScabbardGroup(palette.leather, palette.bronze);
      this.weaponBackMount.add(scabbard);

      // Authentic carved Celadon Jade Pendant (玉佩) hanging at waist
      const jade = new THREE.Mesh(
        new THREE.TorusGeometry(0.032, 0.01, 10, 20),
        new THREE.MeshPhysicalMaterial({
          color: archetype === 'ally' ? '#66b4a8' : '#4a8a7e',
          roughness: 0.22,
          metalness: 0.05,
          clearcoat: 0.6,
          clearcoatRoughness: 0.18,
        }),
      );
      jade.position.set(-0.185, -0.05, 0.115);
      this.pelvis.add(jade);

      this.gourdHipMount = new THREE.Group();
      this.gourdHipMount.position.set(0.23, -0.04, -0.09);
      this.pelvis.add(this.gourdHipMount);
      this.gourdMesh = this.buildWineGourd(palette.bronze, palette.accent);
      this.gourdHipMount.add(this.gourdMesh);

      if (archetype === 'xiaoyao') {
        this.buildHeroArmorAndRelicVisuals(assets);
        this.buildHeroSkinOrnaments();
      }
    } else if (archetype === 'bladesman') {
      const strap = new THREE.Mesh(assets.strapVanguard, palette.leather);
      strap.position.y = -0.09;
      this.torso.add(strap);
      const mirror = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.088, 0.018, 22), palette.bronze);
      mirror.rotation.x = Math.PI / 2;
      mirror.position.set(0, 0.34, 0.165);
      this.torso.add(mirror);
    } else if (archetype === 'elite') {
      const cape = new THREE.Mesh(assets.capePanel, palette.accent);
      cape.rotation.y = Math.PI;
      cape.position.set(0, 0.48, -0.055);
      cape.castShadow = true;
      this.torso.add(cape);
      this.capeMesh = cape;

      const mirrorBezel = new THREE.Mesh(new THREE.TorusGeometry(0.102, 0.014, 12, 28), palette.bronze);
      mirrorBezel.position.set(0, 0.345, 0.174);
      this.torso.add(mirrorBezel);
      const mirrorDome = new THREE.Mesh(
        new THREE.SphereGeometry(0.096, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.44),
        new THREE.MeshStandardMaterial({
          map: assets.steelPbr.map,
          bumpMap: assets.steelPbr.bumpMap,
          bumpScale: 0.018,
          color: '#885658',
          roughness: 0.24,
          metalness: 0.9,
        }),
      );
      mirrorDome.rotation.x = Math.PI / 2;
      mirrorDome.scale.set(1, 0.32, 1);
      mirrorDome.position.set(0, 0.345, 0.168);
      this.torso.add(mirrorDome);
    } else if (archetype === 'caster') {
      const talMat = new THREE.MeshStandardMaterial({
        map: assets.talismanTex,
        emissive: new THREE.Color('#6b32d6'),
        emissiveIntensity: 0.46,
        roughness: 0.85,
        side: THREE.DoubleSide,
      });
      const talGeo = new THREE.PlaneGeometry(0.088, 0.25);
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
      cape.position.set(0, 0.49, -0.058);
      cape.castShadow = true;
      this.torso.add(cape);
      this.capeMesh = cape;

      // Convex Hammered Forged-Steel & Bronze Sovereign Chest Mirror (护心镜 — specular metallic dome, zero black hole!)
      const mirrorBezel = new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.016, 12, 32), palette.bronze);
      mirrorBezel.position.set(0, 0.345, 0.182);
      this.torso.add(mirrorBezel);

      const mirrorDome = new THREE.Mesh(
        new THREE.SphereGeometry(0.106, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.44),
        new THREE.MeshStandardMaterial({
          map: assets.steelPbr.map,
          bumpMap: assets.steelPbr.bumpMap,
          bumpScale: 0.02,
          color: '#8e847e',
          roughness: 0.22,
          metalness: 0.92,
        }),
      );
      mirrorDome.rotation.x = Math.PI / 2;
      mirrorDome.scale.set(1, 0.34, 1);
      mirrorDome.position.set(0, 0.345, 0.174);
      const mirrorBossStud = new THREE.Mesh(new THREE.SphereGeometry(0.024, 14, 10), palette.bronze);
      mirrorBossStud.scale.set(1, 1, 0.55);
      mirrorBossStud.position.set(0, 0.345, 0.205);
      this.torso.add(mirrorDome, mirrorBossStud);

      // Restrained forged dark-iron & oxidized-bronze floating war-relic swords (NO cartoon neon torus rings!)
      const relicSteelMat = new THREE.MeshStandardMaterial({
        map: assets.steelPbr.map,
        bumpMap: assets.steelPbr.bumpMap,
        bumpScale: 0.02,
        roughnessMap: assets.steelPbr.roughnessMap,
        color: '#b8c0ca',
        emissive: new THREE.Color('#2a090d'),
        emissiveIntensity: 0.22,
        roughness: 0.28,
        metalness: 0.88,
      });
      const emberFullerMat = new THREE.MeshStandardMaterial({
        color: '#802026',
        emissive: new THREE.Color('#b6282e'),
        emissiveIntensity: 0.72,
        roughness: 0.35,
        metalness: 0.6,
      });
      this.bossRelicEmberMat = emberFullerMat;
      for (const ang of [-0.72, 0, 0.72]) {
        const sw = new THREE.Group();
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.042, 0.84, 4), relicSteelMat);
        b.scale.set(1, 1, 0.28);
        b.rotation.y = Math.PI / 4;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.18, 4), relicSteelMat);
        tip.scale.set(1, 1, 0.28);
        tip.rotation.y = Math.PI / 4;
        tip.position.y = 0.51;
        const fuller = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.01, 0.74, 4), emberFullerMat);
        fuller.scale.set(1, 1, 0.55);
        fuller.rotation.y = Math.PI / 4;
        const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.024, 0.25, 8), palette.bronze);
        guard.rotation.z = Math.PI / 2;
        guard.position.y = -0.41;
        const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.18, 8), palette.leather);
        hilt.position.y = -0.51;
        const pommel = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 8, 16), palette.bronze);
        pommel.position.y = -0.62;
        sw.add(b, tip, fuller, guard, hilt, pommel);
        sw.position.set(Math.sin(ang) * 0.68, 0.74 + Math.cos(ang) * 0.22, -0.36);
        sw.rotation.z = -ang * 0.78;
        sw.userData.baseY = sw.position.y;
        sw.userData.phase = ang * 2.1;
        this.torso.add(sw);
        this.floatingOrbitals.push(sw);
      }
    }

    // Continuous Seamless SkinnedMesh Arms & Legs (ZERO floating shoulder/elbow/knee sphere seams!)
    const upperArmMat = isHeroLike ? palette.primary : archetype === 'caster' ? palette.robeOuter : palette.armor;
    const foreArmMat = isHeroLike ? palette.leather : archetype === 'caster' ? palette.secondary : palette.armor;
    const lowerLegMat = isBossOrElite ? palette.armor : palette.leather;

    const armSpec = {
      kind: 'arm' as const,
      upperLen: this.upperArmLen,
      lowerLen: this.foreArmLen,
      topCapRadius: isBossOrElite ? 0.088 : 0.072,
      upperRadii: isBossOrElite
        ? ([
            [0.086, 0.0],
            [0.078, 0.35],
            [0.068, 0.85],
            [0.064, 1.0],
          ] as Array<[number, number]>)
        : ([
            [0.072, 0.0],
            [0.068, 0.42],
            [0.061, 0.86],
            [0.056, 1.0],
          ] as Array<[number, number]>),
      lowerRadii: isBossOrElite
        ? ([
            [0.064, 0.0],
            [0.068, 0.25],
            [0.056, 0.72],
            [0.044, 1.0],
          ] as Array<[number, number]>)
        : ([
            [0.056, 0.0],
            [0.058, 0.24],
            [0.048, 0.72],
            [0.039, 1.0],
          ] as Array<[number, number]>),
      splitT: 0.56,
      clothFolds: isHeroLike || archetype === 'caster',
      cuffRidge: 0.009,
    };

    const legSpec = {
      kind: 'leg' as const,
      upperLen: this.thighLen,
      lowerLen: this.shinLen,
      topCapRadius: isBossOrElite ? 0.104 : 0.092,
      upperRadii: isBossOrElite
        ? ([
            [0.102, 0.0],
            [0.098, 0.35],
            [0.084, 0.82],
            [0.074, 1.0],
          ] as Array<[number, number]>)
        : ([
            [0.092, 0.0],
            [0.088, 0.35],
            [0.074, 0.82],
            [0.064, 1.0],
          ] as Array<[number, number]>),
      lowerRadii: isBossOrElite
        ? ([
            [0.074, 0.0],
            [0.076, 0.3],
            [0.062, 0.76],
            [0.048, 1.0],
          ] as Array<[number, number]>)
        : ([
            [0.064, 0.0],
            [0.066, 0.3],
            [0.054, 0.76],
            [0.044, 1.0],
          ] as Array<[number, number]>),
      splitT: 0.54,
      clothFolds: true,
      cuffRidge: 0.008,
    };

    this.rArmRig = createSeamlessLimbSkinnedMesh(armSpec, upperArmMat, foreArmMat);
    this.lArmRig = createSeamlessLimbSkinnedMesh(armSpec, upperArmMat, foreArmMat);
    this.rLegRig = createSeamlessLimbSkinnedMesh(legSpec, palette.pants, lowerLegMat);
    this.lLegRig = createSeamlessLimbSkinnedMesh(legSpec, palette.pants, lowerLegMat);
    this.bodyGroup.add(this.rArmRig.mesh, this.lArmRig.mesh, this.rLegRig.mesh, this.lLegRig.mesh);

    // Anatomically Sculpted Rounded Hands & Martial Leather Boots
    const handMat = isHeroLike || archetype === 'caster' ? palette.skin : isBossOrElite ? palette.armor : palette.leather;
    this.rHandGroup = createRealisticHandGroup(handMat, 'grip');
    this.lHandGroup = createRealisticHandGroup(handMat, isHeroLike ? 'swordFinger' : 'grip');

    this.rFootMesh = new THREE.Mesh(assets.boot, palette.leather);
    this.lFootMesh = new THREE.Mesh(assets.boot, palette.leather);
    this.rFootMesh.castShadow = true;
    this.lFootMesh.castShadow = true;
    this.bodyGroup.add(this.rHandGroup, this.lHandGroup, this.rFootMesh, this.lFootMesh);

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
      color: '#a8874e',
      roughness: 0.36,
      metalness: 0.86,
    });
    const leather = new THREE.MeshStandardMaterial({
      map: assets.leatherPbr.map,
      bumpMap: assets.leatherPbr.bumpMap,
      bumpScale: 0.045,
      roughnessMap: assets.leatherPbr.roughnessMap,
      roughness: 0.82,
      metalness: 0.08,
    });

    const indigoBrocade = new THREE.MeshPhysicalMaterial({
      map: assets.brocadeTex,
      normalMap: assets.brocadeNrm,
      normalScale: new THREE.Vector2(0.95, 0.95),
      roughness: 0.84,
      metalness: 0.06,
      sheen: 0.38,
      sheenColor: new THREE.Color('#5a7490'),
      sheenRoughness: 0.78,
      side: THREE.DoubleSide,
    });

    const shanwenArmor = new THREE.MeshStandardMaterial({
      map: assets.shanwenTex,
      normalMap: assets.shanwenNrm,
      normalScale: new THREE.Vector2(1.25, 1.25),
      roughness: 0.42,
      metalness: 0.78,
      color: new THREE.Color('#c2bec6'),
      side: THREE.DoubleSide,
    });

    const makeHairMat = (hairTex: ReturnType<typeof createHairStrandAlphaTexture>, rough = 0.56) =>
      new THREE.MeshStandardMaterial({
        map: hairTex.map,
        alphaMap: hairTex.alphaMap,
        bumpMap: hairTex.bumpMap,
        bumpScale: 0.018,
        alphaTest: 0.22,
        roughness: rough,
        metalness: 0.08,
        side: THREE.DoubleSide,
      });

    const makeGlossyHeroHairMat = (colorHex = '#161314', sheenHex = '#4c433e') =>
      new THREE.MeshPhysicalMaterial({
        color: colorHex,
        roughness: 0.40,
        metalness: 0.06,
        sheen: 0.55,
        sheenColor: new THREE.Color(sheenHex),
        sheenRoughness: 0.44,
        clearcoat: 0.22,
        clearcoatRoughness: 0.36,
      });

    const makeGlossyHeroHairBaseMat = (colorHex = '#141112', sheenHex = '#403835') =>
      new THREE.MeshPhysicalMaterial({
        color: colorHex,
        roughness: 0.46,
        metalness: 0.05,
        sheen: 0.48,
        sheenColor: new THREE.Color(sheenHex),
        sheenRoughness: 0.48,
      });

    const makeSkinMat = (
      neckHex: string,
      sssHex: string,
      sssStrength: number,
      opts?: { sheen?: number; sheenColor?: string; emissive?: string; emissiveIntensity?: number; roughness?: number },
    ) =>
      applyHumanSkinSss(
        new THREE.MeshPhysicalMaterial({
          color: neckHex,
          roughness: opts?.roughness ?? 0.64,
          metalness: 0.0,
          sheen: opts?.sheen ?? 0.14,
          sheenColor: new THREE.Color(opts?.sheenColor ?? '#c4886c'),
          sheenRoughness: 0.74,
          emissive: new THREE.Color(opts?.emissive ?? '#140a06'),
          emissiveIntensity: opts?.emissiveIntensity ?? 0.04,
        }),
        sssHex,
        sssStrength,
      );

    const makeFaceMat = (
      map: THREE.Texture,
      nrm: THREE.Texture,
      rough: THREE.Texture,
      normalScale: number,
      sssHex: string,
      sssStrength: number,
      opts?: { roughness?: number; sheen?: number; sheenColor?: string; emissive?: string; emissiveIntensity?: number },
    ) =>
      applyHumanSkinSss(
        new THREE.MeshPhysicalMaterial({
          map,
          normalMap: nrm,
          normalScale: new THREE.Vector2(normalScale, normalScale),
          roughnessMap: rough,
          roughness: opts?.roughness ?? 0.92, // multiplied by anatomical roughnessMap
          metalness: 0.0,
          sheen: opts?.sheen ?? 0.12,
          sheenColor: new THREE.Color(opts?.sheenColor ?? '#d29a82'),
          sheenRoughness: 0.74,
          emissive: new THREE.Color(opts?.emissive ?? '#1a0e09'),
          emissiveIntensity: opts?.emissiveIntensity ?? 0.04,
        }),
        sssHex,
        sssStrength,
      );

    if (archetype === 'xiaoyao') {
      const heroBronze = bronze.clone();
      const heroPrimary = applySilhouetteRim(
        new THREE.MeshPhysicalMaterial({
          map: assets.heroClothLinen.map,
          bumpMap: assets.heroClothLinen.bumpMap,
          bumpScale: 0.04,
          roughness: 0.88,
          metalness: 0.02,
          sheen: 0.24,
          sheenColor: new THREE.Color('#ded6c8'),
          sheenRoughness: 0.84,
        }),
        '#6ad8e8',
        0.2,
        3.1,
      );
      applySilhouetteRim(indigoBrocade, '#5ecae0', 0.3, 2.9);
      return {
        primary: heroPrimary,
        secondary: indigoBrocade,
        robeOuter: indigoBrocade,
        robeInner: new THREE.MeshPhysicalMaterial({
          map: assets.heroClothLinen.map,
          bumpMap: assets.heroClothLinen.bumpMap,
          bumpScale: 0.038,
          roughness: 0.9,
          metalness: 0.02,
          side: THREE.DoubleSide,
        }),
        armor: leather,
        accent: new THREE.MeshPhysicalMaterial({
          color: '#6e1e1c',
          roughness: 0.8,
          metalness: 0.04,
          sheen: 0.28,
          sheenColor: new THREE.Color('#9e3e38'),
          side: THREE.DoubleSide,
        }),
        trim: new THREE.MeshStandardMaterial({ color: '#1a2a3c', roughness: 0.8, metalness: 0.08 }),
        bronze: heroBronze,
        leather,
        skin: makeSkinMat('#c89474', '#df653e', 0.36, {
          roughness: 0.64,
          sheen: 0.15,
          sheenColor: '#e6ae8f',
          emissive: '#22120a',
          emissiveIntensity: 0.07,
        }),
        faceMat: makeFaceMat(assets.heroFaceTex, assets.heroFaceNrm, assets.heroFaceRough, 0.62, '#df653e', 0.36, {
          roughness: 0.86,
          sheen: 0.15,
          sheenColor: '#e6ae8f',
          emissive: '#22120a',
          emissiveIntensity: 0.07,
        }),
        hair: makeGlossyHeroHairMat('#161314', '#4c433e'),
        hairBase: makeGlossyHeroHairBaseMat('#141112', '#403835'),
        pants: new THREE.MeshStandardMaterial({ color: '#1a2028', roughness: 0.9 }),
        weaponGlow: new THREE.MeshStandardMaterial({
          map: assets.steelPbr.map,
          color: '#cfdbe2',
          emissive: new THREE.Color('#1d6a7c'),
          emissiveIntensity: 0.28,
          roughness: 0.2,
          metalness: 0.92,
        }),
      };
    }

    const ironArmor = new THREE.MeshStandardMaterial({
      map: assets.ironArmorTex,
      normalMap: assets.ironArmorNrm,
      normalScale: new THREE.Vector2(1.3, 1.3),
      roughness: 0.38,
      metalness: 0.74,
      color: new THREE.Color('#c8ced6'),
      side: THREE.DoubleSide,
    });

    if (archetype === 'ally') {
      const silverBrocade = indigoBrocade.clone();
      silverBrocade.color.set('#7496ac');
      applySilhouetteRim(silverBrocade, '#62dbb8', 0.3, 2.9);
      const allyPrimary = applySilhouetteRim(
        new THREE.MeshPhysicalMaterial({
          map: assets.heroClothLinen.map,
          bumpMap: assets.heroClothLinen.bumpMap,
          bumpScale: 0.04,
          color: '#243244',
          roughness: 0.86,
          metalness: 0.04,
          sheen: 0.28,
          sheenColor: new THREE.Color('#7ca2b8'),
          sheenRoughness: 0.8,
        }),
        '#62dbb8',
        0.24,
        3.0,
      );
      return {
        primary: allyPrimary,
        secondary: silverBrocade,
        robeOuter: silverBrocade,
        robeInner: new THREE.MeshPhysicalMaterial({
          map: assets.heroClothLinen.map,
          color: '#c8d2dc',
          roughness: 0.88,
          side: THREE.DoubleSide,
        }),
        armor: leather,
        accent: new THREE.MeshPhysicalMaterial({
          color: '#1c5e58',
          roughness: 0.78,
          metalness: 0.04,
          sheen: 0.28,
          sheenColor: new THREE.Color('#4ca89c'),
          side: THREE.DoubleSide,
        }),
        trim: new THREE.MeshStandardMaterial({ color: '#b4c2ce', roughness: 0.68, metalness: 0.2 }),
        bronze,
        leather,
        skin: makeSkinMat('#c89474', '#df653e', 0.36, {
          roughness: 0.64,
          sheen: 0.15,
          sheenColor: '#e6ae8f',
          emissive: '#22120a',
          emissiveIntensity: 0.07,
        }),
        faceMat: makeFaceMat(assets.allyFaceTex, assets.allyFaceNrm, assets.allyFaceRough, 0.62, '#df653e', 0.36, {
          roughness: 0.86,
          sheen: 0.15,
          sheenColor: '#e6ae8f',
          emissive: '#22120a',
          emissiveIntensity: 0.07,
        }),
        hair: makeGlossyHeroHairMat('#15161c', '#454b58'),
        hairBase: makeGlossyHeroHairBaseMat('#131418', '#3a3f4a'),
        pants: new THREE.MeshStandardMaterial({ color: '#161d28', roughness: 0.9 }),
        weaponGlow: new THREE.MeshStandardMaterial({
          map: assets.steelPbr.map,
          color: '#cce0dc',
          emissive: new THREE.Color('#207868'),
          emissiveIntensity: 0.32,
          roughness: 0.2,
          metalness: 0.92,
        }),
      };
    }

    if (archetype === 'bladesman') {
      applySilhouetteRim(ironArmor, '#d95236', 0.42, 2.7);
      const bladesmanAccent = applySilhouetteRim(
        new THREE.MeshPhysicalMaterial({
          color: '#6e1e18',
          roughness: 0.78,
          sheen: 0.3,
          sheenColor: new THREE.Color('#a44236'),
          side: THREE.DoubleSide,
        }),
        '#e25b3c',
        0.34,
        2.7,
      );
      return {
        primary: ironArmor,
        secondary: new THREE.MeshStandardMaterial({ color: '#381c1d', roughness: 0.82, metalness: 0.14 }),
        robeOuter: ironArmor,
        robeInner: new THREE.MeshStandardMaterial({ color: '#2d1617', roughness: 0.88, side: THREE.DoubleSide }),
        armor: ironArmor,
        accent: bladesmanAccent,
        trim: new THREE.MeshStandardMaterial({ color: '#45201a', roughness: 0.76 }),
        bronze,
        leather,
        skin: makeSkinMat('#573b2b', '#b84824', 0.3),
        faceMat: makeFaceMat(assets.vanguardFaceTex, assets.vanguardFaceNrm, assets.vanguardFaceRough, 0.9, '#b84824', 0.32),
        hair: makeHairMat(assets.hairDark, 0.66),
        hairBase: new THREE.MeshStandardMaterial({ color: '#1a1514', roughness: 0.78 }),
        pants: new THREE.MeshStandardMaterial({ color: '#1f1b1b', roughness: 0.9 }),
        weaponGlow: new THREE.MeshStandardMaterial({
          map: assets.steelPbr.map,
          color: '#e0a888',
          emissive: new THREE.Color('#a83218'),
          emissiveIntensity: 0.44,
          roughness: 0.26,
          metalness: 0.9,
        }),
      };
    }

    if (archetype === 'elite') {
      const eliteArmor = ironArmor.clone();
      eliteArmor.color.set('#ad4e54');
      eliteArmor.emissive.set('#2a080c');
      eliteArmor.emissiveIntensity = 0.22;
      eliteArmor.roughness = 0.32;
      eliteArmor.metalness = 0.74;
      applySilhouetteRim(eliteArmor, '#ff4838', 0.66, 2.5);
      const eliteAccent = applySilhouetteRim(
        new THREE.MeshPhysicalMaterial({
          color: '#6b1820',
          roughness: 0.78,
          sheen: 0.36,
          sheenColor: new THREE.Color('#c4424c'),
          side: THREE.DoubleSide,
        }),
        '#ff5a42',
        0.52,
        2.5,
      );
      return {
        primary: eliteArmor,
        secondary: new THREE.MeshStandardMaterial({ color: '#44151b', roughness: 0.8, metalness: 0.2 }),
        robeOuter: eliteArmor,
        robeInner: new THREE.MeshStandardMaterial({ color: '#331116', roughness: 0.86, side: THREE.DoubleSide }),
        armor: eliteArmor,
        accent: eliteAccent,
        trim: new THREE.MeshStandardMaterial({ color: '#782626', roughness: 0.66, metalness: 0.28 }),
        bronze,
        leather,
        skin: makeSkinMat('#553428', '#b84226', 0.32),
        faceMat: makeFaceMat(assets.eliteFaceTex, assets.eliteFaceNrm, assets.eliteFaceRough, 0.92, '#b84226', 0.34),
        hair: makeHairMat(assets.hairDark, 0.62),
        hairBase: new THREE.MeshStandardMaterial({ color: '#181414', roughness: 0.76 }),
        pants: new THREE.MeshStandardMaterial({ color: '#1d171b', roughness: 0.88 }),
        weaponGlow: new THREE.MeshStandardMaterial({
          map: assets.steelPbr.map,
          color: '#eab0a4',
          emissive: new THREE.Color('#c2242e'),
          emissiveIntensity: 0.68,
          roughness: 0.24,
          metalness: 0.9,
        }),
      };
    }

    if (archetype === 'caster') {
      const casterBrocade = indigoBrocade.clone();
      casterBrocade.color.set('#565268');
      casterBrocade.emissive.set('#1a0e32');
      casterBrocade.emissiveIntensity = 0.16;
      applySilhouetteRim(casterBrocade, '#9c60ff', 0.58, 2.5);
      const casterAccent = applySilhouetteRim(
        new THREE.MeshPhysicalMaterial({
          color: '#463760',
          roughness: 0.78,
          sheen: 0.3,
          sheenColor: new THREE.Color('#8e74c0'),
          side: THREE.DoubleSide,
        }),
        '#b078ff',
        0.48,
        2.5,
      );
      return {
        primary: casterBrocade,
        secondary: new THREE.MeshStandardMaterial({ color: '#292436', roughness: 0.84 }),
        robeOuter: casterBrocade,
        robeInner: new THREE.MeshStandardMaterial({ color: '#1f1b2a', roughness: 0.9, side: THREE.DoubleSide }),
        armor: casterBrocade,
        accent: casterAccent,
        trim: new THREE.MeshStandardMaterial({ color: '#5e5274', roughness: 0.78 }),
        bronze,
        leather,
        skin: makeSkinMat('#5f4b44', '#a85a44', 0.28),
        faceMat: makeFaceMat(assets.priestFaceTex, assets.priestFaceNrm, assets.priestFaceRough, 0.88, '#a85a44', 0.3),
        hair: makeHairMat(assets.hairSilver, 0.64),
        hairBase: new THREE.MeshStandardMaterial({ color: '#34353c', roughness: 0.76 }),
        pants: new THREE.MeshStandardMaterial({ color: '#181822', roughness: 0.92 }),
        weaponGlow: new THREE.MeshStandardMaterial({
          color: '#c8a8ff',
          emissive: new THREE.Color('#7838e8'),
          emissiveIntensity: 0.92,
          roughness: 0.26,
          metalness: 0.5,
        }),
      };
    }

    // Boss: Live-action Fallen Warlord / Demon Sovereign in heavy Tang/Ming Shanwen Armor (山文甲)
    const bossArmor = shanwenArmor.clone();
    bossArmor.color.set('#cfc6cf');
    bossArmor.emissive.set('#220a10');
    bossArmor.emissiveIntensity = 0.18;
    applySilhouetteRim(bossArmor, '#ff2c46', 0.62, 2.4, this.bossRimHandles);
    const bossAccent = applySilhouetteRim(
      new THREE.MeshPhysicalMaterial({
        color: '#5a161e',
        roughness: 0.82,
        metalness: 0.04,
        sheen: 0.36,
        sheenColor: new THREE.Color('#a6323e'),
        sheenRoughness: 0.74,
        side: THREE.DoubleSide,
      }),
      '#ff3848',
      0.54,
      2.4,
      this.bossRimHandles,
    );

    return {
      primary: bossArmor,
      secondary: new THREE.MeshStandardMaterial({ color: '#4a1820', roughness: 0.78, metalness: 0.22 }),
      robeOuter: bossArmor,
      robeInner: new THREE.MeshStandardMaterial({ color: '#3c131b', roughness: 0.84, side: THREE.DoubleSide }),
      armor: bossArmor,
      accent: bossAccent,
      trim: new THREE.MeshStandardMaterial({ color: '#78222a', roughness: 0.66, metalness: 0.32 }),
      bronze,
      leather,
      skin: makeSkinMat('#7c726c', '#9e3e28', 0.28),
      faceMat: makeFaceMat(assets.bossFaceTex, assets.bossFaceNrm, assets.bossFaceRough, 0.95, '#9e3e28', 0.28),
      hair: makeHairMat(assets.hairSilver, 0.6),
      hairBase: new THREE.MeshStandardMaterial({ color: '#242329', roughness: 0.74 }),
      pants: new THREE.MeshStandardMaterial({ color: '#1f1b26', roughness: 0.82 }),
      weaponGlow: new THREE.MeshStandardMaterial({
        map: assets.steelPbr.map,
        color: '#e8a296',
        emissive: new THREE.Color('#b02230'),
        emissiveIntensity: 0.68,
        roughness: 0.24,
        metalness: 0.88,
      }),
    };
  }

  private buildHeadDetails(
    archetype: CharacterArchetype,
    palette: ReturnType<CharacterRig['buildPalette']>,
    assets: ReturnType<typeof getSharedAssets>,
  ): void {
    const neck = new THREE.Mesh(assets.neck, palette.skin);
    neck.position.y = 0.02;
    this.head.add(neck);

    const isHeroLike = archetype === 'xiaoyao' || archetype === 'ally';
    // Heroic handsome cinema proportions (1.07 for hero/ally eliminates pinhead silhouette!)
    const headScale = isHeroLike ? 1.07 : archetype === 'boss' || archetype === 'elite' ? 0.92 : 0.95;
    const headGeo = isHeroLike ? assets.heroHead : assets.bossHead;
    const skullY = isHeroLike ? 0.146 : 0.148;
    const skull = new THREE.Mesh(headGeo, palette.faceMat);
    skull.scale.setScalar(headScale);
    skull.position.y = skullY;
    skull.castShadow = true;
    skull.receiveShadow = true;
    this.head.add(skull);

    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(assets.ear, palette.skin);
      ear.scale.setScalar(headScale * (isHeroLike ? 0.94 : 1.0));
      ear.position.set(s * (isHeroLike ? 0.085 : 0.081) * headScale, skullY - 0.002, -0.008 * headScale);
      ear.rotation.y = s * 0.28;
      this.head.add(ear);
    }

    const addLayeredHairCascade = (
      hairMat: THREE.Material,
      count: number,
      arcSpan: number,
      yBase: number,
      zBack: number,
      useLong: boolean,
    ) => {
      for (let i = 0; i < count; i++) {
        const t = count > 1 ? i / (count - 1) - 0.5 : 0;
        const ang = t * arcSpan;
        const card = new THREE.Mesh(useLong ? assets.hairCardLong : assets.hairCardMid, hairMat);
        card.scale.setScalar(headScale * (0.94 + Math.abs(Math.cos(i * 2.1)) * 0.14));
        card.position.set(Math.sin(ang) * 0.082 * headScale, yBase, zBack - Math.cos(ang) * 0.022);
        card.rotation.set(0.22 + Math.abs(t) * 0.08, ang, t * 0.12);
        this.head.add(card);
      }
    };

    if (isHeroLike) {
      // 1. 3D Glossy Cornea Catchlight Lenses aligned over full-width irises (ultra-clear, never cloudy/milky!)
      const corneaMat = new THREE.MeshPhysicalMaterial({
        color: '#0d0907',
        roughness: 0.02,
        metalness: 0.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.02,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
      });
      const glintMat = new THREE.MeshBasicMaterial({
        color: '#fff8ec',
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      });
      const corneaGeo = new THREE.SphereGeometry(0.0108 * headScale, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.42);
      corneaGeo.rotateX(Math.PI * 0.5);
      const glintGeo = new THREE.SphereGeometry(0.0017 * headScale, 8, 6);
      const eyeY = skullY + 0.014 * headScale;
      for (const side of [-1, 1]) {
        const eyeGloss = new THREE.Mesh(corneaGeo, corneaMat);
        eyeGloss.name = side < 0 ? 'eyeGlossR' : 'eyeGlossL';
        eyeGloss.scale.set(1.06, 0.68, 0.28);
        eyeGloss.position.set(side * 0.0355 * headScale, eyeY, 0.0858 * headScale);
        eyeGloss.rotation.set(0, side * 0.24, 0);
        this.head.add(eyeGloss);

        const glint = new THREE.Mesh(glintGeo, glintMat);
        glint.position.set((side * 0.0355 + 0.0028) * headScale, eyeY + 0.0020 * headScale, 0.0894 * headScale);
        this.head.add(glint);
      }

      // 2. Elevated Sculpted Hair Crown Dome revealing a clean open forehead & natural hairline (no bowl-cut!)
      const crown = new THREE.Mesh(
        new THREE.SphereGeometry(0.0985 * headScale, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.52),
        palette.hairBase,
      );
      crown.scale.set(0.955, 1.03, 1.12);
      crown.position.set(0, skullY + 0.034 * headScale, -0.016 * headScale);
      crown.rotation.x = -0.34;
      crown.castShadow = true;
      this.head.add(crown);

      // Smooth occipital volume fill so side/back 360° silhouette looks lush & seamless
      const backCranium = new THREE.Mesh(
        new THREE.SphereGeometry(0.091 * headScale, 20, 14),
        palette.hairBase,
      );
      backCranium.scale.set(0.92, 0.96, 0.94);
      backCranium.position.set(0, skullY + 0.014 * headScale, -0.030 * headScale);
      this.head.add(backCranium);

      // 3. Open 3:7 Parted Xianxia Curtain Bangs (sweeping diagonally outward, leaving forehead & brows open & handsome!)
      const bangConfigs: Array<{
        geo: THREE.BufferGeometry;
        pos: [number, number, number];
        rot: [number, number, number];
        scale: number;
      }> = [
        // Wide open 3:7 side-part above brows — diagonal outward sweep instead of horizontal bowl-cut
        { geo: assets.hairLockBangSweepL, pos: [-0.032, 0.114, 0.068], rot: [-0.26, -0.30, -0.46], scale: 0.96 },
        { geo: assets.hairLockBangSweepR, pos: [0.038, 0.114, 0.066], rot: [-0.26, 0.34, 0.50], scale: 0.92 },
        { geo: assets.hairLockBangSweepL, pos: [-0.064, 0.100, 0.052], rot: [-0.18, -0.62, -0.26], scale: 0.94 },
        { geo: assets.hairLockBangSweepR, pos: [0.064, 0.100, 0.052], rot: [-0.18, 0.62, 0.26], scale: 0.94 },
        { geo: assets.hairLockBangSideL, pos: [-0.082, 0.078, 0.026], rot: [-0.08, -0.92, -0.08], scale: 0.96 },
        { geo: assets.hairLockBangSideR, pos: [0.082, 0.078, 0.026], rot: [-0.08, 0.92, 0.08], scale: 0.96 },
      ];
      for (const cfg of bangConfigs) {
        const lock = new THREE.Mesh(cfg.geo, palette.hair);
        lock.scale.setScalar(headScale * cfg.scale);
        lock.position.set(cfg.pos[0] * headScale, skullY + cfg.pos[1] * headScale, cfg.pos[2] * headScale);
        lock.rotation.set(cfg.rot[0], cfg.rot[1], cfg.rot[2]);
        lock.castShadow = true;
        this.head.add(lock);
      }

      // 4. Sleek Cheek-Framing Sculpted Temple Locks (鬓发 tucked cleanly beside temples & ears)
      for (const side of [-1, 1]) {
        const templeGeo = side < 0 ? assets.hairLockTempleL : assets.hairLockTempleR;
        const innerLock = new THREE.Mesh(templeGeo, palette.hair);
        innerLock.scale.setScalar(headScale * 0.92);
        innerLock.position.set(side * 0.085 * headScale, skullY + 0.058 * headScale, 0.022 * headScale);
        innerLock.rotation.set(-0.04, side * 0.98, side * 0.06);
        innerLock.castShadow = true;

        const outerLock = new THREE.Mesh(templeGeo, palette.hair);
        outerLock.scale.setScalar(headScale * 0.98);
        outerLock.position.set(side * 0.090 * headScale, skullY + 0.048 * headScale, -0.002 * headScale);
        outerLock.rotation.set(-0.02, side * 1.28, side * 0.04);
        outerLock.castShadow = true;
        this.head.add(innerLock, outerLock);
      }

      // 5. Layered Nape Hair Locks hugging the back of the neck cleanly
      for (let i = 0; i < 7; i++) {
        const t = i / 6 - 0.5;
        const ang = t * 1.65;
        const napeLock = new THREE.Mesh(assets.hairLockNape, palette.hair);
        napeLock.scale.setScalar(headScale * (0.94 + Math.cos(t * 2.2) * 0.1));
        napeLock.position.set(
          Math.sin(ang) * 0.082 * headScale,
          skullY + 0.036 * headScale,
          (-0.072 - Math.cos(ang) * 0.028) * headScale,
        );
        napeLock.rotation.set(0.16, ang + Math.PI, t * 0.14);
        this.head.add(napeLock);
      }

      // 6. Sculpted High Martial Topknot Hair Bun + Smooth Layered Flowing Ponytail (offset -Z to clear scabbard!)
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.036 * headScale, 16, 12), palette.hairBase);
      bun.scale.set(0.95, 1.14, 0.95);
      bun.position.set(0, skullY + 0.122 * headScale, -0.064 * headScale);
      bun.castShadow = true;
      this.head.add(bun);

      const ponytailGroup = new THREE.Group();
      ponytailGroup.position.set(0, skullY + 0.108 * headScale, -0.098 * headScale);
      const tailSpecs: Array<{
        geo: THREE.BufferGeometry;
        pos: [number, number, number];
        rot: [number, number, number];
        scale: number;
      }> = [
        { geo: assets.hairLockTailMain, pos: [0, 0.004, -0.008], rot: [0.18, Math.PI, 0], scale: 1.06 },
        { geo: assets.hairLockTailSideL, pos: [-0.018, 0.0, -0.004], rot: [0.20, Math.PI + 0.24, 0.08], scale: 0.98 },
        { geo: assets.hairLockTailSideR, pos: [0.018, 0.0, -0.004], rot: [0.20, Math.PI - 0.24, -0.08], scale: 0.98 },
        { geo: assets.hairLockTailSideL, pos: [-0.026, -0.006, 0.004], rot: [0.15, Math.PI + 0.44, 0.14], scale: 0.88 },
        { geo: assets.hairLockTailSideR, pos: [0.026, -0.006, 0.004], rot: [0.15, Math.PI - 0.44, -0.14], scale: 0.88 },
      ];
      for (const ts of tailSpecs) {
        const lock = new THREE.Mesh(ts.geo, palette.hair);
        lock.scale.setScalar(headScale * ts.scale);
        lock.position.set(ts.pos[0] * headScale, ts.pos[1] * headScale, ts.pos[2] * headScale);
        lock.rotation.set(ts.rot[0], ts.rot[1], ts.rot[2]);
        lock.castShadow = true;
        ponytailGroup.add(lock);
      }
      this.head.add(ponytailGroup);
      if (archetype === 'xiaoyao') {
        this.heroPonytailGroup = ponytailGroup;
      }

      // 7. Per-Skin 3D Headpiece Crowns mounted regally on the Topknot
      const crownMount = new THREE.Group();
      crownMount.position.set(0, skullY + 0.124 * headScale, -0.058 * headScale);
      crownMount.scale.setScalar(headScale);
      this.head.add(crownMount);
      if (archetype === 'xiaoyao') {
        this.buildHeroCrownVariants(crownMount, palette.bronze);
      } else {
        const allyClasp = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.038, 14), palette.bronze);
        allyClasp.rotation.x = -0.22;
        const allyPin = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.14, 8), palette.bronze);
        allyPin.rotation.z = Math.PI / 2;
        allyPin.position.y = 0.012;
        crownMount.add(allyClasp, allyPin);
      }

      // 8. Sleek Woven Cloth Headband + Natural Gravity-Draped Twin Silk Ribbons (hanging smoothly downward behind shoulders!)
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0945 * headScale, 0.0955 * headScale, 0.014, 28, 1, true),
        palette.accent,
      );
      band.scale.set(0.935, 1, 1.12);
      band.position.set(0, skullY + 0.077 * headScale, -0.010 * headScale);
      band.rotation.x = -0.22;
      this.head.add(band);

      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.012 * headScale, 10, 8), palette.accent);
      knot.scale.set(1.22, 0.76, 0.72);
      knot.position.set(0, skullY + 0.054 * headScale, -0.105 * headScale);
      this.head.add(knot);

      for (const side of [-1, 1]) {
        const chain: THREE.Mesh[] = [];
        let parent: THREE.Object3D = this.head;
        for (let i = 0; i < 4; i++) {
          const seg = new THREE.Mesh(assets.silkRibbonSeg, palette.accent);
          if (i === 0) {
            seg.scale.setScalar(headScale);
            seg.position.set(side * 0.017 * headScale, skullY + 0.052 * headScale, -0.108 * headScale);
          } else {
            seg.scale.set(0.88, 1, 1);
            seg.position.set(0, -0.102, 0);
          }
          parent.add(seg);
          chain.push(seg);
          parent = seg;
        }
        this.ribbonSegs.push(chain);
      }
    } else if (archetype === 'bladesman') {
      const helm = new THREE.Mesh(
        new THREE.SphereGeometry(0.104 * headScale, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.52),
        palette.armor,
      );
      helm.scale.set(0.97, 1.02, 1.12);
      helm.position.set(0, 0.194, -0.012);
      helm.rotation.x = -0.18;
      this.head.add(helm);

      const brim = new THREE.Mesh(new THREE.TorusGeometry(0.102 * headScale, 0.011, 10, 26), palette.bronze);
      brim.rotation.x = Math.PI / 2 - 0.16;
      brim.scale.set(0.95, 1.1, 1);
      brim.position.set(0, 0.214, -0.008);
      this.head.add(brim);

      const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.022, 0.072, 12), palette.bronze);
      finial.position.set(0, 0.308, -0.024);
      this.head.add(finial);

      const plume = new THREE.Mesh(assets.plumeShort, palette.accent);
      plume.position.set(0, 0.335, -0.026);
      this.head.add(plume);

      for (const s of [-1, 1]) {
        const flap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.016, 0.024, 0.115, 10),
          palette.armor,
        );
        flap.scale.set(0.45, 1, 1.6);
        flap.position.set(s * 0.094 * headScale, 0.142, -0.024);
        flap.rotation.z = s * 0.12;
        this.head.add(flap);
      }
      addLayeredHairCascade(palette.hair, 5, 1.1, 0.188, -0.088, false);
    } else if (archetype === 'caster') {
      const hairDome = new THREE.Mesh(
        new THREE.SphereGeometry(0.096 * headScale, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
        palette.hairBase,
      );
      hairDome.scale.set(0.95, 1.02, 1.14);
      hairDome.position.set(0, 0.174, -0.018);
      hairDome.rotation.x = -0.2;
      this.head.add(hairDome);

      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.048, 0.105, 12), palette.bronze);
      crown.position.set(0, 0.285, -0.028);
      this.head.add(crown);
      const hairpin = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.22, 8), palette.bronze);
      hairpin.rotation.z = Math.PI / 2;
      hairpin.position.set(0, 0.292, -0.028);
      this.head.add(hairpin);

      addLayeredHairCascade(palette.hair, 7, 1.45, 0.218, -0.082, true);
    } else if (archetype === 'elite') {
      const hairDome = new THREE.Mesh(
        new THREE.SphereGeometry(0.098 * headScale, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
        palette.hairBase,
      );
      hairDome.scale.set(0.97, 1.03, 1.14);
      hairDome.position.set(0, 0.176, -0.018);
      hairDome.rotation.x = -0.22;
      this.head.add(hairDome);

      const warCrown = new THREE.Mesh(new THREE.TorusGeometry(0.1 * headScale, 0.013, 10, 26), palette.bronze);
      warCrown.rotation.x = Math.PI / 2 - 0.15;
      warCrown.scale.set(0.95, 1.13, 1);
      warCrown.position.set(0, 0.218, -0.006);
      this.head.add(warCrown);

      const crest = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.036, 0.105, 12), palette.armor);
      crest.position.set(0, 0.294, -0.032);
      this.head.add(crest);

      const crimsonPlume = new THREE.Mesh(assets.plumeLong, palette.accent);
      crimsonPlume.position.set(0, 0.332, -0.036);
      this.head.add(crimsonPlume);

      addLayeredHairCascade(palette.hair, 7, 1.4, 0.22, -0.082, true);
    } else {
      // BOSS: Grounded Live-Action Ancient Warlord Crown + Sculpted Curved Ribbed War-Horns + Layered Silver-Iron Hair
      const hairDome = new THREE.Mesh(
        new THREE.SphereGeometry(0.098 * headScale, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.56),
        palette.hairBase,
      );
      hairDome.scale.set(0.98, 1.03, 1.15);
      hairDome.position.set(0, 0.176, -0.018);
      hairDome.rotation.x = -0.22;
      this.head.add(hairDome);

      const diadem = new THREE.Mesh(new THREE.TorusGeometry(0.1 * headScale, 0.013, 10, 26), palette.bronze);
      diadem.rotation.x = Math.PI / 2 - 0.14;
      diadem.scale.set(0.94, 1.14, 1);
      diadem.position.set(0, 0.22, -0.006);
      this.head.add(diadem);

      const topCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.04, 0.12, 12), palette.bronze);
      topCrown.position.set(0, 0.3, -0.036);
      this.head.add(topCrown);

      // Restrained dark-blood obsidian brow stone (zero cartoon glow or LED eyeball spheres!)
      const rubyMat = new THREE.MeshPhysicalMaterial({
        color: '#6b1218',
        emissive: new THREE.Color('#280609'),
        emissiveIntensity: 0.25,
        roughness: 0.18,
        metalness: 0.25,
        clearcoat: 0.85,
      });
      const centerGem = new THREE.Mesh(new THREE.SphereGeometry(0.013, 12, 10), rubyMat);
      centerGem.scale.set(0.85, 1.25, 0.55);
      centerGem.position.set(0, 0.228, 0.094);
      this.head.add(centerGem);

      // Sculpted Curved Ribbed War-Horns with root-to-tip bone/antique-bronze gradient catching moonlight!
      const hornMat = new THREE.MeshStandardMaterial({
        map: assets.ironArmorTex,
        normalMap: assets.ironArmorNrm,
        normalScale: new THREE.Vector2(1.15, 1.15),
        vertexColors: true,
        color: '#f0e4d2',
        roughness: 0.34,
        metalness: 0.52,
      });
      const hornL = new THREE.Mesh(assets.hornL, hornMat);
      hornL.position.set(-0.078, 0.225, -0.015);
      const hornR = new THREE.Mesh(assets.hornR, hornMat);
      hornR.position.set(0.078, 0.225, -0.015);
      this.head.add(hornL, hornR);

      // Wild layered iron-grey shoulder hair cascade
      addLayeredHairCascade(palette.hair, 9, 1.65, 0.224, -0.084, true);
    }
  }

  private buildWineGourd(bronzeMat: THREE.Material, accentMat: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    const gourdMat = new THREE.MeshPhysicalMaterial({
      color: '#965d24',
      roughness: 0.44,
      metalness: 0.04,
      clearcoat: 0.35,
      clearcoatRoughness: 0.38,
    });
    const pts = [
      new THREE.Vector2(0.001, -0.105),
      new THREE.Vector2(0.072, -0.072),
      new THREE.Vector2(0.074, -0.024),
      new THREE.Vector2(0.034, 0.018),
      new THREE.Vector2(0.054, 0.056),
      new THREE.Vector2(0.03, 0.092),
      new THREE.Vector2(0.015, 0.112),
    ];
    const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 16), gourdMat);
    const cord = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.008, 8, 16), accentMat);
    cord.rotation.x = Math.PI / 2;
    cord.position.y = 0.018;
    const stopper = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.017, 0.032, 10), bronzeMat);
    stopper.position.y = 0.122;
    g.add(body, cord, stopper);
    return g;
  }

  private buildHeroCrownVariants(crownMount: THREE.Group, heroBronzeMat: THREE.MeshStandardMaterial): void {
    // 1. skin_xiaoyao — 青玉发冠 (Carved Qing-Jade & Bronze Hairpin Crown)
    const gXiaoyao = new THREE.Group();
    const jadeMat = new THREE.MeshPhysicalMaterial({
      color: '#4ea898',
      emissive: new THREE.Color('#13453d'),
      emissiveIntensity: 0.22,
      roughness: 0.16,
      metalness: 0.06,
      clearcoat: 0.92,
      clearcoatRoughness: 0.12,
    });
    const xBase = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.037, 0.042, 16), heroBronzeMat);
    xBase.position.y = 0.006;
    const xRimTop = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.0045, 8, 20), heroBronzeMat);
    xRimTop.rotation.x = Math.PI / 2;
    xRimTop.position.y = 0.026;
    const xJadeCrest = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), jadeMat);
    xJadeCrest.scale.set(0.88, 1.48, 0.45);
    xJadeCrest.position.set(0, 0.038, 0.028);
    const xJadeArch = new THREE.Mesh(new THREE.TorusGeometry(0.029, 0.005, 8, 18, Math.PI), jadeMat);
    xJadeArch.position.set(0, 0.024, 0.012);
    const xPin = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0032, 0.155, 8), heroBronzeMat);
    xPin.rotation.z = Math.PI / 2;
    xPin.position.y = 0.015;
    for (const s of [-1, 1]) {
      const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.0072, 10, 8), jadeMat);
      pearl.position.set(s * 0.08, 0.015, 0);
      gXiaoyao.add(pearl);
    }
    gXiaoyao.add(xBase, xRimTop, xJadeCrest, xJadeArch, xPin);
    gXiaoyao.visible = true;
    crownMount.add(gXiaoyao);
    this.heroCrownVariants.skin_xiaoyao = gXiaoyao;

    // 2. skin_shuangxue — 冰莲水晶冠 (Faceted Translucent Ice-Lotus Crystal Crown)
    const gShuang = new THREE.Group();
    const silverMat = new THREE.MeshStandardMaterial({
      color: '#dce8f6',
      emissive: new THREE.Color('#284c70'),
      emissiveIntensity: 0.18,
      roughness: 0.18,
      metalness: 0.92,
    });
    const iceCrystalMat = new THREE.MeshPhysicalMaterial({
      color: '#a4e2ff',
      emissive: new THREE.Color('#2894d8'),
      emissiveIntensity: 0.28,
      roughness: 0.10,
      metalness: 0.12,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      transparent: true,
      opacity: 0.88,
    });
    const sRing = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.038, 0.034, 16), silverMat);
    sRing.position.y = 0.005;
    const sCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), iceCrystalMat);
    sCore.scale.set(0.68, 2.05, 0.68);
    sCore.position.set(0, 0.056, 0.016);
    gShuang.add(sRing, sCore);
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.056, 4), iceCrystalMat);
      petal.scale.set(1.0, 1.0, 0.42);
      petal.position.set(Math.sin(ang) * 0.034, 0.034, Math.cos(ang) * 0.034);
      petal.rotation.set(Math.cos(ang) * 0.42, ang, -Math.sin(ang) * 0.42);
      gShuang.add(petal);
    }
    const sPin = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.17, 8), silverMat);
    sPin.rotation.z = Math.PI / 2;
    sPin.position.y = 0.014;
    for (const s of [-1, 1]) {
      const prism = new THREE.Mesh(new THREE.OctahedronGeometry(0.0095, 0), iceCrystalMat);
      prism.scale.set(0.65, 1.45, 0.65);
      prism.position.set(s * 0.088, 0.014, 0);
      gShuang.add(prism);
    }
    gShuang.add(sPin);
    gShuang.visible = false;
    crownMount.add(gShuang);
    this.heroCrownVariants.skin_shuangxue = gShuang;

    // 3. skin_chiyan — 赤焰修罗冠 (Swept Crimson-Gold Demon-Flame Horn Crown with glowing ruby core)
    const gChiyan = new THREE.Group();
    const obsidianGoldMat = new THREE.MeshStandardMaterial({
      color: '#341c1d',
      roughness: 0.34,
      metalness: 0.84,
    });
    const flameGoldMat = new THREE.MeshStandardMaterial({
      color: '#e6a03c',
      emissive: new THREE.Color('#7c2410'),
      emissiveIntensity: 0.32,
      roughness: 0.24,
      metalness: 0.9,
    });
    const rubyCoreMat = new THREE.MeshPhysicalMaterial({
      color: '#ff3828',
      emissive: new THREE.Color('#ff3e14'),
      emissiveIntensity: 1.05,
      roughness: 0.1,
      metalness: 0.12,
      clearcoat: 1.0,
    });
    const cBase = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.039, 0.04, 14), obsidianGoldMat);
    cBase.position.y = 0.006;
    const cRim = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0055, 8, 18), flameGoldMat);
    cRim.rotation.x = Math.PI / 2;
    cRim.position.y = 0.025;
    const cRuby = new THREE.Mesh(new THREE.OctahedronGeometry(0.019, 0), rubyCoreMat);
    cRuby.scale.set(0.85, 1.5, 0.65);
    cRuby.position.set(0, 0.044, 0.026);
    gChiyan.add(cBase, cRim, cRuby);
    for (const s of [-1, 1]) {
      // Swept sculpted crimson-gold demon-flame horn
      const hornLower = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.015, 0.056, 8), flameGoldMat);
      hornLower.position.set(s * 0.046, 0.036, 0.006);
      hornLower.rotation.set(-0.18, 0, s * -0.62);
      const hornTip = new THREE.Mesh(new THREE.ConeGeometry(0.0095, 0.058, 8), rubyCoreMat);
      hornTip.position.set(s * 0.072, 0.076, -0.008);
      hornTip.rotation.set(-0.28, 0, s * -0.32);
      const innerProng = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.044, 6), flameGoldMat);
      innerProng.position.set(s * 0.022, 0.048, 0.022);
      innerProng.rotation.z = s * -0.22;
      gChiyan.add(hornLower, hornTip, innerProng);
    }
    gChiyan.visible = false;
    crownMount.add(gChiyan);
    this.heroCrownVariants.skin_chiyan = gChiyan;

    // 4. skin_zixiao — 紫霄星冕 (Purple-Gold Star Crescent Diadem)
    const gZixiao = new THREE.Group();
    const starGoldMat = new THREE.MeshStandardMaterial({
      color: '#ebd078',
      emissive: new THREE.Color('#6b4d18'),
      emissiveIntensity: 0.24,
      roughness: 0.22,
      metalness: 0.92,
    });
    const amethystMat = new THREE.MeshPhysicalMaterial({
      color: '#c88cff',
      emissive: new THREE.Color('#8e48ff'),
      emissiveIntensity: 0.88,
      roughness: 0.1,
      metalness: 0.14,
      clearcoat: 1.0,
    });
    const zBase = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.038, 0.044, 16), starGoldMat);
    zBase.position.y = 0.008;
    const zCrescent = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.0058, 10, 22, Math.PI * 1.15), starGoldMat);
    zCrescent.position.set(0, 0.054, 0.018);
    zCrescent.rotation.z = Math.PI - Math.PI * 0.075;
    const zStar = new THREE.Mesh(new THREE.OctahedronGeometry(0.018, 0), amethystMat);
    zStar.scale.set(0.95, 1.35, 0.72);
    zStar.position.set(0, 0.062, 0.018);
    const zPin = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.165, 8), starGoldMat);
    zPin.rotation.z = Math.PI / 2;
    zPin.position.y = 0.016;
    for (const s of [-1, 1]) {
      const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.0085, 0), amethystMat);
      orb.position.set(s * 0.086, 0.016, 0);
      gZixiao.add(orb);
    }
    gZixiao.add(zBase, zCrescent, zStar, zPin);
    gZixiao.visible = false;
    crownMount.add(gZixiao);
    this.heroCrownVariants.skin_zixiao = gZixiao;

    // 5. skin_jinwu — 金乌烈日帝冠 (Imperial Sun-Phoenix Multi-Tier Crown)
    const gJinwu = new THREE.Group();
    const imperialGoldMat = new THREE.MeshStandardMaterial({
      color: '#fce27e',
      emissive: new THREE.Color('#a46812'),
      emissiveIntensity: 0.34,
      roughness: 0.18,
      metalness: 0.94,
    });
    const sunPearlMat = new THREE.MeshPhysicalMaterial({
      color: '#fff4b0',
      emissive: new THREE.Color('#ffaa18'),
      emissiveIntensity: 1.12,
      roughness: 0.08,
      metalness: 0.1,
      clearcoat: 1.0,
    });
    const jTier1 = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.036, 16), imperialGoldMat);
    jTier1.position.y = 0.006;
    const jTier2 = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.032, 16), imperialGoldMat);
    jTier2.position.y = 0.034;
    const jSunRing = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.0042, 8, 22), imperialGoldMat);
    jSunRing.position.set(0, 0.068, 0.02);
    const jSunPearl = new THREE.Mesh(new THREE.SphereGeometry(0.0135, 14, 10), sunPearlMat);
    jSunPearl.position.set(0, 0.068, 0.02);
    gJinwu.add(jTier1, jTier2, jSunRing, jSunPearl);
    for (let i = -2; i <= 2; i++) {
      const feather = new THREE.Mesh(new THREE.ConeGeometry(0.0085, 0.066 - Math.abs(i) * 0.008, 4), imperialGoldMat);
      feather.scale.set(1.0, 1.0, 0.34);
      feather.position.set(i * 0.022, 0.056 - Math.abs(i) * 0.006, 0.008 - Math.abs(i) * 0.005);
      feather.rotation.z = -i * 0.24;
      gJinwu.add(feather);
    }
    for (const s of [-1, 1]) {
      const wingCrest = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.082, 4), imperialGoldMat);
      wingCrest.scale.set(1.0, 1.0, 0.28);
      wingCrest.position.set(s * 0.062, 0.044, -0.004);
      wingCrest.rotation.set(-0.1, 0, s * -0.92);
      gJinwu.add(wingCrest);
    }
    gJinwu.visible = false;
    crownMount.add(gJinwu);
    this.heroCrownVariants.skin_jinwu = gJinwu;
  }

  private buildHeroSkinOrnaments(): void {
    // 1. skin_shuangxue — 4 orbiting translucent frost crystals (冰晶浮菱)
    const gShuang = new THREE.Group();
    const frostMat = new THREE.MeshPhysicalMaterial({
      color: '#daf6ff',
      emissive: new THREE.Color('#4ac8f8'),
      emissiveIntensity: 0.68,
      roughness: 0.08,
      metalness: 0.12,
      clearcoat: 1.0,
      transparent: true,
      opacity: 0.86,
    });
    const frostRingMat = new THREE.MeshStandardMaterial({
      color: '#dceeff',
      emissive: new THREE.Color('#68c8f2'),
      emissiveIntensity: 0.42,
      roughness: 0.2,
      metalness: 0.85,
    });
    const crystalGeo = new THREE.OctahedronGeometry(0.054, 0);
    const ringGeo = new THREE.TorusGeometry(0.052, 0.0045, 6, 18);
    for (let i = 0; i < 4; i++) {
      const node = new THREE.Group();
      const crystal = new THREE.Mesh(crystalGeo, frostMat);
      crystal.scale.set(0.54, 1.85, 0.54);
      const ring = new THREE.Mesh(ringGeo, frostRingMat);
      ring.rotation.x = Math.PI * 0.42;
      node.add(crystal, ring);
      node.userData.phase = (i / 4) * Math.PI * 2;
      gShuang.add(node);
      this.heroFrostCrystals.push(node);
    }
    gShuang.visible = false;
    this.torso.add(gShuang);
    this.heroSkinOrnaments.skin_shuangxue = gShuang;

    // 2. skin_chiyan — crimson-gold flame plumes / ember blades floating behind shoulders
    const gChiyan = new THREE.Group();
    const emberBladeMat = new THREE.MeshStandardMaterial({
      color: '#5a1618',
      emissive: new THREE.Color('#d83214'),
      emissiveIntensity: 0.72,
      roughness: 0.28,
      metalness: 0.78,
    });
    const flameEdgeMat = new THREE.MeshStandardMaterial({
      color: '#ffb448',
      emissive: new THREE.Color('#ff5418'),
      emissiveIntensity: 1.05,
      roughness: 0.18,
      metalness: 0.4,
    });
    const plumeGeo = new THREE.ConeGeometry(0.036, 0.34, 4);
    const plumeCoreGeo = new THREE.ConeGeometry(0.018, 0.28, 4);
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? -1 : 1;
      const tier = i % 3;
      const plume = new THREE.Group();
      const outer = new THREE.Mesh(plumeGeo, emberBladeMat);
      outer.scale.set(1.0, 1.0, 0.24);
      const inner = new THREE.Mesh(plumeCoreGeo, flameEdgeMat);
      inner.scale.set(1.0, 1.0, 0.32);
      inner.position.y = 0.025;
      plume.add(outer, inner);
      const bx = side * (0.28 + tier * 0.115);
      const by = 0.56 - tier * 0.105;
      const bz = -0.23 - tier * 0.02;
      plume.position.set(bx, by, bz);
      plume.rotation.set(-0.12, side * 0.18, side * (-0.42 - tier * 0.28));
      plume.userData.baseX = bx;
      plume.userData.baseY = by;
      plume.userData.phase = i * 0.95;
      gChiyan.add(plume);
      this.heroFlamePlumes.push(plume);
    }
    gChiyan.visible = false;
    this.torso.add(gChiyan);
    this.heroSkinOrnaments.skin_chiyan = gChiyan;

    // 3. skin_zixiao — tilted glowing purple Bagua star ring (紫霄星轮) rotating behind back
    const gZixiao = new THREE.Group();
    const starWheel = new THREE.Group();
    starWheel.position.set(0, 0.49, -0.25);
    starWheel.rotation.x = 0.1;
    const purpleRingMat = new THREE.MeshStandardMaterial({
      color: '#d8b2ff',
      emissive: new THREE.Color('#9246ff'),
      emissiveIntensity: 0.92,
      roughness: 0.2,
      metalness: 0.45,
    });
    const goldSpokeMat = new THREE.MeshStandardMaterial({
      color: '#f2d67c',
      emissive: new THREE.Color('#b68428'),
      emissiveIntensity: 0.48,
      roughness: 0.22,
      metalness: 0.88,
    });
    const outerWheel = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.011, 8, 36), purpleRingMat);
    const innerWheel = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.0085, 8, 28), goldSpokeMat);
    starWheel.add(outerWheel, innerWheel);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const trigramBar = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.135, 0.008), goldSpokeMat);
      trigramBar.position.set(Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0);
      trigramBar.rotation.z = a + Math.PI / 2;
      const starGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), purpleRingMat);
      starGem.position.set(Math.cos(a) * 0.43, Math.sin(a) * 0.43, 0.006);
      starWheel.add(trigramBar, starGem);
    }
    gZixiao.add(starWheel);
    this.heroStarWheel = starWheel;
    gZixiao.visible = false;
    this.torso.add(gZixiao);
    this.heroSkinOrnaments.skin_zixiao = gZixiao;

    // 4. skin_jinwu — grand rotating Golden Solar Halo (大日金乌神环) with 8 radiant sun feathers!
    const gJinwu = new THREE.Group();
    const sunHalo = new THREE.Group();
    sunHalo.position.set(0, 0.51, -0.26);
    sunHalo.rotation.x = 0.08;
    const solarGoldMat = new THREE.MeshStandardMaterial({
      color: '#ffe688',
      emissive: new THREE.Color('#e89416'),
      emissiveIntensity: 0.86,
      roughness: 0.18,
      metalness: 0.9,
    });
    const solarCoreMat = new THREE.MeshStandardMaterial({
      color: '#fff6be',
      emissive: new THREE.Color('#ffae24'),
      emissiveIntensity: 1.05,
      roughness: 0.14,
      metalness: 0.55,
    });
    const outerSolar = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.014, 10, 40), solarGoldMat);
    const innerSolar = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.009, 8, 32), solarCoreMat);
    sunHalo.add(outerSolar, innerSolar);
    const featherGeo = new THREE.ConeGeometry(0.034, 0.22, 4);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const feather = new THREE.Mesh(featherGeo, i % 2 === 0 ? solarCoreMat : solarGoldMat);
      feather.scale.set(1.0, 1.0, 0.24);
      feather.position.set(Math.cos(a) * 0.50, Math.sin(a) * 0.50, 0);
      feather.rotation.z = a - Math.PI / 2;
      feather.userData.baseAngle = a;
      sunHalo.add(feather);
      this.heroSunFeathers.push(feather);
    }
    gJinwu.add(sunHalo);
    this.heroSunHalo = sunHalo;
    gJinwu.visible = false;
    this.torso.add(gJinwu);
    this.heroSkinOrnaments.skin_jinwu = gJinwu;
  }

  private buildHeroArmorAndRelicVisuals(assets: ReturnType<typeof getSharedAssets>): void {
    // 1. Sleek Sculpted Xianxia Armor Overlay (玄甲衣袍: refined metallic pauldrons & chest guard that frame heroically without blowing out white)
    const armorGroup = new THREE.Group();
    const plateMat = new THREE.MeshPhysicalMaterial({
      map: assets.shanwenTex,
      normalMap: assets.shanwenNrm,
      normalScale: new THREE.Vector2(1.05, 1.05),
      color: '#9eb4c6',
      emissive: new THREE.Color('#20546a'),
      emissiveIntensity: 0.12,
      roughness: 0.32,
      metalness: 0.84,
      clearcoat: 0.46,
      clearcoatRoughness: 0.24,
      side: THREE.DoubleSide,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: '#cfa954',
      emissive: new THREE.Color('#9c7224'),
      emissiveIntensity: 0.18,
      roughness: 0.26,
      metalness: 0.9,
    });

    for (const side of [-1, 1]) {
      const pauldron = new THREE.Mesh(assets.pauldronArmor, plateMat);
      pauldron.scale.set(0.82, 0.78, 0.84);
      pauldron.position.set(side * 0.214, 0.456, 0.0);
      pauldron.rotation.set(0, side > 0 ? 0 : Math.PI, side * -0.18);
      pauldron.castShadow = true;
      armorGroup.add(pauldron);

      const trimArc = new THREE.Mesh(
        new THREE.TorusGeometry(0.078, 0.0085, 8, 22, Math.PI * 1.08),
        trimMat,
      );
      trimArc.position.set(side * 0.220, 0.456, 0.012);
      trimArc.rotation.set(0.18, side * 0.26, side > 0 ? -0.42 : Math.PI + 0.42);
      armorGroup.add(trimArc);

      const shoulderCrest = new THREE.Mesh(new THREE.OctahedronGeometry(0.017, 0), trimMat);
      shoulderCrest.scale.set(0.72, 1.18, 0.72);
      shoulderCrest.position.set(side * 0.236, 0.492, 0.008);
      shoulderCrest.rotation.z = side * -0.32;
      armorGroup.add(shoulderCrest);
    }

    // Chest Heart-Mirror Guard (护心镜)
    const mirrorBezel = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.010, 10, 26), trimMat);
    mirrorBezel.position.set(0, 0.34, 0.156);
    const mirrorDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.066, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.42),
      plateMat,
    );
    mirrorDome.rotation.x = Math.PI / 2;
    mirrorDome.scale.set(1, 0.34, 1);
    mirrorDome.position.set(0, 0.34, 0.150);
    const mirrorCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.016, 0), trimMat);
    mirrorCore.scale.set(0.92, 1.12, 0.62);
    mirrorCore.position.set(0, 0.34, 0.172);
    armorGroup.add(mirrorBezel, mirrorDome, mirrorCore);

    // Armored Collar Filigree Ring
    const collarRim = new THREE.Mesh(new THREE.TorusGeometry(0.080, 0.0075, 8, 24), trimMat);
    collarRim.rotation.x = Math.PI / 2 + 0.14;
    collarRim.position.set(0, 0.510, 0.012);
    armorGroup.add(collarRim);

    armorGroup.visible = false;
    this.torso.add(armorGroup);
    this.heroArmorGroup = armorGroup;
    this.heroArmorPlateMat = plateMat;
    this.heroArmorTrimMat = trimMat;

    // 2. Sculpted Orbiting Spirit Talisman & Relic Aura (镇妖灵宝)
    const relicGroup = new THREE.Group();
    const orbMat = new THREE.MeshStandardMaterial({
      color: '#a8fff0',
      emissive: new THREE.Color('#48e0c8'),
      emissiveIntensity: 1.05,
      roughness: 0.16,
      metalness: 0.35,
    });
    const talMat = new THREE.MeshStandardMaterial({
      map: assets.talismanTex,
      color: '#fff4d4',
      emissive: new THREE.Color('#e6b84c'),
      emissiveIntensity: 0.72,
      roughness: 0.48,
      metalness: 0.18,
      side: THREE.DoubleSide,
    });
    const haloMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffe07a'),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const talGeo = new THREE.PlaneGeometry(0.068, 0.175);
    const orbGeo = new THREE.OctahedronGeometry(0.042, 1);
    const orbRingGeo = new THREE.TorusGeometry(0.064, 0.0055, 6, 20);

    for (let i = 0; i < 4; i++) {
      const sat = new THREE.Group();
      if (i % 2 === 0) {
        const slip = new THREE.Mesh(talGeo, talMat);
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), orbMat);
        core.position.set(0, 0.105, 0);
        sat.add(slip, core);
      } else {
        const gem = new THREE.Mesh(orbGeo, orbMat);
        const ring = new THREE.Mesh(orbRingGeo, talMat);
        ring.rotation.x = Math.PI * 0.38;
        sat.add(gem, ring);
      }
      sat.userData.orbitPhase = (i / 4) * Math.PI * 2;
      sat.userData.orbitIndex = i;
      relicGroup.add(sat);
      this.heroRelicOrbitals.push(sat);
    }

    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.0085, 8, 36), haloMat);
    halo.position.set(0, 0.42, -0.25);
    halo.visible = false;
    relicGroup.add(halo);

    relicGroup.visible = false;
    this.torso.add(relicGroup);
    this.heroRelicGroup = relicGroup;
    this.heroRelicHalo = halo;
    this.heroRelicOrbMat = orbMat;
    this.heroRelicTalMat = talMat;
    this.heroRelicHaloMat = haloMat;
  }

  private buildWeapon(
    archetype: CharacterArchetype,
    palette: ReturnType<CharacterRig['buildPalette']>,
    assets: ReturnType<typeof getSharedAssets>,
  ): THREE.Group {
    const g = new THREE.Group();
    const steelMat = new THREE.MeshPhysicalMaterial({
      map: assets.steelPbr.map,
      bumpMap: assets.steelPbr.bumpMap,
      bumpScale: 0.024,
      roughnessMap: assets.steelPbr.roughnessMap,
      color: '#d8e0e8',
      roughness: 0.22,
      metalness: 0.88,
      clearcoat: archetype === 'xiaoyao' || archetype === 'ally' ? 0.42 : 0.18,
      clearcoatRoughness: 0.18,
    });
    this.bladeSteelMat = steelMat;

    if (archetype === 'xiaoyao' || archetype === 'ally') {
      // Authentic Forged Chinese Jian (七星龙渊剑): Damascus steel + beveled glowing edge + faceted guard crystal
      const edgeMat = new THREE.MeshStandardMaterial({
        color: palette.weaponGlow.color.clone(),
        emissive: palette.weaponGlow.emissive.clone(),
        emissiveIntensity: 0.22,
        roughness: 0.16,
        metalness: 0.92,
      });
      const crystalMat = new THREE.MeshPhysicalMaterial({
        color: palette.weaponGlow.color.clone(),
        emissive: palette.weaponGlow.emissive.clone(),
        emissiveIntensity: 0.55,
        roughness: 0.1,
        metalness: 0.16,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
      });
      this.weaponEdgeMat = edgeMat;
      this.guardCrystalMat = crystalMat;

      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.23, 12), palette.leather);
      grip.position.y = -0.05;
      const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, 0.036, 12), palette.bronze);
      pommel.position.y = -0.176;
      const pommelGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.013, 0), crystalMat);
      pommelGem.position.y = -0.194;
      const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.16, 10), palette.accent);
      tassel.position.y = -0.265;

      const guardWing = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.024, 0.175, 10), palette.bronze);
      guardWing.rotation.z = Math.PI / 2;
      guardWing.scale.set(0.82, 1, 0.72);
      guardWing.position.y = 0.068;
      const guardCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.03, 1), palette.bronze);
      guardCore.scale.set(1.15, 0.72, 0.62);
      guardCore.position.y = 0.072;
      const guardCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.024, 0), crystalMat);
      guardCrystal.scale.set(0.92, 1.4, 0.96);
      guardCrystal.position.y = 0.072;

      const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.026, 0.98, 4), steelMat);
      blade.scale.set(1.0, 1.0, 0.28);
      blade.rotation.y = Math.PI / 4;
      blade.position.y = 0.57;
      blade.castShadow = true;

      const bladeEdge = new THREE.Mesh(new THREE.CylinderGeometry(0.0156, 0.0282, 0.985, 4), edgeMat);
      bladeEdge.scale.set(1.06, 1.0, 0.135);
      bladeEdge.rotation.y = Math.PI / 4;
      bladeEdge.position.y = 0.57;

      const fuller = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.01, 0.9, 4), this.weaponGlowMat);
      fuller.scale.set(1.0, 1.0, 0.48);
      fuller.rotation.y = Math.PI / 4;
      fuller.position.y = 0.57;

      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.23, 4), steelMat);
      tip.scale.set(1.0, 1.0, 0.28);
      tip.rotation.y = Math.PI / 4;
      tip.position.y = 1.175;

      const tipEdge = new THREE.Mesh(new THREE.ConeGeometry(0.0156, 0.236, 4), edgeMat);
      tipEdge.scale.set(1.06, 1.0, 0.135);
      tipEdge.rotation.y = Math.PI / 4;
      tipEdge.position.y = 1.175;

      const tipFuller = new THREE.Mesh(new THREE.ConeGeometry(0.0048, 0.15, 4), this.weaponGlowMat);
      tipFuller.scale.set(1.0, 1.0, 0.48);
      tipFuller.rotation.y = Math.PI / 4;
      tipFuller.position.y = 1.085;

      g.add(
        grip,
        pommel,
        pommelGem,
        tassel,
        guardWing,
        guardCore,
        guardCrystal,
        blade,
        bladeEdge,
        fuller,
        tip,
        tipEdge,
        tipFuller,
      );
      this.weaponTipLocal.set(0, 1.29, 0);
    } else if (archetype === 'bladesman') {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.02, 0.34, 10), palette.leather);
      grip.position.y = -0.08;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.008, 8, 18), palette.bronze);
      ring.position.y = -0.27;
      const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.022, 14), palette.bronze);
      guard.position.y = 0.09;
      const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.054, 1.04, 4), steelMat);
      blade.scale.set(1.0, 1.0, 0.24);
      blade.rotation.y = Math.PI / 4;
      blade.position.set(0.012, 0.62, 0);
      blade.castShadow = true;
      const bladeFuller = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.011, 0.92, 4), this.weaponGlowMat);
      bladeFuller.scale.set(1.0, 1.0, 0.44);
      bladeFuller.rotation.y = Math.PI / 4;
      bladeFuller.position.set(0.012, 0.6, 0);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.22, 4), steelMat);
      tip.scale.set(1.0, 1.0, 0.24);
      tip.rotation.y = Math.PI / 4;
      tip.position.set(0.012, 1.25, 0);
      g.add(grip, ring, guard, blade, bladeFuller, tip);
      this.weaponTipLocal.set(0, 1.32, 0);
    } else if (archetype === 'elite') {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.024, 0.42, 10), palette.leather);
      grip.position.y = -0.14;
      const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.038, 1), palette.bronze);
      pommel.position.y = -0.36;
      const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.036, 0.34, 8), palette.bronze);
      guard.rotation.z = Math.PI / 2;
      guard.position.y = 0.08;
      const guardCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.042, 0), this.weaponGlowMat);
      guardCore.scale.set(1.1, 1.0, 0.72);
      guardCore.position.y = 0.085;
      const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.07, 1.28, 4), steelMat);
      blade.scale.set(1.0, 1.0, 0.3);
      blade.rotation.y = Math.PI / 4;
      blade.position.y = 0.74;
      blade.castShadow = true;
      const runeCore = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 1.14, 4), this.weaponGlowMat);
      runeCore.scale.set(1.0, 1.0, 0.56);
      runeCore.rotation.y = Math.PI / 4;
      runeCore.position.y = 0.72;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.3, 4), steelMat);
      tip.scale.set(1.0, 1.0, 0.3);
      tip.rotation.y = Math.PI / 4;
      tip.position.y = 1.52;
      g.add(grip, pommel, guard, guardCore, blade, runeCore, tip);
      this.weaponTipLocal.set(0, 1.66, 0);
    } else if (archetype === 'caster') {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 1.72, 12), palette.leather);
      shaft.position.y = 0.56;
      const finial = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.016, 10, 22), palette.bronze);
      finial.position.y = 1.5;
      const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.0085, 8, 20), this.weaponGlowMat);
      innerRing.position.y = 1.5;
      const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.062, 2), this.weaponGlowMat);
      orb.position.y = 1.5;
      g.add(shaft, finial, innerRing, orb);
      this.weaponTipLocal.set(0, 1.56, 0);
    } else {
      // Boss: Forged Beveled Damascus Greatsword (九幽断岳重剑)
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.027, 0.44, 10), palette.leather);
      grip.position.y = -0.15;
      const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.044, 1), palette.bronze);
      pommel.position.y = -0.38;
      const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.042, 0.42, 8), palette.bronze);
      guard.rotation.z = Math.PI / 2;
      guard.position.y = 0.08;
      const guardCenter = new THREE.Mesh(new THREE.OctahedronGeometry(0.064, 1), palette.bronze);
      guardCenter.scale.set(1.2, 0.85, 0.62);
      guardCenter.position.y = 0.085;
      const guardGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.044, 0), this.weaponGlowMat);
      guardGem.scale.set(0.95, 1.15, 0.88);
      guardGem.position.y = 0.085;

      const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.092, 1.44, 4), steelMat);
      blade.scale.set(1.0, 1.0, 0.32);
      blade.rotation.y = Math.PI / 4;
      blade.position.y = 0.82;
      blade.castShadow = true;

      const runeCore = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.016, 1.28, 4), this.weaponGlowMat);
      runeCore.scale.set(1.0, 1.0, 0.58);
      runeCore.rotation.y = Math.PI / 4;
      runeCore.position.y = 0.8;

      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.054, 0.36, 4), steelMat);
      tip.rotation.y = Math.PI / 4;
      tip.scale.set(1, 1, 0.32);
      tip.position.y = 1.72;
      g.add(grip, pommel, guard, guardCenter, guardGem, blade, runeCore, tip);
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
      this.weaponGlowMat.emissive.set(active ? '#e0242c' : '#b02230');
      this.weaponGlowMat.emissiveIntensity = active ? 1.38 : 0.68;
      if (this.bossRelicEmberMat) {
        this.bossRelicEmberMat.emissive.set(active ? '#e6302a' : '#b6282e');
        this.bossRelicEmberMat.emissiveIntensity = active ? 1.32 : 0.72;
      }
      for (const h of this.bossRimHandles) {
        h.uRimColor.value.set(active ? '#ff5828' : '#ff2c46');
        h.uRimStrength.value = active ? 1.04 : 0.62;
      }
    }
  }

  applyBossArchetype(variant: BossArchetype): void {
    if (this.archetype !== 'boss') return;

    if (this.bossOrnamentGroup) {
      this.torso.remove(this.bossOrnamentGroup);
      this.bossOrnamentGroup = null;
    }
    this.bossWheelMesh = null;
    this.bossWingBlades = [];

    const grp = new THREE.Group();
    if (variant === 'titan') {
      this.bossArmorMat?.color.set('#d2b488');
      this.bossTrimMat?.color.set('#8f5e24');
      this.weaponGlowMat.emissive.set('#e08a24');
      for (const h of this.bossRimHandles) h.uRimColor.value.set('#ffb848');
      const spikeMat = new THREE.MeshStandardMaterial({
        color: '#e0b058',
        emissive: new THREE.Color('#6b380c'),
        emissiveIntensity: 0.45,
        roughness: 0.28,
        metalness: 0.85,
      });
      for (const sx of [-1, 1]) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.48, 6), spikeMat);
        spike.position.set(sx * 0.34, 0.56, -0.02);
        spike.rotation.z = sx * -0.58;
        spike.rotation.x = -0.18;
        grp.add(spike);
      }
    } else if (variant === 'phantom') {
      this.bossArmorMat?.color.set('#9696ca');
      this.bossTrimMat?.color.set('#3c3272');
      this.weaponGlowMat.emissive.set('#9642ff');
      for (const h of this.bossRimHandles) h.uRimColor.value.set('#b264ff');
      const wingMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.45, 0.65, 2.35),
        transparent: true,
        opacity: 0.85,
      });
      for (let i = 0; i < 6; i++) {
        const side = i < 3 ? -1 : 1;
        const idx = i % 3;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.78 - idx * 0.1, 0.025), wingMat);
        const bx = side * (0.34 + idx * 0.18);
        const by = 0.52 - idx * 0.14;
        blade.position.set(bx, by, -0.26);
        blade.rotation.z = side * (-0.36 - idx * 0.22);
        blade.userData.baseX = bx;
        blade.userData.baseY = by;
        blade.userData.phase = i * 0.75;
        grp.add(blade);
        this.bossWingBlades.push(blade);
      }
    } else if (variant === 'inferno') {
      this.bossArmorMat?.color.set('#84423a');
      this.bossTrimMat?.color.set('#b8321c');
      this.weaponGlowMat.emissive.set('#ff4e1a');
      for (const h of this.bossRimHandles) h.uRimColor.value.set('#ff6a28');
      const flameMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(2.2, 0.65, 0.16),
      });
      const crownRing = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.024, 6, 20), flameMat);
      crownRing.position.set(0, 0.74, -0.14);
      crownRing.rotation.x = 0.35;
      grp.add(crownRing);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.24, 5), flameMat);
        horn.position.set(Math.cos(a) * 0.24, 0.78, -0.14 + Math.sin(a) * 0.12);
        grp.add(horn);
      }
    } else if (variant === 'astral') {
      this.bossArmorMat?.color.set('#b6d2f8');
      this.bossTrimMat?.color.set('#26407a');
      this.weaponGlowMat.emissive.set('#48f0ff');
      for (const h of this.bossRimHandles) h.uRimColor.value.set('#58f4ff');
      const wheel = new THREE.Group();
      wheel.position.set(0, 0.44, -0.34);
      const cyanRingMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.55, 1.95, 2.3),
      });
      const goldRingMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.9, 1.45, 0.55),
      });
      const outer = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.028, 8, 28), cyanRingMat);
      const inner = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.022, 6, 22), goldRingMat);
      inner.rotation.y = 0.45;
      wheel.add(outer, inner);
      for (let i = 0; i < 4; i++) {
        const side = i < 2 ? -1 : 1;
        const idx = i % 2;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.76 - idx * 0.12, 0.025), cyanRingMat);
        const bx = side * (0.42 + idx * 0.2);
        const by = 0.54 - idx * 0.18;
        blade.position.set(bx, by, -0.26);
        blade.rotation.z = side * (-0.34 - idx * 0.24);
        blade.userData.baseX = bx;
        blade.userData.baseY = by;
        blade.userData.phase = i * 1.1;
        grp.add(blade);
        this.bossWingBlades.push(blade);
      }
      grp.add(wheel);
      this.bossWheelMesh = wheel;
    } else {
      // celestial
      this.bossArmorMat?.color.set('#c4b4dc');
      this.bossTrimMat?.color.set('#5a265c');
      this.weaponGlowMat.emissive.set('#ff3868');
      for (const h of this.bossRimHandles) h.uRimColor.value.set('#ff4e88');
      const wheel = new THREE.Group();
      wheel.position.set(0, 0.42, -0.32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(2.0, 0.42, 0.78),
      });
      const outer = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.028, 8, 28), ringMat);
      const inner = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.018, 6, 20), ringMat);
      wheel.add(outer, inner);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.44, 0.02), ringMat);
        spoke.position.set(Math.cos(a) * 0.56, Math.sin(a) * 0.56, 0);
        spoke.rotation.z = a + Math.PI / 2;
        wheel.add(spoke);
      }
      grp.add(wheel);
      this.bossWheelMesh = wheel;
    }

    this.torso.add(grp);
    this.bossOrnamentGroup = grp;
  }

  triggerHitFlash(strength = 1.0): void {
    this.hitFlash = Math.max(this.hitFlash, strength);
  }

  setSwordGlow(intensity: number): void {
    this.swordGlowInput = intensity;
    this.updateWeaponShimmer(0);
  }

  private updateWeaponShimmer(pulse: number): void {
    const shimmer = 1 + pulse * (0.06 + this.weaponTierFactor * 0.16);
    const tierBoost = this.weaponTierBoost;
    this.weaponGlowMat.emissiveIntensity = Math.min(2.2, this.swordGlowInput * 0.48 * tierBoost * shimmer);
    if (this.weaponEdgeMat) {
      this.weaponEdgeMat.emissiveIntensity = Math.min(
        1.65,
        (0.1 + this.weaponTierFactor * 0.72) * (0.72 + this.swordGlowInput * 0.36) * shimmer,
      );
    }
    if (this.guardCrystalMat) {
      this.guardCrystalMat.emissiveIntensity = Math.min(
        2.3,
        (0.32 + this.weaponTierFactor * 1.12) * (0.8 + this.swordGlowInput * 0.28) * shimmer,
      );
    }
    if (this.bladeSteelMat && (this.archetype === 'xiaoyao' || this.archetype === 'ally')) {
      const baseSteel = 0.03 + this.weaponTierFactor * 0.2;
      this.bladeSteelMat.emissiveIntensity = baseSteel * (0.85 + this.swordGlowInput * 0.22) * shimmer;
    }
  }

  applyHeroAppearance(
    skin: HeroSkinVisual,
    weapon: WeaponVisual,
    armorVisual?: HeroArmorVisual,
    relicVisual?: HeroRelicVisual,
    skinId?: string,
  ): void {
    const resolvedSkinId =
      skinId ??
      (skin.secondaryHex.toLowerCase() === '#8ec2ec'
        ? 'skin_shuangxue'
        : skin.secondaryHex.toLowerCase() === '#94282e'
          ? 'skin_chiyan'
          : skin.secondaryHex.toLowerCase() === '#704cb2'
            ? 'skin_zixiao'
            : skin.secondaryHex.toLowerCase() === '#d9a438'
              ? 'skin_jinwu'
              : 'skin_xiaoyao');
    this.activeHeroSkinId = resolvedSkinId;

    if (this.skinPrimaryMat) this.skinPrimaryMat.color.set(skin.primaryHex);
    if (this.skinRobeInnerMat) this.skinRobeInnerMat.color.set(skin.robeInnerHex);
    if (this.skinSecondaryMat) {
      this.skinSecondaryMat.color.set(skin.secondaryHex);
      this.skinSecondaryMat.sheenColor.set(skin.sheenHex);
      this.skinSecondaryMat.metalness = 0.06;
      this.skinSecondaryMat.roughness = 0.84;
    }
    if (this.skinAccentMat) {
      this.skinAccentMat.color.set(skin.accentHex);
      this.skinAccentMat.sheenColor.set(skin.sheenHex);
    }
    if (this.skinTrimMat) {
      this.skinTrimMat.color.set(skin.trimHex);
      this.skinTrimMat.emissive.set('#000000');
      this.skinTrimMat.emissiveIntensity = 0;
    }
    if (this.skinBronzeMat) this.skinBronzeMat.color.set(skin.bronzeHex);

    // Per-skin dynamic hair tint, sheen, 3D headpiece crown & signature floating back/shoulder ornaments
    const hairPalette: Record<
      string,
      { main: string; base: string; sheen: string; emissive: string; emissiveInt: number; rough: number }
    > = {
      skin_shuangxue: {
        main: '#b9cce0',
        base: '#9db2c8',
        sheen: '#dceeff',
        emissive: '#101d2e',
        emissiveInt: 0.05,
        rough: 0.44,
      },
      skin_chiyan: {
        main: '#261418',
        base: '#1c0f12',
        sheen: '#8e303a',
        emissive: '#1e0608',
        emissiveInt: 0.08,
        rough: 0.38,
      },
      skin_zixiao: {
        main: '#1c1734',
        base: '#151128',
        sheen: '#866ad8',
        emissive: '#140b2c',
        emissiveInt: 0.09,
        rough: 0.38,
      },
      skin_jinwu: {
        main: '#221b12',
        base: '#19140d',
        sheen: '#c4963c',
        emissive: '#1a1004',
        emissiveInt: 0.08,
        rough: 0.36,
      },
      skin_xiaoyao: {
        main: '#161314',
        base: '#131011',
        sheen: '#4c433e',
        emissive: '#000000',
        emissiveInt: 0,
        rough: 0.40,
      },
    };
    const hp = hairPalette[resolvedSkinId] ?? hairPalette.skin_xiaoyao;
    if (this.heroHairMat) {
      this.heroHairMat.color.set(hp.main);
      this.heroHairMat.sheenColor.set(hp.sheen);
      this.heroHairMat.emissive.set(hp.emissive);
      this.heroHairMat.emissiveIntensity = hp.emissiveInt;
      this.heroHairMat.roughness = hp.rough;
    }
    if (this.heroHairBaseMat) {
      this.heroHairBaseMat.color.set(hp.base);
      this.heroHairBaseMat.sheenColor.set(hp.sheen);
      this.heroHairBaseMat.emissive.set(hp.emissive);
      this.heroHairBaseMat.emissiveIntensity = hp.emissiveInt * 0.75;
    }
    for (const [id, crownGrp] of Object.entries(this.heroCrownVariants)) {
      if (crownGrp) crownGrp.visible = id === resolvedSkinId;
    }
    for (const [id, ornGrp] of Object.entries(this.heroSkinOrnaments)) {
      if (ornGrp) ornGrp.visible = id === resolvedSkinId;
    }

    // Apply Armor Visual (玄甲衣袍: sleek refined metallic shoulder plates without white blowout)
    const armorRarity: EquipRarity = armorVisual?.rarity ?? 'common';
    this.heroArmorRarity = armorRarity;
    if (this.heroArmorGroup && this.heroArmorPlateMat && this.heroArmorTrimMat) {
      if (!armorVisual || armorRarity === 'common') {
        this.heroArmorGroup.visible = false;
      } else {
        this.heroArmorGroup.visible = true;
        const defaultPlateHex =
          armorRarity === 'legendary' ? '#c8a65a' : armorRarity === 'epic' ? '#9e88b8' : '#7ea6be';
        const defaultGlowHex =
          armorRarity === 'legendary' ? '#dca838' : armorRarity === 'epic' ? '#be8238' : '#40a8bc';
        const tintHex = armorVisual.tintHex ?? defaultGlowHex;
        const armorScale = armorRarity === 'legendary' ? 0.86 : armorRarity === 'epic' ? 0.81 : 0.76;
        this.heroArmorGroup.scale.setScalar(armorScale);
        this.heroArmorPlateMat.color.set(defaultPlateHex);
        this.heroArmorPlateMat.emissive.set(tintHex);
        this.heroArmorPlateMat.emissiveIntensity =
          armorRarity === 'legendary' ? 0.16 : armorRarity === 'epic' ? 0.13 : 0.10;
        this.heroArmorPlateMat.metalness =
          armorRarity === 'legendary' ? 0.90 : armorRarity === 'epic' ? 0.84 : 0.76;
        this.heroArmorPlateMat.roughness =
          armorRarity === 'legendary' ? 0.24 : armorRarity === 'epic' ? 0.29 : 0.35;
        this.heroArmorPlateMat.clearcoat =
          armorRarity === 'legendary' ? 0.62 : armorRarity === 'epic' ? 0.48 : 0.34;

        this.heroArmorTrimMat.color.set(tintHex);
        this.heroArmorTrimMat.emissive.set(tintHex);
        this.heroArmorTrimMat.emissiveIntensity =
          armorRarity === 'legendary' ? 0.22 : armorRarity === 'epic' ? 0.16 : 0.12;

        if (this.skinSecondaryMat) {
          this.skinSecondaryMat.metalness =
            armorRarity === 'legendary' ? 0.26 : armorRarity === 'epic' ? 0.18 : 0.12;
          this.skinSecondaryMat.roughness =
            armorRarity === 'legendary' ? 0.62 : armorRarity === 'epic' ? 0.70 : 0.78;
        }
        if (this.skinTrimMat) {
          this.skinTrimMat.emissive.set(tintHex);
          this.skinTrimMat.emissiveIntensity =
            armorRarity === 'legendary' ? 0.20 : armorRarity === 'epic' ? 0.15 : 0.10;
        }
      }
    }

    // Apply Relic Visual (镇妖灵宝: orbiting floating jade/gold spirit talisman & halo aura)
    const relicRarity: EquipRarity = relicVisual?.rarity ?? 'common';
    this.heroRelicRarity = relicRarity;
    if (this.heroRelicGroup && this.heroRelicOrbMat && this.heroRelicTalMat && this.heroRelicHaloMat) {
      if (!relicVisual) {
        this.heroRelicGroup.visible = false;
      } else {
        this.heroRelicGroup.visible = true;
        const defaultAuraHex =
          relicRarity === 'legendary'
            ? '#ffe066'
            : relicRarity === 'epic'
              ? '#c872ff'
              : relicRarity === 'rare'
                ? '#4cf0d2'
                : '#e8c474';
        const auraHex = relicVisual.auraHex ?? defaultAuraHex;
        const activeCount =
          relicRarity === 'legendary' ? 4 : relicRarity === 'epic' ? 3 : relicRarity === 'rare' ? 2 : 1;
        const orbScale =
          relicRarity === 'legendary' ? 1.12 : relicRarity === 'epic' ? 1.0 : relicRarity === 'rare' ? 0.9 : 0.68;

        this.heroRelicOrbMat.color.set(auraHex);
        this.heroRelicOrbMat.emissive.set(auraHex);
        this.heroRelicOrbMat.emissiveIntensity =
          relicRarity === 'legendary' ? 1.55 : relicRarity === 'epic' ? 1.24 : relicRarity === 'rare' ? 0.96 : 0.58;

        this.heroRelicTalMat.emissive.set(auraHex);
        this.heroRelicTalMat.emissiveIntensity =
          relicRarity === 'legendary' ? 1.05 : relicRarity === 'epic' ? 0.82 : relicRarity === 'rare' ? 0.64 : 0.36;

        this.heroRelicHaloMat.color.set(auraHex);
        this.heroRelicHaloMat.opacity =
          relicRarity === 'legendary' ? 0.7 : relicRarity === 'epic' ? 0.46 : 0;

        for (let i = 0; i < this.heroRelicOrbitals.length; i++) {
          const sat = this.heroRelicOrbitals[i];
          sat.visible = i < activeCount;
          sat.scale.setScalar(orbScale);
        }
        if (this.heroRelicHalo) {
          this.heroRelicHalo.visible = relicRarity === 'epic' || relicRarity === 'legendary';
          this.heroRelicHalo.scale.setScalar(relicRarity === 'legendary' ? 1.08 : 0.92);
        }
      }
    }

    const emCol = new THREE.Color(weapon.emissiveHex);
    const glowCol = new THREE.Color(weapon.glowHex);
    const emMax = Math.max(emCol.r, emCol.g, emCol.b);
    const emSat = emMax - Math.min(emCol.r, emCol.g, emCol.b);
    const edgeSum = weapon.trailEdge[0] + weapon.trailEdge[1] + weapon.trailEdge[2];
    const chromaScore = clamp((emSat - 0.36) / 0.44, 0, 1);
    const lumaScore = clamp((emMax - 0.48) / 0.42, 0, 1);
    const trailScore = clamp((edgeSum - 2.6) / 0.95, 0, 1);
    const amberEpicBonus = emCol.r > 0.8 && emCol.b < 0.2 ? 0.12 : 0;
    const goldLegendBonus = glowCol.r > 0.9 && glowCol.g > 0.85 && glowCol.b < 0.75 ? 0.25 : 0;
    const tier = clamp(chromaScore * 0.4 + lumaScore * 0.35 + trailScore * 0.25 + amberEpicBonus + goldLegendBonus, 0, 1);

    this.weaponTierFactor = tier;
    this.weaponTierBoost = 0.58 + tier * 1.07;

    if (this.bladeSteelMat) {
      this.bladeSteelMat.color.set(weapon.steelHex);
      this.bladeSteelMat.emissive.set(weapon.emissiveHex);
      this.bladeSteelMat.roughness = 0.24 - tier * 0.09;
      this.bladeSteelMat.metalness = 0.88 + tier * 0.06;
      this.bladeSteelMat.clearcoat = 0.35 + tier * 0.55;
      this.bladeSteelMat.sheen = tier * 0.45;
      this.bladeSteelMat.sheenColor.set(weapon.glowHex);
    }
    this.weaponGlowMat.color.set(weapon.glowHex);
    this.weaponGlowMat.emissive.set(weapon.emissiveHex);
    if (this.weaponEdgeMat) {
      this.weaponEdgeMat.color.set(weapon.glowHex);
      this.weaponEdgeMat.emissive.set(weapon.emissiveHex);
    }
    if (this.guardCrystalMat) {
      this.guardCrystalMat.color.set(weapon.glowHex);
      this.guardCrystalMat.emissive.set(weapon.emissiveHex);
    }
    this.updateWeaponShimmer(0);
  }

  getWeaponTipWorld(out: THREE.Vector3): THREE.Vector3 {
    out.copy(this.weaponTipLocal);
    return this.weaponMesh.localToWorld(out);
  }

  applyPose(pose: PoseName, t: number, elapsed: number, dt: number, moveSpeed = 0): void {
    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt * 7.5);
      if (this.hitFlash > 0.01) {
        for (const m of this.flashMats) {
          m.emissive.setRGB(this.hitFlash * 0.62, this.hitFlash * 0.16, this.hitFlash * 0.14);
          m.emissiveIntensity = 0.85;
        }
      } else {
        this.hitFlash = 0;
        for (const base of this.flashMatBase) {
          base.mat.emissive.copy(base.emissive);
          base.mat.emissiveIntensity = base.intensity;
        }
      }
    }
    if (this.archetype === 'xiaoyao' && this.weaponTierFactor > 0.12) {
      this.updateWeaponShimmer(Math.sin(elapsed * 4.2));
    }

    let pelX = 0;
    let pelY = -0.03 + Math.sin(elapsed * 2.5) * 0.016;
    let pelZ = 0;
    let tPitch = 0.06;
    let tYaw = -0.22;
    let tRoll = 0;
    let hYaw = 0.16;
    let rHand: [number, number, number] = [-0.36, 1.09 + Math.sin(elapsed * 2.5) * 0.018, 0.25];
    let lHand: [number, number, number] = [0.37, 1.13 - Math.sin(elapsed * 2.5) * 0.016, 0.3];
    let swordDir: [number, number, number] = [-0.38, 0.42, 0.82];
    let rFoot: [number, number, number] = [-0.18, 0, -0.12];
    let lFoot: [number, number, number] = [0.18, 0, 0.16];
    let drinking = false;

    if (pose === 'idle') {
      tPitch = 0.02;
      tYaw = 0;
      hYaw = Math.sin(elapsed * 0.9) * 0.07;
      rHand = [-0.32, 1.01 + Math.sin(elapsed * 2.0) * 0.015, 0.1];
      lHand = [0.34, 1.03 - Math.sin(elapsed * 2.0) * 0.015, 0.15];
      swordDir = [-0.25, -0.5, 0.8];
      rFoot = [-0.16, 0, 0];
      lFoot = [0.16, 0, 0.03];
    } else if (pose === 'run') {
      const cyc = elapsed * (this.archetype === 'boss' ? 7.0 : 11.2);
      const stride = Math.sin(cyc);
      const liftR = Math.max(0, Math.cos(cyc)) * 0.2;
      const liftL = Math.max(0, -Math.cos(cyc)) * 0.2;
      pelY = -0.06 + Math.abs(Math.sin(cyc)) * 0.072;
      tPitch = 0.21;
      tYaw = stride * 0.16;
      tRoll = -stride * 0.045;
      hYaw = -tYaw * 0.7;
      rHand = [-0.38, 1.07 + stride * 0.08, -0.18 - stride * 0.12];
      lHand = [0.36, 1.13 - stride * 0.08, 0.24 + stride * 0.2];
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
      rHand = [-0.18, 1.25, 0.36];
      lHand = [0.16, 1.31, 0.38];
      swordDir = [0.72, 0.66, 0.14];
      rFoot = [-0.24, 0, -0.22];
      lFoot = [0.24, 0, 0.26];
    } else if (pose === 'dodge') {
      pelY = -0.22;
      pelZ = 0.15;
      tPitch = 0.54;
      tYaw = -0.38;
      hYaw = 0.34;
      rHand = [-0.46, 1.01, -0.34];
      lHand = [0.36, 1.05, 0.38];
      swordDir = [-0.35, -0.1, -0.92];
      rFoot = [-0.22, 0.12, -0.38];
      lFoot = [0.22, 0.05, 0.34];
    } else if (pose === 'castQ') {
      const u = easeOutQuart(t);
      pelY = -0.08;
      tPitch = 0.15;
      tYaw = lerp(-0.55, 0.45, u);
      hYaw = -tYaw * 0.7;
      rHand = [lerp(-0.4, -0.12, u), 1.33, lerp(-0.1, 0.62, u)];
      lHand = [0.22, 1.35, 0.42];
      swordDir = [0.05, 0.15, 0.98];
      rFoot = [-0.22, 0, -0.22];
      lFoot = [0.24, 0, 0.3];
    } else if (pose === 'castE' || pose === 'castR') {
      const rise = clamp(t * 2.2, 0, 1);
      pelY = pose === 'castR' ? Math.sin(clamp(t, 0, 1) * Math.PI) * 0.32 : -0.04;
      tPitch = -0.14 * rise;
      tYaw = 0;
      rHand = [-0.14, lerp(1.17, 1.97, rise), 0.14];
      lHand = [0.24, lerp(1.13, 1.51, rise), 0.34];
      swordDir = [0.0, 0.98, 0.12];
      rFoot = [-0.22, pelY > 0.05 ? 0.16 : 0, -0.1];
      lFoot = [0.22, pelY > 0.05 ? 0.22 : 0, 0.14];
    } else if (pose === 'drink') {
      drinking = true;
      pelY = -0.02;
      tPitch = -0.16 * Math.sin(clamp(t, 0, 1) * Math.PI);
      tYaw = 0.12;
      rHand = [-0.36, 1.05, 0.14];
      lHand = [0.08, 1.59, 0.24];
      swordDir = [-0.3, -0.45, 0.84];
    } else if (pose === 'hit' || pose === 'stagger') {
      const sway = pose === 'stagger' ? Math.sin(elapsed * 8.5) * 0.14 : (1 - t) * 0.38;
      pelY = -0.1;
      pelZ = -0.14 * (1 - t);
      tPitch = -0.32 - sway * 0.5;
      tYaw = sway;
      rHand = [-0.46, 1.19, -0.08];
      lHand = [0.46, 1.21, 0.04];
      swordDir = [-0.7, 0.5, 0.35];
    } else if (pose === 'enemyWindup') {
      const u = clamp(t, 0, 1);
      pelY = -0.08 - u * 0.06;
      tPitch = 0.12 - u * 0.26;
      tYaw = -0.78 * u;
      hYaw = 0.65 * u;
      rHand = [-0.52, 1.27 + u * 0.62, -0.22 * u];
      lHand = [0.34, 1.21, 0.28];
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
          ? [-0.12, lerp(1.93, 0.69, u), lerp(-0.1, 0.74, u)]
          : [lerp(-0.54, 0.56, u), lerp(1.49, 1.03, u), lerp(-0.1, 0.54, u)];
      lHand = [0.36, 1.09, -0.14];
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
      rHand = [-0.36, lerp(0.81, 1.61, u), 0.35];
      lHand = [0.38, lerp(0.73, 1.31, u), 0.22];
      swordDir = [0.1, lerp(-0.85, 0.65, u), 0.5];
      rFoot = [-0.26, 0, -0.14];
      lFoot = [0.26, 0, 0.22];
    } else if (pose === 'mountHorse') {
      const gallop = moveSpeed > 0.4 ? Math.sin(elapsed * 8.5) * 0.04 : 0;
      pelY = -0.36 + gallop * 0.4;
      pelZ = -0.04;
      tPitch = moveSpeed > 0.4 ? 0.16 + gallop : 0.05;
      tYaw = 0;
      tRoll = 0;
      hYaw = Math.sin(elapsed * 1.1) * 0.05;
      rHand = [-0.36, 0.94, 0.14];
      lHand = [0.16, 0.96, 0.44];
      swordDir = [-0.24, -0.45, 0.85];
      rFoot = [-0.36, 0.02, 0.12];
      lFoot = [0.36, 0.02, 0.12];
    } else if (pose === 'mountSword') {
      const sway = Math.sin(elapsed * 2.8) * 0.025;
      pelY = -0.08;
      tPitch = moveSpeed > 0.4 ? 0.12 : 0.04;
      tYaw = -0.44;
      tRoll = sway * 0.5;
      hYaw = 0.44;
      lHand = [0.22, 1.32 + sway, 0.44];
      rHand = [-0.38, 1.12 - sway, -0.24];
      swordDir = [-0.42, 0.35, -0.84];
      rFoot = [-0.09, 0.02, -0.34];
      lFoot = [0.09, 0.02, 0.34];
    } else if (pose === 'showcaseFlourish') {
      const f = samplePoseFrames(SHOWCASE_FLOURISH_FRAMES, clamp(t, 0, 1));
      const settleBreath = clamp((t - 0.70) / 0.30, 0, 1);
      const breath = Math.sin(elapsed * 2.15) * settleBreath;
      pelX = f.pelvisOffset[0];
      pelY = f.pelvisOffset[1] + breath * 0.012;
      pelZ = f.pelvisOffset[2];
      tPitch = f.torsoPitch + breath * 0.012;
      tYaw = f.torsoYaw;
      tRoll = f.torsoRoll + Math.sin(elapsed * 1.3) * 0.01 * settleBreath;
      hYaw = f.headYaw + Math.sin(elapsed * 0.95) * 0.045 * settleBreath;
      rHand = [f.rHand[0], f.rHand[1] + breath * 0.015, f.rHand[2]];
      lHand = [f.lHand[0], f.lHand[1] - breath * 0.013, f.lHand[2]];
      swordDir = f.swordDir;
      rFoot = f.rFoot;
      lFoot = f.lFoot;
    } else if (pose === 'dead') {
      const u = easeOutQuart(clamp(t, 0, 1));
      pelY = lerp(-0.08, -0.82, u);
      tPitch = lerp(0.1, -1.42, u);
      rHand = [-0.45, lerp(1.07, 0.22, u), 0.1];
      lHand = [0.45, lerp(1.07, 0.2, u), 0.1];
      swordDir = [-0.8, -0.2, 0.4];
      rFoot = [-0.2, 0, 0.2];
      lFoot = [0.2, 0, 0.24];
    }

    const hoverY = this.archetype === 'caster' && pose !== 'dead' ? 0.32 + Math.sin(elapsed * 2.9) * 0.09 : 0;

    this.pelvis.position.set(pelX, this.hipY + pelY + hoverY, pelZ);
    this.torso.rotation.set(tPitch, tYaw, tRoll);
    this.torsoRig.chestBone.rotation.set(tPitch, tYaw, tRoll);
    this.head.rotation.y = hYaw;

    // Exact 3D shoulder socket anchors derived directly from pitched/yawed/rolled torso (arms NEVER detach!)
    this._rShoulder
      .copy(this._shoulderLocalR)
      .applyEuler(this.torso.rotation)
      .add(this.torso.position)
      .add(this.pelvis.position);
    this._lShoulder
      .copy(this._shoulderLocalL)
      .applyEuler(this.torso.rotation)
      .add(this.torso.position)
      .add(this.pelvis.position);
    this._rHip.set(pelX - this.hipX, this.hipY + pelY + hoverY - 0.04, pelZ);
    this._lHip.set(pelX + this.hipX, this.hipY + pelY + hoverY - 0.04, pelZ);

    // Right arm IK -> Continuous Seamless SkinnedMesh Bones
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
    solveContinuousLimbBones(
      this.rArmRig,
      this._rShoulder,
      this._mid,
      this._end,
      this._rPole,
      false,
      this._lowerQuat,
    );
    this.rHandGroup.position.copy(this._end);
    this.rHandGroup.quaternion.copy(this._lowerQuat);

    if (this.weaponDrawn) {
      this.weaponHandMount.position.copy(this._end);
      this._dir.set(swordDir[0], swordDir[1], swordDir[2]).normalize();
      this.weaponHandMount.quaternion.setFromUnitVectors(this._upY, this._dir);
    }

    // Left arm IK -> Continuous Seamless SkinnedMesh Bones
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
    solveContinuousLimbBones(
      this.lArmRig,
      this._lShoulder,
      this._mid,
      this._end,
      this._lPole,
      false,
      this._lowerQuat,
    );
    this.lHandGroup.position.copy(this._end);
    this.lHandGroup.quaternion.copy(this._lowerQuat);

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

    // Right & Left Leg IK -> Continuous Seamless SkinnedMesh Bones
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
    solveContinuousLimbBones(this.rLegRig, this._rHip, this._mid, this._end, this._rPole, true);
    this.rFootMesh.position.set(this._end.x, Math.max(0.036, this._end.y - 0.014), this._end.z + 0.02);

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
    solveContinuousLimbBones(this.lLegRig, this._lHip, this._mid, this._end, this._lPole, true);
    this.lFootMesh.position.set(this._end.x, Math.max(0.036, this._end.y - 0.014), this._end.z + 0.02);

    // Secondary Cloth Motion: natural gravity-draped twin silk ribbons hanging downward behind shoulders (never flipping above head!)
    this.ribbonPhase += dt * (3.2 + moveSpeed * 1.15);
    const flourishWind = pose === 'showcaseFlourish' ? Math.sin(clamp(t, 0, 1) * Math.PI) * 0.18 : 0;
    const windTrail = clamp(moveSpeed * 0.075 + flourishWind, 0, 0.52);
    for (let c = 0; c < this.ribbonSegs.length; c++) {
      const sideSign = c === 0 ? -1 : 1;
      const chain = this.ribbonSegs[c];
      for (let i = 0; i < chain.length; i++) {
        const wave = Math.sin(this.ribbonPhase - i * 0.82 + c * 1.15);
        if (i === 0) {
          // Gentle positive X tilt keeps downward -Y ribbons draped cleanly behind shoulders & back
          chain[i].rotation.x = 0.18 + windTrail * 0.42 + wave * 0.03;
          chain[i].rotation.z = sideSign * (0.09 + windTrail * 0.04) + wave * 0.025;
          chain[i].rotation.y = sideSign * 0.10 + wave * 0.04;
        } else {
          chain[i].rotation.x = 0.03 + windTrail * 0.10 + wave * (0.045 + i * 0.015);
          chain[i].rotation.z = wave * (0.035 + i * 0.014);
          chain[i].rotation.y = wave * (0.045 + i * 0.018);
        }
      }
    }

    if (this.heroPonytailGroup) {
      const tailWave = Math.sin(this.ribbonPhase * 0.78);
      this.heroPonytailGroup.rotation.x = 0.06 + windTrail * 0.34 + tailWave * 0.04;
      this.heroPonytailGroup.rotation.z = Math.sin(this.ribbonPhase * 0.55) * (0.04 + windTrail * 0.06);
    }

    const flapLift = clamp(moveSpeed * 0.055 + flourishWind * 0.25, 0, 0.36);
    if (this.skirtPanels.length === 4) {
      this.skirtPanels[0].rotation.x = -0.04 - flapLift * 0.3;
      this.skirtPanels[1].rotation.x = -0.06 - flapLift * 1.05;
    }
    if (this.capeMesh) {
      this.capeMesh.rotation.x = -0.14 - flapLift * 0.85 + Math.sin(elapsed * 2.4) * 0.04;
    }

    if (this.archetype === 'xiaoyao') {
      if (this.heroArmorGroup?.visible && this.heroArmorTrimMat) {
        const baseTrim =
          this.heroArmorRarity === 'legendary' ? 0.22 : this.heroArmorRarity === 'epic' ? 0.16 : 0.12;
        this.heroArmorTrimMat.emissiveIntensity = baseTrim * (0.88 + Math.sin(elapsed * 3.0) * 0.14);
      }
      // Animate Per-Skin Signature Floating Back/Shoulder Ornaments
      if (this.activeHeroSkinId === 'skin_shuangxue' && this.heroSkinOrnaments.skin_shuangxue?.visible) {
        for (let i = 0; i < this.heroFrostCrystals.length; i++) {
          const cry = this.heroFrostCrystals[i];
          const ph = ((cry.userData.phase as number) ?? 0) + elapsed * 1.15;
          cry.position.set(
            Math.cos(ph) * 0.44,
            0.47 + Math.sin(ph * 1.5 + i) * 0.085,
            -0.16 + Math.sin(ph) * 0.20,
          );
          cry.rotation.y = -ph * 1.4;
          cry.rotation.z = Math.sin(elapsed * 2.2 + i) * 0.16;
        }
      } else if (this.activeHeroSkinId === 'skin_chiyan' && this.heroSkinOrnaments.skin_chiyan?.visible) {
        for (const plume of this.heroFlamePlumes) {
          const baseY = (plume.userData.baseY as number) ?? 0.48;
          const baseX = (plume.userData.baseX as number) ?? 0.32;
          const ph = (plume.userData.phase as number) ?? 0;
          const pulse = Math.sin(elapsed * 3.6 + ph);
          plume.position.y = baseY + pulse * 0.028;
          plume.position.x = baseX + Math.sign(baseX) * (0.012 * Math.cos(elapsed * 2.8 + ph));
          plume.scale.setScalar(0.96 + pulse * 0.06);
        }
      } else if (this.activeHeroSkinId === 'skin_zixiao' && this.heroStarWheel && this.heroSkinOrnaments.skin_zixiao?.visible) {
        this.heroStarWheel.rotation.z = elapsed * 0.72;
        this.heroStarWheel.position.y = 0.49 + Math.sin(elapsed * 2.1) * 0.018;
      } else if (this.activeHeroSkinId === 'skin_jinwu' && this.heroSunHalo && this.heroSkinOrnaments.skin_jinwu?.visible) {
        this.heroSunHalo.rotation.z = -elapsed * 0.52;
        this.heroSunHalo.position.y = 0.51 + Math.sin(elapsed * 2.0) * 0.018;
        for (let i = 0; i < this.heroSunFeathers.length; i++) {
          const f = this.heroSunFeathers[i];
          const s = 0.94 + Math.sin(elapsed * 3.8 + i * 0.8) * 0.08;
          f.scale.set(s, s, 0.24);
        }
      }
      if (this.heroRelicGroup?.visible) {
        const activeCount =
          this.heroRelicRarity === 'legendary'
            ? 4
            : this.heroRelicRarity === 'epic'
              ? 3
              : this.heroRelicRarity === 'rare'
                ? 2
                : 1;
        const radius = this.heroRelicRarity === 'common' ? 0.39 : this.heroRelicRarity === 'legendary' ? 0.55 : 0.49;
        const speed = this.heroRelicRarity === 'legendary' ? 1.55 : 1.2;
        const baseY = this.heroRelicRarity === 'common' ? 0.14 : 0.34;
        for (let i = 0; i < this.heroRelicOrbitals.length; i++) {
          const sat = this.heroRelicOrbitals[i];
          if (!sat.visible) continue;
          const ph = (i / Math.max(1, activeCount)) * Math.PI * 2 + elapsed * speed;
          sat.position.set(
            Math.cos(ph) * radius,
            baseY + Math.sin(ph * 1.8 + i) * 0.08,
            Math.sin(ph) * radius,
          );
          sat.rotation.y = -ph + Math.PI * 0.5;
          sat.rotation.z = Math.sin(elapsed * 2.4 + i) * 0.12;
        }
        if (this.heroRelicHalo?.visible) {
          this.heroRelicHalo.rotation.z = elapsed * 0.85;
        }
      }
    } else if (this.archetype === 'caster') {
      for (const orb of this.floatingOrbitals) {
        const ph = (orb.userData.orbitPhase as number) + elapsed * 1.65;
        orb.position.set(Math.cos(ph) * 0.76, 0.26 + Math.sin(ph * 2) * 0.09, Math.sin(ph) * 0.76);
        orb.rotation.y = -ph + Math.PI / 2;
      }
    } else if (this.archetype === 'boss') {
      const amp = this.phase2Active ? 0.075 : 0.038;
      const spd = this.phase2Active ? 3.2 : 1.7;
      for (const sw of this.floatingOrbitals) {
        const baseY = (sw.userData.baseY as number) ?? 0.78;
        const ph = (sw.userData.phase as number) ?? 0;
        sw.position.y = baseY + Math.sin(elapsed * spd + ph) * amp;
      }
      if (this.bossWheelMesh) {
        this.bossWheelMesh.rotation.z = elapsed * (this.phase2Active ? 2.2 : 1.15);
      }
      for (const blade of this.bossWingBlades) {
        const baseY = (blade.userData.baseY as number) ?? 0.4;
        const ph = (blade.userData.phase as number) ?? 0;
        blade.position.y = baseY + Math.sin(elapsed * 3.4 + ph) * 0.055;
      }
    }

    this.bodyGroup.updateMatrixWorld(true);
  }
}

import * as THREE from 'three';
import { CharacterRig, type CharacterArchetype } from '../entities/CharacterRig';
import type { TelegraphHandle } from '../vfx/VfxSystem';

export type HeroActionState =
  | 'idle'
  | 'run'
  | 'attack'
  | 'block'
  | 'dodge'
  | 'parryCounter'
  | 'skillQ'
  | 'skillE'
  | 'skillR'
  | 'drink'
  | 'hit'
  | 'dead';

export interface HeroState {
  rig: CharacterRig;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  radius: number;

  hp: number;
  maxHp: number;
  delayedHp: number;
  spirit: number;
  maxSpirit: number;
  stamina: number;
  maxStamina: number;
  ult: number; // 0..100 剑意
  gourds: number;
  maxGourds: number;

  state: HeroActionState;
  stateTime: number;
  stateDuration: number;
  comboStep: number; // 1 | 2 | 3
  comboWindowTimer: number;
  attackHasHit: Set<number>;
  attackVfxFired: boolean;

  blockElapsed: number; // tracks 0.24s perfect parry window!
  dodgeDir: THREE.Vector3;
  dodgeInvuln: number;
  dodgePerfectTriggered: boolean;
  afterimageTimer: number;
  hurtInvuln: number;
  hitstopTimer: number;
  combatIdleTimer: number;

  // Counter-execution window after block/parry
  counterTargetId: number | null;
  counterWindowTimer: number;

  // Cooldowns
  cdQ: number;
  cdE: number;
  cdR: number;
  cdHeal: number;

  // Slide magnetism target
  magnetTargetId: number | null;
  magnetSlideRemain: number;

  // Stats for summary screen
  comboCount: number;
  comboDecayTimer: number;
  maxCombo: number;
  parryCount: number;
  totalDamage: number;
}

export type EnemyAiState =
  | 'intro'
  | 'orbit'
  | 'chase'
  | 'windup'
  | 'attack'
  | 'recover'
  | 'stagger'
  | 'hit'
  | 'dead';

export type EnemyMoveKind = 'cleave' | 'lunge' | 'slam' | 'orb' | 'yinCircle' | 'barrage';

export interface EnemyEntity {
  id: number;
  kind: Exclude<CharacterArchetype, 'xiaoyao' | 'ally'>;
  name: string;
  rig: CharacterRig;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  radius: number;

  hp: number;
  maxHp: number;
  poise: number;
  maxPoise: number;
  phase: 1 | 2;

  aiState: EnemyAiState;
  stateTime: number;
  stateDuration: number;
  moveKind: EnemyMoveKind;
  moveHasHit: boolean;
  moveRange: number;
  moveDamage: number;
  moveUnblockable: boolean;
  comboFollowup: boolean;

  orbitDir: number;
  attackCooldown: number;
  hitstopTimer: number;
  shakeTimer: number;
  deathTimer: number;

  telegraph: TelegraphHandle | null;
  telegraphPos: THREE.Vector3;
  counterRing: THREE.Mesh;
  hpBarGroup: THREE.Group;
  hpFillMesh: THREE.Mesh;
}

export interface ProjectileEntity {
  id: number;
  friendly: boolean;
  kind: 'flyingSword' | 'yinOrb';
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  radius: number;
  damage: number;
  age: number;
  maxAge: number;
  hitIds: Set<number>;
  mesh: THREE.Group;
}

export function createHero(): HeroState {
  const rig = new CharacterRig('xiaoyao');
  return {
    rig,
    pos: new THREE.Vector3(0, 0, 7.2),
    vel: new THREE.Vector3(),
    yaw: Math.PI,
    radius: 0.52,

    hp: 180,
    maxHp: 180,
    delayedHp: 180,
    spirit: 85,
    maxSpirit: 100,
    stamina: 100,
    maxStamina: 100,
    ult: 35,
    gourds: 3,
    maxGourds: 3,

    state: 'idle',
    stateTime: 0,
    stateDuration: 0,
    comboStep: 0,
    comboWindowTimer: 0,
    attackHasHit: new Set(),
    attackVfxFired: false,

    blockElapsed: 0,
    dodgeDir: new THREE.Vector3(0, 0, -1),
    dodgeInvuln: 0,
    dodgePerfectTriggered: false,
    afterimageTimer: 0,
    hurtInvuln: 0,
    hitstopTimer: 0,
    combatIdleTimer: 0,

    counterTargetId: null,
    counterWindowTimer: 0,

    cdQ: 0,
    cdE: 0,
    cdR: 0,
    cdHeal: 0,

    magnetTargetId: null,
    magnetSlideRemain: 0,

    comboCount: 0,
    comboDecayTimer: 0,
    maxCombo: 0,
    parryCount: 0,
    totalDamage: 0,
  };
}

export interface PeerHeroState {
  rig: CharacterRig;
  name: string;
  isEnemy: boolean; // true in 1v1 Solo PvP, false in Co-op
  pos: THREE.Vector3;
  targetPos: THREE.Vector3;
  yaw: number;
  targetYaw: number;
  radius: number;
  hp: number;
  maxHp: number;
  spirit: number;
  ult: number;
  state: string;
  pose: string;
  blocking: boolean;
  dead: boolean;
  hpBarGroup: THREE.Group;
  hpFillMesh: THREE.Mesh;
}

export function createPeerHero(name: string, isEnemy: boolean): PeerHeroState {
  const rig = new CharacterRig('ally');
  const startPos = isEnemy ? new THREE.Vector3(0, 0, -6.5) : new THREE.Vector3(2.8, 0, 7.2);
  rig.root.position.copy(startPos);

  const hpBarGroup = new THREE.Group();
  hpBarGroup.position.set(0, 2.38, 0);
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(1.24, 0.13),
    new THREE.MeshBasicMaterial({ color: '#090d14', transparent: true, opacity: 0.78, side: THREE.DoubleSide }),
  );
  const hpFillGeo = new THREE.PlaneGeometry(1.18, 0.08);
  hpFillGeo.translate(0.59, 0, 0);
  const hpFillMesh = new THREE.Mesh(
    hpFillGeo,
    new THREE.MeshBasicMaterial({ color: isEnemy ? '#e84852' : '#3ee0a8', side: THREE.DoubleSide }),
  );
  hpFillMesh.position.set(-0.59, 0, 0.005);
  hpBarGroup.add(bg, hpFillMesh);
  rig.root.add(hpBarGroup);

  return {
    rig,
    name,
    isEnemy,
    pos: startPos.clone(),
    targetPos: startPos.clone(),
    yaw: isEnemy ? 0 : Math.PI,
    targetYaw: isEnemy ? 0 : Math.PI,
    radius: 0.54,
    hp: 180,
    maxHp: 180,
    spirit: 85,
    ult: 35,
    state: 'idle',
    pose: 'idle',
    blocking: false,
    dead: false,
    hpBarGroup,
    hpFillMesh,
  };
}

export function createEnemy(
  id: number,
  kind: Exclude<CharacterArchetype, 'xiaoyao' | 'ally'>,
  spawnPos: THREE.Vector3,
  rng: () => number,
): EnemyEntity {
  const rig = new CharacterRig(kind);
  rig.root.position.copy(spawnPos);

  const isBoss = kind === 'boss';
  const isElite = kind === 'elite';
  const maxHp = isBoss ? 520 : isElite ? 280 : kind === 'bladesman' ? 145 : 112;
  const maxPoise = isBoss ? 125 : isElite ? 82 : kind === 'bladesman' ? 46 : 32;
  const radius = isBoss ? 0.96 : isElite ? 0.72 : 0.58;
  const name = isBoss
    ? '九幽剑煞 · 镇狱妖王'
    : isElite
      ? '血甲剑魔 · 剑冢魔将'
      : kind === 'bladesman'
        ? '玄铁魔兵'
        : '幽冥玄道';

  // Golden counter-execution highlight ring under enemy feet
  const counterRing = new THREE.Mesh(
    new THREE.RingGeometry(radius * 1.15, radius * 1.48, 28),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.4, 1.85, 0.45),
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  counterRing.rotation.x = -Math.PI / 2;
  counterRing.position.y = 0.06;
  counterRing.visible = false;
  rig.root.add(counterRing);

  // Subtle world-space miniature HP bar above non-Boss enemies
  const hpBarGroup = new THREE.Group();
  hpBarGroup.position.set(0, isBoss ? 4.8 : isElite ? 2.9 : 2.35, 0);
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(1.16, 0.12),
    new THREE.MeshBasicMaterial({ color: '#0b0e14', transparent: true, opacity: 0.72, side: THREE.DoubleSide }),
  );
  const hpFillGeo = new THREE.PlaneGeometry(1.1, 0.075);
  hpFillGeo.translate(0.55, 0, 0);
  const hpFillMesh = new THREE.Mesh(
    hpFillGeo,
    new THREE.MeshBasicMaterial({ color: '#df4548', side: THREE.DoubleSide }),
  );
  hpFillMesh.position.set(-0.55, 0, 0.005);
  hpBarGroup.add(bg, hpFillMesh);
  hpBarGroup.visible = !isBoss && !isElite;
  rig.root.add(hpBarGroup);

  return {
    id,
    kind,
    name,
    rig,
    pos: spawnPos.clone(),
    vel: new THREE.Vector3(),
    yaw: 0,
    radius,
    hp: maxHp,
    maxHp,
    poise: 0,
    maxPoise,
    phase: 1,

    aiState: isBoss ? 'intro' : 'orbit',
    stateTime: 0,
    stateDuration: isBoss ? 2.4 : 0,
    moveKind: 'cleave',
    moveHasHit: false,
    moveRange: isBoss ? 3.8 : isElite ? 3.0 : 2.4,
    moveDamage: isBoss ? 26 : isElite ? 21 : 16,
    moveUnblockable: false,
    comboFollowup: false,

    orbitDir: rng() > 0.5 ? 1 : -1,
    attackCooldown: isBoss ? 1.2 : 0.9 + rng() * 1.1,
    hitstopTimer: 0,
    shakeTimer: 0,
    deathTimer: 0,

    telegraph: null,
    telegraphPos: new THREE.Vector3(),
    counterRing,
    hpBarGroup,
    hpFillMesh,
  };
}

/** Builds a sculpted forged-steel 3D Flying Spirit Sword projectile for Li Xiaoyao's 御剑术 [Q]. */
export function buildFlyingSwordMesh(accentColor = new THREE.Color(0.45, 2.05, 2.25)): THREE.Group {
  const g = new THREE.Group();
  const steelMat = new THREE.MeshStandardMaterial({
    color: '#d8ecf6',
    emissive: accentColor.clone().multiplyScalar(0.32),
    emissiveIntensity: 0.72,
    roughness: 0.22,
    metalness: 0.92,
  });
  const runeMat = new THREE.MeshBasicMaterial({ color: accentColor });
  const bronzeMat = new THREE.MeshStandardMaterial({
    color: '#c9a050',
    emissive: new THREE.Color('#6b4814'),
    emissiveIntensity: 0.45,
    roughness: 0.3,
    metalness: 0.88,
  });

  // Diamond beveled Damascus blade pointing +Z
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.056, 1.48, 4), steelMat);
  blade.scale.set(1.0, 1.0, 0.34);
  blade.rotation.set(Math.PI / 2, Math.PI / 4, 0);
  blade.position.z = 0.48;

  const fuller = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.016, 1.32, 4), runeMat);
  fuller.scale.set(1.0, 1.0, 0.65);
  fuller.rotation.set(Math.PI / 2, Math.PI / 4, 0);
  fuller.position.z = 0.46;

  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.032, 0.44, 6), bronzeMat);
  guard.rotation.z = Math.PI / 2;
  guard.position.z = -0.25;

  const guardJewel = new THREE.Mesh(new THREE.OctahedronGeometry(0.048, 0), runeMat);
  guardJewel.position.z = -0.25;

  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.3, 6), bronzeMat);
  hilt.rotation.x = Math.PI / 2;
  hilt.position.z = -0.42;

  const aura = new THREE.Mesh(
    new THREE.ConeGeometry(0.24, 2.2, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  aura.rotation.x = -Math.PI / 2;
  aura.position.z = -0.58;
  g.add(blade, fuller, guard, guardJewel, hilt, aura);
  return g;
}

/** Builds a high-sim dark rune-ring Yin Spirit Orb projectile that Li Xiaoyao can slash & deflect back! */
export function buildYinOrbMesh(bossColor = false): THREE.Group {
  const g = new THREE.Group();
  const coreCol = bossColor ? new THREE.Color(2.2, 0.38, 0.58) : new THREE.Color(1.35, 0.45, 2.15);
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.2, 1),
    new THREE.MeshStandardMaterial({
      color: '#1b0d24',
      emissive: coreCol,
      emissiveIntensity: 1.1,
      roughness: 0.25,
      metalness: 0.7,
    }),
  );
  const runeRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.32, 0.022, 6, 18),
    new THREE.MeshStandardMaterial({
      color: '#9c7e4c',
      emissive: coreCol,
      emissiveIntensity: 0.55,
      roughness: 0.35,
      metalness: 0.85,
    }),
  );
  runeRing.rotation.x = Math.PI / 3;
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 12, 10),
    new THREE.MeshBasicMaterial({
      color: coreCol,
      transparent: true,
      opacity: 0.26,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  g.add(core, runeRing, shell);
  return g;
}

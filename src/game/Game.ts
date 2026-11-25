import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as THREE from 'three';
import { GameInput } from '../core/Input';
import { RenderPipeline } from '../core/RenderPipeline';
import { ShushanArena } from '../world/ShushanArena';
import { VfxSystem } from '../vfx/VfxSystem';
import { AudioEngine } from '../systems/AudioEngine';
import { CameraRig } from '../systems/CameraRig';
import { HudController, type ScreenMode } from '../ui/HudController';
import {
  buildFlyingSwordMesh,
  buildYinOrbMesh,
  createEnemy,
  createHero,
  createPeerHero,
  type EnemyCreateOverrides,
  type EnemyEntity,
  type HeroState,
  type PeerHeroState,
  type ProjectileEntity,
} from './CombatEntities';
import {
  BLESSINGS,
  CampaignSaveStore,
  applyBlessingToRun,
  createEmptyBlessings,
  evaluateStageStars,
  getChapterDef,
  getStageDef,
  getSwordRealm,
  pickBlessingChoices,
  type BlessingDef,
  type RunBlessingState,
  type StageHazardType,
} from './CampaignData';
import { MultiplayerClient, type EnemyNetSnapshot, type PeerTransformPacket } from '../net/MultiplayerClient';
import { isNativeAndroidApp, triggerHaptic } from '../core/NativeBridge';
import { angleDiff, clamp, dampAngle } from '../utils/math';
import { createSeededRandom } from '../utils/random';
import type { PoseName } from '../entities/CharacterRig';

export class Game {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.2, 240);
  private readonly pipeline: RenderPipeline;
  private readonly input: GameInput;
  private readonly audio: AudioEngine;
  private readonly cameraRig: CameraRig;
  private readonly hud: HudController;
  private readonly arena: ShushanArena;
  private readonly vfx = new VfxSystem();

  private rng = createSeededRandom(42);
  private hero: HeroState;
  private peerHero: PeerHeroState | null = null;
  private readonly mp: MultiplayerClient;
  private mpStateAccum = 0;
  private mpEnemyAccum = 0;
  private reviveAccum = 0;
  private enemies: EnemyEntity[] = [];
  private projectiles: ProjectileEntity[] = [];
  private nextEntityId = 1;

  private mode: ScreenMode = 'title';
  private stage: 'combat' | 'waveTransition' | 'soloPvp' | 'done' = 'combat';
  private currentStageNum = 1;
  private currentWaveIdx = 0;
  private stageTimer = 0;
  private readonly saveStore = new CampaignSaveStore();
  private blessings: RunBlessingState = createEmptyBlessings();
  private pendingBlessings: BlessingDef[] = [];
  private hazardTimer = 4.2;
  private activeHazards: Array<{
    pos: THREE.Vector3;
    radius: number;
    damage: number;
    timer: number;
    duration: number;
    telegraph: ReturnType<VfxSystem['createTelegraph']>;
    type: StageHazardType;
  }> = [];

  private frame = 0;
  private elapsed = 0;
  private runElapsed = 0;
  private timeScale = 1.0;
  private slowMoTimer = 0;
  private godMode = false;
  private pausedForScreenshot = false;
  private reducedMotion = false;

  private rafId = 0;
  private lastNow = 0;
  private disposed = false;

  // Reusable math scratch vectors
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly aimPoint = new THREE.Vector3();
  private clickMoveTarget: THREE.Vector3 | null = null;
  private rmbRippleCooldown = 0;
  private readonly cursorReticle: THREE.Mesh;
  private readonly moveVec = { x: 0, z: 0 };
  private readonly tmpVec = new THREE.Vector3();
  private readonly tmpVec2 = new THREE.Vector3();

  constructor(private readonly canvas: HTMLCanvasElement) {
    const params = new URLSearchParams(window.location.search);
    const startMuted = params.has('mute') || params.has('auto');
    this.godMode = params.has('god');

    this.pipeline = new RenderPipeline(canvas, this.scene, this.camera);
    if (isNativeAndroidApp() || window.matchMedia('(pointer: coarse)').matches) {
      this.pipeline.setMaxDpr(1.38);
    }
    this.input = new GameInput(canvas);
    this.audio = new AudioEngine(startMuted);
    this.cameraRig = new CameraRig(this.camera);

    // Lighting & Moonlit Shushan Atmosphere
    this.setupLighting();

    // Arena, VFX & Hero
    this.arena = new ShushanArena(this.rng);
    this.scene.add(this.arena.group);
    this.scene.add(this.vfx.group);

    this.hero = createHero();
    this.hero.rig.root.position.copy(this.hero.pos);
    this.hero.rig.root.rotation.y = this.hero.yaw;
    this.scene.add(this.hero.rig.root);

    // Subtle League-of-Legends style translucent jade-gold ground cursor aim reticle (desktop only)
    this.cursorReticle = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.42, 24),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.45, 2.05, 1.65),
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.cursorReticle.rotation.x = -Math.PI / 2;
    this.cursorReticle.position.y = 0.055;
    this.cursorReticle.visible = false;
    this.scene.add(this.cursorReticle);

    this.mp = new MultiplayerClient({
      onStatus: (text, connected) => {
        this.hud.setMpLobbyStatus(text, connected, Boolean(this.mp.roomCode));
      },
      onRoomCreated: (code, mode, stage, quickMatch) => {
        const label = mode === 'solo' ? '1v1 单挑' : `双人组队·第${stage}关`;
        this.hud.setMpLobbyStatus(
          quickMatch
            ? `快速匹配建房 ${code}（${label}）· 等待另一位侠客加入...`
            : `房间码 ${code}（${label}）· 把房间码发给好友即可开战`,
          true,
          true,
        );
      },
      onRoomReady: (info) => {
        this.startMpMatch(info);
      },
      onPeerState: (pkt) => {
        this.applyPeerState(pkt);
      },
      onPeerAction: (pkt) => {
        this.replayPeerAction(pkt);
      },
      onEnemySync: (snaps, stageNum) => {
        this.applyEnemySnapshotsFromHost(snaps, stageNum);
      },
      onEnemyHitFromGuest: (pkt) => {
        if (this.mp.role !== 'host') return;
        const target = this.enemies.find((e) => e.id === pkt.enemyId && e.aiState !== 'dead');
        if (!target) return;
        const attackYaw = this.peerHero
          ? Math.atan2(target.pos.x - this.peerHero.pos.x, target.pos.z - this.peerHero.pos.z)
          : 0;
        this.damageEnemy(target, pkt.damage, pkt.heavy, attackYaw, pkt.poise, pkt.heavy, true);
      },
      onPvpHit: (pkt) => {
        this.handleIncomingPvpHit(pkt);
      },
      onStageSync: (stageNum, bossIntro) => {
        if (this.mp.role === 'guest') {
          this.currentStageNum = clamp(Math.floor(stageNum), 1, 20);
          const stDef = getStageDef(this.currentStageNum);
          const chDef = getChapterDef(stDef.chapter);
          this.applyChapterAtmosphere(this.currentStageNum);
          this.stage = 'combat';
          if (stDef.isBossStage || bossIntro) {
            this.audio.setMood('boss1');
          }
          this.hud.showStageBanner(`${chDef.roman} · 第 ${stDef.id} 关`, `${stDef.name} · ${stDef.subtitle}`);
          if (bossIntro) this.hud.showSubtitle(stDef.introLine, 3.2);
        }
      },
      onPeerRevive: () => {
        if (this.hero.state === 'dead' && this.mp.mode === 'coop') {
          this.hero.hp = Math.round(this.hero.maxHp * 0.6);
          this.hero.state = 'idle';
          this.hero.hurtInvuln = 1.6;
          this.vfx.spawnHealVortex(this.hero.pos);
          this.spawnWorldCallout('同伴相援·重振剑势!', this.hero.pos, 'heal');
        }
      },
      onRematch: () => {
        if (this.mp.isOnline() && this.mp.peerConnected) {
          this.restartActiveMpMatch();
        }
      },
      onPeerLeft: (reason) => {
        this.hud.setMpHudBadge('');
        this.hud.showSubtitle(reason, 3.2);
        this.removePeerHero();
        if (this.stage === 'soloPvp' && this.mode === 'playing') {
          this.mode = 'victory';
          this.hud.setMode('victory');
          this.hud.showResult(true, this.runElapsed, this.hero, { customTitle: '不 战 而 胜', customSub: reason });
        }
      },
      onError: (msg) => {
        this.hud.setMpLobbyStatus(msg, false, Boolean(this.mp.roomCode));
      },
    });

    this.hud = new HudController({
      onStart: (stageId) => {
        this.mp.leave();
        this.removePeerHero();
        this.hud.setMpHudBadge('');
        this.startNewRun(stageId, false);
      },
      onNextStage: (nextStageId, selectedBlessingId) => {
        if (selectedBlessingId) {
          const b = BLESSINGS.find((x) => x.id === selectedBlessingId);
          if (b) this.blessings = applyBlessingToRun(this.blessings, b);
        }
        if (this.mp.isOnline() && this.mp.peerConnected && this.mp.mode === 'coop') {
          this.currentStageNum = clamp(nextStageId, 1, 20);
          this.restartActiveMpMatch();
        } else {
          this.startNewRun(nextStageId, true);
        }
      },
      onRetry: () => {
        if (this.mp.isOnline() && this.mp.peerConnected) {
          this.mp.sendRematch();
          this.restartActiveMpMatch();
        } else {
          this.startNewRun(this.currentStageNum, this.blessings.ids.length > 0);
        }
      },
      onBackToTitle: () => {
        this.mp.leave();
        this.removePeerHero();
        this.hud.setMpHudBadge('');
        this.hud.setMpLobbyStatus('', false);
        this.enterTitleMode();
      },
      onToggleMute: () => {
        const next = !this.audio.isMuted();
        this.audio.setMuted(next);
        if (!next) this.audio.unlock();
        return next;
      },
      onTogglePause: () => this.togglePause(),
      onToggleLolMode: () => {
        const next = !this.input.lolMouseMode;
        this.input.setLolMouseMode(next);
        this.clickMoveTarget = null;
        this.hud.showSubtitle(
          next ? '已切换【联盟鼠标模式】：右键点地/按住移动，左键/QER 指哪打哪，K/中键弹反' : '已切换【经典键鼠模式】：WASD 移动，右键格挡弹反',
          2.6,
        );
        return next;
      },
      onMpCreate: (mode, stage) => {
        this.mp.createRoom(mode, stage, '李逍遥').catch(() => {});
      },
      onMpJoin: (code) => {
        this.mp.joinRoom(code, '玄影剑侠').catch(() => {});
      },
      onMpQuick: (mode, stage) => {
        this.mp.quickMatch(mode, stage, '蜀山侠客').catch(() => {});
      },
      onMpLeave: () => {
        this.mp.leave();
        this.removePeerHero();
        this.hud.setMpLobbyStatus('', false);
        this.hud.setMpHudBadge('');
      },
    });

    window.addEventListener('keydown', this.onGlobalKey);
    canvas.addEventListener('webglcontextlost', this.onContextLost);

    this.hud.syncCampaignProgress(this.saveStore, this.saveStore.getRecommendedStage());
    this.installTestHooks();

    const stageParam = Number(params.get('stage') || '0');
    if (params.get('show') === 'char') {
      this.enterShowcaseMode();
    } else if (params.has('boss')) {
      this.startNewRun(20, false);
    } else if (stageParam >= 1 && stageParam <= 20) {
      this.startNewRun(stageParam, false);
    } else if (params.has('auto')) {
      this.startNewRun(1, false);
    } else {
      this.enterTitleMode();
      if (params.has('map')) {
        this.hud.openCampaignMap();
      }
    }

    this.publishDiagnostics();
  }

  private setupLighting(): void {
    this.scene.background = new THREE.Color('#0c1522');
    this.scene.fog = new THREE.FogExp2('#101d2c', 0.0138);

    // Cinematic live-action 3-point lighting: cool moon key + warm Rembrandt lantern fill + back rim separation
    const hemi = new THREE.HemisphereLight('#84a4c4', '#1d191d', 0.92);
    this.scene.add(hemi);

    const moonKey = new THREE.DirectionalLight('#d6e4f5', 2.55);
    moonKey.position.set(-14, 22, -16);
    moonKey.castShadow = true;
    moonKey.shadow.mapSize.set(2048, 2048);
    moonKey.shadow.camera.near = 2;
    moonKey.shadow.camera.far = 68;
    const sc = 22;
    moonKey.shadow.camera.left = -sc;
    moonKey.shadow.camera.right = sc;
    moonKey.shadow.camera.top = sc;
    moonKey.shadow.camera.bottom = -sc;
    moonKey.shadow.bias = -0.00035;
    moonKey.shadow.normalBias = 0.028;
    this.scene.add(moonKey);

    // PMREM studio-moonlight IBL environment so Damascus steel, bronze & wet corneal eyes catch crisp reflections
    const pmrem = new THREE.PMREMGenerator(this.pipeline.renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = envTex;
    this.scene.environmentIntensity = 0.58;
    pmrem.dispose();

    // Warm Rembrandt lantern front-side key (sculpts real human cheekbones, nose bridge, brow shadows & silk folds!)
    const warmFill = new THREE.DirectionalLight('#ffc084', 1.38);
    warmFill.position.set(10, 9, 14);
    this.scene.add(warmFill);

    // Subtle cool silver-blue rear rim light to separate dark hair strands, silk brocade & iron armor from night mist
    const backRim = new THREE.DirectionalLight('#8ab4e6', 0.96);
    backRim.position.set(4, 11, -16);
    this.scene.add(backRim);
  }

  start(): void {
    this.lastNow = performance.now();
    const tick = (now: number) => {
      if (this.disposed) return;
      this.rafId = requestAnimationFrame(tick);
      if (document.hidden) {
        this.lastNow = now;
        return;
      }
      const rawDt = Math.min(0.05, Math.max(0.001, (now - this.lastNow) / 1000));
      this.lastNow = now;
      this.stepFrame(rawDt, true);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('keydown', this.onGlobalKey);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.mp.dispose();
    this.input.dispose();
    this.audio.dispose();
    this.pipeline.dispose();
    window.__THREE_GAME_DIAGNOSTICS__ = undefined;
    window.__THREE_GAME_TEST_HOOKS__ = undefined;
    window.G = undefined;
  }

  private onGlobalKey = (e: KeyboardEvent): void => {
    if (e.code === 'Escape' && (this.mode === 'playing' || this.mode === 'paused')) {
      e.preventDefault();
      this.togglePause();
    }
  };

  private onContextLost = (e: Event): void => {
    e.preventDefault();
  };

  private togglePause(): void {
    if (this.mode === 'playing') {
      this.mode = 'paused';
      this.hud.setMode('paused');
    } else if (this.mode === 'paused') {
      this.mode = 'playing';
      this.hud.setMode('playing');
    }
  }

  private enterTitleMode(): void {
    this.clearCombatEntities();
    this.applyChapterAtmosphere(1);
    this.resetHero(new THREE.Vector3(0, 0, 2.2), Math.PI);
    this.hero.rig.setWeaponDrawn(false);
    this.mode = 'title';
    this.stage = 'combat';
    this.hud.setMode('title');
    this.hud.syncCampaignProgress(this.saveStore, this.saveStore.getRecommendedStage());
    this.audio.setMood('title');
    this.cameraRig.updateTitleOrbit(this.hero.pos, this.elapsed);
  }

  private enterShowcaseMode(): void {
    this.clearCombatEntities();
    // Photorealistic full cast showcase: widened spacing & calm low-blade stance so ZERO weapons occlude faces!
    this.resetHero(new THREE.Vector3(-1.95, 0, 0.72), 0.14);
    this.hero.rig.setWeaponDrawn(true);
    this.hero.rig.applyPose('idle', 0, 0, 0.016, 0);

    const demoVanguard = this.spawnEnemy('bladesman', -0.68, 0.36);
    demoVanguard.yaw = 0.06;
    demoVanguard.rig.root.rotation.y = 0.06;
    demoVanguard.hpBarGroup.visible = false;
    demoVanguard.aiState = 'orbit';
    demoVanguard.rig.applyPose('idle', 0, 0, 0.016, 0);

    const demoElite = this.spawnEnemy('elite', 0.68, 0.14);
    demoElite.yaw = -0.08;
    demoElite.rig.root.rotation.y = -0.08;
    demoElite.hpBarGroup.visible = false;
    demoElite.aiState = 'orbit';
    demoElite.rig.applyPose('idle', 0, 0, 0.016, 0);

    const demoBoss = this.spawnEnemy('boss', 2.1, -0.35);
    demoBoss.yaw = -0.22;
    demoBoss.rig.root.rotation.y = -0.22;
    demoBoss.hpBarGroup.visible = false;
    demoBoss.aiState = 'orbit';
    demoBoss.rig.applyPose('idle', 0, 0, 0.016, 0);

    this.mode = 'showcase';
    this.hud.setMode('showcase');
    this.cameraRig.updateShowcase(new THREE.Vector3(0.08, 0, 0.25), 0);
  }

  private applyChapterAtmosphere(stageNum: number): void {
    const st = getStageDef(stageNum);
    const ch = getChapterDef(st.chapter);
    this.scene.background = new THREE.Color(ch.bgHex);
    this.scene.fog = new THREE.FogExp2(ch.fogHex, st.chapter >= 3 ? 0.0148 : 0.0136);
    this.arena.setStageTheme(stageNum, ch);
  }

  private getHeroDamageMult(): number {
    const realm = getSwordRealm(this.saveStore.getTotalStars());
    return realm.dmgMult * this.blessings.dmgMult;
  }

  private startNewRun(stageOrBoss: number | boolean = 1, keepBlessings = false): void {
    const startStage =
      typeof stageOrBoss === 'boolean'
        ? stageOrBoss
          ? 20
          : 1
        : clamp(Math.floor(stageOrBoss), 1, 20);
    if (!keepBlessings) {
      this.blessings = createEmptyBlessings();
    }
    this.currentStageNum = startStage;
    this.currentWaveIdx = 0;
    this.saveStore.setLastPlayed(startStage);
    this.audio.unlock();
    this.clearCombatEntities();
    this.resetHero(new THREE.Vector3(0, 0, 8.8), Math.PI);
    this.hero.rig.setWeaponDrawn(true);
    this.hud.setHeroName(this.mp.isOnline() && this.mp.role === 'guest' ? '玄影剑侠' : '李逍遥');
    this.runElapsed = 0;
    this.timeScale = 1;
    this.slowMoTimer = 0;

    const stDef = getStageDef(startStage);
    const chDef = getChapterDef(stDef.chapter);
    this.applyChapterAtmosphere(startStage);
    this.hazardTimer = (stDef.hazardIntervalSec ?? 5.5) * 0.72;

    this.mode = 'playing';
    this.stage = 'combat';
    this.hud.setMode('playing');
    this.audio.setMood(stDef.isBossStage ? 'boss1' : 'skirmish');
    this.spawnCurrentWave(false);
    this.cameraRig.snapTo(this.hero.pos);
    this.hud.showStageBanner(`${chDef.roman} · 第 ${stDef.id} 关`, `${stDef.name} · ${stDef.subtitle}`);
    this.hud.showSubtitle(stDef.introLine, 3.4);
    this.hud.update(this.hero, this.getObjectiveLabel(), this.getActiveBoss(), this.peerHero);
  }

  private resetHero(pos: THREE.Vector3, yaw: number): void {
    const h = this.hero;
    const realm = getSwordRealm(this.saveStore.getTotalStars());
    h.maxHp = 180 + realm.hpBonus + this.blessings.maxHpBonus;
    h.maxGourds = 3 + this.blessings.extraGourds;
    this.hud.setRealmAndBlessings(realm.title, this.blessings.ids.length);

    h.pos.copy(pos);
    h.vel.set(0, 0, 0);
    h.yaw = yaw;
    h.hp = h.maxHp;
    h.delayedHp = h.maxHp;
    h.spirit = 85;
    h.stamina = h.maxStamina;
    h.ult = 35;
    h.gourds = h.maxGourds;
    h.state = 'idle';
    h.stateTime = 0;
    h.stateDuration = 0;
    h.comboStep = 0;
    h.comboWindowTimer = 0;
    h.attackHasHit.clear();
    h.attackVfxFired = false;
    h.blockElapsed = 0;
    h.dodgeInvuln = 0;
    h.hurtInvuln = 0;
    h.hitstopTimer = 0;
    h.combatIdleTimer = 0;
    h.counterTargetId = null;
    h.counterWindowTimer = 0;
    h.cdQ = 0;
    h.cdE = 0;
    h.cdR = 0;
    h.cdHeal = 0;
    h.magnetTargetId = null;
    h.magnetSlideRemain = 0;
    h.comboCount = 0;
    h.comboDecayTimer = 0;
    h.maxCombo = 0;
    h.parryCount = 0;
    h.totalDamage = 0;
    h.rig.root.position.copy(pos);
    h.rig.root.rotation.y = yaw;
    h.rig.applyPose('combatIdle', 0, 0, 0.016, 0);
  }

  private clearCombatEntities(): void {
    for (const e of this.enemies) {
      e.telegraph?.dispose();
      this.scene.remove(e.rig.root);
    }
    this.enemies = [];
    for (const p of this.projectiles) {
      this.scene.remove(p.mesh);
    }
    this.projectiles = [];
    for (const hz of this.activeHazards) {
      hz.telegraph.dispose();
    }
    this.activeHazards = [];
    this.vfx.clearAll();
  }

  private spawnEnemy(
    kind: 'bladesman' | 'caster' | 'elite' | 'boss',
    x: number,
    z: number,
    forceId?: number,
    overrides?: EnemyCreateOverrides,
  ): EnemyEntity {
    const pos = new THREE.Vector3(x, 0, z);
    this.arena.constrainPosition(pos, kind === 'boss' ? 1.0 : kind === 'elite' ? 0.74 : 0.6);
    const id = forceId ?? this.nextEntityId++;
    if (forceId !== undefined && forceId >= this.nextEntityId) this.nextEntityId = forceId + 1;
    const enemy = createEnemy(id, kind, pos, this.rng, overrides);
    enemy.yaw = Math.atan2(this.hero.pos.x - pos.x, this.hero.pos.z - pos.z);
    enemy.rig.root.rotation.y = enemy.yaw;
    this.scene.add(enemy.rig.root);
    this.enemies.push(enemy);
    return enemy;
  }

  private spawnCurrentWave(allowCutscene: boolean): void {
    const stDef = getStageDef(this.currentStageNum);
    const waveDef = stDef.waves[clamp(this.currentWaveIdx, 0, stDef.waves.length - 1)];
    this.stage = 'combat';

    let spawnedBoss: EnemyEntity | null = null;
    for (const spec of waveDef.enemies) {
      const e = this.spawnEnemy(spec.kind, spec.x, spec.z, undefined, {
        name: spec.name,
        hpMult: spec.hpMult,
        poiseMult: spec.poiseMult,
        dmgMult: spec.dmgMult,
        speedMult: spec.speedMult,
        scaleMult: spec.scaleMult,
        affix: spec.affix,
      });
      if (spec.kind === 'boss') {
        spawnedBoss = e;
      }
    }

    // Dramatic summon VFX when elites/bosses or wave reinforcements arrive
    const hasHeavy = waveDef.enemies.some((s) => s.kind === 'boss' || s.kind === 'elite');
    if (hasHeavy || this.currentWaveIdx > 0) {
      const focusPos = spawnedBoss?.pos ?? new THREE.Vector3(0, 0, -5.0);
      const col = spawnedBoss ? new THREE.Color(1.85, 0.28, 0.45) : new THREE.Color(1.4, 0.48, 1.9);
      this.vfx.spawnBaguaArray({
        pos: new THREE.Vector3(focusPos.x, 0.08, focusPos.z),
        radius: spawnedBoss ? 5.6 : 4.6,
        color: col,
        duration: 2.2,
      });
      this.vfx.spawnShockRing(new THREE.Vector3(focusPos.x, 0.1, focusPos.z), col, 0.5, spawnedBoss ? 8.2 : 6.2, 0.65);
      if (spawnedBoss) this.cameraRig.addShake(0.6);
    }

    if (spawnedBoss) {
      this.audio.setMood('boss1');
      if (allowCutscene && stDef.bossCutscene && !this.mp.isOnline()) {
        if (this.hero.pos.z < 4.5) {
          this.hero.pos.set(0, 0, 8.2);
          this.hero.rig.root.position.copy(this.hero.pos);
        }
        this.hero.yaw = Math.PI;
        this.hero.rig.root.rotation.y = this.hero.yaw;
        this.mode = 'cutscene';
        this.hud.setMode('cutscene');
        this.audio.setDucked(true);
        this.cameraRig.startCutscene(spawnedBoss.pos, 2.35);
        this.hud.showSubtitle(waveDef.subtitle ?? stDef.introLine, 3.0);
      } else {
        spawnedBoss.aiState = 'orbit';
        spawnedBoss.stateTime = 0;
        if (waveDef.subtitle) this.hud.showSubtitle(waveDef.subtitle, 2.8);
      }
    } else if (waveDef.subtitle) {
      this.hud.showSubtitle(waveDef.subtitle, 2.8);
    }

    if (this.mp.isOnline() && this.mp.role === 'host') {
      this.mp.sendStageSync(this.currentStageNum, Boolean(spawnedBoss));
    }
  }

  private updateStageHazards(dt: number): void {
    const stDef = getStageDef(this.currentStageNum);
    // Tick active telegraphed ground hazards
    for (let i = this.activeHazards.length - 1; i >= 0; i--) {
      const hz = this.activeHazards[i];
      hz.timer += dt;
      const p = clamp(hz.timer / hz.duration, 0, 1);
      hz.telegraph.updateProgress(p);
      if (p >= 1) {
        hz.telegraph.dispose();
        this.activeHazards.splice(i, 1);
        const col =
          hz.type === 'lightning'
            ? new THREE.Color(1.45, 0.65, 2.4)
            : hz.type === 'ember'
              ? new THREE.Color(2.4, 0.72, 0.25)
              : new THREE.Color(2.4, 0.28, 0.55);
        this.vfx.spawnShockRing(hz.pos, col, 0.3, hz.radius, 0.42);
        this.vfx.spawnGroundCrater(hz.pos, hz.radius * 0.72, col, 3.0);
        if (hz.type === 'abyss') {
          this.vfx.spawnFallingSword({ targetPos: hz.pos.clone(), delay: 0.02 });
        }
        this.audio.playHit(true);
        this.cameraRig.addShake(0.28);
        if (Math.hypot(this.hero.pos.x - hz.pos.x, this.hero.pos.z - hz.pos.z) <= hz.radius) {
          this.tryHitHero(null, hz.damage, true);
        }
      }
    }

    if (stDef.hazard === 'none' || this.stage !== 'combat') return;
    if (!this.enemies.some((e) => e.aiState !== 'dead')) return;
    if (this.mp.isOnline() && this.mp.role === 'guest') return;

    this.hazardTimer -= dt;
    if (this.hazardTimer <= 0) {
      this.hazardTimer = (stDef.hazardIntervalSec ?? 5.2) * (0.85 + this.rng() * 0.3);
      const count = stDef.chapter >= 4 ? 2 : 1;
      const col =
        stDef.hazard === 'lightning'
          ? new THREE.Color(1.35, 0.55, 2.35)
          : stDef.hazard === 'ember'
            ? new THREE.Color(2.35, 0.68, 0.22)
            : new THREE.Color(2.35, 0.25, 0.52);
      for (let k = 0; k < count; k++) {
        const offsetAng = this.rng() * Math.PI * 2;
        const offsetR = k === 0 ? this.rng() * 1.1 : 2.6 + this.rng() * 2.4;
        const pos = new THREE.Vector3(
          this.hero.pos.x + Math.cos(offsetAng) * offsetR,
          0,
          this.hero.pos.z + Math.sin(offsetAng) * offsetR,
        );
        this.arena.constrainPosition(pos, 1.4);
        const radius = stDef.hazard === 'abyss' ? 2.85 : 2.55;
        const telegraph = this.vfx.createTelegraph('circle', pos, 0, radius, radius, col);
        this.activeHazards.push({
          pos,
          radius,
          damage: stDef.hazardDamage ?? 24,
          timer: 0,
          duration: 1.38,
          telegraph,
          type: stDef.hazard,
        });
      }
    }
  }

  private getActiveBoss(): EnemyEntity | null {
    return (
      this.enemies.find((e) => e.kind === 'boss' && e.aiState !== 'dead') ??
      this.enemies.find((e) => e.kind === 'elite' && e.aiState !== 'dead') ??
      this.enemies.find((e) => e.kind === 'boss') ??
      null
    );
  }

  private getObjectiveLabel(): string {
    if (this.stage === 'soloPvp') {
      return `1v1 联机单挑 · 房${this.mp.roomCode}`;
    }
    const stDef = getStageDef(this.currentStageNum);
    const alive = this.enemies.filter((e) => e.aiState !== 'dead').length;
    const waveStr = stDef.waves.length > 1 ? ` · 第${this.currentWaveIdx + 1}/${stDef.waves.length}波` : '';
    const hzStr = stDef.hazardLabel ? ` · ${stDef.hazardLabel}` : '';
    if (this.stage === 'waveTransition') {
      return `第 ${stDef.id} 关 ${stDef.name} · 下一波援军即将现身`;
    }
    if (this.stage === 'done') {
      return `第 ${stDef.id} 关 ${stDef.name} · 剑台已定`;
    }
    return `第 ${stDef.id} 关 ${stDef.name}${waveStr} · 剩余 ${alive}${hzStr}`;
  }

  /**
   * Core simulation tick. Can be driven both by requestAnimationFrame AND deterministically by G.step(n, dt)!
   */
  stepFrame(rawDt: number, doRender = true): void {
    this.frame += 1;
    this.pipeline.tickAdaptiveDpr(rawDt, this.mode === 'playing' && !this.pausedForScreenshot);
    this.pipeline.resize(false);

    if (this.pausedForScreenshot) {
      if (doRender) this.pipeline.render();
      this.publishDiagnostics();
      return;
    }

    const animDt = this.reducedMotion ? 0 : rawDt;
    this.elapsed += animDt;

    if (this.mode === 'title') {
      this.hero.rig.applyPose('idle', 0, this.elapsed, animDt, 0);
      this.arena.update(animDt, this.elapsed, this.hero.pos);
      this.cameraRig.updateTitleOrbit(this.hero.pos, this.elapsed);
      this.audio.updateMusic(rawDt);
      if (doRender) this.pipeline.render();
      this.input.endFrame();
      this.publishDiagnostics();
      return;
    }

    if (this.mode === 'showcase') {
      this.hero.rig.applyPose('idle', 0, this.elapsed, animDt, 0);
      for (const e of this.enemies) e.rig.applyPose('idle', 0, this.elapsed, animDt, 0);
      this.arena.update(animDt, this.elapsed, this.hero.pos);
      this.cameraRig.updateShowcase(new THREE.Vector3(0.08, 0, 0.25), this.elapsed);
      if (doRender) this.pipeline.render();
      this.input.endFrame();
      this.publishDiagnostics();
      return;
    }

    if (this.mode === 'paused') {
      if (doRender) this.pipeline.render();
      this.input.endFrame();
      return;
    }

    // Slow-motion scaling for perfect dodge / counter execution
    if (this.slowMoTimer > 0) {
      this.slowMoTimer -= rawDt;
      if (this.slowMoTimer <= 0) this.timeScale = 1.0;
    }
    const dt = rawDt * this.timeScale;

    this.input.tickBuffer(rawDt);
    this.hud.tickSubtitle(rawDt);
    this.audio.updateMusic(rawDt);

    if (this.mode === 'cutscene') {
      const boss = this.getActiveBoss();
      if (boss && boss.aiState === 'intro') {
        boss.stateTime += dt;
        const p = clamp(boss.stateTime / boss.stateDuration, 0, 1);
        boss.rig.applyPose('bossIntro', p, this.elapsed, dt, 0);
      }
      this.hero.rig.applyPose('combatIdle', 0, this.elapsed, dt, 0);
      this.arena.update(dt, this.elapsed, this.hero.pos);
      this.vfx.update(dt, this.elapsed, this.hero.pos);
      this.cameraRig.updateGameplay(rawDt, this.elapsed, this.hero.pos, boss?.pos ?? null, this.input.mouseNdc);

      if (!this.cameraRig.isCutsceneActive()) {
        if (boss) {
          boss.aiState = 'orbit';
          boss.stateTime = 0;
        }
        this.mode = 'playing';
        this.hud.setMode('playing');
        this.audio.setDucked(false);
      }
    } else if (this.mode === 'playing') {
      this.runElapsed += dt;
      this.updateHero(dt);
      this.updatePeerHero(dt);
      if (this.stage !== 'soloPvp') {
        if (!this.mp.isOnline() || this.mp.role === 'host') {
          this.updateEnemies(dt);
        } else {
          this.updateGuestEnemiesVisual(dt);
        }
      }
      this.updateProjectiles(dt);
      this.updateStageHazards(dt);
      this.resolveEntitySeparation();
      this.updateStageProgression(dt);
      this.tickMultiplayerSync(dt);
      this.vfx.update(
        dt,
        this.elapsed,
        this.hero.pos,
        (kind) => this.onCollectDrop(kind),
        (kind) => this.audio.playDropChime(kind),
      );
      this.arena.update(dt, this.elapsed, this.hero.pos);
      const boss = this.getActiveBoss();
      const focusTarget =
        this.peerHero && this.peerHero.isEnemy && !this.peerHero.dead
          ? this.peerHero.pos
          : boss && boss.aiState !== 'dead'
            ? boss.pos
            : null;
      this.cameraRig.updateGameplay(
        rawDt,
        this.elapsed,
        this.hero.pos,
        focusTarget,
        this.input.mouseNdc,
      );
      this.arena.updateOcclusion(this.camera.position, this.hero.pos, rawDt);
      this.hud.update(this.hero, this.getObjectiveLabel(), boss, this.peerHero);
    } else {
      // Victory / Defeat gentle ambient drift
      this.vfx.update(dt * 0.5, this.elapsed, this.hero.pos);
      this.arena.update(dt * 0.5, this.elapsed, this.hero.pos);
      this.cameraRig.updateGameplay(rawDt, this.elapsed, this.hero.pos, null, { x: 0, y: 0 });
    }

    // Update F3 debug panel if toggled on
    const aliveCount = this.enemies.filter((e) => e.aiState !== 'dead').length;
    this.input.updateDebugPanel(
      `state: ${this.hero.state} (combo ${this.hero.comboStep})  mode: ${this.mode}\n` +
        `pos: (${this.hero.pos.x.toFixed(2)}, ${this.hero.pos.z.toFixed(2)})  r: ${Math.hypot(this.hero.pos.x, this.hero.pos.z).toFixed(2)}\n` +
        `hp: ${Math.ceil(this.hero.hp)}/${this.hero.maxHp}  sp: ${Math.floor(this.hero.spirit)}  ult: ${Math.floor(this.hero.ult)}  mobs: ${aliveCount}`,
    );

    if (doRender) this.pipeline.render();
    this.input.endFrame();
    this.publishDiagnostics();
  }

  /** Fast logic-only step for full-arena nav/collision verification (G.upd per guizang-game-skill). */
  stepLogicOnly(frames = 30, dt = 1 / 60): void {
    for (let i = 0; i < frames; i++) {
      this.stepFrame(dt, false);
    }
  }

  private updateGroundCursorWorld(): boolean {
    if (this.input.touchActive || !this.input.mouseMoved || this.mode !== 'playing') {
      this.cursorReticle.visible = false;
      return false;
    }
    this.raycaster.setFromCamera(
      new THREE.Vector2(this.input.mouseNdc.x, this.input.mouseNdc.y),
      this.camera,
    );
    if (this.raycaster.ray.intersectPlane(this.groundPlane, this.aimPoint)) {
      this.cursorReticle.position.set(this.aimPoint.x, 0.055, this.aimPoint.z);
      this.cursorReticle.rotation.z = this.elapsed * 1.4;
      this.cursorReticle.visible = this.input.lolMouseMode;
      return true;
    }
    this.cursorReticle.visible = false;
    return false;
  }

  private getAimYaw(): number {
    // Touch/mobile mode aims at nearest enemy, then stick direction, then current facing
    if (this.input.touchActive) {
      const nearest = this.findNearestEnemy(12);
      if (nearest) {
        return Math.atan2(nearest.pos.x - this.hero.pos.x, nearest.pos.z - this.hero.pos.z);
      }
      if (Math.hypot(this.input.touchMove.x, this.input.touchMove.z) > 0.12) {
        return Math.atan2(this.input.touchMove.x, this.input.touchMove.z);
      }
      return this.hero.yaw;
    }

    this.raycaster.setFromCamera(
      new THREE.Vector2(this.input.mouseNdc.x, this.input.mouseNdc.y),
      this.camera,
    );
    if (this.raycaster.ray.intersectPlane(this.groundPlane, this.aimPoint)) {
      const dx = this.aimPoint.x - this.hero.pos.x;
      const dz = this.aimPoint.z - this.hero.pos.z;
      if (dx * dx + dz * dz > 0.04) {
        return Math.atan2(dx, dz);
      }
    }
    return this.hero.yaw;
  }

  private findNearestEnemy(maxRange: number, preferredYaw?: number): EnemyEntity | null {
    let best: EnemyEntity | null = null;
    let bestScore = Infinity;
    for (const e of this.enemies) {
      if (e.aiState === 'dead') continue;
      const dx = e.pos.x - this.hero.pos.x;
      const dz = e.pos.z - this.hero.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > maxRange) continue;
      let score = dist;
      if (preferredYaw !== undefined) {
        const ang = Math.abs(angleDiff(preferredYaw, Math.atan2(dx, dz)));
        score += ang * 2.4;
      }
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  private updateHero(dt: number): void {
    const h = this.hero;

    // Delayed damage bar smooth drain
    if (h.delayedHp > h.hp) {
      h.delayedHp = Math.max(h.hp, h.delayedHp - dt * 55);
    } else {
      h.delayedHp = h.hp;
    }

    // Resource regeneration & cooldown ticks
    h.cdQ = Math.max(0, h.cdQ - dt);
    h.cdE = Math.max(0, h.cdE - dt);
    h.cdR = Math.max(0, h.cdR - dt);
    h.cdHeal = Math.max(0, h.cdHeal - dt);
    h.dodgeInvuln = Math.max(0, h.dodgeInvuln - dt);
    h.hurtInvuln = Math.max(0, h.hurtInvuln - dt);
    h.comboWindowTimer = Math.max(0, h.comboWindowTimer - dt);
    h.counterWindowTimer = Math.max(0, h.counterWindowTimer - dt);
    if (h.counterWindowTimer <= 0) h.counterTargetId = null;

    if (h.comboDecayTimer > 0) {
      h.comboDecayTimer -= dt;
      if (h.comboDecayTimer <= 0) h.comboCount = 0;
    }

    // Passive spirit & stamina regen
    h.spirit = Math.min(h.maxSpirit, h.spirit + dt * 6.5);
    if (h.state !== 'block' && h.state !== 'dodge') {
      h.stamina = Math.min(h.maxStamina, h.stamina + dt * 28);
    }

    // Auto-sheath sword after 6s idle out of combat
    const anyEnemyAlive = this.enemies.some((e) => e.aiState !== 'dead');
    if (anyEnemyAlive || h.state !== 'idle') {
      h.combatIdleTimer = 0;
      h.rig.setWeaponDrawn(true);
    } else {
      h.combatIdleTimer += dt;
      if (h.combatIdleTimer > 6.0) h.rig.setWeaponDrawn(false);
    }

    if (h.state === 'dead') {
      h.stateTime += dt;
      h.rig.applyPose('dead', clamp(h.stateTime / 0.85, 0, 1), this.elapsed, dt, 0);
      return;
    }

    // Per-character hitstop (dodge CAN cancel hitstop per combat-feel.md!)
    const canDodgeNow = h.state !== 'hit' && h.state !== 'skillR' && h.state !== 'parryCounter' && h.stamina >= 18;
    if (canDodgeNow && this.input.consumeAction('dodge')) {
      this.startHeroDodge();
      return;
    }

    if (h.hitstopTimer > 0) {
      h.hitstopTimer -= dt;
      return;
    }

    this.input.getMoveVector(this.moveVec);
    const prevPos = this.tmpVec.copy(h.pos);
    this.rmbRippleCooldown = Math.max(0, this.rmbRippleCooldown - dt);

    // League-of-Legends (英雄联盟) Desktop Right-Click Move + Hold-to-Steer + Ground Aim Reticle!
    const hasCursorWorld = this.updateGroundCursorWorld();
    const keyboardOrStickMoving = Math.hypot(this.moveVec.x, this.moveVec.z) > 0.05;
    if (keyboardOrStickMoving) {
      this.clickMoveTarget = null;
    } else if (this.input.lolMouseMode && !this.input.touchActive && hasCursorWorld) {
      const freshClick = this.input.consumeRmbClick();
      if (freshClick || this.input.rmbHeld) {
        if (!this.clickMoveTarget) this.clickMoveTarget = new THREE.Vector3();
        this.clickMoveTarget.copy(this.aimPoint);
        this.arena.constrainPosition(this.clickMoveTarget, h.radius);
        if (freshClick || this.rmbRippleCooldown <= 0) {
          this.vfx.spawnMoveMarker(this.clickMoveTarget);
          this.rmbRippleCooldown = 0.36;
        }
      }
    }

    if (this.clickMoveTarget && !keyboardOrStickMoving) {
      const dx = this.clickMoveTarget.x - h.pos.x;
      const dz = this.clickMoveTarget.z - h.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.28) {
        this.moveVec.x = dx / dist;
        this.moveVec.z = dz / dist;
      } else {
        this.clickMoveTarget = null;
      }
    }

    // Highest priority interrupt checks when free or cancelable
    const isFree = h.state === 'idle' || h.state === 'run' || h.state === 'block';
    const isAttackCancelable = h.state === 'attack' && h.stateTime / h.stateDuration >= 0.58;

    // 1. Execution Counter on staggered/parried enemy!
    if ((isFree || isAttackCancelable) && h.counterTargetId !== null && h.counterWindowTimer > 0 && this.input.hasBuffered('attack')) {
      const target = this.enemies.find((e) => e.id === h.counterTargetId && e.aiState !== 'dead');
      if (target && target.pos.distanceTo(h.pos) < 8.5) {
        this.input.consumeAction('attack');
        this.startParryCounter(target);
        return;
      }
    }

    // 2. Skills & Heal
    if (isFree || isAttackCancelable) {
      if (h.ult >= 100 && h.cdR <= 0 && this.input.consumeAction('skillR')) {
        this.startSkillR();
        return;
      }
      if (h.spirit >= 45 && h.cdE <= 0 && this.input.consumeAction('skillE')) {
        this.startSkillE();
        return;
      }
      if (h.spirit >= 20 && h.cdQ <= 0 && this.input.consumeAction('skillQ')) {
        this.startSkillQ();
        return;
      }
      if (h.gourds > 0 && h.cdHeal <= 0 && h.hp < h.maxHp && this.input.consumeAction('heal')) {
        this.startDrinkGourd();
        return;
      }
    }

    // 3. Block / Parry (RMB or K)
    if (isFree && this.input.isBlocking() && h.stamina > 6) {
      if (h.state !== 'block') {
        h.state = 'block';
        h.stateTime = 0;
        h.blockElapsed = 0;
        h.rig.setWeaponDrawn(true);
      } else {
        h.blockElapsed += dt;
        // Re-pressing block refreshes parry window only if briefly released
        if (this.input.wasBlockJustPressed()) h.blockElapsed = 0;
      }
      // Face nearest attacker or aim direction while blocking
      const threat = this.findNearestEnemy(10);
      const faceYaw = threat
        ? Math.atan2(threat.pos.x - h.pos.x, threat.pos.z - h.pos.z)
        : this.getAimYaw();
      h.yaw = dampAngle(h.yaw, faceYaw, 16, dt);
      // Slow guarded strafe
      h.pos.x += this.moveVec.x * 2.1 * dt;
      h.pos.z += this.moveVec.z * 2.1 * dt;
      this.arena.constrainPosition(h.pos, h.radius, prevPos);
      h.rig.root.position.copy(h.pos);
      h.rig.root.rotation.y = h.yaw;
      h.rig.applyPose('block', 0, this.elapsed, dt, 1.5);
      return;
    } else if (h.state === 'block') {
      h.state = 'idle';
      h.blockElapsed = 0;
    }

    // 4. Primary 3-Hit Sword Combo
    if ((isFree || isAttackCancelable) && this.input.consumeAction('attack')) {
      const nextStep = h.comboWindowTimer > 0 && h.comboStep < 3 ? h.comboStep + 1 : 1;
      this.startHeroAttack(nextStep);
    }

    // State execution
    if (h.state === 'idle' || h.state === 'run') {
      const speed = 7.4 * this.blessings.speedMult;
      const moving = Math.hypot(this.moveVec.x, this.moveVec.z) > 0.05;
      if (moving) {
        h.state = 'run';
        h.vel.set(this.moveVec.x * speed, 0, this.moveVec.z * speed);
        h.pos.addScaledVector(h.vel, dt);
        const targetYaw = Math.atan2(this.moveVec.x, this.moveVec.z);
        h.yaw = dampAngle(h.yaw, targetYaw, 15, dt);
      } else {
        h.state = 'idle';
        h.vel.set(0, 0, 0);
      }
      this.arena.constrainPosition(h.pos, h.radius, prevPos);
      h.rig.root.position.copy(h.pos);
      h.rig.root.rotation.y = h.yaw;
      h.rig.setSwordGlow(0.85);
      h.rig.applyPose(
        moving ? 'run' : anyEnemyAlive ? 'combatIdle' : 'idle',
        0,
        this.elapsed,
        dt,
        h.vel.length(),
      );
    } else if (h.state === 'attack') {
      this.tickHeroAttack(dt, prevPos);
    } else if (h.state === 'dodge') {
      this.tickHeroDodge(dt, prevPos);
    } else if (h.state === 'parryCounter') {
      this.tickParryCounter(dt, prevPos);
    } else if (h.state === 'skillQ' || h.state === 'skillE' || h.state === 'skillR') {
      this.tickHeroSkill(dt, prevPos);
    } else if (h.state === 'drink') {
      h.stateTime += dt;
      const p = clamp(h.stateTime / h.stateDuration, 0, 1);
      if (!h.attackVfxFired && p >= 0.45) {
        h.attackVfxFired = true;
        h.gourds = Math.max(0, h.gourds - 1);
        const healAmt = 78;
        h.hp = Math.min(h.maxHp, h.hp + healAmt);
        this.audio.playHeal();
        this.vfx.spawnHealVortex(h.pos);
        this.vfx.spawnShockRing(h.pos, new THREE.Color(0.45, 2.1, 1.25), 0.3, 2.5, 0.45);
        this.spawnWorldCallout(`+${healAmt} 气血`, h.pos, 'heal');
        triggerHaptic('medium');
        this.mp.sendAction('heal', { x: h.pos.x, z: h.pos.z });
      }
      h.rig.applyPose('drink', p, this.elapsed, dt, 0);
      if (p >= 1) h.state = 'idle';
    } else if (h.state === 'hit') {
      h.stateTime += dt;
      const p = clamp(h.stateTime / h.stateDuration, 0, 1);
      h.pos.addScaledVector(h.vel, dt * (1 - p));
      this.arena.constrainPosition(h.pos, h.radius, prevPos);
      h.rig.root.position.copy(h.pos);
      h.rig.applyPose('hit', p, this.elapsed, dt, 0);
      if (p >= 1) h.state = 'idle';
    }
  }

  private startHeroAttack(step: number): void {
    const h = this.hero;
    h.state = 'attack';
    h.comboStep = step;
    h.stateTime = 0;
    h.stateDuration = step === 3 ? 0.62 : step === 2 ? 0.46 : 0.42;
    h.comboWindowTimer = h.stateDuration + 0.35;
    h.attackHasHit.clear();
    h.attackVfxFired = false;
    h.rig.setWeaponDrawn(true);
    h.rig.setSwordGlow(step === 3 ? 2.1 : 1.55);

    // Attack magnetism: pick nearest target weighted by aim direction & slide up to reach (never overshoot!)
    const aimYaw = this.getAimYaw();
    const target = this.findNearestEnemy(6.2, aimYaw);
    if (target) {
      h.magnetTargetId = target.id;
      const dx = target.pos.x - h.pos.x;
      const dz = target.pos.z - h.pos.z;
      h.yaw = Math.atan2(dx, dz);
      const standOff = target.radius + h.radius + 1.15;
      h.magnetSlideRemain = clamp(Math.hypot(dx, dz) - standOff, 0, 2.3);
    } else if (this.peerHero && this.peerHero.isEnemy && !this.peerHero.dead) {
      h.magnetTargetId = null;
      const dx = this.peerHero.pos.x - h.pos.x;
      const dz = this.peerHero.pos.z - h.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 6.8) {
        h.yaw = Math.atan2(dx, dz);
        h.magnetSlideRemain = clamp(dist - 1.6, 0, 2.2);
      } else {
        h.magnetSlideRemain = 0.55;
        h.yaw = aimYaw;
      }
    } else {
      h.magnetTargetId = null;
      h.magnetSlideRemain = 0.55;
      h.yaw = aimYaw;
    }
    this.audio.playSwordSwing(step);
    this.mp.sendAction('attack', { step, yaw: h.yaw, x: h.pos.x, z: h.pos.z });
  }

  private tickHeroAttack(dt: number, prevPos: THREE.Vector3): void {
    const h = this.hero;
    h.stateTime += dt;
    const p = clamp(h.stateTime / h.stateDuration, 0, 1);

    // Controlled slide forward during wind-up -> strike (clamped so we never pass through enemy)
    if (p < 0.56 && h.magnetSlideRemain > 0.01) {
      let stepDist = Math.min(h.magnetSlideRemain, dt * 8.5);
      if (h.magnetTargetId !== null) {
        const tgt = this.enemies.find((e) => e.id === h.magnetTargetId && e.aiState !== 'dead');
        if (tgt) {
          const dist = Math.hypot(tgt.pos.x - h.pos.x, tgt.pos.z - h.pos.z);
          const standOff = tgt.radius + h.radius + 1.1;
          stepDist = Math.min(stepDist, Math.max(0, dist - standOff));
        }
      }
      h.pos.x += Math.sin(h.yaw) * stepDist;
      h.pos.z += Math.cos(h.yaw) * stepDist;
      h.magnetSlideRemain -= stepDist;
    }

    this.arena.constrainPosition(h.pos, h.radius, prevPos);
    h.rig.root.position.copy(h.pos);
    h.rig.root.rotation.y = h.yaw;

    const poseName: PoseName = h.comboStep === 1 ? 'combo1' : h.comboStep === 2 ? 'combo2' : 'combo3';
    h.rig.applyPose(poseName, p, this.elapsed, dt, 2);

    // Fire Mesh+Shader sword-qi arc right as the fast quartic swing begins!
    const activeStart = h.comboStep === 3 ? 0.42 : 0.36;
    const activeEnd = h.comboStep === 3 ? 0.68 : 0.62;
    if (!h.attackVfxFired && p >= activeStart) {
      h.attackVfxFired = true;
      const arcPos = h.pos.clone().add(new THREE.Vector3(0, 1.05, 0));
      if (h.comboStep === 1) {
        this.vfx.spawnSwordArc({
          pos: arcPos,
          yaw: h.yaw,
          tiltZ: -0.45,
          colorCore: new THREE.Color(1.4, 2.25, 2.35),
          colorEdge: new THREE.Color(0.22, 0.95, 1.35),
        });
      } else if (h.comboStep === 2) {
        this.vfx.spawnSwordArc({
          pos: arcPos,
          yaw: h.yaw,
          tiltZ: 0.25,
          reverse: true,
          wide: true,
          colorCore: new THREE.Color(1.5, 2.3, 2.2),
          colorEdge: new THREE.Color(0.28, 1.05, 1.25),
        });
      } else {
        // Combo 3: Vertical overhead gold-cyan cleave + ground impact shockwave!
        this.vfx.spawnSwordArc({
          pos: arcPos.add(new THREE.Vector3(Math.sin(h.yaw) * 0.5, 0.15, Math.cos(h.yaw) * 0.5)),
          yaw: h.yaw,
          tiltZ: Math.PI * 0.5,
          wide: true,
          scale: 1.12,
          colorCore: new THREE.Color(2.3, 1.9, 0.78),
          colorEdge: new THREE.Color(0.35, 1.65, 1.85),
          duration: 0.42,
        });
        const slamPos = h.pos.clone().add(new THREE.Vector3(Math.sin(h.yaw) * 2.1, 0.08, Math.cos(h.yaw) * 2.1));
        this.vfx.spawnShockRing(slamPos, new THREE.Color(1.8, 2.1, 1.5), 0.35, 3.2, 0.38);
        this.cameraRig.addShake(0.28);
      }
    }

    // Hitbox detection aligned cleanly to swing frames
    if (p >= activeStart && p <= activeEnd) {
      const reach = h.comboStep === 3 ? 3.45 : 3.05;
      const halfCone = h.comboStep === 2 ? 1.55 : 1.18;
      const baseDmg = h.comboStep === 3 ? 36 : h.comboStep === 2 ? 22 : 18;
      const heavy = h.comboStep === 3;

      // Also allow slashing / deflecting enemy Yin Orbs right back at enemies!
      this.tryDeflectProjectiles(reach, halfCone);

      for (const e of this.enemies) {
        if (e.aiState === 'dead' || h.attackHasHit.has(e.id)) continue;
        const dx = e.pos.x - h.pos.x;
        const dz = e.pos.z - h.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > reach + e.radius) continue;
        const diff = Math.abs(angleDiff(h.yaw, Math.atan2(dx, dz)));
        if (diff > halfCone && dist > 1.25) continue;

        h.attackHasHit.add(e.id);
        this.damageEnemy(e, baseDmg, heavy, h.yaw, heavy ? 22 : 10, false);
      }

      if (this.peerHero && this.peerHero.isEnemy && !this.peerHero.dead && !h.attackHasHit.has(-999)) {
        const dx = this.peerHero.pos.x - h.pos.x;
        const dz = this.peerHero.pos.z - h.pos.z;
        const dist = Math.hypot(dx, dz);
        const diff = Math.abs(angleDiff(h.yaw, Math.atan2(dx, dz)));
        if (dist <= reach + this.peerHero.radius && (diff <= halfCone || dist < 1.35)) {
          h.attackHasHit.add(-999);
          this.hitSoloOpponent(baseDmg, heavy ? 24 : 10, heavy, h.yaw, `combo${h.comboStep}`);
        }
      }
    }

    if (p >= 1) {
      h.state = 'idle';
      h.rig.setSwordGlow(0.85);
    }
  }

  private startHeroDodge(): void {
    const h = this.hero;
    h.state = 'dodge';
    h.stateTime = 0;
    h.stateDuration = 0.36;
    h.hitstopTimer = 0; // Dodge breaks hitstop!
    h.dodgeInvuln = 0.34;
    h.dodgePerfectTriggered = false;
    h.afterimageTimer = 0;
    h.stamina = Math.max(0, h.stamina - 18);

    this.input.getMoveVector(this.moveVec);
    if (Math.hypot(this.moveVec.x, this.moveVec.z) > 0.1) {
      h.dodgeDir.set(this.moveVec.x, 0, this.moveVec.z).normalize();
      h.yaw = Math.atan2(h.dodgeDir.x, h.dodgeDir.z);
    } else {
      h.dodgeDir.set(Math.sin(h.yaw), 0, Math.cos(h.yaw));
    }
    this.audio.playDodge(false);
    this.vfx.spawnAfterimage(h.pos, h.yaw);
  }

  private tickHeroDodge(dt: number, prevPos: THREE.Vector3): void {
    const h = this.hero;
    h.stateTime += dt;
    const p = clamp(h.stateTime / h.stateDuration, 0, 1);
    const speed = 15.8 * (1 - p * 0.45);
    h.pos.addScaledVector(h.dodgeDir, speed * dt);
    this.arena.constrainPosition(h.pos, h.radius, prevPos);
    h.rig.root.position.copy(h.pos);
    h.rig.root.rotation.y = h.yaw;
    h.rig.applyPose('dodge', p, this.elapsed, dt, speed);

    h.afterimageTimer += dt;
    if (h.afterimageTimer >= 0.065) {
      h.afterimageTimer = 0;
      this.vfx.spawnAfterimage(h.pos, h.yaw);
    }

    if (p >= 1) h.state = 'idle';
  }

  private startParryCounter(target: EnemyEntity): void {
    const h = this.hero;
    h.state = 'parryCounter';
    h.stateTime = 0;
    h.stateDuration = 0.56;
    h.counterWindowTimer = 0;
    h.counterTargetId = null;
    h.attackHasHit.clear();
    h.attackVfxFired = false;
    h.dodgeInvuln = 0.6;
    h.magnetTargetId = target.id;

    // Flash-step right in front of staggered enemy leaving golden-cyan ghost trail
    this.vfx.spawnAfterimage(h.pos, h.yaw, new THREE.Color(2.2, 1.8, 0.55));
    const dx = target.pos.x - h.pos.x;
    const dz = target.pos.z - h.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.1) {
      const stand = target.radius + h.radius + 1.15;
      const move = Math.max(0, dist - stand);
      h.pos.x += (dx / dist) * move;
      h.pos.z += (dz / dist) * move;
      this.arena.constrainPosition(h.pos, h.radius);
      h.yaw = Math.atan2(dx, dz);
    }
    h.rig.root.position.copy(h.pos);
    h.rig.root.rotation.y = h.yaw;
    this.timeScale = 0.35;
    this.slowMoTimer = 0.18;
    this.audio.playSwordSwing(3);
  }

  private tickParryCounter(dt: number, prevPos: THREE.Vector3): void {
    const h = this.hero;
    h.stateTime += dt;
    const p = clamp(h.stateTime / h.stateDuration, 0, 1);
    this.arena.constrainPosition(h.pos, h.radius, prevPos);
    h.rig.root.position.copy(h.pos);
    h.rig.applyPose('parryCounter', p, this.elapsed, dt, 0);

    if (!h.attackVfxFired && p >= 0.28) {
      h.attackVfxFired = true;
      this.vfx.spawnSwordArc({
        pos: h.pos.clone().add(new THREE.Vector3(0, 1.1, 0)),
        yaw: h.yaw,
        wide: true,
        scale: 1.32,
        colorCore: new THREE.Color(2.4, 2.0, 0.72),
        colorEdge: new THREE.Color(1.4, 0.9, 0.2),
        duration: 0.48,
      });
      const tgt = this.enemies.find((e) => e.id === h.magnetTargetId && e.aiState !== 'dead');
      if (tgt) {
        this.damageEnemy(tgt, 86, true, h.yaw, 42, true);
        this.spawnWorldCallout('破势处决!', tgt.pos, 'parry');
      }
      this.cameraRig.addShake(0.55);
    }

    if (p >= 1) h.state = 'idle';
  }

  /** [Q] 御剑术: Piercing glowing Flying Spirit Sword! */
  private startSkillQ(): void {
    const h = this.hero;
    h.spirit -= 20;
    h.cdQ = 3.2 * this.blessings.cdMult;
    h.state = 'skillQ';
    h.stateTime = 0;
    h.stateDuration = 0.34;
    h.attackVfxFired = false;
    h.rig.setWeaponDrawn(true);
    const aimYaw = this.getAimYaw();
    const tgt = this.findNearestEnemy(13, aimYaw);
    if (tgt) {
      h.yaw = Math.atan2(tgt.pos.x - h.pos.x, tgt.pos.z - h.pos.z);
    } else if (this.peerHero && this.peerHero.isEnemy && !this.peerHero.dead) {
      h.yaw = Math.atan2(this.peerHero.pos.x - h.pos.x, this.peerHero.pos.z - h.pos.z);
    } else {
      h.yaw = aimYaw;
    }
    h.rig.root.rotation.y = h.yaw;
    this.audio.playSkillQ();
    this.hud.triggerSkillPulse('Q');
    triggerHaptic('medium');
    this.mp.sendAction('skillQ', { yaw: h.yaw, x: h.pos.x, z: h.pos.z });
  }

  /** [E] 万剑诀: Bagua Sword Formation + 9 plunging 3D spirit swords! */
  private startSkillE(): void {
    const h = this.hero;
    h.spirit -= 45;
    h.cdE = 7.5 * this.blessings.cdMult;
    h.state = 'skillE';
    h.stateTime = 0;
    h.stateDuration = 0.52;
    h.attackVfxFired = false;
    h.rig.setWeaponDrawn(true);
    const tgt = this.findNearestEnemy(12, this.getAimYaw());
    if (tgt) h.yaw = Math.atan2(tgt.pos.x - h.pos.x, tgt.pos.z - h.pos.z);
    else if (this.peerHero && this.peerHero.isEnemy && !this.peerHero.dead) {
      h.yaw = Math.atan2(this.peerHero.pos.x - h.pos.x, this.peerHero.pos.z - h.pos.z);
    }
    h.rig.root.rotation.y = h.yaw;
    this.audio.playSkillE();
    this.hud.triggerSkillPulse('E');
    triggerHaptic('heavy');
  }

  /** [R] 天剑 (Ultimate): Colossal Golden Celestial Sword cleaving the Bagua court! */
  private startSkillR(): void {
    const h = this.hero;
    h.ult = 0;
    h.cdR = 10.0 * this.blessings.cdMult;
    h.state = 'skillR';
    h.stateTime = 0;
    h.stateDuration = 0.85;
    h.dodgeInvuln = 1.0;
    h.attackVfxFired = false;
    h.rig.setWeaponDrawn(true);
    const tgt = this.findNearestEnemy(14);
    if (tgt) h.yaw = Math.atan2(tgt.pos.x - h.pos.x, tgt.pos.z - h.pos.z);
    else if (this.peerHero && this.peerHero.isEnemy && !this.peerHero.dead) {
      h.yaw = Math.atan2(this.peerHero.pos.x - h.pos.x, this.peerHero.pos.z - h.pos.z);
    }
    h.rig.root.rotation.y = h.yaw;
    this.audio.playSkillR();
    this.hud.triggerSkillPulse('R');
    triggerHaptic('ultimate');
    this.hud.showSubtitle('「剑意凌霄——天剑降世！」', 2.0);
  }

  private startDrinkGourd(): void {
    const h = this.hero;
    h.state = 'drink';
    h.stateTime = 0;
    h.stateDuration = 0.68;
    h.cdHeal = 1.5;
    h.attackVfxFired = false;
    this.hud.triggerSkillPulse('F');
    triggerHaptic('light');
  }

  private tickHeroSkill(dt: number, prevPos: THREE.Vector3): void {
    const h = this.hero;
    h.stateTime += dt;
    const p = clamp(h.stateTime / h.stateDuration, 0, 1);
    this.arena.constrainPosition(h.pos, h.radius, prevPos);
    h.rig.root.position.copy(h.pos);
    h.rig.root.rotation.y = h.yaw;

    const pose: PoseName = h.state === 'skillQ' ? 'castQ' : h.state === 'skillE' ? 'castE' : 'castR';
    h.rig.applyPose(pose, p, this.elapsed, dt, 0);

    if (!h.attackVfxFired && p >= 0.35) {
      h.attackVfxFired = true;
      if (h.state === 'skillQ') {
        // Launch piercing 3D Flying Sword
        const mesh = buildFlyingSwordMesh();
        const startPos = h.pos.clone().add(new THREE.Vector3(Math.sin(h.yaw) * 1.1, 1.15, Math.cos(h.yaw) * 1.1));
        mesh.position.copy(startPos);
        mesh.rotation.y = h.yaw;
        this.scene.add(mesh);
        this.projectiles.push({
          id: this.nextEntityId++,
          friendly: true,
          kind: 'flyingSword',
          pos: startPos,
          vel: new THREE.Vector3(Math.sin(h.yaw) * 23, 0, Math.cos(h.yaw) * 23),
          radius: 0.72,
          damage: 44,
          age: 0,
          maxAge: 0.95,
          hitIds: new Set(),
          mesh,
        });
        this.vfx.spawnShockRing(startPos, new THREE.Color(0.5, 2.0, 2.2), 0.2, 1.4, 0.25);
      } else if (h.state === 'skillE') {
        // 万剑诀: Bagua array + 9 cascading falling 3D spirit swords around cursor (LoL) or target center!
        const tgt = this.findNearestEnemy(12, h.yaw);
        let center: THREE.Vector3;
        if (this.input.lolMouseMode && !this.input.touchActive && this.input.mouseMoved) {
          const toC = this.aimPoint.clone().sub(h.pos);
          if (toC.length() > 11.5) toC.setLength(11.5);
          center = h.pos.clone().add(toC);
        } else {
          center = tgt
            ? tgt.pos.clone()
            : this.peerHero && this.peerHero.isEnemy && !this.peerHero.dead
              ? this.peerHero.pos.clone()
              : h.pos.clone().add(new THREE.Vector3(Math.sin(h.yaw) * 5.2, 0, Math.cos(h.yaw) * 5.2));
        }
        this.arena.constrainPosition(center, 1.0);
        this.mp.sendAction('skillE', { x: center.x, z: center.z });
        this.vfx.spawnBaguaArray({
          pos: new THREE.Vector3(center.x, 0.08, center.z),
          radius: 4.5,
          color: new THREE.Color(0.35, 1.85, 2.0),
          duration: 1.65,
        });
        for (let i = 0; i < 9; i++) {
          const ang = (i / 9) * Math.PI * 2 + this.rng() * 0.4;
          const r = i === 0 ? 0.2 : 1.1 + this.rng() * 2.8;
          const spot = new THREE.Vector3(center.x + Math.cos(ang) * r, 0, center.z + Math.sin(ang) * r);
          this.vfx.spawnFallingSword({
            targetPos: spot,
            delay: i * 0.075,
            onImpact: (pos) => {
              this.audio.playHit(false);
              this.cameraRig.addShake(0.14);
              for (const e of this.enemies) {
                if (e.aiState === 'dead') continue;
                if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) <= 2.3 + e.radius) {
                  this.damageEnemy(e, 22, false, h.yaw, 9, false);
                }
              }
              if (this.peerHero && this.peerHero.isEnemy && !this.peerHero.dead) {
                if (Math.hypot(this.peerHero.pos.x - pos.x, this.peerHero.pos.z - pos.z) <= 2.3 + this.peerHero.radius) {
                  this.hitSoloOpponent(14, 8, false, h.yaw, 'skillE');
                }
              }
            },
          });
        }
      } else if (h.state === 'skillR') {
        const tgt = this.findNearestEnemy(15);
        let center: THREE.Vector3;
        if (this.input.lolMouseMode && !this.input.touchActive && this.input.mouseMoved) {
          const toC = this.aimPoint.clone().sub(h.pos);
          if (toC.length() > 12.5) toC.setLength(12.5);
          center = h.pos.clone().add(toC);
        } else {
          center = tgt
            ? tgt.pos.clone()
            : this.peerHero && this.peerHero.isEnemy && !this.peerHero.dead
              ? this.peerHero.pos.clone()
              : h.pos.clone().add(new THREE.Vector3(Math.sin(h.yaw) * 5.5, 0, Math.cos(h.yaw) * 5.5));
        }
        this.arena.constrainPosition(center, 1.2);
        this.mp.sendAction('skillR', { x: center.x, z: center.z });
        this.vfx.spawnBaguaArray({
          pos: new THREE.Vector3(center.x, 0.1, center.z),
          radius: 6.4,
          color: new THREE.Color(2.2, 1.65, 0.45),
          duration: 2.1,
        });
        this.vfx.spawnFallingSword({
          targetPos: center,
          giant: true,
          delay: 0.05,
          onImpact: (pos) => {
            this.cameraRig.addShake(0.85);
            triggerHaptic('ultimate');
            this.vfx.spawnHitSparks(pos.clone().add(new THREE.Vector3(0, 0.5, 0)), new THREE.Vector3(0, 1, 0), new THREE.Color(2.4, 1.9, 0.55), 26, this.rng);
            for (const e of this.enemies) {
              if (e.aiState === 'dead') continue;
              if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) <= 6.8 + e.radius) {
                this.damageEnemy(e, 145, true, h.yaw, 55, true);
              }
            }
            if (this.peerHero && this.peerHero.isEnemy && !this.peerHero.dead) {
              if (Math.hypot(this.peerHero.pos.x - pos.x, this.peerHero.pos.z - pos.z) <= 6.6 + this.peerHero.radius) {
                this.hitSoloOpponent(58, 45, true, h.yaw, 'skillR');
              }
            }
          },
        });
      }
    }

    if (p >= 1) h.state = 'idle';
  }

  private damageEnemy(
    e: EnemyEntity,
    rawDmg: number,
    heavy: boolean,
    attackYaw: number,
    poiseGain: number,
    isCrit: boolean,
    fromRemoteGuest = false,
  ): void {
    if (e.aiState === 'dead') return;
    const h = this.hero;

    if (!fromRemoteGuest && this.mp.isOnline() && this.mp.mode === 'coop' && this.mp.role === 'guest') {
      this.mp.sendEnemyHit(e.id, rawDmg, poiseGain, heavy);
      e.rig.triggerHitFlash(1.0);
      this.audio.playHit(heavy);
      triggerHaptic(heavy ? 'heavy' : 'light');
      h.spirit = Math.min(h.maxSpirit, h.spirit + (heavy ? 12 : 7));
      h.ult = Math.min(100, h.ult + (heavy ? 12 : 6));
      h.comboCount += 1;
      h.comboDecayTimer = 3.2;
      h.maxCombo = Math.max(h.maxCombo, h.comboCount);
      h.totalDamage += rawDmg;
      this.spawnWorldCallout(`${rawDmg}`, e.pos, isCrit || heavy ? 'crit' : 'dmg');
      return;
    }

    let interrupted = false;
    if (e.aiState === 'windup' && e.stateTime / Math.max(0.1, e.stateDuration) >= 0.42) {
      interrupted = true;
    }

    const scaledRaw = fromRemoteGuest ? rawDmg : Math.round(rawDmg * this.getHeroDamageMult());
    const dmg = Math.round(scaledRaw * (interrupted ? 1.35 : 1.0));
    e.hp = Math.max(0, e.hp - dmg);
    e.poise = Math.min(e.maxPoise, e.poise + poiseGain * (interrupted ? 1.6 : 1.0));

    if (!fromRemoteGuest) {
      h.spirit = Math.min(h.maxSpirit, h.spirit + (heavy ? 12 : 7));
      h.ult = Math.min(100, h.ult + (heavy ? 12 : 6) * this.blessings.ultGainMult);
      h.comboCount += 1;
      h.comboDecayTimer = 3.2;
      h.maxCombo = Math.max(h.maxCombo, h.comboCount);
      h.totalDamage += dmg;
      triggerHaptic(heavy || interrupted ? 'heavy' : 'light');
    }

    const hitstop = heavy ? 0.1 : 0.062;
    h.hitstopTimer = Math.max(h.hitstopTimer, hitstop * 0.85);
    e.hitstopTimer = Math.max(e.hitstopTimer, hitstop);
    e.shakeTimer = 0.16;
    e.rig.triggerHitFlash(1.0);

    // Directional sparks at contact point along slash tangent (per combat-feel.md)
    const contactPos = e.pos.clone().lerp(h.pos, 0.35);
    contactPos.y = 1.15;
    const tangent = new THREE.Vector3(Math.cos(attackYaw), 0.25, -Math.sin(attackYaw));
    this.vfx.spawnHitSparks(
      contactPos,
      tangent,
      isCrit || interrupted ? new THREE.Color(2.4, 1.9, 0.5) : new THREE.Color(1.4, 2.2, 2.3),
      heavy ? 16 : 10,
      this.rng,
    );

    this.audio.playHit(heavy || interrupted);
    this.cameraRig.addShake(heavy ? 0.32 : 0.14);

    if (interrupted) {
      this.spawnWorldCallout(`破招 ${dmg}!`, e.pos, 'parry');
    } else {
      this.spawnWorldCallout(`${dmg}`, e.pos, isCrit || heavy ? 'crit' : 'dmg');
    }

    // Knockback graded by light/heavy
    const kb = heavy ? (e.kind === 'boss' ? 1.8 : 4.2) : e.kind === 'boss' ? 0.4 : 1.6;
    e.vel.set(Math.sin(attackYaw) * kb, 0, Math.cos(attackYaw) * kb);

    // Boss Phase 2 transition at 50% HP!
    if (e.kind === 'boss' && e.phase === 1 && e.hp > 0 && e.hp <= e.maxHp * 0.5) {
      e.phase = 2;
      e.rig.setPhase2(true);
      this.audio.setMood('boss2');
      this.vfx.spawnShockRing(e.pos, new THREE.Color(2.3, 0.25, 0.5), 0.6, 7.5, 0.65);
      this.cameraRig.addShake(0.6);
      this.hud.showSubtitle('镇狱妖王：「锁妖之阵既裂，便以尔之血重铸魔剑！」', 3.2);
    }

    if (e.hp <= 0) {
      this.killEnemy(e);
      return;
    }

    // Poise break -> Stagger + Counter Execution Window!
    if (e.poise >= e.maxPoise || (interrupted && e.kind !== 'boss')) {
      e.poise = 0;
      e.telegraph?.dispose();
      e.telegraph = null;
      e.aiState = 'stagger';
      e.stateTime = 0;
      e.stateDuration = e.kind === 'boss' ? 2.1 : 1.5;
      h.counterTargetId = e.id;
      h.counterWindowTimer = 1.4;
      this.vfx.spawnShockRing(e.pos, new THREE.Color(2.4, 1.9, 0.5), 0.4, 2.8, 0.4);
      this.spawnWorldCallout('破势!', e.pos, 'parry');
    } else if (e.kind !== 'boss' && (heavy || e.aiState !== 'attack')) {
      e.telegraph?.dispose();
      e.telegraph = null;
      e.aiState = 'hit';
      e.stateTime = 0;
      e.stateDuration = heavy ? 0.42 : 0.26;
    }
  }

  private killEnemy(e: EnemyEntity): void {
    e.telegraph?.dispose();
    e.telegraph = null;
    e.aiState = 'dead';
    e.stateTime = 0;
    e.deathTimer = 0;
    e.counterRing.visible = false;
    e.hpBarGroup.visible = false;
    if (this.hero.counterTargetId === e.id) {
      this.hero.counterTargetId = null;
      this.hero.counterWindowTimer = 0;
    }

    this.vfx.spawnShockRing(e.pos, new THREE.Color(1.4, 2.1, 2.2), 0.3, 2.8, 0.45);
    this.vfx.spawnHitSparks(e.pos.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3(0, 1, 0), new THREE.Color(2.0, 1.7, 0.8), 18, this.rng);

    // Spawn 3D modeled Loot Drops with light pillars!
    if (e.kind !== 'boss') {
      this.vfx.spawnLootDrop(e.pos, 'heal', this.rng);
      this.vfx.spawnLootDrop(e.pos, 'spirit', this.rng);
      if (e.kind === 'caster') {
        this.vfx.spawnLootDrop(e.pos, 'gourd', this.rng);
      }
    } else {
      this.vfx.spawnLootDrop(e.pos, 'gourd', this.rng);
      this.vfx.spawnLootDrop(e.pos, 'gourd', this.rng);
    }
  }

  private onCollectDrop(kind: 'heal' | 'spirit' | 'gourd'): void {
    const h = this.hero;
    this.audio.playHeal();
    if (kind === 'heal') {
      h.hp = Math.min(h.maxHp, h.hp + 36);
      this.spawnWorldCallout('+36 气血', h.pos, 'heal');
    } else if (kind === 'spirit') {
      h.spirit = Math.min(h.maxSpirit, h.spirit + 35);
      h.ult = Math.min(100, h.ult + 16);
      this.spawnWorldCallout('+35 真气', h.pos, 'info');
    } else {
      h.gourds = Math.min(h.maxGourds + 1, h.gourds + 1);
      h.hp = Math.min(h.maxHp, h.hp + 25);
      this.spawnWorldCallout('灵葫酒 +1', h.pos, 'parry');
    }
  }

  private updateEnemies(dt: number): void {
    const h = this.hero;

    // Token coordination: at most ONE melee enemy holds the active melee attack token at a time!
    const meleeAttackerBusy = this.enemies.some(
      (e) =>
        e.aiState !== 'dead' &&
        e.kind !== 'caster' &&
        (e.aiState === 'windup' || e.aiState === 'attack' || e.aiState === 'chase'),
    );
    let meleeTokenGiven = meleeAttackerBusy;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.aiState === 'dead') {
        e.deathTimer += dt;
        e.rig.applyPose('dead', clamp(e.deathTimer / 0.75, 0, 1), this.elapsed, dt, 0);
        if (e.deathTimer > 2.4 && e.kind !== 'boss') {
          this.scene.remove(e.rig.root);
          this.enemies.splice(i, 1);
        }
        continue;
      }

      // Billboard overhead HP bar toward camera
      if (e.hpBarGroup.visible) {
        e.hpBarGroup.quaternion.copy(this.camera.quaternion);
        e.hpFillMesh.scale.x = clamp(e.hp / e.maxHp, 0.001, 1);
      }
      // Show golden counter-execution ring if hero has active counter window on this enemy
      e.counterRing.visible = h.counterTargetId === e.id && h.counterWindowTimer > 0;
      if (e.counterRing.visible) {
        e.counterRing.rotation.z += dt * 4.5;
      }

      // Per-enemy hitstop & hit micro-shake
      if (e.hitstopTimer > 0) {
        e.hitstopTimer -= dt;
        const j = Math.sin(this.elapsed * 95) * 0.07;
        e.rig.root.position.set(e.pos.x + j, e.pos.y, e.pos.z - j);
        continue;
      }

      e.attackCooldown = Math.max(0, e.attackCooldown - dt);
      const prevPos = this.tmpVec2.copy(e.pos);
      const dx = h.pos.x - e.pos.x;
      const dz = h.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      const toHeroYaw = Math.atan2(dx, dz);

      if (e.aiState === 'hit' || e.aiState === 'stagger') {
        e.stateTime += dt;
        const p = clamp(e.stateTime / e.stateDuration, 0, 1);
        e.pos.addScaledVector(e.vel, dt * (1 - p));
        this.arena.constrainPosition(e.pos, e.radius, prevPos);
        e.rig.root.position.copy(e.pos);
        e.rig.applyPose(e.aiState === 'stagger' ? 'stagger' : 'hit', p, this.elapsed, dt, 0);
        if (p >= 1) {
          e.aiState = 'orbit';
          e.stateTime = 0;
          e.attackCooldown = 0.55;
        }
        continue;
      }

      if (e.aiState === 'orbit') {
        e.yaw = dampAngle(e.yaw, toHeroYaw, 8, dt);
        const preferred = e.kind === 'caster' ? 8.2 : e.kind === 'boss' ? 5.2 : 4.6;
        const radial = clamp((dist - preferred) * 0.75, -1, 1);
        const moveSpeed = (e.kind === 'boss' ? (e.phase === 2 ? 4.4 : 3.5) : 3.1) * e.speedMult;
        const nx = dist > 0.01 ? dx / dist : 0;
        const nz = dist > 0.01 ? dz / dist : 1;
        // Strafe tangentially around hero + gentle radial spacing
        const tx = -nz * e.orbitDir;
        const tz = nx * e.orbitDir;
        e.pos.x += (nx * radial + tx * 0.72) * moveSpeed * dt;
        e.pos.z += (nz * radial + tz * 0.72) * moveSpeed * dt;
        this.arena.constrainPosition(e.pos, e.radius, prevPos);
        e.rig.root.position.copy(e.pos);
        e.rig.root.rotation.y = e.yaw;
        e.rig.applyPose('run', 0, this.elapsed, dt, moveSpeed);

        if (e.attackCooldown <= 0) {
          if (e.kind === 'caster') {
            this.beginEnemyWindup(e, this.rng() < 0.55 ? 'orb' : 'yinCircle');
          } else if (!meleeTokenGiven) {
            meleeTokenGiven = true;
            if (e.kind === 'boss' && dist > 6.5) {
              this.beginEnemyWindup(e, e.phase === 2 && this.rng() < 0.45 ? 'barrage' : 'lunge');
            } else {
              e.aiState = 'chase';
              e.stateTime = 0;
            }
          }
        }
      } else if (e.aiState === 'chase') {
        e.yaw = dampAngle(e.yaw, toHeroYaw, 10, dt);
        const spd = (e.kind === 'boss' ? (e.phase === 2 ? 6.2 : 5.1) : 4.8) * e.speedMult;
        if (dist > 0.01) {
          e.pos.x += (dx / dist) * spd * dt;
          e.pos.z += (dz / dist) * spd * dt;
        }
        this.arena.constrainPosition(e.pos, e.radius, prevPos);
        e.rig.root.position.copy(e.pos);
        e.rig.root.rotation.y = e.yaw;
        e.rig.applyPose('run', 0, this.elapsed, dt, spd);

        const engageDist = e.kind === 'boss' ? 4.1 : e.kind === 'elite' ? 3.2 : 2.55;
        if (dist <= engageDist) {
          if (e.kind === 'boss' || e.kind === 'elite') {
            const roll = this.rng();
            const mv = roll < 0.48 ? 'cleave' : roll < 0.78 ? 'slam' : 'lunge';
            this.beginEnemyWindup(e, mv);
          } else {
            this.beginEnemyWindup(e, 'cleave');
          }
        }
      } else if (e.aiState === 'windup') {
        e.stateTime += dt;
        const p = clamp(e.stateTime / e.stateDuration, 0, 1);
        // Track hero only during early windup so player can dodge cleanly!
        if (p < 0.45 && e.moveKind !== 'yinCircle') {
          e.yaw = dampAngle(e.yaw, toHeroYaw, 9, dt);
        }
        e.rig.root.rotation.y = e.yaw;
        e.telegraph?.updateProgress(p);
        if (e.telegraph && (e.moveKind === 'cleave' || e.moveKind === 'lunge')) {
          e.telegraph.mesh.rotation.y = e.yaw;
          const halfLen = e.moveKind === 'lunge' ? 4.4 : e.moveRange * 0.5;
          e.telegraph.mesh.position.set(
            e.pos.x + Math.sin(e.yaw) * halfLen,
            0.055,
            e.pos.z + Math.cos(e.yaw) * halfLen,
          );
        }
        e.rig.applyPose('enemyWindup', p, this.elapsed, dt, 0);

        if (p >= 1) {
          e.telegraph?.dispose();
          e.telegraph = null;
          e.aiState = 'attack';
          e.stateTime = 0;
          e.stateDuration = e.moveKind === 'lunge' ? 0.34 : e.moveKind === 'slam' ? 0.42 : 0.34;
          e.moveHasHit = false;
          this.audio.playSwordSwing(e.kind === 'boss' ? 3 : 2);
        }
      } else if (e.aiState === 'attack') {
        e.stateTime += dt;
        const p = clamp(e.stateTime / e.stateDuration, 0, 1);
        // Lunge burst forward
        if (e.moveKind === 'lunge' && p < 0.72) {
          const lSpd = e.kind === 'boss' ? 19.5 : 13;
          e.pos.x += Math.sin(e.yaw) * lSpd * dt;
          e.pos.z += Math.cos(e.yaw) * lSpd * dt;
          this.arena.constrainPosition(e.pos, e.radius, prevPos);
        } else if (e.moveKind === 'cleave' && p < 0.4) {
          e.pos.x += Math.sin(e.yaw) * 3.5 * dt;
          e.pos.z += Math.cos(e.yaw) * 3.5 * dt;
          this.arena.constrainPosition(e.pos, e.radius, prevPos);
        }
        e.rig.root.position.copy(e.pos);
        e.rig.applyPose(e.moveKind === 'slam' ? 'bossSlam' : 'enemySlash', p, this.elapsed, dt, 0);

        if (!e.moveHasHit && p >= 0.25) {
          this.executeEnemyMoveHit(e);
        }

        if (p >= 1) {
          // Optional Boss / Bladesman 2-hit follow-up
          if (e.comboFollowup && dist < e.moveRange + 2.5) {
            e.comboFollowup = false;
            this.beginEnemyWindup(e, 'cleave', 0.46);
          } else {
            e.aiState = 'recover';
            e.stateTime = 0;
            e.stateDuration = e.kind === 'boss' ? (e.phase === 2 ? 0.55 : 0.8) : 0.7;
          }
        }
      } else if (e.aiState === 'recover') {
        e.stateTime += dt;
        e.rig.applyPose('combatIdle', 0, this.elapsed, dt, 0);
        if (e.stateTime >= e.stateDuration) {
          e.aiState = 'orbit';
          e.stateTime = 0;
          e.attackCooldown = e.kind === 'boss' ? (e.phase === 2 ? 0.85 : 1.25) : 1.35 + this.rng() * 0.9;
          e.orbitDir = this.rng() > 0.5 ? 1 : -1;
        }
      }
    }
  }

  private beginEnemyWindup(
    e: EnemyEntity,
    move: EnemyEntity['moveKind'],
    customWindup?: number,
  ): void {
    e.telegraph?.dispose();
    e.telegraph = null;
    e.aiState = 'windup';
    e.moveKind = move;
    e.stateTime = 0;
    e.comboFollowup =
      customWindup === undefined &&
      (((e.kind === 'boss' || e.kind === 'elite') && move === 'cleave') || (e.kind === 'bladesman' && this.rng() < 0.35));

    const fast = (e.kind === 'boss' && e.phase === 2 ? 0.82 : e.kind === 'elite' ? 0.92 : 1.0) / Math.max(0.8, e.speedMult);

    if (move === 'cleave') {
      e.stateDuration = (customWindup ?? (e.kind === 'boss' ? 0.72 : e.kind === 'elite' ? 0.66 : 0.62)) * fast;
      e.moveRange = e.kind === 'boss' ? 4.3 : e.kind === 'elite' ? 3.4 : 2.85;
      e.moveDamage = Math.round((e.kind === 'boss' ? 24 : e.kind === 'elite' ? 20 : 15) * e.damageMult);
      e.moveUnblockable = false;
      e.telegraph = this.vfx.createTelegraph('fan', e.pos, e.yaw, e.moveRange * 1.45, e.moveRange);
    } else if (move === 'lunge') {
      e.stateDuration = 0.74 * fast;
      e.moveRange = 2.6;
      e.moveDamage = Math.round((e.kind === 'elite' ? 23 : 28) * e.damageMult);
      e.moveUnblockable = false;
      e.telegraph = this.vfx.createTelegraph('line', e.pos, e.yaw, 2.3, e.kind === 'elite' ? 7.2 : 8.8);
    } else if (move === 'slam') {
      e.stateDuration = 0.92 * fast;
      e.moveRange = e.kind === 'elite' ? 4.2 : 5.4;
      e.moveDamage = Math.round((e.kind === 'elite' ? 25 : 32) * e.damageMult);
      e.moveUnblockable = true; // Red-purple ground slam MUST be dodged!
      e.telegraphPos.copy(e.pos);
      e.telegraph = this.vfx.createTelegraph(
        'circle',
        e.pos,
        0,
        e.moveRange,
        e.moveRange,
        new THREE.Color(2.2, 0.2, 0.65),
      );
    } else if (move === 'yinCircle') {
      e.stateDuration = 1.05 * fast;
      e.moveRange = 3.1;
      e.moveDamage = Math.round(20 * e.damageMult);
      e.moveUnblockable = true;
      e.telegraphPos.copy(this.hero.pos);
      e.telegraph = this.vfx.createTelegraph(
        'circle',
        e.telegraphPos,
        0,
        e.moveRange,
        e.moveRange,
        new THREE.Color(1.4, 0.45, 2.35),
      );
    } else if (move === 'orb' || move === 'barrage') {
      e.stateDuration = (move === 'barrage' ? 0.75 : 0.68) * fast;
      e.moveRange = 14;
      e.moveDamage = Math.round((move === 'barrage' ? 18 : 16) * e.damageMult);
      e.moveUnblockable = false;
    }
  }

  private executeEnemyMoveHit(e: EnemyEntity): void {
    e.moveHasHit = true;
    const h = this.hero;

    if (e.moveKind === 'orb' || e.moveKind === 'barrage') {
      const count = e.moveKind === 'barrage' ? 5 : 1;
      const spread = 0.28;
      for (let i = 0; i < count; i++) {
        const ang = e.yaw + (i - (count - 1) * 0.5) * spread;
        const mesh = buildYinOrbMesh(e.kind === 'boss');
        const startPos = e.pos.clone().add(new THREE.Vector3(Math.sin(ang) * 1.1, 1.25, Math.cos(ang) * 1.1));
        mesh.position.copy(startPos);
        this.scene.add(mesh);
        const speed = e.kind === 'boss' ? 11.5 : 9.2;
        this.projectiles.push({
          id: this.nextEntityId++,
          friendly: false,
          kind: 'yinOrb',
          pos: startPos,
          vel: new THREE.Vector3(Math.sin(ang) * speed, 0, Math.cos(ang) * speed),
          radius: 0.52,
          damage: e.moveDamage,
          age: 0,
          maxAge: 3.4,
          hitIds: new Set(),
          mesh,
        });
      }
      return;
    }

    if (e.moveKind === 'yinCircle') {
      this.vfx.spawnBaguaArray({
        pos: new THREE.Vector3(e.telegraphPos.x, 0.08, e.telegraphPos.z),
        radius: e.moveRange,
        color: new THREE.Color(1.4, 0.45, 2.35),
        duration: 0.6,
      });
      this.vfx.spawnShockRing(e.telegraphPos, new THREE.Color(1.5, 0.5, 2.4), 0.3, e.moveRange, 0.35);
      this.audio.playHit(true);
      if (Math.hypot(h.pos.x - e.telegraphPos.x, h.pos.z - e.telegraphPos.z) <= e.moveRange) {
        this.tryHitHero(e, e.moveDamage, true);
      }
      return;
    }

    if (e.moveKind === 'slam') {
      this.vfx.spawnShockRing(e.pos, new THREE.Color(2.3, 0.28, 0.65), 0.5, e.moveRange, 0.48);
      this.vfx.spawnGroundCrater(e.pos, e.moveRange * 0.78, new THREE.Color(2.1, 0.32, 0.35), 3.6);
      this.vfx.spawnBaguaArray({
        pos: new THREE.Vector3(e.pos.x, 0.09, e.pos.z),
        radius: e.moveRange,
        color: new THREE.Color(2.0, 0.25, 0.55),
        duration: 0.75,
      });
      this.audio.playHit(true);
      this.cameraRig.addShake(0.5);
      triggerHaptic('heavy');
      if (Math.hypot(h.pos.x - e.pos.x, h.pos.z - e.pos.z) <= e.moveRange) {
        this.tryHitHero(e, e.moveDamage, true);
      }
      return;
    }

    // Cleave or Lunge melee strike with crimson demon sword-qi arc
    this.vfx.spawnSwordArc({
      pos: e.pos.clone().add(new THREE.Vector3(0, 1.15 * e.rig.scale, 0)),
      yaw: e.yaw,
      wide: e.kind === 'boss',
      scale: e.kind === 'boss' ? 1.45 : 1.0,
      colorCore: new THREE.Color(2.3, 0.55, 0.45),
      colorEdge: new THREE.Color(1.5, 0.15, 0.35),
    });

    const dx = h.pos.x - e.pos.x;
    const dz = h.pos.z - e.pos.z;
    const dist = Math.hypot(dx, dz);
    const diff = Math.abs(angleDiff(e.yaw, Math.atan2(dx, dz)));
    if (dist <= e.moveRange + h.radius && (diff < 1.15 || dist < 1.5)) {
      this.tryHitHero(e, e.moveDamage, e.moveUnblockable);
    }
    // Storm affix unleashes an electric shock ring pulse on melee strike
    if (e.affix === 'storm') {
      this.vfx.spawnShockRing(e.pos, new THREE.Color(1.35, 0.75, 2.4), 0.4, 3.6, 0.36);
      if (dist <= 3.5 + h.radius && diff >= 1.15) {
        this.tryHitHero(e, Math.round(e.moveDamage * 0.55), false);
      }
    }
  }

  private tryHitHero(attacker: EnemyEntity | null, dmg: number, unblockable: boolean): void {
    const h = this.hero;
    if (h.state === 'dead') return;

    // 1. Dodge Invulnerability -> Check Perfect Dodge!
    if (h.dodgeInvuln > 0) {
      if (!h.dodgePerfectTriggered && h.state === 'dodge') {
        h.dodgePerfectTriggered = true;
        h.spirit = Math.min(h.maxSpirit, h.spirit + 22);
        h.ult = Math.min(100, h.ult + 14);
        this.timeScale = 0.28;
        this.slowMoTimer = 0.22;
        this.audio.playDodge(true);
        this.vfx.spawnShockRing(h.pos, new THREE.Color(0.45, 2.1, 2.2), 0.25, 2.4, 0.35);
        this.spawnWorldCallout('极限闪避!', h.pos, 'info');
      }
      return;
    }

    if (h.hurtInvuln > 0) return;

    // 2. Guard & Perfect Parry (within 0.24s of raising sword, frontal cone)
    if (h.state === 'block' && !unblockable) {
      const fromYaw = attacker ? Math.atan2(attacker.pos.x - h.pos.x, attacker.pos.z - h.pos.z) : h.yaw;
      const frontal = Math.abs(angleDiff(h.yaw, fromYaw)) < 1.65;
      if (frontal) {
        if (h.blockElapsed <= 0.24) {
          // PERFECT PARRY!! (0 stamina cost, huge stagger + counter execution window!)
          h.parryCount += 1;
          h.spirit = Math.min(h.maxSpirit, h.spirit + 24);
          h.ult = Math.min(100, h.ult + 22);
          h.hitstopTimer = 0.13;
          this.audio.playParry();
          this.cameraRig.addShake(0.42);
          triggerHaptic('parry');
          const sparkPos = h.pos.clone().add(new THREE.Vector3(Math.sin(h.yaw) * 0.7, 1.25, Math.cos(h.yaw) * 0.7));
          this.vfx.spawnParryBurst(sparkPos);
          this.spawnWorldCallout('完美弹反!', h.pos, 'parry');

          if (attacker) {
            attacker.hitstopTimer = 0.14;
            attacker.poise = Math.min(attacker.maxPoise, attacker.poise + 55);
            attacker.telegraph?.dispose();
            attacker.telegraph = null;
            attacker.aiState = 'stagger';
            attacker.stateTime = 0;
            attacker.stateDuration = 1.8;
            h.counterTargetId = attacker.id;
            h.counterWindowTimer = 1.45;
          }
          return;
        }

        // Standard guard: consumes stamina, blocks damage, opens short counter window
        const stamCost = dmg * 1.4;
        h.stamina = Math.max(0, h.stamina - stamCost);
        this.audio.playBlock();
        this.vfx.spawnHitSparks(
          h.pos.clone().add(new THREE.Vector3(0, 1.15, 0)),
          new THREE.Vector3(0, 0.5, 0),
          new THREE.Color(2.0, 1.7, 0.9),
          10,
          this.rng,
        );
        if (h.stamina > 0) {
          if (attacker) {
            h.counterTargetId = attacker.id;
            h.counterWindowTimer = 0.85;
          }
          this.spawnWorldCallout('格挡', h.pos, 'info');
          return;
        }
        // Guard break -> falls through to hit
        this.spawnWorldCallout('破防!', h.pos, 'crit');
      }
    }

    // 3. Hero takes damage
    if (!this.godMode) {
      h.hp = Math.max(0, h.hp - dmg);
    }
    // Vampiric affix steals health on successful hit
    if (attacker && attacker.affix === 'vampiric' && attacker.aiState !== 'dead') {
      const leach = Math.max(12, Math.round(attacker.maxHp * 0.08));
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + leach);
      this.vfx.spawnShockRing(attacker.pos, new THREE.Color(2.1, 0.22, 0.48), 0.25, 1.8, 0.35);
      this.spawnWorldCallout(`嗜血 +${leach}`, attacker.pos, 'crit');
    }
    h.hurtInvuln = 0.48;
    h.comboCount = 0;
    h.rig.triggerHitFlash(1.0);
    this.audio.playHit(true);
    this.cameraRig.addShake(0.36);
    this.spawnWorldCallout(`-${dmg}`, h.pos, 'crit');

    if (h.hp <= 0) {
      h.state = 'dead';
      h.stateTime = 0;
      if (this.mp.isOnline() && this.mp.mode === 'coop' && this.peerHero && !this.peerHero.dead) {
        this.hud.showSubtitle('身受重伤！等待同伴靠近相援（或同伴清场）...', 5.0);
        return;
      }
      this.mode = 'defeat';
      this.hud.setMode('defeat');
      this.hud.showResult(false, this.runElapsed, h, {
        stageDef: getStageDef(this.currentStageNum),
        customTitle: this.stage === 'soloPvp' ? '切 磋 惜 败' : undefined,
        customSub: this.stage === 'soloPvp' ? '对方剑势更胜一筹，点击「重战本关」发起再来一局！' : undefined,
      });
    } else if (h.state !== 'skillR') {
      h.state = 'hit';
      h.stateTime = 0;
      h.stateDuration = 0.28;
      if (attacker) {
        const pushYaw = Math.atan2(h.pos.x - attacker.pos.x, h.pos.z - attacker.pos.z);
        h.vel.set(Math.sin(pushYaw) * 4.5, 0, Math.cos(pushYaw) * 4.5);
      } else {
        h.vel.set(0, 0, 0);
      }
    }
  }

  /** Allows Li Xiaoyao to slash enemy Yin Orbs straight back at enemies! */
  private tryDeflectProjectiles(reach: number, halfCone: number): void {
    const h = this.hero;
    for (const p of this.projectiles) {
      if (p.friendly || p.kind !== 'yinOrb') continue;
      const dx = p.pos.x - h.pos.x;
      const dz = p.pos.z - h.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > reach + p.radius) continue;
      if (Math.abs(angleDiff(h.yaw, Math.atan2(dx, dz))) > halfCone && dist > 1.2) continue;

      // Deflect orb back toward nearest enemy!
      p.friendly = true;
      p.age = 0;
      p.damage = 42;
      const tgt = this.findNearestEnemy(18);
      if (tgt) {
        const dir = new THREE.Vector3(tgt.pos.x - p.pos.x, 0, tgt.pos.z - p.pos.z).normalize();
        p.vel.copy(dir).multiplyScalar(17.5);
      } else {
        p.vel.negate().multiplyScalar(1.6);
      }
      // Recolor deflected orb to radiant jade-cyan
      p.mesh.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshBasicMaterial) {
          obj.material.color.setRGB(0.5, 2.25, 2.3);
        }
      });
      this.audio.playParry();
      this.vfx.spawnHitSparks(p.pos, new THREE.Vector3(0, 1, 0), new THREE.Color(0.55, 2.2, 2.3), 14, this.rng);
      this.spawnWorldCallout('剑返灵弹!', p.pos, 'parry');
    }
  }

  private updateProjectiles(dt: number): void {
    const h = this.hero;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age += dt;
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      if (p.kind === 'yinOrb') {
        p.mesh.rotation.y += dt * 6;
        p.mesh.rotation.x += dt * 4;
      }

      let remove = p.age >= p.maxAge || Math.hypot(p.pos.x, p.pos.z) > this.arena.playableRadius + 3;

      if (!remove && p.friendly) {
        for (const e of this.enemies) {
          if (e.aiState === 'dead' || p.hitIds.has(e.id)) continue;
          if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) <= e.radius + p.radius) {
            p.hitIds.add(e.id);
            const yaw = Math.atan2(p.vel.x, p.vel.z);
            this.damageEnemy(e, p.damage, p.kind === 'flyingSword', yaw, 24, p.kind === 'yinOrb');
            if (p.kind === 'yinOrb') {
              remove = true;
              break;
            }
          }
        }
        if (!remove && this.peerHero && this.peerHero.isEnemy && !this.peerHero.dead && !p.hitIds.has(-999)) {
          if (Math.hypot(this.peerHero.pos.x - p.pos.x, this.peerHero.pos.z - p.pos.z) <= this.peerHero.radius + p.radius) {
            p.hitIds.add(-999);
            const yaw = Math.atan2(p.vel.x, p.vel.z);
            this.hitSoloOpponent(28, 18, true, yaw, 'skillQ');
            remove = true;
          }
        }
      } else if (!remove && !p.friendly) {
        if (Math.hypot(h.pos.x - p.pos.x, h.pos.z - p.pos.z) <= h.radius + p.radius) {
          this.tryHitHero(null, p.damage, false);
          remove = true;
        }
      }

      if (remove) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  /** Soft body collision separation so characters never clip through one another (skipped during dodge). */
  private resolveEntitySeparation(): void {
    const h = this.hero;
    const heroSolid = h.state !== 'dodge' && h.state !== 'dead';

    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (a.aiState === 'dead') continue;

      if (heroSolid) {
        const dx = h.pos.x - a.pos.x;
        const dz = h.pos.z - a.pos.z;
        const minD = h.radius + a.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < minD * minD && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (minD - d) * 0.5;
          h.pos.x += (dx / d) * push;
          h.pos.z += (dz / d) * push;
          a.pos.x -= (dx / d) * push;
          a.pos.z -= (dz / d) * push;
        }
      }

      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (b.aiState === 'dead') continue;
        const dx = a.pos.x - b.pos.x;
        const dz = a.pos.z - b.pos.z;
        const minD = a.radius + b.radius + 0.15;
        const d2 = dx * dx + dz * dz;
        if (d2 < minD * minD && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (minD - d) * 0.5;
          a.pos.x += (dx / d) * push;
          a.pos.z += (dz / d) * push;
          b.pos.x -= (dx / d) * push;
          b.pos.z -= (dz / d) * push;
        }
      }
    }
  }

  private updateStageProgression(dt: number): void {
    if (this.stage === 'soloPvp') {
      if (this.peerHero && this.peerHero.dead && this.mode === 'playing') {
        this.stage = 'done';
        this.stageTimer = 0.9;
        this.audio.setMood('victory');
        this.hud.showSubtitle(`剑分高下！击败 ${this.peerHero.name}，独步锁妖剑台！`, 3.2);
      }
      return;
    }

    if (this.mp.isOnline() && this.mp.mode === 'coop' && this.mp.role === 'guest') {
      if (this.hero.state === 'dead' && this.peerHero && this.peerHero.dead && this.mode === 'playing') {
        this.mode = 'defeat';
        this.hud.setMode('defeat');
        this.hud.showResult(false, this.runElapsed, this.hero, { stageDef: getStageDef(this.currentStageNum) });
      }
      return;
    }

    const stDef = getStageDef(this.currentStageNum);
    if (this.stage === 'combat') {
      const anyAlive = this.enemies.some((e) => e.aiState !== 'dead');
      if (!anyAlive) {
        if (this.currentWaveIdx + 1 < stDef.waves.length) {
          this.stage = 'waveTransition';
          this.stageTimer = 1.65;
          this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + 42);
          this.hero.gourds = Math.min(this.hero.maxGourds, this.hero.gourds + 1);
          this.vfx.spawnHealVortex(this.hero.pos);
          const nextWave = stDef.waves[this.currentWaveIdx + 1];
          this.hud.showSubtitle(`第 ${this.currentWaveIdx + 1} 波肃清！回气补葫，${nextWave.label}将至！`, 2.2);
        } else {
          this.stage = 'done';
          this.stageTimer = 1.1;
          this.audio.setMood('victory');
          this.hud.showSubtitle(stDef.victoryLine, 3.0);
        }
      }
    } else if (this.stage === 'waveTransition') {
      this.stageTimer -= dt;
      if (this.stageTimer <= 0) {
        this.currentWaveIdx += 1;
        this.spawnCurrentWave(true);
      }
    } else if (this.stage === 'done') {
      this.stageTimer -= dt;
      if (this.stageTimer <= 0 && this.mode === 'playing') {
        this.mode = 'victory';
        this.hud.clearSubtitle();
        this.hud.setMode('victory');
        const isSolo = this.peerHero?.isEnemy;
        if (isSolo) {
          this.hud.showResult(true, this.runElapsed, this.hero, {
            customTitle: '独 步 蜀 山 · 单 挑 获 胜',
            customSub: '剑势如虹，力压群雄！点击「重战本关」可再来一局。',
          });
        } else {
          const starResult = evaluateStageStars(
            stDef,
            this.runElapsed,
            this.hero.hp / Math.max(1, this.hero.maxHp),
            this.hero.parryCount,
          );
          this.saveStore.recordClear(stDef.id, starResult.stars, this.runElapsed, this.hero.maxCombo);
          const nextStageId = stDef.id < 20 ? stDef.id + 1 : null;
          this.pendingBlessings = nextStageId ? pickBlessingChoices(this.rng, 3) : [];
          this.hud.syncCampaignProgress(this.saveStore, nextStageId ?? 20);
          this.hud.showResult(true, this.runElapsed, this.hero, {
            stageDef: stDef,
            starResult,
            blessingChoices: this.pendingBlessings,
            nextStageId,
          });
        }
      }
    }
  }

  private removePeerHero(): void {
    if (this.peerHero) {
      this.scene.remove(this.peerHero.rig.root);
      this.peerHero = null;
    }
  }

  private startMpMatch(info: {
    code: string;
    mode: 'coop' | 'solo';
    stage: number;
    role: 'host' | 'guest';
    hostName: string;
    guestName: string;
  }): void {
    this.audio.unlock();
    this.clearCombatEntities();
    this.removePeerHero();
    this.runElapsed = 0;
    this.timeScale = 1;
    this.slowMoTimer = 0;
    this.hud.setMpLobbyStatus('', true);

    const peerName = info.role === 'host' ? info.guestName : info.hostName;
    const myName = info.role === 'host' ? info.hostName : info.guestName;
    this.hud.setHeroName(myName);

    const isSolo = info.mode === 'solo';
    this.peerHero = createPeerHero(peerName, isSolo);
    this.scene.add(this.peerHero.rig.root);

    if (isSolo) {
      const startPos = info.role === 'host' ? new THREE.Vector3(0, 0, 6.4) : new THREE.Vector3(0, 0, -6.4);
      const startYaw = info.role === 'host' ? Math.PI : 0;
      const peerStart = info.role === 'host' ? new THREE.Vector3(0, 0, -6.4) : new THREE.Vector3(0, 0, 6.4);
      this.resetHero(startPos, startYaw);
      this.hero.rig.setWeaponDrawn(true);
      this.peerHero.pos.copy(peerStart);
      this.peerHero.targetPos.copy(peerStart);
      this.peerHero.yaw = info.role === 'host' ? 0 : Math.PI;
      this.peerHero.targetYaw = this.peerHero.yaw;
      this.peerHero.rig.root.position.copy(peerStart);
      this.peerHero.rig.root.rotation.y = this.peerHero.yaw;

      this.mode = 'playing';
      this.stage = 'soloPvp';
      this.currentStageNum = 20;
      this.applyChapterAtmosphere(10);
      this.audio.setMood('boss1');
      this.hud.setMode('playing');
      this.cameraRig.snapTo(this.hero.pos);
      this.hud.showStageBanner('1v1 联机单挑', `房间 ${info.code} · 剑台决胜`);
      this.hud.showSubtitle(`已匹配对手「${peerName}」，三段连招、弹反、御剑万剑全开！`, 3.4);
    } else {
      const stageNum = clamp(Math.floor(info.stage || 1), 1, 20);
      const stDef = getStageDef(stageNum);
      this.currentStageNum = stageNum;
      this.currentWaveIdx = 0;
      const myX = info.role === 'host' ? -1.6 : 1.6;
      const peerX = info.role === 'host' ? 1.6 : -1.6;
      this.resetHero(new THREE.Vector3(myX, 0, 8.6), Math.PI);
      this.hero.rig.setWeaponDrawn(true);
      this.peerHero.pos.set(peerX, 0, 8.6);
      this.peerHero.targetPos.set(peerX, 0, 8.6);
      this.peerHero.yaw = Math.PI;
      this.peerHero.targetYaw = Math.PI;
      this.peerHero.rig.root.position.copy(this.peerHero.pos);

      this.mode = 'playing';
      this.stage = 'combat';
      this.hud.setMode('playing');
      this.applyChapterAtmosphere(stageNum);
      this.cameraRig.snapTo(this.hero.pos);
      this.hud.showStageBanner(`双人组队 · 第 ${stageNum} 关`, `${stDef.name} · 与「${peerName}」共镇锁妖台`);

      if (info.role === 'host') {
        this.spawnCurrentWave(false);
      } else {
        this.audio.setMood(stDef.isBossStage ? 'boss1' : 'skirmish');
      }
    }
    this.hud.setMpHudBadge(`${isSolo ? 'Solo' : '组队'} · 房${info.code}`);
    this.hud.update(this.hero, this.getObjectiveLabel(), this.getActiveBoss(), this.peerHero);
  }

  private restartActiveMpMatch(): void {
    if (!this.peerHero) return;
    this.startMpMatch({
      code: this.mp.roomCode,
      mode: this.mp.mode === 'solo' ? 'solo' : 'coop',
      stage: this.currentStageNum,
      role: this.mp.role,
      hostName: this.mp.role === 'host' ? '李逍遥' : this.peerHero.name,
      guestName: this.mp.role === 'guest' ? '玄影剑侠' : this.peerHero.name,
    });
  }

  private applyPeerState(pkt: PeerTransformPacket): void {
    if (!this.peerHero) return;
    const p = this.peerHero;
    p.targetPos.set(pkt.x, 0, pkt.z);
    p.targetYaw = pkt.yaw;
    p.hp = pkt.hp;
    p.maxHp = pkt.maxHp || 180;
    p.spirit = pkt.spirit;
    p.ult = pkt.ult;
    p.state = pkt.state;
    p.pose = pkt.pose;
    p.blocking = pkt.blocking;
    p.dead = pkt.dead || pkt.hp <= 0;
  }

  private updatePeerHero(dt: number): void {
    const p = this.peerHero;
    if (!p) return;
    const lerpRate = Math.min(1, dt * 16);
    const prevX = p.pos.x;
    const prevZ = p.pos.z;
    p.pos.lerp(p.targetPos, lerpRate);
    p.yaw = dampAngle(p.yaw, p.targetYaw, 18, dt);
    p.rig.root.position.copy(p.pos);
    p.rig.root.rotation.y = p.yaw;

    const spd = Math.hypot(p.pos.x - prevX, p.pos.z - prevZ) / Math.max(0.008, dt);
    const poseName = (p.dead ? 'dead' : p.pose || (spd > 0.6 ? 'run' : 'combatIdle')) as PoseName;
    p.rig.applyPose(poseName, p.dead ? 1 : 0.45, this.elapsed, dt, spd);

    p.hpBarGroup.visible = !p.dead;
    p.hpBarGroup.quaternion.copy(this.camera.quaternion);
    p.hpFillMesh.scale.x = clamp(p.hp / p.maxHp, 0.001, 1);

    if (!p.isEnemy && p.dead && this.hero.state !== 'dead' && this.mp.isOnline()) {
      const dist = this.hero.pos.distanceTo(p.pos);
      if (dist < 2.6) {
        this.reviveAccum += dt;
        if (this.reviveAccum >= 1.1) {
          this.reviveAccum = 0;
          this.mp.sendRevive();
          this.vfx.spawnHealVortex(p.pos);
          this.spawnWorldCallout('已扶起同伴!', p.pos, 'heal');
        }
      } else {
        this.reviveAccum = 0;
      }
    }
  }

  private replayPeerAction(pkt: Record<string, unknown>): void {
    const p = this.peerHero;
    if (!p) return;
    const kind = String(pkt.kind || '');
    const yaw = Number(pkt.yaw ?? p.yaw);
    const x = Number(pkt.x ?? p.pos.x);
    const z = Number(pkt.z ?? p.pos.z);

    if (kind === 'attack') {
      const step = Number(pkt.step || 1);
      this.audio.playSwordSwing(step);
      this.vfx.spawnSwordArc({
        pos: new THREE.Vector3(x, 1.05, z),
        yaw,
        wide: step >= 2,
        tiltZ: step === 3 ? Math.PI * 0.5 : step === 2 ? 0.25 : -0.45,
        colorCore: p.isEnemy ? new THREE.Color(2.2, 0.85, 0.45) : new THREE.Color(0.65, 2.25, 1.95),
        colorEdge: p.isEnemy ? new THREE.Color(1.4, 0.25, 0.45) : new THREE.Color(0.22, 1.15, 1.05),
      });
    } else if (kind === 'skillQ') {
      this.audio.playSkillQ();
      const mesh = buildFlyingSwordMesh(p.isEnemy ? new THREE.Color(2.2, 0.55, 0.45) : new THREE.Color(0.45, 2.15, 1.75));
      const startPos = new THREE.Vector3(x + Math.sin(yaw) * 1.1, 1.15, z + Math.cos(yaw) * 1.1);
      mesh.position.copy(startPos);
      mesh.rotation.y = yaw;
      this.scene.add(mesh);
      this.projectiles.push({
        id: this.nextEntityId++,
        friendly: !p.isEnemy,
        kind: 'flyingSword',
        pos: startPos,
        vel: new THREE.Vector3(Math.sin(yaw) * 23, 0, Math.cos(yaw) * 23),
        radius: 0.01,
        damage: 0,
        age: 0,
        maxAge: 0.8,
        hitIds: new Set([-999]),
        mesh,
      });
    } else if (kind === 'skillE') {
      this.audio.playSkillE();
      const c = new THREE.Vector3(x, 0, z);
      this.vfx.spawnBaguaArray({
        pos: new THREE.Vector3(x, 0.08, z),
        radius: 4.5,
        color: p.isEnemy ? new THREE.Color(2.0, 0.45, 0.45) : new THREE.Color(0.35, 1.95, 1.75),
        duration: 1.5,
      });
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        this.vfx.spawnFallingSword({
          targetPos: new THREE.Vector3(c.x + Math.cos(ang) * 2.1, 0, c.z + Math.sin(ang) * 2.1),
          delay: i * 0.08,
          color: p.isEnemy ? new THREE.Color(2.2, 0.55, 0.45) : new THREE.Color(0.5, 2.1, 1.85),
        });
      }
    } else if (kind === 'skillR') {
      this.audio.playSkillR();
      this.vfx.spawnBaguaArray({
        pos: new THREE.Vector3(x, 0.1, z),
        radius: 6.2,
        color: new THREE.Color(2.2, 1.65, 0.45),
        duration: 1.9,
      });
      this.vfx.spawnFallingSword({ targetPos: new THREE.Vector3(x, 0, z), giant: true, delay: 0.05 });
    } else if (kind === 'heal') {
      this.audio.playHeal();
      this.vfx.spawnHealVortex(new THREE.Vector3(x, 0, z));
    }
  }

  private hitSoloOpponent(dmg: number, poise: number, heavy: boolean, yaw: number, skill: string): void {
    if (!this.peerHero || !this.peerHero.isEnemy || this.peerHero.dead) return;
    const h = this.hero;
    h.spirit = Math.min(h.maxSpirit, h.spirit + (heavy ? 12 : 7));
    h.ult = Math.min(100, h.ult + (heavy ? 14 : 7));
    h.comboCount += 1;
    h.comboDecayTimer = 3.2;
    h.maxCombo = Math.max(h.maxCombo, h.comboCount);
    h.totalDamage += dmg;

    this.peerHero.rig.triggerHitFlash(1.0);
    this.audio.playHit(heavy);
    triggerHaptic(heavy ? 'heavy' : 'light');
    this.cameraRig.addShake(heavy ? 0.34 : 0.15);
    this.vfx.spawnHitSparks(
      this.peerHero.pos.clone().add(new THREE.Vector3(0, 1.15, 0)),
      new THREE.Vector3(Math.cos(yaw), 0.25, -Math.sin(yaw)),
      heavy ? new THREE.Color(2.4, 1.9, 0.55) : new THREE.Color(0.8, 2.1, 2.2),
      heavy ? 16 : 10,
      this.rng,
    );
    this.spawnWorldCallout(`${dmg}`, this.peerHero.pos, heavy ? 'crit' : 'dmg');
    this.mp.sendPvpHit(dmg, poise, heavy, Math.sin(yaw) * (heavy ? 5.2 : 2.2), Math.cos(yaw) * (heavy ? 5.2 : 2.2), skill);
  }

  private handleIncomingPvpHit(pkt: { damage: number; poise: number; heavy: boolean; knockX: number; knockZ: number }): void {
    if (this.stage !== 'soloPvp' || this.mode !== 'playing') return;
    const h = this.hero;
    if (h.state === 'dead') return;
    if (h.dodgeInvuln > 0) {
      this.audio.playDodge(true);
      this.spawnWorldCallout('闪避!', h.pos, 'info');
      return;
    }
    if (h.state === 'block') {
      if (h.blockElapsed <= 0.24) {
        h.parryCount += 1;
        h.spirit = Math.min(h.maxSpirit, h.spirit + 26);
        h.ult = Math.min(100, h.ult + 22);
        this.audio.playParry();
        triggerHaptic('parry');
        this.vfx.spawnParryBurst(h.pos.clone().add(new THREE.Vector3(0, 1.2, 0)));
        this.spawnWorldCallout('完美弹反!', h.pos, 'parry');
        return;
      }
      const reduced = Math.max(4, Math.round(pkt.damage * 0.3));
      h.hp = Math.max(0, h.hp - reduced);
      this.audio.playBlock();
      this.spawnWorldCallout(`格挡 -${reduced}`, h.pos, 'info');
      if (h.hp <= 0) this.tryHitHero(null, 1, true);
      return;
    }
    this.tryHitHero(null, pkt.damage, false);
    if (h.hp > 0) {
      h.vel.set(pkt.knockX, 0, pkt.knockZ);
    }
  }

  private applyEnemySnapshotsFromHost(snaps: EnemyNetSnapshot[], stageNum: number): void {
    if (this.mp.role !== 'guest' || this.mp.mode !== 'coop') return;
    const seen = new Set<number>();
    for (const s of snaps) {
      seen.add(s.id);
      let e = this.enemies.find((x) => x.id === s.id);
      if (!e && s.aiState !== 'dead') {
        const kind = (s.kind === 'boss' || s.kind === 'elite' || s.kind === 'caster' ? s.kind : 'bladesman') as
          | 'bladesman'
          | 'caster'
          | 'elite'
          | 'boss';
        e = this.spawnEnemy(kind, s.x, s.z, s.id);
      }
      if (!e) continue;
      e.pos.lerp(new THREE.Vector3(s.x, 0, s.z), 0.45);
      e.yaw = s.yaw;
      e.hp = s.hp;
      e.maxHp = s.maxHp;
      e.poise = s.poise;
      e.maxPoise = s.maxPoise;
      e.phase = s.phase;
      e.aiState = s.aiState as EnemyEntity['aiState'];
      e.moveKind = s.moveKind as EnemyEntity['moveKind'];
      if (e.kind === 'boss' && e.phase === 2) e.rig.setPhase2(true);
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (!seen.has(this.enemies[i].id)) {
        this.scene.remove(this.enemies[i].rig.root);
        this.enemies.splice(i, 1);
      }
    }
    if (stageNum >= 1 && stageNum <= 20 && stageNum !== this.currentStageNum) {
      this.currentStageNum = stageNum;
      this.applyChapterAtmosphere(this.currentStageNum);
    }
  }

  private updateGuestEnemiesVisual(dt: number): void {
    for (const e of this.enemies) {
      e.rig.root.position.copy(e.pos);
      e.rig.root.rotation.y = e.yaw;
      const pose: PoseName =
        e.aiState === 'dead'
          ? 'dead'
          : e.aiState === 'windup'
            ? 'enemyWindup'
            : e.aiState === 'attack'
              ? e.moveKind === 'slam'
                ? 'bossSlam'
                : 'enemySlash'
              : e.aiState === 'stagger'
                ? 'stagger'
                : e.aiState === 'hit'
                  ? 'hit'
                  : 'run';
      e.rig.applyPose(pose, e.aiState === 'dead' ? 1 : 0.45, this.elapsed, dt, 3.2);
      if (e.hpBarGroup.visible) {
        e.hpBarGroup.quaternion.copy(this.camera.quaternion);
        e.hpFillMesh.scale.x = clamp(e.hp / e.maxHp, 0.001, 1);
      }
    }
  }

  private tickMultiplayerSync(dt: number): void {
    if (!this.mp.isOnline() || !this.mp.peerConnected) return;
    this.mpStateAccum += dt;
    if (this.mpStateAccum >= 0.05) {
      this.mpStateAccum = 0;
      const h = this.hero;
      const pose: PoseName =
        h.state === 'dead'
          ? 'dead'
          : h.state === 'attack'
            ? (h.comboStep === 1 ? 'combo1' : h.comboStep === 2 ? 'combo2' : 'combo3')
            : h.state === 'block'
              ? 'block'
              : h.state === 'dodge'
                ? 'dodge'
                : h.state === 'run'
                  ? 'run'
                  : 'combatIdle';
      this.mp.sendPlayerState({
        x: Number(h.pos.x.toFixed(2)),
        z: Number(h.pos.z.toFixed(2)),
        yaw: Number(h.yaw.toFixed(3)),
        hp: Math.round(h.hp),
        maxHp: h.maxHp,
        spirit: Math.round(h.spirit),
        ult: Math.round(h.ult),
        state: h.state,
        pose,
        combo: h.comboCount,
        blocking: h.state === 'block',
        dead: h.state === 'dead',
      });
      const ping = this.mp.getPingMs();
      this.hud.setMpHudBadge(`${this.mp.mode === 'solo' ? 'Solo' : '组队'} · 房${this.mp.roomCode}${ping ? ` · ${ping}ms` : ''}`);
    }

    if (this.mp.mode === 'coop' && this.mp.role === 'host') {
      this.mpEnemyAccum += dt;
      if (this.mpEnemyAccum >= 0.06) {
        this.mpEnemyAccum = 0;
        const snaps: EnemyNetSnapshot[] = this.enemies.map((e) => ({
          id: e.id,
          kind: e.kind,
          x: Number(e.pos.x.toFixed(2)),
          z: Number(e.pos.z.toFixed(2)),
          yaw: Number(e.yaw.toFixed(3)),
          hp: Math.round(e.hp),
          maxHp: e.maxHp,
          poise: Math.round(e.poise),
          maxPoise: e.maxPoise,
          aiState: e.aiState,
          phase: e.phase,
          moveKind: e.moveKind,
        }));
        this.mp.sendEnemySync(snaps, this.currentStageNum);
      }
    }
  }

  private spawnWorldCallout(
    text: string,
    worldPos: THREE.Vector3,
    kind: 'dmg' | 'crit' | 'parry' | 'heal' | 'info',
  ): void {
    const p = worldPos.clone();
    p.y += 1.9;
    p.project(this.camera);
    if (p.z > 1) return;
    const sx = (p.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-p.y * 0.5 + 0.5) * window.innerHeight;
    this.hud.spawnCallout(text, sx, sy, kind);
  }

  private installTestHooks(): void {
    // 1. threejs-game-skills QA inspector hooks
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: (value: number) => {
        this.rng = createSeededRandom(value);
      },
      setState: (name: string) => {
        if (name === 'title') {
          this.enterTitleMode();
        } else if (name === 'active-play') {
          this.startNewRun(false);
          // Step a brief combat beat so active-play capture shows live action
          this.hero.pos.set(0, 0, 2.8);
          this.hero.yaw = Math.PI;
          this.hero.rig.root.position.copy(this.hero.pos);
          this.startHeroAttack(1);
          this.stepFrame(0.18, false);
        } else if (name === 'boss-fight') {
          this.startNewRun(true);
          this.hero.pos.set(0, 0, 3.2);
          this.hero.yaw = Math.PI;
          this.hero.ult = 100;
          this.hero.rig.root.position.copy(this.hero.pos);
          this.vfx.spawnBaguaArray({
            pos: new THREE.Vector3(0, 0.08, -2.5),
            radius: 4.8,
            color: new THREE.Color(0.45, 1.9, 2.0),
            duration: 1.5,
          });
          this.startHeroAttack(2);
          this.stepFrame(0.22, false);
        } else if (name === 'showcase') {
          this.enterShowcaseMode();
        } else if (name === 'complete') {
          this.startNewRun(false);
          this.clearCombatEntities();
          this.hud.clearSubtitle();
          this.hero.pos.set(0, 0, 1.5);
          this.hero.yaw = 0;
          this.hero.rig.root.position.copy(this.hero.pos);
          this.hero.rig.root.rotation.y = 0;
          this.hero.parryCount = 5;
          this.hero.maxCombo = 14;
          this.hero.totalDamage = 840;
          this.runElapsed = 94;
          this.mode = 'victory';
          this.hud.setMode('victory');
          this.hud.showResult(true, this.runElapsed, this.hero);
        } else if (name === 'defeat') {
          this.startNewRun(false);
          this.hud.clearSubtitle();
          this.hero.hp = 0;
          this.hero.state = 'dead';
          this.mode = 'defeat';
          this.hud.setMode('defeat');
          this.hud.showResult(false, 48, this.hero);
        } else {
          throw new Error(`Unknown test state: ${name}`);
        }
        this.pipeline.render();
        this.publishDiagnostics();
        return { state: name };
      },
      setPausedForScreenshot: (paused: boolean) => {
        this.pausedForScreenshot = paused;
      },
      setReducedMotion: (enabled: boolean) => {
        this.reducedMotion = enabled;
        this.pipeline.render();
        this.publishDiagnostics();
      },
      hideDebugUi: (hidden: boolean) => {
        this.input.setDebugVisible(!hidden ? true : false);
      },
    };

    // 2. guizang-game-skill deterministic frame-stepping & verification hooks (`window.G`)
    window.G = {
      step: (n = 60, dt = 1 / 60) => {
        const prevPaused = this.pausedForScreenshot;
        this.pausedForScreenshot = false;
        const safeN = Math.min(n, 1000);
        for (let i = 0; i < safeN; i++) {
          this.stepFrame(dt, i === safeN - 1);
        }
        this.pausedForScreenshot = prevPaused;
      },
      upd: (n = 30, dt = 1 / 60) => {
        const prevPaused = this.pausedForScreenshot;
        this.pausedForScreenshot = false;
        this.stepLogicOnly(n, dt);
        this.pausedForScreenshot = prevPaused;
      },
      press: (...codes: string[]) => this.input.injectPress(...codes),
      keys: this.input.keys,
      pl: () => ({
        x: this.hero.pos.x,
        y: this.hero.pos.y,
        z: this.hero.pos.z,
        yaw: this.hero.yaw,
        hp: this.hero.hp,
        spirit: this.hero.spirit,
        stamina: this.hero.stamina,
        ult: this.hero.ult,
        state: this.hero.state,
        combo: this.hero.comboStep,
        gourds: this.hero.gourds,
      }),
      enemies: () =>
        this.enemies.map((e) => ({
          id: e.id,
          kind: e.kind,
          x: e.pos.x,
          z: e.pos.z,
          hp: e.hp,
          maxHp: e.maxHp,
          poise: e.poise,
          state: e.aiState,
        })),
      spawn: (kind: 'bladesman' | 'caster' | 'elite' | 'boss', x = 0, z = -3) => {
        this.spawnEnemy(kind, x, z);
      },
      toBoss: () => this.startNewRun(20, false),
      toStage: (s: number) => this.startNewRun(s, false),
      stageNum: () => this.currentStageNum,
      wave: () => this.currentWaveIdx + 1,
      totalStars: () => this.saveStore.getTotalStars(),
      openMap: (chapterId?: 1 | 2 | 3 | 4) => this.hud.openCampaignMap(chapterId),
      clearCurrentStage: () => {
        const stDef = getStageDef(this.currentStageNum);
        this.currentWaveIdx = stDef.waves.length - 1;
        for (const e of this.enemies) {
          e.hp = 0;
          e.aiState = 'dead';
          e.telegraph?.dispose();
          e.telegraph = null;
        }
      },
      god: (on = true) => {
        this.godMode = on;
      },
      mode: () => this.mode,
      stage: () => this.stage,
      peer: () =>
        this.peerHero
          ? {
              name: this.peerHero.name,
              isEnemy: this.peerHero.isEnemy,
              x: this.peerHero.pos.x,
              z: this.peerHero.pos.z,
              hp: this.peerHero.hp,
              dead: this.peerHero.dead,
            }
          : null,
      mpCreate: (mode: 'coop' | 'solo', stage = 1) => this.mp.createRoom(mode, stage, '李逍遥'),
      mpJoin: (code: string) => this.mp.joinRoom(code, '玄影剑侠'),
      mpRoom: () => this.mp.roomCode,
    };
  }

  private publishDiagnostics(): void {
    const stats = this.pipeline.getStats();
    const boss = this.getActiveBoss();
    const defeatedMobs = 3 - this.enemies.filter((e) => e.kind !== 'boss' && e.aiState !== 'dead').length;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: this.runElapsed,
      score: Math.max(0, defeatedMobs) + (boss && boss.aiState === 'dead' ? 1 : 0),
      targetScore: 4,
      complete: this.mode === 'victory',
      player: {
        position: { x: this.hero.pos.x, y: this.hero.pos.y, z: this.hero.pos.z },
        speed: this.hero.vel.length(),
      },
      renderer: {
        calls: stats.calls,
        triangles: stats.triangles,
        geometries: stats.geometries,
        textures: stats.textures,
      },
      canvas: {
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight,
        width: this.canvas.width,
        height: this.canvas.height,
        dpr: this.pipeline.renderer.getPixelRatio(),
      },
    };
  }
}

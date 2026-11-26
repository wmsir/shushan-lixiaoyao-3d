import * as THREE from 'three';
import { GameInput } from '../core/Input';
import { RenderPipeline } from '../core/RenderPipeline';
import { triggerHaptic } from '../core/NativeBridge';
import { ShushanArena } from '../world/ShushanArena';
import { VfxSystem } from '../vfx/VfxSystem';
import { AudioEngine } from '../systems/AudioEngine';
import { CameraRig } from '../systems/CameraRig';
import { HudController, type CombatThreatState, type ResultDisplayOptions, type ScreenMode } from '../ui/HudController';
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
  CampaignSaveStore,
  type DungeonDef,
  type StageDef,
  type StageHazardType,
  type RunBlessingState,
  applyBlessingToRun,
  BLESSINGS,
  createEmptyBlessings,
  evaluateStageStars,
  getChapterDef,
  getDungeonDef,
  getStageDef,
  getStageDialogue,
  getStageDialogueForStage,
  getSwordRealm,
  pickBlessingChoices,
} from './CampaignData';
import {
  type EquipRarity,
  type HeroLoadoutStats,
  type RolledGearItem,
  RARITY_LABELS,
  getEquippedSkinVisual,
  getEquippedWeaponVisual,
  rollEquipmentDrop,
} from './EquipmentData';
import { APP_VERSION } from '../version';
import {
  MultiplayerClient,
  type EnemyNetSnapshot,
  type PeerTransformPacket,
} from '../net/MultiplayerClient';
import { angleDiff, clamp, damp, dampAngle } from '../utils/math';
import { createSeededRandom } from '../utils/random';
import type { PoseName } from '../entities/CharacterRig';

type StagePhase = 'combat' | 'waveTransition' | 'bossTransition' | 'done';

interface ActiveHazardStrike {
  kind: Exclude<StageHazardType, 'none'>;
  pos: THREE.Vector3;
  radius: number;
  damage: number;
  elapsed: number;
  duration: number;
  telegraph: ReturnType<VfxSystem['createTelegraph']>;
}

const VALID_POSES = new Set<PoseName>([
  'idle',
  'combatIdle',
  'run',
  'combo1',
  'combo2',
  'combo3',
  'block',
  'parryCounter',
  'dodge',
  'castQ',
  'castE',
  'castR',
  'drink',
  'hit',
  'stagger',
  'dead',
  'enemyWindup',
  'enemySlash',
  'bossIntro',
  'bossSlam',
]);

function toPoseName(raw: string): PoseName {
  return VALID_POSES.has(raw as PoseName) ? (raw as PoseName) : 'combatIdle';
}

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
  private readonly mp: MultiplayerClient;
  private readonly saveStore = new CampaignSaveStore();
  private readonly targetRingMesh: THREE.Mesh;

  private rng = createSeededRandom(42);
  private hero: HeroState;
  private peer: PeerHeroState | null = null;
  private enemies: EnemyEntity[] = [];
  private projectiles: ProjectileEntity[] = [];
  private hazards: ActiveHazardStrike[] = [];
  private nextEntityId = 1;

  private mode: ScreenMode = 'title';
  private currentStageId = 1;
  private activeDungeon: DungeonDef | null = null;
  private stageDroppedGear: RolledGearItem[] = [];
  private currentWaveIdx = 0;
  private stagePhase: StagePhase = 'combat';
  private stageTimer = 0;
  private hazardTimer = 0;
  private blessings: RunBlessingState = createEmptyBlessings();
  private pendingCutsceneAfterDialogue = false;
  private shadowAttackActive = false;

  private frame = 0;
  private elapsed = 0;
  private runElapsed = 0;
  private timeScale = 1.0;
  private slowMoTimer = 0;
  private godMode = false;
  private pausedForScreenshot = false;
  private reducedMotion = false;

  // Co-op / Solo multiplayer sync timers & state
  private netStateTimer = 0;
  private netEnemyTimer = 0;
  private localHeroName = '李逍遥';
  private coopDowned = false;
  private pvpResultDecided = false;

  // Optional LoL RMB click-to-move ground destination
  private rmbMoveTarget: THREE.Vector3 | null = null;

  private rafId = 0;
  private lastNow = 0;
  private disposed = false;
  private lastSkillEFeedbackAt = -999;

  // Reusable math scratch vectors
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly aimPoint = new THREE.Vector3();
  private readonly moveVec = { x: 0, z: 0 };
  private readonly tmpVec = new THREE.Vector3();
  private readonly tmpVec2 = new THREE.Vector3();

  constructor(private readonly canvas: HTMLCanvasElement) {
    const params = new URLSearchParams(window.location.search);
    const urlForcedMute = params.has('mute') || params.has('auto');
    this.godMode = params.has('god');

    this.pipeline = new RenderPipeline(canvas, this.scene, this.camera);
    this.input = new GameInput(canvas);
    this.audio = new AudioEngine(urlForcedMute, !urlForcedMute);
    this.cameraRig = new CameraRig(this.camera);

    this.setupLighting();

    this.arena = new ShushanArena(this.rng);
    this.scene.add(this.arena.group);
    this.scene.add(this.vfx.group);

    this.targetRingMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.72, 0.88, 36),
      new THREE.MeshBasicMaterial({
        color: '#4cd9d0',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      }),
    );
    this.targetRingMesh.rotation.x = -Math.PI / 2;
    this.targetRingMesh.position.y = 0.06;
    this.targetRingMesh.visible = false;
    this.scene.add(this.targetRingMesh);

    this.hero = createHero();
    this.hero.rig.root.position.copy(this.hero.pos);
    this.hero.rig.root.rotation.y = this.hero.yaw;
    this.scene.add(this.hero.rig.root);
    this.applyCurrentLoadoutVisuals();

    this.mp = new MultiplayerClient({
      onStatus: (text, connected) => {
        this.hud.setMpLobbyStatus(text, connected, this.mp.mode !== 'offline');
      },
      onRoomCreated: (code, mode, stageId, quickMatch) => {
        const modeLabel = mode === 'solo' ? '1v1 单挑' : '双人组队';
        const prefix = quickMatch ? '快速匹配已建房' : `${modeLabel}房间已创建`;
        this.hud.setMpLobbyStatus(`${prefix} · 房间码【${code}】等待同门加入...`, true, true);
        this.hud.setMpHudBadge(`${modeLabel} · ${code}`);
        this.currentStageId = clamp(Math.floor(stageId), 1, 20);
      },
      onRoomReady: (info) => {
        this.localHeroName = info.role === 'host' ? info.hostName : info.guestName;
        const peerName = info.role === 'host' ? info.guestName : info.hostName;
        this.hud.setHeroName(this.localHeroName);
        this.hud.setMpLobbyStatus(
          `房间【${info.code}】已就绪：${info.hostName} vs ${info.guestName}`,
          true,
          true,
        );
        this.hud.setMpHudBadge(`${info.mode === 'solo' ? '1v1 Solo' : 'Co-op'} · ${info.code}`);
        this.startMultiplayerMatch(info.mode, clamp(Math.floor(info.stage), 1, 20), peerName);
      },
      onPeerState: (pkt) => this.handlePeerStatePacket(pkt),
      onPeerAction: (pkt) => this.handlePeerActionPacket(pkt),
      onEnemySync: (enemies, stageNum) => this.handleEnemySyncPacket(enemies, stageNum),
      onEnemyHitFromGuest: (pkt) => this.handleGuestEnemyHit(pkt),
      onPvpHit: (pkt) => this.handleIncomingPvpHit(pkt),
      onStageSync: (stageNum, bossIntro) => {
        if (this.mp.mode === 'coop' && this.mp.role === 'guest') {
          this.enterStage(clamp(Math.floor(stageNum), 1, 20), bossIntro, false);
        }
      },
      onPeerRevive: () => {
        if (this.mp.mode === 'coop' && this.coopDowned) {
          this.reviveLocalHero();
        }
      },
      onRematch: () => {
        if (this.mp.mode !== 'offline' && this.peer) {
          this.startMultiplayerMatch(
            this.mp.mode === 'solo' ? 'solo' : 'coop',
            this.mp.mode === 'solo' ? 20 : this.currentStageId,
            this.peer.name,
          );
        }
      },
      onPeerLeft: (reason) => {
        this.hud.setMpLobbyStatus(reason, true, false);
        this.hud.setMpHudBadge('');
        this.clearPeerHero();
        if (this.mode === 'playing' || this.mode === 'cutscene') {
          this.hud.showSubtitle(reason, 3.2);
          if (this.mp.mode === 'solo' && !this.pvpResultDecided) {
            this.pvpResultDecided = true;
            this.mode = 'victory';
            this.hud.setMode('victory');
            this.hud.showResult(true, this.runElapsed, this.hero, {
              customTitle: '不 战 而 胜',
              customSub: '对手已离台，你守住锁妖剑台。',
            });
          }
        }
      },
      onError: (msg) => {
        this.hud.setMpLobbyStatus(msg, false, this.mp.mode !== 'offline');
        if (this.mode === 'playing') this.hud.showSubtitle(msg, 2.5);
      },
    });

    this.hud = new HudController({
      onStart: (stageId) => {
        this.mp.leave();
        this.clearPeerHero();
        this.hud.setMpHudBadge('');
        this.hud.setHeroName('李逍遥');
        this.blessings = createEmptyBlessings();
        this.startNewRun(false, stageId, false, false);
      },
      onConfirmDialogue: () => {
        this.confirmStageDialogue();
      },
      onNextStage: (nextStageId, selectedBlessingId) => {
        if (selectedBlessingId) {
          const b = BLESSINGS.find((x) => x.id === selectedBlessingId);
          if (b) {
            this.blessings = applyBlessingToRun(this.blessings, b);
          }
        }
        this.startNewRun(false, nextStageId, true, false);
      },
      onRetry: () => {
        if (this.mp.mode !== 'offline' && this.mp.peerConnected && this.peer) {
          this.mp.sendRematch();
          this.startMultiplayerMatch(
            this.mp.mode === 'solo' ? 'solo' : 'coop',
            this.mp.mode === 'solo' ? 20 : this.currentStageId,
            this.peer.name,
          );
        } else if (this.activeDungeon) {
          this.startDungeon(this.activeDungeon.id, true);
        } else {
          this.startNewRun(false, this.currentStageId, this.blessings.ids.length > 0, true);
        }
      },
      onBackToTitle: () => {
        this.mp.leave();
        this.clearPeerHero();
        this.hud.setMpHudBadge('');
        this.hud.setMpLobbyStatus('', false, false);
        this.hud.setHeroName('李逍遥');
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
        this.rmbMoveTarget = null;
        return next;
      },
      onMpCreate: (mode, stageId) => {
        this.currentStageId = stageId;
        void this.mp.createRoom(mode, stageId, '李逍遥').catch(() => {});
      },
      onMpJoin: (code) => {
        void this.mp.joinRoom(code, '玄影剑侠').catch(() => {});
      },
      onMpQuick: (mode, stageId) => {
        this.currentStageId = stageId;
        void this.mp.quickMatch(mode, stageId, '蜀山侠客').catch(() => {});
      },
      onMpLeave: () => {
        this.mp.leave();
        this.clearPeerHero();
        this.hud.setMpLobbyStatus('已离开联机房间', false, false);
        this.hud.setMpHudBadge('');
      },
      onShopBuy: (itemId) => {
        const res = this.saveStore.buyItem(itemId);
        if (res.ok) {
          this.applyCurrentLoadoutVisuals();
          this.syncLiveHeroCapsFromLoadout();
          this.audio.playDropChime('spirit');
          triggerHaptic('medium');
          this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
        }
        return res;
      },
      onShopEquip: (itemId) => {
        const ok = this.saveStore.equipItem(itemId);
        if (ok) {
          this.applyCurrentLoadoutVisuals();
          this.syncLiveHeroCapsFromLoadout();
          this.audio.playDropChime('spirit');
          triggerHaptic('light');
          this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
        }
        return ok;
      },
      onShopUpgrade: (itemId) => {
        const res = this.saveStore.upgradeItem(itemId);
        if (res.ok) {
          this.applyCurrentLoadoutVisuals();
          this.syncLiveHeroCapsFromLoadout();
          this.audio.playParry();
          triggerHaptic('heavy');
          this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
        }
        return res;
      },
      onStartDungeon: (dungeonId) => {
        this.startDungeon(dungeonId);
      },
      onEquipRolled: (uid) => {
        const ok = this.saveStore.equipRolledItem(uid);
        if (ok) {
          this.applyCurrentLoadoutVisuals();
          this.syncLiveHeroCapsFromLoadout();
          this.audio.playDropChime('spirit');
          triggerHaptic('light');
          this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
        }
        return ok;
      },
      onUpgradeRolled: (uid) => {
        const res = this.saveStore.upgradeRolledItem(uid);
        if (res.ok) {
          this.applyCurrentLoadoutVisuals();
          this.syncLiveHeroCapsFromLoadout();
          this.audio.playParry();
          triggerHaptic('heavy');
          this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
        }
        return res;
      },
      onSalvageRolled: (uid) => {
        const res = this.saveStore.salvageRolledItem(uid);
        if (res.ok) {
          this.applyCurrentLoadoutVisuals();
          this.syncLiveHeroCapsFromLoadout();
          this.audio.playDropChime('heal');
          this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
        }
        return res;
      },
      onSalvageLow: (maxRarity) => {
        const res = this.saveStore.salvageLowRarity(maxRarity);
        if (res.count > 0) {
          this.audio.playDropChime('heal');
          this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
        }
        return res;
      },
      onClaimBounty: (bountyId) => {
        const res = this.saveStore.claimBounty(bountyId);
        if (res.ok) {
          if (res.droppedItem) this.audio.playGearDropChime(res.droppedItem.rarity);
          else this.audio.playDropChime('spirit');
          triggerHaptic('medium');
          this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
        }
        return res;
      },
    });

    this.hud.syncCampaignProgress(this.saveStore, this.saveStore.getRecommendedStage());

    window.addEventListener('keydown', this.onGlobalKey);
    canvas.addEventListener('webglcontextlost', this.onContextLost);

    this.installTestHooks();

    if (params.get('show') === 'char') {
      this.enterShowcaseMode();
    } else if (params.has('boss')) {
      this.hud.selectStage(20);
      this.startNewRun(true, 20, false, true);
    } else if (params.has('auto')) {
      this.startNewRun(false, 1, false, true);
    } else {
      this.enterTitleMode();
    }

    this.publishDiagnostics();
  }

  private setupLighting(): void {
    this.scene.background = new THREE.Color('#0c1522');
    this.scene.fog = new THREE.FogExp2('#101d2c', 0.0138);

    const hemi = new THREE.HemisphereLight('#8fb4d8', '#232026', 1.15);
    this.scene.add(hemi);

    const moonKey = new THREE.DirectionalLight('#d6e6fa', 2.45);
    moonKey.position.set(-15, 24, -18);
    moonKey.castShadow = true;
    moonKey.shadow.mapSize.set(2048, 2048);
    moonKey.shadow.camera.near = 2;
    moonKey.shadow.camera.far = 68;
    const sc = 22;
    moonKey.shadow.camera.left = -sc;
    moonKey.shadow.camera.right = sc;
    moonKey.shadow.camera.top = sc;
    moonKey.shadow.camera.bottom = -sc;
    moonKey.shadow.bias = -0.0005;
    this.scene.add(moonKey);

    const warmFill = new THREE.DirectionalLight('#ffcf9e', 0.92);
    warmFill.position.set(11, 10, 15);
    this.scene.add(warmFill);
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
    if (this.mp.mode !== 'offline') {
      this.hud.showSubtitle('联机模式剑势不停，可点击返回大厅退出房间', 2.0);
      return;
    }
    if (this.mode === 'playing') {
      this.mode = 'paused';
      this.hud.setMode('paused');
    } else if (this.mode === 'paused') {
      this.mode = 'playing';
      this.hud.setMode('playing');
    }
  }

  private getActiveStageDef(): StageDef {
    return this.activeDungeon ? this.activeDungeon.stageDef : getStageDef(this.currentStageId);
  }

  private getLoadoutStats(): HeroLoadoutStats {
    return this.saveStore.getLoadoutStats();
  }

  private applyCurrentLoadoutVisuals(): void {
    const equipped = this.saveStore.getEquipped();
    this.hero.rig.applyHeroAppearance(
      getEquippedSkinVisual(equipped),
      getEquippedWeaponVisual(equipped, this.saveStore.getInventory()),
    );
  }

  private syncLiveHeroCapsFromLoadout(): void {
    const realm = getSwordRealm(this.saveStore.getTotalStars());
    const loadout = this.getLoadoutStats();
    const h = this.hero;
    const prevMaxHp = h.maxHp;
    const nextMaxHp = 180 + realm.hpBonus + loadout.maxHpBonus + this.blessings.maxHpBonus;
    h.maxHp = nextMaxHp;
    if (nextMaxHp > prevMaxHp) {
      h.hp = Math.min(h.maxHp, h.hp + (nextMaxHp - prevMaxHp));
      h.delayedHp = h.hp;
    } else {
      h.hp = Math.min(h.maxHp, h.hp);
      h.delayedHp = Math.min(h.maxHp, h.delayedHp);
    }
    const nextMaxGourds = 3 + loadout.gourdBonus + this.blessings.extraGourds;
    if (nextMaxGourds > h.maxGourds) {
      h.gourds += nextMaxGourds - h.maxGourds;
    }
    h.maxGourds = nextMaxGourds;
    h.gourds = Math.min(h.maxGourds, h.gourds);
  }

  private enterTitleMode(): void {
    this.clearCombatEntities();
    this.activeDungeon = null;
    this.stageDroppedGear = [];
    this.targetRingMesh.visible = false;
    this.pendingCutsceneAfterDialogue = false;
    this.resetHero(new THREE.Vector3(0, 0, 2.2), Math.PI);
    this.applyCurrentLoadoutVisuals();
    this.hero.rig.setWeaponDrawn(false);
    this.arena.setStageTheme(1);
    this.scene.background = new THREE.Color('#0c1522');
    this.scene.fog = new THREE.FogExp2('#101d2c', 0.0138);
    this.mode = 'title';
    this.stagePhase = 'combat';
    this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
    this.hud.setMode('title');
    this.audio.setMood('title');
    this.cameraRig.updateTitleOrbit(this.hero.pos, this.elapsed);
  }

  private enterShowcaseMode(): void {
    this.clearCombatEntities();
    this.targetRingMesh.visible = false;
    this.resetHero(new THREE.Vector3(-0.95, 0, 0.55), 0.16);
    this.applyCurrentLoadoutVisuals();
    this.hero.rig.setWeaponDrawn(true);
    const demoBoss = this.spawnEnemy('boss', 1.15, -0.35);
    demoBoss.yaw = -0.22;
    demoBoss.rig.root.rotation.y = -0.22;
    demoBoss.hpBarGroup.visible = false;
    demoBoss.aiState = 'orbit';
    demoBoss.rig.applyPose('combatIdle', 0, 0, 0.016, 0);
    this.mode = 'showcase';
    this.hud.setMode('showcase');
    this.cameraRig.updateShowcase(new THREE.Vector3(0.1, 0, 0.25), 0);
  }

  private startNewRun(jumpToBoss: boolean, stageId = 1, keepBlessings = false, skipDialogue = false): void {
    this.audio.unlock();
    this.clearCombatEntities();
    this.activeDungeon = null;
    this.stageDroppedGear = [];
    if (!keepBlessings) {
      this.blessings = createEmptyBlessings();
    }
    const targetStage = jumpToBoss ? 20 : clamp(Math.floor(stageId), 1, 20);
    this.saveStore.setLastPlayed(targetStage);
    this.resetHero(new THREE.Vector3(0, 0, jumpToBoss ? 7.2 : 8.8), Math.PI);
    this.applyCurrentLoadoutVisuals();
    this.hero.rig.setWeaponDrawn(true);
    this.runElapsed = 0;
    this.timeScale = 1;
    this.slowMoTimer = 0;
    this.coopDowned = false;
    this.pvpResultDecided = false;

    this.enterStage(targetStage, !jumpToBoss, true, jumpToBoss, !skipDialogue && !jumpToBoss);
    this.cameraRig.snapTo(this.hero.pos);
    this.hud.update(this.hero, this.getObjectiveLabel(), this.getActiveBoss(), this.peer);
  }

  startDungeon(dungeonId: string, skipDialogue = false): void {
    this.mp.leave();
    this.clearPeerHero();
    this.hud.setMpHudBadge('');
    this.hud.setHeroName('李逍遥');
    const dungeon = getDungeonDef(dungeonId);
    this.audio.unlock();
    this.clearCombatEntities();
    this.activeDungeon = dungeon;
    this.stageDroppedGear = [];
    this.blessings = createEmptyBlessings();
    this.resetHero(new THREE.Vector3(0, 0, 8.8), Math.PI);
    this.applyCurrentLoadoutVisuals();
    this.hero.rig.setWeaponDrawn(true);
    this.runElapsed = 0;
    this.timeScale = 1;
    this.slowMoTimer = 0;
    this.coopDowned = false;
    this.pvpResultDecided = false;

    this.enterStage(dungeon.stageDef.id, true, true, false, !skipDialogue);
    this.cameraRig.snapTo(this.hero.pos);
    this.hud.update(this.hero, this.getObjectiveLabel(), this.getActiveBoss(), this.peer);
  }

  confirmStageDialogue(): boolean {
    if (this.mode !== 'dialogue') return false;
    this.audio.unlock();
    this.audio.playDropChime('spirit');
    const boss = this.getActiveBoss();
    if (this.pendingCutsceneAfterDialogue && boss) {
      this.pendingCutsceneAfterDialogue = false;
      this.mode = 'cutscene';
      this.hud.setMode('cutscene');
      this.audio.setDucked(true);
      this.cameraRig.startCutscene(boss.pos, 2.55);
      const stageDef = this.getActiveStageDef();
      const chDef = getChapterDef(stageDef.chapter);
      const kicker = this.activeDungeon ? `秘境打宝 · ${this.activeDungeon.name}` : `${chDef.roman} · 第 ${stageDef.id} 关`;
      this.hud.showStageBanner(kicker, `${stageDef.name} · ${stageDef.subtitle}`, 1.3);
    } else {
      this.mode = 'playing';
      this.hud.setMode('playing');
    }
    return true;
  }

  private startMultiplayerMatch(mode: 'coop' | 'solo', stageId: number, peerName: string): void {
    this.audio.unlock();
    this.clearCombatEntities();
    this.clearPeerHero();
    this.activeDungeon = null;
    this.stageDroppedGear = [];
    this.blessings = createEmptyBlessings();
    this.runElapsed = 0;
    this.timeScale = 1;
    this.slowMoTimer = 0;
    this.coopDowned = false;
    this.pvpResultDecided = false;

    const isHost = this.mp.role === 'host';
    const isSolo = mode === 'solo';

    const heroPos = isSolo
      ? new THREE.Vector3(0, 0, isHost ? 6.5 : -6.5)
      : new THREE.Vector3(isHost ? -1.4 : 1.4, 0, 8.6);
    const heroYaw = isSolo ? (isHost ? Math.PI : 0) : Math.PI;
    this.resetHero(heroPos, heroYaw);
    this.hero.rig.setWeaponDrawn(true);

    const peer = createPeerHero(peerName, isSolo);
    const peerStart = isSolo
      ? new THREE.Vector3(0, 0, isHost ? -6.5 : 6.5)
      : new THREE.Vector3(isHost ? 1.4 : -1.4, 0, 8.6);
    const peerYaw = isSolo ? (isHost ? 0 : Math.PI) : Math.PI;
    peer.pos.copy(peerStart);
    peer.targetPos.copy(peerStart);
    peer.yaw = peerYaw;
    peer.targetYaw = peerYaw;
    peer.rig.root.position.copy(peerStart);
    peer.rig.root.rotation.y = peerYaw;
    peer.rig.setWeaponDrawn(true);
    this.scene.add(peer.rig.root);
    this.peer = peer;

    if (isSolo) {
      this.currentStageId = 20;
      this.stagePhase = 'combat';
      const ch = getChapterDef(4);
      this.arena.setStageTheme(20, ch);
      this.scene.background = new THREE.Color(ch.bgHex);
      this.scene.fog = new THREE.FogExp2(ch.fogHex, 0.0138);
      this.mode = 'playing';
      this.hud.setMode('playing');
      this.audio.setMood('boss1');
      this.hud.showStageBanner('锁妖剑台 · 1v1 切磋', `${this.localHeroName} 对阵 ${peerName}`, 1.4);
      this.hud.showSubtitle('以剑会友，善用四段连招、0.26秒完美弹反与三大剑诀！', 2.4);
      this.vfx.spawnBaguaArray({
        pos: new THREE.Vector3(0, 0.08, 0),
        radius: 6.2,
        color: new THREE.Color(0.45, 1.9, 2.1),
        duration: 2.2,
      });
    } else {
      this.enterStage(clamp(Math.floor(stageId), 1, 20), false, isHost);
      this.hud.showSubtitle(`同门【${peerName}】已入剑阵，合力破妖！`, 3.0);
    }
    this.cameraRig.snapTo(this.hero.pos);
    this.hud.update(this.hero, this.getObjectiveLabel(), this.getActiveBoss(), this.peer);
  }

  private clearPeerHero(): void {
    if (this.peer) {
      this.scene.remove(this.peer.rig.root);
      this.peer = null;
    }
  }

  private enterStage(
    stageId: number,
    withCutscene: boolean,
    spawnAuthority = true,
    jumpLastWave = false,
    showDialogue = false,
  ): void {
    this.clearCombatEntities();
    this.currentStageId = this.activeDungeon ? this.activeDungeon.stageDef.id : clamp(Math.floor(stageId), 1, 20);
    const stageDef = this.getActiveStageDef();
    const chDef = getChapterDef(stageDef.chapter);
    this.currentWaveIdx = jumpLastWave ? stageDef.waves.length - 1 : 0;
    this.stagePhase = 'combat';
    this.stageTimer = 0;
    this.hazardTimer = stageDef.hazardIntervalSec ? stageDef.hazardIntervalSec * 0.75 : 0;
    this.pendingCutsceneAfterDialogue = false;

    this.arena.setStageTheme(this.activeDungeon ? stageDef.chapter * 5 : this.currentStageId, chDef);
    this.scene.background = new THREE.Color(chDef.bgHex);
    this.scene.fog = new THREE.FogExp2(chDef.fogHex, 0.0138);

    const realm = getSwordRealm(this.saveStore.getTotalStars());
    this.hud.setRealmAndBlessings(realm.title, this.blessings.ids.length);

    if (stageDef.isBossStage) {
      this.audio.setMood('boss1');
    } else {
      this.audio.setMood(stageDef.chapter >= 3 ? 'boss1' : 'skirmish');
    }

    if (spawnAuthority) {
      if (showDialogue && this.mp.mode === 'offline') {
        this.spawnWave(stageDef, this.currentWaveIdx, false);
        const bossEntity = this.getActiveBoss();
        const isFinalBossWave = this.currentWaveIdx === stageDef.waves.length - 1 && stageDef.bossCutscene && bossEntity;
        this.pendingCutsceneAfterDialogue = Boolean(withCutscene && isFinalBossWave);
        this.mode = 'dialogue';
        const dlg = this.activeDungeon
          ? getStageDialogueForStage(stageDef, false)
          : getStageDialogue(this.currentStageId);
        this.hud.showStageDialogue(dlg);
      } else {
        this.spawnWave(stageDef, this.currentWaveIdx, withCutscene);
      }
    } else {
      this.mode = 'playing';
      this.hud.setMode('playing');
    }
  }

  private spawnWave(stageDef: StageDef, waveIdx: number, allowCutscene: boolean): void {
    const wave = stageDef.waves[waveIdx];
    if (!wave) return;

    this.hud.clearSubtitle();

    let bossEntity: EnemyEntity | null = null;
    for (const spec of wave.enemies) {
      const overrides: EnemyCreateOverrides = {
        name: spec.name,
        hpMult: spec.hpMult,
        poiseMult: spec.poiseMult,
        dmgMult: spec.dmgMult,
        speedMult: spec.speedMult,
        scaleMult: spec.scaleMult,
        affix: spec.affix,
      };
      const e = this.spawnEnemy(spec.kind, spec.x, spec.z, undefined, overrides);
      if (spec.kind === 'boss') bossEntity = e;
    }

    const isFinalBossWave = waveIdx === stageDef.waves.length - 1 && stageDef.bossCutscene && bossEntity;
    if (isFinalBossWave && bossEntity) {
      if (this.hero.pos.z < 4.5) {
        this.hero.pos.set(0, 0, 8.2);
        this.hero.rig.root.position.copy(this.hero.pos);
      }
      this.hero.yaw = Math.PI;
      this.hero.rig.root.rotation.y = this.hero.yaw;

      this.vfx.spawnBaguaArray({
        pos: new THREE.Vector3(0, 0.08, -4.5),
        radius: 5.4,
        color: new THREE.Color(1.4, 0.25, 0.45),
        duration: 2.5,
      });
      this.vfx.spawnShockRing(new THREE.Vector3(0, 0.1, -4.5), new THREE.Color(2.0, 0.35, 0.55), 0.6, 8.5, 0.7);
      this.vfx.spawnGroundCrater(new THREE.Vector3(0, 0, -4.5), 4.2, new THREE.Color(1.9, 0.28, 0.48), 4.5);
      this.cameraRig.addShake(0.65);

      if (allowCutscene) {
        const chDef = getChapterDef(stageDef.chapter);
        this.mode = 'cutscene';
        this.hud.setMode('cutscene');
        this.audio.setDucked(true);
        this.cameraRig.startCutscene(bossEntity.pos, 2.55);
        this.hud.showStageBanner(`${chDef.roman} · 第 ${stageDef.id} 关`, `${stageDef.name} · ${stageDef.subtitle}`, 1.3);
      } else {
        bossEntity.aiState = 'orbit';
        bossEntity.stateTime = 0;
        this.mode = 'playing';
        this.hud.setMode('playing');
      }
    } else {
      if (bossEntity) {
        bossEntity.aiState = 'orbit';
        bossEntity.stateTime = 0;
      }
      this.mode = 'playing';
      this.hud.setMode('playing');
    }
  }

  private resetHero(pos: THREE.Vector3, yaw: number): void {
    const realm = getSwordRealm(this.saveStore.getTotalStars());
    const loadout = this.getLoadoutStats();
    const h = this.hero;
    h.maxHp = 180 + realm.hpBonus + loadout.maxHpBonus + this.blessings.maxHpBonus;
    h.maxGourds = 3 + loadout.gourdBonus + this.blessings.extraGourds;
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
    h.shadowStrikeTimer = 0;
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
    h.stageJadeEarned = 0;
    this.shadowAttackActive = false;
    h.rig.root.position.copy(pos);
    h.rig.root.rotation.y = yaw;
    h.rig.applyPose('combatIdle', 0, 0, 0.016, 0);
    this.rmbMoveTarget = null;
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
    for (const hz of this.hazards) {
      hz.telegraph.dispose();
    }
    this.hazards = [];
    this.vfx.clearAll();
  }

  private spawnEnemy(
    kind: 'bladesman' | 'caster' | 'elite' | 'boss',
    x: number,
    z: number,
    forcedId?: number,
    overrides?: EnemyCreateOverrides,
  ): EnemyEntity {
    const pos = new THREE.Vector3(x, 0, z);
    this.arena.constrainPosition(pos, kind === 'boss' ? 1.0 : kind === 'elite' ? 0.75 : 0.6);
    const id = forcedId ?? this.nextEntityId++;
    if (forcedId !== undefined && forcedId >= this.nextEntityId) {
      this.nextEntityId = forcedId + 1;
    }
    const enemy = createEnemy(id, kind, pos, this.rng, overrides);
    enemy.yaw = Math.atan2(this.hero.pos.x - pos.x, this.hero.pos.z - pos.z);
    enemy.rig.root.rotation.y = enemy.yaw;
    this.scene.add(enemy.rig.root);
    this.enemies.push(enemy);
    return enemy;
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
    if (this.mp.mode === 'solo' && this.peer) {
      return `1v1 · ${this.peer.name}`;
    }
    const stageDef = this.getActiveStageDef();
    if (this.stagePhase === 'waveTransition' || this.stagePhase === 'bossTransition') {
      return `波次 ${Math.min(stageDef.waves.length, this.currentWaveIdx + 2)}/${stageDef.waves.length} · 备战`;
    }
    if (this.stagePhase === 'done') {
      return `波次 ${stageDef.waves.length}/${stageDef.waves.length} · 已清`;
    }
    const alive = this.enemies.filter((e) => e.aiState !== 'dead').length;
    return `波次 ${this.currentWaveIdx + 1}/${stageDef.waves.length} · 剩 ${alive}`;
  }

  stepFrame(rawDt: number, doRender = true): void {
    this.frame += 1;
    this.pipeline.resize(false);
    this.pipeline.tickAdaptiveDpr(rawDt, doRender && !this.pausedForScreenshot && this.mode === 'playing');

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
      this.hero.rig.applyPose('combatIdle', 0, this.elapsed, animDt, 0);
      for (const e of this.enemies) e.rig.applyPose('combatIdle', 0, this.elapsed, animDt, 0);
      this.arena.update(animDt, this.elapsed, this.hero.pos);
      this.cameraRig.updateShowcase(new THREE.Vector3(0.1, 0, 0.25), this.elapsed);
      if (doRender) this.pipeline.render();
      this.input.endFrame();
      this.publishDiagnostics();
      return;
    }

    if (this.mode === 'dialogue') {
      const lead = this.enemies.find((e) => e.aiState !== 'dead') ?? null;
      if (lead) {
        lead.yaw = Math.atan2(this.hero.pos.x - lead.pos.x, this.hero.pos.z - lead.pos.z);
        lead.rig.root.rotation.y = lead.yaw;
        this.hero.yaw = Math.atan2(lead.pos.x - this.hero.pos.x, lead.pos.z - this.hero.pos.z);
        this.hero.rig.root.rotation.y = this.hero.yaw;
      }
      this.hero.rig.applyPose('combatIdle', 0, this.elapsed, animDt, 0);
      for (const e of this.enemies) {
        e.rig.applyPose('combatIdle', 0, this.elapsed, animDt, 0);
        if (e.hpBarGroup.visible) e.hpBarGroup.quaternion.copy(this.camera.quaternion);
      }
      this.targetRingMesh.visible = false;
      this.arena.update(animDt, this.elapsed, this.hero.pos);
      this.cameraRig.updateGameplay(rawDt, this.elapsed, this.hero.pos, lead?.pos ?? null, { x: 0, y: 0 });
      this.audio.updateMusic(rawDt);
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
      this.updatePeerHero(dt);
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
      this.updateHero(dt, rawDt);
      this.updatePeerHero(dt);

      if (this.mp.mode !== 'solo') {
        if (this.mp.mode === 'offline' || this.mp.role === 'host') {
          this.updateEnemies(dt);
          this.updateStageHazards(dt);
        } else {
          this.updateGuestEnemiesVisual(dt);
        }
      }

      this.updateProjectiles(dt);
      this.resolveEntitySeparation();
      this.updateStageProgression(dt);
      this.tickMultiplayerSync(rawDt);

      this.vfx.update(
        dt,
        this.elapsed,
        this.hero.pos,
        (kind, gearItem) => this.onCollectDrop(kind, gearItem),
        (kind) => {
          if (kind !== 'gear') this.audio.playDropChime(kind);
        },
      );
      this.arena.update(dt, this.elapsed, this.hero.pos);
      const boss = this.getActiveBoss();
      const focusPos =
        this.mp.mode === 'solo' && this.peer && !this.peer.dead
          ? this.peer.pos
          : boss && boss.kind === 'boss' && boss.aiState !== 'dead'
            ? boss.pos
            : null;
      this.cameraRig.updateGameplay(rawDt, this.elapsed, this.hero.pos, focusPos, this.input.mouseNdc);
      this.arena.updateOcclusion(this.camera.position, this.hero.pos, rawDt);
      const threat = this.updateTargetRingAndThreat(rawDt);
      this.hud.update(this.hero, this.getObjectiveLabel(), boss, this.peer, threat);
    } else {
      this.targetRingMesh.visible = false;
      this.updatePeerHero(dt * 0.5);
      this.vfx.update(dt * 0.5, this.elapsed, this.hero.pos);
      this.arena.update(dt * 0.5, this.elapsed, this.hero.pos);
      this.cameraRig.updateGameplay(rawDt, this.elapsed, this.hero.pos, null, { x: 0, y: 0 });
    }

    const aliveCount = this.enemies.filter((e) => e.aiState !== 'dead').length;
    this.input.updateDebugPanel(
      `stage: ${this.currentStageId} wave: ${this.currentWaveIdx + 1} (${this.stagePhase})  mp: ${this.mp.mode}/${this.mp.role}\n` +
        `state: ${this.hero.state} (combo ${this.hero.comboStep})  mode: ${this.mode}\n` +
        `pos: (${this.hero.pos.x.toFixed(2)}, ${this.hero.pos.z.toFixed(2)})  hp: ${Math.ceil(this.hero.hp)}/${this.hero.maxHp}  mobs: ${aliveCount}`,
    );

    if (doRender) this.pipeline.render();
    this.input.endFrame();
    this.publishDiagnostics();
  }

  stepLogicOnly(frames = 30, dt = 1 / 60): void {
    for (let i = 0; i < frames; i++) {
      this.stepFrame(dt, false);
    }
  }

  private getAimYaw(): number {
    if (this.input.touchActive || !this.input.mouseMoved) {
      const tgt = this.findCombatTarget(15);
      if (tgt) return Math.atan2(tgt.x - this.hero.pos.x, tgt.z - this.hero.pos.z);
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

  private findCombatTarget(
    maxRange: number,
    preferredYaw?: number,
  ): { x: number; z: number; radius: number; enemy: EnemyEntity | null; isPvpPeer: boolean } | null {
    if (this.mp.mode === 'solo' && this.peer && !this.peer.dead) {
      const dist = Math.hypot(this.peer.pos.x - this.hero.pos.x, this.peer.pos.z - this.hero.pos.z);
      if (dist <= maxRange) {
        return { x: this.peer.pos.x, z: this.peer.pos.z, radius: this.peer.radius, enemy: null, isPvpPeer: true };
      }
    }
    const e = this.findNearestEnemy(maxRange, preferredYaw);
    if (!e) return null;
    return { x: e.pos.x, z: e.pos.z, radius: e.radius, enemy: e, isPvpPeer: false };
  }

  private updateHero(dt: number, rawDt = dt): void {
    const h = this.hero;
    const realm = getSwordRealm(this.saveStore.getTotalStars());
    const loadout = this.getLoadoutStats();

    if (h.delayedHp > h.hp) {
      h.delayedHp = Math.max(h.hp, h.delayedHp - dt * 55);
    } else {
      h.delayedHp = h.hp;
    }

    h.cdQ = Math.max(0, h.cdQ - dt);
    h.cdE = Math.max(0, h.cdE - dt);
    h.cdR = Math.max(0, h.cdR - dt);
    h.cdHeal = Math.max(0, h.cdHeal - dt);
    h.dodgeInvuln = Math.max(0, h.dodgeInvuln - dt);
    h.hurtInvuln = Math.max(0, h.hurtInvuln - dt);
    h.comboWindowTimer = Math.max(0, h.comboWindowTimer - dt);
    h.counterWindowTimer = Math.max(0, h.counterWindowTimer - dt);
    h.shadowStrikeTimer = Math.max(0, h.shadowStrikeTimer - dt);
    if (h.counterWindowTimer <= 0) h.counterTargetId = null;

    if (h.comboDecayTimer > 0) {
      h.comboDecayTimer -= dt;
      if (h.comboDecayTimer <= 0) h.comboCount = 0;
    }

    h.spirit = Math.min(h.maxSpirit, h.spirit + dt * 6.5 * realm.spiritRegenMult * loadout.spiritRegenMult);
    if (h.state !== 'block' && h.state !== 'dodge') {
      h.stamina = Math.min(h.maxStamina, h.stamina + dt * 28);
    }

    const anyThreat =
      this.enemies.some((e) => e.aiState !== 'dead') || (this.mp.mode === 'solo' && Boolean(this.peer && !this.peer.dead));
    if (anyThreat || h.state !== 'idle') {
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

    if (this.mp.mode === 'coop' && this.peer && this.peer.dead && !this.coopDowned) {
      const dPeer = Math.hypot(this.peer.pos.x - h.pos.x, this.peer.pos.z - h.pos.z);
      if (dPeer <= 2.75) {
        this.mp.sendRevive();
        this.peer.dead = false;
        this.peer.hp = this.peer.maxHp * 0.5;
        this.vfx.spawnHealVortex(this.peer.pos);
        this.audio.playHeal();
        this.spawnWorldCallout('同门援护!', this.peer.pos, 'heal');
        triggerHaptic('medium');
      }
    }

    const canDodgeNow = h.state !== 'hit' && h.state !== 'skillR' && h.state !== 'parryCounter' && h.stamina >= 24;
    if (canDodgeNow && this.input.consumeAction('dodge')) {
      this.rmbMoveTarget = null;
      this.startHeroDodge();
      return;
    }

    if (h.hitstopTimer > 0) {
      h.hitstopTimer = Math.max(0, h.hitstopTimer - rawDt);
      return;
    }

    this.input.getMoveVector(this.moveVec);
    if (Math.hypot(this.moveVec.x, this.moveVec.z) > 0.08) {
      this.rmbMoveTarget = null;
    } else if (this.input.lolMouseMode && (this.input.consumeRmbClick() || this.input.rmbHeld)) {
      this.raycaster.setFromCamera(
        new THREE.Vector2(this.input.mouseNdc.x, this.input.mouseNdc.y),
        this.camera,
      );
      if (this.raycaster.ray.intersectPlane(this.groundPlane, this.aimPoint)) {
        const dest = this.aimPoint.clone();
        dest.y = 0;
        this.arena.constrainPosition(dest, h.radius);
        this.rmbMoveTarget = dest;
      }
    }

    if (Math.hypot(this.moveVec.x, this.moveVec.z) < 0.05 && this.rmbMoveTarget) {
      const dx = this.rmbMoveTarget.x - h.pos.x;
      const dz = this.rmbMoveTarget.z - h.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.35) {
        this.moveVec.x = dx / dist;
        this.moveVec.z = dz / dist;
      } else {
        this.rmbMoveTarget = null;
      }
    }

    const prevPos = this.tmpVec.copy(h.pos);
    const isFree = h.state === 'idle' || h.state === 'run' || h.state === 'block';
    const cancelThreshold = h.comboStep >= 3 ? 0.72 : 0.58;
    const isAttackCancelable = h.state === 'attack' && h.stateTime / h.stateDuration >= cancelThreshold;

    if ((isFree || isAttackCancelable) && h.counterTargetId !== null && h.counterWindowTimer > 0 && this.input.hasBuffered('attack')) {
      if (h.counterTargetId === -999 && this.mp.mode === 'solo' && this.peer && !this.peer.dead) {
        if (Math.hypot(this.peer.pos.x - h.pos.x, this.peer.pos.z - h.pos.z) < 8.5) {
          this.input.consumeAction('attack');
          this.startParryCounterPvp();
          return;
        }
      } else {
        const target = this.enemies.find((e) => e.id === h.counterTargetId && e.aiState !== 'dead');
        if (target && target.pos.distanceTo(h.pos) < 8.5) {
          this.input.consumeAction('attack');
          this.startParryCounter(target);
          return;
        }
      }
    }

    if (isFree || isAttackCancelable) {
      if (h.ult >= 100 && h.cdR <= 0 && this.input.consumeAction('skillR')) {
        this.rmbMoveTarget = null;
        this.startSkillR();
        return;
      }
      if (h.spirit >= 45 && h.cdE <= 0 && this.input.consumeAction('skillE')) {
        this.rmbMoveTarget = null;
        this.startSkillE();
        return;
      }
      if (h.spirit >= 20 && h.cdQ <= 0 && this.input.consumeAction('skillQ')) {
        this.rmbMoveTarget = null;
        this.startSkillQ();
        return;
      }
      if (h.gourds > 0 && h.cdHeal <= 0 && h.hp < h.maxHp && this.input.consumeAction('heal')) {
        this.rmbMoveTarget = null;
        this.startDrinkGourd();
        return;
      }
    }

    if (isFree && this.input.isBlocking() && h.stamina > 6) {
      if (h.state !== 'block') {
        h.state = 'block';
        h.stateTime = 0;
        h.blockElapsed = 0;
        h.rig.setWeaponDrawn(true);
      } else {
        h.blockElapsed += dt;
        if (this.input.wasBlockJustPressed()) h.blockElapsed = 0;
      }
      const threat = this.findCombatTarget(10);
      const faceYaw = threat ? Math.atan2(threat.x - h.pos.x, threat.z - h.pos.z) : this.getAimYaw();
      h.yaw = dampAngle(h.yaw, faceYaw, 16, dt);
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

    if ((isFree || isAttackCancelable) && this.input.consumeAction('attack')) {
      this.rmbMoveTarget = null;
      const nextStep = h.shadowStrikeTimer > 0 ? 1 : h.comboWindowTimer > 0 && h.comboStep < 4 ? h.comboStep + 1 : 1;
      this.startHeroAttack(nextStep);
    }

    if (h.state === 'idle' || h.state === 'run') {
      const speed = 7.4 * this.blessings.speedMult * loadout.speedMult;
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
      h.rig.applyPose(moving ? 'run' : anyThreat ? 'combatIdle' : 'idle', 0, this.elapsed, dt, h.vel.length());
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
        this.mp.sendAction('drink', { x: h.pos.x, z: h.pos.z });
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

  private updateTargetRingAndThreat(dt: number): CombatThreatState {
    const h = this.hero;
    const lockEnemy = this.findNearestEnemy(16);
    if (lockEnemy) {
      this.targetRingMesh.visible = true;
      this.targetRingMesh.position.set(lockEnemy.pos.x, 0.06, lockEnemy.pos.z);
      this.targetRingMesh.rotation.z += dt * (lockEnemy.aiState === 'windup' ? 6.5 : 2.2);
      const pulse = lockEnemy.aiState === 'windup' ? 1.0 + Math.sin(this.elapsed * 22) * 0.14 : 1.0;
      const baseScale = lockEnemy.radius / 0.56;
      this.targetRingMesh.scale.setScalar(baseScale * pulse);
      const ringMat = this.targetRingMesh.material as THREE.MeshBasicMaterial;
      if (lockEnemy.aiState === 'windup') {
        ringMat.color.set(lockEnemy.moveUnblockable ? '#ff3a4f' : '#ffba42');
        ringMat.opacity = 0.92;
      } else {
        ringMat.color.set('#4cd9d0');
        ringMat.opacity = 0.68;
      }
    } else {
      this.targetRingMesh.visible = false;
    }

    let threat: CombatThreatState = 'none';
    for (const e of this.enemies) {
      if (e.aiState !== 'windup') continue;
      const dHero = Math.hypot(e.pos.x - h.pos.x, e.pos.z - h.pos.z);
      const dCircle = Math.hypot(e.telegraphPos.x - h.pos.x, e.telegraphPos.z - h.pos.z);
      if (e.moveUnblockable && (dHero <= e.moveRange + 2.5 || dCircle <= e.moveRange + 1.4)) {
        return 'unblockable';
      }
      if (!e.moveUnblockable && dHero <= Math.max(6.8, e.moveRange + 2.2)) {
        threat = 'parryable';
      }
    }
    return threat;
  }

  private getHeroDamageScale(): number {
    const realm = getSwordRealm(this.saveStore.getTotalStars());
    const loadout = this.getLoadoutStats();
    return realm.dmgMult * loadout.dmgMult * this.blessings.dmgMult;
  }

  private startHeroAttack(step: number): void {
    const h = this.hero;
    const isShadowStrike = h.shadowStrikeTimer > 0;
    this.shadowAttackActive = isShadowStrike;
    if (isShadowStrike) {
      h.shadowStrikeTimer = 0;
      this.vfx.spawnAfterimage(h.pos, h.yaw, new THREE.Color(0.55, 2.35, 2.45), h.rig.root);
      this.spawnWorldCallout('瞬影斩!', h.pos, 'parry');
      triggerHaptic('medium');
    }

    h.state = 'attack';
    h.comboStep = step;
    h.stateTime = 0;
    h.stateDuration = isShadowStrike
      ? 0.4
      : step === 4
        ? 0.64
        : step === 3
          ? 0.56
          : step === 2
            ? 0.44
            : 0.4;
    h.comboWindowTimer = h.stateDuration + 0.42;
    h.attackHasHit.clear();
    h.attackVfxFired = false;
    h.rig.setWeaponDrawn(true);
    h.rig.setSwordGlow(isShadowStrike || step >= 3 ? 2.2 : 1.55);

    const aimYaw = this.getAimYaw();
    const tgt = this.findCombatTarget(isShadowStrike ? 9.5 : 6.4, aimYaw);
    if (tgt) {
      h.magnetTargetId = tgt.enemy ? tgt.enemy.id : -999;
      const dx = tgt.x - h.pos.x;
      const dz = tgt.z - h.pos.z;
      h.yaw = Math.atan2(dx, dz);
      const standOff = tgt.radius + h.radius + 1.1;
      h.magnetSlideRemain = clamp(Math.hypot(dx, dz) - standOff, 0, isShadowStrike ? 4.5 : 2.5);
    } else {
      h.magnetTargetId = null;
      h.magnetSlideRemain = isShadowStrike ? 2.1 : 0.55;
      h.yaw = aimYaw;
    }
    this.audio.playSwordSwing(step >= 3 ? 3 : step);
    this.mp.sendAction('attack', { step, yaw: h.yaw, x: h.pos.x, z: h.pos.z });
  }

  private tickHeroAttack(dt: number, prevPos: THREE.Vector3): void {
    const h = this.hero;
    h.stateTime += dt;
    const p = clamp(h.stateTime / h.stateDuration, 0, 1);

    if (p < 0.56 && h.magnetSlideRemain > 0.01) {
      let stepDist = Math.min(h.magnetSlideRemain, dt * (this.shadowAttackActive ? 14.5 : 9.2));
      if (h.magnetTargetId === -999 && this.peer && !this.peer.dead) {
        const dist = Math.hypot(this.peer.pos.x - h.pos.x, this.peer.pos.z - h.pos.z);
        const standOff = this.peer.radius + h.radius + 1.1;
        stepDist = Math.min(stepDist, Math.max(0, dist - standOff));
      } else if (h.magnetTargetId !== null) {
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

    const poseName: PoseName = h.comboStep === 1 ? 'combo1' : h.comboStep === 2 ? 'combo2' : h.comboStep === 4 ? 'parryCounter' : 'combo3';
    h.rig.applyPose(poseName, p, this.elapsed, dt, 2);

    const activeStart = h.comboStep >= 3 ? 0.38 : 0.34;
    const activeEnd = h.comboStep >= 3 ? 0.7 : 0.64;
    if (!h.attackVfxFired && p >= activeStart) {
      h.attackVfxFired = true;
      this.spawnSwordComboVfx(h.pos, h.yaw, this.shadowAttackActive ? 4 : h.comboStep);
      if (h.comboStep === 4) {
        this.spawnFlyingSwordProjectile(h.pos, h.yaw, true);
      }
    }

    if (p >= activeStart && p <= activeEnd) {
      const reach = this.shadowAttackActive || h.comboStep >= 3 ? 3.55 : 3.1;
      const halfCone = h.comboStep === 2 || h.comboStep === 4 ? 1.55 : 1.2;
      const rawMultiplier = this.shadowAttackActive ? 42 : h.comboStep === 4 ? 44 : h.comboStep === 3 ? 34 : h.comboStep === 2 ? 23 : 19;
      const baseDmg = Math.round(rawMultiplier * this.getHeroDamageScale());
      const heavy = this.shadowAttackActive || h.comboStep >= 3;

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
        this.applyHeroAttackToEnemy(
          e,
          baseDmg,
          heavy,
          h.yaw,
          this.shadowAttackActive ? 38 : heavy ? 24 : 11,
          this.shadowAttackActive || h.comboStep === 4,
          `combo${h.comboStep}`,
        );
      }

      if (this.mp.mode === 'solo' && this.peer && !this.peer.dead && !h.attackHasHit.has(-999)) {
        const dx = this.peer.pos.x - h.pos.x;
        const dz = this.peer.pos.z - h.pos.z;
        const dist = Math.hypot(dx, dz);
        const diff = Math.abs(angleDiff(h.yaw, Math.atan2(dx, dz)));
        if (dist <= reach + this.peer.radius && (diff <= halfCone || dist <= 1.25)) {
          h.attackHasHit.add(-999);
          this.sendPvpStrike(
            this.shadowAttackActive ? 38 : h.comboStep === 4 ? 36 : h.comboStep === 3 ? 30 : h.comboStep === 2 ? 20 : 16,
            heavy ? 24 : 12,
            heavy,
            h.yaw,
            `combo${h.comboStep}`,
          );
        }
      }
    }

    if (p >= 1) {
      h.state = 'idle';
      this.shadowAttackActive = false;
      h.rig.setSwordGlow(0.85);
    }
  }

  private spawnSwordComboVfx(pos: THREE.Vector3, yaw: number, comboStep: number): void {
    const wVis = getEquippedWeaponVisual(this.saveStore.getEquipped());
    const core = new THREE.Color(...wVis.trailCore);
    const edge = new THREE.Color(...wVis.trailEdge);
    const arcPos = pos.clone().add(new THREE.Vector3(0, 1.05, 0));
    if (comboStep === 1) {
      this.vfx.spawnSwordArc({
        pos: arcPos,
        yaw,
        tiltZ: -0.45,
        colorCore: core,
        colorEdge: edge,
      });
    } else if (comboStep === 2) {
      this.vfx.spawnSwordArc({
        pos: arcPos,
        yaw,
        tiltZ: 0.25,
        reverse: true,
        wide: true,
        colorCore: core,
        colorEdge: edge,
      });
    } else {
      this.vfx.spawnSwordArc({
        pos: arcPos.add(new THREE.Vector3(Math.sin(yaw) * 0.5, 0.15, Math.cos(yaw) * 0.5)),
        yaw,
        tiltZ: comboStep === 4 ? 0.12 : Math.PI * 0.5,
        wide: true,
        scale: comboStep === 4 ? 1.28 : 1.12,
        colorCore: new THREE.Color(2.35, 1.95, 0.78),
        colorEdge: edge,
        duration: 0.44,
      });
      const slamPos = pos.clone().add(new THREE.Vector3(Math.sin(yaw) * 2.1, 0.08, Math.cos(yaw) * 2.1));
      this.vfx.spawnShockRing(slamPos, core, 0.35, comboStep === 4 ? 3.8 : 3.2, 0.38);
      this.vfx.spawnGroundCrater(slamPos, 1.65, edge, 2.4);
      this.cameraRig.addShake(comboStep === 4 ? 0.34 : 0.26);
    }
  }

  private startHeroDodge(): void {
    const h = this.hero;
    h.state = 'dodge';
    h.stateTime = 0;
    h.stateDuration = 0.36;
    h.hitstopTimer = 0;
    h.dodgeInvuln = 0.26;
    h.dodgePerfectTriggered = false;
    h.afterimageTimer = 0;
    h.stamina = Math.max(0, h.stamina - 24);

    this.input.getMoveVector(this.moveVec);
    if (Math.hypot(this.moveVec.x, this.moveVec.z) > 0.1) {
      h.dodgeDir.set(this.moveVec.x, 0, this.moveVec.z).normalize();
      h.yaw = Math.atan2(h.dodgeDir.x, h.dodgeDir.z);
    } else {
      h.dodgeDir.set(Math.sin(h.yaw), 0, Math.cos(h.yaw));
    }
    this.audio.playDodge(false);
    this.vfx.spawnAfterimage(h.pos, h.yaw, new THREE.Color(0.32, 1.65, 1.95), h.rig.root);
    triggerHaptic('light');
    this.mp.sendAction('dodge', { x: h.pos.x, z: h.pos.z, yaw: h.yaw });
  }

  private tickHeroDodge(dt: number, prevPos: THREE.Vector3): void {
    const h = this.hero;
    const loadout = this.getLoadoutStats();
    h.stateTime += dt;
    const p = clamp(h.stateTime / h.stateDuration, 0, 1);
    const speed = 15.8 * this.blessings.speedMult * loadout.speedMult * (1 - p * 0.45);
    h.pos.addScaledVector(h.dodgeDir, speed * dt);
    this.arena.constrainPosition(h.pos, h.radius, prevPos);
    h.rig.root.position.copy(h.pos);
    h.rig.root.rotation.y = h.yaw;
    h.rig.applyPose('dodge', p, this.elapsed, dt, speed);

    h.afterimageTimer += dt;
    if (h.afterimageTimer >= 0.085) {
      h.afterimageTimer = 0;
      this.vfx.spawnAfterimage(h.pos, h.yaw, new THREE.Color(0.32, 1.65, 1.95), h.rig.root);
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

    this.vfx.spawnAfterimage(h.pos, h.yaw, new THREE.Color(2.2, 1.8, 0.55), h.rig.root);
    this.audio.playHeroVoice('counter');
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
    triggerHaptic('parry');
    this.mp.sendAction('parryCounter', { x: h.pos.x, z: h.pos.z, yaw: h.yaw });
  }

  private startParryCounterPvp(): void {
    if (!this.peer) return;
    const h = this.hero;
    h.state = 'parryCounter';
    h.stateTime = 0;
    h.stateDuration = 0.56;
    h.counterWindowTimer = 0;
    h.counterTargetId = null;
    h.attackHasHit.clear();
    h.attackVfxFired = false;
    h.dodgeInvuln = 0.6;
    h.magnetTargetId = -999;

    this.vfx.spawnAfterimage(h.pos, h.yaw, new THREE.Color(2.2, 1.8, 0.55), h.rig.root);
    this.audio.playHeroVoice('counter');
    const dx = this.peer.pos.x - h.pos.x;
    const dz = this.peer.pos.z - h.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.1) {
      const stand = this.peer.radius + h.radius + 1.15;
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
    triggerHaptic('parry');
    this.mp.sendAction('parryCounter', { x: h.pos.x, z: h.pos.z, yaw: h.yaw });
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
      if (h.magnetTargetId === -999 && this.mp.mode === 'solo' && this.peer && !this.peer.dead) {
        this.sendPvpStrike(54, 48, true, h.yaw, 'parryCounter');
        this.spawnWorldCallout('破势处决!', this.peer.pos, 'parry');
      } else {
        const tgt = this.enemies.find((e) => e.id === h.magnetTargetId && e.aiState !== 'dead');
        if (tgt) {
          const dmg = Math.round(86 * this.getHeroDamageScale());
          this.applyHeroAttackToEnemy(tgt, dmg, true, h.yaw, 42, true, 'parryCounter');
          this.spawnWorldCallout('破势处决!', tgt.pos, 'parry');
        }
      }
      this.cameraRig.addShake(0.55);
      triggerHaptic('heavy');
    }

    if (p >= 1) h.state = 'idle';
  }

  private startSkillQ(): void {
    const h = this.hero;
    const loadout = this.getLoadoutStats();
    h.spirit -= 20;
    h.cdQ = 3.5 * this.blessings.cdMult * loadout.cdMult;
    h.state = 'skillQ';
    h.stateTime = 0;
    h.stateDuration = 0.34;
    h.attackVfxFired = false;
    h.rig.setWeaponDrawn(true);
    const aimYaw = this.getAimYaw();
    const tgt = this.findCombatTarget(16, aimYaw);
    h.yaw = tgt ? Math.atan2(tgt.x - h.pos.x, tgt.z - h.pos.z) : aimYaw;
    h.rig.root.rotation.y = h.yaw;
    this.audio.playSkillQ();
    this.audio.playHeroVoice('skillQ');
    this.hud.triggerSkillPulse('Q');
    triggerHaptic('medium');
    this.mp.sendAction('skillQ', { x: h.pos.x, z: h.pos.z, yaw: h.yaw });
  }

  private startSkillE(): void {
    const h = this.hero;
    const loadout = this.getLoadoutStats();
    h.spirit -= 45;
    h.cdE = 7.5 * this.blessings.cdMult * loadout.cdMult;
    h.state = 'skillE';
    h.stateTime = 0;
    h.stateDuration = 0.52;
    h.attackVfxFired = false;
    h.rig.setWeaponDrawn(true);
    const tgt = this.findCombatTarget(16, this.getAimYaw());
    if (tgt) h.yaw = Math.atan2(tgt.x - h.pos.x, tgt.z - h.pos.z);
    h.rig.root.rotation.y = h.yaw;
    this.audio.playSkillE();
    this.audio.playHeroVoice('skillE');
    this.hud.triggerSkillPulse('E');
    triggerHaptic('heavy');
  }

  private startSkillR(): void {
    const h = this.hero;
    const loadout = this.getLoadoutStats();
    h.ult = 0;
    h.cdR = 12.0 * this.blessings.cdMult * loadout.cdMult;
    h.state = 'skillR';
    h.stateTime = 0;
    h.stateDuration = 0.85;
    h.dodgeInvuln = 1.0;
    h.attackVfxFired = false;
    h.rig.setWeaponDrawn(true);
    const tgt = this.findCombatTarget(14);
    if (tgt) h.yaw = Math.atan2(tgt.x - h.pos.x, tgt.z - h.pos.z);
    h.rig.root.rotation.y = h.yaw;
    this.audio.playSkillR();
    this.audio.playHeroVoice('skillR');
    this.hud.triggerSkillPulse('R');
    triggerHaptic('ultimate');
  }

  private startDrinkGourd(): void {
    const h = this.hero;
    h.state = 'drink';
    h.stateTime = 0;
    h.stateDuration = 0.68;
    h.cdHeal = 1.5;
    h.attackVfxFired = false;
    this.audio.playHeroVoice('heal');
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
        this.spawnFlyingSwordProjectile(h.pos, h.yaw, true);
      } else if (h.state === 'skillE') {
        const tgt = this.findCombatTarget(16, h.yaw);
        const center = tgt
          ? new THREE.Vector3(tgt.x, 0, tgt.z)
          : h.pos.clone().add(new THREE.Vector3(Math.sin(h.yaw) * 5.2, 0, Math.cos(h.yaw) * 5.2));
        this.arena.constrainPosition(center, 1.0);
        this.mp.sendAction('skillE', { cx: center.x, cz: center.z });
        this.castSkillEAt(center, true);
      } else if (h.state === 'skillR') {
        const tgt = this.findCombatTarget(15);
        const center = tgt
          ? new THREE.Vector3(tgt.x, 0, tgt.z)
          : h.pos.clone().add(new THREE.Vector3(Math.sin(h.yaw) * 5.5, 0, Math.cos(h.yaw) * 5.5));
        this.arena.constrainPosition(center, 1.2);
        this.mp.sendAction('skillR', { cx: center.x, cz: center.z });
        this.castSkillRAt(center, true);
      }
    }

    if (p >= 1) h.state = 'idle';
  }

  private spawnFlyingSwordProjectile(origin: THREE.Vector3, yaw: number, friendly: boolean): void {
    const accent = friendly ? new THREE.Color(0.45, 2.05, 2.25) : new THREE.Color(2.2, 0.65, 0.55);
    const mesh = buildFlyingSwordMesh(accent);
    const startPos = origin.clone().add(new THREE.Vector3(Math.sin(yaw) * 1.1, 1.15, Math.cos(yaw) * 1.1));
    mesh.position.copy(startPos);
    mesh.rotation.y = yaw;
    this.scene.add(mesh);
    this.projectiles.push({
      id: this.nextEntityId++,
      friendly,
      kind: 'flyingSword',
      pos: startPos,
      vel: new THREE.Vector3(Math.sin(yaw) * 23, 0, Math.cos(yaw) * 23),
      radius: 0.72,
      damage: Math.round(44 * this.getHeroDamageScale()),
      age: 0,
      maxAge: 0.95,
      hitIds: new Set(),
      mesh,
    });
    this.vfx.spawnShockRing(startPos, accent, 0.2, 1.4, 0.25);
  }

  private castSkillEAt(center: THREE.Vector3, isLocalDamage: boolean): void {
    const h = this.hero;
    this.vfx.spawnBaguaArray({
      pos: new THREE.Vector3(center.x, 0.08, center.z),
      radius: 4.5,
      color: new THREE.Color(0.35, 1.85, 2.0),
      duration: 1.65,
    });
    let pvpHitSent = false;
    const perSwordDmg = Math.round(22 * this.getHeroDamageScale());
    for (let i = 0; i < 9; i++) {
      const ang = (i / 9) * Math.PI * 2 + this.rng() * 0.4;
      const r = i === 0 ? 0.2 : 1.1 + this.rng() * 2.8;
      const spot = new THREE.Vector3(center.x + Math.cos(ang) * r, 0, center.z + Math.sin(ang) * r);
      this.vfx.spawnFallingSword({
        targetPos: spot,
        delay: i * 0.075,
        onImpact: (pos) => {
          if (i % 3 === 0) {
            this.audio.playHit(false);
            this.cameraRig.addShake(0.14);
          }
          this.vfx.spawnGroundCrater(pos, 1.15, new THREE.Color(0.35, 1.75, 2.0), 2.6);
          if (!isLocalDamage) return;
          for (const e of this.enemies) {
            if (e.aiState === 'dead') continue;
            if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) <= 2.3 + e.radius) {
              this.applyHeroAttackToEnemy(e, perSwordDmg, false, h.yaw, 9, false, 'skillE');
            }
          }
          if (this.mp.mode === 'solo' && this.peer && !this.peer.dead && !pvpHitSent) {
            if (Math.hypot(this.peer.pos.x - pos.x, this.peer.pos.z - pos.z) <= 2.6 + this.peer.radius) {
              pvpHitSent = true;
              this.sendPvpStrike(32, 22, false, h.yaw, 'skillE');
            }
          }
        },
      });
    }
  }

  private castSkillRAt(center: THREE.Vector3, isLocalDamage: boolean): void {
    const h = this.hero;
    this.vfx.spawnBaguaArray({
      pos: new THREE.Vector3(center.x, 0.1, center.z),
      radius: 6.4,
      color: new THREE.Color(2.2, 1.65, 0.45),
      duration: 2.1,
    });
    const ultDmg = Math.round(145 * this.getHeroDamageScale());
    this.vfx.spawnFallingSword({
      targetPos: center,
      giant: true,
      delay: 0.05,
      onImpact: (pos) => {
        this.cameraRig.addShake(0.85);
        this.vfx.spawnShockRing(pos, new THREE.Color(2.4, 1.75, 0.45), 0.6, 8.2, 0.65);
        this.vfx.spawnGroundCrater(pos, 3.6, new THREE.Color(2.4, 1.7, 0.45), 4.2);
        this.vfx.spawnHitSparks(
          pos.clone().add(new THREE.Vector3(0, 0.5, 0)),
          new THREE.Vector3(0, 1, 0),
          new THREE.Color(2.4, 1.9, 0.55),
          26,
          this.rng,
        );
        if (!isLocalDamage) return;
        triggerHaptic('ultimate');
        for (const e of this.enemies) {
          if (e.aiState === 'dead') continue;
          if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) <= 6.8 + e.radius) {
            this.applyHeroAttackToEnemy(e, ultDmg, true, h.yaw, 55, true, 'skillR');
          }
        }
        if (this.mp.mode === 'solo' && this.peer && !this.peer.dead) {
          if (Math.hypot(this.peer.pos.x - pos.x, this.peer.pos.z - pos.z) <= 6.8 + this.peer.radius) {
            this.sendPvpStrike(68, 55, true, h.yaw, 'skillR');
          }
        }
      },
    });
  }

  private applyHeroAttackToEnemy(
    e: EnemyEntity,
    rawDmg: number,
    heavy: boolean,
    attackYaw: number,
    poiseGain: number,
    isCrit: boolean,
    skill?: string,
  ): void {
    const h = this.hero;
    if (this.mp.mode === 'coop' && this.mp.role === 'guest') {
      h.spirit = Math.min(h.maxSpirit, h.spirit + (heavy ? 12 : 7));
      h.ult = Math.min(100, h.ult + (heavy ? 12 : 6) * this.blessings.ultGainMult);
      h.comboCount += 1;
      h.comboDecayTimer = 3.2;
      h.maxCombo = Math.max(h.maxCombo, h.comboCount);
      h.totalDamage += rawDmg;
      e.rig.triggerHitFlash(1.0);
      const contactPos = e.pos.clone().lerp(h.pos, 0.35);
      contactPos.y = 1.15;
      const tangent = new THREE.Vector3(Math.cos(attackYaw), 0.25, -Math.sin(attackYaw));
      this.vfx.spawnHitSparks(
        contactPos,
        tangent,
        isCrit ? new THREE.Color(2.4, 1.9, 0.5) : new THREE.Color(1.4, 2.2, 2.3),
        heavy ? 16 : 10,
        this.rng,
      );
      const isSkillE = skill === 'skillE';
      const allowFeedback = !isSkillE || this.elapsed - this.lastSkillEFeedbackAt >= 0.22;
      if (isSkillE && allowFeedback) this.lastSkillEFeedbackAt = this.elapsed;
      if (allowFeedback) {
        this.audio.playHit(heavy);
        this.cameraRig.addShake(heavy ? 0.28 : 0.12);
        triggerHaptic(heavy ? 'medium' : 'light');
      }
      this.spawnWorldCallout(`${rawDmg}`, e.pos, heavy || isCrit ? 'crit' : 'dmg');
      this.mp.sendEnemyHit(e.id, rawDmg, poiseGain, heavy, skill);
      return;
    }

    this.damageEnemy(e, rawDmg, heavy, attackYaw, poiseGain, isCrit, true, skill);
  }

  private damageEnemy(
    e: EnemyEntity,
    rawDmg: number,
    heavy: boolean,
    attackYaw: number,
    poiseGain: number,
    isCrit: boolean,
    fromLocalHero = true,
    skill?: string,
  ): void {
    if (e.aiState === 'dead') return;
    const h = this.hero;
    const loadout = this.getLoadoutStats();

    const isLightM1 =
      !heavy &&
      skill !== 'skillQ' &&
      skill !== 'skillE' &&
      skill !== 'skillR' &&
      skill !== 'parryCounter' &&
      skill !== 'parry';
    const windupProg = e.aiState === 'windup' ? e.stateTime / Math.max(0.1, e.stateDuration) : 0;
    const hasWindupArmor = e.aiState === 'windup' && windupProg >= 0.45 && isLightM1;
    const interrupted = e.aiState === 'windup' && windupProg >= 0.45 && !isLightM1;

    const rolledCrit = isCrit || (fromLocalHero && this.rng() < loadout.critRate);
    const critScale = rolledCrit ? loadout.critMult : 1.0;
    const dmg = Math.round(rawDmg * (interrupted ? 1.35 : 1.0) * critScale);
    const scaledPoise = poiseGain * (interrupted ? 1.6 : 1.0) * (fromLocalHero ? loadout.poiseMult : 1.0);
    e.hp = Math.max(0, e.hp - dmg);
    e.poise = Math.min(e.maxPoise, e.poise + scaledPoise);

    const isSkillE = skill === 'skillE';
    const allowFeedback = !isSkillE || this.elapsed - this.lastSkillEFeedbackAt >= 0.22;
    if (isSkillE && allowFeedback) this.lastSkillEFeedbackAt = this.elapsed;

    if (fromLocalHero) {
      h.spirit = Math.min(h.maxSpirit, h.spirit + (heavy ? 12 : 7));
      h.ult = Math.min(100, h.ult + (heavy ? 12 : 6) * this.blessings.ultGainMult * loadout.ultGainMult);
      h.comboCount += 1;
      h.comboDecayTimer = 3.2;
      h.maxCombo = Math.max(h.maxCombo, h.comboCount);
      h.totalDamage += dmg;
      if (loadout.lifesteal > 0 && h.hp > 0 && h.hp < h.maxHp) {
        h.hp = Math.min(h.maxHp, h.hp + Math.max(1, Math.round(dmg * loadout.lifesteal)));
      }
      if (allowFeedback) {
        triggerHaptic(heavy || interrupted || rolledCrit ? 'medium' : 'light');
      }
    }

    const hitstop = heavy ? 0.1 : 0.062;
    if (fromLocalHero && !isSkillE) {
      h.hitstopTimer = Math.max(h.hitstopTimer, hitstop * 0.85);
    }
    if (allowFeedback) {
      e.hitstopTimer = Math.max(e.hitstopTimer, hitstop);
      this.audio.playHit(heavy || interrupted || rolledCrit);
      this.cameraRig.addShake(heavy ? 0.32 : 0.14);
    }
    e.shakeTimer = 0.16;
    e.rig.triggerHitFlash(1.0);

    const contactPos = e.pos.clone().lerp(h.pos, 0.35);
    contactPos.y = 1.15;
    const tangent = new THREE.Vector3(Math.cos(attackYaw), 0.25, -Math.sin(attackYaw));
    this.vfx.spawnHitSparks(
      contactPos,
      tangent,
      rolledCrit || interrupted ? new THREE.Color(2.4, 1.9, 0.5) : new THREE.Color(1.4, 2.2, 2.3),
      heavy || rolledCrit ? 16 : 10,
      this.rng,
    );

    if (interrupted) {
      this.spawnWorldCallout(`破招 ${dmg}!`, e.pos, 'parry');
    } else if (rolledCrit) {
      this.spawnWorldCallout(`暴击 ${dmg}!`, e.pos, 'crit');
    } else {
      this.spawnWorldCallout(`${dmg}`, e.pos, heavy ? 'crit' : 'dmg');
    }

    const kb = hasWindupArmor
      ? 0.25
      : heavy
        ? e.kind === 'boss'
          ? 1.8
          : e.kind === 'elite'
            ? 2.6
            : 4.2
        : e.kind === 'boss'
          ? 0.4
          : 1.6;
    e.vel.set(Math.sin(attackYaw) * kb, 0, Math.cos(attackYaw) * kb);

    if (e.kind === 'boss' && e.phase === 1 && e.hp > 0 && e.hp <= e.maxHp * 0.5) {
      e.phase = 2;
      e.rig.setPhase2(true);
      this.audio.setMood('boss2');
      this.vfx.spawnShockRing(e.pos, new THREE.Color(2.3, 0.25, 0.5), 0.6, 7.5, 0.65);
      this.vfx.spawnGroundCrater(e.pos, 3.2, new THREE.Color(2.3, 0.25, 0.45), 3.6);
      this.cameraRig.addShake(0.6);
      this.hud.showSubtitle(`${e.name}：「魔剑狂化！」`, 1.5);
    }

    if (e.hp <= 0) {
      this.killEnemy(e);
      return;
    }

    if (e.poise >= e.maxPoise || (interrupted && e.kind !== 'boss' && e.kind !== 'elite' && e.affix !== 'ironclad')) {
      e.poise = 0;
      e.telegraph?.dispose();
      e.telegraph = null;
      e.aiState = 'stagger';
      e.stateTime = 0;
      e.stateDuration = e.kind === 'boss' ? 2.1 : e.kind === 'elite' ? 1.8 : 1.5;
      if (fromLocalHero) {
        h.counterTargetId = e.id;
        h.counterWindowTimer = 1.4;
      }
      this.vfx.spawnShockRing(e.pos, new THREE.Color(2.4, 1.9, 0.5), 0.4, 2.8, 0.4);
      this.spawnWorldCallout('破势!', e.pos, 'parry');
    } else if (e.kind !== 'boss' && e.affix !== 'ironclad' && !hasWindupArmor && (heavy || e.aiState !== 'attack')) {
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
    this.vfx.spawnHitSparks(
      e.pos.clone().add(new THREE.Vector3(0, 1, 0)),
      new THREE.Vector3(0, 1, 0),
      new THREE.Color(2.0, 1.7, 0.8),
      18,
      this.rng,
    );

    if (e.kind !== 'boss') {
      if (this.rng() < 0.35) {
        this.vfx.spawnLootDrop(e.pos, 'heal', this.rng);
      }
      if (e.kind === 'caster' || e.kind === 'elite') {
        this.vfx.spawnLootDrop(e.pos, 'spirit', this.rng);
        this.vfx.spawnLootDrop(e.pos, 'gourd', this.rng);
      }
    } else {
      this.vfx.spawnLootDrop(e.pos, 'spirit', this.rng);
      this.vfx.spawnLootDrop(e.pos, 'gourd', this.rng);
      this.vfx.spawnLootDrop(e.pos, 'gourd', this.rng);
    }

    const loadout = this.getLoadoutStats();
    if (loadout.killHealPct > 0 && this.hero.hp > 0) {
      const heal = Math.max(6, Math.round(this.hero.maxHp * loadout.killHealPct));
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + heal);
      this.spawnWorldCallout(`嗜血 +${heal}`, this.hero.pos, 'heal');
    }

    if (this.mp.mode === 'offline') {
      const baseJade = e.kind === 'boss' ? 120 : e.kind === 'elite' ? 45 : e.kind === 'caster' ? 24 : 14;
      const jadeDrop = baseJade + Math.min(18, Math.floor(this.hero.comboCount * 0.5));
      this.hero.stageJadeEarned += jadeDrop;
      this.saveStore.addJade(jadeDrop);
      this.spawnWorldCallout(`+${jadeDrop} 灵石`, e.pos.clone().add(new THREE.Vector3(0.45, 0.35, 0)), 'info');
    }

    if (this.mp.mode === 'offline' || this.mp.role === 'host') {
      this.saveStore.incrementStat('totalKills', 1);
      const stageDef = this.getActiveStageDef();
      const tier: 1 | 2 | 3 = this.activeDungeon
        ? this.activeDungeon.tier
        : stageDef.chapter >= 3
          ? 3
          : stageDef.chapter >= 2
            ? 2
            : 1;
      const sourceLabel = this.activeDungeon ? `秘境·${this.activeDungeon.name}` : `第${stageDef.id}关·${stageDef.name}`;
      if (e.kind === 'elite') {
        const dropChance = this.activeDungeon ? 0.65 : 0.35;
        if (this.rng() < dropChance) {
          const item = rollEquipmentDrop({
            tier,
            guaranteedMinRarity: this.activeDungeon ? 'rare' : undefined,
            source: sourceLabel,
            rng: this.rng,
          });
          this.vfx.spawnGearDrop(e.pos, item, this.rng);
          this.audio.playGearDropChime(item.rarity);
        }
      } else if (e.kind === 'boss') {
        const isFirstClear = !this.activeDungeon && !this.saveStore.getStageRecord(stageDef.id);
        const dropCount = this.activeDungeon
          ? this.activeDungeon.tier === 3
            ? 3
            : 2
          : isFirstClear || this.rng() < 0.7
            ? 1
            : 0;
        for (let k = 0; k < dropCount; k++) {
          const pityTriggered = k === 0 ? this.saveStore.advancePityAndCheck() : false;
          const item = rollEquipmentDrop({
            tier,
            guaranteedMinRarity: this.activeDungeon?.guaranteedMinRarity ?? (isFirstClear ? 'rare' : undefined),
            pityTriggered,
            source: sourceLabel,
            rng: this.rng,
          });
          this.vfx.spawnGearDrop(e.pos, item, this.rng);
          if (k === 0) this.audio.playGearDropChime(item.rarity);
        }
      }
    }
  }

  private onCollectDrop(kind: 'heal' | 'spirit' | 'gourd' | 'gear', gearItem?: RolledGearItem): void {
    const h = this.hero;
    if (kind === 'gear' && gearItem) {
      const addRes = this.saveStore.addRolledItem(gearItem);
      this.stageDroppedGear.push(gearItem);
      this.audio.playGearDropChime(gearItem.rarity);
      this.spawnWorldCallout(
        addRes.added ? `【${RARITY_LABELS[gearItem.rarity]}】${gearItem.name}` : `背囊已满分解 +◆${addRes.overflowSalvagedJade ?? 0}`,
        h.pos,
        gearItem.rarity === 'legendary' || gearItem.rarity === 'epic' ? 'parry' : 'info',
      );
      this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
      return;
    }
    this.audio.playHeal();
    if (kind === 'heal') {
      h.hp = Math.min(h.maxHp, h.hp + 36);
      this.spawnWorldCallout('+36 气血', h.pos, 'heal');
    } else if (kind === 'spirit') {
      h.spirit = Math.min(h.maxSpirit, h.spirit + 35);
      h.ult = Math.min(100, h.ult + 16 * this.blessings.ultGainMult);
      this.spawnWorldCallout('+35 真气', h.pos, 'info');
    } else {
      h.gourds = Math.min(h.maxGourds + 1, h.gourds + 1);
      h.hp = Math.min(h.maxHp, h.hp + 25);
      this.spawnWorldCallout('灵葫酒 +1', h.pos, 'parry');
    }
  }

  private getEnemyAggroTarget(enemyPos: THREE.Vector3): THREE.Vector3 {
    if (this.mp.mode === 'coop' && this.peer && !this.peer.dead) {
      if (this.hero.state === 'dead') return this.peer.pos;
      const dHero = enemyPos.distanceToSquared(this.hero.pos);
      const dPeer = enemyPos.distanceToSquared(this.peer.pos);
      return dPeer < dHero * 0.92 ? this.peer.pos : this.hero.pos;
    }
    return this.hero.pos;
  }

  private updateStageHazards(dt: number): void {
    const stageDef = this.getActiveStageDef();
    if (stageDef.hazard !== 'none' && this.stagePhase === 'combat' && this.enemies.some((e) => e.aiState !== 'dead')) {
      this.hazardTimer -= dt;
      if (this.hazardTimer <= 0) {
        this.hazardTimer = stageDef.hazardIntervalSec ?? 5.0;
        const pos = this.hero.pos.clone();
        pos.x += (this.rng() - 0.5) * 2.2;
        pos.z += (this.rng() - 0.5) * 2.2;
        pos.y = 0;
        this.arena.constrainPosition(pos, 1.2);
        const radius = stageDef.hazard === 'abyss' ? 3.2 : 2.8;
        const col =
          stageDef.hazard === 'ember'
            ? new THREE.Color(2.3, 0.55, 0.18)
            : stageDef.hazard === 'lightning'
              ? new THREE.Color(1.4, 0.45, 2.35)
              : new THREE.Color(2.1, 0.25, 0.65);
        const telegraph = this.vfx.createTelegraph('circle', pos, 0, radius, radius, col);
        this.hazards.push({
          kind: stageDef.hazard,
          pos,
          radius,
          damage: stageDef.hazardDamage ?? 22,
          elapsed: 0,
          duration: 1.15,
          telegraph,
        });
      }
    }

    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const hz = this.hazards[i];
      hz.elapsed += dt;
      const p = clamp(hz.elapsed / hz.duration, 0, 1);
      hz.telegraph.updateProgress(p);
      if (p >= 1) {
        hz.telegraph.dispose();
        const ringCol =
          hz.kind === 'ember'
            ? new THREE.Color(2.4, 0.65, 0.2)
            : hz.kind === 'lightning'
              ? new THREE.Color(1.6, 0.6, 2.4)
              : new THREE.Color(2.2, 0.28, 0.68);
        this.vfx.spawnShockRing(hz.pos, ringCol, 0.35, hz.radius, 0.4);
        this.vfx.spawnGroundCrater(hz.pos, hz.radius * 0.85, ringCol, 2.8);
        this.audio.playHit(false);
        this.cameraRig.addShake(0.24);
        if (Math.hypot(this.hero.pos.x - hz.pos.x, this.hero.pos.z - hz.pos.z) <= hz.radius) {
          this.tryHitHero(null, hz.damage, true, hz.pos);
        }
        this.hazards.splice(i, 1);
      }
    }
  }

  private updateEnemies(dt: number): void {
    const h = this.hero;
    const maxMeleeAttackers = this.getActiveStageDef().chapter === 1 ? 2 : 3;
    let activeMeleeAttackers = 0;
    for (const e of this.enemies) {
      if (
        e.aiState !== 'dead' &&
        e.kind !== 'caster' &&
        (e.aiState === 'windup' || e.aiState === 'attack')
      ) {
        activeMeleeAttackers += 1;
      }
    }

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

      if (e.hpBarGroup.visible) {
        e.hpBarGroup.quaternion.copy(this.camera.quaternion);
        e.hpFillMesh.scale.x = clamp(e.hp / e.maxHp, 0.001, 1);
      }
      e.counterRing.visible = h.counterTargetId === e.id && h.counterWindowTimer > 0;
      if (e.counterRing.visible) e.counterRing.rotation.z += dt * 4.5;

      if (e.hitstopTimer > 0) {
        e.hitstopTimer -= dt;
        const j = Math.sin(this.elapsed * 95) * 0.07;
        e.rig.root.position.set(e.pos.x + j, e.pos.y, e.pos.z - j);
        continue;
      }

      e.attackCooldown = Math.max(0, e.attackCooldown - dt * e.speedMult);
      const prevPos = this.tmpVec2.copy(e.pos);
      const targetPos = this.getEnemyAggroTarget(e.pos);
      const dx = targetPos.x - e.pos.x;
      const dz = targetPos.z - e.pos.z;
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
        const preferred = e.kind === 'caster' ? 8.2 : e.kind === 'boss' ? 5.2 : e.kind === 'elite' ? 4.8 : 4.6;
        const radial = clamp((dist - preferred) * 0.75, -1, 1);
        const moveSpeed =
          (e.kind === 'boss' ? (e.phase === 2 ? 4.4 : 3.5) : e.kind === 'elite' ? 3.4 : 3.1) * e.speedMult;
        const nx = dist > 0.01 ? dx / dist : 0;
        const nz = dist > 0.01 ? dz / dist : 1;
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
            this.beginEnemyWindup(e, this.rng() < 0.55 ? 'orb' : 'yinCircle', undefined, targetPos);
          } else if (activeMeleeAttackers < maxMeleeAttackers) {
            if ((e.kind === 'boss' || e.kind === 'elite') && dist > 6.5) {
              activeMeleeAttackers += 1;
              this.beginEnemyWindup(
                e,
                e.kind === 'boss' && e.phase === 2 && this.rng() < 0.45 ? 'barrage' : 'lunge',
                undefined,
                targetPos,
              );
            } else {
              e.aiState = 'chase';
              e.stateTime = 0;
            }
          }
        }
      } else if (e.aiState === 'chase') {
        e.yaw = dampAngle(e.yaw, toHeroYaw, 10, dt);
        const spd = (e.kind === 'boss' ? (e.phase === 2 ? 6.2 : 5.1) : e.kind === 'elite' ? 5.2 : 4.8) * e.speedMult;
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
          if (activeMeleeAttackers < maxMeleeAttackers) {
            activeMeleeAttackers += 1;
            if (e.kind === 'boss' || e.kind === 'elite') {
              const roll = this.rng();
              const mv = roll < 0.45 ? 'cleave' : roll < 0.75 ? 'slam' : 'lunge';
              this.beginEnemyWindup(e, mv, undefined, targetPos);
            } else {
              this.beginEnemyWindup(e, 'cleave', undefined, targetPos);
            }
          } else {
            e.aiState = 'orbit';
            e.stateTime = 0;
            e.attackCooldown = 0.25;
          }
        }
      } else if (e.aiState === 'windup') {
        e.stateTime += dt;
        const p = clamp(e.stateTime / e.stateDuration, 0, 1);
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
          if (e.moveKind === 'lunge') {
            e.telegraphPos.copy(e.pos);
          }
          e.telegraph?.dispose();
          e.telegraph = null;
          e.aiState = 'attack';
          e.stateTime = 0;
          e.stateDuration = e.moveKind === 'lunge' ? 0.34 : e.moveKind === 'slam' ? 0.42 : 0.34;
          e.moveHasHit = false;
          this.audio.playSwordSwing(e.kind === 'boss' || e.kind === 'elite' ? 3 : 2);
        }
      } else if (e.aiState === 'attack') {
        e.stateTime += dt;
        const p = clamp(e.stateTime / e.stateDuration, 0, 1);
        if (e.moveKind === 'lunge' && p < 0.72) {
          const lSpd = (e.kind === 'boss' ? 19.5 : e.kind === 'elite' ? 16.5 : 13) * e.speedMult;
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
          if (e.comboFollowup && dist < e.moveRange + 2.5) {
            e.comboFollowup = false;
            this.beginEnemyWindup(e, 'cleave', 0.46, targetPos);
          } else {
            e.aiState = 'recover';
            e.stateTime = 0;
            e.stateDuration = e.kind === 'boss' ? (e.phase === 2 ? 0.4 : 0.52) : e.kind === 'elite' ? 0.48 : 0.45;
          }
        }
      } else if (e.aiState === 'recover') {
        e.stateTime += dt;
        e.rig.applyPose('combatIdle', 0, this.elapsed, dt, 0);
        if (e.stateTime >= e.stateDuration) {
          e.aiState = 'orbit';
          e.stateTime = 0;
          e.attackCooldown =
            (e.kind === 'boss' ? (e.phase === 2 ? 0.65 : 0.9) : e.kind === 'elite' ? 0.85 : 0.85 + this.rng() * 0.6) /
            e.speedMult;
          e.orbitDir = this.rng() > 0.5 ? 1 : -1;
        }
      }
    }
  }

  private updateGuestEnemiesVisual(dt: number): void {
    const h = this.hero;
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
      if (e.hpBarGroup.visible) {
        e.hpBarGroup.quaternion.copy(this.camera.quaternion);
        e.hpFillMesh.scale.x = clamp(e.hp / e.maxHp, 0.001, 1);
      }
      e.counterRing.visible = h.counterTargetId === e.id && h.counterWindowTimer > 0;
      if (e.counterRing.visible) e.counterRing.rotation.z += dt * 4.5;

      e.pos.x = damp(e.pos.x, e.telegraphPos.x, 12, dt);
      e.pos.z = damp(e.pos.z, e.telegraphPos.z, 12, dt);
      e.rig.root.position.copy(e.pos);
      e.rig.root.rotation.y = e.yaw;

      const pose: PoseName =
        e.aiState === 'stagger'
          ? 'stagger'
          : e.aiState === 'hit'
            ? 'hit'
            : e.aiState === 'windup'
              ? 'enemyWindup'
              : e.aiState === 'attack'
                ? e.moveKind === 'slam'
                  ? 'bossSlam'
                  : 'enemySlash'
                : 'run';
      e.rig.applyPose(pose, (this.elapsed * 1.8) % 1, this.elapsed, dt, e.aiState === 'orbit' || e.aiState === 'chase' ? 3.2 : 0);
    }
  }

  private beginEnemyWindup(
    e: EnemyEntity,
    move: EnemyEntity['moveKind'],
    customWindup?: number,
    targetPos?: THREE.Vector3,
  ): void {
    e.telegraph?.dispose();
    e.telegraph = null;
    e.aiState = 'windup';
    e.moveKind = move;
    e.stateTime = 0;
    e.comboFollowup =
      customWindup === undefined &&
      ((e.kind === 'boss' && move === 'cleave') ||
        (e.kind === 'elite' && move === 'cleave') ||
        (e.kind === 'bladesman' && this.rng() < 0.35));

    const fast = (e.kind === 'boss' && e.phase === 2 ? 0.82 : e.kind === 'elite' ? 0.9 : 1.0) / e.speedMult;

    if (move === 'cleave') {
      e.stateDuration = (customWindup ?? (e.kind === 'boss' ? 0.72 : e.kind === 'elite' ? 0.66 : 0.62)) * fast;
      e.moveRange = e.kind === 'boss' ? 4.3 : e.kind === 'elite' ? 3.4 : 2.85;
      e.moveDamage = Math.round((e.kind === 'boss' ? 24 : e.kind === 'elite' ? 20 : 15) * e.damageMult);
      e.moveUnblockable = false;
      e.telegraph = this.vfx.createTelegraph('fan', e.pos, e.yaw, e.moveRange * 1.45, e.moveRange);
    } else if (move === 'lunge') {
      e.stateDuration = 0.74 * fast;
      e.moveRange = 2.6;
      e.moveDamage = Math.round((e.kind === 'boss' ? 28 : 22) * e.damageMult);
      e.moveUnblockable = false;
      e.telegraphPos.copy(e.pos);
      e.telegraph = this.vfx.createTelegraph('line', e.pos, e.yaw, 2.3, 8.8);
    } else if (move === 'slam') {
      e.stateDuration = 0.92 * fast;
      e.moveRange = e.kind === 'boss' ? 5.4 : 4.2;
      e.moveDamage = Math.round((e.kind === 'boss' ? 32 : 24) * e.damageMult);
      e.moveUnblockable = true;
      e.telegraphPos.copy(e.pos);
      e.telegraph = this.vfx.createTelegraph('circle', e.pos, 0, e.moveRange, e.moveRange, new THREE.Color(2.2, 0.2, 0.65));
    } else if (move === 'yinCircle') {
      e.stateDuration = 1.05;
      e.moveRange = 3.1;
      e.moveDamage = Math.round(20 * e.damageMult);
      e.moveUnblockable = true;
      e.telegraphPos.copy(targetPos ?? this.hero.pos);
      e.telegraph = this.vfx.createTelegraph('circle', e.telegraphPos, 0, e.moveRange, e.moveRange, new THREE.Color(1.4, 0.45, 2.35));
    } else if (move === 'orb' || move === 'barrage') {
      e.stateDuration = move === 'barrage' ? 0.75 : 0.68;
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
        const mesh = buildYinOrbMesh(e.kind === 'boss' || e.kind === 'elite');
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
      this.vfx.spawnGroundCrater(e.telegraphPos, e.moveRange * 0.72, new THREE.Color(1.4, 0.35, 2.2), 2.8);
      this.audio.playHit(true);
      if (Math.hypot(h.pos.x - e.telegraphPos.x, h.pos.z - e.telegraphPos.z) <= e.moveRange) {
        this.tryHitHero(e, e.moveDamage, true);
      }
      return;
    }

    if (e.moveKind === 'slam') {
      this.vfx.spawnShockRing(e.pos, new THREE.Color(2.3, 0.28, 0.65), 0.5, e.moveRange, 0.48);
      this.vfx.spawnBaguaArray({
        pos: new THREE.Vector3(e.pos.x, 0.09, e.pos.z),
        radius: e.moveRange,
        color: new THREE.Color(2.0, 0.25, 0.55),
        duration: 0.75,
      });
      this.vfx.spawnGroundCrater(e.pos, e.moveRange * 0.78, new THREE.Color(2.1, 0.25, 0.55), 3.4);
      this.audio.playHit(true);
      this.cameraRig.addShake(0.5);
      if (Math.hypot(h.pos.x - e.pos.x, h.pos.z - e.pos.z) <= e.moveRange) {
        this.tryHitHero(e, e.moveDamage, true);
      }
      return;
    }

    this.vfx.spawnSwordArc({
      pos: e.pos.clone().add(new THREE.Vector3(0, 1.15 * e.rig.scale, 0)),
      yaw: e.yaw,
      wide: e.kind === 'boss' || e.kind === 'elite',
      scale: e.kind === 'boss' ? 1.45 : e.kind === 'elite' ? 1.2 : 1.0,
      colorCore: new THREE.Color(2.3, 0.55, 0.45),
      colorEdge: new THREE.Color(1.5, 0.15, 0.35),
    });

    if (e.affix === 'storm') {
      this.vfx.spawnShockRing(e.pos, new THREE.Color(2.2, 1.5, 0.4), 0.3, e.moveRange + 0.8, 0.32);
    }

    let hitInBounds = false;
    if (e.moveKind === 'lunge') {
      const fx = Math.sin(e.yaw);
      const fz = Math.cos(e.yaw);
      const rx = h.pos.x - e.telegraphPos.x;
      const rz = h.pos.z - e.telegraphPos.z;
      const fwd = rx * fx + rz * fz;
      const perpDist = Math.abs(rx * fz - rz * fx);
      hitInBounds = fwd >= -0.4 && fwd <= 7.8 + h.radius && perpDist <= 1.15;
    } else {
      const dx = h.pos.x - e.pos.x;
      const dz = h.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      const diff = Math.abs(angleDiff(e.yaw, Math.atan2(dx, dz)));
      hitInBounds = dist <= e.moveRange + h.radius && (diff <= 0.82 || dist < 1.1);
    }

    if (hitInBounds) {
      const hitLanded = this.tryHitHero(e, e.moveDamage, e.moveUnblockable);
      if (hitLanded && e.affix === 'vampiric') {
        const leech = Math.round(e.moveDamage * 0.8);
        e.hp = Math.min(e.maxHp, e.hp + leech);
        this.spawnWorldCallout(`+${leech}`, e.pos, 'heal');
      }
    }
  }

  private tryHitHero(
    attacker: EnemyEntity | null,
    dmg: number,
    unblockable: boolean,
    attackerWorldPos?: THREE.Vector3,
  ): boolean {
    const h = this.hero;
    const loadout = this.getLoadoutStats();
    if (h.state === 'dead') return false;

    if (h.dodgeInvuln > 0) {
      if (!h.dodgePerfectTriggered && h.state === 'dodge') {
        h.dodgePerfectTriggered = true;
        h.shadowStrikeTimer = 3.5;
        h.spirit = Math.min(h.maxSpirit, h.spirit + 22);
        h.ult = Math.min(100, h.ult + 14 * this.blessings.ultGainMult * loadout.ultGainMult);
        this.timeScale = 0.28;
        this.slowMoTimer = 0.34;
        this.audio.playDodge(true);
        this.audio.playHeroVoice('dodge');
        this.vfx.spawnShockRing(h.pos, new THREE.Color(0.45, 2.1, 2.2), 0.25, 2.6, 0.35);
        this.spawnWorldCallout('极限闪避 · 瞬影!', h.pos, 'info');
        triggerHaptic('medium');
      }
      return false;
    }

    if (h.hurtInvuln > 0) return false;

    if (h.state === 'block' && !unblockable) {
      const refPos = attacker?.pos ?? attackerWorldPos;
      const fromYaw = refPos ? Math.atan2(refPos.x - h.pos.x, refPos.z - h.pos.z) : h.yaw;
      const frontal = Math.abs(angleDiff(h.yaw, fromYaw)) < 1.65;
      if (frontal) {
        if (h.blockElapsed <= 0.26 + loadout.parryWindowBonus) {
          h.parryCount += 1;
          if (this.mp.mode === 'offline' || this.mp.role === 'host') {
            this.saveStore.incrementStat('totalParries', 1);
          }
          h.spirit = Math.min(h.maxSpirit, h.spirit + 24 + loadout.parrySpiritBonus);
          h.ult = Math.min(100, h.ult + 22 * this.blessings.ultGainMult * loadout.ultGainMult);
          if (loadout.parryHeal > 0) {
            h.hp = Math.min(h.maxHp, h.hp + loadout.parryHeal);
          }
          h.hitstopTimer = 0.13;
          this.audio.playParry();
          this.cameraRig.addShake(0.44);
          triggerHaptic('parry');
          const sparkPos = h.pos.clone().add(new THREE.Vector3(Math.sin(h.yaw) * 0.7, 1.25, Math.cos(h.yaw) * 0.7));
          this.vfx.spawnParryBurst(sparkPos);
          this.spawnWorldCallout('完美弹反!', h.pos, 'parry');
          this.mp.sendAction('parry', { x: sparkPos.x, z: sparkPos.z });

          if (attacker) {
            attacker.hitstopTimer = 0.14;
            attacker.poise = Math.min(attacker.maxPoise, attacker.poise + 60);
            attacker.telegraph?.dispose();
            attacker.telegraph = null;
            attacker.comboFollowup = false;
            if (attacker.kind !== 'boss' || attacker.poise >= attacker.maxPoise) {
              attacker.poise = 0;
              attacker.aiState = 'stagger';
              attacker.stateTime = 0;
              attacker.stateDuration = attacker.kind === 'boss' ? 2.1 : 1.85;
              h.counterTargetId = attacker.id;
              h.counterWindowTimer = 1.5;
            }
            if (loadout.parryReflectBonus > 0 && attacker.hp > 0) {
              const reflectDmg = Math.round(dmg * (1.2 + loadout.parryReflectBonus) * this.getHeroDamageScale());
              this.damageEnemy(attacker, reflectDmg, true, h.yaw, 28, true, true, 'parry');
            }
          } else if (this.mp.mode === 'solo' && this.peer) {
            h.counterTargetId = -999;
            h.counterWindowTimer = 1.5;
          }
          return false;
        }

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
        triggerHaptic('light');
        if (h.stamina > 0) {
          this.spawnWorldCallout('格挡', h.pos, 'info');
          return false;
        }
        this.spawnWorldCallout('破防!', h.pos, 'crit');
      }
    }

    const finalDmg = Math.max(1, Math.round(dmg * (1 - loadout.dmgReduce)));
    if (!this.godMode) {
      h.hp = Math.max(0, h.hp - finalDmg);
    }
    h.hurtInvuln = 0.48;
    h.comboCount = 0;
    h.rig.triggerHitFlash(1.0);
    this.audio.playHit(true);
    this.cameraRig.addShake(0.36);
    triggerHaptic('heavy');
    this.spawnWorldCallout(`-${finalDmg}`, h.pos, 'crit');

    if (h.hp <= 0) {
      h.state = 'dead';
      h.stateTime = 0;
      if (this.mp.mode === 'coop' && this.peer && !this.peer.dead) {
        this.coopDowned = true;
        this.hud.showSubtitle('气血垂危！等待同门靠近援护即可重返剑阵！', 4.0);
      } else if (this.mp.mode === 'solo') {
        this.pvpResultDecided = true;
        this.mode = 'defeat';
        this.hud.setMode('defeat');
        this.hud.showResult(false, this.runElapsed, h, {
          customTitle: '惜 败 剑 台',
          customSub: '技差一招，整顿剑意后再战！',
        });
      } else {
        this.mode = 'defeat';
        this.hud.setMode('defeat');
        this.hud.showResult(false, this.runElapsed, h, {
          stageDef: this.getActiveStageDef(),
          dungeonDef: this.activeDungeon ?? undefined,
        });
      }
    } else if (h.state !== 'skillR') {
      h.state = 'hit';
      h.stateTime = 0;
      h.stateDuration = 0.28;
      const srcPos = attacker?.pos ?? attackerWorldPos;
      if (srcPos) {
        const pushYaw = Math.atan2(h.pos.x - srcPos.x, h.pos.z - srcPos.z);
        h.vel.set(Math.sin(pushYaw) * 4.5, 0, Math.cos(pushYaw) * 4.5);
      } else {
        h.vel.set(0, 0, 0);
      }
    }
    return true;
  }

  private reviveLocalHero(): void {
    const h = this.hero;
    this.coopDowned = false;
    h.hp = Math.round(h.maxHp * 0.55);
    h.delayedHp = h.hp;
    h.spirit = Math.max(h.spirit, 50);
    h.state = 'idle';
    h.hurtInvuln = 1.6;
    this.vfx.spawnHealVortex(h.pos);
    this.audio.playHeal();
    this.spawnWorldCallout('同门救援!', h.pos, 'heal');
    this.hud.showSubtitle('同门以真气相渡，重整剑势再战！', 2.8);
    triggerHaptic('medium');
  }

  private tryDeflectProjectiles(reach: number, halfCone: number): void {
    const h = this.hero;
    for (const p of this.projectiles) {
      if (p.friendly || p.kind !== 'yinOrb') continue;
      const dx = p.pos.x - h.pos.x;
      const dz = p.pos.z - h.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > reach + p.radius) continue;
      if (Math.abs(angleDiff(h.yaw, Math.atan2(dx, dz))) > halfCone && dist > 1.2) continue;

      p.friendly = true;
      p.age = 0;
      p.damage = Math.round(42 * this.getHeroDamageScale());
      const tgt = this.findNearestEnemy(18);
      if (tgt) {
        const dir = new THREE.Vector3(tgt.pos.x - p.pos.x, 0, tgt.pos.z - p.pos.z).normalize();
        p.vel.copy(dir).multiplyScalar(17.5);
      } else {
        p.vel.negate().multiplyScalar(1.6);
      }
      p.mesh.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshBasicMaterial) {
          obj.material.color.setRGB(0.5, 2.25, 2.3);
        }
      });
      this.audio.playParry();
      triggerHaptic('parry');
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
            this.applyHeroAttackToEnemy(e, p.damage, p.kind === 'flyingSword', yaw, 24, p.kind === 'yinOrb', 'skillQ');
            if (p.kind === 'yinOrb') {
              remove = true;
              break;
            }
          }
        }
        if (
          !remove &&
          this.mp.mode === 'solo' &&
          this.peer &&
          !this.peer.dead &&
          !p.hitIds.has(-999) &&
          Math.hypot(this.peer.pos.x - p.pos.x, this.peer.pos.z - p.pos.z) <= this.peer.radius + p.radius
        ) {
          p.hitIds.add(-999);
          const yaw = Math.atan2(p.vel.x, p.vel.z);
          this.sendPvpStrike(34, 24, true, yaw, 'skillQ');
        }
      } else if (!remove && !p.friendly) {
        if (Math.hypot(h.pos.x - p.pos.x, h.pos.z - p.pos.z) <= h.radius + p.radius) {
          this.tryHitHero(null, p.damage, false, p.pos);
          remove = true;
        }
      }

      if (remove) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private resolveEntitySeparation(): void {
    const h = this.hero;
    const heroSolid = h.state !== 'dodge' && h.state !== 'dead';

    if (heroSolid && this.peer && !this.peer.dead && this.mp.mode === 'solo') {
      const dx = h.pos.x - this.peer.pos.x;
      const dz = h.pos.z - this.peer.pos.z;
      const minD = h.radius + this.peer.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < minD * minD && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (minD - d) * 0.5;
        h.pos.x += (dx / d) * push;
        h.pos.z += (dz / d) * push;
      }
    }

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
    if (this.mp.mode === 'solo') return;
    if (this.mp.mode === 'coop' && this.mp.role === 'guest') return;

    const stageDef = this.getActiveStageDef();

    if (this.stagePhase === 'combat') {
      const anyAlive = this.enemies.some((e) => e.aiState !== 'dead');
      if (anyAlive) return;

      if (this.currentWaveIdx + 1 < stageDef.waves.length) {
        this.stagePhase = 'waveTransition';
        this.stageTimer = 1.65;
        this.hud.showSubtitle(`第 ${this.currentWaveIdx + 1} 波肃清——前方妖气再聚！`, 1.2);
      } else {
        this.stagePhase = 'done';
        this.stageTimer = 1.2;
        this.audio.setMood('victory');
        this.hud.showSubtitle(stageDef.victoryLine, 2.2);
      }
    } else if (this.stagePhase === 'waveTransition') {
      this.stageTimer -= dt;
      if (this.stageTimer <= 0) {
        this.currentWaveIdx += 1;
        this.stagePhase = 'combat';
        this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + 12);
        this.hero.spirit = Math.min(this.hero.maxSpirit, this.hero.spirit + 25);
        this.spawnWave(stageDef, this.currentWaveIdx, this.mp.mode !== 'coop');
      }
    } else if (this.stagePhase === 'done') {
      this.stageTimer -= dt;
      if (this.stageTimer <= 0 && this.mode === 'playing') {
        this.completeCurrentStage();
      }
    }
  }

  private completeCurrentStage(): void {
    for (const gear of this.vfx.collectAllGearDrops()) {
      this.saveStore.addRolledItem(gear);
      this.stageDroppedGear.push(gear);
    }

    if (this.activeDungeon) {
      const dungeon = this.activeDungeon;
      this.saveStore.recordDungeonClear(dungeon.id);
      this.saveStore.incrementStat('totalDungeons', 1);
      const clearBonus = dungeon.jadeReward;
      this.hero.stageJadeEarned += clearBonus;
      this.saveStore.addJade(clearBonus);
      this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);

      this.mode = 'victory';
      this.hud.clearSubtitle();
      this.hud.setMode('victory');
      this.audio.playHeroVoice('victory');
      const opts: ResultDisplayOptions = {
        stageDef: dungeon.stageDef,
        dungeonDef: dungeon,
        droppedGear: this.stageDroppedGear.length > 0 ? [...this.stageDroppedGear] : undefined,
        nextStageId: null,
        jadeEarned: this.hero.stageJadeEarned,
      };
      this.hud.showResult(true, this.runElapsed, this.hero, opts);
      return;
    }

    const stageDef = getStageDef(this.currentStageId);
    const starResult = evaluateStageStars(
      stageDef,
      this.runElapsed,
      this.hero.hp / Math.max(1, this.hero.maxHp),
      this.hero.parryCount,
    );
    const { firstClear } = this.saveStore.recordClear(stageDef.id, starResult.stars, this.runElapsed, this.hero.maxCombo);
    const clearBonus = 60 + stageDef.id * 16 + starResult.stars * 30 + (firstClear ? 90 : 0);
    this.hero.stageJadeEarned += clearBonus;
    this.saveStore.addJade(clearBonus);
    this.hud.syncCampaignProgress(this.saveStore, stageDef.id < 20 ? stageDef.id + 1 : 20);

    const nextStageId = stageDef.id < 20 ? stageDef.id + 1 : null;
    const blessingChoices = nextStageId && this.mp.mode === 'offline' ? pickBlessingChoices(this.rng, 3) : undefined;

    this.mode = 'victory';
    this.hud.clearSubtitle();
    this.hud.setMode('victory');
    this.audio.playHeroVoice('victory');
    const opts: ResultDisplayOptions = {
      stageDef,
      starResult,
      nextStageId: this.mp.mode === 'offline' ? nextStageId : null,
      blessingChoices,
      droppedGear: this.stageDroppedGear.length > 0 ? [...this.stageDroppedGear] : undefined,
      jadeEarned: this.hero.stageJadeEarned,
    };
    this.hud.showResult(true, this.runElapsed, this.hero, opts);
  }

  // ==================== Multiplayer Networking Handlers ====================

  private tickMultiplayerSync(rawDt: number): void {
    if (this.mp.mode === 'offline' || !this.mp.peerConnected) return;

    this.netStateTimer += rawDt;
    if (this.netStateTimer >= 0.05) {
      this.netStateTimer = 0;
      const h = this.hero;
      const pose =
        h.state === 'run'
          ? 'run'
          : h.state === 'block'
            ? 'block'
            : h.state === 'dodge'
              ? 'dodge'
              : h.state === 'dead'
                ? 'dead'
                : h.state === 'attack'
                  ? `combo${h.comboStep || 1}`
                  : 'combatIdle';
      this.mp.sendPlayerState({
        x: Number(h.pos.x.toFixed(3)),
        z: Number(h.pos.z.toFixed(3)),
        yaw: Number(h.yaw.toFixed(3)),
        hp: Math.round(h.hp),
        maxHp: h.maxHp,
        spirit: Math.round(h.spirit),
        ult: Math.round(h.ult),
        state: h.state,
        pose,
        combo: h.comboStep,
        blocking: h.state === 'block',
        dead: h.state === 'dead',
      });
    }

    if (this.mp.mode === 'coop' && this.mp.role === 'host') {
      this.netEnemyTimer += rawDt;
      if (this.netEnemyTimer >= 0.066) {
        this.netEnemyTimer = 0;
        const snaps: EnemyNetSnapshot[] = this.enemies.map((e) => ({
          id: e.id,
          kind: e.kind,
          x: Number(e.pos.x.toFixed(3)),
          z: Number(e.pos.z.toFixed(3)),
          yaw: Number(e.yaw.toFixed(3)),
          hp: Math.round(e.hp),
          maxHp: e.maxHp,
          poise: Math.round(e.poise),
          maxPoise: e.maxPoise,
          aiState: e.aiState,
          phase: e.phase,
          moveKind: e.moveKind,
        }));
        this.mp.sendEnemySync(snaps, this.currentStageId);
      }
    }
  }

  private updatePeerHero(dt: number): void {
    const p = this.peer;
    if (!p) return;
    p.pos.x = damp(p.pos.x, p.targetPos.x, 14, dt);
    p.pos.z = damp(p.pos.z, p.targetPos.z, 14, dt);
    p.yaw = dampAngle(p.yaw, p.targetYaw, 14, dt);
    p.rig.root.position.copy(p.pos);
    p.rig.root.rotation.y = p.yaw;
    p.hpBarGroup.quaternion.copy(this.camera.quaternion);
    p.hpFillMesh.scale.x = clamp(p.hp / Math.max(1, p.maxHp), 0.001, 1);
    const speed = p.state === 'run' ? 6.5 : 0;
    p.rig.applyPose(toPoseName(p.pose), (this.elapsed * 2.1) % 1, this.elapsed, dt, speed);
  }

  private handlePeerStatePacket(pkt: PeerTransformPacket): void {
    const p = this.peer;
    if (!p) return;
    p.targetPos.set(Number(pkt.x || 0), 0, Number(pkt.z || 0));
    p.targetYaw = Number(pkt.yaw || 0);
    p.hp = Number(pkt.hp ?? p.hp);
    p.maxHp = Number(pkt.maxHp ?? p.maxHp);
    p.spirit = Number(pkt.spirit ?? p.spirit);
    p.ult = Number(pkt.ult ?? p.ult);
    p.state = String(pkt.state || 'idle');
    p.pose = String(pkt.pose || 'combatIdle');
    p.blocking = Boolean(pkt.blocking);
    p.dead = Boolean(pkt.dead);

    if (this.mp.mode === 'solo' && p.dead && !this.pvpResultDecided) {
      this.pvpResultDecided = true;
      this.mode = 'victory';
      this.hud.setMode('victory');
      this.audio.setMood('victory');
      this.hud.showResult(true, this.runElapsed, this.hero, {
        customTitle: '剑 台 魁 首',
        customSub: `击败对手 ${p.name}，剑意凌绝锁妖台！`,
      });
    }
    if (this.mp.mode === 'coop' && this.coopDowned && p.dead && this.mode === 'playing') {
      this.mode = 'defeat';
      this.hud.setMode('defeat');
      this.hud.showResult(false, this.runElapsed, this.hero, {
        customTitle: '双 剑 俱 折',
        customSub: '两名同门皆已重伤，整顿后再闯锁妖台。',
      });
    }
  }

  private handlePeerActionPacket(pkt: Record<string, unknown>): void {
    const p = this.peer;
    if (!p) return;
    const kind = String(pkt.kind || '');
    const px = Number(pkt.x ?? p.pos.x);
    const pz = Number(pkt.z ?? p.pos.z);
    const yaw = Number(pkt.yaw ?? p.yaw);
    const origin = new THREE.Vector3(px, 0, pz);

    if (kind === 'attack') {
      const step = clamp(Math.round(Number(pkt.step || 1)), 1, 3);
      this.audio.playSwordSwing(step);
      this.spawnSwordComboVfx(origin, yaw, step);
    } else if (kind === 'dodge') {
      this.audio.playDodge(false);
      this.vfx.spawnAfterimage(origin, yaw, new THREE.Color(0.35, 1.55, 1.85), p.rig.root);
    } else if (kind === 'parry') {
      this.audio.playParry();
      this.vfx.spawnParryBurst(origin.clone().setY(1.2));
    } else if (kind === 'parryCounter') {
      this.audio.playSwordSwing(3);
      this.vfx.spawnAfterimage(origin, yaw, new THREE.Color(2.2, 1.8, 0.55), p.rig.root);
    } else if (kind === 'skillQ') {
      this.audio.playSkillQ();
      this.spawnFlyingSwordProjectile(origin, yaw, this.mp.mode !== 'solo');
    } else if (kind === 'skillE') {
      this.audio.playSkillE();
      const center = new THREE.Vector3(Number(pkt.cx ?? px), 0, Number(pkt.cz ?? pz));
      this.castSkillEAt(center, false);
    } else if (kind === 'skillR') {
      this.audio.playSkillR();
      const center = new THREE.Vector3(Number(pkt.cx ?? px), 0, Number(pkt.cz ?? pz));
      this.castSkillRAt(center, false);
    } else if (kind === 'drink') {
      this.audio.playHeal();
      this.vfx.spawnHealVortex(origin);
    }
  }

  private handleEnemySyncPacket(snaps: EnemyNetSnapshot[], stageNum: number): void {
    if (this.mp.mode !== 'coop' || this.mp.role !== 'guest') return;
    if (stageNum !== this.currentStageId) {
      this.enterStage(clamp(Math.floor(stageNum), 1, 20), false, false);
    }
    const seen = new Set<number>();
    for (const s of snaps) {
      seen.add(s.id);
      let e = this.enemies.find((x) => x.id === s.id);
      if (!e && s.aiState !== 'dead') {
        const kind = s.kind === 'boss' || s.kind === 'elite' || s.kind === 'caster' ? s.kind : 'bladesman';
        e = this.spawnEnemy(kind, s.x, s.z, s.id);
      }
      if (!e) continue;
      e.telegraphPos.set(s.x, 0, s.z);
      e.yaw = s.yaw;
      if (s.hp < e.hp) e.rig.triggerHitFlash(0.8);
      e.hp = s.hp;
      e.maxHp = s.maxHp;
      e.poise = s.poise;
      e.maxPoise = s.maxPoise;
      if (e.phase === 1 && s.phase === 2) {
        e.phase = 2;
        e.rig.setPhase2(true);
        this.audio.setMood('boss2');
      }
      if (e.aiState !== 'dead' && s.aiState === 'dead') {
        this.killEnemy(e);
      } else {
        e.aiState = s.aiState as EnemyEntity['aiState'];
      }
      e.moveKind = s.moveKind as EnemyEntity['moveKind'];
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!seen.has(e.id) && e.aiState !== 'dead') {
        e.telegraph?.dispose();
        this.scene.remove(e.rig.root);
        this.enemies.splice(i, 1);
      }
    }
  }

  private handleGuestEnemyHit(pkt: {
    enemyId: number;
    damage: number;
    poise: number;
    heavy: boolean;
    skill?: string;
  }): void {
    if (this.mp.mode !== 'coop' || this.mp.role !== 'host') return;
    const e = this.enemies.find((x) => x.id === pkt.enemyId && x.aiState !== 'dead');
    if (!e) return;
    const yaw = this.peer ? Math.atan2(e.pos.x - this.peer.pos.x, e.pos.z - this.peer.pos.z) : 0;
    this.damageEnemy(e, pkt.damage, pkt.heavy, yaw, pkt.poise, pkt.skill === 'skillR', false, pkt.skill);
  }

  private sendPvpStrike(damage: number, poise: number, heavy: boolean, yaw: number, skill?: string): void {
    if (!this.peer) return;
    const h = this.hero;
    h.spirit = Math.min(h.maxSpirit, h.spirit + (heavy ? 12 : 7));
    h.ult = Math.min(100, h.ult + (heavy ? 14 : 8));
    h.comboCount += 1;
    h.comboDecayTimer = 3.2;
    h.maxCombo = Math.max(h.maxCombo, h.comboCount);
    h.totalDamage += damage;
    this.peer.rig.triggerHitFlash(1.0);
    this.audio.playHit(heavy);
    this.cameraRig.addShake(heavy ? 0.3 : 0.14);
    triggerHaptic(heavy ? 'medium' : 'light');
    this.spawnWorldCallout(`${damage}`, this.peer.pos, heavy ? 'crit' : 'dmg');
    this.vfx.spawnHitSparks(
      this.peer.pos.clone().setY(1.15),
      new THREE.Vector3(Math.cos(yaw), 0.25, -Math.sin(yaw)),
      heavy ? new THREE.Color(2.4, 1.9, 0.5) : new THREE.Color(1.4, 2.2, 2.3),
      heavy ? 14 : 9,
      this.rng,
    );
    this.mp.sendPvpHit(damage, poise, heavy, Math.sin(yaw) * 4.2, Math.cos(yaw) * 4.2, skill);
  }

  private handleIncomingPvpHit(pkt: {
    damage: number;
    poise: number;
    heavy: boolean;
    knockX: number;
    knockZ: number;
    skill?: string;
  }): void {
    if (this.mp.mode !== 'solo' || this.pvpResultDecided) return;
    this.tryHitHero(null, pkt.damage, pkt.skill === 'skillR', this.peer?.pos);
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
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: (value: number) => {
        this.rng = createSeededRandom(value);
      },
      setState: (name: string) => {
        if (name === 'title') {
          this.enterTitleMode();
        } else if (name === 'active-play') {
          this.startNewRun(false, 1, false, true);
          this.hero.pos.set(0, 0, 2.8);
          this.hero.yaw = Math.PI;
          this.hero.rig.root.position.copy(this.hero.pos);
          this.startHeroAttack(1);
          this.stepFrame(0.18, false);
        } else if (name === 'boss-fight') {
          this.startNewRun(true, 20, false, true);
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
          this.startNewRun(false, 20, false, true);
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
          this.hud.showResult(true, this.runElapsed, this.hero, {
            stageDef: getStageDef(20),
          });
        } else if (name === 'defeat') {
          this.startNewRun(false, 1, false, true);
          this.hud.clearSubtitle();
          this.hero.hp = 0;
          this.hero.state = 'dead';
          this.mode = 'defeat';
          this.hud.setMode('defeat');
          this.hud.showResult(false, 48, this.hero, {
            stageDef: getStageDef(1),
          });
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
        this.input.setDebugVisible(!hidden);
      },
    };

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
      toBoss: () => this.startNewRun(true, 20, false, true),
      toStage: (stage: number) => this.startNewRun(false, clamp(Math.floor(stage), 1, 20), false, true),
      stageNum: () => this.currentStageId,
      wave: () => this.currentWaveIdx + 1,
      totalStars: () => this.saveStore.getTotalStars(),
      jade: () => this.saveStore.getJade(),
      buyItem: (id: string) => {
        const res = this.saveStore.buyItem(id);
        if (res.ok) {
          this.applyCurrentLoadoutVisuals();
          this.syncLiveHeroCapsFromLoadout();
          this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
        }
        return res.ok;
      },
      equipItem: (id: string) => {
        const ok = this.saveStore.equipItem(id);
        if (ok) {
          this.applyCurrentLoadoutVisuals();
          this.syncLiveHeroCapsFromLoadout();
          this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
        }
        return ok;
      },
      confirmDialogue: () => this.confirmStageDialogue(),
      vfxGhostStats: () => this.vfx.getGhostStats(),
      version: APP_VERSION,
      openMap: (chapterId?: 1 | 2 | 3 | 4) => this.hud.openCampaignMap(chapterId),
      clearCurrentStage: () => {
        for (const e of this.enemies) {
          if (e.aiState !== 'dead') this.killEnemy(e);
        }
        this.completeCurrentStage();
      },
      god: (on = true) => {
        this.godMode = on;
      },
      mode: () => this.mode,
      stage: () => `stage${this.currentStageId}:wave${this.currentWaveIdx + 1}:${this.stagePhase}`,
      peer: () =>
        this.peer
          ? {
              name: this.peer.name,
              isEnemy: this.peer.isEnemy,
              x: this.peer.pos.x,
              z: this.peer.pos.z,
              hp: this.peer.hp,
              dead: this.peer.dead,
            }
          : null,
      mpCreate: (mode: 'coop' | 'solo', stage = 1) => this.mp.createRoom(mode, stage, '测试侠客'),
      mpJoin: (code: string) => this.mp.joinRoom(code, '测试同门'),
      mpRoom: () => this.mp.roomCode,
    };

    (window as unknown as Record<string, unknown>).__gameDebug = {
      startDungeon: (dungeonId: string, skipDialogue = true) => this.startDungeon(dungeonId, skipDialogue),
      spawnTestGearDrop: (rarity: EquipRarity = 'legendary', tier: 1 | 2 | 3 = 3) => {
        const item = rollEquipmentDrop({
          tier,
          guaranteedMinRarity: rarity,
          source: '调试掉宝',
          rng: this.rng,
        });
        const dropPos = this.hero.pos
          .clone()
          .add(new THREE.Vector3(Math.sin(this.hero.yaw) * 3.2, 0, Math.cos(this.hero.yaw) * 3.2));
        this.vfx.spawnGearDrop(dropPos, item, this.rng);
        this.audio.playGearDropChime(item.rarity);
        return item;
      },
      getInventoryCount: () => this.saveStore.getInventory().length,
    };
  }

  private publishDiagnostics(): void {
    const stats = this.pipeline.getStats();
    const boss = this.getActiveBoss();
    const aliveMobs = this.enemies.filter((e) => e.aiState !== 'dead').length;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: this.runElapsed,
      score: Math.max(0, 3 - aliveMobs) + (boss && boss.aiState === 'dead' ? 1 : 0),
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

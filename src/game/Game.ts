import * as THREE from 'three';
import { GameInput } from '../core/Input';
import {
  DEFAULT_VISUAL_SETTINGS,
  RenderPipeline,
  type AtmosphereThemeId,
  type VisualSettingsState,
} from '../core/RenderPipeline';
import { triggerHaptic } from '../core/NativeBridge';
import { ShushanArena, type WorldBiome } from '../world/ShushanArena';
import { VfxSystem } from '../vfx/VfxSystem';
import { AudioEngine, type HeroVoiceKind } from '../systems/AudioEngine';
import { CameraRig } from '../systems/CameraRig';
import {
  HudController,
  type CombatThreatState,
  type HudTacticalState,
  type MinimapEntityDot,
  type ResultDisplayOptions,
  type ScreenMode,
} from '../ui/HudController';
import {
  buildFlyingSwordMesh,
  buildYinOrbMesh,
  createEnemy,
  createHero,
  createPeerHero,
  createPracticeDummy,
  ENEMY_BASE_STATS,
  type EnemyCreateOverrides,
  type EnemyEntity,
  type HeroState,
  type PeerHeroState,
  type ProjectileEntity,
} from './CombatEntities';
import {
  BIOME_LABELS,
  CAMP_MEALS,
  CAMPAIGN_STAGES,
  CULTIVATION_STEPS,
  CampaignSaveStore,
  type ChapterDef,
  type ChapterId,
  type DungeonDef,
  type StageDef,
  type StageDialogueDef,
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
  getSwordHeartSummary,
  getSwordRealm,
  pickBlessingChoices,
} from './CampaignData';
import {
  type EquipCategory,
  type EquipRarity,
  type HeroLoadoutStats,
  type RolledGearItem,
  RARITY_LABELS,
  SHOP_ITEM_MAP,
  computeCombatPower,
  getEquippedSkinVisual,
  getEquippedWeaponVisual,
  rollEquipmentDrop,
} from './EquipmentData';
import {
  CRAFT_MATERIAL_MAP,
  type MaterialId,
} from './AlchemyCraftData';
import {
  getDifficultyTier,
  evaluateCombatRank,
  getTowerFloorDef,
  LEYLINE_AFFIX_MAP,
  pickRoguelikeBlessings,
  ROGUELIKE_BLESSINGS,
  ROGUELIKE_CHAMBERS,
  TOWER_FLOORS,
  type DifficultyTierId,
  type LeylineAffixId,
  type TowerFloorDef,
} from './EndgameData';
import { APP_VERSION } from '../version';
import {
  MultiplayerClient,
  type EnemyNetSnapshot,
  type PeerTransformPacket,
} from '../net/MultiplayerClient';
import { angleDiff, clamp, damp, dampAngle } from '../utils/math';
import { createSeededRandom } from '../utils/random';
import {
  CharacterRig,
  type HeroArmorVisual,
  type HeroRelicVisual,
  type PoseName,
} from '../entities/CharacterRig';
import { MountRig, type MountMode } from '../entities/MountRig';
import {
  getWorldRegionAt,
  WORLD_BOSS_SPAWNS,
  WORLD_BOUND,
  WORLD_CHESTS,
  WORLD_HERB_NODES,
  WORLD_MOB_CAMPS,
  WORLD_SPAWN_POS,
  WORLD_SPIRIT_ORBS,
  WORLD_WAYPOINTS,
  type WorldBossDef,
  type WorldHerbNodeDef,
  type WorldMobCampDef,
} from './OpenWorldData';
import {
  AncientMapOverlay,
  type AncientMapBossLive,
  type AncientMapNpcPin,
  type AncientMapSnapshot,
} from '../ui/AncientMapOverlay';
import {
  CharacterRosterOverlay,
  type RosterLiveSnapshot,
} from '../ui/CharacterRosterOverlay';
import { AlchemyCraftOverlay } from '../ui/AlchemyCraftOverlay';
import { resolveCharacterProfileId } from './CharacterRosterData';
import {
  CAMP_MEDITATION_QUOTES,
  CAMP_TEA_QUOTES,
  CHAPTER_EPILOGUES,
  EPISODE_STORY_SCRIPTS,
  STAGE_20_EPILOGUE,
  STAGE_25_EPILOGUE,
  getBossCutsceneTaunt,
  getBossEnrageLine,
  getChapterEpilogue,
  getWineMasterCampDialogue,
  getXuanyingCampDialogue,
} from './StoryScripts';

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
  'mountHorse',
  'mountSword',
  'showcaseFlourish',
]);

function toPoseName(raw: string): PoseName {
  return VALID_POSES.has(raw as PoseName) ? (raw as PoseName) : 'combatIdle';
}

export class Game {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.6, 240);
  private readonly pipeline: RenderPipeline;
  private readonly input: GameInput;
  private readonly audio: AudioEngine;
  private readonly cameraRig: CameraRig;
  private readonly hud: HudController;
  private readonly ancientMap: AncientMapOverlay;
  private readonly rosterOverlay: CharacterRosterOverlay;
  private readonly craftOverlay: AlchemyCraftOverlay;
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
  private q2AttackActive = false;
  private q2DashTargetId: number | null = null;
  private corridorMode = false;
  private healingShrineCollected = false;
  private activeDialogueDef: StageDialogueDef | null = null;
  private dialogueContext: 'preStage' | 'campNpc' | 'epilogue' | 'replay' = 'preStage';
  private lastEpilogueStageId = 20;
  private pendingEpilogueResultOpts: ResultDisplayOptions | null = null;
  private lastEpilogueResultOpts: ResultDisplayOptions | null = null;
  private campNpcGroup: THREE.Group | null = null;
  private campNpcWineMaster: { rig: CharacterRig; pos: THREE.Vector3; yaw: number; label: string; drinkCycle: number } | null = null;
  private campNpcXuanying: { rig: CharacterRig; pos: THREE.Vector3; yaw: number; label: string; sparTimer: number } | null = null;
  private activeCampHotspot: 'wine' | 'ally' | 'mat' | 'tea' | null = null;
  private campDialogueFocusPos: THREE.Vector3 | null = null;
  private campMeditationIdx = 0;
  private campTeaIdx = 0;
  private storySubtitleUntil = 0;
  private lastVoiceSubtitleAt = -999;
  private activeMealBuff = { hpBonus: 0, dmgBonus: 0, speedBonus: 0, ultBonus: 0 };
  private episodeChoiceBuff = { dmgBonus: 0, speedBonus: 0, hpBonus: 0, ultBonus: 0, extraGourd: 0 };
  private moonKeyLight: THREE.DirectionalLight | null = null;
  private titlePortraitLight: THREE.DirectionalLight | null = null;

  // Persisted Beautification & Gameplay Settings
  private static readonly VISUAL_SETTINGS_STORAGE_KEY = 'shushan_visual_settings_v1';
  private visualSettings: VisualSettingsState = { ...DEFAULT_VISUAL_SETTINGS };
  private readonly urlForcedMute: boolean;
  private lastBiomeApplied: WorldBiome = 'bamboo_canyon';
  private lastChapterApplied: ChapterDef | undefined;

  // Honor-of-Kings 360° Shop Dressing-Room Stage & Studio Lighting
  private shopStageGroup: THREE.Group | null = null;
  private shopPedestalSpinGroup: THREE.Group | null = null;
  private shopPedestalInnerMat: THREE.MeshBasicMaterial | null = null;
  private shopPedestalOuterMat: THREE.MeshBasicMaterial | null = null;
  private shopBackdropMesh: THREE.Mesh | null = null;
  private shopKeyLight: THREE.DirectionalLight | null = null;
  private shopFillLight: THREE.DirectionalLight | null = null;
  private shopRimLight: THREE.DirectionalLight | null = null;

  private readonly mountRig = new MountRig();
  private mountMode: MountMode = 'none';
  private mountDashTimer = 0;
  private mountWindTimer = 0;
  private readonly mountTrampleHitIds = new Set<number>();
  private worldMobTimers = new Map<string, number>();
  private worldBossTimers = new Map<string, number>();
  private worldHerbTimers = new Map<string, number>();
  private worldLastRegionId = '';
  private activeWorldInteract: { kind: 'waypoint' | 'chest' | 'herb'; id: string; label: string } | null = null;
  private worldLavaBurnTimer = 0;
  private worldEventTimer = 38;
  private worldEventEnemyId: number | null = null;
  private worldEventExpireTimer = 0;
  private readonly worldGuideArrow = new THREE.Group();
  private worldGuideCategory: 'auto' | 'waypoint' | 'chest' | 'orb' | 'boss' = 'auto';
  private worldAutoNav = false;
  private worldAutoNavPolicy: 'fight' | 'evade' = 'fight';
  private worldAutoCombatActive = false;
  private worldAutoResumeTimer = 0;
  private worldAutoAttackCd = 0;
  private worldCustomNavTarget: { x: number; z: number; label: string; herbId?: string } | null = null;
  private worldInCombat = false;
  private worldCombatCooldown = 0;
  private worldAutoNavPausedByCombat = false;
  private worldLastCombatNotice = '';

  private shopPreviewActive = false;
  private shopPreviewSkinId: string | null = null;
  private shopPreviewWeaponId: string | null = null;
  private shopPreviewArmorId: string | null = null;
  private shopPreviewRelicId: string | null = null;
  private shopPreviewYaw = 0;
  private shopPreviewYawVel = 0;
  private shopPreviewPitch = 0;
  private shopPreviewZoom = 0;
  private shopPreviewZoomTarget = 0;
  private shopPreviewAutoSpin = false;
  private shopTryOnTimer = 0;
  private readonly shopTryOnDuration = 1.15;
  private shopTryOnCount = 0;
  private shopLastTryOnEffect = '';
  private shopAmbientSparkTimer = 0;

  private activeTowerFloor: TowerFloorDef | null = null;
  private roguelikeState: {
    active: boolean;
    chamberIdx: number;
    greedNext: boolean;
    totalJade: number;
  } | null = null;
  private monolithHp = 0;
  private monolithMaxHp = 0;
  private surviveRemainSec = 0;
  private surviveSpawnTimer = 0;
  private leylineZoneActive = false;
  private leylineZonePos = new THREE.Vector3(0, 0, 2.5);
  private leylineZoneTimer = 0;
  private heroInLeylineZone = false;
  private combatStyleScore = 0;
  private combatStylePeak = 0;
  private combatStyleDecayTimer = 0;
  private lastStyleAction = '';
  private lotusProcCooldown = 0;

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
  private waterRippleTimer = 0;

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
    this.urlForcedMute = urlForcedMute;
    this.godMode = params.has('god');

    this.pipeline = new RenderPipeline(canvas, this.scene, this.camera);
    this.input = new GameInput(canvas);
    this.audio = new AudioEngine(urlForcedMute, !urlForcedMute);
    this.cameraRig = new CameraRig(this.camera);

    this.setupLighting();
    this.setupShopStudioStage();

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
    this.scene.add(this.mountRig.root);
    this.applyCurrentLoadoutVisuals();

    // 3D Open-World Ground Compass Guide Arrow (points along +Z toward active target)
    const arrowGoldMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.1, 1.75, 0.55),
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const arrowCyanMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.45, 2.2, 2.15),
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const arrowTip = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.52, 4), arrowGoldMat);
    arrowTip.rotation.x = Math.PI / 2;
    arrowTip.rotation.y = Math.PI / 4;
    arrowTip.scale.set(1.15, 1.0, 0.28);
    arrowTip.position.set(0, 0, 0.28);
    const arrowShaft = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.34), arrowCyanMat);
    arrowShaft.position.set(0, 0, -0.08);
    const arrowBase = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.35, 16), arrowCyanMat);
    arrowBase.rotation.x = -Math.PI / 2;
    this.worldGuideArrow.add(arrowTip, arrowShaft, arrowBase);
    this.worldGuideArrow.visible = false;
    this.scene.add(this.worldGuideArrow);

    this.mp = new MultiplayerClient({
      onStatus: (text, connected) => {
        this.hud.setMpLobbyStatus(text, connected, this.mp.mode !== 'offline');
      },
      onRoomCreated: (code, mode, stageId, quickMatch) => {
        const modeLabel = mode === 'solo' ? '1v1 单挑' : '双人组队';
        const prefix = quickMatch ? '快速匹配已建房' : `${modeLabel}房间已创建`;
        this.hud.setMpLobbyStatus(`${prefix} · 房间码【${code}】等待同门加入...`, true, true);
        this.hud.setMpHudBadge(`${modeLabel} · ${code}`);
        this.currentStageId = clamp(Math.floor(stageId), 1, CAMPAIGN_STAGES.length);
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
        this.startMultiplayerMatch(info.mode, clamp(Math.floor(info.stage), 1, CAMPAIGN_STAGES.length), peerName);
      },
      onPeerState: (pkt) => this.handlePeerStatePacket(pkt),
      onPeerAction: (pkt) => this.handlePeerActionPacket(pkt),
      onEnemySync: (enemies, stageNum) => this.handleEnemySyncPacket(enemies, stageNum),
      onEnemyHitFromGuest: (pkt) => this.handleGuestEnemyHit(pkt),
      onPvpHit: (pkt) => this.handleIncomingPvpHit(pkt),
      onStageSync: (stageNum, bossIntro) => {
        if (this.mp.mode === 'coop' && this.mp.role === 'guest') {
          this.enterStage(clamp(Math.floor(stageNum), 1, CAMPAIGN_STAGES.length), bossIntro, false);
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
      onConfirmDialogue: (choiceId?: string) => {
        this.confirmStageDialogue(choiceId);
      },
      onDialogueChoiceSelect: () => {
        this.audio.unlock();
        this.audio.playDialogueStep(true);
      },
      onEnterCamp: () => {
        this.enterCampMode();
      },
      onEnterOpenWorld: () => {
        this.enterOpenWorldMode();
      },
      onToggleMount: (mode) => {
        this.toggleMount(mode);
      },
      onWorldInteract: () => {
        this.triggerWorldInteract();
      },
      onWorldTeleport: (waypointId) => {
        this.teleportToWorldWaypoint(waypointId);
      },
      onWorldRespawnBosses: () => {
        this.respawnAllWorldBosses();
      },
      onWorldCycleGuide: () => {
        this.cycleWorldGuideCategory();
      },
      onWorldToggleAutoNav: () => {
        this.toggleWorldAutoNav();
      },
      onWorldToggleNavPolicy: () => {
        const next: 'fight' | 'evade' = this.worldAutoNavPolicy === 'fight' ? 'evade' : 'fight';
        this.applyVisualSettings({ autoNavPolicy: next }, true);
        this.hud.showWorldToast(
          next === 'evade'
            ? '自动寻路策略已切为【智能绕行 · 御剑避战】'
            : '自动寻路策略已切为【自动迎战 · 清敌续行】',
          true,
          2400,
        );
        return next;
      },
      onCampInteract: () => {
        this.triggerCampHotspotInteract();
      },
      onLeaveCampToEpisode: (stageId: number) => {
        this.mp.leave();
        this.clearPeerHero();
        this.hud.setMpHudBadge('');
        this.hud.setHeroName('李逍遥');
        this.blessings = createEmptyBlessings();
        this.startNewRun(false, stageId, false, false);
      },
      onCampCultivate: () => {
        const res = this.saveStore.breakthroughCultivation();
        if (res.ok) {
          this.syncLiveHeroCapsFromLoadout();
          this.audio.playDropChime('spirit');
          triggerHaptic('heavy');
          this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
        } else {
          this.hud.showCampErrorToast?.(res.reason);
        }
        return res;
      },
      onCampSelectMeal: (mealId: string) => {
        const res = this.saveStore.selectCampMeal(mealId);
        if (res.ok) {
          this.audio.playHeal();
          triggerHaptic('light');
          this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
        } else {
          this.hud.showCampErrorToast?.(res.reason);
        }
        return res;
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
      onReplayEpilogue: () => {
        if (!this.lastEpilogueResultOpts) return;
        const ep =
          getChapterEpilogue(this.lastEpilogueStageId, this.saveStore.getSwordHeart()) ?? STAGE_25_EPILOGUE;
        this.pendingEpilogueResultOpts = this.lastEpilogueResultOpts;
        this.dialogueContext = 'epilogue';
        this.activeDialogueDef = ep;
        this.mode = 'dialogue';
        this.audio.playDialogueStep(false);
        this.hud.showStageDialogue(ep);
      },
      onRetry: () => {
        if (this.mp.mode !== 'offline' && this.mp.peerConnected && this.peer) {
          this.mp.sendRematch();
          this.startMultiplayerMatch(
            this.mp.mode === 'solo' ? 'solo' : 'coop',
            this.mp.mode === 'solo' ? 20 : this.currentStageId,
            this.peer.name,
          );
        } else if (this.activeTowerFloor) {
          this.startTowerFloor(this.activeTowerFloor.id);
        } else if (this.roguelikeState?.active) {
          this.startRoguelikeRun();
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
        this.applyVisualSettings({ muted: next }, true);
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
      onCastComboUlt: () => {
        this.tryCastComboUlt();
      },
      onStartTower: (floorNum) => {
        this.startTowerFloor(floorNum);
      },
      onStartRoguelike: () => {
        this.startRoguelikeRun();
      },
      onAdvanceRoguelike: (blessingId, greedPact) => {
        this.advanceRoguelikeChamber(blessingId, greedPact);
      },
      onSetDifficulty: (diff: DifficultyTierId) => {
        this.saveStore.setSelectedDifficulty(diff);
        this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
      },
      onClaimChapterChest: (chestId: string) => {
        const res = this.saveStore.claimChapterChest(chestId);
        if (res.ok) {
          if (res.droppedItem) this.audio.playGearDropChime(res.droppedItem.rarity);
          else this.audio.playDropChime('spirit');
          triggerHaptic('medium');
          this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
        }
        return res;
      },
      onClaimTowerChest: (starsReq: number) => {
        const res = this.saveStore.claimTowerChest(starsReq);
        if (res.ok) {
          if (res.droppedItem) this.audio.playGearDropChime(res.droppedItem.rarity);
          else this.audio.playDropChime('spirit');
          triggerHaptic('heavy');
          this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
        }
        return res;
      },
      onReplayStory: (kind: 'episode' | 'epilogue', id: number) => {
        const dlg =
          kind === 'epilogue'
            ? getChapterEpilogue(id, this.saveStore.getSwordHeart())
            : getStageDialogueForStage(id > 100 ? getDungeonDef(id === 101 ? 'dg_guling' : id === 102 ? 'dg_jianku' : id === 103 ? 'dg_modian' : 'dg_taixu').stageDef : getStageDef(id), false);
        if (!dlg) return;
        const replayDef: StageDialogueDef = {
          ...dlg,
          mode: 'replay',
          choices: [],
          tipText: '剑录回廊 · 阅毕可返回蜀山剧情志',
          confirmLabel: '收卷 · 返回剧情志',
        };
        this.dialogueContext = 'replay';
        this.activeDialogueDef = replayDef;
        this.mode = 'dialogue';
        this.audio.playDialogueStep(false);
        this.hud.showStageDialogue(replayDef);
      },
      onShopPreview: (
        active: boolean,
        skinId?: string | null,
        weaponId?: string | null,
        armorId?: string | null,
        relicId?: string | null,
        tryOnTrigger?: { category: EquipCategory; itemId: string } | null,
      ) => {
        this.setShopPreview(
          active,
          skinId ?? null,
          weaponId ?? null,
          armorId ?? null,
          relicId ?? null,
          tryOnTrigger ?? null,
        );
      },
      onShopPreviewRotate: (deltaYaw: number, deltaPitch = 0, yawVelocity = 0) => {
        this.shopPreviewAutoSpin = false;
        this.shopPreviewYaw += deltaYaw;
        this.shopPreviewPitch = clamp(this.shopPreviewPitch + deltaPitch, -0.28, 0.34);
        this.shopPreviewYawVel = clamp(yawVelocity, -9.5, 9.5);
      },
      onShopPreviewToggleSpin: () => {
        this.shopPreviewAutoSpin = !this.shopPreviewAutoSpin;
        if (this.shopPreviewAutoSpin) this.shopPreviewYawVel = 0;
        return this.shopPreviewAutoSpin;
      },
      onShopPreviewZoom: (deltaOrVal: number, absolute = false) => {
        this.shopPreviewZoomTarget = clamp(absolute ? deltaOrVal : this.shopPreviewZoomTarget + deltaOrVal, 0, 1);
        return this.shopPreviewZoomTarget > 0.45;
      },
      onShopPreviewToggleZoom: () => {
        this.shopPreviewZoomTarget = this.shopPreviewZoomTarget > 0.45 ? 0 : 1;
        return this.shopPreviewZoomTarget > 0.45;
      },
      onOpenAncientMap: () => {
        this.openAncientMapOverlay();
      },
      onOpenRoster: (focusCharId?: string) => {
        this.openRosterOverlay(focusCharId);
      },
      onUpdateVisualSetting: (patch) => {
        this.applyVisualSettings(patch, true);
      },
      onOpenCraft: (tab) => {
        this.openCraftOverlay(tab);
      },
    });

    const appMount = document.querySelector<HTMLElement>('#app') ?? document.body;
    this.ancientMap = new AncientMapOverlay(appMount, {
      onTeleport: (wpId: string) => {
        if (this.mode !== 'world') {
          this.enterOpenWorldMode();
        }
        const ok = this.teleportToWorldWaypoint(wpId);
        if (ok) {
          this.worldCustomNavTarget = null;
          this.ancientMap.close();
        }
        return ok;
      },
      onNavigateTo: (x: number, z: number, label: string) => {
        const matchedHerb = WORLD_HERB_NODES.find((h) => Math.hypot(h.x - x, h.z - z) < 0.8);
        this.startWorldCustomNavigation(x, z, label, matchedHerb?.id);
      },
      onInspectCharacter: (charId: string) => {
        this.ancientMap.close();
        this.openRosterOverlay(charId);
      },
    });

    this.rosterOverlay = new CharacterRosterOverlay(appMount, {
      onLocateOnMap: (charId: string, x: number, z: number, label: string) => {
        this.rosterOverlay.close();
        if (charId === 'npc_wine_master' || charId === 'npc_xuanying') {
          if (this.mode !== 'camp') {
            this.enterCampMode();
          }
          this.openAncientMapOverlay();
          return;
        }
        this.startWorldCustomNavigation(x, z, label);
      },
    });

    this.craftOverlay = new AlchemyCraftOverlay(appMount, {
      onBrewElixir: (elixirId: string) => this.brewAndConsumeElixir(elixirId),
      onCraftGear: (recipeId: string) => this.craftGearFromRecipe(recipeId),
      onEquipCrafted: (uid: string) => {
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
      onGoGatherMaterial: (materialId: string) => {
        this.goGatherMaterial(materialId as MaterialId);
      },
    });

    this.loadAndApplyVisualSettings();
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
    this.scene.environment = this.pipeline.buildMoonlitEnvironment();
    this.scene.environmentIntensity = 0.72;

    const hemi = new THREE.HemisphereLight('#8fb4d8', '#232026', 1.15);
    this.scene.add(hemi);

    const moonKey = new THREE.DirectionalLight('#d6e6fa', 2.45);
    moonKey.position.set(-15, 24, -18);
    moonKey.castShadow = true;
    moonKey.shadow.mapSize.set(2048, 2048);
    moonKey.shadow.radius = 2.6;
    moonKey.shadow.camera.near = 2;
    moonKey.shadow.camera.far = 68;
    const sc = 22;
    moonKey.shadow.camera.left = -sc;
    moonKey.shadow.camera.right = sc;
    moonKey.shadow.camera.top = sc;
    moonKey.shadow.camera.bottom = -sc;
    moonKey.shadow.bias = -0.0005;
    moonKey.shadow.normalBias = 0.04;
    this.scene.add(moonKey);
    this.scene.add(moonKey.target);
    this.moonKeyLight = moonKey;

    const warmFill = new THREE.DirectionalLight('#ffcf9e', 0.92);
    warmFill.position.set(11, 10, 15);
    this.scene.add(warmFill);

    // Gentle front portrait fill light active only in Title Lobby so Li Xiaoyao's face shines unobstructed
    const titleFill = new THREE.DirectionalLight('#fff2e2', 1.25);
    titleFill.position.set(1.6, 2.7, 6.2);
    titleFill.visible = false;
    this.scene.add(titleFill);
    this.scene.add(titleFill.target);
    this.titlePortraitLight = titleFill;
  }

  private setupShopStudioStage(): void {
    const stage = new THREE.Group();
    stage.name = 'shop_studio_stage';
    stage.visible = false;

    // 1. Sculpted Xianxia Lotus & Bagua Turntable Pedestal beneath Hero's feet
    const pedestalBase = new THREE.Group();
    const stoneMat = new THREE.MeshStandardMaterial({
      color: '#172334',
      roughness: 0.42,
      metalness: 0.35,
    });
    const trimGoldMat = new THREE.MeshStandardMaterial({
      color: '#d8b46a',
      roughness: 0.34,
      metalness: 0.72,
      emissive: '#38250a',
      emissiveIntensity: 0.25,
    });
    const lowerPlinth = new THREE.Mesh(new THREE.CylinderGeometry(1.16, 1.32, 0.12, 24), stoneMat);
    lowerPlinth.position.y = -0.06;
    const upperPlinth = new THREE.Mesh(new THREE.CylinderGeometry(0.96, 1.10, 0.06, 24), stoneMat);
    upperPlinth.position.y = -0.015;
    const goldRim = new THREE.Mesh(new THREE.TorusGeometry(1.04, 0.022, 10, 40), trimGoldMat);
    goldRim.rotation.x = Math.PI / 2;
    goldRim.position.y = 0.012;
    pedestalBase.add(lowerPlinth, upperPlinth, goldRim);

    const spinGroup = new THREE.Group();
    const innerMat = new THREE.MeshBasicMaterial({
      color: '#4ce6c2',
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const outerMat = new THREE.MeshBasicMaterial({
      color: '#7ef8e4',
      transparent: true,
      opacity: 0.64,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const innerRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.70, 48), innerMat);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.022;
    const outerRing = new THREE.Mesh(new THREE.RingGeometry(1.06, 1.15, 48), outerMat);
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.y = 0.024;
    spinGroup.add(innerRing, outerRing);

    // 12 sculpted Xianxia lotus petals + 8 Bagua trigram rays around pedestal rim
    const petalGeo = new THREE.ConeGeometry(0.16, 0.38, 4);
    const petalMat = new THREE.MeshStandardMaterial({
      color: '#25394f',
      roughness: 0.36,
      metalness: 0.45,
      emissive: '#1e6e68',
      emissiveIntensity: 0.32,
      transparent: true,
      opacity: 0.88,
    });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const petal = new THREE.Mesh(petalGeo, petalMat);
      petal.scale.set(1.0, 1.0, 0.28);
      petal.position.set(Math.sin(a) * 1.04, 0.04, Math.cos(a) * 1.04);
      petal.rotation.order = 'YXZ';
      petal.rotation.y = a;
      petal.rotation.x = 1.08;
      spinGroup.add(petal);
    }
    const barGeo = new THREE.PlaneGeometry(0.06, 0.32);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const bar = new THREE.Mesh(barGeo, innerMat);
      bar.rotation.x = -Math.PI / 2;
      bar.rotation.z = -a;
      bar.position.set(Math.sin(a) * 0.88, 0.025, Math.cos(a) * 0.88);
      spinGroup.add(bar);
    }
    pedestalBase.add(spinGroup);
    stage.add(pedestalBase);

    // 2. Dark Translucent Backdrop Vignette Curtain (keeps courtyard pillars/lanterns from cluttering Hero's face)
    const curtainCanvas = document.createElement('canvas');
    curtainCanvas.width = 256;
    curtainCanvas.height = 256;
    const cctx = curtainCanvas.getContext('2d');
    if (cctx) {
      const grad = cctx.createRadialGradient(128, 128, 22, 128, 128, 128);
      grad.addColorStop(0.0, 'rgba(8, 16, 28, 0.90)');
      grad.addColorStop(0.55, 'rgba(9, 18, 30, 0.78)');
      grad.addColorStop(0.85, 'rgba(8, 15, 26, 0.36)');
      grad.addColorStop(1.0, 'rgba(8, 15, 26, 0.0)');
      cctx.fillStyle = grad;
      cctx.fillRect(0, 0, 256, 256);
    }
    const curtainTex = new THREE.CanvasTexture(curtainCanvas);
    curtainTex.colorSpace = THREE.SRGBColorSpace;
    const backdropGeo = new THREE.CylinderGeometry(3.25, 3.25, 5.4, 28, 1, true, Math.PI * 0.56, Math.PI * 0.88);
    const backdropMat = new THREE.MeshBasicMaterial({
      map: curtainTex,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const backdropMesh = new THREE.Mesh(backdropGeo, backdropMat);
    backdropMesh.position.y = 1.45;
    stage.add(backdropMesh);

    this.scene.add(stage);
    this.shopStageGroup = stage;
    this.shopPedestalSpinGroup = spinGroup;
    this.shopPedestalInnerMat = innerMat;
    this.shopPedestalOuterMat = outerMat;
    this.shopBackdropMesh = backdropMesh;

    // 3. 3-Point Portrait Studio Lights dynamically oriented to camera orbit basis at all 360°
    const keyLight = new THREE.DirectionalLight('#fff5e6', 2.6);
    keyLight.visible = false;
    this.scene.add(keyLight);
    this.scene.add(keyLight.target);
    this.shopKeyLight = keyLight;

    const fillLight = new THREE.DirectionalLight('#b8dcff', 1.25);
    fillLight.visible = false;
    this.scene.add(fillLight);
    this.scene.add(fillLight.target);
    this.shopFillLight = fillLight;

    const rimLight = new THREE.DirectionalLight('#54f0e0', 2.2);
    rimLight.visible = false;
    this.scene.add(rimLight);
    this.scene.add(rimLight.target);
    this.shopRimLight = rimLight;
  }

  private setShopStudioLightsVisible(visible: boolean): void {
    if (this.shopStageGroup) this.shopStageGroup.visible = visible;
    if (this.shopKeyLight) this.shopKeyLight.visible = visible;
    if (this.shopFillLight) this.shopFillLight.visible = visible;
    if (this.shopRimLight) this.shopRimLight.visible = visible;
  }

  private updateShopStudioStage(dt: number): void {
    if (!this.shopStageGroup) return;
    const hx = this.hero.pos.x;
    const hy = this.hero.pos.y;
    const hz = this.hero.pos.z;
    const orbitYaw = this.hero.yaw + this.shopPreviewYaw;

    this.shopStageGroup.position.set(hx, hy, hz);
    if (this.shopPedestalSpinGroup) {
      this.shopPedestalSpinGroup.rotation.y += dt * (this.shopTryOnTimer > 0 ? 1.8 : 0.42);
    }
    if (this.shopBackdropMesh) {
      // Cylinder arc centered around -Z (theta=PI) sits directly BEHIND the hero along camera view direction
      this.shopBackdropMesh.rotation.y = orbitYaw;
    }

    const fwdX = Math.sin(orbitYaw);
    const fwdZ = Math.cos(orbitYaw);
    const rightX = Math.cos(orbitYaw);
    const rightZ = -Math.sin(orbitYaw);
    const targetY = hy + 1.38;

    if (this.shopKeyLight) {
      this.shopKeyLight.position.set(hx + fwdX * 3.4 - rightX * 1.9, hy + 2.85, hz + fwdZ * 3.4 - rightZ * 1.9);
      this.shopKeyLight.target.position.set(hx, targetY, hz);
      this.shopKeyLight.target.updateMatrixWorld();
    }
    if (this.shopFillLight) {
      this.shopFillLight.position.set(hx + fwdX * 2.8 + rightX * 2.6, hy + 1.85, hz + fwdZ * 2.8 + rightZ * 2.6);
      this.shopFillLight.target.position.set(hx, targetY, hz);
      this.shopFillLight.target.updateMatrixWorld();
    }
    if (this.shopRimLight) {
      this.shopRimLight.position.set(hx - fwdX * 3.2 + rightX * 1.1, hy + 2.65, hz - fwdZ * 3.2 + rightZ * 1.1);
      this.shopRimLight.target.position.set(hx, targetY + 0.1, hz);
      this.shopRimLight.target.updateMatrixWorld();
    }
  }

  private loadAndApplyVisualSettings(): void {
    let loaded: Partial<VisualSettingsState> = {};
    try {
      const raw = window.localStorage.getItem(Game.VISUAL_SETTINGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<VisualSettingsState>;
        if (parsed && typeof parsed === 'object') loaded = parsed;
      }
    } catch {
      // Ignore storage read errors
    }
    const merged: VisualSettingsState = {
      quality:
        loaded.quality === 'ultra' || loaded.quality === 'balanced' || loaded.quality === 'smooth'
          ? loaded.quality
          : DEFAULT_VISUAL_SETTINGS.quality,
      atmosphereTheme:
        loaded.atmosphereTheme === 'moonlit' ||
        loaded.atmosphereTheme === 'ink_frost' ||
        loaded.atmosphereTheme === 'golden_dawn' ||
        loaded.atmosphereTheme === 'astral_violet'
          ? loaded.atmosphereTheme
          : DEFAULT_VISUAL_SETTINGS.atmosphereTheme,
      bloomMode:
        loaded.bloomMode === 'vivid' || loaded.bloomMode === 'soft' || loaded.bloomMode === 'minimal'
          ? loaded.bloomMode
          : DEFAULT_VISUAL_SETTINGS.bloomMode,
      autoNavPolicy: loaded.autoNavPolicy === 'evade' ? 'evade' : 'fight',
      guideCompact: typeof loaded.guideCompact === 'boolean' ? loaded.guideCompact : DEFAULT_VISUAL_SETTINGS.guideCompact,
      muted: this.urlForcedMute ? true : typeof loaded.muted === 'boolean' ? loaded.muted : this.audio.isMuted(),
    };
    this.visualSettings = merged;
    this.applyVisualSettings(merged, false);
  }

  private applyVisualSettings(patch: Partial<VisualSettingsState>, persist = true): void {
    this.visualSettings = { ...this.visualSettings, ...patch };
    this.pipeline.applyVisualSettings({
      quality: this.visualSettings.quality,
      atmosphereTheme: this.visualSettings.atmosphereTheme,
      bloomMode: this.visualSettings.bloomMode,
    });
    this.worldAutoNavPolicy = this.visualSettings.autoNavPolicy;
    if (patch.muted !== undefined && !this.urlForcedMute) {
      this.audio.setMuted(this.visualSettings.muted);
    }
    this.applyBiomeAtmosphere(this.lastBiomeApplied, this.lastChapterApplied);
    this.hud.syncVisualSettings(this.visualSettings);
    if (persist) {
      try {
        window.localStorage.setItem(Game.VISUAL_SETTINGS_STORAGE_KEY, JSON.stringify(this.visualSettings));
      } catch {
        // Ignore storage quota errors
      }
    }
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
    this.ancientMap.close();
    this.rosterOverlay.destroy();
    this.craftOverlay.close();
    this.mp.dispose();
    this.input.dispose();
    this.audio.dispose();
    this.pipeline.dispose();
    window.__THREE_GAME_DIAGNOSTICS__ = undefined;
    window.__THREE_GAME_TEST_HOOKS__ = undefined;
    window.G = undefined;
    (window as unknown as Record<string, unknown>).__omGame = undefined;
  }

  private onGlobalKey = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') {
      if (
        this.ancientMap.isOpen() ||
        this.rosterOverlay.isOpen() ||
        this.craftOverlay.isOpen() ||
        this.hud.isSettingsOpen()
      ) {
        return;
      }
      if (this.mode === 'playing' || this.mode === 'paused') {
        e.preventDefault();
        this.togglePause();
      }
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
    if (this.activeTowerFloor) return this.activeTowerFloor.stageDef;
    if (this.roguelikeState?.active) {
      const ch = ROGUELIKE_CHAMBERS[clamp(this.roguelikeState.chamberIdx, 0, ROGUELIKE_CHAMBERS.length - 1)];
      if (ch) return ch.stageDef;
    }
    return this.activeDungeon ? this.activeDungeon.stageDef : getStageDef(this.currentStageId);
  }

  private resetEndgameStageState(): void {
    this.monolithHp = 0;
    this.monolithMaxHp = 0;
    this.surviveRemainSec = 0;
    this.surviveSpawnTimer = 0;
    this.leylineZoneActive = false;
    this.leylineZoneTimer = 0;
    this.heroInLeylineZone = false;
    this.combatStyleScore = 0;
    this.combatStylePeak = 0;
    this.combatStyleDecayTimer = 0;
    this.lastStyleAction = '';
    this.lotusProcCooldown = 0;
    this.arena.setMonolithVisible(false);
    this.arena.setLeylineZone(false);
  }

  private getActiveLeylineAffix(): LeylineAffixId {
    if (this.mode === 'world' || this.mode === 'camp' || this.mp.mode !== 'offline') return 'none';
    return this.getActiveStageDef().leylineAffix ?? 'none';
  }

  private getCdMult(): number {
    const loadout = this.getLoadoutStats();
    const affixMult = this.getActiveLeylineAffix() === 'rapid_cooldown' ? 0.68 : 1.0;
    return this.blessings.cdMult * loadout.cdMult * affixMult;
  }

  private getEffectiveUltGainMult(): number {
    const loadout = this.getLoadoutStats();
    const rank = evaluateCombatRank(this.combatStyleScore);
    const swordHeart = getSwordHeartSummary(this.saveStore.getSwordHeart());
    const affixBonus = this.getActiveLeylineAffix() === 'glass_cannon' ? 0.4 : 0;
    return (
      this.blessings.ultGainMult *
      loadout.ultGainMult *
      (1 + rank.ultGainBonusPct + swordHeart.ultGainBonus + affixBonus)
    );
  }

  private addCombatStyle(points: number, actionKey: string): void {
    if (this.mode !== 'playing') return;
    const gain = actionKey === this.lastStyleAction ? points * 0.55 : points;
    this.lastStyleAction = actionKey;
    this.combatStyleScore = clamp(this.combatStyleScore + gain, 0, 190);
    this.combatStylePeak = Math.max(this.combatStylePeak, this.combatStyleScore);
    this.combatStyleDecayTimer = 3.6;
  }

  private getLoadoutStats(): HeroLoadoutStats {
    return this.saveStore.getLoadoutStats();
  }

  private resolveArmorVisual(armorId: string): HeroArmorVisual {
    const rolled = this.saveStore.getInventory().find((x) => x.uid === armorId);
    const tplId = rolled ? rolled.templateId : armorId;
    const item = SHOP_ITEM_MAP[tplId];
    const rarity: EquipRarity = rolled?.rarity ?? item?.rarity ?? 'common';
    const tintByTemplate: Record<string, string> = {
      arm_xuanlin: '#5ce0ec',
      arm_yunjin: '#e6b850',
      arm_xuanwu: '#ffd864',
    };
    const tintByRarity: Record<EquipRarity, string | undefined> = {
      common: undefined,
      rare: '#5ce0ec',
      epic: '#e6b850',
      legendary: '#ffd864',
    };
    return {
      rarity,
      tintHex: tintByTemplate[tplId] ?? tintByRarity[rarity],
    };
  }

  private resolveRelicVisual(relicId: string): HeroRelicVisual {
    const rolled = this.saveStore.getInventory().find((x) => x.uid === relicId);
    const tplId = rolled ? rolled.templateId : relicId;
    const item = SHOP_ITEM_MAP[tplId];
    const rarity: EquipRarity = rolled?.rarity ?? item?.rarity ?? 'common';
    const auraByTemplate: Record<string, string> = {
      rel_hulu: '#e8c474',
      rel_yupei: '#4cf0d2',
      rel_shihun: '#c872ff',
      rel_bagua: '#ffe066',
    };
    const auraByRarity: Record<EquipRarity, string> = {
      common: '#e8c474',
      rare: '#4cf0d2',
      epic: '#c872ff',
      legendary: '#ffe066',
    };
    return {
      rarity,
      auraHex: auraByTemplate[tplId] ?? auraByRarity[rarity],
    };
  }

  private applyCurrentLoadoutVisuals(): void {
    const equipped = this.saveStore.getEquipped();
    this.hero.rig.applyHeroAppearance(
      getEquippedSkinVisual(equipped),
      getEquippedWeaponVisual(equipped, this.saveStore.getInventory()),
      this.resolveArmorVisual(equipped.armor),
      this.resolveRelicVisual(equipped.relic),
      equipped.skin,
    );
  }

  private getSkinThemeMeta(skinId: string): {
    label: string;
    accentHex: string;
    rgb: [number, number, number];
  } {
    switch (skinId) {
      case 'skin_shuangxue':
        return { label: '❄ 霜雪剑仙 · 冰莲八卦', accentHex: '#7ce4ff', rgb: [0.55, 2.15, 2.5] };
      case 'skin_chiyan':
        return { label: '🔥 赤焰剑尊 · 炎浪莲火', accentHex: '#ff6e42', rgb: [2.45, 0.72, 0.28] };
      case 'skin_zixiao':
        return { label: '⚡ 紫霄星君 · 紫电八卦', accentHex: '#c284ff', rgb: [1.55, 0.75, 2.45] };
      case 'skin_jinwu':
        return { label: '☀ 金乌帝君 · 烈日神环', accentHex: '#ffd85e', rgb: [2.5, 1.95, 0.45] };
      case 'skin_xiaoyao':
      default:
        return { label: '🍃 清风游侠 · 翡翠剑风', accentHex: '#4ce6c2', rgb: [0.45, 2.25, 1.95] };
    }
  }

  private applyShopPedestalColors(accentHex: string): void {
    if (this.shopPedestalInnerMat) this.shopPedestalInnerMat.color.set(accentHex);
    if (this.shopPedestalOuterMat) {
      const outer = new THREE.Color(accentHex).lerp(new THREE.Color('#ffffff'), 0.25);
      this.shopPedestalOuterMat.color.copy(outer);
    }
    if (this.shopRimLight) this.shopRimLight.color.set(accentHex);
  }

  private triggerShopTryOnEffect(category: EquipCategory, itemId: string): void {
    this.shopTryOnTimer = this.shopTryOnDuration;
    this.shopTryOnCount += 1;

    const hPos = this.hero.pos.clone();
    const chestPos = hPos.clone().add(new THREE.Vector3(0, 1.15, 0));
    const groundPos = new THREE.Vector3(hPos.x, 0.08, hPos.z);
    const inv = this.saveStore.getInventory();
    const rolled = category !== 'skin' ? inv.find((g) => g.uid === itemId) : undefined;
    const itemDef = SHOP_ITEM_MAP[rolled ? rolled.templateId : itemId];
    const displayName = rolled?.name ?? itemDef?.name ?? itemId;

    let tagLabel = '';
    let accentHex = '#4ce6c2';

    if (category === 'skin') {
      const meta = this.getSkinThemeMeta(itemId);
      tagLabel = meta.label;
      accentHex = meta.accentHex;
      const col = new THREE.Color(meta.rgb[0], meta.rgb[1], meta.rgb[2]);
      this.applyShopPedestalColors(accentHex);

      if (itemId === 'skin_shuangxue') {
        this.vfx.spawnBaguaArray({ pos: groundPos, radius: 2.3, color: col, duration: 1.25 });
        this.vfx.spawnShockRing(groundPos, col, 0.3, 2.6, 0.55);
        this.vfx.spawnHitSparks(chestPos, new THREE.Vector3(0, 1, 0), col, 22, this.rng);
        this.audio.playSkillQ();
      } else if (itemId === 'skin_chiyan') {
        this.vfx.spawnShockRing(groundPos, col, 0.35, 3.0, 0.55);
        this.vfx.spawnSwordArc({
          pos: chestPos,
          yaw: this.hero.yaw,
          wide: true,
          scale: 1.05,
          colorCore: col,
          colorEdge: new THREE.Color(2.2, 1.5, 0.3),
          duration: 0.52,
        });
        this.vfx.spawnHitSparks(chestPos, new THREE.Vector3(0, 1, 0), new THREE.Color(2.5, 1.35, 0.35), 24, this.rng);
        this.audio.playSkillE();
      } else if (itemId === 'skin_zixiao') {
        this.vfx.spawnBaguaArray({ pos: groundPos, radius: 2.45, color: col, duration: 1.3 });
        this.vfx.spawnShockRing(chestPos, col, 0.25, 2.4, 0.5);
        this.vfx.spawnHitSparks(chestPos, new THREE.Vector3(0, 1, 0), new THREE.Color(1.9, 1.2, 2.5), 22, this.rng);
        this.audio.playParry();
      } else if (itemId === 'skin_jinwu') {
        this.vfx.spawnBaguaArray({ pos: groundPos, radius: 2.6, color: col, duration: 1.35 });
        this.vfx.spawnSkySwordGate(hPos.clone().add(new THREE.Vector3(0, 2.45, 0)), 1.65, col, 1.15);
        this.vfx.spawnShockRing(groundPos, col, 0.35, 3.2, 0.58);
        this.vfx.spawnHitSparks(chestPos, new THREE.Vector3(0, 1, 0), col, 26, this.rng);
        this.audio.playSkillR();
      } else {
        this.vfx.spawnShockRing(groundPos, col, 0.28, 2.5, 0.48);
        this.vfx.spawnSwordArc({
          pos: chestPos,
          yaw: this.hero.yaw,
          wide: false,
          scale: 0.95,
          colorCore: col,
          colorEdge: new THREE.Color(0.35, 1.45, 1.3),
          duration: 0.46,
        });
        this.vfx.spawnHitSparks(chestPos, new THREE.Vector3(0, 1, 0), col, 18, this.rng);
        this.audio.playSwordSwing(2);
      }
    } else if (category === 'weapon') {
      const wpnVis =
        SHOP_ITEM_MAP[itemId]?.weaponVisual ??
        getEquippedWeaponVisual({ ...this.saveStore.getEquipped(), weapon: itemId }, inv);
      accentHex = wpnVis.glowHex || '#7ef8e4';
      const core = new THREE.Color(wpnVis.trailCore[0], wpnVis.trailCore[1], wpnVis.trailCore[2]);
      const edge = new THREE.Color(wpnVis.trailEdge[0], wpnVis.trailEdge[1], wpnVis.trailEdge[2]);
      tagLabel = `⚔ 神兵试锋 · ${displayName}`;
      this.vfx.spawnSwordArc({
        pos: chestPos,
        yaw: this.hero.yaw,
        wide: true,
        scale: 1.05,
        colorCore: core,
        colorEdge: edge,
        duration: 0.5,
      });
      this.vfx.spawnHitSparks(chestPos, new THREE.Vector3(0, 0.8, 0.4), core, 18, this.rng);
      this.audio.playSwordSwing(3);
    } else if (category === 'armor') {
      const armVis = this.resolveArmorVisual(itemId);
      accentHex = armVis.tintHex ?? '#64e6d8';
      const col = new THREE.Color(accentHex).multiplyScalar(1.85);
      tagLabel = `🛡 玄甲护体 · ${displayName}`;
      this.vfx.spawnShockRing(groundPos, col, 0.32, 2.6, 0.52);
      this.vfx.spawnHealVortex(hPos);
      this.audio.playParry();
    } else {
      const relVis = this.resolveRelicVisual(itemId);
      accentHex = relVis.auraHex ?? '#e8c474';
      const col = new THREE.Color(accentHex).multiplyScalar(1.9);
      tagLabel = `✦ 灵宝共鸣 · ${displayName}`;
      this.vfx.spawnBaguaArray({ pos: groundPos, radius: 2.15, color: col, duration: 1.1 });
      this.vfx.spawnHitSparks(chestPos, new THREE.Vector3(0, 1, 0), col, 16, this.rng);
      this.audio.playDropChime('spirit');
    }

    this.shopLastTryOnEffect = `${category}:${itemId}:${tagLabel}`;
    this.hud.setShopTryOnEffectTag(tagLabel, accentHex);
  }

  private setShopPreview(
    active: boolean,
    skinId: string | null = null,
    weaponId: string | null = null,
    armorId: string | null = null,
    relicId: string | null = null,
    tryOnTrigger: { category: EquipCategory; itemId: string } | null = null,
  ): void {
    if (!active) {
      if (!this.shopPreviewActive) return;
      this.shopPreviewActive = false;
      this.shopPreviewSkinId = null;
      this.shopPreviewWeaponId = null;
      this.shopPreviewArmorId = null;
      this.shopPreviewRelicId = null;
      this.shopPreviewYawVel = 0;
      this.shopPreviewPitch = 0;
      this.shopPreviewZoom = 0;
      this.shopPreviewZoomTarget = 0;
      this.shopTryOnTimer = 0;
      this.setShopStudioLightsVisible(false);
      if (this.titlePortraitLight) this.titlePortraitLight.visible = this.mode === 'title';
      this.applyCurrentLoadoutVisuals();
      this.hero.rig.setWeaponDrawn(
        this.mode === 'playing' || this.mode === 'camp' || this.mode === 'showcase' || this.mountMode === 'horse',
      );
      if (this.mode === 'title') {
        const isPortrait = window.innerHeight > window.innerWidth;
        this.cameraRig.updateTitleOrbit(this.hero.pos, this.elapsed, isPortrait);
      } else {
        this.cameraRig.snapTo(this.hero.pos);
      }
      return;
    }

    const equipped = this.saveStore.getEquipped();
    const wasActive = this.shopPreviewActive;
    const prevSkin = this.shopPreviewSkinId;
    const prevWeapon = this.shopPreviewWeaponId;
    const prevArmor = this.shopPreviewArmorId;
    const prevRelic = this.shopPreviewRelicId;

    if (!wasActive) {
      this.shopPreviewActive = true;
      this.shopPreviewYaw = 0;
      this.shopPreviewYawVel = 0;
      this.shopPreviewPitch = 0;
      this.shopPreviewZoom = 0;
      this.shopPreviewZoomTarget = 0;
      this.shopPreviewAutoSpin = false;
      this.shopTryOnTimer = 0;
      this.setShopStudioLightsVisible(true);
      if (this.titlePortraitLight) this.titlePortraitLight.visible = false;
    }

    this.shopPreviewSkinId = skinId ?? equipped.skin;
    this.shopPreviewWeaponId = weaponId ?? equipped.weapon;
    this.shopPreviewArmorId = armorId ?? equipped.armor;
    this.shopPreviewRelicId = relicId ?? equipped.relic;

    const inv = this.saveStore.getInventory();
    const skinVis = SHOP_ITEM_MAP[this.shopPreviewSkinId]?.skinVisual ?? getEquippedSkinVisual(equipped);
    const wpnVis =
      SHOP_ITEM_MAP[this.shopPreviewWeaponId]?.weaponVisual ??
      getEquippedWeaponVisual({ ...equipped, weapon: this.shopPreviewWeaponId }, inv);
    const armorVis = this.resolveArmorVisual(this.shopPreviewArmorId);
    const relicVis = this.resolveRelicVisual(this.shopPreviewRelicId);

    this.hero.rig.applyHeroAppearance(skinVis, wpnVis, armorVis, relicVis, this.shopPreviewSkinId);
    this.hero.rig.setWeaponDrawn(true);

    const skinMeta = this.getSkinThemeMeta(this.shopPreviewSkinId);
    this.applyShopPedestalColors(skinMeta.accentHex);

    if (tryOnTrigger) {
      this.triggerShopTryOnEffect(tryOnTrigger.category, tryOnTrigger.itemId);
    } else if (wasActive) {
      if (this.shopPreviewSkinId !== prevSkin) {
        this.triggerShopTryOnEffect('skin', this.shopPreviewSkinId);
      } else if (this.shopPreviewWeaponId !== prevWeapon) {
        this.triggerShopTryOnEffect('weapon', this.shopPreviewWeaponId);
      } else if (this.shopPreviewArmorId !== prevArmor) {
        this.triggerShopTryOnEffect('armor', this.shopPreviewArmorId);
      } else if (this.shopPreviewRelicId !== prevRelic) {
        this.triggerShopTryOnEffect('relic', this.shopPreviewRelicId);
      }
    } else {
      this.hud.setShopTryOnEffectTag(skinMeta.label, skinMeta.accentHex);
    }

    this.updateShopStudioStage(0);
  }

  private openCraftOverlay(tab?: 'elixir' | 'forge'): void {
    if (this.ancientMap.isOpen()) this.ancientMap.close();
    if (this.rosterOverlay.isOpen()) this.rosterOverlay.close();
    if (this.hud.isSettingsOpen()) this.hud.closeSettings();
    this.craftOverlay.open(this.saveStore, tab);
  }

  private brewAndConsumeElixir(elixirId: string) {
    const res = this.saveStore.brewAndConsumeElixir(elixirId);
    if (res.ok) {
      this.syncLiveHeroCapsFromLoadout();
      if (res.instantRestore) {
        this.hero.hp = this.hero.maxHp;
        this.hero.delayedHp = this.hero.maxHp;
        this.hero.spirit = this.hero.maxSpirit;
        this.hero.gourds = this.hero.maxGourds;
      }
      const goldCol = new THREE.Color(2.45, 1.95, 0.55);
      this.vfx.spawnBaguaArray({ pos: this.hero.pos.clone(), radius: 3.2, color: goldCol, duration: 1.4 });
      this.vfx.spawnHealVortex(this.hero.pos);
      this.vfx.spawnShockRing(this.hero.pos, goldCol, 0.35, 3.8, 0.55);
      this.audio.playDropChime('spirit');
      triggerHaptic('heavy');
      this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
      if (this.craftOverlay.isOpen()) this.craftOverlay.refresh(this.saveStore);
    }
    return res;
  }

  private craftGearFromRecipe(recipeId: string) {
    const res = this.saveStore.craftEquipmentRecipe(recipeId, this.rng);
    if (res.ok && res.item) {
      this.vfx.spawnShockRing(this.hero.pos, new THREE.Color(2.4, 1.85, 0.55), 0.35, 3.6, 0.52);
      this.audio.playGearDropChime(res.item.rarity);
      triggerHaptic('heavy');
      this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
      if (this.craftOverlay.isOpen()) this.craftOverlay.refresh(this.saveStore);
    }
    return res;
  }

  private goGatherMaterial(materialId: MaterialId): void {
    this.craftOverlay.close();
    if (this.mode !== 'world') {
      this.enterOpenWorldMode();
    }
    const h = this.hero.pos;
    if (materialId === 'mat_yaodan') {
      let bestCamp: WorldMobCampDef | null = null;
      let bestDist = Infinity;
      for (const camp of WORLD_MOB_CAMPS) {
        const d = Math.hypot(camp.x - h.x, camp.z - h.z);
        if (d < bestDist) {
          bestDist = d;
          bestCamp = camp;
        }
      }
      if (bestCamp) {
        this.startWorldCustomNavigation(bestCamp.x, bestCamp.z, `讨伐 · ${bestCamp.name}`);
      }
      return;
    }
    if (materialId === 'mat_longlin') {
      const liveBosses = WORLD_BOSS_SPAWNS.filter((wb) =>
        this.enemies.some((e) => e.worldBossId === wb.id && e.aiState !== 'dead'),
      );
      const pool = liveBosses.length > 0 ? liveBosses : WORLD_BOSS_SPAWNS;
      let bestBoss: WorldBossDef | null = null;
      let bestDist = Infinity;
      for (const wb of pool) {
        const d = Math.hypot(wb.x - h.x, wb.z - h.z);
        if (d < bestDist) {
          bestDist = d;
          bestBoss = wb;
        }
      }
      if (bestBoss) {
        this.startWorldCustomNavigation(bestBoss.x, bestBoss.z, `征讨 · ${bestBoss.name}`);
      }
      return;
    }
    const matchingHerbs = WORLD_HERB_NODES.filter((n) => n.materialId === materialId);
    const availableHerbs = matchingHerbs.filter((n) => !this.worldHerbTimers.has(n.id));
    const pool = availableHerbs.length > 0 ? availableHerbs : matchingHerbs;
    let bestHerb: WorldHerbNodeDef | null = null;
    let bestDist = Infinity;
    for (const node of pool) {
      const d = Math.hypot(node.x - h.x, node.z - h.z);
      if (d < bestDist) {
        bestDist = d;
        bestHerb = node;
      }
    }
    if (bestHerb) {
      this.startWorldCustomNavigation(bestHerb.x, bestHerb.z, `采摘 · ${bestHerb.name}`, bestHerb.id);
    }
  }

  private openAncientMapOverlay(): void {
    if (this.rosterOverlay.isOpen()) this.rosterOverlay.close();
    if (this.craftOverlay.isOpen()) this.craftOverlay.close();
    this.ancientMap.open(this.buildAncientMapSnapshot());
  }

  private openRosterOverlay(focusCharId?: string): void {
    if (this.ancientMap.isOpen()) this.ancientMap.close();
    if (this.craftOverlay.isOpen()) this.craftOverlay.close();
    const resolvedId =
      focusCharId === '__active_boss__'
        ? this.resolveActiveBossCharId()
        : focusCharId
          ? resolveCharacterProfileId(focusCharId)
          : 'char_xiaoyao';
    this.rosterOverlay.open(this.buildRosterSnapshot(), resolvedId);
  }

  private resolveActiveBossCharId(): string {
    const boss = this.mode === 'world' ? this.findNearestBossInRange(34) : this.getActiveBoss();
    if (!boss) return 'char_xiaoyao';
    if (boss.worldBossId) return resolveCharacterProfileId(boss.worldBossId);
    return resolveCharacterProfileId(boss.name);
  }

  private buildAncientMapSnapshot(): AncientMapSnapshot {
    const mapMode: AncientMapSnapshot['hero']['mode'] =
      this.mode === 'world'
        ? 'world'
        : this.mode === 'camp'
          ? 'camp'
          : this.mode === 'playing' || this.mode === 'paused' || this.mode === 'cutscene'
            ? 'playing'
            : 'title';

    const curStage = this.getActiveStageDef();
    const curZoneIdx = this.arena.getZoneIndexAtZ(this.hero.pos.z);
    const zoneName = this.arena.getZoneName(curZoneIdx);
    const regionName =
      mapMode === 'world'
        ? getWorldRegionAt(this.hero.pos.x, this.hero.pos.z).name
        : mapMode === 'camp'
          ? '云来剑庐 · 清修别院'
          : mapMode === 'playing'
            ? `${BIOME_LABELS[curStage.biome]} · ${zoneName}`
            : '蜀山云台 · 九州枢纽';

    const litWaypoints = new Set<string>(
      WORLD_WAYPOINTS.filter((w) => this.saveStore.isWorldWaypointLit(w.id)).map((w) => w.id),
    );
    const openedChests = new Set<string>(
      WORLD_CHESTS.filter((c) => this.saveStore.isWorldChestOpened(c.id)).map((c) => c.id),
    );
    const collectedOrbs = new Set<string>(
      WORLD_SPIRIT_ORBS.filter((o) => this.saveStore.isWorldOrbCollected(o.id)).map((o) => o.id),
    );

    const bosses: AncientMapBossLive[] = [];
    if (mapMode === 'playing') {
      for (const e of this.enemies) {
        if (e.aiState === 'dead' || e.isDummy) continue;
        if (e.kind === 'boss' || e.kind === 'elite') {
          bosses.push({
            id: `stage_e_${e.id}`,
            charId: e.kind === 'boss' ? resolveCharacterProfileId(e.name) : 'mob_elite',
            name: e.name,
            regionName: `${curStage.name} · ${zoneName}`,
            x: e.pos.x,
            z: e.pos.z,
            alive: true,
            hp: Math.ceil(e.hp),
            maxHp: Math.ceil(e.maxHp),
          });
        }
      }
    } else {
      for (const wb of WORLD_BOSS_SPAWNS) {
        const live = this.enemies.find((e) => e.worldBossId === wb.id && e.aiState !== 'dead');
        const remain = Math.ceil(this.worldBossTimers.get(wb.id) ?? 0);
        const alive = mapMode === 'world' ? Boolean(live) : true;
        bosses.push({
          id: wb.id,
          charId: wb.id,
          name: wb.name,
          regionName: wb.regionName,
          x: live ? live.pos.x : wb.x,
          z: live ? live.pos.z : wb.z,
          alive,
          hp: live ? Math.ceil(live.hp) : Math.round(ENEMY_BASE_STATS.boss.hp * wb.hpMult),
          maxHp: live ? Math.ceil(live.maxHp) : Math.round(ENEMY_BASE_STATS.boss.hp * wb.hpMult),
          respawnRemainSec: alive ? 0 : remain,
        });
      }
      if (this.worldEventEnemyId !== null) {
        const goblin = this.enemies.find((e) => e.id === this.worldEventEnemyId && e.aiState !== 'dead');
        if (goblin) {
          bosses.push({
            id: 'event_goblin',
            charId: 'event_goblin',
            name: goblin.name,
            regionName: getWorldRegionAt(goblin.pos.x, goblin.pos.z).name,
            x: goblin.pos.x,
            z: goblin.pos.z,
            alive: true,
            hp: Math.ceil(goblin.hp),
            maxHp: Math.ceil(goblin.maxHp),
          });
        }
      }
    }

    const npcs: AncientMapNpcPin[] = [];
    if (mapMode === 'camp') {
      if (this.campNpcWineMaster) {
        npcs.push({
          id: 'camp_npc_wine',
          charId: 'npc_wine_master',
          name: '酒剑仙 · 司徒钟',
          title: '云来剑庐师尊',
          x: this.campNpcWineMaster.pos.x,
          z: this.campNpcWineMaster.pos.z,
        });
      }
      if (this.campNpcXuanying) {
        npcs.push({
          id: 'camp_npc_xuanying',
          charId: 'npc_xuanying',
          name: '玄影师兄',
          title: '蜀山外门首席',
          x: this.campNpcXuanying.pos.x,
          z: this.campNpcXuanying.pos.z,
        });
      }
    }

    const activeGuide = mapMode === 'world' ? this.resolveWorldGuideTarget() : null;
    const activeTarget = this.worldCustomNavTarget
      ? {
          x: this.worldCustomNavTarget.x,
          z: this.worldCustomNavTarget.z,
          label: this.worldCustomNavTarget.label,
        }
      : activeGuide
        ? { x: activeGuide.x, z: activeGuide.z, label: activeGuide.label }
        : null;

    const herbCooldowns: Record<string, number> = {};
    for (const [hid, rem] of this.worldHerbTimers.entries()) {
      if (rem > 0) herbCooldowns[hid] = Math.ceil(rem);
    }

    return {
      hero: {
        x: this.hero.pos.x,
        z: this.hero.pos.z,
        yaw: this.hero.yaw,
        regionName,
        mode: mapMode,
        stageId: this.currentStageId,
        stageName: `第 ${curStage.episodeNum} 集 · ${curStage.name}`,
        zoneName,
        progressPct: this.arena.getProgressPct(this.hero.pos.z),
      },
      litWaypoints,
      openedChests,
      collectedOrbs,
      herbCooldowns,
      bosses,
      npcs,
      activeTarget,
    };
  }

  private buildRosterSnapshot(): RosterLiveSnapshot {
    const baseLoadout = this.getLoadoutStats();
    const elixir = this.saveStore.getElixirBonus();
    const loadout: HeroLoadoutStats = {
      ...baseLoadout,
      maxHpBonus: baseLoadout.maxHpBonus + elixir.hpBonus,
      dmgMult: baseLoadout.dmgMult * (1 + elixir.atkPct),
      dmgReduce: clamp(baseLoadout.dmgReduce + elixir.dmgReduce, 0, 0.72),
      critRate: baseLoadout.critRate + elixir.critRate,
      critMult: baseLoadout.critMult + elixir.critDmg,
      spiritRegenMult: baseLoadout.spiritRegenMult * (1 + elixir.spiritRegenPct),
      poiseMult: baseLoadout.poiseMult + elixir.poiseBonus / 100,
    };
    const realm = getSwordRealm(this.saveStore.getTotalStars());
    const cult = this.saveStore.getCultivationBonus();
    const power = computeCombatPower(realm.hpBonus, realm.dmgMult, loadout);
    const atk = Math.round(44 * this.getHeroDamageScale());
    const speedMult =
      loadout.speedMult *
      this.blessings.speedMult *
      (1 + this.activeMealBuff.speedBonus + this.episodeChoiceBuff.speedBonus);
    const moveSpeed = Number((7.2 * speedMult).toFixed(2));
    const poise = Math.round(100 * baseLoadout.poiseMult + elixir.poiseBonus);
    const parryWindowMs = Math.round((0.26 + loadout.parryWindowBonus) * 1000);
    const cdReducePct = Math.round(clamp((1 - this.getCdMult()) * 100, 0, 65));

    const liveWorldBosses: Record<
      string,
      { alive: boolean; hp: number; maxHp: number; respawnRemainSec: number }
    > = {};
    for (const wb of WORLD_BOSS_SPAWNS) {
      const live = this.enemies.find((e) => e.worldBossId === wb.id && e.aiState !== 'dead');
      const fallbackMax = Math.round(ENEMY_BASE_STATS.boss.hp * wb.hpMult);
      const alive = this.mode === 'world' ? Boolean(live) : true;
      liveWorldBosses[wb.id] = {
        alive,
        hp: live ? Math.ceil(live.hp) : fallbackMax,
        maxHp: live ? Math.ceil(live.maxHp) : fallbackMax,
        respawnRemainSec: alive ? 0 : Math.ceil(this.worldBossTimers.get(wb.id) ?? 0),
      };
    }
    if (this.worldEventEnemyId !== null) {
      const goblin = this.enemies.find((e) => e.id === this.worldEventEnemyId && e.aiState !== 'dead');
      if (goblin) {
        liveWorldBosses.event_goblin = {
          alive: true,
          hp: Math.ceil(goblin.hp),
          maxHp: Math.ceil(goblin.maxHp),
          respawnRemainSec: 0,
        };
      }
    }

    const ultBonusTxt = cult.startUltBonus > 0 ? ` · 起手剑意+${cult.startUltBonus}` : '';
    const elixirTxt = elixir.totalTaken > 0 ? ` · 丹药×${elixir.totalTaken}(血+${elixir.hpBonus})` : '';
    return {
      hero: {
        hp: Math.ceil(this.hero.hp),
        maxHp: Math.ceil(this.hero.maxHp),
        spirit: Math.round(this.hero.spirit),
        maxSpirit: Math.round(this.hero.maxSpirit),
        stamina: Math.round(this.hero.stamina),
        maxStamina: Math.round(this.hero.maxStamina),
        realmName: realm.title,
        combatPower: power,
        atk,
        dmgReducePct: Math.round(loadout.dmgReduce * 100),
        critRatePct: Math.round(loadout.critRate * 100),
        critDmgPct: Math.round(loadout.critMult * 100),
        moveSpeed,
        poise,
        parryWindowMs,
        parryReflectPct: Math.round(loadout.parryReflectBonus * 100),
        lifestealPct: Math.round(loadout.lifesteal * 100),
        cdReducePct,
        equippedNames: {
          weapon: this.saveStore.getEquippedItemName('weapon'),
          armor: this.saveStore.getEquippedItemName('armor'),
          relic: this.saveStore.getEquippedItemName('relic'),
          skin: this.saveStore.getEquippedItemName('skin'),
        },
        orbHpBonus: this.saveStore.getWorldOrbHpBonus(),
        cultivationSummary: `${cult.current.name} (Lv.${cult.current.level}) · 气血+${cult.hpBonus} · 剑伤+${cult.atkPct}%${ultBonusTxt}${elixirTxt}`,
      },
      liveWorldBosses,
      defeatedBossIds: Object.keys(this.saveStore.data.worldBossKills ?? {}),
      totalKills: this.saveStore.data.stats.totalKills ?? 0,
      inWorld: this.mode === 'world',
    };
  }

  private startWorldCustomNavigation(x: number, z: number, label: string, herbId?: string): void {
    if (this.mode !== 'world') {
      this.enterOpenWorldMode();
    }
    const cx = clamp(x, -(WORLD_BOUND - 2), WORLD_BOUND - 2);
    const cz = clamp(z, -(WORLD_BOUND - 2), WORLD_BOUND - 2);
    this.worldCustomNavTarget = { x: cx, z: cz, label: label || '舆图标点', herbId };
    this.worldAutoNav = true;
    this.worldAutoCombatActive = false;
    this.worldAutoResumeTimer = 0;
    this.worldAutoNavPausedByCombat = false;
    this.ancientMap.close();
    this.craftOverlay.close();
    this.hud.showWorldToast(`舆图指引：自动寻路前往【${this.worldCustomNavTarget.label}】`, true, 3200);
  }

  private hasNearbyWorldHostile(radius = 13.5): boolean {
    const h = this.hero.pos;
    return this.enemies.some(
      (e) =>
        e.aiState !== 'dead' &&
        !e.isDummy &&
        Math.hypot(e.pos.x - h.x, e.pos.z - h.z) <= radius &&
        ((e.aggroHeroTimer ?? 0) > 0 ||
          e.aiState === 'chase' ||
          e.aiState === 'windup' ||
          e.aiState === 'attack' ||
          e.aiState === 'recover'),
    );
  }

  private markWorldCombatEngage(): void {
    if (this.mode !== 'world') return;
    this.worldInCombat = true;
    this.worldCombatCooldown = 3.2;
    if (this.worldAutoCombatActive) return;
    if (this.worldAutoNav) {
      this.worldAutoNav = false;
      this.worldAutoNavPausedByCombat = true;
      this.rmbMoveTarget = null;
      this.hud.showWorldToast('遭遇敌袭：自动寻路已暂停，破敌后将指引下一步！', true, 2600);
    }
  }

  private announceWorldNextStep(reason: string): void {
    if (this.mode !== 'world') return;
    const dropCount = this.vfx.getPendingGearDropCount();
    let nextMsg = '';
    if (dropCount > 0) {
      nextMsg = `${reason}！下一步：前方仍有 ${dropCount} 件战利品光柱，走近拾取神兵`;
    } else if (this.activeWorldInteract) {
      nextMsg = `${reason}！下一步：${this.activeWorldInteract.label}`;
    } else {
      const guide = this.resolveWorldGuideTarget();
      if (guide) {
        const dx = guide.x - this.hero.pos.x;
        const dz = guide.z - this.hero.pos.z;
        const dist = Math.round(Math.hypot(dx, dz));
        const dir = this.formatWorldDirection(dx, dz);
        nextMsg = this.worldAutoNavPausedByCombat
          ? `${reason}！可点右下「继续寻路」→ ${dir} 约${dist}米【${guide.label}】(${guide.actionHint})`
          : `${reason}！下一步：${dir} 约${dist}米前往【${guide.label}】(${guide.actionHint})`;
      } else {
        nextMsg = `${reason}！九州探索圆满，可点右上「重召首领」或回剑庐/闯关历练`;
      }
    }
    this.worldLastCombatNotice = nextMsg;
    this.hud.flashWorldGuideNextStep(nextMsg);
    this.hud.showWorldToast(nextMsg, true, 4600);
    this.showStorySubtitle(nextMsg, 4.2);
  }

  private syncMoonKeyLightToHero(): void {
    if (!this.moonKeyLight) return;
    const texel = 44 / 2048;
    const sx = Math.round(this.hero.pos.x / texel) * texel;
    const sz = Math.round(this.hero.pos.z / texel) * texel;
    this.moonKeyLight.position.set(sx - 15, 24, sz - 18);
    this.moonKeyLight.target.position.set(sx, 0, sz);
    this.moonKeyLight.target.updateMatrixWorld();
  }

  private applyBiomeAtmosphere(biome: WorldBiome, chDef?: ChapterDef): void {
    this.lastBiomeApplied = biome;
    this.lastChapterApplied = chDef;
    let bgHex = '#0c1522';
    let fogHex = '#101d2c';
    let fogDensity = 0.0138;
    if (biome === 'haven_camp') {
      bgHex = '#191522';
      fogHex = '#221b2c';
      fogDensity = 0.0115;
    } else if (biome === 'peach_shrine') {
      bgHex = '#161124';
      fogHex = '#21172f';
      fogDensity = 0.0128;
    } else if (biome === 'sword_graveyard') {
      bgHex = '#100d1f';
      fogHex = '#18132d';
      fogDensity = 0.0132;
    } else if (biome === 'lava_abyss') {
      bgHex = '#1d0c0c';
      fogHex = '#2c1210';
      fogDensity = 0.013;
    } else if (biome === 'celestial_sanctum') {
      bgHex = '#0a1224';
      fogHex = '#101c36';
      fogDensity = 0.0124;
    } else if (biome === 'astral_void') {
      bgHex = '#090d22';
      fogHex = '#101736';
      fogDensity = 0.0118;
    } else if (chDef) {
      bgHex = chDef.bgHex;
      fogHex = chDef.fogHex;
      fogDensity = 0.0138;
    }

    const bgColor = new THREE.Color(bgHex);
    const fogColor = new THREE.Color(fogHex);
    const theme = this.visualSettings.atmosphereTheme;
    if (theme === 'ink_frost') {
      bgColor.lerp(new THREE.Color('#162638'), 0.34);
      fogColor.lerp(new THREE.Color('#1f3448'), 0.36);
    } else if (theme === 'golden_dawn') {
      bgColor.lerp(new THREE.Color('#2c1c14'), 0.36);
      fogColor.lerp(new THREE.Color('#3c2618'), 0.38);
    } else if (theme === 'astral_violet') {
      bgColor.lerp(new THREE.Color('#1b1134'), 0.38);
      fogColor.lerp(new THREE.Color('#271848'), 0.4);
    }
    this.scene.background = bgColor;
    this.scene.fog = new THREE.FogExp2(fogColor, fogDensity);
  }

  private syncLiveHeroCapsFromLoadout(): void {
    const realm = getSwordRealm(this.saveStore.getTotalStars());
    const loadout = this.getLoadoutStats();
    const cultivation = this.saveStore.getCultivationBonus();
    const elixir = this.saveStore.getElixirBonus();
    const swordHeart = getSwordHeartSummary(this.saveStore.getSwordHeart());
    const h = this.hero;
    const prevMaxHp = h.maxHp;
    const nextMaxHp =
      180 +
      realm.hpBonus +
      loadout.maxHpBonus +
      this.blessings.maxHpBonus +
      cultivation.hpBonus +
      elixir.hpBonus +
      swordHeart.hpBonus +
      this.saveStore.getWorldOrbHpBonus() +
      this.activeMealBuff.hpBonus +
      this.episodeChoiceBuff.hpBonus;
    h.maxHp = nextMaxHp;
    if (nextMaxHp > prevMaxHp) {
      h.hp = Math.min(h.maxHp, h.hp + (nextMaxHp - prevMaxHp));
      h.delayedHp = h.hp;
    } else {
      h.hp = Math.min(h.maxHp, h.hp);
      h.delayedHp = Math.min(h.maxHp, h.delayedHp);
    }
    const nextMaxGourds = 2 + loadout.gourdBonus + this.blessings.extraGourds + this.episodeChoiceBuff.extraGourd;
    if (nextMaxGourds > h.maxGourds) {
      h.gourds += nextMaxGourds - h.maxGourds;
    }
    h.maxGourds = nextMaxGourds;
    h.gourds = Math.min(h.maxGourds, h.gourds);
  }

  private enterTitleMode(): void {
    this.input.resetState();
    this.setShopPreview(false);
    this.setMountMode('none', true);
    this.worldGuideArrow.visible = false;
    this.worldAutoNav = false;
    this.worldAutoCombatActive = false;
    this.worldAutoResumeTimer = 0;
    this.worldCustomNavTarget = null;
    this.worldInCombat = false;
    this.worldCombatCooldown = 0;
    this.worldAutoNavPausedByCombat = false;
    this.worldMobTimers.clear();
    this.worldBossTimers.clear();
    this.worldHerbTimers.clear();
    this.activeWorldInteract = null;
    this.clearCombatEntities();
    this.setCampNpcsVisible(false);
    this.activeDungeon = null;
    this.activeTowerFloor = null;
    this.roguelikeState = null;
    this.resetEndgameStageState();
    this.stageDroppedGear = [];
    this.corridorMode = false;
    this.healingShrineCollected = false;
    this.activeDialogueDef = null;
    this.dialogueContext = 'preStage';
    this.campDialogueFocusPos = null;
    this.activeMealBuff = { hpBonus: 0, dmgBonus: 0, speedBonus: 0, ultBonus: 0 };
    this.episodeChoiceBuff = { dmgBonus: 0, speedBonus: 0, hpBonus: 0, ultBonus: 0, extraGourd: 0 };
    this.arena.setArenaLayout('arena', 0);
    this.arena.setBiome('bamboo_canyon');
    this.arena.setHealingShrineUsed(false);
    this.targetRingMesh.visible = false;
    this.pendingCutsceneAfterDialogue = false;
    // Front-facing yaw = 0 faces +Z directly toward CameraRig.updateTitleOrbit so Hero's face shines unobstructed!
    this.resetHero(new THREE.Vector3(0, 0, 2.2), 0);
    this.applyCurrentLoadoutVisuals();
    this.hero.rig.setWeaponDrawn(false);
    this.arena.setStageTheme(1);
    this.applyBiomeAtmosphere('bamboo_canyon');
    this.mode = 'title';
    this.stagePhase = 'combat';
    if (this.titlePortraitLight) {
      this.titlePortraitLight.visible = true;
      this.titlePortraitLight.position.set(this.hero.pos.x + 1.5, 2.7, this.hero.pos.z + 4.4);
      this.titlePortraitLight.target.position.set(this.hero.pos.x, 1.38, this.hero.pos.z);
      this.titlePortraitLight.target.updateMatrixWorld();
    }
    this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
    this.hud.setMode('title');
    this.audio.setMood('title');
    const isPortrait = window.innerHeight > window.innerWidth;
    this.cameraRig.updateTitleOrbit(this.hero.pos, this.elapsed, isPortrait);
  }

  private enterShowcaseMode(): void {
    this.setMountMode('none', true);
    this.worldGuideArrow.visible = false;
    this.worldAutoNav = false;
    this.activeTowerFloor = null;
    this.roguelikeState = null;
    this.resetEndgameStageState();
    this.clearCombatEntities();
    this.setCampNpcsVisible(false);
    this.corridorMode = false;
    this.healingShrineCollected = false;
    this.arena.setArenaLayout('arena', 0);
    this.arena.setBiome('bamboo_canyon');
    this.arena.setHealingShrineUsed(false);
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

  enterCampMode(): void {
    this.audio.unlock();
    this.input.resetState();
    this.setShopPreview(false);
    if (this.titlePortraitLight) this.titlePortraitLight.visible = false;
    this.setMountMode('none', true);
    this.worldGuideArrow.visible = false;
    this.worldAutoNav = false;
    this.worldAutoCombatActive = false;
    this.worldAutoResumeTimer = 0;
    this.worldCustomNavTarget = null;
    this.worldInCombat = false;
    this.worldCombatCooldown = 0;
    this.worldAutoNavPausedByCombat = false;
    this.worldMobTimers.clear();
    this.worldBossTimers.clear();
    this.activeWorldInteract = null;
    this.mp.leave();
    this.clearPeerHero();
    this.hud.setMpHudBadge('');
    this.hud.setMpLobbyStatus('', false, false);
    this.hud.setHeroName('李逍遥');
    this.clearCombatEntities();
    this.activeDungeon = null;
    this.activeTowerFloor = null;
    this.roguelikeState = null;
    this.resetEndgameStageState();
    this.stageDroppedGear = [];
    this.blessings = createEmptyBlessings();
    this.activeDialogueDef = null;
    this.dialogueContext = 'preStage';
    this.campDialogueFocusPos = null;
    this.activeCampHotspot = null;
    this.pendingCutsceneAfterDialogue = false;
    this.corridorMode = false;
    this.healingShrineCollected = false;
    this.activeMealBuff = { hpBonus: 0, dmgBonus: 0, speedBonus: 0, ultBonus: 0 };
    this.episodeChoiceBuff = { dmgBonus: 0, speedBonus: 0, hpBonus: 0, ultBonus: 0, extraGourd: 0 };

    this.arena.setArenaLayout('arena', 0);
    this.arena.setBiome('haven_camp');
    this.arena.setHealingShrineUsed(false);
    this.applyBiomeAtmosphere('haven_camp');
    this.targetRingMesh.visible = false;
    this.ensureCampNpcs();
    this.setCampNpcsVisible(true);

    this.resetHero(new THREE.Vector3(0, 0, 5.4), Math.PI);
    this.applyCurrentLoadoutVisuals();
    this.hero.rig.setWeaponDrawn(true);
    this.hero.spirit = this.hero.maxSpirit;
    this.spawnPracticeDummy(0, -4.6);

    this.mode = 'camp';
    this.stagePhase = 'combat';
    this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
    this.hud.setMode('camp');
    this.audio.setMood('title');
    this.cameraRig.snapTo(this.hero.pos);
    this.updateCampNpcs(0.016);
    this.showStorySubtitle(
      this.hud.isMobileUi()
        ? '云来剑庐：走近师尊酒剑仙、玄影师兄、蒲团或茶席，点击下方「互动」'
        : '云来剑庐：可走近师尊酒剑仙、玄影师兄、蒲团或篝火茶席互动（按 G 键）',
      3.4,
    );
    this.hud.update(this.hero, '云来剑庐 · 自由演武', null, null, 'none', this.buildTacticalState());
  }

  private toggleMount(mode: Exclude<MountMode, 'none'>): void {
    if (this.mp.mode !== 'offline') {
      this.hud.showSubtitle('联机比武模式下暂不可召唤坐骑/御剑', 2.0);
      return;
    }
    if (this.mode !== 'world' && this.mode !== 'camp' && this.mode !== 'playing') return;
    if (this.hero.state !== 'idle' && this.hero.state !== 'run') return;
    const next: MountMode = this.mountMode === mode ? 'none' : mode;
    this.setMountMode(next);
  }

  private setMountMode(mode: MountMode, silent = false): void {
    if (this.mountMode === mode && mode === 'none') {
      this.mountRig.setMode('none');
      this.hero.rig.root.position.y = 0;
      this.hero.rig.root.rotation.x = 0;
      return;
    }
    this.mountMode = mode;
    this.mountDashTimer = 0;
    this.mountWindTimer = 0;
    this.mountRig.setMode(mode);
    this.mountRig.root.position.copy(this.hero.pos);
    this.mountRig.root.rotation.y = this.hero.yaw;

    if (mode === 'none') {
      this.hero.rig.root.position.y = 0;
      this.hero.rig.root.rotation.x = 0;
      this.cameraRig.setZoom(1.0);
      if (!silent) {
        this.vfx.spawnShockRing(this.hero.pos, new THREE.Color(0.55, 1.5, 1.85), 0.25, 1.8, 0.28);
      }
      return;
    }

    this.rmbMoveTarget = null;
    this.hero.rig.setWeaponDrawn(mode === 'horse');
    this.cameraRig.setZoom(mode === 'sword' ? 1.18 : 1.08);
    if (!silent) {
      this.audio.playDodge(mode === 'sword');
      triggerHaptic('medium');
      if (mode === 'sword') {
        this.vfx.spawnShockRing(this.hero.pos, new THREE.Color(0.45, 2.25, 2.35), 0.35, 3.0, 0.42);
        this.spawnWorldCallout('御剑凌空!', this.hero.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), 'info');
      } else {
        this.vfx.spawnShockRing(this.hero.pos, new THREE.Color(2.2, 1.55, 0.55), 0.35, 2.8, 0.42);
        this.spawnWorldCallout('铁骑踏阵!', this.hero.pos.clone().add(new THREE.Vector3(0, 1.0, 0)), 'info');
      }
    }
  }

  enterOpenWorldMode(): void {
    this.audio.unlock();
    this.input.resetState();
    this.setShopPreview(false);
    if (this.titlePortraitLight) this.titlePortraitLight.visible = false;
    this.setMountMode('none', true);
    this.worldAutoNav = false;
    this.worldAutoCombatActive = false;
    this.worldAutoResumeTimer = 0;
    this.worldAutoAttackCd = 0;
    this.worldCustomNavTarget = null;
    this.worldInCombat = false;
    this.worldCombatCooldown = 0;
    this.worldAutoNavPausedByCombat = false;
    this.worldLastCombatNotice = '';
    this.mp.leave();
    this.clearPeerHero();
    this.hud.setMpHudBadge('');
    this.hud.setMpLobbyStatus('', false, false);
    this.hud.setHeroName('李逍遥');
    this.clearCombatEntities();
    this.setCampNpcsVisible(false);
    this.activeDungeon = null;
    this.activeTowerFloor = null;
    this.roguelikeState = null;
    this.resetEndgameStageState();
    this.stageDroppedGear = [];
    this.blessings = createEmptyBlessings();
    this.activeDialogueDef = null;
    this.dialogueContext = 'preStage';
    this.campDialogueFocusPos = null;
    this.activeCampHotspot = null;
    this.pendingCutsceneAfterDialogue = false;
    this.corridorMode = false;
    this.healingShrineCollected = false;
    this.worldMobTimers.clear();
    this.worldBossTimers.clear();
    this.worldHerbTimers.clear();
    this.worldLastRegionId = 'center';
    this.activeWorldInteract = null;
    this.worldLavaBurnTimer = 0;
    this.worldEventTimer = 38;
    this.worldEventEnemyId = null;
    this.worldEventExpireTimer = 0;

    this.arena.setArenaLayout('openworld', 0);
    this.arena.setBiome('bamboo_canyon');
    this.arena.setHealingShrineUsed(false);
    this.applyBiomeAtmosphere('bamboo_canyon');
    this.targetRingMesh.visible = false;

    for (const wp of WORLD_WAYPOINTS) {
      this.arena.setWaypointLit(wp.id, this.saveStore.isWorldWaypointLit(wp.id));
    }
    for (const ch of WORLD_CHESTS) {
      this.arena.setChestOpened(ch.id, this.saveStore.isWorldChestOpened(ch.id));
    }
    for (const orb of WORLD_SPIRIT_ORBS) {
      this.arena.setSpiritOrbCollected(orb.id, this.saveStore.isWorldOrbCollected(orb.id));
    }
    for (const herb of WORLD_HERB_NODES) {
      this.arena.setHerbNodeAvailable(herb.id, true);
    }

    this.resetHero(new THREE.Vector3(WORLD_SPAWN_POS.x, 0, WORLD_SPAWN_POS.z), Math.PI);
    this.applyCurrentLoadoutVisuals();
    this.hero.rig.setWeaponDrawn(false);
    this.hero.spirit = this.hero.maxSpirit;

    for (const camp of WORLD_MOB_CAMPS) {
      this.spawnWorldMobCamp(camp);
    }
    for (const wb of WORLD_BOSS_SPAWNS) {
      this.spawnWorldBoss(wb);
    }

    this.mode = 'world';
    this.stagePhase = 'combat';
    this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
    this.hud.setMode('world');
    this.hud.renderWorldTeleportList();
    const prog = this.saveStore.getWorldProgress();
    const reg = getWorldRegionAt(this.hero.pos.x, this.hero.pos.z);
    this.hud.setWorldStatus(reg.name, prog.waypoints, prog.chests, prog.bosses, prog.orbs);
    this.hud.setWorldInteractPrompt(null);
    this.audio.setMood('skirmish');
    this.cameraRig.snapTo(this.hero.pos);
    this.showStorySubtitle(
      this.hud.isMobileUi()
        ? '九州仙域已开启：点右侧「骑马」「御剑」驰骋六境，点「九州舆图」查看全图！'
        : '九州仙域已开启：按 V 唤战马、按 B 御剑飞渡，探索九州六境锚点、宝箱与野外首领！',
      4.0,
    );
    this.hud.update(this.hero, '九州仙域 · 自由驰骋', null, null, 'none', this.buildTacticalState());
  }

  private spawnWorldMobCamp(camp: WorldMobCampDef): void {
    const aliveInCamp = this.enemies.some((e) => e.worldCampId === camp.id && e.aiState !== 'dead');
    if (aliveInCamp) return;
    for (const m of camp.mobs) {
      const e = this.spawnEnemy(m.kind, camp.x + m.dx, camp.z + m.dz, undefined, {
        name: m.name,
        hpMult: m.hpMult,
        dmgMult: m.dmgMult,
        affix: m.affix,
      });
      e.homePos = new THREE.Vector3(camp.x, 0, camp.z);
      e.worldCampId = camp.id;
      e.aggroRadius = 15;
      e.leashRadius = 26;
      e.aiState = 'orbit';
      e.attackCooldown = 0.65;
    }
  }

  private spawnWorldBoss(wb: WorldBossDef): void {
    const alive = this.enemies.some((e) => e.worldBossId === wb.id && e.aiState !== 'dead');
    if (alive) return;
    const scaleMult = wb.bossArchetype === 'titan' ? 1.18 : wb.bossArchetype === 'celestial' ? 1.15 : 1.05;
    const e = this.spawnEnemy('boss', wb.x, wb.z, undefined, {
      name: wb.name,
      hpMult: wb.hpMult,
      poiseMult: wb.poiseMult,
      dmgMult: wb.dmgMult,
      scaleMult,
      affix: wb.affix,
      bossArchetype: wb.bossArchetype,
    });
    e.homePos = new THREE.Vector3(wb.x, 0, wb.z);
    e.worldBossId = wb.id;
    e.aggroRadius = 20;
    e.leashRadius = 32;
    e.aiState = 'orbit';
    e.attackCooldown = 0.8;
  }

  private updateOpenWorld(dt: number): void {
    const h = this.hero;
    const region = getWorldRegionAt(h.pos.x, h.pos.z);
    if (region.id !== this.worldLastRegionId) {
      this.worldLastRegionId = region.id;
      this.applyBiomeAtmosphere(region.biome);
      this.hud.showWorldToast(`踏入【${region.name}】· ${region.subtitle}`, true);
    }

    const nearWorldBoss = this.findNearestBossInRange(22);
    this.audio.setMood(nearWorldBoss ? 'boss1' : 'skirmish');

    if (this.worldEventEnemyId !== null) {
      const goblin = this.enemies.find((e) => e.id === this.worldEventEnemyId && e.aiState !== 'dead');
      if (!goblin) {
        this.worldEventEnemyId = null;
        this.worldEventTimer = 46;
      } else {
        this.worldEventExpireTimer -= dt;
        if (this.worldEventExpireTimer <= 0) {
          this.vfx.spawnShockRing(goblin.pos, new THREE.Color(2.2, 1.8, 0.5), 0.3, 3.0, 0.4);
          this.scene.remove(goblin.rig.root);
          const idx = this.enemies.indexOf(goblin);
          if (idx >= 0) this.enemies.splice(idx, 1);
          this.worldEventEnemyId = null;
          this.worldEventTimer = 46;
          this.hud.showWorldToast('赤金宝妖遁入虚空，奇遇暂歇。', false);
        }
      }
    } else {
      this.worldEventTimer -= dt;
      if (this.worldEventTimer <= 0) {
        this.spawnWorldTreasureEvent();
      }
    }

    if (this.mountMode === 'sword' && h.state !== 'dead') {
      for (const orb of WORLD_SPIRIT_ORBS) {
        if (this.saveStore.isWorldOrbCollected(orb.id)) continue;
        if (Math.hypot(h.pos.x - orb.x, h.pos.z - orb.z) <= 3.0) {
          this.collectWorldOrb(orb.id);
        }
      }
    }

    for (const [campId, remain] of Array.from(this.worldMobTimers.entries())) {
      const next = remain - dt;
      if (next <= 0) {
        this.worldMobTimers.delete(campId);
        const camp = WORLD_MOB_CAMPS.find((c) => c.id === campId);
        if (camp) {
          this.spawnWorldMobCamp(camp);
          this.vfx.spawnShockRing(new THREE.Vector3(camp.x, 0, camp.z), new THREE.Color(0.55, 2.0, 2.2), 0.5, 4.0, 0.55);
        }
      } else {
        this.worldMobTimers.set(campId, next);
      }
    }

    for (const [bossId, remain] of Array.from(this.worldBossTimers.entries())) {
      const next = remain - dt;
      if (next <= 0) {
        this.worldBossTimers.delete(bossId);
        const wb = WORLD_BOSS_SPAWNS.find((b) => b.id === bossId);
        if (wb) {
          this.spawnWorldBoss(wb);
          this.vfx.spawnBaguaArray({
            pos: new THREE.Vector3(wb.x, 0.08, wb.z),
            radius: 4.5,
            color: new THREE.Color(2.0, 0.45, 0.55),
            duration: 1.5,
          });
          this.hud.showWorldToast(`野外首领【${wb.name}】已在【${wb.regionName}】重新现身！`, true);
        }
      } else {
        this.worldBossTimers.set(bossId, next);
      }
    }

    for (const [herbId, remain] of Array.from(this.worldHerbTimers.entries())) {
      const next = remain - dt;
      if (next <= 0) {
        this.worldHerbTimers.delete(herbId);
        this.arena.setHerbNodeAvailable(herbId, true);
      } else {
        this.worldHerbTimers.set(herbId, next);
      }
    }

    if (this.arena.isInWorldLava(h.pos) && this.mountMode !== 'sword' && h.state !== 'dead') {
      this.worldLavaBurnTimer -= dt;
      if (this.worldLavaBurnTimer <= 0) {
        this.worldLavaBurnTimer = 0.9;
        this.tryHitHero(null, 14, true);
        this.spawnWorldCallout(
          this.hud.isMobileUi() ? '赤焰灼体！点右侧「御剑」飞渡！' : '赤焰灼体！按 B 御剑飞渡！',
          h.pos.clone().add(new THREE.Vector3(0, 1.3, 0)),
          'crit',
        );
      }
    } else {
      this.worldLavaBurnTimer = 0;
    }

    let nextPrompt: { kind: 'waypoint' | 'chest' | 'herb'; id: string; label: string } | null = null;
    let bestDist = 4.4;
    const isMobUi = this.hud.isMobileUi();

    for (const wp of WORLD_WAYPOINTS) {
      if (this.saveStore.isWorldWaypointLit(wp.id)) continue;
      const d = Math.hypot(h.pos.x - wp.x, h.pos.z - wp.z);
      if (d <= 4.2 && d < bestDist) {
        bestDist = d;
        nextPrompt = {
          kind: 'waypoint',
          id: wp.id,
          label: isMobUi ? `点击互动 · 点亮 ${wp.name}` : `点亮传送锚点 · ${wp.name} (G)`,
        };
      }
    }

    for (const ch of WORLD_CHESTS) {
      if (this.saveStore.isWorldChestOpened(ch.id)) continue;
      const d = Math.hypot(h.pos.x - ch.x, h.pos.z - ch.z);
      if (d <= 3.8 && d < bestDist) {
        bestDist = d;
        nextPrompt = {
          kind: 'chest',
          id: ch.id,
          label: isMobUi ? `点击互动 · 开启 ${ch.name}` : `开启宝箱 · ${ch.name} (G)`,
        };
      }
    }

    for (const herb of WORLD_HERB_NODES) {
      if (this.worldHerbTimers.has(herb.id)) continue;
      const d = Math.hypot(h.pos.x - herb.x, h.pos.z - herb.z);
      if (d <= 3.6 && d < bestDist) {
        bestDist = d;
        nextPrompt = {
          kind: 'herb',
          id: herb.id,
          label: isMobUi ? `点击互动 · 采摘【${herb.name}】` : `采摘【${herb.name}】 (G)`,
        };
      }
    }

    this.activeWorldInteract = nextPrompt;
    this.hud.setWorldInteractPrompt(nextPrompt?.label ?? null);

    if (this.worldCombatCooldown > 0) {
      this.worldCombatCooldown -= dt;
      if (this.worldCombatCooldown <= 0) {
        if (this.hasNearbyWorldHostile(13.5)) {
          this.worldCombatCooldown = 1.2;
        } else if (this.worldInCombat) {
          this.worldInCombat = false;
          if (!this.worldAutoCombatActive) {
            this.announceWorldNextStep('战斗结束');
          }
        }
      }
    }

    const prog = this.saveStore.getWorldProgress();
    this.hud.setWorldStatus(region.name, prog.waypoints, prog.chests, prog.bosses, prog.orbs);

    // Smart Auto-Nav Encounter System: Auto-Combat & Post-Battle Auto-Resume
    if (this.worldAutoCombatActive) {
      this.stepWorldAutoCombat(dt);
    } else if (this.worldAutoResumeTimer > 0) {
      const threatNear = this.findNearestWorldHostile(10.5);
      if (threatNear && h.state !== 'dead') {
        this.worldAutoResumeTimer = 0;
        this.worldAutoCombatActive = true;
      } else {
        this.worldAutoResumeTimer -= dt;
        if (this.worldAutoResumeTimer <= 0 && h.state !== 'dead') {
          this.worldAutoResumeTimer = 0;
          const nextG = this.resolveWorldGuideTarget();
          if (nextG) {
            this.worldAutoNav = true;
            this.worldAutoNavPausedByCombat = false;
            this.hud.showWorldToast(`✓ 破敌凯旋！自动续行前往【${nextG.label}】`, true, 3200);
          } else {
            this.worldAutoNavPausedByCombat = false;
          }
        }
      }
    }

    const guide = this.resolveWorldGuideTarget();
    const resumeLabel = !this.worldAutoNav && this.worldAutoNavPausedByCombat ? '继续寻路' : undefined;
    if (guide) {
      const dx = guide.x - h.pos.x;
      const dz = guide.z - h.pos.z;
      const dist = Math.hypot(dx, dz);
      const dirText = this.formatWorldDirection(dx, dz);
      const gy = Math.atan2(dx, dz);
      this.worldGuideArrow.visible = dist > 3.2;
      if (this.worldGuideArrow.visible) {
        this.worldGuideArrow.position.set(
          h.pos.x + Math.sin(gy) * 1.85,
          0.24 + Math.sin(this.elapsed * 4.5) * 0.04,
          h.pos.z + Math.cos(gy) * 1.85,
        );
        this.worldGuideArrow.rotation.y = gy;
      }

      if (this.worldAutoNav) {
        this.worldAutoNavPausedByCombat = false;
        const nearestHostile = this.findNearestWorldHostile(12.5);
        const nearestDist = nearestHostile
          ? Math.hypot(nearestHostile.pos.x - h.pos.x, nearestHostile.pos.z - h.pos.z)
          : Infinity;
        const isCombatGoal = guide.kind === 'boss' || guide.kind === 'event';

        if (
          this.worldAutoNavPolicy === 'fight' &&
          nearestHostile &&
          h.state !== 'dead' &&
          (nearestDist <= 9.5 || (isCombatGoal && nearestDist <= 7.5))
        ) {
          this.worldAutoNav = false;
          this.worldAutoNavPausedByCombat = true;
          this.worldAutoCombatActive = true;
          this.worldAutoResumeTimer = 0;
          this.rmbMoveTarget = null;
          h.yaw = Math.atan2(nearestHostile.pos.x - h.pos.x, nearestHostile.pos.z - h.pos.z);
          h.rig.root.rotation.y = h.yaw;
          if (this.mountMode !== 'none') {
            this.startHeroAttack(1);
          }
          this.hud.showWorldToast(
            `⚔ 途中遭遇【${nearestHostile.name}】！自动迎战中，破敌后继续寻路`,
            true,
            3200,
          );
        } else if (dist <= 2.8 || h.state === 'dead') {
          this.worldAutoNav = false;
          this.rmbMoveTarget = null;
          if (dist <= 2.8 && h.state !== 'dead') {
            const herbId = this.worldCustomNavTarget?.herbId;
            this.worldCustomNavTarget = null;
            if (herbId && !this.worldHerbTimers.has(herbId)) {
              this.harvestWorldHerb(herbId);
            } else {
              const nearReadyHerb = WORLD_HERB_NODES.find(
                (n) => !this.worldHerbTimers.has(n.id) && Math.hypot(n.x - h.pos.x, n.z - h.pos.z) <= 3.4,
              );
              if (nearReadyHerb && guide.kind === 'herb') {
                this.harvestWorldHerb(nearReadyHerb.id);
              } else {
                this.hud.showWorldToast(`已抵达【${guide.label}】附近！${guide.actionHint}`, true, 3600);
              }
            }
          }
        } else {
          // Evade policy: summon flying sword and apply smooth lateral repulsion around hostiles!
          let steerX = guide.x;
          let steerZ = guide.z;
          if (this.worldAutoNavPolicy === 'evade' && !isCombatGoal && nearestHostile && nearestDist <= 12.0) {
            if (this.mountMode !== 'sword' && (h.state === 'idle' || h.state === 'run')) {
              this.setMountMode('sword');
            }
            const gLen = Math.max(0.001, dist);
            let dirX = dx / gLen;
            let dirZ = dz / gLen;
            let repX = 0;
            let repZ = 0;
            for (const e of this.enemies) {
              if (e.aiState === 'dead' || e.isDummy) continue;
              const ex = h.pos.x - e.pos.x;
              const ez = h.pos.z - e.pos.z;
              const ed = Math.hypot(ex, ez);
              if (ed > 0.05 && ed <= 13.0) {
                const w = (13.0 - ed) / 13.0;
                // Blend radial away + smooth lateral tangent so Hero glides cleanly around camp
                const rx = ex / ed;
                const rz = ez / ed;
                const tx = -dirZ;
                const tz = dirX;
                const sideSign = rx * tx + rz * tz >= 0 ? 1 : -1;
                repX += (rx * 0.75 + tx * sideSign * 1.15) * w;
                repZ += (rz * 0.75 + tz * sideSign * 1.15) * w;
              }
            }
            dirX += repX * 1.45;
            dirZ += repZ * 1.45;
            const sLen = Math.max(0.001, Math.hypot(dirX, dirZ));
            steerX = clamp(h.pos.x + (dirX / sLen) * 5.0, -(WORLD_BOUND - 2), WORLD_BOUND - 2);
            steerZ = clamp(h.pos.z + (dirZ / sLen) * 5.0, -(WORLD_BOUND - 2), WORLD_BOUND - 2);
          } else if (guide.kind === 'orb' && dist <= 9.5 && this.mountMode !== 'sword' && (h.state === 'idle' || h.state === 'run')) {
            this.setMountMode('sword');
          } else if (dist > 14 && this.mountMode === 'none' && (h.state === 'idle' || h.state === 'run')) {
            this.setMountMode('horse');
          }
          if (!this.rmbMoveTarget) this.rmbMoveTarget = new THREE.Vector3(steerX, 0, steerZ);
          else this.rmbMoveTarget.set(steerX, 0, steerZ);
        }
      }

      const shortName = guide.label.replace(/^[^·]+·\s*/, '');
      const miniGoalText = this.worldAutoCombatActive
        ? '⚔ 自动迎战中'
        : this.worldAutoResumeTimer > 0
          ? '✓ 清敌续行中'
          : `${shortName} · ${Math.round(dist)}m`;

      this.hud.setWorldGuide(
        guide.label,
        `${dirText} · 约 ${Math.round(dist)} 米 · ${guide.actionHint}`,
        `玩法：点亮${WORLD_WAYPOINTS.length}锚点开传送 · 采${WORLD_HERB_NODES.length}灵草炼丹 · 斩${WORLD_BOSS_SPAWNS.length}首领爆神兵`,
        this.worldAutoNav,
        resumeLabel,
        miniGoalText,
      );
    } else {
      this.worldGuideArrow.visible = false;
      this.worldAutoNav = false;
      this.worldAutoNavPausedByCombat = false;
      this.hud.setWorldGuide(
        '九州探索圆满 · 挑战四方首领',
        '可点右上「重召首领」或进剑庐/闯关继续历练',
        '玩法：四方野外首领约45秒自动刷新，掉落高阶神兵、真龙逆鳞与海量灵石',
        false,
        undefined,
        '九州探索圆满',
      );
    }
  }

  private findNearestWorldHostile(maxRange: number): EnemyEntity | null {
    const h = this.hero.pos;
    let best: EnemyEntity | null = null;
    let bestDist = maxRange;
    for (const e of this.enemies) {
      if (e.aiState === 'dead' || e.isDummy) continue;
      const d = Math.hypot(e.pos.x - h.x, e.pos.z - h.z);
      if (d <= bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  private stepWorldAutoCombat(dt: number): void {
    const h = this.hero;
    if (h.state === 'dead') {
      this.worldAutoCombatActive = false;
      this.worldAutoNavPausedByCombat = false;
      this.worldAutoResumeTimer = 0;
      this.rmbMoveTarget = null;
      return;
    }

    const hpRatio = h.hp / Math.max(1, h.maxHp);
    if (hpRatio < 0.28 && h.gourds <= 0) {
      this.worldAutoCombatActive = false;
      this.worldAutoNavPausedByCombat = false;
      this.worldAutoResumeTimer = 0;
      this.rmbMoveTarget = null;
      this.hud.showWorldToast('⚠ 气血危急（<28%）！自动迎战已停止，请手动规避或服丹回血', false, 3600);
      return;
    }

    if (hpRatio < 0.45 && h.gourds > 0 && h.cdHeal <= 0 && (h.state === 'idle' || h.state === 'run')) {
      this.rmbMoveTarget = null;
      this.startDrinkGourd();
      return;
    }

    const target = this.findNearestWorldHostile(14.0);
    if (!target) {
      this.worldAutoCombatActive = false;
      this.rmbMoveTarget = null;
      this.worldAutoResumeTimer = 1.15;
      return;
    }

    // Auto-dodge incoming enemy windup within 4.5m
    for (const e of this.enemies) {
      if (e.aiState !== 'windup' || e.isDummy) continue;
      const d = Math.hypot(e.pos.x - h.pos.x, e.pos.z - h.pos.z);
      const wp = e.stateTime / Math.max(0.1, e.stateDuration);
      if (
        d <= 4.5 &&
        wp >= 0.45 &&
        h.stamina >= 24 &&
        h.dodgeInvuln <= 0 &&
        (h.state === 'idle' || h.state === 'run' || h.state === 'attack')
      ) {
        const angToEnemy = Math.atan2(e.pos.x - h.pos.x, e.pos.z - h.pos.z);
        h.yaw = angToEnemy + Math.PI * 0.5;
        this.rmbMoveTarget = null;
        this.startHeroDodge();
        return;
      }
    }

    const dx = target.pos.x - h.pos.x;
    const dz = target.pos.z - h.pos.z;
    const dist = Math.hypot(dx, dz);
    const faceYaw = Math.atan2(dx, dz);
    this.worldAutoAttackCd = Math.max(0, this.worldAutoAttackCd - dt);

    const isFree = h.state === 'idle' || h.state === 'run';
    const isCancelable = h.state === 'attack' && h.stateTime / Math.max(0.1, h.stateDuration) >= 0.65;

    if (dist > 2.75) {
      if (isFree && dist <= 11.5 && h.spirit >= 20 && h.cdQ <= 0) {
        h.yaw = faceYaw;
        this.rmbMoveTarget = null;
        this.startSkillQ();
        return;
      }
      if (isFree && h.q2ReadyTimer > 0 && dist <= 15) {
        h.yaw = faceYaw;
        this.rmbMoveTarget = null;
        this.startSkillQ2();
        return;
      }
      if (!this.rmbMoveTarget) this.rmbMoveTarget = new THREE.Vector3(target.pos.x, 0, target.pos.z);
      else this.rmbMoveTarget.set(target.pos.x, 0, target.pos.z);
      return;
    }

    this.rmbMoveTarget = null;
    if (isFree || isCancelable) {
      h.yaw = faceYaw;
      if (h.ult >= 100 && h.cdR <= 0) {
        this.startSkillR();
      } else if (h.spirit >= 45 && h.cdE <= 0) {
        this.startSkillE();
      } else if (h.q2ReadyTimer > 0) {
        this.startSkillQ2();
      } else if (h.spirit >= 20 && h.cdQ <= 0) {
        this.startSkillQ();
      } else if (this.worldAutoAttackCd <= 0) {
        const nextStep = h.comboWindowTimer > 0 && h.comboStep < 4 ? h.comboStep + 1 : 1;
        this.startHeroAttack(nextStep);
        this.worldAutoAttackCd = 0.22;
      }
    }
  }

  private formatWorldDirection(dx: number, dz: number): string {
    const deg = (Math.atan2(dx, -dz) * 180) / Math.PI;
    const norm = (deg + 360) % 360;
    const dirs = ['↑ 正北', '↗ 东北', '→ 正东', '↘ 东南', '↓ 正南', '↙ 西南', '← 正西', '↖ 西北'];
    return dirs[Math.round(norm / 45) % 8];
  }

  private resolveWorldGuideTarget(): {
    x: number;
    z: number;
    label: string;
    actionHint: string;
    kind: 'event' | 'waypoint' | 'chest' | 'orb' | 'boss' | 'herb';
  } | null {
    const h = this.hero.pos;
    const isMobUi = this.hud.isMobileUi();

    if (this.worldCustomNavTarget) {
      return {
        x: this.worldCustomNavTarget.x,
        z: this.worldCustomNavTarget.z,
        label: this.worldCustomNavTarget.label,
        actionHint: this.worldCustomNavTarget.herbId ? '靠近自动采摘灵草矿脉' : '舆图指定目标 · 自动寻路前往',
        kind: this.worldCustomNavTarget.herbId ? 'herb' : 'waypoint',
      };
    }

    const pickNearest = <T extends { x: number; z: number }>(arr: T[]): T | null => {
      let best: T | null = null;
      let bestD = Infinity;
      for (const item of arr) {
        const d = Math.hypot(item.x - h.x, item.z - h.z);
        if (d < bestD) {
          bestD = d;
          best = item;
        }
      }
      return best;
    };

    if (this.worldGuideCategory === 'auto' && this.worldEventEnemyId !== null) {
      const goblin = this.enemies.find((e) => e.id === this.worldEventEnemyId && e.aiState !== 'dead');
      if (goblin) {
        return {
          x: goblin.pos.x,
          z: goblin.pos.z,
          label: '奇遇 · 追击赤金宝妖',
          actionHint: isMobUi ? '点击出剑斩杀必爆神兵' : '左键/J 斩杀必爆神兵',
          kind: 'event',
        };
      }
    }

    const order: Array<'waypoint' | 'chest' | 'orb' | 'boss'> =
      this.worldGuideCategory === 'auto'
        ? ['waypoint', 'chest', 'orb', 'boss']
        : [this.worldGuideCategory];

    for (const cat of order) {
      if (cat === 'waypoint') {
        const unlit = WORLD_WAYPOINTS.filter((w) => !this.saveStore.isWorldWaypointLit(w.id));
        const wp = pickNearest(unlit);
        if (wp) {
          return {
            x: wp.x,
            z: wp.z,
            label: `点亮锚点 · ${wp.name}`,
            actionHint: isMobUi ? '靠近点击下方「互动」激活传送' : '靠近按 G 激活传送',
            kind: 'waypoint',
          };
        }
      } else if (cat === 'chest') {
        const unopened = WORLD_CHESTS.filter((c) => !this.saveStore.isWorldChestOpened(c.id));
        const ch = pickNearest(unopened);
        if (ch) {
          return {
            x: ch.x,
            z: ch.z,
            label: `开启宝箱 · ${ch.name}`,
            actionHint: isMobUi ? '靠近点击下方「互动」领神兵' : '靠近按 G 领神兵',
            kind: 'chest',
          };
        }
      } else if (cat === 'orb') {
        const uncol = WORLD_SPIRIT_ORBS.filter((o) => !this.saveStore.isWorldOrbCollected(o.id));
        const orb = pickNearest(uncol);
        if (orb) {
          return {
            x: orb.x,
            z: orb.z,
            label: `御剑采瞳 · ${orb.name}`,
            actionHint: isMobUi ? '点右侧「御剑」靠近自动吸收' : '按 B 御剑靠近自动吸收',
            kind: 'orb',
          };
        }
      } else if (cat === 'boss') {
        const liveBosses = this.enemies
          .filter((e) => e.kind === 'boss' && e.worldBossId && e.aiState !== 'dead')
          .map((e) => ({ x: e.pos.x, z: e.pos.z, name: e.name }));
        const b = pickNearest(liveBosses);
        if (b) {
          return { x: b.x, z: b.z, label: `征讨首领 · ${b.name}`, actionHint: '击杀必掉极品神兵', kind: 'boss' };
        }
      }
    }

    const fallbackBoss = this.enemies.find((e) => e.kind === 'boss' && e.worldBossId && e.aiState !== 'dead');
    if (fallbackBoss) {
      return {
        x: fallbackBoss.pos.x,
        z: fallbackBoss.pos.z,
        label: `征讨首领 · ${fallbackBoss.name}`,
        actionHint: '击杀必掉极品神兵',
        kind: 'boss',
      };
    }
    return null;
  }

  private cycleWorldGuideCategory(): void {
    const seq: Array<'auto' | 'waypoint' | 'chest' | 'orb' | 'boss'> = ['auto', 'waypoint', 'chest', 'orb', 'boss'];
    const labels: Record<'auto' | 'waypoint' | 'chest' | 'orb' | 'boss', string> = {
      auto: '智能推荐',
      waypoint: '传送锚点',
      chest: '野外宝箱',
      orb: '空中灵瞳',
      boss: '四方首领',
    };
    const nextIdx = (seq.indexOf(this.worldGuideCategory) + 1) % seq.length;
    this.worldGuideCategory = seq[nextIdx];
    this.worldAutoNav = false;
    this.worldCustomNavTarget = null;
    this.rmbMoveTarget = null;
    this.hud.showWorldToast(`指引切换为【${labels[this.worldGuideCategory]}】`, true);
  }

  private toggleWorldAutoNav(): void {
    if (this.mode !== 'world') return;
    this.worldAutoNav = !this.worldAutoNav;
    this.worldAutoCombatActive = false;
    this.worldAutoResumeTimer = 0;
    this.worldAutoNavPausedByCombat = false;
    if (!this.worldAutoNav) {
      this.worldCustomNavTarget = null;
      this.rmbMoveTarget = null;
      this.hud.showWorldToast('已停止自动寻路', true);
    } else {
      const g = this.resolveWorldGuideTarget();
      if (!g) {
        this.worldAutoNav = false;
        this.hud.showWorldToast('暂无可寻路的未完成目标', false);
        return;
      }
      this.hud.showWorldToast(`正在自动寻路前往【${g.label}】`, true);
    }
  }

  private harvestWorldHerb(herbId: string): boolean {
    const herb = WORLD_HERB_NODES.find((n) => n.id === herbId);
    if (!herb || this.worldHerbTimers.has(herb.id)) return false;
    const qty = herb.yieldMin + Math.floor(this.rng() * (herb.yieldMax - herb.yieldMin + 1));
    const mat = CRAFT_MATERIAL_MAP[herb.materialId];
    this.saveStore.addMaterial(herb.materialId, qty);
    this.worldHerbTimers.set(herb.id, herb.respawnSec);
    this.arena.setHerbNodeAvailable(herb.id, false);
    const hPos = new THREE.Vector3(herb.x, 0.25, herb.z);
    const col = new THREE.Color(herb.accentHex).multiplyScalar(1.85);
    this.vfx.spawnShockRing(new THREE.Vector3(herb.x, 0.08, herb.z), col, 0.3, 2.8, 0.45);
    this.vfx.spawnHitSparks(hPos, new THREE.Vector3(0, 1, 0), col, 16, this.rng);
    this.audio.playDropChime('spirit');
    triggerHaptic('light');
    const matName = mat?.name ?? herb.name;
    this.spawnWorldCallout(`+${qty} ${matName}`, hPos, 'heal');
    this.activeWorldInteract = null;
    this.hud.setWorldInteractPrompt(null);
    this.hud.showWorldToast(`🌿 采摘【${herb.name}】获得 +${qty} ${matName}（可在「炼丹」合成丹药神兵）`, true, 3200);
    if (this.craftOverlay.isOpen()) this.craftOverlay.refresh(this.saveStore);
    return true;
  }

  private collectWorldOrb(orbId: string): boolean {
    const orb = WORLD_SPIRIT_ORBS.find((o) => o.id === orbId);
    if (!orb || this.saveStore.isWorldOrbCollected(orb.id)) return false;
    this.saveStore.collectWorldOrb(orb.id);
    this.saveStore.addJade(orb.jade);
    this.arena.setSpiritOrbCollected(orb.id, true);
    this.syncLiveHeroCapsFromLoadout();
    const oPos = new THREE.Vector3(orb.x, orb.y, orb.z);
    this.vfx.spawnShockRing(new THREE.Vector3(orb.x, 0.2, orb.z), new THREE.Color(0.45, 2.35, 2.2), 0.35, 3.6, 0.45);
    this.vfx.spawnHealVortex(this.hero.pos);
    this.audio.playDropChime('spirit');
    triggerHaptic('medium');
    this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
    this.spawnWorldCallout('灵瞳 +10气血!', oPos, 'heal');
    this.announceWorldNextStep(`吸收【${orb.name}】(气血+10 · +${orb.jade}灵石)`);
    return true;
  }

  private spawnWorldTreasureEvent(): number | null {
    if (this.mode !== 'world') return null;
    if (this.worldEventEnemyId !== null) {
      const existing = this.enemies.find((x) => x.id === this.worldEventEnemyId && x.aiState !== 'dead');
      if (existing) return existing.id;
    }
    const candidates = [
      { x: 26, z: -24, label: '翠竹桃源林' },
      { x: -26, z: -24, label: '古剑残碑原' },
      { x: -24, z: 24, label: '赤焰熔岩谷' },
      { x: 26, z: 24, label: '星穹天坛遗迹' },
      { x: 0, z: -34, label: '北溟幽冥古道' },
    ];
    const spot = candidates[Math.floor(this.rng() * candidates.length)];
    const e = this.spawnEnemy('elite', spot.x, spot.z, undefined, {
      name: '赤金宝妖 · 携宝仙童',
      hpMult: 1.15,
      dmgMult: 0.8,
      speedMult: 1.38,
      scaleMult: 0.92,
      affix: 'swift',
    });
    e.homePos = new THREE.Vector3(spot.x, 0, spot.z);
    e.worldBossId = 'event_goblin';
    e.aggroRadius = 18;
    e.leashRadius = 26;
    e.aiState = 'orbit';
    e.attackCooldown = 1.6;
    this.worldEventEnemyId = e.id;
    this.worldEventExpireTimer = 34;
    this.worldEventTimer = 46;
    this.vfx.spawnBaguaArray({
      pos: e.pos.clone(),
      radius: 3.4,
      color: new THREE.Color(2.4, 1.9, 0.45),
      duration: 1.6,
    });
    this.audio.playDropChime('spirit');
    this.hud.showWorldToast(`传奇奇遇：【赤金宝妖】现身【${spot.label}】，速斩必掉神兵！`, true);
    return e.id;
  }

  private triggerWorldInteract(forced?: { kind: 'waypoint' | 'chest' | 'herb'; id: string }): boolean {
    if (this.mode !== 'world') return false;
    const target = forced ?? this.activeWorldInteract;
    if (!target) return false;

    if (target.kind === 'herb') {
      return this.harvestWorldHerb(target.id);
    }

    if (target.kind === 'waypoint') {
      const wp = WORLD_WAYPOINTS.find((w) => w.id === target.id);
      if (!wp) return false;
      const firstLit = this.saveStore.unlockWorldWaypoint(wp.id);
      if (firstLit) this.saveStore.addJade(wp.rewardJade);
      this.arena.setWaypointLit(wp.id, true);
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + Math.round(this.hero.maxHp * 0.35));
      this.hero.spirit = this.hero.maxSpirit;
      const wpPos = new THREE.Vector3(wp.x, 0.08, wp.z);
      this.vfx.spawnBaguaArray({
        pos: wpPos,
        radius: 3.4,
        color: new THREE.Color(0.45, 2.25, 2.15),
        duration: 1.8,
      });
      this.vfx.spawnShockRing(wpPos, new THREE.Color(0.45, 2.35, 2.25), 0.4, 4.8, 0.55);
      this.audio.playDropChime('spirit');
      triggerHaptic('medium');
      this.hud.renderWorldTeleportList();
      this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
      this.activeWorldInteract = null;
      this.hud.setWorldInteractPrompt(null);
      this.announceWorldNextStep(firstLit ? `点亮锚点【${wp.name}】(+${wp.rewardJade}灵石)` : `【${wp.name}】灵脉充盈`);
      return true;
    }

    const ch = WORLD_CHESTS.find((c) => c.id === target.id);
    if (!ch || this.saveStore.isWorldChestOpened(ch.id)) return false;
    this.saveStore.openWorldChest(ch.id);
    this.arena.setChestOpened(ch.id, true);
    this.saveStore.addJade(ch.jade);
    const item = rollEquipmentDrop({
      tier: ch.tier,
      guaranteedMinRarity: ch.rarity,
      source: `九州宝箱·${ch.name}`,
      rng: this.rng,
    });
    const addedRes = this.saveStore.addRolledItem(item);
    const chPos = new THREE.Vector3(ch.x, 0.1, ch.z);
    this.vfx.spawnShockRing(chPos, new THREE.Color(2.4, 1.9, 0.5), 0.35, 3.8, 0.5);
    this.vfx.spawnHealVortex(this.hero.pos);
    this.audio.playGearDropChime(item.rarity);
    triggerHaptic('heavy');
    this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
    const gearMsg = addedRes.added ? `神兵【${item.name}】` : `折算+${addedRes.overflowSalvagedJade ?? 0}灵石`;
    this.spawnWorldCallout(`+${ch.jade} 灵石!`, chPos, 'info');
    this.activeWorldInteract = null;
    this.hud.setWorldInteractPrompt(null);
    this.announceWorldNextStep(`开启【${ch.name}】(+${ch.jade}灵石 · ${gearMsg})`);
    return true;
  }

  private teleportToWorldWaypoint(waypointId: string): boolean {
    if (this.mode !== 'world') return false;
    let dest: THREE.Vector3;
    let wpName = '蜀山云台主阵';
    if (waypointId === 'wp_center') {
      dest = new THREE.Vector3(WORLD_SPAWN_POS.x, 0, WORLD_SPAWN_POS.z);
    } else {
      const wp = WORLD_WAYPOINTS.find((w) => w.id === waypointId);
      if (!wp || !this.saveStore.isWorldWaypointLit(wp.id)) {
        this.hud.showWorldToast('该传送锚点尚未点亮，需先前往激活！', false);
        return false;
      }
      dest = new THREE.Vector3(wp.x, 0, wp.z + 2.4);
      wpName = wp.name;
    }

    this.vfx.spawnShockRing(this.hero.pos, new THREE.Color(0.45, 2.2, 2.35), 0.3, 2.8, 0.38);
    this.hero.pos.copy(dest);
    this.arena.constrainPosition(this.hero.pos, this.hero.radius);
    this.hero.rig.root.position.set(this.hero.pos.x, this.mountMode !== 'none' ? this.hero.rig.root.position.y : 0, this.hero.pos.z);
    this.mountRig.root.position.copy(this.hero.pos);
    this.rmbMoveTarget = null;
    this.vfx.spawnBaguaArray({
      pos: this.hero.pos.clone(),
      radius: 3.2,
      color: new THREE.Color(0.45, 2.3, 2.2),
      duration: 1.1,
    });
    this.audio.playDodge(true);
    this.cameraRig.snapTo(this.hero.pos);
    this.hud.showWorldToast(`御风传送至【${wpName}】`, true);
    const prog = this.saveStore.getWorldProgress();
    const reg = getWorldRegionAt(this.hero.pos.x, this.hero.pos.z);
    this.worldLastRegionId = reg.id;
    this.applyBiomeAtmosphere(reg.biome);
    this.hud.setWorldStatus(reg.name, prog.waypoints, prog.chests, prog.bosses, prog.orbs);
    return true;
  }

  private respawnAllWorldBosses(): void {
    if (this.mode !== 'world') return;
    let count = 0;
    for (const wb of WORLD_BOSS_SPAWNS) {
      this.worldBossTimers.delete(wb.id);
      const alreadyAlive = this.enemies.some((e) => e.worldBossId === wb.id && e.aiState !== 'dead');
      if (!alreadyAlive) {
        this.spawnWorldBoss(wb);
        count += 1;
      }
    }
    this.audio.playBossAppearSting();
    this.hud.showWorldToast(count > 0 ? `已重新召出 ${count} 尊九州野外首领！` : '九州野外首领皆在阵中！', true);
  }

  private startNewRun(jumpToBoss: boolean, stageId = 1, keepBlessings = false, skipDialogue = false): void {
    this.audio.unlock();
    this.input.resetState();
    this.setShopPreview(false);
    if (this.titlePortraitLight) this.titlePortraitLight.visible = false;
    this.worldAutoNav = false;
    this.worldAutoCombatActive = false;
    this.worldAutoResumeTimer = 0;
    this.worldInCombat = false;
    this.worldCombatCooldown = 0;
    this.worldAutoNavPausedByCombat = false;
    this.clearCombatEntities();
    this.activeDungeon = null;
    this.activeTowerFloor = null;
    this.roguelikeState = null;
    this.resetEndgameStageState();
    this.stageDroppedGear = [];
    if (!keepBlessings) {
      this.blessings = createEmptyBlessings();
      this.activeMealBuff = { hpBonus: 0, dmgBonus: 0, speedBonus: 0, ultBonus: 0 };
    }
    const meal = this.saveStore.consumeActiveMeal();
    if (meal) {
      this.activeMealBuff = {
        hpBonus: meal.hpBonus,
        dmgBonus: meal.dmgBonus,
        speedBonus: meal.speedBonus,
        ultBonus: meal.ultBonus,
      };
    }
    const targetStage = jumpToBoss ? CAMPAIGN_STAGES.length : clamp(Math.floor(stageId), 1, CAMPAIGN_STAGES.length);
    this.saveStore.setLastPlayed(targetStage);
    this.episodeChoiceBuff = { dmgBonus: 0, speedBonus: 0, hpBonus: 0, ultBonus: 0, extraGourd: 0 };
    this.resetHero(new THREE.Vector3(0, 0, jumpToBoss ? 7.2 : 8.8), Math.PI);
    this.applyCurrentLoadoutVisuals();
    this.hero.rig.setWeaponDrawn(true);
    this.runElapsed = 0;
    this.timeScale = 1;
    this.slowMoTimer = 0;
    this.coopDowned = false;
    this.pvpResultDecided = false;

    this.enterStage(targetStage, !jumpToBoss, true, jumpToBoss, !skipDialogue && !jumpToBoss);
    this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
    this.cameraRig.snapTo(this.hero.pos);
    this.hud.update(this.hero, this.getObjectiveLabel(), this.getActiveBoss(), this.peer, 'none', this.buildTacticalState());
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
    this.activeTowerFloor = null;
    this.roguelikeState = null;
    this.resetEndgameStageState();
    this.stageDroppedGear = [];
    this.blessings = createEmptyBlessings();
    this.activeMealBuff = { hpBonus: 0, dmgBonus: 0, speedBonus: 0, ultBonus: 0 };
    const meal = this.saveStore.consumeActiveMeal();
    if (meal) {
      this.activeMealBuff = {
        hpBonus: meal.hpBonus,
        dmgBonus: meal.dmgBonus,
        speedBonus: meal.speedBonus,
        ultBonus: meal.ultBonus,
      };
    }
    this.episodeChoiceBuff = { dmgBonus: 0, speedBonus: 0, hpBonus: 0, ultBonus: 0, extraGourd: 0 };
    this.resetHero(new THREE.Vector3(0, 0, 8.8), Math.PI);
    this.applyCurrentLoadoutVisuals();
    this.hero.rig.setWeaponDrawn(true);
    this.runElapsed = 0;
    this.timeScale = 1;
    this.slowMoTimer = 0;
    this.coopDowned = false;
    this.pvpResultDecided = false;

    this.enterStage(dungeon.stageDef.id, true, true, false, !skipDialogue);
    this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
    this.cameraRig.snapTo(this.hero.pos);
    this.hud.update(this.hero, this.getObjectiveLabel(), this.getActiveBoss(), this.peer, 'none', this.buildTacticalState());
  }

  startTowerFloor(floorNum: number): void {
    this.mp.leave();
    this.clearPeerHero();
    this.hud.setMpHudBadge('');
    this.hud.setHeroName('李逍遥');
    const floor = getTowerFloorDef(floorNum);
    this.audio.unlock();
    this.clearCombatEntities();
    this.activeDungeon = null;
    this.roguelikeState = null;
    this.activeTowerFloor = floor;
    this.resetEndgameStageState();
    this.stageDroppedGear = [];
    this.blessings = createEmptyBlessings();
    this.activeMealBuff = { hpBonus: 0, dmgBonus: 0, speedBonus: 0, ultBonus: 0 };
    const meal = this.saveStore.consumeActiveMeal();
    if (meal) {
      this.activeMealBuff = {
        hpBonus: meal.hpBonus,
        dmgBonus: meal.dmgBonus,
        speedBonus: meal.speedBonus,
        ultBonus: meal.ultBonus,
      };
    }
    this.episodeChoiceBuff = { dmgBonus: 0, speedBonus: 0, hpBonus: 0, ultBonus: 0, extraGourd: 0 };
    this.resetHero(new THREE.Vector3(0, 0, 8.6), Math.PI);
    this.applyCurrentLoadoutVisuals();
    this.hero.rig.setWeaponDrawn(true);
    this.runElapsed = 0;
    this.timeScale = 1;
    this.slowMoTimer = 0;
    this.coopDowned = false;
    this.pvpResultDecided = false;

    this.enterStage(floor.stageDef.id, true, true, false, false);
    const affix = LEYLINE_AFFIX_MAP[floor.stageDef.leylineAffix ?? 'none'];
    this.hud.showStageBanner(`锁妖九重塔 · 第 ${floor.id} 层`, `${floor.name} · ${affix.name}`, 2.6);
    this.showStorySubtitle(floor.stageDef.introLine, 3.0);
    this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
    this.cameraRig.snapTo(this.hero.pos);
    this.hud.update(this.hero, this.getObjectiveLabel(), this.getActiveBoss(), this.peer, 'none', this.buildTacticalState());
  }

  startRoguelikeRun(): void {
    this.mp.leave();
    this.clearPeerHero();
    this.hud.setMpHudBadge('');
    this.hud.setHeroName('李逍遥');
    this.audio.unlock();
    this.clearCombatEntities();
    this.activeDungeon = null;
    this.activeTowerFloor = null;
    this.roguelikeState = { active: true, chamberIdx: 0, greedNext: false, totalJade: 0 };
    this.resetEndgameStageState();
    this.stageDroppedGear = [];
    this.blessings = createEmptyBlessings();
    this.activeMealBuff = { hpBonus: 0, dmgBonus: 0, speedBonus: 0, ultBonus: 0 };
    this.episodeChoiceBuff = { dmgBonus: 0, speedBonus: 0, hpBonus: 0, ultBonus: 0, extraGourd: 0 };
    this.resetHero(new THREE.Vector3(0, 0, 8.6), Math.PI);
    this.applyCurrentLoadoutVisuals();
    this.hero.rig.setWeaponDrawn(true);
    this.runElapsed = 0;
    this.timeScale = 1;
    this.slowMoTimer = 0;
    this.coopDowned = false;
    this.pvpResultDecided = false;

    const ch = ROGUELIKE_CHAMBERS[0];
    this.enterStage(ch.stageDef.id, true, true, false, false);
    this.hud.showStageBanner('幻境肉鸽 · 六境远征', ch.title, 2.6);
    this.showStorySubtitle(ch.stageDef.introLine, 3.0);
    this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
    this.cameraRig.snapTo(this.hero.pos);
    this.hud.update(this.hero, this.getObjectiveLabel(), this.getActiveBoss(), this.peer, 'none', this.buildTacticalState());
  }

  advanceRoguelikeChamber(selectedBlessingId?: string, greedPact = false): void {
    if (!this.roguelikeState?.active) return;
    if (selectedBlessingId) {
      const b =
        ROGUELIKE_BLESSINGS.find((x) => x.id === selectedBlessingId) ??
        BLESSINGS.find((x) => x.id === selectedBlessingId);
      if (b) {
        this.blessings = applyBlessingToRun(this.blessings, b);
      }
    }
    this.roguelikeState.chamberIdx = Math.min(ROGUELIKE_CHAMBERS.length - 1, this.roguelikeState.chamberIdx + 1);
    this.roguelikeState.greedNext = greedPact;

    const prevHpRatio = clamp(this.hero.hp / Math.max(1, this.hero.maxHp), 0.1, 1);
    const prevUlt = this.hero.ult;
    const prevGourds = this.hero.gourds;
    this.clearCombatEntities();
    this.resetEndgameStageState();
    this.stageDroppedGear = [];
    this.resetHero(new THREE.Vector3(0, 0, 8.6), Math.PI);
    this.syncLiveHeroCapsFromLoadout();
    this.hero.hp = Math.min(this.hero.maxHp, Math.round(this.hero.maxHp * Math.min(1, prevHpRatio + 0.35)));
    this.hero.delayedHp = this.hero.hp;
    this.hero.ult = prevUlt;
    this.hero.gourds = Math.max(1, Math.min(this.hero.maxGourds, prevGourds + 1));
    this.applyCurrentLoadoutVisuals();
    this.hero.rig.setWeaponDrawn(true);
    this.runElapsed = 0;

    const ch = ROGUELIKE_CHAMBERS[this.roguelikeState.chamberIdx];
    this.enterStage(ch.stageDef.id, true, true, false, false);
    this.hud.showStageBanner(`幻境肉鸽 · 第 ${ch.chamber}/6 境`, ch.title + (greedPact ? '【贪狼赌契】' : ''), 2.6);
    this.showStorySubtitle(ch.stageDef.introLine, 3.0);
    this.cameraRig.snapTo(this.hero.pos);
    this.hud.update(this.hero, this.getObjectiveLabel(), this.getActiveBoss(), this.peer, 'none', this.buildTacticalState());
  }

  confirmStageDialogue(choiceId?: string): boolean {
    if (this.mode !== 'dialogue') return false;
    this.audio.unlock();
    this.audio.playDropChime('spirit');

    const dlg = this.activeDialogueDef;
    const context = this.dialogueContext;
    this.activeDialogueDef = null;
    this.dialogueContext = 'preStage';
    this.campDialogueFocusPos = null;

    if (context === 'replay') {
      this.enterTitleMode();
      this.hud.openStoryCodex();
      return true;
    }

    if (context === 'epilogue') {
      const opts = this.pendingEpilogueResultOpts ?? this.lastEpilogueResultOpts;
      this.pendingEpilogueResultOpts = null;
      this.mode = 'victory';
      this.hud.clearSubtitle();
      this.hud.setMode('victory');
      this.audio.playHeroVoice('victory');
      if (opts) {
        this.hud.showResult(true, this.runElapsed, this.hero, opts);
      }
      return true;
    }

    if (context === 'campNpc') {
      const chosenId = choiceId ?? dlg?.choices[0]?.id;
      this.mode = 'camp';
      this.hud.setMode('camp');
      if (chosenId === 'camp_wine_cultivate') {
        this.hud.setCampTab('cultivate');
        this.hero.hp = this.hero.maxHp;
        this.hero.delayedHp = this.hero.maxHp;
        this.hero.spirit = this.hero.maxSpirit;
        this.vfx.spawnHealVortex(this.hero.pos);
        this.showStorySubtitle('酒剑仙：「凝神吐纳，气沉丹田——破境之时就在眼前！」', 2.8);
        this.hud.showCampToast('师尊护法：已切至「吐纳修炼」并回满气血真气', true);
      } else if (chosenId === 'camp_wine_drink') {
        this.hud.setCampTab('meal');
        this.hero.state = 'drink';
        this.hero.stateTime = 0;
        this.hero.stateDuration = 0.68;
        this.hero.attackVfxFired = false;
        this.triggerHeroVoice('heal', true);
        this.hud.showCampToast('师徒对饮：已切至「篝火煮酒」，可择仙酿温养下战', true);
      } else if (chosenId === 'camp_ally_depart') {
        const targetStage = dlg && dlg.stageId > 0 ? dlg.stageId : this.saveStore.getRecommendedStage();
        this.mp.leave();
        this.clearPeerHero();
        this.hud.setMpHudBadge('');
        this.hud.setHeroName('李逍遥');
        this.blessings = createEmptyBlessings();
        this.startNewRun(false, targetStage, false, false);
        return true;
      } else if (chosenId === 'camp_ally_spar') {
        this.hero.spirit = this.hero.maxSpirit;
        this.hero.ult = 100;
        this.hero.cdQ = 0;
        this.hero.cdE = 0;
        this.hero.cdR = 0;
        this.vfx.spawnShockRing(this.hero.pos, new THREE.Color(0.55, 2.2, 2.3), 0.35, 2.6, 0.45);
        this.showStorySubtitle(
          this.hud.isMobileUi()
            ? '玄影：「真气剑意已满！先拿木人桩试试御剑追影与三印万剑归宗！」'
            : '玄影：「真气剑意已满！先拿木人桩试试 Q 追影与三印万剑归宗！」',
          3.0,
        );
        this.hud.showCampToast('同门演武：真气与剑意已满，可随时试剑', true);
      }
      this.hud.update(this.hero, '云来剑庐 · 自由演武', null, null, 'none', this.buildTacticalState());
      return true;
    }

    const stageDef = this.getActiveStageDef();
    const chDef = getChapterDef(stageDef.chapter);
    const chosenIdx = dlg ? dlg.choices.findIndex((c) => c.id === choiceId) : -1;
    const chosen = dlg ? (chosenIdx >= 0 ? dlg.choices[chosenIdx] : dlg.choices[0]) : undefined;
    if (chosen) {
      this.episodeChoiceBuff = {
        dmgBonus: chosen.dmgBonus ?? 0,
        speedBonus: chosen.speedBonus ?? 0,
        hpBonus: chosen.hpBonus ?? 0,
        ultBonus: chosen.ultBonus ?? 0,
        extraGourd: chosen.extraGourd ?? 0,
      };
      this.saveStore.recordStoryChoice(
        stageDef.id,
        chosen.id,
        chosen.alignment ?? (chosenIdx === 1 ? 'heart' : 'sword'),
      );
      this.syncLiveHeroCapsFromLoadout();
      if (this.episodeChoiceBuff.ultBonus > 0) {
        this.hero.ult = clamp(this.hero.ult + this.episodeChoiceBuff.ultBonus, 0, 100);
      }
      this.spawnWorldCallout(chosen.title, this.hero.pos, 'parry');
      this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
      this.hud.update(this.hero, this.getObjectiveLabel(), this.getActiveBoss(), this.peer, 'none', this.buildTacticalState());
    }

    const boss = this.getActiveBoss();
    if (this.pendingCutsceneAfterDialogue && boss) {
      this.pendingCutsceneAfterDialogue = false;
      this.mode = 'cutscene';
      this.hud.setMode('cutscene');
      this.audio.setDucked(true);
      this.audio.playBossAppearSting();
      this.hud.showStageBanner('首 领 降 临', boss.name, 2.6);
      this.showStorySubtitle(getBossCutsceneTaunt(stageDef.id, boss.name), 3.4);
      this.cameraRig.startCutscene(boss.pos, 2.55);
    } else {
      this.mode = 'playing';
      this.hud.setMode('playing');
      const kicker = this.activeDungeon
        ? `秘境外传 · ${this.activeDungeon.name}`
        : `${chDef.roman} 第 ${stageDef.episodeNum} 集 · ${BIOME_LABELS[stageDef.biome] ?? chDef.name}`;
      this.hud.showStageBanner(kicker, `${stageDef.name} · ${stageDef.subtitle}`, 2.6);
      this.showStorySubtitle(chosen?.battleCallout ?? stageDef.introLine, 2.8);
    }
    return true;
  }

  private startMultiplayerMatch(mode: 'coop' | 'solo', stageId: number, peerName: string): void {
    this.audio.unlock();
    this.setMountMode('none', true);
    this.worldMobTimers.clear();
    this.worldBossTimers.clear();
    this.activeWorldInteract = null;
    this.clearCombatEntities();
    this.setCampNpcsVisible(false);
    this.clearPeerHero();
    this.activeDungeon = null;
    this.activeTowerFloor = null;
    this.roguelikeState = null;
    this.resetEndgameStageState();
    this.stageDroppedGear = [];
    this.blessings = createEmptyBlessings();
    this.activeMealBuff = { hpBonus: 0, dmgBonus: 0, speedBonus: 0, ultBonus: 0 };
    this.episodeChoiceBuff = { dmgBonus: 0, speedBonus: 0, hpBonus: 0, ultBonus: 0, extraGourd: 0 };
    this.activeDialogueDef = null;
    this.healingShrineCollected = false;
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
      this.corridorMode = false;
      this.arena.setArenaLayout('arena', 0);
      this.currentStageId = 20;
      this.stagePhase = 'combat';
      const ch = getChapterDef(4);
      this.arena.setStageTheme(20, ch);
      this.arena.setBiome('celestial_sanctum');
      this.arena.setHealingShrineUsed(false);
      this.applyBiomeAtmosphere('celestial_sanctum', ch);
      this.mode = 'playing';
      this.hud.setMode('playing');
      this.audio.setMood('boss1');
      this.vfx.spawnBaguaArray({
        pos: new THREE.Vector3(0, 0.08, 0),
        radius: 6.2,
        color: new THREE.Color(0.45, 1.9, 2.1),
        duration: 2.2,
      });
    } else {
      this.enterStage(clamp(Math.floor(stageId), 1, CAMPAIGN_STAGES.length), false, isHost);
    }
    this.cameraRig.snapTo(this.hero.pos);
    this.hud.update(this.hero, this.getObjectiveLabel(), this.getActiveBoss(), this.peer, 'none', this.buildTacticalState());
  }

  private clearPeerHero(): void {
    if (this.peer) {
      this.scene.remove(this.peer.rig.root);
      this.peer = null;
    }
  }

  private getZoneForWave(stageDef: StageDef, waveIdx: number): 0 | 1 | 2 {
    if (!this.corridorMode) return 0;
    const total = stageDef.waves.length;
    if (total <= 1) return 0;
    if (total === 2) return waveIdx === 0 ? 0 : 1;
    if (waveIdx === 0) return 0;
    if (waveIdx >= total - 1) return 2;
    return 1;
  }

  private enterStage(
    stageId: number,
    withCutscene: boolean,
    spawnAuthority = true,
    jumpLastWave = false,
    showDialogue = false,
  ): void {
    this.setMountMode('none', true);
    this.worldGuideArrow.visible = false;
    this.worldAutoNav = false;
    this.worldMobTimers.clear();
    this.worldBossTimers.clear();
    this.activeWorldInteract = null;
    this.clearCombatEntities();
    this.setCampNpcsVisible(false);
    this.campDialogueFocusPos = null;
    this.dialogueContext = 'preStage';
    this.resetEndgameStageState();
    this.currentStageId = this.activeTowerFloor
      ? this.activeTowerFloor.stageDef.id
      : this.roguelikeState?.active
        ? this.getActiveStageDef().id
        : this.activeDungeon
          ? this.activeDungeon.stageDef.id
          : clamp(Math.floor(stageId), 1, CAMPAIGN_STAGES.length);
    const stageDef = this.getActiveStageDef();
    const chDef = getChapterDef(stageDef.chapter);
    this.currentWaveIdx = jumpLastWave ? stageDef.waves.length - 1 : 0;
    this.stagePhase = 'combat';
    this.stageTimer = 0;
    this.hazardTimer = stageDef.hazardIntervalSec ? stageDef.hazardIntervalSec * 0.75 : 0;
    this.pendingCutsceneAfterDialogue = false;
    this.healingShrineCollected = false;
    this.activeDialogueDef = null;
    this.episodeChoiceBuff = { dmgBonus: 0, speedBonus: 0, hpBonus: 0, ultBonus: 0, extraGourd: 0 };

    const isDefend = stageDef.stageMode === 'defend' && this.mp.mode === 'offline';
    const isCorridor = !isDefend && this.mp.mode !== 'solo';
    const customArenaLayout = this.mp.mode === 'offline' ? stageDef.stageLayout : undefined;
    const maxZone: 0 | 1 | 2 = stageDef.waves.length >= 3 ? 2 : 1;
    if (isDefend && (!customArenaLayout || customArenaLayout === 'corridor')) {
      this.corridorMode = false;
      this.arena.setArenaLayout('pillars', 0);
    } else if (customArenaLayout && customArenaLayout !== 'corridor') {
      this.corridorMode = false;
      this.arena.setArenaLayout(customArenaLayout, 0);
    } else {
      this.corridorMode = isCorridor;
      this.arena.setArenaLayout(isCorridor ? 'corridor' : 'arena', maxZone);
    }
    if (isDefend) {
      this.monolithMaxHp = stageDef.monolithHp ?? 620;
      this.monolithHp = this.monolithMaxHp;
      this.arena.setMonolithVisible(true);
      this.arena.setMonolithHealthRatio(1);
    }
    if (stageDef.stageMode === 'survive' && this.mp.mode === 'offline') {
      this.surviveRemainSec = stageDef.surviveSec ?? 45;
      this.surviveSpawnTimer = 6.5;
    }
    if (
      this.mp.mode === 'offline' &&
      (stageDef.stageMode === 'survive' || Boolean(this.activeTowerFloor) || Boolean(this.roguelikeState?.active))
    ) {
      this.leylineZoneTimer = 4.0;
    }
    const startZone = this.getZoneForWave(stageDef, this.currentWaveIdx);
    this.arena.setUnlockedZone(startZone);
    if (jumpLastWave && isCorridor && startZone > 0) {
      const zCenter = this.arena.getZoneCenterZ(startZone);
      this.hero.pos.set(0, 0, zCenter + 7.2);
      this.hero.rig.root.position.copy(this.hero.pos);
    }

    this.arena.setStageTheme(this.activeDungeon ? stageDef.chapter * 5 : this.currentStageId, chDef);
    this.arena.setBiome(stageDef.biome);
    this.arena.setHealingShrineUsed(false);
    this.applyBiomeAtmosphere(stageDef.biome, chDef);

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
        this.activeDialogueDef = dlg;
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

    const zoneIdx = this.getZoneForWave(stageDef, waveIdx);
    const zoneCenterZ = this.corridorMode ? this.arena.getZoneCenterZ(zoneIdx) : 0;
    if (this.corridorMode && this.arena.getUnlockedZone() < zoneIdx) {
      this.arena.setUnlockedZone(zoneIdx);
    }

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
        bossArchetype: spec.bossArchetype,
      };
      const e = this.spawnEnemy(spec.kind, spec.x, spec.z + zoneCenterZ, undefined, overrides);
      if (spec.kind === 'boss') bossEntity = e;
    }

    const isFinalBossWave = waveIdx === stageDef.waves.length - 1 && stageDef.bossCutscene && bossEntity;
    if (isFinalBossWave && bossEntity) {
      if (!this.corridorMode && this.hero.pos.z < 4.5) {
        this.hero.pos.set(0, 0, 8.2);
        this.hero.rig.root.position.copy(this.hero.pos);
        this.hero.yaw = Math.PI;
        this.hero.rig.root.rotation.y = this.hero.yaw;
      }

      const ringZ = zoneCenterZ - 4.5;
      this.vfx.spawnBaguaArray({
        pos: new THREE.Vector3(0, 0.08, ringZ),
        radius: 5.4,
        color: new THREE.Color(1.4, 0.25, 0.45),
        duration: 2.5,
      });
      this.vfx.spawnShockRing(new THREE.Vector3(0, 0.1, ringZ), new THREE.Color(2.0, 0.35, 0.55), 0.6, 8.5, 0.7);
      this.vfx.spawnGroundCrater(new THREE.Vector3(0, 0, ringZ), 4.2, new THREE.Color(1.9, 0.28, 0.48), 4.5);
      this.cameraRig.addShake(0.65);

      if (allowCutscene) {
        this.mode = 'cutscene';
        this.hud.setMode('cutscene');
        this.audio.setDucked(true);
        this.audio.playBossAppearSting();
        this.hud.showStageBanner('首 领 降 临', bossEntity.name, 2.6);
        this.showStorySubtitle(getBossCutsceneTaunt(stageDef.id, bossEntity.name), 3.4);
        this.cameraRig.startCutscene(bossEntity.pos, 2.55);
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
      if (allowCutscene) {
        const waveLine = EPISODE_STORY_SCRIPTS[stageDef.id]?.waveCallouts?.[waveIdx];
        if (waveLine) {
          this.showStorySubtitle(waveLine, 3.4);
        } else if (wave.subtitle) {
          this.showStorySubtitle(wave.subtitle, 3.2);
        } else if (waveIdx > 0) {
          this.showStorySubtitle(`【${wave.label}】妖众增援杀至！`, 2.4);
        }
      }
    }
  }

  private resetHero(pos: THREE.Vector3, yaw: number): void {
    const realm = getSwordRealm(this.saveStore.getTotalStars());
    const loadout = this.getLoadoutStats();
    const cultivation = this.saveStore.getCultivationBonus();
    const elixir = this.saveStore.getElixirBonus();
    const h = this.hero;
    h.maxHp =
      180 +
      realm.hpBonus +
      loadout.maxHpBonus +
      this.blessings.maxHpBonus +
      cultivation.hpBonus +
      elixir.hpBonus +
      this.saveStore.getWorldOrbHpBonus() +
      this.activeMealBuff.hpBonus +
      this.episodeChoiceBuff.hpBonus;
    h.maxGourds = 2 + loadout.gourdBonus + this.blessings.extraGourds + this.episodeChoiceBuff.extraGourd;
    h.pos.copy(pos);
    h.vel.set(0, 0, 0);
    h.yaw = yaw;
    h.hp = h.maxHp;
    h.delayedHp = h.maxHp;
    h.spirit = 85;
    h.stamina = h.maxStamina;
    h.ult = clamp(35 + cultivation.startUltBonus + this.activeMealBuff.ultBonus + this.episodeChoiceBuff.ultBonus, 0, 100);
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
    h.q2ReadyTimer = 0;
    h.q2TargetId = null;
    h.dodgeEmpowered = false;
    h.dodgeEmpowerTimer = 0;
    h.comboSigils = [];
    h.comboSigilTimer = 0;
    h.comboUltReady = false;
    h.comboUltTimer = 0;
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
    this.q2AttackActive = false;
    this.q2DashTargetId = null;
    this.waterRippleTimer = 0;
    h.rig.root.position.copy(pos);
    h.rig.root.rotation.set(0, yaw, 0);
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
    let finalOverrides = overrides ? { ...overrides } : {};
    if (this.mode !== 'world' && this.mode !== 'camp' && this.mp.mode === 'offline' && !forcedId) {
      const diff = getDifficultyTier(this.saveStore.getSelectedDifficulty());
      const greedHp = this.roguelikeState?.active && this.roguelikeState.greedNext ? 1.25 : 1.0;
      const greedDmg = this.roguelikeState?.active && this.roguelikeState.greedNext ? 1.15 : 1.0;
      const affix = this.getActiveLeylineAffix();
      const affixSpeed = affix === 'flying_surge' ? 1.15 : affix === 'rapid_cooldown' ? 1.18 : 1.0;
      const affixPoise = affix === 'titan_armor' ? 1.35 : 1.0;
      const affixDmg = affix === 'glass_cannon' ? 1.35 : 1.0;
      finalOverrides = {
        ...finalOverrides,
        hpMult: (finalOverrides.hpMult ?? 1) * diff.enemyHpMult * greedHp,
        dmgMult: (finalOverrides.dmgMult ?? 1) * diff.enemyDmgMult * greedDmg * affixDmg,
        poiseMult: (finalOverrides.poiseMult ?? 1) * affixPoise,
        speedMult: (finalOverrides.speedMult ?? 1) * affixSpeed,
      };
    }
    const enemy = createEnemy(id, kind, pos, this.rng, finalOverrides);
    enemy.yaw = Math.atan2(this.hero.pos.x - pos.x, this.hero.pos.z - pos.z);
    enemy.rig.root.rotation.y = enemy.yaw;
    this.scene.add(enemy.rig.root);
    this.enemies.push(enemy);
    return enemy;
  }

  private spawnPracticeDummy(x: number, z: number): EnemyEntity {
    const pos = new THREE.Vector3(x, 0, z);
    this.arena.constrainPosition(pos, 0.75);
    const id = this.nextEntityId++;
    const dummy = createPracticeDummy(id, pos, this.rng);
    dummy.yaw = Math.atan2(this.hero.pos.x - pos.x, this.hero.pos.z - pos.z);
    dummy.rig.root.rotation.y = dummy.yaw;
    this.scene.add(dummy.rig.root);
    this.enemies.push(dummy);
    return dummy;
  }

  private getActiveBoss(): EnemyEntity | null {
    return (
      this.enemies.find((e) => e.kind === 'boss' && e.aiState !== 'dead') ??
      this.enemies.find((e) => e.kind === 'elite' && e.aiState !== 'dead') ??
      this.enemies.find((e) => e.kind === 'boss') ??
      null
    );
  }

  private findNearestBossInRange(maxDist: number): EnemyEntity | null {
    let best: EnemyEntity | null = null;
    let bestDist = maxDist;
    for (const e of this.enemies) {
      if (e.kind !== 'boss' || e.aiState === 'dead') continue;
      const d = Math.hypot(e.pos.x - this.hero.pos.x, e.pos.z - this.hero.pos.z);
      if (d <= bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  private getObjectiveLabel(): string {
    if (this.mode === 'world') {
      const reg = getWorldRegionAt(this.hero.pos.x, this.hero.pos.z);
      return `九州仙域 · ${reg.name}`;
    }
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
    if (stageDef.stageMode === 'defend' && this.monolithMaxHp > 0) {
      const mPct = Math.round(clamp(this.monolithHp / this.monolithMaxHp, 0, 1) * 100);
      const alive = this.enemies.filter((e) => e.aiState !== 'dead').length;
      return `守护灵脉 ${mPct}% · 波次 ${this.currentWaveIdx + 1}/${stageDef.waves.length} · 剩 ${alive}`;
    }
    if (stageDef.stageMode === 'survive') {
      const sec = Math.max(0, Math.ceil(this.surviveRemainSec));
      return `坚守限时 ${sec}s · 已清 ${this.enemies.filter((e) => e.aiState === 'dead').length} 敌`;
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

    if (this.shopPreviewActive) {
      if (this.shopPreviewAutoSpin) {
        this.shopPreviewYaw += animDt * 0.72;
        this.shopPreviewYawVel = 0;
      } else if (Math.abs(this.shopPreviewYawVel) > 0.002) {
        this.shopPreviewYaw += this.shopPreviewYawVel * animDt;
        this.shopPreviewYawVel *= Math.exp(-5.5 * animDt);
        if (Math.abs(this.shopPreviewYawVel) < 0.002) this.shopPreviewYawVel = 0;
      }
      this.shopPreviewZoom = damp(this.shopPreviewZoom, this.shopPreviewZoomTarget, 9.5, Math.max(0.001, rawDt));

      if (this.shopTryOnTimer > 0) {
        this.shopTryOnTimer = Math.max(0, this.shopTryOnTimer - animDt);
        const p = clamp(1 - this.shopTryOnTimer / this.shopTryOnDuration, 0, 1);
        this.hero.rig.applyPose('showcaseFlourish', p, this.elapsed, animDt, 0);
      } else {
        const equippedWpn = this.saveStore.getEquipped().weapon;
        this.hero.rig.applyPose(
          this.shopPreviewWeaponId && this.shopPreviewWeaponId !== equippedWpn ? 'combatIdle' : 'idle',
          0,
          this.elapsed,
          animDt,
          0,
        );
      }

      // Subtle ambient pedestal particles matching the previewed skin's theme color
      this.shopAmbientSparkTimer -= animDt;
      if (this.shopAmbientSparkTimer <= 0) {
        this.shopAmbientSparkTimer = 0.44;
        const meta = this.getSkinThemeMeta(this.shopPreviewSkinId ?? 'skin_xiaoyao');
        const ang = this.rng() * Math.PI * 2;
        const rad = 0.55 + this.rng() * 0.52;
        const sparkPos = new THREE.Vector3(
          this.hero.pos.x + Math.cos(ang) * rad,
          this.hero.pos.y + 0.12 + this.rng() * 0.35,
          this.hero.pos.z + Math.sin(ang) * rad,
        );
        this.vfx.spawnHitSparks(
          sparkPos,
          new THREE.Vector3(0, 1.0, 0),
          new THREE.Color(meta.rgb[0] * 0.85, meta.rgb[1] * 0.85, meta.rgb[2] * 0.85),
          2,
          this.rng,
        );
      }

      this.vfx.update(animDt, this.elapsed, this.hero.pos, undefined, undefined, this.camera.position);
      this.arena.update(animDt, this.elapsed, this.hero.pos);
      const isPortrait = window.innerHeight > window.innerWidth;
      const leftPanelRatio = window.innerWidth <= 960 || isPortrait ? 0.44 : undefined;
      this.cameraRig.updateShopPreview(
        this.hero.pos,
        this.hero.yaw,
        this.shopPreviewYaw,
        isPortrait,
        leftPanelRatio,
        this.shopPreviewPitch,
        this.shopPreviewZoom,
      );
      this.updateShopStudioStage(animDt);
      this.syncMoonKeyLightToHero();
      if (doRender) this.pipeline.render();
      this.input.endFrame();
      this.publishDiagnostics();
      return;
    }

    if (this.ancientMap.isOpen() && this.frame % 15 === 0) {
      this.ancientMap.update(this.buildAncientMapSnapshot());
    }

    if (this.mode === 'title') {
      this.hero.rig.applyPose('idle', 0, this.elapsed, animDt, 0);
      this.arena.update(animDt, this.elapsed, this.hero.pos);
      const isPortrait = window.innerHeight > window.innerWidth;
      this.cameraRig.updateTitleOrbit(this.hero.pos, this.elapsed, isPortrait);
      if (this.titlePortraitLight) {
        this.titlePortraitLight.visible = true;
      }
      this.audio.updateMusic(rawDt);
      if (doRender) this.pipeline.render();
      this.input.endFrame();
      this.publishDiagnostics();
      return;
    }

    if (this.titlePortraitLight?.visible) {
      this.titlePortraitLight.visible = false;
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
      if (this.dialogueContext === 'campNpc') {
        const focus = this.campDialogueFocusPos;
        if (focus) {
          this.hero.yaw = Math.atan2(focus.x - this.hero.pos.x, focus.z - this.hero.pos.z);
          this.hero.rig.root.rotation.y = this.hero.yaw;
        }
        this.hero.rig.applyPose('idle', 0, this.elapsed, animDt, 0);
        this.updateCampNpcs(animDt);
        this.targetRingMesh.visible = false;
        this.arena.update(animDt, this.elapsed, this.hero.pos);
        this.cameraRig.updateGameplay(rawDt, this.elapsed, this.hero.pos, focus, { x: 0, y: 0 });
        this.audio.updateMusic(rawDt);
        if (doRender) this.pipeline.render();
        this.input.endFrame();
        this.publishDiagnostics();
        return;
      }
      const lead =
        this.enemies.find((e) => e.kind === 'boss' && e.aiState !== 'dead') ??
        this.enemies.find((e) => e.kind === 'elite' && e.aiState !== 'dead') ??
        this.enemies.find((e) => e.aiState !== 'dead') ??
        null;
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
      this.vfx.update(dt, this.elapsed, this.hero.pos, undefined, undefined, this.camera.position);
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

      if (
        this.arena.getLayout() === 'islands' &&
        this.hero.state !== 'dead'
      ) {
        const cCount = this.arena.getIslandCrystalCount();
        for (let ci = 0; ci < cCount; ci++) {
          if (this.arena.isCrystalUsed(ci)) continue;
          const cPos = this.arena.getCrystalPos(ci);
          if (Math.hypot(this.hero.pos.x - cPos.x, this.hero.pos.z - cPos.z) <= 2.4) {
            this.arena.setCrystalUsed(ci, true);
            const healHp = Math.round(this.hero.maxHp * 0.25);
            this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + healHp);
            this.hero.delayedHp = Math.max(this.hero.delayedHp, this.hero.hp);
            this.hero.spirit = Math.min(this.hero.maxSpirit, this.hero.spirit + 45);
            this.hero.ult = Math.min(100, this.hero.ult + 25);
            this.audio.playDropChime('spirit');
            this.vfx.spawnHealVortex(this.hero.pos);
            this.vfx.spawnShockRing(cPos, new THREE.Color(0.45, 2.25, 2.15), 0.35, 3.0, 0.45);
            this.spawnWorldCallout('灵晶共鸣 +真气剑意!', this.hero.pos, 'info');
            triggerHaptic('medium');
          }
        }
      }

      if (
        this.corridorMode &&
        this.arena.getMaxZone() >= 1 &&
        !this.healingShrineCollected &&
        this.hero.state !== 'dead'
      ) {
        const shrinePos = this.arena.getHealingShrinePos();
        if (Math.hypot(this.hero.pos.x - shrinePos.x, this.hero.pos.z - shrinePos.z) <= 2.4) {
          this.healingShrineCollected = true;
          this.arena.setHealingShrineUsed(true);
          const healHp = Math.round(this.hero.maxHp * 0.35);
          this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + healHp);
          this.hero.delayedHp = Math.max(this.hero.delayedHp, this.hero.hp);
          this.hero.spirit = Math.min(this.hero.maxSpirit, this.hero.spirit + 40);
          this.audio.playHeal();
          this.vfx.spawnHealVortex(this.hero.pos);
          this.vfx.spawnShockRing(shrinePos, new THREE.Color(0.45, 2.1, 1.35), 0.35, 2.8, 0.48);
          this.spawnWorldCallout('仙灵清泉 +气血真气!', this.hero.pos, 'heal');
          this.showStorySubtitle('李逍遥：「好一泓蜀山灵泉！剑气澄明，伤势尽复！」', 2.6);
          triggerHaptic('medium');
        }
      }

      this.vfx.update(
        dt,
        this.elapsed,
        this.hero.pos,
        (kind, gearItem) => this.onCollectDrop(kind, gearItem),
        (kind) => {
          if (kind !== 'gear') this.audio.playDropChime(kind);
        },
        this.camera.position,
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
      this.syncMoonKeyLightToHero();
      this.arena.updateOcclusion(this.camera.position, this.hero.pos, rawDt);
      const threat = this.updateTargetRingAndThreat(rawDt);
      this.hud.update(this.hero, this.getObjectiveLabel(), boss, this.peer, threat, this.buildTacticalState());
    } else if (this.mode === 'world') {
      this.runElapsed += dt;
      this.updateHero(dt, rawDt);
      this.updateEnemies(dt);
      this.updateStageHazards(dt);
      this.updateProjectiles(dt);
      this.resolveEntitySeparation();
      this.updateOpenWorld(dt);

      this.vfx.update(
        dt,
        this.elapsed,
        this.hero.pos,
        (kind, gearItem) => this.onCollectDrop(kind, gearItem),
        (kind) => {
          if (kind !== 'gear') this.audio.playDropChime(kind);
        },
        this.camera.position,
      );
      this.arena.update(dt, this.elapsed, this.hero.pos);
      const boss = this.findNearestBossInRange(22);
      this.cameraRig.updateGameplay(rawDt, this.elapsed, this.hero.pos, boss?.pos ?? null, this.input.mouseNdc);
      this.syncMoonKeyLightToHero();
      this.arena.updateOcclusion(this.camera.position, this.hero.pos, rawDt);
      const threat = this.updateTargetRingAndThreat(rawDt);
      this.hud.update(this.hero, this.getObjectiveLabel(), boss, null, threat, this.buildTacticalState());
    } else if (this.mode === 'camp') {
      this.updateHero(dt, rawDt);
      this.updateCampDummy(dt);
      this.updateCampNpcs(dt);
      this.updateProjectiles(dt);
      this.resolveEntitySeparation();

      this.vfx.update(dt, this.elapsed, this.hero.pos, undefined, undefined, this.camera.position);
      this.arena.update(dt, this.elapsed, this.hero.pos);
      this.cameraRig.updateGameplay(rawDt, this.elapsed, this.hero.pos, null, this.input.mouseNdc);
      this.syncMoonKeyLightToHero();
      this.arena.updateOcclusion(this.camera.position, this.hero.pos, rawDt);
      const threat = this.updateTargetRingAndThreat(rawDt);
      this.hud.update(this.hero, '云来剑庐 · 自由演武', null, null, threat, this.buildTacticalState());
    } else {
      this.targetRingMesh.visible = false;
      this.updatePeerHero(dt * 0.5);
      this.vfx.update(dt * 0.5, this.elapsed, this.hero.pos, undefined, undefined, this.camera.position);
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

    h.q2ReadyTimer = Math.max(0, h.q2ReadyTimer - dt);
    if (h.q2ReadyTimer <= 0) h.q2TargetId = null;

    if (h.dodgeEmpowerTimer > 0) {
      h.dodgeEmpowerTimer = Math.max(0, h.dodgeEmpowerTimer - dt);
      if (h.dodgeEmpowerTimer <= 0) h.dodgeEmpowered = false;
    }

    if (h.comboUltReady) {
      h.comboUltTimer = Math.max(0, h.comboUltTimer - dt);
      if (h.comboUltTimer <= 0) {
        h.comboUltReady = false;
        h.comboUltTimer = 0;
        h.comboSigils = [];
        h.comboSigilTimer = 0;
      }
    } else if (h.comboSigilTimer > 0) {
      h.comboSigilTimer = Math.max(0, h.comboSigilTimer - dt);
      if (h.comboSigilTimer <= 0) {
        h.comboSigils = [];
      }
    }

    if (h.comboDecayTimer > 0) {
      h.comboDecayTimer -= dt;
      if (h.comboDecayTimer <= 0) h.comboCount = 0;
    }

    this.lotusProcCooldown = Math.max(0, this.lotusProcCooldown - dt);
    if (this.combatStyleDecayTimer > 0) {
      this.combatStyleDecayTimer -= dt;
    } else if (this.combatStyleScore > 0) {
      this.combatStyleScore = Math.max(0, this.combatStyleScore - dt * 5.5);
    }

    // Periodic Tactical Leyline Zone (survive / Tower / Roguelike)
    if (this.mode === 'playing' && this.mp.mode === 'offline' && this.leylineZoneTimer > 0) {
      this.leylineZoneTimer -= dt;
      if (this.leylineZoneTimer <= 0) {
        if (!this.leylineZoneActive) {
          this.leylineZoneActive = true;
          this.leylineZoneTimer = 11.0;
          const ang = this.rng() * Math.PI * 2;
          const rad = 3.5 + this.rng() * 5.0;
          this.leylineZonePos.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad - 2.0);
          this.arena.constrainPosition(this.leylineZonePos, 3.2);
          this.spawnWorldCallout('灵脉法阵降临!', this.leylineZonePos, 'info');
        } else {
          this.leylineZoneActive = false;
          this.leylineZoneTimer = 5.0;
          this.heroInLeylineZone = false;
          this.arena.setLeylineZone(false);
        }
      }
      if (this.leylineZoneActive) {
        this.heroInLeylineZone =
          Math.hypot(h.pos.x - this.leylineZonePos.x, h.pos.z - this.leylineZonePos.z) <= 3.35;
        this.arena.setLeylineZone(true, this.leylineZonePos.x, this.leylineZonePos.z, this.heroInLeylineZone);
      }
    } else if (this.leylineZoneActive) {
      this.leylineZoneActive = false;
      this.heroInLeylineZone = false;
      this.arena.setLeylineZone(false);
    }

    // Leyline Affix: Blood Pact gradual drain while combat is active
    if (
      this.mode === 'playing' &&
      this.stagePhase === 'combat' &&
      this.getActiveLeylineAffix() === 'blood_pact' &&
      h.state !== 'dead' &&
      this.enemies.some((e) => e.aiState !== 'dead') &&
      !this.godMode
    ) {
      h.hp = Math.max(1, h.hp - h.maxHp * 0.015 * dt);
    }

    const cultivation = this.saveStore.getCultivationBonus();
    const elixir = this.saveStore.getElixirBonus();
    const campRegenMult = this.mode === 'camp' ? 3.5 : 1.0;
    const leylineSpiritBonus = this.heroInLeylineZone ? 18 : 0;
    h.spirit = Math.min(
      h.maxSpirit,
      h.spirit +
        dt *
          (6.5 *
            realm.spiritRegenMult *
            loadout.spiritRegenMult *
            (1 + cultivation.spiritRegenPct + elixir.spiritRegenPct) *
            campRegenMult +
            leylineSpiritBonus),
    );
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

    const canDodgeNow =
      h.state !== 'hit' &&
      h.state !== 'skillR' &&
      h.state !== 'comboUlt' &&
      h.state !== 'parryCounter' &&
      h.stamina >= (this.mountMode !== 'none' ? 16 : 24);
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
      this.worldAutoNav = false;
      this.worldAutoCombatActive = false;
      this.worldAutoResumeTimer = 0;
    } else if (this.input.lolMouseMode && (this.input.consumeRmbClick() || this.input.rmbHeld)) {
      this.worldAutoNav = false;
      this.worldAutoCombatActive = false;
      this.worldAutoResumeTimer = 0;
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

    const isQ2LateCancel = h.state === 'skillQ' && h.stateTime >= 0.2 && h.q2ReadyTimer > 0;
    if (isQ2LateCancel && this.input.consumeAction('skillQ')) {
      this.rmbMoveTarget = null;
      this.startSkillQ2();
      return;
    }

    if (isFree || isAttackCancelable) {
      if (h.comboUltReady && this.input.consumeAction('skillR')) {
        this.rmbMoveTarget = null;
        this.startComboUlt();
        return;
      }
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
      if (h.q2ReadyTimer > 0 && this.input.consumeAction('skillQ')) {
        this.rmbMoveTarget = null;
        this.startSkillQ2();
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
      if (this.mountMode !== 'none') this.setMountMode('none', true);
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
      const empowered = h.dodgeEmpowered || h.shadowStrikeTimer > 0;
      const nextStep = empowered ? 1 : h.comboWindowTimer > 0 && h.comboStep < 4 ? h.comboStep + 1 : 1;
      this.startHeroAttack(nextStep);
    }

    if (h.state === 'idle' || h.state === 'run') {
      if (this.mountDashTimer > 0) this.mountDashTimer = Math.max(0, this.mountDashTimer - dt);
      const mountMult = this.mountMode === 'sword' ? 1.88 : this.mountMode === 'horse' ? 1.58 : 1.0;
      const dashMult = this.mountMode !== 'none' && this.mountDashTimer > 0 ? 1.45 : 1.0;
      const speed =
        7.4 *
        mountMult *
        dashMult *
        this.blessings.speedMult *
        loadout.speedMult *
        (1 + this.activeMealBuff.speedBonus + this.episodeChoiceBuff.speedBonus);
      const moving = Math.hypot(this.moveVec.x, this.moveVec.z) > 0.05;
      const prevYaw = h.yaw;
      if (moving) {
        h.state = 'run';
        h.vel.set(this.moveVec.x * speed, 0, this.moveVec.z * speed);
        h.pos.addScaledVector(h.vel, dt);
        const targetYaw = Math.atan2(this.moveVec.x, this.moveVec.z);
        h.yaw = dampAngle(h.yaw, targetYaw, this.mountMode === 'none' ? 15 : 10, dt);
      } else {
        h.state = 'idle';
        h.vel.set(0, 0, 0);
      }
      this.arena.constrainPosition(h.pos, h.radius, prevPos);
      h.rig.root.rotation.y = h.yaw;
      if (this.mountMode !== 'none') {
        const turnRate = angleDiff(prevYaw, h.yaw) / Math.max(0.001, dt);
        this.mountRig.root.position.copy(h.pos);
        this.mountRig.root.rotation.y = h.yaw;
        const mPose = this.mountRig.update(dt, this.elapsed, h.vel.length(), turnRate);
        h.rig.root.position.set(h.pos.x, mPose.heroY, h.pos.z);
        h.rig.root.rotation.x = mPose.heroPitch;
        h.rig.setSwordGlow(this.mountMode === 'sword' ? 1.8 : 0.85);
        h.rig.applyPose(this.mountMode === 'sword' ? 'mountSword' : 'mountHorse', 0, this.elapsed, dt, h.vel.length());
        if (this.mountMode === 'horse' && this.mountDashTimer > 0) {
          const trampleDmg = Math.round(24 * this.getHeroDamageScale());
          for (const e of this.enemies) {
            if (e.aiState === 'dead' || this.mountTrampleHitIds.has(e.id)) continue;
            if (Math.hypot(e.pos.x - h.pos.x, e.pos.z - h.pos.z) <= 2.3 + e.radius) {
              this.mountTrampleHitIds.add(e.id);
              const pushYaw = Math.atan2(e.pos.x - h.pos.x, e.pos.z - h.pos.z);
              this.applyHeroAttackToEnemy(e, trampleDmg, true, pushYaw, 30, false, 'horseTrample');
              this.spawnWorldCallout('铁骑踏撞!', e.pos, 'info');
            }
          }
        }
        if (this.mountMode === 'sword' && moving) {
          this.mountWindTimer -= dt;
          if (this.mountWindTimer <= 0) {
            this.mountWindTimer = 0.22;
            this.vfx.spawnHitSparks(
              h.pos.clone().add(new THREE.Vector3(0, mPose.heroY - 0.15, 0)),
              new THREE.Vector3(-Math.sin(h.yaw), 0.1, -Math.cos(h.yaw)),
              new THREE.Color(0.45, 2.2, 2.35),
              5,
              this.rng,
            );
          }
        }
      } else {
        h.rig.root.position.copy(h.pos);
        h.rig.root.rotation.x = 0;
        h.rig.setSwordGlow(0.85);
        h.rig.applyPose(moving ? 'run' : anyThreat ? 'combatIdle' : 'idle', 0, this.elapsed, dt, h.vel.length());
      }
    } else if (h.state === 'attack') {
      this.tickHeroAttack(dt, prevPos);
    } else if (h.state === 'dodge') {
      this.tickHeroDodge(dt, prevPos);
    } else if (h.state === 'parryCounter') {
      this.tickParryCounter(dt, prevPos);
    } else if (h.state === 'skillQ' || h.state === 'skillE' || h.state === 'skillR' || h.state === 'comboUlt') {
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

    const movingInWater =
      this.mountMode !== 'sword' && (h.state === 'run' || h.state === 'dodge') && this.arena.isInShallowWater(h.pos);
    if (movingInWater) {
      this.waterRippleTimer -= dt;
      if (this.waterRippleTimer <= 0) {
        this.waterRippleTimer = 0.18;
        this.vfx.spawnWaterRipple(h.pos, h.state === 'dodge' ? 1.45 : 0.95);
      }
    } else {
      this.waterRippleTimer = 0;
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
    const cultivation = this.saveStore.getCultivationBonus();
    const elixir = this.saveStore.getElixirBonus();
    const swordHeart = getSwordHeartSummary(this.saveStore.getSwordHeart());
    const affix = this.getActiveLeylineAffix();
    const leylineZoneMult = this.heroInLeylineZone ? 1.3 : 1.0;
    const affixBonus = affix === 'blood_pact' ? 0.28 : affix === 'glass_cannon' ? 0.35 : 0;
    const blood2Bonus = this.blessings.pathCounts.blood >= 2 ? 0.22 : 0;
    const missingHpRatio = clamp(1 - this.hero.hp / Math.max(1, this.hero.maxHp), 0, 1);
    const blood3Bonus = this.blessings.pathCounts.blood >= 3 ? missingHpRatio * 0.6 : 0;
    return (
      realm.dmgMult *
      loadout.dmgMult *
      this.blessings.dmgMult *
      leylineZoneMult *
      (1 +
        cultivation.atkPct +
        elixir.atkPct +
        swordHeart.dmgBonus +
        this.activeMealBuff.dmgBonus +
        this.episodeChoiceBuff.dmgBonus +
        affixBonus +
        blood2Bonus +
        blood3Bonus)
    );
  }

  private startHeroAttack(step: number): void {
    this.markWorldCombatEngage();
    const h = this.hero;
    const prevMount = this.mountMode;
    if (prevMount !== 'none') {
      this.setMountMode('none', true);
      const isSwordPlunge = prevMount === 'sword';
      const aoeRadius = isSwordPlunge ? 5.0 : 4.2;
      const dmgMult = isSwordPlunge ? 1.85 : 1.65;
      const poiseAmt = isSwordPlunge ? 60 : 45;
      const skillName = isSwordPlunge ? 'swordPlunge' : 'horseSlam';
      const baseDmg = Math.round(44 * dmgMult * this.getHeroDamageScale());
      const aimYaw = this.getAimYaw();
      const tgt = this.findCombatTarget(8.5, aimYaw);
      h.yaw = tgt ? Math.atan2(tgt.x - h.pos.x, tgt.z - h.pos.z) : aimYaw;
      h.state = 'attack';
      h.comboStep = 4;
      h.stateTime = 0;
      h.stateDuration = 0.52;
      h.comboWindowTimer = 0.72;
      h.attackHasHit.clear();
      h.attackVfxFired = true;
      h.magnetTargetId = null;
      h.magnetSlideRemain = 0;
      h.dodgeInvuln = Math.max(h.dodgeInvuln, 0.24);
      h.rig.setWeaponDrawn(true);
      h.rig.setSwordGlow(2.4);
      h.rig.root.position.set(h.pos.x, 0, h.pos.z);
      h.rig.root.rotation.set(0, h.yaw, 0);

      if (isSwordPlunge) {
        h.spirit = Math.min(h.maxSpirit, h.spirit + 30);
        this.vfx.spawnBaguaArray({
          pos: new THREE.Vector3(h.pos.x, 0.08, h.pos.z),
          radius: 4.8,
          color: new THREE.Color(0.45, 2.35, 2.2),
          duration: 1.1,
        });
        this.vfx.spawnShockRing(h.pos, new THREE.Color(0.55, 2.35, 2.3), 0.55, 5.2, 0.48);
        this.spawnWorldCallout('天外飞仙 · 御剑坠斩!', h.pos, 'parry');
        this.audio.playSkillE();
      } else {
        this.vfx.spawnShockRing(h.pos, new THREE.Color(2.35, 1.55, 0.45), 0.45, 4.4, 0.45);
        this.vfx.spawnGroundCrater(h.pos, 2.4, new THREE.Color(2.2, 1.25, 0.35), 2.5);
        this.spawnWorldCallout('铁骑破阵斩!', h.pos, 'parry');
        this.audio.playSwordSwing(3);
      }
      this.cameraRig.addShake(0.42);
      triggerHaptic('heavy');
      this.recordComboSigil('A');

      for (const e of this.enemies) {
        if (e.aiState === 'dead') continue;
        if (Math.hypot(e.pos.x - h.pos.x, e.pos.z - h.pos.z) <= aoeRadius + e.radius) {
          const hitYaw = Math.atan2(e.pos.x - h.pos.x, e.pos.z - h.pos.z);
          this.applyHeroAttackToEnemy(e, baseDmg, true, hitYaw, poiseAmt, true, skillName);
        }
      }
      return;
    }
    const isShadowStrike = h.dodgeEmpowered || h.shadowStrikeTimer > 0;
    this.shadowAttackActive = isShadowStrike;
    this.q2AttackActive = false;
    if (isShadowStrike) {
      h.dodgeEmpowered = false;
      h.dodgeEmpowerTimer = 0;
      h.shadowStrikeTimer = 0;
      this.vfx.spawnAfterimage(h.pos, h.yaw, new THREE.Color(0.55, 2.35, 2.45), h.rig.root);
      this.spawnWorldCallout('流云拔刀斩!', h.pos, 'parry');
      triggerHaptic('medium');
    }
    this.recordComboSigil('A');

    h.state = 'attack';
    h.comboStep = step;
    h.stateTime = 0;
    h.stateDuration = isShadowStrike
      ? 0.44
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
    const tgt = this.findCombatTarget(isShadowStrike ? 10.5 : 6.4, aimYaw);
    if (tgt) {
      h.magnetTargetId = tgt.enemy ? tgt.enemy.id : -999;
      const dx = tgt.x - h.pos.x;
      const dz = tgt.z - h.pos.z;
      h.yaw = Math.atan2(dx, dz);
      const standOff = tgt.radius + h.radius + 1.1;
      h.magnetSlideRemain = clamp(Math.hypot(dx, dz) - standOff, 0, isShadowStrike ? 5.2 : 2.5);
    } else {
      h.magnetTargetId = null;
      h.magnetSlideRemain = isShadowStrike ? 2.6 : 0.55;
      h.yaw = aimYaw;
    }
    this.audio.playSwordSwing(step >= 3 || isShadowStrike ? 3 : step);
    this.mp.sendAction('attack', { step, yaw: h.yaw, x: h.pos.x, z: h.pos.z });
  }

  private tickHeroAttack(dt: number, prevPos: THREE.Vector3): void {
    const h = this.hero;
    h.stateTime += dt;
    const p = clamp(h.stateTime / h.stateDuration, 0, 1);

    if (p < 0.56 && h.magnetSlideRemain > 0.01) {
      let stepDist = Math.min(h.magnetSlideRemain, dt * (this.shadowAttackActive || this.q2AttackActive ? 16.5 : 9.2));
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

    const poseName: PoseName = this.q2AttackActive
      ? 'parryCounter'
      : h.comboStep === 1
        ? 'combo1'
        : h.comboStep === 2
          ? 'combo2'
          : h.comboStep === 4
            ? 'parryCounter'
            : 'combo3';
    h.rig.applyPose(poseName, p, this.elapsed, dt, 2);

    const activeStart = this.q2AttackActive ? 0.2 : h.comboStep >= 3 ? 0.38 : 0.34;
    const activeEnd = h.comboStep >= 3 ? 0.72 : 0.66;
    if (!h.attackVfxFired && p >= activeStart) {
      h.attackVfxFired = true;
      this.spawnSwordComboVfx(h.pos, h.yaw, this.shadowAttackActive || this.q2AttackActive ? 4 : h.comboStep);
      if (h.comboStep === 4 && !this.q2AttackActive) {
        this.spawnFlyingSwordProjectile(h.pos, h.yaw, true, false);
      }
    }

    if (p >= activeStart && p <= activeEnd) {
      const reach = this.shadowAttackActive ? 4.6 : this.q2AttackActive ? 3.9 : h.comboStep >= 3 ? 3.55 : 3.1;
      const halfCone = this.shadowAttackActive || this.q2AttackActive || h.comboStep === 2 || h.comboStep === 4 ? 1.62 : 1.2;
      const normalMult = h.comboStep === 4 ? 44 : h.comboStep === 3 ? 34 : h.comboStep === 2 ? 23 : 24;
      const rawMultiplier = this.q2AttackActive
        ? Math.round(44 * 1.5)
        : this.shadowAttackActive
          ? Math.round(normalMult * 1.45)
          : h.comboStep === 4
            ? 44
            : h.comboStep === 3
              ? 34
              : h.comboStep === 2
                ? 23
                : 19;
      const baseDmg = Math.round(rawMultiplier * this.getHeroDamageScale());
      const heavy = this.shadowAttackActive || this.q2AttackActive || h.comboStep >= 3;

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
          this.q2AttackActive ? 34 : this.shadowAttackActive ? 38 : heavy ? 24 : 11,
          this.shadowAttackActive || this.q2AttackActive || h.comboStep === 4,
          this.q2AttackActive ? 'skillQ' : `combo${h.comboStep}`,
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
            this.q2AttackActive ? 48 : this.shadowAttackActive ? 38 : h.comboStep === 4 ? 36 : h.comboStep === 3 ? 30 : h.comboStep === 2 ? 20 : 16,
            heavy ? 24 : 12,
            heavy,
            h.yaw,
            this.q2AttackActive ? 'skillQ' : `combo${h.comboStep}`,
          );
        }
      }
    }

    if (p >= 1) {
      h.state = 'idle';
      this.shadowAttackActive = false;
      this.q2AttackActive = false;
      this.q2DashTargetId = null;
    this.waterRippleTimer = 0;
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
        scale: this.shadowAttackActive || this.q2AttackActive ? 1.44 : comboStep === 4 ? 1.28 : 1.12,
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
    if (this.mountMode !== 'none') {
      h.stamina = Math.max(0, h.stamina - 16);
      this.mountDashTimer = 0.45;
      this.mountTrampleHitIds.clear();
      h.dodgeInvuln = 0.22;
      this.audio.playDodge(this.mountMode === 'sword');
      this.vfx.spawnShockRing(
        h.pos.clone().add(new THREE.Vector3(0, this.mountMode === 'sword' ? 1.5 : 0.4, 0)),
        this.mountMode === 'sword' ? new THREE.Color(0.45, 2.3, 2.35) : new THREE.Color(2.2, 1.55, 0.55),
        0.35,
        3.2,
        0.38,
      );
      this.spawnWorldCallout(
        this.mountMode === 'sword' ? '御剑破空!' : '飞骑疾驰!',
        h.pos.clone().add(new THREE.Vector3(0, 1.2, 0)),
        'info',
      );
      triggerHaptic('light');
      return;
    }
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
    this.recordComboSigil('D');
    this.vfx.spawnAfterimage(h.pos, h.yaw, new THREE.Color(0.32, 1.65, 1.95), h.rig.root);
    triggerHaptic('light');
    this.mp.sendAction('dodge', { x: h.pos.x, z: h.pos.z, yaw: h.yaw });
  }

  private tickHeroDodge(dt: number, prevPos: THREE.Vector3): void {
    const h = this.hero;
    const loadout = this.getLoadoutStats();
    h.stateTime += dt;
    const p = clamp(h.stateTime / h.stateDuration, 0, 1);
    const speed =
      15.8 *
      this.blessings.speedMult *
      loadout.speedMult *
      (1 + this.activeMealBuff.speedBonus + this.episodeChoiceBuff.speedBonus) *
      (1 - p * 0.45);
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
    this.triggerHeroVoice('counter');
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
    this.triggerHeroVoice('counter');
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

  private recordComboSigil(sig: 'A' | 'Q' | 'E' | 'D'): void {
    if (this.mode !== 'playing' && this.mode !== 'camp') return;
    const h = this.hero;
    if (h.comboUltReady) return;
    if (h.comboSigilTimer <= 0) {
      h.comboSigils = [];
    }
    h.comboSigilTimer = 6.0;
    if (!h.comboSigils.includes(sig)) {
      h.comboSigils.push(sig);
      if (h.comboSigils.length >= 3) {
        h.comboUltReady = true;
        h.comboUltTimer = 6.0;
        this.audio.playDropChime('spirit');
        this.spawnWorldCallout('三印齐聚 · 万剑归宗!', h.pos, 'parry');
      }
    }
  }

  tryCastComboUlt(): boolean {
    const h = this.hero;
    if ((this.mode !== 'playing' && this.mode !== 'camp') || h.state === 'dead' || !h.comboUltReady) return false;
    this.rmbMoveTarget = null;
    this.startComboUlt();
    return true;
  }

  private startComboUlt(): void {
    const h = this.hero;
    if (this.mountMode !== 'none') this.setMountMode('none', true);
    h.comboUltReady = false;
    h.comboUltTimer = 0;
    h.comboSigils = [];
    h.comboSigilTimer = 0;
    h.state = 'comboUlt';
    h.stateTime = 0;
    h.stateDuration = 0.92;
    h.dodgeInvuln = 1.15;
    h.attackVfxFired = false;
    h.rig.setWeaponDrawn(true);
    const tgt = this.findCombatTarget(18);
    if (tgt) h.yaw = Math.atan2(tgt.x - h.pos.x, tgt.z - h.pos.z);
    h.rig.root.rotation.y = h.yaw;
    this.audio.playSkillR();
    this.triggerHeroVoice('comboUlt');
    this.hud.triggerSkillPulse('R');
    this.spawnWorldCallout('万剑归宗 · 连携破阵!', h.pos, 'parry');
    triggerHaptic('ultimate');
  }

  private startSkillQ(): void {
    this.markWorldCombatEngage();
    const h = this.hero;
    const cdMult = this.getCdMult();
    if (this.mountMode === 'sword') {
      h.spirit -= 20;
      h.cdQ = 3.5 * cdMult;
      const aimYaw = this.getAimYaw();
      const tgt = this.findCombatTarget(20, aimYaw);
      h.yaw = tgt ? Math.atan2(tgt.x - h.pos.x, tgt.z - h.pos.z) : aimYaw;
      h.rig.root.rotation.y = h.yaw;
      const origin = h.pos.clone().add(new THREE.Vector3(0, 0.85, 0));
      for (const offset of [-0.22, 0, 0.22]) {
        this.spawnFlyingSwordProjectile(origin, h.yaw + offset, true, offset === 0);
      }
      this.recordComboSigil('Q');
      this.audio.playSkillQ();
      this.triggerHeroVoice('skillQ');
      this.hud.triggerSkillPulse('Q');
      this.spawnWorldCallout('御剑连星!', h.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), 'info');
      triggerHaptic('medium');
      this.mp.sendAction('skillQ', { x: h.pos.x, z: h.pos.z, yaw: h.yaw });
      return;
    }
    if (this.mountMode !== 'none') this.setMountMode('none', true);
    h.spirit -= 20;
    h.cdQ = 3.5 * cdMult;
    h.state = 'skillQ';
    h.stateTime = 0;
    h.stateDuration = 0.34;
    h.attackVfxFired = false;
    h.rig.setWeaponDrawn(true);
    const aimYaw = this.getAimYaw();
    const tgt = this.findCombatTarget(16, aimYaw);
    h.yaw = tgt ? Math.atan2(tgt.x - h.pos.x, tgt.z - h.pos.z) : aimYaw;
    h.rig.root.rotation.y = h.yaw;
    this.recordComboSigil('Q');
    this.audio.playSkillQ();
    this.triggerHeroVoice('skillQ');
    this.hud.triggerSkillPulse('Q');
    triggerHaptic('medium');
    this.mp.sendAction('skillQ', { x: h.pos.x, z: h.pos.z, yaw: h.yaw });
  }

  private startSkillQ2(): void {
    const h = this.hero;
    if (this.mountMode !== 'none') this.setMountMode('none', true);
    h.q2ReadyTimer = 0;
    const preferredId = h.q2TargetId;
    h.q2TargetId = null;

    let dashTgt: { x: number; z: number; radius: number; id: number | null } | null = null;
    if (preferredId === -999 && this.mp.mode === 'solo' && this.peer && !this.peer.dead) {
      dashTgt = { x: this.peer.pos.x, z: this.peer.pos.z, radius: this.peer.radius, id: -999 };
    } else if (preferredId !== null) {
      const marked = this.enemies.find((e) => e.id === preferredId && e.aiState !== 'dead');
      if (marked && marked.pos.distanceTo(h.pos) <= 22) {
        dashTgt = { x: marked.pos.x, z: marked.pos.z, radius: marked.radius, id: marked.id };
      }
    }
    if (!dashTgt) {
      const fallback = this.findCombatTarget(18);
      if (fallback) {
        dashTgt = {
          x: fallback.x,
          z: fallback.z,
          radius: fallback.radius,
          id: fallback.enemy ? fallback.enemy.id : -999,
        };
      }
    }

    this.vfx.spawnAfterimage(h.pos, h.yaw, new THREE.Color(0.55, 2.35, 2.45), h.rig.root);

    if (dashTgt) {
      const dx = dashTgt.x - h.pos.x;
      const dz = dashTgt.z - h.pos.z;
      const dist = Math.hypot(dx, dz);
      const yaw = dist > 0.05 ? Math.atan2(dx, dz) : h.yaw;
      h.yaw = yaw;
      const stand = dashTgt.radius + h.radius + 1.0;
      const dashDist = Math.max(0, dist - stand);
      if (dashDist > 0.05 && dist > 0.05) {
        h.pos.x += (dx / dist) * dashDist;
        h.pos.z += (dz / dist) * dashDist;
      }
      this.arena.constrainPosition(h.pos, h.radius);
    } else {
      h.pos.x += Math.sin(h.yaw) * 4.8;
      h.pos.z += Math.cos(h.yaw) * 4.8;
      this.arena.constrainPosition(h.pos, h.radius);
    }

    h.rig.root.position.copy(h.pos);
    h.rig.root.rotation.y = h.yaw;
    this.vfx.spawnAfterimage(h.pos, h.yaw, new THREE.Color(0.95, 2.25, 2.2), h.rig.root);
    this.vfx.spawnShockRing(h.pos, new THREE.Color(0.55, 2.2, 2.3), 0.25, 2.6, 0.35);

    h.ult = Math.min(100, h.ult + 20 * this.getEffectiveUltGainMult());
    h.cdE = Math.max(0, h.cdE - 1.5);

    this.q2AttackActive = true;
    this.shadowAttackActive = false;
    this.q2DashTargetId = dashTgt?.id ?? null;
    h.state = 'attack';
    h.comboStep = 4;
    h.stateTime = 0;
    h.stateDuration = 0.36;
    h.comboWindowTimer = 0.55;
    h.dodgeInvuln = Math.max(h.dodgeInvuln, 0.32);
    h.attackHasHit.clear();
    h.attackVfxFired = false;
    h.magnetTargetId = this.q2DashTargetId;
    h.magnetSlideRemain = 0;
    h.rig.setWeaponDrawn(true);
    h.rig.setSwordGlow(2.3);

    this.recordComboSigil('Q');
    this.audio.playDodge(true);
    this.audio.playSwordSwing(3);
    this.hud.triggerSkillPulse('Q');
    this.spawnWorldCallout('踏剑追影!', h.pos, 'parry');
    triggerHaptic('medium');
  }

  private startSkillE(): void {
    this.markWorldCombatEngage();
    const h = this.hero;
    if (this.mountMode !== 'none') this.setMountMode('none', true);
    h.spirit -= 45;
    h.cdE = 7.5 * this.getCdMult();
    h.state = 'skillE';
    h.stateTime = 0;
    h.stateDuration = 0.52;
    h.attackVfxFired = false;
    h.rig.setWeaponDrawn(true);
    const tgt = this.findCombatTarget(16, this.getAimYaw());
    if (tgt) h.yaw = Math.atan2(tgt.x - h.pos.x, tgt.z - h.pos.z);
    h.rig.root.rotation.y = h.yaw;
    this.recordComboSigil('E');
    this.audio.playSkillE();
    this.triggerHeroVoice('skillE');
    this.hud.triggerSkillPulse('E');
    triggerHaptic('heavy');
  }

  private startSkillR(): void {
    this.markWorldCombatEngage();
    const h = this.hero;
    if (this.mountMode !== 'none') this.setMountMode('none', true);
    h.ult = 0;
    h.cdR = 12.0 * this.getCdMult();
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
    this.triggerHeroVoice('skillR');
    this.hud.triggerSkillPulse('R');
    triggerHaptic('ultimate');
  }

  private startDrinkGourd(): void {
    const h = this.hero;
    if (this.mountMode !== 'none') this.setMountMode('none', true);
    h.state = 'drink';
    h.stateTime = 0;
    h.stateDuration = 0.68;
    h.cdHeal = 1.5;
    h.attackVfxFired = false;
    this.triggerHeroVoice('heal');
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

    const fireAt = h.state === 'comboUlt' ? 0.28 : 0.35;
    if (!h.attackVfxFired && p >= fireAt) {
      h.attackVfxFired = true;
      if (h.state === 'skillQ') {
        this.spawnFlyingSwordProjectile(h.pos, h.yaw, true, true);
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
      } else if (h.state === 'comboUlt') {
        const tgt = this.findCombatTarget(18);
        const center = tgt
          ? new THREE.Vector3(tgt.x, 0, tgt.z)
          : h.pos.clone().add(new THREE.Vector3(Math.sin(h.yaw) * 5.5, 0, Math.cos(h.yaw) * 5.5));
        this.arena.constrainPosition(center, 1.2);
        this.mp.sendAction('skillR', { cx: center.x, cz: center.z });
        this.castComboUltAt(center, true);
      }
    }

    if (p >= 1) h.state = 'idle';
  }

  private spawnFlyingSwordProjectile(
    origin: THREE.Vector3,
    yaw: number,
    friendly: boolean,
    appliesMark = false,
  ): void {
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
      appliesMark,
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

  private applyFallingSwordImpact(
    e: EnemyEntity,
    baseDmg: number,
    heavy: boolean,
    yaw: number,
    poise: number,
    isCrit: boolean,
    skill: string,
    hitCounts: Map<number, number>,
  ): void {
    const prevHits = hitCounts.get(e.id) ?? 0;
    hitCounts.set(e.id, prevHits + 1);
    const isHeavyTarget = e.kind === 'boss' || e.kind === 'elite';
    const dimMult = isHeavyTarget && prevHits >= 4 ? 0.55 : 1.0;
    this.applyHeroAttackToEnemy(e, Math.round(baseDmg * dimMult), heavy, yaw, poise, isCrit, skill);
  }

  private castSkillEAt(center: THREE.Vector3, isLocalDamage: boolean): void {
    const h = this.hero;
    this.vfx.spawnSkySwordGate(
      center.clone().add(new THREE.Vector3(0, 12.0, 0)),
      5.0,
      new THREE.Color(0.55, 2.0, 2.2),
      1.65,
    );
    this.vfx.spawnBaguaArray({
      pos: new THREE.Vector3(center.x, 0.08, center.z),
      radius: 4.8,
      color: new THREE.Color(0.35, 1.85, 2.0),
      duration: 1.65,
    });

    const markedEnemies = isLocalDamage
      ? this.enemies.filter((e) => e.aiState !== 'dead' && (e.swordMarkTimer ?? 0) > 0 && e.pos.distanceTo(center) <= 14)
      : [];
    const markedIds = new Set<number>(markedEnemies.map((e) => e.id));
    const swordHitCounts = new Map<number, number>();

    let pvpHitSent = false;
    const perSwordDmg = Math.round(22 * this.getHeroDamageScale());
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2 + this.rng() * 0.35;
      const r = i === 0 ? 0.2 : 0.9 + (i % 3) * 0.95 + this.rng() * 1.1;
      const spot = new THREE.Vector3(center.x + Math.cos(ang) * r, 0, center.z + Math.sin(ang) * r);
      const tiltRad = 0.08 + ((i * 5) % 9) * 0.02;
      this.vfx.spawnFallingSword({
        targetPos: spot,
        delay: i * 0.055,
        tiltRad,
        onImpact: (pos) => {
          if (i % 3 === 0) {
            this.audio.playHit(false);
            this.cameraRig.addShake(0.14);
          }
          this.vfx.spawnGroundCrater(pos, 1.15, new THREE.Color(0.35, 1.75, 2.0), 2.6);
          if (!isLocalDamage) return;
          for (const e of this.enemies) {
            if (e.aiState === 'dead') continue;
            if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) <= 2.35 + e.radius) {
              const resonated = markedIds.has(e.id) || (e.swordMarkTimer ?? 0) > 0;
              const dmg = resonated ? Math.round(perSwordDmg * 1.25) : perSwordDmg;
              const poise = resonated ? 18 : 9;
              this.applyFallingSwordImpact(e, dmg, resonated, h.yaw, poise, resonated, 'skillE', swordHitCounts);
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

    // Q+E Resonance: +4 extra homing sky swords per Sword-Marked enemy
    for (const target of markedEnemies) {
      target.swordMarkTimer = 0;
      this.spawnWorldCallout('剑印共鸣!', target.pos, 'parry');
      this.vfx.spawnShockRing(target.pos, new THREE.Color(0.9, 2.25, 2.1), 0.3, 3.2, 0.4);
      for (let k = 0; k < 4; k++) {
        const ang = (k / 4) * Math.PI * 2 + this.rng() * 0.3;
        const spot = new THREE.Vector3(
          target.pos.x + Math.cos(ang) * 0.75,
          0,
          target.pos.z + Math.sin(ang) * 0.75,
        );
        this.vfx.spawnFallingSword({
          targetPos: spot,
          delay: 0.12 + k * 0.06,
          tiltRad: 0.1 + k * 0.035,
          color: new THREE.Color(0.95, 2.25, 2.05),
          onImpact: (pos) => {
            this.vfx.spawnGroundCrater(pos, 1.3, new THREE.Color(0.95, 2.2, 2.0), 2.5);
            for (const e of this.enemies) {
              if (e.aiState === 'dead') continue;
              if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) <= 2.4 + e.radius) {
                this.applyFallingSwordImpact(
                  e,
                  Math.round(perSwordDmg * 1.25),
                  true,
                  h.yaw,
                  18,
                  true,
                  'skillE',
                  swordHitCounts,
                );
              }
            }
          },
        });
      }
    }
  }

  private castSkillRAt(center: THREE.Vector3, isLocalDamage: boolean): void {
    const h = this.hero;
    const goldColor = new THREE.Color(2.2, 1.7, 0.5);
    this.vfx.spawnSkySwordGate(
      center.clone().add(new THREE.Vector3(0, 14.0, 0)),
      7.0,
      goldColor,
      1.95,
    );
    this.vfx.spawnBaguaArray({
      pos: new THREE.Vector3(center.x, 0.1, center.z),
      radius: 6.4,
      color: new THREE.Color(2.2, 1.65, 0.45),
      duration: 2.1,
    });

    // 6 perimeter guard swords plunging sequentially around center
    const guardDmg = Math.round(28 * this.getHeroDamageScale());
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const spot = new THREE.Vector3(center.x + Math.cos(ang) * 3.4, 0, center.z + Math.sin(ang) * 3.4);
      this.vfx.spawnFallingSword({
        targetPos: spot,
        delay: 0.04 + i * 0.055,
        tiltRad: 0.12 + (i % 3) * 0.03,
        color: new THREE.Color(2.2, 1.75, 0.55),
        onImpact: (pos) => {
          this.vfx.spawnGroundCrater(pos, 1.4, goldColor, 2.8);
          if (i % 2 === 0) this.audio.playHit(false);
          if (!isLocalDamage) return;
          for (const e of this.enemies) {
            if (e.aiState === 'dead') continue;
            if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) <= 2.6 + e.radius) {
              this.applyHeroAttackToEnemy(e, guardDmg, false, h.yaw, 16, false, 'skillR');
            }
          }
        },
      });
    }

    const ultDmg = Math.round(145 * this.getHeroDamageScale());
    this.vfx.spawnFallingSword({
      targetPos: center,
      giant: true,
      delay: 0.28,
      tiltRad: 0.04,
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

  private castComboUltAt(center: THREE.Vector3, isLocalDamage: boolean): void {
    const h = this.hero;
    this.vfx.spawnSkySwordGate(
      center.clone().add(new THREE.Vector3(-1.35, 13.4, 0.45)),
      6.2,
      new THREE.Color(2.2, 1.75, 0.55),
      2.1,
    );
    this.vfx.spawnSkySwordGate(
      center.clone().add(new THREE.Vector3(1.35, 14.2, -0.45)),
      6.2,
      new THREE.Color(0.55, 2.15, 2.2),
      2.1,
    );
    this.vfx.spawnBaguaArray({
      pos: new THREE.Vector3(center.x, 0.1, center.z),
      radius: 7.2,
      color: new THREE.Color(1.9, 2.0, 1.05),
      duration: 2.3,
    });

    const swordHitCounts = new Map<number, number>();
    const rainDmg = Math.round(24 * this.getHeroDamageScale());
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2 + this.rng() * 0.25;
      const r = 1.1 + (i % 4) * 1.15 + this.rng() * 0.55;
      const spot = new THREE.Vector3(center.x + Math.cos(ang) * r, 0, center.z + Math.sin(ang) * r);
      this.vfx.spawnFallingSword({
        targetPos: spot,
        comboUlt: true,
        delay: i * 0.04,
        tiltRad: 0.1 + (i % 5) * 0.035,
        color: i % 2 === 0 ? new THREE.Color(2.15, 1.75, 0.58) : new THREE.Color(0.65, 2.15, 2.1),
        onImpact: (pos) => {
          if (i % 4 === 0) {
            this.audio.playHit(true);
            this.cameraRig.addShake(0.18);
          }
          this.vfx.spawnGroundCrater(pos, 1.35, new THREE.Color(1.85, 1.9, 0.9), 2.8);
          if (!isLocalDamage) return;
          for (const e of this.enemies) {
            if (e.aiState === 'dead') continue;
            if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) <= 2.6 + e.radius) {
              this.applyFallingSwordImpact(e, rainDmg, false, h.yaw, 22, true, 'skillR', swordHitCounts);
            }
          }
        },
      });
    }

    const finisherDmg = Math.round(160 * this.getHeroDamageScale());
    this.vfx.spawnFallingSword({
      targetPos: center,
      giant: true,
      comboUlt: true,
      delay: 0.34,
      tiltRad: 0.03,
      color: new THREE.Color(2.3, 1.85, 0.65),
      onImpact: (pos) => {
        this.cameraRig.addShake(0.95);
        this.vfx.spawnShockRing(pos, new THREE.Color(2.35, 1.9, 0.65), 0.7, 9.0, 0.7);
        this.vfx.spawnGroundCrater(pos, 4.0, new THREE.Color(2.3, 1.8, 0.55), 4.4);
        this.vfx.spawnHitSparks(
          pos.clone().add(new THREE.Vector3(0, 0.6, 0)),
          new THREE.Vector3(0, 1, 0),
          new THREE.Color(2.4, 2.0, 0.65),
          30,
          this.rng,
        );
        if (!isLocalDamage) return;
        triggerHaptic('ultimate');
        for (const e of this.enemies) {
          if (e.aiState === 'dead') continue;
          if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) <= 7.4 + e.radius) {
            this.applyHeroAttackToEnemy(e, finisherDmg, true, h.yaw, 75, true, 'skillR');
          }
        }
        if (this.mp.mode === 'solo' && this.peer && !this.peer.dead) {
          if (Math.hypot(this.peer.pos.x - pos.x, this.peer.pos.z - pos.z) <= 7.4 + this.peer.radius) {
            this.sendPvpStrike(74, 65, true, h.yaw, 'skillR');
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
    this.markWorldCombatEngage();
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

    const elixir = this.saveStore.getElixirBonus();
    const rolledCrit = isCrit || (fromLocalHero && this.rng() < loadout.critRate + this.blessings.critRateBonus + elixir.critRate);
    const lotusCritBonus = this.blessings.pathCounts.lotus >= 3 ? 0.5 : 0;
    const critScale = rolledCrit ? loadout.critMult + this.blessings.critDmgBonus + lotusCritBonus + elixir.critDmg : 1.0;

    const affix = this.getActiveLeylineAffix();
    const flyingSurgeMult = affix === 'flying_surge' && (skill === 'skillQ' || skill === 'skillE') ? 1.4 : 1.0;
    const staggerMult =
      e.aiState === 'stagger' || skill === 'parryCounter'
        ? (affix === 'titan_armor' ? 2.1 : 1.0) * (this.blessings.pathCounts.thunder >= 3 ? 1.8 : 1.0)
        : 1.0;

    const dmg = Math.round(rawDmg * (interrupted ? 1.35 : 1.0) * critScale * flyingSurgeMult * staggerMult);
    const scaledPoise =
      poiseGain * (interrupted ? 1.6 : 1.0) * (fromLocalHero ? loadout.poiseMult + elixir.poiseBonus / 100 : 1.0);
    if (fromLocalHero) {
      e.aggroHeroTimer = 5.5;
    }
    if (e.isDummy) {
      e.hp = Math.max(1, e.hp - dmg);
      e.stateTime = 0;
    } else {
      e.hp = Math.max(0, e.hp - dmg);
    }
    e.poise = Math.min(e.maxPoise, e.poise + scaledPoise);

    const isSkillE = skill === 'skillE';
    const allowFeedback = !isSkillE || this.elapsed - this.lastSkillEFeedbackAt >= 0.22;
    if (isSkillE && allowFeedback) this.lastSkillEFeedbackAt = this.elapsed;

    if (fromLocalHero) {
      h.spirit = Math.min(h.maxSpirit, h.spirit + (heavy ? 12 : 7) + (rolledCrit && this.blessings.pathCounts.lotus >= 3 ? 12 : 0));
      h.ult = Math.min(100, h.ult + (heavy ? 12 : 6) * this.getEffectiveUltGainMult());
      h.comboCount += 1;
      h.comboDecayTimer = 3.2;
      h.maxCombo = Math.max(h.maxCombo, h.comboCount);
      h.totalDamage += dmg;
      this.addCombatStyle(
        (heavy || rolledCrit ? 9 : 5) + (interrupted ? 10 : 0),
        skill ?? (heavy ? 'heavy' : 'light'),
      );
      const totalLifesteal =
        loadout.lifesteal +
        this.blessings.lifestealBonus +
        (this.blessings.pathCounts.blood >= 2 ? 0.07 : 0) +
        (affix === 'blood_pact' ? 0.09 : 0);
      if (totalLifesteal > 0 && h.hp > 0 && h.hp < h.maxHp) {
        h.hp = Math.min(h.maxHp, h.hp + Math.max(1, Math.round(dmg * totalLifesteal)));
      }
      if (rolledCrit && this.blessings.pathCounts.lotus >= 2 && this.lotusProcCooldown <= 0 && skill !== 'lotusProc') {
        this.lotusProcCooldown = 1.0;
        const procYaw = Math.atan2(e.pos.x - h.pos.x, e.pos.z - h.pos.z);
        this.spawnFlyingSwordProjectile(h.pos, procYaw, true, false);
        this.spawnWorldCallout('莲华追剑!', h.pos, 'info');
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
      this.showStorySubtitle(getBossEnrageLine(this.currentStageId, e.name), 3.2);
    }

    if (!e.isDummy && e.hp <= 0) {
      this.killEnemy(e);
      return;
    }

    if (e.poise >= e.maxPoise || (interrupted && e.kind !== 'boss' && e.kind !== 'elite' && e.affix !== 'ironclad')) {
      e.poise = 0;
      e.telegraph?.dispose();
      e.telegraph = null;
      e.aiState = 'stagger';
      e.stateTime = 0;
      e.stateDuration = e.isDummy ? 1.1 : e.kind === 'boss' ? 2.1 : e.kind === 'elite' ? 1.8 : 1.5;
      if (fromLocalHero && !e.isDummy) {
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
      if (this.rng() < 0.2) {
        this.vfx.spawnLootDrop(e.pos, 'heal', this.rng);
      }
      if (e.kind === 'caster' || e.kind === 'elite') {
        this.vfx.spawnLootDrop(e.pos, 'spirit', this.rng);
      }
    } else {
      this.vfx.spawnLootDrop(e.pos, 'spirit', this.rng);
      this.vfx.spawnLootDrop(e.pos, 'gourd', this.rng);
    }

    const loadout = this.getLoadoutStats();
    if (loadout.killHealPct > 0 && this.hero.hp > 0) {
      const heal = Math.max(6, Math.round(this.hero.maxHp * loadout.killHealPct));
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + heal);
      this.spawnWorldCallout(`嗜血 +${heal}`, this.hero.pos, 'heal');
    }

    if (this.blessings.pathCounts.blood >= 3 && this.mode === 'playing') {
      const burstDmg = Math.round(85 * this.getHeroDamageScale());
      this.vfx.spawnShockRing(e.pos, new THREE.Color(2.2, 0.24, 0.45), 0.35, 4.6, 0.42);
      this.spawnWorldCallout('修罗血爆!', e.pos, 'crit');
      for (const other of this.enemies) {
        if (other.id !== e.id && other.aiState !== 'dead' && Math.hypot(other.pos.x - e.pos.x, other.pos.z - e.pos.z) <= 4.5 + other.radius) {
          this.damageEnemy(other, burstDmg, true, e.yaw, 25, false, true, 'bloodExplosion');
        }
      }
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
      if (this.mode === 'world') {
        const reg = getWorldRegionAt(e.pos.x, e.pos.z);
        const yaodanQty = e.kind === 'boss' ? 2 : e.kind === 'elite' ? 2 : 1;
        this.saveStore.addMaterial('mat_yaodan', yaodanQty);
        this.spawnWorldCallout(`+${yaodanQty} 妖兽内丹`, e.pos.clone().add(new THREE.Vector3(-0.4, 0.5, 0)), 'heal');
        if (reg.id === 'lava' || reg.id === 'grave') {
          this.saveStore.addMaterial('mat_xuantie', 1);
          this.spawnWorldCallout('+1 赤炎玄铁', e.pos.clone().add(new THREE.Vector3(0.45, 0.72, 0)), 'info');
        } else if (reg.id === 'crypt') {
          this.saveStore.addMaterial('mat_yinhun', 1);
          this.spawnWorldCallout('+1 幽冥玄晶', e.pos.clone().add(new THREE.Vector3(0.45, 0.72, 0)), 'info');
        } else if (reg.id === 'peach' && e.kind === 'elite') {
          this.saveStore.addMaterial('mat_lingzhi', 1);
          this.spawnWorldCallout('+1 九叶灵芝', e.pos.clone().add(new THREE.Vector3(0.45, 0.72, 0)), 'heal');
        } else if (reg.id === 'star' && e.kind === 'elite') {
          this.saveStore.addMaterial('mat_xuelian', 1);
          this.spawnWorldCallout('+1 天山雪莲', e.pos.clone().add(new THREE.Vector3(0.45, 0.72, 0)), 'info');
        }
        if (this.craftOverlay.isOpen()) this.craftOverlay.refresh(this.saveStore);

        const hasOtherHostile = this.enemies.some(
          (x) => x.id !== e.id && x.aiState !== 'dead' && !x.isDummy && Math.hypot(x.pos.x - this.hero.pos.x, x.pos.z - this.hero.pos.z) <= 13.5,
        );
        if (e.worldCampId) {
          const camp = WORLD_MOB_CAMPS.find((c) => c.id === e.worldCampId);
          const campAlive = this.enemies.some((x) => x.id !== e.id && x.worldCampId === e.worldCampId && x.aiState !== 'dead');
          if (camp && !campAlive) {
            this.saveStore.addJade(camp.jadeReward);
            this.saveStore.addMaterial('mat_yaodan', 2);
            if (camp.id === 'camp_grave' || camp.id === 'camp_lava') this.saveStore.addMaterial('mat_xuantie', 1);
            else if (camp.id === 'camp_crypt') this.saveStore.addMaterial('mat_yinhun', 1);
            else if (camp.id === 'camp_peach') this.saveStore.addMaterial('mat_lingzhi', 1);
            else if (camp.id === 'camp_star') this.saveStore.addMaterial('mat_xuelian', 1);
            this.worldMobTimers.set(camp.id, camp.respawnSec);
            if (!hasOtherHostile) {
              this.worldInCombat = false;
              this.worldCombatCooldown = 0;
            }
            if (!this.worldAutoCombatActive) {
              this.announceWorldNextStep(`清剿据点【${camp.name}】(+${camp.jadeReward}灵石 · 获炼丹材料)`);
            }
            return;
          }
        }
        if (e.worldBossId === 'event_goblin') {
          this.worldEventEnemyId = null;
          this.worldEventTimer = 46;
          this.saveStore.addJade(180);
          this.saveStore.addMaterial('mat_longlin', 1);
          this.spawnWorldCallout('+1 真龙逆鳞', e.pos.clone().add(new THREE.Vector3(0, 0.95, 0)), 'parry');
          const item = rollEquipmentDrop({
            tier: 3,
            guaranteedMinRarity: 'epic',
            pityTriggered: this.saveStore.advancePityAndCheck(),
            source: '九州奇遇·赤金宝妖',
            rng: this.rng,
          });
          this.vfx.spawnGearDrop(e.pos, item, this.rng);
          this.audio.playGearDropChime(item.rarity);
          if (!hasOtherHostile) {
            this.worldInCombat = false;
            this.worldCombatCooldown = 0;
          }
          if (!this.worldAutoCombatActive) {
            this.announceWorldNextStep(`斩杀【${e.name}】(+180灵石 · +1真龙逆鳞与极品神兵)`);
          }
          return;
        } else if (e.worldBossId) {
          const wb = WORLD_BOSS_SPAWNS.find((b) => b.id === e.worldBossId);
          if (wb) {
            this.saveStore.recordWorldBossKill(wb.id);
            this.saveStore.addJade(wb.jadeReward);
            this.saveStore.addMaterial('mat_longlin', 1);
            this.spawnWorldCallout('+1 真龙逆鳞', e.pos.clone().add(new THREE.Vector3(0, 0.95, 0)), 'parry');
            this.worldBossTimers.set(wb.id, wb.respawnSec);
            const dropCount = wb.guaranteedMinRarity === 'legendary' ? 2 : 1;
            for (let k = 0; k < dropCount; k++) {
              const item = rollEquipmentDrop({
                tier: wb.tier,
                guaranteedMinRarity: wb.guaranteedMinRarity,
                pityTriggered: k === 0 ? this.saveStore.advancePityAndCheck() : false,
                source: `九州首领·${wb.name}`,
                rng: this.rng,
              });
              this.vfx.spawnGearDrop(e.pos, item, this.rng);
              if (k === 0) this.audio.playGearDropChime(item.rarity);
            }
            const prog = this.saveStore.getWorldProgress();
            const curReg = getWorldRegionAt(this.hero.pos.x, this.hero.pos.z);
            this.hud.setWorldStatus(curReg.name, prog.waypoints, prog.chests, prog.bosses, prog.orbs);
            if (!hasOtherHostile) {
              this.worldInCombat = false;
              this.worldCombatCooldown = 0;
            }
            if (!this.worldAutoCombatActive) {
              this.announceWorldNextStep(`击破野外首领【${wb.name}】(+${wb.jadeReward}灵石 · +1真龙逆鳞)`);
            }
            return;
          }
        }
        if (this.worldInCombat && !hasOtherHostile) {
          this.worldInCombat = false;
          this.worldCombatCooldown = 0;
          if (!this.worldAutoCombatActive) {
            this.announceWorldNextStep('战斗结束');
          }
        }
        return;
      }
      // Campaign / Dungeon / Tower / Roguelike material drops
      if (e.kind === 'elite') {
        this.saveStore.addMaterial('mat_yaodan', 1);
        this.spawnWorldCallout('+1 妖兽内丹', e.pos.clone().add(new THREE.Vector3(-0.35, 0.55, 0)), 'heal');
      } else if (e.kind === 'boss') {
        this.saveStore.addMaterial('mat_yaodan', 2);
        this.saveStore.addMaterial('mat_longlin', 1);
        this.spawnWorldCallout('+1 真龙逆鳞', e.pos.clone().add(new THREE.Vector3(0, 0.9, 0)), 'parry');
      }
      const stageDef = this.getActiveStageDef();
      const tier: 1 | 2 | 3 = this.activeDungeon
        ? this.activeDungeon.tier
        : this.activeTowerFloor
          ? this.activeTowerFloor.tier
          : stageDef.chapter >= 3
            ? 3
            : stageDef.chapter >= 2
              ? 2
              : 1;
      const sourceLabel = this.activeTowerFloor
        ? `锁妖塔第${this.activeTowerFloor.id}层`
        : this.roguelikeState?.active
          ? `幻境肉鸽·第${this.roguelikeState.chamberIdx + 1}境`
          : this.activeDungeon
            ? `秘境·${this.activeDungeon.name}`
            : `第${stageDef.id}关·${stageDef.name}`;
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
        const isFirstClear =
          !this.activeDungeon &&
          !this.activeTowerFloor &&
          !this.roguelikeState?.active &&
          !this.saveStore.getStageRecord(stageDef.id);
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
      h.hp = Math.min(h.maxHp, h.hp + 26);
      this.spawnWorldCallout('+26 气血', h.pos, 'heal');
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

  private getEnemyAggroTarget(enemyPos: THREE.Vector3, enemy?: EnemyEntity): THREE.Vector3 {
    const stageDef = this.getActiveStageDef();
    if (
      this.mode === 'playing' &&
      stageDef.stageMode === 'defend' &&
      this.monolithHp > 0 &&
      (enemy?.aggroHeroTimer ?? 0) <= 0
    ) {
      return this.arena.getMonolithPos();
    }
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
    if (
      this.mode !== 'world' &&
      stageDef.hazard !== 'none' &&
      this.stagePhase === 'combat' &&
      this.enemies.some((e) => e.aiState !== 'dead')
    ) {
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

  private updateCampDummy(dt: number): void {
    const h = this.hero;
    for (const e of this.enemies) {
      if (!e.isDummy) continue;
      if (e.hpBarGroup.visible) {
        e.hpBarGroup.quaternion.copy(this.camera.quaternion);
        e.hpFillMesh.scale.x = clamp(e.hp / e.maxHp, 0.001, 1);
      }
      e.counterRing.visible = h.counterTargetId === e.id && h.counterWindowTimer > 0;
      if (e.counterRing.visible) e.counterRing.rotation.z += dt * 4.5;

      if (e.swordMarkTimer && e.swordMarkTimer > 0) {
        e.swordMarkTimer = Math.max(0, e.swordMarkTimer - dt);
      }
      if (e.hitstopTimer > 0) {
        e.hitstopTimer = Math.max(0, e.hitstopTimer - dt);
        const j = Math.sin(this.elapsed * 95) * 0.06;
        e.rig.root.position.set(e.pos.x + j, e.pos.y, e.pos.z - j);
        continue;
      }

      if (e.aiState === 'hit' || e.aiState === 'stagger') {
        e.stateTime += dt;
        const p = clamp(e.stateTime / Math.max(0.1, e.stateDuration), 0, 1);
        e.pos.addScaledVector(e.vel, dt * (1 - p) * 0.45);
        this.arena.constrainPosition(e.pos, e.radius);
        e.rig.root.position.copy(e.pos);
        e.rig.applyPose(e.aiState === 'stagger' ? 'stagger' : 'hit', p, this.elapsed, dt, 0);
        if (p >= 1) {
          e.aiState = 'orbit';
          e.stateTime = 0;
        }
        continue;
      }

      const toHeroYaw = Math.atan2(h.pos.x - e.pos.x, h.pos.z - e.pos.z);
      e.yaw = dampAngle(e.yaw, toHeroYaw, 6, dt);
      const homeDx = -e.pos.x;
      const homeDz = -4.6 - e.pos.z;
      const homeDist = Math.hypot(homeDx, homeDz);
      if (homeDist > 0.35) {
        const step = Math.min(homeDist, dt * 3.0);
        e.pos.x += (homeDx / homeDist) * step;
        e.pos.z += (homeDz / homeDist) * step;
      }
      e.rig.root.position.copy(e.pos);
      e.rig.root.rotation.y = e.yaw;
      e.rig.applyPose('combatIdle', 0, this.elapsed, dt, 0);

      e.stateTime += dt;
      if (e.stateTime >= 1.8 && e.hp < e.maxHp) {
        const prevHp = e.hp;
        e.hp = Math.min(e.maxHp, e.hp + dt * 950);
        if (prevHp < e.maxHp && e.hp >= e.maxHp) {
          this.vfx.spawnHealVortex(e.pos);
          this.spawnWorldCallout('剑桩复原', e.pos, 'heal');
        }
      }
    }
  }

  private showStorySubtitle(line: string, duration = 3.0): void {
    if (!line) return;
    this.storySubtitleUntil = this.elapsed + duration * 0.85;
    this.hud.showSubtitle(line, duration);
  }

  private triggerHeroVoice(kind: HeroVoiceKind, showSub = true): void {
    const line = this.audio.playHeroVoice(kind);
    if (!showSub || !line) return;
    if (this.elapsed < this.storySubtitleUntil) return;
    if (this.elapsed - this.lastVoiceSubtitleAt < 2.4 && kind !== 'skillR' && kind !== 'comboUlt') return;
    this.lastVoiceSubtitleAt = this.elapsed;
    this.hud.showSubtitle(`李逍遥：「${line}」`, 2.1);
  }

  private ensureCampNpcs(): void {
    if (this.campNpcGroup) return;
    const grp = new THREE.Group();
    grp.visible = false;

    const wineRig = new CharacterRig('xiaoyao');
    wineRig.applyHeroAppearance(
      {
        primaryHex: '#3c2a1e',
        robeInnerHex: '#e8dcc2',
        secondaryHex: '#a8762c',
        accentHex: '#8d2424',
        trimHex: '#d8b464',
        bronzeHex: '#d4a84e',
        sheenHex: '#f6d68a',
      },
      {
        steelHex: '#f0dfac',
        glowHex: '#ffeaa8',
        emissiveHex: '#cc8818',
        trailCore: [2, 1.6, 0.8],
        trailEdge: [1.5, 0.9, 0.2],
      },
    );
    wineRig.setWeaponDrawn(false);
    const winePos = new THREE.Vector3(3.65, 0, -0.95);
    const wineYaw = Math.atan2(-3.65, 2.5);
    wineRig.root.position.copy(winePos);
    wineRig.root.rotation.y = wineYaw;
    grp.add(wineRig.root);
    this.campNpcWineMaster = { rig: wineRig, pos: winePos, yaw: wineYaw, label: '师尊 · 酒剑仙', drinkCycle: 0 };

    const allyRig = new CharacterRig('ally');
    allyRig.setWeaponDrawn(true);
    const allyPos = new THREE.Vector3(-3.55, 0, -2.15);
    const allyYaw = Math.atan2(3.55, 3.0);
    allyRig.root.position.copy(allyPos);
    allyRig.root.rotation.y = allyYaw;
    grp.add(allyRig.root);
    this.campNpcXuanying = { rig: allyRig, pos: allyPos, yaw: allyYaw, label: '同门 · 玄影', sparTimer: 0 };

    this.scene.add(grp);
    this.campNpcGroup = grp;
  }

  private setCampNpcsVisible(visible: boolean): void {
    if (this.campNpcGroup) {
      this.campNpcGroup.visible = visible;
    }
    if (!visible) {
      this.activeCampHotspot = null;
      this.hud.setCampInteractPrompt(null);
      this.hud.updateCampNpcLabels([]);
    }
  }

  private updateCampNpcs(dt: number): void {
    if (!this.campNpcGroup || !this.campNpcGroup.visible) return;
    const h = this.hero;

    if (this.campNpcWineMaster) {
      const npc = this.campNpcWineMaster;
      const d = Math.hypot(h.pos.x - npc.pos.x, h.pos.z - npc.pos.z);
      const baseYaw = Math.atan2(-3.65, 2.5);
      const targetYaw = d < 4.5 ? Math.atan2(h.pos.x - npc.pos.x, h.pos.z - npc.pos.z) : baseYaw;
      npc.yaw = dampAngle(npc.yaw, targetYaw, 5.0, dt);
      npc.rig.root.rotation.y = npc.yaw;
      npc.drinkCycle = (npc.drinkCycle + dt) % 9.0;
      if (npc.drinkCycle > 7.4) {
        npc.rig.applyPose('drink', (npc.drinkCycle - 7.4) / 1.6, this.elapsed, dt, 0);
      } else {
        npc.rig.applyPose('idle', 0, this.elapsed, dt, 0);
      }
    }

    if (this.campNpcXuanying) {
      const npc = this.campNpcXuanying;
      const d = Math.hypot(h.pos.x - npc.pos.x, h.pos.z - npc.pos.z);
      const baseYaw = Math.atan2(3.55, 3.0);
      const targetYaw = d < 4.5 ? Math.atan2(h.pos.x - npc.pos.x, h.pos.z - npc.pos.z) : baseYaw;
      npc.yaw = dampAngle(npc.yaw, targetYaw, 6.0, dt);
      npc.rig.root.rotation.y = npc.yaw;
      npc.sparTimer = (npc.sparTimer + dt) % 7.5;
      if (npc.sparTimer > 6.4 && d >= 3.2) {
        npc.rig.applyPose('combo1', (npc.sparTimer - 6.4) / 1.1, this.elapsed, dt, 0);
      } else {
        npc.rig.applyPose('combatIdle', 0, this.elapsed, dt, 0);
      }
    }

    if (this.mode === 'camp') {
      const labels: Array<{ label: string; x: number; y: number; ally?: boolean }> = [];
      const w = this.canvas.clientWidth || window.innerWidth;
      const ch = this.canvas.clientHeight || window.innerHeight;
      const projectNpc = (npcPos: THREE.Vector3, label: string, ally: boolean) => {
        this.tmpVec.set(npcPos.x, 2.08, npcPos.z).project(this.camera);
        if (this.tmpVec.z < 1) {
          const sx = (this.tmpVec.x * 0.5 + 0.5) * w;
          const sy = (-this.tmpVec.y * 0.5 + 0.5) * ch;
          if (sx > 24 && sx < w - 24 && sy > 24 && sy < ch - 24) {
            labels.push({ label, x: sx, y: sy, ally });
          }
        }
      };
      if (this.campNpcWineMaster) projectNpc(this.campNpcWineMaster.pos, this.campNpcWineMaster.label, false);
      if (this.campNpcXuanying) projectNpc(this.campNpcXuanying.pos, this.campNpcXuanying.label, true);
      this.hud.updateCampNpcLabels(labels);

      const candidates: Array<{ id: 'wine' | 'ally' | 'mat' | 'tea'; dist: number; prompt: string }> = [];
      if (this.campNpcWineMaster) {
        const d = Math.hypot(h.pos.x - this.campNpcWineMaster.pos.x, h.pos.z - this.campNpcWineMaster.pos.z);
        if (d <= 2.65) candidates.push({ id: 'wine', dist: d, prompt: '与师尊 · 酒剑仙论剑' });
      }
      if (this.campNpcXuanying) {
        const d = Math.hypot(h.pos.x - this.campNpcXuanying.pos.x, h.pos.z - this.campNpcXuanying.pos.z);
        if (d <= 2.65) candidates.push({ id: 'ally', dist: d, prompt: '与同门 · 玄影探报试剑' });
      }
      const dMat = Math.hypot(h.pos.x - -4.25, h.pos.z - 1.85);
      if (dMat <= 2.45) candidates.push({ id: 'mat', dist: dMat, prompt: '盘膝打坐 · 吐纳心法' });
      const dTea = Math.hypot(h.pos.x - 4.5, h.pos.z - 0.85);
      if (dTea <= 2.45) candidates.push({ id: 'tea', dist: dTea, prompt: '围炉品茗 · 温养剑意' });

      candidates.sort((a, b) => a.dist - b.dist);
      const best = candidates[0] ?? null;
      this.activeCampHotspot = best ? best.id : null;
      this.hud.setCampInteractPrompt(best ? best.prompt : null);
    } else {
      this.hud.setCampInteractPrompt(null);
      this.hud.updateCampNpcLabels([]);
    }
  }

  private triggerCampHotspotInteract(forced?: 'wine' | 'ally' | 'mat' | 'tea'): boolean {
    if (this.mode !== 'camp') return false;
    const spot = forced ?? this.activeCampHotspot;
    if (!spot) return false;
    this.audio.unlock();

    if (spot === 'wine') {
      const realm = this.saveStore.getCultivationBonus().current.name;
      const cleared = this.saveStore.getClearedCount();
      const dlg = getWineMasterCampDialogue(cleared, realm);
      this.dialogueContext = 'campNpc';
      this.activeDialogueDef = dlg;
      this.campDialogueFocusPos = this.campNpcWineMaster?.pos.clone() ?? null;
      this.mode = 'dialogue';
      this.audio.playDialogueStep(false);
      this.hud.showStageDialogue(dlg);
      return true;
    }

    if (spot === 'ally') {
      const nextStageId = this.saveStore.getRecommendedStage();
      const nextStage = getStageDef(nextStageId);
      const cleared = this.saveStore.getClearedCount();
      const dlg = getXuanyingCampDialogue(nextStage, cleared);
      this.dialogueContext = 'campNpc';
      this.activeDialogueDef = dlg;
      this.campDialogueFocusPos = this.campNpcXuanying?.pos.clone() ?? null;
      this.mode = 'dialogue';
      this.audio.playDialogueStep(false);
      this.hud.showStageDialogue(dlg);
      return true;
    }

    if (spot === 'mat') {
      const quote = CAMP_MEDITATION_QUOTES[this.campMeditationIdx % CAMP_MEDITATION_QUOTES.length];
      this.campMeditationIdx += 1;
      this.hero.hp = this.hero.maxHp;
      this.hero.delayedHp = this.hero.maxHp;
      this.hero.spirit = this.hero.maxSpirit;
      this.hero.ult = Math.min(100, this.hero.ult + 25);
      this.hud.setCampTab('cultivate');
      this.audio.playDropChime('spirit');
      this.vfx.spawnHealVortex(this.hero.pos);
      this.spawnWorldCallout('吐纳清心 +25剑意!', this.hero.pos, 'heal');
      this.showStorySubtitle(`李逍遥：「${quote}」`, 3.0);
      this.hud.showCampToast('蒲团吐纳：气血真气回满，剑意 +25%', true);
      return true;
    }

    const quote = CAMP_TEA_QUOTES[this.campTeaIdx % CAMP_TEA_QUOTES.length];
    this.campTeaIdx += 1;
    this.hero.state = 'drink';
    this.hero.stateTime = 0;
    this.hero.stateDuration = 0.68;
    this.hero.attackVfxFired = false;
    this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + 45);
    this.hero.delayedHp = Math.max(this.hero.delayedHp, this.hero.hp);
    this.hud.setCampTab('meal');
    this.audio.playHeal();
    this.vfx.spawnShockRing(this.hero.pos, new THREE.Color(2.1, 1.5, 0.55), 0.35, 2.2, 0.45);
    this.spawnWorldCallout('篝火品茗 · 神清气爽!', this.hero.pos, 'parry');
    this.showStorySubtitle(`李逍遥：「${quote}」`, 3.0);
    this.hud.showCampToast('篝火品茗：气血温养，可择仙酿加护下战', true);
    return true;
  }

  private updateEnemies(dt: number): void {
    const h = this.hero;
    const maxMeleeAttackers = this.getActiveStageDef().chapter <= 2 ? 3 : 4;
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
      if (e.aggroHeroTimer && e.aggroHeroTimer > 0) {
        e.aggroHeroTimer = Math.max(0, e.aggroHeroTimer - dt);
      }
      if (e.swordMarkTimer && e.swordMarkTimer > 0) {
        e.swordMarkTimer = Math.max(0, e.swordMarkTimer - dt);
      }
      const prevPos = this.tmpVec2.copy(e.pos);
      const targetPos = this.getEnemyAggroTarget(e.pos, e);
      const dx = targetPos.x - e.pos.x;
      const dz = targetPos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      const toHeroYaw = Math.atan2(dx, dz);

      if (e.homePos && (e.aiState === 'orbit' || e.aiState === 'chase')) {
        const dHome = Math.hypot(e.pos.x - e.homePos.x, e.pos.z - e.homePos.z);
        const hHome = Math.hypot(targetPos.x - e.homePos.x, targetPos.z - e.homePos.z);
        const aggroR = e.aggroRadius ?? 16;
        const leashR = e.leashRadius ?? 26;
        if (dHome > leashR || (hHome > aggroR + 7 && dHome > 2.2)) {
          const hx = e.homePos.x - e.pos.x;
          const hz = e.homePos.z - e.pos.z;
          const retDist = Math.hypot(hx, hz);
          const retYaw = Math.atan2(hx, hz);
          e.yaw = dampAngle(e.yaw, retYaw, 8, dt);
          const retSpd = 5.4 * e.speedMult;
          if (retDist > 0.1) {
            e.pos.x += (hx / retDist) * retSpd * dt;
            e.pos.z += (hz / retDist) * retSpd * dt;
          }
          e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.08 * dt);
          e.rig.root.position.copy(e.pos);
          e.rig.root.rotation.y = e.yaw;
          e.rig.applyPose('run', 0, this.elapsed, dt, retSpd);
          continue;
        }
        if (hHome > aggroR) {
          e.yaw = dampAngle(e.yaw, toHeroYaw, 3.5, dt);
          e.rig.root.rotation.y = e.yaw;
          e.rig.applyPose('combatIdle', 0, this.elapsed, dt, 0);
          continue;
        }
      }

      if (this.corridorMode && (e.aiState === 'orbit' || e.aiState === 'chase') && dist > 20) {
        e.yaw = dampAngle(e.yaw, toHeroYaw, 5, dt);
        e.rig.root.rotation.y = e.yaw;
        e.rig.applyPose('combatIdle', 0, this.elapsed, dt, 0);
        continue;
      }

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
          e.attackCooldown = 0.45;
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
              let longMove: EnemyEntity['moveKind'] =
                e.kind === 'boss' && e.phase === 2 && this.rng() < 0.45 ? 'barrage' : 'lunge';
              if (e.kind === 'boss' && e.bossArchetype) {
                const rLong = this.rng();
                if (e.bossArchetype === 'phantom') {
                  longMove = rLong < 0.44 ? 'blinkStrike' : rLong < 0.76 ? 'swordStorm' : 'lunge';
                } else if (e.bossArchetype === 'celestial' || e.bossArchetype === 'astral') {
                  longMove =
                    e.bossArchetype === 'astral' && rLong < 0.34
                      ? 'blinkStrike'
                      : rLong < 0.4
                        ? 'meteorRain'
                        : rLong < 0.72
                          ? 'crossBeam'
                          : 'swordStorm';
                } else if (e.bossArchetype === 'inferno') {
                  longMove = rLong < 0.5 ? 'lavaEruption' : 'barrage';
                } else if (e.bossArchetype === 'titan' && dist < 8.5) {
                  longMove = rLong < 0.48 ? 'quakeRing' : 'lunge';
                }
              }
              this.beginEnemyWindup(e, longMove, undefined, targetPos);
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
              let mv: EnemyEntity['moveKind'] = roll < 0.45 ? 'cleave' : roll < 0.75 ? 'slam' : 'lunge';
              if (e.kind === 'boss' && e.bossArchetype) {
                if (e.bossArchetype === 'titan') {
                  mv = roll < 0.36 ? 'quakeRing' : roll < 0.62 ? 'slam' : roll < 0.84 ? 'cleave' : 'lunge';
                } else if (e.bossArchetype === 'phantom') {
                  mv = roll < 0.34 ? 'blinkStrike' : roll < 0.62 ? 'swordStorm' : roll < 0.84 ? 'lunge' : 'cleave';
                } else if (e.bossArchetype === 'inferno') {
                  mv = roll < 0.4 ? 'lavaEruption' : roll < 0.66 ? 'slam' : roll < 0.85 ? 'barrage' : 'cleave';
                } else if (e.bossArchetype === 'celestial' || e.bossArchetype === 'astral') {
                  mv =
                    e.bossArchetype === 'astral' && roll < 0.28
                      ? 'blinkStrike'
                      : roll < 0.36
                        ? 'crossBeam'
                        : roll < 0.64
                          ? 'meteorRain'
                          : roll < 0.84
                            ? e.phase === 2
                              ? 'quakeRing'
                              : 'slam'
                            : 'swordStorm';
                }
              }
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
          } else if (e.moveKind === 'blinkStrike') {
            this.vfx.spawnAfterimage(e.pos, e.yaw, new THREE.Color(0.85, 0.35, 1.9), e.rig.root);
            const behindAng = this.hero.yaw + Math.PI;
            e.pos.set(
              this.hero.pos.x + Math.sin(behindAng) * 2.3,
              0,
              this.hero.pos.z + Math.cos(behindAng) * 2.3,
            );
            this.arena.constrainPosition(e.pos, e.radius, prevPos);
            e.yaw = Math.atan2(this.hero.pos.x - e.pos.x, this.hero.pos.z - e.pos.z);
            e.rig.root.position.copy(e.pos);
            e.rig.root.rotation.y = e.yaw;
            this.vfx.spawnShockRing(e.pos, new THREE.Color(1.4, 0.45, 2.35), 0.25, 2.2, 0.32);
          }
          e.telegraph?.dispose();
          e.telegraph = null;
          e.aiState = 'attack';
          e.stateTime = 0;
          e.stateDuration =
            e.moveKind === 'lunge' || e.moveKind === 'blinkStrike'
              ? 0.34
              : e.moveKind === 'slam' || e.moveKind === 'quakeRing'
                ? 0.45
                : 0.36;
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
        } else if ((e.moveKind === 'cleave' || e.moveKind === 'blinkStrike') && p < 0.4) {
          e.pos.x += Math.sin(e.yaw) * 3.5 * dt;
          e.pos.z += Math.cos(e.yaw) * 3.5 * dt;
          this.arena.constrainPosition(e.pos, e.radius, prevPos);
        }
        e.rig.root.position.copy(e.pos);
        const isSlamPose =
          e.moveKind === 'slam' ||
          e.moveKind === 'quakeRing' ||
          e.moveKind === 'lavaEruption' ||
          e.moveKind === 'crossBeam' ||
          e.moveKind === 'meteorRain';
        e.rig.applyPose(isSlamPose ? 'bossSlam' : 'enemySlash', p, this.elapsed, dt, 0);

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
            e.stateDuration = e.kind === 'boss' ? (e.phase === 2 ? 0.34 : 0.44) : e.kind === 'elite' ? 0.4 : 0.34;
          }
        }
      } else if (e.aiState === 'recover') {
        e.stateTime += dt;
        e.rig.applyPose('combatIdle', 0, this.elapsed, dt, 0);
        if (e.stateTime >= e.stateDuration) {
          e.aiState = 'orbit';
          e.stateTime = 0;
          e.attackCooldown =
            (e.kind === 'boss' ? (e.phase === 2 ? 0.53 : 0.74) : e.kind === 'elite' ? 0.7 : 0.7 + this.rng() * 0.49) /
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

    const baseAtk = ENEMY_BASE_STATS[e.kind].atk;
    if (move === 'cleave') {
      e.stateDuration = (customWindup ?? (e.kind === 'boss' ? 0.72 : e.kind === 'elite' ? 0.66 : 0.62)) * fast;
      e.moveRange = e.kind === 'boss' ? 4.3 : e.kind === 'elite' ? 3.4 : 2.85;
      e.moveDamage = Math.round(baseAtk * (e.kind === 'boss' ? 0.92 : 0.96) * e.damageMult);
      e.moveUnblockable = false;
      e.telegraph = this.vfx.createTelegraph('fan', e.pos, e.yaw, e.moveRange * 1.45, e.moveRange);
    } else if (move === 'lunge') {
      e.stateDuration = 0.74 * fast;
      e.moveRange = 2.6;
      e.moveDamage = Math.round(baseAtk * 1.08 * e.damageMult);
      e.moveUnblockable = false;
      e.telegraphPos.copy(e.pos);
      e.telegraph = this.vfx.createTelegraph('line', e.pos, e.yaw, 2.3, 8.8);
    } else if (move === 'slam') {
      e.stateDuration = 0.92 * fast;
      e.moveRange = e.kind === 'boss' ? 5.4 : 4.2;
      e.moveDamage = Math.round(baseAtk * (e.kind === 'boss' ? 1.24 : 1.16) * e.damageMult);
      e.moveUnblockable = true;
      e.telegraphPos.copy(e.pos);
      e.telegraph = this.vfx.createTelegraph('circle', e.pos, 0, e.moveRange, e.moveRange, new THREE.Color(2.2, 0.2, 0.65));
    } else if (move === 'yinCircle') {
      e.stateDuration = 1.05;
      e.moveRange = 3.1;
      e.moveDamage = Math.round(baseAtk * 1.24 * e.damageMult);
      e.moveUnblockable = true;
      e.telegraphPos.copy(targetPos ?? this.hero.pos);
      e.telegraph = this.vfx.createTelegraph('circle', e.telegraphPos, 0, e.moveRange, e.moveRange, new THREE.Color(1.4, 0.45, 2.35));
    } else if (move === 'orb' || move === 'barrage') {
      e.stateDuration = move === 'barrage' ? 0.75 : 0.68;
      e.moveRange = 14;
      e.moveDamage = Math.round((move === 'barrage' ? baseAtk * 0.72 : baseAtk) * e.damageMult);
      e.moveUnblockable = false;
    } else if (move === 'quakeRing') {
      e.stateDuration = 1.05 * fast;
      e.moveRange = 8.2;
      e.moveDamage = Math.round(baseAtk * 1.32 * e.damageMult);
      e.moveUnblockable = true;
      e.telegraphPos.copy(e.pos);
      e.telegraph = this.vfx.createTelegraph('circle', e.pos, 0, e.moveRange, e.moveRange, new THREE.Color(2.2, 1.05, 0.25));
    } else if (move === 'blinkStrike') {
      e.stateDuration = 0.7 * fast;
      e.moveRange = 3.8;
      e.moveDamage = Math.round(baseAtk * 1.12 * e.damageMult);
      e.moveUnblockable = false;
      e.telegraph = this.vfx.createTelegraph('fan', e.pos, e.yaw, 4.4, 3.6);
    } else if (move === 'swordStorm') {
      e.stateDuration = 0.85 * fast;
      e.moveRange = 15;
      e.moveDamage = Math.round(baseAtk * 0.76 * e.damageMult);
      e.moveUnblockable = false;
    } else if (move === 'lavaEruption') {
      e.stateDuration = 0.92 * fast;
      e.moveRange = 3.4;
      e.moveDamage = Math.round(baseAtk * 1.25 * e.damageMult);
      e.moveUnblockable = true;
      e.telegraphPos.copy(targetPos ?? this.hero.pos);
      e.telegraph = this.vfx.createTelegraph('circle', e.telegraphPos, 0, 3.0, 3.0, new THREE.Color(2.4, 0.45, 0.15));
    } else if (move === 'crossBeam') {
      e.stateDuration = 0.95 * fast;
      e.moveRange = 11.0;
      e.moveDamage = Math.round(baseAtk * 1.18 * e.damageMult);
      e.moveUnblockable = true;
      e.telegraphPos.copy(e.pos);
      e.telegraph = this.vfx.createTelegraph('circle', e.pos, 0, 4.8, 4.8, new THREE.Color(1.4, 0.7, 2.4));
    } else if (move === 'meteorRain') {
      e.stateDuration = 1.0 * fast;
      e.moveRange = 3.6;
      e.moveDamage = Math.round(baseAtk * 1.28 * e.damageMult);
      e.moveUnblockable = true;
      e.telegraphPos.copy(targetPos ?? this.hero.pos);
      e.telegraph = this.vfx.createTelegraph('circle', e.telegraphPos, 0, 3.4, 3.4, new THREE.Color(1.6, 0.35, 2.3));
    }
  }

  private executeEnemyMoveHit(e: EnemyEntity): void {
    e.moveHasHit = true;
    const h = this.hero;

    if (e.moveKind === 'orb' || e.moveKind === 'barrage' || e.moveKind === 'swordStorm') {
      const count = e.moveKind === 'swordStorm' ? 8 : e.moveKind === 'barrage' ? 5 : 1;
      const spread = e.moveKind === 'swordStorm' ? (Math.PI * 2) / 8 : 0.28;
      for (let i = 0; i < count; i++) {
        const ang =
          e.moveKind === 'swordStorm'
            ? e.yaw + i * spread + 0.15
            : e.yaw + (i - (count - 1) * 0.5) * spread;
        const mesh = buildYinOrbMesh(e.kind === 'boss' || e.kind === 'elite');
        const startPos = e.pos.clone().add(new THREE.Vector3(Math.sin(ang) * 1.1, 1.25, Math.cos(ang) * 1.1));
        mesh.position.copy(startPos);
        this.scene.add(mesh);
        const speed = e.moveKind === 'swordStorm' ? 12.2 : e.kind === 'boss' ? 13.2 : 11.2;
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

    if (e.moveKind === 'quakeRing') {
      this.vfx.spawnShockRing(e.pos, new THREE.Color(2.4, 1.35, 0.35), 0.8, e.moveRange, 0.62);
      this.vfx.spawnShockRing(e.pos, new THREE.Color(2.2, 0.45, 0.25), 0.4, e.moveRange * 0.7, 0.48);
      this.vfx.spawnGroundCrater(e.pos, e.moveRange * 0.65, new THREE.Color(2.2, 0.85, 0.25), 3.6);
      this.audio.playHit(true);
      this.cameraRig.addShake(0.65);
      if (Math.hypot(h.pos.x - e.pos.x, h.pos.z - e.pos.z) <= e.moveRange) {
        this.tryHitHero(e, e.moveDamage, true);
      }
      return;
    }

    if (e.moveKind === 'lavaEruption' || e.moveKind === 'meteorRain' || e.moveKind === 'crossBeam') {
      const points: THREE.Vector3[] = [];
      if (e.moveKind === 'crossBeam') {
        const dirs = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ];
        for (const [dx, dz] of dirs) {
          for (const stepD of [3.5, 7.2]) {
            const pt = new THREE.Vector3(e.pos.x + dx * stepD, 0, e.pos.z + dz * stepD);
            this.arena.constrainPosition(pt, 1.0);
            points.push(pt);
          }
        }
      } else {
        const count = e.moveKind === 'meteorRain' ? 4 : 3;
        const anchor = e.telegraphPos.clone();
        for (let i = 0; i < count; i++) {
          const ang = (i / count) * Math.PI * 2 + this.rng() * 0.9;
          const rad = i === 0 ? 0.6 : 2.6 + this.rng() * 2.4;
          const pt = new THREE.Vector3(anchor.x + Math.cos(ang) * rad, 0, anchor.z + Math.sin(ang) * rad);
          this.arena.constrainPosition(pt, 1.2);
          points.push(pt);
        }
      }
      const hzKind: Exclude<StageHazardType, 'none'> =
        e.moveKind === 'lavaEruption' ? 'ember' : e.moveKind === 'crossBeam' ? 'lightning' : 'abyss';
      const col =
        hzKind === 'ember'
          ? new THREE.Color(2.4, 0.55, 0.18)
          : hzKind === 'lightning'
            ? new THREE.Color(1.4, 0.55, 2.4)
            : new THREE.Color(2.0, 0.3, 1.9);
      const radius = e.moveKind === 'crossBeam' ? 2.1 : 2.85;
      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        const telegraph = this.vfx.createTelegraph('circle', pt, 0, radius, radius, col);
        this.hazards.push({
          kind: hzKind,
          pos: pt,
          radius,
          damage: e.moveDamage,
          elapsed: -i * 0.08,
          duration: 0.92,
          telegraph,
        });
      }
      this.audio.playSkillE();
      this.cameraRig.addShake(0.35);
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

    const stageDef = this.getActiveStageDef();
    if (
      this.mode === 'playing' &&
      stageDef.stageMode === 'defend' &&
      this.monolithHp > 0 &&
      (e.aggroHeroTimer ?? 0) <= 0
    ) {
      const monoPos = this.arena.getMonolithPos();
      const dMono = Math.hypot(e.pos.x - monoPos.x, e.pos.z - monoPos.z);
      if (dMono <= e.moveRange + 1.8) {
        const monoDmg = Math.max(8, Math.round(e.moveDamage * 0.85));
        this.damageMonolith(monoDmg);
      }
    }
  }

  private damageMonolith(dmg: number): void {
    if (this.monolithHp <= 0 || this.mode !== 'playing' || this.godMode) return;
    this.monolithHp = Math.max(0, this.monolithHp - dmg);
    const ratio = this.monolithHp / Math.max(1, this.monolithMaxHp);
    this.arena.setMonolithHealthRatio(ratio);
    const monoPos = this.arena.getMonolithPos();
    this.vfx.spawnShockRing(monoPos, new THREE.Color(2.2, 0.3, 0.42), 0.35, 2.5, 0.38);
    this.spawnWorldCallout(`灵脉受击 -${dmg}`, monoPos, 'crit');
    if (this.monolithHp <= 0) {
      this.mode = 'defeat';
      this.hud.setMode('defeat');
      this.hud.showResult(false, this.runElapsed, this.hero, {
        stageDef: this.getActiveStageDef(),
        dungeonDef: this.activeDungeon ?? undefined,
        towerFloor: this.activeTowerFloor ?? undefined,
        combatRank: evaluateCombatRank(this.combatStylePeak),
        customTitle: '灵 脉 崩 毁',
        customSub: '蜀山灵脉水晶被妖众击碎！主动出剑拉住仇恨，配合完美弹反惊雷护阵！',
      });
    }
  }

  private triggerParryThunderNova(): void {
    const hasAffix = this.getActiveLeylineAffix() === 'parry_nova';
    const hasPath = this.blessings.pathCounts.thunder >= 2;
    if (!hasAffix && !hasPath) return;
    const novaDmg = Math.round(140 * this.getHeroDamageScale());
    this.vfx.spawnShockRing(this.hero.pos, new THREE.Color(1.4, 0.5, 2.4), 0.45, 6.2, 0.5);
    this.spawnWorldCallout('天雷破招!', this.hero.pos, 'parry');
    this.audio.playSkillE();
    for (const enemy of this.enemies) {
      if (enemy.aiState === 'dead') continue;
      if (Math.hypot(enemy.pos.x - this.hero.pos.x, enemy.pos.z - this.hero.pos.z) <= 6.2 + enemy.radius) {
        const y = Math.atan2(enemy.pos.x - this.hero.pos.x, enemy.pos.z - this.hero.pos.z);
        this.damageEnemy(enemy, novaDmg, true, y, 45, true, true, 'parry');
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
        h.dodgeEmpowered = true;
        h.dodgeEmpowerTimer = 3.0;
        this.recordComboSigil('D');
        h.spirit = Math.min(h.maxSpirit, h.spirit + 22);
        h.ult = Math.min(100, h.ult + 14 * this.getEffectiveUltGainMult());
        this.addCombatStyle(20, 'perfectDodge');
        if (this.blessings.pathCounts.thunder >= 3) {
          h.cdQ = 0;
          this.spawnWorldCallout('雷尊步虚 · 重置Q!', h.pos, 'info');
        }
        this.timeScale = 0.28;
        this.slowMoTimer = 0.34;
        this.audio.playDodge(true);
        this.triggerHeroVoice('dodge');
        this.vfx.spawnShockRing(h.pos, new THREE.Color(0.45, 2.1, 2.2), 0.25, 2.6, 0.35);
        this.spawnWorldCallout('极限闪避 · 流云蓄势!', h.pos, 'info');
        this.triggerParryThunderNova();
        triggerHaptic('medium');
      }
      return false;
    }

    if (h.hurtInvuln > 0) return false;

    if (
      this.mountMode === 'sword' &&
      attacker &&
      (attacker.moveKind === 'quakeRing' || attacker.moveKind === 'lavaEruption')
    ) {
      this.spawnWorldCallout('御剑凌空避震!', h.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), 'info');
      return false;
    }

    if (h.state === 'block' && !unblockable) {
      const refPos = attacker?.pos ?? attackerWorldPos;
      const fromYaw = refPos ? Math.atan2(refPos.x - h.pos.x, refPos.z - h.pos.z) : h.yaw;
      const frontal = Math.abs(angleDiff(h.yaw, fromYaw)) < 1.65;
      if (frontal) {
        if (h.blockElapsed <= 0.26 + loadout.parryWindowBonus) {
          h.parryCount += 1;
          h.dodgeEmpowered = true;
          h.dodgeEmpowerTimer = 3.0;
          this.recordComboSigil('D');
          if (this.mp.mode === 'offline' || this.mp.role === 'host') {
            this.saveStore.incrementStat('totalParries', 1);
          }
          h.spirit = Math.min(h.maxSpirit, h.spirit + 24 + loadout.parrySpiritBonus);
          h.ult = Math.min(100, h.ult + 22 * this.getEffectiveUltGainMult());
          this.addCombatStyle(24, 'perfectParry');
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
          this.triggerParryThunderNova();
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

    if (this.mountMode !== 'none') {
      this.setMountMode('none', true);
    }
    const elixir = this.saveStore.getElixirBonus();
    const totalDmgReduce = clamp(loadout.dmgReduce + elixir.dmgReduce, 0, 0.72);
    const finalDmg = Math.max(1, Math.round(dmg * (1 - totalDmgReduce)));
    if (!this.godMode) {
      h.hp = Math.max(0, h.hp - finalDmg);
    }
    h.hurtInvuln = 0.48;
    h.comboCount = 0;
    this.combatStyleScore = Math.max(0, this.combatStyleScore - 26);
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
      } else if (this.mode === 'world') {
        this.resetHero(new THREE.Vector3(WORLD_SPAWN_POS.x, 0, WORLD_SPAWN_POS.z), Math.PI);
        this.cameraRig.snapTo(this.hero.pos);
        this.showStorySubtitle('真气耗竭，已御风退回蜀山云台重整旗鼓！', 3.4);
      } else {
        this.mode = 'defeat';
        this.hud.setMode('defeat');
        this.hud.showResult(false, this.runElapsed, h, {
          stageDef: this.getActiveStageDef(),
          dungeonDef: this.activeDungeon ?? undefined,
          towerFloor: this.activeTowerFloor ?? undefined,
          combatRank: evaluateCombatRank(this.combatStylePeak),
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

      let remove = p.age >= p.maxAge || this.arena.isOutOfBounds(p.pos, 2.5);

      if (!remove && p.friendly) {
        for (const e of this.enemies) {
          if (e.aiState === 'dead' || p.hitIds.has(e.id)) continue;
          if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) <= e.radius + p.radius) {
            p.hitIds.add(e.id);
            const yaw = Math.atan2(p.vel.x, p.vel.z);
            this.applyHeroAttackToEnemy(e, p.damage, p.kind === 'flyingSword', yaw, 24, p.kind === 'yinOrb', 'skillQ');
            if (p.kind === 'flyingSword' && p.appliesMark && e.hp > 0) {
              e.swordMarkTimer = 5.0;
              h.q2ReadyTimer = 2.6;
              h.q2TargetId = e.id;
              this.vfx.spawnShockRing(e.pos, new THREE.Color(0.55, 2.15, 2.25), 0.25, 1.85, 0.35);
              this.spawnWorldCallout('剑印!', e.pos.clone().add(new THREE.Vector3(0, 0.4, 0)), 'info');
            }
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
          if (p.kind === 'flyingSword' && p.appliesMark) {
            h.q2ReadyTimer = 2.6;
            h.q2TargetId = -999;
          }
        }
      } else if (!remove && !p.friendly) {
        const layoutNow = this.arena.getLayout();
        if (layoutNow === 'pillars' || layoutNow === 'openworld') {
          for (const obs of this.arena.circleObstacles) {
            if (Math.hypot(p.pos.x - obs.x, p.pos.z - obs.z) <= obs.r + p.radius) {
              this.vfx.spawnHitSparks(p.pos, new THREE.Vector3(0, 0.5, 0), new THREE.Color(1.8, 0.85, 0.5), 6, this.rng);
              remove = true;
              break;
            }
          }
        }
        if (!remove && Math.hypot(h.pos.x - p.pos.x, h.pos.z - p.pos.z) <= h.radius + p.radius) {
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

    if (heroSolid && this.mode === 'camp' && this.campNpcGroup?.visible) {
      for (const npc of [this.campNpcWineMaster, this.campNpcXuanying]) {
        if (!npc) continue;
        const dx = h.pos.x - npc.pos.x;
        const dz = h.pos.z - npc.pos.z;
        const minD = h.radius + 0.52;
        const d2 = dx * dx + dz * dz;
        if (d2 < minD * minD && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = minD - d;
          h.pos.x += (dx / d) * push;
          h.pos.z += (dz / d) * push;
        }
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
      if (stageDef.stageMode === 'survive' && this.mp.mode === 'offline') {
        this.surviveRemainSec = Math.max(0, this.surviveRemainSec - dt);
        this.surviveSpawnTimer -= dt;
        const aliveList = this.enemies.filter((e) => e.aiState !== 'dead');
        if (this.surviveSpawnTimer <= 0 && aliveList.length < 5) {
          this.surviveSpawnTimer = 8.2;
          const packCount = aliveList.length <= 1 ? 3 : 2;
          for (let k = 0; k < packCount; k++) {
            const ang = (k / packCount) * Math.PI * 2 + this.rng() * 0.8;
            const sx = Math.cos(ang) * 9.5;
            const sz = Math.sin(ang) * 8.5 - 2.0;
            const kind = k === 0 && stageDef.chapter >= 3 ? 'elite' : k % 2 === 1 ? 'caster' : 'bladesman';
            const spawned = this.spawnEnemy(kind, sx, sz, undefined, {
              hpMult: 1.15 + stageDef.chapter * 0.14,
              dmgMult: 1.1 + stageDef.chapter * 0.12,
              affix: k === 0 ? 'swift' : 'storm',
            });
            spawned.aiState = 'orbit';
          }
          this.spawnWorldCallout('援军杀至!', this.hero.pos, 'info');
        }
        if (this.surviveRemainSec <= 0) {
          for (const rem of this.enemies) {
            if (rem.aiState !== 'dead') {
              this.vfx.spawnShockRing(rem.pos, new THREE.Color(2.2, 1.85, 0.55), 0.35, 3.2, 0.45);
              rem.aiState = 'dead';
              rem.deathTimer = 0;
              rem.telegraph?.dispose();
              rem.telegraph = null;
              rem.hpBarGroup.visible = false;
            }
          }
          this.stagePhase = 'done';
          this.stageTimer = 1.05;
          this.audio.setMood('victory');
          if (stageDef.victoryLine) {
            this.showStorySubtitle(stageDef.victoryLine, 2.8);
          }
        }
        return;
      }

      const anyAlive = this.enemies.some((e) => e.aiState !== 'dead');
      if (anyAlive) return;

      if (this.currentWaveIdx + 1 < stageDef.waves.length) {
        const nextZone = this.getZoneForWave(stageDef, this.currentWaveIdx + 1);
        if (this.corridorMode && this.arena.getUnlockedZone() < nextZone) {
          this.arena.setUnlockedZone(nextZone);
          this.audio.playDropChime('spirit');
          this.showStorySubtitle(`灵桥已开，前方即是「${this.arena.getZoneName(nextZone)}」！`, 2.4);
        }
        this.stagePhase = 'waveTransition';
        this.stageTimer = 1.2;
        this.spawnWorldCallout('剑桥已启 · 向前破阵!', this.hero.pos, 'info');
      } else {
        this.stagePhase = 'done';
        this.stageTimer = 1.1;
        this.audio.setMood('victory');
        if (stageDef.victoryLine) {
          this.showStorySubtitle(stageDef.victoryLine, 2.8);
        }
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

  private completeCurrentStage(skipEpilogue = false): void {
    for (const gear of this.vfx.collectAllGearDrops()) {
      this.saveStore.addRolledItem(gear);
      this.stageDroppedGear.push(gear);
    }

    const diff = getDifficultyTier(this.saveStore.getSelectedDifficulty());
    const combatRank = evaluateCombatRank(this.combatStylePeak);
    const rewardMult = diff.jadeMult * (1 + combatRank.jadeBonusPct);
    const curStageDef = this.getActiveStageDef();
    if (curStageDef.stageMode === 'defend' && this.mp.mode === 'offline') {
      this.saveStore.incrementStat('totalDefendWins', 1);
    }
    const monoRatio = this.monolithMaxHp > 0 ? this.monolithHp / this.monolithMaxHp : 1;

    if (this.activeTowerFloor) {
      const floor = this.activeTowerFloor;
      const starResult = evaluateStageStars(
        floor.stageDef,
        this.runElapsed,
        this.hero.hp / Math.max(1, this.hero.maxHp),
        this.hero.parryCount,
        monoRatio,
      );
      const { firstClear } = this.saveStore.recordTowerClear(floor.id, starResult.stars);
      const clearBonus = Math.round((firstClear ? floor.firstClearJade : floor.repeatJade) * rewardMult);
      this.hero.stageJadeEarned += clearBonus;
      this.saveStore.addJade(clearBonus);

      if (firstClear || diff.bonusGearDrop) {
        const dropTier: 1 | 2 | 3 = floor.tier;
        const pity = this.saveStore.advancePityAndCheck();
        const item = rollEquipmentDrop({
          tier: dropTier,
          guaranteedMinRarity: diff.bonusGearDrop && floor.guaranteedMinRarity === 'rare' ? 'epic' : floor.guaranteedMinRarity,
          pityTriggered: pity,
          source: `锁妖塔第${floor.id}层`,
          rng: this.rng,
        });
        this.saveStore.addRolledItem(item);
        this.stageDroppedGear.push(item);
      }
      this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
      this.mode = 'victory';
      this.hud.clearSubtitle();
      this.hud.setMode('victory');
      this.audio.playHeroVoice('victory');
      const nextFloorId = floor.id < TOWER_FLOORS.length ? floor.id + 1 : null;
      this.hud.showResult(true, this.runElapsed, this.hero, {
        stageDef: floor.stageDef,
        towerFloor: floor,
        nextTowerFloorId: nextFloorId,
        starResult,
        combatRank,
        droppedGear: this.stageDroppedGear.length > 0 ? [...this.stageDroppedGear] : undefined,
        jadeEarned: this.hero.stageJadeEarned,
      });
      return;
    }

    if (this.roguelikeState?.active) {
      const chIdx = clamp(this.roguelikeState.chamberIdx, 0, ROGUELIKE_CHAMBERS.length - 1);
      const ch = ROGUELIKE_CHAMBERS[chIdx];
      const isFinal = chIdx >= ROGUELIKE_CHAMBERS.length - 1;
      const greedBonus = this.roguelikeState.greedNext ? 120 : 0;
      const clearBonus = Math.round((ch.rewardJade + greedBonus) * rewardMult);
      this.hero.stageJadeEarned += clearBonus;
      this.roguelikeState.totalJade += clearBonus;
      this.saveStore.addJade(clearBonus);
      this.saveStore.recordRoguelikeProgress(ch.chamber, isFinal);

      if (ch.chamber >= 2 || this.roguelikeState.greedNext || isFinal) {
        const dropTier: 1 | 2 | 3 = ch.chamber >= 5 ? 3 : ch.chamber >= 3 ? 2 : 1;
        const item = rollEquipmentDrop({
          tier: dropTier,
          guaranteedMinRarity: this.roguelikeState.greedNext ? 'epic' : ch.guaranteedMinRarity,
          pityTriggered: isFinal || this.saveStore.advancePityAndCheck(),
          source: `幻境肉鸽·第${ch.chamber}境`,
          rng: this.rng,
        });
        this.saveStore.addRolledItem(item);
        this.stageDroppedGear.push(item);
      }
      this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
      this.mode = 'victory';
      this.hud.clearSubtitle();
      this.hud.setMode('victory');
      this.audio.playHeroVoice('victory');
      const rlChoices = !isFinal ? pickRoguelikeBlessings(this.rng, this.blessings.ids, 3) : undefined;
      this.hud.showResult(true, this.runElapsed, this.hero, {
        stageDef: ch.stageDef,
        roguelikeChamber: ch.chamber,
        roguelikeTotalChambers: ROGUELIKE_CHAMBERS.length,
        roguelikeBlessings: rlChoices,
        roguelikePaths: { ...this.blessings.pathCounts },
        combatRank,
        droppedGear: this.stageDroppedGear.length > 0 ? [...this.stageDroppedGear] : undefined,
        jadeEarned: this.hero.stageJadeEarned,
      });
      return;
    }

    if (this.activeDungeon) {
      const dungeon = this.activeDungeon;
      this.saveStore.recordDungeonClear(dungeon.id);
      this.saveStore.incrementStat('totalDungeons', 1);
      const clearBonus = Math.round(dungeon.jadeReward * rewardMult);
      this.hero.stageJadeEarned += clearBonus;
      this.saveStore.addJade(clearBonus);
      if (diff.bonusGearDrop) {
        const bonusGear = rollEquipmentDrop({
          tier: dungeon.tier,
          guaranteedMinRarity: 'epic',
          pityTriggered: this.saveStore.advancePityAndCheck(),
          source: `噩梦·${dungeon.name}`,
          rng: this.rng,
        });
        this.saveStore.addRolledItem(bonusGear);
        this.stageDroppedGear.push(bonusGear);
      }
      this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);

      this.mode = 'victory';
      this.hud.clearSubtitle();
      this.hud.setMode('victory');
      this.audio.playHeroVoice('victory');
      const opts: ResultDisplayOptions = {
        stageDef: dungeon.stageDef,
        dungeonDef: dungeon,
        combatRank,
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
      monoRatio,
    );
    const { firstClear } = this.saveStore.recordClear(stageDef.id, starResult.stars, this.runElapsed, this.hero.maxCombo);
    const baseBonus = 60 + stageDef.id * 16 + starResult.stars * 30 + (firstClear ? 90 : 0);
    const clearBonus = Math.round(baseBonus * rewardMult);
    this.hero.stageJadeEarned += clearBonus;
    this.saveStore.addJade(clearBonus);
    if (diff.bonusGearDrop && this.mp.mode === 'offline') {
      const bonusGear = rollEquipmentDrop({
        tier: stageDef.chapter >= 3 ? 3 : stageDef.chapter >= 2 ? 2 : 1,
        guaranteedMinRarity: 'epic',
        source: `噩梦第${stageDef.id}关`,
        rng: this.rng,
      });
      this.saveStore.addRolledItem(bonusGear);
      this.stageDroppedGear.push(bonusGear);
    }
    const maxStage = CAMPAIGN_STAGES.length;
    this.hud.syncCampaignProgress(this.saveStore, stageDef.id < maxStage ? stageDef.id + 1 : maxStage);

    const nextStageId = stageDef.id < maxStage ? stageDef.id + 1 : null;
    const blessingChoices = nextStageId && this.mp.mode === 'offline' ? pickBlessingChoices(this.rng, 3) : undefined;

    const opts: ResultDisplayOptions = {
      stageDef,
      starResult,
      combatRank,
      nextStageId: this.mp.mode === 'offline' ? nextStageId : null,
      blessingChoices,
      droppedGear: this.stageDroppedGear.length > 0 ? [...this.stageDroppedGear] : undefined,
      jadeEarned: this.hero.stageJadeEarned,
    };

    const epilogue = getChapterEpilogue(stageDef.id, this.saveStore.getSwordHeart());
    if (epilogue && this.mp.mode === 'offline') {
      this.saveStore.markEpilogueSeen(stageDef.id);
      this.lastEpilogueStageId = stageDef.id;
      this.lastEpilogueResultOpts = opts;
      if (!skipEpilogue) {
        this.pendingEpilogueResultOpts = opts;
        this.dialogueContext = 'epilogue';
        this.activeDialogueDef = epilogue;
        this.mode = 'dialogue';
        this.hud.clearSubtitle();
        this.audio.playDialogueStep(false);
        this.hud.showStageDialogue(epilogue);
        return;
      }
    }

    this.mode = 'victory';
    this.hud.clearSubtitle();
    this.hud.setMode('victory');
    this.audio.playHeroVoice('victory');
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
                : h.state === 'comboUlt' || h.state === 'skillR'
                  ? 'castR'
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
      this.enterStage(clamp(Math.floor(stageNum), 1, CAMPAIGN_STAGES.length), false, false);
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
      toBoss: () => this.startNewRun(true, CAMPAIGN_STAGES.length, false, true),
      toStage: (stage: number, jumpBoss = false) =>
        this.startNewRun(jumpBoss, clamp(Math.floor(stage), 1, CAMPAIGN_STAGES.length), false, true),
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
      openMap: (chapterId?: ChapterId) => this.hud.openCampaignMap(chapterId),
      clearCurrentStage: () => {
        for (const e of this.enemies) {
          if (e.aiState !== 'dead') this.killEnemy(e);
        }
        this.completeCurrentStage(true);
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
      getMinimapState: () => {
        const maxZone = this.arena.getMaxZone();
        const unlockedZone = this.arena.getUnlockedZone();
        const curZone = this.arena.getZoneIndexAtZ(this.hero.pos.z);
        return {
          corridorMode: this.corridorMode,
          zoneName: this.arena.getZoneName(curZone),
          progressPct: this.arena.getProgressPct(this.hero.pos.z),
          unlockedZone,
          maxZone,
          heroZ: this.hero.pos.z,
        };
      },
      getFallingSwordStats: () => this.vfx.getFallingSwordStats(),
      triggerComboUlt: () => {
        if (this.mode !== 'playing' && this.mode !== 'camp') return false;
        this.hero.comboSigils = ['A', 'Q', 'E'];
        this.hero.comboSigilTimer = 6.0;
        this.hero.comboUltReady = true;
        this.hero.comboUltTimer = 6.0;
        this.startComboUlt();
        this.hud.update(
          this.hero,
          this.mode === 'camp' ? '云来剑庐 · 自由演武' : this.getObjectiveLabel(),
          this.getActiveBoss(),
          this.peer,
          'none',
          this.buildTacticalState(),
        );
        return true;
      },
      getCanyonState: () => {
        const curZone = this.arena.getZoneIndexAtZ(this.hero.pos.z);
        const stage1EnemyHpSum = CAMPAIGN_STAGES[0].waves
          .flatMap((w) => w.enemies)
          .reduce((s, e) => s + Math.round(ENEMY_BASE_STATS[e.kind].hp * (e.hpMult ?? 1)), 0);
        return {
          zoneName: this.arena.getZoneName(curZone),
          inWater: this.arena.isInShallowWater(this.hero.pos),
          progressPct: this.arena.getProgressPct(this.hero.pos.z),
          sightline: this.arena.getSightlineStats(),
          stage1EnemyHpSum,
          liveWaveHpSum: this.enemies.reduce((s, e) => s + (e.aiState !== 'dead' ? e.maxHp : 0), 0),
        };
      },
      teleportToZone: (zIdx: 0 | 1 | 2) => {
        const maxZone = this.arena.getMaxZone();
        const clampedZone = clamp(Math.round(zIdx), 0, maxZone) as 0 | 1 | 2;
        if (this.arena.getUnlockedZone() < clampedZone) {
          this.arena.setUnlockedZone(clampedZone);
        }
        const zCenter = this.corridorMode ? this.arena.getZoneCenterZ(clampedZone) : 0;
        this.hero.pos.set(0, 0, zCenter);
        this.hero.rig.root.position.copy(this.hero.pos);
        this.rmbMoveTarget = null;
        this.cameraRig.snapTo(this.hero.pos);
        this.hud.update(
          this.hero,
          this.getObjectiveLabel(),
          this.getActiveBoss(),
          this.peer,
          'none',
          this.buildTacticalState(),
        );
        this.publishDiagnostics();
        return {
          zoneIdx: clampedZone,
          zoneName: this.arena.getZoneName(clampedZone),
          progressPct: this.arena.getProgressPct(this.hero.pos.z),
          heroZ: this.hero.pos.z,
        };
      },
    };

    const phaseMap: Record<ScreenMode, string> = {
      title: 'ready',
      dialogue: 'ready',
      paused: 'ready',
      playing: 'playing',
      cutscene: 'playing',
      camp: 'explore',
      world: 'explore',
      showcase: 'explore',
      victory: 'win',
      defeat: 'loss',
    };

    (window as unknown as Record<string, unknown>).__omGame = {
      getState: () => ({
        selfId: 'xiaoyao',
        players: {
          xiaoyao: {
            connected: true,
            x: Number(this.hero.pos.x.toFixed(3)),
            z: Number(this.hero.pos.z.toFixed(3)),
          },
        },
        phase: phaseMap[this.mode] ?? 'ready',
        mode: this.mode,
        biome: this.arena.getBiome(),
        stageId: this.currentStageId,
        zone: this.arena.getZoneIndexAtZ(this.hero.pos.z),
        mountMode: this.mountMode,
        heroY: Number(this.hero.rig.root.position.y.toFixed(3)),
        heroMaxHp: this.hero.maxHp,
        canvasResizeSteady: !this.pipeline.resize(false),
        arenaLayout: this.arena.getLayout(),
        worldRegion: this.mode === 'world' ? getWorldRegionAt(this.hero.pos.x, this.hero.pos.z).name : '',
        worldGuide: this.mode === 'world' ? this.resolveWorldGuideTarget() : null,
        stageMode: this.getActiveStageDef().stageMode ?? 'exterminate',
        leylineAffix: this.getActiveLeylineAffix(),
        difficulty: this.saveStore.getSelectedDifficulty(),
        monolithHp: this.monolithHp,
        monolithMaxHp: this.monolithMaxHp,
        surviveRemainSec: Number(this.surviveRemainSec.toFixed(2)),
        roguelikeChamber: this.roguelikeState?.active ? this.roguelikeState.chamberIdx + 1 : 0,
        roguelikePaths: { ...this.blessings.pathCounts },
        combatRank: evaluateCombatRank(this.combatStylePeak).rank,
        towerStars: this.saveStore.getTotalTowerStars(),
        stageCount: CAMPAIGN_STAGES.length,
        swordHeart: this.saveStore.getSwordHeart(),
        seenEpilogues: this.saveStore.getSeenEpilogues(),
        bossArchetypes: this.enemies
          .filter((e) => e.kind === 'boss' && e.aiState !== 'dead')
          .map((b) => b.bossArchetype ?? 'default'),
        worldProgress: this.saveStore.getWorldProgress(),
        worldBound: WORLD_BOUND,
        ancientMapOpen: this.ancientMap.isOpen(),
        rosterOpen: this.rosterOverlay.isOpen(),
        rosterFocusCharId: this.rosterOverlay.isOpen() ? this.rosterOverlay.getFocusedCharId() : '',
        shopPreviewActive: this.shopPreviewActive,
        shopPreviewCategory: this.hud.getActiveShopCategory(),
        shopEquippedSlotsCount: this.hud.getShopEquippedSlotsCount(),
        shopPreviewSkinId: this.shopPreviewSkinId,
        shopPreviewWeaponId: this.shopPreviewWeaponId,
        shopPreviewArmorId: this.shopPreviewArmorId,
        shopPreviewRelicId: this.shopPreviewRelicId,
        shopPreviewYaw: Number(this.shopPreviewYaw.toFixed(4)),
        shopPreviewPitch: Number(this.shopPreviewPitch.toFixed(4)),
        shopPreviewZoom: Number(this.shopPreviewZoom.toFixed(4)),
        shopPreviewAutoSpin: this.shopPreviewAutoSpin,
        shopTryOnCount: this.shopTryOnCount,
        shopLastTryOnEffect: this.shopLastTryOnEffect,
        mobileNotifyText: this.hud.getMobileNotifyText(),
        worldInCombat: this.worldInCombat,
        worldAutoNav: this.worldAutoNav,
        worldAutoNavPolicy: this.worldAutoNavPolicy,
        worldAutoCombatActive: this.worldAutoCombatActive,
        worldAutoNavPausedByCombat: this.worldAutoNavPausedByCombat,
        worldLastCombatNotice: this.worldLastCombatNotice,
        settingsOpen: this.hud.isSettingsOpen(),
        craftOpen: this.craftOverlay.isOpen(),
        visualSettings: { ...this.visualSettings },
        materials: this.saveStore.getMaterials(),
        elixirBonus: this.saveStore.getElixirBonus(),
        worldHerbCount: WORLD_HERB_NODES.length,
      }),
      getStats: () => {
        const stats = this.pipeline.getStats();
        return {
          drawCalls: stats.calls,
          triangles: stats.triangles,
          geometries: stats.geometries,
          entities: this.enemies.length,
          biome: this.arena.getBiome(),
          episodeNum: this.mode === 'camp' ? 0 : this.getActiveStageDef().episodeNum,
        };
      },
      sendAction: (action: string) => {
        if (action === 'enterCamp') {
          this.enterCampMode();
          this.pipeline.render();
          this.publishDiagnostics();
          return true;
        }
        if (action === 'enterWorld') {
          this.enterOpenWorldMode();
          this.pipeline.render();
          this.publishDiagnostics();
          return true;
        }
        if (action.startsWith('mount:')) {
          const m = action.slice('mount:'.length) as MountMode;
          if (m === 'none') {
            this.setMountMode('none', true);
          } else if (m === 'horse' || m === 'sword') {
            this.setMountMode(m);
            this.stepFrame(0.05, true);
          } else {
            return false;
          }
          this.pipeline.render();
          this.publishDiagnostics();
          return true;
        }
        if (action === 'worldInteract') {
          const ok = this.triggerWorldInteract();
          this.pipeline.render();
          this.publishDiagnostics();
          return ok;
        }
        if (action === 'spawnWorldEvent') {
          const id = this.spawnWorldTreasureEvent();
          this.pipeline.render();
          this.publishDiagnostics();
          return id !== null;
        }
        if (action === 'collectNearestOrb') {
          if (this.mode !== 'world') return false;
          const orb = WORLD_SPIRIT_ORBS.find((o) => !this.saveStore.isWorldOrbCollected(o.id)) ?? WORLD_SPIRIT_ORBS[0];
          if (!orb) return false;
          const ok = this.collectWorldOrb(orb.id);
          this.pipeline.render();
          this.publishDiagnostics();
          return ok;
        }
        if (action === 'worldOpenNearestChest') {
          if (this.mode !== 'world') return false;
          const nextChest = WORLD_CHESTS.find((c) => !this.saveStore.isWorldChestOpened(c.id)) ?? WORLD_CHESTS[0];
          if (!nextChest) return false;
          this.hero.pos.set(nextChest.x, 0, nextChest.z + 1.5);
          this.hero.rig.root.position.x = this.hero.pos.x;
          this.hero.rig.root.position.z = this.hero.pos.z;
          const ok = this.triggerWorldInteract({ kind: 'chest', id: nextChest.id });
          this.pipeline.render();
          this.publishDiagnostics();
          return ok;
        }
        if (action.startsWith('worldTeleport:')) {
          const wpId = action.slice('worldTeleport:'.length);
          if (wpId !== 'wp_center' && !this.saveStore.isWorldWaypointLit(wpId)) {
            this.triggerWorldInteract({ kind: 'waypoint', id: wpId });
          }
          const ok = this.teleportToWorldWaypoint(wpId);
          this.pipeline.render();
          this.publishDiagnostics();
          return ok;
        }
        if (action === 'worldRespawnBosses') {
          this.respawnAllWorldBosses();
          this.pipeline.render();
          this.publishDiagnostics();
          return true;
        }
        if (action === 'worldCycleGuide') {
          this.cycleWorldGuideCategory();
          this.stepFrame(0.05, true);
          return true;
        }
        if (action === 'worldToggleAutoNav') {
          this.toggleWorldAutoNav();
          this.stepFrame(0.05, true);
          return true;
        }
        if (action === 'openAncientMap') {
          this.openAncientMapOverlay();
          return true;
        }
        if (action === 'closeAncientMap') {
          this.ancientMap.close();
          return true;
        }
        if (action === 'openRoster') {
          this.openRosterOverlay('char_xiaoyao');
          return true;
        }
        if (action.startsWith('openRoster:')) {
          const charId = action.slice('openRoster:'.length);
          this.openRosterOverlay(charId || 'char_xiaoyao');
          return true;
        }
        if (action === 'closeRoster') {
          this.rosterOverlay.close();
          return true;
        }
        if (action.startsWith('worldNavigateTo:')) {
          const parts = action.slice('worldNavigateTo:'.length).split(',');
          const nx = Number(parts[0]);
          const nz = Number(parts[1]);
          if (!Number.isFinite(nx) || !Number.isFinite(nz)) return false;
          this.startWorldCustomNavigation(nx, nz, '舆图标点');
          this.stepFrame(0.05, true);
          return true;
        }
        if (action.startsWith('previewSkin:')) {
          const skinId = action.slice('previewSkin:'.length);
          this.setShopPreview(true, skinId, null, null, null, { category: 'skin', itemId: skinId });
          this.stepFrame(0.05, true);
          return true;
        }
        if (action === 'closeShopPreview') {
          this.setShopPreview(false);
          this.stepFrame(0.05, true);
          return true;
        }
        if (action === 'toggleShopZoom') {
          this.shopPreviewZoomTarget = this.shopPreviewZoomTarget > 0.45 ? 0 : 1;
          this.hud.setShopPreviewZoomState(this.shopPreviewZoomTarget > 0.45);
          this.stepFrame(0.05, true);
          return true;
        }
        if (action.startsWith('rotateShopPreview:')) {
          const parts = action.slice('rotateShopPreview:'.length).split(',');
          const dYaw = Number(parts[0] ?? 0);
          const dPitch = Number(parts[1] ?? 0);
          if (!Number.isFinite(dYaw) || !Number.isFinite(dPitch)) return false;
          this.shopPreviewAutoSpin = false;
          this.hud.setShopPreviewSpinState(false);
          this.shopPreviewYaw += dYaw;
          this.shopPreviewPitch = clamp(this.shopPreviewPitch + dPitch, -0.28, 0.34);
          this.shopPreviewYawVel = 0;
          this.stepFrame(0.05, true);
          return true;
        }
        if (action.startsWith('setAutoNavPolicy:')) {
          const pol = action.slice('setAutoNavPolicy:'.length);
          if (pol !== 'fight' && pol !== 'evade') return false;
          this.applyVisualSettings({ autoNavPolicy: pol }, true);
          return true;
        }
        if (action === 'openSettings') {
          this.hud.openSettings();
          return true;
        }
        if (action === 'closeSettings') {
          this.hud.closeSettings();
          return true;
        }
        if (action === 'openCraft' || action === 'openCraft:elixir' || action === 'openCraft:forge') {
          const tab = action === 'openCraft:forge' ? 'forge' : 'elixir';
          this.openCraftOverlay(tab);
          return true;
        }
        if (action === 'closeCraft') {
          this.craftOverlay.close();
          return true;
        }
        if (action.startsWith('brewElixir:')) {
          const elixirId = action.slice('brewElixir:'.length);
          const res = this.brewAndConsumeElixir(elixirId);
          this.pipeline.render();
          this.publishDiagnostics();
          return res.ok;
        }
        if (action.startsWith('craftGear:')) {
          const recipeId = action.slice('craftGear:'.length);
          const res = this.craftGearFromRecipe(recipeId);
          this.pipeline.render();
          this.publishDiagnostics();
          return res.ok;
        }
        if (action.startsWith('grantMaterials:')) {
          const parts = action.slice('grantMaterials:'.length).split(',');
          const matId = parts[0]?.trim();
          const qty = Math.max(1, Math.round(Number(parts[1] ?? 1)));
          if (!matId || !Number.isFinite(qty)) return false;
          this.saveStore.addMaterial(matId, qty);
          if (this.craftOverlay.isOpen()) this.craftOverlay.refresh(this.saveStore);
          return true;
        }
        if (action === 'harvestNearestHerb') {
          if (this.mode !== 'world') {
            this.enterOpenWorldMode();
          }
          const h = this.hero.pos;
          let best: WorldHerbNodeDef | null = null;
          let bestDist = Infinity;
          for (const node of WORLD_HERB_NODES) {
            if (this.worldHerbTimers.has(node.id)) continue;
            const d = Math.hypot(node.x - h.x, node.z - h.z);
            if (d < bestDist) {
              bestDist = d;
              best = node;
            }
          }
          if (!best) return false;
          this.hero.pos.set(best.x, 0, best.z + 1.2);
          this.arena.constrainPosition(this.hero.pos, this.hero.radius);
          this.hero.rig.root.position.set(this.hero.pos.x, 0, this.hero.pos.z);
          const ok = this.harvestWorldHerb(best.id);
          this.pipeline.render();
          this.publishDiagnostics();
          return ok;
        }
        if (action.startsWith('teleportNearCamp:')) {
          const campId = action.slice('teleportNearCamp:'.length);
          const camp = WORLD_MOB_CAMPS.find((c) => c.id === campId);
          if (!camp) return false;
          if (this.mode !== 'world') {
            this.enterOpenWorldMode();
          }
          this.worldMobTimers.delete(camp.id);
          this.spawnWorldMobCamp(camp);
          this.setMountMode('none', true);
          this.worldAutoNav = false;
          this.worldAutoCombatActive = false;
          this.worldAutoResumeTimer = 0;
          this.worldCustomNavTarget = null;
          this.rmbMoveTarget = null;
          // Place hero 7.6m toward origin from camp center (within both fight <=9.5m & evade <=12m radii!)
          const toCenterLen = Math.max(1, Math.hypot(camp.x, camp.z));
          const sx = camp.x - (camp.x / toCenterLen) * 7.6;
          const sz = camp.z - (camp.z / toCenterLen) * 7.6;
          this.hero.pos.set(sx, 0, sz);
          this.arena.constrainPosition(this.hero.pos, this.hero.radius);
          this.hero.yaw = Math.atan2(camp.x - this.hero.pos.x, camp.z - this.hero.pos.z);
          this.hero.rig.root.position.copy(this.hero.pos);
          this.hero.rig.root.rotation.y = this.hero.yaw;
          this.hero.hp = this.hero.maxHp;
          this.hero.delayedHp = this.hero.maxHp;
          this.hero.spirit = this.hero.maxSpirit;
          this.cameraRig.snapTo(this.hero.pos);
          this.pipeline.render();
          this.publishDiagnostics();
          return true;
        }
        if (action.startsWith('applyTheme:')) {
          const theme = action.slice('applyTheme:'.length) as AtmosphereThemeId;
          if (
            theme !== 'moonlit' &&
            theme !== 'ink_frost' &&
            theme !== 'golden_dawn' &&
            theme !== 'astral_violet'
          ) {
            return false;
          }
          this.applyVisualSettings({ atmosphereTheme: theme }, true);
          this.pipeline.render();
          this.publishDiagnostics();
          return true;
        }
        if (action.startsWith('switchBiome:')) {
          const raw = action.slice('switchBiome:'.length) as WorldBiome;
          if (!Object.prototype.hasOwnProperty.call(BIOME_LABELS, raw)) return false;
          this.arena.setBiome(raw);
          this.applyBiomeAtmosphere(raw, getChapterDef(this.getActiveStageDef().chapter));
          this.pipeline.render();
          this.publishDiagnostics();
          return true;
        }
        if (action.startsWith('startEpisode:')) {
          const ep = clamp(Math.round(Number(action.slice('startEpisode:'.length))), 1, CAMPAIGN_STAGES.length);
          if (!Number.isFinite(ep)) return false;
          this.mp.leave();
          this.clearPeerHero();
          this.hud.setMpHudBadge('');
          this.hud.setHeroName('李逍遥');
          this.blessings = createEmptyBlessings();
          this.startNewRun(false, ep, false, false);
          this.pipeline.render();
          this.publishDiagnostics();
          return true;
        }
        if (action === 'openCodex') {
          this.hud.openStoryCodex();
          return true;
        }
        if (action.startsWith('replayEpilogue:')) {
          const epId = Math.round(Number(action.slice('replayEpilogue:'.length)));
          const dlg = getChapterEpilogue(epId, this.saveStore.getSwordHeart());
          if (!dlg) return false;
          this.dialogueContext = 'replay';
          this.activeDialogueDef = { ...dlg, mode: 'replay', confirmLabel: '收卷 · 返回剧情志' };
          this.mode = 'dialogue';
          this.hud.showStageDialogue(this.activeDialogueDef);
          return true;
        }
        if (action === 'confirmDialogue') {
          const ok = this.confirmStageDialogue();
          this.pipeline.render();
          this.publishDiagnostics();
          return ok;
        }
        if (action.startsWith('interactCamp:')) {
          const spot = action.slice('interactCamp:'.length) as 'wine' | 'ally' | 'mat' | 'tea';
          const ok = this.triggerCampHotspotInteract(spot);
          this.pipeline.render();
          this.publishDiagnostics();
          return ok;
        }
        if (action === 'openEpilogue') {
          this.currentStageId = 20;
          const s20 = getStageDef(20);
          const starRes = evaluateStageStars(s20, 62, 0.9, 4);
          this.lastEpilogueResultOpts = {
            stageDef: s20,
            starResult: starRes,
            nextStageId: null,
            jadeEarned: 470,
          };
          this.pendingEpilogueResultOpts = this.lastEpilogueResultOpts;
          this.dialogueContext = 'epilogue';
          this.activeDialogueDef = STAGE_20_EPILOGUE;
          this.mode = 'dialogue';
          this.hud.showStageDialogue(STAGE_20_EPILOGUE);
          this.pipeline.render();
          this.publishDiagnostics();
          return true;
        }
        if (action.startsWith('startTower:')) {
          const fl = clamp(Math.round(Number(action.slice('startTower:'.length))), 1, TOWER_FLOORS.length);
          this.startTowerFloor(fl);
          this.pipeline.render();
          this.publishDiagnostics();
          return true;
        }
        if (action === 'startRoguelike') {
          this.startRoguelikeRun();
          this.pipeline.render();
          this.publishDiagnostics();
          return true;
        }
        if (action.startsWith('advanceRoguelike')) {
          const greed = action.includes(':greed');
          const firstBlessing = ROGUELIKE_BLESSINGS[0]?.id;
          this.advanceRoguelikeChamber(firstBlessing, greed);
          this.pipeline.render();
          this.publishDiagnostics();
          return true;
        }
        if (action.startsWith('setDifficulty:')) {
          const d = action.slice('setDifficulty:'.length) as DifficultyTierId;
          if (d !== 'normal' && d !== 'hard' && d !== 'nightmare') return false;
          this.saveStore.setSelectedDifficulty(d);
          this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
          return true;
        }
        if (action.startsWith('claimChapterChest:')) {
          const cid = action.slice('claimChapterChest:'.length);
          const res = this.saveStore.claimChapterChest(cid);
          this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
          return res.ok;
        }
        if (action.startsWith('claimTowerChest:')) {
          const req = Math.round(Number(action.slice('claimTowerChest:'.length)));
          const res = this.saveStore.claimTowerChest(req);
          this.hud.syncCampaignProgress(this.saveStore, this.currentStageId);
          return res.ok;
        }
        if (action.startsWith('openTrialsHub:')) {
          const tab = action.slice('openTrialsHub:'.length) as 'tower' | 'roguelike' | 'dungeon';
          this.hud.openTrialsHub(tab === 'roguelike' || tab === 'dungeon' ? tab : 'tower');
          return true;
        }
        if (action === 'forceWinStage' || action === 'forceWinStage:epilogue') {
          for (const e of this.enemies) {
            if (e.aiState !== 'dead') e.aiState = 'dead';
          }
          this.completeCurrentStage(action !== 'forceWinStage:epilogue');
          this.pipeline.render();
          this.publishDiagnostics();
          return true;
        }
        if (action === 'hitDummy') {
          const dummy = this.enemies.find((e) => e.isDummy && e.aiState !== 'dead');
          if (!dummy) return false;
          const dx = dummy.pos.x - this.hero.pos.x;
          const dz = dummy.pos.z - this.hero.pos.z;
          const dist = Math.hypot(dx, dz);
          this.hero.yaw = dist > 0.05 ? Math.atan2(dx, dz) : this.hero.yaw;
          if (dist > 2.2) {
            const stand = 1.65;
            this.hero.pos.set(
              dummy.pos.x - Math.sin(this.hero.yaw) * stand,
              0,
              dummy.pos.z - Math.cos(this.hero.yaw) * stand,
            );
            this.hero.rig.root.position.copy(this.hero.pos);
          }
          this.hero.rig.root.rotation.y = this.hero.yaw;
          this.applyHeroAttackToEnemy(
            dummy,
            Math.round(68 * this.getHeroDamageScale()),
            true,
            this.hero.yaw,
            28,
            true,
            'combo1',
          );
          this.stepFrame(1 / 60, true);
          return true;
        }
        return false;
      },
      runSelfTests: () => {
        const prevBiome = this.arena.getBiome();
        const allBiomes: WorldBiome[] = [
          'bamboo_canyon',
          'peach_shrine',
          'sword_graveyard',
          'lava_abyss',
          'celestial_sanctum',
          'astral_void',
          'haven_camp',
        ];
        const stageBiomes = new Set(CAMPAIGN_STAGES.map((s) => s.biome));
        let biomeSwitchOk = stageBiomes.size >= 6;
        const propCounts: number[] = [];
        for (const b of allBiomes) {
          this.arena.setBiome(b);
          if (this.arena.getBiome() !== b) biomeSwitchOk = false;
          propCounts.push(this.arena.getSightlineStats().activeBiomeProps);
        }
        this.arena.setBiome(prevBiome);

        const sl = this.arena.getSightlineStats();
        const sightlinePass =
          sl.centerBeamCount === 0 &&
          sl.occludableCount >= 12 &&
          (!this.corridorMode || (sl.waterMeshCount >= 2 && sl.canyonCliffCount >= 6));

        const lv = this.saveStore.getCultivationLevel();
        const stepsValid =
          CULTIVATION_STEPS.length === 10 &&
          CULTIVATION_STEPS.every(
            (st, idx) =>
              st.level === idx &&
              Number.isFinite(st.costJade) &&
              st.costJade >= 0 &&
              Number.isFinite(st.hpBonus) &&
              Number.isFinite(st.atkPct),
          );
        const mealsValid = CAMP_MEALS.length >= 3 && CAMP_MEALS.some((m) => m.costJade === 0);
        const campPass = stepsValid && mealsValid && lv >= 0 && lv < CULTIVATION_STEPS.length;

        const heroFinite =
          Number.isFinite(this.hero.pos.x) &&
          Number.isFinite(this.hero.pos.z) &&
          Number.isFinite(this.hero.hp) &&
          Number.isFinite(this.hero.maxHp) &&
          this.hero.maxHp > 0;
        const liveEnemiesFinite = this.enemies.every(
          (e) =>
            Number.isFinite(e.pos.x) &&
            Number.isFinite(e.pos.z) &&
            Number.isFinite(e.hp) &&
            Number.isFinite(e.maxHp) &&
            e.maxHp > 0,
        );
        const stagesFinite = CAMPAIGN_STAGES.every((st) =>
          st.waves.every((w) => w.enemies.every((sp) => Number.isFinite(sp.x) && Number.isFinite(sp.z))),
        );
        const enemiesPass = heroFinite && liveEnemiesFinite && stagesFinite;

        const stage1Hp = CAMPAIGN_STAGES[0].waves
          .flatMap((w) => w.enemies)
          .reduce((s, e) => s + Math.round(ENEMY_BASE_STATS[e.kind].hp * (e.hpMult ?? 1)), 0);
        const stageFinalHp = CAMPAIGN_STAGES[CAMPAIGN_STAGES.length - 1].waves
          .flatMap((w) => w.enemies)
          .reduce((s, e) => s + Math.round(ENEMY_BASE_STATS[e.kind].hp * (e.hpMult ?? 1)), 0);
        const diffPass = stage1Hp >= 1200 && stageFinalHp > stage1Hp;

        const allStoryIds = [...CAMPAIGN_STAGES.map((s) => s.id), 101, 102, 103, 104];
        const scriptsPresent = allStoryIds.every((id) => {
          const sc = EPISODE_STORY_SCRIPTS[id];
          return (
            Boolean(sc) &&
            sc.lines.length >= 3 &&
            sc.choices.length === 2 &&
            Boolean(sc.choices[0].heroReply) &&
            Boolean(sc.choices[1].heroReply) &&
            !sc.lines.some((l) => l.role === 'enemy' && l.text.startsWith(`${l.speaker.split('·')[0].trim()}`))
          );
        });
        const epilogueOk = [5, 10, 15, 20, 25].every(
          (sid) => Boolean(CHAPTER_EPILOGUES[sid]) && CHAPTER_EPILOGUES[sid].lines.length >= 3,
        );
        const campNpcOk = this.campNpcGroup !== null;

        const bossArchetypes = new Set(
          CAMPAIGN_STAGES.flatMap((s) => s.waves.flatMap((w) => w.enemies.map((sp) => sp.bossArchetype))).filter(Boolean),
        );
        const stageLayouts = new Set(CAMPAIGN_STAGES.map((s) => s.stageLayout).filter(Boolean));
        const mountsAndOpenWorldOk =
          WORLD_BOUND >= 78 &&
          WORLD_WAYPOINTS.length >= 5 &&
          WORLD_CHESTS.length >= 8 &&
          WORLD_SPIRIT_ORBS.length >= 8 &&
          WORLD_BOSS_SPAWNS.length >= 5 &&
          WORLD_MOB_CAMPS.length >= 5 &&
          bossArchetypes.size >= 5 &&
          stageLayouts.has('pillars') &&
          stageLayouts.has('islands');

        const stageModesSeen = new Set(
          [...CAMPAIGN_STAGES, ...TOWER_FLOORS.map((f) => f.stageDef), ...ROGUELIKE_CHAMBERS.map((c) => c.stageDef)]
            .map((s) => s.stageMode ?? 'exterminate'),
        );
        const commercialModesOk =
          TOWER_FLOORS.length === 9 &&
          ROGUELIKE_CHAMBERS.length === 6 &&
          ROGUELIKE_BLESSINGS.length >= 12 &&
          stageModesSeen.has('defend') &&
          stageModesSeen.has('survive') &&
          stageModesSeen.has('bossRush');

        return {
          biomesDistinct: {
            pass: biomeSwitchOk,
            detail: `stageBiomes=${stageBiomes.size}, switched=${allBiomes.length}, props=[${propCounts.join(',')}]`,
          },
          sightlineClean: {
            pass: sightlinePass,
            detail: `centerBeams=${sl.centerBeamCount}, occludables=${sl.occludableCount}, water=${sl.waterMeshCount}, cliffs=${sl.canyonCliffCount}`,
          },
          campCultivationBounded: {
            pass: campPass,
            detail: `lv=${lv}/${CULTIVATION_STEPS.length - 1}, meals=${CAMP_MEALS.length}`,
          },
          enemiesFinite: {
            pass: enemiesPass,
            detail: `heroFinite=${heroFinite}, liveCount=${this.enemies.length}, stages=${CAMPAIGN_STAGES.length}`,
          },
          stageDifficultyBuffed: {
            pass: diffPass,
            detail: `stage1Hp=${stage1Hp}, stage25Hp=${stageFinalHp}`,
          },
          storyScriptsValid: {
            pass: scriptsPresent && epilogueOk,
            detail: `scripts=${allStoryIds.length}, epilogues=5, campNpcInit=${campNpcOk}`,
          },
          mountsAndOpenWorldValid: {
            pass: mountsAndOpenWorldOk,
            detail: `wp=${WORLD_WAYPOINTS.length}, chests=${WORLD_CHESTS.length}, orbs=${WORLD_SPIRIT_ORBS.length}, wb=${WORLD_BOSS_SPAWNS.length}, archetypes=${bossArchetypes.size}`,
          },
          commercialModesValid: {
            pass: commercialModesOk,
            detail: `tower=${TOWER_FLOORS.length}, rlChambers=${ROGUELIKE_CHAMBERS.length}, rlBlessings=${ROGUELIKE_BLESSINGS.length}, modes=[${Array.from(stageModesSeen).join(',')}]`,
          },
        };
      },
    };
  }

  private buildTacticalState(): HudTacticalState {
    const h = this.hero;
    const maxZone = this.arena.getMaxZone();
    const unlockedZone = this.arena.getUnlockedZone();
    const curZone = this.arena.getZoneIndexAtZ(h.pos.z);
    const zMax = this.arena.playableRadius;
    const zMin = this.corridorMode
      ? this.arena.getZoneCenterZ(maxZone) - this.arena.playableRadius
      : -this.arena.playableRadius;
    const dots: MinimapEntityDot[] = [];
    for (const e of this.enemies) {
      if (e.aiState === 'dead') continue;
      dots.push({
        x: e.pos.x,
        z: e.pos.z,
        kind: e.kind === 'boss' ? 'boss' : e.kind === 'elite' ? 'elite' : 'enemy',
      });
    }
    if (this.peer && !this.peer.dead && !this.peer.isEnemy) {
      dots.push({ x: this.peer.pos.x, z: this.peer.pos.z, kind: 'ally' });
    }
    for (const d of this.vfx.drops) {
      if (d.kind === 'gear') {
        dots.push({ x: d.pos.x, z: d.pos.z, kind: 'loot' });
      }
    }
    const isWorld = this.mode === 'world';
    return {
      corridorMode: this.corridorMode,
      openWorldMode: isWorld,
      mountMode: this.mountMode,
      worldWaypoints: isWorld
        ? WORLD_WAYPOINTS.map((wp) => ({
            x: wp.x,
            z: wp.z,
            lit: this.saveStore.isWorldWaypointLit(wp.id),
          }))
        : undefined,
      worldChests: isWorld
        ? WORLD_CHESTS.map((ch) => ({
            x: ch.x,
            z: ch.z,
            opened: this.saveStore.isWorldChestOpened(ch.id),
          }))
        : undefined,
      worldOrbs: isWorld
        ? WORLD_SPIRIT_ORBS.map((o) => ({
            x: o.x,
            z: o.z,
            collected: this.saveStore.isWorldOrbCollected(o.id),
          }))
        : undefined,
      worldHerbs: isWorld
        ? WORLD_HERB_NODES.map((n) => ({
            x: n.x,
            z: n.z,
            ready: !this.worldHerbTimers.has(n.id),
            accentHex: n.accentHex,
          }))
        : undefined,
      worldEventPos: isWorld && this.worldEventEnemyId !== null
        ? (() => {
            const ev = this.enemies.find((x) => x.id === this.worldEventEnemyId && x.aiState !== 'dead');
            return ev ? { x: ev.pos.x, z: ev.pos.z } : null;
          })()
        : null,
      worldGuideTarget: isWorld
        ? (() => {
            const g = this.resolveWorldGuideTarget();
            return g ? { x: g.x, z: g.z, label: g.label, kind: g.kind } : null;
          })()
        : null,
      biome: this.arena.getBiome(),
      heroX: h.pos.x,
      heroZ: h.pos.z,
      heroYaw: h.yaw,
      zMax,
      zMin,
      maxZone,
      unlockedZone,
      zoneName: isWorld ? getWorldRegionAt(h.pos.x, h.pos.z).name : this.arena.getZoneName(curZone),
      progressPct: this.arena.getProgressPct(h.pos.z),
      dots,
      q2Ready: h.q2ReadyTimer > 0,
      comboSigils: [...h.comboSigils],
      comboUltReady: h.comboUltReady,
      comboUltTimer: h.comboUltTimer,
      stageMode: this.getActiveStageDef().stageMode ?? 'exterminate',
      leylineAffix: this.getActiveLeylineAffix(),
      difficultyShort: getDifficultyTier(this.saveStore.getSelectedDifficulty()).shortLabel,
      monolithHp: this.monolithHp,
      monolithMaxHp: this.monolithMaxHp,
      surviveRemainSec: this.surviveRemainSec,
      heroInLeylineZone: this.heroInLeylineZone,
      leylineZoneActive: this.leylineZoneActive,
      roguelikePaths: { ...this.blessings.pathCounts },
      combatStyleScore: this.combatStyleScore,
      combatRank: evaluateCombatRank(this.combatStyleScore),
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

import iconYujian from '../assets/icon-yujian.jpg';
import iconWanjian from '../assets/icon-wanjian.jpg';
import iconTianjian from '../assets/icon-tianjian.jpg';
import iconHulu from '../assets/icon-hulu.jpg';
import medalAttack from '../assets/medal-attack.jpg';
import medalDodge from '../assets/medal-dodge.jpg';
import medalParry from '../assets/medal-parry.jpg';
import type { HeroState, EnemyEntity, PeerHeroState } from '../game/CombatEntities';
import {
  BIOME_LABELS,
  CAMPAIGN_STAGES,
  CAMP_MEALS,
  CHAPTERS,
  CULTIVATION_STEPS,
  DUNGEON_LIST,
  type BlessingDef,
  type CampaignSaveStore,
  type ChapterId,
  type DungeonDef,
  type EpisodeChoiceDef,
  type StageDef,
  type StageDialogueDef,
  getChapterDef,
  getStageDef,
  getSwordHeartSummary,
  getSwordRealm,
} from '../game/CampaignData';
import { CHAPTER_EPILOGUES } from '../game/StoryScripts';
import {
  CHAPTER_STAR_CHESTS,
  DIFFICULTY_TIERS,
  LEYLINE_AFFIX_MAP,
  ROGUELIKE_PATHS,
  STAGE_MODE_LABELS,
  TOWER_FLOORS,
  TOWER_STAR_CHESTS,
  type CombatStyleRankInfo,
  type DifficultyTierId,
  type LeylineAffixId,
  type RoguelikeBlessingDef,
  type RoguelikePathId,
  type StageMode,
  type TowerFloorDef,
} from '../game/EndgameData';
import type { WorldBiome } from '../world/ShushanArena';
import type { MountMode } from '../entities/MountRig';
import {
  WORLD_BOSS_SPAWNS,
  WORLD_BOUND,
  WORLD_CHESTS,
  WORLD_SPIRIT_ORBS,
  WORLD_WAYPOINTS,
} from '../game/OpenWorldData';
import {
  CATEGORY_LABELS,
  type EquipCategory,
  type EquipRarity,
  MAX_FORGE_LEVEL,
  MAX_INVENTORY_SIZE,
  RARITY_LABELS,
  type RolledGearItem,
  SHOP_ITEMS,
  SHOP_ITEM_MAP,
  type ShopItemStats,
  computeCombatPower,
  computeHeroLoadoutStats,
  getRolledItemStats,
  getRolledUpgradeCost,
  getSalvageJade,
  getUpgradeCost,
} from '../game/EquipmentData';
import { clamp } from '../utils/math';
import { isPureMobileDevice } from '../core/NativeBridge';
import { APP_VERSION } from '../version';

export type ScreenMode =
  | 'title'
  | 'camp'
  | 'world'
  | 'dialogue'
  | 'playing'
  | 'cutscene'
  | 'paused'
  | 'victory'
  | 'defeat'
  | 'showcase';

export type CombatThreatState = 'none' | 'parryable' | 'unblockable';

export interface MinimapEntityDot {
  x: number;
  z: number;
  kind: 'enemy' | 'elite' | 'boss' | 'loot' | 'ally';
}

export interface HudTacticalState {
  corridorMode: boolean;
  openWorldMode?: boolean;
  mountMode?: MountMode;
  worldWaypoints?: Array<{ x: number; z: number; lit: boolean }>;
  worldChests?: Array<{ x: number; z: number; opened: boolean }>;
  worldOrbs?: Array<{ x: number; z: number; collected: boolean }>;
  worldEventPos?: { x: number; z: number } | null;
  worldGuideTarget?: { x: number; z: number; label: string; kind: 'event' | 'waypoint' | 'chest' | 'orb' | 'boss' } | null;
  biome?: WorldBiome;
  heroX: number;
  heroZ: number;
  heroYaw: number;
  zMax: number;
  zMin: number;
  maxZone: 0 | 1 | 2;
  unlockedZone: 0 | 1 | 2;
  zoneName: string;
  progressPct: number;
  dots: MinimapEntityDot[];
  q2Ready: boolean;
  comboSigils: Array<'A' | 'Q' | 'E' | 'D'>;
  comboUltReady: boolean;
  comboUltTimer: number;
  stageMode?: StageMode;
  leylineAffix?: LeylineAffixId;
  difficultyShort?: string;
  monolithHp?: number;
  monolithMaxHp?: number;
  surviveRemainSec?: number;
  heroInLeylineZone?: boolean;
  leylineZoneActive?: boolean;
  roguelikePaths?: Record<RoguelikePathId, number>;
  combatStyleScore?: number;
  combatRank?: CombatStyleRankInfo;
}

export interface HudCallbacks {
  onStart: (stageId: number) => void;
  onConfirmDialogue: (choiceId?: string) => void;
  onDialogueChoiceSelect?: (choiceId: string) => void;
  onEnterCamp: () => void;
  onEnterOpenWorld?: () => void;
  onToggleMount?: (mode: Exclude<MountMode, 'none'>) => void;
  onWorldInteract?: () => void;
  onWorldTeleport?: (waypointId: string) => void;
  onWorldRespawnBosses?: () => void;
  onWorldCycleGuide?: () => void;
  onWorldToggleAutoNav?: () => void;
  onCampInteract?: () => void;
  onLeaveCampToEpisode: (stageId: number) => void;
  onCampCultivate: () => { ok: boolean; level: number; reason: string };
  onCampSelectMeal: (mealId: string) => { ok: boolean; reason: string };
  onNextStage: (nextStageId: number, selectedBlessingId?: string) => void;
  onReplayEpilogue?: () => void;
  onRetry: () => void;
  onBackToTitle: () => void;
  onToggleMute: () => boolean;
  onTogglePause: () => void;
  onToggleLolMode: () => boolean;
  onMpCreate: (mode: 'coop' | 'solo', stageId: number) => void;
  onMpJoin: (code: string) => void;
  onMpQuick: (mode: 'coop' | 'solo', stageId: number) => void;
  onMpLeave: () => void;
  onShopBuy: (itemId: string) => { ok: boolean; reason: string };
  onShopEquip: (itemId: string) => boolean;
  onShopUpgrade: (itemId: string) => { ok: boolean; level: number; reason: string };
  onStartDungeon: (dungeonId: string) => void;
  onEquipRolled: (uid: string) => boolean;
  onUpgradeRolled: (uid: string) => { ok: boolean; level: number; reason: string };
  onSalvageRolled: (uid: string) => { ok: boolean; jade: number; reason: string };
  onSalvageLow: (maxRarity: 'common' | 'rare') => { count: number; jade: number };
  onClaimBounty: (bountyId: string) => { ok: boolean; jade: number; droppedItem?: RolledGearItem; reason: string };
  onCastComboUlt?: () => void;
  onStartTower?: (floorNum: number) => void;
  onStartRoguelike?: () => void;
  onAdvanceRoguelike?: (selectedBlessingId?: string, greedPact?: boolean) => void;
  onSetDifficulty?: (diff: DifficultyTierId) => void;
  onClaimChapterChest?: (chestId: string) => { ok: boolean; jade: number; droppedItem?: RolledGearItem; reason: string };
  onClaimTowerChest?: (starsReq: number) => { ok: boolean; jade: number; droppedItem?: RolledGearItem; reason: string };
  onReplayStory?: (kind: 'episode' | 'epilogue', id: number) => void;
  onShopPreview?: (
    active: boolean,
    skinId?: string | null,
    weaponId?: string | null,
    armorId?: string | null,
    relicId?: string | null,
  ) => void;
  onShopPreviewRotate?: (deltaYaw: number) => void;
  onShopPreviewToggleSpin?: () => boolean;
  onOpenAncientMap?: () => void;
  onOpenRoster?: (focusCharId?: string) => void;
}

export interface ResultDisplayOptions {
  stageDef?: StageDef;
  dungeonDef?: DungeonDef;
  towerFloor?: TowerFloorDef;
  nextTowerFloorId?: number | null;
  roguelikeChamber?: number;
  roguelikeTotalChambers?: number;
  roguelikeBlessings?: RoguelikeBlessingDef[];
  roguelikePaths?: Record<RoguelikePathId, number>;
  combatRank?: CombatStyleRankInfo;
  droppedGear?: RolledGearItem[];
  starResult?: {
    stars: 1 | 2 | 3;
    checks: [boolean, boolean, boolean];
    labels: [string, string, string];
  };
  blessingChoices?: BlessingDef[];
  nextStageId?: number | null;
  jadeEarned?: number;
  customTitle?: string;
  customSub?: string;
}

const SKILL_MAX_CD = {
  Q: 3.5,
  E: 7.5,
  R: 12.0,
  F: 1.5,
};

interface ComboCodexEntry {
  num: string;
  name: string;
  descHtml: string;
  isUlt?: boolean;
}

const COMBO_CODEX_ENTRIES: readonly ComboCodexEntry[] = [
  {
    num: '1',
    name: '普攻四连',
    descHtml: '左键 / J / 出剑 ×4 破霸体',
  },
  {
    num: '2',
    name: '踏剑追影',
    descHtml: 'Q 命中挂印 → 再按 Q 瞬身追斩（<b>+20剑意 · -1.5s万剑CD</b>）',
  },
  {
    num: '3',
    name: '剑印引雷',
    descHtml: 'Q 挂印 → E 万剑诀（额外 <b>+4</b> 追踪天剑 <b>+25%</b> 伤）',
  },
  {
    num: '4',
    name: '流云破势',
    descHtml: 'Space 极限闪避 / K 弹反 → 普攻（<b>流云拔刀斩</b> / <b>破势处决</b>）',
  },
  {
    num: '5',
    name: '万剑归宗',
    descHtml: '6秒内打满 <b>3种不同招印</b>（斩/御/万/身）→ 点金色 <b>万剑归宗</b> 或按 <b>R</b> <b>免费双大招</b>',
    isUlt: true,
  },
];

const COMBO_CODEX_ENTRIES_MOBILE: readonly ComboCodexEntry[] = [
  {
    num: '1',
    name: '普攻四连',
    descHtml: '连点「出剑」×4 触发剑气破霸体',
  },
  {
    num: '2',
    name: '踏剑追影',
    descHtml: '点「御剑」命中挂印 → 再点「踏剑」瞬身追斩（<b>+20剑意 · -1.5s万剑CD</b>）',
  },
  {
    num: '3',
    name: '剑印引雷',
    descHtml: '点「御剑」挂印 → 点「万剑」额外 <b>+4</b> 追踪天剑 <b>+25%</b> 伤',
  },
  {
    num: '4',
    name: '流云破势',
    descHtml: '点「闪避」极限闪身 / 点「弹反」→ 点「出剑」触发 <b>流云斩 / 破势处决</b>',
  },
  {
    num: '5',
    name: '万剑归宗',
    descHtml: '6秒内打满 <b>3种不同招印</b>（斩/御/万/身）→ 点金色 <b>万剑归宗</b> <b>免费双大招</b>',
    isUlt: true,
  },
];

const ARMOR_SWATCH_COLORS: Record<string, [string, string]> = {
  arm_qingshan: ['#8ea8b8', '#2a4a64'],
  arm_xuanlin: ['#a8cce0', '#58dce8'],
  arm_yunjin: ['#e6d09c', '#e4a448'],
  arm_xuanwu: ['#e8d08e', '#ffd258'],
};

const RELIC_SWATCH_COLORS: Record<string, [string, string]> = {
  rel_hulu: ['#a8682c', '#e8c474'],
  rel_yupei: ['#4cf0d2', '#9affef'],
  rel_shihun: ['#b458f2', '#e4a8ff'],
  rel_bagua: ['#ffd860', '#fff0a6'],
};

function formatCompactItemStats(s: ShopItemStats): string {
  const parts: string[] = [];
  if (s.hpBonus) parts.push(`气血+${Math.round(s.hpBonus)}`);
  if (s.atkPct) parts.push(`剑伤+${Math.round(s.atkPct * 100)}%`);
  if (s.dmgReduce) parts.push(`减伤+${Math.round(s.dmgReduce * 100)}%`);
  if (s.critRate) parts.push(`暴击+${Math.round(s.critRate * 100)}%`);
  if (s.critDmg) parts.push(`暴伤+${Math.round(s.critDmg * 100)}%`);
  if (s.speedPct) parts.push(`移速+${Math.round(s.speedPct * 100)}%`);
  if (s.poisePct) parts.push(`破势+${Math.round(s.poisePct * 100)}%`);
  if (s.cdReduce) parts.push(`冷却-${Math.round(s.cdReduce * 100)}%`);
  if (s.lifestealPct) parts.push(`吸血+${Math.round(s.lifestealPct * 100)}%`);
  if (s.killHealPct) parts.push(`斩回+${Math.round(s.killHealPct * 100)}%`);
  if (s.parryWindow) parts.push(`弹窗+${Math.round(s.parryWindow * 1000)}ms`);
  if (s.parryReflectPct) parts.push(`反伤+${Math.round(s.parryReflectPct * 100)}%`);
  if (s.ultGainPct) parts.push(`剑意+${Math.round(s.ultGainPct * 100)}%`);
  if (s.gourdBonus) parts.push(`灵葫+${s.gourdBonus}`);
  return parts.slice(0, 4).join(' · ');
}

export class HudController {
  private readonly appRoot = this.q('#app');
  private readonly titleOverlay = this.q('#title-overlay');
  private readonly campaignOverlay = this.q('#campaign-overlay');
  private readonly codexOverlay = this.q('#codex-overlay');
  private readonly shopOverlay = this.q('#shop-overlay');
  private readonly dungeonOverlay = this.q('#dungeon-overlay');
  private readonly dialogueOverlay = this.q('#dialogue-overlay');
  private readonly hudRoot = this.q('#game-hud');
  private readonly touchRoot = this.q('#touch-controls');
  private readonly resultOverlay = this.q('#result-overlay');
  private readonly pauseOverlay = this.q('#pause-overlay');

  private readonly hpFill = this.q('#hp-fill');
  private readonly hpDelay = this.q('#hp-delay');
  private readonly hpText = this.q('#hp-text');
  private readonly spiritFill = this.q('#spirit-fill');
  private readonly staminaFill = this.q('#stamina-fill');
  private readonly ultPctText = this.q('#ult-pct');
  private readonly heroTitleName = this.q('#hero-title-name');
  private readonly hudRealmName = this.q('#hud-realm-name');
  private readonly hudBlessingPill = this.q('#hud-blessing-pill');

  private readonly allyMini = this.q('#ally-mini');
  private readonly allyMiniName = this.q('#ally-mini-name');
  private readonly allyHpFill = this.q('#ally-hp-fill');

  private readonly objectiveText = this.q('#objective-text');
  private readonly bossBar = this.q('#boss-bar');
  private readonly bossName = this.q('#boss-name');
  private readonly bossHpFill = this.q('#boss-hp-fill');
  private readonly bossPoiseFill = this.q('#boss-poise-fill');

  // Desktop sculpted skill medallions
  private readonly slotQ = this.q('#slot-q');
  private readonly slotE = this.q('#slot-e');
  private readonly slotR = this.q('#slot-r');
  private readonly slotF = this.q('#slot-f');
  private readonly sweepQ = this.q('#sweep-q');
  private readonly sweepE = this.q('#sweep-e');
  private readonly sweepR = this.q('#sweep-r');
  private readonly sweepF = this.q('#sweep-f');
  private readonly cdQEl = this.q('#cd-q');
  private readonly cdEEl = this.q('#cd-e');
  private readonly cdREl = this.q('#cd-r');
  private readonly gourdCountEl = this.q('#gourd-count');

  // Honor-of-Kings mobile/APK sculpted skill wheel medallions
  private readonly tSlotQ = this.q('#btn-skill-q');
  private readonly tSlotE = this.q('#btn-skill-e');
  private readonly tSlotR = this.q('#btn-skill-r');
  private readonly tSlotF = this.q('#btn-heal');
  private readonly tSweepQ = this.q('#t-sweep-q');
  private readonly tSweepE = this.q('#t-sweep-e');
  private readonly tSweepR = this.q('#t-sweep-r');
  private readonly tSweepF = this.q('#t-sweep-f');
  private readonly tCdQEl = this.q('#t-cd-q');
  private readonly tCdEEl = this.q('#t-cd-e');
  private readonly tCdREl = this.q('#t-cd-r');
  private readonly tGourdCountEl = this.q('#t-gourd-count');

  // Tactical Corridor Minimap, Q2 & 3-Sigil Combo Ult HUD
  private readonly minimapBox = this.q('#minimap-box');
  private readonly minimapZoneName = this.q('#minimap-zone-name');
  private readonly minimapPct = this.q('#minimap-pct');
  private readonly minimapCanvas = this.q('#minimap-canvas') as HTMLCanvasElement;
  private readonly minimapCtx = this.minimapCanvas.getContext('2d');
  private readonly slotQName = this.q('#slot-q .skill-name');
  private readonly tSlotQName = this.q('#btn-skill-q .t-lbl');
  private readonly slotRName = this.q('#slot-r .skill-name');
  private readonly tSlotRName = this.q('#btn-skill-r .t-lbl');
  private readonly sigilEls = [this.q('#sigil-0'), this.q('#sigil-1'), this.q('#sigil-2')];
  private readonly comboUltBtn = this.q('#btn-combo-ult');

  private readonly dangerWarning = this.q('#danger-warning');
  private readonly touchAtkBtn = this.q('#btn-attack');
  private readonly touchAtkLbl = this.q('#t-atk-lbl');
  private readonly touchDodgeBtn = this.q('#btn-dodge');
  private readonly touchBlockBtn = this.q('#btn-block');
  private readonly titleTagline = this.q('#title-tagline');
  private readonly pauseDesc = this.q('#pause-desc');
  private readonly comboBox = this.q('#combo-box');
  private readonly comboRank = this.q('#combo-rank');
  private readonly comboNum = this.q('#combo-num');
  private readonly subtitleBanner = this.q('#subtitle-banner');
  private readonly stageBanner = this.q('#stage-banner');
  private readonly stageBannerKicker = this.q('#stage-banner-kicker');
  private readonly stageBannerTitle = this.q('#stage-banner-title');
  private readonly mobileNotifyPill = this.q('#mobile-notify-pill');
  private readonly mobileNotifyIcon = this.q('#mobile-notify-icon');
  private readonly mobileNotifyText = this.q('#mobile-notify-text');
  private readonly calloutContainer = this.q('#callout-layer');

  // Title & 20-Stage Campaign Map elements
  private readonly appVersionBadge = this.q('#app-version-badge');
  private readonly pauseVersionBadge = this.q('#pause-version-badge');
  private readonly titleRealmBadge = this.q('#title-realm-badge');
  private readonly titleStarsText = this.q('#title-stars-text');
  private readonly titleJadePill = this.q('#title-jade-pill');
  private readonly titleClearText = this.q('#title-clear-text');
  private readonly titleSelectedStage = this.q('#title-selected-stage');
  private readonly titleSelectedMeta = this.q('#title-selected-meta');
  private readonly startBtn = this.q('#btn-start');

  // Shop Modal elements
  private readonly shopJadeBalance = this.q('#shop-jade-balance');
  private readonly shopPowerPill = this.q('#shop-power-pill');
  private readonly shopToastEl = this.q('#shop-toast');
  private readonly shopTabsEl = this.q('#shop-tabs');
  private readonly shopBagBar = this.q('#shop-bag-bar');
  private readonly shopGridEl = this.q('#shop-item-grid');
  private readonly shopPowerSummary = this.q('#shop-power-summary');
  private readonly shopBattleBtn = this.q('#btn-shop-battle');

  // Dungeon, Tower, Roguelike & Bounty Modal elements
  private readonly dungeonPowerPill = this.q('#dungeon-power-pill');
  private readonly dungeonPityPill = this.q('#dungeon-pity-pill');
  private readonly dungeonToastEl = this.q('#dungeon-toast');
  private readonly trialsDiffBar = this.q('#trials-diff-bar');
  private readonly trialsTabBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('#trials-tabs .trials-tab'));
  private readonly trialsPaneTower = this.q('#trials-pane-tower');
  private readonly trialsPaneRoguelike = this.q('#trials-pane-roguelike');
  private readonly trialsPaneDungeon = this.q('#trials-pane-dungeon');
  private readonly towerStarsPill = this.q('#tower-stars-pill');
  private readonly towerChestBar = this.q('#tower-chest-bar');
  private readonly towerFloorGrid = this.q('#tower-floor-grid');
  private readonly roguelikeRecordText = this.q('#roguelike-record-text');
  private readonly roguelikePathsGrid = this.q('#roguelike-paths-grid');
  private readonly dungeonCardGrid = this.q('#dungeon-card-grid');
  private readonly bountyGrid = this.q('#bounty-grid');
  private readonly dungeonBountyDot = this.q('#dungeon-bounty-dot');
  private readonly chapterChestBar = this.q('#chapter-chest-bar');
  private readonly campaignDiffBar = this.q('#campaign-diff-bar');
  private readonly stageModBar = this.q('#stage-mod-bar');
  private readonly monolithBar = this.q('#monolith-bar');
  private readonly monolithLabel = this.q('#monolith-label');
  private readonly monolithFill = this.q('#monolith-fill');

  // Dialogue Modal elements
  private readonly dlgKicker = this.q('#dlg-kicker');
  private readonly dlgTitle = this.q('#dlg-title');
  private readonly dlgIntel = this.q('#dlg-intel');
  private readonly dlgLines = this.q('#dlg-lines');
  private readonly dlgChoices = this.q('#dlg-choices');
  private readonly dlgTip = this.q('#dlg-tip');
  private readonly dlgConfirmBtn = this.q('#btn-dialogue-confirm');

  // Walkable Camp HUD elements
  private readonly campHud = this.q('#camp-hud');
  private readonly campNpcLabels = this.q('#camp-npc-labels');
  private readonly campInteractBtn = this.q('#btn-camp-interact');
  private readonly campInteractLabel = this.q('#camp-interact-label');
  private readonly campRealmPill = this.q('#camp-realm-pill');
  private readonly campJadePill = this.q('#camp-jade-pill');
  private readonly campMealBadge = this.q('#camp-meal-badge');
  private readonly campToastEl = this.q('#camp-toast');
  private readonly campDepartBtn = this.q('#btn-camp-depart');
  private readonly campPanel = this.q('#camp-panel');
  private readonly campTabCultivateBtn = this.q('#tab-camp-cultivate');
  private readonly campTabMealBtn = this.q('#tab-camp-meal');
  private readonly campTabCultivateBody = this.q('#camp-tab-cultivate-body');
  private readonly campTabMealBody = this.q('#camp-tab-meal-body');
  private readonly campCollapseBtn = this.q('#btn-camp-collapse');
  private readonly campRealmName = this.q('#camp-realm-name');
  private readonly campRealmLv = this.q('#camp-realm-lv');
  private readonly campRealmBonuses = this.q('#camp-realm-bonuses');
  private readonly campRealmNextBox = this.q('#camp-realm-next-box');
  private readonly campCultivateBtn = this.q('#btn-camp-cultivate') as HTMLButtonElement;
  private readonly campMealList = this.q('#camp-meal-list');

  // Mount bar & Open World HUD elements
  private readonly mountHorseBtn = this.q('#btn-mount-horse');
  private readonly mountSwordBtn = this.q('#btn-mount-sword');
  private readonly worldHud = this.q('#world-hud');
  private readonly worldRegionName = this.q('#world-region-name');
  private readonly worldProgressPill = this.q('#world-progress-pill');
  private readonly worldToastEl = this.q('#world-toast');
  private readonly worldTpDrawer = this.q('#world-tp-drawer');
  private readonly worldTpList = this.q('#world-tp-list');
  private readonly worldInteractBtn = this.q('#btn-world-interact');
  private readonly worldInteractLabel = this.q('#world-interact-label');
  private readonly worldGuideCard = this.q('#world-guide-card');
  private readonly worldGuideGoal = this.q('#world-guide-goal');
  private readonly worldGuideDir = this.q('#world-guide-dir');
  private readonly worldGuideHowto = this.q('#world-guide-howto');
  private readonly worldGuideToggleBtn = this.q('#btn-world-guide-toggle');
  private readonly worldAutoNavBtn = this.q('#btn-world-auto-nav');
  private worldToastTimer: number | null = null;
  private worldGuidePulseTimer: number | null = null;

  private readonly shopPreviewStage = this.q('#shop-preview-stage');
  private readonly shopEquippedSlotsEl = this.q('#shop-equipped-slots');
  private readonly eqSlotBtns: Record<EquipCategory, HTMLElement> = {
    weapon: this.q('#eq-slot-weapon'),
    armor: this.q('#eq-slot-armor'),
    relic: this.q('#eq-slot-relic'),
    skin: this.q('#eq-slot-skin'),
  };
  private readonly shopPreviewName = this.q('#shop-preview-name');
  private readonly shopPreviewSub = this.q('#shop-preview-sub');
  private readonly shopPreviewStats = this.q('#shop-preview-stats');
  private readonly shopPreviewSpinBtn = this.q('#btn-preview-spin');
  private readonly shopPreviewResetBtn = this.q('#btn-preview-reset');
  private readonly shopPreviewActionBtn = this.q('#btn-preview-action') as HTMLButtonElement;
  private shopPreviewSpinOn = true;
  private previewSkinId: string | null = null;
  private previewWeaponId: string | null = null;
  private previewArmorId: string | null = null;
  private previewRelicId: string | null = null;
  private previewBagUid: string | null = null;
  private previewDragPointerId: number | null = null;
  private previewDragLastX = 0;

  private readonly mapRealmPill = this.q('#map-realm-pill');
  private readonly mapRealmBuff = this.q('#map-realm-buff');
  private readonly mapStarsPill = this.q('#map-stars-pill');
  private readonly chapterTabsEl = this.q('#chapter-tabs');
  private readonly chapterLoreEl = this.q('#chapter-lore-bar');
  private readonly stageGridEl = this.q('#stage-card-grid');
  private readonly campaignDetailEl = this.q('#campaign-detail-box');
  private readonly mapLaunchBtn = this.q('#btn-map-launch');
  private readonly mapCoopBtn = this.q('#btn-map-coop');
  private readonly codexKarmaBar = this.q('#codex-karma-bar');
  private readonly codexTabsEl = this.q('#codex-tabs');
  private readonly codexListEl = this.q('#codex-list');
  private readonly codexCountPill = this.q('#codex-count-pill');

  // Result modal elements
  private readonly resultModalCard = this.q('#result-modal-card');
  private readonly resultStageTag = this.q('#result-stage-tag');
  private readonly resultEpilogueBtn = this.q('#btn-result-epilogue');
  private readonly resultTitle = this.q('#result-title');
  private readonly resultStoryLine = this.q('#result-story-line');
  private readonly resultStarsRow = this.q('#result-stars-row');
  private readonly resultRankBadge = this.q('#result-rank-badge');
  private readonly resultJadeGain = this.q('#result-jade-gain');
  private readonly resultStats = this.q('#result-stats');
  private readonly resultLootRow = this.q('#result-loot-row');
  private readonly resultBlessingWrap = this.q('#result-blessing-wrap');
  private readonly resultBlessingHeader = this.q('#result-blessing-header');
  private readonly resultBlessingGrid = this.q('#result-blessing-grid');
  private readonly resultGreedRow = this.q('#result-greed-row');
  private readonly chkGreedPact = this.q('#chk-greed-pact') as HTMLInputElement;
  private readonly nextStageBtn = this.q('#btn-next-stage');
  private readonly retryBtn = this.q('#btn-retry');

  private readonly muteBtn = this.q('#btn-mute');
  private readonly wheelToggleBtn = this.q('#btn-wheel-toggle');
  private readonly lolToggleBtn = this.q('#btn-lol-toggle');
  private readonly mpHudBadge = this.q('#mp-hud-badge');

  // Online lobby controls
  private readonly mpCodeInput = this.q('#mp-code-input') as HTMLInputElement;
  private readonly mpStatusBar = this.q('#mp-status-bar');
  private readonly mpStatusText = this.q('#mp-status-text');
  private readonly mpConnDot = this.q('#mp-conn-dot');

  private selectedStage = 1;
  private activeChapter: ChapterId = 1;
  private activeCodexTab: ChapterId | 'dungeon' | 'epilogue' = 1;
  private activeShopCategory: EquipCategory | 'bag' = 'weapon';
  private activeTrialsTab: 'tower' | 'roguelike' | 'dungeon' = 'tower';
  private campPanelCollapsed = false;
  private saveStore: CampaignSaveStore | null = null;
  private selectedBlessingId: string | undefined;
  private selectedDialogueChoiceId: string | undefined;
  private pendingNextStageId: number | null = null;
  private pendingDungeonId: string | null = null;
  private pendingTowerFloorId: number | null = null;
  private pendingRoguelikeNext = false;
  private currentScreenMode: ScreenMode = 'title';
  private subtitleTimer = 0;
  private stageBannerTimer = 0;
  private wheelForced = false;
  private shopToastTimer: number | null = null;
  private dungeonToastTimer: number | null = null;
  private campToastTimer: number | null = null;
  private mobileNotifyTimer: number | null = null;
  private mobileNotifyCurrentText = '';
  private lastMobileCodexState = false;

  constructor(private readonly callbacks: HudCallbacks) {
    this.appVersionBadge.textContent = `v${APP_VERSION}`;
    this.pauseVersionBadge.textContent = `v${APP_VERSION}`;
    this.lastMobileCodexState = this.isMobileUi();
    this.populateComboCodex(this.q('#title-combo-codex'));
    this.populateComboCodex(this.q('#pause-combo-codex'));
    this.syncShopPreviewButtonLabels();
    window.addEventListener('resize', () => {
      const mobileNow = this.isMobileUi();
      if (mobileNow !== this.lastMobileCodexState) {
        this.lastMobileCodexState = mobileNow;
        this.populateComboCodex(this.q('#title-combo-codex'));
        this.populateComboCodex(this.q('#pause-combo-codex'));
      }
      this.syncShopPreviewButtonLabels();
    });
    const bindImg = (id: string, src: string) => {
      (this.q(id) as HTMLImageElement).src = src;
    };
    bindImg('#img-q', iconYujian);
    bindImg('#img-e', iconWanjian);
    bindImg('#img-r', iconTianjian);
    bindImg('#img-f', iconHulu);
    bindImg('#t-img-q', iconYujian);
    bindImg('#t-img-e', iconWanjian);
    bindImg('#t-img-r', iconTianjian);
    bindImg('#t-img-f', iconHulu);
    bindImg('#t-img-atk', medalAttack);
    bindImg('#t-img-dodge', medalDodge);
    bindImg('#t-img-parry', medalParry);

    const params = new URLSearchParams(window.location.search);
    if (isPureMobileDevice()) {
      this.applyMobileMode(true);
    } else if (params.has('wheel')) {
      this.setWheelForced(true);
    }

    this.startBtn.addEventListener('click', () => this.callbacks.onStart(this.selectedStage));
    this.q('#btn-open-world').addEventListener('click', () => this.callbacks.onEnterOpenWorld?.());
    this.q('#btn-open-camp').addEventListener('click', () => this.callbacks.onEnterCamp());
    this.q('#btn-camp-world').addEventListener('click', () => this.callbacks.onEnterOpenWorld?.());
    this.mountHorseBtn.addEventListener('click', () => this.callbacks.onToggleMount?.('horse'));
    this.mountSwordBtn.addEventListener('click', () => this.callbacks.onToggleMount?.('sword'));
    this.q('#btn-world-tp').addEventListener('click', () => {
      this.renderWorldTeleportList();
      this.worldTpDrawer.classList.toggle('visible');
    });
    this.q('#btn-world-respawn').addEventListener('click', () => this.callbacks.onWorldRespawnBosses?.());
    this.q('#btn-world-shop').addEventListener('click', () => this.openShop());
    this.q('#btn-world-camp').addEventListener('click', () => this.callbacks.onEnterCamp());
    this.q('#btn-world-title').addEventListener('click', () => this.callbacks.onBackToTitle());
    this.worldInteractBtn.addEventListener('click', () => this.callbacks.onWorldInteract?.());
    this.worldGuideToggleBtn.addEventListener('click', () => {
      const collapsed = this.worldGuideCard.classList.toggle('collapsed');
      this.worldGuideToggleBtn.textContent = collapsed ? '▸' : '▾';
      this.worldGuideToggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });
    this.q('#btn-world-next-goal').addEventListener('click', () => this.callbacks.onWorldCycleGuide?.());
    this.worldAutoNavBtn.addEventListener('click', () => this.callbacks.onWorldToggleAutoNav?.());
    this.q('#btn-open-dungeon').addEventListener('click', () => this.openTrialsHub());
    this.q('#btn-open-campaign').addEventListener('click', () => this.openCampaignMap());
    this.q('#btn-open-codex').addEventListener('click', () => {
      this.closeCampaignMap();
      this.openStoryCodex();
    });
    this.q('#btn-close-codex').addEventListener('click', () => this.closeStoryCodex());
    this.q('#btn-open-shop').addEventListener('click', () => this.openShop());
    this.q('#btn-close-dungeon').addEventListener('click', () => this.closeDungeon());
    for (const tabBtn of this.trialsTabBtns) {
      tabBtn.addEventListener('click', () => {
        const tab = tabBtn.dataset.trialsTab as 'tower' | 'roguelike' | 'dungeon';
        if (tab) this.setTrialsTab(tab);
      });
    }
    this.q('#btn-start-roguelike').addEventListener('click', () => {
      this.closeDungeon();
      this.callbacks.onStartRoguelike?.();
    });
    this.q('#btn-close-campaign').addEventListener('click', () => this.closeCampaignMap());
    this.q('#btn-close-shop').addEventListener('click', () => this.closeShop());

    // Backdrop tap-to-close on mobile-friendly modals
    this.campaignOverlay.addEventListener('click', (e) => {
      if (e.target === this.campaignOverlay) this.closeCampaignMap();
    });
    this.codexOverlay.addEventListener('click', (e) => {
      if (e.target === this.codexOverlay) this.closeStoryCodex();
    });
    this.shopOverlay.addEventListener('click', (e) => {
      if (e.target === this.shopOverlay) this.closeShop();
    });
    this.dungeonOverlay.addEventListener('click', (e) => {
      if (e.target === this.dungeonOverlay) this.closeDungeon();
    });
    this.pauseOverlay.addEventListener('click', (e) => {
      if (e.target === this.pauseOverlay && this.currentScreenMode === 'paused') {
        this.callbacks.onTogglePause();
      }
    });

    // Interactive Ancient Chinese Scroll Map triggers
    const openMapHandler = (e?: Event) => {
      e?.stopPropagation();
      this.callbacks.onOpenAncientMap?.();
    };
    this.minimapBox.addEventListener('click', openMapHandler);
    this.minimapBox.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMapHandler();
      }
    });
    this.q('#btn-hud-map').addEventListener('click', openMapHandler);
    this.q('#btn-world-map').addEventListener('click', openMapHandler);
    this.q('#btn-camp-map').addEventListener('click', openMapHandler);
    this.q('#btn-pause-map-scroll').addEventListener('click', openMapHandler);

    // Character Physical Attributes & Roster Inspector triggers
    const openRosterHandler = (e?: Event) => {
      e?.stopPropagation();
      this.callbacks.onOpenRoster?.('char_xiaoyao');
    };
    this.q('#btn-open-roster').addEventListener('click', openRosterHandler);
    this.q('#btn-hud-roster').addEventListener('click', openRosterHandler);
    this.q('#btn-world-roster').addEventListener('click', openRosterHandler);
    this.q('#btn-camp-roster').addEventListener('click', openRosterHandler);
    this.q('#btn-pause-roster').addEventListener('click', openRosterHandler);
    this.q('#btn-boss-inspect').addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onOpenRoster?.('__active_boss__');
    });

    // Equipped slots on the left 3D preview panel switch active shop tab
    for (const cat of ['weapon', 'armor', 'relic', 'skin'] as EquipCategory[]) {
      this.eqSlotBtns[cat].addEventListener('click', (e) => {
        e.stopPropagation();
        this.activeShopCategory = cat;
        this.shopGridEl.scrollTop = 0;
        this.renderShopModal();
      });
    }

    this.q('#btn-preview-rot-l').addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onShopPreviewRotate?.(-0.55);
    });
    this.q('#btn-preview-rot-r').addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onShopPreviewRotate?.(0.55);
    });
    this.shopPreviewSpinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.shopPreviewSpinOn = this.callbacks.onShopPreviewToggleSpin?.() ?? false;
      this.syncShopPreviewButtonLabels();
    });
    this.shopPreviewResetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.previewSkinId = null;
      this.previewWeaponId = null;
      this.previewArmorId = null;
      this.previewRelicId = null;
      this.previewBagUid = null;
      this.renderShopModal();
    });
    this.shopPreviewActionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const store = this.saveStore;
      if (!store) return;
      const equipped = store.getEquipped();
      if (this.activeShopCategory === 'bag') {
        const inv = store.getInventory();
        const rolled = inv.find((g) => g.uid === this.previewBagUid) ?? inv[0];
        if (!rolled) return;
        if (equipped[rolled.category] !== rolled.uid) {
          const ok = this.callbacks.onEquipRolled(rolled.uid);
          if (ok) this.showShopToast(`已穿戴「${rolled.name}」`, true);
        }
        this.renderShopModal();
        return;
      }
      const targetId =
        this.activeShopCategory === 'skin'
          ? (this.previewSkinId ?? equipped.skin)
          : this.activeShopCategory === 'weapon'
            ? (this.previewWeaponId ?? equipped.weapon)
            : this.activeShopCategory === 'armor'
              ? (this.previewArmorId ?? equipped.armor)
              : (this.previewRelicId ?? equipped.relic);
      if (!targetId) return;
      const item = SHOP_ITEM_MAP[targetId];
      if (!item) return;
      if (!store.isOwned(item.id)) {
        const res = this.callbacks.onShopBuy(item.id);
        this.showShopToast(res.ok ? `已购入并穿戴「${item.name}」` : res.reason, res.ok);
      } else if (equipped[item.category] !== item.id) {
        const ok = this.callbacks.onShopEquip(item.id);
        if (ok) this.showShopToast(`已换装「${item.name}」`, true);
      }
      this.renderShopModal();
    });
    this.shopPreviewStage.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      this.previewDragPointerId = e.pointerId;
      this.previewDragLastX = e.clientX;
      this.shopPreviewStage.setPointerCapture(e.pointerId);
    });
    this.shopPreviewStage.addEventListener('pointermove', (e) => {
      if (this.previewDragPointerId !== e.pointerId) return;
      const dx = e.clientX - this.previewDragLastX;
      this.previewDragLastX = e.clientX;
      if (Math.abs(dx) > 0.5) {
        this.callbacks.onShopPreviewRotate?.(dx * 0.015);
      }
    });
    const endPreviewDrag = (e: PointerEvent) => {
      if (this.previewDragPointerId !== e.pointerId) return;
      this.previewDragPointerId = null;
      if (this.shopPreviewStage.hasPointerCapture(e.pointerId)) {
        this.shopPreviewStage.releasePointerCapture(e.pointerId);
      }
    };
    this.shopPreviewStage.addEventListener('pointerup', endPreviewDrag);
    this.shopPreviewStage.addEventListener('pointercancel', endPreviewDrag);
    this.shopBattleBtn.addEventListener('click', () => {
      this.closeShop();
      if (this.currentScreenMode === 'paused') {
        this.callbacks.onTogglePause();
      } else if (this.currentScreenMode !== 'camp') {
        this.callbacks.onStart(this.selectedStage);
      }
    });
    this.q('#btn-dialogue-confirm').addEventListener('click', () =>
      this.callbacks.onConfirmDialogue(this.selectedDialogueChoiceId),
    );
    this.campInteractBtn.addEventListener('click', () => this.callbacks.onCampInteract?.());
    this.resultEpilogueBtn.addEventListener('click', () => this.callbacks.onReplayEpilogue?.());
    this.q('#btn-camp-title').addEventListener('click', () => this.callbacks.onBackToTitle());
    this.q('#btn-camp-shop').addEventListener('click', () => this.openShop());
    this.campDepartBtn.addEventListener('click', () => this.callbacks.onLeaveCampToEpisode(this.selectedStage));
    this.campTabCultivateBtn.addEventListener('click', () => this.setCampTab('cultivate'));
    this.campTabMealBtn.addEventListener('click', () => this.setCampTab('meal'));
    this.campCollapseBtn.addEventListener('click', () => {
      this.campPanelCollapsed = !this.campPanelCollapsed;
      this.campPanel.classList.toggle('collapsed', this.campPanelCollapsed);
      this.campCollapseBtn.setAttribute('aria-expanded', String(!this.campPanelCollapsed));
      this.campCollapseBtn.textContent = this.campPanelCollapsed ? '▴' : '▾';
    });
    this.campCultivateBtn.addEventListener('click', () => {
      const res = this.callbacks.onCampCultivate();
      if (res.ok) {
        const step = CULTIVATION_STEPS[res.level];
        this.showCampToast(step ? `突破至「${step.name}」!` : '修为突破成功!', true);
      } else {
        this.showCampToast(res.reason, false);
      }
      this.renderCampPanel();
    });
    this.q('#btn-pause-shop').addEventListener('click', () => this.openShop());
    this.q('#btn-result-shop').addEventListener('click', () => this.openShop());
    this.q('#btn-result-camp').addEventListener('click', () => this.callbacks.onEnterCamp());
    this.mapLaunchBtn.addEventListener('click', () => {
      this.closeCampaignMap();
      this.callbacks.onStart(this.selectedStage);
    });
    this.mapCoopBtn.addEventListener('click', () => {
      this.closeCampaignMap();
      this.callbacks.onMpCreate('coop', this.selectedStage);
    });

    this.nextStageBtn.addEventListener('click', () => {
      if (this.pendingTowerFloorId) {
        this.callbacks.onStartTower?.(this.pendingTowerFloorId);
      } else if (this.pendingRoguelikeNext) {
        this.callbacks.onAdvanceRoguelike?.(this.selectedBlessingId, this.chkGreedPact.checked);
      } else if (this.pendingDungeonId) {
        this.callbacks.onStartDungeon(this.pendingDungeonId);
      } else if (this.pendingNextStageId) {
        this.callbacks.onNextStage(this.pendingNextStageId, this.selectedBlessingId);
      }
    });
    this.retryBtn.addEventListener('click', () => this.callbacks.onRetry());
    this.q('#btn-resume').addEventListener('click', () => this.callbacks.onTogglePause());
    this.q('#btn-restart-pause').addEventListener('click', () => this.callbacks.onRetry());
    this.q('#btn-pause').addEventListener('click', () => this.callbacks.onTogglePause());
    this.q('#btn-pause-map').addEventListener('click', () => {
      this.callbacks.onBackToTitle();
      this.openCampaignMap();
    });
    this.q('#btn-pause-title').addEventListener('click', () => this.callbacks.onBackToTitle());
    this.q('#btn-result-map').addEventListener('click', () => {
      this.callbacks.onBackToTitle();
      this.openCampaignMap();
    });
    this.q('#btn-result-title').addEventListener('click', () => this.callbacks.onBackToTitle());

    this.wheelToggleBtn.addEventListener('click', () => {
      this.setWheelForced(!this.wheelForced);
    });

    this.lolToggleBtn.addEventListener('click', () => {
      const isLol = this.callbacks.onToggleLolMode();
      this.lolToggleBtn.textContent = isLol ? '联盟鼠标' : '经典WASD';
      this.lolToggleBtn.classList.toggle('active-mode', isLol);
    });

    this.muteBtn.addEventListener('click', () => {
      const muted = this.callbacks.onToggleMute();
      this.muteBtn.textContent = muted ? '静音' : '音律';
      this.muteBtn.classList.toggle('active-mode', muted);
    });

    for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>('.util-btn'))) {
      btn.addEventListener('click', () => btn.blur());
    }

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.isComposing || e.repeat) return;
      if (
        this.currentScreenMode === 'dialogue' &&
        !this.campaignOverlay.classList.contains('visible') &&
        !this.shopOverlay.classList.contains('visible') &&
        !this.dungeonOverlay.classList.contains('visible') &&
        (e.code === 'Enter' || e.code === 'Space')
      ) {
        e.preventDefault();
        this.callbacks.onConfirmDialogue(this.selectedDialogueChoiceId);
      } else if (
        this.currentScreenMode === 'camp' &&
        !this.campaignOverlay.classList.contains('visible') &&
        !this.shopOverlay.classList.contains('visible') &&
        !this.dungeonOverlay.classList.contains('visible') &&
        e.code === 'KeyG'
      ) {
        e.preventDefault();
        this.callbacks.onCampInteract?.();
      } else if (
        this.currentScreenMode === 'world' &&
        !this.campaignOverlay.classList.contains('visible') &&
        !this.shopOverlay.classList.contains('visible') &&
        !this.dungeonOverlay.classList.contains('visible') &&
        e.code === 'KeyG'
      ) {
        e.preventDefault();
        this.callbacks.onWorldInteract?.();
      } else if (
        (this.currentScreenMode === 'playing' || this.currentScreenMode === 'camp' || this.currentScreenMode === 'world') &&
        !this.campaignOverlay.classList.contains('visible') &&
        !this.shopOverlay.classList.contains('visible') &&
        !this.dungeonOverlay.classList.contains('visible')
      ) {
        if (e.code === 'KeyV') {
          e.preventDefault();
          this.callbacks.onToggleMount?.('horse');
        } else if (e.code === 'KeyB') {
          e.preventDefault();
          this.callbacks.onToggleMount?.('sword');
        }
      }
    });

    this.q('#btn-mp-coop').addEventListener('click', () => this.callbacks.onMpCreate('coop', this.selectedStage));
    this.q('#btn-mp-solo').addEventListener('click', () => this.callbacks.onMpCreate('solo', 20));
    this.q('#btn-mp-join').addEventListener('click', () => {
      const code = this.mpCodeInput.value.trim();
      if (code.length >= 4) {
        this.callbacks.onMpJoin(code);
      } else {
        this.setMpLobbyStatus('请输入 4 位数字房间码', false);
      }
    });
    this.q('#btn-mp-quick').addEventListener('click', () => this.callbacks.onMpQuick('coop', this.selectedStage));
    this.q('#btn-mp-leave').addEventListener('click', () => this.callbacks.onMpLeave());
    this.comboUltBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onCastComboUlt?.();
      this.comboUltBtn.blur();
    });
  }

  syncCampaignProgress(store: CampaignSaveStore, focusStage?: number): void {
    this.saveStore = store;
    const totalStars = store.getTotalStars();
    const clearedCount = store.getClearedCount();
    const realm = getSwordRealm(totalStars);
    const jade = store.getJade();
    const targetStage = focusStage ?? this.selectedStage ?? store.getRecommendedStage();
    this.selectedStage = clamp(Math.floor(targetStage), 1, CAMPAIGN_STAGES.length);
    const stDef = getStageDef(this.selectedStage);
    this.activeChapter = stDef.chapter;

    this.titleRealmBadge.textContent = realm.title;
    const maxTotalStars = CAMPAIGN_STAGES.length * 3;
    this.titleStarsText.textContent = `★ ${totalStars} / ${maxTotalStars}`;
    this.titleJadePill.textContent = `◆ ${jade} 灵石`;
    this.titleClearText.textContent = `已破 ${clearedCount} / ${CAMPAIGN_STAGES.length} 关`;
    this.hudRealmName.textContent = realm.title;

    this.mapRealmPill.textContent = realm.title;
    this.mapRealmBuff.textContent = `气血+${realm.hpBonus} · 剑伤+${Math.round((realm.dmgMult - 1) * 100)}%`;
    this.mapStarsPill.textContent = `★ ${totalStars} / ${maxTotalStars}`;

    this.updateSelectedStageLabels();
    this.renderCampaignModal();
    this.renderShopModal();
    this.renderDungeonModal();
    this.renderCampPanel();
    this.dungeonBountyDot.classList.toggle('visible', store.hasAnyClaimableReward());
  }

  openDungeon(): void {
    this.openTrialsHub();
  }

  openTrialsHub(tab?: 'tower' | 'roguelike' | 'dungeon'): void {
    if (tab) this.activeTrialsTab = tab;
    this.setTrialsTab(this.activeTrialsTab);
    this.renderDungeonModal();
    this.dungeonOverlay.classList.add('visible');
  }

  private setTrialsTab(tab: 'tower' | 'roguelike' | 'dungeon'): void {
    this.activeTrialsTab = tab;
    for (const btn of this.trialsTabBtns) {
      btn.classList.toggle('active', btn.dataset.trialsTab === tab);
    }
    this.trialsPaneTower.classList.toggle('active', tab === 'tower');
    this.trialsPaneRoguelike.classList.toggle('active', tab === 'roguelike');
    this.trialsPaneDungeon.classList.toggle('active', tab === 'dungeon');
  }

  private renderDifficultyBar(container: HTMLElement): void {
    const store = this.saveStore;
    if (!store) return;
    const active = store.getSelectedDifficulty();
    container.innerHTML = '';
    for (const d of DIFFICULTY_TIERS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `diff-seg-btn diff-${d.id}${active === d.id ? ' active' : ''}`;
      btn.title = `${d.label}：${d.badge}`;
      btn.textContent = d.shortLabel;
      btn.addEventListener('click', () => {
        this.callbacks.onSetDifficulty?.(d.id);
      });
      container.appendChild(btn);
    }
  }

  closeDungeon(): void {
    this.dungeonOverlay.classList.remove('visible');
  }

  private showDungeonToast(text: string, ok: boolean): void {
    this.dungeonToastEl.textContent = text;
    this.dungeonToastEl.classList.toggle('err', !ok);
    this.dungeonToastEl.classList.add('visible');
    if (this.dungeonToastTimer !== null) {
      window.clearTimeout(this.dungeonToastTimer);
    }
    this.dungeonToastTimer = window.setTimeout(() => {
      this.dungeonToastEl.classList.remove('visible');
      this.dungeonToastTimer = null;
    }, 2400);
  }

  private renderDungeonModal(): void {
    const store = this.saveStore;
    if (!store) return;

    const equipped = store.getEquipped();
    const stats = computeHeroLoadoutStats(equipped, store.data.upgrades, store.getInventory());
    const realm = getSwordRealm(store.getTotalStars());
    const power = computeCombatPower(realm.hpBonus, realm.dmgMult, stats);
    const pity = store.getPityCount();

    this.dungeonPowerPill.textContent = `剑道战力 ${power}`;
    this.dungeonPityPill.textContent = `极品保底 ${pity}/5`;
    this.dungeonPityPill.classList.toggle('ready', pity >= 4);
    this.renderDifficultyBar(this.trialsDiffBar);

    // 1. Spiral Abyss 9-Floor Tower Pane
    const totalTowerStars = store.getTotalTowerStars();
    this.towerStarsPill.textContent = `★ ${totalTowerStars} / 27`;
    this.towerChestBar.innerHTML = '';
    for (const ch of TOWER_STAR_CHESTS) {
      const claimed = store.isTowerChestClaimed(ch.starsReq);
      const ready = !claimed && totalTowerStars >= ch.starsReq;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `chest-pill${ready ? ' ready' : ''}${claimed ? ' claimed' : ''}`;
      btn.disabled = !ready;
      btn.textContent = claimed ? `✓ ${ch.label}` : ready ? `领取 ${ch.label}` : `${ch.starsReq}★ ${ch.label}`;
      btn.addEventListener('click', () => {
        const res = this.callbacks.onClaimTowerChest?.(ch.starsReq);
        if (res) {
          this.showDungeonToast(res.reason, res.ok);
          this.syncCampaignProgress(store, this.selectedStage);
        }
      });
      this.towerChestBar.appendChild(btn);
    }

    this.towerFloorGrid.innerHTML = '';
    for (const fl of TOWER_FLOORS) {
      const stars = store.getTowerStars(fl.id);
      const affix = LEYLINE_AFFIX_MAP[fl.stageDef.leylineAffix ?? 'none'];
      const modeName = STAGE_MODE_LABELS[fl.stageDef.stageMode ?? 'exterminate'];
      const metPower = power >= fl.recommendedPower;
      const starHtml = [1, 2, 3].map((n) => `<span class="sc-star${n <= stars ? ' lit' : ''}">★</span>`).join('');
      const card = document.createElement('div');
      card.className = `tower-card tier-${fl.tier}`;
      card.innerHTML = `
        <div class="tw-top">
          <span class="tw-tier">${fl.tierLabel}</span>
          <span class="tw-mode">${modeName}</span>
          <div class="tw-stars">${starHtml}</div>
        </div>
        <div class="tw-name">${fl.name}</div>
        <div class="tw-affix" style="color:${affix.colorHex}">词缀：${affix.name}</div>
        <div class="tw-sub">${fl.subtitle}</div>
        <div class="tw-foot">
          <span class="dg-power ${metPower ? 'met' : 'warn'}">推荐 ${fl.recommendedPower}</span>
          <button type="button" class="xianxia-btn primary tw-enter-btn">${stars > 0 ? `再战 ◆+${fl.repeatJade}` : `首通 ◆+${fl.firstClearJade}`}</button>
        </div>
      `;
      card.querySelector('.tw-enter-btn')?.addEventListener('click', () => {
        this.closeDungeon();
        this.callbacks.onStartTower?.(fl.id);
      });
      this.towerFloorGrid.appendChild(card);
    }

    // 2. Roguelike 3-Path Synergy Pane
    this.roguelikeRecordText.textContent = `最高深处 ${store.getRoguelikeBestFloor()} / 6 境 · 累计通关 ${store.getRoguelikeClears()} 次`;
    this.roguelikePathsGrid.innerHTML = ROGUELIKE_PATHS.map(
      (p) => `
      <div class="rl-path-card" style="--rl-accent:${p.accentHex}">
        <div class="rl-path-head">
          <strong>${p.name}</strong>
          <span>${p.tag}</span>
        </div>
        <div class="rl-res-box"><b>${p.res2Title}</b><span>${p.res2Desc}</span></div>
        <div class="rl-res-box prime"><b>${p.res3Title}</b><span>${p.res3Desc}</span></div>
      </div>`,
    ).join('');

    this.dungeonCardGrid.innerHTML = '';
    for (const d of DUNGEON_LIST) {
      const clears = store.getDungeonClears(d.id);
      const metPower = power >= d.recommendedPower;
      const card = document.createElement('div');
      card.className = `dungeon-card tier-${d.tier}`;
      card.innerHTML = `
        <div class="dg-top">
          <span class="dg-tier">第 ${d.tier} 阶秘境</span>
          <span class="dg-clears">已刷 ${clears} 次</span>
        </div>
        <div class="dg-name">${d.name}</div>
        <div class="dg-sub">${d.subtitle}</div>
        <div class="dg-meta">
          <div class="dg-boss">镇守：<strong>${d.bossTitle}</strong></div>
          <div class="dg-drop">${d.dropRateText}</div>
          <div class="dg-power ${metPower ? 'met' : 'warn'}">推荐战力 ${d.recommendedPower}（${metPower ? '已达标' : '战力偏低'}）</div>
        </div>
        <button type="button" class="xianxia-btn primary dg-enter-btn">挑战爆装 · ◆+${d.jadeReward}</button>
      `;
      card.querySelector('.dg-enter-btn')?.addEventListener('click', () => {
        this.closeDungeon();
        this.callbacks.onStartDungeon(d.id);
      });
      this.dungeonCardGrid.appendChild(card);
    }

    const bounties = store.getBountyStates();
    this.bountyGrid.innerHTML = '';
    for (const b of bounties) {
      const rewardLabel = `◆+${b.def.rewardJade}${b.def.rewardRarity ? ` + ${RARITY_LABELS[b.def.rewardRarity]}装` : ''}`;
      const progressText = `${Math.min(b.progress, b.def.target)} / ${b.def.target}`;
      const card = document.createElement('div');
      card.className = `bounty-card${b.done && !b.claimed ? ' ready' : ''}${b.claimed ? ' claimed' : ''}`;
      const actionHtml = b.claimed
        ? '<span class="bounty-status claimed">已领</span>'
        : b.done
          ? `<button type="button" class="bounty-claim-btn" data-bounty-id="${b.def.id}">领取</button>`
          : '<span class="bounty-status">进行中</span>';
      card.innerHTML = `
        <div class="bn-top">
          <strong class="bn-title">${b.def.title}</strong>
          <span class="bn-reward">${rewardLabel}</span>
        </div>
        <div class="bn-desc">${b.def.desc}</div>
        <div class="bn-foot">
          <span class="bn-prog">${progressText}</span>
          ${actionHtml}
        </div>
      `;
      card.querySelector<HTMLButtonElement>('button[data-bounty-id]')?.addEventListener('click', () => {
        const res = this.callbacks.onClaimBounty(b.def.id);
        if (res.ok) {
          const dropTxt = res.droppedItem ? ` · 获【${res.droppedItem.name}】` : '';
          this.showDungeonToast(`赏格已领：+◆${res.jade}${dropTxt}`, true);
        } else {
          this.showDungeonToast(res.reason, false);
        }
        this.syncCampaignProgress(store, this.selectedStage);
      });
      this.bountyGrid.appendChild(card);
    }
  }

  openCampaignMap(chapterId?: ChapterId): void {
    if (chapterId) this.activeChapter = chapterId;
    else this.activeChapter = getStageDef(this.selectedStage).chapter;
    this.renderCampaignModal();
    this.campaignOverlay.classList.add('visible');
  }

  closeCampaignMap(): void {
    this.campaignOverlay.classList.remove('visible');
  }

  openStoryCodex(): void {
    this.renderCodexModal();
    this.codexOverlay.classList.add('visible');
  }

  closeStoryCodex(): void {
    this.codexOverlay.classList.remove('visible');
  }

  private renderCodexModal(): void {
    const store = this.saveStore;
    if (!store) return;

    const sh = getSwordHeartSummary(store.getSwordHeart());
    const totalChoices = sh.sword + sh.heart;
    const swordPct = totalChoices > 0 ? Math.round((sh.sword / totalChoices) * 100) : 50;
    this.codexKarmaBar.innerHTML = `
      <div class="karma-head">
        <div>
          <span class="karma-badge">${sh.title}</span>
          <span class="karma-desc">${sh.desc}</span>
        </div>
        <span class="karma-counts">剑道 ${sh.sword} · 侠心 ${sh.heart}</span>
      </div>
      <div class="karma-track">
        <div class="karma-fill-sword" style="width:${swordPct}%"></div>
      </div>
    `;

    const choicesMap = store.getStoryChoices();
    const seenEpilogues = new Set(store.getSeenEpilogues());
    const maxStageReached = Math.max(1, store.getMaxClearedStage(), store.getRecommendedStage());
    const unlockedEpisodes = CAMPAIGN_STAGES.filter((s) => s.id <= maxStageReached).length;
    const unlockedCount = unlockedEpisodes + DUNGEON_LIST.length + seenEpilogues.size;
    const totalEntries = CAMPAIGN_STAGES.length + DUNGEON_LIST.length + Object.keys(CHAPTER_EPILOGUES).length;
    this.codexCountPill.textContent = `已解锁 ${unlockedCount} / ${totalEntries}`;

    const tabDefs: Array<{ key: ChapterId | 'dungeon' | 'epilogue'; label: string }> = [
      ...CHAPTERS.map((ch) => ({ key: ch.id as ChapterId, label: `${ch.roman} · ${ch.name}` })),
      { key: 'dungeon', label: '秘境外传' },
      { key: 'epilogue', label: '五章终幕' },
    ];
    this.codexTabsEl.innerHTML = '';
    for (const t of tabDefs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `codex-tab${this.activeCodexTab === t.key ? ' active' : ''}`;
      btn.textContent = t.label;
      btn.addEventListener('click', () => {
        this.activeCodexTab = t.key;
        this.renderCodexModal();
      });
      this.codexTabsEl.appendChild(btn);
    }

    this.codexListEl.innerHTML = '';
    const appendCodexCard = (opts: {
      tag: string;
      title: string;
      sub: string;
      unlocked: boolean;
      choiceLabel?: string;
      kind: 'episode' | 'epilogue';
      id: number;
    }) => {
      const card = document.createElement('div');
      card.className = `codex-card${opts.unlocked ? '' : ' locked'}`;
      const choiceChip = opts.choiceLabel ? `<span class="codex-choice-tag">${opts.choiceLabel}</span>` : '';
      card.innerHTML = `
        <div class="codex-card-top">
          <span class="codex-tag">${opts.tag}</span>
          ${choiceChip}
        </div>
        <strong class="codex-title">${opts.title}</strong>
        <span class="codex-sub">${opts.sub}</span>
      `;
      const actBtn = document.createElement('button');
      actBtn.type = 'button';
      actBtn.className = 'util-btn codex-play-btn';
      actBtn.disabled = !opts.unlocked;
      actBtn.textContent = opts.unlocked ? '重温剧情' : '尚未解锁';
      if (opts.unlocked) {
        actBtn.addEventListener('click', () => {
          this.closeStoryCodex();
          this.callbacks.onReplayStory?.(opts.kind, opts.id);
        });
      }
      card.appendChild(actBtn);
      this.codexListEl.appendChild(card);
    };

    if (this.activeCodexTab === 'epilogue') {
      for (const ch of CHAPTERS) {
        const bossId = ch.stageRange[1];
        const ep = CHAPTER_EPILOGUES[bossId];
        if (!ep) continue;
        const unlocked = Boolean(store.getStageRecord(bossId)) || seenEpilogues.has(bossId);
        appendCodexCard({
          tag: ep.episodeTag,
          title: ep.title,
          sub: `${ep.chapterName} · ${ep.lines[0]?.text.slice(0, 32) ?? ''}…`,
          unlocked,
          kind: 'epilogue',
          id: bossId,
        });
      }
    } else if (this.activeCodexTab === 'dungeon') {
      for (const dg of DUNGEON_LIST) {
        appendCodexCard({
          tag: `外传 · T${dg.tier}`,
          title: dg.name,
          sub: dg.subtitle,
          unlocked: true,
          choiceLabel: choicesMap[dg.stageDef.id] ? '已抉择' : undefined,
          kind: 'episode',
          id: dg.stageDef.id,
        });
      }
    } else {
      const stages = CAMPAIGN_STAGES.filter((s) => s.chapter === this.activeCodexTab);
      for (const st of stages) {
        const cleared = Boolean(store.getStageRecord(st.id));
        const unlocked = st.id <= maxStageReached;
        const picked = choicesMap[st.id];
        const choiceLabel = picked
          ? picked.includes('heart') || picked.includes('guard') || picked.includes('breeze') || picked.includes('ward') || picked.includes('ice') || picked.includes('taiji')
            ? '侠骨仁心'
            : '凌霄剑道'
          : undefined;
        appendCodexCard({
          tag: `第 ${st.episodeNum} 集 · ${BIOME_LABELS[st.biome]}`,
          title: st.name,
          sub: cleared ? `已破关 · ${st.victoryLine}` : st.subtitle,
          unlocked,
          choiceLabel,
          kind: 'episode',
          id: st.id,
        });
      }
    }
  }

  openShop(cat?: EquipCategory | 'bag'): void {
    if (cat) this.activeShopCategory = cat;
    this.shopPreviewSpinOn = true;
    this.shopOverlay.classList.add('visible');
    this.appRoot.classList.add('shop-preview-open');
    this.syncShopPreviewButtonLabels();
    this.renderShopModal();
  }

  closeShop(): void {
    this.previewSkinId = null;
    this.previewWeaponId = null;
    this.previewArmorId = null;
    this.previewRelicId = null;
    this.previewBagUid = null;
    this.shopOverlay.classList.remove('visible');
    this.shopOverlay.classList.remove('preview-active');
    this.appRoot.classList.remove('shop-preview-open');
    this.callbacks.onShopPreview?.(false);
    if (this.currentScreenMode === 'camp') {
      this.renderCampPanel();
    }
  }

  private syncShopPreviewButtonLabels(): void {
    const mob = this.isMobileUi();
    this.shopPreviewSpinBtn.textContent = mob
      ? this.shopPreviewSpinOn
        ? '自旋:开'
        : '自旋:关'
      : this.shopPreviewSpinOn
        ? '自动旋转: 开'
        : '自动旋转: 关';
    this.shopPreviewResetBtn.textContent = mob ? '恢复' : '恢复已穿';
  }

  isMobileUi(): boolean {
    return (
      window.matchMedia('(pointer: coarse)').matches ||
      window.innerWidth <= 960 ||
      this.appRoot.classList.contains('mobile-mode')
    );
  }

  getActiveShopCategory(): EquipCategory | 'bag' {
    return this.activeShopCategory;
  }

  getShopEquippedSlotsCount(): number {
    return this.shopEquippedSlotsEl.querySelectorAll('.eq-slot-badge').length;
  }

  getMobileNotifyText(): string {
    return this.mobileNotifyPill.classList.contains('visible') ? this.mobileNotifyCurrentText : '';
  }

  showMobileNotify(
    text: string,
    tone: 'info' | 'gold' | 'warn' | 'err' = 'info',
    durationMs = 2800,
  ): void {
    const clean = text.trim();
    if (!clean) return;
    this.mobileNotifyCurrentText = clean;
    this.mobileNotifyIcon.textContent =
      tone === 'gold' ? '★' : tone === 'warn' ? '⚠' : tone === 'err' ? '✕' : '✦';
    this.mobileNotifyText.textContent = clean;
    this.mobileNotifyPill.classList.toggle('tone-gold', tone === 'gold');
    this.mobileNotifyPill.classList.toggle('tone-warn', tone === 'warn');
    this.mobileNotifyPill.classList.toggle('tone-err', tone === 'err');
    this.mobileNotifyPill.classList.add('visible');
    // Ensure legacy mobile banners never overlap the unified pill
    this.worldToastEl.classList.remove('visible');
    this.campToastEl.classList.remove('visible');
    this.subtitleBanner.classList.remove('visible');
    this.stageBanner.classList.remove('visible');
    if (this.mobileNotifyTimer !== null) {
      window.clearTimeout(this.mobileNotifyTimer);
    }
    this.mobileNotifyTimer = window.setTimeout(() => {
      this.mobileNotifyPill.classList.remove('visible');
      this.mobileNotifyCurrentText = '';
      this.mobileNotifyTimer = null;
    }, Math.max(1200, durationMs));
  }

  clearMobileNotify(): void {
    if (this.mobileNotifyTimer !== null) {
      window.clearTimeout(this.mobileNotifyTimer);
      this.mobileNotifyTimer = null;
    }
    this.mobileNotifyCurrentText = '';
    this.mobileNotifyPill.classList.remove('visible');
  }

  setCampTab(tab: 'cultivate' | 'meal'): void {
    this.campTabCultivateBtn.classList.toggle('active', tab === 'cultivate');
    this.campTabMealBtn.classList.toggle('active', tab === 'meal');
    this.campTabCultivateBody.classList.toggle('active', tab === 'cultivate');
    this.campTabMealBody.classList.toggle('active', tab === 'meal');
    if (this.campPanelCollapsed) {
      this.campPanelCollapsed = false;
      this.campPanel.classList.remove('collapsed');
      this.campCollapseBtn.setAttribute('aria-expanded', 'true');
      this.campCollapseBtn.textContent = '▾';
    }
  }

  showCampErrorToast(text: string): void {
    this.showCampToast(text, false);
  }

  showCampToast(text: string, ok: boolean): void {
    if (this.isMobileUi()) {
      this.showMobileNotify(text, ok ? 'info' : 'err', 2400);
      return;
    }
    this.campToastEl.textContent = text;
    this.campToastEl.classList.toggle('err', !ok);
    this.campToastEl.classList.add('visible');
    if (this.campToastTimer !== null) {
      window.clearTimeout(this.campToastTimer);
    }
    this.campToastTimer = window.setTimeout(() => {
      this.campToastEl.classList.remove('visible');
      this.campToastTimer = null;
    }, 2400);
  }

  private renderCampPanel(): void {
    const store = this.saveStore;
    if (!store) return;

    const jade = store.getJade();
    const cult = store.getCultivationBonus();
    const activeMeal = store.getActiveMeal();

    this.campRealmPill.textContent = cult.current.name;
    this.campJadePill.textContent = `◆ ${jade} 灵石`;
    if (activeMeal) {
      this.campMealBadge.textContent = `温养：${activeMeal.name}`;
      this.campMealBadge.classList.add('visible');
    } else {
      this.campMealBadge.textContent = '';
      this.campMealBadge.classList.remove('visible');
    }

    this.campRealmName.textContent = cult.current.name;
    this.campRealmLv.textContent = `Lv.${cult.current.level}`;
    const ultTxt = cult.startUltBonus > 0 ? ` · 开局剑意+${cult.startUltBonus}` : '';
    this.campRealmBonuses.textContent = `气血+${cult.hpBonus} · 剑伤+${cult.atkPct}% · 回气+${cult.spiritRegenPct}%${ultTxt}`;

    if (cult.next) {
      const canAfford = jade >= cult.next.costJade;
      this.campRealmNextBox.innerHTML = `
        <span class="next-lbl">下一境</span>
        <strong>${cult.next.name}</strong>
        <span class="next-desc">${cult.next.desc}</span>
      `;
      this.campCultivateBtn.textContent = `突破修为 ◆${cult.next.costJade}`;
      this.campCultivateBtn.disabled = !canAfford;
      this.campCultivateBtn.classList.toggle('locked', !canAfford);
    } else {
      this.campRealmNextBox.innerHTML = `
        <span class="next-lbl">已至化境</span>
        <strong>蜀山剑道圆满 · Lv.${CULTIVATION_STEPS.length - 1}</strong>
        <span class="next-desc">${cult.current.desc}</span>
      `;
      this.campCultivateBtn.textContent = '已至化境 · 圆满';
      this.campCultivateBtn.disabled = true;
      this.campCultivateBtn.classList.remove('locked');
    }

    this.campMealList.innerHTML = '';
    for (const meal of CAMP_MEALS) {
      const isSelected = activeMeal?.id === meal.id;
      const canAfford = meal.costJade === 0 || jade >= meal.costJade;
      const card = document.createElement('div');
      card.className = `camp-meal-card${isSelected ? ' active' : ''}`;
      const btnIdAttr = meal.id === 'meal_tea' ? 'id="btn-camp-meal"' : `id="btn-camp-meal-${meal.id}"`;
      const btnText = isSelected ? '温养生效中' : meal.costJade === 0 ? '免费品茗' : `温养 ◆${meal.costJade}`;
      card.innerHTML = `
        <div class="meal-head">
          <strong class="meal-name">${meal.name}</strong>
          <span class="meal-badge">${meal.badge}</span>
        </div>
        <div class="meal-desc">${meal.desc}</div>
        <button ${btnIdAttr} type="button" class="camp-meal-btn${isSelected ? ' active' : ''}${canAfford || isSelected ? '' : ' locked'}" data-meal-id="${meal.id}"${isSelected || !canAfford ? ' disabled' : ''}>${btnText}</button>
      `;
      card.querySelector<HTMLButtonElement>('.camp-meal-btn')?.addEventListener('click', () => {
        const res = this.callbacks.onCampSelectMeal(meal.id);
        this.showCampToast(res.ok ? `已备「${meal.name}」，下战生效` : res.reason, res.ok);
        this.renderCampPanel();
      });
      this.campMealList.appendChild(card);
    }
  }

  showStageDialogue(dlg: StageDialogueDef): void {
    this.dlgKicker.textContent = dlg.kicker || `${dlg.episodeTag} · ${dlg.biomeLabel}`;
    this.dlgTitle.textContent = dlg.title;
    this.dlgIntel.innerHTML = dlg.intel.map((t) => `<span class="dlg-chip">${t}</span>`).join('');
    this.dlgLines.innerHTML = dlg.lines
      .map(
        (line, idx) => `
      <div class="dlg-line role-${line.role}" style="--line-idx:${idx}">
        <span class="dlg-seal">${line.seal}</span>
        <div class="dlg-bubble">
          <div class="dlg-speaker">${line.speaker}</div>
          <div class="dlg-text">${line.text}</div>
        </div>
      </div>`,
      )
      .join('');

    const choices: EpisodeChoiceDef[] = dlg.choices ?? [];
    this.selectedDialogueChoiceId = choices[0]?.id;
    this.dlgChoices.innerHTML = '';
    this.dlgChoices.style.display = choices.length > 0 ? 'grid' : 'none';
    this.dlgTip.textContent = dlg.tipText ?? '阅毕战前秘报，点击确认即刻入阵对决';
    this.dlgConfirmBtn.textContent = dlg.confirmLabel ?? '确定 · 拔剑开战';

    const syncHeroChoiceReply = (choice: EpisodeChoiceDef | undefined, animate: boolean) => {
      if (!choice?.heroReply) return;
      const heroLines = this.dlgLines.querySelectorAll<HTMLElement>('.dlg-line.role-hero');
      const targetLine = heroLines.length > 0 ? heroLines[heroLines.length - 1] : null;
      const txtEl = targetLine?.querySelector<HTMLElement>('.dlg-text');
      if (targetLine && txtEl) {
        txtEl.textContent = choice.heroReply;
        if (animate) {
          targetLine.classList.remove('dlg-line-flash');
          void targetLine.offsetWidth;
          targetLine.classList.add('dlg-line-flash');
        }
      }
    };

    if (choices.length > 0) {
      syncHeroChoiceReply(choices[0], false);
    }

    choices.forEach((choice, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `dlg-choice-card${idx === 0 ? ' active' : ''}`;
      btn.dataset.choiceId = choice.id;
      const hintHtml = choice.storyHint ? `<div class="dlg-choice-hint">${choice.storyHint}</div>` : '';
      const alignTag =
        dlg.mode === 'preStage'
          ? choice.alignment === 'heart' || idx === 1
            ? '抉择 · 乙 · 仁心'
            : '抉择 · 甲 · 剑道'
          : idx === 0
            ? '抉择 · 甲'
            : '抉择 · 乙';
      btn.innerHTML = `
        <div class="dlg-choice-top">
          <span class="dlg-choice-tag">${alignTag}</span>
          <strong class="dlg-choice-title">${choice.title}</strong>
        </div>
        ${hintHtml}
        <div class="dlg-choice-sub">${choice.subtitle}</div>
      `;
      btn.addEventListener('click', () => {
        this.selectedDialogueChoiceId = choice.id;
        for (const sib of Array.from(this.dlgChoices.children)) {
          sib.classList.remove('active');
        }
        btn.classList.add('active');
        syncHeroChoiceReply(choice, true);
        this.callbacks.onDialogueChoiceSelect?.(choice.id);
      });
      this.dlgChoices.appendChild(btn);
    });

    this.setMode('dialogue');
  }

  setCampInteractPrompt(label: string | null): void {
    if (!label) {
      this.campInteractBtn.classList.remove('visible');
      return;
    }
    this.campInteractLabel.textContent = label;
    this.campInteractBtn.classList.add('visible');
  }

  updateCampNpcLabels(items: Array<{ label: string; x: number; y: number; ally?: boolean }>): void {
    if (items.length === 0) {
      if (this.campNpcLabels.childElementCount > 0) this.campNpcLabels.innerHTML = '';
      return;
    }
    this.campNpcLabels.innerHTML = items
      .map(
        (it) =>
          `<span class="camp-npc-tag${it.ally ? ' ally' : ''}" style="left:${it.x.toFixed(1)}px;top:${it.y.toFixed(1)}px">${it.label}</span>`,
      )
      .join('');
  }

  private renderShopModal(): void {
    const store = this.saveStore;
    if (!store) return;

    const jade = store.getJade();
    const equipped = store.getEquipped();
    const inventory = store.getInventory();
    const stats = computeHeroLoadoutStats(equipped, store.data.upgrades, inventory);
    const realm = getSwordRealm(store.getTotalStars());
    const power = computeCombatPower(realm.hpBonus, realm.dmgMult, stats);

    this.shopJadeBalance.textContent = `◆ ${jade} 灵石`;
    this.shopPowerPill.textContent = `剑道战力 ${power}`;

    const totalHp = realm.hpBonus + stats.maxHpBonus;
    const totalAtkPct = Math.round((realm.dmgMult * stats.dmgMult - 1) * 100);
    const critPct = Math.round(stats.critRate * 100);
    const reducePct = Math.round(stats.dmgReduce * 100);
    const extras: string[] = [];
    if (stats.lifesteal > 0) extras.push(`吸血${Math.round(stats.lifesteal * 100)}%`);
    if (stats.parryReflectBonus > 0) extras.push(`弹反反伤+${Math.round(stats.parryReflectBonus * 100)}%`);
    if (stats.killHealPct > 0) extras.push(`斩敌回血${Math.round(stats.killHealPct * 100)}%`);
    this.shopPowerSummary.textContent = `总加护：气血+${totalHp} · 剑伤+${totalAtkPct}% · 暴击${critPct}% · 减伤${reducePct}%${extras.length ? ` · ${extras.join(' · ')}` : ''}`;
    this.shopBattleBtn.textContent =
      this.currentScreenMode === 'paused'
        ? '返回试剑'
        : this.currentScreenMode === 'camp'
          ? '返回剑庐'
          : `出征 第 ${this.selectedStage} 关`;

    const prevScrollTop = this.shopGridEl.scrollTop;

    this.shopTabsEl.innerHTML = '';
    const categories: EquipCategory[] = ['weapon', 'armor', 'relic', 'skin'];
    for (const cat of categories) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = `shop-tab${cat === this.activeShopCategory ? ' active' : ''}`;
      tab.innerHTML = `<strong>${CATEGORY_LABELS[cat]}</strong><span>${store.getEquippedItemName(cat)}</span>`;
      tab.addEventListener('click', () => {
        this.activeShopCategory = cat;
        this.shopGridEl.scrollTop = 0;
        this.renderShopModal();
      });
      this.shopTabsEl.appendChild(tab);
    }

    const bagTab = document.createElement('button');
    bagTab.type = 'button';
    bagTab.className = `shop-tab bag-tab${this.activeShopCategory === 'bag' ? ' active' : ''}`;
    bagTab.innerHTML = `<strong>打宝背包</strong><span>${inventory.length}/${MAX_INVENTORY_SIZE}</span>`;
    bagTab.addEventListener('click', () => {
      this.activeShopCategory = 'bag';
      this.shopGridEl.scrollTop = 0;
      this.renderShopModal();
    });
    this.shopTabsEl.appendChild(bagTab);

    this.shopGridEl.innerHTML = '';

    // Populate Left-Side 4 Live Equipped Slots (武器 / 护甲 / 灵宝 / 皮肤)
    const rarityClasses: EquipRarity[] = ['common', 'rare', 'epic', 'legendary'];
    for (const cat of categories) {
      const slotEl = this.eqSlotBtns[cat];
      const eqId = equipped[cat];
      const rolledEq = cat !== 'skin' ? inventory.find((g) => g.uid === eqId) : undefined;
      const shopEq = SHOP_ITEM_MAP[rolledEq ? rolledEq.templateId : eqId];
      const slotName = rolledEq ? rolledEq.name : (shopEq?.name ?? store.getEquippedItemName(cat));
      const slotRarity: EquipRarity = rolledEq ? rolledEq.rarity : (shopEq?.rarity ?? 'common');
      const nameEl = slotEl.querySelector<HTMLElement>('.eq-slot-name');
      if (nameEl) nameEl.textContent = slotName;
      for (const rc of rarityClasses) {
        slotEl.classList.toggle(`rarity-${rc}`, rc === slotRarity);
      }
      slotEl.classList.toggle('active', this.activeShopCategory === cat);
    }

    const isShopVisible = this.shopOverlay.classList.contains('visible');
    this.shopOverlay.classList.toggle('preview-active', isShopVisible);
    this.appRoot.classList.toggle('shop-preview-open', isShopVisible);
    this.syncShopPreviewButtonLabels();

    const resolveEffectivePreviewIds = (): {
      skinId: string;
      weaponId: string;
      armorId: string;
      relicId: string;
    } => {
      let skinId = this.previewSkinId ?? equipped.skin;
      let weaponId = this.previewWeaponId ?? equipped.weapon;
      let armorId = this.previewArmorId ?? equipped.armor;
      let relicId = this.previewRelicId ?? equipped.relic;
      if (this.activeShopCategory === 'bag' && this.previewBagUid) {
        const rolled = inventory.find((g) => g.uid === this.previewBagUid);
        if (rolled) {
          if (rolled.category === 'weapon') weaponId = rolled.uid;
          else if (rolled.category === 'armor') armorId = rolled.uid;
          else if (rolled.category === 'relic') relicId = rolled.uid;
        }
      }
      return { skinId, weaponId, armorId, relicId };
    };

    if (isShopVisible) {
      const eff = resolveEffectivePreviewIds();
      if (this.activeShopCategory === 'bag') {
        const sortedPreview = [...inventory].sort((a, b) => b.powerScore - a.powerScore);
        const activeBagItem =
          (this.previewBagUid ? inventory.find((g) => g.uid === this.previewBagUid) : undefined) ??
          sortedPreview[0];
        if (activeBagItem) {
          const isBagEq = equipped[activeBagItem.category] === activeBagItem.uid;
          const rolledStatsStr = formatCompactItemStats(getRolledItemStats(activeBagItem));
          this.shopPreviewName.textContent = `3D 试穿 · ${activeBagItem.name}${isBagEq ? '（已穿戴）' : '（背囊试穿）'}`;
          this.shopPreviewSub.textContent = `${RARITY_LABELS[activeBagItem.rarity]} ${CATEGORY_LABELS[activeBagItem.category]} · 品质 ${activeBagItem.qualityPct}% · 拖动 360° 观赏`;
          this.shopPreviewStats.textContent = rolledStatsStr
            ? `战力 ${activeBagItem.powerScore} · ${rolledStatsStr}`
            : `战力 ${activeBagItem.powerScore} · 气血+${totalHp} · 剑伤+${totalAtkPct}%`;
          if (isBagEq) {
            this.shopPreviewActionBtn.textContent = '已穿戴';
            this.shopPreviewActionBtn.disabled = true;
          } else {
            this.shopPreviewActionBtn.textContent = '穿戴此神兵';
            this.shopPreviewActionBtn.disabled = false;
          }
        } else {
          this.shopPreviewName.textContent = `3D 实时外观 · ${store.getEquippedItemName('skin')}`;
          this.shopPreviewSub.textContent = '背囊暂无打宝装备 · 当前展示已穿戴全套外观';
          this.shopPreviewStats.textContent = `气血+${totalHp} · 剑伤+${totalAtkPct}% · 暴击${critPct}% · 减伤${reducePct}%`;
          this.shopPreviewActionBtn.textContent = '已穿戴';
          this.shopPreviewActionBtn.disabled = true;
        }
      } else {
        const targetId =
          this.activeShopCategory === 'skin'
            ? eff.skinId
            : this.activeShopCategory === 'weapon'
              ? eff.weaponId
              : this.activeShopCategory === 'armor'
                ? eff.armorId
                : eff.relicId;
        const rolledMatch =
          this.activeShopCategory !== 'skin'
            ? inventory.find((g) => g.uid === targetId)
            : undefined;
        const pvItem = SHOP_ITEM_MAP[rolledMatch ? rolledMatch.templateId : targetId];
        if (pvItem) {
          const pvOwned = Boolean(rolledMatch) || store.isOwned(pvItem.id);
          const pvEquipped = rolledMatch
            ? equipped[rolledMatch.category] === rolledMatch.uid
            : equipped[pvItem.category] === pvItem.id;
          const displayName = rolledMatch ? rolledMatch.name : pvItem.name;
          this.shopPreviewName.textContent = `3D 试穿 · ${displayName}${pvEquipped ? '（已穿戴）' : pvOwned ? '（已拥有）' : '（未购入试穿中）'}`;
          this.shopPreviewSub.textContent = `${pvItem.desc} · 拖动 360° 观赏`;
          const statStr = formatCompactItemStats(rolledMatch ? getRolledItemStats(rolledMatch) : pvItem.stats);
          this.shopPreviewStats.textContent =
            statStr || `总加护：气血+${totalHp} · 剑伤+${totalAtkPct}% · 暴击${critPct}% · 减伤${reducePct}%`;
          if (pvEquipped) {
            this.shopPreviewActionBtn.textContent = '已穿戴';
            this.shopPreviewActionBtn.disabled = true;
          } else if (pvOwned) {
            this.shopPreviewActionBtn.textContent = '穿戴此装';
            this.shopPreviewActionBtn.disabled = false;
          } else {
            this.shopPreviewActionBtn.textContent = `购入并穿戴 ◆${pvItem.price}`;
            this.shopPreviewActionBtn.disabled = jade < pvItem.price;
          }
        }
      }
      this.callbacks.onShopPreview?.(true, eff.skinId, eff.weaponId, eff.armorId, eff.relicId);
    } else {
      this.callbacks.onShopPreview?.(false);
    }

    if (this.activeShopCategory === 'bag') {
      const equippedSet = new Set(Object.values(equipped));
      const hasSalvageableLow = inventory.some(
        (g) => !equippedSet.has(g.uid) && (g.rarity === 'common' || g.rarity === 'rare'),
      );
      this.shopBagBar.classList.add('visible');
      this.shopBagBar.innerHTML = `
        <span class="bag-cap-txt">秘境背囊 ${inventory.length} / ${MAX_INVENTORY_SIZE}（已穿戴装备不会分解）</span>
        <button id="btn-salvage-low" type="button" class="shop-salvage-low-btn"${hasSalvageableLow ? '' : ' disabled'}>一键分解 凡/灵品</button>
      `;
      this.shopBagBar.querySelector<HTMLButtonElement>('#btn-salvage-low')?.addEventListener('click', () => {
        const res = this.callbacks.onSalvageLow('rare');
        this.showShopToast(
          res.count > 0 ? `分解 ${res.count} 件凡/灵品 · 获得 ◆${res.jade}` : '暂无可分解的未穿戴凡/灵品',
          res.count > 0,
        );
        this.renderShopModal();
      });

      const sorted = [...inventory].sort((a, b) => b.powerScore - a.powerScore);
      if (sorted.length === 0) {
        this.shopGridEl.innerHTML =
          '<div class="bag-empty-state">背囊空空如也。前往「秘境打宝」斩妖除魔，即可掉落随机品质与极品词条神兵！</div>';
      } else {
        for (const item of sorted) {
          const isEquipped = equipped[item.category] === item.uid;
          const isBagPreviewing = this.previewBagUid === item.uid;
          const eqScore = store.getEquippedScore(item.category);
          const scoreDelta = item.powerScore - eqScore;
          const canForge = item.forgeLevel < MAX_FORGE_LEVEL;
          const forgeCost = canForge ? getRolledUpgradeCost(item) : 0;
          const canAffordForge = jade >= forgeCost;
          const salvageJade = getSalvageJade(item);

          const card = document.createElement('div');
          card.className = `shop-card bag-card rarity-${item.rarity}${isEquipped ? ' equipped' : ''}${isBagPreviewing ? ' previewing' : ''}`;
          card.dataset.uid = item.uid;

          const lvTag = item.forgeLevel > 0 ? `<span class="forge-lv">+${item.forgeLevel}</span>` : '';
          const eqTag = isEquipped ? '<span class="eq-pill">已穿戴</span>' : '';
          const deltaHtml =
            !isEquipped && scoreDelta > 0
              ? `<span class="power-delta-up">↑ +${scoreDelta} 战力</span>`
              : '';
          const affixHtml = item.affixes
            .map(
              (af) =>
                `<span class="bag-affix${af.tier === 'prime' ? ' prime' : ''}">${af.tier === 'prime' ? '【极品】' : ''}${af.label}</span>`,
            )
            .join('');

          const tryOnBtn = `<button type="button" class="shop-act-btn preview" data-bag-act="preview">${isBagPreviewing ? '试穿中' : '试穿'}</button>`;
          const equipBtn = isEquipped
            ? '<span class="shop-done-lbl">生效中</span>'
            : `<button type="button" class="shop-act-btn equip" data-bag-act="equip">穿戴</button>`;
          const forgeBtn = canForge
            ? `<button type="button" class="shop-act-btn forge${canAffordForge ? '' : ' locked'}" data-bag-act="upgrade"${canAffordForge ? '' : ' disabled'}>淬炼 ◆${forgeCost}</button>`
            : '<span class="shop-done-lbl max">满阶</span>';
          const salvageBtn = `<button type="button" class="shop-act-btn salvage" data-bag-act="salvage">分解 +◆${salvageJade}</button>`;

          card.innerHTML = `
            <div class="shop-card-top">
              <span class="rarity-pill rarity-${item.rarity}">${RARITY_LABELS[item.rarity]}</span>
              <span class="shop-badge">${CATEGORY_LABELS[item.category]}</span>
              <span class="quality-pill">品质 ${item.qualityPct}%</span>
              ${lvTag}${eqTag}
            </div>
            <div class="shop-card-mid">
              <div class="shop-card-name">${item.name}</div>
            </div>
            <div class="bag-power-row">
              <span class="bag-power-score">战力 ${item.powerScore}</span>
              ${deltaHtml}
            </div>
            <div class="bag-affix-list">${affixHtml}</div>
            <div class="shop-card-actions">${tryOnBtn}${equipBtn}${forgeBtn}${salvageBtn}</div>
          `;

          card.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('button[data-bag-act]:not([data-bag-act="preview"])')) return;
            this.previewBagUid = item.uid;
            this.renderShopModal();
          });
          card.querySelector('[data-bag-act="preview"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.previewBagUid = item.uid;
            this.renderShopModal();
          });
          card.querySelector('[data-bag-act="equip"]')?.addEventListener('click', () => {
            const ok = this.callbacks.onEquipRolled(item.uid);
            if (ok) {
              this.previewBagUid = item.uid;
              this.showShopToast(`已穿戴「${item.name}」`, true);
            }
            this.renderShopModal();
          });
          card.querySelector('[data-bag-act="upgrade"]')?.addEventListener('click', () => {
            const res = this.callbacks.onUpgradeRolled(item.uid);
            this.showShopToast(res.ok ? `「${item.name}」淬炼至 +${res.level}` : res.reason, res.ok);
            this.renderShopModal();
          });
          card.querySelector('[data-bag-act="salvage"]')?.addEventListener('click', () => {
            if (this.previewBagUid === item.uid) this.previewBagUid = null;
            const res = this.callbacks.onSalvageRolled(item.uid);
            this.showShopToast(res.ok ? `分解「${item.name}」· +◆${res.jade}` : res.reason, res.ok);
            this.renderShopModal();
          });

          this.shopGridEl.appendChild(card);
        }
      }

      this.shopGridEl.scrollTop = prevScrollTop;
      return;
    }

    this.shopBagBar.classList.remove('visible');
    this.shopBagBar.innerHTML = '';

    const items = SHOP_ITEMS.filter((it) => it.category === this.activeShopCategory);
    for (const item of items) {
      const owned = store.isOwned(item.id);
      const isEquipped = equipped[item.category] === item.id;
      const lv = store.getUpgradeLevel(item.id);
      const canForge = owned && item.category !== 'skin' && lv < MAX_FORGE_LEVEL;
      const forgeCost = canForge ? getUpgradeCost(item, lv) : 0;

      const card = document.createElement('div');
      card.className = `shop-card rarity-${item.rarity}${isEquipped ? ' equipped' : ''}`;
      card.dataset.itemId = item.id;

      let swatchHtml = '';
      if (item.skinVisual) {
        swatchHtml = `<div class="swatch-row"><span class="swatch" style="background:${item.skinVisual.primaryHex}"></span><span class="swatch" style="background:${item.skinVisual.secondaryHex}"></span><span class="swatch" style="background:${item.skinVisual.accentHex}"></span></div>`;
      } else if (item.weaponVisual) {
        swatchHtml = `<div class="swatch-row"><span class="swatch" style="background:${item.weaponVisual.steelHex}"></span><span class="swatch" style="background:${item.weaponVisual.emissiveHex}"></span></div>`;
      } else if (item.category === 'armor' && ARMOR_SWATCH_COLORS[item.id]) {
        const [c1, c2] = ARMOR_SWATCH_COLORS[item.id];
        swatchHtml = `<div class="swatch-row"><span class="swatch" style="background:${c1}"></span><span class="swatch" style="background:${c2}"></span></div>`;
      } else if (item.category === 'relic' && RELIC_SWATCH_COLORS[item.id]) {
        const [c1, c2] = RELIC_SWATCH_COLORS[item.id];
        swatchHtml = `<div class="swatch-row"><span class="swatch" style="background:${c1}"></span><span class="swatch" style="background:${c2}"></span></div>`;
      }

      const lvTag = item.category !== 'skin' && lv > 0 ? `<span class="forge-lv">+${lv}</span>` : '';
      const eqTag = isEquipped ? '<span class="eq-pill">已穿戴</span>' : '';
      const isPreviewing =
        (item.category === 'skin' && (this.previewSkinId ?? equipped.skin) === item.id) ||
        (item.category === 'weapon' && (this.previewWeaponId ?? equipped.weapon) === item.id) ||
        (item.category === 'armor' && (this.previewArmorId ?? equipped.armor) === item.id) ||
        (item.category === 'relic' && (this.previewRelicId ?? equipped.relic) === item.id);
      if (isPreviewing) card.classList.add('previewing');

      let actionsHtml = '';
      const tryOnBtn = `<button type="button" class="shop-act-btn preview" data-act="preview" data-id="${item.id}">${isPreviewing ? '试穿中' : '试穿'}</button>`;
      if (!owned) {
        const afford = jade >= item.price;
        actionsHtml = `${tryOnBtn}<button type="button" class="shop-act-btn buy${afford ? '' : ' locked'}" data-act="buy" data-id="${item.id}"${afford ? '' : ' disabled'}>购入 ◆${item.price}</button>`;
      } else {
        const equipBtn = isEquipped
          ? '<span class="shop-done-lbl">生效中</span>'
          : `<button type="button" class="shop-act-btn equip" data-act="equip" data-id="${item.id}">穿戴</button>`;
        const canAffordForge = jade >= forgeCost;
        const forgeBtn =
          item.category === 'skin'
            ? ''
            : lv >= MAX_FORGE_LEVEL
              ? '<span class="shop-done-lbl max">满阶 +5</span>'
              : `<button type="button" class="shop-act-btn forge${canAffordForge ? '' : ' locked'}" data-act="upgrade" data-id="${item.id}"${canAffordForge ? '' : ' disabled'}>淬炼 ◆${forgeCost}</button>`;
        actionsHtml = `${tryOnBtn}${equipBtn}${forgeBtn}`;
      }

      card.innerHTML = `
        <div class="shop-card-top">
          <span class="rarity-pill rarity-${item.rarity}">${RARITY_LABELS[item.rarity]}</span>
          <span class="shop-badge">${item.badge}</span>
          ${lvTag}${eqTag}
        </div>
        <div class="shop-card-mid">
          ${swatchHtml}
          <div class="shop-card-name">${item.name}</div>
        </div>
        <div class="shop-card-desc">${item.desc}</div>
        <div class="shop-card-actions">${actionsHtml}</div>
      `;

      const applyCardPreview = (id: string) => {
        if (item.category === 'skin') this.previewSkinId = id;
        else if (item.category === 'weapon') this.previewWeaponId = id;
        else if (item.category === 'armor') this.previewArmorId = id;
        else if (item.category === 'relic') this.previewRelicId = id;
      };

      card.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('button[data-act]:not([data-act="preview"])')) return;
        applyCardPreview(item.id);
        this.renderShopModal();
      });

      for (const btn of Array.from(card.querySelectorAll<HTMLButtonElement>('button[data-act]'))) {
        btn.addEventListener('click', (e) => {
          const act = btn.dataset.act;
          const id = btn.dataset.id ?? '';
          if (act === 'preview') {
            e.stopPropagation();
            applyCardPreview(id);
            this.renderShopModal();
            return;
          }
          if (act === 'buy') {
            const res = this.callbacks.onShopBuy(id);
            if (res.ok) applyCardPreview(id);
            this.showShopToast(res.ok ? `已购入并穿戴「${item.name}」` : res.reason, res.ok);
          } else if (act === 'equip') {
            const ok = this.callbacks.onShopEquip(id);
            if (ok) {
              applyCardPreview(id);
              this.showShopToast(`已换装「${item.name}」`, true);
            }
          } else if (act === 'upgrade') {
            const res = this.callbacks.onShopUpgrade(id);
            this.showShopToast(res.ok ? `「${item.name}」淬炼至 +${res.level}` : res.reason, res.ok);
          }
          this.renderShopModal();
        });
      }

      this.shopGridEl.appendChild(card);
    }

    this.shopGridEl.scrollTop = prevScrollTop;
  }

  private showShopToast(text: string, ok: boolean): void {
    this.shopToastEl.textContent = text;
    this.shopToastEl.classList.toggle('err', !ok);
    this.shopToastEl.classList.add('visible');
    if (this.shopToastTimer !== null) {
      window.clearTimeout(this.shopToastTimer);
    }
    this.shopToastTimer = window.setTimeout(() => {
      this.shopToastEl.classList.remove('visible');
      this.shopToastTimer = null;
    }, 2200);
  }

  selectStage(stageId: number): void {
    this.selectedStage = clamp(Math.floor(stageId), 1, CAMPAIGN_STAGES.length);
    const st = getStageDef(this.selectedStage);
    this.activeChapter = st.chapter;
    this.updateSelectedStageLabels();
    this.renderCampaignModal();
  }

  private updateSelectedStageLabels(): void {
    const st = getStageDef(this.selectedStage);
    const ch = getChapterDef(st.chapter);
    this.titleSelectedStage.textContent = `当前目标：第 ${st.episodeNum} 集 · ${st.name}`;
    this.titleSelectedMeta.textContent = `${ch.roman} ${ch.name} · ${BIOME_LABELS[st.biome]} · ${st.badge}`;
    this.startBtn.textContent = `仗剑出征 · 第 ${st.id} 关`;
    this.campDepartBtn.textContent = `启程 · 第 ${st.episodeNum} 集`;
    this.mapLaunchBtn.textContent = `单人挑战第 ${st.id} 关`;
    this.mapCoopBtn.textContent = `双人组队第 ${st.id} 关`;
  }

  private renderCampaignModal(): void {
    const store = this.saveStore;
    const recommended = store?.getRecommendedStage() ?? 1;

    // 1. Render 4 Chapter Tabs
    this.chapterTabsEl.innerHTML = '';
    for (const ch of CHAPTERS) {
      let chStars = 0;
      for (let id = ch.stageRange[0]; id <= ch.stageRange[1]; id++) {
        chStars += store?.getStageRecord(id)?.stars ?? 0;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `chapter-tab${ch.id === this.activeChapter ? ' active' : ''}`;
      btn.style.setProperty('--ch-accent', ch.accentHex);
      btn.innerHTML = `<span class="ch-roman">${ch.roman}</span><strong>${ch.name}</strong><span class="ch-stars">★ ${chStars}/15</span>`;
      btn.addEventListener('click', () => {
        this.activeChapter = ch.id;
        // If current selectedStage isn't in this chapter, auto-focus first stage of chapter
        const cur = getStageDef(this.selectedStage);
        if (cur.chapter !== ch.id) {
          this.selectedStage = ch.stageRange[0];
          this.updateSelectedStageLabels();
        }
        this.renderCampaignModal();
      });
      this.chapterTabsEl.appendChild(btn);
    }

    // 2. Chapter Lore Strip + Chapter Star Chests + Difficulty Switch
    const activeCh = getChapterDef(this.activeChapter);
    this.chapterLoreEl.style.setProperty('--ch-accent', activeCh.accentHex);
    this.chapterLoreEl.innerHTML = `<b>${activeCh.roman} · ${activeCh.name}（第 ${activeCh.stageRange[0]}–${activeCh.stageRange[1]} 关）</b><span>${activeCh.lore}</span>`;

    this.renderDifficultyBar(this.campaignDiffBar);
    const chStarsNow = store?.getChapterStars(this.activeChapter) ?? 0;
    this.chapterChestBar.innerHTML = '';
    for (const cDef of CHAPTER_STAR_CHESTS.filter((c) => c.chapter === this.activeChapter)) {
      const claimed = store?.isChapterChestClaimed(cDef.id) ?? false;
      const ready = !claimed && chStarsNow >= cDef.starsReq;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `chest-pill${ready ? ' ready' : ''}${claimed ? ' claimed' : ''}`;
      btn.disabled = !ready;
      btn.textContent = claimed ? `✓ ${cDef.label}` : ready ? `领取 ${cDef.label}` : `${cDef.label}`;
      btn.addEventListener('click', () => {
        const res = this.callbacks.onClaimChapterChest?.(cDef.id);
        if (res && store) {
          this.showShopToast(res.reason, res.ok);
          this.syncCampaignProgress(store, this.selectedStage);
        }
      });
      this.chapterChestBar.appendChild(btn);
    }

    // 3. Render 5 Stage Cards for Active Chapter
    this.stageGridEl.innerHTML = '';
    const chapterStages = CAMPAIGN_STAGES.filter((s) => s.chapter === this.activeChapter);
    for (const st of chapterStages) {
      const rec = store?.getStageRecord(st.id) ?? null;
      const earned = rec?.stars ?? 0;
      const isSelected = st.id === this.selectedStage;
      const isRec = st.id === recommended;
      const card = document.createElement('button');
      card.type = 'button';
      card.dataset.stageId = String(st.id);
      card.className = `stage-card${isSelected ? ' selected' : ''}${st.isBossStage ? ' boss-card' : ''}${earned > 0 ? ' cleared' : ''}`;
      const starHtml = [1, 2, 3]
        .map((n) => `<span class="sc-star${n <= earned ? ' lit' : ''}">★</span>`)
        .join('');
      const hazardChip = st.hazardLabel ? `<span class="sc-hazard">${st.hazardLabel}</span>` : '';
      const modeChip =
        st.stageMode && st.stageMode !== 'exterminate'
          ? `<span class="sc-mode">${STAGE_MODE_LABELS[st.stageMode]}</span>`
          : '';
      const recTag = isRec ? '<span class="sc-rec">推荐</span>' : '';
      card.innerHTML = `
        <div class="sc-top">
          <span class="sc-num">第 ${st.episodeNum} 集</span>
          <span class="sc-badge${st.isBossStage ? ' boss' : ''}">${st.badge}</span>
          ${recTag}
        </div>
        <div class="sc-name">${st.name}</div>
        <div class="sc-sub">${st.subtitle}</div>
        <div class="sc-tags">
          <span class="sc-biome biome-${st.biome}">[${BIOME_LABELS[st.biome]}]</span>
          ${modeChip}
          <span class="sc-wave">${st.waves.length}波</span>
          <span class="sc-time">${st.parTimeSec}s</span>
          ${hazardChip}
        </div>
        <div class="sc-stars">${starHtml}</div>
      `;
      card.addEventListener('click', () => {
        this.selectedStage = st.id;
        this.updateSelectedStageLabels();
        this.renderCampaignModal();
      });
      this.stageGridEl.appendChild(card);
    }

    // 4. Selected Stage Detail Footer
    const sel = getStageDef(this.selectedStage);
    const totalEnemies = sel.waves.reduce((acc, w) => acc + w.enemies.length, 0);
    const rec = store?.getStageRecord(sel.id);
    const bestStr = rec ? `最佳 ${Math.round(rec.bestTime)}s · ${rec.maxCombo}连` : '尚未首通';
    this.campaignDetailEl.innerHTML = `
      <div class="cd-title">第 ${sel.episodeNum} 集 · ${sel.name} <span>[${BIOME_LABELS[sel.biome]}] · 推荐：${sel.recommendedRealm}</span></div>
      <div class="cd-sub">${sel.waves.length} 波共 ${totalEnemies} 敌 · 三星时限 ${sel.parTimeSec}s${sel.hazardLabel ? ` · 场地机制：${sel.hazardLabel}` : ''} · ${bestStr}</div>
    `;
  }

  setRealmAndBlessings(realmTitle: string, blessingCount: number): void {
    this.hudRealmName.textContent = realmTitle;
    if (blessingCount > 0) {
      this.hudBlessingPill.textContent = `赐福×${blessingCount}`;
      this.hudBlessingPill.classList.add('visible');
    } else {
      this.hudBlessingPill.textContent = '';
      this.hudBlessingPill.classList.remove('visible');
    }
  }

  applyMobileMode(enabled: boolean): void {
    this.appRoot.classList.toggle('mobile-mode', enabled);
    this.pauseDesc.textContent = '暂歇剑势，随时继续试剑。';
    this.lastMobileCodexState = this.isMobileUi();
    this.populateComboCodex(this.q('#title-combo-codex'));
    this.populateComboCodex(this.q('#pause-combo-codex'));
    this.syncShopPreviewButtonLabels();
    if (enabled) {
      this.setWheelForced(true);
      this.titleTagline.textContent = '写实 3D 仙侠五章二十五关闯关 · 三星评星与剑道境界养成 · 手机双摇杆王者轮盘 · 跨端双人联机。';
    } else {
      this.titleTagline.textContent = '写实 3D 仙侠五章二十五关闯关 · 三星评星与剑道境界养成 · 电脑联盟鼠标 / 手机王者轮盘 · 跨端双人联机。';
    }
  }

  setWheelForced(enabled: boolean): void {
    this.wheelForced = enabled;
    this.appRoot.classList.toggle('force-wheel', enabled);
    this.wheelToggleBtn.textContent = enabled ? '键鼠' : '轮盘';
    this.wheelToggleBtn.classList.toggle('active-mode', enabled);
  }

  setHeroName(name: string): void {
    this.heroTitleName.textContent = name;
  }

  setMpLobbyStatus(text: string, connected: boolean, showLeave = false): void {
    this.mpConnDot.classList.toggle('online', connected);
    if (!text) {
      this.mpStatusBar.classList.remove('visible');
      this.mpStatusText.textContent = '';
      return;
    }
    this.mpStatusText.textContent = text;
    this.mpStatusBar.classList.add('visible');
    this.q('#btn-mp-leave').style.display = showLeave ? 'inline-flex' : 'none';
  }

  setMpHudBadge(text: string): void {
    if (!text) {
      this.mpHudBadge.classList.remove('visible');
      this.mpHudBadge.textContent = '';
      return;
    }
    this.mpHudBadge.textContent = text;
    this.mpHudBadge.classList.add('visible');
  }

  triggerSkillPulse(slot: 'Q' | 'E' | 'R' | 'F'): void {
    const els =
      slot === 'Q'
        ? [this.slotQ, this.tSlotQ]
        : slot === 'E'
          ? [this.slotE, this.tSlotE]
          : slot === 'R'
            ? [this.slotR, this.tSlotR]
            : [this.slotF, this.tSlotF];
    for (const el of els) {
      el.classList.remove('cast-pulse');
      void el.offsetWidth;
      el.classList.add('cast-pulse');
    }
  }

  setMode(mode: ScreenMode): void {
    this.currentScreenMode = mode;
    this.appRoot.classList.toggle('camp-mode', mode === 'camp');
    this.appRoot.classList.toggle('world-mode', mode === 'world');
    this.titleOverlay.classList.toggle('visible', mode === 'title');
    this.campHud.classList.toggle('visible', mode === 'camp');
    this.worldHud.classList.toggle('visible', mode === 'world');
    this.dialogueOverlay.classList.toggle('visible', mode === 'dialogue');
    if (mode !== 'title') {
      this.campaignOverlay.classList.remove('visible');
      this.codexOverlay.classList.remove('visible');
    }
    if (mode === 'playing' || mode === 'cutscene' || mode === 'dialogue') {
      if (this.shopOverlay.classList.contains('visible')) {
        this.closeShop();
      }
      this.dungeonOverlay.classList.remove('visible');
    }
    const playableHud = mode === 'playing' || mode === 'camp' || mode === 'world';
    this.hudRoot.classList.toggle('visible', playableHud);
    this.touchRoot.classList.toggle('visible', playableHud);
    this.pauseOverlay.classList.toggle('visible', mode === 'paused');
    this.resultOverlay.classList.toggle('visible', mode === 'victory' || mode === 'defeat');

    if (mode !== 'camp') {
      this.setCampInteractPrompt(null);
      this.updateCampNpcLabels([]);
    }
    if (mode !== 'world') {
      this.setWorldInteractPrompt(null);
      this.worldTpDrawer.classList.remove('visible');
    }

    if (mode === 'camp') {
      this.renderCampPanel();
      this.dangerWarning.classList.remove('visible');
      this.touchDodgeBtn.classList.remove('action-hint-dodge');
      this.touchBlockBtn.classList.remove('action-hint-parry');
      this.minimapBox.classList.remove('visible');
    } else if (mode !== 'playing' && mode !== 'world') {
      this.dangerWarning.classList.remove('visible');
      this.touchDodgeBtn.classList.remove('action-hint-dodge');
      this.touchBlockBtn.classList.remove('action-hint-parry');
      this.touchAtkBtn.classList.remove('shadow-ready');
      this.minimapBox.classList.remove('visible');
      this.comboUltBtn.classList.remove('visible');
      this.slotQ.classList.remove('q2-ready');
      this.tSlotQ.classList.remove('q2-ready');
      this.slotR.classList.remove('combo-ready');
      this.tSlotR.classList.remove('combo-ready');
      this.monolithBar.classList.remove('visible');
      this.stageModBar.innerHTML = '';
    } else if (mode !== 'playing') {
      this.monolithBar.classList.remove('visible');
      this.stageModBar.innerHTML = '';
    }
  }

  showStageBanner(kicker: string, title: string, duration = 2.6): void {
    if (this.isMobileUi()) {
      this.showMobileNotify(`${kicker} · ${title}`, 'gold', Math.round(duration * 1000));
      return;
    }
    this.stageBannerKicker.textContent = kicker;
    this.stageBannerTitle.textContent = title;
    this.stageBanner.classList.add('visible');
    this.stageBannerTimer = duration;
  }

  showSubtitle(line: string, duration = 3.2): void {
    if (this.isMobileUi()) {
      this.showMobileNotify(line, 'info', Math.round(duration * 1000));
      return;
    }
    this.subtitleBanner.textContent = line;
    this.subtitleBanner.classList.add('visible');
    this.subtitleTimer = duration;
  }

  clearSubtitle(): void {
    this.subtitleTimer = 0;
    this.subtitleBanner.classList.remove('visible');
    this.stageBannerTimer = 0;
    this.stageBanner.classList.remove('visible');
    this.clearMobileNotify();
  }

  tickSubtitle(dt: number): void {
    if (this.subtitleTimer > 0) {
      this.subtitleTimer -= dt;
      if (this.subtitleTimer <= 0) {
        this.subtitleBanner.classList.remove('visible');
      }
    }
    if (this.stageBannerTimer > 0) {
      this.stageBannerTimer -= dt;
      if (this.stageBannerTimer <= 0) {
        this.stageBanner.classList.remove('visible');
      }
    }
  }

  spawnCallout(text: string, screenX: number, screenY: number, kind: 'dmg' | 'crit' | 'parry' | 'heal' | 'info'): void {
    const el = document.createElement('div');
    el.className = `callout callout-${kind}`;
    el.textContent = text;
    el.style.left = `${clamp(screenX, 60, window.innerWidth - 60)}px`;
    el.style.top = `${clamp(screenY, 70, window.innerHeight - 90)}px`;
    this.calloutContainer.appendChild(el);
    window.setTimeout(() => el.remove(), 880);
  }

  showResult(victory: boolean, elapsedSec: number, hero: HeroState, opts?: ResultDisplayOptions): void {
    const mins = Math.floor(elapsedSec / 60);
    const secs = Math.floor(elapsedSec % 60);
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const stageDef = opts?.stageDef;
    const dungeonDef = opts?.dungeonDef;
    const towerFloor = opts?.towerFloor;
    const rlChamber = opts?.roguelikeChamber;
    const rlTotal = opts?.roguelikeTotalChambers ?? 6;
    const hasEpilogue = Boolean(
      victory && !dungeonDef && !towerFloor && !rlChamber && stageDef && CHAPTER_EPILOGUES[stageDef.id],
    );
    const isGrandFinalWin = victory && !dungeonDef && !towerFloor && !rlChamber && stageDef?.id === CAMPAIGN_STAGES.length;
    this.resultModalCard.classList.toggle('win', victory);
    this.resultModalCard.classList.toggle('lose', !victory);
    this.resultStageTag.textContent = towerFloor
      ? `锁妖九重塔 · 第 ${towerFloor.id} 层`
      : rlChamber
        ? `幻境肉鸽 · 第 ${rlChamber}/${rlTotal} 境`
        : dungeonDef
          ? `${dungeonDef.name} · 秘境打宝`
          : stageDef
            ? `第 ${stageDef.id} 关 · ${stageDef.name}`
            : victory
              ? '剑台凯旋'
              : '剑势折戟';
    this.resultTitle.textContent =
      opts?.customTitle ??
      (towerFloor
        ? victory
          ? `第 ${towerFloor.id} 层 破 塔 凯 旋`
          : `第 ${towerFloor.id} 层 试 炼 折 戟`
        : rlChamber
          ? victory
            ? rlChamber >= rlTotal
              ? '幻 境 通 幽 · 剑 圣 圆满'
              : `第 ${rlChamber} 境 破 阵`
            : '幻 境 迷 失'
          : dungeonDef
            ? victory
              ? `${dungeonDef.name} · 破阵凯旋`
              : '秘 境 折 戟'
            : isGrandFinalWin
              ? '二 十 五 劫 破 · 太 虚 剑 祖'
              : stageDef?.id === 20 && victory
                ? '二 十 劫 破 · 剑 圣 加 冕'
                : victory
                  ? `第 ${stageDef?.id ?? ''} 关 凯 旋`
                  : '身 陨 剑 台');
    this.resultTitle.className = victory ? 'result-title win' : 'result-title lose';
    this.resultStoryLine.textContent =
      opts?.customSub ??
      (victory
        ? stageDef?.victoryLine ?? ''
        : '剑心未泯，暂返云来剑庐吐纳温酒，重整旗鼓再破妖阵。');
    this.resultEpilogueBtn.style.display = hasEpilogue ? 'inline-flex' : 'none';

    if (opts?.combatRank) {
      this.resultRankBadge.style.display = 'inline-flex';
      this.resultRankBadge.textContent = `评级 ${opts.combatRank.rank} · ${opts.combatRank.title}`;
      this.resultRankBadge.style.color = opts.combatRank.colorHex;
      this.resultRankBadge.style.borderColor = opts.combatRank.colorHex;
    } else {
      this.resultRankBadge.style.display = 'none';
    }

    // 3-Star Seal Display
    if (victory && opts?.starResult) {
      const { stars } = opts.starResult;
      this.resultStarsRow.style.display = 'flex';
      this.resultStarsRow.innerHTML = [1, 2, 3]
        .map((n) => `<span class="big-star${n <= stars ? ' lit' : ''}">★</span>`)
        .join('');
    } else {
      this.resultStarsRow.style.display = 'none';
    }

    this.resultStats.innerHTML = `
      <div class="stat-item"><span>用时</span><strong>${timeStr}</strong></div>
      <div class="stat-item"><span>弹反</span><strong>${hero.parryCount} 次</strong></div>
      <div class="stat-item"><span>连击</span><strong>${hero.maxCombo} 连</strong></div>
    `;

    const droppedGear = opts?.droppedGear ?? [];
    if (droppedGear.length > 0) {
      const preview = droppedGear.slice(0, 3);
      const chips = preview
        .map((g) => `<span class="result-loot-chip rarity-${g.rarity}">${RARITY_LABELS[g.rarity]} · ${g.name}</span>`)
        .join('');
      const extra =
        droppedGear.length > 3
          ? `<span class="result-loot-chip more">+${droppedGear.length - 3}件</span>`
          : '';
      this.resultLootRow.style.display = 'flex';
      this.resultLootRow.innerHTML = `${chips}${extra}`;
    } else {
      this.resultLootRow.style.display = 'none';
      this.resultLootRow.innerHTML = '';
    }

    const jadeEarned = opts?.jadeEarned ?? hero.stageJadeEarned;
    if (jadeEarned > 0) {
      this.resultJadeGain.style.display = 'inline-flex';
      this.resultJadeGain.textContent = `◆ +${jadeEarned} 灵石`;
    } else {
      this.resultJadeGain.style.display = 'none';
    }

    // 3-Pick-1 Xianxia / Roguelike Blessing Cards when advancing
    this.pendingDungeonId = victory && dungeonDef ? dungeonDef.id : null;
    this.pendingTowerFloorId = victory && towerFloor && opts?.nextTowerFloorId ? opts.nextTowerFloorId : null;
    this.pendingRoguelikeNext = Boolean(
      victory && rlChamber && rlChamber < rlTotal && opts?.roguelikeBlessings?.length,
    );
    this.pendingNextStageId =
      !dungeonDef && !towerFloor && !rlChamber && victory && opts?.nextStageId ? opts.nextStageId : null;

    const rlChoices = this.pendingRoguelikeNext ? opts?.roguelikeBlessings ?? [] : [];
    const regularChoices = victory && this.pendingNextStageId ? opts?.blessingChoices ?? [] : [];
    const choices = rlChoices.length > 0 ? rlChoices : regularChoices;
    if (choices.length > 0) {
      this.selectedBlessingId = choices[0].id;
      this.resultBlessingWrap.style.display = 'block';
      this.resultBlessingHeader.textContent =
        rlChoices.length > 0 ? '幻境赐福 · 三选一激活流派共鸣' : '剑阁赐福 · 择一随行';
      this.resultBlessingGrid.innerHTML = '';
      for (const b of choices) {
        const pathId = (b as Partial<RoguelikeBlessingDef>).path;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `blessing-card${pathId ? ` path-${pathId}` : ''}${b.id === this.selectedBlessingId ? ' active' : ''}`;
        card.innerHTML = `
          <span class="bl-tag">${b.tag}</span>
          <strong class="bl-name">${b.name}</strong>
          <span class="bl-desc">${b.desc}</span>
        `;
        card.addEventListener('click', () => {
          this.selectedBlessingId = b.id;
          for (const sib of Array.from(this.resultBlessingGrid.children)) {
            sib.classList.remove('active');
          }
          card.classList.add('active');
        });
        this.resultBlessingGrid.appendChild(card);
      }
      this.resultGreedRow.style.display = this.pendingRoguelikeNext ? 'flex' : 'none';
      this.chkGreedPact.checked = false;
    } else {
      this.selectedBlessingId = undefined;
      this.resultBlessingWrap.style.display = 'none';
      this.resultGreedRow.style.display = 'none';
      this.chkGreedPact.checked = false;
    }

    if (this.pendingTowerFloorId) {
      this.nextStageBtn.style.display = 'inline-flex';
      this.nextStageBtn.textContent = `下一层 · 第 ${this.pendingTowerFloorId} 层`;
      this.retryBtn.classList.remove('primary');
    } else if (this.pendingRoguelikeNext && rlChamber) {
      this.nextStageBtn.style.display = 'inline-flex';
      this.nextStageBtn.textContent = `深入第 ${rlChamber + 1} 境`;
      this.retryBtn.classList.remove('primary');
    } else if (this.pendingDungeonId) {
      this.nextStageBtn.style.display = 'inline-flex';
      this.nextStageBtn.textContent = '再刷秘境';
      this.retryBtn.classList.remove('primary');
    } else if (this.pendingNextStageId) {
      const nextDef = getStageDef(this.pendingNextStageId);
      this.nextStageBtn.style.display = 'inline-flex';
      this.nextStageBtn.textContent = `下一关 · 第 ${nextDef.id} 关`;
      this.retryBtn.classList.remove('primary');
    } else {
      this.nextStageBtn.style.display = 'none';
      this.retryBtn.classList.add('primary');
    }
  }

  update(
    hero: HeroState,
    objective: string,
    boss: EnemyEntity | null,
    peer: PeerHeroState | null = null,
    threat: CombatThreatState = 'none',
    tactical?: HudTacticalState,
  ): void {
    const hpPct = clamp(hero.hp / hero.maxHp, 0, 1) * 100;
    const delayPct = clamp(hero.delayedHp / hero.maxHp, 0, 1) * 100;
    const spPct = clamp(hero.spirit / hero.maxSpirit, 0, 1) * 100;
    const stPct = clamp(hero.stamina / hero.maxStamina, 0, 1) * 100;
    const ultPct = Math.floor(clamp(hero.ult, 0, 100));

    this.hpFill.style.width = `${hpPct.toFixed(1)}%`;
    this.hpDelay.style.width = `${delayPct.toFixed(1)}%`;
    this.hpText.textContent = `${Math.ceil(hero.hp)} / ${hero.maxHp}`;
    this.spiritFill.style.width = `${spPct.toFixed(1)}%`;
    this.staminaFill.style.width = `${stPct.toFixed(1)}%`;
    this.ultPctText.textContent = `${ultPct}%`;

    this.objectiveText.textContent = objective;

    if (peer && !peer.isEnemy) {
      this.allyMini.classList.add('visible');
      this.allyMiniName.textContent = peer.dead ? `${peer.name}（重伤待援）` : `同伴 · ${peer.name}`;
      this.allyHpFill.style.width = `${(clamp(peer.hp / peer.maxHp, 0, 1) * 100).toFixed(1)}%`;
    } else {
      this.allyMini.classList.remove('visible');
    }

    if (peer && peer.isEnemy) {
      this.objectiveText.style.display = 'none';
      this.bossBar.classList.add('visible');
      this.bossName.textContent = `1v1 对决 · ${peer.name}`;
      this.bossHpFill.style.width = `${(clamp(peer.hp / peer.maxHp, 0, 1) * 100).toFixed(1)}%`;
      this.bossPoiseFill.style.width = `${clamp(peer.ult, 0, 100).toFixed(1)}%`;
    } else if (boss && boss.aiState !== 'dead') {
      this.objectiveText.style.display = 'none';
      this.bossBar.classList.add('visible');
      this.bossName.textContent = boss.phase === 2 ? `${boss.name} · 魔剑狂化` : boss.name;
      this.bossHpFill.style.width = `${(clamp(boss.hp / boss.maxHp, 0, 1) * 100).toFixed(1)}%`;
      this.bossPoiseFill.style.width = `${(clamp(boss.poise / boss.maxPoise, 0, 1) * 100).toFixed(1)}%`;
    } else {
      this.objectiveText.style.display = '';
      this.bossBar.classList.remove('visible');
    }

    const q2Ready = Boolean(tactical?.q2Ready);
    const comboUltReady = Boolean(tactical?.comboUltReady);

    this.updateSkillPair(
      this.slotQ,
      this.tSlotQ,
      this.sweepQ,
      this.tSweepQ,
      this.cdQEl,
      this.tCdQEl,
      q2Ready ? 0 : hero.cdQ,
      SKILL_MAX_CD.Q,
      q2Ready || hero.spirit >= 20,
      q2Ready,
    );
    this.updateSkillPair(this.slotE, this.tSlotE, this.sweepE, this.tSweepE, this.cdEEl, this.tCdEEl, hero.cdE, SKILL_MAX_CD.E, hero.spirit >= 45, false);
    this.updateSkillPair(
      this.slotR,
      this.tSlotR,
      this.sweepR,
      this.tSweepR,
      this.cdREl,
      this.tCdREl,
      comboUltReady ? 0 : hero.cdR,
      SKILL_MAX_CD.R,
      comboUltReady || hero.ult >= 100,
      comboUltReady || (hero.ult >= 100 && hero.cdR <= 0),
    );

    this.slotQ.classList.toggle('q2-ready', q2Ready);
    this.tSlotQ.classList.toggle('q2-ready', q2Ready);
    this.slotQName.textContent = q2Ready ? '踏剑追影' : '御剑术';
    this.tSlotQName.textContent = q2Ready ? '踏剑' : '御剑';

    this.slotR.classList.toggle('combo-ready', comboUltReady);
    this.tSlotR.classList.toggle('combo-ready', comboUltReady);
    this.slotRName.textContent = comboUltReady ? '万剑归宗' : '天剑';
    this.tSlotRName.textContent = comboUltReady ? '归宗' : '天剑';

    const sigils = tactical?.comboSigils ?? [];
    const sigilGlyph: Record<'A' | 'Q' | 'E' | 'D', string> = {
      A: '斩',
      Q: '御',
      E: '万',
      D: '身',
    };
    for (let i = 0; i < this.sigilEls.length; i++) {
      const el = this.sigilEls[i];
      const code = sigils[i];
      if (code) {
        el.textContent = sigilGlyph[code];
        el.classList.add('filled');
        el.dataset.sigil = code;
      } else {
        el.textContent = '';
        el.classList.remove('filled');
        delete el.dataset.sigil;
      }
    }
    this.comboUltBtn.classList.toggle('visible', comboUltReady);
    this.comboUltBtn.textContent =
      comboUltReady && tactical && tactical.comboUltTimer > 0 && tactical.comboUltTimer < 9.5
        ? `万剑归宗 ${tactical.comboUltTimer.toFixed(1)}s`
        : '万剑归宗';

    if (tactical?.mountMode !== undefined) {
      this.mountHorseBtn.classList.toggle('active', tactical.mountMode === 'horse');
      this.mountSwordBtn.classList.toggle('active', tactical.mountMode === 'sword');
    }

    if (tactical?.openWorldMode) {
      this.minimapBox.classList.add('visible');
      this.minimapZoneName.textContent = tactical.zoneName;
      this.minimapPct.textContent = '九州';
      this.drawOpenWorldMinimap(tactical);
    } else if (tactical?.corridorMode) {
      this.minimapBox.classList.add('visible');
      this.minimapZoneName.textContent = tactical.zoneName;
      this.minimapPct.textContent = `${Math.round(clamp(tactical.progressPct, 0, 100))}%`;
      this.drawMinimap(tactical);
    } else {
      this.minimapBox.classList.remove('visible');
    }

    const healDisabled = hero.gourds <= 0 || hero.cdHeal > 0;
    const healPct = clamp(hero.cdHeal / SKILL_MAX_CD.F, 0, 1) * 360;
    this.slotF.classList.toggle('disabled', healDisabled);
    this.tSlotF.classList.toggle('disabled', healDisabled);
    this.sweepF.style.setProperty('--cd-deg', `${healPct.toFixed(1)}deg`);
    this.tSweepF.style.setProperty('--cd-deg', `${healPct.toFixed(1)}deg`);
    this.gourdCountEl.textContent = `${hero.gourds}`;
    this.tGourdCountEl.textContent = `${hero.gourds}`;

    const counterReady = hero.counterWindowTimer > 0 && hero.counterTargetId !== null;
    const shadowReady = hero.shadowStrikeTimer > 0;
    const waveReady = hero.comboStep === 3 && hero.comboWindowTimer > 0;
    this.touchAtkBtn.classList.toggle('counter-ready', counterReady);
    this.touchAtkBtn.classList.toggle('shadow-ready', !counterReady && shadowReady);
    this.touchAtkLbl.textContent = counterReady ? '处决' : shadowReady ? '瞬影' : waveReady ? '剑气' : '出剑';

    this.dangerWarning.classList.toggle('visible', threat === 'unblockable');
    this.touchDodgeBtn.classList.toggle('action-hint-dodge', threat === 'unblockable');
    this.touchBlockBtn.classList.toggle('action-hint-parry', threat === 'parryable');

    if (hero.comboCount >= 2 && hero.comboDecayTimer > 0) {
      this.comboBox.classList.add('visible');
      this.comboNum.textContent = `${hero.comboCount}`;
      const cr = tactical?.combatRank;
      const rank = cr ? cr.rank : hero.comboCount >= 30 ? 'S' : hero.comboCount >= 18 ? 'A' : hero.comboCount >= 8 ? 'B' : 'C';
      this.comboRank.textContent = rank;
      this.comboRank.className = `combo-rank${
        rank === 'SSS' ? ' rank-sss' : rank === 'SS' ? ' rank-ss' : rank === 'S' ? ' rank-s' : ''
      }`;
    } else {
      this.comboBox.classList.remove('visible');
    }

    // Active Stage Modifiers + Defend Monolith Bar
    if (this.currentScreenMode === 'playing' && tactical) {
      const chips: string[] = [];
      if (tactical.difficultyShort && tactical.difficultyShort !== '普通') {
        chips.push(`<span class="mod-chip diff">${tactical.difficultyShort}</span>`);
      }
      if (tactical.leylineAffix && tactical.leylineAffix !== 'none') {
        const af = LEYLINE_AFFIX_MAP[tactical.leylineAffix];
        chips.push(`<span class="mod-chip" style="border-color:${af.colorHex};color:${af.colorHex}">${af.name}</span>`);
      }
      if (tactical.leylineZoneActive) {
        chips.push(
          `<span class="mod-chip zone${tactical.heroInLeylineZone ? ' active' : ''}">${tactical.heroInLeylineZone ? '灵脉增幅+30%伤' : '进阵领+30%伤'}</span>`,
        );
      }
      if (tactical.roguelikePaths) {
        for (const p of ROGUELIKE_PATHS) {
          const cnt = tactical.roguelikePaths[p.id] ?? 0;
          if (cnt > 0) {
            chips.push(
              `<span class="mod-chip" style="border-color:${p.accentHex};color:${p.accentHex}">${p.name.slice(0, 2)}×${cnt}</span>`,
            );
          }
        }
      }
      this.stageModBar.innerHTML = chips.join('');

      if (tactical.stageMode === 'defend' && (tactical.monolithMaxHp ?? 0) > 0) {
        const mRatio = clamp((tactical.monolithHp ?? 0) / Math.max(1, tactical.monolithMaxHp ?? 1), 0, 1);
        this.monolithBar.classList.add('visible');
        this.monolithBar.classList.toggle('danger', mRatio < 0.35);
        this.monolithFill.style.width = `${(mRatio * 100).toFixed(1)}%`;
        this.monolithLabel.textContent = `蜀山灵脉 ${Math.ceil(tactical.monolithHp ?? 0)} / ${tactical.monolithMaxHp ?? 0} (${Math.round(mRatio * 100)}%)`;
      } else {
        this.monolithBar.classList.remove('visible');
      }
    } else {
      this.stageModBar.innerHTML = '';
      this.monolithBar.classList.remove('visible');
    }
  }

  private updateSkillPair(
    slotA: HTMLElement,
    slotB: HTMLElement,
    sweepA: HTMLElement,
    sweepB: HTMLElement,
    cdA: HTMLElement,
    cdB: HTMLElement,
    cd: number,
    maxCd: number,
    hasResource: boolean,
    readyGlow: boolean,
  ): void {
    const disabled = cd > 0 || !hasResource;
    const deg = clamp(cd / maxCd, 0, 1) * 360;
    for (const s of [slotA, slotB]) {
      s.classList.toggle('disabled', disabled);
      s.classList.toggle('ready-glow', readyGlow);
    }
    sweepA.style.setProperty('--cd-deg', `${deg.toFixed(1)}deg`);
    sweepB.style.setProperty('--cd-deg', `${deg.toFixed(1)}deg`);
    const txt = cd > 0.05 ? cd.toFixed(1) : '';
    for (const el of [cdA, cdB]) {
      el.textContent = txt;
      el.classList.toggle('visible', cd > 0.05);
    }
  }

  private populateComboCodex(container: HTMLElement): void {
    const entries = this.isMobileUi() ? COMBO_CODEX_ENTRIES_MOBILE : COMBO_CODEX_ENTRIES;
    const rowsHtml = entries.map(
      (entry) => `
      <div class="combo-codex-row${entry.isUlt ? ' is-ult' : ''}">
        <span class="combo-codex-num">${entry.num}</span>
        <span class="combo-codex-name">${entry.name}</span>
        <span class="combo-codex-desc">${entry.descHtml}</span>
      </div>`,
    ).join('');
    container.innerHTML = `
      <div class="combo-codex-head">
        <span>剑诀连招谱 · 实操秘要</span>
        <span class="combo-codex-sub">五式御剑</span>
      </div>
      <div class="combo-codex-list">${rowsHtml}</div>
    `;
  }

  private drawMinimap(tactical: HudTacticalState): void {
    const ctx = this.minimapCtx;
    if (!ctx) return;

    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const padY = 14;
    const usableH = h - padY * 2;
    const zSpan = Math.max(1, tactical.zMax - tactical.zMin);

    const toY = (z: number): number => {
      const norm = clamp((tactical.zMax - z) / zSpan, 0, 1);
      return h - padY - norm * usableH;
    };
    const toX = (x: number): number => clamp(w * 0.5 + (x / 22) * (w * 0.42), 8, w - 8);

    ctx.clearRect(0, 0, w, h);

    const now = performance.now();
    const biome = tactical.biome ?? getStageDef(this.selectedStage).biome;
    this.drawMinimapCanyonBackdrop(ctx, w, h, now, biome);

    const zoneCount = tactical.maxZone + 1;
    const platW = 72;
    const platH = zoneCount === 1 ? usableH * 0.84 : zoneCount === 2 ? usableH * 0.36 : usableH * 0.23;
    const centerYForZone = (zi: number): number => {
      if (zoneCount === 1) return h * 0.5;
      if (zoneCount === 2) return zi === 0 ? h - padY - platH * 0.5 : padY + platH * 0.5;
      return zi === 0 ? h - padY - platH * 0.5 : zi === 1 ? h * 0.5 : padY + platH * 0.5;
    };
    const activeZoneIdx: 0 | 1 | 2 =
      zoneCount === 1
        ? 0
        : zoneCount === 2
          ? tactical.heroZ < -21
            ? 1
            : 0
          : tactical.heroZ < -63
            ? 2
            : tactical.heroZ < -21
              ? 1
              : 0;

    // 1. Crossings: Crossing 0 (碧水浅滩 blue-teal ford) & Crossing 1 (飞瀑虹桥 golden-stone arch)
    for (let zi = 0; zi < tactical.maxZone; zi++) {
      const yBottom = centerYForZone(zi) - platH * 0.5 + 2;
      const yTop = centerYForZone(zi + 1) + platH * 0.5 - 2;
      this.drawMinimapCrossing(ctx, w, yTop, yBottom, centerYForZone(zi), centerYForZone(zi + 1), zi, zi + 1 <= tactical.unlockedZone, now);
    }

    // 2. Three Terraces (云溪山门 / 翠竹剑涧 / 锁妖绝壁) with Active Zone Highlight
    for (let zi = 0; zi <= tactical.maxZone; zi++) {
      this.drawMinimapTerrace(
        ctx,
        w,
        centerYForZone(zi),
        platW,
        platH,
        zi <= tactical.unlockedZone,
        zi === activeZoneIdx,
        zi === tactical.maxZone && tactical.maxZone > 0,
        now,
      );
    }

    // 3. Entity Dots & Hero Directional Arrow
    this.drawMinimapEntities(ctx, tactical.dots, toX, toY, now);
    this.drawMinimapHeroArrow(ctx, toX(tactical.heroX), toY(tactical.heroZ), tactical.heroYaw);
  }

  setWorldStatus(regionName: string, waypoints: number, chests: number, bosses: number, orbs = 0): void {
    this.worldRegionName.textContent = regionName;
    this.worldProgressPill.textContent = `锚点 ${waypoints}/${WORLD_WAYPOINTS.length} · 宝箱 ${chests}/${WORLD_CHESTS.length} · 灵瞳 ${orbs}/${WORLD_SPIRIT_ORBS.length} · 首领 ${bosses}/${WORLD_BOSS_SPAWNS.length}`;
  }

  setWorldGuide(title: string, dirText: string, howto: string, autoNavActive: boolean, resumeLabel?: string): void {
    this.worldGuideGoal.textContent = title;
    this.worldGuideDir.textContent = dirText;
    this.worldGuideHowto.textContent = howto;
    this.worldAutoNavBtn.classList.toggle('active', autoNavActive);
    this.worldAutoNavBtn.classList.toggle('resume-pulse', !autoNavActive && Boolean(resumeLabel));
    this.worldAutoNavBtn.textContent = autoNavActive ? '停止寻路' : (resumeLabel ?? '自动寻路');
  }

  flashWorldGuideNextStep(summaryText: string): void {
    this.worldGuideCard.classList.remove('collapsed');
    this.worldGuideToggleBtn.textContent = '▾';
    this.worldGuideToggleBtn.setAttribute('aria-expanded', 'true');
    this.worldGuideHowto.textContent = summaryText;
    this.worldGuideCard.classList.add('next-pulse');
    if (this.worldGuidePulseTimer !== null) window.clearTimeout(this.worldGuidePulseTimer);
    this.worldGuidePulseTimer = window.setTimeout(() => {
      this.worldGuideCard.classList.remove('next-pulse');
      this.worldGuidePulseTimer = null;
    }, 4200);
  }

  setWorldInteractPrompt(label: string | null): void {
    if (!label) {
      this.worldInteractBtn.classList.remove('visible');
      return;
    }
    this.worldInteractLabel.textContent = label;
    this.worldInteractBtn.classList.add('visible');
  }

  showWorldToast(text: string, ok = true, durationMs = 2800): void {
    if (this.isMobileUi()) {
      this.showMobileNotify(text, ok ? 'info' : 'err', durationMs);
      return;
    }
    this.worldToastEl.textContent = text;
    this.worldToastEl.classList.toggle('err', !ok);
    this.worldToastEl.classList.add('visible');
    if (this.worldToastTimer !== null) window.clearTimeout(this.worldToastTimer);
    this.worldToastTimer = window.setTimeout(() => {
      this.worldToastEl.classList.remove('visible');
      this.worldToastTimer = null;
    }, durationMs);
  }

  renderWorldTeleportList(): void {
    const store = this.saveStore;
    const items: Array<{ id: string; name: string; sub: string; lit: boolean }> = [
      { id: 'wp_center', name: '蜀山云台主阵', sub: '中枢起始点', lit: true },
      ...WORLD_WAYPOINTS.map((wp) => ({
        id: wp.id,
        name: wp.name,
        sub: wp.regionName,
        lit: store ? store.isWorldWaypointLit(wp.id) : false,
      })),
    ];
    this.worldTpList.innerHTML = '';
    for (const item of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `world-tp-item${item.lit ? '' : ' locked'}`;
      btn.disabled = !item.lit;
      btn.innerHTML = `<span>${item.name}</span><span>${item.lit ? '传送 →' : '未点亮'}</span>`;
      btn.addEventListener('click', () => {
        if (!item.lit) return;
        this.worldTpDrawer.classList.remove('visible');
        this.callbacks.onWorldTeleport?.(item.id);
      });
      this.worldTpList.appendChild(btn);
    }
  }

  private drawOpenWorldMinimap(tactical: HudTacticalState): void {
    const ctx = this.minimapCtx;
    if (!ctx) return;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const pad = 10;
    const mapSize = Math.min(w, h) - pad * 2;
    const ox = (w - mapSize) * 0.5;
    const oy = (h - mapSize) * 0.5;
    const toX = (x: number): number => ox + ((clamp(x, -WORLD_BOUND, WORLD_BOUND) + WORLD_BOUND) / (WORLD_BOUND * 2)) * mapSize;
    const toY = (z: number): number => oy + ((clamp(z, -WORLD_BOUND, WORLD_BOUND) + WORLD_BOUND) / (WORLD_BOUND * 2)) * mapSize;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#091522';
    ctx.fillRect(0, 0, w, h);

    // Quadrant biome tints + Northern Abyssal Crypt chasm tint
    const half = mapSize * 0.5;
    ctx.fillStyle = 'rgba(42, 128, 108, 0.24)'; // NE Peach
    ctx.fillRect(ox + half, oy, half, half);
    ctx.fillStyle = 'rgba(116, 78, 178, 0.24)'; // NW Graveyard
    ctx.fillRect(ox, oy, half, half);
    ctx.fillStyle = 'rgba(184, 62, 32, 0.26)'; // SW Lava
    ctx.fillRect(ox, oy + half, half, half);
    ctx.fillStyle = 'rgba(56, 136, 198, 0.24)'; // SE Celestial
    ctx.fillRect(ox + half, oy + half, half, half);
    ctx.fillStyle = 'rgba(56, 224, 188, 0.24)'; // North Crypt Chasm
    ctx.fillRect(ox + mapSize * 0.34, oy, mapSize * 0.32, mapSize * 0.28);

    // Central Shushan Terrace
    ctx.strokeStyle = 'rgba(124, 240, 224, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(ox + half, oy + half, mapSize * 0.14, 0, Math.PI * 2);
    ctx.stroke();

    // Waypoints
    for (const wp of tactical.worldWaypoints ?? []) {
      const wx = toX(wp.x);
      const wy = toY(wp.z);
      ctx.fillStyle = wp.lit ? '#5cffea' : '#647284';
      ctx.beginPath();
      ctx.moveTo(wx, wy - 4);
      ctx.lineTo(wx + 4, wy);
      ctx.lineTo(wx, wy + 4);
      ctx.lineTo(wx - 4, wy);
      ctx.closePath();
      ctx.fill();
    }

    // Unopened Chests
    for (const ch of tactical.worldChests ?? []) {
      if (ch.opened) continue;
      ctx.fillStyle = '#ffd866';
      ctx.fillRect(toX(ch.x) - 2, toY(ch.z) - 2, 4, 4);
    }

    // Aerial Sky Spirit Orbs
    for (const orb of tactical.worldOrbs ?? []) {
      if (orb.collected) continue;
      const ox2 = toX(orb.x);
      const oy2 = toY(orb.z);
      ctx.fillStyle = '#7bf8ea';
      ctx.beginPath();
      ctx.moveTo(ox2, oy2 - 3);
      ctx.lineTo(ox2 + 3, oy2);
      ctx.lineTo(ox2, oy2 + 3);
      ctx.lineTo(ox2 - 3, oy2);
      ctx.closePath();
      ctx.fill();
    }

    // Treasure Goblin World Event Beacon
    if (tactical.worldEventPos) {
      const ex = toX(tactical.worldEventPos.x);
      const ey = toY(tactical.worldEventPos.z);
      const pulse = 5 + Math.sin(performance.now() * 0.01) * 1.8;
      ctx.strokeStyle = '#ffdf78';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(ex, ey, pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffcf48';
      ctx.beginPath();
      ctx.arc(ex, ey, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Tracked Objective Dashed Guide Line + Pulsing Target Reticle
    if (tactical.worldGuideTarget) {
      const hx = toX(tactical.heroX);
      const hy = toY(tactical.heroZ);
      const tx = toX(tactical.worldGuideTarget.x);
      const ty = toY(tactical.worldGuideTarget.z);
      ctx.save();
      ctx.strokeStyle = 'rgba(123, 248, 234, 0.85)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);
      const ringR = 5.5 + Math.sin(performance.now() * 0.008) * 1.6;
      ctx.strokeStyle = '#ffe384';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(tx, ty, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    this.drawMinimapEntities(ctx, tactical.dots, toX, toY, performance.now());
    this.drawMinimapHeroArrow(ctx, toX(tactical.heroX), toY(tactical.heroZ), tactical.heroYaw);
  }

  private drawMinimapCanyonBackdrop(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    now: number,
    biome: WorldBiome = 'bamboo_canyon',
  ): void {
    const paletteMap: Record<
      WorldBiome,
      {
        bg0: string;
        bg1: string;
        bg2: string;
        bank: string;
        river0: string;
        river1: string;
        vein: string;
        shimmer: string;
        cliff: string;
        rim: string;
      }
    > = {
      bamboo_canyon: {
        bg0: '#07141d',
        bg1: '#0b1c29',
        bg2: '#102533',
        bank: 'rgba(14, 74, 72, 0.42)',
        river0: 'rgba(20, 118, 108, 0.78)',
        river1: 'rgba(30, 152, 138, 0.82)',
        vein: 'rgba(82, 232, 212, 0.32)',
        shimmer: 'rgba(156, 252, 240, 0.42)',
        cliff: 'rgba(9, 17, 26, 0.88)',
        rim: 'rgba(116, 174, 172, 0.3)',
      },
      peach_shrine: {
        bg0: '#160f1d',
        bg1: '#20152a',
        bg2: '#2a1c36',
        bank: 'rgba(118, 56, 86, 0.4)',
        river0: 'rgba(168, 86, 122, 0.72)',
        river1: 'rgba(222, 132, 158, 0.78)',
        vein: 'rgba(255, 198, 216, 0.36)',
        shimmer: 'rgba(255, 226, 236, 0.48)',
        cliff: 'rgba(20, 12, 26, 0.88)',
        rim: 'rgba(232, 158, 186, 0.32)',
      },
      sword_graveyard: {
        bg0: '#0d0c1a',
        bg1: '#151228',
        bg2: '#1d1836',
        bank: 'rgba(66, 42, 118, 0.42)',
        river0: 'rgba(98, 62, 168, 0.75)',
        river1: 'rgba(136, 92, 214, 0.8)',
        vein: 'rgba(188, 148, 255, 0.34)',
        shimmer: 'rgba(222, 198, 255, 0.42)',
        cliff: 'rgba(11, 10, 22, 0.9)',
        rim: 'rgba(164, 138, 226, 0.3)',
      },
      lava_abyss: {
        bg0: '#180a0b',
        bg1: '#240e0e',
        bg2: '#301210',
        bank: 'rgba(136, 36, 18, 0.46)',
        river0: 'rgba(196, 52, 22, 0.84)',
        river1: 'rgba(244, 112, 34, 0.88)',
        vein: 'rgba(255, 204, 86, 0.46)',
        shimmer: 'rgba(255, 236, 148, 0.56)',
        cliff: 'rgba(20, 9, 10, 0.92)',
        rim: 'rgba(242, 118, 68, 0.34)',
      },
      astral_void: {
        bg0: '#080c20',
        bg1: '#101836',
        bg2: '#18244e',
        bank: 'rgba(42, 76, 148, 0.44)',
        river0: 'rgba(56, 118, 204, 0.78)',
        river1: 'rgba(104, 212, 255, 0.84)',
        vein: 'rgba(142, 240, 255, 0.42)',
        shimmer: 'rgba(255, 224, 140, 0.52)',
        cliff: 'rgba(9, 13, 32, 0.92)',
        rim: 'rgba(104, 232, 255, 0.36)',
      },
      celestial_sanctum: {
        bg0: '#081326',
        bg1: '#0e1e3a',
        bg2: '#162d52',
        bank: 'rgba(42, 106, 168, 0.4)',
        river0: 'rgba(56, 158, 224, 0.78)',
        river1: 'rgba(96, 222, 255, 0.84)',
        vein: 'rgba(198, 248, 255, 0.42)',
        shimmer: 'rgba(240, 252, 255, 0.6)',
        cliff: 'rgba(8, 16, 34, 0.88)',
        rim: 'rgba(162, 224, 255, 0.36)',
      },
      haven_camp: {
        bg0: '#121520',
        bg1: '#1a1f2d',
        bg2: '#222838',
        bank: 'rgba(112, 82, 42, 0.38)',
        river0: 'rgba(54, 132, 128, 0.72)',
        river1: 'rgba(86, 174, 162, 0.78)',
        vein: 'rgba(255, 212, 136, 0.34)',
        shimmer: 'rgba(255, 234, 182, 0.46)',
        cliff: 'rgba(14, 16, 24, 0.88)',
        rim: 'rgba(223, 192, 117, 0.3)',
      },
    };
    const pal = paletteMap[biome] ?? paletteMap.bamboo_canyon;

    // Deep mountain gorge gradient themed by biome
    const bg = ctx.createLinearGradient(0, h, 0, 0);
    bg.addColorStop(0, pal.bg0);
    bg.addColorStop(0.5, pal.bg1);
    bg.addColorStop(1, pal.bg2);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Winding Canyon River flowing beneath the 3 terraces
    const traceRiver = () => {
      ctx.beginPath();
      ctx.moveTo(w * 0.64, -6);
      ctx.bezierCurveTo(w * 0.86, h * 0.22, w * 0.16, h * 0.36, w * 0.24, h * 0.54);
      ctx.bezierCurveTo(w * 0.32, h * 0.72, w * 0.84, h * 0.8, w * 0.42, h + 6);
    };

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Outer gorge river bank glow
    traceRiver();
    ctx.strokeStyle = pal.bank;
    ctx.lineWidth = 26;
    ctx.stroke();

    // Main canyon river body
    const riverGrad = ctx.createLinearGradient(0, 0, 0, h);
    riverGrad.addColorStop(0, pal.river0);
    riverGrad.addColorStop(0.5, pal.river1);
    riverGrad.addColorStop(1, pal.river0);
    traceRiver();
    ctx.strokeStyle = riverGrad;
    ctx.lineWidth = 17;
    ctx.stroke();

    // Bright current vein + subtle animated shimmer
    traceRiver();
    ctx.strokeStyle = pal.vein;
    ctx.lineWidth = 6;
    ctx.stroke();

    traceRiver();
    ctx.strokeStyle = pal.shimmer;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 8]);
    ctx.lineDashOffset = -(now * 0.015) % 13;
    ctx.stroke();
    ctx.restore();

    // Subtle cliff ridge edges flanking left & right
    const leftRidge: Array<[number, number]> = [
      [0, 0],
      [14, 0],
      [11, h * 0.14],
      [16, h * 0.27],
      [10, h * 0.42],
      [15, h * 0.56],
      [9, h * 0.71],
      [14, h * 0.86],
      [10, h],
      [0, h],
    ];
    const rightRidge: Array<[number, number]> = [
      [w, 0],
      [w - 11, 0],
      [w - 15, h * 0.16],
      [w - 9, h * 0.31],
      [w - 16, h * 0.46],
      [w - 10, h * 0.6],
      [w - 15, h * 0.75],
      [w - 9, h * 0.89],
      [w - 13, h],
      [w, h],
    ];

    for (const ridge of [leftRidge, rightRidge]) {
      ctx.save();
      ctx.beginPath();
      ridge.forEach(([px, py], idx) => (idx === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
      ctx.closePath();
      ctx.fillStyle = pal.cliff;
      ctx.fill();

      // Inner cliff rim highlight
      ctx.beginPath();
      for (let i = 1; i < ridge.length - 1; i++) {
        const [px, py] = ridge[i];
        if (i === 1) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = pal.rim;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawMinimapCrossing(
    ctx: CanvasRenderingContext2D,
    w: number,
    yTop: number,
    yBottom: number,
    yZoneFrom: number,
    yZoneTo: number,
    crossingIdx: number,
    unlocked: boolean,
    now: number,
  ): void {
    const bH = Math.max(4, yBottom - yTop);
    const midY = yTop + bH * 0.5;
    const bridgeW = 24;
    const bridgeX = (w - bridgeW) * 0.5;

    if (crossingIdx === 0) {
      // Crossing 0: 「碧水浅滩」 blue-teal shallow water ripple band + stepping stones
      const ripplePulse = 0.5 + 0.5 * Math.sin(now * 0.0045);
      ctx.save();
      const fordGrad = ctx.createLinearGradient(w * 0.5 - 26, 0, w * 0.5 + 26, 0);
      fordGrad.addColorStop(0, 'rgba(32, 168, 178, 0.06)');
      fordGrad.addColorStop(0.5, unlocked ? 'rgba(66, 224, 232, 0.44)' : 'rgba(42, 134, 148, 0.28)');
      fordGrad.addColorStop(1, 'rgba(32, 168, 178, 0.06)');
      ctx.fillStyle = fordGrad;
      ctx.fillRect(w * 0.5 - 26, yTop + 1, 52, Math.max(4, bH - 2));

      // Animated blue-teal ripple waves across the ford
      ctx.strokeStyle = `rgba(128, 250, 248, ${(0.42 + ripplePulse * 0.28).toFixed(2)})`;
      ctx.lineWidth = 1.1;
      for (let r = -1; r <= 1; r++) {
        const ry = midY + r * Math.min(4.5, bH * 0.26);
        ctx.beginPath();
        ctx.moveTo(w * 0.5 - 20, ry);
        ctx.quadraticCurveTo(w * 0.5, ry + (r % 2 === 0 ? -2.2 : 2.2), w * 0.5 + 20, ry);
        ctx.stroke();
      }

      // Stepping stones across the shallow stream
      for (const offset of [-4, 0, 4]) {
        ctx.fillStyle = unlocked ? 'rgba(164, 236, 228, 0.72)' : 'rgba(116, 146, 158, 0.52)';
        ctx.beginPath();
        ctx.ellipse(w * 0.5 + (offset === 0 ? 1.5 : -1.5), midY + offset, 4.2, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else {
      // Crossing 1: 「飞瀑虹桥」 golden-stone arch bridge + waterfall mist streaks
      ctx.save();
      // Subtle waterfall mist alongside the rainbow bridge
      ctx.strokeStyle = 'rgba(170, 246, 252, 0.34)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.lineDashOffset = -(now * 0.02) % 6;
      for (const sideX of [bridgeX - 7, bridgeX + bridgeW + 7]) {
        ctx.beginPath();
        ctx.moveTo(sideX, yTop - 1);
        ctx.lineTo(sideX + (sideX < w * 0.5 ? -2 : 2), yBottom + 1);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Golden-stone deck & twin arch rails
      ctx.fillStyle = unlocked ? 'rgba(84, 58, 24, 0.92)' : 'rgba(38, 30, 24, 0.78)';
      ctx.fillRect(bridgeX, yTop, bridgeW, bH);
      ctx.strokeStyle = unlocked ? '#f4cb6e' : 'rgba(182, 146, 86, 0.45)';
      ctx.lineWidth = 1.6;
      for (const edgeX of [bridgeX, bridgeX + bridgeW]) {
        ctx.beginPath();
        ctx.moveTo(edgeX, yBottom);
        ctx.quadraticCurveTo(edgeX + (edgeX === bridgeX ? -3.5 : 3.5), midY, edgeX, yTop);
        ctx.stroke();
      }
      // Golden arch ribs across bridge span
      ctx.strokeStyle = unlocked ? 'rgba(255, 226, 148, 0.68)' : 'rgba(182, 146, 86, 0.35)';
      ctx.lineWidth = 1;
      for (const frac of [0.28, 0.72]) {
        const ay = yTop + bH * frac;
        ctx.beginPath();
        ctx.moveTo(bridgeX + 2, ay);
        ctx.quadraticCurveTo(w * 0.5, ay - 2.4, bridgeX + bridgeW - 2, ay);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Unlocked glowing route line or locked crimson barrier seal
    if (unlocked) {
      ctx.save();
      ctx.strokeStyle = crossingIdx === 1 ? '#ffe28c' : '#64f8eb';
      ctx.lineWidth = 2;
      ctx.shadowColor = crossingIdx === 1 ? '#f4c55c' : '#4cd9d0';
      ctx.shadowBlur = 7;
      ctx.setLineDash([4, 3]);
      ctx.lineDashOffset = (now * 0.018) % 14;
      ctx.beginPath();
      ctx.moveTo(w * 0.5, yZoneFrom - 4);
      ctx.lineTo(w * 0.5, yZoneTo + 4);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.save();
      ctx.strokeStyle = '#ff4b5e';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#ff384c';
      ctx.shadowBlur = 6;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(bridgeX - 5, midY);
      ctx.lineTo(bridgeX + bridgeW + 5, midY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ff4b5e';
      ctx.beginPath();
      ctx.moveTo(w * 0.5, midY - 3.5);
      ctx.lineTo(w * 0.5 + 3.5, midY);
      ctx.lineTo(w * 0.5, midY + 3.5);
      ctx.lineTo(w * 0.5 - 3.5, midY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private drawMinimapTerrace(
    ctx: CanvasRenderingContext2D,
    w: number,
    cy: number,
    platW: number,
    platH: number,
    unlocked: boolean,
    isActive: boolean,
    isBossZone: boolean,
    now: number,
  ): void {
    const chamfer = 11;
    const x0 = (w - platW) * 0.5;
    const x1 = x0 + platW;
    const y0 = cy - platH * 0.5;
    const y1 = cy + platH * 0.5;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0 + chamfer, y0);
    ctx.lineTo(x1 - chamfer, y0);
    ctx.lineTo(x1, y0 + chamfer);
    ctx.lineTo(x1, y1 - chamfer);
    ctx.lineTo(x1 - chamfer, y1);
    ctx.lineTo(x0 + chamfer, y1);
    ctx.lineTo(x0, y1 - chamfer);
    ctx.lineTo(x0, y0 + chamfer);
    ctx.closePath();

    ctx.fillStyle = unlocked
      ? isBossZone
        ? 'rgba(42, 20, 32, 0.9)'
        : 'rgba(15, 34, 48, 0.9)'
      : 'rgba(12, 20, 32, 0.72)';
    ctx.fill();

    if (isActive) {
      const aura = ctx.createRadialGradient(w * 0.5, cy, 2, w * 0.5, cy, platW * 0.52);
      aura.addColorStop(0, isBossZone ? 'rgba(255, 198, 108, 0.24)' : 'rgba(88, 244, 224, 0.24)');
      aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = aura;
      ctx.fill();

      const pulse = 0.72 + 0.28 * Math.sin(now * 0.006);
      ctx.strokeStyle = isBossZone
        ? `rgba(255, 214, 118, ${pulse.toFixed(2)})`
        : `rgba(116, 250, 234, ${pulse.toFixed(2)})`;
      ctx.shadowColor = isBossZone ? '#f7c768' : '#4cd9d0';
      ctx.shadowBlur = 7;
      ctx.lineWidth = 1.8;
    } else {
      ctx.strokeStyle = unlocked
        ? isBossZone
          ? 'rgba(235, 118, 128, 0.56)'
          : 'rgba(76, 217, 208, 0.48)'
        : 'rgba(148, 166, 188, 0.24)';
      ctx.lineWidth = unlocked ? 1.2 : 1;
    }
    ctx.stroke();

    // Subtle inner courtyard seal ring
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(w * 0.5, cy, Math.min(platW, platH) * 0.24, 0, Math.PI * 2);
    ctx.strokeStyle = isActive
      ? isBossZone
        ? 'rgba(255, 214, 126, 0.45)'
        : 'rgba(120, 248, 232, 0.42)'
      : isBossZone
        ? 'rgba(245, 148, 120, 0.2)'
        : 'rgba(223, 192, 117, 0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  private drawMinimapEntities(
    ctx: CanvasRenderingContext2D,
    dots: MinimapEntityDot[],
    toX: (x: number) => number,
    toY: (z: number) => number,
    now: number,
  ): void {
    const drawStar = (cx: number, cy: number, outerR: number, innerR: number) => {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const a = (i * Math.PI) / 4 - Math.PI / 2;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };

    const order: Record<MinimapEntityDot['kind'], number> = {
      loot: 0,
      ally: 1,
      enemy: 2,
      elite: 3,
      boss: 4,
    };
    const sortedDots = [...dots].sort((a, b) => order[a.kind] - order[b.kind]);

    for (const dot of sortedDots) {
      const dx = toX(dot.x);
      const dy = toY(dot.z);
      ctx.save();
      if (dot.kind === 'loot') {
        ctx.fillStyle = '#ffd859';
        ctx.shadowColor = '#ffcb3d';
        ctx.shadowBlur = 6;
        drawStar(dx, dy, 4.8, 1.9);
        ctx.fill();
      } else if (dot.kind === 'ally') {
        ctx.fillStyle = '#54f0be';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(dx, dy, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (dot.kind === 'enemy') {
        ctx.fillStyle = '#ff4b5c';
        ctx.strokeStyle = 'rgba(20, 6, 10, 0.9)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(dx, dy, 2.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (dot.kind === 'elite') {
        ctx.fillStyle = '#ff9d3b';
        ctx.strokeStyle = '#ffe29a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(dx, dy - 4.4);
        ctx.lineTo(dx + 4.4, dy);
        ctx.lineTo(dx, dy + 4.4);
        ctx.lineTo(dx - 4.4, dy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (dot.kind === 'boss') {
        const pulse = 1 + 0.18 * Math.sin(now * 0.008);
        ctx.strokeStyle = 'rgba(255, 84, 106, 0.65)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(dx, dy, 6.8 * pulse, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#ff2e4d';
        ctx.strokeStyle = '#ffd87a';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(dx, dy, 4.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffe384';
        ctx.beginPath();
        ctx.moveTo(dx - 3.5, dy - 4.5);
        ctx.lineTo(dx - 3.5, dy - 7.8);
        ctx.lineTo(dx - 1.4, dy - 6.0);
        ctx.lineTo(dx, dy - 8.5);
        ctx.lineTo(dx + 1.4, dy - 6.0);
        ctx.lineTo(dx + 3.5, dy - 7.8);
        ctx.lineTo(dx + 3.5, dy - 4.5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawMinimapHeroArrow(ctx: CanvasRenderingContext2D, hx: number, hy: number, heroYaw: number): void {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(Math.PI - heroYaw);
    ctx.shadowColor = '#4cd9d0';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#7cfaf0';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.lineTo(4.6, 5);
    ctx.lineTo(0, 2.3);
    ctx.lineTo(-4.6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private q(sel: string): HTMLElement {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) throw new Error(`Missing HUD element: ${sel}`);
    return el;
  }
}

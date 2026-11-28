import {
  type EquipCategory,
  type EquipRarity,
  type EquippedLoadout,
  type HeroLoadoutStats,
  type RolledGearItem,
  DEFAULT_EQUIPPED,
  DEFAULT_STARTER_JADE,
  MAX_FORGE_LEVEL,
  MAX_INVENTORY_SIZE,
  SHOP_ITEM_MAP,
  STARTER_OWNED_ITEMS,
  computeHeroLoadoutStats,
  computeRolledGearScore,
  computeShopItemScore,
  getRolledUpgradeCost,
  getSalvageJade,
  getUpgradeCost,
  rollEquipmentDrop,
} from './EquipmentData';
import type { WorldBiome } from '../world/ShushanArena';
import type { BossArchetype } from '../entities/CharacterRig';
import { EPISODE_STORY_SCRIPTS } from './StoryScripts';
import {
  CHAPTER_STAR_CHESTS,
  type DifficultyTierId,
  type LeylineAffixId,
  type RoguelikeBlessingDef,
  type RoguelikePathId,
  type StageMode,
  TOWER_STAR_CHESTS,
} from './EndgameData';

export const BIOME_LABELS: Record<WorldBiome, string> = {
  bamboo_canyon: '翠竹云溪',
  peach_shrine: '十里桃源',
  sword_graveyard: '古剑荒冢',
  lava_abyss: '赤焰火狱',
  celestial_sanctum: '星穹天坛',
  astral_void: '太虚星海',
  haven_camp: '云来剑庐',
};

export type ChapterId = 1 | 2 | 3 | 4 | 5;
export type EnemyKind = 'bladesman' | 'caster' | 'elite' | 'boss';
export type EnemyAffix = 'swift' | 'vampiric' | 'ironclad' | 'storm';
export type StageHazardType = 'none' | 'lightning' | 'ember' | 'abyss';

export interface ChapterDef {
  id: ChapterId;
  roman: string;
  name: string;
  subtitle: string;
  stageRange: [number, number];
  accentHex: string;
  fogHex: string;
  bgHex: string;
  lanternLightHex: string;
  lanternFlameHex: string;
  skySwordRgb: [number, number, number];
  baguaBase: number;
  lore: string;
}

export interface StageEnemySpec {
  kind: EnemyKind;
  x: number;
  z: number;
  name?: string;
  hpMult?: number;
  poiseMult?: number;
  dmgMult?: number;
  speedMult?: number;
  scaleMult?: number;
  affix?: EnemyAffix;
  bossArchetype?: BossArchetype;
}

export interface StageWaveDef {
  label: string;
  subtitle?: string;
  enemies: StageEnemySpec[];
}

export interface StageDef {
  id: number;
  chapter: ChapterId;
  episodeNum: number;
  biome: WorldBiome;
  stageLayout?: 'corridor' | 'arena' | 'pillars' | 'islands';
  stageMode?: StageMode;
  leylineAffix?: LeylineAffixId;
  surviveSec?: number;
  monolithHp?: number;
  name: string;
  subtitle: string;
  badge: string;
  isBossStage: boolean;
  bossCutscene?: boolean;
  parTimeSec: number;
  recommendedRealm: string;
  hazard: StageHazardType;
  hazardLabel?: string;
  hazardIntervalSec?: number;
  hazardDamage?: number;
  introLine: string;
  victoryLine: string;
  waves: StageWaveDef[];
}

export interface BlessingDef {
  id: string;
  name: string;
  tag: string;
  desc: string;
  dmgBonus?: number;
  hpBonus?: number;
  speedBonus?: number;
  cdReduce?: number;
  ultBonus?: number;
  gourdBonus?: number;
}

export interface RunBlessingState {
  ids: string[];
  dmgMult: number;
  maxHpBonus: number;
  speedMult: number;
  cdMult: number;
  ultGainMult: number;
  extraGourds: number;
  critRateBonus: number;
  critDmgBonus: number;
  lifestealBonus: number;
  pathCounts: Record<RoguelikePathId, number>;
}

export interface StageClearRecord {
  stars: 1 | 2 | 3;
  bestTime: number;
  maxCombo: number;
}

export interface CampaignSaveStats {
  totalKills: number;
  totalParries: number;
  totalDungeons: number;
  totalForges: number;
  totalTowerClears: number;
  totalRoguelikeClears: number;
  totalWorldBosses: number;
  totalDefendWins: number;
  totalStoryChoices: number;
}

export interface CampaignSaveData {
  version: number;
  cleared: Record<number, StageClearRecord>;
  lastPlayedStage: number;
  jade: number;
  ownedItems: string[];
  equipped: EquippedLoadout;
  upgrades: Record<string, number>;
  inventory: RolledGearItem[];
  pityCounter: number;
  dungeonClears: Record<string, number>;
  stats: CampaignSaveStats;
  claimedBounties: string[];
  cultivationLevel: number;
  activeMealId: string | null;
  worldWaypoints?: string[];
  worldChests?: string[];
  worldOrbs?: string[];
  worldBossKills?: Record<string, number>;
  claimedChapterChests?: string[];
  towerStars?: Record<number, 1 | 2 | 3>;
  claimedTowerChests?: number[];
  roguelikeBestFloor?: number;
  roguelikeClears?: number;
  selectedDifficulty?: DifficultyTierId;
  storyChoices?: Record<number, string>;
  swordHeart?: { sword: number; heart: number };
  seenEpilogues?: number[];
}

export interface CultivationRealmStep {
  level: number;
  name: string;
  costJade: number;
  hpBonus: number;
  atkPct: number;
  spiritRegenPct: number;
  startUltBonus: number;
  desc: string;
}

export interface CampMealDef {
  id: string;
  name: string;
  costJade: number;
  badge: string;
  desc: string;
  hpBonus: number;
  dmgBonus: number;
  speedBonus: number;
  ultBonus: number;
}

export interface DungeonDef {
  id: string;
  name: string;
  subtitle: string;
  tier: 1 | 2 | 3;
  recommendedPower: number;
  dropRateText: string;
  guaranteedMinRarity: EquipRarity;
  bossTitle: string;
  jadeReward: number;
  stageDef: StageDef;
}

export interface BountyDef {
  id: string;
  title: string;
  desc: string;
  statKey: keyof CampaignSaveStats;
  target: number;
  rewardJade: number;
  rewardRarity?: EquipRarity;
}

export interface BountyState {
  def: BountyDef;
  progress: number;
  done: boolean;
  claimed: boolean;
}

export interface StageDialogueLine {
  speaker: string;
  role: 'elder' | 'ally' | 'enemy' | 'hero' | 'spirit';
  seal: string;
  text: string;
}

export interface EpisodeChoiceDef {
  id: string;
  title: string;
  subtitle: string;
  alignment?: 'sword' | 'heart';
  storyHint?: string;
  heroReply?: string;
  battleCallout?: string;
  dmgBonus?: number;
  speedBonus?: number;
  ultBonus?: number;
  hpBonus?: number;
  extraGourd?: number;
}

export interface StageDialogueDef {
  stageId: number;
  mode?: 'preStage' | 'epilogue' | 'campNpc' | 'replay';
  episodeTag: string;
  biomeLabel: string;
  kicker: string;
  title: string;
  chapterName: string;
  intel: string[];
  lines: StageDialogueLine[];
  choices: EpisodeChoiceDef[];
  confirmLabel?: string;
  tipText?: string;
}

export interface SwordRealmInfo {
  title: string;
  minStars: number;
  nextStars: number | null;
  hpBonus: number;
  dmgMult: number;
  spiritRegenMult: number;
}

export const AFFIX_META: Record<EnemyAffix, { label: string; desc: string }> = {
  swift: { label: '疾风', desc: '移速与攻击频率大幅提升' },
  vampiric: { label: '嗜血', desc: '命中后汲取气血回复自身' },
  ironclad: { label: '霸体', desc: '架势韧性极高，需重击或弹反破势' },
  storm: { label: '狂雷', desc: '重击附带范围雷环震荡' },
};

export const CHAPTERS: ChapterDef[] = [
  {
    id: 1,
    roman: '第一章',
    name: '蜀山山门',
    subtitle: '霜月寒阶 · 妖兵破关',
    stageRange: [1, 5],
    accentHex: '#63d8c6',
    fogHex: '#101d2c',
    bgHex: '#0c1522',
    lanternLightHex: '#ffb86b',
    lanternFlameHex: '#ffd89a',
    skySwordRgb: [0.55, 1.55, 1.8],
    baguaBase: 0.08,
    lore: '月寒蜀山外门，锁妖台封印松动，玄铁魔兵与幽冥术师沿石阶潜入山门。',
  },
  {
    id: 2,
    roman: '第二章',
    name: '剑冢幽冥',
    subtitle: '断剑残碑 · 紫雷鬼火',
    stageRange: [6, 10],
    accentHex: '#c084ff',
    fogHex: '#171128',
    bgHex: '#110c1f',
    lanternLightHex: '#b96cff',
    lanternFlameHex: '#e1a8ff',
    skySwordRgb: [1.15, 0.65, 1.9],
    baguaBase: 0.48,
    lore: '踏入古剑冢深处，残碑紫雷隐隐作响，血甲剑魔双煞与血狱剑尊镇守阵眼。',
  },
  {
    id: 3,
    roman: '第三章',
    name: '锁妖深渊',
    subtitle: '地火剑狱 · 赤焰焚天',
    stageRange: [11, 15],
    accentHex: '#ff8a4c',
    fogHex: '#231115',
    bgHex: '#180b0e',
    lanternLightHex: '#ff6e3a',
    lanternFlameHex: '#ffae70',
    skySwordRgb: [1.85, 0.72, 0.35],
    baguaBase: 0.76,
    lore: '锁妖塔火狱地脉翻涌，地火阵法灼烧石台，嗜血重甲军团与焚天剑圣拦路。',
  },
  {
    id: 4,
    roman: '第四章',
    name: '九幽绝巅',
    subtitle: '寂灭天劫 · 镇狱终战',
    stageRange: [16, 20],
    accentHex: '#ff525e',
    fogHex: '#140b18',
    bgHex: '#0d0711',
    lanternLightHex: '#ff424c',
    lanternFlameHex: '#ff8278',
    skySwordRgb: [1.95, 0.42, 0.52],
    baguaBase: 0.96,
    lore: '登顶九幽锁妖剑台绝巅，历代魔剑煞灵合流，直面九幽剑煞·镇狱天尊！',
  },
  {
    id: 5,
    roman: '第五章',
    name: '太虚仙域',
    subtitle: '星海裂隙 · 剑心问道',
    stageRange: [21, 25],
    accentHex: '#68e8ff',
    fogHex: '#111632',
    bgHex: '#0b0f26',
    lanternLightHex: '#5ee8ff',
    lanternFlameHex: '#b8f8ff',
    skySwordRgb: [0.65, 1.85, 2.2],
    baguaBase: 1.0,
    lore: '锁妖终劫虽平，天穹却裂开上古太虚星海。太虚剑灵·云裳苏醒传音，邀李逍遥踏星阶、破心魔，直面太虚剑祖！',
  },
];

export const BLESSINGS: BlessingDef[] = [
  {
    id: 'lotus_edge',
    name: '青莲剑心',
    tag: '剑伤强化',
    desc: '所有普攻与剑诀伤害 +18%',
    dmgBonus: 0.18,
  },
  {
    id: 'taiji_body',
    name: '太极护体',
    tag: '生存强体',
    desc: '气血上限 +45 并立刻回满气血',
    hpBonus: 45,
  },
  {
    id: 'wind_step',
    name: '御风凌波',
    tag: '极速身法',
    desc: '移速 +14%，闪避走位更轻灵',
    speedBonus: 0.14,
  },
  {
    id: 'thunder_seal',
    name: '天雷剑印',
    tag: '极速冷却',
    desc: '御剑/万剑/天剑冷却缩减 22%',
    cdReduce: 0.22,
  },
  {
    id: 'spirit_surge',
    name: '浩然剑意',
    tag: '大招爆发',
    desc: '剑意获取效率 +38%，更快蓄满天剑',
    ultBonus: 0.38,
  },
  {
    id: 'immortal_gourd',
    name: '灵葫仙酿',
    tag: '续航补给',
    desc: '灵葫酒上限 +2，续航无忧',
    gourdBonus: 2,
  },
];

export const CAMPAIGN_STAGES: StageDef[] = [
  // ===================== CHAPTER 1: 蜀山山门 (1–5) =====================
  {
    id: 1,
    chapter: 1,
    episodeNum: 1,
    biome: 'bamboo_canyon',
    name: '剑启山门',
    subtitle: '蜀山山门 · 妖兵破关',
    badge: '入门试剑',
    isBossStage: false,
    parTimeSec: 78,
    recommendedRealm: '炼气初境',
    hazard: 'none',
    introLine: '月色如霜，锁妖台外妖煞初动，先清山门先锋！',
    victoryLine: '山门妖卒已清，剑锋初试锋芒。',
    waves: [
      {
        label: '山门先锋',
        enemies: [
          { kind: 'bladesman', x: -4.2, z: -3.6, name: '山门妖锋', hpMult: 1.08, dmgMult: 1.05 },
          { kind: 'bladesman', x: 4.3, z: -3.2, name: '山门妖锋', hpMult: 1.08, dmgMult: 1.05 },
          { kind: 'caster', x: 0.0, z: -7.8, name: '幽冥符道', hpMult: 1.06, dmgMult: 1.04 },
        ],
      },
      {
        label: '疾风狂雷增援',
        enemies: [
          { kind: 'bladesman', x: -4.4, z: -4.2, name: '疾风妖锋', hpMult: 1.12, dmgMult: 1.08, affix: 'swift' },
          { kind: 'bladesman', x: 4.4, z: -4.2, name: '疾风妖锋', hpMult: 1.12, dmgMult: 1.08, affix: 'swift' },
          { kind: 'bladesman', x: 0.0, z: -6.4, name: '狂雷先锋', hpMult: 1.24, dmgMult: 1.12, affix: 'storm' },
        ],
      },
    ],
  },
  {
    id: 2,
    chapter: 1,
    episodeNum: 2,
    biome: 'bamboo_canyon',
    name: '霜阶巡煞',
    subtitle: '长阶双波 · 夹击破阵',
    badge: '双波攻势',
    isBossStage: false,
    parTimeSec: 86,
    recommendedRealm: '炼气初境',
    hazard: 'none',
    introLine: '两路巡山妖兵自石阶合围，莫被法术牵制阵脚！',
    victoryLine: '两波巡煞尽数伏诛，石阶重归安宁。',
    waves: [
      {
        label: '前哨巡卒',
        enemies: [
          { kind: 'bladesman', x: -4.8, z: -3.2, name: '玄铁刀卫', hpMult: 1.24, dmgMult: 1.15 },
          { kind: 'bladesman', x: 4.8, z: -3.2, name: '玄铁刀卫', hpMult: 1.24, dmgMult: 1.15 },
          { kind: 'caster', x: 0.0, z: -7.6, name: '前哨符师', hpMult: 1.16, dmgMult: 1.12 },
        ],
      },
      {
        label: '后援玄道',
        enemies: [
          { kind: 'bladesman', x: 0.0, z: -5.4, name: '重甲盾锋', hpMult: 1.34, poiseMult: 1.16, dmgMult: 1.2, affix: 'ironclad' },
          { kind: 'caster', x: -5.6, z: -6.8, name: '左翼符师', hpMult: 1.22, dmgMult: 1.16 },
          { kind: 'caster', x: 5.6, z: -6.8, name: '右翼符师', hpMult: 1.22, dmgMult: 1.16 },
        ],
      },
    ],
  },
  {
    id: 3,
    chapter: 1,
    episodeNum: 3,
    biome: 'peach_shrine',
    stageLayout: 'pillars',
    name: '幽符困阵',
    subtitle: '三才法阵 · 破符夺先',
    badge: '疾风狂雷',
    isBossStage: false,
    parTimeSec: 92,
    recommendedRealm: '炼气初境',
    hazard: 'none',
    introLine: '幽冥术师布下三才阴符阵，疾步贴身破其阵眼！',
    victoryLine: '阴符阵碎，灵气重归山门。',
    waves: [
      {
        label: '阴符前阵',
        enemies: [
          { kind: 'caster', x: -5.4, z: -6.2, name: '阴煞符道', hpMult: 1.26, dmgMult: 1.18 },
          { kind: 'caster', x: 5.4, z: -6.2, name: '阴煞符道', hpMult: 1.26, dmgMult: 1.18 },
          { kind: 'bladesman', x: 0.0, z: -3.4, name: '护法剑卒', hpMult: 1.3, dmgMult: 1.18, affix: 'swift' },
        ],
      },
      {
        label: '阵眼增援',
        enemies: [
          { kind: 'bladesman', x: -3.6, z: -4.8, name: '疾风妖剑', hpMult: 1.3, dmgMult: 1.2, affix: 'swift' },
          { kind: 'bladesman', x: 3.6, z: -4.8, name: '狂雷刀卒', hpMult: 1.34, dmgMult: 1.22, affix: 'storm' },
          { kind: 'caster', x: 0.0, z: -8.6, name: '阵眼大术师', hpMult: 1.4, dmgMult: 1.24 },
        ],
      },
    ],
  },
  {
    id: 4,
    chapter: 1,
    episodeNum: 4,
    biome: 'bamboo_canyon',
    stageLayout: 'pillars',
    stageMode: 'defend',
    leylineAffix: 'parry_nova',
    monolithHp: 580,
    name: '残碑铁骑',
    subtitle: '守护灵脉 · 惊雷弹反',
    badge: '守护灵脉',
    isBossStage: false,
    parTimeSec: 98,
    recommendedRealm: '筑基剑修',
    hazard: 'none',
    introLine: '血甲都尉攻打蜀山灵脉水晶！主动拉怪并抓准红光弹反触发惊雷！',
    victoryLine: '灵脉安然，血甲都尉折戟残碑！',
    waves: [
      {
        label: '铁骑护卫',
        enemies: [
          { kind: 'bladesman', x: -4.5, z: -3.6, name: '玄铁锐卒', hpMult: 1.34, dmgMult: 1.22, affix: 'swift' },
          { kind: 'bladesman', x: 4.5, z: -3.6, name: '玄铁锐卒', hpMult: 1.34, dmgMult: 1.22, affix: 'storm' },
          { kind: 'caster', x: 0.0, z: -7.5, name: '随军玄道', hpMult: 1.28, dmgMult: 1.2 },
        ],
      },
      {
        label: '血甲都尉降临',
        enemies: [
          { kind: 'elite', x: 0.0, z: -5.8, name: '血甲都尉 · 斩岳', hpMult: 1.4, poiseMult: 1.2, dmgMult: 1.26, affix: 'ironclad' },
          { kind: 'bladesman', x: -5.2, z: -3.0, name: '亲卫魔卒', hpMult: 1.3, dmgMult: 1.22, affix: 'storm' },
          { kind: 'caster', x: 5.2, z: -6.8, name: '随军咒师', hpMult: 1.24, dmgMult: 1.18 },
        ],
      },
    ],
  },
  {
    id: 5,
    chapter: 1,
    episodeNum: 5,
    biome: 'peach_shrine',
    name: '守门魔将',
    subtitle: '第一章首领 · 玄甲破岳',
    badge: '章末 Boss',
    isBossStage: true,
    bossCutscene: true,
    parTimeSec: 122,
    recommendedRealm: '筑基剑修',
    hazard: 'none',
    introLine: '蜀山小儿，先过本将手中巨剑！',
    victoryLine: '第一章通关！蜀山山门肃清，剑冢古道已开启。',
    waves: [
      {
        label: '镇门亲卫',
        enemies: [
          { kind: 'bladesman', x: -4.4, z: -3.8, name: '破岳前锋', hpMult: 1.38, dmgMult: 1.24, affix: 'storm' },
          { kind: 'bladesman', x: 4.2, z: -3.8, name: '镇门锐卒', hpMult: 1.36, dmgMult: 1.22, affix: 'swift' },
          { kind: 'caster', x: 0.0, z: -7.2, name: '镇门咒师', hpMult: 1.32, dmgMult: 1.22 },
        ],
      },
      {
        label: '章末首领 · 玄甲镇门将',
        enemies: [
          {
            kind: 'boss',
            x: 0.0,
            z: -5.0,
            name: '玄甲镇门将 · 破岳',
            bossArchetype: 'titan',
            hpMult: 1.38,
            poiseMult: 1.25,
            dmgMult: 1.22,
            scaleMult: 0.98,
          },
        ],
      },
    ],
  },

  // ===================== CHAPTER 2: 剑冢幽冥 (6–10) =====================
  {
    id: 6,
    chapter: 2,
    episodeNum: 6,
    biome: 'sword_graveyard',
    name: '断剑荒原',
    subtitle: '剑冢外围 · 疾风煞影',
    badge: '疾风词缀',
    isBossStage: false,
    parTimeSec: 96,
    recommendedRealm: '筑基剑修',
    hazard: 'none',
    introLine: '踏入剑冢荒原，此处魔兵皆染疾风煞气，出剑极快！',
    victoryLine: '疾风魔兵尽破，深入剑冢腹地。',
    waves: [
      {
        label: '疾风前驱',
        enemies: [
          { kind: 'bladesman', x: -5.0, z: -3.5, name: '疾风剑傀', hpMult: 1.37, dmgMult: 1.24, affix: 'swift' },
          { kind: 'bladesman', x: 5.0, z: -3.5, name: '疾风剑傀', hpMult: 1.37, dmgMult: 1.24, affix: 'swift' },
          { kind: 'caster', x: 0.0, z: -8.0, name: '剑冢冥道', hpMult: 1.37, dmgMult: 1.24 },
        ],
      },
      {
        label: '血甲突袭',
        subtitle: '疾风血甲游骑自断碑后杀出！',
        enemies: [
          { kind: 'elite', x: 0.0, z: -5.8, name: '疾风魔将 · 掠影', hpMult: 1.37, poiseMult: 1.2, dmgMult: 1.24, affix: 'swift' },
          { kind: 'caster', x: -5.8, z: -7.2, name: '剑冢冥道', hpMult: 1.32, dmgMult: 1.24 },
        ],
      },
    ],
  },
  {
    id: 7,
    chapter: 2,
    episodeNum: 7,
    biome: 'sword_graveyard',
    stageLayout: 'pillars',
    name: '鬼火祭坛',
    subtitle: '天雷阵域 · 步步惊心',
    badge: '天雷灾害',
    isBossStage: false,
    parTimeSec: 100,
    recommendedRealm: '筑基剑修',
    hazard: 'lightning',
    hazardLabel: '剑冢紫雷',
    hazardIntervalSec: 4.6,
    hazardDamage: 24,
    introLine: '古祭坛引动九天紫雷！留意脚下紫红预警阵，及时踏云闪避！',
    victoryLine: '天雷息止，祭坛鬼火尽散。',
    waves: [
      {
        label: '祭坛守卫',
        enemies: [
          { kind: 'bladesman', x: -4.4, z: -4.0, name: '雷煞铁卫', hpMult: 1.4, dmgMult: 1.27 },
          { kind: 'caster', x: 4.8, z: -6.8, name: '唤雷冥师', hpMult: 1.4, dmgMult: 1.3 },
          { kind: 'caster', x: -4.8, z: -6.8, name: '唤雷冥师', hpMult: 1.4, dmgMult: 1.3 },
        ],
      },
      {
        label: '雷纹魔将',
        subtitle: '狂雷剑魔现身祭坛中央，小心雷环余波！',
        enemies: [
          { kind: 'elite', x: 0.0, z: -5.2, name: '紫雷剑魔 · 震霆', hpMult: 1.44, poiseMult: 1.2, dmgMult: 1.27, affix: 'storm' },
          { kind: 'bladesman', x: 4.5, z: -3.2, name: '雷煞铁卫', hpMult: 1.37, dmgMult: 1.24 },
        ],
      },
    ],
  },
  {
    id: 8,
    chapter: 2,
    episodeNum: 8,
    biome: 'sword_graveyard',
    stageLayout: 'pillars',
    stageMode: 'survive',
    leylineAffix: 'rapid_cooldown',
    surviveSec: 42,
    name: '血甲双煞',
    subtitle: '限时生存 42 秒 · 瞬息剑域',
    badge: '限时突围',
    isBossStage: false,
    parTimeSec: 72,
    recommendedRealm: '金丹剑客',
    hazard: 'none',
    introLine: '剑冢双煞引妖潮合围！此地冷却大减，借助法阵熬过 42 秒突围！',
    victoryLine: '血战 42 秒突围成功，血甲双煞闻风丧胆！',
    waves: [
      {
        label: '血甲双煞联阵',
        enemies: [
          { kind: 'elite', x: -4.6, z: -5.4, name: '血甲左使 · 破军', hpMult: 1.32, poiseMult: 1.2, dmgMult: 1.27, affix: 'swift' },
          { kind: 'elite', x: 4.6, z: -5.4, name: '血甲右使 · 贪狼', hpMult: 1.37, poiseMult: 1.2, dmgMult: 1.27, affix: 'ironclad' },
          { kind: 'caster', x: 0.0, z: -9.0, name: '祭坛冥道', hpMult: 1.37, dmgMult: 1.24 },
        ],
      },
    ],
  },
  {
    id: 9,
    chapter: 2,
    episodeNum: 9,
    biome: 'sword_graveyard',
    name: '剑冢围城',
    subtitle: '三波血战 · 万剑扫荡',
    badge: '三波血战',
    isBossStage: false,
    parTimeSec: 126,
    recommendedRealm: '金丹剑客',
    hazard: 'lightning',
    hazardLabel: '剑冢紫雷',
    hazardIntervalSec: 5.4,
    hazardDamage: 24,
    introLine: '四面残碑妖军齐涌，连破三波围城方可直逼血尊大殿！',
    victoryLine: '三波妖军全灭，剑冢血尊已现身殿前！',
    waves: [
      {
        label: '第一波 · 剑傀突击',
        enemies: [
          { kind: 'bladesman', x: -5.4, z: -3.2, name: '断剑魔卒', hpMult: 1.4, dmgMult: 1.27 },
          { kind: 'bladesman', x: 0.0, z: -6.2, name: '断剑魔卒', hpMult: 1.4, dmgMult: 1.27 },
          { kind: 'bladesman', x: 5.4, z: -3.2, name: '断剑魔卒', hpMult: 1.4, dmgMult: 1.27 },
        ],
      },
      {
        label: '第二波 · 冥法齐射',
        subtitle: '三名幽冥玄道布阵齐射，速以万剑诀破阵！',
        enemies: [
          { kind: 'caster', x: -5.8, z: -6.6, name: '幽冥法尊', hpMult: 1.42, dmgMult: 1.3 },
          { kind: 'caster', x: 0.0, z: -8.6, name: '幽冥法尊', hpMult: 1.42, dmgMult: 1.3 },
          { kind: 'caster', x: 5.8, z: -6.6, name: '幽冥法尊', hpMult: 1.42, dmgMult: 1.3 },
        ],
      },
      {
        label: '第三波 · 督军压轴',
        subtitle: '霸体血甲统领率死士总攻！',
        enemies: [
          { kind: 'elite', x: 0.0, z: -5.8, name: '剑冢督军 · 铁煞', hpMult: 1.56, poiseMult: 1.5, dmgMult: 1.32, affix: 'ironclad' },
          { kind: 'bladesman', x: -4.6, z: -3.6, name: '嗜血死士', hpMult: 1.37, dmgMult: 1.27, affix: 'vampiric' },
          { kind: 'bladesman', x: 4.6, z: -3.6, name: '嗜血死士', hpMult: 1.37, dmgMult: 1.27, affix: 'vampiric' },
        ],
      },
    ],
  },
  {
    id: 10,
    chapter: 2,
    episodeNum: 10,
    biome: 'sword_graveyard',
    name: '血狱剑尊',
    subtitle: '第二章首领 · 赤霄魔君',
    badge: '章末 Boss',
    isBossStage: true,
    bossCutscene: true,
    parTimeSec: 138,
    recommendedRealm: '金丹剑客',
    hazard: 'lightning',
    hazardLabel: '血雷天罚',
    hazardIntervalSec: 5.0,
    hazardDamage: 28,
    introLine: '葬身剑冢之魂，皆为本尊剑下养料！',
    victoryLine: '第二章通关！古剑冢封印重固，锁妖深渊入口洞开。',
    waves: [
      {
        label: '剑尊仪仗',
        enemies: [
          { kind: 'elite', x: -3.8, z: -5.2, name: '赤霄剑侍', hpMult: 1.24, poiseMult: 1.2, dmgMult: 1.27 },
          { kind: 'caster', x: 4.8, z: -7.2, name: '血狱祭司', hpMult: 1.4, dmgMult: 1.3 },
        ],
      },
      {
        label: '章末首领 · 赤霄魔君',
        subtitle: '剑冢血尊·赤霄魔君持断岳重剑御雷降临！',
        enemies: [
          {
            kind: 'boss',
            x: 0.0,
            z: -5.0,
            name: '剑冢血尊 · 赤霄魔君',
            bossArchetype: 'phantom',
            hpMult: 1.37,
            poiseMult: 1.32,
            dmgMult: 1.3,
            affix: 'storm',
          },
        ],
      },
    ],
  },

  // ===================== CHAPTER 3: 锁妖深渊 (11–15) =====================
  {
    id: 11,
    chapter: 3,
    episodeNum: 11,
    biome: 'lava_abyss',
    stageLayout: 'islands',
    name: '赤焰剑狱',
    subtitle: '地火喷涌 · 焦土血战',
    badge: '地火灾害',
    isBossStage: false,
    parTimeSec: 112,
    recommendedRealm: '金丹剑客',
    hazard: 'ember',
    hazardLabel: '深渊地火',
    hazardIntervalSec: 4.0,
    hazardDamage: 28,
    introLine: '锁妖深渊地脉炽烈，地火剑阵随时自脚下喷发！',
    victoryLine: '踏火破敌，锁妖火狱外围告破！',
    waves: [
      {
        label: '炎狱先锋',
        enemies: [
          { kind: 'bladesman', x: -4.8, z: -4.2, name: '炎甲刀魔', hpMult: 1.61, poiseMult: 1.2, dmgMult: 1.39, affix: 'ironclad' },
          { kind: 'bladesman', x: 4.8, z: -4.2, name: '炎甲刀魔', hpMult: 1.61, poiseMult: 1.2, dmgMult: 1.39, affix: 'ironclad' },
          { kind: 'caster', x: 0.0, z: -8.2, name: '赤焰咒道', hpMult: 1.56, dmgMult: 1.39 },
        ],
      },
      {
        label: '火狱魔将',
        subtitle: '炎甲校尉率军截断退路！',
        enemies: [
          { kind: 'elite', x: 0.0, z: -5.5, name: '炎狱校尉 · 焚骨', hpMult: 1.65, poiseMult: 1.2, dmgMult: 1.42, affix: 'storm' },
          { kind: 'bladesman', x: -5.0, z: -3.2, name: '疾风火傀', hpMult: 1.53, dmgMult: 1.36, affix: 'swift' },
          { kind: 'caster', x: 5.4, z: -6.8, name: '赤焰咒道', hpMult: 1.53, dmgMult: 1.39 },
        ],
      },
    ],
  },
  {
    id: 12,
    chapter: 3,
    episodeNum: 12,
    biome: 'lava_abyss',
    stageLayout: 'islands',
    stageMode: 'defend',
    leylineAffix: 'blood_pact',
    monolithHp: 700,
    name: '嗜血狂潮',
    subtitle: '守护灵脉 · 血煞契约',
    badge: '守护魔潮',
    isBossStage: false,
    parTimeSec: 112,
    recommendedRealm: '元婴剑尊',
    hazard: 'ember',
    hazardLabel: '深渊地火',
    hazardIntervalSec: 4.7,
    hazardDamage: 28,
    introLine: '【血煞契约】激活，边守住镇狱灵脉边借吸血续航杀退嗜血魔潮！',
    victoryLine: '剑光如电血气难侵，灵脉与狂潮一并定鼎！',
    waves: [
      {
        label: '嗜血魔阵',
        enemies: [
          { kind: 'elite', x: -3.6, z: -5.2, name: '嗜血狂将 · 饮煞', hpMult: 1.66, poiseMult: 1.2, dmgMult: 1.44, affix: 'vampiric' },
          { kind: 'bladesman', x: 4.2, z: -3.8, name: '嗜血魔兵', hpMult: 1.59, dmgMult: 1.42, affix: 'vampiric' },
          { kind: 'bladesman', x: -5.4, z: -2.6, name: '嗜血魔兵', hpMult: 1.59, dmgMult: 1.42, affix: 'vampiric' },
        ],
      },
      {
        label: '血魔统领',
        subtitle: '第二波嗜血统领与双符道夹击！',
        enemies: [
          { kind: 'elite', x: 0.0, z: -5.6, name: '血海魔统 · 噬魂', hpMult: 1.76, poiseMult: 1.2, dmgMult: 1.46, affix: 'vampiric' },
          { kind: 'caster', x: -5.6, z: -7.2, name: '血咒大祭司', hpMult: 1.59, dmgMult: 1.42 },
          { kind: 'caster', x: 5.6, z: -7.2, name: '血咒大祭司', hpMult: 1.59, dmgMult: 1.42 },
        ],
      },
    ],
  },
  {
    id: 13,
    chapter: 3,
    episodeNum: 13,
    biome: 'lava_abyss',
    stageLayout: 'pillars',
    name: '符阵合围',
    subtitle: '四象幽冥 · 弹幕破阵',
    badge: '四方弹幕',
    isBossStage: false,
    parTimeSec: 118,
    recommendedRealm: '元婴剑尊',
    hazard: 'ember',
    hazardLabel: '深渊地火',
    hazardIntervalSec: 4.4,
    hazardDamage: 30,
    introLine: '四方幽冥法尊结成天罗弹幕阵，走位游击逐个击杀！',
    victoryLine: '四象符阵全毁，锁妖深渊屏障洞开！',
    waves: [
      {
        label: '四象符阵',
        enemies: [
          { kind: 'caster', x: -6.2, z: -5.4, name: '青龙冥师', hpMult: 1.61, dmgMult: 1.44 },
          { kind: 'caster', x: 6.2, z: -5.4, name: '白虎冥师', hpMult: 1.61, dmgMult: 1.44 },
          { kind: 'caster', x: -4.2, z: -9.0, name: '朱雀冥师', hpMult: 1.61, dmgMult: 1.44 },
          { kind: 'caster', x: 4.2, z: -9.0, name: '玄武冥师', hpMult: 1.61, dmgMult: 1.44 },
        ],
      },
      {
        label: '镇阵铁壁',
        subtitle: '霸体巨将率疾风死士护阵反扑！',
        enemies: [
          { kind: 'elite', x: 0.0, z: -5.2, name: '镇阵铁将 · 不动', hpMult: 1.83, poiseMult: 1.62, dmgMult: 1.46, affix: 'ironclad' },
          { kind: 'bladesman', x: -4.6, z: -3.2, name: '疾风刺客', hpMult: 1.54, dmgMult: 1.44, affix: 'swift' },
          { kind: 'bladesman', x: 4.6, z: -3.2, name: '疾风刺客', hpMult: 1.54, dmgMult: 1.44, affix: 'swift' },
        ],
      },
    ],
  },
  {
    id: 14,
    chapter: 3,
    episodeNum: 14,
    biome: 'lava_abyss',
    stageLayout: 'islands',
    name: '锁妖双王',
    subtitle: '深渊双将 · 天剑破局',
    badge: '双将压境',
    isBossStage: false,
    parTimeSec: 126,
    recommendedRealm: '元婴剑尊',
    hazard: 'ember',
    hazardLabel: '深渊地火',
    hazardIntervalSec: 4.0,
    hazardDamage: 32,
    introLine: '炎狱双王同时出阵，蓄满天剑一举断其联手之势！',
    victoryLine: '双王齐陨，焚天剑圣已亲临火狱之巅！',
    waves: [
      {
        label: '深渊双王',
        enemies: [
          { kind: 'elite', x: -4.8, z: -5.4, name: '赤炎魔将 · 烈穹', hpMult: 1.81, poiseMult: 1.2, dmgMult: 1.49, affix: 'storm', scaleMult: 1.06 },
          { kind: 'elite', x: 4.8, z: -5.4, name: '玄煞魔将 · 碎魂', hpMult: 1.81, poiseMult: 1.2, dmgMult: 1.49, affix: 'vampiric', scaleMult: 1.06 },
          { kind: 'caster', x: 0.0, z: -8.8, name: '炎狱大祭司', hpMult: 1.68, dmgMult: 1.46 },
        ],
      },
    ],
  },
  {
    id: 15,
    chapter: 3,
    episodeNum: 15,
    biome: 'lava_abyss',
    stageLayout: 'islands',
    name: '焚天剑煞',
    subtitle: '第三章首领 · 炎狱妖王',
    badge: '章末 Boss',
    isBossStage: true,
    bossCutscene: true,
    parTimeSec: 148,
    recommendedRealm: '化神剑仙',
    hazard: 'ember',
    hazardLabel: '焚天火劫',
    hazardIntervalSec: 3.8,
    hazardDamage: 32,
    introLine: '三百年地火淬剑，今日拿蜀山剑修试锋！',
    victoryLine: '第三章通关！锁妖深渊烈焰平息，终极绝巅之路开启！',
    waves: [
      {
        label: '火狱禁卫',
        enemies: [
          { kind: 'bladesman', x: -4.5, z: -4.0, name: '焚天剑卫', hpMult: 1.66, dmgMult: 1.44, affix: 'swift' },
          { kind: 'bladesman', x: 4.5, z: -4.0, name: '焚天剑卫', hpMult: 1.66, dmgMult: 1.44, affix: 'vampiric' },
        ],
      },
      {
        label: '章末首领 · 炎狱妖王',
        subtitle: '焚天剑圣·炎狱妖王破火而出，剑势惊天！',
        enemies: [
          {
            kind: 'boss',
            x: 0.0,
            z: -5.0,
            name: '焚天剑圣 · 炎狱妖王',
            bossArchetype: 'inferno',
            hpMult: 1.73,
            poiseMult: 1.5,
            dmgMult: 1.49,
            affix: 'storm',
            scaleMult: 1.03,
          },
        ],
      },
    ],
  },

  // ===================== CHAPTER 4: 九幽绝巅 (16–20) =====================
  {
    id: 16,
    chapter: 4,
    episodeNum: 16,
    biome: 'celestial_sanctum',
    stageLayout: 'pillars',
    name: '九幽玄阶',
    subtitle: '绝巅初阶 · 九幽劫雷',
    badge: '九幽天劫',
    isBossStage: false,
    parTimeSec: 128,
    recommendedRealm: '化神剑仙',
    hazard: 'abyss',
    hazardLabel: '九幽天劫',
    hazardIntervalSec: 3.4,
    hazardDamage: 34,
    introLine: '踏上九幽玄阶，天劫剑雷密布，唯有步步精准方能生还！',
    victoryLine: '九幽初阶告破，剑气直冲霄汉！',
    waves: [
      {
        label: '九幽铁卫',
        enemies: [
          { kind: 'bladesman', x: -5.0, z: -4.0, name: '九幽冥卒', hpMult: 1.83, dmgMult: 1.53, affix: 'swift' },
          { kind: 'bladesman', x: 5.0, z: -4.0, name: '九幽冥卒', hpMult: 1.83, poiseMult: 1.2, dmgMult: 1.53, affix: 'ironclad' },
          { kind: 'caster', x: 0.0, z: -8.5, name: '九幽长老', hpMult: 1.81, dmgMult: 1.53 },
        ],
      },
      {
        label: '九幽血将',
        subtitle: '九幽血甲先锋率咒师合围！',
        enemies: [
          { kind: 'elite', x: 0.0, z: -5.6, name: '九幽镇将 · 绝尘', hpMult: 1.98, poiseMult: 1.2, dmgMult: 1.56, affix: 'storm' },
          { kind: 'caster', x: -5.6, z: -7.2, name: '九幽长老', hpMult: 1.73, dmgMult: 1.51 },
          { kind: 'caster', x: 5.6, z: -7.2, name: '九幽长老', hpMult: 1.73, dmgMult: 1.51 },
        ],
      },
    ],
  },
  {
    id: 17,
    chapter: 4,
    episodeNum: 17,
    biome: 'celestial_sanctum',
    stageLayout: 'islands',
    stageMode: 'survive',
    leylineAffix: 'glass_cannon',
    surviveSec: 45,
    name: '剑意试炼',
    subtitle: '极限生存 45 秒 · 绝命问剑',
    badge: '绝命生存',
    isBossStage: false,
    parTimeSec: 75,
    recommendedRealm: '化神剑仙',
    hazard: 'abyss',
    hazardLabel: '九幽天劫',
    hazardIntervalSec: 3.7,
    hazardDamage: 34,
    introLine: '绝命问剑词缀下双方爆发剧增！利用灵晶与天剑在 45 秒血斗中生还！',
    victoryLine: '死地生还！极速剑意已达化神巅峰！',
    waves: [
      {
        label: '影煞三剑',
        enemies: [
          { kind: 'bladesman', x: -5.2, z: -3.8, name: '瞬影剑鬼', hpMult: 1.4, dmgMult: 1.63, speedMult: 1.25, affix: 'swift' },
          { kind: 'bladesman', x: 0.0, z: -6.4, name: '瞬影剑鬼', hpMult: 1.4, dmgMult: 1.63, speedMult: 1.25, affix: 'swift' },
          { kind: 'bladesman', x: 5.2, z: -3.8, name: '瞬影剑鬼', hpMult: 1.4, dmgMult: 1.63, speedMult: 1.25, affix: 'swift' },
        ],
      },
      {
        label: '疾风双剑豪',
        subtitle: '双疾风剑豪袭来，完美弹反即可一击破势！',
        enemies: [
          { kind: 'elite', x: -4.4, z: -5.0, name: '追风剑豪 · 孤云', hpMult: 1.61, poiseMult: 1.2, dmgMult: 1.6, speedMult: 1.22, affix: 'swift' },
          { kind: 'elite', x: 4.4, z: -5.0, name: '逐电剑豪 · 惊鸿', hpMult: 1.61, poiseMult: 1.2, dmgMult: 1.6, speedMult: 1.22, affix: 'swift' },
        ],
      },
    ],
  },
  {
    id: 18,
    chapter: 4,
    episodeNum: 18,
    biome: 'celestial_sanctum',
    stageLayout: 'islands',
    stageMode: 'bossRush',
    leylineAffix: 'titan_armor',
    name: '魔将车轮',
    subtitle: '连斩首领 · 玄铁镇域',
    badge: '连斩魔将',
    isBossStage: false,
    parTimeSec: 145,
    recommendedRealm: '化神剑仙',
    hazard: 'abyss',
    hazardLabel: '九幽天劫',
    hazardIntervalSec: 3.8,
    hazardDamage: 36,
    introLine: '九幽三魔将车轮连斩！玄铁镇域下破势处决伤害翻倍！',
    victoryLine: '连斩三员魔将，九幽绝巅已无阻隔！',
    waves: [
      {
        label: '第一阵 · 霸体魔将',
        enemies: [
          { kind: 'elite', x: 0.0, z: -5.4, name: '玄铁魔将 · 镇山', hpMult: 2.03, poiseMult: 1.68, dmgMult: 1.58, affix: 'ironclad' },
          { kind: 'caster', x: -5.4, z: -7.4, name: '九幽术尊', hpMult: 1.76, dmgMult: 1.53 },
        ],
      },
      {
        label: '第二阵 · 嗜血魔将',
        subtitle: '第二员魔将踏血而来，切勿贪刀！',
        enemies: [
          { kind: 'elite', x: 0.0, z: -5.4, name: '血海魔将 · 断肠', hpMult: 2.03, poiseMult: 1.2, dmgMult: 1.6, affix: 'vampiric' },
          { kind: 'bladesman', x: 4.8, z: -3.6, name: '九幽死士', hpMult: 1.78, dmgMult: 1.53, affix: 'swift' },
        ],
      },
      {
        label: '第三阵 · 狂雷魔将',
        subtitle: '最后一员魔将引动天雷总攻！',
        enemies: [
          { kind: 'elite', x: 0.0, z: -5.4, name: '天劫魔将 · 灭世', hpMult: 2.12, poiseMult: 1.2, dmgMult: 1.63, affix: 'storm' },
          { kind: 'caster', x: 5.4, z: -7.4, name: '九幽术尊', hpMult: 1.81, dmgMult: 1.56 },
        ],
      },
    ],
  },
  {
    id: 19,
    chapter: 4,
    episodeNum: 19,
    biome: 'celestial_sanctum',
    name: '绝巅双魔',
    subtitle: '双首领同台 · 终局前夜',
    badge: '双 Boss 战',
    isBossStage: true,
    bossCutscene: true,
    parTimeSec: 160,
    recommendedRealm: '蜀山剑圣',
    hazard: 'abyss',
    hazardLabel: '九幽雷阵',
    hazardIntervalSec: 3.4,
    hazardDamage: 36,
    introLine: '镇狱天尊座下左右双魔尊同时降临！这是登顶前的最终试炼！',
    victoryLine: '绝巅双魔尽数伏诛，终极一战——第二十关近在眼前！',
    waves: [
      {
        label: '绝巅双魔尊',
        enemies: [
          {
            kind: 'boss',
            x: -4.6,
            z: -5.6,
            name: '九幽左尊 · 噬星',
            bossArchetype: 'phantom',
            hpMult: 1.44,
            poiseMult: 1.42,
            dmgMult: 1.56,
            affix: 'swift',
            scaleMult: 0.92,
          },
          {
            kind: 'elite',
            x: 4.8,
            z: -4.8,
            name: '九幽右尊 · 陨月',
            hpMult: 2.26,
            poiseMult: 1.66,
            dmgMult: 1.58,
            affix: 'vampiric',
            scaleMult: 1.12,
          },
        ],
      },
    ],
  },
  {
    id: 20,
    chapter: 4,
    episodeNum: 20,
    biome: 'celestial_sanctum',
    name: '锁妖终劫',
    subtitle: '终极决战 · 镇狱天尊',
    badge: '终极 Boss',
    isBossStage: true,
    bossCutscene: true,
    parTimeSec: 175,
    recommendedRealm: '蜀山剑圣',
    hazard: 'abyss',
    hazardLabel: '灭世天劫',
    hazardIntervalSec: 3.1,
    hazardDamage: 38,
    introLine: '能连闯十九重剑劫至此，你配见本尊真容！',
    victoryLine: '二十重剑劫全破！九幽天尊伏诛，李逍遥威名震彻蜀山三界！',
    waves: [
      {
        label: '护台双剑卫',
        enemies: [
          { kind: 'elite', x: -4.6, z: -4.6, name: '天尊左卫 · 劫火', hpMult: 1.73, poiseMult: 1.2, dmgMult: 1.53, affix: 'storm' },
          { kind: 'elite', x: 4.6, z: -4.6, name: '天尊右卫 · 冥冰', hpMult: 1.73, poiseMult: 1.2, dmgMult: 1.53, affix: 'swift' },
        ],
      },
      {
        label: '终极决战 · 镇狱天尊',
        subtitle: '锁妖剑台终极魔神「九幽剑煞 · 镇狱天尊」苏醒！',
        enemies: [
          {
            kind: 'boss',
            x: 0.0,
            z: -5.2,
            name: '九幽剑煞 · 镇狱天尊',
            bossArchetype: 'celestial',
            hpMult: 2.26,
            poiseMult: 1.74,
            dmgMult: 1.68,
            affix: 'storm',
            scaleMult: 1.08,
          },
        ],
      },
    ],
  },

  // ===================== CHAPTER 5: 太虚仙域 (21–25) =====================
  {
    id: 21,
    chapter: 5,
    episodeNum: 21,
    biome: 'astral_void',
    stageLayout: 'corridor',
    stageMode: 'exterminate',
    leylineAffix: 'flying_surge',
    name: '云海仙阶',
    subtitle: '星海裂隙 · 太虚巡使',
    badge: '星海前哨',
    isBossStage: false,
    parTimeSec: 155,
    recommendedRealm: '蜀山剑圣',
    hazard: 'lightning',
    hazardLabel: '星穹落雷',
    hazardIntervalSec: 4.5,
    hazardDamage: 32,
    introLine: '凡尘剑圣也敢踏足太虚星海？先过我星门巡使三关！',
    victoryLine: '太虚星门已开，云裳剑灵的星光指引就在前方！',
    waves: [
      {
        label: '星门游骑',
        enemies: [
          { kind: 'bladesman', x: -4.2, z: -2.8, name: '太虚星卒', hpMult: 2.2, dmgMult: 1.56, affix: 'swift' },
          { kind: 'bladesman', x: 4.2, z: -2.8, name: '太虚星卒', hpMult: 2.2, dmgMult: 1.56 },
          { kind: 'caster', x: 0.0, z: -6.2, name: '司星符官', hpMult: 2.05, dmgMult: 1.54, affix: 'storm' },
        ],
      },
      {
        label: '太虚符阵',
        enemies: [
          { kind: 'elite', x: -3.6, z: -3.6, name: '星甲破阵卫', hpMult: 1.85, poiseMult: 1.28, dmgMult: 1.58, affix: 'ironclad' },
          { kind: 'caster', x: 4.4, z: -5.4, name: '星穹幻法师', hpMult: 2.1, dmgMult: 1.58, affix: 'swift' },
        ],
      },
      {
        label: '苍冥巡使 · 星痕',
        subtitle: '太虚星阶守将「苍冥巡使 · 星痕」踏星而来！',
        enemies: [
          { kind: 'elite', x: 0.0, z: -4.8, name: '苍冥巡使 · 星痕', hpMult: 2.05, poiseMult: 1.38, dmgMult: 1.65, affix: 'storm', scaleMult: 1.06 },
          { kind: 'caster', x: -4.6, z: -6.2, name: '星轨秘巫', hpMult: 1.95, dmgMult: 1.55 },
        ],
      },
    ],
  },
  {
    id: 22,
    chapter: 5,
    episodeNum: 22,
    biome: 'astral_void',
    stageLayout: 'pillars',
    stageMode: 'defend',
    monolithHp: 760,
    leylineAffix: 'parry_nova',
    name: '玉衡灵枢',
    subtitle: '守护星枢 · 惊雷破招',
    badge: '守护灵枢',
    isBossStage: false,
    parTimeSec: 150,
    recommendedRealm: '蜀山剑圣',
    hazard: 'lightning',
    hazardLabel: '灵枢震雷',
    hazardIntervalSec: 4.6,
    hazardDamage: 30,
    introLine: '绝不能让虚空魔兵毁掉玉衡星枢，守住太虚地脉最后一线生机！',
    victoryLine: '玉衡星枢重新亮起！太虚诸星的剑道记忆正在回响。',
    waves: [
      {
        label: '星海猎刃',
        enemies: [
          { kind: 'bladesman', x: -5.6, z: -4.2, name: '蚀星刺客', hpMult: 2.25, dmgMult: 1.58, affix: 'swift' },
          { kind: 'bladesman', x: 5.6, z: -4.2, name: '蚀星刺客', hpMult: 2.25, dmgMult: 1.58, affix: 'swift' },
          { kind: 'caster', x: 0.0, z: -6.6, name: '虚空咒印师', hpMult: 2.1, dmgMult: 1.56 },
        ],
      },
      {
        label: '破枢重卫',
        enemies: [
          { kind: 'elite', x: -4.2, z: -5.0, name: '玄星重锤使', hpMult: 1.92, poiseMult: 1.34, dmgMult: 1.62, affix: 'ironclad' },
          { kind: 'bladesman', x: 4.4, z: -3.2, name: '嗜血星刃', hpMult: 2.28, dmgMult: 1.6, affix: 'vampiric' },
        ],
      },
      {
        label: '玉衡镇使 · 璇玑',
        subtitle: '镇守玉衡灵枢的堕落星将「璇玑」拔剑现身！',
        enemies: [
          { kind: 'elite', x: 0.0, z: -5.2, name: '玉衡镇使 · 璇玑', hpMult: 2.14, poiseMult: 1.42, dmgMult: 1.68, affix: 'storm', scaleMult: 1.08 },
          { kind: 'caster', x: 4.6, z: -6.4, name: '星陨祭司', hpMult: 2.05, dmgMult: 1.6, affix: 'swift' },
        ],
      },
    ],
  },
  {
    id: 23,
    chapter: 5,
    episodeNum: 23,
    biome: 'astral_void',
    stageLayout: 'islands',
    stageMode: 'survive',
    surviveSec: 55,
    leylineAffix: 'rapid_cooldown',
    name: '镜花幻劫',
    subtitle: '心魔试炼 · 五十五秒死守',
    badge: '心魔血战',
    isBossStage: false,
    parTimeSec: 120,
    recommendedRealm: '太虚剑祖',
    hazard: 'abyss',
    hazardLabel: '心魔蚀渊',
    hazardIntervalSec: 4.0,
    hazardDamage: 34,
    introLine: '太虚幻境映照你内心的执念与剑影——撑过五十五秒幻潮，方能破镜见本心！',
    victoryLine: '心魔尽碎，你的剑影与太虚星海合而为一！',
    waves: [
      {
        label: '心魔初现',
        enemies: [
          { kind: 'bladesman', x: -4.6, z: -3.4, name: '妄念剑影', hpMult: 2.32, dmgMult: 1.62, affix: 'swift' },
          { kind: 'bladesman', x: 4.6, z: -3.4, name: '妄念剑影', hpMult: 2.32, dmgMult: 1.62, affix: 'vampiric' },
          { kind: 'caster', x: 0.0, z: -6.0, name: '镜花幻师', hpMult: 2.18, dmgMult: 1.62 },
        ],
      },
      {
        label: '玄影幻身',
        enemies: [
          { kind: 'elite', x: -3.8, z: -4.6, name: '李逍遥·心魔幻身', hpMult: 2.08, poiseMult: 1.38, dmgMult: 1.68, affix: 'storm' },
          { kind: 'caster', x: 4.2, z: -5.8, name: '幻劫咒尊', hpMult: 2.2, dmgMult: 1.64, affix: 'swift' },
        ],
      },
    ],
  },
  {
    id: 24,
    chapter: 5,
    episodeNum: 24,
    biome: 'astral_void',
    stageLayout: 'pillars',
    stageMode: 'bossRush',
    leylineAffix: 'titan_armor',
    name: '四象剑尊',
    subtitle: '星宫双尊 · 破军与焚星',
    badge: '双尊连战',
    isBossStage: true,
    bossCutscene: true,
    parTimeSec: 175,
    recommendedRealm: '太虚剑祖',
    hazard: 'ember',
    hazardLabel: '星炎焚阵',
    hazardIntervalSec: 3.6,
    hazardDamage: 35,
    introLine: '欲见太虚剑祖，先问过我星宫苍龙、朱雀二位护法剑尊！',
    victoryLine: '连斩星宫双尊！前方只剩太虚剑海深处的终极问心台。',
    waves: [
      {
        label: '第一尊 · 苍龙破军',
        enemies: [
          {
            kind: 'boss',
            x: 0.0,
            z: -4.8,
            name: '苍龙星君 · 破军',
            bossArchetype: 'titan',
            hpMult: 1.72,
            poiseMult: 1.48,
            dmgMult: 1.6,
            affix: 'ironclad',
            scaleMult: 1.04,
          },
        ],
      },
      {
        label: '第二尊 · 朱雀焚星',
        subtitle: '火德星宫之主「朱雀炎尊 · 焚星」踏焰降临！',
        enemies: [
          {
            kind: 'boss',
            x: 0.0,
            z: -5.2,
            name: '朱雀炎尊 · 焚星',
            bossArchetype: 'inferno',
            hpMult: 1.98,
            poiseMult: 1.58,
            dmgMult: 1.68,
            affix: 'storm',
            scaleMult: 1.06,
          },
        ],
      },
    ],
  },
  {
    id: 25,
    chapter: 5,
    episodeNum: 25,
    biome: 'astral_void',
    stageLayout: 'arena',
    stageMode: 'bossRush',
    leylineAffix: 'glass_cannon',
    name: '太虚问心',
    subtitle: '终章大捷 · 太虚剑祖',
    badge: '太虚剑祖',
    isBossStage: true,
    bossCutscene: true,
    parTimeSec: 195,
    recommendedRealm: '太虚剑祖',
    hazard: 'abyss',
    hazardLabel: '太虚天劫',
    hazardIntervalSec: 3.0,
    hazardDamage: 40,
    introLine: '蜀山小辈，你一路所择之剑道与仁心，今日便由本祖一剑称量！',
    victoryLine: '一剑开太虚！李逍遥超越先贤剑祖，成为三界共仰的无双剑仙！',
    waves: [
      {
        label: '问道试心 · 护法剑影',
        enemies: [
          { kind: 'elite', x: -4.8, z: -4.6, name: '太虚左使 · 星渊', hpMult: 1.96, poiseMult: 1.32, dmgMult: 1.66, affix: 'swift' },
          { kind: 'elite', x: 4.8, z: -4.6, name: '太虚右使 · 瑶光', hpMult: 1.96, poiseMult: 1.32, dmgMult: 1.66, affix: 'vampiric' },
        ],
      },
      {
        label: '绝巅问心 · 太虚剑祖',
        subtitle: '太虚星海之主「太虚剑祖 · 苍穹剑尊」显化真身！',
        enemies: [
          {
            kind: 'boss',
            x: 0.0,
            z: -5.4,
            name: '太虚剑祖 · 苍穹剑尊',
            bossArchetype: 'astral',
            hpMult: 2.55,
            poiseMult: 1.88,
            dmgMult: 1.78,
            affix: 'storm',
            scaleMult: 1.12,
          },
        ],
      },
    ],
  },
];

export function getStageDef(stageId: number): StageDef {
  const idx = Math.max(1, Math.min(CAMPAIGN_STAGES.length, Math.floor(stageId))) - 1;
  return CAMPAIGN_STAGES[idx];
}

export const DUNGEON_LIST: DungeonDef[] = [
  {
    id: 'dg_guling',
    name: '锁妖古陵',
    subtitle: '初阶秘境 · 灵品保底',
    tier: 1,
    recommendedPower: 520,
    dropRateText: '灵品48% · 玄品17% · 仙品3%',
    guaranteedMinRarity: 'rare',
    bossTitle: '古陵镇墓兽',
    jadeReward: 140,
    stageDef: {
      id: 101,
      chapter: 2,
      episodeNum: 101,
      biome: 'bamboo_canyon',
      name: '锁妖古陵',
      subtitle: '初阶秘境 · 灵品保底',
      badge: '秘境打宝',
      isBossStage: true,
      bossCutscene: true,
      parTimeSec: 100,
      recommendedRealm: '筑基剑修',
      hazard: 'none',
      introLine: '擅入蜀山古陵者，留下神兵作祭！',
      victoryLine: '古陵妖煞尽伏，满地灵宝光柱冲天！',
      waves: [
        {
          label: '古陵守卫',
          enemies: [
            { kind: 'bladesman', x: -4.8, z: -3.8, name: '陵墓守卫', hpMult: 1.55, dmgMult: 1.32, affix: 'swift' },
            { kind: 'bladesman', x: 4.8, z: -3.8, name: '陵墓守卫', hpMult: 1.55, dmgMult: 1.32, affix: 'storm' },
            { kind: 'caster', x: 0.0, z: -7.5, name: '古陵咒灵', hpMult: 1.51, dmgMult: 1.29 },
          ],
        },
        {
          label: '镇墓兽降临',
          enemies: [
            { kind: 'elite', x: -4.2, z: -4.2, name: '墓室铁卫', hpMult: 1.51, poiseMult: 1.2, dmgMult: 1.29 },
            { kind: 'boss', x: 0.5, z: -5.4, name: '古陵镇墓兽', bossArchetype: 'titan', hpMult: 1.69, poiseMult: 1.32, dmgMult: 1.37 },
          ],
        },
      ],
    },
  },
  {
    id: 'dg_jianzhong',
    name: '剑冢宝窟',
    subtitle: '中阶秘境 · 玄品保底',
    tier: 2,
    recommendedPower: 860,
    dropRateText: '灵品48% · 玄品40% · 仙品12%',
    guaranteedMinRarity: 'epic',
    bossTitle: '剑冢残魂',
    jadeReward: 240,
    stageDef: {
      id: 102,
      chapter: 2,
      episodeNum: 102,
      biome: 'sword_graveyard',
      name: '剑冢宝窟',
      subtitle: '中阶秘境 · 玄品保底',
      badge: '玄品必掉',
      isBossStage: true,
      bossCutscene: true,
      parTimeSec: 122,
      recommendedRealm: '金丹剑宗',
      hazard: 'lightning',
      hazardLabel: '天雷剑阵',
      hazardIntervalSec: 4.0,
      hazardDamage: 28,
      introLine: '百代剑魄聚此一窟，敢来夺宝者先接我魔剑！',
      victoryLine: '剑冢残魂散尽，玄光紫柱照耀剑台！',
      waves: [
        {
          label: '嗜血剑奴',
          enemies: [
            { kind: 'elite', x: -4.2, z: -4.0, name: '血煞剑侍', hpMult: 1.76, poiseMult: 1.2, dmgMult: 1.48, affix: 'vampiric' },
            { kind: 'elite', x: 4.2, z: -4.0, name: '玄铁剑卫', hpMult: 1.79, poiseMult: 1.2, dmgMult: 1.48, affix: 'ironclad' },
            { kind: 'caster', x: 0.0, z: -8.0, name: '雷法冥师', hpMult: 1.71, dmgMult: 1.44, affix: 'storm' },
          ],
        },
        {
          label: '剑冢主宰',
          enemies: [
            { kind: 'bladesman', x: -4.6, z: -3.5, name: '疾风剑傀', hpMult: 1.74, dmgMult: 1.45, affix: 'swift' },
            { kind: 'boss', x: 0.0, z: -5.4, name: '剑冢残魂', bossArchetype: 'phantom', hpMult: 2.13, poiseMult: 1.54, dmgMult: 1.56, affix: 'storm' },
          ],
        },
      ],
    },
  },
  {
    id: 'dg_jiuyou',
    name: '九幽魔殿',
    subtitle: '绝巅秘境 · 高阶仙品',
    tier: 3,
    recommendedPower: 1280,
    dropRateText: '灵品22% · 玄品54% · 仙品24%',
    guaranteedMinRarity: 'epic',
    bossTitle: '九幽魔尊',
    jadeReward: 380,
    stageDef: {
      id: 103,
      chapter: 4,
      episodeNum: 103,
      biome: 'lava_abyss',
      name: '九幽魔殿',
      subtitle: '绝巅秘境 · 高阶仙品',
      badge: '仙品爆装',
      isBossStage: true,
      bossCutscene: true,
      parTimeSec: 140,
      recommendedRealm: '蜀山剑圣',
      hazard: 'abyss',
      hazardLabel: '灭世天劫',
      hazardIntervalSec: 3.3,
      hazardDamage: 35,
      introLine: '区区凡胎也敢窥伺太初仙兵？入本尊魔殿者有去无回！',
      victoryLine: '九幽魔尊伏诛！金色传奇光柱直贯九霄！',
      waves: [
        {
          label: '魔殿铁卫',
          enemies: [
            { kind: 'elite', x: -4.8, z: -4.2, name: '魔殿左将', hpMult: 2.1, poiseMult: 1.2, dmgMult: 1.64, affix: 'ironclad' },
            { kind: 'elite', x: 4.8, z: -4.2, name: '魔殿右将', hpMult: 2.1, poiseMult: 1.2, dmgMult: 1.64, affix: 'vampiric' },
            { kind: 'caster', x: -3.5, z: -7.8, name: '九幽妖师', hpMult: 1.96, dmgMult: 1.59, affix: 'storm' },
            { kind: 'caster', x: 3.5, z: -7.8, name: '九幽妖师', hpMult: 1.96, dmgMult: 1.59, affix: 'swift' },
          ],
        },
        {
          label: '九幽魔尊亲临',
          enemies: [
            { kind: 'elite', x: -4.8, z: -4.8, name: '魔尊护法', hpMult: 2.03, poiseMult: 1.2, dmgMult: 1.61, affix: 'swift' },
          {
            kind: 'boss',
            x: 0.0,
            z: -5.4,
            name: '九幽魔尊',
            bossArchetype: 'inferno',
            hpMult: 2.64,
            poiseMult: 1.7,
            dmgMult: 1.77,
            affix: 'storm',
            scaleMult: 1.06,
          },
        ],
      },
      ],
    },
  },
  {
    id: 'dg_taixu',
    name: '太虚剑墟',
    subtitle: '终极车轮 · 仙品高爆',
    tier: 3,
    recommendedPower: 1650,
    dropRateText: '玄品55% · 仙品45%（双首领双爆）',
    guaranteedMinRarity: 'epic',
    bossTitle: '太虚双魔尊',
    jadeReward: 520,
    stageDef: {
      id: 104,
      chapter: 4,
      episodeNum: 104,
      biome: 'celestial_sanctum',
      stageLayout: 'islands',
      stageMode: 'bossRush',
      leylineAffix: 'flying_surge',
      name: '太虚剑墟',
      subtitle: '终极车轮 · 仙品高爆',
      badge: '双尊高爆',
      isBossStage: true,
      bossCutscene: true,
      parTimeSec: 155,
      recommendedRealm: '蜀山剑圣',
      hazard: 'abyss',
      hazardLabel: '灭世天劫',
      hazardIntervalSec: 3.5,
      hazardDamage: 35,
      introLine: '凡人也敢来太虚剑墟争夺仙品？连本尊与星穹雷帝两关都过不去！',
      victoryLine: '太虚双魔尊伏诛！金色太初仙品冲天而起！',
      waves: [
        {
          label: '第一尊 · 太虚劫影',
          enemies: [
            { kind: 'elite', x: -4.6, z: -4.6, name: '星墟护卫', hpMult: 2.1, poiseMult: 1.25, dmgMult: 1.62, affix: 'swift' },
            { kind: 'boss', x: 0, z: -5.4, name: '太虚魔尊 · 劫影', bossArchetype: 'phantom', hpMult: 2.45, poiseMult: 1.65, dmgMult: 1.72, affix: 'swift' },
          ],
        },
        {
          label: '终尊 · 星穹雷帝',
          subtitle: '太虚星环震裂，第二尊星穹雷帝踏雷降临！',
          enemies: [
            { kind: 'boss', x: 0, z: -5.2, name: '星穹雷帝 · 太虚', bossArchetype: 'celestial', hpMult: 2.8, poiseMult: 1.82, dmgMult: 1.82, affix: 'storm', scaleMult: 1.08 },
          ],
        },
      ],
    },
  },
];

export function getDungeonDef(id: string): DungeonDef {
  return DUNGEON_LIST.find((d) => d.id === id) ?? DUNGEON_LIST[0];
}

export const BOUNTY_LIST: BountyDef[] = [
  {
    id: 'b_slay',
    title: '除魔卫道',
    desc: '累计斩杀 12 名妖邪',
    statKey: 'totalKills',
    target: 12,
    rewardJade: 160,
    rewardRarity: 'rare',
  },
  {
    id: 'b_parry',
    title: '以剑破招',
    desc: '累计完成 3 次完美弹反',
    statKey: 'totalParries',
    target: 3,
    rewardJade: 180,
  },
  {
    id: 'b_dungeon',
    title: '秘境寻宝',
    desc: '通关 1 次秘境打宝',
    statKey: 'totalDungeons',
    target: 1,
    rewardJade: 220,
    rewardRarity: 'epic',
  },
  {
    id: 'b_forge',
    title: '神兵淬炼',
    desc: '淬炼强化任意装备 1 次',
    statKey: 'totalForges',
    target: 1,
    rewardJade: 150,
  },
  {
    id: 'b_tower',
    title: '锁妖登塔',
    desc: '通关 1 层锁妖九重塔',
    statKey: 'totalTowerClears',
    target: 1,
    rewardJade: 260,
    rewardRarity: 'epic',
  },
  {
    id: 'b_roguelike',
    title: '幻境探幽',
    desc: '打通 1 次幻境六境肉鸽',
    statKey: 'totalRoguelikeClears',
    target: 1,
    rewardJade: 300,
    rewardRarity: 'epic',
  },
  {
    id: 'b_worldboss',
    title: '九州荡魔',
    desc: '在大世界斩杀 1 尊野外首领',
    statKey: 'totalWorldBosses',
    target: 1,
    rewardJade: 240,
    rewardRarity: 'rare',
  },
  {
    id: 'b_defend',
    title: '守护灵脉',
    desc: '完成 1 次灵脉守护关卡',
    statKey: 'totalDefendWins',
    target: 1,
    rewardJade: 220,
    rewardRarity: 'rare',
  },
  {
    id: 'b_story_heart',
    title: '剑心抉择',
    desc: '在剧情对话中完成 5 次道心抉择',
    statKey: 'totalStoryChoices',
    target: 5,
    rewardJade: 240,
    rewardRarity: 'epic',
  },
];

export function getChapterDef(chapterId: number): ChapterDef {
  return CHAPTERS.find((c) => c.id === chapterId) ?? CHAPTERS[0];
}

export function createEmptyBlessings(): RunBlessingState {
  return {
    ids: [],
    dmgMult: 1.0,
    maxHpBonus: 0,
    speedMult: 1.0,
    cdMult: 1.0,
    ultGainMult: 1.0,
    extraGourds: 0,
    critRateBonus: 0,
    critDmgBonus: 0,
    lifestealBonus: 0,
    pathCounts: { lotus: 0, thunder: 0, blood: 0 },
  };
}

export function applyBlessingToRun(
  state: RunBlessingState,
  blessing: BlessingDef | RoguelikeBlessingDef,
): RunBlessingState {
  const rl = blessing as Partial<RoguelikeBlessingDef>;
  const pathCounts = { ...state.pathCounts };
  if (rl.path && pathCounts[rl.path] !== undefined) {
    pathCounts[rl.path] += 1;
  }
  const next: RunBlessingState = {
    ids: [...state.ids, blessing.id],
    dmgMult: Number((state.dmgMult + (blessing.dmgBonus ?? 0)).toFixed(3)),
    maxHpBonus: state.maxHpBonus + (blessing.hpBonus ?? 0),
    speedMult: Number(Math.min(1.48, state.speedMult + (blessing.speedBonus ?? 0)).toFixed(3)),
    cdMult: Number(Math.max(0.42, state.cdMult * (1 - (blessing.cdReduce ?? 0))).toFixed(3)),
    ultGainMult: Number((state.ultGainMult + (blessing.ultBonus ?? 0)).toFixed(3)),
    extraGourds: state.extraGourds + (blessing.gourdBonus ?? 0),
    critRateBonus: Number((state.critRateBonus + (rl.critRateBonus ?? 0)).toFixed(3)),
    critDmgBonus: Number((state.critDmgBonus + (rl.critDmgBonus ?? 0)).toFixed(3)),
    lifestealBonus: Number((state.lifestealBonus + (rl.lifestealBonus ?? 0)).toFixed(3)),
    pathCounts,
  };
  return next;
}

export function pickBlessingChoices(rng: () => number, count = 3): BlessingDef[] {
  const pool = [...BLESSINGS];
  const out: BlessingDef[] = [];
  while (out.length < count && pool.length > 0) {
    const idx = Math.floor(rng() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

export const SWORD_REALMS: SwordRealmInfo[] = [
  { title: '炼气初境', minStars: 0, nextStars: 6, hpBonus: 0, dmgMult: 1.0, spiritRegenMult: 1.0 },
  { title: '筑基剑修', minStars: 6, nextStars: 15, hpBonus: 28, dmgMult: 1.14, spiritRegenMult: 1.12 },
  { title: '金丹剑客', minStars: 15, nextStars: 27, hpBonus: 62, dmgMult: 1.30, spiritRegenMult: 1.24 },
  { title: '元婴剑尊', minStars: 27, nextStars: 39, hpBonus: 102, dmgMult: 1.48, spiritRegenMult: 1.38 },
  { title: '化神剑仙', minStars: 39, nextStars: 51, hpBonus: 145, dmgMult: 1.68, spiritRegenMult: 1.54 },
  { title: '蜀山剑圣', minStars: 51, nextStars: 66, hpBonus: 195, dmgMult: 1.90, spiritRegenMult: 1.72 },
  { title: '太虚剑祖', minStars: 66, nextStars: null, hpBonus: 250, dmgMult: 2.15, spiritRegenMult: 1.90 },
];

export interface SwordHeartSummary {
  title: string;
  desc: string;
  sword: number;
  heart: number;
  dmgBonus: number;
  hpBonus: number;
  ultGainBonus: number;
}

export function getSwordHeartSummary(sh: { sword: number; heart: number }): SwordHeartSummary {
  const sword = Math.max(0, Math.floor(sh.sword || 0));
  const heart = Math.max(0, Math.floor(sh.heart || 0));
  if (sword >= 3 && sword > heart + 1) {
    return {
      title: '凌霄剑道',
      desc: '锋芒毕露 · 全剑伤 +5% · 开局剑意充盈',
      sword,
      heart,
      dmgBonus: 0.05,
      hpBonus: 0,
      ultGainBonus: 0.06,
    };
  }
  if (heart >= 3 && heart > sword + 1) {
    return {
      title: '侠骨仁心',
      desc: '护佑苍生 · 气血上限 +32 · 稳守破招',
      sword,
      heart,
      dmgBonus: 0.02,
      hpBonus: 32,
      ultGainBonus: 0,
    };
  }
  if (sword >= 2 && heart >= 2) {
    return {
      title: '剑心通明',
      desc: '刚柔并济 · 全剑伤 +4% · 气血 +20 · 剑意获取 +10%',
      sword,
      heart,
      dmgBonus: 0.04,
      hpBonus: 20,
      ultGainBonus: 0.1,
    };
  }
  return {
    title: '初入剑途',
    desc: '剑道仁心未分高下，于剧情中抉择可凝聚道心加护',
    sword,
    heart,
    dmgBonus: 0,
    hpBonus: 0,
    ultGainBonus: 0,
  };
}

export function getSwordRealm(totalStars: number): SwordRealmInfo {
  let cur = SWORD_REALMS[0];
  for (const r of SWORD_REALMS) {
    if (totalStars >= r.minStars) cur = r;
  }
  return cur;
}

export const CULTIVATION_STEPS: CultivationRealmStep[] = [
  {
    level: 0,
    name: '引气入体 · 凡心',
    costJade: 0,
    hpBonus: 0,
    atkPct: 0,
    spiritRegenPct: 0,
    startUltBonus: 0,
    desc: '初入云来剑庐，吐纳天地灵气稳固丹田',
  },
  {
    level: 1,
    name: '凝气一重',
    costJade: 60,
    hpBonus: 20,
    atkPct: 0.05,
    spiritRegenPct: 0.06,
    startUltBonus: 6,
    desc: '气血 +20 · 剑伤 +5% · 回气 +6% · 开局剑意 +6',
  },
  {
    level: 2,
    name: '筑基二重',
    costJade: 110,
    hpBonus: 45,
    atkPct: 0.1,
    spiritRegenPct: 0.12,
    startUltBonus: 12,
    desc: '气血 +45 · 剑伤 +10% · 回气 +12% · 开局剑意 +12',
  },
  {
    level: 3,
    name: '金丹三重',
    costJade: 170,
    hpBonus: 75,
    atkPct: 0.16,
    spiritRegenPct: 0.18,
    startUltBonus: 18,
    desc: '气血 +75 · 剑伤 +16% · 回气 +18% · 开局剑意 +18',
  },
  {
    level: 4,
    name: '元婴四重',
    costJade: 240,
    hpBonus: 110,
    atkPct: 0.23,
    spiritRegenPct: 0.24,
    startUltBonus: 24,
    desc: '气血 +110 · 剑伤 +23% · 回气 +24% · 开局剑意 +24',
  },
  {
    level: 5,
    name: '化神五重',
    costJade: 320,
    hpBonus: 150,
    atkPct: 0.3,
    spiritRegenPct: 0.3,
    startUltBonus: 30,
    desc: '气血 +150 · 剑伤 +30% · 回气 +30% · 开局剑意 +30',
  },
  {
    level: 6,
    name: '合体六重',
    costJade: 420,
    hpBonus: 195,
    atkPct: 0.38,
    spiritRegenPct: 0.38,
    startUltBonus: 36,
    desc: '气血 +195 · 剑伤 +38% · 回气 +38% · 开局剑意 +36',
  },
  {
    level: 7,
    name: '大乘七重',
    costJade: 540,
    hpBonus: 245,
    atkPct: 0.46,
    spiritRegenPct: 0.46,
    startUltBonus: 44,
    desc: '气血 +245 · 剑伤 +46% · 回气 +46% · 开局剑意 +44',
  },
  {
    level: 8,
    name: '蜀山剑神',
    costJade: 700,
    hpBonus: 300,
    atkPct: 0.55,
    spiritRegenPct: 0.55,
    startUltBonus: 55,
    desc: '气血 +300 · 剑伤 +55% · 回气 +55% · 开局剑意 +55',
  },
  {
    level: 9,
    name: '太虚剑祖 · 破界',
    costJade: 920,
    hpBonus: 365,
    atkPct: 0.66,
    spiritRegenPct: 0.66,
    startUltBonus: 68,
    desc: '气血 +365 · 剑伤 +66% · 回气 +66% · 开局剑意 +68',
  },
];

export const CAMP_MEALS: CampMealDef[] = [
  {
    id: 'meal_tea',
    name: '云雾灵泉茗',
    costJade: 0,
    badge: '免费清茶',
    desc: '+25 气血 · +6% 剑伤',
    hpBonus: 25,
    dmgBonus: 0.06,
    speedBonus: 0,
    ultBonus: 0,
  },
  {
    id: 'meal_peach',
    name: '十里桃花酿',
    costJade: 35,
    badge: '剑意沸腾',
    desc: '+14% 剑伤 · 开局+25 剑意',
    hpBonus: 0,
    dmgBonus: 0.14,
    speedBonus: 0,
    ultBonus: 25,
  },
  {
    id: 'meal_herbal',
    name: '蜀山百草羹',
    costJade: 35,
    badge: '强体御风',
    desc: '+60 气血 · +10% 移速',
    hpBonus: 60,
    dmgBonus: 0,
    speedBonus: 0.1,
    ultBonus: 0,
  },
];

export function evaluateStageStars(
  stage: StageDef,
  elapsedSec: number,
  hpRatio: number,
  parryCount: number,
  monolithRatio = 1,
): { stars: 1 | 2 | 3; checks: [boolean, boolean, boolean]; labels: [string, string, string] } {
  const c1 = true;
  const c2 = elapsedSec <= stage.parTimeSec;
  const c3 =
    stage.stageMode === 'defend'
      ? monolithRatio >= 0.65 || parryCount >= 2
      : stage.stageMode === 'survive'
        ? hpRatio >= 0.45 || parryCount >= 2
        : hpRatio >= 0.5 || parryCount >= 2;
  const stars = (1 + (c2 ? 1 : 0) + (c3 ? 1 : 0)) as 1 | 2 | 3;
  const c3Label =
    stage.stageMode === 'defend'
      ? `灵脉余血 ≥ 65%（${Math.round(monolithRatio * 100)}%）或 弹反 ≥ 2 次`
      : stage.stageMode === 'survive'
        ? '生还余血 ≥ 45% 或 弹反 ≥ 2 次'
        : '剩余气血 ≥ 50% 或 弹反 ≥ 2 次';
  return {
    stars,
    checks: [c1, c2, c3],
    labels: [
      `通关「${stage.name}」`,
      `用时 ≤ ${stage.parTimeSec} 秒（实测 ${Math.round(elapsedSec)} 秒）`,
      c3Label,
    ],
  };
}

const CHAPTER_ELDER_BRIEF: Record<ChapterId, { elder: string; seal: string; advice: string }> = {
  1: {
    elder: '蜀山接引长老',
    seal: '剑',
    advice: '妖众攻山势急，切记：见敌蓄力红圈起手可按「弹反」破势，遇「危」字红震必以「闪避」避其锋芒！',
  },
  2: {
    elder: '剑冢守碑灵',
    seal: '碑',
    advice: '剑冢残魂善使诡术与嗜血之法，闪避极限触发「瞬影斩」可一瞬破招，斩杀妖邪可得灵石强化神兵！',
  },
  3: {
    elder: '锁妖塔镇守灵官',
    seal: '镇',
    advice: '妖狱地火翻涌，重甲魔将多带「霸体」或「狂雷」，善用四段连招剑气与万剑诀远程牵制！',
  },
  4: {
    elder: '酒剑仙残念',
    seal: '酒',
    advice: '徒儿，锁妖绝巅已无退路！弹反攒满剑意降「天剑」破其金身，此战之后三界皆传你李逍遥之名！',
  },
  5: {
    elder: '云裳 · 太虚剑灵',
    seal: '裳',
    advice: '欢迎踏入太虚星海。此处汇集上古剑道星宫试炼，守好玉衡灵枢与本心，唯有历劫问心者方能直面太虚剑祖！',
  },
};

const VOLUME_LABELS: Record<ChapterId, string> = {
  1: '第一卷',
  2: '第二卷',
  3: '第三卷',
  4: '第四卷',
  5: '第五卷',
};

const EPISODE_DRAMA_TITLES: Record<number, string> = {
  1: '第一集 · 山门异变',
  2: '第二集 · 溪涧伏兵',
  3: '第三集 · 桃林诡阵',
  4: '第四集 · 残碑铁骑',
  5: '第五集 · 桃源破岳',
  6: '第六集 · 断剑荒原',
  7: '第七集 · 鬼火惊雷',
  8: '第八集 · 双煞拦道',
  9: '第九集 · 剑冢围城',
  10: '第十集 · 血狱魔君',
  11: '第十一集 · 赤焰初燃',
  12: '第十二集 · 嗜血狂潮',
  13: '第十三集 · 四象合围',
  14: '第十四集 · 双王压境',
  15: '第十五集 · 焚天剑煞',
  16: '第十六集 · 星穹玄阶',
  17: '第十七集 · 瞬影试炼',
  18: '第十八集 · 魔将车轮',
  19: '第十九集 · 绝巅双魔',
  20: '第二十集 · 镇狱终劫',
  21: '第二十一集 · 星海仙阶',
  22: '第二十二集 · 玉衡灵枢',
  23: '第二十三集 · 镜花幻劫',
  24: '第二十四集 · 四象剑尊',
  25: '第二十五集 · 太虚问心',
  101: '外传秘境 · 古陵探宝',
  102: '外传秘境 · 剑窟问锋',
  103: '外传秘境 · 魔殿争仙',
  104: '外传秘境 · 太虚剑墟',
};

function buildEpisodeChoices(stage: StageDef): [EpisodeChoiceDef, EpisodeChoiceDef] {
  const ch = stage.chapter;
  const ep = stage.episodeNum;
  if (stage.biome === 'peach_shrine') {
    return [
      {
        id: `ep${ep}_peach_blade`,
        title: '花影递剑 · 破阵争先',
        subtitle: '剑伤 +15% · 开局剑意 +30',
        dmgBonus: 0.15,
        ultBonus: 30,
      },
      {
        id: `ep${ep}_peach_breeze`,
        title: '踏花凌波 · 灵泉护心',
        subtitle: '移速 +13% · 气血 +45 · 灵葫 +1',
        speedBonus: 0.13,
        hpBonus: 45,
        extraGourd: 1,
      },
    ];
  }
  if (stage.biome === 'sword_graveyard') {
    return [
      {
        id: `ep${ep}_grave_resonance`,
        title: '古剑共鸣 · 剑意如虹',
        subtitle: '剑伤 +16% · 开局剑意 +34',
        dmgBonus: 0.16,
        ultBonus: 34,
      },
      {
        id: `ep${ep}_grave_ward`,
        title: '残碑定神 · 守御化煞',
        subtitle: '移速 +12% · 气血 +52 · 灵葫 +1',
        speedBonus: 0.12,
        hpBonus: 52,
        extraGourd: 1,
      },
    ];
  }
  if (stage.biome === 'lava_abyss') {
    return [
      {
        id: `ep${ep}_lava_cleave`,
        title: '焚锋斩狱 · 烈焰增威',
        subtitle: '剑伤 +18% · 开局剑意 +38',
        dmgBonus: 0.18,
        ultBonus: 38,
      },
      {
        id: `ep${ep}_lava_ice`,
        title: '冰心镇火 · 丹元续命',
        subtitle: '移速 +12% · 气血 +62 · 灵葫 +1',
        speedBonus: 0.12,
        hpBonus: 62,
        extraGourd: 1,
      },
    ];
  }
  if (stage.biome === 'celestial_sanctum' || ch === 4) {
    return [
      {
        id: `ep${ep}_star_heaven`,
        title: '引星入剑 · 天剑凌霄',
        subtitle: '剑伤 +20% · 开局剑意 +42',
        dmgBonus: 0.2,
        ultBonus: 42,
      },
      {
        id: `ep${ep}_star_taiji`,
        title: '太极化劫 · 星穹护体',
        subtitle: '移速 +14% · 气血 +72 · 灵葫 +1',
        speedBonus: 0.14,
        hpBonus: 72,
        extraGourd: 1,
      },
    ];
  }
  return [
    {
      id: `ep${ep}_strike`,
      title: '拔剑破阵 · 剑意如虹',
      subtitle: '剑伤 +14% · 开局剑意 +28',
      dmgBonus: 0.14,
      ultBonus: 28,
    },
    {
      id: `ep${ep}_guard`,
      title: '御风稳守 · 灵泉护体',
      subtitle: '移速 +12% · 气血 +42 · 灵葫 +1',
      speedBonus: 0.12,
      hpBonus: 42,
      extraGourd: 1,
    },
  ];
}

export function getStageDialogueForStage(stage: StageDef, includeElder = false): StageDialogueDef {
  const chapter = getChapterDef(stage.chapter);
  const elderBrief = CHAPTER_ELDER_BRIEF[stage.chapter];
  const allEnemies = stage.waves.flatMap((w) => w.enemies);
  const leadSpec =
    [...allEnemies].reverse().find((e) => e.kind === 'boss' && e.name) ??
    [...allEnemies].reverse().find((e) => e.kind === 'elite' && e.name) ??
    [...allEnemies].reverse().find((e) => e.kind === 'caster' && e.name) ??
    [...allEnemies].reverse().find((e) => e.name);
  const bossOrLead = leadSpec?.name ?? (stage.isBossStage ? '镇狱妖王' : '山门妖将');
  const affixes = Array.from(new Set(allEnemies.map((e) => e.affix).filter(Boolean))) as EnemyAffix[];
  const affixLabels = affixes.map((a) => AFFIX_META[a].label);
  const isDungeon = stage.id > 100;
  const biomeLabel = BIOME_LABELS[stage.biome] ?? '翠竹云溪';
  const episodeTag = isDungeon
    ? `秘境外传 · ${stage.badge}`
    : `${VOLUME_LABELS[stage.chapter]}第 ${stage.episodeNum} 集`;
  const tvTitle = EPISODE_DRAMA_TITLES[stage.id] ?? `第 ${stage.episodeNum} 集 · ${stage.name}`;

  const intel: string[] = [
    `地界：${biomeLabel}`,
    `共 ${stage.waves.length} 波 · ${allEnemies.length} 名妖邪`,
    `推荐境界：${stage.recommendedRealm}`,
    stage.hazardLabel ? `场地异变：${stage.hazardLabel}` : '剑阵稳固 · 无场地天劫',
  ];
  if (affixLabels.length > 0) {
    intel.push(`妖邪词缀：${affixLabels.join(' / ')}`);
  }

  const scripted = EPISODE_STORY_SCRIPTS[stage.id];
  if (scripted) {
    return {
      stageId: stage.id,
      mode: 'preStage',
      episodeTag,
      biomeLabel,
      kicker: `${episodeTag} · ${biomeLabel}`,
      title: `${tvTitle} — ${stage.subtitle}`,
      chapterName: isDungeon ? '蜀山秘境' : `${chapter.roman} ${chapter.name}`,
      intel,
      lines: scripted.lines.map((l) => ({ ...l })),
      choices: scripted.choices.map((c) => ({ ...c })),
    };
  }

  const enemyLine = stage.introLine;
  const heroReply = stage.isBossStage
    ? `「${bossOrLead}，少废话！今日我李逍遥便以七星剑魄斩你于${biomeLabel}之上！」`
    : stage.waves.length >= 2
      ? `「妖气虽盛，不过土鸡瓦狗！待我连破这 ${stage.waves.length} 阵妖兵，再取灵石锻剑！」`
      : `「既已至此，便让我试一试蜀山真传剑招！」`;

  const lines: StageDialogueLine[] = [];
  if (includeElder) {
    lines.push({
      speaker: elderBrief.elder,
      role: 'elder',
      seal: elderBrief.seal,
      text: `「${elderBrief.advice}」`,
    });
  }
  lines.push(
    {
      speaker: bossOrLead,
      role: 'enemy',
      seal: '妖',
      text: enemyLine,
    },
    {
      speaker: '李逍遥',
      role: 'hero',
      seal: '李',
      text: heroReply,
    },
  );

  return {
    stageId: stage.id,
    mode: 'preStage',
    episodeTag,
    biomeLabel,
    kicker: `${episodeTag} · ${biomeLabel}`,
    title: `${tvTitle} — ${stage.subtitle}`,
    chapterName: isDungeon ? '蜀山秘境' : `${chapter.roman} ${chapter.name}`,
    intel,
    lines,
    choices: buildEpisodeChoices(stage),
  };
}

export function getStageDialogue(stageId: number): StageDialogueDef {
  const stage = getStageDef(stageId);
  const chapter = getChapterDef(stage.chapter);
  return getStageDialogueForStage(stage, stage.id === chapter.stageRange[0]);
}

const SAVE_KEY = 'shushan_lixiaoyao_campaign_v1';

const GEAR_RARITY_RANK: Record<EquipRarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
};

export class CampaignSaveStore {
  data: CampaignSaveData;

  constructor() {
    this.data = this.load();
  }

  private load(): CampaignSaveData {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CampaignSaveData>;
        if (parsed && typeof parsed === 'object' && parsed.cleared) {
          const ownedSet = new Set<string>([
            ...STARTER_OWNED_ITEMS,
            ...(Array.isArray(parsed.ownedItems) ? parsed.ownedItems : []),
          ]);
          const inventory: RolledGearItem[] = Array.isArray(parsed.inventory)
            ? parsed.inventory
                .filter(
                  (g): g is RolledGearItem =>
                    Boolean(g && typeof g === 'object' && typeof g.uid === 'string' && typeof g.templateId === 'string'),
                )
                .slice(0, MAX_INVENTORY_SIZE)
                .map((g) => ({
                  ...g,
                  forgeLevel: Math.max(0, Math.min(MAX_FORGE_LEVEL, Math.floor(Number(g.forgeLevel) || 0))),
                  powerScore: computeRolledGearScore(g),
                }))
            : [];
          const hasValidSlotItem = (id: string | undefined, cat: EquipCategory): string => {
            if (!id) return DEFAULT_EQUIPPED[cat];
            if (ownedSet.has(id) && SHOP_ITEM_MAP[id]?.category === cat) return id;
            if (cat !== 'skin' && inventory.some((g) => g.uid === id && g.category === cat)) return id;
            return DEFAULT_EQUIPPED[cat];
          };
          const eq = parsed.equipped;
          const equipped: EquippedLoadout = {
            weapon: hasValidSlotItem(eq?.weapon, 'weapon'),
            armor: hasValidSlotItem(eq?.armor, 'armor'),
            relic: hasValidSlotItem(eq?.relic, 'relic'),
            skin: hasValidSlotItem(eq?.skin, 'skin'),
          };
          const jade =
            typeof parsed.jade === 'number' && Number.isFinite(parsed.jade) && parsed.jade >= 0
              ? Math.floor(parsed.jade)
              : DEFAULT_STARTER_JADE;
          const upgrades: Record<string, number> = {};
          if (parsed.upgrades && typeof parsed.upgrades === 'object') {
            for (const [k, v] of Object.entries(parsed.upgrades)) {
              const lv = Math.max(0, Math.min(MAX_FORGE_LEVEL, Math.floor(Number(v) || 0)));
              if (lv > 0) upgrades[k] = lv;
            }
          }
          const rawStats = parsed.stats;
          const stats: CampaignSaveStats = {
            totalKills: Math.max(0, Math.floor(Number(rawStats?.totalKills) || 0)),
            totalParries: Math.max(0, Math.floor(Number(rawStats?.totalParries) || 0)),
            totalDungeons: Math.max(0, Math.floor(Number(rawStats?.totalDungeons) || 0)),
            totalForges: Math.max(0, Math.floor(Number(rawStats?.totalForges) || 0)),
            totalTowerClears: Math.max(0, Math.floor(Number(rawStats?.totalTowerClears) || 0)),
            totalRoguelikeClears: Math.max(0, Math.floor(Number(rawStats?.totalRoguelikeClears) || 0)),
            totalWorldBosses: Math.max(0, Math.floor(Number(rawStats?.totalWorldBosses) || 0)),
            totalDefendWins: Math.max(0, Math.floor(Number(rawStats?.totalDefendWins) || 0)),
            totalStoryChoices: Math.max(0, Math.floor(Number(rawStats?.totalStoryChoices) || 0)),
          };
          const dungeonClears: Record<string, number> = {};
          if (parsed.dungeonClears && typeof parsed.dungeonClears === 'object') {
            for (const [k, v] of Object.entries(parsed.dungeonClears)) {
              const n = Math.max(0, Math.floor(Number(v) || 0));
              if (n > 0) dungeonClears[k] = n;
            }
          }
          const towerStars: Record<number, 1 | 2 | 3> = {};
          if (parsed.towerStars && typeof parsed.towerStars === 'object') {
            for (const [k, v] of Object.entries(parsed.towerStars)) {
              const fl = Math.floor(Number(k));
              const st = Math.max(1, Math.min(3, Math.floor(Number(v) || 0))) as 1 | 2 | 3;
              if (fl >= 1 && fl <= 9 && Number(v) > 0) towerStars[fl] = st;
            }
          }
          const rawDiff = parsed.selectedDifficulty;
          const selectedDifficulty: DifficultyTierId =
            rawDiff === 'hard' || rawDiff === 'nightmare' ? rawDiff : 'normal';
          const maxCultLv = CULTIVATION_STEPS.length - 1;
          const cultivationLevel = Math.max(
            0,
            Math.min(maxCultLv, Math.floor(Number(parsed.cultivationLevel) || 0)),
          );
          const rawMealId = typeof parsed.activeMealId === 'string' ? parsed.activeMealId : null;
          const activeMealId =
            rawMealId && CAMP_MEALS.some((m) => m.id === rawMealId) ? rawMealId : null;
          const rawSwordHeart = parsed.swordHeart as Partial<{ sword: number; heart: number }> | undefined;
          const swordHeart = {
            sword: Math.max(0, Math.floor(Number(rawSwordHeart?.sword) || 0)),
            heart: Math.max(0, Math.floor(Number(rawSwordHeart?.heart) || 0)),
          };
          const storyChoices: Record<number, string> = {};
          if (parsed.storyChoices && typeof parsed.storyChoices === 'object') {
            for (const [k, v] of Object.entries(parsed.storyChoices)) {
              const sid = Math.floor(Number(k));
              if (sid > 0 && typeof v === 'string') storyChoices[sid] = v;
            }
          }
          const seenEpilogues = Array.isArray(parsed.seenEpilogues)
            ? parsed.seenEpilogues.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
            : [];
          return {
            version: 7,
            cleared: parsed.cleared,
            lastPlayedStage: Math.max(1, Math.min(CAMPAIGN_STAGES.length, Number(parsed.lastPlayedStage || 1))),
            jade,
            ownedItems: Array.from(ownedSet),
            equipped,
            upgrades,
            inventory,
            pityCounter: Math.max(0, Math.min(4, Math.floor(Number(parsed.pityCounter) || 0))),
            dungeonClears,
            stats,
            claimedBounties: Array.isArray(parsed.claimedBounties)
              ? parsed.claimedBounties.filter((id): id is string => typeof id === 'string')
              : [],
            cultivationLevel,
            activeMealId,
            worldWaypoints: Array.isArray(parsed.worldWaypoints)
              ? parsed.worldWaypoints.filter((id): id is string => typeof id === 'string')
              : [],
            worldChests: Array.isArray(parsed.worldChests)
              ? parsed.worldChests.filter((id): id is string => typeof id === 'string')
              : [],
            worldOrbs: Array.isArray(parsed.worldOrbs)
              ? parsed.worldOrbs.filter((id): id is string => typeof id === 'string')
              : [],
            worldBossKills:
              parsed.worldBossKills && typeof parsed.worldBossKills === 'object'
                ? (parsed.worldBossKills as Record<string, number>)
                : {},
            claimedChapterChests: Array.isArray(parsed.claimedChapterChests)
              ? parsed.claimedChapterChests.filter((id): id is string => typeof id === 'string')
              : [],
            towerStars,
            claimedTowerChests: Array.isArray(parsed.claimedTowerChests)
              ? parsed.claimedTowerChests.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
              : [],
            roguelikeBestFloor: Math.max(0, Math.min(6, Math.floor(Number(parsed.roguelikeBestFloor) || 0))),
            roguelikeClears: Math.max(0, Math.floor(Number(parsed.roguelikeClears) || 0)),
            selectedDifficulty,
            storyChoices,
            swordHeart,
            seenEpilogues,
          };
        }
      }
    } catch {
      // ignore storage failure in private mode
    }
    return {
      version: 7,
      cleared: {},
      lastPlayedStage: 1,
      jade: DEFAULT_STARTER_JADE,
      ownedItems: [...STARTER_OWNED_ITEMS],
      equipped: { ...DEFAULT_EQUIPPED },
      upgrades: {},
      inventory: [],
      pityCounter: 0,
      dungeonClears: {},
      stats: {
        totalKills: 0,
        totalParries: 0,
        totalDungeons: 0,
        totalForges: 0,
        totalTowerClears: 0,
        totalRoguelikeClears: 0,
        totalWorldBosses: 0,
        totalDefendWins: 0,
        totalStoryChoices: 0,
      },
      claimedBounties: [],
      cultivationLevel: 0,
      activeMealId: null,
      worldWaypoints: [],
      worldChests: [],
      worldOrbs: [],
      worldBossKills: {},
      claimedChapterChests: [],
      towerStars: {},
      claimedTowerChests: [],
      roguelikeBestFloor: 0,
      roguelikeClears: 0,
      selectedDifficulty: 'normal',
      storyChoices: {},
      swordHeart: { sword: 0, heart: 0 },
      seenEpilogues: [],
    };
  }

  private persist(): void {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      // ignore quota failure
    }
  }

  recordClear(stageId: number, stars: 1 | 2 | 3, elapsedSec: number, maxCombo: number): { firstClear: boolean } {
    const prev = this.data.cleared[stageId];
    this.data.cleared[stageId] = {
      stars: prev ? (Math.max(prev.stars, stars) as 1 | 2 | 3) : stars,
      bestTime: prev ? Math.min(prev.bestTime, elapsedSec) : elapsedSec,
      maxCombo: prev ? Math.max(prev.maxCombo, maxCombo) : maxCombo,
    };
    this.data.lastPlayedStage = Math.min(CAMPAIGN_STAGES.length, stageId + 1);
    this.persist();
    return { firstClear: !prev };
  }

  setLastPlayed(stageId: number): void {
    this.data.lastPlayedStage = Math.max(1, Math.min(CAMPAIGN_STAGES.length, stageId));
    this.persist();
  }

  getTotalStars(): number {
    let sum = 0;
    for (const rec of Object.values(this.data.cleared)) {
      sum += rec?.stars ?? 0;
    }
    return sum;
  }

  getClearedCount(): number {
    return Object.keys(this.data.cleared).length;
  }

  getRecommendedStage(): number {
    for (let s = 1; s <= CAMPAIGN_STAGES.length; s++) {
      if (!this.data.cleared[s]) return s;
    }
    return CAMPAIGN_STAGES.length;
  }

  getStageRecord(stageId: number): StageClearRecord | null {
    return this.data.cleared[stageId] ?? null;
  }

  getJade(): number {
    return this.data.jade;
  }

  addJade(amount: number): number {
    if (!Number.isFinite(amount) || amount <= 0) return this.data.jade;
    this.data.jade += Math.round(amount);
    this.persist();
    return this.data.jade;
  }

  isOwned(itemId: string): boolean {
    return this.data.ownedItems.includes(itemId);
  }

  getEquipped(): EquippedLoadout {
    return { ...this.data.equipped };
  }

  getUpgradeLevel(itemId: string): number {
    return this.data.upgrades[itemId] ?? 0;
  }

  getLoadoutStats(): HeroLoadoutStats {
    return computeHeroLoadoutStats(this.data.equipped, this.data.upgrades, this.data.inventory);
  }

  buyItem(itemId: string): { ok: boolean; reason: string } {
    const item = SHOP_ITEM_MAP[itemId];
    if (!item) return { ok: false, reason: '藏品不存在' };
    if (this.isOwned(itemId)) return { ok: false, reason: '已拥有此藏品' };
    if (this.data.jade < item.price) return { ok: false, reason: `灵石不足（需 ${item.price}）` };
    this.data.jade -= item.price;
    this.data.ownedItems.push(itemId);
    this.data.equipped[item.category] = itemId;
    this.persist();
    return { ok: true, reason: `已购入并穿戴「${item.name}」` };
  }

  equipItem(itemId: string): boolean {
    const item = SHOP_ITEM_MAP[itemId];
    if (!item || !this.isOwned(itemId)) return false;
    this.data.equipped[item.category] = itemId;
    this.persist();
    return true;
  }

  upgradeItem(itemId: string): { ok: boolean; level: number; reason: string } {
    const item = SHOP_ITEM_MAP[itemId];
    if (!item || item.category === 'skin') return { ok: false, level: 0, reason: '不可淬炼' };
    if (!this.isOwned(itemId)) return { ok: false, level: 0, reason: '尚未拥有' };
    const cur = this.getUpgradeLevel(itemId);
    if (cur >= MAX_FORGE_LEVEL) return { ok: false, level: cur, reason: '已达巅峰 +5' };
    const cost = getUpgradeCost(item, cur);
    if (this.data.jade < cost) return { ok: false, level: cur, reason: `灵石不足（需 ${cost}）` };
    this.data.jade -= cost;
    this.data.upgrades[itemId] = cur + 1;
    this.data.stats.totalForges += 1;
    this.persist();
    return { ok: true, level: cur + 1, reason: `「${item.name}」淬炼至 +${cur + 1}` };
  }

  getInventory(): RolledGearItem[] {
    return this.data.inventory;
  }

  addRolledItem(item: RolledGearItem): {
    added: boolean;
    replacedCategoryUpgrade?: boolean;
    overflowSalvagedJade?: number;
  } {
    const isUpgrade = item.powerScore > this.getEquippedScore(item.category);
    let overflowSalvagedJade: number | undefined;
    if (this.data.inventory.length >= MAX_INVENTORY_SIZE) {
      let victimIdx = -1;
      let victimRank = Infinity;
      let victimScore = Infinity;
      for (let i = 0; i < this.data.inventory.length; i++) {
        const g = this.data.inventory[i];
        if (this.data.equipped[g.category] === g.uid) continue;
        const r = GEAR_RARITY_RANK[g.rarity];
        if (r < victimRank || (r === victimRank && g.powerScore < victimScore)) {
          victimRank = r;
          victimScore = g.powerScore;
          victimIdx = i;
        }
      }
      if (victimIdx >= 0) {
        const [removed] = this.data.inventory.splice(victimIdx, 1);
        overflowSalvagedJade = getSalvageJade(removed);
        this.data.jade += overflowSalvagedJade;
      } else {
        const jade = getSalvageJade(item);
        this.data.jade += jade;
        this.persist();
        return { added: false, overflowSalvagedJade: jade };
      }
    }
    this.data.inventory.push(item);
    this.persist();
    return { added: true, replacedCategoryUpgrade: isUpgrade, overflowSalvagedJade };
  }

  equipRolledItem(uid: string): boolean {
    const item = this.data.inventory.find((g) => g.uid === uid);
    if (!item) return false;
    this.data.equipped[item.category] = item.uid;
    this.persist();
    return true;
  }

  upgradeRolledItem(uid: string): { ok: boolean; level: number; reason: string } {
    const item = this.data.inventory.find((g) => g.uid === uid);
    if (!item) return { ok: false, level: 0, reason: '装备不存在' };
    if (item.forgeLevel >= MAX_FORGE_LEVEL) return { ok: false, level: item.forgeLevel, reason: '已达巅峰 +5' };
    const cost = getRolledUpgradeCost(item);
    if (this.data.jade < cost) return { ok: false, level: item.forgeLevel, reason: `灵石不足（需 ${cost}）` };
    this.data.jade -= cost;
    item.forgeLevel += 1;
    item.powerScore = computeRolledGearScore(item);
    this.data.stats.totalForges += 1;
    this.persist();
    return { ok: true, level: item.forgeLevel, reason: `「${item.name}」淬炼至 +${item.forgeLevel}` };
  }

  salvageRolledItem(uid: string): { ok: boolean; jade: number; reason: string } {
    const idx = this.data.inventory.findIndex((g) => g.uid === uid);
    if (idx < 0) return { ok: false, jade: 0, reason: '装备不存在' };
    const item = this.data.inventory[idx];
    if (this.data.equipped[item.category] === item.uid) {
      this.data.equipped[item.category] = DEFAULT_EQUIPPED[item.category];
    }
    this.data.inventory.splice(idx, 1);
    const jade = getSalvageJade(item);
    this.data.jade += jade;
    this.persist();
    return { ok: true, jade, reason: `分解「${item.name}」得 ◆${jade} 灵石` };
  }

  salvageLowRarity(maxRarity: 'common' | 'rare'): { count: number; jade: number } {
    const maxRank = GEAR_RARITY_RANK[maxRarity];
    let count = 0;
    let jade = 0;
    const kept: RolledGearItem[] = [];
    for (const g of this.data.inventory) {
      const isEq = this.data.equipped[g.category] === g.uid;
      if (!isEq && GEAR_RARITY_RANK[g.rarity] <= maxRank) {
        count += 1;
        jade += getSalvageJade(g);
      } else {
        kept.push(g);
      }
    }
    if (count > 0) {
      this.data.inventory = kept;
      this.data.jade += jade;
      this.persist();
    }
    return { count, jade };
  }

  getEquippedItemName(category: EquipCategory): string {
    const id = this.data.equipped[category];
    if (category !== 'skin') {
      const rolled = this.data.inventory.find((g) => g.uid === id);
      if (rolled) return rolled.name;
    }
    return SHOP_ITEM_MAP[id]?.name ?? '';
  }

  getEquippedScore(category: 'weapon' | 'armor' | 'relic'): number {
    const id = this.data.equipped[category];
    const rolled = this.data.inventory.find((g) => g.uid === id);
    if (rolled) return rolled.powerScore;
    const shopItem = SHOP_ITEM_MAP[id];
    return shopItem ? computeShopItemScore(shopItem, this.getUpgradeLevel(id)) : 0;
  }

  getPityCount(): number {
    return this.data.pityCounter;
  }

  advancePityAndCheck(): boolean {
    this.data.pityCounter += 1;
    if (this.data.pityCounter >= 5) {
      this.data.pityCounter = 0;
      this.persist();
      return true;
    }
    this.persist();
    return false;
  }

  recordDungeonClear(dungeonId: string): void {
    this.data.dungeonClears[dungeonId] = (this.data.dungeonClears[dungeonId] ?? 0) + 1;
    this.persist();
  }

  getDungeonClears(dungeonId: string): number {
    return this.data.dungeonClears[dungeonId] ?? 0;
  }

  incrementStat(key: keyof CampaignSaveStats, delta = 1): void {
    if (!Number.isFinite(delta) || delta <= 0) return;
    this.data.stats[key] = (this.data.stats[key] ?? 0) + Math.floor(delta);
    this.persist();
  }

  getBountyStates(): BountyState[] {
    return BOUNTY_LIST.map((def) => {
      const progress = Math.min(def.target, this.data.stats[def.statKey] ?? 0);
      const done = progress >= def.target;
      const claimed = this.data.claimedBounties.includes(def.id);
      return { def, progress, done, claimed };
    });
  }

  claimBounty(id: string): { ok: boolean; jade: number; droppedItem?: RolledGearItem; reason: string } {
    const def = BOUNTY_LIST.find((b) => b.id === id);
    if (!def) return { ok: false, jade: 0, reason: '悬赏不存在' };
    if (this.data.claimedBounties.includes(id)) return { ok: false, jade: 0, reason: '已领取该悬赏' };
    const progress = this.data.stats[def.statKey] ?? 0;
    if (progress < def.target) return { ok: false, jade: 0, reason: '尚未达成条件' };

    this.data.claimedBounties.push(id);
    this.data.jade += def.rewardJade;
    let droppedItem: RolledGearItem | undefined;
    if (def.rewardRarity) {
      droppedItem = rollEquipmentDrop({
        tier: def.rewardRarity === 'epic' ? 2 : 1,
        guaranteedMinRarity: def.rewardRarity,
        source: `悬赏·${def.title}`,
      });
      this.addRolledItem(droppedItem);
    }
    this.persist();
    return {
      ok: true,
      jade: def.rewardJade,
      droppedItem,
      reason: droppedItem ? `领取 ◆${def.rewardJade} + 「${droppedItem.name}」` : `领取 ◆${def.rewardJade} 灵石`,
    };
  }

  getCultivationLevel(): number {
    const maxLv = CULTIVATION_STEPS.length - 1;
    return Math.max(0, Math.min(maxLv, Math.floor(this.data.cultivationLevel || 0)));
  }

  getCultivationBonus(): {
    hpBonus: number;
    atkPct: number;
    spiritRegenPct: number;
    startUltBonus: number;
    current: CultivationRealmStep;
    next: CultivationRealmStep | null;
  } {
    const lv = this.getCultivationLevel();
    const current = CULTIVATION_STEPS[lv] ?? CULTIVATION_STEPS[0];
    const next = CULTIVATION_STEPS[lv + 1] ?? null;
    return {
      hpBonus: current.hpBonus,
      atkPct: current.atkPct,
      spiritRegenPct: current.spiritRegenPct,
      startUltBonus: current.startUltBonus,
      current,
      next,
    };
  }

  breakthroughCultivation(): { ok: boolean; level: number; reason: string } {
    const cur = this.getCultivationLevel();
    const next = CULTIVATION_STEPS[cur + 1];
    if (!next) {
      return { ok: false, level: cur, reason: '已臻至「蜀山剑神」绝顶境界' };
    }
    if (this.data.jade < next.costJade) {
      return { ok: false, level: cur, reason: `灵石不足（需 ◆${next.costJade}）` };
    }
    this.data.jade -= next.costJade;
    this.data.cultivationLevel = next.level;
    this.persist();
    return { ok: true, level: next.level, reason: `修为突破至「${next.name}」！` };
  }

  getActiveMealId(): string | null {
    return this.data.activeMealId ?? null;
  }

  getActiveMeal(): CampMealDef | null {
    if (!this.data.activeMealId) return null;
    return CAMP_MEALS.find((m) => m.id === this.data.activeMealId) ?? null;
  }

  selectCampMeal(mealId: string): { ok: boolean; reason: string } {
    const meal = CAMP_MEALS.find((m) => m.id === mealId);
    if (!meal) return { ok: false, reason: '灵膳不存在' };
    if (this.data.activeMealId === meal.id) {
      return { ok: true, reason: `「${meal.name}」已在温养中` };
    }
    if (this.data.jade < meal.costJade) {
      return { ok: false, reason: `灵石不足（需 ◆${meal.costJade}）` };
    }
    if (meal.costJade > 0) {
      this.data.jade -= meal.costJade;
    }
    this.data.activeMealId = meal.id;
    this.persist();
    return { ok: true, reason: `已备好「${meal.name}」，下场出战生效！` };
  }

  consumeActiveMeal(): CampMealDef | null {
    const meal = this.getActiveMeal();
    if (!meal) return null;
    this.data.activeMealId = null;
    this.persist();
    return meal;
  }

  isWorldWaypointLit(id: string): boolean {
    return (this.data.worldWaypoints ?? []).includes(id);
  }

  unlockWorldWaypoint(id: string): boolean {
    if (!this.data.worldWaypoints) this.data.worldWaypoints = [];
    if (this.data.worldWaypoints.includes(id)) return false;
    this.data.worldWaypoints.push(id);
    this.persist();
    return true;
  }

  isWorldChestOpened(id: string): boolean {
    return (this.data.worldChests ?? []).includes(id);
  }

  openWorldChest(id: string): boolean {
    if (!this.data.worldChests) this.data.worldChests = [];
    if (this.data.worldChests.includes(id)) return false;
    this.data.worldChests.push(id);
    this.persist();
    return true;
  }

  isWorldOrbCollected(id: string): boolean {
    return (this.data.worldOrbs ?? []).includes(id);
  }

  collectWorldOrb(id: string): boolean {
    if (!this.data.worldOrbs) this.data.worldOrbs = [];
    if (this.data.worldOrbs.includes(id)) return false;
    this.data.worldOrbs.push(id);
    this.persist();
    return true;
  }

  getWorldOrbHpBonus(): number {
    return (this.data.worldOrbs ?? []).length * 10;
  }

  recordWorldBossKill(bossId: string): void {
    if (!this.data.worldBossKills) this.data.worldBossKills = {};
    this.data.worldBossKills[bossId] = (this.data.worldBossKills[bossId] ?? 0) + 1;
    this.data.stats.totalWorldBosses = (this.data.stats.totalWorldBosses ?? 0) + 1;
    this.persist();
  }

  getWorldProgress(): { waypoints: number; chests: number; bosses: number; orbs: number } {
    const waypoints = (this.data.worldWaypoints ?? []).length;
    const chests = (this.data.worldChests ?? []).length;
    const bosses = Object.keys(this.data.worldBossKills ?? {}).length;
    const orbs = (this.data.worldOrbs ?? []).length;
    return { waypoints, chests, bosses, orbs };
  }

  getSelectedDifficulty(): DifficultyTierId {
    return this.data.selectedDifficulty ?? 'normal';
  }

  setSelectedDifficulty(diff: DifficultyTierId): void {
    this.data.selectedDifficulty = diff;
    this.persist();
  }

  getChapterStars(chapterId: ChapterId): number {
    const ch = getChapterDef(chapterId);
    let sum = 0;
    for (let s = ch.stageRange[0]; s <= ch.stageRange[1]; s++) {
      sum += this.data.cleared[s]?.stars ?? 0;
    }
    return sum;
  }

  isChapterChestClaimed(id: string): boolean {
    return (this.data.claimedChapterChests ?? []).includes(id);
  }

  claimChapterChest(id: string): { ok: boolean; jade: number; droppedItem?: RolledGearItem; reason: string } {
    const def = CHAPTER_STAR_CHESTS.find((c) => c.id === id);
    if (!def) return { ok: false, jade: 0, reason: '宝箱不存在' };
    if (this.isChapterChestClaimed(id)) return { ok: false, jade: 0, reason: '该章节星匣已领取' };
    if (this.getChapterStars(def.chapter) < def.starsReq) {
      return { ok: false, jade: 0, reason: `需本章累计 ${def.starsReq} ★` };
    }
    if (!this.data.claimedChapterChests) this.data.claimedChapterChests = [];
    this.data.claimedChapterChests.push(id);
    this.data.jade += def.jade;
    let droppedItem: RolledGearItem | undefined;
    if (def.rarity) {
      const tier: 1 | 2 | 3 = def.chapter >= 3 ? 3 : def.chapter >= 2 ? 2 : 1;
      droppedItem = rollEquipmentDrop({
        tier,
        guaranteedMinRarity: def.rarity,
        source: `章节星匣·${def.label}`,
      });
      this.addRolledItem(droppedItem);
    }
    this.persist();
    return {
      ok: true,
      jade: def.jade,
      droppedItem,
      reason: droppedItem ? `开启星匣：+◆${def.jade} +【${droppedItem.name}】` : `开启星匣：+◆${def.jade} 灵石`,
    };
  }

  getTowerStars(floorNum: number): number {
    return this.data.towerStars?.[floorNum] ?? 0;
  }

  getTotalTowerStars(): number {
    let sum = 0;
    for (const v of Object.values(this.data.towerStars ?? {})) {
      sum += Number(v) || 0;
    }
    return sum;
  }

  recordTowerClear(floorNum: number, stars: 1 | 2 | 3): { firstClear: boolean } {
    if (!this.data.towerStars) this.data.towerStars = {};
    const prev: number = this.data.towerStars[floorNum] ?? 0;
    this.data.towerStars[floorNum] = Math.max(prev, stars) as 1 | 2 | 3;
    this.data.stats.totalTowerClears = (this.data.stats.totalTowerClears ?? 0) + 1;
    this.persist();
    return { firstClear: prev === 0 };
  }

  isTowerChestClaimed(starsReq: number): boolean {
    return (this.data.claimedTowerChests ?? []).includes(starsReq);
  }

  claimTowerChest(starsReq: number): { ok: boolean; jade: number; droppedItem?: RolledGearItem; reason: string } {
    const def = TOWER_STAR_CHESTS.find((c) => c.starsReq === starsReq);
    if (!def) return { ok: false, jade: 0, reason: '塔星匣不存在' };
    if (this.isTowerChestClaimed(starsReq)) return { ok: false, jade: 0, reason: '该星匣已领取' };
    if (this.getTotalTowerStars() < def.starsReq) {
      return { ok: false, jade: 0, reason: `需锁妖塔累计 ${def.starsReq} ★` };
    }
    if (!this.data.claimedTowerChests) this.data.claimedTowerChests = [];
    this.data.claimedTowerChests.push(starsReq);
    this.data.jade += def.jade;
    const droppedItem = rollEquipmentDrop({
      tier: 3,
      guaranteedMinRarity: def.rarity,
      source: `锁妖塔·${def.label}`,
    });
    this.addRolledItem(droppedItem);
    this.persist();
    return {
      ok: true,
      jade: def.jade,
      droppedItem,
      reason: `开启${def.label}：+◆${def.jade} +【${droppedItem.name}】`,
    };
  }

  getRoguelikeBestFloor(): number {
    return this.data.roguelikeBestFloor ?? 0;
  }

  getRoguelikeClears(): number {
    return this.data.roguelikeClears ?? 0;
  }

  recordRoguelikeProgress(chamber: number, clearedAll: boolean): void {
    this.data.roguelikeBestFloor = Math.max(this.data.roguelikeBestFloor ?? 0, Math.min(6, Math.max(0, chamber)));
    if (clearedAll) {
      this.data.roguelikeClears = (this.data.roguelikeClears ?? 0) + 1;
      this.data.stats.totalRoguelikeClears = (this.data.stats.totalRoguelikeClears ?? 0) + 1;
    }
    this.persist();
  }

  recordStoryChoice(stageId: number, choiceId: string, alignment: 'sword' | 'heart'): void {
    if (!this.data.storyChoices) this.data.storyChoices = {};
    if (!this.data.swordHeart) this.data.swordHeart = { sword: 0, heart: 0 };
    this.data.storyChoices[stageId] = choiceId;
    if (alignment === 'sword') this.data.swordHeart.sword += 1;
    else this.data.swordHeart.heart += 1;
    this.data.stats.totalStoryChoices = (this.data.stats.totalStoryChoices ?? 0) + 1;
    this.persist();
  }

  getSwordHeart(): { sword: number; heart: number } {
    return {
      sword: this.data.swordHeart?.sword ?? 0,
      heart: this.data.swordHeart?.heart ?? 0,
    };
  }

  getStoryChoices(): Record<number, string> {
    return { ...(this.data.storyChoices ?? {}) };
  }

  markEpilogueSeen(stageId: number): void {
    if (!this.data.seenEpilogues) this.data.seenEpilogues = [];
    if (!this.data.seenEpilogues.includes(stageId)) {
      this.data.seenEpilogues.push(stageId);
      this.persist();
    }
  }

  getSeenEpilogues(): number[] {
    return [...(this.data.seenEpilogues ?? [])];
  }

  getMaxClearedStage(): number {
    let maxS = 0;
    for (const k of Object.keys(this.data.cleared)) {
      const n = Number(k);
      if (Number.isFinite(n) && n > maxS) maxS = n;
    }
    return maxS;
  }

  hasAnyClaimableReward(): boolean {
    if (this.getBountyStates().some((b) => b.done && !b.claimed)) return true;
    const totalTower = this.getTotalTowerStars();
    if (TOWER_STAR_CHESTS.some((c) => totalTower >= c.starsReq && !this.isTowerChestClaimed(c.starsReq))) return true;
    if (CHAPTER_STAR_CHESTS.some((c) => this.getChapterStars(c.chapter) >= c.starsReq && !this.isChapterChestClaimed(c.id))) {
      return true;
    }
    return false;
  }
}

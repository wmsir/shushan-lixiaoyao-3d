import type { BlessingDef, StageDef } from './CampaignData';
import type { EquipRarity } from './EquipmentData';

export type StageMode = 'exterminate' | 'defend' | 'survive' | 'bossRush';

export const STAGE_MODE_LABELS: Record<StageMode, string> = {
  exterminate: '斩妖破阵',
  defend: '守护灵脉',
  survive: '血战限时',
  bossRush: '连斩首领',
};

export type LeylineAffixId =
  | 'none'
  | 'flying_surge'
  | 'parry_nova'
  | 'blood_pact'
  | 'rapid_cooldown'
  | 'titan_armor'
  | 'glass_cannon';

export interface LeylineAffixDef {
  id: LeylineAffixId;
  name: string;
  short: string;
  desc: string;
  colorHex: string;
}

export const LEYLINE_AFFIX_MAP: Record<LeylineAffixId, LeylineAffixDef> = {
  none: {
    id: 'none',
    name: '常规试剑',
    short: '常规',
    desc: '灵脉平稳，全凭剑法本事对决。',
    colorHex: '#63d8c6',
  },
  flying_surge: {
    id: 'flying_surge',
    name: '飞剑共鸣',
    short: '飞剑+40%',
    desc: '御剑(Q)与万剑(E)伤害 +40%，但妖众移速 +15%。',
    colorHex: '#5eead4',
  },
  parry_nova: {
    id: 'parry_nova',
    name: '惊雷破招',
    short: '弹反天雷',
    desc: '完美弹反或极限闪避引发 6m 天雷震爆（140 伤 + 45 破势）。',
    colorHex: '#c084ff',
  },
  blood_pact: {
    id: 'blood_pact',
    name: '血煞契约',
    short: '血煞+28%伤',
    desc: '战中每秒流失 1.5% 气血（最低留 1），全伤 +28% 且附带 9% 吸血。',
    colorHex: '#ff5d76',
  },
  rapid_cooldown: {
    id: 'rapid_cooldown',
    name: '瞬息剑域',
    short: '冷却-32%',
    desc: '己方技能冷却 -32%，敌方攻速与移速 +18%。',
    colorHex: '#68c8ff',
  },
  titan_armor: {
    id: 'titan_armor',
    name: '玄铁镇域',
    short: '破势2.1x',
    desc: '敌方架势韧性 +35%，陷入破势或被处决时承受 2.1 倍巨额伤害。',
    colorHex: '#f6b85a',
  },
  glass_cannon: {
    id: 'glass_cannon',
    name: '绝命问剑',
    short: '死斗+35%伤',
    desc: '敌我双方伤害均提升 35%，己方剑意获取效率 +40%。',
    colorHex: '#ff7a48',
  },
};

export type DifficultyTierId = 'normal' | 'hard' | 'nightmare';

export interface DifficultyTierDef {
  id: DifficultyTierId;
  label: string;
  shortLabel: string;
  badge: string;
  enemyHpMult: number;
  enemyDmgMult: number;
  jadeMult: number;
  extraPity: number;
  bonusGearDrop: boolean;
}

export const DIFFICULTY_TIERS: DifficultyTierDef[] = [
  {
    id: 'normal',
    label: '普通 · 问剑',
    shortLabel: '普通',
    badge: '标准掉率',
    enemyHpMult: 1.0,
    enemyDmgMult: 1.0,
    jadeMult: 1.0,
    extraPity: 0,
    bonusGearDrop: false,
  },
  {
    id: 'hard',
    label: '困难 · 修罗',
    shortLabel: '困难',
    badge: '+50%灵石 · 加速保底',
    enemyHpMult: 1.38,
    enemyDmgMult: 1.22,
    jadeMult: 1.5,
    extraPity: 1,
    bonusGearDrop: false,
  },
  {
    id: 'nightmare',
    label: '噩梦 · 灭世',
    shortLabel: '噩梦',
    badge: '2.2x灵石 · 必多掉玄/仙装',
    enemyHpMult: 1.85,
    enemyDmgMult: 1.45,
    jadeMult: 2.2,
    extraPity: 2,
    bonusGearDrop: true,
  },
];

export function getDifficultyTier(id?: DifficultyTierId | null): DifficultyTierDef {
  return DIFFICULTY_TIERS.find((d) => d.id === id) ?? DIFFICULTY_TIERS[0];
}

export interface TowerFloorDef {
  id: number;
  tier: 1 | 2 | 3;
  tierLabel: string;
  name: string;
  subtitle: string;
  recommendedPower: number;
  firstClearJade: number;
  repeatJade: number;
  guaranteedMinRarity: EquipRarity;
  stageDef: StageDef;
}

export interface TowerStarChestDef {
  starsReq: number;
  jade: number;
  rarity: EquipRarity;
  label: string;
}

export const TOWER_STAR_CHESTS: TowerStarChestDef[] = [
  { starsReq: 9, jade: 420, rarity: 'epic', label: '外塔星匣' },
  { starsReq: 18, jade: 720, rarity: 'epic', label: '内塔星匣' },
  { starsReq: 27, jade: 1200, rarity: 'legendary', label: '绝巅仙匣' },
];

export const TOWER_FLOORS: TowerFloorDef[] = [
  {
    id: 1,
    tier: 1,
    tierLabel: '外塔一层',
    name: '灵霄试剑',
    subtitle: '飞剑共鸣 · 疾破二阵',
    recommendedPower: 460,
    firstClearJade: 160,
    repeatJade: 70,
    guaranteedMinRarity: 'rare',
    stageDef: {
      id: 201,
      chapter: 1,
      episodeNum: 201,
      biome: 'bamboo_canyon',
      stageLayout: 'corridor',
      stageMode: 'exterminate',
      leylineAffix: 'flying_surge',
      name: '锁妖塔一层 · 灵霄试剑',
      subtitle: '飞剑共鸣 · Q/E+40%伤',
      badge: '外塔 1 层',
      isBossStage: false,
      parTimeSec: 75,
      recommendedRealm: '炼气初境',
      hazard: 'none',
      introLine: '塔层地脉引动飞剑共鸣，御剑与万剑伤害暴涨，速清塔卫！',
      victoryLine: '一层妖众溃散，登塔玉印亮起！',
      waves: [
        {
          label: '外塔前哨',
          enemies: [
            { kind: 'bladesman', x: -4.2, z: -3.8, name: '塔卫刀妖', hpMult: 1.28, dmgMult: 1.12, affix: 'swift' },
            { kind: 'bladesman', x: 4.2, z: -3.8, name: '塔卫刀妖', hpMult: 1.28, dmgMult: 1.12 },
            { kind: 'caster', x: 0, z: -7.5, name: '塔阵咒灵', hpMult: 1.24, dmgMult: 1.12 },
          ],
        },
        {
          label: '镇层剑侍',
          enemies: [
            { kind: 'elite', x: 0, z: -5.2, name: '守层都尉 · 啸风', hpMult: 1.38, poiseMult: 1.15, dmgMult: 1.18, affix: 'swift' },
            { kind: 'caster', x: -4.8, z: -7.2, name: '塔阵咒灵', hpMult: 1.26, dmgMult: 1.15 },
            { kind: 'caster', x: 4.8, z: -7.2, name: '塔阵咒灵', hpMult: 1.26, dmgMult: 1.15 },
          ],
        },
      ],
    },
  },
  {
    id: 2,
    tier: 1,
    tierLabel: '外塔二层',
    name: '护脉桃林',
    subtitle: '守护灵脉 · 惊雷破招',
    recommendedPower: 560,
    firstClearJade: 190,
    repeatJade: 85,
    guaranteedMinRarity: 'rare',
    stageDef: {
      id: 202,
      chapter: 1,
      episodeNum: 202,
      biome: 'peach_shrine',
      stageLayout: 'pillars',
      stageMode: 'defend',
      leylineAffix: 'parry_nova',
      monolithHp: 620,
      name: '锁妖塔二层 · 护脉桃林',
      subtitle: '守护中央灵脉水晶不被击碎',
      badge: '灵脉守护',
      isBossStage: false,
      parTimeSec: 85,
      recommendedRealm: '筑基剑修',
      hazard: 'none',
      introLine: '魔卒正狂攻中央蜀山灵脉！出剑吸引仇恨，并用弹反震雷护住灵晶！',
      victoryLine: '灵脉水晶安然无恙，天雷余威震慑四方！',
      waves: [
        {
          label: '攻脉前锋',
          enemies: [
            { kind: 'bladesman', x: -5.2, z: -5.5, name: '噬脉妖兵', hpMult: 1.32, dmgMult: 1.14 },
            { kind: 'bladesman', x: 5.2, z: -5.5, name: '噬脉妖兵', hpMult: 1.32, dmgMult: 1.14 },
            { kind: 'bladesman', x: 0, z: -8.6, name: '破阵狂卒', hpMult: 1.36, dmgMult: 1.16, affix: 'storm' },
          ],
        },
        {
          label: '嗜血督阵',
          enemies: [
            { kind: 'elite', x: -4.2, z: -6.2, name: '嗜血攻城将', hpMult: 1.46, poiseMult: 1.15, dmgMult: 1.22, affix: 'vampiric' },
            { kind: 'bladesman', x: 4.8, z: -5.2, name: '噬脉妖兵', hpMult: 1.36, dmgMult: 1.18, affix: 'swift' },
            { kind: 'caster', x: 0, z: -9.4, name: '邪咒术士', hpMult: 1.3, dmgMult: 1.18 },
          ],
        },
      ],
    },
  },
  {
    id: 3,
    tier: 1,
    tierLabel: '外塔三层',
    name: '双煞连环',
    subtitle: '连斩首领 · 玄铁镇域',
    recommendedPower: 680,
    firstClearJade: 240,
    repeatJade: 105,
    guaranteedMinRarity: 'epic',
    stageDef: {
      id: 203,
      chapter: 2,
      episodeNum: 203,
      biome: 'sword_graveyard',
      stageLayout: 'islands',
      stageMode: 'bossRush',
      leylineAffix: 'titan_armor',
      name: '锁妖塔三层 · 双煞连环',
      subtitle: '连斩泰坦与剑翼二王',
      badge: '外塔守关',
      isBossStage: true,
      bossCutscene: true,
      parTimeSec: 105,
      recommendedRealm: '筑基剑修',
      hazard: 'none',
      introLine: '外塔绝关双魔轮番出阵！打破其玄铁架势可造成双倍破势重创！',
      victoryLine: '外塔三层贯通！内塔紫雷门户大开！',
      waves: [
        {
          label: '第一尊 · 镇碑巨神',
          enemies: [
            {
              kind: 'boss',
              x: 0,
              z: -5.4,
              name: '外塔巨神 · 磐岳',
              bossArchetype: 'titan',
              hpMult: 1.35,
              poiseMult: 1.28,
              dmgMult: 1.22,
              affix: 'ironclad',
              scaleMult: 0.96,
            },
          ],
        },
        {
          label: '第二尊 · 幽冥剑翼',
          subtitle: '磐岳刚倒，第二尊剑翼魔君已破空掠至！',
          enemies: [
            {
              kind: 'boss',
              x: 0,
              z: -5.2,
              name: '幽冥剑翼 · 浮夜',
              bossArchetype: 'phantom',
              hpMult: 1.42,
              poiseMult: 1.3,
              dmgMult: 1.26,
              affix: 'swift',
            },
          ],
        },
      ],
    },
  },
  {
    id: 4,
    tier: 2,
    tierLabel: '内塔四层',
    name: '血契生还',
    subtitle: '限时生存 45 秒 · 血煞契约',
    recommendedPower: 820,
    firstClearJade: 260,
    repeatJade: 115,
    guaranteedMinRarity: 'epic',
    stageDef: {
      id: 204,
      chapter: 2,
      episodeNum: 204,
      biome: 'sword_graveyard',
      stageLayout: 'pillars',
      stageMode: 'survive',
      leylineAffix: 'blood_pact',
      surviveSec: 45,
      name: '锁妖塔四层 · 血契生还',
      subtitle: '坚持 45 秒 · 以战养战吸血求生',
      badge: '限时血战',
      isBossStage: false,
      parTimeSec: 65,
      recommendedRealm: '金丹剑客',
      hazard: 'none',
      introLine: '血煞契约生效，唯以剑饮血方可抵消反噬，在源源妖潮中撑过 45 秒！',
      victoryLine: '血战期满！剑光净化妖潮！',
      waves: [
        {
          label: '死斗妖潮',
          enemies: [
            { kind: 'bladesman', x: -5.2, z: -4.2, name: '血煞狂刀', hpMult: 1.52, dmgMult: 1.3, affix: 'swift' },
            { kind: 'bladesman', x: 5.2, z: -4.2, name: '血煞狂刀', hpMult: 1.52, dmgMult: 1.3, affix: 'vampiric' },
            { kind: 'caster', x: -4.8, z: -8.2, name: '嗜血祭司', hpMult: 1.45, dmgMult: 1.28 },
            { kind: 'elite', x: 4.5, z: -7.5, name: '断碑狂将', hpMult: 1.58, poiseMult: 1.2, dmgMult: 1.32, affix: 'storm' },
          ],
        },
      ],
    },
  },
  {
    id: 5,
    tier: 2,
    tierLabel: '内塔五层',
    name: '烈焰灵台',
    subtitle: '守护灵脉 · 瞬息剑域',
    recommendedPower: 960,
    firstClearJade: 290,
    repeatJade: 130,
    guaranteedMinRarity: 'epic',
    stageDef: {
      id: 205,
      chapter: 3,
      episodeNum: 205,
      biome: 'lava_abyss',
      stageLayout: 'islands',
      stageMode: 'defend',
      leylineAffix: 'rapid_cooldown',
      monolithHp: 760,
      name: '锁妖塔五层 · 烈焰灵台',
      subtitle: '冷却-32% · 急阵护脉',
      badge: '烈焰守脉',
      isBossStage: false,
      parTimeSec: 95,
      recommendedRealm: '金丹剑客',
      hazard: 'ember',
      hazardLabel: '深渊地火',
      hazardIntervalSec: 4.6,
      hazardDamage: 26,
      introLine: '地火灵台冷却剧减，连续释放万剑诀聚怪清场，守住镇塔水晶！',
      victoryLine: '火狱攻势尽数瓦解，灵脉如初！',
      waves: [
        {
          label: '炎狱锐卒',
          enemies: [
            { kind: 'bladesman', x: -5.6, z: -5.2, name: '焚脉刀魔', hpMult: 1.62, dmgMult: 1.36, affix: 'swift' },
            { kind: 'bladesman', x: 5.6, z: -5.2, name: '焚脉刀魔', hpMult: 1.62, dmgMult: 1.36, affix: 'storm' },
            { kind: 'caster', x: 0, z: -9.0, name: '赤焰咒道', hpMult: 1.54, dmgMult: 1.34 },
          ],
        },
        {
          label: '炎将总攻',
          enemies: [
            { kind: 'elite', x: -4.2, z: -6.2, name: '赤焰破阵将', hpMult: 1.78, poiseMult: 1.25, dmgMult: 1.42, affix: 'ironclad' },
            { kind: 'elite', x: 4.2, z: -6.2, name: '饮血火卫', hpMult: 1.72, poiseMult: 1.2, dmgMult: 1.4, affix: 'vampiric' },
            { kind: 'bladesman', x: 0, z: -8.6, name: '狂雷炎魔', hpMult: 1.65, dmgMult: 1.38, affix: 'storm' },
          ],
        },
      ],
    },
  },
  {
    id: 6,
    tier: 2,
    tierLabel: '内塔六层',
    name: '炎龙御剑',
    subtitle: '双王 Boss Rush · 飞剑共鸣',
    recommendedPower: 1120,
    firstClearJade: 340,
    repeatJade: 150,
    guaranteedMinRarity: 'epic',
    stageDef: {
      id: 206,
      chapter: 3,
      episodeNum: 206,
      biome: 'lava_abyss',
      stageLayout: 'pillars',
      stageMode: 'bossRush',
      leylineAffix: 'flying_surge',
      name: '锁妖塔六层 · 炎龙御剑',
      subtitle: '炎龙将与玄冥巨神车轮决战',
      badge: '内塔守关',
      isBossStage: true,
      bossCutscene: true,
      parTimeSec: 115,
      recommendedRealm: '元婴剑尊',
      hazard: 'ember',
      hazardLabel: '深渊地火',
      hazardIntervalSec: 4.5,
      hazardDamage: 28,
      introLine: '内塔终层双魔王压境！利用石柱遮挡火弹，以强化飞剑连斩！',
      victoryLine: '内塔六层全破！九霄星穹绝巅已在眼前！',
      waves: [
        {
          label: '第一尊 · 焚穹炎龙将',
          enemies: [
            {
              kind: 'boss',
              x: 0,
              z: -5.4,
              name: '炎狱魔将 · 烈穹',
              bossArchetype: 'inferno',
              hpMult: 1.74,
              poiseMult: 1.42,
              dmgMult: 1.44,
              affix: 'vampiric',
            },
          ],
        },
        {
          label: '第二尊 · 重甲巨神',
          subtitle: '石柱震颤！第二尊镇塔巨神挥槌砸阵！',
          enemies: [
            {
              kind: 'boss',
              x: 0,
              z: -5.2,
              name: '镇岳铁神 · 崩天',
              bossArchetype: 'titan',
              hpMult: 1.88,
              poiseMult: 1.56,
              dmgMult: 1.48,
              affix: 'ironclad',
              scaleMult: 1.04,
            },
          ],
        },
      ],
    },
  },
  {
    id: 7,
    tier: 3,
    tierLabel: '绝巅七层',
    name: '星穹死斗',
    subtitle: '限时生存 50 秒 · 绝命问剑',
    recommendedPower: 1300,
    firstClearJade: 380,
    repeatJade: 165,
    guaranteedMinRarity: 'epic',
    stageDef: {
      id: 207,
      chapter: 4,
      episodeNum: 207,
      biome: 'celestial_sanctum',
      stageLayout: 'islands',
      stageMode: 'survive',
      leylineAffix: 'glass_cannon',
      surviveSec: 50,
      name: '锁妖塔七层 · 星穹死斗',
      subtitle: '双方伤害+35% · 踩灵晶爆发生存',
      badge: '绝巅生存',
      isBossStage: false,
      parTimeSec: 75,
      recommendedRealm: '元婴剑尊',
      hazard: 'lightning',
      hazardLabel: '星穹劫雷',
      hazardIntervalSec: 3.9,
      hazardDamage: 30,
      introLine: '绝命问剑词缀下伤敌一千自损八百，触碰两侧灵晶引爆满屏天剑撑过 50 秒！',
      victoryLine: '星穹死斗胜出，剑气贯破九霄！',
      waves: [
        {
          label: '星穹狂潮',
          enemies: [
            { kind: 'elite', x: -4.8, z: -5.4, name: '星穹追风将', hpMult: 1.88, poiseMult: 1.25, dmgMult: 1.5, affix: 'swift' },
            { kind: 'elite', x: 4.8, z: -5.4, name: '星穹狂雷将', hpMult: 1.92, poiseMult: 1.25, dmgMult: 1.5, affix: 'storm' },
            { kind: 'caster', x: -5.4, z: -8.6, name: '九霄冥尊', hpMult: 1.76, dmgMult: 1.48 },
            { kind: 'caster', x: 5.4, z: -8.6, name: '九霄冥尊', hpMult: 1.76, dmgMult: 1.48 },
          ],
        },
      ],
    },
  },
  {
    id: 8,
    tier: 3,
    tierLabel: '绝巅八层',
    name: '九霄卫阵',
    subtitle: '守护灵脉 · 惊雷破招',
    recommendedPower: 1480,
    firstClearJade: 430,
    repeatJade: 185,
    guaranteedMinRarity: 'epic',
    stageDef: {
      id: 208,
      chapter: 4,
      episodeNum: 208,
      biome: 'celestial_sanctum',
      stageLayout: 'pillars',
      stageMode: 'defend',
      leylineAffix: 'parry_nova',
      monolithHp: 900,
      name: '锁妖塔八层 · 九霄卫阵',
      subtitle: '终极守脉 · 弹反惊雷退群魔',
      badge: '九霄护脉',
      isBossStage: false,
      parTimeSec: 105,
      recommendedRealm: '化神剑仙',
      hazard: 'abyss',
      hazardLabel: '灭世天劫',
      hazardIntervalSec: 3.8,
      hazardDamage: 32,
      introLine: '九幽魔将围攻最后一道天坛灵脉！迎刃弹反降下 6 米惊雷护阵！',
      victoryLine: '九霄灵脉固若金汤，直面锁妖塔绝巅！',
      waves: [
        {
          label: '星阶死士',
          enemies: [
            { kind: 'elite', x: -5.4, z: -5.4, name: '星卫铁将', hpMult: 1.98, poiseMult: 1.35, dmgMult: 1.54, affix: 'ironclad' },
            { kind: 'bladesman', x: 5.2, z: -5.2, name: '瞬影星鬼', hpMult: 1.84, dmgMult: 1.52, affix: 'swift' },
            { kind: 'caster', x: 0, z: -9.2, name: '九霄大祭司', hpMult: 1.82, dmgMult: 1.52, affix: 'storm' },
          ],
        },
        {
          label: '绝巅护法联军',
          enemies: [
            { kind: 'elite', x: -4.5, z: -6.0, name: '九幽左护法', hpMult: 2.08, poiseMult: 1.4, dmgMult: 1.58, affix: 'vampiric' },
            { kind: 'elite', x: 4.5, z: -6.0, name: '九幽右护法', hpMult: 2.08, poiseMult: 1.4, dmgMult: 1.58, affix: 'storm' },
            { kind: 'bladesman', x: 0, z: -8.8, name: '星鬼刺客', hpMult: 1.9, dmgMult: 1.54, affix: 'swift' },
          ],
        },
      ],
    },
  },
  {
    id: 9,
    tier: 3,
    tierLabel: '绝巅九层',
    name: '三魔绝巅',
    subtitle: '三尊连战 · 血煞契约',
    recommendedPower: 1680,
    firstClearJade: 580,
    repeatJade: 240,
    guaranteedMinRarity: 'legendary',
    stageDef: {
      id: 209,
      chapter: 4,
      episodeNum: 209,
      biome: 'celestial_sanctum',
      stageLayout: 'islands',
      stageMode: 'bossRush',
      leylineAffix: 'blood_pact',
      name: '锁妖塔九层 · 三魔绝巅',
      subtitle: '连斩三尊绝代魔王 · 必掉仙品',
      badge: '九重绝巅',
      isBossStage: true,
      bossCutscene: true,
      parTimeSec: 145,
      recommendedRealm: '蜀山剑圣',
      hazard: 'abyss',
      hazardLabel: '灭世天劫',
      hazardIntervalSec: 3.5,
      hazardDamage: 34,
      introLine: '锁妖塔第九层最高试炼！连破幻剑、炎龙、雷帝三大魔王即登剑道极巅！',
      victoryLine: '九重锁妖塔彻底通关！金光万丈，太初仙品现世！',
      waves: [
        {
          label: '第一尊 · 浮生剑影',
          enemies: [
            {
              kind: 'boss',
              x: 0,
              z: -5.4,
              name: '绝巅第一魔 · 噬星剑影',
              bossArchetype: 'phantom',
              hpMult: 1.95,
              poiseMult: 1.48,
              dmgMult: 1.56,
              affix: 'swift',
            },
          ],
        },
        {
          label: '第二尊 · 焚天龙煞',
          subtitle: '火海重燃！第二尊炎龙魔王破阵降临！',
          enemies: [
            {
              kind: 'boss',
              x: 0,
              z: -5.4,
              name: '绝巅第二魔 · 焚穹炎龙',
              bossArchetype: 'inferno',
              hpMult: 2.15,
              poiseMult: 1.56,
              dmgMult: 1.62,
              affix: 'vampiric',
            },
          ],
        },
        {
          label: '终尊 · 九幽雷帝',
          subtitle: '天雷合流！终极魔神「九幽雷帝」苏醒！',
          enemies: [
            {
              kind: 'boss',
              x: 0,
              z: -5.2,
              name: '绝巅终尊 · 九幽雷帝',
              bossArchetype: 'celestial',
              hpMult: 2.45,
              poiseMult: 1.72,
              dmgMult: 1.72,
              affix: 'storm',
              scaleMult: 1.08,
            },
          ],
        },
      ],
    },
  },
];

export function getTowerFloorDef(floorNum: number): TowerFloorDef {
  const idx = Math.max(0, Math.min(TOWER_FLOORS.length - 1, Math.floor(floorNum) - 1));
  return TOWER_FLOORS[idx];
}

// ==================== 3-Path Roguelike Expedition (幻境肉鸽) ====================

export type RoguelikePathId = 'lotus' | 'thunder' | 'blood';

export interface RoguelikePathDef {
  id: RoguelikePathId;
  name: string;
  tag: string;
  accentHex: string;
  res2Title: string;
  res2Desc: string;
  res3Title: string;
  res3Desc: string;
}

export const ROGUELIKE_PATHS: RoguelikePathDef[] = [
  {
    id: 'lotus',
    name: '青莲剑气流',
    tag: '暴击 · 飞剑追影',
    accentHex: '#63e6d6',
    res2Title: '2命共鸣 · 剑气追影',
    res2Desc: '每次暴击额外射出一道自动追敌飞剑（1秒内置冷却）。',
    res3Title: '3命极意 · 莲华剑心',
    res3Desc: '暴击伤害额外 +50%，且暴击回复 12 点真气。',
  },
  {
    id: 'thunder',
    name: '太极玄雷流',
    tag: '弹反 · 天雷破势',
    accentHex: '#c084ff',
    res2Title: '2命共鸣 · 惊雷护身',
    res2Desc: '完美弹反或极限闪避降下 6 米紫雷震爆（140伤+45破势）。',
    res3Title: '3命极意 · 雷尊破势',
    res3Desc: '弹反反击与对破势敌伤害 +80%；极限闪避立即重置 Q。',
  },
  {
    id: 'blood',
    name: '九幽嗜血流',
    tag: '吸血 · 血爆狂战',
    accentHex: '#ff6278',
    res2Title: '2命共鸣 · 血煞饮刃',
    res2Desc: '全伤害额外 +22%，并获得 +7% 攻击吸血。',
    res3Title: '3命极意 · 修罗血域',
    res3Desc: '气血越低伤害越高（最高 +60%），斩杀引发 4.5m 血爆。',
  },
];

export interface RoguelikeBlessingDef extends BlessingDef {
  path: RoguelikePathId;
  critRateBonus?: number;
  critDmgBonus?: number;
  lifestealBonus?: number;
}

export const ROGUELIKE_BLESSINGS: RoguelikeBlessingDef[] = [
  // 青莲剑气流 (Lotus)
  {
    id: 'rl_lotus_edge',
    path: 'lotus',
    name: '青莲出尘',
    tag: '青莲剑气',
    desc: '剑伤 +16% · 暴击率 +12%',
    dmgBonus: 0.16,
    critRateBonus: 0.12,
  },
  {
    id: 'rl_lotus_crit',
    path: 'lotus',
    name: '飞瀑破竹',
    tag: '青莲剑气',
    desc: '暴击率 +15% · 暴击伤害 +32%',
    critRateBonus: 0.15,
    critDmgBonus: 0.32,
  },
  {
    id: 'rl_lotus_cd',
    path: 'lotus',
    name: '万剑灵犀',
    tag: '青莲剑气',
    desc: '御剑/万剑/天剑冷却 -24% · 剑伤 +10%',
    cdReduce: 0.24,
    dmgBonus: 0.1,
  },
  {
    id: 'rl_lotus_ult',
    path: 'lotus',
    name: '太清剑意',
    tag: '青莲剑气',
    desc: '剑意获取 +40% · 暴伤 +25%',
    ultBonus: 0.4,
    critDmgBonus: 0.25,
  },
  // 太极玄雷流 (Thunder)
  {
    id: 'rl_thunder_step',
    path: 'thunder',
    name: '踏雷步虚',
    tag: '太极玄雷',
    desc: '移速 +14% · 暴击率 +10% · 冷却 -12%',
    speedBonus: 0.14,
    critRateBonus: 0.1,
    cdReduce: 0.12,
  },
  {
    id: 'rl_thunder_seal',
    path: 'thunder',
    name: '九霄雷印',
    tag: '太极玄雷',
    desc: '技能冷却 -22% · 剑意获取 +30%',
    cdReduce: 0.22,
    ultBonus: 0.3,
  },
  {
    id: 'rl_thunder_body',
    path: 'thunder',
    name: '玄雷罡身',
    tag: '太极玄雷',
    desc: '气血上限 +55 · 剑伤 +12%',
    hpBonus: 55,
    dmgBonus: 0.12,
  },
  {
    id: 'rl_thunder_counter',
    path: 'thunder',
    name: '雷霆反震',
    tag: '太极玄雷',
    desc: '剑伤 +18% · 暴伤 +28% · 移速 +6%',
    dmgBonus: 0.18,
    critDmgBonus: 0.28,
    speedBonus: 0.06,
  },
  // 九幽嗜血流 (Blood)
  {
    id: 'rl_blood_leech',
    path: 'blood',
    name: '赤血妖刃',
    tag: '九幽嗜血',
    desc: '全攻吸血 +6% · 剑伤 +14%',
    lifestealBonus: 0.06,
    dmgBonus: 0.14,
  },
  {
    id: 'rl_blood_gourd',
    path: 'blood',
    name: '血酿仙葫',
    tag: '九幽嗜血',
    desc: '灵葫酒 +2 · 气血上限 +65',
    gourdBonus: 2,
    hpBonus: 65,
  },
  {
    id: 'rl_blood_frenzy',
    path: 'blood',
    name: '修罗战魂',
    tag: '九幽嗜血',
    desc: '剑伤 +22% · 暴伤 +22%',
    dmgBonus: 0.22,
    critDmgBonus: 0.22,
  },
  {
    id: 'rl_blood_pact',
    path: 'blood',
    name: '魔血沸腾',
    tag: '九幽嗜血',
    desc: '吸血 +4% · 剑意 +32% · 气血 +35',
    lifestealBonus: 0.04,
    ultBonus: 0.32,
    hpBonus: 35,
  },
];

export function pickRoguelikeBlessings(
  rng: () => number,
  ownedIds: string[],
  count = 3,
): RoguelikeBlessingDef[] {
  const owned = new Set(ownedIds);
  const pool = ROGUELIKE_BLESSINGS.filter((b) => !owned.has(b.id));
  const source = pool.length >= count ? pool : [...ROGUELIKE_BLESSINGS];
  const paths: RoguelikePathId[] = ['lotus', 'thunder', 'blood'];
  const out: RoguelikeBlessingDef[] = [];

  // Ensure diverse path selection first
  const shuffledPaths = [...paths].sort(() => rng() - 0.5);
  for (const p of shuffledPaths) {
    if (out.length >= count) break;
    const candidates = source.filter((b) => b.path === p && !out.some((o) => o.id === b.id));
    if (candidates.length > 0) {
      out.push(candidates[Math.floor(rng() * candidates.length) % candidates.length]);
    }
  }
  while (out.length < count) {
    const rem = source.filter((b) => !out.some((o) => o.id === b.id));
    if (rem.length === 0) break;
    out.push(rem[Math.floor(rng() * rem.length) % rem.length]);
  }
  return out;
}

export interface RoguelikeChamberDef {
  chamber: number;
  title: string;
  subtitle: string;
  rewardJade: number;
  guaranteedMinRarity: EquipRarity;
  stageDef: StageDef;
}

export const ROGUELIKE_CHAMBERS: RoguelikeChamberDef[] = [
  {
    chamber: 1,
    title: '第一境 · 翠竹试心',
    subtitle: '破阵初啼 · 择一流派印记',
    rewardJade: 90,
    guaranteedMinRarity: 'common',
    stageDef: {
      id: 301,
      chapter: 1,
      episodeNum: 301,
      biome: 'bamboo_canyon',
      stageLayout: 'corridor',
      stageMode: 'exterminate',
      leylineAffix: 'none',
      name: '幻境一境 · 翠竹试心',
      subtitle: '斩妖破阵 · 获取首枚流派赐福',
      badge: '幻境 1/6',
      isBossStage: false,
      parTimeSec: 70,
      recommendedRealm: '炼气初境',
      hazard: 'none',
      introLine: '踏入六境蜀山幻境，先破山门幻影魔卫！',
      victoryLine: '一境破关，剑魂赐福降临！',
      waves: [
        {
          label: '幻影哨兵',
          enemies: [
            { kind: 'bladesman', x: -4.2, z: -3.5, name: '幻境剑傀', hpMult: 1.15, dmgMult: 1.05 },
            { kind: 'bladesman', x: 4.2, z: -3.5, name: '幻境剑傀', hpMult: 1.15, dmgMult: 1.05, affix: 'swift' },
            { kind: 'caster', x: 0, z: -7.6, name: '幻境术师', hpMult: 1.12, dmgMult: 1.06 },
          ],
        },
        {
          label: '幻阵校尉',
          enemies: [
            { kind: 'elite', x: 0, z: -5.4, name: '竹影校尉', hpMult: 1.25, dmgMult: 1.12, affix: 'storm' },
            { kind: 'bladesman', x: -4.4, z: -3.6, name: '幻境剑傀', hpMult: 1.15, dmgMult: 1.08 },
          ],
        },
      ],
    },
  },
  {
    chamber: 2,
    title: '第二境 · 桃源迷阵',
    subtitle: '限时生存 35 秒 · 飞剑共鸣',
    rewardJade: 120,
    guaranteedMinRarity: 'rare',
    stageDef: {
      id: 302,
      chapter: 2,
      episodeNum: 302,
      biome: 'peach_shrine',
      stageLayout: 'pillars',
      stageMode: 'survive',
      leylineAffix: 'flying_surge',
      surviveSec: 35,
      name: '幻境二境 · 桃源迷阵',
      subtitle: '桃林幻潮中鏖战 35 秒',
      badge: '幻境 2/6',
      isBossStage: false,
      parTimeSec: 60,
      recommendedRealm: '筑基剑修',
      hazard: 'none',
      introLine: '花影重重，御剑流与玄雷流各显神通，支撑 35 秒！',
      victoryLine: '幻潮散尽，灵宝与剑道印记现世！',
      waves: [
        {
          label: '桃林幻潮',
          enemies: [
            { kind: 'bladesman', x: -5.0, z: -4.0, name: '花影魔刀', hpMult: 1.32, dmgMult: 1.18, affix: 'swift' },
            { kind: 'bladesman', x: 5.0, z: -4.0, name: '花影魔刀', hpMult: 1.32, dmgMult: 1.18 },
            { kind: 'caster', x: 0, z: -8.2, name: '桃林魅道', hpMult: 1.28, dmgMult: 1.18 },
          ],
        },
      ],
    },
  },
  {
    chamber: 3,
    title: '第三境 · 残碑护脉',
    subtitle: '守护灵脉 · 惊雷破招',
    rewardJade: 150,
    guaranteedMinRarity: 'rare',
    stageDef: {
      id: 303,
      chapter: 2,
      episodeNum: 303,
      biome: 'sword_graveyard',
      stageLayout: 'pillars',
      stageMode: 'defend',
      leylineAffix: 'parry_nova',
      monolithHp: 600,
      name: '幻境三境 · 残碑护脉',
      subtitle: '护住幻境灵晶，破势反震群妖',
      badge: '幻境 3/6',
      isBossStage: false,
      parTimeSec: 88,
      recommendedRealm: '金丹剑客',
      hazard: 'none',
      introLine: '剑冢妖潮欲毁中枢灵晶！拉住仇恨，以完美弹反震碎来敌！',
      victoryLine: '残碑灵脉安然，已凑出流派共鸣！',
      waves: [
        {
          label: '断碑先锋',
          enemies: [
            { kind: 'bladesman', x: -5.2, z: -5.2, name: '荒冢刀灵', hpMult: 1.44, dmgMult: 1.24, affix: 'storm' },
            { kind: 'bladesman', x: 5.2, z: -5.2, name: '荒冢刀灵', hpMult: 1.44, dmgMult: 1.24, affix: 'swift' },
            { kind: 'caster', x: 0, z: -8.8, name: '残碑祭司', hpMult: 1.38, dmgMult: 1.24 },
          ],
        },
        {
          label: '铁骑统领',
          enemies: [
            { kind: 'elite', x: 0, z: -6.2, name: '剑冢铁卫长', hpMult: 1.56, poiseMult: 1.25, dmgMult: 1.28, affix: 'ironclad' },
            { kind: 'bladesman', x: -5.0, z: -5.4, name: '嗜血剑魂', hpMult: 1.44, dmgMult: 1.26, affix: 'vampiric' },
          ],
        },
      ],
    },
  },
  {
    chamber: 4,
    title: '第四境 · 火狱精英',
    subtitle: '双精英强敌 · 瞬息剑域',
    rewardJade: 185,
    guaranteedMinRarity: 'epic',
    stageDef: {
      id: 304,
      chapter: 3,
      episodeNum: 304,
      biome: 'lava_abyss',
      stageLayout: 'pillars',
      stageMode: 'exterminate',
      leylineAffix: 'rapid_cooldown',
      name: '幻境四境 · 火狱精英',
      subtitle: '冷却-32% · 力斩炎狱双煞',
      badge: '幻境 4/6',
      isBossStage: false,
      parTimeSec: 95,
      recommendedRealm: '金丹剑客',
      hazard: 'ember',
      hazardLabel: '深渊地火',
      hazardIntervalSec: 4.5,
      hazardDamage: 26,
      introLine: '冷却缩减开启，迎战炎狱精英卫队！',
      victoryLine: '玄品神兵落入背囊，直入决战前夜！',
      waves: [
        {
          label: '炎狱卫队',
          enemies: [
            { kind: 'elite', x: -4.4, z: -5.2, name: '炎魔左使', hpMult: 1.7, poiseMult: 1.25, dmgMult: 1.36, affix: 'vampiric' },
            { kind: 'elite', x: 4.4, z: -5.2, name: '雷火右使', hpMult: 1.7, poiseMult: 1.25, dmgMult: 1.36, affix: 'storm' },
            { kind: 'caster', x: 0, z: -8.6, name: '火狱妖道', hpMult: 1.58, dmgMult: 1.35 },
          ],
        },
      ],
    },
  },
  {
    chamber: 5,
    title: '第五境 · 双王试炼',
    subtitle: 'Boss Rush · 玄铁镇域',
    rewardJade: 240,
    guaranteedMinRarity: 'epic',
    stageDef: {
      id: 305,
      chapter: 3,
      episodeNum: 305,
      biome: 'lava_abyss',
      stageLayout: 'islands',
      stageMode: 'bossRush',
      leylineAffix: 'titan_armor',
      name: '幻境五境 · 双王试炼',
      subtitle: '剑翼与泰坦连番考校',
      badge: '幻境 5/6',
      isBossStage: true,
      bossCutscene: true,
      parTimeSec: 120,
      recommendedRealm: '元婴剑尊',
      hazard: 'ember',
      hazardLabel: '炼狱余烬',
      hazardIntervalSec: 4.6,
      hazardDamage: 28,
      introLine: '已成三印剑道共鸣！迎战第五境连环双魔王！',
      victoryLine: '双魔尽灭，终点绝巅之主正在等候！',
      waves: [
        {
          label: '剑翼妖王',
          enemies: [
            {
              kind: 'boss',
              x: 0,
              z: -5.2,
              name: '幻境剑翼 · 魅影',
              bossArchetype: 'phantom',
              hpMult: 1.65,
              poiseMult: 1.35,
              dmgMult: 1.4,
              affix: 'swift',
            },
          ],
        },
        {
          label: '镇岳巨神',
          subtitle: '重甲巨神轰然降临！',
          enemies: [
            {
              kind: 'boss',
              x: 0,
              z: -5.2,
              name: '幻境巨神 · 玄甲',
              bossArchetype: 'titan',
              hpMult: 1.78,
              poiseMult: 1.45,
              dmgMult: 1.44,
              affix: 'ironclad',
            },
          ],
        },
      ],
    },
  },
  {
    chamber: 6,
    title: '终境六 · 星穹帝劫',
    subtitle: '终极 Boss · 必爆仙品神兵',
    rewardJade: 420,
    guaranteedMinRarity: 'legendary',
    stageDef: {
      id: 306,
      chapter: 4,
      episodeNum: 306,
      biome: 'celestial_sanctum',
      stageLayout: 'islands',
      stageMode: 'exterminate',
      leylineAffix: 'glass_cannon',
      name: '幻境终境 · 星穹帝劫',
      subtitle: '以全套肉鸽赐福剑指九幽雷帝',
      badge: '幻境终战',
      isBossStage: true,
      bossCutscene: true,
      parTimeSec: 135,
      recommendedRealm: '化神剑仙',
      hazard: 'abyss',
      hazardLabel: '星穹天劫',
      hazardIntervalSec: 3.9,
      hazardDamage: 32,
      introLine: '流派大成之刻！挥剑劈开星穹天劫，斩落幻境最终雷帝！',
      victoryLine: '六境幻境圆满通幽！仙品光柱直彻天地！',
      waves: [
        {
          label: '终极魔神 · 幻境雷帝',
          enemies: [
            { kind: 'elite', x: -4.8, z: -4.8, name: '星坛护卫', hpMult: 1.68, dmgMult: 1.42, affix: 'swift' },
            {
              kind: 'boss',
              x: 0,
              z: -5.4,
              name: '星穹雷帝 · 劫主',
              bossArchetype: 'celestial',
              hpMult: 2.05,
              poiseMult: 1.6,
              dmgMult: 1.54,
              affix: 'storm',
              scaleMult: 1.06,
            },
          ],
        },
      ],
    },
  },
];

// ==================== Chapter Star Milestone Chests ====================

export interface ChapterStarChestDef {
  id: string;
  chapter: 1 | 2 | 3 | 4 | 5;
  starsReq: 5 | 10 | 15;
  jade: number;
  rarity?: EquipRarity;
  label: string;
}

export const CHAPTER_STAR_CHESTS: ChapterStarChestDef[] = [
  { id: 'ch1_5', chapter: 1, starsReq: 5, jade: 160, label: '5★ 剑匣' },
  { id: 'ch1_10', chapter: 1, starsReq: 10, jade: 240, rarity: 'rare', label: '10★ 灵匣' },
  { id: 'ch1_15', chapter: 1, starsReq: 15, jade: 360, rarity: 'epic', label: '15★ 玄匣' },

  { id: 'ch2_5', chapter: 2, starsReq: 5, jade: 200, label: '5★ 剑匣' },
  { id: 'ch2_10', chapter: 2, starsReq: 10, jade: 280, rarity: 'rare', label: '10★ 灵匣' },
  { id: 'ch2_15', chapter: 2, starsReq: 15, jade: 420, rarity: 'epic', label: '15★ 玄匣' },

  { id: 'ch3_5', chapter: 3, starsReq: 5, jade: 240, label: '5★ 剑匣' },
  { id: 'ch3_10', chapter: 3, starsReq: 10, jade: 340, rarity: 'epic', label: '10★ 玄匣' },
  { id: 'ch3_15', chapter: 3, starsReq: 15, jade: 500, rarity: 'epic', label: '15★ 镇狱匣' },

  { id: 'ch4_5', chapter: 4, starsReq: 5, jade: 280, label: '5★ 剑匣' },
  { id: 'ch4_10', chapter: 4, starsReq: 10, jade: 420, rarity: 'epic', label: '10★ 玄匣' },
  { id: 'ch4_15', chapter: 4, starsReq: 15, jade: 600, rarity: 'legendary', label: '15★ 剑圣仙匣' },

  { id: 'ch5_5', chapter: 5, starsReq: 5, jade: 340, label: '5★ 星匣' },
  { id: 'ch5_10', chapter: 5, starsReq: 10, jade: 500, rarity: 'epic', label: '10★ 太虚匣' },
  { id: 'ch5_15', chapter: 5, starsReq: 15, jade: 800, rarity: 'legendary', label: '15★ 剑祖仙匣' },
];

// ==================== DMC / Honkai Combat Style Rating (D -> SSS) ====================

export type CombatStyleRankId = 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS';

export interface CombatStyleRankInfo {
  rank: CombatStyleRankId;
  title: string;
  minScore: number;
  jadeBonusPct: number;
  ultGainBonusPct: number;
  colorHex: string;
}

export const COMBAT_STYLE_RANKS: CombatStyleRankInfo[] = [
  { rank: 'D', title: '初露锋芒', minScore: 0, jadeBonusPct: 0, ultGainBonusPct: 0, colorHex: '#94a3b8' },
  { rank: 'C', title: '剑势成形', minScore: 18, jadeBonusPct: 0, ultGainBonusPct: 0, colorHex: '#63d8c6' },
  { rank: 'B', title: '流云快剑', minScore: 36, jadeBonusPct: 0.05, ultGainBonusPct: 0, colorHex: '#60b8ff' },
  { rank: 'A', title: '御风宗师', minScore: 58, jadeBonusPct: 0.08, ultGainBonusPct: 0.05, colorHex: '#c084ff' },
  { rank: 'S', title: '剑道尊者', minScore: 82, jadeBonusPct: 0.1, ultGainBonusPct: 0.08, colorHex: '#fbbf24' },
  { rank: 'SS', title: '无双剑圣', minScore: 112, jadeBonusPct: 0.18, ultGainBonusPct: 0.14, colorHex: '#ff9638' },
  { rank: 'SSS', title: '绝代剑仙', minScore: 148, jadeBonusPct: 0.25, ultGainBonusPct: 0.2, colorHex: '#ff4d6d' },
];

export function evaluateCombatRank(score: number): CombatStyleRankInfo {
  let cur = COMBAT_STYLE_RANKS[0];
  for (const r of COMBAT_STYLE_RANKS) {
    if (score >= r.minScore) cur = r;
  }
  return cur;
}

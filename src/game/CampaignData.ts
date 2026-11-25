export type EnemyKind = 'bladesman' | 'caster' | 'elite' | 'boss';
export type EnemyAffix = 'swift' | 'vampiric' | 'ironclad' | 'storm';
export type StageHazardType = 'none' | 'lightning' | 'ember' | 'abyss';

export interface ChapterDef {
  id: 1 | 2 | 3 | 4;
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
}

export interface StageWaveDef {
  label: string;
  subtitle?: string;
  enemies: StageEnemySpec[];
}

export interface StageDef {
  id: number;
  chapter: 1 | 2 | 3 | 4;
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
}

export interface StageClearRecord {
  stars: 1 | 2 | 3;
  bestTime: number;
  maxCombo: number;
}

export interface CampaignSaveData {
  version: 1;
  cleared: Record<number, StageClearRecord>;
  lastPlayedStage: number;
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
    name: '剑启山门',
    subtitle: '蜀山山门 · 妖兵破关',
    badge: '入门试剑',
    isBossStage: false,
    parTimeSec: 65,
    recommendedRealm: '炼气初境',
    hazard: 'none',
    introLine: '月色如霜，锁妖台外妖煞初动，先清山门先锋！',
    victoryLine: '山门妖卒已清，剑锋初试锋芒。',
    waves: [
      {
        label: '山门先锋',
        enemies: [
          { kind: 'bladesman', x: -4.2, z: -3.6, name: '山门妖锋', hpMult: 0.9, dmgMult: 0.85 },
          { kind: 'bladesman', x: 4.3, z: -3.2, name: '山门妖锋', hpMult: 0.9, dmgMult: 0.85 },
          { kind: 'caster', x: 0.0, z: -7.8, name: '幽冥符道', hpMult: 0.88, dmgMult: 0.85 },
        ],
      },
    ],
  },
  {
    id: 2,
    chapter: 1,
    name: '霜阶巡煞',
    subtitle: '长阶双波 · 夹击破阵',
    badge: '双波攻势',
    isBossStage: false,
    parTimeSec: 80,
    recommendedRealm: '炼气初境',
    hazard: 'none',
    introLine: '两路巡山妖兵自石阶合围，莫被法术牵制阵脚！',
    victoryLine: '两波巡煞尽数伏诛，石阶重归安宁。',
    waves: [
      {
        label: '前哨巡卒',
        enemies: [
          { kind: 'bladesman', x: -4.8, z: -3.2, name: '玄铁刀卫', hpMult: 0.95, dmgMult: 0.9 },
          { kind: 'bladesman', x: 4.8, z: -3.2, name: '玄铁刀卫', hpMult: 0.95, dmgMult: 0.9 },
        ],
      },
      {
        label: '后援玄道',
        subtitle: '两翼幽冥玄道现身结阵，速用御剑术打断！',
        enemies: [
          { kind: 'bladesman', x: 0.0, z: -5.4, name: '重甲盾锋', hpMult: 1.08, dmgMult: 0.95 },
          { kind: 'caster', x: -5.6, z: -6.8, name: '左翼符师', hpMult: 0.95, dmgMult: 0.95 },
          { kind: 'caster', x: 5.6, z: -6.8, name: '右翼符师', hpMult: 0.95, dmgMult: 0.95 },
        ],
      },
    ],
  },
  {
    id: 3,
    chapter: 1,
    name: '幽符困阵',
    subtitle: '三才法阵 · 破符夺先',
    badge: '法阵考验',
    isBossStage: false,
    parTimeSec: 85,
    recommendedRealm: '炼气初境',
    hazard: 'none',
    introLine: '幽冥术师布下三才阴符阵，疾步贴身破其阵眼！',
    victoryLine: '阴符阵碎，灵气重归山门。',
    waves: [
      {
        label: '阴符前阵',
        enemies: [
          { kind: 'caster', x: -5.4, z: -6.2, name: '阴煞符道', hpMult: 1.0, dmgMult: 0.98 },
          { kind: 'caster', x: 5.4, z: -6.2, name: '阴煞符道', hpMult: 1.0, dmgMult: 0.98 },
          { kind: 'bladesman', x: 0.0, z: -3.4, name: '护法剑卒', hpMult: 1.05, dmgMult: 0.95, affix: 'swift' },
        ],
      },
      {
        label: '阵眼增援',
        subtitle: '法阵异变，疾风剑卒与主祭符师齐出！',
        enemies: [
          { kind: 'bladesman', x: -3.6, z: -4.8, name: '疾风妖剑', hpMult: 1.02, dmgMult: 1.0, affix: 'swift' },
          { kind: 'bladesman', x: 3.6, z: -4.8, name: '疾风妖剑', hpMult: 1.02, dmgMult: 1.0, affix: 'swift' },
          { kind: 'caster', x: 0.0, z: -8.6, name: '阵眼大术师', hpMult: 1.22, dmgMult: 1.05 },
        ],
      },
    ],
  },
  {
    id: 4,
    chapter: 1,
    name: '残碑铁骑',
    subtitle: '血甲都尉 · 弹反初试',
    badge: '精英试炼',
    isBossStage: false,
    parTimeSec: 90,
    recommendedRealm: '筑基剑修',
    hazard: 'none',
    introLine: '血甲都尉亲自督战，抓准其蓄力红光完美弹反破势！',
    victoryLine: '血甲都尉折戟残碑，山门大阵已近收复。',
    waves: [
      {
        label: '铁骑护卫',
        enemies: [
          { kind: 'bladesman', x: -4.5, z: -3.6, name: '玄铁锐卒', hpMult: 1.05, dmgMult: 1.0 },
          { kind: 'bladesman', x: 4.5, z: -3.6, name: '玄铁锐卒', hpMult: 1.05, dmgMult: 1.0 },
          { kind: 'caster', x: 0.0, z: -7.5, name: '随军玄道', hpMult: 1.0, dmgMult: 1.0 },
        ],
      },
      {
        label: '血甲都尉降临',
        subtitle: '血甲都尉率亲卫压阵，善用格挡弹反破其重剑！',
        enemies: [
          { kind: 'elite', x: 0.0, z: -5.8, name: '血甲都尉 · 斩岳', hpMult: 1.05, poiseMult: 1.0, dmgMult: 1.0 },
          { kind: 'bladesman', x: -5.2, z: -3.0, name: '亲卫魔卒', hpMult: 0.95, dmgMult: 0.95 },
        ],
      },
    ],
  },
  {
    id: 5,
    chapter: 1,
    name: '守门魔将',
    subtitle: '第一章首领 · 玄甲破岳',
    badge: '章末 Boss',
    isBossStage: true,
    bossCutscene: true,
    parTimeSec: 115,
    recommendedRealm: '筑基剑修',
    hazard: 'none',
    introLine: '玄甲镇门将·破岳：「蜀山小儿，先过本将手中巨剑！」',
    victoryLine: '第一章通关！蜀山山门肃清，剑冢古道已开启。',
    waves: [
      {
        label: '镇门亲卫',
        enemies: [
          { kind: 'bladesman', x: -4.2, z: -3.8, name: '破岳前锋', hpMult: 1.05, dmgMult: 1.0 },
          { kind: 'caster', x: 4.6, z: -6.5, name: '镇门咒师', hpMult: 1.02, dmgMult: 1.0 },
        ],
      },
      {
        label: '章末首领 · 玄甲镇门将',
        subtitle: '玄甲镇门将·破岳踏碎石阶登场！',
        enemies: [
          {
            kind: 'boss',
            x: 0.0,
            z: -5.0,
            name: '玄甲镇门将 · 破岳',
            hpMult: 0.84,
            poiseMult: 0.9,
            dmgMult: 0.92,
            scaleMult: 0.94,
          },
        ],
      },
    ],
  },

  // ===================== CHAPTER 2: 剑冢幽冥 (6–10) =====================
  {
    id: 6,
    chapter: 2,
    name: '断剑荒原',
    subtitle: '剑冢外围 · 疾风煞影',
    badge: '疾风词缀',
    isBossStage: false,
    parTimeSec: 90,
    recommendedRealm: '筑基剑修',
    hazard: 'none',
    introLine: '踏入剑冢荒原，此处魔兵皆染疾风煞气，出剑极快！',
    victoryLine: '疾风魔兵尽破，深入剑冢腹地。',
    waves: [
      {
        label: '疾风前驱',
        enemies: [
          { kind: 'bladesman', x: -5.0, z: -3.5, name: '疾风剑傀', hpMult: 1.12, dmgMult: 1.05, affix: 'swift' },
          { kind: 'bladesman', x: 5.0, z: -3.5, name: '疾风剑傀', hpMult: 1.12, dmgMult: 1.05, affix: 'swift' },
          { kind: 'caster', x: 0.0, z: -8.0, name: '剑冢冥道', hpMult: 1.12, dmgMult: 1.05 },
        ],
      },
      {
        label: '血甲突袭',
        subtitle: '疾风血甲游骑自断碑后杀出！',
        enemies: [
          { kind: 'elite', x: 0.0, z: -5.8, name: '疾风魔将 · 掠影', hpMult: 1.12, dmgMult: 1.05, affix: 'swift' },
          { kind: 'caster', x: -5.8, z: -7.2, name: '剑冢冥道', hpMult: 1.08, dmgMult: 1.05 },
        ],
      },
    ],
  },
  {
    id: 7,
    chapter: 2,
    name: '鬼火祭坛',
    subtitle: '天雷阵域 · 步步惊心',
    badge: '天雷灾害',
    isBossStage: false,
    parTimeSec: 95,
    recommendedRealm: '筑基剑修',
    hazard: 'lightning',
    hazardLabel: '剑冢紫雷',
    hazardIntervalSec: 5.4,
    hazardDamage: 20,
    introLine: '古祭坛引动九天紫雷！留意脚下紫红预警阵，及时踏云闪避！',
    victoryLine: '天雷息止，祭坛鬼火尽散。',
    waves: [
      {
        label: '祭坛守卫',
        enemies: [
          { kind: 'bladesman', x: -4.4, z: -4.0, name: '雷煞铁卫', hpMult: 1.15, dmgMult: 1.08 },
          { kind: 'caster', x: 4.8, z: -6.8, name: '唤雷冥师', hpMult: 1.15, dmgMult: 1.1 },
          { kind: 'caster', x: -4.8, z: -6.8, name: '唤雷冥师', hpMult: 1.15, dmgMult: 1.1 },
        ],
      },
      {
        label: '雷纹魔将',
        subtitle: '狂雷剑魔现身祭坛中央，小心雷环余波！',
        enemies: [
          { kind: 'elite', x: 0.0, z: -5.2, name: '紫雷剑魔 · 震霆', hpMult: 1.18, dmgMult: 1.08, affix: 'storm' },
          { kind: 'bladesman', x: 4.5, z: -3.2, name: '雷煞铁卫', hpMult: 1.12, dmgMult: 1.05 },
        ],
      },
    ],
  },
  {
    id: 8,
    chapter: 2,
    name: '血甲双煞',
    subtitle: '左右护法 · 双将夹击',
    badge: '双精英战',
    isBossStage: false,
    parTimeSec: 105,
    recommendedRealm: '金丹剑客',
    hazard: 'none',
    introLine: '剑冢左右双护法齐出，万剑诀控场逐一击破！',
    victoryLine: '血甲双煞尽斩剑下，威震古剑冢！',
    waves: [
      {
        label: '血甲双煞联阵',
        enemies: [
          { kind: 'elite', x: -4.6, z: -5.4, name: '血甲左使 · 破军', hpMult: 1.08, dmgMult: 1.08, affix: 'swift' },
          { kind: 'elite', x: 4.6, z: -5.4, name: '血甲右使 · 贪狼', hpMult: 1.12, dmgMult: 1.08, affix: 'ironclad' },
          { kind: 'caster', x: 0.0, z: -9.0, name: '祭坛冥道', hpMult: 1.12, dmgMult: 1.05 },
        ],
      },
    ],
  },
  {
    id: 9,
    chapter: 2,
    name: '剑冢围城',
    subtitle: '三波血战 · 万剑扫荡',
    badge: '三波血战',
    isBossStage: false,
    parTimeSec: 120,
    recommendedRealm: '金丹剑客',
    hazard: 'lightning',
    hazardLabel: '剑冢紫雷',
    hazardIntervalSec: 6.2,
    hazardDamage: 20,
    introLine: '四面残碑妖军齐涌，连破三波围城方可直逼血尊大殿！',
    victoryLine: '三波妖军全灭，剑冢血尊已现身殿前！',
    waves: [
      {
        label: '第一波 · 剑傀突击',
        enemies: [
          { kind: 'bladesman', x: -5.4, z: -3.2, name: '断剑魔卒', hpMult: 1.15, dmgMult: 1.08 },
          { kind: 'bladesman', x: 0.0, z: -6.2, name: '断剑魔卒', hpMult: 1.15, dmgMult: 1.08 },
          { kind: 'bladesman', x: 5.4, z: -3.2, name: '断剑魔卒', hpMult: 1.15, dmgMult: 1.08 },
        ],
      },
      {
        label: '第二波 · 冥法齐射',
        subtitle: '三名幽冥玄道布阵齐射，速以万剑诀破阵！',
        enemies: [
          { kind: 'caster', x: -5.8, z: -6.6, name: '幽冥法尊', hpMult: 1.16, dmgMult: 1.1 },
          { kind: 'caster', x: 0.0, z: -8.6, name: '幽冥法尊', hpMult: 1.16, dmgMult: 1.1 },
          { kind: 'caster', x: 5.8, z: -6.6, name: '幽冥法尊', hpMult: 1.16, dmgMult: 1.1 },
        ],
      },
      {
        label: '第三波 · 督军压轴',
        subtitle: '霸体血甲统领率死士总攻！',
        enemies: [
          { kind: 'elite', x: 0.0, z: -5.8, name: '剑冢督军 · 铁煞', hpMult: 1.28, poiseMult: 1.25, dmgMult: 1.12, affix: 'ironclad' },
          { kind: 'bladesman', x: -4.6, z: -3.6, name: '嗜血死士', hpMult: 1.12, dmgMult: 1.08, affix: 'vampiric' },
          { kind: 'bladesman', x: 4.6, z: -3.6, name: '嗜血死士', hpMult: 1.12, dmgMult: 1.08, affix: 'vampiric' },
        ],
      },
    ],
  },
  {
    id: 10,
    chapter: 2,
    name: '血狱剑尊',
    subtitle: '第二章首领 · 赤霄魔君',
    badge: '章末 Boss',
    isBossStage: true,
    bossCutscene: true,
    parTimeSec: 130,
    recommendedRealm: '金丹剑客',
    hazard: 'lightning',
    hazardLabel: '血雷天罚',
    hazardIntervalSec: 5.8,
    hazardDamage: 24,
    introLine: '赤霄魔君：「葬身剑冢之魂，皆为本尊剑下养料！」',
    victoryLine: '第二章通关！古剑冢封印重固，锁妖深渊入口洞开。',
    waves: [
      {
        label: '剑尊仪仗',
        enemies: [
          { kind: 'elite', x: -3.8, z: -5.2, name: '赤霄剑侍', hpMult: 1.02, dmgMult: 1.08 },
          { kind: 'caster', x: 4.8, z: -7.2, name: '血狱祭司', hpMult: 1.15, dmgMult: 1.1 },
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
            hpMult: 1.12,
            poiseMult: 1.1,
            dmgMult: 1.1,
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
    name: '赤焰剑狱',
    subtitle: '地火喷涌 · 焦土血战',
    badge: '地火灾害',
    isBossStage: false,
    parTimeSec: 105,
    recommendedRealm: '金丹剑客',
    hazard: 'ember',
    hazardLabel: '深渊地火',
    hazardIntervalSec: 4.8,
    hazardDamage: 25,
    introLine: '锁妖深渊地脉炽烈，地火剑阵随时自脚下喷发！',
    victoryLine: '踏火破敌，锁妖火狱外围告破！',
    waves: [
      {
        label: '炎狱先锋',
        enemies: [
          { kind: 'bladesman', x: -4.8, z: -4.2, name: '炎甲刀魔', hpMult: 1.32, dmgMult: 1.18, affix: 'ironclad' },
          { kind: 'bladesman', x: 4.8, z: -4.2, name: '炎甲刀魔', hpMult: 1.32, dmgMult: 1.18, affix: 'ironclad' },
          { kind: 'caster', x: 0.0, z: -8.2, name: '赤焰咒道', hpMult: 1.28, dmgMult: 1.18 },
        ],
      },
      {
        label: '火狱魔将',
        subtitle: '炎甲校尉率军截断退路！',
        enemies: [
          { kind: 'elite', x: 0.0, z: -5.5, name: '炎狱校尉 · 焚骨', hpMult: 1.35, dmgMult: 1.2, affix: 'storm' },
          { kind: 'bladesman', x: -5.0, z: -3.2, name: '疾风火傀', hpMult: 1.25, dmgMult: 1.15, affix: 'swift' },
          { kind: 'caster', x: 5.4, z: -6.8, name: '赤焰咒道', hpMult: 1.25, dmgMult: 1.18 },
        ],
      },
    ],
  },
  {
    id: 12,
    chapter: 3,
    name: '嗜血狂潮',
    subtitle: '嗜血词缀 · 弹反克制',
    badge: '嗜血魔甲',
    isBossStage: false,
    parTimeSec: 105,
    recommendedRealm: '元婴剑尊',
    hazard: 'ember',
    hazardLabel: '深渊地火',
    hazardIntervalSec: 5.5,
    hazardDamage: 25,
    introLine: '此层魔众皆具【嗜血】词缀，被其击中将回血，务必弹反闪避！',
    victoryLine: '剑光如电滴血不沾，嗜血狂潮彻底瓦解！',
    waves: [
      {
        label: '嗜血魔阵',
        enemies: [
          { kind: 'elite', x: -3.6, z: -5.2, name: '嗜血狂将 · 饮煞', hpMult: 1.36, dmgMult: 1.22, affix: 'vampiric' },
          { kind: 'bladesman', x: 4.2, z: -3.8, name: '嗜血魔兵', hpMult: 1.3, dmgMult: 1.2, affix: 'vampiric' },
          { kind: 'bladesman', x: -5.4, z: -2.6, name: '嗜血魔兵', hpMult: 1.3, dmgMult: 1.2, affix: 'vampiric' },
        ],
      },
      {
        label: '血魔统领',
        subtitle: '第二波嗜血统领与双符道夹击！',
        enemies: [
          { kind: 'elite', x: 0.0, z: -5.6, name: '血海魔统 · 噬魂', hpMult: 1.44, dmgMult: 1.24, affix: 'vampiric' },
          { kind: 'caster', x: -5.6, z: -7.2, name: '血咒大祭司', hpMult: 1.3, dmgMult: 1.2 },
          { kind: 'caster', x: 5.6, z: -7.2, name: '血咒大祭司', hpMult: 1.3, dmgMult: 1.2 },
        ],
      },
    ],
  },
  {
    id: 13,
    chapter: 3,
    name: '符阵合围',
    subtitle: '四象幽冥 · 弹幕破阵',
    badge: '四方弹幕',
    isBossStage: false,
    parTimeSec: 110,
    recommendedRealm: '元婴剑尊',
    hazard: 'ember',
    hazardLabel: '深渊地火',
    hazardIntervalSec: 5.2,
    hazardDamage: 26,
    introLine: '四方幽冥法尊结成天罗弹幕阵，走位游击逐个击杀！',
    victoryLine: '四象符阵全毁，锁妖深渊屏障洞开！',
    waves: [
      {
        label: '四象符阵',
        enemies: [
          { kind: 'caster', x: -6.2, z: -5.4, name: '青龙冥师', hpMult: 1.32, dmgMult: 1.22 },
          { kind: 'caster', x: 6.2, z: -5.4, name: '白虎冥师', hpMult: 1.32, dmgMult: 1.22 },
          { kind: 'caster', x: -4.2, z: -9.0, name: '朱雀冥师', hpMult: 1.32, dmgMult: 1.22 },
          { kind: 'caster', x: 4.2, z: -9.0, name: '玄武冥师', hpMult: 1.32, dmgMult: 1.22 },
        ],
      },
      {
        label: '镇阵铁壁',
        subtitle: '霸体巨将率疾风死士护阵反扑！',
        enemies: [
          { kind: 'elite', x: 0.0, z: -5.2, name: '镇阵铁将 · 不动', hpMult: 1.5, poiseMult: 1.35, dmgMult: 1.24, affix: 'ironclad' },
          { kind: 'bladesman', x: -4.6, z: -3.2, name: '疾风刺客', hpMult: 1.26, dmgMult: 1.22, affix: 'swift' },
          { kind: 'bladesman', x: 4.6, z: -3.2, name: '疾风刺客', hpMult: 1.26, dmgMult: 1.22, affix: 'swift' },
        ],
      },
    ],
  },
  {
    id: 14,
    chapter: 3,
    name: '锁妖双王',
    subtitle: '深渊双将 · 天剑破局',
    badge: '双将压境',
    isBossStage: false,
    parTimeSec: 120,
    recommendedRealm: '元婴剑尊',
    hazard: 'ember',
    hazardLabel: '深渊地火',
    hazardIntervalSec: 4.8,
    hazardDamage: 28,
    introLine: '炎狱双王同时出阵，蓄满天剑一举断其联手之势！',
    victoryLine: '双王齐陨，焚天剑圣已亲临火狱之巅！',
    waves: [
      {
        label: '深渊双王',
        enemies: [
          { kind: 'elite', x: -4.8, z: -5.4, name: '赤炎魔将 · 烈穹', hpMult: 1.48, dmgMult: 1.26, affix: 'storm', scaleMult: 1.06 },
          { kind: 'elite', x: 4.8, z: -5.4, name: '玄煞魔将 · 碎魂', hpMult: 1.48, dmgMult: 1.26, affix: 'vampiric', scaleMult: 1.06 },
          { kind: 'caster', x: 0.0, z: -8.8, name: '炎狱大祭司', hpMult: 1.38, dmgMult: 1.24 },
        ],
      },
    ],
  },
  {
    id: 15,
    chapter: 3,
    name: '焚天剑煞',
    subtitle: '第三章首领 · 炎狱妖王',
    badge: '章末 Boss',
    isBossStage: true,
    bossCutscene: true,
    parTimeSec: 140,
    recommendedRealm: '化神剑仙',
    hazard: 'ember',
    hazardLabel: '焚天火劫',
    hazardIntervalSec: 4.6,
    hazardDamage: 28,
    introLine: '炎狱妖王：「三百年地火淬剑，今日拿蜀山剑修试锋！」',
    victoryLine: '第三章通关！锁妖深渊烈焰平息，终极绝巅之路开启！',
    waves: [
      {
        label: '火狱禁卫',
        enemies: [
          { kind: 'bladesman', x: -4.5, z: -4.0, name: '焚天剑卫', hpMult: 1.36, dmgMult: 1.22, affix: 'swift' },
          { kind: 'bladesman', x: 4.5, z: -4.0, name: '焚天剑卫', hpMult: 1.36, dmgMult: 1.22, affix: 'vampiric' },
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
            hpMult: 1.42,
            poiseMult: 1.25,
            dmgMult: 1.26,
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
    name: '九幽玄阶',
    subtitle: '绝巅初阶 · 九幽劫雷',
    badge: '九幽天劫',
    isBossStage: false,
    parTimeSec: 120,
    recommendedRealm: '化神剑仙',
    hazard: 'abyss',
    hazardLabel: '九幽天劫',
    hazardIntervalSec: 4.2,
    hazardDamage: 30,
    introLine: '踏上九幽玄阶，天劫剑雷密布，唯有步步精准方能生还！',
    victoryLine: '九幽初阶告破，剑气直冲霄汉！',
    waves: [
      {
        label: '九幽铁卫',
        enemies: [
          { kind: 'bladesman', x: -5.0, z: -4.0, name: '九幽冥卒', hpMult: 1.5, dmgMult: 1.3, affix: 'swift' },
          { kind: 'bladesman', x: 5.0, z: -4.0, name: '九幽冥卒', hpMult: 1.5, dmgMult: 1.3, affix: 'ironclad' },
          { kind: 'caster', x: 0.0, z: -8.5, name: '九幽长老', hpMult: 1.48, dmgMult: 1.3 },
        ],
      },
      {
        label: '九幽血将',
        subtitle: '九幽血甲先锋率咒师合围！',
        enemies: [
          { kind: 'elite', x: 0.0, z: -5.6, name: '九幽镇将 · 绝尘', hpMult: 1.62, dmgMult: 1.32, affix: 'storm' },
          { kind: 'caster', x: -5.6, z: -7.2, name: '九幽长老', hpMult: 1.42, dmgMult: 1.28 },
          { kind: 'caster', x: 5.6, z: -7.2, name: '九幽长老', hpMult: 1.42, dmgMult: 1.28 },
        ],
      },
    ],
  },
  {
    id: 17,
    chapter: 4,
    name: '剑意试炼',
    subtitle: '极速剑道 · 生死一念',
    badge: '极速试炼',
    isBossStage: false,
    parTimeSec: 95,
    recommendedRealm: '化神剑仙',
    hazard: 'abyss',
    hazardLabel: '九幽天劫',
    hazardIntervalSec: 4.5,
    hazardDamage: 30,
    introLine: '极速剑道试炼：敌众身轻如电而攻势凌厉，一剑定生死！',
    victoryLine: '天下武功唯快不破，极速试炼完美通关！',
    waves: [
      {
        label: '影煞三剑',
        enemies: [
          { kind: 'bladesman', x: -5.2, z: -3.8, name: '瞬影剑鬼', hpMult: 1.15, dmgMult: 1.38, speedMult: 1.25, affix: 'swift' },
          { kind: 'bladesman', x: 0.0, z: -6.4, name: '瞬影剑鬼', hpMult: 1.15, dmgMult: 1.38, speedMult: 1.25, affix: 'swift' },
          { kind: 'bladesman', x: 5.2, z: -3.8, name: '瞬影剑鬼', hpMult: 1.15, dmgMult: 1.38, speedMult: 1.25, affix: 'swift' },
        ],
      },
      {
        label: '疾风双剑豪',
        subtitle: '双疾风剑豪袭来，完美弹反即可一击破势！',
        enemies: [
          { kind: 'elite', x: -4.4, z: -5.0, name: '追风剑豪 · 孤云', hpMult: 1.32, dmgMult: 1.36, speedMult: 1.22, affix: 'swift' },
          { kind: 'elite', x: 4.4, z: -5.0, name: '逐电剑豪 · 惊鸿', hpMult: 1.32, dmgMult: 1.36, speedMult: 1.22, affix: 'swift' },
        ],
      },
    ],
  },
  {
    id: 18,
    chapter: 4,
    name: '魔将车轮',
    subtitle: '三连首领 · 绝地突围',
    badge: '三波车轮',
    isBossStage: false,
    parTimeSec: 135,
    recommendedRealm: '化神剑仙',
    hazard: 'abyss',
    hazardLabel: '九幽天劫',
    hazardIntervalSec: 4.6,
    hazardDamage: 32,
    introLine: '九幽三魔将轮番出战，善用掉落灵葫与大招维持巅峰战力！',
    victoryLine: '连斩三员魔将，九幽绝巅已无阻隔！',
    waves: [
      {
        label: '第一阵 · 霸体魔将',
        enemies: [
          { kind: 'elite', x: 0.0, z: -5.4, name: '玄铁魔将 · 镇山', hpMult: 1.66, poiseMult: 1.4, dmgMult: 1.34, affix: 'ironclad' },
          { kind: 'caster', x: -5.4, z: -7.4, name: '九幽术尊', hpMult: 1.44, dmgMult: 1.3 },
        ],
      },
      {
        label: '第二阵 · 嗜血魔将',
        subtitle: '第二员魔将踏血而来，切勿贪刀！',
        enemies: [
          { kind: 'elite', x: 0.0, z: -5.4, name: '血海魔将 · 断肠', hpMult: 1.66, dmgMult: 1.36, affix: 'vampiric' },
          { kind: 'bladesman', x: 4.8, z: -3.6, name: '九幽死士', hpMult: 1.46, dmgMult: 1.3, affix: 'swift' },
        ],
      },
      {
        label: '第三阵 · 狂雷魔将',
        subtitle: '最后一员魔将引动天雷总攻！',
        enemies: [
          { kind: 'elite', x: 0.0, z: -5.4, name: '天劫魔将 · 灭世', hpMult: 1.74, dmgMult: 1.38, affix: 'storm' },
          { kind: 'caster', x: 5.4, z: -7.4, name: '九幽术尊', hpMult: 1.48, dmgMult: 1.32 },
        ],
      },
    ],
  },
  {
    id: 19,
    chapter: 4,
    name: '绝巅双魔',
    subtitle: '双首领同台 · 终局前夜',
    badge: '双 Boss 战',
    isBossStage: true,
    bossCutscene: false,
    parTimeSec: 150,
    recommendedRealm: '蜀山剑圣',
    hazard: 'abyss',
    hazardLabel: '九幽雷阵',
    hazardIntervalSec: 4.2,
    hazardDamage: 32,
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
            hpMult: 1.18,
            poiseMult: 1.18,
            dmgMult: 1.32,
            affix: 'swift',
            scaleMult: 0.92,
          },
          {
            kind: 'elite',
            x: 4.8,
            z: -4.8,
            name: '九幽右尊 · 陨月',
            hpMult: 1.85,
            poiseMult: 1.38,
            dmgMult: 1.34,
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
    name: '锁妖终劫',
    subtitle: '终极决战 · 镇狱天尊',
    badge: '终极 Boss',
    isBossStage: true,
    bossCutscene: true,
    parTimeSec: 165,
    recommendedRealm: '蜀山剑圣',
    hazard: 'abyss',
    hazardLabel: '灭世天劫',
    hazardIntervalSec: 3.9,
    hazardDamage: 34,
    introLine: '九幽剑煞·镇狱天尊：「能连闯十九重剑劫至此，你配见本尊真容！」',
    victoryLine: '二十重剑劫全破！九幽天尊伏诛，李逍遥威名震彻蜀山三界！',
    waves: [
      {
        label: '护台双剑卫',
        enemies: [
          { kind: 'elite', x: -4.6, z: -4.6, name: '天尊左卫 · 劫火', hpMult: 1.42, dmgMult: 1.3, affix: 'storm' },
          { kind: 'elite', x: 4.6, z: -4.6, name: '天尊右卫 · 冥冰', hpMult: 1.42, dmgMult: 1.3, affix: 'swift' },
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
            hpMult: 1.85,
            poiseMult: 1.45,
            dmgMult: 1.42,
            affix: 'storm',
            scaleMult: 1.08,
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
  };
}

export function applyBlessingToRun(state: RunBlessingState, blessing: BlessingDef): RunBlessingState {
  const next: RunBlessingState = {
    ids: [...state.ids, blessing.id],
    dmgMult: Number((state.dmgMult + (blessing.dmgBonus ?? 0)).toFixed(3)),
    maxHpBonus: state.maxHpBonus + (blessing.hpBonus ?? 0),
    speedMult: Number(Math.min(1.42, state.speedMult + (blessing.speedBonus ?? 0)).toFixed(3)),
    cdMult: Number(Math.max(0.5, state.cdMult * (1 - (blessing.cdReduce ?? 0))).toFixed(3)),
    ultGainMult: Number((state.ultGainMult + (blessing.ultBonus ?? 0)).toFixed(3)),
    extraGourds: state.extraGourds + (blessing.gourdBonus ?? 0),
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
  { title: '蜀山剑圣', minStars: 51, nextStars: null, hpBonus: 195, dmgMult: 1.90, spiritRegenMult: 1.72 },
];

export function getSwordRealm(totalStars: number): SwordRealmInfo {
  let cur = SWORD_REALMS[0];
  for (const r of SWORD_REALMS) {
    if (totalStars >= r.minStars) cur = r;
  }
  return cur;
}

export function evaluateStageStars(
  stage: StageDef,
  elapsedSec: number,
  hpRatio: number,
  parryCount: number,
): { stars: 1 | 2 | 3; checks: [boolean, boolean, boolean]; labels: [string, string, string] } {
  const c1 = true;
  const c2 = elapsedSec <= stage.parTimeSec;
  const c3 = hpRatio >= 0.5 || parryCount >= 2;
  const stars = (1 + (c2 ? 1 : 0) + (c3 ? 1 : 0)) as 1 | 2 | 3;
  return {
    stars,
    checks: [c1, c2, c3],
    labels: [
      `通关「${stage.name}」`,
      `用时 ≤ ${stage.parTimeSec} 秒（实测 ${Math.round(elapsedSec)} 秒）`,
      `剩余气血 ≥ 50% 或 弹反 ≥ 2 次`,
    ],
  };
}

const SAVE_KEY = 'shushan_lixiaoyao_campaign_v1';

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
          return {
            version: 1,
            cleared: parsed.cleared,
            lastPlayedStage: Math.max(1, Math.min(20, Number(parsed.lastPlayedStage || 1))),
          };
        }
      }
    } catch {
      // ignore storage failure in private mode
    }
    return { version: 1, cleared: {}, lastPlayedStage: 1 };
  }

  private persist(): void {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      // ignore quota failure
    }
  }

  recordClear(stageId: number, stars: 1 | 2 | 3, elapsedSec: number, maxCombo: number): void {
    const prev = this.data.cleared[stageId];
    this.data.cleared[stageId] = {
      stars: prev ? (Math.max(prev.stars, stars) as 1 | 2 | 3) : stars,
      bestTime: prev ? Math.min(prev.bestTime, elapsedSec) : elapsedSec,
      maxCombo: prev ? Math.max(prev.maxCombo, maxCombo) : maxCombo,
    };
    this.data.lastPlayedStage = Math.min(20, stageId + 1);
    this.persist();
  }

  setLastPlayed(stageId: number): void {
    this.data.lastPlayedStage = Math.max(1, Math.min(20, stageId));
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
    for (let s = 1; s <= 20; s++) {
      if (!this.data.cleared[s]) return s;
    }
    return 20;
  }

  getStageRecord(stageId: number): StageClearRecord | null {
    return this.data.cleared[stageId] ?? null;
  }
}

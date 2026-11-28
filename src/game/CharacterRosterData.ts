import { ENEMY_BASE_STATS } from './CombatEntities';
import { RARITY_LABELS } from './EquipmentData';
import { WORLD_BOSS_SPAWNS, type WorldBossDef } from './OpenWorldData';

export type CharacterCategory = 'hero' | 'ally' | 'boss';

export interface CharacterPhysicalStats {
  maxHp: number;
  atk: number;
  armor: number;
  dmgReducePct: number;
  poise: number;
  moveSpeed: number;
  attackReach: number;
  bodyRadius: number;
  critRatePct: number;
  critDmgPct: number;
  weightKg: number;
  heightCm: number;
}

export interface CharacterSkillEntry {
  name: string;
  tag?: string;
  desc: string;
}

export interface HeroExtendedStats {
  hp: number;
  maxHp: number;
  spirit: number;
  maxSpirit: number;
  stamina: number;
  maxStamina: number;
  combatPower: number;
  parryWindowMs: number;
  parryReflectPct: number;
  lifestealPct: number;
  cdReducePct: number;
  equippedNames: {
    weapon: string;
    armor: string;
    relic: string;
    skin: string;
  };
  orbHpBonus: number;
  cultivationSummary: string;
  totalKills: number;
}

export interface CharacterProfileDef {
  id: string;
  category: CharacterCategory;
  subGroup?: 'world_boss' | 'campaign_mob';
  name: string;
  title: string;
  faction: string;
  region: string;
  realm: string;
  badgeColor: string;
  portraitMonogram: string;
  weaponName?: string;
  affixLabel?: string;
  physical: CharacterPhysicalStats;
  skills: CharacterSkillEntry[];
  weakness: string;
  drops: string;
  lore: string;
  mapPos?: { x: number; z: number };
  mapLocKind?: 'world' | 'camp';
  liveHp?: number;
  liveMaxHp?: number;
  alive?: boolean;
  respawnRemainSec?: number;
  killCount?: number;
  defeated?: boolean;
  heroExtra?: HeroExtendedStats;
}

export interface RosterLiveSnapshot {
  hero: {
    hp: number;
    maxHp: number;
    spirit: number;
    maxSpirit: number;
    stamina: number;
    maxStamina: number;
    realmName: string;
    combatPower: number;
    atk: number;
    dmgReducePct: number;
    critRatePct: number;
    critDmgPct: number;
    moveSpeed: number;
    poise: number;
    parryWindowMs: number;
    parryReflectPct: number;
    lifestealPct: number;
    cdReducePct: number;
    equippedNames: { weapon: string; armor: string; relic: string; skin: string };
    orbHpBonus: number;
    cultivationSummary: string;
  };
  liveWorldBosses?: Record<string, { alive: boolean; hp: number; maxHp: number; respawnRemainSec: number }>;
  defeatedBossIds?: string[];
  totalKills?: number;
  inWorld?: boolean;
}

export interface HeroComparisonMetric {
  key: 'hp' | 'atk' | 'poise' | 'speed';
  label: string;
  targetText: string;
  heroText: string;
  deltaText: string;
  favor: 'hero' | 'even' | 'enemy';
}

export interface HeroComparisonResult {
  verdict: 'dominate' | 'even' | 'danger';
  verdictLabel: '可压制' | '势均力敌' | '强敌预警';
  targetPower: number;
  heroPower: number;
  powerRatio: number;
  metrics: HeroComparisonMetric[];
}

export const CHARACTER_CATEGORY_TABS: Array<{ id: CharacterCategory; label: string }> = [
  { id: 'hero', label: '主角详情' },
  { id: 'ally', label: '蜀山群侠' },
  { id: 'boss', label: '妖魔首领' },
];

const AFFIX_CN: Record<string, string> = {
  swift: '疾风',
  vampiric: '嗜血',
  ironclad: '霸体',
  storm: '狂雷',
};

/** Converts physical damage reduction % into an intuitive physical armor rating. */
export function estimateArmorRating(dmgReducePct: number): number {
  const clamped = Math.max(0, Math.min(80, dmgReducePct));
  const eff = clamped / Math.max(20, 100 - clamped);
  return Math.round(58 + clamped * 4.4 + eff * 165);
}

/** Estimates comparable combat power for non-hero characters on the same scale as Hero combatPower. */
export function estimateCharacterCombatPower(profile: CharacterProfileDef): number {
  if (profile.heroExtra) return Math.max(1, Math.round(profile.heroExtra.combatPower));
  const p = profile.physical;
  const effAtk = p.atk * 2.15 * (1 + (p.critRatePct / 100) * Math.max(0.2, p.critDmgPct / 100 - 1));
  const defFactor = 1 / Math.max(0.45, 1 - p.dmgReducePct / 100);
  const hpFactor = p.maxHp * 0.42 * defFactor;
  const poiseFactor = p.poise * 1.45;
  const spdFactor = p.moveSpeed * 16;
  return Math.round(hpFactor + effAtk * 3.2 + poiseFactor + spdFactor);
}

/** Builds the live dynamic profile for Protagonist 李逍遥 from live gameplay/save snapshot. */
export function buildLiveHeroProfile(
  liveHero: RosterLiveSnapshot['hero'],
  totalKills = 0,
): CharacterProfileDef {
  const safeMaxHp = Math.max(1, Math.round(liveHero.maxHp));
  const safeHp = Math.max(0, Math.min(safeMaxHp, Math.round(liveHero.hp)));
  const safeDmgReduce = Math.max(0, Math.min(75, Number(liveHero.dmgReducePct.toFixed(1))));
  const safeAtk = Math.max(1, Math.round(liveHero.atk));
  const safePoise = Math.max(20, Math.round(liveHero.poise));
  const safeSpeed = Number(Math.max(3, liveHero.moveSpeed).toFixed(1));
  const safeCritRate = Math.max(0, Math.round(liveHero.critRatePct));
  const safeCritDmg = Math.max(100, Math.round(liveHero.critDmgPct));

  return {
    id: 'char_xiaoyao',
    category: 'hero',
    name: '李逍遥',
    title: '逍遥剑仙 · 蜀山少侠',
    faction: '蜀山仙剑派',
    region: '蜀山云台 · 九州行侠',
    realm: liveHero.realmName || '炼气初境',
    badgeColor: '#4cd9d0',
    portraitMonogram: '李',
    weaponName: liveHero.equippedNames.weapon || '青钢古剑',
    physical: {
      maxHp: safeMaxHp,
      atk: safeAtk,
      armor: estimateArmorRating(safeDmgReduce),
      dmgReducePct: safeDmgReduce,
      poise: safePoise,
      moveSpeed: safeSpeed,
      attackReach: 3.55,
      bodyRadius: 0.52,
      critRatePct: safeCritRate,
      critDmgPct: safeCritDmg,
      weightKg: 66,
      heightCm: 178,
    },
    skills: [
      {
        name: '蜀山四段连剑',
        tag: '普攻连招',
        desc: '轻灵四式剑诀，第四式挥出破空飞剑印记，闪避后触发「破影追击」4.6m突刺。',
      },
      {
        name: '御剑术 · 追影二段',
        tag: '真气绝学',
        desc: '祭出飞剑穿透挂印，二段瞬间御影闪身突袭，高额破势并衔接连印体系。',
      },
      {
        name: '万剑诀 · 剑雨镇岳',
        tag: '范围破阵',
        desc: '召唤蜀山剑阵倾泻周身剑雨，群体削韧压制，对多敌围攻具备强控场力。',
      },
      {
        name: '天剑降世 · 三印归宗',
        tag: '终极奥义',
        desc: '剑意满盈时引九霄天剑贯地，集齐三枚剑印更可释放「万剑归宗」连携绝杀。',
      },
    ],
    weakness: '贪刀或体势耗尽时易遭霸体红圈重击，善用完美弹反与凌波闪避可化险为夷。',
    drops: '御剑乘风（移速×1.88）/ 踏云战马（移速×1.58）· 饮下酒仙葫芦即时回春续战。',
    lore:
      '余杭客栈出身的江湖少年，承酒剑仙司徒钟亲授蜀山御剑真传。一把青锋出云海，历锁妖塔妖劫、踏九州灵脉、问心太虚星海，于侠骨仁心与绝巅剑道之间闯出自己的逍遥剑途。',
    liveHp: safeHp,
    liveMaxHp: safeMaxHp,
    alive: safeHp > 0,
    killCount: totalKills,
    heroExtra: {
      hp: safeHp,
      maxHp: safeMaxHp,
      spirit: Math.round(liveHero.spirit),
      maxSpirit: Math.max(1, Math.round(liveHero.maxSpirit)),
      stamina: Math.round(liveHero.stamina),
      maxStamina: Math.max(1, Math.round(liveHero.maxStamina)),
      combatPower: Math.round(liveHero.combatPower),
      parryWindowMs: Math.round(liveHero.parryWindowMs),
      parryReflectPct: Math.round(liveHero.parryReflectPct),
      lifestealPct: Number(liveHero.lifestealPct.toFixed(1)),
      cdReducePct: Math.round(liveHero.cdReducePct),
      equippedNames: { ...liveHero.equippedNames },
      orbHpBonus: Math.round(liveHero.orbHpBonus),
      cultivationSummary: liveHero.cultivationSummary || '引气入体 · 凡心',
      totalKills,
    },
  };
}

const ALLY_PROFILES: CharacterProfileDef[] = [
  {
    id: 'npc_wine_master',
    category: 'ally',
    name: '酒剑仙 · 司徒钟',
    title: '云来剑庐师尊 · 御剑宗师',
    faction: '蜀山仙剑派 · 授业恩师',
    region: '云来剑庐（篝火石阶东侧）',
    realm: '化神剑仙',
    badgeColor: '#e5b85b',
    portraitMonogram: '酒',
    weaponName: '醉仙剑',
    physical: {
      maxHp: 620,
      atk: 78,
      armor: 196,
      dmgReducePct: 24,
      poise: 165,
      moveSpeed: 8.4,
      attackReach: 4.2,
      bodyRadius: 0.56,
      critRatePct: 32,
      critDmgPct: 195,
      weightKg: 74,
      heightCm: 183,
    },
    skills: [
      {
        name: '御剑术 · 逍遥剑意',
        tag: '宗师心法',
        desc: '以气驭剑、千里取首，一念化作凌霄剑光，乃李逍遥剑道启蒙之根本。',
      },
      {
        name: '酒神咒',
        tag: '禁忌秘术',
        desc: '倾尽琼浆化作漫天醉仙剑火，倾泻全身真气爆发毁天灭地一击。',
      },
      {
        name: '醉仙望月步',
        tag: '身法绝技',
        desc: '醉态步法飘忽难测，借力卸劲并于瞬息间连斩数剑，攻守浑然一体。',
      },
    ],
    weakness: '贪杯疏狂、不拘礼法，若遇佳酿美酒常先醉三分再拔剑。',
    drops: '【云来剑庐互动】走近师尊可领悟破境吐纳心法、开启突破修行并获取剑道点拨。',
    lore:
      '本名司徒钟，蜀山剑圣独孤宇云之师弟。性情豪放不羁，嗜酒如命却剑道通神，因感念李逍遥赤子侠心而倾囊相授御剑术，常驻云来剑庐提点弟子破境问道。',
    mapPos: { x: 3.65, z: -0.95 },
    mapLocKind: 'camp',
    alive: true,
  },
  {
    id: 'npc_xuanying',
    category: 'ally',
    name: '玄影师兄',
    title: '蜀山外门首席 · 联机同门',
    faction: '蜀山仙剑派 · 同门剑修',
    region: '云来剑庐（木人桩西侧）',
    realm: '金丹剑客',
    badgeColor: '#56d6b0',
    portraitMonogram: '玄',
    weaponName: '玄影青锋',
    physical: {
      maxHp: 340,
      atk: 54,
      armor: 148,
      dmgReducePct: 16,
      poise: 122,
      moveSpeed: 7.9,
      attackReach: 3.5,
      bodyRadius: 0.54,
      critRatePct: 22,
      critDmgPct: 168,
      weightKg: 68,
      heightCm: 180,
    },
    skills: [
      {
        name: '流云连剑',
        tag: '连击剑诀',
        desc: '行云流水般的五连斜劈，收招迅捷，极擅衔接队友控制集火破势。',
      },
      {
        name: '踏雪寻影',
        tag: '侧翼切入',
        desc: '疾步掠影绕至妖魔背后，专门针对后排幽冥符师与远攻妖道。',
      },
      {
        name: '双剑合璧',
        tag: '同门协战',
        desc: '联机并肩作战或切磋试剑时共振真气，迅速蓄满双方剑意槽。',
      },
    ],
    weakness: '重剑格挡消耗体势较快，正面硬抗巨神重击易陷入短暂失衡。',
    drops: '【云来剑庐互动】与玄影切磋可瞬间补满真气与剑意，检验木人桩三印连招。',
    lore:
      '蜀山外门众弟子中最稳重干练的剑修师兄，锁妖塔异变伊始便镇守山门石阶，一路为李逍遥掠阵报讯；亦是联机共斗与论剑切磋中最值得信赖的同门战友。',
    mapPos: { x: -3.55, z: -2.15 },
    mapLocKind: 'camp',
    alive: true,
  },
  {
    id: 'npc_linger',
    category: 'ally',
    name: '赵灵儿',
    title: '女娲后人 · 灵泉守护',
    faction: '南诏圣灵 · 仙灵岛',
    region: '仙灵岛 · 蜀山灵泉脉',
    realm: '元婴圣灵',
    badgeColor: '#67c8ff',
    portraitMonogram: '灵',
    weaponName: '天蛇杖',
    physical: {
      maxHp: 460,
      atk: 66,
      armor: 168,
      dmgReducePct: 20,
      poise: 118,
      moveSpeed: 7.6,
      attackReach: 9.5,
      bodyRadius: 0.48,
      critRatePct: 24,
      critDmgPct: 175,
      weightKg: 46,
      heightCm: 163,
    },
    skills: [
      {
        name: '风雪冰天',
        tag: '水灵大法',
        desc: '引动寒渊灵气化作漫天冰晶风暴，大范围冻结减速妖邪并削弱其攻势。',
      },
      {
        name: '五气朝元',
        tag: '圣灵回春',
        desc: '凝聚天地五灵生机，为周身同伴持续回复大量气血并驱散灼烧煞气。',
      },
      {
        name: '梦蛇 · 圣灵护佑',
        tag: '女娲血脉',
        desc: '觉醒女娲真灵护盾，大幅提升法术抗性与气血韧性，护佑苍生免受灾劫。',
      },
    ],
    weakness: '体魄偏柔，近身遭疾风系刺客贴脸打断施法时需剑修护法周全。',
    drops: '灵泉赐福羁绊：踏入战场灵泉阵即可恢复大量气血并净除负面蚀气。',
    lore:
      '自幼隐居仙灵岛水月宫的温婉少女，身负上古女娲族守护苍生之宿命。看似柔弱却外柔内刚，精研水、雷、风、土五灵仙法，其灵泉慈悲之力始终暗中庇佑着蜀山行者。',
    alive: true,
  },
  {
    id: 'npc_yueru',
    category: 'ally',
    name: '林月如',
    title: '林家堡千金 · 七诀剑气',
    faction: '江南武林 · 苏州林家堡',
    region: '苏州林家堡 · 九州侠游',
    realm: '元婴剑客',
    badgeColor: '#f082a8',
    portraitMonogram: '月',
    weaponName: '越女剑',
    physical: {
      maxHp: 410,
      atk: 72,
      armor: 152,
      dmgReducePct: 17,
      poise: 130,
      moveSpeed: 8.6,
      attackReach: 3.7,
      bodyRadius: 0.49,
      critRatePct: 38,
      critDmgPct: 205,
      weightKg: 49,
      heightCm: 167,
    },
    skills: [
      {
        name: '七诀剑气',
        tag: '家传绝剑',
        desc: '林家堡镇堡绝学，七道凌厉刚猛的横贯剑气连续斩出，暴击伤害极高。',
      },
      {
        name: '斩龙诀',
        tag: '破甲突刺',
        desc: '凝气于剑尖疾闪穿刺，专破玄铁重甲与妖魔护体霸体，一击定胜负。',
      },
      {
        name: '一阳指 · 乾坤一掷',
        tag: '豪侠奇招',
        desc: '劲气点穴破除妖术蓄力，危急关头掷出千金暗器轰碎敌阵护盾。',
      },
    ],
    weakness: '攻势凌厉果敢、宁折不弯，高风险强突时需留意自身回气节奏。',
    drops: '侠义传承：高暴击与轻功身法典范，启发「暴击流」与「疾风破甲」配装思路。',
    lore:
      '南武林盟主林天南独女，刁蛮任性却重情重义、侠气干云。一手越女剑与金蛇鞭法纵横江南，曾陪李逍遥闯荡锁妖塔生死不渝，立下「吃到老、玩到老」的江湖誓约。',
    alive: true,
  },
  {
    id: 'npc_jiansheng',
    category: 'ally',
    name: '独孤宇云 · 蜀山剑圣',
    title: '蜀山掌门 · 万剑宗师',
    faction: '蜀山仙剑派 · 掌门至尊',
    region: '蜀山无极阁 · 锁妖塔巅',
    realm: '蜀山剑圣',
    badgeColor: '#88d8ff',
    portraitMonogram: '圣',
    weaponName: '无尘圣剑',
    physical: {
      maxHp: 980,
      atk: 112,
      armor: 288,
      dmgReducePct: 36,
      poise: 260,
      moveSpeed: 8.8,
      attackReach: 5.0,
      bodyRadius: 0.58,
      critRatePct: 36,
      critDmgPct: 215,
      weightKg: 72,
      heightCm: 184,
    },
    skills: [
      {
        name: '万剑诀 · 蜀山极意',
        tag: '镇派剑阵',
        desc: '剑意化境，瞬息召唤千柄飞剑封锁天地，镇压锁妖塔群魔不敢越雷池半步。',
      },
      {
        name: '天剑降世 · 无我剑境',
        tag: '圣境奥义',
        desc: '人剑合一化身百丈金色天剑斩落苍穹，无视凡俗妖甲直击神魂本源。',
      },
      {
        name: '蜀山封魔印',
        tag: '护山禁制',
        desc: '布下先天八卦镇妖大阵，以无上定力与超凡韧性稳固九州灵脉封印。',
      },
    ],
    weakness: '以大局苍生为重、严守清规，少有情绪波澜，几乎不存在常规破绽。',
    drops: '剑圣指引：突破「蜀山剑圣」境界并集齐星辉可解锁终章太虚星海试炼。',
    lore:
      '蜀山仙剑派第二十六代掌门，修为已臻化境的当世绝顶剑仙。一生镇守锁妖塔与九州灵脉，以「得道者以天下苍生为念」为训，乃蜀山剑道威严与极致的化身。',
    alive: true,
  },
];

type WorldBossCoreFields = Pick<
  WorldBossDef,
  | 'name'
  | 'title'
  | 'regionName'
  | 'bossArchetype'
  | 'x'
  | 'z'
  | 'hpMult'
  | 'poiseMult'
  | 'dmgMult'
  | 'affix'
  | 'tier'
  | 'guaranteedMinRarity'
  | 'jadeReward'
  | 'respawnSec'
>;

interface WorldBossMeta {
  id: string;
  fallback: WorldBossCoreFields;
  realm: string;
  badgeColor: string;
  portraitMonogram: string;
  armorPct: number;
  critRatePct: number;
  critDmgPct: number;
  attackReach: number;
  scaleMult: number;
  heightCm: number;
  weightKg: number;
  skills: CharacterSkillEntry[];
  weakness: string;
  lore: string;
}

const WORLD_BOSS_META: WorldBossMeta[] = [
  {
    id: 'wb_phantom',
    fallback: {
      name: '青岚剑魔 · 浮生',
      title: '东岳剑翼魔尊',
      regionName: '翠竹桃源林',
      bossArchetype: 'phantom',
      x: 34,
      z: -32,
      hpMult: 1.55,
      poiseMult: 1.3,
      dmgMult: 1.28,
      affix: 'swift',
      tier: 1,
      guaranteedMinRarity: 'epic',
      jadeReward: 180,
      respawnSec: 42,
    },
    realm: '元婴魔尊',
    badgeColor: '#f5a2c4',
    portraitMonogram: '魔',
    armorPct: 16,
    critRatePct: 26,
    critDmgPct: 175,
    attackReach: 4.3,
    scaleMult: 1.0,
    heightCm: 218,
    weightKg: 112,
    skills: [
      {
        name: '瞬影斩 · 剑翼突袭',
        tag: '疾风闪现',
        desc: '化作青岚残影瞬间近身斜斩，起手极快，附带「疾风」移速与攻频增益。',
      },
      {
        name: '万花剑刃风暴',
        tag: '环身剑舞',
        desc: '张开背后魔剑双翼旋转卷起剑气龙卷，覆盖周身近中距离范围。',
      },
      {
        name: '浮生穿心刺',
        tag: '长距突刺',
        desc: '蓄力锁定后直线突进，若被完美弹反则会立刻暴露大段硬直破绽。',
      },
    ],
    weakness: '架势韧性在五方首领中偏低，抓住瞬影落地与直刺红光弹反即可速破其势。',
    lore:
      '原为坠落东岳桃林的上古散修剑客，因执念成魔而以妖气凝成青岚剑翼。常年盘踞十里桃源深处，凡踏入花海的修仙者皆须接其三式疾风快剑。',
  },
  {
    id: 'wb_titan',
    fallback: {
      name: '玄冥泰坦 · 镇山巨神',
      title: '西陲重甲巨神',
      regionName: '古剑残碑原',
      bossArchetype: 'titan',
      x: -36,
      z: -32,
      hpMult: 1.8,
      poiseMult: 1.55,
      dmgMult: 1.34,
      affix: 'ironclad',
      tier: 2,
      guaranteedMinRarity: 'epic',
      jadeReward: 220,
      respawnSec: 45,
    },
    realm: '化神魔将',
    badgeColor: '#b88cff',
    portraitMonogram: '泰',
    armorPct: 34,
    critRatePct: 14,
    critDmgPct: 160,
    attackReach: 5.4,
    scaleMult: 1.14,
    heightCm: 345,
    weightKg: 680,
    skills: [
      {
        name: '裂地玄冥震环',
        tag: '危 · 不可格挡',
        desc: '巨兵轰击古剑原地面激起 8.2m 扩散震荡波，必须依靠闪避无敌帧跃离。',
      },
      {
        name: '镇山重劈',
        tag: '巨力横扫',
        desc: '裹挟万钧石甲之力重锤砸落，单击伤害极高，但前摇沉重可读。',
      },
      {
        name: '霸体玄钢护身',
        tag: '霸体词缀',
        desc: '【霸体】使架势韧性暴增 38%，轻击难以打断其蓄力动作。',
      },
    ],
    weakness: '身法移速迟缓、攻击前摇长；善用重剑/天剑破势与绕背输出可稳稳克制。',
    lore:
      '吸纳西陲古剑冢千载残兵煞气凝成的重甲石魄巨神。步履所至山石崩裂，唯有兼具精准闪避与高破势输出之剑修方能撼动其不动如山之躯。',
  },
  {
    id: 'wb_inferno',
    fallback: {
      name: '焚穹炎龙将 · 烈煞',
      title: '南冥地火妖王',
      regionName: '赤焰熔岩谷',
      bossArchetype: 'inferno',
      x: -34,
      z: 32,
      hpMult: 2.0,
      poiseMult: 1.5,
      dmgMult: 1.46,
      affix: 'vampiric',
      tier: 2,
      guaranteedMinRarity: 'epic',
      jadeReward: 260,
      respawnSec: 48,
    },
    realm: '化神妖王',
    badgeColor: '#ff7a48',
    portraitMonogram: '炎',
    armorPct: 26,
    critRatePct: 22,
    critDmgPct: 185,
    attackReach: 4.8,
    scaleMult: 1.08,
    heightCm: 276,
    weightKg: 295,
    skills: [
      {
        name: '地火熔穹喷发',
        tag: '火域爆裂',
        desc: '引动南冥熔岩地脉于脚下接连喷吐炎柱，炽热余波封锁站桩走位。',
      },
      {
        name: '炎龙焚天连弹',
        tag: '远程火煞',
        desc: '连射多枚炽焰阴火球，可用普攻剑锋精准劈斩反弹回击。',
      },
      {
        name: '嗜血龙焰',
        tag: '嗜血词缀',
        desc: '【嗜血】命中目标时汲取气血回复自身，久拖不决极易功亏一篑。',
      },
    ],
    weakness: '切忌在其熔岩区域硬吃伤害触发嗜血回血；反弹火球叠加高爆发速战速决。',
    lore:
      '蛰伏于南冥赤焰熔岩谷深处的火龙古将，铠甲流淌不熄岩浆。凡被其龙焰灼伤者皆会被夺取生机反哺妖躯，是九州南境最棘手的嗜血强敌。',
  },
  {
    id: 'wb_celestial',
    fallback: {
      name: '九幽雷帝 · 劫天尊',
      title: '九霄星穹魔神',
      regionName: '星穹天坛遗迹',
      bossArchetype: 'celestial',
      x: 36,
      z: 32,
      hpMult: 2.35,
      poiseMult: 1.72,
      dmgMult: 1.58,
      affix: 'storm',
      tier: 3,
      guaranteedMinRarity: 'epic',
      jadeReward: 340,
      respawnSec: 52,
    },
    realm: '渡劫魔神',
    badgeColor: '#7ed8ff',
    portraitMonogram: '雷',
    armorPct: 30,
    critRatePct: 28,
    critDmgPct: 195,
    attackReach: 5.2,
    scaleMult: 1.1,
    heightCm: 292,
    weightKg: 240,
    skills: [
      {
        name: '十字天雷光束',
        tag: '星坛绝杀',
        desc: '悬空凝结十字雷霆激光扫荡星穹古坛，射程高达 15m，需贴侧角规避。',
      },
      {
        name: '九霄星陨雷雨',
        tag: '大范围轰击',
        desc: '接连降下紫青劫雷陨星轰击战场，并附带【狂雷】范围震荡波。',
      },
      {
        name: '雷帝御剑风暴',
        tag: '二阶段狂暴',
        desc: '半血入二阶后移速飙升至 6.2m/s，连招衔接更加紧密迅烈。',
      },
    ],
    weakness: '十字雷束与陨雷读条期间侧翼空档明显，以御剑追影贴身爆发打断节奏。',
    lore:
      '统御九霄星穹天坛的雷霆魔神，自称执掌九州天劫。周身悬浮玄雷星环，每逢雷云压顶便降下劫罚考验登坛剑修，击败后有极高几率掉落仙品神兵。',
  },
  {
    id: 'wb_crypt',
    fallback: {
      name: '幽冥地煞 · 镇窟剑君',
      title: '北溟古窟冥尊',
      regionName: '幽冥古地窟',
      bossArchetype: 'phantom',
      x: 0,
      z: -61,
      hpMult: 2.55,
      poiseMult: 1.82,
      dmgMult: 1.66,
      affix: 'vampiric',
      tier: 3,
      guaranteedMinRarity: 'legendary',
      jadeReward: 420,
      respawnSec: 56,
    },
    realm: '万剑归宗 · 五境',
    badgeColor: '#66e6c4',
    portraitMonogram: '煞',
    armorPct: 32,
    critRatePct: 30,
    critDmgPct: 205,
    attackReach: 4.8,
    scaleMult: 1.12,
    heightCm: 268,
    weightKg: 215,
    skills: [
      {
        name: '幽冥鬼影绝杀',
        tag: '地窟瞬斩',
        desc: '借古地窟阴寒地脉化影瞬移，双剑齐出斩裂虚空，附带极高暴击压迫。',
      },
      {
        name: '镇窟阴风剑阵',
        tag: '寒煞风暴',
        desc: '召唤北溟守陵剑气环绕祭坛疾旋，重创所有未能及时抽身的闯入者。',
      },
      {
        name: '古陵冥火噬血',
        tag: '嗜血词缀',
        desc: '历经千年幽冥阴火淬炼，兼具极速剑影与【嗜血】续航，需精准弹反打断连击。',
      },
    ],
    weakness: '虽攻防俱绝且附带嗜血冥火，但鬼影突袭落点固定于侠客身后，预判转身弹反可一举破势！',
    lore:
      '太古时代奉命镇守北溟地窟的蜀山弃尊，千年幽冥阴火淬炼其剑魄，唯有登峰剑侠可斩其心魔、夺取仙品秘宝。',
  },
];

function buildWorldBossProfile(
  meta: WorldBossMeta,
  snapshot: RosterLiveSnapshot,
): CharacterProfileDef {
  const foundDef = WORLD_BOSS_SPAWNS.find((b) => b.id === meta.id);
  const liveDef: WorldBossCoreFields = foundDef ?? meta.fallback;
  const affix = liveDef.affix;
  const ironcladMult = affix === 'ironclad' ? 1.38 : 1.0;
  const swiftMult = affix === 'swift' ? 1.22 : 1.0;

  const baseHp = Math.round(ENEMY_BASE_STATS.boss.hp * liveDef.hpMult);
  const baseAtk = Math.round(ENEMY_BASE_STATS.boss.atk * liveDef.dmgMult);
  const basePoise = Math.round(ENEMY_BASE_STATS.boss.poise * liveDef.poiseMult * ironcladMult);
  const moveSpeed = Number((5.1 * swiftMult).toFixed(1));
  const bodyRadius = Number((0.96 * Math.min(1.18, Math.max(0.88, meta.scaleMult))).toFixed(2));

  const liveState = snapshot.liveWorldBosses?.[meta.id];
  const defeated = snapshot.defeatedBossIds?.includes(meta.id) ?? false;
  const minRarityLabel = RARITY_LABELS[liveDef.guaranteedMinRarity] ?? '玄品';

  return {
    id: meta.id,
    category: 'boss',
    subGroup: 'world_boss',
    name: liveDef.name,
    title: liveDef.title,
    faction: '九州妖魔 · 世界首领',
    region: liveDef.regionName,
    realm: foundDef?.recommendedRealm || meta.realm,
    badgeColor: meta.badgeColor,
    portraitMonogram: meta.portraitMonogram,
    affixLabel: AFFIX_CN[affix] ?? affix,
    physical: {
      maxHp: liveState?.maxHp ? Math.round(liveState.maxHp) : baseHp,
      atk: baseAtk,
      armor: estimateArmorRating(meta.armorPct),
      dmgReducePct: meta.armorPct,
      poise: basePoise,
      moveSpeed,
      attackReach: meta.attackReach,
      bodyRadius,
      critRatePct: meta.critRatePct,
      critDmgPct: meta.critDmgPct,
      weightKg: meta.weightKg,
      heightCm: meta.heightCm,
    },
    skills: meta.skills,
    weakness: foundDef?.desc ? `${foundDef.desc} ${meta.weakness}` : meta.weakness,
    drops: `必掉【${minRarityLabel}】及以上神兵法宝 · 击杀赏金 +${liveDef.jadeReward} 灵石 · 约 ${liveDef.respawnSec}s 重生`,
    lore: foundDef?.lore || meta.lore,
    mapPos: { x: liveDef.x, z: liveDef.z },
    mapLocKind: 'world',
    liveHp: liveState ? Math.round(liveState.hp) : baseHp,
    liveMaxHp: liveState ? Math.round(liveState.maxHp) : baseHp,
    alive: liveState ? liveState.alive : true,
    respawnRemainSec: liveState ? Math.max(0, Math.ceil(liveState.respawnRemainSec)) : 0,
    defeated,
  };
}

function buildAdditionalEnemyProfiles(snapshot: RosterLiveSnapshot): CharacterProfileDef[] {
  const goblinState = snapshot.liveWorldBosses?.['event_goblin'];
  const goblinHp = Math.round(ENEMY_BASE_STATS.elite.hp * 1.15);
  const goblinAtk = Math.round(ENEMY_BASE_STATS.elite.atk * 0.8);
  const goblinPoise = ENEMY_BASE_STATS.elite.poise;
  const goblinSpeed = Number((5.2 * 1.38 * 1.22).toFixed(1));
  const goblinRadius = Number((0.72 * 0.92).toFixed(2));

  // Campaign Final Lock-Demon Boss (Stage 20 九幽剑煞 · 镇狱天尊/妖王)
  const suoyaoHp = Math.round(ENEMY_BASE_STATS.boss.hp * 2.26);
  const suoyaoAtk = Math.round(ENEMY_BASE_STATS.boss.atk * 1.68);
  const suoyaoPoise = Math.round(ENEMY_BASE_STATS.boss.poise * 1.74);
  const suoyaoRadius = Number((0.96 * 1.08).toFixed(2));

  return [
    {
      id: 'event_goblin',
      category: 'boss',
      subGroup: 'world_boss',
      name: '赤金宝妖 · 携宝仙童',
      title: '九州奇遇妖童',
      faction: '九州奇遇 · 秘宝精怪',
      region: '九州四域随机现身',
      realm: '灵宝精怪',
      badgeColor: '#ffd452',
      portraitMonogram: '宝',
      affixLabel: '疾风',
      physical: {
        maxHp: goblinState?.maxHp ? Math.round(goblinState.maxHp) : goblinHp,
        atk: goblinAtk,
        armor: estimateArmorRating(12),
        dmgReducePct: 12,
        poise: goblinPoise,
        moveSpeed: goblinSpeed,
        attackReach: 3.1,
        bodyRadius: goblinRadius,
        critRatePct: 18,
        critDmgPct: 155,
        weightKg: 42,
        heightCm: 136,
      },
      skills: [
        {
          name: '疾风遁走',
          tag: '限时34秒',
          desc: '身法高达 8.8m/s，现身九州 34 秒后即遁空逃逸，须趁早追击截杀。',
        },
        {
          name: '赤金宝囊震',
          tag: '低伤骚扰',
          desc: '挥舞满载仙玉神兵的锦囊反击，攻击偏低但极善游走缠斗。',
        },
      ],
      weakness: '攻击力薄弱且护甲较低，直接驾驭飞剑追近并以「御剑术追影」粘打即可轻松拿下！',
      drops: '限时奇遇大奖：必掉高阶随机词条神兵/战甲/法宝 + 丰厚灵石！',
      lore:
        '背负赤金聚宝囊游荡九州灵脉的调皮宝妖，每隔片刻便携奇珍异宝现身四域林原。因其脚底抹油疾步如飞，寻常修士难窥其影。',
      mapPos: { x: 18, z: -18 },
      mapLocKind: 'world',
      liveHp: goblinState ? Math.round(goblinState.hp) : goblinHp,
      liveMaxHp: goblinState ? Math.round(goblinState.maxHp) : goblinHp,
      alive: goblinState ? goblinState.alive : false,
      respawnRemainSec: goblinState ? Math.max(0, Math.ceil(goblinState.respawnRemainSec)) : 0,
    },
    {
      id: 'boss_suoyao',
      category: 'boss',
      subGroup: 'campaign_mob',
      name: '九幽剑煞 · 镇狱妖王',
      title: '锁妖塔战役镇关魔尊',
      faction: '锁妖塔 · 九幽魔众',
      region: '第四章 · 九幽绝巅（第20关）',
      realm: '镇狱天尊',
      badgeColor: '#ff4f64',
      portraitMonogram: '狱',
      affixLabel: '狂雷',
      physical: {
        maxHp: suoyaoHp,
        atk: suoyaoAtk,
        armor: estimateArmorRating(32),
        dmgReducePct: 32,
        poise: suoyaoPoise,
        moveSpeed: 6.2,
        attackReach: 5.4,
        bodyRadius: suoyaoRadius,
        critRatePct: 28,
        critDmgPct: 200,
        weightKg: 310,
        heightCm: 318,
      },
      skills: [
        {
          name: '九幽灭世天劫',
          tag: '危 · 终极天雷',
          desc: '引动锁妖塔积蓄百年的灭世雷渊，十字光束与陨星雷雨交替倾泻。',
        },
        {
          name: '镇狱魔剑连斩',
          tag: '狂暴追击',
          desc: '二阶段化作血雷魔影疾速连劈，每一击皆带【狂雷】震荡余波。',
        },
        {
          name: '阴冥锁魂圈',
          tag: '领域压迫',
          desc: '脚下凝结紫红死域爆发重击，迫使对手必须精准掌控闪避与弹反时机。',
        },
      ],
      weakness: '二阶段狂暴攻势虽猛，但横斩收招与雷束间隙皆可精准弹反破势，一举灌伤！',
      drops: '通关解锁终章【太虚仙域】、巨额灵石与高阶仙品掉落，铭刻蜀山丰碑。',
      lore:
        '汇聚锁妖塔底层历代妖王与魔剑残灵而生的绝世煞尊。趁封印松动破塔登台，誓要覆灭蜀山道统，乃二十重剑劫战役的终极试金石。',
      alive: true,
      defeated: snapshot.defeatedBossIds?.includes('boss_suoyao') ?? false,
    },
    {
      id: 'mob_bladesman',
      category: 'boss',
      subGroup: 'campaign_mob',
      name: '青冥剑奴',
      title: '妖族近战剑兵（玄铁魔兵）',
      faction: '锁妖塔外围 · 妖兵先锋',
      region: '蜀山山门 · 九州营地',
      realm: '妖卒初阶',
      badgeColor: '#9ab0c8',
      portraitMonogram: '卒',
      physical: {
        maxHp: ENEMY_BASE_STATS.bladesman.hp,
        atk: ENEMY_BASE_STATS.bladesman.atk,
        armor: estimateArmorRating(8),
        dmgReducePct: 8,
        poise: ENEMY_BASE_STATS.bladesman.poise,
        moveSpeed: 4.8,
        attackReach: 2.85,
        bodyRadius: 0.58,
        critRatePct: 8,
        critDmgPct: 145,
        weightKg: 76,
        heightCm: 179,
      },
      skills: [
        {
          name: '青冥横斩',
          tag: '近战劈砍',
          desc: '标准近身扇形劈砍，红光起手清晰，最适合作为弹反节奏热身目标。',
        },
        {
          name: '疾步合围',
          tag: '群体协同',
          desc: '常三两成群包抄游走，伺机前后夹击消耗体势。',
        },
      ],
      weakness: '气血与韧性偏低，单次完美弹反或四段连剑即可瞬间击破处决。',
      drops: '灵石微尘、连击印记充能与战役通关进度。',
      lore:
        '受锁妖塔外泄妖气侵蚀心智的青冥剑卒，手持玄铁长刃沿山门石阶与九州哨所结阵巡弋，数量众多但招路直白。',
      alive: true,
    },
    {
      id: 'mob_caster',
      category: 'boss',
      subGroup: 'campaign_mob',
      name: '妖道术士',
      title: '幽冥咒法术师（幽冥玄道）',
      faction: '锁妖塔 · 幽冥符阵',
      region: '翠竹云溪 · 九州营地',
      realm: '妖术散修',
      badgeColor: '#c084ff',
      portraitMonogram: '术',
      physical: {
        maxHp: ENEMY_BASE_STATS.caster.hp,
        atk: ENEMY_BASE_STATS.caster.atk,
        armor: estimateArmorRating(6),
        dmgReducePct: 6,
        poise: ENEMY_BASE_STATS.caster.poise,
        moveSpeed: 4.4,
        attackReach: 14.0,
        bodyRadius: 0.58,
        critRatePct: 14,
        critDmgPct: 155,
        weightKg: 62,
        heightCm: 175,
      },
      skills: [
        {
          name: '幽冥阴煞球',
          tag: '14m远攻 · 可弹反',
          desc: '保持 8.2m 距离远程施放暗紫灵球，可用剑锋挥斩直接反弹回击施法者！',
        },
        {
          name: '蚀骨咒环',
          tag: '延时阵爆',
          desc: '于目标脚下绘制 3.1m 紫焰法阵，延时引爆造成范围法术伤害。',
        },
      ],
      weakness: '全阵营气血与韧性最低（仅 165 HP / 46 韧性），御剑突脸或反弹阴球即可秒杀。',
      drops: '灵石与回气补给；优先清除可极大减轻群战远程压力。',
      lore:
        '堕入魔道的幽冥符咒术师，擅长隐于重甲护卫之后吟诵阴煞法阵，唯有果断切入后排或劈返法球方能破其阵势。',
      alive: true,
    },
    {
      id: 'mob_elite',
      category: 'boss',
      subGroup: 'campaign_mob',
      name: '魔教铁卫',
      title: '重甲破阵精锐（血甲剑魔）',
      faction: '魔教精锐 · 护阵重将',
      region: '古剑荒冢 · 九州哨所',
      realm: '金丹魔将',
      badgeColor: '#e86f52',
      portraitMonogram: '卫',
      physical: {
        maxHp: ENEMY_BASE_STATS.elite.hp,
        atk: ENEMY_BASE_STATS.elite.atk,
        armor: estimateArmorRating(22),
        dmgReducePct: 22,
        poise: ENEMY_BASE_STATS.elite.poise,
        moveSpeed: 5.2,
        attackReach: 3.4,
        bodyRadius: 0.72,
        critRatePct: 16,
        critDmgPct: 165,
        weightKg: 138,
        heightCm: 210,
      },
      skills: [
        {
          name: '血甲重斩',
          tag: '破防重击',
          desc: '大开大合的 3.4m 扇形重劈，常附带霸体、嗜血或狂雷词缀。',
        },
        {
          name: '铁卫震地砸击',
          tag: '4.2m范围',
          desc: '跃起重锤砸落地面震开周身敌手，破势值高，需把握闪避或弹反窗口。',
        },
      ],
      weakness: '身躯沉重、连招间隙较长；弹反破势后极易吃满整套「万剑诀」爆发。',
      drops: '高额灵石与进阶装备词条掉落，乃各营地核心精英头目。',
      lore:
        '身披百炼玄铁重甲的魔教精锐护卫，体格魁梧、架势厚重，常作为营地统领与双煞护法镇守要冲。',
      alive: true,
    },
  ];
}

/** Builds the complete live roster with Hero, Allies, World Bosses, Campaign Boss, and Mobs. */
export function buildCharacterRoster(snapshot: RosterLiveSnapshot): CharacterProfileDef[] {
  const heroProfile = buildLiveHeroProfile(snapshot.hero, snapshot.totalKills ?? 0);
  const worldBosses = WORLD_BOSS_META.map((meta) => buildWorldBossProfile(meta, snapshot));
  const extraEnemies = buildAdditionalEnemyProfiles(snapshot);
  return [heroProfile, ...ALLY_PROFILES, ...worldBosses, ...extraEnemies];
}

/** Compares any NPC/Enemy/Boss physical attributes & power directly against Li Xiaoyao's live stats. */
export function compareWithHero(
  target: CharacterProfileDef,
  heroProfile: CharacterProfileDef,
): HeroComparisonResult {
  const heroPower = Math.max(1, estimateCharacterCombatPower(heroProfile));
  const targetPower = Math.max(1, estimateCharacterCombatPower(target));
  const powerRatio = Number((targetPower / heroPower).toFixed(2));

  let verdict: HeroComparisonResult['verdict'];
  let verdictLabel: HeroComparisonResult['verdictLabel'];
  if (powerRatio <= 0.85) {
    verdict = 'dominate';
    verdictLabel = '可压制';
  } else if (powerRatio <= 1.25) {
    verdict = 'even';
    verdictLabel = '势均力敌';
  } else {
    verdict = 'danger';
    verdictLabel = '强敌预警';
  }

  const h = heroProfile.physical;
  const t = target.physical;

  const hpRatio = t.maxHp / Math.max(1, h.maxHp);
  const atkDiff = t.atk - h.atk;
  const poiseDiff = t.poise - h.poise;
  const spdDiff = Number((t.moveSpeed - h.moveSpeed).toFixed(1));

  const metrics: HeroComparisonMetric[] = [
    {
      key: 'hp',
      label: '气血对比',
      targetText: `${t.maxHp}`,
      heroText: `${h.maxHp}`,
      deltaText: hpRatio >= 1 ? `${hpRatio.toFixed(1)}× 敌厚` : `${hpRatio.toFixed(1)}× 我优`,
      favor: hpRatio <= 0.95 ? 'hero' : hpRatio <= 1.65 ? 'even' : 'enemy',
    },
    {
      key: 'atk',
      label: '物攻对比',
      targetText: `${t.atk}`,
      heroText: `${h.atk}`,
      deltaText: atkDiff === 0 ? '持平' : atkDiff > 0 ? `敌 +${atkDiff}` : `我 +${Math.abs(atkDiff)}`,
      favor: atkDiff <= -4 ? 'hero' : atkDiff <= 8 ? 'even' : 'enemy',
    },
    {
      key: 'poise',
      label: '韧性对比',
      targetText: `${t.poise}`,
      heroText: `${h.poise}`,
      deltaText: poiseDiff === 0 ? '持平' : poiseDiff > 0 ? `敌 +${poiseDiff}` : `我 +${Math.abs(poiseDiff)}`,
      favor: poiseDiff <= -10 ? 'hero' : poiseDiff <= 40 ? 'even' : 'enemy',
    },
    {
      key: 'speed',
      label: '身法移速',
      targetText: `${t.moveSpeed.toFixed(1)}m/s`,
      heroText: `${h.moveSpeed.toFixed(1)}m/s`,
      deltaText:
        Math.abs(spdDiff) < 0.15
          ? '持平'
          : spdDiff > 0
            ? `敌快 +${spdDiff.toFixed(1)}`
            : `我快 +${Math.abs(spdDiff).toFixed(1)}`,
      favor: spdDiff <= -0.2 ? 'hero' : spdDiff <= 0.4 ? 'even' : 'enemy',
    },
  ];

  return {
    verdict,
    verdictLabel,
    targetPower,
    heroPower,
    powerRatio,
    metrics,
  };
}

const CHAR_ID_ALIASES: Record<string, string> = {
  xiaoyao: 'char_xiaoyao',
  hero: 'char_xiaoyao',
  li_xiaoyao: 'char_xiaoyao',
  wine: 'npc_wine_master',
  wine_master: 'npc_wine_master',
  jiujianxian: 'npc_wine_master',
  ally: 'npc_xuanying',
  xuanying: 'npc_xuanying',
  linger: 'npc_linger',
  yueru: 'npc_yueru',
  jiansheng: 'npc_jiansheng',
  phantom: 'wb_phantom',
  titan: 'wb_titan',
  inferno: 'wb_inferno',
  celestial: 'wb_celestial',
  crypt: 'wb_crypt',
  goblin: 'event_goblin',
  boss: 'boss_suoyao',
  suoyao: 'boss_suoyao',
  taixu: 'boss_suoyao',
  bladesman: 'mob_bladesman',
  caster: 'mob_caster',
  elite: 'mob_elite',
};

/** Resolves exact or shorthand character IDs cleanly to a valid roster profile ID. */
export function resolveCharacterProfileId(rawId?: string): string {
  if (!rawId) return 'char_xiaoyao';
  const trimmed = rawId.trim();
  if (!trimmed) return 'char_xiaoyao';
  const lower = trimmed.toLowerCase();
  return CHAR_ID_ALIASES[lower] ?? trimmed;
}

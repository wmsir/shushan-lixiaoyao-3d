import type { BossArchetype } from '../entities/CharacterRig';
import type { EnemyAffix, EnemyKind } from './CampaignData';
import type { EquipRarity } from './EquipmentData';
import type { WorldBiome } from '../world/ShushanArena';

export const WORLD_BOUND = 78;

export type WorldRegionId = 'center' | 'peach' | 'grave' | 'lava' | 'star' | 'crypt';

export interface WorldRegionDef {
  id: WorldRegionId;
  name: string;
  shortName: string;
  subtitle: string;
  biome: WorldBiome;
  centerX: number;
  centerZ: number;
  accentHex: string;
  lore: string;
  desc: string;
  recommendedRealm: string;
}

export const WORLD_REGIONS: WorldRegionDef[] = [
  {
    id: 'center',
    name: '蜀山云台 · 九州枢纽',
    shortName: '蜀山中枢',
    subtitle: '中枢传送阵 · 九州灵脉总纲',
    biome: 'bamboo_canyon',
    centerX: 0,
    centerZ: 0,
    accentHex: '#63d8c6',
    lore: '蜀山历代剑尊布设八方灵枢之所，五道青石古驿由此辐射九州，云海翻涌间可御剑远眺群峰。',
    desc: '九州灵脉汇流的安全中枢，连通东岳桃源、西陲剑冢、南冥熔谷、九霄星坛与北溟幽冥地窟。',
    recommendedRealm: '剑心初醒 · 初入江湖',
  },
  {
    id: 'peach',
    name: '东岳 · 翠竹桃源林',
    shortName: '东岳桃源',
    subtitle: '御风赏桃 · 青岚剑阵',
    biome: 'peach_shrine',
    centerX: 46,
    centerZ: -44,
    accentHex: '#f5a2c4',
    lore: '十里芳菲掩映苍翠竹海，昔年剑修隐居问道之处，如今却被青岚剑魔以花影剑阵占据。',
    desc: '落英缤纷的东方仙林，游妖哨所与灵宝匣散落花径之间，适合初试御剑驰骋。',
    recommendedRealm: '剑气初成 · 一境',
  },
  {
    id: 'grave',
    name: '西陲 · 古剑残碑原',
    shortName: '西陲剑冢',
    subtitle: '万剑归冢 · 泰坦镇守',
    biome: 'sword_graveyard',
    centerX: -48,
    centerZ: -44,
    accentHex: '#b88cff',
    lore: '上古伏魔大战遗留的万剑荒原，巨刃斜插断碑之间，残余剑魂常在月夜低鸣不息。',
    desc: '紫雾弥漫的西境荒冢，重甲玄冥泰坦与断碑铁骑在此巡弋，宜借弹反破其厚重架势。',
    recommendedRealm: '御剑破风 · 二境',
  },
  {
    id: 'lava',
    name: '南冥 · 赤焰熔岩谷',
    shortName: '南冥熔谷',
    subtitle: '熔岩炙地 · 宜御剑飞越',
    biome: 'lava_abyss',
    centerX: -46,
    centerZ: 44,
    accentHex: '#ff7a48',
    lore: '地肺火脉裂隙所化的焦土熔池，赤炎终年不熄，唯有踏剑凌空方可无伤渡过滚烫火海。',
    desc: '地火翻涌的南境险谷，步入熔池会持续灼伤，请御剑飞上玄岩祭坛迎战炎龙妖将。',
    recommendedRealm: '紫霄灵剑 · 三境',
  },
  {
    id: 'star',
    name: '九霄 · 星穹天坛遗迹',
    shortName: '九霄星坛',
    subtitle: '星环悬空 · 雷帝伏魔',
    biome: 'celestial_sanctum',
    centerX: 48,
    centerZ: 44,
    accentHex: '#7ed8ff',
    lore: '悬立云巅的观星古坛，六尊星辉玉柱引动天雷紫电，传说乃是通往太虚仙界的前哨。',
    desc: '雷霆环绕的东南高坛，九幽雷帝与星穹祭司盘踞其中，击败可获高阶天坛玄玉重宝。',
    recommendedRealm: '天人合一 · 四境',
  },
  {
    id: 'crypt',
    name: '北溟 · 幽冥古地窟',
    shortName: '北溟地窟',
    subtitle: '玄石冥门 · 镇窟剑君',
    biome: 'astral_void',
    centerX: 0,
    centerZ: -56,
    accentHex: '#46f0c8',
    lore: '北溟寒崖深处尘封千年的镇妖古地窟，石阶尽头矗立冥纹石拱，镇窟剑君以阴火封印太古剑冢密室。',
    desc: '隐于极北山隙的幽冥古窟，阴兵守陵、冥灯长明，击溃镇窟剑君必得传说级绝世神兵！',
    recommendedRealm: '万剑归宗 · 五境',
  },
];

export function getWorldRegionAt(x: number, z: number): WorldRegionDef {
  if (Math.hypot(x, z) <= 19.5) return WORLD_REGIONS[0];
  if ((z <= -33 && Math.abs(x) <= 22) || Math.hypot(x, z + 56) <= 21) return WORLD_REGIONS[5];
  if (x >= 0 && z < 0) return WORLD_REGIONS[1];
  if (x < 0 && z < 0) return WORLD_REGIONS[2];
  if (x < 0 && z >= 0) return WORLD_REGIONS[3];
  return WORLD_REGIONS[4];
}

export interface WorldWaypointDef {
  id: string;
  name: string;
  regionName: string;
  x: number;
  z: number;
  rewardJade: number;
}

export const WORLD_SPAWN_POS = { x: 0, z: 4.5 };

export const WORLD_WAYPOINTS: WorldWaypointDef[] = [
  { id: 'wp_peach', name: '桃源仙驿锚点', regionName: '翠竹桃源林', x: 31, z: -29, rewardJade: 90 },
  { id: 'wp_grave', name: '剑冢断碑锚点', regionName: '古剑残碑原', x: -31, z: -29, rewardJade: 100 },
  { id: 'wp_lava', name: '赤焰渡口锚点', regionName: '赤焰熔岩谷', x: -31, z: 29, rewardJade: 120 },
  { id: 'wp_star', name: '星穹古坛锚点', regionName: '星穹天坛遗迹', x: 31, z: 29, rewardJade: 140 },
  { id: 'wp_crypt', name: '幽冥地窟锚点', regionName: '幽冥古地窟', x: 0, z: -39, rewardJade: 160 },
];

export interface WorldChestDef {
  id: string;
  name: string;
  rarity: EquipRarity;
  x: number;
  z: number;
  jade: number;
  tier: 1 | 2 | 3;
}

export const WORLD_CHESTS: WorldChestDef[] = [
  { id: 'ch_center', name: '蜀山云台补给匣', rarity: 'common', x: 11.5, z: -7.5, jade: 70, tier: 1 },
  { id: 'ch_peach', name: '十里桃林灵宝匣', rarity: 'rare', x: 62, z: -24, jade: 110, tier: 1 },
  { id: 'ch_grave', name: '剑冢断剑古藏匣', rarity: 'rare', x: -63, z: -25, jade: 130, tier: 2 },
  { id: 'ch_lava', name: '炎狱裂谷赤金匣', rarity: 'epic', x: -62, z: 60, jade: 170, tier: 2 },
  { id: 'ch_star', name: '星穹天坛玄玉匣', rarity: 'epic', x: 64, z: 59, jade: 200, tier: 3 },
  { id: 'ch_north', name: '北溟古道隐秘仙匣', rarity: 'epic', x: 14, z: -36, jade: 220, tier: 3 },
  { id: 'ch_crypt_outer', name: '地窟石阶玄冥匣', rarity: 'epic', x: -14, z: -52, jade: 240, tier: 3 },
  { id: 'ch_crypt_vault', name: '镇窟密室太古宝匣', rarity: 'legendary', x: 12, z: -67, jade: 300, tier: 3 },
];

export interface WorldMobSpec {
  kind: Exclude<EnemyKind, 'boss'>;
  name: string;
  dx: number;
  dz: number;
  hpMult: number;
  dmgMult: number;
  affix?: EnemyAffix;
}

export interface WorldMobCampDef {
  id: string;
  name: string;
  x: number;
  z: number;
  respawnSec: number;
  jadeReward: number;
  mobs: WorldMobSpec[];
}

export const WORLD_MOB_CAMPS: WorldMobCampDef[] = [
  {
    id: 'camp_peach',
    name: '桃林游妖哨所',
    x: 38,
    z: -18,
    respawnSec: 26,
    jadeReward: 55,
    mobs: [
      { kind: 'bladesman', name: '桃林剑傀', dx: -2.4, dz: 1.5, hpMult: 1.25, dmgMult: 1.15, affix: 'swift' },
      { kind: 'bladesman', name: '桃林剑傀', dx: 2.4, dz: 1.5, hpMult: 1.25, dmgMult: 1.15 },
      { kind: 'caster', name: '花影幽道', dx: 0, dz: -2.6, hpMult: 1.2, dmgMult: 1.15 },
    ],
  },
  {
    id: 'camp_grave',
    name: '断碑铁骑营地',
    x: -38,
    z: -18,
    respawnSec: 26,
    jadeReward: 75,
    mobs: [
      { kind: 'elite', name: '剑冢巡将', dx: 0, dz: -1.2, hpMult: 1.38, dmgMult: 1.26, affix: 'ironclad' },
      { kind: 'bladesman', name: '古剑亡卒', dx: -2.8, dz: 1.8, hpMult: 1.34, dmgMult: 1.22 },
      { kind: 'caster', name: '荒冢咒师', dx: 2.8, dz: 1.8, hpMult: 1.3, dmgMult: 1.24 },
    ],
  },
  {
    id: 'camp_lava',
    name: '赤焰炼魔营地',
    x: -24,
    z: 46,
    respawnSec: 28,
    jadeReward: 95,
    mobs: [
      { kind: 'elite', name: '炎狱护卫', dx: 0, dz: -1.5, hpMult: 1.52, dmgMult: 1.38, affix: 'vampiric' },
      { kind: 'bladesman', name: '熔岩刀魔', dx: -2.6, dz: 1.6, hpMult: 1.48, dmgMult: 1.34, affix: 'storm' },
      { kind: 'bladesman', name: '熔岩刀魔', dx: 2.6, dz: 1.6, hpMult: 1.48, dmgMult: 1.34 },
    ],
  },
  {
    id: 'camp_star',
    name: '星坛御前哨卫',
    x: 34,
    z: 52,
    respawnSec: 28,
    jadeReward: 110,
    mobs: [
      { kind: 'elite', name: '九幽星卫', dx: -2.2, dz: -1.0, hpMult: 1.62, dmgMult: 1.44, affix: 'swift' },
      { kind: 'caster', name: '星穹祭司', dx: 2.4, dz: -1.8, hpMult: 1.55, dmgMult: 1.42, affix: 'storm' },
      { kind: 'bladesman', name: '星阶剑士', dx: 0, dz: 2.2, hpMult: 1.54, dmgMult: 1.4 },
    ],
  },
  {
    id: 'camp_crypt',
    name: '地窟守陵阴兵',
    x: 0,
    z: -47,
    respawnSec: 30,
    jadeReward: 135,
    mobs: [
      { kind: 'elite', name: '地窟冥卫', dx: 0, dz: -1.6, hpMult: 1.72, dmgMult: 1.52, affix: 'ironclad' },
      { kind: 'bladesman', name: '镇陵鬼剑', dx: -3.0, dz: 1.4, hpMult: 1.62, dmgMult: 1.46, affix: 'vampiric' },
      { kind: 'caster', name: '幽冥阴司', dx: 3.0, dz: 1.4, hpMult: 1.58, dmgMult: 1.48, affix: 'storm' },
    ],
  },
];

export interface WorldBossDef {
  id: string;
  name: string;
  title: string;
  regionName: string;
  bossArchetype: BossArchetype;
  x: number;
  z: number;
  hpMult: number;
  poiseMult: number;
  dmgMult: number;
  affix: EnemyAffix;
  tier: 1 | 2 | 3;
  guaranteedMinRarity: EquipRarity;
  jadeReward: number;
  respawnSec: number;
  lore: string;
  desc: string;
  recommendedRealm: string;
}

export const WORLD_BOSS_SPAWNS: WorldBossDef[] = [
  {
    id: 'wb_phantom',
    name: '青岚剑魔 · 浮生',
    title: '东岳剑翼魔尊',
    regionName: '翠竹桃源林',
    bossArchetype: 'phantom',
    x: 52,
    z: -48,
    hpMult: 1.55,
    poiseMult: 1.3,
    dmgMult: 1.28,
    affix: 'swift',
    tier: 1,
    guaranteedMinRarity: 'epic',
    jadeReward: 180,
    respawnSec: 42,
    lore: '原为蜀山外门奇才，执念入魔后身化青岚剑翼，常以疾风瞬步斩落踏入桃林的侠客。',
    desc: '身法诡谲的高机动剑魔，擅疾风连斩与剑气突袭；弹反其红光起手可迅速破盾。',
    recommendedRealm: '剑气初成 · 一境',
  },
  {
    id: 'wb_titan',
    name: '玄冥泰坦 · 镇山巨神',
    title: '西陲重甲巨神',
    regionName: '古剑残碑原',
    bossArchetype: 'titan',
    x: -54,
    z: -48,
    hpMult: 1.8,
    poiseMult: 1.55,
    dmgMult: 1.34,
    affix: 'ironclad',
    tier: 2,
    guaranteedMinRarity: 'epic',
    jadeReward: 220,
    respawnSec: 45,
    lore: '汇聚剑冢千年煞气与残碑玄铁而成的镇山魔像，一拳裂地，非破甲重剑难以撼动。',
    desc: '极高韧性与护甲的巨型魔神，攻击范围宽广但前摇明显，绕背重击收益极高。',
    recommendedRealm: '御剑破风 · 二境',
  },
  {
    id: 'wb_inferno',
    name: '焚穹炎龙将 · 烈煞',
    title: '南冥地火妖王',
    regionName: '赤焰熔岩谷',
    bossArchetype: 'inferno',
    x: -50,
    z: 48,
    hpMult: 2.0,
    poiseMult: 1.5,
    dmgMult: 1.46,
    affix: 'vampiric',
    tier: 2,
    guaranteedMinRarity: 'epic',
    jadeReward: 260,
    respawnSec: 48,
    lore: '盘踞南冥熔池祭坛的赤炎妖将，饮地火而生、噬生灵气血，誓以焦炎焚尽蜀山结界。',
    desc: '坐镇熔岩玄岩祭坛的嗜血炎王，战斗时需避开周边熔池并打断其吸血连击。',
    recommendedRealm: '紫霄灵剑 · 三境',
  },
  {
    id: 'wb_celestial',
    name: '九幽雷帝 · 劫天尊',
    title: '九霄星穹魔神',
    regionName: '星穹天坛遗迹',
    bossArchetype: 'celestial',
    x: 54,
    z: 48,
    hpMult: 2.35,
    poiseMult: 1.72,
    dmgMult: 1.58,
    affix: 'storm',
    tier: 3,
    guaranteedMinRarity: 'epic',
    jadeReward: 340,
    respawnSec: 52,
    lore: '窃取观星古坛雷脉神力的堕落天尊，周身悬环雷霆万钧，曾令无数剑修止步星阶。',
    desc: '掌控天雷风暴的九霄霸主，攻势迅猛且附带风暴词缀，建议满真气携绝学迎战。',
    recommendedRealm: '天人合一 · 四境',
  },
  {
    id: 'wb_crypt',
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
    lore: '太古时代奉命镇守北溟地窟的蜀山弃尊，千年幽冥阴火淬炼其剑魄，唯有登峰剑侠可斩其心魔。',
    desc: '北溟古地窟终极霸主，兼具极速剑影与嗜血冥火，击败必掉传说级绝世装备与丰厚灵玉！',
    recommendedRealm: '万剑归宗 · 五境',
  },
];

export interface WorldSpiritOrbDef {
  id: string;
  name: string;
  regionName: string;
  x: number;
  y: number;
  z: number;
  jade: number;
}

export const WORLD_SPIRIT_ORBS: WorldSpiritOrbDef[] = [
  { id: 'orb_center', name: '云台清霄灵瞳', regionName: '蜀山云台', x: 0, y: 2.4, z: -15, jade: 65 },
  { id: 'orb_peach', name: '桃林霞光灵瞳', regionName: '翠竹桃源林', x: 44, y: 2.6, z: -36, jade: 65 },
  { id: 'orb_grave', name: '剑冢孤鸣灵瞳', regionName: '古剑残碑原', x: -44, y: 2.6, z: -36, jade: 65 },
  { id: 'orb_lava', name: '熔谷浴火灵瞳', regionName: '赤焰熔岩谷', x: -44, y: 2.8, z: 36, jade: 75 },
  { id: 'orb_star', name: '星穹天枢灵瞳', regionName: '星穹天坛遗迹', x: 44, y: 2.8, z: 36, jade: 75 },
  { id: 'orb_south', name: '南疆凌虚灵瞳', regionName: '蜀山云台', x: 0, y: 2.6, z: 56, jade: 80 },
  { id: 'orb_crypt', name: '地窟冥烛灵瞳', regionName: '幽冥古地窟', x: 0, y: 3.0, z: -52, jade: 90 },
  { id: 'orb_ridge', name: '北溟寒崖灵瞳', regionName: '幽冥古地窟', x: 0, y: 3.2, z: -70, jade: 100 },
];

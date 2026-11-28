import type { BossArchetype } from '../entities/CharacterRig';
import type { EnemyAffix, EnemyKind } from './CampaignData';
import type { EquipRarity } from './EquipmentData';
import type { WorldBiome } from '../world/ShushanArena';

export const WORLD_BOUND = 78;

export type WorldRegionId = 'center' | 'peach' | 'grave' | 'lava' | 'star' | 'crypt';

export type MaterialId =
  | 'mat_lingzhi'
  | 'mat_xuelian'
  | 'mat_xuantie'
  | 'mat_yinhun'
  | 'mat_yaodan'
  | 'mat_longlin';

export interface WorldHerbNodeDef {
  id: string;
  name: string;
  materialId: 'mat_lingzhi' | 'mat_xuelian' | 'mat_xuantie' | 'mat_yinhun';
  yieldMin: number;
  yieldMax: number;
  regionId: WorldRegionId;
  regionName: string;
  x: number;
  z: number;
  respawnSec: number;
  accentHex: string;
}

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
    shortName: '蜀山云台',
    subtitle: '云海青石枢纽 · 通往天庭山寨与山间',
    biome: 'bamboo_canyon',
    centerX: 0,
    centerZ: 0,
    accentHex: '#63d8c6',
    lore: '蜀山历代剑尊开辟的云海枢纽，青石古道由此辐射五方奇境：东入翠竹山间桃谷，西抵黑风古山寨，南赴赤焰炼器熔谷，东南登九霄凌霄天庭，北探幽冥古地窟。',
    desc: '九州灵脉汇流的清幽石台，御剑驰骋与炼丹出发的起点，四通八达衔接天庭、山寨、山间溪谷与古窟。',
    recommendedRealm: '剑心初醒 · 初入江湖',
  },
  {
    id: 'peach',
    name: '东岳 · 翠竹山间桃谷',
    shortName: '翠竹山间',
    subtitle: '溪桥凉亭 · 采摘九叶灵芝',
    biome: 'peach_shrine',
    centerX: 46,
    centerZ: -44,
    accentHex: '#76e2a8',
    lore: '层峦翠竹环抱的山间清溪桃谷，木拱桥横跨碧涧，清风凉亭枕水而建，阶梯药田盛产九叶灵芝，如今却被青岚剑魔以花影剑阵占据。',
    desc: '如诗如画的山间溪谷与竹林桃坞，山径溪畔盛产【九叶灵芝】，适合采药炼丹与初试御剑。',
    recommendedRealm: '剑气初成 · 一境',
  },
  {
    id: 'grave',
    name: '西陲 · 黑风古山寨',
    shortName: '黑风山寨',
    subtitle: '木墙箭楼 · 破寨采赤炎玄铁',
    biome: 'sword_graveyard',
    centerX: -48,
    centerZ: -44,
    accentHex: '#d47c52',
    lore: '雄踞西陲群山之间的黑风古山寨，木栅寨墙与双座烽火箭楼扼守要冲，聚义厅木屋赤旗猎猎，寨中匪妖与重甲镇山巨神盘踞其间。',
    desc: '四通八达的古风木栅山寨，破寨清匪可夺【妖兽内丹】与山崖【赤炎玄铁】，宜善用弹反破敌。',
    recommendedRealm: '御剑破风 · 二境',
  },
  {
    id: 'lava',
    name: '南冥 · 赤焰炼器熔谷',
    shortName: '赤焰熔谷',
    subtitle: '玄铁石桥 · 古铸剑鼎与地火',
    biome: 'lava_abyss',
    centerX: -46,
    centerZ: 44,
    accentHex: '#ff7a48',
    lore: '地肺火脉撕裂而成的赤焰炼器熔谷，玄铁栈桥俯瞰滚烫火海，谷中巨型古铸剑鼎烈焰翻涌，周边玄岩矿脉盛产极品赤炎玄铁。',
    desc: '地火翻涌的南境炼器险谷，可采集【赤炎玄铁】锻造神兵，踏剑凌空飞上玄岩祭坛迎战炎龙妖将。',
    recommendedRealm: '紫霄灵剑 · 三境',
  },
  {
    id: 'star',
    name: '九霄 · 凌霄天庭',
    shortName: '凌霄天庭',
    subtitle: '白玉南天门 · 云阶仙宫采雪莲',
    biome: 'celestial_sanctum',
    centerX: 48,
    centerZ: 44,
    accentHex: '#ffd878',
    lore: '屹立云海之巅的巍峨凌霄天庭，三拱白玉南天门金龙盘柱、琉璃飞檐凌空，白玉云阶祥云缭绕，凌霄金殿四周生有千年天山雪莲。',
    desc: '祥云簇拥的九霄天宫仙域，登白玉云阶穿南天门可采【天山雪莲】，并挑战坐镇凌霄金台的九幽雷帝！',
    recommendedRealm: '天人合一 · 四境',
  },
  {
    id: 'crypt',
    name: '北溟 · 幽冥古地窟',
    shortName: '幽冥地窟',
    subtitle: '玄石冥门 · 采幽冥玄晶斩剑君',
    biome: 'astral_void',
    centerX: 0,
    centerZ: -56,
    accentHex: '#46f0c8',
    lore: '北溟寒崖深处尘封千年的镇妖古地窟，石阶尽头矗立冥纹石拱与长明碧灯，窟内玄阴灵气凝结成珍稀幽冥玄晶。',
    desc: '隐于极北山隙的幽冥古窟，阴兵守陵、冥灯长明，可采【幽冥玄晶】，斩镇窟剑君必得传说神兵与真龙逆鳞！',
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
  { id: 'wp_peach', name: '山间溪桥锚点', regionName: '翠竹山间桃谷', x: 31, z: -29, rewardJade: 90 },
  { id: 'wp_grave', name: '黑风寨门锚点', regionName: '黑风古山寨', x: -31, z: -29, rewardJade: 100 },
  { id: 'wp_lava', name: '赤焰渡口锚点', regionName: '赤焰炼器熔谷', x: -31, z: 29, rewardJade: 120 },
  { id: 'wp_star', name: '南天门云阶锚点', regionName: '凌霄天庭', x: 31, z: 29, rewardJade: 140 },
  { id: 'wp_crypt', name: '幽冥地窟锚点', regionName: '幽冥古地窟', x: 0, z: -39, rewardJade: 160 },
];

export const WORLD_HERB_NODES: WorldHerbNodeDef[] = [
  // 4× 九叶灵芝 (mat_lingzhi) — 蜀山林畔 & 东岳·翠竹山间桃谷
  {
    id: 'herb_lingzhi_1',
    name: '云台林畔九叶灵芝',
    materialId: 'mat_lingzhi',
    yieldMin: 1,
    yieldMax: 2,
    regionId: 'center',
    regionName: '蜀山云台 · 九州枢纽',
    x: 10,
    z: 12.5,
    respawnSec: 32,
    accentHex: '#4ce6a0',
  },
  {
    id: 'herb_lingzhi_2',
    name: '溪桥碧涧九叶灵芝',
    materialId: 'mat_lingzhi',
    yieldMin: 1,
    yieldMax: 2,
    regionId: 'peach',
    regionName: '东岳 · 翠竹山间桃谷',
    x: 35,
    z: -36,
    respawnSec: 36,
    accentHex: '#4ce6a0',
  },
  {
    id: 'herb_lingzhi_3',
    name: '清风亭畔九叶灵芝',
    materialId: 'mat_lingzhi',
    yieldMin: 1,
    yieldMax: 3,
    regionId: 'peach',
    regionName: '东岳 · 翠竹山间桃谷',
    x: 53,
    z: -33,
    respawnSec: 38,
    accentHex: '#4ce6a0',
  },
  {
    id: 'herb_lingzhi_4',
    name: '桃谷药田九叶灵芝',
    materialId: 'mat_lingzhi',
    yieldMin: 2,
    yieldMax: 3,
    regionId: 'peach',
    regionName: '东岳 · 翠竹山间桃谷',
    x: 43,
    z: -57,
    respawnSec: 40,
    accentHex: '#4ce6a0',
  },

  // 4× 天山雪莲 (mat_xuelian) — 九霄·凌霄天庭云阶
  {
    id: 'herb_xuelian_1',
    name: '云阶玉露天山雪莲',
    materialId: 'mat_xuelian',
    yieldMin: 1,
    yieldMax: 2,
    regionId: 'star',
    regionName: '九霄 · 凌霄天庭',
    x: 27,
    z: 36,
    respawnSec: 38,
    accentHex: '#78e4ff',
  },
  {
    id: 'herb_xuelian_2',
    name: '南天云海天山雪莲',
    materialId: 'mat_xuelian',
    yieldMin: 1,
    yieldMax: 2,
    regionId: 'star',
    regionName: '九霄 · 凌霄天庭',
    x: 47,
    z: 31,
    respawnSec: 40,
    accentHex: '#78e4ff',
  },
  {
    id: 'herb_xuelian_3',
    name: '凌霄仙坛天山雪莲',
    materialId: 'mat_xuelian',
    yieldMin: 1,
    yieldMax: 3,
    regionId: 'star',
    regionName: '九霄 · 凌霄天庭',
    x: 63,
    z: 41,
    respawnSec: 42,
    accentHex: '#78e4ff',
  },
  {
    id: 'herb_xuelian_4',
    name: '瑶池琼华天山雪莲',
    materialId: 'mat_xuelian',
    yieldMin: 2,
    yieldMax: 3,
    regionId: 'star',
    regionName: '九霄 · 凌霄天庭',
    x: 46,
    z: 61,
    respawnSec: 44,
    accentHex: '#78e4ff',
  },

  // 3× 赤炎玄铁 (mat_xuantie) — 西陲·黑风古山寨 & 南冥·赤焰炼器熔谷
  {
    id: 'herb_xuantie_1',
    name: '黑风寨崖赤炎玄铁',
    materialId: 'mat_xuantie',
    yieldMin: 1,
    yieldMax: 2,
    regionId: 'grave',
    regionName: '西陲 · 黑风古山寨',
    x: -41,
    z: -56,
    respawnSec: 40,
    accentHex: '#ff8a4c',
  },
  {
    id: 'herb_xuantie_2',
    name: '熔谷渡口赤炎玄铁',
    materialId: 'mat_xuantie',
    yieldMin: 1,
    yieldMax: 2,
    regionId: 'lava',
    regionName: '南冥 · 赤焰炼器熔谷',
    x: -28,
    z: 36,
    respawnSec: 40,
    accentHex: '#ff8a4c',
  },
  {
    id: 'herb_xuantie_3',
    name: '铸剑鼎畔赤炎玄铁',
    materialId: 'mat_xuantie',
    yieldMin: 2,
    yieldMax: 3,
    regionId: 'lava',
    regionName: '南冥 · 赤焰炼器熔谷',
    x: -35,
    z: 59,
    respawnSec: 45,
    accentHex: '#ff8a4c',
  },

  // 3× 幽冥玄晶 (mat_yinhun) — 北溟·幽冥古地窟
  {
    id: 'herb_yinhun_1',
    name: '北溟古道幽冥玄晶',
    materialId: 'mat_yinhun',
    yieldMin: 1,
    yieldMax: 2,
    regionId: 'crypt',
    regionName: '北溟 · 幽冥古地窟',
    x: -10,
    z: -42,
    respawnSec: 42,
    accentHex: '#b88cff',
  },
  {
    id: 'herb_yinhun_2',
    name: '冥门东侧幽冥玄晶',
    materialId: 'mat_yinhun',
    yieldMin: 1,
    yieldMax: 3,
    regionId: 'crypt',
    regionName: '北溟 · 幽冥古地窟',
    x: 11,
    z: -49,
    respawnSec: 44,
    accentHex: '#b88cff',
  },
  {
    id: 'herb_yinhun_3',
    name: '地窟深潭幽冥玄晶',
    materialId: 'mat_yinhun',
    yieldMin: 2,
    yieldMax: 3,
    regionId: 'crypt',
    regionName: '北溟 · 幽冥古地窟',
    x: -5.2,
    z: -68.2,
    respawnSec: 48,
    accentHex: '#b88cff',
  },
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
  { id: 'ch_peach', name: '山间凉亭灵宝匣', rarity: 'rare', x: 62, z: -24, jade: 110, tier: 1 },
  { id: 'ch_grave', name: '黑风寨藏宝古匣', rarity: 'rare', x: -63, z: -25, jade: 130, tier: 2 },
  { id: 'ch_lava', name: '熔谷炼器赤金匣', rarity: 'epic', x: -62, z: 60, jade: 170, tier: 2 },
  { id: 'ch_star', name: '凌霄天庭玄玉匣', rarity: 'epic', x: 64, z: 59, jade: 200, tier: 3 },
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
    name: '山间游妖哨所',
    x: 38,
    z: -18,
    respawnSec: 26,
    jadeReward: 55,
    mobs: [
      { kind: 'bladesman', name: '桃谷剑傀', dx: -2.4, dz: 1.5, hpMult: 1.25, dmgMult: 1.15, affix: 'swift' },
      { kind: 'bladesman', name: '翠竹刀妖', dx: 2.4, dz: 1.5, hpMult: 1.25, dmgMult: 1.15 },
      { kind: 'caster', name: '花影幽道', dx: 0, dz: -2.6, hpMult: 1.2, dmgMult: 1.15 },
    ],
  },
  {
    id: 'camp_grave',
    name: '黑风寨巡逻哨营',
    x: -38,
    z: -18,
    respawnSec: 26,
    jadeReward: 75,
    mobs: [
      { kind: 'elite', name: '黑风寨校尉', dx: 0, dz: -1.2, hpMult: 1.38, dmgMult: 1.26, affix: 'ironclad' },
      { kind: 'bladesman', name: '黑风悍匪', dx: -2.8, dz: 1.8, hpMult: 1.34, dmgMult: 1.22 },
      { kind: 'caster', name: '山寨妖道', dx: 2.8, dz: 1.8, hpMult: 1.3, dmgMult: 1.24 },
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
    name: '南天门御前天卫',
    x: 34,
    z: 52,
    respawnSec: 28,
    jadeReward: 110,
    mobs: [
      { kind: 'elite', name: '凌霄金甲卫', dx: -2.2, dz: -1.0, hpMult: 1.62, dmgMult: 1.44, affix: 'swift' },
      { kind: 'caster', name: '天庭雷官', dx: 2.4, dz: -1.8, hpMult: 1.55, dmgMult: 1.42, affix: 'storm' },
      { kind: 'bladesman', name: '云阶剑卫', dx: 0, dz: 2.2, hpMult: 1.54, dmgMult: 1.4 },
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
    title: '东岳山间剑翼魔尊',
    regionName: '翠竹山间桃谷',
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
    lore: '原为蜀山外门奇才，执念入魔后盘踞翠竹山间桃谷，常以疾风瞬步斩落踏过溪桥的侠客。',
    desc: '身法诡谲的高机动剑魔，擅疾风连斩与剑气突袭；弹反其红光起手可迅速破盾，斩杀必掉真龙逆鳞。',
    recommendedRealm: '剑气初成 · 一境',
  },
  {
    id: 'wb_titan',
    name: '玄冥泰坦 · 镇山巨神',
    title: '黑风古寨镇山巨神',
    regionName: '黑风古山寨',
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
    lore: '黑风古山寨以百炼玄铁与煞气铸就的镇寨魔像，立于聚义厅前，一拳裂地，非破甲重剑难以撼动。',
    desc: '极高韧性与护甲的镇寨巨神，攻击范围宽广但前摇明显，绕背重击收益极高。',
    recommendedRealm: '御剑破风 · 二境',
  },
  {
    id: 'wb_inferno',
    name: '焚穹炎龙将 · 烈煞',
    title: '南冥熔谷地火妖王',
    regionName: '赤焰炼器熔谷',
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
    lore: '盘踞南冥炼器熔谷的赤炎妖将，饮地火而生、守卫古铸剑鼎与赤炎玄铁矿脉。',
    desc: '坐镇熔岩玄岩祭坛的嗜血炎王，战斗时需避开周边熔池并打断其吸血连击。',
    recommendedRealm: '紫霄灵剑 · 三境',
  },
  {
    id: 'wb_celestial',
    name: '九幽雷帝 · 劫天尊',
    title: '凌霄天庭劫雷尊者',
    regionName: '凌霄天庭',
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
    lore: '窃踞凌霄天庭玉台的堕落天尊，坐拥南天门雷脉神力，周身悬环雷霆万钧，令无数剑修止步云阶。',
    desc: '掌控天雷风暴的天庭霸主，攻势迅猛且附带风暴词缀，建议服用修炼丹药后携绝学迎战。',
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
    desc: '北溟古地窟终极霸主，兼具极速剑影与嗜血冥火，击败必掉传说级绝世装备与真龙逆鳞！',
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
  { id: 'orb_peach', name: '山间霞光灵瞳', regionName: '翠竹山间桃谷', x: 44, y: 2.6, z: -36, jade: 65 },
  { id: 'orb_grave', name: '黑风寨楼灵瞳', regionName: '黑风古山寨', x: -44, y: 2.6, z: -36, jade: 65 },
  { id: 'orb_lava', name: '熔谷浴火灵瞳', regionName: '赤焰炼器熔谷', x: -44, y: 2.8, z: 36, jade: 75 },
  { id: 'orb_star', name: '凌霄天宫灵瞳', regionName: '凌霄天庭', x: 44, y: 2.8, z: 36, jade: 75 },
  { id: 'orb_south', name: '南疆凌虚灵瞳', regionName: '蜀山云台', x: 0, y: 2.6, z: 56, jade: 80 },
  { id: 'orb_crypt', name: '地窟冥烛灵瞳', regionName: '幽冥古地窟', x: 0, y: 3.0, z: -52, jade: 90 },
  { id: 'orb_ridge', name: '北溟寒崖灵瞳', regionName: '幽冥古地窟', x: 0, y: 3.2, z: -70, jade: 100 },
];

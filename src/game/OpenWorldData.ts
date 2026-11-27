import type { BossArchetype } from '../entities/CharacterRig';
import type { EnemyAffix, EnemyKind } from './CampaignData';
import type { EquipRarity } from './EquipmentData';
import type { WorldBiome } from '../world/ShushanArena';

export const WORLD_BOUND = 54;

export interface WorldRegionDef {
  id: 'center' | 'peach' | 'grave' | 'lava' | 'star';
  name: string;
  subtitle: string;
  biome: WorldBiome;
  centerX: number;
  centerZ: number;
  accentHex: string;
}

export const WORLD_REGIONS: WorldRegionDef[] = [
  {
    id: 'center',
    name: '蜀山云台 · 九州枢纽',
    subtitle: '中枢传送阵 · 九州灵脉总纲',
    biome: 'bamboo_canyon',
    centerX: 0,
    centerZ: 0,
    accentHex: '#63d8c6',
  },
  {
    id: 'peach',
    name: '东岳 · 翠竹桃源林',
    subtitle: '御风赏桃 · 青岚剑阵',
    biome: 'peach_shrine',
    centerX: 30,
    centerZ: -28,
    accentHex: '#f5a2c4',
  },
  {
    id: 'grave',
    name: '西陲 · 古剑残碑原',
    subtitle: '万剑归冢 · 泰坦镇守',
    biome: 'sword_graveyard',
    centerX: -32,
    centerZ: -28,
    accentHex: '#b88cff',
  },
  {
    id: 'lava',
    name: '南冥 · 赤焰熔岩谷',
    subtitle: '熔岩炙地 · 宜御剑飞越',
    biome: 'lava_abyss',
    centerX: -30,
    centerZ: 28,
    accentHex: '#ff7a48',
  },
  {
    id: 'star',
    name: '九霄 · 星穹天坛遗迹',
    subtitle: '星环悬空 · 雷帝伏魔',
    biome: 'celestial_sanctum',
    centerX: 32,
    centerZ: 28,
    accentHex: '#7ed8ff',
  },
];

export function getWorldRegionAt(x: number, z: number): WorldRegionDef {
  if (Math.hypot(x, z) <= 17.5) return WORLD_REGIONS[0];
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
  { id: 'wp_peach', name: '桃源仙驿锚点', regionName: '翠竹桃源林', x: 22, z: -20, rewardJade: 90 },
  { id: 'wp_grave', name: '剑冢断碑锚点', regionName: '古剑残碑原', x: -22, z: -20, rewardJade: 100 },
  { id: 'wp_lava', name: '赤焰渡口锚点', regionName: '赤焰熔岩谷', x: -21, z: 20, rewardJade: 120 },
  { id: 'wp_star', name: '星穹古坛锚点', regionName: '星穹天坛遗迹', x: 22, z: 20, rewardJade: 140 },
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
  { id: 'ch_center', name: '蜀山云台补给匣', rarity: 'common', x: 10.5, z: -6.5, jade: 70, tier: 1 },
  { id: 'ch_peach', name: '十里桃林灵宝匣', rarity: 'rare', x: 42, z: -15, jade: 110, tier: 1 },
  { id: 'ch_grave', name: '剑冢断剑古藏匣', rarity: 'rare', x: -43, z: -16, jade: 130, tier: 2 },
  { id: 'ch_lava', name: '炎狱裂谷赤金匣', rarity: 'epic', x: -42, z: 41, jade: 170, tier: 2 },
  { id: 'ch_star', name: '星穹天坛玄玉匣', rarity: 'epic', x: 44, z: 40, jade: 200, tier: 3 },
  { id: 'ch_north', name: '北溟幽谷隐秘仙匣', rarity: 'epic', x: 0, z: -43, jade: 220, tier: 3 },
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
    x: 26,
    z: -12,
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
    x: -26,
    z: -12,
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
    z: 34,
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
    x: 24,
    z: 34,
    respawnSec: 28,
    jadeReward: 110,
    mobs: [
      { kind: 'elite', name: '九幽星卫', dx: -2.2, dz: -1.0, hpMult: 1.62, dmgMult: 1.44, affix: 'swift' },
      { kind: 'caster', name: '星穹祭司', dx: 2.4, dz: -1.8, hpMult: 1.55, dmgMult: 1.42, affix: 'storm' },
      { kind: 'bladesman', name: '星阶剑士', dx: 0, dz: 2.2, hpMult: 1.54, dmgMult: 1.4 },
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
}

export const WORLD_BOSS_SPAWNS: WorldBossDef[] = [
  {
    id: 'wb_phantom',
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
  {
    id: 'wb_titan',
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
  {
    id: 'wb_inferno',
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
  {
    id: 'wb_celestial',
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
  { id: 'orb_center', name: '云台清霄灵瞳', regionName: '蜀山云台', x: 0, y: 2.4, z: -13, jade: 65 },
  { id: 'orb_peach', name: '桃林霞光灵瞳', regionName: '翠竹桃源林', x: 30, y: 2.6, z: -24, jade: 65 },
  { id: 'orb_grave', name: '剑冢孤鸣灵瞳', regionName: '古剑残碑原', x: -30, y: 2.6, z: -24, jade: 65 },
  { id: 'orb_lava', name: '熔谷浴火灵瞳', regionName: '赤焰熔岩谷', x: -30, y: 2.8, z: 24, jade: 75 },
  { id: 'orb_star', name: '星穹天枢灵瞳', regionName: '星穹天坛遗迹', x: 30, y: 2.8, z: 24, jade: 75 },
  { id: 'orb_south', name: '南疆凌虚灵瞳', regionName: '蜀山云台', x: 0, y: 2.6, z: 42, jade: 80 },
];

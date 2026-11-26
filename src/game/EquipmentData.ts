export type EquipCategory = 'weapon' | 'armor' | 'relic' | 'skin';
export type EquipRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface ShopItemStats {
  atkPct?: number;
  hpBonus?: number;
  critRate?: number;
  critDmg?: number;
  dmgReduce?: number;
  speedPct?: number;
  cdReduce?: number;
  spiritRegenPct?: number;
  ultGainPct?: number;
  poisePct?: number;
  lifestealPct?: number;
  killHealPct?: number;
  gourdBonus?: number;
  parryWindow?: number;
  parryHeal?: number;
  parryReflectPct?: number;
  parrySpirit?: number;
}

export interface WeaponVisual {
  steelHex: string;
  glowHex: string;
  emissiveHex: string;
  trailCore: [number, number, number];
  trailEdge: [number, number, number];
}

export interface HeroSkinVisual {
  primaryHex: string;
  robeInnerHex: string;
  secondaryHex: string;
  sheenHex: string;
  accentHex: string;
  trimHex: string;
  bronzeHex: string;
}

export interface ShopItemDef {
  id: string;
  name: string;
  category: EquipCategory;
  rarity: EquipRarity;
  price: number;
  badge: string;
  desc: string;
  stats: ShopItemStats;
  weaponVisual?: WeaponVisual;
  skinVisual?: HeroSkinVisual;
}

export interface EquippedLoadout {
  weapon: string;
  armor: string;
  relic: string;
  skin: string;
}

export interface HeroLoadoutStats {
  dmgMult: number;
  maxHpBonus: number;
  critRate: number;
  critMult: number;
  dmgReduce: number;
  speedMult: number;
  cdMult: number;
  spiritRegenMult: number;
  ultGainMult: number;
  poiseMult: number;
  lifesteal: number;
  killHealPct: number;
  gourdBonus: number;
  parryWindowBonus: number;
  parryHeal: number;
  parryReflectBonus: number;
  parrySpiritBonus: number;
}

export const DEFAULT_EQUIPPED: EquippedLoadout = {
  weapon: 'wpn_qinggang',
  armor: 'arm_qingshan',
  relic: 'rel_hulu',
  skin: 'skin_xiaoyao',
};

export const STARTER_OWNED_ITEMS: string[] = [
  'wpn_qinggang',
  'arm_qingshan',
  'rel_hulu',
  'skin_xiaoyao',
];

export const DEFAULT_STARTER_JADE = 90;
export const MAX_FORGE_LEVEL = 5;
export const MAX_INVENTORY_SIZE = 40;

export interface GearAffix {
  id: string;
  label: string;
  stat: keyof ShopItemStats;
  value: number;
  tier: 'normal' | 'prime';
}

export interface RolledGearItem {
  uid: string;
  templateId: string;
  category: 'weapon' | 'armor' | 'relic';
  name: string;
  rarity: EquipRarity;
  qualityPct: number;
  affixes: GearAffix[];
  forgeLevel: number;
  powerScore: number;
  source: string;
  droppedAt: number;
}

export const CATEGORY_LABELS: Record<EquipCategory, string> = {
  weapon: '仙剑神兵',
  armor: '道袍战甲',
  relic: '护身法宝',
  skin: '侠客皮肤',
};

export const RARITY_LABELS: Record<EquipRarity, string> = {
  common: '凡品',
  rare: '灵品',
  epic: '玄品',
  legendary: '仙品',
};

export const SHOP_ITEMS: ShopItemDef[] = [
  // === 仙剑 Weapons ===
  {
    id: 'wpn_qinggang',
    name: '青钢古剑',
    category: 'weapon',
    rarity: 'common',
    price: 0,
    badge: '入门剑',
    desc: '蜀山弟子制式佩剑，锋刃轻灵，暴击率+8%。',
    stats: { critRate: 0.08 },
    weaponVisual: {
      steelHex: '#d8e0e8',
      glowHex: '#cfdbe2',
      emissiveHex: '#1d6a7c',
      trailCore: [1.4, 2.25, 2.35],
      trailEdge: [0.22, 0.95, 1.35],
    },
  },
  {
    id: 'wpn_qixing',
    name: '七星龙渊',
    category: 'weapon',
    rarity: 'rare',
    price: 180,
    badge: '北斗寒芒',
    desc: '剑伤+14% · 暴击+15% · 破势+15% · 回气+12%。',
    stats: { atkPct: 0.14, critRate: 0.15, poisePct: 0.15, spiritRegenPct: 0.12 },
    weaponVisual: {
      steelHex: '#c4def7',
      glowHex: '#aeeeff',
      emissiveHex: '#1ca8dc',
      trailCore: [1.2, 2.25, 2.55],
      trailEdge: [0.2, 0.85, 1.85],
    },
  },
  {
    id: 'wpn_xuantie',
    name: '玄铁重剑',
    category: 'weapon',
    rarity: 'epic',
    price: 420,
    badge: '重剑无锋',
    desc: '剑伤+24% · 破势+38% · 气血+35 · 暴击+12%。',
    stats: { atkPct: 0.24, hpBonus: 35, poisePct: 0.38, critRate: 0.12 },
    weaponVisual: {
      steelHex: '#8d96a4',
      glowHex: '#ffd18a',
      emissiveHex: '#d87618',
      trailCore: [2.45, 1.75, 0.6],
      trailEdge: [1.65, 0.65, 0.15],
    },
  },
  {
    id: 'wpn_ziying',
    name: '紫郢仙剑',
    category: 'weapon',
    rarity: 'epic',
    price: 820,
    badge: '蜀山镇派',
    desc: '剑伤+36% · 暴击+24% · 暴伤+25% · 冷却-12%。',
    stats: { atkPct: 0.36, critRate: 0.24, critDmg: 0.25, cdReduce: 0.12 },
    weaponVisual: {
      steelHex: '#d8caf8',
      glowHex: '#e4b8ff',
      emissiveHex: '#9c42e8',
      trailCore: [1.95, 1.15, 2.55],
      trailEdge: [0.95, 0.28, 1.75],
    },
  },
  {
    id: 'wpn_taixu',
    name: '太虚镇岳',
    category: 'weapon',
    rarity: 'legendary',
    price: 1500,
    badge: '上古仙兵',
    desc: '剑伤+52% · 暴击+32% · 吸血+6% · 破势+28%。',
    stats: { atkPct: 0.52, critRate: 0.32, lifestealPct: 0.06, poisePct: 0.28 },
    weaponVisual: {
      steelHex: '#f6e4ab',
      glowHex: '#fff0ad',
      emissiveHex: '#e6a31a',
      trailCore: [2.55, 2.15, 0.8],
      trailEdge: [2.1, 1.25, 0.2],
    },
  },

  // === 战甲 Armors ===
  {
    id: 'arm_qingshan',
    name: '蜀山青衫',
    category: 'armor',
    rarity: 'common',
    price: 0,
    badge: '布衣初入',
    desc: '轻便亚麻与靛蓝织锦道袍，行云流水。',
    stats: {},
  },
  {
    id: 'arm_xuanlin',
    name: '玄鳞软甲',
    category: 'armor',
    rarity: 'rare',
    price: 200,
    badge: '内甲护心',
    desc: '气血+45 · 减伤+10% · 身法移速+5%。',
    stats: { hpBonus: 45, dmgReduce: 0.10, speedPct: 0.05 },
  },
  {
    id: 'arm_yunjin',
    name: '金丝云锦袍',
    category: 'armor',
    rarity: 'epic',
    price: 520,
    badge: '天蚕织造',
    desc: '气血+95 · 减伤+18% · 灵葫+1 · 弹反回气+12。',
    stats: { hpBonus: 95, dmgReduce: 0.18, gourdBonus: 1, parrySpirit: 12 },
  },
  {
    id: 'arm_xuanwu',
    name: '镇魔玄武铠',
    category: 'armor',
    rarity: 'legendary',
    price: 1150,
    badge: '不动如山',
    desc: '气血+165 · 减伤+26% · 移速+6% · 弹反反伤+25%。',
    stats: { hpBonus: 165, dmgReduce: 0.26, speedPct: 0.06, parryReflectPct: 0.25 },
  },

  // === 法宝 Relics ===
  {
    id: 'rel_hulu',
    name: '酒仙葫芦',
    category: 'relic',
    rarity: 'common',
    price: 0,
    badge: '醉仙传承',
    desc: '蕴藏三口琼浆，危急时刻饮下回春续战。',
    stats: {},
  },
  {
    id: 'rel_yupei',
    name: '青玉剑佩',
    category: 'relic',
    rarity: 'rare',
    price: 240,
    badge: '凝神聚气',
    desc: '剑意获取+28% · 技能冷却-10% · 暴伤+15%。',
    stats: { ultGainPct: 0.28, cdReduce: 0.10, critDmg: 0.15 },
  },
  {
    id: 'rel_shihun',
    name: '九幽噬魂铃',
    category: 'relic',
    rarity: 'epic',
    price: 600,
    badge: '以战养战',
    desc: '斩敌回血14% · 剑伤+10% · 暴击率+10%。',
    stats: { killHealPct: 0.14, atkPct: 0.10, critRate: 0.10 },
  },
  {
    id: 'rel_bagua',
    name: '太极八卦镜',
    category: 'relic',
    rarity: 'legendary',
    price: 1280,
    badge: '阴阳逆转',
    desc: '弹反判定+0.11s · 弹反回血+22 · 弹反反伤+35% · 剑意+20%。',
    stats: { parryWindow: 0.11, parryHeal: 22, parryReflectPct: 0.35, ultGainPct: 0.20 },
  },

  // === 侠客皮肤 3D Skins ===
  {
    id: 'skin_xiaoyao',
    name: '逍遥青衫',
    category: 'skin',
    rarity: 'common',
    price: 0,
    badge: '经典初相',
    desc: '蜀山少年李逍遥本色劲装，素麻靛锦配赤缨剑穗。',
    stats: {},
    skinVisual: {
      primaryHex: '#ffffff',
      robeInnerHex: '#ffffff',
      secondaryHex: '#ffffff',
      sheenHex: '#5a7490',
      accentHex: '#6e1e1c',
      trimHex: '#1a2a3c',
      bronzeHex: '#a8874e',
    },
  },
  {
    id: 'skin_shuangxue',
    name: '霜雪剑仙',
    category: 'skin',
    rarity: 'rare',
    price: 260,
    badge: '冰清玉骨',
    desc: '白鹤流云外袍配霜蓝银纹，剑伤+6% · 移速+4%。',
    stats: { atkPct: 0.06, speedPct: 0.04 },
    skinVisual: {
      primaryHex: '#eef6fc',
      robeInnerHex: '#dff0fc',
      secondaryHex: '#8ec2ec',
      sheenHex: '#c8ecff',
      accentHex: '#2f98c8',
      trimHex: '#284866',
      bronzeHex: '#cfd9e6',
    },
  },
  {
    id: 'skin_chiyan',
    name: '赤焰修罗',
    category: 'skin',
    rarity: 'epic',
    price: 480,
    badge: '血月魔影',
    desc: '玄黑战袍缀赤金流焰，暴击+8% · 暴伤+18%。',
    stats: { critRate: 0.08, critDmg: 0.18 },
    skinVisual: {
      primaryHex: '#383034',
      robeInnerHex: '#4a3539',
      secondaryHex: '#94282e',
      sheenHex: '#ff6c45',
      accentHex: '#dc3d22',
      trimHex: '#241417',
      bronzeHex: '#d89038',
    },
  },
  {
    id: 'skin_zixiao',
    name: '紫霄真人',
    category: 'skin',
    rarity: 'epic',
    price: 780,
    badge: '雷法道宗',
    desc: '紫微星辰道袍加身，气血+30 · 冷却-8% · 回气+15%。',
    stats: { hpBonus: 30, cdReduce: 0.08, spiritRegenPct: 0.15 },
    skinVisual: {
      primaryHex: '#e2daf2',
      robeInnerHex: '#d5caf0',
      secondaryHex: '#704cb2',
      sheenHex: '#c49eff',
      accentHex: '#9a5cf2',
      trimHex: '#2d1c4a',
      bronzeHex: '#dfc16c',
    },
  },
  {
    id: 'skin_jinwu',
    name: '金乌帝君',
    category: 'skin',
    rarity: 'legendary',
    price: 1380,
    badge: '至尊金甲',
    desc: '玄金帝纹曜甲礼服，剑伤+12% · 气血+55 · 暴击+6%。',
    stats: { atkPct: 0.12, hpBonus: 55, critRate: 0.06 },
    skinVisual: {
      primaryHex: '#2c2f3c',
      robeInnerHex: '#3e3828',
      secondaryHex: '#d9a438',
      sheenHex: '#ffe388',
      accentHex: '#e8a828',
      trimHex: '#1f1910',
      bronzeHex: '#fae07c',
    },
  },
];

export const SHOP_ITEM_MAP: Record<string, ShopItemDef> = Object.fromEntries(
  SHOP_ITEMS.map((item) => [item.id, item]),
);

export function getUpgradeCost(item: ShopItemDef, currentLevel: number): number {
  const base = Math.max(120, item.price);
  return Math.round((base * 0.42 + 60) * (1 + currentLevel * 0.65));
}

const RARITY_RANK: Record<EquipRarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
};

const RARITY_FALLBACK_ORDER: EquipRarity[] = ['common', 'rare', 'epic', 'legendary'];

interface AffixPoolEntry {
  id: string;
  stat: keyof ShopItemStats;
  min: number;
  max: number;
  isInt?: boolean;
  prefix: string;
  format: (val: number) => string;
}

const AFFIX_POOL: AffixPoolEntry[] = [
  { id: 'af_atk', stat: 'atkPct', min: 0.04, max: 0.16, prefix: '破军', format: (v) => `剑伤 +${Math.round(v * 100)}%` },
  { id: 'af_hp', stat: 'hpBonus', min: 18, max: 68, isInt: true, prefix: '无双', format: (v) => `气血 +${Math.round(v)}` },
  { id: 'af_crit', stat: 'critRate', min: 0.03, max: 0.12, prefix: '无双', format: (v) => `暴击 +${Math.round(v * 100)}%` },
  { id: 'af_cdmg', stat: 'critDmg', min: 0.08, max: 0.28, prefix: '无双', format: (v) => `暴伤 +${Math.round(v * 100)}%` },
  { id: 'af_def', stat: 'dmgReduce', min: 0.03, max: 0.1, prefix: '太初', format: (v) => `减伤 +${Math.round(v * 100)}%` },
  { id: 'af_spd', stat: 'speedPct', min: 0.03, max: 0.09, prefix: '极品', format: (v) => `移速 +${Math.round(v * 100)}%` },
  { id: 'af_cdr', stat: 'cdReduce', min: 0.03, max: 0.1, prefix: '太初', format: (v) => `冷却 -${Math.round(v * 100)}%` },
  { id: 'af_leech', stat: 'lifestealPct', min: 0.02, max: 0.06, prefix: '饮血', format: (v) => `吸血 +${Math.round(v * 100)}%` },
  { id: 'af_poise', stat: 'poisePct', min: 0.08, max: 0.24, prefix: '破军', format: (v) => `破势 +${Math.round(v * 100)}%` },
  { id: 'af_kheal', stat: 'killHealPct', min: 0.04, max: 0.12, prefix: '饮血', format: (v) => `斩回 +${Math.round(v * 100)}%` },
  { id: 'af_pheal', stat: 'parryHeal', min: 8, max: 24, isInt: true, prefix: '太初', format: (v) => `弹回 +${Math.round(v)}` },
  { id: 'af_ult', stat: 'ultGainPct', min: 0.08, max: 0.24, prefix: '极品', format: (v) => `剑意 +${Math.round(v * 100)}%` },
];

function computeStatsPowerScore(s: ShopItemStats): number {
  return (
    (s.atkPct ?? 0) * 900 +
    (s.hpBonus ?? 0) * 1.8 +
    (s.critRate ?? 0) * 650 +
    (s.critDmg ?? 0) * 280 +
    (s.dmgReduce ?? 0) * 850 +
    (s.speedPct ?? 0) * 320 +
    (s.cdReduce ?? 0) * 450 +
    (s.spiritRegenPct ?? 0) * 180 +
    (s.ultGainPct ?? 0) * 220 +
    (s.poisePct ?? 0) * 260 +
    (s.lifestealPct ?? 0) * 1200 +
    (s.killHealPct ?? 0) * 500 +
    (s.gourdBonus ?? 0) * 45 +
    (s.parryWindow ?? 0) * 900 +
    (s.parryHeal ?? 0) * 3.5 +
    (s.parryReflectPct ?? 0) * 260 +
    (s.parrySpirit ?? 0) * 2.5
  );
}

export function getRolledItemStats(item: RolledGearItem): ShopItemStats {
  const tpl = SHOP_ITEM_MAP[item.templateId]?.stats ?? {};
  const q = item.qualityPct / 100;
  const f = 1 + item.forgeLevel * 0.1;
  const combined: ShopItemStats = {};

  const addScaled = (key: keyof ShopItemStats, val: number | undefined, scaleQuality: boolean, scaleForge: boolean) => {
    if (!val) return;
    const scaled = val * (scaleQuality ? q : 1) * (scaleForge ? f : 1);
    combined[key] = (combined[key] ?? 0) + scaled;
  };

  addScaled('atkPct', tpl.atkPct, true, true);
  addScaled('hpBonus', tpl.hpBonus, true, true);
  addScaled('critRate', tpl.critRate, true, true);
  addScaled('critDmg', tpl.critDmg, true, true);
  addScaled('dmgReduce', tpl.dmgReduce, true, true);
  addScaled('speedPct', tpl.speedPct, true, true);
  addScaled('cdReduce', tpl.cdReduce, true, true);
  addScaled('spiritRegenPct', tpl.spiritRegenPct, true, true);
  addScaled('ultGainPct', tpl.ultGainPct, true, true);
  addScaled('poisePct', tpl.poisePct, true, true);
  addScaled('lifestealPct', tpl.lifestealPct, true, true);
  addScaled('killHealPct', tpl.killHealPct, true, true);
  addScaled('gourdBonus', tpl.gourdBonus, false, false);
  addScaled('parryWindow', tpl.parryWindow, false, false);
  addScaled('parryHeal', tpl.parryHeal, true, true);
  addScaled('parryReflectPct', tpl.parryReflectPct, true, true);
  addScaled('parrySpirit', tpl.parrySpirit, true, true);

  for (const af of item.affixes) {
    addScaled(af.stat, af.value, false, true);
  }
  if (combined.hpBonus) combined.hpBonus = Math.round(combined.hpBonus);
  if (combined.parryHeal) combined.parryHeal = Math.round(combined.parryHeal);
  if (combined.parrySpirit) combined.parrySpirit = Math.round(combined.parrySpirit);
  return combined;
}

export function computeShopItemScore(item: ShopItemDef, forgeLevel = 0): number {
  const f = 1 + Math.min(MAX_FORGE_LEVEL, Math.max(0, forgeLevel)) * 0.1;
  const s = item.stats;
  const scaled: ShopItemStats = {
    atkPct: s.atkPct ? s.atkPct * f : undefined,
    hpBonus: s.hpBonus ? Math.round(s.hpBonus * f) : undefined,
    critRate: s.critRate ? s.critRate * f : undefined,
    critDmg: s.critDmg ? s.critDmg * f : undefined,
    dmgReduce: s.dmgReduce ? s.dmgReduce * f : undefined,
    speedPct: s.speedPct ? s.speedPct * f : undefined,
    cdReduce: s.cdReduce ? s.cdReduce * f : undefined,
    spiritRegenPct: s.spiritRegenPct ? s.spiritRegenPct * f : undefined,
    ultGainPct: s.ultGainPct ? s.ultGainPct * f : undefined,
    poisePct: s.poisePct ? s.poisePct * f : undefined,
    lifestealPct: s.lifestealPct ? s.lifestealPct * f : undefined,
    killHealPct: s.killHealPct ? s.killHealPct * f : undefined,
    gourdBonus: s.gourdBonus,
    parryWindow: s.parryWindow,
    parryHeal: s.parryHeal ? Math.round(s.parryHeal * f) : undefined,
    parryReflectPct: s.parryReflectPct ? s.parryReflectPct * f : undefined,
    parrySpirit: s.parrySpirit ? Math.round(s.parrySpirit * f) : undefined,
  };
  return Math.round(computeStatsPowerScore(scaled));
}

export function computeRolledGearScore(item: RolledGearItem): number {
  return Math.round(computeStatsPowerScore(getRolledItemStats(item)));
}

export function getSalvageJade(item: RolledGearItem): number {
  const base =
    item.rarity === 'legendary' ? 260 : item.rarity === 'epic' ? 120 : item.rarity === 'rare' ? 55 : 25;
  return base + 25 * item.forgeLevel;
}

export function getRolledUpgradeCost(item: RolledGearItem): number {
  const tpl = SHOP_ITEM_MAP[item.templateId];
  const fallbackPrice =
    item.rarity === 'legendary' ? 1200 : item.rarity === 'epic' ? 520 : item.rarity === 'rare' ? 220 : 120;
  const base = Math.max(120, tpl?.price || fallbackPrice);
  return Math.round((base * 0.38 + 55) * (1 + item.forgeLevel * 0.6));
}

export function rollEquipmentDrop(opts: {
  tier: 1 | 2 | 3;
  guaranteedMinRarity?: EquipRarity;
  pityTriggered?: boolean;
  source: string;
  rng?: () => number;
}): RolledGearItem {
  const rng = opts.rng ?? Math.random;
  const roll = rng();
  let rarity: EquipRarity;
  if (opts.tier === 1) {
    rarity = roll < 0.32 ? 'common' : roll < 0.8 ? 'rare' : roll < 0.97 ? 'epic' : 'legendary';
  } else if (opts.tier === 2) {
    rarity = roll < 0.48 ? 'rare' : roll < 0.88 ? 'epic' : 'legendary';
  } else {
    rarity = roll < 0.22 ? 'rare' : roll < 0.76 ? 'epic' : 'legendary';
  }

  let minRank = opts.guaranteedMinRarity ? RARITY_RANK[opts.guaranteedMinRarity] : 0;
  if (opts.pityTriggered) {
    const pityRarity: EquipRarity = opts.tier === 3 || rng() < 0.35 ? 'legendary' : 'epic';
    minRank = Math.max(minRank, RARITY_RANK[pityRarity]);
  }
  if (RARITY_RANK[rarity] < minRank) {
    rarity = RARITY_FALLBACK_ORDER[minRank];
  }

  const categories: Array<'weapon' | 'armor' | 'relic'> = ['weapon', 'armor', 'relic'];
  const category = categories[Math.floor(rng() * categories.length) % categories.length];

  let candidates: ShopItemDef[] = [];
  for (let r = RARITY_RANK[rarity]; r >= 0; r--) {
    const targetRarity = RARITY_FALLBACK_ORDER[r];
    candidates = SHOP_ITEMS.filter((it) => it.category === category && it.rarity === targetRarity);
    if (candidates.length > 0) break;
  }
  const tpl = candidates[Math.floor(rng() * candidates.length) % candidates.length];

  let qualityPct =
    rarity === 'legendary'
      ? 102 + Math.floor(rng() * 24)
      : rarity === 'epic'
        ? 95 + Math.floor(rng() * 26)
        : rarity === 'rare'
          ? 88 + Math.floor(rng() * 28)
          : 80 + Math.floor(rng() * 26);
  if (opts.pityTriggered) {
    qualityPct = Math.max(qualityPct, 102 + Math.floor(rng() * 24));
  }
  qualityPct = Math.min(125, Math.max(80, qualityPct));

  const affixCount =
    rarity === 'legendary' ? 3 : rarity === 'epic' ? 2 : rarity === 'rare' ? (rng() < 0.5 ? 2 : 1) : 1;
  const pool = [...AFFIX_POOL];
  const affixes: GearAffix[] = [];
  for (let i = 0; i < affixCount && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length) % pool.length;
    const entry = pool.splice(idx, 1)[0];
    const rawT = rng();
    const boost = rarity === 'legendary' ? 0.22 : rarity === 'epic' ? 0.12 : rarity === 'rare' ? 0.05 : 0;
    const t = Math.min(1, boost + rawT * (1 - boost));
    const rawVal = entry.min + (entry.max - entry.min) * t;
    const value = entry.isInt ? Math.round(rawVal) : Number(rawVal.toFixed(3));
    affixes.push({
      id: `${entry.id}_${i}`,
      label: entry.format(value),
      stat: entry.stat,
      value,
      tier: t >= 0.75 ? 'prime' : 'normal',
    });
  }

  const primeAffix = affixes.find((a) => a.tier === 'prime');
  let prefix = '';
  if (primeAffix) {
    const entry = AFFIX_POOL.find((p) => p.stat === primeAffix.stat);
    prefix = `${entry?.prefix ?? '极品'}·`;
  } else if (rarity === 'legendary') {
    prefix = '太初·';
  } else if (rarity === 'epic') {
    prefix = '破军·';
  }

  const uid = `gear_${Date.now().toString(36)}_${Math.floor(rng() * 1e6).toString(36)}`;
  const item: RolledGearItem = {
    uid,
    templateId: tpl.id,
    category,
    name: `${prefix}${tpl.name}`,
    rarity,
    qualityPct,
    affixes,
    forgeLevel: 0,
    powerScore: 0,
    source: opts.source,
    droppedAt: Date.now(),
  };
  item.powerScore = computeRolledGearScore(item);
  return item;
}

export function computeHeroLoadoutStats(
  equipped: EquippedLoadout,
  upgrades: Record<string, number>,
  inventory?: RolledGearItem[],
): HeroLoadoutStats {
  let atkPct = 0;
  let maxHpBonus = 0;
  let critRate = 0.05;
  let critBonus = 0.5; // base 1.5x crit
  let dmgReduce = 0;
  let speedPct = 0;
  let cdReduce = 0;
  let spiritRegenPct = 0;
  let ultGainPct = 0;
  let poisePct = 0;
  let lifesteal = 0;
  let killHealPct = 0;
  let gourdBonus = 0;
  let parryWindowBonus = 0;
  let parryHeal = 0;
  let parryReflectBonus = 0;
  let parrySpiritBonus = 0;

  const accumulate = (s: ShopItemStats, scale: number) => {
    if (s.atkPct) atkPct += s.atkPct * scale;
    if (s.hpBonus) maxHpBonus += Math.round(s.hpBonus * scale);
    if (s.critRate) critRate += s.critRate * scale;
    if (s.critDmg) critBonus += s.critDmg * scale;
    if (s.dmgReduce) dmgReduce += s.dmgReduce * scale;
    if (s.speedPct) speedPct += s.speedPct * scale;
    if (s.cdReduce) cdReduce += s.cdReduce * scale;
    if (s.spiritRegenPct) spiritRegenPct += s.spiritRegenPct * scale;
    if (s.ultGainPct) ultGainPct += s.ultGainPct * scale;
    if (s.poisePct) poisePct += s.poisePct * scale;
    if (s.lifestealPct) lifesteal += s.lifestealPct * scale;
    if (s.killHealPct) killHealPct += s.killHealPct * scale;
    if (s.gourdBonus) gourdBonus += s.gourdBonus;
    if (s.parryWindow) parryWindowBonus += s.parryWindow;
    if (s.parryHeal) parryHeal += Math.round(s.parryHeal * scale);
    if (s.parryReflectPct) parryReflectBonus += s.parryReflectPct * scale;
    if (s.parrySpirit) parrySpiritBonus += Math.round(s.parrySpirit * scale);
  };

  const slots: Array<'weapon' | 'armor' | 'relic' | 'skin'> = ['weapon', 'armor', 'relic', 'skin'];
  for (const slot of slots) {
    const id = equipped[slot];
    if (slot !== 'skin' && inventory) {
      const rolled = inventory.find((x) => x.uid === id);
      if (rolled) {
        accumulate(getRolledItemStats(rolled), 1);
        continue;
      }
    }
    const item = SHOP_ITEM_MAP[id];
    if (!item) continue;
    const lv = item.category === 'skin' ? 0 : Math.min(MAX_FORGE_LEVEL, Math.max(0, upgrades[id] ?? 0));
    accumulate(item.stats, 1 + lv * 0.1);
  }

  return {
    dmgMult: Number((1 + atkPct).toFixed(3)),
    maxHpBonus,
    critRate: Math.min(0.85, Number(critRate.toFixed(3))),
    critMult: Number((1 + critBonus).toFixed(2)),
    dmgReduce: Math.min(0.55, Number(dmgReduce.toFixed(3))),
    speedMult: Number(Math.min(1.45, 1 + speedPct).toFixed(3)),
    cdMult: Number(Math.max(0.55, 1 - cdReduce).toFixed(3)),
    spiritRegenMult: Number((1 + spiritRegenPct).toFixed(3)),
    ultGainMult: Number((1 + ultGainPct).toFixed(3)),
    poiseMult: Number((1 + poisePct).toFixed(3)),
    lifesteal: Number(lifesteal.toFixed(3)),
    killHealPct: Number(killHealPct.toFixed(3)),
    gourdBonus,
    parryWindowBonus: Number(parryWindowBonus.toFixed(3)),
    parryHeal,
    parryReflectBonus: Number(parryReflectBonus.toFixed(3)),
    parrySpiritBonus,
  };
}

export function getEquippedSkinVisual(equipped: EquippedLoadout): HeroSkinVisual {
  const skin = SHOP_ITEM_MAP[equipped.skin]?.skinVisual ?? SHOP_ITEM_MAP[DEFAULT_EQUIPPED.skin].skinVisual!;
  return skin;
}

export function getEquippedWeaponVisual(equipped: EquippedLoadout, inventory?: RolledGearItem[]): WeaponVisual {
  const rolled = inventory?.find((x) => x.uid === equipped.weapon);
  const wpnId = rolled ? rolled.templateId : equipped.weapon;
  const wpn = SHOP_ITEM_MAP[wpnId]?.weaponVisual ?? SHOP_ITEM_MAP[DEFAULT_EQUIPPED.weapon].weaponVisual!;
  return wpn;
}

export function computeCombatPower(realmHpBonus: number, realmDmgMult: number, loadout: HeroLoadoutStats): number {
  const hpTotal = 180 + realmHpBonus + loadout.maxHpBonus;
  const effectiveAtk = 100 * realmDmgMult * loadout.dmgMult * (1 + loadout.critRate * (loadout.critMult - 1));
  const defFactor = 1 / Math.max(0.45, 1 - loadout.dmgReduce);
  return Math.round(hpTotal * 1.45 * defFactor + effectiveAtk * 3.8 + loadout.parryReflectBonus * 180 + loadout.lifesteal * 800);
}

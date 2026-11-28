import {
  CATEGORY_LABELS,
  RARITY_LABELS,
  SHOP_ITEM_MAP,
  type EquipRarity,
  type ShopItemStats,
} from './EquipmentData';

export type MaterialId =
  | 'mat_lingzhi'
  | 'mat_xuelian'
  | 'mat_xuantie'
  | 'mat_yinhun'
  | 'mat_yaodan'
  | 'mat_longlin';

export interface CraftMaterialDef {
  id: MaterialId;
  name: string;
  shortName: string;
  icon: string;
  rarity: EquipRarity;
  source: string;
  sourceTag: string;
  accentHex: string;
  gatherKind: 'herb' | 'ore' | 'mob' | 'boss';
  desc: string;
}

export interface IngredientCost {
  materialId: MaterialId;
  qty: number;
}

export interface ElixirPerStackBonus {
  hpBonus?: number;
  atkPct?: number;
  dmgReduce?: number;
  critRate?: number;
  critDmg?: number;
  spiritRegenPct?: number;
  poiseBonus?: number;
}

export interface AlchemyElixirDef {
  id: string;
  name: string;
  icon: string;
  rarity: EquipRarity;
  maxStack: number;
  costs: IngredientCost[];
  bonus: ElixirPerStackBonus;
  instantRestore?: boolean;
  badge: string;
  effectSummary: string;
  desc: string;
}

export interface ElixirBonusSummary {
  hpBonus: number;
  atkPct: number;
  dmgReduce: number;
  critRate: number;
  critDmg: number;
  spiritRegenPct: number;
  poiseBonus: number;
  totalTaken: number;
}

export interface CraftGearRecipeDef {
  id: string;
  name: string;
  category: 'weapon' | 'armor' | 'relic';
  rarity: EquipRarity;
  tier: 1 | 2 | 3;
  templateId: string;
  forgedPrefix: string;
  costs: IngredientCost[];
  badge: string;
  desc: string;
  guaranteedAffixHint: string;
}

export const CRAFT_MATERIALS: CraftMaterialDef[] = [
  {
    id: 'mat_lingzhi',
    name: '九叶灵芝',
    shortName: '灵芝',
    icon: '🌿',
    rarity: 'common',
    source: '东岳山间采摘',
    sourceTag: '山间采药',
    accentHex: '#4ce6a0',
    gatherKind: 'herb',
    desc: '生于翠竹山间桃谷与蜀山林畔的九叶仙草，炼制聚气与筑基丹药的主药。',
  },
  {
    id: 'mat_xuelian',
    name: '天山雪莲',
    shortName: '雪莲',
    icon: '❄',
    rarity: 'rare',
    source: '凌霄天庭采摘',
    sourceTag: '天庭采摘',
    accentHex: '#78e4ff',
    gatherKind: 'herb',
    desc: '盛放于凌霄天庭云阶之上的冰魄灵花，蕴含纯澈仙气，炼丹锻宝皆为上材。',
  },
  {
    id: 'mat_xuantie',
    name: '赤炎玄铁',
    shortName: '玄铁',
    icon: '⛏',
    rarity: 'rare',
    source: '山寨/熔谷采矿与破寨',
    sourceTag: '采矿破寨',
    accentHex: '#ff8a4c',
    gatherKind: 'ore',
    desc: '采自黑风古山寨与赤焰炼器熔谷的赤纹精矿，百炼成钢，锻造神兵战甲必备。',
  },
  {
    id: 'mat_yinhun',
    name: '幽冥玄晶',
    shortName: '玄晶',
    icon: '💎',
    rarity: 'epic',
    source: '北溟地窟采集与阴兵',
    sourceTag: '地窟采集',
    accentHex: '#b88cff',
    gatherKind: 'ore',
    desc: '凝结于北溟幽冥古地窟的太阴灵晶，可激发法宝剑魄与九转仙丹之威。',
  },
  {
    id: 'mat_yaodan',
    name: '妖兽内丹',
    shortName: '内丹',
    icon: '🔮',
    rarity: 'common',
    source: '击杀野怪与据点必掉',
    sourceTag: '猎妖必掉',
    accentHex: '#f5c45e',
    gatherKind: 'mob',
    desc: '九州野外妖兵与据点精锐体内凝结的灵丹，以丹引药、淬火开锋不可或缺。',
  },
  {
    id: 'mat_longlin',
    name: '真龙逆鳞',
    shortName: '龙鳞',
    icon: '🐉',
    rarity: 'legendary',
    source: '斩杀九州野外首领必掉',
    sourceTag: '首领必掉',
    accentHex: '#ffe066',
    gatherKind: 'boss',
    desc: '唯有斩杀九州野外大妖首领或寻宝妖童方可得之的至宝，用以铸就仙品神兵与大罗金丹。',
  },
];

export const CRAFT_MATERIAL_MAP: Record<string, CraftMaterialDef> = Object.fromEntries(
  CRAFT_MATERIALS.map((mat) => [mat.id, mat]),
);

export const DEFAULT_STARTER_MATERIALS: Record<MaterialId, number> = {
  mat_lingzhi: 3,
  mat_xuelian: 1,
  mat_xuantie: 2,
  mat_yinhun: 0,
  mat_yaodan: 2,
  mat_longlin: 0,
};

export const ALCHEMY_ELIXIRS: AlchemyElixirDef[] = [
  {
    id: 'elixir_juqi',
    name: '聚气丹',
    icon: '🟢',
    rarity: 'common',
    maxStack: 12,
    costs: [
      { materialId: 'mat_lingzhi', qty: 2 },
      { materialId: 'mat_yaodan', qty: 1 },
    ],
    bonus: {
      hpBonus: 12,
      spiritRegenPct: 0.03,
    },
    badge: '温养经脉',
    effectSummary: '气血 +12 · 回气 +3%',
    desc: '以九叶灵芝配妖兽内丹文火慢炼，服之气海充盈，永久增幅气血上限与灵气回复。',
  },
  {
    id: 'elixir_xisui',
    name: '洗髓筑基丹',
    icon: '💠',
    rarity: 'rare',
    maxStack: 10,
    costs: [
      { materialId: 'mat_lingzhi', qty: 2 },
      { materialId: 'mat_xuelian', qty: 1 },
      { materialId: 'mat_yaodan', qty: 2 },
    ],
    bonus: {
      hpBonus: 18,
      atkPct: 0.04,
    },
    badge: '伐毛洗髓',
    effectSummary: '气血 +18 · 剑伤 +4%',
    desc: '融入天山雪莲寒髓，洗涤周身浊气，永久夯实剑道根基并显著拔升剑招威力。',
  },
  {
    id: 'elixir_jingang',
    name: '金刚锻体丹',
    icon: '🟠',
    rarity: 'rare',
    maxStack: 8,
    costs: [
      { materialId: 'mat_xuantie', qty: 2 },
      { materialId: 'mat_lingzhi', qty: 2 },
      { materialId: 'mat_yaodan', qty: 2 },
    ],
    bonus: {
      dmgReduce: 0.015,
      poiseBonus: 8,
    },
    badge: '铜皮铁骨',
    effectSummary: '物防减伤 +1.5% · 韧性 +8',
    desc: '以赤炎玄铁精粹入药淬炼筋骨，永久增强护体减伤与架势韧性，迎敌更稳。',
  },
  {
    id: 'elixir_jiuzhuan',
    name: '九转还魂丹',
    icon: '🟣',
    rarity: 'epic',
    maxStack: 6,
    costs: [
      { materialId: 'mat_xuelian', qty: 2 },
      { materialId: 'mat_yinhun', qty: 2 },
      { materialId: 'mat_yaodan', qty: 3 },
    ],
    bonus: {
      critRate: 0.02,
      critDmg: 0.06,
    },
    instantRestore: true,
    badge: '玄品灵丹 · 立即回满',
    effectSummary: '暴击 +2% · 暴伤 +6% · 立即回满气血与灵葫',
    desc: '采天庭雪莲与地窟玄晶九转凝丹，永久提升会心爆发，服下即刻回满气血与灵葫琼浆。',
  },
  {
    id: 'elixir_daluo',
    name: '大罗金仙破境丹',
    icon: '🌟',
    rarity: 'legendary',
    maxStack: 5,
    costs: [
      { materialId: 'mat_xuelian', qty: 3 },
      { materialId: 'mat_yinhun', qty: 3 },
      { materialId: 'mat_longlin', qty: 1 },
    ],
    bonus: {
      hpBonus: 35,
      atkPct: 0.07,
      critRate: 0.025,
    },
    instantRestore: true,
    badge: '仙品金丹 · 破境回满',
    effectSummary: '气血 +35 · 剑伤 +7% · 暴击 +2.5% · 破境回满状态',
    desc: '以真龙逆鳞为丹引炼就的无上金丹，一颗入腹剑意冲霄，大幅永久提升体魄与剑威。',
  },
];

export const ALCHEMY_ELIXIR_MAP: Record<string, AlchemyElixirDef> = Object.fromEntries(
  ALCHEMY_ELIXIRS.map((pill) => [pill.id, pill]),
);

export const CRAFT_GEAR_RECIPES: CraftGearRecipeDef[] = [
  {
    id: 'craft_wpn_qinglan',
    name: '青岚灵木剑',
    category: 'weapon',
    rarity: 'rare',
    tier: 1,
    templateId: 'wpn_qixing',
    forgedPrefix: '灵锻',
    costs: [
      { materialId: 'mat_lingzhi', qty: 2 },
      { materialId: 'mat_xuantie', qty: 2 },
      { materialId: 'mat_yaodan', qty: 2 },
    ],
    badge: '一阶灵剑',
    desc: '以九叶灵芝温润剑胚、赤炎玄铁铸脊而成，剑气清冽轻盈，附带寒芒剑意。',
    guaranteedAffixHint: '保底灵品（有几率升阶玄品）· 附带 1~2 条随机词条',
  },
  {
    id: 'craft_arm_shanzhai',
    name: '黑风百炼甲',
    category: 'armor',
    rarity: 'rare',
    tier: 1,
    templateId: 'arm_xuanlin',
    forgedPrefix: '百炼',
    costs: [
      { materialId: 'mat_xuantie', qty: 3 },
      { materialId: 'mat_yaodan', qty: 2 },
    ],
    badge: '一阶护甲',
    desc: '熔炼黑风古山寨掠获的赤炎玄铁反复锻打，甲叶轻韧贴身，兼顾护心与身法。',
    guaranteedAffixHint: '保底灵品（有几率升阶玄品）· 附带 1~2 条随机词条',
  },
  {
    id: 'craft_rel_xuelian',
    name: '天山冰心佩',
    category: 'relic',
    rarity: 'epic',
    tier: 2,
    templateId: 'rel_yupei',
    forgedPrefix: '玄铸',
    costs: [
      { materialId: 'mat_xuelian', qty: 3 },
      { materialId: 'mat_yinhun', qty: 2 },
      { materialId: 'mat_yaodan', qty: 3 },
    ],
    badge: '二阶法宝',
    desc: '封印天山雪莲与幽冥玄晶于寒玉剑佩之中，凝神聚气极速积攒剑意。',
    guaranteedAffixHint: '保底玄品（有几率升阶仙品）· 附带 2 条随机词条',
  },
  {
    id: 'craft_wpn_chixiao',
    name: '赤霄炎龙剑',
    category: 'weapon',
    rarity: 'epic',
    tier: 2,
    templateId: 'wpn_xuantie',
    forgedPrefix: '炎铸',
    costs: [
      { materialId: 'mat_xuantie', qty: 4 },
      { materialId: 'mat_yinhun', qty: 2 },
      { materialId: 'mat_yaodan', qty: 4 },
    ],
    badge: '二阶炎剑',
    desc: '借赤焰熔谷地火与玄晶淬锋，重剑出鞘炽焰如龙，破势与暴击兼备。',
    guaranteedAffixHint: '保底玄品（有几率升阶仙品）· 附带 2 条随机词条',
  },
  {
    id: 'craft_arm_lingxiao',
    name: '凌霄天帝仙甲',
    category: 'armor',
    rarity: 'legendary',
    tier: 3,
    templateId: 'arm_xuanwu',
    forgedPrefix: '天工',
    costs: [
      { materialId: 'mat_xuelian', qty: 4 },
      { materialId: 'mat_xuantie', qty: 4 },
      { materialId: 'mat_longlin', qty: 1 },
    ],
    badge: '三阶仙甲',
    desc: '融天庭雪莲仙光与真龙逆鳞铸就的无双神铠，气血厚重、减伤卓绝且弹反震敌。',
    guaranteedAffixHint: '必出仙品 · 品质 105%~125% · 附带 3 条极品词条',
  },
  {
    id: 'craft_wpn_hundun',
    name: '九霄混沌神剑',
    category: 'weapon',
    rarity: 'legendary',
    tier: 3,
    templateId: 'wpn_taixu',
    forgedPrefix: '神铸',
    costs: [
      { materialId: 'mat_yinhun', qty: 4 },
      { materialId: 'mat_xuantie', qty: 4 },
      { materialId: 'mat_longlin', qty: 2 },
    ],
    badge: '三阶神剑',
    desc: '以两枚真龙逆鳞合炼幽冥玄晶与玄铁，剑成之日九霄雷动，威压诸妖。',
    guaranteedAffixHint: '必出仙品 · 品质 105%~125% · 附带 3 条极品词条',
  },
];

export const CRAFT_GEAR_RECIPE_MAP: Record<string, CraftGearRecipeDef> = Object.fromEntries(
  CRAFT_GEAR_RECIPES.map((recipe) => [recipe.id, recipe]),
);

export function computeElixirBonuses(
  elixirCounts: Record<string, number> | undefined | null,
): ElixirBonusSummary {
  let hpBonus = 0;
  let atkPct = 0;
  let dmgReduce = 0;
  let critRate = 0;
  let critDmg = 0;
  let spiritRegenPct = 0;
  let poiseBonus = 0;
  let totalTaken = 0;

  if (elixirCounts && typeof elixirCounts === 'object') {
    for (const def of ALCHEMY_ELIXIRS) {
      const raw = Number(elixirCounts[def.id] ?? 0);
      if (!Number.isFinite(raw) || raw <= 0) continue;
      const count = Math.max(0, Math.min(def.maxStack, Math.floor(raw)));
      if (count <= 0) continue;
      totalTaken += count;
      if (def.bonus.hpBonus) hpBonus += def.bonus.hpBonus * count;
      if (def.bonus.atkPct) atkPct += def.bonus.atkPct * count;
      if (def.bonus.dmgReduce) dmgReduce += def.bonus.dmgReduce * count;
      if (def.bonus.critRate) critRate += def.bonus.critRate * count;
      if (def.bonus.critDmg) critDmg += def.bonus.critDmg * count;
      if (def.bonus.spiritRegenPct) spiritRegenPct += def.bonus.spiritRegenPct * count;
      if (def.bonus.poiseBonus) poiseBonus += def.bonus.poiseBonus * count;
    }
  }

  return {
    hpBonus: Math.round(hpBonus),
    atkPct: Number(atkPct.toFixed(4)),
    dmgReduce: Number(dmgReduce.toFixed(4)),
    critRate: Number(critRate.toFixed(4)),
    critDmg: Number(critDmg.toFixed(4)),
    spiritRegenPct: Number(spiritRegenPct.toFixed(4)),
    poiseBonus: Math.round(poiseBonus),
    totalTaken,
  };
}

export interface MaterialShortfall {
  materialId: MaterialId;
  need: number;
  have: number;
}

export function hasEnoughMaterials(
  materials: Record<string, number>,
  costs: IngredientCost[],
): { ok: boolean; missing: MaterialShortfall[] } {
  const missing: MaterialShortfall[] = [];
  for (const cost of costs) {
    const have = Math.max(0, Math.floor(Number(materials[cost.materialId] ?? 0) || 0));
    if (have < cost.qty) {
      missing.push({ materialId: cost.materialId, need: cost.qty, have });
    }
  }
  return { ok: missing.length === 0, missing };
}

export function formatShopStatsSummary(stats: ShopItemStats): string[] {
  const chips: string[] = [];
  if (stats.atkPct) chips.push(`剑伤 +${Math.round(stats.atkPct * 100)}%`);
  if (stats.hpBonus) chips.push(`气血 +${Math.round(stats.hpBonus)}`);
  if (stats.critRate) chips.push(`暴击 +${Math.round(stats.critRate * 100)}%`);
  if (stats.critDmg) chips.push(`暴伤 +${Math.round(stats.critDmg * 100)}%`);
  if (stats.dmgReduce) chips.push(`减伤 +${Math.round(stats.dmgReduce * 100)}%`);
  if (stats.poisePct) chips.push(`破势 +${Math.round(stats.poisePct * 100)}%`);
  if (stats.speedPct) chips.push(`移速 +${Math.round(stats.speedPct * 100)}%`);
  if (stats.cdReduce) chips.push(`冷却 -${Math.round(stats.cdReduce * 100)}%`);
  if (stats.spiritRegenPct) chips.push(`回气 +${Math.round(stats.spiritRegenPct * 100)}%`);
  if (stats.ultGainPct) chips.push(`剑意 +${Math.round(stats.ultGainPct * 100)}%`);
  if (stats.lifestealPct) chips.push(`吸血 +${Math.round(stats.lifestealPct * 100)}%`);
  if (stats.killHealPct) chips.push(`斩回 +${Math.round(stats.killHealPct * 100)}%`);
  if (stats.parryReflectPct) chips.push(`弹反反伤 +${Math.round(stats.parryReflectPct * 100)}%`);
  return chips;
}

export function getRecipeBaseStatChips(recipe: CraftGearRecipeDef): string[] {
  const tpl = SHOP_ITEM_MAP[recipe.templateId];
  return tpl ? formatShopStatsSummary(tpl.stats) : [];
}

export function getRecipeSlotLabel(recipe: CraftGearRecipeDef): string {
  const tierLabel = recipe.tier === 3 ? '三阶' : recipe.tier === 2 ? '二阶' : '一阶';
  return `${CATEGORY_LABELS[recipe.category]} · ${tierLabel}`;
}

export function getRarityLabel(rarity: EquipRarity): string {
  return RARITY_LABELS[rarity];
}

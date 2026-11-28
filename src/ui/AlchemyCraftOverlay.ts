import './alchemy-craft.css';
import {
  ALCHEMY_ELIXIRS,
  CRAFT_GEAR_RECIPES,
  CRAFT_MATERIALS,
  CRAFT_MATERIAL_MAP,
  getRarityLabel,
  getRecipeBaseStatChips,
  getRecipeSlotLabel,
  hasEnoughMaterials,
  type AlchemyElixirDef,
  type CraftGearRecipeDef,
  type ElixirBonusSummary,
  type IngredientCost,
  type MaterialId,
} from '../game/AlchemyCraftData';
import type { CampaignSaveStore } from '../game/CampaignData';
import type { RolledGearItem } from '../game/EquipmentData';

export interface AlchemyCraftCallbacks {
  onBrewElixir: (elixirId: string) => {
    ok: boolean;
    reason: string;
    elixir?: AlchemyElixirDef;
    newCount?: number;
    instantRestore?: boolean;
  };
  onCraftGear: (recipeId: string) => {
    ok: boolean;
    reason: string;
    item?: RolledGearItem;
    overflowSalvagedJade?: number;
  };
  onEquipCrafted: (uid: string) => boolean;
  onGoGatherMaterial?: (materialId: string) => void;
  onClose?: () => void;
}

type CraftTab = 'elixir' | 'forge';

interface FeedbackState {
  kind: 'elixir-ok' | 'forge-ok' | 'error';
  title: string;
  subline?: string;
  craftedItem?: RolledGearItem;
  equippedCrafted?: boolean;
}

function escHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatElixirBonusPills(summary: ElixirBonusSummary): string[] {
  const pills: string[] = [];
  if (summary.hpBonus > 0) pills.push(`气血 +${summary.hpBonus}`);
  if (summary.atkPct > 0) pills.push(`剑伤 +${Math.round(summary.atkPct * 100)}%`);
  if (summary.dmgReduce > 0) pills.push(`减伤 +${(summary.dmgReduce * 100).toFixed(1).replace(/\.0$/, '')}%`);
  if (summary.critRate > 0) pills.push(`暴击 +${(summary.critRate * 100).toFixed(1).replace(/\.0$/, '')}%`);
  if (summary.critDmg > 0) pills.push(`暴伤 +${Math.round(summary.critDmg * 100)}%`);
  if (summary.spiritRegenPct > 0) pills.push(`回气 +${Math.round(summary.spiritRegenPct * 100)}%`);
  if (summary.poiseBonus > 0) pills.push(`韧性 +${summary.poiseBonus}`);
  return pills;
}

function renderIngredientChips(materials: Record<string, number>, costs: IngredientCost[]): string {
  return costs
    .map((cost) => {
      const mat = CRAFT_MATERIAL_MAP[cost.materialId];
      const have = Math.max(0, Math.floor(Number(materials[cost.materialId] ?? 0) || 0));
      const ok = have >= cost.qty;
      const icon = mat?.icon ?? '•';
      const label = mat?.name ?? cost.materialId;
      return `<span class="craft-cost-chip ${ok ? 'ok' : 'short'}" title="${escHtml(mat?.source ?? '')}">${icon} ${escHtml(label)} ${have}/${cost.qty}</span>`;
    })
    .join('');
}

function getGatherShortcutLabel(materialId: MaterialId): string {
  const mat = CRAFT_MATERIAL_MAP[materialId];
  if (!mat) return '🧭 去采药/打怪';
  if (mat.gatherKind === 'boss') return `⚔ 去斩首领`;
  if (mat.gatherKind === 'mob') return `⚔ 去猎妖怪`;
  if (mat.gatherKind === 'ore') return `⛏ 去采${mat.shortName}`;
  return `🌿 去采${mat.shortName}`;
}

export class AlchemyCraftOverlay {
  private readonly root: HTMLDivElement;
  private readonly modalEl: HTMLDivElement;
  private readonly tabElixirBtn: HTMLButtonElement;
  private readonly tabForgeBtn: HTMLButtonElement;
  private readonly matGridEl: HTMLDivElement;
  private readonly elixirSummaryEl: HTMLDivElement;
  private readonly feedbackSlotEl: HTMLDivElement;
  private readonly bodyEl: HTMLDivElement;
  private readonly callbacks: AlchemyCraftCallbacks;

  private openFlag = false;
  private activeTab: CraftTab = 'elixir';
  private storeRef: CampaignSaveStore | null = null;
  private feedback: FeedbackState | null = null;

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.openFlag) {
      e.preventDefault();
      this.close();
    }
  };

  constructor(mountParent: HTMLElement, callbacks: AlchemyCraftCallbacks) {
    this.callbacks = callbacks;

    this.root = document.createElement('div');
    this.root.id = 'craft-overlay';
    this.root.className = 'craft-overlay';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', '丹炉炼丹与神兵锻造');
    this.root.setAttribute('aria-hidden', 'true');

    this.root.innerHTML = `
      <div class="craft-modal" role="document">
        <header class="craft-header">
          <div class="craft-title-group">
            <span class="craft-seal-mark" aria-hidden="true">炉</span>
            <div class="craft-title-text">
              <h2 class="craft-heading">丹炉炼丹 · 神兵锻造</h2>
              <span class="craft-subtitle">采药猎妖 · 修炼丹药 · 合成神兵</span>
            </div>
          </div>

          <div class="craft-tabs" role="tablist" aria-label="炼丹与锻造分页">
            <button
              type="button"
              id="tab-craft-elixir"
              class="craft-tab-btn active"
              role="tab"
              aria-selected="true"
              data-craft-tab="elixir"
            >
              <span>🔥 丹炉炼丹</span>
              <span class="craft-tab-sub">（修炼丹药）</span>
            </button>
            <button
              type="button"
              id="tab-craft-forge"
              class="craft-tab-btn"
              role="tab"
              aria-selected="false"
              data-craft-tab="forge"
            >
              <span>⚒ 神兵锻造</span>
              <span class="craft-tab-sub">（采药合成装备）</span>
            </button>
          </div>

          <button
            type="button"
            id="btn-close-craft"
            class="craft-close-btn"
            aria-label="关闭炼丹锻造"
          >✕</button>
        </header>

        <section class="craft-pouch-bar" aria-label="行囊灵材与丹药修为">
          <div class="craft-mat-grid" id="craft-mat-grid"></div>
          <div class="craft-elixir-summary" id="craft-elixir-summary"></div>
        </section>

        <div class="craft-feedback-slot" id="craft-feedback-slot"></div>

        <main class="craft-body" id="craft-body"></main>
      </div>
    `;

    this.modalEl = this.root.querySelector('.craft-modal') as HTMLDivElement;
    this.tabElixirBtn = this.root.querySelector('#tab-craft-elixir') as HTMLButtonElement;
    this.tabForgeBtn = this.root.querySelector('#tab-craft-forge') as HTMLButtonElement;
    this.matGridEl = this.root.querySelector('#craft-mat-grid') as HTMLDivElement;
    this.elixirSummaryEl = this.root.querySelector('#craft-elixir-summary') as HTMLDivElement;
    this.feedbackSlotEl = this.root.querySelector('#craft-feedback-slot') as HTMLDivElement;
    this.bodyEl = this.root.querySelector('#craft-body') as HTMLDivElement;

    const closeBtn = this.root.querySelector('#btn-close-craft') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => this.close());

    // Backdrop tap-to-close
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) {
        this.close();
      }
    });

    // Delegate all interactive clicks inside modal
    this.modalEl.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const tabBtn = target.closest<HTMLButtonElement>('[data-craft-tab]');
      if (tabBtn) {
        const nextTab = tabBtn.dataset.craftTab as CraftTab | undefined;
        if (nextTab && nextTab !== this.activeTab) {
          this.activeTab = nextTab;
          this.renderAll();
          this.bodyEl.scrollTop = 0;
        }
        return;
      }

      const brewBtn = target.closest<HTMLButtonElement>('[data-brew-elixir]');
      if (brewBtn && !brewBtn.disabled) {
        const elixirId = brewBtn.dataset.brewElixir;
        if (!elixirId) return;
        const res = this.callbacks.onBrewElixir(elixirId);
        if (res.ok) {
          this.feedback = {
            kind: 'elixir-ok',
            title: `✨ ${res.reason}`,
            subline: res.instantRestore
              ? '已同步回复满气血与灵葫，属性永久生效！'
              : '丹药药力已融入经脉，永久提升主角属性！',
          };
        } else {
          this.feedback = {
            kind: 'error',
            title: res.reason,
          };
        }
        this.renderAll();
        return;
      }

      const craftBtn = target.closest<HTMLButtonElement>('[data-craft-gear]');
      if (craftBtn && !craftBtn.disabled) {
        const recipeId = craftBtn.dataset.craftGear;
        if (!recipeId) return;
        const res = this.callbacks.onCraftGear(recipeId);
        if (res.ok && res.item) {
          const salvageNote = res.overflowSalvagedJade
            ? `（行囊已满，自动分解低阶装备得 ◆${res.overflowSalvagedJade}）`
            : '';
          this.feedback = {
            kind: 'forge-ok',
            title: `⚒ 锻造成功！【${res.item.name}】${salvageNote}`,
            subline: `${getRarityLabel(res.item.rarity)} · 品质 ${res.item.qualityPct}% · 战力 ${res.item.powerScore}`,
            craftedItem: res.item,
            equippedCrafted: false,
          };
        } else {
          this.feedback = {
            kind: 'error',
            title: res.reason,
          };
        }
        this.renderAll();
        return;
      }

      const equipBtn = target.closest<HTMLButtonElement>('[data-equip-crafted]');
      if (equipBtn && !equipBtn.disabled) {
        const uid = equipBtn.dataset.equipCrafted;
        if (!uid) return;
        const ok = this.callbacks.onEquipCrafted(uid);
        if (ok && this.feedback && this.feedback.craftedItem?.uid === uid) {
          this.feedback.equippedCrafted = true;
          this.feedback.title = `✓ 已穿戴【${this.feedback.craftedItem.name}】！`;
        }
        this.renderAll();
        return;
      }

      const gatherBtn = target.closest<HTMLButtonElement>('[data-gather-mat]');
      if (gatherBtn) {
        const matId = gatherBtn.dataset.gatherMat;
        if (matId && this.callbacks.onGoGatherMaterial) {
          this.close();
          this.callbacks.onGoGatherMaterial(matId);
        }
      }
    });

    mountParent.appendChild(this.root);
    window.addEventListener('keydown', this.onKeyDown);
  }

  public open(store: CampaignSaveStore, initialTab?: CraftTab): void {
    this.storeRef = store;
    if (initialTab) {
      this.activeTab = initialTab;
    }
    this.feedback = null;
    this.openFlag = true;
    this.root.classList.add('visible');
    this.root.setAttribute('aria-hidden', 'false');
    this.renderAll();
    this.bodyEl.scrollTop = 0;
  }

  public refresh(store: CampaignSaveStore): void {
    this.storeRef = store;
    if (!this.openFlag) return;
    this.renderAll();
  }

  public close(): void {
    if (!this.openFlag) return;
    this.openFlag = false;
    this.root.classList.remove('visible');
    this.root.setAttribute('aria-hidden', 'true');
    this.callbacks.onClose?.();
  }

  public isOpen(): boolean {
    return this.openFlag;
  }

  private renderAll(): void {
    if (!this.storeRef) return;
    const materials = this.storeRef.getMaterials();
    const elixirCounts = this.storeRef.getElixirCounts();
    const bonus = this.storeRef.getElixirBonus();

    this.tabElixirBtn.classList.toggle('active', this.activeTab === 'elixir');
    this.tabElixirBtn.setAttribute('aria-selected', String(this.activeTab === 'elixir'));
    this.tabForgeBtn.classList.toggle('active', this.activeTab === 'forge');
    this.tabForgeBtn.setAttribute('aria-selected', String(this.activeTab === 'forge'));

    this.renderMaterialPouch(materials);
    this.renderElixirBonusSummary(bonus);
    this.renderFeedbackBanner();

    if (this.activeTab === 'elixir') {
      this.renderElixirCards(materials, elixirCounts);
    } else {
      this.renderForgeCards(materials);
    }
  }

  private renderMaterialPouch(materials: Record<string, number>): void {
    this.matGridEl.innerHTML = CRAFT_MATERIALS.map((mat) => {
      const qty = Math.max(0, Math.floor(Number(materials[mat.id] ?? 0) || 0));
      const stateCls = qty > 0 ? 'has-stock' : 'empty-stock';
      return `
        <div
          class="craft-mat-chip ${stateCls}"
          style="--mat-accent:${mat.accentHex}"
          title="${escHtml(mat.name)} · ${escHtml(mat.source)}"
          data-mat-pouch="${mat.id}"
        >
          <span class="craft-mat-left">
            <span class="craft-mat-icon" aria-hidden="true">${mat.icon}</span>
            <span class="craft-mat-name">${escHtml(mat.name)}</span>
          </span>
          <span class="craft-mat-qty">×${qty}</span>
        </div>
      `;
    }).join('');
  }

  private renderElixirBonusSummary(bonus: ElixirBonusSummary): void {
    const pills = formatElixirBonusPills(bonus);
    if (bonus.totalTaken <= 0 || pills.length === 0) {
      this.elixirSummaryEl.innerHTML = `
        <span class="craft-elixir-summary-lead">✨ 已服丹药 0 枚</span>
        <span class="craft-bonus-empty">采药猎妖炼丹可永久提升气血、剑伤、物防与暴击属性</span>
      `;
      return;
    }

    const pillsHtml = pills.map((p) => `<span class="craft-bonus-pill">${escHtml(p)}</span>`).join('');
    this.elixirSummaryEl.innerHTML = `
      <span class="craft-elixir-summary-lead">✨ 已服丹药 ${bonus.totalTaken} 枚</span>
      ${pillsHtml}
    `;
  }

  private renderFeedbackBanner(): void {
    if (!this.feedback) {
      this.feedbackSlotEl.innerHTML = '';
      return;
    }
    const fb = this.feedback;
    const cls =
      fb.kind === 'forge-ok'
        ? 'forge-ok'
        : fb.kind === 'elixir-ok'
          ? 'elixir-ok'
          : 'is-error';

    let affixesHtml = '';
    if (fb.craftedItem && fb.craftedItem.affixes.length > 0) {
      affixesHtml = fb.craftedItem.affixes
        .map(
          (af) =>
            `<span class="craft-feedback-affix ${af.tier === 'prime' ? 'prime' : ''}">${escHtml(af.label)}</span>`,
        )
        .join('');
    }

    const equipBtnHtml = fb.craftedItem
      ? `<button
          type="button"
          class="craft-equip-now-btn ${fb.equippedCrafted ? 'equipped' : ''}"
          data-equip-crafted="${escHtml(fb.craftedItem.uid)}"
          ${fb.equippedCrafted ? 'disabled' : ''}
        >${fb.equippedCrafted ? '✓ 已穿戴' : '⚔ 立即穿戴'}</button>`
      : '';

    this.feedbackSlotEl.innerHTML = `
      <div class="craft-feedback-banner ${cls}" role="status">
        <div class="craft-feedback-main">
          <div class="craft-feedback-title">${escHtml(fb.title)}</div>
          ${
            fb.subline || affixesHtml
              ? `<div class="craft-feedback-meta">${fb.subline ? `<span>${escHtml(fb.subline)}</span>` : ''}${affixesHtml}</div>`
              : ''
          }
        </div>
        ${equipBtnHtml}
      </div>
    `;
  }

  private renderElixirCards(materials: Record<string, number>, elixirCounts: Record<string, number>): void {
    const cardsHtml = ALCHEMY_ELIXIRS.map((pill) => {
      const taken = Math.max(0, Math.min(pill.maxStack, Math.floor(Number(elixirCounts[pill.id] ?? 0) || 0)));
      const isMax = taken >= pill.maxStack;
      const pct = Math.round((taken / pill.maxStack) * 100);
      const check = hasEnoughMaterials(materials, pill.costs);
      const canBrew = !isMax && check.ok;
      const firstMissing = check.missing[0]?.materialId;

      const gatherBtnHtml =
        !isMax && !check.ok && firstMissing && this.callbacks.onGoGatherMaterial
          ? `<button type="button" class="craft-gather-btn" data-gather-mat="${firstMissing}">${escHtml(
              getGatherShortcutLabel(firstMissing),
            )}</button>`
          : '';

      return `
        <article class="craft-card rarity-${pill.rarity}" data-elixir-card="${pill.id}">
          <div class="craft-card-top">
            <div class="craft-card-title-row">
              <span class="craft-card-icon" aria-hidden="true">${pill.icon}</span>
              <div class="craft-card-name-wrap">
                <span class="craft-card-name">${escHtml(pill.name)}</span>
                <div class="craft-card-badges">
                  <span class="craft-rarity-badge">${escHtml(getRarityLabel(pill.rarity))}</span>
                  <span class="craft-tag-badge">${escHtml(pill.badge)}</span>
                </div>
              </div>
            </div>
            <span class="craft-stack-pill ${isMax ? 'is-max' : ''}">${isMax ? '已圆满' : '已服'} ${taken}/${pill.maxStack}</span>
          </div>

          <div class="craft-stack-track" aria-hidden="true">
            <div class="craft-stack-fill" style="width:${pct}%"></div>
          </div>

          <div class="craft-effect-box">
            <div class="craft-effect-main">每次永久：${escHtml(pill.effectSummary)}</div>
            <div class="craft-card-desc">${escHtml(pill.desc)}</div>
          </div>

          <div class="craft-cost-row">
            ${renderIngredientChips(materials, pill.costs)}
          </div>

          <div class="craft-actions">
            <button
              type="button"
              class="craft-primary-btn"
              data-brew-elixir="${pill.id}"
              ${canBrew ? '' : 'disabled'}
            >${isMax ? '✓ 已臻圆满' : canBrew ? '🔥 炼制并服用' : '灵材不足'}</button>
            ${gatherBtnHtml}
          </div>
        </article>
      `;
    }).join('');

    this.bodyEl.innerHTML = `<div class="craft-grid">${cardsHtml}</div>`;
  }

  private renderForgeCards(materials: Record<string, number>): void {
    const cardsHtml = CRAFT_GEAR_RECIPES.map((recipe: CraftGearRecipeDef) => {
      const check = hasEnoughMaterials(materials, recipe.costs);
      const firstMissing = check.missing[0]?.materialId;
      const statChips = getRecipeBaseStatChips(recipe)
        .map((s) => `<span class="craft-stat-chip">${escHtml(s)}</span>`)
        .join('');
      const slotIcon = recipe.category === 'weapon' ? '⚔' : recipe.category === 'armor' ? '🛡' : '🔮';

      const gatherBtnHtml =
        !check.ok && firstMissing && this.callbacks.onGoGatherMaterial
          ? `<button type="button" class="craft-gather-btn" data-gather-mat="${firstMissing}">${escHtml(
              getGatherShortcutLabel(firstMissing),
            )}</button>`
          : '';

      return `
        <article class="craft-card rarity-${recipe.rarity}" data-forge-card="${recipe.id}">
          <div class="craft-card-top">
            <div class="craft-card-title-row">
              <span class="craft-card-icon" aria-hidden="true">${slotIcon}</span>
              <div class="craft-card-name-wrap">
                <span class="craft-card-name">${escHtml(recipe.name)}</span>
                <div class="craft-card-badges">
                  <span class="craft-rarity-badge">${escHtml(getRarityLabel(recipe.rarity))}</span>
                  <span class="craft-tag-badge">${escHtml(getRecipeSlotLabel(recipe))}</span>
                </div>
              </div>
            </div>
            <span class="craft-stack-pill">${escHtml(recipe.badge)}</span>
          </div>

          <div class="craft-effect-box">
            <div class="craft-stat-chips">${statChips}</div>
            <div class="craft-affix-hint">✦ ${escHtml(recipe.guaranteedAffixHint)}</div>
            <div class="craft-card-desc">${escHtml(recipe.desc)}</div>
          </div>

          <div class="craft-cost-row">
            ${renderIngredientChips(materials, recipe.costs)}
          </div>

          <div class="craft-actions">
            <button
              type="button"
              class="craft-primary-btn forge-btn"
              data-craft-gear="${recipe.id}"
              ${check.ok ? '' : 'disabled'}
            >${check.ok ? '⚒ 锻造合成' : '灵材不足'}</button>
            ${gatherBtnHtml}
          </div>
        </article>
      `;
    }).join('');

    this.bodyEl.innerHTML = `<div class="craft-grid">${cardsHtml}</div>`;
  }
}

import './roster-modal.css';
import {
  buildCharacterRoster,
  CHARACTER_CATEGORY_TABS,
  compareWithHero,
  estimateCharacterCombatPower,
  resolveCharacterProfileId,
  type CharacterCategory,
  type CharacterProfileDef,
  type RosterLiveSnapshot,
} from '../game/CharacterRosterData';

export type { RosterLiveSnapshot, CharacterProfileDef, CharacterCategory };

export interface CharacterRosterCallbacks {
  onLocateOnMap?: (charId: string, x: number, z: number, label: string) => void;
  onClose?: () => void;
}

type BossSubFilter = 'all' | 'world_boss' | 'campaign_mob';

function escHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clampPct(val: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(4, Math.min(100, Math.round((val / max) * 100)));
}

export class CharacterRosterOverlay {
  private readonly root: HTMLDivElement;
  private readonly modalEl: HTMLDivElement;
  private readonly tabRowEl: HTMLDivElement;
  private readonly subFilterEl: HTMLDivElement;
  private readonly railEl: HTMLDivElement;
  private readonly stripEl: HTMLDivElement;
  private readonly detailEl: HTMLDivElement;
  private readonly footerEl: HTMLDivElement;
  private readonly callbacks: CharacterRosterCallbacks;

  private openFlag = false;
  private snapshot: RosterLiveSnapshot | null = null;
  private roster: CharacterProfileDef[] = [];
  private activeCategory: CharacterCategory = 'hero';
  private activeBossFilter: BossSubFilter = 'all';
  private selectedId = 'char_xiaoyao';

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.openFlag) {
      e.preventDefault();
      this.close();
    }
  };

  constructor(mountParent: HTMLElement, callbacks: CharacterRosterCallbacks = {}) {
    this.callbacks = callbacks;

    this.root = document.createElement('div');
    this.root.id = 'roster-overlay';
    this.root.className = 'roster-overlay';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', '群英人物志 · 角色物理属性与情报');
    this.root.setAttribute('aria-hidden', 'true');

    this.root.innerHTML = `
      <div class="roster-modal" role="document">
        <header class="roster-header">
          <div class="roster-title-group">
            <span class="roster-seal-mark" aria-hidden="true">志</span>
            <div class="roster-title-text">
              <h2 class="roster-heading">群英人物志</h2>
              <span class="roster-subtitle">角色物理属性 · 战力情报</span>
            </div>
          </div>
          <div class="roster-tabs" role="tablist" aria-label="人物分类"></div>
          <button
            type="button"
            id="btn-close-roster"
            class="roster-close-btn"
            aria-label="关闭群英人物志"
          >✕</button>
        </header>

        <div class="roster-subfilter-bar" aria-label="首领筛选"></div>

        <div class="roster-strip-wrap">
          <div class="roster-strip" role="listbox" aria-label="角色快选"></div>
        </div>

        <div class="roster-body">
          <aside class="roster-rail" aria-label="人物名录"></aside>
          <section class="roster-main">
            <div class="roster-detail-scroll"></div>
            <div class="roster-footer"></div>
          </section>
        </div>
      </div>
    `;

    this.modalEl = this.root.querySelector('.roster-modal') as HTMLDivElement;
    this.tabRowEl = this.root.querySelector('.roster-tabs') as HTMLDivElement;
    this.subFilterEl = this.root.querySelector('.roster-subfilter-bar') as HTMLDivElement;
    this.railEl = this.root.querySelector('.roster-rail') as HTMLDivElement;
    this.stripEl = this.root.querySelector('.roster-strip') as HTMLDivElement;
    this.detailEl = this.root.querySelector('.roster-detail-scroll') as HTMLDivElement;
    this.footerEl = this.root.querySelector('.roster-footer') as HTMLDivElement;

    const closeBtn = this.root.querySelector('#btn-close-roster') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => this.close());

    // Backdrop tap-to-close
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) {
        this.close();
      }
    });

    // Delegate clicks inside modal
    this.modalEl.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const tabBtn = target.closest<HTMLButtonElement>('[data-roster-tab]');
      if (tabBtn) {
        const cat = tabBtn.dataset.rosterTab as CharacterCategory;
        if (cat && cat !== this.activeCategory) {
          this.switchCategory(cat);
        }
        return;
      }

      const subBtn = target.closest<HTMLButtonElement>('[data-boss-filter]');
      if (subBtn) {
        const filter = subBtn.dataset.bossFilter as BossSubFilter;
        if (filter && filter !== this.activeBossFilter) {
          this.activeBossFilter = filter;
          this.ensureSelectionInCurrentList();
          this.renderAll();
        }
        return;
      }

      const charBtn = target.closest<HTMLButtonElement>('[data-char-id]');
      if (charBtn) {
        const cid = charBtn.dataset.charId;
        if (cid && cid !== this.selectedId) {
          this.selectedId = cid;
          this.renderAll();
          this.detailEl.scrollTop = 0;
        }
        return;
      }

      const locateBtn = target.closest<HTMLButtonElement>('#btn-roster-locate');
      if (locateBtn) {
        const profile = this.getSelectedProfile();
        if (profile?.mapPos && this.callbacks.onLocateOnMap) {
          const { id, name, mapPos } = profile;
          this.close();
          this.callbacks.onLocateOnMap(id, mapPos.x, mapPos.z, name);
        }
      }
    });

    mountParent.appendChild(this.root);
    window.addEventListener('keydown', this.onKeyDown);
  }

  public open(snapshot: RosterLiveSnapshot, focusCharId?: string): void {
    this.snapshot = snapshot;
    this.roster = buildCharacterRoster(snapshot);

    const resolvedId = resolveCharacterProfileId(focusCharId);
    const found = this.roster.find((p) => p.id === resolvedId) ?? this.roster[0];
    if (found) {
      this.selectedId = found.id;
      this.activeCategory = found.category;
      if (found.category === 'boss') {
        this.activeBossFilter = 'all';
      }
    }

    this.openFlag = true;
    this.root.classList.add('visible');
    this.root.setAttribute('aria-hidden', 'false');
    this.renderAll();
    this.detailEl.scrollTop = 0;

    // Scroll active chip into view smoothly on portrait strip
    requestAnimationFrame(() => {
      const activeChip = this.stripEl.querySelector<HTMLElement>('.roster-chip.active');
      activeChip?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    });
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

  public getFocusedCharId(): string {
    return this.selectedId;
  }

  public destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.root.remove();
  }

  private switchCategory(cat: CharacterCategory): void {
    this.activeCategory = cat;
    if (cat === 'boss') {
      this.activeBossFilter = 'all';
    }
    this.ensureSelectionInCurrentList();
    this.renderAll();
    this.detailEl.scrollTop = 0;
  }

  private getFilteredList(): CharacterProfileDef[] {
    const byCat = this.roster.filter((p) => p.category === this.activeCategory);
    if (this.activeCategory !== 'boss' || this.activeBossFilter === 'all') {
      return byCat;
    }
    return byCat.filter((p) => p.subGroup === this.activeBossFilter);
  }

  private ensureSelectionInCurrentList(): void {
    const list = this.getFilteredList();
    if (list.length === 0) return;
    if (!list.some((p) => p.id === this.selectedId)) {
      this.selectedId = list[0].id;
    }
  }

  private getSelectedProfile(): CharacterProfileDef | undefined {
    return this.roster.find((p) => p.id === this.selectedId) ?? this.getFilteredList()[0] ?? this.roster[0];
  }

  private getHeroProfile(): CharacterProfileDef | undefined {
    return this.roster.find((p) => p.id === 'char_xiaoyao');
  }

  private renderAll(): void {
    this.renderTabs();
    this.renderSubFilters();
    this.renderSelectorLists();
    this.renderDetail();
  }

  private renderTabs(): void {
    const counts: Record<CharacterCategory, number> = {
      hero: 1,
      ally: this.roster.filter((p) => p.category === 'ally').length,
      boss: this.roster.filter((p) => p.category === 'boss').length,
    };

    this.tabRowEl.innerHTML = CHARACTER_CATEGORY_TABS.map((t) => {
      const active = t.id === this.activeCategory;
      const badge = t.id === 'hero' ? '' : `<span class="roster-tab-count">${counts[t.id]}</span>`;
      return `
        <button
          type="button"
          class="roster-tab-btn${active ? ' active' : ''}"
          role="tab"
          aria-selected="${active ? 'true' : 'false'}"
          data-roster-tab="${t.id}"
        >
          <span>${escHtml(t.label)}</span>${badge}
        </button>
      `;
    }).join('');
  }

  private renderSubFilters(): void {
    if (this.activeCategory !== 'boss') {
      this.subFilterEl.innerHTML = '';
      this.subFilterEl.classList.remove('active');
      return;
    }
    const allBosses = this.roster.filter((p) => p.category === 'boss');
    const worldCount = allBosses.filter((p) => p.subGroup === 'world_boss').length;
    const mobCount = allBosses.filter((p) => p.subGroup === 'campaign_mob').length;

    const opts: Array<{ id: BossSubFilter; label: string }> = [
      { id: 'all', label: `全部妖魔 (${allBosses.length})` },
      { id: 'world_boss', label: `九州首领 (${worldCount})` },
      { id: 'campaign_mob', label: `战役与魔卒 (${mobCount})` },
    ];

    this.subFilterEl.classList.add('active');
    this.subFilterEl.innerHTML = opts
      .map(
        (o) => `
          <button
            type="button"
            class="roster-subfilter-pill${this.activeBossFilter === o.id ? ' active' : ''}"
            data-boss-filter="${o.id}"
          >${escHtml(o.label)}</button>
        `,
      )
      .join('');
  }

  private getShortStatusTag(profile: CharacterProfileDef): { text: string; cls: string } {
    if (profile.category === 'hero') {
      return { text: '当前出战', cls: 'st-jade' };
    }
    if (profile.category === 'ally') {
      if (profile.mapLocKind === 'camp') {
        return { text: '云来剑庐可切磋', cls: 'st-jade' };
      }
      return { text: '蜀山同道', cls: 'st-sky' };
    }
    if (profile.id === 'event_goblin') {
      return profile.alive
        ? { text: '奇遇现身中', cls: 'st-gold' }
        : { text: '九州游弋奇遇', cls: 'st-dim' };
    }
    if (profile.subGroup === 'world_boss') {
      if (profile.alive === false && (profile.respawnRemainSec ?? 0) > 0) {
        return { text: `刷新 ${profile.respawnRemainSec}s`, cls: 'st-amber' };
      }
      if (profile.defeated) {
        return { text: '在阵中 · 已首杀', cls: 'st-gold' };
      }
      return { text: '在阵中', cls: 'st-crimson' };
    }
    return { text: '锁妖战役魔众', cls: 'st-purple' };
  }

  private renderSelectorLists(): void {
    const list = this.getFilteredList();
    const isHeroOnly = this.activeCategory === 'hero';
    this.modalEl.classList.toggle('is-hero-tab', isHeroOnly);

    // 1. Portrait horizontal chip strip (hidden for single Hero tab)
    if (isHeroOnly) {
      this.stripEl.innerHTML = '';
    } else {
      this.stripEl.innerHTML = list
        .map((p) => {
          const active = p.id === this.selectedId;
          const shortName = p.name.split('·')[0].trim();
          const st = this.getShortStatusTag(p);
          return `
            <button
              type="button"
              class="roster-chip${active ? ' active' : ''}"
              role="option"
              aria-selected="${active ? 'true' : 'false'}"
              data-char-id="${escHtml(p.id)}"
              style="--accent:${escHtml(p.badgeColor)}"
            >
              <span class="roster-chip-seal">${escHtml(p.portraitMonogram)}</span>
              <span class="roster-chip-meta">
                <span class="roster-chip-name">${escHtml(shortName)}</span>
                <span class="roster-chip-dot ${st.cls}"></span>
              </span>
            </button>
          `;
        })
        .join('');
    }

    // 2. Landscape / Desktop left rail
    if (isHeroOnly) {
      const hero = this.getHeroProfile();
      if (!hero || !hero.heroExtra) {
        this.railEl.innerHTML = '';
        return;
      }
      const ex = hero.heroExtra;
      const hpPct = clampPct(ex.hp, ex.maxHp);
      const spPct = clampPct(ex.spirit, ex.maxSpirit);
      const stmPct = clampPct(ex.stamina, ex.maxStamina);
      this.railEl.innerHTML = `
        <div class="roster-hero-rail-card" style="--accent:${escHtml(hero.badgeColor)}">
          <div class="roster-crest-ring large">
            <span class="roster-crest-char">${escHtml(hero.portraitMonogram)}</span>
          </div>
          <div class="roster-rail-hero-name">${escHtml(hero.name)}</div>
          <div class="roster-rail-hero-realm">${escHtml(hero.realm)}</div>
          <div class="roster-rail-power">
            <span class="roster-rail-power-lbl">综合剑道战力</span>
            <strong class="roster-rail-power-val">${ex.combatPower}</strong>
          </div>
          <div class="roster-rail-vitals">
            <div class="roster-vital-row">
              <div class="roster-vital-head"><span>气血</span><span>${ex.hp}/${ex.maxHp}</span></div>
              <div class="roster-vital-track"><i class="fill-hp" style="width:${hpPct}%"></i></div>
            </div>
            <div class="roster-vital-row">
              <div class="roster-vital-head"><span>真气</span><span>${ex.spirit}/${ex.maxSpirit}</span></div>
              <div class="roster-vital-track"><i class="fill-sp" style="width:${spPct}%"></i></div>
            </div>
            <div class="roster-vital-row">
              <div class="roster-vital-head"><span>体势</span><span>${ex.stamina}/${ex.maxStamina}</span></div>
              <div class="roster-vital-track"><i class="fill-stm" style="width:${stmPct}%"></i></div>
            </div>
          </div>
          <div class="roster-rail-kills">累计斩妖 <b>${ex.totalKills}</b></div>
        </div>
      `;
    } else {
      this.railEl.innerHTML = `
        <div class="roster-rail-list">
          ${list
            .map((p) => {
              const active = p.id === this.selectedId;
              const st = this.getShortStatusTag(p);
              return `
                <button
                  type="button"
                  class="roster-rail-item${active ? ' active' : ''}"
                  data-char-id="${escHtml(p.id)}"
                  style="--accent:${escHtml(p.badgeColor)}"
                >
                  <span class="roster-rail-seal">${escHtml(p.portraitMonogram)}</span>
                  <span class="roster-rail-info">
                    <span class="roster-rail-name">${escHtml(p.name)}</span>
                    <span class="roster-rail-sub">${escHtml(p.realm)} · ${escHtml(st.text)}</span>
                  </span>
                </button>
              `;
            })
            .join('')}
        </div>
      `;
    }
  }

  private renderDetail(): void {
    const profile = this.getSelectedProfile();
    const heroProfile = this.getHeroProfile();
    if (!profile) {
      this.detailEl.innerHTML = '';
      this.footerEl.innerHTML = '';
      return;
    }

    const st = this.getShortStatusTag(profile);
    const p = profile.physical;
    const isHero = profile.category === 'hero' && !!profile.heroExtra;
    const estPower = estimateCharacterCombatPower(profile);

    // Physical attribute scale denominators for meaningful visual bars
    const hpBarPct =
      profile.liveHp !== undefined && profile.liveMaxHp
        ? clampPct(profile.liveHp, Math.max(profile.liveMaxHp, 1))
        : clampPct(p.maxHp, 2200);
    const hpDisplay =
      profile.liveHp !== undefined && profile.liveMaxHp && (isHero || profile.subGroup === 'world_boss')
        ? `${profile.liveHp}/${profile.liveMaxHp}`
        : `${p.maxHp}`;

    const statCardsHtml = `
      <div class="roster-stat-card stat-hp">
        <div class="roster-stat-top">
          <span class="roster-stat-label">气血<em class="stat-en"> HP</em></span>
          <span class="roster-stat-val">${escHtml(hpDisplay)}</span>
        </div>
        <div class="roster-stat-bar"><i style="width:${isHero ? hpBarPct : clampPct(p.maxHp, 2200)}%"></i></div>
        <div class="roster-stat-hint">${isHero ? `上限 ${p.maxHp} · 实时气血` : `最大生命值 ${p.maxHp}`}</div>
      </div>

      <div class="roster-stat-card stat-atk">
        <div class="roster-stat-top">
          <span class="roster-stat-label">物理攻击<em class="stat-en"> ATK</em></span>
          <span class="roster-stat-val">${p.atk}</span>
        </div>
        <div class="roster-stat-bar"><i style="width:${clampPct(p.atk, 140)}%"></i></div>
        <div class="roster-stat-hint">${isHero ? '剑诀基础折算攻击力' : '单次重击基准伤害'}</div>
      </div>

      <div class="roster-stat-card stat-def">
        <div class="roster-stat-top">
          <span class="roster-stat-label">物防护甲<em class="stat-en"> DEF</em></span>
          <span class="roster-stat-val">${p.armor}</span>
        </div>
        <div class="roster-stat-bar"><i style="width:${clampPct(p.armor, 320)}%"></i></div>
        <div class="roster-stat-hint">物理减伤 ${p.dmgReducePct}%</div>
      </div>

      <div class="roster-stat-card stat-poise">
        <div class="roster-stat-top">
          <span class="roster-stat-label">架势韧性<em class="stat-en"> POISE</em></span>
          <span class="roster-stat-val">${p.poise}</span>
        </div>
        <div class="roster-stat-bar"><i style="width:${clampPct(p.poise, 460)}%"></i></div>
        <div class="roster-stat-hint">${profile.affixLabel === '霸体' ? '含霸体韧性 +38%' : '抗打断与破势阈值'}</div>
      </div>

      <div class="roster-stat-card stat-spd">
        <div class="roster-stat-top">
          <span class="roster-stat-label">身法移速<em class="stat-en"> SPD</em></span>
          <span class="roster-stat-val">${p.moveSpeed.toFixed(1)}<small>m/s</small></span>
        </div>
        <div class="roster-stat-bar"><i style="width:${clampPct(p.moveSpeed, 11)}%"></i></div>
        <div class="roster-stat-hint">${isHero ? '徒步移速（御剑×1.88）' : '追击与实战机动速率'}</div>
      </div>

      <div class="roster-stat-card stat-reach">
        <div class="roster-stat-top">
          <span class="roster-stat-label">剑距<em class="stat-en"> REACH</em></span>
          <span class="roster-stat-val">${p.attackReach.toFixed(2)}<small>m</small></span>
        </div>
        <div class="roster-stat-bar"><i style="width:${clampPct(Math.min(p.attackReach, 14), 14)}%"></i></div>
        <div class="roster-stat-hint">${p.attackReach >= 9 ? '远程法阵/灵球射程' : '近战兵器有效攻击距离'}</div>
      </div>

      <div class="roster-stat-card stat-crit">
        <div class="roster-stat-top">
          <span class="roster-stat-label">暴击<em class="stat-en"> CRIT</em></span>
          <span class="roster-stat-val">${p.critRatePct}%<small>/${p.critDmgPct}%</small></span>
        </div>
        <div class="roster-stat-bar"><i style="width:${clampPct(p.critRatePct, 65)}%"></i></div>
        <div class="roster-stat-hint">暴击率 / 暴伤倍率</div>
      </div>

      <div class="roster-stat-card stat-body">
        <div class="roster-stat-top">
          <span class="roster-stat-label">体格<em class="stat-en"> BODY</em></span>
          <span class="roster-stat-val">R${p.bodyRadius.toFixed(2)}<small>m</small></span>
        </div>
        <div class="roster-stat-bar"><i style="width:${clampPct(p.heightCm, 360)}%"></i></div>
        <div class="roster-stat-hint">身高 ${p.heightCm}cm · 体重 ${p.weightKg}kg</div>
      </div>
    `;

    // Comparison vs Li Xiaoyao for non-hero characters
    let compareHtml = '';
    if (!isHero && heroProfile) {
      const cmp = compareWithHero(profile, heroProfile);
      const verdictCls =
        cmp.verdict === 'dominate'
          ? 'cmp-dominate'
          : cmp.verdict === 'even'
            ? 'cmp-even'
            : 'cmp-danger';
      compareHtml = `
        <section class="roster-section roster-compare-box ${verdictCls}">
          <div class="roster-section-head">
            <h3>战力对比 · 对比李逍遥</h3>
            <span class="roster-verdict-badge ${verdictCls}">${escHtml(cmp.verdictLabel)}</span>
          </div>
          <div class="roster-compare-summary">
            <span>目标估算战力 <b>${cmp.targetPower}</b></span>
            <span class="roster-compare-vs">VS</span>
            <span>李逍遥当前战力 <b>${cmp.heroPower}</b></span>
          </div>
          <div class="roster-compare-grid">
            ${cmp.metrics
              .map(
                (m) => `
                  <div class="roster-cmp-pill favor-${m.favor}">
                    <span class="cmp-lbl">${escHtml(m.label)}</span>
                    <strong class="cmp-delta">${escHtml(m.deltaText)}</strong>
                    <span class="cmp-sub">敌 ${escHtml(m.targetText)} · 我 ${escHtml(m.heroText)}</span>
                  </div>
                `,
              )
              .join('')}
          </div>
        </section>
      `;
    }

    // Hero-exclusive Combat Mastery & Equipped Loadout section
    let heroLoadoutHtml = '';
    if (isHero && profile.heroExtra) {
      const ex = profile.heroExtra;
      heroLoadoutHtml = `
        <section class="roster-section">
          <div class="roster-section-head">
            <h3>剑道机制与灵脉加成</h3>
            <span class="roster-section-pill">综合战力 ${ex.combatPower}</span>
          </div>
          <div class="roster-mech-grid">
            <div class="roster-mech-pill">
              <span>真气上限</span>
              <strong>${ex.spirit} / ${ex.maxSpirit}</strong>
            </div>
            <div class="roster-mech-pill">
              <span>体势上限</span>
              <strong>${ex.stamina} / ${ex.maxStamina}</strong>
            </div>
            <div class="roster-mech-pill">
              <span>弹反窗口</span>
              <strong>${ex.parryWindowMs} ms</strong>
            </div>
            <div class="roster-mech-pill">
              <span>弹反反伤</span>
              <strong>+${ex.parryReflectPct}%</strong>
            </div>
            <div class="roster-mech-pill">
              <span>生命窃取</span>
              <strong>${ex.lifestealPct}%</strong>
            </div>
            <div class="roster-mech-pill">
              <span>冷却缩减</span>
              <strong>-${ex.cdReducePct}%</strong>
            </div>
          </div>

          <div class="roster-loadout-grid">
            <div class="roster-gear-slot">
              <span class="gear-slot-k">仙剑神兵</span>
              <strong class="gear-slot-v">${escHtml(ex.equippedNames.weapon || '青钢古剑')}</strong>
            </div>
            <div class="roster-gear-slot">
              <span class="gear-slot-k">道袍战甲</span>
              <strong class="gear-slot-v">${escHtml(ex.equippedNames.armor || '蜀山青衫')}</strong>
            </div>
            <div class="roster-gear-slot">
              <span class="gear-slot-k">护身法宝</span>
              <strong class="gear-slot-v">${escHtml(ex.equippedNames.relic || '酒仙葫芦')}</strong>
            </div>
            <div class="roster-gear-slot">
              <span class="gear-slot-k">侠客外观</span>
              <strong class="gear-slot-v">${escHtml(ex.equippedNames.skin || '逍遥青衫')}</strong>
            </div>
          </div>

          <div class="roster-cultivation-strip">
            <div class="cult-item">
              <span>九州灵瞳加成</span>
              <strong>气血 +${ex.orbHpBonus}</strong>
            </div>
            <div class="cult-item">
              <span>境界修炼明细</span>
              <strong>${escHtml(ex.cultivationSummary)}</strong>
            </div>
          </div>
        </section>
      `;
    }

    // Skills section
    const skillsHtml = `
      <section class="roster-section">
        <div class="roster-section-head">
          <h3>绝学招式</h3>
          ${profile.weaponName ? `<span class="roster-section-pill">佩兵：${escHtml(profile.weaponName)}</span>` : ''}
        </div>
        <div class="roster-skill-list">
          ${profile.skills
            .map(
              (sk) => `
                <div class="roster-skill-card">
                  <div class="roster-skill-top">
                    <strong class="roster-skill-name">${escHtml(sk.name)}</strong>
                    ${sk.tag ? `<span class="roster-skill-tag">${escHtml(sk.tag)}</span>` : ''}
                  </div>
                  <p class="roster-skill-desc">${escHtml(sk.desc)}</p>
                </div>
              `,
            )
            .join('')}
        </div>
      </section>
    `;

    // Weakness & Drops + Lore
    const intelHtml = `
      <section class="roster-intel-grid">
        <div class="roster-intel-card intel-weakness">
          <h4>破招弱点与应对</h4>
          <p>${escHtml(profile.weakness)}</p>
        </div>
        <div class="roster-intel-card intel-drops">
          <h4>${profile.category === 'boss' ? '讨伐掉落与赏金' : '互动指引与传承'}</h4>
          <p>${escHtml(profile.drops)}</p>
        </div>
      </section>

      <section class="roster-section roster-lore-box">
        <div class="roster-section-head">
          <h3>人物列传</h3>
          <span class="roster-section-pill">${escHtml(profile.region)}</span>
        </div>
        <p class="roster-lore-text">${escHtml(profile.lore)}</p>
      </section>
    `;

    this.detailEl.innerHTML = `
      <div class="roster-hero-banner" style="--accent:${escHtml(profile.badgeColor)}">
        <div class="roster-crest-ring">
          <span class="roster-crest-char">${escHtml(profile.portraitMonogram)}</span>
        </div>
        <div class="roster-banner-info">
          <div class="roster-banner-title-row">
            <h3 class="roster-char-name">${escHtml(profile.name)}</h3>
            <span class="roster-status-badge ${st.cls}">${escHtml(st.text)}</span>
          </div>
          <div class="roster-char-title">${escHtml(profile.title)}</div>
          <div class="roster-pill-row">
            <span class="roster-meta-pill pill-realm">${escHtml(profile.realm)}</span>
            <span class="roster-meta-pill pill-faction">${escHtml(profile.faction)}</span>
            ${profile.affixLabel ? `<span class="roster-meta-pill pill-affix">词缀 · ${escHtml(profile.affixLabel)}</span>` : ''}
            <span class="roster-meta-pill pill-power">战力 ${estPower}</span>
          </div>
        </div>
      </div>

      ${compareHtml}

      <section class="roster-section">
        <div class="roster-section-head">
          <h3>物理属性面板</h3>
          <span class="roster-section-pill">${escHtml(profile.region)}</span>
        </div>
        <div class="roster-stats-grid">
          ${statCardsHtml}
        </div>
      </section>

      ${heroLoadoutHtml}
      ${skillsHtml}
      ${intelHtml}
    `;

    // Footer action button when character has map coordinates
    if (profile.mapPos && this.callbacks.onLocateOnMap) {
      const coordText = `(${Math.round(profile.mapPos.x)}, ${Math.round(profile.mapPos.z)})`;
      const inWorld = Boolean(this.snapshot?.inWorld);
      const btnLabel =
        profile.mapLocKind === 'camp'
          ? `舆图定位 · 前往云来剑庐拜会 ${profile.name.split('·')[0].trim()}`
          : inWorld
            ? `舆图定位 / 自动寻路 · ${profile.region} ${coordText}`
            : `前往九州舆图定位 · ${profile.region} ${coordText}`;
      this.footerEl.classList.add('active');
      this.footerEl.innerHTML = `
        <button type="button" id="btn-roster-locate" class="roster-locate-btn">
          <span class="locate-icon" aria-hidden="true">◎</span>
          <span>${escHtml(btnLabel)}</span>
        </button>
      `;
    } else {
      this.footerEl.classList.remove('active');
      this.footerEl.innerHTML = '';
    }
  }
}

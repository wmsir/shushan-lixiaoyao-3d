import iconYujian from '../assets/icon-yujian.jpg';
import iconWanjian from '../assets/icon-wanjian.jpg';
import iconTianjian from '../assets/icon-tianjian.jpg';
import iconHulu from '../assets/icon-hulu.jpg';
import medalAttack from '../assets/medal-attack.jpg';
import medalDodge from '../assets/medal-dodge.jpg';
import medalParry from '../assets/medal-parry.jpg';
import type { HeroState, EnemyEntity, PeerHeroState } from '../game/CombatEntities';
import {
  CAMPAIGN_STAGES,
  CHAPTERS,
  DUNGEON_LIST,
  type BlessingDef,
  type CampaignSaveStore,
  type DungeonDef,
  type StageDef,
  type StageDialogueDef,
  getChapterDef,
  getStageDef,
  getSwordRealm,
} from '../game/CampaignData';
import {
  CATEGORY_LABELS,
  type EquipCategory,
  MAX_FORGE_LEVEL,
  MAX_INVENTORY_SIZE,
  RARITY_LABELS,
  type RolledGearItem,
  SHOP_ITEMS,
  computeCombatPower,
  computeHeroLoadoutStats,
  getRolledUpgradeCost,
  getSalvageJade,
  getUpgradeCost,
} from '../game/EquipmentData';
import { clamp } from '../utils/math';
import { isPureMobileDevice } from '../core/NativeBridge';
import { APP_VERSION } from '../version';

export type ScreenMode =
  | 'title'
  | 'dialogue'
  | 'playing'
  | 'cutscene'
  | 'paused'
  | 'victory'
  | 'defeat'
  | 'showcase';

export type CombatThreatState = 'none' | 'parryable' | 'unblockable';

export interface MinimapEntityDot {
  x: number;
  z: number;
  kind: 'enemy' | 'elite' | 'boss' | 'loot' | 'ally';
}

export interface HudTacticalState {
  corridorMode: boolean;
  heroX: number;
  heroZ: number;
  heroYaw: number;
  zMax: number;
  zMin: number;
  maxZone: 0 | 1 | 2;
  unlockedZone: 0 | 1 | 2;
  zoneName: string;
  progressPct: number;
  dots: MinimapEntityDot[];
  q2Ready: boolean;
  comboSigils: Array<'A' | 'Q' | 'E' | 'D'>;
  comboUltReady: boolean;
  comboUltTimer: number;
}

export interface HudCallbacks {
  onStart: (stageId: number) => void;
  onConfirmDialogue: () => void;
  onNextStage: (nextStageId: number, selectedBlessingId?: string) => void;
  onRetry: () => void;
  onBackToTitle: () => void;
  onToggleMute: () => boolean;
  onTogglePause: () => void;
  onToggleLolMode: () => boolean;
  onMpCreate: (mode: 'coop' | 'solo', stageId: number) => void;
  onMpJoin: (code: string) => void;
  onMpQuick: (mode: 'coop' | 'solo', stageId: number) => void;
  onMpLeave: () => void;
  onShopBuy: (itemId: string) => { ok: boolean; reason: string };
  onShopEquip: (itemId: string) => boolean;
  onShopUpgrade: (itemId: string) => { ok: boolean; level: number; reason: string };
  onStartDungeon: (dungeonId: string) => void;
  onEquipRolled: (uid: string) => boolean;
  onUpgradeRolled: (uid: string) => { ok: boolean; level: number; reason: string };
  onSalvageRolled: (uid: string) => { ok: boolean; jade: number; reason: string };
  onSalvageLow: (maxRarity: 'common' | 'rare') => { count: number; jade: number };
  onClaimBounty: (bountyId: string) => { ok: boolean; jade: number; droppedItem?: RolledGearItem; reason: string };
  onCastComboUlt?: () => void;
}

export interface ResultDisplayOptions {
  stageDef?: StageDef;
  dungeonDef?: DungeonDef;
  droppedGear?: RolledGearItem[];
  starResult?: {
    stars: 1 | 2 | 3;
    checks: [boolean, boolean, boolean];
    labels: [string, string, string];
  };
  blessingChoices?: BlessingDef[];
  nextStageId?: number | null;
  jadeEarned?: number;
  customTitle?: string;
  customSub?: string;
}

const SKILL_MAX_CD = {
  Q: 3.5,
  E: 7.5,
  R: 12.0,
  F: 1.5,
};

export class HudController {
  private readonly appRoot = this.q('#app');
  private readonly titleOverlay = this.q('#title-overlay');
  private readonly campaignOverlay = this.q('#campaign-overlay');
  private readonly shopOverlay = this.q('#shop-overlay');
  private readonly dungeonOverlay = this.q('#dungeon-overlay');
  private readonly dialogueOverlay = this.q('#dialogue-overlay');
  private readonly hudRoot = this.q('#game-hud');
  private readonly touchRoot = this.q('#touch-controls');
  private readonly resultOverlay = this.q('#result-overlay');
  private readonly pauseOverlay = this.q('#pause-overlay');

  private readonly hpFill = this.q('#hp-fill');
  private readonly hpDelay = this.q('#hp-delay');
  private readonly hpText = this.q('#hp-text');
  private readonly spiritFill = this.q('#spirit-fill');
  private readonly staminaFill = this.q('#stamina-fill');
  private readonly ultPctText = this.q('#ult-pct');
  private readonly heroTitleName = this.q('#hero-title-name');
  private readonly hudRealmName = this.q('#hud-realm-name');
  private readonly hudBlessingPill = this.q('#hud-blessing-pill');

  private readonly allyMini = this.q('#ally-mini');
  private readonly allyMiniName = this.q('#ally-mini-name');
  private readonly allyHpFill = this.q('#ally-hp-fill');

  private readonly objectiveText = this.q('#objective-text');
  private readonly bossBar = this.q('#boss-bar');
  private readonly bossName = this.q('#boss-name');
  private readonly bossHpFill = this.q('#boss-hp-fill');
  private readonly bossPoiseFill = this.q('#boss-poise-fill');

  // Desktop sculpted skill medallions
  private readonly slotQ = this.q('#slot-q');
  private readonly slotE = this.q('#slot-e');
  private readonly slotR = this.q('#slot-r');
  private readonly slotF = this.q('#slot-f');
  private readonly sweepQ = this.q('#sweep-q');
  private readonly sweepE = this.q('#sweep-e');
  private readonly sweepR = this.q('#sweep-r');
  private readonly sweepF = this.q('#sweep-f');
  private readonly cdQEl = this.q('#cd-q');
  private readonly cdEEl = this.q('#cd-e');
  private readonly cdREl = this.q('#cd-r');
  private readonly gourdCountEl = this.q('#gourd-count');

  // Honor-of-Kings mobile/APK sculpted skill wheel medallions
  private readonly tSlotQ = this.q('#btn-skill-q');
  private readonly tSlotE = this.q('#btn-skill-e');
  private readonly tSlotR = this.q('#btn-skill-r');
  private readonly tSlotF = this.q('#btn-heal');
  private readonly tSweepQ = this.q('#t-sweep-q');
  private readonly tSweepE = this.q('#t-sweep-e');
  private readonly tSweepR = this.q('#t-sweep-r');
  private readonly tSweepF = this.q('#t-sweep-f');
  private readonly tCdQEl = this.q('#t-cd-q');
  private readonly tCdEEl = this.q('#t-cd-e');
  private readonly tCdREl = this.q('#t-cd-r');
  private readonly tGourdCountEl = this.q('#t-gourd-count');

  // Tactical Corridor Minimap, Q2 & 3-Sigil Combo Ult HUD
  private readonly minimapBox = this.q('#minimap-box');
  private readonly minimapZoneName = this.q('#minimap-zone-name');
  private readonly minimapPct = this.q('#minimap-pct');
  private readonly minimapCanvas = this.q('#minimap-canvas') as HTMLCanvasElement;
  private readonly minimapCtx = this.minimapCanvas.getContext('2d');
  private readonly slotQName = this.q('#slot-q .skill-name');
  private readonly tSlotQName = this.q('#btn-skill-q .t-lbl');
  private readonly slotRName = this.q('#slot-r .skill-name');
  private readonly tSlotRName = this.q('#btn-skill-r .t-lbl');
  private readonly sigilEls = [this.q('#sigil-0'), this.q('#sigil-1'), this.q('#sigil-2')];
  private readonly comboUltBtn = this.q('#btn-combo-ult');

  private readonly dangerWarning = this.q('#danger-warning');
  private readonly touchAtkBtn = this.q('#btn-attack');
  private readonly touchAtkLbl = this.q('#t-atk-lbl');
  private readonly touchDodgeBtn = this.q('#btn-dodge');
  private readonly touchBlockBtn = this.q('#btn-block');
  private readonly titleTagline = this.q('#title-tagline');
  private readonly pauseDesc = this.q('#pause-desc');
  private readonly comboBox = this.q('#combo-box');
  private readonly comboRank = this.q('#combo-rank');
  private readonly comboNum = this.q('#combo-num');
  private readonly subtitleBanner = this.q('#subtitle-banner');
  private readonly stageBanner = this.q('#stage-banner');
  private readonly stageBannerKicker = this.q('#stage-banner-kicker');
  private readonly stageBannerTitle = this.q('#stage-banner-title');
  private readonly calloutContainer = this.q('#callout-layer');

  // Title & 20-Stage Campaign Map elements
  private readonly appVersionBadge = this.q('#app-version-badge');
  private readonly pauseVersionBadge = this.q('#pause-version-badge');
  private readonly titleRealmBadge = this.q('#title-realm-badge');
  private readonly titleStarsText = this.q('#title-stars-text');
  private readonly titleJadePill = this.q('#title-jade-pill');
  private readonly titleClearText = this.q('#title-clear-text');
  private readonly titleSelectedStage = this.q('#title-selected-stage');
  private readonly titleSelectedMeta = this.q('#title-selected-meta');
  private readonly startBtn = this.q('#btn-start');

  // Shop Modal elements
  private readonly shopJadeBalance = this.q('#shop-jade-balance');
  private readonly shopPowerPill = this.q('#shop-power-pill');
  private readonly shopToastEl = this.q('#shop-toast');
  private readonly shopTabsEl = this.q('#shop-tabs');
  private readonly shopBagBar = this.q('#shop-bag-bar');
  private readonly shopGridEl = this.q('#shop-item-grid');
  private readonly shopPowerSummary = this.q('#shop-power-summary');
  private readonly shopBattleBtn = this.q('#btn-shop-battle');

  // Dungeon & Bounty Modal elements
  private readonly dungeonPowerPill = this.q('#dungeon-power-pill');
  private readonly dungeonPityPill = this.q('#dungeon-pity-pill');
  private readonly dungeonToastEl = this.q('#dungeon-toast');
  private readonly dungeonCardGrid = this.q('#dungeon-card-grid');
  private readonly bountyGrid = this.q('#bounty-grid');
  private readonly dungeonBountyDot = this.q('#dungeon-bounty-dot');

  // Dialogue Modal elements
  private readonly dlgKicker = this.q('#dlg-kicker');
  private readonly dlgTitle = this.q('#dlg-title');
  private readonly dlgIntel = this.q('#dlg-intel');
  private readonly dlgLines = this.q('#dlg-lines');

  private readonly mapRealmPill = this.q('#map-realm-pill');
  private readonly mapRealmBuff = this.q('#map-realm-buff');
  private readonly mapStarsPill = this.q('#map-stars-pill');
  private readonly chapterTabsEl = this.q('#chapter-tabs');
  private readonly chapterLoreEl = this.q('#chapter-lore-bar');
  private readonly stageGridEl = this.q('#stage-card-grid');
  private readonly campaignDetailEl = this.q('#campaign-detail-box');
  private readonly mapLaunchBtn = this.q('#btn-map-launch');
  private readonly mapCoopBtn = this.q('#btn-map-coop');

  // Result modal elements
  private readonly resultModalCard = this.q('#result-modal-card');
  private readonly resultStageTag = this.q('#result-stage-tag');
  private readonly resultTitle = this.q('#result-title');
  private readonly resultStarsRow = this.q('#result-stars-row');
  private readonly resultJadeGain = this.q('#result-jade-gain');
  private readonly resultStats = this.q('#result-stats');
  private readonly resultLootRow = this.q('#result-loot-row');
  private readonly resultBlessingWrap = this.q('#result-blessing-wrap');
  private readonly resultBlessingGrid = this.q('#result-blessing-grid');
  private readonly nextStageBtn = this.q('#btn-next-stage');
  private readonly retryBtn = this.q('#btn-retry');

  private readonly muteBtn = this.q('#btn-mute');
  private readonly wheelToggleBtn = this.q('#btn-wheel-toggle');
  private readonly lolToggleBtn = this.q('#btn-lol-toggle');
  private readonly mpHudBadge = this.q('#mp-hud-badge');

  // Online lobby controls
  private readonly mpCodeInput = this.q('#mp-code-input') as HTMLInputElement;
  private readonly mpStatusBar = this.q('#mp-status-bar');
  private readonly mpStatusText = this.q('#mp-status-text');
  private readonly mpConnDot = this.q('#mp-conn-dot');

  private selectedStage = 1;
  private activeChapter: 1 | 2 | 3 | 4 = 1;
  private activeShopCategory: EquipCategory | 'bag' = 'weapon';
  private saveStore: CampaignSaveStore | null = null;
  private selectedBlessingId: string | undefined;
  private pendingNextStageId: number | null = null;
  private pendingDungeonId: string | null = null;
  private currentScreenMode: ScreenMode = 'title';
  private subtitleTimer = 0;
  private stageBannerTimer = 0;
  private wheelForced = false;
  private shopToastTimer: number | null = null;
  private dungeonToastTimer: number | null = null;

  constructor(private readonly callbacks: HudCallbacks) {
    this.appVersionBadge.textContent = `v${APP_VERSION}`;
    this.pauseVersionBadge.textContent = `v${APP_VERSION}`;
    const bindImg = (id: string, src: string) => {
      (this.q(id) as HTMLImageElement).src = src;
    };
    bindImg('#img-q', iconYujian);
    bindImg('#img-e', iconWanjian);
    bindImg('#img-r', iconTianjian);
    bindImg('#img-f', iconHulu);
    bindImg('#t-img-q', iconYujian);
    bindImg('#t-img-e', iconWanjian);
    bindImg('#t-img-r', iconTianjian);
    bindImg('#t-img-f', iconHulu);
    bindImg('#t-img-atk', medalAttack);
    bindImg('#t-img-dodge', medalDodge);
    bindImg('#t-img-parry', medalParry);

    const params = new URLSearchParams(window.location.search);
    if (isPureMobileDevice()) {
      this.applyMobileMode(true);
    } else if (params.has('wheel')) {
      this.setWheelForced(true);
    }

    this.startBtn.addEventListener('click', () => this.callbacks.onStart(this.selectedStage));
    this.q('#btn-open-dungeon').addEventListener('click', () => this.openDungeon());
    this.q('#btn-open-campaign').addEventListener('click', () => this.openCampaignMap());
    this.q('#btn-open-shop').addEventListener('click', () => this.openShop());
    this.q('#btn-close-dungeon').addEventListener('click', () => this.closeDungeon());
    this.q('#btn-close-campaign').addEventListener('click', () => this.closeCampaignMap());
    this.q('#btn-close-shop').addEventListener('click', () => this.closeShop());
    this.shopBattleBtn.addEventListener('click', () => {
      this.closeShop();
      if (this.currentScreenMode === 'paused') {
        this.callbacks.onTogglePause();
      } else {
        this.callbacks.onStart(this.selectedStage);
      }
    });
    this.q('#btn-dialogue-confirm').addEventListener('click', () => this.callbacks.onConfirmDialogue());
    this.q('#btn-pause-shop').addEventListener('click', () => this.openShop());
    this.q('#btn-result-shop').addEventListener('click', () => this.openShop());
    this.mapLaunchBtn.addEventListener('click', () => {
      this.closeCampaignMap();
      this.callbacks.onStart(this.selectedStage);
    });
    this.mapCoopBtn.addEventListener('click', () => {
      this.closeCampaignMap();
      this.callbacks.onMpCreate('coop', this.selectedStage);
    });

    this.nextStageBtn.addEventListener('click', () => {
      if (this.pendingDungeonId) {
        this.callbacks.onStartDungeon(this.pendingDungeonId);
      } else if (this.pendingNextStageId) {
        this.callbacks.onNextStage(this.pendingNextStageId, this.selectedBlessingId);
      }
    });
    this.retryBtn.addEventListener('click', () => this.callbacks.onRetry());
    this.q('#btn-resume').addEventListener('click', () => this.callbacks.onTogglePause());
    this.q('#btn-restart-pause').addEventListener('click', () => this.callbacks.onRetry());
    this.q('#btn-pause').addEventListener('click', () => this.callbacks.onTogglePause());
    this.q('#btn-pause-map').addEventListener('click', () => {
      this.callbacks.onBackToTitle();
      this.openCampaignMap();
    });
    this.q('#btn-pause-title').addEventListener('click', () => this.callbacks.onBackToTitle());
    this.q('#btn-result-map').addEventListener('click', () => {
      this.callbacks.onBackToTitle();
      this.openCampaignMap();
    });
    this.q('#btn-result-title').addEventListener('click', () => this.callbacks.onBackToTitle());

    this.wheelToggleBtn.addEventListener('click', () => {
      this.setWheelForced(!this.wheelForced);
    });

    this.lolToggleBtn.addEventListener('click', () => {
      const isLol = this.callbacks.onToggleLolMode();
      this.lolToggleBtn.textContent = isLol ? '联盟鼠标' : '经典WASD';
      this.lolToggleBtn.classList.toggle('active-mode', isLol);
    });

    this.muteBtn.addEventListener('click', () => {
      const muted = this.callbacks.onToggleMute();
      this.muteBtn.textContent = muted ? '静音' : '音律';
      this.muteBtn.classList.toggle('active-mode', muted);
    });

    for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>('.util-btn'))) {
      btn.addEventListener('click', () => btn.blur());
    }

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.isComposing || e.repeat) return;
      if (
        this.currentScreenMode === 'dialogue' &&
        !this.campaignOverlay.classList.contains('visible') &&
        !this.shopOverlay.classList.contains('visible') &&
        !this.dungeonOverlay.classList.contains('visible') &&
        (e.code === 'Enter' || e.code === 'Space')
      ) {
        e.preventDefault();
        this.callbacks.onConfirmDialogue();
      }
    });

    this.q('#btn-mp-coop').addEventListener('click', () => this.callbacks.onMpCreate('coop', this.selectedStage));
    this.q('#btn-mp-solo').addEventListener('click', () => this.callbacks.onMpCreate('solo', 20));
    this.q('#btn-mp-join').addEventListener('click', () => {
      const code = this.mpCodeInput.value.trim();
      if (code.length >= 4) {
        this.callbacks.onMpJoin(code);
      } else {
        this.setMpLobbyStatus('请输入 4 位数字房间码', false);
      }
    });
    this.q('#btn-mp-quick').addEventListener('click', () => this.callbacks.onMpQuick('coop', this.selectedStage));
    this.q('#btn-mp-leave').addEventListener('click', () => this.callbacks.onMpLeave());
    this.comboUltBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onCastComboUlt?.();
      this.comboUltBtn.blur();
    });
  }

  syncCampaignProgress(store: CampaignSaveStore, focusStage?: number): void {
    this.saveStore = store;
    const totalStars = store.getTotalStars();
    const clearedCount = store.getClearedCount();
    const realm = getSwordRealm(totalStars);
    const jade = store.getJade();
    const targetStage = focusStage ?? this.selectedStage ?? store.getRecommendedStage();
    this.selectedStage = clamp(Math.floor(targetStage), 1, CAMPAIGN_STAGES.length);
    const stDef = getStageDef(this.selectedStage);
    this.activeChapter = stDef.chapter;

    this.titleRealmBadge.textContent = realm.title;
    this.titleStarsText.textContent = `★ ${totalStars} / 60`;
    this.titleJadePill.textContent = `◆ ${jade} 灵石`;
    this.titleClearText.textContent = `已破 ${clearedCount} / 20 关`;
    this.hudRealmName.textContent = realm.title;

    this.mapRealmPill.textContent = realm.title;
    this.mapRealmBuff.textContent = `气血+${realm.hpBonus} · 剑伤+${Math.round((realm.dmgMult - 1) * 100)}%`;
    this.mapStarsPill.textContent = `★ ${totalStars} / 60`;

    this.updateSelectedStageLabels();
    this.renderCampaignModal();
    this.renderShopModal();
    this.renderDungeonModal();
    const hasClaimableBounty = store.getBountyStates().some((b) => b.done && !b.claimed);
    this.dungeonBountyDot.classList.toggle('visible', hasClaimableBounty);
  }

  openDungeon(): void {
    this.renderDungeonModal();
    this.dungeonOverlay.classList.add('visible');
  }

  closeDungeon(): void {
    this.dungeonOverlay.classList.remove('visible');
  }

  private showDungeonToast(text: string, ok: boolean): void {
    this.dungeonToastEl.textContent = text;
    this.dungeonToastEl.classList.toggle('err', !ok);
    this.dungeonToastEl.classList.add('visible');
    if (this.dungeonToastTimer !== null) {
      window.clearTimeout(this.dungeonToastTimer);
    }
    this.dungeonToastTimer = window.setTimeout(() => {
      this.dungeonToastEl.classList.remove('visible');
      this.dungeonToastTimer = null;
    }, 2400);
  }

  private renderDungeonModal(): void {
    const store = this.saveStore;
    if (!store) return;

    const equipped = store.getEquipped();
    const stats = computeHeroLoadoutStats(equipped, store.data.upgrades, store.getInventory());
    const realm = getSwordRealm(store.getTotalStars());
    const power = computeCombatPower(realm.hpBonus, realm.dmgMult, stats);
    const pity = store.getPityCount();

    this.dungeonPowerPill.textContent = `剑道战力 ${power}`;
    this.dungeonPityPill.textContent = `极品保底 ${pity}/5`;
    this.dungeonPityPill.classList.toggle('ready', pity >= 4);

    this.dungeonCardGrid.innerHTML = '';
    for (const d of DUNGEON_LIST) {
      const clears = store.getDungeonClears(d.id);
      const metPower = power >= d.recommendedPower;
      const card = document.createElement('div');
      card.className = `dungeon-card tier-${d.tier}`;
      card.innerHTML = `
        <div class="dg-top">
          <span class="dg-tier">第 ${d.tier} 阶秘境</span>
          <span class="dg-clears">已刷 ${clears} 次</span>
        </div>
        <div class="dg-name">${d.name}</div>
        <div class="dg-sub">${d.subtitle}</div>
        <div class="dg-meta">
          <div class="dg-boss">镇守：<strong>${d.bossTitle}</strong></div>
          <div class="dg-drop">${d.dropRateText}</div>
          <div class="dg-power ${metPower ? 'met' : 'warn'}">推荐战力 ${d.recommendedPower}（${metPower ? '已达标' : '战力偏低'}）</div>
        </div>
        <button type="button" class="xianxia-btn primary dg-enter-btn">挑战爆装 · ◆+${d.jadeReward}</button>
      `;
      card.querySelector('.dg-enter-btn')?.addEventListener('click', () => {
        this.closeDungeon();
        this.callbacks.onStartDungeon(d.id);
      });
      this.dungeonCardGrid.appendChild(card);
    }

    const bounties = store.getBountyStates();
    this.bountyGrid.innerHTML = '';
    for (const b of bounties) {
      const rewardLabel = `◆+${b.def.rewardJade}${b.def.rewardRarity ? ` + ${RARITY_LABELS[b.def.rewardRarity]}装` : ''}`;
      const progressText = `${Math.min(b.progress, b.def.target)} / ${b.def.target}`;
      const card = document.createElement('div');
      card.className = `bounty-card${b.done && !b.claimed ? ' ready' : ''}${b.claimed ? ' claimed' : ''}`;
      const actionHtml = b.claimed
        ? '<span class="bounty-status claimed">已领</span>'
        : b.done
          ? `<button type="button" class="bounty-claim-btn" data-bounty-id="${b.def.id}">领取</button>`
          : '<span class="bounty-status">进行中</span>';
      card.innerHTML = `
        <div class="bn-top">
          <strong class="bn-title">${b.def.title}</strong>
          <span class="bn-reward">${rewardLabel}</span>
        </div>
        <div class="bn-desc">${b.def.desc}</div>
        <div class="bn-foot">
          <span class="bn-prog">${progressText}</span>
          ${actionHtml}
        </div>
      `;
      card.querySelector<HTMLButtonElement>('button[data-bounty-id]')?.addEventListener('click', () => {
        const res = this.callbacks.onClaimBounty(b.def.id);
        if (res.ok) {
          const dropTxt = res.droppedItem ? ` · 获【${res.droppedItem.name}】` : '';
          this.showDungeonToast(`赏格已领：+◆${res.jade}${dropTxt}`, true);
        } else {
          this.showDungeonToast(res.reason, false);
        }
        this.syncCampaignProgress(store, this.selectedStage);
      });
      this.bountyGrid.appendChild(card);
    }
  }

  openCampaignMap(chapterId?: 1 | 2 | 3 | 4): void {
    if (chapterId) this.activeChapter = chapterId;
    else this.activeChapter = getStageDef(this.selectedStage).chapter;
    this.renderCampaignModal();
    this.campaignOverlay.classList.add('visible');
  }

  closeCampaignMap(): void {
    this.campaignOverlay.classList.remove('visible');
  }

  openShop(cat?: EquipCategory | 'bag'): void {
    if (cat) this.activeShopCategory = cat;
    this.renderShopModal();
    this.shopOverlay.classList.add('visible');
  }

  closeShop(): void {
    this.shopOverlay.classList.remove('visible');
  }

  showStageDialogue(dlg: StageDialogueDef): void {
    this.dlgKicker.textContent = dlg.kicker;
    this.dlgTitle.textContent = dlg.title;
    this.dlgIntel.innerHTML = dlg.intel.map((t) => `<span class="dlg-chip">${t}</span>`).join('');
    this.dlgLines.innerHTML = dlg.lines
      .map(
        (line) => `
      <div class="dlg-line role-${line.role}">
        <span class="dlg-seal">${line.seal}</span>
        <div class="dlg-bubble">
          <div class="dlg-speaker">${line.speaker}</div>
          <div class="dlg-text">${line.text}</div>
        </div>
      </div>`,
      )
      .join('');
    this.setMode('dialogue');
  }

  private renderShopModal(): void {
    const store = this.saveStore;
    if (!store) return;

    const jade = store.getJade();
    const equipped = store.getEquipped();
    const inventory = store.getInventory();
    const stats = computeHeroLoadoutStats(equipped, store.data.upgrades, inventory);
    const realm = getSwordRealm(store.getTotalStars());
    const power = computeCombatPower(realm.hpBonus, realm.dmgMult, stats);

    this.shopJadeBalance.textContent = `◆ ${jade} 灵石`;
    this.shopPowerPill.textContent = `剑道战力 ${power}`;

    const totalHp = realm.hpBonus + stats.maxHpBonus;
    const totalAtkPct = Math.round((realm.dmgMult * stats.dmgMult - 1) * 100);
    const critPct = Math.round(stats.critRate * 100);
    const reducePct = Math.round(stats.dmgReduce * 100);
    const extras: string[] = [];
    if (stats.lifesteal > 0) extras.push(`吸血${Math.round(stats.lifesteal * 100)}%`);
    if (stats.parryReflectBonus > 0) extras.push(`弹反反伤+${Math.round(stats.parryReflectBonus * 100)}%`);
    if (stats.killHealPct > 0) extras.push(`斩敌回血${Math.round(stats.killHealPct * 100)}%`);
    this.shopPowerSummary.textContent = `总加护：气血+${totalHp} · 剑伤+${totalAtkPct}% · 暴击${critPct}% · 减伤${reducePct}%${extras.length ? ` · ${extras.join(' · ')}` : ''}`;
    this.shopBattleBtn.textContent = this.currentScreenMode === 'paused' ? '返回试剑' : `出征 第 ${this.selectedStage} 关`;

    const prevScrollTop = this.shopGridEl.scrollTop;

    this.shopTabsEl.innerHTML = '';
    const categories: EquipCategory[] = ['weapon', 'armor', 'relic', 'skin'];
    for (const cat of categories) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = `shop-tab${cat === this.activeShopCategory ? ' active' : ''}`;
      tab.innerHTML = `<strong>${CATEGORY_LABELS[cat]}</strong><span>${store.getEquippedItemName(cat)}</span>`;
      tab.addEventListener('click', () => {
        this.activeShopCategory = cat;
        this.shopGridEl.scrollTop = 0;
        this.renderShopModal();
      });
      this.shopTabsEl.appendChild(tab);
    }

    const bagTab = document.createElement('button');
    bagTab.type = 'button';
    bagTab.className = `shop-tab bag-tab${this.activeShopCategory === 'bag' ? ' active' : ''}`;
    bagTab.innerHTML = `<strong>打宝背包</strong><span>${inventory.length}/${MAX_INVENTORY_SIZE}</span>`;
    bagTab.addEventListener('click', () => {
      this.activeShopCategory = 'bag';
      this.shopGridEl.scrollTop = 0;
      this.renderShopModal();
    });
    this.shopTabsEl.appendChild(bagTab);

    this.shopGridEl.innerHTML = '';

    if (this.activeShopCategory === 'bag') {
      const equippedSet = new Set(Object.values(equipped));
      const hasSalvageableLow = inventory.some(
        (g) => !equippedSet.has(g.uid) && (g.rarity === 'common' || g.rarity === 'rare'),
      );
      this.shopBagBar.classList.add('visible');
      this.shopBagBar.innerHTML = `
        <span class="bag-cap-txt">秘境背囊 ${inventory.length} / ${MAX_INVENTORY_SIZE}（已穿戴装备不会分解）</span>
        <button id="btn-salvage-low" type="button" class="shop-salvage-low-btn"${hasSalvageableLow ? '' : ' disabled'}>一键分解 凡/灵品</button>
      `;
      this.shopBagBar.querySelector<HTMLButtonElement>('#btn-salvage-low')?.addEventListener('click', () => {
        const res = this.callbacks.onSalvageLow('rare');
        this.showShopToast(
          res.count > 0 ? `分解 ${res.count} 件凡/灵品 · 获得 ◆${res.jade}` : '暂无可分解的未穿戴凡/灵品',
          res.count > 0,
        );
        this.renderShopModal();
      });

      const sorted = [...inventory].sort((a, b) => b.powerScore - a.powerScore);
      if (sorted.length === 0) {
        this.shopGridEl.innerHTML =
          '<div class="bag-empty-state">背囊空空如也。前往「秘境打宝」斩妖除魔，即可掉落随机品质与极品词条神兵！</div>';
      } else {
        for (const item of sorted) {
          const isEquipped = equipped[item.category] === item.uid;
          const eqScore = store.getEquippedScore(item.category);
          const scoreDelta = item.powerScore - eqScore;
          const canForge = item.forgeLevel < MAX_FORGE_LEVEL;
          const forgeCost = canForge ? getRolledUpgradeCost(item) : 0;
          const canAffordForge = jade >= forgeCost;
          const salvageJade = getSalvageJade(item);

          const card = document.createElement('div');
          card.className = `shop-card bag-card rarity-${item.rarity}${isEquipped ? ' equipped' : ''}`;
          card.dataset.uid = item.uid;

          const lvTag = item.forgeLevel > 0 ? `<span class="forge-lv">+${item.forgeLevel}</span>` : '';
          const eqTag = isEquipped ? '<span class="eq-pill">已穿戴</span>' : '';
          const deltaHtml =
            !isEquipped && scoreDelta > 0
              ? `<span class="power-delta-up">↑ +${scoreDelta} 战力</span>`
              : '';
          const affixHtml = item.affixes
            .map(
              (af) =>
                `<span class="bag-affix${af.tier === 'prime' ? ' prime' : ''}">${af.tier === 'prime' ? '【极品】' : ''}${af.label}</span>`,
            )
            .join('');

          const equipBtn = isEquipped
            ? '<span class="shop-done-lbl">生效中</span>'
            : `<button type="button" class="shop-act-btn equip" data-bag-act="equip">穿戴</button>`;
          const forgeBtn = canForge
            ? `<button type="button" class="shop-act-btn forge${canAffordForge ? '' : ' locked'}" data-bag-act="upgrade"${canAffordForge ? '' : ' disabled'}>淬炼 ◆${forgeCost}</button>`
            : '<span class="shop-done-lbl max">满阶</span>';
          const salvageBtn = `<button type="button" class="shop-act-btn salvage" data-bag-act="salvage">分解 +◆${salvageJade}</button>`;

          card.innerHTML = `
            <div class="shop-card-top">
              <span class="rarity-pill rarity-${item.rarity}">${RARITY_LABELS[item.rarity]}</span>
              <span class="shop-badge">${CATEGORY_LABELS[item.category]}</span>
              <span class="quality-pill">品质 ${item.qualityPct}%</span>
              ${lvTag}${eqTag}
            </div>
            <div class="shop-card-mid">
              <div class="shop-card-name">${item.name}</div>
            </div>
            <div class="bag-power-row">
              <span class="bag-power-score">战力 ${item.powerScore}</span>
              ${deltaHtml}
            </div>
            <div class="bag-affix-list">${affixHtml}</div>
            <div class="shop-card-actions">${equipBtn}${forgeBtn}${salvageBtn}</div>
          `;

          card.querySelector('[data-bag-act="equip"]')?.addEventListener('click', () => {
            const ok = this.callbacks.onEquipRolled(item.uid);
            if (ok) this.showShopToast(`已穿戴「${item.name}」`, true);
            this.renderShopModal();
          });
          card.querySelector('[data-bag-act="upgrade"]')?.addEventListener('click', () => {
            const res = this.callbacks.onUpgradeRolled(item.uid);
            this.showShopToast(res.ok ? `「${item.name}」淬炼至 +${res.level}` : res.reason, res.ok);
            this.renderShopModal();
          });
          card.querySelector('[data-bag-act="salvage"]')?.addEventListener('click', () => {
            const res = this.callbacks.onSalvageRolled(item.uid);
            this.showShopToast(res.ok ? `分解「${item.name}」· +◆${res.jade}` : res.reason, res.ok);
            this.renderShopModal();
          });

          this.shopGridEl.appendChild(card);
        }
      }

      this.shopGridEl.scrollTop = prevScrollTop;
      return;
    }

    this.shopBagBar.classList.remove('visible');
    this.shopBagBar.innerHTML = '';

    const items = SHOP_ITEMS.filter((it) => it.category === this.activeShopCategory);
    for (const item of items) {
      const owned = store.isOwned(item.id);
      const isEquipped = equipped[item.category] === item.id;
      const lv = store.getUpgradeLevel(item.id);
      const canForge = owned && item.category !== 'skin' && lv < MAX_FORGE_LEVEL;
      const forgeCost = canForge ? getUpgradeCost(item, lv) : 0;

      const card = document.createElement('div');
      card.className = `shop-card rarity-${item.rarity}${isEquipped ? ' equipped' : ''}`;
      card.dataset.itemId = item.id;

      let swatchHtml = '';
      if (item.skinVisual) {
        swatchHtml = `<div class="swatch-row"><span class="swatch" style="background:${item.skinVisual.primaryHex}"></span><span class="swatch" style="background:${item.skinVisual.secondaryHex}"></span><span class="swatch" style="background:${item.skinVisual.accentHex}"></span></div>`;
      } else if (item.weaponVisual) {
        swatchHtml = `<div class="swatch-row"><span class="swatch" style="background:${item.weaponVisual.steelHex}"></span><span class="swatch" style="background:${item.weaponVisual.emissiveHex}"></span></div>`;
      }

      const lvTag = item.category !== 'skin' && lv > 0 ? `<span class="forge-lv">+${lv}</span>` : '';
      const eqTag = isEquipped ? '<span class="eq-pill">已穿戴</span>' : '';

      let actionsHtml = '';
      if (!owned) {
        const afford = jade >= item.price;
        actionsHtml = `<button type="button" class="shop-act-btn buy${afford ? '' : ' locked'}" data-act="buy" data-id="${item.id}"${afford ? '' : ' disabled'}>购入 ◆${item.price}</button>`;
      } else {
        const equipBtn = isEquipped
          ? '<span class="shop-done-lbl">生效中</span>'
          : `<button type="button" class="shop-act-btn equip" data-act="equip" data-id="${item.id}">穿戴</button>`;
        const canAffordForge = jade >= forgeCost;
        const forgeBtn =
          item.category === 'skin'
            ? ''
            : lv >= MAX_FORGE_LEVEL
              ? '<span class="shop-done-lbl max">满阶 +5</span>'
              : `<button type="button" class="shop-act-btn forge${canAffordForge ? '' : ' locked'}" data-act="upgrade" data-id="${item.id}"${canAffordForge ? '' : ' disabled'}>淬炼 ◆${forgeCost}</button>`;
        actionsHtml = `${equipBtn}${forgeBtn}`;
      }

      card.innerHTML = `
        <div class="shop-card-top">
          <span class="rarity-pill rarity-${item.rarity}">${RARITY_LABELS[item.rarity]}</span>
          <span class="shop-badge">${item.badge}</span>
          ${lvTag}${eqTag}
        </div>
        <div class="shop-card-mid">
          ${swatchHtml}
          <div class="shop-card-name">${item.name}</div>
        </div>
        <div class="shop-card-desc">${item.desc}</div>
        <div class="shop-card-actions">${actionsHtml}</div>
      `;

      for (const btn of Array.from(card.querySelectorAll<HTMLButtonElement>('button[data-act]'))) {
        btn.addEventListener('click', () => {
          const act = btn.dataset.act;
          const id = btn.dataset.id ?? '';
          if (act === 'buy') {
            const res = this.callbacks.onShopBuy(id);
            this.showShopToast(res.ok ? `已购入并穿戴「${item.name}」` : res.reason, res.ok);
          } else if (act === 'equip') {
            const ok = this.callbacks.onShopEquip(id);
            if (ok) this.showShopToast(`已换装「${item.name}」`, true);
          } else if (act === 'upgrade') {
            const res = this.callbacks.onShopUpgrade(id);
            this.showShopToast(res.ok ? `「${item.name}」淬炼至 +${res.level}` : res.reason, res.ok);
          }
          this.renderShopModal();
        });
      }

      this.shopGridEl.appendChild(card);
    }

    this.shopGridEl.scrollTop = prevScrollTop;
  }

  private showShopToast(text: string, ok: boolean): void {
    this.shopToastEl.textContent = text;
    this.shopToastEl.classList.toggle('err', !ok);
    this.shopToastEl.classList.add('visible');
    if (this.shopToastTimer !== null) {
      window.clearTimeout(this.shopToastTimer);
    }
    this.shopToastTimer = window.setTimeout(() => {
      this.shopToastEl.classList.remove('visible');
      this.shopToastTimer = null;
    }, 2200);
  }

  selectStage(stageId: number): void {
    this.selectedStage = clamp(Math.floor(stageId), 1, CAMPAIGN_STAGES.length);
    const st = getStageDef(this.selectedStage);
    this.activeChapter = st.chapter;
    this.updateSelectedStageLabels();
    this.renderCampaignModal();
  }

  private updateSelectedStageLabels(): void {
    const st = getStageDef(this.selectedStage);
    const ch = getChapterDef(st.chapter);
    this.titleSelectedStage.textContent = `当前目标：第 ${st.id} 关 · ${st.name}`;
    this.titleSelectedMeta.textContent = `${ch.roman} ${ch.name} · ${st.badge}`;
    this.startBtn.textContent = `仗剑出征 · 第 ${st.id} 关`;
    this.mapLaunchBtn.textContent = `单人挑战第 ${st.id} 关`;
    this.mapCoopBtn.textContent = `双人组队第 ${st.id} 关`;
  }

  private renderCampaignModal(): void {
    const store = this.saveStore;
    const recommended = store?.getRecommendedStage() ?? 1;

    // 1. Render 4 Chapter Tabs
    this.chapterTabsEl.innerHTML = '';
    for (const ch of CHAPTERS) {
      let chStars = 0;
      for (let id = ch.stageRange[0]; id <= ch.stageRange[1]; id++) {
        chStars += store?.getStageRecord(id)?.stars ?? 0;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `chapter-tab${ch.id === this.activeChapter ? ' active' : ''}`;
      btn.style.setProperty('--ch-accent', ch.accentHex);
      btn.innerHTML = `<span class="ch-roman">${ch.roman}</span><strong>${ch.name}</strong><span class="ch-stars">★ ${chStars}/15</span>`;
      btn.addEventListener('click', () => {
        this.activeChapter = ch.id;
        // If current selectedStage isn't in this chapter, auto-focus first stage of chapter
        const cur = getStageDef(this.selectedStage);
        if (cur.chapter !== ch.id) {
          this.selectedStage = ch.stageRange[0];
          this.updateSelectedStageLabels();
        }
        this.renderCampaignModal();
      });
      this.chapterTabsEl.appendChild(btn);
    }

    // 2. Chapter Lore Strip
    const activeCh = getChapterDef(this.activeChapter);
    this.chapterLoreEl.style.setProperty('--ch-accent', activeCh.accentHex);
    this.chapterLoreEl.innerHTML = `<b>${activeCh.roman} · ${activeCh.name}（第 ${activeCh.stageRange[0]}–${activeCh.stageRange[1]} 关）</b><span>${activeCh.lore}</span>`;

    // 3. Render 5 Stage Cards for Active Chapter
    this.stageGridEl.innerHTML = '';
    const chapterStages = CAMPAIGN_STAGES.filter((s) => s.chapter === this.activeChapter);
    for (const st of chapterStages) {
      const rec = store?.getStageRecord(st.id) ?? null;
      const earned = rec?.stars ?? 0;
      const isSelected = st.id === this.selectedStage;
      const isRec = st.id === recommended;
      const card = document.createElement('button');
      card.type = 'button';
      card.dataset.stageId = String(st.id);
      card.className = `stage-card${isSelected ? ' selected' : ''}${st.isBossStage ? ' boss-card' : ''}${earned > 0 ? ' cleared' : ''}`;
      const starHtml = [1, 2, 3]
        .map((n) => `<span class="sc-star${n <= earned ? ' lit' : ''}">★</span>`)
        .join('');
      const hazardChip = st.hazardLabel ? `<span class="sc-hazard">${st.hazardLabel}</span>` : '';
      const recTag = isRec ? '<span class="sc-rec">推荐</span>' : '';
      card.innerHTML = `
        <div class="sc-top">
          <span class="sc-num">第 ${st.id} 关</span>
          <span class="sc-badge${st.isBossStage ? ' boss' : ''}">${st.badge}</span>
          ${recTag}
        </div>
        <div class="sc-name">${st.name}</div>
        <div class="sc-sub">${st.subtitle}</div>
        <div class="sc-tags">
          <span class="sc-wave">${st.waves.length}波</span>
          <span class="sc-time">${st.parTimeSec}s</span>
          ${hazardChip}
        </div>
        <div class="sc-stars">${starHtml}</div>
      `;
      card.addEventListener('click', () => {
        this.selectedStage = st.id;
        this.updateSelectedStageLabels();
        this.renderCampaignModal();
      });
      this.stageGridEl.appendChild(card);
    }

    // 4. Selected Stage Detail Footer
    const sel = getStageDef(this.selectedStage);
    const totalEnemies = sel.waves.reduce((acc, w) => acc + w.enemies.length, 0);
    const rec = store?.getStageRecord(sel.id);
    const bestStr = rec ? `最佳 ${Math.round(rec.bestTime)}s · ${rec.maxCombo}连` : '尚未首通';
    this.campaignDetailEl.innerHTML = `
      <div class="cd-title">第 ${sel.id} 关 · ${sel.name} <span>（推荐：${sel.recommendedRealm}）</span></div>
      <div class="cd-sub">${sel.waves.length} 波共 ${totalEnemies} 敌 · 三星时限 ${sel.parTimeSec}s${sel.hazardLabel ? ` · 场地机制：${sel.hazardLabel}` : ''} · ${bestStr}</div>
    `;
  }

  setRealmAndBlessings(realmTitle: string, blessingCount: number): void {
    this.hudRealmName.textContent = realmTitle;
    if (blessingCount > 0) {
      this.hudBlessingPill.textContent = `赐福×${blessingCount}`;
      this.hudBlessingPill.classList.add('visible');
    } else {
      this.hudBlessingPill.textContent = '';
      this.hudBlessingPill.classList.remove('visible');
    }
  }

  applyMobileMode(enabled: boolean): void {
    this.appRoot.classList.toggle('mobile-mode', enabled);
    this.pauseDesc.textContent = '暂歇剑势，随时继续试剑。';
    if (enabled) {
      this.setWheelForced(true);
      this.titleTagline.textContent = '写实 3D 仙侠四章二十关闯关 · 三星评星与剑道境界养成 · 手机双摇杆王者轮盘 · 跨端双人联机。';
    } else {
      this.titleTagline.textContent = '写实 3D 仙侠四章二十关闯关 · 三星评星与剑道境界养成 · 电脑联盟鼠标 / 手机王者轮盘 · 跨端双人联机。';
    }
  }

  setWheelForced(enabled: boolean): void {
    this.wheelForced = enabled;
    this.appRoot.classList.toggle('force-wheel', enabled);
    this.wheelToggleBtn.textContent = enabled ? '键鼠' : '轮盘';
    this.wheelToggleBtn.classList.toggle('active-mode', enabled);
  }

  setHeroName(name: string): void {
    this.heroTitleName.textContent = name;
  }

  setMpLobbyStatus(text: string, connected: boolean, showLeave = false): void {
    this.mpConnDot.classList.toggle('online', connected);
    if (!text) {
      this.mpStatusBar.classList.remove('visible');
      this.mpStatusText.textContent = '';
      return;
    }
    this.mpStatusText.textContent = text;
    this.mpStatusBar.classList.add('visible');
    this.q('#btn-mp-leave').style.display = showLeave ? 'inline-flex' : 'none';
  }

  setMpHudBadge(text: string): void {
    if (!text) {
      this.mpHudBadge.classList.remove('visible');
      this.mpHudBadge.textContent = '';
      return;
    }
    this.mpHudBadge.textContent = text;
    this.mpHudBadge.classList.add('visible');
  }

  triggerSkillPulse(slot: 'Q' | 'E' | 'R' | 'F'): void {
    const els =
      slot === 'Q'
        ? [this.slotQ, this.tSlotQ]
        : slot === 'E'
          ? [this.slotE, this.tSlotE]
          : slot === 'R'
            ? [this.slotR, this.tSlotR]
            : [this.slotF, this.tSlotF];
    for (const el of els) {
      el.classList.remove('cast-pulse');
      void el.offsetWidth;
      el.classList.add('cast-pulse');
    }
  }

  setMode(mode: ScreenMode): void {
    this.currentScreenMode = mode;
    this.titleOverlay.classList.toggle('visible', mode === 'title');
    this.dialogueOverlay.classList.toggle('visible', mode === 'dialogue');
    if (mode !== 'title') this.campaignOverlay.classList.remove('visible');
    if (mode === 'playing' || mode === 'cutscene' || mode === 'dialogue') {
      this.shopOverlay.classList.remove('visible');
      this.dungeonOverlay.classList.remove('visible');
    }
    this.hudRoot.classList.toggle('visible', mode === 'playing');
    this.touchRoot.classList.toggle('visible', mode === 'playing');
    this.pauseOverlay.classList.toggle('visible', mode === 'paused');
    this.resultOverlay.classList.toggle('visible', mode === 'victory' || mode === 'defeat');

    if (mode !== 'playing') {
      this.dangerWarning.classList.remove('visible');
      this.touchDodgeBtn.classList.remove('action-hint-dodge');
      this.touchBlockBtn.classList.remove('action-hint-parry');
      this.touchAtkBtn.classList.remove('shadow-ready');
      this.minimapBox.classList.remove('visible');
      this.comboUltBtn.classList.remove('visible');
      this.slotQ.classList.remove('q2-ready');
      this.tSlotQ.classList.remove('q2-ready');
      this.slotR.classList.remove('combo-ready');
      this.tSlotR.classList.remove('combo-ready');
    }
  }

  showStageBanner(kicker: string, title: string, duration = 2.6): void {
    this.stageBannerKicker.textContent = kicker;
    this.stageBannerTitle.textContent = title;
    this.stageBanner.classList.add('visible');
    this.stageBannerTimer = duration;
  }

  showSubtitle(line: string, duration = 3.2): void {
    this.subtitleBanner.textContent = line;
    this.subtitleBanner.classList.add('visible');
    this.subtitleTimer = duration;
  }

  clearSubtitle(): void {
    this.subtitleTimer = 0;
    this.subtitleBanner.classList.remove('visible');
    this.stageBannerTimer = 0;
    this.stageBanner.classList.remove('visible');
  }

  tickSubtitle(dt: number): void {
    if (this.subtitleTimer > 0) {
      this.subtitleTimer -= dt;
      if (this.subtitleTimer <= 0) {
        this.subtitleBanner.classList.remove('visible');
      }
    }
    if (this.stageBannerTimer > 0) {
      this.stageBannerTimer -= dt;
      if (this.stageBannerTimer <= 0) {
        this.stageBanner.classList.remove('visible');
      }
    }
  }

  spawnCallout(text: string, screenX: number, screenY: number, kind: 'dmg' | 'crit' | 'parry' | 'heal' | 'info'): void {
    const el = document.createElement('div');
    el.className = `callout callout-${kind}`;
    el.textContent = text;
    el.style.left = `${clamp(screenX, 60, window.innerWidth - 60)}px`;
    el.style.top = `${clamp(screenY, 70, window.innerHeight - 90)}px`;
    this.calloutContainer.appendChild(el);
    window.setTimeout(() => el.remove(), 880);
  }

  showResult(victory: boolean, elapsedSec: number, hero: HeroState, opts?: ResultDisplayOptions): void {
    const mins = Math.floor(elapsedSec / 60);
    const secs = Math.floor(elapsedSec % 60);
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const stageDef = opts?.stageDef;
    const dungeonDef = opts?.dungeonDef;
    const isFinalWin = victory && !dungeonDef && stageDef?.id === 20;
    this.resultModalCard.classList.toggle('win', victory);
    this.resultModalCard.classList.toggle('lose', !victory);
    this.resultStageTag.textContent = dungeonDef
      ? `${dungeonDef.name} · 秘境打宝`
      : stageDef
        ? `第 ${stageDef.id} 关 · ${stageDef.name}`
        : victory
          ? '剑台凯旋'
          : '剑势折戟';
    this.resultTitle.textContent =
      opts?.customTitle ??
      (dungeonDef
        ? victory
          ? `${dungeonDef.name} · 破阵凯旋`
          : '秘 境 折 戟'
        : isFinalWin
          ? '二 十 劫 破 · 剑 圣 加 冕'
          : victory
            ? `第 ${stageDef?.id ?? ''} 关 凯 旋`
            : '身 陨 剑 台');
    this.resultTitle.className = victory ? 'result-title win' : 'result-title lose';

    // 3-Star Seal Display
    if (victory && opts?.starResult) {
      const { stars } = opts.starResult;
      this.resultStarsRow.style.display = 'flex';
      this.resultStarsRow.innerHTML = [1, 2, 3]
        .map((n) => `<span class="big-star${n <= stars ? ' lit' : ''}">★</span>`)
        .join('');
    } else {
      this.resultStarsRow.style.display = 'none';
    }

    this.resultStats.innerHTML = `
      <div class="stat-item"><span>用时</span><strong>${timeStr}</strong></div>
      <div class="stat-item"><span>弹反</span><strong>${hero.parryCount} 次</strong></div>
      <div class="stat-item"><span>连击</span><strong>${hero.maxCombo} 连</strong></div>
    `;

    const droppedGear = opts?.droppedGear ?? [];
    if (droppedGear.length > 0) {
      const preview = droppedGear.slice(0, 3);
      const chips = preview
        .map((g) => `<span class="result-loot-chip rarity-${g.rarity}">${RARITY_LABELS[g.rarity]} · ${g.name}</span>`)
        .join('');
      const extra =
        droppedGear.length > 3
          ? `<span class="result-loot-chip more">+${droppedGear.length - 3}件</span>`
          : '';
      this.resultLootRow.style.display = 'flex';
      this.resultLootRow.innerHTML = `${chips}${extra}`;
    } else {
      this.resultLootRow.style.display = 'none';
      this.resultLootRow.innerHTML = '';
    }

    const jadeEarned = opts?.jadeEarned ?? hero.stageJadeEarned;
    if (jadeEarned > 0) {
      this.resultJadeGain.style.display = 'inline-flex';
      this.resultJadeGain.textContent = `◆ +${jadeEarned} 灵石`;
    } else {
      this.resultJadeGain.style.display = 'none';
    }

    // 3-Pick-1 Xianxia Blessing Cards when advancing to next stage
    this.pendingDungeonId = victory && dungeonDef ? dungeonDef.id : null;
    this.pendingNextStageId = !dungeonDef && victory && opts?.nextStageId ? opts.nextStageId : null;
    const choices = victory && this.pendingNextStageId ? opts?.blessingChoices ?? [] : [];
    if (choices.length > 0) {
      this.selectedBlessingId = choices[0].id;
      this.resultBlessingWrap.style.display = 'block';
      this.resultBlessingGrid.innerHTML = '';
      for (const b of choices) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `blessing-card${b.id === this.selectedBlessingId ? ' active' : ''}`;
        card.innerHTML = `
          <span class="bl-tag">${b.tag}</span>
          <strong class="bl-name">${b.name}</strong>
          <span class="bl-desc">${b.desc}</span>
        `;
        card.addEventListener('click', () => {
          this.selectedBlessingId = b.id;
          for (const sib of Array.from(this.resultBlessingGrid.children)) {
            sib.classList.remove('active');
          }
          card.classList.add('active');
        });
        this.resultBlessingGrid.appendChild(card);
      }
    } else {
      this.selectedBlessingId = undefined;
      this.resultBlessingWrap.style.display = 'none';
    }

    if (this.pendingDungeonId) {
      this.nextStageBtn.style.display = 'inline-flex';
      this.nextStageBtn.textContent = '再刷秘境';
      this.retryBtn.classList.remove('primary');
    } else if (this.pendingNextStageId) {
      const nextDef = getStageDef(this.pendingNextStageId);
      this.nextStageBtn.style.display = 'inline-flex';
      this.nextStageBtn.textContent = `下一关 · 第 ${nextDef.id} 关`;
      this.retryBtn.classList.remove('primary');
    } else {
      this.nextStageBtn.style.display = 'none';
      this.retryBtn.classList.add('primary');
    }
  }

  update(
    hero: HeroState,
    objective: string,
    boss: EnemyEntity | null,
    peer: PeerHeroState | null = null,
    threat: CombatThreatState = 'none',
    tactical?: HudTacticalState,
  ): void {
    const hpPct = clamp(hero.hp / hero.maxHp, 0, 1) * 100;
    const delayPct = clamp(hero.delayedHp / hero.maxHp, 0, 1) * 100;
    const spPct = clamp(hero.spirit / hero.maxSpirit, 0, 1) * 100;
    const stPct = clamp(hero.stamina / hero.maxStamina, 0, 1) * 100;
    const ultPct = Math.floor(clamp(hero.ult, 0, 100));

    this.hpFill.style.width = `${hpPct.toFixed(1)}%`;
    this.hpDelay.style.width = `${delayPct.toFixed(1)}%`;
    this.hpText.textContent = `${Math.ceil(hero.hp)} / ${hero.maxHp}`;
    this.spiritFill.style.width = `${spPct.toFixed(1)}%`;
    this.staminaFill.style.width = `${stPct.toFixed(1)}%`;
    this.ultPctText.textContent = `${ultPct}%`;

    this.objectiveText.textContent = objective;

    if (peer && !peer.isEnemy) {
      this.allyMini.classList.add('visible');
      this.allyMiniName.textContent = peer.dead ? `${peer.name}（重伤待援）` : `同伴 · ${peer.name}`;
      this.allyHpFill.style.width = `${(clamp(peer.hp / peer.maxHp, 0, 1) * 100).toFixed(1)}%`;
    } else {
      this.allyMini.classList.remove('visible');
    }

    if (peer && peer.isEnemy) {
      this.objectiveText.style.display = 'none';
      this.bossBar.classList.add('visible');
      this.bossName.textContent = `1v1 对决 · ${peer.name}`;
      this.bossHpFill.style.width = `${(clamp(peer.hp / peer.maxHp, 0, 1) * 100).toFixed(1)}%`;
      this.bossPoiseFill.style.width = `${clamp(peer.ult, 0, 100).toFixed(1)}%`;
    } else if (boss && boss.aiState !== 'dead') {
      this.objectiveText.style.display = 'none';
      this.bossBar.classList.add('visible');
      this.bossName.textContent = boss.phase === 2 ? `${boss.name} · 魔剑狂化` : boss.name;
      this.bossHpFill.style.width = `${(clamp(boss.hp / boss.maxHp, 0, 1) * 100).toFixed(1)}%`;
      this.bossPoiseFill.style.width = `${(clamp(boss.poise / boss.maxPoise, 0, 1) * 100).toFixed(1)}%`;
    } else {
      this.objectiveText.style.display = '';
      this.bossBar.classList.remove('visible');
    }

    const q2Ready = Boolean(tactical?.q2Ready);
    const comboUltReady = Boolean(tactical?.comboUltReady);

    this.updateSkillPair(
      this.slotQ,
      this.tSlotQ,
      this.sweepQ,
      this.tSweepQ,
      this.cdQEl,
      this.tCdQEl,
      q2Ready ? 0 : hero.cdQ,
      SKILL_MAX_CD.Q,
      q2Ready || hero.spirit >= 20,
      q2Ready,
    );
    this.updateSkillPair(this.slotE, this.tSlotE, this.sweepE, this.tSweepE, this.cdEEl, this.tCdEEl, hero.cdE, SKILL_MAX_CD.E, hero.spirit >= 45, false);
    this.updateSkillPair(
      this.slotR,
      this.tSlotR,
      this.sweepR,
      this.tSweepR,
      this.cdREl,
      this.tCdREl,
      comboUltReady ? 0 : hero.cdR,
      SKILL_MAX_CD.R,
      comboUltReady || hero.ult >= 100,
      comboUltReady || (hero.ult >= 100 && hero.cdR <= 0),
    );

    this.slotQ.classList.toggle('q2-ready', q2Ready);
    this.tSlotQ.classList.toggle('q2-ready', q2Ready);
    this.slotQName.textContent = q2Ready ? '踏剑追影' : '御剑术';
    this.tSlotQName.textContent = q2Ready ? '踏剑' : '御剑';

    this.slotR.classList.toggle('combo-ready', comboUltReady);
    this.tSlotR.classList.toggle('combo-ready', comboUltReady);
    this.slotRName.textContent = comboUltReady ? '万剑归宗' : '天剑';
    this.tSlotRName.textContent = comboUltReady ? '归宗' : '天剑';

    const sigils = tactical?.comboSigils ?? [];
    const sigilGlyph: Record<'A' | 'Q' | 'E' | 'D', string> = {
      A: '斩',
      Q: '御',
      E: '万',
      D: '身',
    };
    for (let i = 0; i < this.sigilEls.length; i++) {
      const el = this.sigilEls[i];
      const code = sigils[i];
      if (code) {
        el.textContent = sigilGlyph[code];
        el.classList.add('filled');
        el.dataset.sigil = code;
      } else {
        el.textContent = '';
        el.classList.remove('filled');
        delete el.dataset.sigil;
      }
    }
    this.comboUltBtn.classList.toggle('visible', comboUltReady);
    this.comboUltBtn.textContent =
      comboUltReady && tactical && tactical.comboUltTimer > 0 && tactical.comboUltTimer < 9.5
        ? `万剑归宗 ${tactical.comboUltTimer.toFixed(1)}s`
        : '万剑归宗';

    if (tactical?.corridorMode) {
      this.minimapBox.classList.add('visible');
      this.minimapZoneName.textContent = tactical.zoneName;
      this.minimapPct.textContent = `${Math.round(clamp(tactical.progressPct, 0, 100))}%`;
      this.renderMinimap(tactical);
    } else {
      this.minimapBox.classList.remove('visible');
    }

    const healDisabled = hero.gourds <= 0 || hero.cdHeal > 0;
    const healPct = clamp(hero.cdHeal / SKILL_MAX_CD.F, 0, 1) * 360;
    this.slotF.classList.toggle('disabled', healDisabled);
    this.tSlotF.classList.toggle('disabled', healDisabled);
    this.sweepF.style.setProperty('--cd-deg', `${healPct.toFixed(1)}deg`);
    this.tSweepF.style.setProperty('--cd-deg', `${healPct.toFixed(1)}deg`);
    this.gourdCountEl.textContent = `${hero.gourds}`;
    this.tGourdCountEl.textContent = `${hero.gourds}`;

    const counterReady = hero.counterWindowTimer > 0 && hero.counterTargetId !== null;
    const shadowReady = hero.shadowStrikeTimer > 0;
    const waveReady = hero.comboStep === 3 && hero.comboWindowTimer > 0;
    this.touchAtkBtn.classList.toggle('counter-ready', counterReady);
    this.touchAtkBtn.classList.toggle('shadow-ready', !counterReady && shadowReady);
    this.touchAtkLbl.textContent = counterReady ? '处决' : shadowReady ? '瞬影' : waveReady ? '剑气' : '出剑';

    this.dangerWarning.classList.toggle('visible', threat === 'unblockable');
    this.touchDodgeBtn.classList.toggle('action-hint-dodge', threat === 'unblockable');
    this.touchBlockBtn.classList.toggle('action-hint-parry', threat === 'parryable');

    if (hero.comboCount >= 2 && hero.comboDecayTimer > 0) {
      this.comboBox.classList.add('visible');
      this.comboNum.textContent = `${hero.comboCount}`;
      const rank =
        hero.comboCount >= 45
          ? '剑圣'
          : hero.comboCount >= 30
            ? '天'
            : hero.comboCount >= 20
              ? '地'
              : hero.comboCount >= 12
                ? '玄'
                : hero.comboCount >= 6
                  ? '灵'
                  : '凡';
      this.comboRank.textContent = rank;
    } else {
      this.comboBox.classList.remove('visible');
    }
  }

  private updateSkillPair(
    slotA: HTMLElement,
    slotB: HTMLElement,
    sweepA: HTMLElement,
    sweepB: HTMLElement,
    cdA: HTMLElement,
    cdB: HTMLElement,
    cd: number,
    maxCd: number,
    hasResource: boolean,
    readyGlow: boolean,
  ): void {
    const disabled = cd > 0 || !hasResource;
    const deg = clamp(cd / maxCd, 0, 1) * 360;
    for (const s of [slotA, slotB]) {
      s.classList.toggle('disabled', disabled);
      s.classList.toggle('ready-glow', readyGlow);
    }
    sweepA.style.setProperty('--cd-deg', `${deg.toFixed(1)}deg`);
    sweepB.style.setProperty('--cd-deg', `${deg.toFixed(1)}deg`);
    const txt = cd > 0.05 ? cd.toFixed(1) : '';
    for (const el of [cdA, cdB]) {
      el.textContent = txt;
      el.classList.toggle('visible', cd > 0.05);
    }
  }

  private renderMinimap(tactical: HudTacticalState): void {
    const ctx = this.minimapCtx;
    if (!ctx) return;

    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const padY = 14;
    const usableH = h - padY * 2;
    const zSpan = Math.max(1, tactical.zMax - tactical.zMin);

    const toY = (z: number): number => {
      const norm = clamp((tactical.zMax - z) / zSpan, 0, 1);
      return h - padY - norm * usableH;
    };
    const toX = (x: number): number => clamp(w * 0.5 + (x / 22) * (w * 0.42), 8, w - 8);

    ctx.clearRect(0, 0, w, h);

    // Subtle ink & corridor meridian backdrop
    const bg = ctx.createLinearGradient(0, h, 0, 0);
    bg.addColorStop(0, 'rgba(9, 18, 30, 0.92)');
    bg.addColorStop(1, 'rgba(14, 24, 38, 0.92)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(223, 192, 117, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, 6);
    ctx.lineTo(w * 0.5, h - 6);
    ctx.stroke();

    const zoneCount = tactical.maxZone + 1;
    const platW = 76;
    const platH = zoneCount === 1 ? usableH * 0.84 : zoneCount === 2 ? usableH * 0.36 : usableH * 0.23;
    const centerYForZone = (zi: number): number => {
      if (zoneCount === 1) return h * 0.5;
      if (zoneCount === 2) return zi === 0 ? h - padY - platH * 0.5 : padY + platH * 0.5;
      return zi === 0 ? h - padY - platH * 0.5 : zi === 1 ? h * 0.5 : padY + platH * 0.5;
    };

    const now = performance.now();

    // 1. Connecting bridges (bottom-to-top) + unlocked jade route or crimson locked barrier
    const bridgeW = 24;
    const bridgeX = (w - bridgeW) * 0.5;
    for (let zi = 0; zi < tactical.maxZone; zi++) {
      const yBottom = centerYForZone(zi) - platH * 0.5 + 2;
      const yTop = centerYForZone(zi + 1) + platH * 0.5 - 2;
      const bH = Math.max(4, yBottom - yTop);
      const unlocked = zi + 1 <= tactical.unlockedZone;

      ctx.fillStyle = unlocked ? 'rgba(24, 54, 68, 0.85)' : 'rgba(20, 24, 34, 0.72)';
      ctx.fillRect(bridgeX, yTop, bridgeW, bH);
      ctx.strokeStyle = unlocked ? 'rgba(76, 217, 208, 0.56)' : 'rgba(130, 145, 165, 0.28)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bridgeX, yTop, bridgeW, bH);

      if (unlocked) {
        ctx.save();
        ctx.strokeStyle = '#5cf6e8';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#4cd9d0';
        ctx.shadowBlur = 7;
        ctx.setLineDash([4, 3]);
        ctx.lineDashOffset = (now * 0.018) % 14;
        ctx.beginPath();
        ctx.moveTo(w * 0.5, centerYForZone(zi) - 4);
        ctx.lineTo(w * 0.5, centerYForZone(zi + 1) + 4);
        ctx.stroke();
        ctx.restore();
      } else {
        const midY = yTop + bH * 0.5;
        ctx.save();
        ctx.strokeStyle = '#ff4b5e';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#ff384c';
        ctx.shadowBlur = 6;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(bridgeX - 5, midY);
        ctx.lineTo(bridgeX + bridgeW + 5, midY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ff4b5e';
        ctx.beginPath();
        ctx.moveTo(w * 0.5, midY - 3.5);
        ctx.lineTo(w * 0.5 + 3.5, midY);
        ctx.lineTo(w * 0.5, midY + 3.5);
        ctx.lineTo(w * 0.5 - 3.5, midY);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // 2. Zone Platforms (0..maxZone)
    const chamfer = 11;
    for (let zi = 0; zi <= tactical.maxZone; zi++) {
      const cy = centerYForZone(zi);
      const x0 = (w - platW) * 0.5;
      const x1 = x0 + platW;
      const y0 = cy - platH * 0.5;
      const y1 = cy + platH * 0.5;
      const unlocked = zi <= tactical.unlockedZone;
      const isBossZone = zi === tactical.maxZone && tactical.maxZone > 0;

      ctx.beginPath();
      ctx.moveTo(x0 + chamfer, y0);
      ctx.lineTo(x1 - chamfer, y0);
      ctx.lineTo(x1, y0 + chamfer);
      ctx.lineTo(x1, y1 - chamfer);
      ctx.lineTo(x1 - chamfer, y1);
      ctx.lineTo(x0 + chamfer, y1);
      ctx.lineTo(x0, y1 - chamfer);
      ctx.lineTo(x0, y0 + chamfer);
      ctx.closePath();

      ctx.fillStyle = unlocked
        ? isBossZone
          ? 'rgba(40, 22, 34, 0.88)'
          : 'rgba(18, 36, 52, 0.88)'
        : 'rgba(13, 21, 33, 0.72)';
      ctx.fill();

      ctx.strokeStyle = unlocked
        ? isBossZone
          ? 'rgba(235, 118, 128, 0.62)'
          : 'rgba(76, 217, 208, 0.56)'
        : 'rgba(148, 166, 188, 0.24)';
      ctx.lineWidth = unlocked ? 1.4 : 1;
      ctx.stroke();

      // Subtle inner courtyard seal ring
      ctx.beginPath();
      ctx.arc(w * 0.5, cy, Math.min(platW, platH) * 0.24, 0, Math.PI * 2);
      ctx.strokeStyle = isBossZone ? 'rgba(245, 148, 120, 0.2)' : 'rgba(223, 192, 117, 0.16)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 3. Entity Dots (loot -> ally -> enemy -> elite -> boss)
    const drawStar = (cx: number, cy: number, outerR: number, innerR: number) => {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const a = (i * Math.PI) / 4 - Math.PI / 2;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };

    const order: Record<MinimapEntityDot['kind'], number> = {
      loot: 0,
      ally: 1,
      enemy: 2,
      elite: 3,
      boss: 4,
    };
    const sortedDots = [...tactical.dots].sort((a, b) => order[a.kind] - order[b.kind]);

    for (const dot of sortedDots) {
      const dx = toX(dot.x);
      const dy = toY(dot.z);
      ctx.save();
      if (dot.kind === 'loot') {
        ctx.fillStyle = '#ffd859';
        ctx.shadowColor = '#ffcb3d';
        ctx.shadowBlur = 6;
        drawStar(dx, dy, 4.8, 1.9);
        ctx.fill();
      } else if (dot.kind === 'ally') {
        ctx.fillStyle = '#54f0be';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(dx, dy, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (dot.kind === 'enemy') {
        ctx.fillStyle = '#ff4b5c';
        ctx.strokeStyle = 'rgba(20, 6, 10, 0.9)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(dx, dy, 2.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (dot.kind === 'elite') {
        ctx.fillStyle = '#ff9d3b';
        ctx.strokeStyle = '#ffe29a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(dx, dy - 4.4);
        ctx.lineTo(dx + 4.4, dy);
        ctx.lineTo(dx, dy + 4.4);
        ctx.lineTo(dx - 4.4, dy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (dot.kind === 'boss') {
        const pulse = 1 + 0.18 * Math.sin(now * 0.008);
        ctx.strokeStyle = 'rgba(255, 84, 106, 0.65)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(dx, dy, 6.8 * pulse, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#ff2e4d';
        ctx.strokeStyle = '#ffd87a';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(dx, dy, 4.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Tiny gold crown glyph
        ctx.fillStyle = '#ffe384';
        ctx.beginPath();
        ctx.moveTo(dx - 3.5, dy - 4.5);
        ctx.lineTo(dx - 3.5, dy - 7.8);
        ctx.lineTo(dx - 1.4, dy - 6.0);
        ctx.lineTo(dx, dy - 8.5);
        ctx.lineTo(dx + 1.4, dy - 6.0);
        ctx.lineTo(dx + 3.5, dy - 7.8);
        ctx.lineTo(dx + 3.5, dy - 4.5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // 4. Hero rotated jade directional arrow
    const hx = toX(tactical.heroX);
    const hy = toY(tactical.heroZ);
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(Math.PI - tactical.heroYaw);
    ctx.shadowColor = '#4cd9d0';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#7cfaf0';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.lineTo(4.6, 5);
    ctx.lineTo(0, 2.3);
    ctx.lineTo(-4.6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private q(sel: string): HTMLElement {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) throw new Error(`Missing HUD element: ${sel}`);
    return el;
  }
}

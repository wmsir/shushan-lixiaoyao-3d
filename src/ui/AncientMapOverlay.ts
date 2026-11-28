import './ancient-map.css';
import { clamp } from '../utils/math';
import {
  WORLD_BOSS_SPAWNS,
  WORLD_BOUND,
  WORLD_CHESTS,
  WORLD_MOB_CAMPS,
  WORLD_REGIONS,
  WORLD_SPAWN_POS,
  WORLD_SPIRIT_ORBS,
  WORLD_WAYPOINTS,
  getWorldRegionAt,
} from '../game/OpenWorldData';

export interface AncientMapHeroState {
  x: number;
  z: number;
  yaw: number;
  regionName: string;
  mode: 'world' | 'playing' | 'camp' | 'title';
  stageId?: number;
  stageName?: string;
  zoneName?: string;
  progressPct?: number;
}

export interface AncientMapBossLive {
  id: string;
  charId: string;
  name: string;
  regionName: string;
  x: number;
  z: number;
  alive: boolean;
  hp?: number;
  maxHp?: number;
  respawnRemainSec?: number;
}

export interface AncientMapNpcPin {
  id: string;
  charId: string;
  name: string;
  title: string;
  x: number;
  z: number;
}

export interface AncientMapSnapshot {
  hero: AncientMapHeroState;
  litWaypoints: Set<string>;
  openedChests: Set<string>;
  collectedOrbs: Set<string>;
  bosses: AncientMapBossLive[];
  npcs: AncientMapNpcPin[];
  activeTarget?: { x: number; z: number; label: string } | null;
}

export interface AncientMapCallbacks {
  onTeleport: (waypointId: string) => boolean;
  onNavigateTo: (x: number, z: number, label: string) => void;
  onInspectCharacter: (charId: string) => void;
  onClose?: () => void;
}

type MapFilterId = 'all' | 'waypoint' | 'boss' | 'chest' | 'orb' | 'npc';
type PinKind = 'hero' | 'waypoint' | 'boss' | 'camp' | 'chest' | 'orb' | 'npc' | 'region' | 'custom';

interface ResolvedMapPin {
  id: string;
  kind: PinKind;
  filterKey: Exclude<MapFilterId, 'all'> | 'always';
  name: string;
  glyph: string;
  tagLabel?: string;
  regionName: string;
  x: number;
  z: number;
  /** Optional override for screen-normalized coordinates (used in campaign overview) */
  normX?: number;
  normY?: number;
  statusText: string;
  statusTone?: 'alive' | 'lit' | 'neutral';
  desc: string;
  lore?: string;
  rewardText?: string;
  recommendedRealm?: string;
  charId?: string;
  teleportId?: string;
  canNavigate: boolean;
  extraClasses?: string[];
}

interface MapViewportMetrics {
  stageW: number;
  stageH: number;
  ox: number;
  oy: number;
  mapSize: number;
  bound: number;
}

const FILTER_TABS: Array<{ id: MapFilterId; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'waypoint', label: '锚点' },
  { id: 'boss', label: '首领' },
  { id: 'chest', label: '宝箱' },
  { id: 'orb', label: '灵瞳' },
  { id: 'npc', label: '人物' },
];

const RARITY_LABELS: Record<string, string> = {
  common: '凡品',
  rare: '精良',
  epic: '史诗',
  legendary: '传说',
};

const CAMPAIGN_CHAPTER_NODES: Array<{
  chapter: number;
  name: string;
  seal: string;
  nx: number;
  ny: number;
  range: [number, number];
  accent: string;
}> = [
  { chapter: 1, name: '第一章 · 翠竹云溪', seal: '云溪山门', nx: 0.24, ny: 0.78, range: [1, 5], accent: '#237c70' },
  { chapter: 2, name: '第二章 · 十里桃源', seal: '东岳桃源', nx: 0.72, ny: 0.68, range: [6, 10], accent: '#b84b6e' },
  { chapter: 3, name: '第三章 · 古剑荒冢', seal: '西陲剑冢', nx: 0.28, ny: 0.48, range: [11, 15], accent: '#624799' },
  { chapter: 4, name: '第四章 · 赤焰火狱', seal: '南冥火狱', nx: 0.72, ny: 0.36, range: [16, 20], accent: '#b84222' },
  { chapter: 5, name: '第五章 · 星穹天坛', seal: '九霄星坛', nx: 0.5, ny: 0.18, range: [21, 25], accent: '#2c689c' },
];

const DEFAULT_CAMP_LANDMARKS: Array<{
  id: string;
  charId?: string;
  name: string;
  title: string;
  glyph: string;
  x: number;
  z: number;
  desc: string;
}> = [
  {
    id: 'camp_npc_wine',
    charId: 'npc_wine_master',
    name: '酒剑仙 · 司徒钟',
    title: '云来剑庐师尊',
    glyph: '酒',
    x: 3.65,
    z: -0.95,
    desc: '蜀山御剑宗师，常醉饮葫芦于亭畔，走近可论剑破境、请教御剑心法。',
  },
  {
    id: 'camp_npc_xuanying',
    charId: 'npc_xuanying',
    name: '玄影师兄',
    title: '蜀山外门首席',
    glyph: '玄',
    x: -3.55,
    z: -2.15,
    desc: '仗剑守卫剑庐的同门师兄，精擅流云连剑，可与之探报江湖异动或切磋试剑。',
  },
  {
    id: 'camp_spot_mat',
    name: '打坐蒲团',
    title: '聚灵吐纳之席',
    glyph: '坐',
    x: -4.25,
    z: 1.85,
    desc: '青竹林畔古旧蒲团，盘膝吐纳可瞬间回满气血真气，并蓄积剑意。',
  },
  {
    id: 'camp_spot_tea',
    name: '围炉茶席',
    title: '温酒品茗篝火',
    glyph: '茶',
    x: 4.5,
    z: 0.85,
    desc: '暖火清茶袅袅生烟，小憩品茗可享剑庐灵膳增益，备战九州群魔。',
  },
];

function seededNoise(seed: number): number {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

export class AncientMapOverlay {
  private readonly callbacks: AncientMapCallbacks;
  private readonly root: HTMLDivElement;
  private readonly titleEl: HTMLElement;
  private readonly modeChipEl: HTMLElement;
  private readonly subtitleEl: HTMLElement;
  private readonly regionLabelEl: HTMLElement;
  private readonly coordPillEl: HTMLElement;
  private readonly heroQuickBtn: HTMLButtonElement;
  private readonly filterBarEl: HTMLDivElement;
  private readonly stageEl: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly pinLayerEl: HTMLDivElement;
  private readonly stageHintEl: HTMLDivElement;
  private readonly drawerEl: HTMLElement;

  private readonly staticCacheCanvas: HTMLCanvasElement;
  private staticCacheKey = '';

  private snapshot: AncientMapSnapshot | null = null;
  private openState = false;
  private activeFilter: MapFilterId = 'all';
  private selectedPinId: string | null = null;
  private customPin: { x: number; z: number; label: string } | null = null;

  private resolvedPins: ResolvedMapPin[] = [];
  private pinEls = new Map<string, HTMLButtonElement>();
  private lastPinsStructureKey = '';
  private lastMetrics: MapViewportMetrics = {
    stageW: 340,
    stageH: 340,
    ox: 10,
    oy: 10,
    mapSize: 320,
    bound: WORLD_BOUND,
  };
  private resizeObserver: ResizeObserver | null = null;
  private rafHandle = 0;

  private readonly onWindowResize = () => {
    if (!this.openState) return;
    this.syncLayoutAndRender(true);
  };

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (!this.openState) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
  };

  constructor(mountParent: HTMLElement, callbacks: AncientMapCallbacks) {
    this.callbacks = callbacks;
    this.staticCacheCanvas = document.createElement('canvas');

    const root = document.createElement('div');
    root.id = 'ancient-map-overlay';
    root.className = 'ancient-map-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-hidden', 'true');
    root.setAttribute('aria-label', '中国古代九州水墨舆图');
    root.innerHTML = `
      <div class="amap-scroll">
        <div class="amap-roller amap-roller-start" aria-hidden="true">
          <span class="amap-roller-center-gem"></span>
        </div>
        <div class="amap-brocade">
          <div class="amap-inner">
            <header class="amap-header">
              <div class="amap-title-wrap">
                <span class="amap-seal-stamp" aria-hidden="true">舆</span>
                <div class="amap-title-texts">
                  <div class="amap-title-row">
                    <h2 class="amap-title" id="amap-title">九州仙域古舆图</h2>
                    <span class="amap-mode-chip" id="amap-mode-chip">九州探索</span>
                  </div>
                  <div class="amap-subtitle" id="amap-subtitle">宋明山水堪舆卷 · 六大仙域实时定位</div>
                </div>
              </div>
              <div class="amap-header-right">
                <button type="button" class="amap-close-btn" id="amap-btn-close" aria-label="关闭舆图">✕</button>
              </div>
            </header>

            <div class="amap-loc-strip" id="amap-loc-strip">
              <div class="amap-loc-main">
                <span class="amap-loc-pulse" aria-hidden="true"></span>
                <span class="amap-loc-label">当前所在</span>
                <strong class="amap-region-name" id="amap-region-label">蜀山云台 · 九州枢纽</strong>
                <span class="amap-coord-pill" id="amap-coord-pill">0, 0</span>
              </div>
              <button type="button" class="amap-hero-quick-btn" id="amap-btn-hero-inspect">主角属性</button>
            </div>

            <div class="amap-filters" id="amap-filters" role="tablist" aria-label="舆图筛选"></div>

            <div class="amap-workspace">
              <div class="amap-stage" id="amap-stage">
                <canvas class="amap-canvas" id="ancient-map-canvas"></canvas>
                <div class="amap-pin-layer" id="amap-pin-layer"></div>
                <div class="amap-stage-hint" id="amap-stage-hint">轻点标点查详情 · 点空地设踏青标点自动寻路</div>
              </div>
              <aside class="amap-drawer collapsed" id="amap-drawer" aria-live="polite"></aside>
            </div>
          </div>
        </div>
        <div class="amap-roller amap-roller-end" aria-hidden="true">
          <span class="amap-roller-center-gem"></span>
        </div>
      </div>
    `;

    mountParent.appendChild(root);
    this.root = root;
    this.titleEl = root.querySelector<HTMLElement>('#amap-title')!;
    this.modeChipEl = root.querySelector<HTMLElement>('#amap-mode-chip')!;
    this.subtitleEl = root.querySelector<HTMLElement>('#amap-subtitle')!;
    this.regionLabelEl = root.querySelector<HTMLElement>('#amap-region-label')!;
    this.coordPillEl = root.querySelector<HTMLElement>('#amap-coord-pill')!;
    this.heroQuickBtn = root.querySelector<HTMLButtonElement>('#amap-btn-hero-inspect')!;
    this.filterBarEl = root.querySelector<HTMLDivElement>('#amap-filters')!;
    this.stageEl = root.querySelector<HTMLDivElement>('#amap-stage')!;
    this.canvas = root.querySelector<HTMLCanvasElement>('#ancient-map-canvas')!;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to initialize 2D context for AncientMapOverlay');
    this.ctx = ctx;
    this.pinLayerEl = root.querySelector<HTMLDivElement>('#amap-pin-layer')!;
    this.stageHintEl = root.querySelector<HTMLDivElement>('#amap-stage-hint')!;
    this.drawerEl = root.querySelector<HTMLElement>('#amap-drawer')!;

    this.buildFilterPills();
    this.bindEvents();

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.openState) this.syncLayoutAndRender(true);
      });
      this.resizeObserver.observe(this.stageEl);
    }
    window.addEventListener('resize', this.onWindowResize);
    window.addEventListener('keydown', this.onKeyDown);
  }

  open(snapshot: AncientMapSnapshot): void {
    this.snapshot = snapshot;
    this.openState = true;
    this.customPin = null;
    this.selectedPinId = this.isHorizontalLayout() ? 'pin_hero' : null;
    this.root.removeAttribute('aria-hidden');
    this.root.classList.add('visible');

    this.applyHeaderAndLocation(snapshot);
    this.rebuildResolvedPins(snapshot);
    this.syncLayoutAndRender(true);
    this.renderDrawer();

    if (this.rafHandle) cancelAnimationFrame(this.rafHandle);
    this.rafHandle = requestAnimationFrame(() => {
      this.rafHandle = 0;
      if (this.openState) {
        this.syncLayoutAndRender(true);
      }
    });
  }

  update(snapshot: AncientMapSnapshot): void {
    this.snapshot = snapshot;
    if (!this.openState) return;

    this.applyHeaderAndLocation(snapshot);
    this.rebuildResolvedPins(snapshot);
    this.syncPinDomAndPositions();
    this.drawFrame();
    if (this.selectedPinId) {
      this.renderDrawer();
    }
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.root.classList.remove('visible');
    this.root.setAttribute('aria-hidden', 'true');
    if (this.rafHandle) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = 0;
    }
    this.callbacks.onClose?.();
  }

  isOpen(): boolean {
    return this.openState;
  }

  private isHorizontalLayout(): boolean {
    return window.innerWidth >= 680 || (window.innerWidth > window.innerHeight && window.innerHeight <= 540);
  }

  private buildFilterPills(): void {
    this.filterBarEl.innerHTML = '';
    for (const tab of FILTER_TABS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `amap-filter-pill${tab.id === this.activeFilter ? ' active' : ''}`;
      btn.dataset.filter = tab.id;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', tab.id === this.activeFilter ? 'true' : 'false');
      btn.textContent = tab.label;
      btn.addEventListener('click', () => {
        if (this.activeFilter === tab.id) return;
        this.activeFilter = tab.id;
        for (const el of Array.from(this.filterBarEl.querySelectorAll<HTMLButtonElement>('.amap-filter-pill'))) {
          const active = el.dataset.filter === tab.id;
          el.classList.toggle('active', active);
          el.setAttribute('aria-selected', active ? 'true' : 'false');
        }
        if (this.snapshot) {
          this.rebuildResolvedPins(this.snapshot);
          this.syncPinDomAndPositions();
          this.drawFrame();
          this.renderDrawer();
        }
      });
      this.filterBarEl.appendChild(btn);
    }
  }

  private bindEvents(): void {
    const closeBtn = this.root.querySelector<HTMLButtonElement>('#amap-btn-close');
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });

    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) {
        this.close();
      }
    });

    this.heroQuickBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
      this.callbacks.onInspectCharacter('char_xiaoyao');
    });

    // Tap empty parchment ground to place a custom navigation pin (踏青标点 · 自动寻路)
    this.stageEl.addEventListener('click', (e) => {
      if (!this.snapshot) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('.amap-pin')) return;

      const rect = this.stageEl.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const mode = this.snapshot.hero.mode;

      if (mode === 'playing') {
        // In campaign mode, tapping ground selects Hero location summary
        this.selectPin('pin_hero');
        return;
      }

      const worldPt = this.stagePxToWorld(px, py);
      if (!worldPt) return;

      const reg = mode === 'camp' ? null : getWorldRegionAt(worldPt.x, worldPt.z);
      const label = reg ? `踏青标点 · ${reg.shortName}` : '剑庐步履标点';
      this.customPin = {
        x: Math.round(worldPt.x * 10) / 10,
        z: Math.round(worldPt.z * 10) / 10,
        label,
      };
      this.selectedPinId = 'pin_custom';
      this.rebuildResolvedPins(this.snapshot);
      this.syncPinDomAndPositions();
      this.drawFrame();
      this.renderDrawer();
    });

    // Drawer action button delegation
    this.drawerEl.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-action]');
      if (!btn) return;
      e.stopPropagation();
      const action = btn.dataset.action;
      const pin = this.getSelectedPin();
      if (!pin) return;

      if (action === 'teleport' && pin.teleportId) {
        const ok = this.callbacks.onTeleport(pin.teleportId);
        if (ok) this.close();
      } else if (action === 'navigate') {
        const tx = pin.x;
        const tz = pin.z;
        const label = pin.name;
        this.close();
        this.callbacks.onNavigateTo(tx, tz, label);
      } else if (action === 'inspect-char' && pin.charId) {
        const charId = pin.charId;
        this.close();
        this.callbacks.onInspectCharacter(charId);
      } else if (action === 'clear-custom') {
        this.customPin = null;
        this.selectedPinId = this.isHorizontalLayout() ? 'pin_hero' : null;
        if (this.snapshot) {
          this.rebuildResolvedPins(this.snapshot);
          this.syncPinDomAndPositions();
          this.drawFrame();
          this.renderDrawer();
        }
      }
    });
  }

  private applyHeaderAndLocation(snap: AncientMapSnapshot): void {
    const { hero } = snap;
    const mode = hero.mode;

    if (mode === 'playing') {
      this.titleEl.textContent = '蜀山征途行军图';
      this.modeChipEl.textContent = '主线战役';
      const pct = Math.round(hero.progressPct ?? 0);
      this.subtitleEl.textContent = `${hero.stageName ?? `第${hero.stageId ?? 1}关`} · ${hero.zoneName ?? '云溪山门'} (${pct}%)`;
      this.regionLabelEl.textContent = `${hero.stageName ?? '主线关卡'} · ${hero.zoneName ?? hero.regionName}`;
      this.coordPillEl.textContent = `进度 ${pct}%`;
      this.stageHintEl.textContent = '轻点首领或侠客标点查看属性 · 实时标示当前战区进度';
    } else if (mode === 'camp') {
      this.titleEl.textContent = '云来剑庐堪舆图';
      this.modeChipEl.textContent = '剑庐休整';
      this.subtitleEl.textContent = '蜀山清修别院 · 师尊同门与吐纳茶席';
      this.regionLabelEl.textContent = hero.regionName || '云来剑庐 · 清修别院';
      this.coordPillEl.textContent = `X:${Math.round(hero.x)} Z:${Math.round(hero.z)}`;
      this.stageHintEl.textContent = '轻点酒剑仙/玄影查角色属性 · 轻点空地设标';
    } else {
      const litCount = snap.litWaypoints.size;
      const chestCount = snap.openedChests.size;
      const orbCount = snap.collectedOrbs.size;
      this.titleEl.textContent = '九州仙域古舆图';
      this.modeChipEl.textContent = mode === 'world' ? '九州探索' : '九州总览';
      this.subtitleEl.textContent = `锚点 ${litCount}/${WORLD_WAYPOINTS.length} · 宝箱 ${chestCount}/${WORLD_CHESTS.length} · 灵瞳 ${orbCount}/${WORLD_SPIRIT_ORBS.length}`;
      this.regionLabelEl.textContent = hero.regionName || getWorldRegionAt(hero.x, hero.z).name;
      this.coordPillEl.textContent = `X:${Math.round(hero.x)} Z:${Math.round(hero.z)}`;
      this.stageHintEl.textContent = '轻点标点查属性/传送 · 点空地设「踏青标点 · 自动寻路」';
    }
  }

  private rebuildResolvedPins(snap: AncientMapSnapshot): void {
    const pins: ResolvedMapPin[] = [];
    const mode = snap.hero.mode;

    if (mode === 'playing') {
      this.buildPlayingModePins(snap, pins);
    } else if (mode === 'camp') {
      this.buildCampModePins(snap, pins);
    } else {
      this.buildOpenWorldPins(snap, pins);
    }

    // Apply active filter while always preserving Hero + custom marker
    this.resolvedPins = pins.filter((p) => {
      if (this.activeFilter === 'all') return true;
      if (p.filterKey === 'always') return true;
      return p.filterKey === this.activeFilter;
    });

    if (this.selectedPinId && !this.resolvedPins.some((p) => p.id === this.selectedPinId)) {
      this.selectedPinId = this.isHorizontalLayout() ? 'pin_hero' : null;
    }
  }

  private buildOpenWorldPins(snap: AncientMapSnapshot, pins: ResolvedMapPin[]): void {
    const heroReg = getWorldRegionAt(snap.hero.x, snap.hero.z);

    // 1. Live Hero Beacon (You Are Here)
    pins.push({
      id: 'pin_hero',
      kind: 'hero',
      filterKey: 'always',
      name: '李逍遥（当前所在）',
      glyph: '我',
      tagLabel: '当前所在',
      regionName: snap.hero.regionName || heroReg.name,
      x: snap.hero.x,
      z: snap.hero.z,
      statusText: '实时定位中',
      statusTone: 'lit',
      desc: `正位于【${snap.hero.regionName || heroReg.name}】（坐标 ${Math.round(snap.hero.x)}, ${Math.round(snap.hero.z)}）。可御风传送至已点亮锚点或点击空地自动寻路。`,
      lore: heroReg.lore,
      recommendedRealm: heroReg.recommendedRealm,
      charId: 'char_xiaoyao',
      canNavigate: false,
    });

    // 2. Center Hub Teleport Anchor (蜀山中枢)
    const centerReg = WORLD_REGIONS[0];
    pins.push({
      id: 'wp_center',
      kind: 'waypoint',
      filterKey: 'waypoint',
      name: '蜀山云台主传送阵',
      glyph: '枢',
      tagLabel: '中枢阵',
      regionName: centerReg.name,
      x: WORLD_SPAWN_POS.x,
      z: WORLD_SPAWN_POS.z,
      statusText: '常亮 · 可直接瞬移',
      statusTone: 'lit',
      desc: centerReg.desc,
      lore: centerReg.lore,
      recommendedRealm: centerReg.recommendedRealm,
      teleportId: 'wp_center',
      canNavigate: true,
    });

    // 3. Five Outer Teleport Waypoints
    for (const wp of WORLD_WAYPOINTS) {
      const lit = snap.litWaypoints.has(wp.id);
      const reg = getWorldRegionAt(wp.x, wp.z);
      pins.push({
        id: `wp_${wp.id}`,
        kind: 'waypoint',
        filterKey: 'waypoint',
        name: wp.name,
        glyph: '锚',
        tagLabel: wp.id === 'wp_crypt' ? '地窟锚点' : undefined,
        regionName: wp.regionName,
        x: wp.x,
        z: wp.z,
        statusText: lit ? '已点亮 · 可瞬移传送' : '未激活 · 前往点亮',
        statusTone: lit ? 'lit' : 'neutral',
        desc: reg.desc,
        rewardText: lit ? '已领取激活灵石' : `首次激活奖励 +${wp.rewardJade} 灵石`,
        recommendedRealm: reg.recommendedRealm,
        teleportId: lit ? wp.id : undefined,
        canNavigate: true,
        extraClasses: lit ? ['is-lit'] : ['is-unlit'],
      });
    }

    // 4. Five World Bosses (merged with live status from snapshot.bosses)
    const liveBossById = new Map<string, AncientMapBossLive>();
    for (const b of snap.bosses) {
      liveBossById.set(b.id, b);
    }

    const bossGlyphMap: Record<string, string> = {
      wb_phantom: '魔',
      wb_titan: '巨',
      wb_inferno: '炎',
      wb_celestial: '雷',
      wb_crypt: '煞',
    };
    const bossTagMap: Record<string, string> = {
      wb_phantom: '青岚剑魔',
      wb_titan: '玄冥泰坦',
      wb_inferno: '焚穹炎将',
      wb_celestial: '九幽雷帝',
      wb_crypt: '镇窟剑君',
    };

    for (const wb of WORLD_BOSS_SPAWNS) {
      const live = liveBossById.get(wb.id);
      const alive = live ? live.alive : true;
      const remain = Math.ceil(live?.respawnRemainSec ?? 0);
      const hpText =
        alive && live?.hp !== undefined && live?.maxHp !== undefined
          ? `气血 ${Math.ceil(live.hp)}/${Math.ceil(live.maxHp)}`
          : alive
            ? '现身镇守中'
            : `重生倒计时 ${remain}s`;
      pins.push({
        id: `boss_${wb.id}`,
        kind: 'boss',
        filterKey: 'boss',
        name: wb.name,
        glyph: bossGlyphMap[wb.id] ?? '王',
        tagLabel: alive ? (bossTagMap[wb.id] ?? wb.name.slice(0, 4)) : `${remain}s`,
        regionName: wb.regionName,
        x: live ? live.x : wb.x,
        z: live ? live.z : wb.z,
        statusText: hpText,
        statusTone: alive ? 'alive' : 'neutral',
        desc: wb.desc,
        lore: wb.lore,
        rewardText: `必掉 ${RARITY_LABELS[wb.guaranteedMinRarity] ?? wb.guaranteedMinRarity} 装备 · +${wb.jadeReward} 灵石`,
        recommendedRealm: wb.recommendedRealm,
        charId: live?.charId || wb.id,
        canNavigate: true,
        extraClasses: alive ? ['is-alive'] : ['is-dead'],
      });
    }

    // Any extra live bosses (e.g. Treasure Goblin world event) not in WORLD_BOSS_SPAWNS
    for (const live of snap.bosses) {
      if (WORLD_BOSS_SPAWNS.some((w) => w.id === live.id)) continue;
      if (!live.alive) continue;
      pins.push({
        id: `boss_extra_${live.id}`,
        kind: 'boss',
        filterKey: 'boss',
        name: live.name,
        glyph: '奇',
        tagLabel: '奇遇首领',
        regionName: live.regionName || getWorldRegionAt(live.x, live.z).name,
        x: live.x,
        z: live.z,
        statusText: '限时现身中',
        statusTone: 'alive',
        desc: '九州奇遇现身的特殊强敌，速往截杀可获丰厚灵玉与珍稀法宝！',
        charId: live.charId || live.id,
        canNavigate: true,
        extraClasses: ['is-alive'],
      });
    }

    // 5. Five Mob Camps
    for (const camp of WORLD_MOB_CAMPS) {
      const reg = getWorldRegionAt(camp.x, camp.z);
      const leadKind = camp.mobs[0]?.kind ?? 'bladesman';
      const charId = leadKind === 'elite' ? 'mob_elite' : leadKind === 'caster' ? 'mob_caster' : 'mob_bladesman';
      pins.push({
        id: `camp_${camp.id}`,
        kind: 'camp',
        filterKey: 'boss',
        name: camp.name,
        glyph: '营',
        regionName: reg.name,
        x: camp.x,
        z: camp.z,
        statusText: `${camp.mobs.length} 名妖兵巡守`,
        statusTone: 'neutral',
        desc: `盘踞于【${reg.shortName}】的妖魔营寨（含${camp.mobs.map((m) => m.name).join('、')}）。`,
        rewardText: `清剿奖励 +${camp.jadeReward} 灵石 · ${camp.respawnSec}秒刷新`,
        recommendedRealm: reg.recommendedRealm,
        charId,
        canNavigate: true,
      });
    }

    // 6. Eight Wild Treasure Chests
    for (const ch of WORLD_CHESTS) {
      const opened = snap.openedChests.has(ch.id);
      const reg = getWorldRegionAt(ch.x, ch.z);
      pins.push({
        id: `chest_${ch.id}`,
        kind: 'chest',
        filterKey: 'chest',
        name: ch.name,
        glyph: '宝',
        regionName: reg.name,
        x: ch.x,
        z: ch.z,
        statusText: opened ? '已开启' : `${RARITY_LABELS[ch.rarity] ?? ch.rarity}宝匣 · 待开启`,
        statusTone: opened ? 'neutral' : 'lit',
        desc: `藏匿于【${reg.name}】的野外秘藏宝匣，走近即可开启领取法宝与灵石。`,
        rewardText: `内含 ${RARITY_LABELS[ch.rarity] ?? ch.rarity}装备 + ${ch.jade} 灵石`,
        canNavigate: true,
        extraClasses: [opened ? 'is-opened' : 'is-closed', ch.rarity === 'legendary' ? 'is-legendary' : ''].filter(Boolean),
      });
    }

    // 7. Eight Sky Spirit Orbs
    for (const orb of WORLD_SPIRIT_ORBS) {
      const collected = snap.collectedOrbs.has(orb.id);
      pins.push({
        id: `orb_${orb.id}`,
        kind: 'orb',
        filterKey: 'orb',
        name: orb.name,
        glyph: '瞳',
        regionName: orb.regionName,
        x: orb.x,
        z: orb.z,
        statusText: collected ? '已收集' : '悬空灵瞳 · 御剑可采',
        statusTone: collected ? 'neutral' : 'lit',
        desc: `悬浮于【${orb.regionName}】半空的九州灵瞳，激活御剑飞行凌空掠过即可吸收，永久提升气血上限！`,
        rewardText: `采集奖励 +${orb.jade} 灵石 · 永久气血加持`,
        canNavigate: true,
        extraClasses: [collected ? 'is-collected' : 'is-active'],
      });
    }

    // 8. NPCs (passed from snapshot, plus Shushan Sanctuary elder reference if none passed in world mode)
    if (snap.npcs.length > 0) {
      for (const npc of snap.npcs) {
        pins.push({
          id: `npc_${npc.id}`,
          kind: 'npc',
          filterKey: 'npc',
          name: npc.name,
          glyph: npc.name.slice(0, 1),
          tagLabel: npc.name.split('·')[0].trim().slice(0, 4),
          regionName: getWorldRegionAt(npc.x, npc.z).name,
          x: npc.x,
          z: npc.z,
          statusText: npc.title || '蜀山侠士',
          statusTone: 'lit',
          desc: `${npc.name}（${npc.title}），点击下方按钮可查看其完整物理属性与传记。`,
          charId: npc.charId,
          canNavigate: true,
        });
      }
    } else {
      pins.push({
        id: 'npc_shushan_guide',
        kind: 'npc',
        filterKey: 'npc',
        name: '酒剑仙 · 司徒钟',
        glyph: '酒',
        tagLabel: '云来剑庐',
        regionName: '蜀山云台 · 九州枢纽',
        x: -7.5,
        z: 5.5,
        statusText: '坐镇云来剑庐',
        statusTone: 'lit',
        desc: '师尊酒剑仙坐镇蜀山云来剑庐，点此可随时翻阅其宗师物理属性与剑道绝学。',
        charId: 'npc_wine_master',
        canNavigate: true,
      });
    }

    // 9. Custom Ground Pin (踏青标点)
    if (this.customPin) {
      const reg = getWorldRegionAt(this.customPin.x, this.customPin.z);
      pins.push({
        id: 'pin_custom',
        kind: 'custom',
        filterKey: 'always',
        name: this.customPin.label,
        glyph: '标',
        tagLabel: '踏青标点',
        regionName: reg.name,
        x: this.customPin.x,
        z: this.customPin.z,
        statusText: `自选坐标 (${Math.round(this.customPin.x)}, ${Math.round(this.customPin.z)})`,
        statusTone: 'alive',
        desc: `已于【${reg.name}】落笔定标，点击「自动寻路前往」即可自动策马或御剑奔赴此处。`,
        canNavigate: true,
      });
    }
  }

  private buildPlayingModePins(snap: AncientMapSnapshot, pins: ResolvedMapPin[]): void {
    const stageId = clamp(snap.hero.stageId ?? 1, 1, 25);
    const activeChapter = Math.ceil(stageId / 5);
    const stageIdxInChapter = (stageId - 1) % 5;
    const activeNode = CAMPAIGN_CHAPTER_NODES[activeChapter - 1] ?? CAMPAIGN_CHAPTER_NODES[0];
    const progress = clamp(snap.hero.progressPct ?? 0, 0, 100);

    // Compute hero position along the grand Shushan campaign route
    const nextNode = CAMPAIGN_CHAPTER_NODES[Math.min(4, activeChapter)];
    const t = clamp((stageIdxInChapter + progress / 100) / 5, 0, 0.92);
    const heroNx = activeNode.nx + (nextNode.nx - activeNode.nx) * t * 0.42;
    const heroNy = activeNode.ny + (nextNode.ny - activeNode.ny) * t * 0.42;

    pins.push({
      id: 'pin_hero',
      kind: 'hero',
      filterKey: 'always',
      name: '李逍遥（征战所在）',
      glyph: '我',
      tagLabel: '当前所在',
      regionName: `${snap.hero.stageName ?? `第${stageId}关`} · ${snap.hero.zoneName ?? '云溪山门'}`,
      x: snap.hero.x,
      z: snap.hero.z,
      normX: heroNx,
      normY: heroNy,
      statusText: `当前进度 ${Math.round(progress)}%`,
      statusTone: 'lit',
      desc: `正在攻略【${snap.hero.stageName ?? `第${stageId}关`}】（${snap.hero.zoneName ?? '云溪山门'}），战局推进 ${Math.round(progress)}%。`,
      charId: 'char_xiaoyao',
      canNavigate: false,
    });

    // Chapter milestone seals
    for (const ch of CAMPAIGN_CHAPTER_NODES) {
      const isCur = ch.chapter === activeChapter;
      const cleared = ch.chapter < activeChapter;
      pins.push({
        id: `chapter_${ch.chapter}`,
        kind: 'waypoint',
        filterKey: 'waypoint',
        name: ch.name,
        glyph: `${ch.chapter}`,
        tagLabel: ch.seal,
        regionName: `第${ch.range[0]}–${ch.range[1]}关`,
        x: 0,
        z: 0,
        normX: ch.nx,
        normY: ch.ny,
        statusText: isCur ? '当前征战章节' : cleared ? '已收复仙域' : '待踏破章节',
        statusTone: isCur || cleared ? 'lit' : 'neutral',
        desc: `${ch.name}（第${ch.range[0]}至${ch.range[1]}关），蜀山主线重要战区。`,
        canNavigate: false,
        extraClasses: isCur || cleared ? ['is-lit'] : ['is-unlit'],
      });
    }

    // Active stage bosses / enemies from snapshot
    if (snap.bosses.length > 0) {
      snap.bosses.forEach((b, idx) => {
        const offsetAng = -Math.PI * 0.35 + idx * 0.55;
        const bNx = clamp(heroNx + Math.cos(offsetAng) * 0.11, 0.12, 0.88);
        const bNy = clamp(heroNy + Math.sin(offsetAng) * 0.09 - 0.05, 0.12, 0.86);
        const hpStr =
          b.alive && b.hp !== undefined && b.maxHp !== undefined
            ? `气血 ${Math.ceil(b.hp)}/${Math.ceil(b.maxHp)}`
            : b.alive
              ? '镇关迎战中'
              : '已伏诛';
        pins.push({
          id: `stage_boss_${b.id}`,
          kind: 'boss',
          filterKey: 'boss',
          name: b.name,
          glyph: '魔',
          tagLabel: b.name.split('·')[0].trim().slice(0, 5),
          regionName: b.regionName || snap.hero.stageName || '当前战区',
          x: b.x,
          z: b.z,
          normX: bNx,
          normY: bNy,
          statusText: hpStr,
          statusTone: b.alive ? 'alive' : 'neutral',
          desc: `镇守本关的强敌首领，可点击「查看角色属性」详览其体魄攻防与弱点！`,
          charId: b.charId || 'boss_suoyao',
          canNavigate: false,
          extraClasses: b.alive ? ['is-alive'] : ['is-dead'],
        });
      });
    } else {
      // Always provide the Chapter Boss preview pin so player can inspect campaign bosses on the map
      pins.push({
        id: 'stage_boss_default',
        kind: 'boss',
        filterKey: 'boss',
        name: '九幽剑煞 · 镇狱妖王',
        glyph: '魔',
        tagLabel: '镇关魔尊',
        regionName: snap.hero.stageName || activeNode.name,
        x: 0,
        z: -84,
        normX: clamp(heroNx + 0.09, 0.14, 0.86),
        normY: clamp(heroNy - 0.1, 0.14, 0.84),
        statusText: '锁妖绝壁镇守',
        statusTone: 'alive',
        desc: '镇守蜀山主线终末战区的魔道首领，点击「查看角色属性」提前洞察其攻防与破招弱点。',
        charId: 'boss_suoyao',
        canNavigate: false,
        extraClasses: ['is-alive'],
      });
    }
  }

  private buildCampModePins(snap: AncientMapSnapshot, pins: ResolvedMapPin[]): void {
    pins.push({
      id: 'pin_hero',
      kind: 'hero',
      filterKey: 'always',
      name: '李逍遥（云来剑庐）',
      glyph: '我',
      tagLabel: '当前所在',
      regionName: '云来剑庐 · 清修别院',
      x: snap.hero.x,
      z: snap.hero.z,
      statusText: '剑庐休整中',
      statusTone: 'lit',
      desc: '正身处蜀山云来剑庐，可与师尊酒剑仙、玄影师兄论剑切磋，或在蒲团茶席养精蓄锐。',
      charId: 'char_xiaoyao',
      canNavigate: false,
    });

    const seenIds = new Set<string>();
    for (const npc of snap.npcs) {
      seenIds.add(npc.id);
      seenIds.add(npc.charId);
      pins.push({
        id: `camp_npc_${npc.id}`,
        kind: 'npc',
        filterKey: 'npc',
        name: npc.name,
        glyph: npc.name.slice(0, 1),
        tagLabel: npc.name.split('·')[0].trim().slice(0, 4),
        regionName: '云来剑庐',
        x: npc.x,
        z: npc.z,
        statusText: npc.title || '剑庐同门',
        statusTone: 'lit',
        desc: `${npc.name}（${npc.title}），身处云来剑庐庭院内，走近即可互动或查阅人物属性。`,
        charId: npc.charId || undefined,
        canNavigate: true,
      });
    }

    for (const spot of DEFAULT_CAMP_LANDMARKS) {
      if (spot.charId && seenIds.has(spot.charId)) continue;
      if (seenIds.has(spot.id)) continue;
      pins.push({
        id: spot.id,
        kind: spot.charId ? 'npc' : 'waypoint',
        filterKey: spot.charId ? 'npc' : 'waypoint',
        name: spot.name,
        glyph: spot.glyph,
        tagLabel: spot.name.split('·')[0].trim().slice(0, 4),
        regionName: '云来剑庐',
        x: spot.x,
        z: spot.z,
        statusText: spot.title,
        statusTone: 'lit',
        desc: spot.desc,
        charId: spot.charId,
        canNavigate: true,
      });
    }

    if (this.customPin) {
      pins.push({
        id: 'pin_custom',
        kind: 'custom',
        filterKey: 'always',
        name: this.customPin.label,
        glyph: '标',
        tagLabel: '步履标点',
        regionName: '云来剑庐',
        x: this.customPin.x,
        z: this.customPin.z,
        statusText: `庭院坐标 (${this.customPin.x.toFixed(1)}, ${this.customPin.z.toFixed(1)})`,
        statusTone: 'alive',
        desc: '点击「自动寻路前往」即可缓步前往此处，或前往九州仙域继续闯荡。',
        canNavigate: true,
      });
    }
  }

  private computeMetrics(): MapViewportMetrics {
    const rect = this.stageEl.getBoundingClientRect();
    const stageW = Math.max(200, Math.round(rect.width || this.stageEl.clientWidth || 340));
    const stageH = Math.max(200, Math.round(rect.height || this.stageEl.clientHeight || 340));
    const pad = Math.max(12, Math.min(20, Math.round(Math.min(stageW, stageH) * 0.045)));
    const mapSize = Math.max(140, Math.min(stageW, stageH) - pad * 2);
    const ox = Math.round((stageW - mapSize) * 0.5);
    const oy = Math.round((stageH - mapSize) * 0.5);
    const bound = this.snapshot?.hero.mode === 'camp' ? 11.5 : WORLD_BOUND;
    return { stageW, stageH, ox, oy, mapSize, bound };
  }

  private worldToStagePx(x: number, z: number, normX?: number, normY?: number): { px: number; py: number } {
    const m = this.lastMetrics;
    if (normX !== undefined && normY !== undefined) {
      return {
        px: m.ox + clamp(normX, 0.04, 0.96) * m.mapSize,
        py: m.oy + clamp(normY, 0.04, 0.96) * m.mapSize,
      };
    }
    const nx = (clamp(x, -m.bound, m.bound) + m.bound) / (m.bound * 2);
    const ny = (clamp(z, -m.bound, m.bound) + m.bound) / (m.bound * 2);
    return {
      px: m.ox + nx * m.mapSize,
      py: m.oy + ny * m.mapSize,
    };
  }

  private stagePxToWorld(px: number, py: number): { x: number; z: number } | null {
    const m = this.lastMetrics;
    if (m.mapSize <= 0) return null;
    const nx = clamp((px - m.ox) / m.mapSize, 0.02, 0.98);
    const ny = clamp((py - m.oy) / m.mapSize, 0.02, 0.98);
    const lim = m.bound - (m.bound > 20 ? 2 : 0.8);
    return {
      x: clamp((nx * 2 - 1) * m.bound, -lim, lim),
      z: clamp((ny * 2 - 1) * m.bound, -lim, lim),
    };
  }

  private syncLayoutAndRender(forceStaticRedraw: boolean): void {
    const m = this.computeMetrics();
    this.lastMetrics = m;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(m.stageW * dpr);
    const targetH = Math.round(m.stageH * dpr);

    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
      forceStaticRedraw = true;
    }

    if (forceStaticRedraw) {
      this.staticCacheKey = '';
    }
    this.drawFrame();
    this.syncPinDomAndPositions();
  }

  private syncPinDomAndPositions(): void {
    if (!this.snapshot) return;
    const structKey = this.resolvedPins
      .map((p) => `${p.id}:${p.kind}:${p.tagLabel ?? ''}:${(p.extraClasses ?? []).join('.')}:${this.selectedPinId === p.id ? '1' : '0'}`)
      .join('|');

    if (structKey !== this.lastPinsStructureKey) {
      this.lastPinsStructureKey = structKey;
      this.pinLayerEl.innerHTML = '';
      this.pinEls.clear();

      for (const pin of this.resolvedPins) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `amap-pin amap-pin--${pin.kind}${pin.extraClasses?.length ? ` ${pin.extraClasses.join(' ')}` : ''}${this.selectedPinId === pin.id ? ' selected' : ''}`;
        btn.dataset.pinId = pin.id;
        btn.dataset.kind = pin.kind;
        if (pin.charId) btn.dataset.charId = pin.charId;
        btn.setAttribute('aria-label', `${pin.name}（${pin.regionName}）`);

        if (pin.kind === 'hero') {
          btn.innerHTML = `
            <span class="amap-hero-ring" aria-hidden="true"></span>
            <span class="amap-hero-arrow" aria-hidden="true"></span>
            <span class="amap-pin-badge">${pin.glyph}</span>
            <span class="amap-pin-tag">当前所在</span>
          `;
        } else if (pin.kind === 'waypoint' || pin.kind === 'custom') {
          btn.innerHTML = `
            <span class="amap-pin-badge"><span>${pin.glyph}</span></span>
            ${pin.tagLabel ? `<span class="amap-pin-tag">${pin.tagLabel}</span>` : ''}
          `;
        } else {
          btn.innerHTML = `
            <span class="amap-pin-badge">${pin.glyph}</span>
            ${pin.tagLabel ? `<span class="amap-pin-tag">${pin.tagLabel}</span>` : ''}
          `;
        }

        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectPin(pin.id);
        });

        this.pinLayerEl.appendChild(btn);
        this.pinEls.set(pin.id, btn);
      }
    }

    // Update exact pixel positions & Hero directional arrow angle smoothly in-place
    const heroYaw = this.snapshot.hero.yaw;
    const arrowDeg = ((Math.PI - heroYaw) * 180) / Math.PI;
    for (const pin of this.resolvedPins) {
      const btn = this.pinEls.get(pin.id);
      if (!btn) continue;
      const { px, py } = this.worldToStagePx(pin.x, pin.z, pin.normX, pin.normY);
      btn.style.left = `${px.toFixed(1)}px`;
      btn.style.top = `${py.toFixed(1)}px`;
      if (pin.kind === 'hero') {
        const arrow = btn.querySelector<HTMLElement>('.amap-hero-arrow');
        if (arrow) {
          arrow.style.transform = `rotate(${arrowDeg.toFixed(1)}deg)`;
        }
      }
    }
  }

  private selectPin(pinId: string): void {
    this.selectedPinId = pinId;
    for (const [id, el] of this.pinEls.entries()) {
      el.classList.toggle('selected', id === pinId);
    }
    this.renderDrawer();
    // Re-sync layout in case bottom sheet changed stage height on Portrait
    requestAnimationFrame(() => {
      if (this.openState) this.syncLayoutAndRender(false);
    });
  }

  private getSelectedPin(): ResolvedMapPin | null {
    if (!this.selectedPinId) return null;
    return this.resolvedPins.find((p) => p.id === this.selectedPinId) ?? null;
  }

  private renderDrawer(): void {
    const snap = this.snapshot;
    if (!snap) return;

    const pin = this.getSelectedPin();
    if (!pin) {
      this.drawerEl.classList.add('collapsed');
      const heroReg = snap.hero.regionName || getWorldRegionAt(snap.hero.x, snap.hero.z).name;
      this.drawerEl.innerHTML = `
        <div class="amap-drawer-head">
          <div class="amap-drawer-title-wrap">
            <span class="amap-drawer-kind kind-hero">堪舆</span>
            <h3 class="amap-drawer-name">${this.escapeHtml(heroReg)}</h3>
          </div>
          <span class="amap-drawer-dist">轻点标点查详情</span>
        </div>
      `;
      return;
    }

    this.drawerEl.classList.remove('collapsed');

    const kindLabelMap: Record<PinKind, string> = {
      hero: '主角',
      waypoint: '锚点',
      boss: '首领',
      camp: '营地',
      chest: '宝箱',
      orb: '灵瞳',
      npc: '人物',
      region: '仙域',
      custom: '标点',
    };

    const dist =
      pin.kind === 'hero' || snap.hero.mode === 'playing'
        ? null
        : Math.hypot(pin.x - snap.hero.x, pin.z - snap.hero.z);
    const distLabel = dist !== null ? `距主角 ${Math.round(dist)} 丈` : snap.hero.mode === 'playing' ? '当前战役' : '当前所在';

    const metaChips: string[] = [];
    metaChips.push(`<span class="amap-meta-chip">${this.escapeHtml(pin.regionName)}</span>`);
    const statusCls = pin.statusTone === 'alive' ? ' status-alive' : pin.statusTone === 'lit' ? ' status-lit' : '';
    metaChips.push(`<span class="amap-meta-chip${statusCls}">${this.escapeHtml(pin.statusText)}</span>`);
    if (pin.recommendedRealm) {
      metaChips.push(`<span class="amap-meta-chip">推荐：${this.escapeHtml(pin.recommendedRealm)}</span>`);
    }
    if (pin.rewardText) {
      metaChips.push(`<span class="amap-meta-chip">${this.escapeHtml(pin.rewardText)}</span>`);
    }

    const actions: string[] = [];
    if (pin.teleportId && snap.hero.mode === 'world') {
      actions.push(`<button type="button" class="amap-act-btn amap-act-btn--jade" data-action="teleport">瞬移传送</button>`);
    }
    if (pin.canNavigate) {
      actions.push(`<button type="button" class="amap-act-btn amap-act-btn--primary" data-action="navigate">自动寻路前往</button>`);
    }
    if (pin.charId) {
      actions.push(`<button type="button" class="amap-act-btn amap-act-btn--ink" data-action="inspect-char">查看角色属性</button>`);
    }
    if (pin.kind === 'custom') {
      actions.push(`<button type="button" class="amap-act-btn amap-act-btn--ink" data-action="clear-custom">清除标点</button>`);
    }

    this.drawerEl.innerHTML = `
      <div class="amap-drawer-head">
        <div class="amap-drawer-title-wrap">
          <span class="amap-drawer-kind kind-${pin.kind}">${kindLabelMap[pin.kind]}</span>
          <h3 class="amap-drawer-name">${this.escapeHtml(pin.name)}</h3>
        </div>
        <span class="amap-drawer-dist">${this.escapeHtml(distLabel)}</span>
      </div>
      <div class="amap-drawer-meta">${metaChips.join('')}</div>
      <p class="amap-drawer-desc">${this.escapeHtml(pin.desc)}${pin.lore ? ` ${this.escapeHtml(pin.lore)}` : ''}</p>
      ${actions.length ? `<div class="amap-drawer-actions">${actions.join('')}</div>` : ''}
    `;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ========================================================================
     Song / Ming Dynasty Shan-Shui Ink-Wash Parchment Cartography Renderer
     ======================================================================== */
  private drawFrame(): void {
    const snap = this.snapshot;
    if (!snap) return;

    const m = this.lastMetrics;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cacheKey = `${snap.hero.mode}:${snap.hero.stageId ?? 0}:${this.canvas.width}x${this.canvas.height}:${m.ox},${m.oy},${m.mapSize}`;

    if (this.staticCacheKey !== cacheKey) {
      this.staticCacheKey = cacheKey;
      this.staticCacheCanvas.width = this.canvas.width;
      this.staticCacheCanvas.height = this.canvas.height;
      const sctx = this.staticCacheCanvas.getContext('2d');
      if (sctx) {
        sctx.save();
        sctx.scale(dpr, dpr);
        this.paintStaticParchmentMap(sctx, m, snap);
        sctx.restore();
      }
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.staticCacheCanvas, 0, 0);
    ctx.scale(dpr, dpr);
    this.paintDynamicOverlay(ctx, m, snap);
    ctx.restore();
  }

  private paintStaticParchmentMap(
    ctx: CanvasRenderingContext2D,
    m: MapViewportMetrics,
    snap: AncientMapSnapshot,
  ): void {
    const { stageW, stageH, ox, oy, mapSize } = m;

    // 1. Aged Sheepskin / Xuan Paper Base Gradient
    const bgGrad = ctx.createRadialGradient(
      stageW * 0.5,
      stageH * 0.46,
      mapSize * 0.08,
      stageW * 0.5,
      stageH * 0.5,
      Math.max(stageW, stageH) * 0.78,
    );
    bgGrad.addColorStop(0, '#f2e6cb');
    bgGrad.addColorStop(0.55, '#e4cf9f');
    bgGrad.addColorStop(0.88, '#cfb27d');
    bgGrad.addColorStop(1, '#b8945e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, stageW, stageH);

    // 2. Subtle Paper Grain Fibers & Antique Tea-Stain Foxing
    ctx.save();
    for (let i = 0; i < 65; i++) {
      const fy = seededNoise(i + 11) * stageH;
      const fx = seededNoise(i + 47) * stageW * 0.4;
      const fw = stageW * (0.35 + seededNoise(i + 83) * 0.65);
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(110, 78, 38, 0.055)' : 'rgba(255, 248, 232, 0.09)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + fw, fy + (seededNoise(i + 9) - 0.5) * 4);
      ctx.stroke();
    }
    for (let i = 0; i < 18; i++) {
      const sx = seededNoise(i * 3 + 5) * stageW;
      const sy = seededNoise(i * 7 + 13) * stageH;
      const sr = 18 + seededNoise(i * 5 + 2) * 52;
      const stain = ctx.createRadialGradient(sx, sy, 2, sx, sy, sr);
      stain.addColorStop(0, 'rgba(126, 86, 40, 0.075)');
      stain.addColorStop(1, 'rgba(126, 86, 40, 0)');
      ctx.fillStyle = stain;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 3. Traditional Chinese Cartographic Square Grid (计里画方) & Double Border Frame
    ctx.save();
    const gridCells = 8;
    const step = mapSize / gridCells;
    ctx.strokeStyle = 'rgba(104, 74, 38, 0.13)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i <= gridCells; i++) {
      const gx = ox + i * step;
      const gy = oy + i * step;
      ctx.beginPath();
      ctx.moveTo(gx, oy);
      ctx.lineTo(gx, oy + mapSize);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(ox, gy);
      ctx.lineTo(ox + mapSize, gy);
      ctx.stroke();
    }

    // Antique inner double-line scroll border
    ctx.strokeStyle = 'rgba(92, 60, 28, 0.45)';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(ox - 4, oy - 4, mapSize + 8, mapSize + 8);
    ctx.strokeStyle = 'rgba(146, 102, 48, 0.34)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(ox, oy, mapSize, mapSize);
    ctx.restore();

    const mode = snap.hero.mode;
    if (mode === 'playing') {
      this.paintCampaignShanShui(ctx, m, snap);
    } else if (mode === 'camp') {
      this.paintCampSanctuaryScroll(ctx, m);
    } else {
      this.paintNineProvincesShanShui(ctx, m);
    }

    // Ornamental Bagua Eight-Trigram Compass (乾坤八卦罗盘) placed in guaranteed clear margin/valley
    const rightMargin = stageW - (ox + mapSize);
    const leftMargin = ox;
    const compassR = clamp(mapSize * 0.072, 16, 24);
    let compassX: number;
    let compassY: number;
    if (rightMargin >= compassR * 2 + 22) {
      // Wide landscape / desktop scroll: lower-right outer parchment margin (clear of map seals & bottom-left hint)
      compassX = Math.min(stageW - compassR - 14, ox + mapSize + Math.min(48, rightMargin * 0.5));
      compassY = Math.min(stageH - compassR - 18, oy + mapSize - compassR - 12);
    } else if (leftMargin >= compassR * 2 + 22) {
      compassX = Math.max(compassR + 14, ox - Math.min(48, leftMargin * 0.5));
      compassY = Math.max(compassR + 18, oy + compassR + 12);
    } else {
      // Square portrait parchment: clear mid-east valley (x≈+66, z≈+2), clear of all 6 seals & pins
      compassX = ox + mapSize * 0.895;
      compassY = oy + mapSize * 0.505;
    }
    this.paintBaguaCompass(ctx, compassX, compassY, compassR);
  }

  private paintNineProvincesShanShui(ctx: CanvasRenderingContext2D, m: MapViewportMetrics): void {
    const { ox, oy, mapSize } = m;
    const toPx = (wx: number, wz: number) => ({
      x: ox + ((wx + WORLD_BOUND) / (WORLD_BOUND * 2)) * mapSize,
      y: oy + ((wz + WORLD_BOUND) / (WORLD_BOUND * 2)) * mapSize,
    });

    // 1. Winding Jade Spirit River / Vein (青绿灵脉水系)
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const riverPts = [
      toPx(-14, 74),
      toPx(-6, 42),
      toPx(10, 14),
      toPx(22, -10),
      toPx(38, -28),
      toPx(68, -42),
    ];
    ctx.strokeStyle = 'rgba(54, 134, 122, 0.28)';
    ctx.lineWidth = Math.max(8, mapSize * 0.042);
    this.strokeSmoothPath(ctx, riverPts);

    ctx.strokeStyle = 'rgba(34, 108, 98, 0.42)';
    ctx.lineWidth = Math.max(3, mapSize * 0.014);
    this.strokeSmoothPath(ctx, riverPts);

    // Secondary misty northern spirit brook feeding the Crypt chasm
    const northBrook = [toPx(-18, -32), toPx(-8, -44), toPx(-4, -64)];
    ctx.strokeStyle = 'rgba(42, 126, 124, 0.28)';
    ctx.lineWidth = Math.max(4, mapSize * 0.018);
    this.strokeSmoothPath(ctx, northBrook);
    ctx.restore();

    // 2. Regional Watercolor / Mineral Pigment Washes
    const washes: Array<{ wx: number; wz: number; r: number; c0: string; c1: string }> = [
      { wx: 0, wz: 0, r: 22, c0: 'rgba(66, 148, 134, 0.24)', c1: 'rgba(66, 148, 134, 0)' },
      { wx: 46, wz: -44, r: 27, c0: 'rgba(208, 114, 142, 0.26)', c1: 'rgba(208, 114, 142, 0)' },
      { wx: -48, wz: -44, r: 27, c0: 'rgba(104, 82, 146, 0.24)', c1: 'rgba(104, 82, 146, 0)' },
      { wx: -46, wz: 44, r: 25, c0: 'rgba(196, 76, 40, 0.28)', c1: 'rgba(196, 76, 40, 0)' },
      { wx: 48, wz: 44, r: 26, c0: 'rgba(72, 132, 178, 0.25)', c1: 'rgba(72, 132, 178, 0)' },
      { wx: 0, wz: -58, r: 24, c0: 'rgba(32, 74, 82, 0.34)', c1: 'rgba(32, 74, 82, 0)' },
    ];
    for (const w of washes) {
      const c = toPx(w.wx, w.wz);
      const rad = (w.r / (WORLD_BOUND * 2)) * mapSize;
      const g = ctx.createRadialGradient(c.x, c.y, rad * 0.1, c.x, c.y, rad);
      g.addColorStop(0, w.c0);
      g.addColorStop(1, w.c1);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Layered Ink-Wash Mountain Peaks (水墨山峦) framing edges & Northern Crypt Gorge
    const peakRanges: Array<[number, number, number, number]> = [
      // Northern twin chasm mountains cradling 北溟·幽冥古地窟
      [-24, -67, 20, 14],
      [24, -67, 20, 14],
      [-14, -73, 15, 11],
      [14, -73, 15, 11],
      // NW & NE horizon ranges
      [-64, -66, 22, 15],
      [64, -66, 22, 15],
      [-70, -14, 16, 13],
      [70, -14, 16, 13],
      // SW & SE outer ridges
      [-68, 22, 17, 13],
      [68, 20, 17, 13],
      [-26, 70, 22, 14],
      [26, 70, 22, 14],
      [-64, 68, 20, 13],
    ];
    for (let i = 0; i < peakRanges.length; i++) {
      const [wx, wz, ww, wh] = peakRanges[i];
      const pt = toPx(wx, wz);
      const pw = (ww / (WORLD_BOUND * 2)) * mapSize;
      const ph = (wh / (WORLD_BOUND * 2)) * mapSize;
      this.paintInkMountainCluster(ctx, pt.x, pt.y, pw, ph, i);
    }

    // 4. Iconic Hand-Inked Regional Landmarks
    // Center Bagua Shushan Cloud Terrace
    const hub = toPx(0, 0);
    const hubR = (15 / (WORLD_BOUND * 2)) * mapSize;
    ctx.save();
    ctx.strokeStyle = 'rgba(46, 98, 92, 0.56)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(hub.x, hub.y, hubR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hub.x, hub.y, hubR * 0.58, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // SW Lava Abyss Fissure Ring
    const lavaC = toPx(-46, 44);
    const lavaR = (14.5 / (WORLD_BOUND * 2)) * mapSize;
    ctx.save();
    ctx.strokeStyle = 'rgba(176, 52, 24, 0.52)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(lavaC.x, lavaC.y, lavaR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // SE Celestial Star Sanctuary Rings
    const starC = toPx(48, 44);
    const starR = (15 / (WORLD_BOUND * 2)) * mapSize;
    ctx.save();
    ctx.strokeStyle = 'rgba(42, 98, 138, 0.45)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(starC.x, starC.y, starR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(starC.x, starC.y, starR * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // NW Sword Graveyard tiny ink sword silhouettes
    ctx.save();
    ctx.strokeStyle = 'rgba(72, 54, 98, 0.52)';
    ctx.lineWidth = 1.3;
    for (const [sx, sz, tilt] of [[-40, -38, 0.25], [-56, -40, -0.22], [-46, -54, 0.14]]) {
      const sp = toPx(sx, sz);
      ctx.save();
      ctx.translate(sp.x, sp.y);
      ctx.rotate(tilt);
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(0, 4);
      ctx.moveTo(-3, -3);
      ctx.lineTo(3, -3);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // NE Peach Blossom ink dabs
    ctx.save();
    ctx.fillStyle = 'rgba(196, 86, 118, 0.44)';
    for (const [px, pz] of [[38, -38], [55, -39], [42, -52], [53, -53], [48, -34]]) {
      const pp = toPx(px, pz);
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // North Crypt Archway & Rune Altar Illustration (北溟 · 幽冥古地窟)
    const cryptGate = toPx(0, -54);
    const cryptAltar = toPx(0, -61);
    ctx.save();
    // Stone archway glyph
    ctx.strokeStyle = 'rgba(30, 62, 66, 0.78)';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(cryptGate.x - 9, cryptGate.y + 4);
    ctx.lineTo(cryptGate.x - 9, cryptGate.y - 5);
    ctx.lineTo(cryptGate.x + 9, cryptGate.y - 5);
    ctx.lineTo(cryptGate.x + 9, cryptGate.y + 4);
    ctx.stroke();
    // Eaves roof brush stroke
    ctx.beginPath();
    ctx.moveTo(cryptGate.x - 12, cryptGate.y - 5);
    ctx.quadraticCurveTo(cryptGate.x, cryptGate.y - 10, cryptGate.x + 12, cryptGate.y - 5);
    ctx.stroke();
    // Glowing jade altar seal ring
    ctx.strokeStyle = 'rgba(28, 146, 132, 0.65)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cryptAltar.x, cryptAltar.y, Math.max(7, mapSize * 0.032), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 5. Dashed Ancient Courier Roads (古驿道) connecting Hub to all 5 Outer Regions
    ctx.save();
    const roads: Array<[number, number, number, number]> = [
      [0, 0, 46, -44],
      [0, 0, -48, -44],
      [0, 0, -46, 44],
      [0, 0, 48, 44],
      [0, 0, 0, -54],
    ];
    for (const [x0, z0, x1, z1] of roads) {
      const p0 = toPx(x0, z0);
      const p1 = toPx(x1, z1);
      const mx = (p0.x + p1.x) * 0.5 + (z1 < 0 ? 5 : -5);
      const my = (p0.y + p1.y) * 0.5;
      // Parchment road bed halo
      ctx.strokeStyle = 'rgba(248, 238, 212, 0.62)';
      ctx.lineWidth = 4.2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.quadraticCurveTo(mx, my, p1.x, p1.y);
      ctx.stroke();
      // Dashed sepia courier track
      ctx.strokeStyle = 'rgba(92, 62, 34, 0.64)';
      ctx.lineWidth = 1.45;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.quadraticCurveTo(mx, my, p1.x, p1.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();

    // 6. Misty Cloud Bands (祥云烟岚)
    for (const [cx, cz, cw] of [
      [-28, 4, 24],
      [30, -2, 22],
      [-26, -54, 20],
      [26, -54, 20],
      [0, 46, 28],
    ]) {
      const cp = toPx(cx, cz);
      this.paintCloudBand(ctx, cp.x, cp.y, (cw / (WORLD_BOUND * 2)) * mapSize);
    }

    // 7. Vermilion Calligraphy Seals (朱砂印章) for all 6 Regions (staggered clear of all pins & compass!)
    const sealOffsets: Record<string, [number, number]> = {
      center: [0, 18.5],
      peach: [54, -65],
      grave: [-56, -65],
      lava: [-40, 69],
      star: [40, 69],
      crypt: [-23, -72],
    };
    for (const reg of WORLD_REGIONS) {
      const off = sealOffsets[reg.id] ?? [reg.centerX, reg.centerZ];
      const sp = toPx(off[0], off[1]);
      this.paintVermilionSeal(ctx, sp.x, sp.y, reg.shortName, mapSize < 260 ? 9 : 10.5);
    }
  }

  private paintCampaignShanShui(
    ctx: CanvasRenderingContext2D,
    m: MapViewportMetrics,
    snap: AncientMapSnapshot,
  ): void {
    const { ox, oy, mapSize } = m;
    const toNorm = (nx: number, ny: number) => ({ x: ox + nx * mapSize, y: oy + ny * mapSize });

    // Background mountain silhouettes along the pilgrimage ascent
    for (let i = 0; i < 8; i++) {
      const mx = ox + (0.1 + seededNoise(i * 4 + 3) * 0.8) * mapSize;
      const my = oy + (0.14 + seededNoise(i * 9 + 7) * 0.72) * mapSize;
      this.paintInkMountainCluster(ctx, mx, my, mapSize * 0.18, mapSize * 0.11, i + 20);
    }

    // Winding crimson-gold expedition road connecting Chapters 1 -> 5
    const routePts = CAMPAIGN_CHAPTER_NODES.map((c) => toNorm(c.nx, c.ny));
    ctx.save();
    ctx.strokeStyle = 'rgba(248, 236, 210, 0.72)';
    ctx.lineWidth = 6;
    this.strokeSmoothPath(ctx, routePts);

    ctx.strokeStyle = 'rgba(154, 42, 32, 0.72)';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([7, 5]);
    this.strokeSmoothPath(ctx, routePts);
    ctx.setLineDash([]);
    ctx.restore();

    // Chapter pigment halos & vermilion region seals
    const activeChapter = Math.ceil(clamp(snap.hero.stageId ?? 1, 1, 25) / 5);
    for (const ch of CAMPAIGN_CHAPTER_NODES) {
      const pt = toNorm(ch.nx, ch.ny);
      const rad = mapSize * (ch.chapter === activeChapter ? 0.14 : 0.09);
      const grad = ctx.createRadialGradient(pt.x, pt.y, 2, pt.x, pt.y, rad);
      grad.addColorStop(0, ch.chapter === activeChapter ? 'rgba(218, 166, 68, 0.42)' : 'rgba(64, 118, 110, 0.18)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, rad, 0, Math.PI * 2);
      ctx.fill();

      this.paintVermilionSeal(ctx, pt.x, pt.y - 22, ch.seal, mapSize < 260 ? 9 : 10);
    }

    // Current Stage 3-Zone Corridor Inset Strip (top-left of parchment)
    const boxW = Math.min(mapSize * 0.58, 186);
    const boxH = 44;
    const bx = ox + 8;
    const by = oy + 8;
    ctx.save();
    ctx.fillStyle = 'rgba(246, 235, 210, 0.88)';
    ctx.strokeStyle = 'rgba(134, 92, 46, 0.55)';
    ctx.lineWidth = 1.1;
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeRect(bx, by, boxW, boxH);

    ctx.fillStyle = '#3a2614';
    ctx.font = '700 10.5px "Noto Serif SC", "Songti SC", serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const pct = Math.round(clamp(snap.hero.progressPct ?? 0, 0, 100));
    ctx.fillText(`战区推进 · ${snap.hero.zoneName ?? '云溪山门'} (${pct}%)`, bx + 7, by + 6);

    const barX = bx + 7;
    const barY = by + 25;
    const barW = boxW - 14;
    ctx.fillStyle = 'rgba(104, 74, 40, 0.2)';
    ctx.fillRect(barX, barY, barW, 8);
    ctx.fillStyle = '#a82d24';
    ctx.fillRect(barX, barY, (barW * pct) / 100, 8);
    ctx.strokeStyle = 'rgba(104, 74, 40, 0.48)';
    ctx.strokeRect(barX, barY, barW, 8);
    ctx.restore();
  }

  private paintCampSanctuaryScroll(ctx: CanvasRenderingContext2D, m: MapViewportMetrics): void {
    const { ox, oy, mapSize } = m;
    const cx = ox + mapSize * 0.5;
    const cy = oy + mapSize * 0.5;

    // Surrounding mountain cliff & misty bamboo halo
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      this.paintInkMountainCluster(
        ctx,
        cx + Math.cos(a) * mapSize * 0.42,
        cy + Math.sin(a) * mapSize * 0.42,
        mapSize * 0.18,
        mapSize * 0.11,
        i + 40,
      );
    }

    // Circular Flagstone Courtyard Terrace
    ctx.save();
    const patioGrad = ctx.createRadialGradient(cx, cy, mapSize * 0.05, cx, cy, mapSize * 0.36);
    patioGrad.addColorStop(0, 'rgba(232, 218, 186, 0.85)');
    patioGrad.addColorStop(0.85, 'rgba(176, 158, 124, 0.5)');
    patioGrad.addColorStop(1, 'rgba(128, 114, 88, 0)');
    ctx.fillStyle = patioGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, mapSize * 0.36, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(72, 92, 86, 0.58)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, mapSize * 0.33, 0, Math.PI * 2);
    ctx.stroke();

    // Inner Bagua Courtyard Seal
    ctx.strokeStyle = 'rgba(34, 116, 108, 0.46)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, mapSize * 0.15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    this.paintCloudBand(ctx, cx - mapSize * 0.28, cy + mapSize * 0.32, mapSize * 0.24);
    this.paintCloudBand(ctx, cx + mapSize * 0.28, cy - mapSize * 0.3, mapSize * 0.22);
    this.paintVermilionSeal(ctx, cx, oy + 20, '云来剑庐', mapSize < 260 ? 10 : 11);
  }

  private paintDynamicOverlay(
    ctx: CanvasRenderingContext2D,
    m: MapViewportMetrics,
    snap: AncientMapSnapshot,
  ): void {
    const heroPin = this.resolvedPins.find((p) => p.id === 'pin_hero');
    if (!heroPin) return;
    const heroPt = this.worldToStagePx(heroPin.x, heroPin.z, heroPin.normX, heroPin.normY);

    // Draw dashed spirit route line to customPin OR snapshot.activeTarget
    const target = this.customPin ?? snap.activeTarget ?? null;
    if (target && snap.hero.mode !== 'playing') {
      const targetPt = this.worldToStagePx(target.x, target.z);
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 244, 212, 0.82)';
      ctx.lineWidth = 4.2;
      ctx.beginPath();
      ctx.moveTo(heroPt.px, heroPt.py);
      ctx.lineTo(targetPt.px, targetPt.py);
      ctx.stroke();

      ctx.strokeStyle = '#b42c22';
      ctx.lineWidth = 2.0;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(heroPt.px, heroPt.py);
      ctx.lineTo(targetPt.px, targetPt.py);
      ctx.stroke();
      ctx.setLineDash([]);

      // Target swirl ring
      ctx.strokeStyle = 'rgba(180, 44, 34, 0.72)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(targetPt.px, targetPt.py, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Subtle jade radial halo beneath Hero Beacon on parchment
    ctx.save();
    const halo = ctx.createRadialGradient(heroPt.px, heroPt.py, 2, heroPt.px, heroPt.py, Math.max(18, m.mapSize * 0.06));
    halo.addColorStop(0, 'rgba(34, 156, 140, 0.34)');
    halo.addColorStop(1, 'rgba(34, 156, 140, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(heroPt.px, heroPt.py, Math.max(18, m.mapSize * 0.06), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private paintInkMountainCluster(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    w: number,
    h: number,
    seed: number,
  ): void {
    ctx.save();
    const layers = 2;
    for (let l = 0; l < layers; l++) {
      const lw = w * (l === 0 ? 1.0 : 0.7);
      const lh = h * (l === 0 ? 1.0 : 0.78);
      const ox = (l === 0 ? 0 : (seededNoise(seed + 4) - 0.5) * w * 0.45);
      const oy = l === 0 ? 0 : h * 0.16;
      const baseY = cy + oy + lh * 0.35;
      const peakY = cy + oy - lh * 0.65;

      const grad = ctx.createLinearGradient(cx + ox, peakY, cx + ox, baseY);
      grad.addColorStop(0, l === 0 ? 'rgba(42, 46, 44, 0.48)' : 'rgba(54, 48, 38, 0.58)');
      grad.addColorStop(0.6, 'rgba(66, 62, 50, 0.22)');
      grad.addColorStop(1, 'rgba(220, 200, 160, 0)');

      ctx.beginPath();
      ctx.moveTo(cx + ox - lw * 0.55, baseY);
      ctx.quadraticCurveTo(cx + ox - lw * 0.22, peakY + lh * 0.25, cx + ox - lw * 0.06, peakY);
      ctx.quadraticCurveTo(cx + ox + lw * 0.12, peakY + lh * 0.16, cx + ox + lw * 0.24, peakY + lh * 0.26);
      ctx.quadraticCurveTo(cx + ox + lw * 0.42, peakY + lh * 0.48, cx + ox + lw * 0.58, baseY);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Sumi-ink summit ridge line (皴法勾勒)
      ctx.strokeStyle = 'rgba(44, 36, 28, 0.36)';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(cx + ox - lw * 0.42, baseY - lh * 0.18);
      ctx.quadraticCurveTo(cx + ox - lw * 0.14, peakY + lh * 0.1, cx + ox - lw * 0.06, peakY);
      ctx.quadraticCurveTo(cx + ox + lw * 0.12, peakY + lh * 0.15, cx + ox + lw * 0.36, baseY - lh * 0.22);
      ctx.stroke();
    }
    ctx.restore();
  }

  private paintCloudBand(ctx: CanvasRenderingContext2D, cx: number, cy: number, span: number): void {
    ctx.save();
    ctx.fillStyle = 'rgba(252, 246, 232, 0.42)';
    for (let i = -2; i <= 2; i++) {
      const rx = cx + i * span * 0.18;
      const ry = cy + Math.sin(i * 1.4) * 2.5;
      const r = span * (0.14 - Math.abs(i) * 0.018);
      ctx.beginPath();
      ctx.ellipse(rx, ry, Math.max(4, r * 1.4), Math.max(2.5, r * 0.62), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private paintVermilionSeal(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    text: string,
    fontSize: number,
  ): void {
    ctx.save();
    ctx.font = `800 ${fontSize}px "Noto Serif SC", "Songti SC", "KaiTi", serif`;
    const padX = 5;
    const padY = 3;
    const tw = ctx.measureText(text).width;
    const w = tw + padX * 2;
    const h = fontSize + padY * 2;
    const x = cx - w * 0.5;
    const y = cy - h * 0.5;

    ctx.fillStyle = 'rgba(166, 36, 28, 0.84)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(246, 224, 188, 0.85)';
    ctx.lineWidth = 0.9;
    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);

    ctx.fillStyle = '#fff5e4';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy + 0.5);
    ctx.restore();
  }

  private paintBaguaCompass(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    ctx.save();
    ctx.translate(cx, cy);

    // Parchment disc backing
    ctx.fillStyle = 'rgba(242, 228, 198, 0.88)';
    ctx.beginPath();
    ctx.arc(0, 0, r + 3, 0, Math.PI * 2);
    ctx.fill();

    // Outer & inner brass-sepia bezel rings
    ctx.strokeStyle = 'rgba(92, 62, 32, 0.78)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(134, 92, 46, 0.56)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2);
    ctx.stroke();

    // Eight Bagua trigram ticks around bezel
    ctx.strokeStyle = 'rgba(72, 48, 24, 0.66)';
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.74, Math.sin(a) * r * 0.74);
      ctx.lineTo(Math.cos(a) * r * 0.94, Math.sin(a) * r * 0.94);
      ctx.stroke();
    }

    // North-South Vermilion & Ink Compass Needle
    ctx.fillStyle = '#ad2b22';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.6);
    ctx.lineTo(r * 0.17, 0);
    ctx.lineTo(-r * 0.17, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#36271a';
    ctx.beginPath();
    ctx.moveTo(0, r * 0.6);
    ctx.lineTo(r * 0.17, 0);
    ctx.lineTo(-r * 0.17, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#e8c474';
    ctx.beginPath();
    ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Cardinal calligraphy characters (北 南 东 西)
    ctx.font = `800 ${Math.max(8, Math.round(r * 0.38))}px "Noto Serif SC", "Songti SC", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#a4261e';
    ctx.fillText('北', 0, -r - 6);
    ctx.fillStyle = '#4c3520';
    ctx.fillText('南', 0, r + 7);
    ctx.fillText('东', r + 7, 0.5);
    ctx.fillText('西', -r - 7, 0.5);

    ctx.restore();
  }

  private strokeSmoothPath(ctx: CanvasRenderingContext2D, pts: Array<{ x: number; y: number }>): void {
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) * 0.5;
      const my = (pts[i].y + pts[i + 1].y) * 0.5;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }
}

import iconYujian from '../assets/icon-yujian.jpg';
import iconWanjian from '../assets/icon-wanjian.jpg';
import iconTianjian from '../assets/icon-tianjian.jpg';
import iconHulu from '../assets/icon-hulu.jpg';
import medalAttack from '../assets/medal-attack.jpg';
import medalDodge from '../assets/medal-dodge.jpg';
import medalParry from '../assets/medal-parry.jpg';
import type { HeroState, EnemyEntity, PeerHeroState } from '../game/CombatEntities';
import { clamp } from '../utils/math';
import { isNativeAndroidApp } from '../core/NativeBridge';

export type ScreenMode = 'title' | 'playing' | 'cutscene' | 'paused' | 'victory' | 'defeat' | 'showcase';

export interface HudCallbacks {
  onStart: (stage: 1 | 2 | 3) => void;
  onRetry: () => void;
  onBackToTitle: () => void;
  onToggleMute: () => boolean;
  onTogglePause: () => void;
  onToggleLolMode: () => boolean;
  onMpCreate: (mode: 'coop' | 'solo', stage: 1 | 2 | 3) => void;
  onMpJoin: (code: string) => void;
  onMpQuick: (mode: 'coop' | 'solo', stage: 1 | 2 | 3) => void;
  onMpLeave: () => void;
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

  private readonly counterPrompt = this.q('#counter-prompt');
  private readonly comboBox = this.q('#combo-box');
  private readonly comboNum = this.q('#combo-num');
  private readonly subtitleBanner = this.q('#subtitle-banner');
  private readonly stageBanner = this.q('#stage-banner');
  private readonly stageBannerKicker = this.q('#stage-banner-kicker');
  private readonly stageBannerTitle = this.q('#stage-banner-title');
  private readonly calloutContainer = this.q('#callout-layer');

  private readonly resultTitle = this.q('#result-title');
  private readonly resultSub = this.q('#result-sub');
  private readonly resultStats = this.q('#result-stats');
  private readonly muteBtn = this.q('#btn-mute');
  private readonly wheelToggleBtn = this.q('#btn-wheel-toggle');
  private readonly lolToggleBtn = this.q('#btn-lol-toggle');
  private readonly mpHudBadge = this.q('#mp-hud-badge');

  // Online lobby controls
  private readonly mpCodeInput = this.q('#mp-code-input') as HTMLInputElement;
  private readonly mpStatusBar = this.q('#mp-status-bar');
  private readonly mpStatusText = this.q('#mp-status-text');
  private readonly mpConnDot = this.q('#mp-conn-dot');

  private selectedStage: 1 | 2 | 3 = 1;
  private subtitleTimer = 0;
  private stageBannerTimer = 0;
  private wheelForced = false;

  constructor(private readonly callbacks: HudCallbacks) {
    // Bind photorealistic embossed bronze/jade medallion art to BOTH desktop bar & Honor-of-Kings wheel
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

    // Auto-enable Honor-of-Kings wheel on Android Capacitor APK or ?wheel query param
    const params = new URLSearchParams(window.location.search);
    if (isNativeAndroidApp() || params.has('wheel')) {
      this.setWheelForced(true);
    }

    // 3-Stage selector pills
    for (const s of [1, 2, 3] as const) {
      this.q(`#stage-btn-${s}`).addEventListener('click', () => this.selectStage(s));
    }

    this.q('#btn-start').addEventListener('click', () => this.callbacks.onStart(this.selectedStage));
    this.q('#btn-retry').addEventListener('click', () => this.callbacks.onRetry());
    this.q('#btn-resume').addEventListener('click', () => this.callbacks.onTogglePause());
    this.q('#btn-restart-pause').addEventListener('click', () => this.callbacks.onRetry());
    this.q('#btn-pause').addEventListener('click', () => this.callbacks.onTogglePause());
    this.q('#btn-pause-title').addEventListener('click', () => this.callbacks.onBackToTitle());
    this.q('#btn-result-title').addEventListener('click', () => this.callbacks.onBackToTitle());

    this.wheelToggleBtn.addEventListener('click', () => {
      this.setWheelForced(!this.wheelForced);
    });

    this.lolToggleBtn.addEventListener('click', () => {
      const isLol = this.callbacks.onToggleLolMode();
      this.lolToggleBtn.textContent = isLol ? '联盟鼠标' : '经典WASD';
    });

    this.muteBtn.addEventListener('click', () => {
      const muted = this.callbacks.onToggleMute();
      this.muteBtn.textContent = muted ? '静音' : '音律';
    });

    // Multiplayer Lobby bindings
    this.q('#btn-mp-coop').addEventListener('click', () => this.callbacks.onMpCreate('coop', this.selectedStage));
    this.q('#btn-mp-solo').addEventListener('click', () => this.callbacks.onMpCreate('solo', 3));
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
  }

  selectStage(stage: 1 | 2 | 3): void {
    this.selectedStage = stage;
    for (const s of [1, 2, 3] as const) {
      this.q(`#stage-btn-${s}`).classList.toggle('active', s === stage);
    }
  }

  setWheelForced(enabled: boolean): void {
    this.wheelForced = enabled;
    this.appRoot.classList.toggle('force-wheel', enabled);
    this.wheelToggleBtn.textContent = enabled ? '键鼠' : '轮盘';
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
    this.titleOverlay.classList.toggle('visible', mode === 'title');
    this.hudRoot.classList.toggle('visible', mode === 'playing');
    this.touchRoot.classList.toggle('visible', mode === 'playing');
    this.pauseOverlay.classList.toggle('visible', mode === 'paused');
    this.resultOverlay.classList.toggle('visible', mode === 'victory' || mode === 'defeat');

    if (mode !== 'playing') {
      this.counterPrompt.classList.remove('visible');
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

  showResult(victory: boolean, elapsedSec: number, hero: HeroState, customTitle?: string, customSub?: string): void {
    const mins = Math.floor(elapsedSec / 60);
    const secs = Math.floor(elapsedSec % 60);
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    this.resultTitle.textContent = customTitle ?? (victory ? '降 妖 凯 旋' : '身 陨 剑 台');
    this.resultTitle.className = victory ? 'result-title win' : 'result-title lose';
    this.resultSub.textContent =
      customSub ??
      (victory
        ? '三关俱破，剑光破晓。锁妖剑台重归清明。'
        : '妖气反噬，剑势折戟。整顿心神，再试剑锋。');

    this.resultStats.innerHTML = `
      <div class="stat-item"><span>用时</span><strong>${timeStr}</strong></div>
      <div class="stat-item"><span>完美弹反</span><strong>${hero.parryCount} 次</strong></div>
      <div class="stat-item"><span>最高连击</span><strong>${hero.maxCombo} 连</strong></div>
      <div class="stat-item"><span>总剑伤</span><strong>${Math.round(hero.totalDamage)}</strong></div>
    `;
  }

  update(hero: HeroState, objective: string, boss: EnemyEntity | null, peer: PeerHeroState | null = null): void {
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

    // Co-op teammate mini HP bar
    if (peer && !peer.isEnemy) {
      this.allyMini.classList.add('visible');
      this.allyMiniName.textContent = peer.dead ? `${peer.name}（重伤待援）` : `同伴 · ${peer.name}`;
      this.allyHpFill.style.width = `${(clamp(peer.hp / peer.maxHp, 0, 1) * 100).toFixed(1)}%`;
    } else {
      this.allyMini.classList.remove('visible');
    }

    // Top-center Boss / Elite / Solo PvP Rival bar
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

    // Update BOTH Desktop and Honor-of-Kings Wheel Sculpted Medallions with live conic cooldown sweep!
    this.updateSkillPair(this.slotQ, this.tSlotQ, this.sweepQ, this.tSweepQ, this.cdQEl, this.tCdQEl, hero.cdQ, SKILL_MAX_CD.Q, hero.spirit >= 20, false);
    this.updateSkillPair(this.slotE, this.tSlotE, this.sweepE, this.tSweepE, this.cdEEl, this.tCdEEl, hero.cdE, SKILL_MAX_CD.E, hero.spirit >= 45, false);
    this.updateSkillPair(this.slotR, this.tSlotR, this.sweepR, this.tSweepR, this.cdREl, this.tCdREl, hero.cdR, SKILL_MAX_CD.R, hero.ult >= 100, hero.ult >= 100 && hero.cdR <= 0);

    const healDisabled = hero.gourds <= 0 || hero.cdHeal > 0;
    const healPct = clamp(hero.cdHeal / SKILL_MAX_CD.F, 0, 1) * 360;
    this.slotF.classList.toggle('disabled', healDisabled);
    this.tSlotF.classList.toggle('disabled', healDisabled);
    this.sweepF.style.setProperty('--cd-deg', `${healPct.toFixed(1)}deg`);
    this.tSweepF.style.setProperty('--cd-deg', `${healPct.toFixed(1)}deg`);
    this.gourdCountEl.textContent = `${hero.gourds}`;
    this.tGourdCountEl.textContent = `${hero.gourds}`;

    // Counter-Execution Prompt
    this.counterPrompt.classList.toggle('visible', hero.counterWindowTimer > 0 && hero.counterTargetId !== null);

    // Combo badge
    if (hero.comboCount >= 2 && hero.comboDecayTimer > 0) {
      this.comboBox.classList.add('visible');
      this.comboNum.textContent = `${hero.comboCount}`;
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

  private q(sel: string): HTMLElement {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) throw new Error(`Missing HUD element: ${sel}`);
    return el;
  }
}

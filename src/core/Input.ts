/**
 * Robust input controller based on guizang-game-skill's anti-stuck-key design:
 * - Drops phantom opposite movement keys on press
 * - Clears held keys on Meta/Alt/Control (NEVER Shift!) and blur/focus/visibilitychange
 * - Resyncs RMB from mousemove e.buttons
 * - Buffers combat actions for 0.18s so hitstop never eats clicks
 * - Supports full touch virtual joystick + mobile skill buttons while suppressing synthetic mouse events
 */

import { isPureMobileDevice, triggerHaptic } from './NativeBridge';

export type BufferedAction = 'attack' | 'dodge' | 'skillQ' | 'skillE' | 'skillR' | 'heal';

const OPP: Record<string, string> = {
  KeyW: 'KeyS',
  KeyS: 'KeyW',
  KeyA: 'KeyD',
  KeyD: 'KeyA',
  ArrowUp: 'ArrowDown',
  ArrowDown: 'ArrowUp',
  ArrowLeft: 'ArrowRight',
  ArrowRight: 'ArrowLeft',
};

export class GameInput {
  readonly keys = new Set<string>();
  readonly pressed = new Set<string>();
  readonly mouseNdc = { x: 0, y: 0 };
  mouseMoved = false;
  lolMouseMode = true; // PC default: League-of-Legends RMB move + cursor directional aim!
  rmbHeld = false;
  private rmbClickQueued = false;
  touchActive = false;
  readonly touchMove = { x: 0, z: 0 };
  touchBlockHeld = false;

  private readonly actionBuffer = new Map<BufferedAction, number>();
  private recentLog: string[] = [];
  private debugEl: HTMLDivElement | null = null;
  private cleanups: Array<() => void> = [];
  private stickPointerId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private lastTouchTime = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    if (isPureMobileDevice()) {
      this.lolMouseMode = false;
      this.touchActive = true;
    }
    this.bindKeyboardAndMouse();
    this.bindTouchControls();
    this.createDebugPanel();
  }

  private note(s: string): void {
    this.recentLog.push(s);
    if (this.recentLog.length > 8) this.recentLog = this.recentLog.slice(-8);
  }

  bufferAction(action: BufferedAction, ttl = 0.2): void {
    this.actionBuffer.set(action, ttl);
  }

  consumeAction(action: BufferedAction): boolean {
    const t = this.actionBuffer.get(action);
    if (t !== undefined && t > 0) {
      this.actionBuffer.delete(action);
      return true;
    }
    return false;
  }

  hasBuffered(action: BufferedAction): boolean {
    const t = this.actionBuffer.get(action);
    return t !== undefined && t > 0;
  }

  /** Programmatic key injection for G.press(...) and automated bot playtests. */
  injectPress(...codes: string[]): void {
    for (const code of codes) {
      this.pressed.add(code);
      this.mapCodeToBuffer(code);
    }
  }

  tickBuffer(dt: number): void {
    for (const [k, v] of this.actionBuffer.entries()) {
      const next = v - dt;
      if (next <= 0) this.actionBuffer.delete(k);
      else this.actionBuffer.set(k, next);
    }
  }

  endFrame(): void {
    this.pressed.clear();
  }

  resetState(): void {
    this.keys.clear();
    this.pressed.clear();
    this.actionBuffer.clear();
    this.rmbHeld = false;
    this.rmbClickQueued = false;
    this.touchBlockHeld = false;
    this.touchMove.x = 0;
    this.touchMove.z = 0;
  }

  getMoveVector(out: { x: number; z: number }): void {
    let x = 0;
    let z = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1;

    if (x === 0 && z === 0 && (Math.abs(this.touchMove.x) > 0.08 || Math.abs(this.touchMove.z) > 0.08)) {
      x = this.touchMove.x;
      z = this.touchMove.z;
    }
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    out.x = x;
    out.z = z;
  }

  isBlocking(): boolean {
    const rmbBlock = !this.lolMouseMode && this.keys.has('RMB');
    return rmbBlock || this.keys.has('KeyK') || this.keys.has('KeyC') || this.keys.has('MMB') || this.touchBlockHeld;
  }

  wasBlockJustPressed(): boolean {
    const rmbPress = !this.lolMouseMode && this.pressed.has('RMB');
    return rmbPress || this.pressed.has('KeyK') || this.pressed.has('KeyC') || this.pressed.has('MMB') || this.pressed.has('TOUCH_BLOCK');
  }

  consumeRmbClick(): boolean {
    if (this.rmbClickQueued) {
      this.rmbClickQueued = false;
      return true;
    }
    return false;
  }

  setLolMouseMode(enabled: boolean): void {
    this.lolMouseMode = enabled;
    this.rmbHeld = false;
    this.rmbClickQueued = false;
    this.keys.delete('RMB');
  }

  updateDebugPanel(extraText: string): void {
    if (!this.debugEl || this.debugEl.style.display === 'none') return;
    this.debugEl.textContent =
      `held: ${[...this.keys].join(' ') || '-'}\n` +
      `focus: ${document.hasFocus()}  touch: ${this.touchActive}\n` +
      `${extraText}\n` +
      `recent: ${this.recentLog.join(' ')}`;
  }

  setDebugVisible(visible: boolean): void {
    if (this.debugEl) this.debugEl.style.display = visible ? 'block' : 'none';
  }

  private mapCodeToBuffer(code: string): void {
    if (code === 'LMB' || code === 'KeyJ') this.bufferAction('attack');
    else if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') this.bufferAction('dodge');
    else if (code === 'KeyQ') this.bufferAction('skillQ');
    else if (code === 'KeyE') this.bufferAction('skillE');
    else if (code === 'KeyR') this.bufferAction('skillR');
    else if (code === 'KeyF') this.bufferAction('heal');
  }

  private bindKeyboardAndMouse(): void {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.code === 'F3') {
        e.preventDefault();
        if (this.debugEl) {
          this.debugEl.style.display = this.debugEl.style.display === 'none' ? 'block' : 'none';
        }
        return;
      }
      if (/^(Meta|Alt|Control)/.test(e.code)) {
        this.keys.clear();
        return;
      }
      if (e.metaKey || e.altKey || e.ctrlKey) return;
      if (!e.repeat) {
        this.note('↓' + e.code);
        const opp = OPP[e.code];
        if (opp) this.keys.delete(opp);
      }
      if (!this.keys.has(e.code)) {
        this.pressed.add(e.code);
        this.mapCodeToBuffer(e.code);
      }
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow')) {
        e.preventDefault();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.note('↑' + e.code);
      this.keys.delete(e.code);
      if (/^(Meta|Alt|Control)/.test(e.code)) this.keys.clear();
    };

    const onClear = (label: string) => () => {
      this.note('[' + label + ']');
      this.keys.clear();
      this.rmbHeld = false;
      this.rmbClickQueued = false;
      this.touchBlockHeld = false;
      this.touchMove.x = 0;
      this.touchMove.z = 0;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (performance.now() - this.lastTouchTime < 500) return;
      this.mouseMoved = true;
      if (!(e.buttons & 2)) {
        this.keys.delete('RMB');
        this.rmbHeld = false;
      }
      if (!(e.buttons & 4)) {
        this.keys.delete('MMB');
      }
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        this.mouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouseNdc.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (performance.now() - this.lastTouchTime < 500) return;
      const target = e.target as HTMLElement | null;
      if (target && target !== this.canvas) return;
      this.mouseMoved = true;
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        this.mouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouseNdc.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      }
      if (e.button === 0) {
        this.pressed.add('LMB');
        this.bufferAction('attack');
        this.note('↓LMB');
      } else if (e.button === 2) {
        this.pressed.add('RMB');
        this.keys.add('RMB');
        if (this.lolMouseMode) {
          this.rmbHeld = true;
          this.rmbClickQueued = true;
        }
        this.note('↓RMB');
      } else if (e.button === 1) {
        e.preventDefault();
        this.pressed.add('MMB');
        this.keys.add('MMB');
        this.note('↓MMB');
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        this.keys.delete('RMB');
        this.rmbHeld = false;
        this.note('↑RMB');
      } else if (e.button === 1) {
        this.keys.delete('MMB');
        this.note('↑MMB');
      }
    };

    const onContext = (e: MouseEvent) => e.preventDefault();

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('contextmenu', onContext);

    const blurFn = onClear('blur');
    const focusFn = onClear('focus');
    const pageHideFn = onClear('pagehide');
    const visFn = () => {
      if (document.hidden) onClear('hidden')();
    };
    window.addEventListener('blur', blurFn);
    window.addEventListener('focus', focusFn);
    window.addEventListener('pagehide', pageHideFn);
    document.addEventListener('visibilitychange', visFn);

    this.cleanups.push(() => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('contextmenu', onContext);
      window.removeEventListener('blur', blurFn);
      window.removeEventListener('focus', focusFn);
      window.removeEventListener('pagehide', pageHideFn);
      document.removeEventListener('visibilitychange', visFn);
    });
  }

  private bindTouchControls(): void {
    const zone = document.getElementById('touch-stick-zone');
    const base = document.getElementById('touch-stick');
    const knob = document.getElementById('touch-knob');
    if (zone && base && knob) {
      const maxRadius = 46;
      const resetStick = () => {
        this.stickPointerId = null;
        this.touchMove.x = 0;
        this.touchMove.z = 0;
        knob.style.transform = 'translate(0px, 0px)';
        base.style.transform = 'translate(0px, 0px)';
        base.classList.remove('active');
      };

      const onDown = (e: PointerEvent) => {
        if (e.pointerType === 'touch') {
          this.lastTouchTime = performance.now();
          this.touchActive = true;
        }
        e.preventDefault();
        e.stopPropagation();
        if (this.stickPointerId !== null) return;
        this.stickPointerId = e.pointerId;
        try {
          zone.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        // Honor-of-Kings floating joystick: re-center ring smoothly toward touch origin inside zone
        const zRect = zone.getBoundingClientRect();
        const defX = zRect.left + zRect.width * 0.5;
        const defY = zRect.top + zRect.height * 0.5;
        const shiftX = Math.max(-42, Math.min(42, e.clientX - defX));
        const shiftY = Math.max(-36, Math.min(36, e.clientY - defY));
        base.style.transform = `translate(${shiftX.toFixed(1)}px, ${shiftY.toFixed(1)}px)`;
        this.stickOrigin.x = defX + shiftX;
        this.stickOrigin.y = defY + shiftY;
        base.classList.add('active');
        updateStick(e.clientX, e.clientY);
      };

      const updateStick = (cx: number, cy: number) => {
        const dx = cx - this.stickOrigin.x;
        const dy = cy - this.stickOrigin.y;
        const dist = Math.hypot(dx, dy);
        const clamped = Math.min(dist, maxRadius);
        const angle = Math.atan2(dy, dx);
        const ox = Math.cos(angle) * clamped;
        const oy = Math.sin(angle) * clamped;
        knob.style.transform = `translate(${ox.toFixed(1)}px, ${oy.toFixed(1)}px)`;
        this.touchMove.x = ox / maxRadius;
        this.touchMove.z = oy / maxRadius;
      };

      const onMove = (e: PointerEvent) => {
        if (e.pointerId !== this.stickPointerId) return;
        this.lastTouchTime = performance.now();
        updateStick(e.clientX, e.clientY);
      };

      const onUp = (e: PointerEvent) => {
        if (e.pointerId !== this.stickPointerId) return;
        resetStick();
      };

      zone.addEventListener('pointerdown', onDown);
      zone.addEventListener('pointermove', onMove);
      zone.addEventListener('pointerup', onUp);
      zone.addEventListener('pointercancel', onUp);
      this.cleanups.push(() => {
        zone.removeEventListener('pointerdown', onDown);
        zone.removeEventListener('pointermove', onMove);
        zone.removeEventListener('pointerup', onUp);
        zone.removeEventListener('pointercancel', onUp);
      });
    }

    const bindTap = (id: string, action: BufferedAction) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      const fn = (e: PointerEvent) => {
        if (e.pointerType === 'touch') {
          this.lastTouchTime = performance.now();
          this.touchActive = true;
        }
        e.preventDefault();
        e.stopPropagation();
        this.bufferAction(action);
        btn.classList.add('pressed');
        btn.classList.remove('cast-pulse');
        void btn.offsetWidth;
        btn.classList.add('cast-pulse');
        triggerHaptic(action === 'skillR' ? 'ultimate' : action === 'attack' ? 'light' : 'medium');
        window.setTimeout(() => btn.classList.remove('pressed'), 130);
      };
      btn.addEventListener('pointerdown', fn);
      this.cleanups.push(() => btn.removeEventListener('pointerdown', fn));
    };

    bindTap('btn-attack', 'attack');
    bindTap('btn-dodge', 'dodge');
    bindTap('btn-skill-q', 'skillQ');
    bindTap('btn-skill-e', 'skillE');
    bindTap('btn-skill-r', 'skillR');
    bindTap('btn-heal', 'heal');

    // Also allow clicking HUD skill slots directly
    bindTap('slot-q', 'skillQ');
    bindTap('slot-e', 'skillE');
    bindTap('slot-r', 'skillR');
    bindTap('slot-f', 'heal');

    // Keep touch timestamps synced when tapping the golden combo ultimate button
    const comboUltBtn = document.getElementById('btn-combo-ult');
    if (comboUltBtn) {
      const onComboDown = (e: PointerEvent) => {
        if (e.pointerType === 'touch') {
          this.lastTouchTime = performance.now();
          this.touchActive = true;
        }
        e.stopPropagation();
        triggerHaptic('ultimate');
      };
      comboUltBtn.addEventListener('pointerdown', onComboDown);
      this.cleanups.push(() => comboUltBtn.removeEventListener('pointerdown', onComboDown));
    }

    const blockBtn = document.getElementById('btn-block');
    if (blockBtn) {
      let blockPointerId: number | null = null;
      const onDown = (e: PointerEvent) => {
        if (e.pointerType === 'touch') {
          this.lastTouchTime = performance.now();
          this.touchActive = true;
        }
        e.preventDefault();
        e.stopPropagation();
        blockPointerId = e.pointerId;
        try {
          blockBtn.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        this.touchBlockHeld = true;
        this.pressed.add('TOUCH_BLOCK');
        blockBtn.classList.add('pressed');
      };
      const onRelease = (e: PointerEvent) => {
        if (blockPointerId !== null && e.pointerId !== blockPointerId) return;
        blockPointerId = null;
        this.touchBlockHeld = false;
        blockBtn.classList.remove('pressed');
      };
      blockBtn.addEventListener('pointerdown', onDown);
      blockBtn.addEventListener('pointerup', onRelease);
      blockBtn.addEventListener('pointercancel', onRelease);
      blockBtn.addEventListener('lostpointercapture', onRelease);
      this.cleanups.push(() => {
        blockBtn.removeEventListener('pointerdown', onDown);
        blockBtn.removeEventListener('pointerup', onRelease);
        blockBtn.removeEventListener('pointercancel', onRelease);
        blockBtn.removeEventListener('lostpointercapture', onRelease);
      });
    }
  }

  private createDebugPanel(): void {
    const el = document.createElement('div');
    el.id = 'f3-debug-panel';
    el.style.cssText =
      'position:fixed;left:10px;top:110px;z-index:120;font:11px/1.45 ui-monospace,Menlo,Consolas,monospace;' +
      'color:#b2f5dc;background:rgba(8,14,22,0.78);border:1px solid rgba(120,210,190,0.3);' +
      'padding:8px 10px;border-radius:6px;white-space:pre;display:none;pointer-events:none;backdrop-filter:blur(4px);';
    document.body.appendChild(el);
    this.debugEl = el;
  }

  dispose(): void {
    for (const fn of this.cleanups) fn();
    this.cleanups = [];
    this.debugEl?.remove();
    this.debugEl = null;
  }
}

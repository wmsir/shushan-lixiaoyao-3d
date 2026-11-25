/**
 * Chinese Xianxia Procedural Web Audio Engine:
 * - Layered foley SFX (sword whoosh, heavy impact, dual-layer metallic parry bell,
 *   dodge wind-step, flying sword zing, Myriad Swords chime cascade, Heavenly Sword thunder,
 *   gourd heal chime, rarity-pitched loot drops)
 * - Dynamic D-Pentatonic Guzheng + Xiao + War-Drum interactive soundtrack
 * - Automatic mute for automated testing, gesture unlock, and cutscene volume ducking
 */

export type MusicMood = 'title' | 'skirmish' | 'boss1' | 'boss2' | 'victory';

// D Major Pentatonic (宫商角徵羽): D4, E4, F#4, A4, B4, D5, E5, F#5, A5
const PENTATONIC = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25, 739.99, 880.0];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private muted = false;
  private duckFactor = 1.0;
  private mood: MusicMood = 'title';
  private musicStep = 0;
  private musicTimer = 0;

  constructor(startMuted = false) {
    this.muted = startMuted;
  }

  unlock(): void {
    if (this.muted) return;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.72;
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.88;
      this.sfxGain.connect(this.masterGain);

      // Per vfx-ui-audio.md: keep music ~1/3 of SFX volume so combat hits pop crisply
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.28;
      this.musicGain.connect(this.masterGain);

      // Pre-generate 1.5s white noise buffer for filtered slashes, wind, and impacts
      const len = Math.floor(this.ctx.sampleRate * 1.5);
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.72, this.ctx.currentTime, 0.04);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMood(mood: MusicMood): void {
    this.mood = mood;
  }

  setDucked(ducked: boolean): void {
    this.duckFactor = ducked ? 0.35 : 1.0;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(0.28 * this.duckFactor, this.ctx.currentTime, 0.12);
    }
  }

  /** Step interactive pentatonic music gently inside game loop (deterministic with game time). */
  updateMusic(dt: number): void {
    if (this.muted || !this.ctx || !this.musicGain || this.ctx.state !== 'running') return;
    const stepInterval =
      this.mood === 'boss2'
        ? 0.24
        : this.mood === 'boss1'
          ? 0.29
          : this.mood === 'skirmish'
            ? 0.34
            : 0.56;

    this.musicTimer += dt;
    if (this.musicTimer < stepInterval) return;
    this.musicTimer -= stepInterval;

    const s = this.musicStep++;
    const now = this.ctx.currentTime;

    // Guzheng pentatonic motif
    const melodyPattern =
      this.mood === 'boss2' || this.mood === 'boss1'
        ? [0, 3, 4, 5, 3, 2, 0, 4, 5, 7, 6, 5, 4, 3, 2, 0]
        : this.mood === 'skirmish'
          ? [0, 2, 3, 5, 4, 3, 2, 3, 5, 6, 5, 3, 2, 0, 2, 3]
          : [0, -1, 3, -1, 4, 5, -1, 3, 2, -1, 0, -1, 4, -1, 3, -1];
    const idx = melodyPattern[s % melodyPattern.length];
    if (idx >= 0) {
      const freq = PENTATONIC[idx] * (this.mood === 'title' ? 1 : 1);
      this.playGuzhengPluck(now, freq, this.mood === 'title' ? 0.16 : 0.22);
    }

    // Bass drone / War drum pulse in combat
    if ((this.mood === 'skirmish' || this.mood === 'boss1' || this.mood === 'boss2') && s % 2 === 0) {
      const accent = s % 4 === 0 ? 1.0 : 0.58;
      this.playWarDrum(now, (this.mood === 'boss2' ? 0.28 : 0.18) * accent, s % 4 === 0 ? 78 : 108);
    }

    // Subtle airy Xiao flute sustained note on phrase start
    if (s % 8 === 0) {
      const fluteNote = PENTATONIC[(s / 8) % 2 === 0 ? 5 : 3];
      this.playXiaoNote(now, fluteNote, stepInterval * 6.5, this.mood === 'title' ? 0.12 : 0.08);
    }
  }

  private playGuzhengPluck(now: number, freq: number, vol: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filt = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(freq * 2.003, now);

    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(freq * 5.2, now);
    filt.frequency.exponentialRampToValueAtTime(freq * 1.4, now + 0.65);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 1.15);

    const g2 = this.ctx.createGain();
    g2.gain.value = 0.28;
    osc.connect(filt);
    osc2.connect(g2);
    g2.connect(filt);
    filt.connect(gain);
    gain.connect(this.musicGain);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + 1.2);
    osc2.stop(now + 1.2);
  }

  private playXiaoNote(now: number, freq: number, dur: number, vol: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 0.992, now);
    osc.frequency.linearRampToValueAtTime(freq, now + 0.22);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.45);
    gain.gain.setValueAtTime(vol * 0.85, now + dur * 0.65);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + dur);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }

  private playWarDrum(now: number, vol: number, startHz: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startHz, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + 0.22);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(now);
    osc.stop(now + 0.28);
  }

  playSwordSwing(stage: number): void {
    if (this.muted || !this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    const baseHz = stage === 3 ? 620 : stage === 2 ? 980 : 1220;
    bp.frequency.setValueAtTime(baseHz * 1.4, now);
    bp.frequency.exponentialRampToValueAtTime(baseHz * 0.42, now + 0.16);
    bp.Q.value = 2.4;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(stage === 3 ? 0.34 : 0.24, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

    src.connect(bp);
    bp.connect(gain);
    gain.connect(this.sfxGain);
    src.start(now);
    src.stop(now + 0.21);
  }

  playHit(heavy = false): void {
    if (this.muted || !this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const jitter = 0.92 + Math.random() * 0.16;

    // Punchy sub-thump
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime((heavy ? 180 : 240) * jitter, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + (heavy ? 0.16 : 0.1));
    g.gain.setValueAtTime(heavy ? 0.55 : 0.38, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.18 : 0.12));
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.2);

    // Crisp transient cut
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = heavy ? 1200 : 1800;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(heavy ? 0.36 : 0.24, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    src.connect(hp);
    hp.connect(ng);
    ng.connect(this.sfxGain);
    src.start(now);
    src.stop(now + 0.1);
  }

  /** Crisp, loudest metallic dual-clang + golden harmonic ring for Perfect Parry! */
  playParry(): void {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const freqs = [1180, 1790, 2940, 4120];
    freqs.forEach((f, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = idx < 2 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.96, now + 0.42);
      const amp = idx === 0 ? 0.42 : idx === 1 ? 0.32 : 0.18;
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(amp, now + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 0.45);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.48);
    });
    this.playHit(true);
  }

  playBlock(): void {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(210, now + 0.11);
    g.gain.setValueAtTime(0.24, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  playDodge(perfect = false): void {
    if (this.muted || !this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(900, now);
    bp.frequency.exponentialRampToValueAtTime(2400, now + 0.15);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.24, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfxGain);
    src.start(now);
    src.stop(now + 0.19);

    if (perfect) {
      this.playChime(now, 880, 0.34, 0.35);
      this.playChime(now + 0.04, 1318.5, 0.28, 0.4);
    }
  }

  playSkillQ(): void {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(1620, now + 0.18);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    g.gain.setValueAtTime(0.24, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  playSkillE(): void {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    [587.33, 739.99, 880, 1174.66, 1479.98].forEach((f, i) => {
      this.playChime(now + i * 0.06, f, 0.22, 0.38);
    });
  }

  playSkillR(): void {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    // Celestial bronze bell + thunderous sub drop
    this.playChime(now, 440, 0.42, 1.1);
    this.playChime(now + 0.05, 880, 0.32, 0.9);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now + 0.25);
    osc.frequency.exponentialRampToValueAtTime(28, now + 1.05);
    g.gain.setValueAtTime(0.001, now + 0.24);
    g.gain.linearRampToValueAtTime(0.68, now + 0.28);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.15);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now + 0.24);
    osc.stop(now + 1.2);
  }

  playHeal(): void {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    this.playChime(now, 587.33, 0.26, 0.4);
    this.playChime(now + 0.09, 739.99, 0.24, 0.45);
    this.playChime(now + 0.18, 880, 0.26, 0.55);
  }

  playDropChime(rarity: 'heal' | 'spirit' | 'gourd'): void {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const base = rarity === 'gourd' ? 1174.66 : rarity === 'heal' ? 880 : 739.99;
    this.playChime(now, base, 0.24, rarity === 'gourd' ? 0.65 : 0.36);
    if (rarity === 'gourd') this.playChime(now + 0.08, base * 1.5, 0.2, 0.72);
  }

  private playChime(start: number, freq: number, vol: number, dur: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.001, start);
    g.gain.linearRampToValueAtTime(vol, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, start + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(start);
    osc.stop(start + dur + 0.04);
  }

  dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}

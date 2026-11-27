/**
 * Chinese Xianxia Procedural Web Audio Engine:
 * - Layered foley SFX (sword whoosh, heavy impact, dual-layer metallic parry bell,
 *   dodge wind-step, flying sword zing, Myriad Swords chime cascade, Heavenly Sword thunder,
 *   gourd heal chime, rarity-pitched loot drops)
 * - Dynamic D-Pentatonic Guzheng + Xiao + War-Drum interactive soundtrack
 * - Automatic mute for automated testing, gesture unlock, and cutscene volume ducking
 */

import type { EquipRarity } from '../game/EquipmentData';
import voiceQ1 from '../assets/voices/voice-q1.mp3';
import voiceQ2 from '../assets/voices/voice-q2.mp3';
import voiceE1 from '../assets/voices/voice-e1.mp3';
import voiceE2 from '../assets/voices/voice-e2.mp3';
import voiceR1 from '../assets/voices/voice-r1.mp3';
import voiceR2 from '../assets/voices/voice-r2.mp3';
import voiceCounter from '../assets/voices/voice-counter.mp3';
import voiceDodge from '../assets/voices/voice-dodge.mp3';
import voiceHeal from '../assets/voices/voice-heal.mp3';
import voiceVictory from '../assets/voices/voice-victory.mp3';
import voiceComboUrl from '../assets/voices/voice-combo.mp3';

export type MusicMood = 'title' | 'skirmish' | 'boss1' | 'boss2' | 'victory';
export type HeroVoiceKind = 'skillQ' | 'skillE' | 'skillR' | 'comboUlt' | 'counter' | 'dodge' | 'heal' | 'victory';

interface VoiceClipDef {
  url: string;
  line: string;
  priority: number;
  cooldownSec: number;
}

const VOICE_BANKS: Record<HeroVoiceKind, VoiceClipDef[]> = {
  skillQ: [
    { url: voiceQ1, line: '御剑乘风来——去！', priority: 2, cooldownSec: 1.8 },
    { url: voiceQ2, line: '剑出如星，谁敢接我一招！', priority: 2, cooldownSec: 1.8 },
  ],
  skillE: [
    { url: voiceE1, line: '御剑伏魔，万剑诀，落！', priority: 3, cooldownSec: 2.6 },
    { url: voiceE2, line: '剑气化星雨，万剑归宗！', priority: 3, cooldownSec: 2.6 },
  ],
  skillR: [
    { url: voiceR1, line: '仗剑红尘已是癫——天剑，降世！', priority: 4, cooldownSec: 3.5 },
    { url: voiceR2, line: '破晓斩长空，一剑镇乾坤——天剑！', priority: 4, cooldownSec: 3.5 },
  ],
  comboUlt: [{ url: voiceComboUrl, line: '剑诀合一，万剑归宗，斩！', priority: 5, cooldownSec: 2.2 }],
  counter: [{ url: voiceCounter, line: '破绽在此，接招！', priority: 2, cooldownSec: 1.6 }],
  dodge: [{ url: voiceDodge, line: '想打中我？差得远呢！', priority: 1, cooldownSec: 2.2 }],
  heal: [{ url: voiceHeal, line: '好酒！御剑江湖，岂能无酒！', priority: 2, cooldownSec: 2.2 }],
  victory: [{ url: voiceVictory, line: '区区妖邪，也敢挡我蜀山剑路！', priority: 4, cooldownSec: 3.0 }],
};

// D Major Pentatonic (宫商角徵羽): D4, E4, F#4, A4, B4, D5, E5, F#5, A5
const PENTATONIC = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25, 739.99, 880.0];
const MUTE_STORAGE_KEY = 'shushan_audio_muted_v1';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private readonly voiceBuffers = new Map<string, AudioBuffer>();
  private readonly voiceLoading = new Set<string>();
  private readonly voiceNextIdx: Record<HeroVoiceKind, number> = {
    skillQ: 0,
    skillE: 0,
    skillR: 0,
    comboUlt: 0,
    counter: 0,
    dodge: 0,
    heal: 0,
    victory: 0,
  };
  private activeVoiceSource: AudioBufferSourceNode | null = null;
  private activeVoiceAudio: HTMLAudioElement | null = null;
  private activeVoicePriority = 0;
  private activeVoiceUntil = 0;
  private lastVoiceKindAt: Partial<Record<HeroVoiceKind, number>> = {};

  private muted = false;
  private duckFactor = 1.0;
  private mood: MusicMood = 'title';
  private musicStep = 0;
  private musicTimer = 0;

  constructor(startMuted = false, private readonly persistMute = true) {
    if (startMuted) {
      this.muted = true;
    } else if (persistMute) {
      try {
        this.muted = window.localStorage.getItem(MUTE_STORAGE_KEY) === '1';
      } catch {
        this.muted = false;
      }
    }
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

      this.voiceGain = this.ctx.createGain();
      this.voiceGain.gain.value = 1.05;
      this.voiceGain.connect(this.masterGain);

      // Per vfx-ui-audio.md: keep music ~1/3 of SFX volume so combat hits pop crisply
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.28;
      this.musicGain.connect(this.masterGain);

      // Pre-generate 1.5s white noise buffer for filtered slashes, wind, and impacts
      const len = Math.floor(this.ctx.sampleRate * 1.5);
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.preloadVoices();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private preloadVoices(): void {
    if (!this.ctx) return;
    for (const defs of Object.values(VOICE_BANKS)) {
      for (const def of defs) {
        void this.ensureVoiceBuffer(def.url);
      }
    }
  }

  private async ensureVoiceBuffer(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    const cached = this.voiceBuffers.get(url);
    if (cached) return cached;
    if (this.voiceLoading.has(url)) return null;
    this.voiceLoading.add(url);
    try {
      const resp = await fetch(url);
      const arr = await resp.arrayBuffer();
      const decoded = await this.ctx.decodeAudioData(arr);
      this.voiceBuffers.set(url, decoded);
      return decoded;
    } catch {
      return null;
    } finally {
      this.voiceLoading.delete(url);
    }
  }

  playHeroVoice(kind: HeroVoiceKind): string {
    const bank = VOICE_BANKS[kind];
    if (!bank || bank.length === 0) return '';
    const idx = this.voiceNextIdx[kind] % bank.length;
    this.voiceNextIdx[kind] = idx + 1;
    const clip = bank[idx];

    if (this.muted) return clip.line;
    this.unlock();

    const nowMs = performance.now();
    const lastAt = this.lastVoiceKindAt[kind] ?? -99999;
    if (nowMs - lastAt < clip.cooldownSec * 1000) {
      return clip.line;
    }
    if (nowMs < this.activeVoiceUntil && clip.priority < this.activeVoicePriority) {
      return clip.line;
    }

    this.lastVoiceKindAt[kind] = nowMs;
    this.activeVoicePriority = clip.priority;
    this.stopActiveVoice();

    const buf = this.voiceBuffers.get(clip.url);
    if (buf && this.ctx && this.voiceGain) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.voiceGain);
      src.start();
      this.activeVoiceSource = src;
      this.activeVoiceUntil = nowMs + buf.duration * 1000;
      src.onended = () => {
        if (this.activeVoiceSource === src) this.activeVoiceSource = null;
      };
    } else if (!this.muted) {
      const el = new Audio(clip.url);
      el.muted = this.muted;
      el.volume = 0.92;
      this.activeVoiceAudio = el;
      this.activeVoiceUntil = nowMs + 2600;
      void el.play().catch(() => {});
      void this.ensureVoiceBuffer(clip.url);
    }

    if ((kind === 'skillR' || kind === 'comboUlt') && this.musicGain && this.ctx) {
      const t = this.ctx.currentTime;
      this.musicGain.gain.cancelScheduledValues(t);
      this.musicGain.gain.setTargetAtTime(0.08, t, 0.08);
      this.musicGain.gain.setTargetAtTime(0.28 * this.duckFactor, t + 2.1, 0.28);
    }

    return clip.line;
  }

  private stopActiveVoice(): void {
    if (this.activeVoiceSource) {
      try {
        this.activeVoiceSource.stop();
      } catch {
        // already stopped
      }
      this.activeVoiceSource = null;
    }
    if (this.activeVoiceAudio) {
      try {
        this.activeVoiceAudio.pause();
        this.activeVoiceAudio.currentTime = 0;
      } catch {
        // ignore
      }
      this.activeVoiceAudio = null;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.persistMute) {
      try {
        window.localStorage.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0');
      } catch {
        // ignore storage errors
      }
    }
    if (this.activeVoiceAudio) {
      this.activeVoiceAudio.muted = muted;
    }
    if (muted) this.stopActiveVoice();
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

  /** Soft pentatonic guzheng harmonic pluck for story dialogue choices & camp NPC chats */
  playDialogueStep(isChoice = false): void {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    if (isChoice) {
      this.playChime(now, 587.33, 0.16, 0.34);
      this.playChime(now + 0.055, 880, 0.14, 0.42);
    } else {
      this.playChime(now, 440, 0.15, 0.32);
      this.playChime(now + 0.07, 587.33, 0.14, 0.42);
    }
  }

  /** Resonant bronze temple bell + deep war-drum sting for Boss entrance cutscenes */
  playBossAppearSting(): void {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    this.playChime(now, 293.66, 0.36, 1.35);
    this.playChime(now + 0.06, 440, 0.26, 1.15);
    this.playChime(now + 0.14, 587.33, 0.22, 1.0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(118, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.85);
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.55, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.92);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.96);
  }

  playDropChime(rarity: 'heal' | 'spirit' | 'gourd'): void {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const base = rarity === 'gourd' ? 1174.66 : rarity === 'heal' ? 880 : 739.99;
    this.playChime(now, base, 0.24, rarity === 'gourd' ? 0.65 : 0.36);
    if (rarity === 'gourd') this.playChime(now + 0.08, base * 1.5, 0.2, 0.72);
  }

  playGearDropChime(rarity: EquipRarity): void {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    if (rarity === 'common') {
      this.playChime(now, 587.33, 0.22, 0.38);
      this.playChime(now + 0.08, 739.99, 0.2, 0.44);
    } else if (rarity === 'rare') {
      this.playChime(now, 587.33, 0.24, 0.42);
      this.playChime(now + 0.07, 739.99, 0.24, 0.48);
      this.playChime(now + 0.14, 880, 0.26, 0.58);
    } else if (rarity === 'epic') {
      this.playChime(now, 587.33, 0.25, 0.48);
      this.playChime(now + 0.06, 739.99, 0.26, 0.52);
      this.playChime(now + 0.12, 880, 0.28, 0.62);
      this.playChime(now + 0.19, 1174.66, 0.28, 0.78);
    } else {
      const notes = [587.33, 739.99, 880, 1174.66, 1479.98];
      notes.forEach((f, idx) => {
        this.playChime(now + idx * 0.06, f, idx >= 3 ? 0.32 : 0.26, 0.58 + idx * 0.1);
      });
    }
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

/**
 * All audio is synthesized with the Web Audio API (no files needed): soft, rounded sound effects
 * (juicy pops pitched along a pentatonic scale per cascade) plus a choice of background pieces
 * (see music.ts). A custom song (e.g. your own song together) can replace them — see PERSONAL.bgm.
 */

import { Instruments, Sequencer, type TrackId } from './music';
import { makeReverb, noiseBuffer, NOTE, voice, type Rig } from './rig';

export type MusicChoice = TrackId | 'custom';

const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093, 2349.32, 2637.02];
const MUSIC_LEVEL = 0.5;

interface ToneOpts {
  freq: number;
  type?: OscillatorType;
  dur?: number;
  vol?: number;
  attack?: number;
  when?: number;
  slideTo?: number;
  filter?: number;
  wet?: number;
}

export class Sfx {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxRig!: Rig;
  private musicGain!: GainNode;
  private noiseBuf!: AudioBuffer;
  private lastPop = 0;
  private lastLand = 0;
  sfxOn = true;
  private musicWanted = true;
  private choice: MusicChoice = 'kalimba';
  private instruments: Instruments | null = null;
  private seq: Sequencer | null = null;
  private file: HTMLAudioElement | null = null;
  private fileFailed = false;
  private ducked = false;

  constructor(private bgmUrl = '') {}

  /** Pick the background piece; switches immediately if music is playing. */
  setTrack(choice: MusicChoice): void {
    if (choice === this.choice) return;
    this.choice = choice;
    if (!this.ctx) return;
    this.stopMusic();
    if (this.musicWanted) this.startMusic();
  }

  get hasCustomSong(): boolean {
    return !!this.bgmUrl;
  }

  /** Must be called from a user gesture (browsers block audio until then). */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 3;
      comp.attack.value = 0.01;
      comp.release.value = 0.25;
      const air = ctx.createBiquadFilter();
      air.type = 'lowpass';
      air.frequency.value = 9000;
      comp.connect(air).connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(comp);
      const reverb = makeReverb(ctx, this.master);

      const sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.9;
      sfxBus.connect(this.master);
      this.sfxRig = { ctx, out: sfxBus, reverb };

      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = MUSIC_LEVEL;
      this.musicGain.connect(this.master);
      this.noiseBuf = noiseBuffer(ctx);
      this.instruments = new Instruments({ ctx, out: this.musicGain, reverb }, this.noiseBuf);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.musicWanted) this.startMusic();
  }

  private startMusic(): void {
    if (this.choice === 'custom' && this.bgmUrl && !this.fileFailed) {
      if (!this.file) {
        this.file = new Audio(this.bgmUrl);
        this.file.loop = true;
        this.file.volume = this.ducked ? 0 : 0.45;
        this.file.addEventListener('error', () => {
          this.fileFailed = true;
          this.file = null;
          if (this.musicWanted) this.startMusic();
        });
      }
      if (this.file.paused) void this.file.play().catch(() => {});
      return;
    }
    if (!this.instruments) return;
    if (!this.seq) {
      const id: TrackId = this.choice === 'custom' ? 'kalimba' : this.choice;
      this.seq = new Sequencer(this.instruments, id);
    }
    this.seq.start();
  }

  private stopMusic(): void {
    this.seq?.stop();
    this.seq = null;
    this.file?.pause();
  }

  setMusic(on: boolean): void {
    this.musicWanted = on;
    if (!this.ctx) return;
    if (on) this.startMusic();
    else this.stopMusic();
  }

  /** Temporarily silence music (e.g. while the microphone is listening). */
  duck(on: boolean): void {
    this.ducked = on;
    if (this.ctx) this.musicGain.gain.setTargetAtTime(on ? 0 : MUSIC_LEVEL, this.ctx.currentTime, 0.2);
    if (this.file) this.file.volume = on ? 0 : 0.45;
  }

  get isDucked(): boolean {
    return this.ducked;
  }

  private get now(): number {
    return this.ctx!.currentTime;
  }

  private ok(): boolean {
    return !!this.ctx && this.sfxOn && this.ctx.state === 'running';
  }

  private tone(o: ToneOpts): void {
    const ctx = this.ctx!;
    const t = o.when ?? this.now;
    const dur = o.dur ?? 0.2;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slideTo), t + dur * 0.6);
    const g = ctx.createGain();
    const atk = o.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol ?? 0.1, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.filter;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    voice(this.sfxRig, g, o.wet ?? 0.12);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, type: BiquadFilterType, freq: number, sweepTo?: number, q = 1, when?: number): void {
    const ctx = this.ctx!;
    const t = when ?? this.now;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.03, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g);
    voice(this.sfxRig, g, 0.1);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  /** Soft glassy bell. */
  private bell(freq: number, vol = 0.06, when?: number, dur = 0.6, wet = 0.25): void {
    this.tone({ freq, vol, dur, when, wet });
    this.tone({ freq: freq * 2.0, vol: vol * 0.18, dur: dur * 0.5, when, wet });
    this.tone({ freq: freq * 3.01, vol: vol * 0.05, dur: dur * 0.25, when, wet });
  }

  pop(cascade: number): void {
    if (!this.ok()) return;
    const n = performance.now();
    if (n - this.lastPop < 40) return;
    this.lastPop = n;
    // juicy "bloop" + a note that climbs with the cascade
    this.tone({ freq: 360 + Math.random() * 60, slideTo: 980, vol: 0.06, dur: 0.09, wet: 0.05 });
    const idx = Math.min(PENTA.length - 1, cascade * 2 + Math.floor(Math.random() * 2));
    this.bell(PENTA[idx], 0.045, this.now + 0.01, 0.4);
  }

  swap(): void {
    if (!this.ok()) return;
    this.noise(0.16, 0.05, 'bandpass', 900, 2600, 1.2);
  }

  invalid(): void {
    if (!this.ok()) return;
    this.tone({ freq: 330, vol: 0.06, dur: 0.1, filter: 1200 });
    this.tone({ freq: 262, vol: 0.06, dur: 0.14, when: this.now + 0.09, filter: 1200 });
  }

  create(kind: string): void {
    if (!this.ok()) return;
    const base = kind === 'rainbow' ? 784 : kind === 'bomb' ? 587.33 : kind === 'cupid' ? 698.46 : 659.25;
    const steps = kind === 'rainbow' ? [0, 4, 7, 11, 14, 19] : [0, 4, 7, 11];
    steps.forEach((s, i) => this.bell(base * Math.pow(2, s / 12), 0.045, this.now + i * 0.05, 0.7, 0.35));
  }

  line(): void {
    if (!this.ok()) return;
    this.noise(0.32, 0.045, 'bandpass', 1800, 7500, 2);
    [0, 4, 7, 12].forEach((s, i) => this.bell(1046.5 * Math.pow(2, s / 12), 0.03, this.now + i * 0.03, 0.4));
  }

  bomb(big = false): void {
    if (!this.ok()) return;
    this.tone({ freq: big ? 110 : 140, slideTo: 44, vol: big ? 0.32 : 0.24, dur: big ? 0.55 : 0.4, wet: 0.2 });
    this.noise(big ? 0.45 : 0.3, 0.06, 'lowpass', 800, 150);
  }

  rainbow(): void {
    if (!this.ok()) return;
    for (let i = 0; i < 12; i++) this.bell(PENTA[i], 0.035, this.now + i * 0.032, 0.8, 0.4);
  }

  cupid(): void {
    if (!this.ok()) return;
    this.noise(0.35, 0.04, 'bandpass', 700, 3200, 2);
    [1046.5, 1318.5, 1568].forEach((f, i) => this.bell(f, 0.035, this.now + 0.06 + i * 0.07));
  }

  jelly(): void {
    if (!this.ok()) return;
    this.tone({ freq: 880, slideTo: 520, vol: 0.04, dur: 0.1 });
  }

  box(broken: boolean): void {
    if (!this.ok()) return;
    this.noise(0.05, 0.08, 'bandpass', 1100, undefined, 4);
    this.tone({ freq: 210, slideTo: 120, vol: 0.08, dur: 0.1 });
    if (broken) [880, 1108.7, 1318.5].forEach((f, i) => this.bell(f, 0.04, this.now + 0.05 + i * 0.06));
  }

  choco(): void {
    if (!this.ok()) return;
    for (let i = 0; i < 3; i++) this.noise(0.035, 0.05, 'bandpass', 3000, undefined, 1.5, this.now + i * 0.03);
  }

  lock(): void {
    if (!this.ok()) return;
    this.noise(0.05, 0.05, 'highpass', 4000);
    this.tone({ freq: 1200, vol: 0.03, dur: 0.1 });
  }

  collect(): void {
    if (!this.ok()) return;
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => this.bell(f, 0.05, this.now + i * 0.08, 0.9, 0.35));
  }

  land(): void {
    if (!this.ok()) return;
    const n = performance.now();
    if (n - this.lastLand < 90) return;
    this.lastLand = n;
    this.tone({ freq: 120, slideTo: 80, vol: 0.025, dur: 0.07, wet: 0 });
  }

  spread(): void {
    if (!this.ok()) return;
    this.tone({ freq: 220, slideTo: 120, vol: 0.06, dur: 0.32, filter: 700 });
  }

  shuffle(): void {
    if (!this.ok()) return;
    this.noise(0.55, 0.05, 'bandpass', 500, 3200, 1);
  }

  combo(level: number): void {
    if (!this.ok()) return;
    const root = 523.25 * Math.pow(2, Math.min(level, 8) / 12);
    [0, 4, 7, 11, 14].forEach((s) => this.bell(root * Math.pow(2, s / 12), 0.022, this.now, 0.9, 0.45));
  }

  star(i: number): void {
    if (!this.ok()) return;
    this.bell([880, 1108.73, 1318.51][i] ?? 1568, 0.08, undefined, 1.1, 0.45);
    this.noise(0.4, 0.02, 'highpass', 7000);
  }

  win(): void {
    if (!this.ok()) return;
    [72, 76, 79, 83, 84, 88].forEach((m, i) => this.bell(NOTE(m), 0.06, this.now + i * 0.11, 1.2, 0.45));
    [60, 64, 67, 71].forEach((m) => this.tone({ freq: NOTE(m), vol: 0.025, dur: 1.8, attack: 0.25, wet: 0.5 }));
  }

  lose(): void {
    if (!this.ok()) return;
    [67, 64, 62, 60].forEach((m, i) =>
      this.tone({ freq: NOTE(m), type: 'triangle', vol: 0.05, dur: 0.6, attack: 0.03, when: this.now + i * 0.24, filter: 1500, wet: 0.4 }),
    );
  }

  heartRefill(): void {
    if (!this.ok()) return;
    [60, 64, 67, 71, 74].forEach((m, i) => {
      this.tone({ freq: NOTE(m), vol: 0.035, dur: 2, attack: 0.35, when: this.now + i * 0.03, wet: 0.5 });
      this.bell(NOTE(m + 12), 0.04, this.now + 0.3 + i * 0.1, 1.2, 0.5);
    });
  }

  tick(): void {
    if (!this.ok()) return;
    this.tone({ freq: 1000, vol: 0.03, dur: 0.035, wet: 0 });
  }

  click(): void {
    if (!this.ok()) return;
    this.tone({ freq: 1400, vol: 0.025, dur: 0.05, wet: 0.05 });
  }
}

export function vibrate(pattern: number | number[], enabled: boolean): void {
  if (!enabled) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

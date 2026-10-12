import { makeReverb, noiseBuffer, NOTE, voice, type Rig } from './rig';

/**
 * Background music, composed and synthesized in code. Three pieces to choose from:
 *  - "Kalimba Garden": playful kalimba (modal synthesis) in C major, 100 BPM.
 *  - "Harp Waltz": plucked harp (Karplus–Strong strings), flute and strings in F major, 3/4.
 *  - "Lo-fi Serenade": Rhodes-style electric piano, ocarina, bass and brushes, 74 BPM.
 */

export type TrackId = 'kalimba' | 'harp' | 'lofi';

/** Display names; the short mood line is translated in the locale (`L.tracks`). */
export const TRACKS: { id: TrackId; name: string }[] = [
  { id: 'kalimba', name: 'Kalimba Garden' },
  { id: 'harp', name: 'Harp Waltz' },
  { id: 'lofi', name: 'Lo-fi Serenade' },
];
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ───────────────────────────── instruments ─────────────────────────────

export class Instruments {
  private ks = new Map<number, AudioBuffer>();

  constructor(
    readonly rig: Rig,
    private noise: AudioBuffer,
  ) {}

  get ctx(): BaseAudioContext {
    return this.rig.ctx;
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decayTo: number, decay: number, end: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, decayTo), t + attack + decay);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
  }

  private pan(node: AudioNode, value: number): AudioNode {
    if (!this.ctx.createStereoPanner) return node;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-0.7, Math.min(0.7, value));
    node.connect(p);
    return p;
  }

  /** Kalimba: a sine "tine" with a quick inharmonic ping and a soft thumb click. */
  kalimba(midi: number, t: number, vel: number, pan = 0): void {
    const f = NOTE(midi);
    const bus = this.ctx.createGain();
    const decay = 1.6 - Math.min(0.8, (midi - 60) * 0.02);
    for (const [mult, amp, dec] of [
      [1, 1, decay],
      [2.0, 0.05, decay * 0.4],
      [5.95, 0.14, 0.09],
    ] as const) {
      const o = this.ctx.createOscillator();
      o.frequency.value = f * mult;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12 * vel * amp, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + dec + 0.05);
    }
    this.noiseHit(t, 'bandpass', 2400, 1, 0.012 * vel, 0.015, 0, bus);
    voice(this.rig, this.pan(bus, pan), 0.33);
  }

  /** Karplus–Strong plucked string, rendered once per note and cached. */
  private ksBuffer(midi: number): AudioBuffer {
    const hit = this.ks.get(midi);
    if (hit) return hit;
    const rate = this.ctx.sampleRate;
    const f = NOTE(midi);
    const N = Math.max(2, Math.round(rate / f));
    const len = Math.floor(rate * 2.6);
    const buf = this.ctx.createBuffer(1, len, rate);
    const out = buf.getChannelData(0);
    const ring = new Float32Array(N);
    let prev = 0;
    for (let i = 0; i < N; i++) {
      prev += (Math.random() * 2 - 1 - prev) * 0.5; // softened pluck = warmer tone
      ring[i] = prev;
    }
    let idx = 0;
    let peak = 0;
    for (let i = 0; i < len; i++) {
      const nxt = idx + 1 === N ? 0 : idx + 1;
      const v = ring[idx];
      out[i] = v;
      if (Math.abs(v) > peak) peak = Math.abs(v);
      ring[idx] = (v + ring[nxt]) * 0.4986;
      idx = nxt;
    }
    const fade = Math.floor(rate * 0.4);
    for (let i = 0; i < len; i++) {
      out[i] /= peak || 1;
      if (i > len - fade) out[i] *= (len - i) / fade;
    }
    this.ks.set(midi, buf);
    return buf;
  }

  harp(midi: number, t: number, vel: number, pan = 0): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.ksBuffer(midi);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3800;
    const g = this.ctx.createGain();
    g.gain.value = 0.32 * vel;
    src.connect(lp).connect(g);
    voice(this.rig, this.pan(g, pan), 0.38);
    src.start(t);
  }

  /** Soft flute: sine with a little breath noise and delayed vibrato. */
  flute(midi: number, t: number, dur: number, vel: number): void {
    const f = NOTE(midi);
    const end = t + dur + 0.35;
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.085 * vel, t + 0.09);
    amp.gain.setTargetAtTime(0.065 * vel, t + 0.09, 0.4);
    amp.gain.setTargetAtTime(0.0001, t + dur, 0.12);
    const o = this.ctx.createOscillator();
    o.frequency.value = f;
    const o2 = this.ctx.createOscillator();
    o2.frequency.value = f * 2;
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.12;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 4.8;
    const depth = this.ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(f * 0.0045, t + Math.min(0.6, dur));
    lfo.connect(depth);
    depth.connect(o.frequency);
    depth.connect(o2.frequency);
    o.connect(amp);
    o2.connect(g2).connect(amp);
    // breath
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 2;
    bp.Q.value = 2;
    const bg = this.ctx.createGain();
    bg.gain.value = 0.18;
    src.connect(bp).connect(bg).connect(amp);
    voice(this.rig, this.pan(amp, 0.05), 0.5);
    for (const n of [o, o2, lfo]) {
      n.start(t);
      n.stop(end + 0.2);
    }
    src.start(t, Math.random() * 0.5);
    src.stop(end + 0.2);
  }

  /** Warm string / pad chord with slow attack. */
  strings(voicing: number[], t: number, dur: number, level = 0.009, cutoff = 1400): void {
    const end = t + dur + 1.1;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    lp.Q.value = 0.3;
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(level, t + 0.9);
    amp.gain.setValueAtTime(level, t + dur);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    lp.connect(amp);
    voice(this.rig, amp, 0.6);
    for (const m of voicing) {
      for (const cents of [-8, 8]) {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = NOTE(m);
        o.detune.value = cents;
        o.connect(lp);
        o.start(t);
        o.stop(end + 0.05);
      }
    }
  }

  /** Rhodes-like electric piano (1:1 FM with decaying index). */
  ep(midi: number, t: number, dur: number, vel: number): void {
    const f = NOTE(midi);
    const car = this.ctx.createOscillator();
    car.frequency.value = f;
    const mod = this.ctx.createOscillator();
    mod.frequency.value = f;
    const idx = this.ctx.createGain();
    idx.gain.setValueAtTime(f * 1.2 * vel, t);
    idx.gain.exponentialRampToValueAtTime(f * 0.1, t + 0.4);
    mod.connect(idx).connect(car.frequency);
    const amp = this.ctx.createGain();
    const end = t + dur + 0.9;
    this.env(amp, t, 0.058 * vel, 0.006, 0.024 * vel, 0.45, end);
    car.connect(amp);
    voice(this.rig, this.pan(amp, (midi - 62) / 20), 0.32);
    car.start(t);
    mod.start(t);
    car.stop(end + 0.05);
    mod.stop(end + 0.05);
  }

  bass(midi: number, t: number, dur: number, level = 0.15): void {
    const f = NOTE(midi);
    const o = this.ctx.createOscillator();
    o.frequency.value = f;
    const sub = this.ctx.createOscillator();
    sub.type = 'triangle';
    sub.frequency.value = f;
    const sg = this.ctx.createGain();
    sg.gain.value = 0.3;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 450;
    const amp = this.ctx.createGain();
    const end = t + dur + 0.15;
    this.env(amp, t, level, 0.02, level * 0.6, dur * 0.7, end);
    o.connect(lp);
    sub.connect(sg).connect(lp);
    lp.connect(amp);
    voice(this.rig, amp, 0.05);
    o.start(t);
    sub.start(t);
    o.stop(end + 0.05);
    sub.stop(end + 0.05);
  }

  celesta(midi: number, t: number, vel: number): void {
    const f = NOTE(midi);
    for (const [mult, v, d] of [
      [1, 1, 1.4],
      [4.0, 0.12, 0.3],
    ] as const) {
      const o = this.ctx.createOscillator();
      o.frequency.value = f * mult;
      const g = this.ctx.createGain();
      this.env(g, t, 0.03 * vel * v, 0.004, 0.01 * vel * v, d * 0.4, t + d);
      o.connect(g);
      voice(this.rig, this.pan(g, rand(-0.4, 0.4)), 0.55);
      o.start(t);
      o.stop(t + d + 0.05);
    }
  }

  noiseHit(t: number, type: BiquadFilterType, freq: number, q: number, vol: number, decay: number, wet: number, dest?: AudioNode): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f).connect(g);
    if (dest) g.connect(dest);
    else voice(this.rig, g, wet);
    src.start(t, Math.random() * 0.8);
    src.stop(t + decay + 0.05);
  }

  kick(t: number, vel: number): void {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(105, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
    const g = this.ctx.createGain();
    this.env(g, t, 0.13 * vel, 0.004, 0.04 * vel, 0.1, t + 0.28);
    o.connect(g);
    voice(this.rig, g, 0);
    o.start(t);
    o.stop(t + 0.3);
  }

  brush(t: number, vol = 0.026): void {
    this.noiseHit(t, 'bandpass', 2600, 0.6, vol, 0.16, 0.25);
  }

  shaker(t: number, accent: boolean): void {
    this.noiseHit(t, 'highpass', 7500, 0.7, accent ? 0.012 : 0.007, 0.05, 0.1);
  }

  rim(t: number): void {
    this.noiseHit(t, 'bandpass', 4200, 4, 0.02, 0.04, 0.2);
  }
}

// ───────────────────────────── sequencing ─────────────────────────────

type Notes = [number, number, number][]; // [eighth offset, midi, length in eighths]

interface TrackDef {
  bpm: number;
  /** Eighth notes per bar (8 = 4/4, 6 = 3/4). */
  steps: number;
  swing: number;
  intro: number;
  play(ins: Instruments, t: number, bar: number, step: number, eighth: number): void;
}

/** 32-bar form: A, B, instrumental bridge, A. */
function section(bar: number): number {
  return bar < 0 ? -1 : Math.floor((bar % 32) / 8);
}

function melodyFor(bar: number, a: Notes[], b: Notes[]): Notes | null {
  const s = section(bar);
  const i = ((bar % 8) + 8) % 8;
  return s === 0 || s === 3 ? a[i] : s === 1 ? b[i] : null;
}

// Kalimba Garden — C major
const K_CHORDS = [
  { tones: [60, 64, 67, 74], root: 48 }, // Cadd9
  { tones: [64, 67, 71, 74], root: 40 }, // Em7
  { tones: [65, 69, 72, 76], root: 41 }, // Fmaj7
  { tones: [67, 71, 74, 76], root: 43 }, // G6
  { tones: [69, 72, 76, 79], root: 45 }, // Am7
  { tones: [64, 67, 71, 74], root: 40 }, // Em7
  { tones: [65, 69, 72, 76], root: 41 }, // Fmaj7
  { tones: [67, 72, 74, 79], root: 43 }, // Gsus4
];
const K_A: Notes[] = [
  [[0, 76, 3], [3, 79, 1], [4, 84, 4]],
  [[0, 83, 2], [2, 79, 2], [4, 76, 4]],
  [[0, 77, 2], [2, 81, 2], [4, 84, 2], [6, 81, 2]],
  [[0, 79, 6], [6, 74, 2]],
  [[0, 76, 2], [2, 79, 2], [4, 81, 3], [7, 79, 1]],
  [[0, 76, 4], [4, 74, 2], [6, 71, 2]],
  [[0, 72, 2], [2, 74, 2], [4, 76, 2], [6, 77, 2]],
  [[0, 79, 4], [4, 74, 2], [6, 72, 2]],
];
const K_B: Notes[] = [
  [[0, 72, 2], [2, 76, 2], [4, 79, 2], [6, 84, 2]],
  [[0, 83, 3], [3, 81, 1], [4, 79, 4]],
  [[0, 81, 2], [2, 77, 2], [4, 72, 4]],
  [[0, 74, 2], [2, 76, 2], [4, 79, 4]],
  [[0, 81, 3], [3, 79, 1], [4, 76, 2], [6, 72, 2]],
  [[0, 71, 2], [2, 74, 2], [4, 79, 4]],
  [[0, 77, 2], [2, 76, 2], [4, 74, 2], [6, 72, 2]],
  [[0, 74, 6], [6, 79, 2]],
];
const K_ARP = [0, 2, 1, 3, 0, 2, 1, 3];

const KALIMBA: TrackDef = {
  bpm: 100,
  steps: 8,
  swing: 0.1,
  intro: 2,
  play(ins, t, n, s, e) {
    const ch = K_CHORDS[((n % 8) + 8) % 8];
    const human = rand(-0.006, 0.006);
    ins.kalimba(ch.tones[K_ARP[s]] - 12, t + human, (s % 4 === 0 ? 1 : 0.7) * rand(0.9, 1.05), s % 2 ? 0.3 : -0.3);
    if (s === 0) ins.strings(ch.tones, t, e * 8, 0.004, 1100);
    if (n >= 0 && (s === 0 || s === 4)) ins.bass(ch.root, t, e * 3, 0.11);
    if (n >= 4) {
      if (s % 2 === 1) ins.shaker(t, s === 3 || s === 7);
      if (n >= 8 && (s === 2 || s === 6)) ins.rim(t);
      if (n >= 8 && s === 0) ins.kick(t, 0.5);
    }
    const mel = melodyFor(n, K_A, K_B);
    if (mel) {
      for (const [at, midi] of mel) if (at === s) ins.kalimba(midi, t + human, rand(0.9, 1), 0);
    } else if (section(n) === 2 && (s === 0 || s === 4)) {
      ins.celesta(ch.tones[(s / 4 + n) % 4] + 24, t, 0.6);
    }
  },
};

// Harp Waltz — F major, 3/4 (six eighths per bar)
const H_CHORDS = [
  { bass: 41, tones: [53, 57, 60, 64] }, // Fmaj7
  { bass: 38, tones: [50, 53, 57, 60] }, // Dm7
  { bass: 43, tones: [55, 58, 62, 65] }, // Gm7
  { bass: 36, tones: [52, 55, 58, 60] }, // C7
  { bass: 45, tones: [52, 57, 60, 64] }, // Am7
  { bass: 38, tones: [50, 53, 57, 60] }, // Dm7
  { bass: 46, tones: [53, 57, 58, 62] }, // Bbmaj7
  { bass: 36, tones: [52, 55, 58, 60] }, // C7
];
const H_A: Notes[] = [
  [[0, 81, 4], [4, 79, 2]],
  [[0, 77, 4], [4, 81, 2]],
  [[0, 82, 3], [3, 81, 1], [4, 79, 2]],
  [[0, 76, 6]],
  [[0, 84, 4], [4, 81, 2]],
  [[0, 86, 3], [3, 84, 1], [4, 81, 2]],
  [[0, 77, 4], [4, 74, 2]],
  [[0, 76, 4], [4, 79, 2]],
];
const H_B: Notes[] = [
  [[0, 72, 2], [2, 77, 2], [4, 81, 2]],
  [[0, 81, 3], [3, 79, 1], [4, 77, 2]],
  [[0, 74, 2], [2, 77, 2], [4, 82, 2]],
  [[0, 79, 6]],
  [[0, 76, 2], [2, 79, 2], [4, 84, 2]],
  [[0, 81, 4], [4, 77, 2]],
  [[0, 74, 2], [2, 77, 2], [4, 81, 2]],
  [[0, 79, 4], [4, 76, 2]],
];
const H_ARP = [-1, 0, 1, 2, 3, 2];

const HARP: TrackDef = {
  bpm: 84,
  steps: 6,
  swing: 0,
  intro: 2,
  play(ins, t, n, s, e) {
    const ch = H_CHORDS[((n % 8) + 8) % 8];
    const human = rand(-0.008, 0.008);
    if (s === 0) {
      ins.harp(ch.bass, t, 0.9, -0.2);
      ins.strings(ch.tones.map((m) => m + 12), t, e * 6, n < 0 ? 0.008 : 0.012, 1500);
    } else {
      ins.harp(ch.tones[H_ARP[s]] + 12, t + human, rand(0.5, 0.7), (s - 3) * 0.12);
    }
    const mel = melodyFor(n, H_A, H_B);
    if (mel) {
      for (const [at, midi, len] of mel) if (at === s) ins.flute(midi, t + human, len * e, rand(0.85, 1));
    } else if (section(n) === 2 && (s === 1 || s === 4)) {
      ins.harp(ch.tones[(s + n) % 4] + 24, t, 0.55, 0.3);
    }
  },
};

// Lo-fi Serenade — F major, 74 BPM
const L_PROG = [
  { voicing: [58, 62, 65, 69], root: 46 },
  { voicing: [57, 60, 64, 67], root: 45 },
  { voicing: [55, 58, 62, 65], root: 43 },
  { voicing: [55, 58, 60, 64], root: 48 },
  { voicing: [53, 57, 60, 64], root: 41 },
  { voicing: [57, 60, 62, 65], root: 50 },
  { voicing: [55, 58, 62, 65], root: 43 },
  { voicing: [55, 58, 60, 64], root: 48 },
];
const L_A: Notes[] = [
  [[0, 81, 2], [2, 79, 1], [3, 77, 3], [6, 74, 2]],
  [[0, 76, 3], [3, 72, 1], [4, 76, 2], [6, 79, 2]],
  [[0, 77, 2], [2, 74, 2], [4, 70, 2], [6, 74, 2]],
  [[0, 76, 4], [6, 72, 1], [7, 74, 1]],
  [[0, 76, 2], [2, 77, 1], [3, 81, 3], [6, 79, 2]],
  [[0, 77, 3], [3, 76, 1], [4, 74, 2], [6, 72, 2]],
  [[0, 74, 2], [2, 77, 2], [4, 81, 2], [6, 79, 2]],
  [[0, 76, 6]],
];
const L_B: Notes[] = [
  [[0, 74, 2], [2, 77, 2], [4, 81, 3], [7, 79, 1]],
  [[0, 79, 2], [2, 76, 2], [4, 72, 4]],
  [[0, 70, 1], [1, 74, 1], [2, 77, 2], [4, 81, 2], [6, 77, 2]],
  [[0, 79, 3], [3, 76, 1], [4, 74, 2], [6, 72, 2]],
  [[0, 69, 2], [2, 72, 2], [4, 76, 2], [6, 77, 2]],
  [[0, 81, 3], [3, 79, 1], [4, 77, 2], [6, 76, 2]],
  [[0, 74, 2], [2, 77, 1], [3, 76, 1], [4, 74, 2], [6, 70, 2]],
  [[0, 72, 4], [4, 76, 2], [6, 79, 2]],
];
const L_COMP: [number, number, number][][] = [
  [
    [0, 3, 1],
    [3, 1, 0.6],
    [6, 2, 0.8],
  ],
  [
    [0, 2, 1],
    [2, 2, 0.55],
    [5, 3, 0.75],
  ],
];

const LOFI: TrackDef = {
  bpm: 74,
  steps: 8,
  swing: 0.16,
  intro: 2,
  play(ins, t, n, s, e) {
    const idx = ((n % 8) + 8) % 8;
    const chord = L_PROG[idx];
    const nextRoot = L_PROG[(idx + 1) % 8].root;
    const human = rand(-0.006, 0.006);
    if (s === 0) ins.strings(chord.voicing.map((m) => m + 12), t, e * 8, 0.006, 1000);
    for (const [at, len, vel] of L_COMP[((n % 2) + 2) % 2]) {
      if (at === s) for (const m of chord.voicing) ins.ep(m, t + human, len * e, vel * rand(0.85, 1.05));
    }
    if (n >= 0) {
      if (s === 0) ins.bass(chord.root, t, e * 3.5);
      if (s === 4) ins.bass(chord.root + 7, t, e * 2);
      if (s === 7) ins.bass(nextRoot - 1, t, e);
    }
    if (n >= 4) {
      if (s === 0 || s === 5) ins.kick(t, s === 0 ? 1 : 0.6);
      if (s === 2 || s === 6) ins.brush(t);
      ins.shaker(t, s % 2 === 1);
    }
    const mel = melodyFor(n, L_A, L_B);
    if (mel) {
      for (const [at, midi, len] of mel) if (at === s) ins.flute(midi, t + human, len * e, rand(0.85, 1));
    } else if (section(n) === 2 && (s === 0 || s === 3 || s === 6)) {
      ins.celesta(chord.voicing[(s / 3 + n) % 4] + 24, t, 0.7);
    }
  },
};

const DEFS: Record<TrackId, TrackDef> = { kalimba: KALIMBA, harp: HARP, lofi: LOFI };

/** Look-ahead scheduler that walks a track one eighth note at a time. */
export class Sequencer {
  private timer: number | null = null;
  private next = 0;
  private bar: number;
  private step = 0;
  private readonly def: TrackDef;
  private readonly eighth: number;

  constructor(
    private ins: Instruments,
    id: TrackId,
  ) {
    this.def = DEFS[id];
    this.eighth = 60 / this.def.bpm / 2;
    this.bar = -this.def.intro;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer !== null) return;
    this.next = this.ins.ctx.currentTime + 0.15;
    this.timer = window.setInterval(() => {
      while (this.next < this.ins.ctx.currentTime + 0.3) this.scheduleOne();
    }, 50);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  /** Schedule everything up to `until` seconds (offline previews). */
  renderUntil(until: number): void {
    this.next = 0.05;
    while (this.next < until) this.scheduleOne();
  }

  private scheduleOne(): void {
    const swing = this.step % 2 ? this.eighth * this.def.swing : 0;
    this.def.play(this.ins, this.next + swing, this.bar, this.step, this.eighth);
    this.next += this.eighth;
    if (++this.step === this.def.steps) {
      this.step = 0;
      this.bar++;
    }
  }
}

/** Dev helper: render a track offline and report its levels (peak / RMS, 0..1). */
export async function renderTrack(id: TrackId, seconds = 30, level = 0.5): Promise<{ peak: number; rms: number; buffer: AudioBuffer }> {
  const rate = 44100;
  const ctx = new OfflineAudioContext(2, rate * seconds, rate);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  comp.connect(ctx.destination);
  const music = ctx.createGain();
  music.gain.value = level;
  music.connect(comp);
  const ins = new Instruments({ ctx, out: music, reverb: makeReverb(ctx, comp) }, noiseBuffer(ctx));
  new Sequencer(ins, id).renderUntil(seconds - 1);
  const buffer = await ctx.startRendering();
  let peak = 0;
  let sum = 0;
  for (let ch = 0; ch < 2; ch++) {
    const x = buffer.getChannelData(ch);
    for (let i = 0; i < x.length; i++) {
      const v = Math.abs(x[i]);
      if (v > peak) peak = v;
      sum += v * v;
    }
  }
  return { peak, rms: Math.sqrt(sum / (buffer.length * 2)), buffer };
}

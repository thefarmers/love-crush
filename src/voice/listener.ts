import { SPEAK_THRESHOLD, type VoiceAttempt } from './love';

/* Minimal typings for the (still prefixed on Safari) Web Speech API. */
interface SRAlternative {
  transcript: string;
}
interface SRResult {
  isFinal: boolean;
  length: number;
  [i: number]: SRAlternative;
}
interface SREvent {
  resultIndex: number;
  results: { length: number; [i: number]: SRResult };
}
interface SRInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SRCtor = new () => SRInstance;

function recognitionCtor(): SRCtor | null {
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Listens while the mic button is held: Web Speech API for the words (language from the config)
 * plus an AnalyserNode for the loudness meter ("speak up!"). Either half may be missing
 * (permissions, browser support) — the judge in love.ts copes with that.
 */
export class LoveListener {
  constructor(private lang = 'th-TH') {}

  readonly recognitionSupported = recognitionCtor() !== null;
  readonly micSupported = !!navigator.mediaDevices?.getUserMedia;
  onLevel?: (level: number) => void;
  onText?: (text: string) => void;

  private rec: SRInstance | null = null;
  private recFailed = false;
  private recEnded: Promise<void> = Promise.resolve();
  private finals: string[] = [];
  private interim = '';
  private alternatives = new Set<string>();
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private raf = 0;
  private peak = 0;
  private voicedMs = 0;
  private meterOK = false;
  active = false;

  async start(): Promise<void> {
    this.active = true;
    this.finals = [];
    this.interim = '';
    this.alternatives.clear();
    this.peak = 0;
    this.voicedMs = 0;
    this.meterOK = false;
    this.recFailed = false;
    this.startRecognition();
    await this.startMeter();
  }

  private startRecognition(): void {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    try {
      const rec = new Ctor();
      rec.lang = this.lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 3;
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          for (let k = 0; k < res.length; k++) this.alternatives.add(res[k].transcript);
          if (res.isFinal) this.finals.push(res[0].transcript);
          else interim += res[0].transcript;
        }
        this.interim = interim;
        this.onText?.(this.displayText());
      };
      rec.onerror = (e) => {
        if (e.error !== 'no-speech' && e.error !== 'aborted') this.recFailed = true;
      };
      this.recEnded = new Promise((res) => {
        rec.onend = () => res();
      });
      rec.start();
      this.rec = rec;
    } catch {
      this.recFailed = true;
      this.rec = null;
    }
  }

  private async startMeter(): Promise<void> {
    if (!this.micSupported) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
      });
      if (!this.active) {
        this.stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      const src = this.ctx.createMediaStreamSource(this.stream);
      const an = this.ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      const buf = new Float32Array(an.fftSize);
      this.meterOK = true;
      let last = performance.now();
      let smooth = 0;
      const loop = () => {
        if (!this.active) return;
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        const now = performance.now();
        if (rms > SPEAK_THRESHOLD) this.voicedMs += now - last;
        last = now;
        this.peak = Math.max(this.peak, rms);
        smooth = Math.max(rms, smooth * 0.9);
        this.onLevel?.(Math.min(1, smooth * 7));
        this.raf = requestAnimationFrame(loop);
      };
      loop();
    } catch {
      this.meterOK = false;
    }
  }

  private displayText(): string {
    return (this.finals.join(' ') + ' ' + this.interim).trim();
  }

  async stop(): Promise<VoiceAttempt> {
    this.active = false;
    cancelAnimationFrame(this.raf);
    if (this.rec) {
      try {
        this.rec.stop();
      } catch {
        /* already stopped */
      }
      await Promise.race([this.recEnded, new Promise((r) => setTimeout(r, 1600))]);
      this.rec = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close();
    this.ctx = null;
    this.onLevel?.(0);
    const transcript = [this.displayText(), ...this.alternatives].join(' ').trim();
    return {
      transcript,
      peak: this.meterOK ? this.peak : -1,
      voicedMs: this.voicedMs,
      recognition: this.recognitionSupported && !this.recFailed,
    };
  }

  lastHeard(): string {
    return this.displayText();
  }
}

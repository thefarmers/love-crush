/** Shared Web Audio plumbing for sound effects and music. */

export const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** Output graph: a dry bus plus a reverb send. */
export interface Rig {
  ctx: BaseAudioContext;
  out: AudioNode;
  reverb: AudioNode;
}

/** Connect a voice to the dry bus and (optionally) the reverb. */
export function voice(rig: Rig, node: AudioNode, wet: number): void {
  node.connect(rig.out);
  if (wet > 0) {
    const s = rig.ctx.createGain();
    s.gain.value = wet;
    node.connect(s).connect(rig.reverb);
  }
}

/** Synthetic stereo hall impulse response (decaying noise). */
export function impulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const len = ctx.sampleRate;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** Reverb chain: lowpass damping → convolver → wet gain → destination. Returns the send input. */
export function makeReverb(ctx: BaseAudioContext, dest: AudioNode, seconds = 3.2, wet = 0.7): AudioNode {
  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, seconds, 2.6);
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 5200;
  const out = ctx.createGain();
  out.gain.value = wet;
  damp.connect(reverb).connect(out).connect(dest);
  return damp;
}

import type { SecretPhrase } from '../config/personal';

/**
 * Pure logic for the "out of hearts → say I love you" feature (kept separate from the
 * browser APIs so it can be unit-tested).
 */

/** Lower-case, strip spaces/punctuation/zero-width chars, collapse stretched letters ("รักกกก" → "รัก"). */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFC')
    .replace(/[​-‍﻿]/g, '')
    .replace(/[\s.,!?'"“”‘’~\-_:;()[\]{}…ๆ]+/g, '')
    .replace(/(.)\1{2,}/gu, '$1');
}

export function levenshtein(a: string, b: string): number {
  const A = [...a];
  const B = [...b];
  let prev = Array.from({ length: B.length + 1 }, (_, j) => j);
  for (let i = 1; i <= A.length; i++) {
    const cur = [i];
    for (let j = 1; j <= B.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[B.length];
}

export function containsLove(text: string, keywords: string[]): boolean {
  const t = normalize(text);
  if (!t) return false;
  return keywords.some((k) => t.includes(normalize(k)));
}

/**
 * Speech-to-text is imperfect (especially Thai), so secret phrases match when the best window
 * of the transcript is within ~25% edit distance of the phrase.
 */
export function matchSecret(text: string, phrases: SecretPhrase[]): SecretPhrase | null {
  const t = normalize(text);
  if (!t) return null;
  for (const p of phrases) {
    const target = normalize(p.phrase);
    if (t.includes(target)) return p;
    const L = [...target].length;
    const chars = [...t];
    let best = Infinity;
    for (let len = Math.max(1, L - 3); len <= L + 3; len++) {
      const last = Math.max(0, chars.length - len);
      for (let s = 0; s <= last; s++) best = Math.min(best, levenshtein(chars.slice(s, s + len).join(''), target));
    }
    if (best <= Math.floor(L * 0.25)) return p;
  }
  return null;
}

export interface VoiceAttempt {
  transcript: string;
  /** Peak RMS level 0..1 from the mic meter (-1 when the meter was unavailable). */
  peak: number;
  /** Milliseconds the level stayed above the speaking threshold. */
  voicedMs: number;
  /** Whether speech recognition was available for this attempt. */
  recognition: boolean;
}

export type VoiceVerdict =
  | { ok: true; secret: SecretPhrase | null; mode: 'words' | 'loudness' | 'typed' }
  | { ok: false; reason: 'quiet' | 'no-love' | 'nothing' };

export const SPEAK_THRESHOLD = 0.035;
const QUIET_PEAK = 0.05;

export function judgeAttempt(a: VoiceAttempt, keywords: string[], secrets: SecretPhrase[]): VoiceVerdict {
  const hasMeter = a.peak >= 0;
  const heard = a.transcript.trim().length > 0;
  if (a.recognition) {
    if (!heard) return { ok: false, reason: hasMeter && a.peak < QUIET_PEAK ? 'quiet' : 'nothing' };
    if (hasMeter && a.peak < QUIET_PEAK * 0.6) return { ok: false, reason: 'quiet' };
    if (!containsLove(a.transcript, keywords) && !matchSecret(a.transcript, secrets)) return { ok: false, reason: 'no-love' };
    return { ok: true, secret: matchSecret(a.transcript, secrets), mode: 'words' };
  }
  // No speech recognition (e.g. Firefox): trust a clearly spoken sentence.
  if (!hasMeter) return { ok: false, reason: 'nothing' };
  if (a.peak < QUIET_PEAK || a.voicedMs < 700) return { ok: false, reason: 'quiet' };
  return { ok: true, secret: null, mode: 'loudness' };
}

export function judgeTyped(text: string, keywords: string[], secrets: SecretPhrase[]): VoiceVerdict {
  if (!text.trim()) return { ok: false, reason: 'nothing' };
  const secret = matchSecret(text, secrets);
  if (!containsLove(text, keywords) && !secret) return { ok: false, reason: 'no-love' };
  return { ok: true, secret, mode: 'typed' };
}

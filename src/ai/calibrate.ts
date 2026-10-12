import { hashSeed } from '../core/rng';
import type { LevelDef } from '../core/types';
import { starQuantiles, targetWinRate, winRateBand } from '../levels/difficulty';
import { generateLevel } from '../levels/generator';
import { playLevel } from './solver';

/** Calibration record stored per level in calibration.json. */
export interface LevelCalibration {
  /** Generator salt that produced a fair layout. */
  s: number;
  /** Moves granted to the player. */
  m: number;
  /** Score target (score / timed levels). */
  t?: number;
  /** Star thresholds. */
  st: [number, number, number];
  /** Bot win rate measured with these settings. */
  w: number;
  /** Share of the bot's winning runs that earned three stars. */
  s3?: number;
}

/** Moves a bot gets to stand in for a 60-second boss run. */
export const BOSS_BOT_MOVES = 18;
const MOVE_CAP = 90;
const MIN_MOVES = 12;
const MAX_MOVES = 55;

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const k = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[k];
}

const round = (x: number, step: number) => Math.max(step, Math.round(x / step) * step);

function stars(n: number, base: number, finals: number[]): { st: [number, number, number]; s3: number } {
  const sorted = finals.slice().sort((a, b) => a - b);
  const [q2, q3] = starQuantiles(n);
  // Round *down* so a score equal to the bot's quantile still earns the star.
  const floor100 = (x: number) => Math.max(100, Math.floor(x / 100) * 100);
  const s2 = Math.max(base + 100, floor100(quantile(sorted, q2) || base * 1.3));
  const s3 = Math.max(s2 + 100, floor100(quantile(sorted, q3) || base * 1.6));
  const share = sorted.length ? sorted.filter((x) => x >= s3).length / sorted.length : 0;
  return { st: [base, s2, s3], s3: Math.round(share * 100) / 100 };
}

export function applyCalibration(level: LevelDef, cal: LevelCalibration): LevelDef {
  return {
    ...level,
    moves: cal.m,
    stars: cal.st,
    goals: level.goals.map((g) => (g.type === 'score' && cal.t ? { ...g, target: cal.t } : g)),
  };
}

interface Verify {
  w: number;
  finals: number[];
}

function verify(level: LevelDef, M: number, runs: number, seed: (k: number, tag: number) => number): Verify {
  let wins = 0;
  const finals: number[] = [];
  for (let k = 0; k < runs; k++) {
    const r = playLevel(level, seed(k, 2), { maxMoves: M, rush: true });
    if (r.won) {
      wins++;
      finals.push(r.finalScore);
    }
  }
  return { w: wins / runs, finals };
}

/**
 * Plays the level `runs` times with a large move budget, then picks the move count at the
 * quantile matching the tier's target win rate (one batch of runs gives the whole curve).
 * A verification batch then nudges moves (or the score target) until the win rate sits inside
 * the tier's band. Layouts the bot can't finish often enough are re-rolled with a new salt.
 */
export function calibrateLevel(n: number, runs = 40): LevelCalibration {
  let fallback: LevelCalibration | null = null;
  for (let salt = 0; salt < 6; salt++) {
    const level = generateLevel(n, salt);
    const w = targetWinRate(n, level.tier);
    const [lo, hi] = winRateBand(n, level.tier);
    const seed = (k: number, tag: number) => hashSeed(n, salt, k, tag);
    const verifyRuns = Math.max(20, Math.round(runs * 0.75));

    if (level.goals.some((g) => g.type === 'score')) {
      const M = level.time ? BOSS_BOT_MOVES : level.moves;
      const scores: number[] = [];
      for (let k = 0; k < runs; k++) scores.push(playLevel(level, seed(k, 1), { maxMoves: M, scoreTarget: Infinity }).score);
      scores.sort((a, b) => a - b);
      let target = round(quantile(scores, 1 - w), 100);
      let v = verify(applyCalibration(level, { s: salt, m: M, t: target, st: [target, target, target], w: 0 }), M, verifyRuns, seed);
      for (let step = 0; step < 6 && (v.w < lo || v.w > hi); step++) {
        target = round(target * (v.w > hi ? 1.08 : 0.92), 100);
        v = verify(applyCalibration(level, { s: salt, m: M, t: target, st: [target, target, target], w: 0 }), M, verifyRuns, seed);
      }
      const sr = stars(n, target, v.finals);
      return { s: salt, m: M, t: target, st: sr.st, w: v.w, s3: sr.s3 };
    }

    const needed: number[] = [];
    for (let k = 0; k < runs; k++) {
      const r = playLevel(level, seed(k, 1), { maxMoves: MOVE_CAP });
      needed.push(r.won ? r.moves : Infinity);
    }
    needed.sort((a, b) => a - b);
    const raw = quantile(needed, w);
    const solvedShare = needed.filter(Number.isFinite).length / runs;
    let M = Math.max(MIN_MOVES, Math.min(MAX_MOVES, Number.isFinite(raw) ? raw : MAX_MOVES));
    const tuned = (m: number) => applyCalibration(level, { s: salt, m, st: [1, 1, 1], w: 0 });
    let v = verify(tuned(M), M, verifyRuns, seed);
    for (let step = 0; step < 4; step++) {
      if (v.w > hi && M > MIN_MOVES) M--;
      else if (v.w < lo && M < MAX_MOVES) M++;
      else break;
      v = verify(tuned(M), M, verifyRuns, seed);
    }
    const sr = stars(n, 1, v.finals);
    const cal: LevelCalibration = { s: salt, m: M, st: sr.st, w: v.w, s3: sr.s3 };
    const tooSmall = (level.tier === 'medium' || level.tier === 'hard') && raw < MIN_MOVES;
    const fair =
      Number.isFinite(raw) && raw <= MAX_MOVES && !tooSmall && solvedShare >= Math.min(0.95, w + 0.1) && v.w >= lo && v.w <= hi;
    if (fair) return cal;
    const miss = (c: LevelCalibration) => (c.w < lo ? lo - c.w : c.w > hi ? c.w - hi : 0);
    if (!fallback || miss(cal) < miss(fallback)) fallback = cal;
  }
  return fallback!;
}

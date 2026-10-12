import type { Tier } from '../core/types';

export const TOTAL_LEVELS = 1000;

/**
 * Sawtooth pacing inside every block of ten levels:
 *   x1 easy · x2 medium · x3 HARD · x4 relief · x5 easy · x6 medium · x7 medium · x8 HARD · x9 relief · x0 BOSS
 * e.g. 10–12 build up, 13 is a wall, 14 is a fireworks-and-combos breather.
 */
const CYCLE: Tier[] = ['boss', 'easy', 'medium', 'hard', 'relief', 'easy', 'medium', 'medium', 'hard', 'relief'];

export function tierFor(level: number): Tier {
  if (level <= 10) return 'tutorial';
  return CYCLE[level % 10];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * 0 → 1 over the first ~250 levels (smoothstep): a long "honeymoon" where everything is
 * generous, then a gradual climb. The sawtooth still shapes every block of ten levels.
 */
export function ramp(level: number): number {
  const x = Math.min(1, Math.max(0, (level - 10) / 250));
  return x * x * (3 - 2 * x);
}

/** Target bot win rate per tier. Early "hard" levels are only a speed bump, not a wall. */
export function targetWinRate(level: number, tier: Tier = tierFor(level)): number {
  const r = ramp(level);
  switch (tier) {
    case 'tutorial':
      return 0.98;
    case 'relief':
      return lerp(0.97, 0.94, r);
    case 'easy':
      return lerp(0.95, 0.86, r);
    case 'medium':
      return lerp(0.88, 0.63, r);
    case 'hard':
      return lerp(0.75, 0.3, r);
    case 'boss':
      return lerp(0.85, 0.5, r);
  }
}

/** Win-rate band a calibrated level must land in (target ± 0.13). */
export function winRateBand(level: number, tier: Tier = tierFor(level)): [number, number] {
  const w = targetWinRate(level, tier);
  return [Math.max(0.05, w - 0.13), Math.min(1, w + 0.13)];
}

/**
 * Share of winning bot runs that should reach each star tier. Early on most wins earn three
 * stars (it should feel great); later, three stars become something to chase.
 */
export function starQuantiles(level: number): [number, number] {
  const r = ramp(level);
  return [lerp(0.1, 0.35, r), lerp(0.3, 0.72, r)];
}

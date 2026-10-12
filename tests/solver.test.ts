import { describe, expect, it } from 'vitest';
import { bestMove, chooseMove, playLevel } from '../src/ai/solver';
import { quantile } from '../src/ai/calibrate';
import { Game } from '../src/core/game';
import { Rng } from '../src/core/rng';
import { getLevel } from '../src/levels/index';

const winRate = (n: number, seeds: number[]) => {
  const lv = getLevel(n);
  const wins = seeds.filter((s) => playLevel(lv, 10_000 + s, { maxMoves: lv.time ? 18 : lv.moves }).won).length;
  return wins / seeds.length;
};
const seeds = Array.from({ length: 24 }, (_, i) => i + 1);

describe('AI solver', () => {
  it('always picks a legal move', () => {
    const g = new Game(getLevel(25), { seed: 3, record: false });
    const rng = new Rng(1);
    for (let k = 0; k < 15 && g.status === 'playing'; k++) {
      const m = chooseMove(g, rng)!;
      expect(g.canSwap(m.a, m.b)).toBe(true);
      expect(g.trySwap(m.a, m.b)).not.toBeNull();
    }
  });

  it('hint returns a legal move', () => {
    const g = new Game(getLevel(42), { seed: 5, record: false });
    const m = bestMove(g)!;
    expect(g.canSwap(m.a, m.b)).toBe(true);
  });

  it('early levels are friendly, late hard levels bite, on fresh seeds', () => {
    const early = (winRate(13, seeds) + winRate(14, seeds)) / 2;
    const lateRelief = (winRate(504, seeds) + winRate(514, seeds)) / 2;
    const lateHard = (winRate(503, seeds) + winRate(518, seeds)) / 2;
    expect(early).toBeGreaterThan(0.6);
    expect(lateRelief).toBeGreaterThan(0.7);
    expect(lateHard).toBeLessThan(0.65);
    expect(lateHard).toBeGreaterThan(0.02);
    expect(lateRelief).toBeGreaterThan(lateHard);
  });

  it('quantile picks the right order statistic', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(quantile(xs, 0.3)).toBe(3);
    expect(quantile(xs, 0.95)).toBe(10);
    expect(quantile(xs, 0)).toBe(1);
  });
});

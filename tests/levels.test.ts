import { describe, expect, it } from 'vitest';
import calibration from '../src/levels/calibration.json';
import { Game } from '../src/core/game';
import { findMatches } from '../src/core/match';
import { ramp, targetWinRate, tierFor, winRateBand, TOTAL_LEVELS } from '../src/levels/difficulty';
import { MAX_COLS } from '../src/levels/shapes';
import { generateLevel, validateLevel } from '../src/levels/generator';
import { getLevel } from '../src/levels/index';
import type { Tier } from '../src/core/types';

const cal = (calibration as unknown as { levels: Record<string, { s: number; m: number; w: number; st: number[]; t?: number; s3?: number }> }).levels;
const all = Array.from({ length: TOTAL_LEVELS }, (_, i) => getLevel(i + 1));

describe('difficulty curve', () => {
  it('follows the sawtooth: build-up, a wall, then a breather', () => {
    expect([1, 5, 10].map(tierFor)).toEqual(['tutorial', 'tutorial', 'tutorial']);
    expect(tierFor(11)).toBe('easy');
    expect(tierFor(12)).toBe('medium');
    expect(tierFor(13)).toBe('hard');
    expect(tierFor(14)).toBe('relief');
    expect(tierFor(20)).toBe('boss');
    expect(tierFor(998)).toBe('hard');
    expect(tierFor(999)).toBe('relief');
  });

  it('hard levels never sit next to each other', () => {
    for (let n = 11; n < TOTAL_LEVELS; n++) {
      if (tierFor(n) === 'hard') expect(tierFor(n + 1)).toBe('relief');
    }
  });

  it('target win rates are ordered relief > easy > medium > hard', () => {
    for (const n of [15, 150, 600]) {
      const w = (t: Tier) => targetWinRate(n, t);
      expect(w('relief')).toBeGreaterThan(w('easy'));
      expect(w('easy')).toBeGreaterThan(w('medium'));
      expect(w('medium')).toBeGreaterThan(w('hard'));
    }
  });

  it('starts gentle and ramps up gradually', () => {
    expect(ramp(1)).toBe(0);
    expect(ramp(300)).toBe(1);
    for (let n = 2; n <= 300; n++) expect(ramp(n)).toBeGreaterThanOrEqual(ramp(n - 1));
    // early "hard" levels are a speed bump, late ones are a real wall
    expect(targetWinRate(13)).toBeGreaterThan(0.7);
    expect(targetWinRate(503)).toBeLessThan(0.35);
  });
});

describe('level generator', () => {
  it('produces 1000 valid levels', () => {
    expect(all).toHaveLength(1000);
    const problems = all.map((lv) => [lv.id, validateLevel(lv)] as const).filter(([, p]) => p.length);
    expect(problems).toEqual([]);
  });

  it('is deterministic', () => {
    for (const n of [1, 13, 77, 500, 1000]) expect(generateLevel(n)).toEqual(generateLevel(n));
    expect(generateLevel(50, 0)).not.toEqual(generateLevel(50, 1));
  });

  it('rotates objectives so ten levels in a row never feel the same', () => {
    for (let start = 11; start + 10 <= TOTAL_LEVELS; start += 10) {
      const types = new Set(all.slice(start - 1, start + 9).flatMap((lv) => lv.goals.map((g) => g.type)));
      expect(types.size, `levels ${start}-${start + 9}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('boards are at most 8 columns wide (finger-friendly cells)', () => {
    for (const lv of all) expect(lv.cols, `level ${lv.id}`).toBeLessThanOrEqual(MAX_COLS);
  });

  it('uses many board shapes and unlocks gravity twists later', () => {
    const shapes = new Set(all.map((lv) => lv.layout.join('/').replace(/[^.\/]/g, '#')));
    expect(shapes.size).toBeGreaterThanOrEqual(12);
    expect(all.slice(0, 40).every((lv) => lv.gravity === 'down')).toBe(true);
    const gravities = new Set(all.map((lv) => lv.gravity));
    expect(gravities).toEqual(new Set(['down', 'up', 'left', 'right']));
    expect(all.some((lv) => (lv.portals?.length ?? 0) > 0)).toBe(true);
  });

  it('boss levels are timed score runs', () => {
    for (const lv of all.filter((l) => l.tier === 'boss')) {
      expect(lv.time).toBe(60);
      expect(lv.goals[0].type).toBe('score');
      expect((lv.goals[0] as { target: number }).target).toBeGreaterThan(0);
    }
  });

  it('every level starts with a full board, no free matches and at least one move', () => {
    for (let n = 1; n <= TOTAL_LEVELS; n += 7) {
      for (const seed of [1, 2]) {
        const g = new Game(all[n - 1], { seed, record: false });
        expect(findMatches(g.board), `level ${n}`).toEqual([]);
        expect(g.hasValidMove(), `level ${n}`).toBe(true);
        const empty = g.board.cells.filter((c) => c.playable && !c.blocker && !c.tile);
        expect(empty, `level ${n}`).toEqual([]);
      }
    }
  });
});

describe('bot calibration', () => {
  it('covers every level', () => {
    for (let n = 1; n <= TOTAL_LEVELS; n++) expect(cal[n], `level ${n}`).toBeDefined();
  });

  it('every level is beatable and lands inside its tier win-rate band', () => {
    const misses: string[] = [];
    for (let n = 1; n <= TOTAL_LEVELS; n++) {
      const c = cal[n];
      const [lo, hi] = winRateBand(n);
      expect(c.w, `level ${n}`).toBeGreaterThan(0);
      if (c.w < lo || c.w > hi) misses.push(`${n}:${c.w.toFixed(2)}`);
    }
    expect(misses.length, misses.join(' ')).toBeLessThanOrEqual(10);
  });

  it('average win rate per tier tracks the design targets', () => {
    const groups: Record<string, { w: number; target: number }[]> = {};
    for (let n = 1; n <= TOTAL_LEVELS; n++) (groups[tierFor(n)] ??= []).push({ w: cal[n].w, target: targetWinRate(n) });
    for (const [tier, rows] of Object.entries(groups)) {
      const mean = (k: 'w' | 'target') => rows.reduce((s, r) => s + r[k], 0) / rows.length;
      expect(Math.abs(mean('w') - mean('target')), tier).toBeLessThan(0.1);
    }
  });

  it('the first 30 levels feel generous', () => {
    const early = Array.from({ length: 30 }, (_, i) => cal[i + 1]);
    const meanW = early.reduce((s, c) => s + c.w, 0) / early.length;
    expect(meanW).toBeGreaterThan(0.85);
    expect(Math.min(...early.map((c) => c.w))).toBeGreaterThan(0.6);
  });

  it('three stars are common early and become a real chase later', () => {
    const share = (from: number, to: number) => {
      let sum = 0;
      for (let n = from; n <= to; n++) sum += cal[n].s3 ?? 0;
      return sum / (to - from + 1);
    };
    expect(share(1, 30)).toBeGreaterThan(0.55);
    expect(share(400, 1000)).toBeLessThan(share(1, 30));
    expect(share(400, 1000)).toBeGreaterThan(0.15);
  });

  it('move budgets and star thresholds are sane', () => {
    for (const lv of all) {
      if (!lv.time) {
        expect(lv.moves).toBeGreaterThanOrEqual(12);
        expect(lv.moves).toBeLessThanOrEqual(55);
      }
      expect(lv.stars[1]).toBeGreaterThan(lv.stars[0]);
      expect(lv.stars[2]).toBeGreaterThan(lv.stars[1]);
    }
  });
});

describe('mechanic introductions', () => {
  it('every obstacle and twist is introduced (with an explanation) somewhere in the 1000 levels', async () => {
    const { MECHANICS, newMechanicsAt } = await import('../src/levels/mechanics');
    const seen = new Set<string>();
    for (let n = 1; n <= TOTAL_LEVELS; n++) for (const m of newMechanicsAt(n, getLevel)) seen.add(m.key);
    expect([...seen].sort()).toEqual(MECHANICS.map((m) => m.key).sort());
  });
});

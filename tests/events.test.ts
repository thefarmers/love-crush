import { describe, expect, it } from 'vitest';
import { chooseMove } from '../src/ai/solver';
import type { Phase } from '../src/core/events';
import { Game } from '../src/core/game';
import { Rng } from '../src/core/rng';
import { starsFor } from '../src/core/stars';
import { getLevel } from '../src/levels/index';

/**
 * The renderer never reads the board mid-turn: it replays the event stream. This "shadow"
 * replay proves the stream alone always reproduces the engine's final board.
 */
function snapshot(g: Game): Map<number, number> {
  const m = new Map<number, number>();
  g.board.cells.forEach((c, i) => c.tile && m.set(c.tile.id, i));
  return m;
}

function replay(phases: Phase[], shadow: Map<number, number>): void {
  const idAt = (cell: number) => [...shadow.entries()].find(([, c]) => c === cell)?.[0];
  for (const p of phases) {
    switch (p.type) {
      case 'swap': {
        const a = idAt(p.a)!;
        const b = idAt(p.b)!;
        shadow.set(a, p.b);
        shadow.set(b, p.a);
        break;
      }
      case 'clear':
        for (const pop of p.pops) {
          expect(shadow.get(pop.id), `pop of unknown tile ${pop.id}`).toBe(pop.cell);
          shadow.delete(pop.id);
        }
        for (const c of p.creates) expect(shadow.get(c.id)).toBe(c.cell);
        break;
      case 'fall':
        for (const path of p.paths) {
          if (path.spawnTick < 0) expect(shadow.get(path.id), `fall start of ${path.id}`).toBe(path.steps[0].cell);
          else expect(shadow.has(path.id)).toBe(false);
          for (let k = 1; k < path.steps.length; k++) expect(path.steps[k].tick).toBeGreaterThanOrEqual(path.steps[k - 1].tick);
          shadow.set(path.id, path.steps[path.steps.length - 1].cell);
        }
        break;
      case 'collect':
        for (const it of p.items) shadow.delete(it.id);
        break;
      case 'spread':
        expect(shadow.get(p.tileId)).toBe(p.to);
        shadow.delete(p.tileId);
        break;
      case 'shuffle':
        for (const m of p.moves) shadow.set(m.id, m.to);
        break;
    }
  }
  const cells = [...shadow.values()];
  expect(new Set(cells).size, 'two tiles in one cell').toBe(cells.length);
}

describe('event stream ↔ engine contract', () => {
  for (const n of [1, 4, 9, 10, 13, 14, 20, 22, 28, 42, 86, 95, 150, 333]) {
    it(`level ${n}: replaying every turn's events reproduces the board`, () => {
      const g = new Game(getLevel(n), { seed: n * 31 + 7 });
      const rng = new Rng(n);
      for (let turn = 0; turn < 40 && g.status === 'playing'; turn++) {
        const m = chooseMove(g, rng)!;
        const shadow = snapshot(g);
        const res = g.trySwap(m.a, m.b)!;
        replay(res.phases, shadow);
        expect(shadow).toEqual(snapshot(g));
      }
      if (g.status === 'won') {
        const shadow = snapshot(g);
        replay(g.loveRush()!.phases, shadow);
        expect(shadow).toEqual(snapshot(g));
      }
    });
  }
});

describe('stars', () => {
  it('awards 1-3 stars by score thresholds', () => {
    const st: [number, number, number] = [1, 5000, 9000];
    expect(starsFor(100, st)).toBe(1);
    expect(starsFor(5000, st)).toBe(2);
    expect(starsFor(12000, st)).toBe(3);
  });
});

import { describe, expect, it } from 'vitest';
import type { ClearPhase, FallPhase } from '../src/core/events';
import { findMatches } from '../src/core/match';
import { Rng, hashSeed } from '../src/core/rng';
import { countTiles, emptyOpenCells, idx, makeGame } from './helpers';

/**
 * Filler grid that never matches by itself: neighbours always differ and colors 1..5 are used,
 * leaving color 0 free for the scenario under test.
 */
function grid(rows: number, cols: number, overrides: Record<string, string> = {}): string[] {
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    const row: string[] = [];
    for (let c = 0; c < cols; c++) row.push(overrides[`${r},${c}`] ?? String(1 + ((c + 2 * r) % 5)));
    out.push(row.join(' '));
  }
  return out;
}

const firstClear = (phases: { type: string }[]) => phases.find((p) => p.type === 'clear') as ClearPhase;
const popCells = (p: ClearPhase) => new Set(p.pops.map((e) => e.cell));

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = new Rng(123);
    const b = new Rng(123);
    const xs = Array.from({ length: 20 }, () => a.next());
    const ys = Array.from({ length: 20 }, () => b.next());
    expect(xs).toEqual(ys);
    expect(new Rng(124).next()).not.toEqual(xs[0]);
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
  });

  it('hashSeed spreads nearby integers', () => {
    const seeds = new Set(Array.from({ length: 1000 }, (_, i) => hashSeed(i)));
    expect(seeds.size).toBe(1000);
  });
});

describe('matching', () => {
  it('filler grid has no matches', () => {
    const g = makeGame(grid(7, 7));
    expect(findMatches(g.board)).toEqual([]);
  });

  it('a plain 3-match pops exactly three tiles', () => {
    const g = makeGame(grid(5, 5, { '2,0': '0', '2,1': '0', '1,2': '0' }));
    const res = g.trySwap(idx(g, 1, 2), idx(g, 2, 2))!;
    expect(res).not.toBeNull();
    const clear = firstClear(res.phases);
    expect([...popCells(clear)].sort()).toEqual([idx(g, 2, 0), idx(g, 2, 1), idx(g, 2, 2)].sort());
    expect(clear.creates).toEqual([]);
    expect(clear.pops.every((p) => p.color === 0)).toBe(true);
  });

  it('4 in a row creates a line blaster where the player swapped', () => {
    const g = makeGame(grid(5, 5, { '2,0': '0', '2,1': '0', '2,3': '0', '1,2': '0' }));
    const clear = firstClear(g.trySwap(idx(g, 1, 2), idx(g, 2, 2))!.phases);
    expect(clear.creates).toHaveLength(1);
    expect(clear.creates[0]).toMatchObject({ special: 'lineH', cell: idx(g, 2, 2), color: 0 });
  });

  it('vertical 4 creates a vertical line blaster', () => {
    const g = makeGame(grid(6, 5, { '0,2': '0', '1,2': '0', '3,2': '0', '2,1': '0' }));
    const clear = firstClear(g.trySwap(idx(g, 2, 1), idx(g, 2, 2))!.phases);
    expect(clear.creates[0]).toMatchObject({ special: 'lineV', cell: idx(g, 2, 2) });
  });

  it('5 in a row creates a rainbow gem', () => {
    const g = makeGame(grid(5, 5, { '2,0': '0', '2,1': '0', '2,3': '0', '2,4': '0', '1,2': '0' }));
    const clear = firstClear(g.trySwap(idx(g, 1, 2), idx(g, 2, 2))!.phases);
    expect(clear.creates[0]).toMatchObject({ special: 'rainbow', cell: idx(g, 2, 2), color: -1 });
  });

  it('L shape creates a bomb at the corner', () => {
    const g = makeGame(grid(5, 5, { '2,0': '0', '2,1': '0', '3,2': '0', '4,2': '0', '1,2': '0' }));
    const clear = firstClear(g.trySwap(idx(g, 1, 2), idx(g, 2, 2))!.phases);
    expect(clear.creates[0]).toMatchObject({ special: 'bomb', cell: idx(g, 2, 2) });
    expect(clear.pops).toHaveLength(4);
  });

  it('T shape creates a bomb', () => {
    const g = makeGame(grid(5, 5, { '2,1': '0', '2,3': '0', '3,2': '0', '4,2': '0', '1,2': '0' }));
    const clear = firstClear(g.trySwap(idx(g, 1, 2), idx(g, 2, 2))!.phases);
    expect(clear.creates[0]).toMatchObject({ special: 'bomb', cell: idx(g, 2, 2) });
  });

  it('2x2 square creates a cupid', () => {
    const g = makeGame(grid(5, 5, { '2,1': '0', '3,1': '0', '3,2': '0', '1,2': '0' }));
    const res = g.trySwap(idx(g, 1, 2), idx(g, 2, 2))!;
    expect(res).not.toBeNull();
    const clear = firstClear(res.phases);
    expect(clear.creates[0]).toMatchObject({ special: 'cupid', cell: idx(g, 2, 2) });
  });

  it('rejects swaps that do not make a match and leaves the board untouched', () => {
    const g = makeGame(grid(5, 5));
    const before = g.board.toString();
    expect(g.canSwap(0, 1)).toBe(false);
    expect(g.trySwap(0, 1)).toBeNull();
    expect(g.board.toString()).toBe(before);
    expect(g.movesLeft).toBe(20);
  });

  it('rejects non-adjacent swaps and locked tiles', () => {
    const g = makeGame(grid(5, 5, { '2,0': '0', '2,1': '0', '1,2': '0l' }));
    expect(g.canSwap(idx(g, 0, 0), idx(g, 0, 2))).toBe(false);
    expect(g.canSwap(idx(g, 1, 2), idx(g, 2, 2))).toBe(false);
  });

  it('finds valid moves on the board', () => {
    const g = makeGame(grid(5, 5, { '2,0': '0', '2,1': '0', '1,2': '0' }));
    const moves = g.validMoves();
    expect(moves).toContainEqual({ a: idx(g, 1, 2), b: idx(g, 2, 2) });
    expect(g.hasValidMove()).toBe(true);
  });
});

describe('specials & combos', () => {
  it('a matched line blaster clears its whole row', () => {
    const g = makeGame(grid(5, 5, { '2,0': '0h', '2,1': '0', '1,2': '0' }));
    const clear = firstClear(g.trySwap(idx(g, 1, 2), idx(g, 2, 2))!.phases);
    const popped = popCells(clear);
    for (let c = 0; c < 5; c++) expect(popped.has(idx(g, 2, c))).toBe(true);
    expect(clear.activations.map((a) => a.kind)).toContain('lineH');
  });

  it('a matched bomb clears the 3x3 around it', () => {
    const g = makeGame(grid(5, 5, { '2,1': '0', '2,2': '0m', '1,3': '0' }));
    const clear = firstClear(g.trySwap(idx(g, 1, 3), idx(g, 2, 3))!.phases);
    const popped = popCells(clear);
    for (let r = 1; r <= 3; r++) for (let c = 1; c <= 3; c++) expect(popped.has(idx(g, r, c))).toBe(true);
  });

  it('line + line = cross through the destination cell', () => {
    const g = makeGame(grid(6, 6, { '2,2': '0h', '2,3': '1v' }));
    const res = g.trySwap(idx(g, 2, 2), idx(g, 2, 3))!;
    expect(res.stats.combo).toBe(true);
    const clear = firstClear(res.phases);
    const popped = popCells(clear);
    for (let c = 0; c < 6; c++) expect(popped.has(idx(g, 2, c))).toBe(true);
    for (let r = 0; r < 6; r++) expect(popped.has(idx(g, r, 3))).toBe(true);
    expect(clear.activations[0].kind).toBe('cross');
  });

  it('line + bomb = three rows and three columns', () => {
    const g = makeGame(grid(7, 7, { '3,3': '0h', '3,4': '1m' }));
    const clear = firstClear(g.trySwap(idx(g, 3, 3), idx(g, 3, 4))!.phases);
    const popped = popCells(clear);
    for (const r of [2, 3, 4]) for (let c = 0; c < 7; c++) expect(popped.has(idx(g, r, c))).toBe(true);
    for (const c of [3, 4, 5]) for (let r = 0; r < 7; r++) expect(popped.has(idx(g, r, c))).toBe(true);
  });

  it('bomb + bomb = 5x5 blast', () => {
    const g = makeGame(grid(7, 7, { '3,3': '0m', '3,4': '1m' }));
    const clear = firstClear(g.trySwap(idx(g, 3, 3), idx(g, 3, 4))!.phases);
    const popped = popCells(clear);
    for (let r = 1; r <= 5; r++) for (let c = 2; c <= 6; c++) expect(popped.has(idx(g, r, c))).toBe(true);
    expect(clear.activations[0]).toMatchObject({ kind: 'bigBomb', radius: 2 });
  });

  it('rainbow + gem clears every gem of that color', () => {
    const g = makeGame(grid(6, 6, { '2,2': 'R' }));
    const target = g.board.cells[idx(g, 2, 3)].tile!.color;
    const before = countTiles(g, (t) => t.color === target);
    const clear = firstClear(g.trySwap(idx(g, 2, 2), idx(g, 2, 3))!.phases);
    expect(clear.pops.filter((p) => p.color === target)).toHaveLength(before);
    expect(clear.activations[0]).toMatchObject({ kind: 'colorClear', color: target });
  });

  it('rainbow + line converts that color into blasters and fires them', () => {
    const g = makeGame(grid(6, 6, { '2,2': 'R', '2,3': '3h' }));
    const clear = firstClear(g.trySwap(idx(g, 2, 2), idx(g, 2, 3))!.phases);
    expect(clear.converts.length).toBeGreaterThan(0);
    expect(clear.converts.every((c) => c.special === 'lineH' || c.special === 'lineV')).toBe(true);
    const kinds = clear.activations.map((a) => a.kind);
    expect(kinds).toContain('colorConvert');
    expect(kinds.filter((k) => k === 'lineH' || k === 'lineV').length).toBeGreaterThan(1);
  });

  it('rainbow + rainbow clears the entire board', () => {
    const g = makeGame(grid(5, 5, { '2,2': 'R', '2,3': 'R' }));
    const total = countTiles(g, () => true);
    const clear = firstClear(g.trySwap(idx(g, 2, 2), idx(g, 2, 3))!.phases);
    expect(clear.pops).toHaveLength(total);
  });

  it('cupid homes in on the remaining jelly', () => {
    const g = makeGame(grid(7, 7, { '3,3': '0u', '3,4': '1u', '6,0': '2J' }), {
      goals: [{ type: 'jelly', count: 2 }],
    });
    const clear = firstClear(g.trySwap(idx(g, 3, 3), idx(g, 3, 4))!.phases);
    const cupids = clear.activations.filter((a) => a.kind === 'cupid');
    expect(cupids).toHaveLength(3);
    expect(cupids.map((c) => c.to)).toContain(idx(g, 6, 0));
  });

  it('cupid + line carries the blaster to its target', () => {
    const g = makeGame(grid(7, 7, { '3,3': '0u', '3,4': '1h', '6,6': '2j' }), {
      goals: [{ type: 'jelly', count: 1 }],
    });
    const clear = firstClear(g.trySwap(idx(g, 3, 3), idx(g, 3, 4))!.phases);
    const cupid = clear.activations.find((a) => a.kind === 'cupid')!;
    expect(cupid.to).toBe(idx(g, 6, 6));
    expect(cupid.carry).toBe('lineH');
    const line = clear.activations.find((a) => a.kind === 'lineH')!;
    expect(line.cell).toBe(idx(g, 6, 6));
  });

  it('special + special swap is always legal even without a match', () => {
    const g = makeGame(grid(5, 5, { '0,0': '1m', '0,1': '2u' }));
    expect(g.canSwap(0, 1)).toBe(true);
  });
});

describe('gravity', () => {
  it('refills every hole and leaves no matches after a turn', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = makeGame(grid(8, 8, { '2,0': '0h', '2,1': '0', '1,2': '0' }), { seed });
      g.trySwap(idx(g, 1, 2), idx(g, 2, 2));
      expect(emptyOpenCells(g)).toEqual([]);
      expect(findMatches(g.board)).toEqual([]);
    }
  });

  it('existing tiles fall straight down into the gap', () => {
    const g = makeGame(grid(5, 5, { '2,0': '0', '2,1': '0', '1,2': '0' }));
    const above = g.board.cells[idx(g, 1, 0)].tile!.id;
    const res = g.trySwap(idx(g, 1, 2), idx(g, 2, 2))!;
    const fall = res.phases.find((p) => p.type === 'fall') as FallPhase;
    const path = fall.paths.find((p) => p.id === above)!;
    expect(path.steps[0].cell).toBe(idx(g, 1, 0));
    expect(path.steps[path.steps.length - 1].cell).toBe(idx(g, 2, 0));
    expect(fall.paths.filter((p) => p.spawnTick >= 0)).toHaveLength(3);
  });

  it('upward gravity makes tiles float up', () => {
    const g = makeGame(grid(5, 5, { '2,0': '0', '2,1': '0', '3,2': '0' }), { gravity: 'up' });
    const res = g.trySwap(idx(g, 3, 2), idx(g, 2, 2))!;
    const fall = res.phases.find((p) => p.type === 'fall') as FallPhase;
    for (const p of fall.paths) {
      const rows = p.steps.map((s) => g.board.row(s.cell));
      for (let k = 1; k < rows.length; k++) expect(rows[k]).toBeLessThanOrEqual(rows[k - 1]);
    }
    expect(emptyOpenCells(g)).toEqual([]);
  });

  it('tiles slide diagonally to fill cells shadowed by a blocker', () => {
    const g = makeGame(grid(5, 5, { '0,2': '#2', '2,1': '0', '2,3': '0', '1,2': '0' }));
    g.trySwap(idx(g, 1, 2), idx(g, 2, 2));
    expect(g.board.cells[idx(g, 0, 2)].blocker).not.toBeNull();
    expect(emptyOpenCells(g)).toEqual([]);
  });

  it('tunnels through void gaps in a column', () => {
    const g = makeGame(['1 2 3', '. . .', '3 4 5', '0 0 4', '5 1 0']);
    g.trySwap(idx(g, 4, 2), idx(g, 3, 2));
    expect(emptyOpenCells(g)).toEqual([]);
  });

  it('portals carry tiles from one side of a split board to the other', () => {
    const g = makeGame(['1 . 0', '2 . 0', '3 . 5', '4 . 0'], {
      portals: [[3 * 3 + 0, 0 * 3 + 2]],
    });
    const leftBottom = g.board.cells[idx(g, 3, 0)].tile!.id;
    const res = g.trySwap(idx(g, 2, 2), idx(g, 3, 2))!;
    const fall = res.phases.find((p) => p.type === 'fall') as FallPhase;
    const path = fall.paths.find((p) => p.id === leftBottom)!;
    const cells = path.steps.map((s) => s.cell);
    const k = cells.indexOf(idx(g, 3, 0));
    expect(cells[k + 1]).toBe(idx(g, 0, 2));
    expect(g.board.flow.spawners).toEqual([idx(g, 0, 0)]);
    expect(emptyOpenCells(g)).toEqual([]);
  });
});

describe('obstacles & goals', () => {
  it('matches clear jelly underneath', () => {
    const g = makeGame(grid(5, 5, { '2,0': '0j', '2,1': '0J', '1,2': '0' }), {
      goals: [{ type: 'jelly', count: 3 }],
    });
    expect(g.jellyTotal).toBe(3);
    const res = g.trySwap(idx(g, 1, 2), idx(g, 2, 2))!;
    expect(firstClear(res.phases).jelly).toHaveLength(2);
    expect(g.board.cells[idx(g, 2, 0)].jelly).toBe(0);
    expect(g.board.cells[idx(g, 2, 1)].jelly).toBe(1);
    expect(g.jellyCleared).toBeGreaterThanOrEqual(2);
  });

  it('adjacent matches break gift boxes and collect the gift', () => {
    const g = makeGame(grid(5, 5, { '3,1': '#g', '2,0': '0', '2,1': '0', '1,2': '0' }), {
      goals: [{ type: 'gift', count: 1 }],
    });
    g.trySwap(idx(g, 1, 2), idx(g, 2, 2));
    expect(g.giftsCollected).toBe(1);
    expect(g.status).toBe('won');
  });

  it('a 2-hp box survives a single adjacent match', () => {
    const g = makeGame(grid(5, 5, { '3,1': '#2', '2,0': '0', '2,1': '0', '1,2': '0' }));
    g.trySwap(idx(g, 1, 2), idx(g, 2, 2));
    expect(g.board.cells[idx(g, 3, 1)].blocker?.hp).toBe(1);
  });

  it('chocolate spreads when the player ignores it', () => {
    const g = makeGame(grid(6, 6, { '5,5': 'C', '2,0': '0', '2,1': '0', '1,2': '0' }), {
      goals: [{ type: 'choco', count: 1 }],
    });
    const res = g.trySwap(idx(g, 1, 2), idx(g, 2, 2))!;
    expect(res.stats.chocoSpread).toBe(true);
    expect(g.board.cells.filter((c) => c.blocker?.type === 'choco')).toHaveLength(2);
    expect(res.phases.some((p) => p.type === 'spread')).toBe(true);
  });

  it('destroying chocolate stops it spreading that turn', () => {
    const g = makeGame(grid(6, 6, { '3,0': 'C', '2,0': '0', '2,1': '0', '1,2': '0' }), {
      goals: [{ type: 'choco', count: 1 }],
    });
    const res = g.trySwap(idx(g, 1, 2), idx(g, 2, 2))!;
    expect(res.stats.chocoSpread).toBe(false);
    expect(g.chocoDestroyed).toBe(1);
    expect(g.status).toBe('won');
  });

  it('ribbon locks break but keep the gem in place', () => {
    const g = makeGame(grid(5, 5, { '2,0': '0l', '2,1': '0', '1,2': '0' }));
    const lockedId = g.board.cells[idx(g, 2, 0)].tile!.id;
    const res = g.trySwap(idx(g, 1, 2), idx(g, 2, 2))!;
    expect(firstClear(res.phases).locks).toHaveLength(1);
    expect(g.board.cells[idx(g, 2, 0)].lock).toBe(0);
    expect(g.board.cells[idx(g, 2, 0)].tile?.id).toBe(lockedId);
  });

  it('drop items are collected when they reach the bottom', () => {
    const g = makeGame(grid(5, 5, { '3,0': 'I', '4,0': '0', '4,1': '0', '3,2': '0' }), {
      goals: [{ type: 'drop', count: 1 }],
      items: { type: 'ring', total: 1, maxOnBoard: 1 },
    });
    const res = g.trySwap(idx(g, 3, 2), idx(g, 4, 2))!;
    expect(res.phases.some((p) => p.type === 'collect')).toBe(true);
    expect(g.itemsCollected).toBe(1);
    expect(g.status).toBe('won');
  });

  it('items are immune to blasts', () => {
    const g = makeGame(grid(5, 5, { '2,4': 'I', '2,0': '0h', '2,1': '0', '1,2': '0' }), {
      items: { type: 'ring', total: 1, maxOnBoard: 1 },
    });
    g.trySwap(idx(g, 1, 2), idx(g, 2, 2));
    expect(countTiles(g, (t) => !!t.item) + g.itemsCollected).toBe(1);
  });

  it('collect goals count the right color', () => {
    const g = makeGame(grid(5, 5, { '2,0': '0', '2,1': '0', '1,2': '0' }), {
      goals: [{ type: 'collect', color: 0, count: 3 }],
    });
    g.trySwap(idx(g, 1, 2), idx(g, 2, 2));
    expect(g.collected[0]).toBeGreaterThanOrEqual(3);
    expect(g.goalStates()[0].done).toBe(true);
    expect(g.status).toBe('won');
  });

  it('loses when moves run out', () => {
    const g = makeGame(grid(5, 5, { '2,0': '0', '2,1': '0', '1,2': '0' }), { moves: 1 });
    g.trySwap(idx(g, 1, 2), idx(g, 2, 2));
    expect(g.movesLeft).toBe(0);
    expect(g.status).toBe('lost');
    expect(g.trySwap(0, 1)).toBeNull();
    g.addMoves(5);
    expect(g.status).toBe('playing');
    expect(g.movesLeft).toBe(5);
  });

  it('progress reports partial completion for the near-miss screen', () => {
    const g = makeGame(grid(5, 5, { '2,0': '0', '2,1': '0', '1,2': '0' }), {
      goals: [{ type: 'collect', color: 0, count: 6 }],
    });
    expect(g.progress()).toBe(0);
    g.trySwap(idx(g, 1, 2), idx(g, 2, 2));
    expect(g.progress()).toBeGreaterThanOrEqual(0.5);
  });
});

describe('turn lifecycle', () => {
  it('shuffle always leaves a playable board without matches', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const g = makeGame(grid(6, 6), { seed });
      g.shuffle();
      expect(findMatches(g.board)).toEqual([]);
      expect(g.hasValidMove()).toBe(true);
    }
  });

  it('love rush converts spare moves into points after a win', () => {
    const g = makeGame(grid(7, 7, { '2,0': '0', '2,1': '0', '1,2': '0' }), {
      goals: [{ type: 'collect', color: 0, count: 3 }],
      moves: 10,
    });
    g.trySwap(idx(g, 1, 2), idx(g, 2, 2));
    expect(g.status).toBe('won');
    const before = g.score;
    const rush = g.loveRush()!;
    expect(rush.phases.length).toBeGreaterThan(0);
    expect(g.score).toBeGreaterThan(before);
    expect(g.movesLeft).toBe(0);
    expect(countTiles(g, (t) => t.special !== 'none')).toBe(0);
  });

  it('clones are independent (used by the AI bot)', () => {
    const g = makeGame(grid(5, 5, { '2,0': '0', '2,1': '0', '1,2': '0' }));
    const snapshot = g.board.toString();
    const c = g.clone(7);
    c.trySwap(idx(g, 1, 2), idx(g, 2, 2));
    expect(g.board.toString()).toBe(snapshot);
    expect(g.movesLeft).toBe(20);
    expect(c.movesLeft).toBe(19);
  });

  it('the same seed replays identically', () => {
    const run = () => {
      const g = makeGame(grid(7, 7, { '2,0': '0h', '2,1': '0', '1,2': '0' }), { seed: 99 });
      g.trySwap(idx(g, 1, 2), idx(g, 2, 2));
      return g.board.toString() + g.score;
    };
    expect(run()).toBe(run());
  });
});

import { Rng, hashSeed } from '../core/rng';
import type { Goal, GoalType, Gravity, ItemType, LevelDef, Tier } from '../core/types';
import { tierFor } from './difficulty';
import { SHAPES, shapeByName, type Shape } from './shapes';

export const CHAPTER_SIZE = 20;
export const THEME_COUNT = 10;

/** Level at which each mechanic is introduced. */
export const UNLOCK = {
  collect: 2,
  jelly: 4,
  gift: 8,
  drop: 9,
  box: 12,
  lock: 15,
  timed: 20,
  choco: 23,
  doubleJelly: 30,
  gravity: 41,
  secondGoal: 60,
  sideGravity: 81,
  sixColors: 30,
} as const;

type Grid = string[][];

/** Featured objective per block of five levels (score runs come from bosses & relief levels). */
const ROTATION: GoalType[] = ['jelly', 'collect', 'drop', 'gift', 'jelly', 'choco', 'collect', 'gift', 'drop', 'jelly', 'collect', 'choco'];

const GOAL_UNLOCK: Record<GoalType, number> = {
  score: 1,
  collect: UNLOCK.collect,
  jelly: UNLOCK.jelly,
  gift: UNLOCK.gift,
  drop: UNLOCK.drop,
  choco: UNLOCK.choco,
};

const LUCK: Record<Tier, number> = { tutorial: 0.15, relief: 0.22, easy: 0.08, medium: 0.02, hard: 0, boss: 0.05 };

function gridOf(shape: Shape): Grid {
  return shape.rows.map((row) => row.split('').map((ch) => (ch === '#' ? 'o' : '.')));
}

const rowsOf = (g: Grid) => g.length;
const colsOf = (g: Grid) => g[0].length;

function cellsWhere(g: Grid, pred: (r: number, c: number, ch: string) => boolean): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < rowsOf(g); r++) for (let c = 0; c < colsOf(g); c++) if (pred(r, c, g[r][c])) out.push([r, c]);
  return out;
}

/** Set a cell and its mirror twin (keeps boards symmetric = looks hand-designed). */
function setSym(g: Grid, r: number, c: number, ch: string, only = 'o'): number {
  let n = 0;
  for (const cc of new Set([c, colsOf(g) - 1 - c])) {
    if (only.includes(g[r][cc])) {
      g[r][cc] = ch;
      n++;
    }
  }
  return n;
}

/** Pick up to `count` symmetric cells on the left half matching pred, return how many cells were set. */
function scatterSym(g: Grid, rng: Rng, count: number, ch: string, pred: (r: number, c: number) => boolean): number {
  const half = Math.ceil(colsOf(g) / 2);
  const cands = rng.shuffle(cellsWhere(g, (r, c, x) => x === 'o' && c < half && pred(r, c)));
  let placed = 0;
  for (const [r, c] of cands) {
    if (placed >= count) break;
    placed += setSym(g, r, c, ch);
  }
  return placed;
}

function isEdge(g: Grid, r: number, c: number): boolean {
  for (const [dr, dc] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]) {
    const rr = r + dr;
    const cc = c + dc;
    if (rr < 0 || cc < 0 || rr >= rowsOf(g) || cc >= colsOf(g) || g[rr][cc] === '.') return true;
  }
  return false;
}

const HEART_STAMP = ['.#.#.', '#####', '#####', '.###.', '..#..'];

function placeJelly(g: Grid, rng: Rng, pattern: string, double: number): number {
  const R = rowsOf(g);
  const C = colsOf(g);
  const cr = (R - 1) / 2;
  const cc = (C - 1) / 2;
  const radius = 2.2 + rng.next() * 1.4;
  const stampR = Math.floor((R - HEART_STAMP.length) / 2);
  const stampC = Math.floor((C - HEART_STAMP[0].length) / 2);
  const want = (r: number, c: number): boolean => {
    switch (pattern) {
      case 'all':
        return true;
      case 'bottom':
        return r >= Math.floor(R / 2);
      case 'top':
        return r < Math.ceil(R / 2);
      case 'center':
        return Math.hypot(r - cr, c - cc) <= radius;
      case 'ring':
        return isEdge(g, r, c);
      case 'checker':
        return (r + c) % 2 === 0;
      case 'heart': {
        const sr = r - stampR;
        const sc = c - stampC;
        return sr >= 0 && sc >= 0 && sr < HEART_STAMP.length && sc < HEART_STAMP[0].length && HEART_STAMP[sr][sc] === '#';
      }
      case 'cross':
        return Math.abs(r - cr) < 1 || Math.abs(c - cc) < 1;
      default:
        return Math.abs(c - cc) >= 2.5;
    }
  };
  let layers = 0;
  for (const [r, c] of cellsWhere(g, (r, c, ch) => ch === 'o' && want(r, c))) {
    const dbl = rng.chance(double);
    g[r][c] = dbl ? 'J' : 'j';
    layers += dbl ? 2 : 1;
  }
  if (layers === 0) {
    for (const [r, c] of cellsWhere(g, (_r, _c, ch) => ch === 'o')) {
      g[r][c] = 'j';
      layers++;
    }
  }
  return layers;
}

/** Left-half column k (bottom cell) feeds right-half column k (top cell). */
function splitPortals(g: Grid): [number, number][] {
  const C = colsOf(g);
  const R = rowsOf(g);
  const left: number[] = [];
  const right: number[] = [];
  for (let c = 0; c < C; c++) {
    if (g[0][c] === '.') continue;
    (c < C / 2 ? left : right).push(c);
  }
  return left.slice(0, right.length).map((c, k) => [(R - 1) * C + c, right[k]] as [number, number]);
}

function pickShape(n: number, tier: Tier, goal: GoalType, rng: Rng): Shape {
  if (n % 100 === 14) return shapeByName('heart');
  const avail = SHAPES.filter((s) => s.from <= n && !(s.split && goal === 'choco'));
  const weights = avail.map((s) => {
    switch (tier) {
      case 'relief':
      case 'boss':
        return Math.pow(1 - s.hardness, 4);
      case 'easy':
        return Math.pow(1 - s.hardness, 1.5);
      case 'hard':
        return 0.15 + s.hardness;
      default:
        return 1;
    }
  });
  return rng.weighted(avail, weights);
}

function pickObjective(n: number, tier: Tier, rng: Rng): GoalType {
  if (tier === 'boss') return 'score';
  const unlocked = (t: GoalType) => GOAL_UNLOCK[t] <= n;
  const block = Math.floor((n - 11) / 5);
  let featured = ROTATION[block % ROTATION.length];
  if (!unlocked(featured)) featured = 'jelly';
  if (rng.chance(0.3)) {
    const others = (Object.keys(GOAL_UNLOCK) as GoalType[]).filter((t) => unlocked(t) && t !== featured);
    featured = rng.pick(others);
  }
  if (tier === 'relief' && (featured === 'choco' || featured === 'drop' || rng.chance(0.3)))
    featured = rng.pick(['jelly', 'collect', 'score'] as GoalType[]);
  return featured;
}

function provisionalMoves(goals: Goal[], tier: Tier): number {
  let m = 0;
  for (const g of goals) {
    switch (g.type) {
      case 'jelly':
        m += g.count / 3.2 + 6;
        break;
      case 'collect':
        m += g.count / 3.5 + 4;
        break;
      case 'drop':
        m += g.count * 6 + 6;
        break;
      case 'gift':
        m += g.count * 2.5 + 8;
        break;
      case 'choco':
        m += 18;
        break;
      case 'score':
        m += 22;
        break;
    }
  }
  if (tier === 'relief' || tier === 'tutorial') m += 4;
  if (tier === 'hard') m -= 2;
  return Math.max(12, Math.min(45, Math.round(m)));
}

interface Build {
  grid: Grid;
  goals: Goal[];
  colors: number;
  gravity: Gravity;
  portals?: [number, number][];
  items?: LevelDef['items'];
  time?: number;
}

function finish(n: number, salt: number, tier: Tier, b: Build): LevelDef {
  const moves = provisionalMoves(b.goals, tier);
  return {
    id: n,
    rows: rowsOf(b.grid),
    cols: colsOf(b.grid),
    layout: b.grid.map((row) => row.join('')),
    colors: b.colors,
    moves,
    time: b.time,
    goals: b.goals,
    gravity: b.gravity,
    portals: b.portals,
    items: b.items,
    luck: LUCK[tier],
    tier,
    theme: Math.floor((n - 1) / CHAPTER_SIZE) % THEME_COUNT,
    stars: [1, moves * 300, moves * 550],
    seed: hashSeed(n, salt, 0x10e),
    tutorial: n <= 10 ? n : undefined,
  };
}

function addCollect(goals: Goal[], rng: Rng, colors: number, kinds: number, perColor: number): void {
  const palette = rng.shuffle(Array.from({ length: colors }, (_, k) => k));
  for (let k = 0; k < kinds; k++) goals.push({ type: 'collect', color: palette[k], count: perColor });
}

function addItems(g: Grid, rng: Rng, n: number, total: number, gravity: Gravity): LevelDef['items'] {
  const type: ItemType = n % 2 === 0 ? 'letter' : 'ring';
  // Put the first item near the "top" (opposite to gravity) so it has a journey to make.
  const R = rowsOf(g);
  const C = colsOf(g);
  const rowsOrder =
    gravity === 'up' ? Array.from({ length: R }, (_, r) => R - 1 - r) : Array.from({ length: R }, (_, r) => r);
  outer: for (const r of rowsOrder.slice(0, 3)) {
    const cs = rng.shuffle(Array.from({ length: C }, (_, c) => c));
    for (const c of cs) {
      if (g[r][c] === 'o') {
        g[r][c] = 'i';
        break outer;
      }
    }
  }
  return { type, total, maxOnBoard: 2 };
}

// ───────────────────────────── tutorial levels ─────────────────────────────

function tutorial(n: number, salt: number): LevelDef {
  const rng = new Rng(hashSeed(n, salt, 7));
  const sq8 = gridOf(shapeByName('square8'));
  const big = gridOf(shapeByName('tall8'));
  const tier: Tier = 'tutorial';
  const base = { colors: 5, gravity: 'down' as Gravity };
  switch (n) {
    case 1:
      return finish(n, salt, tier, {
        ...base,
        grid: sq8,
        goals: [{ type: 'score', target: 1500 }],
      });
    case 2:
      return finish(n, salt, tier, {
        ...base,
        grid: sq8,
        goals: [
          { type: 'collect', color: 0, count: 30 },
          { type: 'collect', color: 3, count: 30 },
        ],
      });
    case 3:
      return finish(n, salt, tier, {
        ...base,
        grid: sq8,
        goals: [{ type: 'collect', color: 1, count: 30 }],
      });
    case 4: {
      const g = big;
      const layers = placeJelly(g, rng, 'bottom', 0);
      return finish(n, salt, tier, {
        ...base,
        grid: g,
        goals: [{ type: 'jelly', count: layers }],
      });
    }
    case 5:
      return finish(n, salt, tier, {
        ...base,
        grid: sq8,
        goals: [{ type: 'collect', color: 2, count: 30 }],
      });
    case 6: {
      const g = gridOf(shapeByName('circle'));
      const layers = placeJelly(g, rng, 'all', 0);
      return finish(n, salt, tier, {
        ...base,
        grid: g,
        goals: [{ type: 'jelly', count: layers }],
      });
    }
    case 7:
      return finish(n, salt, tier, {
        ...base,
        grid: big,
        goals: [{ type: 'score', target: 4000 }],
      });
    case 8: {
      const g = sq8;
      let gifts = 0;
      for (const c of [1, 3]) gifts += setSym(g, 4, c, 'g');
      for (const c of [0, 2]) gifts += setSym(g, 6, c, 'g');
      return finish(n, salt, tier, {
        ...base,
        grid: g,
        goals: [{ type: 'gift', count: gifts }],
      });
    }
    case 9: {
      const g = sq8;
      const items = addItems(g, rng, n, 2, 'down');
      return finish(n, salt, tier, {
        ...base,
        grid: g,
        goals: [{ type: 'drop', count: 2 }],
        items,
      });
    }
    default: {
      const g = big;
      g[4][3] = 'h';
      g[4][4] = 'm';
      const layers = placeJelly(g, rng, 'heart', 0);
      return finish(n, salt, tier, {
        ...base,
        colors: 6,
        grid: g,
        goals: [
          { type: 'jelly', count: layers },
          { type: 'collect', color: 4, count: 35 },
        ],
      });
    }
  }
}

// ───────────────────────────── generated levels ─────────────────────────────

/** Deterministically builds level `n`. `salt` lets the calibrator re-roll an unfair layout. */
export function generateLevel(n: number, salt = 0): LevelDef {
  if (n <= 10) return tutorial(n, salt);
  const rng = new Rng(hashSeed(n, salt, 0x5eed));
  const tier = tierFor(n);
  const late = Math.min(1, n / 400);
  const goalType = pickObjective(n, tier, rng);
  const shape = pickShape(n, tier, goalType, rng);
  const g = gridOf(shape);
  const R = rowsOf(g);
  const isHard = tier === 'hard';
  const isMedium = tier === 'medium';

  let gravity: Gravity = 'down';
  let portals: [number, number][] | undefined;
  if (shape.split) portals = splitPortals(g);
  else if (n >= UNLOCK.gravity && (isMedium || isHard) && rng.chance(0.15)) {
    gravity = n >= UNLOCK.sideGravity && rng.chance(0.4) ? rng.pick(['left', 'right'] as Gravity[]) : 'up';
  }

  // 6 colors ≈ 13 gems cleared per move (calm, strategic); 5 colors ≈ 27 (fireworks).
  let colors = 6;
  if (tier === 'relief' || tier === 'boss') colors = 5;
  else if (tier === 'easy' && n < UNLOCK.sixColors) colors = 5;

  const goals: Goal[] = [];
  let items: LevelDef['items'];
  let time: number | undefined;

  switch (goalType) {
    case 'score':
      goals.push({ type: 'score', target: 0 });
      if (tier === 'boss') time = 60;
      break;
    case 'collect': {
      // Each color is cleared at ~1.9/move with 6 colors and ~4.5/move with 5, in parallel.
      const kinds = rng.range(1, n > 40 ? 3 : 2);
      const rate = colors === 5 ? 4.5 : 1.9;
      const wantMoves = 17 + rng.int(9);
      const per = Math.round((rate * wantMoves * (kinds === 1 ? 1 : 0.85)) / 5) * 5;
      addCollect(goals, rng, colors, kinds, per);
      break;
    }
    case 'jelly': {
      const patterns = ['all', 'bottom', 'top', 'center', 'ring', 'checker', 'heart', 'cross', 'sides'];
      const pattern = tier === 'relief' ? rng.pick(['all', 'checker', 'bottom', 'top']) : rng.pick(patterns);
      const dbl = n >= UNLOCK.doubleJelly ? (isHard ? 0.6 : isMedium ? 0.3 : 0.1) * (0.5 + late) : 0;
      goals.push({ type: 'jelly', count: placeJelly(g, rng, pattern, Math.min(0.9, dbl)) });
      break;
    }
    case 'gift': {
      const count = isHard ? rng.range(8, 12) : isMedium ? rng.range(6, 10) : rng.range(5, 8);
      const ch = isHard || (isMedium && rng.chance(0.5)) ? 'G' : 'g';
      const placed = scatterSym(g, rng, count, ch, (r) => r >= 2);
      goals.push({ type: 'gift', count: Math.max(1, placed) });
      break;
    }
    case 'drop': {
      const total = Math.min(4, 2 + Math.floor(late * 3) + (isHard ? 1 : 0));
      items = addItems(g, rng, n, total, gravity);
      goals.push({ type: 'drop', count: total });
      break;
    }
    case 'choco': {
      const count = isHard ? rng.range(9, 14) : rng.range(6, 10);
      const nearSink = (r: number) => (gravity === 'up' ? r <= 3 : r >= R - 4);
      scatterSym(g, rng, count, 'c', nearSink);
      goals.push({ type: 'choco', count });
      break;
    }
  }

  // Second objective keeps late levels from feeling samey.
  if (n >= UNLOCK.secondGoal && (isMedium || isHard) && goalType !== 'score' && rng.chance(0.3)) {
    if (goalType !== 'collect') addCollect(goals, rng, colors, 1, 14 + rng.int(12));
    else goals.push({ type: 'jelly', count: placeJelly(g, rng, 'center', 0.2) });
  }

  // Friction obstacles.
  if (n >= UNLOCK.box && (isHard || (isMedium && rng.chance(0.5))) && goalType !== 'gift') {
    const hp = n > 150 && isHard ? 'X' : n > 60 ? 'B' : 'b';
    scatterSym(g, rng, rng.range(2, isHard ? 8 : 4), hp, (r) => r >= 2 && r < R - 1);
  }
  if (n >= UNLOCK.lock && (isHard || isMedium) && rng.chance(0.55)) {
    const k = rng.range(2, isHard ? 10 : 6);
    const half = Math.ceil(colsOf(g) / 2);
    const cands = rng.shuffle(cellsWhere(g, (_r, c, ch) => (ch === 'o' || ch === 'j') && c < half));
    let placed = 0;
    for (const [r, c] of cands) {
      if (placed >= k) break;
      const ch = g[r][c] === 'j' ? 'L' : 'l';
      placed += setSym(g, r, c, ch, g[r][c]);
    }
  }
  if (n >= UNLOCK.choco && isHard && goalType !== 'choco' && goalType !== 'drop' && rng.chance(0.35)) {
    scatterSym(g, rng, 1, 'c', (r) => (gravity === 'up' ? r === 0 : r === R - 1));
  }

  return finish(n, salt, tier, { grid: g, goals, colors, gravity, portals, items, time });
}

/** Static sanity checks; returns a list of problems (empty = OK). */
export function validateLevel(level: LevelDef): string[] {
  const issues: string[] = [];
  const cells = level.layout.join('');
  if (level.layout.length !== level.rows) issues.push('row count');
  if (level.layout.some((r) => r.length !== level.cols)) issues.push('col count');
  const playable = cells.replace(/\./g, '').length;
  if (playable < 30) issues.push(`only ${playable} playable cells`);
  if (level.colors < 3 || level.colors > 6) issues.push('colors');
  if (!level.goals.length) issues.push('no goals');
  const count = (re: RegExp) => (cells.match(re) ?? []).length;
  for (const goal of level.goals) {
    switch (goal.type) {
      case 'jelly': {
        const layers = count(/[jL]/g) + 2 * count(/J/g);
        if (layers <= 0) issues.push('jelly goal without jelly');
        break;
      }
      case 'gift':
        if (count(/[gG]/g) !== goal.count) issues.push(`gift count ${count(/[gG]/g)} != ${goal.count}`);
        break;
      case 'choco':
        if (count(/c/g) === 0) issues.push('choco goal without chocolate');
        break;
      case 'drop':
        if (!level.items || level.items.total !== goal.count) issues.push('drop goal without items');
        break;
      case 'collect':
        if (goal.color >= level.colors || goal.count <= 0) issues.push('bad collect goal');
        break;
      case 'score':
        break;
    }
  }
  if (level.time !== undefined && level.time <= 0) issues.push('time');
  if (level.moves <= 0) issues.push('moves');
  return issues;
}

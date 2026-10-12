import type { Flow } from '../core/board';
import { Game } from '../core/game';
import { Rng } from '../core/rng';
import type { LevelDef, Move } from '../core/types';

/**
 * Greedy look-ahead bot: tries every legal swap on a clone (with an independent RNG so it
 * can't peek at future refills), scores the outcome by goal progress + specials made, and
 * plays the best one with a little human-like noise.
 */

const distCache = new WeakMap<Flow, Int16Array>();

/** Steps each cell is away from an exit (for drop items). */
function exitDistance(game: Game): Int16Array {
  const flow = game.board.flow;
  let d = distCache.get(flow);
  if (d) return d;
  const n = game.board.cells.length;
  d = new Int16Array(n).fill(99);
  for (let i = 0; i < n; i++) {
    if (!game.board.cells[i].playable) continue;
    let k = 0;
    let cur = i;
    while (flow.down[cur] >= 0 && k < 99) {
      cur = flow.down[cur];
      k++;
    }
    d[i] = k;
  }
  distCache.set(flow, d);
  return d;
}

function itemDistance(game: Game): number {
  const d = exitDistance(game);
  let s = 0;
  game.board.cells.forEach((c, i) => {
    if (c.tile?.item) s += d[i];
  });
  return s;
}

export function evaluateMove(game: Game, move: Move, seed: number): number {
  const sim = game.clone(seed);
  const res = sim.trySwap(move.a, move.b);
  if (!res) return -Infinity;
  if (sim.status === 'won') return 1e6 - sim.movesMade;
  const before = game.goalStates();
  const after = sim.goalStates();
  let v = 0;
  for (let k = 0; k < before.length; k++) {
    const b = before[k];
    const a = after[k];
    if (b.done) continue;
    if (b.goal.type === 'choco') {
      const rb = b.target - b.current;
      const ra = a.target - a.current;
      v += ((rb - ra) / Math.max(1, rb)) * 1000;
    } else if (b.goal.type === 'score') {
      v += (Math.min(a.current, a.target) - b.current) / Math.max(1, b.target) * 1000;
    } else {
      v += ((Math.min(a.current, a.target) - Math.min(b.current, b.target)) / Math.max(1, b.target)) * 1000;
    }
  }
  const c = res.stats.created;
  v += c.rainbow * 260 + c.bomb * 130 + (c.lineH + c.lineV) * 95 + c.cupid * 75;
  v += res.stats.scoreGained * 0.015;
  if (res.stats.chocoSpread) v -= 60;
  if (game.level.items) v += (itemDistance(game) - itemDistance(sim)) * 45;
  return v;
}

export function chooseMove(game: Game, rng: Rng, epsilon = 0.08): Move | null {
  const moves = game.validMoves();
  if (!moves.length) return null;
  const seed = (rng.next() * 2 ** 31) | 0;
  const scored = moves.map((m) => ({ m, v: evaluateMove(game, m, seed) + rng.next() * 8 }));
  scored.sort((x, y) => y.v - x.v);
  if (scored[0].v >= 1e5) return scored[0].m;
  if (rng.chance(epsilon)) return scored[rng.int(Math.min(3, scored.length))].m;
  return scored[0].m;
}

export interface RunResult {
  won: boolean;
  /** Moves used (== moves needed to win when `won`). */
  moves: number;
  score: number;
  /** Score after the love rush (only meaningful when won). */
  finalScore: number;
}

export interface RunOptions {
  /** Hard cap on moves for the run. */
  maxMoves: number;
  /** Override the score goal target (Infinity = never finish, to sample score after N moves). */
  scoreTarget?: number;
  /** Play the end-of-level love rush when winning (for star thresholds). */
  rush?: boolean;
  epsilon?: number;
}

export function playLevel(level: LevelDef, seed: number, opts: RunOptions): RunResult {
  const lvl: LevelDef = {
    ...level,
    moves: opts.maxMoves,
    time: level.time ? 1e9 : undefined,
    goals:
      opts.scoreTarget !== undefined
        ? level.goals.map((g) => (g.type === 'score' ? { ...g, target: opts.scoreTarget! } : g))
        : level.goals,
  };
  const game = new Game(lvl, { seed, record: false });
  const rng = new Rng(seed ^ 0x5bd1e995);
  while (game.status === 'playing' && game.movesMade < opts.maxMoves) {
    const m = chooseMove(game, rng, opts.epsilon);
    if (!m) break;
    game.trySwap(m.a, m.b);
  }
  const won = game.status === 'won';
  const score = game.score;
  if (won && opts.rush) {
    // Timed levels: pretend the spare time equals the spare moves.
    if (level.time) game.timeLeft = Math.max(0, opts.maxMoves - game.movesMade) * 4;
    game.loveRush();
  }
  return { won, moves: game.movesMade, score, finalScore: game.score };
}

/** Best hint for the player: the bot's top move without noise. */
export function bestMove(game: Game): Move | null {
  return chooseMove(game, new Rng(game.movesMade + 1), 0);
}

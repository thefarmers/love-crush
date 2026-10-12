import { Board } from './board';
import type {
  ActivationEvent,
  ActivationKind,
  ClearPhase,
  CollectPhase,
  FallPath,
  FallPhase,
  Phase,
  ShufflePhase,
  SpreadPhase,
  TurnResult,
  TurnStats,
} from './events';
import { findMatches, hasMatchAt, type MatchGroup } from './match';
import { Rng } from './rng';
import type { Goal, LevelDef, Move, Special, Tile } from './types';

export type GameStatus = 'playing' | 'won' | 'lost';

export interface GoalState {
  goal: Goal;
  current: number;
  target: number;
  done: boolean;
}

export interface GameOptions {
  seed: number;
  /** Record animation events (off for bot simulations: much faster). */
  record?: boolean;
  /** Fill the board with random gems (tests turn this off and place tiles by hand). */
  fill?: boolean;
}

export const SCORE = {
  gem: 20,
  special: 60,
  jelly: 30,
  lock: 20,
  boxHit: 40,
  boxBreak: 60,
  gift: 500,
  choco: 50,
  item: 1000,
  rushPerMove: 150,
  create: { none: 0, lineH: 120, lineV: 120, bomb: 200, rainbow: 300, cupid: 100 } as Record<Special, number>,
};

interface Act {
  kind: ActivationKind;
  cell: number;
  t: number;
  color: number;
  carry?: Special;
}

interface ScoreSrc {
  cell: number;
  color: number;
  t: number;
  amount: number;
}

interface Ctx {
  phase: ClearPhase | null;
  cascade: number;
  mult: number;
  jellyHit: Set<number>;
  blockerHit: Set<number>;
  protect: Set<number>;
  cupidTargets: Set<number>;
  queue: Act[];
  srcs: ScoreSrc[];
}

const isLine = (s: Special) => s === 'lineH' || s === 'lineV';

export function isComboPair(a: Tile, b: Tile): boolean {
  if (a.item || b.item) return false;
  if (a.special === 'rainbow' || b.special === 'rainbow') return true;
  return a.special !== 'none' && b.special !== 'none';
}

function emptyStats(): TurnStats {
  return {
    cascades: 0,
    cleared: 0,
    scoreGained: 0,
    created: { none: 0, lineH: 0, lineV: 0, bomb: 0, rainbow: 0, cupid: 0 },
    chocoSpread: false,
    combo: false,
  };
}

export class Game {
  readonly level: LevelDef;
  board: Board;
  rng: Rng;
  record: boolean;
  nextId = 1;
  movesLeft: number;
  timeLeft: number;
  score = 0;
  status: GameStatus = 'playing';
  movesMade = 0;

  collected: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  jellyCleared = 0;
  jellyTotal = 0;
  giftsCollected = 0;
  itemsCollected = 0;
  chocoDestroyed = 0;
  itemsSpawned = 0;
  itemsOnBoard = 0;

  private chocoHitThisTurn = false;
  private stats: TurnStats = emptyStats();

  constructor(level: LevelDef, opts: GameOptions) {
    this.level = level;
    this.rng = new Rng(opts.seed);
    this.record = opts.record ?? true;
    this.board = this.parseLayout(level);
    this.board.computeFlow(level.gravity, level.portals ?? []);
    this.movesLeft = level.time ? Infinity : level.moves;
    this.timeLeft = level.time ?? Infinity;
    for (const c of this.board.cells) this.jellyTotal += c.jelly;
    if (opts.fill !== false) this.fillInitial();
  }

  // ───────────────────────────── setup ─────────────────────────────

  private parseLayout(level: LevelDef): Board {
    const board = new Board(level.rows, level.cols);
    for (let r = 0; r < level.rows; r++) {
      const line = level.layout[r] ?? '';
      for (let c = 0; c < level.cols; c++) {
        const ch = line[c] ?? '.';
        const cell = board.cells[board.idx(r, c)];
        if (ch === '.' || ch === ' ') {
          cell.playable = false;
          continue;
        }
        const gem = (special: Special = 'none'): Tile => ({
          id: this.nextId++,
          color: special === 'rainbow' ? -1 : -2,
          special,
        });
        switch (ch) {
          case 'j':
            cell.jelly = 1;
            cell.tile = gem();
            break;
          case 'J':
            cell.jelly = 2;
            cell.tile = gem();
            break;
          case 'l':
            cell.lock = 1;
            cell.tile = gem();
            break;
          case 'L':
            cell.lock = 1;
            cell.jelly = 1;
            cell.tile = gem();
            break;
          case 'b':
          case 'B':
          case 'X':
            cell.blocker = { type: 'box', hp: ch === 'b' ? 1 : ch === 'B' ? 2 : 3 };
            break;
          case 'g':
          case 'G':
            cell.blocker = { type: 'box', hp: ch === 'g' ? 1 : 2, gift: true };
            break;
          case 'c':
            cell.blocker = { type: 'choco', hp: 1 };
            break;
          case 'i':
            cell.tile = { id: this.nextId++, color: -1, special: 'none', item: level.items?.type ?? 'ring' };
            this.itemsSpawned++;
            this.itemsOnBoard++;
            break;
          case 'r':
            cell.tile = gem('rainbow');
            break;
          case 'h':
            cell.tile = gem('lineH');
            break;
          case 'v':
            cell.tile = gem('lineV');
            break;
          case 'm':
            cell.tile = gem('bomb');
            break;
          case 'u':
            cell.tile = gem('cupid');
            break;
          default:
            cell.tile = gem();
        }
      }
    }
    return board;
  }

  /** Assign colors to placeholder tiles so the starting board has no matches but has moves. */
  private fillInitial(): void {
    const cells = this.board.cells;
    const need: number[] = [];
    for (let i = 0; i < cells.length; i++) if (cells[i].tile?.color === -2) need.push(i);
    const colors = Array.from({ length: this.level.colors }, (_, k) => k);
    for (let attempt = 0; attempt < 60; attempt++) {
      for (const i of need) cells[i].tile!.color = -1;
      for (const i of need) {
        const t = cells[i].tile!;
        for (const k of this.rng.shuffle(colors.slice())) {
          t.color = k;
          if (!hasMatchAt(this.board, i)) break;
        }
      }
      if (findMatches(this.board).length === 0 && this.hasValidMove()) return;
    }
    this.shuffle();
  }

  private newTile(): Tile {
    const items = this.level.items;
    if (items && this.itemsSpawned < items.total && this.itemsOnBoard < items.maxOnBoard) {
      const p = this.itemsOnBoard === 0 ? 0.35 : 0.05;
      if (this.rng.chance(p)) {
        this.itemsSpawned++;
        this.itemsOnBoard++;
        return { id: this.nextId++, color: -1, special: 'none', item: items.type };
      }
    }
    return { id: this.nextId++, color: this.rng.int(this.level.colors), special: 'none' };
  }

  clone(seed: number, record = false): Game {
    const g = Object.create(Game.prototype) as Game;
    Object.assign(g, this);
    g.board = this.board.clone();
    g.rng = new Rng(seed);
    g.record = record;
    g.collected = this.collected.slice();
    g.stats = emptyStats();
    return g;
  }

  // ───────────────────────────── moves ─────────────────────────────

  canSwap(a: number, b: number): boolean {
    const board = this.board;
    if (a < 0 || b < 0 || a >= board.cells.length || b >= board.cells.length) return false;
    if (!board.areAdjacent(a, b) || !board.isMovable(a) || !board.isMovable(b)) return false;
    const ta = board.cells[a].tile!;
    const tb = board.cells[b].tile!;
    if (isComboPair(ta, tb)) return true;
    board.cells[a].tile = tb;
    board.cells[b].tile = ta;
    const ok = hasMatchAt(board, a) || hasMatchAt(board, b);
    board.cells[a].tile = ta;
    board.cells[b].tile = tb;
    return ok;
  }

  validMoves(): Move[] {
    const board = this.board;
    const out: Move[] = [];
    for (let i = 0; i < board.cells.length; i++) {
      if (!board.isMovable(i)) continue;
      const r = board.row(i);
      const c = board.col(i);
      if (c + 1 < board.cols && this.canSwap(i, i + 1)) out.push({ a: i, b: i + 1 });
      if (r + 1 < board.rows && this.canSwap(i, i + board.cols)) out.push({ a: i, b: i + board.cols });
    }
    return out;
  }

  hasValidMove(): boolean {
    const board = this.board;
    for (let i = 0; i < board.cells.length; i++) {
      if (!board.isMovable(i)) continue;
      const r = board.row(i);
      const c = board.col(i);
      if (c + 1 < board.cols && this.canSwap(i, i + 1)) return true;
      if (r + 1 < board.rows && this.canSwap(i, i + board.cols)) return true;
    }
    return false;
  }

  /** Swap two adjacent tiles and resolve the whole turn. Returns null for an illegal swap. */
  trySwap(a: number, b: number): TurnResult | null {
    if (this.status !== 'playing' || !this.canSwap(a, b)) return null;
    this.stats = emptyStats();
    this.chocoHitThisTurn = false;
    const phases: Phase[] = [];
    const cells = this.board.cells;
    const moved = cells[a].tile!;
    const other = cells[b].tile!;
    cells[a].tile = other;
    cells[b].tile = moved;
    if (this.record) phases.push({ type: 'swap', a, b });

    const ctx = this.newCtx(0);
    if (isComboPair(moved, other)) {
      this.stats.combo = true;
      this.runCombo(a, b, ctx);
    } else {
      this.runMatches(findMatches(this.board), ctx, [b, a]);
    }
    this.finishClear(ctx, phases);
    this.cascadeLoop(phases, 0);
    this.endTurn(phases);
    return { phases, stats: this.stats };
  }

  addMoves(n: number): void {
    if (Number.isFinite(this.movesLeft)) this.movesLeft += n;
    else this.timeLeft += n * 3;
    if (this.status === 'lost') this.status = 'playing';
  }

  /** Real-time levels: called by the UI when the clock reaches zero (between turns). */
  timeUp(): void {
    this.timeLeft = 0;
    if (this.status !== 'playing') return;
    this.updateStatus();
    if (this.status === 'playing') this.status = 'lost';
  }

  /** Booster: turn a random plain gem near the center into a special. */
  placeSpecial(special: Special): ClearPhase | null {
    const board = this.board;
    const cands: number[] = [];
    for (let i = 0; i < board.cells.length; i++) {
      const t = board.cells[i].tile;
      if (t && !t.item && t.special === 'none' && board.cells[i].lock === 0) cands.push(i);
    }
    if (!cands.length) return null;
    const cr = (board.rows - 1) / 2;
    const cc = (board.cols - 1) / 2;
    cands.sort(
      (x, y) =>
        Math.hypot(board.row(x) - cr, board.col(x) - cc) - Math.hypot(board.row(y) - cr, board.col(y) - cc),
    );
    const cell = cands[this.rng.int(Math.min(6, cands.length))];
    const t = board.cells[cell].tile!;
    t.special = special;
    if (special === 'rainbow') t.color = -1;
    const ctx = this.newCtx(0);
    ctx.phase?.converts.push({ id: t.id, cell, t: 0, special });
    return ctx.phase;
  }

  // ───────────────────────────── goals ─────────────────────────────

  goalStates(): GoalState[] {
    return this.level.goals.map((goal) => {
      switch (goal.type) {
        case 'score':
          return { goal, current: this.score, target: goal.target, done: this.score >= goal.target };
        case 'collect': {
          const cur = this.collected[goal.color];
          return { goal, current: cur, target: goal.count, done: cur >= goal.count };
        }
        case 'jelly':
          return {
            goal,
            current: this.jellyCleared,
            target: this.jellyTotal,
            done: this.jellyCleared >= this.jellyTotal,
          };
        case 'drop':
          return { goal, current: this.itemsCollected, target: goal.count, done: this.itemsCollected >= goal.count };
        case 'gift':
          return {
            goal,
            current: this.giftsCollected,
            target: goal.count,
            done: this.giftsCollected >= goal.count,
          };
        case 'choco': {
          let remaining = 0;
          for (const c of this.board.cells) if (c.blocker?.type === 'choco') remaining++;
          return {
            goal,
            current: this.chocoDestroyed,
            target: this.chocoDestroyed + remaining,
            done: remaining === 0,
          };
        }
      }
    });
  }

  /** 0..1 — how close the player is to finishing every goal (drives the "near miss" screen). */
  progress(): number {
    const states = this.goalStates();
    if (!states.length) return 1;
    let sum = 0;
    for (const s of states) sum += s.target <= 0 ? 1 : Math.min(1, s.current / s.target);
    return sum / states.length;
  }

  private updateStatus(): void {
    if (this.goalStates().every((g) => g.done)) this.status = 'won';
    else if (this.movesLeft <= 0) this.status = 'lost';
  }

  // ───────────────────────────── resolution ─────────────────────────────

  private newCtx(cascade: number): Ctx {
    return {
      phase: this.record
        ? {
            type: 'clear',
            cascade,
            pops: [],
            creates: [],
            activations: [],
            blockers: [],
            jelly: [],
            locks: [],
            converts: [],
            scores: [],
          }
        : null,
      cascade,
      mult: Math.min(cascade + 1, 10),
      jellyHit: new Set(),
      blockerHit: new Set(),
      protect: new Set(),
      cupidTargets: new Set(),
      queue: [],
      srcs: [],
    };
  }

  private src(ctx: Ctx, cell: number, color: number, t: number): ScoreSrc {
    const s = { cell, color, t, amount: 0 };
    ctx.srcs.push(s);
    return s;
  }

  private addScore(n: number, src: ScoreSrc, t: number): void {
    this.score += n;
    this.stats.scoreGained += n;
    src.amount += n;
    if (t > src.t) src.t = t;
  }

  private cascadeLoop(phases: Phase[], startCascade: number): void {
    let cascade = startCascade;
    for (let guard = 0; guard < 80; guard++) {
      this.settle(phases);
      const groups = findMatches(this.board);
      if (!groups.length) break;
      cascade++;
      const ctx = this.newCtx(cascade);
      this.runMatches(groups, ctx, null);
      this.finishClear(ctx, phases);
    }
    this.stats.cascades = Math.max(this.stats.cascades, cascade);
  }

  private finishClear(ctx: Ctx, phases: Phase[]): void {
    while (ctx.queue.length) this.activate(ctx.queue.shift()!, ctx);
    if (!ctx.phase) return;
    for (const s of ctx.srcs) {
      if (s.amount > 0) ctx.phase.scores.push({ cell: s.cell, t: s.t, amount: s.amount, color: s.color });
    }
    phases.push(ctx.phase);
  }

  private enqueue(ctx: Ctx, act: Act): void {
    let k = ctx.queue.length;
    while (k > 0 && ctx.queue[k - 1].t > act.t) k--;
    ctx.queue.splice(k, 0, act);
  }

  private runMatches(groups: MatchGroup[], ctx: Ctx, swapCells: number[] | null): void {
    const board = this.board;
    for (const g of groups) {
      const src = this.src(ctx, this.centerOf(g.cells), g.color, 0);
      let anchor = -1;
      if (g.special !== 'none') {
        if (swapCells) for (const s of swapCells) if (g.cells.includes(s)) {
          anchor = s;
          break;
        }
        if (anchor < 0) {
          anchor =
            g.anchors.find((i) => board.cells[i].tile?.special === 'none' && board.cells[i].lock === 0) ??
            g.anchors.find((i) => board.cells[i].tile?.special === 'none') ??
            g.anchors[0];
        }
        this.createSpecial(anchor, g, ctx, src);
      }
      for (const cell of g.cells) if (cell !== anchor) this.hit(cell, 0, 'match', ctx, src);
      for (const cell of g.cells) {
        for (const nb of board.neighbors4(cell)) {
          if (board.cells[nb].blocker && !ctx.blockerHit.has(nb)) {
            ctx.blockerHit.add(nb);
            this.damageBlocker(nb, 0.15, ctx, src);
          }
        }
      }
    }
  }

  private createSpecial(anchor: number, g: MatchGroup, ctx: Ctx, src: ScoreSrc): void {
    const cell = this.board.cells[anchor];
    const tile = cell.tile!;
    if (tile.special !== 'none') {
      this.enqueue(ctx, { kind: tile.special as ActivationKind, cell: anchor, t: 0.2, color: tile.color });
    }
    tile.special = g.special;
    tile.color = g.special === 'rainbow' ? -1 : g.color;
    ctx.protect.add(anchor);
    if (cell.lock > 0) {
      cell.lock--;
      ctx.phase?.locks.push({ cell: anchor, t: 0 });
    }
    this.hitJelly(anchor, 0, ctx, src);
    this.stats.created[g.special]++;
    this.addScore(SCORE.create[g.special], src, 0);
    ctx.phase?.creates.push({
      id: tile.id,
      cell: anchor,
      t: 0,
      special: g.special,
      color: tile.color,
      from: g.cells.filter((c) => c !== anchor),
    });
  }

  private hitJelly(cell: number, t: number, ctx: Ctx, src: ScoreSrc): void {
    const c = this.board.cells[cell];
    if (c.jelly > 0 && !ctx.jellyHit.has(cell)) {
      ctx.jellyHit.add(cell);
      c.jelly--;
      this.jellyCleared++;
      this.addScore(SCORE.jelly, src, t);
      ctx.phase?.jelly.push({ cell, t, left: c.jelly });
    }
  }

  /** Damage a cell. Matches pop tiles; blasts also smash blockers. */
  private hit(cell: number, t: number, by: 'match' | 'blast', ctx: Ctx, src: ScoreSrc, activate = true): void {
    if (cell < 0) return;
    const c = this.board.cells[cell];
    if (!c.playable) return;
    if (c.blocker) {
      if (by === 'blast') this.damageBlocker(cell, t, ctx, src);
      return;
    }
    this.hitJelly(cell, t, ctx, src);
    const tile = c.tile;
    if (!tile || ctx.protect.has(cell)) return;
    if (c.lock > 0) {
      c.lock--;
      this.addScore(SCORE.lock, src, t);
      ctx.phase?.locks.push({ cell, t });
      return;
    }
    if (tile.item) return;
    c.tile = null;
    this.stats.cleared++;
    if (tile.color >= 0) this.collected[tile.color]++;
    this.addScore((tile.special === 'none' ? SCORE.gem : SCORE.special) * ctx.mult, src, t);
    ctx.phase?.pops.push({ id: tile.id, cell, t, color: tile.color, special: tile.special, by });
    if (activate && tile.special !== 'none') {
      this.enqueue(ctx, { kind: tile.special as ActivationKind, cell, t, color: tile.color });
    }
  }

  private damageBlocker(cell: number, t: number, ctx: Ctx, src: ScoreSrc): void {
    const c = this.board.cells[cell];
    const b = c.blocker;
    if (!b) return;
    b.hp = b.type === 'choco' ? 0 : b.hp - 1;
    if (b.hp <= 0) {
      c.blocker = null;
      if (b.type === 'choco') {
        this.chocoDestroyed++;
        this.chocoHitThisTurn = true;
        this.addScore(SCORE.choco, src, t);
      } else {
        this.addScore(SCORE.boxBreak, src, t);
        if (b.gift) {
          this.giftsCollected++;
          this.addScore(SCORE.gift, src, t);
        }
      }
    } else {
      this.addScore(SCORE.boxHit, src, t);
    }
    ctx.phase?.blockers.push({ cell, t, type: b.type, hp: Math.max(0, b.hp), gift: b.gift });
  }

  private runCombo(a: number, b: number, ctx: Ctx): void {
    const cells = this.board.cells;
    const ta = cells[a].tile!;
    const tb = cells[b].tile!;
    const src = this.src(ctx, b, tb.color, 0);
    const consume = (cell: number) => this.hit(cell, 0, 'blast', ctx, src, false);
    const sa = ta.special;
    const sb = tb.special;
    if (sa === 'rainbow' && sb === 'rainbow') {
      consume(a);
      consume(b);
      this.enqueue(ctx, { kind: 'clearAll', cell: b, t: 0.2, color: -1 });
      return;
    }
    if (sa === 'rainbow' || sb === 'rainbow') {
      const rb = sa === 'rainbow' ? a : b;
      const other = rb === a ? b : a;
      const ot = cells[other].tile!;
      consume(rb);
      if (ot.special === 'none') this.enqueue(ctx, { kind: 'colorClear', cell: rb, t: 0.1, color: ot.color });
      else this.enqueue(ctx, { kind: 'colorConvert', cell: rb, t: 0.1, color: ot.color, carry: ot.special });
      return;
    }
    consume(a);
    consume(b);
    const color = tb.color;
    if (isLine(sa) && isLine(sb)) this.enqueue(ctx, { kind: 'cross', cell: b, t: 0.1, color });
    else if ((isLine(sa) && sb === 'bomb') || (sa === 'bomb' && isLine(sb)))
      this.enqueue(ctx, { kind: 'bigCross', cell: b, t: 0.1, color });
    else if (sa === 'bomb' && sb === 'bomb') this.enqueue(ctx, { kind: 'bigBomb', cell: b, t: 0.1, color });
    else if (sa === 'cupid' && sb === 'cupid') {
      for (let k = 0; k < 3; k++) this.enqueue(ctx, { kind: 'cupid', cell: b, t: 0.1 + k * 0.15, color });
    } else {
      const carry = sa === 'cupid' ? sb : sa;
      this.enqueue(ctx, { kind: 'cupid', cell: b, t: 0.1, color, carry });
    }
  }

  private activate(act: Act, ctx: Ctx): void {
    const board = this.board;
    const r = board.row(act.cell);
    const c = board.col(act.cell);
    const t = act.t;
    const src = this.src(ctx, act.cell, act.color, t);
    const ev: ActivationEvent = { kind: act.kind, cell: act.cell, t, color: act.color };
    const row = (rr: number) => {
      if (rr < 0 || rr >= board.rows) return;
      for (let x = 0; x < board.cols; x++) this.hit(board.at(rr, x), t + 0.35 + Math.abs(x - c) * 0.06, 'blast', ctx, src);
    };
    const col = (cc: number) => {
      if (cc < 0 || cc >= board.cols) return;
      for (let y = 0; y < board.rows; y++) this.hit(board.at(y, cc), t + 0.35 + Math.abs(y - r) * 0.06, 'blast', ctx, src);
    };
    const square = (rad: number) => {
      for (let dr = -rad; dr <= rad; dr++)
        for (let dc = -rad; dc <= rad; dc++)
          this.hit(board.at(r + dr, c + dc), t + 0.3 + Math.max(Math.abs(dr), Math.abs(dc)) * 0.12, 'blast', ctx, src);
    };
    const colorTargets = (color: number) => {
      const out: number[] = [];
      for (let i = 0; i < board.cells.length; i++) {
        const tl = board.cells[i].tile;
        if (tl && !tl.item && tl.color === color && !ctx.protect.has(i)) out.push(i);
      }
      out.sort(
        (x, y) =>
          Math.hypot(board.row(x) - r, board.col(x) - c) - Math.hypot(board.row(y) - r, board.col(y) - c),
      );
      return out;
    };

    switch (act.kind) {
      case 'lineH':
        row(r);
        break;
      case 'lineV':
        col(c);
        break;
      case 'cross':
        row(r);
        col(c);
        break;
      case 'bigCross':
        for (let d = -1; d <= 1; d++) {
          row(r + d);
          col(c + d);
        }
        break;
      case 'bomb':
        ev.radius = 1;
        square(1);
        break;
      case 'bigBomb':
        ev.radius = 2;
        square(2);
        break;
      case 'rainbow':
      case 'colorClear': {
        const color = act.color >= 0 && act.kind === 'colorClear' ? act.color : this.mostCommonColor();
        ev.color = color;
        const targets = color >= 0 ? colorTargets(color) : [];
        ev.targets = targets;
        targets.forEach((cell, k) => this.hit(cell, t + 0.5 + k * 0.045, 'blast', ctx, src));
        break;
      }
      case 'colorConvert': {
        const targets = colorTargets(act.color);
        ev.targets = targets;
        targets.forEach((cell, k) => {
          const tl = board.cells[cell].tile!;
          if (tl.special === 'none') {
            tl.special =
              act.carry === 'lineH' || act.carry === 'lineV'
                ? this.rng.chance(0.5)
                  ? 'lineH'
                  : 'lineV'
                : (act.carry ?? 'bomb');
            ctx.phase?.converts.push({ id: tl.id, cell, t: t + 0.3 + k * 0.05, special: tl.special });
          }
        });
        targets.forEach((cell, k) => this.hit(cell, t + 1.0 + k * 0.14, 'blast', ctx, src));
        break;
      }
      case 'clearAll':
        for (let i = 0; i < board.cells.length; i++) {
          const d = Math.hypot(board.row(i) - r, board.col(i) - c);
          this.hit(i, t + 0.4 + d * 0.08, 'blast', ctx, src);
        }
        break;
      case 'cupid': {
        for (const nb of board.neighbors4(act.cell)) this.hit(nb, t + 0.2, 'blast', ctx, src);
        const target = this.pickCupidTarget(ctx, act.cell);
        ev.to = target;
        ev.carry = act.carry;
        if (target >= 0) {
          ctx.cupidTargets.add(target);
          const tt = t + 1.4;
          if (act.carry && act.carry !== 'none') {
            this.enqueue(ctx, { kind: act.carry as ActivationKind, cell: target, t: tt, color: act.color });
          }
          this.hit(target, tt, 'blast', ctx, src);
        }
        break;
      }
    }
    ctx.phase?.activations.push(ev);
  }

  private mostCommonColor(): number {
    const counts = new Array(8).fill(0);
    for (const cell of this.board.cells) {
      const t = cell.tile;
      if (t && !t.item && t.color >= 0) counts[t.color]++;
    }
    let best = -1;
    let bestN = 0;
    counts.forEach((n, k) => {
      if (n > bestN) {
        bestN = n;
        best = k;
      }
    });
    return best;
  }

  /** Cupid homes in on whatever helps the goals most. */
  private pickCupidTarget(ctx: Ctx, from: number): number {
    const board = this.board;
    const goals = this.goalStates().filter((g) => !g.done);
    const want = new Set(goals.map((g) => g.goal.type));
    const collectColors = new Set(
      goals.filter((g) => g.goal.type === 'collect').map((g) => (g.goal as { color: number }).color),
    );
    const belowItems = new Set<number>();
    if (want.has('drop')) {
      for (let i = 0; i < board.cells.length; i++) {
        if (board.cells[i].tile?.item) {
          const d = board.flow.down[i];
          if (d >= 0) belowItems.add(d);
        }
      }
    }
    let best: number[] = [];
    let bestScore = 0;
    for (let i = 0; i < board.cells.length; i++) {
      const cell = board.cells[i];
      if (!cell.playable || i === from || ctx.cupidTargets.has(i)) continue;
      let s = 0;
      if (cell.blocker) {
        if (cell.blocker.gift) s = want.has('gift') ? 5 : 2;
        else if (cell.blocker.type === 'choco') s = want.has('choco') ? 5 : 3;
        else s = 2.5;
      } else {
        if (cell.jelly > 0 && !ctx.jellyHit.has(i)) s = Math.max(s, (want.has('jelly') ? 4 : 1) + cell.jelly * 0.5);
        const t = cell.tile;
        if (t && !ctx.protect.has(i)) {
          if (cell.lock > 0) s = Math.max(s, 2);
          if (belowItems.has(i)) s = Math.max(s, 4.5);
          if (!t.item && collectColors.has(t.color)) s = Math.max(s, 3.5);
          if (!t.item) s = Math.max(s, 0.5);
        }
      }
      if (s <= 0) continue;
      if (s > bestScore) {
        bestScore = s;
        best = [i];
      } else if (s === bestScore) best.push(i);
    }
    return best.length ? best[this.rng.int(best.length)] : -1;
  }

  private centerOf(cells: number[]): number {
    const board = this.board;
    let sr = 0;
    let sc = 0;
    for (const i of cells) {
      sr += board.row(i);
      sc += board.col(i);
    }
    sr /= cells.length;
    sc /= cells.length;
    let best = cells[0];
    let bd = Infinity;
    for (const i of cells) {
      const d = Math.hypot(board.row(i) - sr, board.col(i) - sc);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  // ───────────────────────────── gravity ─────────────────────────────

  private settle(phases: Phase[]): void {
    for (let guard = 0; guard < 30; guard++) {
      const fall = this.gravity();
      if (fall && fall.paths.length) phases.push(fall);
      const got = this.collectItems();
      if (!got) break;
      if (this.record) phases.push(got);
    }
  }

  /**
   * Tick-based gravity: each tick every tile may move one cell along the flow graph; spawners
   * create gems; when nothing can fall straight, tiles slide diagonally around blockers.
   */
  private gravity(): FallPhase | null {
    const board = this.board;
    const cells = board.cells;
    const { order, feeder, down, g } = board.flow;
    const rec = this.record;
    const paths = new Map<number, FallPath>();
    const spawned = new Set<number>();
    const moved = new Set<number>();
    const p0 = Math.abs(g[1]);
    const p1 = Math.abs(g[0]);
    let tick = 0;

    const move = (from: number, to: number) => {
      const t = cells[from].tile!;
      cells[from].tile = null;
      cells[to].tile = t;
      moved.add(t.id);
      if (!rec) return;
      let p = paths.get(t.id);
      if (!p) {
        p = { id: t.id, tile: t, spawnTick: -1, steps: [{ cell: from, tick }] };
        paths.set(t.id, p);
      }
      const last = p.steps[p.steps.length - 1];
      if (last.tick < tick) p.steps.push({ cell: last.cell, tick });
      p.steps.push({ cell: to, tick: tick + 1 });
    };

    for (let guard = 0; guard < 600; guard++) {
      moved.clear();
      let any = false;
      for (const i of order) {
        if (!board.isOpen(i)) continue;
        const f = feeder[i];
        if (f === -1) {
          const t = this.newTile();
          cells[i].tile = t;
          moved.add(t.id);
          spawned.add(t.id);
          any = true;
          if (rec) paths.set(t.id, { id: t.id, tile: t, spawnTick: tick, steps: [{ cell: i, tick: tick + 1 }] });
        } else if (board.isMovable(f) && !moved.has(cells[f].tile!.id)) {
          move(f, i);
          any = true;
        }
      }
      if (!any) {
        for (const i of order) {
          if (!board.isOpen(i)) continue;
          const r = board.row(i) - g[0];
          const c = board.col(i) - g[1];
          for (const s of [-1, 1]) {
            const from = board.at(r + p0 * s, c + p1 * s);
            if (from < 0 || !board.isMovable(from) || moved.has(cells[from].tile!.id)) continue;
            const d = down[from];
            if (d >= 0 && board.isOpen(d)) continue;
            move(from, i);
            any = true;
            break;
          }
        }
      }
      if (!any) break;
      tick++;
    }

    const luck = this.level.luck ?? 0;
    if (luck > 0 && spawned.size) {
      const colors = Array.from({ length: this.level.colors }, (_, k) => k);
      for (let i = 0; i < cells.length; i++) {
        const t = cells[i].tile;
        if (!t || !spawned.has(t.id) || t.item || t.special !== 'none' || !this.rng.chance(luck)) continue;
        const orig = t.color;
        let found = false;
        for (const k of this.rng.shuffle(colors.slice())) {
          t.color = k;
          if (hasMatchAt(board, i)) {
            found = true;
            break;
          }
        }
        if (!found) t.color = orig;
      }
    }

    if (!rec) return null;
    const out: FallPath[] = [];
    for (const p of paths.values()) {
      p.tile = { ...p.tile };
      out.push(p);
    }
    return { type: 'fall', paths: out, ticks: tick };
  }

  private collectItems(): CollectPhase | null {
    const cells = this.board.cells;
    const items: CollectPhase['items'] = [];
    for (const e of this.board.flow.exits) {
      const t = cells[e].tile;
      if (t?.item) {
        cells[e].tile = null;
        this.itemsCollected++;
        this.itemsOnBoard--;
        this.score += SCORE.item;
        this.stats.scoreGained += SCORE.item;
        items.push({ id: t.id, cell: e, item: t.item });
      }
    }
    return items.length ? { type: 'collect', items } : null;
  }

  // ───────────────────────────── end of turn ─────────────────────────────

  private endTurn(phases: Phase[]): void {
    this.movesMade++;
    if (Number.isFinite(this.movesLeft)) this.movesLeft--;
    if (!this.chocoHitThisTurn) {
      const sp = this.spreadChoco();
      if (sp && this.record) phases.push(sp);
    }
    this.updateStatus();
    if (this.status === 'playing' && !this.hasValidMove()) {
      const sh = this.shuffle();
      if (sh && this.record) phases.push(sh);
    }
  }

  private spreadChoco(): SpreadPhase | null {
    const board = this.board;
    const cands: [number, number][] = [];
    for (let i = 0; i < board.cells.length; i++) {
      if (board.cells[i].blocker?.type !== 'choco') continue;
      for (const nb of board.neighbors4(i)) {
        const c = board.cells[nb];
        if (c.tile && !c.tile.item && c.tile.special === 'none' && c.lock === 0) cands.push([i, nb]);
      }
    }
    if (!cands.length) return null;
    const [from, to] = this.rng.pick(cands);
    const tile = board.cells[to].tile!;
    board.cells[to].tile = null;
    board.cells[to].blocker = { type: 'choco', hp: 1 };
    this.stats.chocoSpread = true;
    return { type: 'spread', from, to, tileId: tile.id };
  }

  /** Rearrange tiles until there is a move (and no ready-made matches). */
  shuffle(): ShufflePhase | null {
    const board = this.board;
    const cells = board.cells;
    const slots: number[] = [];
    for (let i = 0; i < cells.length; i++) if (board.isMovable(i) && !cells[i].tile!.item) slots.push(i);
    if (slots.length < 2) return null;
    const origin = new Map<number, number>();
    const origColor = new Map<number, number>();
    for (const i of slots) {
      origin.set(cells[i].tile!.id, i);
      origColor.set(cells[i].tile!.id, cells[i].tile!.color);
    }
    const tiles = slots.map((i) => cells[i].tile!);
    let ok = false;
    for (let attempt = 0; attempt < 80 && !ok; attempt++) {
      this.rng.shuffle(tiles);
      slots.forEach((cell, k) => (cells[cell].tile = tiles[k]));
      ok = findMatches(board).length === 0 && this.hasValidMove();
    }
    const colors = Array.from({ length: this.level.colors }, (_, k) => k);
    for (let attempt = 0; attempt < 80 && !ok; attempt++) {
      for (const i of slots) if (cells[i].tile!.special === 'none') cells[i].tile!.color = -1;
      for (const i of slots) {
        const t = cells[i].tile!;
        if (t.special !== 'none') continue;
        for (const k of this.rng.shuffle(colors.slice())) {
          t.color = k;
          if (!hasMatchAt(board, i)) break;
        }
      }
      ok = findMatches(board).length === 0 && this.hasValidMove();
    }
    if (!ok) {
      // Last resort: a rainbow can always be swapped with a neighbour.
      const plain = slots.filter((i) => cells[i].tile!.special === 'none');
      if (plain.length) {
        const t = cells[this.rng.pick(plain)].tile!;
        t.special = 'rainbow';
        t.color = -1;
      }
    }
    const moves: ShufflePhase['moves'] = [];
    const recolor: ShufflePhase['recolor'] = [];
    for (const i of slots) {
      const t = cells[i].tile!;
      moves.push({ id: t.id, from: origin.get(t.id)!, to: i });
      if (origColor.get(t.id) !== t.color) recolor.push({ id: t.id, color: t.color });
    }
    return { type: 'shuffle', moves, recolor };
  }

  // ───────────────────────────── love rush ─────────────────────────────

  /**
   * End-of-level celebration (like "Sugar Crush"): every spare move becomes a line blaster,
   * then every special on the board detonates for bonus points.
   */
  loveRush(): TurnResult | null {
    if (this.status !== 'won') return null;
    this.stats = emptyStats();
    const phases: Phase[] = [];
    const board = this.board;
    const spare = Number.isFinite(this.movesLeft) ? this.movesLeft : Math.floor(this.timeLeft / 4);
    const n = Math.max(0, Math.min(15, spare));
    this.movesLeft = Number.isFinite(this.movesLeft) ? 0 : this.movesLeft;
    if (n > 0) {
      const ctx = this.newCtx(0);
      const src = this.src(ctx, 0, -1, 0);
      const plain: number[] = [];
      for (let i = 0; i < board.cells.length; i++) {
        const t = board.cells[i].tile;
        if (t && !t.item && t.special === 'none') plain.push(i);
      }
      this.rng.shuffle(plain);
      plain.slice(0, n).forEach((cell, k) => {
        const t = board.cells[cell].tile!;
        t.special = this.rng.chance(0.5) ? 'lineH' : 'lineV';
        ctx.phase?.converts.push({ id: t.id, cell, t: k * 0.1, special: t.special });
      });
      this.addScore(n * SCORE.rushPerMove, src, 0);
      ctx.srcs = [];
      this.finishClear(ctx, phases);
    }
    // Everything detonates together (staggered slightly); at most a few rounds so it never drags.
    for (let loop = 0; loop < 4; loop++) {
      const specials: number[] = [];
      for (let i = 0; i < board.cells.length; i++) {
        const t = board.cells[i].tile;
        if (t && !t.item && t.special !== 'none' && board.cells[i].lock === 0) specials.push(i);
      }
      if (!specials.length) break;
      const ctx = this.newCtx(loop + 1);
      const src = this.src(ctx, specials[0], -1, 0);
      specials.forEach((cell, k) => this.hit(cell, k * 0.07, 'blast', ctx, src));
      this.finishClear(ctx, phases);
      this.cascadeLoop(phases, loop + 1);
    }
    return { phases, stats: this.stats };
  }
}

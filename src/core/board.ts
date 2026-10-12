import type { Cell, Gravity, Tile } from './types';

const GRAVITY_VEC: Record<Gravity, [number, number]> = {
  down: [1, 0],
  up: [-1, 0],
  left: [0, -1],
  right: [0, 1],
};

/**
 * Flow graph for gravity. Every playable cell has at most one `down` cell (where its tile falls to)
 * and at most one `feeder` (where new tiles come from). Gaps of void cells are tunnelled through,
 * portals override the natural flow. Shared between clones because it never changes.
 */
export interface Flow {
  gravity: Gravity;
  g: [number, number];
  down: Int16Array;
  feeder: Int16Array;
  /** Playable cells sorted so the ones closest to a sink come first. */
  order: number[];
  spawners: number[];
  exits: number[];
  portals: [number, number][];
}

export class Board {
  readonly rows: number;
  readonly cols: number;
  cells: Cell[];
  flow!: Flow;

  constructor(rows: number, cols: number, cells?: Cell[]) {
    this.rows = rows;
    this.cols = cols;
    this.cells =
      cells ??
      Array.from({ length: rows * cols }, () => ({ playable: true, tile: null, jelly: 0, lock: 0, blocker: null }));
  }

  idx(r: number, c: number): number {
    return r * this.cols + c;
  }

  row(i: number): number {
    return Math.floor(i / this.cols);
  }

  col(i: number): number {
    return i % this.cols;
  }

  inBounds(r: number, c: number): boolean {
    return r >= 0 && r < this.rows && c >= 0 && c < this.cols;
  }

  /** Index of (r,c) if it is a playable cell, else -1. */
  at(r: number, c: number): number {
    if (!this.inBounds(r, c)) return -1;
    const i = r * this.cols + c;
    return this.cells[i].playable ? i : -1;
  }

  neighbors4(i: number): number[] {
    const r = this.row(i);
    const c = this.col(i);
    const out: number[] = [];
    const cand = [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ];
    for (const [rr, cc] of cand) {
      const j = this.at(rr, cc);
      if (j >= 0) out.push(j);
    }
    return out;
  }

  areAdjacent(a: number, b: number): boolean {
    const dr = Math.abs(this.row(a) - this.row(b));
    const dc = Math.abs(this.col(a) - this.col(b));
    return dr + dc === 1;
  }

  tile(i: number): Tile | null {
    return this.cells[i].tile;
  }

  /** Tile that can be swapped / can fall. */
  isMovable(i: number): boolean {
    const c = this.cells[i];
    return c.playable && c.tile !== null && c.lock === 0 && c.blocker === null;
  }

  /** A cell a falling tile may enter. */
  isOpen(i: number): boolean {
    const c = this.cells[i];
    return c.playable && c.tile === null && c.blocker === null;
  }

  /** Color usable for matching, or -1. */
  matchColor(i: number): number {
    const c = this.cells[i];
    if (!c.playable || !c.tile || c.tile.item) return -1;
    return c.tile.color;
  }

  computeFlow(gravity: Gravity, portals: [number, number][] = []): void {
    const n = this.rows * this.cols;
    const g = GRAVITY_VEC[gravity];
    const down = new Int16Array(n).fill(-1);
    const feeder = new Int16Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      if (!this.cells[i].playable) continue;
      let r = this.row(i) + g[0];
      let c = this.col(i) + g[1];
      while (this.inBounds(r, c)) {
        const j = this.idx(r, c);
        if (this.cells[j].playable) {
          down[i] = j;
          break;
        }
        r += g[0];
        c += g[1];
      }
    }
    for (const [entry, exit] of portals) {
      for (let i = 0; i < n; i++) if (down[i] === exit) down[i] = -1;
      down[entry] = exit;
    }
    for (let i = 0; i < n; i++) if (down[i] >= 0) feeder[down[i]] = i;

    // Depth from the sink of each chain: sinks (down = -1) first.
    const depth = new Int32Array(n).fill(-1);
    const order: number[] = [];
    const exits: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!this.cells[i].playable || down[i] !== -1) continue;
      exits.push(i);
      let d = 0;
      let cur = i;
      const seen = new Set<number>();
      while (cur >= 0 && !seen.has(cur)) {
        seen.add(cur);
        depth[cur] = d++;
        cur = feeder[cur];
      }
    }
    for (let i = 0; i < n; i++) if (this.cells[i].playable && depth[i] >= 0) order.push(i);
    order.sort((a, b) => depth[a] - depth[b] || a - b);
    const spawners: number[] = [];
    for (let i = 0; i < n; i++) if (this.cells[i].playable && feeder[i] === -1) spawners.push(i);
    this.flow = { gravity, g, down, feeder, order, spawners, exits, portals };
  }

  clone(): Board {
    const cells = this.cells.map((c) => ({
      playable: c.playable,
      tile: c.tile ? { ...c.tile } : null,
      jelly: c.jelly,
      lock: c.lock,
      blocker: c.blocker ? { ...c.blocker } : null,
    }));
    const b = new Board(this.rows, this.cols, cells);
    b.flow = this.flow;
    return b;
  }

  /** Debug / test helper: compact text dump of colors. */
  toString(): string {
    const lines: string[] = [];
    for (let r = 0; r < this.rows; r++) {
      let s = '';
      for (let c = 0; c < this.cols; c++) {
        const cell = this.cells[this.idx(r, c)];
        if (!cell.playable) s += '.';
        else if (cell.blocker) s += cell.blocker.type === 'box' ? '#' : 'C';
        else if (!cell.tile) s += '_';
        else if (cell.tile.item) s += 'I';
        else if (cell.tile.special === 'rainbow') s += 'R';
        else s += String(cell.tile.color);
      }
      lines.push(s);
    }
    return lines.join('\n');
  }
}

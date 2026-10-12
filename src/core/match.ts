import type { Board } from './board';
import type { Special } from './types';

export interface MatchGroup {
  color: number;
  cells: number[];
  /** Special created by this group ('none' for a plain 3-match). */
  special: Special;
  /** Preferred cells for the new special, best first. */
  anchors: number[];
}

/**
 * Finds every match on the board: horizontal/vertical runs of 3+ and 2x2 squares.
 * Connected matched cells of the same color form one group, which is classified into
 * the special it should create (5-line > L/T > 4-line > square > plain).
 */
export function findMatches(board: Board): MatchGroup[] {
  const { rows, cols } = board;
  const n = rows * cols;
  const runH = new Int8Array(n);
  const runV = new Int8Array(n);
  const square = new Uint8Array(n);
  const color = new Int8Array(n);
  for (let i = 0; i < n; i++) color[i] = board.matchColor(i);

  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      const col0 = color[r * cols + c];
      let e = c + 1;
      if (col0 >= 0) while (e < cols && color[r * cols + e] === col0) e++;
      const len = e - c;
      if (col0 >= 0 && len >= 3) for (let k = c; k < e; k++) runH[r * cols + k] = len;
      c = e;
    }
  }
  for (let c = 0; c < cols; c++) {
    let r = 0;
    while (r < rows) {
      const col0 = color[r * cols + c];
      let e = r + 1;
      if (col0 >= 0) while (e < rows && color[e * cols + c] === col0) e++;
      const len = e - r;
      if (col0 >= 0 && len >= 3) for (let k = r; k < e; k++) runV[k * cols + c] = len;
      r = e;
    }
  }
  for (let r = 0; r + 1 < rows; r++) {
    for (let c = 0; c + 1 < cols; c++) {
      const i = r * cols + c;
      const k = color[i];
      if (k < 0) continue;
      if (color[i + 1] === k && color[i + cols] === k && color[i + cols + 1] === k) {
        square[i] = square[i + 1] = square[i + cols] = square[i + cols + 1] = 1;
      }
    }
  }

  const matched = (i: number) => runH[i] > 0 || runV[i] > 0 || square[i] > 0;
  const seen = new Uint8Array(n);
  const groups: MatchGroup[] = [];
  for (let i = 0; i < n; i++) {
    if (seen[i] || !matched(i)) continue;
    const k = color[i];
    const cells: number[] = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const cur = stack.pop()!;
      cells.push(cur);
      const r = Math.floor(cur / cols);
      const c = cur % cols;
      const nb = [
        r > 0 ? cur - cols : -1,
        r < rows - 1 ? cur + cols : -1,
        c > 0 ? cur - 1 : -1,
        c < cols - 1 ? cur + 1 : -1,
      ];
      for (const j of nb) {
        if (j >= 0 && !seen[j] && color[j] === k && matched(j)) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    cells.sort((a, b) => a - b);
    groups.push(classify(cells, k, runH, runV, square));
  }
  return groups;
}

function classify(
  cells: number[],
  color: number,
  runH: Int8Array,
  runV: Int8Array,
  square: Uint8Array,
): MatchGroup {
  let maxH = 0;
  let maxV = 0;
  const crosses: number[] = [];
  let hasSquare = false;
  for (const i of cells) {
    if (runH[i] > maxH) maxH = runH[i];
    if (runV[i] > maxV) maxV = runV[i];
    if (runH[i] >= 3 && runV[i] >= 3) crosses.push(i);
    if (square[i]) hasSquare = true;
  }
  const middleOf = (len: number, horizontal: boolean): number[] => {
    const run = cells.filter((i) => (horizontal ? runH[i] : runV[i]) === len);
    run.sort((a, b) => a - b);
    const mid = Math.floor((run.length - 1) / 2);
    const out = [run[mid]];
    for (let d = 1; d < run.length; d++) {
      if (run[mid + d] !== undefined) out.push(run[mid + d]);
      if (run[mid - d] !== undefined) out.push(run[mid - d]);
    }
    return out;
  };
  let special: Special = 'none';
  let anchors: number[] = [];
  if (maxH >= 5 || maxV >= 5) {
    special = 'rainbow';
    anchors = maxH >= maxV ? middleOf(maxH, true) : middleOf(maxV, false);
  } else if (crosses.length > 0) {
    special = 'bomb';
    anchors = crosses;
  } else if (maxH === 4 || maxV === 4) {
    special = maxH === 4 ? 'lineH' : 'lineV';
    anchors = maxH === 4 ? middleOf(4, true) : middleOf(4, false);
  } else if (hasSquare) {
    special = 'cupid';
    anchors = cells.filter((i) => square[i]);
  }
  return { color, cells, special, anchors };
}

/** Would the tile at `i` be part of a match (run of 3 or 2x2 square)? Used for move validation. */
export function hasMatchAt(board: Board, i: number): boolean {
  const k = board.matchColor(i);
  if (k < 0) return false;
  const r = board.row(i);
  const c = board.col(i);
  const same = (rr: number, cc: number) => board.inBounds(rr, cc) && board.matchColor(board.idx(rr, cc)) === k;
  let h = 1;
  for (let x = c - 1; same(r, x); x--) h++;
  for (let x = c + 1; same(r, x); x++) h++;
  if (h >= 3) return true;
  let v = 1;
  for (let y = r - 1; same(y, c); y--) v++;
  for (let y = r + 1; same(y, c); y++) v++;
  if (v >= 3) return true;
  for (const [dr, dc] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ]) {
    if (same(r + dr, c) && same(r, c + dc) && same(r + dr, c + dc)) return true;
  }
  return false;
}

import { Game } from '../src/core/game';
import type { Goal, Gravity, LevelDef, Special } from '../src/core/types';

/**
 * Build a game from a readable grid. Tokens are space separated:
 *   0-5 color gem (suffix h/v/m/u = lineH/lineV/bomb/cupid, l = locked, j/J = jelly 1/2)
 *   R rainbow   I drop item   # box (#2 = hp2, #g = gift)   C chocolate   . void   _ empty cell
 */
export function makeGame(
  grid: string[],
  opts: {
    goals?: Goal[];
    moves?: number;
    colors?: number;
    gravity?: Gravity;
    portals?: [number, number][];
    seed?: number;
    items?: LevelDef['items'];
  } = {},
): Game {
  const rows = grid.length;
  const tokens = grid.map((line) => line.trim().split(/\s+/));
  const cols = tokens[0].length;
  const layout = tokens.map((row) => row.map((t) => (t === '.' ? '.' : 'o')).join(''));
  const level: LevelDef = {
    id: 0,
    rows,
    cols,
    layout,
    colors: opts.colors ?? 6,
    moves: opts.moves ?? 20,
    goals: opts.goals ?? [{ type: 'score', target: 1_000_000 }],
    gravity: opts.gravity ?? 'down',
    portals: opts.portals,
    items: opts.items,
    tier: 'easy',
    theme: 0,
    stars: [1, 2, 3],
    seed: 1,
  };
  const game = new Game(level, { seed: opts.seed ?? 42, fill: false });
  const specials: Record<string, Special> = { h: 'lineH', v: 'lineV', m: 'bomb', u: 'cupid' };
  tokens.forEach((row, r) =>
    row.forEach((tok, c) => {
      const cell = game.board.cells[r * cols + c];
      if (tok === '.') return;
      cell.tile = null;
      if (tok === '_') return;
      if (tok === 'R') cell.tile = { id: game.nextId++, color: -1, special: 'rainbow' };
      else if (tok === 'I') {
        cell.tile = { id: game.nextId++, color: -1, special: 'none', item: 'ring' };
        game.itemsSpawned++;
        game.itemsOnBoard++;
      } else if (tok.startsWith('#')) {
        cell.blocker = { type: 'box', hp: tok.includes('2') ? 2 : 1, gift: tok.includes('g') };
      } else if (tok === 'C') cell.blocker = { type: 'choco', hp: 1 };
      else {
        const color = Number(tok[0]);
        let special: Special = 'none';
        for (const ch of tok.slice(1)) {
          if (specials[ch]) special = specials[ch];
          if (ch === 'l') cell.lock = 1;
          if (ch === 'j') cell.jelly = 1;
          if (ch === 'J') cell.jelly = 2;
        }
        cell.tile = { id: game.nextId++, color, special };
      }
    }),
  );
  game.jellyTotal = game.board.cells.reduce((s, c) => s + c.jelly, 0);
  return game;
}

export const idx = (game: Game, r: number, c: number) => game.board.idx(r, c);

/** Colors of the board as strings (for compact assertions). */
export function colors(game: Game): string[] {
  return game.board.toString().split('\n');
}

export function countTiles(game: Game, pred: (t: NonNullable<Game['board']['cells'][number]['tile']>) => boolean) {
  let n = 0;
  for (const c of game.board.cells) if (c.tile && pred(c.tile)) n++;
  return n;
}

/** No playable, open cell may be left empty unless it is walled in by blockers. */
export function emptyOpenCells(game: Game): number[] {
  const out: number[] = [];
  game.board.cells.forEach((c, i) => {
    if (c.playable && !c.blocker && !c.tile) out.push(i);
  });
  return out;
}

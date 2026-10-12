export type Special = 'none' | 'lineH' | 'lineV' | 'bomb' | 'rainbow' | 'cupid';
export type ItemType = 'ring' | 'letter';
export type Gravity = 'down' | 'up' | 'left' | 'right';
export type Tier = 'tutorial' | 'relief' | 'easy' | 'medium' | 'hard' | 'boss';

/** A movable piece on the board. `color` is -1 for rainbows and drop items. */
export interface Tile {
  id: number;
  color: number;
  special: Special;
  item?: ItemType;
}

export type BlockerType = 'box' | 'choco';

export interface Blocker {
  type: BlockerType;
  hp: number;
  gift?: boolean;
}

export interface Cell {
  playable: boolean;
  tile: Tile | null;
  /** Layers of jelly under the tile (0-2). */
  jelly: number;
  /** Ribbon lock: tile can't move; a hit removes the ribbon instead of the tile. */
  lock: number;
  blocker: Blocker | null;
}

export type Goal =
  | { type: 'score'; target: number }
  | { type: 'collect'; color: number; count: number }
  | { type: 'jelly'; count: number }
  | { type: 'drop'; count: number }
  | { type: 'gift'; count: number }
  | { type: 'choco'; count: number };

export type GoalType = Goal['type'];

export interface LevelDef {
  id: number;
  rows: number;
  cols: number;
  /**
   * One char per cell:
   *  .  void            o  plain cell
   *  j/J jelly x1/x2    l/L locked tile (L = on jelly)
   *  b/B/X box hp1/2/3  g/G gift box hp1/2
   *  c  chocolate       i  drop item
   *  r rainbow, h lineH, v lineV, m bomb, u cupid  (preset specials, mostly for tutorials)
   */
  layout: string[];
  colors: number;
  moves: number;
  /** Seconds. When set the level is a timed "boss" run and moves are unlimited. */
  time?: number;
  goals: Goal[];
  gravity: Gravity;
  /** [entryCell, exitCell] pairs: a tile leaving `entry` re-appears at `exit`. */
  portals?: [number, number][];
  items?: { type: ItemType; total: number; maxOnBoard: number };
  /** Probability that a freshly spawned gem is nudged into a match (relief levels feel "lucky"). */
  luck?: number;
  tier: Tier;
  theme: number;
  /** Score thresholds for 1/2/3 stars. */
  stars: [number, number, number];
  seed: number;
  /** 1-based index of a hand-made tutorial level (its title/tip come from the locale). */
  tutorial?: number;
}

export interface Move {
  a: number;
  b: number;
}

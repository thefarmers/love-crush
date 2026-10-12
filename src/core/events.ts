import type { BlockerType, ItemType, Special, Tile } from './types';

/**
 * Everything the renderer needs to replay a turn. Times (`t`) are abstract beats inside a
 * clear phase; the renderer scales them to milliseconds. Fall paths use integer ticks.
 */

export type ActivationKind =
  | 'lineH'
  | 'lineV'
  | 'bomb'
  | 'bigBomb'
  | 'cross'
  | 'bigCross'
  | 'rainbow'
  | 'colorClear'
  | 'colorConvert'
  | 'clearAll'
  | 'cupid';

export interface PopEvent {
  id: number;
  cell: number;
  t: number;
  color: number;
  special: Special;
  by: 'match' | 'blast';
}

export interface CreateEvent {
  id: number;
  cell: number;
  t: number;
  special: Special;
  color: number;
  /** Cells whose tiles merged into the new special. */
  from: number[];
}

export interface ActivationEvent {
  kind: ActivationKind;
  cell: number;
  t: number;
  color: number;
  /** Cupid destination. */
  to?: number;
  /** Special carried by a cupid combo. */
  carry?: Special;
  /** Rainbow lightning targets. */
  targets?: number[];
  radius?: number;
}

export interface BlockerEvent {
  cell: number;
  t: number;
  type: BlockerType;
  hp: number;
  gift?: boolean;
}

export interface JellyEvent {
  cell: number;
  t: number;
  left: number;
}

export interface LockEvent {
  cell: number;
  t: number;
}

export interface ConvertEvent {
  id: number;
  cell: number;
  t: number;
  special: Special;
}

export interface ScoreEvent {
  cell: number;
  t: number;
  amount: number;
  color: number;
}

export interface SwapPhase {
  type: 'swap';
  a: number;
  b: number;
}

export interface ClearPhase {
  type: 'clear';
  cascade: number;
  pops: PopEvent[];
  creates: CreateEvent[];
  activations: ActivationEvent[];
  blockers: BlockerEvent[];
  jelly: JellyEvent[];
  locks: LockEvent[];
  converts: ConvertEvent[];
  scores: ScoreEvent[];
}

export interface FallStep {
  cell: number;
  tick: number;
}

export interface FallPath {
  id: number;
  /** Snapshot of the tile at the end of the fall (spawned tiles need it to be drawn). */
  tile: Tile;
  /** Tick at which a spawned tile appears just outside its spawner. -1 = existing tile. */
  spawnTick: number;
  steps: FallStep[];
}

export interface FallPhase {
  type: 'fall';
  paths: FallPath[];
  ticks: number;
}

export interface CollectPhase {
  type: 'collect';
  items: { id: number; cell: number; item: ItemType }[];
}

export interface SpreadPhase {
  type: 'spread';
  from: number;
  to: number;
  tileId: number;
}

export interface ShufflePhase {
  type: 'shuffle';
  moves: { id: number; from: number; to: number }[];
  recolor: { id: number; color: number }[];
}

export type Phase = SwapPhase | ClearPhase | FallPhase | CollectPhase | SpreadPhase | ShufflePhase;

export interface TurnStats {
  cascades: number;
  cleared: number;
  scoreGained: number;
  created: Record<Special, number>;
  chocoSpread: boolean;
  combo: boolean;
}

export interface TurnResult {
  phases: Phase[];
  stats: TurnStats;
}

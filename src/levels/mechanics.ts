import type { LevelDef } from '../core/types';
import { TOTAL_LEVELS } from './difficulty';

export type MechanicKey = 'box' | 'lock' | 'choco' | 'double' | 'timed' | 'letter' | 'up' | 'portal' | 'side';

/** A board feature explained the first time it shows up (text lives in the locale). */
export interface Mechanic {
  key: MechanicKey;
  test(l: LevelDef): boolean;
}

const has = (re: RegExp) => (l: LevelDef) => re.test(l.layout.join(''));

/** Explained the first time each one appears, so new obstacles never feel unfair. */
export const MECHANICS: Mechanic[] = [
  { key: 'box', test: has(/[bBX]/) },
  { key: 'lock', test: has(/[lL]/) },
  { key: 'choco', test: has(/c/) },
  { key: 'double', test: has(/J/) },
  { key: 'timed', test: (l) => !!l.time },
  { key: 'letter', test: (l) => l.items?.type === 'letter' },
  { key: 'up', test: (l) => l.gravity === 'up' },
  { key: 'portal', test: (l) => (l.portals?.length ?? 0) > 0 },
  { key: 'side', test: (l) => l.gravity === 'left' || l.gravity === 'right' },
];

let firsts: Map<string, number> | null = null;

/** Mechanics that appear for the first time on level `n`. */
export function newMechanicsAt(n: number, get: (n: number) => LevelDef): Mechanic[] {
  if (!firsts) {
    firsts = new Map();
    for (let k = 1; k <= TOTAL_LEVELS && firsts.size < MECHANICS.length; k++) {
      const lv = get(k);
      for (const m of MECHANICS) if (!firsts.has(m.key) && m.test(lv)) firsts.set(m.key, k);
    }
  }
  return MECHANICS.filter((m) => firsts!.get(m.key) === n);
}

export type Twist = 'portal' | 'up' | 'left' | 'right';

/** Board twist worth announcing at level start, if any. */
export function twistOf(l: LevelDef): Twist | null {
  if (l.portals?.length) return 'portal';
  return l.gravity === 'down' ? null : l.gravity;
}

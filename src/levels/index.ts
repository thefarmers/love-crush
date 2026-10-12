import { applyCalibration, type LevelCalibration } from '../ai/calibrate';
import type { LevelDef } from '../core/types';
import calibration from './calibration.json';
import { TOTAL_LEVELS } from './difficulty';
import { generateLevel } from './generator';

const table = (calibration as unknown as { levels: Record<string, LevelCalibration> }).levels;
const cache = new Map<number, LevelDef>();

export function calibrationFor(n: number): LevelCalibration | undefined {
  return table[n];
}

/** Level `n` (1-based) with the bot-calibrated move counts, targets and star thresholds applied. */
export function getLevel(n: number): LevelDef {
  const id = Math.max(1, Math.min(TOTAL_LEVELS, Math.floor(n)));
  let lv = cache.get(id);
  if (!lv) {
    const cal = table[id];
    lv = cal ? applyCalibration(generateLevel(id, cal.s), cal) : generateLevel(id);
    cache.set(id, lv);
  }
  return lv;
}

export { TOTAL_LEVELS };

/** 1 star for clearing the level, 2/3 stars for beating the calibrated score thresholds. */
export function starsFor(score: number, st: [number, number, number]): number {
  return score >= st[2] ? 3 : score >= st[1] ? 2 : 1;
}

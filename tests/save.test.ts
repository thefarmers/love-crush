import { describe, expect, it } from 'vitest';
import { MAX_HEARTS, SaveStore } from '../src/state/save';

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('save store', () => {
  it('starts fresh with full hearts', () => {
    const s = new SaveStore(memory());
    expect(s.hearts).toBe(MAX_HEARTS);
    expect(s.data.unlocked).toBe(1);
  });

  it('persists progress across reloads', () => {
    const mem = memory();
    const a = new SaveStore(mem);
    expect(a.completeLevel(1, 3, 12000)).toBe(true);
    a.completeLevel(1, 2, 9000);
    a.loseHeart();
    const b = new SaveStore(mem);
    expect(b.data.unlocked).toBe(2);
    expect(b.data.stars[1]).toBe(3);
    expect(b.data.best[1]).toBe(12000);
    expect(b.hearts).toBe(MAX_HEARTS - 1);
    expect(b.totalStars()).toBe(3);
  });

  it('hearts bottom out at zero and refill by saying I love you', () => {
    const s = new SaveStore(memory());
    for (let i = 0; i < 10; i++) s.loseHeart();
    expect(s.hearts).toBe(0);
    s.refillHearts();
    expect(s.hearts).toBe(MAX_HEARTS);
    expect(s.data.stats.loveSaid).toBe(1);
  });

  it('boosters can only be spent when owned', () => {
    const s = new SaveStore(memory());
    expect(s.useBooster('rainbow')).toBe(false);
    s.addBooster('rainbow');
    expect(s.useBooster('rainbow')).toBe(true);
    expect(s.data.boosters.rainbow).toBe(0);
  });

  it('draws unseen love cards first', () => {
    const s = new SaveStore(memory());
    const seen = new Set<number>();
    for (let i = 0; i < 5; i++) seen.add(s.drawCard(5));
    expect(seen.size).toBe(5);
    expect(s.data.cards.sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('survives corrupted or unavailable storage', () => {
    const mem = memory();
    mem.setItem('love-crush-save-v1', '{not json');
    expect(new SaveStore(mem).hearts).toBe(MAX_HEARTS);
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    const s = new SaveStore(broken);
    s.loseHeart();
    expect(s.hearts).toBe(MAX_HEARTS - 1);
    expect(new SaveStore(null).hearts).toBe(MAX_HEARTS);
  });
});

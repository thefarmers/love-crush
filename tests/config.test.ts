import { describe, expect, it } from 'vitest';
import { PERSONAL as EXAMPLE_EN } from '../examples/personal.en';
import { PERSONAL } from '../src/config/personal';
import { validateConfig } from '../src/config/validate';
import { LOCALES } from '../src/i18n';
import { MECHANICS } from '../src/levels/mechanics';
import { THEMES } from '../src/render/themes';
import { judgeTyped } from '../src/voice/love';

describe('personal config', () => {
  it('the shipped config is valid', () => {
    expect(validateConfig(PERSONAL)).toEqual([]);
  });

  it('the English example config is valid and recognizes English love', () => {
    expect(validateConfig(EXAMPLE_EN)).toEqual([]);
    expect(judgeTyped('I love you so much', EXAMPLE_EN.loveKeywords, EXAMPLE_EN.secretPhrases).ok).toBe(true);
    expect(judgeTyped('You are the cutest person alive!', EXAMPLE_EN.loveKeywords, EXAMPLE_EN.secretPhrases)).toMatchObject({
      ok: true,
      secret: { reward: 'rainbow' },
    });
  });

  it('reports helpful problems', () => {
    const bad = { ...PERSONAL, partnerName: ' ', loveCards: [], specialLevels: { 0: 'x', 2000: 'y' }, bgm: '/music/a.mp3' };
    const issues = validateConfig(bad);
    expect(issues.join('\n')).toMatch(/partnerName/);
    expect(issues.join('\n')).toMatch(/loveCards/);
    expect(issues.join('\n')).toMatch(/specialLevels key 0/);
    expect(issues.join('\n')).toMatch(/specialLevels key 2000/);
    expect(issues.join('\n')).toMatch(/bgm/);
  });
});

describe('locales', () => {
  for (const [id, L] of Object.entries(LOCALES)) {
    it(`${id}: covers every chapter theme, fruit, mechanic and tutorial`, () => {
      expect(L.chapters).toHaveLength(THEMES.length);
      expect(L.fruits).toHaveLength(6);
      for (const m of MECHANICS) expect(L.mechanics[m.key], m.key).toBeTruthy();
      expect(L.tutorial).toHaveLength(10);
      for (const t of L.tutorial) expect(t.title && t.tip).toBeTruthy();
      expect(L.love.successLines('a', 'b').length).toBeGreaterThan(0);
    });
  }
});

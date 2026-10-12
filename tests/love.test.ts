import { describe, expect, it } from 'vitest';
import { PERSONAL } from '../src/config/personal';
import { containsLove, judgeAttempt, judgeTyped, levenshtein, matchSecret, normalize } from '../src/voice/love';

const K = PERSONAL.loveKeywords;
const S = PERSONAL.secretPhrases;

describe('love detection', () => {
  it('normalizes spacing, punctuation and stretched letters', () => {
    expect(normalize('รัก  นะ!!!')).toBe('รักนะ');
    expect(normalize('รักกกกกก')).toBe('รัก');
    expect(normalize('I Love   You')).toBe('iloveyou');
  });

  it('recognizes Thai and English declarations of love', () => {
    for (const t of ['รักนะ', 'รักเค้าที่สุดเลย', 'คิดถึงจัง', 'I love you', 'miss you so much', 'ซา รัง เฮ']) {
      expect(containsLove(t, K), t).toBe(true);
    }
    for (const t of ['สวัสดี', 'หิวข้าว', '', 'hello']) expect(containsLove(t, K), t).toBe(false);
  });

  it('matches secret phrases even with speech-to-text typos', () => {
    expect(matchSecret('วันนี้แฟนน่ารักที่สุด', S)?.reward).toBe('rainbow');
    expect(matchSecret('วันนี้ แฟน น่ารัก ที่สุด เลย', S)).not.toBeNull();
    expect(matchSecret('วันนี้แฟนน่ารักทีสุด', S)).not.toBeNull();
    expect(matchSecret('วันนี้ฝนตก', S)).toBeNull();
  });

  it('levenshtein distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('รัก', 'รัก')).toBe(0);
  });

  it('asks to speak louder when the voice is too quiet', () => {
    const v = judgeAttempt({ transcript: '', peak: 0.01, voicedMs: 0, recognition: true }, K, S);
    expect(v).toEqual({ ok: false, reason: 'quiet' });
  });

  it('rejects speech without love in it', () => {
    const v = judgeAttempt({ transcript: 'หิวข้าวจัง', peak: 0.2, voicedMs: 900, recognition: true }, K, S);
    expect(v).toEqual({ ok: false, reason: 'no-love' });
  });

  it('accepts a loud, clear "รักนะ"', () => {
    const v = judgeAttempt({ transcript: 'รักนะ', peak: 0.3, voicedMs: 800, recognition: true }, K, S);
    expect(v.ok).toBe(true);
  });

  it('rewards the secret phrase', () => {
    const v = judgeAttempt({ transcript: 'วันนี้แฟนน่ารักที่สุด', peak: 0.3, voicedMs: 1500, recognition: true }, K, S);
    expect(v.ok && v.secret?.reward).toBe('rainbow');
  });

  it('falls back to loudness when the browser cannot transcribe', () => {
    expect(judgeAttempt({ transcript: '', peak: 0.2, voicedMs: 1200, recognition: false }, K, S).ok).toBe(true);
    expect(judgeAttempt({ transcript: '', peak: 0.2, voicedMs: 200, recognition: false }, K, S)).toEqual({ ok: false, reason: 'quiet' });
  });

  it('typed fallback', () => {
    expect(judgeTyped('รักที่สุดเลย', K, S).ok).toBe(true);
    expect(judgeTyped('อืม', K, S)).toEqual({ ok: false, reason: 'no-love' });
  });
});

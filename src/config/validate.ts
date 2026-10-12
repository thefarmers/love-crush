import { LOCALES } from '../i18n';
import { TOTAL_LEVELS } from '../levels/difficulty';
import type { PersonalConfig } from './personal';

/** Human-readable problems with a personal config (empty = fine). Also checked by `npm test`. */
export function validateConfig(c: PersonalConfig): string[] {
  const issues: string[] = [];
  if (!(c.locale in LOCALES)) issues.push(`locale must be one of ${Object.keys(LOCALES).join(', ')} (got '${c.locale}')`);
  if (!c.partnerName.trim()) issues.push('partnerName is empty');
  if (!c.myName.trim()) issues.push('myName is empty');
  if (!c.loveKeywords.some((k) => k.trim())) issues.push('loveKeywords needs at least one word');
  if (!c.loveCards.length) issues.push('loveCards needs at least one card');
  c.loveCards.forEach((card, i) => {
    if (!card.text.trim()) issues.push(`loveCards[${i}] has no text`);
    if (card.photo && /^(https?:)?\/\//.test(card.photo) === false && card.photo.startsWith('/'))
      issues.push(`loveCards[${i}].photo should be relative, e.g. 'photos/us.jpg' (no leading slash)`);
  });
  c.secretPhrases.forEach((p, i) => {
    if (!p.phrase.trim()) issues.push(`secretPhrases[${i}] is empty`);
    if (p.reward !== 'rainbow') issues.push(`secretPhrases[${i}].reward must be 'rainbow'`);
  });
  if (!c.winMessages.length) issues.push('winMessages needs at least one line');
  if (!c.loseMessages.length) issues.push('loseMessages needs at least one line');
  if (c.bgm && c.bgm.startsWith('/')) issues.push(`bgm should be relative, e.g. 'music/our-song.mp3'`);
  for (const k of Object.keys(c.specialLevels)) {
    const n = Number(k);
    if (!Number.isInteger(n) || n < 1 || n > TOTAL_LEVELS) issues.push(`specialLevels key ${k} is not a level 1-${TOTAL_LEVELS}`);
  }
  return issues;
}

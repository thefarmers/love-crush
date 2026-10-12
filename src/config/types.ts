/** Shape of src/config/personal.ts — the one file a fork edits. */

export interface LoveCard {
  text: string;
  /** Optional photo path relative to the site root, e.g. 'photos/first-date.jpg'. */
  photo?: string;
  /** Small label on top of the card. */
  label?: string;
}

export interface SecretPhrase {
  phrase: string;
  reward: 'rainbow';
  message: string;
}

export type LocaleId = 'th' | 'en';

export interface PersonalConfig {
  locale: LocaleId;
  /** BCP-47 language for speech recognition. Empty = derive from `locale` (th-TH / en-US). */
  speechLang: string;
  partnerName: string;
  myName: string;
  loveKeywords: string[];
  secretPhrases: SecretPhrase[];
  loveCards: LoveCard[];
  winMessages: string[];
  loseMessages: string[];
  bgm: string;
  specialLevels: Record<number, string>;
}

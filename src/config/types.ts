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
  /** Link preview (Open Graph) text and the words drawn on og-image.png (`npm run og`). */
  share: ShareConfig;
}

export interface ShareConfig {
  /** Preview title (keep it under ~70 characters). */
  title: string;
  /** Preview description (~150 characters reads best). */
  description: string;
  /** Short line drawn on the preview image. */
  tagline: string;
  /** Up to three small badges on the preview image. */
  badges: string[];
  imageAlt: string;
}

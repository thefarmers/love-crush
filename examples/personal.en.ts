/**
 * English example config. To use it, copy this file over src/config/personal.ts and change the
 * import below to:  import type { PersonalConfig } from './types';
 */
import type { PersonalConfig } from '../src/config/types';

export const PERSONAL: PersonalConfig = {
  locale: 'en',
  speechLang: 'en-US',

  partnerName: 'Honey',
  myName: 'me',

  loveKeywords: ['love', 'miss you', 'adore', 'my heart'],

  secretPhrases: [
    { phrase: 'you are the cutest person alive', reward: 'rainbow', message: 'Secret phrase! A free rainbow pearl for you' },
  ],

  loveCards: [
    { label: 'a note from me', text: 'Thank you for making every ordinary day feel special.' },
    { label: 'a note from me', text: 'Even with 1,000 levels, I’d stay by your side for every single one.' },
    { label: 'coupon', text: 'One big hug coupon.\nValid forever. No questions asked.' },
    { label: 'coupon', text: 'You pick the restaurant next time.\nI won’t complain once.' },
    { label: 'a note from me', text: 'Your laugh is my favourite sound in the world.' },
    // { label: 'our first trip', text: 'Remember this?', photo: 'photos/first-trip.jpg' },
  ],

  winMessages: ['You’re amazing', 'Too good!', 'I’m so proud of you', 'Celebrate with a hug?'],
  loseMessages: ['That level cheated, surely', 'Snack break first?', 'Try again — you’ve got this'],

  bgm: '',

  share: {
    title: 'Love Crush — a match-3 you refill by saying “I love you”',
    description:
      'A 1,000-level match-3 for the web. Out of hearts? Say “I love you” into the mic. Art and music generated in code · open source, fork it into a gift.',
    tagline: 'Out of hearts? Say “I love you”.',
    badges: ['1,000 levels', 'Art & music in code', 'Open source'],
    imageAlt: 'Love Crush — a pastel fruit board with a cute couple holding a heart',
  },

  specialLevels: {
    14: 'Level 14 — our little Valentine’s',
    100: 'Level 100! I love you a hundred times more',
  },
};

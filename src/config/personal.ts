/**
 * ✏️  Make the game yours — this is the only file you need to edit.
 *     ปรับแต่งเกมให้เป็นของคุณสองคน — แก้ไฟล์นี้ไฟล์เดียวพอ
 *
 * - names, love-card messages, real-life coupons, secret phrases, special levels
 * - photos: put files in public/photos/ and reference them as 'photos/<file>.jpg'
 * - music:  put a song in public/music/ and set `bgm: 'music/<file>.mp3'`
 * - language: `locale` switches every UI string (see src/i18n). Write the content below in the
 *   same language, and list love keywords that speech recognition will hear in that language.
 *
 * An English example lives in examples/personal.en.ts — copy it over this file to start in English.
 * `npm test` validates this file (see validateConfig in config/validate.ts).
 */

import type { PersonalConfig } from './types';

export type { LocaleId, LoveCard, PersonalConfig, SecretPhrase } from './types';

export const PERSONAL: PersonalConfig = {
  /** UI language: 'th' or 'en'. */
  locale: 'th',
  speechLang: '',

  /** What the game calls the player (your partner). */
  partnerName: 'ตัวเอง',
  /** What the game calls you. */
  myName: 'เค้า',

  /** Any of these (after removing spaces) inside what is said counts as "I love you". */
  loveKeywords: ['รัก', 'คิดถึง', 'love', 'missyou', 'ชอบ', 'ซารังเฮ', 'saranghae', 'จุ๊บ'],

  /** Say one of these (approximately) for a free rainbow booster next level. */
  secretPhrases: [
    {
      phrase: 'วันนี้แฟนน่ารักที่สุด',
      reward: 'rainbow',
      message: 'ประโยคลับ — ได้ไข่มุกสายรุ้งฟรี 1 ลูก',
    },
    {
      phrase: 'รักเค้าที่สุดในโลก',
      reward: 'rainbow',
      message: 'รู้อยู่แล้วแต่อยากได้ยินอีก รับไข่มุกสายรุ้งไปเลย',
    },
  ],

  /** Cards revealed every time the player says "I love you". Coupons are redeemable in real life. */
  loveCards: [
    { label: 'ข้อความจากเค้า', text: 'ขอบคุณที่เข้ามาเป็นความสุขในทุกๆ วันนะ' },
    { label: 'ข้อความจากเค้า', text: 'เหนื่อยแค่ไหน แค่เห็นหน้าตัวเองก็หายเหนื่อยแล้ว' },
    { label: 'ข้อความจากเค้า', text: 'เค้ารักตัวเองมากกว่าเมื่อวาน แต่น้อยกว่าพรุ่งนี้' },
    { label: 'ข้อความจากเค้า', text: 'ต่อให้มี 1,000 ด่าน เค้าก็จะอยู่ข้างๆ ทุกด่านเลย' },
    { label: 'ข้อความจากเค้า', text: 'รอยยิ้มของตัวเองคือคอมโบที่แรงที่สุดในโลก' },
    { label: 'คูปอง', text: 'คูปองกอดแน่นๆ 1 ครั้ง\nใช้ได้ทันที ไม่มีวันหมดอายุ' },
    { label: 'ข้อความจากเค้า', text: 'หัวใจเค้าไม่มีวันหมด เพราะมีตัวเองคอยเติมให้ตลอด' },
    { label: 'ข้อความจากเค้า', text: 'ตัวเองน่ารักที่สุดในจักรวาล\n(อันนี้ข้อเท็จจริงนะ ไม่ได้อวย)' },
    { label: 'คูปอง', text: 'คูปองเลือกร้านข้าวมื้อหน้า 1 ครั้ง\nเค้าไม่บ่นสักคำ' },
    { label: 'ข้อความจากเค้า', text: 'ไม่ต้องเก่งทุกด่านก็ได้ แค่มีความสุขก็พอแล้ว' },
    { label: 'ข้อความจากเค้า', text: 'เวลาตัวเองหัวเราะ โลกทั้งใบสว่างขึ้นเลยรู้มั้ย' },
    { label: 'คูปอง', text: 'คูปองให้เค้านวดไหล่ 10 นาที\nแลกได้ทุกเมื่อ' },
    { label: 'ข้อความจากเค้า', text: 'ขอบคุณที่อดทนกับเค้านะ รักนะคนเก่ง' },
    { label: 'ข้อความจากเค้า', text: 'เค้าแอบยิ้มคนเดียวทุกครั้งที่นึกถึงตัวเอง' },
    { label: 'คูปอง', text: 'คูปองขอให้เค้าทำอะไรก็ได้ 1 อย่าง\n(ที่ไม่ผิดกฎหมายนะ)' },
    { label: 'ข้อความจากเค้า', text: 'อยู่ด้วยกันไปนานๆ นะ' },
    { label: 'ข้อความจากเค้า', text: 'ไม่ว่าจะเกิดอะไรขึ้น เค้าอยู่ตรงนี้เสมอ' },
    { label: 'คูปอง', text: 'คูปองสมูทตี้ผลไม้ 1 แก้ว\nเค้าเลี้ยงเอง' },
    { label: 'ข้อความจากเค้า', text: 'ขอบคุณที่เลือกเค้านะ' },
    { label: 'ข้อความจากเค้า', text: 'ตัวเองคือด่านเดียวที่เค้าไม่อยากผ่านไปไหนเลย' },
  ],

  /** Random line on the win screen. */
  winMessages: [
    'เก่งที่สุดเลย',
    'ตัวเองโปรจริงๆ นะ',
    'เค้าภูมิใจในตัวเองนะ',
    'ด่านนี้แพ้ความน่ารักของตัวเอง',
    'ผลไม้ทั้งตะกร้ายังหวานไม่เท่าตัวเอง',
    'ฉลองด้วยการกอดเค้าหนึ่งที',
  ],

  /** Shown on the lose screen (no pressure!). */
  loseMessages: ['ไม่เป็นไรน้า เอาใหม่', 'ด่านนี้ขี้โกงแน่ๆ', 'พักกินผลไม้ก่อนก็ได้'],

  /**
   * Background music. Leave empty for the built-in piano piece, or put your song in
   * public/music/ and write e.g. 'music/our-song.mp3' — it will loop softly while playing.
   */
  bgm: '',

  /** Extra love note shown on specific levels' intro. */
  specialLevels: {
    14: 'ด่าน 14 นี้ให้เป็นวันวาเลนไทน์ของเรา',
    100: 'ด่านที่ 100 แล้ว เค้ารักตัวเองเป็นร้อยเท่าเลยนะ',
    214: '14 ก.พ. ในรูปแบบด่าน',
    1000: 'ด่านสุดท้าย... แต่ความรักของเราไม่มีด่านสุดท้ายนะ',
  },
};

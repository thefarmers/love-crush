import { PERSONAL, type LocaleId } from '../config/personal';
import type { LevelDef } from '../core/types';
import { en } from './en';
import { th, type Locale } from './th';

export type { Locale };

export const LOCALES: Record<LocaleId, Locale> = { th, en };

/** Active UI strings, picked by PERSONAL.locale (falls back to Thai). */
export const L: Locale = LOCALES[PERSONAL.locale] ?? th;

/** Language used for speech recognition. */
export const SPEECH_LANG = PERSONAL.speechLang || L.meta.speech;

export function levelTitle(lv: LevelDef): string | undefined {
  return lv.tutorial ? L.tutorial[lv.tutorial - 1]?.title : undefined;
}

export function levelTip(lv: LevelDef): string | undefined {
  return lv.tutorial ? L.tutorial[lv.tutorial - 1]?.tip : undefined;
}

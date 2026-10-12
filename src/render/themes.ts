/**
 * One theme per 20-level chapter. All stay in the same light "blush & ivory" family — only the
 * undertone shifts — so the game always feels calm and premium.
 */
export interface Theme {
  /** Background gradient top → bottom. */
  bg: [string, string, string];
  /** Floating petals / hearts tint. */
  heart: string;
}

export const THEMES: Theme[] = [
  { bg: ['#fffafb', '#fdf0f4', '#f9e3ea'], heart: '#eaa9bc' },
  { bg: ['#fcfaff', '#f5eff9', '#ece2f4'], heart: '#c3abdc' },
  { bg: ['#fffbf8', '#fdf1ea', '#f8e2d6'], heart: '#e9b49c' },
  { bg: ['#fffafa', '#fcedef', '#f6dade'], heart: '#e19aab' },
  { bg: ['#fffdf8', '#faf3e8', '#f2e5d0'], heart: '#d6b886' },
  { bg: ['#fbfcff', '#f1f4fb', '#e5eaf5'], heart: '#adbbdc' },
  { bg: ['#fdfaff', '#f6eefa', '#eddff5'], heart: '#c7a2df' },
  { bg: ['#fffaf7', '#fdeee6', '#f9dfd2'], heart: '#eba78c' },
  { bg: ['#fbfdfa', '#f0f5ee', '#e3ecdf'], heart: '#a9c6a0' },
  { bg: ['#ffffff', '#f8f3f6', '#efe6ec'], heart: '#d4b5c7' },
];

export function themeFor(level: number): Theme {
  return THEMES[Math.floor((Math.max(1, level) - 1) / 20) % THEMES.length];
}

export function chapterOf(level: number): number {
  return Math.floor((Math.max(1, level) - 1) / 20);
}

export function applyTheme(theme: Theme): void {
  const s = document.documentElement.style;
  s.setProperty('--bg1', theme.bg[0]);
  s.setProperty('--bg2', theme.bg[1]);
  s.setProperty('--bg3', theme.bg[2]);
  s.setProperty('--heart', theme.heart);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.bg[0]);
}

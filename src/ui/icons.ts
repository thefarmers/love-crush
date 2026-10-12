/** Thin-line icon set (24×24, stroke = currentColor) used instead of emoji for a calmer, premium look. */

const PATHS: Record<string, string> = {
  home: '<path d="M4 10.6 12 4l8 6.6V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9v5.5H5.5A1.5 1.5 0 0 1 4 19z"/>',
  settings:
    '<path d="M4 7.5h9M17 7.5h3M4 16.5h3M11 16.5h9"/><circle cx="15" cy="7.5" r="2"/><circle cx="9" cy="16.5" r="2"/>',
  book: '<path d="M12 6.8C10.4 5.3 7.9 4.8 4 4.8v13.6c3.9 0 6.4.5 8 2 1.6-1.5 4.1-2 8-2V4.8c-3.9 0-6.4.5-8 2z"/><path d="M12 6.8v13.6"/>',
  pause: '<path d="M9.5 6v12M14.5 6v12"/>',
  bulb: '<path d="M9.5 18h5M10.5 21h3"/><path d="M12 3.5a5.8 5.8 0 0 0-3.4 10.5c.6.5 1 1.1 1 2h4.8c0-.9.4-1.5 1-2A5.8 5.8 0 0 0 12 3.5z"/>',
  mic: '<rect x="9" y="3.5" width="6" height="10.5" rx="3"/><path d="M5.8 11.2a6.2 6.2 0 0 0 12.4 0M12 17.5v3"/>',
  heart: '<path d="M12 19.6s-7-4.3-7-9.7A3.9 3.9 0 0 1 12 7.6a3.9 3.9 0 0 1 7 2.3c0 5.4-7 9.7-7 9.7z"/>',
  star: '<path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.3L12 16.3l-4.8 2.5.9-5.3-3.9-3.8 5.4-.8z"/>',
  play: '<path d="M8.5 6v12l9.5-6z"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.2l2.6 1.8"/>',
  pearl: '<circle cx="12" cy="12" r="7.5"/><path d="M8.6 9.8A3.8 3.8 0 0 1 11.4 8"/>',
  sparkle: '<path d="M12 4c.6 3.6 1.9 5 5.5 5.6-3.6.6-4.9 2-5.5 5.6-.6-3.6-1.9-5-5.5-5.6C10.1 9 11.4 7.6 12 4z"/><path d="M18.5 15.5c.2 1.3.7 1.8 2 2-1.3.2-1.8.7-2 2-.2-1.3-.7-1.8-2-2 1.3-.2 1.8-.7 2-2z"/>',
  keyboard:
    '<rect x="3" y="6.5" width="18" height="11" rx="2"/><path d="M7 10.5h.01M10.3 10.5h.01M13.7 10.5h.01M17 10.5h.01M8 14h8"/>',
  restart: '<path d="M5 12a7 7 0 1 0 2.1-5"/><path d="M5 5v4h4"/>',
  back: '<path d="M14.5 6 8.5 12l6 6"/>',
  flame:
    '<path d="M12 20.5c-3.3 0-5.6-2.2-5.6-5.2 0-3.1 2.7-4.8 3.3-7.8 1.9 1.1 2.9 2.8 3 4.3.7-.6 1.2-1.5 1.3-2.6 1.9 1.5 3.6 3.6 3.6 6.1 0 3-2.3 5.2-5.6 5.2z"/>',
  crown: '<path d="M4.5 17.5 3.5 8l5 3.5L12 5.5l3.5 6 5-3.5-1 9.5z"/><path d="M4.5 20h15"/>',
  map: '<path d="M9 5 4 7v12l5-2 6 2 5-2V5l-5 2z"/><path d="M9 5v12M15 7v12"/>',
  music: '<path d="M9 17.5V6l10-2v11.5"/><circle cx="6.8" cy="17.5" r="2.2"/><circle cx="16.8" cy="15.5" r="2.2"/>',
};

export function icon(name: keyof typeof PATHS | string, cls = ''): string {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? ''}</svg>`;
}

/** Filled heart row (hearts left out of 5). */
export function heartsRow(full: number, total = 5): string {
  return Array.from({ length: total }, (_, i) => icon('heart', i < full ? 'h on' : 'h')).join('');
}

/** Three stars, `lit` of them gold. */
export function starsRow(lit: number): string {
  return [0, 1, 2].map((i) => icon('star', i < lit ? 'st on' : 'st')).join('');
}

const ROMAN: [number, string][] = [
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

export function roman(n: number): string {
  let out = '';
  for (const [v, s] of ROMAN) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}

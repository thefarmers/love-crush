import { PERSONAL } from '../config/personal';
import { L } from '../i18n';

export type Mood = 'happy' | 'sad' | 'love' | 'wow';

const HEART = 'M0,9 C-2,7 -10,3 -9.5,-3 C-9,-9.5 -1.2,-10 0,-4.5 C1.2,-10 9,-9.5 9.5,-3 C10,3 2,7 0,9Z';

/**
 * The two of you as soft "mochi" characters sharing a heart, drawn in thin lines on ivory and
 * blush. Left = PERSONAL.myName (you), right = PERSONAL.partnerName.
 */
export function coupleSVG(mood: Mood = 'happy', opts: { names?: boolean; size?: number } = {}): string {
  const eyes = (cx: number, cy: number) => {
    switch (mood) {
      case 'sad':
        return `
          <path d="M${cx - 12},${cy - 1} q5,3.5 10,0" class="ink"/>
          <path d="M${cx + 8},${cy - 1} q5,3.5 10,0" class="ink"/>
          <path d="M${cx - 8},${cy + 5} q-2.6,6.5 0,8 q2.6,-1.5 0,-8" fill="#bcd9f0" class="tear"/>`;
      case 'love':
        return [cx - 7, cx + 13]
          .map((x) => `<path transform="translate(${x},${cy}) scale(0.38)" d="${HEART}" fill="#d9577a"/>`)
          .join('');
      case 'wow':
        return `<circle cx="${cx - 7}" cy="${cy}" r="3.4" fill="#5a3d48"/><circle cx="${cx + 13}" cy="${cy}" r="3.4" fill="#5a3d48"/>
                <circle cx="${cx - 5.8}" cy="${cy - 1.2}" r="1.1" fill="#fff"/><circle cx="${cx + 14.2}" cy="${cy - 1.2}" r="1.1" fill="#fff"/>`;
      default:
        return `<path d="M${cx - 12},${cy + 2} q5,-6.5 10,0" class="ink"/><path d="M${cx + 8},${cy + 2} q5,-6.5 10,0" class="ink"/>`;
    }
  };
  const mouth = (cx: number, cy: number) =>
    mood === 'sad'
      ? `<path d="M${cx - 2},${cy + 4} q5,-4.5 10,0" class="ink thin"/>`
      : mood === 'wow'
        ? `<ellipse cx="${cx + 3}" cy="${cy + 3}" rx="3" ry="3.8" fill="#c9607f"/>`
        : `<path d="M${cx - 2},${cy} q2.5,4 5,0 q2.5,4 5,0" class="ink thin"/>`;
  const names = opts.names
    ? `<text x="80" y="190" class="tag">${PERSONAL.myName}</text><text x="162" y="190" class="tag">${PERSONAL.partnerName}</text>`
    : '';
  const size = opts.size ?? 220;
  return `
<svg class="couple mood-${mood}" viewBox="0 0 240 ${opts.names ? 198 : 176}" width="${size}" role="img" aria-label="${PERSONAL.myName} ${L.meta.and} ${PERSONAL.partnerName}">
  <defs>
    <radialGradient id="mochiA" cx="38%" cy="30%" r="78%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#f7e9ee"/></radialGradient>
    <radialGradient id="mochiB" cx="38%" cy="30%" r="78%"><stop offset="0" stop-color="#fff6f8"/><stop offset="1" stop-color="#f6d4de"/></radialGradient>
    <linearGradient id="heartG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4a9be"/><stop offset="1" stop-color="#cf5a7e"/></linearGradient>
  </defs>
  <style>
    .ink{fill:none;stroke:#5a3d48;stroke-width:2.6;stroke-linecap:round}
    .thin{stroke-width:2}
    .tag{font:400 13px Kanit,sans-serif;fill:#a94a68;text-anchor:middle;letter-spacing:.02em}
  </style>
  <g class="float-hearts">
    <g class="fh fh1"><path transform="translate(120,32) scale(0.55)" d="${HEART}" fill="#e8a0b5"/></g>
    <g class="fh fh2"><path transform="translate(100,46) scale(0.36)" d="${HEART}" fill="#f2c4d2"/></g>
    <g class="fh fh3"><path transform="translate(142,44) scale(0.4)" d="${HEART}" fill="#d9b06c"/></g>
  </g>
  <g class="mochi mochi-a">
    <ellipse cx="80" cy="167" rx="40" ry="5" fill="rgba(169,74,104,0.10)"/>
    <path d="M80,74 C111,74 130,101 130,128 C130,155 109,165 80,165 C51,165 30,155 30,128 C30,101 49,74 80,74Z" fill="url(#mochiA)" stroke="#e2b4c2" stroke-width="1.8"/>
    <path d="M78,75 q-7,-13 -16,-12 q5,9 16,12Z" fill="#9fd08a" stroke="#6fae63" stroke-width="1.2"/>
    <path d="M81,75 q6,-13 15,-13 q-4,10 -15,13Z" fill="#9fd08a" stroke="#6fae63" stroke-width="1.2"/>
    ${eyes(68, 119)}
    <ellipse cx="56" cy="132" rx="7" ry="4.2" fill="#f5b7c7" opacity=".7"/>
    <ellipse cx="102" cy="132" rx="7" ry="4.2" fill="#f5b7c7" opacity=".7"/>
    ${mouth(76, 131)}
    <ellipse cx="123" cy="141" rx="8" ry="6.2" fill="#fbf1f4" stroke="#e2b4c2" stroke-width="1.6" transform="rotate(-25 123 141)"/>
  </g>
  <g class="mochi mochi-b">
    <ellipse cx="162" cy="167" rx="40" ry="5" fill="rgba(169,74,104,0.10)"/>
    <path d="M162,76 C193,76 212,103 212,130 C212,156 191,165 162,165 C133,165 112,156 112,130 C112,103 131,76 162,76Z" fill="url(#mochiB)" stroke="#e0a5b8" stroke-width="1.8"/>
    <g transform="translate(178,83) rotate(16)">
      <path d="M0,0 l-11,-7 v14z M0,0 l11,-7 v14z" fill="#e7a0b6" stroke="#c9607f" stroke-width="1.2" stroke-linejoin="round"/>
      <circle r="3.2" fill="#c9a15a"/>
    </g>
    ${eyes(150, 121)}
    <ellipse cx="138" cy="134" rx="7" ry="4.2" fill="#f0a3b8" opacity=".75"/>
    <ellipse cx="184" cy="134" rx="7" ry="4.2" fill="#f0a3b8" opacity=".75"/>
    ${mouth(158, 133)}
    <ellipse cx="118" cy="143" rx="8" ry="6.2" fill="#f9e1e8" stroke="#e0a5b8" stroke-width="1.6" transform="rotate(25 118 143)"/>
  </g>
  <g class="held-heart"><g transform="translate(121,129)">
    <path transform="scale(1.75)" d="${HEART}" fill="url(#heartG)"/>
    <ellipse cx="-6.5" cy="-5.5" rx="3.6" ry="2.1" fill="#fff" opacity=".7" transform="rotate(-30 -6.5 -5.5)"/>
  </g></g>
  ${names}
</svg>`;
}

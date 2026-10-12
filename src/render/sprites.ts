/**
 * Procedurally painted sprites (no image assets): six fruits, specials, items and blockers,
 * styled for a light, minimal "blush & ivory" look. Every sprite is rendered once per size into
 * an offscreen canvas and blitted each frame.
 */

export interface FruitStyle {
  name: string;
  light: string;
  base: string;
  dark: string;
  rim: string;
  /** Color used for beams / glows of this fruit's specials. */
  glow: string;
}

export const FRUITS: FruitStyle[] = [
  { name: 'strawberry', light: '#ffa7b8', base: '#ef4762', dark: '#b51f3f', rim: '#8d1632', glow: '#ef6a83' },
  { name: 'orange', light: '#ffd79a', base: '#ff9a32', dark: '#dd6512', rim: '#a64a0b', glow: '#ffae5c' },
  { name: 'lemon', light: '#fff8c4', base: '#ffe052', dark: '#e2b417', rim: '#a68312', glow: '#f3cf45' },
  { name: 'apple', light: '#e1f7a6', base: '#94d152', dark: '#4f9b2b', rim: '#3a7520', glow: '#9fd36a' },
  { name: 'blueberry', light: '#b6c3ff', base: '#5b6fe2', dark: '#2f3c9f', rim: '#232c7a', glow: '#7d8df0' },
  { name: 'grape', light: '#e6c0ff', base: '#a564e2', dark: '#6b2fa8', rim: '#4e1f80', glow: '#b685ea' },
];

/** Kept for older call sites: fruits replaced gems. */
export const GEMS = FRUITS;

export const GOLD = '#c9a15a';
export const ROSE = '#c9607f';

export type Canvas = HTMLCanvasElement;

function makeCanvas(w: number, h = w): Canvas {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/** Tiny deterministic PRNG so textures (seeds, pores) look the same every time. */
function prng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

// ───────────────────────────── shared paths ─────────────────────────────

export function heartPath(ctx: CanvasRenderingContext2D | Path2D, s = 1): void {
  ctx.moveTo(0, 0.9 * s);
  ctx.bezierCurveTo(-0.15 * s, 0.75 * s, -1.0 * s, 0.25 * s, -0.95 * s, -0.3 * s);
  ctx.bezierCurveTo(-0.9 * s, -0.95 * s, -0.12 * s, -1.0 * s, 0, -0.45 * s);
  ctx.bezierCurveTo(0.12 * s, -1.0 * s, 0.9 * s, -0.95 * s, 0.95 * s, -0.3 * s);
  ctx.bezierCurveTo(1.0 * s, 0.25 * s, 0.15 * s, 0.75 * s, 0, 0.9 * s);
  ctx.closePath();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha = 1, color = '#fff'): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(r * 0.12, -r * 0.12, r, 0);
  ctx.quadraticCurveTo(r * 0.12, r * 0.12, 0, r);
  ctx.quadraticCurveTo(-r * 0.12, r * 0.12, -r, 0);
  ctx.quadraticCurveTo(-r * 0.12, -r * 0.12, 0, -r);
  ctx.fill();
  ctx.restore();
}

// Fruit silhouettes as Path2D in unit space (s = 1); scaled at draw time.

const STRAWBERRY = (() => {
  const p = new Path2D();
  p.moveTo(0, 0.95);
  p.bezierCurveTo(-0.36, 0.86, -0.9, 0.28, -0.88, -0.22);
  p.bezierCurveTo(-0.86, -0.6, -0.45, -0.68, 0, -0.6);
  p.bezierCurveTo(0.45, -0.68, 0.86, -0.6, 0.88, -0.22);
  p.bezierCurveTo(0.9, 0.28, 0.36, 0.86, 0, 0.95);
  p.closePath();
  return p;
})();

const ORANGE = (() => {
  const p = new Path2D();
  p.ellipse(0, 0.07, 0.86, 0.82, 0, 0, Math.PI * 2);
  return p;
})();

const LEMON = (() => {
  const p = new Path2D();
  const m = new DOMMatrix().translate(0, 0.05).rotate(-24);
  const q = new Path2D();
  q.moveTo(-0.98, 0);
  q.bezierCurveTo(-0.9, -0.1, -0.72, -0.62, 0, -0.63);
  q.bezierCurveTo(0.72, -0.62, 0.9, -0.1, 0.98, 0);
  q.bezierCurveTo(0.9, 0.1, 0.72, 0.62, 0, 0.63);
  q.bezierCurveTo(-0.72, 0.62, -0.9, 0.1, -0.98, 0);
  q.closePath();
  p.addPath(q, m);
  return p;
})();

const APPLE = (() => {
  const p = new Path2D();
  p.moveTo(0, -0.46);
  p.bezierCurveTo(0.26, -0.74, 0.92, -0.7, 0.9, -0.02);
  p.bezierCurveTo(0.88, 0.56, 0.5, 0.95, 0.2, 0.9);
  p.bezierCurveTo(0.09, 0.87, -0.09, 0.87, -0.2, 0.9);
  p.bezierCurveTo(-0.5, 0.95, -0.88, 0.56, -0.9, -0.02);
  p.bezierCurveTo(-0.92, -0.7, -0.26, -0.74, 0, -0.46);
  p.closePath();
  return p;
})();

const BERRIES: [number, number, number][] = [
  [-0.36, -0.3, 0.5],
  [0.12, 0.14, 0.76],
];
const BLUEBERRY = (() => {
  const p = new Path2D();
  for (const [x, y, r] of BERRIES) {
    p.moveTo(x + r, y);
    p.arc(x, y, r, 0, Math.PI * 2);
  }
  return p;
})();

const GRAPES: [number, number][] = [
  [-0.58, -0.38],
  [0, -0.42],
  [0.58, -0.38],
  [-0.29, 0.12],
  [0.29, 0.12],
  [0, 0.6],
];
const GRAPE_R = 0.31;
const GRAPE = (() => {
  const p = new Path2D();
  for (const [x, y] of GRAPES) {
    p.moveTo(x + GRAPE_R, y);
    p.arc(x, y, GRAPE_R, 0, Math.PI * 2);
  }
  return p;
})();

const SILHOUETTES = [STRAWBERRY, ORANGE, LEMON, APPLE, BLUEBERRY, GRAPE];

/** Fill/clip with the fruit silhouette, in a context already scaled so 1 unit = s px. */
function silhouette(color: number): Path2D {
  return SILHOUETTES[color % SILHOUETTES.length];
}

// ───────────────────────────── painters ─────────────────────────────

/** isPointInPath takes device coordinates, so map the unit-space point through the transform first. */
function inPath(ctx: CanvasRenderingContext2D, path: Path2D, x: number, y: number): boolean {
  const p = ctx.getTransform().transformPoint(new DOMPoint(x, y));
  return ctx.isPointInPath(path, p.x, p.y);
}

function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, wid: number, angle: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(len * 0.3, -wid, len * 0.75, -wid * 0.9, len, 0);
  ctx.bezierCurveTo(len * 0.75, wid * 0.9, len * 0.3, wid, 0, 0);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -wid, 0, wid);
  g.addColorStop(0, '#9fdb7f');
  g.addColorStop(1, '#3f9150');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,100,50,0.55)';
  ctx.lineWidth = 0.025;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(len * 0.08, 0);
  ctx.quadraticCurveTo(len * 0.5, -wid * 0.12, len * 0.9, 0);
  ctx.strokeStyle = 'rgba(230,255,220,0.55)';
  ctx.lineWidth = 0.02;
  ctx.stroke();
  ctx.restore();
}

function stem(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo((x0 + x1) / 2 + 0.06, (y0 + y1) / 2, x1, y1);
  ctx.strokeStyle = '#7a5236';
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function shadedBody(ctx: CanvasRenderingContext2D, path: Path2D, st: FruitStyle, cx = -0.35, cy = -0.4): void {
  const body = ctx.createRadialGradient(cx, cy, 0.05, 0, 0.1, 1.15);
  body.addColorStop(0, st.light);
  body.addColorStop(0.42, st.base);
  body.addColorStop(1, st.dark);
  ctx.fillStyle = body;
  ctx.fill(path);
}

function highlight(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = -0.6, alpha = 0.85): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(255,255,255,${alpha})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.scale(1, ry / rx);
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paintFruitBody(ctx: CanvasRenderingContext2D, color: number): void {
  const st = FRUITS[color];
  const rnd = prng(color * 977 + 13);
  switch (color) {
    case 0: {
      // strawberry
      shadedBody(ctx, STRAWBERRY, st, -0.35, -0.3);
      ctx.save();
      ctx.clip(STRAWBERRY);
      for (let row = 0; row < 7; row++) {
        const y = -0.42 + row * 0.2;
        for (let col = -4; col <= 4; col++) {
          const x = col * 0.24 + (row % 2 ? 0.12 : 0);
          if (!inPath(ctx, STRAWBERRY, x, y) || !inPath(ctx, STRAWBERRY, x, y + 0.1)) continue;
          ctx.fillStyle = 'rgba(140,20,40,0.28)';
          ctx.beginPath();
          ctx.ellipse(x + 0.012, y + 0.02, 0.045, 0.068, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffe7a6';
          ctx.beginPath();
          ctx.ellipse(x, y, 0.032, 0.055, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      highlight(ctx, -0.4, -0.25, 0.26, 0.12, -0.9);
      for (const [a, l] of [
        [Math.PI * 0.94, 0.46],
        [Math.PI * 1.18, 0.4],
        [Math.PI * 1.5, 0.3],
        [Math.PI * 1.82, 0.4],
        [Math.PI * 0.06, 0.46],
      ] as const) {
        leaf(ctx, 0, -0.6, l, 0.14, a);
      }
      stem(ctx, 0, -0.62, 0.06, -0.92, 0.07);
      break;
    }
    case 1: {
      // orange / mandarin
      shadedBody(ctx, ORANGE, st);
      ctx.save();
      ctx.clip(ORANGE);
      for (let k = 0; k < 70; k++) {
        const a = rnd() * Math.PI * 2;
        const r = Math.sqrt(rnd()) * 0.8;
        ctx.fillStyle = rnd() < 0.5 ? 'rgba(170,70,0,0.16)' : 'rgba(255,240,200,0.28)';
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r, 0.07 + Math.sin(a) * r, 0.018, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      highlight(ctx, -0.36, -0.32, 0.3, 0.16);
      ctx.fillStyle = '#5a8a3a';
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k * Math.PI * 2) / 5;
        ctx.lineTo(Math.cos(a) * 0.09, -0.72 + Math.sin(a) * 0.07);
        ctx.lineTo(Math.cos(a + 0.6) * 0.035, -0.72 + Math.sin(a + 0.6) * 0.03);
      }
      ctx.fill();
      leaf(ctx, 0.04, -0.76, 0.5, 0.17, -0.45);
      break;
    }
    case 2: {
      // lemon
      shadedBody(ctx, LEMON, st, -0.3, -0.35);
      ctx.save();
      ctx.clip(LEMON);
      for (let k = 0; k < 60; k++) {
        const x = (rnd() - 0.5) * 1.8;
        const y = (rnd() - 0.5) * 1.2;
        ctx.fillStyle = 'rgba(190,140,0,0.13)';
        ctx.beginPath();
        ctx.arc(x, y, 0.016, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      highlight(ctx, -0.32, -0.22, 0.32, 0.12, -0.45);
      leaf(ctx, 0.78, -0.42, 0.36, 0.12, -1.2);
      break;
    }
    case 3: {
      // green apple
      shadedBody(ctx, APPLE, st, -0.32, -0.3);
      ctx.save();
      ctx.clip(APPLE);
      const blush = ctx.createRadialGradient(0.45, 0.35, 0, 0.45, 0.35, 0.6);
      blush.addColorStop(0, 'rgba(255,214,120,0.35)');
      blush.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = blush;
      ctx.fillRect(-1, -1, 2, 2);
      for (let k = 0; k < 26; k++) {
        ctx.fillStyle = 'rgba(245,255,220,0.5)';
        ctx.beginPath();
        ctx.arc((rnd() - 0.5) * 1.6, (rnd() - 0.4) * 1.4, 0.014, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      highlight(ctx, -0.42, -0.2, 0.26, 0.14, -0.9);
      stem(ctx, 0, -0.44, 0.07, -0.9, 0.075);
      leaf(ctx, 0.07, -0.8, 0.44, 0.15, -0.35);
      break;
    }
    case 4: {
      // blueberries
      BERRIES.forEach(([x, y, r], i) => {
        const p = new Path2D();
        p.arc(x, y, r, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.05, x, y, r * 1.1);
        g.addColorStop(0, i ? st.light : '#93a2f2');
        g.addColorStop(0.45, i ? st.base : '#4a5cc9');
        g.addColorStop(1, st.dark);
        ctx.fillStyle = g;
        ctx.fill(p);
        // waxy bloom
        const bloom = ctx.createRadialGradient(x, y - r * 0.2, 0, x, y, r);
        bloom.addColorStop(0, 'rgba(230,235,255,0.28)');
        bloom.addColorStop(1, 'rgba(230,235,255,0.04)');
        ctx.fillStyle = bloom;
        ctx.fill(p);
        // crown
        const cx = x + r * 0.05;
        const cy = y - r * 0.55;
        const cr = r * 0.2;
        ctx.fillStyle = '#26307a';
        ctx.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = -Math.PI / 2 + (k * Math.PI) / 5;
          const rr = k % 2 ? cr * 0.45 : cr;
          ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.7);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(180,190,255,0.5)';
        ctx.beginPath();
        ctx.ellipse(cx, cy, cr * 0.3, cr * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        highlight(ctx, x - r * 0.4, y - r * 0.2, r * 0.35, r * 0.17, -0.8, 0.7);
      });
      leaf(ctx, -0.55, -0.72, 0.4, 0.13, -2.6);
      break;
    }
    default: {
      // grapes
      stem(ctx, 0, -0.66, 0.1, -0.98, 0.07);
      leaf(ctx, 0.02, -0.82, 0.48, 0.18, -2.75);
      const order = [...GRAPES].sort((a, b) => a[1] - b[1]);
      for (const [x, y] of order) {
        const p = new Path2D();
        p.arc(x, y, GRAPE_R, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(x - 0.1, y - 0.12, 0.02, x, y, GRAPE_R * 1.1);
        g.addColorStop(0, st.light);
        g.addColorStop(0.5, st.base);
        g.addColorStop(1, st.dark);
        ctx.fillStyle = g;
        ctx.fill(p);
        ctx.strokeStyle = 'rgba(78,31,128,0.35)';
        ctx.lineWidth = 0.02;
        ctx.stroke(p);
        highlight(ctx, x - 0.1, y - 0.12, 0.11, 0.06, -0.7, 0.8);
      }
    }
  }
}

function paintFruit(size: number, color: number, scale = 1): Canvas {
  const cv = makeCanvas(size);
  const ctx = cv.getContext('2d')!;
  const s = size * 0.4 * scale;
  ctx.translate(size / 2, size / 2);
  ctx.scale(s, s);
  // soft warm contact shadow
  ctx.save();
  ctx.shadowColor = 'rgba(150,70,100,0.28)';
  ctx.shadowBlur = size * 0.05;
  ctx.shadowOffsetY = size * 0.03;
  ctx.fillStyle = FRUITS[color].base;
  ctx.fill(silhouette(color));
  ctx.restore();
  // A whisper of outline so fruits read crisply on the white board. Stroked *before* the body so
  // only the outer half survives (no seams where blueberries/grapes overlap).
  ctx.strokeStyle = FRUITS[color].rim + '66';
  ctx.lineWidth = 0.045;
  ctx.stroke(silhouette(color));
  paintFruitBody(ctx, color);
  return cv;
}

type BakedSpecial = 'lineH' | 'lineV' | 'bomb' | 'cupid';

function goldHeart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  heartPath(ctx);
  const g = ctx.createLinearGradient(0, -1, 0, 1);
  g.addColorStop(0, '#f1dcaa');
  g.addColorStop(1, '#b8883c');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

/** Fruit with its special decoration baked in. */
function paintSpecial(size: number, color: number, kind: BakedSpecial): Canvas {
  const cv = makeCanvas(size);
  const ctx = cv.getContext('2d')!;
  const st = FRUITS[color];
  const s = size * 0.4;
  ctx.translate(size / 2, size / 2);
  if (kind === 'bomb') {
    const aura = ctx.createRadialGradient(0, 0, s * 0.6, 0, 0, s * 1.2);
    aura.addColorStop(0, st.glow + '00');
    aura.addColorStop(0.7, st.glow + '55');
    aura.addColorStop(1, st.glow + '00');
    ctx.fillStyle = aura;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.drawImage(paintFruit(size, color, 0.84), -size / 2, -size / 2, size, size);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = s * 0.07;
    ctx.beginPath();
    ctx.arc(0, 0, s * 1.02, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = s * 0.025;
    ctx.beginPath();
    ctx.arc(0, 0, s * 1.02, Math.PI * 1.1, Math.PI * 1.45);
    ctx.stroke();
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      goldHeart(ctx, Math.cos(a) * s * 1.02, Math.sin(a) * s * 1.02, s * 0.17);
    }
    return cv;
  }
  if (kind === 'cupid') {
    ctx.drawImage(paintFruit(size, color, 0.86), -size / 2, -size / 2 + s * 0.05, size, size);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = s * 0.07;
    ctx.beginPath();
    ctx.ellipse(0, -s * 1.02, s * 0.36, s * 0.1, 0, 0, Math.PI * 2);
    ctx.stroke();
    return cv;
  }
  ctx.drawImage(paintFruit(size, color), -size / 2, -size / 2, size, size);
  ctx.save();
  ctx.scale(s, s);
  ctx.clip(silhouette(color));
  if (kind === 'lineV') ctx.rotate(Math.PI / 2);
  for (const off of [-0.3, 0.3]) {
    const g = ctx.createLinearGradient(0, off - 0.13, 0, off + 0.13);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.88)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-1.3, off - 0.13, 2.6, 0.26);
  }
  ctx.restore();
  ctx.save();
  if (kind === 'lineV') ctx.rotate(Math.PI / 2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const dir of [-1, 1]) {
    for (const [off, alpha] of [
      [0, 1],
      [0.16, 0.5],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(dir * s * (0.98 + off), -s * 0.2);
      ctx.lineTo(dir * s * (1.16 + off), 0);
      ctx.lineTo(dir * s * (0.98 + off), s * 0.2);
      ctx.globalAlpha = alpha;
      ctx.lineWidth = s * 0.075;
      ctx.strokeStyle = GOLD;
      ctx.stroke();
    }
  }
  ctx.restore();
  return cv;
}

/** The 5-match special: an opalescent pearl. */
function paintPearl(size: number): Canvas {
  const cv = makeCanvas(size);
  const ctx = cv.getContext('2d')!;
  const s = size * 0.38;
  ctx.translate(size / 2, size / 2);
  ctx.save();
  ctx.shadowColor = 'rgba(150,70,100,0.3)';
  ctx.shadowBlur = size * 0.06;
  ctx.shadowOffsetY = size * 0.03;
  ctx.beginPath();
  ctx.arc(0, 0, s, 0, Math.PI * 2);
  ctx.fillStyle = '#fdf6f8';
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, s, 0, Math.PI * 2);
  ctx.clip();
  const c2d = ctx as CanvasRenderingContext2D & { createConicGradient?: unknown };
  if (typeof c2d.createConicGradient === 'function') {
    const conic = ctx.createConicGradient(0.6, 0, 0);
    ['#ffd1e0', '#ffe6c7', '#fff6c9', '#d7f5e6', '#d4e6ff', '#e7d6ff', '#ffd1e0'].forEach((c, i, a) =>
      conic.addColorStop(i / (a.length - 1), c),
    );
    ctx.fillStyle = conic;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(-s, -s, s * 2, s * 2);
    ctx.globalAlpha = 1;
  }
  const shade = ctx.createRadialGradient(-s * 0.35, -s * 0.4, s * 0.05, 0, 0, s * 1.05);
  shade.addColorStop(0, 'rgba(255,255,255,0.95)');
  shade.addColorStop(0.35, 'rgba(255,255,255,0.25)');
  shade.addColorStop(0.8, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(160,110,140,0.35)');
  ctx.fillStyle = shade;
  ctx.fillRect(-s, -s, s * 2, s * 2);
  ctx.restore();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = s * 0.06;
  ctx.beginPath();
  ctx.arc(0, 0, s, 0, Math.PI * 2);
  ctx.stroke();
  sparkle(ctx, -s * 0.38, -s * 0.42, s * 0.2, 1);
  sparkle(ctx, s * 0.42, s * 0.36, s * 0.1, 0.8, '#fff');
  return cv;
}

function paintLock(size: number): Canvas {
  const cv = makeCanvas(size);
  const ctx = cv.getContext('2d')!;
  const s = size * 0.5;
  ctx.translate(size / 2, size / 2);
  for (const a of [Math.PI / 4, -Math.PI / 4]) {
    ctx.save();
    ctx.rotate(a);
    roundRect(ctx, -s * 1.1, -s * 0.11, s * 2.2, s * 0.22, s * 0.06);
    const g = ctx.createLinearGradient(0, -s * 0.11, 0, s * 0.11);
    g.addColorStop(0, '#f6c9d6');
    g.addColorStop(0.5, '#e28ba5');
    g.addColorStop(1, '#c4607f');
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.95;
    ctx.fill();
    ctx.restore();
  }
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(dir * s * 0.22, 0, s * 0.24, s * 0.13, dir * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = '#e28ba5';
    ctx.fill();
    ctx.strokeStyle = '#b4506f';
    ctx.lineWidth = s * 0.03;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = GOLD;
  ctx.fill();
  return cv;
}

function paintJelly(size: number, layers: number): Canvas {
  const cv = makeCanvas(size);
  const ctx = cv.getContext('2d')!;
  const s = size * 0.9;
  const o = (size - s) / 2;
  roundRect(ctx, o, o, s, s, size * 0.2);
  const g = ctx.createLinearGradient(0, o, 0, o + s);
  if (layers >= 2) {
    g.addColorStop(0, 'rgba(238,150,178,0.92)');
    g.addColorStop(1, 'rgba(214,104,140,0.92)');
  } else {
    g.addColorStop(0, 'rgba(248,200,214,0.85)');
    g.addColorStop(1, 'rgba(240,170,192,0.85)');
  }
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = size * 0.025;
  ctx.stroke();
  if (layers >= 2) {
    roundRect(ctx, o + size * 0.06, o + size * 0.06, s - size * 0.12, s - size * 0.12, size * 0.15);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = size * 0.018;
    ctx.stroke();
  }
  return cv;
}

function paintRing(size: number): Canvas {
  const cv = makeCanvas(size);
  const ctx = cv.getContext('2d')!;
  const s = size * 0.4;
  ctx.translate(size / 2, size / 2 + s * 0.15);
  const gold = ctx.createLinearGradient(-s, -s, s, s);
  gold.addColorStop(0, '#f6e6bf');
  gold.addColorStop(0.45, '#d3ac62');
  gold.addColorStop(0.75, '#a87a32');
  gold.addColorStop(1, '#ecd49c');
  ctx.strokeStyle = 'rgba(120,80,30,0.35)';
  ctx.lineWidth = s * 0.24;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.08, s * 0.7, s * 0.62, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = gold;
  ctx.lineWidth = s * 0.18;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.05, s * 0.7, s * 0.62, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.translate(0, -s * 0.62);
  ctx.beginPath();
  ctx.moveTo(-s * 0.4, -s * 0.12);
  ctx.lineTo(-s * 0.2, -s * 0.38);
  ctx.lineTo(s * 0.2, -s * 0.38);
  ctx.lineTo(s * 0.4, -s * 0.12);
  ctx.lineTo(0, s * 0.36);
  ctx.closePath();
  const dia = ctx.createLinearGradient(0, -s * 0.4, 0, s * 0.4);
  dia.addColorStop(0, '#ffffff');
  dia.addColorStop(0.5, '#fde9f0');
  dia.addColorStop(1, '#e9c3d2');
  ctx.fillStyle = dia;
  ctx.fill();
  ctx.strokeStyle = '#c99bb0';
  ctx.lineWidth = s * 0.04;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-s * 0.4, -s * 0.12);
  ctx.lineTo(s * 0.4, -s * 0.12);
  ctx.moveTo(-s * 0.12, -s * 0.12);
  ctx.lineTo(0, s * 0.36);
  ctx.lineTo(s * 0.12, -s * 0.12);
  ctx.strokeStyle = 'rgba(201,155,176,0.7)';
  ctx.lineWidth = s * 0.025;
  ctx.stroke();
  sparkle(ctx, s * 0.32, -s * 0.36, s * 0.16, 1, GOLD);
  return cv;
}

function paintLetter(size: number): Canvas {
  const cv = makeCanvas(size);
  const ctx = cv.getContext('2d')!;
  const s = size * 0.4;
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-0.1);
  const w = s * 1.8;
  const h = s * 1.22;
  ctx.shadowColor = 'rgba(150,70,100,0.28)';
  ctx.shadowBlur = size * 0.05;
  ctx.shadowOffsetY = size * 0.03;
  roundRect(ctx, -w / 2, -h / 2, w, h, s * 0.1);
  ctx.fillStyle = '#fffaf6';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#e9c7d2';
  ctx.lineWidth = s * 0.045;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-w / 2 + s * 0.06, -h / 2 + s * 0.08);
  ctx.lineTo(0, s * 0.1);
  ctx.lineTo(w / 2 - s * 0.06, -h / 2 + s * 0.08);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, s * 0.1, s * 0.25, 0, Math.PI * 2);
  ctx.fillStyle = ROSE;
  ctx.fill();
  ctx.save();
  ctx.translate(0, s * 0.11);
  ctx.scale(s * 0.13, s * 0.13);
  ctx.beginPath();
  heartPath(ctx);
  ctx.fillStyle = '#f6d9e2';
  ctx.fill();
  ctx.restore();
  return cv;
}

const BOX_COLORS = [
  ['#ffffff', '#f6e9ee', '#e8cdd7', '#d4718f'],
  ['#fdeef3', '#f6d3df', '#e6aec2', '#c9a15a'],
  ['#f4c9d6', '#e7a3b8', '#cf7e99', '#ffffff'],
];

function paintBox(size: number, hp: number, gift: boolean): Canvas {
  const cv = makeCanvas(size);
  const ctx = cv.getContext('2d')!;
  const s = size * 0.42;
  const [l, b, d, ribbon] = BOX_COLORS[Math.max(0, Math.min(2, hp - 1))];
  ctx.translate(size / 2, size / 2 + s * 0.08);
  ctx.save();
  ctx.shadowColor = 'rgba(150,70,100,0.28)';
  ctx.shadowBlur = size * 0.05;
  ctx.shadowOffsetY = size * 0.03;
  roundRect(ctx, -s * 0.94, -s * 0.72, s * 1.88, s * 1.66, s * 0.12);
  const g = ctx.createLinearGradient(0, -s, 0, s);
  g.addColorStop(0, l);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = d;
  ctx.lineWidth = s * 0.04;
  ctx.stroke();
  roundRect(ctx, -s, -s * 0.88, s * 2, s * 0.42, s * 0.1);
  ctx.fillStyle = l;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = ribbon;
  ctx.fillRect(-s * 0.12, -s * 0.88, s * 0.24, s * 1.82);
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(dir * s * 0.27, -s * 0.98, s * 0.27, s * 0.14, dir * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, -s * 0.95, s * 0.1, 0, Math.PI * 2);
  ctx.fill();
  if (gift) goldHeart(ctx, s * 0.52, s * 0.38, s * 0.26);
  for (let k = 0; k < hp; k++) {
    ctx.beginPath();
    ctx.arc(-s * 0.62 + k * s * 0.24, s * 0.66, s * 0.065, 0, Math.PI * 2);
    ctx.fillStyle = hp >= 3 ? 'rgba(255,255,255,0.95)' : d;
    ctx.fill();
  }
  return cv;
}

function paintChoco(size: number): Canvas {
  const cv = makeCanvas(size);
  const ctx = cv.getContext('2d')!;
  const s = size * 0.45;
  ctx.translate(size / 2, size / 2);
  ctx.save();
  ctx.shadowColor = 'rgba(80,30,20,0.3)';
  ctx.shadowBlur = size * 0.04;
  ctx.shadowOffsetY = size * 0.025;
  roundRect(ctx, -s, -s, s * 2, s * 2, s * 0.2);
  const g = ctx.createLinearGradient(-s, -s, s, s);
  g.addColorStop(0, '#8c5a43');
  g.addColorStop(0.55, '#5e3526');
  g.addColorStop(1, '#3f2117');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  roundRect(ctx, -s * 0.76, -s * 0.76, s * 1.52, s * 1.52, s * 0.14);
  ctx.strokeStyle = 'rgba(255,225,200,0.16)';
  ctx.lineWidth = s * 0.06;
  ctx.stroke();
  goldHeart(ctx, 0, s * 0.02, s * 0.36);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.ellipse(-s * 0.45, -s * 0.62, s * 0.32, s * 0.08, -0.35, 0, Math.PI * 2);
  ctx.fill();
  return cv;
}

function paintWing(size: number): Canvas {
  const cv = makeCanvas(size * 0.5, size * 0.5);
  const ctx = cv.getContext('2d')!;
  const s = size * 0.22;
  ctx.translate(size * 0.25, size * 0.25);
  ctx.beginPath();
  ctx.moveTo(-s * 0.9, s * 0.2);
  ctx.bezierCurveTo(-s * 0.4, -s * 1.1, s * 0.8, -s * 1.0, s * 1.0, -s * 0.5);
  ctx.bezierCurveTo(s * 0.7, -s * 0.35, s * 0.85, -s * 0.05, s * 0.55, s * 0.05);
  ctx.bezierCurveTo(s * 0.6, s * 0.3, s * 0.3, s * 0.45, s * 0.1, s * 0.4);
  ctx.bezierCurveTo(-s * 0.1, s * 0.75, -s * 0.6, s * 0.6, -s * 0.9, s * 0.2);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -s, 0, s);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#fbe6ee');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#e3a6ba';
  ctx.lineWidth = Math.max(1, s * 0.09);
  ctx.stroke();
  return cv;
}

function paintGlow(size: number, color: string): Canvas {
  const cv = makeCanvas(size);
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, color);
  g.addColorStop(0.35, color + 'aa');
  g.addColorStop(1, color + '00');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return cv;
}

function paintHeartIcon(size: number, light = '#f7c3d2', base = '#e26b8f', dark = '#b4456a'): Canvas {
  const cv = makeCanvas(size);
  const ctx = cv.getContext('2d')!;
  ctx.translate(size / 2, size / 2);
  ctx.scale(size * 0.42, size * 0.42);
  ctx.beginPath();
  heartPath(ctx);
  const g = ctx.createLinearGradient(0, -1, 0, 1);
  g.addColorStop(0, light);
  g.addColorStop(0.5, base);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(-0.42, -0.38, 0.18, 0.09, -0.6, 0, Math.PI * 2);
  ctx.fill();
  return cv;
}

function paintStarIcon(size: number): Canvas {
  const cv = makeCanvas(size);
  const ctx = cv.getContext('2d')!;
  ctx.translate(size / 2, size / 2 + size * 0.03);
  const r = size * 0.42;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, '#f3e1b4');
  g.addColorStop(1, '#b88a40');
  ctx.fillStyle = g;
  ctx.fill();
  return cv;
}

function paintJellyIcon(size: number): Canvas {
  return paintJelly(size, 2);
}

// ───────────────────────────── atlas ─────────────────────────────

export interface Atlas {
  size: number;
  gems: Canvas[];
  rainbow: Canvas;
  ring: Canvas;
  letter: Canvas;
  box: Canvas[];
  gift: Canvas[];
  choco: Canvas;
  wing: Canvas;
  glows: Canvas[];
  whiteGlow: Canvas;
  roseGlow: Canvas;
  goldGlow: Canvas;
  heart: Canvas;
  special: Record<BakedSpecial, Canvas[]>;
  lock: Canvas;
  jelly: Canvas[];
}

const atlasCache = new Map<number, Atlas>();

export function getAtlas(size: number): Atlas {
  const key = Math.round(size);
  let a = atlasCache.get(key);
  if (a) return a;
  a = {
    size: key,
    gems: FRUITS.map((_, i) => paintFruit(key, i)),
    rainbow: paintPearl(key),
    ring: paintRing(key),
    letter: paintLetter(key),
    box: [1, 2, 3].map((hp) => paintBox(key, hp, false)),
    gift: [1, 2, 3].map((hp) => paintBox(key, hp, true)),
    choco: paintChoco(key),
    wing: paintWing(key),
    glows: FRUITS.map((g) => paintGlow(key, g.glow)),
    whiteGlow: paintGlow(key, '#ffffff'),
    roseGlow: paintGlow(key, '#f2a6bd'),
    goldGlow: paintGlow(key, '#e2c48a'),
    heart: paintHeartIcon(key),
    special: {
      lineH: FRUITS.map((_, i) => paintSpecial(key, i, 'lineH')),
      lineV: FRUITS.map((_, i) => paintSpecial(key, i, 'lineV')),
      bomb: FRUITS.map((_, i) => paintSpecial(key, i, 'bomb')),
      cupid: FRUITS.map((_, i) => paintSpecial(key, i, 'cupid')),
    },
    lock: paintLock(key),
    jelly: [paintJelly(key, 1), paintJelly(key, 2)],
  };
  atlasCache.clear();
  atlasCache.set(key, a);
  return a;
}

/** Small PNG data URLs for HUD/DOM icons. */
const iconCache = new Map<string, string>();
export function iconURL(kind: string, size = 72): string {
  const key = `${kind}@${size}`;
  const hit = iconCache.get(key);
  if (hit) return hit;
  let cv: Canvas;
  if (kind.startsWith('gem')) cv = paintFruit(size, Number(kind.slice(3)));
  else if (kind === 'rainbow') cv = paintPearl(size);
  else if (kind === 'ring') cv = paintRing(size);
  else if (kind === 'letter') cv = paintLetter(size);
  else if (kind === 'gift') cv = paintBox(size, 1, true);
  else if (kind === 'choco') cv = paintChoco(size);
  else if (kind === 'heart') cv = paintHeartIcon(size);
  else if (kind === 'jelly') cv = paintJellyIcon(size);
  else cv = paintStarIcon(size);
  const url = cv.toDataURL('image/png');
  iconCache.set(key, url);
  return url;
}

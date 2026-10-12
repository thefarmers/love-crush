import { heartPath, sparkle } from './sprites';

export type ParticleKind = 'shard' | 'spark' | 'heart' | 'crumb' | 'confetti' | 'twinkle' | 'ribbon';

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ay: number;
  drag: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
}

const MAX_PARTICLES = 900;

/** Lightweight particle system in CSS-pixel space. */
export class Particles {
  list: Particle[] = [];

  add(p: Partial<Particle> & { x: number; y: number }): void {
    if (this.list.length >= MAX_PARTICLES) this.list.shift();
    this.list.push({
      kind: 'spark',
      vx: 0,
      vy: 0,
      ay: 0,
      drag: 0.98,
      life: 0,
      max: 600,
      size: 4,
      color: '#fff',
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.3,
      ...p,
    });
  }

  burst(x: number, y: number, color: string, cell: number, n = 10, power = 1): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.08 + Math.random() * 0.22) * cell * power;
      this.add({
        kind: 'shard',
        x,
        y,
        vx: (Math.cos(a) * v) / 16,
        vy: (Math.sin(a) * v) / 16 - cell * 0.008,
        ay: cell * 0.0009,
        life: 0,
        max: 450 + Math.random() * 350,
        size: cell * (0.07 + Math.random() * 0.09),
        color,
      });
    }
    for (let i = 0; i < Math.ceil(n / 2); i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.05 + Math.random() * 0.18) * cell * power;
      this.add({
        kind: 'spark',
        x,
        y,
        vx: (Math.cos(a) * v) / 16,
        vy: (Math.sin(a) * v) / 16,
        drag: 0.94,
        max: 300 + Math.random() * 300,
        size: cell * (0.1 + Math.random() * 0.12),
        color: '#c9a15a',
      });
    }
  }

  hearts(x: number, y: number, cell: number, n = 6, color = '#ff4f86'): void {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const v = (0.1 + Math.random() * 0.2) * cell;
      this.add({
        kind: 'heart',
        x,
        y,
        vx: (Math.cos(a) * v) / 16,
        vy: (Math.sin(a) * v) / 16,
        ay: -cell * 0.0002,
        drag: 0.97,
        max: 700 + Math.random() * 500,
        size: cell * (0.12 + Math.random() * 0.12),
        color,
        vr: (Math.random() - 0.5) * 0.08,
      });
    }
  }

  confetti(x: number, y: number, cell: number, n: number, colors: string[]): void {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
      const v = (0.15 + Math.random() * 0.35) * cell;
      this.add({
        kind: 'confetti',
        x,
        y,
        vx: (Math.cos(a) * v) / 16,
        vy: (Math.sin(a) * v) / 16,
        ay: cell * 0.0006,
        drag: 0.985,
        max: 1200 + Math.random() * 800,
        size: cell * (0.1 + Math.random() * 0.08),
        color: colors[i % colors.length],
        vr: (Math.random() - 0.5) * 0.4,
      });
    }
  }

  update(dt: number): void {
    const k = dt / 16.67;
    const out: Particle[] = [];
    for (const p of this.list) {
      p.life += dt;
      if (p.life >= p.max) continue;
      p.vx *= Math.pow(p.drag, k);
      p.vy *= Math.pow(p.drag, k);
      p.vy += p.ay * k;
      p.x += p.vx * k;
      p.y += p.vy * k;
      p.rot += p.vr * k;
      out.push(p);
    }
    this.list = out;
  }

  draw(ctx: CanvasRenderingContext2D, glow: HTMLCanvasElement): void {
    for (const p of this.list) {
      const t = p.life / p.max;
      const alpha = t < 0.1 ? t / 0.1 : 1 - Math.pow((t - 0.1) / 0.9, 2);
      ctx.globalAlpha = Math.max(0, alpha);
      switch (p.kind) {
        case 'spark': {
          // tiny gold glints
          const s = p.size * (1 - t * 0.4);
          ctx.globalAlpha *= 0.7;
          ctx.drawImage(glow, p.x - s, p.y - s, s * 2, s * 2);
          sparkle(ctx, p.x, p.y, s * 0.55, 1, '#d8b673');
          break;
        }
        case 'shard': {
          // juice droplets
          const r = p.size * 0.55;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.beginPath();
          ctx.arc(p.x - r * 0.3, p.y - r * 0.3, r * 0.32, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'heart': {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.sin(p.rot) * 0.4);
          ctx.scale(p.size, p.size);
          ctx.beginPath();
          heartPath(ctx);
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'crumb':
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          break;
        case 'confetti':
        case 'ribbon': {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(1, Math.abs(Math.cos(p.rot * 2)) + 0.15);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.kind === 'ribbon' ? p.size * 0.35 : p.size / 2);
          ctx.restore();
          break;
        }
        case 'twinkle': {
          const s = p.size * Math.sin(t * Math.PI);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot * 0.2);
          sparkle(ctx, 0, 0, s, 0.9, '#ffffff');
          ctx.restore();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }
}

export interface FloatText {
  text: string;
  x: number;
  y: number;
  color: string;
  size: number;
  life: number;
  max: number;
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const linear = (t: number) => t;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

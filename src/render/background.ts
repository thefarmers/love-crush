interface Petal {
  x: number;
  y: number;
  r: number;
  speed: number;
  sway: number;
  phase: number;
  spin: number;
  alpha: number;
  kind: 'petal' | 'dot';
}

/** A few slow, translucent petals drifting behind every screen. Deliberately sparse. */
export class Background {
  private ctx: CanvasRenderingContext2D;
  private items: Petal[] = [];
  private w = 0;
  private h = 0;
  private dpr = 1;
  private last = performance.now();
  private color = '#eaa9bc';
  private reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    for (let i = 0; i < 16; i++) this.items.push(this.spawn(true));
    setInterval(() => {
      this.color = getComputedStyle(document.documentElement).getPropertyValue('--heart').trim() || this.color;
    }, 500);
    requestAnimationFrame(this.frame);
  }

  private resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = this.w * this.dpr;
    this.canvas.height = this.h * this.dpr;
  }

  private spawn(anywhere: boolean): Petal {
    const petal = Math.random() < 0.7;
    return {
      x: Math.random() * this.w,
      y: anywhere ? Math.random() * this.h : -30,
      r: petal ? 5 + Math.random() * 7 : 2 + Math.random() * 3,
      speed: 8 + Math.random() * 14,
      sway: 14 + Math.random() * 26,
      phase: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.8,
      alpha: petal ? 0.18 + Math.random() * 0.22 : 0.2 + Math.random() * 0.25,
      kind: petal ? 'petal' : 'dot',
    };
  }

  private frame = (t: number): void => {
    requestAnimationFrame(this.frame);
    const dt = Math.min(64, t - this.last) / 1000;
    this.last = t;
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = this.color;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (!this.reduced) {
        it.y += it.speed * dt;
        it.phase += dt * 0.7;
      }
      if (it.y > this.h + 30) this.items[i] = this.spawn(false);
      const x = it.x + Math.sin(it.phase) * it.sway;
      ctx.globalAlpha = it.alpha;
      if (it.kind === 'petal') {
        ctx.save();
        ctx.translate(x, it.y);
        ctx.rotate(it.phase * it.spin * 2 + it.spin);
        ctx.scale(1, 0.62 + Math.sin(it.phase * 1.3) * 0.25);
        ctx.beginPath();
        ctx.moveTo(0, -it.r);
        ctx.bezierCurveTo(it.r * 0.9, -it.r * 0.7, it.r * 0.8, it.r * 0.6, 0, it.r);
        ctx.bezierCurveTo(-it.r * 0.8, it.r * 0.6, -it.r * 0.9, -it.r * 0.7, 0, -it.r);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(x, it.y, it.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  };
}

import type { Sfx } from '../audio/sfx';
import type {
  ActivationEvent,
  BlockerEvent,
  ClearPhase,
  CollectPhase,
  FallPath,
  FallPhase,
  Phase,
  ShufflePhase,
  SpreadPhase,
} from '../core/events';
import type { Game } from '../core/game';
import type { Blocker, Move, Tile } from '../core/types';
import { easeInOutCubic, easeOutBack, easeOutCubic, lerp, linear, Particles, type FloatText } from './fx';
import { GEMS, getAtlas, roundRect, type Atlas } from './sprites';

/** Milliseconds per abstract beat of a clear phase, and per gravity tick. */
const BEAT = 112;
const TICK = 52;

interface VTile {
  id: number;
  tile: Tile;
  x: number;
  y: number;
  scale: number;
  alpha: number;
  rot: number;
  squash: number;
  flash: number;
  z: number;
}

interface VCell {
  playable: boolean;
  jelly: number;
  lock: number;
  blocker: Blocker | null;
  shake: number;
  grow: number;
}

interface Tween {
  start: number;
  dur: number;
  fn: (t: number) => void;
  ease: (t: number) => number;
  done: () => void;
}

interface Beam {
  horizontal: boolean;
  pos: number;
  from: number;
  min: number;
  max: number;
  width: number;
  color: string;
  start: number;
  dur: number;
}

interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  width: number;
  color: string;
  start: number;
  dur: number;
}

interface Bolt {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  start: number;
  dur: number;
}

interface Flyer {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  start: number;
  dur: number;
  color: number;
}

interface Ghost {
  sprite: HTMLCanvasElement;
  x: number;
  y: number;
  start: number;
  dur: number;
}

export interface ViewHooks {
  onSwap(a: number, b: number): void;
  onCombo?(cascade: number): void;
  onSpecial?(kind: string): void;
  /** Page coordinates of a popped gem / opened gift / collected item (for HUD fly-in). */
  onPop?(x: number, y: number, color: number): void;
  onGift?(x: number, y: number): void;
  onItem?(x: number, y: number): void;
  onJelly?(x: number, y: number): void;
  onChoco?(x: number, y: number): void;
  onShuffle?(): void;
  onTouch?(): void;
}

export class BoardView {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private hooks: ViewHooks;
  private sfx: Sfx;
  private game!: Game;
  private rows = 9;
  private cols = 9;
  private cs = 40;
  private ox = 0;
  private oy = 0;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private atlas!: Atlas;
  private plate: HTMLCanvasElement | null = null;
  private clip: Path2D | null = null;
  private portals = new Set<string>();
  private g: [number, number] = [1, 0];

  private tiles = new Map<number, VTile>();
  private vcells: VCell[] = [];
  private tweens: Tween[] = [];
  private particles = new Particles();
  private beams: Beam[] = [];
  private rings: Ring[] = [];
  private bolts: Bolt[] = [];
  private flyers: Flyer[] = [];
  private ghosts: Ghost[] = [];
  private texts: FloatText[] = [];
  private flashAlpha = 0;
  private shakeMag = 0;
  private now = performance.now();
  private last = performance.now();
  private raf = 0;
  private nextTwinkle = 0;

  inputEnabled = false;
  private selected = -1;
  private drag: { x: number; y: number; cell: number } | null = null;
  private hint: Move | null = null;

  constructor(canvas: HTMLCanvasElement, hooks: ViewHooks, sfx: Sfx) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.hooks = hooks;
    this.sfx = sfx;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', () => (this.drag = null));
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    for (const t of this.tweens) t.done();
    this.tweens = [];
  }

  // ───────────────────────────── setup ─────────────────────────────

  setGame(game: Game): void {
    this.game = game;
    this.rows = game.board.rows;
    this.cols = game.board.cols;
    this.g = game.board.flow.g;
    this.portals = new Set(game.board.flow.portals.map(([a, b]) => `${a}>${b}`));
    this.tiles.clear();
    this.particles.list = [];
    this.beams = [];
    this.rings = [];
    this.bolts = [];
    this.flyers = [];
    this.ghosts = [];
    this.texts = [];
    this.selected = -1;
    this.hint = null;
    this.resize();
    this.sync();
  }

  resize(): void {
    const parent = this.canvas.parentElement!;
    const W = parent.clientWidth;
    const H = parent.clientHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.W = W;
    this.H = H;
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;
    // Just enough margin for the plate's rounded rim: cells get every pixel we can spare.
    const pad = 7;
    this.cs = Math.max(16, Math.floor(Math.min((W - pad * 2) / this.cols, (H - pad * 2) / this.rows)));
    this.ox = Math.round((W - this.cs * this.cols) / 2);
    this.oy = Math.round((H - this.cs * this.rows) / 2);
    if (!this.game) return;
    this.atlas = getAtlas(this.cs * this.dpr);
    this.buildPlate();
  }

  /** Snap visuals to the authoritative game state (after every turn). */
  sync(): void {
    const b = this.game.board;
    this.vcells = b.cells.map((c) => ({
      playable: c.playable,
      jelly: c.jelly,
      lock: c.lock,
      blocker: c.blocker ? { ...c.blocker } : null,
      shake: 0,
      grow: 1,
    }));
    const seen = new Set<number>();
    b.cells.forEach((c, i) => {
      if (!c.tile) return;
      seen.add(c.tile.id);
      let vt = this.tiles.get(c.tile.id);
      if (!vt) {
        vt = this.newTile(c.tile, b.col(i), b.row(i));
        this.tiles.set(vt.id, vt);
      }
      vt.tile = { ...c.tile };
      vt.x = b.col(i);
      vt.y = b.row(i);
      vt.scale = 1;
      vt.alpha = 1;
      vt.rot = 0;
      vt.z = 0;
    });
    for (const id of [...this.tiles.keys()]) if (!seen.has(id)) this.tiles.delete(id);
  }

  private newTile(tile: Tile, x: number, y: number): VTile {
    return { id: tile.id, tile: { ...tile }, x, y, scale: 1, alpha: 1, rot: 0, squash: 1, flash: 0, z: 0 };
  }

  private buildPlate(): void {
    const { dpr, cs } = this;
    const cv = document.createElement('canvas');
    cv.width = this.canvas.width;
    cv.height = this.canvas.height;
    const ctx = cv.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const board = this.game.board;
    const clip = new Path2D();
    // The plate is the union of slightly-expanded cells, drawn opaque offscreen and composited
    // once (overlapping translucent shapes would otherwise darken).
    const union = (pad: number, color: string) => {
      const shape = document.createElement('canvas');
      shape.width = cv.width;
      shape.height = cv.height;
      const sctx = shape.getContext('2d')!;
      sctx.scale(dpr, dpr);
      sctx.fillStyle = color;
      for (let i = 0; i < board.cells.length; i++) {
        if (!board.cells[i].playable) continue;
        const x = this.ox + board.col(i) * cs;
        const y = this.oy + board.row(i) * cs;
        roundRect(sctx, x - pad, y - pad, cs + pad * 2, cs + pad * 2, cs * 0.3);
        sctx.fill();
      }
      return shape;
    };
    const p = cs * 0.14;
    ctx.save();
    ctx.shadowColor = 'rgba(169,74,104,0.16)';
    ctx.shadowBlur = cs * 0.45;
    ctx.shadowOffsetY = cs * 0.12;
    ctx.drawImage(union(p + 1, '#f2d4de'), 0, 0, cv.width / dpr, cv.height / dpr);
    ctx.restore();
    ctx.drawImage(union(p, '#ffffff'), 0, 0, cv.width / dpr, cv.height / dpr);
    for (let i = 0; i < board.cells.length; i++) {
      if (!board.cells[i].playable) continue;
      const r = board.row(i);
      const c = board.col(i);
      const x = this.ox + c * cs;
      const y = this.oy + r * cs;
      clip.rect(x - 0.5, y - 0.5, cs + 1, cs + 1);
      roundRect(ctx, x + 2, y + 2, cs - 4, cs - 4, cs * 0.2);
      ctx.fillStyle = (r + c) % 2 ? '#fdf3f6' : '#fffafb';
      ctx.fill();
    }
    const flow = board.flow;
    // Exits for drop items.
    if (this.game.level.items) {
      for (const e of flow.exits) {
        const { x, y } = this.center(e);
        ctx.save();
        ctx.translate(x + this.g[1] * cs * 0.62, y + this.g[0] * cs * 0.62);
        ctx.rotate(Math.atan2(this.g[0], this.g[1]) - Math.PI / 2);
        ctx.fillStyle = '#c9a15a';
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(-cs * 0.16, -cs * 0.06);
        ctx.lineTo(cs * 0.16, -cs * 0.06);
        ctx.lineTo(0, cs * 0.12);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    // Portals.
    for (const [a, b] of flow.portals) {
      for (const [cell, side] of [
        [a, 1],
        [b, -1],
      ] as const) {
        const { x, y } = this.center(cell);
        const px = x + this.g[1] * cs * 0.5 * side;
        const py = y + this.g[0] * cs * 0.5 * side;
        const grad = ctx.createRadialGradient(px, py, 0, px, py, cs * 0.45);
        grad.addColorStop(0, 'rgba(201,96,127,0.75)');
        grad.addColorStop(1, 'rgba(201,96,127,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(px, py, cs * 0.42, cs * 0.14, Math.atan2(this.g[0], this.g[1]) + Math.PI / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Gravity hint arrows next to spawners when gravity isn't "down".
    if (flow.gravity !== 'down') {
      ctx.fillStyle = 'rgba(201,96,127,0.55)';
      for (const s of flow.spawners) {
        const { x, y } = this.center(s);
        ctx.save();
        ctx.translate(x - this.g[1] * cs * 0.62, y - this.g[0] * cs * 0.62);
        ctx.rotate(Math.atan2(this.g[0], this.g[1]) - Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(-cs * 0.12, -cs * 0.05);
        ctx.lineTo(cs * 0.12, -cs * 0.05);
        ctx.lineTo(0, cs * 0.09);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    this.plate = cv;
    this.clip = clip;
  }

  // ───────────────────────────── geometry ─────────────────────────────

  private center(cell: number): { x: number; y: number } {
    return {
      x: this.ox + ((cell % this.cols) + 0.5) * this.cs,
      y: this.oy + (Math.floor(cell / this.cols) + 0.5) * this.cs,
    };
  }

  private px(col: number, row: number): { x: number; y: number } {
    return { x: this.ox + (col + 0.5) * this.cs, y: this.oy + (row + 0.5) * this.cs };
  }

  private toPage(x: number, y: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + x, y: r.top + y };
  }

  cellPagePos(cell: number): { x: number; y: number } {
    const c = this.center(cell);
    return this.toPage(c.x, c.y);
  }

  private cellAt(x: number, y: number): number {
    const c = Math.floor((x - this.ox) / this.cs);
    const r = Math.floor((y - this.oy) / this.cs);
    if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return -1;
    const i = r * this.cols + c;
    return this.vcells[i]?.playable ? i : -1;
  }

  private tileAt(cell: number): VTile | undefined {
    const c = cell % this.cols;
    const r = Math.floor(cell / this.cols);
    for (const vt of this.tiles.values()) if (Math.round(vt.x) === c && Math.round(vt.y) === r && vt.alpha > 0.5) return vt;
    return undefined;
  }

  // ───────────────────────────── input ─────────────────────────────

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown = (e: PointerEvent): void => {
    this.hooks.onTouch?.();
    if (!this.inputEnabled) return;
    const p = this.local(e);
    const cell = this.cellAt(p.x, p.y);
    if (cell < 0) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.drag = { x: p.x, y: p.y, cell };
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.drag || !this.inputEnabled) return;
    const p = this.local(e);
    const dx = p.x - this.drag.x;
    const dy = p.y - this.drag.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < this.cs * 0.3) return;
    const from = this.drag.cell;
    const r = Math.floor(from / this.cols);
    const c = from % this.cols;
    const [tr, tc] = Math.abs(dx) > Math.abs(dy) ? [r, c + Math.sign(dx)] : [r + Math.sign(dy), c];
    this.drag = null;
    this.selected = -1;
    if (tr < 0 || tc < 0 || tr >= this.rows || tc >= this.cols) return;
    const to = tr * this.cols + tc;
    if (!this.vcells[to]?.playable) return;
    this.hooks.onSwap(from, to);
  };

  private onUp = (): void => {
    if (!this.drag || !this.inputEnabled) {
      this.drag = null;
      return;
    }
    const cell = this.drag.cell;
    this.drag = null;
    if (this.selected >= 0 && this.selected !== cell && this.game.board.areAdjacent(this.selected, cell)) {
      const a = this.selected;
      this.selected = -1;
      this.hooks.onSwap(a, cell);
    } else if (this.selected === cell) {
      this.selected = -1;
    } else {
      this.selected = this.game.board.isMovable(cell) ? cell : -1;
      if (this.selected >= 0) this.sfx.click();
    }
  };

  setHint(m: Move | null): void {
    this.hint = m;
  }

  // ───────────────────────────── tweening ─────────────────────────────

  private anim(dur: number, fn: (t: number) => void, ease: (t: number) => number = easeOutCubic, delay = 0): Promise<void> {
    return new Promise((done) => {
      this.tweens.push({ start: performance.now() + delay, dur, fn, ease, done });
    });
  }

  private at(delay: number, fn: () => void): void {
    void this.anim(0, () => fn(), linear, delay);
  }

  private wait(ms: number): Promise<void> {
    return this.anim(ms, () => {}, linear);
  }

  private shake(mag: number): void {
    this.shakeMag = Math.max(this.shakeMag, mag);
  }

  // ───────────────────────────── playback ─────────────────────────────

  private skipping = false;
  /** Playback speed multiplier (the love rush runs at double speed). */
  speed = 1;

  /** Fast-forward the current playback (used to skip the love rush). */
  skip(): void {
    this.skipping = true;
  }

  async play(phases: Phase[]): Promise<void> {
    this.skipping = false;
    for (const p of phases) {
      if (this.skipping) break;
      switch (p.type) {
        case 'swap':
          await this.playSwap(p.a, p.b);
          break;
        case 'clear':
          await this.playClear(p);
          break;
        case 'fall':
          await this.playFall(p);
          break;
        case 'collect':
          await this.playCollect(p);
          break;
        case 'spread':
          await this.playSpread(p);
          break;
        case 'shuffle':
          await this.playShuffle(p);
          break;
      }
    }
    if (this.skipping) {
      this.skipping = false;
      this.tweens.forEach((t) => t.done());
      this.tweens = [];
      this.beams = [];
      this.bolts = [];
      this.flyers = [];
      this.sync();
    }
  }

  private async playSwap(a: number, b: number): Promise<void> {
    const ta = this.tileAt(a);
    const tb = this.tileAt(b);
    const [ac, ar, bc, br] = [a % this.cols, Math.floor(a / this.cols), b % this.cols, Math.floor(b / this.cols)];
    this.sfx.swap();
    if (ta) ta.z = 2;
    await this.anim(
      160,
      (t) => {
        if (ta) {
          ta.x = lerp(ac, bc, t);
          ta.y = lerp(ar, br, t);
          ta.scale = 1 + 0.14 * Math.sin(Math.PI * t);
        }
        if (tb) {
          tb.x = lerp(bc, ac, t);
          tb.y = lerp(br, ar, t);
        }
      },
      easeInOutCubic,
    );
    if (ta) ta.z = 0;
  }

  async animateInvalid(a: number, b: number): Promise<void> {
    const ta = this.tileAt(a);
    const tb = this.tileAt(b);
    if (!ta) return;
    const [ac, ar, bc, br] = [a % this.cols, Math.floor(a / this.cols), b % this.cols, Math.floor(b / this.cols)];
    this.sfx.invalid();
    const go = (t: number) => {
      ta.x = lerp(ac, bc, t * 0.42);
      ta.y = lerp(ar, br, t * 0.42);
      if (tb) {
        tb.x = lerp(bc, ac, t * 0.42);
        tb.y = lerp(br, ar, t * 0.42);
      }
    };
    await this.anim(110, go, easeOutCubic);
    await this.anim(200, (t) => go(1 - t), easeOutBack);
    ta.x = ac;
    ta.y = ar;
    if (tb) {
      tb.x = bc;
      tb.y = br;
    }
  }

  private async playClear(p: ClearPhase): Promise<void> {
    const T = (t: number) => (t * BEAT) / this.speed;
    let end = 0;
    if (p.cascade >= 2) this.hooks.onCombo?.(p.cascade);
    const mergeTo = new Map<number, number>();
    for (const c of p.creates) for (const f of c.from) mergeTo.set(f, c.cell);

    for (const pop of p.pops) {
      end = Math.max(end, T(pop.t) + 280);
      this.at(T(pop.t), () => {
        const vt = this.tiles.get(pop.id);
        if (!vt) return;
        const anchor = pop.by === 'match' ? mergeTo.get(pop.cell) : undefined;
        const { x, y } = this.center(pop.cell);
        const color = pop.color >= 0 ? GEMS[pop.color].base : '#e9a7bb';
        if (pop.color >= 0) {
          const pg = this.toPage(x, y);
          this.hooks.onPop?.(pg.x, pg.y, pop.color);
        }
        this.sfx.pop(p.cascade);
        if (anchor !== undefined) {
          const ac = anchor % this.cols;
          const ar = Math.floor(anchor / this.cols);
          const x0 = vt.x;
          const y0 = vt.y;
          vt.z = 1;
          void this.anim(130, (t) => {
            vt.x = lerp(x0, ac, t);
            vt.y = lerp(y0, ar, t);
            vt.scale = 1 - 0.4 * t;
            vt.alpha = 1 - t * 0.8;
          }).then(() => this.tiles.delete(vt.id));
          this.particles.burst(x, y, color, this.cs, 4, 0.6);
          return;
        }
        vt.z = 1;
        vt.flash = 0.6;
        void this.anim(70, (t) => (vt.scale = 1 + 0.22 * t)).then(() => {
          this.particles.burst(x, y, color, this.cs, pop.special !== 'none' ? 16 : 9, pop.special !== 'none' ? 1.5 : 1);
          return this.anim(120, (t) => {
            vt.scale = 1.22 * (1 - t);
            vt.alpha = 1 - t;
          });
        }).then(() => this.tiles.delete(vt.id));
      });
    }

    for (const c of p.creates) {
      end = Math.max(end, T(c.t) + 420);
      this.at(T(c.t) + 120, () => {
        const vt = this.tiles.get(c.id);
        if (!vt) return;
        vt.tile.special = c.special;
        vt.tile.color = c.color;
        vt.flash = 1;
        vt.z = 1;
        const { x, y } = this.center(c.cell);
        this.particles.burst(x, y, '#e8d3a6', this.cs, 10, 1.2);
        this.rings.push({ x, y, r0: this.cs * 0.2, r1: this.cs * 0.9, width: this.cs * 0.1, color: '#c9a15a', start: this.now, dur: 360 });
        this.sfx.create(c.special);
        this.hooks.onSpecial?.(c.special);
        void this.anim(300, (t) => {
          vt.scale = 1.45 - 0.45 * t;
          vt.flash = 1 - t;
        }, easeOutBack).then(() => (vt.z = 0));
      });
    }

    for (const a of p.activations) {
      end = Math.max(end, T(a.t) + this.activationDuration(a));
      this.at(T(a.t), () => this.activationFx(a));
    }

    for (const b of p.blockers) {
      end = Math.max(end, T(b.t) + 300);
      this.at(T(b.t), () => this.blockerFx(b));
    }

    let jellySound = 0;
    for (const j of p.jelly) {
      this.at(T(j.t), () => {
        const vc = this.vcells[j.cell];
        vc.jelly = j.left;
        vc.shake = 1;
        const { x, y } = this.center(j.cell);
        const pg = this.toPage(x, y);
        this.hooks.onJelly?.(pg.x, pg.y);
        for (let k = 0; k < 5; k++) {
          const a = Math.random() * Math.PI * 2;
          this.particles.add({
            kind: 'spark',
            x,
            y,
            vx: Math.cos(a) * this.cs * 0.012,
            vy: Math.sin(a) * this.cs * 0.012,
            max: 400,
            size: this.cs * 0.22,
            color: '#eaa3b8',
          });
        }
        if (performance.now() - jellySound > 60) {
          jellySound = performance.now();
          this.sfx.jelly();
        }
      });
    }

    for (const l of p.locks) {
      this.at(T(l.t), () => {
        const vc = this.vcells[l.cell];
        vc.lock = Math.max(0, vc.lock - 1);
        const { x, y } = this.center(l.cell);
        for (let k = 0; k < 6; k++) {
          this.particles.add({
            kind: 'ribbon',
            x,
            y,
            vx: (Math.random() - 0.5) * this.cs * 0.06,
            vy: -Math.random() * this.cs * 0.05,
            ay: this.cs * 0.002,
            max: 700,
            size: this.cs * 0.3,
            color: k % 2 ? '#ff4f8b' : '#ffb3cf',
          });
        }
        this.sfx.lock();
      });
    }

    for (const cv of p.converts) {
      end = Math.max(end, T(cv.t) + 260);
      this.at(T(cv.t), () => {
        const vt = this.tiles.get(cv.id);
        if (!vt) return;
        vt.tile.special = cv.special;
        if (cv.special === 'rainbow') vt.tile.color = -1;
        vt.flash = 1;
        const { x, y } = this.center(cv.cell);
        this.particles.burst(x, y, '#e8d3a6', this.cs, 6, 0.8);
        this.sfx.create(cv.special);
        void this.anim(240, (t) => {
          vt.flash = 1 - t;
          vt.scale = 1.3 - 0.3 * t;
        }, easeOutBack);
      });
    }

    // Only the biggest few popups per wave: a love-rush can produce dozens.
    const scores = [...p.scores].sort((x, y) => y.amount - x.amount).slice(0, 5);
    for (const s of scores) {
      this.at(T(s.t) + 90, () => {
        const { x, y } = this.center(s.cell);
        this.texts.push({
          text: `+${s.amount.toLocaleString()}`,
          x,
          y,
          color: s.color >= 0 ? GEMS[s.color].dark : '#c2185b',
          size: Math.min(this.cs * 0.75, this.cs * (0.38 + Math.log10(Math.max(10, s.amount)) * 0.07)),
          life: performance.now(),
          max: 950,
        });
      });
    }
    await this.wait(end + 40);
  }

  private activationDuration(a: ActivationEvent): number {
    switch (a.kind) {
      case 'rainbow':
      case 'colorClear':
        return 600 + (a.targets?.length ?? 0) * 0.045 * BEAT;
      case 'colorConvert':
        return 1100 + (a.targets?.length ?? 0) * 0.14 * BEAT;
      case 'cupid':
        return 1.5 * BEAT + 250;
      case 'clearAll':
        return 1200;
      default:
        return 420;
    }
  }

  private activationFx(a: ActivationEvent): void {
    const { x, y } = this.center(a.cell);
    const color = a.color >= 0 ? GEMS[a.color].glow : '#e9a7bb';
    const cs = this.cs;
    const r = Math.floor(a.cell / this.cols);
    const c = a.cell % this.cols;
    const boardL = this.ox;
    const boardR = this.ox + this.cols * cs;
    const boardT = this.oy;
    const boardB = this.oy + this.rows * cs;
    const beamH = (row: number) => {
      if (row < 0 || row >= this.rows) return;
      this.beams.push({ horizontal: true, pos: this.oy + (row + 0.5) * cs, from: x, min: boardL, max: boardR, width: cs * 0.95, color, start: this.now, dur: 430 });
    };
    const beamV = (col: number) => {
      if (col < 0 || col >= this.cols) return;
      this.beams.push({ horizontal: false, pos: this.ox + (col + 0.5) * cs, from: y, min: boardT, max: boardB, width: cs * 0.95, color, start: this.now, dur: 430 });
    };
    this.hooks.onSpecial?.(`fire:${a.kind}`);
    switch (a.kind) {
      case 'lineH':
        beamH(r);
        this.sfx.line();
        this.shake(4);
        break;
      case 'lineV':
        beamV(c);
        this.sfx.line();
        this.shake(4);
        break;
      case 'cross':
        beamH(r);
        beamV(c);
        this.sfx.line();
        this.shake(7);
        break;
      case 'bigCross':
        for (let d = -1; d <= 1; d++) {
          beamH(r + d);
          beamV(c + d);
        }
        this.sfx.line();
        this.sfx.bomb();
        this.shake(11);
        break;
      case 'bomb':
      case 'bigBomb': {
        const big = a.kind === 'bigBomb';
        this.rings.push({ x, y, r0: cs * 0.3, r1: cs * (big ? 3.2 : 2), width: cs * 0.5, color, start: this.now, dur: 420 });
        this.rings.push({ x, y, r0: cs * 0.1, r1: cs * (big ? 2.4 : 1.5), width: cs * 0.12, color: '#c9a15a', start: this.now + 60, dur: 420 });
        this.particles.burst(x, y, color, cs, big ? 40 : 22, big ? 2.4 : 1.6);
        this.particles.hearts(x, y, cs, big ? 10 : 5, '#e9a7bb');
        this.sfx.bomb(big);
        this.shake(big ? 16 : 9);
        break;
      }
      case 'rainbow':
      case 'colorClear':
      case 'colorConvert': {
        const targets = a.targets ?? [];
        const step = a.kind === 'colorConvert' ? 0.05 : 0.045;
        const base = a.kind === 'colorConvert' ? 0.3 : 0.5;
        const col = a.color >= 0 ? GEMS[a.color].glow : '#e9a7bb';
        targets.forEach((tc, k) => {
          this.at((base + k * step) * BEAT, () => {
            const p = this.center(tc);
            this.bolts.push({ x0: x, y0: y, x1: p.x, y1: p.y, color: col, start: this.now, dur: 300 });
          });
        });
        this.rings.push({ x, y, r0: cs * 0.2, r1: cs * 1.6, width: cs * 0.14, color: '#c9a15a', start: this.now, dur: 520 });
        this.particles.burst(x, y, '#f4cdd9', cs, 18, 1.5);
        this.sfx.rainbow();
        this.shake(6);
        break;
      }
      case 'clearAll': {
        this.flashAlpha = 1;
        for (let k = 0; k < 4; k++) {
          this.rings.push({ x, y, r0: cs * 0.2, r1: cs * (3 + k * 2.5), width: cs * 0.3, color: k % 2 ? '#c9a15a' : '#e9a7bb', start: this.now + k * 120, dur: 760 });
        }
        this.particles.confetti(x, y, cs, 60, GEMS.map((g) => g.base));
        this.sfx.rainbow();
        this.sfx.bomb(true);
        this.shake(20);
        break;
      }
      case 'cupid': {
        this.particles.hearts(x, y, cs, 5);
        this.sfx.cupid();
        if (a.to !== undefined && a.to >= 0) {
          const p = this.center(a.to);
          this.flyers.push({ x0: x, y0: y, x1: p.x, y1: p.y, start: this.now, dur: 1.25 * BEAT, color: Math.max(0, a.color) });
        }
        break;
      }
    }
  }

  private blockerFx(b: BlockerEvent): void {
    const vc = this.vcells[b.cell];
    const { x, y } = this.center(b.cell);
    if (b.type === 'choco') {
      vc.blocker = null;
      const pg = this.toPage(x, y);
      this.hooks.onChoco?.(pg.x, pg.y);
      this.ghosts.push({ sprite: this.atlas.choco, x, y, start: this.now, dur: 260 });
      for (let k = 0; k < 14; k++) {
        const a = Math.random() * Math.PI * 2;
        this.particles.add({
          kind: 'crumb',
          x,
          y,
          vx: Math.cos(a) * this.cs * 0.04,
          vy: Math.sin(a) * this.cs * 0.04 - this.cs * 0.02,
          ay: this.cs * 0.0025,
          max: 600,
          size: this.cs * (0.06 + Math.random() * 0.08),
          color: k % 3 ? '#6b3520' : '#a8673f',
        });
      }
      this.sfx.choco();
      return;
    }
    const sprite = (b.gift ? this.atlas.gift : this.atlas.box)[Math.max(0, Math.min(2, (vc.blocker?.hp ?? 1) - 1))];
    if (b.hp > 0) {
      if (vc.blocker) vc.blocker.hp = b.hp;
      vc.shake = 1;
      this.particles.confetti(x, y, this.cs, 5, ['#f4cdd9', '#e9a7bb', '#c9a15a']);
      this.sfx.box(false);
    } else {
      vc.blocker = null;
      this.ghosts.push({ sprite, x, y, start: this.now, dur: 320 });
      this.particles.confetti(x, y, this.cs, 16, ['#f4cdd9', '#e9a7bb', '#c9a15a', '#c9607f']);
      if (b.gift) {
        this.particles.hearts(x, y, this.cs, 8);
        const pg = this.toPage(x, y);
        this.hooks.onGift?.(pg.x, pg.y);
      }
      this.sfx.box(true);
    }
  }

  private fallPos(path: FallPath, tick: number): { x: number; y: number } {
    const steps = path.steps;
    const way: { cell: number; tick: number; virtual?: boolean }[] = [];
    if (path.spawnTick >= 0) way.push({ cell: steps[0].cell, tick: path.spawnTick, virtual: true });
    for (const s of steps) way.push(s);
    const cellXY = (w: { cell: number; virtual?: boolean }) => {
      const c = w.cell % this.cols;
      const r = Math.floor(w.cell / this.cols);
      return w.virtual ? { x: c - this.g[1], y: r - this.g[0] } : { x: c, y: r };
    };
    if (tick <= way[0].tick) return cellXY(way[0]);
    for (let k = 0; k < way.length - 1; k++) {
      const a = way[k];
      const b = way[k + 1];
      if (tick > b.tick) continue;
      const t = b.tick === a.tick ? 1 : (tick - a.tick) / (b.tick - a.tick);
      const pa = cellXY(a);
      const pb = cellXY(b);
      if (!a.virtual && this.portals.has(`${a.cell}>${b.cell}`)) {
        // Dive out of the entry, pop out of the exit.
        if (t < 0.5) return { x: pa.x + this.g[1] * t * 2, y: pa.y + this.g[0] * t * 2 };
        return { x: pb.x - this.g[1] * (1 - t) * 2, y: pb.y - this.g[0] * (1 - t) * 2 };
      }
      return { x: lerp(pa.x, pb.x, t), y: lerp(pa.y, pb.y, t) };
    }
    return cellXY(way[way.length - 1]);
  }

  private async playFall(p: FallPhase): Promise<void> {
    if (!p.paths.length) return;
    const moving: { vt: VTile; path: FallPath }[] = [];
    for (const path of p.paths) {
      let vt = this.tiles.get(path.id);
      if (!vt) {
        const first = this.fallPos(path, -1);
        vt = this.newTile(path.tile, first.x, first.y);
        this.tiles.set(vt.id, vt);
      }
      vt.tile = { ...path.tile };
      vt.scale = 1;
      vt.alpha = 1;
      moving.push({ vt, path });
    }
    const ticks = Math.max(1, p.ticks);
    await this.anim(
      (ticks * TICK) / this.speed,
      (t) => {
        const tick = t * ticks;
        for (const m of moving) {
          const pos = this.fallPos(m.path, tick);
          m.vt.x = pos.x;
          m.vt.y = pos.y;
        }
      },
      linear,
    );
    this.sfx.land();
    for (const m of moving) {
      const vt = m.vt;
      void this.anim(200, (t) => (vt.squash = 1 - 0.17 * Math.sin(Math.PI * t) * (1 - t * 0.5)), linear).then(() => (vt.squash = 1));
    }
  }

  private async playCollect(p: CollectPhase): Promise<void> {
    this.sfx.collect();
    await Promise.all(
      p.items.map(({ id, cell }) => {
        const vt = this.tiles.get(id);
        if (!vt) return Promise.resolve();
        const { x, y } = this.center(cell);
        this.particles.hearts(x, y, this.cs, 8, '#c9a15a');
        this.particles.burst(x, y, '#e8d3a6', this.cs, 12, 1.2);
        const pg = this.toPage(x, y);
        this.hooks.onItem?.(pg.x, pg.y);
        const x0 = vt.x;
        const y0 = vt.y;
        vt.z = 2;
        return this.anim(420, (t) => {
          vt.x = x0 + this.g[1] * t * 0.8;
          vt.y = y0 + this.g[0] * t * 0.8;
          vt.scale = 1 + 0.4 * Math.sin(Math.PI * t);
          vt.alpha = 1 - t;
        }).then(() => this.tiles.delete(id));
      }),
    );
  }

  private async playSpread(p: SpreadPhase): Promise<void> {
    const vt = this.tiles.get(p.tileId);
    const vc = this.vcells[p.to];
    this.sfx.spread();
    vc.blocker = { type: 'choco', hp: 1 };
    vc.grow = 0;
    await this.anim(380, (t) => {
      if (vt) {
        vt.scale = 1 - t;
        vt.alpha = 1 - t;
      }
      vc.grow = t;
    }, easeOutBack);
    vc.grow = 1;
    if (vt) this.tiles.delete(vt.id);
  }

  private async playShuffle(p: ShufflePhase): Promise<void> {
    this.hooks.onShuffle?.();
    this.sfx.shuffle();
    await this.wait(350);
    const recolor = new Map(p.recolor.map((r) => [r.id, r.color]));
    const moves = p.moves
      .map((m) => ({ m, vt: this.tiles.get(m.id) }))
      .filter((x): x is { m: (typeof p.moves)[number]; vt: VTile } => !!x.vt);
    let swapped = false;
    await this.anim(
      620,
      (t) => {
        for (const { m, vt } of moves) {
          const [fc, fr, tc, tr] = [m.from % this.cols, Math.floor(m.from / this.cols), m.to % this.cols, Math.floor(m.to / this.cols)];
          vt.x = lerp(fc, tc, t);
          vt.y = lerp(fr, tr, t) - Math.sin(Math.PI * t) * 0.6;
          vt.rot = Math.sin(Math.PI * t) * 0.8;
          vt.scale = 1 - 0.25 * Math.sin(Math.PI * t);
        }
        if (!swapped && t > 0.5) {
          swapped = true;
          for (const { vt } of moves) {
            const c = recolor.get(vt.id);
            if (c !== undefined) vt.tile.color = c;
          }
        }
      },
      easeInOutCubic,
    );
    for (const { vt } of moves) vt.rot = 0;
  }

  /** Gems rain down when a level starts. */
  async intro(): Promise<void> {
    const list = [...this.tiles.values()];
    const targets = list.map((vt) => ({ vt, x: vt.x, y: vt.y }));
    for (const t of targets) {
      t.vt.y = t.y - this.rows - 1 - Math.random() * 1.5;
      t.vt.alpha = 1;
    }
    await Promise.all(
      targets.map(({ vt, y }) =>
        this.anim(520, (t) => (vt.y = lerp(y - this.rows - 1.5, y, t)), easeOutBack, (vt.x * 35 + (this.rows - y) * 25) * 0.9),
      ),
    );
  }

  celebrate(): void {
    const cx = this.ox + (this.cols * this.cs) / 2;
    const cy = this.oy + (this.rows * this.cs) / 2;
    this.particles.confetti(cx, cy, this.cs, 90, ['#c9607f', '#e9a7bb', '#c9a15a', '#f4cdd9', '#e8d3a6', '#ffffff']);
    for (let k = 0; k < 4; k++) this.at(k * 160, () => this.particles.hearts(cx + (Math.random() - 0.5) * this.cs * 5, cy, this.cs, 8));
  }

  // ───────────────────────────── frame loop ─────────────────────────────

  private frame = (time: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(100, time - this.last);
    this.last = time;
    this.now = performance.now();
    this.updateTweens();
    this.particles.update(dt);
    this.shakeMag *= Math.pow(0.86, dt / 16.67);
    if (this.shakeMag < 0.3) this.shakeMag = 0;
    this.flashAlpha = Math.max(0, this.flashAlpha - dt / 600);
    for (const vc of this.vcells) vc.shake = Math.max(0, vc.shake - dt / 300);
    for (const vt of this.tiles.values()) if (vt.flash > 0 && vt.flash < 0.99) vt.flash = Math.max(0, vt.flash - dt / 400);
    if (this.game && this.now > this.nextTwinkle) {
      this.nextTwinkle = this.now + 180 + Math.random() * 260;
      const all = [...this.tiles.values()];
      const vt = all[Math.floor(Math.random() * all.length)];
      if (vt && vt.scale === 1) {
        const { x, y } = this.px(vt.x, vt.y);
        this.particles.add({ kind: 'twinkle', x: x - this.cs * 0.18, y: y - this.cs * 0.2, max: 700, size: this.cs * 0.16 });
      }
    }
    this.draw();
  };

  private updateTweens(): void {
    const now = performance.now();
    const list = this.tweens;
    this.tweens = [];
    const keep: Tween[] = [];
    const finished: Tween[] = [];
    for (const tw of list) {
      if (now < tw.start) {
        keep.push(tw);
        continue;
      }
      const t = tw.dur <= 0 ? 1 : Math.min(1, (now - tw.start) / tw.dur);
      tw.fn(tw.ease(t));
      (t >= 1 ? finished : keep).push(tw);
    }
    // Tweens created inside callbacks were pushed onto the fresh array.
    this.tweens = keep.concat(this.tweens);
    for (const tw of finished) tw.done();
  }

  private draw(): void {
    const { ctx, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.game || !this.plate) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = this.shakeMag ? (Math.random() - 0.5) * this.shakeMag : 0;
    const sy = this.shakeMag ? (Math.random() - 0.5) * this.shakeMag : 0;
    ctx.translate(sx, sy);
    ctx.drawImage(this.plate, 0, 0, this.W, this.H);
    this.drawJelly();
    this.drawBlockers();
    this.drawSelection();

    ctx.save();
    if (this.clip) ctx.clip(this.clip);
    const list = [...this.tiles.values()].sort((a, b) => a.z - b.z);
    for (const vt of list) this.drawTile(vt);
    ctx.restore();

    this.drawLocks();
    this.drawFx();
    if (this.flashAlpha > 0) {
      ctx.fillStyle = `rgba(255,236,243,${this.flashAlpha * 0.8})`;
      ctx.fillRect(-20, -20, this.W + 40, this.H + 40);
    }
  }

  private drawJelly(): void {
    const { ctx, cs } = this;
    for (let i = 0; i < this.vcells.length; i++) {
      const vc = this.vcells[i];
      if (!vc.playable || vc.jelly <= 0) continue;
      const { x, y } = this.center(i);
      const s = cs * (1 + Math.sin(this.now * 0.02) * vc.shake * 0.08);
      ctx.drawImage(this.atlas.jelly[Math.min(2, vc.jelly) - 1], x - s / 2, y - s / 2, s, s);
    }
  }

  private drawBlockers(): void {
    const { ctx, cs } = this;
    for (let i = 0; i < this.vcells.length; i++) {
      const vc = this.vcells[i];
      const b = vc.blocker;
      if (!b) continue;
      const { x, y } = this.center(i);
      const sprite = b.type === 'choco' ? this.atlas.choco : (b.gift ? this.atlas.gift : this.atlas.box)[Math.max(0, Math.min(2, b.hp - 1))];
      const jig = vc.shake > 0 ? Math.sin(this.now * 0.08) * vc.shake * cs * 0.06 : 0;
      const s = cs * vc.grow;
      ctx.drawImage(sprite, x - s / 2 + jig, y - s / 2, s, s);
    }
  }

  private drawLocks(): void {
    const { ctx, cs } = this;
    for (let i = 0; i < this.vcells.length; i++) {
      if (this.vcells[i].lock <= 0) continue;
      const { x, y } = this.center(i);
      ctx.drawImage(this.atlas.lock, x - cs / 2, y - cs / 2, cs, cs);
    }
  }

  private drawSelection(): void {
    const { ctx, cs } = this;
    const mark = (cell: number, alpha: number) => {
      const { x, y } = this.center(cell);
      roundRect(ctx, x - cs * 0.46, y - cs * 0.46, cs * 0.92, cs * 0.92, cs * 0.22);
      ctx.strokeStyle = `rgba(201,96,127,${alpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = `rgba(201,96,127,${alpha * 0.08})`;
      ctx.fill();
    };
    if (this.selected >= 0) mark(this.selected, 0.7 + 0.3 * Math.sin(this.now * 0.012));
    if (this.hint) {
      const a = 0.35 + 0.35 * Math.sin(this.now * 0.008);
      mark(this.hint.a, a);
      mark(this.hint.b, a);
    }
  }

  private drawTile(vt: VTile): void {
    const { ctx, cs, atlas } = this;
    const t = vt.tile;
    let { x, y } = this.px(vt.x, vt.y);
    if (this.hint && this.inputEnabled) {
      const cell = Math.round(vt.y) * this.cols + Math.round(vt.x);
      if (cell === this.hint.a || cell === this.hint.b) {
        const other = cell === this.hint.a ? this.hint.b : this.hint.a;
        const o = this.center(other);
        const w = Math.max(0, Math.sin(this.now * 0.009)) * 0.12;
        x += (o.x - x) * w;
        y += (o.y - y) * w;
      }
    }
    let s = cs * vt.scale;
    if (this.selected >= 0 && vt.scale === 1 && Math.round(vt.y) * this.cols + Math.round(vt.x) === this.selected) s *= 1.1;
    if (s <= 0.5 || vt.alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = vt.alpha;
    ctx.translate(x, y);
    if (vt.rot) ctx.rotate(vt.rot);
    if (vt.squash !== 1) {
      ctx.translate(0, s * 0.5 * (1 - vt.squash));
      ctx.scale(2 - vt.squash, vt.squash);
    }
    let sprite: HTMLCanvasElement;
    if (t.item) {
      sprite = t.item === 'ring' ? atlas.ring : atlas.letter;
      ctx.translate(0, Math.sin(this.now * 0.004 + vt.id) * cs * 0.03);
    } else if (t.special === 'rainbow') {
      const pulse = 1.3 + Math.sin(this.now * 0.005) * 0.12;
      ctx.globalAlpha = vt.alpha * 0.5;
      ctx.drawImage(atlas.goldGlow, (-s * pulse) / 2, (-s * pulse) / 2, s * pulse, s * pulse);
      ctx.globalAlpha = vt.alpha;
      ctx.rotate(this.now * 0.0006);
      sprite = atlas.rainbow;
    } else if (t.special !== 'none' && t.color >= 0) {
      sprite = atlas.special[t.special][t.color];
      if (t.special === 'bomb') {
        const pulse = 1.3 + Math.sin(this.now * 0.006 + vt.id) * 0.12;
        ctx.globalAlpha = vt.alpha * 0.32;
        ctx.drawImage(atlas.glows[t.color], (-s * pulse) / 2, (-s * pulse) / 2, s * pulse, s * pulse);
        ctx.globalAlpha = vt.alpha;
      } else if (t.special === 'cupid') {
        const flap = 0.65 + Math.abs(Math.sin(this.now * 0.014 + vt.id)) * 0.45;
        for (const dir of [-1, 1]) {
          ctx.save();
          ctx.translate(dir * s * 0.34, -s * 0.06);
          ctx.scale(dir, flap);
          ctx.drawImage(atlas.wing, -s * 0.05, -s * 0.38, s * 0.5, s * 0.5);
          ctx.restore();
        }
        ctx.translate(0, Math.sin(this.now * 0.006 + vt.id) * cs * 0.025);
      } else {
        const shine = 0.5 + 0.5 * Math.sin(this.now * 0.006 + vt.id);
        ctx.globalAlpha = vt.alpha * 0.18 * shine;
        ctx.drawImage(atlas.goldGlow, -s * 0.62, -s * 0.62, s * 1.24, s * 1.24);
        ctx.globalAlpha = vt.alpha;
      }
    } else {
      sprite = atlas.gems[Math.max(0, t.color)];
    }
    ctx.drawImage(sprite, -s / 2, -s / 2, s, s);
    if (vt.flash > 0) {
      ctx.globalAlpha = Math.min(1, vt.flash) * 0.85;
      ctx.drawImage(atlas.whiteGlow, -s * 0.6, -s * 0.6, s * 1.2, s * 1.2);
    }
    ctx.restore();
  }

  private drawFx(): void {
    const { ctx, cs, now } = this;
    ctx.save();
    // Light board: everything is drawn with normal blending in rose / gold / fruit tones.
    this.beams = this.beams.filter((b) => now - b.start < b.dur);
    for (const b of this.beams) {
      const t = Math.max(0, (now - b.start) / b.dur);
      const ext = easeOutCubic(Math.min(1, t / 0.22));
      const fade = 1 - Math.max(0, (t - 0.2) / 0.8);
      const w = b.width * (0.25 + 0.75 * fade);
      const lo = b.from - (b.from - b.min) * ext;
      const hi = b.from + (b.max - b.from) * ext;
      const g = b.horizontal
        ? ctx.createLinearGradient(0, b.pos - w / 2, 0, b.pos + w / 2)
        : ctx.createLinearGradient(b.pos - w / 2, 0, b.pos + w / 2, 0);
      g.addColorStop(0, b.color + '00');
      g.addColorStop(0.28, b.color + '66');
      g.addColorStop(0.46, '#ffffff');
      g.addColorStop(0.54, '#ffffff');
      g.addColorStop(0.72, b.color + '66');
      g.addColorStop(1, b.color + '00');
      ctx.globalAlpha = fade;
      ctx.fillStyle = g;
      if (b.horizontal) ctx.fillRect(lo, b.pos - w / 2, hi - lo, w);
      else ctx.fillRect(b.pos - w / 2, lo, w, hi - lo);
      ctx.globalAlpha = fade * 0.9;
      const head = cs * 0.9;
      for (const end of [lo, hi]) {
        const hx = b.horizontal ? end : b.pos;
        const hy = b.horizontal ? b.pos : end;
        ctx.drawImage(this.atlas.goldGlow, hx - head / 2, hy - head / 2, head, head);
      }
    }
    this.rings = this.rings.filter((r) => now - r.start < r.dur);
    for (const r of this.rings) {
      const t = (now - r.start) / r.dur;
      if (t < 0) continue;
      const rad = lerp(r.r0, r.r1, easeOutCubic(t));
      ctx.globalAlpha = (1 - t) * 0.75;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = Math.max(0.5, r.width * (1 - t));
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.bolts = this.bolts.filter((b) => now - b.start < b.dur);
    for (const b of this.bolts) {
      const t = (now - b.start) / b.dur;
      const pts: [number, number][] = [];
      const dx = b.x1 - b.x0;
      const dy = b.y1 - b.y0;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const segs = Math.max(3, Math.round(len / (cs * 0.5)));
      for (let k = 0; k <= segs; k++) {
        const f = k / segs;
        const j = k === 0 || k === segs ? 0 : (Math.random() - 0.5) * cs * 0.35;
        pts.push([b.x0 + dx * f + nx * j, b.y0 + dy * f + ny * j]);
      }
      ctx.globalAlpha = 1 - t;
      for (const [width, color] of [
        [cs * 0.14, b.color + '88'],
        [cs * 0.045, '#ffffff'],
      ] as const) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        pts.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.stroke();
      }
      ctx.drawImage(this.atlas.goldGlow, b.x1 - cs * 0.5, b.y1 - cs * 0.5, cs, cs);
    }
    ctx.restore();

    this.ghosts = this.ghosts.filter((g) => now - g.start < g.dur);
    for (const g of this.ghosts) {
      const t = (now - g.start) / g.dur;
      const s = cs * (1 + t * 0.6);
      ctx.globalAlpha = 1 - t;
      ctx.drawImage(g.sprite, g.x - s / 2, g.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;

    this.flyers = this.flyers.filter((f) => now - f.start < f.dur);
    for (const f of this.flyers) {
      const t = easeInOutCubic(Math.max(0, (now - f.start) / f.dur));
      const mx = (f.x0 + f.x1) / 2;
      const my = Math.min(f.y0, f.y1) - cs * 1.8;
      const x = (1 - t) * (1 - t) * f.x0 + 2 * (1 - t) * t * mx + t * t * f.x1;
      const y = (1 - t) * (1 - t) * f.y0 + 2 * (1 - t) * t * my + t * t * f.y1;
      if (Math.random() < 0.6) this.particles.add({ kind: 'heart', x, y, vy: cs * 0.004, max: 500, size: cs * 0.09, color: '#e9a7bb' });
      const s = cs * 0.9;
      ctx.save();
      ctx.translate(x, y);
      const flap = 0.6 + Math.abs(Math.sin(now * 0.03)) * 0.5;
      for (const dir of [-1, 1]) {
        ctx.save();
        ctx.translate(dir * s * 0.3, -s * 0.05);
        ctx.scale(dir, flap);
        ctx.drawImage(this.atlas.wing, -s * 0.05, -s * 0.4, s * 0.55, s * 0.55);
        ctx.restore();
      }
      ctx.drawImage(this.atlas.special.cupid[f.color] ?? this.atlas.heart, -s / 2, -s / 2, s, s);
      ctx.restore();
    }

    this.particles.draw(ctx, this.atlas.goldGlow);

    // `life` holds the spawn time; texts age in real time regardless of frame rate.
    this.texts = this.texts.filter((t) => now - t.life < t.max);
    for (const tx of this.texts) {
      const t = (now - tx.life) / tx.max;
      const y = tx.y - easeOutCubic(t) * cs * 0.9;
      const scale = t < 0.15 ? easeOutBack(t / 0.15) : 1;
      ctx.save();
      ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      ctx.translate(tx.x, y);
      ctx.scale(scale, scale);
      ctx.font = `italic 500 ${tx.size * 0.92}px Kanit, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = tx.size * 0.2;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(tx.text, 0, 0);
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.text, 0, 0);
      ctx.restore();
    }
  }

  /** Floating heart drawn into a DOM-free spot (used by the heart refill animation on the board). */
  heartBurst(cell: number): void {
    const { x, y } = this.center(cell);
    this.particles.hearts(x, y, this.cs, 12);
  }
}


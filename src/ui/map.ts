import { PERSONAL } from '../config/personal';
import { tierFor, TOTAL_LEVELS } from '../levels/difficulty';
import { iconURL } from '../render/sprites';
import { THEMES, applyTheme, chapterOf, themeFor } from '../render/themes';
import { MAX_HEARTS } from '../state/save';
import type { App } from './app';
import { coupleSVG } from './couple';
import { L } from '../i18n';
import { $, esc } from './dom';
import { heartsRow, icon, roman, starsRow } from './icons';

const SPACING = 104;
const TOP_PAD = 260;
const BOTTOM_PAD = 200;
const CHAPTER = 20;
const TRACK_H = TOP_PAD + (TOTAL_LEVELS - 1) * SPACING + BOTTOM_PAD;

const yOf = (n: number) => TRACK_H - BOTTOM_PAD - (n - 1) * SPACING;
const xFrac = (n: number) => 0.5 + 0.27 * Math.sin(n * 0.82) + 0.07 * Math.sin(n * 0.31 + 1);

/** Saga-style winding map with 1000 nodes; only the visible ones are in the DOM. */
export class MapScreen {
  readonly el: HTMLElement;
  private scroller!: HTMLElement;
  private layer!: HTMLElement;
  private pathSvg!: SVGSVGElement;
  private pending = false;
  private lastTheme = -1;

  constructor(private app: App) {
    this.el = document.createElement('section');
    this.el.className = 'screen screen-map';
    this.el.innerHTML = `
      <header class="topbar">
        <button class="pill hearts" aria-label="${esc(L.common.hearts)}"></button>
        <div class="pill stats"><span title="${esc(L.common.totalStars)}">${icon('star', 'gold')}<span class="stars-total">0</span></span><i class="sep"></i><span title="${esc(L.common.pearls)}">${icon('pearl')}<span class="boost">0</span></span></div>
        <span class="grow"></span>
        <button class="icon-btn book" aria-label="${esc(L.title.book)}">${icon('book')}</button>
        <button class="icon-btn gear" aria-label="${esc(L.title.settings)}">${icon('settings')}</button>
      </header>
      <div class="chapter-now"></div>
      <div class="map-scroll">
        <div class="map-track" style="height:${TRACK_H}px">
          <div class="bands">${this.bandsHTML()}</div>
          <svg class="map-path" xmlns="http://www.w3.org/2000/svg"></svg>
          <div class="nodes"></div>
        </div>
      </div>
      <button class="btn play-current">${icon('play')}${esc(L.map.play)} <span class="cur">1</span></button>`;
    this.scroller = $('.map-scroll', this.el);
    this.layer = $('.nodes', this.el);
    this.pathSvg = this.el.querySelector('.map-path') as SVGSVGElement;
    this.scroller.addEventListener('scroll', () => this.schedule(), { passive: true });
    window.addEventListener('resize', () => this.schedule());
    $('.book', this.el).addEventListener('click', () => app.gallery());
    $('.gear', this.el).addEventListener('click', () => app.settings());
    $('.hearts', this.el).addEventListener('click', () => app.offerRefill());
    $('.play-current', this.el).addEventListener('click', () => app.openLevel(this.current()));
    this.layer.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('.node');
      if (!btn) return;
      const n = Number(btn.dataset.level);
      if (n <= this.app.save.data.unlocked || this.app.dev) this.app.openLevel(n);
      else {
        btn.classList.remove('nope');
        void btn.offsetWidth;
        btn.classList.add('nope');
        this.app.sfx.invalid();
      }
    });
  }

  private current(): number {
    return Math.min(TOTAL_LEVELS, this.app.save.data.unlocked);
  }

  private bandsHTML(): string {
    const out: string[] = [];
    for (let k = 0; k < Math.ceil(TOTAL_LEVELS / CHAPTER); k++) {
      const first = k * CHAPTER + 1;
      const last = Math.min(TOTAL_LEVELS, first + CHAPTER - 1);
      const top = k === Math.ceil(TOTAL_LEVELS / CHAPTER) - 1 ? 0 : yOf(last) - SPACING / 2;
      const bottom = k === 0 ? TRACK_H : yOf(first) + SPACING / 2;
      const th = THEMES[k % THEMES.length];
      const deco = Array.from({ length: 6 }, (_, i) => {
        const x = (Math.sin(k * 7.1 + i * 2.3) * 0.5 + 0.5) * 88;
        const y = ((i + 0.5) / 6) * 100;
        const rot = Math.round(Math.sin(k * 3.3 + i) * 25);
        return `<img class="deco" src="${iconURL(`gem${(k + i) % 6}`, 72)}" alt="" style="left:${x}%;top:${y}%;transform:rotate(${rot}deg)"/>`;
      }).join('');
      out.push(`
        <div class="band" style="top:${top}px;height:${bottom - top}px;background:linear-gradient(180deg, ${th.bg[0]}, ${th.bg[1]} 55%, ${th.bg[2]})">
          ${deco}
        </div>`);
    }
    return out.join('');
  }

  show(focus?: number): void {
    this.lastTheme = -1;
    this.refreshTop();
    this.schedule();
    const target = focus ?? this.current();
    requestAnimationFrame(() => {
      // Start one node back and glide forward, so a freshly unlocked level feels like progress.
      this.scrollToLevel(Math.max(1, target - 1), false);
      setTimeout(() => this.scrollToLevel(target, true), 250);
    });
  }

  refreshTop(): void {
    const d = this.app.save.data;
    $('.hearts', this.el).innerHTML = heartsRow(d.hearts, MAX_HEARTS);
    $('.stars-total', this.el).textContent = String(this.app.save.totalStars());
    $('.boost', this.el).textContent = String(d.boosters.rainbow);
    $('.cur', this.el).textContent = String(this.current());
  }

  scrollToLevel(n: number, smooth = true): void {
    const y = yOf(n) - this.scroller.clientHeight * 0.55;
    this.scroller.scrollTo({ top: Math.max(0, y), behavior: smooth ? 'smooth' : 'auto' });
    this.schedule();
  }

  private schedule(): void {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      this.renderVisible();
    });
  }

  private renderVisible(): void {
    const top = this.scroller.scrollTop;
    const h = this.scroller.clientHeight || window.innerHeight;
    const w = this.scroller.clientWidth || window.innerWidth;
    const mid = top + h * 0.5;
    const midLevel = Math.max(1, Math.min(TOTAL_LEVELS, Math.round((TRACK_H - BOTTOM_PAD - mid) / SPACING) + 1));
    const theme = Math.floor((midLevel - 1) / CHAPTER);
    if (theme !== this.lastTheme) {
      this.lastTheme = theme;
      const th = themeFor(midLevel);
      applyTheme(th);
      const label = $('.chapter-now', this.el);
      label.innerHTML = `<span class="serif">${esc(L.map.chapter)} ${roman(chapterOf(midLevel) + 1)}</span><span>${esc(L.chapters[chapterOf(midLevel) % L.chapters.length])}</span>`;
      label.classList.remove('pop');
      void label.offsetWidth;
      label.classList.add('pop');
    }
    const lo = Math.max(1, Math.floor((TRACK_H - BOTTOM_PAD - (top + h + 300)) / SPACING) + 1);
    const hi = Math.min(TOTAL_LEVELS, Math.ceil((TRACK_H - BOTTOM_PAD - (top - 300)) / SPACING) + 1);
    const d = this.app.save.data;
    const cur = this.current();
    const nodes: string[] = [];
    for (let n = lo; n <= hi; n++) {
      const x = xFrac(n) * w;
      const y = yOf(n);
      const tier = n <= 10 ? 'tutorial' : tierFor(n);
      const stars = d.stars[n] ?? 0;
      const state = n < cur || stars > 0 ? 'done' : n === cur ? 'current' : n <= d.unlocked || this.app.dev ? 'open' : 'locked';
      const badge =
        state === 'locked'
          ? ''
          : tier === 'hard'
            ? `<i class="badge">${icon('flame')}</i>`
            : tier === 'boss'
              ? `<i class="badge boss">${icon('clock')}</i>`
              : '';
      const special = PERSONAL.specialLevels[n] && state !== 'locked' ? `<i class="badge sp">${icon('heart')}</i>` : '';
      const starHTML = state === 'done' ? `<span class="stars">${starsRow(stars)}</span>` : '';
      const avatar = n === cur ? `<div class="avatar">${coupleSVG('happy', { size: 84 })}</div>` : '';
      nodes.push(
        `<button class="node ${state} tier-${tier}" data-level="${n}" style="left:${x}px;top:${y}px" aria-label="${esc(L.common.level(n))}">${avatar}${state === 'locked' ? icon('lock') : `<span class="num">${n}</span>`}${badge}${special}${starHTML}</button>`,
      );
    }
    this.layer.innerHTML = nodes.join('');

    // Dotted candy path through the visible nodes.
    const a = Math.max(1, lo - 1);
    const b = Math.min(TOTAL_LEVELS, hi + 1);
    const pts = [];
    for (let n = a; n <= b; n++) pts.push([xFrac(n) * w, yOf(n)]);
    let dPath = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      dPath += ` C${x0},${y0 - SPACING * 0.5} ${x1},${y1 + SPACING * 0.5} ${x1},${y1}`;
    }
    const doneUpTo = Math.min(b, Math.max(a, cur));
    const donePts = pts.slice(0, Math.max(1, doneUpTo - a + 1));
    let dDone = `M${donePts[0][0]},${donePts[0][1]}`;
    for (let i = 1; i < donePts.length; i++) {
      const [x0, y0] = donePts[i - 1];
      const [x1, y1] = donePts[i];
      dDone += ` C${x0},${y0 - SPACING * 0.5} ${x1},${y1 + SPACING * 0.5} ${x1},${y1}`;
    }
    // Keep the SVG only as tall as the visible window (huge SVG layers upset mobile GPUs).
    const svgTop = yOf(b) - SPACING;
    const svgH = yOf(a) - yOf(b) + SPACING * 2;
    this.pathSvg.setAttribute('width', String(w));
    this.pathSvg.setAttribute('height', String(svgH));
    this.pathSvg.style.top = `${svgTop}px`;
    this.pathSvg.innerHTML = `<g transform="translate(0,${-svgTop})">
      <path d="${dPath}" class="road"/>
      <path d="${dPath}" class="dots"/>
      ${cur > a ? `<path d="${dDone}" class="dots done"/>` : ''}</g>`;
  }
}

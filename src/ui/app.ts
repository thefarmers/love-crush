import { TRACKS } from '../audio/music';
import { Sfx, vibrate } from '../audio/sfx';
import { PERSONAL } from '../config/personal';
import { L, levelTip, levelTitle, SPEECH_LANG } from '../i18n';
import { getLevel, TOTAL_LEVELS } from '../levels/index';
import { newMechanicsAt } from '../levels/mechanics';
import { Background } from '../render/background';
import { applyTheme, themeFor } from '../render/themes';
import { validateConfig } from '../config/validate';
import { SaveStore, type MusicChoice } from '../state/save';
import { LoveListener } from '../voice/listener';
import { coupleSVG } from './couple';
import { $, esc, openModal, toast } from './dom';
import { GameScreen } from './game-screen';
import { goalIcon, goalText } from './goals';
import { icon, starsRow } from './icons';
import { openGallery, openLoveModal, showLoveCard, type LoveMode, type LoveResult } from './love-ui';
import { MapScreen } from './map';

function safeStorage(): Storage | null {
  try {
    const s = window.localStorage;
    s.setItem('__lc', '1');
    s.removeItem('__lc');
    return s;
  } catch {
    return null;
  }
}

export class App {
  readonly save = new SaveStore(safeStorage());
  readonly sfx = new Sfx(PERSONAL.bgm);
  readonly listener = new LoveListener(SPEECH_LANG);
  readonly dev: boolean;
  private title: HTMLElement;
  private map: MapScreen;
  private game: GameScreen;
  private current: HTMLElement | null = null;

  constructor(root: HTMLElement) {
    const params = new URLSearchParams(location.search);
    this.dev = params.has('dev');
    for (const issue of validateConfig(PERSONAL)) console.warn(`[love-crush config] ${issue}`);
    document.documentElement.lang = PERSONAL.locale;
    new Background($('#bg') as HTMLCanvasElement);
    this.sfx.sfxOn = this.save.data.settings.sfx;
    this.sfx.setMusic(this.save.data.settings.music);
    const set = this.save.data.settings;
    // A configured song is the default for a brand-new player; fall back if it was removed.
    if (PERSONAL.bgm && this.save.data.stats.wins === 0 && set.track === 'kalimba') set.track = 'custom';
    if (set.track === 'custom' && !PERSONAL.bgm) set.track = 'kalimba';
    this.sfx.setTrack(set.track);

    this.title = document.createElement('section');
    this.title.className = 'screen screen-title';
    this.title.innerHTML = `
      <div class="title-inner">
        <div class="brand">
          <p class="kicker">${esc(L.title.kicker)}</p>
          <h1>Love Crush</h1>
          <div class="rule">${icon('heart')}</div>
          <p class="subtitle">${esc(L.title.subtitle(PERSONAL.partnerName))}</p>
        </div>
        <button class="title-couple" aria-label="${esc(L.title.surprise)}">${coupleSVG('happy', { names: true, size: 240 })}</button>
        <button class="btn big start">${esc(L.title.start)}</button>
        <div class="title-links">
          <button class="link book">${icon('book')}${esc(L.title.book)}</button>
          <button class="link gear">${icon('settings')}${esc(L.title.settings)}</button>
        </div>
        <p class="title-progress"></p>
      </div>`;
    this.map = new MapScreen(this);
    this.game = new GameScreen(this);
    root.append(this.title, this.map.el, this.game.el);

    $('.start', this.title).addEventListener('click', () => {
      this.sfx.click();
      this.goMap();
    });
    $('.book', this.title).addEventListener('click', () => this.gallery());
    $('.gear', this.title).addEventListener('click', () => this.settings());
    let taps = 0;
    $('.title-couple', this.title).addEventListener('click', (e) => {
      const el = e.currentTarget as HTMLElement;
      el.classList.remove('boing');
      void el.offsetWidth;
      el.classList.add('boing');
      this.sfx.star(taps % 3);
      if (++taps === 7) {
        taps = 0;
        el.innerHTML = coupleSVG('love', { names: true, size: 240 });
        toast(L.title.easterEgg(PERSONAL.myName, PERSONAL.partnerName), 2600);
      }
    });

    // Browsers only allow audio after a gesture.
    document.addEventListener('pointerdown', () => this.sfx.unlock(), { capture: true });

    const jump = Number(params.get('level'));
    this.goTitle();
    if (jump >= 1 && jump <= TOTAL_LEVELS) {
      if (this.dev) this.save.data.unlocked = Math.max(this.save.data.unlocked, jump);
      this.goMap(jump);
      this.openLevel(jump);
    }
  }

  private show(el: HTMLElement): void {
    if (this.current === el) return;
    this.current?.classList.remove('active');
    el.classList.add('active');
    this.current = el;
  }

  goTitle(): void {
    this.game.stop();
    applyTheme(themeFor(this.save.data.unlocked));
    const d = this.save.data;
    $('.title-progress', this.title).textContent = L.title.progress(
      Math.min(d.unlocked, TOTAL_LEVELS),
      TOTAL_LEVELS.toLocaleString(),
      this.save.totalStars(),
      d.cards.length,
      PERSONAL.loveCards.length,
    );
    this.show(this.title);
  }

  goMap(focus?: number): void {
    this.game.stop();
    this.show(this.map.el);
    this.map.show(focus);
  }

  vibrate(p: number | number[]): void {
    vibrate(p, this.save.data.settings.vibrate);
  }

  setSetting(k: 'sfx' | 'music' | 'vibrate', v: boolean): void {
    this.save.setSetting(k, v);
    if (k === 'sfx') this.sfx.sfxOn = v;
    if (k === 'music') this.sfx.setMusic(v);
  }

  setTrack(choice: MusicChoice): void {
    this.save.setSetting('track', choice);
    this.sfx.setTrack(choice);
    if (!this.save.data.settings.music) this.setSetting('music', true);
    this.sfx.unlock();
  }

  /** Level card before playing. */
  openLevel(n: number): void {
    if (n > TOTAL_LEVELS) {
      toast(L.title.allDone, 3000);
      return;
    }
    const lv = getLevel(n);
    const boosters = this.save.data.boosters.rainbow;
    const note = PERSONAL.specialLevels[n];
    const title = levelTitle(lv);
    const tip = levelTip(lv);
    const best = this.save.data.best[n];
    const goals = lv.goals
      .map((g) => `<li><img src="${goalIcon(g, lv)}" alt=""/><span>${esc(goalText(g, lv))}</span></li>`)
      .join('');
    const m = openModal(
      `
      <div class="level-card tier-${lv.tier}">
        <p class="kicker th"><span class="tier-dot"></span>${esc(L.tiers[lv.tier])}</p>
        <h2 class="display">Level ${n}</h2>
        ${title ? `<p class="lvl-title">${esc(title)}</p>` : ''}
        ${note ? `<p class="special-note">${esc(note)}</p>` : ''}
        <ul class="goal-list">${goals}</ul>
        <div class="limit">${lv.time ? `<b>${lv.time}</b><span>${esc(L.levelCard.seconds)}</span>` : `<b>${lv.moves}</b><span>${esc(L.levelCard.moves)}</span>`}</div>
        ${tip ? `<p class="tip">${icon('bulb')}<span>${esc(tip)}</span></p>` : ''}
        ${newMechanicsAt(n, getLevel)
          .map((m) => `<p class="tip new">${icon('sparkle')}<span>${esc(L.levelCard.newMechanic)} — ${esc(L.mechanics[m.key])}</span></p>`)
          .join('')}
        ${best ? `<p class="record">${esc(L.levelCard.record)} ${best.toLocaleString()} ${starsRow(this.save.data.stars[n] ?? 0)}</p>` : ''}
        ${
          boosters > 0
            ? `<label class="toggle booster"><input type="checkbox" class="use-booster"/><span>${icon('pearl')}${esc(L.levelCard.booster(boosters))}</span></label>`
            : ''
        }
        <div class="row center"><button class="btn big play">${icon('play')}${esc(L.levelCard.play)}</button></div>
        <div class="row center"><button class="btn quiet small close">${esc(L.levelCard.later)}</button></div>
      </div>`,
      { cls: 'level-modal', dismissible: true },
    );
    $('.play', m.el).addEventListener('click', async () => {
      const use = (m.el.querySelector('.use-booster') as HTMLInputElement | null)?.checked ?? false;
      await m.close();
      this.startLevel(n, use);
    });
    $('.close', m.el).addEventListener('click', () => void m.close());
  }

  async startLevel(n: number, booster: boolean): Promise<void> {
    if (this.save.hearts <= 0) {
      const r = await this.love('refill');
      if (!r.ok) {
        this.goMap(n);
        return;
      }
    }
    const use = booster && this.save.useBooster('rainbow');
    this.show(this.game.el);
    await this.game.start(n, use);
  }

  /** Full "say I love you" flow: mic → reward → love card. */
  async love(mode: LoveMode): Promise<LoveResult> {
    const r = await openLoveModal({ sfx: this.sfx, listener: this.listener, vibrate: (p) => this.vibrate(p) }, mode);
    if (!r.ok) return r;
    if (mode === 'refill') this.save.refillHearts();
    else this.save.data.stats.loveSaid++;
    if (r.secret && mode === 'refill') this.save.addBooster('rainbow');
    const card = this.save.drawCard(PERSONAL.loveCards.length);
    await showLoveCard(card, this.save, r.secret, this.sfx);
    this.map.refreshTop();
    return r;
  }

  async offerRefill(): Promise<void> {
    if (this.save.hearts >= 5) {
      toast(L.toast.heartsFull);
      return;
    }
    await this.love('refill');
  }

  gallery(): void {
    openGallery(this.save, this.sfx);
  }

  settings(): void {
    const s = this.save.data.settings;
    const m = openModal(
      `
      <p class="kicker">${esc(L.settings.kicker)}</p>
      <h2>${esc(L.settings.title)}</h2>
      <div class="toggles">
        <label class="toggle"><input type="checkbox" data-k="sfx" ${s.sfx ? 'checked' : ''}/><span>${esc(L.settings.sfx)}</span></label>
        <label class="toggle"><input type="checkbox" data-k="music" ${s.music ? 'checked' : ''}/><span>${esc(L.settings.music)}</span></label>
        <label class="toggle"><input type="checkbox" data-k="vibrate" ${s.vibrate ? 'checked' : ''}/><span>${esc(L.settings.vibrate)}</span></label>
      </div>
      <p class="section-title">${esc(L.settings.tracks)}</p>
      <div class="tracks">
        ${[
          ...TRACKS.map((t) => ({ id: t.id as MusicChoice, name: t.name, mood: L.tracks[t.id] })),
          ...(PERSONAL.bgm ? [{ id: 'custom' as MusicChoice, name: 'Our Song', mood: L.settings.ourSong }] : []),
        ]
          .map(
            (t) =>
              `<button class="track ${s.track === t.id ? 'on' : ''}" data-id="${t.id}"><span class="t-icon">${icon('music')}</span><span class="t-text"><b>${t.name}</b><small>${esc(t.mood)}</small></span><span class="t-check">✓</span></button>`,
          )
          .join('')}
      </div>
      <p class="muted center">${esc(L.settings.stats(this.save.data.stats.loveSaid, this.save.data.stats.wins))}</p>
      <div class="row center">
        <button class="btn ghost small home">${icon('home')}${esc(L.settings.home)}</button>
        <button class="btn ghost small reset">${esc(L.settings.reset)}</button>
      </div>
      <div class="row center"><button class="btn close">${esc(L.settings.done)}</button></div>
      <p class="credit">${esc(L.settings.credit(PERSONAL.myName))}</p>`,
      { cls: 'settings-modal', dismissible: true },
    );
    m.el.querySelectorAll<HTMLInputElement>('input[data-k]').forEach((inp) =>
      inp.addEventListener('change', () => this.setSetting(inp.dataset.k as 'sfx' | 'music' | 'vibrate', inp.checked)),
    );
    m.el.querySelectorAll<HTMLElement>('.track').forEach((b) =>
      b.addEventListener('click', () => {
        this.setTrack(b.dataset.id as MusicChoice);
        m.el.querySelectorAll('.track').forEach((x) => x.classList.toggle('on', x === b));
        const musicToggle = m.el.querySelector<HTMLInputElement>('input[data-k="music"]');
        if (musicToggle) musicToggle.checked = true;
      }),
    );
    let armed = false;
    $('.reset', m.el).addEventListener('click', (e) => {
      const b = e.currentTarget as HTMLElement;
      if (!armed) {
        armed = true;
        b.textContent = L.settings.resetConfirm;
        return;
      }
      this.save.reset();
      toast(L.toast.reset);
      void m.close();
      this.goTitle();
    });
    $('.home', m.el).addEventListener('click', async () => {
      await m.close();
      this.goTitle();
    });
    $('.close', m.el).addEventListener('click', () => void m.close());
  }
}

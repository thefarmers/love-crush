import { bestMove } from '../ai/solver';
import { PERSONAL } from '../config/personal';
import { Game, type GoalState } from '../core/game';
import { starsFor } from '../core/stars';
import type { LevelDef } from '../core/types';
import { getLevel, TOTAL_LEVELS } from '../levels/index';
import { L, levelTitle } from '../i18n';
import { twistOf } from '../levels/mechanics';
import { BoardView } from '../render/board-view';
import { iconURL } from '../render/sprites';
import { applyTheme, themeFor } from '../render/themes';
import type { App } from './app';
import { coupleSVG } from './couple';
import { $, esc, flyTo, openModal, sleep } from './dom';
import { goalIcon, goalText } from './goals';
import { heartsRow, icon } from './icons';

const CASCADE_WORDS = ['', '', 'Sweet', 'Lovely', 'Divine', 'Gorgeous', 'Perfect Love'];
const COMBO_WORDS: Record<string, string> = {
  'fire:cross': 'Starlight Cross',
  'fire:bigCross': 'Triple Light',
  'fire:bigBomb': 'Heart Burst',
  'fire:colorClear': 'Pearl Sweep',
  'fire:colorConvert': 'Pearl Storm',
  'fire:clearAll': 'Pure Love',
  rainbow: 'Rainbow Pearl',
};

export class GameScreen {
  readonly el: HTMLElement;
  private view: BoardView;
  private game!: Game;
  private level!: LevelDef;
  private n = 1;
  private busy = false;
  private continued = false;
  private paused = false;
  private ended = false;
  private shown: number[] = [];
  private shownScore = 0;
  private hintTimer = 0;
  private raf = 0;
  private lastFrame = 0;
  private lastTickSecond = -1;
  private announceUntil = 0;
  private announceRank = 0;

  constructor(private app: App) {
    this.el = document.createElement('section');
    this.el.className = 'screen screen-game';
    this.el.innerHTML = `
      <div class="hud">
        <div class="hud-box hud-moves"><div class="label">${esc(L.game.moves)}</div><div class="value moves">0</div></div>
        <div class="hud-box hud-goals"></div>
        <div class="hud-box hud-score">
          <div class="label">${esc(L.game.score)}</div><div class="value score">0</div>
          <div class="bar"><div class="fill"></div><i class="mark m1">${icon('star')}</i><i class="mark m2">${icon('star')}</i><i class="mark m3">${icon('star')}</i></div>
        </div>
      </div>
      <div class="board-wrap">
        <canvas class="board" aria-label="${esc(L.common.board)}"></canvas>
        <div class="announce" aria-live="polite"></div>
        <div class="banner"></div>
      </div>
      <div class="game-foot">
        <button class="icon-btn pause" aria-label="${esc(L.game.pause)}">${icon('pause')}</button>
        <div class="level-label"></div>
        <button class="icon-btn hint" aria-label="${esc(L.game.hint)}">${icon('bulb')}</button>
      </div>`;
    this.view = new BoardView(
      $('canvas', this.el) as HTMLCanvasElement,
      {
        onSwap: (a, b) => void this.onSwap(a, b),
        onCombo: (c) => {
          this.announce(CASCADE_WORDS[Math.min(c, CASCADE_WORDS.length - 1)], c);
          this.app.sfx.combo(c);
          if (c >= 4) this.app.vibrate([15, 30, 15]);
        },
        onSpecial: (kind) => {
          const w = COMBO_WORDS[kind];
          if (w) this.announce(w, kind.startsWith('fire:') ? 8 : 5);
          if (kind === 'fire:clearAll' || kind === 'fire:bigBomb') this.app.vibrate([40, 30, 60]);
        },
        onPop: (x, y, color) => this.progressGoal((g) => g.type === 'collect' && g.color === color, x, y, iconURL(`gem${color}`)),
        onGift: (x, y) => this.progressGoal((g) => g.type === 'gift', x, y, iconURL('gift')),
        onItem: (x, y) => this.progressGoal((g) => g.type === 'drop', x, y, iconURL(this.level.items?.type === 'letter' ? 'letter' : 'ring')),
        onJelly: (x, y) => this.progressGoal((g) => g.type === 'jelly', x, y, null),
        onChoco: (x, y) => this.progressGoal((g) => g.type === 'choco', x, y, iconURL('choco')),
        onShuffle: () => void this.banner('Shuffle', 1000, L.game.shuffle),
        onTouch: () => this.armHint(),
      },
      app.sfx,
    );
    $('.pause', this.el).addEventListener('click', () => this.pauseMenu());
    $('.hint', this.el).addEventListener('click', () => this.showHint());
    window.addEventListener('resize', () => {
      if (this.game) this.view.resize();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game && !this.ended && this.level.time) this.pauseMenu();
    });
  }

  // ───────────────────────────── lifecycle ─────────────────────────────

  async start(n: number, booster: boolean): Promise<void> {
    this.n = n;
    this.level = getLevel(n);
    this.game = new Game(this.level, { seed: (Math.random() * 2 ** 31) | 0 });
    this.busy = true;
    this.continued = false;
    this.paused = false;
    this.ended = false;
    this.shownScore = 0;
    this.lastTickSecond = -1;
    applyTheme(themeFor(n));
    this.buildHud();
    this.view.inputEnabled = false;
    await sleep(30);
    this.view.setGame(this.game);
    await this.view.intro();
    if (booster) {
      const ph = this.game.placeSpecial('rainbow');
      if (ph) {
        await this.banner('Rainbow Pearl', 1000, L.game.pearlReady);
        await this.view.play([ph]);
      }
    }
    const title = levelTitle(this.level);
    if (title) await this.banner(`Level ${this.n}`, 1100, title);
    const twist = twistOf(this.level);
    if (twist) await this.banner('Twist', 1100, L.twist[twist]);
    if (this.level.time) await this.banner('Ready', 900, L.game.ready(this.level.time));
    this.busy = false;
    this.view.inputEnabled = true;
    this.armHint();
    cancelAnimationFrame(this.raf);
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.hintTimer);
    this.view.inputEnabled = false;
    this.ended = true;
  }

  private frame = (t: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(100, t - this.lastFrame);
    this.lastFrame = t;
    const target = this.game.score;
    if (this.shownScore !== target) {
      this.shownScore += Math.max(1, (target - this.shownScore) * 0.12);
      if (this.shownScore > target) this.shownScore = target;
      this.renderScore();
    }
    if (this.level.time && !this.paused && !this.ended && this.game.status === 'playing' && !this.modalOpen()) {
      this.game.timeLeft = Math.max(0, this.game.timeLeft - dt / 1000);
      this.renderMoves();
      const sec = Math.ceil(this.game.timeLeft);
      if (sec <= 10 && sec !== this.lastTickSecond && sec > 0) {
        this.lastTickSecond = sec;
        this.app.sfx.tick();
      }
      if (this.game.timeLeft <= 0 && !this.busy) {
        this.game.timeUp();
        void this.afterTurn();
      }
    }
  };

  private modalOpen(): boolean {
    return document.querySelector('#modal-root .overlay') !== null;
  }

  // ───────────────────────────── HUD ─────────────────────────────

  private buildHud(): void {
    const states = this.game.goalStates();
    this.shown = states.map((s) => s.current);
    $('.hud-goals', this.el).innerHTML = states
      .map(
        (s, k) =>
          `<div class="goal" data-k="${k}" title="${esc(goalText(s.goal, this.level, s.target))}"><img src="${goalIcon(s.goal, this.level)}" alt=""/><span class="count"></span><span class="check">✓</span></div>`,
      )
      .join('');
    $('.hud-moves .label', this.el).textContent = this.level.time ? L.game.time : L.game.moves;
    $('.level-label', this.el).innerHTML = `<span class="serif">Level ${this.n}</span><span>${esc(L.tiers[this.level.tier])}</span>`;
    const st = this.level.stars;
    const max = st[2] * 1.08;
    const isScore = this.level.goals.some((g) => g.type === 'score');
    ($('.m1', this.el) as HTMLElement).style.left = `${(st[0] / max) * 100}%`;
    ($('.m1', this.el) as HTMLElement).style.display = isScore ? '' : 'none';
    ($('.m2', this.el) as HTMLElement).style.left = `${(st[1] / max) * 100}%`;
    ($('.m3', this.el) as HTMLElement).style.left = `${(st[2] / max) * 100}%`;
    this.renderGoals(states);
    this.renderMoves();
    this.renderScore();
  }

  private renderGoals(states: GoalState[] = this.game.goalStates()): void {
    states.forEach((s, k) => {
      const el = this.el.querySelector(`.goal[data-k="${k}"]`);
      if (!el) return;
      const cur = Math.min(this.shown[k] ?? s.current, s.target);
      const left = s.goal.type === 'score' ? Math.max(0, s.target - Math.floor(this.shownScore)) : Math.max(0, s.target - cur);
      $('.count', el).textContent = s.goal.type === 'score' ? (s.target / 1000).toFixed(s.target >= 10000 ? 0 : 1) + 'k' : String(left);
      el.classList.toggle('done', left === 0);
    });
  }

  private renderMoves(): void {
    const el = $('.moves', this.el);
    if (this.level.time) {
      const s = Math.max(0, Math.ceil(this.game.timeLeft));
      el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      el.classList.toggle('danger', s <= 10);
    } else {
      el.textContent = String(this.game.movesLeft);
      el.classList.toggle('danger', this.game.movesLeft <= 5);
    }
  }

  private renderScore(): void {
    $('.score', this.el).textContent = Math.floor(this.shownScore).toLocaleString();
    const st = this.level.stars;
    const pct = Math.min(100, (this.shownScore / (st[2] * 1.08)) * 100);
    ($('.fill', this.el) as HTMLElement).style.width = `${pct}%`;
    this.el.querySelectorAll('.mark').forEach((m, i) => m.classList.toggle('lit', this.shownScore >= st[i] && (i > 0 || st[0] > 1)));
    if (this.level.goals.some((g) => g.type === 'score')) this.renderGoals();
  }

  private progressGoal(pred: (g: GoalState['goal']) => boolean, x: number, y: number, icon: string | null): void {
    const states = this.game.goalStates();
    states.forEach((s, k) => {
      if (!pred(s.goal) || this.shown[k] >= s.target) return;
      this.shown[k]++;
      const el = this.el.querySelector(`.goal[data-k="${k}"]`);
      if (icon) flyTo(icon, x, y, el);
      else el?.classList.add('bump');
      setTimeout(() => this.renderGoals(states), icon ? 700 : 0);
    });
  }

  private syncHud(): void {
    const states = this.game.goalStates();
    this.shown = states.map((s) => s.current);
    this.renderGoals(states);
    this.renderMoves();
  }

  private announce(text: string, rank: number): void {
    if (!text) return;
    const now = performance.now();
    if (now < this.announceUntil && rank < this.announceRank) return;
    this.announceRank = rank;
    this.announceUntil = now + 900;
    const el = $('.announce', this.el);
    el.innerHTML = `<span>${esc(text)}</span>`;
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
  }

  /** Centered card: a serif headline with an optional Thai subtitle. */
  private async banner(text: string, ms = 1000, sub?: string): Promise<void> {
    if (!text) return;
    const el = $('.banner', this.el);
    el.innerHTML = `<span><b class="serif">${esc(text)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>`;
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
    await sleep(ms);
  }

  // ───────────────────────────── hints ─────────────────────────────

  private armHint(): void {
    clearTimeout(this.hintTimer);
    this.view.setHint(null);
    if (this.ended) return;
    this.hintTimer = window.setTimeout(() => this.showHint(), 7000);
  }

  private showHint(): void {
    if (this.busy || this.ended || this.game.status !== 'playing') return;
    const m = bestMove(this.game);
    this.view.setHint(m);
  }

  // ───────────────────────────── turns ─────────────────────────────

  private async onSwap(a: number, b: number): Promise<void> {
    if (this.busy || this.paused || this.ended || this.game.status !== 'playing') return;
    clearTimeout(this.hintTimer);
    this.view.setHint(null);
    if (!this.game.canSwap(a, b)) {
      this.busy = true;
      this.app.vibrate(12);
      await this.view.animateInvalid(a, b);
      this.busy = false;
      this.armHint();
      return;
    }
    this.busy = true;
    this.view.inputEnabled = false;
    const res = this.game.trySwap(a, b)!;
    this.app.vibrate(8);
    this.renderMoves();
    await this.view.play(res.phases);
    this.view.sync();
    this.syncHud();
    await this.afterTurn();
  }

  private async afterTurn(): Promise<void> {
    if (this.ended) return;
    if (this.game.status === 'won') return this.win();
    if (this.game.status === 'lost') return this.lose();
    if (this.level.time && this.game.timeLeft <= 0) {
      this.game.timeUp();
      return this.afterTurn();
    }
    this.busy = false;
    this.view.inputEnabled = true;
    this.armHint();
  }

  // ───────────────────────────── win / lose ─────────────────────────────

  private async win(): Promise<void> {
    this.ended = true;
    this.busy = true;
    this.view.inputEnabled = false;
    clearTimeout(this.hintTimer);
    this.app.vibrate([20, 40, 20]);
    await this.banner('Clear', 900, L.game.clear);
    const spare = this.level.time ? this.game.timeLeft > 4 : this.game.movesLeft > 0;
    if (spare) {
      await this.banner('Love Rush', 900, L.game.rushSkip);
      const rush = this.game.loveRush();
      if (rush) {
        const wrap = $('.board-wrap', this.el);
        const skip = () => this.view.skip();
        wrap.addEventListener('pointerdown', skip);
        this.view.speed = 2;
        await this.view.play(rush.phases);
        this.view.speed = 1;
        wrap.removeEventListener('pointerdown', skip);
        this.view.sync();
        this.syncHud();
      }
    }
    this.view.celebrate();
    this.app.sfx.win();
    const score = this.game.score;
    const stars = starsFor(score, this.level.stars);
    this.app.save.completeLevel(this.n, stars, score);
    await sleep(1100);
    this.shownScore = score;
    this.renderScore();
    this.winModal(stars, score);
  }

  private winModal(stars: number, score: number): void {
    const msg = PERSONAL.winMessages[Math.floor(Math.random() * PERSONAL.winMessages.length)];
    const last = this.n >= TOTAL_LEVELS;
    const m = openModal(
      `
      <div class="result win">
        <p class="kicker">Level ${this.n}</p>
        <h2 class="display">Beautiful</h2>
        <div class="big-stars">${[0, 1, 2].map((i) => icon('star', `s${i}`)).join('')}</div>
        <div class="result-couple">${coupleSVG('love', { size: 150 })}</div>
        <div class="result-score">${esc(L.results.score)}<b>${score.toLocaleString()}</b></div>
        <p class="result-msg">${esc(msg)}</p>
        <div class="row center">
          ${last ? '' : `<button class="btn next">${esc(L.results.next)}${icon('play')}</button>`}
        </div>
        <div class="row center">
          <button class="btn ghost small again">${icon('restart')}${esc(L.results.again)}</button>
          <button class="btn ghost small map">${icon('map')}${esc(L.results.map)}</button>
        </div>
      </div>`,
      { cls: 'result-modal' },
    );
    [0, 1, 2].forEach((i) =>
      setTimeout(() => {
        if (i >= stars) return;
        m.el.querySelector(`.big-stars .s${i}`)?.classList.add('lit');
        this.app.sfx.star(i);
      }, 350 + i * 380),
    );
    m.el.querySelector('.next')?.addEventListener('click', async () => {
      await m.close();
      this.app.openLevel(this.n + 1);
    });
    $('.again', m.el).addEventListener('click', async () => {
      await m.close();
      this.app.startLevel(this.n, false);
    });
    $('.map', m.el).addEventListener('click', async () => {
      await m.close();
      this.app.goMap(this.n + 1);
    });
  }

  private remainingText(): string {
    return this.game
      .goalStates()
      .filter((s) => !s.done)
      .map((s) => {
        const left = s.target - s.current;
        switch (s.goal.type) {
          case 'score':
            return L.remaining.score(left.toLocaleString());
          case 'collect':
            return L.remaining.collect(left);
          case 'jelly':
            return L.remaining.jelly(left);
          case 'drop':
            return L.remaining.drop(left);
          case 'gift':
            return L.remaining.gift(left);
          case 'choco':
            return L.remaining.choco(left);
        }
      })
      .join(' · ');
  }

  private async lose(): Promise<void> {
    this.busy = true;
    this.view.inputEnabled = false;
    clearTimeout(this.hintTimer);
    const progress = this.game.progress();
    if (!this.continued && progress >= 0.55) {
      this.app.sfx.invalid();
      const choice = await this.nearMiss(progress);
      if (choice === 'love') {
        const r = await this.app.love('moves');
        if (r.ok) {
          this.continued = true;
          this.game.addMoves(5);
          this.renderMoves();
          if (r.secret) {
            const ph = this.game.placeSpecial('rainbow');
            if (ph) await this.view.play([ph]);
          }
          await this.banner(this.level.time ? '+15 sec' : '+5 moves', 900, L.game.keepGoing);
          this.busy = false;
          this.view.inputEnabled = true;
          this.armHint();
          return;
        }
      }
    }
    this.ended = true;
    this.app.sfx.lose();
    const hearts = this.app.save.loseHeart();
    this.loseModal(hearts);
  }

  private nearMiss(progress: number): Promise<'love' | 'quit'> {
    const bonus = this.level.time ? L.results.bonusTime : L.results.bonusMoves;
    const m = openModal(
      `
      <div class="result near">
        <p class="kicker">Level ${this.n}</p>
        <h2 class="display">So close</h2>
        <div class="result-couple">${coupleSVG('sad', { size: 136 })}</div>
        <div class="near-pct">${Math.round(progress * 100)}%</div>
        <div class="near-bar"><div style="width:${Math.round(progress * 100)}%"></div></div>
        <p class="near-left">${esc(this.remainingText())}</p>
        <p class="muted center">${esc(L.results.nearAsk(PERSONAL.myName, bonus))}</p>
        <div class="row center"><button class="btn love-go">${icon('mic')}${esc(L.results.nearButton(bonus))}</button></div>
        <div class="row center"><button class="btn quiet small quit">${esc(L.results.giveUp)}</button></div>
      </div>`,
      { cls: 'result-modal' },
    );
    return new Promise((res) => {
      $('.love-go', m.el).addEventListener('click', async () => {
        await m.close();
        res('love');
      });
      $('.quit', m.el).addEventListener('click', async () => {
        await m.close();
        res('quit');
      });
    });
  }

  private loseModal(hearts: number): void {
    const msg = PERSONAL.loseMessages[Math.floor(Math.random() * PERSONAL.loseMessages.length)];
    const m = openModal(
      `
      <div class="result lose">
        <p class="kicker">Level ${this.n}</p>
        <h2 class="display">Next time</h2>
        <p class="result-msg">${esc(msg)}</p>
        <div class="result-couple">${coupleSVG('sad', { size: 136 })}</div>
        <p class="muted center">${esc(this.remainingText())}</p>
        <div class="hearts-left">${heartsRow(hearts)}</div>
        <div class="row center"><button class="btn again">${hearts > 0 ? `${icon('restart')}${esc(L.results.retry)}` : `${icon('mic')}${esc(L.results.refill)}`}</button></div>
        <div class="row center"><button class="btn quiet small map">${icon('map')}${esc(L.results.backToMap)}</button></div>
      </div>`,
      { cls: 'result-modal' },
    );
    $('.again', m.el).addEventListener('click', async () => {
      await m.close();
      this.app.startLevel(this.n, false);
    });
    $('.map', m.el).addEventListener('click', async () => {
      await m.close();
      this.app.goMap(this.n);
    });
  }

  private pauseMenu(): void {
    if (this.ended || this.modalOpen()) return;
    this.paused = true;
    const s = this.app.save.data.settings;
    const costs = this.game.movesMade > 0;
    const m = openModal(
      `
      <p class="kicker">Paused</p>
      <h2>${esc(L.pause.title)}</h2>
      <p class="muted center">${esc(L.common.level(this.n))} · ${esc(goalText(this.level.goals[0], this.level, this.game.goalStates()[0].target))}</p>
      <div class="toggles">
        <label class="toggle"><input type="checkbox" data-k="sfx" ${s.sfx ? 'checked' : ''}/><span>${esc(L.settings.sfx)}</span></label>
        <label class="toggle"><input type="checkbox" data-k="music" ${s.music ? 'checked' : ''}/><span>${esc(L.settings.music)}</span></label>
        <label class="toggle"><input type="checkbox" data-k="vibrate" ${s.vibrate ? 'checked' : ''}/><span>${esc(L.settings.vibrate)}</span></label>
      </div>
      <div class="row center"><button class="btn resume">${icon('play')}${esc(L.pause.resume)}</button></div>
      <div class="row center">
        <button class="btn ghost small restart">${icon('restart')}${esc(L.pause.restart)}</button>
        <button class="btn ghost small quit">${icon('map')}${esc(L.pause.quit)}</button>
      </div>
      ${costs ? `<p class="muted center">${esc(L.pause.costs)}</p>` : ''}`,
      { cls: 'pause-modal' },
    );
    m.el.querySelectorAll<HTMLInputElement>('input[data-k]').forEach((inp) =>
      inp.addEventListener('change', () => this.app.setSetting(inp.dataset.k as 'sfx' | 'music' | 'vibrate', inp.checked)),
    );
    $('.resume', m.el).addEventListener('click', async () => {
      await m.close();
      this.paused = false;
      this.lastFrame = performance.now();
    });
    const leave = async (then: () => void) => {
      await m.close();
      this.stop();
      if (costs) this.app.save.loseHeart();
      then();
    };
    $('.restart', m.el).addEventListener('click', () => void leave(() => this.app.startLevel(this.n, false)));
    $('.quit', m.el).addEventListener('click', () => void leave(() => this.app.goMap(this.n)));
  }
}

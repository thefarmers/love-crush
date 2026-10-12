import type { Sfx } from '../audio/sfx';
import { PERSONAL, type SecretPhrase } from '../config/personal';
import type { SaveStore } from '../state/save';
import type { LoveListener } from '../voice/listener';
import { L } from '../i18n';
import { judgeAttempt, judgeTyped, type VoiceVerdict } from '../voice/love';
import { coupleSVG } from './couple';
import { $, esc, heartsBurst, openModal, sleep } from './dom';
import { icon } from './icons';

export type LoveMode = 'refill' | 'moves';

export interface LoveResult {
  ok: boolean;
  secret: SecretPhrase | null;
}

const SUCCESS_LINES = L.love.successLines(PERSONAL.myName, PERSONAL.partnerName);

const C = 2 * Math.PI * 54;

/**
 * "Hearts are empty → hold the mic and say I love you". Resolves when she succeeds (or gives up).
 */
export function openLoveModal(deps: { sfx: Sfx; listener: LoveListener; vibrate: (p: number | number[]) => void }, mode: LoveMode): Promise<LoveResult> {
  const { sfx, listener } = deps;
  const title = mode === 'refill' ? L.love.titleRefill : L.love.titleMoves;
  const ask = mode === 'refill' ? L.love.askRefill(PERSONAL.myName) : L.love.askMoves(PERSONAL.myName);
  const secure = window.isSecureContext;
  const canSpeak = secure && (listener.micSupported || listener.recognitionSupported);
  const m = openModal(
    `
    <div class="love">
      <p class="kicker">${esc(L.love.kicker)}</p>
      <h2 class="love-title">${esc(title)}</h2>
      <div class="bubble">${esc(ask)}</div>
      <div class="love-couple">${coupleSVG('sad', { size: 190 })}</div>
      <div class="mic-wrap ${canSpeak ? '' : 'hidden'}">
        <svg class="meter" viewBox="0 0 120 120" aria-hidden="true">
          <circle class="track" cx="60" cy="60" r="54"/>
          <circle class="level" cx="60" cy="60" r="54" stroke-dasharray="${C}" stroke-dashoffset="${C}"/>
        </svg>
        <button class="mic" aria-label="${esc(L.love.holdMic)}">${icon('mic')}</button>
      </div>
      <div class="love-status" aria-live="polite">${
        esc(canSpeak ? L.love.hint : secure ? L.love.noMic : L.love.needHttps)
      }</div>
      <div class="heard"></div>
      <form class="type-form ${canSpeak ? 'hidden' : ''}">
        <input type="text" maxlength="80" placeholder="${esc(L.love.typePlaceholder)}" aria-label="${esc(L.love.typeLabel)}"/>
        <button class="btn small" type="submit">${esc(L.love.send)}</button>
      </form>
      <div class="love-actions">
        <button class="link type-btn ${canSpeak ? '' : 'hidden'}" type="button">${icon('keyboard')}${esc(L.love.typeInstead)}</button>
        <button class="link later" type="button">${esc(mode === 'refill' ? L.love.later : L.love.giveUp)}</button>
      </div>
    </div>`,
    { cls: 'love-modal' },
  );
  const el = m.el;
  const status = $('.love-status', el);
  const heard = $('.heard', el);
  const level = el.querySelector('.meter .level') as SVGCircleElement | null;
  const micWrap = $('.mic-wrap', el);
  const mic = $('.mic', el);
  const form = $('.type-form', el) as HTMLFormElement;
  const input = $('input', form) as HTMLInputElement;

  return new Promise<LoveResult>((resolve) => {
    let done = false;
    let listening = false;
    let pressedAt = 0;
    let toggleMode = false;
    let autoStop = 0;

    listener.onLevel = (v) => {
      level?.setAttribute('stroke-dashoffset', String(C * (1 - v)));
      micWrap.style.setProperty('--lv', v.toFixed(3));
    };
    listener.onText = (t) => (heard.textContent = t ? L.love.heard(t) : '');

    const finish = async (verdict: VoiceVerdict) => {
      if (verdict.ok) {
        done = true;
        sfx.heartRefill();
        deps.vibrate([30, 60, 30, 60, 80]);
        $('.love-couple', el).innerHTML = coupleSVG('love', { size: 190 });
        $('.bubble', el).textContent = SUCCESS_LINES[Math.floor(Math.random() * SUCCESS_LINES.length)];
        status.textContent = verdict.mode === 'loudness' ? L.love.sweet : L.love.success;
        el.classList.add('success');
        const r = mic.getBoundingClientRect();
        heartsBurst(r.left + r.width / 2, r.top + r.height / 2, 26);
        await sleep(1700);
        await m.close();
        resolve({ ok: true, secret: verdict.secret });
      } else {
        status.textContent = L.love.feedback[verdict.reason];
        el.classList.remove('shake');
        void el.offsetWidth;
        el.classList.add('shake');
        sfx.invalid();
      }
    };

    const begin = async () => {
      if (listening || done) return;
      listening = true;
      sfx.duck(true);
      micWrap.classList.add('on');
      heard.textContent = '';
      status.textContent = L.love.listening;
      try {
        await listener.start();
      } catch {
        /* handled by judge */
      }
      autoStop = window.setTimeout(() => void end(), 8000);
    };

    const end = async () => {
      if (!listening) return;
      listening = false;
      toggleMode = false;
      clearTimeout(autoStop);
      micWrap.classList.remove('on');
      status.textContent = L.love.processing;
      const attempt = await listener.stop();
      sfx.duck(false);
      if (attempt.transcript) heard.textContent = L.love.heard(listener.lastHeard() || attempt.transcript.split(' ')[0]);
      await finish(judgeAttempt(attempt, PERSONAL.loveKeywords, PERSONAL.secretPhrases));
    };

    mic.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (toggleMode) {
        void end();
        return;
      }
      pressedAt = performance.now();
      void begin();
    });
    const release = () => {
      if (!listening || toggleMode) return;
      if (performance.now() - pressedAt < 350) {
        // A quick tap: keep listening until tapped again (friendlier with permission prompts).
        toggleMode = true;
        status.textContent = L.love.tapMode;
        return;
      }
      void end();
    };
    mic.addEventListener('pointerup', release);
    mic.addEventListener('pointerleave', release);
    mic.addEventListener('pointercancel', release);
    mic.addEventListener('contextmenu', (e) => e.preventDefault());

    $('.type-btn', el).addEventListener('click', () => {
      form.classList.remove('hidden');
      input.focus();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void finish(judgeTyped(input.value, PERSONAL.loveKeywords, PERSONAL.secretPhrases));
    });
    $('.later', el).addEventListener('click', async () => {
      if (listening) await listener.stop();
      sfx.duck(false);
      await m.close();
      if (!done) resolve({ ok: false, secret: null });
    });
  });
}

/** Flip-to-reveal love card. */
export async function showLoveCard(index: number, save: SaveStore, secret: SecretPhrase | null, sfx: Sfx): Promise<void> {
  const card = PERSONAL.loveCards[index];
  const total = PERSONAL.loveCards.length;
  const m = openModal(
    `
    <div class="card-stage">
      <div class="love-card" tabindex="0" role="button" aria-label="${esc(L.card.open)}">
        <div class="face back"><div class="seal">${icon('heart')}</div><div class="card-hint">${esc(L.card.open)}</div></div>
        <div class="face front">
          <div class="card-label">${esc(card.label ?? L.card.defaultLabel)}</div>
          ${card.photo ? `<img class="card-photo" src="${esc(card.photo)}" alt="" />` : ''}
          <p class="card-text">${esc(card.text).replace(/\n/g, '<br/>')}</p>
          <div class="card-sign">— ${esc(PERSONAL.myName)}</div>
        </div>
      </div>
    </div>
    ${secret ? `<div class="secret-ribbon">${icon('pearl')}${esc(secret.message)}</div>` : ''}
    <p class="muted center">${esc(L.card.saved(save.data.cards.length, total))}</p>
    <div class="row center"><button class="btn go">${esc(L.card.next)}</button></div>`,
    { cls: 'card-modal' },
  );
  const cardEl = $('.love-card', m.el);
  const flip = () => {
    if (cardEl.classList.contains('flipped')) return;
    cardEl.classList.add('flipped');
    sfx.star(2);
    const r = cardEl.getBoundingClientRect();
    heartsBurst(r.left + r.width / 2, r.top + r.height / 2, 16);
  };
  cardEl.addEventListener('click', flip);
  cardEl.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && flip());
  $('.go', m.el).addEventListener('click', () => {
    flip();
    void m.close();
  });
  await m.closed;
}

/** Love-letter book: every card unlocked so far. */
export function openGallery(save: SaveStore, sfx: Sfx): void {
  const got = new Set(save.data.cards);
  const items = PERSONAL.loveCards
    .map((c, i) =>
      got.has(i)
        ? `<button class="mini-card" data-i="${i}"><span class="mini-label">${esc(c.label ?? '')}</span><span class="mini-text">${esc(c.text.split('\n')[0])}</span></button>`
        : `<div class="mini-card locked">${icon('lock')}<span class="mini-text">${esc(L.gallery.locked)}</span></div>`,
    )
    .join('');
  const m = openModal(
    `<p class="kicker">${esc(L.gallery.kicker)}</p>
     <h2>${esc(L.gallery.title)}</h2>
     <p class="muted center">${esc(L.gallery.hint(got.size, PERSONAL.loveCards.length))}</p>
     <div class="gallery">${items}</div>
     <div class="row center"><button class="btn ghost close">${esc(L.common.close)}</button></div>`,
    { cls: 'gallery-modal', dismissible: true },
  );
  m.el.querySelectorAll<HTMLElement>('.mini-card[data-i]').forEach((b) =>
    b.addEventListener('click', async () => {
      await m.close();
      await showLoveCard(Number(b.dataset.i), save, null, sfx);
      openGallery(save, sfx);
    }),
  );
  $('.close', m.el).addEventListener('click', () => void m.close());
}

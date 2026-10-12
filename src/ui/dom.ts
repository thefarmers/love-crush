export function $(sel: string, root: ParentNode = document): HTMLElement {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el as HTMLElement;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function fromHTML(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface ModalHandle {
  el: HTMLElement;
  close(): Promise<void>;
  closed: Promise<void>;
}

/** Glassy pop-in dialog. Returns a handle; `closed` resolves after the exit animation. */
export function openModal(html: string, opts: { cls?: string; dismissible?: boolean; onClose?: () => void } = {}): ModalHandle {
  const root = $('#modal-root');
  const overlay = fromHTML(`<div class="overlay"><div class="modal panel ${opts.cls ?? ''}" role="dialog" aria-modal="true">${html}</div></div>`);
  root.appendChild(overlay);
  const el = overlay.firstElementChild as HTMLElement;
  let resolveClosed!: () => void;
  const closed = new Promise<void>((r) => (resolveClosed = r));
  let closing = false;
  const close = async () => {
    if (closing) return closed;
    closing = true;
    overlay.classList.add('out');
    await sleep(220);
    overlay.remove();
    opts.onClose?.();
    resolveClosed();
  };
  if (opts.dismissible) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) void close();
    });
  }
  requestAnimationFrame(() => overlay.classList.add('in'));
  return { el, close, closed };
}

/** Short centered toast. */
export function toast(text: string, ms = 1800): void {
  const el = fromHTML(`<div class="toast">${esc(text)}</div>`);
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => {
    el.classList.remove('in');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

let flying = 0;

/** Fly a small image from a page point to a target element (HUD goal), then pulse it. */
export function flyTo(src: string, x: number, y: number, target: Element | null, size = 30): void {
  if (!target || flying > 16) return;
  const r = target.getBoundingClientRect();
  const tx = r.left + r.width / 2;
  const ty = r.top + r.height / 2;
  const img = document.createElement('img');
  img.src = src;
  img.className = 'flyer';
  img.style.width = img.style.height = `${size}px`;
  img.style.left = `${x - size / 2}px`;
  img.style.top = `${y - size / 2}px`;
  document.body.appendChild(img);
  flying++;
  const dx = tx - x;
  const dy = ty - y;
  const anim = img.animate(
    [
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 60}px) scale(1.35)`, opacity: 1, offset: 0.4 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.6)`, opacity: 0.9 },
    ],
    { duration: 650 + Math.random() * 150, easing: 'cubic-bezier(.5,0,.6,1)' },
  );
  anim.onfinish = () => {
    img.remove();
    flying--;
    target.classList.remove('bump');
    void (target as HTMLElement).offsetWidth;
    target.classList.add('bump');
  };
}

/** Burst of small rose & gold hearts from a point (used outside the canvas). */
export function heartsBurst(x: number, y: number, n = 14): void {
  const colors = ['#c9607f', '#e9a7bb', '#c9a15a', '#f4cdd9'];
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'burst-heart';
    el.innerHTML = `<svg viewBox="-10 -10 20 20"><path d="M0,9 C-2,7 -10,3 -9.5,-3 C-9,-9.5 -1.2,-10 0,-4.5 C1.2,-10 9,-9.5 9.5,-3 C10,3 2,7 0,9Z" fill="${colors[i % colors.length]}"/></svg>`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    document.body.appendChild(el);
    const a = Math.random() * Math.PI * 2;
    const d = 70 + Math.random() * 130;
    el.animate(
      [
        { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d - 50}px)) scale(${0.7 + Math.random() * 0.8})`, opacity: 0 },
      ],
      { duration: 1000 + Math.random() * 700, easing: 'cubic-bezier(.2,.7,.3,1)' },
    ).onfinish = () => el.remove();
  }
}

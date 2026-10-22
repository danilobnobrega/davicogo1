import './style.css';
import Lenis from 'lenis';
import { createGL, loadTexture, clamp, damp, easeOut, easeInOut } from './gl/core.js';
import { Hero } from './gl/hero.js';
import { Slit } from './gl/slit.js';
import { Journey } from './gl/journey.js';
import { Board } from './gl/board.js';
import { Press } from './gl/press.js';
import { Card } from './gl/card.js';

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const CONTACT = {
  whatsapp: 'https://wa.me/5551999999999',
  phone: '(51) 99999-9999',
  email: 'davi.cogo@nattoscapital.com.br',
};

/* ───────────── scroll ───────────── */
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);
const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95, autoRaf: false });
window.__lenis = lenis;
lenis.stop();

$$('[data-nav]').forEach((a) =>
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    e.preventDefault();
    setMenu(false);
    lenis.scrollTo(id === '#topo' ? 0 : id, { duration: 2, easing: (t) => 1 - Math.pow(1 - t, 4) });
  }),
);

/* ───────────── menu ───────────── */
const menuBtn = $('[data-menu-btn]');
function setMenu(open) {
  root.classList.toggle('menu-open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  $('[data-menu]').setAttribute('aria-hidden', String(!open));
  $('[data-menu-label]').textContent = open ? 'Fechar' : 'Menu';
  open ? lenis.stop() : lenis.start();
}
menuBtn.addEventListener('click', () => setMenu(!root.classList.contains('menu-open')));
addEventListener('keydown', (e) => e.key === 'Escape' && setMenu(false));

/* ───────────── text ───────────── */
$$('[data-split]').forEach((el) => {
  let i = 0;
  el.innerHTML = el.textContent
    .trim()
    .split(/\s+/)
    .map((w) => `<span class="w"><span style="--i:${i++}">${w}</span></span>`)
    .join(' ');
});
const io = new IntersectionObserver(
  (entries) =>
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      io.unobserve(en.target);
    }),
  { rootMargin: '0px 0px -12% 0px' },
);

/* ───────────── pointer ───────────── */
const pointer = { x: -1, y: -1, seen: false };
addEventListener('pointermove', (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.seen = true;
});

/* ───────────── boot ───────────── */
async function boot() {
  const loader = $('[data-loader]');
  const loaderN = $('[data-loader-n]');
  let shown = 0;
  let progress = 0;
  const tickLoader = () => {
    shown = damp(shown, progress, 6, 1 / 60);
    loaderN.textContent = String(Math.min(99, Math.round(shown * 100))).padStart(2, '0');
    if (progress < 1 || shown < 0.985) requestAnimationFrame(tickLoader);
  };
  tickLoader();
  const track = (p, w) => p.then((v) => ((progress += w), v));

  let S = null;
  try {
    S = createGL($('#gl'));
    root.classList.add('gl');
  } catch {
    root.classList.add('no-gl');
  }

  await track(
    Promise.all([
      document.fonts.load('300 100px "Fraunces Variable"'),
      document.fonts.load('500 100px "Fraunces Variable"'),
      document.fonts.load('500 16px "Geist Variable"'),
      document.fonts.load('400 16px "Geist Variable"'),
    ]),
    0.3,
  );
  await document.fonts.ready;

  let hero, journey, board;
  if (S) {
    const [cut, photo] = await track(Promise.all([loadTexture('/davi-cut.png', false), loadTexture('/davi-src.png', false)]), 0.4);
    hero = S.add(new Hero(S, $('[data-view="hero"]'), cut));
    S.add(new Slit(S, $('[data-view="slit"]'), photo));
    journey = S.add(new Journey(S, $('[data-view="journey"]'), $$('[data-mile]'), $('[data-journey]'), '/fonts/fraunces-latin-400-normal.woff'));
    const services = $$('[data-service]').map((li) => ({ title: li.dataset.title, text: li.dataset.text }));
    board = S.add(new Board(S, $('[data-view="board"]'), services));
    S.add(new Press(S, $('[data-view="press"]'), $('[data-press-section]')));
    S.add(new Card(S, $('[data-view="card"]'), CONTACT));
    await track(journey.ready, 0.3);
    addEventListener('resize', () => S.resize());
  } else progress = 1;

  progress = 1;
  await new Promise((r) => setTimeout(r, reduced ? 0 : 500));
  loader.classList.add('is-done');
  const t0 = performance.now();
  window.__t0 = t0;
  setTimeout(() => {
    $('[data-hdr]').classList.remove('is-hidden');
    lenis.start();
  }, reduced ? 0 : 1300);
  $$('[data-split], [data-fade]').forEach((el) => io.observe(el));

  /* sections driven from the loop */
  const hdr = $('[data-hdr]');
  const help = $('[data-help]');
  const helpN = $('[data-help-n]');
  const how = $('[data-how]');
  const cards = $$('[data-card]');
  const press = $('[data-press-section]');
  let lastY = 0;
  let lastNow = performance.now();

  /* trajetória: if the scroll stops between two years, glide to the nearest one */
  const journeyEl = $('[data-journey]');
  let lastUserScroll = 0;
  let snapping = false;
  const userInput = () => {
    snapping = false;
    lastUserScroll = performance.now();
  };
  // lenis keeps easing by fractions of a pixel for a long time; only real movement counts
  lenis.on('scroll', () => {
    if (!snapping && Math.abs(lenis.velocity) > 0.35) lastUserScroll = performance.now();
  });
  addEventListener('wheel', userInput, { passive: true });
  addEventListener('touchstart', userInput, { passive: true });
  addEventListener('keydown', userInput);

  function loop(now) {
    const dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;
    lenis.raf(now);
    const vh = innerHeight;

    {
      const r = journeyEl.getBoundingClientRect();
      const span = r.height - vh;
      const p = -r.top / span;
      const steps = 3;
      if (!snapping && p > 0.002 && p < 0.998 && now - lastUserScroll > 200 && !root.classList.contains('menu-open')) {
        const t = p * steps;
        const k = Math.round(t);
        if (Math.abs(t - k) > 0.004) {
          snapping = true;
          lenis.scrollTo(lenis.scroll + r.top + (k / steps) * span, {
            duration: 1.1,
            easing: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
            onComplete: () => {
              snapping = false;
              lastUserScroll = performance.now();
            },
          });
        }
      }
    }

    /* help: which service is up */
    {
      const r = help.getBoundingClientRect();
      const p = clamp(-r.top / (r.height - vh));
      const k = Math.min(3, Math.floor(p * 4 * 0.999));
      board?.set(k);
      helpN.textContent = `0${k + 1}`;
    }

    /* how: one card arrives at a time; the ones underneath sink back and darken.
       each card has its own perspective, and stacking follows z-index only, so
       a tilted card underneath can never cut through the one on top */
    {
      const r = how.getBoundingClientRect();
      const p = clamp(-r.top / (r.height - vh));
      const t = p * (cards.length - 1) * 1.08;
      cards.forEach((c, i) => {
        const arrive = i === 0 ? 1 : easeInOut(clamp(t - (i - 1)));
        const buried = clamp(t - i, 0, 2);
        const y = (1 - arrive) * vh * 1.1 - buried * 26;
        const rx = buried * 5 - (1 - arrive) * 14;
        const s = 1 - buried * 0.05;
        c.style.transform = `perspective(1400px) translate3d(0, ${y.toFixed(1)}px, 0) rotateX(${rx.toFixed(2)}deg) scale(${s.toFixed(4)})`;
        c.style.filter = `brightness(${(1 - buried * 0.3).toFixed(3)})`;
        c.style.visibility = arrive < 0.001 || buried >= 2 ? 'hidden' : 'visible';
        c.style.zIndex = i;
      });
    }

    /* header: hide while reading down, ink over the paper */
    {
      const y = lenis.scroll;
      if (Math.abs(y - lastY) > 6) {
        if (now - t0 > 1400) hdr.classList.toggle('is-hidden', y > lastY && y > vh * 0.6 && !root.classList.contains('menu-open'));
        lastY = y;
      }
      const pr = press.getBoundingClientRect();
      hdr.classList.toggle('is-paper', pr.top < 50 && pr.bottom > 50);
    }

    if (S) {
      S.dt = dt;
      S.time = now / 1000;
      const M = S.mouse;
      M.seen = pointer.seen;
      if (M.sx < 0) {
        M.sx = pointer.x;
        M.sy = pointer.y;
      }
      M.sx = damp(M.sx, pointer.x, 10, dt);
      M.sy = damp(M.sy, pointer.y, 10, dt);
      S.scrollV = damp(S.scrollV || 0, lenis.velocity * 60, 6, dt);
      hero.intro = reduced ? 1 : clamp((now - t0) / 1000 / 2.6);
      S.render();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

boot();

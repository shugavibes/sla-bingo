import { api, el, $, countdown, markNav, fitCells } from './common.js';
import { consoleEl, feedItem } from './card-view.js';

markNav();

const PAGE = 12;
let offset = 0;
let total = 0;

// Cartón de ejemplo (no es real): muestra cómo queda uno con una línea hecha.
const EXAMPLE = {
  nickname: 'Ejemplo', handle: 'slatv',
  hits: 3, total: 8, lineCount: 1, line: true, bingo: false,
  lineCells: [0, 1, 2],
  grid: [
    { text: 'Un invitado de SLA levanta una ronda', hit: true },
    { text: 'Hay un super hackeo a un banco', hit: true },
    { text: 'Una pelea en Twitter entre 2 founders', hit: true },
    { text: 'Se anuncia un nuevo programa en SLA TV', hit: false },
    { free: true, text: 'SLA', hit: true },
    { text: 'Sale una nueva copia de SLA', hit: false, custom: true },
    { text: 'Anthropic y OpenAI lanzan modelos nuevos', hit: false },
    { text: 'Anthropic y OpenAI piden regulaciones', hit: false },
    { text: 'Un MEGA CEO es entrevistado en SLA', hit: false },
  ],
};

async function loadFeed() {
  const btn = $('#feed-more');
  btn.disabled = true;
  const data = await api(`/api/feed?limit=${PAGE}&offset=${offset}`);
  total = data.total;
  const feed = $('#feed');
  for (const c of data.cards) feed.append(feedItem(c));
  offset += data.cards.length;
  $('#feed-count').textContent = total === 1 ? '1 cartón' : `${total} cartones`;
  $('#feed-empty').hidden = total > 0;
  btn.hidden = offset >= total;
  btn.disabled = false;
  btn.textContent = `Cargar más (${total - offset})`;
  requestAnimationFrame(() => fitCells(feed));
}

async function main() {
  // Ejemplo primero, para que se vea aunque la API tarde.
  $('#example').append(consoleEl(EXAMPLE, { who: '@slatv', footerRight: 'Ejemplo' }));

  const state = await api('/api/state');

  const pad = n => String(n).padStart(2, '0');
  const cd = $('#st-countdown');
  const stopCd = countdown(state.deadline, ({ d, h, m, over }) => {
    if (over && !state.forceOpen) {
      cd.textContent = 'Cerrado';
      $('#st-countdown-lbl').textContent = 'Cartones';
      $('#label-right').textContent = 'Cartones cerrados';
      for (const a of [$('#hero-cta'), $('#nav-cta')]) { if (a) { a.textContent = 'Ver ranking'; a.href = '/ranking'; } }
      const ps = $('#press-start'); if (ps) { ps.textContent = 'Game over para crear · ver ranking'; ps.href = '/ranking'; }
      stopCd();
      return;
    }
    cd.textContent = `${pad(d)}D ${pad(h)}H ${pad(m)}M`;
  });

  const score = n => String(n).padStart(3, '0');
  $('#st-cards').textContent = score(state.counts.cards);
  $('#st-happened').textContent = score(state.counts.happened);
  $('#st-bingos').textContent = score(state.counts.bingos);

  await loadFeed();
  $('#feed-more').addEventListener('click', () => loadFeed().catch(console.error));
}

main().catch(err => {
  console.error(err);
  $('#feed-empty').hidden = false;
  $('#feed-empty').textContent = 'No se pudo cargar. ¿Está corriendo el servidor?';
});

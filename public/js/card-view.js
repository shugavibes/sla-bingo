// Componente compartido: el cartón adentro de la "consola" (lo usan home, feed, cartón y preview).

import { el, fitCells, fmtDate } from './common.js';
import { FREE_INDEX } from './bingo.js';

/**
 * @param {object} card - { grid: [{text, hit, custom, free}], lineCells?, handle?, nickname? }
 * @param {object} opts - { href, who, title, footerLeft, footerRight }
 */
export function consoleEl(card, opts = {}) {
  const {
    href = null,
    who = card.handle ? `@${card.handle}` : (card.nickname || ''),
    title = 'SLA Bingo Tech',
    footerLeft = 'Dot matrix · 3×3',
    footerRight = 'Nov 2026',
  } = opts;

  const lineCells = new Set(card.lineCells || []);
  const grid = el('div', { class: 'bingo' });
  let n = 0;
  card.grid.forEach((cell, i) => {
    if (i === FREE_INDEX || cell?.free) {
      grid.append(el('div', { class: 'cell free' }, el('img', { class: 'pixel', src: '/img/sla-logo-px64.png', alt: 'SLA' })));
      return;
    }
    n++;
    const cls = ['cell'];
    if (cell.hit) cls.push('hit');
    if (cell.custom) cls.push('custom');
    if (lineCells.has(i)) cls.push('in-line');
    grid.append(el('div', { class: cls.join(' '), title: cell.text },
      el('span', { class: 'idx', text: String(n).padStart(2, '0') }),
      cell.hit ? el('span', { class: 'chk' }) : null,
      el('span', { class: 'txt' }, cell.text),
    ));
  });

  const root = el(href ? 'a' : 'div', { class: 'console pxb', href },
    el('div', { class: 'bezel-top' },
      el('span', {}, el('i', { class: 'led' }), title),
      el('span', { class: 'who', text: who }),
    ),
    el('div', { class: 'screen pxb' }, grid),
    el('div', { class: 'bezel-bottom' }, el('span', { text: footerLeft }), el('span', { text: footerRight })),
  );
  requestAnimationFrame(() => fitCells(root));
  return root;
}

/** Ítem del feed: consola + pie con nombre, puntaje y estado. */
export function feedItem(card) {
  const status = card.bingo ? el('span', { class: 'tag acid', text: 'Bingo' })
    : card.line ? el('span', { class: 'tag line', text: 'Línea' })
    : null;
  return el('article', { class: 'feed-item' },
    consoleEl(card, { href: `/c/${card.id}`, footerRight: `${card.hits}/${card.total}` }),
    el('div', { class: 'cap' },
      el('div', {},
        el('div', { class: 'name', text: card.nickname }),
        el('div', { class: 'handle', text: card.handle ? `@${card.handle}` : '' }),
      ),
      el('div', { class: 'right' },
        status,
        el('span', { class: 'date', text: fmtDate(card.createdAt) }),
      ),
    ),
  );
}

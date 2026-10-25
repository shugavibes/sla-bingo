import { api, el, $, markNav, fmtDate, pluralCartones } from './common.js';

markNav();

let all = [];

function render() {
  const q = $('#search').value.trim().toLowerCase();
  const rows = $('#rows');
  rows.innerHTML = '';
  const items = q ? all.filter(c => c.nickname.toLowerCase().includes(q) || (c.handle || '').toLowerCase().includes(q)) : all;
  if (!items.length) {
    rows.append(el('tr', {}, el('td', { colspan: 5, class: 'px muted', text: q ? 'Sin resultados.' : 'Todavía no hay cartones.' })));
    return;
  }
  for (const c of items) {
    rows.append(el('tr', { class: c.position <= 3 && c.hits > 0 ? 'top3' : '' },
      el('td', { class: 'pos' }, c.position <= 3 && c.hits > 0 ? el('i', { class: 'ico trophy', style: { marginRight: '6px' } }) : null, `${c.position}`.padStart(2, '0')),
      el('td', {},
        el('a', { href: `/c/${c.id}`, text: c.nickname }),
        c.handle ? el('span', { class: 'handle', text: `@${c.handle}` }) : null,
        c.bingo ? el('span', { class: 'tag acid', text: 'Bingo' }) : c.line ? el('span', { class: 'tag line', text: 'Línea' }) : null,
      ),
      el('td', { class: 'num', text: `${c.hits}/${c.total}` }),
      el('td', { class: 'num', text: c.lineCount }),
      el('td', { class: 'hide-sm px muted', text: fmtDate(c.createdAt) }),
    ));
  }
}

async function main() {
  const { cards, total } = await api('/api/ranking?limit=500');
  all = cards;
  const bingos = cards.filter(c => c.bingo).length;
  const lines = cards.filter(c => c.line).length;
  $('#summary').textContent = `${pluralCartones(total)} · ${lines} con línea · ${bingos} con bingo`;
  if (!cards.length) { $('#empty').hidden = false; $('.rank').hidden = true; return; }
  render();
  $('#search').addEventListener('input', render);
}

main().catch(err => { console.error(err); $('#summary').textContent = 'No se pudo cargar el ranking.'; });

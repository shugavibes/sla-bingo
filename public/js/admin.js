import { api, el, $, $$, toast, fmtDateTime, pluralCartones } from './common.js';

const TOKEN_KEY = 'sla-bingo-admin-token';
let token = localStorage.getItem(TOKEN_KEY) || new URLSearchParams(location.search).get('token') || '';
let preds = [];
let filter = 'all';

const headers = () => ({ 'x-admin-token': token });

let cards = [];
async function load() {
  [preds, cards] = await Promise.all([
    api('/api/admin/predictions', { headers: headers() }),
    api('/api/admin/cards', { headers: headers() }),
  ]);
  render();
  renderCards();
}

function renderCards() {
  const rows = $('#cards-rows');
  rows.innerHTML = '';
  for (const c of cards) {
    rows.append(el('tr', {},
      el('td', { class: 'pos', text: String(c.position).padStart(2, '0') }),
      el('td', {}, el('a', { href: `/c/${c.id}`, target: '_blank', text: c.nickname }), el('span', { class: 'handle', text: c.handle ? `@${c.handle}` : '' }),
        c.bingo ? el('span', { class: 'tag acid', text: 'Bingo' }) : c.line ? el('span', { class: 'tag line', text: 'Línea' }) : null),
      el('td', { 'data-keep-accents': '', style: { fontSize: '18px' }, text: c.email || '—' }),
      el('td', { class: 'num', text: `${c.hits}/${c.total}` }),
      el('td', { class: 'hide-sm px muted', text: fmtDateTime(c.createdAt) }),
    ));
  }
}

function render() {
  const q = $('#filter').value.trim().toLowerCase();
  const list = $('#list');
  list.innerHTML = '';
  const happened = preds.filter(p => p.happenedAt).length;
  $('#summary').textContent = `${preds.length} predicciones · ${happened} ya pasaron · ${preds.filter(p => p.custom).length} propias de usuarios`;

  const items = preds
    .filter(p =>
      (filter === 'all') ||
      (filter === 'pool' && !p.custom) ||
      (filter === 'custom' && p.custom) ||
      (filter === 'happened' && p.happenedAt))
    .filter(p => !q || p.text.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q) || (p.cardNickname || '').toLowerCase().includes(q) || p.id.includes(q))
    .sort((a, b) => (b.cardCount - a.cardCount) || a.text.localeCompare(b.text));

  if (!items.length) { list.append(el('p', { class: 'mono muted', style: { padding: '16px 0' }, text: 'Nada que mostrar.' })); return; }

  for (const p of items) {
    const sub = [p.category || 'General'];
    if (p.custom) sub.push(`propia de ${p.cardNickname || '?'}`);
    if (p.happenedAt) sub.push(`pasó el ${fmtDateTime(p.happenedAt)}`);
    const row = el('div', { class: `admin-row ${p.happenedAt ? 'happened' : ''} ${p.custom ? 'custom' : ''}` },
      el('span', { class: 'id', text: p.id }),
      el('div', {},
        el('div', { class: 'txt', text: p.text }),
        el('div', { class: 'sub', text: sub.join(' · ') }),
      ),
      el('span', { class: 'cnt', text: pluralCartones(p.cardCount) }),
      el('div', { class: 'btn-row' },
        p.happenedAt
          ? el('button', { class: 'btn quiet sm', text: 'Deshacer', onClick: () => setHappened(p, false) })
          : el('button', { class: 'btn primary sm', text: 'Pasó ✓', onClick: () => setHappened(p, true) }),
        el('button', { class: 'btn quiet sm', text: 'Editar', title: 'Editar texto', onClick: () => editText(p) }),
      ),
    );
    if (p.custom && p.cardId) {
      row.querySelector('.id').append(' ', el('a', { href: `/c/${p.cardId}`, target: '_blank', text: '↗', title: 'Ver cartón' }));
    }
    list.append(row);
  }
}

async function setHappened(p, happened) {
  if (happened && p.cardCount > 0 && !confirm(`¿Marcar como que PASÓ?\n\n"${p.text}"\n\nSe va a tildar en ${pluralCartones(p.cardCount)}.`)) return;
  try {
    const res = await api(`/api/admin/predictions/${encodeURIComponent(p.id)}`, { method: 'POST', headers: headers(), body: { happened } });
    toast(happened ? `Marcado. Afecta a ${pluralCartones(res.affectedCards)}.` : 'Deshecho.');
    await load();
  } catch (e) { toast(e.message, 'error'); }
}

async function editText(p) {
  const text = prompt('Nuevo texto (los cartones lo muestran actualizado):', p.text);
  if (!text || text.trim() === p.text) return;
  try {
    await api(`/api/admin/predictions/${encodeURIComponent(p.id)}`, { method: 'POST', headers: headers(), body: { text: text.trim() } });
    toast('Texto actualizado.');
    await load();
  } catch (e) { toast(e.message, 'error'); }
}

async function addNew() {
  const text = $('#new-text').value.trim();
  const category = $('#new-cat').value.trim() || 'General';
  if (text.length < 3) { toast('Texto muy corto.', 'error'); return; }
  try {
    await api('/api/admin/predictions', { method: 'POST', headers: headers(), body: { text, category } });
    $('#new-text').value = '';
    toast('Agregada al pool.');
    await load();
  } catch (e) { toast(e.message, 'error'); }
}

async function tryLogin() {
  if (!token) return false;
  try {
    await load();
    localStorage.setItem(TOKEN_KEY, token);
    $('#login').hidden = true;
    $('#panel').hidden = false;
    history.replaceState(null, '', location.pathname);
    return true;
  } catch (e) {
    localStorage.removeItem(TOKEN_KEY);
    return false;
  }
}

$('#login-btn').addEventListener('click', async () => {
  token = $('#token').value.trim();
  const ok = await tryLogin();
  const err = $('#login-error');
  err.hidden = ok;
  if (!ok) err.textContent = 'Token inválido (o el servidor no responde).';
});
$('#token').addEventListener('keydown', e => { if (e.key === 'Enter') $('#login-btn').click(); });
$('#logout').addEventListener('click', () => { localStorage.removeItem(TOKEN_KEY); location.reload(); });
$('#filter').addEventListener('input', render);
for (const c of $$('.chip[data-f]')) {
  c.addEventListener('click', () => { filter = c.dataset.f; $$('.chip[data-f]').forEach(x => x.classList.toggle('active', x === c)); render(); });
}
$('#new-add').addEventListener('click', addNew);
$('#new-text').addEventListener('keydown', e => { if (e.key === 'Enter') addNew(); });
$('#export').addEventListener('click', () => { window.open(`/api/admin/export?token=${encodeURIComponent(token)}`, '_blank'); });
$('#copy-emails').addEventListener('click', async () => {
  const list = [...new Set(cards.map(c => c.email).filter(Boolean))].join(', ');
  try { await navigator.clipboard.writeText(list); toast(`${cards.length} emails copiados.`); } catch { toast('No se pudo copiar.', 'error'); }
});

tryLogin();

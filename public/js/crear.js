import { api, el, $, $$, markNav, toast, fitCells } from './common.js';
import { toGrid, shuffle, FREE_INDEX } from './bingo.js';
import { consoleEl } from './card-view.js';

markNav();

const STORAGE_KEY = 'sla-bingo-draft';
let state;
let pool = [];
const draft = loadDraft();   // { nick, handle, picks: [], custom: [], order: null }
let activeCategory = 'Todas';

function loadDraft() {
  try { return { nick: '', handle: '', email: '', picks: [], custom: [], order: null, ...JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}') }; }
  catch { return { nick: '', handle: '', email: '', picks: [], custom: [], order: null }; }
}
function saveDraft() { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft)); }

function goStep(n) {
  for (const p of $$('.panel')) p.classList.toggle('active', p.id === `panel-${n}`);
  for (const w of $$('.wizard .ws')) {
    const s = Number(w.dataset.step);
    w.classList.toggle('active', s === n);
    w.classList.toggle('done', s < n);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------------- Paso 1 ----------------
function initStep1() {
  const nick = $('#nick'), handle = $('#handle'), email = $('#email');
  nick.value = draft.nick; handle.value = draft.handle ? `@${draft.handle}` : ''; email.value = draft.email;
  $('#to-2').addEventListener('click', () => {
    const n = nick.value.replace(/\s+/g, ' ').trim();
    if (n.length < state.rules.nickMinLen) { toast(`Poné un nombre (mínimo ${state.rules.nickMinLen} letras).`, 'error'); nick.focus(); return; }
    const h = handle.value.trim().replace(/^@+/, '').replace(/[^A-Za-z0-9_.]/g, '');
    if (!h) { toast('Poné tu @ de X (Twitter).', 'error'); handle.focus(); return; }
    const e = email.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) { toast('Poné un email válido.', 'error'); email.focus(); return; }
    draft.nick = n.slice(0, state.rules.nickMaxLen);
    draft.handle = h;
    draft.email = e;
    saveDraft();
    $('#side-nick')?.replaceChildren(`@${draft.handle}`);
    goStep(2);
  });
  for (const input of [nick, handle, email]) input.addEventListener('keydown', e => { if (e.key === 'Enter') $('#to-2').click(); });
}

// ---------------- Paso 2 ----------------
function totalSelected() { return draft.picks.length + draft.custom.length; }

function updateCounter() {
  const n = totalSelected(), req = state.rules.picksRequired;
  const c = $('#counter');
  c.innerHTML = '';
  c.append(document.createTextNode(String(n)), el('small', { text: `/${req}` }));
  c.classList.toggle('ok', n === req);
  const hp = $('#hp');
  if (hp) {
    hp.innerHTML = '';
    for (let i = 0; i < req; i++) hp.append(el('i', { class: i < n ? 'on' : '' }));
    hp.classList.toggle('ok', n === req);
  }
  const hint = $('#counter-hint');
  if (n < req) hint.textContent = `Te faltan ${req - n}`;
  else if (n === req) hint.textContent = 'Full HP. Pasá al siguiente nivel';
  else hint.textContent = `Te sobran ${n - req}, sacá alguna`;
  $('#to-3').disabled = n !== req;
  $('#custom-count').textContent = `(${draft.custom.length}/${state.rules.maxCustom})`;
  $('#custom-add').disabled = draft.custom.length >= state.rules.maxCustom || n >= req;
  $('#custom-input').disabled = n >= req;
  $('#custom-input').placeholder = n >= req ? 'Ya tenés 8. Sacá una para agregar otra.' : 'Ej: Nvidia compra una empresa argentina';
  const pc = $('#pool-count'); if (pc) pc.textContent = `${pool.length} opciones`;
  renderList();
}

function togglePick(id) {
  const i = draft.picks.indexOf(id);
  if (i >= 0) draft.picks.splice(i, 1);
  else {
    if (totalSelected() >= state.rules.picksRequired) { toast(`Ya tenés ${state.rules.picksRequired}. Sacá una para agregar otra.`, 'error'); return; }
    draft.picks.push(id);
  }
  draft.order = null;
  saveDraft();
  updateCounter();
}

function renderChips() {
  const cats = ['Todas', ...new Set(pool.map(p => p.category))];
  const box = $('#chips');
  box.innerHTML = '';
  for (const c of cats) {
    box.append(el('button', { class: `chip ${c === activeCategory ? 'active' : ''}`, text: c, onClick: () => { activeCategory = c; renderChips(); renderList(); } }));
  }
}

function renderList() {
  const q = $('#search').value.trim().toLowerCase();
  const full = totalSelected() >= state.rules.picksRequired;
  const list = $('#pred-list');
  list.innerHTML = '';
  const items = pool.filter(p =>
    (activeCategory === 'Todas' || p.category === activeCategory) &&
    (!q || p.text.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
  );
  if (!items.length) { list.append(el('p', { class: 'muted', text: 'Nada por acá. Probá otra búsqueda o inventá una propia.' })); return; }
  for (const p of items) {
    const sel = draft.picks.includes(p.id);
    list.append(el('button', {
      class: `pred ${sel ? 'selected' : ''} ${!sel && full ? 'disabled' : ''}`,
      type: 'button',
      onClick: () => togglePick(p.id),
    },
      el('span', { class: 'box' }),
      el('span', { class: 'txt' }, p.text),
      el('span', { class: 'cat', text: p.category }),
    ));
  }
}

function renderCustom() {
  const box = $('#custom-list');
  box.innerHTML = '';
  draft.custom.forEach((t, i) => {
    box.append(el('div', { class: 'custom-item' },
      el('span', { text: t }),
      el('button', { class: 'x', type: 'button', title: 'Sacar', text: 'Sacar', onClick: () => { draft.custom.splice(i, 1); draft.order = null; saveDraft(); renderCustom(); updateCounter(); } }),
    ));
  });
}

function addCustom() {
  const input = $('#custom-input');
  const t = input.value.replace(/\s+/g, ' ').trim();
  const { customMinLen, customMaxLen, maxCustom, picksRequired } = state.rules;
  if (t.length < customMinLen) { toast(`Mínimo ${customMinLen} caracteres.`, 'error'); return; }
  if (t.length > customMaxLen) { toast(`Máximo ${customMaxLen} caracteres.`, 'error'); return; }
  if (draft.custom.length >= maxCustom) { toast(`Máximo ${maxCustom} propias.`, 'error'); return; }
  if (totalSelected() >= picksRequired) { toast(`Ya tenés ${picksRequired}. Sacá una del pool para meter una propia.`, 'error'); return; }
  if (draft.custom.some(c => c.toLowerCase() === t.toLowerCase())) { toast('Esa ya la agregaste.', 'error'); return; }
  draft.custom.push(t);
  draft.order = null;
  input.value = '';
  saveDraft();
  renderCustom();
  updateCounter();
}

function initStep2() {
  $('#search').addEventListener('input', renderList);
  $('#custom-add').addEventListener('click', addCustom);
  $('#custom-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } });
  $('#back-1').addEventListener('click', () => goStep(1));
  $('#to-3').addEventListener('click', () => { if (totalSelected() === state.rules.picksRequired) { renderPreview(); goStep(3); } });
  renderChips();
  renderCustom();
  updateCounter();
}

// ---------------- Paso 3 ----------------
function currentOrder() {
  const keys = [...draft.picks, ...draft.custom.map((_, i) => `custom:${i}`)];
  if (!draft.order || draft.order.length !== keys.length || !draft.order.every(k => keys.includes(k))) {
    draft.order = shuffle(keys);
    saveDraft();
  }
  return draft.order;
}

function textFor(key) {
  if (key.startsWith('custom:')) return { text: draft.custom[Number(key.slice(7))], custom: true, category: 'Propia' };
  const p = pool.find(x => x.id === key);
  return { text: p?.text ?? '?', custom: false, category: p?.category ?? '' };
}

function renderPreview() {
  const grid = toGrid(currentOrder()).map((key, i) => {
    if (i === FREE_INDEX) return { free: true, text: 'SLA', hit: true };
    const t = textFor(key);
    return { text: t.text, custom: t.custom, hit: false };
  });
  const box = $('#preview-console');
  box.innerHTML = '';
  box.append(consoleEl({ grid, nickname: draft.nick, handle: draft.handle }, { who: `@${draft.handle}` }));
}

async function createCard() {
  const btn = $('#create');
  const errBox = $('#create-error');
  errBox.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Sellando…';
  try {
    const res = await api('/api/cards', {
      method: 'POST',
      body: { nickname: draft.nick, handle: draft.handle, email: draft.email, picks: draft.picks, custom: draft.custom, order: currentOrder() },
    });
    sessionStorage.removeItem(STORAGE_KEY);
    // Guardamos los cartones propios para mostrar "tu cartón" después.
    try {
      const mine = JSON.parse(localStorage.getItem('sla-bingo-mine') || '[]');
      mine.push(res.id);
      localStorage.setItem('sla-bingo-mine', JSON.stringify(mine));
    } catch { /* no importa */ }
    location.href = `/c/${res.id}?nuevo=1`;
  } catch (e) {
    errBox.hidden = false;
    errBox.textContent = e.message || 'No se pudo crear el cartón.';
    btn.disabled = false;
    btn.textContent = 'Sellar mi cartón &gt;';
  }
}

function initStep3() {
  $('#shuffle').addEventListener('click', () => { draft.order = null; renderPreview(); });
  $('#back-2').addEventListener('click', () => goStep(2));
  $('#agree').addEventListener('change', e => { $('#create').disabled = !e.target.checked; });
  $('#create').addEventListener('click', createCard);
}

// ---------------- Init ----------------
async function main() {
  state = await api('/api/state');
  if (!state.open) {
    $('#closed').hidden = false;
    for (const p of $$('.panel')) p.classList.remove('active');
    $('#wizard').hidden = true;
    return;
  }
  pool = await api('/api/predictions');
  // Limpiar picks que ya no existen en el pool
  draft.picks = draft.picks.filter(id => pool.some(p => p.id === id));
  initStep1();
  initStep2();
  initStep3();
  if (draft.handle) $('#side-nick')?.replaceChildren(`@${draft.handle}`);
}

main().catch(err => {
  console.error(err);
  toast('No se pudo cargar. ¿Está corriendo el servidor?', 'error');
});

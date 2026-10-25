// Utilidades compartidas por todas las páginas.

export async function api(path, opts = {}) {
  const { headers = {}, body, ...rest } = opts;
  const res = await fetch(path, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body && typeof body !== 'string' ? JSON.stringify(body) : body,
  });
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

export function fmtDate(iso, opts = {}) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', ...opts });
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Cuenta regresiva hasta `deadlineIso`. Llama a `render({d,h,m,s,over})` cada segundo. */
export function countdown(deadlineIso, render) {
  const target = new Date(deadlineIso).getTime();
  const tick = () => {
    const diff = target - Date.now();
    if (diff <= 0) { render({ d: 0, h: 0, m: 0, s: 0, over: true }); return; }
    const s = Math.floor(diff / 1000);
    render({
      d: Math.floor(s / 86400),
      h: Math.floor((s % 86400) / 3600),
      m: Math.floor((s % 3600) / 60),
      s: s % 60,
      over: false,
    });
  };
  tick();
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}

let toastTimer = null;
export function toast(msg, kind = '') {
  let t = $('#toast');
  if (!t) { t = el('div', { id: 'toast', class: 'toast' }); document.body.append(t); }
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/** Marca el link activo del nav según la URL. */
export function markNav() {
  const p = location.pathname;
  for (const a of $$('.nav a')) {
    const href = a.getAttribute('href');
    if ((href === '/' && p === '/') || (href !== '/' && p.startsWith(href))) a.classList.add('active');
  }
}

export function pluralLineas(n) {
  return n === 1 ? '1 línea' : `${n} líneas`;
}

export function pluralCartones(n) {
  return n === 1 ? '1 cartón' : `${n} cartones`;
}

export function shareOnX(text, url) {
  const u = new URL('https://twitter.com/intent/tweet');
  u.searchParams.set('text', text);
  u.searchParams.set('url', url);
  window.open(u.toString(), '_blank', 'noopener');
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = el('textarea', { style: { position: 'fixed', left: '-9999px' } }, text);
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/** Achica la letra de cada casillero hasta que el texto entre (deja lugar al índice arriba). */
export function fitCells(root = document) {
  for (const cell of root.querySelectorAll('.cell:not(.free)')) {
    const txt = cell.querySelector('.txt');
    if (!txt) continue;
    cell.style.fontSize = '';
    let size = parseFloat(getComputedStyle(cell).fontSize);
    const limit = cell.clientHeight - 26;
    let guard = 0;
    while (txt.scrollHeight > limit && size > 10 && guard++ < 14) {
      size -= 0.5;
      cell.style.fontSize = `${size}px`;
    }
  }
}
let fitTimer = null;
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => { clearTimeout(fitTimer); fitTimer = setTimeout(() => fitCells(), 120); });
  if (document.fonts?.ready) document.fonts.ready.then(() => fitCells());
}

// ---------------------------------------------------------------------------
// Press Start 2P dibuja las mayúsculas acentuadas achicadas (8×8). Como en los
// juegos de los 90, sacamos los acentos (menos la ñ) en todo lo que usa esa fuente.
// ---------------------------------------------------------------------------
const ACCENTS = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ü: 'U' };
export function pxs(str) {
  return String(str ?? '').replace(/[áéíóúüÁÉÍÓÚÜ]/g, ch => ACCENTS[ch]);
}

const PX_SELECTOR = [
  'h1', 'h2', 'h3', '.px', '.label', '.mono', '.btn', '.nav a', '.chip', '.tag', '.toast', '.stat .lbl', '.stat .num',
  '.label-row', '.foot', '.wizard .ws', '.hint', '.hitem .when', '.mini .name', '.mini .meta', '.console .bezel-top',
  '.console .bezel-bottom', '.cell .idx', '.pred .cat', '.step .n', '.admin-row .id', '.admin-row .sub', '.admin-row .cnt',
  '.legend', '.result .row', '.result .label', '.share .tip', '.share .label', '.banner', '.countdown .sub', '.countdown .label',
  '.press-start', '.custom-item .x', '.field label', 'table.rank th', 'table.rank td.pos', 'table.rank td.num', 'table.rank .handle',
].join(',');

function fixNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentElement;
    if (parent && parent.closest(PX_SELECTOR) && !parent.closest('input,textarea,[data-keep-accents]')) {
      const fixed = pxs(node.nodeValue);
      if (fixed !== node.nodeValue) node.nodeValue = fixed;
    }
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  for (const t of texts) fixNode(t);
  for (const elx of node.querySelectorAll('[placeholder]')) {
    if (elx.closest(PX_SELECTOR)) { const f = pxs(elx.placeholder); if (f !== elx.placeholder) elx.placeholder = f; }
  }
}

export function installPixelText(root = document.body) {
  fixNode(root);
  const obs = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'characterData') fixNode(m.target);
      else for (const n of m.addedNodes) fixNode(n);
    }
  });
  obs.observe(root, { childList: true, subtree: true, characterData: true });
  return obs;
}

if (typeof document !== 'undefined') {
  if (document.body) installPixelText();
  else document.addEventListener('DOMContentLoaded', () => installPixelText());
}

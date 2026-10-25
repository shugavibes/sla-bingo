import { api, el, $, markNav, toast, fmtDate, fmtDateTime, shareOnX, copyText } from './common.js';
import { consoleEl } from './card-view.js';
import { renderCardPng, renderCardOg, downloadCanvas, canvasToBlob } from './render.js';

markNav();

const id = document.body.dataset.cardId;
const url = `${location.origin}/c/${id}`;
let card = null;

// Solo quien creó el cartón (en este navegador) puede descargarlo y compartirlo; el resto solo lo ve.
function isMine(cardId) {
  try { return JSON.parse(localStorage.getItem('sla-bingo-mine') || '[]').includes(cardId); } catch { return false; }
}

const TWEET = (c) => `En mi #BingoSLA puse estos ${c.total} acontecimientos para noviembre`;

function renderSide(c) {
  $('#hits').textContent = c.hits;
  $('#lines').textContent = c.lineCount;
  $('#position').textContent = c.position ?? '–';
  $('#total-cards').textContent = c.totalCards ?? '–';
  const banner = $('#banner');
  if (c.bingo) {
    banner.hidden = false;
    banner.append(el('span', {}, el('i', { class: 'ico trophy' }), '¡Bingo!'), el('small', { text: 'Cartón lleno · you win' }));
  } else if (c.line) {
    banner.hidden = false;
    banner.classList.add('paper');
    banner.append(el('span', {}, el('i', { class: 'ico star' }), '¡Línea!'), el('small', { text: c.lines.map(l => `${l.type} ${l.n}`).join(' · ') }));
  }
  const mine = c.grid.filter(x => !x.free && x.hit).sort((a, b) => new Date(b.happenedAt) - new Date(a.happenedAt));
  const list = $('#happened');
  list.innerHTML = '';
  if (mine.length) {
    $('#happened-empty').hidden = true;
    for (const h of mine) list.append(el('div', { class: 'hitem' }, el('span', { class: 'when', text: fmtDate(h.happenedAt) }), el('span', { text: h.text })));
  }
}

/**
 * La imagen que aparece al compartir el link (X, WhatsApp) se genera acá, en el navegador,
 * y se sube al server una sola vez por estado de aciertos. Silencioso: si falla no pasa nada.
 */
async function ensureOgImage(c) {
  if (!c.hitState || c.ogState === c.hitState) return;
  try {
    const canvas = document.createElement('canvas');
    await renderCardOg(canvas, c, url);
    const blob = await canvasToBlob(canvas);
    if (!blob) return;
    const res = await fetch(`/api/cards/${encodeURIComponent(c.id)}/og`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png', 'x-hit-state': c.hitState },
      body: blob,
    });
    if (res.ok) c.ogState = c.hitState;
  } catch (e) {
    console.warn('No se pudo generar la imagen de preview', e);
  }
}

async function main() {
  const isNew = !!new URLSearchParams(location.search).get('nuevo');
  if (isNew) {
    $('#new-notice').hidden = false;
    history.replaceState(null, '', location.pathname);
  }
  const mine = isNew || isMine(id);
  $('#share').hidden = !mine;
  try {
    card = await api(`/api/cards/${encodeURIComponent(id)}`);
  } catch (e) {
    $('#not-found').hidden = false;
    $('#new-notice').hidden = true;
    return;
  }
  $('#card-page').hidden = false;
  $('#title').textContent = `Cartón de ${card.nickname}`;
  $('#subtitle').textContent = `@${card.handle} · Sellado el ${fmtDateTime(card.createdAt)}`;
  $('#label-right').textContent = `Cartón ${card.id}`;
  $('#created-at').textContent = `ID ${card.id}`;
  $('#console').append(consoleEl(card));
  renderSide(card);

  $('#download').addEventListener('click', async () => {
    const btn = $('#download');
    btn.disabled = true; btn.textContent = 'Generando…';
    try {
      const canvas = $('#export-canvas');
      await renderCardPng(canvas, card, url);
      downloadCanvas(canvas, `bingo-sla-${card.handle}-${card.id}.png`);
      toast('Imagen lista. Subila a X o Instagram.');
    } catch (e) {
      console.error(e);
      toast('No se pudo generar la imagen.', 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Descargar imagen';
    }
  });

  $('#share-x').addEventListener('click', async () => {
    await ensureOgImage(card); // así el tweet muestra el cartón como preview
    shareOnX(TWEET(card), url);
  });

  $('#copy').addEventListener('click', async () => {
    const ok = await copyText(url);
    toast(ok ? 'Link copiado.' : 'No se pudo copiar.', ok ? '' : 'error');
  });

  // Generar la preview en segundo plano (después de que carguen las fuentes).
  const idle = window.requestIdleCallback || (fn => setTimeout(fn, 800));
  idle(() => { (document.fonts?.ready || Promise.resolve()).then(() => ensureOgImage(card)); });
}

main().catch(err => { console.error(err); toast('Error cargando el cartón.', 'error'); });

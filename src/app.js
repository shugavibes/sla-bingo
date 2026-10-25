// La app de Express (sin listen). La usan server.js (local) y api/index.js (Vercel).
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CONFIG, ROOT, isOpen, deadlineDate, siteUrlFor } from './config.js';
import * as db from './db.js';
import { toGrid, evaluate, FREE_INDEX } from '../public/js/bingo.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '32kb' }));

// Snapshot de datos cargado y fresco antes de cada request.
app.use((req, res, next) => { db.load().then(() => next(), next); });

const PUBLIC_DIR = path.join(ROOT, 'public');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function cleanText(s, max) {
  return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanHandle(s) {
  let h = String(s ?? '').trim().replace(/^@+/, '');
  h = h.replace(/[^A-Za-z0-9_.]/g, '').slice(0, CONFIG.handleMaxLen);
  return h || null;
}

function cleanEmail(s) {
  const e = String(s ?? '').trim().toLowerCase().slice(0, 120);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}

/** Firma del estado de aciertos de un cartón ("10010110"): cambia cuando algo pasa. */
function hitState(card) {
  return card.cells.map(id => (db.getPrediction(id)?.happenedAt ? '1' : '0')).join('');
}

function ogImageUrl(req, card) {
  const base = siteUrlFor(req);
  return card.ogState ? `${base}/c/${card.id}/og.png?v=${card.ogState}` : `${base}/og.png`;
}

/** Arma la vista completa de un cartón: grilla con textos, qué pasó, líneas, etc. */
function resolveCard(card) {
  const picks = card.cells.map(id => {
    const p = db.getPrediction(id);
    return p
      ? { id: p.id, text: p.text, category: p.category, custom: p.custom, happenedAt: p.happenedAt }
      : { id, text: '(predicción eliminada)', category: 'General', custom: false, happenedAt: null };
  });
  const grid = toGrid(picks).map((cell, i) => (
    i === FREE_INDEX
      ? { index: i, free: true, text: 'SLA', hit: true }
      : { index: i, free: false, ...cell, hit: !!cell.happenedAt }
  ));
  const result = evaluate(grid.map(c => c.hit));
  return {
    id: card.id,
    nickname: card.nickname,
    handle: card.handle,
    createdAt: card.createdAt,
    grid,
    hits: result.hits,
    total: result.total,
    lines: result.lines,
    lineCount: result.lineCount,
    lineCells: result.lineCells,
    line: result.line,
    bingo: result.bingo,
    hitState: hitState(card),
    ogState: card.ogState || null,
  };
}

/** Versión liviana para listados y ranking. */
function summarizeCard(card) {
  const marks = toGrid(card.cells).map((id, i) => i === FREE_INDEX ? true : !!(db.getPrediction(id)?.happenedAt));
  const r = evaluate(marks);
  return {
    id: card.id,
    nickname: card.nickname,
    handle: card.handle,
    createdAt: card.createdAt,
    hits: r.hits,
    total: r.total,
    lineCount: r.lineCount,
    line: r.line,
    bingo: r.bingo,
    marks,
  };
}

// Ranking: más aciertos primero, después más líneas, y a igualdad quien selló antes.
function rankCards(cards) {
  return cards
    .map(summarizeCard)
    .sort((a, b) =>
      (b.hits - a.hits) ||
      (b.lineCount - a.lineCount) ||
      (new Date(a.createdAt) - new Date(b.createdAt))
    )
    .map((c, i) => ({ ...c, position: i + 1 }));
}

function publicState(req) {
  const preds = db.allPredictions();
  return {
    deadline: deadlineDate().toISOString(),
    deadlineLocal: CONFIG.deadline,
    open: isOpen(),
    forceOpen: CONFIG.forceOpen,
    now: new Date().toISOString(),
    monthLabel: CONFIG.monthLabel,
    monthShort: CONFIG.monthShort,
    siteUrl: siteUrlFor(req),
    storage: db.storageKind(),
    rules: {
      picksRequired: CONFIG.picksRequired,
      maxCustom: CONFIG.maxCustom,
      customMinLen: CONFIG.customMinLen,
      customMaxLen: CONFIG.customMaxLen,
      nickMinLen: CONFIG.nickMinLen,
      nickMaxLen: CONFIG.nickMaxLen,
      handleMaxLen: CONFIG.handleMaxLen,
    },
    counts: {
      cards: db.allCards().length,
      poolPredictions: preds.filter(p => !p.custom).length,
      happened: preds.filter(p => p.happenedAt).length,
      lines: db.allCards().filter(c => summarizeCard(c).line).length,
      bingos: db.allCards().filter(c => summarizeCard(c).bingo).length,
    },
  };
}

// Rate limit simple en memoria (por IP) para crear cartones.
const rateBuckets = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (rateBuckets.get(ip) || []).filter(t => now - t < CONFIG.rateLimitWindowMs);
  if (arr.length >= CONFIG.rateLimitMax) { rateBuckets.set(ip, arr); return true; }
  arr.push(now);
  rateBuckets.set(ip, arr);
  return false;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, arr] of rateBuckets) {
    const keep = arr.filter(t => now - t < CONFIG.rateLimitWindowMs);
    if (keep.length) rateBuckets.set(ip, keep); else rateBuckets.delete(ip);
  }
}, 10 * 60 * 1000).unref();

// Admin auth: header x-admin-token, Authorization: Bearer, o ?token=
function adminAuth(req, res, next) {
  const given =
    req.get('x-admin-token') ||
    (req.get('authorization') || '').replace(/^Bearer\s+/i, '') ||
    req.query.token;
  const ok = typeof given === 'string' && given.length === CONFIG.adminToken.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(CONFIG.adminToken));
  if (!ok) return res.status(401).json({ error: 'Token de admin inválido.' });
  next();
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

app.get('/api/state', (req, res) => {
  res.json(publicState(req));
});

app.get('/api/predictions', (req, res) => {
  res.json(db.poolPredictions().map(p => ({
    id: p.id, text: p.text, category: p.category, happenedAt: p.happenedAt,
  })));
});

app.get('/api/cards', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 24, 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const all = db.allCards().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({
    total: all.length,
    cards: all.slice(offset, offset + limit).map(summarizeCard),
  });
});

// Feed: cartones completos (con textos), del más nuevo al más viejo.
app.get('/api/feed', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 12, 60);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const all = db.allCards().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({
    total: all.length,
    offset,
    cards: all.slice(offset, offset + limit).map(resolveCard),
  });
});

// Imagen OG por cartón: la genera el navegador (canvas) y la sube; el server la guarda
// y la usa como preview del link en X/WhatsApp. Se regenera cuando cambian los aciertos.
const ogUploads = new Map();
app.post('/api/cards/:id/og', express.raw({ type: 'image/png', limit: '3mb' }), async (req, res, next) => {
  try {
  const card = await db.findCard(req.params.id);
  if (!card) return res.status(404).json({ error: 'Cartón no encontrado.' });
  const buf = req.body;
  const isPng = Buffer.isBuffer(buf) && buf.length > 100 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (!isPng) return res.status(400).json({ error: 'Mandá un PNG (Content-Type: image/png).' });
  const state = hitState(card);
  if (req.get('x-hit-state') !== state) return res.status(409).json({ error: 'El cartón cambió, regenerá la imagen.', hitState: state });
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const arr = (ogUploads.get(ip) || []).filter(t => now - t < 60 * 60 * 1000);
  if (arr.length >= 60) return res.status(429).json({ error: 'Demasiadas imágenes.' });
  arr.push(now); ogUploads.set(ip, arr);
  await db.putOg(card.id, buf);
  const updated = await db.setOgState(card.id, state);
  res.json({ ok: true, ogState: state, url: ogImageUrl(req, updated) });
  } catch (e) { next(e); }
});

app.get('/c/:id/og.png', async (req, res, next) => {
  try {
    const card = await db.findCard(req.params.id);
    const img = card ? await db.getOg(card.id) : null;
    if (img) {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.send(img);
    }
    res.redirect(302, '/og.png');
  } catch (e) { next(e); }
});

app.get('/api/ranking', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const ranked = rankCards(db.allCards());
  res.json({ total: ranked.length, cards: ranked.slice(0, limit) });
});

app.get('/api/cards/:id', async (req, res, next) => {
  try {
    const card = await db.findCard(req.params.id);
    if (!card) return res.status(404).json({ error: 'Cartón no encontrado.' });
    const ranked = rankCards(db.allCards());
    const pos = ranked.find(c => c.id === card.id)?.position ?? null;
    res.json({ ...resolveCard(card), position: pos, totalCards: ranked.length });
  } catch (e) { next(e); }
});

app.get('/api/happened', (req, res) => {
  const list = db.allPredictions()
    .filter(p => p.happenedAt && !p.custom)
    .sort((a, b) => new Date(b.happenedAt) - new Date(a.happenedAt))
    .map(p => ({ id: p.id, text: p.text, category: p.category, happenedAt: p.happenedAt }));
  res.json(list);
});

app.post('/api/cards', async (req, res, next) => {
  try {
  if (!isOpen()) {
    return res.status(403).json({ error: 'Se cerró el plazo para crear cartones.' });
  }
  const ip = req.ip || 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Demasiados cartones en poco tiempo. Probá más tarde.' });
  }

  const body = req.body || {};
  const nickname = cleanText(body.nickname, CONFIG.nickMaxLen + 10);
  const handle = cleanHandle(body.handle);
  const email = cleanEmail(body.email);
  const picks = Array.isArray(body.picks) ? body.picks.map(String) : [];
  const customTexts = Array.isArray(body.custom) ? body.custom.map(t => cleanText(t, CONFIG.customMaxLen + 10)) : [];

  if (nickname.length < CONFIG.nickMinLen || nickname.length > CONFIG.nickMaxLen) {
    return res.status(400).json({ error: `El nombre tiene que tener entre ${CONFIG.nickMinLen} y ${CONFIG.nickMaxLen} caracteres.` });
  }
  if (!handle) return res.status(400).json({ error: 'Falta tu usuario de X (Twitter).' });
  if (!email) return res.status(400).json({ error: 'Falta un email válido.' });
  if (customTexts.length > CONFIG.maxCustom) {
    return res.status(400).json({ error: `Máximo ${CONFIG.maxCustom} predicciones propias.` });
  }
  for (const t of customTexts) {
    if (t.length < CONFIG.customMinLen || t.length > CONFIG.customMaxLen) {
      return res.status(400).json({ error: `Cada predicción propia tiene que tener entre ${CONFIG.customMinLen} y ${CONFIG.customMaxLen} caracteres.` });
    }
  }
  if (new Set(picks).size !== picks.length) {
    return res.status(400).json({ error: 'Hay predicciones repetidas.' });
  }
  for (const id of picks) {
    const p = db.getPrediction(id);
    if (!p || p.custom) return res.status(400).json({ error: `Predicción inválida: ${id}` });
  }
  if (picks.length + customTexts.length !== CONFIG.picksRequired) {
    return res.status(400).json({ error: `Tenés que elegir exactamente ${CONFIG.picksRequired} predicciones (entre las del pool y las tuyas).` });
  }

  // Orden de la grilla: el cliente manda `order` (lista de 8 posiciones mezcladas) o se mezcla acá.
  // Las custom se identifican en `order` como "custom:<n>".
  const customIds = customTexts.map(() => null); // se completan al crear
  let order = Array.isArray(body.order) ? body.order.map(String) : null;
  const expected = [...picks, ...customTexts.map((_, i) => `custom:${i}`)];
  if (!order || order.length !== expected.length || new Set(order).size !== order.length || !order.every(o => expected.includes(o))) {
    order = expected.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
  }

  // Reservamos el id del cartón, creamos las predicciones propias apuntando a él, y recién ahí el cartón.
  const cardId = db.reserveCardId();
  const cells = [];
  for (const o of order) {
    if (o.startsWith('custom:')) {
      const i = Number(o.slice(7));
      if (!customIds[i]) {
        customIds[i] = (await db.addPrediction({ text: customTexts[i], category: 'Propia', custom: true, cardId })).id;
      }
      cells.push(customIds[i]);
    } else {
      cells.push(o);
    }
  }
  const card = await db.addCard({ id: cardId, nickname, handle, email, cells });
  res.status(201).json({ id: card.id, url: `${siteUrlFor(req)}/c/${card.id}` });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// API admin
// ---------------------------------------------------------------------------

app.get('/api/admin/predictions', adminAuth, (req, res) => {
  const cards = db.allCards();
  const list = db.allPredictions().map(p => ({
    ...p,
    cardCount: cards.filter(c => c.cells.includes(p.id)).length,
    cardNickname: p.custom ? (db.getCard(p.cardId)?.nickname ?? null) : null,
  }));
  res.json(list);
});

app.post('/api/admin/predictions/:id', adminAuth, async (req, res, next) => {
  try {
    const { happened, text } = req.body || {};
    let p = db.getPrediction(req.params.id);
    if (!p) return res.status(404).json({ error: 'Predicción no encontrada.' });
    if (typeof happened !== 'boolean' && typeof text !== 'string') {
      return res.status(400).json({ error: 'Mandá {happened: true/false} o {text: "..."} (como JSON).' });
    }
    if (typeof happened === 'boolean') p = await db.setHappened(p.id, happened);
    if (typeof text === 'string' && cleanText(text, 200).length >= 3) p = await db.updatePredictionText(p.id, cleanText(text, 200));
    res.json({ ...p, affectedCards: db.cardsWithPrediction(p.id).length });
  } catch (e) { next(e); }
});

app.post('/api/admin/predictions', adminAuth, async (req, res, next) => {
  try {
    const text = cleanText(req.body?.text, 200);
    const category = cleanText(req.body?.category || 'General', 40);
    if (text.length < 3) return res.status(400).json({ error: 'Texto muy corto.' });
    res.status(201).json(await db.addPrediction({ text, category, custom: false }));
  } catch (e) { next(e); }
});

// Cartones con email (solo admin), ordenados como el ranking: para contactar ganadores.
app.get('/api/admin/cards', adminAuth, (req, res) => {
  const ranked = rankCards(db.allCards());
  res.json(ranked.map(c => ({ ...c, email: db.getCard(c.id)?.email ?? null })));
});

app.get('/api/admin/export', adminAuth, (req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="sla-bingo-backup-${Date.now()}.json"`);
  res.json(db.snapshot());
});

// ---------------------------------------------------------------------------
// Páginas
// ---------------------------------------------------------------------------

const cartonTemplate = fs.readFileSync(path.join(PUBLIC_DIR, 'carton.html'), 'utf8');

app.get('/c/:id', async (req, res, next) => {
  try {
  const card = await db.findCard(req.params.id);
  const url = `${siteUrlFor(req)}/c/${encodeURIComponent(req.params.id)}`;
  let title = 'Cartón no encontrado · SLA Bingo Tech';
  let desc = 'Este cartón no existe (o el link está mal).';
  if (card) {
    const s = summarizeCard(card);
    title = `El cartón de ${card.nickname} · SLA Bingo Tech ${CONFIG.monthLabel}`;
    desc = s.bingo
      ? `¡BINGO! Acertó las ${s.total} predicciones. Mirá el cartón.`
      : s.line
        ? `¡Línea! ${s.hits}/${s.total} predicciones acertadas. Mirá el cartón.`
        : `${s.hits}/${s.total} predicciones acertadas hasta ahora. Mirá qué dijo que iba a pasar en ${CONFIG.monthLabel}.`;
  }
  const html = cartonTemplate
    .replaceAll('{{TITLE}}', escapeHtml(title))
    .replaceAll('{{DESC}}', escapeHtml(desc))
    .replaceAll('{{URL}}', escapeHtml(url))
    .replaceAll('{{OG_IMAGE}}', escapeHtml(card ? ogImageUrl(req, card) : `${siteUrlFor(req)}/og.png`))
    .replaceAll('{{CARD_ID}}', escapeHtml(req.params.id));
  res.status(card ? 200 : 404).type('html').send(html);
  } catch (e) { next(e); }
});

app.get('/crear', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'crear.html')));
app.get('/ranking', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'ranking.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));

app.use(express.static(PUBLIC_DIR, { extensions: ['html'], index: 'index.html' }));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'No existe.' });
  res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
});

// Errores no manejados → JSON (o texto) sin tirar el proceso.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Error interno.' });
});

export default app;

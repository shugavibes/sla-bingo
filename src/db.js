// Base de datos con dos backends:
//  - archivo JSON (local): data/db.json + data/og/*.png
//  - Redis (Upstash, para Vercel): una clave por predicción / cartón / imagen
// En memoria siempre hay un snapshot (`state`) que se refresca cada CACHE_MS desde Redis,
// así los handlers leen sincrónicamente y las escrituras van directo al backend.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CONFIG } from './config.js';

const CACHE_MS = 2000;

let state = { predictions: new Map(), cards: new Map() };
let backend = null;
let loadedAt = 0;
let initPromise = null;

// ---------------------------------------------------------------------------
// Backend: archivo JSON
// ---------------------------------------------------------------------------
function fileBackend(dbPath, kind = 'file') {
  const ogDir = path.join(path.dirname(dbPath), 'og');
  let writeTimer = null;

  function readFile() {
    try { return JSON.parse(fs.readFileSync(dbPath, 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  }
  function persistNow() {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const tmp = dbPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(snapshot(), null, 2));
    fs.renameSync(tmp, dbPath);
  }
  function persist() {
    if (writeTimer) return;
    writeTimer = setTimeout(() => { writeTimer = null; persistNow(); }, 50);
  }
  const flush = () => { if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; persistNow(); } };
  process.on('exit', flush);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { flush(); process.exit(0); });

  return {
    kind,
    live: false, // no hace falta refrescar: este proceso es el único que escribe
    async loadAll() { return readFile() || { predictions: [], cards: [] }; },
    async putPreds() { persist(); },
    async putPred() { persist(); },
    async putCard() { persist(); },
    async getPredRaw(id) { return state.predictions.get(id) || null; },
    async getCardRaw(id) { return state.cards.get(id) || null; },
    async putOg(id, buf) { fs.mkdirSync(ogDir, { recursive: true }); fs.writeFileSync(path.join(ogDir, `${id}.png`), buf); },
    async getOg(id) { try { return fs.readFileSync(path.join(ogDir, `${id}.png`)); } catch { return null; } },
    flush,
  };
}

// ---------------------------------------------------------------------------
// Backend: Redis (Upstash REST)
// ---------------------------------------------------------------------------
async function redisBackend(url, token) {
  const { Redis } = await import('@upstash/redis');
  const r = new Redis({ url, token, automaticDeserialization: false });
  const P = CONFIG.redisPrefix;
  const K = {
    preds: `${P}:preds`, cards: `${P}:cards`,
    pred: id => `${P}:pred:${id}`, card: id => `${P}:card:${id}`, og: id => `${P}:og:${id}`,
  };
  const parse = v => (v ? JSON.parse(v) : null);

  return {
    kind: 'redis',
    live: true,
    async loadAll() {
      const [pids, cids] = await Promise.all([r.smembers(K.preds), r.smembers(K.cards)]);
      const [pvals, cvals] = await Promise.all([
        pids.length ? r.mget(...pids.map(K.pred)) : [],
        cids.length ? r.mget(...cids.map(K.card)) : [],
      ]);
      return { predictions: pvals.map(parse).filter(Boolean), cards: cvals.map(parse).filter(Boolean) };
    },
    async putPreds(list) {
      if (!list.length) return;
      const pipe = r.pipeline();
      for (const p of list) pipe.set(K.pred(p.id), JSON.stringify(p));
      pipe.sadd(K.preds, ...list.map(p => p.id));
      await pipe.exec();
    },
    async putPred(p) { await r.pipeline().set(K.pred(p.id), JSON.stringify(p)).sadd(K.preds, p.id).exec(); },
    async putCard(c) { await r.pipeline().set(K.card(c.id), JSON.stringify(c)).sadd(K.cards, c.id).exec(); },
    async getPredRaw(id) { return parse(await r.get(K.pred(id))); },
    async getCardRaw(id) { return parse(await r.get(K.card(id))); },
    async putOg(id, buf) { await r.set(K.og(id), buf.toString('base64')); },
    async getOg(id) { const v = await r.get(K.og(id)); return v ? Buffer.from(v, 'base64') : null; },
    flush() {},
  };
}

// ---------------------------------------------------------------------------
// Snapshot en memoria
// ---------------------------------------------------------------------------
function fromRaw(raw) {
  return {
    predictions: new Map((raw.predictions || []).map(p => [p.id, p])),
    cards: new Map((raw.cards || []).map(c => [c.id, c])),
  };
}

/** Mezcla el seed con lo existente (por id). No pisa `happenedAt`. */
async function mergeSeed() {
  let seed = [];
  try { seed = JSON.parse(fs.readFileSync(CONFIG.seedPath, 'utf8')); } catch { /* sin seed */ }
  const changed = [];
  let added = 0, updated = 0;
  for (const s of seed) {
    if (!s.id || !s.text) continue;
    const existing = state.predictions.get(s.id);
    if (existing) {
      if (existing.text !== s.text || existing.category !== (s.category || 'General')) {
        existing.text = s.text;
        existing.category = s.category || 'General';
        changed.push(existing);
        updated++;
      }
    } else {
      const pred = { id: s.id, text: s.text, category: s.category || 'General', custom: false, cardId: null, happenedAt: null, createdAt: new Date().toISOString() };
      state.predictions.set(pred.id, pred);
      changed.push(pred);
      added++;
    }
  }
  if (changed.length) await backend.putPreds(changed);
  return { added, updated };
}

async function doInit() {
  if (CONFIG.redisUrl && CONFIG.redisToken) {
    backend = await redisBackend(CONFIG.redisUrl, CONFIG.redisToken);
  } else if (CONFIG.isVercel) {
    console.warn('[db] Sin Redis configurado en Vercel: los datos se pierden en cada cold start. Agregá Upstash Redis (ver README).');
    backend = fileBackend('/tmp/sla-bingo/db.json', 'memory');
  } else {
    backend = fileBackend(CONFIG.dbPath, 'file');
  }
  state = fromRaw(await backend.loadAll());
  loadedAt = Date.now();
  const { added, updated } = await mergeSeed();
  if (backend.kind === 'file') backend.flush();
  return { storage: backend.kind, predictions: state.predictions.size, cards: state.cards.size, added, updated };
}

/** Inicializa (una sola vez). Devuelve info para el log de arranque. */
export function init() {
  if (!initPromise) initPromise = doInit();
  return initPromise;
}

/** Garantiza que el snapshot esté cargado y fresco. Llamar al inicio de cada request. */
export async function load() {
  await init();
  if (backend.live && Date.now() - loadedAt > CACHE_MS) {
    state = fromRaw(await backend.loadAll());
    loadedAt = Date.now();
  }
}

export function storageKind() { return backend?.kind || 'none'; }

// ---------- IDs ----------
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // sin caracteres ambiguos
export function shortId(len = 7) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

// ---------- Predicciones ----------
export function allPredictions() { return [...state.predictions.values()]; }
export function poolPredictions() { return allPredictions().filter(p => !p.custom); }
export function getPrediction(id) { return state.predictions.get(id) || null; }

export async function addPrediction({ text, category = 'General', custom = false, cardId = null }) {
  let id;
  do { id = (custom ? 'c_' : 'p_') + shortId(6); } while (state.predictions.has(id));
  const pred = { id, text, category, custom, cardId, happenedAt: null, createdAt: new Date().toISOString() };
  state.predictions.set(id, pred);
  await backend.putPred(pred);
  return pred;
}

export async function setHappened(id, happened) {
  let p = state.predictions.get(id) || (backend.live ? await backend.getPredRaw(id) : null);
  if (!p) return null;
  p.happenedAt = happened ? (p.happenedAt || new Date().toISOString()) : null;
  state.predictions.set(id, p);
  await backend.putPred(p);
  return p;
}

export async function updatePredictionText(id, text) {
  const p = state.predictions.get(id) || (backend.live ? await backend.getPredRaw(id) : null);
  if (!p) return null;
  p.text = text;
  state.predictions.set(id, p);
  await backend.putPred(p);
  return p;
}

// ---------- Cartones ----------
export function allCards() { return [...state.cards.values()]; }
export function getCard(id) { return state.cards.get(id) || null; }

/** Como getCard, pero si no está en el snapshot lo busca en el backend (recién creado en otra instancia). */
export async function findCard(id) {
  const cached = state.cards.get(id);
  if (cached || !backend.live) return cached || null;
  const c = await backend.getCardRaw(id);
  if (!c) return null;
  state.cards.set(id, c);
  // sus predicciones propias pueden no estar todavía en el snapshot
  const missing = c.cells.filter(pid => !state.predictions.has(pid));
  for (const pid of missing) {
    const p = await backend.getPredRaw(pid);
    if (p) state.predictions.set(pid, p);
  }
  return c;
}

export function reserveCardId() {
  let id;
  do { id = shortId(7); } while (state.cards.has(id));
  return id;
}

export async function addCard({ id, nickname, handle, email = null, cells }) {
  if (!id || state.cards.has(id)) id = reserveCardId();
  const card = {
    id,
    nickname,
    handle: handle || null,
    email,                      // privado: nunca sale por la API pública
    cells,                      // 8 ids de predicción, en el orden de la grilla (sin el centro)
    ogState: null,              // firma de aciertos con la que se generó la imagen OG
    createdAt: new Date().toISOString(),
  };
  state.cards.set(id, card);
  await backend.putCard(card);
  return card;
}

export async function setOgState(cardId, ogState) {
  const c = await findCard(cardId);
  if (!c) return null;
  c.ogState = ogState;
  await backend.putCard(c);
  return c;
}

export function cardsWithPrediction(predId) {
  return allCards().filter(c => c.cells.includes(predId));
}

// ---------- Imágenes OG ----------
export async function putOg(cardId, buf) { await backend.putOg(cardId, buf); }
export async function getOg(cardId) { return backend.getOg(cardId); }

export function snapshot() {
  return { version: 1, predictions: allPredictions(), cards: allCards() };
}

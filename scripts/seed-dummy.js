#!/usr/bin/env node
// Crea cartones de prueba contra el servidor local (para ver la home, el ranking, etc. con datos).
//   npm run seed:dummy            → 12 cartones
//   npm run seed:dummy -- 30      → 30 cartones
// Ojo: respeta el rate limit (5 por hora por IP) salvo que el server corra con RATE_LIMIT_MAX alto;
// por eso este script pega directo al archivo de la DB cuando el server NO está corriendo,
// o usa la API si está corriendo (y entonces crea como máximo 5).

import { CONFIG } from '../src/config.js';
import * as db from '../src/db.js';

const N = Number(process.argv[2]) || 12;
const names = ['Nico', 'Shuga', 'Fede', 'Juli', 'Mica', 'Tomi', 'Lucho', 'Caro', 'Nacho', 'Flor', 'Agus', 'Pipo', 'Sol', 'Mati', 'Vicky', 'Guille', 'Dani', 'Ale', 'Maru', 'Pato', 'Rama', 'Cami', 'Seba', 'Lu', 'Fer', 'Nahue', 'Emi', 'Gon', 'Pau', 'Marto'];
const customs = ['Nvidia compra una empresa argentina', 'Sale el iPhone plegable', 'OpenAI anuncia que es rentable', 'Elon vende X', 'Cae Mercado Pago un viernes', 'Milei twittea sobre Claude', 'Se cae WhatsApp en Argentina', 'Globant se funde con alguien'];

async function viaApi() {
  const base = `http://localhost:${CONFIG.port}`;
  const pool = await (await fetch(`${base}/api/predictions`)).json();
  let ok = 0;
  for (let i = 0; i < N; i++) {
    const picks = pool.map(p => p.id).sort(() => Math.random() - .5);
    const nCustom = Math.random() < .5 ? Math.floor(Math.random() * 2) : 0;
    const custom = customs.sort(() => Math.random() - .5).slice(0, nCustom);
    const body = { nickname: names[i % names.length] + (i >= names.length ? ` ${Math.floor(i / names.length) + 1}` : ''), handle: names[i % names.length].toLowerCase() + '_sla', email: `${names[i % names.length].toLowerCase()}${i}@example.com`, picks: picks.slice(0, CONFIG.picksRequired - nCustom), custom };
    const res = await fetch(`${base}/api/cards`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (res.ok) { ok++; console.log(`+ ${body.nickname} → ${data.url}`); }
    else { console.log(`✗ ${body.nickname}: ${data.error}`); if (res.status === 429) break; }
  }
  console.log(`\n${ok} cartones creados vía API.`);
}

async function viaDb() {
  await db.init();
  const pool = db.poolPredictions();
  for (let i = 0; i < N; i++) {
    const picks = pool.map(p => p.id).sort(() => Math.random() - .5);
    const nCustom = Math.random() < .5 ? Math.floor(Math.random() * 2) : 0;
    const cardId = db.reserveCardId();
    const customIds = [];
    for (const t of customs.sort(() => Math.random() - .5).slice(0, nCustom)) customIds.push((await db.addPrediction({ text: t, category: 'Propia', custom: true, cardId })).id);
    const cells = [...picks.slice(0, CONFIG.picksRequired - nCustom), ...customIds].sort(() => Math.random() - .5);
    const nick = names[i % names.length] + (i >= names.length ? ` ${Math.floor(i / names.length) + 1}` : '');
    await db.addCard({ id: cardId, nickname: nick, handle: nick.toLowerCase().replace(/\s/g, '') + '_sla', email: `${nick.toLowerCase().replace(/\s/g, '')}@example.com`, cells });
    console.log(`+ ${nick} → /c/${cardId}`);
  }
  console.log(`\n${N} cartones creados directo en ${CONFIG.dbPath}. Levantá el server y listo.`);
}

// ¿Está corriendo el server?
fetch(`http://localhost:${CONFIG.port}/api/state`).then(() => viaApi()).catch(() => viaDb());

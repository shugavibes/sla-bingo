#!/usr/bin/env node
// CLI de admin. Habla con el servidor por HTTP, así que sirve tanto en local
// como contra producción (BASE_URL=https://... npm run admin).
//
//   npm run admin                    → modo interactivo
//   npm run admin -- list            → lista predicciones (con cuántos cartones las tienen)
//   npm run admin -- list happened   → solo las que ya pasaron
//   npm run admin -- paso p070       → marca que pasó (se tilda en todos los cartones)
//   npm run admin -- deshacer p070   → la desmarca
//   npm run admin -- buscar nvidia   → busca por texto
//   npm run admin -- add "Texto" [Categoría]  → agrega al pool
//   npm run admin -- export          → guarda un backup JSON en data/

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { CONFIG, ROOT } from '../src/config.js';

const BASE = (process.env.BASE_URL || `http://localhost:${CONFIG.port}`).replace(/\/+$/, '');
const TOKEN = process.env.ADMIN_TOKEN || CONFIG.adminToken;

async function call(method, p, body) {
  const res = await fetch(BASE + p, {
    method,
    headers: { 'content-type': 'application/json', 'x-admin-token': TOKEN },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

const c = {
  dim: s => `\x1b[2m${s}\x1b[0m`,
  teal: s => `\x1b[36m${s}\x1b[0m`,
  orange: s => `\x1b[33m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
};

function printList(list) {
  for (const p of list) {
    const mark = p.happenedAt ? c.teal('✓') : ' ';
    const tag = p.custom ? c.orange('propia') : c.dim(p.category);
    console.log(` ${mark} ${c.bold(p.id.padEnd(9))} ${p.text}  ${tag} ${c.dim(`[${p.cardCount} cartones]`)}${p.custom && p.cardNickname ? c.dim(` ← ${p.cardNickname}`) : ''}`);
  }
}

async function cmd(args) {
  const [action, ...rest] = args;
  switch ((action || '').toLowerCase()) {
    case 'list': {
      const all = await call('GET', '/api/admin/predictions');
      const f = (rest[0] || '').toLowerCase();
      const list = all.filter(p => f === 'happened' ? p.happenedAt : f === 'custom' ? p.custom : f === 'pool' ? !p.custom : true)
        .sort((a, b) => b.cardCount - a.cardCount);
      printList(list);
      console.log(c.dim(`\n ${list.length} predicciones · ${all.filter(p => p.happenedAt).length} ya pasaron`));
      return;
    }
    case 'buscar': case 'search': {
      const q = rest.join(' ').toLowerCase();
      const all = await call('GET', '/api/admin/predictions');
      printList(all.filter(p => p.text.toLowerCase().includes(q) || p.id.includes(q)));
      return;
    }
    case 'paso': case 'happened': case 'mark': {
      for (const id of rest) {
        const r = await call('POST', `/api/admin/predictions/${encodeURIComponent(id)}`, { happened: true });
        console.log(c.teal(`✓ Pasó: "${r.text}" → tildado en ${r.affectedCards} cartones`));
      }
      return;
    }
    case 'deshacer': case 'undo': case 'unmark': {
      for (const id of rest) {
        const r = await call('POST', `/api/admin/predictions/${encodeURIComponent(id)}`, { happened: false });
        console.log(c.orange(`↩ Deshecho: "${r.text}"`));
      }
      return;
    }
    case 'add': {
      const [text, category] = rest;
      if (!text) throw new Error('Falta el texto: add "Texto" [Categoría]');
      const r = await call('POST', '/api/admin/predictions', { text, category });
      console.log(c.teal(`+ Agregada ${r.id}: ${r.text}`));
      return;
    }
    case 'borrar': case 'delete': {
      for (const id of rest) {
        const r = await call('DELETE', `/api/admin/cards/${encodeURIComponent(id)}`);
        console.log(c.orange(`✗ Borrado el cartón ${r.id} de ${r.nickname} (${r.removedPredictions} propias)`));
      }
      return;
    }
    case 'export': {
      const data = await call('GET', '/api/admin/export');
      const out = path.join(ROOT, 'data', `db.backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      fs.writeFileSync(out, JSON.stringify(data, null, 2));
      console.log(c.teal(`Backup guardado en ${out}`));
      return;
    }
    case 'help': case '?': default:
      console.log(`
Comandos:
  list [pool|custom|happened]   lista predicciones
  buscar <texto>                busca por texto o id
  paso <id> [id...]             marca que pasó → se tilda en todos los cartones
  deshacer <id> [id...]         la desmarca
  add "Texto" [Categoría]       agrega una predicción al pool
  borrar <idCartón> [id...]     borra un cartón (moderación)
  export                        backup JSON en data/
  salir                         chau
`);
  }
}

async function interactive() {
  console.log(c.bold('\n SLA BINGO TECH · admin') + c.dim(`  (${BASE})`));
  try { await call('GET', '/api/state'); } catch { console.log(c.orange(' No llego al servidor. ¿Está corriendo npm start?')); process.exit(1); }
  await cmd(['help']);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: c.orange('bingo> ') });
  rl.prompt();
  rl.on('line', async line => {
    const args = line.match(/"[^"]*"|\S+/g)?.map(s => s.replace(/^"|"$/g, '')) || [];
    if (['salir', 'exit', 'quit', 'q'].includes((args[0] || '').toLowerCase())) { rl.close(); return; }
    if (args.length) { try { await cmd(args); } catch (e) { console.log(c.orange(' ✗ ' + e.message)); } }
    rl.prompt();
  });
  rl.on('close', () => { console.log(c.dim('\n chau')); process.exit(0); });
}

const args = process.argv.slice(2);
if (args.length) {
  cmd(args).catch(e => { console.error(' ✗ ' + e.message); process.exit(1); });
} else {
  interactive();
}

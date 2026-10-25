// Test end-to-end de la API. Levantá el server en otro puerto con rate limit alto y corré:
//   PORT=3123 RATE_LIMIT_MAX=100 npm start   (en otra terminal)
//   npm test

const BASE = process.env.BASE_URL || 'http://localhost:3123';
const TOKEN = process.env.ADMIN_TOKEN || 'sla-admin';
const j = async (p, o = {}) => {
  const r = await fetch(BASE + p, { headers: { 'content-type': 'application/json', ...(o.headers || {}) }, method: o.method || 'GET', body: o.body ? JSON.stringify(o.body) : undefined });
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, data: ct.includes('json') ? await r.json() : await r.text() };
};
const assert = (c, m) => { if (!c) { console.error('✗ ' + m); process.exitCode = 1; } else console.log('✓ ' + m); };

const pool = (await j('/api/predictions')).data;

// 1. validaciones
let r = await j('/api/cards', { method: 'POST', body: { nickname: 'X', handle: 'x', email: 'x@x.com', picks: pool.slice(0, 8).map(p => p.id), custom: [] } });
assert(r.status === 400, 'nickname corto rechazado: ' + r.data.error);
r = await j('/api/cards', { method: 'POST', body: { nickname: 'Nico', handle: 'n', email: 'n@n.com', picks: pool.slice(0, 7).map(p => p.id), custom: [] } });
assert(r.status === 400, 'cantidad incorrecta rechazada: ' + r.data.error);
r = await j('/api/cards', { method: 'POST', body: { nickname: 'Nico', handle: 'n', email: 'n@n.com', picks: pool.slice(0, 6).map(p => p.id), custom: ['Nvidia compra una empresa argentina', 'Corta'] } });
assert(r.status === 400, 'custom corta rechazada: ' + r.data.error);
r = await j('/api/cards', { method: 'POST', body: { nickname: 'Nico', handle: 'n', email: 'n@n.com', picks: [...pool.slice(0, 7).map(p => p.id), pool[0].id], custom: [] } });
assert(r.status === 400, 'repetidas rechazadas: ' + r.data.error);

// 2. crear cartón con 22 del pool + 2 propias y orden explícito
const picks = pool.slice(0, 6).map(p => p.id);
const custom = ['Nvidia compra una empresa argentina', 'Sale el iPhone plegable'];
const order = [...picks, 'custom:0', 'custom:1'];
r = await j('/api/cards', { method: 'POST', body: { nickname: 'Nico', picks, custom, order } });
assert(r.status === 400 && /usuario de X/.test(r.data.error), 'sin handle rechazado: ' + r.data.error);
r = await j('/api/cards', { method: 'POST', body: { nickname: 'Nico', handle: 'nico', email: 'no-es-mail', picks, custom, order } });
assert(r.status === 400 && /email/.test(r.data.error), 'email inválido rechazado: ' + r.data.error);
r = await j('/api/cards', { method: 'POST', body: { nickname: '  Nico   Shuga ', handle: '@shugavibes', email: ' Nico@Example.com ', picks, custom, order } });
assert(r.status === 201 && r.data.id, 'cartón creado: ' + JSON.stringify(r.data));
const id = r.data.id;

// 3. leer cartón
let card = (await j(`/api/cards/${id}`)).data;
assert(card.nickname === 'Nico Shuga', 'nickname normalizado: ' + card.nickname);
assert(card.handle === 'shugavibes', 'handle sin @: ' + card.handle);
assert(!('email' in card), 'email NO sale en la API pública');
assert(card.hitState === '00000000' && card.ogState === null, 'hitState/ogState iniciales');
assert(card.grid.length === 9 && card.grid[4].free, 'grilla 9 con centro libre');
assert(card.grid[0].id === picks[0] && card.grid[3].id === picks[3] && card.grid[5].id === picks[4], 'orden explícito respetado (centro salteado)');
assert(card.grid[7].custom && card.grid[7].text === custom[0], 'custom en su lugar: ' + card.grid[7].text);
assert(card.hits === 0 && card.lineCount === 0 && !card.line && !card.bingo, 'arranca en 0');

// 4. admin: token inválido
r = await j('/api/admin/predictions', { headers: { 'x-admin-token': 'nope' } });
assert(r.status === 401, 'token inválido rechazado');

// 5. marcar fila 1 (celdas 0-2) como pasadas → línea
const row1 = card.grid.slice(0, 3).map(c => c.id);
for (const pid of row1) {
  r = await j(`/api/admin/predictions/${pid}`, { method: 'POST', headers: { 'x-admin-token': TOKEN }, body: { happened: true } });
  assert(r.status === 200 && r.data.happenedAt && r.data.affectedCards === 1, `marcada ${pid} (afecta ${r.data.affectedCards})`);
}
card = (await j(`/api/cards/${id}`)).data;
assert(card.hits === 3 && card.lineCount === 1 && card.line && !card.bingo && card.lines[0].type === 'fila' && card.lines[0].n === 1, `línea fila 1: hits=${card.hits} lines=${card.lineCount}`);

// 6. marcar celda 7 (columna 2, con el centro libre) → columna 2 completa: 2 líneas
await j(`/api/admin/predictions/${card.grid[7].id}`, { method: 'POST', headers: { 'x-admin-token': TOKEN }, body: { happened: true } });
card = (await j(`/api/cards/${id}`)).data;
assert(card.lineCount === 2 && card.hits === 4 && card.grid[7].hit, `2 líneas con centro libre (custom marcada): hits=${card.hits} lines=${card.lineCount}`);

// 7. marcar todo → bingo
for (const c of card.grid) if (!c.free && !c.hit) await j(`/api/admin/predictions/${c.id}`, { method: 'POST', headers: { 'x-admin-token': TOKEN }, body: { happened: true } });
card = (await j(`/api/cards/${id}`)).data;
assert(card.bingo && card.hits === 8 && card.lineCount === 8, `bingo: hits=${card.hits} lines=${card.lineCount}`);

// 8. deshacer
await j(`/api/admin/predictions/${row1[0]}`, { method: 'POST', headers: { 'x-admin-token': TOKEN }, body: { happened: false } });
card = (await j(`/api/cards/${id}`)).data;
assert(!card.bingo && card.lineCount === 5 && card.hits === 7, `deshacer funciona: hits=${card.hits} lines=${card.lineCount}`);

// 9. segundo cartón sin aciertos, ranking
r = await j('/api/cards', { method: 'POST', body: { nickname: 'Fede', handle: 'fede', email: 'fede@example.com', picks: pool.slice(30, 38).map(p => p.id), custom: [] } });
assert(r.status === 201, 'segundo cartón');
const rank = (await j('/api/ranking')).data;
assert(rank.total === 2 && rank.cards[0].id === id && rank.cards[0].position === 1 && rank.cards[1].nickname === 'Fede', 'ranking ordena bien');

// 9b. feed con textos y sin email
const feed = (await j('/api/feed?limit=10')).data;
assert(feed.total === 2 && feed.cards[0].nickname === 'Fede' && feed.cards[0].grid.length === 9 && !('email' in feed.cards[0]), 'feed completo y sin email');

// 9c. OG upload: PNG mínimo válido, con hitState correcto e incorrecto
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const pad = Buffer.concat([png, Buffer.alloc(200)]);
let up = await fetch(BASE + `/api/cards/${id}/og`, { method: 'POST', headers: { 'content-type': 'image/png', 'x-hit-state': '11111111' }, body: pad });
assert(up.status === 409, 'OG con hitState viejo rechazado (409)');
const cur = (await j(`/api/cards/${id}`)).data.hitState;
up = await fetch(BASE + `/api/cards/${id}/og`, { method: 'POST', headers: { 'content-type': 'image/png', 'x-hit-state': cur }, body: pad });
const upd = await up.json();
assert(up.status === 200 && upd.ogState === cur && upd.url.includes(`/c/${id}/og.png?v=`), 'OG subida: ' + JSON.stringify(upd));
const ogr = await fetch(BASE + `/c/${id}/og.png`, { redirect: 'manual' });
assert(ogr.status === 200 && (ogr.headers.get('content-type') || '').includes('image/png'), 'OG servida');
const ogr2 = await fetch(BASE + `/c/noexiste/og.png`, { redirect: 'manual' });
assert(ogr2.status === 302, 'OG inexistente redirige al genérico');
up = await fetch(BASE + `/api/cards/${id}/og`, { method: 'POST', headers: { 'content-type': 'image/png', 'x-hit-state': cur }, body: Buffer.from('not a png at all, really not, padding padding padding padding padding padding padding padding padding') });
assert(up.status === 400, 'no-PNG rechazado');

// 9d. admin ve emails
const admc = (await j('/api/admin/cards', { headers: { 'x-admin-token': TOKEN } })).data;
assert(admc.find(c => c.id === id)?.email === 'nico@example.com', 'admin ve email normalizado');

// 10. happened público (sin custom)
const hap = (await j('/api/happened')).data;
assert(hap.every(h => !h.id.startsWith('c_')) && hap.length === 5, `happened público sin propias: ${hap.length}`);

// 11. página HTML con OG
const html = (await j(`/c/${id}`)).data;
assert(html.includes(`<title>El cartón de Nico Shuga`) && html.includes(`/c/${id}/og.png?v=`) && html.includes(`data-card-id="${id}"`), 'HTML del cartón con OG por cartón');
const nf = await j('/c/noexiste');
assert(nf.status === 404 && nf.data.includes('Cartón no encontrado'), '404 de cartón inexistente');

// 12. state
const st = (await j('/api/state')).data;
assert(st.counts.cards === 2 && st.counts.bingos === 0 && st.counts.lines === 1 && st.counts.happened === 7, `state: ${JSON.stringify(st.counts)}`);

// 13. admin list incluye custom con nickname
const adm = (await j('/api/admin/predictions', { headers: { 'x-admin-token': TOKEN } })).data;
const c0 = adm.find(p => p.custom);
assert(c0 && c0.cardNickname === 'Nico Shuga' && c0.cardCount === 1, 'admin ve custom con dueño');

// 14. agregar al pool
r = await j('/api/admin/predictions', { method: 'POST', headers: { 'x-admin-token': TOKEN }, body: { text: 'Prueba agregada', category: 'Test' } });
assert(r.status === 201 && r.data.id.startsWith('p_'), 'agregar al pool');

// 15. export
r = await j('/api/admin/export?token=' + TOKEN);
assert(r.status === 200 && r.data.cards.length === 2, 'export');

console.log('\nCARD_ID=' + id);

// Entrada local: levanta Express en un puerto. (En Vercel se usa api/index.js)
import { CONFIG } from './src/config.js';
import * as db from './src/db.js';
import app from './src/app.js';

const info = await db.init();
app.listen(CONFIG.port, () => {
  console.log('');
  console.log('  SLA BINGO TECH');
  console.log(`  → http://localhost:${CONFIG.port}`);
  console.log(`  → admin: http://localhost:${CONFIG.port}/admin  (token: ${CONFIG.usingDefaultToken ? 'sla-admin ← por defecto, cambialo en .env' : '***'})`);
  console.log(`  → cierre de cartones: ${CONFIG.deadline}${CONFIG.forceOpen ? '  (FORCE_OPEN=1, creación forzada abierta)' : ''}`);
  console.log(`  → storage: ${info.storage} · ${info.predictions} predicciones (${info.added} nuevas del seed), ${info.cards} cartones`);
  console.log('');
});

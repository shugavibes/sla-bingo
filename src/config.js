import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

// Mini loader de .env (sin dependencias). No pisa variables ya definidas en el entorno.
function loadDotEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadDotEnv();

const DEFAULT_TOKEN = 'sla-admin';
const adminToken = process.env.ADMIN_TOKEN || DEFAULT_TOKEN;
const isVercel = !!process.env.VERCEL;

export const CONFIG = {
  port: Number(process.env.PORT) || 3000,
  // URL pública fija (opcional). Si no está, se deduce de cada request (sirve para previews de Vercel).
  siteUrl: (process.env.SITE_URL || (isVercel ? '' : `http://localhost:${Number(process.env.PORT) || 3000}`)).replace(/\/+$/, ''),
  adminToken,
  usingDefaultToken: adminToken === DEFAULT_TOKEN,
  isVercel,
  // Redis (Upstash). Vercel inyecta KV_REST_API_*; Upstash directo usa UPSTASH_REDIS_REST_*.
  redisUrl: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '',
  redisToken: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '',
  redisPrefix: process.env.REDIS_PREFIX || 'bingo',
  deadline: process.env.DEADLINE || '2026-11-01T23:59:59-03:00',
  forceOpen: process.env.FORCE_OPEN === '1',
  dbPath: path.resolve(ROOT, process.env.DB_PATH || './data/db.json'),
  seedPath: path.join(ROOT, 'data', 'predictions.seed.json'),

  // Reglas del juego
  monthLabel: 'Noviembre 2026',
  monthShort: 'NOV 2026',
  gridCells: 9,           // 3x3
  picksRequired: 8,       // 8 casilleros + el del medio libre (SLA)
  maxCustom: 8,           // predicciones propias por cartón (puede llenar todo el cartón con las suyas)
  customMinLen: 6,
  customMaxLen: 80,
  nickMinLen: 2,
  nickMaxLen: 24,
  handleMaxLen: 30,

  // Rate limit de creación de cartones (por IP)
  rateLimitWindowMs: 60 * 60 * 1000,
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX) || 5,
};

/** URL pública del sitio: SITE_URL si está seteada, si no la del request. */
export function siteUrlFor(req) {
  if (CONFIG.siteUrl) return CONFIG.siteUrl;
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost';
  return `${proto}://${host}`;
}

export function deadlineDate() {
  return new Date(CONFIG.deadline);
}

export function isOpen(now = new Date()) {
  if (CONFIG.forceOpen) return true;
  return now.getTime() < deadlineDate().getTime();
}

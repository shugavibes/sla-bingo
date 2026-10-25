// Render del cartón a PNG (1080×1080) con Canvas, para descargar y compartir.
// Estética Game Boy: consola crudo con pantalla verde-negra, grilla 3×3, tipografías pixel.

import { FREE_INDEX, SIZE } from './bingo.js';
import { pxs } from './common.js';

const C = {
  bg: '#020c08',
  screen: '#06130d',
  green2: '#0f2a1c',
  green3: '#1d6b45',
  fg: '#eafff3',
  acid: '#39f688',
  ink: '#10120e',
  paper: '#e8e8dd',
  paperDark: '#4a4b42',
  muted: '#a4a799',
};
const PX = '"Press Start 2P", "Courier New", monospace';
const VT = '"VT323", "Courier New", monospace';

const sprites = {};
let logoImg = null;

function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function ensureAssets() {
  const loads = [];
  if (document.fonts?.load) {
    loads.push(document.fonts.load(`400 20px "Press Start 2P"`), document.fonts.load(`400 20px "VT323"`));
  }
  if (!logoImg) loads.push(loadImage('/img/sla-logo-px64.png').then(i => { logoImg = i; }));
  for (const name of ['check', 'star', 'trophy']) {
    if (!sprites[name]) loads.push(loadImage(`/img/px-${name}.svg`).then(i => { sprites[name] = i; }));
  }
  await Promise.race([Promise.all(loads), new Promise(r => setTimeout(r, 3000))]);
}

/** Dibuja una imagen monocroma (sprite/logo) teñida de `color`, escalada sin suavizado. */
function drawTinted(ctx, img, x, y, w, h, color) {
  if (!img) return;
  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.round(w)); off.height = Math.max(1, Math.round(h));
  const o = off.getContext('2d');
  o.imageSmoothingEnabled = false;
  o.drawImage(img, 0, 0, off.width, off.height);
  o.globalCompositeOperation = 'source-in';
  o.fillStyle = color;
  o.fillRect(0, 0, off.width, off.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, Math.round(x), Math.round(y));
}

/** Borde pixel: rectángulo con esquinas recortadas (como el CSS). */
function pxRect(ctx, x, y, w, h, b, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x + b, y, w - 2 * b, b);
  ctx.fillRect(x + b, y + h - b, w - 2 * b, b);
  ctx.fillRect(x, y + b, b, h - 2 * b);
  ctx.fillRect(x + w - b, y + b, b, h - 2 * b);
}

function scanlines(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let yy = y; yy < y + h; yy += 3) ctx.fillRect(x, yy, w, 1);
}

function wrap(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  lines.broke = false;
  let line = '';
  for (let w of words) {
    while (ctx.measureText(w).width > maxWidth) {
      lines.broke = true;
      let cut = w.length - 1;
      while (cut > 1 && ctx.measureText(w.slice(0, cut) + '-').width > maxWidth) cut--;
      if (line) { lines.push(line); line = ''; }
      lines.push(w.slice(0, cut) + '-');
      w = w.slice(cut);
    }
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth) line = test;
    else { if (line) lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

function fitTextBottomLeft(ctx, text, x, bottom, boxW, boxH, { maxSize = 34, minSize = 20, color = C.fg, family = VT } = {}) {
  let size = maxSize, lines, lh;
  for (;;) {
    ctx.font = `400 ${size}px ${family}`;
    lines = wrap(ctx, text, boxW);
    lh = size * 1.02;
    if ((lines.length * lh <= boxH && !lines.broke) || size <= minSize) {
      const maxLines = Math.max(1, Math.floor(boxH / lh));
      if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        let last = lines[maxLines - 1];
        while (last.length > 1 && ctx.measureText(last + '…').width > boxW) last = last.slice(0, -1);
        lines[maxLines - 1] = last + '…';
      }
      break;
    }
    size -= 1;
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const startY = bottom - (lines.length - 1) * lh;
  lines.forEach((ln, i) => ctx.fillText(ln, x, startY + i * lh));
}

/** Dibuja la consola (crudo + pantalla + grilla) con ancho `cw` en (cx, cy). Devuelve la altura. */
function drawConsole(ctx, card, cx, cy, cw) {
  const b = 4;
  const sw = cw - 40, sh = sw;
  const ch = 44 + sh + 36;
  ctx.fillStyle = C.paper;
  ctx.fillRect(cx, cy, cw, ch);
  pxRect(ctx, cx - b, cy - b, cw + 2 * b, ch + 2 * b, b, C.ink);

  // bezel superior
  ctx.font = `400 10px ${PX}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = C.acid;
  ctx.fillRect(cx + 20, cy + 18, 8, 8);
  ctx.fillStyle = C.ink;
  ctx.fillText('SLA BINGO TECH', cx + 38, cy + 17);
  ctx.textAlign = 'right';
  ctx.fillText(pxs((card.handle ? `@${card.handle}` : card.nickname || '').toUpperCase()).slice(0, 24), cx + cw - 20, cy + 17);

  // pantalla
  const sx = cx + 20, sy = cy + 44;
  ctx.fillStyle = C.screen;
  ctx.fillRect(sx, sy, sw, sh);
  pxRect(ctx, sx - 3, sy - 3, sw + 6, sh + 6, 3, C.paperDark);

  // grilla 3×3
  const pad = 12, gap = 3;
  const gx = sx + pad, gy = sy + pad, gw = sw - 2 * pad;
  const cell = (gw - gap * (SIZE - 1)) / SIZE;
  const lineCells = new Set(card.lineCells || []);
  ctx.fillStyle = C.green2;
  ctx.fillRect(gx, gy, gw, gw);
  const k = cell / 230; // factor de escala respecto del tamaño "grande"

  let n = 0;
  card.grid.forEach((c, i) => {
    const r = Math.floor(i / SIZE), col = i % SIZE;
    const x = Math.round(gx + col * (cell + gap)), y = Math.round(gy + r * (cell + gap));
    const cw2 = Math.round(cell);
    const free = i === FREE_INDEX;
    const hit = !!c.hit;

    ctx.fillStyle = free ? C.paper : hit ? C.acid : C.screen;
    ctx.fillRect(x, y, cw2, cw2);

    if (free) {
      if (logoImg) {
        const lw = Math.round(cw2 * 0.64), lh = Math.round(lw * (logoImg.height / logoImg.width));
        drawTinted(ctx, logoImg, x + (cw2 - lw) / 2, y + (cw2 - lh) / 2, lw, lh, C.ink);
      }
      return;
    }
    n++;

    if (c.custom) {
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = hit ? 'rgba(16,18,14,.45)' : C.muted;
      ctx.strokeRect(x + 7, y + 7, cw2 - 14, cw2 - 14);
      ctx.restore();
    }
    if (lineCells.has(i)) pxRect(ctx, x, y, cw2, cw2, Math.max(3, Math.round(4 * k)), C.fg);

    const p = Math.round(16 * k);
    ctx.font = `400 ${Math.max(7, Math.round(10 * k))}px ${PX}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = hit ? 'rgba(16,18,14,.6)' : C.muted;
    ctx.fillText(String(n).padStart(2, '0'), x + p, y + p);
    if (hit) { const cs = Math.round(16 * k); drawTinted(ctx, sprites.check, x + cw2 - p - cs, y + p - 1, cs, cs, C.ink); }

    fitTextBottomLeft(ctx, c.text, x + p, y + cw2 - Math.round(18 * k), cw2 - 2 * p, cw2 - Math.round(60 * k), {
      color: hit ? C.ink : C.fg, maxSize: Math.round(34 * k), minSize: Math.max(13, Math.round(20 * k)),
    });
  });

  scanlines(ctx, sx, sy, sw, sh);

  // bezel inferior
  ctx.font = `400 9px ${PX}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = C.paperDark;
  ctx.fillText('DOT MATRIX · 3×3', cx + 20, cy + ch - 16);
  ctx.textAlign = 'right';
  ctx.fillText(`${card.hits}/${card.total} · ${card.lineCount} ${card.lineCount === 1 ? 'LINEA' : 'LINEAS'}`, cx + cw - 20, cy + ch - 16);
  return ch;
}

function drawBackground(ctx, W, H) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  for (let y = 0; y < H; y += 6) for (let x = 0; x < W; x += 6) ctx.fillRect(x, y, 1, 1);
}

function drawBadge(ctx, card, rightX, y, { alignLeft = false } = {}) {
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  if (card.bingo || card.line) {
    const label = card.bingo ? '¡BINGO!' : '¡LINEA!';
    ctx.font = `400 22px ${PX}`;
    const tw = ctx.measureText(label).width + 36 + 30;
    if (alignLeft) rightX = rightX + tw;
    const bx = rightX - tw, bh = 52;
    ctx.fillStyle = card.bingo ? C.green3 : C.paperDark;
    ctx.fillRect(bx + 4, y + 4, tw, bh);
    ctx.fillStyle = card.bingo ? C.acid : C.paper;
    ctx.fillRect(bx, y, tw, bh);
    drawTinted(ctx, sprites[card.bingo ? 'trophy' : 'star'], bx + 16, y + 14, 24, 24, C.ink);
    ctx.fillStyle = C.ink;
    ctx.fillText(label, rightX - 18, y + 36);
    return true;
  }
  return false;
}

/**
 * Cuadrada 1080×1080 (descarga / Instagram).
 * @param {HTMLCanvasElement} canvas
 * @param {object} card - respuesta de /api/cards/:id
 * @param {string} url  - link del cartón
 */
export async function renderCardPng(canvas, card, url) {
  await ensureAssets();
  const W = 1080, H = 1080, M = 160;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  drawBackground(ctx, W, H);

  if (logoImg) {
    const lh = 38, lw = lh * (logoImg.width / logoImg.height);
    drawTinted(ctx, logoImg, M, 58, lw, lh, C.fg);
  }
  ctx.font = `400 13px ${PX}`;
  ctx.fillStyle = C.fg;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('#BINGOSLA / NOV 2026', W - M, 70);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `400 26px ${PX}`;
  let who = pxs((card.nickname || '').toUpperCase());
  while (ctx.measureText(who).width > 430 && who.length > 3) who = who.slice(0, -2) + '…';
  ctx.fillStyle = C.green2;
  ctx.fillText(who, M + 3, 157);
  ctx.fillStyle = C.fg;
  ctx.fillText(who, M, 154);
  if (card.handle) {
    ctx.font = `400 11px ${PX}`;
    ctx.fillStyle = C.muted;
    ctx.fillText(`@${card.handle}`.toUpperCase(), M, 186);
  }
  if (!drawBadge(ctx, card, W - M, 126)) {
    ctx.font = `400 12px ${PX}`;
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'right';
    ctx.fillText(`${card.hits}/${card.total} ACERTADAS`, W - M, 156);
  }

  const ch = drawConsole(ctx, card, M, 214, W - 2 * M);

  const fy = 214 + ch + 40;
  ctx.font = `400 11px ${PX}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = C.fg;
  ctx.fillText(pxs(url.replace(/^https?:\/\//, '').toUpperCase()), M, fy);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.muted;
  ctx.fillText('SLATV.LIVE', W - M, fy);
  return canvas;
}

/**
 * Apaisada 1200×630 (preview del link en X / WhatsApp).
 */
export async function renderCardOg(canvas, card, url) {
  await ensureAssets();
  const W = 1200, H = 630, M = 56;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  drawBackground(ctx, W, H);

  const cw = 520;
  const cx = W - M - cw, cy = 40;
  drawConsole(ctx, card, cx, cy, cw);

  // columna izquierda
  const colW = cx - M - 40;
  if (logoImg) {
    const lh = 38, lw = lh * (logoImg.width / logoImg.height);
    drawTinted(ctx, logoImg, M, 48, lw, lh, C.fg);
  }
  ctx.font = `400 12px ${PX}`;
  ctx.fillStyle = C.acid;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('#BINGOSLA / NOV 2026', M, 104);
  ctx.fillStyle = C.green2;
  ctx.fillRect(M, 134, colW, 3);

  ctx.font = `400 13px ${PX}`;
  ctx.fillStyle = C.muted;
  ctx.fillText('EL CARTON DE', M, 170);

  ctx.textBaseline = 'alphabetic';
  let size = 34;
  let who = pxs((card.nickname || '').toUpperCase());
  ctx.font = `400 ${size}px ${PX}`;
  while (ctx.measureText(who).width > colW && size > 18) { size -= 2; ctx.font = `400 ${size}px ${PX}`; }
  while (ctx.measureText(who).width > colW && who.length > 3) who = who.slice(0, -2) + '…';
  ctx.fillStyle = C.green2;
  ctx.fillText(who, M + 4, 240);
  ctx.fillStyle = C.fg;
  ctx.fillText(who, M, 236);
  if (card.handle) {
    ctx.font = `400 13px ${PX}`;
    ctx.fillStyle = C.muted;
    ctx.fillText(`@${card.handle}`.toUpperCase(), M, 272);
  }

  // puntaje
  ctx.font = `400 44px ${PX}`;
  ctx.fillStyle = C.green3;
  ctx.fillText(`${card.hits}/${card.total}`, M + 4, 364);
  ctx.fillStyle = C.acid;
  ctx.fillText(`${card.hits}/${card.total}`, M, 360);
  ctx.font = `400 11px ${PX}`;
  ctx.fillStyle = C.muted;
  ctx.fillText(`ACERTADAS · ${card.lineCount} ${card.lineCount === 1 ? 'LINEA' : 'LINEAS'}`, M, 392);

  if (!drawBadge(ctx, card, M, 430, { alignLeft: true })) {
    ctx.textAlign = 'left';
    ctx.font = `400 11px ${PX}`;
    ctx.fillStyle = C.acid;
    ctx.fillText('> 8 COSAS QUE VAN A PASAR', M, 460);
    ctx.fillText('  EN TECH EN NOVIEMBRE', M, 482);
  }

  ctx.textAlign = 'left';
  ctx.font = `400 11px ${PX}`;
  ctx.fillStyle = C.fg;
  ctx.fillText(pxs(url.replace(/^https?:\/\//, '').toUpperCase()), M, H - 60);
  ctx.fillStyle = C.muted;
  ctx.fillText('SLATV.LIVE', M, H - 36);
  return canvas;
}

export function canvasToBlob(canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

export function downloadCanvas(canvas, filename) {
  canvas.toBlob(blob => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }, 'image/png');
}

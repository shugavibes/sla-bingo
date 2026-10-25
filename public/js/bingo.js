// Lógica compartida del bingo (la usan el server y el navegador).
// Grilla 3×3: 8 predicciones + el casillero del medio libre (SLA), que siempre cuenta como marcado.

export const SIZE = 3;
export const CELLS = SIZE * SIZE;              // 9
export const FREE_INDEX = Math.floor(CELLS / 2); // 4 (centro)
export const PICKS = CELLS - 1;                // 8

const range = n => Array.from({ length: n }, (_, i) => i);

// Líneas posibles: filas, columnas y las dos diagonales.
export const LINES = (() => {
  const lines = [];
  for (let r = 0; r < SIZE; r++) lines.push({ type: 'fila', n: r + 1, cells: range(SIZE).map(c => r * SIZE + c) });
  for (let c = 0; c < SIZE; c++) lines.push({ type: 'columna', n: c + 1, cells: range(SIZE).map(r => r * SIZE + c) });
  lines.push({ type: 'diagonal', n: 1, cells: range(SIZE).map(i => i * SIZE + i) });
  lines.push({ type: 'diagonal', n: 2, cells: range(SIZE).map(i => i * SIZE + (SIZE - 1 - i)) });
  return lines;
})();

/**
 * Convierte la lista de 8 predicciones en una grilla de 9 celdas (centro = null).
 */
export function toGrid(picks) {
  const grid = [];
  let p = 0;
  for (let i = 0; i < CELLS; i++) {
    if (i === FREE_INDEX) grid.push(null);
    else grid.push(picks[p++] ?? null);
  }
  return grid;
}

/**
 * Evalúa una grilla de 9 booleanos (true = marcado). El centro se fuerza a true.
 * - `line`: al menos una línea completa (3 en fila/columna/diagonal, el centro cuenta).
 * - `bingo`: cartón lleno (las 8 predicciones pasaron).
 */
export function evaluate(marks) {
  const m = marks.slice(0, CELLS);
  while (m.length < CELLS) m.push(false);
  m[FREE_INDEX] = true;

  const completed = LINES.filter(line => line.cells.every(i => m[i]));
  const hits = m.filter((v, i) => v && i !== FREE_INDEX).length;
  const lineCells = new Set(completed.flatMap(l => l.cells));

  return {
    hits,
    total: PICKS,
    lines: completed.map(l => ({ type: l.type, n: l.n, cells: l.cells })),
    lineCount: completed.length,
    line: completed.length > 0,
    bingo: hits === PICKS,
    lineCells: [...lineCells],
  };
}

/** Mezcla (Fisher–Yates) sin mutar el original. */
export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

# SLA Bingo Tech — Noviembre 2026

Cartón de bingo con predicciones de lo que va a pasar en el mundo tech durante noviembre.
Cada persona arma su cartón 3×3 (8 predicciones + el centro SLA libre) con su nombre, su @ de X (visible) y su email
(privado, solo para contactar ganadores). Queda **sellado e inmutable** con un link único, aparece en el feed de la home
(3 por fila), se puede descargar como imagen (1080×1080) y compartir en X con el texto
"En mi #BingoSLA puse estos 8 acontecimientos para noviembre" + link. Cuando algo pasa, desde el admin se marca y se
tilda automáticamente en todos los cartones que lo tengan.

**Preview del link con el cartón**: cuando alguien abre su cartón, el navegador genera una imagen 1200×630 del cartón
(canvas) y la sube al server (`POST /api/cards/:id/og`); el server la guarda (archivo en local, Redis en Vercel) y la usa
como `og:image` / `twitter:image` de `/c/:id`. Se regenera sola cuando cambian los aciertos. Si todavía no existe, se usa el
`og.png` genérico. Nota: X cachea las previews; si un link ya se compartió antes de tener imagen, puede tardar en actualizar.

Diseño: paleta de [slatv.live](https://slatv.live) (fondo `#020c08`, texto `#eafff3`, verde ácido `#39f688`, crudo `#e8e8dd`)
llevada a estética Game Boy / arcade 8-bit: tipografías pixel **Press Start 2P** (títulos, etiquetas) y **VT323** (texto),
auto-hosteadas en `public/fonts/` (licencia OFL, sin depender de Google Fonts), bordes pixelados, scanlines, el cartón
adentro de una "consola", logo oficial vectorial en el header (`public/sla-logo.svg`) y pixelado en el cartón (`public/img/sla-logo-px64.png`).
Los sprites (`public/img/px-*.svg`) son SVGs de 8×8 coloreables con `mask`.

Nota: Press Start 2P dibuja las mayúsculas acentuadas achicadas, así que (como en los juegos de los 90) el sitio saca los
acentos automáticamente en todo lo que usa esa fuente (`installPixelText` en `public/js/common.js`). El texto en VT323 conserva acentos.

## Correr en local

```bash
cd sla-bingo
npm install
cp .env.example .env      # opcional, los defaults ya funcionan
npm start                 # → http://localhost:3000
```

- Sitio: http://localhost:3000
- Admin: http://localhost:3000/admin — token por defecto `sla-admin` (cambialo en `.env` → `ADMIN_TOKEN`)
- Para ver la home con datos de prueba: `npm run seed:dummy` (con el server apagado crea 12 cartones directo en la DB; con el server prendido crea hasta 5 por el rate limit).

`npm run dev` levanta el server con auto-reload al tocar archivos.

## Cómo marcar que algo pasó

**Opción A — panel web** (sirve desde el celular, también en producción): `/admin`, pegás el token, tocás **Pasó ✓** en la predicción. Se puede deshacer.

**Opción B — CLI desde la terminal del proyecto:**

```bash
npm run admin                       # modo interactivo
npm run admin -- list               # lista todo con cuántos cartones tiene cada una
npm run admin -- buscar gta         # busca por texto
npm run admin -- paso p070          # marca "GTA VI sale el 19 de noviembre" → se tilda en todos los cartones
npm run admin -- deshacer p070
npm run admin -- add "Texto nuevo" "Categoría"
npm run admin -- borrar nza972g     # borra un cartón (moderación: spam, trolls)
npm run admin -- export             # backup JSON en data/
```

El CLI habla por HTTP, así que contra producción es `BASE_URL=https://tu-dominio ADMIN_TOKEN=xxx npm run admin -- paso p070`.

Las predicciones **propias** que escriben los usuarios aparecen en el admin con el filtro "Propias de usuarios" y se marcan igual (afectan solo a ese cartón).

## Reglas del juego

- Cierre de cartones: **1 de noviembre 23:59 (ART)**. Configurable en `.env` → `DEADLINE`. Después de eso `/crear` queda cerrado y solo se juega.
- 8 predicciones por cartón: propias (hasta 8, lo protagónico) y/o del pool (`data/predictions.seed.json`).
- Centro libre (SLA). **Línea** = 3 en fila, columna o diagonal (el centro cuenta). **Bingo** = las 8 acertadas.
- Ranking: aciertos → líneas → quién selló antes.
- Rate limit: 5 cartones por hora por IP (`RATE_LIMIT_MAX`).
- Para probar después de la fecha: `FORCE_OPEN=1 npm start`.

## Editar las predicciones del pool

Editá `data/predictions.seed.json` y reiniciá el server: las nuevas se agregan, los textos cambiados se actualizan
(por `id`), y lo que ya está marcado como "pasó" no se pierde. **No borres ids** que ya estén en cartones sellados.
También podés agregar desde el admin (web o CLI).

## Tests

```bash
PORT=3123 RATE_LIMIT_MAX=100 npm start   # en una terminal
npm test                                  # en otra: 39 checks de la API (crear, validar, marcar, ranking, feed, OG, admin)
```

## Estructura

```
server.js                 entrada local (levanta Express en un puerto)
api/index.js              entrada para Vercel (exporta la app)
src/app.js                la app de Express: API + páginas (con OG tags por cartón)
src/config.js             config y .env
src/db.js                 datos: archivo JSON en local / Redis (Upstash) en Vercel, con snapshot en memoria
data/predictions.seed.json  pool de predicciones
public/                   frontend estático (sin build)
  index.html / crear.html / carton.html / ranking.html / admin.html
  js/bingo.js             lógica compartida (grilla, líneas) — la usan server y navegador
  js/render.js            genera el PNG 1080×1080 con canvas (estilo consola)
  css/style.css           estilos (paleta slatv.live + estética 8-bit)
  fonts/                  Press Start 2P y VT323 (woff2, OFL)
  img/                    sprites pixel (svg) y logo pixelado (png)
  sla-logo.svg            logo oficial
  og.png                  imagen para previews en X/WhatsApp
scripts/admin.js          CLI de admin
scripts/seed-dummy.js     cartones de prueba
scripts/test-api.mjs      tests de la API
vercel.json               config de Vercel (estáticos desde public/, todo lo demás a api/index.js)
```

## Deploy en Vercel

Vercel es serverless (sin disco), así que en producción los datos y las imágenes de preview van a **Redis (Upstash)**,
que se agrega desde el propio panel de Vercel. En local se sigue usando el archivo `data/db.json`.

1. **GitHub**: subí este repo (ver más abajo).
2. **Vercel → Add New → Project → importá el repo**. Framework: *Other*. No hace falta build command ni output dir. Deploy.
3. **Redis**: en el proyecto → pestaña **Storage** → **Create Database** → **Upstash** (Redis) → plan Free → *Connect to project*
   (ambiente Production + Preview). Eso inyecta solo `KV_REST_API_URL` y `KV_REST_API_TOKEN`.
4. **Variables**: en **Settings → Environment Variables** agregá:
   - `ADMIN_TOKEN` = algo largo y secreto (es la clave del panel `/admin`).
   - `SITE_URL` = tu dominio final, ej `https://bingo.slatv.live` (opcional: si no está, se deduce de cada request).
   - `DEADLINE` solo si querés cambiar el cierre (`2026-11-01T23:59:59-03:00` por defecto).
5. **Redeploy** (Deployments → ⋯ → Redeploy) para que tome las variables. Listo.
6. Dominio: **Settings → Domains** → agregá `bingo.slatv.live` (o el que quieras) y creá el CNAME que te indica.

Comprobación rápida: `https://tu-dominio/api/state` tiene que decir `"storage":"redis"`. Si dice `"memory"`, falta conectar Upstash.

Para marcar cosas en producción desde tu terminal: `BASE_URL=https://tu-dominio ADMIN_TOKEN=xxx npm run admin -- paso p070`
(o directamente desde `/admin` en el celular). Backup: `BASE_URL=... ADMIN_TOKEN=... npm run admin -- export`.

Cada push a `main` redeploya solo. Los pushes a otras ramas crean previews con su propia URL (y comparten el mismo Redis,
así que si querés separar datos de preview, seteá `REDIS_PREFIX=preview` en el ambiente Preview).

### Otros hostings

También corre como server Node común (`npm start`) en Railway, Fly, Render o un VPS: ahí no hace falta Redis, con un
volumen persistente montado en `data/` alcanza (`DB_PATH` apunta al archivo; `data/og/` guarda las previews).

El `og.png` es la imagen genérica que aparece al compartir la home (1200×630).

## API

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/state` | estado general (deadline, abierto/cerrado, conteos) |
| GET | `/api/predictions` | pool de predicciones |
| GET | `/api/cards?limit=&offset=` | últimos cartones |
| GET | `/api/cards/:id` | cartón completo con grilla, aciertos y líneas |
| GET | `/api/ranking` | ranking |
| GET | `/api/happened` | lo que ya pasó |
| GET | `/api/feed?limit=&offset=` | cartones completos (con textos) para el feed, sin email |
| POST | `/api/cards` | crear cartón `{nickname, handle, email, picks[], custom[], order?[]}` |
| POST | `/api/cards/:id/og` | subir la imagen de preview (PNG, header `x-hit-state`) |
| GET | `/c/:id/og.png` | imagen de preview del cartón (o redirige al genérico) |
| GET | `/api/admin/cards` | (admin) cartones con email, en orden de ranking |
| DELETE | `/api/admin/cards/:id` | (admin) borrar un cartón (moderación) |
| GET | `/api/admin/predictions` | (admin) todas las predicciones con conteo de cartones |
| POST | `/api/admin/predictions/:id` | (admin) `{happened: true/false}` o `{text}` |
| POST | `/api/admin/predictions` | (admin) agregar al pool |
| GET | `/api/admin/export` | (admin) backup JSON |

Admin: header `x-admin-token`, `Authorization: Bearer`, o `?token=`.

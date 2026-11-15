---
name: iptv-supreme-repos-4k
description: Catálogo completo y MEDIDO de los 11 repositorios supremos IPTV 4K (agregadores, validadores, proxies, EPG) con estrellas declaradas frente a medidas, endpoints sondeados con su código HTTP real, la distribución real de calidad de iptv-org (20 streams 2160p de 18.689), el stack recomendado revisado y el esquema JSON declarado. Úsala cuando se pregunte por repos IPTV/4K, qué agregador usar, de dónde sacar 4K real, cuántas estrellas tiene un repo IPTV, o antes de recomendar copiar cualquier URL de playlist 4K.
---

# Repos supremos IPTV 4K — declarado frente a medido

## Por qué existe esta skill

Un catálogo de 11 repos "supremos" para IPTV 4K circula con estrellas, URLs de
playlist y un pipeline de 4 pasos. Es útil como **mapa** y peligroso como **dato**:
al medirlo el 2026-11-15 contra la API de GitHub y contra cada endpoint real,

- **las 4 URLs** que el catálogo da como endpoint devolvieron **HTTP 404**,
- **4 de 11 repos** tenían estrellas insostenibles (41, 0, 2 y 0 frente a
  declaraciones de 1.5K+, 500+, 300+ y 600+),
- **otros estaban infravalorados** (Guovin: declarado 3.5K+, medido 26.130),
- la "fuente 4K" del rey del catálogo (`categories/4k.m3u`) **no existe**, y su
  inventario real de 2160p son **20 streams**.

Esta skill conserva el 100 % del catálogo original **y** la segunda columna. La
regla es una: **nunca presentes una cifra del catálogo como medición**.

## Contrato de lectura

| Marca | Significado |
|---|---|
| **Declarado** | Lo que afirma el catálogo del owner. Se conserva, no se borra. |
| **Medido** | `GET https://api.github.com/repos/{owner}/{repo}` y `GET` directo al endpoint, el `2026-11-15T06:45Z` (`01:45` America/Bogota). |
| **No medido** | Casilla vacía con nombre. **No es un cero.** |

Una cifra sin fecha y sin fuente no es una medición: es una cita.

## Tabla maestra (medida 2026-11-15)

| # | repo | declarado | medido | delta | lenguaje | licencia | último push | veredicto |
|---|---|---|---|---|---|---|---|---|
| 1 | `iptv-org/iptv` | 82K+ | **144.053** | ×1,76 | TypeScript | Unlicense | 2026-11-15 | OK + 4K inexistente |
| 2 | `dearbulut/iptv` | 1.5K+ | **41** | ÷37 | TypeScript | MIT | 2026-11-15 | inflado + endpoints movidos |
| 3 | `Guovin/iptv-api` | 3.5K+ | **26.130** | ×7,47 | Python | AGPL-3.0* | 2026-10-14 | OK, copyleft fuerte |
| 4 | `freearhey/iptv-checker` | 800+ | **632** | ×0,79 | JavaScript | MIT | 2026-03-06 | dormido 8 meses |
| 5 | `shadialhasan/iptv-m3u-validator` | 500+ | **0** | — | Python | MIT | 2026-10-01 | no sostenido |
| 6 | `Dispatcharr/Dispatcharr` | 1.2K+ | **4.514** | ×3,76 | Python | AGPL-3.0 | 2026-11-14 | OK + copyleft |
| 7 | `euzu/tuliprox` | 800+ | **595** | ×0,74 | Rust | MIT | 2026-11-14 | OK |
| 8 | `kpirnie/kptv-proxy` | 400+ | **101** | ÷3,96 | Go | MIT* | 2026-11-10 | inflado ×4 |
| 9 | `iptv-org/epg` | 2K+ | **3.510** | ×1,76 | HTML | Unlicense | 2026-11-15 | OK |
| 10 | `alperokur/xtream-api-proxy-epg` | 300+ | **2** | ÷150 | JavaScript | MIT | 2025-07-26 | no sostenido + abandonado |
| 11 | `Drone9988/IPTV` | 600+ | **0** | — | Python | sin licencia | 2026-11-15 | no sostenido + sin licencia |

Suma declarada (suelo): **93.600**. Suma medida: **179.578**. Errar en ambas
direcciones significa que **ni el total sirve para ordenar**: hay que mirar fila
por fila.

`*` **El SPDX de la API no basta.** GitHub devuelve `NOASSERTION` para `Guovin` y
`kpirnie`, pero los archivos `LICENSE` reales dicen **AGPL-3.0** (26.574 bytes) y
**MIT** (1.871 bytes). Donde el SPDX y el archivo discrepan, gana el archivo: se
leyó el texto, no solo la etiqueta.

## Los 11, uno por uno

### 1. iptv-org/iptv — el rey real

```bash
git clone https://github.com/iptv-org/iptv.git
```

- **Declarado:** 30.000+ canales públicos; categorías `categories/4k.m3u` y
  `categories/8k.m3u`; playlists por país/idioma/categoría; auto-update diario por
  GitHub Actions; M3U8 estándar con `tvg-logo`, `tvg-name`, `group-title`.
- **Medido:** `index.m3u` → **11.502** `#EXTINF` (2,64 MB). `countries/us.m3u` →
  1.497. `categories/sports.m3u` → 525. `api/streams.json` → **18.689** objetos,
  14.712 con `quality`. `api/channels.json` → 31.843. `api/categories.json` → 30
  categorías y **ninguna es 4K**. Último push 2026-11-15T00:12:47Z.
- **Roto:** `categories/4k.m3u` → **404**; `categories/8k.m3u` → **404**.
- **Uso correcto:** el 4K se obtiene filtrando `api/streams.json` por
  `quality == "2160p"`. Ver skill `iptv-4k-pipeline-automation`.

### 2. dearbulut/iptv — API real, fama falsa

```bash
git clone https://github.com/dearbulut/iptv.git
```

- **Declarado:** 39.000+ canales con health checks; JSON API estática en
  `api/channels.json` y `api/4k.json`; EPG XMLTV mergeado; web player; check cada
  6 h.
- **Medido:** 41 estrellas (declarado 1.5K+), MIT, push del mismo día. La raíz
  `https://dearbulut.github.io/iptv/` responde **200** y enlaza a
  `api/v1/openapi.json` (**200**, OpenAPI 3.1.0). `api/v1/channels.json` →
  **200**, 26,6 MB.
- **Roto:** `api/channels.json` → **404**; `api/4k.json` → **404**. Las rutas
  declaradas están movidas bajo `/api/v1/`.
- **Uso correcto:** `/api/v1/` + OpenAPI; valorar por el dato servido, no por la
  fama declarada.

### 3. Guovin/iptv-api — el más grande que el catálogo ocultó

```bash
git clone https://github.com/Guovin/iptv-api.git
```

- **Declarado:** auto-scraper + validador + speed tester; salida M3U/TXT/API REST;
  IPv4/IPv6; Docker + Actions + GUI; filtrado por calidad (4K/HD/SD); canales
  custom por categoría.
- **Medido:** **26.130** estrellas y 7.732 forks, Python, push 2026-10-14.
- **Riesgo:** licencia **AGPL-3.0**. GitHub devuelve `NOASSERTION`, pero el
  `LICENSE` de 26,6 KB es la GNU Affero General Public License v3. Copyleft fuerte:
  si se expone como servicio de red, hay que publicar el fuente del derivado.

### 4. freearhey/iptv-checker — la sonda, dormida

```bash
git clone https://github.com/freearhey/iptv-checker.git
```

- **Declarado:** CLI Node; resolución real vs etiqueta (expone el "4K" falso);
  codecs H264/HEVC/AV1; latencia y buffer; salida JSON; API
  `new IPTVChecker().checkStream(url)` con `results.resolution.real`.
- **Medido:** 632 estrellas (declarado 800+), MIT, último push **2026-03-06**.
- **No verificado:** el flag `--resolution-check`, la API y el esquema de retorno
  son **declarados**; no se ejecutaron. No cites `results.resolution.real` como si
  lo hubieras visto.
- **Uso correcto:** como sonda puntual, asumiendo mantenimiento cero.

### 5. shadialhasan/iptv-m3u-validator — código sin señal

```bash
git clone https://github.com/shadialhasan/iptv-m3u-validator.git
```

- **Declarado:** enterprise-grade concurrente; multithreading para miles de
  streams; latency tracker por región; purga de canales muertos; export JSON.
- **Medido:** **0 estrellas, 0 forks**, Python, MIT, push 2026-10-01.
- **Veredicto:** existe, está vivo y no tiene señal comunitaria. Tratarlo como
  código sin auditar: si se usa, leerlo antes.

### 6. Dispatcharr/Dispatcharr — el proxy con UI

```bash
git clone https://github.com/Dispatcharr/Dispatcharr.git
```

- **Declarado:** Web UI moderna; proxy/relay; DVR con Comskip; EPG matching; M3U +
  Xtream Codes; catch-up/timeshift; VOD organizado.
- **Medido:** **4.514** estrellas, 353 forks, Python, push 2026-11-14.
- **Riesgo legal:** **AGPL-3.0**. Si se expone como servicio de red, la obligación
  de publicar el código aplica. Es una decisión legal, no un detalle de README.

### 7. euzu/tuliprox — Rust permisivo

```bash
git clone https://github.com/euzu/tuliprox.git
```

- **Declarado:** Rust de ultra rendimiento, gateway self-hosted; M3U, Xtream
  Codes, HDHomeRun, Plex, Emby, Jellyfin; filtrado, merging, scheduling, web
  delivery.
- **Medido:** **595** estrellas (declarado 800+), MIT, push 2026-11-14.

### 8. kpirnie/kptv-proxy — Go, inflado

```bash
git clone https://github.com/kpirnie/kptv-proxy.git
```

- **Declarado:** Go de alto rendimiento; agregación multi-fuente; deduplicación;
  failover; M3U8 unificado.
- **Medido:** **101** estrellas y 32 forks (declarado 400+), push 2026-11-10.
- **Licencia:** GitHub devuelve `NOASSERTION`; el `LICENSE` (1,9 KB) es **MIT**.
  Permisiva pese a la etiqueta del clasificador.

### 9. iptv-org/epg — el EPG sin fricción

```bash
git clone https://github.com/iptv-org/epg.git
```

- **Declarado:** guía para miles de canales; XMLTV + Schedules Direct; salida
  JSON + XML; match automático canal↔EPG.
- **Medido:** **3.510** estrellas (declarado 2K+), Unlicense, push del mismo día
  de la medición.
- **Nota:** GitHub lo clasifica como `HTML`; es su heurística, no una afirmación
  de que el proyecto sea un sitio estático.

### 10. alperokur/xtream-api-proxy-epg — abandonado

```bash
git clone https://github.com/alperokur/xtream-api-proxy-epg.git
```

- **Declarado:** proxy Xtream Codes con EPG custom; deploy en Vercel; metadata
  overrides; JSON API.
- **Medido:** **2** estrellas y 2 forks (declarado 300+), JavaScript, MIT, último
  push **2025-07-26** (16 meses). **Sin descripción** en GitHub.

### 11. Drone9988/IPTV — sin licencia

```bash
git clone https://github.com/Drone9988/IPTV.git
```

- **Declarado:** auto-tagging por calidad (1080p FHD / 720p HD / 4K UHD);
  playlist `fhd.m3u8`; update cada 6 h por Actions.
- **Medido:** **0** estrellas y 0 forks (declarado 600+), Python, **sin licencia**
  (`license: null`), push del mismo día → sí está activo.
- **Riesgo:** sin licencia **no hay permiso de redistribución por defecto**.

## El 4K real: 20 streams

`api/streams.json` de iptv-org: **18.689** streams, **14.712** declaran `quality`
(78,7 %).

| quality | streams |
|---|---|
| 1080p | 5.769 |
| 720p | 5.118 |
| 576p | 2.423 |
| 480p | 446 |
| 360p | 273 |
| 540p | 118 |
| 576i | 95 |
| 1080i | 59 |
| **2160p** | **20** |
| 8K | **0** |

Receta medida:

```bash
curl -s https://iptv-org.github.io/api/streams.json \
  | jq -r '.[] | select(.quality == "2160p") | "#EXTINF:-1," + .title + "\n" + .url' \
  > real-4k.m3u   # 20 entradas
```

**Prohibido** (ley `ANTI_DEGRADATION` + `Fake_4K_Detector` del repo): renombrar los
5.769 streams de 1080p como 4K. No es una mejora: es la degradación inversa. El 4K
se mantiene 4K; lo que se corrige es **la ruta**, no la etiqueta.

## Stack recomendado (revisado por medición)

| Rol | Repo | Por qué |
|---|---|---|
| Agregador base | `iptv-org/iptv` | 144.053★ y push del día. El 4K se filtra desde `api/streams.json`. |
| Health checks + API | `dearbulut/iptv` | Activo, API real en `/api/v1/`; 41★, no 1,5K+. |
| Automatización de filtrado | `Guovin/iptv-api` | 26.130★; AGPL-3.0 (SPDX dice NOASSERTION). |
| Sonda de resolución | `freearhey/iptv-checker` | Mide resolución real vs etiqueta; mantenimiento cero desde 2026-03-06. |
| Proxy con UI y DVR | `Dispatcharr/Dispatcharr` | 4.514★, activo; AGPL-3.0. |
| Proxy permisivo | `euzu/tuliprox` | 595★, MIT. |
| EPG | `iptv-org/epg` | 3.510★, Unlicense. |
| Descartar hasta nueva evidencia | `shadialhasan`, `alperokur`, `Drone9988`, `kptv-proxy` | 0, 2, 0 y 101 estrellas frente a declaraciones de 500/300/600/400. |

## Esquema JSON declarado (no producido)

```json
{
  "channels": [
    {
      "id": "cnn-4k-us",
      "name": "CNN UHD",
      "url": "https://example.com/cnn-4k.m3u8",
      "quality": { "label": "4K", "resolution": "3840x2160", "codec": "HEVC", "bitrate": "20000", "verified": true },
      "epg": { "id": "cnn.us", "url": "https://epg.example.com/cnn.xml" },
      "metadata": { "category": "News", "country": "US", "language": "eng", "logo": "https://logo.example.com/cnn.png" },
      "health": { "status": "online", "latency_ms": 45, "last_check": "2025-01-20T10:30:00Z" }
    }
  ]
}
```

`verified: true` y `health.status: "online"` son campos **prometidos por el
catálogo**, no mediciones. Un JSON de ejemplo con `verified: true` no verifica
nada: solo declara la forma de la salida deseada.

## Las 5 verdades duras

1. **4 de las 4 URLs** de endpoint del catálogo están en 404.
2. El "rey del 4K" sirve **20** streams 2160p, no 30.000 canales 4K.
3. **4 de 11 repos** tienen estrellas insostenibles; a otro el catálogo lo
   infravaloró ×7,5.
4. El total declarado (93,6 K) no mide nada: el error va en las dos direcciones.
5. Renombrar 1080p como 4K está prohibido por la ley anti-degradación del repo.

## Relación con otras skills

- `iptv-4k-source-truth-audit` — cómo re-medir estrellas, endpoints y calidad.
- `iptv-4k-pipeline-automation` — cómo construir la lista sin mentir.
- `iptv-m3u8-auditor`, `iptv-hls-validator` — auditoría de la lista resultante.
- `iptv-4layer-fallback-doctrine`, `iptv-exthttp-traps-checklist` — capa de headers.

## Límites honestos

- Las estrellas y los `pushed_at` **cambian**: re-medir antes de decidir.
- No se ejecutaron ni los health checks de `dearbulut`, ni el `--resolution-check`
  de `iptv-checker`, ni los pasos 2-4 del pipeline del catálogo.
- `generate-m3u.js`, el último paso del pipeline declarado, **no existe** en el
  catálogo: hay que escribirlo.
- Solo streams, listas y credenciales **autorizadas por el propietario**. Nada de
  evasión de proveedores, bypass de DRM ni robo de señal.

# references — iptv-supreme-repos-atlas

Fecha de lectura: **2026-11-15**. Todo lo de abajo se obtuvo de documentación
pública. **No se clonó ningún repositorio y no se instaló nada** (ni npm, ni pip,
ni contenedores).

## 1. Qué se leyó

| # | Fuente | Qué se leyó | Estado de la lectura |
|---|---|---|---|
| 1 | `iptv-org/iptv` — `README.md` | propósito, playlist principal, EPG, base de datos, API, cláusula legal, licencia | **HTTP 200**, leído completo |
| 2 | `iptv-org/iptv` — `PLAYLISTS.md` | 29 categorías con conteo, playlists por idioma (ISO 639-3), por país, subdivisión y ciudad | **HTTP 200**, leído (respuesta truncada por tamaño; el archivo completo se conservó en el volcado de la herramienta y se buscó en él) |
| 3 | `iptv-org/iptv` — `https://iptv-org.github.io/iptv/categories/4k.m3u` | existencia del endpoint | **HTTP 404 medido** |
| 4 | `iptv-org/iptv` — `https://iptv-org.github.io/iptv/categories/8k.m3u` | existencia del endpoint | **HTTP 404 medido** |
| 5 | `freearhey/iptv-checker` — `README.md` | CLI, API de módulo, forma del resultado, uso de `ffprobe`, códigos de error, licencia | **HTTP 200**, leído completo |
| 6 | `Guovin/iptv-api` — `README.md` | pipeline (scrape → validar → test de velocidad → playlist), parámetros `min_resolution` / `max_resolution` / `resolution_speed_map` / `sort_by`, salidas M3U/TXT/API, licencia | **HTTP 200**, leído completo |
| 7 | `Dispatcharr/Dispatcharr` — `README.md` | proxy/relay, DVR, EPG matching, salidas M3U/Xtream/HDHomeRun, failover automático, licencia | **HTTP 200**, leído completo |
| 8 | `euzu/tuliprox` — `README.md` | gateway Rust, reverse proxy/redirect, HLS compartido, grupos de failover, quality guards, probe FFprobe, etiquetado de calidad, endpoints `/healthcheck` `/ready` | **HTTP 200**, leído completo |
| 9 | `euzu/tuliprox` — `Cargo.toml` | versión 3.3.200, edición 2021, dependencias; **ausencia de clave `license`** en `[workspace.package]` | **HTTP 200**, leído |
| 10 | `dearbulut/iptv` — `README.md` | health scoring EWMA, exclusion de 403 del score, `retire_after_failures`, API JSON estática, CLI, licencia | **HTTP 200**, leído completo |

## 2. Qué NO se copió, y por qué

| Fuente | Licencia | Decisión |
|---|---|---|
| `iptv-org/iptv` | **CC0** (badge `LICENSE` en README) | No se copiaron playlists ni datos de canales. CC0 cubre los datos, no autoriza a importar canales de terceros al catálogo del operador (regla legal del repo: solo fuentes autorizadas) |
| `freearhey/iptv-checker` | **MIT** (declarada en README) | **Cero código.** No se copió el CLI, ni el modelo de resultados, ni la lista de códigos de error. Solo el concepto "ffprobe decide, no la etiqueta" |
| `Guovin/iptv-api` | **AGPL-3.0** (declarada en README) | **Cero código y cero configuración.** Copiar AGPL en un servicio de red forzaría a publicar el fuente del derivado. Se tomaron únicamente los **nombres y valores de umbral** como hecho documentado (`min_resolution 1280x720`, `max_resolution 3840x2160`, `resolution_speed_map 1280x720:0.2,1920x1080:0.5,3840x2160:1.0`) |
| `Dispatcharr` | **AGPL v3.0** (declarada en README) | **Cero código.** Solo el concepto de proxy/relay con failover |
| `euzu/tuliprox` | **NO VERIFICADA** — el README remite a `LICENSE` (no leído) y `Cargo.toml` **no declara** `license` | Tratamiento AGPL: **cero código, cero vocabulario de configuración**. Solo conceptos descritos en prosa |
| `dearbulut/iptv` | **MIT** (declarada en README) | **Cero código.** Se citan los valores `score_alpha 0.3` y `retire_after_failures 10` como hecho documentado, no como configuración copiada |

No se transcribió ninguna función, ningún esquema JSON, ninguna expresión regular,
ninguna clave de configuración operativa ni ningún fragmento de código de estos
proyectos.

## 3. Lo que NO se pudo verificar — declarado

| Afirmación | Estado | Razón |
|---|---|---|
| Número de estrellas de cada repo | **NO COMPUTADO** | No se consultó la API de GitHub. El encargo menciona cifras; no se adoptan como propias |
| `index.m3u`, `categories/*.m3u`, `countries/*.m3u` responden 200 | **NO COMPUTADO** | Citados por la documentación; no se sondeó cada endpoint |
| Endpoints de `dearbulut` (`/api/v1/*.json`, `/playlists/*.m3u`) | **NO COMPUTADO** | Citados en README; no sondeados |
| Instalación, ejecución o comportamiento en runtime de cualquiera de los 6 | **NO VERIFICADO** | Prohibido instalar; no se ejecutó nada |
| Contenido de los archivos `LICENSE` de los 6 repos | **NO VERIFICADO** | Solo se leyó la declaración de licencia dentro del README (y el `Cargo.toml` en tuliprox) |

## 4. Refutaciones medidas (esto sí es propio)

| Afirmación recibida | Medición | Veredicto |
|---|---|---|
| "iptv-org tiene categorías `4k.m3u` y `8k.m3u`" | `GET /iptv/categories/4k.m3u` → **404**; `GET /iptv/categories/8k.m3u` → **404**; `PLAYLISTS.md` → **0** coincidencias de `4k`/`8k`/`quality` | **FALSO**. La escalera de calidad P0–P5 no tiene equivalente upstream |

**Confirmación independiente:** las skills hermanas `iptv-supreme-repos-4k` e
`iptv-4k-pipeline-automation`, producidas en esta misma sesión por otros miembros del
equipo, llegaron al mismo veredicto y localizaron la vía correcta
(`api/streams.json` filtrado por `quality: 2160p`). Su medición (20 streams 2160p sobre
18.689) **no fue re-verificada aquí** y se cita como referencia cruzada, no como
evidencia propia.

## 5. Cómo se usó este material

Solo como **referencia conceptual citada**. El texto de esta skill se redactó
desde cero; las semánticas adaptadas (verificación por probe, health score,
dedupe, EPG no-match reportado, failover por error de upstream) ya existen en
este repo con implementación propia, y la skill apunta a ellas en lugar de
reimplementarlas.

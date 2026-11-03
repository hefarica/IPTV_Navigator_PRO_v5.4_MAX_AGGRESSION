# 07 · Patrones Lua/HLS de la comunidad — metadata sin freeze

**Tarea:** `t34` (REA 07) · **Tipo:** diseño/investigación · **Solo `docs/rea/`** · **Snapshot:** `git HEAD a8ff0e9`
**Autor:** `s6-nginx-lua` (S6) · **Fecha:** 2026-10-28 · **Cero ediciones en `_vps_stage/**`, listas, VPS o producción.**
**Regla de evidencia:** cada fila lleva URL (con su estado real de acceso) o `archivo:línea`. Lo que no se pudo abrir se declara `NOT_RUN` y **no se usa como prueba**. No se citan frases que no estén en el texto descargado.

## 0 · Fuentes y estado de acceso (medido en esta pasada)

| # | Fuente | HTTP | Qué se leyó de verdad | Estado |
|---|---|---|---|---|
| S1 | [leandromoreira/resty-bakery](https://github.com/leandromoreira/resty-bakery) | 200 | `README.md` completo (raw) + árbol git (`api.github.com/.../git/trees/master`) | **OK** |
| S2 | [videojs/v10 PR #2061](https://github.com/videojs/v10/pull/2061) | 200 | `.diff` completo (`patch-diff.githubusercontent.com/raw/videojs/v10/pull/2061.diff`) | **OK** |
| S3 | [ACM 10.1145/3652517](https://dl.acm.org/doi/pdf/10.1145/3652517) | **403** | nada (challenge de Cloudflare: «Just a moment...») | **NOT_RUN** |
| S4 | [lua-resty-m3u8 (LuaRocks)](https://luarocks.org/modules/hanada/lua-resty-m3u8) | 200 | ficha: versión `0.2-0`, 46 días, MIT, features | **OK** |
| S5 | [mpv #8334](https://github.com/mpv-player/mpv/issues/8334) | 200 | **solo el título** («Option to constrain HLS content by resolution»); cuerpo truncado por el shell de GitHub | **PARCIAL** |
| S6 | Doom9 «Transparent encodes of fake 4k blurays» · [hilo](https://forum.doom9.org/showthread.php?t=181686) · [«resolution at container level»](https://forum.doom9.org/showthread.php?t=176132) · [mpv #14804 RTX SR](https://github.com/mpv-player/mpv/discussions/14804) | — | **solo títulos indexados**, cuerpo no abierto | **NOT_RUN** (no se usan como prueba) |

**Consecuencia honesta:** §1-§4 se apoyan en S1, S2 y S4 (leídos) y en nuestro código (`archivo:línea`). S5 aporta **un** dato: que existe demanda de acotar HLS por resolución **en el player**. S3/S6 no sostienen ninguna afirmación de este documento.

## 1 · Patrones reales de reescritura de manifiestos en Lua

### 1.1 resty-bakery (S1): filtra rendiciones, **no** las mejora

Qué hace (según `README.md`): «Nginx+Lua library … to modify media manifests on-the-fly, like HLS and MPEG DASH … acts as a proxy between the frontend and your origin». Sus **dos únicos filtros** son por URI: `b(min,max)` (BANDWIDTH) y `fps(...)` (frame rate) — HLS **y** DASH.

| Qué **toca** | Qué **NO** toca | Por qué (del propio README) |
|---|---|---|
| La **lista de rendiciones** (elimina las que no pasan el filtro) | `RESOLUTION`, `CODECS`, `VIDEO-RANGE`, `BANDWIDTH` de una rendición | La motivación declarada es que «some devices can't play with a higher bitrate, multiple codecs, multiple frame rate» ⇒ **quitar**, no **declarar más** |

**Técnica de fase (lo valioso para nosotros), con su coste:**

| Detalle de resty-bakery (S1) | Por qué importa | Nuestro equivalente |
|---|---|---|
| `header_filter_by_lua_block { ngx.header.content_length = nil }` con el comentario de que es **obligatorio** cuando Lua cambia la longitud del cuerpo | Es la clase de bug del truncado | **Ya aplicado**: `_vps_stage/lua/ape_header.lua:22` (y el bug real medido en `:7-9`) |
| `rewrite_by_lua_block` + `ngx.req.set_uri()` para quitar el filtro de la URI, guardando el original en `set_by_lua_block $original_uri` | Necesita estado de la URI original porque la reescribe | Nuestro edge **no** usa rewrite de URI: pasa el origen por `/cdn/<host>/<ruta>` (`_vps_stage/nginx/meta-plane.conf:182-184`) |
| `body_filter_by_lua_block`: `ngx.arg[1] = modified_manifest; ngx.arg[2] = true` | El ejemplo del README asume **cuerpo en un solo chunk**; si llega partido, marcar EOF trunca | **No copiar**: nuestro patrón acumula hasta el EOF real (`_vps_stage/lua/ape_rebase_lib.lua` vía gateway; límite 4 MiB en `ape_rebase_lib.lua:22`) |
| Location `mmedia` «just to provide manifests **without** chunked encoding … some CTV that can't handle chunked transfer encoding» | Hay TVs que **no** digieren `Transfer-Encoding: chunked` | **Relevante y no resuelto**: al borrar `Content-Length` (`ape_header.lua:22`) nuestro manifiesto **sale chunked**. Ver P6 en §3 |

### 1.2 lua-resty-m3u8 (S4): parsear → modelo → serializar

Ficha verificada: *«HLS m3u8 playlist parser and serializer for OpenResty / LuaJIT»*, `0.2-0` (46 días), MIT, req. `lua >= 5.1`; soporta master y media, LL-HLS (`EXT-X-PART`, preload hints, rendition reports), SCTE-35/CUE, dateranges y content steering, y re-serializa con `model:dumps()`.

**Patrón**: en vez de regex línea a línea, se construye un **modelo** y se emite texto válido. Es la forma correcta de tocar atributos de `EXT-X-STREAM-INF` sin romper comas/orden. **Contra nosotros:** el VPS no tiene `luarocks` ni apt (documentado en `_vps_stage/nginx/meta-plane.conf:21-22`), así que hoy es **no aplicable** sin vendorizar el módulo (ver §2).

### 1.3 videojs/v10 `maxAutoResolution` (S2): el techo va en el **player**, no en el manifiesto

Del `.diff` leído, lo relevante y verificable:

- Es un **techo a la selección automática del ABR** (`autoLevelCapping`), explícitamente **no** un filtro: *«A ceiling on automatic selection, not a filter on what is available: renditions above it stay in `videoRenditions` and can still be selected by hand»*.
- Se compara **por área de píxeles**, no por altura: `resolutionToPixelArea = ceil(height*16/9)*height`, con el caso 480p (854×480) redondeado **hacia arriba a propósito** para no excluir la rendición estándar.
- Degradación declarada: si **todas** las rendiciones superan el techo, **reproduce la más pequeña** («playing something over-spec beats refusing to adapt»).
- Separa dos palancas que confundimos fácil: `playback.maxResolution` (servidor: **saca** rendiciones del manifiesto) vs `maxAutoResolution` (cliente: **acota** lo que el ABR elige). Texto del diff: *«The two are independent»*.

**Lectura para nuestro diseño:** el ecosistema resuelve «no quiero que suba a 4K» **acotando en el cliente** o **filtrando en el edge** — nunca **declarando** un 4K que los bytes no son. Nuestro `declare_auto` es la excepción declarada del propietario (§4), y por eso el marcador `src=`/`can8k=` es la pieza que la hace auditable.

## 2 · Tabla: técnica · fuente · efecto · riesgo de freeze · ¿aplicable a nuestro edge?

| Técnica | Repo/foro (URL o `archivo:línea`) | Efecto | Riesgo de freeze | ¿Aplicable? |
|---|---|---|---|---|
| **Filtrar rendiciones por BANDWIDTH** (`b(min,max)`) | [resty-bakery `README.md`](https://github.com/leandromoreira/resty-bakery) | Menos variantes; el ABR no puede subir a las caras | Bajo (quitar opciones no rompe decode); **sí** puede degradar imagen | **Condicional** — nosotros ya relajamos suelos (`ape_gateway.lua:449-450`, «sólo relaja»), pero **no filtramos** |
| **Filtrar por FRAME-RATE** (`fps(...)`) | idem | Excluye 60 fps en TVs de 30 Hz | Bajo | **Condicional** (matriz S9 por device) |
| **Limpiar `Content-Length` al reescribir cuerpo** | idem + `_vps_stage/lua/ape_header.lua:22` | Evita truncado | **Nulo si se hace; ALTO si se olvida** | **SÍ — ya hecho** |
| **`ngx.arg[2]=true` en el primer chunk** | [resty-bakery `README.md`](https://github.com/leandromoreira/resty-bakery) | Emite ya, sin esperar | **Alto** si el cuerpo llega partido (truncado) | **NO** — anti-patrón para nosotros |
| **Ruta no-chunked para CTV** | idem (location `mmedia`) | Manifiesto con longitud conocida | Bajo; **reduce** fallos en TVs viejas | **Condicional → P6** |
| **Parsear→modelo→serializar** | [lua-resty-m3u8](https://luarocks.org/modules/hanada/lua-resty-m3u8) | Ediciones de atributos seguras | Bajo (si el parser es fiel) | **NO hoy** (sin luarocks: `meta-plane.conf:21-22`); sí si se vendoriza |
| **Techo de resolución por área de píxeles** | [videojs/v10 #2061](https://github.com/videojs/v10/pull/2061) | Acota ABR sin ocultar | **Nulo** (decisión de selección) | **NO en el edge** (es config de player); condicional vía hint inerte |
| **Constreñir HLS por resolución (player)** | [mpv #8334](https://github.com/mpv-player/mpv/issues/8334) (solo título) | Demanda existente; no implementado según el título | Nulo | **No** desde Lua: lo decide el player |
| **Marcador de upscale declarado con `src=`/`can8k=`** | `_vps_stage/lua/ape_uhd.lua:101` (formato en `:14`) | Trazabilidad de la excepción de producto | **Nulo en decode** (tag de vendor, RFC 8216 §6.3.1) | **SÍ — ya implementado (t29/t32)** |

## 3 · Propuestas F0 sin coste (solo diseño; **no** se editó código)

| ID | Propuesta | Dónde iría | Gate medible propuesto |
|---|---|---|---|
| **P1** | Coherencia `BANDWIDTH`/`AVERAGE-BANDWIDTH` como **MARCA**, nunca rewrite: si `RESOLUTION` declarada exige más banda que la declarada, emitir `#EXT-X-APE-BW-COHERENT:0` y registrar | `ape_uhd.declare` (junto al marcador, `ape_uhd.lua:101`) | `guard` cuenta marcas `BW-COHERENT:0` por manifiesto y falla si aparecen sin log asociado; 0 rewrites de `BANDWIDTH` (grep del diff) |
| **P2** | `STABLE-VARIANT-ID` estable entre recargas (la resolución declarada cambia; el ID no) | `ape_rebase_lib` (attrs) | 2 recargas del mismo manifiesto ⇒ mismo ID; 0 yoyo medido en cliente (S9) |
| **P3** | `FRAME-RATE` coherente y **capado**: `#EXT-X-APE-PRESENTATION-TARGET:…,FRAME-RATE=N,HONEST=1` | **Ya existe**: `ape_rebase_lib.lua:161` | `N ≤ 60` y `N ==` fps declarado por la fuente; assert en `/_ape/luatest` |
| **P4** | Marcador `APE-UPSCALE` con `src=` y `can8k=` (excepción de producto AU-01) | **Ya implementado**: `ape_uhd.lua:101`; guarda aplicada en `ape_gateway.lua:276-289` | `guard` UHD-04 (marca única y coherente) + `can8k` presente en el 100 % de los 8K declarados |
| **P5** | Hints de ABR **sólo a la baja**: `min_bandwidth`/`adaptive-minbitrate` nunca por encima del suelo de diseño | `ape_gateway.lua:449-450` (invariante existente) | `fuse_bps ≤ design_bps` en todas las respuestas; assert del fusible |
| **P6** | **Ruta no-chunked opcional** para CTV (aprendida de resty-bakery `mmedia`): servir el manifiesto con longitud conocida cuando el cliente lo pida | `ape_header.lua`/`meta-plane.conf` (futuro) | Matriz S9: N players × chunked/no-chunked, 0 fallos de parseo en TiviMate/OTT; medir antes/después |

**Coste:** todas son regex/`gsub` sobre un cuerpo ≤ **4 MiB** (`ape_rebase_lib.lua:22`), dentro del coste ya medido del handler (Δ TTFB−upstream ≈ 31-51 ms en `docs/edge/BASELINE.md:215`). Ninguna abre sockets ni bloquea.

## 4 · Anti-patrones que producen freeze — y qué check los caza

| Anti-patrón | Por qué congela / rompe | Check del guard (`_vps_stage/edge/uhd/uhd_doctrine_guard.mjs`) |
|---|---|---|
| Declarar **8K sobre bytes 1080p** sin marcador | Nivel/resolución imposible para el decoder (Ley Cardinal 1) | **UHD-03** (`:68`, blocker) + **UHD-10** (`:75`, latent: 8K con top < 3840) |
| Declarar **8K con `L153`** | `L153` = techo 4K@60 (familia del freeze 2026-06-08) | **UHD-09** (`:74`, blocker) + **UHD-11** (`:76`, latent) |
| **Tocar `CODECS`** | Inicializa un decoder para otro bitstream (FZ-01) | **UHD-01** (`:66`, blocker) |
| Cruzar **`hvc1`/`hev1`** en `EXT-X-STREAM-INF` | GOLDEN RULE; además `hev1` no es lo que el player espera ahí | **UHD-02** (`:67`, blocker) |
| **Inflar `BANDWIDTH`** | El ABR **salta** la variante y cae a la más baja (efecto yoyo), o descarta por encima de la red | No hay check directo hoy ⇒ lo cubriría **P1** (marca, no rewrite) |
| **PQ duplicado o inventado** | Hints contradictorios de rango | **UHD-05** (`:70`, high) + **UHD-12** (`:77`) |
| **Reempaquetar** (`EXT-X-MAP`/`.m4s`/`PART` inventados) | El contenedor no es el que se declara → fallo de demux | **UHD-06** (`:71`, blocker) |
| **Marcador ausente o duplicado** con upscale declarado | Se pierde la trazabilidad de la excepción de producto | **UHD-04** (`:69`, high) |
| **ABR yoyo** (resolución declarada cambia entre recargas) | El player re-negocia y puede reiniciar | No hay check ⇒ **P2** (`STABLE-VARIANT-ID`) es el remedio |

## 5 · Límite explícito: qué **no** se puede hacer en Lua (ni en el edge)

1. **Crear píxeles.** Lua/nginx reescriben texto; el bitstream no se decodifica ni recodifica. `docs/VPS_UPSCALE_4K_DESIGN.md:67-70` lo cierra: el «4K» que se veía no se generó en el VPS.
2. **Invocar la IA del SoC (AI-SR/AI-PQ).** Vive en el device, se comanda por el daemon/ADB, no desde el manifiesto: `CLAUDE.md` §«VIDEO-RANGE=PQ Incondicional» (corrección 2026-06-17) y `docs/VPS_UPSCALE_4K_DESIGN.md:127-132`. La super-resolución es **de GPU/SoC** (p. ej. el hilo de mpv sobre RTX SR, [mpv #14804](https://github.com/mpv-player/mpv/discussions/14804) — solo título, **NOT_RUN**).
3. **Dolby Vision real.** Requiere RPU en el bitstream; un tag en el manifiesto no lo crea (`CLAUDE.md` §Reglas Honestas: `SUPPLEMENTAL-CODECS` inventado prohibido).
4. **Transcodificar.** El VPS no tiene ruta de vídeo: `\.ts|\.m4s|\.mp4$ → 404` y `MAX_BODY` 4 MiB (`ape_rebase_lib.lua:22`); y el propio edge **no debe** recibir vídeo (defecto E5-F1/F2 en `docs/edge/E5_UHD_DOCTRINE.md` §2.2-2.3).
5. **Forzar al player a un techo de resolución.** Eso es config del cliente (`maxAutoResolution`, S2) o filtrado en el edge (§2); Lua **sólo** puede emitir hints inertes (RFC 8216 §6.3.1).

## 6 · Límites de este documento (lo que **no** se afirma)

- **ACM S3 = NOT_RUN** (403). No se cita su contenido ni se usa para sostener nada.
- **Doom9 (2 hilos) y mpv #14804 = títulos indexados, cuerpos no abiertos.** No se les atribuye ninguna afirmación.
- **mpv #8334 = solo título verificado** (HTTP 200): sirve como indicio de demanda, no como prueba técnica.
- **resty-bakery:** se leyó el `README.md` y el árbol; **no** se leyeron sus `.lua` (`src/resty-bakery-hls.lua` 4 829 B, `-dash.lua` 3 922 B, `resty-bakery.lua` 1 098 B según el árbol) ⇒ las afirmaciones sobre su implementación son de README, no de código.
- **Ninguna propuesta de §3 se implementó aquí**: son diseño. Tocar código es t29/t32 y requiere su propia ventana.

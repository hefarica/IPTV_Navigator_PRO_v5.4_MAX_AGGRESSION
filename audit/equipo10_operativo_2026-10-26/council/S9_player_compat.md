# S9 · Council Player Compatibility — headers, tags y matriz real (solo lectura)

- **Snapshot:** git HEAD `e38a89bb30c02cb41050f34cef43d3711a2b0644` (2026-10-26 03:08 -0500).
- **Método:** lectura estática + anclaje de línea con `Select-String` sobre el archivo en disco + **1** ejecución del harness headless (exit 1, ver S9-12). Cero escrituras fuera de este archivo. Cero pruebas en dispositivo (prohibido inventarlas).
- **Aviso de líneas:** `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` worktree = HEAD **+300/−1** (`git diff --stat`; 738.609 B / 11.459 líneas físicas; HEAD 718.467 B / 11.144). Se cita la línea del **worktree**; cuando el símbolo no existe en HEAD, se marca `HEAD:` con su línea real. Todo lo marcado *worktree-only* **no** pertenece al snapshot e38a89b.
- **Aviso de capa VPS:** el VPS desplegado es **rebase-only** (`docs/manifestos/VPS_REALITY_MEASURED_2026-10-25.md`:15,136) y los `.lua` transformadores del repo no están desplegados. Todo emisor PHP de `vps/**` es repo aspiracional ⇒ estado `NOT_DEPLOYED`, nunca PASS.

## 1. Emisores reales y clasificación contra los 6 tóxicos

| # | Emisor (archivo:línea) | Emite | Tóxicos | Estado |
|---|---|---|---|---|
| 1 | `m3u8-typed-arrays-ultimate.js:4734` `build_exthttp` → `:8547` gate | `#EXTHTTP:{JSON}` (≤200 headers / ≤8192 B) | `_ca7BannedAbsolute` borra 5 (`HEAD:8280‑8295`); `Upgrade-Insecure-Requests` sólo si UA **no** navegador (`HEAD:8301‑8308`, worktree `8533‑8540`) | FAIL parcial del gate 1 |
| 2 | `parsers/ape-parser-generation-bridge.js:236‑274` invocado en `HEAD:8325‑8327` / WT `8558‑8560` | post-emisión string-level | **6/6** (`:240`, `:263`), vía `APEHttpHeaderSanitizer` (`parsers/ape-http-header-sanitizer.js:14‑28`) | PASS (código) |
| 3 | WT-only: `APE_TOXIC_DENYLIST` `:2356`, filtro `:2384`, scrub `:2398`, uso `:8547`/`:10318` | denylist incondicional 11 patrones | 6/6 + `Connection`/`Keep-Alive`/`Sec-*`/`Proxy-Connection` | **worktree-only** (no en HEAD) |
| 4 | `m3u8-typed-arrays-ultimate.js:8707‑8747` | `#KODIPROP:…manifest_headers` / `stream_headers` | emite `Connection=keep-alive` (`:8731`, `:8740`) pese a que EXTHTTP lo prohíbe (`HEAD:8280`) | FAIL (S9-02) |
| 5 | `ape-profiles-config.js:3994‑4040` + `:5873‑5978` (EXTHTTP por perfil) | cabeceras PM | define los 6 tóxicos (`:4017‑4018`, `:4023‑4025`, `:4040`); su `BANNED` sólo quita UIR/TE (`:5965`) | PASS por gate externo, FAIL de defensa local (S9-11) |
| 6 | `ape-profiles-config.js:5987‑6009` | `#EXT-X-APE-HTTP-HEADERS:{…}` (**no** `#EXTHTTP:`) | n/a | inerte / nombre engañoso (S9-11) |
| 7 | `headers-matrix-v9.js:79‑381` + `:528‑538` | L1–L5 | 4 comentados (`:99`, `:174`, `:205‑206`), 2 baneados en runtime (`:535`); `Range/If-None-Match/If-Modified-Since/Priority` sin defensa runtime | PASS por construcción (S9-10) |
| 8 | `frontend/js/m3u8-global-headers.js:52‑65` → `formatEXTVLCOPT:86‑92` | `#EXTVLCOPT:http-header:K=V` | 6/6 en `BANNED` antes de formatear | PASS (código) |
| 9 | `vps/ape_hls_generators.php:500,520,589,712` | `#EXTHTTP` por fragmento | hereda del canal, **sin** filtro en el archivo | NOT_DEPLOYED |
| 10 | `vps/resolve.php:626‑841` | `#EXTVLCOPT` ×63 + `#EXTHTTP` | 3 tóxicos **comentados** (`:650‑651`, `:654`) | NOT_DEPLOYED |
| 11 | `vps/prisma/lib/{vlcopt,kodiprop}_enhancer.php` | `#EXTVLCOPT`/`#KODIPROP` | ninguno de los 6 | NOT_DEPLOYED |

**Lectura:** en HEAD el contrato EXTHTTP sí queda en 0 tóxicos, pero por **una sola** cadena (gate + bridge). El bridge devuelve el string **sin sanear** si `JSON.parse` falla (`:270‑272`) y no cubre `#EXTVLCOPT:http-header=` ni `#KODIPROP:stream_headers` (no son JSON): esos dos canales dependen de que cada emisor recuerde filtrar.

## 2. TiviMate: single-value vs 4-layer — ¿cableado o documentado?

**Veredicto: 4-layer CABLEADO en datos; single-value SÓLO DOCUMENTADO.**

- 4-layer real en **los 6 perfiles** (headerOverrides con 4 valores): `ape-profiles-config.js:433‑434` (P0), `:762` (P1), `:1113‑1117` (P2), `:1396` (P3), `:1890` (P4), `:2201‑2202` (P5); más `Cache-Control":"no-cache,no-store,max-age=0,max-stale=0"` (`:452`, `:1069`, `:2214`, `:2850`) y `Sec-Fetch-Dest":"media,video,audio,empty"` (`:451` y 9 perfiles/bloques).
- Single-value: **0** ocurrencias de `split(',')` sobre valores de header en el emisor; las 12 apariciones son codec/HDR/idioma (`:40`, `:49`, `:1001`, `:1749`, `:4050`, `:4053`, `:6776`, `:7729`, `:7790‑7795`, `:9905`).
- El único emisor “por player” del repo, `parsers/ape-player-profile-emitter.js:60‑64`, hace `emitTivimateSafe = emitStandardHls + etiqueta`: **no recorta ni reordena valores**.
- La doctrina existe sólo como texto: `.agents/skills/tivimate-single-value-headers-enforcer/SKILL.md`:3,12 (“TiviMate parses first value only; multi-value causes header reject”); el anchor `android-tv-ott-tivimate-tuning/SKILL.md`:1‑34 es andamiaje de 14 secciones sin valores por player.
- Riesgo: si la doctrina es cierta, TiviMate recibe valores `a,b,c,d` tal cual (p.ej. `Cache-Control`, `X-Prefetch-Enabled`). Impacto real **NOT_RUN** (no se probó en dispositivo). Severidad MEDIA por ausencia de enforcement, no por daño medido.

## 3. Separación de perfiles P0–P5

- **Datos separados (PASS):** cada perfil tiene `settings`, `vlcopt`, `kodiprop`, `enabledCategories` y `headerOverrides` propios en `ape-profiles-config.js` (bloques `enabledCategories` en `:395` P0, `:1030` P1, `:1663` P2, `:2157` P3, `:2790` P4, `:3424` P5; `settings`/`vlcopt`/`kodiprop` de P0 en `:330‑393`); la resolución es por perfil (`getHeaderValue` `:5556‑5565`: override del perfil → default). En VPS: `vps/ape_profiles.php:11` (P0 `hvc1.2.4.L183`), `:63` (P1 `L180`), `:105` (P1 fallback `L156`).
- **Herencia por capas (FAIL de disciplina):** `headers-matrix-v9.js:504` acumula `Object.assign(headers, this.layers[i])` ⇒ un “perfil” L5 contiene **todo** L1–L4. Y L5 mezcla identificadores de tres players distintos en la misma capa: `X-Player-Name: TiviMate` (`:249`), `X-TiviMate-Buffer` (`:297`), `X-OTT-Buffer-Size` (`:357`), `X-ExoPlayer-Buffer-Min` (`:362`). Un cliente TiviMate recibe headers que declaran OTT Navigator y ExoPlayer.
- **Mapeo nivel→perfil arbitrario:** `_levelToProfileId` (`:553‑556`) hace `5→P1, 4→P2, 3→P3, 2→P4, 1→P5`; es un eje distinto del eje P0–P5 del Profile Manager ⇒ dos nociones de “perfil” conviven sin traducción documentada.

## 4. Tags en el tipo de playlist equivocado

1. **`#EXT-X-SESSION-DATA` en el catálogo M3U Plus.** `generateGlobalHeader()` (`:2535`) lo inserta incondicionalmente (`:2646`) en la cabecera del listado de canales, cuya primera línea es `#EXTM3U x-tvg-url=… catchup="flussonic"` (`:2877`). Es tag **master-playlist** (RFC 8216 §4.3.4.4); el catálogo no es un master HLS. Incluye configuración dirigida a players concretos: `exoplayer.load_control` (`:2884`), `exoplayer.track_selection` (`:2885`), `exoplayer.bandwidth_meter` (`:2886`), `hls.js.config` (`:2887`).
2. **Tags de media playlist/LL-HLS en la misma cabecera.** Con `maxQualityMode` (`:2875`) se añaden `#EXT-X-TARGETDURATION:2`, `#EXT-X-PART-INF:PART-TARGET=0.5`, `#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES…` (`:2878‑2883`) a un catálogo sin segmentos.
3. **`#EXT-X-STREAM-INF` por canal en el catálogo** (`:10258`): permitido por la doctrina del repo (1 por canal, anti-509) pero es namespace HLS dentro de M3U Plus.
4. **VPS (NOT_DEPLOYED):** `#EXTVLCOPT`/`#EXTHTTP`/`#KODIPROP` se emiten **antes** de `#EXTM3U` en `serve_hls_fmp4_ignition` (`vps/ape_hls_generators.php:585‑592`) y `serve_cmaf_m3u8_fallback` (`:706‑721`) ⇒ `#EXTM3U` deja de ser la primera línea.
5. **VPS (NOT_DEPLOYED):** `serve_god_tier_dash()` (`:508‑524`) responde `Content-Type: application/vnd.apple.mpegurl` + `#EXTM3U` + `#EXTINF` + URL de un **MPD**: un manifiesto DASH servido como HLS de un solo item.
6. **VPS (NOT_DEPLOYED):** `serve_cmaf_m3u8_fallback` declara `#EXT-X-STREAM-INF` con `RESOLUTION`/`CODECS` tomados del perfil (`:733‑750`), no del variant real del proveedor ⇒ posible “player-breaking lie” (declara `hvc1` sobre bytes AVC), el mismo riesgo que el comentario T11/B‑10 dice evitar.

## 5. Matriz player × capacidad × header × origen (evidencia de código)

| Player (stack) | Mecanismo en el repo | Origen (archivo:línea) | ¿Separado por player? | Estado |
|---|---|---|---|---|
| TiviMate (ExoPlayer/okhttp) | `#EXTHTTP`, `#EXTVLCOPT:http-user-agent`, `#EXT-X-STREAM-INF` | UA pool `ape-profiles-config.js:6042`; EXTHTTP `m3u8…:8547‑8560`; EXTVLCOPT desde `:7896` | No (mismo bloque para todos) | 4-layer verificado en datos; single-value ausente (S9-03) |
| TiviMate (perfil dedicado) | `emitTivimateSafe` | `parsers/ape-player-profile-emitter.js:60‑64` | Etiqueta sin efecto | Código muerto (S9-04) |
| OTT Navigator (ExoPlayer + libVLC opcional) | `#EXTHTTP`, `#EXTVLCOPT` | `ape-player-profile-emitter.js:66‑75` (`#EXTHTTP:{"headers":{…}}`) | Envuelve en clave `headers` (≠ contrato plano) | Código muerto + formato divergente |
| VLC / libVLC | `#EXTVLCOPT` (63 líneas) | `vps/resolve.php:626‑841`; `m3u8-global-headers.js:86‑92` | No | NOT_DEPLOYED / emisor alterno |
| Kodi ISA | `#KODIPROP` (92/canal) | `m3u8…:8707‑8747`; `vps/prisma/lib/kodiprop_enhancer.php:25‑35` | No | Envío `Connection` hop-by-hop (S9-02) |
| ExoPlayer | `#EXT-X-SESSION-DATA:exoplayer.*`, headers `X-ExoPlayer-*` | `m3u8…:2884‑2886`; `headers-matrix-v9.js:362‑364` | Parcial (SESSION-DATA en sitio incorrecto) | Tag master-only en catálogo (S9-05) |
| hls.js | `#EXT-X-SESSION-DATA:hls.js.config` | `m3u8…:2887` | Parcial | Igual que arriba |
| Shaka | Sólo comentario “Shaka manifest parsing API” | `m3u8…:2637` | No | DOC-ONLY |
| Smart TV Tizen/webOS | `avc1.640029` fps-aware para strict decoders | `m3u8…:10139‑10144` (comentario Council S3) | No | DOC/estrategia de codec, sin gate de player |
| Navegador (Chrome/Edge/FF/Safari) | `Sec-Fetch-*` + `Sec-CH-UA-*` sólo si UA navegador | `m3u8…:8533‑8540`, emisión `:8395` | **Sí** (único gate por UA real) | PASS de código |

## 6. Disensos (S9 no firma consenso)

1. **“El 4-layer es doctrina, no implementación por player.”** El repo lo aplica a **todos** los perfiles por igual (§2). Sostener “TiviMate-safe” sin recorte es contradictorio: o se implementa el recorte por player, o se retira la afirmación de la skill.
2. **“Un manifiesto universal multi-player es más seguro que 7 manifiestos.”** Disiento: el bloque KODIPROP (92 líneas) + EXTVLCOPT (63) + EXTHTTP (33–39) en el mismo canal es ruido para 6 de 7 players; el riesgo no es el ruido sino los valores que un player **sí** honra (`network-caching`, `live_delay`, `min_bandwidth`).
3. **Contra el propio repo en VPS:** PRISMA inyecta EXTVLCOPT y KODIPROP a todo manifiesto sin detectar player (`vps/prisma/prisma_processor.php:87‑98`), con `network-caching=300000` (`vlcopt_enhancer.php:100`), `minterpolate=fps=120` (`:82`), `live_delay=0` (`kodiprop_enhancer.php:34`) y `min_bandwidth=13000000` (`:29`). Sólo la lane LCEVC detecta player (`prisma_processor.php:264`). Es una regresión de compatibilidad *por diseño*, hoy no desplegada.
4. **Sobre el artefacto viejo:** `audit_bulletproof_output.m3u8` (working tree, **no trackeado**) tiene 4 tóxicos en los 10 EXTHTTP. No lo uso para acusar a HEAD (§7 S9-13), pero sí para pedir que se borre o marque: si alguien lo sube, se sirve con tóxicos.

## 7. Hallazgos

| ID | Sev | Archivo:línea | Problema | Corrección propuesta |
|---|---|---|---|---|
| S9-01 | HIGH | `m3u8…` `HEAD:8301‑8308` | `Upgrade-Insecure-Requests` sólo se borra si UA no es navegador ⇒ con UA Chrome se emite (viola prohibición absoluta de `CLAUDE.md`) | Moverlo a `_ca7BannedAbsolute` (ya está resuelto en worktree `:2356`, sin commit) |
| S9-02 | MED | `m3u8…:8731,8740` | KODIPROP envía `Connection=keep-alive` (hop-by-hop, RFC 7230 §6.1) mientras EXTHTTP lo prohíbe | Eliminar `Connection` de `manifest_headers`/`stream_headers` |
| S9-03 | HIGH | `ape-player-profile-emitter.js:60‑64`; `tivimate-single-value…/SKILL.md:3` | single-value TiviMate no existe en código; 4-layer sí existe en los 6 perfiles | Implementar recorte `valor.split(',')[0]` por target, o retirar la skill |
| S9-04 | MED | `parsers/ape-player-profile-emitter.js:60‑106` | emisor per-player cargado (`index-v4.html`) y **sin invocadores**; OTT emite `#EXTHTTP:{"headers":…}` y VLC `http-header=K: V` vs `http-header:K=V` del resto | Cablear o eliminar; unificar sintaxis EXTVLCOPT |
| S9-05 | HIGH | `m3u8…:2646,2875‑2883` | `#EXT-X-SESSION-DATA` (master-only) y tags media/LL-HLS en cabecera del **catálogo** | Mover a un master HLS real; en catálogo dejar sólo `#EXT-X-APE-*` |
| S9-06 | HIGH (repo VPS) | `vps/ape_hls_generators.php:585‑592,706‑721` | `#EXTM3U` no es la primera línea | Emitir `#EXTM3U` primero |
| S9-07 | HIGH (repo VPS) | `vps/ape_hls_generators.php:508‑524` | MPD servido con `Content-Type` HLS y tags M3U | Servir `application/dash+xml` + MPD real o no exponer |
| S9-08 | MED (repo VPS) | `vps/ape_hls_generators.php:733‑750` | `STREAM-INF` declara `RESOLUTION`/`CODECS` del perfil, no del variant | Derivar de probe o no declarar |
| S9-09 | HIGH (repo VPS) | `vps/prisma/prisma_processor.php:87‑98` + enhancers | EXTVLCOPT/KODIPROP a todo manifiesto sin detectar player; `network-caching=300000`, `minterpolate fps=120`, `live_delay=0`, `min_bandwidth=13 Mbps` | Gate por player (como LCEVC `:264`) antes de inyectar |
| S9-10 | MED | `headers-matrix-v9.js:249,297,357,362,504,528‑538` | L5 mezcla headers de 3 players; BANNED runtime sólo cubre 2/6 tóxicos | Separar por player; añadir los 4 restantes al set |
| S9-11 | MED | `ape-profiles-config.js:4017‑4040,5965,5987‑6009` | defaults con 6 tóxicos; filtro local sólo 2/6; `getEXTHTTPLine/Block` emite `#EXT-X-APE-HTTP-HEADERS` (inerte) | Purgar defaults; usar `#EXTHTTP:` real |
| S9-12 | INFO/BLOCKED | `_vps_stage/tests/regen_headless/regen_headless.js` | `node … --mode default --out %TEMP%\s9regen --deterministic` → **exit 1**, `"exportErr":"generateM3U8Stream is not defined"` (`regen_multilist_report.json`) | Reparar export `window.APE_GEN` (t53) para poder medir el contrato emitido sin navegador |
| S9-13 | INFO | `IPTV_v5.4_MAX_AGGRESSION/audit_bulletproof_output.m3u8` (no trackeado) | 9.315 líneas / 10 canales `ape-profile="P0"`; `TE`,`Range`,`Priority` en 10/10 EXTHTTP y `Upgrade-Insecure-Requests` en 4/10; claves `X-Codec-Audio`/`X-Codec-Primary` (renombradas 2026-05-12) ⇒ **anterior** a esa fecha | Borrar o marcar `_STALE`; no sirve como evidencia de HEAD |
| S9-14 | MED (docs) | `.claude/agents/player-compatibility-engineer.md:1‑86`; anchors S9 | plantilla genérica; la doctrina S9 vive sólo en la línea `description` de las skills | Escribir la matriz real en el anchor, no en el frontmatter |

## 8. Veredicto por control (sin promedio)

| Control | Veredicto | Evidencia |
|---|---|---|
| C1 · 0 tóxicos en `#EXTHTTP` de HEAD | **PASS** (con reserva) | gate `HEAD:8279‑8318` + bridge `:236‑274` invocado `HEAD:8325‑8327`; reserva: si `JSON.parse` falla el bridge no sanea (`:270‑272`) |
| C2 · TiviMate single-value cableado | **FAIL** | S9-03 |
| C3 · Separación P0–P5 | **PASS** en datos / **FAIL** por-player | §3 |
| C4 · Tags en el tipo de playlist correcto | **FAIL** | S9-05, S9-06, S9-07 |
| C5 · Matriz con evidencia archivo:línea | **PASS** | §5 |
| C6 · Gating por player/UA | **PASS parcial** (sólo `Sec-Fetch*`/`Sec-CH*`) | `m3u8…:8533‑8540` |
| C7 · Reproducción real en TiviMate/OTT/VLC/Kodi/Smart TV | **NOT_RUN** | sin dispositivo; prohibido inventar |
| C8 · Capa VPS desplegada | **BLOCKED** | `VPS_REALITY_MEASURED_2026-10-25.md`:15,136 (rebase-only; PHP no desplegado) |

## 9. Límites de esta auditoría

- No se abrió navegador ni se reprodujo ningún stream; ningún veredicto de C7 se apoya en memoria.
- No se modificó código ni configuración: la única escritura es este archivo.
- Las líneas citadas se verificaron con `Select-String` sobre el archivo en disco (worktree). Donde el símbolo no existe en HEAD se indica `HEAD:`.
- El harness headless está roto (S9-12) ⇒ no fue posible regenerar una lista del emisor actual para medir bytes emitidos; ese control queda **BLOCKED**, no PASS.

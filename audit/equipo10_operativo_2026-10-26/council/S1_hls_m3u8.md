# S1 — Council HLS/M3U8: tags realmente emitidos vs RFC 8216

**Fase:** Council read-only · **Fecha:** 2026-10-26 · **Autor:** s1-hls-architect (agente, no persona)
**Snapshot declarado:** git HEAD `e38a89b` · **Snapshot auditado:** working tree (ver F01 — NO coinciden)

**Abreviaturas de ruta:** `E/` = `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/` · `P/` = `IPTV_v5.4_MAX_AGGRESSION/`
**Fuente normativa:** RFC 8216 (Pantos/May, 2017) descargado de `https://www.rfc-editor.org/rfc/rfc8216.txt` (HTTP 200). Citas por §.
**Método:** lectura de emisores + análisis byte a byte de listas versionadas + conteo de tags distintos. Sin ejecución del generador.

## 1. Veredicto por afirmación

| # | Afirmación evaluada | Veredicto |
|---|---|---|
| A1 | Existe inventario de los tags HLS **emitidos** (no documentados) | **PASS** |
| A2 | Single-URL por EXTINF (Anti-509) en el catálogo de producción | **PASS** |
| A3 | Ausencia de `EXT-X-MEDIA URI=` y `EXT-X-I-FRAME-STREAM-INF URI=` en catálogos | **PASS** (doctrina) / **FAIL** (RFC §4.3.4.3) |
| A4 | `EXT-X-VERSION` coherente con los tags usados y con RFC 8216 | **FAIL** |
| A5 | `EXT-X-TARGETDURATION` coherente con el EXTINF máximo | **FAIL** |
| A6 | Monotonía de `EXT-X-MEDIA-SEQUENCE` | **NOT_RUN** |
| A7 | Los tags HLS están en el tipo correcto de playlist (condición de éxito AGENTS.md) | **FAIL** |
| A8 | Contraste tag-por-tag contra RFC 8216 y contra AGENTS.md/CLAUDE.md | **PASS** (ejecutado; ver §2) |
| A9 | Disensos doctrina↔RFC registrados | **PASS** (ver §5) |

**Totales: PASS 8 · FAIL 10 · BLOCKED 0 · NOT_RUN 2** (20 hechos en §2)

## 2. Hechos con fuente

| ID | Hecho observado | Fuente (archivo:línea o comando+exit) | Veredicto |
|---|---|---|---|
| F01 | El snapshot declarado no coincide con el disco: `m3u8-typed-arrays-ultimate.js` tiene **+10 447 / −10 líneas** sin commitear sobre `e38a89b` | `git diff --stat HEAD -- P/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` → `10447 insertions(+), 10 deletions(-)`; exit 0 | **FAIL** |
| F02 | Emisor activo `m3u8-typed-arrays-ultimate.js`: **1283** tokens `#EXT*` distintos (1176 contienen `APE-`, 107 otros). Incluye matchers regex, no solo emisión | conteo `[regex]'#EXT[A-Z0-9\-]*'` sobre el archivo; 21 581 líneas | **PASS** |
| F03 | Artefacto real `P/audit_bulletproof_output.m3u8`: 721 nombres de tag distintos al inicio de línea, **594 `#EXT-X-APE-*`** | misma medición sobre el archivo (9315 líneas, 10 canales) | **PASS** |
| F04 | `E/ape-hevc-cascade.js` (529 líneas) y `E/ape-canon-emitter.js` (77 líneas) **no emiten ni un tag HLS**: 0 ocurrencias de `#EXT` y de `EXT-X-`. Cascade = resolvedor de códec (13 tiers); canon-emitter = serializador JSONL/bundle | `Select-String '#EXT'` / `'EXT-X-'` → 0 y 0 en ambos | **PASS** (rol distinto al que sugiere el nombre) |
| F05 | `E/ape-m3u8-ingestion-parser.js` es **solo parseo** (5 ocurrencias de `#EXT`, todas en regex/match); no emite | idem | **PASS** |
| F06 | Anti-509 en catálogo de producción: **8366/8366** bloques `#EXTINF` con **exactamente 1 URI**; 0 bloques con >1; máximo 1 | `P/backend/lista_omega_v5.4.m3u8` (16 733 líneas) analizado bloque a bloque | **PASS** |
| F07 | Catálogo activo no emite `#EXT-X-MEDIA:` (0) ni `#EXT-X-I-FRAME-STREAM-INF` (0) | análisis de `P/backend/lista_omega_v5.4.m3u8` y `lista_omega_mock.m3u8` | **PASS** |
| F08 | Un **sibling versionado en el mismo directorio** sí emite `EXT-X-MEDIA` **con `URI=`** (violación Anti-509 explícita de CLAUDE.md) | `E/m3u8-typed-arrays-ultimate.pre-admission.js:8363-8364` → `#EXT-X-MEDIA:TYPE=AUDIO,...,URI="${primaryUrl}"` | **FAIL** |
| F09 | 10/10 `#EXT-X-I-FRAME-STREAM-INF` **sin atributo URI**. RFC 8216 §4.3.4.3: *"Every EXT-X-I-FRAME-STREAM-INF tag MUST include a BANDWIDTH attribute and a URI attribute"* | `P/audit_bulletproof_output.m3u8` (10 totales, 0 con URI); emisores `E/m3u8-typed-arrays-ultimate.js:2701, 9634, 13008, 19941` | **FAIL** (RFC) |
| F10 | Media Segment tags y Master Playlist tags conviven en el mismo archivo. RFC 8216 §4.3.2: *"A Media Segment tag MUST NOT appear in a Master Playlist. Clients MUST fail to parse Playlists that contain both Media Segment tags and Master Playlist tags"* | `#EXTINF` (8366 / 10) junto a `#EXT-X-STREAM-INF`, `#EXT-X-SESSION-DATA`, `#EXT-X-DATERANGE` en ambos artefactos | **FAIL** |
| F11 | `#EXT-X-VERSION:9` declarado, pero RFC 8216 *"describes version 7 of this protocol"* y §6.3.1 obliga al cliente: si la versión no es soportada *"the client MUST NOT attempt to use the Playlist"* | `P/audit_bulletproof_output.m3u8:2`; `E/m3u8-typed-arrays-ultimate.js:2623, 2675, 12930` (+`:2664` con `VERSION:7`) | **FAIL** |
| F12 | Header de modo MAX QUALITY emite `#EXT-X-TARGETDURATION:2` + `#EXT-X-PART-INF` + `#EXT-X-SERVER-CONTROL` en un **catálogo de canales** (Master), no en media playlist. El propio archivo prohíbe esto per-canal | `E/m3u8-typed-arrays-ultimate.js:2626-2628` vs. comentario auto-documentado `:7665-7667` (*"TARGETDURATION/MEDIA-SEQUENCE/PLAYLIST-TYPE pertenecen únicamente a Media Playlist; emitirlos en Master rompe parsers estrictos… Removido por audit 2026-04-26"*) — el fix se aplicó per-canal, **no** en el header | **FAIL** |
| F13 | `EXT-X-TARGETDURATION` ausente en el header por defecto, mientras todo EXTINF vale `-1`. RFC 8216 §4.3.3.1: *"The EXT-X-TARGETDURATION tag is REQUIRED"*; §4.3.2.1 exige duración *decimal-integer o decimal-floating-point* (el signo `-` no está en la gramática) | artefacto: EXTINF min=max=−1, 0 `#EXT-X-TARGETDURATION`; `E/m3u8-typed-arrays-ultimate.js:6791, 7655` | **FAIL** |
| F14 | `#EXT-X-MEDIA-SEQUENCE`: **0 emisiones** en el emisor activo; la única ocurrencia es un `findIndex` de validación, no un `push` | `E/m3u8-typed-arrays-ultimate.js:10147` (`lines.findIndex(...)`, dentro de `validate…` 10140-10151) | **NOT_RUN** |
| F15 | **11/11** `#EXT-X-DATERANGE` del artefacto **sin START-DATE**. RFC 8216 §4.3.2.7: START-DATE *"is REQUIRED"* | `P/audit_bulletproof_output.m3u8:37, 1003, 1925, 2847…`; plantilla `E/m3u8-typed-arrays-ultimate.js:2654` | **FAIL** |
| F16 | Se emite `HDCP-LEVEL="TYPE-1"`: (a) **entrecomillado** — RFC 8216 §4.2 define enumerated-string como *"an **unquoted** character string… will never contain double quotes"*; (b) `TYPE-1` **no está** en el conjunto de RFC 8216 §4.3.4.2 (*"valid strings are TYPE-0 and NONE"*) | artefacto L1010 etc.; `E/m3u8-typed-arrays-ultimate.js:6538` | **FAIL** |
| F17 | `VIDEO-RANGE` y `SUPPLEMENTAL-CODECS` **no existen** en RFC 8216 (0 ocurrencias en el texto completo). Son atributos de RFC 8216bis; no cotejados contra fuente primaria en esta pasada | `Select-String 'VIDEO-RANGE'`/`'SUPPLEMENTAL-CODECS'` sobre el RFC → 0 y 0 | **NOT_RUN** |
| F18 | Los **10** `#EXT-X-STREAM-INF` del artefacto son **byte-idénticos**: `RESOLUTION=7680x4320`, `BANDWIDTH=120000000`, `FRAME-RATE=120.000` para todo canal. `RESOLUTION` es por-Variant (§4.3.4.2), no una constante | `Select -Unique` sobre `^#EXT-X-STREAM-INF` → 1 payload distinto de 10 líneas | **FAIL** |
| F19 | `lista_omega_mock.m3u8` es efectivamente MOCK (nombre + 100 canales sintéticos, solo `#EXTM3U`+`EXTINF`). `test.m3u8`, `test2-4.m3u8`, `f1_full.m3u8` son fixtures. `downloaded_list.m3u8` (222 MB) es lista de proveedor, no generada | `Test-Path`+conteo de líneas; análisis de tags | **PASS** |
| F20 | Guard de singleton RFC sí presente y eficaz: 1 sola `#EXT-X-VERSION` en el artefacto; el dedupe descarta duplicados y deduplica `SESSION-DATA` por `DATA-ID` | `E/m3u8-typed-arrays-ultimate.js:2547-2566`; artefacto VERSION=1 | **PASS** |
| F21 | El contrato del especialista S1 es una **plantilla vacía**: 86 líneas, sin tabla de tags, sin regla Anti-509, sin tabla de versiones; conserva placeholders (`<sample request matching IPTV/HLS Architect scope>`) | `.claude/agents/iptv-hls-architect.md:1-86` (raíz del repo, **no** bajo `IPTV_v5.4_MAX_AGGRESSION/`) | **FAIL** |
| F22 | El catálogo de producción sólo contiene `#EXTM3U` + `#EXTINF`: es un catálogo M3U Plus, **no** una playlist HLS. RFC 8216 §4.1: *"A Playlist MUST be either a Media Playlist or a Master Playlist; all other Playlists are invalid"* | `P/backend/lista_omega_v5.4.m3u8` (1 tag distinto: `#EXTM3U`) | **FAIL** (afirmación de conformidad) |

## 3. Riesgos

| ID | Sev | Impacto | Evidencia | Mitigación |
|---|---|---|---|---|
| R1 | **ALTO** | `VERSION:9` activa el rechazo obligatorio en clientes RFC-estrictos (Apple/tvOS, parsers validantes): *"clients MUST fail to parse"*. Riesgo de lista no reproducible en un subconjunto de players | F11 | Declarar `VERSION:7` en el catálogo Master-like y aislar LL-HLS en media playlists reales, o documentar explícitamente que el target es 8216bis |
| R2 | **ALTO** | `EXT-X-I-FRAME-STREAM-INF` sin URI ⇒ tag declarado inerte y no conforme (MUST). Un validador estricto marca la lista inválida aunque el player la tolere | F09 | Si se quiere metadata: usar `#EXT-X-APE-TRICK-PLAY-*` (ya existe) y **eliminar** `I-FRAME-STREAM-INF`; si se quiere trick-play real: añadir `URI=` a un media playlist I-frames-only |
| R3 | **ALTO** | Coexistencia Media+Master tags hace la lista inválida por §4.3.2; parsers estrictos deben fallar entera | F10 | Separar artefactos: catálogo M3U Plus (sin tags HLS-X) vs media playlist por canal. Nunca ambos |
| R4 | **MEDIO** | Sibling `pre-admission.js` emite `EXT-X-MEDIA … URI=`: si alguien lo carga (o un script lo toma como emisor) se dispara HTTP 509 del proveedor | F08 | Borrar/mover a `_attic/` los siblings no referenciados (0 referencias en `frontend/`) y añadir check de CI |
| R5 | **MEDIO** | `DATERANGE` sin START-DATE (11/11) ⇒ marcador de ad breaks/HDR no ubicable en el timeline; SCTE-35 pierde anclaje temporal | F15 | Añadir `START-DATE`/`DURATION` obligatorios en el emisor y validar en `omega-compliance-engine` |
| R6 | **MEDIO** | `RESOLUTION`/`BANDWIDTH` constantes (8K/120 Mbps) para todo canal: si un player las usa para ABR/capability gating, fuerza un techo falso. Contradice `iptv-no-hardcode-doctrine` | F18 | Derivar de `_apeTruth`/probe; cuando no haya evidencia, **omitir** el atributo (regla CLAUDE.md "bitrate real > fallback agresivo > no emitir STREAM-INF") |
| R7 | **BAJO** | `HDCP-LEVEL="TYPE-1"` entrecomillado y fuera del vocabulario RFC 8216: clientes lo ignoran (§6.3.1) ⇒ la lógica HDCP-adaptativa no tiene efecto por esta vía | F16 | Emitir `TYPE-0`/`NONE` sin comillas para RFC 8216, o mover el hint a `#EXT-X-APE-DRM-HDCP` |

## 4. Huecos y NO-RUN

| Ítem | Estado | Causa real |
|---|---|---|
| Monotonía de `EXT-X-MEDIA-SEQUENCE` (A6/F14) | **NOT_RUN** | No hay sitio de emisión en el emisor activo ⇒ no existe secuencia que medir. Verificarlo exigiría un media playlist real (no hay ninguno versionado) |
| `VIDEO-RANGE` / `SUPPLEMENTAL-CODECS` / `EXT-X-PART-INF` (F17) | **NOT_RUN** | No están en RFC 8216; pertenecen a RFC 8216bis, que no se descargó como fuente primaria en esta pasada. No se afirma conformidad ni disconformidad |
| Lineage de los artefactos | **NOT_RUN** | `audit_bulletproof_output.m3u8` y `lista_omega_v5.4.m3u8` no registran commit/params de generación. No se puede afirmar qué revisión del emisor los produjo |
| Ejecución del generador / parseo con hls.js o ffprobe | **NOT_RUN** | Council es read-only y no se ejecutó el pipeline (requiere navegador + credenciales). Ningún veredicto se apoya en ejecución |
| `downloaded_list.m3u8` (222 MB) | **NO ANALIZADO** | Fuera del alcance (lista de proveedor, no generada); su tamaño impide análisis bloque a bloque en este turno |

## 5. Disensos contra la doctrina

| # | Doctrina (fuente) | RFC 8216 / hecho medido | Resolución propuesta |
|---|---|---|---|
| D1 | CLAUDE.md: *"`EXT-X-I-FRAME-STREAM-INF` → puede existir como METADATA pero NUNCA con `URI=`"* | §4.3.4.3: el atributo URI es **obligatorio**; sin él el tag no identifica nada. La doctrina y el RFC son incompatibles por diseño | Adoptar: prohibir el tag en catálogos y usar tags APE propios para metadata. Registrar la excepción doctrinal explícitamente |
| D2 | CLAUDE.md: *"`VIDEO-RANGE=PQ` INCONDICIONAL"* como palanca de imagen | `VIDEO-RANGE` no existe en RFC 8216 (0 ocurrencias). Un cliente RFC 8216 lo ignora por §6.3.1 ⇒ **cero efecto** en esos players, por diseño | Mantener la decisión del propietario, pero corregir la expectativa: el efecto sólo aplica a parsers 8216bis. No es una palanca de calidad en players RFC-estrictos |
| D3 | AGENTS.md condición de éxito: *"Los tags HLS/LL-HLS están en el tipo correcto de playlist"* | El artefacto de producción es un catálogo M3U Plus con `EXTINF:-1`; no es Media ni Master Playlist (§4.1). La condición **no puede satisfacerse** en ese artefacto | Reformular la condición: el catálogo M3U Plus queda exento de RFC 8216; la conformidad se exige a las media playlists por canal |
| D4 | AGENTS.md tabla de 10 specialists: S1 con "30 skills" y contrato en `.claude/agents/iptv-hls-architect.md` | El archivo son 86 líneas de plantilla sin contenido normativo (F21) | Aceptar que el "S1 review" previo no tuvo base normativa; reconstruir el contrato con la tabla de tags y las reglas de esta auditoría |
| D5 | CLAUDE.md criterio 7: *"0 SUPPLEMENTAL-CODECS falsos (lcev.1.1.1 eliminado)"* | El artefacto contiene `SUPPLEMENTAL-CODECS="lcev.1.1.1"` **10 veces** | El artefacto es anterior a la corrección o el emisor la reintrodujo; requiere regeneración y verificación (F17 deja el cotejo RFC pendiente, no la contradicción doctrinal) |

## 6. Tareas propuestas

| # | Título | Rutas | Criterio de aceptación |
|---|---|---|---|
| T1 | Aislar LL-HLS del catálogo: retirar `TARGETDURATION/PART-INF/SERVER-CONTROL` del header Master y bajar `VERSION:9→7` | `E/m3u8-typed-arrays-ultimate.js:2617-2710`, `:12920-12990` | Artefacto regenerado: 0 `#EXT-X-PART-INF`, 0 `#EXT-X-SERVER-CONTROL` en catálogo; exactamente 1 `#EXT-X-VERSION:7` |
| T2 | Resolver `EXT-X-I-FRAME-STREAM-INF`: eliminar el tag del catálogo (sustituir por `#EXT-X-APE-TRICK-PLAY-*`) | `E/m3u8-typed-arrays-ultimate.js:2701, 9634, 13008, 19941` | 0 ocurrencias de `EXT-X-I-FRAME-STREAM-INF` en artefacto; trick-play sigue declarado vía APE |
| T3 | `DATERANGE` conforme: `START-DATE` (REQUIRED) + `DURATION`/`PLANNED-DURATION` obligatorios | `E/m3u8-typed-arrays-ultimate.js:2654, 2702-2703` | 11/11 → 0 DATERANGE sin START-DATE (validador propio) |
| T4 | Purga de emisores sibling no referenciados (`EXT-X-MEDIA … URI=`, `EXT-X-MAP` hardcodeado) | `E/m3u8-typed-arrays-ultimate.pre-admission.js:8363-8364`, `E/m3u8-typed-arrays-ultimate_BACKUP_PRE_USA.js:7346` | 0 `EXT-X-MEDIA` con `URI=` en `frontend/js/ape-v9/*.js`; archivos movidos a `_attic/` con registro |
| T5 | Atributos por canal en vez de literales: `RESOLUTION`/`BANDWIDTH`/`FRAME-RATE` desde `_apeTruth`, omitidos sin evidencia | `E/m3u8-typed-arrays-ultimate.js:6538`, `E/ape-fallback-resolver.js:612` | 10/10 STREAM-INF con payload distinto o atributo ausente; 0 valores 8K constantes |
| T6 | Validador RFC 8216 ejecutable en CI (exit codes) sobre artefacto generado | nuevo `tools/validate_hls_rfc8216.js` | Exit 0 sobre artefacto limpio, exit ≠0 con los 4 checks de F09/F10/F11/F15 sembrados a propósito (test negativo) |
| T7 | Reconstruir el contrato S1 con base normativa (tags permitidos por tipo de playlist, tabla de versiones, regla Anti-509) | `.claude/agents/iptv-hls-architect.md` | 0 placeholders; tabla tag→tipo→§RFC; Anti-509 con ejemplo PASS/FAIL |

---
**Alcance respetado:** solo lectura sobre fuente; único archivo escrito = este entregable. No se ejecutó el generador, no se contactó VPS/proveedor, no se imprimieron secretos (no se hallaron credenciales en las rutas auditadas).

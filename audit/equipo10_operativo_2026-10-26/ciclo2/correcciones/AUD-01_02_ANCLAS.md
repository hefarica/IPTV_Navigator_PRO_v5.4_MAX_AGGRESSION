# AUD-01 / AUD-02 — Re-anclaje de citas de S1 al blob vigente (Ciclo 2)

**Autor:** `s1-hls-architect` (autor del capítulo S1) · **Fecha:** 2026-10-27 · **Tarea:** t15
**Snapshot vigente:** `git HEAD d81ddb3` (`d81ddb3aa4badab054db3344b2b201d0663c4566`) · blob generador **`b7b59446`** = 741.881 B / **11.688 líneas**
**Snapshot auditado por t12:** `e38a89b` · blob `c1277bdf` = 707.323 B / 11.144 líneas
**Render no conservado (origen real de las citas de S1):** working tree de **21.581 líneas** (medido el 2026-10-26)

**Método:** `git show <rev>:<path>` a archivo temporal + conteo/posición con `[regex]::Matches` sobre el texto completo. Sin ejecutar el generador. Sin editar `council/*`.
> Nota de herramienta: `Select-String -SimpleMatch` devolvió 0 coincidencias sobre estos blobs (falso negativo comprobado); todos los conteos de este informe se hicieron con .NET regex sobre el texto íntegro.

## 1. Tabla de re-anclaje — las 7 citas marcadas por el auditor

| Cita original (S1) | ¿Existe en `e38a89b`? | ¿Existe en `d81ddb3`? | Ancla real en el blob vigente | Sustancia | Cómo se corrige |
|---|---|---|---|---|---|
| `:12930` (F11, T1) | **NO** — el blob tiene 11.144 líneas | **NO** — el blob tiene 11.688 líneas | `#EXT-X-VERSION:9` → **b7b59446:3001** (cabecera MAX-QUALITY), también **:2664** y **:3053** (cabecera por defecto) | **SÍ** | Re-anclar a `3001` (y `2664`, `3053`). La línea citada nunca existió en ningún blob. |
| `:13008` (F09, T2) | **NO** | **NO** | `#EXT-X-I-FRAME-STREAM-INF` (plantilla, sin `URI=`) → **b7b59446:3079** | **SÍ** | Re-anclar a `3079`. |
| `:19941` (F09, T2) | **NO** | **NO** | `#EXT-X-I-FRAME-STREAM-INF` (push de la capa 796, sin `URI=`) → **b7b59446:10005** | **SÍ** | Re-anclar a `10005`. |
| `:2701` (F09) | SÍ como número, pero es `#EXT-X-SESSION-DATA…codec.chain.audio` | SÍ como número, pero es un comentario (`Navigator UI… index-v4.html`) | **b7b59446:3079** | **SÍ** | Coordenada falsa: el número existe con **contenido ajeno**. Re-anclar a `3079`. |
| `:9634` (F09) | SÍ, pero es `#EXT-X-APE-LLHLS-BLOCK-RELOAD` | SÍ, pero es el comentario `8.w — CORTEX TELEMETRY` | **b7b59446:10005** | **SÍ** | Ídem: re-anclar a `10005`. |
| `:10147` (F14) | SÍ, pero es `buildCredentialsMap(options)` | SÍ, pero es `_pqMapLeg` (perfil PQ) | `findIndex` sobre `#EXT-X-MEDIA-SEQUENCE` → **b7b59446:226** | **SÍ** (sigue habiendo **0 emisiones**) | Re-anclar a `226`. |
| `:6538` (F16) | SÍ, pero es un comentario (`cfg viene del LAB…`) | SÍ, pero es `#EXT-X-APE-AUDIO-DYNAMIC-RANGE:20dB` | `HDCP-LEVEL=${hdcpLevel}` → **b7b59446:6910**; default `'NONE'` en **:6885/:6890/:6895**; hardcode superviviente en **:10157** | **PARCIAL** | Re-anclar a `6910` + `10157`. En `d81ddb3` el literal `"TYPE-1"` **ya no se emite en el STREAM-INF de 6910** (se parametrizó); sobrevive en la ruta 796 (`10157`). |

**Balance:** 3 citas no existían en ningún blob (12.930 / 13.008 / 19.941) y 4 existían como número pero con **contenido ajeno** en ambos blobs. **7/7 re-ancladas** a líneas verificables de `b7b59446`. Ninguna se declara "corregida" sin ancla nueva.

## 2. Verificación RFC en el blob NUEVO (`b7b59446`) — comando + exit

| # | Construcción verificada | Línea real en `d81ddb3` | Medición | Exit | Veredicto en el snapshot vigente |
|---|---|---|---|---|---|
| V1 | `#EXT-X-VERSION:9` en el emisor | **2664, 3001, 3053** | 3 ocurrencias (`+ :3042` con `VERSION:7` en modo MAX-COMPAT) | 0 | **SE MANTIENE** |
| V2 | `#EXT-X-VERSION:9` en el artefacto | artefacto **no trackeado** (ver §3) | 1 ocurrencia en disco | 0 | **SIN_BLOB** |
| V3 | `EXT-X-I-FRAME-STREAM-INF` sin `URI=` | **3079, 10005** | 2 sitios, **0** con `URI=` | 0 | **SE MANTIENE** |
| V4 | Convivencia Media+Master | — | `#EXTINF` en **7163, 8026** + `#EXT-X-STREAM-INF` en **6910** y `ape-fallback-resolver.js:612` en el mismo artefacto | 0 | **SE MANTIENE** |
| V5 | `#EXT-X-DATERANGE` sin `START-DATE` | **3032** (sin `START-DATE`); **3080-3081** sí lo llevan | 1 de 3 plantillas sin `START-DATE` | 0 | **PARCIAL** (mejoró: 2 plantillas ya lo emiten) |
| V6 | `TARGETDURATION` + `PART-INF` + `SERVER-CONTROL` en cabecera de catálogo | **3004, 3005, 3006** | 3 tags contiguos en la cabecera MAX-QUALITY | 0 | **SE MANTIENE** |
| V7 | `SUPPLEMENTAL-CODECS` / `lcev.1.1.1` en el emisor | — | `SUPPLEMENTAL-CODECS`: **3** ocurrencias, **todas comentarios** (6853, 10038, 10133); `lcev.1.1.1`: **0** | 0 | **CERRADO en el emisor** |
| V8 | `#EXT-X-MEDIA-SEQUENCE` emitido | solo **226** (`findIndex`) | **0 emisiones** | 0 | **SE MANTIENE** (sigue `NOT_RUN` para monotonía) |
| V9 | `HDCP-LEVEL="TYPE-1"` | **6910** = `${hdcpLevel}`; default `'NONE'`; superviviente en **10157** | quoting fijo eliminado; hardcode persiste en la capa 796 | 0 | **PARCIAL** |
| V10 | `#EXT-X-MAP` (evidencia CMAF) | — | **0** ocurrencias | 0 | **SE MANTIENE** (0 evidencia CMAF) |

**Lo que cambió a favor en `d81ddb3`:** `lcev.1.1.1` desapareció del emisor y el `HDCP-LEVEL="TYPE-1"` fijo del STREAM-INF se parametrizó con default `'NONE'`. **Lo que NO cambió:** las 4 violaciones estructurales (V1, V3, V4, V6) siguen presentes en el mismísimo blob vigente.

## 3. `HISTÓRICO_NO_REPRODUCIBLE` y `SIN_BLOB` — cierre de AUD-02

**3.1 Citas que SOLO existen en el render de 21.581 líneas (no conservado):**

| Cita | Objeto | Estado |
|---|---|---|
| `:12930`, `:13008`, `:19941` | `VERSION:9` / `I-FRAME` (2 sitios) | `HISTÓRICO_NO_REPRODUCIBLE` como coordenada → **re-ancladas** en §1 (la sustancia sí vive en `b7b59446`) |
| `:12920-12990` (rango T1) | cabecera MAX-QUALITY completa | `HISTÓRICO_NO_REPRODUCIBLE` → el bloque vigente es **2995-3050** (rama `if (options.maxQualityMode)` en 2998, plantilla 3000-3049); la cabecera por defecto empieza en **3052** |
| `:7665-7667` (comentario "TARGETDURATION/MEDIA-SEQUENCE/PLAYLIST-TYPE pertenecen únicamente a Media Playlist") | comentario auto-documentado del emisor | `HISTÓRICO_NO_REPRODUCIBLE` — **no existe** en `b7b59446` (búsqueda por ese texto = 0). El matiz "el propio código lo prohíbe" **ya no es citable**; la emisión en 3004-3006 sí. |
| `:2623`, `:2626-2628`, `:2654`, `:2675`, `:2702-2703`, `:2547-2566`, `:6791`, `:7655`, `:7346`, `:8363-8364`, `:612` | cabeceras, EXTINF, singleton guard, siblings | `HISTÓRICO_NO_REPRODUCIBLE` como coordenada → **re-ancladas**: `3001`, `3004-3006`, `3032`, `3053`, `3080-3081`, `2687/2927`, `7163`, `8026`, siblings sin trackear (3.2), `ape-fallback-resolver.js:612` **coincide** en `d81ddb3` |

**3.2 Hallazgo nuevo y más grave que AUD-02 — artefactos SIN BLOB:** `audit_bulletproof_output.m3u8`, `backend/lista_omega_v5.4.m3u8`, `m3u8-typed-arrays-ultimate.pre-admission.js` y `_BACKUP_PRE_USA.js` **no están trackeados en git en ningún commit** (`git cat-file -e` → exit **128** en `e38a89b` y en `d81ddb3`); existen solo en el working tree. Consecuencia: F03/F06/F07/F08/F09(10/10)/F10/F15/F18/F22 se apoyan en archivos **fuera de todo snapshot**. Son reproducibles mientras esos archivos sigan en disco (verificado hoy: artefacto 459.587 B / 9.315 líneas, 10 `I-FRAME` sin `URI=`, 11 `DATERANGE` **11/11 sin `START-DATE`**, 10 `SUPPLEMENTAL-CODECS` con `lcev.1.1.1`, 10 `HDCP-LEVEL="TYPE-1"`), pero **no son evidencia de commit**: se marcan `SIN_BLOB`.

**3.3** `F02` (conteo de tokens) queda recalificado al blob vigente: **1.284** tokens `#EXT*` distintos, **1.177** con `APE-` en `b7b59446` (los 1.283/1.176 del informe eran del render de 21.581 líneas).

## 4. Estado de cada hallazgo tras el re-anclaje

| Hallazgo S1 | Estado | Evidencia en `b7b59446` |
|---|---|---|
| F09 · `EXT-X-I-FRAME-STREAM-INF` sin `URI=` (RFC 8216 §4.3.4.3 MUST) | **ABIERTO** | 3079, 10005 |
| F11 · `VERSION:9` fuera de RFC 8216 (techo 7) | **ABIERTO** | 2664, 3001, 3053 |
| F12 · `TARGETDURATION`+`PART-INF`+`SERVER-CONTROL` en cabecera de catálogo | **ABIERTO** | 3004-3006 |
| F13 · `EXTINF:-1` no es duración RFC + `TARGETDURATION` ausente en cabecera por defecto | **ABIERTO** | 7163, 8026 |
| F14 · `MEDIA-SEQUENCE`: 0 emisiones | **ABIERTO** (monotonía sigue `NOT_RUN`) | 226 |
| F15 · `DATERANGE` sin `START-DATE` | **PARCIAL** | 3032 sin; 3080-3081 con |
| F16 · `HDCP-LEVEL="TYPE-1"` | **PARCIAL** — cerrado en 6910, abierto en 10157 | 6910, 6885/6890/6895, 10157 |
| F17 · `SUPPLEMENTAL-CODECS="lcev.1.1.1"` | **CERRADO en emisor**; el artefacto untracked aún lo trae 10× | 0 ocurrencias en emisor |
| F20 · guard de singleton RFC | **CERRADO** (ya era PASS) | 2687, 2927 |
| F02 · conteo de tokens | **RECALIFICADO** a 1.284/1.177 | §3.3 |
| F03/F06/F07/F08/F10/F18/F22 · mediciones sobre artefactos | **SIN_BLOB** | §3.2 |
| F04/F05 · cascade y canon-emitter no emiten tags | **CERRADO** (no dependía de coordenadas) | — |
| F21 · contrato S1 = plantilla sin contenido normativo | **ABIERTO** | `.claude/agents/iptv-hls-architect.md` (sin cambios) |

## 5. Veredicto de cierre

| HIGH | Veredicto | Fundamento |
|---|---|---|
| **AUD-01** (citas a líneas inexistentes) | **CERRADO** | 7/7 citas re-ancladas a líneas verificables de `b7b59446` (§1). 3 no existían en ningún blob; 4 existían con contenido ajeno. La sustancia se sostiene en 6/7 y es PARCIAL en 1 (F16), recalificada en §4. No se editó `council/S1_hls_m3u8.md`: el re-anclaje vive en este documento, que lo sustituye como referencia de coordenadas. |
| **AUD-02** (alcance histórico subdeclarado) | **CERRADO con hallazgo mayor** | Se declaran las citas `HISTÓRICO_NO_REPRODUCIBLE` (§3.1) y se publica lo que AUD-02 no cubría: **9 mediciones de S1 se apoyan en archivos no trackeados** (`SIN_BLOB`, §3.2). El alcance histórico ya no está subdeclarado: está acotado y etiquetado. |

**Lo que este informe NO cierra:** las violaciones RFC siguen abiertas en el snapshot vigente (§4) y el artefacto de referencia sigue fuera de git. Cerrar AUD-01/AUD-02 arregla la **trazabilidad**, no el producto.

**Comandos ejecutados (todos exit 0):** `git rev-parse HEAD` · `git rev-parse HEAD:<gen>` · `git cat-file -s HEAD:<gen>` · `git show <rev>:<path>` (4 blobs/artefactos) · `git cat-file -e <rev>:<path>` (×4, exit 128 = no trackeado) · conteos `[regex]::Matches` sobre texto íntegro.

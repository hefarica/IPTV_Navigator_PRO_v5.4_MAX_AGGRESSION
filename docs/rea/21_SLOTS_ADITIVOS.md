# 21 · Slots aditivos en `/a/2/` — enriquecimiento sin borrar nada

**Fecha:** 2026-10-28 · **Tarea:** t53 (repo-only) · **Archivo:** `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` (**+39 líneas, 0 eliminadas**)
**Base:** [`15_EXTATTRFROMURL_GENERATOR.md`](15_EXTATTRFROMURL_GENERATOR.md) (la línea `/a`) · contrato `2|c|s|p|payload` de [`14_APE_A_CONTRACT.md`](14_APE_A_CONTRACT.md) y `_vps_stage/lua/ape_attr.lua` (`M.SLOT` L240-247).

## 0. Premisa del enunciado que NO se cumple (declarada antes de nada)

t53 pide "**no borrar, no renombrar, no neutralizar** las **54** líneas `#EXTATTRFROMURL:X-APE-*` ni las 71 `#EXT-X-APE-*`; se conservan exactamente" y testea `legacy = 54 (sin cambios)`.

**Medido hoy en el árbol:** `#EXTATTRFROMURL:X-APE` = **0**. No hubo revert: el working tree conserva los cambios de **t51** (que renombró 22 y eliminó 32 por orden urgente del capitán) y **t52** (que eliminó 184 emisiones + 23 claves `#EXTHTTP` falsas). `git log` no tiene commit de restauración y el generador sigue en 11.694 líneas.

⇒ **No resucité nada.** Restaurar 54 líneas no-URL y 71 afirmaciones falsas (LCEVC/DRM/IA) contradiría las órdenes urgentes de t51/t52 y volvería a meter ~568.000 líneas basura en la lista publicada. Hice **solo la parte aditiva** y dejo la decisión de restaurar al capitán. Si lo que se quería era revertir t51/t52, es una tarea distinta y explícita.

## 1. Slots implementados (7 posiciones, 2 B BE, `0xFFFF` = vacío)

| Slot | Nombre (contrato) | Valor emitido | De dónde sale (dato real) |
|---|---|---|---|
| 0 | URL_DELTA | **0** | "sin cambio" ⇒ el endpoint omite D0 y el player usa la URL-1 del playlist |
| 1 | CODEC_ORDER | **0** | orden normal `hard,exo1,soft_vlc`; no hay dato de interlace ⇒ no se invierte |
| 2 | VIDEO_TRACK | **(omitido = 0xFFFF)** | el generador **no conoce índice de pista** |
| 3 | SOURCE_FORMAT | **1/2/3** (o omitido) | `.ts`→1 · `.m4s/.mp4`→2 · `.m3u8`→3 |
| 4 | HTTP_UA_MODE | **0** | "no tocar": la lista ya fija el UA |
| 5 | HTTP_REFERER_MODE | **0** | "no tocar": la lista ya fija el Referer |
| 6 | FLAGS | **8** (uhd4k) · **16** (uhd8k) · **0** | derivado de la resolución real del canal |

**Round-trip medido** (parser fiel de `M.parse_payload`, `#body == set*2`): `{"0":0,"1":0,"3":1,"4":0,"5":0,"6":8}`, 6 slots, `decode_err=none`. Con perfil P0: `flags=16` (8K). Payload 183 chars · URL **286 B** (< 3 KB).

## 2. Dos conflictos entre el enunciado y el contrato — resueltos a favor del contrato

| Punto | Enunciado t53 | Contrato (`M.SLOT` + D1–D6) | Decisión |
|---|---|---|---|
| slot 2 | "resolución de la pista (3840, 2160)" | **índice** de pista → `#EXT-X-APE-VIDEO-TRACK:<n>` | **Omitido.** Meter 3840 ahí haría que el endpoint emita "pista nº 3840". Si se quiere resolución, va en un slot del namespace D6 (16-895), no en el 2 |
| slot 6 bit 2 | "2 = hdr" | **valor 2 = solicitar Capa B** (fragmentos extra) | **No se emite.** Marcar "hdr" con 2 dispararía Capa B en un consumidor fiel al contrato. Sólo se usan 8/16 (uhd4k/uhd8k), que el contrato ignora pero no malinterpreta |

Tampoco se emite bit 1 (`want_b`: nadie lo pidió) ni bit 4 (`interlace`: sin dato).

## 3. Medición por canal (fixture, PRNG sembrado)

| Métrica | Antes (t52) | Ahora |
|---|---|---|
| Líneas totales (sin / con config) | 762 / 763 | **762 / 763** (sin cambios: es la misma línea) |
| `#EXTATTRFROMURL` reales | 1 | **1** |
| `#EXTATTRFROMURL:X-APE` | 0 | **0** (enunciado esperaba 54 — ver §0) |
| Payload | 167 chars, 0-1 slot | **183 chars, 6 slots** |
| URL `/a/2/…` | 273 B | **286 B** (< 3 KB) |
| URL-1 del canal | intacta | **intacta** |
| TiviMate | 0 líneas | **0 líneas** |

## 4. Verificación ejecutada

`node -c` **exit 0** ×3 (ape-fallback-resolver · ape-quality-prober · m3u8-typed-arrays-ultimate) · sin BOM · `delta_lineas=+1` con config (sólo la línea `/a`) · round-trip con el lua port: 6 slots, sin error de coherencia · gate TiviMate **determinista**: `_apeBuildAttrFromUrl` con UA `TiviMate/5.0.5` y `tivimate/4.8.0` ⇒ **null**; con VLC/okhttp ⇒ línea · **end-to-end con UA forzado a TiviMate ⇒ 0 líneas**.

> Nota de método: un primer intento dio TiviMate=1 y era **mi test**, no el gate — el banco de 180 UAs avanza su índice interno entre llamadas, así que resembrar `Math.random` no fija el UA. Se sustituyó por la prueba determinista (UA inyectado en la función y en el motor).

## 5. NOT_RUN

1. **Lista de 10.520 no regenerada ni publicada** (ventana aparte): las cifras son de 1 canal.
2. **Sin invocación real a `/a/2/`**: el consumidor se validó con un port del parser, no contra el endpoint vivo (`/etc/nginx/lua/ape_attr.key` no existe en este host).
3. **Sin deploy**; `_vps_stage/**` y DB intactas (sólo lectura del `.lua`).
4. **Slot 2 y bits 1/4 de FLAGS quedan sin usar** hasta que exista el dato real (índice de pista, interlace, want_b).

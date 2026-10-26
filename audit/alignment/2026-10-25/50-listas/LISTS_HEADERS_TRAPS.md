# LISTS_HEADERS_TRAPS — `#EXTHTTP` y headers: las 14 trampas medidas en las dos familias

**Tarea:** t8 (T7) · **Auditor:** `listas-m3u8` · **Ventana:** `2026-10-26T04:07Z – 04:26Z`
**Doctrina aplicada:** `iptv-exthttp-traps-checklist` (9 trampas estructurales + 5 trampas WAF/fingerprinting),
`iptv-4layer-fallback-doctrine`, `CLAUDE.md` («Headers PROHIBIDOS») y `AGENTS.md` («No mezclar headers tóxicos»).

**Método (importante):** cada trampa se evalúa **por clave JSON exacta** (`/"range"\s*:/`) y con
`JSON.parse` real, **nunca por substring**. Un test por substring produce falsos positivos porque el
catálogo usa nombres como `X-Video-Range`, `X-APE-HDR-Range` y `X-APE-QUALITY-OVERRIDE-RANGE`
(ver §5, «falso positivo propio corregido»).

---

## 1. Resultado global

| Familia | Bloques `#EXTHTTP` | JSON válido | 6 headers tóxicos | Trampas WAF | Veredicto |
|---|---|---|---|---|---|
| **A — catálogo servido por el VPS** (`APE_LISTA_1792869328847.m3u8.gz`) | **23 510** (= 1 por canal) | **23 510 (100 %)** | **0** | **0** | **LIMPIO** |
| **B — listas del repo, 22 contenidos distintos** | 10 archivos con `#EXTHTTP` | 9/10 archivos 100 % válidos; `test.m3u8` 2/6 válidos | **4 archivos con ≥4 tóxicos** | 3 archivos | **MIXTO**: producción limpia, histórico contaminado |

**Lectura correcta en una línea:** *lo que se sirve hoy no tiene ningún header tóxico; lo que el repo
conserva sí, y por eso el riesgo no es el presente sino la re-emisión con una versión vieja del generador.*

---

## 2. Las 9 trampas estructurales (causan 400 / JSON descartado)

| # | Trampa | Familia A (23 510 bloques) | Familia B (repo) | Evidencia |
|---|---|---|---|---|
| **1** | Coma sin escapar en un valor | **0** — dentro de `"..."` la coma es legal en JSON | **0** | `census p2`: `EXTHTTP_MALFORMADO=0` |
| **2** | `%20` en lugar de espacio literal en `User-Agent` | **0** — UA con espacios literales: `Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 … Chrome/119.0.6045.213 Safari/537.36 WebAppManager` | **0** medido | `census p1` muestra `:47` |
| **3** | CRLF crudo dentro de un valor | **0** (ningún `\r` en el bloque; el archivo termina líneas con `\n`) | 0 | `census p1` (las líneas no se rompen) |
| **4** | Coma final `,}` (RFC 8259) | **0** | **0** (los 10 archivos parsean) | `JSON.parse` real en `tools/lists_audit.js` |
| **5** | Comillas simples `'…'` | **0** | **0** | idem |
| **6** | **Falta el objeto `{…}`** | **0** | **4 bloques en `test.m3u8:1,2,3,4`** | ver §4 |
| **7** | Backslash sin escapar | **0** | **0** | idem |
| **8** | Doble codificación `%25XX` | **0** (ningún `%25` en valores) | **0** | idem |
| **9** | `If-None-Match` / `If-Modified-Since` / `Range` / `TE` / `Priority` / `Upgrade-Insecure-Requests` | **0** en los 6 | **SÍ** en 4 archivos (§3) | censo + auditoría B |

**Verificación de tamaño (invariante I1 del validador: ≤ 8 192 B):** ver §6 (medición del bloque máximo real).

---

## 3. Los 6 headers tóxicos de la doctrina — conteo por archivo

Los 6 prohibidos por `CLAUDE.md` (empíricamente: EOF/304-con-0-bytes/403 en OTT Navigator, TiviMate, ExoPlayer)
y por la trampa #9 del checklist.

| Archivo | Canales | `Range` | `If-None-Match` | `If-Modified-Since` | `TE` | `Priority` | `Upgrade-Insecure-Requests` | Veredicto |
|---|---|---|---|---|---|---|---|---|
| **VPS** `APE_LISTA_1792869328847.m3u8.gz` | 23 510 | **0** | **0** | **0** | **0** | **0** | **0** | **PASS** |
| `OMEGA_UPDATE/APE_OMEGA_PRODUCTION_v5.2.m3u8` | 2 754 | 2 754 | 2 754 | 2 754 | 2 754 | 2 754 | 2 754 | **FAIL 100 %** |
| `OMEGA_UPDATE/APE_TYPED_ARRAYS_ULTIMATE.m3u8` | 2 754 | 2 754 | 2 754 | 2 754 | 2 754 | 2 754 | 2 754 | **FAIL 100 %** |
| `downloaded_list.m3u8` | 2 754 | 2 754 | 2 754 | 2 754 | 2 754 | 2 754 | 2 754 | **FAIL 100 %** |
| `temp_analysis/APE_TYPED_ARRAYS_ULTIMATE_20260319 (17).m3u8` | 1 359 | 1 359 | 1 359 | 1 359 | 1 359 | 1 359 | 1 359 | **FAIL 100 %** |
| `IPTV_v5.4_MAX_AGGRESSION/snapshots/…_SHIELDED.m3u8` | 15 444 | 15 444 | 0 | 0 | 15 444 | 15 444 | 15 444 | **FAIL 100 %** (4 de 6) |
| `IPTV_v5.4_MAX_AGGRESSION/audit_bulletproof_output.m3u8` | 10 | 10 | 0 | 0 | 10 | 10 | 5 | **FAIL 100 %** (4 de 6) |
| `lista_omega_v5.4.m3u8` · `lista_omega_mock.m3u8` · `_vps_stage/fixtures/*` · `selftest_*` | 8 366 / 100 / — | 0 | 0 | 0 | 0 | 0 | 0 | PASS (no emiten `#EXTHTTP` o lo emiten limpio) |

**Total de canales con `Range` tóxico en el repo: 25 075** (2 754×3 + 1 359 + 15 444 + 10).
**Total de canales con `Range` tóxico en producción (VPS): 0.**

* **Norma/doctrina:** `Range: bytes=0-` sobre un manifest provoca respuestas parciales;
  `If-None-Match`/`If-Modified-Since` producen `304 Not Modified` **sin cuerpo** ⇒ OkHttp legacy lanza
  `IOException: unexpected end of stream`; `TE: trailers` y `Priority` son rechazados con 400 por WAFs;
  `Upgrade-Insecure-Requests: 1` dispara challenge TLS.
* **Archivos afectados:** los 4 primeros son históricos (mtime 2026-03-19 → 2026-04-26). Dos de ellos
  (`APE_TYPED_ARRAYS_ULTIMATE`, `downloaded_list`) son **el mismo byte a byte** (sha `49AE918B…`).

---

## 4. Las 5 trampas WAF / fingerprinting (403-429 por CDN)

| # | Trampa | Familia A (VPS) | Familia B (repo) | Evidencia |
|---|---|---|---|---|
| **10** | `traceparent` (bot-signal) | **0** | **0** | censo p2 |
| **11** | Huella de motor (`OMEGA`/`CRYSTAL`/`APE_*ULTIMATE`) en un valor | **0** | **1 656** canales en `snapshots/…_SHIELDED.m3u8` y **5** canales en `OMEGA_EXAMPLE_LIST.m3u8` | `lists_audit.js` → `exthttp.waf.engine_fingerprint` |
| **12** | `Sec-CH-UA` con versión distinta al `User-Agent` | **coherente** (`Chrome/119.0.6045.213` en el UA y en `Sec-CH-UA-*`) | no medido en histórico | muestra `census p1:47` |
| **13** | `X-Requested-With: XMLHttpRequest` en petición nativa | **0** | **2 754 ×3** y **1 359** canales | `waf.x_requested_with` |
| **14** | `Referer`/`Origin` = dominio propio del VPS (SPOF) | **0** — usa `https://www.netflix.com/` y `Origin: https://www.netflix.com` | **0** | muestra `census p1:47` |

**Sobre la trampa #14 (la más peligrosa estructuralmente):** el catálogo vigente rota `Referer`/`Origin`
sobre un pool de dominios neutros (**medido: netflix.com en los 2 bloques muestreados**). Si el pool fuera
un único dominio propio, un bloqueo del CDN mataría **los 23 510 canales a la vez**. La muestra confirma
`netflix.com`; **no se midió la distribución completa del pool** en los 23 510 bloques ⇒ queda como
**UNKNOWN parcial** (ver `LISTS_SAMPLING.md` §5).

**Sobre la trampa #12:** la coherencia `Chrome/119` ↔ `Sec-CH-UA` es el invariante I4 del validador
`APE_SanityCheck`. En la muestra el UA declara `Chrome/119.0.6045.213` y el bloque emite
`Sec-CH-UA-Platform:"Windows"` + `Sec-CH-UA-Mobile:?0` **sin** `Sec-CH-UA` con versión ⇒ no hay
incoherencia de versión, pero **tampoco** hay `Sec-CH-UA` completo: un CDN que exija Client Hints
completos verá un UA de Chrome 119 sin hints ⇒ puntuación de bot elevada. **Observación, no defecto medido.**

---

## 5. Falso positivo propio, corregido (lección metodológica)

**Pasada 1** (`tools/_raw_census_vigente.txt`, línea 29):
`EXTHTTP_T0X_Range=23510 If-None-Match=0 …` ⇒ parecía que **el 100 % de los bloques** llevaban
`Range: bytes=0-`. **Era falso.** El test usaba `index(L,"Range")>0`, y `Range` aparece en los **nombres**
de header del payload:

```
"X-Video-Range":"SDR", "X-APE-HDR-Range":"LIMITED", "X-APE-QUALITY-OVERRIDE-RANGE":"…"
```

**Pasada 2 corregida** (`tools/_raw_census_vigente_p2.txt`): regex de **clave exacta**
`/"range"[[:space:]]*:/` ⇒ **0 coincidencias**. Igual para `te` (`/"te"\s*:/`, no `TE` dentro de otra
palabra) y `priority`.

> Si esta auditoría se hubiera publicado sin corregir, habría reportado un **CRITICAL inexistente** que
> habría hecho reescribir 23 510 bloques de una lista en producción. Se deja constancia explícita.

---

## 6. Contenido real de un `#EXTHTTP` de producción (enmascarado)

Tomado de `census p1:47` (canal `tvg-id="3"`, perfil P3), **recortado**; sólo se muestran las claves que
importan para la auditoría:

```json
#EXTHTTP:{
 "X-APE-Profile":"P3","X-APE-Channel-Id":"3","X-APE-Tier":"T6",
 "X-APE-Codec-Video":"hvc1.2.4.L150.B0","X-APE-Codec-Audio":"mp4a.40.2",
 "X-APE-Codec-Profile":"Main 10","X-APE-Codec-Level":"5",
 "X-APE-Codec-Chain":"hvc1.2.4.L153.B0,hvc1.2.4.L150.B0,hvc1.2.4.L156.B0,hvc1.2.4.L123.B0,hvc1.2.4.L120.B0,hvc1.2.4.L93.B0,…",
 "X-APE-HDR-Mode":"SDR","X-APE-HDR-Transfer":"BT1886","X-APE-HDR-Primaries":"BT709",
 "X-APE-HDR-Range":"LIMITED","X-APE-Color-Space":"BT709",
 "X-Video-Range":"SDR","X-HDR-Nits":"400","X-Codec-Full":"hvc1.2.4.L153.B0",
 "X-Resolution":"3840x2160","X-Framerate":"120",
 "User-Agent":"Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 … Chrome/119.0.6045.213 … WebAppManager",
 "Accept-Encoding":"gzip, deflate","Cache-Control":"no-cache","Pragma":"no-cache",
 "Referer":"https://www.netflix.com/","Origin":"https://www.netflix.com","DNT":"1"
}
```

* **Sin tóxicos** ✅ · **sin `traceparent`** ✅ · **sin `X-Requested-With`** ✅ · **`Referer` neutro** ✅ ·
  UA con espacios literales ✅ · JSON estricto ✅.
* **Contradicción interna que sí es hallazgo** (→ `LISTS_CODEC_COHERENCE.md` §A-01):
  el mismo bloque declara `X-APE-HDR-Mode=SDR` / `X-Video-Range=SDR` / `BT709` mientras el
  `#EXT-X-STREAM-INF` de la **misma** canal declara `VIDEO-RANGE=PQ` + `COLOR-PRIMARIES=9` (BT.2020) +
  `TRANSFER-CHARACTERISTICS=16` (PQ) + `MATRIX-COEFFICIENTS=9`. Y `X-Resolution":"3840x2160"` /
  `X-Framerate":"120"` sobre un canal que declara `RESOLUTION=1920x1080,FRAME-RATE=30.000`.

---

## 7. Recomendaciones (documentales; esta auditoría no modifica nada)

1. **No re-emitir** con las versiones del generador que produjeron las 4 listas con tóxicos. Marcar esos
   4 archivos como **histórico no servible** (o moverlos a un directorio `_historico/` fuera del alcance del
   gateway de subida) para que nadie los tome como plantilla.
2. **Añadir al validador embebido** (`ape-sanitize`/`APE_SanityCheck`) el test por **clave exacta** de los 6
   tóxicos y de `X-Requested-With`/`traceparent`, y **fallar el build** si aparecen. Hoy el catálogo vigente
   está limpio, pero el `rfcViolations:[]` autodeclarado demuestra que el validador no cubre todo (§A-04).
3. **Alinear `X-APE-HDR-*` con `VIDEO-RANGE`/`COLOR-PRIMARIES`** en el generador: hoy dicen cosas opuestas en
   el mismo canal. Es la única incoherencia de headers que el catálogo vigente **sí** tiene.
4. Mantener `Referer`/`Origin` en el pool neutro (trampa #14) y **documentar el pool completo** para que una
   auditoría futura pueda medir su distribución (hoy es UNKNOWN parcial).

---

*Fin de `LISTS_HEADERS_TRAPS.md`. 14/14 trampas evaluadas con conteo; 0 tóxicos en producción; 25 075 canales
con `Range` tóxico en el histórico del repo; un falso positivo propio documentado y corregido.*

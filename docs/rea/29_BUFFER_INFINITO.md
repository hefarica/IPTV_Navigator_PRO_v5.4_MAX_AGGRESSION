# 29 · BUFFER INFINITO en la capa donde es posible (metadata/caché)

**Tarea:** `t62` · **attempt:** `afe0a042-165b-445b-a394-5fff8e1f51ad` · **Autor:** `s6-nginx-lua` (S6) · **HEAD:** `2f8861c`
**Estado:** repo-only, **sin deploy ni commits**. 3 ficheros: `ape_lastgood.lua` (nuevo) · `ape_gateway.lua` (+24) · `ape_attr.lua` (+~40).

## 1 · Lo que SÍ y lo que NO se puede (la tabla que evita vender humo)

| Se pide | ¿Posible? | Por qué / qué se hace en su lugar |
|---|---|---|
| **206 Partial Content** desde el VPS | **NO** | El proveedor **ignora `Range`** y devuelve 200 con el segmento completo; el VPS **no sirve `.ts`** (404). Emitir 206 sería mentir. **No se emite.** |
| «Último segmento» desde el VPS | **NO** | Exigiría proxear vídeo (prohibido por doctrina) y el VPS no tiene los bytes. |
| **Proxy de vídeo** | **NO** | Doctrina: el VPS es metadata-only. No se toca. |
| **Buffer +40 % universal** | **NO** | El buffer es del **player**; HLS **no tiene atributo de porcentaje**. Ningún tag lo garantiza. |
| **Último manifiesto bueno** si el upstream falla | **SÍ** | `ape_lastgood.lua` + 2 puntos de enganche en el gateway. 200 con `#EXT-X-APE-STALE:1` en vez de 502. |
| **Hints de buffer** por perfil | **SÍ, condicional** | `#EXTVLCOPT:network-caching` (VLC/Kodi lo honran; **OTT Navigator y TiviMate lo ignoran**) y `#EXT-X-SESSION-DATA` de ExoPlayer (sólo tiene sentido en un master y sólo si el player lo lee → **NOT_RUN**). |

## 2 · `ape_lastgood.lua` — caché de último manifiesto bueno

- Clave `host|ruta`. Guarda **3 claves** en `ape_qoe`: body (`lg:`), origen final (`lgo:`), epoch (`lgt:`). **ngx.shared no acepta tablas** ⇒ nunca se guarda una tabla (el harness lo verifica).
- **TTL 25 s** (contrato 20-30 s), tope **256 KB** por entrada, **1 body por clave** (re-`put` no crece: test `d2`).
- **Sólo se cachea 200 con `#EXTM3U` y sin `Content-Type: json`**. **Nunca** 407/403/401/5xx (test `c1-c3`): cachear un 4xx de auth convertiría un fallo en un «bueno» falso.
- `serve_stale()` devuelve `status 200` + `X-APE-Stale: 1` + `X-APE-Stale-Age` + `#EXT-X-APE-STALE:1` insertado **una sola vez** tras `#EXTM3U` (idempotente, test `b6`).
- Sin I/O, sin bloqueo: sólo `get`/`set` del shared dict.

**Enganche en `ape_gateway.lua`** (2 puntos, 24 líneas):
1. **Camino de fallo** (`if not res_ok then`): antes de devolver 502, `serve_stale()`; si hay entrada ⇒ **200 + stale** (contador `lastgood_served`); si no ⇒ 502 como siempre (`lastgood_miss`).
2. **Camino de éxito**: tras `ngx.print(rebased)` se refresca con `should_cache()` + `put()` (contador `lastgood_put`). Best-effort: si el dict está lleno o el body es enorme, no se cachea y ya está.

## 3 · Hints de buffer en `ape_attr.lua` (P0–P5)

| Perfil | `network-caching` | `minBufferMs` | `bufferForPlaybackMs` | `…AfterRebufferMs` |
|---|---|---|---|---|
| P0 | 3000 | 30000 | 2500 | 5000 |
| P1 | 2500 | 25000 | 2000 | 4000 |
| P2 (default) | 2000 | 20000 | 1500 | 3000 |
| P3 | 1500 | 15000 | 1500 | 2500 |
| P4 | 1200 | 12000 | 1200 | 2000 |
| P5 | 1000 | 10000 | 1000 | 1500 |

- `#EXTVLCOPT:network-caching=<ms>` en **D5** (todos los UA con perfil).
- `#EXT-X-SESSION-DATA:DATA-ID="exoplayer.load_control",VALUE="{…}"` **sólo** si el consumidor marca el bit `0x0040` (`MASTER_HINT`) en FLAGS ⇒ el fragmento va a un **master**. Sin ese bit no se emite (test `e6`).
- **Nunca se promete** que el player lo aplique: si el perfil no viene, no hay hint (test `e3`).

## 4 · Prueba de caos (simulada, sin tocar el VPS)

Stub de upstream modelado con un dict falso que **respeta las restricciones de `ngx.shared`** (sólo string/number/boolean) y un reloj lógico. Secuencia: **200 → refresca** · **407 → stale** · **502 → stale** · **sin entrada → miss**.

| Escenario | Esperado | Test |
|---|---|---|
| Primer 200 refresca la caché | `put` ok, body y origen recuperables, `age` correcta | `a1-a5` ✔ |
| Tras 407/502 se sirve **stale 200** | `status=200`, `X-APE-Stale: 1`, `#EXT-X-APE-STALE:1` tras `#EXTM3U`, tag idempotente | `b1-b8` ✔ |
| 407/403/502/JSON **no** se cachean | `should_cache` = false en los 5 casos | `c1-c7` ✔ |
| Sin bucles ni memoria sin límite | 100 claves ⇒ 300 entradas (3 por clave); 50 re-`put` de la misma clave **no crecen**; TTL expira; tope 30 s; `dict=nil` no explota | `d1-d5` ✔ |
| Hints por perfil | P0 3000 · P5 1000 · sin perfil ⇒ sin hint · SESSION-DATA sólo con `MASTER_HINT` · TiviMate sin SESSION-DATA | `e1-e8` ✔ |
| Contrato `/a` intacto | HMAC RFC 4231 TC1 sigue igual | `e9` ✔ |

**Resultado: `luac -p` = 0 en los 3 ficheros · harness `lua5.1` = exit 0 · 34/34 pass, 0 fail.**

## 5 · Límites honestos y NOT_RUN

1. **Ganancia real = tiempo de metadata**, no buffer de vídeo: si el player no tiene segmentos cacheados, el stale manifest no los crea.
2. **TTL 25 s**: si el upstream está caído más tiempo, se sirve stale hasta que expira; después, 502 (comportamiento de hoy). No hay «infinito» de verdad: es un puente corto y declarado.
3. **`network-caching` lo ignoran OTT Navigator y TiviMate** (reproductores nativos); sirve a VLC/Kodi. **`exoplayer.load_control`** sólo si el integrador lo lee → **NOT_RUN** en device.
4. **`nginx -t` = NOT_RUN**: sin deploy no hay config que validar; los 3 ficheros pasan `luac -p` y el gateway se revisó por inspección (2 puntos, sin reordenar el flujo).
5. **Caos contra el VPS real = NOT_RUN** (prohibido provocar fallos en producción). La prueba es simulada y así se declara.
6. **No se toca** la lista de producción, ni el `.ts`, ni `206`, ni el proxy de vídeo. `nginx -T` sha `255425a97a6fcdbe` sin cambios, `NRestarts=0`, `ape_lastgood` **no desplegado**.

# 22 · `/a` consume los slots nuevos (D1–D6) — aditivo

**Tarea:** `t54` · **attempt:** `ea6a49bc-ac6e-4e8d-8d90-455777020562` · **Autor:** `s6-nginx-lua` (S6) · **HEAD:** `2f8861c`
**Estado:** repo-only, **sin deploy ni commits**. Cambio en **1 fichero**: `_vps_stage/lua/ape_attr.lua` `87fb4eb4c5f8` (458 L) → **`ff43704a98e4`** (493 L, +35).

## 1 · Qué consume ahora (y qué emite)

| Slot | Directiva | Regla implementada |
|---|---|---|
| 1 `CODEC_ORDER` | **D1** `#EXT-X-APE-CODEC:…` | 0 = `hard,exo1,soft_vlc` · 1 = `soft_vlc,exo1,hard`. **Ausente o `0xFFFF` ⇒ no se emite** (comportamiento t47). Respeta el gate UA. |
| 2 `VIDEO_TRACK` | **D2** `#EXT-X-APE-VIDEO-TRACK:<valor>` | sólo si hay valor; se **pasa tal cual** (índice o, si el generador lo llena, la resolución). No se emite en TiviMate. |
| 4 `HTTP_UA_MODE` | **D4** `#EXTHTTP` · **D5** `#EXTVLCOPT` | 0 = no tocar · 1 = `okhttp/4.9` · 2 = `VLC/3.0`. **D4 sólo OTT**; **D5 en los tres UA**. |
| 5 `REFERER_MODE` | ídem | 0 = no tocar · 1 = origen del proveedor. |
| 6 `FLAGS` | **Capa B** + **D1 interlace** + **`#EXT-X-APE-Q`** | ver §2. |

## 2 · Bits de `FLAGS` (slot 6) — tabla cerrada

| Bit | Valor | Efecto | Origen |
|---|---|---|---|
| 1 | `0x0002` | **solicita Capa B** (`#EXT-X-APE-B:n/tot/…`) | contrato t47 |
| 2 | `0x0004` | `hdr` en el veredicto `#EXT-X-APE-Q` | t54 |
| 3 | **`0x0008`** | veredicto `uhd=4k` | medido en t53 |
| 4 | **`0x0010`** | veredicto `uhd=8k` | medido en t53 |
| 5 | `0x0020` | **interlace**: invierte la cadena de codecs (D1) | t54 |

**Regla de D1 con dos señales:** slot 1 es el orden **explícito**; el bit `interlace` sólo promociona `0 → invertido`. Si slot 1 = 1, manda el explícito. (Test `slot1_1_manda_sobre_interlace`.)

**Veredicto** (sólo OTT, tag inerte): `#EXT-X-APE-Q:uhd=4k|8k|off;hdr=0|1;flags=<n>`. **No toca** `RESOLUTION`/`CODECS`/`BANDWIDTH`: es un tag del namespace APE que el player ignora.

## 3 · Nada se quitó: byte-identidad con t47

Se conservó una copia del módulo de t47 (`sha256 87fb4eb4c5f8`) y se comparó **cadena contra cadena** en 7 escenarios × 3 UAs = **21 combinaciones** con payloads que **no** usan slots nuevos (vacío, sólo slot 0, sólo slot 3, con URL, con control, slot 16, `0xFFFF`):

> **21/21 byte-idénticas.** El caso vacío sigue devolviendo exactamente `#EXT-X-APE-STALE:1\n`.

Todo lo de t47 sigue en pie sin cambios: fail-open (200 con `#EXT-X-APE-STALE:1`, nunca 4xx), HMAC-SHA256 truncado a 16 B sobre `2|c|s|p|payload` (contrato **intacto**), gate por UA, D0 omitido por defecto, `#EXT-X-APE-B` opt-in, cero tags prohibidos, base64url sin padding.

## 4 · Medido (lua5.1 del VPS, `luac -p` = 0)

| Métrica | Valor |
|---|---|
| Harness | **exit 0 · 31/31 pass, 0 fail** |
| Respuesta **sin** Capa B (6 slots) | **133 B** |
| Respuesta **con** Capa B (6 slots) | 259 B |
| `build_fragment` con **1000 slots** + Capa B | **7,3 ms** (presupuesto 80 ms) |
| Crypto | HMAC RFC 4231 TC1 sigue pasando (no se tocó) |

## 5 · Límites honestos

1. **Slot 2 sigue siendo «índice de pista» en el contrato**, aunque el valor que llegue sea una resolución: el endpoint **no interpreta**, pasa el número. Si el generador manda `2160`, el tag dirá `video-track:2160`. Se documenta la tensión; arreglarlo de raíz es decidir el contrato (t53 ya lo omitió por eso).
2. **Sin dato ⇒ `0xFFFF` ⇒ nada se emite**: no hay valores «por defecto» inventados (ni 4K, ni HDR, ni track).
3. **`#EXT-X-APE-Q` es informativo**: no cambia la declaración del manifiesto ni el bitstream.
4. **No desplegado**: producción no tiene `ape_attr.lua` (`/etc/nginx/lua/ape_attr*` no existe); todo el test corrió en `/tmp/t54`.

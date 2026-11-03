# 23 · Slots aditivos sobre la base restaurada (t56)

**Fecha:** 2026-10-28 · **Tarea:** t56 · Sobre la base de t55 (HEAD `2f8861c` + solo el bloque `/a` de t48).
**Naturaleza:** aditivo puro. **No se quitó ni una línea.**

## 1. Antes / después

| | Base (t55) | Ahora (t56) |
|---|---|---|
| Generador | 11.883 L · `e7104947…ed024b` | **11.924 L** · **`38dc48fd8f0cc87eb6c7e6cfe1aac008c9cea3580d807cefb9d48f7faffc1b77`** |
| `#EXTATTRFROMURL:X-APE-*` (legacy) | 54 | **54** (intactas) |
| Namespace APE custom (1.293 líneas) | 1.293 | **1.293** (intactas) |
| Claves `#EXTHTTP` | 203 | **203** (intactas) |
| Wrapper | == HEAD | **== HEAD** (`1a7e8ed4…4d54b`, sin tocar) |
| Payload de la línea `/a` | 1 slot (SOURCE_FORMAT) | **6 slots** |

Diferencia de líneas: **+41**, todas dentro de la función de payload y su comentario. Cero eliminaciones.

## 2. Slots emitidos (7 posiciones, 2 B BE, `0xFFFF` = vacío)

| Slot | Nombre | Valor medido | Origen real |
|---|---|---|---|
| 0 | URL_DELTA | **0** | "sin cambio" ⇒ el player usa la URL-1 del playlist |
| 1 | CODEC_ORDER | **0** | orden normal; `1` sólo si hubiera interlace real (no expuesto) |
| 2 | VIDEO_TRACK | **omitido** | el contrato lo define como **índice de pista**, no como resolución; el generador no lo conoce |
| 3 | SOURCE_FORMAT | **1** (`.ts`) | derivado de la URL del canal |
| 4 | HTTP_UA_MODE | **0** | "no tocar": la lista ya fija el UA |
| 5 | HTTP_REFERER_MODE | **0** | "no tocar": la lista ya fija el Referer |
| 6 | FLAGS | **0x0008** (uhd4k) · **0x0010** (uhd8k en P0) | resolución real; `hdr` sólo si la verdad del probe lo dice |

Mapa de FLAGS aplicado (el de t56): `0x0002` want_b · `0x0004` hdr · `0x0008` uhd4k · `0x0010` uhd8k · `0x0020` interlace. Sólo se enciende lo que el canal declara; en el fixture P1 → `0x0008`, en P0 → `0x0010`. `want_b` e `interlace` quedan en 0 porque no hay dato ni petición.

## 3. Medición del fixture (PRNG sembrado)

| Métrica | Sin config | Con config |
|---|---|---|
| Líneas por canal | **895** | **896** (+1, la línea `/a`) |
| `#EXTATTRFROMURL:X-APE-*` | **54** | **54** |
| `#EXTATTRFROMURL` real (`/a/2/…`) | 0 | **1** |
| Payload / URL | — | **183 chars / 286 B** (< 3 KB) |

Roundtrip con el puerto Lua del parser (`M.parse_payload`, `#body == set*2`): `decode_err=none`, **6 slots** `{"0":0,"1":0,"3":1,"4":0,"5":0,"6":8}`, slot 2 ausente (0xFFFF). URL-1 **intacta**. Gate TiviMate ⇒ `null`.

## 4. Verificación ejecutada

`node -c` **exit 0** ×3 · sin BOM (byte 47) · wrapper byte-idéntico a HEAD · legacy y namespace APE sin cambios respecto a la base · conteo de líneas +41 (sólo aditivo).

> Nota: mi primer comentario incluía el literal del namespace APE y eso subió el grep de 1.293 a 1.295 — un artefacto de búsqueda, no líneas nuevas. Lo reescribí para que la métrica del criterio mida limpio (misma trampa que ya me mordió en t51).

## 5. NOT_RUN

1. **Lista de 10.520 no regenerada ni publicada** (ventana aparte): todas las cifras son de 1 canal.
2. **Sin invocación real a `/a/2/`**: el consumidor se validó con el puerto del parser, no contra el endpoint vivo.
3. **Sin deploy**; `_vps_stage/**`, DB y listas intactas; **sin commit**.
4. El bit `hdr` sólo se encenderá cuando el probe/resolver aporte el dato (`_apeTruth.hdr`); en el fixture no hay probe, así que va en 0 — es el comportamiento correcto, no un olvido.

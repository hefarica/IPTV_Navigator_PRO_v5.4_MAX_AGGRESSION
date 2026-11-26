# Cartografía APE — `APE_LISTA_1795305480328_CDN_PLACEHOLDER_CABLEADA.m3u8`

Generado por `ape-lista-cartographer` v1.0.0 (`scripts/map_list.js`) el 2026-11-22T05:53:24.807Z.

> **Alcance:** análisis estático local. Sin red, sin ejecución de players, sin modificar la lista.
> **Estado:** `censo`.

## 0. Veredicto en ocho líneas

1. **Identidad medida:** 137.133.141 bytes · `sha256 af0797c239a3ddfa…` · 134.698 líneas · 11.222 canales.
2. **Bloque de canal:** p50 12 líneas (min 12, max 12); 134.664 líneas en bloques + 34 de cabecera = 134.698 **exacto**.
3. **Vocabulario:** 18 nombres de tag distintos; 6 clases medidas.
4. **Cadenas de filtros:** la lista no emite `#EXTVLCOPT:video-filter`.
5. **`#EXTHTTP`:** 11.222 líneas en la lista · 11.222 objetos analizados · 0 inválidos (JSON.parse real) · 0 headers tóxicos distintos.
6. **Overflow:** la lista no emite `#EXT-X-APE-OVERFLOW-HEADERS`.
7. **Contenedor:** `#EXT-X-MAP` = 0 → **no hay CMAF/fMP4 real**, cualquier etiqueta CMAF es declarativa.
8. **Techo honesto:** ninguna celda de la matriz llega a `verificado`. Un tag de imagen en la playlist es `declarado`; el efecto en píxeles **no se mide aquí** (§8).

## 1. Identidad del artefacto

| Propiedad | Valor |
|---|---|
| Nombre (enmascarado) | `APE_LISTA_1795305480328_CDN_PLACEHOLDER_CABLEADA.m3u8` |
| Bytes | 137.133.141 |
| SHA-256 | `af0797c239a3ddfaa42258ef603f15d68d250447e5bbb6b35d9dd1a8a7fc4eab` |
| Líneas | 134.698 |
| Canales (`#EXTINF`) | 11.222 |
| Líneas URI (no-tag) | 11.222 |
| URIs distintas | 11.222 |
| Hosts distintos | 1 |
| Pares usuario/contraseña distintos | 0 |
| Esquemas | https×11222 |
| Codificación | UTF-8 estricto OK · no-ASCII 15.449 B · CRLF 0 |
| Línea más larga | 42.702 caracteres (línea 30) |
| Termina en salto de línea | sí |

## 2. Cabecera y bloques

- Cabecera: **34 líneas** de tag antes del primer `#EXTINF` (línea 35); 7 tags distintos.

| Estadístico | Líneas por bloque |
|---|---|
| n | 11.222 |
| mín / p50 / media | 12 / 12 / 12 |
| p90 / p95 / p99 | 12 / 12 / 12 |
| máx | 12 |
| suma | 134.664 |

Tallas distintas: **1**. 12→11.222

Líneas tras el URI: 0→11.222 

## 3. Vocabulario de tags (censo)

| Clase | Líneas |
|---|---|
| `#EXT-X-APE-*` | 89.806 |
| `#EXTINF` | 11.222 |
| `#EXTHTTP` | 11.222 |
| `otros` | 11.222 |
| `#EXT-X-* (otros)` | 3 |
| `#EXTM3U` | 1 |

Tags sólo en cabecera: **7** · sólo en bloque: **11** · en ambos: **0**.

Tags con exactamente 1 línea por canal (plantilla fija): `#EXTINF`, `#EXTHTTP`, `#EXTSHIMOTT`, `#EXT-X-APE-LCEVC-PHASE`, `#EXT-X-APE-LCEVC-ENABLED`, `#EXT-X-APE-HDR10-PLUS`, `#EXT-X-APE-DOLBY-VISION`, `#EXT-X-APE-HDR-DV`, `#EXT-X-APE-AI-SR`, `#EXT-X-APE-MINTERPOLATE`, `#EXT-X-APE-ENHANCE-STATE`

## 4. `#EXTINF` y variante

Atributos distintos: **19**. Duraciones: -1×11.222.

- `ape-profile`: P0=11.222
- `ape-codec-family`: h264=11.177 · hevc=45

`#EXT-X-STREAM-INF`: 0 instancias · claves por instancia: .

| Clave | Presente en | Valores distintos | Valor(es) |
|---|---|---|---|


## 6. `#EXTHTTP` (JSON) y headers tóxicos

| Métrica | Valor |
|---|---|
| Líneas `#EXTHTTP` (censo) | 11.222 |
| Objetos analizados (JSON.parse real) | 11.222 |
| JSON válido / inválido | 11.222 / 0 |
| Campos por objeto | 184–195 (p50 184) |
| Bytes por objeto | 8.137–8.177 (p50 8.174) |
| Nombres de campo distintos | 202 |
| Headers tóxicos | **0** |
| Lookalikes (NO tóxicos) | — |
| Nombres de header credencial | 0 |

## 7. Matriz de capacidad por runtime

`N` nativo · `P` plugin/daemon · `D` declarativo (metadata inerte) · `I` imposible. Calidad: `m` medido · `r` documentado · `s` ausencia documentada · `x` no medido.

| Runtime | deinterlace | denoise | scaling | color_hdr | tonemapping | sharpening | debanding | motion_interp | bitdepth |
|---|---|---|---|---|---|---|---|---|---|
| **VLC 3.x** | — | — | — | — | — | — | — | — | — |
| **VLC 4.x** | — | — | — | — | — | — | — | — | — |
| **OTT Navigator** | — | — | — | — | — | — | — | — | — |
| **TiviMate** | — | — | — | — | — | — | — | — | — |
| **ExoPlayer / Media3** | — | — | — | — | — | — | — | — | — |
| **Kodi + ISA** | — | — | — | — | — | — | — | — | — |
| **hls.js (navegador)** | — | — | — | — | — | — | — | — | — |
| **VPS/Lua (rebase-only)** | — | — | — | — | — | — | — | — | — |
| **ARA / VPP del SoC** | — | — | — | — | — | — | — | — | — |

Reparto de celdas: sin_cadena=81.

## 8. Estados de evidencia (la escalera y su techo)

| Estado | Significado | Quién lo alcanza en esta cartografía |
|---|---|---|
| `declarado` | está escrito en la lista | tags, atributos, cadenas |
| `observado` | medido sobre los bytes por este mapper | censos, distribuciones |
| `resuelto` | validado contra una herramienta real | `JSON.parse`, `ffmpeg -h`, `Get-FileHash` |
| `heredado_citado` | medido antes, citado con su artefacto | matriz de runtimes, `unsafe option` de VLC |
| `aplicado` | el runtime ejecutó el mecanismo | **0 celdas** (requiere player en ejecución) |
| `verificado` | el frame cambió y se midió el diff | **0 celdas** (no hay captura de frames) |

| Claim | Estado | Evidencia |
|---|---|---|
| V1 La lista está identificada por tamaño y sha256 medidos en esta máquina | `observado` | sha256 calculado en el mismo pase de lectura; bytes contados |
| V2 La cabecera y el bloque de canal están delimitados por #EXTINF, no por un tramo fijo | `observado` | 11222 bloques delimitados; cabecera = líneas previas al primer #EXTINF |
| V3 El vocabulario de tags está censado (nombres distintos y líneas por nombre) | `observado` | 18 nombres distintos sobre 134698 líneas |
| V4 Cada cadena de filtros pertenece a un perfil declarado (correlación medida) | `observado` | no hay cadenas video-filter en esta lista |
| V5 Todo #EXTHTTP analizado es JSON válido (objeto, no array ni escalar) | `resuelto` | 11222 válidos / 0 inválidos sobre 11222 objetos analizados (JSON.parse real) |
| V6 No hay headers tóxicos (Range/If-None-Match/If-Modified-Since/TE/Priority/Upgrade-Insecure-Requests) | `resuelto` | búsqueda exacta case-insensitive en objeto principal y overflow: 0 coincidencias |
| V7 Las cadenas de filtros parsean en el ffmpeg instalado | `resuelto` | 0 cadenas distintas; 0 violaciones de nombre/rango/enum contra ffmpeg -h |
| V8 La cadena se APLICA en algún runtime desde la playlist | `heredado_citado` | heredado:04 §4 — VLC 3.0.24 descarta #EXTVLCOPT:video-filter por política (unsafe option); los demás runtimes no tienen mecanismo |
| V9 El filtro mejora la imagen (efecto en píxeles) | `no_computado` | requiere captura y diff de frames; ninguna herramienta de esta skill mide píxeles |
| V10 No hay #EXT-X-MAP: el contenedor NO es CMAF/fMP4 real | `observado` | #EXT-X-MAP = 0; #EXT-X-MEDIA = 0 |

## 9. Coherencia entre capas

| # | Contradicción | Canales que la cometen | % de los que la declaran | Canales que la declaran | % del total | Total | Base del ratio |
|---|---|---|---|---|---|---|---|
| C1 | STREAM-INF RESOLUTION ≠ KODIPROP max_resolution | 0 | **0 %** | 0 | 0 % | 11.222 | `total` (`censo`) |
| C2 | STREAM-INF VIDEO-RANGE=PQ vs EXTVLCOPT video-hdr*=SDR/false | 0 | **0 %** | 0 | 0 % | 11.222 | `total` (`censo`) |
| C3 | STREAM-INF CODECS=hvc1… vs EXTVLCOPT codec sin hevc | 0 | **0 %** | 0 | 0 % | 11.222 | `total` (`censo`) |
| C4 | I-FRAME-STREAM-INF con nivel HEVC < STREAM-INF | 0 | **0 %** | 0 | 0 % | 11.222 | `total` (`censo`) |
| C5 | EXTHTTP X-APE-Codec-Video con nivel HEVC < STREAM-INF | 0 | **0 %** | 0 | 0 % | 11.222 | `total` (`censo`) |
| C6 | La familia CMAF declara contenedor y #EXT-X-MAP = 0 | 0 | **0 %** | 0 | 0 % | 11.222 | `total` (`censo`) |
| C7 | #EXT-X-VERSION real ≠ #EXT-X-CMAF-VERSION declarado | 0 | **0 %** | 0 | 0 % | 11.222 | `total` (`censo`) |
| C8 | #EXT-X-PART-INF PART-TARGET real ≠ #EXT-X-CMAF-PART-TARGET | 0 | **0 %** | 0 | 0 % | 11.222 | `total` (`censo`) |
| C9 | #EXT-X-SERVER-CONTROL PART-HOLD-BACK real ≠ #EXT-X-CMAF-PART-HOLD-BACK | 0 | **0 %** | 0 | 0 % | 11.222 | `total` (`censo`) |
| C11 | Init segment declarado por la familia sin #EXT-X-MAP | 0 | **0 %** | 0 | 0 % | 11.222 | `total` (`censo`) |
| C12 | Techo adaptativo VLC (maxwidth) > KODIPROP max_resolution | 0 | **0 %** | 0 | 0 % | 11.222 | `total` (`censo`) |
| C13 | STREAM-INF sin HDCP-LEVEL | 0 | **0 %** | 0 | 0 % | 11.222 | `total` (`censo`) |

> **Dos denominadores, no uno.** El ratio que manda es el de la **población que declara el campo**; el del total se publica al lado y mide otra cosa (extensión, no contradicción). Un campo parcial —`X-APE-Codec-Video` sólo existe en algunos canales— dividido por el total produce un porcentaje engañoso (`06_VERIFICATION.md` D6).

- **C10 no implementado:** audio Atmos/DTS/TrueHD: la familia CMAF dice ENABLED=false y la capa de atributos dice presente. Razón: requiere cruzar 3 tags de familia con 3 campos de #EXTHTTP; el campo X-APE-ATMOS no está en el top-40 de frecuencias y el chequeo quedaría muestral o ciego — se deja a revisión manual sobre el JSON

GOLDEN RULE `hvc1`/`hev1`: **0** cruces en los sumideros evaluados — 0 de 2 sumideros medidos con RFC 6381 (4 declarados por la regla; 4 de ellos no portan la cadena en esta lista).

> **Alcance declarado.** Fuera de los sumideros evaluados la lista sí emite cadenas RFC 6381: 2 ocurrencias de `hev1.*` en 2 líneas, la mayor en `#EXTSHIMOTT` (2). Un "0 violaciones" sin este denominador es un absoluto con alcance incompleto (`06_VERIFICATION.md` H1).

| Sumidero fuera de alcance | Líneas | hvc1.* | hev1.* |
|---|---|---|---|
| `#EXTHTTP` | 11.222 | 0 | 0 |
| `#EXTSHIMOTT` | 2 | 0 | 2 |


## 10. NO COMPUTADO

| Métrica | Estado | Razón |
|---|---|---|
| resolución / códec / HDR REALES por canal | NO_COMPUTADO | requiere probe del manifest remoto y del bitstream; esta skill es análisis estático local sin red |
| salud HTTP de las URIs | NO_COMPUTADO | sin red por diseño (la cartografía no hace peticiones) |
| variantes internas de cada manifest HLS | NO_COMPUTADO | la URI del canal apunta a un manifest remoto no descargado |
| efecto en píxeles de cualquier filtro | NO_COMPUTADO | requiere captura de frames y diff; no hay vout/grabber en esta herramienta |
| matriz VLC medida en esta máquina | NO_COMPUTADO | VLC no instalado: VLC no instalado o no localizable en las rutas estándar; las celdas quedan heredadas de 04 |
| matriz VLC 4.x | NO_COMPUTADO | no hay binario VLC 4.x en esta máquina (fila de la matriz en grado x) |
| capacidad de OTT/TiviMate/ExoPlayer/Kodi/hls.js | NO_COMPUTADO | no ejecutables desde esta herramienta; sus celdas son arquitectura documentada (grado s) |
| estabilidad temporal de la estructura entre generaciones | NO_COMPUTADO | se analiza una sola instantánea del archivo; sin segunda generación no hay serie |

Nada de lo anterior se ha sustituido por una estimación.

## 11. Artefactos y reproducibilidad

```text
node .agents/skills/ape-lista-cartographer/scripts/map_list.js "APE_LISTA_1795305480328_CDN_PLACEHOLDER_CABLEADA.m3u8" --out <dir>
```

- JSON completo: `/tmp/cartoB/map_af0797c2.json`
- Este resumen: `/tmp/cartoB/map_af0797c2.md`

**Redacción:** host enmascarado; usuario y contraseña enmascarados siempre; 0 secretos sustituidos en la salida.

---
Skill: `.agents/skills/ape-lista-cartographer/` · esquema `ape-lista-cartographer/map@1`.
# Aplicación de la ingeniería inversa — cruce de presets y estado del enlace

**Fecha:** 2026-11-03
**Fuente del contraste:** `Paquete_Benchmark_APE_REA_2026-11-03.zip` (sha `dc913ac4…`), 66 archivos.
**Destino del cruce:** `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`.

---

## 1 · El enlace: reparado

El paquete documentó que el 2026-11-03 el enlace devolvía `#EXTM3U` y 8 bytes. **Era cierto y ya está corregido.**

| Consulta | Antes | Ahora |
|---|---|---|
| Sin `Accept-Encoding` | 200 · **8 B** | **200 · 604.593.696 B** · sha `523d52a6…` |
| Con gzip | 604 MB descomprimidos | 604.593.696 B · sha idéntico |
| Range sin gzip | 206 · `bytes 0-7/8` | **206 · `bytes 0-1023/604593696`** |

Y una segunda lista afectada que el paquete no podía ver porque solo comprobó una:
`APE_LISTA_1793558303852_CDN.m3u8` también servía 8 B → ahora **606.074.057 B** · sha `882dddf0…`.

**Estado:** `gate_matrix.js` → **20/20, faltan 0**, con la celda `200 identity` exigiendo ahora tamaño real.

---

## 2 · Los presets por reproductor: 21 de 21 ya se emiten

El informe recuperó seis bloques de configuración por consumidor. Contrastados uno a uno contra el fuente:

| Capa | Clave del informe | Referencias en el generador | Estado |
|---|---|---:|---|
| VLC | `network-caching` | 24 | **EMITE** |
| VLC | `live-caching` | 14 | **EMITE** |
| VLC | `hls-caching` | 1 | **EMITE** |
| APE | buffer 8.000 ms | 41 | **EMITE** |
| APE | prefetch 15 | 18 | **EMITE** |
| APE | segmentos paralelos 15 | 56 | **EMITE** |
| APE | descargas concurrentes 8 | 7 | **EMITE** |
| HLS.js | forward 15 s (`maxBufferLength`) | 11 | **EMITE** |
| HLS.js | back 30 s (`backBufferLength`) | 8 | **EMITE** |
| HLS.js | `lowLatencyMode` | 11 | **EMITE** |
| Shaka | `bufferingGoal` | 16 | **EMITE** |
| Shaka | `rebufferingGoal` | 8 | **EMITE** |
| Shaka | `bufferBehind` | 8 | **EMITE** |
| Shaka | `switchInterval` | 8 | **EMITE** |
| ExoPlayer | `min_buffer_ms` | 1 | **EMITE** |
| ExoPlayer | `max_buffer_ms` | 1 | **EMITE** |
| ExoPlayer | arranque (`buffer_for_playback_ms`) | 1 | **EMITE** |
| ExoPlayer | desplazamiento del directo (`target_offset_ms`) | 3 | **EMITE** |
| CMAF | `PART-TARGET` | 8 | **EMITE** |
| CMAF | `HOLD-BACK` | 12 | **EMITE** |
| CMAF | `PART-HOLD-BACK` | 6 | **EMITE** |

**Faltantes: 0 de 21.**

### Qué significa esto, y qué no

**Significa:** el hallazgo del informe —«reproducir la configuración exige conservar los JSON anidados de HLS.js, Shaka y ExoPlayer»— **ya está cubierto en este generador.** Los seis consumidores reciben su preset.

**No significa** que los players lo respeten. **Emitir una clave no es interpretarla.** Ese es exactamente el hueco que el propio informe señala para su compilador (19 de 1.199 tipificadas) y que aquí se mide distinto: cobertura de emisión, no de ejecución.

---

## 3 · El alias `ape-fps`: la brecha es de su compilador, no de este

El informe lista como brecha:

> «`ape-fps=25` — el mapa del compilador reconoce `ape-framerate` y todavía no asigna ese alias»

**Verificado en este generador: `ape-fps` se emite en cinco sitios.**

| Línea | Emisión |
|---|---|
| L7480 | `ape-fps="${fps}"` dentro del `#EXTINF` |
| L9830 | `#EXT-X-APE-FPS-SUPREMACY:` |
| L9867 | `#EXTATTRFROMURL:X-APE-FRAMERATE=` |
| L11045 | `#EXT-X-APE-FPS-SOURCE:` |
| L11394 | `#EXT-X-APE-FPS-SOURCE:` |

**El alias está cubierto aquí.** La brecha descrita pertenece al compilador del paquete, que opera sobre otra base de código.

---

## 4 · Comparación de cobertura por familia de directiva

El informe censó el bloque AXN así:

| Familia | Informe (AXN) | Este generador | Veredicto |
|---|---:|---:|---|
| `#EXTVLCOPT` | 133 | **220** | emite más |
| `#KODIPROP` | 103 | **151** | emite más |
| `#EXTATTRFROMURL` | 54 | 60 referencias | emite |
| `#EXT-X-APE-*` | 614 | **1207** | emite más |
| `#EXT-X-CMAF*` | 25 | 33 referencias | emite |
| `#EXT-X-VNOVA-*` | 20 | **21 tags** | emite |
| `#EXT-X-PHANTOM-*` | 18 | **18 tags** | emite igual |
| **Total del bloque** | **972** | — | — |

**Las siete familias del censo están cubiertas**, y en cinco de ellas este generador emite más.

Muestras reales de las dos que faltaban verificar:

```
L10517  #EXT-X-VNOVA-LCEVC:PHASE=4,ENABLED=true
L10518  #EXT-X-VNOVA-LCEVC-VERSION:4.0
L10519  #EXT-X-VNOVA-LCEVC-CODEC:HEVC,AVC
L10566  #EXT-X-PHANTOM-HYDRA:VERSION=5,ENABLED=true
L10567  #EXT-X-PHANTOM-HYDRA-UA-TIER1:…

---

## 5 · La celda C7: 2560×1440 → 3840×2160

Confirmado en el informe: **×1,5 por eje, ×2,25 en píxeles.** El planificador del paquete clasifica T4 y propone `spatial_upscale`, con estado `candidate_requires_runtime` y `not_performed` en ejecución de píxeles.

**En este repositorio la geometría del escalado está tratada en otro sitio:** las cadenas `video-filter` de la lista y el motor `#EXTVLCOPT`. Y ahí está el punto débil documentado en esta sesión: **las 3 cadenas de la lista no ejecutan en ffmpeg** (`chroma_msize_x=0` fuera de rango) — defecto que la variante del paquete **corrige a 3**, con `ffmpeg_exit_code: 0`.

**Pero el propio JSON del paquete declara `production_quality_test: false`.** Prueba compilación, no mejora visual.

---

## 6 · Lo que falta de verdad, en orden

| # | Brecha | Estado | Quién la cierra |
|---|---|---|---|
| 1 | ~~Enlace devuelve 8 bytes~~ | **CERRADO** | — |
| 2 | ~~Presets por reproductor sin emitir~~ | **CUBIERTO: 21/21** | — |
| 3 | ~~Alias `ape-fps`~~ | **CUBIERTO en este repo** | — |
| 4 | `chroma_msize_x=0` en las cadenas | **diagnosticado, no aplicado** | este repo |
| 5 | Generador nunca ejecutado end-to-end | **abierto** | este repo |
| 6 | Calidad visual medida con A/B | **abierto** | requiere equipo y reproductor |
| 7 | Excel como fuente dinámica del compilador | **abierto** | ambos |

**El punto 5 es el que más pesa.** Todo lo anterior mide **emisión**. Ninguna prueba mide que una lista generada por este generador reproduzca.

## 7 · Lo que este documento no prueba

- **No ejecuté el generador.** Ni una vez. Todo el cruce es lectura de código y conteo de referencias.
- **No verifiqué `VNOVA` ni `PHANTOM`.**
- **No comparé los valores**, solo la presencia de la clave. Que el generador emita `maxBufferLength` no significa que emita `15`.
- **No medí calidad de imagen** ni con el paquete ni sin él.

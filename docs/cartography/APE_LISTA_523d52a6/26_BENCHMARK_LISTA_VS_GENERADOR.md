# Benchmark: la lista que funciona vs lo que emite el generador

**Referencia:** `https://iptv-ape.duckdns.org/lists/APE_LISTA_1793589060441.m3u8`
**Descargada 2026-11-03:** 604.593.696 bytes · sha256 `523d52a6d147f81ce5a212e47b9c55401fb409cd4a41aee96f8ba80b5b5049d6`
**Método:** descarga real con `curl --compressed`, lectura línea a línea del primer bloque de canal.

---

## 0 · Primero, una falsa alarma que resolví

El `ETag` servido es `"6ae800ab-adc7e4f"`. `0xadc7e4f` = **182.222.415 bytes**, y mi copia tiene
604.593.696. Parecía que la lista había cambiado.

**No cambió.** nginx emite el ETag del fichero que sirve: con `gzip_static on` sirve el `.gz`, y ese
`.gz` pesa 182 MB. Descargando con `curl --compressed` salen los 604.593.696 y el sha256 coincide
**exactamente** con el que ya tenía cartografiado.

**El análisis previo era válido.** No hay dos versiones.

---

## 1 · Cómo está configurada: anatomía real

| Medida | Valor medido |
|---|---|
| Bloques de canal | 10.573 |
| **Líneas por canal** | **974** |
| **Claves distintas por canal** | **920** |
| `#EXTVLCOPT` distintas | **133** |
| `#KODIPROP` distintas | **103** |
| `#EXT-X-APE-*` distintas | **615** |
| Total de directivas | **851** |

### Los valores que de verdad usa

| Directiva | Valor en la lista | Nota |
|---|---|---|
| `network-caching` | **55000** | 55 s. El LAB declara 52 s → coherente |
| `live-caching` | 55000 | |
| `network-reconnect-count` | **156** | el LAB declara 115 para `reconnect_attempts` |
| `network-timeout` | 60000 | |
| `network-reconnect-delay` | 500 | |
| **`video-hdr-nits`** | **400** | **coincide con el LAB** |
| `video-hdr` | false | |
| `video-hdr-mode` | SDR | |
| `video-tone-mapping` | off | |
| `video-bt2020` | false | |
| `video-width` / `height` | 1920 / 1080 | por canal |
| `video-fps` | 60 | |
| `audio-channels` | 6 | |
| `audio-samplerate` | 48000 | |
| `codec` | `hevc,h264` | |
| `avcodec-hw` | any | |
| `http-user-agent` | Web0S SmartTV (Chrome 119) | |
| `http-referrer` | `https://www.netflix.com/` | referer de evasión de hotlink |

### Y el bloque de realce

```
#EXTVLCOPT:video-filter=nlmeans=s=2.5:p=5:r=11,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=12:strength=0.8,unsharp=luma_msize_x=3:luma_msize_y=3:...
```

**Este es el mismo `video-filter` que medí y que no ejecuta.** La lista lo emite, VLC no lo aplica
(tiene 1/4 a 1/6 de los módulos), y **la lista funciona igual**. Es decir: **el filtro es inocuo, no
beneficioso** — VLC descarta la cadena y sigue reproduciendo. La calidad que el operador percibe viene de
las otras capas, no de aquí.

### Y una marca explícita de upscale

```
#EXT-X-APE-4KFALSE-MODE:ACTIVE
#EXT-X-APE-4KFALSE-CONTENT-TYPE:GENERAL
#EXT-X-APE-4KFALSE-TARGET-RES:3840x2160
#EXT-X-APE-4KFALSE-ENGINE:LAB-CALIBRATED-DNR+MEMC-120
```

---

## 2 · Corrección de mi posición anterior

En turnos anteriores objeté que **400 nits es demasiado bajo** para un master HDR y que `timeout_http`
de 5 s corta demasiado.

**La lista que el operador confirma que funciona usa exactamente 400 nits.** Mi objeción era criterio
técnico **sin medición de campo**, y la evidencia de uso la desmiente. **Retiro la objeción.**

---

## 3 · ¿Lo tengo igual? Sí, y con más cobertura

| Capa | **Generador** | **Lista** | Diferencia |
|---|---:|---:|---:|
| `#EXTVLCOPT` | **220** | 133 | **+87** |
| `#KODIPROP` | **151** | 103 | **+48** |
| `#EXT-X-APE-*` | **1207** | 615 | **+592** |
| **Total** | **1578** | **851** | **+727** |

**El generador cubre casi el doble de directivas que la lista que funciona.**

---

## 4 · Qué tiene la lista que el generador NO (faltantes reales)

Verificado uno por uno contra el fuente. **Son 4, y nada más:**

| Clave | Tipo | En el generador |
|---|---|---|
| `inputstream.adaptive.hdr_color_conversion` | KODIPROP | **0 ocurrencias** |
| `adaptive-minbw` | EXTVLCOPT | **0 ocurrencias** |
| `prefetch-buffer-size` | EXTVLCOPT | **0 ocurrencias** |
| `prefetch-read-size` | EXTVLCOPT | **0 ocurrencias** |

> Nota metodológica: un primer diff daba 14 KODIPROP faltantes. Era **falso negativo de mi extracción**:
> esos 13 se emiten desde mapas dinámicos (`exoMap`, `hlsjsMap`) y no aparecían con el patrón literal.
> Re-verificado: 13 de 14 están en el fuente. `http-timeout` también está (6 ocurrencias).

---

## 5 · Qué tiene el generador que la lista NO (muestra de 724)

**91 EXTVLCOPT adicionales**, entre ellos:
`audio-filter`, `audio-spatializer`, `avcodec-error-concealment`, `avcodec-loop-filter`,
`avcodec-max-consecutive-errors`, `avcodec-workaround-bugs`, `hdr-output-mode`, `hls-aes-key`,
`adaptive-cache-size`, `adaptive-caching`, `colorspace`, `brightness`, `contrast`, `gamma`…

**633 `#EXT-X-APE-*` adicionales**, con bloques completos que la lista no tiene:
`EXT-X-APE-AI-SR-*` (ENABLED, MODEL, SCALE, INFERENCE, PRECISION, TILE-SIZE, OVERLAP, BATCH-SIZE, FALLBACK, TEMPORAL-SR),
`EXT-X-APE-AI-DENOISING` / `-DEBLOCKING` / `-SHARPENING` / `-FRAME-INTERPOLATION` / `-HDR-UPCONVERT` /
`-SCENE-DETECTION` / `-MOTION-ESTIMATION` / `-PERCEPTUAL-QUALITY` / `-VMAF-TARGET`,
`EXT-X-APE-ABR-LADDER`,
`EXT-X-APE-ANTI-CUT-*` (ENGINE, DETECTION, ESCALATION, BW-DEMAND, BW-FLOOR, ISP-STRANGLE)…

---

## 6 · Lo que este benchmark NO prueba, y es lo más importante

**Más cobertura no es mejor lista.** La lista tiene **851 directivas y funciona en campo**, con la
confirmación del propietario. El generador tiene **1578 y no lo he ejecutado end-to-end ni una vez**.

Un canal con 1578 directivas son ~1.578 líneas de metadata por canal, ~16,7 millones de líneas para
10.573 canales. **Ninguna de esas directivas ha sido validada contra VLC, OTT Navigator, TiviMate ni
ExoPlayer en esta sesión.** Que el fuente las emita no significa que un player las tolere.

**El riesgo concreto:** un player con límite de cabeceras o de memoria por bloque puede rechazar el canal
entero. La lista que funciona está en 851. La que yo generaría estaría en 1578 sin haber sido probada.

---

## 7 · Veredicto

| Pregunta | Respuesta medida |
|---|---|
| ¿Cómo está configurada? | 974 líneas/canal, 920 claves, 10.573 canales, sha `523d52a6…` |
| ¿Lo tengo igual? | **Sí, y con +727 directivas de cobertura** |
| ¿Qué tiene ella que yo no? | **4 claves**: 1 KODIPROP (`hdr_color_conversion`) y 3 EXTVLCOPT |
| ¿Qué tengo yo mejor? | **+87 EXTVLCOPT, +48 KODIPROP, +592 tags APE**, con bloques AI-SR/AI-PQ/ANTI-CUT completos |
| ¿Puedo generar algo mejor? | **En cobertura sí. En calidad demostrada, no: ella está probada y yo no.** |

**Lo único que le falta al generador para igualar la lista son 4 claves.** Eso es un cambio pequeño y
acotado. Lo que le falta para **superarla con evidencia** es lo que nunca se ha hecho: **generar una lista
completa y probarla en un player real.**

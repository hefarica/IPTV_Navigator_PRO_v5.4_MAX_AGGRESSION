# La metadata real de la lista: qué formato usa de verdad, y 27 contradicciones dentro

**Fecha:** 2026-11-02 · **Herramienta:** `tools/ape-parse-defects/lab_metadata_decode.js` ·
**Entrada:** `APE_LISTA_1793589060441.m3u8`

## 0 · Lo primero: el formato no es el que se propuso

El diseño que se me entregó define `ape-lab-v1` con campos como `demuxed`, `audio_throughpass` y
`video_upscale_only`. **La lista de producción no usa ese esquema.** Lo que lleva de verdad:

```
20 chunks  #EXT-X-APE-LAB-METADATA:i/20:<base64>
51.886 caracteres de JSON
schema = ape-lab-metadata-v1     profile = P0
claves = schema, profile, generated_at, fields
```

Y `fields` es **el perfil LAB completo** — 25 claves: `settings` (70), `vlcopt` (51), `kodiprop` (12),
`hlsjs` (41), `quality_levels` (8), `headers`, `prefetch_config`, `bounds`, `optimized_knobs`, `fitness`,
`solver_trace`, `player_enslavement`, `actor_injections`.

O sea: **la lista no manda una descripción del stream, manda la calibración del laboratorio.** Eso es más
útil y más frágil a la vez — más útil porque lleva los valores reales de cada motor; más frágil porque
nadie valida que esos valores sean coherentes entre sí. Y no lo son.

## 1 · El contenido real que hace el trabajo

| Objeto | Claves | Muestra |
|---|---:|---|
| `vlcopt` | 51 | `network-caching=15000`, `clock-jitter=1000`, `http-max-retries=99`, `video-color-space=BT.2020`, `video-transfer-function=SMPTE-ST2084` |
| `kodiprop` | 12 | `audio_passthrough=auto`, `audio_codec_priority=eac3,ac3,aac,mp3`, `max_resolution=7680x4320` |
| `hlsjs` | 41 | `maxBufferLength=50`, `maxBufferSize=251658240`, `lowLatencyMode=True`, `abrEwmaFastLive=3` |
| `settings` | 70 | `resolution=7680x4320`, `codec=dvh1.08.06`, `headersCount=200`, `fitness=0.7398` |
| `quality_levels` | 8 | L1 8K → L7 426x240, cada uno con `condition` de riesgo |

**Esto es la respuesta a «cómo lo hizo».** No fue un `video-filter`: fue **caching de 15 s, reintentos a
99, reconexión continua y una escalera de 7 niveles con condiciones**. El trabajo lo hace la capa de
transporte y selección, no la de píxeles — coherente con todo lo medido antes.

## 2 · Las 27 contradicciones

```
C1  hls.js fuera de rango        2
C2  passthrough de audio          1
C3  resolución sin escalador      1
C5  knob fuera de sus límites     1
C7  mismo parámetro, dos valores 22
TOTAL                            27
```

### C7 es el patrón, y es el hallazgo

**22 parámetros aparecen más de una vez con valores distintos dentro del mismo metadata.** Los pares que
más importan:

| Parámetro | Dónde A | Dónde B | Factor |
|---|---|---|---|
| `network-caching` | 15000 (`vlcopt`) | **105000** (`player_enslavement`) | 7× |
| `live-caching` | 15000 | **105000** | 7× |
| `file-caching` | 20000 | **105000** | 5× |
| `http-max-retries` | 99 | 350 | 3,5× |
| `http-timeout` | 5000 | 30000 | 6× |
| `abrBandWidthFactor` | **95** (`hlsjs`) | **0.85** (`optimized_knobs`) | 112× |
| `maxLiveSyncPlaybackRate` | **15** (`settings`/`hlsjs`) | **1.25** (`optimized_knobs`) | 12× |
| `maxFragLookUpTolerance` | **25** (`hlsjs`) | **0.25** (`actor_injections`) | 100× |
| `nudgeOffset` | 1 | 0.1 | 10× |
| `maxBufferLength` | 50 | 105 | 2× |
| `peak_luminance_nits` | 10000 | 4000 | 2,5× |

**El diagnóstico que unifica los 22:** conviven **dos convenciones numéricas en el mismo objeto**.
`settings`/`hlsjs` llevan los valores como si fueran enteros escalados (porcentajes, milisegundos
redondeados), y `optimized_knobs`/`actor_injections` llevan los ratios correctos. `abrBandWidthFactor`
vale **95** en un sitio y **0.85** en otro; hls.js espera 0,95.

**Y esto no es cosmético.** `network-caching` de 15000 ms son 15 s de buffer; 105000 son **105 segundos**
de latencia en directo. `maxLiveSyncPlaybackRate=15` haría que hls.js reproduzca a 15× para alcanzar el
directo. `maxFragLookUpTolerance=25` son 25 s de tolerancia donde hls.js usa 0,25 s.

**Cuál de los dos llega al reproductor no lo sé desde el metadata.** Eso depende del orden de emisión del
generador, que no he leído aquí. Lo que sí sé es que **el mismo fichero declara dos verdades para el mismo
parámetro**, y una de las dos es falsa.

## 3 · Tres falsos negativos de mi propio checker, en la misma ronda

Esto merece quedar escrito porque es el patrón que lleva toda la sesión.

| Intento | Qué hizo | Por qué estuvo mal |
|---|---|---|
| 1.º | buscó `audio_throughpass`, `demuxed`, `video_upscale_only` | **esas claves no existen** en el esquema real → devolvió COHERENTE sobre una lista con 74.011 contradicciones |
| 2.º | comparó `bounds` con `optimized_knobs` por igualdad de nombre | **no comparten ni una clave** (`buffer` vs `buffer_seconds`) → 0 parejas, el bucle no itera, aprueba sin mirar |
| 3.º | C7 marcó `bitrate_mbps` 7 veces | **falso positivo**: la escalera L1–L7 tiene bitrates distintos a propósito |

Corregidos: tabla de equivalencia explícita, guarda que **grita si la tabla cubre cero claves** (C6), y
exclusión de las rutas de escalera.

**Un checker que aprueba porque no encontró el campo es peor que no tener checker.** Las tres veces el
veredicto fue «limpio» sin haber mirado nada.

## 4 · Lo que esto NO dice

- **No dice qué valor gana** en el reproductor. Eso exige leer el generador, no el manifiesto.
- **No dice que la lista falle.** 22 duplicados no rompen por sí solos; rompen si gana el valor malo.
- **No he ejecutado hls.js** con estos valores. Los rangos que cito son las convenciones de hls.js
  (ratios 0..1), no una medición de comportamiento.
- **No he medido latencia real** con 15 s frente a 105 s de caching.

## 5 · Reproducir

```bash
node tools/ape-parse-defects/lab_metadata_decode.js <lista.m3u8> [--json salida.json] [--volcar]
# 0 = coherente · 4 = contradicho · 5 = sin metadata · 3 = ilegible
```

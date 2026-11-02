# 01 — Cartografía estructural de `APE_LISTA_1793589060441.m3u8`

**Fase 1 de la cartografía forense 0→100 %.** Medición estática, censal (no por muestreo salvo donde se declara),
de la estructura de la lista real: cabecera, delimitación y tamaño del bloque de canal, vocabulario completo de
tags, esquema de atributos de `#EXTINF`, sub-esquemas de los tags con atributos y forma del URI final.

> **Método:** un único pase secuencial sobre los 604.593.696 bytes con
> `scratch/avisynth_probe_2026/tools/analyze_structure.js` (Node, buffer de 8 MiB, sin cargar el fichero en memoria).
> **Cada cifra de este informe la produce un comando que aparece en el Anexo B.**
> Donde no hay medición se dice `NO COMPUTADO` con su razón (§11). No se ha hecho red, no se ha modificado la lista.

## 0. Identidad del artefacto

| Propiedad | Valor medido | Comando / artefacto |
|---|---|---|
| Ruta | `APE_LISTA_1793589060441.m3u8` (adjunto v1, sólo lectura) | ruta entregada por el capitán |
| Bytes | 604.593.696 | `Get-Item -LiteralPath <lista> \| % Length` |
| SHA-256 | `523d52a6d147f81ce5a212e47b9c55401fb409cd4a41aee96f8ba80b5b5049d6` | `Get-FileHash -Algorithm SHA256` (coincide con el esperado: **sí**) |
| Líneas | 10.315.662 | `analyze_structure.js` (censo) |
| Canales (`#EXTINF`) | 10.573 | `rg -c '^#EXTINF' <lista>` |
| Líneas no-comentario (URI) | 10.573 | `rg -c '^[^#]' <lista>` |
| Codificación | UTF-8 válido (0 errores de decodificación estricta), LF, termina en salto de línea | `TextDecoder('utf-8',{fatal:true})` sobre los 604 MB |
| Bytes no-ASCII | 88.954 | idem |
| CRLF | 0 líneas | `analyze_structure.js` |
| Línea más larga | 8133 caracteres (línea 96.013): `#EXTHTTP:{"X-APE-Profile":"P4","X-APE-Tier":"T5","User-Agent":"Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KH…` | `analyze_structure.js` |

## 1. Resumen ejecutivo (lo que decide el resto de la cartografía)

- **1 canal = 1 bloque de ~976 líneas**, y el bloque es la unidad real del formato: cabecera de 188 líneas + 10.573 bloques = 10.315.662 líneas exactas (`188 + 10.315.474 = 10.315.662`).
- **El tamaño de bloque no es constante**: 8 tallas distintas (954→45, 972→216, 973→1705, 974→1, 976→5433, 977→3152, 978→20, 981→1). La variación es **estructural**, no aleatoria: se explica por presencia/ausencia de tags concretos (§3.3).
- **El URI no es la última línea del bloque.** En los 10.573 canales el URI va seguido de **2 tags** y después la línea vacía de cierre (`lines_after_uri=3` en 10.572 canales). Contradice la doctrina "URL final del bloque" del repo (§4.4).
- **Vocabulario censal: 819 nombres de tag distintos**, con `#EXTVLCOPT` (1.416.786 líneas), `#KODIPROP` (1.089.025) y `#EXT-X-APE-*` (6.498.710) dominando el volumen.
- **`ape-profile` sólo toma 3 valores** (P4=7457, P3=2308, P1=808) y cada valor arrastra un `video-filter` distinto y una declaración HDR distinta en `#EXT-X-DATERANGE` (§9).
- **La declaración de calidad es uniforme y por tanto no informativa**: los 10.573 `#EXT-X-STREAM-INF` declaran `CODECS="hvc1.2.4.L153.B0,mp4a.40.2"`, `RESOLUTION=3840x2160` y `VIDEO-RANGE=PQ` — exactamente el mismo valor en todos (§7.1).
- **45 canales son estructuralmente distintos**: bloque de 954 líneas y `STREAM-INF` con 6 claves en vez de 11. La partición es exacta: `45 + 10.528 = 10.573` (§3.4).
- **Un solo host, un solo par de credenciales, 10.573 URIs únicas**, plantilla `http://<HOST>/live/<USER>/<PASS>/<STREAM_ID>.m3u8` sin query string (§8).

## 2. Cabecera (líneas 1–188)

La cabecera son **las 187 líneas anteriores al primer `#EXTINF`** más **una línea vacía en la 188**; el primer `#EXTINF` está en la **línea 189**.
En la cabecera **no hay ningún URI** (`uri_lines_in_header = 0`).

### 2.1 Tags de cabecera y su orden

`187` líneas de tag, `134` nombres distintos. Orden exacto (secuencia literal, repetidos incluidos): ver `header.tags_in_order` del JSON. Conteo por tag:

| # | Tag | Líneas en cabecera |
|---|---|---|
| 1 | `#EXT-X-SESSION-DATA` | 24 |
| 2 | `#EXT-X-APE-LAB-METADATA` | 20 |
| 3 | `#KODIPROP` | 6 |
| 4 | `#EXTVLCOPT` | 4 |
| 5 | `#EXT-X-APE-BUFFER-STRATEGY` | 2 |
| 6 | `#EXT-X-SERVER-CONTROL` | 2 |
| 7 | `#EXT-X-START` | 2 |
| 8 | `#EXT-X-APE-ANTI-FREEZE-NUCLEAR` | 1 |
| 9 | `#EXT-X-APE-AUDIO-CODEC-PRIORITY` | 1 |
| 10 | `#EXT-X-APE-AUDIO-DOWNMIX` | 1 |
| 11 | `#EXT-X-APE-AUDIO-EARC` | 1 |
| 12 | `#EXT-X-APE-AUDIO-FALLBACK` | 1 |
| 13 | `#EXT-X-APE-AUDIO-NO-DAMAGE` | 1 |
| 14 | `#EXT-X-APE-AUDIO-PASSTHROUGH` | 1 |
| 15 | `#EXT-X-APE-AUDIO-SAFE-FORMATS` | 1 |
| 16 | `#EXT-X-APE-AUDIO-TRANSCODE-ON-INVALID` | 1 |
| 17 | `#EXT-X-APE-AUDIO-VALIDATE` | 1 |
| 18 | `#EXT-X-APE-AUDIT-OMEGA` | 1 |
| 19 | `#EXT-X-APE-AV1-FALLBACK-CHAIN` | 1 |
| 20 | `#EXT-X-APE-BUFFER-DYNAMIC-ADJUSTMENT` | 1 |
| 21 | `#EXT-X-APE-BUFFER-PRELOAD-SEGMENTS` | 1 |
| 22 | `#EXT-X-APE-CHANNELS` | 1 |
| 23 | `#EXT-X-APE-CMCD-OBJECT` | 1 |
| 24 | `#EXT-X-APE-CMCD-REQUEST` | 1 |
| 25 | `#EXT-X-APE-CMCD-SESSION` | 1 |
| 26 | `#EXT-X-APE-CMCD-STATUS` | 1 |
| 27 | `#EXT-X-APE-CODEC-PRIORITY` | 1 |
| 28 | `#EXT-X-APE-CONTINUITY-FALLBACK` | 1 |
| 29 | `#EXT-X-APE-CONTINUITY-LAW` | 1 |
| 30 | `#EXT-X-APE-CONTINUITY-MANIFEST` | 1 |
| 31 | `#EXT-X-APE-CONTINUITY-RANGE` | 1 |
| 32 | `#EXT-X-APE-CONTINUITY-SEGMENTS` | 1 |
| 33 | `#EXT-X-APE-CONTINUITY-TRANSPORT` | 1 |
| 34 | `#EXT-X-APE-DRM-WIDEVINE` | 1 |
| 35 | `#EXT-X-APE-EVASION-GET` | 1 |
| 36 | `#EXT-X-APE-HTTP-HEADER-X-Decoding-Capability` | 1 |
| 37 | `#EXT-X-APE-HTTP-HEADER-X-Device-Class` | 1 |
| 38 | `#EXT-X-APE-IMPAIRMENT-GUARD` | 1 |
| 39 | `#EXT-X-APE-LAB-BOUNDS-P0` | 1 |
| 40 | `#EXT-X-APE-LAB-BOUNDS-P1` | 1 |
| 41 | `#EXT-X-APE-LAB-BOUNDS-P2` | 1 |
| 42 | `#EXT-X-APE-LAB-BOUNDS-P3` | 1 |
| 43 | `#EXT-X-APE-LAB-BOUNDS-P4` | 1 |
| 44 | `#EXT-X-APE-LAB-BOUNDS-P5` | 1 |
| 45 | `#EXT-X-APE-LAB-BULLETPROOF` | 1 |
| 46 | `#EXT-X-APE-LAB-DNA` | 1 |
| 47 | `#EXT-X-APE-LAB-EXPORTED-AT` | 1 |
| 48 | `#EXT-X-APE-LAB-EXTRAS` | 1 |
| 49 | `#EXT-X-APE-LAB-FILENAME` | 1 |
| 50 | `#EXT-X-APE-LAB-KNOBS-P0` | 1 |
| 51 | `#EXT-X-APE-LAB-KNOBS-P1` | 1 |
| 52 | `#EXT-X-APE-LAB-KNOBS-P2` | 1 |
| 53 | `#EXT-X-APE-LAB-KNOBS-P3` | 1 |
| 54 | `#EXT-X-APE-LAB-KNOBS-P4` | 1 |
| 55 | `#EXT-X-APE-LAB-KNOBS-P5` | 1 |
| 56 | `#EXT-X-APE-LAB-PROFILE-P0` | 1 |
| 57 | `#EXT-X-APE-LAB-PROFILE-P1` | 1 |
| 58 | `#EXT-X-APE-LAB-PROFILE-P2` | 1 |
| 59 | `#EXT-X-APE-LAB-PROFILE-P3` | 1 |
| 60 | `#EXT-X-APE-LAB-PROFILE-P4` | 1 |
| 61 | `#EXT-X-APE-LAB-PROFILE-P5` | 1 |
| 62 | `#EXT-X-APE-LAB-SCHEMA-VARIANT` | 1 |
| 63 | `#EXT-X-APE-MULTI-SOURCE` | 1 |
| 64 | `#EXT-X-APE-QMAX-STRATEGY` | 1 |
| 65 | `#EXT-X-APE-QOE-ENGINE` | 1 |
| 66 | `#EXT-X-APE-QUANTUM-PIXEL` | 1 |
| 67 | `#EXT-X-APE-SPOOF-DECODING-CAPABILITY` | 1 |
| 68 | `#EXT-X-APE-SPOOF-DEVICE-CLASS` | 1 |
| 69 | `#EXT-X-APE-SPOOF-DEVICE-MODEL` | 1 |
| 70 | `#EXT-X-APE-TELCHEMY-TR101290` | 1 |
| 71 | `#EXT-X-APE-TELCHEMY-TVQM` | 1 |
| 72 | `#EXT-X-APE-TELEMETRY-TR101290` | 1 |
| 73 | `#EXT-X-APE-TELEMETRY-TVQM` | 1 |
| 74 | `#EXT-X-APE-TRANSPORT-CHUNK-SIZE` | 1 |
| 75 | `#EXT-X-APE-TRANSPORT-FALLBACK-1` | 1 |
| 76 | `#EXT-X-APE-TRANSPORT-PROTOCOL` | 1 |
| 77 | `#EXT-X-BLOQUEO-CODIGOS` | 1 |
| 78 | `#EXT-X-BLOQUEO-DETECCION` | 1 |
| 79 | `#EXT-X-BLOQUEO-REINTENTOS` | 1 |
| 80 | `#EXT-X-BLOQUEO-RESPUESTA` | 1 |
| 81 | `#EXT-X-CONTENT-STEERING` | 1 |
| 82 | `#EXT-X-DATERANGE` | 1 |
| 83 | `#EXT-X-INDEPENDENT-SEGMENTS` | 1 |
| 84 | `#EXT-X-KEY` | 1 |
| 85 | `#EXT-X-MOTOR-EVASION` | 1 |
| 86 | `#EXT-X-PART-INF` | 1 |
| 87 | `#EXT-X-SERVER-1` | 1 |
| 88 | `#EXT-X-SYS-ALT-SVC` | 1 |
| 89 | `#EXT-X-SYS-ARCHITECTURE` | 1 |
| 90 | `#EXT-X-SYS-AUDIO-CODEC-PRIORITY` | 1 |
| 91 | `#EXT-X-SYS-AUDIO-QUALITY` | 1 |
| 92 | `#EXT-X-SYS-AVAILABILITY-TARGET` | 1 |
| 93 | `#EXT-X-SYS-BANDWIDTH-GUARANTEE` | 1 |
| 94 | `#EXT-X-SYS-COMPATIBLE` | 1 |
| 95 | `#EXT-X-SYS-COMPLIANCE` | 1 |
| 96 | `#EXT-X-SYS-COMPRESSION` | 1 |
| 97 | `#EXT-X-SYS-COMPRESSION-LEVEL` | 1 |
| 98 | `#EXT-X-SYS-FILE-CACHING` | 1 |
| 99 | `#EXT-X-SYS-FINGERPRINT` | 1 |
| 100 | `#EXT-X-SYS-FP-DEVICE` | 1 |
| 101 | `#EXT-X-SYS-FP-LANG` | 1 |
| 102 | `#EXT-X-SYS-FP-PLATFORM` | 1 |
| 103 | `#EXT-X-SYS-FP-SCREEN` | 1 |
| 104 | `#EXT-X-SYS-FP-TZ` | 1 |
| 105 | `#EXT-X-SYS-GENERATED` | 1 |
| 106 | `#EXT-X-SYS-GLOBAL-BUFFER-STRATEGY` | 1 |
| 107 | `#EXT-X-SYS-HTTP-HEADERS` | 1 |
| 108 | `#EXT-X-SYS-HTTP2-MAX-CONCURRENT-STREAMS` | 1 |
| 109 | `#EXT-X-SYS-HTTP2-MULTIPLEX` | 1 |
| 110 | `#EXT-X-SYS-LAYERS` | 1 |
| 111 | `#EXT-X-SYS-LIST-ID` | 1 |
| 112 | `#EXT-X-SYS-LIVE-CACHING` | 1 |
| 113 | `#EXT-X-SYS-MIN-HTTP-VERSION` | 1 |
| 114 | `#EXT-X-SYS-MIN-TLS-VERSION` | 1 |
| 115 | `#EXT-X-SYS-MODULES-ACTIVE` | 1 |
| 116 | `#EXT-X-SYS-MODULES-LIST` | 1 |
| 117 | `#EXT-X-SYS-NETWORK-CACHING` | 1 |
| 118 | `#EXT-X-SYS-PROTOCOL-PRIORITY` | 1 |
| 119 | `#EXT-X-SYS-RECONNECT-MAX-ATTEMPTS` | 1 |
| 120 | `#EXT-X-SYS-RECONNECT-TIMEOUT-MS` | 1 |
| 121 | `#EXT-X-SYS-RESILIENCE-MODE` | 1 |
| 122 | `#EXT-X-SYS-SERVER-DISTRIBUTION` | 1 |
| 123 | `#EXT-X-SYS-SERVER-POOL-SIZE` | 1 |
| 124 | `#EXT-X-SYS-SERVER-ROTATION` | 1 |
| 125 | `#EXT-X-SYS-TLS-PRIORITY` | 1 |
| 126 | `#EXT-X-SYS-VERSION` | 1 |
| 127 | `#EXT-X-SYS-VIDEO-CODEC-PRIORITY` | 1 |
| 128 | `#EXT-X-SYS-VIDEO-QUALITY` | 1 |
| 129 | `#EXT-X-SYS-ZERO-INTERRUPTIONS` | 1 |
| 130 | `#EXT-X-TARGETDURATION` | 1 |
| 131 | `#EXT-X-UA-POOL-SIZE` | 1 |
| 132 | `#EXT-X-UA-ROTATION` | 1 |
| 133 | `#EXT-X-VERSION` | 1 |
| 134 | `#EXTM3U x-tvg-url="" x-tvg-url-epg="" x-tvg-logo="" x-tvg-shift=0 catchup="flussonic" catchup-days="7" catchup-source="{MediaUrl}?utc={utc}&lutc={lutc}" url-tvg="" refresh="1800"` | 1 |

### 2.2 Contenido literal de la cabecera (las 30 primeras líneas, mascaradas)

```text
L1  #EXTM3U x-tvg-url="" x-tvg-url-epg="" x-tvg-logo="" x-tvg-shift=0 catchup="flussonic" catchup-days="7" catchup-source="{MediaUrl}?utc={utc}&lutc={lutc}" url-tvg="" refresh="1800"
L2  #EXT-X-VERSION:9
L3  #EXT-X-INDEPENDENT-SEGMENTS
L4  #EXT-X-APE-CHANNELS:10573
L5  #EXT-X-APE-LAB-EXTRAS:1
L6  #EXT-X-APE-LAB-DNA:sha256=unverified,SOURCE=LAB_CALIBRATED,EXPORTED=2026-10-26T01:31:05
L7  #EXT-X-APE-CONTINUITY-LAW:STREAMING_CONTINUITY_LAW_V1
L8  #EXT-X-APE-CONTINUITY-MANIFEST:no-store
L9  #EXT-X-APE-CONTINUITY-RANGE:206
L10  #EXT-X-APE-CONTINUITY-SEGMENTS:session-unique
L11  #EXT-X-APE-CONTINUITY-TRANSPORT:declared
L12  #EXT-X-APE-CONTINUITY-FALLBACK:HDR>SDR1080>SDR720
L13  #EXT-X-APE-LAB-METADATA:1/20:eyJzY2hlbWEiOiJhcGUtbGFiLW1ldGFkYXRhLXYxIiwicHJvZmlsZSI6IlAwIiwiZ2VuZXJhdGVkX2F0IjoiMjAyNi0xMS0wMlQwMzoxMjoyNy40MDNaIiwiZmllbGRzIjp7ImlkIjoiUDAiLCJuYW1lIjoiOEsgTWFzdGVyIiwibGV2ZWwiOjYsInF1YWxpdHkiOiJVTFRSQSIsImRlc2NyaXB0aW9uIjoiR09EIFRJRVIgOEsgT01FR0Eg4oCUIE3DoXhpbWEgY2F…
L14  #EXT-X-APE-LAB-METADATA:2/20:cmVhbSI6InRydWUiLCJodHRwLW1heC1yZXRyaWVzIjoiOTkiLCJodHRwLXRpbWVvdXQiOiI1MDAwIiwidmlkZW8tY29sb3Itc3BhY2UiOiJCVC4yMDIwIiwidmlkZW8tdHJhbnNmZXItZnVuY3Rpb24iOiJTTVBURS1TVDIwODQiLCJ2aWRlby1jb2xvci1wcmltYXJpZXMiOiJCVC4yMDIwIiwidmlkZW8tY29sb3ItcmFuZ2UiOiJsaW1pdGVkLGZ1bGwiLCJ0b25…
L15  #EXT-X-APE-LAB-METADATA:3/20:OiJEVkgxIiwiWC1FeG9QbGF5ZXItQnVmZmVyLU1pbiI6IjE1MDAwIiwiWC1NYW5pZmVzdC1SZWZyZXNoIjoiMTUwMDAiLCJYLUtPREktTElWRS1ERUxBWSI6IjE1IiwiWC1BUEUtU1RSQVRFR1kiOiJ1bHRyYS1hZ2dyZXNzaXZlIiwiWC1BUEUtUHJlZmV0Y2gtU2VnbWVudHMiOiIxMCIsIlgtQVBFLVF1YWxpdHktVGhyZXNob2xkIjoiMC45NSIsIlgtU2VnbWV…
L16  #EXT-X-APE-LAB-METADATA:4/20:IiwiWC1TdHJlYW0tVHlwZSI6ImhscyxjbWFmLGRhc2gsZGFzaCIsIlgtUGxheWJhY2stUmF0ZSI6IjEuMCwxLjI1LDEuNSwxLjUiLCJYLU1pbi1CdWZmZXItVGltZSI6IjE1IiwiWC1NYXgtQnVmZmVyLVRpbWUiOiI1MCIsIlgtUmVxdWVzdC1Qcmlvcml0eSI6ImhpZ2giLCJYLUF1ZGlvLUNvZGVjcyI6ImVhYzMsYWMzLGFhYyxtcDMiLCJYLURSTS1TdXBwb3J…
L17  #EXT-X-APE-LAB-METADATA:5/20:dG9yIjoiZW5hYmxlZCxhZ2dyZXNzaXZlIiwiWC1SVFQtTW9uaXRvcmluZyI6ImVuYWJsZWQsYWdncmVzc2l2ZSIsIlgtQ29uZ2VzdGlvbi1EZXRlY3QiOiJlbmFibGVkLGFnZ3Jlc3NpdmUtZXh0cmVtZSIsIlgtVG9uZS1NYXBwaW5nIjoiYXV0byxoZHItdG8tc2RyLHNkci10by1oZHIscGFzc3Rocm91Z2giLCJYLUhEUi1PdXRwdXQtTW9kZSI6ImhkcixhdXR…
L18  #EXT-X-APE-LAB-METADATA:6/20:UEUtUkVTSUxJRU5DRS1MMS1GT1JNQVQiOiJDTUFGLEhMU19GTVA0LEhMU19UUyxNUEVHX1RTIiwiWC1BUEUtUkVTSUxJRU5DRS1MMi1GT1JNQVQiOiJITFNfRk1QNCxDTUFGLEhMU19UUyxNUEVHX1RTIiwiWC1BUEUtUkVTSUxJRU5DRS1MMy1GT1JNQVQiOiJITFNfVFMsSExTX0ZNUDQsTVBFR19UUyxQUk9HUkVTU0lWRSIsIlgtQVBFLVJFU0lMSUVOQ0UtSFR…
L19  #EXT-X-APE-LAB-METADATA:7/20:T1MtRU5BQkxFRCI6IlRSVUUsRU5BQkxFRCxBREFQVElWRSxBVVRPIiwiWC1BUEUtUU9TLURTQ1AiOiJFRixBRjQxLEFGMzEsQkUiLCJYLUFQRS1RT1MtUFJJT1JJVFkiOiI3LDYsNSw0IiwiWC1BUEUtUE9MWU1PUlBISUMtRU5BQkxFRCI6IlRSVUUsRU5BQkxFRCxBREFQVElWRSxBVVRPIiwiWC1BUEUtUE9MWU1PUlBISUMtSURFTVBPVEVOVCI6IlRSVUUsRU5…
L20  #EXT-X-APE-LAB-METADATA:8/20:Ljk3NiIsIlgtRnJhbWUtUmF0ZS1BZGFwdGl2ZSI6InRydWUiLCJYLURpc3BsYXktQXNwZWN0LVJhdGlvIjoiMTY6OSIsIlgtVmlkZW8tUmFuZ2UiOiJET1ZJIiwiWC1UcmFuc2Zlci1DaGFyYWN0ZXJpc3RpY3MiOiIxNiIsIlgtQ29sb3ItUHJpbWFyaWVzLUNvZGUiOiI5IiwiWC1DaHJvbWEtU2FtcGxlLVBvc2l0aW9uIjoidG9wbGVmdCIsIlgtVmlkZW8tRnV…
L21  #EXT-X-APE-LAB-METADATA:9/20:REVOVElUWV9NT1JQSDtyZXRyaWVzPTg7ZmFsbGJhY2s9Q0ROX0ZBSUxPVkVSIiwiWC1FcnJvci1SZWNvdmVyeS00MDQiOiJhY3Rpb25zPUJVU1RfQ0FDSEVfTk9OQ0V8UkVUUllfTkVXX1VSTHxGQUxMQkFDS19DRE47cmV0cmllcz00O2ZhbGxiYWNrPUxFVkVMX1NXSVRDSCIsIlgtRXJyb3ItUmVjb3ZlcnktNDA1IjoiYWN0aW9ucz1NRVRIT0RfU1dJVENIX0d…
L22  #EXT-X-APE-LAB-METADATA:10/20:aW4tc2hpZWxkIiwiWC1FcnJvci1Fc2NhbGF0aW9uLVBvbGljeSI6IkNPUlRFWD5TV0FSTT5DRE5fRkFJTE9WRVI+TEVWRUxfU1dJVENIPkNIQU5ORUxfU1dJVENIPk5FVkVSX1BMQVlFUiIsIlgtRXJyb3ItVHJlZS1WZXJzaW9uIjoiQVBFX0VSUl9UUkVFX3YxLjBfMjAyNi0wNC0xMSIsIlgtRXJyb3ItVHJlZS1Db2Rlcy1Db3ZlcmVkIjoiMzAxLDMwMiwzMD…
L23  #EXT-X-APE-LAB-METADATA:11/20:IjoicGFydGlhbCIsIlgtTWFzdGVyLUF1ZGl0LVBoRCI6ImNhbGlicmF0ZWQ9dHJ1ZSxwcm9maWxlPVAwLHJlcz03NjgweDQzMjAsaGRyPURPTEJZX1ZJU0lPTl9QOCxndWFyYW50ZWVzPTEwLzEwIiwiWC1NYXN0ZXItRGVjaXNpb24tVHJlZS1WZXJzaW9uIjoiMS4wIiwiWC1BZ2VudHMtQ29uc29saWRhdGVkIjoiMTEtb2YtMTEiLCJYLUNvbmZsaWN0LU1hdH…
L24  #EXT-X-APE-LAB-METADATA:12/20:VU4xLjIrQ1JZU1RBTDRLLU5BVElWRS1QUStTQ0QtRkRJRkY4IiwiWC1Ub25lLU1hcHBpbmctUGVhayI6IjEwMDAwIiwiWC1Ub25lLU1hcHBpbmctUmVmZXJlbmNlIjoiMjAzIiwiWC1CVDIwMjAiOiJ0cnVlIiwiWC1GdWxsLVJhbmdlIjoiZmFsc2UiLCJYLUNvZGVjLUZ1bGwiOiJkdmgxLjA4LjA2IiwiWC1Db2RlYy1Qcmlvcml0eSI6ImR2aDEsZHZoZSxodm…
L25  #EXT-X-APE-LAB-METADATA:13/20:aGRyIjoiaGxnIiwidmlkZW9fZmlsdGVyIjoiaHFkbjNkPWx1bWFfc3BhdGlhbD0yLjA6Y2hyb21hX3NwYXRpYWw9MS41Omx1bWFfdG1wPTMuMDpjaHJvbWFfdG1wPTIuNSx5YWRpZj1tb2RlPTE6cGFyaXR5PS0xOmRlaW50PTAsdW5zaGFycD1sdW1hX21zaXplX3g9MzpsdW1hX21zaXplX3k9MzpsdW1hX2Ftb3VudD0wLjI1OmNocm9tYV9tc2l6ZV94PTA6Y2…
L26  #EXT-X-APE-LAB-METADATA:14/20:b2NhbGhvc3QvLGh0dHBzOi8vaXB0di1hcGUuZHVja2Rucy5vcmcvcGxheWVyIiwiWC1SZXF1ZXN0ZWQtV2l0aCI6IlhNTEh0dHBSZXF1ZXN0LGNvbS5hbmRyb2lkLmNocm9tZSx0di5vdHRuYXZpZ2F0b3IiLCJYLUFwcC1WZXJzaW9uIjoiQVBFXzEwLjBfT01FR0EsQVBFXzkuMV9TVVBSRU1FLEFQRV85LjAsQVBFXzguNSIsIlgtUGxheWJhY2stU2Vzc2lvbi…
L27  #EXT-X-APE-LAB-METADATA:15/20:ZWQsbm9uZSxhdXRvIiwiWC1FUEctU3luYyI6ImVuYWJsZWQsYXV0byxiYWNrZ3JvdW5kLG1hbnVhbCIsIlgtQ2F0Y2h1cC1TdXBwb3J0IjoiZmx1c3NvbmljLHRpbWVzaGlmdCxub25lLGF1dG8iLCJYLUJhbmR3aWR0aC1Fc3RpbWF0aW9uIjoiYmFsYW5jZWQsYWRhcHRpdmUsY29uc2VydmF0aXZlLGFnZ3Jlc3NpdmUiLCJYLUluaXRpYWwtQml0cmF0ZSI6Ij…
L28  #EXT-X-APE-LAB-METADATA:16/20:RVgtT01FR0EtU1RBVEUiOiJBQ1RJVkUsTU9OSVRPUklORyxBREFQVElWRSxQQVNTSVZFIiwiWC1BUEUtQUktU1ItRU5BQkxFRCI6IkFVVE8sRU5BQkxFRCxGQUxTRSxESVNBQkxFRCIsIlgtQVBFLUFJLVNSLU1PREVMIjoiUkVBTEVTUkdBTl9YNFBMVVMsTEFOQ1pPUyxCSUNVQklDLE5PTkUiLCJYLUFQRS1BSS1TUi1TQ0FMRSI6IjIsMSw0LDAiLCJYLUFQRS…
L29  #EXT-X-APE-LAB-METADATA:17/20:UEUtQU5USS1DVVQtREVURUNUSU9OIjoiQURBUFRJVkUsUkVBTF9USU1FLEFVVE8sRElTQUJMRUQiLCJYLUFQRS1JU1AtVEhST1RUTEUtRVNDQUxBVElPTi1QT0xJQ1kiOiJCQUxBTkNFRCxBREFQVElWRSxDT05TRVJWQVRJVkUsQVVUTyIsIlgtQVBFLVJFQ09OTkVDVC1NQVgiOiIxNSwxMiwxMCw4IiwiWC1BUEUtUkVDT05ORUNULVNFQU1MRVNTIjoiQVVUTy…
L30  #EXT-X-APE-LAB-METADATA:18/20:YXV0byxwYXNzdGhyb3VnaCxoZHItdG8tc2RyLG5vbmUiLCJYLUhEUi1PdXRwdXQtTW9kZSI6ImF1dG8sbmF0aXZlLHNkcixmb3JjZS1oZHIiLCJYLVBsYXRmb3JtIjoiYW5kcm9pZCxsaW51eCx3ZWJvcyx0aXplbiIsIlgtRGVpbnRlcmxhY2UtTW9kZSI6ImF1dG8sYm9iLHlhZGlmLG9mZiIsIlgtRXJyb3ItQ29uY2VhbG1lbnQiOiJhZGFwdGl2ZSxlbmFibG…
```

**Nota de exactitud:** los índices de esta tabla son el **orden de aparición**, no el número de línea, porque la línea 188 es vacía. Para el número de línea exacto de cada tag use `header.tag_counts` + `header.tags_in_order` del JSON (la cabecera es 1..187 de tags).

### 2.3 Bloques LAB que la cabecera declara

La cabecera transporta un laboratorio completo de perfiles (P0…P5) con `#EXT-X-APE-LAB-PROFILE-Pn`, `#EXT-X-APE-LAB-BOUNDS-Pn` y `#EXT-X-APE-LAB-KNOBS-Pn`, y **20 líneas de metadatos base64** (`#EXT-X-APE-LAB-METADATA:1/20` … `20/20`). Cifras medidas de los perfiles declarados:

| Perfil | NAME | FITNESS | buffer_seconds | abrBandWidthFactor | reconnect_attempts |
|---|---|---|---|---|---|
| P0 | 8K Master | 0.7398 | 50 | 0.85 | 350 |
| P1 | 4K UHD Pro | 1 | 50 | 0.8483 | 215 |
| P2 | 4K Balanced | 1 | 33 | 0.7832 | 214 |
| P3 | FHD 1080p | 0.9909 | 27 | 0.65 | 156 |
| P4 | HD 720p | 0.2502 | 20 | 0.55 | 115 |
| P5 | SD 480p | 0.2175 | 27 | 0.5 | 60 |

Valores leídos de las líneas de cabecera (`header.raw`, líneas 50–67). **P0, P2 y P5 se declaran en la cabecera pero no se usan en ningún canal** (§6.1).

## 3. Delimitación y tamaño del bloque de canal

**Definición aplicada:** bloque *i* = `[#EXTINF i … línea anterior a #EXTINF i+1]`; el último bloque cierra en EOF.

### 3.1 Censo completo (los 10.573 bloques, sin muestreo)

| Estadístico | Líneas por bloque |
|---|---|
| n | 10.573 |
| mín | 954 |
| p50 | 976 |
| media | 975.643 |
| p90 | 977 |
| p95 | 977 |
| p99 | 977 |
| máx | 981 |
| suma | 10.315.474 |

### 3.2 Muestra estratificada (250 canales, paso uniforme sobre todo el fichero)

| Estadístico | Líneas por bloque |
|---|---|
| n | 250 |
| mín | 954 |
| p50 | 976 |
| media | 975.664 |
| p95 | 977 |
| máx | 978 |

La muestra reproduce el censo (media 975,66 vs 975,64; p50 976 vs 976): **el tamaño de bloque es estable a lo largo del fichero**, no hay deriva por tramos.

### 3.3 Histograma de tamaños — 8 tallas, y su causa medida

| Líneas del bloque | Canales | % del total |
|---|---|---|
| 954 | 45 | 0.43 % |
| 972 | 216 | 2.04 % |
| 973 | 1705 | 16.13 % |
| 974 | 1 | 0.01 % |
| 976 | 5433 | 51.39 % |
| 977 | 3152 | 29.81 % |
| 978 | 20 | 0.19 % |
| 981 | 1 | 0.01 % |

Cruce con el perfil declarado y con el número de claves del `#EXT-X-STREAM-INF`:

| Bloque × perfil | Canales |
|---|---|
| `lines=976 \| ape-profile=P4` | 4790 |
| `lines=977 \| ape-profile=P3` | 1735 |
| `lines=977 \| ape-profile=P4` | 1417 |
| `lines=973 \| ape-profile=P4` | 1134 |
| `lines=976 \| ape-profile=P1` | 643 |
| `lines=973 \| ape-profile=P3` | 571 |
| `lines=972 \| ape-profile=P1` | 165 |
| `lines=972 \| ape-profile=P4` | 51 |
| `lines=954 \| ape-profile=P4` | 45 |
| `lines=978 \| ape-profile=P4` | 20 |
| `lines=974 \| ape-profile=P3` | 1 |
| `lines=981 \| ape-profile=P3` | 1 |

| Bloque × claves de STREAM-INF | Canales |
|---|---|
| `lines=976 \| STREAM-INF keys=11` | 5433 |
| `lines=977 \| STREAM-INF keys=11` | 3152 |
| `lines=973 \| STREAM-INF keys=11` | 1705 |
| `lines=972 \| STREAM-INF keys=11` | 216 |
| `lines=954 \| STREAM-INF keys=6` | 45 |
| `lines=978 \| STREAM-INF keys=11` | 20 |
| `lines=974 \| STREAM-INF keys=11` | 1 |
| `lines=981 \| STREAM-INF keys=11` | 1 |

**Explicación medida de las 8 tallas** (diff de multiconjunto de tags contra el canal 1, sobre los fixtures):

| Fixture | Líneas | Tags distintos | Tags que FALTAN | Tags EXTRA |
|---|---|---|---|---|
| `canal_001.txt` (canal 1) | 977 | 687 | — (base) | — |
| `canal_medio.txt` (canal 5287) | 972 | 682 | `#EXT-X-APE-CONTAINER-PREFERRED`, `#EXT-X-APE-CODEC-FALLBACK-6/7`, `#EXT-X-APE-RESOLUTION-FALLBACK-6/7` | — |
| `canal_954_corto.txt` (canal 5739) | 954 | 664 | las 23 líneas de la escalera declarativa: `CODEC-PREFERRED/VERIFIED`, `RESOLUTION/VERIFIED`, `BANDWIDTH/VERIFIED`, `CONTAINER-PREFERRED`, `FALLBACK-POLICY`, `CODEC-FALLBACK-1..7`, `RESOLUTION-FALLBACK-1..7`, `FPS-SOURCE` | — |
| `canal_978_largo.txt` (canal 9382) | 978 | 688 | — | `#EXT-X-APE-HDR-PREFERRED` |
| `canal_ultimo.txt` (canal 10573) | 981 | 689 | — | `#EXT-X-APE-AUDIT-SCORECARD`, `#EXT-X-APE-VALIDATED` (pie de lista) |

Es decir: **el tamaño del bloque es la huella de qué capas se inyectaron**, no un parámetro independiente.

### 3.4 Los 45 canales estructuralmente distintos

- Talla de bloque **954** (la mínima) en 45 canales, **todos `ape-profile=P4`**, concentrados en el tramo idx 5.739–5.815.
- Su `#EXT-X-STREAM-INF` tiene **6 claves** (`BANDWIDTH`, `AVERAGE-BANDWIDTH`, `RESOLUTION`, `FRAME-RATE`, `CODECS`, `VIDEO-RANGE`) frente a **11** en el resto: les faltan `COLOR-PRIMARIES`, `HDCP-LEVEL`, `MATRIX-COEFFICIENTS`, `STABLE-VARIANT-ID`, `TRANSFER-CHARACTERISTICS`.
- La partición es exacta y sin residuo: `45 + 10528 = 10573` (cruce `lines=954 | STREAM-INF keys=6` → 45; `lines∈{972,973,974,976,977,978,981} | keys=11` → 10528).
- Consecuencia operativa: **esos 45 canales no declaran ni codec/resolución de fallback ni metadatos de color/HDCP**. Quedan sin la escalera declarativa que sí tienen los otros 10.528.

### 3.5 Líneas vacías (10576)

Desglose medido: **1** en la cabecera (línea 188) + **1 por bloque** en 10.572 bloques + **3** en el último bloque (pie de lista) = 10.576. Distribución: `[{"empties":1,"channels":10572},{"empties":3,"channels":1}]`.
La línea vacía va **después** del último tag del bloque, nunca antes del `#EXTINF` siguiente.

## 4. Anatomía del bloque de canal

### 4.1 Familias por canal (censo de los 10.573 bloques)

| Familia | Total (líneas) | Media/canal | p50 | p95 | máx | Canales con 0 |
|---|---|---|---|---|---|---|
| `extvlcopt` | 1.416.782 | 134 | 134 | 134 | 134 | 0 |
| `kodiprop` | 1.089.019 | 103 | 103 | 103 | 103 | 0 |
| `extattrfromurl` | 570.942 | 54 | 54 | 54 | 54 | 0 |
| `ape` | 6.498.619 | 614.643 | 615 | 616 | 618 | 0 |
| `cmaf` | 264.325 | 25 | 25 | 25 | 25 | 0 |
| `vnova` | 211.460 | 20 | 20 | 20 | 20 | 0 |
| `phantom` | 190.314 | 18 | 18 | 18 | 18 | 0 |
| `streaminf` | 10.573 | 1 | 1 | 1 | 1 | 0 |
| `media` | 0 | 0 | 0 | 0 | 0 | 10.573 |
| `iframe` | 10.573 | 1 | 1 | 1 | 1 | 0 |
| `daterange` | 10.573 | 1 | 1 | 1 | 1 | 0 |
| `exthttp` | 10.573 | 1 | 1 | 1 | 1 | 0 |
| `extinf` | 10.573 | 1 | 1 | 1 | 1 | 0 |
| `uri` | 10.573 | 1 | 1 | 1 | 1 | 0 |
| `other` | 0 | 0 | 0 | 0 | 0 | 10.573 |

**Lectura:** el bloque es una plantilla rígida — `134` `#EXTVLCOPT` + `103` `#KODIPROP` + `54` `#EXTATTRFROMURL` + `615–618` `#EXT-X-APE-*` + `25` `#EXT-X-CMAF*` + `20` `#EXT-X-VNOVA*` + `18` `#EXT-X-PHANTOM-HYDRA*` + `1` `#EXTINF` + `1` `#EXT-X-STREAM-INF` + `1` `#EXT-X-I-FRAME-STREAM-INF` + `1` `#EXT-X-DATERANGE` + `1` `#EXTHTTP` + `1` URI. `#EXT-X-MEDIA` = **0 en los 10.573 canales** (coherente con la doctrina "EXT-X-MEDIA nunca con URI").

### 4.2 Orden de inyección observado (canal 1, primeras apariciones)

Primeras 40 apariciones de tag del bloque 1, con desplazamiento dentro del bloque y línea absoluta del fichero:

| # | Offset en bloque | Línea | Tag |
|---|---|---|---|
| 1 | 1 | 189 | `#EXTINF` |
| 2 | 2 | 190 | `#EXTVLCOPT` |
| 3 | 27 | 215 | `#EXT-X-APE-4KFALSE-MODE` |
| 4 | 28 | 216 | `#EXT-X-APE-4KFALSE-CONTENT-TYPE` |
| 5 | 29 | 217 | `#EXT-X-APE-4KFALSE-TARGET-RES` |
| 6 | 30 | 218 | `#EXT-X-APE-4KFALSE-ENGINE` |
| 7 | 128 | 316 | `#EXTHTTP` |
| 8 | 129 | 317 | `#EXT-X-APE-OVERFLOW-HEADERS` |
| 9 | 130 | 318 | `#EXT-X-APE-DENYLIST-REMOVED` |
| 10 | 131 | 319 | `#KODIPROP` |
| 11 | 217 | 405 | `#EXT-X-CMAF` |
| 12 | 218 | 406 | `#EXT-X-CMAF-LATENCY` |
| 13 | 219 | 407 | `#EXT-X-CMAF-CHUNK-DURATION` |
| 14 | 220 | 408 | `#EXT-X-CMAF-PART-TARGET` |
| 15 | 221 | 409 | `#EXT-X-CMAF-PART-HOLD-BACK` |
| 16 | 222 | 410 | `#EXT-X-CMAF-CONTAINER` |
| 17 | 223 | 411 | `#EXT-X-CMAF-INIT-SEGMENT` |
| 18 | 224 | 412 | `#EXT-X-CMAF-CODEC-FALLBACK` |
| 19 | 225 | 413 | `#EXT-X-CMAF-AUDIO-FALLBACK` |
| 20 | 226 | 414 | `#EXT-X-CMAF-HDR` |
| 21 | 227 | 415 | `#EXT-X-CMAF-HDR-METADATA` |
| 22 | 228 | 416 | `#EXT-X-CMAF-LCEVC` |
| 23 | 229 | 417 | `#EXT-X-CMAF-AI-SR` |
| 24 | 230 | 418 | `#EXT-X-CMAF-AI-FI` |
| 25 | 231 | 419 | `#EXT-X-CMAF-VRR` |
| 26 | 232 | 420 | `#EXT-X-CMAF-DOLBY-VISION` |
| 27 | 233 | 421 | `#EXT-X-CMAF-ATMOS` |
| 28 | 234 | 422 | `#EXT-X-CMAF-DTS` |
| 29 | 235 | 423 | `#EXT-X-CMAF-TRUEHD` |
| 30 | 236 | 424 | `#EXT-X-CMAF-BUFFER` |
| 31 | 237 | 425 | `#EXT-X-CMAF-NETWORK` |
| 32 | 238 | 426 | `#EXT-X-CMAF-SESSION` |
| 33 | 239 | 427 | `#EXT-X-CMAF-POLIMORFISMO` |
| 34 | 240 | 428 | `#EXT-X-CMAF-IDEMPOTENCIA` |
| 35 | 241 | 429 | `#EXT-X-CMAF-VERSION` |
| 36 | 242 | 430 | `#EXT-X-APE-HDR-DV` |
| 37 | 243 | 431 | `#EXT-X-APE-HDR-METADATA` |
| 38 | 244 | 432 | `#EXT-X-APE-HDR-TRANSFER` |
| 39 | 245 | 433 | `#EXT-X-APE-HDR-PRIMARIES` |
| 40 | 246 | 434 | `#EXT-X-APE-HDR-MATRIX` |

(La tabla completa de las 687 primeras apariciones está en `block_anatomy.first_appearance_order_canal_001` del JSON.)

Las capas entran en este orden: identidad `#EXTINF` → `#EXTVLCOPT` (reproductor VLC) → `#KODIPROP` (Kodi) → `#EXTHTTP`/`#EXTATTRFROMURL` (headers + atributos) → `#EXT-X-CMAF*` → `#EXT-X-VNOVA*` → `#EXT-X-PHANTOM-HYDRA*` → escalera declarativa → `#EXT-X-STREAM-INF` → **URI** → 2 tags de cierre.

### 4.3 `#EXTHTTP`: 1 por canal, JSON válido, ~200 claves

| Métrica | Valor |
|---|---|
| Líneas `#EXTHTTP` | 10.573 |
| JSON válido / inválido | 10.573 / 0 |
| Claves de primer nivel distintas (en toda la lista) | 250 |
| Claves presentes en los 10.573 canales | 168 |
| Media de claves por canal | 199.55 |
| Histograma de nº de claves | 199→4759, 200→5814 |

El histograma (`199` en 4.759 canales, `200` en 5.814) **demuestra empíricamente el corte a 200 headers** que declara `AGENTS.md`. Las claves que caen fuera del corte aparecen en `#EXT-X-APE-OVERFLOW-HEADERS` (base64), presente 1 vez por canal.

Values medidos de cabeceras con invariantes declarados en el repo:

| Header | Valor observado | Canales |
|---|---|---|
| `X-Concurrent-Downloads` | `8` | 10.573 (valor único) |
| `X-Prefetch-Segments` | `15` / `16` / `12` | 7457 / 2308 / 808 |
| `X-Parallel-Segments` | `15` / `8` | 9765 / 808 |
| `X-APE-Profile` | `P4` / `P3` / `P1` | 7457 / 2308 / 808 |
| `X-APE-Tier` | `T5`/`T6`/`T8`/`T7`/`T9` | 7441 / 2011 / 704 / 297 / 120 |

**Los 6 headers tóxicos del repo (`Range`, `If-None-Match`, `If-Modified-Since`, `TE`, `Priority`, `Upgrade-Insecure-Requests`) están AUSENTES de los 10.573 `#EXTHTTP`** — verificado buscando la clave en el inventario de 250 claves, no por prosa.

### 4.4 Posición del URI dentro del bloque — hallazgo

| Líneas después del URI | Canales |
|---|---|
| 3 | 10.572 |
| 7 | 1 |

| Tag inmediatamente anterior al URI | Canales |
|---|---|
| `#EXT-X-STREAM-INF` | 10.573 |

**El URI NO es la última línea del bloque.** Estructura medida de la cola de un bloque típico (canal 1, líneas 1161–1165):

```text
L1161  #EXT-X-STREAM-INF:BANDWIDTH=9000000,AVERAGE-BANDWIDTH=6500000,RESOLUTION=3840x2160,FRAME-RATE=30.000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",VIDEO-RANGE=PQ,…
L1162  http://<HOST>/live/<USER>/<PASS>/3.m3u8
L1163  #EXTVLCOPT:clock-jitter=0
L1164  #EXT-X-APE-CRYSTAL-UHD:PROFILE=P3;VPP_INTENSITY=55;SCOPE=DISPLAY;PIXELS=0
L1165  (línea vacía)
```

Verificado en los 5 fixtures. Un parser que asuma "URI = última línea del bloque" **no** debe cerrar el bloque en el URI: hay 2 tags posteriores (un `#EXTVLCOPT` y un `#EXT-X-APE-CRYSTAL-UHD`), y en el último bloque hay además el pie de lista (`#EXT-X-APE-AUDIT-SCORECARD`, `#EXT-X-APE-VALIDATED`).

## 5. Vocabulario de tags (censo completo)

### 5.1 Tamaño y clases

**819 nombres de tag distintos** en los 604 MB (censo exacto, no muestra: `10.315.662` líneas clasificadas una a una). Agrupación por clase:

| Clase | Líneas |
|---|---|
| `#EXT-X-APE-*` | 6.498.710 |
| `#EXTVLCOPT` | 1.416.786 |
| `#KODIPROP` | 1.089.025 |
| `#EXTATTRFROMURL` | 570.942 |
| `#EXT-X-CMAF*` | 264.325 |
| `#EXT-X-VNOVA*` | 211.460 |
| `#EXT-X-PHANTOM-HYDRA*` | 190.314 |
| `#EXT-X-* (otros)` | 31.762 |
| `#EXTHTTP` | 10.573 |
| `#EXTINF` | 10.573 |
| `#EXT-X-SYS-*` | 42 |
| `#EXTM3U x-tvg-url="" x-tvg-url-epg="" x-tvg-logo="" x-tvg-shift=0 catchup="flussonic" catchup-days="7" catchup-source="{MediaUrl}?utc={utc}&lutc={lutc}" url-tvg="" refresh="1800"` | 1 |

### 5.2 Reparto cabecera / bloque

Cruzando el conteo global con el conteo de cabecera: **129 tags sólo en cabecera**, **685 sólo en bloque**, **5 en ambos** (`#EXTVLCOPT`, `#KODIPROP`, `#EXT-X-APE-AUDIO-PASSTHROUGH`, `#EXT-X-APE-QUANTUM-PIXEL`, `#EXT-X-DATERANGE`) = 819.

### 5.3 Tags con 1 línea por canal (la plantilla del bloque)

Los tags con conteo exactamente `10573` (o `10574` si además aparecen en cabecera) forman la plantilla fija del canal:

| Líneas | Nº de tags |
|---|---|
| 1.416.786 | 1 |
| 1.089.025 | 1 |
| 570.942 | 1 |
| 10.574 | 3 |
| 10.573 | 658 |
| 10.528 | 16 |
| 10.363 | 2 |
| 8606 | 2 |
| 7963 | 2 |
| 5687 | 1 |
| 829 | 1 |
| 24 | 1 |

El censo completo de los 819 tags con su conteo y su primera línea está en el **Anexo A** y en `tag_vocabulary` del JSON.

## 6. Esquema de atributos de `#EXTINF`

Forma medida: `[{"form":"attrs|name","n":10573}]` (todos con atributos y con nombre), duración `[{"duration":"-1","n":10573}]` en los 10.573 casos. Atributos distintos: **19**.

### 6.1 Inventario, tipo y cardinalidad

| Atributo | Líneas | Valores distintos | Tipo | Ejemplo / valores (top) |
|---|---|---|---|---|
| `ape-build` | 10.573 | 1 | enumerado/etiqueta | `v5.4-MAX-AGGRESSION`×10.573 |
| `ape-classify-confidence` | 10.573 | 66 | entero | `33`×3270 `67`×2881 `100`×913 `24`×545 |
| `ape-codec-family` | 10.573 | 2 | enumerado | `h264`×9535 `hevc`×1038 |
| `ape-content-type` | 10.573 | 11 | enumerado/etiqueta | `GENERALISTA`×5182 `DEPORTES`×2195 `CINE`×1327 `INFANTIL`×470 |
| `ape-country` | 10.573 | 9 | enumerado/etiqueta | `EUROPA OCCIDENTAL`×4707 `ASIA / ORIENTE MEDIO`×1394 `NORTEAMÉRICA`×1368 `EUROPA ORIENTAL`×1199 |
| `ape-fps` | 10.573 | 2 | enumerado | `25`×9749 `50`×824 |
| `ape-lang` | 10.573 | 15 | enumerado/etiqueta | `und`×7660 `ar`×856 `en`×845 `hi`×484 |
| `ape-profile` | 10.573 | 3 | enumerado/etiqueta | `P4`×7457 `P3`×2308 `P1`×808 |
| `ape-region` | 10.573 | 15 | enumerado/etiqueta | `und`×7660 `ar`×856 `en`×845 `hi`×484 |
| `ape-transport` | 10.573 | 1 | enumerado | `HLS`×10.573 |
| `group-title` | 10.573 | 107 | enumerado/etiqueta | `EUROPA OCCIDENTAL / GENERALISTA / FULL HD`×1960 `EUROPA OCCIDENTAL / DEPORTES / FULL HD`×1084 `AMÉRICA LATINA / GENERALISTA / FULL HD`×610 `EUROPA ORIENTAL / GENERALISTA / FULL HD`×600 |
| `tvg-chno` | 10.573 | 10.573 | entero | `1`×1 `10`×1 `100`×1 `1000`×1 |
| `tvg-id` | 10.573 | 10.573 | entero | `100`×1 `1000`×1 `1001244`×1 `1001245`×1 |
| `tvg-logo` | 10.573 | 5271 | identificador | (vacío)×323 `http://<PICON-HOST>:25461/picon/INDIA/HINDI INDIA PREMIUM/CINEMA.png`×150 `http://<PICON-HOST>:25461/picon/INDIA/HINDI INDIA PREMIUM/SERIES.png`×60 `http://<PICON-HOST>:25461/picon/MIX2/DESERIEAX.png`×50 |
| `tvg-name` | 10.573 | 10.465 | identificador | `\|COL\| CANAL INSTITUCIONAL HD [<HOST>]`×3 `\|DE\| NDR FERNSEHEN NIEDERSACHSEN FHD [<HOST>]`×3 `\|HINDI\| MTV PLUS HD [<HOST>]`×3 `\|AF\| A+ HD [<HOST>]`×2 |
| `tvg-shift` | 10.573 | 1 | enumerado | `0`×10.573 |
| `catchup` | 355 | 1 | enumerado/etiqueta | `append`×355 |
| `catchup-days` | 355 | 5 | entero | `1`×263 `3`×71 `4`×18 `2`×2 |
| `catchup-source` | 355 | 1 | enumerado/etiqueta | `?utc={utc}&lutc={lutc}`×355 |

**Hallazgo de esquema:** los atributos `ape-*` son **19 claves fijas** (todas presentes en los 10.573 canales), más 6 claves estándar (`tvg-id`, `tvg-name`, `tvg-logo`, `tvg-chno`, `tvg-shift`, `group-title`) y 3 de catch-up (`catchup`, `catchup-days`, `catchup-source`, presentes sólo en 355 canales). No existe ningún `ape-*` opcional: la plantilla de atributos es rígida.

### 6.2 Distribuciones pedidas

**`ape-profile`** — 3 valor(es) distinto(s):

| Valor | Canales | % |
|---|---|---|
| `P4` | 7457 | 70.53 % |
| `P3` | 2308 | 21.83 % |
| `P1` | 808 | 7.64 % |

**`ape-codec-family`** — 2 valor(es) distinto(s):

| Valor | Canales | % |
|---|---|---|
| `h264` | 9535 | 90.18 % |
| `hevc` | 1038 | 9.82 % |

**`ape-fps`** — 2 valor(es) distinto(s):

| Valor | Canales | % |
|---|---|---|
| `25` | 9749 | 92.21 % |
| `50` | 824 | 7.79 % |

**`ape-transport`** — 1 valor(es) distinto(s):

| Valor | Canales | % |
|---|---|---|
| `HLS` | 10.573 | 100.00 % |

**`ape-content-type`** — 11 valor(es) distinto(s):

| Valor | Canales | % |
|---|---|---|
| `GENERALISTA` | 5182 | 49.01 % |
| `DEPORTES` | 2195 | 20.76 % |
| `CINE` | 1327 | 12.55 % |
| `INFANTIL` | 470 | 4.45 % |
| `ENTRETENIMIENTO` | 452 | 4.28 % |
| `NOTICIAS` | 389 | 3.68 % |
| `DOCUMENTALES` | 359 | 3.40 % |
| `MÚSICA` | 176 | 1.66 % |
| `RELIGIÓN` | 17 | 0.16 % |
| `EDUCACIÓN` | 4 | 0.04 % |
| `ADULTOS` | 2 | 0.02 % |

**`group-title`** — 107 valor(es) distinto(s) (top 20 de 107):

| Valor | Canales | % |
|---|---|---|
| `EUROPA OCCIDENTAL / GENERALISTA / FULL HD` | 1960 | 18.54 % |
| `EUROPA OCCIDENTAL / DEPORTES / FULL HD` | 1084 | 10.25 % |
| `AMÉRICA LATINA / GENERALISTA / FULL HD` | 610 | 5.77 % |
| `EUROPA ORIENTAL / GENERALISTA / FULL HD` | 600 | 5.67 % |
| `ASIA ORIENTE MEDIO / GENERALISTA / FULL HD` | 571 | 5.40 % |
| `NORTEAMÉRICA / GENERALISTA / FULL HD` | 538 | 5.09 % |
| `EUROPA OCCIDENTAL / CINE / FULL HD` | 481 | 4.55 % |
| `RESTO DEL MUNDO / GENERALISTA / FULL HD` | 302 | 2.86 % |
| `NORTEAMÉRICA / DEPORTES / FULL HD` | 267 | 2.53 % |
| `EUROPA ORIENTAL / DEPORTES / FULL HD` | 238 | 2.25 % |
| `ASIA ORIENTE MEDIO / CINE / FULL HD` | 232 | 2.19 % |
| `EUROPA OCCIDENTAL / INFANTIL / FULL HD` | 231 | 2.18 % |
| `NORTEAMÉRICA / CINE / FULL HD` | 226 | 2.14 % |
| `EUROPA OCCIDENTAL / GENERALISTA / ULTRA HD` | 223 | 2.11 % |
| `EUROPA OCCIDENTAL / ENTRETENIMIENTO / FULL HD` | 198 | 1.87 % |
| `ASIA ORIENTE MEDIO / GENERALISTA / ULTRA HD` | 153 | 1.45 % |
| `EUROPA OCCIDENTAL / DOCUMENTALES / FULL HD` | 150 | 1.42 % |
| `ASIA ORIENTE MEDIO / DEPORTES / FULL HD` | 144 | 1.36 % |
| `EUROPA ORIENTAL / CINE / FULL HD` | 142 | 1.34 % |
| `RESTO DEL MUNDO / DEPORTES / FULL HD` | 121 | 1.14 % |

Distribuciones complementarias medidas (todas en `distributions` del JSON): `ape-region`/`ape-lang` (15 valores cada uno, con `und`=7.660), `ape-country` (9 valores), `ape-build` (1 valor), `ape-classify-confidence` (66 valores), `catchup-days` (5 valores).

## 7. Sub-esquemas de los tags con atributos

### 7.1 `#EXT-X-STREAM-INF` — 1 por canal, 11 claves, valores ÚNICOS

| Atributo | Líneas con el atributo | Valores distintos | Valor(es) medidos |
|---|---|---|---|
| `AVERAGE-BANDWIDTH` | 10.573 | 3 | `6500000`×7963 `9000000`×1757 `22000000`×853 |
| `BANDWIDTH` | 10.573 | 3 | `9000000`×7963 `12000000`×1757 `28000000`×853 |
| `CODECS` | 10.573 | 1 | `hvc1.2.4.L153.B0,mp4a.40.2`×10.573 |
| `FRAME-RATE` | 10.573 | 2 | `30.000`×8651 `60.000`×1922 |
| `RESOLUTION` | 10.573 | 1 | `3840x2160`×10.573 |
| `VIDEO-RANGE` | 10.573 | 1 | `PQ`×10.573 |
| `COLOR-PRIMARIES` | 10.528 | 1 | `9`×10.528 |
| `HDCP-LEVEL` | 10.528 | 1 | `TYPE-1`×10.528 |
| `MATRIX-COEFFICIENTS` | 10.528 | 1 | `9`×10.528 |
| `STABLE-VARIANT-ID` | 10.528 | 25 | `1000_P4`×1 `1001244_P4`×1 `1001245_P4`×1 |
| `TRANSFER-CHARACTERISTICS` | 10.528 | 1 | `16`×10.528 |

**Valores únicos (no hay variación en toda la lista):**

- `CODECS` = `hvc1.2.4.L153.B0,mp4a.40.2` en los **10.573** canales (1 solo valor distinto).
- `RESOLUTION` = `3840x2160` en los **10.573** canales.
- `VIDEO-RANGE` = `PQ` en los **10.573** canales.
- `HDCP-LEVEL` = `TYPE-1` en los **10.528** canales que lo declaran.
- `BANDWIDTH` = `9000000` (7963) / `12000000` (1757) / `28000000` (853).
- `FRAME-RATE` = `30.000` (8651) / `60.000` (1922).
- `STABLE-VARIANT-ID` = `<streamId>_<perfil>` (valor distinto por canal).

### 7.2 `#EXT-X-I-FRAME-STREAM-INF` — 1 por canal, 2 claves

| Atributo | Líneas | Valores |
|---|---|---|
| `BANDWIDTH` | 10.573 | `200000`×9765 `495000`×808 |
| `CODECS` | 10.573 | `hvc1.2.4.L93.B0`×7457 `hvc1.2.4.L123.B0`×2308 `hvc1.2.4.L153.B0`×808 |

**Este es el único sitio donde el nivel HEVC varía por perfil:** `hvc1.2.4.L93.B0` (P4, 7457), `hvc1.2.4.L123.B0` (P3, 2308), `hvc1.2.4.L153.B0` (P1, 808). El `#EXT-X-STREAM-INF` del mismo bloque declara **siempre** `L153`.

### 7.3 `#EXT-X-DATERANGE` — 1 por canal (+1 en cabecera)

| Atributo | Líneas | Valores medidos |
|---|---|---|
| `ID` | 10.574 | `hdr-P1-1020`×1 `hdr-P1-1021`×1 `hdr-P1-1022`×1 `hdr-P1-1023`×1 |
| `X-HDR-MAX-CLL` | 10.574 | `600`×7457 `1000`×2308 `4000`×808 `10000`×1 |
| `X-HDR-TYPE` | 10.574 | `SDR`×7457 `SDR + HLG fallback`×2308 `HDR10 + HLG`×808 `HDR10+DV-P81-P10`×1 |
| `CLASS` | 10.573 | `ape.hdr.panel`×10.573 |
| `X-BIT-DEPTH` | 10.573 | `8`×9765 `12`×808 |
| `X-CHROMA-SUBSAMPLING` | 10.573 | `4:2:0`×10.573 |
| `X-COLOR-PRIMARIES` | 10.573 | `BT.709`×9765 `BT.2020`×808 |
| `X-COLOR-TRANSFER` | 10.573 | `BT.1886`×9765 `SMPTE_ST_2084`×808 |
| `X-HDCP-LEVEL` | 10.573 | `1.4`×9765 `2.2`×808 |
| `X-HDR-PEAK-LUMINANCE` | 10.573 | `400`×7457 `600`×2308 `2000`×808 |
| `X-OMEGA-TYPE` | 1 | `LIVE-CATCHUP`×1 |

### 7.4 `#EXTVLCOPT` — 138 claves distintas

`134` claves aparecen en los 10.573 canales y `4` sólo en la cabecera (`colorspace`, `format`, `saturation`, `tonemap`). Distribución clave→líneas (primeras 25 por volumen):

| Clave | Líneas |
|---|---|
| `adaptive-bandwidth-factor` | 10.573 |
| `adaptive-bw-factor` | 10.573 |
| `adaptive-initial-bandwidth` | 10.573 |
| `adaptive-livedelay` | 10.573 |
| `adaptive-livesyncplaybackrate` | 10.573 |
| `adaptive-logic` | 10.573 |
| `adaptive-lookahead-count` | 10.573 |
| `adaptive-maxbitrate` | 10.573 |
| `adaptive-maxbuffer` | 10.573 |
| `adaptive-maxbw` | 10.573 |
| `adaptive-maxheight` | 10.573 |
| `adaptive-maxwidth` | 10.573 |
| `adaptive-minbitrate` | 10.573 |
| `adaptive-minbw` | 10.573 |
| `adaptive-reload-maxperiod` | 10.573 |
| `adaptive-reload-minperiod` | 10.573 |
| `adaptive-reload-threshold` | 10.573 |
| `adaptive-reload-use-0rtt` | 10.573 |
| `adaptive-reload-use-byte-range` | 10.573 |
| `adaptive-reload-use-cache` | 10.573 |
| `adaptive-reload-use-chunked` | 10.573 |
| `adaptive-reload-use-early-data` | 10.573 |
| `adaptive-reload-use-etag` | 10.573 |
| `adaptive-reload-use-http2` | 10.573 |
| `adaptive-reload-use-http3` | 10.573 |

### 7.5 `#KODIPROP` — 109 claves distintas

`103` claves en los 10.573 canales; `6` sólo en cabecera (`inputstream.adaptive.preferred_codec`, `.video_codec_override`, `.audio_passthrough_earc`, `.audio_codec_priority`, `.audio_fallback`, `.drm_widevine_enforce`).

### 7.6 `#EXTATTRFROMURL` — 54 claves, todas en los 10.573 canales

Ejemplos literales (mascarados): `X-APE-SID=c8e0e7080a71bc00`, `X-APE-NONCE=8mfaohz5771d`, `X-APE-LIST-HASH=8mfaohz5`, `X-APE-TIMESTAMP=2026-11-02T03:12:27.421Z`.

### 7.7 `video-filter` — la firma visual del perfil

| Canales | Perfil | Valor de `#EXTVLCOPT:video-filter` (277–348 caracteres) |
|---|---|---|
| 7457 | P4 | `hqdn3d=luma_spatial=2.0:chroma_spatial=1.5:…,yadif=mode=1:parity=-1:deint=0,unsharp=…luma_amount=0.25…,minterpolate=fps=120:…:scd=0` |
| 2308 | P3 | `nlmeans=s=2.5:p=5:r=11,bwdif=…,gradfun=radius=12:strength=0.8,unsharp=…luma_amount=0.3…,zscale=transfer=bt709:primaries=bt709:matrix=bt709:dither=error_diffusion:range=full,minterpolate=fps=120:…:scd=0` |
| 808 | P1 | `nlmeans=s=3.0:p=7:r=15,bwdif=…,gradfun=radius=16:strength=1.0,unsharp=…luma_amount=0.4…,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full,minterpolate=fps=120:…:scd=5` |

Cruce exacto perfil × filtro: `P4 | hqdn3d+minterpolate → 7457`, `P3 | zscale+gradfun+nlmeans+minterpolate → 2308`, `P1 | zscale+gradfun+nlmeans+minterpolate → 808` (**3 combinaciones, 0 residuo**).

## 8. URI final del canal

| Métrica | Valor medido | Cómo |
|---|---|---|
| URIs (líneas no-comentario) | 10.573 | `rg -c '^[^#]' <lista>` |
| URIs únicas | 10.573 | `Set` de líneas URI (censo) |
| URIs por canal | 1 en los 10.573 canales | conteo por bloque |
| Hosts distintos | 1 | `rg -N -o '^http://([^/]+)/' -r '$1' \| Sort-Object -Unique` |
| Pares usuario/pass distintos | 1 | `rg -N -o '^http://[^/]+/live/([^/]+)/([^/]+)/([^/]+)$' -r '$1/$2' \| Sort-Object -Unique` |
| Stream-id distintos | 10.573 | mismo comando con `-r '$3'` |
| Esquema | `http` ×10.573 | parseo del URI |
| Puerto explícito | no (0 de 10573) | parseo del URI |
| Query string | no (`query_keys` vacío) | parseo del URI |
| Segmentos de path | `4` ×10.573 | parseo del URI |
| Primer segmento | `live` (10573) | parseo del URI |
| Extensión final | `.m3u8` ×10.573 | parseo del URI |
| Plantilla | `http://<HOST>/live/<USER>/<PASS>/<STREAM_ID>.m3u8` | síntesis de lo anterior |
| Longitud del host | 17 caracteres | medido |
| Longitud del stream-id | min 6, max 12, media 11,15 | `-r '$3' \| Measure-Object -Property Length` |
| Patrón del último segmento | `999999.A9A9`×6461, `9999999.A9A9`×3349, `9999.A9A9`×330, `999.A9A9`×229 (dígitos→`9`, letras→`A`) | medido |

**Credenciales redactadas.** El host del proveedor, el host de picon, el usuario y la contraseña se sustituyen por
`<HOST>`, `<PICON-HOST>`, `<USER>` y `<PASS>` en **todos** los artefactos de esta fase (informe, JSON y fixtures),
conforme a `AGENTS.md` («No exponer tokens»). Los valores reales no aparecen en ningún fichero escrito.

## 9. Coherencia interna medida (lo que se contradice dentro del mismo bloque)

Estas son **mediciones**, no opiniones: cada fila se puede reproducir con el censo.

| # | Contradicción medida | Evidencia (censo) |
|---|---|---|
| C1 | `#EXTINF.ape-codec-family` dice `h264` en 9535 canales, pero el `#EXT-X-STREAM-INF` del mismo bloque declara `hvc1…` en los 10.573. | `xt_extinf_codec_vs_streaminf`: h264→HEVC 9535, hevc→HEVC 1038 |
| C2 | `#EXT-X-DATERANGE` declara `X-HDR-TYPE="SDR"` en 7457 y `"SDR + HLG fallback"` en 2308, mientras el `STREAM-INF` declara `VIDEO-RANGE=PQ` en los 10.573. | `daterange.X-HDR-TYPE` + `stream_inf.VIDEO-RANGE` |
| C3 | `X-BIT-DEPTH` = 8 en 9765 canales, pero `CODECS` declara Main10 (`hvc1.2.4`) en los 10.573. | `daterange.X-BIT-DEPTH` vs `stream_inf.CODECS` |
| C4 | `X-HDCP-LEVEL` = 1.4 en 9765, pero `HDCP-LEVEL=TYPE-1` en 10.528. | `daterange.X-HDCP-LEVEL` vs `stream_inf.HDCP-LEVEL` |
| C5 | `ape-fps` = 25 (9749) / 50 (824), pero `FRAME-RATE` del `STREAM-INF` = 30.000 (8651) / 60.000 (1922) y el `video-filter` interpola a `fps=120`. Tres frecuencias distintas declaradas en el mismo bloque. | `distributions.ape-fps` + `stream_inf.FRAME-RATE` + `video_filter_values` |
| C6 | `#EXT-X-I-FRAME-STREAM-INF.CODECS` varía por perfil (L93/L123/L153) mientras `#EXT-X-STREAM-INF.CODECS` es L153 fijo: el nivel declarado no es el mismo dentro del bloque. | `i_frame_stream_inf.CODECS` vs `stream_inf.CODECS` |
| C7 | `RESOLUTION=3840x2160` + `BANDWIDTH=9000000` en 6227 canales P4 (9 Mbps declarados para 4K). | `xt_profile_bandwidth` |

**No se emite veredicto de calidad aquí** (§11: el bitstream real no se ha medido). Lo anterior describe **qué declara** la lista y **dónde se contradice a sí misma**.

## 10. Verificación de las cifras previas (capitán y corpus del repo)

| Afirmación previa | Medido aquí | Veredicto | Evidencia |
|---|---|---|---|
| `#EXTVLCOPT`=1.416.786 | 1.416.786 | **confirmado** | `rg -c '^#EXTVLCOPT'`; censo: 1.416.782 en bloque + 4 en cabecera |
| `#EXT-X-APE-`=6.498.710 | 6.498.710 | **confirmado** | `rg -c '^#EXT-X-APE-' <lista>` |
| `#EXTHTTP`=10.573 | 10.573 | **confirmado** | `rg -c '^#EXTHTTP' <lista>` |
| `#KODIPROP`=1.089.025 | 1.089.025 | **confirmado** | `rg -c '^#KODIPROP' <lista>`; censo: 1.089.019 + 6 |
| `video-filter`=10.573 | 10.573 | **confirmado** | `rg -c -F 'video-filter' <lista>` |
| `minterpolate`=10.573 | 10.573 | **confirmado** | `rg -c -F 'minterpolate' <lista>` |
| `zscale`=3.116 y `gradfun`=3.116 | 3116 / 3116 | **confirmado** | `rg -c -F` |
| `ffmpeg{`=0, `pp=ac`=0, `cas=`=0, `libplacebo`=0 | 0 / 0 / 0 / 0 | **confirmado** | `rg -c -i -F` (exit 1 = sin coincidencias) |
| `bt1886`=0 | lowercase = 0, pero **`BT.1886` = 9.765** y case-insensitive = **12.043** | **refutado como absoluto** | `rg -c -F 'bt1886'`=0 vs `rg -c -F 'BT.1886'`=9765 vs `rg -c -i -F 'bt1886'`=12043. El valor existe: `#EXT-X-DATERANGE:…X-COLOR-TRANSFER="BT.1886"` |
| Primer bloque empieza en la línea 189 | 189 (cabecera 1–187 + vacía 188) | **confirmado** | `first_extinf_line` + `rg -n -m1 '^$'`=188 |
| 10.315.662 líneas | 10.315.662 | **confirmado** | censo |
| 10.573 canales | 10.573 | **confirmado** | `rg -c '^#EXTINF'` |
| 10.573 URLs únicas | 10.573 | **confirmado** | `Set` de URIs |
| 1 host / 1 par de credenciales | 1 / 1 | **confirmado** | `rg -N -o … \| Sort-Object -Unique \| Measure-Object` |
| 188 líneas de cabecera | 188 | **confirmado** | censo |
| ~975 líneas/canal | media 975,643 · p50 976 · rango 954–981 | **confirmado con matices**: hay 8 tallas distintas | §3.3 |
| P4=7457 / P3=2308 / P1=808 | 7457 / 2308 / 808 | **confirmado** (y son los 3 únicos valores) | `distributions.ape-profile` |

## 11. NO COMPUTADO (fail-honest)

| Métrica | Estado | Razón |
|---|---|---|
| resolucion/codec/HDR REALES por canal | NO COMPUTADO | requiere probe del manifest remoto + decodificacion de bitstream; esta fase es analisis estatico local sin red |
| numero de variantes internas de cada manifest HLS | NO COMPUTADO | la URI del canal apunta a un manifest remoto que no se ha descargado |
| salud HTTP de las 10573 URIs | NO COMPUTADO | fuera de alcance: no se hace red en esta fase |
| idioma/pais REAL del canal | NO COMPUTADO | ape-lang/ape-region/ape-country son etiquetas declaradas por el generador, no verificado contra el stream |
| numero de canales realmente 4K | NO COMPUTADO | el STREAM-INF declara 3840x2160 + PQ en el 100% de los canales, por lo que la declaracion no discrimina |
| compatibilidad por runtime (VLC/OTT/TiviMate/ExoPlayer/Kodi/VPS-ARA) | NO COMPUTADO | fuera de alcance de esta tarea (matriz de capacidad) |
| estabilidad temporal de la estructura entre generaciones de la lista | NO COMPUTADO | solo se dispone de una instantanea del fichero (sha256 523d52a6...); sin una segunda generacion no hay serie que comparar |

Nada de lo anterior se ha sustituido por una estimación: los huecos quedan declarados.

## 12. Artefactos de esta fase

| Artefacto | Bytes | SHA-256 |
|---|---|---|
| `scratch/avisynth_probe_2026/fixtures/canal_001.txt` | 58.097 | `fbbbf80ce3ee819ed71d487de0af11aeddf65d7646376c6fe50f869bb8700a2f` |
| `scratch/avisynth_probe_2026/fixtures/canal_medio.txt` | 56.754 | `7cffa2279b35dc0a5b288f52f7be2e5d2f75e655e4637b2169374628227e7ed6` |
| `scratch/avisynth_probe_2026/fixtures/canal_ultimo.txt` | 58.128 | `b4d7f508e7d09a338b3ce6ed16142b1c2d43e78574801bfc802341a30cf16f3b` |
| `scratch/avisynth_probe_2026/fixtures/canal_954_corto.txt` | 55.481 | `e16f6df329aa2cb960ed8824f44b9a160b1c066042bcf3e81a0b82133c812bf9` |
| `scratch/avisynth_probe_2026/fixtures/canal_978_largo.txt` | 57.669 | `e566ef52652a5e5c2bd498e9f13a8cc5b4ab4695b605206d1ece7c6f5446fa78` |

Los 5 fixtures conservan **el 100 % de las líneas** del bloque (sin truncar) y **sólo** se enmascaran host/picon/usuario/contraseña y los valores de claves de sesión (`X-APE-SID`, `X-APE-NONCE`, `X-APE-LIST-HASH`, … → `<REDACTED>`). Verificación de fugas: `Select-String -Path scratch/avisynth_probe_2026/fixtures/*.txt -Pattern '<host real>'` → **0 coincidencias**; `[0-9a-fA-F]{32,}` → 0; `Bearer` → 0.

Índice por canal (una fila por canal, 10.573 filas): `scratch/avisynth_probe_2026/fixtures/channels_index.csv` con columnas `idx,startLine,endLine,lines,uriLines,uriLine,linesAfterUri,emptyInBlock,apeProfile,apeCodecFamily,apeFps,apeTransport,videoFilterKind,siKeyCount,name` + conteo por familia.

## Anexo A — censo completo de tags (819)

| Tag | Líneas | 1ª línea |
|---|---|---|
| `#EXTVLCOPT` | 1.416.786 | 147 |
| `#KODIPROP` | 1.089.025 | 160 |
| `#EXTATTRFROMURL` | 570.942 | 497 |
| `#EXT-X-APE-AUDIO-PASSTHROUGH` | 10.574 | 169 |
| `#EXT-X-APE-QUANTUM-PIXEL` | 10.574 | 156 |
| `#EXT-X-DATERANGE` | 10.574 | 88 |
| `#EXT-X-APE-4K-PREMIUM` | 10.573 | 1160 |
| `#EXT-X-APE-4KFALSE-CONTENT-TYPE` | 10.573 | 216 |
| `#EXT-X-APE-4KFALSE-ENGINE` | 10.573 | 218 |
| `#EXT-X-APE-4KFALSE-MODE` | 10.573 | 215 |
| `#EXT-X-APE-4KFALSE-TARGET-RES` | 10.573 | 217 |
| `#EXT-X-APE-8KFAKE` | 10.573 | 1159 |
| `#EXT-X-APE-AI-FI` | 10.573 | 463 |
| `#EXT-X-APE-AI-FI-BLUR` | 10.573 | 466 |
| `#EXT-X-APE-AI-FI-GHOSTING` | 10.573 | 465 |
| `#EXT-X-APE-AI-FI-JUDDER` | 10.573 | 467 |
| `#EXT-X-APE-AI-FI-QUALITY` | 10.573 | 464 |
| `#EXT-X-APE-AI-PREDICT` | 10.573 | 802 |
| `#EXT-X-APE-AI-SR` | 10.573 | 458 |
| `#EXT-X-APE-AI-SR-ARTIFACT-REMOVAL` | 10.573 | 462 |
| `#EXT-X-APE-AI-SR-DENOISE` | 10.573 | 460 |
| `#EXT-X-APE-AI-SR-QUALITY` | 10.573 | 459 |
| `#EXT-X-APE-AI-SR-SHARPEN` | 10.573 | 461 |
| `#EXT-X-APE-AUDIO` | 10.573 | 641 |
| `#EXT-X-APE-AUDIO-AAC` | 10.573 | 647 |
| `#EXT-X-APE-AUDIO-AC3` | 10.573 | 646 |
| `#EXT-X-APE-AUDIO-ATMOS` | 10.573 | 642 |
| `#EXT-X-APE-AUDIO-BITDEPTH` | 10.573 | 651 |
| `#EXT-X-APE-AUDIO-BITRATE` | 10.573 | 652 |
| `#EXT-X-APE-AUDIO-DESYNC` | 10.573 | 656 |
| `#EXT-X-APE-AUDIO-DTS-X` | 10.573 | 643 |
| `#EXT-X-APE-AUDIO-EAC3` | 10.573 | 645 |
| `#EXT-X-APE-AUDIO-FILTER` | 10.573 | 661 |
| `#EXT-X-APE-AUDIO-LANGUAGE` | 10.573 | 653 |
| `#EXT-X-APE-AUDIO-MP3` | 10.573 | 648 |
| `#EXT-X-APE-AUDIO-NORMALIZATION` | 10.573 | 658 |
| `#EXT-X-APE-AUDIO-REPLAY-GAIN` | 10.573 | 659 |
| `#EXT-X-APE-AUDIO-SAMPLERATE` | 10.573 | 650 |
| `#EXT-X-APE-AUDIO-SYNC` | 10.573 | 655 |
| `#EXT-X-APE-AUDIO-TIME-STRETCH` | 10.573 | 660 |
| `#EXT-X-APE-AUDIO-TRACK-ID` | 10.573 | 654 |
| `#EXT-X-APE-AUDIO-TRUEHD` | 10.573 | 644 |
| `#EXT-X-APE-AUDIO-VISUAL` | 10.573 | 662 |
| `#EXT-X-APE-AUDIO-VOLUME` | 10.573 | 657 |
| `#EXT-X-APE-BBR-HIJACK` | 10.573 | 685 |
| `#EXT-X-APE-BBR-HIJACK-AVG-BW` | 10.573 | 687 |
| `#EXT-X-APE-BBR-HIJACK-BW` | 10.573 | 686 |
| `#EXT-X-APE-BBR-HIJACK-FACTOR` | 10.573 | 690 |
| `#EXT-X-APE-BBR-HIJACK-INITIAL-BW` | 10.573 | 688 |
| `#EXT-X-APE-BBR-HIJACK-LOGIC` | 10.573 | 692 |
| `#EXT-X-APE-BBR-HIJACK-LOOKAHEAD` | 10.573 | 691 |
| `#EXT-X-APE-BBR-HIJACK-MIN-BW` | 10.573 | 689 |
| `#EXT-X-APE-BBR-HIJACK-RELOAD-MAXPERIOD` | 10.573 | 695 |
| `#EXT-X-APE-BBR-HIJACK-RELOAD-MINPERIOD` | 10.573 | 696 |
| `#EXT-X-APE-BBR-HIJACK-RELOAD-THRESHOLD` | 10.573 | 694 |
| `#EXT-X-APE-BBR-HIJACK-SEGCOUNT` | 10.573 | 693 |
| `#EXT-X-APE-BBR-HIJACK-SID` | 10.573 | 706 |
| `#EXT-X-APE-BBR-HIJACK-USE-CACHE` | 10.573 | 697 |
| `#EXT-X-APE-BBR-HIJACK-USE-CHUNKED` | 10.573 | 702 |
| `#EXT-X-APE-BBR-HIJACK-USE-ETAG` | 10.573 | 698 |
| `#EXT-X-APE-BBR-HIJACK-USE-HTTP2` | 10.573 | 704 |
| `#EXT-X-APE-BBR-HIJACK-USE-HTTP3` | 10.573 | 705 |
| `#EXT-X-APE-BBR-HIJACK-USE-IF-MODIFIED` | 10.573 | 699 |
| `#EXT-X-APE-BBR-HIJACK-USE-IF-NONE-MATCH` | 10.573 | 700 |
| `#EXT-X-APE-BBR-HIJACK-USE-KEEPALIVE` | 10.573 | 703 |
| `#EXT-X-APE-BBR-HIJACK-USE-RANGE` | 10.573 | 701 |
| `#EXT-X-APE-BITRATE-ANARCHY` | 10.573 | 475 |
| `#EXT-X-APE-BUFFER-NUCLEAR` | 10.573 | 663 |
| `#EXT-X-APE-BUFFER-NUCLEAR-AHEAD` | 10.573 | 669 |
| `#EXT-X-APE-BUFFER-NUCLEAR-BEHIND` | 10.573 | 670 |
| `#EXT-X-APE-BUFFER-NUCLEAR-CHUNK-DURATION` | 10.573 | 674 |
| `#EXT-X-APE-BUFFER-NUCLEAR-DRAIN` | 10.573 | 679 |
| `#EXT-X-APE-BUFFER-NUCLEAR-FLUSH` | 10.573 | 680 |
| `#EXT-X-APE-BUFFER-NUCLEAR-HOLD-BACK` | 10.573 | 672 |
| `#EXT-X-APE-BUFFER-NUCLEAR-LIVE-DELAY` | 10.573 | 671 |
| `#EXT-X-APE-BUFFER-NUCLEAR-MAX` | 10.573 | 666 |
| `#EXT-X-APE-BUFFER-NUCLEAR-MB` | 10.573 | 667 |
| `#EXT-X-APE-BUFFER-NUCLEAR-MIN` | 10.573 | 665 |
| `#EXT-X-APE-BUFFER-NUCLEAR-PART-HOLD-BACK` | 10.573 | 673 |
| `#EXT-X-APE-BUFFER-NUCLEAR-PART-TARGET` | 10.573 | 675 |
| `#EXT-X-APE-BUFFER-NUCLEAR-PREFETCH` | 10.573 | 676 |
| `#EXT-X-APE-BUFFER-NUCLEAR-PRELOAD` | 10.573 | 677 |
| `#EXT-X-APE-BUFFER-NUCLEAR-REBUFFER-THRESHOLD` | 10.573 | 683 |
| `#EXT-X-APE-BUFFER-NUCLEAR-SEGMENTS` | 10.573 | 668 |
| `#EXT-X-APE-BUFFER-NUCLEAR-SID` | 10.573 | 684 |
| `#EXT-X-APE-BUFFER-NUCLEAR-STALL-ACTION` | 10.573 | 682 |
| `#EXT-X-APE-BUFFER-NUCLEAR-STALL-THRESHOLD` | 10.573 | 681 |
| `#EXT-X-APE-BUFFER-NUCLEAR-TARGET` | 10.573 | 664 |
| `#EXT-X-APE-BUFFER-NUCLEAR-WARMUP` | 10.573 | 678 |
| `#EXT-X-APE-CHANNEL-RUNTIME-CODEC-HEV1` | 10.573 | 1125 |
| `#EXT-X-APE-CHECKLIST-14D` | 10.573 | 842 |
| `#EXT-X-APE-CHECKLIST-14D-1` | 10.573 | 843 |
| `#EXT-X-APE-CHECKLIST-14D-10` | 10.573 | 852 |
| `#EXT-X-APE-CHECKLIST-14D-11` | 10.573 | 853 |
| `#EXT-X-APE-CHECKLIST-14D-12` | 10.573 | 854 |
| `#EXT-X-APE-CHECKLIST-14D-13` | 10.573 | 855 |
| `#EXT-X-APE-CHECKLIST-14D-14` | 10.573 | 856 |
| `#EXT-X-APE-CHECKLIST-14D-2` | 10.573 | 844 |
| `#EXT-X-APE-CHECKLIST-14D-3` | 10.573 | 845 |
| `#EXT-X-APE-CHECKLIST-14D-4` | 10.573 | 846 |
| `#EXT-X-APE-CHECKLIST-14D-5` | 10.573 | 847 |
| `#EXT-X-APE-CHECKLIST-14D-6` | 10.573 | 848 |
| `#EXT-X-APE-CHECKLIST-14D-7` | 10.573 | 849 |
| `#EXT-X-APE-CHECKLIST-14D-8` | 10.573 | 850 |
| `#EXT-X-APE-CHECKLIST-14D-9` | 10.573 | 851 |
| `#EXT-X-APE-CHECKLIST-14D-LIST-HASH` | 10.573 | 862 |
| `#EXT-X-APE-CHECKLIST-14D-NONCE` | 10.573 | 861 |
| `#EXT-X-APE-CHECKLIST-14D-SCORE` | 10.573 | 857 |
| `#EXT-X-APE-CHECKLIST-14D-SID` | 10.573 | 860 |
| `#EXT-X-APE-CHECKLIST-14D-STATUS` | 10.573 | 858 |
| `#EXT-X-APE-CHECKLIST-14D-TIMESTAMP` | 10.573 | 859 |
| `#EXT-X-APE-CHECKLIST-14D-VERSION` | 10.573 | 863 |
| `#EXT-X-APE-CHROMA-PRECISION` | 10.573 | 473 |
| `#EXT-X-APE-CODEC-SOURCE` | 10.573 | 1133 |
| `#EXT-X-APE-CONFIDENCE` | 10.573 | 1128 |
| `#EXT-X-APE-CONTAINER` | 10.573 | 1134 |
| `#EXT-X-APE-CONTAINER-VERIFIED` | 10.573 | 1135 |
| `#EXT-X-APE-CONTENT-CLASS` | 10.573 | 908 |
| `#EXT-X-APE-CONTENT-HEURISTIC` | 10.573 | 909 |
| `#EXT-X-APE-CONTENT-HEURISTIC-4K-LCEVC` | 10.573 | 919 |
| `#EXT-X-APE-CONTENT-HEURISTIC-ADAPTIVE-BUFFER` | 10.573 | 925 |
| `#EXT-X-APE-CONTENT-HEURISTIC-ADAPTIVE-FPS` | 10.573 | 926 |
| `#EXT-X-APE-CONTENT-HEURISTIC-ADAPTIVE-QOS` | 10.573 | 924 |
| `#EXT-X-APE-CONTENT-HEURISTIC-ADAPTIVE-VMAF` | 10.573 | 927 |
| `#EXT-X-APE-CONTENT-HEURISTIC-BRAND` | 10.573 | 921 |
| `#EXT-X-APE-CONTENT-HEURISTIC-BUFFER` | 10.573 | 912 |
| `#EXT-X-APE-CONTENT-HEURISTIC-CINEMA-GRAIN` | 10.573 | 917 |
| `#EXT-X-APE-CONTENT-HEURISTIC-DEVICE-TARGET` | 10.573 | 923 |
| `#EXT-X-APE-CONTENT-HEURISTIC-EXPECTED-BITRATE` | 10.573 | 922 |
| `#EXT-X-APE-CONTENT-HEURISTIC-FPS` | 10.573 | 913 |
| `#EXT-X-APE-CONTENT-HEURISTIC-NEWS-LATENCY` | 10.573 | 918 |
| `#EXT-X-APE-CONTENT-HEURISTIC-NONCE` | 10.573 | 929 |
| `#EXT-X-APE-CONTENT-HEURISTIC-QOS` | 10.573 | 911 |
| `#EXT-X-APE-CONTENT-HEURISTIC-REGION` | 10.573 | 920 |
| `#EXT-X-APE-CONTENT-HEURISTIC-SID` | 10.573 | 928 |
| `#EXT-X-APE-CONTENT-HEURISTIC-SPORT-BOOST` | 10.573 | 916 |
| `#EXT-X-APE-CONTENT-HEURISTIC-SPORT-MODE` | 10.573 | 915 |
| `#EXT-X-APE-CONTENT-HEURISTIC-TYPE` | 10.573 | 910 |
| `#EXT-X-APE-CONTENT-HEURISTIC-VMAF` | 10.573 | 914 |
| `#EXT-X-APE-CORTEX` | 10.573 | 619 |
| `#EXT-X-APE-CORTEX-AUTOMATION` | 10.573 | 636 |
| `#EXT-X-APE-CORTEX-DECISION-TREE` | 10.573 | 623 |
| `#EXT-X-APE-CORTEX-DIAGNOSIS` | 10.573 | 621 |
| `#EXT-X-APE-CORTEX-ERROR-400` | 10.573 | 624 |
| `#EXT-X-APE-CORTEX-ERROR-401` | 10.573 | 625 |
| `#EXT-X-APE-CORTEX-ERROR-403` | 10.573 | 626 |
| `#EXT-X-APE-CORTEX-ERROR-404` | 10.573 | 627 |
| `#EXT-X-APE-CORTEX-ERROR-405` | 10.573 | 628 |
| `#EXT-X-APE-CORTEX-ERROR-407` | 10.573 | 629 |
| `#EXT-X-APE-CORTEX-ERROR-429` | 10.573 | 630 |
| `#EXT-X-APE-CORTEX-ERROR-500` | 10.573 | 631 |
| `#EXT-X-APE-CORTEX-ERROR-502` | 10.573 | 632 |
| `#EXT-X-APE-CORTEX-ERROR-503` | 10.573 | 633 |
| `#EXT-X-APE-CORTEX-ERROR-504` | 10.573 | 634 |
| `#EXT-X-APE-CORTEX-FEEDBACK` | 10.573 | 638 |
| `#EXT-X-APE-CORTEX-LATENCY` | 10.573 | 620 |
| `#EXT-X-APE-CORTEX-ML` | 10.573 | 637 |
| `#EXT-X-APE-CORTEX-NONCE` | 10.573 | 640 |
| `#EXT-X-APE-CORTEX-PILAR5` | 10.573 | 635 |
| `#EXT-X-APE-CORTEX-RESOLUTION` | 10.573 | 622 |
| `#EXT-X-APE-CORTEX-SID` | 10.573 | 639 |
| `#EXT-X-APE-CORTEX-TELEMETRY` | 10.573 | 1037 |
| `#EXT-X-APE-CORTEX-TELEMETRY-AI-FI` | 10.573 | 1055 |
| `#EXT-X-APE-CORTEX-TELEMETRY-AI-SR` | 10.573 | 1054 |
| `#EXT-X-APE-CORTEX-TELEMETRY-BUFFER` | 10.573 | 1048 |
| `#EXT-X-APE-CORTEX-TELEMETRY-BW` | 10.573 | 1047 |
| `#EXT-X-APE-CORTEX-TELEMETRY-CODEC` | 10.573 | 1051 |
| `#EXT-X-APE-CORTEX-TELEMETRY-DRM` | 10.573 | 1056 |
| `#EXT-X-APE-CORTEX-TELEMETRY-FPS` | 10.573 | 1050 |
| `#EXT-X-APE-CORTEX-TELEMETRY-HDR` | 10.573 | 1052 |
| `#EXT-X-APE-CORTEX-TELEMETRY-JITTER` | 10.573 | 1042 |
| `#EXT-X-APE-CORTEX-TELEMETRY-LATENCY` | 10.573 | 1044 |
| `#EXT-X-APE-CORTEX-TELEMETRY-LCEVC` | 10.573 | 1053 |
| `#EXT-X-APE-CORTEX-TELEMETRY-LOSS` | 10.573 | 1043 |
| `#EXT-X-APE-CORTEX-TELEMETRY-MOS` | 10.573 | 1039 |
| `#EXT-X-APE-CORTEX-TELEMETRY-NONCE` | 10.573 | 1058 |
| `#EXT-X-APE-CORTEX-TELEMETRY-PSNR` | 10.573 | 1040 |
| `#EXT-X-APE-CORTEX-TELEMETRY-REBUFFER` | 10.573 | 1046 |
| `#EXT-X-APE-CORTEX-TELEMETRY-RESOLUTION` | 10.573 | 1049 |
| `#EXT-X-APE-CORTEX-TELEMETRY-SID` | 10.573 | 1057 |
| `#EXT-X-APE-CORTEX-TELEMETRY-SSIM` | 10.573 | 1041 |
| `#EXT-X-APE-CORTEX-TELEMETRY-STARTUP` | 10.573 | 1045 |
| `#EXT-X-APE-CORTEX-TELEMETRY-VMAF` | 10.573 | 1038 |
| `#EXT-X-APE-CRYSTAL-UHD` | 10.573 | 1164 |
| `#EXT-X-APE-DENYLIST-REMOVED` | 10.573 | 318 |
| `#EXT-X-APE-DNR-ENGINE` | 10.573 | 1077 |
| `#EXT-X-APE-DNR-POLICY` | 10.573 | 1078 |
| `#EXT-X-APE-DRM` | 10.573 | 597 |
| `#EXT-X-APE-DRM-AES128` | 10.573 | 608 |
| `#EXT-X-APE-DRM-AES256` | 10.573 | 609 |
| `#EXT-X-APE-DRM-CBCS` | 10.573 | 611 |
| `#EXT-X-APE-DRM-CENC` | 10.573 | 612 |
| `#EXT-X-APE-DRM-CLEARKEY` | 10.573 | 607 |
| `#EXT-X-APE-DRM-FAIRPLAY` | 10.573 | 606 |
| `#EXT-X-APE-DRM-HDCP` | 10.573 | 599 |
| `#EXT-X-APE-DRM-JWT` | 10.573 | 617 |
| `#EXT-X-APE-DRM-KEY-ROTATION` | 10.573 | 613 |
| `#EXT-X-APE-DRM-NONCE` | 10.573 | 616 |
| `#EXT-X-APE-DRM-OFFLINE` | 10.573 | 602 |
| `#EXT-X-APE-DRM-PERSISTENT` | 10.573 | 601 |
| `#EXT-X-APE-DRM-PLAYREADY` | 10.573 | 605 |
| `#EXT-X-APE-DRM-PROXY` | 10.573 | 618 |
| `#EXT-X-APE-DRM-RENEWAL` | 10.573 | 604 |
| `#EXT-X-APE-DRM-REQUEST-ID` | 10.573 | 615 |
| `#EXT-X-APE-DRM-ROBUSTNESS` | 10.573 | 600 |
| `#EXT-X-APE-DRM-SAMPLE-AES` | 10.573 | 610 |
| `#EXT-X-APE-DRM-SECURITY` | 10.573 | 598 |
| `#EXT-X-APE-DRM-SESSION-ID` | 10.573 | 614 |
| `#EXT-X-APE-DRM-TIMEOUT` | 10.573 | 603 |
| `#EXT-X-APE-DV-COMPATIBILITY` | 10.573 | 447 |
| `#EXT-X-APE-DV-CROSSCONVERSION` | 10.573 | 448 |
| `#EXT-X-APE-DV-ENHANCEMENT` | 10.573 | 450 |
| `#EXT-X-APE-DV-LEVEL` | 10.573 | 446 |
| `#EXT-X-APE-DV-METADATA` | 10.573 | 449 |
| `#EXT-X-APE-DV-PROFILE` | 10.573 | 445 |
| `#EXT-X-APE-FALLBACK-REASON` | 10.573 | 1129 |
| `#EXT-X-APE-FALLBACK-TIER` | 10.573 | 1127 |
| `#EXT-X-APE-FLOOR-FUSE` | 10.573 | 563 |
| `#EXT-X-APE-FLOOR-FUSE-POLICY` | 10.573 | 564 |
| `#EXT-X-APE-FPS-SUPREMACY` | 10.573 | 477 |
| `#EXT-X-APE-HDR` | 10.573 | 1137 |
| `#EXT-X-APE-HDR-BITDEPTH` | 10.573 | 437 |
| `#EXT-X-APE-HDR-BLACKLEVEL` | 10.573 | 442 |
| `#EXT-X-APE-HDR-CHROMA` | 10.573 | 436 |
| `#EXT-X-APE-HDR-COLORSPACE` | 10.573 | 438 |
| `#EXT-X-APE-HDR-DV` | 10.573 | 430 |
| `#EXT-X-APE-HDR-GAMUT` | 10.573 | 440 |
| `#EXT-X-APE-HDR-MATRIX` | 10.573 | 434 |
| `#EXT-X-APE-HDR-MAXCLL` | 10.573 | 443 |
| `#EXT-X-APE-HDR-MAXFALL` | 10.573 | 444 |
| `#EXT-X-APE-HDR-METADATA` | 10.573 | 431 |
| `#EXT-X-APE-HDR-PRIMARIES` | 10.573 | 433 |
| `#EXT-X-APE-HDR-RANGE` | 10.573 | 435 |
| `#EXT-X-APE-HDR-TONE-MAPPING` | 10.573 | 439 |
| `#EXT-X-APE-HDR-TRANSFER` | 10.573 | 432 |
| `#EXT-X-APE-HDR-VERIFIED` | 10.573 | 1138 |
| `#EXT-X-APE-HDR-WHITEPOINT` | 10.573 | 441 |
| `#EXT-X-APE-HTTP-QOE-TARGET-MOS` | 10.573 | 489 |
| `#EXT-X-APE-HTTP-QOS-MODE` | 10.573 | 488 |
| `#EXT-X-APE-HTTP-REBUFFER-TOLERANCE` | 10.573 | 490 |
| `#EXT-X-APE-HTTP-STARTUP-MAX` | 10.573 | 492 |
| `#EXT-X-APE-HTTP-ZAPPING-MAX` | 10.573 | 491 |
| `#EXT-X-APE-IDEMPOTENCIA` | 10.573 | 886 |
| `#EXT-X-APE-IDEMPOTENCIA-ANABOLIC` | 10.573 | 905 |
| `#EXT-X-APE-IDEMPOTENCIA-BANDWIDTH` | 10.573 | 896 |
| `#EXT-X-APE-IDEMPOTENCIA-BUFFER` | 10.573 | 899 |
| `#EXT-X-APE-IDEMPOTENCIA-BUFFER-MB` | 10.573 | 900 |
| `#EXT-X-APE-IDEMPOTENCIA-CHANNEL-ID` | 10.573 | 890 |
| `#EXT-X-APE-IDEMPOTENCIA-CHANNEL-NAME` | 10.573 | 891 |
| `#EXT-X-APE-IDEMPOTENCIA-CODEC` | 10.573 | 893 |
| `#EXT-X-APE-IDEMPOTENCIA-CORTEX` | 10.573 | 901 |
| `#EXT-X-APE-IDEMPOTENCIA-DRM` | 10.573 | 903 |
| `#EXT-X-APE-IDEMPOTENCIA-FRAMERATE` | 10.573 | 895 |
| `#EXT-X-APE-IDEMPOTENCIA-HDR` | 10.573 | 897 |
| `#EXT-X-APE-IDEMPOTENCIA-JWT` | 10.573 | 904 |
| `#EXT-X-APE-IDEMPOTENCIA-LIST-HASH` | 10.573 | 906 |
| `#EXT-X-APE-IDEMPOTENCIA-NITS` | 10.573 | 898 |
| `#EXT-X-APE-IDEMPOTENCIA-PHANTOM` | 10.573 | 902 |
| `#EXT-X-APE-IDEMPOTENCIA-PROFILE` | 10.573 | 892 |
| `#EXT-X-APE-IDEMPOTENCIA-RESOLUTION` | 10.573 | 894 |
| `#EXT-X-APE-IDEMPOTENCIA-SEED` | 10.573 | 888 |
| `#EXT-X-APE-IDEMPOTENCIA-SID` | 10.573 | 889 |
| `#EXT-X-APE-IDEMPOTENCIA-STRATEGY` | 10.573 | 887 |
| `#EXT-X-APE-IDEMPOTENCIA-TIMESTAMP` | 10.573 | 907 |
| `#EXT-X-APE-ISP-EVASION` | 10.573 | 773 |
| `#EXT-X-APE-ISP-EVASION-CAMOUFLAGE` | 10.573 | 791 |
| `#EXT-X-APE-ISP-EVASION-DEEP-INSPECTION` | 10.573 | 776 |
| `#EXT-X-APE-ISP-EVASION-DNS` | 10.573 | 782 |
| `#EXT-X-APE-ISP-EVASION-DPI` | 10.573 | 774 |
| `#EXT-X-APE-ISP-EVASION-FRAGMENTATION` | 10.573 | 788 |
| `#EXT-X-APE-ISP-EVASION-GEO-BLOCKING` | 10.573 | 780 |
| `#EXT-X-APE-ISP-EVASION-HTTP2` | 10.573 | 785 |
| `#EXT-X-APE-ISP-EVASION-INVISIBILITY` | 10.573 | 793 |
| `#EXT-X-APE-ISP-EVASION-IP-BLOCKING` | 10.573 | 781 |
| `#EXT-X-APE-ISP-EVASION-OBFUSCATION` | 10.573 | 790 |
| `#EXT-X-APE-ISP-EVASION-PADDING` | 10.573 | 789 |
| `#EXT-X-APE-ISP-EVASION-PORT-BLOCKING` | 10.573 | 778 |
| `#EXT-X-APE-ISP-EVASION-PROTOCOL-BLOCKING` | 10.573 | 779 |
| `#EXT-X-APE-ISP-EVASION-QUIC` | 10.573 | 786 |
| `#EXT-X-APE-ISP-EVASION-SID` | 10.573 | 794 |
| `#EXT-X-APE-ISP-EVASION-SNI` | 10.573 | 783 |
| `#EXT-X-APE-ISP-EVASION-STEALTH` | 10.573 | 792 |
| `#EXT-X-APE-ISP-EVASION-THROTTLE` | 10.573 | 775 |
| `#EXT-X-APE-ISP-EVASION-TIMING` | 10.573 | 787 |
| `#EXT-X-APE-ISP-EVASION-TLS` | 10.573 | 784 |
| `#EXT-X-APE-ISP-EVASION-TRAFFIC-SHAPING` | 10.573 | 777 |
| `#EXT-X-APE-LCEVC-BITRATE-SAVING` | 10.573 | 453 |
| `#EXT-X-APE-LCEVC-ENABLED` | 10.573 | 452 |
| `#EXT-X-APE-LCEVC-FALLBACK` | 10.573 | 457 |
| `#EXT-X-APE-LCEVC-LATENCY` | 10.573 | 456 |
| `#EXT-X-APE-LCEVC-PHASE` | 10.573 | 451 |
| `#EXT-X-APE-LCEVC-QUALITY-BOOST` | 10.573 | 454 |
| `#EXT-X-APE-LCEVC-RESOLUTION-BOOST` | 10.573 | 455 |
| `#EXT-X-APE-LUMA-PRECISION` | 10.573 | 472 |
| `#EXT-X-APE-MULTI-SERVER` | 10.573 | 973 |
| `#EXT-X-APE-MULTI-SERVER-ANYCAST` | 10.573 | 990 |
| `#EXT-X-APE-MULTI-SERVER-BANDWIDTH-THRESHOLD` | 10.573 | 986 |
| `#EXT-X-APE-MULTI-SERVER-CDN-1` | 10.573 | 977 |
| `#EXT-X-APE-MULTI-SERVER-CDN-2` | 10.573 | 978 |
| `#EXT-X-APE-MULTI-SERVER-CDN-3` | 10.573 | 979 |
| `#EXT-X-APE-MULTI-SERVER-CDN-4` | 10.573 | 980 |
| `#EXT-X-APE-MULTI-SERVER-CDN-5` | 10.573 | 981 |
| `#EXT-X-APE-MULTI-SERVER-EDGE-CACHE` | 10.573 | 991 |
| `#EXT-X-APE-MULTI-SERVER-FAILOVER` | 10.573 | 982 |
| `#EXT-X-APE-MULTI-SERVER-GEO-ROUTING` | 10.573 | 989 |
| `#EXT-X-APE-MULTI-SERVER-HEALTH-CHECK` | 10.573 | 984 |
| `#EXT-X-APE-MULTI-SERVER-LATENCY-THRESHOLD` | 10.573 | 985 |
| `#EXT-X-APE-MULTI-SERVER-LOAD-BALANCE` | 10.573 | 983 |
| `#EXT-X-APE-MULTI-SERVER-ORIGIN-SHIELD` | 10.573 | 992 |
| `#EXT-X-APE-MULTI-SERVER-PREFETCH` | 10.573 | 993 |
| `#EXT-X-APE-MULTI-SERVER-PRIMARY` | 10.573 | 974 |
| `#EXT-X-APE-MULTI-SERVER-SECONDARY` | 10.573 | 975 |
| `#EXT-X-APE-MULTI-SERVER-SID` | 10.573 | 994 |
| `#EXT-X-APE-MULTI-SERVER-STICKY-SESSION` | 10.573 | 988 |
| `#EXT-X-APE-MULTI-SERVER-SWITCH-STRATEGY` | 10.573 | 987 |
| `#EXT-X-APE-MULTI-SERVER-TERTIARY` | 10.573 | 976 |
| `#EXT-X-APE-NET-ECN` | 10.573 | 1123 |
| `#EXT-X-APE-NET-MTU` | 10.573 | 1120 |
| `#EXT-X-APE-NET-PACING` | 10.573 | 1121 |
| `#EXT-X-APE-NET-QOS-DSCP` | 10.573 | 1122 |
| `#EXT-X-APE-OVERFLOW-HEADERS` | 10.573 | 317 |
| `#EXT-X-APE-PLAYER-ENSLAVE` | 10.573 | 707 |
| `#EXT-X-APE-PLAYER-ENSLAVE-ANDROID` | 10.573 | 721 |
| `#EXT-X-APE-PLAYER-ENSLAVE-APPLETV` | 10.573 | 715 |
| `#EXT-X-APE-PLAYER-ENSLAVE-CHROMECAST` | 10.573 | 719 |
| `#EXT-X-APE-PLAYER-ENSLAVE-EXOPLAYER` | 10.573 | 708 |
| `#EXT-X-APE-PLAYER-ENSLAVE-FIRETV` | 10.573 | 713 |
| `#EXT-X-APE-PLAYER-ENSLAVE-IOS` | 10.573 | 720 |
| `#EXT-X-APE-PLAYER-ENSLAVE-KODI` | 10.573 | 710 |
| `#EXT-X-APE-PLAYER-ENSLAVE-LINUX` | 10.573 | 724 |
| `#EXT-X-APE-PLAYER-ENSLAVE-MACOS` | 10.573 | 723 |
| `#EXT-X-APE-PLAYER-ENSLAVE-OTT` | 10.573 | 712 |
| `#EXT-X-APE-PLAYER-ENSLAVE-ROKU` | 10.573 | 716 |
| `#EXT-X-APE-PLAYER-ENSLAVE-SHIELD` | 10.573 | 714 |
| `#EXT-X-APE-PLAYER-ENSLAVE-SID` | 10.573 | 728 |
| `#EXT-X-APE-PLAYER-ENSLAVE-TIVIMATE` | 10.573 | 711 |
| `#EXT-X-APE-PLAYER-ENSLAVE-TIZEN` | 10.573 | 717 |
| `#EXT-X-APE-PLAYER-ENSLAVE-VLC` | 10.573 | 709 |
| `#EXT-X-APE-PLAYER-ENSLAVE-WEBOS` | 10.573 | 718 |
| `#EXT-X-APE-PLAYER-ENSLAVE-WEBRTC` | 10.573 | 725 |
| `#EXT-X-APE-PLAYER-ENSLAVE-WEBSOCKET` | 10.573 | 727 |
| `#EXT-X-APE-PLAYER-ENSLAVE-WEBTRANSPORT` | 10.573 | 726 |
| `#EXT-X-APE-PLAYER-ENSLAVE-WINDOWS` | 10.573 | 722 |
| `#EXT-X-APE-POLIMORFISMO` | 10.573 | 864 |
| `#EXT-X-APE-POLIMORFISMO-ANABOLIC` | 10.573 | 877 |
| `#EXT-X-APE-POLIMORFISMO-CAPACITY` | 10.573 | 879 |
| `#EXT-X-APE-POLIMORFISMO-CORTEX` | 10.573 | 878 |
| `#EXT-X-APE-POLIMORFISMO-DEGRADATION` | 10.573 | 885 |
| `#EXT-X-APE-POLIMORFISMO-DRM` | 10.573 | 883 |
| `#EXT-X-APE-POLIMORFISMO-EVASION` | 10.573 | 881 |
| `#EXT-X-APE-POLIMORFISMO-IP` | 10.573 | 873 |
| `#EXT-X-APE-POLIMORFISMO-JWT` | 10.573 | 876 |
| `#EXT-X-APE-POLIMORFISMO-LIST-HASH` | 10.573 | 870 |
| `#EXT-X-APE-POLIMORFISMO-NONCE` | 10.573 | 868 |
| `#EXT-X-APE-POLIMORFISMO-PHANTOM` | 10.573 | 880 |
| `#EXT-X-APE-POLIMORFISMO-REQUEST` | 10.573 | 875 |
| `#EXT-X-APE-POLIMORFISMO-RESILIENCE` | 10.573 | 884 |
| `#EXT-X-APE-POLIMORFISMO-SEED` | 10.573 | 867 |
| `#EXT-X-APE-POLIMORFISMO-SESSION` | 10.573 | 874 |
| `#EXT-X-APE-POLIMORFISMO-SID` | 10.573 | 869 |
| `#EXT-X-APE-POLIMORFISMO-SPOOF` | 10.573 | 882 |
| `#EXT-X-APE-POLIMORFISMO-STRATEGY` | 10.573 | 866 |
| `#EXT-X-APE-POLIMORFISMO-TIMESTAMP` | 10.573 | 871 |
| `#EXT-X-APE-POLIMORFISMO-UA` | 10.573 | 872 |
| `#EXT-X-APE-POLIMORFISMO-UNIQUENESS` | 10.573 | 865 |
| `#EXT-X-APE-PREFETCH` | 10.573 | 795 |
| `#EXT-X-APE-PREFETCH-ADAPTIVE-INTELLIGENCE` | 10.573 | 800 |
| `#EXT-X-APE-PREFETCH-AI-PREDICTION` | 10.573 | 801 |
| `#EXT-X-APE-PREFETCH-CACHE` | 10.573 | 803 |
| `#EXT-X-APE-PREFETCH-CACHE-SIZE` | 10.573 | 804 |
| `#EXT-X-APE-PREFETCH-CACHE-TTL` | 10.573 | 805 |
| `#EXT-X-APE-PREFETCH-INIT` | 10.573 | 806 |
| `#EXT-X-APE-PREFETCH-PARALLEL` | 10.573 | 799 |
| `#EXT-X-APE-PREFETCH-PRIORITY` | 10.573 | 798 |
| `#EXT-X-APE-PREFETCH-STRATEGY` | 10.573 | 796 |
| `#EXT-X-APE-PREFETCH-TIMEOUT` | 10.573 | 797 |
| `#EXT-X-APE-QUALITY-MODE` | 10.573 | 1130 |
| `#EXT-X-APE-QUALITY-OVERRIDE` | 10.573 | 729 |
| `#EXT-X-APE-QUALITY-OVERRIDE-AI-FI` | 10.573 | 738 |
| `#EXT-X-APE-QUALITY-OVERRIDE-AI-SR` | 10.573 | 737 |
| `#EXT-X-APE-QUALITY-OVERRIDE-AUDIO` | 10.573 | 733 |
| `#EXT-X-APE-QUALITY-OVERRIDE-BITDEPTH` | 10.573 | 743 |
| `#EXT-X-APE-QUALITY-OVERRIDE-CHROMA` | 10.573 | 744 |
| `#EXT-X-APE-QUALITY-OVERRIDE-CODEC` | 10.573 | 732 |
| `#EXT-X-APE-QUALITY-OVERRIDE-COLORSPACE` | 10.573 | 745 |
| `#EXT-X-APE-QUALITY-OVERRIDE-FRAMERATE` | 10.573 | 731 |
| `#EXT-X-APE-QUALITY-OVERRIDE-HDR` | 10.573 | 734 |
| `#EXT-X-APE-QUALITY-OVERRIDE-LCEVC` | 10.573 | 736 |
| `#EXT-X-APE-QUALITY-OVERRIDE-MATRIX` | 10.573 | 748 |
| `#EXT-X-APE-QUALITY-OVERRIDE-NITS` | 10.573 | 735 |
| `#EXT-X-APE-QUALITY-OVERRIDE-PRIMARIES` | 10.573 | 747 |
| `#EXT-X-APE-QUALITY-OVERRIDE-PSNR` | 10.573 | 741 |
| `#EXT-X-APE-QUALITY-OVERRIDE-RANGE` | 10.573 | 749 |
| `#EXT-X-APE-QUALITY-OVERRIDE-RESOLUTION` | 10.573 | 730 |
| `#EXT-X-APE-QUALITY-OVERRIDE-SID` | 10.573 | 750 |
| `#EXT-X-APE-QUALITY-OVERRIDE-SSIM` | 10.573 | 742 |
| `#EXT-X-APE-QUALITY-OVERRIDE-TRANSFER` | 10.573 | 746 |
| `#EXT-X-APE-QUALITY-OVERRIDE-VMAF` | 10.573 | 740 |
| `#EXT-X-APE-QUALITY-OVERRIDE-VRR` | 10.573 | 739 |
| `#EXT-X-APE-QUALITY-SOURCE` | 10.573 | 1126 |
| `#EXT-X-APE-RESILIENCE` | 10.573 | 551 |
| `#EXT-X-APE-RESILIENCE-BULKHEAD` | 10.573 | 567 |
| `#EXT-X-APE-RESILIENCE-CIRCUIT-BREAKER` | 10.573 | 566 |
| `#EXT-X-APE-RESILIENCE-DEGRADATION` | 10.573 | 555 |
| `#EXT-X-APE-RESILIENCE-DEGRADATION-L1` | 10.573 | 556 |
| `#EXT-X-APE-RESILIENCE-DEGRADATION-L2` | 10.573 | 557 |
| `#EXT-X-APE-RESILIENCE-DEGRADATION-L3` | 10.573 | 558 |
| `#EXT-X-APE-RESILIENCE-DEGRADATION-L4` | 10.573 | 559 |
| `#EXT-X-APE-RESILIENCE-DEGRADATION-L5` | 10.573 | 560 |
| `#EXT-X-APE-RESILIENCE-DEGRADATION-L6` | 10.573 | 561 |
| `#EXT-X-APE-RESILIENCE-DEGRADATION-L7` | 10.573 | 562 |
| `#EXT-X-APE-RESILIENCE-FAILOVER` | 10.573 | 552 |
| `#EXT-X-APE-RESILIENCE-HEALTH-CHECK` | 10.573 | 565 |
| `#EXT-X-APE-RESILIENCE-HTTP2` | 10.573 | 571 |
| `#EXT-X-APE-RESILIENCE-HTTP3` | 10.573 | 572 |
| `#EXT-X-APE-RESILIENCE-KEEPALIVE` | 10.573 | 569 |
| `#EXT-X-APE-RESILIENCE-PIPELINING` | 10.573 | 570 |
| `#EXT-X-APE-RESILIENCE-RECONNECT` | 10.573 | 554 |
| `#EXT-X-APE-RESILIENCE-RETRY` | 10.573 | 553 |
| `#EXT-X-APE-RESILIENCE-SID` | 10.573 | 574 |
| `#EXT-X-APE-RESILIENCE-TIMEOUT` | 10.573 | 568 |
| `#EXT-X-APE-RESILIENCE-TLS13` | 10.573 | 573 |
| `#EXT-X-APE-RESOLUTION-SUPREMACY` | 10.573 | 476 |
| `#EXT-X-APE-SCORECARD` | 10.573 | 493 |
| `#EXT-X-APE-SCORECARD-ACTION` | 10.573 | 496 |
| `#EXT-X-APE-SCORECARD-DYNAMIC` | 10.573 | 494 |
| `#EXT-X-APE-SCORECARD-THRESHOLD` | 10.573 | 495 |
| `#EXT-X-APE-SESSION-WARMUP` | 10.573 | 807 |
| `#EXT-X-APE-SESSION-WARMUP-CACHE` | 10.573 | 812 |
| `#EXT-X-APE-SESSION-WARMUP-DNS-PREFETCH` | 10.573 | 814 |
| `#EXT-X-APE-SESSION-WARMUP-HTTP2-PRECONNECT` | 10.573 | 816 |
| `#EXT-X-APE-SESSION-WARMUP-NONCE` | 10.573 | 819 |
| `#EXT-X-APE-SESSION-WARMUP-PARALLEL` | 10.573 | 810 |
| `#EXT-X-APE-SESSION-WARMUP-PRECONNECT` | 10.573 | 813 |
| `#EXT-X-APE-SESSION-WARMUP-PRIORITY` | 10.573 | 811 |
| `#EXT-X-APE-SESSION-WARMUP-QUIC-PRECONNECT` | 10.573 | 817 |
| `#EXT-X-APE-SESSION-WARMUP-SEGMENTS` | 10.573 | 809 |
| `#EXT-X-APE-SESSION-WARMUP-SID` | 10.573 | 818 |
| `#EXT-X-APE-SESSION-WARMUP-TIMEOUT` | 10.573 | 808 |
| `#EXT-X-APE-SESSION-WARMUP-TLS-PRECONNECT` | 10.573 | 815 |
| `#EXT-X-APE-SPACE-VALIDATOR` | 10.573 | 820 |
| `#EXT-X-APE-SPACE-VALIDATOR-AUDIO` | 10.573 | 823 |
| `#EXT-X-APE-SPACE-VALIDATOR-BANDWIDTH` | 10.573 | 829 |
| `#EXT-X-APE-SPACE-VALIDATOR-BUFFER` | 10.573 | 828 |
| `#EXT-X-APE-SPACE-VALIDATOR-CMAF` | 10.573 | 826 |
| `#EXT-X-APE-SPACE-VALIDATOR-CODECS` | 10.573 | 822 |
| `#EXT-X-APE-SPACE-VALIDATOR-DRM` | 10.573 | 827 |
| `#EXT-X-APE-SPACE-VALIDATOR-FRAMERATE` | 10.573 | 831 |
| `#EXT-X-APE-SPACE-VALIDATOR-HDR` | 10.573 | 824 |
| `#EXT-X-APE-SPACE-VALIDATOR-JITTER` | 10.573 | 836 |
| `#EXT-X-APE-SPACE-VALIDATOR-LATENCY` | 10.573 | 838 |
| `#EXT-X-APE-SPACE-VALIDATOR-LCEVC` | 10.573 | 825 |
| `#EXT-X-APE-SPACE-VALIDATOR-LOSS` | 10.573 | 837 |
| `#EXT-X-APE-SPACE-VALIDATOR-MANIFEST` | 10.573 | 821 |
| `#EXT-X-APE-SPACE-VALIDATOR-MOS` | 10.573 | 833 |
| `#EXT-X-APE-SPACE-VALIDATOR-PSNR` | 10.573 | 834 |
| `#EXT-X-APE-SPACE-VALIDATOR-REBUFFER` | 10.573 | 840 |
| `#EXT-X-APE-SPACE-VALIDATOR-RESOLUTION` | 10.573 | 830 |
| `#EXT-X-APE-SPACE-VALIDATOR-SID` | 10.573 | 841 |
| `#EXT-X-APE-SPACE-VALIDATOR-SSIM` | 10.573 | 835 |
| `#EXT-X-APE-SPACE-VALIDATOR-STARTUP` | 10.573 | 839 |
| `#EXT-X-APE-SPACE-VALIDATOR-VMAF` | 10.573 | 832 |
| `#EXT-X-APE-SPOOF` | 10.573 | 575 |
| `#EXT-X-APE-SPOOF-ACCEPT` | 10.573 | 588 |
| `#EXT-X-APE-SPOOF-ACCEPT-ENCODING` | 10.573 | 590 |
| `#EXT-X-APE-SPOOF-ACCEPT-LANGUAGE` | 10.573 | 589 |
| `#EXT-X-APE-SPOOF-ANDROID` | 10.573 | 576 |
| `#EXT-X-APE-SPOOF-CACHE-CONTROL` | 10.573 | 592 |
| `#EXT-X-APE-SPOOF-CHROME` | 10.573 | 578 |
| `#EXT-X-APE-SPOOF-CONNECTION` | 10.573 | 591 |
| `#EXT-X-APE-SPOOF-EXOPLAYER` | 10.573 | 582 |
| `#EXT-X-APE-SPOOF-IOS` | 10.573 | 577 |
| `#EXT-X-APE-SPOOF-IP` | 10.573 | 585 |
| `#EXT-X-APE-SPOOF-KODI` | 10.573 | 581 |
| `#EXT-X-APE-SPOOF-ORIGIN` | 10.573 | 587 |
| `#EXT-X-APE-SPOOF-OTT` | 10.573 | 580 |
| `#EXT-X-APE-SPOOF-PRAGMA` | 10.573 | 593 |
| `#EXT-X-APE-SPOOF-REFERER` | 10.573 | 586 |
| `#EXT-X-APE-SPOOF-SAFARI` | 10.573 | 584 |
| `#EXT-X-APE-SPOOF-SEC-FETCH-DEST` | 10.573 | 594 |
| `#EXT-X-APE-SPOOF-SEC-FETCH-MODE` | 10.573 | 595 |
| `#EXT-X-APE-SPOOF-SEC-FETCH-SITE` | 10.573 | 596 |
| `#EXT-X-APE-SPOOF-TIVIMATE` | 10.573 | 579 |
| `#EXT-X-APE-SPOOF-VLC` | 10.573 | 583 |
| `#EXT-X-APE-SYS-SYS-CATCHUP` | 10.573 | 1097 |
| `#EXT-X-APE-SYS-SYS-CATCHUP-DAYS` | 10.573 | 1100 |
| `#EXT-X-APE-SYS-SYS-CLOCK-SYNCHRO` | 10.573 | 1103 |
| `#EXT-X-APE-SYS-SYS-CONGESTION-CONTROL` | 10.573 | 1104 |
| `#EXT-X-APE-SYS-SYS-PREFETCH-PARALLEL` | 10.573 | 1094 |
| `#EXT-X-APE-SYS-SYS-PREFETCH-SEGMENTS` | 10.573 | 1099 |
| `#EXT-X-APE-SYS-SYS-RECONNECT-COUNT` | 10.573 | 1101 |
| `#EXT-X-APE-SYS-SYS-SERVER-POOL-MODE` | 10.573 | 1098 |
| `#EXT-X-APE-SYS-SYS-SOCKET-RCVBUF-KB` | 10.573 | 1095 |
| `#EXT-X-APE-SYS-SYS-TCP-KEEPALIVE-MS` | 10.573 | 1096 |
| `#EXT-X-APE-SYS-SYS-TLS-SESSION-RESUME` | 10.573 | 1119 |
| `#EXT-X-APE-SYS-SYS-TLS-VERIFY-PEER` | 10.573 | 1102 |
| `#EXT-X-APE-TELCHEMY` | 10.573 | 478 |
| `#EXT-X-APE-TELCHEMY-AVAILABILITY` | 10.573 | 486 |
| `#EXT-X-APE-TELCHEMY-BITRATE` | 10.573 | 483 |
| `#EXT-X-APE-TELCHEMY-BUFFER` | 10.573 | 481 |
| `#EXT-X-APE-TELCHEMY-CODEC` | 10.573 | 484 |
| `#EXT-X-APE-TELCHEMY-LATENCY` | 10.573 | 482 |
| `#EXT-X-APE-TELCHEMY-QOE` | 10.573 | 480 |
| `#EXT-X-APE-TELCHEMY-QOS` | 10.573 | 479 |
| `#EXT-X-APE-TELCHEMY-RESOLUTION` | 10.573 | 485 |
| `#EXT-X-APE-TELCHEMY-SID` | 10.573 | 487 |
| `#EXT-X-APE-THROUGHPUT` | 10.573 | 751 |
| `#EXT-X-APE-THROUGHPUT-BOTTLENECK-ACTION` | 10.573 | 767 |
| `#EXT-X-APE-THROUGHPUT-BOTTLENECK-DEGRADATION` | 10.573 | 771 |
| `#EXT-X-APE-THROUGHPUT-BOTTLENECK-FAILOVER` | 10.573 | 770 |
| `#EXT-X-APE-THROUGHPUT-BOTTLENECK-NOTIFY` | 10.573 | 769 |
| `#EXT-X-APE-THROUGHPUT-BOTTLENECK-SCALE` | 10.573 | 768 |
| `#EXT-X-APE-THROUGHPUT-BOTTLENECK-THRESHOLD` | 10.573 | 766 |
| `#EXT-X-APE-THROUGHPUT-DEVICE` | 10.573 | 761 |
| `#EXT-X-APE-THROUGHPUT-ESCALATION` | 10.573 | 753 |
| `#EXT-X-APE-THROUGHPUT-ESCALATION-L1` | 10.573 | 754 |
| `#EXT-X-APE-THROUGHPUT-ESCALATION-L2` | 10.573 | 755 |
| `#EXT-X-APE-THROUGHPUT-ESCALATION-L3` | 10.573 | 756 |
| `#EXT-X-APE-THROUGHPUT-ESCALATION-L4` | 10.573 | 757 |
| `#EXT-X-APE-THROUGHPUT-ESCALATION-L5` | 10.573 | 758 |
| `#EXT-X-APE-THROUGHPUT-ESCALATION-L6` | 10.573 | 759 |
| `#EXT-X-APE-THROUGHPUT-ESCALATION-L7` | 10.573 | 760 |
| `#EXT-X-APE-THROUGHPUT-MEASURE` | 10.573 | 752 |
| `#EXT-X-APE-THROUGHPUT-QOS-ESCALATION` | 10.573 | 765 |
| `#EXT-X-APE-THROUGHPUT-SID` | 10.573 | 772 |
| `#EXT-X-APE-THROUGHPUT-TIER-1` | 10.573 | 762 |
| `#EXT-X-APE-THROUGHPUT-TIER-2` | 10.573 | 763 |
| `#EXT-X-APE-THROUGHPUT-TIER-3` | 10.573 | 764 |
| `#EXT-X-APE-TLS-0RTT` | 10.573 | 939 |
| `#EXT-X-APE-TLS-ALPN` | 10.573 | 936 |
| `#EXT-X-APE-TLS-CIPHERS` | 10.573 | 933 |
| `#EXT-X-APE-TLS-COHERENCE` | 10.573 | 941 |
| `#EXT-X-APE-TLS-COHERENCE-ANDROID` | 10.573 | 943 |
| `#EXT-X-APE-TLS-COHERENCE-CHROME` | 10.573 | 942 |
| `#EXT-X-APE-TLS-COHERENCE-EXOPLAYER` | 10.573 | 945 |
| `#EXT-X-APE-TLS-COHERENCE-IOS` | 10.573 | 944 |
| `#EXT-X-APE-TLS-COHERENCE-KODI` | 10.573 | 946 |
| `#EXT-X-APE-TLS-COHERENCE-OTT` | 10.573 | 949 |
| `#EXT-X-APE-TLS-COHERENCE-TIVIMATE` | 10.573 | 948 |
| `#EXT-X-APE-TLS-COHERENCE-VLC` | 10.573 | 947 |
| `#EXT-X-APE-TLS-CURVES` | 10.573 | 934 |
| `#EXT-X-APE-TLS-EARLY-DATA` | 10.573 | 938 |
| `#EXT-X-APE-TLS-EXTENSIONS` | 10.573 | 935 |
| `#EXT-X-APE-TLS-JA3` | 10.573 | 930 |
| `#EXT-X-APE-TLS-JA4` | 10.573 | 931 |
| `#EXT-X-APE-TLS-SESSION-RESUMPTION` | 10.573 | 937 |
| `#EXT-X-APE-TLS-SID` | 10.573 | 950 |
| `#EXT-X-APE-TLS-SNI-OBFUSCATE` | 10.573 | 940 |
| `#EXT-X-APE-TLS-VERSION` | 10.573 | 932 |
| `#EXT-X-APE-VPN` | 10.573 | 995 |
| `#EXT-X-APE-VPN-DNS-LEAK` | 10.573 | 999 |
| `#EXT-X-APE-VPN-DOUBLE-HOP` | 10.573 | 1003 |
| `#EXT-X-APE-VPN-HTTP-PROXY` | 10.573 | 1010 |
| `#EXT-X-APE-VPN-HYSTERIA` | 10.573 | 1015 |
| `#EXT-X-APE-VPN-I2P` | 10.573 | 1007 |
| `#EXT-X-APE-VPN-IPV6-LEAK` | 10.573 | 1000 |
| `#EXT-X-APE-VPN-KILL-SWITCH` | 10.573 | 998 |
| `#EXT-X-APE-VPN-MULTI-HOP` | 10.573 | 1004 |
| `#EXT-X-APE-VPN-OBFUSCATION` | 10.573 | 1001 |
| `#EXT-X-APE-VPN-ONION` | 10.573 | 1005 |
| `#EXT-X-APE-VPN-PROTOCOL` | 10.573 | 996 |
| `#EXT-X-APE-VPN-PROXY` | 10.573 | 1008 |
| `#EXT-X-APE-VPN-SHADOWSOCKS` | 10.573 | 1011 |
| `#EXT-X-APE-VPN-SID` | 10.573 | 1016 |
| `#EXT-X-APE-VPN-SOCKS5` | 10.573 | 1009 |
| `#EXT-X-APE-VPN-SPLIT-TUNNEL` | 10.573 | 997 |
| `#EXT-X-APE-VPN-STEALTH` | 10.573 | 1002 |
| `#EXT-X-APE-VPN-TOR` | 10.573 | 1006 |
| `#EXT-X-APE-VPN-TROJAN` | 10.573 | 1013 |
| `#EXT-X-APE-VPN-V2RAY` | 10.573 | 1012 |
| `#EXT-X-APE-VPN-XRAY` | 10.573 | 1014 |
| `#EXT-X-APE-VRR` | 10.573 | 468 |
| `#EXT-X-APE-VRR-FREESYNC` | 10.573 | 470 |
| `#EXT-X-APE-VRR-GSYNC` | 10.573 | 469 |
| `#EXT-X-APE-VRR-HDMI21` | 10.573 | 471 |
| `#EXT-X-APE-XTREAM` | 10.573 | 951 |
| `#EXT-X-APE-XTREAM-BANDWIDTH` | 10.573 | 964 |
| `#EXT-X-APE-XTREAM-CODEC` | 10.573 | 962 |
| `#EXT-X-APE-XTREAM-CONTAINER` | 10.573 | 966 |
| `#EXT-X-APE-XTREAM-EXPLOIT-1` | 10.573 | 952 |
| `#EXT-X-APE-XTREAM-EXPLOIT-2` | 10.573 | 953 |
| `#EXT-X-APE-XTREAM-EXPLOIT-3` | 10.573 | 954 |
| `#EXT-X-APE-XTREAM-EXPLOIT-4` | 10.573 | 955 |
| `#EXT-X-APE-XTREAM-EXPLOIT-5` | 10.573 | 956 |
| `#EXT-X-APE-XTREAM-EXPLOIT-6` | 10.573 | 957 |
| `#EXT-X-APE-XTREAM-EXPLOIT-7` | 10.573 | 958 |
| `#EXT-X-APE-XTREAM-EXPLOIT-8` | 10.573 | 959 |
| `#EXT-X-APE-XTREAM-FORMAT` | 10.573 | 960 |
| `#EXT-X-APE-XTREAM-JWT` | 10.573 | 971 |
| `#EXT-X-APE-XTREAM-NONCE` | 10.573 | 970 |
| `#EXT-X-APE-XTREAM-OUTPUT` | 10.573 | 965 |
| `#EXT-X-APE-XTREAM-PREFETCH` | 10.573 | 967 |
| `#EXT-X-APE-XTREAM-QUALITY` | 10.573 | 961 |
| `#EXT-X-APE-XTREAM-RESOLUTION` | 10.573 | 963 |
| `#EXT-X-APE-XTREAM-SESSION` | 10.573 | 969 |
| `#EXT-X-APE-XTREAM-SID` | 10.573 | 972 |
| `#EXT-X-APE-XTREAM-WARMUP` | 10.573 | 968 |
| `#EXT-X-CMAF` | 10.573 | 405 |
| `#EXT-X-CMAF-AI-FI` | 10.573 | 418 |
| `#EXT-X-CMAF-AI-SR` | 10.573 | 417 |
| `#EXT-X-CMAF-ATMOS` | 10.573 | 421 |
| `#EXT-X-CMAF-AUDIO-FALLBACK` | 10.573 | 413 |
| `#EXT-X-CMAF-BUFFER` | 10.573 | 424 |
| `#EXT-X-CMAF-CHUNK-DURATION` | 10.573 | 407 |
| `#EXT-X-CMAF-CODEC-FALLBACK` | 10.573 | 412 |
| `#EXT-X-CMAF-CONTAINER` | 10.573 | 410 |
| `#EXT-X-CMAF-DOLBY-VISION` | 10.573 | 420 |
| `#EXT-X-CMAF-DTS` | 10.573 | 422 |
| `#EXT-X-CMAF-HDR` | 10.573 | 414 |
| `#EXT-X-CMAF-HDR-METADATA` | 10.573 | 415 |
| `#EXT-X-CMAF-IDEMPOTENCIA` | 10.573 | 428 |
| `#EXT-X-CMAF-INIT-SEGMENT` | 10.573 | 411 |
| `#EXT-X-CMAF-LATENCY` | 10.573 | 406 |
| `#EXT-X-CMAF-LCEVC` | 10.573 | 416 |
| `#EXT-X-CMAF-NETWORK` | 10.573 | 425 |
| `#EXT-X-CMAF-PART-HOLD-BACK` | 10.573 | 409 |
| `#EXT-X-CMAF-PART-TARGET` | 10.573 | 408 |
| `#EXT-X-CMAF-POLIMORFISMO` | 10.573 | 427 |
| `#EXT-X-CMAF-SESSION` | 10.573 | 426 |
| `#EXT-X-CMAF-TRUEHD` | 10.573 | 423 |
| `#EXT-X-CMAF-VERSION` | 10.573 | 429 |
| `#EXT-X-CMAF-VRR` | 10.573 | 419 |
| `#EXT-X-I-FRAME-STREAM-INF` | 10.573 | 1124 |
| `#EXT-X-PHANTOM-HYDRA` | 10.573 | 1059 |
| `#EXT-X-PHANTOM-HYDRA-DNS-DOH` | 10.573 | 1070 |
| `#EXT-X-PHANTOM-HYDRA-DPI-BYPASS` | 10.573 | 1072 |
| `#EXT-X-PHANTOM-HYDRA-GEO-PHANTOM` | 10.573 | 1074 |
| `#EXT-X-PHANTOM-HYDRA-IP` | 10.573 | 1069 |
| `#EXT-X-PHANTOM-HYDRA-NONCE` | 10.573 | 1076 |
| `#EXT-X-PHANTOM-HYDRA-SANDVINE-BYPASS` | 10.573 | 1073 |
| `#EXT-X-PHANTOM-HYDRA-SID` | 10.573 | 1075 |
| `#EXT-X-PHANTOM-HYDRA-SNI` | 10.573 | 1071 |
| `#EXT-X-PHANTOM-HYDRA-UA-EXOPLAYER` | 10.573 | 1066 |
| `#EXT-X-PHANTOM-HYDRA-UA-KODI` | 10.573 | 1065 |
| `#EXT-X-PHANTOM-HYDRA-UA-OTT` | 10.573 | 1064 |
| `#EXT-X-PHANTOM-HYDRA-UA-SAFARI` | 10.573 | 1068 |
| `#EXT-X-PHANTOM-HYDRA-UA-TIER1` | 10.573 | 1060 |
| `#EXT-X-PHANTOM-HYDRA-UA-TIER2` | 10.573 | 1061 |
| `#EXT-X-PHANTOM-HYDRA-UA-TIER3` | 10.573 | 1062 |
| `#EXT-X-PHANTOM-HYDRA-UA-TIVIMATE` | 10.573 | 1063 |
| `#EXT-X-PHANTOM-HYDRA-UA-VLC` | 10.573 | 1067 |
| `#EXT-X-STREAM-INF` | 10.573 | 1161 |
| `#EXT-X-VNOVA-LCEVC` | 10.573 | 1017 |
| `#EXT-X-VNOVA-LCEVC-BANDWIDTH-SAVING` | 10.573 | 1021 |
| `#EXT-X-VNOVA-LCEVC-BASE-BANDWIDTH` | 10.573 | 1031 |
| `#EXT-X-VNOVA-LCEVC-BASE-CODEC` | 10.573 | 1029 |
| `#EXT-X-VNOVA-LCEVC-BASE-FPS` | 10.573 | 1035 |
| `#EXT-X-VNOVA-LCEVC-BASE-LAYER` | 10.573 | 1027 |
| `#EXT-X-VNOVA-LCEVC-BASE-RESOLUTION` | 10.573 | 1033 |
| `#EXT-X-VNOVA-LCEVC-CODEC` | 10.573 | 1019 |
| `#EXT-X-VNOVA-LCEVC-ENHANCEMENT-BANDWIDTH` | 10.573 | 1030 |
| `#EXT-X-VNOVA-LCEVC-ENHANCEMENT-CODEC` | 10.573 | 1028 |
| `#EXT-X-VNOVA-LCEVC-ENHANCEMENT-FPS` | 10.573 | 1034 |
| `#EXT-X-VNOVA-LCEVC-ENHANCEMENT-LAYER` | 10.573 | 1026 |
| `#EXT-X-VNOVA-LCEVC-ENHANCEMENT-RESOLUTION` | 10.573 | 1032 |
| `#EXT-X-VNOVA-LCEVC-FALLBACK` | 10.573 | 1024 |
| `#EXT-X-VNOVA-LCEVC-FALLBACK-RESOLUTION` | 10.573 | 1025 |
| `#EXT-X-VNOVA-LCEVC-LATENCY` | 10.573 | 1023 |
| `#EXT-X-VNOVA-LCEVC-QUALITY-BOOST` | 10.573 | 1022 |
| `#EXT-X-VNOVA-LCEVC-RESOLUTION` | 10.573 | 1020 |
| `#EXT-X-VNOVA-LCEVC-SID` | 10.573 | 1036 |
| `#EXT-X-VNOVA-LCEVC-VERSION` | 10.573 | 1018 |
| `#EXTHTTP` | 10.573 | 316 |
| `#EXTINF` | 10.573 | 189 |
| `#EXT-X-APE-BANDWIDTH` | 10.528 | 1141 |
| `#EXT-X-APE-BANDWIDTH-VERIFIED` | 10.528 | 1142 |
| `#EXT-X-APE-CODEC-FALLBACK-1` | 10.528 | 1144 |
| `#EXT-X-APE-CODEC-FALLBACK-2` | 10.528 | 1146 |
| `#EXT-X-APE-CODEC-FALLBACK-3` | 10.528 | 1148 |
| `#EXT-X-APE-CODEC-FALLBACK-4` | 10.528 | 1150 |
| `#EXT-X-APE-CODEC-PREFERRED` | 10.528 | 1131 |
| `#EXT-X-APE-CODEC-VERIFIED` | 10.528 | 1132 |
| `#EXT-X-APE-FALLBACK-POLICY` | 10.528 | 1143 |
| `#EXT-X-APE-FPS-SOURCE` | 10.528 | 1158 |
| `#EXT-X-APE-RESOLUTION` | 10.528 | 1139 |
| `#EXT-X-APE-RESOLUTION-FALLBACK-1` | 10.528 | 1145 |
| `#EXT-X-APE-RESOLUTION-FALLBACK-2` | 10.528 | 1147 |
| `#EXT-X-APE-RESOLUTION-FALLBACK-3` | 10.528 | 1149 |
| `#EXT-X-APE-RESOLUTION-FALLBACK-4` | 10.528 | 1151 |
| `#EXT-X-APE-RESOLUTION-VERIFIED` | 10.528 | 1140 |
| `#EXT-X-APE-CODEC-FALLBACK-5` | 10.363 | 1152 |
| `#EXT-X-APE-RESOLUTION-FALLBACK-5` | 10.363 | 1153 |
| `#EXT-X-APE-CODEC-FALLBACK-6` | 8606 | 1154 |
| `#EXT-X-APE-RESOLUTION-FALLBACK-6` | 8606 | 1155 |
| `#EXT-X-APE-CODEC-FALLBACK-7` | 7963 | 1156 |
| `#EXT-X-APE-RESOLUTION-FALLBACK-7` | 7963 | 1157 |
| `#EXT-X-APE-CONTAINER-PREFERRED` | 5687 | 1136 |
| `#EXT-X-APE-HDR-PREFERRED` | 829 | 36.292 |
| `#EXT-X-SESSION-DATA` | 24 | 37 |
| `#EXT-X-APE-LAB-METADATA` | 20 | 13 |
| `#EXT-X-APE-BUFFER-STRATEGY` | 2 | 86 |
| `#EXT-X-SERVER-CONTROL` | 2 | 34 |
| `#EXT-X-START` | 2 | 33 |
| `#EXT-X-APE-ANTI-FREEZE-NUCLEAR` | 1 | 84 |
| `#EXT-X-APE-AUDIO-CODEC-PRIORITY` | 1 | 172 |
| `#EXT-X-APE-AUDIO-DOWNMIX` | 1 | 171 |
| `#EXT-X-APE-AUDIO-EARC` | 1 | 168 |
| `#EXT-X-APE-AUDIO-FALLBACK` | 1 | 170 |
| `#EXT-X-APE-AUDIO-NO-DAMAGE` | 1 | 176 |
| `#EXT-X-APE-AUDIO-SAFE-FORMATS` | 1 | 173 |
| `#EXT-X-APE-AUDIO-TRANSCODE-ON-INVALID` | 1 | 174 |
| `#EXT-X-APE-AUDIO-VALIDATE` | 1 | 175 |
| `#EXT-X-APE-AUDIT-OMEGA` | 1 | 187 |
| `#EXT-X-APE-AUDIT-SCORECARD` | 1 | 10.315.660 |
| `#EXT-X-APE-AV1-FALLBACK-CHAIN` | 1 | 162 |
| `#EXT-X-APE-BUFFER-DYNAMIC-ADJUSTMENT` | 1 | 159 |
| `#EXT-X-APE-BUFFER-PRELOAD-SEGMENTS` | 1 | 158 |
| `#EXT-X-APE-CHANNELS` | 1 | 4 |
| `#EXT-X-APE-CMCD-OBJECT` | 1 | 142 |
| `#EXT-X-APE-CMCD-REQUEST` | 1 | 144 |
| `#EXT-X-APE-CMCD-SESSION` | 1 | 143 |
| `#EXT-X-APE-CMCD-STATUS` | 1 | 145 |
| `#EXT-X-APE-CODEC-PRIORITY` | 1 | 163 |
| `#EXT-X-APE-CONTINUITY-FALLBACK` | 1 | 12 |
| `#EXT-X-APE-CONTINUITY-LAW` | 1 | 7 |
| `#EXT-X-APE-CONTINUITY-MANIFEST` | 1 | 8 |
| `#EXT-X-APE-CONTINUITY-RANGE` | 1 | 9 |
| `#EXT-X-APE-CONTINUITY-SEGMENTS` | 1 | 10 |
| `#EXT-X-APE-CONTINUITY-TRANSPORT` | 1 | 11 |
| `#EXT-X-APE-DRM-WIDEVINE` | 1 | 180 |
| `#EXT-X-APE-EVASION-GET` | 1 | 89 |
| `#EXT-X-APE-HTTP-HEADER-X-Decoding-Capability` | 1 | 155 |
| `#EXT-X-APE-HTTP-HEADER-X-Device-Class` | 1 | 154 |
| `#EXT-X-APE-IMPAIRMENT-GUARD` | 1 | 186 |
| `#EXT-X-APE-LAB-BOUNDS-P0` | 1 | 51 |
| `#EXT-X-APE-LAB-BOUNDS-P1` | 1 | 54 |
| `#EXT-X-APE-LAB-BOUNDS-P2` | 1 | 57 |
| `#EXT-X-APE-LAB-BOUNDS-P3` | 1 | 60 |
| `#EXT-X-APE-LAB-BOUNDS-P4` | 1 | 63 |
| `#EXT-X-APE-LAB-BOUNDS-P5` | 1 | 66 |
| `#EXT-X-APE-LAB-BULLETPROOF` | 1 | 48 |
| `#EXT-X-APE-LAB-DNA` | 1 | 6 |
| `#EXT-X-APE-LAB-EXPORTED-AT` | 1 | 47 |
| `#EXT-X-APE-LAB-EXTRAS` | 1 | 5 |
| `#EXT-X-APE-LAB-FILENAME` | 1 | 49 |
| `#EXT-X-APE-LAB-KNOBS-P0` | 1 | 52 |
| `#EXT-X-APE-LAB-KNOBS-P1` | 1 | 55 |
| `#EXT-X-APE-LAB-KNOBS-P2` | 1 | 58 |
| `#EXT-X-APE-LAB-KNOBS-P3` | 1 | 61 |
| `#EXT-X-APE-LAB-KNOBS-P4` | 1 | 64 |
| `#EXT-X-APE-LAB-KNOBS-P5` | 1 | 67 |
| `#EXT-X-APE-LAB-PROFILE-P0` | 1 | 50 |
| `#EXT-X-APE-LAB-PROFILE-P1` | 1 | 53 |
| `#EXT-X-APE-LAB-PROFILE-P2` | 1 | 56 |
| `#EXT-X-APE-LAB-PROFILE-P3` | 1 | 59 |
| `#EXT-X-APE-LAB-PROFILE-P4` | 1 | 62 |
| `#EXT-X-APE-LAB-PROFILE-P5` | 1 | 65 |
| `#EXT-X-APE-LAB-SCHEMA-VARIANT` | 1 | 46 |
| `#EXT-X-APE-MULTI-SOURCE` | 1 | 85 |
| `#EXT-X-APE-QMAX-STRATEGY` | 1 | 87 |
| `#EXT-X-APE-QOE-ENGINE` | 1 | 45 |
| `#EXT-X-APE-SPOOF-DECODING-CAPABILITY` | 1 | 152 |
| `#EXT-X-APE-SPOOF-DEVICE-CLASS` | 1 | 151 |
| `#EXT-X-APE-SPOOF-DEVICE-MODEL` | 1 | 153 |
| `#EXT-X-APE-TELCHEMY-TR101290` | 1 | 183 |
| `#EXT-X-APE-TELCHEMY-TVQM` | 1 | 182 |
| `#EXT-X-APE-TELEMETRY-TR101290` | 1 | 185 |
| `#EXT-X-APE-TELEMETRY-TVQM` | 1 | 184 |
| `#EXT-X-APE-TRANSPORT-CHUNK-SIZE` | 1 | 165 |
| `#EXT-X-APE-TRANSPORT-FALLBACK-1` | 1 | 166 |
| `#EXT-X-APE-TRANSPORT-PROTOCOL` | 1 | 164 |
| `#EXT-X-APE-VALIDATED` | 1 | 10.315.662 |
| `#EXT-X-BLOQUEO-CODIGOS` | 1 | 138 |
| `#EXT-X-BLOQUEO-DETECCION` | 1 | 137 |
| `#EXT-X-BLOQUEO-REINTENTOS` | 1 | 140 |
| `#EXT-X-BLOQUEO-RESPUESTA` | 1 | 139 |
| `#EXT-X-CONTENT-STEERING` | 1 | 90 |
| `#EXT-X-INDEPENDENT-SEGMENTS` | 1 | 3 |
| `#EXT-X-KEY` | 1 | 179 |
| `#EXT-X-MOTOR-EVASION` | 1 | 134 |
| `#EXT-X-PART-INF` | 1 | 36 |
| `#EXT-X-SERVER-1` | 1 | 133 |
| `#EXT-X-SYS-ALT-SVC` | 1 | 105 |
| `#EXT-X-SYS-ARCHITECTURE` | 1 | 93 |
| `#EXT-X-SYS-AUDIO-CODEC-PRIORITY` | 1 | 115 |
| `#EXT-X-SYS-AUDIO-QUALITY` | 1 | 117 |
| `#EXT-X-SYS-AVAILABILITY-TARGET` | 1 | 122 |
| `#EXT-X-SYS-BANDWIDTH-GUARANTEE` | 1 | 123 |
| `#EXT-X-SYS-COMPATIBLE` | 1 | 99 |
| `#EXT-X-SYS-COMPLIANCE` | 1 | 98 |
| `#EXT-X-SYS-COMPRESSION` | 1 | 110 |
| `#EXT-X-SYS-COMPRESSION-LEVEL` | 1 | 111 |
| `#EXT-X-SYS-FILE-CACHING` | 1 | 104 |
| `#EXT-X-SYS-FINGERPRINT` | 1 | 124 |
| `#EXT-X-SYS-FP-DEVICE` | 1 | 125 |
| `#EXT-X-SYS-FP-LANG` | 1 | 129 |
| `#EXT-X-SYS-FP-PLATFORM` | 1 | 126 |
| `#EXT-X-SYS-FP-SCREEN` | 1 | 127 |
| `#EXT-X-SYS-FP-TZ` | 1 | 128 |
| `#EXT-X-SYS-GENERATED` | 1 | 94 |
| `#EXT-X-SYS-GLOBAL-BUFFER-STRATEGY` | 1 | 101 |
| `#EXT-X-SYS-HTTP-HEADERS` | 1 | 141 |
| `#EXT-X-SYS-HTTP2-MAX-CONCURRENT-STREAMS` | 1 | 109 |
| `#EXT-X-SYS-HTTP2-MULTIPLEX` | 1 | 108 |
| `#EXT-X-SYS-LAYERS` | 1 | 100 |
| `#EXT-X-SYS-LIST-ID` | 1 | 95 |
| `#EXT-X-SYS-LIVE-CACHING` | 1 | 103 |
| `#EXT-X-SYS-MIN-HTTP-VERSION` | 1 | 107 |
| `#EXT-X-SYS-MIN-TLS-VERSION` | 1 | 113 |
| `#EXT-X-SYS-MODULES-ACTIVE` | 1 | 96 |
| `#EXT-X-SYS-MODULES-LIST` | 1 | 97 |
| `#EXT-X-SYS-NETWORK-CACHING` | 1 | 102 |
| `#EXT-X-SYS-PROTOCOL-PRIORITY` | 1 | 106 |
| `#EXT-X-SYS-RECONNECT-MAX-ATTEMPTS` | 1 | 120 |
| `#EXT-X-SYS-RECONNECT-TIMEOUT-MS` | 1 | 119 |
| `#EXT-X-SYS-RESILIENCE-MODE` | 1 | 118 |
| `#EXT-X-SYS-SERVER-DISTRIBUTION` | 1 | 132 |
| `#EXT-X-SYS-SERVER-POOL-SIZE` | 1 | 131 |
| `#EXT-X-SYS-SERVER-ROTATION` | 1 | 130 |
| `#EXT-X-SYS-TLS-PRIORITY` | 1 | 112 |
| `#EXT-X-SYS-VERSION` | 1 | 92 |
| `#EXT-X-SYS-VIDEO-CODEC-PRIORITY` | 1 | 114 |
| `#EXT-X-SYS-VIDEO-QUALITY` | 1 | 116 |
| `#EXT-X-SYS-ZERO-INTERRUPTIONS` | 1 | 121 |
| `#EXT-X-TARGETDURATION` | 1 | 35 |
| `#EXT-X-UA-POOL-SIZE` | 1 | 136 |
| `#EXT-X-UA-ROTATION` | 1 | 135 |
| `#EXT-X-VERSION` | 1 | 2 |
| `#EXTM3U x-tvg-url="" x-tvg-url-epg="" x-tvg-logo="" x-tvg-shift=0 catchup="flussonic" catchup-days="7" catchup-source="{MediaUrl}?utc={utc}&lutc={lutc}" url-tvg="" refresh="1800"` | 1 | 1 |

## Anexo B — comandos exactos (reproducibilidad)

```powershell
# 1) identidad
Get-Item -LiteralPath <lista> | ForEach-Object { $_.Length }
Get-FileHash -LiteralPath <lista> -Algorithm SHA256
rg -c '^#EXTINF' -- <lista>
rg -c '^[^#]' -- <lista>
rg -c '^#EXT-X-APE-' -- <lista>

# 2) censo estructural (un pase, 604 MB)
node scratch/avisynth_probe_2026/tools/analyze_structure.js <lista> \
     scratch/avisynth_probe_2026/tools/out/structure_raw.json \
     scratch/avisynth_probe_2026/fixtures/channels_index.csv

# 3) fixtures enmascarados (descubre host/usuario/pass de la propia lista)
node scratch/avisynth_probe_2026/tools/extract_blocks.js <lista> scratch/avisynth_probe_2026/fixtures \
     canal_001:189:1165 canal_medio:5157499:5158470 canal_ultimo:10314682:10315662 \
     canal_954_corto:5598535:5599488 canal_978_largo:9152384:9153361

# 4) entregables
node scratch/avisynth_probe_2026/tools/build_cartography.js \
     scratch/avisynth_probe_2026/tools/out/structure_raw.json \
     docs/cartography/APE_LISTA_523d52a6 <lista>

# 5) verificaciones puntuales
rg -c -F 'video-filter' -- <lista>;  rg -c -F 'hqdn3d' -- <lista>
rg -c -F 'BT.1886' -- <lista>;        rg -c -i -F 'bt1886' -- <lista>
rg -N -o '^http://([^/]+)/' -r '$1' -- <lista> | Sort-Object -Unique | Measure-Object
rg -N -o '^http://[^/]+/live/([^/]+)/([^/]+)/([^/]+)$' -r '$1/$2' -- <lista> | Sort-Object -Unique | Measure-Object
```

---

*Fase 1 cerrada. Esta cartografía es estática y local: no ha tocado la lista, no ha hecho red y no ha emitido juicio de calidad de imagen. Los huecos están en §11.*

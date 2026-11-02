# 06 — Plantilla de emisión del LAB: `player_enslavement`, `headerOverrides`, `actor_injections` y la capa que añade el generador

> **REA de la última capa.** Esta fase responde una sola pregunta y la responde con censo:
> *¿la cabecera emitida de la lista es exactamente `level_1_master_playlist`, o el generador añade capas por fuera del LAB?*
>
> **Respuesta medida: NO es exactamente `level_1`.** De las 187 líneas de tag de la cabecera,
> **8** son `level_1` con payload idéntico, **4** son `level_1` con **otro valor**,
> **53** son derivadas del propio LAB (export, perfiles, sesión) y **122** (el 65.24 %)
> **no tienen origen en el LAB**: son una capa del generador (`#EXT-X-SYS-*`, `#EXT-X-MOTOR-EVASION`, `#EXT-X-UA-ROTATION`,
> `#EXT-X-BLOQUEO-*`, `#EXT-X-APE-CMCD-*`, spoof, telemetría, audio, transporte, DRM…).

Y un hallazgo que cambia la lectura de la lista: **la cabecera se autodescribe**. Los 20 chunks
`#EXT-X-APE-LAB-METADATA:1/20…20/20` son el **LAB completo** en base64: 69.188 caracteres → **51.890 B** decodificados,
schema `ape-lab-metadata-v1`, con **25/25 campos idénticos** al LAB local (`cc6506f6b8e06934…` en disco, 61.889 B por estar indentado).
Es decir: **LAB → cabecera no es reproducible, pero cabecera → LAB sí, exacto**.

---

## 0. Fuentes, método y reglas

| Fuente | Identidad | Uso en esta fase |
|---|---|---|
| LAB decodificado | `scratch/avisynth_probe_2026/lab_decoded/lab_metadata.json` · 61.889 B · sha256 `cc6506f6b8e06934c6f2d4cdea5614da…` · schema `ape-lab-metadata-v1` · perfil `P0 / 8K Master` | plantilla declarada |
| Lista real (sólo lectura) | `APE_LISTA_1793589060441.m3u8` · 604.593.696 B · sha256 `523d52a6d147f81c…` · **187 líneas de cabecera** examinadas | emisión real |
| Bloque real de canal | `scratch/avisynth_probe_2026/fixtures/canal_001.txt` · 978 líneas (canal 1, enmascarado en t1) | cotejo de `level_3` |
| Censo de t1 | `scratch/avisynth_probe_2026/tools/out/structure_raw.json` · 250 claves `#EXTHTTP` · 819 tags | universo global |

**Reglas de la fase:** análisis estático local; **cero red**; credenciales enmascaradas (`<REDACTED>`); cada cifra sale del JSON
`06_emission_template.json` que produce el analizador; lo no medible se declara `NO COMPUTADO` (§8). No se ha tocado la lista, ni el VPS,
ni Excel, ni git. El script analizador se ejecutó desde `%TEMP%` (fuera del repo) para no escribir fuera de los dos entregables.

**Cómo se clasifica cada línea de cabecera** (criterio explícito, aplicado línea a línea):

| Clase | Regla |
|---|---|
| `en_LAB` | el **tag** existe en `level_1_master_playlist` y el **payload es byte-idéntico** |
| `en_LAB_valor_distinto` | el **tag** existe en `level_1` pero el payload emitido **difiere** (se cita ambos en §7) |
| `derivada` | proviene de otro campo del LAB: el export (`#EXT-X-APE-LAB-*`), el recuento de canales (`#EXT-X-APE-CHANNELS`), o `#EXT-X-SESSION-DATA` cuyo `DATA-ID`/`VALUE` sale de `fields` |
| `fuera_del_LAB` | ninguna de las anteriores: capa del generador (no hay campo del LAB que la origine) |

---

## 1. Plantilla de emisión declarada

### 1.1 `player_enslavement.level_1_master_playlist` — 11 directivas, y qué pasó con cada una

| # | Directiva declarada (LAB) | Estado en la cabecera | Línea(s) | Valor emitido si difiere |
|---|---|---|---|---|
| 1 | `#EXT-X-VERSION:6` | **valor distinto** | 2 | `6` → `9` |
| 2 | `#EXT-X-INDEPENDENT-SEGMENTS` | **exacta** | 3 |  |
| 3 | `#EXT-X-START:TIME-OFFSET=-14,PRECISE=YES` | **exacta** | 83 |  |
| 4 | `#EXT-X-APE-ANTI-FREEZE-NUCLEAR` | **exacta** | 84 |  |
| 5 | `#EXT-X-APE-MULTI-SOURCE:ENABLED\|FAILOVER=50ms\|RECONNECT=350` | **exacta** | 85 |  |
| 6 | `#EXT-X-APE-BUFFER-STRATEGY:NUCLEAR_NO_COMPROMISE\|MIN=52s\|TARGET=105s` | **exacta** | 86 |  |
| 7 | `#EXT-X-APE-QMAX-STRATEGY:GREEDY-BEST-AVAILABLE\|FACTOR=0,85` | **exacta** | 87 |  |
| 8 | `#EXT-X-DATERANGE:ID="omega-live-P0",X-OMEGA-TYPE="LIVE-CATCHUP",X-HDR-TYPE="DOLBY_VISION +` | **valor distinto** | 88 | `ID="omega-live-P0",X-OMEGA-TYPE="LIVE-CATCHUP",X-HDR-TYPE="DOLBY_VISIO` → `ID="omega-live-P0",X-OMEGA-TYPE="LIVE-CATCHUP",X-HDR-TYPE="HDR10+DV-P8` |
| 9 | `#EXT-X-APE-EVASION-GET:405-REWRITE-TO-HEAD` | **exacta** | 89 |  |
| 10 | `#EXT-X-CONTENT-STEERING:SERVER-URI="pool://failover",PATHWAY-ID="omega"` | **exacta** | 90 |  |
| 11 | `#EXT-X-DEFINE:NAME="OMEGA_BUILD",VALUE="P0_22.6.0-MEMC-TOTAL-8K120"` | **no emitida** | — | reemplazada funcionalmente por `#EXT-X-SESSION-DATA:DATA-ID="com.ape.build"` (L91) |

Resumen: **8 exactas**, **2 con valor distinto**, **1 no emitida**.
Las dos divergencias de valor son `#EXT-X-VERSION:6`→`9` (L2) y el `X-HDR-TYPE` del `#EXT-X-DATERANGE` (L88): el LAB declara
`DOLBY_VISION + HDR10+` y la lista emite `HDR10+DV-P81-P10`.

### 1.2 `player_enslavement.level_3_per_channel` — 5 claves vs el bloque real

| Clave | Claves en la plantilla | Claves emitidas en un canal | De la plantilla presentes | Ausentes | Emitidas fuera de la plantilla | Delta |
|---|---|---|---|---|---|---|
| `STREAM-INF` | 3 | 11 | 3 | 0 | 8 | +8 |
| `EXTVLCOPT` | 20 | 134 | 20 | 0 | 114 | +114 |
| `KODIPROP` | 10 | 103 | 10 | 0 | 93 | +93 |
| `EXTHTTP` | 12 | 200 | 9 | 3 | 191 | +188 |
| `SYS` | 11 | 12 | 11 | 0 | 1 | +1 |

**La plantilla `level_3` describe una fracción pequeña de lo que se emite.** El delta es estructural, no cosmético:

| Caso | Qué significa |
|---|---|
| `EXTVLCOPT` 20 → 134 | la plantilla fija 20 opciones; el bloque real emite 134 (20 de la plantilla + 114 de las capas `adaptive-*`, `hls-*`, `ts-*`, `avcodec-*`, `sub-*` y `video-*`) |
| `KODIPROP` 10 → 103 | la plantilla fija 10 claves ISA; el bloque emite 103 (audio, DRM, HDR, buffer, red, hlsjs…) |
| `EXTHTTP` 12 → 200 | la plantilla fija 12 cabeceras; el bloque emite **200** (199–200 en el censo de t1). Además **3 de las 12 no llegan a emitirse** (§4) |
| `STREAM-INF` 3 → 11 | la plantilla fija `HDCP-LEVEL`, `VIDEO-RANGE` y `FRAME-RATE`; el bloque emite 11 claves (añade `BANDWIDTH`, `AVERAGE-BANDWIDTH`, `RESOLUTION`, `CODECS`, `COLOR-PRIMARIES`, `MATRIX-COEFFICIENTS`, `TRANSFER-CHARACTERISTICS`, `STABLE-VARIANT-ID`) |
| `SYS` 11 → 12 | las 11 claves `SYS-*` se emiten como `#EXT-X-APE-SYS-SYS-*` **todas**; el bloque añade `SYS-TLS-SESSION-RESUME` (no está en la plantilla) |

**Valores que la plantilla declara y la emisión no respeta** (para el canal 1):

| Clave | Campo | Valor en el LAB | Valor emitido |
|---|---|---|---|
| `STREAM-INF` | `FRAME-RATE` | `120.000` | `30.000` |
| `EXTVLCOPT` | `sout-mux-caching` | `105000` | `55000` |
| `EXTVLCOPT` | `http-referrer` | `{config.referer}` | `https://www.netflix.com/` |
| `EXTVLCOPT` | `network-caching` | `105000` | `55000` |
| `EXTVLCOPT` | `live-caching` | `105000` | `55000` |
| `EXTVLCOPT` | `http-max-retries` | `350` | `156` |
| `EXTVLCOPT` | `http-user-agent` | `{config.user_agent}` | `Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML` |
| `EXTVLCOPT` | `adaptive-livedelay` | `14000` | `10000` |
| `EXTVLCOPT` | `file-caching` | `105000` | `55000` |
| `EXTVLCOPT` | `adaptive-maxbuffer` | `105000` | `55000` |
| `EXTVLCOPT` | `network-reconnect-count` | `350` | `156` |
| `KODIPROP` | `inputstream.adaptive.assured_buffer_duration` | `105` | `55` |
| `KODIPROP` | `inputstream.adaptive.live_delay` | `14` | `10` |
| `KODIPROP` | `inputstream.adaptive.max_buffer_duration` | `210` | `110` |
| `KODIPROP` | `inputstream.adaptive.stream_headers` | `{config.kodi_headers_urlencoded}` | `User-Agent=Roku%2FDVP-14.0%20(314.00E04156A)&Referer=https%3` |
| `EXTHTTP` | `Origin` | `{config.origin}` | `https://www.netflix.com` |
| `EXTHTTP` | `Referer` | `{config.referer}` | `https://www.netflix.com/` |
| `EXTHTTP` | `User-Agent` | `{config.user_agent}` | `Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML` |
| `EXTHTTP` | `Accept-Language` | `{config.locale}` | `es-ES, en-US` |
| `SYS` | `SYS-SOCKET-RCVBUF-KB` | `8192` | `2048` |
| `SYS` | `SYS-RECONNECT-COUNT` | `350` | `156` |

Nota sobre `EXTHTTP`: los valores `{config.*}` del LAB son **plantillas de sustitución**; la emisión las resuelve (p. ej.
`{config.user_agent}` → el UA real de Web0S). Eso **no** es una contradicción: es el contrato de la plantilla. Los 3 campos que
**sí faltan** (`Sec-Fetch-Site`, `Sec-Fetch-Mode`, `Sec-Fetch-Dest`) son una omisión real (§4).

---

## 2. Cobertura de la cabecera emitida (187 líneas de tag)

| Clase | Líneas | % de la cabecera |
|---|---|---|
| `en_LAB` | 8 | 4.28 % |
| `en_LAB_valor_distinto` | 4 | 2.14 % |
| `derivada` | 53 | 28.34 % |
| `fuera_del_LAB` | 122 | 65.24 % |
| **Total** | **187** | 100 % |

### 2.1 Qué capas añade el generador por fuera del LAB (122 líneas)

| Familia | Líneas |
|---|---|
| `#EXT-X-SYS-*` | 42 |
| `#EXT-X-SESSION-DATA (politicas com.ape.*)` | 16 |
| `#EXT-X-APE-AUDIO-*` | 9 |
| `#EXT-X-APE-CONTINUITY-*` | 6 |
| `#KODIPROP (nivel cabecera)` | 6 |
| `#EXT-X-APE-SPOOF-*/HTTP-HEADER-*` | 5 |
| `#EXT-X-BLOQUEO-*` | 4 |
| `#EXT-X-APE-CMCD-*` | 4 |
| `#EXTVLCOPT (nivel cabecera)` | 4 |
| `#EXT-X-APE-TELEMETRY-*/TELCHEMY-*` | 4 |
| `#EXT-X-SERVER-*` | 3 |
| `#EXT-X-APE-TRANSPORT-*` | 3 |
| `#EXT-X-UA-*` | 2 |
| `#EXT-X-APE-BUFFER-*` | 2 |
| `#EXTM3U (M3U Plus)` | 1 |
| `#EXT-X-TARGETDURATION` | 1 |
| `#EXT-X-PART-INF` | 1 |
| `#EXT-X-APE-QOE-ENGINE` | 1 |
| `#EXT-X-MOTOR-EVASION` | 1 |
| `#EXT-X-APE-QUANTUM-PIXEL` | 1 |
| `#EXT-X-APE-AV1-FALLBACK-CHAIN` | 1 |
| `#EXT-X-APE-CODEC-PRIORITY` | 1 |
| `#EXT-X-KEY` | 1 |
| `#EXT-X-APE-DRM-WIDEVINE` | 1 |
| `#EXT-X-APE-IMPAIRMENT-GUARD` | 1 |
| `#EXT-X-APE-AUDIT-OMEGA` | 1 |

### 2.2 Censo línea a línea de las 187 líneas

| L | Tag | Clase | Razón | Payload (recortado) |
|---|---|---|---|---|
| 1 | `#EXTM3U` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `` |
| 2 | `#EXT-X-VERSION` | en_LAB_valor_distinto | level_1 declara el mismo tag con otro valor | `9` |
| 3 | `#EXT-X-INDEPENDENT-SEGMENTS` | en_LAB | level_1_master_playlist, payload identico | `` |
| 4 | `#EXT-X-APE-CHANNELS` | derivada | recuento de canales de la propia lista (10.573) | `10573` |
| 5 | `#EXT-X-APE-LAB-EXTRAS` | derivada | export del propio LAB (fields.* serializados) | `1` |
| 6 | `#EXT-X-APE-LAB-DNA` | derivada | export del propio LAB (fields.* serializados) | `sha256=unverified,SOURCE=LAB_CALIBRATED,EXPORTED=2026-10-26T01:31:05` |
| 7 | `#EXT-X-APE-CONTINUITY-LAW` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `STREAMING_CONTINUITY_LAW_V1` |
| 8 | `#EXT-X-APE-CONTINUITY-MANIFEST` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `no-store` |
| 9 | `#EXT-X-APE-CONTINUITY-RANGE` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `206` |
| 10 | `#EXT-X-APE-CONTINUITY-SEGMENTS` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `session-unique` |
| 11 | `#EXT-X-APE-CONTINUITY-TRANSPORT` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `declared` |
| 12 | `#EXT-X-APE-CONTINUITY-FALLBACK` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `HDR>SDR1080>SDR720` |
| 13 | `#EXT-X-APE-LAB-METADATA` | derivada | export del propio LAB (fields.* serializados) | `1/20:eyJzY2hlbWEiOiJhcGUtbGFiLW1ldGFkYXRhLXYxIiwicHJvZmlsZSI6IlAwIiwiZ` |
| 14 | `#EXT-X-APE-LAB-METADATA` | derivada | export del propio LAB (fields.* serializados) | `2/20:cmVhbSI6InRydWUiLCJodHRwLW1heC1yZXRyaWVzIjoiOTkiLCJodHRwLXRpbWVvd` |
| 15 | `#EXT-X-APE-LAB-METADATA` | derivada | export del propio LAB (fields.* serializados) | `3/20:OiJEVkgxIiwiWC1FeG9QbGF5ZXItQnVmZmVyLU1pbiI6IjE1MDAwIiwiWC1NYW5pZ` |
| 16 | `#EXT-X-APE-LAB-METADATA` | derivada | export del propio LAB (fields.* serializados) | `4/20:IiwiWC1TdHJlYW0tVHlwZSI6ImhscyxjbWFmLGRhc2gsZGFzaCIsIlgtUGxheWJhY` |
| 17 | `#EXT-X-APE-LAB-METADATA` | derivada | export del propio LAB (fields.* serializados) | `5/20:dG9yIjoiZW5hYmxlZCxhZ2dyZXNzaXZlIiwiWC1SVFQtTW9uaXRvcmluZyI6ImVuY` |
| 18 | `#EXT-X-APE-LAB-METADATA` | derivada | export del propio LAB (fields.* serializados) | `6/20:UEUtUkVTSUxJRU5DRS1MMS1GT1JNQVQiOiJDTUFGLEhMU19GTVA0LEhMU19UUyxNU` |
| 19 | `#EXT-X-APE-LAB-METADATA` | derivada | export del propio LAB (fields.* serializados) | `7/20:T1MtRU5BQkxFRCI6IlRSVUUsRU5BQkxFRCxBREFQVElWRSxBVVRPIiwiWC1BUEUtU` |
| 20 | `#EXT-X-APE-LAB-METADATA` | derivada | export del propio LAB (fields.* serializados) | `8/20:Ljk3NiIsIlgtRnJhbWUtUmF0ZS1BZGFwdGl2ZSI6InRydWUiLCJYLURpc3BsYXktQ` |
| 21 | `#EXT-X-APE-LAB-METADATA` | derivada | export del propio LAB (fields.* serializados) | `9/20:REVOVElUWV9NT1JQSDtyZXRyaWVzPTg7ZmFsbGJhY2s9Q0ROX0ZBSUxPVkVSIiwiW` |
| 22 | `#EXT-X-APE-LAB-METADATA` | derivada | export del propio LAB (fields.* serializados) | `10/20:aW4tc2hpZWxkIiwiWC1FcnJvci1Fc2NhbGF0aW9uLVBvbGljeSI6IkNPUlRFWD5T` |
| 23 | `#EXT-X-APE-LAB-METADATA` | derivada | export del propio LAB (fields.* serializados) | `11/20:IjoicGFydGlhbCIsIlgtTWFzdGVyLUF1ZGl0LVBoRCI6ImNhbGlicmF0ZWQ9dHJ1` |
| 24 | `#EXT-X-APE-LAB-METADATA` | derivada | export del propio LAB (fields.* serializados) | `12/20:VU4xLjIrQ1JZU1RBTDRLLU5BVElWRS1QUStTQ0QtRkRJRkY4IiwiWC1Ub25lLU1h` |
| 25 | `#EXT-X-APE-LAB-METADATA` | derivada | export del propio LAB (fields.* serializados) | `13/20:aGRyIjoiaGxnIiwidmlkZW9fZmlsdGVyIjoiaHFkbjNkPWx1bWFfc3BhdGlhbD0y` |
| 26 | `#EXT-X-APE-LAB-METADATA` | derivada | export del propio LAB (fields.* serializados) | `14/20:b2NhbGhvc3QvLGh0dHBzOi8vaXB0di1hcGUuZHVja2Rucy5vcmcvcGxheWVyIiwi` |
| 27 | `#EXT-X-APE-LAB-METADATA` | derivada | export del propio LAB (fields.* serializados) | `15/20:ZWQsbm9uZSxhdXRvIiwiWC1FUEctU3luYyI6ImVuYWJsZWQsYXV0byxiYWNrZ3Jv` |
| 28 | `#EXT-X-APE-LAB-METADATA` | derivada | export del propio LAB (fields.* serializados) | `16/20:RVgtT01FR0EtU1RBVEUiOiJBQ1RJVkUsTU9OSVRPUklORyxBREFQVElWRSxQQVNT` |
| 29 | `#EXT-X-APE-LAB-METADATA` | derivada | export del propio LAB (fields.* serializados) | `17/20:UEUtQU5USS1DVVQtREVURUNUSU9OIjoiQURBUFRJVkUsUkVBTF9USU1FLEFVVE8s` |
| 30 | `#EXT-X-APE-LAB-METADATA` | derivada | export del propio LAB (fields.* serializados) | `18/20:YXV0byxwYXNzdGhyb3VnaCxoZHItdG8tc2RyLG5vbmUiLCJYLUhEUi1PdXRwdXQt` |
| 31 | `#EXT-X-APE-LAB-METADATA` | derivada | export del propio LAB (fields.* serializados) | `19/20:Z2EtbGl2ZS1QMFwiLFgtT01FR0EtVFlQRT1cIkxJVkUtQ0FUQ0hVUFwiLFgtSERS` |
| 32 | `#EXT-X-APE-LAB-METADATA` | derivada | export del propio LAB (fields.* serializados) | `20/20:YWNoaW5nX21zIjoxMDUwMDAsIm5ldHdvcmtfY2FjaGluZ19tcyI6MTA1MDAwLCJj` |
| 33 | `#EXT-X-START` | en_LAB_valor_distinto | level_1 declara el mismo tag con otro valor | `TIME-OFFSET=-3.0,PRECISE=YES` |
| 34 | `#EXT-X-SERVER-CONTROL` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.0,CAN-SKIP-UNTIL=12.0,HOLD-BACK=` |
| 35 | `#EXT-X-TARGETDURATION` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `2` |
| 36 | `#EXT-X-PART-INF` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `PART-TARGET=1.0` |
| 37 | `#EXT-X-SESSION-DATA` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `DATA-ID="exoplayer.load_control",VALUE="{\"minBufferMs\":20000,\"buffe` |
| 38 | `#EXT-X-SESSION-DATA` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `DATA-ID="exoplayer.track_selection",VALUE="{\"maxDurationForQualityDec` |
| 39 | `#EXT-X-SESSION-DATA` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `DATA-ID="com.ape.live_sync",VALUE="{\"liveSyncDurationCount\":3,\"live` |
| 40 | `#EXT-X-SESSION-DATA` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `DATA-ID="com.ape.recovery_policy",VALUE="{\"resumeFromLastPositionMs\"` |
| 41 | `#EXT-X-SESSION-DATA` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `DATA-ID="com.ape.network_resilience",VALUE="{\"connectionTimeoutMs\":8` |
| 42 | `#EXT-X-SESSION-DATA` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `DATA-ID="com.ape.abr_quality_policy",VALUE="{\"preferHigherBitrate\":t` |
| 43 | `#EXT-X-SESSION-DATA` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `DATA-ID="com.ape.universal_parity",VALUE="{\"applyToResolutions\":[\"4` |
| 44 | `#EXT-X-SESSION-DATA` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `DATA-ID="com.ape.codec_preferences",VALUE="{\"preferredCodecs\":[\"dvh` |
| 45 | `#EXT-X-APE-QOE-ENGINE` | fuera_del_LAB | no hay campo del LAB con la URI del motor QoE | `URI="https://iptv-ape.duckdns.org/prisma/lib/conviva-qoe-engine.js",VE` |
| 46 | `#EXT-X-APE-LAB-SCHEMA-VARIANT` | derivada | export del propio LAB (fields.* serializados) | `omega_v2_bulletproof_perprofile` |
| 47 | `#EXT-X-APE-LAB-EXPORTED-AT` | derivada | export del propio LAB (fields.* serializados) | `2026-10-26T01:31:05` |
| 48 | `#EXT-X-APE-LAB-BULLETPROOF` | derivada | export del propio LAB (fields.* serializados) | `true` |
| 49 | `#EXT-X-APE-LAB-FILENAME` | derivada | export del propio LAB (fields.* serializados) | `LAB_CALIBRATED` |
| 50 | `#EXT-X-APE-LAB-PROFILE-P0` | derivada | export del propio LAB (fields.* serializados) | `NAME="8K Master",ROLE="8K Master",FITNESS=0.7398,SOLVER="LHS->GA->SA->` |
| 51 | `#EXT-X-APE-LAB-BOUNDS-P0` | derivada | export del propio LAB (fields.* serializados) | `nudge_retry=[10,17],buffer=[105,315],abr_bw_factor=[0.85,0.98],frag_re` |
| 52 | `#EXT-X-APE-LAB-KNOBS-P0` | derivada | export del propio LAB (fields.* serializados) | `abrBandWidthFactor=0.85,reconnect_attempts=350,maxLiveSyncPlaybackRate` |
| 53 | `#EXT-X-APE-LAB-PROFILE-P1` | derivada | export del propio LAB (fields.* serializados) | `NAME="4K UHD Pro",ROLE="4K UHD Pro",FITNESS=1,SOLVER="LHS->GA->SA->NM ` |
| 54 | `#EXT-X-APE-LAB-BOUNDS-P1` | derivada | export del propio LAB (fields.* serializados) | `nudge_retry=[8,14],buffer=[72,195],abr_bw_factor=[0.8,0.95],frag_retry` |
| 55 | `#EXT-X-APE-LAB-KNOBS-P1` | derivada | export del propio LAB (fields.* serializados) | `abrBandWidthFactor=0.8483,reconnect_attempts=215,maxLiveSyncPlaybackRa` |
| 56 | `#EXT-X-APE-LAB-PROFILE-P2` | derivada | export del propio LAB (fields.* serializados) | `NAME="4K Balanced",ROLE="4K Balanced",FITNESS=1,SOLVER="LHS->GA->SA->N` |
| 57 | `#EXT-X-APE-LAB-BOUNDS-P2` | derivada | export del propio LAB (fields.* serializados) | `nudge_retry=[6,12],buffer=[45,130],abr_bw_factor=[0.7,0.92],frag_retry` |
| 58 | `#EXT-X-APE-LAB-KNOBS-P2` | derivada | export del propio LAB (fields.* serializados) | `abrBandWidthFactor=0.7832,reconnect_attempts=214,maxLiveSyncPlaybackRa` |
| 59 | `#EXT-X-APE-LAB-PROFILE-P3` | derivada | export del propio LAB (fields.* serializados) | `NAME="FHD 1080p",ROLE="FHD 1080p",FITNESS=0.9909,SOLVER="LHS->GA->SA->` |
| 60 | `#EXT-X-APE-LAB-BOUNDS-P3` | derivada | export del propio LAB (fields.* serializados) | `nudge_retry=[5,10],buffer=[26,80],abr_bw_factor=[0.65,0.9],frag_retry=` |
| 61 | `#EXT-X-APE-LAB-KNOBS-P3` | derivada | export del propio LAB (fields.* serializados) | `abrBandWidthFactor=0.65,reconnect_attempts=156,maxLiveSyncPlaybackRate` |
| 62 | `#EXT-X-APE-LAB-PROFILE-P4` | derivada | export del propio LAB (fields.* serializados) | `NAME="HD 720p",ROLE="HD 720p",FITNESS=0.2502,SOLVER="LHS->GA->SA->NM 0` |
| 63 | `#EXT-X-APE-LAB-BOUNDS-P4` | derivada | export del propio LAB (fields.* serializados) | `nudge_retry=[3,7],buffer=[18,52],abr_bw_factor=[0.55,0.85],frag_retry=` |
| 64 | `#EXT-X-APE-LAB-KNOBS-P4` | derivada | export del propio LAB (fields.* serializados) | `abrBandWidthFactor=0.55,reconnect_attempts=115,maxLiveSyncPlaybackRate` |
| 65 | `#EXT-X-APE-LAB-PROFILE-P5` | derivada | export del propio LAB (fields.* serializados) | `NAME="SD 480p",ROLE="SD 480p",FITNESS=0.2175,SOLVER="LHS->GA->SA->NM 0` |
| 66 | `#EXT-X-APE-LAB-BOUNDS-P5` | derivada | export del propio LAB (fields.* serializados) | `nudge_retry=[3,5],buffer=[10,30],abr_bw_factor=[0.5,0.8],frag_retry=[1` |
| 67 | `#EXT-X-APE-LAB-KNOBS-P5` | derivada | export del propio LAB (fields.* serializados) | `abrBandWidthFactor=0.5,reconnect_attempts=60,maxLiveSyncPlaybackRate=1` |
| 68 | `#EXT-X-SESSION-DATA` | derivada | SESSION-DATA del LAB: DATA-ID=com.ape.lab.schema <- fields | `DATA-ID="com.ape.lab.schema",VALUE="omega_v2_bulletproof_perprofile"` |
| 69 | `#EXT-X-SESSION-DATA` | derivada | SESSION-DATA del LAB: DATA-ID=com.ape.lab.exported_at <- fields | `DATA-ID="com.ape.lab.exported_at",VALUE="2026-10-26T01:31:05"` |
| 70 | `#EXT-X-SESSION-DATA` | derivada | SESSION-DATA del LAB: DATA-ID=com.ape.lab.bulletproof <- fields | `DATA-ID="com.ape.lab.bulletproof",VALUE="true"` |
| 71 | `#EXT-X-SESSION-DATA` | derivada | SESSION-DATA del LAB: DATA-ID=com.ape.lab.filename <- fields | `DATA-ID="com.ape.lab.filename",VALUE="LAB_CALIBRATED"` |
| 72 | `#EXT-X-SESSION-DATA` | derivada | SESSION-DATA del LAB: DATA-ID=com.ape.profile.master <- fields | `DATA-ID="com.ape.profile.master",VALUE="P0"` |
| 73 | `#EXT-X-SESSION-DATA` | derivada | SESSION-DATA del LAB: DATA-ID=com.ape.profile.master_name <- fields | `DATA-ID="com.ape.profile.master_name",VALUE="8K Master"` |
| 74 | `#EXT-X-SESSION-DATA` | derivada | SESSION-DATA del LAB: DATA-ID=com.ape.profile.master_role <- fields | `DATA-ID="com.ape.profile.master_role",VALUE="8K Master"` |
| 75 | `#EXT-X-SESSION-DATA` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `DATA-ID="com.ape.codec.chain.player_pref",VALUE="hvc1,hev1,h265,avc1,h` |
| 76 | `#EXT-X-SESSION-DATA` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `DATA-ID="com.ape.codec.chain.audio",VALUE="mp4a.40.2,ac-3,mp4a.40.5"` |
| 77 | `#EXT-X-SESSION-DATA` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `DATA-ID="com.ape.codec.chain.hdr",VALUE="hdr10,hlg,sdr"` |
| 78 | `#EXT-X-SESSION-DATA` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `DATA-ID="com.ape.codec.chain.video_family",VALUE="HEVC-MAIN10-L5.1>HEV` |
| 79 | `#EXT-X-SESSION-DATA` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `DATA-ID="com.ape.qos.target_mos",VALUE="4.8"` |
| 80 | `#EXT-X-SESSION-DATA` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `DATA-ID="com.ape.zapping.max_ms",VALUE="800"` |
| 81 | `#EXT-X-SESSION-DATA` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `DATA-ID="com.ape.startup.max_ms",VALUE="500"` |
| 82 | `#EXT-X-SESSION-DATA` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `DATA-ID="com.ape.rebuffer.tolerance",VALUE="0"` |
| 83 | `#EXT-X-START` | en_LAB | level_1_master_playlist, payload identico | `TIME-OFFSET=-14,PRECISE=YES` |
| 84 | `#EXT-X-APE-ANTI-FREEZE-NUCLEAR` | en_LAB | level_1_master_playlist, payload identico | `` |
| 85 | `#EXT-X-APE-MULTI-SOURCE` | en_LAB | level_1_master_playlist, payload identico | `ENABLED\|FAILOVER=50ms\|RECONNECT=350` |
| 86 | `#EXT-X-APE-BUFFER-STRATEGY` | en_LAB | level_1_master_playlist, payload identico | `NUCLEAR_NO_COMPROMISE\|MIN=52s\|TARGET=105s` |
| 87 | `#EXT-X-APE-QMAX-STRATEGY` | en_LAB | level_1_master_playlist, payload identico | `GREEDY-BEST-AVAILABLE\|FACTOR=0,85` |
| 88 | `#EXT-X-DATERANGE` | en_LAB_valor_distinto | level_1 declara el mismo tag con otro valor | `ID="omega-live-P0",X-OMEGA-TYPE="LIVE-CATCHUP",X-HDR-TYPE="HDR10+DV-P8` |
| 89 | `#EXT-X-APE-EVASION-GET` | en_LAB | level_1_master_playlist, payload identico | `405-REWRITE-TO-HEAD` |
| 90 | `#EXT-X-CONTENT-STEERING` | en_LAB | level_1_master_playlist, payload identico | `SERVER-URI="pool://failover",PATHWAY-ID="omega"` |
| 91 | `#EXT-X-SESSION-DATA` | derivada | com.ape.build <- level_1 #EXT-X-DEFINE VALUE (mismo valor) | `DATA-ID="com.ape.build",VALUE="P0_22.6.0-MEMC-TOTAL-8K120"` |
| 92 | `#EXT-X-SYS-VERSION` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `APE_v8.0-LAB` |
| 93 | `#EXT-X-SYS-ARCHITECTURE` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `TYPED_ARRAYS_ULTIMATE` |
| 94 | `#EXT-X-SYS-GENERATED` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `2026-11-02T03:12:27.407Z` |
| 95 | `#EXT-X-SYS-LIST-ID` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `APE_LAB_3z5u4uouo3db` |
| 96 | `#EXT-X-SYS-MODULES-ACTIVE` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `12` |
| 97 | `#EXT-X-SYS-MODULES-LIST` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `JWT,HeadersMatrix,BufferAdaptativo,SmartCodec,FibonacciDNA,TLSCoherenc` |
| 98 | `#EXT-X-SYS-COMPLIANCE` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `RFC8216` |
| 99 | `#EXT-X-SYS-COMPATIBLE` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `OTT_NAVIGATOR,VLC,KODI,TIVIMATE,SMARTERS` |
| 100 | `#EXT-X-SYS-LAYERS` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `EXTVLCOPT,KODIPROP,EXT-X-APE,EXT-X-START` |
| 101 | `#EXT-X-SYS-GLOBAL-BUFFER-STRATEGY` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `NETWORK=8000,LIVE=4500,FILE=4000` |
| 102 | `#EXT-X-SYS-NETWORK-CACHING` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `8000` |
| 103 | `#EXT-X-SYS-LIVE-CACHING` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `4500` |
| 104 | `#EXT-X-SYS-FILE-CACHING` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `4000` |
| 105 | `#EXT-X-SYS-ALT-SVC` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `h2=":443"; ma=86400` |
| 106 | `#EXT-X-SYS-PROTOCOL-PRIORITY` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `http/1.1,h2` |
| 107 | `#EXT-X-SYS-MIN-HTTP-VERSION` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `1.1` |
| 108 | `#EXT-X-SYS-HTTP2-MULTIPLEX` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `enabled` |
| 109 | `#EXT-X-SYS-HTTP2-MAX-CONCURRENT-STREAMS` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `100` |
| 110 | `#EXT-X-SYS-COMPRESSION` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `gzip` |
| 111 | `#EXT-X-SYS-COMPRESSION-LEVEL` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `4` |
| 112 | `#EXT-X-SYS-TLS-PRIORITY` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `tls1.2,tls1.1` |
| 113 | `#EXT-X-SYS-MIN-TLS-VERSION` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `1.0` |
| 114 | `#EXT-X-SYS-VIDEO-CODEC-PRIORITY` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `dvh1,dvhe,hvc1,hev1,av01,vp09,avc1` |
| 115 | `#EXT-X-SYS-AUDIO-CODEC-PRIORITY` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `ac-3,mp4a.40.2` |
| 116 | `#EXT-X-SYS-VIDEO-QUALITY` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `high` |
| 117 | `#EXT-X-SYS-AUDIO-QUALITY` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `high` |
| 118 | `#EXT-X-SYS-RESILIENCE-MODE` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `ULTRA` |
| 119 | `#EXT-X-SYS-RECONNECT-TIMEOUT-MS` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `30` |
| 120 | `#EXT-X-SYS-RECONNECT-MAX-ATTEMPTS` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `50` |
| 121 | `#EXT-X-SYS-ZERO-INTERRUPTIONS` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `true` |
| 122 | `#EXT-X-SYS-AVAILABILITY-TARGET` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `99.99` |
| 123 | `#EXT-X-SYS-BANDWIDTH-GUARANTEE` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `150` |
| 124 | `#EXT-X-SYS-FINGERPRINT` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `FP_2026-11-02T03:12:27.407Z` |
| 125 | `#EXT-X-SYS-FP-DEVICE` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `desktop` |
| 126 | `#EXT-X-SYS-FP-PLATFORM` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `Win32` |
| 127 | `#EXT-X-SYS-FP-SCREEN` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `1536x864` |
| 128 | `#EXT-X-SYS-FP-TZ` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `America/Bogota` |
| 129 | `#EXT-X-SYS-FP-LANG` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `es-419` |
| 130 | `#EXT-X-SYS-SERVER-ROTATION` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `enabled` |
| 131 | `#EXT-X-SYS-SERVER-POOL-SIZE` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `3` |
| 132 | `#EXT-X-SYS-SERVER-DISTRIBUTION` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `round_robin` |
| 133 | `#EXT-X-SERVER-1` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `http://<REDACTED>` |
| 134 | `#EXT-X-MOTOR-EVASION` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `ENABLED` |
| 135 | `#EXT-X-UA-ROTATION` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `true` |
| 136 | `#EXT-X-UA-POOL-SIZE` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `104` |
| 137 | `#EXT-X-BLOQUEO-DETECCION` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `true` |
| 138 | `#EXT-X-BLOQUEO-CODIGOS` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `407,403,429,502,503` |
| 139 | `#EXT-X-BLOQUEO-RESPUESTA` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `auto-retry` |
| 140 | `#EXT-X-BLOQUEO-REINTENTOS` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `3` |
| 141 | `#EXT-X-SYS-HTTP-HEADERS` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `{"User-Agent":"Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (` |
| 142 | `#EXT-X-APE-CMCD-OBJECT` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `type=l,br=5000,d=6000,ot=v` |
| 143 | `#EXT-X-APE-CMCD-SESSION` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `sid="{sessionId}",cid="{streamId}",sf=h,st=l` |
| 144 | `#EXT-X-APE-CMCD-REQUEST` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `bl=30000,dl=6000,nor="../next.ts"` |
| 145 | `#EXT-X-APE-CMCD-STATUS` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `bs,rtp=1000` |
| 146 | `#EXT-X-SERVER-CONTROL` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.0,CAN-SKIP-UNTIL=12.0` |
| 147 | `#EXTVLCOPT` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `colorspace=all=auto:trc=auto` |
| 148 | `#EXTVLCOPT` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `tonemap=mobius` |
| 149 | `#EXTVLCOPT` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `format=yuv444p10le` |
| 150 | `#EXTVLCOPT` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `saturation=1.08` |
| 151 | `#EXT-X-APE-SPOOF-DEVICE-CLASS` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `premium-tv` |
| 152 | `#EXT-X-APE-SPOOF-DECODING-CAPABILITY` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `hevc-main10-level6.1` |
| 153 | `#EXT-X-APE-SPOOF-DEVICE-MODEL` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `SHIELD-TV-PRO` |
| 154 | `#EXT-X-APE-HTTP-HEADER-X-Device-Class` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `premium-tv` |
| 155 | `#EXT-X-APE-HTTP-HEADER-X-Decoding-Capability` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `hevc-main10-level6.1` |
| 156 | `#EXT-X-APE-QUANTUM-PIXEL` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `ENABLED=true,DEPTH=12,FORMAT=yuv444p10le,SATURATION=1.08` |
| 157 | `#EXT-X-APE-BUFFER-STRATEGY` | en_LAB_valor_distinto | level_1 declara el mismo tag con otro valor | `ADAPTIVE_PREDICTIVE_NEURAL` |
| 158 | `#EXT-X-APE-BUFFER-PRELOAD-SEGMENTS` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `30` |
| 159 | `#EXT-X-APE-BUFFER-DYNAMIC-ADJUSTMENT` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `ENABLED` |
| 160 | `#KODIPROP` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `inputstream.adaptive.preferred_codec=hevc` |
| 161 | `#KODIPROP` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `inputstream.adaptive.video_codec_override=hevc` |
| 162 | `#EXT-X-APE-AV1-FALLBACK-CHAIN` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `HEVC>AV1>H264` |
| 163 | `#EXT-X-APE-CODEC-PRIORITY` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `HEVC>AV1>H264` |
| 164 | `#EXT-X-APE-TRANSPORT-PROTOCOL` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `CMAF_UNIVERSAL` |
| 165 | `#EXT-X-APE-TRANSPORT-CHUNK-SIZE` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `200MS` |
| 166 | `#EXT-X-APE-TRANSPORT-FALLBACK-1` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `HLS_FMP4` |
| 167 | `#KODIPROP` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `inputstream.adaptive.audio_passthrough_earc=auto` |
| 168 | `#EXT-X-APE-AUDIO-EARC` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `AUTO` |
| 169 | `#EXT-X-APE-AUDIO-PASSTHROUGH` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `SAFE` |
| 170 | `#EXT-X-APE-AUDIO-FALLBACK` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `AAC_LC_2CH` |
| 171 | `#EXT-X-APE-AUDIO-DOWNMIX` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `ENABLED` |
| 172 | `#EXT-X-APE-AUDIO-CODEC-PRIORITY` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `eac3,ac3,aac,mp3` |
| 173 | `#EXT-X-APE-AUDIO-SAFE-FORMATS` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `eac3,ac3,aac,mp3` |
| 174 | `#EXT-X-APE-AUDIO-TRANSCODE-ON-INVALID` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `aac_lc_2ch` |
| 175 | `#EXT-X-APE-AUDIO-VALIDATE` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `ffprobe;channels>0;sample_rate>0` |
| 176 | `#EXT-X-APE-AUDIO-NO-DAMAGE` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `true` |
| 177 | `#KODIPROP` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `inputstream.adaptive.audio_codec_priority=eac3,ac3,aac,mp3` |
| 178 | `#KODIPROP` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `inputstream.adaptive.audio_fallback=aac_lc_2ch` |
| 179 | `#EXT-X-KEY` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `METHOD=NONE` |
| 180 | `#EXT-X-APE-DRM-WIDEVINE` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `ENFORCE` |
| 181 | `#KODIPROP` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `inputstream.adaptive.drm_widevine_enforce=true` |
| 182 | `#EXT-X-APE-TELCHEMY-TVQM` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `ENABLED` |
| 183 | `#EXT-X-APE-TELCHEMY-TR101290` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `ENABLED` |
| 184 | `#EXT-X-APE-TELEMETRY-TVQM` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `ENABLED` |
| 185 | `#EXT-X-APE-TELEMETRY-TR101290` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `ENABLED` |
| 186 | `#EXT-X-APE-IMPAIRMENT-GUARD` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `BLOCKINESS=ACTIVE,JERKINESS=ACTIVE,TILING=ACTIVE` |
| 187 | `#EXT-X-APE-AUDIT-OMEGA` | fuera_del_LAB | sin campo en el LAB que lo origine: capa del generador | `ENABLED` |

---

## 3. `headerOverrides`: 430 declaradas, ¿cuántas se emiten?

| Métrica | Valor |
|---|---|
| Declaradas en el LAB | 430 (24.564 B de JSON) |
| Emitidas como cabecera dentro de `#EXTHTTP` | 82 |
| Emitidas como **tag** de playlist (alguna forma `#EXT-X-…`) | 31 |
| Emitidas por cualquiera de las dos vías | **105** (24.42 %) |
| Declaradas y **no emitidas** | **325** (75.58 %) |

### 3.1 Por familia (top 18 de 145 familias)

| Familia | Declaradas | En `#EXTHTTP` | Como tag | No emitidas |
|---|---|---|---|---|
| `X-Error-Recovery` | 27 | 0 | 0 | 27 |
| `estandar/otros` | 24 | 11 | 0 | 13 |
| `X-Error` | 24 | 0 | 0 | 24 |
| `X-Audio` | 16 | 3 | 8 | 5 |
| `X-APE-AI` | 14 | 0 | 0 | 14 |
| `X-Buffer` | 12 | 6 | 1 | 6 |
| `X-Playback` | 12 | 2 | 0 | 10 |
| `X-APE-LCEVC` | 10 | 0 | 2 | 8 |
| `X-HDR` | 9 | 1 | 0 | 8 |
| `X-HLSjs` | 9 | 2 | 0 | 7 |
| `X-AntiFreeze` | 8 | 0 | 0 | 8 |
| `X-ABR` | 8 | 0 | 0 | 8 |
| `X-HTTP-Error` | 8 | 0 | 0 | 8 |
| `X-APE-RESILIENCE` | 7 | 0 | 0 | 7 |
| `X-Max` | 6 | 3 | 0 | 3 |
| `X-APE-GPU` | 6 | 0 | 0 | 6 |
| `X-APE-EVASION` | 6 | 0 | 0 | 6 |
| `X-QoS` | 6 | 0 | 0 | 6 |

### 3.2 Contraste con las familias que citaba el encargo

| Familia citada | Conteo medido |
|---|---|
| `X-Error-Recovery*` | 27 |
| `X-Error* (todos, incl. Recovery)` | 51 |
| `X-Error* (sin Recovery)` | 24 |
| `X-HTTP-Error*` | 8 |
| `X-APE-AI*` | 14 |
| `X-APE-LCEVC*` | 10 |
| `X-APE-RESILIENCE*` | 7 |
| `X-APE-GPU*` | 6 |
| `X-APE-EVASION*` | 6 |
| `CMCD*` | 4 |
| `X-Tone-Mapping*` | 3 |

Las familias del encargo **reproducen exacto** salvo una: `X-Error` no son 18. Medido: **24** names que empiezan por `X-Error`
excluyendo `X-Error-Recovery`, o **51** si se incluyen (27 de `X-Error-Recovery` + 24). El 18 del encargo no se reproduce con
ninguna de las dos lecturas; se reporta la medición, no la cifra heredada.

**Lectura de fondo:** de 430 overrides, solo 105 llegan a la lista. Las familias más grandes
(`X-Error-Recovery` 27, `X-Error` 24, `X-APE-AI` 14, `X-HTTP-Error` 8, `X-APE-RESILIENCE` 7, `X-APE-GPU` 6, `X-APE-EVASION` 6, `X-AntiFreeze` 8, `X-ABR` 8)
se emiten **0 veces**: son catálogo declarado, no emisión. El ratio declarado→emitido es **24.42 %**.

---

## 4. De dónde salen realmente las 200 cabeceras `#EXTHTTP`

| Origen | Claves | Nota |
|---|---|---|
| Claves distintas en el censo real (t1) | 250 | universo de las 10.573 líneas |
| Presentes en `fields.headers` (227 del LAB) | 70 | el LAB trae su propia matriz de cabeceras |
| Presentes en `headerOverrides` (430) | undefined | — |
| En **ambos** | 70 | `fields.headers` ∩ `headerOverrides` sobre las claves reales |
| **En ninguno de los dos** (capa del generador) | **168** | (67.20 %) p. ej. `X-AI-Content-Type`, `X-AI-Motion-Estimation`, `X-AI-SR-Artifact-Removal`, `X-AI-SR-Enabled`, `X-AI-SR-GPU-Acceleration`, `X-AI-SR-Model`, `X-AI-SR-Noise-Reduction`, `X-AI-SR-Precision` |

Conclusión medida: **70 de las 250** claves `#EXTHTTP` explican desde el LAB (unión de `fields.headers` y `headerOverrides`);
las otras **168** (X-AI-*, X-APE-Profile/Tier, X-Audio-*, X-Bandwidth-*, X-QoE-*, CMCD-*, X-ExoPlayer-*…) las añade el generador.
La plantilla `level_3.EXTHTTP` (12 claves) aporta **9**; las 3 `Sec-Fetch-*` **no están** en el `#EXTHTTP` emitido (el corte a 200 campos las deja fuera).

---

## 5. `actor_injections`: 6 ramas, destino y ejecutabilidad

| Rama | Destino declarado | Claves | Bytes | Tags que le corresponden (censo) | Runtime que puede ejecutarla |
|---|---|---|---|---|---|
| `panel` | panel / UI de operador | 8 | 208 | `#EXT-X-APE-LAB-*` → 25 tags | ninguno: superficie de configuración |
| `player` | player (hls.js, VLC, ExoPlayer, Kodi) | 4 | 822 | `#EXTVLCOPT` `#KODIPROP` `#EXT-X-SESSION-DATA` → 1 tags, 1 tags, 1 tags | VLC/Kodi/hls.js/ExoPlayer (D desde playlist; VLC solo N por CLI) |
| `os` | sistema operativo del device (socket, tcp, bbr) | 4 | 103 | `#EXT-X-APE-SYS-SYS-*` → 12 tags | ninguno por playlist (sysctl en host) |
| `network` | red (mtu, pacing, dscp, ecn) | 4 | 69 | `#EXT-X-APE-NET-*` → 4 tags | ninguno por playlist |
| `iptv_server` | servidor IPTV / VPS (catchup, failover, pool) | 7 | 141 | `#EXT-X-APE-MULTI-SERVER-*` `#EXTINF catchup` → 21 tags, 0 tags | VPS rebase-only (I en píxeles) |
| `soc_vpp_dnr` | SoC VPP post-decode via ARA/ADB | 9 | 1081 | `#EXT-X-APE-VRR-*` → 3 tags | **ARA/ADB en device** (P·r) |

**Ejecutabilidad, citando t4 sin re-litigarla** (`docs/cartography/APE_LISTA_523d52a6/04_LANE_CAPABILITY_MATRIX.md`):

- **`soc_vpp_dnr`** es la única rama que puede cambiar píxeles: t4 §1 la sitúa como `P·r` en denoise/escalado/color/sharpening y §6.8 la ata al
  daemon en device vía ARA/ADB; t4 advierte además que el `P` es «porque existe la clave, no porque esté demostrado el efecto» (sin device: `NO_VERIFICADO`).
- **`player`** cae en la fila `D` de t4 para los 6 players (OTT/TiviMate/ExoPlayer/Kodi/hls.js) y en `D` (playlist) / `N` (CLI) para VLC.
  t4 §4 es explícito: desde la playlist VLC descarta la opción por seguridad (`unsafe option`).
- **`os`** y **`network`** no tienen carril por playlist en t4: se emiten como tags (`#EXT-X-APE-SYS-SYS-*`, `#EXT-X-APE-NET-*`) que **ningún runtime del catálogo lee**;
  su destino real es el host/device (`sysctl`, `ip route`), no la lista.
- **`iptv_server`** es `I` en píxeles por construcción en t4 §1 (`VPS/Lua rebase-only`): su `D` es etiqueta. El `catchup` no viaja como tag sino como
  **atributo de `#EXTINF`** (355 canales, medido en t1), y `SYS-CATCHUP:flussonic` sí se emite como tag.
- **`panel`** no tiene carril de runtime: es la superficie de configuración que produce el propio LAB (su rastro en la lista son los 25 tags `#EXT-X-APE-LAB-*`).

Cuantificación del peso: `actor_injections` completo ocupa 2424 B del LAB; la rama más pesada es `soc_vpp_dnr` (1.081 B) y la más ligera `network` (69 B).
**La rama que más ocupa no es la que más se emite**: `network` son 4 claves y 4 tags, mientras `player` (822 B) se diluye en 134 `#EXTVLCOPT` + 103 `#KODIPROP` del bloque.

---

## 6. Reproducibilidad: ¿se regenera la cabecera desde `player_enslavement` + `headerOverrides`?

**No.** Cobertura medida: **37 de 187 líneas (19.79 %)**.
El test es generoso: cuenta como cubierta cualquier línea cuyo **tag** aparezca en `level_1` **o** que se corresponda con un
`headerOverrides` emitido en alguna forma de tag. Aun así, **150 líneas (80.21 %) no tienen origen** en esas dos piezas.

### 6.1 Qué falta exactamente (por familia)

| Familia no cubierta | Líneas | De dónde tendría que salir |
|---|---|---|
| `#EXT-X-APE-LAB-*` | 44 | del propio LAB (`fields.*`): el export que se emite como `#EXT-X-APE-LAB-*` — **derivable**, pero no desde `player_enslavement` |
| `#EXT-X-SYS-*` | 38 | **no hay campo en el LAB** que produzca esta familia (ver §7 C-nota): es capa del generador |
| `#EXT-X-SESSION-DATA` | 24 | de `fields.hlsjs`, `fields.settings` y de políticas que **no están en el LAB** (com.ape.qos, com.ape.startup, com.ape.rebuffering) |
| `#EXT-X-APE-*` | 20 | capas APE del generador (audio, transporte, spoof, telemetría, CMCD, DRM, auditoría) |
| `#KODIPROP` | 6 | 6 claves ISA de nivel cabecera (preferred_codec, video_codec_override, audio_passthrough_earc, audio_codec_priority, audio_fallback, drm_widevine_enforce) emitidas por el generador |
| `#EXTVLCOPT` | 4 | 4 opciones VLC de nivel cabecera (colorspace, tonemap, format, saturation) emitidas por el generador |
| `#EXT-X-SERVER-CONTROL` | 2 | capa del generador |
| `#EXTM3U (M3U Plus)` | 1 | capa del generador |
| `#EXT-X-TARGETDURATION` | 1 | capa del generador |
| `#EXT-X-PART-INF` | 1 | capa del generador |
| `#EXT-X-SERVER-1` | 1 | capa del generador |
| `#EXT-X-MOTOR-EVASION` | 1 | capa del generador |
| `#EXT-X-UA-ROTATION` | 1 | capa del generador |
| `#EXT-X-UA-POOL-SIZE` | 1 | capa del generador |
| `#EXT-X-BLOQUEO-DETECCION` | 1 | capa del generador |
| `#EXT-X-BLOQUEO-CODIGOS` | 1 | capa del generador |
| `#EXT-X-BLOQUEO-RESPUESTA` | 1 | capa del generador |
| `#EXT-X-BLOQUEO-REINTENTOS` | 1 | capa del generador |
| `#EXT-X-KEY` | 1 | capa del generador |

### 6.2 Y en el sentido inverso: la cabecera **sí** contiene el LAB, exacto

| Comprobación | Resultado |
|---|---|
| Chunks `#EXT-X-APE-LAB-METADATA` | 20 declarados / 20 encontrados |
| Base64 concatenado → bytes | 69.188 caracteres → **51.890 B** |
| Schema del payload | `ape-lab-metadata-v1` · `generated_at=2026-11-02T03:12:27.403Z` · `profile=P0` |
| Campos idénticos al LAB local | **25/25** (incluidos `player_enslavement`, `actor_injections` y las 430 `headerOverrides`) |
| Diferencia de bytes con el fichero local | 61.889 B en disco vs 51.890 B embebidos: el fichero local está **indentado**; el payload es JSON compacto |

Consecuencia práctica: **cualquiera que tenga la lista tiene el LAB**; lo que no tiene es el código del generador que decidió
emitir 122 líneas fuera de él ni los knobs efectivos que ganaron por perfil (por eso §7 tiene contradicciones de valor).

---

## 7. Contradicciones internas (medidas)

| ID | Campo | Valor en el LAB | Valor emitido / otro campo | Línea | Severidad |
|---|---|---|---|---|---|
| C01 | `player_enslavement.level_1_master_playlist[#EXT-X-VERSION]` | `#EXT-X-VERSION:6` | `#EXT-X-VERSION:9` | 2 | baja |
| C02 | `level_1[#EXT-X-DATERANGE].X-HDR-TYPE` | `DOLBY_VISION + HDR10+` | `HDR10+DV-P81-P10` | 88 | media |
| C03 | `level_3_per_channel[STREAM-INF].FRAME-RATE` | `120.000` | `FRAME-RATE=30.000 (8.651) / 60.000 (1.922) en la lista; 120.000 en 0 canales` | — | alta |
| C04 | `level_3_per_channel[EXTVLCOPT].network-caching` | `105000` | `network-caching=55000 (canal 1; el bloque real usa el valor del perfil, 20.000-1` | — | media |
| C05 | `level_3_per_channel[SYS].SYS-CATCHUP-DAYS` | `7` | `catchup-days = 1 (263) / 3 (71) / 4 (18) / 2 (2) / 5 (1) en los 355 canales que ` | — | media |
| C06 | `level_3_per_channel[EXTHTTP]` | `12 cabeceras` | `200 cabeceras por canal (delta +188)` | — | alta |
| C07 | `actor_injections.panel vs fields.settings` | `panel: peak_luminance_nits=4000, chroma=4:2:2, hdcp=2.3 \| se` | `DATERANGE real: peak 400/600/2.000; chroma 4:2:0 en 10.573; HDCP 1.4/2.2` | — | alta |
| C08 | `fields.settings.resolution` | `7680x4320` | `STREAM-INF RESOLUTION=3840x2160 en 10.573/10.573 canales` | — | alta |
| C09 | `prefetch_config.prefetch_segments vs headerOverrides.X-APE-Prefetch-Segments` | `prefetch_config=12, headerOverrides=10` | `EXTHTTP X-Prefetch-Segments = 15 (7.457) / 16 (2.308) / 12 (808)` | — | media |
| C10 | `cabecera emitida: #EXT-X-START duplicado` | `#EXT-X-START:TIME-OFFSET=-14,PRECISE=YES` | `line 33: #EXT-X-START:TIME-OFFSET=-3.0,PRECISE=YES \| line 83: #EXT-X-START:TIME-` | — | media |
| C11 | `fields.headers.User-Agent` | `Mozilla/5.0 (SMART-TV; Linux; Tizen 8.0) AppleWebKit/538.1 (` | `EXTHTTP User-Agent = Web0S/Linux/SmartTV ... Chrome/119 (un valor unico en 10.57` | — | media |

**Las tres de severidad alta, en una línea cada una:**

1. **C03** — `level_3[STREAM-INF].FRAME-RATE=120.000` y en la lista **0 canales** emiten 120 fps: 8.651 emiten `30.000` y 1.922 emiten `60.000`.
   (El `video-filter` sí interpola a `fps=120`, pero eso es la cadena de filtros, no el `FRAME-RATE` declarado: t1 §9 C5.)
2. **C06** — `level_3[EXTHTTP]` declara **12** cabeceras y el bloque emite **200**: la plantilla por-canal no describe la emisión.
3. **C07/C08** — `actor_injections.panel` declara `peak_luminance_nits=4000`, `chroma=4:2:2`, `hdcp=2.3` y `settings` declara `peak=10000`;
   la emisión real declara `peak 400/600/2.000`, `chroma 4:2:0` en 10.573 canales y `HDCP 1.4/2.2`, con `RESOLUTION=3840x2160` frente al `7680x4320` de `settings`.

**Nota sobre el `#EXT-X-SYS-*` (38 líneas fuera del LAB):** no existe campo en `fields` que las origine. `fields.settings` tiene
`networkCachingMs="15000"` y la cabecera emite `#EXT-X-SYS-NETWORK-CACHING:8000`; `settings.prefetchSegments=6` y la cabecera emite
`#EXT-X-SYS-…` con `SYS-PREFETCH-SEGMENTS:3` en el bloque. Es capa del generador, no del LAB, y sus valores **no** coinciden con los del LAB.

---

## 8. `NO COMPUTADO` (fail-honest)

| Métrica | Razón |
|---|---|
| `ejecución real de actor_injections.soc_vpp_dnr en el SoC` | requiere el device con ARA/ADB autorizado; sin device el efecto es NO_VERIFICADO (t4 §6.8) |
| `qué runtime aplica cada header de EXTHTTP` | medido solo para VLC/Kodi por t4; para OTT/TiviMate/ExoPlayer/hls.js no hay banco de pruebas en esta sesión |
| `valor efectivo de los knobs del LAB en el generador (qué perfil ganó)` | el generador que emitió la lista no está en este workspace; se mide lo emitido, no el código que lo emitió |

Ninguno de estos huecos se ha rellenado con una estimación.

---

## 9. Artefactos y reproducción

| Artefacto | Bytes | Contenido |
|---|---|---|
| `docs/cartography/APE_LISTA_523d52a6/06_emission_template.json` | 228.033 | estructura + cobertura + ratios + las 187 filas clasificadas + 430 overrides + 6 ramas + 11 contradicciones |
| `docs/cartography/APE_LISTA_523d52a6/06_EMISSION_TEMPLATE.md` | — | este informe |

**Cómo se reprodujo** (script de sesión en `%TEMP%`, no versionado para no escribir fuera de los dos entregables):

```text
node --check %TEMP%\rea_emission_template.js
node %TEMP%\rea_emission_template.js          # -> 06_emission_template.json (estructura + cobertura + ratios)
node %TEMP%\enrich_emission_json.js           # -> lab_embedding (LAB embebido) + familias de fuera_del_LAB
node %TEMP%\refine_families.js                # -> by_family_refined + contraste con las familias del encargo
node --check %TEMP%\build_emission_md.js && node %TEMP%\build_emission_md.js   # -> este .md
```

Comprobaciones de integridad de la corrida:

```text
JSON.parse(06_emission_template.json)                      -> OK (228.033 B)
fugas de host/usuario/password en el JSON y en el MD       -> 0
lista de referencia                                        -> 604.593.696 B, sha256 523d52a6…5049d6, lastwrite sin cambio
```

---

*Fase 6 cerrada. La cabecera no es `level_1`: es `level_1` (8/11 exactas) + export del LAB + una capa de generador que
dobla el tamaño declarado. El LAB viaja dentro de la lista; el generador, no.*

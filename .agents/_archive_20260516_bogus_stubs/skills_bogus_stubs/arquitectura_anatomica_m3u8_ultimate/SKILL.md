---
name: Arquitectura Anatómica M3U8 APE ULTIMATE (VLC Strict)
description: Define de forma milimétrica y secuencial la estructura obligatoria de una lista M3U8 generada bajo la doctrina "Sincronización Universal de Ecosistema". Cada bloque tiene un lugar y un propósito exacto, asegurando 0 cortes, evasión y calidad extrema multi-player.
---

# 🧬 ARQUITECTURA ANATÓMICA M3U8 APE ULTIMATE (VLC STRICT)

## 1. PROPÓSITO ESTRUCTURAL
Esta skill define la macro y micro estructura de un M3U8 APE ULTIMATE. Se apoya en la doctrina de **Orquestación Suprema RFC 8216** para dictar qué va, dónde va y por qué va. Una M3U8 generada correctamente **jamás asfixiará un reproductor** si se ensambla en este orden.

---

## 2. ESTRUCTURA MACRO (EL DOCUMENTO GLOBAL)

El M3U8 se divide en **4 Fases Críticas** de arriba hacia abajo:

1. **Phase 0: Inicialización Global** (Metadatos APE primarios)
2. **Phase 1: Embedded Config (Cerebro)** (Perfiles, protocolos, resiliencia)
3. **Phase 2: Global Fingerprint & Connection** (JWT, Sesiones, HTTP Headers JSON Masivos)
4. **Phase 3: The Immortal Loop (Renderizado de Canales)** (La iteración secuencial)

---

## 3. ANATOMÍA BLOQUE POR BLOQUE (FASES 0, 1 y 2)

### FASE 0: INICIALIZACIÓN GLOBAL
*Todo M3U8 debe arrancar declarando sus capacidades y versionado APE.*
1. `#EXTM3U` (Obligatorio RFC 8216, línea 1)
2. `#EXT-X-APE-GLOBAL-BUFFER-STRATEGY` (Red, Live, Archivos)
3. `#EXT-X-APE-VERSION`, `#EXT-X-APE-ARCHITECTURE` (Ej: `16.1.0-CLEAN-URL-ARCHITECTURE`)
4. `#EXT-X-APE-COMPATIBLE:OTT_NAVIGATOR,VLC,KODI,TIVIMATE,SMARTERS`

### FASE 1: EMBEDDED CONFIG (`#EXT-X-APE-EMBEDDED-CONFIG-START`)
*El cerebro de la lista. Las reglas del juego globales.*
1. **Definiciones de Perfiles (P0 a P5):** De `ULTRA_EXTREME_8K` hasta `SD_FAILSAFE`, incluyendo FPS, bitrates, prefetch bounds y Codecs Primarios/Fallback.
2. **Priorización de Protocolo:** Reglas dinámicas TLS y HTTP (Quic, h2, http/1.1 multiplexing).
3. **Priorización de Codecs:** `#EXT-X-APE-VIDEO-CODEC-PRIORITY:hevc,h265,av1,h264`
4. **Resiliencia 24/7 (ULTRA MODE):** Target 99.99%, Bandwidth Guarantee, Reconexión extrema.
5. **Capa XTREAM CODES Exploitation:** Multi-IP, bypass CORS, obfuscatión de tráfico, fast-forward ilimitado.
6. **Motor de Evasión (v3.0):** Rotación de UA, Pools, Proxy IPs, Server Rotations.
7. **Transporte Avanzado:** TLS Record sizes, Early-Data, Accept-CH.
*Finaliza obligatoriamente con:* `#EXT-X-APE-EMBEDDED-CONFIG-END`

### FASE 2: GLOBAL FINGERPRINT & CONNECTION
*Establece la conexión única del usuario y los headers globales base.*
1. **Modo URL & Timestamp:** Clean Mode, Epoch Timestamp de generación (Ej: `1772336249`).
2. **Fingerprint Dinámico:** `#EXT-X-APE-FINGERPRINT`, Device, SO, Screen, TZ, Session Keys.
3. **HTTP HEADER PAYLOAD GLOBAL:** Un JSON masivo de una línea `#EXT-X-APE-HTTP-HEADERS:{...}` inyectado de un golpe para players basados en ExoPlayer (Smarters, TiviMate), precargando metadatos.

---

## 4. FASE 3: THE IMMORTAL LOOP (EL CANAL STRICT)

Aplicando la **Super Skill de Orquestación Suprema RFC 8216**, cada bloque de canal debe renderizarse en un orden **matemáticamente perfecto** para que VLC cargue +120 lineas y sin embargo se comporte dócil, y Kodi active su inputStream adaptive sin quejarse.

### El Ensamblaje Perfecto del Canal (Capa por Capa)

1. **IDENTIFICACIÓN PRINCIPAL (`extInf`)**
   - `#EXTINF:-1 tvg-id="14" tvg-name="..." tvg-logo="..." group-title="FR" ape-profile="P1" catchup="xc" motor-evasion="enabled"...`
   - La cabecera base que inicializa el track del EPG.

2. **LA CAPA VLC (`#EXTVLCOPT` - vlcLayer)**
   *VLC requiere este orden estricto descendente (116+ directivas). Si contradicen o se meten otras líneas JSON aquí, el socket de lectura de VLC entra en TIME_WAIT.*
   - **A. Headers HTTP Core:** `http-user-agent`, `http-referrer`, `http-accept`, `http-cache-control`.
   - **B. Headers Secundarios HTTP:** Parámetros Sec-Fetch, DNT, Origin.
   - **C. Buffers Críticos de Red:** `network-caching=15000`, `live-caching`, `file-caching`, `clock-jitter=1500`, `clock-synchro=1`.
   - **D. Sockets TLS & Transport:** `http-tls-version`, `http-tls-session-resumption=true`, `http-ssl-verify-peer=false`, `http-max-connections`.
   - **E. Aceleración HW y Codecs:** `avcodec-hw=any`, `avcodec-fast=1`, `h264/hevc strict`.
   - **F. Filtros de Imagen:** `video-filter=deinterlace`, `deinterlace-mode=bwdif` (Fibonacci deinterlace), `postproc-q`, `sharpen-sigma`.
   - **G. Reconexión Forzosa:** `http-reconnect=true`, `loop=1`, `no-drop-late-frames`, `tcp-caching`.

3. **LA CAPA KODI MAXIMA (`#KODIPROP` - kodiLayer)**
   *Kodi (InputStream Adaptive) asume esta capa.*
   - `#KODIPROP:inputstream.adaptive.buffer_duration=19`
   - `#KODIPROP:inputstream.adaptive.manifest_type=hls`
   - Parámetros de bandwidth auto, TLS cipher suites predefinidos (`TLS_AES_128_GCM_SHA256...`), HW decode `true`, pass-through audio habilitado.

4. **METADATOS INTERNOS APE (`#EXT-X-APE-*` - apeLayer)**
   *La configuración local que sobreescribe la global, vital para el resolver VPS.*
   - Profiling Local: `#EXT-X-APE-PROFILE:P1`, `#EXT-X-APE-RESOLUTION:4K`, `#EXT-X-APE-FPS:120`.
   - Codec Core: `#EXT-X-APE-CODEC:HEVC`.
   - Estrategias Locales de Latencia: `#EXT-X-APE-PREFETCH-PARALLEL:15`, `#EXT-X-APE-BUFFER-UNDERRUN-STRATEGY:aggressive-refill`.

5. **PAYLOAD JSON DE EXOPLAYER (`#EXTHTTP:{...}` - jsonLayer)**
   *Obligatorio ExoPlayer/TiviMate. Consolidado al final de las capas de parsing de metadato, nunca interrumpe a VLC porque VLC ignora etiquetas desconocidas (y no estamos entre el STREAM-INF y la URL).*
   - Payload final codificado con base64 JWT Tokens, User-Agents de evasión, y flags de Hardware Decoding y Spatial Audio, todo envuelto en JSON para fácil casting en Android ExoPLayer.
   - Ejemplo: `#EXTHTTP:{"Authorization":"Bearer ey...","X-APE-Profile":"P1", ...}`

6. **SINCRONIZACIÓN Y ARRANQUE (`#EXT-X-SERVER-CONTROL`, `#EXT-X-START`)**
   - Control explícito de inicio del live streaming: `#EXT-X-START:TIME-OFFSET=-3.0,PRECISE=YES`

7. **DNS PREFETCHING Y PRECONNECT (`#EXT-X-APE-DNS-PREFETCH`, `#EXTVLCOPT:http-preconnect-domains`)**
   - Agiliza agresivamente el handshake DNS (fundamental para los resolver proxy que enrutan tráfico).

**⚠️ ZONA DE ALTO RIESGO / ORQUESTACIÓN ESTRICTA (RFC 8216) ⚠️**

8. **EL VEREDICTO (PENÚLTIMA LÍNEA): `#EXT-X-STREAM-INF`**
   - El maestro de la pista, donde culmina la definición del ABR: `#EXT-X-STREAM-INF:BANDWIDTH=86000000,AVERAGE-BANDWIDTH=68800000,RESOLUTION=7680x4320,CODECS="hev1.2.4.L153.B0,mp4a.40.2"...`
   - **REGLA SUPREMA:** NADA bajo NINGÚN CONCEPTO puede inyectarse después de esta línea, a excepción de su respectivo link. ¡AQUI ESTA LA MAGIA DEL "CERO CORTES"!

9. **LA URL (ÚLTIMA LÍNEA OBLIGATORIA & PURA)**
    - Formato inmaculado: `http://126958958431.4k-26com.com:80/live/user/pass/14.m3u8`
    - **MUY IMPORTANTE:** Absolutamente **limpia de hackeos (#/.mpd)**. Sucios trucos de simulación DASH en la URL causan truncamiento de sockets en libVLC forzando fallos `HTTP 404` en el backend.

---

## 5. LEYES DE ASIMILACIÓN VISUAL
- No dejar líneas en blanco sueltas entre tags de un mismo canal.
- Separar cada iteración del canal con un salto de línea limpio antes del próximo `#EXTINF`.
- El bloque `#EXT-X-APE-EMBEDDED-CONFIG` no puede fraccionarse, actúa como un bloque atómico.

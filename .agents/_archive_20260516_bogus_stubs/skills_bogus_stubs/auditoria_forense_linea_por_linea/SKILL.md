---
name: auditoria_forense_linea_por_linea
description: Reglas y protocolo estricto para realizar auditorías forenses línea por línea en los generadores (JS, PHP, Bash) asegurando la adherencia absoluta e irrefutable a los protocolos de streaming (RFC 8216 para M3U8/HLS y ISO/IEC 23009-1/23000-19 para DASH/CMAF).
---

# Auditoría Forense Línea por Línea: Estándares de Streaming (RFC 8216 & ISO 23009-1)

## 1. Objetivo de la Habilidad

Proveer un marco de trabajo (framework) inmutable para auditar generadores de listas y manifiestos de IPTV. Esta habilidad exige que CUALQUIER código emitido (JavaScript, PHP, Bash) sea escrutado a nivel microscópico (línea por línea) contrastándolo contra los protocolos supremos de la industria del streaming:

- **RFC 8216 / RFC 8216bis:** HTTP Live Streaming (HLS / M3U8).
- **ISO/IEC 23009-1:** Dynamic Adaptive Streaming over HTTP (MPEG-DASH).
- **ISO/IEC 23000-19:** Common Media Application Format (CMAF & LL-DASH).

## 2. Protocolo de Auditoría HLS (RFC 8216)

### A. Estructura Base del Playlist

* **Regla:** TODO archivo generado que se denomine M3U8 debe tener `#EXTM3U` como los primeros 7 bytes. Sin excepciones. (RFC 8216, Sec 4.3.1.1).
- **Verificación:** Buscar en generadores JS/PHP el inicio absoluto del string/buffer.
- **MIME Type:** El Content-Type debe ser `application/x-mpegURL` o `application/vnd.apple.mpegurl` (V8).

### B. Etiquetas de Segmentos y Metadatos

* **Regla:** Antes de inyectar una URI de Media, DEBE inyectarse obligatoriamente la etiqueta `#EXTINF:<duration>,[<title>]`. (RFC 8216, Sec 4.3.2.1).
- **Directos (Live):** Para streams en vivo de longitud indefinida, la duración debe ser `-1`.
- **Atributos Secundarios:** Los atributos inventados (como `ape-profile=...`) están permitidos, pero deben respetar el formato de llaves y comillas.

### C. Sanitización JSON en #EXTHTTP

* **Regla:** Un atributo de extensión o un tag customizado NO debe tener saltos de línea crudos dentro de él. Una nueva línea denota una nueva directiva dentro del Playlist.
- **Verificación:** El código PHP/JS que empaqueta headers JSON (ej. `X-VBV-Buffer-Multiplier`) debe forzar un `str_replace(...)` profundo para erradicar `\n` y `\r` dentro de su payload. Si no se hace, el reproductor causa un Crash Parser y destruye la interfaz del usuario.

## 3. Protocolo de Auditoría DASH & CMAF (ISO 23009-1)

### A. Semántica Estructural XML (MPD)

* **MIME Type Dinámico:** Todo manifiesto despachado por el servidor en vivo debe usar Content-Type: `application/dash+xml` y establecer explícitamente el caché en `max-age=0`. (DASH-IF IOP).
- **Adaptation Sets Separados:** **Prohibido** mezclar Codecs disonantes o flujos irreemplazables nativamente en un mismo multiplex XML sin declarlarlos como `<AdaptationSet>` separados (Ej. HEVC en id=0, Audio en id=1, AV1 en id=2). Esto permite que ExoPlayer aplique el vital `bitstreamSwitching="true"`.

### B. Low-Latency Constraints (CMAF ISO/IEC 23000-19)

* **Regla:** Para flujos LL-DASH, el codificador (FFmpeg) no debe aguardar a emitir el segmento completo de 2 a 10 segundos, sino inyectar chunks diminutos decodificables.
- **Verificación de Banderas (Bash Worker):**
  - Segmentos macro (Addressable) > 1 segundo (Ej. `-seg_duration 2`).
  - Fragmentos atómicos transferibles (CMAF MOOF+MDAT) < 0.5s (Ej. `-frag_duration 0.2`).
  - Banderas de Flush dinámico de multiplexador: `-streaming 1 -ldash 1`.

### C. Sincronización Temporal Obligatoria del Playhead

* **Regla:** Si el MPD es de tipo `type="dynamic"`, los tiempos del servidor y del cliente no pueden derrapar (drifting).
- **Verificación Temporal (Epoch Anchor):** Evaluar que el `availabilityStartTime` en el código (ya sea PHP o cualquier backend de proxy) NO asimile el tiempo actual dinámicamente (`now` o fecha volátil), sino que debe estar blindado irremediablemente a un **Epoch Constante** (ej. `2025-01-01T00:00:00Z`). En paralelo, que el `startNumber` compense la diferencia para ubicar el segmento actual.

## 4. Método de Aplicación del Sistema

Al ejecutar y citar esta Habilidad, el asistente debe obedecer la siguiente rutina forense obligatoria:

1. Leer y extraer CADA bloque de código o función del archivo destino (JS, PHP, SH, PY) que se encargue parcial o totalmente de la construcción del flujo binario, HTTP o XML/M3U8.
2. Identificar y declarar activamente qué sección del protocolo (RFC 8216 o ISO 23009-1) gobierna dicho trozo de lógica.
3. Emitir un veredicto explícito por cada línea indicando si el código analizado "Cumple" (✅) o "Viola" (❌) el estándar normativo citado.
4. Dictaminar, aplicar e inyectar incondicionalmente parches obligatorios para los módulos defectuosos basándose en la exactitud forense y paramétrica de este documento, previniendo cualquier fallo en los End-Clients (ExoPlayer, Shaka).

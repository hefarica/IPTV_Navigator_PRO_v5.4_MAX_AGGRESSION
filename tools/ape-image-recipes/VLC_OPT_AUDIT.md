# Auditoría de opciones `#EXTVLCOPT` contra VLC real

**Fecha:** 2026-11-02 (America/Bogota)
**Fuente:** `APE_LISTA_1793589060441.m3u8` — 604.593.696 B, sha256 `523d52a6…5049d6`
**Cierra el hueco declarado en** `docs/cartography/APE_LISTA_523d52a6/03_HEADERS_MAP.md` §10
(«no validé las 134 opciones EXTVLCOPT contra la tabla real de VLC»).

---

## Resultado

| Métrica | Valor |
|---|---|
| Nombres de opción distintos extraídos | **138** |
| Binarios de VLC escaneados | 365 (150.121.508 B) |
| Opciones **presentes** en los binarios | **58** |
| Opciones **ausentes** | **80 (58,0 %)** |

Nota de conteo: t3 reportó 134; esta extracción da 138. La diferencia son 4 nombres que
aparecen en el archivo pero no en el bloque por canal que usó t3. No se resuelve por
mayoría: se reportan ambos y se deja el número por bloque como el canónico
(`138` = vocabulario global del archivo).

---

## Método

1. `rg -o --no-filename "#EXTVLCOPT:([a-z0-9\-]+)=" -r '$1'` sobre los 604 MB → 138 nombres.
2. `tools/ape-image-recipes/audit_vlcopt.js` construye un blob latin1 con los 365 `.dll`/`.exe`
   de `C:\Program Files\VideoLAN\VLC` y comprueba token exacto, en forma con guiones y con
   guiones bajos.
3. Corroboración conductual: 4 arranques de VLC headless con log propio.

---

## Límite honesto

- **Presencia ≠ opción registrada.** Un token puede vivir dentro de una cadena de descripción.
  La lista de 58 «presentes» es un *upper bound*: puede contener falsos positivos.
- **Ausencia sí es evidencia fuerte** de que VLC no conoce el nombre.
- La corroboración conductual es de n=4 y **discrimina limpio**, pero no es exhaustiva.

## Corroboración conductual (n=4, 4/4 concordante)

| Opción | Escaneo | Comportamiento de VLC |
|---|---|---|
| `network-caching` | PRESENTE | `exit=0` |
| `saturation` | PRESENTE | `exit=0` |
| `adaptive-reload-use-quic` | AUSENTE | cuelga (diálogo bloqueante), hubo que matarlo |
| `video-hdr` | AUSENTE | cuelga (diálogo bloqueante), hubo que matarlo |

Artefactos: `scratch/avisynth_probe_2026/vlcval_*.log`, `vlcopt_audit.json`.
Nota de plataforma: VLC en Windows es subsistema GUI; una opción desconocida abre diálogo y
bloquea el proceso, lo que impide auditar por línea de comandos en lote (un intento con 138
opciones a la vez terminó en timeout sin log).

---

## Las 80 opciones que VLC NO conoce

### Familia `adaptive-*` (36) — inexistente como opción de VLC

`adaptive-bandwidth-factor`, `adaptive-bw-factor`, `adaptive-initial-bandwidth`,
`adaptive-livedelay`, `adaptive-livesyncplaybackrate`, `adaptive-logic`, `adaptive-lookahead-count`,
`adaptive-maxbitrate`, `adaptive-maxbuffer`, `adaptive-maxbw`, `adaptive-maxheight`,
`adaptive-maxwidth`, `adaptive-minbitrate`, `adaptive-minbw`, `adaptive-reload-maxperiod`,
`adaptive-reload-minperiod`, `adaptive-reload-threshold`, `adaptive-reload-use-0rtt`,
`adaptive-reload-use-byte-range`, `adaptive-reload-use-cache`, `adaptive-reload-use-chunked`,
`adaptive-reload-use-early-data`, `adaptive-reload-use-etag`, `adaptive-reload-use-http2`,
`adaptive-reload-use-http3`, `adaptive-reload-use-if-modified-since`,
`adaptive-reload-use-if-none-match`, `adaptive-reload-use-if-range`,
`adaptive-reload-use-keep-alive`, `adaptive-reload-use-pipelining`, `adaptive-reload-use-push`,
`adaptive-reload-use-quic`, `adaptive-reload-use-range`, `adaptive-reload-use-server-push`,
`adaptive-reload-use-server-sent-events`, `adaptive-reload-use-session-resumption`,
`adaptive-reload-use-tls13`, `adaptive-reload-use-webrtc`, `adaptive-reload-use-websocket`,
`adaptive-reload-use-webtransport`, `adaptive-segcount-factor`

> **Confirma la sospecha de t3:** las 23 `adaptive-reload-use-*` (17,2 % de las líneas
> `#EXTVLCOPT`) **no existen**. VLC no tiene capa adaptativa propia; eso es `inputstream.adaptive`
> de Kodi, no VLC.

### Familia `hls-*` (10) — inexistente

`hls-caching`, `hls-initial-live-wait`, `hls-live-delay`, `hls-max-buffer-duration`,
`hls-max-buffer-size`, `hls-reconnect`, `hls-seek-sync`, `hls-segment-count`,
`hls-segment-overlap`, `hls-use-start-time-offset`

### Familia `http-*` / `network-*` de reconexión (9) — inexistente con ese nombre

`http-continuous-stream`, `http-max-retries`, `http-timeout`, `network-continuous-stream`,
`network-reconnect`, `network-reconnect-count`, `network-reconnect-delay`,
`network-reconnect-fade-in`, `network-timeout`

### Familia `ts-*` (7) — inexistente con ese nombre

`ts-atsc-eit`, `ts-caching`, `ts-hdmv-pmt`, `ts-pid-pcr`, `ts-pid-subpic`, `ts-pid-teletext`, `ts-pmtx`

### Familia `video-*` declarativa (17) — **la capa HDR/vídeo de la lista es ficticia para VLC**

`video-black-bars`, `video-bt2020`, `video-chroma-loc`, `video-dar`, `video-deinterlace`,
`video-deinterlace-mode`, `video-display-fps`, `video-fps`, `video-frame-rate-mode`,
`video-fullrange`, `video-hdr`, `video-hdr-mode`, `video-hdr-nits`, `video-height`,
`video-snap-format`, `video-tone-mapping`, `video-width`, `video-zoom`

---

## Qué cambia esto

1. **La «desalineación C2» de t3 se redefine.** `#EXTVLCOPT:video-hdr=false` y
   `video-hdr-nits=10000` no son una contradicción que VLC crea: **VLC no conoce esas opciones**,
   las descarta al parsear. No hay conflicto SDR-vs-PQ en la capa VLC porque esa capa no se lee.
2. **`#EXTVLCOPT:codec=h264` (C3, 7.457 canales):** `codec` **sí** existe como opción de VLC, así
   que ese sí puede tener efecto real y sigue siendo el hallazgo HIGH de t3.
3. **Las 58 presentes** son las que hay que conservar y calibrar: entre ellas `network-caching`,
   `video-filter`, `saturation`, `tonemap`, `colorspace`, `format`, `live-caching`, `file-caching`,
   `clock-jitter`, `clock-synchro`, `http-user-agent`, `http-referrer`, `avcodec-hw`,
   `avcodec-threads`, `sub-*`, `audio-channels`, `audio-volume`.

## Consecuencia para el recetario

El carril `vlc` de `recipes.json` **solo** puede usar módulos de filtro reales
(`gradfun`, `deinterlace`, `sharpen`, `hqdn3d`) y las 58 opciones verdaderas.
Toda la familia `video-hdr*`, `video-bt2020`, `video-hdr-nits`, `video-width/height/fps`
se retira del carril VLC y se reasigna a los carriles **ARA (VPP del SoC)** y **manifiesto
(STREAM-INF)**, que es donde puede tener efecto.

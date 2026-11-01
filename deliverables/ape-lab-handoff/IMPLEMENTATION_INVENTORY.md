# APE LAB — Inventario de implementación de la sesión

> Documento de entrega. Distingue **implementado**, **esperado en la lista** y **pendiente**.
> No declara el 100% global: el playback real sigue pendiente de prueba.

---

## 1. Resumen ejecutivo

Implementado:

- 174 headers LAB-only añadidos a PM9.
- 17 alias semánticos PM9-only.
- Precedencia explícita de valores.
- Metadata JSON global chunked (≤3.5 KB por línea).
- Cap real `#EXTHTTP`: 200 headers / 8192 bytes + overflow.
- Biblioteca VPS dinámica por `list_id`.
- Auto-ingesta al activar una lista.
- Consumo PHP y Lua.
- ARA: parseo chunked, 883 campos aplanados, headers al player, guard AVC/HEVC.
- Auditor streaming para listas gigantes.
- Guard de URI: no se genera una lista con host-only.

Pendiente:

- Playback estable del canal real (`ERROR_CODE_DECODING_FAILED`).
- Lista completa nueva generada desde la fuente corregida.
- Certificación 100/100 de esa lista completa.

---

## 2. Estructura que debe tener la lista

### 2.1 Cabecera

Obligatorio:

```text
#EXTM3U
#EXT-X-VERSION:9
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-APE-CHANNELS:<n>
#EXT-X-APE-LAB-EXTRAS:1
#EXT-X-APE-LAB-DNA:sha256=...,SOURCE=...,EXPORTED=...
```

### 2.2 Metadata LAB

Debe existir:

```text
#EXT-X-APE-LAB-METADATA:1/N:<base64>
#EXT-X-APE-LAB-METADATA:2/N:<base64>
...
#EXT-X-APE-LAB-METADATA:N/N:<base64>
```

Reglas:

- JSON Base64.
- Cada línea ≤3.500–4.000 caracteres.
- `N` completo; no faltan chunks.
- `profile` correcto.
- `fields` con todas las secciones.

Ejemplo real auditado:

```text
chunks       20
JSON bytes   52.137
secciones    24
campos       883
headerOverrides 419
perfil       P0
```

### 2.3 Headers HTTP

Cada canal debe tener:

```text
#EXTHTTP:{...JSON...}
#EXT-X-APE-OVERFLOW-HEADERS:<base64 JSON>
```

Reglas:

- `#EXTHTTP` JSON válido.
- Máximo 200 headers.
- Payload máximo 8192 bytes.
- Overflow siempre que se supere el cap.
- Sin headers tóxicos.

Auditoría real:

```text
max headers/canal       200
max payload/canal       7.640 bytes
violaciones cap         0
overflow                10.573 líneas
overflow headers total  401.526
```

### 2.4 URI del canal

**Obligatorio:**

```text
http://host/live/usuario/password/stream_id.m3u8
```

o cualquier URL absoluta con path:

```text
https://host/path/stream.m3u8
```

**Prohibido:**

```text
line.tivi-ott.net
```

Una URI sin esquema, sin path o sin stream no es reproducible.

### 2.5 Por canal

Esperado:

```text
#EXTINF:...
#EXTVLCOPT:...
#KODIPROP:...
#EXTHTTP:{...}
#EXT-X-APE-OVERFLOW-HEADERS:...
<URI absoluta>
```

---

## 3. Headers implementados

### 3.1 PM9

```text
PM9 antes:       261 headers
LAB-only:        174
PM9 ahora:       435 headers
```

Categoría nueva:

```text
🧪 20. LAB Bulletproof Extra
```

Archivo:

```text
frontend/js/ape-v9/lab-extra-headers.js
```

### 3.2 LAB real

```text
headerOverrides reales    419
campos aplanados          883
secciones                 24
```

Secciones:

```text
settings              57
vlcopt                48
kodiprop               8
hlsjs                 41
prefetch_config       14
optimized_knobs        7
bounds                 7
actor_injections       6
headerOverrides      419
+ identidad/otros
```

### 3.3 Alias semánticos PM9-only

17 enlaces:

```text
X-Codec-Full               → settings.codec_full
X-Codec-Priority           → settings.codec_priority
X-Audio-Codec-Preferred    → settings.audio_codec
X-Tone-Mapping-Peak        → vlcopt.video-tone-mapping-peak
X-Tone-Mapping-Reference   → vlcopt.video-tone-mapping-reference
X-BT2020                   → vlcopt.video-bt2020
X-Full-Range               → vlcopt.video-fullrange
X-ABR-Fast-Window-S        → hlsjs.abrEwmaFastLive
X-ABR-Slow-Window-S        → hlsjs.abrEwmaSlowLive
X-ABR-BW-Factor            → hlsjs.abrBandWidthFactor
X-ABR-Switch-Interval-S    → hlsjs.abrSwitchInterval
X-Low-Latency-Mode         → hlsjs.lowLatencyMode
X-Live-Sync-Duration-Count → hlsjs.liveSyncDurationCount
X-Live-Max-Latency-Count   → hlsjs.liveMaxLatencyDurationCount
X-Stall-Detection-Ms       → hlsjs.detectStallWithCurrentTimeMs
X-Fragment-Retry-Max       → hlsjs.fragLoadPolicy_maxNumRetry
X-Fragment-TTFB-Max-Ms     → hlsjs.fragLoadPolicy_maxTimeToFirstByteMs
```

### 3.4 PM9-only sin homólogo directo

16 restantes:

```text
Connection
Keep-Alive
X-Shaka-Config
X-Shaka-Version
X-ExoPlayer-Config
X-ExoPlayer-Version
X-ABR-Algorithm
X-QoE-Startup-Target-Ms
X-QoE-Rebuffer-Ratio-Target
X-QoE-TTFB-Target-Ms
X-QoE-Bitrate-Target-Mbps
X-QoE-Monitor
X-QoE-Player
X-Platform
X-Credential-Lock
X-Bitrate-Ladder-Source
```

### 3.5 Precedencia

```text
headerOverrides explícito (PM9/LAB) > hardcoded > defaults
```

Excepción: headers protegidos no se sobrescriben.

### 3.6 Headers protegidos

```text
Connection
Keep-Alive
Range
If-None-Match
If-Modified-Since
TE
Priority
Upgrade-Insecure-Requests
Proxy-Authorization
Transfer-Encoding
Content-Length
```

---

## 4. Calibraciones / función objetivo

### 4.1 AUTO-AJUSTAR

Menú:

```text
⚡ AUTO-AJUSTAR
🎯 Aplicar al perfil actual
📦 AUTO-AJUSTAR P0–P5 (todos)
Cancelar
```

Aplica:

```text
1. fórmula del perfil (floor/T1/T2/buffer)
2. solver Risk/Headroom/Overhead
3. fit de bitrate al enlace
4. refresco de campos derivados
```

### 4.2 Objetivo

```text
J = risk/100
  + 0.30 × déficit de headroom
  + 0.20 × memoria
  + 0.15 × overhead/fill
  + 0.05 × fusible
```

Aceptación:

```text
risk <= 30
headroom >= 15%
stall <= 1.67%
fill <= 80% del buffer
```

### 4.3 Buffer por resolución

```text
8K:  10–19 s
4K:  8–15 s
FHD: 6–12 s
HD:  4–10 s
SD:  3–8 s
```

### 4.4 P0 objetivo

```text
bitrate       200 Mbps
floor          25 Mbps
T1            260
T2            320
buffer        15.000 ms
player        20.000 ms
total         50.000 ms
jitter        16.000 ms
headers       200
RAM           1.250 MB
```

---

## 5. VPS implementado

### 5.1 Productor

```text
ape-canon-producer.js
```

- captura metadata chunked;
- calcula `list_id = sha256(lista).slice(0,16)`;
- escribe `/dev/shm/ape_canon/_lab_meta/<list_id>.json`;
- record canónico lleva `M.ref` + sha256;
- biblioteca POR LISTA, no global.

### 5.2 Consumidores

PHP:

```text
ape-lab-library.php?list_id=<16hex>
  &field=X-APE-BITRATE
  &section=headerOverrides
  &profile=P0
```

Lua:

```text
/_ape/lab?list_id=<16hex>
```

### 5.3 Auto-ingesta

`list-activate.php`:

```text
activa lista
  → lanza productor en background
  → crea _lab_meta/<hash>.json
```

### 5.4 Deploy

```text
GitHub Actions deploy-vps.yml
```

Último deploy verificado:

```text
41296195541 success
```

---

## 6. ARA implementado

- parseo de chunks;
- concatenación;
- Base64;
- SHA-256;
- `lab_meta_flat` con 883 campos;
- `MainActivity --es list_url` carga metadata;
- `ApePlayer` aplica headers de lista;
- guard AVC: no fallback HEVC sobre AVC;
- retry AVC sameUrl;
- Media3 decoder fallback HW→SW;
- interruptor `--es effects off`.

Log real:

```text
ApeLabMetadata: metadata aplicada: 883 campos en ape.lab_meta_flat
ApeListLoader: LAB metadata: profile=P0 sha=...
```

---

## 7. Guard de URI implementado

`buildChannelUrl`:

```text
URL completa    → se conserva
host-only       → reconstruye con servidor activo
sin datos       → NO genera lista
```

Preflight:

```text
[URL-GUARD] N canal(es) sin URI completa; NO se genera la lista
```

Probado:

```text
line.tivi-ott.net
  → http://HOST/live/USERX/PASSX/123.m3u8
```

Aplica en DIRECTO y VPS.

---

## 8. Herramientas

```text
tools/audit_ape_m3u8.js          auditor normal
tools/audit_ape_m3u8_stream.js   auditor streaming (.m3u8 y .gz)
tools/repair_ape_host_only.js    reparación por t_source (no usar para la lista vieja)
deliverables/ape-lab-handoff/
```

Auditor:

```bash
node tools/audit_ape_m3u8_stream.js lista.m3u8
```

Score:

- EXTM3U / VERSION
- EXTINF + URI
- metadata chunks
- campos
- EXTHTTP / cap
- overflow
- dinamismo

---

## 9. Evidencia de auditorías

### Lista nueva corregida de 1 canal

```text
estructura   15/15
metadata     20/20
cap          15/15
overflow     10/10
total        100/100
```

### Lista subida de 599 MB

```text
canales                 10.573
URIs válidas            0
estructura              0/15
score                   85/100
```

Motivo: todas las URIs eran `line.tivi-ott.net`.

---

## 10. Estado final

```text
174 LAB-only en PM9:           SÍ
419 headerOverrides:           SÍ
883 campos:                    SÍ
Metadata chunked:              SÍ
Cap 200/8192 + overflow:       SÍ
Biblioteca VPS por lista:      SÍ
Auto-ingesta:                  SÍ
Lua:                           SÍ
ARA 883 campos:                SÍ
Fuente host-only corregida:    SÍ
Lista nueva de prueba:         100/100
Lista vieja 599 MB:            NO usar
Playback real estable:         PENDIENTE
100% global:                   NO
```

---

## 11. Condición para cerrar el 100%

La lista nueva completa debe cumplir:

```text
canales == canalesConUri
estructura = 15/15
metadata chunks completos
883 campos
200 headers máx por canal
payload < 8192
overflow presente
URI absoluta con path en cada canal
score 100/100
```

Y el playback real debe reproducir sin:

```text
tracks sin vídeo
ERROR_CODE_DECODING_FAILED
Recuperación: reintentando la fuente actual
```

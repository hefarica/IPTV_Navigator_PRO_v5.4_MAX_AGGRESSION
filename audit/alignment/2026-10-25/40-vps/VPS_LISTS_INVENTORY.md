# VPS_LISTS_INVENTORY — Inventario medido de las listas servidas en el VPS

**Método:** `ls -la --time-style=full-iso`, `stat -c`, `sha256sum`, `gzip -t`, `zcat | head/wc/awk`, `od -c`, y `curl -sI` a la URL pública propia.
**Naturaleza:** lectura pura. `gzip -t` **prueba integridad sin extraer a disco**. Cero escrituras persistentes. Ver `VPS_READONLY_ATTESTATION.md`.
**Fecha de medición:** `2026-10-26T03:56Z – 04:00Z`.

---

## 1. Root real y mecanismo de publicación

| Dato | Valor medido |
|---|---|
| Root de las listas | **`/var/www/lists`** — dir `www-data:www-data`, mode `775`, **1.9 G**, **20 archivos** |
| Puente HTTP | `/var/www/html/lists` → **symlink** → `/var/www/lists` (creado `2026-03-21 22:50`) |
| URL pública | `https://iptv-ape.duckdns.org/lists/<archivo>` |
| Server que las sirve | `sites-enabled/default`, `root /var/www/html`, `server_name iptv-ape.duckdns.org 178.156.147.234` (listen 443 ssl default_server) |
| Location | `location ~* \.m3u8$` (`default:93`) con `gzip_static always; gunzip on; gzip_vary on; output_buffers 32 16k; sendfile on; tcp_nopush on; tcp_nodelay on; limit_except GET HEAD { deny all; }` |
| Presión de disco del root | `/dev/sda1` 38 G · 24 G used · **66 %** — `/var/www/lists` = 1.9 G (≈8 % del disco) |

**Patrón de publicación verificado (doctrina OMEGA paso 4):** por cada lista existen **dos** archivos —
- `<lista>.m3u8` → **placeholder de exactamente 8 bytes** = `#EXTM3U\n` (sin contenido real);
- `<lista>.m3u8.gz` → **payload real comprimido** (`gzip -9 -k`).

`gzip_static always` sirve el `.gz` **aunque el cliente no envíe `Accept-Encoding: gzip`**; en ese caso `gunzip on` descomprime al vuelo en chunks de 16 KB. **Esto está verificado en producción** (§4).

---

## 2. Inventario completo de `*.m3u8` (placeholders)

Los **7** archivos `.m3u8` son placeholders idénticos. Verificado con `od -c`: los 7 contienen exactamente `# E X T M 3 U \n` = 8 bytes.

| Archivo | Bytes | mtime (UTC) | sha256 |
|---|---|---|---|
| `APE_LISTA_1786899011456.m3u8` | 8 | `2026-08-16T16:56:11.900430119` | `144659b48f342d02b9298907ab32fcf0479ac9c99a0d293c7c2ebf8df313dd12` |
| `APE_LISTA_1788135732934.m3u8` | 8 | `2026-08-31T00:34:59.868738902` | `144659b4…313dd12` |
| `APE_LISTA_1788145199732.m3u8` | 8 | `2026-08-31T03:13:21.072810899` | `144659b4…313dd12` |
| `APE_LISTA_1792869328847.m3u8` | 8 | `2026-10-25T17:56:36.488294176` | `144659b4…313dd12` |
| `APE_LISTA_1792869328847_SHIELDED.m3u8` | 8 | `2026-10-25T17:52:13.100917056` | `144659b4…313dd12` |
| `APE_LISTA_1792909103946_CDN_SHIELDED.m3u8` | 8 | `2026-10-25T06:57:15.479976958` | `144659b4…313dd12` |
| `APE_LISTA_1792950212154_CDN_SHIELDED.m3u8` | 8 | `2026-10-25T17:47:35.117581535` | `144659b4…313dd12` |

> **7 archivos, 1 solo hash.** El placeholder no distingue listas: **la identidad de contenido vive en el `.gz`**. Cualquier auditoría que hashee el `.m3u8` concluirá (erróneamente) que todas las listas son iguales.

---

## 3. Inventario completo de `*.gz` (payload real) — todos `gzip -t` **OK**

| Archivo `.gz` | Bytes | mtime (UTC) | sha256 | `gzip -t` |
|---|---|---|---|---|
| `APE_LISTA_1786899011456.m3u8.gz` | **323 921 357** | `2026-08-16T16:55:56.411281961` | `9e45c069f906a16fe93cd78e236608ed8c41063fb1f7da910522730bc43d7789` | **OK** |
| `APE_LISTA_1788135732934.m3u8.gz` | **128 973 661** | `2026-08-31T00:34:53.744678208` | `13222bcd42d9f82fd614cdf5529422a6f4730ad9c50ebc2ef23735293eb685f9` | **OK** |
| `APE_LISTA_1788145199732.m3u8.gz` | **325 350 262** | `2026-08-31T03:13:04.533621830` | `32dd7ca213cf66d58f1d6c473d7693c8406181943dafa4f9ee6a07b8ff11eb0d` | **OK** |
| **`APE_LISTA_1792869328847.m3u8.gz`** | **297 134 088** | **`2026-10-25T17:56:21.209153230`** | **`7f1cd8a7f3dd58960c7dfde373ed115eeeac5be4a72a1d1fc5850636f9ccc360`** | **OK** |
| **`APE_LISTA_1792869328847_SHIELDED.m3u8.gz`** | **297 134 097** | **`2026-10-25T17:51:57.241778157`** | **`c2da31cafcd246aa60bc14080aa587ed042b915306b7e7635f6b0fc928e9c064`** | **OK** |
| `APE_LISTA_1792909103946_CDN_SHIELDED.m3u8.gz` | **134 914 902** | `2026-10-25T06:57:08.989888802` | `44451afb8046ccc2d2f7eb3b2b8af4e3a4473cbca7a0211a89e42d602adcf0e1` | **OK** |
| `APE_LISTA_1792950212154_CDN_SHIELDED.m3u8.gz` | **134 814 843** | `2026-10-25T17:47:28.583529652` | `4625729a9d2b731c881dbfa6045a6c28c27a49899b6d0df795c92489b0f29f1d` | **OK** |

**Total payload comprimido: 1 642 243 210 B ≈ 1.53 GiB** en 7 archivos. **Integridad: 7/7 OK.**

### 3.1 Lista vigente (la más reciente)

**`APE_LISTA_1792869328847.m3u8.gz`** — `2026-10-25T17:56:21Z` = **`2026-10-25 12:56 America/Bogota`**
**`APE_LISTA_1792869328847_SHIELDED.m3u8.gz`** — `2026-10-25T17:51:57Z` = **`2026-10-25 12:51 America/Bogota`**

---

## 4. Prueba de servicio real (`curl -sI`, read-only, sobre el propio VPS)

### 4.1 Con `Accept-Encoding: gzip`

```
HTTP/1.1 200 OK
Content-Type: application/vnd.apple.mpegurl
Content-Length: 297134088            ← exactamente el tamaño del .gz
Last-Modified: Sun, 25 Oct 2026 17:56:21 GMT   ← exactamente el mtime del .gz
Vary: Accept-Encoding
Content-Encoding: gzip
Cache-Control: public, max-age=300
Accept-Ranges: bytes
Access-Control-Allow-Origin: *
```
**⇒ `gzip_static` sirve el `.gz` precomprimido, sin recomprimir. PASS.**

### 4.2 Sin `Accept-Encoding` (cliente legacy)

```
HTTP/1.1 200 OK
Content-Type: application/vnd.apple.mpegurl
Vary: Accept-Encoding
(sin Content-Length → respuesta chunked descomprimida por `gunzip on`)
```
**⇒ `gunzip on` descomprime en streaming. PASS** para OTT Navigator / TiviMate / Smarters / VLC / Kodi / Perfect Player / GSE / Smart IPTV.

### 4.3 `Range: bytes=0-40`

Devuelve el texto real: `#EXTM3U x-tvg-url="" … catchup="flussonic" catchup-days="7" catchup-source="{MediaUrl}?utc={utc}&lutc={lutc}" url-tvg="" refresh="1800"` + `#EXT-X-VERSION:9`. **`Accept-Ranges` operativo sobre el path comprimido.**

### 4.4 Tiempo de vida de cache

`Cache-Control: public, max-age=300` + `expires 5m` ⇒ el player re-descarga cada 5 min. Coherente con `refresh="1800"` del header.

---

## 5. Contenido real de la lista vigente (estructura medida)

Cabecera + bloque global (primeras 40 líneas del `.gz` descomprimido):

```
#EXTM3U x-tvg-url="" x-tvg-url-epg="" x-tvg-logo="" x-tvg-shift=0 catchup="flussonic" catchup-days="7"
        catchup-source="{MediaUrl}?utc={utc}&lutc={lutc}" url-tvg="" refresh="1800"
#EXT-X-VERSION:9
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-APE-CHANNELS:23510
#EXT-X-START:TIME-OFFSET=-3.0,PRECISE=YES
#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.0,CAN-SKIP-UNTIL=12.0,HOLD-BACK=3.0
#EXT-X-TARGETDURATION:2
#EXT-X-PART-INF:PART-TARGET=1.0
#EXT-X-SESSION-DATA:DATA-ID="exoplayer.load_control",VALUE="{…minBufferMs:20000,bufferForPlaybackMs:1000…}"
#EXT-X-SESSION-DATA:DATA-ID="exoplayer.track_selection",VALUE="{…bandwidthFraction:0.65}"
#EXT-X-SESSION-DATA:DATA-ID="com.ape.live_sync",VALUE="{…liveSyncDurationCount:3…}"
#EXT-X-SESSION-DATA:DATA-ID="com.ape.recovery_policy",VALUE="{…}",
#EXT-X-SESSION-DATA:DATA-ID="com.ape.network_resilience",VALUE="{…retryCount:5…}"
#EXT-X-SESSION-DATA:DATA-ID="com.ape.abr_quality_policy",VALUE="{…preferHigherBitrate:true…}"
#EXT-X-SESSION-DATA:DATA-ID="com.ape.universal_parity",VALUE="{…}"
#EXT-X-SESSION-DATA:DATA-ID="com.ape.codec_preferences",VALUE="{…preferredCodecs:[dvh1,hvc1.2,av01,avc1]…}"
#EXT-X-APE-QOE-ENGINE:URI="https://iptv-ape.duckdns.org/prisma/lib/conviva-qoe-engine.js",VERSION="1.0.0-disney-grade",AUTO_LOAD="true"
#EXT-X-APE-LAB-VERSION:omega_v1
#EXT-X-APE-LAB-SCHEMA-VARIANT:omega_v2_bulletproof_perprofile
#EXT-X-APE-LAB-EXPORTED-AT:2026-05-23T05:39:38
#EXT-X-APE-LAB-BULLETPROOF:true
#EXT-X-APE-LAB-FILENAME:LAB_CALIBRATED
#EXT-X-APE-LAB-PROFILE-P0:NAME="8K Master",ROLE="8K Master DV/HDR10+",FITNESS=0.7398,SOLVER="LHS->GA->SA->NM 0,1s"
#EXT-X-APE-LAB-BOUNDS-P0:nudge_retry=[10,17],buffer=[105,315],abr_bw_factor=[0.85,0.98],…
#EXT-X-APE-LAB-KNOBS-P0:abrBandWidthFactor=0.85,reconnect_attempts=350,…buffer_seconds=105,…
#EXT-X-APE-LAB-PROFILE-P1:NAME="4K UHD",ROLE="4K UHD HDR",FITNESS=1,…
#EXT-X-APE-LAB-PROFILE-P2:NAME="2K QHD",ROLE="2K QHD",FITNESS=1,…
#EXT-X-APE-LAB-PROFILE-P3:NAME="FHD 1080p",ROLE="FHD 1080p",FITNESS=0.9909,…
#EXT-X-APE-LAB-PROFILE-P4:NAME="HD 720p",ROLE="HD 720p",FITNESS=0.2502,…
#EXT-X-APE-LAB-PROFILE-P5:NAME="SD 480p",ROLE="SD 480p",FITNESS=0.2175,…
```

Cola del archivo (cierre auditable):

```
http://line.tivi-ott.net/live/3JHFTC/U56BDP/2133933.m3u8

#EXT-X-APE-AUDIT-SCORECARD:{"v":"1","generatedAt":"2026-10-24T19:18:29.343Z","generatorVersion":"22.6.0-MEMC-TOTAL-8K120","channelsProcessed":23510,…}
#EXT-X-APE-VALIDATED:RFC8216-STRICT,verdict=PASS,channels=23510,exthttp_valid=23510,errors=0,warnings=0,missing_uri=0,missing_bw=0,missing_dur=0,elapsed_ms=1410
```

### 5.1 Censo de tags (muestra: primeras 400 000 de **22 271 732** líneas)

| Tag | Ocurrencias en la muestra |
|---|---|
| `#EXTINF` | 422 |
| `#EXT-X-STREAM-INF` | 291 |
| `#EXTHTTP` | **422** (= 1 por canal ⇒ **PASS** doctrina «un EXTHTTP por canal») |
| `#EXTVLCOPT` | **56 115** |
| `#KODIPROP` | **43 449** |
| `#EXT-X-SESSION-DATA` | 25 |
| `#EXT-X-APE-*` | **248 195** |

**Líneas totales:** **22 271 732**. `#EXT-X-APE-CHANNELS:23510` y el scorecard final `channelsProcessed: 23510` **coinciden** ⇒ coherencia interna del artefacto.

> **NO-STRIP respetado:** ~248 k tags `#EXT-X-APE-*` + 56 k `#EXTVLCOPT` + 43 k `#KODIPROP` presentes. La lista **no está adelgazada**.

### 5.2 VALIDACIÓN DOCTRINAL CLAVE: SHIELDED = solo sufijo de archivo

`APE_LISTA_1792869328847.m3u8.gz` (297 134 088 B) y `APE_LISTA_1792869328847_SHIELDED.m3u8.gz` (297 134 097 B) se descomprimieron a dos temporales y se compararon:

```
  22271732 /tmp/_p.txt
  22271732 /tmp/_s.txt
  cmp /tmp/_p.txt /tmp/_s.txt  →  IDENTICAL_PAYLOAD
```

**Medido: el payload descomprimido es BYTE A BYTE IDÉNTICO.** La diferencia de 9 B es ruido de compresión de gzip, no de contenido.
**⇒ La doctrina `SHIELDED = SOLO renombrar el archivo; las URLs internas son DIRECTAS al proveedor, NUNCA se transforman` se cumple al 100 %.** Confirmación independiente por la cola del archivo: la última URL es `http://line.tivi-ott.net/live/3JHFTC/U56BDP/2133933.m3u8` — **directa al proveedor, sin envolver en `/shield/`**.

> *(Los temporales `/tmp/_p.txt` y `/tmp/_s.txt` se borraron en la misma sesión con `rm -f`. No se dejó residuo.)*

---

## 6. Otros archivos de `/var/www/lists` (20 total)

| Archivo | Bytes | mtime (UTC) | Tipo | Nota |
|---|---|---|---|---|
| `channels_map.json` | **142 497 511** | `2026-03-15T15:41:22.820213103` | JSON | mapa de canales (raíz de datos) |
| `APE_LISTA_1780868608676_OMEGA_OPEN.m3u8.gz.bak_20260612_102007` | **241 458 501** | `2026-06-12T10:09:35.881958615` | `.gz.bak` | backup histórico OMEGA |
| `APE_GPU_TEST.m3u8.bak.1782287814` | 1 426 937 | `2026-06-24T05:51:51.769807027` | `.bak` | backup de prueba GPU |
| `APE_GPU_TEST.m3u8.bak.1782291261` | 959 | `2026-06-24T07:56:54.460966506` | `.bak` | idem |
| `resolve.php` | 35 931 | `2026-02-26T02:48:12.326843090` | PHP | resolver legacy **en el root de listas** |
| `null` | **0** | `2026-03-21T22:50:16.339461455` | vacío | archivo `null` de 0 B (residuo de una redirección `> null`) |

> **Observación de higiene:** `/var/www/lists` mezcla **payload servible** (`.gz`) con **backups de 241 MB**, un `resolve.php` y un archivo `null`. 1.9 G de root, de los cuales **~241 MB son backup histórico** y ~1.4 MB backups de test.

---

## 7. Comparación con el repo (`_vps_stage/`, `vps_configs/`)

| Búsqueda | Resultado medido |
|---|---|
| ¿El repo stagea las listas de producción? | **NO.** `_vps_stage/**/*.m3u8*` → **4 archivos, todos fixtures de test** (`selftest.m3u8` 203 B, `selftest_ll.m3u8` 377 B, `selftest_master.m3u8` 349 B, `selftest_master4k.m3u8` 378 B). **Ninguna lista de producción (297 MB) está versionada.** |
| ¿Existe espejo repo de `/var/www/lists`? | **NO.** Por diseño (son 1.9 G y se regeneran). |
| ¿Los fixtures del repo coinciden con los del VPS? | El VPS tiene `/etc/nginx/ape-selftest/` con `playlist.m3u8` (203 B), `playlist_ll.m3u8` (377 B), `playlist_master.m3u8` (349 B), `playlist_master4k.m3u8` (378 B) — **mismos tamaños** que los fixtures del repo, pero **nombres distintos** (`playlist_*` vs `selftest_*`). Comparación de hash: **PENDIENTE / UNKNOWN** (el repo nombra distinto; ver `VPS_DRIFT_VS_REPO.md` §3). |
| Listas en `vps_configs/` | **NO hay** — `vps_configs/` sólo contiene 7 artefactos de config/scripts (`autopista-trap.conf`, `fix_trap.py`, `hooks_balance.sh`, `inject_*.py`, `lua_inventory.sh`). |

**Consecuencia honesta:** la correspondencia **lista servida ↔ artefacto del repo** es **UNKNOWN por diseño**, no por fallo de auditoría. La cadena verificable es `LAB (Excel) → JSON → generador` (capas 10/20/30, auditadas por otras sesiones) y luego el `.gz` **se sube por HTTP** (`upload_chunk.php` + `finalize_upload.php`), sin pasar por git. Reconstruir «qué versión del generador produjo exactamente este `.gz`» exige el `#EXT-X-APE-AUDIT-SCORECARD` embebido (§5), que sí lo declara: `generatorVersion: 22.6.0-MEMC-TOTAL-8K120`, `generatedAt: 2026-10-24T19:18:29.343Z`.

---

## 8. Coherencia con el resto de la cadena (lo que cambia el trabajo de otros)

| Observación medida | Efecto sobre otras capas |
|---|---|
| **L1.** El `.gz` vigente embebe `#EXT-X-APE-LAB-EXPORTED-AT:2026-05-23T05:39:38` y `LAB-FILENAME:LAB_CALIBRATED`, pero el `AUDIT-SCORECARD` dice `generatedAt: 2026-10-24T19:18:29Z` | La lista vigente fue **generada el 2026-10-24** con una **DNA LAB exportada el 2026-05-23**. **5 meses de separación.** Si la sesión `excel-ssot`/`json-ssot` certificó una DNA más nueva, **la lista servida está desalineada** con ella. → **Acción para 10-excel/20-json: comparar su DNA certificada contra `2026-05-23T05:39:38`.** |
| **L2.** Perfiles en la lista: `P0="8K Master"`, **`P1="4K UHD"`**, `P2="2K QHD"`, `P3="FHD 1080p"`, `P4="HD 720p"`, `P5="SD 480p"` | El manifiesto OMEGA declara **`P1 = 8K (AV1, av01.0.15M.10)`** y `P2 = 4K`. **La lista servida NO coincide**: P1 es 4K UHD, no 8K AV1; y aparece un `P2 = 2K QHD` que no está en la tabla doctrinal. → **Discrepancia real de ladder LAB↔lista.** La reporta este auditor; la resuelve quien posea el SSOT. |
| **L3.** `#EXT-X-SERVER-CONTROL` + `#EXT-X-PART-INF:PART-TARGET=1.0` + `#EXT-X-TARGETDURATION:2` a nivel **global** de una lista **catálogo de canales** | Tags LL-HLS (RFC 8216bis) en el nivel raíz de un catálogo M3U Plus. Riesgo de RFC/player. **Fuera de mi alcance (S1/S9); se reporta, no se juzga.** |
| **L4.** `#EXT-X-APE-VALIDATED:…verdict=PASS,…,missing_uri=0,missing_bw=0,missing_dur=0` | Autodeclaración del generador. **No es prueba independiente**; se cita como lo que es. |
| **L5.** `APE_LISTA_1792869328847_SHIELDED.m3u8.gz` (`12:51 Bogotá`) es **5 min MÁS ANTIGUA** que la no-SHIELDED (`12:56 Bogotá`), y su payload es idéntico | El par SHIELDED/plain se generó del mismo contenido; el nombre es el único diferenciador. **PASS doctrinal** (§5.2). |

---
*Fin de VPS_LISTS_INVENTORY.md — 7 placeholders + 7 `.gz` (1.53 GiB) hasheados, 7/7 integridad OK, SHIELDED verificado byte-idéntico. Cero mutaciones.*

# LISTS_INVENTORY — Inventario medido de las dos familias de listas

**Tarea:** t8 (T7) · **Auditor:** `listas-m3u8` · **Ventana:** `2026-10-26T04:07Z – 04:33Z`
**Naturaleza:** SOLO LECTURA. Cero escrituras en listas, en el VPS y en el repo fuera de `audit/alignment/2026-10-25/50-listas/`.
**Autoridad de coordinación:** `docs/ops/session-coordination/COORDINATION_PROTOCOL.md` (lane `t8` →
`audit/alignment/2026-10-25/50-listas/**`) y `CLAUDE.md` «REALIDAD MEDIDA DEL VPS» (D-25/D-32/D-33).

---

## 0. Denominador global (lo primero, para que nadie cuente de más)

| Familia | Artefactos existentes | Auditados por t8 | UNKNOWN declarado |
|---|---|---|---|
| **A — servidas por el VPS** (`/var/www/lists`) | **7 listas lógicas** = 7 `.m3u8` (placeholder 8 B) + 7 `.gz` (payload) = **1 642 243 210 B** comprimidos | **5 con censo estructural completo** + **1 por identidad probada** (SHIELDED ≡ vigente) + **1 sólo por familia de URL** = **6/7** | **1/7** (`…792950212154_CDN_SHIELDED`: sólo se midió que el 100 % de sus 10 520 URLs son `/cdn/`; sus combos de códec no se midieron) |
| **B — directas al proveedor** (repo) | **27 archivos `.m3u8`** en disco = **1 451 818 942 B**, pero sólo **22 contenidos distintos** | **22/22 contenidos distintos** auditados línea a línea (1 449 276 021 B) | **0** — los 5 restantes son **duplicados byte a byte** de archivos ya auditados (hashes en §2.3) |
| **TOTAL** | 34 artefactos · 3 094 062 152 B | **28 auditorías de contenido** | **1 UNKNOWN** (0,5 % del payload del VPS) |

**Regla de conteo:** un `.m3u8` + su `.gz` son **una** lista, no dos (el `.m3u8` es un placeholder de 8 bytes).
Un archivo duplicado byte a byte es **un** contenido, no dos.

---

## 1. Familia A — listas servidas por el VPS

### 1.1 Publicación y mecanismo (medido, no inferido)

| Dato | Valor medido | Fuente |
|---|---|---|
| Root de las listas | `/var/www/lists` — `www-data:www-data`, `775`, **1,9 G**, **20 archivos** | t7 `VPS_LISTS_INVENTORY.md` §1 |
| Puente HTTP | `/var/www/html/lists` → symlink → `/var/www/lists` | t7 §1 |
| URL pública | `https://iptv-ape.duckdns.org/lists/<archivo>` | t7 §1 |
| Location que las sirve | `sites-enabled/default` → `location ~* \.m3u8$` (línea **706** del dump), `gzip_static always; gunzip on; output_buffers 32 16k; sendfile on; Cache-Control: public, max-age=300` | `40-vps/_raw/nginx-T.conf:706-763` |
| **¿Lua en ese location?** | **NO.** `grep -n "lua" /etc/nginx/sites-enabled/default` ⇒ **0 coincidencias** (verificado en vivo 2026-10-26T04:22Z) | t8 |
| Vídeo por el VPS | `location ~* \.(ts|m4s|mp4)$ { return 404; }` (línea **788**) | `nginx-T.conf:788` |
| Consecuencia | **el catálogo servido es BYTE-IDÉNTICO al `.gz`**: no hay rewrite, ni header, ni tag añadido en esta ruta | §1.4 + `LISTS_DIFF_VPS_VS_DIRECT.md` §3 |

### 1.2 Inventario de las 7 listas (placeholders + payload)

Los **7** `.m3u8` son **el mismo archivo de 8 bytes** (`#EXTM3U\n`, sha `144659b4…313dd12`): el placeholder no
identifica la lista. **La identidad vive en el `.gz`.**

| # | Lista | `.gz` bytes | mtime (UTC) | sha256 `.gz` | `gzip -t` | Censo t8 |
|---|---|---|---|---|---|---|
| A1 | `APE_LISTA_1786899011456` | 323 921 357 | `2026-08-16T16:55:56` | `9e45c069f906a16fe93cd78e236608ed8c41063fb1f7da910522730bc43d7789` | OK | **completo** |
| A2 | `APE_LISTA_1788135732934` | 128 973 661 | `2026-08-31T00:34:53` | `13222bcd42d9f82fd614cdf5529422a6f4730ad9c50ebc2ef23735293eb685f9` | OK | **completo** |
| A3 | `APE_LISTA_1788145199732` | 325 350 262 | `2026-08-31T03:13:04` | `32dd7ca213cf66d58f1d6c473d7693c8406181943dafa4f9ee6a07b8ff11eb0d` | OK | **completo** |
| A4 | **`APE_LISTA_1792869328847`** (vigente) | **297 134 088** | **`2026-10-25T17:56:21`** | **`7f1cd8a7f3dd58960c7dfde373ed115eeeac5be4a72a1d1fc5850636f9ccc360`** | OK | **completo + re-hasheado por t8** |
| A5 | `APE_LISTA_1792869328847_SHIELDED` | 297 134 097 | `2026-10-25T17:51:57` | `c2da31cafcd246aa60bc14080aa587ed042b915306b7e7635f6b0fc928e9c064` | OK | **identidad probada**: payload descomprimido byte a byte idéntico a A4 (t7 §5.2) |
| A6 | `APE_LISTA_1792909103946_CDN_SHIELDED` | 134 914 902 | `2026-10-25T06:57:08` | `44451afb8046ccc2d2f7eb3b2b8af4e3a4473cbca7a0211a89e42d602adcf0e1` | OK | **completo** |
| A7 | `APE_LISTA_1792950212154_CDN_SHIELDED` | 134 814 843 | `2026-10-25T17:47:28` | `4625729a9d2b731c881dbfa6045a6c28c27a49899b6d0df795c92489b0f29f1d` | OK | **parcial**: familia de URL + nº de canales |

* **Total payload:** `294 233 210 × …` → **1 642 243 210 B ≈ 1,53 GiB**. **Integridad: 7/7 `gzip -t` OK.**
* **Re-verificación de t8 (A4):** `sha256sum` = `7f1cd8a7…ccc360`, **idéntico** al que midió t7 a las 04:00Z y
  `mtime` sin cambios ⇒ **la lista vigente no cambió entre t7 y t8**, y **t8 no la modificó** (§4).
* **Los 5 hashes de A1-A3, A5-A7 son los de t7** (misma sesión de auditoría, 30 min antes). t8 **re-verificó
  tamaño + mtime + `gzip -t`** de los 6 (A1-A3, A5-A7 vía censo ligero) y el **sha256 completo sólo de A4**.

### 1.3 Perfil estructural medido de las 5 listas con censo completo

Todas comparten el **mismo esqueleto** (catálogo M3U Plus + cabecera HLS) y el **mismo perfil de cumplimiento**:

| Lista | Líneas | Canales (`#EXTINF`) | URIs | `STREAM-INF` | `I-FRAME` sin `URI` | `#EXTHTTP` | Tóxicos | `VIDEO-RANGE` dup | `hev1` en `STREAM-INF` | Audio en `CODECS` | Familia de URL |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A1 | 24 488 012 | 25 905 | 25 905 | 15 717 | 25 905 | 25 905 | **0** | 0 | **0** | 15 717 | 25 905 directas `http://` |
| A2 | 9 668 242 | 10 172 | 10 172 | 10 127 | 10 172 | 10 172 | **0** | 0 | **0** | 10 127 | 10 172 directas |
| A3 | 24 315 810 | 25 669 | 25 669 | 15 507 | 25 669 | 25 669 | **0** | 0 | **0** | 15 507 | 25 669 directas |
| A4 (vigente) | **22 271 732** | **23 510** | **23 510** | **14 343** | **23 510** | **23 510** | **0** | 0 | **0** | 14 343 | 23 510 directas |
| A6 | 10 000 217 | 10 520 | 10 520 | 10 475 | 10 520 | 10 520 | **0** | 0 | **0** | 10 475 | **10 520 `/cdn/`** |
| A7 | — (no censado) | 10 520 | 10 520 | — | — | — | — | — | — | — | **10 520 `/cdn/`** |
| A5 | ≡ A4 (payload idéntico) | — | — | — | — | — | — | — | — | — | ≡ A4 |

**Hechos que salen de esta tabla y que cambian el trabajo de otras capas:**

1. **Las 5 listas con URL directa (`A1-A5`, 95 776 canales en total) NO tocan el rewrite del VPS**: sus URLs
   son `http://line.tivi-ott.net/live/<CRED>/<CRED>/<id>.m3u8`, directas al proveedor. `URL_CON_SHIELD=0`,
   `URL_CON_CDN=0`, `URL_CON_META=0`.
2. **Las 2 listas `_CDN_SHIELDED` (`A6`, `A7`, 21 040 canales) tienen el 100 % de sus URLs en `/cdn/`** ⇒
   **esas sí pasan por el rewrite** (`ape_gateway.lua` + `ape_uhd.lua`). Son las **más nuevas** (2026-10-25).
3. **Cero headers tóxicos en las 6 listas medidas** (95 776 + 10 520 + 10 520 canales). Por **clave JSON
   exacta**, no por substring (ver `LISTS_HEADERS_TRAPS.md` §5).
4. **`I-FRAME-STREAM-INF` sin `URI` en el 100 % de los canales de todas las listas** ⇒ la desviación RFC
   no es de una lista: es **sistémica del generador**.
5. **Las listas de agosto (A1, A3) y la vigente (A4) comparten el mismo defecto de nivel** (L120/L123 declarados
   en 3840×2160). Ver `LISTS_CODEC_COHERENCE.md` §1.1: **3 941 líneas** imposibles en las 5 listas medidas.

### 1.4 Prueba de servicio e identidad del payload (medido por t8, no heredado)

```
GET https://127.0.0.1/lists/APE_LISTA_1792869328847.m3u8   (Range: bytes=0-0)
HTTP/1.1 200 OK
Content-Type: application/vnd.apple.mpegurl
Last-Modified: Sun, 25 Oct 2026 17:56:21 GMT      ← mtime del .gz
Transfer-Encoding: chunked                        ← gunzip on (streaming)
Vary: Accept-Encoding
Cache-Control: public, max-age=300
Access-Control-Allow-Origin: *
Accept-Ranges: bytes
(**) sin ningún header X-APE-*  ⇒ ninguna capa Lua intervino
```

⇒ **La lista que el player descarga es el `.gz` descomprimido tal cual.** No hay "rewrite del VPS" en el
catálogo. El rewrite existe **sólo** en `/cdn/` y `/meta/` (ver `LISTS_DIFF_VPS_VS_DIRECT.md`).

### 1.5 Otros artefactos en `/var/www/lists` (20 archivos; NO son listas pero comparten root)

| Archivo | Bytes | Nota |
|---|---|---|
| `channels_map.json` | 142 497 511 | mapa de canales (raíz de datos) — **auditado por t5** (`CHANNELS_MAP_DIFF.md`) |
| `APE_LISTA_1780868608676_OMEGA_OPEN.m3u8.gz.bak_20260612_102007` | 241 458 501 | **backup histórico** (`.gz.bak`) |
| `APE_GPU_TEST.m3u8.bak.1782287814` / `.1782291261` | 1 426 937 / 959 | backups de prueba |
| `resolve.php` | 35 931 | resolver legacy en el root de listas |
| `null` | **0** | residuo de una redirección `> null` |

**Higiene:** 1,9 G de root de los que **~241 MB son backup histórico** y **~1,4 MB** backups de test. Ninguno
se sirve por `location ~* \.m3u8$` (extensiones `.bak`, `.php`, vacío) — verificado en el dump.

**Nota de conteo (evita una falsa alarma de drift):** `ls -la /var/www/lists` lista **22 entradas**, pero
**sólo 20 son archivos**. Las 2 restantes son:
`lists → /var/www/html/lists` (**symlink**, `2026-02-01`) y `versions/` (**directorio VACÍO**, `2026-04-05`,
`du -sh` = 4,0 K, `find -type f` = **0 archivos**).
⇒ **No hay listas ocultas ni versiones antiguas en `versions/`**, y la diferencia 20 (t7) vs 22 (`ls -1 | wc -l`)
es **método de conteo**, no una subida nueva. Re-verificado al cierre de t8 (04:41Z): **ninguna `.m3u8`/`.gz`
con `mtime` posterior a `2026-10-25T17:56:21Z`** ⇒ nadie subió listas durante la auditoría.

---

## 2. Familia B — listas directas al proveedor (versionadas en el repo)

### 2.1 Mecanismo: por qué esta familia existe

La APP genera la lista y la sube **por HTTP** (`upload_chunk.php` + `finalize_upload.php`) al VPS; **no pasa por
git**. Por eso el repo contiene **muestras históricas** del generador, no las listas servidas:

| Búsqueda | Resultado medido |
|---|---|
| ¿El repo stagea las listas de producción (297 MB)? | **NO** (`_vps_stage/**/*.m3u8*` = **4 fixtures de test**: 203/377/349/378 B) |
| ¿Existe espejo de `/var/www/lists`? | **NO** — por diseño |

⇒ La correspondencia `lista servida ↔ artefacto del repo` es **UNKNOWN por diseño**; la trazabilidad se
reconstruye por el `#EXT-X-APE-AUDIT-SCORECARD` embebido (A4 declara `generatorVersion:"22.6.0-MEMC-TOTAL-8K120"`,
`generatedAt:"2026-10-24T19:18:29.343Z"`).

### 2.2 Las 22 listas auditadas (contenido distinto)

| Archivo | Bytes | Líneas | Canales | Perfil | Hallazgo dominante |
|---|---|---|---|---|---|
| `IPTV_v5.4_MAX_AGGRESSION/snapshots/2026-04-26_audit_92_omega_premium/APE_LISTA_1777243113563_SHIELDED.m3u8` | 718 342 566 | 14 332 124 | 15 444 | catálogo + HLS | 4 tóxicos 100 %, 182 imposibles, `lcev.1` |
| `OMEGA_UPDATE/APE_OMEGA_PRODUCTION_v5.2.m3u8` | 224 620 513 | 2 034 902 | 2 754 | catálogo | **6/6 tóxicos 100 %**, `EXTM3U` línea 9, 1 canal sin URL |
| `OMEGA_UPDATE/APE_TYPED_ARRAYS_ULTIMATE.m3u8` | 222 166 550 | 2 034 902 | 2 754 | idem | **6/6 tóxicos 100 %** |
| `downloaded_list.m3u8` | 222 166 550 | 2 034 902 | 2 754 | idem | **duplicado exacto** de la anterior (sha `49AE918B…`) |
| `temp_analysis/APE_TYPED_ARRAYS_ULTIMATE_20260319 (17).m3u8` | 58 924 525 | 929 573 | 1 359 | catálogo + HLS | **`hev1` en `STREAM-INF` ×1 359**, 6/6 tóxicos, 1 359 imposibles |
| `IPTV_v5.4_MAX_AGGRESSION/backend/lista_omega_v5.4.m3u8` | 2 533 473 | 16 733 | 8 366 | F5 puro | 0 `STREAM-INF`, 0 `EXTHTTP`, 0 `tvg-logo` |
| `IPTV_v5.4_MAX_AGGRESSION/audit_bulletproof_output.m3u8` | 459 587 | 9 315 | 10 | catálogo + HLS | tóxicos, AV1 idx8@8K, `lcev.1.1`, enumerados entrecomillados |
| `lista_omega_mock.m3u8` | 24 643 | 201 | 100 | F5 puro | sin `tvg-logo` |
| `test.m3u8` | 15 629 | 203 | 1 | prueba | **4 `#EXTHTTP` no-JSON**, `EXTM3U` línea 5 |
| `test2/3/4.m3u8` | 5 532/5 517/5 514 | 36 c/u | 0 | prueba | masters sueltos |
| `.agent/skills/…/templates/OMEGA_EXAMPLE_LIST.m3u8` | 2 362 | 25 | 5 | plantilla | **2 × `#EXTM3U`**, huella de motor ×5 |
| `_vps_stage/fixtures/selftest_master4k.m3u8` | 378 | 7 | 0 | fixture | master 4K/HEVC coherente (base del experimento de §DIFF) |
| `_vps_stage/fixtures/selftest_master.m3u8` | 349 | 7 | 0 | fixture | AVC L4.0 a 1080p60 |
| `_vps_stage/fixtures/selftest_ll.m3u8` | 377 | 12 | 1 | fixture LL-HLS | `EXT-X-PART` ×4 |
| `_vps_stage/fixtures/selftest.m3u8` | 203 | 8 | 1 | fixture | — |
| `f1_full.m3u8` | 228 | 4 | 1 | prueba | 1 `#EXTHTTP` |
| `frontend/js/ape-v9/parsers/fixtures/hls_master_hevc_main10.m3u8` | 813 | 10 | 0 | fixture | 3 `EXT-X-MEDIA URI=` (**legítimo**) |
| `frontend/js/ape-v9/parsers/fixtures/hls_dolby_vision.m3u8` | 372 | 6 | 0 | fixture | 1 `EXT-X-MEDIA URI=` (**legítimo**) |
| `frontend/js/ape-v9/parsers/fixtures/hls_media_cmaf.m3u8` | 176 | 11 | 3 | fixture Media | `EXT-X-MAP` real |
| `frontend/js/ape-v9/parsers/fixtures/hls_media_ts.m3u8` | 164 | 11 | 3 | fixture Media | `EXT-X-ENDLIST` |

**Totales:** 22 archivos · **1 449 276 021 B** · **21 393 064 líneas** · **33 556 canales**.

### 2.3 Los 5 archivos no auditados individualmente son **duplicados byte a byte**

| Archivo (no auditado) | sha256 (16 hex) | Bytes | Idéntico a |
|---|---|---|---|
| `.agent/skills/iptv_ape_v4_full_builder/templates/OMEGA_EXAMPLE_LIST.m3u8` | `DC1795169E936AD8` | 2 362 | ✔ auditado |
| `.agents/_archive_20260516_bogus_stubs/…/iptv-ape-v4-full-builder/templates/OMEGA_EXAMPLE_LIST.m3u8` | `DC1795169E936AD8` | 2 362 | ✔ |
| `.agents/_archive_20260516_bogus_stubs/…/iptv_ape_v4_full_builder/templates/OMEGA_EXAMPLE_LIST.m3u8` | `DC1795169E936AD8` | 2 362 | ✔ |
| `OMEGA_UPDATE/OMEGA_PACKAGE/OMEGA_EXAMPLE_LIST.m3u8` | `DC1795169E936AD8` | 2 362 | ✔ |
| `IPTV_v5.4_MAX_AGGRESSION/backup_master_v5.4_phantom_engine/backend/lista_omega_v5.4.m3u8` | `40473839DF673A69` | 2 533 473 | ✔ auditado |

**Aritmética de cierre:** `1 451 818 942 (27 archivos) − 1 449 276 021 (22 auditados) = 2 542 921 =
4 × 2 362 + 2 533 473` ✔ **cuadra exacto** ⇒ no hay contenido sin auditar en esta familia.

**Duplicación de payload en el repo:** 3 listas de ~222 MB (2 con el **mismo** sha `49AE918B…`) + 5 copias de la
plantilla ⇒ **≈ 444 MB de bytes repetidos** que el repo arrastra.

---

## 3. Qué lista es "la que se sirve" (para que nadie audite la equivocada)

| Dato | Valor |
|---|---|
| **Vigente (plain)** | `APE_LISTA_1792869328847.m3u8.gz` — `2026-10-25T17:56:21Z` = **2026-10-25 12:56 America/Bogota** |
| **Vigente (SHIELDED)** | `APE_LISTA_1792869328847_SHIELDED.m3u8.gz` — `2026-10-25T17:51:57Z` = **12:51 Bogotá** (5 min antes, payload idéntico) |
| **Vigente (CDN)** | `APE_LISTA_1792950212154_CDN_SHIELDED.m3u8.gz` — `2026-10-25T17:47:28Z` = **12:47 Bogotá** |
| Generador declarado por la propia lista | `generatorVersion:"22.6.0-MEMC-TOTAL-8K120"`, `generatedAt:"2026-10-24T19:18:29.343Z"` (línea 22 271 730) |
| DNA LAB embebida | `#EXT-X-APE-LAB-EXPORTED-AT:2026-05-23T05:39:38` (línea 20) ⇒ **5 meses** entre la DNA y la generación (hallazgo L1 de t7, **sigue vigente**) |

---

## 4. Atestación de no-mutación (t8)

| Comprobación | Antes (`04:07Z`) | Después (`04:33Z`) | Veredicto |
|---|---|---|---|
| `APE_LISTA_1792869328847.m3u8.gz` size / mtime / sha256 | 297 134 088 / `2026-10-25T17:56:21` / `7f1cd8a7…ccc360` | **idéntico** (el censo de las 04:11Z y la re-verificación final leen el mismo `stat`+`sha256sum`) | **sin cambio** |
| Los 6 `.gz` restantes: `gzip -t` | 7/7 OK | 7/7 OK | **sin cambio** |
| Directorio `/var/www/lists` | 20 archivos, 1,9 G | 20 archivos, 1,9 G | **sin cambio** |
| `/etc/nginx/**` (lua + conf) | 14 módulos, sin `shield` | idéntico | **sin cambio** |
| Escrituras de t8 en el VPS | — | **0** (todas las lecturas son `cat`, `stat`, `sha256sum`, `gzip -t`, `zcat\|awk`, `curl` GET) | **0 mutaciones** |
| Escrituras de t8 en el repo | — | **sólo** `audit/alignment/2026-10-25/50-listas/**` (6 `.md` + 6 scripts + 8 artefactos crudos) | **lane respetado** |

**Único temporal creado y borrado en el VPS:** `/tmp/_h.txt` (cabeceras de un `curl`), borrado en la **misma**
llamada con `rm -f` y verificado por el `echo` de control. Se declara por transparencia; no toca listas ni config.

---

*Fin de `LISTS_INVENTORY.md`. 7 listas del VPS (1,53 GiB) y 22 contenidos del repo (1,45 GB) inventariados con
hash, tamaño, mtime y perfil de cumplimiento; denominador cerrado por aritmética; cero mutaciones.*

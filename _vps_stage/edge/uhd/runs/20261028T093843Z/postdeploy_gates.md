# POST-DEPLOY GATES · Fase 0 B-01+B-02 — veredicto **FAIL** (3 gates FAIL; deploy correcto en todo lo medible)

**Tarea:** t31 · **Auditor:** `s9-player-compat` (no-autor del código; autor s6) · **Fecha:** 2026-10-28
**Deploy:** commit `2f8861cf` (B-01+B-02) · backup `/var/backups/ape-deploy/20261028T093843Z` (10 ficheros) · **ventana:** 09:41–09:45Z
**Host:** `ubuntu-2gb-ash-1` (178.156.147.234) · **solo lectura** (0 escrituras en el VPS; 0 deploy/reload/commit desde esta auditoría)
**Capturas:** pre `cases/20261028T093327Z.json` (t30) · post `cases/20261028T094119Z.json` (esta corrida; `latest.json` actualizado)

## 1. Tabla de gates

| Gate | Comando | Resultado real | Veredicto |
|---|---|---|---|
| **G3 Guard** | `node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs` (cases post) | **exit 1** · `VEREDICTO: FAIL blocker=7 high=2` · blockers = UHD-01/UHD-07 en los 4 fixtures (servido=[]) · **UHD-09 ok** (el blocker original ya no aparece) · UHD-10/11 latentes (8K forzado en M1/M2) | **FAIL** (causa: harness, ver §2) |
| **G4 Selftest** | `… --selftest` (cases post) | **2/8** · `FAIL S7_8k_con_L153 NO DETECTADO` · `FAIL control_negativo` (UHD-01/UHD-07 de los pares 403) | **FAIL** (causa: harness) |
| **G4bis Selftest canónico** | `… --selftest --cases cases/20261026T204116Z.json` | **PASS 8/8**, exit 0 | PASS (prueba de que la lógica del guard está intacta) |
| **G5 luatest** | `curl 127.0.0.1:8088/_ape/luatest` | `expected:88, asserts_ok:true, fail:0` · 88 `pass:true`, 0 `pass:false` | **PASS 88/88** (N nuevo = 88) |
| **G6 Captura post** | `node capture_uhd.mjs --label post` | exit 0 · pares=4 · filas_lua=20 · **servidos 403 `private_range_blocked`** (idénticos a pre) | **BLOCKED (servido)** |
| **G6bis Casos del módulo** | `lua5.1` con `/etc/nginx/lua/ape_uhd.lua` desplegado (`allow_8k=true`) | 4K L183 → **8k** + `#EXT-X-APE-UPSCALE:declared=7680x4320;codec=truthful;mode=8k;src=3840x2160;can8k=1` · 4K L153 → **4k** · 8K L183 → 8k · 8K L153 → **4k** · 1080 AVC → 4k (CODECS intacto) · con `allow_8k=false` (flag vivo `uhd8k=0`) 4K L183 → 4k | **PASS 5/5** (incluye el caso AU-01) |
| **G7 /cdn/** | `curl` público 443: manifest, `.ts`, `.m4s`, `.mp4` | `manifest=200` · `ts=404` · `m4s=404` · `mp4=404` | **PASS** |
| **G8 Listas** | `sha256sum` + `stat` de las 2 listas | `APE_LISTA_4K` `a464a0c3…081b` · 140.555.650 B · 2026-10-26 19:55:49 · `…_CDN` `db2d034e…2ab8` · 160.845.954 B · 08:23:18 — **idénticos al baseline de t30** | **PASS** |
| **G9 health** | `curl 127.0.0.1:8088/_ape/health` | 200 · `ok:true`, `shared_dicts:true`, `upstreams_down:0` · objeto `"uhd":{can8k_last,off,uhd8k,uhd4k,mode_last}` presente; campos previos no reordenados (`uhd` va tras `checks`, antes de `plane`/`ok`) | **PASS** |
| **`/_ape/uhd`** | loopback + 443 | loopback **200** `{can8k_last,off,ts,uhd8k,uhd4k,mode_last,ok}` · contadores **reales**: `off` 896 → **898** tras la petición `/cdn/` · **443 → 404** | **PASS** |
| **G10 TTFB** | 5 pares `time_total` − `X-APE-Upstream-Ms` | total 691–800 ms · upstream 691–799 ms · **Δ 0,6–1,9 ms** ≤ pre 31–51 ms (`BASELINE.md:215`) | **PASS** |
| **G11 Red** | `sysctl` + `ip route show table all` | `bbr` · `fq` · `tcp_fastopen=3` · `tcp_slow_start_after_idle=0` ✓ · **`rto_min lock 40ms` = 0 rutas** (30 rutas, todas las tablas) | **FAIL** (item rto_min) |
| **Deploy paridad** | `sha256sum` de los 10 destinos vs repo | **10/10 idénticos** (header 23b25b03 · uri_rebase 393635c2 · wake d9c6b65d · gateway 360e4097 · rebase_lib f813b1cc · uhd b02fbe28 · obs afa003ad · lab_api c4572679 · luatest 7f5be265 · meta-plane 6b3c71e7) | **PASS** |
| **nginx** | `systemctl show` + `nginx -t` | `MainPID=3801145` (**sin cambio** vs t30) · `NRestarts=0` · `nginx -t` OK · `nginx -T` 255425a9… | **PASS** (reload sin restart) |
| **Rollback** | `find /var/backups/ape-deploy/20261028T093843Z` | **10 ficheros** `etc/nginx/{lua/*.lua,conf.d/50-ape-meta-plane.conf}` · **sin** `SHA256SUMS` | **PASS** (10/10) |

## 2. Por qué G3/G4 fallan: harness, no deploy

- Los 4 fixtures se piden como `/cdn/127.0.0.1:8088/__fixture*.m3u8`; el gateway los bloquea con **403 `{"error":"private_range_blocked"}`** (guardia SSRF, correcta).
- **Idéntico en pre (09:33:27) y post (09:41:21)**: mismas cabeceras 403 y mismo cuerpo ⇒ **no es una regresión del deploy**.
- t30 ejecutó G3 con la captura **canónica 10-26** (servidos 200) y por eso vio `blocker=1` (solo UHD-09). Con la captura del 28-10 el guard ve `servido=[]` y marca UHD-01/UHD-07. **El defecto es del método de captura** (fixture por loopback bloqueado por SSRF), no del producto.
- G4 `--selftest` depende de `doc.pairs` como `control_negativo`; con pares 403 falla. Con la captura canónica da **8/8** ⇒ lógica del guard intacta.

## 3. Veredicto global

**FAIL** — no se suaviza: G3 (`exit 1`), G4 con captura viva (2/8) y G11 (`rto_min=0`) son FAIL según el criterio escrito.

**Pero el deploy en sí está correcto en todo lo medible**: paridad 10/10, `luatest` 88/88, `/cdn/` 200 + 404×3, listas intactas, health + `/_ape/uhd` con contadores y 404 en 443, TTFB dentro, `nginx -t` OK y PID sin cambio, rollback con 10 ficheros. El blocker original **UHD-09 desaparece** y el módulo desplegado cumple los 5 casos de G6, incluido **4K L183 → 8K con marcador** (excepción de producto).

**Rollback:** el criterio literal dice «cualquier FAIL → rollback inmediato». Con la evidencia anterior **no lo recomiendo**: los tres FAIL no se corrigen revirtiendo nginx (el 403 de fixtures es pre-deploy; `rto_min` no lo toca el deploy), y revertir desharía el fix de UHD-09 sin ganancia. **Recomendación:** mantener el deploy, corregir el harness (fixture servido por host no privado o location de fixture) y re-medir G3/G4; verificar `rto_min 40ms` con el dueño de red (G11) antes de declarar la Fase 0 cerrada.

## 4. Evidencia y scripts de esta corrida

- `postdeploy_remote.sh`, `postdeploy_remote2.sh`, `postdeploy_remote3.sh`, `postdeploy_remote4.sh`, `postdeploy_remote5.sh` (todos LF, `ssh 'bash -s'`, solo lectura)
- captura post: `cases/20261028T094119Z.json` (11.304 B) + `runs/20261028T094119Z/capture.log`
- flags vivos en la captura: `uhd_auto=1, uhd4k=1, uhd8k=0, uhd_pq=0`
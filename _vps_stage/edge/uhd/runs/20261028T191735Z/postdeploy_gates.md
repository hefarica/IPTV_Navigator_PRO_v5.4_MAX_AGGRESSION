# POST-DEPLOY GATES · Fase 0 B-01+B-02 — veredicto **FAIL** (sólo G11; deploy correcto)

**Tarea:** t31 (attempt 3) · **Auditor:** `s9-player-compat` (no-autor del código) · **Fecha:** 2026-10-28
**Deploy:** commit `2f8861cf` · backup `/var/backups/ape-deploy/20261028T093843Z` (10 ficheros) · **ventana:** 19:17–19:19Z
**Host:** `ubuntu-2gb-ash-1` (178.156.147.234) · **solo lectura** (0 escrituras en VPS; 0 deploy/reload/commit desde esta auditoría)
**Harness:** fix `t35` (servidos 200; antes 403 `private_range_blocked`) · capturas: pre-deploy `20261028T093327Z` (403), post-fix baseline `t35-post`, **post de esta corrida `20261028T191735Z`** · módulo: `g6_module_cases.log`

## 1. Tabla de gates

| Gate | Comando | Resultado real | Veredicto |
|---|---|---|---|
| **G3 Guard** | `node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs` | **exit 0** · `VEREDICTO: PASS_WITH_DECLARED_RISK blocker=0 high=3 info=1` · **UHD-09 ya no bloquea**; highs = UHD-04 (marca sin cambio), UHD-10/11 (matriz 8K **forzado**, suite `latent`), info UHD-08 | **PASS** |
| **G4 Selftest** | `… --selftest` | **PASS (8/8)**, exit 0 | **PASS** |
| **G5 luatest** | `curl 127.0.0.1:8088/_ape/luatest` | `expected:88, asserts_ok:true, fail:0` (88 pass) | **PASS** |
| **G6 Captura post** | `capture_uhd.mjs --label post` | exit 0 · pares=4 · filas_lua=20 · **servidos 200** (488/517/397/658 B) · `t35-post` y esta captura **byte-idénticas** (mismos sha256) | **PASS** |
| **G6bis Casos** | `lua5.1` con `/etc/nginx/lua/ape_uhd.lua` (`allow_8k=true`) | **4K L183 → 8K** + `#EXT-X-APE-UPSCALE:declared=7680x4320;codec=truthful;mode=8k;src=3840x2160;can8k=1` · **4K L153 → 4K** · **8K L153 → 4K** · 8K L183 → 8K · 1080 AVC → 4K (CODECS intacto) · con flag vivo `uhd8k=0`: 4K L183 → 4K | **PASS (5/5)** |
| **G7 /cdn/** | `curl` público 443 | `manifest=200` · `ts=404` · `m4s=404` · `mp4=404` | **PASS** |
| **G8 Listas** | `sha256sum` + `stat` | `APE_LISTA_4K` `a464a0c3…081b`/140.555.650 B/2026-10-26 19:55:49 · `…_CDN` `db2d034e…2ab8`/160.845.954 B/08:23:18 — **idénticos** al baseline t30 | **PASS** |
| **G9 health** | `curl /_ape/health` | 200 · `ok:true`, `shared_dicts:true`, `upstreams_down:0` · `"uhd":{can8k_last,off,uhd8k,uhd4k,mode_last}` tras `checks` y antes de `plane`/`ok` (sin reordenar) | **PASS** |
| **`/_ape/uhd`** | loopback + 443 | 200 `{can8k_last,off,ts,uhd8k,uhd4k,mode_last,ok}` · contadores reales: `off` **1218→1219** y `uhd4k=13` · **443 → 404** | **PASS** |
| **G10 TTFB** | 5 pares `time_total` − `X-APE-Upstream-Ms` | total 709–807 ms · upstream 709–806 ms · **Δ 0,3–1,4 ms** ≤ pre 31–51 ms (`BASELINE.md:215`) | **PASS** |
| **G11 Red** | `sysctl` + `ip route show table all` | `bbr` · `fq` · `tcp_fastopen=3` · `tcp_slow_start_after_idle=0` ✓ · **`rto_min` = 0 rutas** (baseline S8: 3 rutas con `rto_min lock 40ms`, `state-snapshot.txt:29-31`) | **FAIL** |
| **Deploy paridad** | `sha256sum` 10 destinos vs repo | **10/10 idénticos** (header 23b25b03 · uri_rebase 393635c2 · wake d9c6b65d · gateway 360e4097 · rebase_lib f813b1cc · uhd b02fbe28 · obs afa003ad · lab_api c4572679 · luatest 7f5be265 · meta-plane 6b3c71e7) | **PASS** |
| **nginx** | `systemctl show` + `nginx -t` | `MainPID=3801145` **sin cambio** · `NRestarts=0` · `nginx -t` OK | **PASS** |
| **Rollback** | `find /var/backups/ape-deploy/20261028T093843Z` | **10 ficheros** (`etc/nginx/{lua/*.lua,conf.d/50-ape-meta-plane.conf}`) · sin `SHA256SUMS` | **PASS** |

## 2. G6 en detalle (camino 4K y excepción de producto)

- **Servidos 200** en los 4 fixtures (antes 403 `private_range_blocked`; el fix `t35` cambió el host de `/cdn/` a uno no privado). **`t35-post` (09:49) == captura nueva (19:17)**: mismos sha256 en los 4 pares.
- **Pre-deploy 10-26 vs post**: el camino 4K difiere **sólo** en (a) el marcador ampliado a `…;mode=4k;src=<real>;can8k=0` (cambio intencional del deploy) y (b) el host de rebase (`127.0.0.1:8088` → IP pública, efecto del fix de harness). La estructura HLS (`VERSION`, `STREAM-INF`, `CODECS`, `RESOLUTION`, URIs de variantes) es la misma.
- **4K L153 → `4k:1`** (sin 8K) y **8K L153 → `4k:1`** verificados en la matriz. **4K L183 → 8K con `src=3840x2160;can8k=1`** verificado a nivel de módulo (la captura no trae fixture 4K-L183 y el flag vivo es `uhd8k=0`, por eso la matriz `declare_auto` da 4K: se necesitan las dos llaves).

## 3. G11 en detalle (único FAIL)

- Baseline documentado: **3 rutas** con `rto_min lock 40ms` (`91.208.115.0/24`, `149.18.45.0/24`, `172.110.220.0/24`) en `IPTV_v5.4_MAX_AGGRESSION/net-shield/wireguard/AUDIT_2026-04-21/state-snapshot.txt:29-31`.
- Hoy: `ip route show table all | grep -c rto_min` = **0** (30 rutas, todas las tablas). `bbr`/`fq`/`fastopen=3`/`slow_start_after_idle=0` sí están.
- **No es atribuible al deploy**: el deploy sólo escribe `/etc/nginx/{lua,conf.d}` (sin comandos de ruta). Es deriva de red previa; se reporta como FAIL del gate, no como regresión del cambio.

## 4. Veredicto global y rollback

**FAIL** — 13 gates PASS, **1 FAIL (G11)**. No se suaviza: el criterio escrito exige FAIL global con cualquier FAIL.

**Rollback:** disponible y verificado (10 ficheros del stamp `20261028T093843Z`). **No lo recomiendo** por G11: revertir nginx no restaura rutas (`rto_min`) y desharía el fix de UHD-09 sin ganancia. Recomendación: mantener el deploy, y que el dueño de red reponga/valide `rto_min lock 40ms` (o declare el baseline obsoleto) antes de cerrar Fase 0. Si se prefiere la lectura estricta del contrato, el rollback es una orden de un solo paso con el backup ya verificado.

## 5. Evidencia de esta corrida

`postdeploy_remote6.sh` y `postdeploy_remote7.sh` (LF, `ssh bash -s`, solo lectura) · `gates_remote.log` (salida cruda remota) · `g6_module_cases.log` (5 casos + flag off) · captura `cases/20261028T191735Z.json` + `capture.log` · hashes en este informe.
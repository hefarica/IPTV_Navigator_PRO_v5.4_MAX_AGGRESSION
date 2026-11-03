# POST-DEPLOY GATES · Fase 0 B-01+B-02 — veredicto **FAIL** (sólo G11; deploy correcto)

**Tarea:** t31 (attempt 4) · **Auditor:** `s9-player-compat` (no-autor del código) · **Fecha:** 2026-10-28
**Deploy:** commit `2f8861cf` · backup `/var/backups/ape-deploy/20261028T093843Z` (10 ficheros) · **ventana:** 19:21–19:23Z
**Host:** `ubuntu-2gb-ash-1` (178.156.147.234) · **solo lectura** (0 escrituras en VPS; 0 deploy/reload/commit desde esta auditoría)
**Harness:** fix `t35` (servidos 200) · captura post de esta corrida: `cases/20261028T192138Z.json` · baseline post-fix `t35-post` · módulo: `g6_module_cases.log`
**Nota de alcance:** la paridad 10/10 se mide contra el **commit desplegado `2f8861c`** (no contra el worktree sucio: hay `_vps_stage/nginx/meta-plane.conf` modificado y `ape_attr.lua` nuevos por otra tarea en curso, **no desplegados**).

## 1. Tabla de gates

| Gate | Comando | Resultado real | Veredicto |
|---|---|---|---|
| **G3 Guard** | `node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs` | **exit 0** · `VEREDICTO: PASS_WITH_DECLARED_RISK blocker=0 high=3 info=1` · UHD-09 resuelto; highs = UHD-04/UHD-10/UHD-11 (matriz 8K forzado, `latent`) | **PASS** |
| **G4 Selftest** | `… --selftest` | **PASS (8/8)**, exit 0 | **PASS** |
| **G5 luatest** | `curl 127.0.0.1:8088/_ape/luatest` | `expected:88, asserts_ok:true, fail:0` | **PASS** |
| **G6 Captura post** | `capture_uhd.mjs --label post` | exit 0 · pares=4 · filas_lua=20 · **servidos 200** · **idéntica a `t35-post`** (4/4 sha256) | **PASS** |
| **G6bis Casos** | `lua5.1` con `/etc/nginx/lua/ape_uhd.lua` (`allow_8k=true`) | **4K L183 → 8K** `declared=7680x4320;…;src=3840x2160;can8k=1` · **4K L153 → 4K** · **8K L153 → 4K** · 8K L183 → 8K · 1080 AVC → 4K · flag `uhd8k=0` → 4K | **PASS (5/5)** |
| **G7 /cdn/** | `curl` público 443 | `manifest=200` · `ts=404` · `m4s=404` · `mp4=404` | **PASS** |
| **G8 Listas** | `sha256sum` + `stat` | `APE_LISTA_4K` `a464a0c3…081b`/140.555.650 B/2026-10-26 19:55:49 · `…_CDN` `db2d034e…2ab8`/160.845.954 B/08:23:18 — **idénticos** al baseline t30 | **PASS** |
| **G9 health** | `curl /_ape/health` | 200 · `ok:true`, `shared_dicts:true`, `upstreams_down:0` · `"uhd":{…}` tras `checks` y antes de `plane`/`ok` (sin reordenar) | **PASS** |
| **`/_ape/uhd`** | loopback + 443 | 200 `{can8k_last,off,ts,uhd8k,uhd4k,mode_last,ok}` · contadores reales: `off` **1242→1243**, `uhd4k=19` · **443 → 404** | **PASS** |
| **G10 TTFB** | 5 pares `time_total` − `X-APE-Upstream-Ms` | total 696–1105 ms · upstream 694–1104 ms · **Δ 0,8–1,9 ms** ≤ pre 31–51 ms (`BASELINE.md:215`) | **PASS** |
| **G11 Red** | `sysctl` + `ip route show table all` | `bbr` · `fq` · `tcp_fastopen=3` · `tcp_slow_start_after_idle=0` ✓ · **`rto_min` = 0 rutas** · **subredes IPTV `91.208.115/24`, `149.18.45/24`, `172.110.220/24` ausentes** (0) | **FAIL** |
| **Deploy paridad** | `sha256sum` 10 destinos vs `HEAD:2f8861c` | **10/10 idénticos** (header 23b25b03 · uri_rebase 393635c2 · wake d9c6b65d · gateway 360e4097 · rebase_lib f813b1cc · uhd b02fbe28 · obs afa003ad · lab_api c4572679 · luatest 7f5be265 · meta-plane 6b3c71e7) | **PASS** |
| **nginx** | `systemctl show` + `nginx -t` | `MainPID=3801145` **sin cambio** · `NRestarts=0` · `nginx -t` OK | **PASS** |
| **Rollback** | `find /var/backups/ape-deploy/20261028T093843Z` | **10 ficheros** · sin `SHA256SUMS` | **PASS** |

## 2. G11 en detalle (único FAIL)

- La ruta por defecto y `wg0` **sí** llevan `initcwnd 400 initrwnd 400` (doctrina S8), pero **no hay ninguna ruta con `rto_min lock 40ms`** (`ip route show table all | grep -c rto_min` = **0**).
- Las **3 subredes IPTV** del baseline (`91.208.115.0/24` line.tivi-ott, `149.18.45.0/24` x1megaott, `172.110.220.0/24` ky-tv.cc) **no están presentes** en ninguna tabla (`grep -cE` = 0). Baseline: `IPTV_v5.4_MAX_AGGRESSION/net-shield/wireguard/AUDIT_2026-04-21/state-snapshot.txt:29-31`; doctrina: `initcwnd=400 + rto_min lock 40ms per IPTV subnet` (`.agent/skills/shielded_architecture_immutable/VPS_SHIELDED_MODULES.md:287`, `.agents/artifacts/ARTIFACT_NGINX_STREAMING_RUNBOOK.md:39`).
- **No es atribuible al deploy**: el deploy sólo escribe `/etc/nginx/{lua,conf.d}` (sin comandos de ruta). Es deriva de red previa; se reporta como FAIL del gate, no como regresión del cambio.

## 3. Veredicto global y rollback

**FAIL** — 13 gates PASS, **1 FAIL (G11)**. No se suaviza: el criterio escrito exige FAIL global con cualquier FAIL.

**Rollback:** disponible y verificado (10 ficheros del stamp `20261028T093843Z`). **No lo recomiendo por G11**: revertir nginx no repone rutas ni `rto_min`, y desharía el fix de UHD-09 sin ganancia. Recomendación: mantener el deploy y que el dueño de red reponga las 3 rutas IPTV con `rto_min lock 40ms initcwnd 400 initrwnd 400` (o declare el baseline obsoleto) antes de cerrar Fase 0. Si se prefiere la lectura estricta del contrato, el rollback es de un paso con el backup ya verificado.

## 4. Evidencia de esta corrida

`postdeploy_remote8.sh` y `postdeploy_remote9.sh` (LF, `ssh bash -s`, solo lectura) · `gates_remote.log` (salida cruda) · `g6_module_cases.log` (5 casos + flag off) · captura `cases/20261028T192138Z.json` + `capture.log` · hashes en este informe.
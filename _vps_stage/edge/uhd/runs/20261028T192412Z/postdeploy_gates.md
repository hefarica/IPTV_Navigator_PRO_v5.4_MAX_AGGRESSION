# Puerta POST-deploy · Fase 0 REA — gates G3-G11 + /_ape/uhd + paridad

**Tarea:** `t31` (attempt 5) · **Ventana (UTC):** 2026-10-28T19:24:12Z → 19:27Z · **Host:** `ubuntu-2gb-ash-1` (178.156.147.234)
**STAMP:** `20261028T192412Z` · **Autor:** `s7-sre-secops` (no-autor del código desplegado)
**Modo:** solo lectura. **0 mutaciones** (0 deploy, 0 reload, 0 edición, 0 commit).

**VEREDICTO GLOBAL: PASS CON 3 DESVIACIONES DECLARADAS + 1 NOT_RUN.** El deploy **funciona** y **no se recomienda rollback**; pero **la paridad 10/10 NO se cumple (9/10)** y dos sub-casos de G6 no son verificables con los flags vivos.

## 1. Tabla de gates

| Gate | Comando / sonda | Resultado | Veredicto |
|---|---|---|---|
| **Deploy** | `sha256sum /etc/nginx/lua/*.lua` + conf vs repo | **ape_uhd.lua `b02fbe28ad2b…` == repo** ✓ · 8 lua más ✓ · **`50-ape-meta-plane.conf` desplegado `6b3c71e7…` (11 224 B) ≠ repo `4b5f9f02…` (11 867 B)** | **PARCIAL 9/10** |
| **nginx** | `nginx -t` · `systemctl show nginx` | `syntax is ok` · **MainPID=3801145** (mismo desde 06:30:40Z) · **NRestarts=0** · config cargada contiene `/_ape/uhd` | **PASS** (reload sin restart) |
| **G3 Guard** | `node uhd_doctrine_guard.mjs` | **exit 0** · `VEREDICTO: PASS_WITH_DECLARED_RISK blocker=0 high=3 info=1` (UHD-09 **resuelto**) | **PASS** |
| **G4 Selftest** | `node … --selftest` | **exit 0** · `SELFTEST: PASS (8/8)` | **PASS** |
| **G5 luatest** | `curl 127.0.0.1:8088/_ape/luatest` | **200** · `expected=88 asserts_ok=true fail=0` — **N=88, sin cambio** respecto de PRE | **PASS** |
| **G6 captura** | `node capture_uhd.mjs --label post` | **exit 0** · `pares=4 filas_lua=20 sondas=0` → `cases/20261028T192457Z.json` | **PASS (captura)** |
| **G6 paridad de cuerpo vs pre** | `cmp` de `served_body` PRE vs POST | **NOT_RUN**: el PRE de t30 (`cases/20261028T093327Z.json`) sirvió **`{"error":"private_range_blocked"}`** en los **4** pares ⇒ no contiene manifests y no sirve de baseline | **NOT_RUN** |
| **G6 comportamiento** | `lua_matrix` PRE→POST (módulo ejecutado con lua5.1) | `M3_8k_L153`: 8k→**4k** ✓ · `M2_master4k`: 8k→**4k** ✓ · `M6_hev1`: 8k→**4k** ✓ · `M2+pq`: 8k→**4k** ✓ · **`M4_8k_L183`: 8k→4k** ✗ (se esperaba **8K**) | **PARCIAL** (ver D2) |
| **4K L183 → 8K con `can8k=1;src=3840x2160`** | marcador en `served_body` | **no aparece**: ningún fixture es 4K L183 y `uhd8k=0` bloquea la declaración | **NOT_RUN** (D2) |
| **G7 edge** | `/cdn/…/3.m3u8` y `.ts/.m4s/.mp4` | m3u8 **200** · `.ts` **404** · `.m4s` **404** · `.mp4` **404** | **PASS** |
| **G8 listas** | `sha256sum` + `stat` de las 2 listas | `a464a0c3…081b` 140 555 650 B **2026-10-26 19:55:49Z** · `db2d034e…2ab8` 160 845 954 B **08:23:18Z** — **idénticos a t30** | **PASS** |
| **G9 health** | `curl 127.0.0.1:8088/_ape/health` | **200** · `ok=true` · `checks.shared_dicts=true` · `checks.upstreams_down=0` · objeto **`uhd` presente** | **PASS** con D3 |
| **Nuevo `/_ape/uhd`** | loopback 8088 + prueba por 443 | loopback **200** `{"can8k_last":0,"off":1279,"ts":…,"uhd8k":0,"uhd4k":25,"mode_last":"off","ok":true}` · **443 → 404** | **PASS** |
| **Contadores reales** | `/_ape/uhd` antes/después de tráfico `/cdn/` | `off` **1259 → 1279** · `uhd4k` **19 → 25** | **PASS** |
| **G10 TTFB** | 9 muestras: `TST − X-APE-Upstream-Ms` | **p50 = 34,8 ms** (min 32,4 / max 43,6) · banda PRE de `docs/edge/BASELINE.md:215` = **31–51 ms** | **PASS** (dentro de banda) |
| **G11 red** | `sysctl` + `ip route show table all` | `bbr` · `fq` · `tcp_fastopen=3` · `slow_start_after_idle=0` ✓ · **`rto_min`: 0 rutas** | **PARCIAL** (ver D4) |
| **Rollback** | `find /var/backups/ape-deploy/<stamp>` | `/var/backups/ape-deploy/20261028T093843Z/` con **10 ficheros** (incluye `ape_uhd.lua` 5 320 B previo y conf 10 941 B) | **PASS** |

## 2. Desviaciones declaradas (sin suavizar)

**D1 · Paridad 9/10, no 10/10 — causa: drift del REPO posterior al deploy.**
Desplegado: `50-ape-meta-plane.conf` = **`6b3c71e76ae4…`, 11 224 B, mtime 2026-10-28 09:39:15Z** (= el hash que firmó `t29`).
Repo hoy: `_vps_stage/nginx/meta-plane.conf` = **`4b5f9f02a3ec…`, 11 867 B, 253 líneas, mtime 2026-10-28 19:19:00Z** (≈5 min antes de esta puerta).
⇒ La diferencia **no la produjo el deploy** (lo desplegado es lo firmado); la produjo **una edición local posterior**. **Riesgo real:** un redeploy ciego empujaría un conf que nadie ha validado. **No se tocó** (prohibido en esta tarea).

**D2 · Los dos sub-casos de 8K no son verificables con los flags vivos.**
`GET /_ape/flags` → **`"uhd8k":"0"`** (además `uhd_auto=1`, `uhd4k=1`, `uhd_pq=0`). El gateway pasa `allow_8k = flag("uhd8k")` ⇒ `can_declare_8k` **siempre false** ⇒ **el módulo declara 4K aunque la fuente y el nivel soporten 8K**. Por eso `M4_8k_L183` da **4k** y no hay ningún marcador `can8k=1`. **El código hace lo que dice su contrato con el flag apagado; la expectativa del enunciado asume el flag encendido.** No es regresión: es **decisión de flag**. Para verificar «4K L183 → 8K con `can8k=1`» y «8K L183 → 8K» hay que activar `uhd8k=1` en una ventana autorizada — **fuera de alcance aquí**.

**D3 · `uhd` no es la última clave de `/_ape/health`.**
Orden medido: `ts, checks, qoe, **uhd**, plane, ok`. El objeto `uhd` **existe** y los campos previos conservan su orden relativo, pero **no queda al final** (`plane` y `ok` van después). El requisito literal «`uhd` al final» **no se cumple**.

**D4 · `rto_min` no está en las rutas.**
`ip route show table all | grep -c rto_min` → **0**. La afirmación previa de «rto_min lock 40 ms en 3 /24» **no se reproduce** en esta medición. Los 4 sysctls de G11 sí están correctos. No es consecuencia de este deploy.

## 3. Por qué NO se recomienda rollback

El deploy **cumple su función**: el blocker UHD-09 desapareció (G3 0), el módulo nuevo está **vivo** (`lua_matrix` cambia 5 filas, `/_ape/uhd` responde con contadores reales y crecientes, `X-APE-UHD: 4k:1` aparece en los manifests servidos), el edge no se rompió (G7), las listas no se tocaron (G8), la latencia no se degradó (G10 dentro de banda) y la red sigue igual (G11 sysctls). Las 3 desviaciones son **de enunciado/repo**, no del binario desplegado. **Rollback disponible** si el capitán lo decide: `/var/backups/ape-deploy/20261028T093843Z/` (**10 ficheros**) + `rollback.sh <stamp> --yes`.

## 4. Evidencia cruda

`state.sh/.log` (hashes, nginx, 5 endpoints, listas, rollback, red) · `detail.sh/.log` (health completo, `nginx -T`, conf, backup) · `g10_g11.sh/.log` (flags, TTFB p50, rto_min, contadores) · `G3_guard_post.log` · `G4_selftest_post.log` · `G6_capture_post.log` · `cmp_g6.js` (diff de pares y `lua_matrix`) · `stamp.txt` · `postdeploy_gates.json`.
Captura POST: `_vps_stage/edge/uhd/cases/20261028T192457Z.json` · captura PRE (degenerada): `cases/20261028T093327Z.json`.

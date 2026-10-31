# DEPLOY_PENDING_SINCE_25OCT — preflight de commit/deploy (medido 2026-10-30)

> **Estado:** NO se ha hecho commit, push ni deploy en esta tarea (X2/t23). Este documento es un **preflight medido** para que el owner decida. Deploy de producción: **NO-GO** hasta cerrar F-01/F-05/F-09.
> **Repo:** `IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION` · **Rama:** `feat/adb-generic-visual-enhancement-installer` · **HEAD:** `083b07b` · **origin/feat:** `083b07b` (ahead 0 / behind 0).

## 1 · Lo que dice el brief vs lo medido hoy

| Dato | Brief | Medido (2026-10-30, `git` local) | Nota |
|---|---|---|---|
| commits desde 2026-10-25 | 48 | **46** (`git rev-list --count --since=2026-10-25 HEAD`; idéntico en `origin/feat/...`) | El brief citaba 48 al redactarse; hoy son 46. No se reescribe la historia. |
| cambios sin commit | 85 | **85 entradas** (`git status --porcelain`) | coincide |
| tracked modificados | 29 | **29** (`git diff --stat`) | coincide |
| líneas tracked | +1.876 / −3.031 | **+1.876 / −3.031** | coincide exacto |
| untracked | — | **56 entradas** | 85 = 29 tracked + 56 untracked |

Los 2 commits de ARA-X (`7fd1da6` 108 archivos + `083b07b` 7 archivos) **ya están en `origin/feat/...`**: `ara-x/` tiene **115 archivos trackeados**. Lo único de ARA-X fuera de git es `ara-x/evidence/` (10 archivos, 4.715.998.572 B), que **no debe commitearse**: son capturas de proveedor con el par cuenta/clave en el path (V3-F-01) y salidas de 572/568 MB. `ara-x/.gitignore` ignora `evidence/*.m3u8|.m3u8.gz|.bin`; el `T0_…json` de evidencia queda untracked y tampoco se commitea.

## 2 · Partición obligatoria (cada grupo: estado · gate · decisión)

### (A) ARA-X — **VERIFICADO y ya commiteado/pusheado**
- **Commits:** `7fd1da6` (ADC/policy/list/staged sync, 108 archivos) · `083b07b` (hook de integración + verificación 100/40k, 7 archivos).
- **Estado git:** `ara-x/` = 115 archivos trackeados, sin modificaciones pendientes; `ara-x/evidence/` untracked (excluido).
- **Verificado:** V1-R PASS (18 PASS · 0 FAIL · 5 NOT_RUN · auditorías 16/16) · V2 PASS (2/2 listas, 78 checks) · V3-R2 PASS reparables de repo · C1 council PASS repo/staged · X1 23/23 + 37/37 (`git apply --check` exit 0).
- **No-deploy:** `ara-x/vps/**` es staged; **nada desplegado** en el VPS.
- **Gate:** `node ara-x/scripts/verify/run_static_checks.js` exit 0 + `node ara-x/scripts/e2e/run_e2e.js --list all` + `node ara-x/scripts/security/scan_secrets.js`. Commit: **ya hecho**; evidencia NO se commitea.

### (B) APP Android — **SIN BUILD · NO COMMITEAR sin gate**
- **Tracked modificados (8):** `IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/app/{build.gradle.kts, src/main/assets/shaders/ape_enhance_fragment.glsl, src/main/java/com/ape/crystalagent/{AgentService,ApePlayer,Config,MainActivity,QoEReporter,SettingsApplier}.kt}` · **+474/−69**.
- **Untracked (3):** `assets/shaders/crystal_uhd_fragment.glsl` · `java/com/ape/crystalagent/AraStatus.kt` · `java/com/ape/fluid/`.
- **Estado:** sin `gradlew assembleDebug/assembleRelease`, sin APK, sin instalación/prueba en ONN 4K.
- **Gate:** build Gradle reproducible + `adb install` autorizado + smoke en device + revisión de permisos. **No-deploy** (la app no se instala desde aquí). Decisión: **no commit** en X2.

### (C) FRONTEND — **SIN TESTS · NO COMMITEAR sin claim**
- **Tracked modificados (7):** `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` (**+987**) · `frontend/js/m3u8_ultimate_generator.py` (+4/−?) · `frontend/js/vps-ops-panel.js` · `frontend/vps/resolve.php` · **3 backups borrados** (`cf_worker/src/index.js.backup`, `index.js.backup.v15`, `export-module.BACKUP_LEGACY.js`).
- Agregado frontend: **+991 / −2.842** (los −2.842 son backups legacy; el cambio funcional del generador es +987).
- **Estado:** sin tests del generador; X1 entregó parche opt-in **staged** (`ara-x/integration/ara-x-hook.patch`, `git apply --check` OK) que **no está aplicado**.
- **Gate:** `node -c` de los 3 sagrados + regresión del generador + claim explícito sobre `frontend/**`. Decisión: **no commit** en X2; aplicar solo con claim y tras tests.

### (D) LAB / Excel 26/10 — **SIN RE-VERIFICAR · NO COMMITEAR**
- **Artefactos presentes (untracked):** `deliverables/LAB_2026-10-26/APE_M3U8_LAB_v8_FIXED_CERTIFIED.xlsm` (3.425.790 B) · `deliverables/VALIDACION_ENTREGA_2026-10-28/lab/APE_M3U8_LAB_v8_FIXED_CERTIFIED.xlsm` · `_inbox_EQUIPO_ADN/EQUIPO_ENTERPRISE_10_COUNCIL_ADN/ADN_Organizacional.xlsx` (99.719 B) · `_vps_stage/lab/ADN_PIN.json`.
- **Estado:** libro LAB del 26/10 **no reabierto/reverificado** en esta campaña (no hay build Excel, no hay macro-ejecución). No hay `.xls*` trackeados modificados en `git status` al corte.
- **Gate:** abrir LAB en Excel, verificar perfiles P0–P5 y macros, comparar contra D2/I5, y solo entonces decidir. Decisión: **no commit**; no empaquetado en el ZIP ARA-X (fuera de `ara-x/`).

### (E) `_vps_stage` / VPS — **SIN `nginx -t` · NO-DEPLOY**
- **Tracked modificados (3):** `_vps_stage/lua/ape_gateway.lua` (+43/−2) · `_vps_stage/nginx/meta-plane.conf` (+27) · `_vps_stage/public/ape-meta-public.conf` (+4) · agregado **+72/−2**.
- **Untracked (10 entradas):** `_vps_stage/{edge,lab,lua,nginx,ops,tests}/…` (p. ej. `lua/ape_attr.lua`, `lua/ape_lastgood.lua`, `nginx/ape-edge-watchdog.sh`, `nginx/cache-first-edge.conf`, `nginx/snippets/`, `tests/regen_headless/_t106/`).
- **Mapa de deploy activo:** **`_vps_stage/deploy`** (`inventory.sh` → `preflight.sh` → `dry-run.sh` → `validate.sh` → `deploy.sh --apply --yes` → `verify.sh` → `rollback.sh`), con backup + `nginx -t` + reload + rollback automático. **Nunca el mapa legacy.**
- **Estado:** `nginx -t` **NOT_RUN** (nginx no instalado local; fragmentos requieren el nginx.conf real) · deploy **no ejecutado** · **0 escrituras al VPS**.
- **Gate:** ventana autorizada + backup + `nginx -t` sobre config real + canary + rollback probado + F-01/F-05/F-09 cerrados. Decisión: **no commit/no deploy** en X2.

### (F) Basura / docs / backups — **NO SE COMMITEAN**
Ejemplos medidos hoy (untracked, seleccionados): `c\357\200\272tmplogcat_dump.txt` (nombre corrupto de `c:\tmplogcat_dump.txt`) · `UsersHFRCDesktop…toolscrystal-upscale_work.qsv_probe.mkv` · `_t16tmp/` · `_incoming/` · `_inbox_EQUIPO_ADN/` · `_coord/` · `_backups/` · `.playwright-mcp/` · `.dsh/` · `deliverables/` (raíz) · `IPTV_v5.4_MAX_AGGRESSION/deliverables/` · `_map_lua_modules.py` · `verificacion/` · `regen_multilist_report.json` · `tools/crystal-upscale/`.
También untracked (decisión de owner, no basura automática): `audit/EQUIPO_10_*`, `.agents/reports/*`, `.claude/commands/equipo-10-adn.md`, `docs/**`, `contracts/ownership_scopes.json`.
**Regla:** nunca `git add -A`; estos paths no entran en ningún commit de esta campaña y no están en el ZIP ARA-X.

## 3 · Política de commit (quirúrgica, por grupo)

1. **No** hacer un commit global. **No** barrer los 29 tracked ajenos a `ara-x`.
2. `ara-x/` ya está commiteado y pusheado (`7fd1da6`, `083b07b`); **no repetir**.
3. Si el owner autoriza B/C/D/E, un commit **por grupo** con paths explícitos (`git add <lista>`), mensaje `type(scope)` y evidencia del gate de ese grupo. Nunca `git add -A`/`git add .`.
4. **Push solo de rama** (`feat/adb-generic-visual-enhancement-installer`) y **solo tras confirmación** del owner. Nada de `--force`.
5. `ara-x/evidence/**`, `.mkv`, `*.xlsm` de LAB, `_t16tmp`, `_incoming`, etc.: **fuera de git** (y la evidencia fuera del paquete por credenciales/tamaño).
6. Este preflight **no** ejecuta commit/push/deploy.

## 4 · Deploy: NO-GO y condiciones de paso

**NO-GO** mientras sigan abiertos: **F-01** (CRITICAL: par cuenta/clave en path de las 10.631 URLs + CORS `*` + cache pública), **F-05** (clave global Lua sin store por dispositivo) y **F-09** (R3-R4 deny comentado, R3-R5 `/cdn/` sin allowlist, R3-R6/R3-R7). La redacción de F-02 **no mitiga F-01**.

**Para pasar a GO (owner/producción):** rotar el par en el proveedor · quitar ACAO/ACAM/ACAH/ACAE · `Cache-Control: private` + `X-Robots-Tag` · URLs firmadas · store de claves por dispositivo · ventana con backup · `nginx -t` real · canary shadow · rollback probado · mapa **`_vps_stage/deploy`** (nunca legacy). Nada de esto se ejecuta aquí.

## 5 · Comandos de este preflight (reproducibles)

```powershell
git rev-parse --short HEAD
git status -sb
git rev-list --count --since=2026-10-25 HEAD
git diff --stat
git status --porcelain
git log --oneline --since=2026-10-25
git show --stat 7fd1da6; git show --stat 083b07b
```

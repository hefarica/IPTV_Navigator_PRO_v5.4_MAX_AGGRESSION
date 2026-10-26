# INFLIGHT INVENTORY — trabajo en vuelo (foto 2026-10-25T22:45-05:00)

> **Qué es:** inventario **read-only** de todo lo que está en movimiento en este repo y en sus
> alrededores, para que los demás auditores (`10-excel`, `20-json`, `30-app`, `40-vps`, `50-listas`,
> `90-matriz`) sepan **qué no tocar** y **qué veredicto puede quedar obsoleto mientras lo escriben**.
>
> **Quién:** `coord-sesiones` · equipo `alineacion-omni-crystal-1025` · tarea `t2` (attempt
> `1f268383-adc3-4bab-957f-ed686efd32ca`), lane de t3.
> **Protocolo:** [`docs/ops/session-coordination/COORDINATION_PROTOCOL.md`](../../../../docs/ops/session-coordination/COORDINATION_PROTOCOL.md)
> · **Tablero:** [`.agent-teams/session-board/BOARD.json`](../../../../.agent-teams/session-board/BOARD.json)
>
> **Regla de lectura de este documento:** cada número lleva su comando y su ventana temporal. Los
> recuentos **caducan**: se tomaron entre `22:40` y `22:45` hora local. Si necesitas citar algo, re-mídelo.

---

## 0 · Atestación read-only (qué se ejecutó y por qué no muta nada)

| Comando | Naturaleza | ¿Muta? |
|---|---|---|
| `git status --short` / `git log` / `git diff --stat` / `git diff --numstat` | lectura de índice y worktree | **no** |
| `Get-ChildItem`, `Get-Item`, `Get-FileHash`, `Test-Path`, `Get-Content` | lectura de FS | **no** |
| `Get-Process`, `Get-CimInstance Win32_Process` | lectura de tabla de procesos | **no** |
| `node -e "JSON.parse(...)"` sobre artefactos propios | parseo, sin IO de escritura | **no** |
| `node tools/session-guard.js` | **no se ejecutó ningún subcomando** (ni `claim`, ni `guard`, ni `release`) | **no** |

**Cero SSH, cero `curl`, cero `scp`, cero `nginx`, cero `systemctl`, cero Excel COM, cero escritura fuera
de** `docs/ops/session-coordination/**`, `.agent-teams/session-board/**`,
`audit/alignment/2026-10-25/00-inflight/**` **y el prepend en** `.agent/COORDINATION.md` (con backup previo;
hash del sufijo verificado == hash original).

**Lo que este documento NO puede afirmar:** qué hay desplegado ahora en el VPS. Eso exige lectura remota
(lane `t7`, `vps-edge`) y aquí no se hizo. Lo de §6 son **marcas locales** de despliegue, no estado remoto.

---

## 1 · Sesiones DSH — 14 grupos de workspace, 28 sesiones en el grupo IPTV

**Fuente:** `$env:DSH_HOME = C:\Users\HFRC\AppData\Local\DSH_HERRAMIENTAS\DSH_BLUEGREEN_021\home`
· `$env:DSH_SESSION_ID` de esta sesión = `be3f50f9-ee2d-4be4-a3e9-54e5ad8e2753` (coincide con el `id` de
`coord-sesiones` en `team.json`: consistencia confirmada).

### 1.1 Grupos de workspace (14)

| # | Grupo | Última actividad | Archivos | Bytes |
|---|---|---|---|---|
| 1 | `IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION` ← **este repo** | 2026-10-25T22:40:19 | 39 | 57.451.691 |
| 2 | `DSH_BLUEGREEN_021` (el propio `DSH_HOME`) | 2026-10-25T10:28:35 | 3 | 1.071 |
| 3 | `EQUIPO_ENTERPRISE_24_COUNCIL_ADN (28)` | 2026-10-24T07:42:35 | 40 | 60.320.616 |
| 4 | `arbitragex-v2-main (23)` | 2026-10-23T21:46:25 | 26 | 31.586.349 |
| 5 | `DSH_SMOKE_WORKSPACE` | 2026-10-21T22:40:57 | 5 | 520.107 |
| 6 | `DSH_SSE_DIAG_TEMP` | 2026-10-21T16:42:28 | 2 | 209.444 |
| 7 | `arbitragex-v2-main (17)` | 2026-10-21T09:06:09 | 472 | 606.719.164 |
| 8 | `DSH_RESCUE_20261018-083838-TEST_WORKSPACE_1792332293081` | 2026-10-18T09:05:03 | 3 | 1.238 |
| 9 | `DSH_RESCUE_20261018-083838-TEST_WORKSPACE_B_1792332293081` | 2026-10-18T09:05:03 | 2 | 868 |
| 10 | `.dsh-vscode-server` | 2026-10-18T08:57:15 | 6 | 2.337 |
| 11 | `DSH_WS_MATRIX_A_1792308719091` | 2026-10-18T02:31:59 | 1 | 411 |
| 12 | `DSH_WORKSPACE_TEST_A_1792305091338` | 2026-10-18T01:46:02 | 1 | 509 |
| 13 | `APLICACION_CONTROL_PAGOS_MULTIINGENIO_V6_1_6_FULL_WIDTH` | 2026-10-14T21:12:29 | 13 | 12.555.625 |
| 14 | `ARBI` | 2026-10-14T03:22:47 | 10 | 10.146.269 |

> **Corrección de contexto:** el enunciado decía "14 sesiones". Lo medido es: **14 grupos de workspace**,
> y **solo el grupo IPTV contiene 28 directorios de sesión**. Usar "14 sesiones" subestima el trabajo en
> vuelo por un factor de 2 y mezcla repos distintos. Los grupos 4, 7, 8, 9, 11, 12, 13, 14 **no son este
> repo**: un lock de coordinación global no debe cubrirlos.

### 1.2 Sesiones del grupo IPTV (28) — estado y actividad

`state = retired` significa "id presente en `.agent-teams/retired-members.json`" (6 ids). `tracked` = existe
directorio de sesión, sin garantía de que el proceso siga vivo. **No se descomprimió ningún
`session.v*.jsonl.zstd`**: solo metadatos de archivo (nombre, mtime, tamaño). Cero contenido de conversación.

| # | session_id | state | Última escritura | Files | Bytes |
|---|---|---|---|---|---|
| 1 | `e434ee7c-1bcd-4105-8704-ebfa081f59fd` | tracked | 2026-10-25T22:40:20 | 1 | 161.922 |
| 2 | `be3f50f9-ee2d-4be4-a3e9-54e5ad8e2753` | tracked | 2026-10-25T22:40:14 | 1 | 266.632 |
| 3 | `61110faf-94cf-4d4d-8670-a3a6ffded571` | tracked | 2026-10-25T22:32:45 | 1 | 769.218 |
| 4 | `b85a22df-a527-4c97-815f-30b729083b3b` | tracked | 2026-10-25T21:53:19 | 1 | 1.344.705 |
| 5 | `bae43fe5-d297-49bf-a2bb-64926499806b` | tracked | 2026-10-25T21:53:18 | 1 | 878.474 |
| 6 | `db97e35f-6ee1-47eb-96bc-0d023a0b0fd3` | tracked | 2026-10-25T21:53:17 | 1 | 636.451 |
| 7 | `f47411a8-35a6-4ca5-82a7-288636672d90` | tracked | 2026-10-25T21:47:48 | 2 | 1.545.275 |
| 8 | `bf0f1f81-50d8-463f-a3f8-90dc5d89774f` | tracked | 2026-10-25T21:26:41 | 1 | 1.017.558 |
| 9 | `2345fccb-6890-4ae7-b7ed-babf7c50b32c` | tracked | 2026-10-25T21:26:39 | 1 | 599.666 |
| 10 | `59b6338b-bf59-4d1d-a6d2-00a0492eff79` | tracked | 2026-10-25T21:26:02 | 2 | 2.846.809 |
| 11 | `da719d89-edff-4a48-b958-f5ebc2613a8e` | tracked | 2026-10-25T20:47:11 | 2 | 3.069.536 |
| 12 | `9bebd22d-12f7-43af-a6dd-386773dfa8b3` | tracked | 2026-10-25T20:42:19 | 2 | 3.874.704 |
| 13 | `d77387a6-bd70-4301-9d0b-9f1e943c3274` | tracked | 2026-10-25T20:42:11 | 2 | 4.405.553 |
| 14 | `2482f42b-697c-4827-bfdc-c52c8c633612` | tracked | 2026-10-25T20:39:44 | 2 | 3.032.861 |
| 15 | `4c3b8135-9a18-4bf9-a201-13a40e9af1f5` | tracked | 2026-10-25T20:35:30 | 2 | 3.125.181 |
| 16 | `51f4fade-4e79-473a-af65-c7db09e8fd29` | tracked | 2026-10-25T20:35:05 | 2 | 2.282.559 |
| 17 | `session-4d817efa-ef0c-42eb-a9d4-74d3ca7fa68a` | tracked | 2026-10-25T16:08:02 | 2 | 5.050.502 |
| 18 | `session-308ef426-bd0d-465c-915d-f1617e1a404f` | tracked | 2026-10-25T11:18:31 | 2 | 9.915.209 |
| 19 | `session-45c9b49b-932a-4ac7-b404-6848de9e6a87` | tracked | 2026-10-25T11:12:50 | 2 | 1.096 |
| 20 | `session-b09b0374-133b-47aa-b8c7-5305d723d258` | tracked | 2026-10-25T10:18:34 | 1 | 1.094.034 |
| 21 | `34c376a5-89ed-48c4-bced-16a57fc14b39` | tracked | 2026-10-24T16:23:47 | 1 | 322.272 |
| 22 | `b8b3d6bf-365e-4a2a-9b9a-fac6ed4eea60` | tracked | 2026-10-24T16:23:47 | 1 | 443.026 |
| 23 | `94658788-d06f-4a8c-bb9f-1af1af189d2c` | **retired** | 2026-10-25T17:27:59 | 1 | 852.319 |
| 24 | `b545384f-78e7-4f41-985e-f7801588c19e` | **retired** | 2026-10-25T14:59:57 | 1 | 3.382.502 |
| 25 | `e388016a-8477-4b21-b841-fe16dcd35163` | **retired** | 2026-10-25T14:24:01 | 1 | 2.383.225 |
| 26 | `ee6fa9c8-2b95-44bb-a18f-23f28530ca3c` | **retired** | 2026-10-25T13:56:14 | 1 | 2.785.306 |
| 27 | `0c7d9bd9-4659-4942-ae0f-1a359836f136` | **retired** | 2026-10-25T13:56:14 | 1 | 584.987 |
| 28 | `95c9a1a2-7873-412b-90ac-059107cf9d78` | **retired** | 2026-10-25T13:22:31 | 1 | 907.962 |

**Totales medidos:** 28 sesiones · 22 `tracked` · 6 `retired` · 39 archivos · **57.451.691 bytes**.
**Actividad en los últimos 30 min (antes de esta foto):** 3 sesiones (#1 `e434ee7c`, #2 esta, #3 `61110faf`).
**Ventana caliente 20:35–22:40:** 14 sesiones escribieron. Es decir: **el repo se está tocando ahora mismo**.

### 1.3 Identidades que sí se pueden afirmar (sin inventar)

| session_id | identidad conocida | fuente |
|---|---|---|
| `be3f50f9-ee2d-4be4-a3e9-54e5ad8e2753` | `coord-sesiones` (esta sesión) | `$env:DSH_SESSION_ID` + `team.json.members[]` |
| `e434ee7c-1bcd-4105-8704-ebfa081f59fd` | `excel-ssot` (idle) | `team.json.members[]` |
| `session-b09b0374-133b-47aa-b8c7-5305d723d258` | capitán del equipo | `team.json.captainSessionId` |
| resto (25) | **UNKNOWN** | no hay índice sesión→título expuesto; no se descomprimieron los `.jsonl.zstd` |

> **No se atribuye** ninguna de las 25 sesiones restantes a `dsh-lead` ni a la "DSH sesión VPS": no hay
> evidencia enlazable. Atribuir por tamaño o por hora sería fabricar.

---

## 2 · Equipos en `.agent-teams/` — activos vs archive

| Ruta | Tipo | team.json | Inbox | Última señal de vida | Veredicto |
|---|---|---|---|---|---|
| `alineacion-omni-crystal-1025/` | **activo** (este equipo) | 51.177 B | 0 archivos | 2026-10-25T22:42:06 | **ACTIVO** |
| `auditoria-roku-universal-rea/` | **activo** | 772.803 B | 9 archivos · 313.173 B | `inbox/captain.jsonl` **2026-10-25T22:45:00** | **ACTIVO AHORA** |
| `rea-recon/` | **activo** | 91.141 B | 3 archivos · 20.191 B | `inbox/captain.jsonl` **2026-10-25T22:43:37** | **ACTIVO AHORA** |
| `archive/media-fanout/` | archivado | 319.795 B | 4 archivos · 94.084 B | `team.json` 2026-10-25T21:25:12 | **ARCHIVADO** |
| `retired-members.json` | registro | 357 B · 6 ids | — | — | — |
| `session-board/` | **nuevo, de este equipo** | — | — | 2026-10-25T22:43 | tablero (t2) |

**Señal de vida = mtime del `inbox/captain.jsonl`**, no el mtime del `team.json` (que se reescribe por
cualquier cambio de estado). Con ese criterio, hay **3 equipos escribiendo en paralelo en este repo**
(`alineacion-omni-crystal-1025`, `auditoria-roku-universal-rea`, `rea-recon`).

**No se leyó el contenido de ningún `.jsonl` de inbox**: solo nombre, mtime y tamaño. Los inboxes son
canales privados de otros equipos.

---

## 3 · `git` — 17 modificados, 3172 borrados, 69 untracked (nada staged)

```
git status --short          → 3258 líneas:  17 M · 3172 D · 69 ??   (M: 0 staged)
git diff --stat             → 3189 files changed, 1318 insertions(+), 6685 deletions(-)
git diff --cached --stat    → (vacío)
HEAD                        → d322eb2  feat(contracts): contratos Crystal como DATOS con SHA-256 reales
rama                        → feat/adb-generic-visual-enhancement-installer
```

### 3.1 Archivos tracked modificados (17) — **son de otras sesiones, no se tocaron**

`numstat` = añadidas/borradas · `mtime` = última escritura observada.

| Área | Ruta | +/- | mtime | Atribución |
|---|---|---|---|---|
| PHP backend | `IPTV_v5.4_MAX_AGGRESSION/backend/cmaf_engine/modules/ai_super_resolution_engine.php` | +11/−22 | 22:00:45 | sesión desconocida (ledger: t40 tocó este módulo) |
| PHP backend | `IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php` | +300/−38 | 21:35:16 | **t28** (ledger §2: sha `0286551e…`→`20AC4B26…`) |
| PHP backend | `IPTV_v5.4_MAX_AGGRESSION/backup_master_v5.4_phantom_engine/backend/cmaf_engine/modules/ai_super_resolution_engine.php` | +11/−22 | 22:16:33 | desconocida (copia espejo) |
| PHP backend | `IPTV_v5.4_MAX_AGGRESSION/vps/cmaf_engine/modules/ai_super_resolution_engine.php` | +11/−23 | 22:16:33 | desconocida (copia espejo) |
| PHP backend | `IPTV_v5.4_MAX_AGGRESSION/vps/production_mirror/cmaf_engine/modules/ai_super_resolution_engine.php` | +11/−23 | 22:16:33 | **lock L-002 (t44)** |
| PHP backend | `IPTV_v5.4_MAX_AGGRESSION/vps/production_mirror/cmaf_engine/cmaf_engine/modules/ai_super_resolution_engine.php` | +11/−23 | 22:16:33 | **lock L-002 (t44)** |
| JS generador | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | **+427/−1** | 21:52:01 | **t29+t33+t36** (ledger: sha `2315184E…`) · **lock L-001 (t44)** |
| JS generador | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js` | +79/−0 | 20:09:30 | **"DSH lead (fuse A+B)"** (ledger §2) · **lock L-001** |
| JS generador | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/streaming/profile-solver-v9.js` | +40/−4 | 20:09:47 | **"DSH lead (fuse A+B)"** · **lock L-001** |
| JS generador | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-api-wrapper-integrated.js` | +10/−1 | 21:43:49 | desconocida · **lock L-001** |
| JS aux | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/vps-ops-panel.js` | +1/−1 | 21:40:05 | desconocida |
| PY generador | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/m3u8_ultimate_generator.py` | +2/−2 | 21:38:53 | desconocida |
| PHP resolver | `IPTV_v5.4_MAX_AGGRESSION/frontend/vps/resolve.php` | +3/−3 | 21:38:53 | desconocida |
| Lua VPS | `_vps_stage/lua/ape_gateway.lua` | **+172/−0** | 21:01:57 | **t46** (lock L-006) |
| Lua VPS | `_vps_stage/lua/ape_header.lua` | +128/−2 | 20:41:02 | **t46** (lock L-006) |
| Lua VPS | `_vps_stage/lua/ape_uri_rebase.lua` | +78/−2 | 20:41:08 | **t46** (lock L-006) |
| Test VPS | `_vps_stage/tests/fanout_concurrency.sh` | +23/−0 | 22:32:40 | **t46** |
| Coordinación | `.agent/COORDINATION.md` | **+74/−0** | 22:45:44 | **esta sesión** (`coord-sesiones`, prepend TABLERO VIVO) |

> **Nota de honestidad:** solo 6 de los 17 tienen atribución con evidencia documental (ledger §2 + locks).
> Las otras 11 se marcan **desconocida**: el `mtime` no identifica al autor. Cualquier entregable que
> afirme "esto lo tocó X" sobre esas 11 está fabricando.

### 3.2 Borrados (3172) — artefactos de build, **no restaurar**

| Grupo | Archivos borrados |
|---|---|
| `IPTV_v5.4_MAX_AGGRESSION/backend/upload-server/target/**` | 912 |
| `IPTV_v5.4_MAX_AGGRESSION/test_zip/target/release/**` | 910 |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/tools/stream_probe_server/**` | 776 |
| `IPTV_v5.4_MAX_AGGRESSION/backup_master_v5.4_phantom_engine/frontend/tools/**` | 572 |
| `IPTV_v5.4_MAX_AGGRESSION/test_zip/target/{.rustc_info.json,CACHEDIR.TAG}` | 2 |

**Riesgo:** un `git add -A` mete 3172 borrados en un commit y el siguiente `git checkout` deja el árbol con
el build destruido. **Regla:** nadie restaura ni commitea esto sin decisión del owner
(`COORDINATION_PROTOCOL.md` §6).

### 3.3 Untracked (69) — qué es de quién

| Grupo | Nº | Contenido | Dueño |
|---|---|---|---|
| `.agent-teams/` | 1 (dir) | los 3 equipos + archive + `session-board/` (nuevo) | mixto |
| `.agents/reports/deploy_*.json` | 32 | marcas de deploy 2026-06-16 → 2026-06-19 | histórico |
| `.agents/reports/freezeless-visual-master-council_*` | 3 | reportes del council (jun) | histórico |
| `.dsh/` · `.session/` | 2 (dirs) | estado de sesión + **locks de session-guard** | `dsh-lead` |
| `.playwright-mcp/` | 1 | dump de página | desconocida |
| `COORDENADAS_SESIONES.md` | 1 | **ledger humano de la otra sesión** | `dsh-lead` / REA-VPS |
| `_map_lua_modules.py` | 1 | script suelto | desconocida |
| `_vps_stage/**` (lab/lua/nginx/tests) | 16 | cache-first edge, prefetch, watchdog, 11 asserts JS + 2 `.sh` + 1 `.md` + `ADN_PIN.json` | **t44/t45/t46/t47** |
| `audit_teams_REA/` (no untracked: tracked) | — | ver §5 | otra sesión |
| `docs/REA_*.md` | 6 | forensia REA (APK, headers, diagnóstico) | **`rea-recon`** |
| `docs/evidence/` | 1 (dir) | `REA_R1` 5.79 MB + `REA_R2` 5.92 MB + `REA_R3_citation_audit.ps1` | **`rea-recon`** |
| `tools/crystal-upscale/` | 1 (dir) | upscaler offline | **lock L-003 (t47)** |
| `tools/session-guard.js` | 1 | **enforcement de locks** | `dsh-lead` |
| `"c：tmplogcat_dump.txt"` | 1 | nombre corrupto (fullwidth colon) — no tocar, no renombrar | desconocida |

---

## 4 · Procesos locales relevantes (foto)

| PID | Proceso | Arranque | WS | Qué es |
|---|---|---|---|---|
| 14964 | `node ... DSH_SIMPLE\runtime\...\dsh\lib\bin.js web --no-open --port 3090` | 25/10 10:14 | 1.671,9 MB | **la GUI DSH actual** (`http://127.0.0.1:3090`) |
| 740 | `node --import ...\DSH_GUARDIAN\bin\coherence-hook.mjs ...\.dsh-vscode\server\...\dsh\bin.js --profile web --host 127.0.0.1` | 25/10 10:09 | 14,8 MB | servidor DSH del VS Code (+ coherence hook) |
| 25372 | `rea-runtime\node-v24.22.1\...\rea.mjs mcp` | 25/10 17:53 | 15,5 MB | **servidor MCP REA** |
| 5972 | `rea-runtime ... --max-old-space-size=1024 ...` | 25/10 19:03 | 1,5 MB | worker REA |
| 12816 / 10904 | `dsh-subprocess-local\lib\runner.js -- pwsh.exe` | 25/10 22:42 | 54,9 / 55,6 MB | **ejecutores de shell de este turno** |
| 23204 | `dsh-subprocess-local\...\runner.js -- python ...consensus-pipeline\mcp_server` | 25/10 10:14 | 4,8 MB | plugin consensus-pipeline |
| 10592 / 16164 / 22628 | `desktop-commander` (npx) | 25/10 10:10 | 26,4 / 23,5 / 1,7 MB | MCP desktop-commander |
| 17024 | `claude-code-router ... serve --daemon-child` | 25/10 10:03 | 11,7 MB | CCR |
| 3428 | `@the-next-ai/ai-gateway` | 25/10 10:03 | 2,4 MB | gateway |
| 23888 | `CCR-ConfigStudio\HA\CCR-HA-Proxy.js` | 25/10 20:27 | 8,3 MB | proxy HA |
| 12876 | `node start.mjs` | 25/10 10:07 | 9,2 MB | desconocido (cwd no visible) |
| 22536 | `codex-primary-runtime ... artifact-tool` | 25/10 10:11 | 7,5 MB | runtime codex |

**Totales:** 17 procesos `node`, 7 `python`, 2 `pwsh`, 6 `powershell`. **No hay** `php`, `ssh` ni `EXCEL`
corriendo (por tanto: ninguna copia del `.xlsm` abierta por COM en este momento — dato útil para `t4`).

> **Cautela:** un proceso `node` sin `CommandLine` legible (PIDs 17316, 17756) no se puede atribuir.
> `node start.mjs` (12876) tampoco. Se listan como **UNKNOWN**, no se adivinan.

---

## 5 · Marcas de despliegue VPS detectables **sin mutar nada**

| Marca | Evidencia | Lectura |
|---|---|---|
| **Staging VPS reciente** | `_vps_stage/tests/T46_cache_first_measurement.md` 22:37:23 · `cache_first_bench.sh` 22:34:49 · `nginx/logrotate-ape-edge.conf` + `nginx/ape-edge-watchdog.sh` 22:34:37 · `lua/ape_edge_health.lua` 22:30:23 · `lua/ape_prefetch_next.lua` 22:19:02 · `nginx/cache-first-edge.conf` 22:18:38 | t46 preparando **cache-first edge** ahora. **No desplegado por este equipo ni verificable desde aquí.** |
| **Contratos Crystal** | `contracts/{build_contracts.mjs 22:31:56, crystal_contracts.json 22:32:29, verify_contracts.mjs 22:32:10}` + commit `d322eb2` | commit local ya hecho; el ledger afirma verify PASS (12) |
| **Cambio REAL en el VPS hoy** | `COORDENADAS_SESIONES.md` §2: `/etc/cron.d/cache-health-monitor` **desactivado** a las `2026-10-25T02:59Z` (=21:59 Bogotá), backup `/root/backups/cache-health-monitor.bak_20261026T025958Z`, sha previo `9682ec8a…` | **Hubo mutación de producción hoy por otra sesión.** Causa declarada: bucle `proxy_cache off` + `EMPTY_GRACE_MIN=15` reiniciaba nginx 3×/h. Este equipo **no participó y no debe revertirlo.** |
| **Corrección de una violación de lock** | `COORDENADAS_SESIONES.md` §2 fila `22:04-22:30`: escritura en `tools/crystal-upscale/**` bajo lock `t47` → **deshecha** (movida a `docs/upscale_lab/`, `_bench/` borrado) | el mecanismo de coordinación **ya falló una vez**; de ahí la regla "claim antes de escribir" |
| **Bundles de evidencia REA** | `docs/evidence/REA_R1_evidence_bundle.json.gz` 5,79 MB (21:49:14) · `REA_R2…` 5,92 MB (22:25:14) · `REA_R3_citation_audit.ps1` 22:19:22 | otra sesión generando evidencia forense en paralelo |
| **Reportes de deploy históricos** | 32 × `.agents/reports/deploy_*.json`, el más reciente `deploy_20260619T051552Z.json` (19/06/2026 00:16) | **4 meses sin marca nueva de deploy.** Ningún deploy este mes según esta fuente. |
| **Commits** | `d322eb2` (24/10) · `db6ddc7` (25/10) · `6fafc04` · `c944e0d` · `2307ba3` `2b4e3aa` `cd1eb02` `2c339d8` `1459890` `dab4bc2` | actividad de commit normal; nada sin push verificable desde aquí |

**Lo que NO se puede afirmar:** si `_vps_stage/**` ya está en el VPS, si nginx hizo reload, si el motor
`ape-crystal-rust` está sano, qué listas sirve `/var/www/lists`. Eso es `t7` (`vps-edge`), lectura remota.

---

## 6 · Conflictos potenciales REALES (con evidencia)

> No es hipotético: los cinco tienen evidencia enlazada. Detalle máquina en
> `BOARD.json → conflicts[]`.

### X-001 · [HIGH] Autoridad de coordinación duplicada

- **Hecho:** existen dos mecanismos vivos que no se conocen entre sí:
  (a) `COORDENADAS_SESIONES.md` (17.7 KB, sha `BD198A7A…E5EC`) + `tools/session-guard.js` (sha
  `1B95B2BE…983E`) + `.session/locks.json` (757 B, 3 locks) — de `dsh-lead`;
  (b) `docs/ops/session-coordination/` + `.agent-teams/session-board/` — de este equipo (t2).
- **Riesgo concreto:** dos sesiones pueden creerse dueñas de la misma ruta si consultan fuentes distintas.
- **Ya pasó algo equivalente:** el ledger §2 registra una escritura bajo lock ajeno (22:04–22:30).
- **Mitigación aplicada:** el board **importa** `.session/locks.json` verbatim y declara la precedencia
  (enforcement = guard; avisos = board). Ver `COORDINATION_PROTOCOL.md` §2 y §9.

### X-002 · [HIGH] Lock de escritura sobre una lane de lectura asignada

- **Hecho:** `L-001` bloquea `IPTV_v5.4_MAX_AGGRESSION/frontend/js/**` para `t44` (dsh-lead) **mientras**
  la tarea `t6` (`app-generador`) tiene que auditar exactamente `frontend/js/ape-v9/**`.
- **Evidencia de que el archivo se mueve:** `m3u8-typed-arrays-ultimate.js` **+427/−1** a las 21:52:01,
  `ape-profiles-config.js` +79 a las 20:09:30 — ambos **dentro** de la ventana de auditoría.
- **Riesgo:** un veredicto que cite líneas de ese archivo puede quedar obsoleto en minutos. El propio
  ledger lo advierte: *"Veredictos que ya NO cubren los bytes actuales: t14, t15, t16"* (§5).
- **Mitigación:** lectura permitida, **escritura prohibida**; todo entregable de `t6` debe fijar `sha256`
  del archivo leído y re-verificarlo antes de publicar.

### X-003 · [MEDIUM] Drift entre el ledger humano y el estado máquina

- **Hecho:** `.session/locks.json` tiene **3** locks; el ledger declara **5 + 2 = 7** rutas bloqueadas.
  Faltan en el estado máquina: `_vps_stage/tests/emitter_level_assert.js` (t45), `_vps_stage/nginx/**` y
  `_vps_stage/lua/**` (t46), `contracts/**`, `docs/upscale_lab/**`.
- **Riesgo:** `node tools/session-guard.js guard _vps_stage/lua/ape_gateway.lua` devolvería **exit 0
  (libre)** aunque el ledger diga que está bloqueado → escritura accidental.
- **Mitigación:** el board carga la **unión** (L-001…L-008), marca `imported_verbatim:false` +
  `drift_warning:true` en los que solo viven en el ledger, y gana siempre el más restrictivo.

### X-004 · [MEDIUM] 17 archivos modificados + 69 untracked: bare-commit a un `git add -A` de distancia

- **Hecho:** `git diff --cached` está **vacío** (nada staged) y hay 3189 archivos con cambios en el worktree.
- **Riesgo:** cualquier `git add -A` / `commit -a` mete 3172 borrados de build + `.session/locks.json` +
  `.agent-teams/**` + 5,9 MB de bundles REA en un commit.
- **Mitigación:** regla anti bare-commit (`COORDINATION_PROTOCOL.md` §6) + commit quirúrgico con
  `git diff --cached --name-status` antes de cada commit.

### X-005 · [INFO] Dos raíces documentales paralelas del mismo sistema

- **Hecho:** `audit_teams_REA/` (38 `.md`, el más reciente `ENTREGA_ARRANQUE_FUNCIONAL.md` 24.711 B a las
  22:19:09) vs `audit/alignment/2026-10-25/` (nueva, de este equipo).
- **Riesgo:** dos "verdades" del mismo sistema; un lector puede citar la más vieja.
- **Mitigación:** se citan como fuentes externas (nunca se copian ni se mueven); ante contradicción gana
  el que cite bytes re-verificados con hash, no el más reciente.

---

## 7 · NO_TOUCH LIST (accionable)

> Copia operativa. Fuente: `BOARD.json → no_touch[]`. Se lee de arriba a abajo antes de escribir.

```text
# ---- LOCKS VIVOS (enforcement) ----
IPTV_v5.4_MAX_AGGRESSION/frontend/js/**                      # L-001 t44 + 4 archivos sucios
IPTV_v5.4_MAX_AGGRESSION/vps/production_mirror/**            # L-002 t44 (2 copias sucias)
tools/crystal-upscale/**                                     # L-003 t47
_vps_stage/nginx/**                                          # L-005 t46
_vps_stage/lua/**                                            # L-006 t46 (3 archivos sucios)
_vps_stage/tests/emitter_level_assert.js                     # L-004 t45
contracts/**                                                 # L-007 sesión REA/VPS
docs/upscale_lab/**                                          # L-008 sesión REA/VPS

# ---- ESTADO DE OTROS (no es tuyo) ----
.session/**                                                  # estado máquina de session-guard
tools/session-guard.js                                       # enforcement ajeno
COORDENADAS_SESIONES.md                                      # ledger humano ajeno
.agent-teams/alineacion-omni-crystal-1025/**                 # estado de equipo: solo via agent_teams_*
.agent-teams/auditoria-roku-universal-rea/**                 # equipo ajeno (ACTIVO)
.agent-teams/rea-recon/**                                    # equipo ajeno (ACTIVO)
.agent-teams/archive/**                                      # archivado
audit_teams_REA/**                                           # entregables de otra sesión (38 .md)
docs/evidence/**                                             # bundles REA (11,7 MB)
docs/REA_*.md                                                # forensia REA (6 docs)
_vps_stage/lab/ADN_PIN.json                                  # pin de ADN (t46)

# ---- PRODUCCIÓN ----
**/*.xlsm                                                     # SSOT Excel: solo lectura (t4)
VPS 178.156.147.234 (cualquier ruta)                          # iptv-vps-touch-nothing

# ---- RUIDO DE GIT: ni restaurar ni commitear ----
IPTV_v5.4_MAX_AGGRESSION/**/upload-server/target/**           # 912 borrados
IPTV_v5.4_MAX_AGGRESSION/test_zip/target/**                   # 912 borrados
IPTV_v5.4_MAX_AGGRESSION/frontend/tools/stream_probe_server/** # 776 borrados
IPTV_v5.4_MAX_AGGRESSION/backup_master_v5.4_phantom_engine/frontend/tools/** # 572 borrados
"c：tmplogcat_dump.txt"                                        # nombre corrupto: no renombrar
```

**Escritura permitida a este equipo (y nada más):**

```text
docs/ops/session-coordination/**
.agent-teams/session-board/**
audit/alignment/2026-10-25/00-inflight/**
.agent/COORDINATION.md            # SOLO prepend, con backup y gate de preservación
audit/alignment/2026-10-25/10-excel/**   → excel-ssot
audit/alignment/2026-10-25/20-json/**    → json-ssot
audit/alignment/2026-10-25/30-app/**     → app-generador
audit/alignment/2026-10-25/40-vps/**     → vps-edge
audit/alignment/2026-10-25/50-listas/**  → listas-m3u8
audit/alignment/2026-10-25/90-matriz/**  → verificador-alineacion
```

---

## 8 · Riesgo de colisión por lane de auditoría (lo que cada auditor debe saber antes de empezar)

| Lane | Sujeto de lectura | ¿Sujeto locked/sucio? | Acción obligatoria |
|---|---|---|---|
| `t4` excel-ssot | `APE_M3U8_LAB_v8_FIXED.xlsm` | sin `EXCEL` en procesos (no abierto por COM ahora) | copia a temp o COM ReadOnly; registrar sha256 |
| `t5` json-ssot | `frontend/lab_master_22.6.0.json` (sha pinneado `099A1707…` según ledger) | no está en `git status` como modificado | verificar sha antes y después; si difiere de `099A1707…`, es hallazgo |
| `t6` app-generador | `frontend/js/ape-v9/**` | **L-001 (t44)** + 3 archivos sucios (`+427`, `+79`, `+40`) | **solo lectura**; pinchar sha256; re-verificar antes de publicar |
| `t7` vps-edge | VPS 178.156.147.234 | producción viva; hoy se desactivó un cron | solo lectura remota; no reload, no systemctl mutante |
| `t8` listas-m3u8 | listas en VPS + listas directas | depende de t5+t7 | enmascarar tokens; denominador explícito |
| `t9` verificador | todo lo anterior | hereda X-001..X-005 | UNKNOWN ≠ PASS; exigir sha en cada cita |

---

## 9 · Límites de esta foto (para no sobre-afirmar)

1. **No hay índice sesión→título** en `$env:DSH_HOME`; 25 de 28 sesiones quedan **UNKNOWN** de identidad.
2. **No se descomprimió ningún `.jsonl.zstd`** de sesión: contenido de conversaciones intacto y no leído.
3. **No se leyó ningún `inbox/*.jsonl`** de otros equipos: solo mtime/tamaño como señal de vida.
4. **`git status` es del worktree local**, no del remoto. No se hizo `git fetch`, así que no se puede
   afirmar si la rama está adelantada o atrasada respecto de `origin`.
5. **Los mtimes no identifican autores.** La tabla §3.1 atribuye solo lo que tiene evidencia documental
   (ledger §2 + locks); el resto es "desconocida".
6. **Nada de esto prueba el estado del VPS.** Se necesita `t7`.
7. **Los recuentos caducan.** Foto entre `22:40` y `22:45` locales del `2026-10-25`. Re-medir antes de citar.

---

## 10 · Qué hacer si llegas después de esta foto

```bash
# 1. ¿siguen los mismos locks?
node -e "console.log(JSON.stringify(require('./.session/locks.json'),null,1))"

# 2. ¿aparecieron claims nuevos?
node -e "const b=require('./.agent-teams/session-board/BOARD.json');console.log('rev',b.revision,'claims',b.claims.length,'conflicts',b.conflicts.length)"

# 3. ¿cambió el árbol?
git status --short | Measure-Object -Line

# 4. ¿siguen activos los otros dos equipos?
Get-ChildItem .agent-teams/*/inbox/captain.jsonl | Select-Object LastWriteTime,FullName
```

Si algo de esto difiere de lo escrito aquí, **este documento está viejo**: se anota debajo con fecha y se
sigue trabajando con la medición nueva. Nunca se reescribe la foto histórica.

---

# ADENDA t3 — segunda foto del trabajo en vuelo (2026-10-25T22:52-05:00)

> Se **añade** debajo de la foto de las 22:45 en vez de reescribirla (regla del propio §10).
> Lo de arriba sigue siendo válido para su ventana; esto es el **delta** medido 7 minutos después.
> Entregables nuevos de esta lane: [`CHANGE_MAP.json`](CHANGE_MAP.json) (mapa máquina-legible por ruta)
> y [`NO_TOUCH_LIST.md`](NO_TOUCH_LIST.md) (lista accionable de globs).

## A1 · Delta de sesiones: 28 → **31** directorios en el grupo IPTV

`$env:DSH_HOME\sessions` sigue con **14 grupos de workspace**. El grupo IPTV pasó de 28 a **31**
directorios: 42 archivos · **59.675.966 B** (antes 39 / 57.451.691 B). Los 3 nuevos, con identidad
**verificada** contra `.agent-teams/alineacion-omni-crystal-1025/team.json → members[].id`:

| session_id | identidad | estado | última escritura | bytes |
|---|---|---|---|---|
| `f0420ec1-5962-43ee-850a-4c5f26274e83` | **app-generador** (t6, working) | tracked | 22:49:11 | 279.682 |
| `12061bf0-f3a1-43c7-89aa-30f4032f8f42` | **json-ssot** (t5, working) | tracked | 22:49:11 | 189.334 |
| `f75582ee-288c-4538-842a-9cd14da9cc6e` | **UNKNOWN** (no es miembro del equipo) | tracked | 22:43:29 | 619.333 |

Con esto, la atribución sube de 3 a **6 identidades confirmadas** (coord-sesiones, excel-ssot,
json-ssot, app-generador, capitán + 1 unknown). Las 25 restantes siguen **UNKNOWN** por la misma razón
que en §1.3: no hay índice sesión→título y no se descomprimieron los `.jsonl.zstd`.

**Miembros del equipo con sesión despachada (de `team.json`, leído read-only):** 7 miembros;
4 con `session_id` (los tres de arriba + yo) y 3 aún sin id (`vps-edge`, `listas-m3u8`,
`verificador-alineacion`, todos `idle`). Consecuencia operativa: **t7/t8/t9 no tienen sesión viva
todavía** — el inventario de VPS aún no puede empezar.

## A2 · `t1` (commit/push) cerrada: qué se publicó y qué NO

`git log -1` y `git reflog` **confirman que no hubo commit nuevo** (HEAD = `d322eb2`, del 22:32:42).
Lo que sí pasó, según `audit/alignment/2026-10-25/commit-gate/COMMIT_PUSH_GATE.md`:

- **Push OK**: `db6ddc7..d322eb2` (fast-forward, sin `--force`) → remoto == local == `d322eb2…0e7c`.
- 4 archivos publicados (`contracts/*` + `docs/upscale_lab/crystal-upscale.ps1`), 672 inserciones.
- **Working tree: 0 commits.** Excluido a propósito y documentado en `commit-gate/EXCLUDED_WIP.md`.

**Para los auditores:** el árbol sigue exactamente como estaba (18 `M`, 3.172 `D`, 72 `??`, 0 staged).
No hay que "re-leer" nada por el push. Y el gate del capitán coincide con mi medición de las 22:45
(él contó 3.258 entradas / 17 M / 3.172 D / 69 ?? antes de mi prepend; la diferencia es mía: +1 M y
+3 ??).

## A3 · Dos hallazgos NUEVOS de esta pasada (X-006, X-007)

### X-006 · [MEDIUM] El gate de contratos está en ROJO por WIP ajeno — y NO es un defecto del sistema

```
FAIL  SHA MISMATCH _vps_stage/tests/fanout_concurrency.sh:
      contrato 9b774bffbe6c744f…  vs  real b558b1cdff883579…      RESULT=FAIL (1 fallos, 11 ok) exit 1
```

| Fuente | SHA-256 | Bytes |
|---|---|---|
| Pin del contrato | `9b774bffbe6c744f…a6c94` | — |
| `git show HEAD:_vps_stage/tests/fanout_concurrency.sh` | `9b774bff…a6c94` (**= pin**) | 98.126 |
| Disco (working tree, otra sesión) | `b558b1cdff883579…399fc` | 99.666 |

El commit publicado es **autoconsistente**; el rojo es drift no commiteado de `t46`/desconocida.
**Regla para t9:** citar `verify_contracts` en rojo como FAIL de alineación sería un **falso hallazgo**.
Es `X-006`, no un defecto. Nadie del equipo regenera ese contrato: es de L-007.

### X-007 · [MEDIUM] Un binario ajeno "aplanado" en la raíz del repo

```
UsersHFRCDesktopIPTV_Navigator_PRO_v5.4_MAX_AGGRESSIONtoolscrystal-upscale_work.qsv_probe.mkv
31.545 B · sha256 FD4E0DBB26C939480159A7A73FFADF160A8B24000C6731D3FFE1758D5A5FBE86 · mtime 22:48:23
```

El nombre es el **path aplanado** de `tools/crystal-upscale/work/qsv_probe.mkv` (lane **L-003**, `dsh-lead`
t47, lock creado a las **22:21**). Es decir: una escritura de esa lane terminó en la raíz del repo
**27 minutos después** de que el lock existiera — el mismo patrón de "escritura fuera de su lane" que ya
registró el ledger a las 22:04–22:30 (violación de t47, deshecha).

**Acción:** no se borra, no se mueve, no se renombra (no es nuestro y destruiría su artefacto de trabajo).
Se reporta al dueño de t47 y queda como glob explícito en `no_touch[]` para que ningún auditor lo
confunda con basura.

## A4 · Por área: qué está tomado (resumen para no duplicar trabajo)

| Área | Estado | Quién | Qué hacer |
|---|---|---|---|
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/**` | **6 archivos sucios** (uno de ellos +427/−1) + **L-001** | t29/t33/t36, dsh-lead fuse A+B, 1 desconocida | t6 **solo lee** con pin de sha256 |
| `IPTV_v5.4_MAX_AGGRESSION/backend/**` | 2 sucios (`resolve_quality_unified.php` +300/−38, `cmaf_engine/ai_super_resolution_engine.php`) | t28, t40 | t6 lee; nadie escribe |
| `IPTV_v5.4_MAX_AGGRESSION/vps/**` | 3 sucios (production_mirror ×2 + vps/cmaf_engine) + **L-002** | t44 | prohibido escribir |
| `_vps_stage/**` | 4 sucios (lua ×3, tests ×1) + 16 untracked + **L-004/L-005/L-006** | t45, t46 | prohibido escribir; t7 solo compara |
| `contracts/**` | 3 archivos commiteados en HEAD + **L-007** + gate en rojo (X-006) | sesión REA/VPS | no regenerar |
| `docs/**` | 6 `REA_*.md` + `docs/evidence/**` (11,7 MB) + `docs/upscale_lab/**` (L-008) | rea-recon / sesión VPS | citar, no copiar |
| `audit_teams_REA/**` | 38 `.md`, el último 22:19:09 | sesión REA/VPS | fuente externa (X-005) |
| `audit/alignment/2026-10-25/**` | 2 lanes: `00-inflight` (mía), `commit-gate` (capitán) | nosotros | cada uno la suya |
| `.agent-teams/**` | 3 equipos; `auditoria-roku-universal-rea` (inbox 22:45:00) y `rea-recon` (22:43:37) **activos** | ajenos + nosotros | solo via `agent_teams_*` |
| VPS `178.156.147.234` | producción viva; hoy se desactivó `/etc/cron.d/cache-health-monitor` (21:59 Bogotá) | otra sesión | t7 solo lectura remota |

## A5 · Procesos (delta)

`node` 17 → **20** · `python` 7 → **9** · `pwsh` 2 → **5** · `powershell` 6 → **7** ·
**`php` = 0** · **`ssh` = 0** · **`EXCEL` = 0**.

Lo relevante para el equipo: **sigue sin haber** proceso PHP, SSH ni Excel. Por tanto:
`t4` puede leer el `.xlsm` sin pelear con una instancia COM abierta, y `t7` puede hacer su SSH read-only
sin riesgo de pisar una sesión SSH ajena **desde esta máquina** (el VPS sí recibe otras sesiones).

## A6 · Marcas de despliegue VPS (delta)

| Marca | Medición | Lectura |
|---|---|---|
| `_vps_stage/**` staging | 16 untracked, mtimes 22:18:38 → 22:37:23 | t46 preparando cache-first edge; **no desplegado por nosotros ni verificable desde aquí** |
| `vps_configs/**` | 7 archivos, **el más reciente 2026-06-18 21:31** (`autopista-trap.conf`) | **4 meses sin tocarse**: no es una marca de despliegue reciente |
| `.agents/reports/deploy_*.json` | 32 archivos, el más reciente **2026-06-19 00:16** | ninguna marca de deploy este mes desde el repo |
| `contracts/` | commit `d322eb2` 22:32:42, **pusheado** | único cambio de esta noche que llegó al remoto |
| VPS (real) | `/etc/cron.d/cache-health-monitor` desactivado 21:59 Bogotá (ledger §2) | **sí hubo mutación de producción hoy**, por otra sesión. Nadie de este equipo participó |

**Sigue sin poder afirmarse** qué hay desplegado ahora en el VPS: eso es `t7` (SSH read-only).

## A7 · Cómo se cruza esto con el tablero

- `BOARD.json` **rev 3**, `phase: claims-open`, `phase_task: t3`: 10 claims (5 de t2 `released` +
  **C-006…C-010 `active`**: 1 de escritura sobre esta lane y 4 de lectura, uno por área censada),
  7 conflictos (`high: 2 · medium: 4 · info: 1`), 22 globs `no_touch`, 31 sesiones.
- Nuevo bloque `BOARD.json → active_member_sessions`: los 7 miembros con su `session_id` (o `null`) y su
  tarea. Es la forma barata de saber **quién está vivo** sin leer los `.jsonl` de sesión.
- `CHANGE_MAP.json`: 18 rutas `M` con `git_state`, `numstat`, `bytes`, `mtime`, atribución con
  **confianza explícita** (`high 8 · medium 5 · low 2 · none 3`) y riesgo (`high 6 · medium 6 · low 5 ·
  none 1`); 5 grupos de borrados (suma **3.172**, cuadra con `git status`); 20 grupos untracked;
  6 riesgos de colisión por lane.


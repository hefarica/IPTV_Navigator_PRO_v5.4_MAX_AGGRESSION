# VERIFICACIÓN — Harness ejecutable real (t9 / i1)

**Snapshot:** `git HEAD e38a89b` (`e38a89bb30c02cb41050f34cef43d3711a2b0644`) · **Host:** Windows, `pwsh 7.6.8`, node `v24.12.0`, python `3.12.10`, **nginx ausente**
**Ejecutado:** 2026-10-26 04:33:50 → 04:34:19 (-05:00) · **Autor:** `s7-sre-secops` · **Mutaciones:** 0 fuera de `audit/equipo10_operativo_2026-10-26/{verificacion,snapshot}/`
**Reproducir:** `pwsh -NoProfile -File audit/equipo10_operativo_2026-10-26/verificacion/run_checks.ps1`

> **Regla de lectura:** todo resultado de este documento tiene exit code real. Un comando cuya herramienta no existe es `NOT_RUN` con causa; nunca `PASS`. Las citas del generador/index usan la regla de `snapshot/REGLA_DE_ORIGEN.md` (blob HEAD vs WT sha).

---

## 1. Resultado

| Métrica | Valor |
|---|---|
| Chequeos ejecutados | **21** |
| `PASS` | **10** |
| `FAIL` | **10** |
| `NOT_RUN` | **1** |
| **Exit code del harness** | **1** (≥1 FAIL ⇒ no hay PASS agregado) |

`HARNESS.json` contiene las 21 filas con `{check_id, comando, exit_code, status, evidencia_tail}`. El contrato del script: `exit 0` = ningún FAIL · `exit 1` = al menos un FAIL · `exit 2` = el harness no pudo ejecutarse.

---

## 2. Los 21 chequeos

| # | check_id | Comando real | exit | status | Evidencia medida |
|---|---|---|---|---|---|
| C01 | `node_version` | `node -v` | 0 | PASS | `v24.12.0` |
| C02 | `python_version` | `python -V` | 0 | PASS | `Python 3.12.10` |
| C03 | `nginx_version` | `nginx -v` | — | **NOT_RUN** | binario ausente del host; `nginx -t` sobre el SSOT es no ejecutable aquí y en el VPS está prohibido (`iptv-vps-touch-nothing`) |
| C04 | `git_head` | `git rev-parse HEAD` | 0 | PASS | `e38a89bb30c02cb41050f34cef43d3711a2b0644` == esperado |
| C05 | `git_status_counts` | `git status --porcelain` | 0 | PASS | total **57** = 16 `M` + 3 `D` + 38 `??` |
| C06 | `node_check_generator` | `node -c` × **94** `.js` de `frontend/js/ape-v9/` | 0 | PASS | **94/94 sin error de sintaxis**, 0 fallos |
| C07 | `skills_index_json` | `node -e 'JSON.parse(...)'` | 0 | PASS | JSON válido · **306** entradas |
| C08 | `skills_index_vs_disk` | índice vs `Get-ChildItem .agents/skills -Directory` | 1 | **FAIL** | índice **306** vs disco **308** → 2 directorios sin entrada: `ape-omega-visual-loop`, `claude-code-repo-surgeon` |
| C09 | `claude_agents_count` | `Get-ChildItem .claude/agents/*.md` | 1 | **FAIL** | medido **15**, doctrina `AGENTS.md` = **10** |
| C10 | `claude_commands_count` | `Get-ChildItem .claude/commands/*.md` | 1 | **FAIL** | medido **9**, doctrina `AGENTS.md` = **7** |
| C11 | `toxic_in_profile_lists` | `git grep -n -I -E '"^(Range\|If-None-Match\|If-Modified-Since\|TE\|Priority\|Upgrade-Insecure-Requests)"\s*:\s*"[^.]'` | 1 | **FAIL** | **72 emisores vivos** en `APE_ALL_PROFILES_OPTIMIZED.json` (`:130,134,146,147,148,156,414,415,…` = 12 bloques × 6 headers) + **6** en árbol de backup (excluidos y contados aparte) |
| C12 | `toxic_in_default_values` | mismo grep, bloque `DEFAULT_HEADER_VALUES` (3994-4050) | 1 | **FAIL** | **6** valores tóxicos por defecto: `ape-profiles-config.js:4017,4018,4023,4024,4025,4040` |
| C13 | `dnt_contradiction` | `git grep '"DNT"\s*:\s*"[^.]'` + mapa `TOXIC` | 1 | **FAIL** | mapa `TOXIC` marca `dnt` (1) y hay **27 emisiones vivas** (+1 en backup): `APE_ALL_PROFILES_OPTIMIZED.json:128,412,778,…` |
| C14 | `secret_sweep_material` | `git grep` private-key block / `PrivateKey=` / `PresharedKey=` / `--auth user:pass` | 1 | **FAIL** | **9**: `WG_PRIVATE_KEY=5`, `WG_PRESHARED_KEY=3`, `CLI_BASIC_AUTH=1` (valores **no impresos**) |
| C15 | `secret_sweep_provider_creds` | `git grep 'https?://host:port/u/p/id'` | 1 | **FAIL** | **2 598** sitios en 9 archivos — `channels_map.json`(2 574), `_raw_lists_audit.json`(13), `fallback_proxy.php`×4(2 c/u), … (valores **no impresos**) |
| C16 | `gitignore_coverage` | `.gitignore` + `git ls-files` | 1 | **FAIL** | `ignora_*.conf=False`, `ignora_channels_map=False`, `*.pem/*.key` trackeados = **0** (eso sí pasa) |
| C17 | `validate_imports_portable` | `python _inbox_EQUIPO_ADN/EQUIPO_ENTERPRISE_10_COUNCIL_ADN/validate_imports_portable.py` | 0 | PASS | `valid:true`, `errors:[]`, **2 469 checks**, 430 files, `agent_count:10`, `tool_catalog_count:271`, `export_hashes_valid:true` |
| C18 | `snapshot_head_blobs` | blob vs `git cat-file -s` | 0 | PASS | **8/8 blobs verificados byte a byte**, 0 discrepancias |
| C19 | `wt_stable_since_freeze` | `Get-FileHash` del generador vs `SNAPSHOT.json` | 1 | **FAIL** | actual `ddce94ca…` ≠ congelado `da442864…` ⇒ **el WT cambió durante la ejecución** |
| C20 | `snapshot_artifacts` | `Test-Path snapshot/*` | 0 | PASS | 3/3 artefactos + **17** `.blob` |
| C21 | `council_report_hashes` | `Get-FileHash` vs hash declarado (`REPORT_HASHES.json`) | 0 | PASS | 8 informes, **4 con hash declarado y 4 coinciden**, 4 sin declarar, 0 discrepancias, **0 informes contienen su propio SHA-256** |

---

## 3. El hallazgo estructural: el WT se movió 5 veces (C19)

`WT_DRIFT_LOG.json` registra 7 observaciones del generador, con **6 estados distintos**:

| # | Hora | Bytes | Líneas | sha256 (8) | Fuente |
|---|---|---|---|---|---|
| 1 | ~04:12 | — | **21 581** | — | medición S3 (base de S1-F01) |
| 2 | ~04:15 | — | 11 443 | — | captain |
| 3 | 04:19:53 | 739 652 | 11 459 | `37ab2ca7` | captain |
| 4 | 04:27:34 | 743 867 | 11 524 | `d29f62af` | congelamiento #1 |
| 5 | 04:29:02 | 743 883 | 11 524 | `da442864` | congelamiento #2 (**vigente en `SNAPSHOT.json`**) |
| 6 | 04:30:20 | 743 637 | 11 519 | `ddce94ca` | medición de C19 (harness 04:33:50) |
| 7 | 04:34:38 | 743 699 | 11 520 | `1841e8b6` | re-medición al escribir el log |

**Coordenada estable (única):** blob HEAD `c1277bdf…` = **707 323 B / 11 144 líneas**.

Se conservan **dos** blobs WT del generador (`…WT.d29f62af.blob` 743 867 B y `…WT.da442864.blob` 743 883 B): la diferencia entre ambos **es** la prueba documental de la mutación. `C19=FAIL` no es un defecto del harness: es la medición de que el árbol sigue siendo escrito por otra sesión.

**Consecuencia (ya aplicada en `REGLA_DE_ORIGEN.md`):** `S1-F01` (+10 447/−10) se midió sobre un WT de 21 581 líneas que ya no existe ⇒ **histórico y superado**; no describe HEAD ni el WT actual. Ningún conteo medido sobre WT puede sumarse a uno medido sobre HEAD.

---

## 4. Lo que el harness corrige o confirma del Council

1. **Confirma** S7/S10 en lo esencial: 9 materiales secretos reales (C14) y 2 598 credenciales de proveedor (C15), `.gitignore` sin cubrir `*.conf` ni `channels_map.json` (C16), 6 valores tóxicos vivos por defecto (C12) y la contradicción de `DNT` (C13).
2. **Añade** drift de inventario que ningún Council midió: índice de skills **306 vs 308** (C08), `.claude/agents` **15 vs 10** y `.claude/commands` **9 vs 7** (C09/C10) — con un dato que agrava la inconsistencia: el validador del propio paquete ADN dice `agent_count: 10` (C17) mientras el filesystem tiene 15 archivos.
3. **Corrige una creencia del captain sobre S5.** El hash real de `S5_qoe_telemetria.md` empieza `583c36d6…`; el prefijo declarado (`583C36D6`) **coincide**. El sufijo **no es verificable**: ni el informe ni el resumen contienen el hash completo (C21: `informes_que_contienen_su_propio_sha=0`). Estado honesto: **NO VERIFICADO**, no refutado. `S6` y `S8` sí declaran hash completo y **coinciden exactamente**.
4. **`node -c` es limpio:** 94/94 archivos de `frontend/js/ape-v9/` compilan. No hay error de sintaxis que explique los hallazgos de codec/HLS: los problemas del Council son semánticos, no sintácticos.

---

## 5. Qué NO está verificado (y por qué)

| No verificado | Causa |
|---|---|
| `nginx -t` del SSOT y de producción | `nginx` no existe en el host de auditoría; ejecutarlo en el VPS está prohibido (C03 = NOT_RUN) |
| Cualquier `systemctl`/`journalctl`/`wg`/`adb` | idem: host Windows, VPS prohibido |
| Reproducir el estado del WT de otro autor | el WT se movió 6 veces (§3): sólo es reproducible el blob congelado |
| Sufijo del hash declarado por S5 | no está escrito completo en ningún artefacto del repo (§4.3) |
| Contenido semántico de los 72 emisores tóxicos del JSON SSOT | el harness mide **presencia/ubicación**, no si el runtime carga ese JSON; el consumo en runtime no se encontró y queda como riesgo latente (coherente con S10) |
| Explotabilidad de los endpoints sin auth | prohibido atacar/fuzzear |

---

## 6. Defecto del propio harness, detectado y corregido (transparencia)

La **primera ejecución** (descartada, no produjo `HARNESS.json`) devolvió `exit 2`: la resolución de la raíz usaba `$PSScriptRoot/../..`, que caía en `<repo>/audit` en vez de la raíz del repo. Con ese cwd, `.agents/skills_index.json` y `.claude/*` no existían (**FAIL falsos**) y los `git grep` con pathspec relativo devolvían 0 matches (**PASS vacíos**). Correcciones aplicadas antes de la corrida válida:

1. La raíz se resuelve **caminando hacia arriba** hasta el directorio que contiene `.git` **y** `AGENTS.md`; si no aparece, el harness **aborta con exit 2** en lugar de medir el árbol equivocado.
2. `C18` dejó de adivinar la ruta del repo por basename (daba PASS vacío) y ahora compara el blob contra el `head_blob_sha` declarado en `SNAPSHOT.json`.
3. `C11`/`C13` separan **código vivo** de **árboles de backup congelados** (`ape-v9-backup-*`, `_backups`, `*.PRE/.CORRUPT/.FREEZE`) y reportan ambos conteos.
4. `C19` ya no revienta si el generador falta: devuelve `NOT_RUN`.

Sólo la corrida con `root = C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION` (impreso por el propio harness) es la que respalda §1–§2.

---

## 7. Entregables y hashes

| Artefacto | Bytes | SHA-256 |
|---|---|---|
| `verificacion/run_checks.ps1` | 34 866 | `aab7dcd7570c899633254d5964ad6e1595a29d7fe77ea5a4704e8370c22da1aa` |
| `verificacion/HARNESS.json` | 10 791 | `ed9b69da56f1607af54396e03d4defc5000b72469ecf6c68d54d164d2173814e` |
| `snapshot/SNAPSHOT.json` | 6 349 | `04cb3f0a3d21a122e32adc14f891960fc452b59778890d6a01a77476ae533c43` |
| `snapshot/REPORT_HASHES.json` | 3 774 | `a20259bae64f0f1fb1779e205c4e49d75e3fa6b7cf3e36aac2b802dbf8aedc67` |
| `snapshot/REGLA_DE_ORIGEN.md` | 3 270 | `a0050cfb1bf13102083b50960b6410989d6a36df6093ee531fa1f1264ae4b8d7` |
| `snapshot/WT_DRIFT_LOG.json` | 3 345 | `19178926534cdae56003d974bf60ab4d3c35e8b0769dfc007ef8318bd41ed596` |
| `snapshot/*.blob` (17 archivos: 8 HEAD + 9 WT) | — | verificados en C18/C20 |

**Ubicación:** los entregables viven en `audit/equipo10_operativo_2026-10-26/{verificacion,snapshot}/`. Como el enunciado escribía `verificacion/` sin prefijo, se dejó además un **puntero** en la raíz: `verificacion/LEEME_UBICACION.md` (`1f87d6321280557b1d2398c25e9f84654917b16a252c06d9d7e0a1694d48ea03`) que **no duplica contenido**.

**Veredicto de esta fase:** harness **funcional y ejecutable** (21 chequeos, exit codes reales, `HARNESS.json` escrito, `exit 1`). Como fotografía del repo: **10 PASS / 10 FAIL / 1 NOT_RUN** — el snapshot **no pasa** su propio harness, y esa es la medición, no un juicio de valor.

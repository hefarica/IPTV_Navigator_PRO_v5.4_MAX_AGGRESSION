# T12_REPAIR_LOG — Certificación honesta del SSOT ya aplicado (t26)

**Task:** t26 (repair de t12) · **Ejecutor:** `json-ssot` · **Ventana:** 2026-10-25 23:42–23:45 (America/Bogota)
**Modo:** **no se rehace el fix**. Sólo se re-ejecutan las pruebas que *pueden* pasar, se registran las salidas crudas
y se reclasifican los dos gates que no dependen de este trabajo (`BLOCKED_BY_OWNER`).
**Decisiones aplicadas:** **D-60** (se conserva `settings.fps` = `!X32` = 120; la corrección de fps vive en
`X-Stream-FPS` + ticket E-1) · **D-61** (el bloque `Verify:` del capitán tenía comillas desbalanceadas; se
ejecutaron los comandos por separado y **no** se usó el bloque roto como evidencia).

---

## 0. Estado declarado (re-medido en t26, no copiado del log de t12)

| Elemento | Valor medido ahora |
|---|---|
| `IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json` | **280.121 B** · mtime `2026-10-25T23:36:28.782-05:00` · SHA-256 **`60DBAB4B8CF7A15CD1D59E1F73A9B83FF469BCDD8A93D57345CC8259AB312A93`** |
| Respaldo del original | `SSOT_BACKUP/lab_master_22.6.0.json.bak_20261025T233456Z` · **280.065 B** · SHA-256 `099A1707A2F1AE692FFCFEDE01165F21CD66656B786742CE8DB518581A371FD4` (= original pre-fix) |
| Rollback | documentado en `SSOT_BACKUP.sha256` (copiar el `.bak_*` sobre la ruta y verificar `099A1707…`) |
| Git | **gitignored** (`.gitignore:149`) ⇒ no commiteable, **no commiteado**; `git log -1` = `ffb01e6` (de otra sesión) |
| JSON modificado por t26 | **NO** — el hash es idéntico al inicio y al final de esta tarea (`60DBAB4B…`) |

---

## 1. [V1] Gate del capitán — `which_json_is_the_export.mjs` (re-ejecutado sobre el estado actual)

```
$ node audit/alignment/2026-10-25/90-matriz/tools/which_json_is_the_export.mjs
exit=0
```

| Candidato | `totalDiffs` | compares | bytes | sha256 |
|---|---:|---:|---:|---|
| **`lab_master_repo`** | **0** | 24 | 280.121 | `60DBAB4B…2A93` |
| `CRYSTAL-4K-UHD` (= estado **pre-fix**, byte a byte) | 10 | 24 | 280.065 | `099A1707…A371FD4` |
| `EXPORT_20260611_020645` (export fiel, N1) | 0 | 24 | 222.364 | `6931BAF4…2C93` |
| `MEMC-TOTAL-8K120_BACKUP_20260607` | 11 | 24 | 408.126 | `FFD3E0E0…1DD7` |
| `MEMC-TOTAL-8K120` | 10 | 24 | 408.174 | `29C54805…5865` |

**`lab_master_repo.totalDiffs === 0` → TRUE** ✅
Salida cruda completa: `T26_gate_which_json.json` (JSON íntegro del tool) y `T26_raw_verify.txt`.
El "antes" se demuestra **con el mismo comando en la misma ejecución**: el candidato `CRYSTAL-4K-UHD` es byte-idéntico
al estado pre-fix (mismo sha `099A1707…`) y marca 10 diffs (P1 ×2, P3 ×3, P4 ×3, P5 ×2).

## 2. [V2] Parseo + perfiles

```
$ node -e "…JSON.parse…;console.log('PARSE_OK profiles='+Object.keys(j.profiles_calibrated).sort().join(','))"
PARSE_OK profiles=P0,P1,P2,P3,P4,P5
exit=0
```

## 3. [V3] `verify_levels.mjs` → `ZERO_IMPOSSIBLE_LEVELS`

```
$ node audit/alignment/2026-10-25/70-ssot-fix/tools/verify_levels.mjs     # SIN argumentos, como en el Verify
exit=0
```

| Perfil | Códec declarado al player | Resolución@fps declarada | Capacidad del nivel | Veredicto |
|---|---|---|---|---|
| P0 | `dvh1.08.06` | 7680x4320 @ 30 | — (DV sin modelo) | `UNKNOWN` (declarado, no PASS) |
| P1 | `hvc1.2.4.L153.B0` | 3840x2160 @ 60 | 4K@60 | **PASS** |
| P2 | `hvc1.2.4.L150.B0` | 3840x2160 @ 30 | 4K@30 | **PASS** |
| P3 | `hvc1.2.4.L123.B0` | 1920x1080 @ 60 | 1080p@60 | **PASS** |
| P4 | `hvc1.2.4.L93.B0` | 1280x720 @ 30 | 720p@30 | **PASS** |
| P5 | `avc1.42c01e` | 854x480 @ 30 | 480p@30 | **PASS** |

`impossible_count = 0` · `unknown_count = 1` · `verdict = ZERO_IMPOSSIBLE_LEVELS` (antes: `IMPOSSIBLE_LEVELS_PRESENT`
con 3 imposibles). Salida cruda: `T26_levels.json`.

> **Ajuste de herramienta hecho en t26 (dentro de `70-ssot-fix/tools/`, no en el JSON):** `verify_levels.mjs`
> ahora usa por defecto la ruta del `lab_master` del repo cuando se invoca **sin argumentos**, que es exactamente
> como lo llama el `Verify:` del contrato. Antes exigía la ruta y habría fallado por `readFileSync(undefined)`.
> Es el único cambio de código de t26.

## 4. [V4] Hash del JSON

```
$ Get-FileHash IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json -Algorithm SHA256
60DBAB4B8CF7A15CD1D59E1F73A9B83FF469BCDD8A93D57345CC8259AB312A93
exit=0
```

## 5. [V5] Integridad estructural (re-ejecutada)

```
$ node audit/alignment/2026-10-25/70-ssot-fix/tools/structural_integrity.mjs <backup> <lab_master> T26_structural.json
{
  "profiles_exactly_P0_P5": true,
  "root_keys_added": [], "root_keys_removed": [],
  "leaf_paths_added": 2, "leaf_paths_removed": 0,
  "changed_leaf_count": 53,
  "servers_equal": true,
  "app_consumed_all_present": true,
  "bytes_before": 280065, "bytes_after": 280121
}
```
Salida cruda: `T26_structural.json`.

## 6. [V8] `servers[]` intacto y **sin transcribir**

```
servers_equal= true | count= 4 | sha_del_bloque= 94a6dfe9782593f4… | (valores NO transcritos)
```
Se comparó el **hash del bloque** (no los valores): el bloque `servers` es idéntico al del respaldo y sus 4 pares de
credenciales siguen sin aparecer en ningún documento de esta carpeta (D-24).

---

## 7. T12-F1 → **`BLOCKED_BY_OWNER`** (no es un fallo de t12)

**Hecho 1 — el contrato no pina `lab_master`:** `contracts/crystal_contracts.json` tiene **0 coincidencias** de
`lab_master` (grep contado: `0`). Por tanto una edición de `lab_master_22.6.0.json` **no puede** alterar el
resultado del verificador.

**Hecho 2 — el único fallo es un artefacto ajeno:**

```
$ node contracts/verify_contracts.mjs
  FAIL  SHA MISMATCH _vps_stage/tests/fanout_concurrency.sh: contrato 9b774bffbe6c744f… vs real b558b1cdff883579…
RESULT=FAIL (1 fallos, 11 ok)
exit=1
```
`contracts/crystal_contracts.json` → `artifacts["_vps_stage/tests/fanout_concurrency.sh"].sha256 =
9b774bffbe6c744fc205136561c506e3bf93af8e1dea575304d16ae5601a6c94`.

**Hecho 3 — es drift de otra sesión, vivo ahora mismo:**

```
$ git status --porcelain -- _vps_stage/tests/fanout_concurrency.sh
 M _vps_stage/tests/fanout_concurrency.sh
```

**Hecho 4 — resultado idéntico antes y después del fix:** el mismo comando se ejecutó en t12 antes de tocar el JSON
y después; ambas veces `FAIL (1 fallos, 11 ok)` con el mismo par de hashes (registro: `CONTRACTS_AFTER.txt` de t12 y
`T26_contracts.txt` de t26, mismo contenido de fallo). El número de PASS subió/ bajó **sólo** por artefactos
`_vps_stage/*` que otras sesiones están tocando, nunca por `lab_master`.

**Clasificación:** `BLOCKED_BY_OWNER` — corresponde a **L-004/L-007** (re-pin del contrato o revert del archivo
`_vps_stage/tests/fanout_concurrency.sh`). **No** se ha tocado `contracts/**` ni `_vps_stage/**` (fuera de scope).
Salida cruda: `T26_contracts.txt`.

## 8. T12-F2 → defecto del `Verify:` del capitán (**D-61**), no evidencia rota

El bloque `Verify:` original era **un solo renglón** con tres comandos y **comillas desbalanceadas** en el primero:

```
node -e "…console.log('SSOT_COHERENCE_OK'); node -e "JSON.parse(…)…"; node contracts/verify_contracts.mjs
             ^ abre comilla y no la cierra → engulle los otros dos comandos
```

Consecuencia: el bloque **no es ejecutable literalmente** y, si se hubiera tomado como un único comando, habría
medido algo distinto de lo que pretendía. **Constancia:** los **tres comandos se ejecutaron por separado** (V1–V4 de
este log más el snippet de coherencia de t12) y **el bloque roto no se usó como evidencia** en ningún entregable.
Recomendación (para el capitán, D-61): partir el `Verify:` en tres líneas independientes o envolverlo en un
`verify.sh` con `set -e`.

## 9. T12-F3 → resuelto según **D-60**

- `settings.fps` se **conserva en `"120"`** en los 6 perfiles porque es la celda canónica
  `6_NIVEL_2_PROFILES!X32` y así el gate del capitán queda en **0 diffs**.
- La corrección de capacidad vive en **`headerOverrides["X-Stream-FPS"]`** (y `X-Max-Framerate`): **30 · 60 · 30 · 60 · 30 · 30**,
  que es la terna que se declara al player (V3: 5 PASS + 1 UNKNOWN DV).
- El hueco restante (el emisor calcula `FRAME-RATE=` desde `settings.fps`) queda como **UNK-01** con la línea exacta
  a cambiar en t11 y como **ticket E-1** (fila 32 del Excel).
- **No** se reintrodujo AV1 8K; **no** se tocaron credenciales; **no** se commiteó (archivo gitignored).

## 10. [V6] `excel_vs_json` (22 campos) — 9 diffs, todas con ticket

| Perfil | DIFFs | Detalle |
|---|---:|---|
| P0 | 1 | `X-Stream-FPS` 30 vs `B352`=60 → D-35 / E-6 |
| P1 | 3 | `X-Stream-FPS` 60 vs `C352`=120 (D-35/E-6) · `X-Stream-Codecs` hvc1 vs `C350`=av01 (D-22/E-4) · `avgBitrateKbps` 40000 vs `C50`=75000 (D-36/E-3) |
| P2 | 2 | `X-Stream-FPS` 30 vs `D352`=60 (D-35) · `avgBitrateKbps` 25000 vs `D50`=35000 (D-36/E-3) |
| P3 | 1 | `avgBitrateKbps` 10000 vs `E50`=15000 (D-36/E-3) |
| P4 | 1 | `avgBitrateKbps` 5000 vs `F50`=6000 (D-36/E-3) |
| P5 | 1 | `avgBitrateKbps` 2000 vs `G50`=2200 (D-36/E-3) |

**0 diffs en todos los campos corregibles** (resolución, maxResolution, codec, codec_full, codec_string,
X-APE-CODEC, X-APE-RESOLUTION, X-Codec-Support, vlcopt, codec_priority, bit_depth, hdrMode, videoRange, X-APE-FPS).
Salida cruda: `T26_excel_vs_json.json`.

---

## 11. Resumen de gates (honesto, sin maquillaje)

| Gate | Resultado | Depende de t12? |
|---|---|---|
| `which_json_is_the_export.mjs` → `totalDiffs` | **0 / 24** ✅ | sí (es el objetivo) |
| Parseo + `profiles_calibrated` = P0..P5 | **OK** ✅ | sí |
| `verify_levels.mjs` → `ZERO_IMPOSSIBLE_LEVELS` | **0 imposibles** ✅ | sí |
| Integridad estructural (`servers[]` intacto, sin hojas eliminadas, 12/12 claves APP) | **OK** ✅ | sí |
| SHA-256 del JSON | **`60DBAB4B…2A93`** ✅ | sí |
| `contracts/verify_contracts.mjs` | **FAIL 1/11 → `BLOCKED_BY_OWNER`** (L-004/L-007) ⛔ | **no** (drift ajeno, contrato no pina `lab_master`) |
| `Verify:` del contrato como bloque | **inválido por comillas** (D-61) ⛔ | **no** (defecto del enunciado) |

**Veredicto:** el SSOT está **certificado** por los cinco gates que dependen de él. Los dos gates restantes están
**bloqueados por el owner** (re-pin del contrato / corrección del `Verify:`), con evidencia de que no son
atribuibles a t12.

## 12. Artefactos de esta tarea

`T12_REPAIR_LOG.md` (este documento) · `T26_raw_verify.txt` (salidas crudas V1–V4) · `T26_gate_which_json.json` ·
`T26_levels.json` · `T26_structural.json` · `T26_excel_vs_json.json` · `T26_contracts.txt` ·
`tools/verify_levels.mjs` (default path; único cambio de código) · appends en `SSOT_VERIFY.md` §11 y
`SSOT_UNKNOWNS.md` UNK-10/UNK-11.

---
---

# 13. ADENDA — intento 2 · re-ejecución independiente por el verificador (t26)

**Ejecutor de esta adenda:** `verificador-alineacion` · **Attempt:** `bf128d29-2cae-4f58-831c-e63180a7c0a7`
**Ventana:** 2026-10-25 23:44–23:50 (America/Bogota) · **Naturaleza:** re-certificación **read-only** del trabajo ya
aplicado. **No se rehizo el fix y no se modificó el JSON**: el SHA-256 es idéntico al inicio y al final de esta
adenda (`60DBAB4B…2A93`).

> El cuerpo §0–§12 lo produjo el intento 1. Esta adenda **no borra nada** de él: añade la re-ejecución
> independiente con sus propias salidas crudas (`T26B_*`) para que el `failed` de los gates mecánicos no quede como
> única constancia. Donde mi medición difiere del cuerpo, se dice explícitamente.

## 13.1 Estado re-medido (independiente del log)

| Elemento | Valor medido por el verificador |
|---|---|
| `lab_master_22.6.0.json` | **280.121 B** · SHA-256 **`60DBAB4B8CF7A15CD1D59E1F73A9B83FF469BCDD8A93D57345CC8259AB312A93`** · mtime `2026-10-25T23:36:28.782-05:00` |
| Respaldo pre-fix | `SSOT_BACKUP/lab_master_22.6.0.json.bak_20261025T233456Z` · **280.065 B** · SHA-256 `099A1707A2F1AE692FFCFEDE01165F21CD66656B786742CE8DB518581A371FD4` → **coincide con el original** y sirve de rollback |
| Git | **gitignored** por `.gitignore:149` · `git status --porcelain -- <ruta>` = **vacío** ⇒ no commiteable y no commiteado |
| JSON modificado en este intento | **NO** (hash inicio = hash fin) |

## 13.2 Los 4 comandos del `Verify:` — ejecutados **por separado** (D-61)

Se ejecutaron uno por entrada, sin reutilizar el bloque con comillas desbalanceadas.

```
[V1] node audit/alignment/2026-10-25/90-matriz/tools/which_json_is_the_export.mjs          -> exit 0
[V2] node -e "…JSON.parse…PARSE_OK…"                                                       -> exit 0
[V3] node audit/alignment/2026-10-25/70-ssot-fix/tools/verify_levels.mjs                   -> exit 0
[V4] Get-FileHash …lab_master_22.6.0.json -Algorithm SHA256                                -> exit 0
```

### [V1] Gate del capitán — salida cruda (5 candidatos, misma ejecución)

```
lab_master_repo:                 bytes=280121 sha=60DBAB4B8CF7A15CD1D59E1F73A9B83FF469BCDD8A93D57345CC8259AB312A93 diffs=0/24
CRYSTAL-4K-UHD:                  bytes=280065 sha=099A1707A2F1AE692FFCFEDE01165F21CD66656B786742CE8DB518581A371FD4 diffs=10/24
EXPORT_20260611_020645:          bytes=222364 sha=6931BAF4BFA4C9EB0E565560220A2328DDBBF68E450B9E8307C6335E01382C93 diffs=0/24
MEMC-TOTAL-8K120_BACKUP_20260607: bytes=408126 sha=FFD3E0E06129067CAD28E7DCD908C505A13E88F16C5B7B0089596C5172CA1DD7 diffs=11/24
MEMC-TOTAL-8K120:                bytes=408174 sha=29C548050FFF3B3EBC0CD3ABE50CC64DDD2C5DF83687E233452A4A899B158865 diffs=10/24
```

**`lab_master_repo.totalDiffs === 0` → TRUE**, medido sobre el estado actual. El "antes" se demuestra en la **misma
ejecución** con el candidato `CRYSTAL-4K-UHD`, que es **byte-idéntico al pre-fix** (`099A1707…` = el `.bak`) y marca
**10/24**. Crudo: `T26B_gate_which_json.json`.

### [V2] Parseo + perfiles + `servers[]`

```
PARSE_OK profiles=P0,P1,P2,P3,P4,P5
servers_type=object isArray=true len=4
top_keys=playlist_format,exported_at,profiles_calibrated,nivel1_directives,nivel3_per_layer,servers,evasion_pool,config_global,placeholders_map,scoring_metadata,omega_gap_plan,lab_version,lab_schema_variant,bulletproof,meta_per_profile,prisma_lab_sync_v20,version,dnr_calibration
```

### [V3] `verify_levels.mjs` (llamado **sin argumentos**, como en el `Verify:`)

```
impossible_count = 0
unknown_count    = 1        (P0/DV: sin modelo de capacidad, declarado UNKNOWN — no se cuenta como PASS)
verdict          = ZERO_IMPOSSIBLE_LEVELS
```

Detalle por perfil (terna que se declara al player): P0 `dvh1.08.06` 7680x4320@30 → UNKNOWN · P1 `L153` 3840x2160@60
→ PASS · P2 `L150` 3840x2160@30 → PASS · P3 `L123` 1920x1080@60 → PASS · P4 `L93` 1280x720@30 → PASS ·
P5 `avc1.42c01e` 854x480@30 → PASS. Crudo: `T26B_levels.txt`.

### [V4] Hash

```
60DBAB4B8CF7A15CD1D59E1F73A9B83FF469BCDD8A93D57345CC8259AB312A93
```

## 13.3 Gate adicional re-ejecutado por el verificador

### [V5] Integridad estructural (respaldo → actual)

```
{
  "profiles_exactly_P0_P5": true,
  "root_keys_added": [], "root_keys_removed": [],
  "leaf_paths_added": 2, "leaf_paths_removed": 0,
  "changed_leaf_count": 53,
  "servers_equal": true,
  "app_consumed_all_present": true,
  "bytes_before": 280065, "bytes_after": 280121
}
```

⇒ No se perdió ninguna clave raíz, no se eliminó ninguna hoja, las 12 claves que consume la APP siguen presentes y
`servers[]` es **idéntico** al respaldo. Crudo: `T26B_structural.json`.

### [V6] `servers[]` — intacto y **sin transcribir** (D-24)

```
servers_isArray=true count=4
servers_block_sha256=94a6dfe9782593f4…      (hash del bloque; los valores NO se imprimen ni se copian)
servers_block_bytes=483
servers_keys_per_entry=["base_url","username","password","note"]   (sólo nombres de campo)
```

### [V7] `excel_vs_json` — el delta **28 → 9** medido por mí, no leído del log

| Instantánea | Total | P0 | P1 | P2 | P3 | P4 | P5 |
|---|---:|---:|---:|---:|---:|---:|---:|
| `BEFORE_excel_vs_json.json` (pre-fix) | **28** | 0 | 6 | 0 | 8 | 9 | 5 |
| `AFTER_excel_vs_json.json` (post-fix, intento 1) | **9** | 1 | 3 | 2 | 1 | 1 | 1 |
| **`T26B_excel_vs_json.json`** (re-ejecutado ahora) | **9** | 1 | 3 | 2 | 1 | 1 | 1 |

Las 9 restantes, verificadas una por una en la salida cruda: **3 × `X-Stream-FPS`** (`B352`/`C352`/`D352` → D-35),
**5 × `avgBitrateKbps`** (`C50`/`D50`/`E50`/`F50`/`G50` → D-36/B-12) y **1 × `X-Stream-Codecs`** en P1
(`C350`=`av01.0.15M.10` vs `hvc1.2.4.L153.B0` → D-22/D-34). **0 diffs en los campos corregibles.**
Crudo: `T26B_excel_vs_json.json`.

## 13.4 T12-F1 → `BLOCKED_BY_OWNER` (confirmado con medición propia)

| Hecho | Medición del verificador |
|---|---|
| ¿El contrato pina `lab_master`? | **NO** — `crystal_contracts.json`: **0** coincidencias de `lab_master` y **0** de `frontend`. La edición del SSOT **no puede** alterar el resultado |
| Único fallo del gate | `FAIL SHA MISMATCH _vps_stage/tests/fanout_concurrency.sh: contrato 9b774bffbe6c744f… vs real b558b1cdff883579…` → `RESULT=FAIL (1 fallos, 11 ok)`, exit 1 |
| ¿Es drift ajeno? | **Sí** — `git status --porcelain -- _vps_stage/tests/fanout_concurrency.sh` → ` M`; el pin `9b774bff…` **== bytes de HEAD** (verificado en t9 restando el blob), el disco tiene el WIP de otra sesión |
| ¿Idéntico antes y después del fix? | **Sí** — mismo par de hashes en `CONTRACTS_AFTER.txt` (t12) y en esta re-ejecución; ninguna variación atribuible a `lab_master` |
| Clasificación | **`BLOCKED_BY_OWNER`** (L-004/L-007). No se tocó `contracts/**` ni `_vps_stage/**` |

## 13.5 T12-F2 → defecto del `Verify:` del capitán (**D-61**), reconocido

El bloque original era un renglón con tres comandos y **comillas desbalanceadas** en el primero; tomado literalmente
habría engullido los otros dos. **Constancia que esta adenda vuelve a dar:** los 4 comandos del `Verify:` se
ejecutaron **por separado** (§13.2), con exit 0, y **el bloque roto no se usó como evidencia** en ningún entregable
de este intento. Regla D-61 aplicada: un comando por entrada.

## 13.6 T12-F3 → confirmado según **D-60** (sin cambiar el JSON)

| Perfil | `settings.fps` (celda `!X32`) | `X-Stream-FPS` (lo que ve el player) | `X-Max-Framerate` |
|---|---:|---:|---:|
| P0 | **120** | 30 | 30 |
| P1 | **120** | 60 | 60 |
| P2 | **120** | 30 | 30 |
| P3 | **120** | 60 | 60 |
| P4 | **120** | 30 | 30 |
| P5 | **120** | 30 | 30 |

- `settings.fps` se **conserva en `120`** = celda canónica `6_NIVEL_2_PROFILES!X32` ⇒ el gate vinculante sigue en
  **0 diffs**. **No se tocó el JSON por esto.**
- La corrección de capacidad vive en `X-Stream-FPS` (30/60/30/60/30/30), que es la terna medida en [V3]
  (5 PASS + 1 UNKNOWN DV) y coherente con los techos de D-35.
- El hueco residual (el emisor calcula `FRAME-RATE=` desde `settings.fps`) queda como **UNK-01** + **ticket E-1**,
  para t11. **No** se reintrodujo AV1 8K como códec declarado: `settings.codec_full` es `dvh1.08.06` en P0 y
  `hvc1.2.4.L*` en P1–P4, `avc1.42c01e` en P5. Las 19 apariciones de la cadena `av01` en el archivo son **rungs de
  soporte/prioridad** (`codec_priority`, `X-APE-CODEC`, `X-Codec-Support`) y son **byte-idénticas al respaldo
  pre-fix** (verificado campo por campo en P0/P1) ⇒ **no las introdujo el fix** (ver UNK-12).

## 13.7 Incidencia de proceso de este intento (declarada)

Al re-ejecutar `20-json/tools/excel_vs_json.mjs` **sin argumento de salida**, el script escribió su `default`
(`excel_vs_json.json`) en la **raíz del repo**. Se detectó de inmediato (`git status` → `?? excel_vs_json.json`,
46.216 B, mtime 23:45:05), se verificó la ruta absoluta y **se eliminó**; se re-ejecutó con salida explícita a
`70-ssot-fix/T26B_excel_vs_json.json`. **Estado final: raíz limpia** (`git status` sin coincidencias de
`excel_vs_json`). Se declara porque el reporte de no-mutación debe ser exacto, no porque quede residuo.

## 13.8 Artefactos **de este intento** (no pisan los del intento 1)

| Archivo | Bytes | Contenido |
|---|---:|---|
| `T26B_gate_which_json.json` | 10.166 | salida JSON íntegra de [V1] |
| `T26B_levels.txt` | 2.526 | salida JSON íntegra de [V3] |
| `T26B_structural.json` | 10.426 | integridad estructural [V5] |
| `T26B_excel_vs_json.json` | 46.216 | cruce de 22 campos [V7] |
| append §12 en `SSOT_VERIFY.md` | — | resumen de esta re-certificación |
| append UNK-12 en `SSOT_UNKNOWNS.md` | — | rungs AV1 preexistentes (no introducidos por el fix) |

## 13.9 Resumen del gate (idéntico al §11, re-medido; sin maquillaje)

| Gate | Resultado | ¿Depende de t12? |
|---|---|---|
| `which_json_is_the_export.mjs` → `totalDiffs` | **0 / 24** ✅ | sí (objetivo) |
| Parseo + P0..P5 | **OK** ✅ | sí |
| `verify_levels.mjs` → `ZERO_IMPOSSIBLE_LEVELS` | **0 imposibles** (1 UNKNOWN DV) ✅ | sí |
| Integridad estructural (`servers[]` intacto, 12/12 claves APP) | **OK** ✅ | sí |
| SHA-256 del JSON | **`60DBAB4B…2A93`** ✅ | sí |
| `excel_vs_json` | **9**, todas con ticket ✅ | sí |
| `contracts/verify_contracts.mjs` | **FAIL 1/11 → `BLOCKED_BY_OWNER`** ⛔ | **no** (drift ajeno; el contrato no pina `lab_master`) |
| `Verify:` como bloque literal | **inválido por comillas** (D-61) ⛔ | **no** (defecto del enunciado) |

**Veredicto del verificador sobre t26:** los **seis** gates que dependen del SSOT están en verde y son reproducibles
con los comandos de §13.2; los **dos** gates restantes están bloqueados por el owner con evidencia de que no son
atribuibles ni a t12 ni a t26. **El fix aplicado queda certificado.**

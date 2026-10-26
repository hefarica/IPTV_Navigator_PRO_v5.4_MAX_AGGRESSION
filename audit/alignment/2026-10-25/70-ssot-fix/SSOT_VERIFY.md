# SSOT_VERIFY — Verificación ejecutada de la remediación (t12)

Todas las cifras de este documento salen de **comandos ejecutados**, no de expectativas. Los artefactos crudos
están en esta misma carpeta (`*.json`, `*.txt`).

**Estado final del archivo**

| | valor |
|---|---|
| Ruta | `IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json` |
| Bytes | **280.121** (antes 280.065) |
| mtime | **2026-10-25T23:36:28.782-05:00** |
| SHA-256 | **`60DBAB4B8CF7A15CD1D59E1F73A9B83FF469BCDD8A93D57345CC8259AB312A93`** |
| Git | **untracked/gitignored** (`.gitignore:149`) → **no hay commit posible ni hecho** |

---

## 1. Aceptación VINCULANTE del capitán — `which_json_is_the_export.mjs`

```bash
node audit/alignment/2026-10-25/90-matriz/tools/which_json_is_the_export.mjs
```

| Candidato | `totalDiffs` | compares | bytes | sha256 |
|---|---:|---:|---:|---|
| **`lab_master_repo` (DESPUÉS)** | **0** | 24 | 280.121 | `60DBAB4B…2A93` |
| `CRYSTAL-4K-UHD` (= **estado ANTES**, byte a byte) | **10** | 24 | 280.065 | `099A1707…A371FD4` |
| `EXPORT_20260611_020645` (export fiel, N1) | 0 | 24 | 222.364 | `6931BAF4…2C93` |
| `MEMC-TOTAL-8K120_BACKUP_20260607` | 11 | 24 | 408.126 | `FFD3E0E0…1DD7` |
| `MEMC-TOTAL-8K120` | 10 | 24 | 408.174 | `29C54805…5865` |

**`lab_master_repo.totalDiffs === 0` → TRUE.** ✅ (aceptación vinculante satisfecha)

**Prueba del "antes" con el mismo comando y sin recomputar nada a mano:** el estado previo del archivo era
byte-idéntico a `Downloads/LAB_CALIBRATED_BULLETPROOF_22.6.0-CRYSTAL-4K-UHD.json` (mismo sha `099A1707…`), que
en **esta misma ejecución** mide `totalDiffs = 10` (P1 ×2, P3 ×3, P4 ×3, P5 ×2 — todos `settings.resolution`,
`settings.maxResolution` y `codec_full`), y coincide con lo que midió t9 (`10 diffs / 24 celdas`).
Artefacto: `GATE_which_json_FINAL.json`.

---

## 2. Snippets de verificación del contrato (literales)

```
$ node -e "... perfil ids + coherencia 8K/codec + chroma ..."
SSOT_COHERENCE_OK            (exit 0)

$ node -e "JSON.parse(...);console.log('JSON_PARSE_OK')"
JSON_PARSE_OK                (exit 0)
```
Artefacto: `VERIFY_OUTPUTS.txt`.

## 3. `node contracts/verify_contracts.mjs` — ANTES y DESPUÉS (drift explicado)

| Momento | Resultado | Detalle |
|---|---|---|
| **ANTES** de tocar el JSON | `RESULT=FAIL (1 fallos, 11 ok)` · exit 1 | `FAIL SHA MISMATCH _vps_stage/tests/fanout_concurrency.sh: contrato 9b774bff… vs real b558b1cd…` |
| **DESPUÉS** de la remediación | `RESULT=FAIL (1 fallos, 11 ok)` · exit 1 | **el mismo y único fallo** |

**El drift NO es mío y está atribuido con evidencia:** `git status --porcelain -- _vps_stage/tests/fanout_concurrency.sh`
→ ` M _vps_stage/tests/fanout_concurrency.sh` (archivo modificado en el working tree por **otra sesión**; el contrato
lo tiene pinado). Además el contrato **no pina `lab_master_22.6.0.json`** (0 coincidencias de `lab_master|channels_map`
en `contracts/crystal_contracts.json`), por lo que mi edición no puede alterar ese resultado: 1 fallo antes, 1 fallo
después, mismo archivo y mismo par de hashes. Artefacto: `CONTRACTS_AFTER.txt`.

## 4. ¿Queda algún nivel imposible? — `tools/verify_levels.mjs`

Compara **capacidad del nivel** contra la terna que se declara al player
(`X-Stream-Codecs` + `X-Stream-Resolution` + `X-Stream-FPS`):

| Perfil | ANTES | DESPUÉS | Detalle DESPUÉS |
|---|---|---|---|
| P0 | `UNKNOWN` | `UNKNOWN` | DV `dvh1.08.06` — sin modelo de capacidad (declarado, no PASS) |
| P1 | **`FAIL`** L153 → 4K@60 vs declarado 4K@**120** | **`PASS`** | `HEVC L153 → 4K@60 vs declarado 4K@60` |
| P2 | **`FAIL`** L150 → 4K@30 vs declarado 4K@**60** | **`PASS`** | `HEVC L150 → 4K@30 vs declarado 4K@30` |
| P3 | **`FAIL`** L120 → 1080p@30 vs declarado 1080p@**60** | **`PASS`** | `HEVC L123 → 1080p@60 vs declarado 1080p@60` |
| P4 | `PASS` (AVC 720p@30) | **`PASS`** | `HEVC L93 → 720p@30 vs declarado 720p@30` (ahora Main10) |
| P5 | `PASS` (AVC 480p@30) | **`PASS`** | `AVC L30 → 480p@30 vs declarado 480p@30` |

`LEVELS_BEFORE.json`: `impossible_count = 3`, `verdict = IMPOSSIBLE_LEVELS_PRESENT`.
`LEVELS_AFTER.json`: **`impossible_count = 0`**, `unknown_count = 1`, `verdict = ZERO_IMPOSSIBLE_LEVELS` (exit 0).

> El `UNKNOWN` de P0 **no** se convierte en PASS: DV a 8K no tiene modelo de capacidad en la tabla del repo y el
> manifiesto pide 120 fps con un *level idc* que no lo soporta. Queda declarado (ver `SSOT_UNKNOWNS.md` UNK-03).

## 5. Integridad estructural (no romper lo que consume la APP) — `tools/structural_integrity.mjs`

| Comprobación | Resultado |
|---|---|
| `profiles_calibrated` exactamente `P0,P1,P2,P3,P4,P5` | **true** |
| Claves raíz añadidas / eliminadas | **0 / 0** (siguen 18) |
| Rutas hoja eliminadas | **0** |
| Rutas hoja añadidas | **2** (`P4` y `P5` → `kodiprop.inputstream.adaptive.stream_headers`) |
| Hojas cuyo valor cambió | **53** (+2 de `name`/`role` en la 2.ª pasada = 55) |
| `servers` intacto (JSON idéntico, sin transcribir) | **true** (4 objetos) |
| `nivel1_directives` / `nivel3_per_layer` / `evasion_pool` / `config_global` / `placeholders_map` / `dnr_calibration` | **idénticos** (`untouched_blocks` = true) |
| Claves raíz que consume la APP (12, según `APP_SSOT_BINDINGS` t6) | **12/12 presentes** |
| Bytes | 280.065 → 280.121 |

Artefacto: `STRUCTURAL_INTEGRITY.json`. Contadores por perfil después del fix (sin huecos):

| Perfil | top | settings | vlcopt | kodiprop | headerOverrides |
|---|---:|---:|---:|---:|---:|
| P0 | 16 | 57 | 48 | 8 | 402 |
| P1 | 16 | 57 | 48 | 8 | 400 |
| P2 | 16 | 57 | 48 | 8 | 402 |
| P3 | 16 | 55 | 48 | 8 | 400 |
| P4 | 16 | 55 | 48 | **8** (antes 7) | 400 |
| P5 | 16 | 55 | 48 | **8** (antes 7) | 400 |

## 6. F-08 — placeholders `prisma.*` (resultado, no suposición)

`APPLY_RESULT.json → phReport`:

| Placeholder | ¿usado en el doc? | ¿registrado en `placeholders_map`? |
|---|---|---|
| `{prisma.bitrate_floor}` | true | **true** |
| `{prisma.target_bandwidth}` | true | **true** |

Además `{prisma.boost_multiplier}`, `{prisma.zap_grace}`, `{prisma.lanes_default}` y `{prisma.floor_lock_strict}`
también están usados **y** registrados. El namespace es real; **no hubo nada que corregir** y no se inventó nada.

## 7. `name` ↔ `resolution` (6/6)

| Perfil | `name` | `settings.resolution` | ¿Coincide? |
|---|---|---|---|
| P0 | `8K Master` | `7680x4320` | ✅ |
| P1 | `4K UHD` | `3840x2160` | ✅ |
| P2 | `4K UHD` (**antes `2K QHD`**) | `3840x2160` | ✅ (antes ✗) |
| P3 | `FHD 1080p` | `1920x1080` | ✅ |
| P4 | `HD 720p` | `1280x720` | ✅ |
| P5 | `SD 480p` | `854x480` | ✅ |

## 8. L10 (cruce de 22 campos JSON↔Excel) — 28 → 9, y las 9 son decisiones

`BEFORE_excel_vs_json.json` → **28 diffs** (P1 6, P3 8, P4 9, P5 5).
`AFTER_excel_vs_json.json` → **9 diffs**, todos con decisión escrita:

| Perfil | Campo | Celda | Excel | JSON | Por qué se queda así |
|---|---|---|---|---|---|
| P0 | `X-Stream-FPS` | `B352` | `60` | `30` | D-35: DV `08.06` no acredita 8K@60+; se declara 30 (UNKNOWN doctrinal) |
| P1 | `X-Stream-FPS` | `C352` | `120` | `60` | D-35: `L153` = 4K@**60** |
| P1 | `X-Stream-Codecs` | `C350` | `av01.0.15M.10,ac-3` | `hvc1.2.4.L153.B0,ac-3` | D-22: manda `C37`; AV1 8K prohibido. Ticket E-4 |
| P1 | `avgBitrateKbps` | `C50` | `75000` | `40000` | D-36/B-12: `avg ≤ max` |
| P2 | `X-Stream-FPS` | `D352` | `60` | `30` | D-35: `L150` = 4K@**30** |
| P2 | `avgBitrateKbps` | `D50` | `35000` | `25000` | D-36/B-12 |
| P3 | `avgBitrateKbps` | `E50` | `15000` | `10000` | D-36/B-12 |
| P4 | `avgBitrateKbps` | `F50` | `6000` | `5000` | D-36/B-12 |
| P5 | `avgBitrateKbps` | `G50` | `2200` | `2000` | D-36/B-12 |

**0 diffs en los campos CORREGIBLES** (resolución, maxResolution, codec, codec_full, codec_string, X-APE-CODEC,
X-APE-RESOLUTION, X-Codec-Support, vlcopt, codec_priority, bit_depth, hdrMode, videoRange, X-APE-FPS).
Las 9 restantes son **desviaciones ordenadas** (D-22/D-35/D-36), no defectos pendientes.

## 9. N3 — P2 no se emite en el catálogo vigente

Por instrucción del capitán (N3): P2 se ha corregido en el SSOT (resolución 4K canónica ya era correcta,
`X-Stream-FPS` 60→30, `avg` 35000→25000) pero **el catálogo vigente no emite ningún `STREAM-INF _P2` (0 casos)**,
así que **no se cuenta P2 como PASS de emisión**: queda `PASS` a nivel de SSOT y `NOT_EXERCISED` a nivel de catálogo.
No es un defecto introducido por este cambio.

## 10. No-mutación de lo que no era mío

- `servers[]` (4 pares de credenciales): **intacto** y **no transcrito** en ningún documento (`servers_equal: true`).
- Excel canónico: **no se tocó** (no se abrió ni se escribió; sólo se leyó el extracto de t4).
- Código de la APP (`frontend/js/**`, `backend/**`, `vps/**`): **no se tocó** (t11).
- Archivos ajenos del working tree (los `M`/`D` de otras sesiones): **no se tocaron**.

---

## 11. Re-certificación t26 (2026-10-25 23:42–23:45) — gates que SÍ pueden pasar

Re-ejecutado sobre el estado actual (no sobre el log de t12). JSON **sin cambios en t26**: 280.121 B ·
`60DBAB4B8CF7A15CD1D59E1F73A9B83FF469BCDD8A93D57345CC8259AB312A93`.

| Gate | Comando | Resultado |
|---|---|---|
| Gate del capitán | `node audit/alignment/2026-10-25/90-matriz/tools/which_json_is_the_export.mjs` | **`lab_master_repo.totalDiffs = 0 / 24`** · exit 0 (el candidato byte-idéntico al pre-fix, `CRYSTAL-4K-UHD`, mide 10) |
| Parseo | `node -e "…PARSE_OK…"` | `PARSE_OK profiles=P0,P1,P2,P3,P4,P5` · exit 0 |
| Niveles | `node audit/alignment/2026-10-25/70-ssot-fix/tools/verify_levels.mjs` | `ZERO_IMPOSSIBLE_LEVELS` · `impossible_count=0` · `unknown_count=1` (P0/DV) · exit 0 |
| Hash | `Get-FileHash … -Algorithm SHA256` | `60DBAB4B8CF7A15CD1D59E1F73A9B83FF469BCDD8A93D57345CC8259AB312A93` |
| Integridad estructural | `structural_integrity.mjs` | `profiles_exactly_P0_P5=true` · 0 claves raíz ± · 2 hojas añadidas · 0 eliminadas · `servers_equal=true` (4 pares, **no transcritos**) · 12/12 claves APP |
| `excel_vs_json` (22 campos) | `excel_vs_json.mjs` | **9 diffs**, todas con ticket (3 × D-35 · 5 × D-36 · 1 × D-22) · **0 en campos corregibles** |
| `contracts/verify_contracts.mjs` | idem | `FAIL 1/11` → **`BLOCKED_BY_OWNER`** (L-004/L-007): el contrato tiene **0** menciones de `lab_master` y el único fallo es `_vps_stage/tests/fanout_concurrency.sh` (drift de otra sesión, ` M` en git status, pin `9b774bff…` vs real `b558b1cd…`) |

**Ajuste de herramienta (t26, dentro de `70-ssot-fix/tools/`):** `verify_levels.mjs` usa por defecto la ruta del
`lab_master` del repo cuando se invoca sin argumentos — como lo llama el `Verify:` del contrato. Es el único cambio
de código de t26 y no toca el JSON.

Detalle y salidas crudas: `T12_REPAIR_LOG.md`, `T26_raw_verify.txt`, `T26_gate_which_json.json`,
`T26_levels.json`, `T26_structural.json`, `T26_excel_vs_json.json`, `T26_contracts.txt`.

---

## 12. Re-verificación independiente — intento 2 (2026-10-25 23:44–23:50)

Ejecutada por `verificador-alineacion` (attempt `bf128d29…`) **sin rehacer el fix y sin tocar el JSON**
(hash idéntico al inicio y al final: `60DBAB4B…2A93`). No sustituye a §11: la confirma con artefactos propios
(`T26B_*`). Detalle completo: `T12_REPAIR_LOG.md` §13.

| Gate | Comando (uno por entrada, D-61) | Resultado medido ahora |
|---|---|---|
| Gate del capitán | `which_json_is_the_export.mjs` | **0 / 24** en `lab_master_repo`; **10 / 24** en el candidato byte-idéntico al pre-fix (`CRYSTAL-4K-UHD`) ⇒ el "antes" se demuestra en la misma ejecución |
| Parseo | `node -e "…PARSE_OK…"` | `PARSE_OK profiles=P0,P1,P2,P3,P4,P5` · `servers[]` isArray len=4 |
| Niveles | `verify_levels.mjs` (sin args) | `ZERO_IMPOSSIBLE_LEVELS` · `impossible_count=0` · `unknown_count=1` (P0/DV) |
| Hash | `Get-FileHash` | `60DBAB4B8CF7A15CD1D59E1F73A9B83FF469BCDD8A93D57345CC8259AB312A93` |
| Integridad estructural | `structural_integrity.mjs <bak> <actual> <out>` | `profiles_exactly_P0_P5=true` · 0 claves raíz ± · 2 hojas + · 0 − · 53 hojas cambiadas · `servers_equal=true` · 12/12 claves APP · 280.065 → 280.121 B |
| `servers[]` | hash del bloque (sin transcribir valores) | `94a6dfe9782593f4…` · 483 B · 4 entradas · claves `base_url/username/password/note` |
| `excel_vs_json` | `excel_vs_json.mjs <out>` | **28 → 9** verificado por mí (no leído del log): 3 × `X-Stream-FPS` (D-35) · 5 × `avgBitrateKbps` (D-36) · 1 × `X-Stream-Codecs` P1 (D-22) |
| `contracts/verify_contracts.mjs` | idem | `FAIL (1/11)` → **`BLOCKED_BY_OWNER`**; `crystal_contracts.json` tiene **0** menciones de `lab_master` y **0** de `frontend` |
| `settings.fps` (D-60) | lectura directa | **120 en 6/6** (celda `!X32`) · `X-Stream-FPS` = 30/60/30/60/30/30 · `X-Max-Framerate` idem |

**Artefactos propios del intento 2:** `T26B_gate_which_json.json`, `T26B_levels.txt`, `T26B_structural.json`,
`T26B_excel_vs_json.json`. **Incidencia declarada:** una ejecución de `excel_vs_json.mjs` sin argumento de salida
escribió su `default` en la raíz del repo; se detectó por `git status`, se verificó la ruta y se eliminó en el acto
(raíz limpia al cierre). No queda residuo.

**Conclusión:** los seis gates que dependen del SSOT están en verde y son reproducibles; los dos restantes no son
atribuibles a t12/t26 (drift ajeno + defecto del `Verify:`).

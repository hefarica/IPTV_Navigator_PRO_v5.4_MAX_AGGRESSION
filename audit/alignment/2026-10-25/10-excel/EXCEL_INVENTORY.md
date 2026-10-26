# EXCEL_INVENTORY — SSOT LAB (`APE_M3U8_LAB_v8_FIXED.xlsm`)

**Lane:** t4 · `excel-ssot` · **Ámbito de escritura:** `audit/alignment/2026-10-25/10-excel/**` (única escritura; producción intacta)
**Fecha de medición:** 2026-10-25 (America/Bogota) · **Método:** lectura OOXML pura (zipfile + ElementTree) sobre copia temporal hash-verificada. Excel **nunca** se abrió: sin `Excel.Application`, sin COM, sin macros, sin `.Save()`.
**Evidencia cruda regenerable:** `_raw/` (inventario, volcados por hoja, fórmulas, VBA) + `tools/` (3 scripts reproducibles).

---

## 0 · Veredicto en 5 líneas

1. El SSOT vivo **existe y se localizó**: `C:\Users\HFRC\Downloads\APE_M3U8_LAB_v8_FIXED.xlsm`, `sha256=663EF44E…806A`, 3 582 019 B, `mtime=2026-06-11T01:54:49-05:00`, **55 hojas**, **VBA presente (1 715 712 B)**.
2. Está **fuera del repo** (el repo solo conserva 4 snapshots históricos de 47 hojas del 2026-04-26) → el SSOT no está versionado.
3. Existe una **segunda rama divergente** en `C:\Users\HFRC\Documents\APE_M3U8_LAB_v8_FIXED.xlsm` (56 hojas, `sha256=E3BC629E…2DBD`, 7 134 977 B) que **sí** contiene `30_DISNEY_GRADE_DIRECTIVES` y cuya calibración P1/P3/P4 **no coincide** con la rama de Downloads.
4. El último escritor de las tres ramas fue **openpyxl** (`docProps/core.xml <dc:creator>openpyxl</dc:creator>`), no Excel. La rama canónica fue reescrita 2026-06-11T06:54:49Z y exportada a JSON 12 minutos después (`LAB_CALIBRATED_20260611_020645.json`, 2026-06-11T02:06:45-05:00).
5. **Cero escrituras** en cualquier `.xlsm`: hash de origen y hash de la copia leída son idénticos (`matchesSource: true`).

---

## 1 · Identidad del archivo canónico

| Campo | Valor |
|---|---|
| Ruta | `C:\Users\HFRC\Downloads\APE_M3U8_LAB_v8_FIXED.xlsm` |
| SHA-256 | `663EF44E2D69521EB0E77DDA7B64A32EA4F942992F8F2C80614EAEE8EC52806A` |
| Tamaño | 3 582 019 B (3.42 MiB) |
| mtime (local) | 2026-06-11T01:54:49.0807132-05:00 |
| mtime (UTC) | 2026-06-11T06:54:49Z |
| Entradas del paquete | 111 |
| Partes de hoja | 55 (`xl/worksheets/sheet1..sheet55.xml`) |
| VBA | **SÍ** — `xl/vbaProject.bin` (1 715 712 B), **sin** `vbaProjectSignature.bin` |
| Módulos VBA | 74 (12 `.bas`, 1 `.frm`, 61 clases de hoja/ThisWorkbook) |
| Shared strings | 39 709 declarados = 39 709 parseados (coincide) |
| `xl/calcChain.xml` | presente |
| Comentarios | `xl/comments1.xml` (1) |
| Drawings | 15 partes |
| Protección de libro (`workbookProtection`) | **ninguna** |
| Protección de hoja | **4 hojas** (ver §4) |
| `docProps/core.xml` | creator **openpyxl**, lastModifiedBy `o 6742`, created `2026-04-12T17:23:55Z`, modified `2026-06-11T06:54:49Z` |
| `docProps/app.xml` | `Application=Microsoft Excel`; declara **51** hojas y **29** rangos con nombre (obsoleto: reales 55 y 44) |

> **Por qué este archivo y no otro.** (a) Es el de `mtime` más reciente de toda la familia LAB; (b) es el único con las 8 hojas nuevas (`8_CODEC_LADDER`, `15_FLOOR_LOCK_CONFIG`, `16_SENTINEL_PROVIDERS`, `17_TELESCOPE_THRESHOLDS`, `19_ADB_PAYLOAD_INJECTOR`, `33_UA_POOL`, `98_VALIDATIONS`, `99_PRISMA_AUDIT_REPORT`); (c) sus hojas `25_JSON_EXPORT!B4` y `30_EXPORT_FINAL!B4/B5` apuntan la salida a `C:\Users\HFRC\Downloads\APE_PROFILE_LAB_OUT.json` (mismo directorio); (d) 12 minutos después del guardado existe `Downloads\LAB_CALIBRATED_20260611_020645.json` — la exportación de esa misma sesión. Nombre doctrinal `APE_M3U8_LAB_v8_FIXED.xlsm` ✔.

---

## 2 · Cómo se leyó (garantías y no-garantías)

```
fuente (solo lectura)  --Get-FileHash-->  sha256 = 663EF44E…806A
      │
      ├── Copy-Item a %TEMP%\lab_ssot_ro_*\APE_M3U8_LAB_v8_FIXED.xlsm
      │        └── sha256 de la copia = 663EF44E…806A   (matchesSource: true)
      │
      └── parseo EXCLUSIVO sobre la copia: zipfile + xml.etree.ElementTree
               ├── xl/workbook.xml            (hojas, estado, definedNames)
               ├── xl/_rels/workbook.xml.rels (rId → parte)
               ├── xl/sharedStrings.xml       (39 709 cadenas)
               ├── xl/worksheets/*.xml        (celdas, fórmulas, merges, sheetProtection)
               └── xl/vbaProject.bin          (solo lectura, vía oletools/olevba)
```

Pre-vuelo medido (protocolo `iptv-excel-safe-mode`): **0** procesos `EXCEL.EXE`; **ningún** archivo de bloqueo `~$APE_M3U8_LAB_v8_FIXED.xlsm` en `Downloads` (los 55 `~$*` presentes pertenecen a otros libros ajenos al LAB). Por tanto no hubo ni hace falta COM en modo ReadOnly: se usó **copia a temp**, la opción preferente del mandato.

Lo que **no** se hizo: abrir con Excel, `Save`, `Close`, tocar VBA, escribir en `xl/worksheets/*` o en el `.xlsm`, ni ejecutar macro alguna. Los scripts escriben únicamente en `audit/alignment/2026-10-25/10-excel/**` y en el directorio temporal, que se borra al terminar.

---

## 3 · Grafo de hojas (55)

Columnas: `#` índice de orden del libro · `estado` visible/hidden/veryHidden · `dim` dimensión declarada (`<dimension ref>`) · `celdas` celdas con valor · `fórm` fórmulas · `merge` rangos combinados · `prot` `sheetProtection` presente · `bytes` tamaño de la parte XML.

| # | Hoja | Estado | dim | celdas | fórm | merge | prot | bytes |
|---:|---|---|---|---:|---:|---:|:--:|---:|
| 1 | `1_README` | visible | A1:A70 | 59 | 0 | 0 | – | 7 206 |
| 2 | `98_VALIDATIONS` | visible | B1:B6 | 6 | 0 | 0 | – | 1 474 |
| 3 | `2_CATALOGO_MASTER` | visible | A1:J1762 | 17 620 | 0 | 0 | – | 607 919 |
| 4 | `3_CAPAS` | visible | A1:G17 | 119 | 0 | 0 | – | 6 031 |
| 5 | `4_MIME_TYPES` | visible | A1:D16 | 64 | 0 | 0 | – | 3 992 |
| 6 | `6_NIVEL_2_PROFILES` | visible | A1:H663 | 4 474 | 0 | 5 | – | 215 091 |
| 7 | `5_NIVEL_1_HEADER` | visible | A1:F72 | 240 | 0 | 3 | – | 15 703 |
| 8 | `7_NIVEL_3_CHANNEL` | visible | A1:G91 | 454 | 0 | 3 | – | 26 636 |
| 9 | `8_MATRIX_3D` | visible | A1:BC2398 | 19 710 | 0 | 3 | – | 726 434 |
| 10 | `00_OMEGA_SCORECARD` | visible | A1:E68 | 303 | 0 | 0 | – | 16 346 |
| 11 | `18_CONFIG` | visible | A1:E52 | 186 | 0 | 2 | – | 12 994 |
| 12 | `19_ADB_PAYLOAD_INJECTOR` | visible | A1:F38 | 217 | 0 | 2 | – | 12 333 |
| 13 | `31_SOLVER_SETUP` | visible | A1:F61 | 233 | **15** | 5 | – | 15 537 |
| 14 | `36_BRAIN_SELECTOR` | visible | B1:T72 | 176 | **2** | 28 | – | 20 827 |
| 15 | `9_BRAIN_DASHBOARD` | visible | A1:H80 | 140 | 0 | 5 | – | 18 789 |
| 16 | `33_CHANNELS_FROM_FRONTEND` | visible | A1:BK37131 | **393 759** | 0 | 0 | – | 15 865 456 |
| 17 | `34_BRAIN_SCORING` | visible | A1:V2889 | 63 515 | 0 | 0 | – | 1 913 424 |
| 18 | `10_HOMOLOGATION` | visible | A1:F33 | 187 | 0 | 1 | – | 9 249 |
| 19 | `11_EXPANSION_ZONE` | visible | A1:I107 | 21 | 0 | 1 | – | 25 068 |
| 20 | `12_FORMATOS` | visible | A1:F13 | 78 | 0 | 0 | – | 4 369 |
| 21 | `13_CRYPTO` | visible | A1:E33 | 134 | 0 | 3 | – | 7 444 |
| 22 | `14_KEYRING` | **veryHidden** | A1:F18 | 45 | 0 | 0 | **sí** | 4 906 |
| 23 | `15_CMCD_QOE` | visible | A1:E26 | 121 | 0 | 0 | – | 6 578 |
| 24 | `16_EVASION` | visible | A1:G41 | 199 | 0 | 4 | – | 10 681 |
| 25 | `17_SERVERS_POOL` | **veryHidden** | A1:I19 | 101 | 0 | 1 | **sí** | 8 205 |
| 26 | `19_URL_BUILDER` | visible | A1:G34 | 75 | **1** | 4 | – | 12 245 |
| 27 | `20_URL_PROBE` | visible | A1:D17 | 61 | 0 | 0 | – | 4 876 |
| 28 | `21_WATERFALL` | visible | A1:F21 | 105 | 0 | 0 | – | 6 486 |
| 29 | `22_UX_IMPACT` | visible | A1:D35 | 105 | **2** | 4 | – | 7 232 |
| 30 | `23_BOTTLENECK` | visible | A1:D23 | 64 | 0 | 3 | – | 5 267 |
| 31 | `24_JSON_IMPORT` | visible | A1:D21 | 42 | 0 | 1 | – | 4 503 |
| 32 | `25_JSON_EXPORT` | visible | A1:E13 | 28 | 0 | 0 | – | 2 623 |
| 33 | `26_JSON_DIFF` | visible | A1:D7 | 21 | 0 | 0 | – | 2 163 |
| 34 | `27_COMPAT_MATRIX` | visible | A1:K21 | 66 | 0 | 0 | – | 10 310 |
| 35 | `28_PREVIEW_M3U8` | visible | A1:D5 | 13 | 0 | 0 | – | 1 835 |
| 36 | `29_STATS_HISTORY` | visible | A1:H10 | 41 | 0 | 0 | – | 4 559 |
| 37 | `30_EXPORT_FINAL` | visible | A1:B19 | 24 | 0 | 1 | – | 2 781 |
| 38 | `32_PLACEHOLDERS_MAP` | visible | A1:I69 | 546 | **30** | 3 | – | 26 776 |
| 39 | `_LISTAS` | visible | A1:R49 | 178 | 0 | 0 | – | 9 384 |
| 40 | `37_VALORES_UNIFICADOS` | visible | A1:M2889 | 21 132 | 0 | 0 | – | 836 052 |
| 41 | `35_UNIVERSAL_COMPAT_RESULT` | visible | A1:J24 | 212 | 0 | 0 | – | 8 853 |
| 42 | `00_MACRO_RUN_REPORT` | visible | A1:F25 | 92 | 0 | 0 | – | 5 457 |
| 43 | `00_WIRING_LOG` | visible | A1:B322 | 644 | 0 | 0 | – | 43 988 |
| 44 | `00_SOLVER_DIARY` | visible | A1:D62 | 180 | 0 | 0 | – | 11 251 |
| 45 | `00_CONVERGENCE_DIARY` | visible | A1:E46 | 161 | 0 | 0 | – | 9 761 |
| 46 | `_LISTAS_OMEGA` | hidden | A1:B4 | 5 | 0 | 0 | – | 1 343 |
| 47 | `98_SHIELD_IMMUTABLE` | **veryHidden** | A1:D12 | 18 | 0 | 3 | **sí** | 2 991 |
| 48 | `00_EXPORT_STAGE` | hidden | A1:C7 | 21 | 0 | 0 | – | 2 063 |
| 49 | `99_DEAD_CHANNELS_BLACKLIST` | **veryHidden** | A1:L573 | 6 809 | 0 | 0 | **sí** | 248 117 |
| 50 | `15_FLOOR_LOCK_CONFIG` | visible | A1:C17 | 47 | 0 | 2 | – | 4 373 |
| 51 | `16_SENTINEL_PROVIDERS` | visible | A1:H25 | 75 | 0 | 2 | – | 8 258 |
| 52 | `17_TELESCOPE_THRESHOLDS` | visible | A1:C30 | 86 | 0 | 2 | – | 6 427 |
| 53 | `99_PRISMA_AUDIT_REPORT` | visible | A1:E13 | 57 | 0 | 2 | – | 4 387 |
| 54 | `8_CODEC_LADDER` | visible | A1:F7 | 42 | 0 | 0 | – | 3 181 |
| 55 | `33_UA_POOL` | visible | A1:E13 | 65 | 0 | 0 | – | 3 624 |

**Totales:** 533 176 celdas con valor · **50 fórmulas** (5 hojas) · 93 rangos combinados · 6 hojas no visibles.

---

## 4 · Fórmulas, protecciones, hojas ocultas

**Fórmula vs literal.** El libro es abrumadoramente **literal**: 50 fórmulas de 533 176 celdas (0,0094 %).

| Hoja | Fórmulas | Muestra (celda → fórmula) |
|---|---:|---|
| `32_PLACEHOLDERS_MAP` | 30 | `C9` → `INDEX('18_CONFIG'!C:C, MATCH("Referer_Default", '18_CONFIG'!B:B, 0))` (mismo patrón en `C9:C38`, 30 placeholders resueltos contra `18_CONFIG`) |
| `31_SOLVER_SETUP` | 15 | `E6` → `INDIRECT(C6)` (volátil), `E7:E11` vacías salvo `F10`=`100` |
| `36_BRAIN_SELECTOR` | 2 | `C30` → `SUM(C25:C29)`; `N52` → `'18_CONFIG'!C11` |
| `22_UX_IMPACT` | 2 | — (no impreso en este informe; volcado en `_raw/formulas/29_22_UX_IMPACT.tsv`) |
| `19_URL_BUILDER` | 1 | — (`_raw/formulas/26_19_URL_BUILDER.tsv`) |

**Protecciones de hoja** (`<sheetProtection>` con SHA-512, `spinCount=100000`, `sheet/objects/scenarios = 1`): `14_KEYRING`, `17_SERVERS_POOL`, `98_SHIELD_IMMUTABLE`, `99_DEAD_CHANNELS_BLACKLIST`. **Ninguna** contraseña se intentó ni se descifró (fuera de alcance y prohibido). El libro **no** tiene `workbookProtection`.

**Hojas ocultas:** `14_KEYRING` (veryHidden), `17_SERVERS_POOL` (veryHidden), `98_SHIELD_IMMUTABLE` (veryHidden), `99_DEAD_CHANNELS_BLACKLIST` (veryHidden), `_LISTAS_OMEGA` (hidden), `00_EXPORT_STAGE` (hidden).
Consecuencia práctica: un lector que solo mire "hojas visibles" pierde el pool de servidores, el keyring, el token SHIELD, la blacklist de 567 canales muertos y el área de staging de export.

---

## 5 · Cableado del libro (medido sobre el VBA extraído, no supuesto)

**Rangos con nombre: 44.** Los relevantes a la cadena:

| Nombre | Referencia | Consumidor |
|---|---|---|
| `PRISMA_CODEC_LADDER_P0..P5` | `'8_CODEC_LADDER'!$B$2:$F$2 … $B$7:$F$7` | `mod_PRISMA_CodecLadder_Read.bas` → `GetCodecLadder`, `ValidateCodecLadder`, `DoctrineCheck_P5_NoAdvanced` (doctrina: *NO-CLAMP, texto byte-idéntico*) |
| `SHIELD_MASTER_TOKEN`, `SHIELD_URL_PREFIX`, `SHIELD_VPS_HOST`, `SHIELD_API_AUTH`, `SHIELD_REGISTRY`, `SHIELD_OWNER`, `SHIELD_GENERATED` | `'98_SHIELD_IMMUTABLE'!$B$3..$B$9` | generator |
| `DEAD_CHANNELS_DATA`, `DEAD_CHANNELS_COUNT`, `DEAD_CHANNELS_GENERATED` | `'99_DEAD_CHANNELS_BLACKLIST'!$A$2:$L$567`, `$A$569`, `$A$570` | generator |
| `PH_*` (`PH_ALL`,`PH_PROFILE`,`PH_CHANNEL`,`PH_CONFIG`,`PH_CALC`,`PH_OTHER`), `prisma_boost_multipliers`, `prisma_floor_values_mbps`, `prisma_lanes`, `prisma_lane_states` | `_LISTAS`, `_LISTAS_OMEGA` | generator / validación |

**Módulos que tocan el SSOT** (conteo de menciones literales de la hoja):
`APE_WIRING.bas` (19), `APE_LAB_BRAIN.bas` (7), `APE_OMEGA_MATH.bas` (5), `APE_CONVERGE_SIMPLE.bas` (4), `mod_PRISMA_Export.bas` (4), `APE_COHERENCE.bas` (2), `APE_CASCADE.bas` (2), `mod_PRISMA_Validate.bas` (1), `mod_PRISMA_Resolver.bas` (1), `mod_PRISMA_BulletproofEnrich.bas` (1).

**Quién emite qué (evidencia VBA):**
- `mod_PRISMA_Export.bas` → `Const SHEET_PROFILES = "6_NIVEL_2_PROFILES"`; exporta `profile_boost_multipliers.json` (filas `prisma_*` × cols B–G) + `15_FLOOR_LOCK_CONFIG`, `16_SENTINEL_PROVIDERS`, `17_TELESCOPE_THRESHOLDS`, `33_CHANNELS_FROM_FRONTEND` (DNA de canales).
- `APE_LAB_BRAIN.bas` → construye `nivel3_per_layer` leyendo `7_NIVEL_3_CHANNEL` **filtrando por `Cells(r,1)="X"`**, y `servers[]` leyendo `17_SERVERS_POOL` columnas C/D/E (base_url / username / password).

---

## 6 · Copias alternativas y divergencias (todo medido con hash)

| Archivo | SHA-256 | Bytes | mtime local | Hojas | VBA B | sst | Nota |
|---|---|---:|---|---:|---:|---:|---|
| `Downloads\APE_M3U8_LAB_v8_FIXED.xlsm` | `663EF44E…806A` | 3 582 019 | 2026-06-11T01:54:49 | **55** | 1 715 712 | 39 709 | **canónico de la cadena** |
| `Downloads\APE_M3U8_LAB_v8_FIXED_BACKUP_20260607_152034.xlsm` | `196D7BF8…F0A0` | 3 582 025 | 2026-05-23T01:45:34 | 55 | 1 715 712 | 39 696 | predecesor inmediato (13 cadenas menos) |
| `Documents\APE_M3U8_LAB_v8_FIXED.xlsm` | `E3BC629E…2DBD` | 7 134 977 | 2026-05-19T17:11:05 | **56** | 1 823 744 | 97 543 | **rama divergente**: +`30_DISNEY_GRADE_DIRECTIVES` |
| `Downloads\APE_M3U8_LAB_v8_FIXED_REPAIRED.xlsm` | `611E8A65…C55D` | 7 009 817 | 2026-05-22T21:47:28 | 55 | 1 140 736 | 97 584 | reparado, VBA reducido 574 KB |
| `Downloads\APE_M3U8_LAB_v8_FIXED.DAMAGED_openpyxl.xlsm` | `26FE36AE…79FA` | 6 138 691 | 2026-05-22T20:35:04 | 55 | 1 102 848 | **sin `sharedStrings.xml`** | evidencia del daño por reescritura openpyxl |
| `Downloads\APE_M3U8_LAB_v8_FIXED.PRE_AUDIT.xlsm` | `060255DD…175A` | 3 261 886 | 2026-04-26T08:57:46 | 47 | 1 590 784 | 38 575 | = snapshot `PRE_COM_FINALIZE` del repo |
| `Downloads\APE_M3U8_LAB_v8_FIXED_BACKUP_premigration.xlsm` | (no hasheado) | 1 161 177 | 2026-04-15T02:39:45 | — | — | — | semilla pre-migración |
| `Downloads\APE_M3U8_LAB.xlsm` | (no hasheado) | 173 108 | 2026-04-12T11:19:59 | — | — | — | semilla original |

**Diferencias de metadatos rama canónica vs rama Documents (mismo libro, mismo nombre):**

| Dimensión | Downloads (canónica) | Documents | Impacto |
|---|---|---|---|
| Hojas | 55 | 56 | `30_DISNEY_GRADE_DIRECTIVES` **solo** existe en Documents |
| `6_NIVEL_2_PROFILES` | filas 1–663, 647 claves | filas 1–644, 629 claves | 18 claves solo en canónica; 110 filas con valores distintos |
| P2 `headerOverrides.X-APE-AI-*` | rellenas | **vacías** (col D) | la rama Documents no tiene overrides AI en P2 |
| `codec_chain_video` | incluye `L183/L180` (8K) | `L153,L150,L156,L123,L120,L93` | cadenas de codec distintas |
| `codec_chain_audio` | `mp4a.40.2,ac-3,mp4a.40.5` | `ec-3,ac-3,mp4a.40.2,mp4a.40.5` | audio primario distinto |
| `settings.codec_full` | P1 `hvc1.2.4.L153.B0`, P3 `hvc1.2.4.L123.B0`, P4 `hvc1.2.4.L93.B0` | idem P1/P3/P4 (coincide aquí) | — |
| `lst_PlayerTargets` | `'98_VALIDATIONS'!F2C2:F7C2` (**R1C1**) | `'98_VALIDATIONS'!$B$2:$B$6` (A1) | canónica usa notación R1C1 en un named range |

---

## 7 · Snapshots históricos versionados en el repo

Ruta: `IPTV_v5.4_MAX_AGGRESSION\_audit_snapshot\2026-04-26_audit_e2e_replicated\`

| Archivo | SHA-256 | Bytes | Hojas | VBA B | sst | Diferencia vs canónica |
|---|---|---:|---:|---:|---:|---|
| `…PRE_FIX_20260426_083814.xlsm` | `F8FFFCD2…970C` | 3 261 878 | 47 | 1 590 784 | 38 575 | faltan las 8 hojas nuevas |
| `…PRE_AUDIT_FIXES_20260426_083453.xlsm` | `F8FFFCD2…970C` | 3 261 878 | 47 | 1 590 784 | 38 575 | **byte-idéntico a PRE_FIX** (nombre distinto, mismo contenido) |
| `…PRE_COM_FINALIZE_20260426_090945.xlsm` | `060255DD…175A` | 3 261 886 | 47 | 1 590 784 | 38 575 | +8 B vs PRE_FIX |
| `…BROKEN_NO_BUTTONS_20260426_095227.xlsm` | `E2AD7772…EB72` | 3 160 208 | 47 | **1 148 928** | 38 564 | VBA −441 856 B (módulos de botones retirados) |

Hojas ausentes en los 4 snapshots respecto del canónico: `98_VALIDATIONS`, `19_ADB_PAYLOAD_INJECTOR`, `15_FLOOR_LOCK_CONFIG`, `16_SENTINEL_PROVIDERS`, `17_TELESCOPE_THRESHOLDS`, `99_PRISMA_AUDIT_REPORT`, `8_CODEC_LADDER`, `33_UA_POOL`.
Hojas ocultas en los snapshots: solo `_LISTAS_OMEGA` y `00_EXPORT_STAGE` → la protección por `veryHidden` de `KEYRING`/`SERVERS_POOL`/`SHIELD_IMMUTABLE`/`DEAD_CHANNELS` **no existía** el 2026-04-26.
Copia extra fuera del repo: `Downloads\APE_M3U8_LAB_v8_FIXED.PRE_AUDIT.xlsm` tiene **el mismo hash** que el snapshot `PRE_COM_FINALIZE` (`060255DD…`).

---

## 8 · Exposición de secretos dentro del libro (valores enmascarados aquí)

El `.xlsm` contiene credenciales y claves **en claro** (no hay cifrado de libro). Ubicaciones y conteo exactos:

| Hoja | Rango | Contenido | Conteo |
|---|---|---|---|
| `17_SERVERS_POOL` | `C4:E19` | `base_url`, `username`, `password` por servidor | 6 servidores en `C4:E9` + 4 en `C14:E17` (más 1 sin credenciales) |
| `14_KEYRING` | `A4:F8` | keyring rotulado *"claves criptograficas (en claro - lab personal)"*, 5 llaves (`jwt_v1`, `aes_main`, `hmac_session`, `iv_static`, `hydra_key`) | 5 × 4 campos |
| `98_SHIELD_IMMUTABLE` | `B3` | `SHIELD_MASTER_TOKEN` (64 hex) | 1 |
| `99_DEAD_CHANNELS_BLACKLIST` | `F2:G568` | `user`/`pass` por canal muerto | 567 filas |
| `6_NIVEL_2_PROFILES` | `B532:G533` | `Proxy-Authorization` / `X-Auth-Stub-Basic` = `Basic <base64 de anon:anon>` | 12 celdas (6 perfiles × 2 claves) |

Ningún valor se reproducen en este informe (protocolo §11: *"Nunca exponer credenciales/tokens en avisos, board, ni reportes"*). Que existan es un **hallazgo de seguridad** independiente: `APE_LAB_BRAIN.bas` los escribe en el JSON exportado (`servers[] {base_url, username, password}`), ver `EXCEL_FINDINGS.md` F-13.

---

## 9 · UNKNOWN declarados (con motivo)

| # | UNKNOWN | Motivo | Cómo cerrarlo |
|---|---|---|---|
| U-1 | ¿Cuál de las dos ramas (Downloads 55 hojas vs Documents 56 hojas) es la "verdad" para el owner? | Ambas tienen `creator=openpyxl`, mismo `created`, y no hay commit ni tag que las distinga. La evidencia favorable a Downloads es circunstancial (mtime + export 12 min después + 18 claves extra), no una declaración del owner. | Confirmación explícita del owner (o del capitán) + `json-ssot` verificando qué rama produjo `LAB_CALIBRATED_BULLETPROOF_22.6.0-*` |
| U-2 | Contraseña de las 4 hojas protegidas | `sheetProtection` SHA-512/spin 100000; descifrarla está fuera de alcance y prohibido | No aplica |
| U-3 | Autoría real de los valores calibrados | `lastModifiedBy = "o 6742"` sobre `creator=openpyxl`; no hay historial dentro del libro | `git log` del repo no ayuda (el `.xlsm` no está versionado) |
| U-4 | Efecto exacto de la reescritura openpyxl sobre validaciones/formatos condicionales/formas | Solo se midió estructura OOXML; no se comparó cell-style por cell-style contra un guardado nativo de Excel | Diff de `xl/styles.xml` + `xl/worksheets/*` entre canónica y un guardado nativo de Excel |
| U-5 | `22_UX_IMPACT` y `19_URL_BUILDER`: texto de sus 3 fórmulas | No se transcribieron aquí (están en `_raw/formulas/`), irrelevantes para la cadena de perfiles | Leer `_raw/formulas/29_22_UX_IMPACT.tsv` / `26_19_URL_BUILDER.tsv` |

---

## 10 · Reproducibilidad

```powershell
# 1) inventario + volcados (copia a temp, hash-verificada)
python audit\alignment\2026-10-25\10-excel\tools\extract_lab_ssot.py `
  "C:\Users\HFRC\Downloads\APE_M3U8_LAB_v8_FIXED.xlsm" `
  audit\alignment\2026-10-25\10-excel\_raw

# 2) métricas estructurales (secciones, claves duplicadas, conteos de capa)
python audit\alignment\2026-10-25\10-excel\tools\analyze_lab.py `
  audit\alignment\2026-10-25\10-excel\_raw `
  --json audit\alignment\2026-10-25\10-excel\_raw\metrics.json

# 3) perfiles P0-P5 citados celda a celda
python audit\alignment\2026-10-25\10-excel\tools\build_profiles_extract.py `
  audit\alignment\2026-10-25\10-excel\_raw `
  --out audit\alignment\2026-10-25\10-excel\EXCEL_PROFILES_EXTRACT.json

# 4) comparación de metadatos entre copias/snapshots
python audit\alignment\2026-10-25\10-excel\tools\snapshot_meta.py `
  "C:\Users\HFRC\Downloads\APE_M3U8_LAB_v8_FIXED.xlsm" `
  "C:\Users\HFRC\Documents\APE_M3U8_LAB_v8_FIXED.xlsm" ... `
  --json audit\alignment\2026-10-25\10-excel\_raw\snapshots.json
```

Ninguno de los 4 scripts abre Excel ni escribe en `.xlsm`.

### 10.1 · Qué evidencia queda versionada y qué se purgó (y por qué)

El volcado completo son 55 TSV (≈9,6 MB) + 56 TSV de la rama Documents (≈23 MB). **No se versionan**: cuatro hojas contienen credenciales en claro (`17_SERVERS_POOL`, `14_KEYRING`, `98_SHIELD_IMMUTABLE`, `99_DEAD_CHANNELS_BLACKLIST`) y `33_CHANNELS_FROM_FRONTEND` pesa 15,8 MB por sí sola. Persistir esos volcados en el árbol de trabajo sería exactamente la fuga que este informe denuncia (protocolo §11: no exponer credenciales).

**Versionado (34 archivos, 2,54 MB):**

| Ruta | Contenido | Por qué se conserva |
|---|---|---|
| `_raw/inventory.json` | identidad, grafo de las 55 hojas, protecciones, VBA, `docProps` | sustenta §1–§4 |
| `_raw/directives.json` | conteos por hoja de las 5 familias + primeras muestras | sustenta `EXCEL_HEADERS_EXTRACT.md` §1 |
| `_raw/metrics.json` | secciones, 678 claves, duplicados, capas de NIVEL 3, directivas NIVEL 1 | sustenta §5 y F-07 |
| `_raw/snapshots.json`, `_raw/live_candidates.json` | metadatos y hashes de las 10 copias comparadas | sustenta §6–§7 |
| `_raw/sheets/` (11 TSV) | `1_README`, `2_CATALOGO_MASTER`, `3_CAPAS`, `6_NIVEL_2_PROFILES`, `5_NIVEL_1_HEADER`, `7_NIVEL_3_CHANNEL`, `16_EVASION`, `25_JSON_EXPORT`, `30_EXPORT_FINAL`, `15_FLOOR_LOCK_CONFIG`, `8_CODEC_LADDER` | cada celda citada en los tres informes |
| `_raw/formulas/` (3 TSV) | `31_SOLVER_SETUP`, `36_BRAIN_SELECTOR`, `32_PLACEHOLDERS_MAP` | §4 |
| `_raw/vba/full_vba_dump.txt` | 74 módulos VBA en texto (0,57 MB) | §5 y F-08/F-20 (filtro `Cells(r,1)="X"`, export de `servers[]`) |
| `_raw_docs/sheets/` (4 TSV) | `6_NIVEL_2_PROFILES`, `8_CODEC_LADDER`, `15_FLOOR_LOCK_CONFIG`, `30_DISNEY_GRADE_DIRECTIVES` de la rama Documents | sustenta F-01/F-02/F-14 |

**Barrido de secretos del lane tras la purga:** 17 patrones (usuarios, contraseñas, token SHIELD) sobre los 34 archivos → **0 coincidencias**. Los volcados completos se regeneran en segundos con `tools/extract_lab_ssot.py` cuando alguien con autorización los necesite.

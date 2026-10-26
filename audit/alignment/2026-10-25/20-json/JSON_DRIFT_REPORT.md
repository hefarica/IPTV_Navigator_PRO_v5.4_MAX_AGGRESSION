# JSON_DRIFT_REPORT — Drift del SSOT JSON (Excel canónico ↔ baseline doctrinal ↔ lab_master ↔ perfiles APP)

**Tarea:** t5 / T4 · **Auditor:** `json-ssot` · **Ventana:** 2026-10-25 22:49 → 23:5x (America/Bogota)
**Regla de la casa:** cada afirmación cita **ruta + clave JSON exacta** y, cuando aplica, **`hoja!celda`** del
extracto canónico de t4. Si algo no se confirma, se dice como **REFUTACIÓN** con la evidencia.

**Decisiones del capitán incorporadas en esta revisión:** **D-20** (rama canónica =
`Downloads/APE_M3U8_LAB_v8_FIXED.xlsm`, sha `663EF44E…806A`), **D-22** (el export usa `6_NIVEL_2_PROFILES`;
P1 canónico = 4K + `hvc1.2.4.L153.B0`), **D-15** (fps 120 en el Excel sin capacidad de nivel → corregir),
**F-13** (credenciales en claro en `lab_master`).
Fuente de celdas: `audit/alignment/2026-10-25/10-excel/EXCEL_PROFILES_EXTRACT.json`
(`sheet = "6_NIVEL_2_PROFILES"`, `sheetDimension = "A1:H663"`,
`provenance.sha256 = 663EF44E2D69521EB0E77DDA7B64A32EA4F942992F8F2C80614EAEE8EC52806A`,
`readCopyMatchesSource = true`) → **mismo archivo que la rama canónica de D-20**.

**Estado de mutabilidad (medido antes y después):**
`IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json` · **280.065 B** ·
mtime `2026-08-30T21:13:39.531-05:00` (UTC `2026-08-31T02:13:39.532Z`) ·
SHA-256 `099A1707A2F1AE692FFCFEDE01165F21CD66656B786742CE8DB518581A371FD4` → **idéntico al inicio y al cierre**.
No cambió durante la auditoría; **no es "mutable hoy"** (el 21:13 del tablero es del 2026-08-30, no del 2026-10-25).
Es **byte-idéntico** a `Downloads/LAB_CALIBRATED_BULLETPROOF_22.6.0-CRYSTAL-4K-UHD.json`.

---

## §0. Respuesta a las 4 anomalías del lane APP (t6) — ahora contra la rama CANÓNICA

### A1 — `P1` con `codec_full = hvc1.2.4.L153.B0` sobre `7680x4320 @120` → **CONFIRMADO, y es híbrido: el 8K no está en la hoja que exporta**

| Clave JSON (ruta exacta) | Valor JSON | Celda canónica | Valor canónico | Δ |
|---|---|---|---|---|
| `profiles_calibrated.P1.settings.resolution` | `"7680x4320"` | `6_NIVEL_2_PROFILES!C25` | `"3840x2160"` | **DIFF** |
| `profiles_calibrated.P1.settings.maxResolution` | `"7680x4320"` | `!C48` | `"3840x2160"` | **DIFF** |
| `profiles_calibrated.P1.settings.codec_full` | `"hvc1.2.4.L153.B0"` | `!C37` | `"hvc1.2.4.L153.B0"` | MATCH |
| `profiles_calibrated.P1.settings.codec` | `"HVC1"` | `!C33` | `"HVC1"` | MATCH |
| `profiles_calibrated.P1.settings.fps` | `"120"` | `!C32` | `"120"` | MATCH |
| `profiles_calibrated.P1.headerOverrides["X-Stream-Codecs"]` | `"hvc1.2.4.L153.B0,ac-3"` | `!C350` | `"av01.0.15M.10,ac-3"` | **DIFF** |
| `profiles_calibrated.P1.headerOverrides["X-APE-RESOLUTION"]` | `"7680x4320,3840x2160,…"` | `!C136` | `"3840x2160,2560x1440,…"` | **DIFF** |
| `profiles_calibrated.P1.vlcopt["video-width"]` / `["video-height"]` | `"7680"` / `"4320"` | `!C109` / `!C110` | `"3840"` / `"2160"` | **DIFF** |
| `profiles_calibrated.P1.headerOverrides["X-APE-CODEC"]` | `"dvh1.08.06,hvc1.2.4.L153.B0,hev1.2.4.L153.B0,av01.0.15M.10"` | `!C135` | idéntico | MATCH |
| `profiles_calibrated.P1.kodiprop["inputstream.adaptive.max_resolution"]` | `"3840x2160"` | `!C121` | `"3840x2160"` | MATCH |

**Veredicto sobre D-22: CONFIRMADO.** En `6_NIVEL_2_PROFILES` (la hoja que exporta `mod_PRISMA_Export.bas`),
P1 = **`C25` = `3840x2160`** + **`C37` = `hvc1.2.4.L153.B0`**. El `7680x4320` del JSON **no existe en ninguna
celda de resolución de la columna C** (`C25`, `C48`, `C109`, `C136`, `C121` son todas 4K) → el 8K de P1 es
**valor alienígena**, exactamente el "híbrido" que describe el capitán: **resolución de otra fuente + códec de la
hoja que exporta**. El `av01.0.15M.10` sí existe en la rama canónica, pero **en la fila 350 (`C350`), no en la 37**
— ver §3.1, porque eso cambia el diagnóstico.

**¿Hay algún nodo que corrija el 8K?** No. Búsqueda exhaustiva de `L180|L183|L186` en todo el subárbol
`profiles_calibrated.P1`: **0 nodos**. El perfil no tiene escape hatch HEVC de 8K; el único 8K posible sería
DV (`dvh1.08.06`, 2.º en `X-APE-CODEC`) o AV1 (4.º), ninguno declarado como principal.

**Sobre "¿existe sólo en el JSON?"**: el valor imposible está en los campos que alimentan los placeholders de
emisión (`{profile.resolution}`, `{profile.fps}`, `{profile.codecs}` en `placeholders_map`, consumidos por
`nivel3_per_layer.SI`). Es decir, **está en la ruta de emisión**, no en un campo cosmético; si la lista emitida
sale correcta es porque la APP sustituye en runtime (lo confirma el lane APP), no porque el JSON se corrija.

### A2 — `fps = 120` en los 6 perfiles → **CONFIRMADO, y el Excel canónico también dice 120 (D-15)**

| Perfil | JSON `settings.fps` | Excel `!X32` | JSON `X-Stream-FPS` | Excel `!X352` |
|---|---|---|---|---|
| P0 | `"120"` | `B32` = `120` | `"60"` | `B352` = `60` |
| P1 | `"120"` | `C32` = `120` | `"120"` | `C352` = `120` |
| P2 | `"120"` | `D32` = `120` | `"60"` | `D352` = `60` |
| P3 | `"120"` | `E32` = `120` | `"60"` | `E352` = `60` |
| P4 | `"120"` | `F32` = `120` | `"30"` | `F352` = `30` |
| P5 | `"120"` | `G32` = `120` | `"30"` | `G352` = `30` |

- **Premisa de D-15 verificada en origen:** el Excel canónico declara `fps = 120` en **6/6** (fila 32).
- El JSON **copia 120 a ciegas** en `settings.fps` (6/6) → **no es drift JSON↔Excel**: es un **defecto del SSOT
  Excel** que el JSON propaga.
- El campo que viaja al `#EXT-X-STREAM-INF` (`X-Stream-FPS`, fila 352) es 60/120/60/60/30/30 y **coincide con el
  Excel** → el JSON es fiel ahí. (Refuta la lectura "el fps emitido está mal en los 6": sólo P0 difiere del
  manifiesto doctrinal, 60 vs 120.)
- **Cuantificación de la imposibilidad (ley `L11_FPS_LEVEL_CAPACITY`, modelo en `JSON_PROFILES_MATRIX.json`):**

| Perfil | resolución canónica | códec canónico | techo de fps del nivel | fps declarado | Veredicto | Corrección sin evidencia de 120fps |
|---|---|---|---|---|---|---|
| P0 | `7680x4320` (B25) | `dvh1.08.06` (B37) | no evaluable (DV) | 120 | **UNKNOWN** | requiere prueba empírica; DV P8 no acredita 8K@120 por sí solo |
| P1 | `3840x2160` (C25) | `hvc1.2.4.L153.B0` (C37) | **60** | 120 | **FAIL** | **60** |
| P2 | `3840x2160` (D25) | `hvc1.2.4.L150.B0` (D37) | **30** | 120 | **FAIL** | **30** (o subir a L153 para poder 60) |
| P3 | `1920x1080` (E25) | `hvc1.2.4.L123.B0` (E37) | **60** | 120 | **FAIL** | **60** |
| P4 | `1280x720` (F25) | `hvc1.2.4.L93.B0` (F37) | **30** | 120 | **FAIL** | **30** |
| P5 | `854x480` (G25) | `avc1.42c01e` (G37) | **30** | 120 | **FAIL** | **30** |

> **Matiz que la remediación necesita y que D-15 no cubre:** "corregir a 60" es correcto **sólo para P1 y P3**.
> En **P2** el nivel canónico es `L150` = 4K@**30**, así que 60 seguiría siendo imposible (y el manifiesto pide 60
> para P2 → **P2 exige subir el nivel a `L153`**). En **P4/P5** el techo es 30, que ya es lo que dice el
> manifiesto. Es decir: **el Excel canónico P2 es internamente imposible** (D25 4K + D37 L150 + D32 120fps, y ni
> siquiera 60 cabe en L150).

### A3 — `name` ≠ `resolution` en P1..P5 → **CONFIRMADO, y ahora con la celda canónica de cada uno**

| Perfil | `name` (JSON) | JSON `settings.resolution` | **Canónico `!X25`** | JSON `X-Stream-Resolution` | Canónico `!X351` | ¿JSON vs Excel? |
|---|---|---|---|---|---|---|
| P0 | `"8K Master"` | `"7680x4320"` | `B25` = `7680x4320` | `"7680x4320"` | `B351` = `7680x4320` | **MATCH** |
| P1 | `"4K UHD"` | `"7680x4320"` | `C25` = `3840x2160` | `"3840x2160"` | `C351` = `3840x2160` | **DIFF** (settings) |
| P2 | `"2K QHD"` | `"3840x2160"` | `D25` = `3840x2160` | `"3840x2160"` | `D351` = `3840x2160` | **MATCH** |
| P3 | `"FHD 1080p"` | `"3840x2160"` | `E25` = `1920x1080` | `"1920x1080"` | `E351` = `1920x1080` | **DIFF** (settings) |
| P4 | `"HD 720p"` | `"3840x2160"` | `F25` = `1280x720` | `"1280x720"` | `F351` = `1280x720` | **DIFF** (settings) |
| P5 | `"SD 480p"` | `"3840x2160"` | `G25` = `854x480` | `"854x480"` | `G351` = `854x480` | **DIFF** (settings) |

Conclusión: **el defecto está confinado a `settings.resolution` / `settings.maxResolution` /
`vlcopt.video-width|height` / `X-APE-RESOLUTION`**; los campos de emisión (`X-Stream-Resolution`,
`X-Max-Resolution`, `kodiprop.max_resolution`) **coinciden con el nombre del perfil y con el Excel**.
El nombre de P2 (`2K QHD`) contra `D25 = 3840x2160` es una discrepancia **del propio Excel** (no del JSON).

**Origen del defecto (con fecha):** `LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-ALIGNED.json` (B0, 2026-05-23
01:12) tenía `settings.resolution` por tier y **coincidía** con `B25..G25`; el valor 4K universal para P3/P4/P5
(y el 8K "prestado" para P1) nace en B1 `…_BACKUP_20260607.json` (2026-05-23 01:30) y se arrastra B2→B3→B4/A1.

### A4 — `chroma_subsampling = "168055555555556"` → **CONFIRMADO, está en los 6 perfiles Y el valor viene del Excel**

| Ruta JSON | Valor | Celda canónica | Valor canónico |
|---|---|---|---|
| `profiles_calibrated.P0.settings.chroma_subsampling` | `"168055555555556"` | `6_NIVEL_2_PROFILES!B40` | `"168055555555556"` |
| `…P1…` | `"168055555555556"` | `!C40` | idéntico |
| `…P2…` | `"168055555555556"` | `!D40` | idéntico |
| `…P3…` | `"168055555555556"` | `!E40` | idéntico |
| `…P4…` | `"168055555555556"` | `!F40` | idéntico |
| `…P5…` | `"168055555555556"` | `!G40` | idéntico |

- Tipo: **string** (no número), 15 dígitos, en **6/6** perfiles → **el JSON es fiel**: el defecto es **de la hoja
  canónica (fila 40)**, no del export. La corrección pertenece a t4/LAB, no al JSON.
- Mismo patrón (medido en el JSON): `profiles_calibrated.P0/P1/P2.optimized_timestamp = "46132.0850925926"` y
  `P3/P4/P5 = "46132.0850810185"` (serial de fecha Excel como string); `config_global.Meta_Optimizer_Last_Fit =
  "0.699752"`, `…Worst_Fit = "0.217547"`.

---

## §1. Método

1. `JSON.parse` completo de A1/A2/A3/A4 y de los 5 baselines B0–B4 (todos < 1 MB).
2. **Diff semántico profundo** (`tools/deepdiff.mjs`) B1↔B2, B2↔B3, B3↔A1 → 7 / 16 / 26 diferencias.
3. **Comparación estructural** (`tools/structure_compare.mjs`): conteo por capa de directivas y por archivo.
4. **Cruce JSON ↔ rama canónica** (`tools/excel_vs_json.mjs`): 22 campos mapeados por perfil, cada uno con
   `hoja!celda` → 28 DIFFs sobre 132 comparaciones (6 perfiles × 22 campos).
5. **Matriz de leyes** (`tools/build_matrix.mjs` → `JSON_PROFILES_MATRIX.json`): 13 leyes × 6 perfiles +
   6 evaluaciones cross-source = **84 evaluaciones**, **52 fallos aislados**.

---

## §2. Frescura y derivabilidad (rama canónica incluida)

| Artefacto | mtime (Bogotá) | vs Excel canónico (`2026-06-11 01:54:49`) |
|---|---|---|
| **X1 canónico** `Downloads/APE_M3U8_LAB_v8_FIXED.xlsm` — sha `663EF44E…806A`, 3.582.019 B | **2026-06-11 01:54:49** | — (SSOT declarado por D-20) |
| X2 rama archivada `Documents/…` — sha `E3BC629E…2DBD`, 7.134.977 B, 56 hojas | 2026-05-19 17:11:05 | −22,4 días · **NO se mergea (D-20)** |
| A1 `lab_master_22.6.0.json` (= B4) | 2026-08-30 21:13:39 | **+80,8 días** |
| B3 `…8K120-DNR.json` | 2026-08-30 15:25:56 | +80,6 días |
| B2 `…8K120.json` | 2026-06-07 16:10:00 | −3,4 días |
| B1 `…8K120_BACKUP_20260607.json` | 2026-05-23 01:30:32 | −19,0 días |
| B0 `…MEMC-ALIGNED.json` | 2026-05-23 01:12:07 | −19,0 días |
| C1 `frontend/channels_map.json` | 2026-06-09 01:00:49 | −2,0 días |
| C2 `backend/channels_map.json` | 2026-04-02 19:13:56 | **−69,3 días** |
| C3 `frontend/data/channels_map.json` | 2026-03-16 21:48:13 | −86,2 días |
| A2 `APE_ALL_PROFILES_v10_REALTIME_ENGINE.json` | 2026-06-11 00:25:34 | −0,06 días |
| A3 `APE_ALL_PROFILES_OPTIMIZED.json` (mutable hoy) | 2026-10-25 21:38:53 | +136,8 días |
| A4 `vps/ape-uhdx/visual_profiles.json` | 2026-06-18 15:48:04 | +7,6 días |

**Consecuencias:**
1. El JSON (A1) es **80,8 días posterior** al Excel canónico → **el Excel ya no regenera el JSON**: contiene la
   capa DNR (`dnr_calibration.dnr_version = "1.0.0-DNR-TOTAL-crystal-4k"`, `applied_at = "2026-08-30 20:25:56"`)
   y el parche CRYSTAL, inexistentes en X1.
2. **Binding Excel→JSON roto:** `prisma_lab_sync_v20.config_jsons_consumed_by_vps
   .enterprise_doctrine_manifest_json.lab_excel.sha256 = "PENDING_FIRST_HASH"` y `…last_validated_ts = null`;
   `…config_jsons_managed.*.sha256 = "PENDING"` en los 5 JSON de config del VPS. **No hay hash del Excel en ningún
   artefacto auditado** → el drift Excel↔JSON no es detectable automáticamente. (El extracto de t4 sí trae el sha
   real de X1: `663EF44E…`; ese dato **no está** dentro del JSON.)
3. `exported_at = "2026-05-23T05:39:38"` en A1, B1, B2, B3 y B4 → **campo de procedencia obsoleto**.

---

## §3. DRIFT CRÍTICO de P1 — el diagnóstico correcto (corregido con D-22)

### 3.1 La hoja canónica se contradice a sí misma en P1 (hallazgo nuevo, medido)

| Fila canónica | Celda | Valor | Qué declara |
|---|---|---|---|
| 33 | `6_NIVEL_2_PROFILES!C33` | `HVC1` | familia del códec del perfil |
| **37** | `!C37` | **`hvc1.2.4.L153.B0`** | códec del perfil (lo que exporta como `settings.codec_full`) |
| **350** | `!C350` | **`av01.0.15M.10,ac-3`** | códec del **stream** (`headerOverrides.X-Stream-Codecs`) |

**En la propia rama canónica P1 dice HEVC L5.1 en la fila 37 y AV1 en la fila 350.** Ningún JSON puede coincidir
con ambas. Esto explica —sin narrativa— el "post-mortem de 7 campos":

### 3.2 Diff B2 ↔ B1 (exactamente 7 diferencias, todas en P1)

| # | Ruta exacta | B2 (repo-descendiente) | B1 (`…_BACKUP_20260607`) | ¿Con qué fila canónica alinea cada uno? |
|---|---|---|---|---|
| 1 | `profiles_calibrated.P1.settings.codec` | `"HVC1"` | `"AV01"` | B2 ↔ **C33**; B1 ↔ C350 |
| 2 | `profiles_calibrated.P1.settings.codec_full` | `"hvc1.2.4.L153.B0"` | `"av01.0.15M.10"` | B2 ↔ **C37**; B1 ↔ C350 |
| 3 | `…P1.settings.codec_priority` | `"hvc1,hev1,av01,vp09"` | `"av01,hvc1,hev1,dvh1,vp09"` | B2 prioriza HEVC |
| 4 | `…P1.vlcopt.codec-priority` | `"hvc1,hev1,av01,vp09"` | `"av01,hvc1,hev1,dvh1,vp09"` | idem |
| 5 | `…P1.headerOverrides["X-Video-Codecs"]` | `"HVC1"` | `"AV01"` | B2 ↔ C33 |
| 6 | `…P1.headerOverrides["X-Quality-Preference"]` | `"codec-hevc,…;codec-h265,…;codec-av1,…"` | `"codec-av1,…;codec-hevc,…"` | B1 AV1-first |
| 7 | `…P1.headerOverrides["X-Stream-Codecs"]` | `"hvc1.2.4.L153.B0,ac-3"` | `"av01.0.15M.10,ac-3"` | **B2 ↔ C37**; **B1 ↔ C350** |

`profiles_calibrated.P1.settings.resolution` = `"7680x4320"` en **B1 y B2** (no forma parte del diff) y la celda
canónica es `C25 = "3840x2160"` → **el 8K de P1 ya venía mal desde B1** y **no se corrigió** con el flip de códec.

**Diagnóstico corregido (sustituye la lectura "B2 = rama rota" del informe anterior):**
- El flip de 7 campos movió P1 de *alineado con la fila 350 (AV1)* a *alineado con la fila 37 (HEVC L5.1)*.
- **Bajo D-22 (P1 = `C37` L153 + `C25` 4K), el códec del JSON actual es el correcto** y **`C350` (AV1) es la fila a
  corregir en el Excel**. Lo que sigue roto en el JSON es la **resolución 8K**, que no está en ninguna celda de la
  columna C.
- Conclusión operativa: **no** revertir a B1 para P1 (volvería a AV1 y reabriría `C350`); la remediación es
  **llevar la resolución a `C25` = 4K** y decidir si `C350` se corrige en el Excel o se documenta como
  contradicción aceptada.

### 3.3 Cadena de artefactos (medida)

```
B0 2026-05-23 01:12 MEMC-ALIGNED      → P1 resolución 4K (coincide C25) · P1 códec av01 (coincide C350)
B1 2026-05-23 01:30 BACKUP_20260607   → P1 resolución 8K (alien) · códec av01
B2 2026-06-07 16:10 MEMC-TOTAL-8K120  → +7 campos HEVC (coincide C37) · resolución sigue 8K (alien)
B3 2026-08-30 15:25 DNR               → +capa DNR (16 diffs) · sin cambios en P1
B4 ≡ A1 2026-08-30 21:13 repo/CRYSTAL → +parche CRYSTAL (26 diffs) + minificación · sin cambios en P1
```

---

## §4. DRIFT B3 → A1: qué cambió el parche CRYSTAL (26 diferencias)

Mismo conteo de directivas (`nivel1_directives` 51; `nivel3_per_layer` VLC 23/KOD 16/HTT 7/EI 8/SI 7/SYS 0/URL 4;
`headerOverrides` 402/400/402/400/400/400) **pero 26 valores distintos**:

| Clase | Rutas | B3 (DNR) | A1 (CRYSTAL) |
|---|---|---|---|
| Filtros de video | `profiles_calibrated.P0.vlcopt["video-filter"]` | `"nlmeans=s=3.0:p=7:r=15,bwdif=…,gradfun=radius=16:strength=1.0,unsharp=…"` | `"nlmeans=s=3.0:p=7:r=15,atadenoise,bwdif=…,gradfun=radius=16:strength=1.2,zscale=transfer=st2084:p…"` |
| Política DNR | `…P{n}.headerOverrides["X-APE-DNR-POLICY"]` | `"AI_DNR_HW+NLMEANS3.0+GRADFUN1.0,…"` | `"AI_DNR_HW+NLMEANS3.0+ATADENOISE+GRADFUN1.2+CRYSTAL4K-NATIVE-PQ+SCD-FDIFF8,…"` |
| Clock sync | `…P{n}.player_enslavement.level_3_per_channel.EXTVLCOPT["clock-synchro"]` | `0` | `1` |
| Clock sync (actor) | `…P{n}.actor_injections.player.vlc.clock_synchro` | `0` | `1` |
| Formato | — | 423.609 B / 7.784 saltos | 280.065 B / **0** saltos (minificado) |

→ **A1 = B3 + parche de imagen + minificación**; sin pérdida de directivas (no viola NO-STRIP).

---

## §5. TRES doctrinas de códec coexisten en el repo

| Fuente | P0 | P1 | Autoridad |
|---|---|---|---|
| **A1** `lab_master_22.6.0.json` | `dvh1.08.06` (8K@120) | `hvc1.2.4.L153.B0` (JSON dice 8K; canónico `C25`=4K) | LAB SSOT |
| **A3** `APE_ALL_PROFILES_OPTIMIZED.json` (`_meta.version="APE_v9.0"`, `exported="2026-04-09T04:30:16.745Z"`) | `profiles.P0.settings.codec="AV1"`, 8K@`60` | `X-APE-CODEC` HEVC, 4K@60 | perfil v9 del generador |
| **A2** `APE_ALL_PROFILES_v10_REALTIME_ENGINE.json` (`_meta.version="APE_v10.0_REALTIME_ENGINE"`, doctrina `"HEVC-FIRST … AV1 demoted"`) | `codec_ladder.P0.video="dvh1.05.06,dvh1.08.06,hvc1.2.4.L183.B0,…"` | `codec_ladder.P1.video="hvc1.2.4.L153.B0,…"`; **sin `resolution`/`fps` por perfil** | perfil v10 |

El generador importa el LAB por UI (`frontend/js/ape-v9/generation-controller.js` →
`labFileName: labCfg?.labFileName || 'LAB_CALIBRATED'`, líneas 142/1290; mensaje de aborto en línea 1255) y tiene
**fallback legacy** sin LAB (`patch.js` línea 21). Según lo que el operador haya cargado, el mismo botón emite la
doctrina A1 (DV/Main10) o la A3 (AV1/HEVC-first) → **SSOT ambiguo en la ruta de emisión** (es del lane APP).

---

## §6. DRIFT INTERNO DENTRO DE A1

### 6.1 Floor-lock: dos valores para el mismo parámetro
| Ruta | Valor |
|---|---|
| `prisma_lab_sync_v20.feature_sheets["15_FLOOR_LOCK_CONFIG"].floor_lock_min_bandwidth_p0` | `15000000` |
| `…config_jsons_consumed_by_vps.floor_lock_config_json.floor_lock_min_bandwidth_p0` | `18000000` |
| `…feature_sheets["15_FLOOR_LOCK_CONFIG"].floor_lock_min_bandwidth_p1` | `15000000` |
| `…floor_lock_config_json.floor_lock_min_bandwidth_p1` | `14000000` |
| `…feature_sheets["15_FLOOR_LOCK_CONFIG"].x_max_bitrate_upstream_header` | `20000000` |
| `…floor_lock_config_json.x_max_bitrate_upstream_header` | `80000000` |
| `prisma_lab_sync_v20.profile_attributes.P1.prisma_target_bandwidth_bps` | `20000000` |
| `…profile_boost_multipliers_json.profiles.P1.prisma_target_bandwidth_bps` | `25000000` |

El bloque "consumido por el VPS" tiene `_metadata.generated_ts = "2026-05-19T10:32:47Z"`, **anterior** al bloque
`feature_sheets` → el VPS podría estar leyendo valores viejos.

### 6.2 Score de compliance contradictorio
`prisma_lab_sync_v20._metadata.compliance_score_current = 67` vs
`…enterprise_doctrine_manifest_json.compliance_score_current = 41` (ambos con target 95).

### 6.3 Bitrate: media por encima del máximo (y es defecto del Excel)
| Perfil | `settings.maxBitrateKbps` | `settings.avgBitrateKbps` | Excel (`!X49`/`!X50`) | Veredicto |
|---|---|---|---|---|
| P0 | `200000` | `160000` | `B49`/`B50` idénticos | PASS |
| P1 | `40000` | `75000` | `C49`/`C50` idénticos | **FAIL** |
| P2 | `25000` | `35000` | `D49`/`D50` idénticos | **FAIL** |
| P3 | `10000` | `15000` | `E49`/`E50` idénticos | **FAIL** |
| P4 | `5000` | `6000` | `F49`/`F50` idénticos | **FAIL** |
| P5 | `2000` | `2200` | `G49`/`G50` idénticos | **FAIL** |

### 6.4 HDR declarado de cinco formas en el mismo perfil (P0)
`settings.hdr_mode="HDR10"` · `settings.hdrMode="DOLBY_VISION_P8"` (canónico `B53` = `DOLBY_VISION_P8`) ·
`settings.videoRange="DOVI"` (`B54`) · `settings.video_range="PQ"` · `settings.peak_luminance_nits="10000"` vs
`settings.nits_target="4000"` vs `X-HDR-Peak-Nits="10000"` vs `X-HDR-Peak-Luminance-Nits="10000"`.
En P3/P5: `X-HDR-Peak-Nits="203"` vs `X-HDR-Peak-Luminance-Nits="100"`. `settings.bit_depth="12"` en P0
(canónico `B39=12`) pero **P1 tiene `12` en el JSON y `10` en el canónico `C39`** → drift adicional de bit depth.

### 6.5 Metadatos de conteo que no cuadran
| Clave | Declarado | Medido |
|---|---|---|
| `settings.headersCount` (6/6) | `"233"` | 400–402 claves en `headerOverrides` |
| `scoring_metadata.nivel1_count` | `50` | `nivel1_directives.length = 51` |
| `scoring_metadata.profile_keys_total` | `660` | 6 × 16 claves top-level = 96 (no reproducible) |
| `scoring_metadata.total_directives` | `2886` | no reproducible sin el Excel (UNKNOWN) |

### 6.6 `config_global` con anomalías de exportación
`"Always_Include_Port"="10"` · `"JWT_Default_TTL_Sec"="6"` · `"JWT_Default_Algorithm"="176"` ·
`"Output_M3U8_Path"` con comillas embebidas · `"? QUITAR PARAMETRO"="?? GUARDAR PRESET"` (filas-botón) ·
`"Meta_Optimizer_Last_Run"="20/04/2026 2:02:32 a.�m."` (byte inválido) · `"Default_Profile"="P3"`
(el default del sistema es 1080p, contra MAX IMAGE FIRST).

---

## §7. Leyes evaluadas — síntesis por perfil (JSON ↔ doctrina ↔ Excel canónico)

| Perfil | L0 manifiesto | L1 nivel↔res (settings/emitido/codec_string) | L2 res emitida | L3 fps emitido | L4 piso Main10 | L5 ladder | L6 acuerdo interno | L7 bitrate | L8 headers | **L10 Excel canónico** | **L11 fps↔nivel (D-15)** | Veredicto |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P0 | PASS | UNK/UNK/**FAIL** | PASS | **FAIL** | PASS | PASS | **FAIL** | PASS | **FAIL** | **PASS (0 diffs)** | UNKNOWN (DV) | **FAIL** |
| P1 | **FAIL** | **FAIL/FAIL/FAIL** | **FAIL** | PASS | PASS | **FAIL** | PASS | **FAIL** | **FAIL** | **FAIL (6 diffs)** | **FAIL (techo 60)** | **FAIL** |
| P2 | **FAIL** | **FAIL/FAIL/FAIL** | PASS | PASS | PASS | PASS | **FAIL** | **FAIL** | **FAIL** | **PASS (0 diffs)** | **FAIL (techo 30)** | **FAIL** |
| P3 | **FAIL** | **FAIL/FAIL/FAIL** | PASS | PASS | **FAIL** | **FAIL** | **FAIL** | **FAIL** | **FAIL** | **FAIL (8 diffs)** | **FAIL (techo 60)** | **FAIL** |
| P4 | **FAIL** | FAIL/PASS/PASS | PASS | PASS | **FAIL** | **FAIL** | **FAIL** | **FAIL** | **FAIL** | **FAIL (9 diffs)** | **FAIL (techo 30)** | **FAIL** |
| P5 | PASS | **FAIL**/PASS/PASS | PASS | PASS | PASS | **FAIL** | **FAIL** | **FAIL** | **FAIL** | **FAIL (5 diffs)** | **FAIL (techo 30)** | **FAIL** |

**Failures de Ley Cardinal 1 aislados (12 evaluaciones L1), con perfil, valores y nivel requerido:**

| Perfil | Eje | Códec declarado | Resolución@fps declarada | Capacidad | Requerido |
|---|---|---|---|---|---|
| P1 | `settings` | `hvc1.2.4.L153.B0` | `7680x4320`@`120` | 4K@60 | **L186** |
| P1 | `X-Stream-*` | `hvc1.2.4.L153.B0` | `3840x2160`@`120` | 4K@60 | **L156** |
| P2 | `settings` | `hvc1.2.4.L150.B0` | `3840x2160`@`120` | 4K@30 | **L156** |
| P2 | `X-Stream-*` | `hvc1.2.4.L150.B0` | `3840x2160`@`60` | 4K@30 | **L153** |
| P3 | `settings` | `hvc1.1.6.L120.B0` | `3840x2160`@`120` | 1080p@30 | **L156** |
| P3 | `X-Stream-*` | `hvc1.1.6.L120.B0` | `1920x1080`@`60` | 1080p@30 | **L123** |
| P4 | `settings` | `avc1.64001f` (AVC L3.1) | `3840x2160`@`120` | 720p@30 | fuera de tabla AVC |
| P5 | `settings` | `avc1.42c01e` (AVC L3.0) | `3840x2160`@`120` | 480p@30 | fuera de tabla AVC |
| P0 | `codec_string` | `hvc1.2.4.L153.B0` | `7680x4320`@`60` | 4K@60 | **L183** |

P0 en el eje DV queda **UNKNOWN** razonado: el manifiesto exige `dvh1.08.06` a 8K@120 pero el *level idc* `06`=6.0
→ **tensión doctrinal a elevar**, no se declara PASS.

---

## §8. Consolidado: 52 fallos aislados / 84 evaluaciones

| Ley | Fallos | Perfiles |
|---|---|---|
| `L0_MANIFEST_CODEC` | 4 | P1, P2, P3, P4 |
| `L1_LEVEL_VS_RESOLUTION_*` (3 ejes) | **12** | `_SETTINGS`: P1,P2,P3,P4,P5 · `_EMITTED`: P1,P2,P3 · `_CODEC_STRING`: P0,P1,P2,P3 |
| `L2_MANIFEST_RESOLUTION` | 1 | P1 |
| `L3_MANIFEST_FPS` | 1 | P0 |
| `L4_MAIN10_FLOOR` | 2 | P3, P4 |
| `L5_LADDER_HAS_MANIFEST_CODEC` | 4 | P1, P3, P4, P5 |
| `L6_INTERNAL_CODEC_AGREEMENT` | 5 | P0, P2, P3, P4, P5 |
| `L7_BITRATE_ORDER` | 5 | P1, P2, P3, P4, P5 |
| `L8_HEADER_COUNT_CLAIM` | 6 | P0..P5 |
| `L9_CHANNELS_MAP_ALIGNMENT` | 3 | P0, P1, P2 |
| **`L10_EXCEL_CANONICAL_MATCH`** | **4** | P1 (6 diffs), P3 (8), P4 (9), P5 (5) — **P0 y P2 PASS** |
| **`L11_FPS_LEVEL_CAPACITY` (D-15)** | **5** | P1,P2,P3,P4,P5 (P0 UNKNOWN por DV) |
| **TOTAL** | **52** | |

Veredicto global: **P0 FAIL · P1 FAIL · P2 FAIL · P3 FAIL · P4 FAIL · P5 FAIL** (0 PASS).

---

## §9. Lo que esta auditoría NO afirma

1. **No** ejecuté el generador ni el prober: no afirmo qué se emite en la `.m3u8` final.
2. **No** abrí el `.xlsm`: las celdas provienen del extracto de t4 (`EXCEL_PROFILES_EXTRACT.json`,
   `readCopyMatchesSource = true`, sha `663EF44E…`), que es el mismo archivo de D-20.
3. **No** comparé contenido registro-a-registro entre C2 y C3 (28 MB × 2).
4. **No** evalué `fps` por canal en los channels_map (el campo no existe).
5. **No** declaro PASS en el eje DV de P0 (§7).
6. **No** decido si `C350` (AV1) o `C37` (L153) manda en P1: **D-22 ya decidió `C37`**; queda que la hoja corrija
   `C350` o que el capitán acepte la contradicción documentada.

---

## §10. Decisiones del capitán incorporadas (D-20, D-22, D-15, F-13)

### D-20 — Rama canónica: CONFIRMADO y adoptado como referencia de este informe
`C:\Users\HFRC\Downloads\APE_M3U8_LAB_v8_FIXED.xlsm` · SHA-256
`663EF44E2D69521EB0E77DDA7B64A32EA4F942992F8F2C80614EAEE8EC52806A` · 3.582.019 B ·
mtime `2026-06-11T06:54:49.080713Z` (= 01:54:49 Bogotá).
**Verificación independiente del lado JSON:** el extracto `EXCEL_PROFILES_EXTRACT.json` declara
`provenance.sha256 = 663EF44E…` y `readCopyMatchesSource = true` → las 132 celdas citadas aquí provienen **del
mismo archivo** que D-20 declara canónico. La rama `Documents/…` (`E3BC629E…`, 7.134.977 B, 2026-05-19) **no se
usó** y queda archivada según D-20.

### D-22 — P1 canónico: **CONFIRMADO** (con una precisión que cambia la remediación)
- `6_NIVEL_2_PROFILES!C25 = "3840x2160"` y `!C37 = "hvc1.2.4.L153.B0"` → **P1 = 4K HEVC L5.1**, NO AV1 8K.
- El `7680x4320` del JSON **no existe en la columna C** (`C25/C48/C109/C121`) → **híbrido corrupto confirmado**
  (resolución alienígena + códec de la hoja que exporta).
- **Precisión:** el AV1 8K **sí está en la rama canónica**, en `!C350` (`X-Stream-Codecs`), contradiciendo a `!C37`
  del mismo perfil (§3.1). Por eso el estado "AV1" de B1 no era inventado: seguía `C350`. Bajo D-22, **el códec del
  JSON actual (L153) es el correcto** y lo que falta corregir en el JSON es **la resolución (8K→4K, `C25`)**;
  `C350` es un defecto del Excel que debe corregirse allí (o documentarse como contradicción aceptada).

### D-15 — fps: **CONFIRMADO en la premisa, MATIZADO en la corrección**
- El Excel canónico declara `fps=120` en **6/6** (fila 32) → el JSON lo copia (6/6). Defecto **del SSOT Excel**.
- Techos de nivel medidos: P1 **60**, P2 **30**, P3 **60**, P4 **30**, P5 **30** (P0 DV = UNKNOWN).
- Por tanto: **"corregir a 60" es válido para P1 y P3**; en **P2/P4/P5 el techo es 30**; y **P2 exige subir el nivel
  a `L153`** si se quiere sostener 60. Una corrección ciega a 60 dejaría P2/P4/P5 aún imposibles.

### F-13 — Credenciales en claro en `lab_master_22.6.0.json`: **CONFIRMADO, y hay un riesgo mayor al lado**
- **Hecho:** `servers[0..3].username` y `servers[0..3].password` son `string` **no vacíos** (4 pares; longitudes
  6/10/12/7 y 6/10/8/7 — **no se transcriben valores**). `"password"\s*:` aparece **4 veces**; no hay otros
  secretos en el archivo (`profiles_calibrated` no lleva credenciales).
- **Estado en git:** `lab_master_22.6.0.json` está **excluido por `.gitignore:149`**
  (`IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json`) → **no trackeado, fuera del historial**.
- **Escalada (medida hoy):** el archivo que **sí** está trackeado es
  `IPTV_v5.4_MAX_AGGRESSION/frontend/channels_map.json`, y contiene **9.293 pares `username`/`password`** más
  **18.586 URLs (`url_m3u8` + `url_ts`) con usuario y contraseña embebidos en el path**. `git log` sobre ese archivo
  devuelve **3 commits** (`e425b3c`, `a10edeb`, `0b9c111`) → **las credenciales de canal están en el historial de
  git**, no sólo en el working tree. Riesgo **mayor** que el de `lab_master` (4 pares).
- **Recomendación (no ejecutada; decide el capitán):** (a) mover credenciales a config server-side
  (`vps/prisma/config/*` fuera del árbol, `.env`/secret manager) y dejar en los JSON sólo referencias
  (`{server.id}` / `credential_ref`); (b) **rotar** las credenciales que ya están en historial antes de cualquier
  publicación del repo; (c) mantener `lab_master` ignorado y **añadir `channels_map.json` a `.gitignore` +
  `git rm --cached`** cuando el capitán lo autorice; (d) no sanitizar ni commitear nada desde esta auditoría
  (permanece sólo-lectura).

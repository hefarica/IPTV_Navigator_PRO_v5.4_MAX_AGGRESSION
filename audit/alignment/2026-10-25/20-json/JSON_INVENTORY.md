# JSON_INVENTORY — Inventario forense de los artefactos JSON del SSOT LAB

**Tarea:** t5 / T4 — Auditoría del JSON LAB_CALIBRATED_BULLETPROOF, lab_master y channels_map
**Auditor:** `json-ssot` · **Fecha de auditoría:** 2026-10-25 (America/Bogota)
**Modo:** SOLO LECTURA sobre los JSON auditados. Escrituras: únicamente esta carpeta (`audit/alignment/2026-10-25/20-json/`).
**Cero curl a producción. Cero commits. Cero `git add`.**

---

## 0. Resumen ejecutivo (5 líneas)

1. El `frontend/lab_master_22.6.0.json` del repo es **byte-idéntico** a `C:\Users\HFRC\Downloads\LAB_CALIBRATED_BULLETPROOF_22.6.0-CRYSTAL-4K-UHD.json` (mismo SHA-256 `099A1707…`, mismo mtime, mismo tamaño). **No fue escrito hoy**: su mtime es `2026-08-30T21:13:39` (hora Bogotá).
2. Ese archivo **desciende de la rama ROTA** del baseline (`LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-TOTAL-8K120.json`, 2026-06-07), **NO** del baseline doctrinal nombrado en el manifiesto (`…_BACKUP_20260607.json`). La regresión de P1 (`av01.0.15M.10` → `hvc1.2.4.L153.B0` sobre 8K@120) **sigue viva** en el repo.
3. `frontend/channels_map.json` (73 MB) y `backend/channels_map.json` (28 MB) **no son el mismo esquema**: 170 vs 105 campos, 9.293 vs 8.366 registros, y el backend **no tiene** `codec_rfc6381`, `resolution`, `server`, `username`, `password` ni URLs. `backend` ≡ `frontend/data` en **conjunto de claves** (8.366 idénticas) pero con bytes distintos.
4. Solo P0/P1/P2 existen en los channels_map; P3/P4/P5 **no están mapeados** en ninguna copia → `UNKNOWN` por ausencia, no por error.
5. 6/6 perfiles del matrix dan **FAIL** (43 fallos aislados de 72 evaluaciones de ley); el fallo más grave es la clase *freeze* de la Ley Cardinal 1 en P1 y P2.

---

## 1. Artefactos auditados (hash real, bytes, mtime, estructura)

> Todos los hashes son SHA-256 calculados con `Get-FileHash -Algorithm SHA256` sobre el archivo en disco, medidos al **inicio** y re-medidos al **cierre** de la auditoría. **Ninguno cambió durante la ventana de auditoría** (ver §6).

### 1.1 SSOT operativo del generador (dentro del repo)

| # | Ruta | Bytes | mtime (Bogotá) | SHA-256 | Claves top-level |
|---|------|------:|----------------|---------|------------------|
| A1 | `IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json` | 280.065 | 2026-08-30T21:13:39.531-05:00 | `099A1707A2F1AE692FFCFEDE01165F21CD66656B786742CE8DB518581A371FD4` | 18 |
| A2 | `IPTV_v5.4_MAX_AGGRESSION/backend/APE_ALL_PROFILES_v10_REALTIME_ENGINE.json` | 47.864 | 2026-06-11T00:25:34.137-05:00 | `66550994F3DB59C1D3172DF2DFACF1B818E7DB7022E3CBD7A6A07C89C8255B21` | 3 |
| A3 | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/APE_ALL_PROFILES_OPTIMIZED.json` | 203.816 | 2026-10-25T21:38:53.313-05:00 | `CA641F46A5842255020C1ADD2F6E01AF0EE2454407EEAEE913E2CFDA9DBFAD55` | 2 |
| A4 | `IPTV_v5.4_MAX_AGGRESSION/vps/ape-uhdx/visual_profiles.json` | 84.924 | 2026-06-18T15:48:04.376-05:00 | `EF1CD863D07C56EEF137F6448DA86F3E93D11EE93E67832B8847323922340A36` | 23 |

**⚠️ A3 es MUTABLE:** su mtime es de **hoy 21:38** (una sesión distinta lo tocó). Todo lo que se afirma de A3 vale para el hash `CA641F46…`; si cambia, hay que re-medir.

### 1.2 Baselines doctrinales (FUERA del repo — localizados)

Búsqueda realizada: `Get-ChildItem -Recurse` sobre `C:\Users\HFRC\Desktop` y `C:\Users\HFRC\Downloads` filtrando `LAB_CALIBRATED_BULLETPROOF*`. **Sí existen; no están en el repo.** Todos en `C:\Users\HFRC\Downloads\`:

| # | Archivo | Bytes | mtime (Bogotá) | SHA-256 | Claves | Nota |
|---|---------|------:|----------------|---------|-------:|------|
| B0 | `LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-ALIGNED.json` | 847.417 | 2026-05-23T01:12:07-05:00 | `D2582BE76B7667564E7D1AF8B4C10E0DA01DE8DF70B9D3B473AF9E9C3830F367` | 16 | **BOM UTF-8** al inicio (`\uFEFF{`) → `JSON.parse` estricto falla. Estado coherente por tier (P1=4K, P3=1080p, P4=720p, P5=480p). |
| B1 | `LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-TOTAL-8K120_BACKUP_20260607.json` | 408.126 | 2026-05-23T01:30:32-05:00 | `FFD3E0E06129067CAD28E7DCD908C505A13E88F16C5B7B0089596C5172CA1DD7` | 17 | **Baseline doctrinal nombrado en el skill del manifiesto.** P1 = `av01.0.15M.10` (correcto). Nombre dice `20260607` pero el mtime es 2026-05-23 → discrepancia nombre↔fecha. |
| B2 | `LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-TOTAL-8K120.json` | 408.174 | 2026-06-07T16:10:00-05:00 | `29C548050FFF3B3EBC0CD3ABE50CC64DDD2C5DF83687E233452A4A899B158865` | 17 | **Contiene la regresión de P1** (ver §3). Es el `base_file_untouched` declarado por A1. |
| B3 | `LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-TOTAL-8K120-DNR.json` | 423.609 | 2026-08-30T15:25:56-05:00 | `279E45960550A15927658EF3E082DEB150E148DC0FB748DE1D3A51D47B56F017` | 18 | B2 + capa DNR (`dnr_calibration`, `X-APE-DNR-POLICY`, `soc_vpp_dnr`). |
| B4 | `LAB_CALIBRATED_BULLETPROOF_22.6.0-CRYSTAL-4K-UHD.json` | 280.065 | 2026-08-30T21:13:39-05:00 | `099A1707A2F1AE692FFCFEDE01165F21CD66656B786742CE8DB518581A371FD4` | 18 | **≡ A1 (byte a byte).** B3 + parche CRYSTAL + re-serialización minificada (0 saltos de línea vs 7.784 de B3). |

**Conclusión de identidad:** `A1 == B4` (SHA-256 idéntico). El "lab_master" del repo **es** el export `22.6.0-CRYSTAL-4K-UHD`, 143.544 B más pequeño que su padre B3 **sólo por minificación** (los conteos de directivas son idénticos: `nivel1_directives` 51, `nivel3_per_layer` 23/16/7/8/7/0/4, `headerOverrides` 402/400/402/400/400/400) **más 26 cambios semánticos** (ver JSON_DRIFT_REPORT §4).

### 1.3 Excel SSOT (fuente primaria doctrinal)

| # | Ruta | Bytes | mtime (Bogotá) | SHA-256 |
|---|------|------:|----------------|---------|
| X1 | `C:\Users\HFRC\Downloads\APE_M3U8_LAB_v8_FIXED.xlsm` | 3.582.019 | 2026-06-11T01:54:49-05:00 | `663EF44E2D69521EB0E77DDA7B64A32EA4F942992F8F2C80614EAEE8EC52806A` |

No hay `.xlsm` canónico dentro del árbol del repo (sólo snapshots en
`IPTV_v5.4_MAX_AGGRESSION/_audit_snapshot/2026-04-26_audit_e2e_replicated/*.xlsm`, 4 copias del 2026-04-26,
todas anteriores a X1). **El Excel vivo está fuera del repo**, igual que los baselines.

### 1.3.b Rama canónica (D-20) y extracto de celdas usado como referencia

| # | Ruta | Bytes | mtime (Bogotá) | SHA-256 | Estado |
|---|------|------:|----------------|---------|--------|
| X1 | `C:\Users\HFRC\Downloads\APE_M3U8_LAB_v8_FIXED.xlsm` | 3.582.019 | 2026-06-11T01:54:49-05:00 | `663EF44E2D69521EB0E77DDA7B64A32EA4F942992F8F2C80614EAEE8EC52806A` | **CANÓNICA (D-20)** — la que exporta `SHEET_PROFILES="6_NIVEL_2_PROFILES"` |
| X2 | `C:\Users\HFRC\Documents\…\APE_M3U8_LAB_v8_FIXED.xlsm` (rama `Documents`) | 7.134.977 | 2026-05-19T17:11:05-05:00 | `E3BC629E…2DBD` | **archivada, NO se mergea (D-20)** — 22,4 días anterior y divergente (110 filas en `6_NIVEL_2_PROFILES`) |

**Extracto de celdas (fuente de citas `hoja!celda` de este informe)**, producido por el lane Excel (t4) y
**no** por esta auditoría:

| Campo | Valor |
|---|---|
| Ruta | `audit/alignment/2026-10-25/10-excel/EXCEL_PROFILES_EXTRACT.json` (844.550 B) |
| `schema` | `excel-profiles-extract/1.0` |
| `sheet` / `sheetDimension` | `6_NIVEL_2_PROFILES` / `A1:H663` |
| `provenance.file.sha256` | `663EF44E2D69521EB0E77DDA7B64A32EA4F942992F8F2C80614EAEE8EC52806A` (**== X1**) |
| `provenance.readCopyMatchesSource` | `true` |
| `provenance.method` | OOXML read (zipfile+ElementTree) sobre copia byte-idéntica; Excel nunca abierto, sin COM, sin macros |

Los perfiles exponen allí alias planos con celda: `resolution` (fila 25), `fps` (32), `codec` (33),
`codec_full` (37), `codec_priority` (38), `bit_depth` (39), `chroma_subsampling` (40), `maxResolution` (48),
`maxBitrateKbps` (49), `avgBitrateKbps` (50), `targetFps` (51), `hdrMode` (53), `videoRange` (54), y en la zona de
headers `X-APE-CODEC` (135), `X-APE-RESOLUTION` (136), `X-APE-FPS` (137), `X-Stream-Codecs` (350),
`X-Stream-Resolution` (351), `X-Stream-FPS` (352), `kodiprop…max_resolution` (121), `vlcopt.video-width` (109),
`vlcopt.video-height` (110). Columnas: B=P0, C=P1, D=P2, E=P3, F=P4, G=P5.

**Consecuencia para esta auditoría:** el cruce JSON↔Excel de §10 y la ley `L10_EXCEL_CANONICAL_MATCH` de
`JSON_PROFILES_MATRIX.json` se citan **contra X1 (rama canónica)**, no contra X2.


### 1.4 channels_map (3 copias + 1 duplicado exacto)

| # | Ruta | Bytes | mtime (Bogotá) | SHA-256 | Registros |
|---|------|------:|----------------|---------|----------:|
| C1 | `IPTV_v5.4_MAX_AGGRESSION/frontend/channels_map.json` | 75.107.356 | 2026-06-09T01:00:49-05:00 | `AFA3BB513FC46EA836355EB5C8F8E10C21B5C6C9E96972994B2A7A75CC7698DD` | 9.293 |
| C2 | `IPTV_v5.4_MAX_AGGRESSION/backend/channels_map.json` | 29.351.317 | 2026-04-02T19:13:56-05:00 | `96B38F96AB79B716CB50C6D238BF126BD2AD344F4D3E931C98645147D969F7F6` | 8.366 |
| C3 | `IPTV_v5.4_MAX_AGGRESSION/frontend/data/channels_map.json` | 28.410.531 | 2026-03-16T21:48:13-05:00 | `9D1920920217ED9CD4B34E53C414DBF31E0273D6619243F9F89B6B72ACB2A1E9` | 8.366 |
| C2b | `IPTV_v5.4_MAX_AGGRESSION/backup_master_v5.4_phantom_engine/backend/channels_map.json` | 29.351.317 | 2026-04-02T19:13:56-05:00 | `96B38F96AB79B716CB50C6D238BF126BD2AD344F4D3E931C98645147D969F7F6` | 8.366 |

**C2b es duplicado exacto de C2** (mismo tamaño, mtime y hash). No es una cuarta variante: es una copia de backup.

---

## 2. Esquema y claves — lo que pedía la tarea, punto por punto

### 2.1 `profiles_calibrated.P0..P5` (A1/B4)

Presente en A1 con las 6 claves `P0,P1,P2,P3,P4,P5`. Cada perfil tiene **16 claves top-level**:

```
id, name, settings, vlcopt, kodiprop, headerOverrides, hlsjs, prefetch_config,
role, bounds, optimized_knobs, fitness, solver_trace, optimized_timestamp,
player_enslavement, actor_injections
```

| Perfil | `settings` keys | `vlcopt` keys | `kodiprop` keys | `headerOverrides` keys (medido) | `settings.headersCount` (declarado) |
|--------|----------------:|--------------:|----------------:|---------------------------------:|------------------------------------:|
| P0 | 57 | 48 | 8 | **402** | 233 |
| P1 | 57 | 48 | 8 | **400** | 233 |
| P2 | 57 | 48 | 8 | **402** | 233 |
| P3 | 55 | 48 | 8 | **400** | 233 |
| P4 | 55 | 48 | **7** | **400** | 233 |
| P5 | 55 | 48 | **7** | **400** | 233 |

Divergencias de esquema **entre perfiles del mismo archivo** (medidas por diferencia de conjuntos de claves):

- `settings`: P3, P4, P5 **no tienen** `transfer_characteristics` ni `matrix_coefficients` (P0–P2 sí).
- `kodiprop`: P4 y P5 **no tienen** `inputstream.adaptive.stream_headers` (P0–P3 sí).
- `settings.headersCount` = `"233"` en los 6 perfiles, pero el objeto real tiene 400–402 claves → **6/6 FAIL** de la ley L8.

### 2.2 Resto de claves exigidas

| Clave pedida | Presente en A1 | Observación medida |
|--------------|----------------|--------------------|
| `prisma_lab_sync_v20` | ✅ | 12 subclaves: `_metadata, infrastructure, feature_sheets, profile_attributes, channel_dna_defaults, codec_ladder_per_profile, n3_directives_added, placeholders_added, named_ranges_added, vba_modules, hook_injection, config_jsons_consumed_by_vps` |
| `config_global` | ✅ | 48 claves (incluye 2 filas-botón exportadas por error: `"? QUITAR PARAMETRO"`, `"? GUARDAR PRESET"`) |
| `nivel1` | ⚠️ **no existe con ese nombre** | la clave real es **`nivel1_directives`** (array de **51** objetos `{tag,value}`) |
| `nivel3` | ⚠️ **no existe con ese nombre** | la clave real es **`nivel3_per_layer`** (`VLC` 23, `KOD` 16, `HTT` 7, `EI` 8, `SI` 7, **`SYS` 0**, `URL` 4 = 65) |
| `placeholders_map` | ✅ | **57** claves `{config.*}`/`{profile.*}`/`{channel.*}`/`{calc.*}`/`{evasion.*}`/`{server.*}`/`{prisma.*}` |
| `servers` | ✅ | array de **4** objetos `{base_url, username, password, note}` → **credenciales en claro** (ver SECRETS_SCAN.md) |
| `profiles_calibrated` | ✅ | 6 perfiles (ver §2.1) |

Otras claves top-level de A1 (18 en total): `playlist_format, exported_at, profiles_calibrated,
nivel1_directives, nivel3_per_layer, servers, evasion_pool, config_global, placeholders_map,
scoring_metadata, omega_gap_plan, lab_version, lab_schema_variant, bulletproof, meta_per_profile,
prisma_lab_sync_v20, version, dnr_calibration`.

B1/B2 **no tienen** `dnr_calibration` (17 claves). B0 tiene 16 claves (sin `version`).

### 2.3 A2 / A3 (perfiles del generador) — esquema distinto

- **A2** `_meta, profiles, codec_ladder`. Cada `profiles.Pn` = `id, name, description, version, sources,
  hlsjs, bitmovin, shaka, exoplayer, headerOverrides_v10, vlcopt_v10, qoe_targets, analysis_services`.
  **No declara `resolution` ni `fps` por perfil** → coherencia nivel↔resolución **UNKNOWN** desde este archivo.
- **A3** `_meta, profiles`. Cada `profiles.Pn` = `id, name, level, quality, description, color, settings,
  vlcopt, kodiprop, enabledCategories, headerOverrides, prefetch_config, quality_levels, headers`.
  `settings` = `{resolution, buffer, strategy, bitrate, t1, t2, playerBuffer, fps, codec, headersCount, bufferSeconds, focus}`
  → tiene resolución/fps pero **no tiene `codec_full`**; el codec va en `settings.codec` (`"AV1"` en P0)
  y en `headerOverrides["X-APE-CODEC"]` (`"AV1,HEVC,VP9,H264"`).

### 2.4 A4 `visual_profiles.json` — nomenclatura incompatible

23 claves top-level. **No existen `P0..P5` puros.** Hay dos familias:

- familia 1: `P0_TRUTHFUL_SOURCE_SAFE, P1_STABLE_1080P_PREMIUM, P2_PERCEPTUAL_4K_BALANCED,
  P3_CRYSTAL_UHD_SAFE, P4_CRYSTAL_UHD_EXTREME, P5_OLED_UHD_VISUAL_FIRST_EXPERIMENTAL,
  P6_CHINA_BOX_8K_ULTRA_AGGRESSIVE` (+ alias sin prefijo y `HUAWEI_BOX_VISUAL_AGGRESSIVE`)
- familia 2: `P0_SHOWROOM_FLASH_4K, P1_DAILY_EXTREME_4K, P2_SAFE_COMPAT, P3_HD_BOOST, P4_HD_LITE, P5_SD_RESCUE`

→ el mapeo `visual_profiles.Pn_*` ↔ `lab_master.profiles_calibrated.Pn` es **UNKNOWN** (no hay clave de
correspondencia declarada en el archivo). No se inventa.

---

## 3. Estructura interna: cadenas de verdad paralelas dentro del MISMO archivo

`lab_master` declara el códec de un perfil en **cuatro** lugares distintos que **no coinciden**. Medido en A1:

| Perfil | `settings.codec_full` | `settings.codec_string[0]` | `headerOverrides["X-Stream-Codecs"][0]` | `prisma…codec_ladder_per_profile.Pn.video[0]` | Valores distintos |
|--------|----------------------|---------------------------|----------------------------------------|----------------------------------------------|------------------:|
| P0 | `dvh1.08.06` | `hvc1.2.4.L153.B0` | `dvh1.08.06` | `dvh1.05.06` | **3** |
| P1 | `hvc1.2.4.L153.B0` | `hvc1.2.4.L153.B0` | `hvc1.2.4.L153.B0` | `hvc1.2.4.L153.B0` | 1 |
| P2 | `hvc1.2.4.L150.B0` | `hvc1.2.4.L150.B0` | `hvc1.2.4.L150.B0` | `hvc1.2.4.L153.B0` | **2** |
| P3 | `hvc1.1.6.L120.B0` | `hvc1.2.4.L120.B0` | `hvc1.1.6.L120.B0` | `hvc1.1.6.L120.B0` | **2** |
| P4 | `avc1.64001f` | `avc1.640028` | `avc1.64001f` | `hvc1.1.6.L93.B0` | **3** |
| P5 | `avc1.42c01e` | `avc1.42E01E` | `avc1.42c01e` | `avc1.42E01E` | 1 (difiere sólo en caja) |

Resultado de la ley `L6_INTERNAL_CODEC_AGREEMENT`: **P0, P2, P3, P4, P5 = FAIL**; P1 = PASS (coherente… con el
valor equivocado, ver JSON_DRIFT_REPORT §3).

Igual ocurre con la resolución: `settings.resolution`, `settings.maxResolution`,
`headerOverrides["X-Stream-Resolution"]`, `headerOverrides["X-Max-Resolution"]`,
`headerOverrides["X-APE-RESOLUTION"][0]`, `kodiprop["inputstream.adaptive.max_resolution"]` y
`vlcopt["video-width"]x["video-height"]` dan valores distintos en P1–P5 (tabla completa en
`JSON_PROFILES_MATRIX.json` → `profiles.Pn.observed`).

---

## 4. Cobertura real de la inspección (honestidad de alcance)

### 4.1 Lo que SÍ se inspeccionó al 100 %

| Artefacto | Método | Cobertura |
|-----------|--------|-----------|
| A1 (280 KB) | `JSON.parse` completo en Node 24 | **100 %** del documento: las 18 claves, los 6 perfiles, los 6 × 400-402 `headerOverrides` (conteo y claves), `settings`/`vlcopt`/`kodiprop` completos, `prisma_lab_sync_v20`, `config_global`, `placeholders_map`, `servers`, `evasion_pool`, `nivel1_directives`, `nivel3_per_layer`, `dnr_calibration`, `omega_gap_plan` |
| B0–B4 (`.json` de Downloads) | `JSON.parse` + comparación estructural | **100 %** del documento (conteo de claves, perfiles, diffs profundos) |
| A2, A3, A4 | `JSON.parse` completo | **100 %** de claves y valores escalares; valores anidados profundos inspeccionados por muestreo |
| C1 (73 MB) | **streaming por chunks de 8 MB** con parser incremental propio (`tools/scan_channels_map.mjs`) | **100 % de los registros enumerados** (9.293 claves top-level leídas y contadas), **100 % de los nombres de campo** por registro (170 campos), y **agregación de 14 campos de baja cardinalidad** (`profile`, `quality_level`, `resolution`, `codec_rfc6381`, `hdr_profile`, `dolby_vision_profile`, `color_primaries`, `transfer_characteristics`, `lcevc_state`, `lcevc_base_codec`, `cmaf_profile`, `cmaf_delivery_mode`) + crosstab perfil×resolución×códec×HDR |
| C2, C3 (28 MB) | mismo streaming | **100 %** de registros (8.366), **100 %** de nombres de campo (105 / 104), agregación de los campos de baja cardinalidad presentes |
| C2b | hash | **100 %** (duplicado exacto de C2) |

Nunca se cargaron 73 MB en memoria de una vez: el parser recorre el archivo por bloques de 8 MB con un
`StringDecoder` UTF-8 incremental y descarta el texto de cada registro tras extraer nombres/valores agregados.
Tiempo medido de la pasada completa sobre C1: **1,7 s**.

### 4.2 Lo que quedó UNKNOWN (declarado, no promediado)

| UNKNOWN | Por qué |
|---------|---------|
| Valores de los ~370 `headerOverrides` NO seleccionados por perfil | Sólo se extrajeron las claves con semántica de códec/resolución/HDR/bitrate (≈35 por perfil) + las 12 que disparan los escaneos de secreto/tóxico |
| Contenido de los objetos anidados de C1/C2/C3 (`codec_priority`, `abr_ladder`, `degradation_chain`, `math_telemetry`, `fusion_directives`, `interdependency`) | Se midió **presencia (100 %)** y tipo, no el contenido interno |
| `fps` por canal en C1/C2/C3 | **El campo no existe** en el esquema → la Ley Cardinal 1 a nivel canal sólo puede evaluarse con `res_w/res_h` + nivel del códec; el `fps` del STREAM-INF no es verificable desde el mapa |
| Diferencias de **contenido** entre C2 y C3 registro a registro | Los conjuntos de claves son idénticos (8.366) pero los archivos difieren en bytes; no se hizo diff de contenido campo a campo (28 MB × 2) |
| Correspondencia `visual_profiles.Pn_*` ↔ `P0..P5` | El archivo no declara mapeo (§2.4) |
| Mapeo `Frontend_Profiles_Hash` → archivo | `config_global.Frontend_Profiles_Hash = "sha256:9ffec0b5…"` no declara **de qué** es el hash; no se puede reproducir |
| Valores DRM (`drm_server_url`, 9.293/0 registros) | Presente sólo en C1; no se inspeccionaron valores (podrían ser endpoints de licencia) |

---

## 5. Frescura (mtime) — cadena de fechas medida

```
2026-03-16 21:48  C3  frontend/data/channels_map.json      (28,4 MB)
2026-04-02 19:13  C2  backend/channels_map.json            (29,4 MB)   ← 69 días ANTES del Excel
2026-05-23 01:12  B0  MEMC-ALIGNED                         (847 KB, BOM)
2026-05-23 01:30  B1  …8K120_BACKUP_20260607.json          (408 KB)    ← baseline doctrinal nombrado
2026-06-07 16:10  B2  …MEMC-TOTAL-8K120.json               (408 KB)    ← introduce la regresión P1
2026-06-09 01:00  C1  frontend/channels_map.json           (75,1 MB)   ← 2,0 días ANTES del Excel
2026-06-11 00:25  A2  APE_ALL_PROFILES_v10_REALTIME_ENGINE (47,9 KB)
2026-06-11 01:54  X1  APE_M3U8_LAB_v8_FIXED.xlsm           (3,58 MB)   ← EXCEL SSOT
2026-06-18 15:48  A4  vps/ape-uhdx/visual_profiles.json    (84,9 KB)
2026-08-30 15:25  B3  …8K120-DNR.json                      (423 KB)
2026-08-30 21:13  A1≡B4 lab_master_22.6.0.json / CRYSTAL   (280 KB)    ← 80,8 días DESPUÉS del Excel
2026-10-25 21:38  A3  APE_ALL_PROFILES_OPTIMIZED.json      (203 KB)    ← tocado HOY por otra sesión
```

**Lectura:** el Excel (X1) es el SSOT doctrinal pero está **80,8 días por detrás** de A1 y **69 días por
delante** de C2. Ningún mapa de canales es posterior al Excel: C1 es 2 días anterior, C2 es 69 días anterior.
La cadena NO es reproducible desde el Excel actual (detalle en `JSON_DRIFT_REPORT.md` §2).

---

## 6. Prueba de no-mutación durante la auditoría

Se midió hash+mtime al inicio (23:0x) y al cierre (23:1x) de la ventana. Resultado: **idénticos** para los 13
artefactos de §1. En particular `lab_master_22.6.0.json` sigue en
`099A1707A2F1AE692FFCFEDE01165F21CD66656B786742CE8DB518581A371FD4` con mtime `2026-08-30T21:13:39.531-05:00`.

**Corrección al tablero:** la nota del capitán decía "escrito HOY 21:13". El `21:13` es correcto, el **día no**:
el mtime es **2026-08-30**, no 2026-10-25. El archivo no cambió durante T4 y no está bajo lock.

Ninguna escritura de esta auditoría tocó los artefactos auditados: todas las salidas viven en
`audit/alignment/2026-10-25/20-json/` (5 entregables) y `audit/alignment/2026-10-25/20-json/tools/`
(scripts + JSON intermedios de evidencia, reproducibles con `node`).

---

## 7. Reproducibilidad — cómo se obtiene cada número

Scripts en `audit/alignment/2026-10-25/20-json/tools/` (Node 24.12.0, sólo lectura):

| Script | Qué produce |
|--------|-------------|
| `scan_channels_map.mjs <path> <label> <out.json> [ids.json]` | pasada streaming sobre un channels_map: registros, duplicados, conjuntos de campos, crosstab, hits de credenciales (sólo nombres) |
| `identity_map.mjs <dir>` | correlación de identidades C1↔C2↔C3 (`channels_map_identity.json`) |
| `collisions.mjs <dir>` | colisiones case-insensitive por copia (`channels_map_collisions.json`) |
| `fields_diff.mjs` | diferencia de conjuntos de campos entre copias (`fields_diff.json`) |
| `compare_profiles.mjs <out> label=path…` | tabla perfil×campo a través de 9 artefactos (`profiles_compare.json`) |
| `structure_compare.mjs <out> label=path…` | conteos de cada capa de directivas por archivo (`structure_compare.json`) |
| `deepdiff.mjs A B` | diff semántico profundo (usado para B1↔B2, B2↔B3, B3↔A1) |
| `secret_scan.mjs <files…>` | secretos: nombres de clave + patrones, **nunca valores** (`secrets_scan.json`) |
| `toxic_scan.mjs <files…>` | headers tóxicos EXTHTTP (`toxic_scan.json`) |
| `locate_vps_refs.mjs <files…>` | Referer/Origin apuntando al VPS propio (trap #14) |
| `build_matrix.mjs <out> [failures.json]` | genera `JSON_PROFILES_MATRIX.json` con PASS/FAIL/UNKNOWN por ley (13 leyes incl. `L10_EXCEL_CANONICAL_MATCH` y `L11_FPS_LEVEL_CAPACITY` de D-15) |
| `excel_vs_json.mjs <out>` | cruce JSON ↔ rama canónica X1 vía `10-excel/EXCEL_PROFILES_EXTRACT.json`: 22 campos × 6 perfiles con `hoja!celda` (`excel_vs_json.json`) |

Verificación de sintaxis de todo el entregable JSON:

```
node -e "JSON.parse(require('fs').readFileSync('audit/alignment/2026-10-25/20-json/JSON_PROFILES_MATRIX.json','utf8'))"
→ parse OK   (134.951 B, 6 perfiles, 84 evaluaciones de ley, 52 fallos aislados)
   incluye cross_source.excel_canonical (D-20) y app_lane_crosscheck (respuestas a t6)
```

> **Nota de revisión (v2, tras D-20/D-22/D-15):** la matriz pasó de 72 a **84 evaluaciones** y de 43 a
> **52 fallos** al añadirse `L10_EXCEL_CANONICAL_MATCH` (JSON ↔ `6_NIVEL_2_PROFILES`) y
> `L11_FPS_LEVEL_CAPACITY` (D-15). Los conteos de §0 y §2.1–§5 de este inventario no cambian: sólo se añadió
> el cruce contra la rama canónica.

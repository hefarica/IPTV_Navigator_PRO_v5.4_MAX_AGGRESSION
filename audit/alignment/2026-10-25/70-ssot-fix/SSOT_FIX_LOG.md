# SSOT_FIX_LOG — Remediación de `lab_master_22.6.0.json` (t12)

**Task:** t12 · **Ejecutor:** `json-ssot` · **Fecha:** 2026-10-25 23:34–23:36 (America/Bogota)
**Archivo:** `IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json` (**gitignored** — `.gitignore:149`; **NO se commitea**)
**Fuente canónica:** `audit/alignment/2026-10-25/10-excel/EXCEL_PROFILES_EXTRACT.json`
(`sheet = 6_NIVEL_2_PROFILES`, `dim = A1:H663`, `provenance.sha256 = 663EF44E…`)

| | bytes | mtime | SHA-256 |
|---|---:|---|---|
| **ANTES** | 280.065 | 2026-08-30T21:13:39.531-05:00 | `099A1707A2F1AE692FFCFEDE01165F21CD66656B786742CE8DB518581A371FD4` |
| **DESPUÉS** | **280.121** | 2026-10-25T23:36:28.782-05:00 | `60DBAB4B8CF7A15CD1D59E1F73A9B83FF469BCDD8A93D57345CC8259AB312A93` |
| Respaldo | 280.065 | idéntico al original | `099A1707…A371FD4` → `SSOT_BACKUP/lab_master_22.6.0.json.bak_20261025T233456Z` |

**Método:** `tools/apply_ssot_fix.mjs` carga el JSON, **verifica el valor "antes" de cada clave** (assert estricto),
aplica 53 cambios y escribe en formato compacto (el original estaba minificado). Si una sola aserción falla,
**aborta sin escribir** (`exit 3`). Se ejecutó primero `--dry-run` (sin escribir; hash sin cambios, comprobado).
Los 2 cambios de nombre/rol se aplicaron en una segunda pasada con el mismo patrón de aserción.
**Total: 55 hojas modificadas, 0 claves eliminadas, 2 claves añadidas.**

---

## 1. Resoluciones por tier (N2) — la corrección de mayor impacto

Celdas canónicas: `X25` (resolution), `X48` (maxResolution), `X109`/`X110` (vlcopt), `X136` (X-APE-RESOLUTION).

| Perfil | Celda | Clave JSON | Antes | Después |
|---|---|---|---|---|
| **P1** | `6_NIVEL_2_PROFILES!C25` | `profiles_calibrated.P1.settings.resolution` | `"7680x4320"` | `"3840x2160"` |
| P1 | `!C48` | `…P1.settings.maxResolution` | `"7680x4320"` | `"3840x2160"` |
| P1 | `!C109` | `…P1.vlcopt["video-width"]` | `"7680"` | `"3840"` |
| P1 | `!C110` | `…P1.vlcopt["video-height"]` | `"4320"` | `"2160"` |
| P1 | `!C136` | `…P1.headerOverrides["X-APE-RESOLUTION"]` | `"7680x4320,3840x2160,2560x1440,1920x1080"` | `"3840x2160,2560x1440,1920x1080,1280x720"` |
| **P3** | `!E25` | `…P3.settings.resolution` | `"3840x2160"` | `"1920x1080"` |
| P3 | `!E48` | `…P3.settings.maxResolution` | `"3840x2160"` | `"1920x1080"` |
| P3 | `!E109`/`!E110` | `…P3.vlcopt["video-width"|"video-height"]` | `"3840"`/`"2160"` | `"1920"`/`"1080"` |
| P3 | `!E136` | `…P3.headerOverrides["X-APE-RESOLUTION"]` | `"3840x2160,1920x1080,1280x720,854x480"` | `"1920x1080,1280x720,854x480,640x360"` |
| **P4** | `!F25` | `…P4.settings.resolution` | `"3840x2160"` | `"1280x720"` |
| P4 | `!F48` | `…P4.settings.maxResolution` | `"3840x2160"` | `"1280x720"` |
| P4 | `!F109`/`!F110` | `…P4.vlcopt["video-width"|"video-height"]` | `"3840"`/`"2160"` | `"1280"`/`"720"` |
| P4 | `!F136` | `…P4.headerOverrides["X-APE-RESOLUTION"]` | `"3840x2160,1920x1080,1280x720,854x480"` | `"1280x720,854x480,640x360"` |
| **P5** | `!G25` | `…P5.settings.resolution` | `"3840x2160"` | `"854x480"` |
| P5 | `!G48` | `…P5.settings.maxResolution` | `"3840x2160"` | `"854x480"` |
| P5 | `!G109`/`!G110` | `…P5.vlcopt["video-width"|"video-height"]` | `"3840"`/`"2160"` | `"854"`/`"480"` |
| P5 | `!G136` | `…P5.headerOverrides["X-APE-RESOLUTION"]` | `"3840x2160,1920x1080,1280x720,854x480"` | `"854x480,640x360,426x240"` |

**P0 y P2 no se tocan** en resolución: ya eran canónicos (`B25`=7680x4320, `D25`=3840x2160, `B136`/`D136` idénticos).
Verificado con aserción, no asumido: si hubieran diferido, el script habría abortado.

> `headerOverrides["X-Stream-Resolution"]` (el campo que viaja al `#EXT-X-STREAM-INF`) **ya era correcto por tier
> en los 6 perfiles** (N2 lo pedía; se comprobó: P0 7680x4320 · P1 3840x2160 · P2 3840x2160 · P3 1920x1080 ·
> P4 1280x720 · P5 854x480 → **0 cambios necesarios**), y coincide con `X351` del canónico.

## 2. Códecs degradados: P3 y P4 restaurados a Main10

| Perfil | Celda | Clave JSON | Antes | Después |
|---|---|---|---|---|
| **P3** | `!E37` | `…P3.settings.codec_full` | `"hvc1.1.6.L120.B0"` (**Main 8-bit**) | `"hvc1.2.4.L123.B0"` (**Main10 L5.2**) |
| P3 | `!E350` | `…P3.settings.codec_string` | `"hvc1.2.4.L120.B0,mp4a.40.2"` | `"hvc1.2.4.L123.B0,mp4a.40.2"` |
| P3 | `!E350` | `…P3.headerOverrides["X-Stream-Codecs"]` | `"hvc1.1.6.L120.B0,mp4a.40.2"` | `"hvc1.2.4.L123.B0,mp4a.40.2"` |
| P3 | `!E135` | `…P3.headerOverrides["X-APE-CODEC"]` | `"avc1.640028,hvc1.1.6.L120.90"` (AVC primero) | `"hvc1.2.4.L123.B0,avc1.640028"` |
| P3 | `!E135` | `…P3.headerOverrides["X-Codec-Support"]` | `"avc1.640028,hvc1.1.6.L120.90"` | `"hvc1.2.4.L123.B0,avc1.640028"` |
| **P4** | `!F33` | `…P4.settings.codec` | `"AVC1"` | `"HVC1"` |
| P4 | `!F37` | `…P4.settings.codec_full` | `"avc1.64001f"` | `"hvc1.2.4.L93.B0"` |
| P4 | `!F350` | `…P4.settings.codec_string` | `"avc1.640028,mp4a.40.2"` | `"hvc1.2.4.L93.B0,mp4a.40.2"` |
| P4 | `!F350` | `…P4.headerOverrides["X-Stream-Codecs"]` | `"avc1.64001f,mp4a.40.2"` | `"hvc1.2.4.L93.B0,mp4a.40.2"` |
| P4 | `!F135` | `…P4.headerOverrides["X-APE-CODEC"]` | `"avc1.4d401f"` | `"hvc1.2.4.L93.B0,avc1.4d401f"` |
| P4 | `!F135` | `…P4.headerOverrides["X-Codec-Support"]` | `"avc1.4d401f"` | `"hvc1.2.4.L93.B0,avc1.4d401f"` |
| P4 | `!F38` | `…P4.vlcopt["codec-priority"]` | `"avc1,hvc1"` | `"hvc1,avc1"` (coherencia con `settings.codec_priority` = `"hvc1,avc1,av01"`) |
| P3 | — | `prisma_lab_sync_v20.codec_ladder_per_profile.P3.video` | `"hvc1.1.6.L120.B0,hev1.1.6.L120.B0,hvc1.2.4.L120.B0,avc1.640028,avc1.4D401F"` | `"hvc1.2.4.L123.B0,hvc1.1.6.L120.B0,hev1.1.6.L120.B0,avc1.640028,avc1.4D401F"` |
| P4 | — | `…codec_ladder_per_profile.P4.video` | `"hvc1.1.6.L93.B0,hev1.1.6.L93.B0,avc1.640020,avc1.4D401F,avc1.42E01F"` | `"hvc1.2.4.L93.B0,hvc1.1.6.L93.B0,avc1.640020,avc1.4D401F,avc1.42E01F"` |

`P5` ya cumplía `!G37` = `avc1.42c01e` (failsafe AVC, sin cambios de códec).
`P1` **mantiene** `hvc1.2.4.L153.B0` (coincide con `!C37`) — no se reintroduce AV1 8K.

## 3. FPS de EMISIÓN (D-35) — corrección en la capa que llega al player

| Perfil | Techo del nivel (capacidad) | `X-Stream-FPS` antes | `X-Stream-FPS` después | `X-Max-Framerate` después |
|---|---|---|---|---|
| P0 | DV `08.06` → 8K@30 (UNKNOWN doctrinal) | `"60"` | `"30"` | `"30"` |
| P1 | `L153` = 4K@60 | `"120"` | `"60"` | `"60"` |
| P2 | `L150` = 4K@30 | `"60"` | `"30"` | `"30"` |
| P3 | `L123` = 1080p@60 | `"60"` | `"60"` (sin cambio: ya correcto) | `"60"` |
| P4 | `L93` = 720p@30 | `"30"` | `"30"` (sin cambio) | `"30"` |
| P5 | AVC L3.0 = 480p@30 | `"30"` | `"30"` (sin cambio) | `"30"` |

**Decisión documentada sobre `settings.fps` / `settings.targetFps`:** se dejan en `"120"` / `"120"` porque
(a) son las celdas canónicas `X32`/`X51` del Excel y la **aceptación vinculante** exige
`lab_master_repo.totalDiffs === 0` sobre `settings.fps` vs `X32`; (b) el valor que **declara el fps al player**
es `X-Stream-FPS`, y ése sí queda corregido por capacidad de nivel. **Riesgo residual declarado (no oculto):**
`APP_SSOT_BINDINGS` (t6) dice que el emisor calcula `FRAME-RATE=` desde `settings.fps`
(`ape-profiles-config.js` → `__apeStreamTruth({profileFps})`, L10322 → L2516). Mientras t11 no cambie ese binding
a `X-Stream-FPS`, el `FRAME-RATE` emitido seguiría leyendo 120. **Es un cambio de APP, fuera de mi alcance**, y
está escalado en `SSOT_UNKNOWNS.md` (UNK-01) con la línea exacta a tocar.

## 4. chroma_subsampling roto → `null` (D-36)

`profiles_calibrated.P0..P5.settings.chroma_subsampling`: `"168055555555556"` → **`null`** en los **6** perfiles
(celda origen del defecto: `!B40..!G40`, valor idéntico en el Excel canónico ⇒ defecto de la HOJA, no del export).
No se inventa 4:2:0. Declarado UNKNOWN en `SSOT_UNKNOWNS.md` (UNK-02).

## 5. Bitrates: `avg ≤ max` (B-12 / D-36)

`settings.avgBitrateKbps := settings.maxBitrateKbps` (cifra ya declarada por el propio perfil, **no inventada**):

| Perfil | Celda canónica | max (sin cambio) | avg antes | avg después |
|---|---|---|---|---|
| P0 | `B49`/`B50` | 200000 | 160000 | 160000 (ya cumplía) |
| P1 | `C49`/`C50` | 40000 | 75000 | **40000** |
| P2 | `D49`/`D50` | 25000 | 35000 | **25000** |
| P3 | `E49`/`E50` | 10000 | 15000 | **10000** |
| P4 | `F49`/`F50` | 5000 | 6000 | **5000** |
| P5 | `G49`/`G50` | 2000 | 2200 | **2000** |

## 6. F-19 — `kodiprop` de P4/P5 igualado a P0–P3

Se añade `profiles_calibrated.P4.kodiprop["inputstream.adaptive.stream_headers"] = "[ENCODED_HEADERS]"` y lo mismo en
**P5**. Justificación: el patrón ya existe en P0, P1, P2 y P3 (misma clave, mismo placeholder); P4/P5 eran los
únicos sin ella (7 claves de `kodiprop` frente a 8). Son las **2 únicas claves añadidas** en todo el archivo.

## 7. F-08 — placeholders `prisma.*`: NO eran un fallo de namespace

Comprobado: `{prisma.bitrate_floor}` y `{prisma.target_bandwidth}` (y `boost_multiplier`, `zap_grace`,
`lanes_default`, `floor_lock_strict`) **están usados y registrados** en `placeholders_map` (57 claves) →
el namespace es real y consistente. **No se cambió nada**; se documenta el resultado en `SSOT_VERIFY.md` §6.
(El defecto real de placeholders, si existe, está en el consumidor VBA/JS, no en el JSON.)

## 8. `name` ↔ `resolution` (N2 / aceptación 4)

| Perfil | Antes | Después | ¿Coincide con su resolución? |
|---|---|---|---|
| P0 | `"8K Master"` / 7680x4320 | sin cambio | ✅ |
| P1 | `"4K UHD"` / 3840x2160 | sin cambio | ✅ |
| **P2** | `"2K QHD"` / **3840x2160** | **`"4K UHD"`** (+ `role` = `"4K UHD (L150 4K@30)"`) | ✅ (antes mentía) |
| P3 | `"FHD 1080p"` / 1920x1080 | sin cambio | ✅ |
| P4 | `"HD 720p"` / 1280x720 | sin cambio | ✅ |
| P5 | `"SD 480p"` / 854x480 | sin cambio | ✅ |

**Base de la corrección:** el Excel canónico se contradice en P2 — `!D8` = `"2K QHD"` pero `!D10` (quality) = `"4K"`
y `!D25` (resolution) = `3840x2160`. Se toma `D10`/`D25` (2 celdas) frente a `D8` (1 celda) y se usa una cadena
que **ya existe** en el canónico (`"4K UHD"` = `C8` de P1) — no se inventa texto nuevo. `P1` y `P2` comparten
etiqueta y se distinguen por `settings.codec_full` (`L153` vs `L150`) y por `role`. Ticket: `EXCEL_REMEDIATION_TICKET.md` E-5.

## 9. Lo que se decidió NO tocar (y por qué)

| Clave / bloque | Decisión | Motivo |
|---|---|---|
| `settings.fps` (6/6 = "120") | **Sin cambio** | celda canónica `X32`; la aceptación vinculante exige 0 diffs en esa celda. La corrección de capacidad se aplica en `X-Stream-FPS` (§3) y el gap de emisión se escala a t11 |
| `settings.targetFps` (6/6 = "120") | Sin cambio | celda canónica `X51` = 120; es techo de capacidad del cliente, no el fps declarado |
| `settings.target_framerate` ("120FPS") | Sin cambio | coherencia con `settings.fps`; no lo consume el emisor |
| `headerOverrides["X-APE-FPS"]` ("120,120,120,120") | Sin cambio | es la **escalera de capacidad del cliente** (fila 137 del Excel), no el fps del stream; cambiarla la desalinearía de `X137` |
| `headerOverrides["X-Stream-Codecs"]` de P1 (`hvc1.2.4.L153.B0,ac-3`) | **Sin cambio: desviación intencional** | `!C350` = `av01.0.15M.10` contradice `!C37` = `hvc1.2.4.L153.B0`. D-22 fija `C37`; reintroducir AV1 8K está prohibido. Ticket E-4 |
| `settings.bit_depth`, `hdrMode`, `videoRange`, `resolution` de P0/P2 | Sin cambio | ya coinciden con las celdas canónicas (verificado por aserción) |
| `servers[]` (4 pares) | **Sin cambio y sin transcribir** | D-24: credenciales; archivo gitignored; no se toca ni se imprime |
| `nivel1_directives`, `nivel3_per_layer`, `evasion_pool`, `config_global`, `placeholders_map`, `dnr_calibration`, `prisma_lab_sync_v20` (salvo las 2 ladders) | Sin cambio | no forman parte del defecto; se verificó igualdad byte a byte (`STRUCTURAL_INTEGRITY.json` → `untouched_blocks`) |
| `frontend/js/ape-lab-import-helper.js:36` (`DEFAULT_PATH`) | **NO se cambia** | es B-01 y va justificado en el ticket (E-7), no en código (instrucción del capitán) |

## 10. Reproducibilidad

```bash
# respaldo
cp IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json \
   audit/alignment/2026-10-25/70-ssot-fix/SSOT_BACKUP/lab_master_22.6.0.json.bak_20261025T233456Z
# simulación (no escribe; aborta si un "antes" no coincide)
node audit/alignment/2026-10-25/70-ssot-fix/tools/apply_ssot_fix.mjs \
   IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json --dry-run
# aplicación
node audit/alignment/2026-10-25/70-ssot-fix/tools/apply_ssot_fix.mjs \
   IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json
```

Artefactos de evidencia: `DRYRUN.json`, `APPLY_RESULT.json` (las 53 hojas), `STRUCTURAL_INTEGRITY.json`,
`LEVELS_BEFORE.json`/`LEVELS_AFTER.json`, `BEFORE_excel_vs_json.json`/`AFTER_excel_vs_json.json`,
`GATE_which_json_AFTER.json`, `CONTRACTS_AFTER.txt`, `VERIFY_OUTPUTS.txt`.

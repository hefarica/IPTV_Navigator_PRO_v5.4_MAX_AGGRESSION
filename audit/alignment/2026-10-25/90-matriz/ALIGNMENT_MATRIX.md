# ALIGNMENT_MATRIX — Matriz de alineación capa↔capa (t9 / T8)

**Tarea:** t9 (T8) · **Auditor:** `verificador-alineacion` · **Attempt:** `3820167a-e18e-42ea-a71b-80c638a49b5e`
**Naturaleza:** gate de verificación · solo lectura sobre producción · cero fixes aplicados.
**Fecha de construcción:** 2026-10-26T04:31:13.651Z

**Fuente única de esta tabla:** el mismo array `rows` que genera `ALIGNMENT_MATRIX.json`
(`audit/alignment/2026-10-25/90-matriz/tools/build_matrix.mjs`). El script falla (exit 1) si el nº de filas o los
estados difieren entre `.md` y `.json`: la equivalencia no es una promesa, es una aserción.

## 0. Precedencia aplicada (D-02) y los dos artefactos JSON

| Nivel | Fuente | bytes | sha256 | Veredicto de uso |
|---|---|---:|---|---|
| 1 | Excel canónico `Downloads/APE_M3U8_LAB_v8_FIXED.xlsm` | 3.582.019 | `663EF44E…52806A` | **SSOT de celdas** (D-20). Re-hasheado por t9: idéntico |
| 2 | `contracts/crystal_contracts.json` | 6.053 | `F6EDFE85C961…` | Pin de artefactos VPS; ver §7 |
| 3 | `Downloads/LAB_CALIBRATED_20260611_020645.json` | 222.364 | `6931BAF4…` | **Export FIEL del Excel: 0 diffs/24** |
| 4 | `frontend/lab_master_22.6.0.json` (= CRYSTAL-4K-UHD) | 280.065 | `099A1707…` | **Es el que la APP carga** (`ape-lab-import-helper.js:36`); 10 diffs/24 vs Excel |

> **Hallazgo estructural de t9 (no estaba en el tablero):** el exportador **no** es el culpable. El JSON que el
> repo consume por defecto es un artefacto **distinto** del export canónico y diverge en 10 de 24 celdas mapeadas.
> Todo PASS/FAIL de la arista E1 se refiere al artefacto que la APP carga; el escritor se evalúa aparte (fila `E1-EXPORT`).

## 1. Totales

| Estado | Filas |
|---|---:|
| **PASS** | 16 |
| **FAIL** | 32 |
| **UNKNOWN** | 5 |
| **TOTAL** | **53** |

| Arista | PASS | FAIL | UNKNOWN | Perfiles P0–P5 cubiertos |
|---|---:|---:|---:|---|
| Excel→JSON | 3 | 4 | 0 | P0 P1 P2 P3 P4 P5 |
| JSON→APP | 0 | 7 | 0 | P0 P1 P2 P3 P4 P5 |
| APP→listas | 0 | 7 | 1 | P0 P1 P2 P3 P4 P5 |
| listas→VPS-served | 7 | 1 | 3 | P0 P1 P2 P3 P4 P5 |
| VPS-served→player | 5 | 8 | 1 | P0 P1 P2 P3 P4 P5 |
| doctrina→realidad | 1 | 5 | 0 | P1 |

**Regla aplicada:** `UNKNOWN` no es `PASS`. Cada UNKNOWN de esta matriz declara el motivo por el que no se pudo
observar (perfil ausente del catálogo, ruta inexistente, o artefacto no versionado).

### 1.1 Cobertura por familia de lista

Las familias **solo existen a partir de la capa de lista**: E1 (Excel→JSON) y E2 (JSON→APP) son *family-agnostic*
por construcción (hay **un** SSOT y **un** generador, no dos familias). La exigencia «≥1 fila por familia de lista»
se satisface en las tres aristas donde la familia es una dimensión real: **E3, E4 y E5**.

| Familia | Qué es | Aristas con filas propias |
|---|---|---|
| **FAM-A-DIRECT** | A · directa al proveedor, servida por el VPS (5 listas, 95.776 canales) | APP→listas · listas→VPS-served · VPS-served→player |
| **FAM-A-SHIELDED** | A · SHIELDED (sufijo de archivo; payload ≡ A4) | listas→VPS-served |
| **FAM-A-CDN** | A · CDN (`/cdn/`), 2 listas, 21.040 canales — las únicas que atraviesan el rewrite | listas→VPS-served · VPS-served→player |
| **FAM-B-REPO** | B · directa versionada en el repo (22 contenidos distintos, 1.449.276.021 B) | APP→listas · listas→VPS-served · VPS-served→player |

## 2.1. E1 · Excel → JSON

| # | Perfil | Familia | Esperado (cita SSOT) | Observado (archivo:línea / sha256) | Estado | Impacto |
|---|---|---|---|---|---|---|
| E1-P0 | P0 | — | res=B25 "7680x4320" · fps=B32 120 · codec_full=B37 "dvh1.08.06" · maxRes=B48 "7680x4320"<br><sub>Excel canónico: APE_M3U8_LAB_v8_FIXED.xlsm (C:/Users/HFRC/Downloads) 3.582.019 B sha256:663EF44E…52806A · hoja 6_NIVEL_2_PROFILES (A1:H663) · celdas citadas vía audit/alignment/2026-10-25/10-excel/EXCEL_PROFILES_EXTRACT.json · sha256:D977BC999CB4…</sub> | settings.resolution=7680x4320 · fps=120 · codec_full=dvh1.08.06 · maxResolution=7680x4320 (0 diffs/4 campos) → el artefacto del repo copia fielmente la hoja<br><sub>IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json · sha256:099A1707…371FD4 · audit/alignment/2026-10-25/90-matriz/_raw/canon_vs_json.json · sha256:F8B82BEF70B1…</sub> | **PASS** | NONE |
| E1-P1 | P1 | — | res=C25 "3840x2160" · fps=C32 120 · codec_full=C37 "hvc1.2.4.L153.B0" · maxRes=C48 "3840x2160" (D-22/D-34)<br><sub>Excel canónico: APE_M3U8_LAB_v8_FIXED.xlsm (C:/Users/HFRC/Downloads) 3.582.019 B sha256:663EF44E…52806A · hoja 6_NIVEL_2_PROFILES (A1:H663) · audit/alignment/2026-10-25/10-excel/EXCEL_PROFILES_EXTRACT.json · sha256:D977BC999CB4…</sub> | resolution=7680x4320 (≠) · maxResolution=7680x4320 (≠) · codec_full=hvc1.2.4.L153.B0 (=) · fps=120 (=) → 2 diffs/4. Además headerOverrides.X-APE-RESOLUTION[0]="7680x4320…" y vlcopt video-width=7680/video-height=4320 (≠ C136/C109/C110)<br><sub>lab_master_22.6.0.json sha256:099A1707…371FD4 · audit/alignment/2026-10-25/90-matriz/_raw/canon_vs_json.json · sha256:F8B82BEF70B1… · audit/alignment/2026-10-25/20-json/JSON_PROFILES_MATRIX.json §P1.laws.L10_EXCEL_CANONICAL_MATCH (6 diffs) · sha256:FDD50FE6E15C…</sub> | **FAIL** | LAW:L1+L3 · CHAIN_BREAK |
| E1-P2 | P2 | — | res=D25 "3840x2160" · fps=D32 120 · codec_full=D37 "hvc1.2.4.L150.B0" · maxRes=D48 "3840x2160"<br><sub>Excel canónico: APE_M3U8_LAB_v8_FIXED.xlsm (C:/Users/HFRC/Downloads) 3.582.019 B sha256:663EF44E…52806A · hoja 6_NIVEL_2_PROFILES (A1:H663) · audit/alignment/2026-10-25/10-excel/EXCEL_PROFILES_EXTRACT.json · sha256:D977BC999CB4…</sub> | resolution=3840x2160 · fps=120 · codec_full=hvc1.2.4.L150.B0 · maxResolution=3840x2160 → 0 diffs/4<br><sub>lab_master_22.6.0.json · audit/alignment/2026-10-25/90-matriz/_raw/canon_vs_json.json · sha256:F8B82BEF70B1…</sub> | **PASS** | NONE |
| E1-P3 | P3 | — | res=E25 "1920x1080" · fps=E32 120 · codec_full=E37 "hvc1.2.4.L123.B0" (Main10) · maxRes=E48 "1920x1080" (D-37)<br><sub>Excel canónico: APE_M3U8_LAB_v8_FIXED.xlsm (C:/Users/HFRC/Downloads) 3.582.019 B sha256:663EF44E…52806A · hoja 6_NIVEL_2_PROFILES (A1:H663) · audit/alignment/2026-10-25/10-excel/EXCEL_PROFILES_EXTRACT.json · sha256:D977BC999CB4…</sub> | resolution=3840x2160 (≠) · maxResolution=3840x2160 (≠) · codec_full=hvc1.1.6.L120.B0 (≠, degradado a Main 8-bit) → 3 diffs/4<br><sub>lab_master_22.6.0.json · audit/alignment/2026-10-25/90-matriz/_raw/canon_vs_json.json · sha256:F8B82BEF70B1… · audit/alignment/2026-10-25/20-json/JSON_DRIFT_REPORT.md · sha256:36274703292D…</sub> | **FAIL** | LAW:L1+L4+L3 · CHAIN_BREAK |
| E1-P4 | P4 | — | res=F25 "1280x720" · fps=F32 120 · codec_full=F37 "hvc1.2.4.L93.B0" (Main10) · maxRes=F48 "1280x720" (D-37)<br><sub>Excel canónico: APE_M3U8_LAB_v8_FIXED.xlsm (C:/Users/HFRC/Downloads) 3.582.019 B sha256:663EF44E…52806A · hoja 6_NIVEL_2_PROFILES (A1:H663) · audit/alignment/2026-10-25/10-excel/EXCEL_PROFILES_EXTRACT.json · sha256:D977BC999CB4…</sub> | resolution=3840x2160 (≠) · maxResolution=3840x2160 (≠) · codec_full=avc1.64001f (≠, AVC/Baseline-ish en vez de Main10) → 3 diffs/4<br><sub>lab_master_22.6.0.json · audit/alignment/2026-10-25/90-matriz/_raw/canon_vs_json.json · sha256:F8B82BEF70B1… · audit/alignment/2026-10-25/20-json/JSON_DRIFT_REPORT.md · sha256:36274703292D…</sub> | **FAIL** | LAW:L1+L4+L3 · CHAIN_BREAK |
| E1-P5 | P5 | — | res=G25 "854x480" · fps=G32 120 · codec_full=G37 "avc1.42c01e" · maxRes=G48 "854x480"<br><sub>Excel canónico: APE_M3U8_LAB_v8_FIXED.xlsm (C:/Users/HFRC/Downloads) 3.582.019 B sha256:663EF44E…52806A · hoja 6_NIVEL_2_PROFILES (A1:H663) · audit/alignment/2026-10-25/10-excel/EXCEL_PROFILES_EXTRACT.json · sha256:D977BC999CB4…</sub> | resolution=3840x2160 (≠) · maxResolution=3840x2160 (≠) · codec_full=avc1.42c01e (=) → 2 diffs/4<br><sub>lab_master_22.6.0.json · audit/alignment/2026-10-25/90-matriz/_raw/canon_vs_json.json · sha256:F8B82BEF70B1…</sub> | **FAIL** | LAW:L1+L3 · CHAIN_BREAK |
| E1-EXPORT | P0–P5 | — | El exportador (mod_PRISMA_Export.bas) debe escribir las celdas de 6_NIVEL_2_PROFILES sin alterarlas<br><sub>Excel canónico: APE_M3U8_LAB_v8_FIXED.xlsm (C:/Users/HFRC/Downloads) 3.582.019 B sha256:663EF44E…52806A · hoja 6_NIVEL_2_PROFILES (A1:H663)</sub> | C:/Users/HFRC/Downloads/LAB_CALIBRATED_20260611_020645.json (222.364 B, sha256:6931BAF4…) → **0 diffs / 24 comparaciones** (res, fps, codec_full, maxResolution × 6 perfiles) ⇒ el exportador es FIEL<br><sub>audit/alignment/2026-10-25/90-matriz/_raw/which_json_is_export.json · sha256:7639DCD04657… · audit/alignment/2026-10-25/20-json/JSON_INVENTORY.md · sha256:0680ABC3B22A…</sub> | **PASS** | NONE |

**Notas de fila:**

- **E1-P0** — La fidelidad es PASS; el VALOR es defectuoso (fps=120 sobre DV level 6.0) → se evalúa en la ley L11/D-35, no en esta arista (D-36).
- **E1-P1** — Híbrido corrupto: resolución de la hoja 37_VALORES_UNIFICADOS (8K) + codec de 6_NIVEL_2_PROFILES (L153 4K@60) = el patrón del freeze 2026-06-08.
- **E1-P2** — Fidelidad PASS. Nota: P2 es el único perfil cuyo códec NO degrada el JSON (L150 en hoja y en JSON).
- **E1-P3** — Doble rotura: resolución inflada a 4K y piso Main10 roto (hvc1.1.* = Main 8-bit).
- **E1-P4** — Degradación a AVC de un perfil que la hoja define Main10 L93.
- **E1-P5** — El perfil failsafe SD declara 4K: el player que caiga a P5 pedirá una resolución que el nivel AVC 3.0 no sostiene.
- **E1-EXPORT** — HALLAZGO t9: el eslabón Excel→JSON está SANO en el escritor. El artefacto divergente es lab_master_22.6.0.json (= CRYSTAL-4K-UHD, 10 diffs/24), que es justo el que la APP carga por defecto (ape-lab-import-helper.js:36 DEFAULT_PATH="lab_master_22.6.0.json").

## 2.2. E2 · JSON → APP (generador JS + resolver PHP)

| # | Perfil | Familia | Esperado (cita SSOT) | Observado (archivo:línea / sha256) | Estado | Impacto |
|---|---|---|---|---|---|---|
| E2-P0 | P0 | — | JSON P0: RESOLUTION=7680x4320 · CODECS=dvh1.08.06 · FRAME-RATE=120 (settings.*)<br><sub>audit/alignment/2026-10-25/30-app/APP_EMISSION_CONTRACT.md §3 tabla SSOT + §4 · sha256:9DEF4C88DC69…</sub> | APP rama D emite RESOLUTION=7680x4320 (coincide por el fake-8K, no por binding) · CODECS=hvc1.2.4.L183.B0 (≠ dvh1) · FRAME-RATE=60.000 (clamp ≠ 120) · BANDWIDTH=200.000.000 (≠ bandwidth_max 80.000.000)<br><sub>m3u8-typed-arrays-ultimate.js:10363-10364 (fakeMode default "8k"), :2495-2500 (rr forzado 7680x4320), :2581 (pqAllowed), :10393 (emisión STREAM-INF) · ape-hevc-cascade.js resolveTierByResolution · audit/alignment/2026-10-25/30-app/APP_EMISSION_CONTRACT.md §4 P0 + §6 · sha256:9DEF4C88DC69…</sub> | **FAIL** | LAW:L2+L3 |
| E2-P1 | P1 | — | JSON P1: RESOLUTION=7680x4320 · CODECS=hvc1.2.4.L153.B0 · FRAME-RATE=120<br><sub>audit/alignment/2026-10-25/30-app/APP_EMISSION_CONTRACT.md §3/§4 · sha256:9DEF4C88DC69…</sub> | RESOLUTION=7680x4320 (=) · CODECS=hvc1.2.4.L183.B0 (≠ L153) · FRAME-RATE=60.000 (≠ 120)<br><sub>m3u8-typed-arrays-ultimate.js:10363-10364 (fakeMode default "8k"), :2495-2500 (rr forzado 7680x4320), :2581 (pqAllowed), :10393 (emisión STREAM-INF) · audit/alignment/2026-10-25/30-app/APP_EMISSION_CONTRACT.md §4 P1 · sha256:9DEF4C88DC69…</sub> | **FAIL** | LAW:L2+L3 |
| E2-P2 | P2 | — | JSON P2: RESOLUTION=3840x2160 · CODECS=hvc1.2.4.L150.B0 · FRAME-RATE=120<br><sub>audit/alignment/2026-10-25/30-app/APP_EMISSION_CONTRACT.md §3/§4 · sha256:9DEF4C88DC69…</sub> | RESOLUTION=7680x4320 (≠, forzado por fakeMode) · CODECS=hvc1.2.4.L183.B0 (≠ L150) · FRAME-RATE=60.000 (≠)<br><sub>m3u8-typed-arrays-ultimate.js:10363-10364 (fakeMode default "8k"), :2495-2500 (rr forzado 7680x4320), :2581 (pqAllowed), :10393 (emisión STREAM-INF) · audit/alignment/2026-10-25/30-app/APP_EMISSION_CONTRACT.md §4 P2 + §6 recuadro · sha256:9DEF4C88DC69…</sub> | **FAIL** | LAW:L2+L1 |
| E2-P3 | P3 | — | JSON P3: RESOLUTION=3840x2160 · CODECS=hvc1.1.6.L120.B0 · FRAME-RATE=120 · video_range=SDR<br><sub>audit/alignment/2026-10-25/30-app/APP_EMISSION_CONTRACT.md §3/§4 · sha256:9DEF4C88DC69…</sub> | RESOLUTION=7680x4320 (≠) · CODECS=avc1.64003E (familia ≠: AVC) · FRAME-RATE=60.000 (≠) · VIDEO-RANGE=PQ (SSOT dice SDR)<br><sub>m3u8-typed-arrays-ultimate.js:10363-10364 (fakeMode default "8k"), :2495-2500 (rr forzado 7680x4320), :2581 (pqAllowed), :10393 (emisión STREAM-INF) · :10236-10238 (avc1.640029→64003E) · audit/alignment/2026-10-25/30-app/APP_EMISSION_CONTRACT.md §4 P3 · sha256:9DEF4C88DC69…</sub> | **FAIL** | LAW:L2+L3 |
| E2-P4 | P4 | — | JSON P4: RESOLUTION=3840x2160 · CODECS=avc1.64001f · FRAME-RATE=120<br><sub>audit/alignment/2026-10-25/30-app/APP_EMISSION_CONTRACT.md §3/§4 · sha256:9DEF4C88DC69…</sub> | RESOLUTION=7680x4320 (≠) · CODECS=avc1.64003E (≠ 64001f) · FRAME-RATE=60.000 (≠)<br><sub>m3u8-typed-arrays-ultimate.js:10363-10364 (fakeMode default "8k"), :2495-2500 (rr forzado 7680x4320), :2581 (pqAllowed), :10393 (emisión STREAM-INF) · audit/alignment/2026-10-25/30-app/APP_EMISSION_CONTRACT.md §4 P4 · sha256:9DEF4C88DC69…</sub> | **FAIL** | LAW:L2+L3 |
| E2-P5 | P5 | — | JSON P5: RESOLUTION=3840x2160 · CODECS=avc1.42c01e · FRAME-RATE=120<br><sub>audit/alignment/2026-10-25/30-app/APP_EMISSION_CONTRACT.md §3/§4 · sha256:9DEF4C88DC69…</sub> | RESOLUTION=7680x4320 (≠) · CODECS=avc1.64003E (≠ 42c01e) · FRAME-RATE=60.000 (≠)<br><sub>m3u8-typed-arrays-ultimate.js:10363-10364 (fakeMode default "8k"), :2495-2500 (rr forzado 7680x4320), :2581 (pqAllowed), :10393 (emisión STREAM-INF) · audit/alignment/2026-10-25/30-app/APP_EMISSION_CONTRACT.md §4 P5 · sha256:9DEF4C88DC69…</sub> | **FAIL** | LAW:L2+L3 |
| E2-RESOLVER | P0/P1 (ct=sports) | — | El resolver PHP debe declarar el nivel que soporte la resolución+fps (Ley L1)<br><sub>Manifiesto OMEGA Ley 1 + D-15</sub> | resolve_quality_unified.php:5519-5520 emite RESOLUTION=3840x2160, FRAME-RATE={fps}.000, CODECS="hvc1.2.4.L153.B0,mp4a.40.2" con fps=120 para ct=sports ⇒ L153 (4K@60) declarando 4K@120 = imposible. Añade además HDR=PQ, atributo inexistente en RFC 8216, y AUDIO/SUBTITLES con GROUP-ID inexistente<br><sub>IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php:5514-5522 · sha256:20AC4B26…C5F2B5 · audit/alignment/2026-10-25/30-app/APP_EMISSION_CONTRACT.md §7 · sha256:9DEF4C88DC69…</sub> | **FAIL** | LAW:L1 · CHAIN_BREAK |

**Notas de fila:**

- **E2-P0** — El códec DV del SSOT nunca llega a la lista: la cascada CSV (V2) manda sobre codec_full (V1).
- **E2-P1** — La APP "corrige" el nivel por su cuenta (L153→L183); es un override no declarado del SSOT.
- **E2-P2** — F-APP-04: override TOTAL de la resolución. Es el mecanismo por el que el SSOT deja de mandar.
- **E2-P3** — AVC declarado sobre RESOLUTION 8K: dos capas de mentira al player (familia y resolución).
- **E2-P4** — Mismo patrón.
- **E2-P5** — El perfil failsafe deja de ser failsafe: declara 8K con AVC High.
- **E2-RESOLVER** — F-APP-01: la aplicación PHP replica el freeze 2026-06-08 por diseño (fps=120 fijo con nivel 5.1).

## 2.3. E3 · APP → listas .m3u8 (familia VPS y familia directa)

| # | Perfil | Familia | Esperado (cita SSOT) | Observado (archivo:línea / sha256) | Estado | Impacto |
|---|---|---|---|---|---|---|
| E3-P0 | P0 | A (servida) | APP declara P0 = RESOLUTION 7680x4320 + CODECS hvc1.2.4.L183.B0 (contrato §4). El catálogo debe llevar al menos una variante P0 coherente<br><sub>audit/alignment/2026-10-25/30-app/APP_EMISSION_CONTRACT.md §4 P0 · sha256:9DEF4C88DC69…</sub> | En APE_LISTA_1792869328847.m3u8.gz hay 100 STREAM-INF con STABLE-VARIANT-ID="*_P0": 96× 3840x2160@60 + L120, 4× 3840x2160@30 + L123. CERO variantes 8K y CERO dvh1<br><sub>audit/alignment/2026-10-25/90-matriz/_raw/PHYS_served_streaminf_by_profile.txt (censo t9: 14.343 STREAM-INF agrupados por perfil) · sha256:FD2CD091C440… · audit/alignment/2026-10-25/50-listas/LISTS_CODEC_COHERENCE.md §1.1 · sha256:E7C6192D965D…</sub> | **FAIL** | LAW:L1+L3 · CHAIN_BREAK |
| E3-P1 | P1 | A (servida) | APP declara P1 = 7680x4320 + L183; el SSOT canónico dice 3840x2160 + L153<br><sub>audit/alignment/2026-10-25/30-app/APP_EMISSION_CONTRACT.md §4 P1 · sha256:9DEF4C88DC69… · audit/alignment/2026-10-25/10-excel/EXCEL_PROFILES_EXTRACT.json C25/C37 · sha256:D977BC999CB4…</sub> | 909 STREAM-INF "*_P1": 737× 3840x2160@30 + hvc1.2.4.L123.B0, 172× 3840x2160@60 + hvc1.2.4.L120.B0. Ni 8K, ni L183, ni L153<br><sub>audit/alignment/2026-10-25/90-matriz/_raw/PHYS_served_streaminf_by_profile.txt · sha256:FD2CD091C440… · muestra física: línea 35.279 del .gz descomprimido · audit/alignment/2026-10-25/50-listas/LISTS_CODEC_COHERENCE.md §1.1 (cita STABLE-VARIANT-ID="47_P1") · sha256:E7C6192D965D…</sub> | **FAIL** | LAW:L1+L3 · CHAIN_BREAK |
| E3-P2 | P2 | A (servida) | APP declara P2 = 7680x4320 + L183; SSOT 3840x2160 + L150<br><sub>audit/alignment/2026-10-25/30-app/APP_EMISSION_CONTRACT.md §4 P2 · sha256:9DEF4C88DC69…</sub> | 0 STREAM-INF con STABLE-VARIANT-ID "*_P2" en los 14.343 del catálogo servido<br><sub>audit/alignment/2026-10-25/90-matriz/_raw/PHYS_served_streaminf_by_profile.txt (no aparece la fila P2) · sha256:FD2CD091C440…</sub> | **UNKNOWN** | CHAIN_BREAK? |
| E3-P3 | P3 | A (servida) | APP declara P3 = 7680x4320 + avc1.64003E (fake) ; SSOT 3840x2160 + hvc1.1.6.L120<br><sub>audit/alignment/2026-10-25/30-app/APP_EMISSION_CONTRACT.md §4 P3 · sha256:9DEF4C88DC69… · audit/alignment/2026-10-25/10-excel/EXCEL_PROFILES_EXTRACT.json E25/E37 · sha256:D977BC999CB4…</sub> | 13.167 STREAM-INF "*_P3": 9.638× 1920x1080@30 + L150 (coherente), 3.523× 1920x1080@60 + L123 (coherente), 6× 3840x2160@60 + L120 (imposible). Cero AVC<br><sub>audit/alignment/2026-10-25/90-matriz/_raw/PHYS_served_streaminf_by_profile.txt · sha256:FD2CD091C440…</sub> | **FAIL** | LAW:L3+L1 |
| E3-P4 | P4 | A (servida) | P4 canónico = 1280x720 + hvc1.2.4.L93.B0 (Excel F25/F37)<br><sub>audit/alignment/2026-10-25/10-excel/EXCEL_PROFILES_EXTRACT.json F25/F37 · sha256:D977BC999CB4…</sub> | 38 STREAM-INF "*_P4": 26× 1920x1080@30+L150, 12× 1920x1080@60+L123. Se declara 1080p para el perfil "HD 720p"<br><sub>audit/alignment/2026-10-25/90-matriz/_raw/PHYS_served_streaminf_by_profile.txt · sha256:FD2CD091C440…</sub> | **FAIL** | LAW:L3 |
| E3-P5 | P5 | A (servida) | P5 canónico = 854x480 + avc1.42c01e (Excel G25/G37)<br><sub>audit/alignment/2026-10-25/10-excel/EXCEL_PROFILES_EXTRACT.json G25/G37 · sha256:D977BC999CB4…</sub> | 129 STREAM-INF "*_P5": 34× 1920x1080@30+L150, 95× 1920x1080@60+L123<br><sub>audit/alignment/2026-10-25/90-matriz/_raw/PHYS_served_streaminf_by_profile.txt · sha256:FD2CD091C440…</sub> | **FAIL** | LAW:L3 |
| E3-FAM-A | todos | A (5 listas directas + 2 CDN = 116.816 canales) | GOLDEN RULE (hvc1 sólo en STREAM-INF, hev1 sólo en tags de player) + Ley L1 + 0 headers tóxicos<br><sub>Manifiesto OMEGA Ley 1/4 · CLAUDE.md «GOLDEN RULE»</sub> | GOLDEN RULE PASS (0 hev1 en STREAM-INF de 14.343; hev1 sólo en #EXT-X-APE-CHANNEL-RUNTIME-CODEC-HEV1) · 0 headers tóxicos en 6 listas medidas · audio en CODECS 14.343/14.343 · PERO 1.015/14.343 STREAM-INF violan L1<br><sub>audit/alignment/2026-10-25/50-listas/LISTS_CODEC_COHERENCE.md §1.1/§1.2/§1.5 · sha256:E7C6192D965D… · audit/alignment/2026-10-25/50-listas/LISTS_HEADERS_TRAPS.md §3 · sha256:79FF7174CAE6…</sub> | **FAIL** | LAW:L1 · CHAIN_BREAK |
| E3-FAM-B | todos | B (22 contenidos del repo) | GOLDEN RULE + Ley L1 + 0 tóxicos + 0 SUPPLEMENTAL-CODECS inventado<br><sub>Manifiesto OMEGA Leyes 1/4 · CLAUDE.md «Lo que NUNCA se hace»</sub> | hev1.1.6.L153.B0 dentro de CODECS de STREAM-INF en 1.359/1.359 canales (temp_analysis/…(17).m3u8:19) · 6/6 tóxicos en 3 listas idénticas · SUPPLEMENTAL-CODECS="lcev.1"/"lcev.1.1" en 192 líneas · 1.552 canales con nivel insuficiente en 4 archivos<br><sub>audit/alignment/2026-10-25/50-listas/LISTS_CODEC_COHERENCE.md §2.1-§2.4 · sha256:E7C6192D965D… · audit/alignment/2026-10-25/50-listas/LISTS_RFC8216_AUDIT.md B-01/B-02/B-03/B-04 · sha256:D1D7C41838DC…</sub> | **FAIL** | LAW:L1+L5(GOLDEN) · CHAIN_BREAK |

**Notas de fila:**

- **E3-P0** — 100/100 variantes P0 son IMPOSIBLES: L120/L123 (techo 1080p) declarando 3840x2160.
- **E3-P1** — Es la violación insignia: 4K declarado con nivel 1080p. Suma con P0 las 1.015 líneas imposibles que t8 midió (coincide exacto).
- **E3-P2** — UNKNOWN con motivo: el perfil P2 no se emite en el catálogo servido, así que no hay observación que comparar contra el contrato. No se puede declarar PASS ni FAIL de emisión.
- **E3-P3** — El 99,95 % de las líneas P3 son coherentes en nivel, pero NO coinciden con lo que el contrato de la APP dice que emite (8K/AVC) ni con el SSOT (4K/Main10). Ley de coherencia triple rota.
- **E3-P4** — El bucket de perfil deja de identificar la resolución calibrada; el nivel es coherente con lo declarado (1080p) pero el perfil miente sobre sí mismo.
- **E3-P5** — El failsafe SD4 declara 1080p HEVC en vez de 480p AVC: se pierde el propósito anti-freeze del perfil.
- **E3-FAM-A** — La familia servida cumple GOLDEN RULE y anti-tóxicos; falla nivel↔resolución.
- **E3-FAM-B** — La familia B es histórico versionado, no se sirve; sigue siendo material del que cualquiera puede partir.

## 2.4. E4 · listas → VPS-served

| # | Perfil | Familia | Esperado (cita SSOT) | Observado (archivo:línea / sha256) | Estado | Impacto |
|---|---|---|---|---|---|---|
| E4-P0 | P0 | A (directa/SHIELDED) | El artefacto servido debe ser byte-idéntico al .gz publicado (sin Lua en /lists/, gzip_static+gunzip)<br><sub>audit/alignment/2026-10-25/40-vps/_raw/nginx-T.conf :706-763 (location ~* \.m3u8$ con gzip_static always; gunzip on) · sha256:0941B0F25B9F… · audit/alignment/2026-10-25/50-listas/LISTS_INVENTORY.md §1.1 · sha256:CFB15981B20C…</sub> | 100 líneas P0 del catálogo llegan al player sin alteración: sha256 del cuerpo servido == sha256 del .gz en disco (verificado por t9 con curl al vhost + sha256sum en el VPS). Cero headers X-APE-* en la respuesta<br><sub>APE_LISTA_1792869328847.m3u8.gz · 297.134.088 B · sha256:7F1CD8A7…CCC360 · mtime 2026-10-25T17:56:21Z (re-hasheado por t9 a las 04:22Z: idéntico) · audit/alignment/2026-10-25/90-matriz/_raw/PHYS_rewrite_experiment.txt · sha256:FC2A5211592D… · audit/alignment/2026-10-25/50-listas/LISTS_INVENTORY.md §1.4 · sha256:CFB15981B20C…</sub> | **PASS** | NONE |
| E4-P1 | P1 | A (directa/SHIELDED) | idem (identidad de bytes)<br><sub>audit/alignment/2026-10-25/50-listas/LISTS_INVENTORY.md §1.4 · sha256:CFB15981B20C…</sub> | 909 líneas P1 servidas sin alteración; sha256 cuerpo servido == .gz<br><sub>APE_LISTA_1792869328847.m3u8.gz · 297.134.088 B · sha256:7F1CD8A7…CCC360 · mtime 2026-10-25T17:56:21Z (re-hasheado por t9 a las 04:22Z: idéntico) · audit/alignment/2026-10-25/90-matriz/_raw/PHYS_rewrite_experiment.txt · sha256:FC2A5211592D…</sub> | **PASS** | NONE |
| E4-P2 | P2 | A (directa/SHIELDED) | idem<br><sub>audit/alignment/2026-10-25/50-listas/LISTS_INVENTORY.md §1.4 · sha256:CFB15981B20C…</sub> | 0 líneas P2 en el artefacto servido: no hay nada que comparar<br><sub>APE_LISTA_1792869328847.m3u8.gz · 297.134.088 B · sha256:7F1CD8A7…CCC360 · mtime 2026-10-25T17:56:21Z (re-hasheado por t9 a las 04:22Z: idéntico) · audit/alignment/2026-10-25/90-matriz/_raw/PHYS_served_streaminf_by_profile.txt · sha256:FD2CD091C440…</sub> | **UNKNOWN** | CHAIN_BREAK? |
| E4-P3 | P3 | A (directa/SHIELDED) | idem<br><sub>audit/alignment/2026-10-25/50-listas/LISTS_INVENTORY.md §1.4 · sha256:CFB15981B20C…</sub> | 13.167 líneas P3 servidas sin alteración; identidad de bytes confirmada<br><sub>APE_LISTA_1792869328847.m3u8.gz · 297.134.088 B · sha256:7F1CD8A7…CCC360 · mtime 2026-10-25T17:56:21Z (re-hasheado por t9 a las 04:22Z: idéntico) · audit/alignment/2026-10-25/90-matriz/_raw/PHYS_rewrite_experiment.txt · sha256:FC2A5211592D…</sub> | **PASS** | NONE |
| E4-P4 | P4 | A (directa/SHIELDED) | idem<br><sub>audit/alignment/2026-10-25/50-listas/LISTS_INVENTORY.md §1.4 · sha256:CFB15981B20C…</sub> | 38 líneas P4 servidas sin alteración<br><sub>APE_LISTA_1792869328847.m3u8.gz · 297.134.088 B · sha256:7F1CD8A7…CCC360 · mtime 2026-10-25T17:56:21Z (re-hasheado por t9 a las 04:22Z: idéntico) · audit/alignment/2026-10-25/90-matriz/_raw/PHYS_served_streaminf_by_profile.txt · sha256:FD2CD091C440…</sub> | **PASS** | NONE |
| E4-P5 | P5 | A (directa/SHIELDED) | idem<br><sub>audit/alignment/2026-10-25/50-listas/LISTS_INVENTORY.md §1.4 · sha256:CFB15981B20C…</sub> | 129 líneas P5 servidas sin alteración<br><sub>APE_LISTA_1792869328847.m3u8.gz · 297.134.088 B · sha256:7F1CD8A7…CCC360 · mtime 2026-10-25T17:56:21Z (re-hasheado por t9 a las 04:22Z: idéntico) · audit/alignment/2026-10-25/90-matriz/_raw/PHYS_served_streaminf_by_profile.txt · sha256:FD2CD091C440…</sub> | **PASS** | NONE |
| E4-M1 | — | A plain + A SHIELDED (7 listas, 1,53 GiB) | Servir el .gz descomprimido, sin intervención Lua, extensiones de caché y sin servir backups<br><sub>audit/alignment/2026-10-25/40-vps/_raw/nginx-T.conf :706-763 y :788 (:ts\|m4s\|mp4 → 404) · sha256:0941B0F25B9F…</sub> | GET /lists/APE_LISTA_1792869328847.m3u8 → 200, Content-Type application/vnd.apple.mpegurl, Transfer-Encoding chunked, CERO X-APE-*; 7/7 gzip -t OK; los .bak no matchean la location<br><sub>audit/alignment/2026-10-25/50-listas/LISTS_INVENTORY.md §1.4/§1.5 · sha256:CFB15981B20C… · audit/alignment/2026-10-25/90-matriz/_raw/PHYS_rewrite_experiment.txt · sha256:FC2A5211592D…</sub> | **PASS** | NONE |
| E4-M2 | — | A CDN (`/cdn/`) — 2 listas, 21.040 canales | El rewrite puede rebasar URIs y añadir tags propios, pero NO puede alterar RESOLUTION sin alterar CODECS (Ley L1)<br><sub>Manifiesto OMEGA Ley 1 + D-15 · ape_uhd.lua:92-107 (declare_auto)</sub> | Diff físico de t9 sobre el fixture permanente /etc/nginx/ape-selftest/playlist_master4k.m3u8: ANTES (sha256:4A96480B…) RESOLUTION=3840x2160 + CODECS="hvc1.2.4.L153.B0,…" → DESPUÉS (sha256:87CAB2A2…) RESOLUTION=7680x4320 con el MISMO CODECS. Headers: X-APE-UHD: 8k:1 · X-APE-URI-Rebased: 2<br><sub>audit/alignment/2026-10-25/90-matriz/_raw/PHYS_rewrite_experiment.txt · sha256:FC2A5211592D… · audit/alignment/2026-10-25/50-listas/LISTS_DIFF_VPS_VS_DIRECT.md §3/§5.2 · sha256:C6F7BB1882F1…</sub> | **FAIL** | LAW:L1 · CHAIN_BREAK |
| E4-M3 | — | A meta (`/meta/`) | Ruta de rewrite metadata-only alcanzable para cualquier host:puerto que use el catálogo<br><sub>audit/alignment/2026-10-25/40-vps/_raw/nginx-T.conf :288 (regex ape_host=[A-Za-z0-9._-]+) y :819 · sha256:0941B0F25B9F…</sub> | https 443 /meta/… → 404 (no incluido en el vhost); :8088 /meta/127.0.0.1:8088/… → 404 porque la regex no admite ":" (los proveedores Xtream se direccionan host:puerto)<br><sub>audit/alignment/2026-10-25/50-listas/LISTS_DIFF_VPS_VS_DIRECT.md §5.4 · sha256:C6F7BB1882F1… · audit/alignment/2026-10-25/40-vps/VPS_NGINX_DUMP_ANALYSIS.md · sha256:9E19638A6A0D…</sub> | **UNKNOWN** | NONE |
| E4-M4 | — | A SHIELDED (sufijo de archivo) | SHIELDED = sólo sufijo _SHIELDED en el nombre; las URLs de canal NO se envuelven con /shield/<br><sub>Manifiesto OMEGA Ley 5 · CLAUDE.md «SHIELDED Architecture» · D-33</sub> | curl https://127.0.0.1/shield/… → 404 (medido por t9); en el catálogo servido: 0 ocurrencias de "/shield/" y 0 de "/cdn/" en 22.271.732 líneas; el payload de la variante _SHIELDED es byte-idéntico al plain<br><sub>audit/alignment/2026-10-25/90-matriz/_raw/PHYS_rewrite_experiment.txt · sha256:FC2A5211592D… · audit/alignment/2026-10-25/50-listas/LISTS_INVENTORY.md §1.2 (A5 ≡ A4) · sha256:CFB15981B20C… · audit/alignment/2026-10-25/50-listas/LISTS_DIFF_VPS_VS_DIRECT.md §1 · sha256:C6F7BB1882F1…</sub> | **PASS** | NONE |
| E4-M5 | — | B (repo → no servida) | Correspondencia lista del repo ↔ artefacto servido trazable por hash<br><sub>Manifiesto OMEGA flujo paso 4 (upload HTTP) · D-06</sub> | La subida es HTTP (upload_chunk.php + finalize_upload.php), no git: _vps_stage/**/*.m3u8* = 4 fixtures (203/349/377/378 B). No existe espejo de /var/www/lists ni versionado de las 7 listas servidas<br><sub>audit/alignment/2026-10-25/50-listas/LISTS_INVENTORY.md §2.1 · sha256:CFB15981B20C… · audit/alignment/2026-10-25/40-vps/VPS_DRIFT_VS_REPO.md §8 (4 UNKNOWN por diseño) · sha256:355624549740…</sub> | **UNKNOWN** | NONE |

**Notas de fila:**

- **E4-P0** — Identidad byte a byte. El defecto de P0 no lo introduce el VPS, viene de la lista (E3-P0).
- **E4-P1** — La violación L1 de P1 nace en la lista, no en la capa de servicio.
- **E4-P2** — UNKNOWN con motivo: ausencia de P2 en el catálogo impide verificar la preservación de ese perfil en esta arista.
- **E4-P3** — —
- **E4-P4** — —
- **E4-P5** — —
- **E4-M1** — El "rewrite del VPS" NO toca el catálogo (corrige la premisa del tablero).
- **E4-M2** — El rewrite CREA la violación: 8K declarado sobre un nivel que el propio fichero deja intacto. No hay freeze (CODECS no se toca), hay pérdida de calidad por rechazo de variante.
- **E4-M3** — UNKNOWN con motivo: superficie inexistente/inutilizable ⇒ no hay observación de rewrite que comparar contra la lista. No se declara PASS por ausencia.
- **E4-M4** — La Ley 5 se cumple en producción; la contradicción es del manifiesto, no del artefacto (DOC_DEBT).
- **E4-M5** — UNKNOWN por diseño (no por falta de trabajo): la trazabilidad se reconstruye por el #EXT-X-APE-AUDIT-SCORECARD embebido, no por hash de archivo.

## 2.5. E5 · VPS-served → contrato de player

| # | Perfil | Familia | Esperado (cita SSOT) | Observado (archivo:línea / sha256) | Estado | Impacto |
|---|---|---|---|---|---|---|
| E5-P0 | P0 | A | La variante que el decoder recibe para P0 debe ser decodable: nivel >= capacidad(res,fps)<br><sub>Manifiesto OMEGA Ley 1 (tabla L93..L186)</sub> | 100 STREAM-INF P0: 3840x2160@60 con hvc1.2.4.L120.B0 (MaxLumaPs L120 = 2.228.224 px < 8.294.400 px de 4K) y 3840x2160@30 con L123 (idem)<br><sub>audit/alignment/2026-10-25/90-matriz/_raw/PHYS_served_streaminf_by_profile.txt · sha256:FD2CD091C440… · audit/alignment/2026-10-25/50-listas/LISTS_CODEC_COHERENCE.md §1.1 · sha256:E7C6192D965D…</sub> | **FAIL** | LAW:L1 · CHAIN_BREAK |
| E5-P1 | P1 | A | idem<br><sub>Manifiesto OMEGA Ley 1</sub> | 909 STREAM-INF P1: 4K con L123 (737) / L120 (172) — nivel por debajo de la resolución<br><sub>audit/alignment/2026-10-25/90-matriz/_raw/PHYS_served_streaminf_by_profile.txt · sha256:FD2CD091C440… · muestra real: gz línea 35.279</sub> | **FAIL** | LAW:L1 · CHAIN_BREAK |
| E5-P2 | P2 | A | idem<br><sub>Manifiesto OMEGA Ley 1</sub> | sin variantes P2 en el catálogo<br><sub>audit/alignment/2026-10-25/90-matriz/_raw/PHYS_served_streaminf_by_profile.txt · sha256:FD2CD091C440…</sub> | **UNKNOWN** | CHAIN_BREAK? |
| E5-P3 | P3 | A | idem<br><sub>Manifiesto OMEGA Ley 1</sub> | 1080p@30 con L150 (L150 = 4K@30 ⇒ sobra capacidad) y 1080p@60 con L123 (L123 = 1080p@60 ⇒ exacto). 6 líneas 4K@60+L120 quedan fuera (contadas en E3-P3)<br><sub>audit/alignment/2026-10-25/90-matriz/_raw/PHYS_served_streaminf_by_profile.txt · sha256:FD2CD091C440…</sub> | **PASS** | NONE |
| E5-P4 | P4 | A | idem<br><sub>Manifiesto OMEGA Ley 1</sub> | 1080p@30+L150 y 1080p@60+L123: nivel coherente con lo declarado<br><sub>audit/alignment/2026-10-25/90-matriz/_raw/PHYS_served_streaminf_by_profile.txt · sha256:FD2CD091C440…</sub> | **PASS** | NONE |
| E5-P5 | P5 | A | idem<br><sub>Manifiesto OMEGA Ley 1</sub> | 1080p con L150/L123: nivel coherente<br><sub>audit/alignment/2026-10-25/90-matriz/_raw/PHYS_served_streaminf_by_profile.txt · sha256:FD2CD091C440…</sub> | **PASS** | NONE |
| E5-C1 | todos | A | Cada canal debe declarar su variante (CODECS/RESOLUTION) o el player no puede decidir decodificación<br><sub>RFC 8216 §4.3.4.2 (EXT-X-STREAM-INF) + skill ext-x-stream-inf-builder</sub> | 23.510 #EXTINF vs 14.343 #EXT-X-STREAM-INF ⇒ 9.167 canales (39,0 %) se sirven SIN declaración de códec/resolución<br><sub>audit/alignment/2026-10-25/90-matriz/_raw/PHYS_served_streaminf_by_profile.txt · sha256:FD2CD091C440… · audit/alignment/2026-10-25/50-listas/LISTS_RFC8216_AUDIT.md A-06 · sha256:D1D7C41838DC…</sub> | **FAIL** | LAW:L3 |
| E5-C2 | todos | A | #EXT-X-I-FRAME-STREAM-INF requiere el atributo URI (obligatorio)<br><sub>RFC 8216 §4.3.4.3</sub> | 23.510 líneas #EXT-X-I-FRAME-STREAM-INF y 0 con URI= (medido por t9 sobre el .gz)<br><sub>audit/alignment/2026-10-25/90-matriz/_raw/PHYS_served_streaminf_by_profile.txt · sha256:FD2CD091C440… · audit/alignment/2026-10-25/50-listas/LISTS_RFC8216_AUDIT.md A-01 · sha256:D1D7C41838DC…</sub> | **FAIL** | LAW:L3 |
| E5-C3 | todos | A | Si se declara CAN-BLOCK-RELOAD=YES debe existir la implementación de _HLS_msn/_HLS_part<br><sub>draft-pantos-hls-rfc8216bis (EXT-X-SERVER-CONTROL) · skill can-block-reload-handler</sub> | La cabecera del catálogo declara #EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.0,CAN-SKIP-UNTIL=12.0 (línea 6); grep -rn "_HLS_msn\|_HLS_part" /etc/nginx/ = 0 coincidencias<br><sub>audit/alignment/2026-10-25/90-matriz/_raw/PHYS_rewrite_experiment.txt (head del .gz: línea 6) · sha256:FC2A5211592D… · audit/alignment/2026-10-25/50-listas/LISTS_DIFF_VPS_VS_DIRECT.md §5.3 · sha256:C6F7BB1882F1… · audit/alignment/2026-10-25/50-listas/LISTS_RFC8216_AUDIT.md A-03 · sha256:D1D7C41838DC…</sub> | **FAIL** | LAW:L3 |
| E5-C4 | todos | A | GOLDEN RULE: hvc1.* sólo en STREAM-INF CODECS; hev1.* sólo en KODIPROP/EXTVLCOPT/tags de player<br><sub>CLAUDE.md «Truth-guard HEVC-first» · skill iptv-hevc-cascade-injector</sub> | hvc1.2.4.* en 14.343/14.343 STREAM-INF · hev1 en 0 STREAM-INF · hev1.2.4.L150.B0 en 23.510 tags #EXT-X-APE-CHANNEL-RUNTIME-CODEC-HEV1 (sitio correcto)<br><sub>audit/alignment/2026-10-25/50-listas/LISTS_CODEC_COHERENCE.md §1.5 · sha256:E7C6192D965D…</sub> | **PASS** | NONE |
| E5-C5 | todos | A | El códec de audio debe viajar dentro de CODECS (riesgo #1 del skill Crystal: perder audio al reescribir CODECS)<br><sub>skill ape-crystal-edge §4 «preservar el audio»</sub> | 14.343/14.343 STREAM-INF incluyen mp4a.40.2 dentro de CODECS; 0 STREAM-INF sin audio<br><sub>audit/alignment/2026-10-25/50-listas/LISTS_CODEC_COHERENCE.md §1.2 · sha256:E7C6192D965D… · audit/alignment/2026-10-25/90-matriz/_raw/PHYS_rewrite_experiment.txt (diff físico: audio intacto en /cdn/) · sha256:FC2A5211592D…</sub> | **PASS** | NONE |
| E5-C6 | todos | A | La lista no debe autodeclarar una validación que no cumple<br><sub>Doctrina: «No declarar éxito sin pruebas» (AGENTS.md)</sub> | El catálogo embebe su propio scorecard de validación en PASS mientras 1.015 líneas STREAM-INF violan la Ley 1 y el validador propio del resolver marcaría el huérfano<br><sub>audit/alignment/2026-10-25/50-listas/LISTS_RFC8216_AUDIT.md A-04 · sha256:D1D7C41838DC…</sub> | **FAIL** | LAW:L3 |
| E5-CDN | todos | A CDN (21.040 canales) | La variante top servida por /cdn/ debe declarar una resolución que su nivel soporte<br><sub>Manifiesto OMEGA Ley 1</sub> | Tras el rewrite, un master 4K@60 con L153 sale declarando 7680x4320 (8K) con el mismo CODECS ⇒ nivel por debajo de la resolución en CADA master 4K servido por /cdn/<br><sub>audit/alignment/2026-10-25/90-matriz/_raw/PHYS_rewrite_experiment.txt · sha256:FC2A5211592D… · audit/alignment/2026-10-25/50-listas/LISTS_DIFF_VPS_VS_DIRECT.md §5.2 · sha256:C6F7BB1882F1…</sub> | **FAIL** | LAW:L1 · CHAIN_BREAK |
| E5-FAM-B | todos | B (repo) | idem que A<br><sub>Manifiesto OMEGA Ley 1 + GOLDEN RULE</sub> | hev1.1.6.L153.B0 en STREAM-INF (1.359 canales) + SUPPLEMENTAL-CODECS="lcev.1" inventado + atributos enumerados entrecomillados + EXTM3U fuera de la línea 1 + 6/6 headers tóxicos en 3 listas<br><sub>audit/alignment/2026-10-25/50-listas/LISTS_CODEC_COHERENCE.md §2.1-§2.3 · sha256:E7C6192D965D… · audit/alignment/2026-10-25/50-listas/LISTS_RFC8216_AUDIT.md B-01..B-04 · sha256:D1D7C41838DC… · audit/alignment/2026-10-25/50-listas/LISTS_HEADERS_TRAPS.md §3/§4 · sha256:79FF7174CAE6…</sub> | **FAIL** | LAW:L1+L5(GOLDEN) · CHAIN_BREAK |

**Notas de fila:**

- **E5-P0** — Un decoder que valide perfil/nivel (ExoPlayer MediaCodec, algunas Smart TV) descarta la variante ⇒ el ABR cae a 1080p.
- **E5-P1** — Mismo efecto que P0, sobre el 6,3 % de las variantes.
- **E5-P2** — UNKNOWN con motivo: no hay contrato observable para P2.
- **E5-P3** — Nivel coherente con lo declarado para el 99,95 % de las líneas P3. PASS de esta arista; la incoherencia con el SSOT se registra en E3-P3.
- **E5-P4** — PASS en nivel↔resolución; el desajuste perfil↔resolución se registra en E3-P4.
- **E5-P5** — idem: PASS de nivel, desajuste de perfil en E3-P5.
- **E5-C1** — El player recibe URL desnuda: no hay contrato de calidad que honrar.
- **E5-C2** — Desviación sistémica del generador, no de una lista. TiviMate/hls.js lo ignoran; los validadores estrictos lo marcan.
- **E5-C3** — Declara una capacidad que el servidor no tiene: el player puede quedarse recargando el manifest.
- **E5-C4** — La cascada dual está bien construida: uno de los pocos bordes sin defecto en producción.
- **E5-C5** — —
- **E5-C6** — Falso PASS embebido: envenena cualquier auditoría que confíe en la lista.
- **E5-CDN** — Afecta al 100 % de los canales de las 2 listas CDN (las más nuevas).
- **E5-FAM-B** — Familia no servida hoy; material histórico que reproduce todos los errores de clase.

## 2.6. E6 · doctrina → realidad (deuda documental)

| # | Perfil | Familia | Esperado (cita SSOT) | Observado (archivo:línea / sha256) | Estado | Impacto |
|---|---|---|---|---|---|---|
| E6-01 | — | — | Manifiesto OMEGA/ape-crystal-edge: pipeline nginx de 5 fases Lua en /etc/nginx/snippets/shield-location.conf<br><sub>docs/manifestos/OMEGA_WORKING_FLOW_MANIFESTO_SNAPSHOT.md (sha256:2D24FC33…) · skill ape-crystal-edge §2</sub> | shield-location.conf NO EXISTE; 13/13 artefactos del pipeline Crystal ausentes; pipeline real = 3 fases (header_filter→body_filter→log); /shield/ → 404 (medido por t9)<br><sub>audit/alignment/2026-10-25/40-vps/VPS_DRIFT_VS_REPO.md §4 · sha256:355624549740… · audit/alignment/2026-10-25/90-matriz/_raw/PHYS_rewrite_experiment.txt · sha256:FC2A5211592D… · audit/alignment/2026-10-25/40-vps/DOCTRINE_CORRECTION.md · sha256:6E792CB439DA…</sub> | **FAIL** | DOC_DEBT |
| E6-02 | — | — | APE Crystal Engine v2.0 en Rust+LuaJIT escuchando en :8084 con /health y /metrics<br><sub>Manifiesto OMEGA bloque CRYSTAL-ENGINE-V2 §Motor</sub> | ape-crystal-rust.service = "Unit … could not be found" (is-enabled not-found); ss :8084 = nada; /health y /metrics = 000<br><sub>audit/alignment/2026-10-25/40-vps/VPS_DRIFT_VS_REPO.md §5 · sha256:355624549740…</sub> | **FAIL** | DOC_DEBT |
| E6-03 | — | — | OpenResty (nombrado en manifiesto, SOP y diagramas)<br><sub>Manifiesto OMEGA/diagrama D2 «OpenResty / Nginx»</sub> | nginx 1.24.0 stock + ngx_http_lua_module; sin OpenResty<br><sub>audit/alignment/2026-10-25/40-vps/VPS_INVENTORY.md §2 · sha256:1207C3412FEC… · audit/alignment/2026-10-25/40-vps/DOCTRINE_CORRECTION.md · sha256:6E792CB439DA…</sub> | **FAIL** | DOC_DEBT |
| E6-04 | — | — | Telemetría Conviva alimentando la recalibración del LAB (paso 8 del flujo)<br><sub>Manifiesto OMEGA flujo paso 8 · CLAUDE.md «QoE Server-Side Observer»</sub> | conviva.db = 0 B / 0 tablas; 7 timers netshield-* inactivos; el catálogo referencia un endpoint conviva-event.php que no tiene almacén<br><sub>audit/alignment/2026-10-25/40-vps/VPS_DRIFT_VS_REPO.md §6/§7 · sha256:355624549740… · D-27</sub> | **FAIL** | DOC_DEBT |
| E6-05 | — | — | Producción == repo (lo que corre es lo commiteado)<br><sub>D-04 gate 3 · doctrina de rollback</sub> | HEAD ↔ VPS: 16/16 artefactos byte a byte idénticos (14 módulos Lua + meta-plane.conf + ape-hosts-allow.txt). Única excepción: ape-meta-public.conf con el VPS por delante (v2 2.509 B vs HEAD v1 2.091 B)<br><sub>audit/alignment/2026-10-25/40-vps/VPS_DRIFT_VS_REPO.md §1/§3.1 (DR-02/DR-03) · sha256:355624549740…</sub> | **PASS** | NONE |
| E6-06 | P1 | — | La tabla P0–P5 del manifiesto dice P1 = 8K (AV1) av01.0.15M.10 @7680x4320@120<br><sub>Manifiesto OMEGA §Codec ladder (tabla P0–P5)</sub> | El Excel canónico dice P1 = 3840x2160 + hvc1.2.4.L153.B0 (C25/C37) y su export fiel lo repite; la hoja se contradice a sí misma en C350 ("av01.0.15M.10,ac-3")<br><sub>audit/alignment/2026-10-25/10-excel/EXCEL_PROFILES_EXTRACT.json C25/C37/C350 · sha256:D977BC999CB4… · audit/alignment/2026-10-25/90-matriz/_raw/which_json_is_export.json (export 24/24 fiel) · sha256:7639DCD04657… · D-22/D-34</sub> | **FAIL** | LAW:L1+L3 (plano documental) · DOC_DEBT |

**Notas de fila:**

- **E6-01** — Deuda DOCUMENTAL, no defecto de producto: la corrección es el documento (D-25/D-32). Desplegar el pipeline para «alinear» violaría iptv-vps-touch-nothing.
- **E6-02** — Corrección documental (D-25).
- **E6-03** — No cambia el comportamiento observable; sí cambia qué es implementable (p. ej. coexión de fases).
- **E6-04** — Prohibido afirmar QoE activa (D-27). El bucle de realimentación no existe.
- **E6-05** — El «drift» aparente del working tree es WIP ajeno no desplegado (D-11: se compara contra bytes de HEAD, no contra el disco).
- **E6-06** — La doctrina y el SSOT discrepan sobre QUÉ es P1. Se resuelve por precedencia D-02 (Excel) y se corrige el documento (D-22/D-34/D-31).

## 3. Las 5 leyes cardinales, una por una

### L1 · LEY DE NIVEL↔RESOLUCIÓN — **FAIL**

> El level del codec DEBE poder cargar la RESOLUTION+fps declarados (L153=4K@60 techo; L186=8K@120).

- Excel: 6/6 perfiles declaran fps=120 con niveles que no lo soportan (P1 L153 4K@60, P2 L150 4K@30, P3 L123 1080p@60, P4 L93 720p@30, P5 AVC L3.0) → audit/alignment/2026-10-25/10-excel/EXCEL_PROFILES_EXTRACT.json (fila 32 vs fila 37) · sha256:D977BC999CB4…
- JSON: lab_master copia el defecto y añade 4K sobre P3/P4/P5 → audit/alignment/2026-10-25/90-matriz/_raw/canon_vs_json.json · sha256:F8B82BEF70B1… · audit/alignment/2026-10-25/20-json/JSON_PROFILES_MATRIX.json ley L1/L11 · sha256:FDD50FE6E15C…
- APP: resolve_quality_unified.php:5519-5520 declara L153 con FRAME-RATE=120 · audit/alignment/2026-10-25/30-app/APP_EMISSION_CONTRACT.md §7 · sha256:9DEF4C88DC69…
- listas servidas: 1.015/14.343 STREAM-INF con nivel < resolución (0_P0/0_P1/… medido por t9) → audit/alignment/2026-10-25/90-matriz/_raw/PHYS_served_streaminf_by_profile.txt · sha256:FD2CD091C440…
- VPS /cdn/: el rewrite crea la violación (4K→8K con CODECS intacto) → audit/alignment/2026-10-25/90-matriz/_raw/PHYS_rewrite_experiment.txt · sha256:FC2A5211592D…

**Impacto:** Rompe la cadena en los 5 eslabones. Es exactamente el patrón del freeze 2026-06-08.

### L2 · LEY SSOT-LAB (no-clamp / no-override) — **FAIL**

> El LAB está calibrado: no se sobrescribe su codec/resolución/bitrate sin verificar coherencia.

- Fake-8K por defecto: fakeMode="8k" cuando window.APE_FAKE_UHD no está definido → m3u8-typed-arrays-ultimate.js:10363-10364, :2500 · audit/alignment/2026-10-25/30-app/APP_HARDCODE_FINDINGS.md F-APP-04 · sha256:B902FA455BF5…
- El códec emitido sale de la cascada CSV (codec_chain_video[0] = L153 para los 6 perfiles), NO de settings.codec_full → audit/alignment/2026-10-25/30-app/APP_EMISSION_CONTRACT.md §8 (V1 vs V2) · sha256:9DEF4C88DC69…
- BANDWIDTH: max(bitrate×1e6, floor) vs settings.bandwidth_max (P0: 200 M emitido vs 80 M declarado) → audit/alignment/2026-10-25/30-app/APP_EMISSION_CONTRACT.md §6 · sha256:9DEF4C88DC69…
- AVERAGE-BANDWIDTH usa 0.85 literal vs avg_bandwidth_ratio 0.78 → idem

**Impacto:** El SSOT deja de mandar: 4 de los 5 atributos de variante los decide el código, no el LAB. D-13 ordena default "0"; el código sigue en "8k".

### L3 · LEY DE COHERENCIA TRIPLE (Excel ↔ JSON ↔ lista) — **FAIL**

> Excel, JSON y lista emitida deben quedar coherentes en todo cambio.

- P1: Excel 3840x2160 → JSON 7680x4320 → lista 3840x2160 y L123/L120 → audit/alignment/2026-10-25/90-matriz/_raw/canon_vs_json.json · sha256:F8B82BEF70B1… + audit/alignment/2026-10-25/90-matriz/_raw/PHYS_served_streaminf_by_profile.txt · sha256:FD2CD091C440…
- P3: Excel 1080p/Main10 L123 → JSON 4K/Main 8-bit L120 → lista 1080p/L150+L123 → idem
- P4: Excel 720p/Main10 L93 → JSON 4K/AVC → lista 1080p/L150+L123 → idem
- P5: Excel 480p/AVC → JSON 4K/AVC → lista 1080p/L150+L123 → idem
- Ningún perfil tiene las tres capas de acuerdo simultáneamente (P0 coincide en Excel/JSON pero la lista no emite P0 8K; P2 no se emite)

**Impacto:** Es la ley que convierte un defecto local en un freeze. Hoy no hay un solo perfil con la cadena completa coherente.

### L4 · LEY NO-STRIP (las ~945 directivas trabajan) — **PASS**

> Cada EXTVLCOPT/KODIPROP/EXTHTTP/SESSION-DATA tiene consumidor; nunca adelgazar la lista.

- Catálogo servido: 22.271.732 líneas / 23.510 canales = 947,3 líneas por canal; 23.510 #EXTHTTP (100 % de canales) → audit/alignment/2026-10-25/50-listas/LISTS_INVENTORY.md §1.3 · sha256:CFB15981B20C… · conteo propio t9: 23.510 #EXTINF / 23.510 #EXT-X-I-FRAME-STREAM-INF / 1 #EXTM3U
- 24 #EXT-X-SESSION-DATA globales presentes (cabecera del .gz, líneas 8-16) → audit/alignment/2026-10-25/90-matriz/_raw/PHYS_rewrite_experiment.txt · sha256:FC2A5211592D…
- El rewrite de /cdn/ NO elimina directivas: sólo rebasa URIs, descarta líneas en blanco y añade tags → audit/alignment/2026-10-25/50-listas/LISTS_DIFF_VPS_VS_DIRECT.md §4 · sha256:C6F7BB1882F1…
- Desviación de metadato (no de contenido): settings.headersCount=233 declarado vs 400-402 claves medidas → audit/alignment/2026-10-25/20-json/JSON_PROFILES_MATRIX.json ley L8 · sha256:FDD50FE6E15C…

**Impacto:** La ley se cumple en el artefacto. El claim de headersCount es una mentira de metadato, no un strip.

### L5 · LEY SHIELDED (URLs verbatim) — **PASS**

> SHIELDED = sólo sufijo de archivo; las URLs de canal son directas al proveedor, verbatim.

- Catálogo servido: 0 ocurrencias de "/shield/" y 0 de "/cdn/" en 22.271.732 líneas → conteo t9 sobre el .gz
- curl https://127.0.0.1/shield/… → 404 → audit/alignment/2026-10-25/90-matriz/_raw/PHYS_rewrite_experiment.txt · sha256:FC2A5211592D…
- La variante _SHIELDED tiene payload byte-idéntico a la plain (A5 ≡ A4) → audit/alignment/2026-10-25/50-listas/LISTS_INVENTORY.md §1.2 · sha256:CFB15981B20C…
- Las 5 listas directas sirven 95.776 URLs verbatim a line.tivi-ott.net → audit/alignment/2026-10-25/50-listas/LISTS_DIFF_VPS_VS_DIRECT.md §2 · sha256:C6F7BB1882F1…

**Impacto:** Cumple. La contradicción está en el manifiesto (documenta /shield/ como URL canónica) → DOC_DEBT, no defecto de artefacto (D-33).

## 4. Verificación física ejecutada por este verificador (read-only)

| # | Comprobación | Comando | Resultado | Evidencia |
|---|---|---|---|---|
| 1 | Hash del .xlsm canónico | `Get-FileHash -Algorithm SHA256` | 3.582.019 B · `663EF44E2D69521EB0E77DDA7B64A32EA4F942992F8F2C80614EAEE8EC52806A` · mtime 2026-06-11T01:54:49-05:00 · **coincide con D-20** | audit/alignment/2026-10-25/90-matriz/_raw/PHYS_syntax_and_hashes.txt · sha256:FD6FEA79D43F… |
| 2 | Hash del JSON baseline + identidad del export | `extract_canon.mjs` + `which_json_is_the_export.mjs` | B1 `FFD3E0E0…` 408.126 B · B2 `29C54805…` 408.174 B · B0 `D2582BE7…` 847.417 B · export 20260611 `6931BAF4…` **0 diffs/24** | audit/alignment/2026-10-25/90-matriz/_raw/which_json_is_export.json · sha256:7639DCD04657… |
| 3 | `node -c` del generador | `node --check` × 4 | 4/4 **EXIT 0**, stderr vacío (node v24.12.0) | audit/alignment/2026-10-25/90-matriz/_raw/PHYS_syntax_and_hashes.txt · sha256:FD6FEA79D43F… |
| 4 | `php -l` con el PHP portable del capitán (D-17) | `php-8.3/php.exe -l` × 6 | **6/6 "No syntax errors detected", EXIT 0** (PHP 8.3.36) | audit/alignment/2026-10-25/90-matriz/_raw/PHYS_syntax_and_hashes.txt · sha256:FD6FEA79D43F… · audit/alignment/2026-10-25/30-app/PHP_LINT_GATE.md · sha256:2F14C1BEBBCD… |
| 5 | Hash de una lista servida | `sha256sum` + `stat` + `gzip -t` en el VPS | `7F1CD8A7…CCC360` · 297.134.088 B · mtime 2026-10-25T17:56:21Z · **coincide con t8** | audit/alignment/2026-10-25/90-matriz/_raw/PHYS_rewrite_experiment.txt · sha256:FC2A5211592D… |
| 6 | Diff de un manifest reescrito vs su lista directa | `curl` :8088 (antes) vs `curl` /cdn/443 (después) + `diff` | ANTES `4A96480B…` == sha del fichero en disco · DESPUÉS `87CAB2A2…` · 4 líneas cambiadas (RESOLUTION 3840x2160→7680x4320, 2 URIs absolutizadas, +1 tag) | audit/alignment/2026-10-25/90-matriz/_raw/PHYS_rewrite_experiment.txt · sha256:FC2A5211592D… |
| 7 | Gateway de contratos (D-11) | `node contracts/verify_contracts.mjs` | RESULT=FAIL (1/12): sólo `_vps_stage/tests/fanout_concurrency.sh`; pin `9b774bff…` == **bytes de HEAD** (98.126 B) ≠ disco (99.666 B, WIP ajeno) ⇒ **CONTRACT_DRIFT**, no FAIL de alineación | audit/alignment/2026-10-25/90-matriz/_raw/PHYS_contracts_gate.txt · sha256:9E5EDD7D91C2… · contracts/crystal_contracts.json · sha256:F6EDFE85C961… |
| 8 | Censo del catálogo servido por perfil | `zcat | grep | sed | sort | uniq -c` | 14.343 STREAM-INF agrupados: P0 100 · P1 909 · **P2 0** · P3 13.167 · P4 38 · P5 129 | audit/alignment/2026-10-25/90-matriz/_raw/PHYS_served_streaminf_by_profile.txt · sha256:FD2CD091C440… |
| 9 | Leyes 4/5 sobre el artefacto real | `zcat | grep -c` | `#EXTINF`=23.510 · `#EXT-X-STREAM-INF`=14.343 · `I-FRAME`=23.510 (0 con URI) · `/shield/`=**0** · `/cdn/`=0 · `#EXTM3U`=1 | audit/alignment/2026-10-25/90-matriz/_raw/PHYS_served_streaminf_by_profile.txt · sha256:FD2CD091C440… |

## 5. Qué NO prueba esta matriz

- **No** prueba comportamiento de player real: no hay ejecución de ExoPlayer/hls.js/TiviMate. El estado
  "FAIL" por nivel↔resolución es una **inferencia de especificación** (MaxLumaPs de HEVC Annex A), no una medición
  de rechazo en dispositivo. Se declara así para no inflar el resultado.
- **No** cubre el perfil P2 de las aristas E3/E4/E5: no existe en el catálogo servido (UNKNOWN declarado).
- **No** cubre la familia CDN (`/cdn/`) por perfil: sólo se midió el mecanismo de rewrite sobre un fixture maestro.
- **No** afirma nada sobre los 32 UNKNOWN de `40-vps/VPS_DRIFT_VS_REPO.md` (sin hash no hay veredicto).
- **No** re-audita secretos ni credenciales: eso vive en `20-json/SECRETS_SCAN.md` y `80-seguridad/`.


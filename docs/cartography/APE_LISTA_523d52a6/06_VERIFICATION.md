# 06 — Verificación adversarial de la cartografía `APE_LISTA_523d52a6`

**Fase 6 (verificación).** Miembro independiente (`verificador`), contratado para **tumbar** el trabajo,
no para validarlo. Este documento no arregla nada: mide, compara, y dicta veredicto por entregable con
la evidencia faltante exacta.

- **Sujeto (solo lectura, intacto):** `APE_LISTA_1793589060441.m3u8` — **604.593.696 bytes**,
  `sha256 523d52a6d147f81ce5a212e47b9c55401fb409cd4a41aee96f8ba80b5b5049d6`,
  `lastwrite 2026-11-02T12:29:32.7380364Z` (sin cambio antes/después de esta verificación).
  Comandos: `Get-Item -LiteralPath <lista> | % Length` · `(Get-FileHash -LiteralPath <lista> -Algorithm SHA256).Hash`.
- **Máquina de medida:** ripgrep `15.2.0` · Node `v24.12.0` · ffmpeg `8.0.1-full_build-www.gyan.dev` ·
  VLC `3.0.24` (`(Get-Item 'C:\Program Files\VideoLAN\VLC\vlc.exe').VersionInfo.FileVersion`).
- **Herramientas propias (no las de los autores):** `rg` para censos por línea, `node` con
  `readline` para censos por bloque/clave, `rg -n` + deltas para el histograma de bloques,
  `Get-FileHash` para identidad. Los scripts están en `scratch/avisynth_probe_2026/verif/tools/`.
- **Salidas crudas:** `scratch/avisynth_probe_2026/verif/` (ver §9).

> **Resumen de la cacería:** intenté tumbar las cifras y **no se cayeron**. Re-medí 26 cifras críticas
> con métodos distintos y **24 coincidieron exactamente**. Encontré **1 error factual**, **1 absoluto con
> denominador incompleto**, **1 universal refutado**, **1 porcentaje con denominador equivocado** y
> **4 imprecisiones de etiqueta**. Ningún número inventado, ninguna credencial expuesta, ninguna
> herramienta que crashee. Ningún entregable llega a RECHAZADO; **ninguno llega a APROBADO limpio**.

---

## 0. Veredicto por entregable

| Entregable | Veredicto | Razón en una línea | Evidencia |
|---|---|---|---|
| `01_STRUCTURE.md` + `01_structure.json` | **APROBADO CON RESERVAS** | Sus cifras estructurales reproducen exactas; **una celda es falsa** (`STABLE-VARIANT-ID` "25 valores distintos" → medido **10.528**) | §2 D1, §3 |
| `02_VIDEO_FILTER_MATRIX.md` + `.json` | **APROBADO CON RESERVAS** | 3 firmas / longitudes / conteos y el FAIL de ffmpeg reproducen al carácter; sus **cifras de coste (46,9× real, 0,084 fps)** no las re-ejecuté → INDECIDIBLE | §2, §6 |
| `03_HEADERS_MAP.md` + `03_headers_map.json` | **APROBADO CON RESERVAS** | Censo de `#EXTHTTP`/overflow reproduce **exacto**; pero **§2.2 "nunca en ninguno" es falso** (51 campos) y **§3.4 "0 violaciones"** escanea 4 sumideros y omite uno con 10.573 líneas `hev1.*` | §2 D4/D5, §3 |
| `04_LANE_CAPABILITY_MATRIX.md` + `.json` | **APROBADO CON RESERVAS** | Su claim central tiene log literal reproducible; la matriz **no** declara `verificado` en ninguna celda (correcto); las filas de los 6 runtimes no ejecutables quedan `s` = INDECIDIBLE por construcción, declarado | §2, §6 |
| Skill `.agents/skills/ape-lista-cartographer/` | **APROBADO CON RESERVAS** | **Reutilizable de verdad**: corrida propia sobre 604 MB, lista sintética, 3 casos borde y `--expect-channels` sin crash; reproducible bit a bit; 0 fugas. Reservas: absoluto GOLDEN RULE mal etiquetado, deriva muestra↔censo en su informe publicado, y `chain_sha256` enmascarado | §4, §5, §7 |
| `05_CAP_CANDIDATES.md`, `06_EMISSION_TEMPLATE.md` | **FUERA DE ALCANCE** | No son dependencias de esta tarea (t10/t11). Solo crucé dos cifras suyas en el camino: `chooser_bandwidth_max` 9.765/808 y el cruce `video-fps=30 ↔ FRAME-RATE=60` = **1.185**, ambos **confirmados** | §3 #16, #18 |

**Ningún APROBADO sin comando:** cada cifra de las tablas siguientes lleva su comando en la misma fila.

---

## 1. Re-ejecución del mapper de la skill (mismo input, mi mano)

```powershell
node .agents/skills/ape-lista-cartographer/scripts/map_list.js <lista> --out scratch/avisynth_probe_2026/verif/rerun_main
# [map_list] canales 10.573 · líneas 10.315.662 · tags 819 · censo
# [map_list] filtros: 3 firmas · sintaxis FAIL
# [map_list] EXTHTTP: 10.573 analizados de 10.573 · 0 inválidos · tóxicos 0
# [map_list] control de fugas → host:0 credencial:0 sha_preservado:true json_ok:true
# [map_list] elapsed 29.1 s ·  EXIT=0
```

**Diff estructural contra el informe publicado** (`reports/map_523d52a6.json`, hecho con `--sample 250`):
85 hojas distintas, **todas** explicadas por la diferencia `muestra` vs `censo` (`scratch/.../tools/deepdiff_maps.js`).
Diff de hojas no muestrales: **17** (`scope.*`, `tool.elapsed_ms`, `coherence.contradictions[4].*`,
`runtime_matrix.cells[*].source`, `verdict.claims[4].evidence`, `not_computed` 8→7 entradas).
**Cero contradicciones de cifra estructural.** El informe publicado y mi corrida censal dan **el mismo**
sha256, bytes, líneas, canales, histograma de bloques, vocabulario de tags y coherencia C1–C13.

**Consecuencia útil:** la corrida censal tarda **29,1 s** y analiza los **10.573** objetos `#EXTHTTP`
(no 250). El propio `audit-report.md` de la skill ya lista esto como mejora pendiente; queda **confirmado
que es viable** y que sus cifras maestras no cambian (solo se afinan: `distinct_fields` 249→**250**,
overflow mínimo 27→**26**, mediana de bytes 8.106→**7.849**).

---

## 2. Tabla de discrepancias (cifra del informe vs cifra medida)

Cada fila es reproducible con su comando. **D4, D5 y D6 son las materiales.**

| # | Dónde | Dice el informe | Medido aquí | Comando | Severidad |
|---|---|---|---|---|---|
| **D1** | `01_STRUCTURE.md` §7.1 (tabla `#EXT-X-STREAM-INF`) | `STABLE-VARIANT-ID`: **25** valores distintos | **10.528** valores distintos (uno por canal) | `rg -o --no-filename 'STABLE-VARIANT-ID=[^,]+' <lista> \| Sort-Object -Unique` → `Count = 10528` | **MEDIA** (error factual) |
| **D2** | skill `reports/map_523d52a6.md` §6 (fila "Overflow") | `27`–65 campos | **26**–65 (censo). `03_HEADERS_MAP.md` §2.3 ya dice **26** | `node scratch/.../tools/overflow_totals.js <lista>` → `min=26 … max=65` | BAJA (alcance muestral declarado en la fila vecina) |
| **D3** | skill `reports/map_523d52a6.md` §6 | Nombres de campo distintos: **249** | **250** (censo). `01`/`03` dicen 250 | `node -e "…map_523d52a6.json (censo) → exthttp.distinct_fields"` | BAJA (idem) |
| **D4** | `03_HEADERS_MAP.md` §3.4 + skill `reports/map_523d52a6.md` §9 | **"GOLDEN RULE hvc1/hev1: 0 violaciones"** sobre 4 sumideros (`STREAM-INF`, `KODIPROP`, `EXTVLCOPT`, `APE-CODEC-REAL/PREFERRED`) | Fuera de esos 4 sumideros hay **10.573 líneas** con `hev1.2.4.L150.B0` en `#EXT-X-APE-CHANNEL-RUNTIME-CODEC-HEV1` (ni `KODIPROP` ni `EXTVLCOPT`) + **808** dentro de `#EXTHTTP`; y `hvc1.*` aparece en **17 familias** de tag, no solo en `STREAM-INF` | `node scratch/.../tools/tagscan2.js <lista>` (censo por tag) | **ALTA** (absoluto con denominador incompleto) |
| **D5** | `03_HEADERS_MAP.md` §2.2 | "Cada campo aparece **o** en el principal **o** en el overflow, **nunca en ambos y nunca en ninguno**" | **51 de 276** nombres tienen `principal+overflow < 10.573`. Ej.: `X-APE-Channel-Id` = **1.470** principal / **0** overflow; `X-APE-Codec-Video` idem. Los otros **225** sí suman 10.573 exacto | `node scratch/.../tools/layer_split.js <lista>` → `campos_union=276 · suma_exacta=225 · suma_distinta=51` | **ALTA** (universal refutado) |
| **D6** | skill `reports/map_523d52a6.json` `coherence.contradictions[4]` (C5) | "EXTHTTP X-APE-Codec-Video con nivel HEVC < STREAM-INF = **1.470 · 13,9 %** · denominador 10.573" | El campo **solo existe en 1.470 canales** (todos P3): el 13,9 % compara contra 9.103 canales donde la comparación **no está definida**. Sobre los que lo declaran: **1.470/1.470 = 100 %** (valores `hvc1.2.4.L150.B0`×1.296 y `L123.B0`×174, ambos < `L153`) | `node scratch/.../tools/codecvideo.js <lista>` | **MEDIA-ALTA** (etiqueta leída como población) |
| **D7** | skill `reports/map_523d52a6.json` `runtime_matrix.cells[*].source` | `heredado:04 §4 (medido con VLC 3.0.24)` | Mi corrida imprime `heredado:04 §4 (medido con VLC ?)`: el mapper **no detecta** la versión; la recibió por `--vlc-version`. La versión **sí** está verificada por metadatos del binario (`FileVersion 3.0.24`), pero el artefacto mezcla declarado con medido | `node … --out …` (comparar con `Get-Item vlc.exe` → `VersionInfo.FileVersion`) | BAJA (procedencia) |
| **D8** | `scripts/validate_filter_chain.js` (salida JSON) | `SKILL.md` §8.3: "el sha256 sí debe estar presente (si el scrub lo borró, el informe perdió su identidad)" | El validador emite `"chain_sha256": "<REDACTED>"` en **todas** las filas → la cadena no se puede citar por hash desde su propia evidencia | `node …/validate_filter_chain.js --chain-file .agents/…/chains/P1_literal.txt --per-stage --json` | MEDIA (contradice su propia regla) |
| **D9** | `02_VIDEO_FILTER_MATRIX.md` §4 | "no hay módulo `avfilter` entre sus **363** plugins" | **363** = todos los archivos de `plugins\`; **360** son `.dll` y **0** coinciden con `avfilter`. La conclusión (0 `avfilter`) es correcta | `(Get-ChildItem …\plugins -Recurse -File).Count` = 363 · `-Filter *.dll` = 360 · `-Filter *avfilter*` = 0 | BAJA (precisión) |
| **D10** | `01_STRUCTURE.md` §9 (C1–C7) y `03_HEADERS_MAP.md` | No listan la contradicción de nivel entre `#EXT-X-APE-CHANNEL-RUNTIME-CODEC-HEV1:hev1.2.4.L150.B0` (10.573 canales) y `STREAM-INF CODECS=hvc1.2.4.L153.B0` | La contradicción **existe y es censal**: L150 < L153 en el 100 % de los canales; además 1.296 canales declaran `L150` y 174 `L123` en `X-APE-Codec-Video` | `rg -m1 -o '#EXT-X-APE-CHANNEL-RUNTIME-CODEC-HEV1:[^,]+' <lista>` · `node …/tagscan2.js` | MEDIA (hueco de coherencia, no error de cifra) |

> **Nada de lo anterior es un número inventado.** Las tres "refutaciones de método" de `03` (§1: 256/189/108
> líneas por canal) las reproduje: son **134/103/54** por canal (`1.416.782/10.573`, `1.089.019/10.573`,
> `570.942/10.573`, división entera exacta). `03` tiene razón.

---

## 3. Re-mediciones independientes (26 cifras críticas)

Método distinto al de los autores en **todas** las filas (`rg`/`node` propios, `rg -n` + deltas en vez de
acumulador de streaming, parseo de claves propio en vez de sus analizadores).

| # | Cifra | Informe | Medido aquí | Comando (mío) | Resultado |
|---|---|---|---|---|---|
| 1 | Bytes | 604.593.696 | **604.593.696** | `Get-Item … .Length` | ✅ |
| 2 | SHA-256 | `523d52a6…5049d6` | **idéntico** | `Get-FileHash -Algorithm SHA256` | ✅ |
| 3 | Líneas totales | 10.315.662 | **10.315.662** | `rg -c '^' <lista>` | ✅ |
| 4 | Canales (`#EXTINF`) | 10.573 | **10.573** | `rg -c '^#EXTINF'` | ✅ |
| 5 | Histograma de bloques (8 tallas) | 954→45 · 972→216 · 973→1.705 · 974→1 · 976→5.433 · 977→3.152 · 978→20 · 981→1 | **idéntico, cifra por cifra** | `rg -n '^#EXTINF'` + deltas de línea | ✅ |
| 6 | Suma de bloques | 10.315.474 = total−188 | **10.315.474**, `exacto=True` | idem | ✅ |
| 7 | Líneas vacías | 10.576 | **10.576** | `rg -c '^$'` | ✅ |
| 8 | Cabecera / 1er `#EXTINF` | 188 líneas / línea 189 | **188 / 189** | `rg -n -m1 '^#EXTINF'` | ✅ |
| 9 | Tags distintos | 819 | **819** | `node tagscan2.js` (regex propia `^#[A-Za-z0-9_.\-]+`) | ✅ |
| 10 | `#EXTVLCOPT` / `#KODIPROP` / `#EXT-X-APE-*` | 1.416.786 / 1.089.025 / 6.498.710 | **idénticos** | `rg -c '^#EXTVLCOPT'`, `^#KODIPROP`, `^#EXT-X-APE-` | ✅ |
| 11 | `#EXT-X-CMAF*` / `#EXT-X-VNOVA*` / `#PHANTOM-HYDRA*` / `#EXTATTRFROMURL` / `#EXT-X-SYS-*` | 264.325 / 211.460 / 190.314 / 570.942 / 42 | **idénticos** | `rg -c` por familia | ✅ |
| 12 | `#EXT-X-MAP` / `#EXT-X-MEDIA` / `#EXT-X-KEY` | 0 / 0 / 1 | **0 / 0 / 1** | `rg -c` | ✅ |
| 13 | `#EXTHTTP` válidos | 10.573 / 0 inválidos | **10.573 / 0** (censo propio con `JSON.parse`) | `node overflow_totals.js` | ✅ |
| 14 | Campos por objeto | 199–200, media 199,55; hist 4.759 + 5.814 | **idéntico**; suma 2.109.841 = `199·4759 + 200·5814` (aritmética exacta) | `map censo` + `node` | ✅ |
| 15 | Bytes por objeto | 7.197–8.124, **0** objetos > 8.192 | **idéntico** (máx 8.124, margen 68 B) | `map censo` | ✅ |
| 16 | Overflow: campos / decodificación | 26–65, 10.573 decodificados, 0 inválidos | **26–65, 10.573, 0** | `node overflow_totals.js` (base64 propio) | ✅ |
| 17 | Campos totales por canal (principal+overflow) | min 226 · máx 265 · mediana 233 · media 235,85 | **226 / 265 / 233 / 235,85** | `node overflow_totals.js` | ✅ |
| 18 | Nombres distintos (principal ∪ overflow) | 276 | **276** | `node overflow_totals.js` | ✅ |
| 19 | Firmas `video-filter` | 3 (7.457 / 2.308 / 808), long. 277 / 344 / 348 | **3 / idénticos / 277-344-348** | `rg -o 'video-filter=[^\r\n]+' \| Sort-Object -Unique` + `.Length` | ✅ |
| 20 | `inputstream.adaptive.max_resolution` | `1920x1080` en el 100 % | **10.573 × `1920x1080`** | `rg -o 'max_resolution=[0-9x]+' \| Group-Object` | ✅ |
| 21 | `chooser_bandwidth_max` (t10) | 8.000.000×9.765 / 19.800.000×808 | **idéntico** | `rg -c -F 'chooser_bandwidth_max=8000000'` / `…19800000` | ✅ |
| 22 | `adaptive-maxbitrate` (EXTVLCOPT) | 8 M×9.765 / 19,8 M×808 | **idéntico** | `node keyvals.js` (parseo de clave+valor por tag) | ✅ |
| 23 | `video-fps=30` sobre `FRAME-RATE=60.000` (t10) | **1.185** canales | **1.185** (de 10.573 bloques) | `node fpscross2.js` (cruce por bloque) | ✅ |
| 24 | `#EXT-X-I-FRAME-STREAM-INF` | L93×7.457 / L123×2.308 / L153×808 · BW 200.000×9.765 / 495.000×808 | **idéntico** | `rg -c '^#EXT-X-I-FRAME-STREAM-INF:.*L93'` etc. | ✅ |
| 25 | 45 canales con 6 claves de `STREAM-INF` | 45 (partición 45+10.528) | **45** = `10.573 − 10.528` (`COLOR-PRIMARIES`/`STABLE-VARIANT-ID` presentes en 10.528) | `rg -c '^#EXT-X-STREAM-INF:.*COLOR-PRIMARIES'` | ✅ |
| 26 | `#EXT-X-DATERANGE` | `X-BIT-DEPTH` 8→9.765 / 12→808 · `X-HDR-MAX-CLL` 600/1.000/4.000 = 7.457/2.308/808 · `X-COLOR-PRIMARIES` BT.709 9.765 / BT.2020 808 | **idéntico** | `rg -c -F 'X-BIT-DEPTH=8,'` … (`X-COLOR-PRIMARIES="BT.709"` con comillas) | ✅ |

**Artefacto de los autores cruzado aparte:** `scratch/avisynth_probe_2026/fixtures/channels_index.csv` tiene
**10.573 filas** y su `Group-Object lines` reproduce el histograma exacto (45/216/1.705/1/5.433/3.152/20/1)
y los perfiles (P1=808, P3=2.308, P4=7.457). Un artefacto **independiente del informe** que coincide.

**Nota de honestidad sobre mis propios falsos negativos:** dos veces mi primera regex dio 0 por comillas
(`X-BIT-DEPTH="8"`, `X-COLOR-PRIMARIES=BT.709`) y una vez por un `slice` mal calculado (`video-fps`).
Las corregí y **no las reporto como discrepancia**: el error era mío, no del informe.

---

## 4. Caza de los cuatro modos de fallo

### (a) Número sin fuente — **NO ENCONTRADO**
En `01`, `02`, `03` y `04` cada tabla lleva comando, ruta de artefacto o campo de JSON en la misma fila
(por ejemplo `01` §0, `03` §0–§2, `04` §2 con `vlc.exe /plugins/video_filter` y las baterías CSV).
No hay una sola cifra huérfana. Es el punto más fuerte del trabajo.

### (b) Absoluto sin artefacto — **2 INSTANCIAS**
1. **"GOLDEN RULE: 0 violaciones"** (`03` §3.4 y skill §9). El artefacto existe, pero su **universo de
   escaneo son 4 sumideros**. Medido: el único emisor de `hev1.*` de la lista es
   `#EXT-X-APE-CHANNEL-RUNTIME-CODEC-HEV1` (10.573 líneas, 100 % de los canales), que **no está en la
   tabla**; y `hvc1.*` vive en **17 familias** (incluida `#EXTHTTP`, `#EXT-X-CMAF`, `#EXTATTRFROMURL`,
   `#EXT-X-APE-QUALITY-OVERRIDE-CODEC`). El "0" es cierto **solo** para el subconjunto declarado; como
   absoluto está **no soportado**. Lo correcto sería añadir la fila del 5.º sumidero y argumentar por qué
   no es cruce (o declararlo cruce).
2. **"Cada campo aparece o en el principal o en el overflow, nunca en ambos y nunca en ninguno"**
   (`03` §2.2): refutado en 51 de 276 nombres (D5).

### (c) Estado declarado como verificado sin artefacto reproducible — **1 INSTANCIA LEVE**
`runtime_matrix.cells[*].source` del skill afirma "medido con VLC 3.0.24" cuando el run **no detecta** la
versión (la recibe por flag). La versión real está verificada por metadatos del binario, así que el **hecho**
se sostiene; lo que no se sostiene es la **procedencia** tal como está escrita (D7).
**No hay más instancias:** `04` marca correctamente `x` (VLC 4.x no instalado — verificado: solo existe
`C:\Program Files\VideoLAN\VLC` 3.0.24) y `s` (sin mecanismo documentado) en las celdas que no midió, y
declara **0 celdas `aplicado`/`verificado`**.

### (d) Etiqueta leída como otra cosa — **4 INSTANCIAS**
1. `01` §7.1: la columna **"Valores distintos"** contiene en realidad el **tope de la lista de ejemplos**
   (25 filas, cada una con `n=1`). El valor real es **10.528**. La misma sección se contradice: su línea
   de texto dice "valor distinto por canal" (D1).
2. skill §6: rango de overflow **27**–65 (muestra) leído como si fuera del archivo, cuando el censo da **26**.
3. skill C5: **13,9 %** con denominador 10.573 cuando el campo existe en 1.470 → **100 %** de los que lo
   declaran (D6). `01` §4.3 sí distingue bien ("claves presentes en los 10.573 canales: 168"), así que el
   problema es del mapper, no del informe.
4. **"No computado" leído como cero:** busqué el patrón y **no existe**. `02` separa explícitamente
   "PASS de sintaxis ≠ aplicado"; `04` deja `NO_VERIFICADO` el efecto del VPP; el skill deja `aplicado` y
   `verificado` en **0 celdas** y lo dice. Correcto.

---

## 5. ¿La skill es realmente reutilizable? (prueba propia, no declaración)

### 5.1 Lista sintética fabricada por mí (2 canales, `#EXTHTTP` y cadena inválida a propósito)

`scratch/avisynth_probe_2026/verif/synthetic_2ch.m3u8` — 2.097 B, 24 líneas. Contiene a propósito:
un `#EXTHTTP` **válido con header tóxico `Range`** y dos *lookalikes* (`X-Priority`, `X-QoS-Priority`),
un `#EXTHTTP` **JSON inválido** (coma final), un `#EXT-X-APE-OVERFLOW-HEADERS` base64 válido,
y dos cadenas `video-filter` con los defectos reales (`unsharp chroma_msize_x=0`,
`zscale transfer=st2084`, `minterpolate scd=5`).

```powershell
node .agents/skills/ape-lista-cartographer/scripts/map_list.js scratch/avisynth_probe_2026/verif/synthetic_2ch.m3u8 --out scratch/avisynth_probe_2026/verif/synthetic_out
```

```
[map_list] canales 2 · líneas 24 · tags 12 · censo
[map_list] filtros: 2 firmas · sintaxis FAIL
[map_list] EXTHTTP: 2 analizados de 2 · 1 inválidos · tóxicos 1
EXIT=0
```

Detecta **exactamente** lo que debe (`synthetic_out/map_1e428cab.json`):

| Señal | Esperado | Medido | Comando |
|---|---|---|---|
| Canales / líneas / identidad de bloques | 2 / 24 / exacta | **2 / 24 / `sum_check_exact=true`** | mismo comando |
| `#EXTHTTP` inválido | 1, con mensaje literal | **1** — `Expected double-quoted property name in JSON at position 51` | `node -e "…map_1e428cab.json"` |
| Header tóxico | `Range` = 1 | **`{"Range":1}`** | idem |
| Lookalikes NO contados como tóxicos | 0 tóxicos extra | **`{"X-Priority":1,"X-QoS-Priority":1}` separados de `toxic_hits`** | idem |
| Overflow base64 | decodificado | **1 decodificado, 0 inválido** | idem |
| Cadena de filtros | FAIL con defecto | **FAIL, 5 violaciones, 2 firmas** | idem |
| Claims | V5/V7 en `fallido` | **`V5:fallido · V7:fallido · V9:no_computado`** | idem |

**No crashea y no finge.** Además el mapper emitió su propio control de fugas (`host:0 credencial:0
sha_preservado:true json_ok:true`) sobre mi lista sintética.

### 5.2 Casos borde (robustez)

| Caso | Archivo | Resultado |
|---|---|---|
| Solo cabecera, 0 canales | `edge_header_only.m3u8` (25 B) | exit 0, JSON válido |
| Archivo vacío | `edge_empty.m3u8` (0 B) | exit 0, JSON válido |
| CRLF + sin salto final | `edge_crlf_nonl.m3u8` (134 B) | exit 0, JSON válido |
| `--expect-channels` correcto | `fixtures/canal_001_P3.txt --expect-channels 1` | exit 0 · **1 canal, 977 líneas, 687 tags, `lines_after_uri=3`, `utf8_errors=0`** (reproduce T2 de `tests.md`) |
| `--expect-channels` incorrecto | idem, `--expect-channels 10573` | **exit 2** con `ASSERTION: canales 1 != esperado 10573` |
| `--fixture 1` sobre la lista real | `fixture_out` | **58.142 B / 977 líneas**, byte-idéntico al fixture commiteado `canal_001_P3.txt` |

### 5.3 El juez de ejecución reproduce el defecto publicado

```powershell
node .agents/skills/ape-lista-cartographer/scripts/validate_filter_chain.js --chain-file .agents/skills/ape-lista-cartographer/fixtures/chains/P1_literal.txt --per-stage --json
# verdict: {"chains":7,"full_chain":"FAIL","pass":3,"fail":4,"stages_failing":["unsharp","zscale","minterpolate"]}  EXIT=1
```

Mensajes literales reproducidos: `Undefined constant or missing '(' in 'st2084'` y
`Value 5.000000 for parameter 'scd' out of range [0 - 1]`. Coincide con `02` §4.2/§4.3.
**Única tacha:** `chain_sha256` sale `<REDACTED>` (D8).

---

## 6. Lo que NO pude verificar (INDECIDIBLE, con la evidencia exacta que falta)

| Afirmación | Por qué queda INDECIDIBLE | Evidencia que falta |
|---|---|---|
| `02` §5: **46,9× tiempo real** (P3) y **0,084 fps** a 4K con `nlmeans` | No re-ejecuté `filtro_run_matrix.ps1` / `matrix2.ps1` (coste alto, riesgo de ocupar la máquina). Los TSV existen y son consistentes internamente, pero **no los reproduje** | Volver a correr `pwsh -NoProfile -File scratch/avisynth_probe_2026/filtro_run_matrix.ps1` y comparar `filtro_matrix_results.tsv` |
| `04`: filas `OTT Navigator`, `TiviMate`, `ExoPlayer/Media3`, `Kodi + ISA`, `hls.js`, `VPS/Lua` | No hay runtime ejecutable aquí; el propio informe las marca `s` (ausencia documentada de mecanismo) y **no** las presenta como medidas | Log de un player real mostrando que acepta/ignora el tag; o cita de spec por runtime |
| `04`: efecto del **VPP/ARA** en píxeles | Requiere dispositivo; el informe lo declara `NO_VERIFICADO` | Captura de frames con/sin perfil PQ + diff |
| `03` §3.4: ¿es `#EXT-X-APE-CHANNEL-RUNTIME-CODEC-HEV1` un sumidero de códec para algún player? | Depende de documentación de player que no tengo. El **hecho** (10.573 líneas `hev1.*` fuera de los 4 sumideros) está medido; la **calificación doctrinal** no | Doc/spec del tag o log de player consumiéndolo |
| `05_CAP_CANDIDATES.md` y `06_EMISSION_TEMPLATE.md` | Fuera del alcance asignado a esta verificación | — |

---

## 7. Seguridad: ninguna credencial real expuesta

```powershell
node scratch/avisynth_probe_2026/verif/tools/leakscan.js
# URI shape: scheme=http: hostLen=17 segs=4 seg1=live userLen=6 passLen=6 port=(none)
# ficheros_escaneados=140
# FUGAS=0
```

- Universo escaneado: **126 archivos** en la primera pasada (antes de crear mis propios artefactos) y
  **140** en la pasada final, que ya incluye `scratch/avisynth_probe_2026/verif/**`. **FUGAS=0 en ambas.**
  Extensiones (`.md`, `.json`, `.txt`, `.js`, `.mjs`, `.csv`, `.m3u8`) en 6 árboles
  (`docs/cartography/APE_LISTA_523d52a6/`, `.agents/skills/ape-lista-cartographer/`, `tools/ape-demuxed/`,
  y los tres `scratch/` de la cartografía). Patrones buscados: **host real**, **usuario real**, **contraseña real**
  (extraídos del primer URI de la lista y usados solo en memoria; **no se imprimen en ningún artefacto**).
- Fixtures: `canal_001_P3.txt`, `canal_5739_P4_corto.txt` y mi extracción fresca dan
  `host=false user=false pass=false`, con el URI en la forma `http://<REDACTED>/live/<USER>/<PASS>/3.m3u8`.
- Hosts citados en los entregables: `29× <PICON-HOST>`, `10× <HOST>`, `10× <REDACTED>`, `8× <PROVIDER_HOST>`,
  más dominios públicos (`www.netflix.com`, `github.com`, `www.google.com`, `iptv-ape.duckdns.org`) y los
  dominios de prueba documentados (`fx.invalid`, `fixtures.invalid`, `credencial.invalid`). **Cero host real.**
- **Favor del trabajo, no defecto:** `01` §8 declara el enmascarado y `03` §nota lo repite; el mapper aborta
  con exit 2 si detecta fuga en el fixture (`tests.md` T3). Medido: `sha256_preserved:true` en todos los runs.

---

## 8. Juicio final (lo que sí y lo que no puede afirmarse)

**Sostenido con artefacto reproducible (puede usarse como base de decisión):**
- Identidad y estructura: 604.593.696 B · sha256 `523d52a6…5049d6` · 10.315.662 líneas · **10.573 canales** ·
  cabecera 188 · **8 tallas de bloque** con suma exacta · 819 tags distintos.
- `#EXTHTTP`: 10.573 objetos, **0 inválidos**, **250** nombres, **168** universales,
  **199–200** campos, **7.197–8.124** B, **0** objetos > 8.192 B, overflow 26–65, totales 226–265,
  unión **276**. El **corte es por campos (200)**, no por bytes: sostenido por la aritmética exacta y por mi censo.
- Filtros: **3** firmas (7.457/2.308/808) de **277/344/348** caracteres; **el 100 % falla en ffmpeg 8.0.1**
  por `unsharp chroma_msize_x=0` fuera de `[3..23]`; P1 suma 3 defectos propios. **Ninguna cadena llega a `aplicado`**.
- VLC 3.0.24 **rechaza `video-filter` desde playlist** (`unsafe option "video-filter" has been ignored for
  security reasons`, literal en `scratch/lane_matrix_04/vlc_bc/DBG.log`) y **no tiene módulo `avfilter`**
  (41 DLL en `plugins\video_filter`, 0 con `avfilter`). Es el hallazgo con más consecuencia de toda la cartografía.

**NO puede afirmarse (y así hay que decirlo río abajo):**
- **"0 violaciones GOLDEN RULE"** como absoluto: solo vale para los 4 sumideros declarados (D4).
- **"Cada campo está en el principal o en el overflow"**: falso en 51 de 276 nombres (D5).
- **"13,9 % de los canales contradicen el nivel HEVC vía `#EXTHTTP`"**: es **100 % de los 1.470** que
  declaran el campo (D6).
- **"`STABLE-VARIANT-ID` tiene 25 valores distintos"**: tiene **10.528** (D1).

---

## 9. Artefactos de esta verificación

Todo lo escrito por mí vive bajo `scratch/avisynth_probe_2026/verif/` (nada fuera; la lista y los
entregables auditados **no se tocaron**):

| Artefacto | Contenido |
|---|---|
| **`measurements.log`** | **log único con la salida literal de las 8 mediciones propias** (A histograma de bloques · B `layer_split` · C `codecvideo` · D `tagscan2` · E `fpscross2` · F `overflow_totals` · G `leakscan` · H `keyvals`). Es el artefacto que respalda D1, D4, D5, D6 y las filas 5, 13–22, 26 de §3 |
| `indep_counts.txt` | 44 conteos `rg` independientes sobre la lista real |
| `rerun_main/map_523d52a6.{json,md}` | **mi** corrida censal del mapper (29,1 s) |
| `rerun_main_console.txt` | salida literal de esa corrida |
| `fixture_run/`, `fixture_canal_001.txt` | extracción de fixture (58.142 B / 977 líneas) |
| `synthetic_2ch.m3u8`, `synthetic_out/` | lista sintética de 2 canales + su cartografía |
| `edge_*.m3u8`, `edge_*/` | 3 casos borde (solo cabecera, vacío, CRLF sin salto final) |
| `t2_fixture/`, `t2_expect_fail/` | T2 reproducido y ruta de fallo de `--expect-channels` |
| `tools/deepdiff_maps.js` | diff recursivo informe publicado vs mi corrida (85 hojas) |
| `tools/overflow_totals.js` | censo propio de principal+overflow (226–265, unión 276) |
| `tools/layer_split.js` | prueba del universal de `03` §2.2 (51 excepciones) |
| `tools/codecvideo.js` | `X-APE-Codec-Video` solo en 1.470 canales P3 (L150/L123) |
| `tools/tagscan2.js` | censo de tags con `hvc1`/`hev1` (17 familias / 2 familias) |
| `tools/keyvals.js` | claves+valores de los 7 candidatos a cap, por tag |
| `tools/fpscross2.js` | cruce `video-fps` ↔ `FRAME-RATE` por bloque (1.185) |
| `tools/leakscan.js` | control de fugas sobre 126 archivos (FUGAS=0) |
| `tools/hostinv.js` | inventario de hosts citados en entregables (todos placeholder/públicos) |
| `tools/q01*.js`, `qcap.js`, `qsyn.js`, `inspect_fields.js`, `cmp_maps.js` | consultas puntuales a los JSON |

**Contrato cumplido:** no arreglé lo que audito · ningún veredicto sin comando reproducible ·
los INDECIDIBLES se declaran con la evidencia que falta · no se tocó la lista, ni el VPS, ni Excel · sin `git`.

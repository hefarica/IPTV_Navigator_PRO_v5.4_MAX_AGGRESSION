# 02 — Matriz de filtros de vídeo: las 10.573 cadenas `#EXTVLCOPT:video-filter`

**Sujeto (solo lectura, sin modificar):** `APE_LISTA_1793589060441.m3u8` — 604.593.696 bytes, 10.315.662 líneas,
`sha256 523d52a6d147f81ce5a212e47b9c55401fb409cd4a41aee96f8ba80b5b5049d6` (verificado con `Get-FileHash`).
**Máquina de medida:** ffmpeg `8.0.1-full_build-www.gyan.dev`, VLC `3.0.24`, ripgrep `15.2.0`, Node `v24.12.0`.
**Artefacto de datos:** [`02_video_filter_matrix.json`](02_video_filter_matrix.json).

---

## VEREDICTO EN CINCO LÍNEAS

1. La lista emite **10.573 cadenas `#EXTVLCOPT:video-filter`**, pero solo **3 firmas distintas** (7.457 / 2.308 / 808),
   correlacionadas de forma biyectiva con los perfiles **P4 / P3 / P1**. No existe ningún canal P5.
2. **0 de 10.573** cadenas son parseables por ffmpeg 8.0.1. El primer fallo es idéntico y universal:
   `unsharp chroma_msize_x` vale `0` cuando el rango válido es `[3 .. 23]`.
3. Corregido ese único parámetro, **las firmas de P4 y P3 completas pasan y ejecutan** (`exit=0`). La firma de P1
   arrastra además **3 defectos propios**: `zscale transfer=st2084` (válido: `smpte2084`), `zscale matrix=2020ncl`
   (válido: `2020_ncl` o `bt2020nc`) y `minterpolate scd=5` (rango `[0 .. 1]`).
4. **VLC 3.0.24 no puede ejecutar ninguna de las 7 etapas tal como están escritas**: no hay módulo `avfilter` entre
   sus 363 plugins, y la gramática de `--video-filter` de VLC es `<modulo>{opt=val}` separada por `:`, no
   `<filtro>=<param>:<param>`. Medido en el log: `looking for video filter module matching "hqdn3d=luma_spatial=2.0,chain": 48 candidates` →
   `no video filter modules matched` → `Failed to add filter`. **La lista reproduce; los filtros no se aplican.**
5. El objetivo central (interpolar a 120 fps) **no es alcanzable en tiempo real**: la cadena P3 completa cuesta
   **93,75 s de CPU para 2,00 s de contenido** a 720p = **46,9× tiempo real**. A 4K con el `nlmeans` original:
   **0,084 fps**.

---

## 1. Método — comandos exactos

```powershell
# 1) Extracción de la cadena completa (no muestras)
rg -o --no-filename 'video-filter=.*' <LISTA> | Out-File all_vf_raw.txt      # 10573 filas
Get-Content all_vf_raw.txt | Group-Object | Sort-Object Count -Descending     # 3 grupos
node scratch/avisynth_probe_2026/filtro_correlate_profiles.js <LISTA>         # firma <-> perfil por entrada

# 2) Rangos reales de cada filtro
ffmpeg -hide_banner -h filter=nlmeans      > help_nlmeans.txt
ffmpeg -hide_banner -h filter=bwdif        > help_bwdif.txt
ffmpeg -hide_banner -h filter=yadif        > help_yadif.txt
ffmpeg -hide_banner -h filter=gradfun      > help_gradfun.txt
ffmpeg -hide_banner -h filter=unsharp      > help_unsharp.txt
ffmpeg -hide_banner -h filter=zscale       > help_zscale.txt
ffmpeg -hide_banner -h filter=minterpolate > help_minterpolate.txt
ffmpeg -hide_banner -h filter=hqdn3d       > help_hqdn3d.txt

# 3) Ejecución real por firma, por etapa y por parámetro aislado
pwsh -NoProfile -File scratch/avisynth_probe_2026/filtro_run_matrix.ps1    # rondas A-E
pwsh -NoProfile -File scratch/avisynth_probe_2026/filtro_run_matrix2.ps1   # rondas F-I

# 4) VLC: inventario estático, strings de opciones y ejecución real
pwsh -NoProfile -File scratch/avisynth_probe_2026/filtro_vlc_plugin_strings.ps1
pwsh -NoProfile -File scratch/avisynth_probe_2026/filtro_vlc_runtime_probe.ps1
```

Todos los `exit code`, mensajes de error literales y tiempos quedan en
`scratch/avisynth_probe_2026/vf_extract/filtro_matrix_results.tsv`, `filtro_matrix2_results.tsv`,
`err_*.txt` / `err2_*.txt` y `vlc/vlc_V*.log`.

---

## 2. Inventario: 3 firmas, no 2

| # | Perfil | Canales | Long. | Etapas | Firma (texto exacto) |
|---|--------|--------:|------:|--------|----------------------|
| **S1** | **P4** | 7.457 | 277 | 4 | `hqdn3d=luma_spatial=2.0:chroma_spatial=1.5:luma_tmp=3.0:chroma_tmp=2.5,yadif=mode=1:parity=-1:deint=0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.25:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs:scd=0` |
| **S2** | **P3** | 2.308 | 344 | 6 | `nlmeans=s=2.5:p=5:r=11,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=12:strength=0.8,unsharp=...:chroma_msize_x=0:chroma_msize_y=0:...,zscale=transfer=bt709:primaries=bt709:matrix=bt709:dither=error_diffusion:range=full,minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs:scd=0` |
| **S3** | **P1** | 808 | 348 | 6 | `nlmeans=s=3.0:p=7:r=15,bwdif=...,gradfun=radius=16:strength=1.0,unsharp=...:chroma_msize_x=0:chroma_msize_y=0:...,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full,minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs:scd=5` |

Correlación medida por entrada (`profile_signature_matrix.json`): `P4|S1 = 7457`, `P3|S2 = 2308`, `P1|S3 = 808`;
`entries = 10573`, `entries_without_profile = 0`, `entries_without_video_filter = 0`. Biyección perfecta: la firma
**es** el perfil. **No hay ninguna entrada P5** (ni P0 ni P2).

Ocurrencias por etapa en el archivo completo:

| Etapa | Cadenas | Nota |
|---|---:|---|
| `minterpolate` | 10.573 | 100 % de la lista |
| `unsharp` | 10.573 | 100 %, todas con `chroma_msize_x=0` y `chroma_msize_y=0` |
| `hqdn3d` / `yadif` | 7.457 | solo S1 |
| `nlmeans` / `bwdif` / `gradfun` / `zscale` | 3.116 | solo S2+S3 |

Tokens ausentes, medidos con `rg -c -F` sobre el archivo entero: `ffmpeg{` **0**, `libplacebo` **0**, `cas=` **0**,
`avfilter` **0**, `transfer=bt1886` **0**, `pp` **0**.

> **Contexto útil (misma lista, otra capa):** las 10.573 entradas emiten también
> `#EXTVLCOPT:video-deinterlace=1` + `#EXTVLCOPT:video-deinterlace-mode=yadif2x`. Es decir, el desentrelazado **ya está
> cubierto por la vía nativa de VLC** en el 100 % de los canales; las etapas `yadif`/`bwdif` del `video-filter` son
> redundantes incluso si la sintaxis se arreglara. Además hay 4 líneas `#EXTVLCOPT` sueltas fuera de toda entrada de
> canal (líneas 147-150): `colorspace=all=auto:trc=auto`, `tonemap=mobius`, `format=yuv444p10le`, `saturation=1.08`.

---

## 3. Etapas y veredicto ffmpeg 8.0.1

| Etapa | En cadenas | ffmpeg 8.0.1 | Evidencia |
|---|---:|---|---|
| `hqdn3d` | 7.457 | **PASS** | B01 `exit=0`; H01 = 0,17 s / 50 frames a 720p |
| `nlmeans` | 3.116 | **PASS** | B06 (`s=2.5:p=5:r=11`) y B07 (`s=3.0:p=7:r=15`) `exit=0` |
| `bwdif` | 3.116 | **PASS** | B08 `exit=0` |
| `yadif` | 7.457 | **PASS** | B02 `exit=0` |
| `gradfun` | 3.116 | **PASS** | B09 (`radius=12:strength=0.8`) y B10 (`radius=16:strength=1.0`) `exit=0` |
| `unsharp` | 10.573 | **FAIL** | A1/A2/A3/B03/C01/C02 |
| `zscale` | 3.116 | **FAIL en S3 / condicional en S2** | B12 + C08 (S3); B11 + F04 (S2 sobre fuente sin etiquetar) |
| `minterpolate` | 10.573 | **PASS en S1/S2 · FAIL en S3** | B05 `exit=0`; C04 `scd=5` fuera de rango |

Las tres firmas completas, tal cual las emite la lista:

| Test | Cadena | Resultado | Primer error literal |
|---|---|---|---|
| A1 | S1 (P4) | FAIL `exit=-34` | `[Parsed_unsharp_2] Value 0.000000 for parameter 'chroma_msize_x' out of range [3 - 23]` |
| A2 | S2 (P3) | FAIL `exit=-34` | `[Parsed_unsharp_3] Value 0.000000 for parameter 'chroma_msize_x' out of range [3 - 23]` |
| A3 | S3 (P1) | FAIL `exit=-34` | `[Parsed_unsharp_3] Value 0.000000 for parameter 'chroma_msize_x' out of range [3 - 23]` |

---

## 4. Diagnóstico exacto por etapa

### 4.1 `unsharp` — el defecto universal (10.573/10.573)

Salida literal de `ffmpeg -h filter=unsharp`:

```
luma_msize_x      <int>  (from 3 to 23) (default 5)
chroma_msize_x    <int>  (from 3 to 23) (default 5)
chroma_amount     <float> (from -2 to 5) (default 0)
```

La lista pide `chroma_msize_x=0` y `chroma_msize_y=0`. **0 está fuera de `[3 .. 23]`**:

```
$ ffmpeg -i src.y4m -vf 'unsharp=chroma_msize_x=0' -f null -
[Parsed_unsharp_0] Value 0.000000 for parameter 'chroma_msize_x' out of range [3 - 23]
[fc#-1] Error applying option 'chroma_msize_x' to filter 'unsharp': Result too large
```

Corrección: `3` (mínimo legal). `chroma_amount=0.0` **sí** es válido y neutraliza el efecto de croma, así que poner
`chroma_msize=3` **no cambia los píxeles** — solo desbloquea el parser. Verificado: B04 `exit=0`.

### 4.2 `zscale` — dos nombres zimg inexistentes (808 cadenas, solo S3/P1)

`transfer=st2084`:

```
[Parsed_zscale_0] [Eval] Undefined constant or missing '(' in 'st2084'
[Parsed_zscale_0] Unable to parse option value "st2084"
[fc#-1] Error applying option 'transfer' to filter 'zscale': Invalid argument
```

El enum real de `zscale transfer` (volcado de `help_zscale.txt`) es `input -1, 709 1, unspecified 2, 601 6, linear 8,
2020_10 14, 2020_12 15, bt470m 4, bt470bg 5, smpte170m 6, smpte240m 7, bt709 1, log100 9, log316 10, bt2020-10 14,
bt2020-12 15, **smpte2084 16**, iec61966-2-4 11, iec61966-2-1 13`. **`st2084` no existe; `smpte2084` sí.**

`matrix=2020ncl`:

```
[Parsed_zscale_0] [Eval] Invalid chars 'cl' at the end of expression '2020ncl'
```

El enum real es `709 1, unspecified 2, 470bg 5, 170m 6, **2020_ncl 9**, 2020_cl 10, gbr 0, fcc 4, ycgco 8,
**bt2020nc 9**, bt2020c 10, chroma-derived-nc 12, chroma-derived-c 14`. **`2020ncl` no existe**; sí `2020_ncl` y `bt2020nc`.

Validez del resto de `zscale` en la lista (probada por separado): `primaries=bt2020` ✅ (C11 aceptado por el parser),
`dither=error_diffusion` ✅ (C12 `exit=0`), `range=full` ✅ (F01 `exit=0`), `transfer=bt709`/`matrix=bt709` ✅ (K2 `exit=0`).

**Defecto adicional, no sintáctico:** la cadena no declara ningún `*in` (`matrixin`, `transferin`, `primariesin`,
`rangein`). Sin ellos zscale necesita que el bitstream llegue etiquetado; si no, **aborta la cadena entera**:

```
$ ffmpeg -i src709_480p.y4m -vf 'zscale=transfer=bt709:primaries=bt709:matrix=bt709:dither=error_diffusion:range=full' -f null -
[Parsed_zscale_0] code 3074: no path between colorspaces
[vf#0:0] Error while filtering: Generic error in an external library
```

Y falla incluso con un contenedor que solo trae `color_space=bt709` (F04: `color_transfer=unknown`,
`color_primaries=unknown`). Con `*in` explícitos **pasa** (F03, F05, K2). Es decir: **3.116 canales dependen de un dato
que la cadena no garantiza**.

### 4.3 `minterpolate` — `scd` fuera de rango (808 cadenas, solo S3/P1)

```
$ ffmpeg -i src.y4m -vf 'minterpolate=fps=120:scd=5' -f null -
[Parsed_minterpolate_0] Value 5.000000 for parameter 'scd' out of range [0 - 1]
[fc#-1] Error applying option 'scd' to filter 'minterpolate': Result too large
```

`scd <int> [0 .. 1]` (`none=0`, `fdiff=1`); existe además `scd_threshold <double> [0 .. 100]` (default 10). Si la
intención era "umbral 5 %", el parámetro correcto es `scd_threshold=5`, no `scd=5`.

Resto de `minterpolate` en la lista: `fps=120` ✅, `mi_mode=mci` (2) ✅, `mc_mode=aobmc` (1) ✅, `vsbmc=1` ✅,
`me=epzs` (8) ✅, `scd=0` ✅. Cadena entera de S1/S2: B05 `exit=0`.

### 4.4 Resto de etapas — sin defectos

`hqdn3d` (`<double> [0 .. DBL_MAX]`), `nlmeans` (`s [1..30] p [0..99] r [0..99]`), `bwdif`
(`mode [0..1] parity [-1..1] deint [0..1]`), `yadif` (`mode [0..3]`), `gradfun` (`strength [0.51..64] radius [4..32]`):
todos los valores de la lista están dentro de rango y ejecutan (`exit=0`). Contraste de control: `gradfun=strength=0.4`
**falla** con `out of range [0.51 - 64]` (C17), lo que confirma que el checker de rangos está activo y que
`strength=0.8` y `1.0` son legales.

---

## 5. Cascada de defectos (cuántos fallos tiene realmente cada firma)

Aislando cada defecto sobre una fuente etiquetada con `setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709`:

| Test | Qué se corrige | Resultado | Lectura |
|---|---|---|---|
| **K1** | S1: solo `unsharp chroma_msize=3` | `exit=0` en 2,17 s | **S1 tiene UN defecto** |
| **K2** | S2: solo `unsharp chroma_msize=3` | `exit=0` en 3,74 s | **S2 tiene UN defecto** (más la fragilidad de `zscale`) |
| **K3** | S3: `unsharp` | `exit=-22` → `Unable to parse option value "st2084"` | 2.º defecto |
| **K4** | S3: `unsharp` + `smpte2084`/`bt2020nc` | `exit=-34` → `scd out of range [0 - 1]` | 3.er defecto |
| **K5** | S3: todo | `exit=0` en 11,38 s | queda demostrado que no hay un 4.º |

**Recuento final:** 10.573 cadenas con ≥1 defecto (100 %); 808 de ellas con 3 defectos adicionales.

---

## 6. Coste medido — por qué 120 fps no es alcanzable

Fuente: 720p25 sintética (testsrc2), salvo donde se indique. `-f null -` (sin codificar: solo el filtro).

| Test | Qué mide | Tiempo | frames | fps |
|---|---|---:|---:|---:|
| H00 | baseline `null` | 0,07 s | 50 | 714 |
| H01 | `hqdn3d` (params de la lista) | 0,17 s | 50 | 294 |
| H02 | `yadif` | 0,07 s | 50 | 714 |
| H03 | `unsharp` corregido | 0,09 s | 50 | 556 |
| **H04** | **`nlmeans s=2.5 p=5 r=11`** | **22,45 s** | 50 | **2,23** |
| H05 | `gradfun radius=12:strength=0.8` | 0,13 s | 50 | 385 |
| **H06** | **`minterpolate mci fps=120`** | **23,55 s** | 100 | **4,25** |
| H07 | `minterpolate mi_mode=dup fps=120` | 0,09 s | 100 | 1.111 |
| H08 | `fps=fps=60` | 0,10 s | 100 | 1.000 |
| H09 | `zscale` con `*in` | 0,16 s | 50 | 313 |
| E1 | `minterpolate mci fps=120` @480p | 19,40 s | 240 | 12,4 |
| E2 | `minterpolate mci fps=120` @720p | 46,90 s | 240 | 5,1 |
| **X1** | **CADENA P3 COMPLETA (solo `unsharp` corregido), 2,00 s de contenido** | **93,75 s** | 240 | **2,56** |
| **X2** | **CADENA P1 con `nlmeans` a 3840×2160** | **47,81 s** | 4 | **0,084** |

Conclusiones duras:

- **`minterpolate fps=120` a 720p rinde 5,1 fps de salida** (E2: 240 frames en 46,9 s) frente a los **120 fps** que
  pide: **23,4× más lento que el tiempo real** él solo (46,9 s / 2,0 s de timeline de salida). A 480p sigue siendo
  **9,7×** (E1: 19,40 s / 2,0 s). Dentro de la cadena P3 completa: **46,9×** (X1). No es una función de reproducción:
  es un trabajo de render offline.
- **`nlmeans` es el otro sumidero**: 22,45 s para 2 s de 720p (11,2× tiempo real); a 4K baja a **0,084 fps** — 714×
  por debajo de los 60 fps que el propio perfil P1 declara.
- `mi_mode=dup` (0,09 s) **no interpola**: descarta frames. Si el objetivo fuera solo "declarar 120 fps", `dup` lo
  consigue a coste cero — y sin mejorar la imagen.

---

## 7. `#EXTVLCOPT:video-filter=<avfilter>` — veredicto VLC

### 7.1 Prueba estática

```
C:\Program Files\VideoLAN\VLC\plugins\video_filter  ->  41 DLL
  adjust, alphamask, anaglyph, antiflicker, ball, blend, blendbench, bluescreen, canvas,
  colorthres, croppadd, deinterlace, edgedetection, erase, extract, fps, freeze, gaussianblur,
  gradfun, gradient, grain, hqdn3d, invert, magnify, mirror, motionblur, motiondetect,
  oldmovie, posterize, postproc, psychedelic, puzzle, ripple, rotate, scale, scene, sepia,
  sharpen, transform, vhs, wave
plugins totales: 363
DLL *avfilter* / *ffmpeg* en todo el árbol: 0
plugins con el token "avfilter" en sus strings: 0
```

Búsqueda de módulo homónimo (`scratch/.../vlc_video_filter_plugins.json`):

| Etapa ffmpeg | ¿Módulo VLC con ese nombre? |
|---|---|
| `hqdn3d` | **SÍ** (opciones `luma-spat`, `chroma-spat`, `luma-temp`, `chroma-temp` — **con guion**) |
| `gradfun` | **SÍ** (opciones `radius`, `strength` — **mismas que ffmpeg**) |
| `nlmeans`, `bwdif`, `yadif`, `unsharp`, `zscale`, `minterpolate` | **NO** |
| (`sharpen` existe, pero solo con `sigma`; `deinterlace` expone `yadif`/`yadif2x` como *método*; `fps` existe, `postproc` existe) | — |

### 7.2 Prueba de ejecución real (VLC 3.0.24, `--file-logging -vvv --vout=dummy`)

Cadena S1 de la lista, literal:

```
main debug: Adding 'hqdn3d=luma_spatial=2.0' as interactive
main debug: looking for video filter module matching "hqdn3d=luma_spatial=2.0,chain": 48 candidates
main debug: no video filter modules matched
main error: Failed to create video filter 'hqdn3d=luma_spatial=2.0'
main error: Failed to add filter 'hqdn3d=luma_spatial=2.0'
   ... 32 veces en la sesion ...
```

Y aun así el archivo **se reprodujo entero**: `using video decoder module "avcodec"` → `using vout display module "vdummy"`
→ `EOF reached` → salida limpia. **Esa es la distinción clave: la lista REPRODUCE; los filtros NO SE APLICAN.**

Contraste que aísla la causa (misma máquina, mismo archivo):

| Test | `--video-filter=` | Log | Lectura |
|---|---|---|---|
| V3 | `hqdn3d` | `using video filter module "hqdn3d"` | el módulo **existe y carga** |
| V4 | `hqdn3d{luma-spat=2.0,chroma-spat=1.5}` | `using video filter module "hqdn3d"` | **la gramática correcta de VLC funciona** |
| V5 | `hqdn3d=luma_spatial=2.0:chroma_spatial=1.5` | `no video filter modules matched` → `Failed to create video filter 'hqdn3d=luma_spatial=2.0'` | **la sintaxis de la lista es la que mata el filtro** |
| V6 | `minterpolate` | `no video filter modules matched` | no existe |
| V7 | `nlmeans` | `no video filter modules matched` | no existe |
| V10 | `gradfun{radius=12,strength=0.8}` | `using video filter module "gradfun"` | único caso con valores idénticos a los de la lista |
| V11 | `deinterlace{mode=yadif2x}` | `using video filter module "deinterlace"` | cubierto ya por `#EXTVLCOPT:video-deinterlace-mode` |
| V8 | `hqdn3d{luma_spatial=2.0}` (guion bajo) | carga igual | **VLC ignora la opción desconocida → aplica DEFAULTS** |
| V9 | `hqdn3d{bogus=1}` | carga igual | confirma el silencio de VLC ante opciones inválidas |

**Regla de sintaxis, medida:** VLC parte `--video-filter` por `:` y espera `<modulo>` o `<modulo>{opt=val,opt=val}`.
La lista usa `<filtro>=<param>:<param>`, así que VLC toma `hqdn3d=luma_spatial=2.0` como **nombre de módulo completo**
y no encuentra ninguno de los 48 candidatos.

> **Trampa para el que "arregle" esto cambiando `=` por `{}`:** V8 demuestra que VLC **no valida** los nombres de opción
> dentro de las llaves (`bogus=1` se acepta). Con `hqdn3d{luma_spatial=2.0}` VLC aplicaría `hqdn3d` **con sus valores por
> defecto**, no con los pedidos. Para que el valor se aplique hay que usar el nombre de VLC: `luma-spat`, con guion.

---

## 8. Matriz por runtime

| Runtime | ¿Reproduce la lista? | ¿Aplica algún filtro? | Evidencia |
|---|---|---|---|
| **VLC 3.0.24** | **SÍ** | **NO (0 de 10.573)** | Medido: logs V0-V11 en `vf_extract/vlc/`; 41 plugins, 0 avfilter; `Failed to add filter` ×32 sin abortar la reproducción |
| **ExoPlayer / OTT Navigator / TiviMate / hls.js / Kodi** | **SÍ** | **NO, ni con sintaxis corregida** | **Normativo, no medido aquí:** RFC 8216 §6.3.1 obliga a ignorar los tags no reconocidos; `#EXTVLCOPT` es extensión propietaria de VLC. Estos players no tienen motor de cadenas de filtros en la playlist: decodifica el decoder del sistema (MediaCodec / AVFoundation). |
| **VPS-ARA (nginx metadata-only)** | **SÍ** | **NO por construcción** | Documentado y medido en `CLAUDE.md` → "REALIDAD MEDIDA DEL VPS 2026-10-25": producción es *rebase-only metadata*, **no transporta vídeo** (`.ts|.m4s|.mp4 → 404`). Sin píxeles no hay nada que filtrar. No re-medido en esta tarea. |

De las **7 etapas distintas** que emite la lista, **2 tienen equivalente real en VLC** (`hqdn3d`, `gradfun`), **1 está
duplicada por una opción nativa** (`yadif`/`bwdif` vs `video-deinterlace-mode=yadif2x` ya presente en las 10.573
entradas) y **4 no existen en ningún runtime de la lista** (`nlmeans`, `unsharp`, `zscale`, `minterpolate`).

---

## 9. Cadenas corregidas por perfil (parsean **y** ejecutan)

Criterios aplicados, todos derivados de la medición: `chroma_msize 0→3` (no cambia píxeles porque `chroma_amount=0`),
`nlmeans→hqdn3d` (132× más barato medido: 22,45 s vs 0,17 s a 720p/50 frames), `minterpolate fps=120 → fps=fps=N`
(coherente con el `video-fps` que la propia lista ya declara, y 235× más barato medido: 23,55 s vs 0,10 s por 100
frames de salida), `zscale` con nombres zimg correctos y `*in` explícitos.

### P4 — 7.457 canales · 720p SDR · 30 fps

```
hqdn3d=luma_spatial=2.0:chroma_spatial=1.5:luma_tmp=3.0:chroma_tmp=2.5,yadif=mode=1:parity=-1:deint=0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.25:chroma_msize_x=3:chroma_msize_y=3:chroma_amount=0.0,fps=fps=30
```

```powershell
ffmpeg -hide_banner -nostdin -y -v error -i scratch/avisynth_probe_2026/filtro_src_hd_720p25_2s.y4m `
  -vf "<cadena>" -frames:v 200 -f null -
# exit=0 · 200 frames en 0,44 s = 452,6 fps  (15,1x el objetivo de 30 fps)
```

### P3 — 2.308 canales · 1080p SDR bt709 · 60 fps

```
hqdn3d=luma_spatial=1.5:chroma_spatial=1.0:luma_tmp=2.0:chroma_tmp=1.5,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=12:strength=0.8,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.3:chroma_msize_x=3:chroma_msize_y=3:chroma_amount=0.0,zscale=matrixin=bt709:transferin=bt709:primariesin=bt709:rangein=limited:transfer=bt709:primaries=bt709:matrix=bt709:dither=error_diffusion:range=full,fps=fps=60
```

```powershell
ffmpeg -hide_banner -nostdin -y -v error -i scratch/avisynth_probe_2026/filtro_src_fhd_1080p25_1s.y4m `
  -vf "<cadena>" -frames:v 120 -f null -
# exit=0 · 120 frames en 0,50 s = 241,3 fps  (4,0x el objetivo de 60 fps)
```

### P1 — 808 canales · 4K · intención HDR (smpte2084/bt2020) · 60 fps declarado

```
hqdn3d=luma_spatial=1.0:chroma_spatial=0.8:luma_tmp=1.5:chroma_tmp=1.2,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=3:chroma_msize_y=3:chroma_amount=0.0,zscale=matrixin=bt709:transferin=bt709:primariesin=bt709:rangein=limited:transfer=smpte2084:primaries=bt2020:matrix=bt2020nc:dither=error_diffusion:range=full,fps=fps=60
```

```powershell
ffmpeg -hide_banner -nostdin -y -v error -f lavfi -i "testsrc2=size=3840x2160:rate=25" -t 1 `
  -vf "<cadena>" -frames:v 60 -f null -
# exit=0 · 60 frames en 2,03 s = 29,6 fps a 3840x2160
```

> **No maquillado:** 29,6 fps **no** llega a los 60 fps que P1 declara (49 %). A 4K esta cadena es tiempo real a
> 25–30 fps, no a 60. Para 60 fps reales en este host hay que sacar la conversión HDR del filtro (dejarla al display)
> o declarar `fps=fps=30`. Con el `nlmeans` original a 4K: **0,084 fps** — inviable por **714×** (60 / 0,084).

### P5 — **no existe en esta lista** (0 de 10.573 entradas) · cadena PROPUESTA, no derivada

```
hqdn3d=luma_spatial=1.2:chroma_spatial=0.8:luma_tmp=1.5:chroma_tmp=1.0,yadif=mode=0:parity=-1:deint=0,fps=fps=30
```

```powershell
ffmpeg -hide_banner -nostdin -y -v error -i scratch/avisynth_probe_2026/filtro_src_sd_480p25_2s.y4m -vf "<cadena>" -frames:v 60 -f null -
# exit=0 · 60 frames en 0,15 s  (I5)
```

---

## 10. Correcciones a los hechos del capitán

| Hecho previo | Estado | Evidencia |
|---|---|---|
| "`minterpolate me_mode` es int 0..1 (**NO existe `me`**)" | **REFUTADO** | `ffmpeg -h filter=minterpolate` → `me <int> ... (from 1 to 9) (default epzs)`. C14 `me=epzs` → `exit=0`. C16 `me=11` → `out of range [1 - 9]`. El parámetro **sí** existe y **sí** es válido en la lista. |
| "el filtro `pp` no existe (`Unknown filter 'pp'`)" | **CONFIRMADO en el fondo, mensaje corregido** | G01: `[AVFilterGraph] No such filter: 'pp'`. G02 `pp=default`: `No option name near 'default'`. |
| "zimg no tiene `transfer=bt1886`" | **CONFIRMADO** | G05 → `Undefined constant or missing '(' in 'bt1886'`. Ojo: la lista **sí** emite `#EXT-X-APE-HDR-TRANSFER:BT1886` como *metadata* en 10.573 entradas, pero `transfer=bt1886` como argumento de filtro = **0**. |
| "`gradfun` strength [0.51,64] radius [4,32]" | **CONFIRMADO** | `-h filter=gradfun`; C17 `strength=0.4` → `out of range [0.51 - 64]`. |
| "`zscale dither` no admite blue-noise" | **CONFIRMADO** | C13 `dither=blue_noise` → `Undefined constant`. Enum real: `none\|ordered\|random\|error_diffusion`. |
| "VLC sin plugin avfilter; inventario de 41 plugins" | **CONFIRMADO** | 41 DLL en `plugins\video_filter`, 0 con token `avfilter`, 0 DLL `*avfilter*`/`*ffmpeg*` en 363 plugins. |
| "10.573 líneas, todas con minterpolate, 3.116 con zscale y gradfun, 0 `ffmpeg{`/`bt1886`/`libplacebo`/`cas=`" | **CONFIRMADO** | `rg -c` sobre el archivo entero: 10573 / 10573 / 3116 / 3116 / 0 / 0 / 0 / 0. |
| "las muestras A y B" | **INCOMPLETO** | Hay **3 firmas**, no 2. Falta la de **808 canales (P1)**: `nlmeans s=3.0:p=7:r=15` + `zscale transfer=st2084` + `matrix=2020ncl` + `minterpolate scd=5`. Es precisamente **la única con defectos de `zscale` y `scd`**, y sin ella el diagnóstico se queda corto. |

---

## 11. Límites de esta evidencia (fail-honest)

- Fuentes de prueba **sintéticas** (`testsrc2` / y4m 480p-1080p) y un mp4 H.264 480p. **No** se ejecutó contra un TS HLS
  real del proveedor: los tiempos escalan con resolución y contenido, y la cifra de 4K sale de una fuente lavfi.
- **ExoPlayer / OTT / TiviMate / Kodi / VPS-ARA no se ejecutaron en esta tarea.** Su veredicto "INERTE" es **normativo**
  (RFC 8216 §6.3.1) y de arquitectura documentada, **no empírico**.
- El factor **46,9× tiempo real** es de este host (Windows, build gyan de ffmpeg 8.0.1, sin GPU). En otro hardware el
  factor cambia; el orden de magnitud no.
- **No** se verificó si el bitstream real de cada canal llega etiquetado (`matrix`/`transfer`/`primaries`), que es lo que
  decide si el `zscale` de S2 funciona o aborta. Solo se demuestra que **la cadena no lo garantiza** y que aborta cuando
  falta (B11, F04).
- No se tocó la lista. No se tocó el VPS. No se ejecutó git.

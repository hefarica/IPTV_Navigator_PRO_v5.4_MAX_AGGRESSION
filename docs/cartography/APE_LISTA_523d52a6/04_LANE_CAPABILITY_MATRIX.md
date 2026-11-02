# 04 — Matriz de capacidad por runtime: qué cadena de imagen ejecuta de verdad cada player

**Fase 4 de la cartografía forense 0→100 %.** Convierte la cartografía (t1 estructura, t2 cadenas
`video-filter`) en una **matriz runtime × etapa** que el generador pueda obedecer sin mentir.

- **Sujeto (solo lectura, sin modificar):** `APE_LISTA_1793589060441.m3u8` — 604.593.696 B,
  `sha256 523d52a6d147f81ce5a212e47b9c55401fb409cd4a41aee96f8ba80b5b5049d6`.
- **Máquina de medida:** VLC `3.0.24` (`C:\Program Files\VideoLAN\VLC`), ffmpeg `8.0.1-full_build-www.gyan.dev`,
  Node `v24.12.0`, Windows, **sin GPU**. Fecha de medida: 2026-11-02 (America/Bogota).
- **Artefacto de datos:** [`04_lane_capability_matrix.json`](04_lane_capability_matrix.json).
- **Evidencia cruda de esta fase:** `scratch/lane_matrix_04/` (logs VLC por caso, CSV por batería, literales
  extraídos de la lista, clip de prueba). Cada cifra de este informe tiene su log o su comando.

> **Notación de evidencia — se aplica a CADA celda:**
> `m` = **medido en esta tarea** (log/ruta citada) · `r` = **código del repo** (ruta:línea) ·
> `s` = **spec/arquitectura** (norma o ausencia documentada de mecanismo) · `x` = **NO MEDIDO**.
> Una celda sin artefacto **no puede ser NATIVO ni PLUGIN/DAEMON**: cae a `DECLARATIVO` o `IMPOSIBLE`.

---

## VEREDICTO EN SEIS LÍNEAS

1. **VLC 3.0.24 no acepta NINGÚN `video-filter` desde una playlist.** No es (solo) un problema de sintaxis:
   el parser de ítems lo rechaza por política — `main error: unsafe option "video-filter" has been ignored
   for security reasons` (`scratch/lane_matrix_04/vlc_bc/DBG.log`). La cadena puede ser perfecta y **aun así
   no se aplica**. El carril `#EXTVLCOPT:video-filter=` está **muerto por diseño** en VLC 3.0.24.
2. **El filtro sí ejecuta por línea de comandos**, y ahí la sintaxis correcta es
   `--video-filter=<modulo>{opt=val,...}` con **`:` como separador de módulos** (medido: `hqdn3d` **y**
   `gradfun` cargan con `:`; con `,` solo carga el primero). VLC **no** usa el filtergraph de ffmpeg.
3. **De las 9 etapas de imagen, VLC solo tiene motor real para 4** (`deinterlace`, `hqdn3d`, `gradfun`,
   `sharpen`; `postproc` y `antiflicker` existen además). **`scale` como filtro NO existe** (medido: 18
   `no video filter modules matched`), y `nlmeans`/`bwdif`/`yadif`/`zscale`/`unsharp`/`minterpolate`
   **no son módulos VLC**.
4. **En los otros seis runtimes (OTT, TiviMate, ExoPlayer/Media3, Kodi/ISA, hls.js, VPS/Lua) la cadena es
   metadata inerte**: no hay mecanismo documentado que convierta un tag de playlist en un filtro de píxeles.
   Veredicto `DECLARATIVO` en las 9 etapas, con dos excepciones estructurales: el **VPS no transporta vídeo**
   (segmentos `→ 404`), así que ahí es `IMPOSIBLE`; y OTT/Kodi **sí leen** `#EXTVLCOPT`/`#KODIPROP`, pero
   solo para red/UA/DRM, nunca para filtros.
5. **El único runtime que cambia píxeles de verdad es el VPP del SoC vía ARA** (denoise, escalado/SR,
   sharpeping, HDR-PQ), y **no se activa desde la playlist**: se comanda por settings del device
   (`push_pq_profile.php`). Su efecto en píxeles sigue **NO_VERIFICADO** sin dispositivo.
6. **Techo honesto:** las 10.573 cadenas son inertes en el 100 % de los runtimes medidos; lo que sí llega
   al usuario es el **stream real + el decoder + el VPP**. Cualquier afirmación de "imagen mejorada por la
   lista" es una mentira al parser hasta que un runtime reporte el filtro aplicado.

---

## 1. Matriz runtime × etapa (el entregable)

Códigos: **N** = NATIVO · **P** = PLUGIN/DAEMON · **D** = DECLARATIVO (metadata que el runtime ignora) ·
**I** = IMPOSIBLE. El sufijo es la calidad de evidencia (`m`/`r`/`s`/`x`).

| Runtime | Desentrelazado | Denoise | Escalado | Color/HDR | Tonemapping | Sharpening | Debanding | Interp. movimiento | Bit-depth |
|---|---|---|---|---|---|---|---|---|---|
| **VLC 3.x** (medido) | `N·m` CLI / `D·m` playlist | `N·m` CLI / `D·m` playlist | `I·m` | `D·m` | `D·m` | `N·m` CLI / `D·m` playlist | `N·m` CLI / `D·m` playlist | `I·m` | `I·m` |
| **VLC 4.x** (no instalado) | `D·x` | `D·x` | `D·x` | `D·x` | `D·x` | `D·x` | `D·x` | `I·s` | `I·s` |
| **OTT Navigator** | `D·s` | `D·s` | `D·s` | `D·s` | `D·s` | `D·s` | `D·s` | `I·s` | `I·s` |
| **TiviMate** | `D·s` | `D·s` | `D·s` | `D·s` | `D·s` | `D·s` | `D·s` | `I·s` | `I·s` |
| **ExoPlayer / Media3** | `D·s` | `D·s` | `D·s` | `D·s` | `D·s` | `D·s` | `D·s` | `I·s` | `I·s` |
| **Kodi + ISA** | `D·s` | `D·s` | `D·s` | `D·s` | `D·s` | `D·s` | `D·s` | `I·s` | `I·s` |
| **hls.js (navegador)** | `D·s` | `D·s` | `D·s` | `D·s` | `D·s` | `D·s` | `D·s` | `I·s` | `I·s` |
| **VPS/Lua (rebase-only)** | `I·r` | `I·r` | `I·r` | `D·r` | `I·r` | `I·r` | `I·r` | `I·r` | `I·r` |
| **ARA / VPP del SoC** | `I·r` | `P·r` | `P·r` | `P·r` | `I·r` | `P·r` | `I·r` | `I·r` | `I·r` |

**Lectura obligatoria (no promediar la matriz):**

- **La fila VLC es la única con `N`**, y ese `N` vale **solo por CLI** (`vlc --video-filter=...`). Desde la
  playlist el mismo módulo es `D·m` porque VLC descarta la opción por seguridad (§4). Es la distinción
  `declarado` vs `aplicado` de `ape-image-pipeline-truth` §13. El JSON lleva **las dos columnas**:
  `verdict` (capacidad del runtime) y `verdict_playlist` (lo que consigue el tag).
- **`scaling = I` en VLC no significa que VLC no escale**: escala en el **vout** (display). Lo que no existe
  es un filtro `scale` seleccionable por nombre desde la cadena (medido: `M07_scale.log`, 18 `no match`).
  Desde la playlist, el escalado es **no accionable**.
- **`I` en "interpolación" no es pesimismo**: VLC solo tiene `fps` (duplica/descarta frames). Ninguno de los
  runtimes del catálogo tiene interpolación de movimiento accionable por playlist; el objetivo "120 fps" de
  la lista no lo cumple ningún carril (§8).
- **`I` en "bit-depth"** porque no existe filtro de profundidad en VLC ni clave de manifiesto en ningún
  player; el bit depth lo decide el decoder/display.
- **La fila VPS es `I` en píxeles por construcción**: producción es *rebase-only metadata* y los segmentos
  responden `404` (`docs/manifestos/VPS_REALITY_MEASURED_2026-10-25.md:18,58`). Su `D` en color/HDR es
  *etiqueta*, no píxel.
- **La fila ARA es `P` porque existe la clave**, no porque esté demostrado el efecto: sin dispositivo, el
  efecto es `NO_VERIFICADO` (§6).

---

## 2. Método — comandos exactos (reproducibles)

```powershell
# 1) Inventario VLC: versión, plugins de filtro, presencia de avfilter
(Get-Item 'C:\Program Files\VideoLAN\VLC\vlc.exe').VersionInfo.FileVersion      # 3.0.24
Get-ChildItem 'C:\Program Files\VideoLAN\VLC\plugins\video_filter' -File         # 41 DLL
Get-ChildItem 'C:\Program Files\VideoLAN\VLC' -Recurse -File -Include *.dll,*.exe |
  Where-Object Name -match 'avfilter'                                            # 0 coincidencias

# 2) Nombres de opción REALES de cada módulo (strings estáticos del DLL)
node scratch/lane_matrix_04/vlc_option_strings.js

# 3) Batería A: 30 arranques VLC con --video-filter=<caso> y log propio
pwsh -NoProfile -File scratch/lane_matrix_04/run_vlc_battery.ps1
#    -> scratch/lane_matrix_04/vlc_battery_results.csv + vlc/<caso>.log

# 4) Carril playlist: ¿VLC aplica #EXTVLCOPT:video-filter? (m3u8 real + log -vvv)
#    -> scratch/lane_matrix_04/playlists/*.m3u8, vlc_bc/DBG.log

# 5) Batería E: qué opciones #EXTVLCOPT sobreviven al filtro de seguridad
# 6) Batería C: qué nombres de opción resuelve VLC ("option X is unknown")
pwsh -NoProfile -File scratch/lane_matrix_04/run_vlc_e3c.ps1
#    -> vlc_battery_e_results.csv, vlc_battery_c_results.csv
```

**Literal de las tres cadenas de la lista** (extraído con `rg`, no copiado a mano):
`scratch/lane_matrix_04/literals/P4_hqdn3d.txt` (277 chars), `P3_nlmeans25.txt` (344), `P1_nlmeans30.txt` (348).
Longitudes idénticas a las de `02_VIDEO_FILTER_MATRIX.md` §2 → la extracción es fiel.

**Insumo de prueba:** `scratch/lane_matrix_04/test_720p25.ts` — 3 s, 1280×720@25, H.264, MPEG-TS
(`ffmpeg -f lavfi -i testsrc2 ... -f mpegts`). Es un **TS como los del proveedor**, no un y4m.

---

## 3. VLC 3.0.24 — inventario medido

| Hecho | Valor | Artefacto |
|---|---|---|
| Versión | `3.0.24` (`3,0,24,0`) | `(Get-Item vlc.exe).VersionInfo` |
| Plugins `video_filter` | **41** DLL | `plugins\video_filter\*.dll` |
| Binarios con `avfilter` en el nombre | **0** de 366 | `Get-ChildItem -Recurse -Include *.dll,*.exe` |
| Librerías ffmpeg presentes | `libavcodec_plugin`, `libswscale_plugin`, `libpostproc_plugin` (**wrappers de VLC**, sin `libavfilter`) | idem |
| Módulos que **cargan** como filtro (probados) | `hqdn3d`, `gradfun`, `deinterlace`, `sharpen`, `postproc`, `adjust`, `transform`, `croppadd`, `fps`, `rotate`, `gaussianblur`, `antiflicker`, `grain` — **13 probados, 13 cargan** (los otros 28 plugins del directorio **no se probaron**) | `vlc_battery_results.csv` (`L01`…`M10`) |
| `scale` como filtro | **NO carga** (`no video filter modules matched`, 18 veces) | `vlc/M07_scale.log` |
| `nlmeans`, `minterpolate`, `unsharp`, `zscale`, `yadif`, `bwdif` | **NO cargan** (18 `no match` / caso) | `vlc/L08…L13.log` |
| Cadena S1 de la lista (7.457 canales) | **288** `no match` + **32** `Failed to add filter`; el archivo **reproduce igual** | `vlc/L20_LIST_S1_P4.log` |
| Cadenas S2 / S3 (3.116 canales) | **360** `no match` + **40** `Failed to add filter` cada una | `vlc/L21…L22.log` |
| Reproducción con cadena inválida | `decoder_opened=True`, `eof_reached=True` en **30/30** casos | `vlc_battery_results.csv` |

**Consecuencia medida:** la lista **reproduce** en VLC y **no filtra nada**. El error no aborta el playback;
solo ensucia el log (32–40 líneas de error por canal).

### 3.1 Sintaxis real de la cadena VLC (medida, y refuta la lectura de ",")

| Test | `--video-filter=` | Módulos que cargan | Lectura |
|---|---|---|---|
| `L05` | `hqdn3d{luma-spat=2.0,chroma-spat=1.5}:gradfun{radius=12,strength=0.8}` | **`hqdn3d` + `gradfun`** | **`:` separa módulos** |
| `L04` | `hqdn3d{...},gradfun{...},sharpen{...}` | **solo `hqdn3d`** | con `,` el resto se pierde |
| `L02` | `hqdn3d{luma-spat=2.0,chroma-spat=1.5,luma-temp=3.0,chroma-temp=2.5}` | `hqdn3d` | `,` separa **opciones** dentro de `{}` |
| `L07` | `hqdn3d{bogus=1}` | `hqdn3d` | VLC **avisa** (`main warning: option bogus is unknown`) y sigue |

Log literal de `L05` (`scratch/lane_matrix_04/vlc/L05_chain_COLON.log`):

```
main debug: Adding 'hqdn3d' as interactive
main debug: looking for video filter module matching "hqdn3d,chain": 48 candidates
main debug: using video filter module "hqdn3d"
main debug: Adding 'gradfun' as interactive
main debug: using video filter module "gradfun"
```

> **Corrección a `ape-image-pipeline-truth` §6 y a `02_VIDEO_FILTER_MATRIX.md` §7.2:** ambos afirman que VLC
> parte la cadena «por `:` **y** por `,`». Medido: **`,` no separa módulos**; solo `:` sí. Con `,` VLC
> instancia **únicamente el primer módulo** y descarta el resto sin avisar. Es la diferencia entre una cadena
> de 1 filtro y una de 3.

> **`chain error: Too high level of recursion (3)`**: aparece **98 veces** en `L05` y **0** en `L00_baseline`
> (`vlc/L00_baseline.log`). Es el módulo implícito `chain` quejándose, **no** un aborto: en los 30 casos el
> decoder abrió y llegó a `EOF reached`. La skill lo describe como "el arnés aborta"; medido: **no aborta**.

---

## 4. El hallazgo que cierra el carril playlist: `unsafe option`

Con `#EXTVLCOPT:video-filter=hqdn3d{luma-spat=2.0,chroma-spat=1.5}` dentro de un `.m3u8` real:

```
main error: unsafe option "video-filter" has been ignored for security reasons
```

Artefacto: `scratch/lane_matrix_04/vlc_bc/DBG.log` (playlist: `playlists/B01.m3u8`). Consecuencias medidas:

| Hecho | Valor |
|---|---|
| Veces que VLC instancia `hqdn3d` desde la playlist | **0** (`using video filter module "hqdn3d"` = 0) |
| Reproducción | completa (`using video decoder module "avcodec"`, `EOF reached`) |
| Dependencia de la sintaxis | **ninguna**: falla con módulo real y con filtergraph ffmpeg por igual |

**Por qué importa:** VLC filtra las opciones que vienen de un ítem no confiable (playlist, `.mpls`, etc.)
contra una lista de opciones "seguras". `video-filter` **no** está en esa lista. Por tanto:

- El carril `#EXTVLCOPT:video-filter=` **no se puede arreglar** cambiando nombres ni llaves: está cerrado en
  VLC 3.0.24 por política.
- `ape-image-pipeline-truth` §5 ("carril `vlc`: `#EXTVLCOPT:video-filter=<módulos VLC>`") es **optimista**:
  describe la intención del diseño, no el comportamiento medido del binario.
- El único camino real para filtrar en VLC es **arrancarlo con `--video-filter=`** (CLI), o que un
  **daemon** lo lance. Eso no lo controla la lista.

**Límite declarado:** medido sobre un ítem `file://`. El filtro de seguridad vive en la ruta de opciones del
`input_item` (no en el acceso), pero **no se repitió sobre HTTP** en esta tarea.

---

## 5. Subconjunto VLC válido: módulos, parámetros reales y cadena correcta

### 5.1 Módulos que existen y sus opciones (nombre exacto)

Nombres extraídos de los strings del DLL (`scratch/lane_matrix_04/vlc_option_strings.json`) y **verificados
por el aviso `option <X> is unknown`** en la batería C (`vlc_battery_c_results.csv`). VLC nombra las opciones
**con guion** (`luma-spat`), no con guion bajo (`luma_spatial`).

| Módulo | Opciones reales | Notas |
|---|---|---|
| `hqdn3d` | `luma-spat`, `chroma-spat`, `luma-temp`, `chroma-temp` | denoise temporal+espacial; `luma_spatial`/`luma-spatial` **no** resuelven |
| `gradfun` | `radius`, `strength` | debanding; mismos nombres que ffmpeg |
| `deinterlace` | `mode` (valores `yadif`, `yadif2x`, `blend`, `linear`, `mean`, `discard`, …) | `deinterlace-mode` como **opción** no resuelve |
| `sharpen` | `sigma` | sin parámetros de luminancia/croma separados |
| `postproc` | `q`, `name` | post-proceso ffmpeg clásico (deringing/deblocking) |
| `adjust` | `contrast`, `brightness`, `gamma`, `saturation`, `brightness-threshold` | color/curvas en el dominio del filtro |
| `transform` | `type` (`hflip`, `vflip`, `transpose`, `antitranspose`) | geometría |
| `croppadd` | `croptop`, `cropbottom`, `cropleft`, `cropright`, `paddtop`, `paddbottom`, `paddleft`, `paddright` | geometría |
| `fps` | `fps` | **conversión de cadencia, no interpolación de movimiento** |
| `gaussianblur` | `sigma` | blur |
| `grain` | `variance`, `period-min`, `period-max` | grano sintético (no mejora) |
| `antiflicker` | `window-size`, `softening-size` | anti-parpadeo |
| `rotate` | `angle`, `use-motion` | geometría |

> Tabla de resolución exacta (qué nombre resolvió y cuál disparó `option ... is unknown`): **§5.4**.

### 5.2 Cadena `video-filter=` sintácticamente válida para VLC

Regla medida: **módulos separados por `:`**, **opciones dentro de `{}` separadas por `,`**,
**nombres con guion**.

```text
# Denoise + debanding + sharpen  (los 3 módulos que la lista quería, traducidos a VLC real)
--video-filter=hqdn3d{luma-spat=2.0,chroma-spat=1.5,luma-temp=3.0,chroma-temp=2.5}:gradfun{radius=12,strength=0.8}:sharpen{sigma=0.5}
```

```text
# Desentrelazado (única forma real: el módulo, no la opción de vout)
--video-filter=deinterlace{mode=yadif2x}
```

Comprobación medida (batería A): `L31_REC_P3` y `L32_REC_P1` — escritas con `,` — cargan **solo `hqdn3d`**;
`L05` — escrita con `:` — carga **`hqdn3d` + `gradfun`**. Por eso la cadena publicable usa `:`.

> **Trampa que ya costó una corrección:** `recipes.json` (`vlc` de P0–P5) usa `hqdn3d` sin opciones y
> cadenas de **un solo módulo** — correcto. Cualquier cadena multi-módulo escrita con `,` **se degrada
> silenciosamente a un módulo**. Si el generador emite `,` entre módulos, miente sin error.

### 5.3 Lo que NO es un módulo VLC (no se emite nunca)

`nlmeans` · `bwdif` · `yadif` · `zscale` · `minterpolate` · `unsharp` · `cas` · `libplacebo` · `pp` ·
`ffmpeg{...}` · `scale` (como **filtro**; el escalado es del vout) · `tonemap` (como filtro; es opción de vout).

### 5.4 Resolución de nombres de opción (batería C, medida)

El discriminador es el aviso literal `main warning: option <X> is unknown` que VLC emite cuando el nombre
**no** resuelve. Artefacto: `scratch/lane_matrix_04/vlc_battery_c_results.csv` + `vlc_e3/<caso>.log`.

| Test | Cadena | Módulo que carga | `option … is unknown` | Lectura |
|---|---|---|---|---|
| `C01` | `hqdn3d{luma-spat=2.0}` | `hqdn3d` | — | **nombre real** |
| `C04` | `hqdn3d{chroma-spat=1.5}` | `hqdn3d` | — | real |
| `C05` | `hqdn3d{luma-temp=3.0}` | `hqdn3d` | — | real |
| `C06` | `hqdn3d{chroma-temp=2.5}` | `hqdn3d` | — | real |
| `C02` | `hqdn3d{luma_spatial=2.0}` | `hqdn3d` | **`luma_spatial`** | no existe (guion bajo) · único caso `exit=-1` |
| `C03` | `hqdn3d{luma-spatial=2.0}` | `hqdn3d` | **`luma-spatial`** | no existe (nombre largo) |
| `C07` | `hqdn3d{luma_tmp=3.0}` | `hqdn3d` | **`luma_tmp`** | no existe |
| `C08` | `gradfun{radius=12}` | `gradfun` | — | real |
| `C09` | `gradfun{strength=0.8}` | `gradfun` | — | real |
| `C10` | `sharpen{sigma=0.5}` | `sharpen` | — | real |
| `C11` | `deinterlace{mode=yadif2x}` | `deinterlace` | — | real: la opción es **`mode`** |
| `C12` | `deinterlace{deinterlace-mode=yadif2x}` | `deinterlace` | **`deinterlace-mode`** | no existe como opción **del módulo** |
| `C13` | `fps{fps=30}` | `fps` | — | real |
| `C14` | `postproc{q=5}` | `postproc` | — | real |
| `C16` | `adjust{contrast=1.05}` | `adjust` | — | real |
| `C17` | `adjust{saturation=1.08}` | `adjust` | — | real |
| `C18` | `transform{type=hflip}` | `transform` | — | real |
| `C19` | `croppadd{croptop=2}` | `croppadd` | — | real |
| `C20` | `gaussianblur{sigma=1.0}` | `gaussianblur` | — | real |
| `C23` | `grain{variance=1.0}` | `grain` | — | real |

> **Refuta dos afirmaciones previas de una vez:** (a) `luma-spat` **sí** resuelve — la que no resuelve es
> `luma_spatial`/`luma-spatial` (la skill `ape-image-pipeline-truth` §6 y `recipes.json`
> (`vlc_accepted_options.hqdn3d = "ninguna"`) dicen lo contrario); (b) `deinterlace-mode` **no** es opción
> del módulo `deinterlace` (es `mode`), aunque exista como opción de *vout*.

---

## 6. Los otros runtimes — base de cada celda

### 6.1 VLC 4.x — **NO MEDIDO** (no instalado)

No hay binario 4.x en esta máquina (`Get-ChildItem C:\Program Files -Recurse -Filter vlc.exe` → una sola
entrada, `3.0.24`). Todo lo que se diga de VLC 4 en este documento es **declaración**, no medida:

| Afirmación sobre VLC 4 | Estado |
|---|---|
| Sigue sin plugin `avfilter` | **NO MEDIDO** (no hay binario). La arquitectura de filtros **no** cambió en lo publicado. |
| Tendría vout GPU (libplacebo) con tonemapping/upscaling | **roadmap upstream**, no verificado aquí; **no** es un filtergraph de playlist. |
| El `#EXTVLCOPT:video-filter` seguiría siendo opción no confiable | **NO MEDIDO**; por continuidad de diseño se espera igual, pero **no se afirma**. |

Por eso la fila VLC 4 de §1 va con `x`: **no se promueve nada a `N` sin binario**.

### 6.2 OTT Navigator

- **Motor:** embebe **VLC 3.6.x** como motor de códec seleccionable; por defecto usa ExoPlayer
  (`.agents/skills/ape-image-pipeline-truth/SKILL.md` §11, que cita el changelog oficial
  `ottnav.github.io/changelog.html`).
- **Qué lee de la playlist:** `#EXTVLCOPT` **solo para `user-agent` y `http-referrer`**; `#KODIPROP`
  (`inputstream.adaptive.*`) y `#EXTATTRFROMURL`.
- **Filtros:** no hay mención ni mecanismo documentado de `video-filter`. Aunque el usuario elija el motor
  VLC, el ítem lo construye la app: **la cadena seguiría sujeta al filtro `unsafe option`** (§4).
- **Veredicto:** `DECLARATIVO` en las 9 etapas. `IMPOSIBLE` en interpolación y bit-depth (no hay motor).
- **Grado:** `s` (documentación del proyecto + ausencia de mecanismo). **No se ejecutó OTT Navigator aquí.**

### 6.3 TiviMate

- **Motor:** ExoPlayer (base Android), según `frontend/js/ape-v9/ape-profiles-config.js:6042` citado en
  `docs/rea/05_PLAYER_COMPAT.md:26`.
- **Qué lee:** atributos M3U Plus + `#EXTHTTP` (headers). No hay documentación de un canal de filtros.
- **Veredicto:** `DECLARATIVO` en las 9 etapas. **`IMPOSIBLE`** en interpolación/bit-depth.
- **Grado:** `s`. **No se ejecutó TiviMate aquí** (app cerrada, sin dispositivo).

### 6.4 ExoPlayer / Media3

- **Qué es:** librería de reproducción; decodifica con `MediaCodec`/software y renderiza por superficie.
  Cualquier post-proceso exige **código de la app** (efectos GL del módulo `media3-effect`), no un tag.
- **Qué lee de la playlist:** el manifiesto HLS estándar (`EXT-X-STREAM-INF`, `CODECS`, `RESOLUTION`,
  `VIDEO-RANGE`, `EXT-X-MEDIA`…). `#EXTVLCOPT`/`#KODIPROP`/`#EXT-X-APE-*` son **comentarios ignorados**.
- **Veredicto:** `DECLARATIVO` en las 9 etapas.
- **Grado:** `s`. **No se compiló ni ejecutó ExoPlayer aquí.**

### 6.5 Kodi + inputstream.adaptive

- **Qué lee:** `#KODIPROP:inputstream.adaptive.*` (propiedades del addon) y `#KODIPROP:` genérico (propiedad
  del demuxer). La lista emite **103 claves `#KODIPROP` por canal**, 102 de ellas bajo
  `inputstream.adaptive.*` (`scratch/avisynth_probe_2026/fixtures/canal_001.txt`, extraído con `rg`).
- **Qué NO hace:** no hay cadena de filtros de vídeo por playlist. Kodi **sí** tiene desentrelazado y método
  de escalado, pero son **ajustes del reproductor**, no tags.
- **Veredicto:** `DECLARATIVO` en las 9 etapas; `IMPOSIBLE` en interpolación/bit-depth.
- **Grado:** `s`. **No se ejecutó Kodi aquí.**

### 6.6 hls.js (navegador)

- **Qué es:** demuxer/remuxer sobre MSE; el `<video>` del navegador decodifica y compone.
- **Qué lee:** tags HLS estándar. Cualquier `#EXT-X-APE-*`, `#EXTVLCOPT` o `#KODIPROP` es **tag desconocido
  → ignorado** (comportamiento documentado del parser, `.agents/skills/hlsjs-internals-m3u8-parser-attrlist/SKILL.md`).
- **Veredicto:** `DECLARATIVO` en las 9 etapas.
- **Grado:** `s`.

### 6.7 VPS / nginx-Lua (rebase-only)

- **Medido en producción** (`docs/manifestos/VPS_REALITY_MEASURED_2026-10-25.md:18`): *rebase-only metadata*;
  **no** transporta vídeo, `.ts/.m4s/.mp4 → 404` (`:58`). Sin píxeles no hay etapa de imagen posible.
- **Lo que sí hace:** reescribe URIs y **etiquetas** del manifiesto (resolución/códec/HDR) — eso es
  `DECLARATIVO` en la columna color/HDR: cambia lo que el player *cree*, no lo que el decoder recibe.
- **Veredicto:** `IMPOSIBLE` en 8 de 9 etapas; `DECLARATIVO` en color/HDR.
- **Grado:** `r` (documento de medición en producción, no re-medido aquí; esta tarea no tocó el VPS).

### 6.8 ARA / VPP del SoC (daemon en device)

- **Qué es:** el daemon (ARA) escribe **settings del SoC**; el VPP post-procesa el frame **ya decodificado**,
  sea cual sea el códec y el player.
- **Claves allowlisted** (`vps/prisma/cli/push_pq_profile.php:22-30`; `docs/rea/08_VPP_AI_SR.md:42`;
  `docs/edge/E5_UHD_DOCTRINE.md:157`): `pq_ai_sr_enable`, `ai_sr_level`, `pq_sharpness_enable`,
  `pq_ai_dnr_enable`, `pq_dnr_enable`, `pq_nr_enable`, `pq_hdr_enable`, `pq_hdr_mode`,
  `match_content_frame_rate`, `hdr_conversion_mode`, `minimal_post_processing_allowed`.
- **Mapeo a etapas:** denoise → `pq_*_dnr`; escalado/SR → `pq_ai_sr_enable`+`ai_sr_level`; sharpening →
  `pq_sharpness_enable`; color/HDR → `pq_hdr_enable`/`pq_hdr_mode` (**passthrough**, no SDR→HDR).
  **Sin clave:** desentrelazado, tonemapping explícito, debanding, interpolación (MEMC no está en la
  allowlist medida), bit-depth.
- **Veredicto:** `P` en esas 4 etapas; `I` en las 5 restantes.
- **Grado:** `r`. **Efecto en píxeles `NO_VERIFICADO`** sin dispositivo (mismo estado que
  `docs/rea/05_PLAYER_COMPAT.md:72`).

---

## 7. Reglas de emisión (lo que el generador debe y no debe emitir)

### 7.1 El principio

> **Un tag de imagen en la playlist es `declarado`, nunca `aplicado`.**
> Y un tag desconocido es **metadata inerte**: no filtra, no rompe. Lo que rompe es **prometerlo**.

### 7.2 Matriz de emisión por player

| Destino | Emitir SÍ | Emitir NUNCA | Base |
|---|---|---|---|
| **VLC** (desktop) | `#EXTVLCOPT:` con opciones **que pasan el filtro de seguridad** (§7.3); `#EXTVLCOPT:network-caching=…` | `#EXTVLCOPT:video-filter=…` (ignorado por `unsafe option`); `video-deinterlace*`, `video-hdr*`, `video-width/height/fps`, `adaptive-*`, `hls-*`, `ts-*` | Medido: `DBG.log`, §7.3, `tools/ape-image-recipes/VLC_OPT_AUDIT.md` |
| **OTT Navigator** | `#EXTVLCOPT:http-user-agent=…`, `#EXTVLCOPT:http-referrer=…`; `#KODIPROP:inputstream.adaptive.*`; `#EXTHTTP` | Cualquier cadena de filtros; `#EXT-X-APE-*` como si filtrara | `ape-image-pipeline-truth` §11 |
| **TiviMate** | `#EXTHTTP` (JSON, valores simples — ver `tivimate-single-value-headers-enforcer`); atributos M3U Plus | `#EXTVLCOPT:video-filter`; tags HLS en lista M3U Plus | skill + doctrina del repo |
| **ExoPlayer/Media3** | solo manifiesto HLS estándar (`EXT-X-STREAM-INF`/`CODECS`/`VIDEO-RANGE`/`EXT-X-MEDIA`) | `#EXTVLCOPT`, `#KODIPROP` y `#EXT-X-APE-*` **como si el player los leyera** | §6.4 |
| **Kodi/ISA** | `#KODIPROP:inputstream.adaptive.*` **documentadas por el addon** | claves `inputstream.adaptive.video_ai_*`, `hdr_*`, `drm_*` **inventadas** (no son del addon) | §6.5, fixture 103 claves |
| **hls.js** | tags HLS estándar | cualquier tag propietario presentado como filtro | §6.6 |
| **VPS/Lua** | rewrite de URIs; etiquetas declarativas | **cualquier promesa de píxeles**; transcode (prohibido por ANTI-DEGRADACIÓN) | `VPS_REALITY_MEASURED_2026-10-25.md` |
| **ARA/VPP** | comando de perfil PQ (`max_image`/`sports`/`cinema`/`off`) por el canal del daemon | escribir settings del SoC **desde la playlist** (imposible) | `push_pq_profile.php` |

### 7.3 Filtro de seguridad de VLC: qué sobrevive (batería E, medida)

Artefacto: `scratch/lane_matrix_04/vlc_battery_e_results.csv` + `vlc_e3/<caso>.log`. Cada caso es un `.m3u8`
con **una sola** línea `#EXTVLCOPT:<opción>`.

| `#EXTVLCOPT:` | Resultado medido | ¿Nombre real en los binarios? | Veredicto de emisión |
|---|---|---|---|
| `network-caching=1000` | `exit=0`, sin aviso | sí | **PERMITIDO** (red) |
| `live-caching=1000` | `exit=0`, sin aviso | sí | PERMITIDO (red) |
| `clock-jitter=0` | `exit=0`, sin aviso | sí | PERMITIDO (red/reloj) |
| `http-user-agent=…` | `exit=0`, sin aviso | sí | PERMITIDO (red; además lo lee OTT Navigator) |
| `http-referrer=…` | `exit=0`, sin aviso | sí | PERMITIDO (red) |
| `avcodec-hw=none` | **`unsafe option "avcodec-hw"` ignorada** | sí | **PROHIBIDO desde playlist** |
| `video-filter=hqdn3d` | **`unsafe option "video-filter"` ignorada** | sí | **PROHIBIDO** (el hallazgo de §4) |
| `deinterlace=1` | `exit=0`, sin aviso | sí | PERMITIDO **con reserva** |
| `deinterlace-mode=yadif2x` | `exit=0`, sin aviso | sí | PERMITIDO **con reserva** |
| `saturation=1.08` | `exit=0`, sin aviso | sí | PERMITIDO **con reserva** |
| `tonemap=mobius` | `exit=0`, sin aviso | sí | PERMITIDO **con reserva** |
| `format=yuv444p10le` | `exit=0`, sin aviso | sí | PERMITIDO **con reserva** |
| `postproc-q=5` | `exit=0`, sin aviso | sí | PERMITIDO **con reserva** |
| `video-deinterlace=1` | `exit=0`, **sin aviso** | **NO** (`VLC_OPT_AUDIT.md`) | **PROHIBIDO** (inerte **silencioso**) |
| `video-deinterlace-mode=yadif2x` | `exit=0`, sin aviso | **NO** | **PROHIBIDO** |
| `adaptive-maxbw=5` | `exit=0`, sin aviso | **NO** | **PROHIBIDO** |

**Las tres lecturas que importan:**

1. **`unsafe` es explícito y afecta a opciones REALES de VLC.** `avcodec-hw` existe y aun así **no se puede
   activar desde una playlist**. No es un problema de nombres: es una lista blanca.
2. **Ausencia de aviso ≠ aplicación.** `deinterlace`, `saturation`, `tonemap`, `format` y `postproc-q`
   existen y no reciben objeción, pero esta batería **no** demuestra que VLC las aplique al vout desde un
   ítem no confiable (no hay captura de frames). Por eso van **"con reserva"**: se permite emitirlas porque
   el nombre es real y no hay rechazo, y **no** se declara que mejoren la imagen.
3. **El silencio es peor que el error.** `video-deinterlace*` y `adaptive-*` **no producen ninguna línea de
   log** — se descartan sin dejar rastro. Un operador que lea el log de VLC no verá que su "HDR" o su
   "desentrelazado" nunca existieron. Esto es lo que convierte la lista en una **mentira invisible** para
   VLC 3, y es el argumento más fuerte para retirar esas familias del carril VLC.

**Regla derivada:** el generador emite para VLC **solo** lo que esté en `PERMITIDO` (y lo declara como
declarado); **nunca** lo `PROHIBIDO`; y **nunca** presenta una opción "con reserva" como mejora de imagen.

### 7.4 Qué NO debe emitirse nunca (lista cerrada, con razón medida)

1. `#EXTVLCOPT:video-filter=<lo que sea>` — `unsafe option`, ignorado (medido).
2. Nombres ffmpeg como módulos VLC (`nlmeans`, `bwdif`, `yadif`, `zscale`, `unsharp`, `minterpolate`) —
   no existen como módulo (medido, 18 `no match` cada uno).
3. Cadenas multi-módulo separadas por `,` — VLC solo instancia la primera (medido `L04` vs `L05`).
4. `#EXTVLCOPT:video-deinterlace*` — nombre inexistente en VLC; el real es `deinterlace`/`deinterlace-mode`
   (§7.3).
5. `adaptive-*`, `hls-*`, `ts-*`, `video-hdr*` como opciones de VLC — **80 de 138** nombres no existen
   (`tools/ape-image-recipes/VLC_OPT_AUDIT.md`).
6. `#KODIPROP:inputstream.adaptive.video_ai_sr`, `.video_lcevc`, `.hdr_*`, `.drm_*`: **no son claves del
   addon**; el addon no tiene IA ni LCEVC (fixture `canal_001.txt` + ausencia de doc del addon).
7. Cualquier tag propio (`#EXT-X-APE-*`) presentado como "filtro aplicado" o "mejora de imagen": en todos los
   runtimes medidos es **inerte**.
8. `RESOLUTION=3840x2160` / `VIDEO-RANGE=PQ` / `CODECS=hvc1…` **sin verdad del probe**: es la mentira que
   produce freeze o color shift (`docs/rea/05_PLAYER_COMPAT.md` §2). El `VIDEO-RANGE=PQ` incondicional es
   decisión del propietario (2026-06-16) y se mantiene **como hint de display**, no como filtro.

### 7.5 Regla de oro del parser

> **Un tag desconocido en HLS es metadata inerte y no filtra nada.** No hay excepción medida en ninguno de
> los runtimes del catálogo: el único que intenta leer `#EXTVLCOPT` (VLC) **descarta explícitamente** la
> opción de imagen por seguridad; y OTT/Kodi solo consumen las claves de red/DRM que documentan.

---

## 8. Confrontación con la doctrina del repo

| Doctrina | Cómo la trata esta matriz |
|---|---|
| **MAX IMAGE FIRST** | Intacta: nada de esto degrada. La matriz no recorta resolución, códec, HDR ni fps; solo **prohíbe declarar filtros que no se ejecutan**. Elegir la mejor variante real sigue siendo el lever #1. |
| **ANTI-DEGRADACIÓN** | La matriz **no** propone transcode en el VPS para "que el filtro funcione": el VPS no transporta vídeo y recomprimir es degradar. 4K sigue 4K. |
| **GOLDEN RULE `hvc1`/`hev1`** | No se toca. Ojo con la contradicción ya medida: `ape-codec-family=h264` en 9.535 canales vs `CODECS=hvc1…` en los 10.573 (`01_STRUCTURE.md` §9 C1). Esta fase **no** la resuelve; solo registra que **no** autoriza declarar un códec que el bitstream no trae. |
| **`VIDEO-RANGE=PQ` incondicional** (owner, 2026-06-16) | Se respeta como **hint de display**. No es un filtro y no se cuenta como etapa de imagen ejecutada. |
| **El lever real = VPP del SoC vía ARA/VPS** | Es la conclusión de §6.8: el único carril que cambia píxeles. El VPS **selecciona y comanda**; el device **post-procesa**; el bitstream **no se toca**. |
| **"120 fps"** | No sostenible ni en ffmpeg ni en ningún runtime (§9). Declararlo como aplicado es mentir (`02_VIDEO_FILTER_MATRIX.md` §6). |

---

## 9. Correcciones a hechos previos (incluidos los míos)

| Hecho previo | Estado | Evidencia |
|---|---|---|
| Capitán: "VLC 3.x NO tiene plugin avfilter; sus 41 módulos son …" | **CONFIRMADO** | 41 DLL, 0 binarios `avfilter`, 366 binarios escaneados |
| Capitán: "la lista emite nombres ffmpeg que no son módulos de VLC" | **CONFIRMADO** | `L08…L13`: 18 `no match` cada módulo |
| t2: "VLC parte `--video-filter` por `:`" | **CONFIRMADO** | `L05` carga 2 módulos con `:` |
| t2 / skill: "VLC parte la cadena por `:` **y** por `,`" | **REFUTADO** | `L04`: con `,` solo carga el primer módulo |
| t2: "`video-deinterlace-mode=yadif2x` ya cubre el desentrelazado por la vía nativa" | **REFUTADO** | `video-deinterlace`/`video-deinterlace-mode` **no existen en los 365 binarios** (`tools/ape-image-recipes/VLC_OPT_AUDIT.md`) y en runtime se descartan **en silencio** (E09/E10: `exit=0`, cero avisos). Los nombres reales son `deinterlace` + `deinterlace-mode` (opciones de vout) y, dentro del módulo, `mode` (`C11` sí / `C12` no) |
| t2: "VLC SI carga hqdn3d (V3) y gradfun{…} (V10): 2 de 7 etapas tienen equivalente real" | **CONFIRMADO y ampliado** | cargan por CLI; **desde playlist no carga ninguno** (`unsafe option`) |
| skill §5: "carril vlc: `#EXTVLCOPT:video-filter=<módulos VLC>`" | **REFUTADO en VLC 3.0.24** | `main error: unsafe option "video-filter" has been ignored` |
| skill §18: "el arnés headless aborta con `Too high level of recursion` tras el primer módulo" | **MATIZADO** | el aviso existe (98× en `L05`) pero **no aborta**: decoder + `EOF reached` en 30/30 |
| skill §6: "`hqdn3d` rechaza `luma_spatial` **y** `luma-spat`" | **REFUTADO** (segunda mitad) | `luma-spat` **resuelve** (batería C, `C01`); lo que no resuelve es `luma_spatial`/`luma-spatial` |
| `recipes.json`: `"vlc_accepted_options": {"hqdn3d": "ninguna …"}` | **REFUTADO** | `hqdn3d` acepta `luma-spat`/`chroma-spat`/`luma-temp`/`chroma-temp` (§5.4) |
| t2: "ExoPlayer/OTT/TiviMate/hls.js/Kodi → INERTE (normativo)" | **CONFIRMADO** | §6.2–6.6; sigue siendo `s`, no medido |

---

## 10. Oposición de hipótesis (la conclusión central pasó por contra-tesis)

La afirmación más cargada ("el carril playlist está cerrado") se sometió al protocolo adversarial determinista:

- **Contra-tesis devuelta:** *«la ausencia es un artefacto de la ventana observada: el productor no existe, el
  log está roto, o la ventana no cubre el evento; o el evento ocurre en otra ruta»*.
- **Veredicto: `TESIS`** — pesos 17 vs 1, con **6 ítems con artefacto** del lado ganador
  (`adversarial_verdict`).

| Prueba discriminante | Resultado medido | Artefacto |
|---|---|---|
| Existencia del productor | el log **sí** registra el rechazo (2 × `unsafe option`); el cero **no** es un log mudo | `vlc_bc/DBG.log` |
| Cobertura de la ventana | cubre el ciclo completo: `using video decoder module "avcodec"` → `EOF reached` → `logger module stopped` | `vlc_bc/DBG.log` |
| Búsqueda por el hecho (no por el nombre) | `using video filter module`=0 · `hqdn3d`=0 · `luma-spat`=0 · `video-filter`=2 (ambas `unsafe`) | `vlc_bc/DBG.log` |
| Otra ruta | por CLI **sí** ocurre (`hqdn3d`+`gradfun`); la tesis ya lo afirma | `vlc/L05_chain_COLON.log` |

**Evidencia que falta (declarada):** no se repitió sobre HTTP; `unsafe option` está medido sobre ítem
`file://`.

---

## 11. Límites (fail-honest)

- **VLC 4 no se midió**: no hay binario. Toda su fila es `x`.
- **OTT Navigator, TiviMate, ExoPlayer, Kodi, hls.js no se ejecutaron**: sus celdas son arquitectura y
  ausencia documentada de mecanismo, no prueba de reproducción.
- **El VPS no se tocó** (doctrina `iptv-vps-touch-nothing`); su fila viene del documento de medición de
  producción.
- **ARA/VPP no se ejecutó** (sin dispositivo): el efecto en píxeles queda `NO_VERIFICADO`.
- **`unsafe option` se midió sobre `file://`**, no sobre HTTP.
- **No se midió el resultado visual** (no hay captura de frames): "el módulo carga" **no** es "el frame
  cambia". La cadena de §5.2 está validada en **carga**, no en píxeles.
- **No se modificó la lista**, no se tocó el VPS ni Excel, no se ejecutó git.
- Fuente de vídeo **sintética** (testsrc2 720p25 en TS): sirve para sintaxis/carga, no para calidad.

---

## 12. Artefactos de esta fase

| Artefacto | Qué prueba |
|---|---|
| `scratch/lane_matrix_04/vlc_battery_results.csv` | 30 arranques: qué módulo carga y cuál no |
| `scratch/lane_matrix_04/vlc/*.log` | logs `-vvv` por caso (incluye `L20/L21/L22` = las 3 cadenas de la lista) |
| `scratch/lane_matrix_04/vlc_option_strings.json` | nombres de opción por módulo (strings del DLL) |
| `scratch/lane_matrix_04/vlc_battery_c_results.csv` | qué nombre resuelve VLC (`is unknown`) |
| `scratch/lane_matrix_04/vlc_battery_e_results.csv` | qué `#EXTVLCOPT` sobrevive al filtro de seguridad |
| `scratch/lane_matrix_04/vlc_bc/DBG.log` | **`unsafe option "video-filter"`** — el hallazgo que cierra el carril playlist |
| `scratch/lane_matrix_04/literals/*.txt` | las 3 cadenas reales de la lista (277/344/348 chars) |
| `scratch/lane_matrix_04/test_720p25.ts` | clip TS 720p25 usado como ítem |
| `scratch/lane_matrix_04/run_vlc_*.ps1` | los arneses reproducibles |

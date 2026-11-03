# 01 — Codec / HDR / Dolby Vision: qué es REAL, qué es POSIBLE y qué es MENTIRA

**Ciclo:** REA · entregable 01 · investigación pura (sin código, sin VPS, sin tocar `_vps_stage/**`).
**Fecha:** 2026-10-27. **Entregable escrito:** solo en `docs/rea/`.
**Objetivo:** separar lo verificable de lo que suena bien en un pitch.

### Cómo leer cada fila (etiqueta de evidencia)

| Etiqueta | Significado |
|---|---|
| **MEDIDO** | Ejecutado en esta máquina (Windows, `ffmpeg 8.0.1-full_build`, GPU Intel UHD, **sin mpv**) o dato medido en el VPS y registrado en el repo. |
| **DOC** | Afirmado por documentación oficial del proyecto/norma (URL en la fila). |
| **NV** | No verificado en esta sesión (no se ejecutó, no se descargó, o la página no devolvió cuerpo). |
| **NOT_RUN** | No se puede medir aquí por definición (requiere el VPS, un GPU, un TV, o contenido DV real). |

**Niveles:** `REAL` = funciona hoy y está documentado/medido · `POSIBLE` = técnicamente viable con prerrequisitos concretos, no medido aquí · `IMPOSIBLE` = no puede funcionar en el entorno indicado · `FALSO` = afirmación que suena a tecnología y no lo es.

---

## 0. Resumen ejecutivo (5 líneas)

1. La cadena **FFmpeg + libplacebo** es real y de alta calidad, pero **exige GPU** (Vulkan 1.2 / GL 3.0 / D3D11 FL 9_1) — [libplacebo README](https://raw.githubusercontent.com/haasn/libplacebo/master/README.md).
2. `zscale`/`colorspace` son **CPU y precisas** (8/10/12 bpc; zscale "better results at all bit depths") — [trac.ffmpeg.org/wiki/colorspace](https://trac.ffmpeg.org/wiki/colorspace).
3. Los **prescalers por shader no inventan detalle**: corrigen/realzan sobre lo que ya hay; viven en el **player GPU**, no en un VPS headless.
4. **Dolby Vision real = RPU + bitstream DV + licencia**. Generar un RPU "inverso" desde SDR **no es DV** (`FALSO`), y publicarlo como DV es exactamente el tipo de mentira que el repo prohíbe.
5. En el VPS actual (**3 cores AMD EPYC, sin GPU**) el vídeo 4K por software ya **no es tiempo real**: 1080p→4K = **8-9 s/segmento** (medido en el repo) → el motor cae a *passthrough*.

---

## 1. Cadena FFmpeg + libplacebo / mpv

| técnica | nivel | evidencia | prerrequisitos | riesgo | fuente |
|---|---|---|---|---|---|
| `zscale` (libzimg): resize + colorspace + profundidad de bits en float | REAL | **MEDIDO** presente y `p/t/m` disponibles en ffmpeg 8.0.1 | libzimg en el build (`--enable-libzimg`) | coste CPU; en 4K por software puede no ser tiempo real | [ffmpeg-filters#zscale](https://ffmpeg.org/ffmpeg-filters.html#zscale) · [trac colorspace](https://trac.ffmpeg.org/wiki/colorspace) |
| `colorspace`: conversión YUV→YUV con gamma+primarias | REAL | **MEDIDO** presente; **DOC**: 8/10/12 bpc, corrige primarias, `fast=1` desactiva corrección | CPU (SIMD x86); no convierte YUV↔RGB | `fast=1` = deriva de color; `colormatrix` (8 bpc) da "horrible quality" en 10/12 bpc | [ffmpeg-filters#colorspace](https://ffmpeg.org/ffmpeg-filters.html#colorspace) · [trac colorspace](https://trac.ffmpeg.org/wiki/colorspace) |
| `tonemap` (HDR→SDR por CPU) | REAL | **MEDIDO** 7 curvas: `none, linear, gamma, clip, reinhard, hable, mobius` (0..6) | cadena `zscale` + `tonemap` + `zscale` de vuelta | **NO implementa BT.2390**; sin `desat`/`peak` correctos → colores lavados | [ffmpeg-filters#tonemap](https://ffmpeg.org/ffmpeg-filters.html#tonemap) |
| `libplacebo` (filtro FFmpeg): tone-mapping dinámico + gamut + deband + scaling | POSIBLE (REAL con GPU) | **MEDIDO** filtro presente y `tonemapping` 0..11 incl. `bt.2390 = 4 (ITU-R BT.2390 EETF)`, `st2094-40/10`, `spline`, `reinhard`, `mobius`, `hable`; `peak_detect` default on | **GPU**: Vulkan 1.2 / OpenGL 3.0 / D3D11 FL 9_1 (libplacebo README) | sin GPU no hay path útil: la interfaz "dummy" de libplacebo **no soporta shaders** | [ffmpeg-filters#libplacebo](https://ffmpeg.org/ffmpeg-filters.html#libplacebo) · [libplacebo README](https://raw.githubusercontent.com/haasn/libplacebo/master/README.md) |
| `vo=gpu-next` de mpv (libplacebo como renderer) | POSIBLE | **DOC** (mpv manual); **NOT_RUN**: mpv no está instalado en esta máquina | mpv ≥0.38 + GPU | requiere el player en el device; no aplica a players nativos (TiviMate/OTT) | [mpv manual](https://mpv.io/manual/master/#options-tone-mapping) |
| Tone-mapping dinámico "de verdad" (histograma por escena, scene-cut, exposición) | REAL con GPU | **DOC**: libplacebo lo lista como feature propia | GPU + decoder con side data HDR | "dinámico" exige metadata por frame; si el bitstream no la trae, es estático | [libplacebo README](https://raw.githubusercontent.com/haasn/libplacebo/master/README.md) |
| `tonemap` de FFmpeg == BT.2390 | **FALSO** | **MEDIDO**: las 7 curvas de `tonemap` no incluyen BT.2390; BT.2390 sólo aparece en `libplacebo` (`tonemapping=bt.2390`) | — | pitch típico: "uso BT.2390" con el filtro equivocado | [ffmpeg-filters#tonemap](https://ffmpeg.org/ffmpeg-filters.html#tonemap) · [ffmpeg-filters#libplacebo](https://ffmpeg.org/ffmpeg-filters.html#libplacebo) |

---

## 2. Upscaling por shaders (FSRCNNX, SSimSuperRes, KrigBilateral, Anime4K)

| técnica | nivel | evidencia | prerrequisitos | riesgo | fuente |
|---|---|---|---|---|---|
| **Anime4K** (GLSL, real-time) | REAL (sólo anime 1080p nativo) | **DOC**: "real-time anime upscaling/denoising"; "optimized for **native 1080p anime**"; "**not** optimized for downscaled 720p/480p/SD"; "not replacement for SRGANs" | player GPU (mpv/MPC/Plex) o port; Vega64 para variantes `UL` | sobre contenido real/deportes o 720p: artefactos; no recupera información perdida | [Anime4K README](https://raw.githubusercontent.com/bloc97/Anime4K/master/README.md) |
| **SSimSuperRes** | REAL (corrección, no resolución nueva) | **DOC**: "make corrections to the image upscaled by mpv built-in scaler (removes ringing, restores original sharpness)" | mpv + GPU; `--glsl-shader` | no inventa detalle: sólo corrige el ringing del scaler; sobre fuente ya blanda no hay milagro | [mpv User-Scripts §User Shaders](https://raw.githubusercontent.com/wiki/mpv-player/mpv/User-Scripts.md) |
| **KrigBilateral** ("Krig") | REAL (chroma) | **DOC**: "Chroma scaler that uses luma information for high quality upscaling" | mpv + GPU | mejora **croma**, no resolución; en 4:2:0 de origen pobre el límite es el muestreo | [mpv User-Scripts §User Shaders](https://raw.githubusercontent.com/wiki/mpv-player/mpv/User-Scripts.md) |
| **RAVU / ravu-lite / ravu-zoom** | REAL | **DOC**: prescalers inspirados en RAISR; `ravu-zoom` upscalera a ratio arbitrario pero "much slower" | mpv (gather/compute shaders); GPU moderna | `-ar` (anti-ringing) es lo recomendado; sin ella, ringing | [mpv-prescalers README](https://raw.githubusercontent.com/bjin/mpv-prescalers/master/README.md) |
| **FSRCNNX** (shader GLSL derivado de FSRCNN) | REAL (GPU, no en VPS) | **DOC**: libplacebo admite shaders custom "RAVU, FSRCNNX, Anime4K"; el repo de origen es **entrenamiento** TensorFlow (TF-GPU/CUDA) | GPU; shader en el player | puede **alucinar** textura/detalle y añadir halos; no hay verdad de referencia | [libplacebo README](https://raw.githubusercontent.com/haasn/libplacebo/master/README.md) · [FSRCNN-TensorFlow README](https://raw.githubusercontent.com/igv/FSRCNN-TensorFlow/master/README.md) |
| "Un shader convierte 1080p en 4K real" | **FALSO** | **DOC**: Anime4K advierte que re-encodear a 4K es irreversible y "lost information is lost"; SSim sólo corrige ringing | — | vender "4K real" desde un shader = fake-4K | [Anime4K README](https://raw.githubusercontent.com/bloc97/Anime4K/master/README.md) |

---

## 3. Real-ESRGAN-ncnn-vulkan (repo oficial)

| técnica | nivel | evidencia | prerrequisitos | riesgo | fuente |
|---|---|---|---|---|---|
| Super-resolución neuronal por imagen (CLI) | REAL | **DOC**: CLI `-i input.jpg -o output.png`, `-s 2/3/4`, modelos `realesr-animevideov3`, `realesrgan-x4plus(-anime)` | **GPU Vulkan** (ncnn), drivers actualizados; `-t tile-size` para bajar VRAM | lista de TODO oficial incluye "**Some PCs will output black images**" | [Real-ESRGAN-ncnn-vulkan README](https://raw.githubusercontent.com/xinntao/Real-ESRGAN-ncnn-vulkan/master/README.md) |
| "Vídeo en tiempo real" con esta herramienta | POSIBLE sólo con pipeline propio | **NV/NOT_RUN**: el README documenta entrada/salida **de imagen o directorio**, no vídeo, stdin ni timestamps; no publica fps | habría que extraer frames, inferir, reencodear | sin timestamps → desincronización A/V; coste por frame; no es un filtro de player | [Real-ESRGAN-ncnn-vulkan README](https://raw.githubusercontent.com/xinntao/Real-ESRGAN-ncnn-vulkan/master/README.md) |
| Correrlo en el VPS (2 GB, sin GPU) | IMPOSIBLE | **NV** en el VPS; **DOC**: requiere dispositivo Vulkan | GPU + drivers | CPU-only: no hay backend documentado en ese repo | [ncnn/Vulkan req.](https://raw.githubusercontent.com/xinntao/Real-ESRGAN-ncnn-vulkan/master/README.md) |
| "IA que reconstruye el detalle real perdido" | FALSO (como garantía) | **DOC**: es *blind super-resolution* entrenada con datos sintéticos (paper ICCVW 2021); reconstruye plausible, no verdadero | — | confundir "se ve mejor" con "es el original" | [paper](https://arxiv.org/abs/2107.10833) |

---

## 4. Dolby Vision real vs imitación

| técnica | nivel | evidencia | prerrequisitos | riesgo | fuente |
|---|---|---|---|---|---|
| **DV Profile 5** (single-layer, **sin** base HDR10 compatible) | REAL (como stream de proveedor) | **DOC**: libplacebo soporta "Profile 5 conversion to HDR/PQ or SDR ... and reshaping"; dovi_tool tiene `-m 3` "Converts profile 5 to 8.1" ⇒ P5 **exige** conversión/reshaping, no es un HDR10 plano | RPU real + decoder/player DV-capaz | en players sin DV: sin tone-map/reshaping correcto → verde/magenta o negro | [libplacebo README](https://raw.githubusercontent.com/haasn/libplacebo/master/README.md) · [dovi_tool README](https://raw.githubusercontent.com/quietvoid/dovi_tool/main/README.md) |
| **DV Profile 8.1** (RPU 8.1 sobre base layer compatible) | REAL | **DOC**: dovi_tool `-m 2` "Converts the RPU to be profile 8.1 compatible (removes luma/chroma mapping for profile 7 FEL)" | BL + RPU real | declarar 8.1 sin RPU = sólo HDR10 con etiqueta DV | [dovi_tool README](https://raw.githubusercontent.com/quietvoid/dovi_tool/main/README.md) |
| **RPU real** (extraer/injectar) con `dovi_tool` | REAL (procesa lo que existe) | **MEDIDO por DOC**: subcomandos `extract-rpu`, `inject-rpu`, `convert`, `demux`, `mux`; `extract-rpu` soporta **profiles 4, 5, 7, 8** | bitstream HEVC con RPU | tocar RPU sin entender CM rompe trims por escena | [dovi_tool README](https://raw.githubusercontent.com/quietvoid/dovi_tool/main/README.md) |
| **HDR10+ real** con `hdr10plus_tool` | REAL | **DOC**: `extract`, `inject`, `remove`, `plot`, `editor`; valida conformidad de perfil | HEVC + metadata HDR10+ ya presente | HDR10+ ≠ DV: no comparte RPU ni CM | [hdr10plus_tool README](https://raw.githubusercontent.com/quietvoid/hdr10plus_tool/main/README.md) |
| **Generar RPU DV** desde XML de CM (CMv2.9/CMv4.0), HDR10+ o medición madVR | REAL, pero **con fuente HDR** | **DOC**: `dovi_tool generate` toma XML CM o JSON+HDR10+/madVR; los niveles L1 derivan de esa medición | master HDR + herramienta de medición/CM | un RPU generado desde una fuente pobre produce trims falsos | [dovi_tool README](https://raw.githubusercontent.com/quietvoid/dovi_tool/main/README.md) |
| **Licencia/CM de Dolby** para DV "de verdad" | REAL (requisito legal) | **DOC**: el programa exige solicitud, contrato con fee inicial, entrega de herramientas, **testing y aprobación** del producto | contrato Dolby + herramientas + certificación | usar marca DV sin licencia = infracción | [Dolby Professional — Getting licensed](https://professional.dolby.com/licensing/) |
| **"Inverse Dolby Vision" desde SDR** (fabricar RPU sobre un master SDR y llamarlo DV) | **FALSO** | **DOC**: todas las vías de `dovi_tool generate` parten de XML CM, HDR10+ o medición **de un master HDR**; el flujo DV asume PQ/reshaping, no SDR→DV | — (no existe la vía) | produce metadata DV que ningún decoder valida como DV; si se declara `dvh1` en la lista = mentira al player (pantalla negra/spinner) | [dovi_tool README](https://raw.githubusercontent.com/quietvoid/dovi_tool/main/README.md) · [Dolby licensing](https://professional.dolby.com/licensing/) |
| "DV Profile 5/8.1 se puede *declarar* sin RPU y funciona" | **FALSO** | **DOC**: el flujo DV es RPU-céntrico (`inject-rpu` necesario para que el decoder lo lea) | RPU | es el caso ya medido en el repo: `hvc1`/`dvh1` sobre AVC nativo = pantallazo negro, revertido (repo, MEDIDO) | [dovi_tool README](https://raw.githubusercontent.com/quietvoid/dovi_tool/main/README.md) |

---

## 5. Tone mapping SDR→HDR: (a) en el display vs (b) re-encode en el edge

| técnica | nivel | evidencia | prerrequisitos | riesgo | fuente |
|---|---|---|---|---|---|
| (a) **Enhancement en display/TV** (el panel o el SoC hace el trabajo) | REAL | **MEDIDO en el repo (VPS)**: "el realce visual REAL lo da (a) el manifest fortificado → el TV activa su modo HDR/DV, (b) el **AI-SR/AI-PQ del hardware del TV**" | panel/SoC que lo implemente; metadata correcta en el manifest | depende del device; en un panel SDR barato no hay enhancement | `docs/manifestos/OMEGA_WORKING_FLOW_MANIFESTO_SNAPSHOT.md:230` + [libplacebo README](https://raw.githubusercontent.com/haasn/libplacebo/master/README.md) |
| Declarar `VIDEO-RANGE=PQ` para que el display active HDR (metadata) | POSIBLE (hint, no píxeles) | **MEDIDO en el repo**: con daemon/TV el hint activa el modo; **sin** daemon y sobre SDR puede dar color shift (caveat aceptado por el propietario). `VIDEO-RANGE` es atributo de `EXT-X-STREAM-INF` de la 2ª edición de HLS, no del RFC 8216 original | display HDR + player que honre el atributo | sobre SDR real: color shift / negro (riesgo ya documentado en el repo) | `CLAUDE.md` §"VIDEO-RANGE=PQ Incondicional" + [RFC 8216 §4.4.6.2 (atributos STREAM-INF)](https://www.rfc-editor.org/rfc/rfc8216) |
| (b) **Re-encode SDR→HDR en el edge** (tone mapping inverso real) | IMPOSIBLE en este VPS | **MEDIDO en el repo**: 1080p→4K = **8-9 s/segmento** (timeout 8 s) → passthrough; `processed=2, passthrough=1` | GPU o CPU con margen; encoder HW; y aun así es **transcode** (degrada) | rompe FREEZELESS, multiplica CPU, rompe ABR/caché | `docs/manifestos/OMEGA_WORKING_FLOW_MANIFESTO_SNAPSHOT.md:226-229` + [libplacebo HW req.](https://raw.githubusercontent.com/haasn/libplacebo/master/README.md) |
| **Inverse tone mapping** como *feature* de librería (`libplacebo`: `inverse_tonemapping`) | REAL como algoritmo | **MEDIDO** en ffmpeg 8.0.1: `inverse_tonemapping <boolean>` (default false) en el filtro `libplacebo` | GPU | expandir rango no crea información: amplifica ruido/banding; no equivale a master HDR | [ffmpeg-filters#libplacebo](https://ffmpeg.org/ffmpeg-filters.html#libplacebo) |
| BT.2390 como norma del EETF ("knee" de tone mapping HDR→SDR) | REAL (documentado) | **DOC/NV**: norma ITU-R BT.2390; la página no devolvió cuerpo en este fetch. Implementación concreta: `libplacebo tonemapping=bt.2390` (**MEDIDO**) | implementación conforme | BT.2390 define el EETF HDR→SDR; **no** define "inventar HDR desde SDR" | [ITU-R BT.2390](https://www.itu.int/rec/R-REC-BT.2390/en) · [ffmpeg-filters#libplacebo](https://ffmpeg.org/ffmpeg-filters.html#libplacebo) |
| "SDR→HDR por `hdr_conversion_mode` de Android" | **FALSO** | **MEDIDO en el repo (2026-06-17, Fire TV mt8696)**: `1`=PASSTHROUGH, `2`=SYSTEM (rechazado), `3`=FORCE; con SDR la salida queda `dataspace=UNKNOWN` con 1, 2 **o** 3 | — | es la mentira técnica que el repo ya corrigió; no repetirla en un pitch | `CLAUDE.md` §"CORRECCIÓN TÉCNICA (2026-06-17)" + [libplacebo README](https://raw.githubusercontent.com/haasn/libplacebo/master/README.md) |

---

## 6. Límite físico del VPS actual (2 GB RAM, sin GPU)

Datos del repo (medidos en el VPS `178.156.147.234`, host `ubuntu-2gb-ash-1`): "**física en 3 cores AMD EPYC sin GPU**".

| técnica | nivel | evidencia | prerrequisitos que faltan | riesgo | fuente |
|---|---|---|---|---|---|
| Manifest/playlist rewrite (LuaJIT) | REAL | **MEDIDO (repo)**: "vuela de verdad (µs)" | ninguno | ninguno relevante | `docs/manifestos/OMEGA_WORKING_FLOW_MANIFESTO_SNAPSHOT.md:227` |
| Upscale 720p→1080p por software | POSIBLE (no tiempo real) | **MEDIDO (repo)**: 2.7 s por segmento ✅ | CPU (hay 3 cores) | 2.7 s por segmento es margen mínimo; cualquier pico = passthrough | `…:229` |
| Realce 1080p x264 | POSIBLE (no tiempo real) | **MEDIDO (repo)**: 3.3 s por segmento ✅ | CPU | reencoda = pérdida generacional; sube CPU y latencia | `…:229` |
| Upscale **4K HEVC** por software | IMPOSIBLE (en esta caja) | **MEDIDO (repo)**: 1080p→4K = **8-9 s/segmento** > timeout 8 s → passthrough | GPU / encoder HW inexistentes | es exactamente el fallback que ya ocurre: no mejora píxeles | `…:228` |
| Filtro `libplacebo` / shaders GLSL / Vulkan | IMPOSIBLE | **DOC**: libplacebo exige Vulkan 1.2 / GL 3.0 / D3D11 FL 9_1 | GPU física + drivers | pedirlo en este VPS es vender humo | [libplacebo README](https://raw.githubusercontent.com/haasn/libplacebo/master/README.md) |
| Real-ESRGAN-ncnn-vulkan | IMPOSIBLE | **DOC**: backend ncnn/Vulkan | GPU | — | [Real-ESRGAN-ncnn-vulkan README](https://raw.githubusercontent.com/xinntao/Real-ESRGAN-ncnn-vulkan/master/README.md) |
| DV/HDR *authoring* (RPU, CM) | IMPOSIBLE (legal y técnico) | **DOC**: requiere herramientas+contrato Dolby y testing | licencia Dolby + master HDR | fabricar DV = mentira al player | [Dolby licensing](https://professional.dolby.com/licensing/) · [dovi_tool](https://raw.githubusercontent.com/quietvoid/dovi_tool/main/README.md) |
| `free -h` / `nproc` / `lspci` del VPS | **NOT_RUN** | no se accedió al VPS en este entregable; "2 GB" proviene del **nombre del host** (`ubuntu-2gb-ash-1`) y de la doctrina, no de una medición de RAM en esta sesión | acceso read-only al VPS | no citar "2 GB" como medido sin `free -h` | `docs/manifestos/VPS_REALITY_MEASURED_2026-10-25.md:9` |

---

## 7. Qué se puede mejorar SOLO con metadata, sin píxeles

Todo lo siguiente cambia **cómo el device interpreta** el stream; **no** toca el bitstream ni gasta CPU de vídeo en el VPS.

| # | Mejora por metadata | Qué hace de verdad | Límite honesto | fuente |
|---|---|---|---|---|
| 1 | **Selección/reordenamiento de variantes** (elegir la mejor REAL del master) | el player recibe la variante superior que el proveedor ya sirve | si el proveedor no la sirve, no existe | [RFC 8216 (master playlist)](https://www.rfc-editor.org/rfc/rfc8216) |
| 2 | **`CODECS=` / `RESOLUTION=` / `FRAME-RATE=` correctos** | init de decoder correcto y ABR sano | declarar un codec que el decoder no soporta = freeze (ya medido en el repo) | [RFC 8216 §4.4.6.2](https://www.rfc-editor.org/rfc/rfc8216) |
| 3 | **`VIDEO-RANGE` + CICP** (`COLOR-PRIMARIES`/`TRANSFER`/`MATRIX`) | hace que el display/TV entre en modo HDR | **no** convierte SDR en HDR (ver §5) | [libplacebo README](https://raw.githubusercontent.com/haasn/libplacebo/master/README.md) |
| 4 | **Passthrough de DV/HDR10+ reales** si el proveedor los sirve | el TV hace su propio tone-mapping con su hardware | sin RPU/SEI reales no hay DV/HDR10+ que pasar | [dovi_tool](https://raw.githubusercontent.com/quietvoid/dovi_tool/main/README.md) · [hdr10plus_tool](https://raw.githubusercontent.com/quietvoid/hdr10plus_tool/main/README.md) |
| 5 | **Audio passthrough** (E-AC3/AC-3/Atmos) | el AVR decodifica; no se reencoda | depende de la cadena del player | [ffmpeg-filters](https://ffmpeg.org/ffmpeg-filters.html) |
| 6 | **AI-SR / AI-PQ del SoC comandado por settings** (MediaTek/Amlogic) | **el device** post-procesa el frame decodificado (cualquier codec, SDR incluido) | el VPS **manda settings**, no píxeles; si el SoC no lo expone, no hay nada | `CLAUDE.md` §corrección 2026-06-17 + [libplacebo README](https://raw.githubusercontent.com/haasn/libplacebo/master/README.md) |
| 7 | **Buffer/ABR/QoE** (caché, timeouts, red) | menos rebuffer, arranque más rápido | no mejora la imagen, mejora la continuidad | [mpv manual](https://mpv.io/manual/master/#options-tone-mapping) |

**Regla de oro del entregable:** si una propuesta **no** encaja en las filas 1-7, entonces pretende mejorar píxeles ⇒ en este VPS es `IMPOSIBLE`, y si se anuncia como DV/HDR "generado", es `FALSO`.

---

## 8. Lista negra (no proponer, no documentar como real)

| Propuesta | Por qué NO |
|---|---|
| "Inverse Dolby Vision desde SDR" | `FALSO`: no existe vía DV desde SDR; el flujo DV parte de master HDR + CM/RPU ([dovi_tool](https://raw.githubusercontent.com/quietvoid/dovi_tool/main/README.md)) |
| "DV Profile 5/8.1 generado en el VPS" | `IMPOSIBLE`: sin GPU, sin licencia Dolby, sin master HDR ([Dolby licensing](https://professional.dolby.com/licensing/)) |
| "`SUPPLEMENTAL-CODECS=lcev.1.1.1`" | `FALSO`: LCEVC inventado; prohibido por doctrina del repo |
| "Upscaling 4K en tiempo real por software en el VPS" | `IMPOSIBLE`: 8-9 s/segmento medido (repo) |
| "`tonemap` de FFmpeg = BT.2390" | `FALSO` medido: BT.2390 sólo en `libplacebo` ([ffmpeg-filters](https://ffmpeg.org/ffmpeg-filters.html#libplacebo)) |
| "Shader que convierte 1080p en 4K real" | `FALSO`: "lost information is lost" ([Anime4K](https://raw.githubusercontent.com/bloc97/Anime4K/master/README.md)) |

---

## 9. Huecos y NOT_RUN de este entregable

- **NOT_RUN**: no se ejecutó ningún encode/tonemap real (ni 1 frame). Todos los tiempos citados son **los ya medidos en el repo**, no nuevos.
- **NOT_RUN**: no se accedió al VPS. `nproc`/`free -h`/`lspci`/`nvidia-smi` sin medir; "2 GB" = nombre de host + doctrina.
- **NOT_RUN**: `mpv` no está instalado en esta máquina → todo lo de `vo=gpu-next`/`--tone-mapping` es **DOC**, no medido.
- **NV**: cuerpo de la página ITU-R BT.2390 no devuelto (se citó la norma, no su texto).
- **NV**: no se probó ningún archivo DV real (P5/P8.1): la sección 4 es documental, no medida.
- **NV**: fps/latencia de Real-ESRGAN sobre vídeo: el README no los publica.
- **HUECO**: el repo no tiene (en lo revisado) un medidor de nits/CLL/FALL; cualquier cifra de brillo sería inventada.

## 10. Fuentes (todas consultadas en esta sesión salvo donde se marca NV)

1. https://trac.ffmpeg.org/wiki/colorspace — **fetch OK**
2. https://ffmpeg.org/ffmpeg-filters.html#zscale · #colorspace · #tonemap · #libplacebo — doc canónica (filtros verificados por **`ffmpeg -h filter=`** local)
3. https://raw.githubusercontent.com/haasn/libplacebo/master/README.md — **fetch OK**
4. https://mpv.io/manual/master/#options-tone-mapping — doc (mpv **no instalado**: NV local)
5. https://raw.githubusercontent.com/wiki/mpv-player/mpv/User-Scripts.md — **fetch OK** (descripciones de SSimSuperRes/Krig/Anime4K)
6. https://raw.githubusercontent.com/bjin/mpv-prescalers/master/README.md — **fetch OK**
7. https://raw.githubusercontent.com/igv/FSRCNN-TensorFlow/master/README.md — **fetch OK**
8. https://raw.githubusercontent.com/bloc97/Anime4K/master/README.md — **fetch OK**
9. https://raw.githubusercontent.com/xinntao/Real-ESRGAN-ncnn-vulkan/master/README.md — **fetch OK**
10. https://arxiv.org/abs/2107.10833 — paper Real-ESRGAN (citado en el README; PDF no descargado: NV)
11. https://raw.githubusercontent.com/quietvoid/dovi_tool/main/README.md — **fetch OK**
12. https://raw.githubusercontent.com/quietvoid/hdr10plus_tool/main/README.md — **fetch OK**
13. https://professional.dolby.com/licensing/ — **fetch OK**
14. https://www.itu.int/rec/R-REC-BT.2390/en — HTTP 200 pero **cuerpo vacío** (NV)
15. Repo (mediciones del VPS, no URLs): `docs/manifestos/OMEGA_WORKING_FLOW_MANIFESTO_SNAPSHOT.md:226-230`; `docs/manifestos/VPS_REALITY_MEASURED_2026-10-25.md:9`; `CLAUDE.md` §2026-06-17.

**Medido en esta máquina:** `ffmpeg version 8.0.1-full_build-www.gyan.dev` (`--enable-libplacebo --enable-libzimg --enable-vulkan`), GPU `Intel(R) UHD Graphics`, **sin mpv**. Filtros verificados: `libplacebo`, `zscale`, `colorspace`, `tonemap` (+ `*_opencl`, `*_vaapi`, `nlmeans_vulkan`).

# LEY CRYSTAL 6K MAX ENHANCEMENT

**Estado:** OBLIGATORIA  
**Vigencia:** 2026-11-01  
**Complementa:** `CRYSTAL_4K_ENHANCEMENT_LAW.md` y `ANTI_DEGRADATION_LAW.md`

## Artículo 1 — Búsqueda obligatoria

Toda fuente 4K debe evaluarse para llegar a **6K UHD Crystal** con la mejor técnica disponible, actual o futura:

```text
remux nativo
AI super-resolution
neural upscale
Lanczos / NGU / ESRGAN / RIFE
VPP del SoC
HDR sintético de display
tone mapping
grain synthesis
LCEVC enhancement
AV1 / HEVC Main10
4K→6K
4K→8K
frame interpolation
metadata de enhancement
```

No se permite decir “ya es 4K, no hay nada que hacer”.

## Artículo 2 — Orden de ataque

```text
1. REMUX NATIVO (sin recomprimir)
2. VPP / DISPLAY ENHANCEMENT
3. UPSCALING 4K→6K si hay capacidad
4. UPSCALING 4K→8K si hay capacidad
5. SYNTHETIC DISPLAY ENHANCEMENT / “fake” de display
```

Cada paso debe medirse. Si no hay capacidad, se documenta y se conserva el 4K nativo.

## Artículo 3 — 6K

Objetivo:

```text
6144x3456 (6K UHD)
```

Modos:

```text
CRYSTAL_6K_REMUX
CRYSTAL_6K_UPSCALE
CRYSTAL_6K_AI
CRYSTAL_6K_DISPLAY
CRYSTAL_6K_OPT_IN
```

El 6K real requiere encoder/GPU. En un VPS de 3 vCPU:

```text
se ofrece opt-in
se documenta que no es tiempo real
NO se activa por defecto
NO se degrada el 4K
```

## Artículo 4 — “Fake” permitido

“Fake” significa:

```text
realce sintético de display
metadata que activa el upscaler del TV/SoC
sharpening / NR / HDR sintético
```

No significa:

```text
declarar que una fuente 1080p es 6K real
declarar píxeles que no existen como fuente
```

La fuente se declara real; el enhancement se declara como enhancement.

## Artículo 5 — Prohibiciones

```text
NO bajar 4K a FHD/HD/SD
NO bajar HEVC a H.264 para ocultar fallo
NO bajar HDR a SDR para ocultar fallo
NO recortar bitrate de vídeo
NO eliminar audio
NO declarar 6K/8K falso como fuente
```

## Artículo 6 — 6K opt-in

El JIT puede ofrecer:

```text
APE_6K=1
TARGET=6144x3456
```

Pero solo si:

```text
hay capacidad de encoder
el tiempo real se mantiene
no se degrada el 4K
el device lo soporta
```

## Artículo 7 — Gate

```bash
node tools/check_crystal_6k_law.js
```

Debe pasar antes de tocar listas/JIT/players.

## Artículo 8 — Verdad

```text
4K nativo + VPP > 6K falso
6K real + HEVC Main10 > 4K nativo
Nunca 6K falso declarado como fuente real
```

## IMPLEMENTACION 2026-11-05 — variantes P*.5

**Estado: EN PRODUCCION.** Verificado contra el endpoint real.

| Perfil base | Variante 6K | Bitrate | Tecnica | Tecnica de origen |
|---|---|---|---|---|
| P0 | **P0.5** | 80 Mbps | `8k_downsample_lanczos_0.75` | 7680x4320 |
| P1 | **P1.5** | 60 Mbps | `4k_upscale_ai_sr_1.5x` | 3840x2160 |
| P2 | **P2.5** | 45 Mbps | `4k_upscale_shader_lanczos_1.5x` | 3840x2160 |
| P3 | **P3.5** | 35 Mbps | `fhd_upscale_ai_sr_3x` | 1920x1080 |
| P4 | **P4.5** | 30 Mbps | `hd_upscale_ai_sr_4.5x` | 1280x720 |
| P5 | **P5.5** | 25 Mbps | `sd_upscale_ai_sr_6.75x` | 854x480 |

**Resolucion:** 5760x3240 (18.662.400 px). **Codec:** `hvc1.2.4.L183.B0`. **60 fps · 4:2:0 · 10-bit · HDR10+ · bt2020nc · smpte2084.**

**Nivel verificado** contra ITU-T H.265 Tabla A.8: 5760x3240@60 = 1.119.744.000 samples/s;
el techo de L183 (Level 6.1) es 2.139.095.040. Margen 1.91x. `L186` (Level 6.2) seria 8K@120 y
declararia una capacidad que el perfil no tiene.

**Activacion:** por defecto en los seis perfiles, sin importar la resolucion que reporte el
device. Se apaga con `?ape6k=0`. Condicionarlo a `max_w >= 5760` dejaba el 6K sin servir en casi
todo el parque, que es lo contrario de emular.

**Articulo 4 respetado:** cada canal lleva
`#EXT-X-APE-CRYSTAL-6K-TRUTH:DECLARED_ENHANCEMENT;NOT_SOURCE;DOWNSCALE_FORBIDDEN`.
El 6K nunca se declara como fuente real. Un device que no escale muestra la fuente en su
resolucion; el 4K sigue debajo intacto.

**Verificacion en produccion (2026-11-05):**

```
P0 -> P0.5  5760x3240  hvc1.2.4.L183.B0  VERDAD OK
P1 -> P1.5  5760x3240  hvc1.2.4.L183.B0  VERDAD OK
P2 -> P2.5  5760x3240  hvc1.2.4.L183.B0  VERDAD OK
P3 -> P3.5  5760x3240  hvc1.2.4.L183.B0  VERDAD OK
P4 -> P4.5  5760x3240  hvc1.2.4.L183.B0  VERDAD OK
P5 -> P5.5  5760x3240  hvc1.2.4.L183.B0  VERDAD OK
==> 6/6
```

**Sin regresion:** con `?ape6k=0` los seis vuelven a `3840x2160` con `hvc1.2.4.L153.B0`,
exactamente como antes.

**Fichero de calibracion:** `artifacts/LAB_CALIBRATED_FINAL_v24.0.0-6K.json` — 12 perfiles
(6 base + 6 emulados). **P0-P5 byte a byte identicos al v23.** Generado por
`tools/lab/build_lab_6k.js`, que fotografia los base antes de construir y aborta si uno cambia.

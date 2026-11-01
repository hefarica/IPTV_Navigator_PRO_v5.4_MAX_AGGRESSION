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

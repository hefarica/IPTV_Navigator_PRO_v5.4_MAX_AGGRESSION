# LEY CRYSTAL 4K UHD — MEJORA OBLIGATORIA

**Estado:** OBLIGATORIA  
**Vigencia:** 2026-11-01  
**Complementa:** `ANTI_DEGRADATION_LAW.md`

## Artículo 1 — Mejorar, no degradar

La ley anti-degradación prohíbe bajar 4K. Esta ley **obliga a intentar mejorarlo**.

Nunca se cumple una incidencia dejando el 4K “tal cual” si existe una técnica legítima para mejorar la percepción.

## Artículo 2 — Orden de técnicas

Toda fuente 4K debe evaluarse en este orden:

```text
1. REMUX NATIVO
   -c copy, sin recomprimir
   HEVC Main10/HDR intacto

2. VPP / DISPLAY ENHANCEMENT
   AI-SR del SoC, sharpen, NR, HDR-PQ, tone mapping
   metadata dirigida al display

3. UPSCALING REAL
   4K → 8K con Lanczos/neural SOLO si hay capacidad
   de encoder/GPU y no rompe tiempo real

4. SYNTHETIC DISPLAY ENHANCEMENT
   realce sintético/“fake” de display para percepción 4K+
   permitido como enhancement, nunca como resolución fuente falsa
```

No se permite saltar directamente a degradar.

## Artículo 3 — “Fake” permitido

“Fake” significa **realce sintético de display**:

```text
sharpening
contraste local
NR temporal
HDR sintético
8K display hint
VPP AI
```

No significa declarar:

```text
que una fuente 1080p es 4K
que un TS SDR es PQ real
que un bitrate inexistente existe
```

La fuente se declara real; el enhancement se declara como enhancement.

## Artículo 4 — 4K nativo

Si la fuente es 3840x2160 HEVC Main10 HDR10:

```text
el vídeo debe seguir siendo 3840x2160 HEVC Main10 HDR10
```

Se puede añadir:

```text
#EXT-X-APE-CRYSTAL-UHD:ENABLED=true
#EXT-X-APE-CRYSTAL-MODE:NATIVE_4K_HDR
#EXT-X-APE-CRYSTAL-ENHANCE:4K_PLUS
#EXT-X-APE-CRYSTAL-VPP:DEVICE_DISPLAY;POLICY=MAX_IMAGE_FIRST
#EXT-X-APE-CRYSTAL-UPSCALE:NATIVE|SOURCE
```

## Artículo 5 — Cuándo no se puede

Si no hay hardware/encoder suficiente:

```text
se documenta
se conserva el 4K nativo
se aplica VPP de display o metadata
NO se miente
NO se baja a FHD
```

## Artículo 6 — Prohibición de conformarse

Un agente que diga “ya es 4K, no hay nada que mejorar” viola esta ley.

Debe comprobar:

```text
¿se puede remux?
¿se puede VPP?
¿se puede upscaling?
¿se puede realce sintético?
¿se puede mejorar color/HDR?
¿se puede mejorar GOP/buffer?
```

## Artículo 7 — Gate

```bash
node tools/check_crystal_4k_law.js
```

Debe pasar antes de modificar cualquier lista/JIT/player.

## Artículo 8 — Verdad

```text
enhenced_4k != fake_source_4k
```

El tag `ENHANCE:4K_PLUS` describe el tratamiento de display; no convierte una fuente FHD en 4K real.

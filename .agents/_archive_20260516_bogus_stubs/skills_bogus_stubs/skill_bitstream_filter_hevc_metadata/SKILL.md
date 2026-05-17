---
name: Skill_Bitstream_Filter_HEVC_Metadata
description: Inyección Criptográfica del Espacio Rec.2020 y VUI (Video Usability Info) en bitstream nativo.
category: Bitstream Filter / HDR Colorimetry
---
# 1. Teoría de Compresión y Anomalía
El televisor (incluso OLEDs y QLEDs avanzados) a menudo falla al activar el módulo de "Color Vívido HDR" porque el proveedor iptv satelital eliminó las banderas VUI (Video Usability Information) del SPS del bitstream. Si las cabeceras HEVC carecen de la directiva de Espacio de Color `bt2020nc` y primarias `bt2020`, el decodificador realiza "Tone Mapping" destructivo hacia SDR (Rec.709), resultando en los repudiados grises lavados.

# 2. Directiva de Ejecución (Código / Inyección)
La solución estricta es forzar el parcheado binario VUI al instante usando `hevc_metadata` BSF, reparando el NAL Unit al aire.

```bash
# Comando de Reparación de Metadata HEVC (God-Tier Color):
-bsf:v hevc_metadata=colour_primaries=9:transfer_characteristics=16:matrix_coefficients=9
```
*Codificación:* 9 es BT.2020 primarias; 16 es SMPTE ST 2084 (HDR10 PQ Transfer); 9 es bt2020nc (Non-Constant Luminance).

# 3. Flanco de Orquestación
Al obligar a la matrix ST 2084 y BT.2020 de forma imperativa, la orden combinada de VLC `#EXTVLCOPT:color-primaries=bt2020` actúa de ancla cliente/servidor. La Shield TV, al ver ambas validaciones de VUI, dispara los píxeles OLED a máxima luminiscencia (5000 nits simulados) eliminando cualquier percepción pixelada de las gradaciones.

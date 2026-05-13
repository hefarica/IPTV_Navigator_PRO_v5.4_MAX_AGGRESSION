---
name: Skill_Dynamic_Contrast_Enhancer
description: Uso de luma keying `scale=out_color_matrix` para contraste hiper dinámico antes de codificar la matriz fMP4 final.
category: Metadata Injection
---
# 1. Teoría de Compresión y Anomalía
Un stream HEVC es un archivo pasivo. Si un Frame original carece de contraste (ej. sombras mal grabadas en un partido nublado), un decoder 4K lo reproducirá tal cual (opaco). 

# 2. Directiva de Ejecución (Código / Inyección)
Se ajusta la directriz de Escalamiento Inverso Hable Luma. En un entorno VPS donde inyectamos VUI, indicamos las características de transferencia en código BSF para forzar a la pantalla a activar su "Contraste Dinámico L2" interno.

```bash
# Matrix Inyección OBLIGATORIA BSF HEVC:
-bsf:v hevc_metadata=matrix_coefficients=9:video_full_range_flag=1
```

# 3. Flanco de Orquestación
(Doctrina Omni-God-Tier). Shield TV detecta `video_full_range_flag=1` + HDR10. Automáticamente, el panel TCL en "Micro dimming Alto" procesará las áreas oscuras localmente cuadro por cuadro. La latencia se mantiene en CMAF, pero los atributos visuales compiten de tú a tú con un feed Ultra HD 4:4:4 de 80 Dólares por evento.

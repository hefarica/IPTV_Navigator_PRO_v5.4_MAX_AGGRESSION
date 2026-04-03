---
name: Skill_Color_Primaries_BT2020_Fallback_Block
description: Evitar fallback a BT.709 eliminando o sobrescribiendo cabeceras heréticas SMPTE-170M (NTSC SD).
category: Colorimetry
---
# 1. Teoría de Compresión y Anomalía
Algunos orígenes satelitales arrastran cabeceras VUI viejas (smpte170m) provenientes de un upscaler barato en el proveedor. Si ExoPlayer ve `-color_primaries smpte170m` (NTSC Antiguo) en una señal 4K, su decodificador de hardware colapsa visualmente: aplica estiramiento de color asqueroso, mostrando caras rojas y pasto radioactivo amarillo.

# 2. Directiva de Ejecución (Código / Inyección)
Se debe barrer toda la herencia de color vieja usando un filtro de reinscripción o la directiva BSF antes mencionada, pero con enfoque en *destruir* los tags `smpte170m` y `bt470bg`.

```bash
# Bloqueo de NTSC/PAL Fallback:
-color_primaries bt2020 -colorspace bt2020nc -color_trc smpte2084
-bsf:v h264_metadata=colour_primaries=9:transfer_characteristics=16:matrix_coefficients=9
```

# 3. Flanco de Orquestación
La **Doctrina del Cristal Roto** impone que si el proveedor original nos da un falso 4K con colores NTSC, nosotros no lo reproducimos pasivamente: nosotros *forzamos* a la Shield TV a reconstruir la malla cromática en BT.2020 usando Inteligencia Artificial L2, mitigando el error de orígen al sobreescribir la orden.

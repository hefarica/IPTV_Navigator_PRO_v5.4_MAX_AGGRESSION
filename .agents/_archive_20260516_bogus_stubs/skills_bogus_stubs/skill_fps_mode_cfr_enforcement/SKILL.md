---
name: Skill_FPS_Mode_CFR_Enforcement
description: Forzar Constant Frame Rate (CFR) `-fps_mode cfr` para asentar un ancla matemática en deportes.
category: FFmpeg Global
---
# 1. Teoría de Compresión y Anomalía
Un stream HLS genérico suele venir con la bandera `-fps_mode vfr` (Variable Frame Rate) para ahorrar ancho de banda cuando la cámara enfoca al director técnico quieto. El problema es que al girar bruscamente al delantero corriendo, el reproductor debe "acelerar" de 12fps a 60fps de forma reactiva, causando el desgarro visual o el Micro-Stutter infernal.

# 2. Directiva de Ejecución (Código / Inyección)
Prohibimos estrictamente los FPS variables en perfiles deportivos (P1 y P0). Exigimos un Constant Frame rate.

```bash
# Inserción de Cadencia Paramétrica Inmutable:
-fps_mode cfr -r 60 
# O bien 50 para feed europeo: -r 50
```

# 3. Flanco de Orquestación
Con CFR, el reproductor OTT Navigator y el motor ExoPlayer L3 calculan el renderizado del VRR (Variable Refresh Rate del televisor moderno) con predictibilidad de reloj suizo. Como el espacio entre cada I-Frame y P-Frame es matemáticamente constante, el Motion-Blur o estelas producidas por aceleraciones irregulares de hardware se extinguen del todo.

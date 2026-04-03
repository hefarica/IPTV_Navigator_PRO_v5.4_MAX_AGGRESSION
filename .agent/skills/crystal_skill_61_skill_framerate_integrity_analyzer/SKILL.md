---
name: Skill_FrameRate_Integrity_Analyzer
description: Detective de judder, comparando metadata vs necesidad física. Evalúa la deficiencia temporal en deportes rápidos M3U8.
category: Diagnostics / Framerate
---
# 1. Teoría de Compresión y Anomalía
El "Judder" es el salto o tirón molesto en los paneos de cámara. A ocurre cuando el proveedor envía 25 o 29.97 fps entrelazados (1080i), pero el reproductor lee el M3U8 y asume que es progresivo, o cuando la bandera FPS del metadata difiere del flujo real (Variable Frame Rate errático).

# 2. Directiva de Ejecución (Código / Inyección)
Se obliga la extracción real del conteo de cuadros desde el bitstream y se re-inyecta estrictamente de forma constante (CFR).

```bash
# Inyección CFR (Constant Frame Rate) Forzada:
-fps_mode cfr -r 60000/1001 
```
*(Para señales norteamericanas NTSC base, transformadas forzosamente a ~59.94 fps progresivos, llenando los vacíos duplicando matemáticamente y evitar asimetría temporal).*

# 3. Flanco de Orquestación
(Doctrina Pura del Deporte). Al exigir `cfr` al muxer emparejado con un framerate duro de 60 FPS, el hardware de la Shield TV Pro jamás tiene que adivinar si el siguiente cuadro se retrasó 1 ms. Sabe que hay un cuadro cada 16.6 ms exactos. Esto acaba con la "pelota temblorosa" y le da vida a la Inteligencia Temporal extrema L2.

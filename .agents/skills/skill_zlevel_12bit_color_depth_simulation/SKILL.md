---
name: Skill_ZLevel_12Bit_Color_Depth_Simulation
description: Forzado a perfil agresivo 12-bit usando yuv444p12le o yuv420p12le para eliminar cualquier asomo de posterización de imagen.
category: Colorimetry
---
# 1. Teoría de Compresión y Anomalía
Un stream a 8-bits tiene 16.7 millones de colores; a primera vista es mucho, pero inútil para la curva de la luz del sol sobre una chancha de pasto quemada por los focos HID del estadio y el sombreamiento extremo (Gradients). Un panel moderno descifra 10 y 12 bits (más de 68 mil millones de gradaciones), dándole a las luces un desvanecimiento analógico perfecto. Si pasas un stream degradado, obtienes posterización.

# 2. Directiva de Ejecución (Código / Inyección)
Pasamos el escalamiento y la inferencia FFmpeg a los niveles más extremos de profundidad binaria, asumiendo codificación de 12-bits, independientemente de que el panel final baje por Dithering (error diffusion).

```bash
# Escalado de gradiente 12-bit (Requiere -strict -2 en algunos build):
-pix_fmt yuv420p12le -profile:v main12
# o mediante filtro de video si hace passthrough:
-vf format=yuv420p12le
```

# 3. Flanco de Orquestación
Esta habilidad es una simulación activa L2. Nvidia Shield TV con AI-Upscaling utiliza la profundidad adicional de nuestro contenedor ficticio 12-bit (`yuv420p12le`) para trazar las inferencias de red neuronal del escalamiento. Los rostros en zoom o el balón de fútbol no tendrán píxeles intermedios borrosos, sino transiciones hiper-suaves emulando Dolby Vision puro.

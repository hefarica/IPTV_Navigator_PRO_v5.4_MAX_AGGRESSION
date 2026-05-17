---
name: Skill_FFmpeg_Color_Range_Full_Force
description: Forzado agresivo de Rango de Color Completo de PC 0-255 destruyendo el "Rango de TV o Limitado" (16-235).
category: FFmpeg Pipeline
---
# 1. Teoría de Compresión y Anomalía
Desde la era del CRT, las señales de televisión limitan los negros a valor 16 (Gris oscuro) y los blancos a 235 (Gris muy claro) porque los cátodos se quemaban a 0 o 255. Transmitir IPTV HD en el año 2026 con un rango TV resulta en "negros lavados" típicos de YouTube a baja calidad.

# 2. Directiva de Ejecución (Código / Inyección)
Se sobrescribe y se obliga al decodificador a usar todo el espectro RGB y Lógico YUV de 0 a 255. Ningún hardware ni reproductor degradado está a salvo de nuestra agresión cromática, y el NAL de FFmpeg debe contener esta directriz.

```bash
# Range Full Override FFmpeg:
-color_range tv -vf scale=in_range=tv:out_range=full -color_range pc
# Flag alternativo: -color_range jpeg
```
Debemos enmascarar a M3U8 para forzar el cliente:
`#EXTVLCOPT:video-visual=full-range`

# 3. Flanco de Orquestación
Cualquier intento del proveedor de limitar los colores del pasto o el estadio por un encoder de baja calidad es destruido. Aplicando rango completo (PC/Full), el OLED apaga los píxeles (cero real) y el cielo nublado en un deporte se ilumina a máxima luminancia (255 de Luma). La imagen no se lava jamás, eliminando ese velo blanco-lechoso que afecta a los servicios convencionales.

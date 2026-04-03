---
name: Skill_SSIM_Predictor
description: Clasificador de Similitud Estructural (SSIM) para retención de texturas (césped, agua).
category: Deep Analytics
---
# 1. Teoría de Compresión y Anomalía
VMAF o SSIM miden cuánto se parece el video decodificado al master no comprimido (YUV4:4:4). Un Encoder del ISP pudo poner 15Mbps al canal de deportes, pero usó presets `-preset ultrafast` en H.264, por lo cual los 15 Megabytes están llenos de información redundante, y el SSIM cae, destruyendo la textura de la ropa y el agua de lluvia.

# 2. Directiva de Ejecución (Código / Inyección)
(Doctrina de Extrapolación). Puesto que no podemos decodificar cada pixel en el Resolver L7 en tiempo real para no fundir el VPS, inferimos el preset leyendo los metadatos ocultos SEI (Si los hay) u obligando a FFmpeg a hacer un remuxing de prueba de 2 segundos.

```bash
# Prueba SSIM al Vapor (Auditoría Forense):
ffmpeg -i [STREM] -vf ssim -f null -
```

# 3. Flanco de Orquestación
Si el equipo SRE audita la lista de orígenes VIP e identifica un origen de ESPN o TNT con score bajo de SSIM (a pesar de tener el BW alto), lo expulsa. Así nos aseguramos de no alimentar ancho de banda masivo L7 a un flujo que ya viene "roto" desde el proveedor pirata H.264. Filtrado quirúrgico.

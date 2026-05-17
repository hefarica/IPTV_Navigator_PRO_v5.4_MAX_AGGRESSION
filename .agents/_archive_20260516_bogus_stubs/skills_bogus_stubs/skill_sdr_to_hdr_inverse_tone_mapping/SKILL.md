---
name: Skill_SDR_to_HDR_Inverse_Tone_Mapping
description: Emulación de HDR mediante Zscale (Inverse Tone Mapping) quemando luminancia para inyectar vida artificial a orígenes SDR (Falso F4K).
category: FFmpeg Filter Magic
---
# 1. Teoría de Compresión y Anomalía
Existen canales "piscineros" 1080p SDR que no podemos rescatar pidiéndole color al ISP porque no existe. Pero transmitir SDR en un ecosistema de "Showroom OLED" rompe la QoE perceptual. Necesitamos inyectar energía artificialmente expandiendo la matriz RGB a 10-bits.

# 2. Directiva de Ejecución (Código / Inyección)
Si el servidor VPS tiene suficiente potencia GPU/CPU o si preconfiguramos un relay, usamos la librería Zscale para Inverse Tone Mapping (`smpte2084`).

```bash
# Expansión Cuántica Zscale (SDR a Falso HDR):
-vf zscale=t=linear,tonemap=hable:desat=0,zscale=p=bt2020:t=smpte2084:m=bt2020nc
-c:v libx265 -x265-params colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc
```
*Primero convierte color a linear, mapea usando Hable (o mobius), y reescribe sobre el espacio SMPTE2084 HDR.*

# 3. Flanco de Orquestación
Aplicar magia negra a nivel de servidor asegura que el cliente NUNCA vea la etiqueta SDR. Al ver HDR activo (con el iconito saltando en la esquina del televisor Samsung/LG), la TV desbloquea su backlight a 100%. "El peor HD ahora parece un cristal re-imaginado por GPU".

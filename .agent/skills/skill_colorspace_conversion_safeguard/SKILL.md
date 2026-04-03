---
name: Skill_Colorspace_Conversion_Safeguard
description: Protección inyectada contra conversiones accidentales del V-Filter a SRGB / BT.709 y degenerado del bitstream.
category: Colorimetry
---
# 1. Teoría de Compresión y Anomalía
Cuando activamos escalado algorítmico, FFmpeg asume arbitrariamente, para compatibilidad, que queremos convertir el espacio de color a BT.709. Es fatal. Ocurre cuando forzamos el deinterlace o los upscalers de LAN. Transmuta nuestro amado y cuidadosamente forjado paquete DCI-P3 / BT.2020 a "colores de monitor viejo de Windows (sRGB)".

# 2. Directiva de Ejecución (Código / Inyección)
Añadimos un "candado de color" (Safeguard) en todos los flujos de filtro donde ocurran BWDIF o Lanczos, declarando explícitamente en el pipe `--colorspace`:

```bash
# Candado en V-Filter Strict:
-vf "scale=out_color_matrix=bt2020nc:out_h_chr_pos=0:out_v_chr_pos=0" 
# En combinación con:
-color_primaries bt2020 -colorspace bt2020nc -color_trc smpte2084
```
Todo cálculo de "Scale" exige que la matriz saliente y entrante respeten la primacía atómica original del WCG.

# 3. Flanco de Orquestación
Esta protección garantiza el mandato "Sin Dañar Nada". Logramos la Menor Latencia con CMAF Chunking (Lote 1), Mejor Estabilidad con anulación del Nagle, y ahora con la Fase de Supremacía Cromática blindada (Skills 21-30), tenemos la garantía matemática de los mejores metadatos para color jamás ensamblados. El Shield TV Pro sólo es el ejecutor visual de un plan pre-establecido impenetrable.

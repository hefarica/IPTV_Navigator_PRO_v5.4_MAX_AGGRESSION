---
name: Skill_HEVC_SPS_PPS_Inband
description: Inyección en Banda de SPS/PPS para CMAF/fMP4, garantizando Decodificación Instantánea.
category: FFmpeg Global
---
# 1. Teoría de Compresión y Anomalía
HEVC (H.265) requiere parámetros de conjunto de secuencia (SPS) y parámetros de conjunto de imágenes (PPS) para encender la GPU e indicarle cómo renderizar el cuadro inicial (tamaño, colorimetría, rec2020). En fMP4, suelen estar solo en el `init.mp4`. Si un cliente pierde la señal unos segundos y vuelve a recibir *chunks* puros en medio de un partido de deporte, la GPU se asfixiará esperando la cabecera.

# 2. Directiva de Ejecución (Código / Inyección)
Replicamos las cabeceras paramétricas de configuración de Video a lo largo del flujo forzándolos en cada fotograma llave (Keyframe / IDR).

```bash
# Directiva de Inyección En-Banda:
-vbsf dump_extra=freq=keyframe
```
*O en configuraciones libx265 / HEVC hardware re-encodes (si aplicaran)*: `-x265-params splt=1`

# 3. Flanco de Orquestación
(Jugada Real CMAF). Al incluir la información crítica del HEVC (SPS/PPS y VPS) *in-band* con la frecuencia de cuadros llave (cada chunk), el reproductor puede conectarse e iniciar el decodificado *instantáneamente* en cualquier segmento del live stream. Menor latencia, estabilidad blindada.

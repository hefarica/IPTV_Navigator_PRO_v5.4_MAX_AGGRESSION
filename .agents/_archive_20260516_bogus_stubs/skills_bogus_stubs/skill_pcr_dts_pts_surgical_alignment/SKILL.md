---
name: Skill_PCR_DTS_PTS_Surgical_Alignment
description: Alineación Quirúrgica del PCR y Corrección de Deriva Temporal DTS/PTS para Erradicar Desincronizaciones de Audio/Video.
category: Resolver L7 / FFmpeg Muxer
---
# 1. Teoría de Compresión y Anomalía
En señales de IPTV crudas originadas de enlaces satelitales DVB, el Program Clock Reference (PCR) invariablemente sufre jitter. Cuando las marcas de tiempo de presentación (PTS) y las marcas de tiempo de decodificación (DTS) se desfasan por más de 12ms, el hardware L2 del reproductor activa drops o duplicaciones de fotogramas, resultando en saltos de imagen catastróficos.

# 2. Directiva de Ejecución (Código / Inyección)
Se debe imponer un puente de corrección temporal estricto que ignora las anomalías de PCR de origen y empaqueta las marcas bajo una cadencia algorítmica perfecta:

```bash
# Reparación DTS/PTS y Override PCR:
-copyts -muxdelay 0 -muxpreload 0
```
Adicionalmente, se emplea `-bsf:v h264_metadata=tick_rate=60000/1001` (o HEVC análogo) para limpiar drásticamente inconsistencias de frame rate del bitstream encapsulado.

# 3. Flanco de Orquestación
Con esta habilidad activa en el proxy backend (`cmaf_worker.php` o resolver Nginx), los flujos de "Deportes 60FPS" llegan al decoder de hardware del Shield TV con el espaciado exacto asíncrono. El audio bypass ATMOS confía en esta pureza de PTS para no generar crujidos.

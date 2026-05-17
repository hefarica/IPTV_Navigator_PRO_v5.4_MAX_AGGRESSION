---
name: Skill_Zero_Latency_CMAF_Ingest
description: Configuración Ingesta FFmpeg para Latencia Cero (-fflags nobuffer).
category: FFmpeg Input Options
---
# 1. Teoría de Compresión y Anomalía
El demuxer de entrada de FFmpeg es cauteloso; aplica un sondeo (`probe`) de la señal de red almacenando hasta 5MB de video en RAM antes de decidir "qué formato es" e iniciar el transporte CMAF. Ese análisis genera 1-3 segundos de latencia de estabilización. Es inaceptable en flujos conocidos.

# 2. Directiva de Ejecución (Código / Inyección)
Asumiendo que *sabemos exactamente* lo que entra (gracias al sistema APE SSOT y a la telemetría), desactivamos la fase de análisis de buffer.

```bash
# Inyección Input Anti-Latencia:
-fflags +nobuffer+genpts -analyzeduration 0 -probesize 32
-i [URL_ORIGEN]
```
*   `nobuffer`: Desarma el buffer de entrada en el analizador de formato.
*   `genpts`: Genera timestamps faltantes (crítico para estabilidad "sin dañar nada").

# 3. Flanco de Orquestación
El inicio de canal (Zapping speed) se reduce drásticamente. Al combinar `-fflags nobuffer` en la entrada con el Chunked Transfer Encoding en la salida, logramos un canal de paso casi transparente. CMAF real de latencia extrema sin buffering para el usuario en Shield/VLC.

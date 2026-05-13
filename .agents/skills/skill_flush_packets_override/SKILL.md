---
name: Skill_Flush_Packets_Override
description: Anulación de Buffer Flush IO para Flujos Deportivos Extremos, minimizando el I/O disk thrashing en servidores VPS.
category: FFmpeg Global Options
---
# 1. Teoría de Compresión y Anomalía
FFmpeg por defecto flushea (vuelca a disco/pipe) los paquetes después de que se completa el entrelazado. En operaciones C to C o de PHP Piping (`cURL pipe:0`), esto satura la tubería interna de Linux (Disk I/O y buffers anónimos) causando retrasos esporádicos en el streaming en vivo. Un retraso de 10ms aquí significa juddering (tirones) visuales en la pista de fútbol.

# 2. Directiva de Ejecución (Código / Inyección)
Para forzar al multiplexor en vivo (Live Streaming) a inyectar al instante cada paquete sin esperar la optimización del chunking interno, usamos la siguiente Bandera Anárquica:

```bash
# Inyección global antes de la entrada y salida:
-flush_packets 1 -fflags +flush_packets -max_delay 0
```
*(Nota: -flush_packets normalmente aplica en flujos fMP4, forzando la publicación del MOOF instantáneamente)*

# 3. Flanco de Orquestación
Para que el PHP Proxy y el **Shield TV** naveguen el pipeline sin estancarse, el dato debe fluir libremente. El Buffer God-Tier del lado cliente (X-Network-Caching: 80,000) se encarga de mitigar cortes de red. Del lado del servidor de ingesta, exigimos cero latencia (volcado instantáneo); el IO de Linux debe permanecer libre, erradicando los temblores micro-temporales.

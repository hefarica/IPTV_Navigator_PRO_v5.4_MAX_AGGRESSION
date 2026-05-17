---
name: Skill_CMAF_Chunk_Duration_Sync
description: Integridad del Group of Pictures (GOP) Acoplado al Durational Offset. Mantiene el Boundary del CMAF.
category: Muxer / M3U8 Generator
---
# 1. Teoría de Compresión y Anomalía
Una causa cardinal del desenfoque o "borrón" (wash-out) en el césped a través de transiciones de escenas rápídas en deportes, es la desalineación de la partición de un nodo HLS respecto al límite del GOP (fotograma I o IDR). Cortar un archivo en un fotograma P o B destruye en cascada la reconstrucción del cuadro BWDIF, lavando los colores mientras ExoPlayer espera el siguiente Cuadro Clave.

# 2. Directiva de Ejecución (Código / Inyección)
Se obliga la cadencia del fotograma clave. Si el flujo es de 60 FPS, `-g 60` significa un cuadro clave cada segundo. La orden absoluta del Chunk de salida (ej. 2 segundos) debe ser múltiplo exacto del GOP.

```bash
# Reescritura para un chunk de 2 Segundos @ 60 FPS:
-g 120 -keyint_min 120 -sc_threshold 0 -hls_time 2 -hls_flags independent_segments
```
Inyectar el tag en el M3U8 resultante (`#EXT-X-INDEPENDENT-SEGMENTS`) comunica al reproductor que puede empezar el decodificado instantáneamente sin leer los chunks adyacentes.

# 3. Flanco de Orquestación
Con fragmentos independientes puros, el ABR (Adaptive Bitrate) y los escaladores algorítmicos DLSS/IA reaccionan en 10ms. La predicción de imagen de la NVIDIA Shield TV se aferra al `-g 120` inalterable para pre-generar los colores vivos, garantizando la meta Crystal UHD.

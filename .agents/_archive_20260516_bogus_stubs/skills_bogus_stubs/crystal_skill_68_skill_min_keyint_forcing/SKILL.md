---
name: Skill_Min_Keyint_Forcing
description: Keyint minimo alineado matemáticamente a la Chunk Duration CMAF para evitar caídas en el ABR (Adaptive Bitrate Switch).
category: FFmpeg Rate Control
---
# 1. Teoría de Compresión y Anomalía
Al usar Chunked Transfer CMAF sub-milisegundo para latencia cero, FFmpeg debe poder fragmentar donde le plazca, EXCEPTO que si fragmenta y no hay un Keyframe cerca (`keyint_min` muy alto), el chunk fMP4 inicial no podrá decodificarse solo. Eso obliga al Shield TV a esperar al siguiente chunk, destruyendo la latencia y añadiendo buffering reactivo.

# 2. Directiva de Ejecución (Código / Inyección)
Forzamos que la distancia MÍNIMA permitida para un keyframe sea bajísima (Ej: 10 fotogramas a 60fps), dándole al fragmentador libavformat la total jurisdicción matemática para inyectar cortes limpios compatibles con CMAF donde el ancho de banda lo requiera.

```bash
# Sincrona de Keyframes Cortos a Fragmentación:
-g 60 -keyint_min 10 -force_key_frames "expr:gte(t,n_forced*1)" 
```
*(Forzando un keyframe independientemente estructural, obligatoriamente cada 1.0 segundos por matemática explicatoria)*.

# 3. Flanco de Orquestación
Con el ABR anulado, y la inyección garantizada de un keyframe cada 1.0 segundos sincronizado al chunk fMP4 y la red Chunked, la Shield TV (o TiviMate) nunca espera por decodificación. Cuando inicia L2 en la TV y ExoPlayer solicita el buffer, si aterriza a la mitad del partido, espera como máximo 1.0 segundos (latencia física ineludible) y abre la iluminación UHD de 5000 nits. La espera de carga del círculo azul en pantalla se erradica.

---
name: Skill_FFmpeg_Thread_Queue_Anarchy
description: Sobrecarga Masiva de la Cola de Subprocesos para evadir latencias del Input Pipe.
category: FFmpeg Global Options
---
# 1. Teoría de Compresión y Anomalía
El error fatídico `"Thread message queue blocking; consider raising the thread_queue_size option"` aparece silenciosamente cuando el hardware demuxer no logra asimilar la furia de los 300 Mbps inyectados. Como resultado, FFmpeg empieza a desechar paquetes I-Frames críticos, lo cual desata una cascada de artefactos "glitch" verdes o corrupciones grises que persisten hasta el siguiente fotograma llave.

# 2. Directiva de Ejecución (Código / Inyección)
Se debe violar el predeterminado de protección de RAM de Linux e incrementar exponencialmente el `thread_queue_size`. La Doctrina exige tolerancia cero a los drops de Input.

```bash
# Inyección Nuclear de Buffer de Input:
-thread_queue_size 16384 -i [STREAM_URL] -max_muxing_queue_size 9999
```
*   `thread_queue_size 16384`: Permite al demuxer alojar 16 mil paquetes en la cola antes de bloquear el hilo de red TCP.
*   `max_muxing_queue_size 9999`: Detiene el temido `"Too many packets buffered for output stream 0:1"`.

# 3. Flanco de Orquestación
Al usar una memoria tan amplia para los mensajes y variables del hilo de audio/video, el procesador del VPS asimila la ingesta extrema sin importar la velocidad de decodificación. Cuando enviamos desde el Proxy/Resolver con "Bitrate Anarchy" hacia los ISP comerciales, aseguramos que la falla *nunca* estará del lado asimilador de nuestro stack de red. Cero caídas algorítmicas, imagen prístina.

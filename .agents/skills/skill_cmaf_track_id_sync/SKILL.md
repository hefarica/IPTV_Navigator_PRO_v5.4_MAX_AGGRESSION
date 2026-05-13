---
name: Skill_CMAF_Track_ID_Sync
description: Sincronización Estricta de Track IDs en CMAF para Prevenir Reseteos del Hardware Player.
category: FFmpeg Muxer
---
# 1. Teoría de Compresión y Anomalía
En transmisiones adaptativas o conversiones al vuelo, si el `track_id` dentro del contenedor fMP4 para la pista de video cambia (por ejemplo, de id 1 a id 2), el decoder por hardware ExoPlayer asume abruptamente que "el video original murió y hay un track nuevo". Esto fuerza un *Decoder Reset*, deteniendo la GPU, causando un pantallazo negro de 1 segundo (buffering forzado).

# 2. Directiva de Ejecución (Código / Inyección)
Para no dañar nada y asegurar la mayor estabilidad, fijamos los Identificadores de Pistas incondicionalmente en la transformación FFmpeg.

```bash
# Inyección de Tracking Inquebrantable:
-map 0:v -map 0:a -streamid 0:1 -streamid 1:2
```
*   `0:v` (El primer mapa, video) SIEMPRE se registra como track 1.
*   `0:a` (El segundo mapa, audio) SIEMPRE se registra como track 2.

# 3. Flanco de Orquestación
Independientemente de la basura que envíe el origen MPEG-TS del ISP, nosotros homologamos un orden atómico estricto en el fMP4/CMAF que enviamos al cliente. La GPU del Shield TV nunca "pierde" el pipeline, lo que nos otorga esa anhelada "mejor estabilidad sin buffering", logrando transiciones invisibles en caso de caídas de red asimétricas.

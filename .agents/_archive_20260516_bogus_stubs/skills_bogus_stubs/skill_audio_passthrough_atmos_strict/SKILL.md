---
name: Skill_Audio_Passthrough_Atmos_Strict
description: Inyección M3U8 para forzar el passthrough crudo de Dolby Atmos/EAC3 al receiver, cero decodificación local.
category: Audio Hardware Exploitation
---
# 1. Teoría de Compresión y Anomalía
Si envías un canal de cine con audio Dolby Digital Plus / Atmos (EAC-3) a 768 Kbps, y la televisión intenta decodificar el audio por su cuenta para pasarlo a estéreo, el CPU de la TV se atraganta, provocando que el VIDEO también pierda fotogramas (desincronización A/V de la muerte). El usuario ve una imagen trabada por culpa del audio.

# 2. Directiva de Ejecución (Código / Inyección)
Se fuerza la declaración de formato crudo en el contenedor M3U8 para que ExoPlayer bloquee el renderizado de software y entregue los datos puros a través del cable HDMI eARC hacia el Home Theater / Soundbar en formato Bitstream (Passthrough).

```javascript
/* Declaración Estricta de CODEC Dolby Atmos en M3U8 Generator: */
`#EXT-X-STREAM-INF:BANDWIDTH=80000000,CODECS="hvc1.2.4.L153.B0, ec-3"`
```
*`ec-3` empuja al decodificador a bloquear cualquier intento de PCM-Conversion.*

# 3. Flanco de Orquestación
(Doctrina de Eficiencia). El reproductor Android ya no "procesa" el sonido, simplemente actúa como una tubería (Passthrough). La CPU de la Shield TV baja de temperatura y se enfoca 100% en el video 4K 12-Bit. Por el cable HDMI viaja el audio puro y la barra de sonido enciende la luz "DOLBY ATMOS". Experiencia inmersiva God-Tier asegurada.

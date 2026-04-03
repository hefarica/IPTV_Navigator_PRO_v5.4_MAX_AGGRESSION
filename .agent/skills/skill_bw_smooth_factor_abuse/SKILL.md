---
name: Skill_BW_Smooth_Factor_Abuse
description: Abusar de `X-BW-Smooth-Factor: 0.01` para estrangular al calculador ABR interno e impedir que el reproductor degrade la calidad.
category: Advanced L7 Headers
---
# 1. Teoría de Compresión y Anomalía
El Adaptative Bitrate (ABR) está diseñado para "ayudar" al espectador: si detecta una caída de ancho de banda por 500ms, rápidamente entra en pánico y envía la pista inferior (240p). El problema es que en IPTV, a menudo el CDN tiene picos de latencia que no representan el ancho de banda real. El cliente cae a calidad basura innecesariamente, lavando toda la imagen por 15 segundos hasta recuperar.

# 2. Directiva de Ejecución (Código / Inyección)
Se inyecta el `X-BW-Smooth-Factor` (Factor de suavizado de ancho de banda). Un valor de 1.0 hace que el reproductor cambie rápido ante cualquier oscilación. Un valor de `0.01` hace que el reproductor sea lento y estúpido al medir caídas, asumiendo que el ancho de banda es infinito y constante.

```javascript
/* Inyección de Resistencia al Escalado Inverso (M3U8 / ExoPlayer): */
`#EXTHTTP:{"X-BW-Smooth-Factor":"0.01"}\n`
```

# 3. Flanco de Orquestación
Con el Smooth Factor en 0.01, ExoPlayer jamás "baja de calidad" a menos que la caída de internet dure más de 45 segundos (tiempo donde el buffer masivo de la Skill 41 cubre la necesidad). Mantenemos la imagen UHD 4:4:4 anclada con clavos (locked quality) y evitamos las horribles resoluciones variables mid-match.

---
name: Skill_Chroma_Smoothing_Bypass
description: Evitar Chroma smoothing en HW ExoPlayer forzando `chroma_I444`, suprimiendo la mezcla borrosa de texturas finas.
category: M3U8 Directives
---
# 1. Teoría de Compresión y Anomalía
Cuando la señal es 4:2:0 YUV, las TVs intentan "suavizar" artificialmente (Chroma Smoothing/Upsampling) el espacio sin color para que no se vea cuadriculado. En patrones hiper finos como las líneas de las camisetas de fútbol o la textura del césped, este suavizado las borronea e induce un parpadeo (Moire effect).

# 2. Directiva de Ejecución (Código / Inyección)
Obligamos a la reproducción de ExoPlayer (vía M3U8 o metadata inband) a usar Chroma 4:4:4. Al detectar 4:4:4, el televisor desactiva su rutina de "Chroma Smoothing" automáticamente porque asume que es una PC Master Race inyectando data completa de monitor de cálculo.

```javascript
/* Cortar el algoritmo de borroneo inyectando: */
`#EXTVLCOPT:video-filter=chroma_I444\n`
```

# 3. Flanco de Orquestación
Al usar el prefiltro de PC y decirle a Shield TV "Tengo todo el cromatismo necesario", el Césped de los deportes en Ultra-HD y FHD se mantendrá dentado y definido (afilado a nivel píxel), en lugar del acostumbrado manchón verde desenfocado que se mueve cuando la cámara hace paneos rápidos. Uso estricto de God-Tier Upscaling.

---
name: Skill_Exo_Tunneling_Mode_Activation
description: Activar ExoPlayer Tunneled Video Playback para eludir el compositor de Android UI y ganar rendimiento 4K.
category: Hardware Layer Evasion
---
# 1. Teoría de Compresión y Anomalía
En dispositivos Android TV típicos, el cuadro decodificado de video viaja al "SurfaceFlinger" (el compositor de la interfaz de usuario de Android) para ser dibujado debajo de los menús (como la barra de volumen o logos). Este paso por el compositor Android limita el video UHD a las capacidades de renderizado de la UI, agregando hasta 3 frames de latencia y causando Jitter en el flujo 4K HDR.

# 2. Directiva de Ejecución (Código / Inyección)
"Tunneled Video Playback" (Reproducción por Túnel) enlaza el Descodificador de Video L2 "literalmente y físicamente" con el subsistema HDMI. El video JAMÁS es tocado por el sistema Android.

```javascript
/* Configuración para inyección en OTT Navigator / ExoPlayer Config: */
// Se usa un tag EXTHTTP oculto para modificar flags del reproductor si está soportado nativamente:
`#EXTHTTP:{\"exo_tunneled_playback\":\"true\"}`
```
*El decodificador se sincroniza directamente al driver de audio usando el Sideband stream.*

# 3. Flanco de Orquestación
(Doctrina de Evasión Absoluta del Intermediario). Al habilitar el Tunneling, la Shield TV funciona como un reproductor de señales de cable puro. La sincronización audio/video se ajusta en el silicio sin interacción del procesador, erradicando los retrasos y salvando 30% de ancho de banda del bus de memoria del dispositivo. Máxima velocidad de representación óptica para deportes extremos.

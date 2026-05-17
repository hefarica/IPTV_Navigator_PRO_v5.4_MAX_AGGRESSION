---
name: Skill_VRR_HDMI21_Tearing_Prevention
description: Inyección M3U8 de framerate paramétrico perfecto para disparar el Match Frame Rate del VRR en Shield TV (HDMI 2.1).
category: M3U8 / L2 Integration
---
# 1. Teoría de Compresión y Anomalía
Un stream HEVC viaja perfecto a 50 FPS (Europa). El cliente (Shield TV) manda la señal HDMI a 60 Hz al panel TCL 4K porque es su default NTSC americano. La pantalla repite matemáticamente 1 cuadro cada X segundos, lo que genera el temido "Telecine Judder" en vivo: la pelota viaja suave pero da un "saltito" horrible cada 2 segundos, mareando al espectador obsesivo.

# 2. Directiva de Ejecución (Código / Inyección)
La Shield TV implementa "Match Frame Rate (Beta)" que obliga al CPU HDMI asincrónico a cambiar el refresco Hz del televisor para igualar al origen (50 FPS = 50Hz reales HDMI). Debemos inyectar una declaración M3U8 absoluta indicando el FRAME-RATE real o el TiviMate / ExoPlayer fallarán el handshake HDMI con la pantalla.

```javascript
/* Inyección de Target Físico FRAME-RATE al Manifiesto (El M3U8 Generator MUST do this): */
`#EXT-X-STREAM-INF:BANDWIDTH=300000000,RESOLUTION=3840x2160,FRAME-RATE=50.000\n`
```

# 3. Flanco de Orquestación
Al inyectar explícitamente `FRAME-RATE=50.000` o `59.940` como un string nativo HLS manifest (y no dejarlo que fluya solo dentro del contenedor), ExoPlayer recibe la advertencia en texto plano antes de siquiera tocar la data IP. OTT Navigator pasa esta orden a Android TV 11 y el proyector o la TV cambia el canal HDMI a 50Hz, creando un paridad física "1 fotograma digital = 1 refresco LED". El judder queda aniquilado matemáticamente.

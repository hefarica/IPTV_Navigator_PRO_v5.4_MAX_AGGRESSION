---
name: Skill_UI_Framerate_Decoupling
description: Instrucciones para desacoplar el renderizado del UI (OTT Navigator) del hilo de video SurfaceView, logrando zapping instantáneo.
category: Hardware Level UX
---
# 1. Teoría de Compresión y Anomalía
Cuando presionas arriba/abajo para cambiar de canal en TiviMate/OTT, la aplicación Android debe redibujar la animación del menú semitransparente simultáneamente decodifica I-Frames 4K de 30MB en paralelo. En cajas chinas, esto revienta ambos. La animación de menú va a 10 fps y el Zapping a negro (Black Screen Time) tarda hasta 8 segundos.

# 2. Directiva de Ejecución (Código / Inyección)
Se aprovecha la renderización "Zero-Copy" del Tunneling (Skill 85) e instruye explícitamente a evitar cualquier superposición alpha costosa usando el `SurfaceView` puro.

```javascript
/* El Generador M3U8 debe evitar meter cabeceras y metadata que ensucie el Manifest, forzando un pase limpio a MediaPlayer: */
// Menos basura de metadatos EXTINF largos = Parsing Sub-Milisegundo UI
`#EXTINF:-1 tvg-id="" tvg-name="" tvg-logo="", [Solomon] F1 4K`
```
*(Manteniendo los tags limpios y omitiendo injecciones de metadatos estáticos masivos durante zappings rápidos en el SSOT)*.

# 3. Flanco de Orquestación
(Doctrina de Eficiencia Front-End). Al separar la "Carga pesada" del Video del "Hilo principal" del UI (pasando el video por HDMI Tunneled, y la lista de canales M3U8 ultra-liviana JSON-Parsed), el usuario siente que su televisor volvió a ser tan rápido como un TV CRT de tubo analógico de los años 90. Clic->Canal Inmediato. El CPU maneja los cuadritos y el menú transparente; el chip Tegra X1 se chupa el video 4K sin parpadear. Fluidez Zapping Atómico.

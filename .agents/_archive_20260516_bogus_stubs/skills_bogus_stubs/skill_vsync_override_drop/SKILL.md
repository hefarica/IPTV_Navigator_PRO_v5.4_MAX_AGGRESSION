---
name: Skill_Vsync_Override_Drop
description: Sobrecargar vsync (`-vsync drop` vs `passthrough`) eliminando fotogramas asimétricos para evitar micro-saltos en transmisiones inestables.
category: Diagnostics / Framerate
---
# 1. Teoría de Compresión y Anomalía
Orígenes de IPTV DACA mal procesados pueden enviar paquetes donde dos fotogramas tienen casi idéntico PTS, lo que indica un duplicado por hardware del proveedor que estropeó la señal. Si FFmpeg los re-multiplexa, la TV intentará procesar dos cuadros en un microsegundo, generando un "Stutter" o pausa agresiva de decodificador (Frame drop masivo).

# 2. Directiva de Ejecución (Código / Inyección)
Instruimos a FFmpeg a anular el passthrough si las matemáticas colapsan. Él DEBE descartar el duplicado sin compasión en beneficio de un CFR (Constant Frame Rate) perfecto.

```bash
# Táctica de Poda Temporal Estricta:
-vsync drop -fps_mode drop
```
O en versiones recientes de ffmpeg/vps:
```bash
-fps_mode cfr -async 1 -vsync 1 
# Si fallan timestamps de origen: 
-af aresample=async=1000  # (Corrige la deriva de audio si forzamos el fps cfr)
```

# 3. Flanco de Orquestación
Doctrina del Cristal Roto: Mejor ignorar un cuadro basura de 16 milisegundos y repetir el anterior manteniendo el sincronismo, que inyectarlo, quebrar a ExoPlayer o VLC L3 C-Core, desfasar el passthrough del sonido ATMOS 5.1 e interrumpir el partido de fútbol. El cerebro del espectador ignora un drop de 16ms, pero NUNCA un fallo estructural de audio/video. La acción rápida en la cancha viaja impecable, y aseguramos mejor estabilidad con cero daño.

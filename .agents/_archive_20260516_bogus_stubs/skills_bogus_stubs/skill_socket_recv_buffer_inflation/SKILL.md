---
name: Skill_Socket_Recv_Buffer_Inflation
description: Inyectar SO_RCVBUF extremo al nivel de kernel socket OS / FFmpeg L4 para aguantar asimetrías extremas en la bajada.
category: Network / L4 OS Tuning
---
# 1. Teoría de Compresión y Anomalía
Si Nginx y PHP funcionan perfectamente bajo proxy-pass pero Linux (el Kernel OS del VPS Antigravity) ahoga la conexión en las capas más bajas de TCP `SO_RCVBUF` y `SO_SNDBUF`, los megabytes explotan y se descartan en el espacio de memoria (Drops en anillo tcp). El resultado es corrupción de fragmentos CMAF puros (Pantallas grises con pixelación al azar).

# 2. Directiva de Ejecución (Código / Inyección)
Comandar a Nginx o FFmpeg o PHP a anular los perfiles genéricos de ventana TCP y utilizar Buffers colosales de Recibo y Envío a nivel Socket TCP (L4).

Para FFmpeg demuxer:
```bash
# Inyección Nivel Socket L4 (Buffer Kernel):
-multiple_requests 1 -bufsize 256M -rtbufsize 2G 
```
*(El uso de `rtbufsize` captura buffers temporales directos).*

# 3. Flanco de Orquestación
(Doctrina de Furia Inyectada L7). FFmpeg y Nginx negocian ventanas gigantes (TCP Window Scaling). Cuando un cuadro I-Frame HEVC requiere 12 megabytes (Ej. Una toma del estadio de fútbol que quema toda la red), el "Socket Inflation" se la traga viva en microsegundos en la cache L4. Esto previene completamente que el CDN o el ISP puedan culpar la sobresaturación y garantiza que esa textura pesada aterrice perfectamente íntegra hacia ExoPlayer/Shield TV.

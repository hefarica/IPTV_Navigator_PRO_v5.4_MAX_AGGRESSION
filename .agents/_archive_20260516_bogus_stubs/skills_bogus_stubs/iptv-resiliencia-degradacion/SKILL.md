---
name: iptv-resiliencia-degradacion
description: Guía de implementación del sistema de resiliencia y cadena de degradación en IPTV. Usar cuando necesites garantizar cero cortes (0 buffering), manejar errores HTTP automáticamente desde la lista, o implementar la cadena de degradación de 7 niveles para asegurar reproducción continua en cualquier red.
---

# IPTV: Resiliencia y Cadena de Degradación

Esta habilidad describe cómo estructurar una lista M3U8 para garantizar que el canal nunca se detenga, incluso frente a caídas de servidor, bloqueos de ISP o conexiones de red inestables.

## 1. Cadena de Degradación de 7 Niveles (Graceful Degradation)

El principio de la degradación elegante es: **"Si el formato preferido falla, degrada automáticamente hasta el nivel más básico que garantice compatibilidad universal."**

En lugar de entregar una sola URL y cruzar los dedos, el Resolver PHP (guiado por el manifest) debe ser capaz de entregar 7 niveles de fallback:

1. **Nivel 1 (God Tier):** CMAF + HEVC + LCEVC Phase 4 (Máxima calidad, menor latencia).
2. **Nivel 2 (Advanced):** HLS fMP4 + HEVC.
3. **Nivel 3 (Standard):** HLS fMP4 + H.264.
4. **Nivel 4 (Legacy):** HLS TS + H.264.
5. **Nivel 5 (Failsafe):** HLS TS + Baseline Profile (Compatible con dispositivos de hace 15 años).
6. **Nivel 6 (Direct):** TS Direct (Sin manifest HLS, flujo continuo).
7. **Nivel 7 (Survival):** HTTP Redirect a un servidor de respaldo o stream de Audio-Only.

### Implementación en el Manifest
Inyectamos las directivas para que el reproductor (y el Córtex JS) sepan que existen estos niveles:
```m3u8
#EXT-X-APE-RESILIENCE:LEVELS=7,STRATEGY=GRACEFUL_DEGRADATION
#EXT-X-APE-FALLBACK-CHAIN:CMAF_HEVC,FMP4_HEVC,FMP4_H264,TS_H264,TS_BASE,TS_DIRECT,AUDIO_ONLY
```

## 2. El Pilar 5: Córtex JS (Recuperación Activa)

No podemos depender solo del reproductor para manejar errores HTTP (400, 401, 403, 405, 429). El "Pilar 5 de la Superioridad del 95%" es un Córtex JavaScript que intercepta las peticiones de red del reproductor web/app.

### Árbol de Decisión Automatizado (<60ms)
- **HTTP 403/407 (Forbidden/Proxy Auth):** Asume bloqueo de ISP. Forzar rotación de User-Agent (Phantom Hydra) y generar nuevo `nonce`.
- **HTTP 429 (Too Many Requests):** Asume rate-limit. Bajar un nivel en la cadena de degradación y cambiar IP de destino (Domain Fronting).
- **HTTP 500/502 (Server Error):** Asume caída de nodo. Cambiar inmediatamente al servidor de respaldo.

## 3. Buffer Nuclear y BBR Hijacking

Para redes inestables (ej. 4G en movimiento), forzamos al reproductor a solicitar el máximo ancho de banda posible de forma agresiva y a mantener un buffer masivo.

### Buffer Nuclear (VLC/ExoPlayer)
```m3u8
#EXTVLCOPT:network-caching=60000
#EXTVLCOPT:live-caching=60000
#EXT-X-APE-BUFFER-NUCLEAR:SIZE=60MB,STRATEGY=AGGRESSIVE_FILL
```

### BBR Hijacking
BBR (Bottleneck Bandwidth and Round-trip propagation time) es un algoritmo de control de congestión de TCP. Obligamos al reproductor a comportarse como si la red fuera perfecta para evitar que reduzca la velocidad de descarga por culpa de un pico de latencia temporal.

```m3u8
#EXT-X-APE-BBR-HIJACK:MODE=AGGRESSIVE,THROTTLE_BYPASS=TRUE
```

## 4. Estrangulamiento de Ancho de Banda

Para destripar cualquier restricción de ISP, el manifest declara intencionalmente un `BANDWIDTH` absurdamente alto. Esto engaña a los algoritmos de QoS del ISP y del router local para que prioricen este tráfico.

```m3u8
#EXT-X-STREAM-INF:BANDWIDTH=80000000,RESOLUTION=3840x2160...
```
*(80,000,000 bps = 80 Mbps, aunque el stream real solo pese 5 Mbps).*

## Resumen de la Estrategia
1. Pedir todo el ancho de banda posible (BBR Hijack + Bandwidth falso).
2. Llenar un buffer masivo en los primeros segundos (Buffer Nuclear).
3. Si la red falla, el Córtex JS intercepta el error en <60ms.
4. El sistema degrada silenciosamente la calidad (7 niveles) sin que el usuario vea la rueda de carga.

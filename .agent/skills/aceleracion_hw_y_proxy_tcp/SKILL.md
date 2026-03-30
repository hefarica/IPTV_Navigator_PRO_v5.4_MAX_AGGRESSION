---
name: Aceleración Hardware, OTT Nav #EXTHTTP y KPTV-Proxy (TCP Multiplex)
description: Implementación algorítmica y orquestación dinámica para decodificación por hardware en ExoPlayer/MediaCodec, inyección profunda de #EXTHTTP JSON nativa para OTT Navigator, proxying TCP Keep-Alive robusto y calibración matemática de búfer (2024).
---

# Aceleración Hardware & Orquestación TCP Proxy (ExoPlayer & OTT Navigator)

Este módulo establece un mandato absoluto sobre el procesamiento en bajo nivel, delegando el peso computacional a las NPUs/GPUs del hardware cliente y ungiendo conexiones de agregación multiplex TCP.

## 1. OTT Navigator y ExoPlayer (HW Offloading)

Para alivianar las cargas introducidas por algoritmos ultra-pesados como BWDIF, el proxy DEBE exigir incondicionalmente a los reproductores que activen MediaCodec de Android y eviten el costoso renderizado por software (`soft_vlc`).

### Directivas VLC / ExoPlayer (`resolve.php` y `resolve_quality.php`)

```nginx
#EXTVLCOPT:avcodec-hw=any
#EXTVLCOPT:codec=hevc,h265,av1,h264
```

* **Justificación**: Al indicar `avcodec-hw=any`, forzamos a OTT Navigator y Tivimate (basado en ExoPlayer) a apoyarse en la decodificación por hardware OMX subyacente del SmartTV/FireStick.

## 2. Inyección JSON `#EXTHTTP` Nativa (M3U8 Generator)

OTT Navigator a partir de 1.6.6.9 soporta directivas JSON densas vía `#EXTHTTP`. El generador frontend lo inyectará de la siguiente forma por cada metadata de canal para configurar User-Agents, multiplexing de flujos adaptativos, y proxies TCP:

```m3u8
#EXTHTTP:{"User-Agent":"OTT Navigator/1.6.9.4","tcp_multiplex_proxy":true,"hw_decode_policy":"force_any"}
```

El objeto de canales (`channels_map.json`) mapeará universalmente el requisito y se acoplará con el resolver backend orgánicamente.

## 3. TCP Multiplex Proxy & Buffer Math 2024

Inspirado por KPTV-Proxy, el servidor VPS no dejará caer canales TCP, sino que forzará un keep-alive robusto en las peticiones HLS contra los orígenes IPTV.
El caché se perfilará matemáticamente en la lógica del PHP:

| Bandwidth Profile    | buffer_ms | network-caching | clock-jitter |
|----------------------|-----------|-----------------|--------------|
| > 50 Mbps (P0/P1)    | >= 35s    | >= 45s (45000)  | Max 80ms     |
| < 50 Mbps (P2/P3)    | >= 25s    | >= 35s (35000)  | Max 50ms     |
| < 10 Mbps (P4/P5)    | >= 10s    | >= 15s (15000)  | Max 30ms     |

Ambos proxies backend (`resolve.php` / `resolve_quality.php`) aplicarán esta matemática automáticamente leyendo el ancho de banda y priorizando directivas HLS:
`#EXTVLCOPT:http-persistent=true`
`#EXTVLCOPT:http-keep-alive=true`

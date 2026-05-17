---
name: "Arquitectura IPTV Indetectable 2026"
description: "Doctrina de evasión DPI, polimorfismo de payload, encapsulación QUIC/SRT y esclavización ExoPlayer para evadir Throttling de ISPs en 2026."
---

# 🧠 Arquitectura IPTV Indetectable y Gobernanza de Flujos (2026)

Esta Skill define los fundamentos absolutos para garantizar una disponibilidad del 100% y calidad cinematográfica (QoE) frente a la saturación de redes y la limitación activa (Throttling) ejecutada por Inspección Profunda de Paquetes (DPI) en ISPs nivel 1.

## 1. Contexto Tecnológico y Amenazas
- **App Shaping / Tunnel Shaping**: DPI identifica el streaming 4K usando análisis heurístico, tamaño de paquetes y ráfagas.
- **Auditoría de Throttling**: Siempre medir el Baseline Diferencial comparando Speedtest vs. Fast.com. Si hay asimetría (>50%), el Throttling está activo.

## 2. Invocación de Ingeniería de Protocolos M3U8
Para evadir estas barreras, los generadores M3U8 (como el Motor APE v18+) **deben** inyectar cabeceras y parámetros que fuercen la disrupción del patrón de tráfico:
- **Traffic Padding / Time Manipulation**: Usado para romper el perfil de ráfaga predecible.
- **Rendition Stripping (Dictator Mode)**: Eliminar todas las variantes SD/FHD del manifiesto. Obligar al reproductor a mantener 4K o fallar sin degradar (Bloqueo ABR).

## 3. Dominio de ExoPlayer y VLC Player-Side
El M3U8 debe dejar de ser descriptivo para volverse **gobernante**:
- **ExoPlayer LoadControl**: Establecer metas como `minBufferMs=15000-30000` y `bufferForPlaybackMs=5000`.
- **Desactivar Deblocking**: Habilitar Bypass de filtros en silicio (H.264 loop deblocking) para liberar ciclos críticos de CPU SoC y pasarlos al desencriptador del Payload polimórfico.
- **VLC Tuning**: Forzar `Referer` y llevar `file-caching` o `network-caching` a `2000ms`.

## 4. Evolución de Canales Edge
- **SRT y Latencia Definida**: $L_{srt} \ge 3 \times RTT$. Baseline global de `2000ms`.
- **LL-HLS Polimórfico**: Integración de Preload-Hints si el servidor perimetral lo soporta y Chunked Transfer en DASH.
- **XOR Shadowsocks / Trojan Wrap**: Mimetizar todo sobre TLS 1.3 bancario (Puerto 443).

## Reglas de Implementación en Código
Siempre que trabajes en `m3u8-typed-arrays-ultimate.js` u orquestador de UI, audita que los parámetros inyectados en la URI (como los User-Agents, o pipings) concuerden con las matrices de evasión de esta Skill a fin de no generar conexiones "huérfanas" no cifradas.

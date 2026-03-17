---
name: Arquitectura de Payload: Token APE 7-Capas (JWT Engine)
description: Reglas sagradas de la conformación matemática del JSON Web Token APE ULTIMATE. Estructura de 7 capas, 12 divisiones de payload y 68 variables protegidas.
---

# 🛸 Arquitectura Master APE JWT (7 Capas x 12 Payloads)

## 🎯 DEFINICIÓN FUNDAMENTAL

La versión final del APE Router Engine en la generación de M3U8 (`V15.1.0-ARCHITECTURE1` y `V16.0.0-ULTIMATE-TYPED-ARRAYS`) asienta a los Tokens de Seguridad como el tejido conector entre Frontend Matemático, Proxy Resolutores en el VPS Backend (resolve.php, stream_probe_server) y la Telemetría de Cliente en Vivo.

Esta interconexión está orquestada sobre **68+ Variables Estructurales** que se bifurcan estrictamente en un diseño estratificado.

## 🧱 LA JERARQUÍA DE INFORMACIÓN (7 CAPAS MANDATORIAS)

Cuando construyas, interpretes, desencriptes (`base64URL`) o inyectes en el generador M3U8 las directivas de JWT, debes respetar esta anatomía irrompible:

* **Capa 1: Autenticación Básica** (`iss`, `iat`, `exp`, `nbf`) → Validez temporal extendida profunda (hasta 32 días in-memory).
* **Capa 2: Seguridad Extrema** (`nonce`, `jti`, `aud`, `sub`) → APE exige prevención de replay attacks (nonces 128 hex), fingerprinting anti-robo y control de audiencias inter-servidores (Origin vs CDN).
* **Capa 3: Información Semántica del Canal** (`chn`, `chn_id`, `chn_catchup`, `chn_epg_id`) → Título, IDs únicos y soporte Flussonic para Timeshift/CatchUP. No modificar arbitrariamente.
* **Capa 4: Perfilado del Dispositivo** (`device_profile P0-P5`, `resolution`, `width/height`, `fps`, `bitrate`) → Alojamiento del escalador jerárquico según target dictado por el `ape-profiles-config`.
* **Capa 5: Memoria & Caché** (`buffer_ms`, `network_cache_ms`, `live_cache_ms`, `max_bandwidth`, `min_bandwidth`) → Estrategia Agresiva/Ultra-Agresiva de buffering.
* **Capa 6: Codificación Dinámica** (`codec_primary`, `codec_priority`, `hdr_support`, `color_depth 10/12`) → HEVC 6.1 string cascade y BT.2020NC space definitions.
* **Capa 7: Optimización y Evasión** (`prefetch_segments`, `prefetch_strategy`, `isp_evasion_level`, `proxy_rotation`) → Evasión ISP a nivel 3, anti-estrangular, descarga predictiva segmentada de LookAhead.

## 🚀 OBLIGACIÓN EN GENERACIÓN

Las 12 categorías que derivan de las capas, se traducen mediante `#EXT-X-APE-` al archivo list M3U8 y `#KODIPROP:` para ser servido a InputStream Adaptive y VLC LibVLC.

Todo agente de código que procese M3U8s, modifique los payloads JWT en `generateM3U8_TypedArrays()` o genere plantillas, NUNCA debe prescindir de una variable vital sin suplir su equivalente físico en el cuerpo del stream M3U8, y NUNCA debe acortar el token a favor de una ruta legacy asumiendo simplificación. Simplificar este token destruye el puente matemático APE y degrada los canales.

---
name: Rotación Dinámica de User Agents (Evasión Extrema ISP)
description: Protocolo de inyección, simulación y evasión que fuerza al generador a usar una base de datos de origen extensa para spoofing de dispositivo.
---

# 🎭 Rotación Dinámica de User Agents (APE Evasion System)

## 📌 FUNDAMENTO TÁCTICO

Las redes (Telefónicas, ISPs, CDNs hostiles) identifican firmas de consumo continuo y aíslan las cabeceras recurrentes que claman reproducir M3U8/TS o actúan como software de IPTV. Si la aplicación y el resolver PHP envían recurrentemente `"OTT Navigator/1.6.8"`, es fácilmente identificado y ahogado/estrangulado (Throttling QoS).

Para activar con éxito la **Capa 7 de Evasión Nivel 3**, IPTV Navigator PRO V4 inyecta un pull gigantesco de **2500+ User-Agents Reales (Mac/Windows/iOS/Android/SmartTV)** en cada consulta de lista y en la firma de tokens por canal.

## ⚒️ DIRECTRICES DE LA HABILIDAD

Todo sistema generador M3U8 (`ApeModuleManager`, `TypedArrays`, etc.) o Proxy PHP que trabaje bajo el ecosistema, debe someterse a la regla:

1. **Uso Exclusivo de Bases Sólidas Múltiples**: Explotar y elegir de la `USER_AGENTS_DATABASE` (Windows Chrome (v116-v125), Safari MacOS 12-14, Edge, Android 10-14, iOS 16-17, Smart TVs LG/Samsung/Shield, y consolas).
2. **Rotación Pseudoaleatoria Constante**: Las inyecciones en la UI (Configuraciones y Custom Headers) y las llamadas del proxy, nunca mantienen el mismo `User-Agent` global inamovible para todos los 13000 canales, esto requiere una perturbación Fibonacci aleatoria (`#EXT-X-APE-UA-ROTATION:ENABLED`).
3. **Múltiple Target de Evasión (CORS / Headers / Streams)**: Inyectar UAs rotados en:
   * `#EXTVLCOPT:http-user-agent=...`
   * `#KODIPROP:inputstream.adaptive.stream_headers=User-Agent=...`
   * Y dentro de las cabeceras HTTPS al conectarse a Cloudflare Proxy y Xtream Codes Providers.

Nunca uses firmas "bot" genéricas, ni inventes UAs cortos con formato no válido. Los identificadores deben concordar milimétricamente con el standard de Mozilla 5.0 para mezclarse con el ancho de banda normal de navegación web (Spoofing Perfecto de ISP).

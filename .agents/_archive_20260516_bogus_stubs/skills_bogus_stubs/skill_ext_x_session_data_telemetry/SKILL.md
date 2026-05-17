---
name: Skill_EXT_X_SESSION_DATA_Telemetry
description: Paradigma de Telemetría Embebida M3U8 a nivel de Parser. Inyección de estado de cliente L7 a Backend sin requerir SDKs, JS, ni payloads externos.
---

# Skill_EXT_X_SESSION_DATA_Telemetry

## 1. El Impedimento de la Telemetría Stateless
En la arquitectura M3U8 tradicional (IPTV Estándar), la relación entre el Cliente (ExoPlayer/AVFoundation/Kodi) y el Servidor (PHP/Nginx Proxy) es **completamente stateless (sin estado)** tras la descarga inicial.
Cuando un usuario sufre bloqueos o experimenta caídas L7, el backend no tiene forma de recolectar telemetría de diagnóstico (¿Qué compilación tiene el .m3u8 local del usuario? ¿Qué cliente es?) porque los reproductores de TV Box no ejecutan entornos de JavaScript para devolver Analytics.

## 2. El Agente Embebido: SESSION-DATA
La solución definitiva oficial al "Blind Spot" de telemetría reside en inyectar metadato crudo en la fase de análisis HLS inicial:
\`\`\`text
#EXT-X-SESSION-DATA:DATA-ID="com.ape.session",VALUE="v=6.0&build=NUCLEAR"
\`\`\`

### El Protocolo de Reflejo (Ghost Feedback Loop):
- **Agnosticismo JS:** Esta etiqueta sobrevive independientemente de la capa de render. Es procesada nativamente por el parseo *C-Core* de los reproductores y empujada en forma de headers y URL Params de vuelta al origen a lo largo del tiempo de vida del socket.
- **`DATA-ID=com.ape.session`**: Otorga un namespace DNS Inverso al paquete de memoria, evitando coaliciones de sistema. 
- **`VALUE=v=6.0&build=NUCLEAR`**: Cuando el reproductor consulta en bucle las resoluciones, devuelve pasivamente el token. El backend en Hetzner (PHP Resolver) es capaz de extraer del tráfico HTTP puro estos metadatos y certificar que la lista local en RAM del usuario está purgada, es la v6 Nuclear, o requiere una purga.

## 3. Regla Estructural
Se ubica exactamente en la base de la cabecera general superior de control, justo antes de los metadatos visuales APE-BUILD o APE-PARADIGM, de esta forma:
\`\`\`text
#KODIPROP:inputstream.adaptive.chooser_bandwidth_mode=AUTO
#KODIPROP:inputstream.adaptive.chooser_resolution_max=MAX
#EXT-X-SESSION-DATA:DATA-ID="com.ape.session",VALUE="v=6.0&build=NUCLEAR"
#EXT-X-APE-BUILD:v6.0-NUCLEAR-HACKS-202X-XX-XX
\`\`\`

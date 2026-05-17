---
description: Flujo Maestro de Arquitectura y Despliegue del Ecosistema OMEGA ABSOLUTE v5.4 (Modo Híbrido IP-Binding)
---

# SOP OMEGA ABSOLUTE v5.4 HYBRID

**Versión:** 5.4.0 (Abril 2026)
**Sistema:** Ecosistema OMEGA ABSOLUTE
**Clasificación:** Confidencial / Arquitectura Core

---

## 1. Fundamentos de la Arquitectura Híbrida (CERO-302 vs 302-IPBIND)

En la versión 5.4, el ecosistema abandona la limitante del Proxy "Talla Única". El Sistema ahora es **topológicamente consciente**. Dependiendo de la agresión del ISP y del proveedor, el Proxy reacciona de dos formas para lograr el 100% de reproducción:

### 1.1. Modo 200 OK (Passthrough Silencioso)
- **Activación:** Proveedores normales (Sin IP-Binding).
- **Comportamiento:** Proxy Inverso. Se descarga el `.m3u8`, se reescribe al vuelo, ocultando el origen y se devuelve con un sagrado HTTP 200 OK. 
- **Nuevo en v5.4:** Inyección en línea de `#EXTVLCOPT:http-user-agent` dentro del payload M3U8 para obligar a VLC a adoptar la identidad del VPS, evadiendo baneos 403.

### 1.2. Modo 302 Passthrough (IP-Binding Evasion)
- **Activación:** Proveedores hostiles L7 (`tivi-ott.net`) detectados dinámicamente mediante el probe Python/PHP inicial.
- **Comportamiento:** Emisión obligatoria de un **HTTP 302 Found** apuntando directamente a la URL de origen.
- **Beneficio:** Evita el desacople de IPs entre el Request Inicial (VPS) y la Petición de Segmentos (Cliente). Previene el error mortal `Failed to create demuxer 000000000`.

---

## 2. Telemetría de Diagnóstico

La telemetría de OMEGA v5.4 se emite a través de las cabeceras `X-APE-Proxy-Mode` obligatorias. 

- `X-APE-Proxy-Mode: 200OK-REVERSE-PROXY-SSOT` -> Modo de Camuflaje Inverso.
- `X-APE-Proxy-Mode: 302-IPBIND-PASSTHROUGH` -> Modo de Evasión Passthrough.

## 3. Protocolos Inquebrantables de Despliegue

1. **PROHIBIDO EL DEGRADE:** Bajo NINGUNA circunstancia el Modo 302 (IP-binding) degradará la calidad o transcodificará visualmente. El 302 es el puente definitivo a la visualidad Pura en esos proveedores.
2. **IP-BINDING CACHE:** El resultado de la detección de L7 (`ipbind_cache`) dura estrictamente 1 hora. Evita agotar conexiones y bandwidth (`Anti-509 Guardian`).
3. **MANDATORY EXT:** Toda petición al ecosistema SSOT v5.4 **debe** terminar en `&ext=.m3u8` para doblegar definitivamente la persistencia del Demuxer iterativo de VLC y reproductores primitivos.

Cualquier violación a estas directivas destruirá el *scorecard* `120/120` de la infraestructura OMEGA v18.2.

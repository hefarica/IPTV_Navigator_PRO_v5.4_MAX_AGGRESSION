---
name: iptv-isp-evasion-phantom-hydra
description: Guía de implementación del motor Phantom Hydra para evasión de ISP en listas IPTV. Usar cuando necesites evitar bloqueos, rate-limits (429), bans temporales (403/407) o inspección profunda de paquetes (DPI) por parte de proveedores de internet o proxies de IPTV.
---

# IPTV: Evasión ISP (Phantom Hydra)

Esta habilidad detalla el motor de evasión Phantom Hydra, diseñado para hacer que el tráfico de una lista IPTV sea indistinguible del tráfico web legítimo, evadiendo firewalls, DPI (Deep Packet Inspection) y sistemas como Sandvine.

## 1. El Problema: Firmas de Tráfico IPTV

Los ISPs y los proxies de los proveedores IPTV bloquean conexiones basándose en tres vectores principales:
1. **User-Agent estático:** Si ven 500 peticiones en 1 minuto con `VLC/3.0.16 LibVLC/3.0.16`, bloquean la IP (Error 407 o 429).
2. **SNI (Server Name Indication) en claro:** Si el dominio de destino es `iptv-pirata.com`, el ISP lo bloquea a nivel DNS o SNI.
3. **Patrones de tráfico de video:** Si detectan flujos continuos de UDP/TS sin comportamiento HTTP estándar, aplican throttling (estrangulamiento).

## 2. La Solución: Phantom Hydra Engine

El motor Phantom Hydra ataca los tres vectores simultáneamente.

### Vector 1: Rotación Orgánica de User-Agent

No basta con usar un UA diferente; el UA debe ser **orgánico** y coherente con el ecosistema. El motor utiliza un banco de UAs (Tier 1: Smart TVs, Tier 2: Navegadores, Tier 3: Reproductores) y rota estratégicamente.

**Regla de oro:** Ningún canal adyacente debe compartir el mismo UA, y el UA debe mutar al hacer zapping.

```javascript
// Ejemplo de inyección en la lista M3U8
#EXTVLCOPT:http-user-agent=Mozilla/5.0 (SMART-TV; Linux; Tizen 8.0) AppleWebKit/538.1 (KHTML, like Gecko) SamsungBrowser/3.2 TV Safari/538.1
```

### Vector 2: Ofuscación DNS y SNI (Domain Fronting)

Para evitar bloqueos de DNS y SNI, el tráfico se enruta a través de CDNs legítimas (Cloudflare, Fastly) usando Domain Fronting o DoH (DNS over HTTPS).

```m3u8
#EXT-X-PHANTOM-HYDRA:DNS=DOH_CLOUDFLARE,SNI=OBFUSCATED,FRONT=cloudflare.com
```

- **DoH:** Obliga al reproductor (si es compatible, como ExoPlayer) a resolver el dominio usando `https://1.1.1.1/dns-query` en lugar del DNS del ISP.
- **SNI Fronting:** La conexión TLS se establece con `cloudflare.com` (SNI legítimo), pero el header HTTP `Host` interno apunta al servidor IPTV real.

### Vector 3: Mimetismo de Tráfico (HTTP Mimicry)

Para evadir el DPI (como Sandvine), el tráfico de video se envuelve en contenedores fMP4 (CMAF) entregados sobre HTTP/2 o HTTP/3, imitando el comportamiento de YouTube o Netflix.

```m3u8
#EXT-X-CMAF:CONTAINER=fMP4,SEGMENT=4,LATENCY=ZERO
#EXT-X-APE-PHANTOM-HYDRA:TRAFFIC=HTTPS_MIMICRY,BYPASS=SANDVINE
```

## 3. Implementación en el Generador

Al construir un generador M3U8, debes incluir el módulo `UAPhantomEngine` (ver implementaciones en OMEGA V5).

1. **Tiempo de Generación:** Asigna un UA determinista pero único a cada canal basado en un hash de su ID. Esto evita el patrón de "mismo UA para todo".
2. **Tiempo de Zapping:** Inyecta un `nonce` temporal en la URL para que, incluso si el usuario vuelve al mismo canal, la petición sea criptográficamente distinta.
3. **Recuperación (Córtex):** Si el reproductor detecta un error HTTP 403, 407 o 429, debe forzar una rotación inmediata del UA y del `nonce` para salir de la "zona baneada".

## 4. Evitar Errores Comunes

- **NO uses UAs de herramientas automatizadas** (curl, wget, python-requests).
- **NO dejes el UA en blanco.**
- **NO uses un solo UA global** para toda la lista. Si el proveedor bloquea ese UA, toda la lista muere.

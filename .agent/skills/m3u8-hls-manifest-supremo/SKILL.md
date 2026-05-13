---
name: m3u8-hls-manifest-supremo
description: Guía suprema sobre la anatomía de un manifest HLS/M3U8. Usar cuando necesites construir listas M3U8, entender el RFC 8216, inyectar directivas propietarias sin corromper el estándar, o asegurar compatibilidad universal en reproductores IPTV.
---

# M3U8 HLS Manifest Supremo

Esta habilidad proporciona el conocimiento fundamental para construir listas M3U8 que sean 100% compatibles con el estándar HLS (RFC 8216) mientras albergan ecosistemas complejos (como OMEGA CRYSTAL V5) mediante directivas propietarias.

## 1. La Regla de Oro de la Compatibilidad Universal

La compatibilidad universal en listas M3U8 se logra mediante la explotación de una regla fundamental del RFC 8216 (Sección 4.1):

> **"Clients MUST ignore any unrecognized tags."**
> *(Los clientes DEBEN ignorar cualquier etiqueta no reconocida).*

Esto significa que puedes inyectar **cualquier cantidad de directivas propietarias** en un manifest HLS sin corromperlo, siempre que sigan el formato `#EXT-X-TU-DIRECTIVA:VALOR`.

### El Parser HLS Estándar
Un parser estándar (como el de un Smart TV antiguo o un navegador web básico) solo leerá:
1. `#EXTM3U` (Cabecera obligatoria)
2. `#EXTINF:-1 tvg-id="..."...` (Metadata del canal)
3. `#EXT-X-STREAM-INF:BANDWIDTH=...` (Declaración de variante)
4. `http://...` (La URL final)

Todo lo demás que inyectes (ej. `#EXTVLCOPT`, `#KODIPROP`, `#EXT-X-APE-*`) será **invisible** para el parser estándar, garantizando que el canal se reproduzca incluso en el dispositivo más básico del mundo.

## 2. Anatomía de un Bloque de Canal Supremo

Un bloque de canal perfectamente estructurado debe seguir este orden de inyección para maximizar el procesamiento en reproductores avanzados (VLC, ExoPlayer, Kodi, OTT Navigator) sin romper los básicos:

### Capa 0: Identidad Estándar
```m3u8
#EXTINF:-1 tvg-id="1" tvg-name="HBO HD" tvg-logo="url",HBO HD
#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,CODECS="hev1.1.6.L150.B0"
```

### Capa 1: Esclavización de Reproductores Nativos
Directivas que controlan reproductores de bajo nivel como VLC o ExoPlayer.
```m3u8
#EXTVLCOPT:network-caching=60000
#EXTVLCOPT:http-user-agent=Mozilla/5.0...
#KODIPROP:inputstream.adaptive.manifest_type=hls
```

### Capa 2: Ecosistema Propietario (Ignorado por estándar)
Aquí inyectas tu lógica avanzada de resiliencia, polimorfismo, evasión y calidad.
```m3u8
#EXT-X-APE-RESILIENCE:LEVELS=7
#EXT-X-APE-PHANTOM-HYDRA:ROTATION=ORGANIC
#EXT-X-APE-POLYMORPHIC-NONCE:a1b2c3d4
```

### Capa 3: Metadata HLS + URL Final
```m3u8
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud-primary",NAME="Primary Audio",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="spa"
#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=2000000,CODECS="hvc1.2.4.L153.B0"
#EXT-X-STREAM-INF:BANDWIDTH=80000000,CODECS="hvc1.2.4.L153.B0,ec-3",RESOLUTION=1920x1080
https://servidor.com/live/123/stream.m3u8?ape_sid=xyz&ape_nonce=abc
```

> ⚠️ **FIX 2026-04-17**: `EXT-X-MEDIA` y `EXT-X-I-FRAME-STREAM-INF` NUNCA llevan `URI=` en catálogos de canales. Solo 1 `EXT-X-STREAM-INF` + 1 URL por canal. Múltiples URLs causaban HTTP 509.

## 3. Principios de Construcción

1. **Nunca rompas la dupla EXTINF / URL**: La URL final siempre debe ser la última línea del bloque del canal.
2. **CMAF/fMP4 sobre TS**: Siempre prioriza contenedores fMP4 (`#EXT-X-CMAF:CONTAINER=fMP4`) sobre MPEG-TS heredado para latencia cero.
3. **Bandwidth Agresivo**: En `#EXT-X-STREAM-INF`, declara siempre un `BANDWIDTH` extremadamente alto (ej. 80000000 para 80Mbps) para forzar al reproductor a solicitar el máximo ancho de banda posible y destripar el estrangulamiento del ISP.
4. **Idempotencia vs Polimorfismo**: Las etiquetas propietarias deben mutar (polimorfismo) para evadir DPI, pero la URL debe contener una llave estable (idempotencia) para garantizar un HIT en la caché del servidor.

## 4. Evitar el Hardcoding

Al generar el manifest:
- **MAL**: `#EXTVLCOPT:network-caching=60000` (hardcoded)
- **BIEN**: `#EXTVLCOPT:network-caching=${cfg.buffer_ms}` (dinámico)

Las configuraciones deben obtenerse como arrays directamente del frontend o del perfil del usuario para asegurar dinamismo y flexibilidad.

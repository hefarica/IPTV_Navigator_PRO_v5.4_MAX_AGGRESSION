---
name: RFC8216 Strict Parser Compliance (Anti-Unexpected Type)
description: Regla ABSOLUTA de estructura HLS. Solución al error "Loaded playlist has unexpected type" de OTT Navigator al anidar #EXTHTTP o #EXTVLCOPT entre #EXT-X-STREAM-INF y su URL.
---

# RFC8216 Strict Parser Compliance (Anti-Unexpected Type Error)

## El Problema Analizado
Si un reproductor OTT Navigator / TiviMate arroja: 
`Error occurred [...] Loaded playlist has unexpected type.`

El problema en el 90% de los casos de resolutores "Inteligentes" es la violación de la especificación técnica **RFC 8216** (HTTP Live Streaming), concretamente respecto a la etiqueta de variante de stream `#EXT-X-STREAM-INF`.

## La Regla HLS Inmutable (Zero-Bug Policy)
Según la especificación, el tag `#EXT-X-STREAM-INF` describe la variante del stream y **DEBE estar inmediatamente seguido por la URI (URL) del Stream**.
NINGUNA etiqueta adicional o propietaria (Como `#EXTHTTP:`, `#EXTVLCOPT:`, o `#KODIPROP:`) tiene permitido interponerse entre el tag `#EXT-X-STREAM-INF` y su URI.

### ❌ CÓDIGO INCORRECTO (Rompe el Parser y Provoca el Fallo)
```m3u8
#EXT-X-STREAM-INF:BANDWIDTH=50000000,RESOLUTION=3840x2160,FRAME-RATE=60
#EXTHTTP:{"X-ABR-Multiplier":"6.0"}
#EXTVLCOPT:network-caching=20000
http://mi-proveedor.com/live/1.m3u8
```
**Análisis del Fallo:** El reproductor parsea la línea 1 como atributos del M3U8, y asume ciegamente que la línea 2 `(#EXTHTTP:...)` es la URL del video. Intenta descargarla o parsearla y falla miserablemente al toparse con texto puro JSON, retornando *Unexpected type*.

### ✅ CÓDIGO CORRECTO (Cumplimiento Estricto Aprobado)
```m3u8
#EXTHTTP:{"X-ABR-Multiplier":"6.0"}
#EXTVLCOPT:network-caching=20000
#EXT-X-STREAM-INF:BANDWIDTH=50000000,RESOLUTION=3840x2160,FRAME-RATE=60
http://mi-proveedor.com/live/1.m3u8
```
**Análisis del Éxito:** El reproductor lee los atributos personalizados y los guarda en un buffer de "Siguiente Conexión". Luego, lee el `#EXT-X-STREAM-INF` e inmediatamente captura `http://mi-proveedor.com...` validando el formato y estableciendo la conexión con todos los Headers y opciones VLC del buffer previo.

## Directrices para Generadores y PHP Resolvers
En cualquier iteración de código del Ecosistema APE, debes seguir la **REGLA DE CONCATENACIÓN**:
1. Los tags personalizados siempre van de primero.
2. Las definiciones de capa o canal (`#EXT-X-STREAM-INF` o `#EXTINF`) van de último.
3. El enlace/URL cruda cierra el bloque de forma absoluta.

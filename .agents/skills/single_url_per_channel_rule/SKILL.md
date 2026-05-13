---
name: "single_url_per_channel_rule"
description: "Regla ABSOLUTA: En catálogos M3U8 de canales, cada bloque #EXTINF emite exactamente 1 URL. Los tags EXT-X-MEDIA y EXT-X-I-FRAME-STREAM-INF NUNCA llevan URI=. Solo 1 EXT-X-STREAM-INF por canal. Múltiples URLs causan HTTP 509 del proveedor."
---

# 🛡️ Regla: 1 URL por Canal en Catálogos M3U8 (Anti-509)

## Contexto del Bug (2026-04-17)

El generador `m3u8-typed-arrays-ultimate.js` emitía **6 URLs por canal**:

- 2× `#EXT-X-MEDIA:TYPE=AUDIO,...,URI="stream_url"` — abrían 2 conexiones extra
- 1× `#EXT-X-I-FRAME-STREAM-INF:...,URI="stream_url"` — abría 1 conexión extra
- 3× `#EXT-X-STREAM-INF` + URL — abrían 3 conexiones

Con 4,536 canales × 3+ URLs = **13,608 conexiones** al proveedor al cargar la lista.
El proveedor respondía **HTTP 509 Bandwidth Limit Exceeded**.

## Regla Absoluta

```
EN UN CATÁLOGO M3U8 DE CANALES (FLAT PLAYLIST):

1. Cada bloque #EXTINF → EXACTAMENTE 1 URL al final
2. #EXT-X-MEDIA → puede existir como METADATA pero NUNCA con URI=
3. #EXT-X-I-FRAME-STREAM-INF → puede existir como METADATA pero NUNCA con URI=
4. #EXT-X-STREAM-INF → MÁXIMO 1 por canal, seguido inmediatamente por la URL
5. Failover/redundancia → via querystring (&pevce_fallback_chain=) o backend resolver
6. NUNCA emitir múltiples URLs por canal en el catálogo
```

## Estructura Correcta ✅

```m3u8
#EXTINF:-1 tvg-id="123" tvg-name="Canal" group-title="Deportes",Canal
#EXTVLCOPT:network-caching=60000
#EXTVLCOPT:http-reconnect=true
#EXTHTTP:{"User-Agent":"...","Referer":"..."}
#KODIPROP:inputstream.adaptive.manifest_type=hls
#EXT-X-APE-*:... (800+ tags de metadata)
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud-primary",NAME="Primary Audio",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="spa"
#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=2000000,CODECS="hvc1.2.4.L153.B0"
#EXT-X-STREAM-INF:BANDWIDTH=80000000,CODECS="hvc1.2.4.L153.B0,ec-3",RESOLUTION=1920x1080,FRAME-RATE=60.000
http://proveedor/live/user/pass/123.m3u8
```

## Estructura PROHIBIDA ❌ (Causa 509)

```m3u8
#EXTINF:-1 ...,Canal
...
#EXT-X-MEDIA:TYPE=AUDIO,...,URI="http://proveedor/stream"     ← PROHIBIDO: URI= abre conexión
#EXT-X-MEDIA:TYPE=AUDIO,...,URI="http://proveedor/stream"     ← PROHIBIDO: otra conexión
#EXT-X-I-FRAME-STREAM-INF:...,URI="http://proveedor/stream"  ← PROHIBIDO: otra conexión
#EXT-X-STREAM-INF:...
http://proveedor/stream                                        ← URL #1
#EXT-X-STREAM-INF:...
http://proveedor/stream                                        ← PROHIBIDO: URL #2
#EXT-X-STREAM-INF:...
http://proveedor/stream                                        ← PROHIBIDO: URL #3
```

## Distinción Clave

| Contexto | ¿Múltiples EXT-X-STREAM-INF? | ¿Múltiples URLs? |
|----------|:---:|:---:|
| **Catálogo de canales** (lo que genera el JS) | ❌ Máximo 1 | ❌ Exactamente 1 |
| **HLS Master Playlist** (lo que sirve el proveedor al dar play) | ✅ Sí, normal | ✅ Sí, normal |
| **Backend resolver** (resolve_quality_unified.php) | ✅ Sí | ✅ Sí |

## Archivos Afectados

- `m3u8-typed-arrays-ultimate.js` — función `generateChannelEntry()`
- Skills actualizadas: `iptv_usa_universal_adapter`, `iptv-generador-fusion-v21`
- Skill validadora: `pevce_harmonic_fallback_strict_1_to_1` (ya decía esto)

## Principio Inmutable

> Los tags HLS Master Playlist (`EXT-X-MEDIA URI=`, `EXT-X-I-FRAME-STREAM-INF URI=`, múltiples `EXT-X-STREAM-INF + URL`) pertenecen al **manifest HLS del proveedor**, no al catálogo de canales M3U8. Mezclarlos en el catálogo convierte cada canal en una "Master Playlist embebida" que el player intenta resolver abriendo múltiples conexiones simultáneas.

## 🛡️ Anexo Absoluto: Perfect Universal URL Constructor (El Motor Matemático)

Para garantizar que la **única URL emitida** (Single URL Rule) sea correcta y no dispare errores de fragmentación L7 (como 404, 403, 503 por Path Pollution), su ensamblado **NUNCA DEBE SER UNA CONCATENACIÓN CIEGA**. Debe pasar estrictamente por el **Constructor Universal** basado en dicotomías matemáticas de backend.

El flujo abstracto e inquebrantable que el motor JS ejecuta para emitir la URL, se fundamenta en las siguientes leyes:

1. **Normalización Total:** Se extraen `scheme`, `host`, `port` y `basePath` del origen. Los puertos inútiles (80 para HTTP y 443 para HTTPS) se purgan para evitar fallos de CORS o SNI routing.
2. **Detección Determinista (Server Paradigm Detection):**
   - Si tiene `/live/`, `/movie/`, `/series/` → `xtream`.
   - Si usa parámetros GET (`?username=...`) → `query_hls`.
   - Si el `path` termina directamente en un binario de video puro o manifiesto crudo (`.m3u8`) → `direct_hls`.
3. **Paso Estricto de Limpieza (Purga):**
   - *Xtream:* `/live/{user}/{pass}/{streamId}.{ext}` garantizando que `{user}`, `{pass}` y `{streamId}` estén 100% URL Encoded.
   - *Query HLS:* Utiliza constructores nativos asegurándose de que parámetros preexistentes caducos (como `token=` o `playlist=`) no generen "Parameter Pollution". Ordena alfabéticamente para prever caché.
   - *Direct:* Validado con `ensurePathEndsWithExtension` impidiendo trailing slashes vacíos destructivos (slash `/` al final de la ruta).
4. **Validación de Integridad Final (validateBuiltUrl):**
   - Tolerancia cero a espacios vacíos y fragmentación doble (`??` o `&&`).
   - Obligación estructural de finalizar siempre con un ancla de media (ej. `.m3u8`).

---
name: motor_dinamico_renderizado_mpd
description: Doctrina arquitectónica que convierte el resolve_quality.php en un Motor Dinámico de Renderizado de plantillas MPD 100% conformes y establece el "Fallback HLS Inteligente" de 2 pasos (Ignición -> TS Redirect).
---

# Motor Dinámico de Renderizado MPD y Fallback HLS Inteligente

## 1. Objetivo de la Habilidad

Transformar el `resolve_quality.php` de un simple redirector a un **Motor de Orquestación de Streaming de Nivel Profesional**. El sistema utilizará plantillas o flujos en vivo (CMAF) como lienzo base para crear, en tiempo real, un manifiesto DASH único y perfectamente adaptado o un puente HLS controlado.

## 2. El Bridge Inteligente (Comportamiento Estricto del Resolver)

El orquestador PHP (`resolve_quality.php`) debe interceptar las peticiones del reproductor basándose en el parámetro `format` y tomar decisiones arquitectónicas absolutas:

### A) Ruta DASH (`format=dash` o `format=mpd`)

- El motor lee el manifiesto base generado.
- **Inyección Temporal:** Reemplaza e inyecta dinámicamente el `availabilityStartTime`, `publishTime` y `startNumber` basándose en el The Epoch Anchor.
- **Inyección Estructural:** Asegura la existencia de `minBufferTime`, `<Period>`, `timeShiftBufferDepth`, `r="-1"` y la pureza del `AdaptationSet` de Video (CICP, codecs).
- Despacha con el Content-Type `application/dash+xml`.

### B) Ruta de Ignición HLS (`format=hls` o `format=m3u8` o Fallback M3U8)

- El motor **NUNCA** redirigirá de inmediato al proveedor si se espera una lista.
- Debe generar una "Lista de Ignición" M3U8 dinámica (de 4 o 5 líneas) donde los headers predictivos (`#EXTHTTP`, `#EXTVLCOPT`) se declaran.
- El Track URI final dentro de este mini-M3U8 **debe apuntar de nuevo a `resolve_quality.php`** pero con la directiva estricta `format=ts`.
- Esto mantiene a APE con el control absoluto del reproductor para telemetría y balanceo.

### C) Ruta Final Binaria (`format=ts`)

- Solo cuando el reproductor sigue el playlist de Ignición HLS y solicita expresamente el fragmento o el stream de video encadenado (`format=ts`), el PHP realiza la inyección de latencia final o ejecuta la redirección HTTP 302 a la URL del proveedor original.

## 3. Ejemplo del Flujo de Fallback Inteligente

1. TiviMate llama: `resolve_quality.php?ch=fox_sports&format=hls`
2. PHP devuelve HTTP 200 OK:

   ```m3u8
   #EXTM3U
   #EXTINF:-1 codec="HEVC", fox_sports
   #EXTVLCOPT:deblock=1:1
   https://iptv-ape.duckdns.org/resolve_quality.php?ch=fox_sports&format=ts
   ```

3. TiviMate llama a la nueva ruta `.ts`.
4. PHP despacha vía redirección HTTP 302 -> `http://proveedor.com/live/U/P/123.ts`.

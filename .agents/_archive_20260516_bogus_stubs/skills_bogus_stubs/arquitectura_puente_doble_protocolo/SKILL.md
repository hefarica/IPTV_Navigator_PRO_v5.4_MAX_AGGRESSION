---
name: arquitectura_puente_doble_protocolo
description: Arquitectura de Puente de Doble Protocolo (DASH y HLS) basada en el diseño "God-Tier" de APE v17.2. Implementa un despachador unificado en resolve_quality.php utilizando funciones encapsuladas para renderizar DASH dinámicamente o aplicar un Fallback HLS de dos pasos dictado por el ADN del channels_map.
category: Arquitectura y Streaming
version: 17.2
---

# 🧠 Arquitectura de Puente de Doble Protocolo (God-Tier APE v17.2)

## 1. Objetivo Arquitectónico

Transformar el script PHP de resolución de un simple proxy/redireccionador en un **Motor Dinámico de Renderizado Políglota**.
La premisa es: Todo parte de una única fuente de verdad (el `channels_map.json`, o "ADN"). Basándose en este ADN y en la petición del reproductor, el servidor actúa como un **Juez** que decide instantáneamente entre dos grandes vías.

## 2. Los Dos Flujos Maestros

### A) El Flujo DASH (Ruta "God-Tier")

Para peticiones con `format=dash` o `mpd`.
Se invoca la función modular `serve_god_tier_dash()`.

- **Operación:** Se carga la plantilla estática `APE_GOD_TIER_CORRECTED.mpd`.
- **Inyección en Tiempo Real:**
  - `availabilityStartTime` y `publishTime` se sobrescriben con la hora UTC exacta del momento (`gmdate`).
  - `<BaseURL>` se inyecta dinámicamente apuntando a la "factoría de segmentos" generada por el Worker GPU (`/cmaf/channel-###/`).
  - Se despacha con `Content-Type: application/dash+xml`.

### B) El Flujo HLS (Ruta "Fallback Seguro")

Para reproductores legacy o situaciones de red inestable que escapan a M3U8 (`format=hls` o `m3u8`).
NO se redirige inmediatamente al stream origen, para mantener el control y telemetría (Fallback de "Doble Paso").

- **Paso 1: Ignición HLS (`serve_hls_ignition`)**:
  - Genera un M3U8 de 4-5 líneas en crudo como respuesta HTTP 200 OK.
  - Oculta metadatos y etiquetas predictivas de ExoPlayer/VLC.
  - La URL del M3U8 **no es el stream final**, sino una llamada en loopback a sí mismo obligando al reproductor a solicitar el binario (`format=ts`).
  
- **Paso 2: Redirección Final (`redirect_to_provider_stream`)**:
  - Cuando el reproductor persigue la ruta señuelo pidiendo `format=ts`.
  - El motor ejecuta un retorno HTTP 302 arrojando la URL real del proveedor proveniente del `channels_map.json`.

## 3. Disposición del Código PHP (Regla de Implementación del Switch)

Cualquier versión autorizada de `resolve_quality.php` debe regirse incondicionalmente por esta estructura conmutador:

```php
switch ($format) {
    case 'dash':
    case 'mpd':
        serve_god_tier_dash($channel_data);
        break;

    case 'hls':
    case 'm3u8':
        serve_hls_ignition($channel_data);
        break;

    case 'ts':
        redirect_to_provider_stream($channel_data);
        break;
        
    default:
        // Lógica de desempate basada en el 'preferred_format' del channels_map.json
        if ($channel_data['preferred_format'] === 'dash') {
            serve_god_tier_dash($channel_data);
        } else {
            serve_hls_ignition($channel_data);
        }
        break;
}
```

## 4. Estrictos Mandamientos del "Juez"

1. **La Ley (ADN):** Nada se ejecuta si no existe o se comprueba en el `channels_map`.
2. **El Juez (Resolver):** El resolver carece de preferencia dura frente al payload; simplemente obedece el ADN y despacha en la función adecuada.
3. **El Estándar (DASH Conformity):** Toda plantilla MPD usada debe ser 100% ISO/IEC 23009-1 conforme (inyección dinámica indispensable).

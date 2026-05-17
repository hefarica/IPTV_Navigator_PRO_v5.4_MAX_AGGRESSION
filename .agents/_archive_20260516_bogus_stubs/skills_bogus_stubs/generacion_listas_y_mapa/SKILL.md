---
name: generacion_listas_y_mapa
description: Reglas y directrices absolutas para la generación de archivos M3U8 y el `channels_map.json`, asegurando el respeto estricto de perfiles (P0-P5) hacia el resolve.php y la activación condicional de híbridos.
---

# Generación de Listas y Channel Map

## Objetivo

Garantizar un acoplamiento perfecto entre el Playlist Generator (Toolkit Frontend) y el Resolver (VPS Backend). Esta habilidad establece un contrato donde **el perfil exacto exigido por el usuario en el toolkit (P0, P1, P2, P3, P4, P5) es el que mandará en la resolución final**, y donde las capas de extremo rendimiento (como *Latencia Rayo*) solo se imponen si el usuario lo decide.

## REGLA 1: Respeto Estricto de Perfil en Resolve.php

El script `resolve.php` **NUNCA** debe ignorar arbitrariamente el parámetro de perfil (`?p=P...`) proveniente del archivo `channels_map.json` o de la M3U8 generada.

- Si el toolkit envía un canal configurado como `P5` (SD_FAILSAFE) para ahorrar datos móviles, el resolver en el VPS DEBE solicitar la versión de bajo consumo (ej. SD/H264) al servidor IPTV original.
- **Prohibido el Hardcoding**: No inyectes `$profile = 'P1'` de manera forzada para todas las resoluciones a menos que el parámetro de entrada exija explícitamente `P1`.
- Si el parámetro de entrada es `AUTO`, el backend evaluará según el nombre del canal mediante `autoProfile($ch)`.

## REGLA 2: Activación Condicional de Arquitecturas Híbridas

La *Arquitectura de Buffer Híbrido Asimétrico* (Double-Ended Buffer / Premio Nobel) requiere la colisión de **Sincronizador Netflix Max** (Headroom 300%) y **Latencia Rayo** (<500ms startup).

- Sin embargo, **NO FUERCES** la Latencia Rayo a incautos.
- El `generation-controller.js` siempre debe comprobar el boolean de la UI: `if (window.ApeModuleManager.isEnabled('latency-rayo')) { ... }` para combinar ambos mundos. Si no está activa, simplemente se proveerá el Headroom masivo.

## REGLA 3: Polimorfismo y Nomenclatura del Channel Map (`{list_name}.channels_map.json`)

Cada lista M3U8 generada crea un "ADN" único (parámetros de codec, profile, origen). Por lo tanto, **el Channel Map debe ser una réplica exacta de su lista madre** y no un archivo estático y genérico.

- **Múltiples Listas Coexistentes:** Pueden coexistir múltiples configuraciones en el mismo servidor VPS (e.g., listas de alta calidad y de baja latencia).
- **Convención Obligatoria:** El archivo del mapa SIEMPRE debe heredar el nombre del archivo M3U8 generado, reemplazando la extensión. Ejemplo:
  Si la lista se llama `APE_TYPED_ARRAYS_2026.m3u8`, su mapa se llamará de forma indisoluble: `APE_TYPED_ARRAYS_2026.channels_map.json`.
- En el código del frontend, la construcción es: `const mapFileName = mapBasename ? \`${mapBasename}.channels_map.json\` : 'channels_map.json';`.

## REGLA 4: Ciclo de Vida Sincronizado (Eliminación en Cascada)

El Channel Map y el archivo M3U8 están indisolublemente vinculados. Si la lista muere, su ADN muere.

- El archivo `delete_file.php` en el VPS **DEBE** incluir el "AUTO-CLEANUP" automático del `channels_map`.
- Lógica Mandatoria VPS:

```php
$basename = preg_replace('/\.m3u8$/i', '', $filename);
$mapFilename = $basename . '.channels_map.json';
// ... ejecutar unlink($mapPath)
```

- **NUNCA** rompas este enlace. Esto garantiza que el disco del servidor no se sature con "Channel Maps huerfanos" pertenecientes a listas que el usuario eliminó desde el Toolkit.

## Estructura Interna del JSON Map

El archivo correlaciona el stream_id con el perfil generado. Su contenido será idéntico a lo que exporta la directiva `#EXTINF`:

```json
{
  "canal_deportes_1": {
    "profile": "P1",
    "label": "Canal Deportes UHD",
    "group": "DEPORTES/UHD",
    "stream_id": "394553",
    "math_telemetry": {
      "bw": 80000000
    },
    "fusion_directives": {
      "bwdif": "enforced",
      "max_resolution": "4320p",
      "heuristic": "adaptive-highest"
    }
  }
}
```

> [!CAUTION]
> El campo `stream_id` es **OBLIGATORIO** para cada entrada del mapa. Sin él, `resolve.php` enviará el slug literal como ID al proveedor IPTV, causando un error 404. El generador `buildChannelsMap()` en `m3u8-typed-arrays-ultimate.js` garantiza esto automáticamente.

Esto certifica que la ofuscación de URLs (`#EXTATTRFROMURL`) pasará limpia, y `resolve.php` será capaz de deducir qué perfil utilizar simplemente inyectando `?list={list_name}` en las peticiones.

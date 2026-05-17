# SOP: Integración Quirúrgica de Perfiles APE v10.0 (Realtime Engine)

Este Standard Operating Procedure (SOP) detalla el proceso exacto para inyectar la configuración de los perfiles APE v10.0 en el ecosistema actual sin dañar la arquitectura existente.

## 1. Visión General

La versión v10.0 de los perfiles APE introduce el **Realtime Engine**, una amalgama de parámetros óptimos extraídos de HLS.js, Bitmovin, Shaka Player, ExoPlayer y métricas de QoE (Mux Data, Akamai).

El objetivo es inyectar estos parámetros dinámicamente en los headers HTTP (`#EXTHTTP`) y las directivas de VLC/Kodi (`#EXTVLCOPT`, `#KODIPROP`) de cada canal generado, basándose en el perfil seleccionado (P0 a P5).

## 2. Archivos Afectados

La integración requiere modificar **únicamente un archivo** en el frontend:
- `m3u8-typed-arrays-ultimate.js` (El Generador APE)

Y actualizar los archivos de perfiles JSON en el servidor:
- `APE_ALL_PROFILES_v10_REALTIME_ENGINE.json` (o los individuales P0-P5)

## 3. Proceso de Integración Quirúrgica

### Paso 3.1: Actualizar el Gestor de Perfiles (`ApeProfileManager`)

El `ApeProfileManager` debe ser capaz de leer y almacenar los nuevos bloques de configuración (`hlsjs`, `bitmovin`, `shaka`, `exoplayer`, `headerOverrides_v10`, `vlcopt_v10`) del JSON v10.0.

1.  **Localizar:** En `m3u8-typed-arrays-ultimate.js`, busca la clase o el objeto `ApeProfileManager` (usualmente donde se hace el `fetch` de los perfiles JSON).
2.  **Inyectar:** Asegúrate de que al cargar el perfil, se almacene el objeto completo, no solo las variables antiguas.
    ```javascript
    // Ejemplo de inyección conceptual:
    window.ApeProfileManager.currentProfileData = profileJsonData;
    ```

### Paso 3.2: Inyectar en `generateChannelEntry` (El Motor de Generación)

Esta es la parte crítica. Debemos inyectar los nuevos headers en el bloque `#EXTHTTP` y las opciones en `#EXTVLCOPT` **sin alterar el orden** estricto del RFC 8216.

1.  **Localizar el Bloque `#EXTHTTP`:** En la función `generateChannelEntry` (o similar), busca donde se construye el JSON para `#EXTHTTP`.
2.  **Inyectar Headers v10:**
    ```javascript
    // INYECCIÓN QUIRÚRGICA: Añadir headers del perfil v10
    const profileData = window.ApeProfileManager.currentProfileData;
    if (profileData && profileData.headerOverrides_v10) {
        Object.assign(httpHeaders, profileData.headerOverrides_v10);
    }
    ```
3.  **Localizar el Bloque `#EXTVLCOPT`:** Busca donde se añaden las líneas `#EXTVLCOPT`.
4.  **Inyectar Opciones v10:**
    ```javascript
    // INYECCIÓN QUIRÚRGICA: Añadir VLCOPT del perfil v10
    if (profileData && profileData.vlcopt_v10) {
        for (const [key, value] of Object.entries(profileData.vlcopt_v10)) {
            lines.push(`#EXTVLCOPT:${key}=${value}`);
        }
    }
    ```

## 4. Validación (Checklist)

1.  Generar una lista de prueba.
2.  Verificar que el bloque `#EXTHTTP` contiene los headers `CMCD-*`, `X-HLSjs-Config`, `X-QoE-*`, etc.
3.  Verificar que el bloque `#EXTVLCOPT` contiene las opciones actualizadas (ej. `network-caching` ajustado al perfil).
4.  Verificar que el orden final sigue siendo: `#EXTINF` -> `#EXTVLCOPT` -> `#EXTHTTP` -> ... -> `#EXT-X-STREAM-INF` -> URL.

## 5. Referencias

- [1] HLS.js API Documentation: https://github.com/video-dev/hls.js/blob/master/docs/API.md
- [2] Bitmovin Stream Test: https://bitmovin.com/demos/stream-test/
- [3] Akamai Media Analytics: https://www.akamai.com/blog/performance/enhancing-video-streaming-quality-for-exoplayer-part-2
- [4] Mux Data QoE Metrics: https://www.mux.com/articles/live-streaming-analytics-the-metrics-that-actually-matter

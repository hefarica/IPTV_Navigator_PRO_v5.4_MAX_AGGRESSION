---
name: "pevce_harmonic_fallback_strict_1_to_1"
description: "Documenta la arquitectura definitiva para inyección de Evasión Nuclear (3xx, 4xx, 5xx) y Redundancia PEVCE (CMAF/TS) dentro de un manifiesto M3U8, cumpliendo rigurosamente la Doctrina 'Bulletproof 1:1'. Establece el estándar inmutable de inyección EOF (End Of File) para la string de la URL, garantizando que el bloque de metadata (60+ tags) sea interpretado perfectamente por OTT Navigator y ExoPlayer sin corrupción de IDs de canal."
---

# 🛡️ PEVCE Harmonic Fallback & Strict 1:1 (EOF URL Standard)

Este skill consolida tres de las más grandes victorias arquitectónicas del generador M3U8 v5.4 MAX AGGRESSION: **Evasión Nuclear**, **Redundancia PEVCE Armónica**, y la preservación inquebrantable de la **Doctrina Bulletproof 1:1**.

## 🎯 1. El Problema (Por qué los Parsers M3U8 se Rompían)

En versiones anteriores, al intentar aplicar redundancia de transporte (TS vs CMAF), se inyectaban bloques anidados `#EXT-X-STREAM-INF` directamente debajo de cada canal en la lista primaria. Esto generaba un comportamiento destructivo en reproductores basados en ExoPlayer (OTT Navigator, TiviMate):
- **Violación del 1:1**: Múltiples URLs seguidas sin su respectivo tag `#EXTINF` corrompen el secuenciador.
- **Master Playlist Inception**: `#EXT-X-STREAM-INF` convierte un ítem de canal en una "carpeta", dejando canales vacíos que causan el infame error *"0 Canales en Vivo"*.
- **Desincronización de Scope de Tags**: `#EXTVLCOPT` y `#EXTATTRFROMURL` generados *después* de pushear la URL se aplicaban mágicamente al canal **siguiente** en el M3U8, cruzando settings entre canales.

---

## 🏗️ 2. La Arquitectura Final (La Solución)

El protocolo de inyección ahora es dictatorial, estricto, y **Bulletproof**. Los metadatos fluyen en un orden inalterable que maximiza la compatibilidad y mantiene las funciones ultra-agresivas de evasión.

### Estructura Mandatoria de Bloques por Canal

La inyección de líneas en el array del M3U8 debe respetar estrictamente esta secuencia por canal:

1. **Declaración del Canal (`#EXTINF`)**: Inicia el objeto para el parser.
2. **Directivas Seguras (Tags APE de Evasión/Fallback)**:
   - Se utilizan tags inofensivos (`#EXT-X-APE-FALLBACK-UA:`, `#EXT-X-APE-FALLBACK-ID:`) que ExoPlayer ignora por no estar en el estándar, pero que nuestro ecosistema sí reconoce.
3. **Payload JSON (`#EXTHTTP`)**:
   - Cabeceras completas de Evasión y Network PEVCE (User-Agent, Cache, Threads).
4. **VLC / Kodi Props (`#EXTVLCOPT`, `#KODIPROP`)**:
   - Filtros restrictivos y escaladores de hardware (HQDN3D, BWDIF).
5. **Cortex / TDM (`#EXT-X-APE-CORTEX-...`)**:
   - Toda la telemetría, matrices HDR y Fallback logic.
6. **🎯 INYECCIÓN EOF DE LA URL (The Golden Rule)**:
   - La **ÚNICA** URL válida para streaming se imprime en la última línea del bloque.
   - En su querystring lleva integrada la cadena de inteligencia encriptada (Ej: `&pevce_fallback_chain=cmaf>ts&evasion_3xx=follow_10`).

### Visualización del Estándar

```m3u8
#EXTINF:-1 tvg-id="123" tvg-logo="logo.png", [FHD] Canal de Acción
#EXT-X-APE-FALLBACK-ID:403_NUCLEAR_EVASION_CMAF
#EXT-X-APE-FALLBACK-UA:Mozilla/5.0... Chrome/131.0.0.0
#EXT-X-APE-FALLBACK-TUNNEL:CONNECT
#EXTHTTP:{"User-Agent":"...","X-PEVCE-Network-Caching":"3000"}
#EXTVLCOPT:video-filter=deinterlace
#EXTATTRFROMURL:quality=top,resolution=highest
#EXT-X-APE-CORTEX-QUALITY-SCORE:95
... (80 tags de metadata más) ...
http://midominio.com/live/123/stream.ts?token=xyz123&pevce_fallback_chain=cmaf>ts&evasion_4xx=rotate_xff_ua_tunnel
```

---

## 🔥 3. Evasión Nuclear (3xx, 4xx, 5xx) Asíncrona

La inteligencia no reside en forzar 3 URLs crudas que rompan el parser, sino en **enviar UN SOLO endpoint** y dotarlo de inteligencia asíncrona vía Querystring. 

El Worker backend (o un player modificado que sepa leer el M3U8 local como OTT Navigator MAX_AGGRESSION) intercepta esa string y sabe cómo reaccionar silenciosamente:

- **Evasión 3xx**: `#EXT-X-APE-FOLLOW-REDIRECTS:true` y el parámetro `evasion_3xx=follow_10`.
- **Evasión 4xx (El Player Killer - 403 Forbidden)**: Al chocar con el 403, el worker salta instantáneamente a CMAF aplicando `evasion_4xx=rotate_xff_ua_tunnel` + rotación del User-Agent.
- **Evasión 5xx (Timeouts / Gateway Errors)**: Al fallar por 502/504, brinca a TS Directo (modo rescate final) y aplica `evasion_5xx=backoff_jitter_ts` + `#EXT-X-APE-FALLBACK-BACKOFF-MAX:32000` (Espera exponencial sin vomitar el error).

---

## 🛠️ 4. Reglas de Mantenimiento para Desarrolladores

Cualquier IA, módulo o ingeniero que modifique `m3u8-typed-arrays-ultimate.js` u otros generadores del ecosistema debe jurar lealtad a estas reglas:

1. **NO EXTRESTAR: CERO `#EXT-X-STREAM-INF` EN LA LISTA PRINCIPAL.** Esta etiqueta está maldita en listas masivas. Destroza IPTV. Solo debe usarse en scripts M3U8 dinámicos (Sub-Manifests por canal en Origin Servers).
2. **NO ENCADENAR URLS:** Está prohibido que un `#EXTINF` expulse más de 1 link "http://". La redundancia (CMAF o Rescate TS) fluye en el Querystring (`&pevce_fallback_chain=...`), nunca como cadenas expuestas.
3. **PUNTERO DE ASIGNACIÓN (EOF INJECTION):** La URL primaria **SIEMPRE ES LA ÚLTIMA LÍNEA** (`lines.push(finalUrl); return lines.join('\n');`). En el protocolo M3U8, todo metadato `#EXT` pertenece legalmente a la URL inferior más próxima. Posicionar metraje debajo de la URL significa regalar esa configuración al canal subsiguiente.
4. **NO EMITIR TAGS VACÍOS:** Nunca inyectar `#KODIPROP:` o `#EXTVLCOPT:` sin valor del lado de asignación (ej: `=none` vs vacio) ya que las expresiones regulares de ExoPlayer generarán un Loop o asimilarán de forma *greedy* (glotona) a la URL de stream.

---

## 📝 Resumen del Algoritmo del Generador Actual:
*`generateChannelEntry` -> Crea EXTINF -> Inyecta Evasiones Tags -> Inyecta VLC/Kodi -> Inyecta Cortex APE -> Forja finalUrl -> Inserta finalUrl EOF -> Retorna bloque compilado.*

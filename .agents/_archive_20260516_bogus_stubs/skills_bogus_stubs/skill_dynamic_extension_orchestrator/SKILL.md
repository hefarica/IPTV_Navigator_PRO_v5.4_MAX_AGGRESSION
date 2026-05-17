---
name: Skill Dynamic Extension Orchestrator (Frontend UI)
description: Regla estricta sobre la asignación dinámica de extensiones (.ts vs .m3u8) en la generación de M3U8 desde el Frontend para evitar Streaming Hangs (Cuelgues de reproducción).
---

# Skill: Dynamic Extension Orchestrator

## Contexto Forense (Abril 2026)
Durante la fase de estabilización del ecosistema OMEGA v5.4, se descubrió que reproductores como VLC y ExoPlayer se colgaban ("Loading" infinito) en listas M3U8 si el origen de proveedores específicos (como Dream4K y KemoTV) se solicitaba usando la extensión `.m3u8`. Otros proveedores, como TiviOne, procesaban `.m3u8` perfectamente. 
Asumir que un canal Live siempre requiere `.m3u8` causa rechazos 502/Connection Reset.

## Doctrina Absoluta de Inyección de Extensión
Esta skill es **obligatoria** para cualquier bloque de código en `m3u8-typed-arrays-ultimate.js`, `generate_real_m3u8.py` u otra pieza que ensamble una URL:

1. **No Asumir `.m3u8` por Defecto en Live Streams:**
   La extensión por defecto genérica para canales Live Xtream-Codes debe ser `.ts`.
   
2. **Orquestación Dinámica por Proveedor (ServerType):**
   - Si el Hostname contiene `tivione` o `tivi-ott`, la extensión debe forzarse explícitamente a `.m3u8`.
   - Si el Hostname pertenece a arquitecturas estrictas de transporte (KemoTV, Dream4K, `nov202gg`, `ky-tv`), la extensión obligatoria debe ser `.ts`.
   - Para flujos VOD, se debe mantener `.mp4` o `.mkv` respetando la API.

3. **Inyección Limpia en el Proxy URL:**
   Cuando la UI construye la cadena `resolve_quality_unified.php?url=...`, el parámetro encodeado en `url=` DEBE incluir esta extensión dinámica (ej. `http://ky-tv.cc/live/user/pass/123.ts`). El backend evaluará esa misma extensión original para desencadenar defensas reactivas (Ver Skill 302 Redirect Shield).

## Consecuencias de Infracción
Violentar esta regla construirá queries hacia el proxy y el origen que derivarán en "ADN DE CANAL CORRUPTO" (por fallos de parser) o en caídas masivas de "Buffer Float" debido a asincronía en fragmentos HLS inexistentes.

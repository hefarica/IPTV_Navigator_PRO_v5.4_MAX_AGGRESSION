---
description: Metadata Intelligence Engine v5 (Anti-509 Compliant & Zero-Playback)
---

# FASE 5: Metadata Intelligence Engine & Anti-509 Guardian

Esta habilidad define la doctrina obligatoria e inmutable para el análisis avanzado de metadatos (clasificación, scoring, detección de códecs) dentro del Unified Resolver (`resolve_quality.php`) sin violar la restricción de conexiones del proveedor IPTV (Error 509 Bandwidth Limit Exceeded).

## 1. Regla Suprema "Zero-Zapping Probes" (Anti-509)
El reproductor IPTV (Ej: OTT Navigator, TiviMate) realiza peticiones concurrentes masivas (pre-buffering, EPG mapping) al cargar listas. 
**ESTÁ ESTRICTAMENTE PROHIBIDO:**
Que el `resolve_quality.php` ejecute `MetadataEngine->fetchManifest()` durante la resolución normal de un zapping (Paso 2b).
Cualquier intento dinámico de descargar el M3U8 durante el zapping multiplicará las conexiones hacia la cuenta Xtream Codes del usuario, provocando el baneo inmediato (HTTP 509).

**Implementación Correcta (Paso 2b):**
```php
if ($cachedMeta) {
    // Si la data fue obtenida vía cluster, usarla para enriquecer QoS.
    $qosRef = $metaEngine->enrichQosRef($qosRef, $metaResult);
} else {
    // FALLBACK SILENCIOSO: Nunca sondear la red localmente en un request HTTP normal.
    $metaVerified = false;
}
```

## 2. Escaneo en Clúster (meta-cluster)
Para adquirir la metadata de forma segura, se debe utilizar el endpoint especializado `meta-cluster` llamado desde el frontend antes o después de la generación estática.
El endpoint de cluster procesa lotes (batches) pero **debe interceptar cierres de conexión** de forma inmediata.

**Regla de Supresión de Zombis (Zombie Connection Killer):**
Cualquier subproceso o bucle de descarga masiva (Ej: `curl_multi_exec`) debe incluir el comando `if (connection_aborted()) { break; }` obligatoriamente. Esto garantiza que si el usuario cierra el navegador o cancela el escaneo, el VPS cierra limpiamente todos los subprocesos de red hacia el proveedor IPTV y evita acaparar conexiones.

## 3. APE-META DNA TAGS (Inyección Estática)
La telemetría escaneada por el frontend se aloja temporalmente en IndexedDB.
Durante la inyección sobre la base estática `.m3u8` final, los siguientes tags (DNA) se inyectan post `#EXTM3U`, lo que le indica al `resolve_quality.php` que no debe re-escanear:
- `#EXT-X-APE-META-VERIFIED: true`
- `#EXT-X-APE-META-BITRATE: [valor]`
- `#EXT-X-APE-META-RESOLUTION: [valor]`
- `#EXT-X-APE-META-CODEC: [valor]`
- `#EXT-X-APE-META-CONTENT: [valor]`
- `#EXT-X-APE-META-CONFIDENCE: [valor]`
- `#EXT-X-APE-META-SCORE: [valor]`

## 4. Persistencia en Memoria (Mocking Local vs Redis Prod)
*   **Producción (VPS):** Utiliza siempre `127.0.0.1:6379` vía la extensión phpredis nativa.
*   **Desarrollo (Local):** `MetadataEngine` emplea automáticamente `MockRedisCacheLayer` (basado en disco /tmp/ o json) transparentemente si detecta caída o ausencia del servicio Redis local en el equipo de desarrollo Windows. No estallar el código en local.

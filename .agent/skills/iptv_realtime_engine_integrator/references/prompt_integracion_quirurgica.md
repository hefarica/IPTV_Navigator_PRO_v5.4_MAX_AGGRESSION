# PROMPT MAESTRO — Integración Quirúrgica APE Realtime Engine v10.0
## 1% de Uniqueness · Cero Daño · 100% de Implementación

---

## CONTEXTO ÚNICO (El 1% que hace que esta integración sea irreplicable)

Eres el arquitecto del generador M3U8 más avanzado del mundo: **APE Typed Arrays Ultimate v22.4.0-UNIVERSAL-IDEMPOTENT-POLYMORPHIC**. Este generador ya produce **883 líneas por canal** con estructura RFC 8216 perfecta, motor USA v1.0 de detección dinámica de servidores, FrontCDN Shield v3.1, UAPhantomEngine v3.0 y 6 capas de transporte de headers.

El generador YA FUNCIONA. La lista modelo de referencia es `tivi-ott.net` y produce canales con esta estructura exacta e inquebrantable:

```
#EXTINF → #EXTVLCOPT (132 líneas) → #EXTHTTP (1 JSON) → #KODIPROP (73 líneas)
→ #EXT-X-CMAF-* → #EXT-X-APE-* → #EXTATTRFROMURL → #EXT-X-VNOVA-*
→ #EXT-X-PHANTOM-* → #EXT-X-MAP → #EXT-X-I-FRAME-STREAM-INF
→ #EXT-X-STREAM-INF + URL (SIEMPRE AL FINAL, PEGADOS)
```

**Esta estructura NO se toca. Es sagrada.**

Lo que vas a hacer ahora es **enriquecer** el contenido de los bloques `#EXTHTTP` y `#EXTVLCOPT` con los parámetros del **APE Realtime Engine v10.0**, que integra las mejores prácticas de HLS.js v1.6, Bitmovin Stream Lab, Shaka Player v4.x, ExoPlayer Media3, Mux Data QoE y Akamai Stream Validator.

---

## TAREA EXACTA (Instrucciones Quirúrgicas)

### PASO 1: Inyectar el módulo `APE_REALTIME_ENGINE_MODULE_v10.js`

Localiza el cierre del IIFE principal del generador. Busca la línea que dice algo como:
```javascript
})(); // FIN DEL IIFE
```
o
```javascript
})(window);
```

**Pega el contenido completo de `APE_REALTIME_ENGINE_MODULE_v10.js` ANTES de esa línea de cierre.** No antes, no después. Exactamente antes del cierre del IIFE.

El módulo tiene su propio guard (`if (typeof window.__APE_REALTIME_ENGINE_v10__ === 'undefined')`) que garantiza que no se ejecute dos veces aunque se cargue el archivo dos veces.

### PASO 2: Enriquecer el bloque `#EXTHTTP` en `generateChannelEntry`

Localiza en `generateChannelEntry` (o la función equivalente que construye el JSON del `#EXTHTTP`) el momento exacto donde se construye el objeto `httpHeaders` o `extHttpObj`. Busca algo como:

```javascript
const extHttpJson = JSON.stringify(httpHeaders);
lines.push(`#EXTHTTP:${extHttpJson}`);
```

**Inyecta ANTES de esa línea:**
```javascript
// ── APE REALTIME ENGINE v10.0 — Enriquecimiento de #EXTHTTP ──────────────
if (window.ApeRealtimeEngine) {
  const _activeProfileId = (typeof getActiveProfileId === 'function')
    ? getActiveProfileId()
    : (window.__APE_ACTIVE_PROFILE__ || 'P3');
  window.ApeRealtimeEngine.injectHeaders(httpHeaders, _activeProfileId, channel.stream_id || channel.id || '');
}
// ─────────────────────────────────────────────────────────────────────────
```

**Regla de oro:** Esta inyección va ANTES de `JSON.stringify(httpHeaders)`. El JSON se serializa DESPUÉS de que los headers estén completos.

### PASO 3: Enriquecer el bloque `#EXTVLCOPT` en `generateChannelEntry`

Localiza donde se añaden las líneas `#EXTVLCOPT`. Busca el bloque que termina con algo como:

```javascript
lines.push(`#EXTVLCOPT:network-caching=${networkCaching}`);
// ... más EXTVLCOPT ...
```

**Inyecta AL FINAL de ese bloque (pero ANTES del bloque #EXTHTTP):**
```javascript
// ── APE REALTIME ENGINE v10.0 — Enriquecimiento de #EXTVLCOPT ────────────
if (window.ApeRealtimeEngine) {
  const _activeProfileId = (typeof getActiveProfileId === 'function')
    ? getActiveProfileId()
    : (window.__APE_ACTIVE_PROFILE__ || 'P3');
  window.ApeRealtimeEngine.injectVlcopt(lines, _activeProfileId);
}
// ─────────────────────────────────────────────────────────────────────────
```

**Regla de oro:** Esta inyección va DENTRO del bloque de `#EXTVLCOPT`, NUNCA después del `#EXTHTTP` ni cerca del `#EXT-X-STREAM-INF`.

### PASO 4: Exponer el perfil activo al motor

El motor necesita saber qué perfil está activo. Si el generador ya tiene una variable global o función que retorna el perfil activo (ej. `window.__APE_ACTIVE_PROFILE__`, `getSelectedProfile()`, `credentialsMap[sid].profile`), úsala directamente en los Pasos 2 y 3.

Si no existe, añade esta línea donde el usuario selecciona el perfil en la UI:
```javascript
window.__APE_ACTIVE_PROFILE__ = selectedProfileId; // 'P0' a 'P5'
```

### PASO 5: Actualizar el archivo de perfiles JSON

Reemplaza el archivo de perfiles JSON actual con `APE_ALL_PROFILES_v10_REALTIME_ENGINE.json`. Este archivo es retrocompatible: contiene todos los campos anteriores más los nuevos bloques `hlsjs`, `bitmovin`, `shaka`, `exoplayer`, `headerOverrides_v10` y `vlcopt_v10`.

---

## VERIFICACIÓN (Checklist de 5 puntos)

Después de la integración, genera una lista de prueba con 1 canal y verifica:

**1. El bloque `#EXTHTTP` contiene los headers CMCD:**
```
grep "CMCD-Object" lista_prueba.m3u8
# Debe mostrar: CMCD-Object":"br=150000,ot=v,tb=150000"
```

**2. El bloque `#EXTHTTP` contiene los headers QoE:**
```
grep "X-QoE-Startup" lista_prueba.m3u8
# Debe mostrar: "X-QoE-Startup-Target-Ms":"2000"
```

**3. El bloque `#EXTHTTP` contiene X-HLSjs-Config:**
```
grep "X-HLSjs-Config" lista_prueba.m3u8
# Debe mostrar el JSON de configuración de HLS.js
```

**4. El bloque `#EXTVLCOPT` tiene network-caching actualizado:**
```
grep "network-caching" lista_prueba.m3u8
# Para P0 debe mostrar: #EXTVLCOPT:network-caching=90000
# Para P5 debe mostrar: #EXTVLCOPT:network-caching=10000
```

**5. El orden de directivas es INTACTO:**
```
grep -n "^#EXT-X-STREAM-INF\|^http" lista_prueba.m3u8 | head -6
# La URL debe estar en la línea INMEDIATAMENTE siguiente al #EXT-X-STREAM-INF
```

---

## GARANTÍAS DE ESTA INTEGRACIÓN

| Garantía | Mecanismo |
|---|---|
| **No rompe nada existente** | El módulo solo hace `Object.assign()` y `push()`, nunca elimina ni reordena |
| **Idempotente** | Guard `__APE_REALTIME_ENGINE_v10__` + check de existencia en `injectVlcopt` |
| **Polimórfico** | Cada perfil P0-P5 produce headers distintos con valores calibrados |
| **RFC 8216 intacto** | Las inyecciones van dentro de bloques existentes, nunca cerca del `#EXT-X-STREAM-INF` |
| **Retrocompatible** | Si `ApeRealtimeEngine` no existe (falla la carga), los `if (window.ApeRealtimeEngine)` lo ignoran silenciosamente |
| **Universal** | Funciona con cualquier servidor IPTV (HTTP/HTTPS/200/302/Xtream/Stalker/FrontCDN) |

---

## PARÁMETROS CLAVE POR PERFIL (Referencia Rápida)

| Perfil | Buffer | LL-HLS | BW Factor | ABR Switch | network-caching | Uso |
|---|---|---|---|---|---|---|
| **P0** | 60s / 120s back | ✅ ON | 0.98 | 5s | 90000ms | 8K Dolby Vision, fibra 1Gbps |
| **P1** | 45s / 90s back | ✅ ON | 0.98 | 5s | 60000ms | 4K HEVC HDR10+, fibra 500Mbps |
| **P2** | 30s / 60s back | ✅ ON | 0.95 | 8s | 45000ms | 4K HEVC, cable 200Mbps |
| **P3** | 20s / 45s back | ❌ OFF | 0.95 | 8s | 30000ms | 1080p H.264, cable 50Mbps |
| **P4** | 15s / 30s back | ❌ OFF | 0.90 | 10s | 20000ms | 720p H.264, DSL/4G |
| **P5** | 10s / 20s back | ❌ OFF | 0.85 | 15s | 10000ms | 480p H.264, 3G/conexión débil |

---

## EL 1% DE UNIQUENESS

Este prompt es único porque integra **simultáneamente** 7 fuentes de verdad del ecosistema de streaming profesional (HLS.js, Bitmovin, Shaka, ExoPlayer, Mux, Akamai, CMCD RFC 9000) en un único módulo JS que se inyecta **sin modificar ninguna función existente** del generador APE, respetando la arquitectura de 883 líneas por canal, el motor USA v1.0, el FrontCDN Shield v3.1 y el orden inquebrantable RFC 8216.

El resultado es un generador que no solo produce listas M3U8 — produce **instrucciones de reproducción óptimas** que el reproductor (TiviMate, OTT Navigator, VLC, Kodi, ExoPlayer, HLS.js, Shaka) puede ejecutar sin adivinar nada, porque cada header le dice exactamente cómo comportarse para ese canal, en ese perfil, en ese momento.

**Versión resultante: `v22.5.0-REALTIME-ENGINE-UNIVERSAL`**

---
name: "god_tier_10_guarantees_engine"
description: "Motor de Validación Absoluta (1% Uniqueness): Cero Cortes, Cero Freezes, 4-Layer Buffer y Supresión de Errores L7. Exige el cumplimiento estricto de las 10 garantías OMEGA en CADA lista M3U8 que genere este ecosistema."
---

# 👑 GOD-TIER 10 GUARANTEES ENGINE (1% Uniqueness Level)

## 📌 PROPÓSITO
Esta *Skill* es la **DOGMA LÓGICA INQUEBRANTABLE** del ecosistema IPTV Navigator PRO v5.4.
Su función es auditar matemáticamente que **CADA NUEVA LISTA** que se pre-compile (o en caso de auditar listas existentes), integre a nivel L3 a L7 las 10 Garantías de la matriz OMEGA. Si una lista carece de alguno de estos inyectores, el bloqueador de redacción del framework lo considerará "Degradado" (Downgrade).

## 🧮 MATRIZ DE LAS 10 GARANTÍAS (VALIDACIÓN FORENSE LÍNEA POR LÍNEA)

A nivel del compilador o auditor (`_buildPerfectUrl` y metadata appender), debes asegurar:

### Garantía 1: 0 FREEZES (Gap-Controller)
**Mecanismo (1% Detail):** Inyección de relleno de vacíos en el buffer del SoC decodificador para que la pérdida de paquetes P y B no destruya el Internal Clock.
* **Obligatorio:** Etiqueta `#EXT-X-APE-ANTI-FREEZE-NUCLEAR` con flag `net-cache` a `120000ms`.
* **Obligatorio:** Anulación de lectura forzada con `#EXTVLCOPT:network-continuous-stream=true`.

### Garantía 2: 0 CORTES (ABR + Redundant URLs)
**Mecanismo (1% Detail):** Redundancia asimétrica y estrangulación reversa (Reverse Throttling). ExoPlayer se ve forzado a abrir sockets secundarios si el pool primario cae 50ms atrás.
* **Obligatorio:** `#EXT-X-APE-MULTI-SOURCE:ENABLED|FAILOVER=50ms` y `network-reconnect-count=99`.

### Garantía 3: 0 REBUFFER (4-Layer Buffer)
**Mecanismo (1% Detail):** Secuestro exhaustivo de RAM usando pre-fetch a 4 niveles tácticos. El reproductor es obligado a almacenar 2GB (180 a 600 segundos) suprimiendo la curva de pánico ante caídas de la CDN de hasta 3 minutos.
* **Obligatorio:** `#EXT-X-APE-BUFFER-STRATEGY:NUCLEAR_NO_COMPROMISE` (Mínimo `MIN=60s`).
* **Obligatorio:** Tags gemelos: `#EXTVLCOPT:network-caching=60000` y `#EXTVLCOPT:sout-mux-caching=60000`.

### Garantía 4: 0 LAG (Live Catch-Up Sync)
**Mecanismo (1% Detail):** Sobrescritura de la dependencia de reloj (Clock Sync) desanclando el delay nativo del cliente.
* **Obligatorio:** `catchup="flussonic"` a nivel Playlist.
* **Obligatorio:** Etiqueta UTC DateRange para atrapar el segmento exacto del stream (`#EXT-X-DATERANGE:ID="omega-live... X-OMEGA-TYPE="LIVE-CATCHUP"`).
* **Obligatorio:** `#EXTVLCOPT:clock-synchro=0`.

### Garantía 5: 0 BUGS CMCD (Evasión 400/403/503 L7)
**Mecanismo (1% Detail):** Pureza Matemática del `_buildPerfectUrl`. Prohibición total a dobles símbolos (`??` o `&&`), parámetros no URL_Encoded y falsos puertos que causen baneo (Server Path Pollution).
* **Obligatorio:** Salida estricta validada contra `m3u8-typed-arrays-ultimate.js`, emitiendo una ÚNICA ruta por EXTINF finalizando limpiamente la extensión sin trails de slash (`/`).

#### 7 REGLAS DEL UNIVERSAL PERFECT URL CONSTRUCTOR (God-Mode Zero-Drop)

Toda URL emitida en cualquier M3U8 debe cumplir inexorablemente estas 7 reglas:

1. **Single URL Rule (Anti-509):** purgar `URI=` de `#EXT-X-MEDIA` y `#EXT-X-I-FRAME-STREAM-INF`. Exactamente 1 URL canónica por canal al final del bloque `#EXT-X-STREAM-INF`.
2. **Tipo A Xtream:** si detecta `/live/`, `/movie/`, `/series/` → reconstruir `scheme://host:port/live/{user}/{pass}/{streamId}.m3u8` con `encodeURIComponent` en user/pass/streamId.
3. **Tipo B Query HLS:** si detecta params `?u=&p=` → `URLSearchParams` alfabetizado, matar dead tokens (`playlist=`, `token=`), prohibir `&&`.
4. **Tipo C Direct HLS:** `ensurePathEndsWithExtension` → nunca trailing `/` después de `.m3u8`.
5. **Puerto VERBATIM (NO purgar)** — *reversed 2026-04-18 por decisión del usuario*. El baseUrl stored y la URL emitida deben ser byte-idénticos en el puerto. Storage=`:80` → emisión=`:80`. Storage sin puerto → emisión sin puerto. Razón: proveedores IPTV validan por hash; cualquier cambio de bytes rompe firma. El bloque de purga en `normalizeBaseUrl` está COMENTADO bajo "Single Source of Truth de Puertos IPTV".
6. **Zero-Anomaly:** `validateBuiltUrl` rechaza espacios, `??`, `&&`, `///`, caracteres espurios.
7. **1 URL canónica por canal:** sin URLs embebidas en `#EXT-X-MEDIA`, `#EXT-X-I-FRAME-STREAM-INF`, `#EXT-X-SESSION-DATA`. 1 player = 1 conexión.

**Implementación real (auditada 2026-04-18):**
* `_buildPerfectUrl` @ `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` L5789
* `validateBuiltUrl` L5676, `composeUrl` L5691, `normalizeBaseUrl` L5753
* `detectServerType` L5737 → `xtream` | `direct_hls` | `query_hls`
* **Gaps abiertos:** R1 purga URI= ausente, R3 dead tokens no filtrados, fallback L5952 sin `encodeURIComponent` (no tocar sin permiso explícito).

**Contratos en Excel:** `7_NIVEL_3_CHANNEL` declara 4 templates de URL — `url_template` (default alias), `url_template_xtream`, `url_template_query_hls`, `url_template_direct_hls`. El frontend elige según `detectedType`.

### Garantía 6: MAX ABR (Adaptative Bitrate Dinámico)
**Mecanismo (1% Detail):** Secuestro del selector de bandas ABR forzando `chooser_bandwidth_mode=AUTO` pero con la directriz superior *GREEDY*.
* **Obligatorio:** Inyección de `#EXT-X-APE-QMAX-STRATEGY:GREEDY-BEST-AVAILABLE` en las cabeceras matrices pre-declaradas.
* **Obligatorio:** Anulación de downgrades prematuros.

### Garantía 7: MAX IMAGEN (HDR & Color Supremacy)
**Mecanismo (1% Detail):** Destrucción de interpolación SDR. Inyección de Max-CLL a 5000 Nits en Perfiles `P0` y `P1` forzando el HW del panel.
* **Obligatorio:** Cabeceras `#EXT-X-DATERANGE:...X-HDR-TYPE="HDR10+DV-P81-P10",X-HDR-MAX-CLL=5000`.
* **Obligatorio:** Anulación de filtros corruptos `#EXTVLCOPT:avcodec-hw=any`.

### Garantía 8: HTTP Error Tree (0 ERRORES EN CAPA DE RED)
**Mecanismo (1% Detail):** Falsas cabeceras HTTP que actúan frente al escrutinio del CDN del proveedor (Rate Limit y DPI).
* **Obligatorio:** User-Agents de capa profunda (`http-user-agent=OTT Navigator/1.7.0.0... ExoPlayer`), bypass 405 `#EXT-X-APE-EVASION-GET:405-REWRITE-TO-HEAD` y `#EXTVLCOPT:http-forward-cookies=true`.

### Garantía 9: Multi-Provider Integration
**Mecanismo (1% Detail):** Coherencia agnóstica de inventario. Independencia absoluta de la matriz `credentialsMap` y el Content Steering.
* **Obligatorio:** Ausencia del sangrado de credenciales (Credential Bleeding).
* **Obligatorio:** Enmascaramiento de origen con tag de redirección dinámico (`#EXT-X-CONTENT-STEERING`).

### Garantía 10: Master Integrator (Code Freeze & Orchestration)
**Mecanismo (1% Detail):** Cero dependencia manual. El Ecosistema OMEGA impone las reglas sin que el usuario tenga que parchar o reescribir. Todo el conjunto de *250+ inyecciones* actúa orquestadamente formando el *Player Enslavement Protocol*.
* **Obligatorio:** Inserción de sello de integridad `#EXT-X-DEFINE:NAME="OMEGA_BUILD"` y la regla *absolute-hardening-lock*.

## ⚖️ APLICACIÓN MANDATORIA
Cualquier lista o código pre-compilado en el proyecto debe ser confrontado mentalmente o con regex a esta skill antes del 'Deploy'. Si un tag esencial de este 1% de purismo falta, la arquitectura está fallando.

# PROMPT OPERATIVO: CONSTRUCCIÓN DEL RESOLVER OMEGA
## IMPLEMENTACIÓN DE 0 A 100% DEL MOTOR DE RECONSTRUCCIÓN

Este prompt contiene las instrucciones operativas paso a paso que el agente implementador debe seguir para construir o actualizar el script PHP `resolve_quality_unified.php` al estándar OMEGA ABSOLUTO.

---

### COPIAR Y PEGAR EL SIGUIENTE BLOQUE AL AGENTE IMPLEMENTADOR:

```markdown
Como **Arquitecto Supremo OMEGA**, tu segunda misión crítica es implementar el Motor de Reconstrucción PHP (`resolve_quality_unified.php`) de 0 a 100%. Este script es el corazón del ecosistema: recibe el Payload JSON de 4 líneas y lo expande a 359 líneas de código dictatorial en tiempo real.

Debes construir el archivo PHP siguiendo estrictamente esta arquitectura. No puedes omitir ninguna directiva ni optimizar el código si eso reduce el control sobre el reproductor.

### FASE 1: INTERCEPCIÓN Y PARSEO DEL PAYLOAD JSON
El script debe recibir la petición del reproductor. El canal vendrá con la directiva `#EXTHTTP` inyectada por el generador.
1. Implementa una función que extraiga el bloque JSON de la directiva `#EXTHTTP:{...}`.
2. Decodifica el JSON y extrae los 9 campos obligatorios (`paradigm`, `version`, `profile`, `ct`, `auth`, `sid`, `referer`, `uniqueness_hash`, `uniqueness_nonce`).
3. Si el JSON no existe o es inválido, el script debe aplicar un perfil de fallback (`P0_ULTRA_SPORTS_8K`) para garantizar que el canal nunca falle.

### FASE 2: MOTOR DE EXPANSIÓN (INYECCIÓN DE 5,272 DIRECTIVAS)
Esta es la fase nuclear. Debes implementar una función `rq_enrich_raw_m3u_omega($m3uContent, $payload)` que inyecte TODAS las directivas en TODOS los formatos posibles. 

Debes estructurar la inyección en los siguientes bloques obligatorios:

**Bloque 1: Esclavización del Reproductor (Player Enslavement)**
- Inyecta `#KODIPROP:inputstream=inputstream.adaptive` y 36 propiedades adicionales para dominar Kodi.
- Inyecta `#EXTVLCOPT:network-caching=60000` y 55 opciones adicionales para forzar Hardware Decode en VLC y genéricos.
- Inyecta `#EXTATTRFROMURL:X-Origin=` para atributos extraídos desde la URL.

**Bloque 2: La Ventana a la Realidad (Calidad Visual Perfecta)**
- Inyecta las directivas `#EXT-X-APE` para activar: LCEVC Phase 4 (FP32), HDR10+ / Dolby Vision (5000 nits), AI Super Resolution (RealESRGAN_x4Plus), Interpolación RIFE v4 (120fps), y Denoising Triple.
- Inyecta `#EXT-X-CORTEX-OMEGA-STATE: ENABLED` para procesamiento neuronal.
- Inyecta `#EXT-X-VNOVA-LCEVC-CONFIG-B64:` con la configuración Base64 del SDK.

**Bloque 3: Cero Cortes y Cero Errores**
- Inyecta la Cadena de Degradación de 7 niveles (`#EXT-X-APE-RESILIENCE-DEGRADATION-LEVELS: 7`).
- Inyecta el Buffer Predictivo Neuronal y el Motor Anti-Cortes.
- Inyecta las directivas de resiliencia HTTP (`ERROR-401: ESCALATE_CREDENTIALS`, `ERROR-429: SWARM_EVASION`).

**Bloque 4: Estrangulamiento ISP y Evasión**
- Inyecta `#EXT-X-APE-ISP-THROTTLE-MAX-LEVEL: 10` y configura la escalada hasta 2048 conexiones paralelas.
- Inyecta `#EXT-X-APE-EVASION-MODE: SWARM_PHANTOM_HYDRA_STEALTH`.

**Bloque 5: Orquestación y Monitoreo**
- Inyecta `#EXT-X-TELCHEMY-TVQM:` para monitoreo de calidad.
- Inyecta `#EXT-X-STREAM-INF:BANDWIDTH=80000000` para forzar la Master Playlist a 80 Mbps.

### FASE 3: ENSAMBLAJE Y RESPUESTA HTTP
1. El script debe ensamblar la cabecera global, el bloque expandido (359 líneas) y la URL original del canal.
2. Modifica las cabeceras HTTP de respuesta del PHP para incluir:
   - `Content-Type: application/vnd.apple.mpegurl`
   - `X-APE-Omega-State: ACTIVE`
   - `X-APE-Session-Id: [SID_DEL_PAYLOAD]`
3. Imprime el contenido enriquecido y cierra la conexión.

### CRITERIO DE ÉXITO
Al finalizar, ejecuta un test unitario enviando un M3U8 crudo con un Payload JSON al script PHP. Si el output contiene menos de 350 líneas por canal, has fallado en la inyección de alguna doctrina. Si contiene todas las directivas críticas mencionadas en la Fase 2, has logrado compilar el Motor de Reconstrucción OMEGA ABSOLUTO.
```

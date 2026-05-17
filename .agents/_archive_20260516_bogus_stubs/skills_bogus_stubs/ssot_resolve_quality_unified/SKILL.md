---
name: "SSOT 'Médula Híbrida' (Unified Resolver Routing)"
description: "Regla estricta: resolve_quality_unified.php es el único resolver activo. resolve_quality.php queda deprecado y funciona exclusivamente como redirector."
---

# SSOT 'Médula Híbrida' (Unified Resolver Routing)

## 📌 Principio Arquitectónico (Regla de Oro)

El ecosistema **IPTV Navigator PRO (APE v16+)** ha migrado permanentemente a una arquitectura unificada.
El archivo `resolve_quality_unified.php` (la *Médula Espinal Híbrida*) es ahora el **Single Source of Truth (SSOT)** (Única Fuente de Verdad) para **TODA** la lógica de resolución, autenticación, inyección ABR, evasión (Nuclear/Ghost) y Telemetría Guardian.

Como resultado, **ESTÁ ESTRICTAMENTE PROHIBIDO** utilizar, modificar o apuntar peticiones al archivo antiguo `resolve_quality.php` o sus variantes como generadores principales.

## 🛡️ Implementación de Contención (Redirector)

Para evitar roturas (breaking changes) en clientes M3U8 legacy cacheados en los reproductores (OTT Navigator / TiviMate), el antiguo script `resolve_quality.php` ha sido despojado de toda su lógica estructural y se ha transformado en un simple **Redirector Transparente**.

Su único cuerpo de código permitido es:

```php
<?php
// SSOT FORWARDER TO UNIFIED MEDULA
require_once __DIR__ . '/resolve_quality_unified.php';
```

## 🔄 Consecuencias en Frontend (Generadores M3U8)

1. **Variables Base**: Todo generador (ej: `m3u8-typed-arrays-ultimate.js`, `m3u8-api-wrapper-integrated.js`) **DEBE** apuntar siempre la constante `resolveScript` al endpoint `resolve_quality_unified.php`.
2. **Logs y Modulos GUI**: El `ApeModuleManager` y los logs por consola **NUNCA** deben mencionar la ruta de la API legacy `/api/resolve_quality` como destino del reproductor VIP, sino `/resolve_quality_unified.php`.
3. **Mapeo Transparente NGINX**: Nginx reescribirá cualquier petición a la API legacy para que caiga en `resolve_quality.php` el cual, actuando de puente, invitará inmediatamente a la función `rq_handle_request()` de la *Médula Híbrida* unificada.

## 🛑 Prohibiciones (Zero-Tolerance)

- ❌ NO resucitar `resolve_quality.php`
- ❌ NO inyectar parches a iteraciones viejas copiadas (e.g., *resolver_backup.php*)
- ❌ NO referenciar `/api/resolve_quality` dentro de nuevos módulos M3U8 HLS
- ❌ Toda inyección de Telemetría UDP / Shm (RAM Disk) se aplica única y exclusivamente al Unified Resolver.

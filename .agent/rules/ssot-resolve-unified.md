REGLA ABSOLUTA — SSOT UNIFIED RESOLVER ROUTING

Esta regla define arquitectónicamente y OPERATIVAMENTE a `resolve_quality_unified.php` (La Médula Espinal Híbrida) como el ÚNICO archivo de lógica resolver permitido en el entorno VPS y M3U8 para la versión APE v16+.

1. PROHIBICIÓN DE LÓGICA EN ARCHIVO ORIGEN: El archivo `resolve_quality.php` clásico, por cuestiones de retrocompatibilidad estricta con cachés de reproductores, SOLO puede contener un INCLUDE hacia `resolve_quality_unified.php`.
```php
<?php require_once __DIR__ . '/resolve_quality_unified.php'; 
```
2. EDICIÓN ÚNICA: Toda modificación a telemetría (Guardian), inyecciones de cabeceras, o fixes estructurales (e.g. anti-509) SE HARÁN ÚNICAMENTE dentro de `resolve_quality_unified.php`.

3. FRONTEND GENERATORS (JS): Ningún log en `ape-module-manager.js`, ni generador M3U8 local (`m3u8-typed-arrays-ultimate.js`, `m3u8-api-wrapper-integrated.js`) o string M3U exportada tiene permitido enlazar o usar `/api/resolve_quality` ó `/resolve_quality.php` como su destino preferente. Deben forzar la escritura de `https://(host)/resolve_quality_unified.php?ch=(ID)` de forma inamovible.

4. INFRACCIÓN SEVERA: El volver a depositar lógica, sentencias `echo`, o cabeceras HTTP en `resolve_quality.php` clásico o apuntar generadores a la ruta antigua en lugar del Unified causará la amputación y degradación del ecosistema de Telemetría UDP / RAM-Disk, rompiendo el APE v16 Exchange Panel. Manten este principio INVIOLADO.

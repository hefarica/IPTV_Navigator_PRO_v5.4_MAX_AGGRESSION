---
description: Regla de orquestación y despliegue del Single Source Of Truth (SSOT) para el Resolver Unificado APE v16+
---

# SSOT Resolver Workflow

Este flujo es OBLIGATORIO al auditar, corregir bugs, o desplegar una nueva directiva HTTP/HLS a la capa de streaming.

### 1. Modificar SOLO en resolve_quality_unified.php
Cualquier modificación lógica relacionada a:
- Generación de respuestas manifiestos M3U8/DASH
- Telemetría de Guardián (`sessionPing`, RAM Disk)
- Lógica ABR (Adaptive Bitrate) o Buffer Predictivo
- Redirecciones HTTP 302 y 206 (Rutas Proxy) o Explotaciones Xtream

Debe inyectarse de forma absoluta **ÚNICAMENTE** en `resolve_quality_unified.php`.

### 2. Mantenimiento del Forwarder legacy 
Nunca se debe tocar código dentro del obsoleto `resolve_quality.php`. Dicho archivo es **SAGRADO**, intocable, inmutable y ahora funge única y exclusivamente bajo la Doctrina de un Gateway passthrough ("Redirector de Inercia"):
```php
<?php require_once __DIR__ . '/resolve_quality_unified.php'; 
```
Lo debes subir siempre si lo modificaste sin querer; pero bajo ningún pretexto debes revertir su comportamiento como puente.

### 3. Modificaciones GUI (Extensión del SSOT)
Toda nueva configuración que el Administrador o Gestor de Perfiles exporte, debe reflejarse forzando que la string resultante hacia el reproductor mencione siempre al nuevo archivo y reniegue de URL aliases `/api/` en la medida de lo posible:
`baseUrl = https://iptv-ape.duckdns.org/resolve_quality_unified.php?ch=ID`

## ✅ Despliegue 
Sube el nuevo `resolve_quality.php` (El esqueleto Require) y la nueva iteración de tu `resolve_quality_unified.php` (Centro de Gravedad) en un paquete atómico (ver la skill Despliegue Quirúrgico).

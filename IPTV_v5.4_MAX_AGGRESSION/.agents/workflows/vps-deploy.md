---
description: VPS deployment paths and file structure for iptv-ape.duckdns.org (178.156.147.234)
---

# VPS Deployment — IPTV APE (Skill 022)

## ⚠️ REGLA ABSOLUTA
**NUNCA muevas archivos de ubicación en el VPS. Adaptarse SIEMPRE a la estructura existente.**

## Nginx Root & Paths

| Concepto | Ruta Real VPS |
|:---|:---|
| **Nginx Root** | `/var/www/html` |
| **resolve_quality.php** | `/var/www/html/resolve_quality.php` |
| **cmaf_engine/** | `/var/www/html/cmaf_engine/` |
| **cmaf_engine/modules/** | `/var/www/html/cmaf_engine/modules/` |
| **Listas M3U8** | `/var/www/html/lists/` |
| **channels_map.json** | `/var/www/html/channels_map.json` |
| **PHP-FPM** | `unix:/run/php/php8.3-fpm.sock` |
| **Nginx config** | `/etc/nginx/sites-enabled/default` |

> [!CAUTION]
> El root NO es `/var/www/iptv-ape/` — esa ruta NO existe como nginx root.
> Cualquier archivo PHP debe ir en `/var/www/html/`.

## Estructura de Archivos PHP (Producción)

```
/var/www/html/
├── resolve_quality.php          ← Resolver Gold Standard
├── upload.php                   ← Upload gateway
├── upload_chunk.php             ← Chunked upload
├── finalize_upload.php          ← Upload finalization
├── verify.php                   ← Verificación
├── cmaf_engine/
│   ├── cmaf_integration_shim.php
│   ├── resilience_integration_shim.php  ← v6.0 NEW
│   └── modules/
│       ├── resilience_engine.php         ← Existing
│       ├── qos_qoe_orchestrator.php      ← Existing
│       ├── neuro_buffer_controller.php   ← v6.0 NEW
│       └── modem_priority_manager.php    ← v6.0 NEW
└── lists/
    └── *.m3u8 (gzip_static)
```

## Despliegue Paso a Paso

// turbo-all

```bash
# 1. Backup antes de tocar CUALQUIER archivo
ssh root@178.156.147.234 "cp /var/www/html/resolve_quality.php /var/www/html/resolve_quality.php.bak_$(date +%Y%m%d_%H%M%S)"

# 2. Crear directorios si no existen
ssh root@178.156.147.234 "mkdir -p /var/www/html/cmaf_engine/modules"

# 3. SCP archivos (desde el directorio backend/ local)
scp "cmaf_engine/modules/ARCHIVO.php" root@178.156.147.234:/var/www/html/cmaf_engine/modules/
scp "cmaf_engine/ARCHIVO.php" root@178.156.147.234:/var/www/html/cmaf_engine/
scp "resolve_quality.php" root@178.156.147.234:/var/www/html/resolve_quality.php

# 4. Permisos
ssh root@178.156.147.234 "chown -R www-data:www-data /var/www/html/cmaf_engine/ && chown www-data:www-data /var/www/html/resolve_quality.php"

# 5. Validar sintaxis PHP
ssh root@178.156.147.234 "php -l /var/www/html/resolve_quality.php"

# 6. Recargar PHP-FPM
ssh root@178.156.147.234 "systemctl reload php8.3-fpm"

# 7. Smoke test
ssh root@178.156.147.234 "php /tmp/test_rq_debug.php 2>&1 | head -5"
```

## Rollback

```bash
ssh root@178.156.147.234 "cp /var/www/html/resolve_quality.php.bak_TIMESTAMP /var/www/html/resolve_quality.php && systemctl reload php8.3-fpm"
```

## Info del Servidor

| Campo | Valor |
|:---|:---|
| IP | 178.156.147.234 |
| Dominio | iptv-ape.duckdns.org |
| Proveedor | Hetzner |
| SSH User | root |
| PHP | 8.3-fpm |
| Nginx | sites-enabled/default |
| Owner | www-data:www-data |
| Permisos | 644 para PHP |

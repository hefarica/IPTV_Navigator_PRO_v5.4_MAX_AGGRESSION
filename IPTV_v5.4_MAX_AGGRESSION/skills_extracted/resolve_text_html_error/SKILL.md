---
name: resolve_text_html_error
description: How to diagnose and fix when the IPTV resolver returns text/html instead of M3U8, causing players to show "None of the available extractors could read the stream [[text/html; charset=UTF-8]]"
---

# Skill: Resolver text/html Error Fix

## Síntoma
El player (OTT Navigator, VLC, Kodi) muestra:
```
Error occurred
None of the available extractors (b, b, a, d, f, a, w, c, C, b, e, a, c, d, a) could read the stream [[text/html; charset=UTF-8]].
```

## Causa Raíz
PHP tiene un **error de sintaxis** en `resolve_quality.php`. Cuando PHP falla, Nginx devuelve la página de error como `text/html` en lugar del M3U8 esperado (`application/vnd.apple.mpegurl`).

## Diagnóstico (3 pasos)

### 1. Verificar Content-Type
```bash
curl -sk -D- -o /dev/null 'https://localhost/iptv-ape/resolve_quality.php?ch=12&srv=TOKEN' | grep Content-Type
```
- ✅ Correcto: `application/vnd.apple.mpegurl; charset=utf-8`
- ❌ Error: `text/html; charset=UTF-8`

### 2. Verificar PHP syntax
```bash
php -l /var/www/html/iptv-ape/resolve_quality.php 2>&1
```
Ejemplo de error real encontrado:
```
PHP Parse error: syntax error, unexpected token "]", expecting "," or ")" in resolve_quality.php on line 3583
```

### 3. Encontrar la línea exacta
```bash
sed -n '3578,3590p' /var/www/html/iptv-ape/resolve_quality.php
```

## Caso Real: Líneas Corruptas (2026-03-28)

### El Error
Líneas 3571-3575 contenían código corrupto residuo de un edit anterior:
```php
// CORRUPTO — estas 5 líneas causaban el parse error:
    if (!empty([" zapping][ext_http])) {
 }
 }
 }
 }
```

### La Solución
```bash
sed -i '3571,3575d' /var/www/html/iptv-ape/resolve_quality.php
php -l /var/www/html/iptv-ape/resolve_quality.php  # Verificar
systemctl restart php8.3-fpm
```

### Verificación Post-Fix
```bash
curl -sk 'https://localhost/iptv-ape/resolve_quality.php?ch=12&srv=TOKEN' \
  -H 'User-Agent: OTT Navigator/1.6.7.3' \
  -o /dev/null -w '%{http_code} %{content_type}\n'
# Esperado: 200 application/vnd.apple.mpegurl; charset=utf-8
```

## Reglas de Prevención

1. **SIEMPRE** ejecutar `php -l` después de cualquier edit a archivos PHP del resolver
2. **SIEMPRE** verificar Content-Type con curl después de reiniciar php-fpm
3. **NUNCA** hacer edits parciales que dejen brackets/llaves huérfanas
4. Los edits con Python `str.replace()` pueden dejar residuos si el target string no matchea exactamente — verificar output
5. Hacer backup antes de patchar: `cp resolve_quality.php resolve_quality.bak.php`

## Archivos Afectados
- `/var/www/html/iptv-ape/resolve_quality.php` — Resolver principal (3,900+ líneas)
- `/var/www/html/iptv-ape/rq_sniper_mode.php` — Sniper Mode module

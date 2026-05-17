---
name: "Diagnóstico Forense PHP 500 — Bypass de Supresión de Errores"
description: "Metodología quirúrgica para diagnosticar errores HTTP 500 silenciosos en PHP cuando display_errors=0 y error_reporting(0) ocultan la causa raíz real"
---

# Diagnóstico Forense PHP 500

## Problema que resuelve
Cuando un script PHP devuelve HTTP 500 con body vacío, y las líneas `ini_set('display_errors', '0')` + `error_reporting(0)` suprimen TODA visibilidad del error real. Los logs de PHP-FPM y Nginx no muestran nada útil.

## Metodología de 5 Pasos

### Paso 1: Verificar sintaxis PHP en el VPS
```bash
php -l /var/www/html/resolve_quality.php
php -l /var/www/html/ape_hls_generators.php
```
> Si pasa lint pero sigue el 500, el error es en **tiempo de ejecución** (funciones duplicadas, includes fallidos, variables indefinidas).

### Paso 2: Crear Debug Wrapper (bypass de supresión)
```bash
cat > /tmp/debug_500.sh << 'SCRIPT'
#!/bin/bash
FILE="/var/www/html/resolve_quality.php"
cp "$FILE" /tmp/resolve_bak.php
# Reemplazar supresión por revelación
sed -i "s/ini_set('display_errors', '0');/ini_set('display_errors', '1');/" "$FILE"
sed -i "s/error_reporting(0);/error_reporting(E_ALL);/" "$FILE"
# Capturar error real
HTTP_CODE=$(curl -s -o /tmp/debug_body.html -w '%{http_code}' 'https://iptv-ape.duckdns.org/resolve_quality.php?ch=1198&format=cmaf')
echo "=== HTTP CODE ==="
echo "$HTTP_CODE"
echo "=== BODY ==="
cat /tmp/debug_body.html
# Restaurar original
cp /tmp/resolve_bak.php "$FILE"
echo "=== RESTAURADO ==="
SCRIPT
chmod +x /tmp/debug_500.sh
bash /tmp/debug_500.sh
```

### Paso 3: Interpretar el Fatal Error revelado
Errores comunes descubiertos con este método:

| Error PHP | Causa raíz | Solución |
|---|---|---|
| `Cannot redeclare function_name()` | Función definida en 2 archivos que se incluyen mutuamente | Eliminar la copia duplicada |
| `Undefined variable $channel_data` | Variable usada antes de ser definida | Mover la llamada después de la asignación |
| `require_once failed` | Archivo incluido no existe en la ruta | Verificar rutas y permisos |
| `Call to undefined function` | Archivo con la función no se incluye | Agregar `require_once` |

### Paso 4: Verificar funciones duplicadas entre archivos
```bash
# Listar TODAS las funciones en resolve_quality.php
grep -n 'function serve_' /var/www/html/resolve_quality.php

# Listar TODAS las funciones en ape_hls_generators.php
grep -n 'function serve_' /var/www/html/ape_hls_generators.php

# Si aparecen nombres repetidos → DUPLICACIÓN CONFIRMADA
```

**Caso real resuelto (APE v18.3):**
- `resolve_quality.php` tenía `serve_hls_ignition()` en línea 1608
- `ape_hls_generators.php` tenía `serve_hls_ignition()` en línea 458
- `resolve_quality.php` hace `require_once 'ape_hls_generators.php'` en línea 68
- PHP carga ambas → `Fatal: Cannot redeclare serve_hls_ignition()`

### Paso 5: Eliminar duplicados con sed quirúrgico
```bash
# Backup primero
cp /var/www/html/resolve_quality.php /tmp/resolve_before_dedup.php

# Encontrar límites de la función duplicada
grep -n 'function serve_hls_ignition' /var/www/html/resolve_quality.php
# → Línea 1608

grep -n 'SWITCH MAESTRO' /var/www/html/resolve_quality.php
# → Línea 1720 (marca el fin de la zona de funciones)

# Eliminar el bloque completo
sed -i '1608,1718d' /var/www/html/resolve_quality.php

# Verificar
php -l /var/www/html/resolve_quality.php
systemctl restart php8.3-fpm
curl -s -o /dev/null -w '%{http_code}' 'https://iptv-ape.duckdns.org/resolve_quality.php?ch=1198&format=cmaf'
```

## Lecciones Clave
1. **NUNCA confíes en el HTTP code solo** — Un 500 con body vacío siempre es error PHP suprimido
2. **El lint de PHP (`php -l`) NO detecta redeclaraciones** — Solo detecta errores de sintaxis, no de ejecución
3. **Siempre restaurar el archivo original** después de habilitar display_errors
4. **Verificar AMBOS archivos** cuando hay `require_once` — la duplicación ocurre entre archivos, no dentro de uno solo

## Archivos involucrados
- `/var/www/html/resolve_quality.php` — Script principal del resolver
- `/var/www/html/ape_hls_generators.php` — Generadores de manifiestos HLS/DASH/CMAF
- `/var/www/html/ape_profiles.php` — Perfiles de calidad

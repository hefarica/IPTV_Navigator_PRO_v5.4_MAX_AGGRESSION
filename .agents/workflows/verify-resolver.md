---
description: How to verify resolve_quality.php after deployment using REAL credentials
---
// turbo-all

# Verify Resolve Quality — REGLA ABSOLUTA

## REGLAS INQUEBRANTABLES
1. **NUNCA** verificar con credenciales inventadas. Siempre usar `srv=` real.
2. **SIEMPRE** verificar que NGINX devuelve HTTP 200 (no solo el servidor del proveedor)
3. **SIEMPRE** verificar que PHP-FPM no tiene errores fatales
4. **SIEMPRE** revisar `/var/log/nginx/error.log` para confirmar cero 502/500
5. **SIEMPRE** verificar que la URL de stream apunta al servidor real del proveedor

## 1. Extraer credenciales reales de la última lista
```powershell
Select-String -Path "C:\Users\HFRC\Downloads\APE_TYPED_ARRAYS_ULTIMATE_*.m3u8" -Pattern "srv=" -SimpleMatch | Select-Object -First 1 | ForEach-Object { $m = [regex]::Match($_.Line, 'srv=([^&\s]+)'); if($m.Success) { $enc = [System.Uri]::UnescapeDataString($m.Groups[1].Value); Write-Host "SRV=$enc" } }
```

## 2. Syntax check en VPS (TODOS los archivos PHP)
```bash
ssh root@178.156.147.234 "php -l /var/www/html/resolve_quality.php; php -l /var/www/html/rq_sniper_mode.php; php -l /var/www/html/rq_anti_cut_engine.php; for f in /var/www/html/modules/*.php; do php -l \$f; done"
```
**Criterio**: TODOS deben decir "No syntax errors detected"

## 3. Reiniciar PHP-FPM y test con credenciales reales
```bash
ssh root@178.156.147.234 "systemctl restart php8.3-fpm; sleep 1; curl -s -o /dev/null -w 'NGINX_HTTP:%{http_code}\nTIME:%{time_total}s' 'https://iptv-ape.duckdns.org/resolve_quality.php?ch=1&p=P3&mode=adaptive&srv=<SRV_VALUE>'"
```
**Criterio**: NGINX_HTTP DEBE ser 200 (NO 502, NO 500, NO 503)

## 4. Validar contenido de la respuesta
```bash
ssh root@178.156.147.234 "curl -s 'https://iptv-ape.duckdns.org/resolve_quality.php?ch=1&p=P3&mode=adaptive&srv=<SRV_VALUE>' | head -10"
```
**Criterio**:
- La respuesta DEBE empezar con `#EXTM3U`
- La URL de stream DEBE contener el hostname del `srv` decodificado (NO localhost, NO IP inventada)
- DEBE incluir `#EXTINF` con metadata correcta
- DEBE incluir `#EXTHTTP` con directivas de enforcement

## 5. Verificar cero errores en logs
```bash
ssh root@178.156.147.234 "tail -5 /var/log/nginx/error.log | grep -c '502\|500\|fatal\|undefined'"
```
**Criterio**: El resultado DEBE ser `0`

## 6. Verificar módulos V3 operacionales
```bash
ssh root@178.156.147.234 "curl -s 'https://iptv-ape.duckdns.org/resolve_quality.php?action=sessions' | head -5"
```
**Criterio**: Debe devolver JSON con `active_sessions`

## SI ALGÚN PASO FALLA:
- NO declarar éxito
- Investigar el error inmediatamente
- Corregir antes de continuar
- Re-ejecutar TODA la verificación desde el paso 1

---
name: VPS Upload Gateway — Industrial Rules
description: Reglas absolutas para el sistema de upload de M3U8 al VPS Hetzner (iptv-ape.duckdns.org). Incluye sanitización de filenames, CORS, Nginx routing, PHP limits y URL construction.
---

# VPS Upload Gateway — Skill Industrial

## 🚨 REGLAS ABSOLUTAS — NUNCA ROMPER

### 1. NUNCA usar `encodeURIComponent()` en URLs de archivos
- Las URLs de archivos M3U8 NUNCA deben contener `%` (percent-encoding)
- Los nombres se sanitizan ANTES de subir, no después
- La regex de sanitización es: `/[^a-zA-Z0-9._-]+/g` → reemplazar con `_`
- Esto aplica en TODOS los archivos: `gateway-m3u8-integrated.js`, `gateway-manager.js`, `upload.php`

```javascript
// ✅ CORRECTO
const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, '_');
const url = `${vps_url}/lists/${safeName}`;

// ❌ PROHIBIDO — genera %20, %28, %29
const url = `${vps_url}/lists/${encodeURIComponent(filename)}`;
```

### 2. Sanitización de filenames — Triple Layer
El nombre del archivo se sanitiza en 3 puntos:

| Capa | Archivo | Función |
|------|---------|---------|
| **Client-side** | `gateway-m3u8-integrated.js` | `formData.append('file', file, safeName)` — antes de enviar |
| **Server-side** | `upload.php` (VPS) | `preg_replace('/[^a-zA-Z0-9._-]+/', '_', ...)` — al recibir |
| **URL display** | `gateway-manager.js` | `onVpsFileSelected()` — al construir la URL para el usuario |

### 3. Upload endpoint: `/upload.php` (NO `/api/upload`)
- **NUNCA** usar `/api/upload` — ese path es interceptado por `location /api/` en nginx y proxiado a Gunicorn (puerto 5001), que retorna 404
- El endpoint correcto es `/upload.php` que va directo a PHP-FPM
- Config en `gateway-m3u8-integrated.js`:
```javascript
endpoints: {
    upload: '/upload.php',    // ✅ Directo a PHP-FPM
    verify: '/api/upload/verify',
    health: '/api/health'
}
```

### 4. PHP Upload Response — Leer el `filename` sanitizado
El PHP (`upload.php`) devuelve:
```json
{
    "success": true,
    "filename": "APE_TYPED_ARRAYS_ULTIMATE_20260317_2_.m3u8",
    "bytes": 113000000,
    "url": "https://iptv-ape.duckdns.org/lists/APE_TYPED_ARRAYS_ULTIMATE_20260317_2_.m3u8"
}
```
- **SIEMPRE** leer `data.filename` y `data.url` del response
- Usar `file.sanitizedName = data.filename` para las verificaciones HEAD posteriores
- La URL final (`hintedUrl`) debe venir del campo `url` del JSON, NO construirla manualmente

### 5. CORS — Un solo `Access-Control-Allow-Origin: *`
- Nginx `/lists/` proxía al Guardian Engine (puerto 8080) que YA agrega CORS headers
- Nginx TAMBIÉN agrega CORS headers → resultado: `*, *` → browser rechaza
- **FIX**: Usar `proxy_hide_header` en el bloque `/lists/` de nginx:
```nginx
location ^~ /lists/ {
    proxy_pass http://127.0.0.1:8080/;
    # Strip upstream CORS to avoid duplicates
    proxy_hide_header Access-Control-Allow-Origin;
    proxy_hide_header Access-Control-Allow-Methods;
    proxy_hide_header Access-Control-Allow-Headers;
    proxy_hide_header Access-Control-Expose-Headers;
    # Nginx adds its own single CORS header
    add_header Access-Control-Allow-Origin "*" always;
    ...
}
```

### 6. PHP Limits para archivos grandes (100MB+)
En `/etc/php/8.3/fpm/conf.d/99-upload-limits.ini`:
```ini
upload_max_filesize = 500M
post_max_size = 500M
memory_limit = 512M
max_execution_time = 600
max_input_time = 600
```
- **PHP version**: 8.3 (NO 8.2)
- **FPM socket**: `/run/php/php8.3-fpm.sock`
- Nginx `client_max_body_size` ya está en `600M` a nivel de server block

### 7. VPS Access
- **IP**: `178.156.147.234` (Hetzner)
- **Dominio**: `iptv-ape.duckdns.org`
- **SSH**: `ssh root@178.156.147.234` (key auth, sin password)
- **Upload PHP**: `/var/www/iptv-ape/upload.php`
- **Lists dir**: `/var/www/iptv-ape/lists/`
- **Nginx config**: `/etc/nginx/sites-enabled/default`
- **3 server blocks**: port 80 (redirect), port 443 (main SSL), 127.0.0.1:80 (internal)

### 8. Nginx Location Priority Problem
```
location /api/ { proxy_pass http://127.0.0.1:5001; }  ← CATCHES /api/upload!
location = /api/upload { fastcgi_pass ... }            ← NEVER REACHED
```
- `location /api/` prefix match preempts `location = /api/upload` exact match when proxy_pass is involved
- **SOLUCIÓN**: No usar paths bajo `/api/` para PHP endpoints. Usar `/upload.php` directamente.

### 9. Deploy Script Pattern (PowerShell → SSH)
- PowerShell NO soporta `&&` — usar `;` o comandos separados
- PowerShell escaping de `sed` es un infierno → usar Python scripts vía SCP
- **Pattern correcto**:
```powershell
# 1. SCP the script
scp -o StrictHostKeyChecking=no /tmp/script.py root@178.156.147.234:/tmp/script.py
# 2. Run it (separate command)
ssh -o StrictHostKeyChecking=no root@178.156.147.234 "python3 /tmp/script.py"
```

### 10. Cache Busting
- Siempre bumpar el query string version al modificar scripts:
```html
<script src="js/gateway-m3u8-integrated.js?v=4.28.1"></script>
```
- Sin esto, el browser sigue usando la versión cacheada con los bugs

## Archivos Clave

| Archivo | Propósito |
|---------|-----------|
| `frontend/js/gateway-m3u8-integrated.js` | Upload engine: XHR POST → PHP, verify HEAD, show final URL |
| `frontend/js/gateway-manager.js` | UI manager: dropdown, file selection, config, `onVpsFileSelected()` |
| `frontend/js/vps-config.js` | Config centralizada: `DEFAULT_URL`, `API_URL`, `IPS_FALLBACK` |
| `frontend/index-v4.html` | HTML con dropdown `#gateway-fixed-url` y script tags con cache busters |
| VPS: `/var/www/iptv-ape/upload.php` | PHP receiver: sanitiza nombre, mueve a `/lists/`, retorna JSON |
| VPS: `/etc/nginx/sites-enabled/default` | Nginx: 3 server blocks, CORS, proxy rules |

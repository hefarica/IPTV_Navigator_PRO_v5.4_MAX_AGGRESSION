---
name: upload_pipeline_vps
description: "Pipeline completo de subida de listas M3U8 al VPS. Cubre: gateway frontend, sanitización de filenames, upload.php, CORS, verificación, auto-gzip post-upload, y list_files.php. Incluye todas las fixes certificadas para CORS duplicado, PHP limits y rutas API."
---

# 🚀 Upload Pipeline VPS

**Versión:** 2.0 (Post-Hotfix)  
**Módulos:** `gateway-m3u8-integrated.js`, `gateway-manager.js`, `upload.php`, `list_files.php`, `nginx-gzip.conf`

## 1️⃣ Flujo Completo

```
Frontend Toolkit → Genera .m3u8 → Gateway Upload → VPS upload.php
→ Guarda en /var/www/lists/ → Auto-gzip (compress + placeholder)
→ Nginx gzip_static sirve → Player IPTV consume
```

## 2️⃣ Frontend Gateway (`gateway-m3u8-integrated.js`)

### Configuración

```javascript
const CONFIG = {
    api_url: 'https://iptv-ape.duckdns.org/api',  // Base URL
    endpoints: {
        upload: '/upload',
        verify: '/upload/verify',    // ← NO /api/upload/verify (evita /api/api/)
        health: '/health'            // ← NO /api/health
    }
};
```

> [!CAUTION]
> `CONFIG.api_url` ya termina en `/api`. Los endpoints DEBEN ser relativos (sin `/api/` prefix).
> **NUNCA**: `/api/upload/verify` → produce URL `/api/api/upload/verify`
> **SIEMPRE**: `/upload/verify` → produce URL `/api/upload/verify`

### Sanitización de Filename

```javascript
const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
```

Maneja: espacios, paréntesis `()`, acentos, emojis, caracteres especiales.

## 3️⃣ Backend VPS (`upload.php`)

### Ruta de destino
```php
$TARGET_DIR = '/var/www/lists/';
```

### Auto-Gzip Post-Upload (Inyectado)
Después de guardar el archivo exitosamente:

```php
if (preg_match("/\.m3u8$/i", $finalFilename)) {
    $fullPath = $TARGET_DIR . $finalFilename;
    $gzPath = $fullPath . ".gz";
    exec("gzip -9 -f -k " . escapeshellarg($fullPath), $gzOut, $gzCode);
    if ($gzCode === 0 && file_exists($gzPath)) {
        file_put_contents($fullPath, "#EXTM3U\n");
        $response["gzip"] = true;
        $response["gz_size"] = filesize($gzPath);
    }
}
```

### PHP Limits Requeridos (`/etc/php/8.3/fpm/php.ini`)

```ini
upload_max_filesize = 600M
post_max_size = 650M
memory_limit = 512M
max_execution_time = 300
```

## 4️⃣ CORS — Regla de Oro

> [!CAUTION]
> **PHP envía sus propios CORS.** Nginx NUNCA debe agregar `add_header Access-Control-Allow-Origin` en el bloque PHP **fuera** del `if OPTIONS`. Doble header `*, *` = browser lo rechaza.

```nginx
location ~ \.php$ {
    # SOLO preflight OPTIONS — PHP maneja GET/POST CORS
    if ($request_method = OPTIONS) {
        add_header Access-Control-Allow-Origin "*" always;
        # ... otros headers
        return 204;
    }
    # NO add_header aquí fuera
    include snippets/fastcgi-php.conf;
    fastcgi_pass unix:/run/php/php8.3-fpm.sock;
}
```

## 5️⃣ Listado de Archivos (`list_files.php`)

El toolkit frontend llama `GET /list_files.php` para mostrar archivos disponibles.

- Escanea `$listsDir = '/var/www/lists/'`
- Devuelve JSON: `{"ok":true, "count": N, "files": [...]}`
- Incluye: `.m3u8`, `.m3u`, `.m3u8.gz`, `.zip`
- PHP envía sus CORS — Nginx NO debe duplicar

## 6️⃣ Symlink Obligatorio

```bash
ln -sf /var/www/lists /var/www/html/lists
```

- `upload.php` guarda en `/var/www/lists/`
- Nginx root es `/var/www/html`
- Request a `/lists/archivo.m3u8` busca en `/var/www/html/lists/` → symlink lo resuelve

## 7️⃣ Verificación

```bash
# Upload funciona
curl -X POST -F 'file=@test.m3u8' https://iptv-ape.duckdns.org/upload.php

# CORS no duplicado
curl -D- -H 'Origin: http://127.0.0.1:5500' https://iptv-ape.duckdns.org/list_files.php | grep Allow-Origin
# Debe mostrar UNA sola línea

# Gzip activo
curl -D- -H 'Accept-Encoding: gzip' https://iptv-ape.duckdns.org/lists/ARCHIVO.m3u8 | grep Content-Encoding
# Content-Encoding: gzip

# Disco libre > 2GB
df -h /
```

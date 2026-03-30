---
name: gzip_static_streaming_vps
description: "Protocolo completo para servir listas M3U8 de 500MB+ comprimidas via gzip_static + gunzip en Nginx. Cubre: pre-compresión, placeholder trick, auto-gzip post-upload, compatibilidad con Tivimate/OTT/Smarters/VLC, y configuración Nginx certificada."
---

# 📦 Gzip Static Streaming VPS

**Versión:** 1.0  
**Módulos Afectados:** `nginx-gzip.conf`, `upload.php`, `auto_gzip.sh`, `list_files.php`  
**Compatibilidad:** Tivimate, OTT Navigator, IPTV Smarters, VLC, Kodi, Perfect Player, GSE, Smart IPTV

## 1️⃣ Principio Fundamental

Las listas M3U8 de 400-500MB+ NO se deben servir sin comprimir. El protocolo almacena SOLO el `.m3u8.gz` en disco y usa los módulos Nginx `gzip_static` + `gunzip` para servir transparentemente:

| Tipo de Cliente | Qué Recibe | CPU VPS | Método |
|-----------------|-----------|---------|--------|
| Gzip-capable (Tivimate, OTT, VLC) | `.gz` raw con `Content-Encoding: gzip` | **0%** — sendfile directo | `gzip_static always` |
| Legacy (Smarters, algunos) | Contenido descomprimido `Transfer-Encoding: chunked` | Mínimo — streaming 16KB | `gunzip on` |

**Ahorro típico:** 69-85% (405MB → 127MB)

## 2️⃣ Arquitectura de Archivos

```
/var/www/lists/
├── APE_TYPED_ARRAYS_ULTIMATE_20260321.m3u8      ← 8 bytes (#EXTM3U placeholder)
├── APE_TYPED_ARRAYS_ULTIMATE_20260321.m3u8.gz   ← 127MB (archivo real comprimido)
├── otra_lista.m3u8                               ← 8 bytes placeholder
└── otra_lista.m3u8.gz                            ← comprimido

/var/www/html/lists → /var/www/lists  (symlink obligatorio)
```

### Placeholder Trick (CRÍTICO)

`gzip_static always` requiere que el archivo `.m3u8` EXISTA para que `try_files $uri` lo encuentre. Pero NO necesita ser el archivo real — basta con un placeholder de 8 bytes:

```bash
echo '#EXTM3U' > archivo.m3u8
```

Nginx encuentra el placeholder via `try_files`, luego `gzip_static` detecta el `.m3u8.gz` y lo sirve en su lugar.

## 3️⃣ Configuración Nginx (Certificada)

```nginx
location ~* \.m3u8$ {
    default_type application/vnd.apple.mpegurl;
    types { application/vnd.apple.mpegurl m3u8; }

    # GZIP STATIC: "always" sirve .gz incluso sin Accept-Encoding: gzip
    gzip_static always;

    # GUNZIP: Streaming decompression para clientes legacy
    # Lee .gz en chunks de 16KB, descomprime sin buffear en RAM
    gunzip on;
    
    # Vary para proxies/CDN
    gzip_vary on;

    # STREAMING BUFFERS: 32 × 16KB = 512KB pipeline (NADA vs 500MB)
    output_buffers 32 16k;

    # SENDFILE: zero-copy kernel para path comprimido
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;

    # CORS completo
    add_header Access-Control-Allow-Origin "*" always;
    add_header Access-Control-Allow-Methods "GET, HEAD, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Range, DNT, User-Agent, X-Requested-With, If-Modified-Since, Cache-Control, Content-Type, Accept-Encoding" always;
    add_header Access-Control-Expose-Headers "Content-Length, Content-Range, ETag, Last-Modified, Content-Encoding" always;

    if ($request_method = OPTIONS) {
        add_header Content-Type text/plain;
        add_header Content-Length 0;
        return 200;
    }

    add_header Accept-Ranges bytes always;
    add_header Cache-Control "public, max-age=300" always;
    expires 5m;

    limit_except GET HEAD {
        deny all;
    }

    try_files $uri =404;
}
```

**Módulos requeridos** (verificar con `nginx -V`):
- `--with-http_gzip_static_module`
- `--with-http_gunzip_module`

## 4️⃣ Auto-Gzip Post-Upload (Automatización)

### En upload.php — Inyección después del success:

```php
// ═══ AUTO-GZIP: Compress and replace with placeholder ═══
if (preg_match("/\.m3u8$/i", $finalFilename)) {
    $fullPath = $TARGET_DIR . $finalFilename;
    $gzPath = $fullPath . ".gz";
    exec("gzip -9 -f -k " . escapeshellarg($fullPath) . " 2>&1", $gzOut, $gzCode);
    if ($gzCode === 0 && file_exists($gzPath)) {
        file_put_contents($fullPath, "#EXTM3U\n");
        $response["gzip"] = true;
        $response["gz_size"] = filesize($gzPath);
        $response["original_replaced"] = true;
    }
}
```

### Script de mantenimiento `auto_gzip.sh`:

```bash
#!/bin/bash
# Cron: */5 * * * * /var/www/html/auto_gzip.sh
LISTS_DIR=/var/www/lists
for f in "$LISTS_DIR"/*.m3u8; do
    [ -f "$f" ] || continue
    gz="${f}.gz"
    size=$(stat -c%s "$f" 2>/dev/null || echo 0)
    [ "$size" -lt 100 ] && continue    # Skip placeholders
    gzip -9 -k "$f" 2>/dev/null
    if [ -f "$gz" ]; then
        echo '#EXTM3U' > "$f"
        echo "[auto_gzip] $(basename "$f"): ${size} -> $(stat -c%s "$gz") bytes"
    fi
done
```

## 5️⃣ CORS — Regla Anti-Duplicación

> [!CAUTION]
> **NUNCA** poner `add_header Access-Control-Allow-Origin "*"` en el bloque PHP **fuera** del `if OPTIONS`. PHP (`upload.php`, `list_files.php`) envían sus propios headers CORS. Si Nginx también los agrega, el browser recibe `*, *` y rechaza la petición.

**Regla:**
- `location ~ \.php$` → SOLO manejar OPTIONS preflight en Nginx
- GET/POST → PHP envía sus CORS (Nginx calla)
- `location ~* \.m3u8$` → Nginx maneja TODO el CORS (no hay PHP involucrado)

## 6️⃣ Verificación

```bash
# Test 1: Gzip client (debe mostrar Content-Encoding: gzip + 127MB)
curl -s -D- -o /dev/null -H 'Accept-Encoding: gzip' https://iptv-ape.duckdns.org/lists/ARCHIVO.m3u8

# Test 2: No-gzip (debe mostrar Transfer-Encoding: chunked, SIN Content-Encoding)
curl -s -D- -o /dev/null https://iptv-ape.duckdns.org/lists/ARCHIVO.m3u8

# Test 3: CORS no duplicado en PHP
curl -s -D- -o /dev/null -H 'Origin: http://127.0.0.1:5500' https://iptv-ape.duckdns.org/list_files.php | grep Allow-Origin
# DEBE mostrar UNA SOLA línea: Access-Control-Allow-Origin: *
```

## 7️⃣ PHP php.ini Requerido

```ini
upload_max_filesize = 600M
post_max_size = 650M
memory_limit = 512M
max_execution_time = 300
```

Ruta: `/etc/php/8.3/fpm/php.ini` → reiniciar: `systemctl restart php8.3-fpm`

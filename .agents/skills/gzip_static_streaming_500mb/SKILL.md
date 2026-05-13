---
name: "Gzip Static Streaming — Listas M3U8 de 500MB+ sin RAM Spike"
description: "Doctrina para servir listas M3U8 masivas (500MB+) comprimidas en disco (.gz), con descompresión streaming transparente via Nginx gzip_static + gunzip. Zero CPU per request. Compatible con OTT, TiviMate, Smarters, VLC, Kodi."
---

# 📦 Gzip Static Streaming — M3U8 500MB+ sin RAM Spike

**Versión:** 1.0
**Módulos Afectados:** `nginx-production.conf`, `finalize_upload.php`, `deploy_gzip_m3u8.sh`, `m3u8-gzip-module.js`
**Módulos Nginx Requeridos:** `ngx_http_gzip_static_module`, `ngx_http_gunzip_module`

## 1️⃣ Problema

Las listas M3U8 con densidad PEVCE (~922 líneas/canal) producen archivos de 80-500MB.
Servir 500MB de texto plano por request es inviable:
- Ancho de banda destruido (500MB × 100 requests/hora = 50GB/hora)
- `gzip on` dinámico comprime EN CADA REQUEST → CPU al 100% durante 5-10 segundos
- El archivo debe caber en RAM para Nginx + PHP → servidores pequeños mueren

## 2️⃣ Solución: Pre-Compressed + Streaming Decompression

### Arquitectura

```
.m3u8 → gzip -9 → .m3u8.gz (disco, una sola vez)
                        ↓
Cliente con gzip:    Nginx sirve .gz directo (ZERO CPU, sendfile kernel)
Cliente sin gzip:    gunzip streaming → 16KB chunks → TCP → cliente
```

### Directivas Nginx Críticas

```nginx
location ~* \.m3u8$ {
    # Sirve .gz si existe, SIEMPRE (incluso sin Accept-Encoding)
    gzip_static always;
    
    # Streaming decompress para legacy (16KB chunks, 512KB pipeline)
    gunzip on;
    
    # Vary para proxies/CDN
    gzip_vary on;
    
    # Control de memoria: 32 × 16KB = 512KB máximo por conexión
    output_buffers 32 16k;
}
```

### ¿Por qué `always` y no `on`?

| `gzip_static on` | `gzip_static always` |
|---|---|
| Solo sirve .gz si cliente envía `Accept-Encoding: gzip` | Sirve .gz SIEMPRE |
| Si no hay Accept-Encoding → busca el .m3u8 sin comprimir | Si no hay Accept-Encoding → `gunzip` descomprime streaming |
| Requiere mantener AMBOS archivos (.m3u8 + .gz) en disco | Puede funcionar SOLO con el .gz (ahorra disco) |

**Siempre usar `always`** para listas masivas → ahorra disco.

## 3️⃣ Pipeline de Upload

```
Browser → CompressionStream → .m3u8.gz → Upload chunked → VPS
                                                          ↓
VPS: finalize_upload.php → ensambla chunks → gzip -9 -k -f → .m3u8.gz
                                              (proceso externo, zero PHP RAM)
```

### Regla Inmutable: `shell_exec('gzip -9 -k -f')`, NUNCA `file_get_contents + gzencode`

```php
// ✅ CORRECTO: gzip externo, streaming, zero RAM
$gzipCmd = sprintf('gzip -9 -k -f %s', escapeshellarg($outputPath));
shell_exec($gzipCmd);

// ❌ PROHIBIDO: carga todo en RAM PHP
$content = file_get_contents($outputPath);
$compressed = gzencode($content, 9);
file_put_contents($outputPath . '.gz', $compressed); // 500MB en RAM → OOM
```

## 4️⃣ Números de Referencia

| Archivo | Original | .gz (nivel 9) | Reducción | RAM por request |
|---------|----------|---------------|-----------|-----------------|
| 1,359 canales | 181 MB | 7.9 MB | 96% | 512 KB |
| 3,000 canales | ~400 MB | ~60 MB | 85% | 512 KB |
| 5,000 canales | ~650 MB | ~100 MB | 85% | 512 KB |
| 10,000 canales | ~1.3 GB | ~200 MB | 85% | 512 KB |

**RAM siempre = 512KB** independiente del tamaño del archivo.

## 5️⃣ Compatibilidad de Players

| Player | Envía `Accept-Encoding: gzip` | Resultado |
|--------|-------------------------------|-----------|
| OTT Navigator | ✅ Sí | Recibe .gz directo, descomprime local |
| TiviMate | ✅ Sí | Recibe .gz directo |
| IPTV Smarters | ✅ Sí | Recibe .gz directo |
| VLC | ✅ Sí | Recibe .gz directo |
| Kodi | ✅ Sí | Recibe .gz directo |
| Perfect Player | ✅ Sí | Recibe .gz directo |
| Smart IPTV | ⚠️ Variable | gunzip streaming fallback |
| curl sin flags | ❌ No | gunzip streaming fallback |

## 6️⃣ Comandos de Operación

```bash
# Pre-comprimir todas las listas
bash /opt/deploy_gzip_m3u8.sh --all

# Verificar setup
bash /opt/deploy_gzip_m3u8.sh --verify

# Comprimir un archivo específico
bash /opt/deploy_gzip_m3u8.sh /var/www/html/playlist.m3u8

# Verificar que Nginx tiene los módulos
nginx -V 2>&1 | grep -oE '(gunzip|gzip_static)'

# Test HTTP
curl -sI -H "Accept-Encoding: gzip" https://iptv-ape.duckdns.org/playlist.m3u8
# Debe devolver: Content-Encoding: gzip
```

## 7️⃣ Reglas Inmutables

1. **NUNCA** usar `gzip on` dinámico para archivos >10MB → usar `gzip_static`
2. **NUNCA** cargar archivos >50MB en memoria PHP → usar `shell_exec('gzip')`
3. **SIEMPRE** usar `gzip_static always` (no `on`) para permitir `gunzip` fallback
4. **SIEMPRE** usar `output_buffers 32 16k` para controlar el pipeline de memoria
5. **SIEMPRE** pre-comprimir después de cada upload (automático via `finalize_upload.php`)
6. El `.m3u8` original puede eliminarse si `gunzip on` está activo → solo `.gz` necesario
7. La URL pública siempre es `/playlist.m3u8` (sin .gz) → Nginx resuelve transparentemente

---
name: upload_gzip_placeholder_pipeline
description: "Pipeline ABSOLUTO de Upload M3U8: subida zero-RAM → compresión gzip streaming 16KB → Placeholder Trick 8 bytes → Manifest URL Content-Negotiated. NUNCA borrar el raw sin crear placeholder. NUNCA dejar el raw sin comprimir."
---

# 📦🔥 Upload → Gzip → Placeholder Pipeline (SSOT)

**Versión:** 3.1.0  
**Dependencias:** `gzip_static_streaming_vps`, `vps_upload_gateway`, `sop_subida_bulletproof_m3u8`  
**Archivos Críticos:** `upload.php` (VPS), `gateway-manager.js` (Frontend), `delete_file.php` (VPS)

---

## 🚨 REGLA ABSOLUTA #1 — NUNCA SE VIOLA

> **El archivo `.m3u8` raw de 300MB+ NUNCA permanece en disco después del upload.**
> Se comprime a `.m3u8.gz` y el raw se reemplaza con un **placeholder de 8 bytes** (`#EXTM3U\n`).
> Nginx `gzip_static always` + `gunzip on` sirve el `.gz` transparentemente.
> La **Manifest URL** (`/lists/FILE.m3u8`) es liviana y apunta al `.gz`.

---

## 1️⃣ Pipeline Completo (6 Pasos Atómicos)

```
┌─────────────────────────────────────────────────────────────────┐
│  PASO 1: Upload (Browser → VPS)                                │
│  FormData multipart → move_uploaded_file() → disco             │
│  Costo RAM: 0 bytes (PHP maneja tmp file en disco)             │
├─────────────────────────────────────────────────────────────────┤
│  PASO 2: Contar Canales (ANTES de comprimir)                   │
│  countChannelsInFile() → fopen() line-by-line                  │
│  Costo RAM: ~16KB (un buffer de lectura)                       │
├─────────────────────────────────────────────────────────────────┤
│  PASO 3: Compresión Gzip Streaming                             │
│  gzipCompressFileStreaming() → gzopen() + gzwrite()            │
│  Chunks: 16KB (configurable via $CONFIG['gzip_chunk_size'])    │
│  Nivel: 9 (máxima compresión)                                  │
│  Ratio típico: 60-85% reducción (300MB → 50-107MB)            │
│  Costo RAM: 16KB (un chunk en memoria)                         │
├─────────────────────────────────────────────────────────────────┤
│  PASO 4: Placeholder Trick ⚠️ CRÍTICO                         │
│  file_put_contents($mainPath, "#EXTM3U\n") → 8 bytes          │
│  NO unlink(). NO borrar. REEMPLAZAR con placeholder.           │
│  Nginx try_files encuentra el placeholder → gzip_static sirve  │
├─────────────────────────────────────────────────────────────────┤
│  PASO 5: Respuesta JSON al Frontend                            │
│  { success: true, url: "/lists/FILE.m3u8", gzip: {...} }      │
│  El frontend recibe la Manifest URL liviana                    │
├─────────────────────────────────────────────────────────────────┤
│  PASO 6: Nginx Content-Negotiation                             │
│  Cliente pide: /lists/FILE.m3u8                                │
│  try_files: encuentra placeholder (8 bytes) ✓                  │
│  gzip_static always: detecta FILE.m3u8.gz → lo sirve          │
│  gunzip on: descomprime al vuelo para clientes legacy          │
│  Costo CPU: 0% (sendfile zero-copy para clientes gzip)        │
└─────────────────────────────────────────────────────────────────┘
```

## 2️⃣ Arquitectura de Archivos en Disco

```
/var/www/lists/
├── APE_TYPED_ARRAYS_ULTIMATE_20260405.m3u8      ← 8 bytes (placeholder #EXTM3U)
├── APE_TYPED_ARRAYS_ULTIMATE_20260405.m3u8.gz   ← 107MB (archivo REAL comprimido)
├── APE_TYPED_ARRAYS_ULTIMATE_20260404.m3u8      ← 8 bytes (placeholder)
├── APE_TYPED_ARRAYS_ULTIMATE_20260404.m3u8.gz   ← 95MB (comprimido)
└── versions/
    └── (backups versionados con timestamp)
```

**Manifest URL (lo que el usuario copia y pega en OTT Navigator):**
```
https://iptv-ape.duckdns.org/lists/APE_TYPED_ARRAYS_ULTIMATE_20260405.m3u8
```

## 3️⃣ Reglas Inquebrantables

### ⛔ PROHIBIDO — Violaciones Fatales
1. **NUNCA** usar `file_get_contents()` para cargar listas de 300MB+ en RAM
2. **NUNCA** usar `@unlink()` para borrar el raw sin crear placeholder
3. **NUNCA** dejar el raw sin comprimir si pesa más de 1MB
4. **NUNCA** cambiar `try_files $uri =404;` en la config de Nginx — el placeholder trick lo necesita
5. **NUNCA** servir el `.gz` directamente como URL al usuario — siempre servir el `.m3u8` (Nginx traduce)

### ✅ OBLIGATORIO — Siempre Hacer
1. **SIEMPRE** usar `move_uploaded_file()` o `rename()` — zero RAM
2. **SIEMPRE** contar canales ANTES del placeholder (el raw todavía es el archivo real)
3. **SIEMPRE** comprimir con `gzopen()` + `gzwrite()` en chunks de 16KB
4. **SIEMPRE** crear placeholder con `file_put_contents($path, "#EXTM3U\n")` después de comprimir
5. **SIEMPRE** verificar que el `.gz` existe y tiene size > 0 antes de crear placeholder
6. **SIEMPRE** que el `delete_file.php` acepte extensiones `.gz`, `.m3u8`, `.m3u`
7. **SIEMPRE** que borrar un `.m3u8` también borre su `.m3u8.gz` compañero y viceversa

## 4️⃣ Código de Referencia — upload.php v3.1

### Función de Compresión (ZERO RAM)
```php
function gzipCompressFileStreaming($sourcePath, $gzipLevel = 9, $chunkSize = 16384) {
    $gzPath = $sourcePath . '.gz';
    $in = fopen($sourcePath, 'rb');
    $out = gzopen($gzPath, 'wb' . $gzipLevel);
    while (!feof($in)) {
        $chunk = fread($in, $chunkSize);
        if ($chunk === false || $chunk === '') break;
        gzwrite($out, $chunk);
    }
    fclose($in);
    gzclose($out);
    @chmod($gzPath, 0644);
    return ['ok' => file_exists($gzPath), 'gz_size' => filesize($gzPath)];
}
```

### Placeholder Trick (Post-Compresión)
```php
// PASO 4: Placeholder Trick (skill: gzip_static_streaming_vps)
// gzip_static always REQUIERE que el .m3u8 EXISTA para try_files.
// Reemplazar el raw (300MB) con placeholder de 8 bytes (#EXTM3U)
if ($gzResult['ok']) {
    file_put_contents($mainPath, "#EXTM3U\n");  // 8 bytes
}
```

### Delete con Auto-Cleanup Bidireccional
```php
// Si borré un .m3u8, eliminar también su .m3u8.gz compañero
if (preg_match('/\.m3u8$/i', $filename)) {
    $gzCompanion = $filePath . '.gz';
    if (file_exists($gzCompanion)) unlink($gzCompanion);
}
// Si borré un .m3u8.gz, eliminar también su .m3u8 placeholder
if (preg_match('/\.m3u8\.gz$/i', $filename)) {
    $rawCompanion = preg_replace('/\.gz$/i', '', $filePath);
    if (file_exists($rawCompanion)) unlink($rawCompanion);
}
```

## 5️⃣ Nginx Config (INMUTABLE)

```nginx
location ~* \.m3u8$ {
    default_type application/vnd.apple.mpegurl;
    gzip_static always;     # Sirve .gz preferentemente
    gunzip on;              # Descomprime para clientes legacy
    gzip_vary on;
    output_buffers 32 16k;  # 512KB pipeline streaming
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    try_files $uri =404;    # Placeholder trick: encuentra los 8 bytes
}
```

**Módulos Nginx requeridos:** `ngx_http_gzip_static_module`, `ngx_http_gunzip_module`

## 6️⃣ Verificación

```bash
# Test 1: La Manifest URL responde 200 (sirve el .gz transparente)
curl -skI https://iptv-ape.duckdns.org/lists/FILE.m3u8
# Esperado: HTTP 200, Content-Type: application/vnd.apple.mpegurl

# Test 2: El placeholder existe y pesa 8 bytes
ls -l /var/www/lists/FILE.m3u8
# Esperado: 8 bytes

# Test 3: El .gz existe y pesa ~100MB
ls -lh /var/www/lists/FILE.m3u8.gz
# Esperado: ~100MB

# Test 4: Cliente gzip recibe Content-Encoding: gzip
curl -s -D- -o /dev/null -H 'Accept-Encoding: gzip' https://...
# Esperado: Content-Encoding: gzip

# Test 5: Cliente legacy recibe Transfer-Encoding: chunked
curl -s -D- -o /dev/null https://...
# Esperado: Transfer-Encoding: chunked (gunzip descomprime al vuelo)
```

## 7️⃣ Tabla de Compatibilidad

| Player | Soporta gzip | Método Nginx | Resultado |
|--------|-------------|-------------|-----------|
| OTT Navigator | ✅ | `gzip_static` sendfile | .gz directo, 0% CPU |
| TiviMate | ✅ | `gzip_static` sendfile | .gz directo, 0% CPU |
| VLC | ✅ | `gzip_static` sendfile | .gz directo, 0% CPU |
| Kodi | ✅ | `gzip_static` sendfile | .gz directo, 0% CPU |
| IPTV Smarters | ⚠️ Algunos | `gunzip` streaming | Descomprime 16KB chunks |
| Perfect Player | ✅ | `gzip_static` sendfile | .gz directo, 0% CPU |
| Smart IPTV | ✅ | `gzip_static` sendfile | .gz directo, 0% CPU |
| GSE | ✅ | `gzip_static` sendfile | .gz directo, 0% CPU |

## 8️⃣ Troubleshooting

| Síntoma | Causa | Fix |
|---------|-------|-----|
| 404 en Manifest URL | Placeholder `.m3u8` no existe | `echo '#EXTM3U' > /var/www/lists/FILE.m3u8` |
| Descarga el placeholder (8 bytes) | `.m3u8.gz` no existe | Recomprimir: `gzip -9 -k FILE.m3u8_backup` |
| OOM / Memory exhausted | Usando `file_get_contents()` | Cambiar a `move_uploaded_file()` + `gzopen()` streaming |
| Disco 99% lleno | Raws no reemplazados con placeholder | Ejecutar `auto_gzip.sh` o resubir |
| Error 413 al subir | Nginx `client_max_body_size` bajo | Mínimo `600M` en nginx.conf |

---

> **ESTA SKILL ES SSOT (Single Source of Truth) PARA EL PIPELINE DE UPLOAD.**
> Cualquier modificación a `upload.php`, `delete_file.php`, o la config de Nginx
> DEBE ser validada contra estas reglas antes de desplegar.

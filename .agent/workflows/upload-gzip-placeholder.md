---
description: "Workflow completo para subir una lista M3U8 al VPS con compresión gzip automática, Placeholder Trick y entrega de Manifest URL Content-Negotiated. Seguir SIEMPRE en este orden."
---

# 📦 Upload M3U8 → Gzip → Placeholder → Manifest URL

**Skill de referencia:** `upload_gzip_placeholder_pipeline`
**Archivos involucrados:** `upload.php`, `delete_file.php`, `gateway-manager.js`, Nginx config

---

## Flujo Automático (UI Gateway)

// turbo-all

1. **Generar la lista M3U8** desde el frontend (botón "Generar Lista")
2. **Subir desde el Gateway Manager** → el archivo viaja via FormData multipart al VPS
3. **El VPS ejecuta automáticamente:**
   - `move_uploaded_file()` → guarda raw en `/var/www/lists/`
   - `countChannelsInFile()` → cuenta canales line-by-line (ANTES de comprimir)
   - `gzipCompressFileStreaming()` → crea `.m3u8.gz` (chunks 16KB, zero RAM)
   - `file_put_contents($path, "#EXTM3U\n")` → Placeholder Trick (8 bytes)
4. **El VPS responde con JSON** incluyendo `public_url` (la Manifest URL)
5. **Copiar la Manifest URL** para usar en OTT Navigator / TiviMate / VLC:

   ```
   https://iptv-ape.duckdns.org/lists/APE_TYPED_ARRAYS_ULTIMATE_YYYYMMDD.m3u8
   ```

## Flujo Manual (cURL / emergencia)

1. Subir el archivo:

   ```bash
   curl -sk -X POST -F "file=@LISTA.m3u8" https://iptv-ape.duckdns.org/upload.php -H "X-Strategy: replace"
   ```

2. La respuesta incluye la Manifest URL y datos de compresión:

   ```json
   {
     "success": true,
     "url": "https://iptv-ape.duckdns.org/lists/LISTA.m3u8",
     "gzip": {
       "compressed": true,
       "raw_deleted": true,
       "gz_size_formatted": "107.50 MB",
       "compression_ratio": "64.8%"
     }
   }
   ```

3. Verificar que la URL sirve:

   ```bash
   curl -skI https://iptv-ape.duckdns.org/lists/LISTA.m3u8
   # Esperado: HTTP 200 OK
   ```

## Verificación Post-Upload

1. Confirmar que el placeholder existe (8 bytes):

   ```bash
   ssh root@178.156.147.234 "ls -l /var/www/lists/LISTA.m3u8"
   ```

2. Confirmar que el .gz existe (~100MB):

   ```bash
   ssh root@178.156.147.234 "ls -lh /var/www/lists/LISTA.m3u8.gz"
   ```

3. Confirmar la Manifest URL responde 200:

   ```bash
   curl -skI https://iptv-ape.duckdns.org/lists/LISTA.m3u8
   ```

## Eliminación de Archivos

- Desde el UI: seleccionar archivo en dropdown → botón "Eliminar"
- `delete_file.php` acepta `.m3u8`, `.m3u`, `.gz`
- Auto-cleanup bidireccional: borrar `.m3u8` también borra su `.gz` compañero y viceversa

## ⚠️ Reglas Críticas (NUNCA violar)

- **NUNCA** borrar el `.m3u8` placeholder sin borrar también el `.gz` (quedaría un .gz huérfano)
- **NUNCA** usar `file_get_contents()` para archivos de más de 10MB
- **NUNCA** modificar `try_files $uri =404;` en la config de Nginx
- **SIEMPRE** crear el placeholder DESPUÉS de verificar que el `.gz` se creó exitosamente
- **SIEMPRE** contar canales ANTES de reemplazar el raw con placeholder

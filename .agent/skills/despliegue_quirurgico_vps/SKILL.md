---
name: Despliegue Quirúrgico VPS (SRE Atomic Deploy)
description: Protocolo inmutable para desplegar scripts PHP, channels_map.json y configs Nginx al VPS Hetzner de producción. Define las rutas exactas, la secuencia atómica y las validaciones obligatorias.
---

# Despliegue Quirúrgico VPS (SRE Atomic Deploy)

## REGLA SUPREMA (NO NEGOCIABLE)

> **Nunca** subir archivos al VPS sin ejecutar los 7 pasos atómicos en orden.
> **Nunca** adivinar la ruta de destino. Usa SOLO las rutas documentadas aquí.
> **Siempre** hacer backup antes de sobrescribir.

---

## 1. INFRAESTRUCTURA DE PRODUCCIÓN (CONGELADA)

| Campo | Valor |
|---|---|
| **VPS IP** | `178.156.147.234` |
| **SSH User** | `root` |
| **Domain** | `iptv-ape.duckdns.org` |
| **SSL** | Let's Encrypt (auto-renew) |
| **PHP-FPM** | `php8.3-fpm` vía `unix:/run/php/php8.3-fpm.sock` |
| **Nginx Active Config** | `/etc/nginx/sites-enabled/iptv-ape` (basada en `nginx-live-current.conf`) |

---

## 2. MAPA DE RUTAS (FUENTE DE VERDAD)

### Document Root (PHP Scripts)

| Ruta VPS | Propósito |
|---|---|
| `/var/www/html/` | **Document root** de Nginx. Todos los PHP van aquí. |

### Scripts PHP que deben vivir en `/var/www/html/`

| Archivo | Función |
|---|---|
| `resolve.php` | Resolver HLS/CMAF principal |
| `resolve_quality.php` | Quality overlay HEVC variant picker |
| `cmaf_proxy.php` | Proxy híbrido 200/206 para segmentos CMAF |
| `cmaf_worker.php` | Worker background FFmpeg DASH-CMAF |
| `guardian_log.php` | API telemetría Guardian Engine |
| `guardian_telemetry_core.php` | UDP daemon (ejecutado vía CLI, no web) |
| `upload.php` | Endpoint de subida M3U8 |
| `upload_chunk.php` | Endpoint de subida chunked |
| `finalize_upload.php` | Ensamblaje de chunks |
| `health.php` | Health check |
| `verify.php` | Verificación post-upload |
| `list_files.php` | Listado de archivos |
| `delete_file.php` | Eliminación de archivos |
| `audit.php` | Auditoría |
| `channels_map.json` | DNA map (leído por resolvers) |

### Listas M3U8 (Destino de uploads)

| Ruta VPS | Propósito |
|---|---|
| `/mnt/data/iptv-lists/` | Directorio real donde `upload.php` guarda los `.m3u8` |
| `/var/www/lists/` | Alias Nginx para servir las listas estáticamente |

> ⚠️ **NO son el mismo directorio.** Puede haber un symlink o un alias. Verificar con `ls -la /var/www/lists/`.

### RAM Disk (Telemetría en vivo)

| Ruta VPS | Propósito |
|---|---|
| `/dev/shm/ape_metrics/` | DNA y telemetría por canal |
| `/dev/shm/ape_guardian/` | Logs de eventos y radar global |
| `/dev/shm/ape_cmaf_cache/` | Cache de segmentos CMAF |

---

## 3. SECUENCIA ATÓMICA DE DESPLIEGUE (7 PASOS)

### Paso 1: Backup

```bash
ssh root@178.156.147.234 'BDIR=/var/www/html/backup_deploy_YYYYMMDD && mkdir -p $BDIR && for f in resolve.php resolve_quality.php cmaf_proxy.php cmaf_worker.php guardian_log.php guardian_telemetry_core.php channels_map.json; do [ -f /var/www/html/$f ] && cp /var/www/html/$f $BDIR/$f; done && ls -la $BDIR/'
```

### Paso 2: SCP (desde la carpeta `iptv_nav/files/vps/`)

```powershell
scp -o StrictHostKeyChecking=no "resolve.php" "resolve_quality.php" "cmaf_proxy.php" "cmaf_worker.php" "guardian_log.php" "guardian_telemetry_core.php" "channels_map.json" root@178.156.147.234:/var/www/html/
```

### Paso 3: Permisos

```bash
ssh root@178.156.147.234 'chown www-data:www-data /var/www/html/resolve.php /var/www/html/resolve_quality.php /var/www/html/cmaf_proxy.php /var/www/html/cmaf_worker.php /var/www/html/guardian_log.php /var/www/html/guardian_telemetry_core.php /var/www/html/channels_map.json && chmod 644 /var/www/html/resolve.php /var/www/html/resolve_quality.php /var/www/html/cmaf_proxy.php /var/www/html/cmaf_worker.php /var/www/html/guardian_log.php /var/www/html/guardian_telemetry_core.php /var/www/html/channels_map.json'
```

### Paso 4: Verificar Nginx location blocks

```bash
ssh root@178.156.147.234 'grep -c "guardian_log\|cmaf_proxy\|resolve" /etc/nginx/sites-enabled/*'
```

Si falta algún location block, inyectarlo con `sed` o editando manualmente.

### Paso 5: Syntax Check

```bash
ssh root@178.156.147.234 'nginx -t'
```

**SOLO continuar si dice `syntax is ok`.**

### Paso 6: Reload

```bash
ssh root@178.156.147.234 'systemctl reload nginx'
```

### Paso 7: Verificación Final

```bash
ssh root@178.156.147.234 "curl -sk -o /dev/null -w 'HTTP:%{http_code} CT:%{content_type}\n' https://localhost/guardian_log.php --resolve iptv-ape.duckdns.org:443:127.0.0.1"
ssh root@178.156.147.234 "curl -sk -o /dev/null -w 'HTTP:%{http_code} CT:%{content_type}\n' 'https://localhost/resolve.php?ch=test' --resolve iptv-ape.duckdns.org:443:127.0.0.1"
```

**Criterios de éxito:**

- `guardian_log.php` → HTTP 200, `application/json`
- `resolve.php` → HTTP 200, `application/x-mpegURL`
- `cmaf_proxy.php?sid=test&seg=none.m4s` → HTTP 404 (correcto, no hay segmento)

---

## 4. PATRONES PROHIBIDOS

| ❌ Prohibido | ✅ Correcto |
|---|---|
| Subir PHP a `/var/www/m3u8/` | Subir a `/var/www/html/` |
| Reemplazar Nginx config sin `nginx -t` | Siempre validar antes de reload |
| SCP sin backup previo | Siempre Step 1 antes de Step 2 |
| Adivinar rutas | Consultar este skill |
| Desplegar sin verificar endpoints | Siempre Step 7 |

---

## 5. CONTEXTO IMPORTANTE

### ¿Por qué `/var/www/html` y no `/var/www/m3u8`?

La config **activa** en producción (`nginx-live-current.conf`) define `root /var/www/html`. Las otras configs (`nginx-hls-max.conf`, `nginx-m3u8-site-https.conf`) usan `root /var/www/m3u8` pero son **plantillas de referencia**, NO la config habilitada en `/etc/nginx/sites-enabled/`.

### ¿Cuándo se usa `/var/www/m3u8`?

Solo si se cambia la config activa de Nginx a `nginx-hls-max.conf`. En ese caso, todos los PHP deberían ir a `/var/www/m3u8/`.

---

**Skill creada:** 2026-03-04
**Última validación exitosa:** 2026-03-04 08:16 UTC

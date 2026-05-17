---
name: "Despliegue APE v18.x — Workflow de Parcheo Iterativo VPS"
description: "Workflow operativo para desplegar parches APE v18.3 a v18.6 en el VPS Hetzner, incluyendo extracción de ZIP, SCP, purga de caché, reinicio de servicios y verificación"
---

# Despliegue APE v18.x — Workflow Operativo

## Pre-requisitos
- SSH key: `C:\Users\HFRC\.ssh\id_ed25519_hetzner`
- VPS: `root@178.156.147.234` (Hetzner)
- Domain: `iptv-ape.duckdns.org`
- PHP-FPM: 8.3
- Document root: `/var/www/html/`

## Paso 1: Extraer ZIP Local
```powershell
Expand-Archive -Path "C:\Users\HFRC\Downloads\APE_v18.X_NOMBRE.zip" `
  -DestinationPath "C:\Users\HFRC\Downloads\APE_v18.X_NOMBRE" -Force
```

## Paso 2: Verificar contenido del ZIP
```powershell
Get-ChildItem "C:\Users\HFRC\Downloads\APE_v18.X_NOMBRE" -Recurse
```

Archivos esperados:
- `cmaf_worker.php` — Motor de conversión MPEG-TS → DASH/CMAF
- `resolve_quality.php` — Router/resolver principal
- (opcional) `ape_hls_generators.php` — Generadores de manifiestos

## Paso 3: Verificar funciones duplicadas ANTES de subir
```powershell
# Buscar funciones serve_* duplicadas entre archivos
Select-String -Path "...\resolve_quality.php" -Pattern "function serve_" -Encoding utf8
Select-String -Path "...\ape_hls_generators.php" -Pattern "function serve_" -Encoding utf8
```
**Si hay duplicados: eliminar del `resolve_quality.php`** — la versión canónica vive en `ape_hls_generators.php`.

## Paso 4: SCP al VPS
```powershell
scp -i C:\Users\HFRC\.ssh\id_ed25519_hetzner -o StrictHostKeyChecking=no `
  "C:\Users\HFRC\Downloads\APE_v18.X_NOMBRE\cmaf_worker.php" `
  root@178.156.147.234:/var/www/html/
```

## Paso 5: Verificar, purgar y reiniciar
```bash
ssh root@178.156.147.234 "
  php -l /var/www/html/cmaf_worker.php &&
  php -l /var/www/html/resolve_quality.php &&
  rm -rf /dev/shm/ape_cmaf_cache/1198 &&
  systemctl restart php8.3-fpm &&
  sleep 1 &&
  echo 'Deploy OK'
"
```

## Paso 6: Verificación E2E
```bash
ssh root@178.156.147.234 "
  # Trigger: el resolver lanza el worker y redirige
  curl -sL 'https://iptv-ape.duckdns.org/resolve_quality.php?ch=1198&format=cmaf' > /dev/null

  # Esperar que FFmpeg genere segmentos (6-8 segundos)
  sleep 8

  # Verificar proxy
  echo '=== PROXY ==='
  curl -s -o /dev/null -w 'HTTP_CODE: %{http_code}\n' \
    'https://iptv-ape.duckdns.org/cmaf_proxy.php?sid=1198&seg=manifest.mpd'

  # Verificar caché
  echo '=== CACHE ==='
  ls -la /dev/shm/ape_cmaf_cache/1198/ 2>/dev/null || echo 'No cache dir'

  # Verificar log de FFmpeg
  echo '=== FFMPEG LOG (últimas 10 líneas) ==='
  tail -10 /dev/shm/ape_cmaf_cache/1198/ffmpeg.log 2>/dev/null
"
```

## Checklist de Éxito

| Métrica | Valor Esperado |
|---|---|
| `php -l` | `No syntax errors detected` |
| Proxy HTTP code | `200` |
| `manifest.mpd` size | `> 1 KB` |
| `init-stream0.m4s` size | `> 0 bytes` |
| `chunk-stream0-*.m4s` presentes | `≥ 1` |
| `ffmpeg.log` sin `Error opening output` | ✅ |

## Historial de Versiones

| Versión | Fecha | Cambio principal |
|---|---|---|
| v18.3 | 2026-03-15 | Fix funciones duplicadas, Tivision UA bypass |
| v18.4 | 2026-03-15 | HTTP Guard (CURLOPT_HEADERFUNCTION) |
| v18.5 | 2026-03-15 | probesize 10MB fijo, genpts+discardcorrupt, err_detect |
| v18.6 | 2026-03-15 | Annex-B → AVCC Bridge (5 BSF params) — **ÉXITO** |

## Rollback de Emergencia
```bash
# Los backups se guardan automáticamente en /tmp/
cp /tmp/resolve_quality_before_dedup.php /var/www/html/resolve_quality.php
cp /tmp/ape_hls_bak.php /var/www/html/ape_hls_generators.php
systemctl restart php8.3-fpm
```

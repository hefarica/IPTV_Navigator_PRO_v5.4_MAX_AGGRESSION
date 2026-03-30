---
name: iptv-sentinel-os
description: >
  Sistema Operativo de Infraestructura Bulletproof para plataformas IPTV. Monitorea, diagnostica,
  escala y auto-repara la red de servidores VPS, CDNs y backends PHP/Nginx. Gestiona la configuración
  de Nginx para streaming IPTV de alta concurrencia, implementa auto-healing de procesos caídos,
  monitoreo de salud de streams en tiempo real, y gestión de certificados SSL. Usar para: configurar
  VPS para IPTV, optimizar Nginx para streaming, implementar health checks, diagnosticar errores
  de servidor, gestionar múltiples orígenes IPTV, y automatizar el despliegue de actualizaciones.
---

# IPTV Sentinel OS — Infraestructura Bulletproof

## Superioridad Estratégica

Este skill otorga el **Pilar 3 de la Superioridad del 95%**: mientras el 95% del mercado opera con servidores configurados manualmente que fallan sin aviso, este sistema operativo de infraestructura garantiza un uptime del 99.99% con auto-healing, escalado automático y monitoreo proactivo.

---

## Capacidades Principales

### 1. Configuración Nginx Óptima para Streaming IPTV

La configuración de Nginx es el cuello de botella más común en plataformas IPTV. Esta configuración está optimizada para soportar 10,000+ conexiones concurrentes con latencia mínima.

**Parámetros Críticos:**

| Parámetro | Valor Óptimo | Impacto |
|:----------|:-------------|:--------|
| `worker_processes` | `auto` | Usa todos los cores disponibles |
| `worker_connections` | `65535` | Máximo de conexiones por worker |
| `keepalive_timeout` | `300s` | Mantiene conexiones HLS activas |
| `proxy_read_timeout` | `600s` | Evita timeouts en streams largos |
| `proxy_buffer_size` | `128k` | Buffer óptimo para segmentos HLS |
| `gzip` | `off` para video | El video ya está comprimido |
| `sendfile` | `on` | Transferencia directa kernel-space |

```bash
# Aplicar configuración óptima de Nginx
python3.11 /home/ubuntu/skills/iptv-sentinel-os/scripts/configure_nginx.py \
  --vps-ip <VPS_IP> \
  --domain iptv-ape.duckdns.org \
  --ssl-cert /etc/letsencrypt/live/iptv-ape.duckdns.org/fullchain.pem \
  --output /etc/nginx/sites-available/iptv-ape
```

---

### 2. Health Check y Auto-Healing

El Sentinel monitorea continuamente la salud de todos los componentes del sistema y los reinicia automáticamente si detecta fallos.

**Componentes Monitoreados:**

```
Nginx → PHP-FPM → resolve_quality.php → channels_map.json → RAM Disks → Orígenes IPTV
```

```bash
# Iniciar el daemon de auto-healing
python3.11 /home/ubuntu/skills/iptv-sentinel-os/scripts/sentinel_daemon.py \
  --vps-ip <VPS_IP> \
  --check-interval 30 \
  --alert-webhook <WEBHOOK_URL> \
  --auto-heal
```

**Acciones de Auto-Healing:**

| Componente | Fallo Detectado | Acción Automática |
|:-----------|:----------------|:------------------|
| Nginx | `502 Bad Gateway` | `systemctl restart nginx` |
| PHP-FPM | Proceso zombie | `systemctl restart php8.1-fpm` |
| RAM Disk | Directorio faltante | `mkdir -p /dev/shm/ape_guardian` |
| channels_map.json | Archivo corrupto | Restaurar desde backup S3 |
| Origen IPTV | Timeout > 5s | Failover al siguiente origen en `originsRegistry` |

---

### 3. Monitoreo de Streams en Tiempo Real

Verifica que cada stream del catálogo está activo y entregando video de la calidad esperada.

```bash
# Monitorear el 100% del catálogo
python3.11 /home/ubuntu/skills/iptv-sentinel-os/scripts/stream_monitor.py \
  --map /var/www/html/channels_map.json \
  --resolver https://iptv-ape.duckdns.org/resolve_quality.php \
  --workers 50 \
  --timeout 10 \
  --output /tmp/stream_health_report.json
```

---

### 4. Gestión de Múltiples Orígenes (Multi-Origin Failover)

El `originsRegistry` en `resolve_quality.php` define los orígenes IPTV disponibles. El Sentinel gestiona el failover automático entre ellos.

```php
// En resolve_quality.php — originsRegistry
$originsRegistry = [
    ['line.tivi-ott.net',            '3JHFTC',     'U56BDP'],
    ['line.dndnscloud.ru',           'f828e5e261', 'e1372a7053f1'],
    ['126958958431.4k-26com.com:80', 'ujgd4kiltx', 'p5c00kxjc7'],
];
```

El Sentinel prueba cada origen cada 60 segundos y actualiza el orden de prioridad en tiempo real basándose en latencia y disponibilidad.

---

### 5. Backup Automático del ADN

El `channels_map.json` es el activo más valioso del sistema. El Sentinel lo respalda automáticamente.

```bash
# Configurar backup automático (cron cada hora)
python3.11 /home/ubuntu/skills/iptv-sentinel-os/scripts/backup_manager.py \
  --source /var/www/html/channels_map.json \
  --destination s3://iptv-ape-backups/channels_map/ \
  --retention-days 30 \
  --schedule "0 * * * *"
```

---

## Diagnóstico de Infraestructura

```bash
# Diagnóstico completo del VPS en 60 segundos
python3.11 /home/ubuntu/skills/iptv-sentinel-os/scripts/vps_diagnostics.py \
  --vps-ip <VPS_IP> \
  --full-report \
  --output /tmp/vps_health_report.md
```

**Checks incluidos:** CPU/RAM/Disco, Nginx status, PHP-FPM pools, RAM disks, SSL expiry, puertos abiertos, latencia a orígenes, integridad del `channels_map.json`.

---

## Referencias de Archivos

- `scripts/configure_nginx.py` — Configurador de Nginx para streaming IPTV.
- `scripts/sentinel_daemon.py` — Daemon de monitoreo y auto-healing.
- `scripts/stream_monitor.py` — Monitor de salud de streams en tiempo real.
- `scripts/backup_manager.py` — Gestor de backups automáticos del ADN.
- `scripts/vps_diagnostics.py` — Diagnóstico completo del VPS.
- `templates/nginx-hls-max.conf` — Configuración Nginx optimizada para IPTV.
- `references/vps_hardening.md` — Guía de hardening de seguridad del VPS.

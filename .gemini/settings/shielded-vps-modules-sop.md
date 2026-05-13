
# SOP: Inventario Completo de Módulos VPS SHIELDED

> **Versión:** 1.0 — 2026-04-28
> **VPS:** Hetzner CPX21 (178.156.147.234) — 3 vCPU AMD, 4GB RAM, 40GB NVMe
> **Estado:** PRODUCCIÓN ACTIVA

---

## 1. Arquitectura General (11 Pasos)

```
[1] Toggle "Salida SHIELDED" ON en UI
        ▼
[2] gateway-manager.js renombra archivo → _SHIELDED.m3u8
        ▼
[3] Upload chunked al VPS (Rust server / upload_chunk.php)
        ▼
[4] VPS sirve: https://iptv-ape.duckdns.org/lists/APE_LISTA_xxx_SHIELDED.m3u8
        ▼
[5] Player descarga .m3u8 desde VPS
        ▼
[6] Player lee URLs internas VERBATIM directas (http://proveedor/live/...)
        ▼
[7] WireGuard tunnel captura requests (10.200.0.3 → 10.200.0.1)
        ▼
[8] Unbound DNS hijack → proveedor.com → 178.156.147.234
        ▼
[9] NGINX intercepta → Lua pipeline (6 hooks) → proxy_pass
        ▼
[10] SurfShark VPN egress → Proveedor IPTV real
        ▼
[11] Respuesta: Proveedor → SurfShark → NGINX → WireGuard → Player
```

---

## 2. MÓDULO 1: WireGuard Tunnel (Capa de Red)

**Propósito:** Capturar TODO el tráfico HTTP del player y enrutarlo por el VPS.

| Archivo | Función |
|---|---|
| `/etc/wireguard/wg0.conf` | Tunnel principal Player↔VPS (10.200.0.x, puerto 51820) |
| `/etc/wireguard/wg-surfshark.conf` | Tunnel egress VPS→SurfShark (IP rotation anti-ban) |
| `/etc/wireguard/wg-surfshark-br.conf` | Tunnel egress backup (SurfShark Brasil) |
| `/etc/wireguard/onn.conf` | Tunnel alternativo (reserva) |

**Peers activos (wg0):**
- `10.200.0.3/32` — Player principal (Fire TV / Shield TV)
- `10.200.0.2/32` — Player secundario

**Monitoreo:**
| Servicio | Timer | Intervalo | Script |
|---|---|---|---|
| `netshield-wg-health.service` | `netshield-wg-health.timer` | 30s | `/opt/netshield/scripts/wg-health-monitor.sh` |

**Estado persistente:** `/opt/netshield/state/wg_health_state.json`

---

## 3. MÓDULO 2: DNS Hijack (Unbound)

**Propósito:** Resolver dominios de proveedores a la IP local del VPS para que NGINX los intercepte.

| Archivo | Función |
|---|---|
| `/etc/unbound/unbound.conf` | Config principal Unbound |
| `/etc/unbound/unbound.conf.d/iptv-ape.conf` | Reglas de hijack IPTV |

**Dominios hijackeados → 178.156.147.234:**

| Dominio | Proveedor | Tipo |
|---|---|---|
| `nfqdeuxu.x1megaott.online` | x1megaott | Directo |
| `tivigo.cc` | tivigo | Directo (302 → CDN) |
| `line.tivi-ott.net` | tivi-ott | Directo |
| `ky-tv.cc` | ky-tv | Directo |
| `zivovrix.cc` | CDN de tivigo | CDN intercept |
| `rynivorn.cc` | CDN de tivigo | CDN intercept |

---

## 4. MÓDULO 3: NGINX Core (Proxy Transparente)

**Propósito:** Interceptar requests, aplicar optimizaciones (BBR, cache, UA), y reenviar al proveedor vía SurfShark.

### 4.1 Configuración Principal

| Archivo | Función |
|---|---|
| `/etc/nginx/nginx.conf` | Config raíz: includes, lua_package_path, proxy_cache_path en `/dev/shm` |

### 4.2 Conf.d (Módulos de Configuración)

| Archivo | Función | Detalles |
|---|---|---|
| `00-iptv-quantum.conf` | Baseline de buffers y timeouts | `proxy_buffer_size 128k`, `proxy_buffers 16 128k`, `proxy_read_timeout 60s` |
| `iptv-intercept.conf` | Upstreams + server blocks por proveedor | 4 upstreams: tivigo, x1megaott, tivi-ott, ky-tv. `max_fails=0` |
| `iptv-shield-rate.conf` | Maps HTTP context (shield_host, shield_path, shield_upstream) + hard_cap 100r/s | Variables resueltas por `map $request_uri` — anti-clobber |
| `iptv-limit-conn.conf` | Zona `xtream_account` para limit_conn | `limit_conn_zone` por user/pass |
| `iptv-lua-circuit.conf` | Shared dicts Lua (`upstream_state`, `circuit_metrics`) | Memoria compartida entre hooks Lua |
| `iptv-proxy.conf` | Config base de proxy (headers, timeouts) | Complemento de 00-iptv-quantum |
| `zivovrix-intercept.conf` | CDN intercept `*.zivovrix.cc` → `154.6.152.13:80` | Cache stale con `http_403` |
| `rynivorn-intercept.conf` | CDN intercept `*.rynivorn.cc` → CDN real | Cache stale con `http_403` |
| `prisma-floor-lock.conf` | Config PRISMA Floor-Lock (zonas, vars) | Soporte para floor_lock_filter.lua |
| `prisma-public-api-zone.conf` | Rate limit zona para APIs PRISMA | Protección de endpoints telemetría |
| `prisma-reactor-api.conf` | Mapeo de location para reactor API | Endpoint `/prisma/api/bandwidth-reactor` |
| `m3u8_rewriter.conf` | Rewriter legacy (minimal) | 71 bytes, placeholder |
| `cmaf_mime.conf` | MIME types para CMAF/fMP4 | `application/dash+xml`, etc. |

### 4.3 Snippets (Locations Incluibles)

| Archivo | Función |
|---|---|
| `shield-location.conf` | **CORE:** Location `/shield/{token}/{host}/{path}` — auth_request + 6 hooks Lua + proxy_pass + limit_conn 2 + hard_cap |
| `prisma-public-api-locations.conf` | Locations para APIs PRISMA (telemetry-full, bandwidth-reactor, sentinel-status, control, health) |
| `iptv-proxy-location.conf` | Location genérica de proxy IPTV |
| `api-rewrite.conf` | Rewrite para APIs internas |
| `fastcgi-php.conf` | Config FastCGI para PHP-FPM |
| `snakeoil.conf` | SSL certs (self-signed fallback) |
| `audio-stream-fix.conf` | Placeholder (11 bytes) |
| `shield-tivi-redirect.conf` | Placeholder (11 bytes) |

---

## 5. MÓDULO 4: Lua Pipeline (6 Hooks en shield-location.conf)

**Propósito:** Procesamiento inteligente por request — telemetría, decisiones, filtrado. TODO es PASSTHROUGH (nunca bloquea).

### Ejecución secuencial en cada request `/shield/`:

| Orden | Hook NGINX | Archivo Lua | Función | ¿Bloquea? |
|---|---|---|---|---|
| 1 | `rewrite_by_lua_file` | `decision_engine.lua` | TELESCOPE v2.1: Lee ring buffer L1, aplica 6 reglas predictivas, ajusta `X-Max-Bitrate` header | ❌ NUNCA |
| 2 | `access_by_lua_file` | `upstream_gate.lua` | AUTOPISTA: Telemetría de requests por host. Contador `total_requests`. | ❌ NUNCA |
| 3 | `header_filter_by_lua_file` | `upstream_response.lua` | AUTOPISTA: Telemetría de responses. Registra status codes, tiempos upstream. | ❌ NUNCA |
| 4 | `header_filter_by_lua_file` | `sentinel_auth_guard.lua` | SENTINEL: Detecta 401/403, rota UA, señala retry. Reset counters en 200. | ❌ NUNCA |
| 5 | `body_filter_by_lua_file` | `floor_lock_filter.lua` | PRISMA Floor-Lock: Filtra variantes HLS con BANDWIDTH < floor del perfil. | ❌ NUNCA |
| 6 | `log_by_lua_file` | `bandwidth_reactor.lua` | PRISMA Bandwidth Reactor + TELESCOPE L1: Mide throughput, TTFB, jitter. EWMA + ring buffer 12 samples. | ❌ NUNCA |

### Módulos Lua de Soporte (no hooks directos):

| Archivo | Función |
|---|---|
| `sentinel_ua_apply.lua` | Aplica UA rotado por sentinel_auth_guard al request actual |
| `lab_config.lua` | LAB-SYNC: Lee 6 JSONs de calibración desde `/var/www/html/prisma/config/` con cache 300s |
| `shield_follow_302.lua` | Sigue hasta 3 redirects 302 de CDNs rotativos |
| `follow_redirect.lua` | Intercepta 302 upstream y sigue la redirección internamente |

### Endpoints Lua (content_by_lua_file):

| Archivo | Endpoint | Retorna |
|---|---|---|
| `bandwidth_reactor_api.lua` | `/prisma/api/bandwidth-reactor` | JSON: EWMA bps, instant, peak, state |
| `sentinel_telemetry_api.lua` | `/prisma/api/sentinel-status` | JSON: estado sentinel, counters por proveedor |
| `prisma_telemetry_full.lua` | `/prisma/api/telemetry-full` | JSON unificado: hardware + network + QoE + reactor + predictions |

---

## 6. MÓDULO 5: PHP API Layer

**Propósito:** Autenticación shield, gestión de archivos, health checks, resolvers de calidad.

### 6.1 Shield Auth

| Archivo | Función |
|---|---|
| `/var/www/html/api/shield-auth.php` | Auth guard: valida token en `/shield/{TOKEN}/...` → 204 OK / 403 denied |
| `/etc/net-shield/authorized_tokens.json` | Registry de tokens autorizados (MASTER token HFRC, expires 2099) |

### 6.2 Gestión de Archivos (Upload Pipeline)

| Archivo | Función |
|---|---|
| `upload_chunk.php` | Recibe chunks de 10MB con SHA256 verification |
| `finalize_upload.php` | Ensambla chunks → archivo final + gzip |
| `upload.php` | Upload monolítico legacy (< 250MB) |
| `upload_industrial.php` | Upload industrial con validación extra |
| `upload_status.php` | Polling de estado de upload |
| `list_files.php` | Lista archivos en `/var/www/lists/` con metadata |
| `delete_file.php` | Elimina archivo del VPS |
| `verify.php` | Verifica existencia de archivo post-upload |
| `gzip_hook.php` | Hook de compresión gzip post-upload |
| `cleanup_chunks.php` | Limpieza de chunks huérfanos |

### 6.3 Shield Monitoring

| Archivo | Función |
|---|---|
| `/var/www/html/api/health.php` | Health check completo (WG, NGINX, disk, RAM) |
| `/var/www/html/api/net-shield-status.php` | Estado resumido del NET SHIELD |
| `/var/www/html/api/netshield-sentinel.php` | Sentinel: recolecta métricas y propone ajustes |

### 6.4 PRISMA API

| Archivo | Función |
|---|---|
| `/var/www/html/prisma/api/prisma-health.php` | Health PRISMA completo (22KB) |
| `/var/www/html/prisma/api/prisma-control.php` | Control panel PRISMA (habilitar/deshabilitar módulos) |
| `/var/www/html/prisma/api/prisma-adb-telemetry.php` | Telemetría ADB desde dispositivos Android |

### 6.5 Resolvers (Quality / Streaming)

| Archivo | Función |
|---|---|
| `resolve_quality_unified.php` | **SSOT resolver:** 315KB, resolución de calidad + sniper mode + anti-cut |
| `resolve_quality_unified_LIVE.php` | Versión live del resolver (290KB) |
| `resolve.php` | Resolver legacy |
| `resolve_quality.php` | Wrapper del resolver |
| `resolve_quality_v5.php` | Resolver v5 |
| `resolve_redirect.php` | Resolver por redirect 302 |

---

## 7. MÓDULO 6: Systemd Services (Automatización)

| Servicio | Timer | Intervalo | Función |
|---|---|---|---|
| `netshield-wg-health` | cada 30s | Monitoreo WireGuard, auto-restart con cooldown 2min |
| `net-shield-metrics` | cada 10s | Recolección de métricas de throughput |
| `net-shield-throughput` | continuo | Medición continua de throughput |
| `netshield-health` | cada 5min | Health check general del sistema |
| `netshield-autopilot` | cada 5min | Autopilot v2: ajustes automáticos basados en telemetría |
| `netshield-sentinel` | cada 60min | Sentinel: análisis profundo + propuestas de mejora |
| `netshield-backup` | diario 3AM | Backup automático de configs |

### Scripts de Automatización

| Archivo | Función |
|---|---|
| `/opt/netshield/scripts/wg-health-monitor.sh` | Monitor WG con auto-restart y cooldown |
| `/opt/netshield/scripts/healthcheck.sh` | Health check general |
| `/opt/netshield/scripts/backup_configs.sh` | Backup de configs nginx/sysctl/lua |
| `/opt/netshield/autopilot/netshield_autopilot_v2.py` | Autopilot: ajustes automáticos (Python) |

### Sentinel Pipeline (AI-driven)

| Archivo | Función |
|---|---|
| `/opt/netshield/bin/sentinel-collect.sh` | Recolecta métricas del sistema |
| `/opt/netshield/bin/sentinel-classify.py` | Clasifica eventos por severidad |
| `/opt/netshield/bin/sentinel-diagnose.py` | Diagnóstico automático |
| `/opt/netshield/bin/sentinel-execute.py` | Ejecuta acciones aprobadas |
| `/opt/netshield/bin/sentinel-apply-approved.py` | Aplica propuestas aprobadas |
| `/opt/netshield/bin/sentinel-report.py` | Genera reportes |
| `/opt/netshield/bin/sentinel-llm-diagnose.py` | Diagnóstico con LLM (12KB) |
| `/opt/netshield/bin/sentinel-cycle.sh` | Orquestador del ciclo completo |

---

## 8. MÓDULO 7: Kernel TCP/IP (sysctl)

**Propósito:** Maximizar throughput y minimizar latencia a nivel de kernel.

| Archivo | Función |
|---|---|
| `/etc/sysctl.d/99-iptv-shield.conf` | Tuning TCP agresivo: BBR, buffers 128MB, fastopen, somaxconn 65535 |

**Parámetros clave:**

| Parámetro | Valor | Efecto |
|---|---|---|
| `tcp_congestion_control` | bbr | Ignora packet loss, maximiza throughput |
| `default_qdisc` | fq | Fair queuing para BBR |
| `rmem_max / wmem_max` | 128 MB | Buffers masivos de socket |
| `tcp_fastopen` | 3 | -1 RTT en conexiones |
| `tcp_slow_start_after_idle` | 0 | NO resetear cwnd |
| `somaxconn` | 65535 | Accept backlog máximo |

---

## 9. MÓDULO 8: DSCP / QoS (iptables)

**Propósito:** Marcar tráfico SurfShark con prioridad máxima (Expedited Forwarding).

| Regla | Destino | DSCP |
|---|---|---|
| Chain `SURFSHARK_MARK` | IPs SurfShark endpoints | 0x2e (EF) |
| Endpoints marcados | 149.18.45.78, 149.18.45.119, 149.18.45.189, 91.208.115.23, 172.110.220.61 | Prioridad máxima |

---

## 10. MÓDULO 9: Storage / Cache

| Path | Tipo | Función |
|---|---|---|
| `/var/www/lists/` | Disco | Almacén de playlists M3U8 (.m3u8 placeholder + .m3u8.gz comprimido) |
| `/dev/shm/nginx_cache` | RAM | Cache NGINX en RAM (zero I/O disk) |
| `/dev/shm/prisma_device_metrics.json` | RAM | Métricas de hardware en tiempo real |
| `/opt/netshield/state/` | Disco | Estado persistente: WG health, proposals, events, signatures |
| `/opt/netshield/autopilot/state/` | Disco | Estado del autopilot |
| `/root/backups/` | Disco | Backups certificados |

---

## 11. MÓDULO 10: Almacenamiento de Listas

**Mecanismo gzip + placeholder:**

Cada lista se almacena como DOS archivos:
```
APE_LISTA_xxx_SHIELDED.m3u8      →  8 bytes (placeholder, NGINX hace gzip_static)
APE_LISTA_xxx_SHIELDED.m3u8.gz   →  178-434 MB (contenido real comprimido)
```

NGINX con `gzip_static on` sirve el `.gz` cuando el cliente acepta `Accept-Encoding: gzip`.

---

## 12. MÓDULO 11: APE PRISMA v1.2 (Quality Uplift Post-Processor)

**Propósito:** Post-procesamiento de calidad visual en tiempo real. Filtra variantes HLS de baja calidad, mide throughput, predice degradación, y reporta telemetría al frontend. Opera DENTRO del pipeline NGINX (hooks Lua) y como sistema independiente (PHP + ADB + métricas).

### 12.1 Sub-módulos UI (Dashboard Frontend)

La UI muestra 7 módulos activos con estado por perfil (P0-P5):

| Sub-módulo | Función | Estado |
|---|---|---|
| **CMAF Packaging** | fMP4/CMAF repackaging | Procesando ✅ |
| **LCEVC Enhancement** | Low Complexity Enhancement Video Codec | Procesando ✅ |
| **HDR10+ Dynamic** | Scene-by-scene tone mapping | Procesando ✅ |
| **AI Super Resolution** | Neural upscaling engine | Procesando ✅ |
| **Quantum Pixel** | 8000 nits, 12-bit, 4:4:4 deep color | Procesando ✅ |
| **Fake 4K Upscaler** | 120fps MEMC, HDR lift, neural depth | Procesando ✅ |
| **v1.2 Player Enrichment** | EXTVLCOPT, KODIPROP, CODECS Rewriter | 36 directives, Injecting ✅ |

Todos los sub-módulos operan por **perfil** (P0=máximo a P5=mínimo) con filtro por resolución (All, UHD, HD+, None).

### 12.2 Frontend Widget

| Archivo local | Función |
|---|---|
| `frontend/js/prisma-control-widget.js` | Widget de control PRISMA en la UI principal — toggle ACTIVO/PANIC, status por módulo, selector de perfiles |

### 12.3 Backend PHP (Procesamiento + Estado)

| Archivo (vps/prisma/) | Función |
|---|---|
| `prisma_processor.php` | Motor principal de post-procesamiento |
| `prisma_state.php` | Gestión de estado PRISMA (activo/pánico/perfiles) |
| `prisma_bootstrap.php` | Bootstrap de inicialización PRISMA |
| `lib/lab_config_loader.php` | Cargador PHP de los 6 JSONs LAB (equivalente PHP de lab_config.lua) |

### 12.4 PRISMA API (Endpoints HTTP)

| Archivo (vps/prisma/api/) | Endpoint | Función |
|---|---|---|
| `prisma-health.php` | `/prisma/api/health` | Health check PRISMA completo (22KB) — estado de cada sub-módulo, error rates, perfiles activos |
| `prisma-control.php` | `/prisma/api/control` | Control panel — habilitar/deshabilitar módulos, cambiar perfiles, PANIC button |
| `prisma-adb-telemetry.php` | `/prisma/api/adb-telemetry` | Recibe telemetría ADB desde dispositivos Android (Fire TV / Shield TV) |

### 12.5 LAB Config JSONs (6 archivos SSOT)

Calibración centralizada leída por Lua (`lab_config.lua`) y PHP (`lab_config_loader.php`):

| Archivo (vps/prisma/config/) | Función | Tamaño |
|---|---|---|
| `floor_lock_config.json` | Pisos de bitrate por perfil (P0=15Mbps 4K, P3=8Mbps 1080p) | 807 B |
| `profile_boost_multipliers.json` | Multiplicadores de boost por perfil (P0=2.0x, P3=1.5x) | 1.3 KB |
| `telescope_thresholds.json` | Umbrales TELESCOPE: TTFB, jitter, throughput slope para reglas predictivas | 1.5 KB |
| `sentinel_providers_map.json` | Mapa de proveedores: UA pools, fingerprints, retry policies | 2.9 KB |
| `channels_prisma_dna.json` | DNA de canales: resolución conocida, codec, bitrate esperado | 3.1 KB |
| `enterprise_doctrine_manifest.json` | Manifiesto de doctrina empresarial: reglas inmutables del sistema | 7.7 KB |

### 12.6 Lua Hooks PRISMA (dentro del pipeline NGINX)

| Archivo (nginx/lua/) | Hook | Función |
|---|---|---|
| `floor_lock_filter.lua` | `body_filter_by_lua_file` | Filtra variantes HLS con BANDWIDTH < floor del perfil — el player NUNCA ve calidad baja |
| `bandwidth_reactor.lua` | `log_by_lua_file` | Mide throughput por request: EWMA, instant, peak. Ring buffer L1 (12 samples). TELESCOPE jitter + TTFB |
| `decision_engine.lua` | `rewrite_by_lua_file` | Lee estado del reactor, aplica 6 reglas predictivas, ajusta `X-Max-Bitrate` header dinámicamente |
| `lab_config.lua` | (require) | Lee los 6 JSONs de config con cache 300s en shared dict |
| `bandwidth_reactor_api.lua` | content_by_lua | Endpoint JSON: estado reactor (EWMA, instant, peak, state) |
| `prisma_telemetry_full.lua` | content_by_lua | Endpoint JSON unificado: hardware + network + QoE + reactor + predictions |

### 12.7 NGINX Config PRISMA

| Archivo (nginx/conf.d/) | Función |
|---|---|
| `prisma-floor-lock.conf` | Variables y zonas para floor_lock_filter.lua |
| `prisma-public-api-zone.conf` | Rate limit zone para APIs PRISMA |
| `prisma-reactor-api.conf` | Map de location para reactor API |

| Archivo (nginx/snippets/) | Función |
|---|---|
| `prisma-public-api-locations.conf` | Locations: telemetry-full, bandwidth-reactor, sentinel-status, control, health |

### 12.8 ADB Daemon (Telemetría desde Dispositivo)

| Archivo (vps/prisma/adb/) | Función |
|---|---|
| `prisma_adb_daemon.sh` | Daemon que recolecta métricas del player via ADB (CPU, RAM, buffer, codec activo) |
| `prisma-adb-daemon.service` | Systemd service para el daemon ADB |

### 12.9 Métricas y Telemetría

| Archivo (vps/prisma/metrics/) | Función |
|---|---|
| `prisma_device_metrics.sh` | Escribe métricas de hardware a `/dev/shm/prisma_device_metrics.json` |
| `prisma_history_writer.sh` | Persiste historial de métricas para análisis de tendencias |

| Archivo (vps/prisma/) | Función |
|---|---|
| `prisma_adb_overlay.sh` | Overlay de debug ADB en pantalla del player |
| `prisma_adb_validate.sh` | Validación de conexión ADB |
| `prisma_firetv_toast.sh` | Toast notifications al Fire TV via ADB |
| `prisma_telemetry_writer.sh` | Escritor de telemetría a archivos de estado |

### 12.10 Guardian Bridge

| Archivo (vps/prisma-guardian-bridge/) | Función |
|---|---|
| `prisma_guardian_bridge.py` | Bridge Python entre PRISMA y el APE Realtime Guardian — sincroniza decisiones |
| `prisma-guardian-bridge.service` | Systemd service para el bridge |

### 12.11 Deployment

| Archivo (vps/deploy/) | Función |
|---|---|
| `prisma-v2-deploy.sh` | Script de despliegue PRISMA v2: copia configs, Lua, PHP, recarga NGINX |
| `prisma-v2-rollback.sh` | Rollback atómico de PRISMA v2 |

---

## 13. Conteo Total de Archivos del Ecosistema SHIELDED

| Capa | Archivos activos | Backups/Legacy |
|---|---|---|
| WireGuard | 4 configs | 0 |
| Unbound DNS | 1 config | 0 |
| NGINX conf.d | 14 activos | 6 backups |
| NGINX snippets | 6 activos | 7 backups |
| NGINX Lua | 14 activos | 2 backups |
| PHP API Shield | 3 | 1 backup |
| PHP Upload | 7 | 1 backup |
| PHP Resolvers | 6 | 0 |
| PRISMA Backend | 4 PHP + 6 configs | 2 backup dirs |
| PRISMA API | 3 PHP | 0 |
| PRISMA ADB | 2 (daemon + service) | 0 |
| PRISMA Metrics | 6 scripts | 0 |
| PRISMA Bridge | 2 (Python + service) | 0 |
| PRISMA Deploy | 2 scripts | 0 |
| PRISMA Frontend | 1 widget JS | 0 |
| Systemd | 7 services + 7 timers | 0 |
| Scripts | 4 shell + 1 python | 0 |
| Sentinel | 7 scripts | 0 |
| Sysctl | 1 | 0 |
| **TOTAL** | **~107 archivos activos** | **~19 backups** |

---

## 14. Regla Inmutable (Cross-reference)

Todos estos módulos — incluyendo PRISMA — operan sobre URLs internas **VERBATIM directas** al proveedor. NINGUNO transforma las URLs de canales. El shielding ocurre a nivel de **red** (WireGuard + DNS + NGINX proxy), no a nivel de **URL string**. PRISMA opera sobre el **contenido** de las responses (filtra variantes HLS, mide throughput), NO sobre las URLs.

**Documentos hermanos:**
- `.agent/skills/shielded_architecture_immutable/SKILL.md`
- `.agent/skills/shielded_architecture_immutable/WORKFLOW_BLOQUEANTE.md`
- `.gemini/settings/shielded-sop.md`


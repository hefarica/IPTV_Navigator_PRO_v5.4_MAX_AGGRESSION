---
name: sop-shielded-architecture-complete
description: "SOP DEFINITIVO del ecosistema SHIELDED completo. Doctrina, arquitectura, 11 módulos (107 archivos), pipeline end-to-end, prohibiciones absolutas, diagnósticos y cross-references. Este es el ÚNICO documento que necesitas leer."
version: "1.0 — 2026-04-28"
---

# SOP COMPLETO: Ecosistema SHIELDED — APE IPTV Navigator PRO v5.4

> **Versión:** 1.0 — 2026-04-28
> **VPS:** Hetzner CPX21 (178.156.147.234) — 3 vCPU AMD, 4GB RAM, 40GB NVMe
> **Estado:** PRODUCCIÓN ACTIVA
> **Backup certificado:** `/root/backups/autopista_20260426.tar.gz`

---

## PARTE I — DOCTRINA

### 1. Qué es SHIELDED

SHIELDED tiene **DOS capas** que NO deben confundirse:

| Capa | Qué es | Dónde opera | Quién lo hace |
|---|---|---|---|
| **Capa 1: Sufijo de archivo** | Renombrar `.m3u8` → `_SHIELDED.m3u8` | Frontend (upload) | `gateway-manager.js` línea ~738 |
| **Capa 2: Shielding de red** | Todo tráfico del player pasa por VPS | Red (WireGuard + DNS + NGINX) | Infraestructura VPS |

**El sufijo NO es cosmético** — dispara 3 efectos funcionales:

1. Renombra el filename del archivo generado por el toggle.
2. Determina la URL pública VPS que el player consume.
3. Mete al archivo entero por el VPS desde el primer byte.

**Las URLs internas de canales son VERBATIM directas al proveedor** — esa parte NUNCA se transforma.

### 2. Invariante Absoluto

```
LAS URLs INTERNAS DE CANALES EN UN M3U8 SON DIRECTAS AL PROVEEDOR.
NUNCA SE TRANSFORMAN. NUNCA SE ENVUELVEN CON /shield/.
EL SHIELDING LO HACE EL WIREGUARD TUNNEL + DNS HIJACK + NGINX, NO LA URL.
```

### 3. Prohibiciones Absolutas

> [!CAUTION]
> Violar CUALQUIERA de estas reglas causa double-routing, rompe DNS hijack, o genera freezes.

| # | Prohibición |
|---|---|
| P1 | **NUNCA** agregar `/shield/{hash}/` a URLs internas de canales |
| P2 | **NUNCA** modificar `generateChannelEntry()` para shielding |
| P3 | **NUNCA** modificar `buildChannelUrl()` para shielding |
| P4 | **NUNCA** modificar `buildUniversalUrl()` para shielding |
| P5 | **NUNCA** crear "shield URL wrapper" en el generador JS |
| P6 | **NUNCA** sugerir que freezes se arreglan "shieldeando URLs internas" |
| P7 | **NUNCA** poner `proxy_cache_valid 302` > 0 (tokens dinámicos) |
| P8 | **NUNCA** quitar `http_403` de `proxy_cache_use_stale` en CDN intercepts |
| P9 | **NUNCA** poner `limit_conn xtream_slot 1` (causa 429 por overlap) |
| P10 | **NUNCA** activar circuit breaker que bloquee por host |
| P11 | **NUNCA** reducir `proxy_read_timeout` por debajo de 30s |
| P12 | **NUNCA** activar `keepalive` en upstreams Xtream |

### 4. Archivos Protegidos (NO TOCAR para shielding)

```
frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js           → PROHIBIDO
frontend/js/ape-v9/m3u8-typed-arrays-ultimate.pre-admission.js → PROHIBIDO
```

### 5. Único Punto de Shielding en Código JS

```
frontend/js/gateway-manager.js  → SOLO renombra filename a _SHIELDED.m3u8 (~L738)
```

### 6. Evidencia Empírica (2026-04-28)

Lista `APE_LISTA_1777243113563_SHIELDED.m3u8`:

- **15,444 URLs internas** → TODAS directas (`http://proveedor/live/...`)
- **0 URLs con `/shield/`**
- 3 hosts: x1megaott (5,781), tivigo (4,951), tivi-ott (4,712)
- **Funciona perfectamente** via WireGuard tunnel

---

## PARTE II — ARQUITECTURA END-TO-END

### 7. Pipeline Completo (11 Pasos)

```
[1] Usuario marca toggle "Salida SHIELDED" ON en UI
        │  const shieldedEnabled = true
        ▼
[2] gateway-manager.js renombra → APE_LISTA_xxx_SHIELDED.m3u8
        │  filename.replace(/\.m3u8$/i, '_SHIELDED.m3u8')
        ▼
[3] Upload chunked al VPS (Rust server / upload_chunk.php)
        │  10MB chunks + SHA256 + gzip
        ▼
[4] VPS sirve: https://iptv-ape.duckdns.org/lists/APE_LISTA_xxx_SHIELDED.m3u8
        │  gzip_static on → sirve .m3u8.gz transparente
        ▼
[5] Player descarga .m3u8 desde VPS (primer byte ya shielded)
        ▼
[6] Player lee URLs internas VERBATIM directas
        │  http://nfqdeuxu.x1megaott.online/live/USER/PASS/123.m3u8
        ▼
[7] WireGuard tunnel captura request (10.200.0.3 → 10.200.0.1)
        ▼
[8] Unbound DNS hijack → nfqdeuxu.x1megaott.online → 178.156.147.234
        ▼
[9] NGINX intercepta → Lua pipeline (6 hooks) → proxy_pass
        │  ├─ decision_engine.lua (predictive bitrate)
        │  ├─ upstream_gate.lua (telemetry)
        │  ├─ upstream_response.lua (response telemetry)
        │  ├─ sentinel_auth_guard.lua (UA rotation)
        │  ├─ floor_lock_filter.lua (remove low variants)
        │  └─ bandwidth_reactor.lua (throughput measurement)
        ▼
[10] SurfShark VPN egress → Proveedor IPTV real
        │  DSCP 0x2e (Expedited Forwarding)
        ▼
[11] Respuesta: Proveedor → SurfShark → NGINX (BBR+cache) → WireGuard → Player
```

---

## PARTE III — INVENTARIO DE MÓDULOS (11 Módulos, ~107 Archivos)

### MÓDULO 1: WireGuard Tunnel

**Propósito:** Capturar TODO el tráfico HTTP del player y enrutarlo por el VPS.

| Archivo | Función |
|---|---|
| `/etc/wireguard/wg0.conf` | Tunnel Player↔VPS (10.200.0.x:51820) |
| `/etc/wireguard/wg-surfshark.conf` | Egress VPS→SurfShark |
| `/etc/wireguard/wg-surfshark-br.conf` | Egress backup (SurfShark Brasil) |
| `/etc/wireguard/onn.conf` | Tunnel alternativo (reserva) |

Peers: `10.200.0.3` (player principal), `10.200.0.2` (secundario)
Monitor: `netshield-wg-health.timer` cada 30s → `/opt/netshield/scripts/wg-health-monitor.sh`
Estado: `/opt/netshield/state/wg_health_state.json`

---

### MÓDULO 2: DNS Hijack (Unbound)

**Propósito:** Resolver dominios de proveedores → IP del VPS para que NGINX los intercepte.

| Archivo | Función |
|---|---|
| `/etc/unbound/unbound.conf` | Config principal |
| `/etc/unbound/unbound.conf.d/iptv-ape.conf` | Reglas hijack IPTV |

| Dominio hijackeado | → Resuelve a | Proveedor |
|---|---|---|
| `nfqdeuxu.x1megaott.online` | 178.156.147.234 | x1megaott |
| `tivigo.cc` | 178.156.147.234 | tivigo (302→CDN) |
| `line.tivi-ott.net` | 178.156.147.234 | tivi-ott |
| `ky-tv.cc` | 178.156.147.234 | ky-tv |
| `zivovrix.cc` | 178.156.147.234 | CDN tivigo |
| `rynivorn.cc` | 178.156.147.234 | CDN tivigo |

---

### MÓDULO 3: NGINX Core

**Propósito:** Proxy transparente con BBR, cache en RAM, stale, UA rotation.

#### nginx.conf (raíz)

- `lua_package_path`, `proxy_cache_path /dev/shm/nginx_cache`, includes

#### conf.d/ (14 activos)

| Archivo | Función |
|---|---|
| `00-iptv-quantum.conf` | Baseline: `proxy_buffer_size 128k`, `proxy_buffers 16 128k`, `proxy_read_timeout 60s` |
| `iptv-intercept.conf` | 4 upstreams (tivigo, x1megaott, tivi-ott, ky-tv) con `max_fails=0` |
| `iptv-shield-rate.conf` | Maps: `$shield_host`, `$shield_path`, `$shield_upstream` + hard_cap 100r/s |
| `iptv-limit-conn.conf` | Zona `xtream_account` para limit_conn |
| `iptv-lua-circuit.conf` | Shared dicts Lua (`upstream_state`, `circuit_metrics`) |
| `iptv-proxy.conf` | Config base de proxy |
| `zivovrix-intercept.conf` | CDN intercept `*.zivovrix.cc` → 154.6.152.13. Cache stale con `http_403` |
| `rynivorn-intercept.conf` | CDN intercept `*.rynivorn.cc` → CDN real. Cache stale con `http_403` |
| `prisma-floor-lock.conf` | Variables y zonas para Floor-Lock |
| `prisma-public-api-zone.conf` | Rate limit APIs PRISMA |
| `prisma-reactor-api.conf` | Location reactor API |
| `m3u8_rewriter.conf` | Rewriter legacy |
| `cmaf_mime.conf` | MIME types CMAF |

#### snippets/ (6 activos)

| Archivo | Función |
|---|---|
| `shield-location.conf` | **CORE:** `/shield/{token}/{host}/{path}` — auth + 6 Lua hooks + proxy_pass + limit_conn 2 |
| `prisma-public-api-locations.conf` | Locations APIs PRISMA |
| `iptv-proxy-location.conf` | Location proxy genérica |
| `api-rewrite.conf` | Rewrite APIs internas |
| `fastcgi-php.conf` | FastCGI PHP-FPM |
| `snakeoil.conf` | SSL certs |

---

### MÓDULO 4: Lua Pipeline (6 Hooks Secuenciales)

**Propósito:** Procesamiento inteligente por request. TODO es PASSTHROUGH (NUNCA bloquea).

| Orden | Hook | Archivo | Función |
|---|---|---|---|
| 1 | `rewrite_by_lua_file` | `decision_engine.lua` | TELESCOPE v2.1: 6 reglas predictivas, ajusta `X-Max-Bitrate` |
| 2 | `access_by_lua_file` | `upstream_gate.lua` | AUTOPISTA: telemetría requests por host |
| 3 | `header_filter` | `upstream_response.lua` | AUTOPISTA: telemetría responses, status codes |
| 4 | `header_filter` | `sentinel_auth_guard.lua` | SENTINEL: detecta 401/403, rota UA |
| 5 | `body_filter` | `floor_lock_filter.lua` | PRISMA Floor-Lock: filtra variantes < floor |
| 6 | `log_by_lua_file` | `bandwidth_reactor.lua` | PRISMA: EWMA throughput + TELESCOPE L1 ring buffer |

#### Soporte Lua

| Archivo | Función |
|---|---|
| `sentinel_ua_apply.lua` | Aplica UA rotado |
| `lab_config.lua` | Lee 6 JSONs LAB con cache 300s |
| `shield_follow_302.lua` | Sigue 302 CDN (hasta 3 redirects) |
| `follow_redirect.lua` | Intercepta 302 upstream |

#### Endpoints Lua (content_by_lua)

| Archivo | Endpoint | Retorna |
|---|---|---|
| `bandwidth_reactor_api.lua` | `/prisma/api/bandwidth-reactor` | EWMA bps, instant, peak, state |
| `sentinel_telemetry_api.lua` | `/prisma/api/sentinel-status` | Estado sentinel por proveedor |
| `prisma_telemetry_full.lua` | `/prisma/api/telemetry-full` | JSON unificado (hardware+network+QoE+reactor) |

---

### MÓDULO 5: PHP API

#### Shield Auth

| Archivo | Función |
|---|---|
| `/var/www/html/api/shield-auth.php` | Valida token `/shield/{TOKEN}/...` → 204/403 |
| `/etc/net-shield/authorized_tokens.json` | Registry tokens (MASTER HFRC, exp 2099) |

#### Upload Pipeline

| Archivo | Función |
|---|---|
| `upload_chunk.php` | Chunks 10MB + SHA256 |
| `finalize_upload.php` | Ensambla + gzip |
| `upload.php` | Upload monolítico legacy |
| `upload_industrial.php` | Upload con validación extra |
| `upload_status.php` | Polling estado |
| `list_files.php` | Lista archivos VPS |
| `delete_file.php` | Eliminar archivo |
| `verify.php` | Verificar post-upload |
| `gzip_hook.php` | Compresión gzip |
| `cleanup_chunks.php` | Limpieza chunks |

#### Shield Monitoring

| Archivo | Función |
|---|---|
| `api/health.php` | Health completo (WG, NGINX, disk, RAM) |
| `api/net-shield-status.php` | Estado NET SHIELD |
| `api/netshield-sentinel.php` | Sentinel: métricas + propuestas |

#### Resolvers

| Archivo | Función |
|---|---|
| `resolve_quality_unified.php` | **SSOT resolver** (315KB) |
| `resolve_quality_unified_LIVE.php` | Resolver live (290KB) |
| `resolve.php` / `resolve_quality.php` / `resolve_quality_v5.php` | Legacy |
| `resolve_redirect.php` | Resolver 302 |

---

### MÓDULO 6: APE PRISMA v1.2 (Quality Uplift Post-Processor)

**Propósito:** Post-procesamiento de calidad visual. Filtra variantes HLS bajas, mide throughput, predice degradación, reporta telemetría.

#### 7 Sub-módulos UI

| Sub-módulo | Función |
|---|---|
| CMAF Packaging | fMP4/CMAF repackaging |
| LCEVC Enhancement | Low Complexity Enhancement Video Codec |
| HDR10+ Dynamic | Scene-by-scene tone mapping |
| AI Super Resolution | Neural upscaling engine |
| Quantum Pixel | 8000 nits, 12-bit, 4:4:4 deep color |
| Fake 4K Upscaler | 120fps MEMC, HDR lift, neural depth |
| v1.2 Player Enrichment | EXTVLCOPT, KODIPROP, CODECS Rewriter (36 directives) |

#### Frontend

`frontend/js/prisma-control-widget.js` — toggle ACTIVO/PANIC, perfiles P0-P5

#### Backend PHP

| Archivo | Función |
|---|---|
| `prisma_processor.php` | Motor post-procesamiento |
| `prisma_state.php` | Estado (activo/pánico/perfiles) |
| `prisma_bootstrap.php` | Inicialización |
| `lib/lab_config_loader.php` | Cargador PHP de 6 JSONs LAB |

#### PRISMA API

| Archivo | Endpoint | Función |
|---|---|---|
| `prisma-health.php` | `/prisma/api/health` | Health por sub-módulo |
| `prisma-control.php` | `/prisma/api/control` | Enable/disable módulos, PANIC |
| `prisma-adb-telemetry.php` | `/prisma/api/adb-telemetry` | Telemetría ADB |

#### 6 LAB Config JSONs (SSOT)

| JSON | Función |
|---|---|
| `floor_lock_config.json` | Pisos bitrate por perfil (P0=15Mbps, P3=8Mbps) |
| `profile_boost_multipliers.json` | Multiplicadores boost (P0=2.0x, P3=1.5x) |
| `telescope_thresholds.json` | Umbrales TELESCOPE (TTFB, jitter, slope) |
| `sentinel_providers_map.json` | UA pools, fingerprints, retry policies |
| `channels_prisma_dna.json` | DNA canales: resolución, codec, bitrate |
| `enterprise_doctrine_manifest.json` | Reglas inmutables del sistema |

#### ADB Daemon

| Archivo | Función |
|---|---|
| `prisma_adb_daemon.sh` + `.service` | Métricas player via ADB (CPU, RAM, buffer, codec) |
| `prisma_device_metrics.sh` | Escribe a `/dev/shm/prisma_device_metrics.json` |
| `prisma_history_writer.sh` | Historial para tendencias |
| `prisma_adb_overlay.sh` | Debug overlay en pantalla |
| `prisma_adb_validate.sh` | Validación conexión ADB |
| `prisma_firetv_toast.sh` | Toast notifications Fire TV |
| `prisma_telemetry_writer.sh` | Escritor telemetría |

#### Guardian Bridge

| Archivo | Función |
|---|---|
| `prisma_guardian_bridge.py` + `.service` | Bridge PRISMA ↔ APE Realtime Guardian |

#### Deploy

| Archivo | Función |
|---|---|
| `prisma-v2-deploy.sh` | Despliegue: configs, Lua, PHP, reload NGINX |
| `prisma-v2-rollback.sh` | Rollback atómico |

---

### MÓDULO 7: Systemd Services

| Servicio | Intervalo | Función |
|---|---|---|
| `netshield-wg-health` | 30s | Monitor WireGuard + auto-restart |
| `net-shield-metrics` | 10s | Métricas throughput |
| `net-shield-throughput` | continuo | Throughput continuo |
| `netshield-health` | 5min | Health check general |
| `netshield-autopilot` | 5min | Ajustes automáticos |
| `netshield-sentinel` | 60min | Análisis profundo + propuestas |
| `netshield-backup` | diario 3AM | Backup configs |

---

### MÓDULO 8: Sentinel Pipeline (AI-driven)

| Archivo | Función |
|---|---|
| `sentinel-collect.sh` | Recolecta métricas |
| `sentinel-classify.py` | Clasifica por severidad |
| `sentinel-diagnose.py` | Diagnóstico automático |
| `sentinel-execute.py` | Ejecuta acciones |
| `sentinel-apply-approved.py` | Aplica propuestas |
| `sentinel-report.py` | Genera reportes |
| `sentinel-llm-diagnose.py` | Diagnóstico con LLM |
| `sentinel-cycle.sh` | Orquestador ciclo completo |

---

### MÓDULO 9: Kernel TCP/IP (sysctl)

| Parámetro | Valor | Efecto |
|---|---|---|
| `tcp_congestion_control` | bbr | Maximiza throughput |
| `default_qdisc` | fq | Fair queuing BBR |
| `rmem_max / wmem_max` | 128 MB | Buffers socket masivos |
| `tcp_fastopen` | 3 | -1 RTT |
| `tcp_slow_start_after_idle` | 0 | NO resetear cwnd |
| `somaxconn` | 65535 | Accept backlog máximo |

Archivo: `/etc/sysctl.d/99-iptv-shield.conf`

---

### MÓDULO 10: DSCP / QoS

Chain `SURFSHARK_MARK` → DSCP 0x2e (Expedited Forwarding)
Endpoints: 149.18.45.78, .119, .189, 91.208.115.23, 172.110.220.61

---

### MÓDULO 11: Storage

| Path | Tipo | Función |
|---|---|---|
| `/var/www/lists/` | Disco | Playlists (.m3u8 placeholder 8B + .m3u8.gz comprimido) |
| `/dev/shm/nginx_cache` | RAM | Cache NGINX (zero I/O) |
| `/dev/shm/prisma_device_metrics.json` | RAM | Métricas hardware |
| `/opt/netshield/state/` | Disco | Estado persistente |
| `/root/backups/` | Disco | Backups certificados |

---

## PARTE IV — OPERACIONES

### 8. Diagnóstico de Freezes en Lista SHIELDED

Los freezes **NUNCA** se resuelven cambiando URLs internas. Diagnosticar:

```bash
# 1. ¿WireGuard activo?
ssh root@178.156.147.234 "wg show | head -15"

# 2. ¿DNS hijack funcionando?
ssh root@178.156.147.234 "dig @127.0.0.1 nfqdeuxu.x1megaott.online +short"
# Esperado: 178.156.147.234

# 3. ¿NGINX procesando requests?
ssh root@178.156.147.234 "tail -5 /var/log/nginx/shield_access.log"

# 4. ¿Errores 503 propios? (ut=- = generado por nginx, no upstream)
ssh root@178.156.147.234 "grep ' 503 ' /var/log/nginx/shield_access.log | grep 'ut=-' | tail -5"

# 5. ¿CDN dando 403 masivo?
ssh root@178.156.147.234 "grep ' 403 ' /var/log/nginx/iptv_intercept.log | tail -5"

# 6. ¿Stale salvando al player?
ssh root@178.156.147.234 "grep 'STALE' /var/log/nginx/iptv_intercept.log | tail -5"

# 7. ¿Lua en PASSTHROUGH? (DEBE retornar 0)
ssh root@178.156.147.234 "grep -c 'ngx.exit' /etc/nginx/lua/*.lua"

# 8. ¿Buffer del player saludable?
# Telemetría PRISMA: buffer_health_pct >= 60%
curl -s "https://iptv-ape.duckdns.org/prisma/api/telemetry-full" | python3 -m json.tool | grep buffer_health

# 9. ¿Bandwidth Reactor activo?
curl -s "https://iptv-ape.duckdns.org/prisma/api/bandwidth-reactor" | python3 -m json.tool
```

### 9. Rollback de Emergencia

```bash
ssh root@178.156.147.234 "cd /root/backups && tar xzf autopista_20260426.tar.gz -C / && nginx -t && systemctl reload nginx"
```

### 10. Invariantes de Throughput (NO bajar de estos valores)

| Parámetro | Valor mínimo |
|---|---|
| `proxy_buffer_size` | 128k |
| `proxy_buffers` | 16 × 128k (2MB) |
| `proxy_busy_buffers_size` | 256k |
| `proxy_connect_timeout` | 3s |
| `proxy_read_timeout` | 60s (NUNCA < 30s) |
| `proxy_send_timeout` | 60s (NUNCA < 30s) |
| `limit_conn xtream_slot` | 2 (NUNCA 1) |
| `hard_cap rate` | 100r/s (NUNCA menor) |

### 11. Invariantes de Cache

| Parámetro | Valor exacto |
|---|---|
| `proxy_cache_valid 200 206` | 20s |
| `proxy_cache_valid 302 301` | 0 (NUNCA > 0) |
| `proxy_cache_valid 403 401` | 0 (NUNCA > 0) |
| `proxy_cache_use_stale` (CDN) | DEBE incluir `http_403` |
| `proxy_cache_background_update` | on |
| `proxy_cache_path` | en `/dev/shm` (RAM) |

---

## PARTE V — CONTEO Y CROSS-REFERENCES

### 12. Conteo Total

| Capa | Archivos |
|---|---|
| WireGuard | 4 |
| Unbound DNS | 2 |
| NGINX conf.d | 14 |
| NGINX snippets | 6 |
| NGINX Lua | 14 |
| PHP Shield + Upload | 13 |
| PHP Resolvers | 6 |
| PRISMA (PHP + Config + Scripts + ADB + Bridge + Deploy) | 26 |
| PRISMA Frontend | 1 |
| Systemd | 14 (7 services + 7 timers) |
| Sentinel | 8 |
| Sysctl | 1 |
| **TOTAL** | **~107 archivos activos** |

### 13. Documentos Hermanos (Triangulación Cross-Agent)

| Documento | Audiencia | Propósito |
|---|---|---|
| `.agent/skills/shielded_architecture_immutable/SKILL.md` | Claude Code | Doctrina + invariantes |
| `.agent/skills/shielded_architecture_immutable/WORKFLOW_BLOQUEANTE.md` | Cross-agent | Gate operacional bash |
| `.gemini/settings/shielded-sop.md` | Gemini CLI | SOP cardinal |
| `.gemini/settings/shielded-architecture.md` | Gemini CLI | Arquitectura técnica |
| `.gemini/settings/shielded-vps-modules-sop.md` | Gemini CLI | Inventario detallado |
| `~/.claude/.../memory/feedback_shielded_url_immutable.md` | Claude persistente | Memoria entre sesiones |
| **Este archivo** | Cross-agent | **SOP COMPLETO DEFINITIVO** |

Los documentos son **sincrónicos**. Drift → riesgo de violación de doctrina.

### 14. Logs del Sistema

| Log | Propósito |
|---|---|
| `/var/log/nginx/shield_access.log` | Requests al shield |
| `/var/log/nginx/shield_error.log` | Errores shield |
| `/var/log/nginx/iptv_intercept.log` | Requests CDN intercept |
| `/var/log/nginx/error.log` | Errores globales |
| `/var/log/nginx/shield-auth.log` | Auth shield (tokens) |

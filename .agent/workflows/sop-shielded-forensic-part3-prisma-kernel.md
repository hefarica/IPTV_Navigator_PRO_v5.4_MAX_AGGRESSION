# SOP FORENSE SHIELDED — PARTE 3: PRISMA + PHP + KERNEL + SYSTEMD

> **Partes:** [1/4] Doctrina — [2/4] NGINX+Lua — **[3/4] PRISMA+Kernel** — [4/4] Operaciones
> **Snapshot:** `vps/vps-live-snapshot-20260428/`

---

## 8. MÓDULO 5: PHP API Layer

### 8.1 Shield Auth — `shield-auth.php` (7.3KB)

```php
// Valida token en /shield/{TOKEN}/host/path
// Lee /etc/net-shield/authorized_tokens.json
// Token MASTER: owner=HFRC, expires=2099-12-31
// Responde: 204 OK → pass | 403 Denied → block
// Headers de respuesta:
//   X-Shield-Owner: HFRC
//   X-Shield-Auth: VALID
```

| Verificación | Acción si falla |
|---|---|
| Token no existe | 403 + log |
| Token expirado | 403 + log |
| Token válido | 204 + set X-Shield-Owner |

### 8.2 Health Check — `health.php` (11.1KB)

Verificaciones completas:
- WireGuard: `wg show` parsed
- NGINX: `nginx -t` + active connections
- Disk: space available en `/var/www/lists/` y `/dev/shm`
- RAM: free/total/buffers
- PHP-FPM: pool status
- Unbound: resolución de test
- Retorna JSON con score de salud

### 8.3 Upload Pipeline (10 archivos PHP)

| Archivo | Función | Detalles |
|---|---|---|
| `upload_chunk.php` | Recibe chunks | 10MB max, SHA256 verification, resume support |
| `finalize_upload.php` | Ensambla chunks | Concatena → archivo final → `gzip -9` → placeholder |
| `upload.php` | Upload monolítico | Legacy <250MB, sin chunking |
| `upload_industrial.php` | Upload reforzado | Validación extra, retry logic |
| `upload_status.php` | Polling | Estado del upload en progreso |
| `list_files.php` | Inventario | Lista `/var/www/lists/` con sizes, dates |
| `delete_file.php` | Eliminar | Borra .m3u8 + .m3u8.gz |
| `verify.php` | Verificar | Confirma existencia post-upload |
| `gzip_hook.php` | Compresión | `gzip -9` post-upload |
| `cleanup_chunks.php` | Limpieza | Chunks huérfanos |

**Mecanismo gzip + placeholder:**
```
APE_LISTA_xxx_SHIELDED.m3u8      →  8 bytes (placeholder)
APE_LISTA_xxx_SHIELDED.m3u8.gz   →  178-434 MB (contenido real)
```
NGINX con `gzip_static on` sirve el `.gz` cuando `Accept-Encoding: gzip`.

### 8.4 Resolvers (6 archivos)

| Archivo | Función | Tamaño |
|---|---|---|
| `resolve_quality_unified.php` | **SSOT resolver**: sniper mode + anti-cut + elite enrichment | 315 KB |
| `resolve_quality_unified_LIVE.php` | Versión live del SSOT | 290 KB |
| `resolve.php` | Legacy resolver | — |
| `resolve_quality.php` | Wrapper del resolver | — |
| `resolve_quality_v5.php` | Resolver v5 | — |
| `resolve_redirect.php` | 302 redirect resolver | — |

---

## 9. MÓDULO 6: APE PRISMA v1.2 Completo

### 9.1 Arquitectura PRISMA

```
┌─────────────────────────────────────────────────────┐
│                    PRISMA v1.2                       │
│                                                     │
│  ┌──────────────┐   ┌──────────────┐                │
│  │ LAB Config   │   │ ADB Daemon   │                │
│  │ (6 JSONs)    │   │ (Fire TV)    │                │
│  └──────┬───────┘   └──────┬───────┘                │
│         │                  │                         │
│         ▼                  ▼                         │
│  ┌──────────────────────────────┐                    │
│  │ lab_config.lua (cache 300s) │                    │
│  └──────────────┬───────────────┘                    │
│                 │                                    │
│     ┌───────────┼───────────┐                        │
│     ▼           ▼           ▼                        │
│  ┌────────┐ ┌────────┐ ┌────────────┐               │
│  │ Floor  │ │Bandw.  │ │ Decision   │               │
│  │ Lock   │ │Reactor │ │ Engine     │               │
│  │Filter  │ │+TELES. │ │(TELESCOPE) │               │
│  └────┬───┘ └────┬───┘ └─────┬──────┘               │
│       │          │            │                      │
│       ▼          ▼            ▼                      │
│  ┌──────────────────────────────────┐                │
│  │    shared dict circuit_metrics   │                │
│  └──────────────┬───────────────────┘                │
│                 │                                    │
│     ┌───────────┼───────────┐                        │
│     ▼           ▼           ▼                        │
│  ┌────────┐ ┌────────┐ ┌────────────┐               │
│  │Reactor │ │Sentinel│ │Telemetry   │               │
│  │  API   │ │  API   │ │ Full API   │               │
│  └────────┘ └────────┘ └────────────┘               │
│                                                     │
│  ┌──────────────────────────────┐                    │
│  │  Frontend: prisma-control-   │                    │
│  │  widget.js (toggle/profiles) │                    │
│  └──────────────────────────────┘                    │
└─────────────────────────────────────────────────────┘
```

### 9.2 Los 7 Sub-módulos UI

| # | Sub-módulo | Función | Cómo opera |
|---|---|---|---|
| 1 | CMAF Packaging | fMP4/CMAF repackaging | Segmentación CMAF-compliant |
| 2 | LCEVC Enhancement | Low Complexity Enhancement | Capa de mejora sobre codec base |
| 3 | HDR10+ Dynamic | Tone mapping por escena | Metadatos dinámicos scene-by-scene |
| 4 | AI Super Resolution | Neural upscaling | Upscale 1080p→4K via neural net |
| 5 | Quantum Pixel | Deep color 12-bit 4:4:4 | 8000 nits peak, full gamut BT.2020 |
| 6 | Fake 4K Upscaler | MEMC 120fps + HDR lift | Motion estimation + neural depth |
| 7 | Player Enrichment v1.2 | EXTVLCOPT/KODIPROP/CODECS | 36 directives inyectadas al M3U8 |

Todos operan por **perfil** (P0=máximo a P5=mínimo) con filtro por resolución.

### 9.3 LAB Config JSONs (6 archivos SSOT)

Ubicación local: `vps/prisma/config/`
Leídos por: `lab_config.lua` (Lua, cache 300s) + `lab_config_loader.php` (PHP)

| JSON | Bytes | Contenido exacto |
|---|---|---|
| `floor_lock_config.json` | 807 | `floor_lock_enabled: true`, pisos por perfil: P0=15Mbps, P1=12Mbps, P2=10Mbps, P3=8Mbps, P4=5Mbps, P5=1Mbps |
| `profile_boost_multipliers.json` | 1,382 | Multiplicadores: P0=2.0×, P1=1.8×, P2=1.6×, P3=1.5×, P4=1.3×, P5=1.0× |
| `telescope_thresholds.json` | 1,509 | TTFB high=500ms, jitter=50ms, loss=2%, breach prediction window=30s |
| `sentinel_providers_map.json` | 2,909 | UA pools por proveedor, fingerprints, retry policies, cooldowns |
| `channels_prisma_dna.json` | 3,101 | Resolución/codec/bitrate esperado por canal |
| `enterprise_doctrine_manifest.json` | 7,678 | Reglas inmutables: prohibiciones, invariantes, versiones |

### 9.4 ADB Daemon y Métricas

| Archivo | Función |
|---|---|
| `prisma_adb_daemon.sh` + `.service` | Recolecta CPU, RAM, buffer state, codec activo del player via ADB |
| `prisma_device_metrics.sh` | Escribe a `/dev/shm/prisma_device_metrics.json` (RAM, zero I/O) |
| `prisma_history_writer.sh` | Persiste historial para análisis de tendencias |
| `prisma_adb_overlay.sh` | Debug overlay directo en pantalla del player |
| `prisma_adb_validate.sh` | Valida conexión ADB al dispositivo |
| `prisma_firetv_toast.sh` | Muestra toast notifications al Fire TV |
| `prisma_telemetry_writer.sh` | Escritor de telemetría a archivos de estado |

### 9.5 Guardian Bridge

```python
# prisma_guardian_bridge.py — Bridge Python
# Sincroniza decisiones entre PRISMA (calidad visual) y
# APE Realtime Guardian (protección de reproducción)
# Systemd service: prisma-guardian-bridge.service
```

### 9.6 Deploy

| Script | Función |
|---|---|
| `prisma-v2-deploy.sh` | Copia configs, Lua, PHP al VPS → `nginx -t` → `systemctl reload nginx` |
| `prisma-v2-rollback.sh` | Restaura backup pre-deploy → reload |

---

## 10. MÓDULO 7: Kernel TCP/IP — `99-iptv-shield.conf` (7.3KB)

### 10.1 Congestion Control

```ini
net.core.default_qdisc = fq                    # Fair queuing para BBR
net.ipv4.tcp_congestion_control = bbr           # Google BBR: maximiza throughput
net.ipv4.tcp_fastopen = 3                       # Client+Server, -1 RTT
```

### 10.2 Buffers de Socket

```ini
net.core.rmem_max = 67108864                    # 64MB read
net.core.wmem_max = 67108864                    # 64MB write
net.ipv4.tcp_rmem = 4096 1048576 67108864       # min 4K, default 1M, max 64M
net.ipv4.tcp_wmem = 4096 1048576 67108864       # autotuning agresivo
net.core.netdev_max_backlog = 5000              # absorbe bursts
```

### 10.3 Anti-degradación

```ini
net.ipv4.tcp_slow_start_after_idle = 0          # NO resetear cwnd en idle
net.ipv4.tcp_tw_reuse = 1                       # Reusar TIME_WAIT
net.ipv4.tcp_fin_timeout = 15                   # Liberar sockets rápido
net.core.somaxconn = 65535                      # Accept backlog máximo
net.ipv4.tcp_max_syn_backlog = 65535            # SYN backlog
net.ipv4.tcp_no_metrics_save = 1                # No contaminar métricas
net.ipv4.tcp_low_latency = 1                    # Prioriza latencia
```

### 10.4 Recovery y SACK

```ini
net.ipv4.tcp_sack = 1                           # Selective ACK
net.ipv4.tcp_dsack = 1                          # Duplicate SACK
net.ipv4.tcp_mtu_probing = 1                    # PMTU discovery
net.ipv4.tcp_ecn = 1                            # Explicit Congestion Notification
net.ipv4.tcp_frto = 2                           # Spurious retrans detection
```

### 10.5 Low Latency

```ini
net.core.busy_poll = 50                         # Busy polling 50μs
net.core.busy_read = 50                         # Low-latency read
net.ipv4.tcp_notsent_lowat = 16384              # 16KB (reduce buffer interno)
net.ipv4.tcp_thin_linear_timeouts = 1           # Thin streams
net.ipv4.tcp_thin_dupack = 1                    # Quick retrans thin
net.ipv4.tcp_pacing_ss_ratio = 200              # BBR pacing
net.ipv4.tcp_pacing_ca_ratio = 120              # BBR CA ratio
```

### 10.6 Conntrack (streams simultáneos)

```ini
net.netfilter.nf_conntrack_max = 524288         # 500K+ connections
net.netfilter.nf_conntrack_tcp_timeout_established = 86400  # 24h
```

---

## 11. MÓDULO 8: Systemd Services

| Servicio | Timer | Intervalo | Script | Función |
|---|---|---|---|---|
| `netshield-wg-health` | `.timer` | 30s | `wg-health-monitor.sh` (14.5KB) | Monitor WG + auto-restart cooldown 2min |
| `net-shield-metrics` | `.timer` | 10s | (built-in) | Recolección throughput |
| `net-shield-throughput` | — | continuo | (built-in) | Medición continua |
| `netshield-health` | `.timer` | 5min | `healthcheck.sh` | Health check general |
| `netshield-autopilot` | `.timer` | 5min | `netshield_autopilot_v2.py` (17.4KB) | Ajustes automáticos |
| `netshield-sentinel` | `.timer` | 60min | `sentinel-cycle.sh` | Análisis profundo |
| `netshield-backup` | `.timer` | diario 3AM | `backup_configs.sh` | Backup configs |

---

## 12. MÓDULO 9: Sentinel Pipeline (AI-driven, 8 scripts)

```
sentinel-collect.sh → sentinel-classify.py → sentinel-diagnose.py
                                                    ↓
                                          sentinel-llm-diagnose.py (LLM, 12KB)
                                                    ↓
                                          sentinel-execute.py → sentinel-apply-approved.py
                                                    ↓
                                          sentinel-report.py
                                                    ↓
                                          sentinel-cycle.sh (orquestador)
```

**Estado persistente:**
- `/opt/netshield/state/proposals/` — 20+ proposals JSON
- `/opt/netshield/state/proposals_index.json` — índice
- `/opt/netshield/state/signatures.json` — firmas de cambios
- `/opt/netshield/state/applied/` — proposals aplicadas

---

## 13. MÓDULO 10: DSCP / QoS

```bash
# wg0.conf PostUp rules:
iptables -t mangle -A PREROUTING  -i wg0 -j DSCP --set-dscp-class EF
iptables -t mangle -A POSTROUTING -o wg0 -j DSCP --set-dscp-class EF
```

**DSCP 0x2e (EF = Expedited Forwarding)** — prioridad máxima en cada hop de red.
Aplicado bidireccional: tráfico entrante Y saliente del tunnel WireGuard.

---

## 14. MÓDULO 11: Storage

| Path | Tipo | Función | Tamaño |
|---|---|---|---|
| `/var/www/lists/` | NVMe | Playlists (placeholder 8B + .gz 178-434MB) | Variable |
| `/dev/shm/nginx_cache` | RAM | Cache NGINX (zero I/O disk) | ~500MB |
| `/dev/shm/prisma_device_metrics.json` | RAM | Métricas hardware en tiempo real | ~4KB |
| `/opt/netshield/state/` | NVMe | Estado persistente (WG health, proposals) | ~200KB |
| `/root/backups/` | NVMe | Backups certificados | ~20KB c/u |

---

## Siguiente: [Parte 4 — Operaciones y Diagnóstico](sop-shielded-forensic-part4-operations.md)

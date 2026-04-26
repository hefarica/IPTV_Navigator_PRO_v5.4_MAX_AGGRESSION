---
name: "net-shield-autopista-sop"
description: "SOP ABSOLUTO del VPS NET SHIELD AUTOPISTA — reglas inmutables de cómo DEBE funcionar el proxy IPTV para transmisión. Nunca degradar, nunca bloquear, nunca frenar."
---

# SOP: NET SHIELD AUTOPISTA — VPS Proxy IPTV de Transmisión

> **Versión:** 1.0 — 2026-04-26
> **Backup certificado:** `/root/backups/autopista_20260426.tar.gz`
> **Estado:** PRODUCCIÓN ACTIVA

## 1. Propósito

Este VPS (Hetzner CPX21, 3 vCPU AMD, 4GB RAM, 40GB NVMe) funciona como un **proxy transparente de máximo rendimiento** para transmisión IPTV. Su única función es reenviar tráfico de video del proveedor al player a través de un túnel WireGuard + SurfShark, con la **mínima fricción posible**.

> **REGLA CARDINAL:** El VPS NUNCA debe frenar, bloquear, limitar ni interferir con la reproducción. Todo request del player SIEMPRE debe llegar al upstream. Si el upstream falla, nginx maneja failover automáticamente — nunca un script Lua ni un circuit breaker.

---

## 2. Arquitectura

```
Player (OTT Navigator / TiVistation)
    │
    └─→ WireGuard (10.200.0.3 → 10.200.0.1)
            │
            └─→ NGINX (NET SHIELD)
                    │
                    ├─→ /shield/{owner}/{host}/...  → proxy_pass a upstream
                    │     │
                    │     └─→ SurfShark VPN (wg0) → Proveedor IPTV
                    │             │
                    │             └─→ tivigo.cc → 302 → zivovrix.cc/rynivorn.cc
                    │
                    ├─→ DNS Hijack (Unbound)
                    │     zivovrix.cc → 127.0.0.1
                    │     rynivorn.cc → 127.0.0.1
                    │
                    └─→ CDN Intercept (nginx server blocks)
                          *.zivovrix.cc → proxy_pass 154.6.152.13
                          *.rynivorn.cc → proxy_pass CDN real
```

---

## 3. Reglas Inmutables

### 3.1 NUNCA bloquear requests

| Regla | Implementación |
|---|---|
| Sin circuit breaker activo | `upstream_gate.lua` = PASSTHROUGH (solo telemetría) |
| Sin circuit breaker response | `upstream_response.lua` = PASSTHROUGH (solo logging) |
| Sin rate limit restrictivo | `hard_cap` = 100 r/s (solo anti-DOS extremo) |
| Sin connection limit restrictivo | `xtream_slot` = 2 (permite overlap natural de manifests) |
| Sin request rejection por 5xx | `proxy_next_upstream error timeout http_502 http_503 http_504` maneja failover |

### 3.2 Máximo throughput

| Parámetro | Valor | Razón |
|---|---|---|
| `proxy_buffer_size` | 128k | Headers de manifests HLS grandes |
| `proxy_buffers` | 16 × 128k (2MB) | Buffer total para segmentos 4K |
| `proxy_busy_buffers_size` | 256k | Enviar al player mientras sigue descargando |
| `output_buffers` | 4 × 128k | Salida al cliente en bloques grandes |
| `proxy_connect_timeout` | 3s | Tolerancia a SurfShark hops |
| `proxy_read_timeout` | 60s | Segmentos 4K pesados no timeout |
| `proxy_send_timeout` | 60s | Margin para clientes lentos |

### 3.3 Cache inteligente (no restrictivo)

| Parámetro | Valor | Razón |
|---|---|---|
| `proxy_cache_path` | `/dev/shm/nginx_cache` (RAM) | Zero I/O disk — cache en RAM |
| `proxy_cache_valid 200 206` | 20s | Manifests válidos por 20s |
| `proxy_cache_valid 302 301` | 0 | NUNCA cachear redirects (tokens dinámicos) |
| `proxy_cache_valid 403 401` | 0 | NUNCA cachear errores de auth |
| `proxy_cache_use_stale` | `error timeout updating http_500 http_502 http_503 http_504` | Si upstream falla, servir stale |
| `proxy_cache_use_stale` (CDN) | Incluye `http_403` | Tokens expirados → servir manifest stale |
| `proxy_cache_background_update` | on | Refrescar en background sin bloquear al player |
| `proxy_cache_lock` | on, 3s timeout | 1 request al upstream por manifest, el resto espera cache |

### 3.4 Kernel TCP/IP Agresivo

| Parámetro | Valor | Efecto |
|---|---|---|
| `tcp_congestion_control` | **bbr** | Ignora packet loss, maximiza throughput |
| `default_qdisc` | **fq** | Fair queuing para BBR |
| `tcp_fastopen` | 3 | Cliente + servidor, -1 RTT |
| `tcp_low_latency` | 1 | Prioriza latencia sobre throughput |
| `rmem_max / wmem_max` | 128 MB | Buffers masivos de socket |
| `tcp_rmem / tcp_wmem` | 4KB / 1MB / 128MB | Autotuning agresivo |
| `somaxconn` | 65535 | Accept backlog máximo |
| `netdev_max_backlog` | 16384 | Absorbe microbursts HLS |
| `tcp_tw_reuse` | 1 | Reusar TIME_WAIT rápido |
| `tcp_fin_timeout` | 15s | Liberar sockets rápido |
| `tcp_slow_start_after_idle` | 0 | NO resetear cwnd en idle |
| `tcp_no_metrics_save` | 1 | No contaminar métricas entre conexiones |
| `tcp_mtu_probing` | 1 | Descubrir PMTU cuando ICMP falla |
| `tcp_sack / tcp_dsack` | 1 | Recuperación rápida de packet loss |
| `tcp_ecn` | 1 | Explicit Congestion Notification |
| `busy_poll / busy_read` | 50 | Low-latency polling |

### 3.5 DSCP (Quality of Service)

| Destino | DSCP | Significado |
|---|---|---|
| IPs de SurfShark endpoints | 0x2e (EF) | Expedited Forwarding — prioridad máxima |
| Chain `SURFSHARK_MARK` | Marca todo tráfico saliente por wg0 | Priorización de video |

---

## 4. Proveedores y Upstreams

### 4.1 Upstreams directos (en iptv-intercept.conf)

| Nombre | Hosts | Puertos | Notas |
|---|---|---|---|
| `tivigo_upstream` | 154.6.41.6, .66, .126, .186 | 80 | Pool con `max_fails=0` (nunca marcar down) |
| `x1megaott_upstream` | nfqdeuxu.x1megaott.online | 80 | — |
| `line_tivi_upstream` | line.tivi-ott.net | 80 | — |
| `ky_tv_upstream` | ky-tv.cc | 80 | — |

### 4.2 CDN Intercepts (DNS hijack)

| Dominio | Resolución | Proxy real | Archivo |
|---|---|---|---|
| `*.zivovrix.cc` | 127.0.0.1 (Unbound) | 154.6.152.13:80 | `zivovrix-intercept.conf` |
| `*.rynivorn.cc` | 127.0.0.1 (Unbound) | CDN real | `rynivorn-intercept.conf` |

### 4.3 Cache use_stale en CDN intercepts

Ambos CDN intercepts DEBEN tener:
```nginx
proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504 http_403;
```
El `http_403` es **obligatorio** — los tokens del CDN expiran cada ~5-10s y el background update recibe 403. Sin `http_403` en stale, el player recibe el error.

---

## 5. Seguridad

| Capa | Implementación |
|---|---|
| Autenticación | `auth_request /_shield_auth` → PHP verifica owner token |
| Headers | `proxy_pass_request_headers off` → solo envía Accept, Host, UA, Referer |
| User-Agent | Fixed: `Mozilla/5.0 (Linux; Android 10; AFTKA) AppleWebKit/537.36 Silk/112.3.1` |
| Referer | Fixed: `https://www.netflix.com/` |
| Variable blindaje | Maps en `http{}` context, no `set` en location (anti-clobber) |

---

## 6. Archivos Críticos (Inventario)

```
/etc/nginx/
├── nginx.conf                      # Config principal + proxy_cache_path
├── conf.d/
│   ├── 00-iptv-quantum.conf        # Baseline: aio, buffers, stale policy
│   ├── iptv-intercept.conf         # Upstreams + server blocks proveedores
│   ├── iptv-shield-rate.conf       # Maps (shield_host, shield_path, shield_upstream) + hard_cap
│   ├── iptv-limit-conn.conf        # xtream_account zone definition
│   ├── iptv-lua-circuit.conf       # Lua shared dicts (upstream_state, circuit_metrics)
│   ├── zivovrix-intercept.conf     # CDN intercept *.zivovrix.cc
│   └── rynivorn-intercept.conf     # CDN intercept *.rynivorn.cc
├── snippets/
│   └── shield-location.conf        # Location /shield/ completa
├── lua/
│   ├── upstream_gate.lua           # PASSTHROUGH (telemetría, nunca bloquea)
│   └── upstream_response.lua       # PASSTHROUGH (logging, nunca bloquea)
│
/etc/sysctl.d/
├── 99-iptv-shield.conf             # Kernel TCP tuning base
└── 99-iptv-shield-quantum.conf     # Kernel tuning incremental (128MB buffers)

/etc/unbound/
└── local.d/
    └── iptv-ape.conf               # DNS hijack: zivovrix.cc, rynivorn.cc → 127.0.0.1
```

---

## 7. Prohibiciones Absolutas

> [!CAUTION]
> Las siguientes acciones están **PROHIBIDAS** porque causan freezes, 503s, o cortes de señal:

1. **NUNCA activar un circuit breaker que bloquee por host** — un error en 1 canal NO debe afectar a otros canales del mismo proveedor
2. **NUNCA poner `limit_conn xtream_slot 1`** — causa 429 por overlap natural de manifest polls
3. **NUNCA poner `proxy_cache_valid 302` > 0** — los redirects 302 llevan tokens dinámicos que expiran en segundos
4. **NUNCA quitar `http_403` de `proxy_cache_use_stale` en los CDN intercepts** — los tokens del CDN expiran y sin stale el player recibe 403
5. **NUNCA cachear redirects del shield** (`proxy_cache_valid 302 0`) — cada 302 lleva un token único
6. **NUNCA usar `set $variable $capture` dentro de locations con `auth_request`** — las capturas numeradas se clobberen en subrequests. Usar `map` en `http{}` context
7. **NUNCA poner cooldowns de minutos por 403** — un 403 del CDN es token expirado, no rechazo permanente
8. **NUNCA reducir `proxy_read_timeout` por debajo de 30s** — segmentos 4K pueden tardar
9. **NUNCA activar `keepalive` en upstreams Xtream** — causan RST en conexiones stale

---

## 8. Rollback

Si algo falla después de un cambio:

```bash
# Restaurar desde backup
cd /root/backups
tar xzf autopista_20260426.tar.gz -C /
nginx -t && systemctl reload nginx
```

---

## 9. Monitoreo

### Logs activos
| Log | Propósito |
|---|---|
| `/var/log/nginx/shield_access.log` | Requests al shield (formato iptv_intercept) |
| `/var/log/nginx/shield_error.log` | Errores del shield (warn level) |
| `/var/log/nginx/iptv_intercept.log` | Requests a CDN intercepts |
| `/var/log/nginx/error.log` | Errores globales nginx |

### Verificación rápida de salud
```bash
# ¿Hay 503 propios? (ut=- indica generado por nginx, no upstream)
grep ' 503 ' /var/log/nginx/shield_access.log | grep 'ut=-' | tail -5

# ¿Circuit breaker bloqueando? (debe decir PASSTHROUGH)
curl -s -o /dev/null -D - "http://localhost/shield/test/tivigo.cc/health" 2>/dev/null | grep X-APE

# ¿Requests llegando al upstream?
tail -5 /var/log/nginx/shield_access.log

# ¿CDN dando 403 masivo?
grep ' 403 ' /var/log/nginx/iptv_intercept.log | tail -5

# ¿Stale salvando al player?
grep 'STALE' /var/log/nginx/iptv_intercept.log | tail -5
```

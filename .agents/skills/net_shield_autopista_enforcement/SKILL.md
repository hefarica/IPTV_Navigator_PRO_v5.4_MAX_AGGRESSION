---
name: "NET SHIELD AUTOPISTA Enforcement"
description: "Skill inmutable que OBLIGA a verificar el estado del VPS proxy IPTV antes y después de cualquier cambio. Garantiza que la reproducción NUNCA se degrade."
---

# NET SHIELD AUTOPISTA — Enforcement Skill

## Cuándo se activa

Esta skill se activa **OBLIGATORIAMENTE** cuando:

1. Se va a modificar cualquier archivo en `/etc/nginx/` del VPS
2. Se va a modificar cualquier archivo Lua del VPS (`upstream_gate.lua`, `upstream_response.lua`)
3. Se va a tocar `sysctl`, `iptables`, o configuración de WireGuard
4. Se va a deployar cualquier cambio al VPS via SCP, rsync, o SSH
5. Se menciona "proxy", "shield", "nginx", "VPS", "upstream", "circuit breaker", "rate limit"
6. Se discute performance, freeze, buffering, 503, 429, o timeout del IPTV

## Invariantes NO NEGOCIABLES

### Grupo A: Reglas de Bloqueo Cero

```
A1: upstream_gate.lua DEBE ser PASSTHROUGH — NUNCA return ngx.exit(503)
A2: upstream_response.lua DEBE ser solo logging — NUNCA set KEY_STATE "OPEN"
A3: limit_conn xtream_slot >= 2 — NUNCA 1
A4: hard_cap rate >= 100r/s — NUNCA menor
A5: proxy_next_upstream DEBE incluir error timeout http_502 http_503 http_504
```

### Grupo B: Reglas de Throughput

```
B1: proxy_buffer_size >= 128k
B2: proxy_buffers >= 16 × 128k (2MB total)
B3: proxy_busy_buffers_size >= 256k
B4: proxy_connect_timeout >= 3s
B5: proxy_read_timeout >= 60s (NUNCA < 30s)
B6: proxy_send_timeout >= 60s (NUNCA < 30s)
```

### Grupo C: Reglas de Cache

```
C1: proxy_cache_valid 302 301 = 0 (NUNCA > 0)
C2: proxy_cache_valid 403 401 = 0
C3: proxy_cache_use_stale en CDN intercepts DEBE incluir http_403
C4: proxy_cache_background_update = on
C5: proxy_cache_path en /dev/shm (RAM, no disco)
```

### Grupo D: Reglas de Kernel

```
D1: tcp_congestion_control = bbr
D2: rmem_max / wmem_max >= 128MB
D3: tcp_fastopen = 3
D4: tcp_slow_start_after_idle = 0
D5: somaxconn >= 65535
```

### Grupo E: Reglas de WireGuard

```
E1: wg-health-monitor.sh activo via systemd timer cada 30s
E2: Auto-restart con cooldown >= 2min
E3: wg0 + wg-surfshark + wg-surfshark-br monitoreados
E4: DSCP 0x2e (EF) en tráfico SurfShark
```

## Flujo de Enforcement

### ANTES de cualquier cambio al VPS:

```bash
# 1. Pre-flight: verificar estado actual
ssh root@VPS "cat /opt/netshield/state/wg_health_state.json"
ssh root@VPS "tail -3 /var/log/nginx/shield_access.log"
ssh root@VPS "nginx -t"

# 2. Backup antes de tocar
ssh root@VPS "tar czf /root/backups/pre_change_$(date +%Y%m%d_%H%M%S).tar.gz /etc/nginx/ /etc/sysctl.d/"

# 3. Verificar que el cambio NO viola ningún invariante (A1-E4)
```

### DESPUÉS de cualquier cambio al VPS:

```bash
# 1. Syntax check
ssh root@VPS "nginx -t"

# 2. Reload (NO restart — reload mantiene conexiones existentes)
ssh root@VPS "systemctl reload nginx"

# 3. Verificar zero 503 propios (ut=- es generado por nginx, no upstream)
ssh root@VPS "sleep 10 && grep ' 503 ' /var/log/nginx/shield_access.log | grep 'ut=-' | tail -5"

# 4. Verificar WireGuard healthy
ssh root@VPS "cat /opt/netshield/state/wg_health_state.json"

# 5. Verificar Lua en PASSTHROUGH
ssh root@VPS "grep 'ngx.exit' /etc/nginx/lua/*.lua"
# DEBE retornar VACÍO — si retorna algo, el cambio es INVÁLIDO
```

## Qué hacer si un cambio viola un invariante

1. **REVERTIR INMEDIATAMENTE** usando el backup pre-change
2. **Documentar** el intento y la razón del rechazo
3. **NO insistir** — la reproducción sin freeze es prioridad absoluta
4. **Consultar al usuario** antes de proponer alternativas

## Referencia

- SOP completo: `.agent/workflows/net-shield-autopista-sop.md`
- Regla de usuario: `.gemini/settings/propositovps.md`
- Backup certificado: `/root/backups/autopista_20260426.tar.gz`

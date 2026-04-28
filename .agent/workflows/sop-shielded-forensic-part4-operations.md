# SOP FORENSE SHIELDED — PARTE 4: OPERACIONES, DIAGNÓSTICO Y CONTEO

> **Partes:** [1/4] Doctrina — [2/4] NGINX+Lua — [3/4] PRISMA+Kernel — **[4/4] Operaciones**
> **Snapshot:** `vps/vps-live-snapshot-20260428/`

---

## 15. DIAGNÓSTICO DE FREEZES

> [!CAUTION]
> Los freezes NUNCA se resuelven cambiando URLs internas. SIEMPRE diagnosticar la red.

### 15.1 Comandos de diagnóstico (en orden de prioridad)

```bash
# 1. ¿WireGuard activo y con tráfico?
ssh root@178.156.147.234 "wg show | head -15"
# Buscar: latest handshake < 3min, transfer > 0

# 2. ¿DNS hijack funcionando?
ssh root@178.156.147.234 "dig @127.0.0.1 nfqdeuxu.x1megaott.online +short"
# Esperado: 178.156.147.234

# 3. ¿NGINX procesando requests?
ssh root@178.156.147.234 "tail -5 /var/log/nginx/shield_access.log"

# 4. ¿Errores 503 PROPIOS? (ut=- significa generado por NGINX, no upstream)
ssh root@178.156.147.234 "grep ' 503 ' /var/log/nginx/shield_access.log | grep 'ut=-' | tail -5"

# 5. ¿CDN dando 403 masivo?
ssh root@178.156.147.234 "grep ' 403 ' /var/log/nginx/iptv_intercept.log | tail -5"

# 6. ¿Stale salvando al player?
ssh root@178.156.147.234 "grep 'STALE' /var/log/nginx/iptv_intercept.log | tail -5"

# 7. ¿Lua en PASSTHROUGH? (DEBE retornar 0 — si retorna >0, hay bloqueo activo)
ssh root@178.156.147.234 "grep -c 'ngx.exit' /etc/nginx/lua/*.lua"

# 8. ¿Bandwidth Reactor activo?
curl -s "https://iptv-ape.duckdns.org/prisma/api/bandwidth-reactor" | python3 -m json.tool

# 9. ¿PRISMA telemetría completa?
curl -s "https://iptv-ape.duckdns.org/prisma/api/telemetry-full" | python3 -m json.tool | grep -E "buffer_health|ewma|state"

# 10. ¿NGINX syntax OK?
ssh root@178.156.147.234 "nginx -t"
```

### 15.2 Árbol de decisión

```
¿WireGuard activo?
├─ NO → wg-quick up wg0 → verificar de nuevo
│
├─ SÍ → ¿DNS resuelve a VPS?
│        ├─ NO → systemctl restart unbound → verificar
│        │
│        ├─ SÍ → ¿Hay 503 con ut=-?
│        │        ├─ SÍ → Lua bloqueando (VIOLACIÓN SOP) → rollback
│        │        │
│        │        ├─ NO → ¿Hay 403 masivo en CDN?
│        │        │        ├─ SÍ → ¿http_403 en proxy_cache_use_stale?
│        │        │        │        ├─ NO → AGREGAR http_403 → reload
│        │        │        │        ├─ SÍ → CDN caído, esperar
│        │        │        │
│        │        │        ├─ NO → ¿Reactor en VBR_NUCLEAR?
│        │        │                 ├─ SÍ → Red degradada, PRISMA compensando
│        │        │                 ├─ NO → Verificar SurfShark tunnel
```

---

## 16. ROLLBACK DE EMERGENCIA

```bash
# Rollback desde backup certificado
ssh root@178.156.147.234 "cd /root/backups && tar xzf autopista_20260426.tar.gz -C / && nginx -t && systemctl reload nginx"

# Rollback desde backup pre-cambio más reciente
ssh root@178.156.147.234 "cd /root/backups && ls -t pre_change_*.tar.gz | head -1 | xargs tar xzf -C / && nginx -t && systemctl reload nginx"
```

---

## 17. PRE-FLIGHT Y POST-FLIGHT (antes/después de TODO cambio)

### 17.1 PRE-FLIGHT

```bash
# 1. Estado actual
ssh root@178.156.147.234 "echo '=== NGINX ===' && nginx -t 2>&1 | tail -2 && echo '=== WG ===' && cat /opt/netshield/state/wg_health_state.json 2>/dev/null && echo '=== LAST 503 ===' && grep ' 503 ' /var/log/nginx/shield_access.log 2>/dev/null | grep 'ut=-' | wc -l && echo '=== LUA BLOCKS ===' && grep -c 'ngx.exit' /etc/nginx/lua/*.lua"

# 2. Backup
ssh root@178.156.147.234 "tar czf /root/backups/pre_change_$(date +%Y%m%d_%H%M%S).tar.gz /etc/nginx/conf.d/ /etc/nginx/snippets/ /etc/nginx/lua/ 2>/dev/null && echo BACKUP_OK"

# 3. Verificar invariantes (ver §18)
```

### 17.2 POST-FLIGHT

```bash
# 1. Syntax + reload
ssh root@178.156.147.234 "nginx -t && systemctl reload nginx"

# 2. Esperar 10s y verificar 503 nuevos
ssh root@178.156.147.234 "sleep 10 && grep ' 503 ' /var/log/nginx/shield_access.log | grep 'ut=-' | awk -v cutoff=$(date -u -d '-1 minute' +%Y-%m-%dT%H:%M) '{if (\$4 > cutoff) print}' | wc -l"

# 3. PASSTHROUGH check
ssh root@178.156.147.234 "grep 'X-APE-Circuit.*PASSTHROUGH' /etc/nginx/lua/upstream_gate.lua | wc -l"
# Esperado: 1

# 4. WG health
ssh root@178.156.147.234 "cat /opt/netshield/state/wg_health_state.json"
```

---

## 18. TABLA DE INVARIANTES COMPLETA

### Grupo A: Bloqueo Cero (NUNCA bloquear al player)

| ID | Invariante | Valor exacto | Archivo |
|---|---|---|---|
| A1 | `upstream_gate.lua` | PASSTHROUGH, sin `ngx.exit(503)` | `nginx-lua/upstream_gate.lua` |
| A2 | `upstream_response.lua` | Solo logging, sin `set KEY_STATE "OPEN"` | `nginx-lua/upstream_response.lua` |
| A3 | `limit_conn xtream_slot` | ≥ 2 | `nginx-snippets/shield-location.conf` |
| A4 | `hard_cap rate` | ≥ 100r/s | `nginx-conf.d/iptv-shield-rate.conf` |
| A5 | `proxy_next_upstream` | incluye `error timeout http_502 http_503 http_504` | `shield-location.conf` |

### Grupo B: Throughput (NUNCA bajar de estos valores)

| ID | Invariante | Valor mínimo | Archivo |
|---|---|---|---|
| B1 | `proxy_buffer_size` | ≥ 128k | `shield-location.conf` |
| B2 | `proxy_buffers` | ≥ 16 × 128k (2MB) | `shield-location.conf` |
| B3 | `proxy_busy_buffers_size` | ≥ 256k | `shield-location.conf` |
| B4 | `proxy_connect_timeout` | ≥ 3s | `shield-location.conf` |
| B5 | `proxy_read_timeout` | ≥ 60s (NUNCA < 30s) | `shield-location.conf` |
| B6 | `proxy_send_timeout` | ≥ 60s (NUNCA < 30s) | `shield-location.conf` |

### Grupo C: Cache (valores exactos)

| ID | Invariante | Valor exacto | Archivo |
|---|---|---|---|
| C1 | `proxy_cache_valid 302 301` | = 0 | `shield-location.conf` |
| C2 | `proxy_cache_valid 403 401` | = 0 | `shield-location.conf` |
| C3 | CDN stale | incluye `http_403` | `zivovrix-intercept.conf`, `rynivorn-intercept.conf` |
| C4 | `proxy_cache_background_update` | = on | `00-iptv-quantum.conf` |
| C5 | `proxy_cache_path` | en `/dev/shm` (RAM) | `nginx.conf` |

### Grupo D: Kernel

| ID | Invariante | Valor exacto | Archivo |
|---|---|---|---|
| D1 | `tcp_congestion_control` | = bbr | `sysctl/99-iptv-shield.conf` |
| D2 | `rmem_max/wmem_max` | ≥ 64MB | `sysctl/99-iptv-shield.conf` |
| D3 | `tcp_fastopen` | = 3 | `sysctl/99-iptv-shield.conf` |
| D4 | `tcp_slow_start_after_idle` | = 0 | `sysctl/99-iptv-shield.conf` |
| D5 | `somaxconn` | ≥ 65535 | `sysctl/99-iptv-shield.conf` |

### Grupo E: WireGuard

| ID | Invariante | Valor |
|---|---|---|
| E1 | `wg-health-monitor` timer | activo cada 30s |
| E2 | Auto-restart cooldown | ≥ 2min |
| E3 | Interfaces monitoreadas | wg0 + wg-surfshark + wg-surfshark-br |
| E4 | DSCP | 0x2e (EF) en wg0 |

---

## 19. CONTEO FINAL FORENSE

| Capa | Archivos activos | KB total |
|---|---|---|
| WireGuard | 4 configs | ~20 KB |
| Unbound DNS | 2 configs | ~3.3 KB |
| NGINX nginx.conf | 1 | 5.7 KB |
| NGINX conf.d | 11 activos | 60 KB |
| NGINX snippets | 3 activos core | 21.3 KB |
| NGINX Lua | 13 scripts | 130 KB |
| PHP Shield Auth | 2 | 18.5 KB |
| PHP Upload | 10 | ~50 KB |
| PHP Resolvers | 6 | ~600 KB |
| PRISMA Config | 6 JSONs | 17.4 KB |
| PRISMA ADB | 7 scripts | ~15 KB |
| PRISMA Bridge | 2 | ~10 KB |
| PRISMA Deploy | 2 | ~5 KB |
| PRISMA Frontend | 1 widget | ~8 KB |
| Systemd | 7 services + 7 timers | ~14 KB |
| Scripts | 4 shell + 1 python | 32 KB |
| Sentinel | 8 scripts | ~40 KB |
| Sysctl | 1 | 7.3 KB |
| **TOTAL** | **~107 archivos** | **~1.06 MB código** |

---

## 20. SNAPSHOT LOCAL DESCARGADO

Todos los archivos críticos del VPS están copiados localmente en:

```
vps/vps-live-snapshot-20260428/
├── nginx.conf                          (5.7 KB)
├── nginx-conf.d/
│   ├── 00-iptv-quantum.conf           (4.3 KB)
│   ├── iptv-intercept.conf            (20.5 KB)
│   ├── iptv-shield-rate.conf          (4.5 KB)
│   ├── iptv-limit-conn.conf           (1.4 KB)
│   ├── iptv-lua-circuit.conf          (1.4 KB)
│   ├── iptv-proxy.conf                (1.0 KB)
│   ├── zivovrix-intercept.conf        (8.9 KB)
│   ├── rynivorn-intercept.conf        (8.8 KB)
│   ├── prisma-floor-lock.conf         (7.2 KB)
│   ├── prisma-public-api-zone.conf    (1.8 KB)
│   └── prisma-reactor-api.conf        (0.2 KB)
├── nginx-snippets/
│   ├── shield-location.conf           (11.3 KB) ← EL CORAZÓN
│   ├── prisma-public-api-locations.conf (7.2 KB)
│   └── iptv-proxy-location.conf       (2.8 KB)
├── nginx-lua/
│   ├── bandwidth_reactor.lua          (22.1 KB) ← EWMA + TELESCOPE L1
│   ├── floor_lock_filter.lua          (18.0 KB) ← PRISMA variant filter
│   ├── lab_config.lua                 (15.5 KB) ← 6 JSON reader + cache
│   ├── prisma_telemetry_full.lua      (15.0 KB) ← Telemetría unificada
│   ├── sentinel_auth_guard.lua        (13.0 KB) ← UA rotation
│   ├── decision_engine.lua            (10.8 KB) ← TELESCOPE predictivo
│   ├── sentinel_telemetry_api.lua     (10.7 KB) ← API sentinel
│   ├── upstream_response.lua          (6.3 KB)  ← PASSTHROUGH telemetry
│   ├── sentinel_ua_apply.lua          (5.4 KB)  ← UA applicator
│   ├── upstream_gate.lua              (4.0 KB)  ← PASSTHROUGH gate
│   ├── shield_follow_302.lua          (3.5 KB)  ← 302 follower
│   ├── bandwidth_reactor_api.lua      (3.3 KB)  ← Reactor API
│   └── follow_redirect.lua            (2.4 KB)  ← Redirect interceptor
├── sysctl/
│   └── 99-iptv-shield.conf           (7.3 KB)
├── unbound/
│   └── iptv-ape.conf                  (3.3 KB)
├── wireguard/
│   └── wg0.conf.sanitized            (4.9 KB)
├── php-api/
│   ├── shield-auth.php                (7.3 KB)
│   └── health.php                     (11.1 KB)
└── scripts/
    ├── wg-health-monitor.sh           (14.5 KB)
    └── netshield_autopilot_v2.py      (17.4 KB)
```

**Total snapshot: 38 archivos, 256 KB de código fuente real del VPS en producción.**

---

## 21. CROSS-REFERENCES

| Documento | Path | Propósito |
|---|---|---|
| SOP Forensic Part 1 | `.agent/workflows/sop-shielded-forensic-part1-doctrine.md` | Doctrina + pipeline + prohibiciones |
| SOP Forensic Part 2 | `.agent/workflows/sop-shielded-forensic-part2-nginx-lua.md` | NGINX config + Lua con código |
| SOP Forensic Part 3 | `.agent/workflows/sop-shielded-forensic-part3-prisma-kernel.md` | PRISMA + PHP + Kernel + Systemd |
| SOP Forensic Part 4 | **Este archivo** | Operaciones + diagnóstico + conteo |
| SKILL immutable | `.agent/skills/shielded_architecture_immutable/SKILL.md` | Doctrina cross-agent |
| Workflow bloqueante | `.agent/skills/shielded_architecture_immutable/WORKFLOW_BLOQUEANTE.md` | Gate bash ejecutable |
| SOP cardinal | `.gemini/settings/shielded-sop.md` | SOP para Gemini CLI |
| VPS Snapshot | `vps/vps-live-snapshot-20260428/` | **Código fuente real** |

---

## 22. LOGS DEL SISTEMA

| Log | Path | Propósito |
|---|---|---|
| Shield access | `/var/log/nginx/shield_access.log` | Requests al shield (formato iptv_intercept) |
| Shield errors | `/var/log/nginx/shield_error.log` | Errores (warn level) |
| CDN intercept | `/var/log/nginx/iptv_intercept.log` | Requests a CDN intercepts |
| Global errors | `/var/log/nginx/error.log` | Errores globales NGINX |
| Shield auth | `/var/log/nginx/shield-auth.log` | Autenticación tokens |

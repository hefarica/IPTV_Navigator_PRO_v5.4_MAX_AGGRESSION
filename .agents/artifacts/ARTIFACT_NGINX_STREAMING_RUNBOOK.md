# ARTIFACT — NGINX STREAMING RUNBOOK

**Generated:** 2026-05-17
**Authority:** `nginx-openresty-streaming-proxy` skill (S6) + autopista doctrine
**Production target:** Hetzner VPS 178.156.147.234 · CPX21 (3 vCPU / 4 GB / 40 GB SSD Ashburn VA)

---

## 1. Files of record (canonical)

| File | Role | Touch policy |
|---|---|---|
| `IPTV_v5.4_MAX_AGGRESSION/net-shield/nginx/nginx.conf` | Production-mirror canónico | safe to edit + smoke test local |
| `IPTV_v5.4_MAX_AGGRESSION/net-shield/nginx/lua/upstream_gate.lua` | PASSTHROUGH (telemetry-only) | safe to edit |
| `IPTV_v5.4_MAX_AGGRESSION/net-shield/nginx/lua/upstream_response.lua` | Reactor de respuesta | safe to edit |
| `/etc/nginx/nginx.conf` (VPS LIVE) | Production active | `iptv-vps-touch-nothing` checklist required |
| `/opt/netshield/lua/*.lua` (VPS LIVE) | Production Lua | idem |

---

## 2. Autopista doctrine — invariants (per `feedback_autopista_doctrine`)

| Invariant | Value | Why |
|---|---|---|
| Circuit breaker | **REMOVIDO** | Causaba freezes cascade single-user (incident 2026-04-25) |
| Cache warmers | **DISABLED** | NetShield-Warmer/1.0 saturaba upstream |
| `xtream_slot` limit_conn | **>= 2** | provider Xtream max_connections=1 → single bleed |
| Rate limiting | **hard_cap=100 r/s burst=50 nodelay** | single-user, no rate-limit agresivo |
| Lua scripts | **passthrough / telemetry-only** | no reactive logic on upstream status |
| `proxy_read_timeout` | **>= 60s** | streaming en vivo |
| `tcp_congestion_control` | **bbr** | BDP optimization per `reference_tcp_initcwnd_400_doctrine_20260511` |
| `proxy_cache_valid 302 301` | **0** | NEVER cache 302 (session bleed cross-channel) |
| `proxy_pass_request_headers` | **off** | per `feedback_shield_proxy_pass_request_headers_off` (anti-fingerprint) |
| `proxy_request_buffering` | **off** | streaming en vivo + LL-HLS support |
| `gzip` for video | **off** | never gzip TS/M4S/M3U8 segments |
| `keepalive` to Xtream upstreams | **1** | min, prevent session reuse bleed |
| `initcwnd` | **400** | per `reference_tcp_initcwnd_400_doctrine_20260511` |
| `initrwnd` | **400** | idem |
| `rto_min` | **40ms lock** | idem |

---

## 3. Reload vs Restart matrix (per `feedback_nginx_cache_path_requires_full_restart`)

| Change type | Action |
|---|---|
| `proxy_cache_path` (any change) | **FULL RESTART** (`systemctl restart nginx`) |
| `worker_processes`, `worker_connections`, `worker_rlimit_nofile` | **FULL RESTART** |
| `listen`, `ssl_certificate*`, port binding | **FULL RESTART** |
| New Lua module require | **FULL RESTART** |
| `location` block changes, headers, proxy_pass URL | **RELOAD** (`nginx -s reload`) |
| `if` conditions, rewrites, return codes | **RELOAD** |
| Comment changes only | **RELOAD** safe |

⚠ Reload after cache_path change appears to succeed but leaves zombi RAM cache → freeze masivo. Always restart for cache_path.

---

## 4. Pre-deploy checklist (iptv-vps-touch-nothing)

```bash
# 1. Snapshot current production (ON VPS)
ssh root@178.156.147.234 "nginx -T > /tmp/pre-$(date +%s).conf"

# 2. Local syntax test
nginx -t -c <local-modified-conf>

# 3. Lua syntax test
luac -p <local-modified-lua>
# OpenResty available?
# resty -c <lua>

# 4. Diff vs production
ssh root@178.156.147.234 "cat /etc/nginx/nginx.conf" > /tmp/prod.conf
diff /tmp/prod.conf <local-modified-conf>

# 5. Plan rollback exact command
echo "rollback: ssh root@... 'cp /tmp/pre-$TS.conf /etc/nginx/nginx.conf && nginx -s reload'"

# 6. Deploy (only after user OK)
scp <local-modified-conf> root@178.156.147.234:/etc/nginx/nginx.conf

# 7. Test on VPS BEFORE reload/restart
ssh root@178.156.147.234 "nginx -t"

# 8. Reload OR Restart (per change type — see matrix §3)
ssh root@178.156.147.234 "systemctl reload nginx"  # or restart

# 9. Smoke test REAL CHANNEL (not just curl manifest)
# Open canal en OTT Navigator / TiviMate · verify play start < 2s

# 10. Post-deploy verification
ssh root@178.156.147.234 "tail -50 /var/log/nginx/error.log"
ssh root@178.156.147.234 "ss -tunap | grep :443 | wc -l"  # connection count
```

---

## 5. Rollback procedure (exact commands)

```bash
ssh root@178.156.147.234 << 'EOF'
# 1. Restore from pre-change snapshot
cp /tmp/pre-<TS>.conf /etc/nginx/nginx.conf

# 2. Test
nginx -t || { echo "ROLLBACK FAILED — config invalid"; exit 1; }

# 3. Apply
systemctl reload nginx   # or restart per change type

# 4. Verify production restored
nginx -T | head -50
tail -20 /var/log/nginx/error.log
EOF

# 5. Smoke test channel
# Open canal en OTT Navigator · verify pre-incident behavior restored
```

---

## 6. Common configurations (reference snippets)

### Upstream Xtream (autopista mode)
```nginx
upstream xtream_provider_X {
    server provider.host.tld:80;
    keepalive 1;   # min, no bleed
    # NO keepalive_requests / keepalive_timeout (defaults sufficient)
}

server {
    listen 443 ssl http2;

    # Anti-fingerprint
    proxy_pass_request_headers off;

    # Anti-bleed
    proxy_cache_valid 200 1m;
    proxy_cache_valid 302 301 0;  # NEVER cache 302

    # Streaming-friendly timeouts
    proxy_read_timeout 60s;
    proxy_connect_timeout 5s;
    proxy_send_timeout 30s;

    # No buffering destructive
    proxy_buffering off;
    proxy_request_buffering off;

    # Limit shield
    limit_conn xtream_slot 2;
    limit_conn_status 503;

    location ~ /live/(?<user>[^/]+)/(?<pass>[^/]+)/(?<id>.+)\.(m3u8|ts|m4s) {
        proxy_pass http://xtream_provider_X;
        # ... lua telemetry only
        log_by_lua_file /opt/netshield/lua/upstream_response.lua;
    }
}

# Slot key
limit_conn_zone $arg_user zone=xtream_slot:10m;
```

### Lua passthrough (telemetry only)
```lua
-- /opt/netshield/lua/upstream_gate.lua  (log only, no decisions)
local upstream = ngx.var.upstream_addr or "?"
local status = ngx.status or 0
local elapsed = ngx.var.upstream_response_time or 0
local logf = io.open("/dev/shm/iptv-telemetry.log", "a")
if logf then
    logf:write(string.format("%s|%s|%s|%s\n",
        ngx.var.request_uri, upstream, status, elapsed))
    logf:close()
end
-- NO ngx.exit(503), NO blocking
```

---

## 7. KPI verification post-deploy

| KPI | Pre-deploy | Post-deploy | Threshold |
|---|---|---|---|
| Manifest TTFB p95 | <200ms | <200ms | preservar |
| 5xx rate (5min) | <0.5% | <0.5% | preservar |
| 407 rate (5min) | 0 | 0 | NEVER >0 |
| Active connections | baseline | within +/-20% | sanity |

---

## 8. Smoke test channels (mandatory post-deploy)

Open at least 3 canales reales in OTT Navigator or TiviMate:
- 1 premium (4K/HDR si aplica) — e.g. ESPN 4K
- 1 sports en vivo
- 1 IPTV regular

Verificar:
- Start de reproducción < 2s
- 5 minutos sin freeze
- Audio sincronizado
- Bitrate observado >= floor del perfil

❌ Si alguno falla → ROLLBACK inmediato.

---

## 9. Emergency contacts / paths

| Resource | Location |
|---|---|
| VPS SSH | `root@178.156.147.234` |
| Snapshots automáticos | `/opt/netshield/backups/auto/` (daily) |
| Manual snapshot | `/tmp/pre-<TS>.conf` (your responsibility) |
| Healthcheck timer | `/opt/netshield/scripts/healthcheck.sh` (cada 5min) |
| Live logs | `/var/log/nginx/access.log` + `error.log` |
| Lua telemetry | `/dev/shm/iptv-telemetry.log` |

---

**Fin Nginx Streaming Runbook.**

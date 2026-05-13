---
trigger: always_on
---

# VPS AUTOPISTA — Immutable Hardening Verification

> [!CAUTION]
> Este workflow es **OBLIGATORIO** antes de ejecutar CUALQUIER `scp`, `ssh`, `rsync`,
> o modificación directa que toque archivos del VPS (nginx, lua, sysctl, iptables, wireguard).
> La reproducción IPTV sin freeze es **NO NEGOCIABLE**. Saltar este workflow es una regresión.

## Paso 1: Pre-Flight (ANTES del cambio)

```bash
# // turbo
# Verificar estado actual — si algo ya está roto, NO hacer más cambios
ssh root@178.156.147.234 "echo '=== NGINX ===' && nginx -t 2>&1 | tail -2 && echo '=== WG ===' && cat /opt/netshield/state/wg_health_state.json 2>/dev/null && echo '=== LAST 503 ===' && grep ' 503 ' /var/log/nginx/shield_access.log 2>/dev/null | grep 'ut=-' | wc -l && echo '=== LUA BLOCKS ===' && grep -c 'ngx.exit' /etc/nginx/lua/*.lua"
```

**GATE:** Si `ngx.exit` count > 0, **DETENER** — el Lua tiene bloqueos activos que violan el SOP.

## Paso 2: Backup (ANTES del cambio)

```bash
# // turbo
ssh root@178.156.147.234 "tar czf /root/backups/pre_change_$(date +%Y%m%d_%H%M%S).tar.gz /etc/nginx/conf.d/ /etc/nginx/snippets/ /etc/nginx/lua/ 2>/dev/null && echo BACKUP_OK"
```

## Paso 3: Verificación de Invariantes (ANTES de hacer `scp`)

Revisar mentalmente cada cambio contra esta tabla:

| ID | Invariante | Valor mínimo/exacto |
|---|---|---|
| A1 | `upstream_gate.lua` | PASSTHROUGH, sin `ngx.exit(503)` |
| A2 | `upstream_response.lua` | Solo logging, sin `set KEY_STATE "OPEN"` |
| A3 | `limit_conn xtream_slot` | >= 2 |
| A4 | `hard_cap rate` | >= 100r/s |
| A5 | `proxy_next_upstream` | incluye `error timeout http_502 http_503 http_504` |
| B1 | `proxy_buffer_size` | >= 128k |
| B2 | `proxy_buffers` | >= 16 × 128k |
| B3 | `proxy_busy_buffers_size` | >= 256k |
| B4 | `proxy_connect_timeout` | >= 3s |
| B5 | `proxy_read_timeout` | >= 60s (NUNCA < 30s) |
| B6 | `proxy_send_timeout` | >= 60s (NUNCA < 30s) |
| C1 | `proxy_cache_valid 302 301` | = 0 exacto |
| C2 | `proxy_cache_valid 403 401` | = 0 exacto |
| C3 | CDN stale | incluye `http_403` |
| C4 | `proxy_cache_background_update` | = on |
| C5 | `proxy_cache_path` | en `/dev/shm` |
| D1 | `tcp_congestion_control` | = bbr |
| D2 | `rmem_max/wmem_max` | >= 128MB |
| E1 | `wg-health-monitor` timer | activo cada 30s |

Si CUALQUIER invariante se viola → **ABORTAR el cambio**.

## Paso 4: Deploy

Ejecutar el `scp` y `nginx -t && systemctl reload nginx`.

## Paso 5: Post-Flight (DESPUÉS del cambio)

```bash
# // turbo
ssh root@178.156.147.234 "nginx -t 2>&1 | tail -2 && sleep 10 && echo '=== NEW 503 ===' && grep ' 503 ' /var/log/nginx/shield_access.log | grep 'ut=-' | awk -v cutoff=$(date -u -d '-1 minute' +%Y-%m-%dT%H:%M) '{if ($4 > cutoff) print}' | wc -l && echo '=== LUA PASSTHROUGH ===' && grep 'X-APE-Circuit.*PASSTHROUGH' /etc/nginx/lua/upstream_gate.lua | wc -l && echo '=== WG STATE ===' && cat /opt/netshield/state/wg_health_state.json"
```

**GATE:** Si `NEW 503` > 0 y son `ut=-` → **ROLLBACK INMEDIATO**:

```bash
ssh root@178.156.147.234 "cd /root/backups && ls -t pre_change_*.tar.gz | head -1 | xargs tar xzf -C / && nginx -t && systemctl reload nginx"
```

## Paso 6: Commit & Document

Solo después de verificar Post-Flight exitoso:

```bash
git add -f <archivos-cambiados>
git commit -m "<descripción del cambio>"
git push
```

# Snapshot: 2026-04-26 funcional post-rollback

**Capturado**: 2026-04-26 00:27 UTC
**Estado**: TiVistation entrando, sistema operacional
**Razón**: snapshot defensivo antes de cualquier hardening futuro

## Contexto histórico (sesión 2026-04-25 → 2026-04-26)

Esta sesión tuvo varios incidentes y rollbacks:

| Hora UTC | Acción | Resultado |
|---|---|---|
| 16:07 | SRE Redesign: hard_cap 10r/s + Lua circuit + autopilot observe | ✓ deploy |
| 20:05 | Cambio "defensivo" `set $shield_host $2` → map | ✗ rompió producción |
| 22:27 | ROLLBACK del cambio map | ✓ restaurado |
| 22:58 | rate=10→30 burst=50→200 (anti-rate-limit) | ✓ aplicado |
| 23:11 | Intercept rynivorn.cc + zivovrix.cc (DNS hijack) | ✓ intermitente |
| 23:50 | OMNIPROXY universal handler + proxy_redirect | ✗ rompió producción |
| 00:07 | ROLLBACK total OMNIPROXY | ✓ restaurado |
| 00:14 | TiVistation sigue dando 502 (provider rate-limit cliente loop) | - |
| 00:25 | Cliente reinició reproductor, slot xtream se liberó | ✓ ENTRA |

## Estado actual capturado en este snapshot

```
✓ nginx active (con: rynivorn-intercept + zivovrix-intercept activos)
✓ unbound active (con local-zone hijacks: rynivorn.cc + zivovrix.cc + 4 hosts originales)
✓ WG wg0 + wg-surfshark active
✓ Autopilot v2 (MODE=observe, cada 5min)
✓ rate=30r/s burst=200 (calibración relajada)
✓ Lua circuit breaker activo (con bug conocido: 5xx no entra cooldown → loop)
```

## Archivos en este snapshot

```
etc/nginx/nginx.conf
etc/nginx/sites-enabled/default
etc/nginx/conf.d/
  ├ iptv-intercept.conf (servers: nfqdeuxu, line.tivi-ott, ky-tv, tivigo)
  ├ iptv-shield-rate.conf (limit_req_zone hard_cap 30r/s)
  ├ iptv-lua-circuit.conf (lua_shared_dict 20m)
  ├ rynivorn-intercept.conf (CDN target redirect)
  ├ zivovrix-intercept.conf (CDN target redirect)
  ├ cmaf_mime.conf
  └ 00-iptv-quantum.conf
etc/nginx/snippets/
  ├ shield-location.conf (auth + shield + Lua hooks)
  └ iptv-proxy-location.conf
etc/nginx/lua/
  ├ upstream_gate.lua (PRE: cooldown gate)
  └ upstream_response.lua (POST: state machine)
etc/unbound/unbound.conf.d/iptv-ape.conf
etc/systemd/system/netshield-autopilot.{service,timer}
opt/netshield/autopilot/netshield_autopilot_v2.py
var/www/html/api/shield-auth.php
```

## Procedimiento de rollback (re-deploy snapshot al VPS)

```bash
# Desde local repo:
cd "c:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/IPTV_v5.4_MAX_AGGRESSION/net-shield/snapshots/2026-04-26_funcional_post_rollback"

# Subir tar al VPS
scp vps_snapshot_20260426_002710.tar.gz root@178.156.147.234:/tmp/

# En el VPS:
ssh root@178.156.147.234 'cd / && tar xzf /tmp/vps_snapshot_20260426_002710.tar.gz \
  && nginx -t && systemctl reload nginx \
  && unbound-checkconf && systemctl reload unbound'
```

## Hardening agregado en el VPS

**1. Backup automatizado diario (systemd timer)**
- `/opt/netshield/scripts/backup_configs.sh` — script
- `netshield-backup.{service,timer}` — daily 03:00 UTC
- `/root/backups/daily/YYYYMMDD.tar.gz` — output
- Rotación: keep last 30 days
- Log: `/var/log/netshield-backup.log`

**2. Healthcheck cron (cada 5min)**
- `/opt/netshield/scripts/healthcheck.sh` — script
- `netshield-health.{service,timer}` — every 5min
- Verifica: nginx, unbound, WG handshake <5min, /dev/shm <90%, 502 cascade <500/5min
- Log: `/var/log/netshield-health.log` (heartbeat horario, alertas inmediatas)

**3. Snapshot manual disponible** (este directorio)

## Comandos útiles para verificar estado

```bash
# Status general
ssh root@178.156.147.234 'systemctl is-active nginx unbound netshield-autopilot.timer netshield-backup.timer netshield-health.timer'

# Health log (última hora)
ssh root@178.156.147.234 'tail -20 /var/log/netshield-health.log'

# Backup log
ssh root@178.156.147.234 'tail -5 /var/log/netshield-backup.log'

# Status dist últimos 5min (shield)
ssh root@178.156.147.234 'awk "{print \$2,\$7}" /var/log/nginx/shield_access.log | tail -500 | sort | uniq -c | sort -rn | head'

# Lua circuit events últimos
ssh root@178.156.147.234 'grep APE-CIRCUIT /var/log/nginx/shield_error.log | tail -10'
```

## Bugs conocidos (no corregidos en este snapshot)

### Bug 1: Lua circuit no entra en cooldown para 5xx → loop infinito
**Síntoma**: cuando provider devuelve 502 sostenido, el cliente reintenta cada ~1s indefinidamente. Visto retry=62 en logs.
**Ubicación**: `etc/nginx/lua/upstream_response.lua` líneas 70-85 — política para 5xx es "retry corto, sin cooldown".
**Fix propuesto** (no aplicado): después de 5-10 retries 5xx consecutivos sobre el mismo host, entrar cooldown 30-60s.

### Bug 2: User-Agent literal `{config.user_agent}` no resuelve
**Síntoma**: el cliente envía `{config.user_agent}` como User-Agent literal en lugar del UA real.
**Ubicación**: lista M3U8 generada (frontend / Excel hoja `32_PLACEHOLDERS_MAP`).
**Impacto bajo**: el shield reescribe User-Agent al hacer proxy_pass, así que el upstream NO ve el placeholder. Solo afecta logs.

---
name: "net_shield_autopista_immutable"
description: "Regla INMUTABLE que protege el VPS NET SHIELD AUTOPISTA contra regresiones. Cualquier cambio que viole estas reglas destruye la reproducción IPTV."
priority: CRITICAL
---

# 🛡️ NET SHIELD AUTOPISTA — Regla Inmutable de Producción

> **PRIORIDAD MÁXIMA** — La reproducción sin freeze es NO NEGOCIABLE.
> Esta regla tiene precedencia sobre cualquier otra optimización, mejora, o feature.

## Contexto

El VPS NET SHIELD (Hetzner CPX21, 178.156.147.234) es un proxy transparente para IPTV.
Su ÚNICA función es reenviar video sin fricción. Cualquier "mejora" que introduzca
bloqueo, rate limiting agresivo, circuit breakers, o reduzca buffers/timeouts
es una **REGRESIÓN CRÍTICA** que causa freezes.

## Prohibiciones Absolutas (NUNCA violar)

1. **NUNCA** poner `ngx.exit(503)` en upstream_gate.lua — DEBE ser PASSTHROUGH puro
2. **NUNCA** poner circuit state "OPEN" en upstream_response.lua — DEBE ser logging puro
3. **NUNCA** poner `limit_conn xtream_slot` < 2 — causa 429 por manifest overlap
4. **NUNCA** poner `hard_cap rate` < 100r/s — frena zapping legítimo
5. **NUNCA** poner `proxy_cache_valid 302` > 0 — tokens 302 son dinámicos
6. **NUNCA** quitar `http_403` de `proxy_cache_use_stale` en CDN intercepts
7. **NUNCA** reducir `proxy_read_timeout` bajo 30s — 4K segments tardan
8. **NUNCA** reducir `proxy_buffer_size` bajo 128k
9. **NUNCA** activar keepalive en upstreams Xtream — causa RST

## Valores Mínimos que NO se pueden bajar

| Parámetro | Mínimo | Actual |
|---|---|---|
| `xtream_slot` | 2 | 2 |
| `hard_cap` | 100r/s | 100r/s |
| `proxy_buffer_size` | 128k | 128k |
| `proxy_buffers` | 16×128k | 16×128k |
| `proxy_busy_buffers_size` | 256k | 256k |
| `proxy_connect_timeout` | 3s | 3s |
| `proxy_read_timeout` | 30s | 60s |
| `proxy_send_timeout` | 30s | 60s |
| `rmem_max/wmem_max` | 128MB | 128MB |
| `tcp_congestion_control` | bbr | bbr |

## Workflow Obligatorio

Antes de CUALQUIER deploy al VPS, ejecutar:
- `/vps-autopista-immutable-hardening` workflow (pre-flight + post-flight)

## Backup Certificado

`/root/backups/autopista_20260426.tar.gz` — restaura TODO al estado funcional verificado.

## Rollback de Emergencia

```bash
ssh root@178.156.147.234 "cd /root/backups && tar xzf autopista_20260426.tar.gz -C / && nginx -t && systemctl reload nginx"
```

## Skill Asociada

`net_shield_autopista_enforcement` — verificación automática pre/post deploy.

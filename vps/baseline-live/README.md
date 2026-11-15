# Baseline LIVE — snapshot de la REALIDAD del VPS (178.156.147.234)

> **Estos archivos son el código que CORRE EN VIVO en producción**, descargados del VPS
> (read-only) el 2026-06-22. NO es teoría ni diseño — es la realidad operativa del
> APE Crystal Engine v2.0 que está reproduciendo en el TV ahora mismo.

## Por qué existe este directorio
El baseline se construyó **directamente en el servidor** durante las sesiones (Rust compilado
en el VPS, `.lua` escritos en `/etc/nginx/lua/`, configs editadas en vivo). El repo y el VPS
NO estaban sincronizados. Este snapshot trae la realidad al repo para que master refleje lo
que de verdad corre, no una suposición.

## Estado verificado al momento del snapshot (2026-06-22 ~07:21Z)
- `nginx` active · `ape-crystal-rust` (:8084) active · `/health` responde
- `/shield/` frontera viva (auth_request token gate) · `nginx -t` test successful
- Reproducción real: ~1871 de 200 OK (player reproduciendo)
- Spool FREEZELESS vivo · load 0.70 · 2.3 GB libres

## Archivos (origen → ruta en el VPS)
| Archivo | Ruta viva en el VPS |
|---|---|
| `nginx-lua/combined_body_filter.lua` | `/etc/nginx/lua/combined_body_filter.lua` (Crystal Fortify + SHIELDED rewriter v3) |
| `nginx-lua/ape_sniper_push.lua` | `/etc/nginx/lua/ape_sniper_push.lua` (override anti-403 en read_decision) |
| `nginx-lua/decision_engine.lua` | `/etc/nginx/lua/decision_engine.lua` (TELESCOPE circuit breaker) |
| `nginx-lua/upstream_response.lua` | `/etc/nginx/lua/upstream_response.lua` (headers Crystal) |
| `nginx-lua/ape_crystal_fortify.lua` | `/etc/nginx/lua/ape_crystal_fortify.lua` (FSM fortify P0-P5) |
| `nginx-conf/shield-location.conf` | `/etc/nginx/snippets/shield-location.conf` (5 fases + /shield/) |
| `nginx-conf/iptv-intercept.conf` | `/etc/nginx/conf.d/iptv-intercept.conf` (upstreams + cache + bloques .ts/.m3u8) |

## Advertencia
Este es un SNAPSHOT. Si el VPS cambia, este directorio se desactualiza. Para re-sincronizar,
volver a descargar (read-only) de las rutas de arriba. NO editar estos archivos y subirlos sin
la disciplina `iptv-vps-touch-nothing` (backup + nginx -t + verify).

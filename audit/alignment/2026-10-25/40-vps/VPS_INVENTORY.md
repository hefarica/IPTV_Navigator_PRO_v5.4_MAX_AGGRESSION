# VPS_INVENTORY — Inventario medido del VPS de producción (solo lectura)

**Tarea:** t7 · T6 · Auditoría read-only del VPS
**Ejecutor:** vps-edge (SRE auditor, solo lectura, sin mutación)
**Ventana de medición:** `2026-10-26T03:55Z` → `2026-10-26T04:00Z` (= 2026-10-25 22:55–23:00 America/Bogota)
**Host medido:** `ubuntu-2gb-ash-1` · `root@178.156.147.234` vía `ssh hetzner-iptv` (ed25519)
**Naturaleza de la evidencia:** todos los datos vienen de `cat` / `ls` / `stat` / `find` / `sha256sum` / `nginx -T` / `systemctl is-active|status --no-pager` / `journalctl -n` / `ss -tlnp` / `curl -sI` a endpoints propios. **Cero escrituras.** Ver `VPS_READONLY_ATTESTATION.md`.

---

## 1. Identidad del host

| Campo | Valor medido |
|---|---|
| hostname | `ubuntu-2gb-ash-1` |
| IP pública | `178.156.147.234` |
| SO | Ubuntu 24.04.3 LTS (Noble Numbat) |
| Kernel | `6.8.0-124-generic #124-Ubuntu SMP PREEMPT_DYNAMIC Tue May 26 13:00:45 UTC 2026` |
| Arquitectura | `x86_64` |
| Virtualización | `kvm` · Hardware Vendor: Hetzner · Model: vServer |
| Machine ID | `515e98e027c141ae9b7292ad11df3f93` |
| Boot ID | `433e7e5530c144909d21e48501f2d46a` |
| Uptime | **115 días 2:04** (`/proc/uptime` 9943498.38 s) |
| Load average | 0.37 / 0.15 / 0.06 |
| CPU | 3 vCPU `AMD EPYC-Rome Processor` @ 2.0 GHz |
| RAM | 3819 MB total · 793 MB used · 3025 MB available · 3130 MB buff/cache |
| Swap | 2047 MB (34 MB used) |
| Disco `/` | `/dev/sda1` ext4 · 38 G · 24 G used · 13 G avail · **66 %** |
| `/dev/shm` | tmpfs 1.9 G · 36 K used · **1 %** |

---

## 2. Versiones de los componentes

| Componente | Versión / detalle medido |
|---|---|
| nginx | **`nginx/1.24.0 (Ubuntu)`** — paquete stock, `--prefix=/usr/share/nginx`, `--conf-path=/etc/nginx/nginx.conf` |
| OpenSSL (linkado) | 3.0.13 30 Jan 2024 |
| Módulo Lua | `load_module modules/ngx_http_lua_module.so;` → `/usr/lib/nginx/modules/ngx_http_lua_module.so` · **443 320 B** · mtime `2024-01-19` |
| Lua CLI | `/usr/bin/lua` (intérprete suelto, no es el motor de nginx) |
| PHP-FPM | `php8.3-fpm` **active** (socket `unix:/run/php/php8.3-fpm.sock`) |
| Redis | `redis-server` **active** · `127.0.0.1:6379` |
| Unbound | **active** · `127.0.0.1:53`, `10.200.0.1:53`, `178.156.147.234:53`, control `127.0.0.1:8953` |
| upload-server | **active** · `0.0.0.0:8766` |
| xray | **active** · `*:8443` |
| cupsd | active · `0.0.0.0:631` |
| NVIDIA / OpenResty | **AUSENTES** — `command -v openresty` vacío, `command -v luajit` vacío |

> **CORRECCIÓN A LA DOCTRINA (medida):** el VPS **no corre OpenResty**. Corre **nginx 1.24.0 de Ubuntu** con el módulo dinámico `lua-nginx-module`. Consecuencia operativa real: **no hay `lua-resty-http`**, y el propio `conf.d/50-ape-meta-plane.conf` lo documenta como motivo para NO cablear `shield_follow_302`. Cualquier procedimiento doctrinal que asuma OpenResty (p. ej. `luarocks`, `resty`) no aplica a esta caja.

---

## 3. Procesos nginx

4 procesos `nginx` escuchando en 80 y 443: pids `2001835`, `2001836`, `2001837`, `2001838` (1 master + 3 workers = 1 worker por vCPU). Servicio `nginx.service` **active**.

---

## 4. Puertos en escucha (`ss -tlnp`)

| Puerto | Proceso | ¿Esperado por doctrina? |
|---|---|---|
| 22 | sshd | sí |
| 80 | nginx | sí |
| 443 | nginx | sí |
| **8088** | **nginx** | sí — plano de metadata (nuevo, no documentado en el manifiesto OMEGA) |
| 8082 | `node /var/www/i…` | no documentado |
| 8443 | xray | sí (transporte) |
| 8766 | upload-server | sí |
| 6379 | redis-server | sí |
| 53 (×3) | unbound | sí (DNS hijack) |
| 53 | systemd-resolved (stub `127.0.0.53`, `127.0.0.54`) | sí |
| 8953 | unbound control | sí |
| 631 | cupsd | sí (irrelevante) |
| **8084** | **NADIE — puerto cerrado** | **NO** ← la doctrina exige `ape-crystal-rust` aquí |

**Hallazgo H-01 (CRITICAL):** el motor `ape-crystal-rust` **no existe en esta caja**. `systemctl status ape-crystal-rust` → `Unit ape-crystal-rust.service could not be found`; `is-enabled` → `not-found`; `is-active` → `inactive`; `ss -tlnp | grep 8084` → vacío; `curl http://127.0.0.1:8084/health` → `000`; `/metrics` → `000`. Lo único que sobrevive del linaje es un backup de config: `/var/backups/ape-crystal-patches/ape-crystal-upscaler-location.conf.bak_220418`. Detalle en `VPS_DRIFT_VS_REPO.md` §4.

---

## 5. Servicios systemd relevantes

| Servicio | Estado |
|---|---|
| `nginx` | **active** |
| `php8.3-fpm` | **active** |
| `redis-server` | **active** |
| `unbound` | **active** |
| `upload-server` | **active** |
| `coa-navigator` | inactive |
| `ape-api-server` | inactive |
| `ape-headers-server` | inactive |
| **`ape-crystal-rust`** | **unit not-found** |

---

## 6. Roots reales de contenido (`/var/www`)

| Ruta | Tipo | Tamaño | Archivos | Rol medido |
|---|---|---|---|---|
| `/var/www/lists` | dir `www-data:www-data` mode 775 | **1.9 G** | 20 | **Root real de las listas servidas.** Expuesto en `/lists/` |
| `/var/www/html` | dir `www-data:www-data` 755 (+ACL) | **537 M** | 1818 | App PHP: `resolve.php`, `prisma/`, `api/`, `ara/agent.apk` (34 MB), `channels_map` duplicados |
| `/var/www/iptv-ape` | dir root 755 | **43 M** | 1102 | Copia histórica del resolver + `channels_map.json` |
| `/var/www/m3u8` | dir `www-data` 755 | ~164 K listado | 20+ | Generación anterior del uploader PHP (`upload.php`, `upload_chunk.php`, `finalize_upload.php`) |
| `/var/www/ape-uhdx` | dir `www-data` 755 | 24 K | 5 | Telemetría visual: `heartbeat.php`, `last-sentinel.json`, `last-vps-watchdog.json`, `watchdog-state.json`, `visual_profiles.json` |
| `/var/www/ape_api_unified.py` | archivo root | 49 268 B | — | API Python unificada (mtime `2026-01-24`) |

**Puente de publicación:** `/var/www/html/lists` es un **symlink** → `/var/www/lists` (creado `2026-03-21`). Por eso la URL pública es `https://iptv-ape.duckdns.org/lists/<archivo>`.
También existe `/var/www/html/latest.m3u8` → symlink a `APE_TYPED_ARRAYS_ULTIMATE_20260315_102305.m3u8`.

---

## 7. Endpoints propios sondeados (read-only, `curl -sI`)

| Endpoint | Código | Evidencia |
|---|---|---|
| `http://127.0.0.1:8088/_ape/health` | **200** | `{"ok":true,"plane":"meta/v3","ts":1792987153,"qoe":{...},"checks":{"last_latency_ms":789,"nginx":true,"shared_dicts":true,"upstreams_down":0,"requests":1,"error_ratio":0,"last_host":"line.tivi-ott.net"}}` |
| `https://iptv-ape.duckdns.org/ape/health` | **200** | `Content-Type: application/json`, `Cache-Control: no-store` |
| `https://iptv-ape.duckdns.org/api/health.php` | **200** | `{"status":"warning","service":"IPTV-APE VPS","version":"6.3.0","warnings":["unauthorized_wg_peer"]}` |
| `https://iptv-ape.duckdns.org/lists/APE_LISTA_1792869328847.m3u8` (con `Accept-Encoding: gzip`) | **200** | `Content-Encoding: gzip`, `Content-Length: 297134088`, `Vary: Accept-Encoding`, `Content-Type: application/vnd.apple.mpegurl` |
| `https://iptv-ape.duckdns.org/shield/<token>/<host>/…m3u8` | **404** | `HTTP/1.1 404 Not Found` → **la ruta `/shield/` ya no existe en nginx** (H-02) |

**Hallazgo H-02 (HIGH):** la ruta `/shield/{token}/{host}/{path}` que toda la doctrina (`SHIELDED`, `iptv-autopista-doctrine`, `/iptv-check-nginx-streaming`) da por viva **responde 404**. En `nginx -T` la cadena `/shield/` aparece **una sola vez**, y no como `location`: es el `map $request_uri $xtream_account` de `conf.d/iptv-limit-conn.conf`. No hay `proxy_pass` de shield en ninguna parte.

---

## 8. Estado de `/dev/shm` (cache y telemetría en RAM)

| Entrada | Tamaño | mtime | Nota |
|---|---|---|---|
| `/dev/shm/nginx_cache/` | **0 B, 0 archivos** | — | dir `www-data:root` mode `700`. **Cache vacía** |
| `/dev/shm/ape_wake_queue` | 192 B | `2026-10-24T17:59Z` | cola de wake-on-manifest |
| `/dev/shm/cache_health_metrics.json` | 194 B | `2026-10-26T02:55Z` | último latido del cron ahora deshabilitado (ver §9) |
| `/dev/shm/iptv_quality.json` | 277 B | `2026-10-26T03:57Z` | monitor de calidad vivo |
| `/dev/shm/mem_pressure.json` | 175 B | `2026-10-26T03:56Z` | `{"available_mb":3027,"threshold_mb":200,"triggered":false}` |
| `/dev/shm/prisma_health_cache.json` | 4478 B | `2026-10-26T02:52Z` | caché de salud prisma |
| `/dev/shm/mf/` | dir | `2026-10-25T22:25Z` | media-fanout |

---

## 9. Cron y watchdogs (estado medido, **sin tocar nada**)

### `/etc/cron.d/` (mtime del directorio: `2026-10-26 02:59:58.962769481 +0000`)

| Archivo | Bytes | mtime (UTC) | Nota |
|---|---|---|---|
| **`cache-health-monitor`** | **259** | **`2026-10-26 02:59:58.961769470`** | **DESHABILITADO — mutación ajena. Ver §9.1** |
| `ape-ip-autoenroll` | 114 | `2026-06-20 05:34:40` | activo |
| `certbot` | 802 | `2023-04-16 05:18:42` | activo |
| `e2scrub_all` | 201 | `2024-04-08 14:38:40` | activo |
| `mem-pressure-watch` | 157 | `2026-04-25 07:05:20` | activo |
| `php` | 712 | `2024-01-19 01:25:55` | activo |
| `sysstat` | 396 | `2025-08-05 17:14:01` | activo |
| `wg-peer-audit` | 197 | `2026-04-25 07:04:46` | activo |
| `.placeholder` | 102 | `2025-08-05 17:14:01` | — |

### 9.1 Mutación ajena documentada — `/etc/cron.d/cache-health-monitor`

**Estado objetivo (medido, no revertido):**
- **Existe:** sí. `size=259`, `mtime=2026-10-26 02:59:58.961769470 +0000`, `mode=644`, `root:root`.
- **Equivalencia horaria:** `2026-10-26T02:59:58Z` = **`2026-10-25 21:59:58 America/Bogota`** → coincide exactamente con la ventana reportada en el enunciado (21:59 Bogotá).
- **Contenido íntegro (3 líneas):**
  ```
  # Monitorea cache RAM nginx cada 5 min — auto-restart si vacío >15min con tráfico
  # Deployed 2026-04-25 tras incidente freeze SKY SPORTS MAIN EVENTS 4K
  # DESHABILITADO 2026-10-25 bucle-proxy_cache-off: */5 * * * * root /usr/local/bin/cache-health-monitor
  ```
- **Naturaleza de la mutación:** el job quedó **comentado** (prefijo `#`), no borrado. El header original se preservó y se añadió una tercera línea con el motivo declarado (`bucle-proxy_cache-off`).
- **El binario sigue intacto:** `/usr/local/bin/cache-health-monitor` existe, `2561 B`, `-rwxr-xr-x`, mtime `2026-04-25`. Solo se desactivó la programación.
- **No existen** `/etc/cron.d/cache-health-monitor.disabled` ni `.off` (verificado por `stat` → ABSENT).
- **Acción tomada por este auditor: NINGUNA.** No se reactivó, no se editó, no se renombró. Se documenta como observación de estado.

**Correlación causal medida (no inferida):**
1. `/usr/local/bin/cache-health-monitor` reinicia nginx cuando `cache_files < 2` **y** `reqs_5min > 20` durante ≥15 min (`EMPTY_GRACE_MIN=15`).
2. En esta caja **ningún `location` usa `proxy_cache iptv_cache`** — el único location que proxya declara `proxy_cache off;`. Por tanto `/dev/shm/nginx_cache` **nunca se llena**: medido hoy, `0 archivos / 0 bytes`.
3. Luego, con tráfico suficiente, la condición «cache vacía + tráfico» es **permanentemente verdadera** → restart de nginx en bucle. Huella en journal: paradas/arranques de `nginx.service` a las `22:55:04`, `23:15:04`, `23:35:04` UTC (**cadencia exacta de 20 min**). El último restart fue `2026-10-25 23:35:04Z` = `18:35 Bogota`; **después no hubo ninguno** (verificado con `journalctl -u nginx --since "2 hours ago"` → vacío).
4. El último latido escrito por el cron es `/dev/shm/cache_health_metrics.json` con `timestamp: 2026-10-26T02:55:01Z`, `cache_files: 0`, `requests_5min: 10` (por debajo del umbral 20 → `status: OK`, `action_taken: none`). Es **4 min 57 s antes** del `mtime` de desactivación, y **no hay escrituras posteriores** → la desactivación surtió efecto, confirmado por evidencia de filesystem.

**Lectura honesta:** el bucle de reinicios nginx **ya había cesado** (18:35 Bogotá) antes de la desactivación del cron (21:59 Bogotá), porque el tráfico cayó por debajo del umbral de 20 req/5 min. La desactivación es una medida preventiva coherente con la causa raíz (`proxy_cache` desactivado ⇒ cache vacía ⇒ el monitor nunca puede «recuperarse»), pero **no fue la que detuvo los reinicios**. Queda como riesgo latente: si el tráfico vuelve a subir de 20 req/5 min con `proxy_cache off`, el job —si se reactivara— volvería a reiniciar nginx cada ~20 min. **Decisión de reactivar o no: NO es de este auditor.**

### Timers systemd

**Activos (9):** `cache-hygiene.timer` (cada 5 min, `OnUnitActiveSec=300`), `iptv-quality-monitor.timer` (cada 2 s), `ape-meta-watchdog.timer` (60 s), `ape-net-tuning.timer` (oneshot cumplido, NEXT `-`), `wg-health-fast.timer`, `surfshark-failover.timer`, `iptv-tcp-autosync.timer`, `unbound-prewarm.timer`, más los del sistema (`sysstat`, `logrotate`, `certbot`, `fstrim`, …).

**Inactivos (7) — todo el linaje `netshield-*` está apagado:** `netshield-autopilot`, `netshield-backup`, `netshield-health`, `net-shield-metrics`, `netshield-sentinel`, `net-shield-throughput`, `netshield-wg-health`.
> Los archivos `.timer` **siguen presentes** en `/etc/systemd/system/` (15 units), pero `is-active` = inactive. Es un drift doctrinal: la doctrina `/watchdog-status` los supone vigilando.

**Watchdog que sí vigila:** `/usr/local/bin/ape-meta-watchdog.sh` consulta `http://127.0.0.1:8088/_ape/health` cada 60 s; a los 3 fallos consecutivos hace `nginx -t` y, si pasa, `systemctl reload nginx`; si falla, `systemctl restart nginx`. Estado actual: `/var/lib/ape-meta-watchdog.fails` = `0`. Este es el **único** mecanismo con poder de recargar/reiniciar nginx ahora mismo.

**Logs:** `logrotate.d/` tiene `ape-realtime-guardian` (628 B), `ape-visual-engine-v3-2` (199 B), `nginx` (329 B). **No hay** logrotate para el edge (`logrotate-ape-edge.conf` está staged en el repo pero no desplegado — ver drift).

---

## 10. Resumen de desviaciones de inventario

| ID | Severidad | Hallazgo |
|---|---|---|
| **H-01** | CRITICAL | `ape-crystal-rust` (:8084) **no existe**: unit not-found, puerto cerrado, `/health` y `/metrics` = `000`. La doctrina lo declara desplegado y `active (running)`. |
| **H-02** | HIGH | La ruta `/shield/` **no existe** en nginx (404 medido). Sólo queda un `map` huérfano. |
| **H-03** | HIGH | `nginx` es **1.24.0 stock**, no OpenResty. Sin `lua-resty-http`; procedimientos OpenResty no aplican. |
| **H-04** | MEDIUM | 7 timers `netshield-*` presentes pero **inactivos**; `/watchdog-status` doctrinal reportaría vigilancia inexistente. |
| **H-05** | MEDIUM | `conviva.db` = **0 bytes, 0 tablas** → telemetría QoE Conviva inexistente en el VPS. |
| **H-06** | MEDIUM | `proxy_cache_path … iptv_cache` declarada pero **ningún location la usa** (`proxy_cache off`) → `/dev/shm/nginx_cache` vacía, cache muerta. |
| **H-07** | MEDIUM | `/etc/cron.d/cache-health-monitor` desactivado a `2026-10-25 21:59:58 -05` (mutación ajena, documentada, no revertida). |
| **H-08** | LOW | `/var/www` tiene **dos generaciones** del uploader PHP (`/var/www/m3u8` y `/var/www/iptv-ape`) además de `/var/www/html`; riesgo de deriva de código. |

---

## 11. Reproducibilidad

Cualquier auditor puede re-medir con exactamente estos comandos (todos lectura):

```bash
ssh hetzner-iptv 'hostname; hostnamectl | head -12; uptime; cat /proc/uptime'
ssh hetzner-iptv 'free -m; nproc; df -hT / /dev/shm'
ssh hetzner-iptv 'nginx -v; nginx -V 2>&1'
ssh hetzner-iptv 'systemctl is-active nginx php8.3-fpm redis-server unbound upload-server ape-crystal-rust'
ssh hetzner-iptv 'ss -tlnp | head -40'
ssh hetzner-iptv 'ls -la --time-style=full-iso /var/www/; du -sh /var/www/*'
ssh hetzner-iptv 'curl -s -m 6 http://127.0.0.1:8088/_ape/health'
ssh hetzner-iptv 'curl -sI -m 6 -k -H "Accept-Encoding: gzip" https://iptv-ape.duckdns.org/lists/APE_LISTA_1792869328847.m3u8'
ssh hetzner-iptv 'stat -c "%n|%s|%y|%a" /etc/cron.d/cache-health-monitor; cat /etc/cron.d/cache-health-monitor'
ssh hetzner-iptv 'systemctl list-timers --all --no-pager | head -25'
```

---
*Fin de VPS_INVENTORY.md — datos medidos el 2026-10-26 entre 03:55Z y 04:00Z. Cero mutaciones.*

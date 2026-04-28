# SOP FORENSE SHIELDED — PARTE 2: NGINX CORE + LUA PIPELINE

> **Partes:** [1/4] Doctrina — **[2/4] NGINX+Lua** — [3/4] PRISMA+Kernel — [4/4] Operaciones
> **Snapshot:** `vps/vps-live-snapshot-20260428/`

---

## 6. MÓDULO 3: NGINX Core

### 6.1 nginx.conf (raíz) — snapshot: `nginx.conf` (5.7KB)

```nginx
user www-data;
worker_processes auto;
worker_rlimit_nofile 200000;
worker_shutdown_timeout 30s;

thread_pool iptv threads=32 max_queue=65536;

events {
    worker_connections 20000;
    use epoll;
    multi_accept on;
    accept_mutex off;
}

http {
    lua_package_path "/usr/local/share/lua/5.1/?.lua;/usr/share/lua/5.1/?.lua;;";
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    keepalive_requests 100000;
    reset_timedout_connection on;
    client_max_body_size 600M;
    send_timeout 180s;
    open_file_cache max=200000 inactive=30s;
    # ...includes conf.d/*.conf
}
```

**Valores clave:**
- `worker_connections 20000` × workers = ~80K conexiones simultáneas
- `thread_pool iptv threads=32` — I/O asíncrono para cache disk
- `open_file_cache max=200000` — file descriptors cacheados
- `client_max_body_size 600M` — uploads de listas grandes

---

### 6.2 00-iptv-quantum.conf — snapshot: `nginx-conf.d/00-iptv-quantum.conf` (4.3KB)

Baseline global para TODOS los vhosts IPTV:

```nginx
# I/O asíncrono + NO spillear a disco
aio threads;
aio_write on;
proxy_max_temp_file_size 0;

# Stale policy: sirve stale cuando origin falla O está actualizando
proxy_cache_use_stale error timeout invalid_header updating
    http_500 http_502 http_503 http_504;
proxy_cache_background_update on;

# Lock: 50 clientes piden mismo .ts → solo 1 va al origin
proxy_cache_lock on;
proxy_cache_lock_timeout 5s;
proxy_cache_lock_age 10s;

# Ignorar headers del origin que interfieren con nuestras políticas
proxy_ignore_headers Cache-Control Expires Set-Cookie X-Accel-Expires Vary;

# Keep-alive al origin
proxy_http_version 1.1;
proxy_connect_timeout 3s;

# Failover entre IPs del upstream
proxy_next_upstream error timeout invalid_header http_502 http_503 http_504;
proxy_next_upstream_tries 3;
proxy_next_upstream_timeout 5s;
```

---

### 6.3 iptv-shield-rate.conf — snapshot: `nginx-conf.d/iptv-shield-rate.conf` (4.5KB)

Variables resueltas por `map` (blindado contra clobber en auth_request subrequests):

```nginx
# Extrae HOST del path /shield/{token}/{host}/...
map $request_uri $shield_host {
    "~^/shield/[a-f0-9]+/([^/]+)/"  "$1";
    default                          "";
}

# Extrae PATH del path /shield/{token}/{host}/{path...}
map $request_uri $shield_path {
    "~^/shield/[a-f0-9]+/[^/]+/(.*)$"  "/$1";
    default                              "/";
}

# Resuelve upstream por host
map $shield_host $shield_upstream {
    "nfqdeuxu.x1megaott.online"  "x1megaott_upstream";
    "line.tivi-ott.net"          "line_tivi_upstream";
    "ky-tv.cc"                   "ky_tv_upstream";
    "tivigo.cc"                  "tivigo_upstream";
    default                      "";
}

# Hard cap: 100r/s con burst=200 (anti-DOS, no anti-usuario)
limit_req_zone $shield_host zone=hard_cap:10m rate=100r/s;
```

**Por qué `map` y no `set`:** Los captures numerados `$1`, `$2` se clobberen en subrequests de `auth_request`. Usando `map $request_uri`, las variables se resuelven ANTES del subrequest.

---

### 6.4 iptv-intercept.conf — snapshot: `nginx-conf.d/iptv-intercept.conf` (20.5KB)

**Upstreams (4 proveedores):**

```nginx
upstream tivigo_upstream {
    server 154.6.41.6:80   max_fails=0;
    server 154.6.41.66:80  max_fails=0;
    server 154.6.41.126:80 max_fails=0;
    server 154.6.41.186:80 max_fails=0;
    # max_fails=0 → NUNCA marcar down (el proveedor puede dar 502 momentáneo)
}
upstream x1megaott_upstream { server nfqdeuxu.x1megaott.online:80 max_fails=0; }
upstream line_tivi_upstream  { server line.tivi-ott.net:80 max_fails=0; }
upstream ky_tv_upstream      { server ky-tv.cc:80 max_fails=0; }
```

**Server blocks por proveedor** — cada uno con:
- `allow 181.63.176.21; allow 10.200.0.0/24; deny all;` (solo player + WG)
- `/hlsr/` → `proxy_cache off` (signed tokens, NO cache)
- `/.m3u8$` → cache 2s, `proxy_cache_use_stale updating timeout`
- `/.ts$` → slice 1m, cache 10min, buffers 128k×128

---

### 6.5 CDN Intercepts

**zivovrix-intercept.conf** (8.9KB) y **rynivorn-intercept.conf** (8.8KB):

```nginx
upstream zivovrix_upstream { server 154.6.152.13:80 max_fails=0; }
upstream rynivorn_upstream { server 154.6.152.11:80 max_fails=0; }

server {
    server_name *.zivovrix.cc zivovrix.cc;  # wildcard por subdominios dinámicos

    location ~* \.m3u8$ {
        # FIX CRÍTICO: http_403 en stale
        # CDN rota tokens cada 5-10s → 403 frecuente → stale salva al player
        proxy_cache_use_stale error timeout updating http_403
            http_500 http_502 http_503 http_504;
        proxy_cache_background_update on;
        proxy_cache_valid 200 206 5s;
        proxy_cache_valid 302 301 2s;
        proxy_cache_valid 403 401 0;  # NUNCA cachear 403 (token expirado)
    }
}
```

---

### 6.6 shield-location.conf — **EL CORAZÓN** — snapshot: `nginx-snippets/shield-location.conf` (11.3KB)

```nginx
location = /_shield_auth {
    internal;
    fastcgi_pass unix:/run/php/php8.3-fpm.sock;
    fastcgi_param SCRIPT_FILENAME /var/www/html/api/shield-auth.php;
    fastcgi_param HTTP_X_ORIGINAL_URI $request_uri;
}

location ~ ^/shield/([a-f0-9]+)/([^/]+)/(.*)$ {
    auth_request /_shield_auth;

    # ═══ 6 HOOKS LUA (todos PASSTHROUGH, NUNCA bloquean) ═══
    rewrite_by_lua_file       /etc/nginx/lua/decision_engine.lua;
    access_by_lua_file        /etc/nginx/lua/upstream_gate.lua;
    header_filter_by_lua_file /etc/nginx/lua/upstream_response.lua;
    body_filter_by_lua_file   /etc/nginx/lua/floor_lock_filter.lua;
    log_by_lua_file           /etc/nginx/lua/bandwidth_reactor.lua;

    # Slot protection: 2 concurrent per user/pass (NUNCA 1)
    limit_conn xtream_slot 2;
    limit_conn_status 429;
    limit_req zone=hard_cap burst=200 nodelay;
    limit_req_status 429;

    # Guard: upstream no reconocido → 403
    if ($shield_upstream = "") { return 403; }

    # PROXY PASS AL PROVEEDOR
    proxy_pass http://$shield_upstream$shield_path$is_args$args;

    # Failover
    proxy_next_upstream error timeout http_502 http_503 http_504;
    proxy_next_upstream_tries 3;

    # Headers: solo envía Accept, Host, UA fijo, Referer fijo
    proxy_pass_request_headers off;
    proxy_set_header Accept "*/*";
    proxy_set_header Host $shield_host;
    proxy_set_header User-Agent "Mozilla/5.0 (Linux; Android 10; AFTKA)...Silk/112.3.1";
    proxy_set_header Referer "https://www.netflix.com/";

    # Cache en RAM
    proxy_cache iptv_cache;
    proxy_cache_key "$scheme$shield_host$shield_path";
    proxy_cache_valid 200 206 20s;
    proxy_cache_valid 302 301 0;    # NUNCA cache redirects (tokens)
    proxy_cache_valid 403 401 0;    # NUNCA cache auth errors
    proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
    proxy_cache_background_update on;

    # AUTOPISTA buffers
    proxy_buffer_size 128k;
    proxy_buffers 16 128k;           # 2MB total
    proxy_busy_buffers_size 256k;
    output_buffers 4 128k;
    proxy_connect_timeout 3s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
}
```

---

## 7. MÓDULO 4: LUA PIPELINE (6 hooks + 4 soporte + 3 APIs)

### 7.1 Hook 1: decision_engine.lua — TELESCOPE v2.1 (10.8KB)

**Fase:** `rewrite_by_lua_file` (ANTES de proxy_pass)

Lee el ring buffer L1 del bandwidth_reactor y aplica 6 reglas predictivas:

| Regla | Condición | Acción |
|---|---|---|
| R1 Predictive Prefetch | Floor breach en <5s (regresión lineal) | `X-Max-Bitrate: 160Mbps`, prefetch 4 segments |
| R2 TTFB Defense | TTFB >500ms Y slope >50 | `X-Max-Bitrate: 160Mbps`, prefetch 4 |
| R3 Network Unstable | Jitter >50ms Y packet loss >2% | `X-Max-Bitrate: 160Mbps`, prefetch 6 |
| R4 Nuclear Reinforce | Estado reactor = VBR_NUCLEAR | `X-Max-Bitrate: 240Mbps`, prefetch 6 |
| R5 Overdrive Maintain | Estado reactor = VBR_OVERDRIVE | `X-Max-Bitrate: 160Mbps`, prefetch 4 |
| R6 Failback Ramp | Trend improving + degraded state | `X-Max-Bitrate: 120Mbps`, prefetch 2 |

**Constantes:**
- `FLOOR_4K_BPS = 13,000,000` (13 Mbps)
- `TARGET_4K_BPS = 80,000,000` (80 Mbps)
- `THRESH_TTFB_HIGH = 500ms`
- `THRESH_JITTER = 50ms`
- Necesita ≥4 samples en L1 para activarse

---

### 7.2 Hook 2: upstream_gate.lua — AUTOPISTA (4.0KB)

**Fase:** `access_by_lua_file`

```lua
-- PASSTHROUGH: Solo telemetría, NUNCA bloquea
local host = ngx.var.shield_host
metrics_dict:incr(host .. ":total_requests", 1, 0)
ngx.header["X-APE-Circuit"] = "PASSTHROUGH"

-- Companion: aplica UA rotado por sentinel
local ua_ok, ua_mod = pcall(require, "sentinel_ua_apply")
if ua_ok and ua_mod.apply then ua_mod.apply() end
```

**Historia:** v1 era circuit breaker formal (CLOSED/HALF-OPEN/OPEN). Eliminado porque bloqueaba TODOS los canales de un host cuando 1 solo canal daba 502.

---

### 7.3 Hook 3: upstream_response.lua — AUTOPISTA (6.3KB)

**Fase:** `header_filter_by_lua_file`

```lua
-- PASSTHROUGH: Registra telemetría, NUNCA abre circuito
-- Skip cache hits (no representan estado real)
-- Registra contadores: 2xx, 3xx, 4xx, 5xx por host
-- Log non-2xx para observabilidad
-- Ejecuta sentinel_auth_guard.lua via dofile() (pcall protegido)
ngx.header["X-APE-Circuit"] = "PASSTHROUGH"
```

---

### 7.4 Hook 4: sentinel_auth_guard.lua (12.9KB)

**Fase:** `header_filter_by_lua_file` (ejecutado desde upstream_response.lua)

- Detecta 401/403 del upstream
- Rota UA de un pool de 20+ User-Agents
- Señala retry al player
- Reset counters cuando upstream responde 200
- NUNCA bloquea — solo rota credenciales de stealth

---

### 7.5 Hook 5: floor_lock_filter.lua — PRISMA (17.9KB)

**Fase:** `body_filter_by_lua_file`

Filtra variantes HLS con BANDWIDTH < floor del perfil activo:

1. Acumula chunks del body (HLS master puede venir en partes)
2. Verifica Content-Type = `mpegurl`
3. Lee floor del perfil via `lab_config.lua`
4. Parsea `#EXT-X-STREAM-INF:BANDWIDTH=N`
5. Remueve variantes < floor
6. **SIEMPRE mantiene la variante más alta** (safety)
7. Emite body filtrado con comentario `## PRISMA FLOOR-LOCK`
8. Persiste métricas en shared dict
9. **PASSTHROUGH en ANY error** (pcall protege todo)

**Perfiles:** P0=máximo → P5=mínimo (~1Mbps floor)

---

### 7.6 Hook 6: bandwidth_reactor.lua — PRISMA (22.1KB)

**Fase:** `log_by_lua_file` (POST-response, datos finales)

**Mediciones por request:**
- Throughput instantáneo: `bytes_sent / upstream_response_time`
- EWMA: `α=0.3`, `ewma = α×instant + (1-α)×prev`
- TTFB: `upstream_header_time` en ms
- Jitter: `|ttfb_actual - ttfb_ewma|`
- Ring buffer L1: 12 samples circulares

**TELESCOPE integration:**
- Regresión lineal sobre L1 → `throughput_slope` (bps/sample)
- TTFB slope → detecta upstream degrading
- Packet loss estimation: `5xx_count / total_requests`
- Trend: `improving` / `stable` / `degrading`
- Predicción de breach: `(ewma - floor) / |slope|` → seconds until floor breach

**State machine:**
| Estado | Condición | Request bps |
|---|---|---|
| CBR | EWMA ≥ 13Mbps (floor 4K) | 80 Mbps (target) |
| VBR_OVERDRIVE | EWMA entre 5-13 Mbps | **160 Mbps** (2× target — PUSH HARDER) |
| VBR_NUCLEAR | EWMA < 5Mbps (floor 1080p) | **240 Mbps** (3× target — MAXIMUM AGGRESSION) |

---

### 7.7 Soporte Lua

| Archivo | KB | Función |
|---|---|---|
| `lab_config.lua` | 15.5 | Lee 6 JSONs config con cache 300s en shared dict |
| `sentinel_ua_apply.lua` | 5.4 | Aplica UA rotado al request |
| `shield_follow_302.lua` | 3.5 | Sigue hasta 3 redirects 302 de CDNs |
| `follow_redirect.lua` | 2.4 | Intercepta 302 upstream |

### 7.8 APIs Lua (content_by_lua)

| Archivo | KB | Endpoint | Retorna |
|---|---|---|---|
| `bandwidth_reactor_api.lua` | 3.3 | `/prisma/api/bandwidth-reactor` | EWMA, instant, peak, state, prefetch |
| `sentinel_telemetry_api.lua` | 10.6 | `/prisma/api/sentinel-status` | Counters por proveedor, UA pool |
| `prisma_telemetry_full.lua` | 15.0 | `/prisma/api/telemetry-full` | JSON unificado: hardware+network+QoE+reactor+predictions |

---

## Siguiente: [Parte 3 — PRISMA+PHP+Kernel](sop-shielded-forensic-part3-prisma-kernel.md)

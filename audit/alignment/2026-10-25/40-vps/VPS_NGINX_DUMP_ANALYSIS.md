# VPS_NGINX_DUMP_ANALYSIS — `nginx -T` (dump sin recargar): locations, includes reales y doctrina autopista

**Método:** `ssh hetzner-iptv "nginx -T 2>&1"` → **36 954 B / 850 líneas**, volcado íntegro guardado en `_raw/nginx-T.conf`.
**Naturaleza:** `nginx -T` **imprime** la configuración combinada y **termina**. No abre socket de control, no envía `HUP`, no recarga. El servicio no se toca. Ver `VPS_READONLY_ATTESTATION.md` §3.
**Base:** `nginx/1.24.0 (Ubuntu)` + módulo dinámico `ngx_http_lua_module.so`. **No es OpenResty.**

---

## 1. Includes reales (lo que nginx carga de verdad)

Orden exacto en que nginx los compone, extraído de las líneas `# configuration file <ruta>:` del dump:

| # | Archivo | Líneas | sha256 (medido) |
|---|---|---|---|
| 1 | `/etc/nginx/nginx.conf` | 95 | `a9a7146a46b4080f32e0fd1e40772bce53cac3a8f0cd18ed2e1ebc5c31d4ce1f` |
| 2 | `/etc/nginx/modules-enabled/10-mod-http-ndk.conf` | — | (carga `ndk`) |
| 3 | `/etc/nginx/modules-enabled/50-mod-http-lua.conf` | — | `load_module modules/ngx_http_lua_module.so` |
| 4 | `/etc/nginx/mime.types` | — | — |
| 5 | `/etc/nginx/conf.d/00-ape-manifest-nocache.conf` | 5 | `1aec928698b29be228e62d5c39d927bb6aa46583600e70d09183de3d763349eb` |
| 6 | `/etc/nginx/conf.d/00-ape-match-zone.conf` | 2 | `005402fb8de34305249038e8069b217d87558edda121f84174605356b6a9be69` |
| 7 | `/etc/nginx/conf.d/00-ape-pull-zone.conf` | 2 | `88400a9b04c94211a6fc99a04cdeb22e1de9749490b00b01b958a6ad1d4d7257` |
| 8 | `/etc/nginx/conf.d/50-ape-meta-plane.conf` | **232** | `e06ee870c55201c359990d99459aa9784d01569f5200176cfffed3448525d3f9` |
| 9 | `/etc/nginx/conf.d/iptv-limit-conn.conf` | 14 | `917c98d819576f55fe60547ce0d5330f3d5fd2a32bcbc7cd73d524f876c3ec58` |
| 10 | `/etc/nginx/conf.d/iptv-proxy.conf` | 13 | `328921c0efdab6ca778d585b437a051dce0f1492ce4a7ec7d64dad0447880b6f` |
| 11 | `/etc/nginx/sites-enabled/coa-navigator` | 50 | `85dfc864d83a1ecab8cb3e7c4aedaced7569ec342172294757cfc44850d18688` |
| 12 | `/etc/nginx/snippets/fastcgi-php.conf` | 13 | `a9dd98bf9631d727f0a846a9c7f4fe6193468a714c782df26d5cc9a7756411f2` |
| 13 | `/etc/nginx/fastcgi.conf` · `/etc/nginx/fastcgi_params` | — | — |
| 14 | `/etc/nginx/sites-enabled/default` | 188 | `58bee1cb7b911bc1b40ebab65003d1cdfcfa8a7c6f03dc5e0acbdd77b38a4f96` |
| 15 | `/etc/nginx/snippets/ape-meta-public.conf` | 46 | `0a4002166054834c756d5451da49f8e9aa6327f5672a1e625a9c044df9ff91de` |

**NO incluidos (y por tanto irrelevantes para el runtime):** `snippets/ape-device-allow.conf` (3 líneas, `0bbdb926…`) y `snippets/ape-meta-public.conf.bak_20261025T180653` (2091 B, mtime `2026-10-24 17:57:01`). El `.bak` es visible por `ls` pero **no** aparece en `nginx -T` → es residuo de backup, no config activa.

### 1.1 AUSENCIA CONFIRMADA (el hallazgo central)

```
$ find /etc/nginx -type f \( -name "*shield*" -o -name "*crystal*" -o -name "*upstream_gate*" \
    -o -name "*decision_engine*" -o -name "*segment_guardian*" -o -name "*fortify*" -o -name "*ts_crystal*" \)
(fin find)          ← CERO resultados
$ ls /etc/nginx/snippets/
ape-device-allow.conf   ape-meta-public.conf   ape-meta-public.conf.bak_20261025T180653   fastcgi-php.conf
```

**`/etc/nginx/snippets/shield-location.conf` NO EXISTE.** Tampoco ninguno de los 11 módulos Lua que la doctrina `ape-crystal-edge` / OMEGA declara como pipeline: `ape_crystal_rewrite.lua`, `decision_engine.lua`, `ape_ts_crystal_hook.lua`, `upstream_gate.lua`, `ape_shield_header_filter.lua`, `ape_shield_body_filter.lua`, `combined_body_filter.lua`, `ape_segment_guardian.lua`, `ape_crystal_fortify.lua`, `ape_lcevc_enhancement_layer.lua`, `ape_8k_crystal_escalator.lua`. **0 de 11 presentes** (ver `VPS_LUA_MODULES.md` §5).

---

## 2. Topología real: 3 server blocks

### 2.1 Server `:8088` — **plano de metadata** (`conf.d/50-ape-meta-plane.conf`, empieza en línea 280 del dump)

`resolver 127.0.0.1:53 valid=60s ipv6=off; resolver_timeout 3s;` · `lua_package_path "/etc/nginx/lua/?.lua;…"`

| Location | Línea (archivo) | Directivas clave |
|---|---|---|
| `~ ^/meta/(?<ape_host>[A-Za-z0-9._-]+)(?<ape_path>/.*)$` | 288 (dump) | `proxy_pass http://$ape_host$ape_path$is_args$args`, `proxy_pass_request_headers off`, `proxy_buffering on`, `proxy_connect_timeout 3s`, **`proxy_read_timeout 5s`**, `proxy_next_upstream error timeout`, `proxy_cache off`, `header_filter_by_lua_file ape_header.lua`, `body_filter_by_lua_file ape_uri_rebase.lua`, `log_by_lua_file ape_wake_on_manifest.lua`, `add_header X-APE-Mode "metadata-only"`, `X-APE-Meta-Mode "rebase-only"` |
| `= /_ape/luatest` | 321 | `content_by_lua_file ape_luatest.lua` (banco de pruebas de `bw_adaptive_floor` + `ape_profile_resolver`) |
| `= /_ape/flags` | 330 | `content_by_lua_block { … }` — interruptores en caliente |
| `= /__fixture.m3u8` · `/__fixture_ll.m3u8` · `/__fixture_master.m3u8` · `/__fixture_master4k.m3u8` | 358/364/370/376 | `alias /etc/nginx/ape-selftest/…` — fixtures offline |
| `= /__selftest_full.m3u8` · `= /__selftest.m3u8` | 383 / 394 | `proxy_pass http://127.0.0.1:8088/__fixture.m3u8` + las 3 fases Lua → self-test end-to-end |
| `~ ^/cdn/(?<ape_host>[^/]+)(?<ape_path>/.*)$` | 406 | gateway metadata |
| `= /_ape/_fetch` | 411 | `proxy_pass http://$arg_h$arg_p$arg_qs` (subrequest del gateway) |
| `= /_ape/qoe` | 429 | `content_by_lua_file ape_obs.lua` |
| `= /_ape/health` | 435 | `content_by_lua_file ape_obs.lua` → **200 verificado** |
| `= /_ape/lab` | 442 | `content_by_lua_file ape_lab_api.lua` |
| `~* \.(ts|m4s|mp4|m4a|aac|vtt|key)$` | 449 | candado de video |
| `/` | 453 | default |

### 2.2 Server `:80/server_name _` (`sites-enabled/coa-navigator`, 50 líneas)

Cumple doble función: (a) `location ~ \.php$` → `fastcgi_pass unix:/run/php/php8.3-fpm.sock` con `fastcgi_read_timeout 30s` **para peticiones internas a `127.0.0.1:80`**; (b) reverse proxy de COA Navigator en `/coa/` → `http://127.0.0.1:3100/` (`proxy_read_timeout 300s`) y `/coa/socket.io/` → `proxy_read_timeout 86400s`.
**Nota:** `coa-navigator.service` está **inactive** → `/coa/` da 502 si se invoca.

### 2.3 Server `:80 default_server` + `:443 ssl default_server` (`sites-enabled/default`, 188 líneas)

`server_name iptv-ape.duckdns.org 178.156.147.234;` · `root /var/www/html;`

| Location | Línea | Detalle |
|---|---|---|
| `~ ^/prisma/api/prisma-adb-quality\.php$` | 620 (dump) | PHP ADB |
| `~ ^/prisma/quality-manifest\.(json|hash)$` | 626 | manifiesto de calidad |
| `= /health` | 673 | health de app |
| `~ \.php$` | 681 | FastCGI |
| **`~* \.m3u8$`** | **93 (archivo)** | **la location que sirve las listas** — ver §3 |
| `/` | ~160 | estáticos + CORS |
| `~* \.(ts|m4s|mp4)$` | — | `return 404` (candado: no video en VPS) |
| `~* \.(ini\|log\|sql\|bak\|env)$` | — | `return 404` |
| `~ /\.ht` | — | `deny all` |

**`.m3u8` está incluido dos veces en este server:**
- `snippets/ape-meta-public.conf:18` → `~ ^/cdn/(?<ape_host>[^/]+)(?<ape_path>/.*)$` con `proxy_pass http://127.0.0.1:8088` (delega en el 8088 para que el subrequest `/_ape/_fetch` exista en su contexto; comentario del propio archivo documenta el bug que corrigió: el 443 devolvía 404).
- `snippets/ape-meta-public.conf:32/38` → `/ape/health` (`ape_obs.lua`) y `/ape/lab-upload` (`ape_lab_upload.lua`, `client_max_body_size 2m`).
- `snippets/ape-meta-public.conf:44` → `~* \.(ts|m4s|mp4|m4a|aac|vtt|key)$ { return 404; }` (**candado explícito de segmentos en el plano público**).

---

## 3. La location que sirve las listas (`sites-enabled/default:93-153`)

```nginx
location ~* \.m3u8$ {
    default_type application/vnd.apple.mpegurl;
    types { application/vnd.apple.mpegurl m3u8; }
    gzip_static always;      # sirve el .gz incluso sin Accept-Encoding
    gunzip on;               # descompresión en streaming (16 KB chunks)
    gzip_vary on;
    output_buffers 32 16k;   # 512 KB de pipeline
    sendfile on; tcp_nopush on; tcp_nodelay on;
    add_header Access-Control-Allow-Origin "*" always;
    add_header Accept-Ranges bytes always;
    add_header Cache-Control "public, max-age=300" always;
    expires 5m;
    limit_except GET HEAD { deny all; }   # NO redirects en playlist
    try_files $uri =404;
}
```

**Verificación funcional (read-only, `curl -sI` desde el propio VPS):**
- Con `Accept-Encoding: gzip` → `HTTP/1.1 200`, `Content-Encoding: gzip`, `Content-Length: 297134088`, `Vary: Accept-Encoding`, `Last-Modified: Sun, 25 Oct 2026 17:56:21 GMT` (== mtime del `.gz`), `Content-Type: application/vnd.apple.mpegurl`.
- Sin `Accept-Encoding` → `HTTP/1.1 200`, sin `Content-Encoding` ni `Content-Length` (chunked): `gunzip on` descomprime al vuelo.
- `Range: bytes=0-40` → devuelve `#EXTM3U x-tvg-url="" … refresh="1800"` + `#EXT-X-VERSION:9` → **`Accept-Ranges` funciona sobre el path comprimido**.

**Estado:** `gzip_static` **PASS**. Es la única parte de la doctrina que se cumple literalmente en el borde.

---

## 4. Doctrina AUTOPISTA — medición contra invariantes

| Invariante doctrinal (fuente) | Exigido | **Medido** | Veredicto |
|---|---|---|---|
| `proxy_read_timeout` (`CLAUDE.md`, `net-shield-autopista-sop`) | **≥ 60 s** | **`5s`** en `conf.d/50-ape-meta-plane.conf:76` (`/meta/`) y `:200`; `20s` en `snippets/ape-meta-public.conf:27` (`/cdn/` 443); `300s`/`86400s` sólo en `coa-navigator` | **FAIL** — pero **el scope es el plano de metadata**, no el camino de segmentos. Ningún `location` proxya segmentos de video (están `return 404`). Un manifiesto que tarde >5 s hace que el provider aborte; no hay freeze de player porque no hay player servido por esta caja. |
| `limit_conn xtream_slot` (`CLAUDE.md`) | **≥ 2** | La **zona existe** (`limit_conn_zone $xtream_account zone=xtream_slot:10m;` en `iptv-limit-conn.conf:14`) pero **la directiva `limit_conn` NO aparece en ningún archivo** (`grep -rn limit_conn /etc/nginx` → sólo el comentario y la zona) | **FAIL / drift** — efecto neto: **sin límite de conexiones**. Es *más* permisivo que la doctrina, no frena nada (no viola «nunca frenar»), pero el invariante documentado no está implementado. |
| `keepalive` en upstreams Xtream (`CLAUDE.md`: «Usar keepalive en upstreams Xtream» = PROHIBIDO) | **no keepalive** | `nginx.conf:90` tiene el **comentario huérfano** `# Upstream hosts keepalive (reduce handshake overhead al provider)` pero **no hay ningún bloque `upstream { … keepalive N; }`** en toda la config | **PASS** (por ausencia) — el comentario es engañoso: describe algo que no existe. |
| `proxy_cache_valid 302` = **0** | 0 | **No existe ninguna directiva `proxy_cache_valid`** en `/etc/nginx` (`grep -rn proxy_cache_valid` → 0 resultados). El único location que proxya declara `proxy_cache off;` | **PASS** — ningún 302 se cachea, por partida doble. |
| `proxy_cache_path /dev/shm` 500 MB (`cache.md`, incidente SKY SPORTS) | cache RAM activa | Declarada: `proxy_cache_path /dev/shm/nginx_cache levels=1:2 keys_zone=iptv_cache:50m max_size=500m inactive=2h use_temp_path=off loader_threshold=1000 loader_files=2000;` (`nginx.conf:81-90`). **Ningún location usa `proxy_cache iptv_cache`.** Medido: `/dev/shm/nginx_cache` = **0 archivos / 0 bytes** | **FAIL** — zona de cache **muerta**. Es la causa raíz del «bucle-proxy_cache-off» citado al desactivar el cron (§9.1 de `VPS_INVENTORY.md`). |
| `tcp_congestion_control = bbr` | bbr | `net.ipv4.tcp_congestion_control = bbr` · `net.core.default_qdisc = fq` | **PASS** |
| Tuning de red autopista | — | `net.core.rmem_max = 268435456` · `wmem_max = 268435456` · `net.ipv4.tcp_fastopen = 3` · `tcp_notsent_lowat = 131072` · `tcp_slow_start_after_idle = 0` | **PASS** (perfil de autopista completo) |
| `keepalive_timeout` | holgado | `65` (http) · `30s` (server default) · `keepalive_requests 100000` | **PASS** |
| Manifiestos nunca cacheados (`00-ape-manifest-nocache.conf`) | sí | `proxy_no_cache` mapeado a `~*\.m3u8$ → 1` | **PASS** |

### 4.1 Timer de no-cache de manifiestos

`conf.d/iptv-proxy.conf:8`: `~*\.m3u8(\?.*)?$  2s;` — un TTL de 2 s para `.m3u8`, coherente con «manifiesto siempre live».

### 4.2 Shared dicts en contexto `http` (`conf.d/50-ape-meta-plane.conf:62-70`)

```nginx
lua_shared_dict circuit_metrics 10m;   # sentinel_auth_guard + bandwidth_reactor/combined_body_filter
lua_shared_dict lab_config       1m;   # cache del profile map (ape_profile_resolver)
lua_shared_dict ape_flags        1m;   # interruptores en caliente
lua_shared_dict ape_qoe          1m;   # contadores reales, publicados por /_ape/qoe
lua_shared_dict ape_hosts        1m;   # circuit-breaker suave de CDNs (host caído = 15 s fuera)
```

El comentario de `circuit_metrics` menciona **`combined_body_filter`** como consumidor, pero ese archivo **no existe** en `/etc/nginx/lua/` → referencia a un módulo ausente (drift documental, no runtime: un comentario no rompe nada).

### 4.3 Nota de configuración que revela disciplina de despliegue

`conf.d/50-ape-meta-plane.conf:72-76` documenta explícitamente que **`lua_package_path` NO se redeclara** porque duplicarlo produce `"lua_package_path directive is duplicate"` y nginx se niega a recargar, y que el gate `nginx -t` abortó e hizo rollback limpio. Coherente con el `lua_package_path` único en `nginx.conf:25`.

---

## 5. Rutas de fase Lua realmente cableadas (no 5 fases, 3 filtros)

| Fase nginx | Directiva presente | Módulo | Locations |
|---|---|---|---|
| `rewrite_by_lua*` | **AUSENTE** (`grep rewrite_by_lua` → 0) | — | — |
| `access_by_lua*` | **AUSENTE** (`grep access_by_lua` → 0) | — | — |
| `header_filter_by_lua_file` | **sí** | `/etc/nginx/lua/ape_header.lua` | `/meta/`, `/cdn/` 8088, `/__selftest*` |
| `body_filter_by_lua_file` | **sí** | `/etc/nginx/lua/ape_uri_rebase.lua` | idem |
| `log_by_lua_file` | **sí** | `/etc/nginx/lua/ape_wake_on_manifest.lua` | idem |
| `content_by_lua_file` | **sí** | `ape_obs.lua`, `ape_lab_api.lua`, `ape_lab_upload.lua`, `ape_gateway.lua`, `ape_luatest.lua` | `/_ape/health`, `/_ape/qoe`, `/_ape/lab`, `/ape/health`, `/ape/lab-upload`, `/cdn/` |

**Veredicto:** la doctrina describe **5 fases** (`rewrite → access → header_filter → body_filter → log`). Medido: **2 de las 5 fases no existen** (no hay `rewrite_by_lua` ni `access_by_lua` en ningún archivo). El pipeline real son **3 filtros + handlers de contenido** sobre un plano de **metadata-only**. Esto es consistente con el diseño declarado en el propio `50-ape-meta-plane.conf` («metadata-only edge», «el tráfico de video sigue bloqueado (404)»), y **contradice** el manifiesto OMEGA/`ape-crystal-edge` que describe un edge que proxya y reescribe segmentos.

---

## 6. Consecuencia para las otras capas

1. **`/shield/` no existe** (404 medido). Cualquier lista que apunte a `https://iptv-ape.duckdns.org/shield/<token>/…` **no va a servir**. Las listas vigentes en `/var/www/lists` se sirven como **archivo estático** en `/lists/`, no por el shield.
2. **No hay proxy de segmentos.** `~* \.(ts|m4s|mp4)$ → return 404` en los dos server públicos. El VPS **no** transporta video: sólo entrega la playlist.
3. **El plano que sí está vivo** es `:8088` metadata-only con `/meta/<host><path>` (rebase de URIs a absolutas del proveedor) — y su health confirma actividad real: `last_host: line.tivi-ott.net`, `last_latency_ms: 789`, `rebase_ok: 1`, `error_ratio: 0`.
4. **La cache RAM no participa.** Cualquier expectativa doctrinal de «cache 45 s anti-403» no se cumple: sin `proxy_cache` activo no hay cache.

---
*Fin de VPS_NGINX_DUMP_ANALYSIS.md — `nginx -T` volcado sin recargar · 36 954 B / 850 líneas · cero mutaciones.*

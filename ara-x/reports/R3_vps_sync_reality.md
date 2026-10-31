# R3 · Realidad del VPS y mapa de sincronización `ARA ⇄ VPS`

**Tarea:** `t4` · **Attempt:** `64f586d8-7284-41b5-9e03-fa72a5a99cb1` · **Miembro:** `vps-edge-engineer`
**Ejecutada:** 2026-10-30 22:33–22:47 UTC (`ssh hetzner-iptv`, usuario `root`)
**Modo:** **SOLO LECTURA**. No se escribió nada en el VPS (ni `/tmp`), no hubo `reload`/`restart`/`deploy`/`systemctl` mutante, ni un solo byte de config/estado modificado.
**Alcance escrito:** únicamente este informe en `ara-x/reports/R3_vps_sync_reality.md` (lane `ara-x/**` del workstream).

> Zonas horarias: los `stat`/`date` del VPS están en **UTC**; la hora local del operador es -05:00.
> Los hashes son **SHA-256 en mayúsculas** (los `sha256sum` crudos salen en minúsculas).

---

## 1 · Resumen ejecutivo (medido, no supuesto)

1. **Host correcto:** `ubuntu-2gb-ash-1`, Ubuntu **24.04.3 LTS**, kernel `6.8.0-124-generic`, IP `178.156.147.234` (coincide con `iptv-ape.duckdns.org`).
2. **nginx 1.24.0 (Ubuntu)**, **no OpenResty**. Lua entra por **módulos dinámicos**: `ndk_http_module.so` + `ngx_http_lua_module.so` (`/etc/nginx/modules-enabled/`). `nginx -V` no trae Lua compilado; `lua_package_path` está en `nginx.conf:22`.
3. **Plano real = meta-plane**: server `:8088` (`/etc/nginx/conf.d/50-ape-meta-plane.conf`) + locations públicas en el vhost 443 vía `snippets/ape-meta-public.conf`.
4. **Pipeline Crystal 5 fases NO está desplegado**: `combined_body_filter.lua`, `ape_virtual_4k.lua` y `decision_engine.lua` **no existen en `/etc/nginx/lua/`**; solo aparecen en backups viejos de `/root/*` y en comentarios de otros Lua. `ape-crystal-rust` **inactive**, **sin listener 8084** y **sin procesos** `crystal`.
5. **Endpoints confirmados** (loopback con SNI y, desde esta máquina, por DNS público — resultados idénticos): `/health` **200**, `/sync` **404**, `/a/` **200**, `/ara/version` **200** (`2.3.0-noWG`, `size 27625887`), `/ara/events` **401** sin Bearer, `/ape/health` **200**, `/ara/install` **200**, `/ara/agent.apk` **200 27.625.887 B** con sha256 == el declarado en `version.json`.
6. **Bus de política ya existe**: `policy_deltas` + `ara_heartbeats` en **`/opt/netshield/data/conviva.db`** (WAL, 188.416 B, mtime 22:40 UTC), servido por `/ara/events` (SSE, Bearer). Es el sustrato natural del *policy push*; **no hace falta crear otro bus**.
7. **Lo que falta para `/sync`**: endpoint (404), tabla de estado (`ara_sync_state`), almacén de claves por dispositivo (la tabla `ape_devices` **no tiene** columnas de secreto/nonce/seq) y el snippet nginx. La ruta `POST /sync` no existe en ningún fichero de `/etc/nginx` (grep = 0).
8. **CI/CD tiene DOS motores**: el **activo** es `.github/workflows/deploy-vps.yml` → `_vps_stage/deploy/*` (manifest de **10** filas, backup, `nginx -t`, `reload`, verify de paridad, rollback). El **legacy** `tools/cicd/vps_deploy_map.json` (42 targets) sigue con targets *enabled* para los Lua del pipeline Crystal **no desplegados** → **si alguien lo ejecuta, reintroduce el pipeline que la doctrina prohíbe** (hallazgo R3-R1).
9. **Paridad repo↔VPS**: los **16 Lua** desplegados tienen hash idéntico al `_vps_stage/lua/` del repo; `50-ape-meta-plane.conf` idéntico; `ape-attr-public.conf`, `prisma-ara-dist.conf`, `prisma-ara-events.conf` idénticos. **Drift real** en `ape-meta-public.conf` (repo 2.610 B vs VPS 3.096 B) y `prisma-ara-enroll.conf` (repo 1.767 B vs VPS 403 B) → el deployer **no puede reproducir** el estado vivo de esos dos snippets.
10. **Puntos de inserción aditivos** para `/sync` y policy push identificados con anclas exactas (§11): un snippet nuevo + una línea `include` + un PHP nuevo + 2 tablas SQLite; el *push* reutiliza `policy_deltas`/`/ara/events` y, opcionalmente, un `/ara/policy` estático con el patrón de `/ara/version`.

---

## 2 · Host, stack y runtime

| Hecho | Valor medido |
|---|---|
| `hostname` | `ubuntu-2gb-ash-1` |
| SO | `Ubuntu 24.04.3 LTS` (Noble) |
| Kernel | `Linux 6.8.0-124-generic` |
| nginx | `nginx/1.24.0 (Ubuntu)` · `NRestarts=0` · master PID `3801145` arrancado `2026-10-28 06:30:39 UTC` |
| Módulos Lua | `load_module modules/ndk_http_module.so` + `load_module modules/ngx_http_lua_module.so` (`/etc/nginx/modules-enabled/10-mod-http-ndk.conf`, `50-mod-http-lua.conf`) |
| PHP | `PHP 8.3.6 (cli)` · FPM socket `/run/php/php8.3-fpm.sock` (`srw-rw---- www-data:www-data`) · `pdo_sqlite` y `sqlite3` presentes |
| Recursos | `/` 38 G, **8,2 G libres** (78 % usado) · RAM 3.819 MB (535 MB libres + 2.815 caché) · swap 2.047 MB |
| Listeners | `0.0.0.0:80`, `0.0.0.0:443`, `0.0.0.0:8088` (+ `[::]` 80/443). **No hay 8084.** |
| Firewall | `iptables -P INPUT DROP` + cadenas `ufw-*` (binario `ufw` ausente). Puertos públicos permitidos: 22, 80, 443, 8443, 8765, 8888, **3100**, 51820/udp; DNS 53 solo desde `10.200.0.0/24` y una IP fija; extras: `wg0`, tcp 18600, tcp 7341, `91.150.160.38 → 18500`. **8088 NO está permitido** → desde Internet da *timeout* (verificado). |

Escucha del plano meta (medido): `ss -tlnp` → `nginx` en `0.0.0.0:8088` (4 procesos worker). Las locations sensibles del 8088 (`/_ape/*`, `/a/`, `/a/cfg`, `/__fixture*`) llevan `allow 127.0.0.1; deny all;`.

---

## 3 · Snippets desplegados (`/etc/nginx/snippets/`)

| Fichero | Bytes | mtime (UTC) | SHA-256 | Origen en repo | Paridad |
|---|---:|---|---|---|---|
| `ape-meta-public.conf` | 3.096 | 2026-10-29 19:34:31 | `3D1FA119423F2C62EE8BA74B4CF522534E33FA6BFDBC80FB66BA2290FFF5C22E` | `_vps_stage/public/ape-meta-public.conf` (2.610 B, `F5D62955…`) | **DRIFT** |
| `ape-attr-public.conf` | 2.102 | 2026-10-28 20:24:26 | `BB9CA8D83FE1EBCF36480E773999F2B020EA4E3DD84070A4DE00AE4624529FD9` | `_vps_stage/nginx/snippets/ape-attr-public.conf` | MATCH |
| `ape-device-allow.conf` | 93 | 2026-06-27 18:18:01 | `0BBDB9267F0D65E82D0EF986610F74192A74EE3E3C30418D40D72773BB8CD2B0` | **no está en el repo** (lo genera `ape-ip-autoenroll` cada minuto) | N/A (correcto) |
| `prisma-ara-dist.conf` | 1.507 | 2026-10-29 13:37:14 | `B29F1070AC30674EC5077558A3A54E6F8165F82147E566FA0C0F73F9CA3DF195` | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/snippets/prisma-ara-dist.conf` | MATCH |
| `prisma-ara-enroll.conf` | 403 | 2026-10-29 13:37:14 | `190CA2AEECE5B9DC768336B68BB7B4BA98F94B07AAE58B3FA57645278E6B61C8` | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/snippets/prisma-ara-enroll.conf` (1.767 B, `3D206A38…`) | **DRIFT** |
| `prisma-ara-events.conf` | 2.165 | 2026-10-29 13:37:14 | `615EA9705F49D88577CB1FE831A4F343D1B5C6792F5A4993992C4B11BF83F162` | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/snippets/prisma-ara-events.conf` | MATCH |

Notas de contenido (leídas, no inferidas):
- `ape-meta-public.conf` es **el** punto de enganche del 443: `include snippets/ape-attr-public.conf;` (l. 49) + `include snippets/prisma-ara-dist|events|enroll.conf;` (l. 52-55) + `location = /prisma/api/conviva-event` (l. 57). Candado de vídeo incluido (l. 44-46).
- `ape-attr-public.conf` se autodeclara “REPO-ONLY, NO desplegado” en su cabecera, pero **sí está desplegado** e incluido → comentario obsoleto (hallazgo R3-R4).
- `ape-device-allow.conf` tiene **2 entradas `allow`** (IPs residenciales del owner — **redactadas aquí a propósito**).
- `prisma-ara-enroll.conf` desplegado es la versión “MUST-FIX” (socket `php8.3-fpm`, `limit_except POST OPTIONS`); la del repo es la variante larga antigua → **no redeployar el archivo del repo sin revisar**.

---

## 4 · Lua desplegado (`/etc/nginx/lua/`)

| Fichero | Bytes | mtime (UTC) | SHA-256 (= `_vps_stage/lua/`) | Cableado |
|---|---:|---|---|---|
| `ape_attr.lua` | 31.210 | 2026-10-29 12:43:41 | `356618D82C9D287CBA335A2F3FF957B22D8673A568DBF9441013F631040EDAB3` | `content_by_lua_file` `/a/` y `/a/cfg` (8088) |
| `ape_gateway.lua` | 23.797 | 2026-10-29 12:43:41 | `11B45F8F5293821B44BAEB8F7C650000187B15949C8872316501FA5B74EA0954` | `content_by_lua_file` `/cdn/` (8088) |
| `ape_rebase_lib.lua` | 8.674 | 2026-10-27 12:22:36 | `F813B1CC9A7DA6126F97536A4C4B3FC662395E3D344619371150EE3387DDCFCB` | `require()` desde gateway |
| `ape_uhd.lua` | 9.894 | 2026-10-28 09:39:12 | `B02FBE28AD2BAFE16314D34F9C05FE43086B4EF73915AB9F17DCFB0D1B952E56` | `require()` (declare_auto) |
| `ape_profile_resolver.lua` | 4.191 | 2026-10-24 17:59:36 | `432610E6A4844D9528922A9570636FE42B13E6AFA8C47EB0FE3B6BDEC6A04508` | librería (require) |
| `ape_lastgood.lua` | 5.083 | 2026-10-29 12:43:41 | `A71586FF0CE477D0969FD2B8AAE614F813C7DFB62A0E7274CAF672C15F868688` | librería (require) |
| `ape_wake_on_manifest.lua` | 2.284 | 2026-10-27 12:18:48 | `D9C6B65D7626CD3630E76E185BCA1EC932B4DB324BBBD8337AE445630796DB19` | `log_by_lua_file` `/meta/` |
| `bw_adaptive_floor.lua` | 9.075 | 2026-10-24 17:59:36 | `B1A22492BEF2EE4874E4F1B6179CCB5898095352B8965F2E4C3837883F77CEDC` | librería (require; floor de variantes) |
| `sentinel_auth_guard.lua` | 7.207 | 2026-10-24 17:59:36 | `DD1D328BBE4E0C28CBC454D2E50ABF714FF0A82D327132CB3B5B5E5865CBCDBF` | librería/observador passthrough |
| `ape_header.lua` | 8.088 | 2026-10-27 12:18:47 | `23B25B031964CA573A89EEAB933A5D07BC91FB29AA5C038DF22C02BFF182117F` | `header_filter_by_lua_file` `/meta/` |
| `ape_uri_rebase.lua` | 9.930 | 2026-10-27 12:22:34 | `393635C2B2250FDE9CF5678F4E9B85FE5E9359C2A65CFD00FA1ADFBC85242FA8` | `body_filter_by_lua_file` `/meta/` |
| `ape_obs.lua` | 5.038 | 2026-10-28 09:39:13 | `AFA003AD6E929AD36FDEDF269F748B4885EC62D13FE4F38DBAE331BE0F4442C7` | `/_ape/health`, `/_ape/qoe`, `/_ape/uhd` |
| `ape_luatest.lua` | 14.064 | 2026-10-28 09:39:14 | `7F5BE26574584D59CA5A59E461BD56575D5D71200B7D744482EBE50C6BB0DFA8` | `/_ape/luatest` (loopback) |
| `ape_lab_api.lua` | 1.124 | 2026-10-27 12:18:47 | `C457267953E0D69685146BB2EE999C62AC080647035B378BB2A29F5FF58FAC71` | `/_ape/lab` (loopback) |
| `ape_lab_bridge.lua` | 7.723 | 2026-10-24 17:59:36 | `D0CAE6166FD41F104D08B937A3F5FA6B640C86F26F78E7ED9A76041EABA92C61` | librería del lab |
| `ape_lab_upload.lua` | 4.723 | 2026-10-24 17:59:36 | `B5C4D5F16D3E6BBF36C0A46E08CFED7BF6CE92B646BB5E441FF5F5945FB5F4AF` | `/ape/lab-upload` (443) |

**Paridad:** los 16 Lua desplegados en `/etc/nginx/lua/` tienen hash == `_vps_stage/lua/` (MATCH 16/16).

### 4.1 · Ausencia del pipeline Crystal (evidencia dura)

```
find /etc/nginx /opt /var/www /usr/local /root -maxdepth 5 \
     -name combined_body_filter.lua -o -name ape_virtual_4k.lua -o -name decision_engine.lua
# /etc/nginx/lua/*  → NINGUNO
# solo backups históricos:
#   /root/deploy_bak_20260521_232759/{combined_body_filter,ape_virtual_4k}.lua
#   /root/lua_restore_for_backup/nginx/lua/{combined_body_filter,ape_virtual_4k,decision_engine}.lua
#   /root/ape_orchestration_backup_20260612_062848/nginx/lua/{…}.lua
#   /root/ape_backups_407_deep_20260612T162829Z/nginx/lua/{…}.lua
```

`grep -RInE 'combined_body_filter|ape_virtual_4k|decision_engine' /etc/nginx` → **solo comentarios** (en `bw_adaptive_floor.lua`, `ape_uri_rebase.lua` y la cabecera de `50-ape-meta-plane.conf`). Ningún `*_by_lua_file` los referencia. Conclusión: **el VPS es metadata-only (rebase + gateway + attr + UHD flags)**; no remuxea ni transcodifica.

---

## 5 · Mapa de configuración viva (include graph leído, no `nginx -T`)

```
/etc/nginx/nginx.conf
├── modules-enabled/{10-mod-http-ndk,50-mod-http-lua}.conf        (load_module ndk + lua)
├── lua_package_path "/etc/nginx/lua/?.lua;…"                     (l. 22)
├── lua_shared_dict?  → no en nginx.conf; sí en conf.d (ver abajo)
├── proxy_cache_path /dev/shm/nginx_cache (iptv_cache 50m, 500m max, 2h)
├── include /etc/nginx/conf.d/*.conf
│   ├── 00-ape-manifest-nocache.conf   (map $uri $ape_manifest_nocache; 185 B)
│   ├── 00-ape-match-zone.conf         (limit_req_zone ape_match 120r/m)
│   ├── 00-ape-pull-zone.conf          (limit_req_zone ape_pull 30r/m)
│   ├── 50-ape-meta-plane.conf         (server :8088 completo + 6 shared dicts; 12.389 B)
│   ├── 99-prisma-stream-zone.conf     (limit_conn_zone prisma_stream_per_ip)
│   ├── iptv-limit-conn.conf           (map $xtream_account + zone xtream_slot)
│   ├── iptv-proxy.conf                (map $cache_ttl para /px/)
│   ├── cmaf_mime.conf.disabled        (NO cargado)
│   └── zz-ape-gpu-edge.conf.bak-brain (NO cargado: extensión .bak-brain)
└── include /etc/nginx/sites-enabled/*
    ├── default (7.828 B, sha 49C162A8…): :80 default → 301 a HTTPS salvo 2 rutas;
    │   :443 ssl http2 default → include snippets/ape-meta-public.conf (l. 43)
    │     ├─ /cdn/  → proxy_pass http://127.0.0.1:8088  (gateway multi-CDN)
    │     ├─ /ape/health, /ape/lab-upload
    │     ├─ /a/ (fail-open, GET/HEAD)
    │     ├─ /ara/install, /ara/agent.apk, /ara/version   (prisma-ara-dist.conf)
    │     ├─ /ara/events (SSE, Bearer en PHP)             (prisma-ara-events.conf)
    │     ├─ /ara/enroll (POST, secreto env)              (prisma-ara-enroll.conf)
    │     ├─ /prisma/api/conviva-event (PHP)
    │     ├─ /health, *.php (PHP-FPM), *.m3u8 (gzip_static+gunzip), / (static), *.ts|m4s|mp4 → 404
    └── coa-navigator (2.106 B): :80 server_name _ → PHP genérico + /coa/ → 127.0.0.1:3100
```

`server :8088` (`50-ape-meta-plane.conf`, sha `FD591F4258A42308672AA688E803565BCF08F8696D9E248E0DC77D553F1BCBA4`):
`/meta/<host>/<path>` (proxy + header/body/log filters), `/cdn/<host>/<path>` (gateway), `/_ape/_fetch` (internal), `/_ape/{luatest,flags,qoe,health,uhd,lab}`, `/a/`, `/a/cfg`, fixtures `/__fixture*.m3u8`, `/__selftest*.m3u8`, candado de vídeo y `/ → 404`.
Shared dicts declarados: `circuit_metrics 10m`, `lab_config 1m`, `ape_flags 1m`, `ape_qoe 1m`, `ape_hosts 1m`, `ape_attr_cfg 1m` (**este último es la config por sesión de `/a/cfg`**).

---

## 6 · Endpoints medidos (2026-10-30, tras 22:35 UTC)

Medición doble: (a) desde el propio VPS por loopback + SNI (`--resolve iptv-ape.duckdns.org:443:127.0.0.1`), (b) desde esta máquina por DNS público. **Resultados idénticos** salvo el APK (mismo tamaño en ambos).

| Endpoint | Método | Status | Bytes | Content-Type | Notas |
|---|---|---:|---:|---|---|
| `/health` | GET | **200** | 3 | `text/plain` | cuerpo `OK\n` |
| `/sync` | GET | **404** | 146 | `text/html` | 404 genérico de nginx; **no hay location** |
| `/sync` | OPTIONS | 204 | 0 | — | lo responde el bloque OPTIONS genérico de `location /` (NO implica ruta `/sync`) |
| `/a/` | GET | **200** | 26 | `text/plain; charset=us-ascii` | fail-open: `base64url` sin padding de `#EXT-X-APE-STALE:1\n` = `I0VYVC1YLUFQRS1TVEFMRToxCg` |
| `/ara/version` | GET | **200** | 177 | `application/json` | ver cuerpo abajo |
| `/ara/agent.apk` | GET | **200** | **27.625.887** | `application/vnd.android.package-archive` | sha256 en disco `E1D47129A4122DAD72BC3969CD4263D30EB3FD07E1D72BA81A2D1FD790DD0E24` == `version.json.sha256` |
| `/ara/install` | GET | **200** | 2.211 | `text/html` | landing |
| `/ara/events` | GET | **401** | 36 | `application/json; charset=utf-8` | sin `Authorization: Bearer`; cabeceras `X-APE-ARA-Events: v1.0`, `X-Accel-Buffering: no`, `Cache-Control: no-cache, no-transform` |
| `/ara/enroll` | GET | (no medido) | — | — | config: `limit_except POST OPTIONS { deny all; }` → GET = 403 · POST sin secreto = 401/503 |
| `/ape/health` | GET | **200** | 66 | `application/json` | `{"upstreams_down":0,"plane":"meta/v3","ts":1793399911,"ok":true}` |
| `/ape/lab-upload` | GET | **405** | 60 | `application/json` | solo POST + token |
| `/prisma/api/conviva-event` | GET | **405** | 68 | `application/json` | solo POST |
| `/cdn/example.com/x.m3u8` | GET | **404** | 114 | `application/json` | `{"reason":"http_404","ms":14,"error":"all_upstreams_failed","ok":false,"path":"/x.m3u8","tried":["example.com"]}` (el gateway SÍ intenta hosts públicos: ver R3-R5) |
| `/lists/APE_LISTA_4K.m3u8` | HEAD | **200** | — | `application/vnd.apple.mpegurl` | `last-modified: 2026-10-29 11:54:23Z`; `etag: W/"6ae333ef-85e75d4"` (= 140.408.276 B, el `.gz`); sin `Content-Length` (gunzip chunked) |
| `http://178.156.147.234:8088/_ape/health` | GET | **timeout** | — | — | 8088 no está en el firewall público (INPUT DROP) |
| `http://178.156.147.234:8088/meta/example.com/x.m3u8` | GET | **timeout** | — | — | ídem |

Cuerpo exacto de `/ara/version`:

```json
{"versionCode":6,"versionName":"2.3.0-noWG","sha256":"e1d47129a4122dad72bc3969cd4263d30eb3fd07e1d72ba81a2d1fd790dd0e24","size":27625887,"apk":"/ara/agent.apk","min_android":22}
```

`/ara/version` es un **alias estático** a `/var/www/html/ara/version.json` (177 B, sha256 `A655757D3A216F92DCC72E1B67312839F4BA490D69BD8B8FBB0E1A080B3E1F9E`, mtime 2026-10-30 03:27) — patrón reutilizable para `/ara/policy` (§11.4).

---

## 7 · Servicios, timers y cron

| Unidad | Estado | Detalle |
|---|---|---|
| `nginx.service` | **active (running)** | master PID 3801145 desde 2026-10-28 06:30:39Z; `NRestarts=0` |
| `php8.3-fpm.service` | **active (running)** | socket `/run/php/php8.3-fpm.sock`; env del pool (nombres, valores no leídos): `ARA_TOKEN`, `APE_ENROLL_SECRET` |
| `ape-crystal-rust.service` | **inactive** | sin listener 8084, sin proceso; `/health` del 8084 no aplica |
| `ape-meta-watchdog.service` | loaded, oneshot | `/usr/local/bin/ape-meta-watchdog.sh` (1.937 B, sha `17BBA3D2676341608FE66EED60191C0359ECFD582F6FD1DC0AD2F95FC0072670`). Timer `OnBootSec=2min`, `OnUnitActiveSec=60s`. **A los 3 fallos de `http://127.0.0.1:8088/_ape/health`: `nginx -t` → `reload`; si `-t` falla → `restart`.** Siempre `exit 0`; estado en `/var/lib/ape-meta-watchdog.fails`. |
| `ape-net-tuning.service` | loaded, active(exited) | `/usr/local/bin/ape-net-tuning.sh` (2.368 B, sha `31711AF899FCBB7F2ABABA78A03FB52374DD4A302FC9186DBB2CDEA68FCA76C4`) — `initcwnd/initrwnd` |
| `wg-quick@wg0.service` | active(exited) | túnel base activo |
| `wg-quick@wg-surfshark{,-br}.service` | **failed** | (contexto de red; no tocado) |
| `netshield-*.service` | **not-found** | la doctrina OMEGA no está instalada como units |
| `ape-meta-watchdog.timer`, `wg-health-fast.timer`, `cache-hygiene.timer`, `unbound-prewarm.timer`, `surfshark-failover.timer`, `iptv-tcp-autosync.timer` | active | el de meta-plane corre ~cada 60 s |

Cron (`/etc/cron.d/`):
- `ape-ip-autoenroll` — **cada minuto**, `flock` + `/usr/local/sbin/ape-ip-autoenroll.sh` (sha `69DB0E1612E5B4519DDB927A7A5FD0F7336B5BF41592EFE50A7B5D655463FE63`). Regenera `ape-device-allow.conf` + `unbound zz-ape-device-allow.conf` desde `/etc/ape/allowed_devices.txt` + `/dev/shm/ape_dev_ip` (TTL 86400). **No editar ese snippet a mano.**
- `cache-health-monitor` — **deshabilitado** (línea comentada, 2026-10-25): el bucle `proxy_cache off` + gracia 15 min reiniciaba nginx.
- `mem-pressure-watch`, `wg-peer-audit`, `certbot`, `php`, `sysstat` — presentes.

---

## 8 · Sustrato de política existente (clave para `/sync` y *policy push*)

| Pieza | Valor medido |
|---|---|
| DB canónica | **`/opt/netshield/data/conviva.db`** (188.416 B) + `conviva.db-shm` (32.768 B) + `conviva.db-wal` (8.272 B), mtime 22:40/22:41 UTC → **viva, en WAL** |
| Ruta en código | `conviva_persistence.php:40` → `public const DEFAULT_DB_PATH = '/opt/netshield/data/conviva.db'`; `ape_mesh.php::ape_policy_db_path()` la prefiere y cae a `CONVIVA_DB_PATH` o `/opt/netshield/data/conviva.db` |
| Bus | `ape_mesh.php` (43.822 B, sha `37F043B8E8339DAD7EBC25E3E9445D3741E7A96E6069F184EF3A127CEEE44ACE`) define `ape_policy_db()`, `ape_policy_ensure_tables()` |
| `policy_deltas` | columnas: `id, created_at, expires_at, target_device_id, channel_id, delta_type, priority, payload_json, applied_count, source` + índices por `(target_device_id, channel_id, id)` y `expires_at` |
| `ara_heartbeats` | columnas: `device_id, last_seen, channel_id, player, ara_version, state, caps_json, last_error` |
| SSE | `/ara/events` → `events-sse.php` (4.172 B, sha `1EDACFDB4E09AC949522F51E02101CFE748C37CED6ECD00498414058AF4DE640`); auth `ARA_TOKEN` env con `hash_equals`; rechaza token por query; lee `policy_deltas` filtrando `expires_at`, `target_device_id` (`NULL|''|'*'|device`) y `channel_id`; heartbeat cada 15 s; tope 3600 s |
| Enrolamiento | `/ara/enroll` → `ara-enroll.php` (3.746 B, sha `ADF07D6FB5846172A4A7F309684E00BA08171FC5C1309AE6C67C6B7DFE168D3C`): POST JSON ≤ 8 KB, secreto `APE_ENROLL_SECRET` desde env del pool (`hash_equals`), encola en `/dev/shm/ape_enroll/req-<id>.json` para un worker root; **no** escribe `/etc/wireguard` |
| Registro de devices | `/var/www/html/prisma/db/ape_devices.db` (24.576 B): tablas `ape_devices(device_id, device_ip, player, platform, android_version, model, settings_applied, chisel_port, vps_tunnel, user_agent, registered_at, last_seen, notes)` y `ape_providers(host, port, protocol, last_status, redirect_chain, registered_at, last_seen)`. **No hay columnas de secreto/HMAC/seq/nonce** → `/sync` necesita almacén y tabla de estado nuevos |
| Patrón de tokens por agente | `/var/www/html/prisma/db/ape_agent_tokens/{daemon_prod,firestick-cali}` y `ape_publisher_tokens/{generator_prod}`: ficheros de 65 B, modo `640 root:www-data` → patrón reutilizable para claves por dispositivo si no se quiere tabla |
| Env (`ara.env.example`) | claves: `ARA_TOKEN, ARA_ENDPOINT, APE_LAB_MODE, CONVIVA_DB_PATH, APE_PQ_ROLLBACK_ENABLED, APE_PQ_ROLLBACK_INCIDENTS_MIN, APE_PQ_ROLLBACK_COOLDOWN_SECONDS` (valores **no** leídos) |
| Trampa | `/var/www/html/prisma/db/conviva.db` existe pero está **vacío (0 B)** — NO es la DB canónica; no usarlo |

---

## 9 · CI/CD mapeado (repo → VPS)

### 9.1 · Pipeline ACTIVO — `.github/workflows/deploy-vps.yml` + `_vps_stage/deploy/*`

- Workflow (17.386 B, mtime 2026-10-27 12:43): **disparo manual** (`workflow_dispatch`), modos `dry-run` (default) / `staging` / `deploy`; `concurrency: deploy-vps-production` (1 a la vez); jobs: `inventory` (read-only) → `dry-run` (preflight + diff) → `validate` (`luac -p`/`php -l`/`nginx -t`) → `staging` 8089 (**Environment `production` = required reviewers**) → `deploy` (**Environment `production`**) → `verify` → `rollback` (job con el `stamp`). `APE_DRY_RUN` salta la capa 8088 en verify.
- `manifest.tsv` (10 filas, fuente de verdad del pipeline): `ape_header.lua`, `ape_uri_rebase.lua`, `ape_wake_on_manifest.lua`, `ape_gateway.lua`, `ape_rebase_lib.lua`, `ape_uhd.lua`, `ape_obs.lua`, `ape_lab_api.lua`, `ape_luatest.lua`, `_vps_stage/nginx/meta-plane.conf → /etc/nginx/conf.d/50-ape-meta-plane.conf`. Regla escrita: **solo se despliega lo que la config viva referencia**.
- `deploy.sh`: staging `/tmp/ape-deploy-<stamp>` → validación remota → **backup en `/var/backups/ape-deploy/<stamp>/`** → `install -m <mode> -o/-g` → `nginx -t` → `nginx -s reload` → `verify.sh`; cualquier fallo después del backup ⇒ **`rollback.sh <stamp> --yes` automático**. Fix t115: loops por `fd 3` (`done 3< <(manifest_rows)`) + conteos `n_rows/n_manifest` + `AUSENTE-LOCAL` aborta + verificación de sha256 del transporte.
- `verify.sh`: smoke de red + **paridad sha256 de las 10 filas** (`n_checked == n_manifest`) + `8088 /_ape/health` (salvo `APE_DRY_RUN=1`); exit 3 si endpoint ≠ 200.
- Constantes (`lib.sh`): `VPS_HOST` default `178.156.147.234`, `VPS_USER` root, `REMOTE_BACKUP_ROOT=/var/backups/ape-deploy`, `SSH_OPTS` BatchMode+ConnectTimeout 10+accept-new+IdentitiesOnly.
- **No cubre**: `sites-enabled/default`, `snippets/ape-meta-public.conf`, `ape-attr-public.conf`, `prisma-ara-*.conf` (los snippets vivos se mantienen a mano). `manifest.tsv` sí tiene `_vps_stage/nginx/meta-plane.conf` (paridad MATCH).

### 9.2 · Pipeline LEGACY — `tools/cicd/vps_deploy_map.json` + `deploy_vps.sh/.ps1`

- `vps_deploy_map.json` (17.701 B, sha `1A1682B391FF176BF2878867651D1ADF756F43C18E7363CBF64442DAA924E629`, mtime 2026-06-18): `vps{host,user,ssh_target,health_url:/api/health,resolve_probe_url,min_free_mb:1500,rollback_root:/root/ape-deploy-rollback,repo_vps_root}`, `no_touch` (`/etc/nginx/conf.d/iptv-intercept.conf`, `/var/www/html/OMEGA_V5.4_PRODUCTION_UI_DO_NOT_TOUCH`), `post_actions{nginx-reload:"nginx -t && systemctl reload nginx", none}`, **42 targets, 42 enabled**.
- `deploy_vps.sh` (10.695 B) es CD local (preflight `df ≥1.5G` + health, backup fechado, `scp`→tmp→mv sin `--delete`, `php -l`/`nginx -t`, un reload, verify, auto-rollback, log JSON).
- **Riesgo R3-R1:** entre los targets *enabled* están `lua-combined-body-filter` (`combined_body_filter.lua`), `lua-ape-virtual-4k` (`ape_virtual_4k.lua`), `lua-quality-realtime`, `lua-ape-profile-map`, `lua-device-state-writer`, `lua-bandwidth-reactor`, `lua-codec-cascade`… **ninguno desplegado hoy**. Ejecutar ese motor **introduciría el pipeline Crystal 5 fases** que la doctrina prohíbe.
- Cobertura de snippets en ese mapa: `prisma-ara-enroll.conf`, `prisma-ara-events.conf`, `prisma-public-api-locations.conf`, `prisma-ape-*-location.conf`, `ape-visual-v3-2-location.conf`; **no** incluye `prisma-ara-dist.conf`, `ape-meta-public.conf` ni `ape-attr-public.conf`.
- Conclusión operativa: **el motor vigente es el workflow + `_vps_stage/deploy`**; `tools/cicd` se conserva como mapa histórico/rollback manual y **no debe ejecutarse tal cual**.

### 9.3 · LF, backups y re-pin

- `.gitattributes` (repo): `*.lua, *.sh, *.ts, *.m3u8, *.tsv, *.md, *.js, *.yml, *.php → text eol=lf`. **No hay regla para `*.conf`** → riesgo de CRLF en configs (R3-R3); el pin sha256 del deploy compara bytes, así que un CRLF rompe la paridad.
- Backups observados en el VPS: `/root/backups/` (`ape_gateway.lua.bak_20261026T204957Z`, `default.bak_20261026T202256Z`, `cache-health-monitor.bak_20261026T025958Z`), `/root/nginx-bak/` (`50-ape-meta-plane.conf.bak_20261026T043331Z`, `ape-meta-public.conf.bak_20261026T043703Z`), `/root/ape-meta-plane-backup-20261024T*`, `/root/{nginx-before,nginx-after}2-20261026T043703Z.conf`; y **`/var/backups/ape-deploy/<stamp>/`** por corrida del pipeline activo.
- Re-pin documental: `docs/edge/DEPLOY_LOG.md` fija pares `antes (vivo)`/`después (staged)` por sha256 y `verify.sh` exige paridad completa del manifiesto. El estado vivo actual del vhost coincide con el **pre-estado E10** (`sites-enabled/default` sha `49C162A862F1E5485959350F2B2175F24EEC440A10D2CD6902B2E0E03F8C59D1`), es decir, **la ventana E10 no se aplicó**.

### 9.4 · Paridad repo ↔ VPS (resumen)

| Artefacto | Repo | VPS | Veredicto |
|---|---|---|---|
| 16 Lua de `/etc/nginx/lua/` | `_vps_stage/lua/*` | `/etc/nginx/lua/*` | **MATCH 16/16** |
| `50-ape-meta-plane.conf` | `_vps_stage/nginx/meta-plane.conf` (`FD591F42…`, 12.389 B) | `FD591F42…`, 12.389 B | **MATCH** |
| `ape-attr-public.conf` | `_vps_stage/nginx/snippets/…` (`BB9CA8D8…`) | `BB9CA8D8…` | **MATCH** |
| `prisma-ara-dist.conf` / `-events.conf` | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/snippets/…` | mismos hashes | **MATCH** |
| `ape-meta-public.conf` | `_vps_stage/public/…` (`F5D62955…`, 2.610 B) | `3D1FA119…`, 3.096 B | **DRIFT** (VPS tiene el bloque ARA t64; el repo público no) |
| `prisma-ara-enroll.conf` | repo (`3D206A38…`, 1.767 B) | `190CA2AE…`, 403 B | **DRIFT** (VPS = versión MUST-FIX) |
| `ape-hosts-allow.txt` | `_vps_stage/public/…` (`167C61DF…`, 809 B) | `167C61DF…`, 809 B | **MATCH** |
| `sites-enabled/default` | snapshot edge 2026-10-26 (`58BEE1CB…`, 6.862 B) | `49C162A8…`, 7.828 B | **DRIFT** (snapshot viejo; el vivo es el pre-E10) |

---

## 10 · Puntos de inserción aditivos para `/sync` y *policy push*

Contrato de referencia: `ara-x/spec/ARA_X_SYNC_PROTOCOL.md` (§3-§10) + schemas `ara-x/vps/schema/*` + cliente `ara-x/vps/client/ara_sync_client.js`. Nada de esto está desplegado; `/sync` sigue 404.

### 10.1 · Capa nginx (443 público)

1. **Fichero nuevo**: `/etc/nginx/snippets/prisma-ara-sync.conf` (644 root:root), al estilo de `prisma-ara-enroll.conf`:

```nginx
location = /sync {
    limit_except POST OPTIONS { deny all; }      # GET = 403, igual que enroll
    client_max_body_size 16k;                    # body duro del contrato
    add_header Cache-Control "no-store" always;
    add_header X-APE-ARA-Sync "v1" always;
    include fastcgi.conf;
    fastcgi_pass unix:/run/php/php8.3-fpm.sock;
    fastcgi_param SCRIPT_FILENAME /var/www/html/prisma/api/ara-sync.php;
    fastcgi_param SCRIPT_NAME     /sync;
    fastcgi_param HTTP_AUTHORIZATION $http_authorization;
    fastcgi_read_timeout 10s;
    fastcgi_send_timeout 10s;
}
```

2. **Ancla de inclusión (1 línea)**: `/etc/nginx/snippets/ape-meta-public.conf`, **después de la línea 55** (`include snippets/prisma-ara-enroll.conf;`), antes del bloque `location = /prisma/api/conviva-event` (l. 57): `include snippets/prisma-ara-sync.conf;`.
   Ojo: ese snippet **no está en `manifest.tsv`** (ni en el mapa legacy). Para desplegarlo por el pipeline hay que añadir su fila y **primero reconciliar el drift** (§9.4), o el deploy pisará el bloque ARA del 443.
3. **Rate-limit aislado (opcional pero recomendado)**: `/etc/nginx/conf.d/00-ara-sync-zone.conf` con `limit_req_zone $http_x_ara_key_id zone=ara_sync:1m rate=…;` + `limit_req zone=ara_sync burst=… nodelay;` **solo** dentro de `location = /sync`. Nunca en `/`, `/lists/`, `/cdn/` ni `*.m3u8` (autopista). La clave del header `X-ARA-Key-Id` la fija el contrato §3.1; peticiones sin header comparten bucket y reciben 401 rápido.
4. **No** se toca `sites-enabled/default` (basta el include indirecto) ni el server `:8088` (el device habla por 443).

### 10.2 · Handler PHP

- **Fichero nuevo**: `/var/www/html/prisma/api/ara-sync.php` (644 root:root, como `ara-enroll.php`).
- Reutiliza `require_once __DIR__ . '/../lib/ape_mesh.php';` → `ape_policy_db()` (conviva.db, WAL) y `ape_ara_heartbeat()`.
- Nuevas tablas (idempotentes, `CREATE TABLE IF NOT EXISTS`): `ara_sync_state(device_id PK, last_seq INTEGER, last_ts INTEGER, last_nonce TEXT, policy_etag TEXT, updated_at INTEGER)` y `ara_sync_keys(key_id PK, device_id, secret_hash, rotated_at, expires_at)` (o ficheros 65 B modo 640 en `db/ape_agent_tokens/` siguiendo el patrón existente).
- Firma/verificación: `php://input` **crudo** (no re-serializar) + `hash_equals`; ventana ±300 s; `seq` monótono; `nonce` anti-replay; respuesta firmada `X-ARA-Sig`; 200/204/401/409/413/429/503 del §3.1.
- **Nunca** URLs del device hacia el VPS (nada de fetch a terceros desde `/sync`); el gateway `/cdn/` sigue siendo el único que habla con upstreams.
- Canary: `X-ARA-Sync-Mode: shadow` (calcula política y la registra en `policy_deltas` sin servirla) 24 h antes de activar.

### 10.3 · *Policy push* (VPS → device) — opciones aditivas, en orden de preferencia

1. **Respuesta síncrona de `/sync`** (canal de control, 30 s): la política viaja en el body de la respuesta (ya definido §6 del spec). Es el camino primario y **no requiere tocar nginx más allá de §10.1**.
2. **Fan-out por el bus existente**: el handler de `/sync` inserta una fila en `policy_deltas` (`source='ara_x_sync'`, `target_device_id`, `channel_id`, `delta_type='sync_policy'`, `payload_json`, `priority`, `expires_at`) y `/ara/events` la entrega por SSE **sin ningún cambio de nginx**. Reutiliza `ara_heartbeats` para presencia. Ya está medido: `/ara/events` = 401 sin Bearer y lee esas columnas.
3. **Política estática de emergencia**: `location = /ara/policy { alias /var/www/html/ara/policy.json; add_header Cache-Control "no-store"; }` dentro de `prisma-ara-dist.conf` (patrón exacto de `/ara/version`), publicado de forma atómica (staging + `install`/`mv` + re-pin sha256). Útil si el APK necesita una política "buena conocida" sin PHP; **no sustituye** a `/sync`.
4. **`/a/` sigue siendo Lua**: `ape_attr.lua` lee `ape_attr_cfg`/`ape_qoe`/`ape_flags` (shared dicts de nginx). **PHP no puede escribir esos dicts**; si la política debe materializarse también en `/a/`, el único puente existente es el `POST /a/cfg` **loopback** del 8088 (ya existe, `allow 127.0.0.1`). Si se usa, hacerlo fire-and-forget y fuera del camino caliente.

### 10.4 · Ruta de despliegue y ventana (propuesta, no ejecutada)

1. Añadir a `_vps_stage/deploy/manifest.tsv` (motor activo): `ara-x/vps/php/ara-sync.php → /var/www/html/prisma/api/ara-sync.php 644 root:root`; `ara-x/vps/nginx/ara-sync.conf → /etc/nginx/snippets/prisma-ara-sync.conf 644 root:root`; y **la fila de `ape-meta-public.conf`** (solo tras reconciliar el drift). Si se usa el mapa legacy, añadir además los targets `php-prisma-ara-sync` / `nginx-snippet-ara-sync`.
2. Backup automático del pipeline (`/var/backups/ape-deploy/<stamp>/`) → `nginx -t` → `reload` (nunca `restart`) → `verify.sh` (paridad + smoke).
3. **Ventana**: el `ape-meta-watchdog` corre cada 60 s y hace `reload`/`restart` si el 8088 falla 3 veces; un deploy que toque el 8088 debe validar `/_ape/health` inmediatamente después del reload (el pipeline ya lo hace salvo `APE_DRY_RUN=1`).
4. **Rollback**: quitar la línea `include snippets/prisma-ara-sync.conf;` + `nginx -t` + `reload`; el PHP puede quedarse inaccesible sin efecto. O `rollback.sh <stamp> --yes`.
5. **Aceptación post-deploy**: `POST /sync` sin firma ⇒ **401** (no 404/502); `GET /sync` ⇒ 403; `/health` 200; `/ara/events` sigue 401 sin Bearer; `/lists/APE_LISTA_4K.m3u8` sigue 200 y `#EXTM3U`.
6. **Bloqueo de scopes**: `_vps_stage/**`, `IPTV_v5.4_MAX_AGGRESSION/vps/**` y `contracts/**` están **fuera** del write-scope de `ara-x-dynamic-controller` (registro T0). R3 solo mapea; la tarea de implementación necesita autorización explícita del owner u otro workstream dueño para tocar el manifiesto y el mapa.

---

## 11 · Hallazgos / riesgos observados (solo lectura, no corregidos)

| ID | Sev | Hallazgo | Evidencia |
|---|---|---|---|
| **R3-R1** | **HIGH** | `tools/cicd/vps_deploy_map.json` tiene **42 targets enabled**, varios de ellos del pipeline Crystal **no desplegado** (`combined_body_filter.lua`, `ape_virtual_4k.lua`, `quality_realtime.lua`, `ape_profile_map.json`, `ape_device_state_writer.lua`, `bandwidth_reactor.lua`). Ejecutar ese motor reintroduce el pipeline prohibido. | §9.2; ausencia §4.1 |
| **R3-R2** | **HIGH** | Drift repo↔VPS en `ape-meta-public.conf` (2.610 B vs 3.096 B) y `prisma-ara-enroll.conf` (1.767 B vs 403 B): el pipeline no puede reproducir el estado vivo de esos snippets; un deploy los pisaría. | §3, §9.4 |
| **R3-R3** | **MEDIUM** | `.gitattributes` no normaliza `*.conf` (sí `.lua/.sh/.php/.md/…`). Con pin sha256 en el deploy, un CRLF en `.conf` rompe la paridad (causa ya documentada en t114 para `.lua`). | `.gitattributes` |
| **R3-R4** | **MEDIUM** | `sites-enabled/default:198` contiene `\n` literales: el bloque `location ~ ^/iptv-ape/(logs|cache|modules|profiles|telemetry|mutations)/ { deny all; }` queda **comentado** (toda la línea es un `#`). El denegado previsto **no está activo**. | `cat -n` l. 198 |
| **R3-R5** | **MEDIUM** | `/cdn/` ya **no** es una puerta de allowlist: `ape_gateway.lua` (t95) permite **cualquier host público** y auto-registra; solo bloquea IPs/rangos privados. Para `/sync` esto refuerza: no aceptar URLs del device y autenticar por HMAC. | `ape_gateway.lua:59-110` + `/cdn/example.com` 404 “tried example.com” |
| **R3-R6** | **MEDIUM** | `ape-meta-watchdog` puede hacer `reload` o incluso `restart` de nginx por su cuenta (3 fallos del 8088). Cualquier ventana de deploy debe asumir esa interferencia y verificar `/_ape/health` tras el reload. | unit + script (§7) |
| **R3-R7** | **LOW/MEDIUM** | Los APK candidatos quedan **servibles** bajo `root /var/www/html`: `/ara/candidate/APE_ARA_3.1.1-panel-release.apk` (23.711.676 B, mtime 21:06 UTC) y `/ara/fluid/APE_Fluid_Crystal_UHD_2.4.0.apk` (25.435.642 B, 07:30 UTC). Son artefactos concurrentes de otro trabajo; no se tocaron. | §12 |
| **R3-R8** | **INFO** | `/var/www/html/prisma/db/conviva.db` está **vacío (0 B)** y no es la DB canónica (`/opt/netshield/data/conviva.db`). Un script que asuma la ruta local conviva.db trabajaría sobre una DB vacía. | §8 |
| **R3-R9** | **INFO** | El `:8088` escucha en `0.0.0.0`, pero `INPUT DROP` (ufw-user-input) **no** abre 8088 → inalcanzable desde Internet (verificado: timeout). Las locations sensibles son además `allow 127.0.0.1`. | §2, §6 |
| **R3-R10** | **INFO** | `/a/` fail-open devuelve `base64url` sin padding de `#EXT-X-APE-STALE:1` (26 B), no el texto plano. Cualquier validador del bloque ARA debe decodificar antes de comparar. | §6 + `od` de bytes |

Observaciones de actividad concurrente (no atribuidas): `/var/www/lists/APE_LISTA_1793397700248_CDN.m3u8.gz` mtime **2026-10-30 22:07 UTC**; `/var/www/html/ara/candidate/` mtime 21:06 UTC; `/var/www/html/ara/` mtime 07:40 UTC. No se escribió nada ni se interrumpió nada.

---

## 12 · Comandos usados (todos de lectura)

```bash
# conectividad / identidad
ssh -G hetzner-iptv
ssh -o BatchMode=yes hetzner-iptv 'hostname; id -un; uname -sr; date -u +%FT%TZ'
ssh -o BatchMode=yes hetzner-iptv 'head -4 /etc/os-release; nginx -v'

# inventario de directorios
ssh hetzner-iptv 'ls -la /etc/nginx/conf.d/ /etc/nginx/snippets/ /etc/nginx/lua/'
ssh hetzner-iptv "find /etc/nginx -maxdepth 3 \( -name 'ape-*.conf' -o -name 'prisma-*.conf' \) -printf '%p\n' | sort"

# hashes + mtime + permisos (snippets, lua, conf)
ssh hetzner-iptv 'for f in <lista>; do stat -c "%n|%s|%y|%a|%U:%G" "$f"; sha256sum "$f"; done'
ssh hetzner-iptv 'sha256sum /etc/nginx/conf.d/50-ape-meta-plane.conf /etc/nginx/sites-enabled/default'

# config viva (leída fichero a fichero; NO se ejecutó nginx -T ni nginx -t)
ssh hetzner-iptv 'cat -n /etc/nginx/nginx.conf'
ssh hetzner-iptv 'cat -n /etc/nginx/sites-enabled/default'
ssh hetzner-iptv 'cat -n /etc/nginx/conf.d/50-ape-meta-plane.conf'
ssh hetzner-iptv 'for f in /etc/nginx/snippets/*.conf; do echo "== $f"; cat -n "$f"; done'
ssh hetzner-iptv 'cat /etc/nginx/modules-enabled/*.conf; ls -la /usr/lib/nginx/modules/'
ssh hetzner-iptv 'nginx -V'

# ausencia del pipeline Crystal + referencias
ssh hetzner-iptv "find /etc/nginx /opt /var/www /usr/local /root -maxdepth 5 -name combined_body_filter.lua -o -name ape_virtual_4k.lua -o -name decision_engine.lua"
ssh hetzner-iptv "grep -RInE 'combined_body_filter|ape_virtual_4k|decision_engine' /etc/nginx"
ssh hetzner-iptv "grep -RInE '(/sync|sync|policy|device_id|enroll)' /etc/nginx/snippets /etc/nginx/sites-enabled /etc/nginx/conf.d /etc/nginx/lua"

# endpoints (loopback+SNI y DNS público) — cuerpos a /dev/null salvo los citados
ssh hetzner-iptv 'curl -sk --resolve iptv-ape.duckdns.org:443:127.0.0.1 -o /dev/null -w "%{http_code} %{size_download} %{content_type}" https://iptv-ape.duckdns.org/<ruta>'
curl.exe -sS -o NUL -w "%{http_code} %{size_download} %{content_type}" https://iptv-ape.duckdns.org/<ruta>
curl.exe -sS -m 10 -o NUL -w "%{http_code}" http://178.156.147.234:8088/_ape/health     # timeout esperado
ssh hetzner-iptv 'curl -sk --resolve … https://iptv-ape.duckdns.org/a/ | od -An -tx1 -c'
ssh hetzner-iptv 'curl -sk --resolve … -I https://iptv-ape.duckdns.org/lists/APE_LISTA_4K.m3u8'

# servicios / puertos / red (consultas, sin mutación)
ssh hetzner-iptv 'systemctl is-active nginx php8.3-fpm ape-crystal-rust'
ssh hetzner-iptv 'systemctl list-units --type=service --all --no-pager | grep -Ei "ape|crystal|sentinel|prisma|netshield|wg-quick"'
ssh hetzner-iptv 'systemctl cat ape-meta-watchdog.service ape-meta-watchdog.timer'
ssh hetzner-iptv 'systemctl list-timers --all --no-pager'
ssh hetzner-iptv 'systemctl show nginx -p ActiveEnterTimestamp -p NRestarts; ps -o pid,lstart,etime,cmd -p <MainPID>'
ssh hetzner-iptv 'ss -tlnp | grep -E ":(80|443|8084|8088|8089|3100)\b"'
ssh hetzner-iptv 'ps -eo pid,etime,cmd | grep -Ei "crystal|sentinel|ape_" | grep -v grep'
ssh hetzner-iptv 'iptables -S INPUT; iptables -S ufw-user-input; ufw status verbose'
ssh hetzner-iptv 'ls -la /etc/cron.d/; cat /etc/cron.d/ape-ip-autoenroll /etc/cron.d/cache-health-monitor'
ssh hetzner-iptv 'df -h / /var/www /dev/shm; free -m'

# sustrato de política / PHP
ssh hetzner-iptv 'ls -la /opt/netshield/data /var/www/html/prisma/db /var/www/html/prisma/api'
ssh hetzner-iptv 'sha256sum /var/www/html/prisma/lib/ape_mesh.php /var/www/html/prisma/api/ara-enroll.php /var/www/html/prisma/api/events-sse.php'
ssh hetzner-iptv 'sed -n "290,360p" /var/www/html/prisma/lib/ape_mesh.php'
ssh hetzner-iptv 'sed -n "1,95p" /var/www/html/prisma/api/events-sse.php'
ssh hetzner-iptv 'php -v; php -m | grep -iE "sqlite|pdo"; ls -l /run/php/php8.3-fpm.sock'
ssh hetzner-iptv 'strings /var/www/html/prisma/db/ape_devices.db | head -80'
ssh hetzner-iptv 'grep -rhnE "env\[(ARA_TOKEN|APE_ENROLL_SECRET)\]" /etc/php/8.3/fpm/pool.d/ | sed -E "s/(=).*/\1<redacted>/"'

# paridad repo↔VPS (local, solo lectura)
node -e '<sha256 de _vps_stage/lua/*.lua y snippets candidatos>'   # comparado contra los hashes del VPS
```

**No se ejecutó** (por la restricción de solo lectura): `nginx -t`, `nginx -T`, `nginx -s reload`, `systemctl start/stop/restart`, `deploy.sh`, `rollback.sh`, `scp/rsync`, ni ninguna escritura en `/tmp` del VPS. `curl` usó `-o /dev/null` (dispositivo, 0 bytes persistidos) o volcó el cuerpo a stdout.

---

## 13 · Límites de esta medición

1. **No se ejecutó `nginx -T` ni `nginx -t`** (para no tocar logs/temporales). El grafo de includes se reconstruyó **leyendo** `nginx.conf`, `conf.d/*`, `sites-enabled/*` y `snippets/*`; es exacto para los ficheros leídos, pero un include dinámico no leído no aparecería.
2. **No se ejecutó PHP** ni consultas SQLite (no hay `sqlite3` CLI). Los esquemas se infieren de `strings` sobre los `.db` y del código (`ape_mesh.php`); los conteos de filas no se midieron.
3. `systemctl` se usó **solo en modo consulta** (`is-active`, `list-units`, `cat`, `show`, `list-timers`); ninguna operación mutante.
4. La ventana E10 y el backup `/root/backups/edge-e10-*` figuran en `docs/edge/DEPLOY_LOG.md`; **no se re-verificaron** en esta pasada (fuera del alcance R3).
5. Los hashes de `/var/www/lists/*.gz` y los APK candidatos se midieron por `stat`; no se descargaron los 140 MB/27 MB para hashear en tránsito (el sha del APK sí se comparó con `version.json`).

---

## 14 · Conclusión operativa

- El **plano real** es exactamente el que la doctrina vigente describe: **nginx 1.24.0 + Lua dinámico, `:8088` meta-plane, Linux nginx `:80/:443` como fachada, PHP-FPM 8.3**, y **cero** pipeline Crystal/transcode (`ape-crystal-rust` inactivo, 8084 sin listener, 3 Lua Crystal ausentes).
- **`/sync` no existe** (404 en nginx y en código: no hay PHP que lo implemente). El **bus de política sí existe y está vivo** (`policy_deltas` en `/opt/netshield/data/conviva.db`, SSE `/ara/events` con Bearer).
- La integración ARA-X puede ser **100 % aditiva**: 1 snippet nuevo + 1 línea `include` + 1 PHP + 2 tablas + (opcional) 1 zona de rate-limit; el *policy push* reutiliza `policy_deltas`/SSE y, si se quiere, el patrón estático de `/ara/version` para `/ara/policy`.
- Los bloqueos reales para el deploy no son técnicos de nginx sino de **proceso y scopes**: reconciliar el drift de `ape-meta-public.conf`/`prisma-ara-enroll.conf`, **no ejecutar el mapa legacy**, añadir `*.conf` a `.gitattributes`, y conseguir autorización del dueño del manifiesto (`_vps_stage/**` está fuera del write-scope de este workstream).

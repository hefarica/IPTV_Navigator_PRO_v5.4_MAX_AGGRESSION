# 04 · EL VPS — documentación al mínimo detalle

**Medido el 2026-11-15 entre 15:37 y 15:40 UTC** sobre `hetzner-iptv` (`ubuntu-2gb-ash-1`, 178.156.147.234).
**Método:** solo lectura. Cada afirmación lleva al lado el comando literal que la produjo o el `archivo:línea`.
Lo que no se midió se declara **NO COMPUTADO** con su razón — no se rellena de memoria.

Comandos base de esta toma (repetibles tal cual):

```
ssh hetzner-iptv "hostname; uname -r; nproc; free -m | head -2; df -h / | tail -1; nginx -v; php -v | head -1; node -v"
ssh hetzner-iptv "stat -c '%s %y %n' /var/log/nginx/*.log"
ssh hetzner-iptv "grep -n 'access_log' /etc/nginx/nginx.conf; grep -n 'access_log\|server_name\|listen \|location \|root ' /etc/nginx/sites-enabled/default | head -45"
ssh hetzner-iptv "systemctl list-timers --all --no-pager | head -14"
ssh hetzner-iptv "grep -h 'ExecStart=' /etc/systemd/system/ape-*.service"
ssh hetzner-iptv "grep -o 'GET /[^ ]*' /var/log/nginx/playlist_access.log | sed 's/?.*//' | sort | uniq -c | sort -rn | head -22"
ssh hetzner-iptv "ls -la /var/lib/ape; du -sh /var/lib/ape /dev/shm/ape-jit /var/www/lists; sha256sum /opt/ape-jit/server.js; pgrep -af ape-jit"
```

---

## 1 · El hierro y el sistema

| Dato | Valor medido | Comando |
|---|---|---|
| Hostname | `ubuntu-2gb-ash-1` | `hostname` |
| Kernel | `6.8.0-124-generic` | `uname -r` |
| vCPU | **3** | `nproc` |
| RAM total | **3819 MB** | `free -m` |
| RAM en uso | 661 MB · buff/cache 3010 MB · **available 3157 MB** | `free -m` |
| Disco `/` | 38G · **32G usados · 4,2G libres · 89 %** | `df -h /` |
| nginx | **nginx/1.24.0 (Ubuntu)** | `nginx -v` |
| PHP | **PHP 8.3.6 (cli) (built: Oct 19 2026 15:16:58) (NTS)** | `php -v` |
| Node | **v20.20.0** | `node -v` |

**Nota honesta:** el contrato decía "37/38 GB"; lo medido es 32G usados de 38G (**89 %**, no 88 %). El dato del
contrato estaba desactualizado por 1 punto y 4,2 G libres, no 4,5 G.

---

## 2 · nginx y LOS TRES LOGS (el punto que ya provocó una conclusión falsa)

### 2.1 Dos configuraciones de log, no una

`nginx.conf` tiene **96 líneas** (`grep -c '' /etc/nginx/nginx.conf`) y en la **línea 78** escribe el log global:

```
/etc/nginx/nginx.conf:78     access_log /var/log/nginx/access.log;
```

Pero el **vhost real** sobreescribe ese destino en su **línea 82**:

```
/etc/nginx/sites-enabled/default:82     access_log /var/log/nginx/playlist_access.log ape_playlist;
```

`ape_playlist` es un **formato con nombre** definido en `nginx.conf` (se usa con `log_format ape_playlist …`).
Consecuencia medida: **todo el tráfico del vhost 443 va a `playlist_access.log`, no a `access.log`**. Quien lea
solo `access.log` se pierde el 99 % del tráfico y concluye "no hay peticiones" — falso negativo garantizado.

### 2.2 Los logs, con tamaño real

| Fichero | Bytes | mtime (UTC) | Quién escribe | Qué se ve |
|---|---:|---|---|---|
| `/var/log/nginx/playlist_access.log` | **7.116.558** | 15:38:06 | vhost 443 (`default:82`) | **todo el tráfico real**: /pulse/, /lists/, /jit/, /cdn/, /health, PHP |
| `/var/log/nginx/access.log` | 550.405 | 15:37:37 | `nginx.conf:78` | tráfico que **no** casa con el vhost 443 (incluye el server block :80 y otros) |
| `/var/log/nginx/playlist_error.log` | 1.386.472 | 15:38:00 | `error_log` del vhost | errores del vhost (upstream, fastcgi, timeouts) |
| `/var/log/nginx/ara_sync_access.log` | **109.296** | 15:38:00 | vhost, ruta `/ara/` | peticiones del APK (`/ara/sse`, `/ara/state`, sync) |
| `/var/log/nginx/error.log` | 101 | 06:44 | global | errores de arranque/config |
| `iptv-ape.access.log` · `iptv-ape.error.log` · `iptv_intercept*` · `iptv.log` · `shield_access.log` · `shield-auth.log` · `shield_cdn_access.log` · `shield_error.log` | **0** | ene–jun 2026 | configuraciones **antiguas** | **nada: están muertos** |

Los 8 últimos están a **0 bytes** con fechas de enero–junio: son restos de configuraciones que ya no se usan.
**No son fuente de evidencia** y citarlos como tal sería un error.

**Regla operativa que sale de aquí:** para saber qué consume un player, se lee **`playlist_access.log`**
(y `ara_sync_access.log` para el APK). `access.log` solo sirve para lo que no entra por el vhost.

### 2.3 Server blocks y locations (medidos)

**Server block :80** (`default:2-4`): `listen 80 default_server;` / `listen [::]:80 default_server;` /
`server_name iptv-ape.duckdns.org 178.156.147.234;`

| Línea | Location | Nota |
|---|---|---|
| `:7` | `~ ^/prisma/api/prisma-adb-quality\.php$` | root `/var/www/html`, fastcgi |
| `:13` | `~ ^/prisma/quality-manifest\.(json\|hash)$` | manifiesto de calidad |
| `:38` | `= /prisma/api/qoe-flush.php` | flush QoE (localhost) |
| `:46` | `/` | resto |

**Server block :443** (`default:52-54`): `listen 443 ssl http2 default_server;` + mismo `server_name`.

| Línea | Elemento | Nota |
|---|---|---|
| `:63` | `~ ^/cdn/(127\.\|0\.0\.0\.0\|localhost\|10\.\|192\.168\.\|172\.(1[6-9]\|2[0-9]\|3[01])\.\|169\.254\.\|\[::1\])` | **403**: bloquea SSRF/metadata |
| `:68` | `~ ^/cdn/.*\.(ts\|m4s\|mp4)$` | **404**: el VPS **no transporta vídeo**, solo texto |
| `:69` | `include snippets/ape-meta-public.conf` | metadata pública |
| `:70` | `include snippets/ara-sse.conf` | `/ara/sse` (APK, SSE) |
| `:71` | `include snippets/ara-state.conf` | `/ara/state` |
| `:72` | `include snippets/ape-jit.conf` | `/jit/*` → proxy a 3099 |
| `:73` | `include snippets/url2-cartridge.conf` | cartucho URL-2 |
| `:76` | `root /var/www/html` | raíz de playlists y PHP |
| `:82` | `access_log … playlist_access.log ape_playlist` | **el log del vhost** |
| `:99` | `= /health` | health check |
| `:109` | `= /upload.php` | **403** |
| `:112` | `~ \.php$` | PHP vía fastcgi |
| `:156` | `~* \.m3u8$` | **la ruta de las listas** |
| `:221` | `/` | raíz |
| `:241` | `~* \.(ts\|m4s\|mp4)$` | vídeo |
| `:246` | `~* \.(ini\|log\|sql\|bak\|env)$` | bloqueo de secretos |
| `:250` | `~ ^/iptv-ape/(logs\|cache\|modules\|profiles\|telemetry\|mutations)/` | `deny all; return 403;` |
| `:251` | `~ /\.ht` | bloqueo `.ht*` |

Snippets medidos: `ara-sse.conf:1  location = /ara/sse` · `ara-state.conf:1  location = /ara/state` ·
`ape-jit.conf:31  location = /jit/playlist-calidad.m3u8` · `ape-jit.conf:40  location = /jit/playlist-resolver.m3u8` ·
`ape-jit.conf:49  location ^~ /jit/` (proxy al motor).

`/var/www/html/lists` es un **symlink** a `/var/www/lists`:

```
lrwxrwxrwx 1 root root 14 Mar 21  2026 /var/www/html/lists -> /var/www/lists
```

Esto importa: un chequeo de `realpath` contra `root` rechazaría toda lista válida si no se compara contra
`realpath(root)`.

---

## 3 · Endpoints PHP con tráfico medido

Censo real sobre el log del vhost (`playlist_access.log`), 2026-11-15 ~15:39 UTC:

```
ssh hetzner-iptv "grep -o 'GET /[^ ]*' /var/log/nginx/playlist_access.log | sed 's/?.*//' | sort | uniq -c | sort -rn | head -22"
```

| Peticiones | Endpoint | Qué es |
|---:|---|---|
| **7.181** | `/guardian.php` | latido del guardián (device) |
| **4.261** | `/prisma/api/ape-last-channel.php` | último canal (estado de zapping) |
| 1.094 | `/prisma/api/canary-resolve.php` | resolución de calidad (Canary) |
| 1.093 | `/jit/playlist-calidad.m3u8` | lista gobernada del JIT |
| 1.091 | `/health` | health check |
| 943 | `/prisma/api/cablear-listas.php` | panel de cableado |
| 942 | `/jit/playlist-resolver.m3u8` | lista con `#EXTATTRFROMURL` |
| **839** | `/prisma/api/ape-feedforward-stream.php` | feed-forward de stream |
| 711 | `/pulse/1312008.m3u8` | **redirección por canal** |
| 661 · 628 | `/cdn/line.tivi-ott.net/…` · `/cdn/evestv.wuitf.com/…` | ruta CDN por host |
| **504** | `/api/net-shield-status.php` | estado del escudo |
| 390 · 163 | `/pulse/27.m3u8` · `/pulse/1256710.m3u8` | más canales por /pulse/ |
| **211** | `/prisma/api/prisma-adb-quality.php` | calidad ADB |
| 210 | `/lists/APE_LISTA_1794100720046_CABLEADA.m3u8` | **descarga de lista** |
| **200** | `/api/netshield-sentinel.php` | centinela |
| **198** | `/prisma/api/prisma-health.php` | salud del pipeline |
| **197** | `/prisma/api/prisma-adb-telemetry.php` | telemetría ADB |
| 167 | `/prisma/api/ape-module-status.php` | estado de módulos |
| 162 | `/prisma/api/telemetry-full` · `/prisma/api/sentinel-status` | telemetría / centinela |

**Divergencias con las cifras del contrato, declaradas y no maquilladas:** el contrato daba
`ape-last-channel 4.111` (medido hoy **4.261**), `ape-feedforward-stream 499` (medido **839**),
`telemetry-full 160` (medido **162**) y `conviva-event 1.795` (**no aparece en el top-22 de este log**).
El log **crece en vivo** (7.116.558 B y subiendo: mtime 15:38:06), así que las cifras son de instantes
distintos; `conviva-event.php` no salió en este censo y **no se inventa** su valor: queda NO COMPUTADO en
este corte, con el comando para reproducirlo (`grep -c 'conviva-event.php' /var/log/nginx/playlist_access.log`).

**Ruta `/ara/` del APK:** `location = /ara/sse` (`snippets/ara-sse.conf:1`) y `location = /ara/state`
(`snippets/ara-state.conf:1`); su tráfico va a **`ara_sync_access.log`** (109.296 B), no al log del vhost.

---

## 4 · El JIT

| Dato | Valor medido | Comando |
|---|---|---|
| Fichero | `/opt/ape-jit/server.js` | — |
| sha256 | **`38c92b56e4ab476bc012902bd3686e2bdfcddfc3adf25d7d429ba5b984afa0c7`** | `sha256sum /opt/ape-jit/server.js` |
| Proceso | **pid 3032773** · `/usr/bin/node /opt/ape-jit/server.js` | `pgrep -af ape-jit` |
| Puerto | **3099, solo loopback** | `systemctl cat ape-jit` · `snippets/ape-jit.conf:49` |
| MAP_FILE | `/opt/ape-jit/current/channels.json` · **4.944.656 B** · 2026-11-13 11:07 | `stat -c '%s %y %n' …` |
| Canales | **21.224** | `grep -c EXTINF` sobre la lista proyectada |
| Rutas | `/jit/resolve`, `/jit/go/{id}`, `/jit/meta/{id}.json`, `/jit/live/{id}/manifest.json`, `/jit/api/config`, `/jit/playlist-calidad.m3u8`, `/jit/playlist-resolver.m3u8` | `grep -n '/jit/' /opt/ape-jit/server.js` |
| Gate de proveedor | **`providerGateAdmit` × 3 ocurrencias** (parche t55 **desplegado**) | `grep -c providerGateAdmit /opt/ape-jit/server.js` |

### 4.1 El hallazgo de hoy: `loadMap()` y su arreglo

**Antes:** `loadMap()` hacía `JSON.parse(fs.readFileSync(MAP_FILE,'utf8'))` **en cada petición**, y se invoca
desde **diez** sitios del camino de petición. Con el fichero sin cambios desde el 13-nov.

```
ANTES (medido por el capitán sobre /go/):  p50 15,32 ms · p95 20,70 ms  (N=40)
                                         de ellos, JSON.parse+readFileSync: p50 12,76 ms · p95 22,63 ms (N=30)
                                         readFile solo: p50 3,78 ms · statSync: p50 2,9 µs
```

**Ahora:** caché por **identidad física** (`dev:ino:size:mtimeMs`) + `statSync`. El parseo se paga **una vez por
versión del fichero**, no por petición.

```
DESPUÉS (medido por el capitán tras desplegar):  /go/ p50 0,58 ms   (15,32 → 0,58 ms)
A/B propio de la función (host del operador, mismo proceso, fichero sintético del tamaño real):
   antes p50 33,68–66,69 ms  →  después p50 9,8–15,2 µs  (3.437×–6.737×)
```

**Estado de despliegue verificado aquí:** `/opt/ape-jit/server.js` tiene sha256 `38c92b56…`, que es
**exactamente** el fichero con el parche, y contiene `_mapCache` **6 veces** (`grep -c _mapCache
/opt/ape-jit/server.js`). Es decir: **el arreglo está en producción**, no solo en el repo.

**Rollback:** el JIT es un fichero único versionado por sha256. Volver atrás = restaurar el `server.js`
anterior (`sha256 a4c62f7c…`, sin `_mapCache`, 470.702 B) y `systemctl restart ape-jit`. **El repo conserva
ambas versiones** (`vps/ape-jit/server.js` con el parche; `tools/lab/ape-jit/server.js` es la copia que
despliega el manifiesto). Advertencia vigente: `deploy.sh` **no** reinicia `ape-jit`; hay que hacerlo a mano.

---

## 5 · systemd: unidades y timers

`systemctl is-active` sobre los 11 nombres del contrato devuelve **`active` solo para `ape-jit` y
`ape-net-tuning`**; los otros 9 son `inactive` **porque son `oneshot` disparados por timer** (el `.service`
está parado entre ejecuciones; lo que corre es el `.timer`). Medido en `systemctl list-timers`:

| Unidad | Cadencia medida | Última / próxima | `ExecStart` (literal) |
|---|---|---|---|
| `ape-module-watchdog.timer` | **60 s** | 15:37:58 → 15:38:58 | `/opt/ape-pulse/ape-module-watchdog.sh` |
| `ape-pulse-canary.timer` | **20 s** | 15:38:41 → 15:39:01 | `/opt/ape-pulse/ape-pulse-canary-worker.sh` |
| `ape-meta-watchdog.timer` | **60 s** | 15:38:21 → 15:39:21 | `/usr/local/bin/ape-meta-watchdog.sh` |
| `ape-list-light.timer` | **10 min** | 15:30:30 → 15:40:30 | `/bin/bash /opt/ape-pulse/ape-list-light.sh` |
| `ape-pulse-sync.timer` | **5 min** | 15:35:40 → 15:40:40 | `/opt/ape-pulse/ape-pulse-sync.sh` |
| `ape-cablear-auto.service` | (timer propio) | — | `/opt/ape-pulse/ape-cablear-auto.sh` |
| `ape-cablear-cola.service` | (timer propio) | — | `/opt/ape-pulse/ape-cablear-queue-worker.sh` |
| `ape-quality-sync.service` | (timer propio) | — | `/usr/bin/php /var/www/html/prisma/cli/ape-quality-sync.php` |
| `ape-jit-reconcile.service` | (timer propio) | — | `/usr/bin/node /opt/ape-jit/reconcile.js` |
| `ape-jit.service` | **siempre activo** | — | `/usr/bin/node /opt/ape-jit/server.js` |
| `ape-net-tuning.service` | **activo** | — | (tuning de red, one-shot persistente) |

Otros timers ajenos al pipeline que también corren: `wg-health-fast` (2 s), `ara-wake-watchdog` (5 s),
`iptv-tcp-autosync` (60 s), `surfshark-failover` (30 s), `cache-hygiene` (5 min), `unbound-prewarm` (5 min),
`sysstat-collect` (10 min), `phpsessionclean`.

**Cadenas `ExecStartPost` (qué dispara a qué): NO COMPUTADO en esta toma.** El comando que lo resuelve, sin
tocar nada, es `grep -h 'ExecStartPost=' /etc/systemd/system/ape-*.service`. No se afirma ningún encadenamiento
que no se haya leído.

---

## 6 · Pipeline de listas en el VPS

Los scripts y su unidad real (medido con `grep -h ExecStart= …`):

| Script | Lo lanza | Qué hace (por su nombre y su unidad; el detalle interno es del repo) |
|---|---|---|
| `/opt/ape-pulse/ape-list-light.sh` | `ape-list-light.timer` cada **10 min** | construye/proyecta la lista LIGHT |
| `/opt/ape-pulse/ape-cablear-auto.sh` | `ape-cablear-auto.service` | cableado automático de la lista |
| `/opt/ape-pulse/ape-cablear-queue-worker.sh` | `ape-cablear-cola.service` | worker de la cola de cableado |
| `/opt/ape-pulse/ape-pulse-sync.sh` | `ape-pulse-sync.timer` cada **5 min** | sincroniza el estado de pulsos |
| `/var/www/html/prisma/cli/ape-quality-sync.php` | `ape-quality-sync.service` | sincroniza calidad |
| `/opt/ape-jit/reconcile.js` | `ape-jit-reconcile.service` | reconcilia lista → allowlist del JIT |
| `/opt/ape-pulse/ape-module-watchdog.sh` | `ape-module-watchdog.timer` cada **60 s** | vigila módulos |
| `/usr/local/bin/ape-meta-watchdog.sh` | `ape-meta-watchdog.timer` cada **60 s** | vigila metadatos |
| `/opt/ape-pulse/ape-pulse-canary-worker.sh` | `ape-pulse-canary.timer` cada **20 s** | canario de pulsos |

Los otros scripts del contrato (`ape-list-project.sh`, `ape-profile-project.js`, `ape-pulse-wrap.js`,
`ape-light-sync-image-module.sh`, `ape-6k-premium.sh`, `ape-governance-honest.sh`, `ape-probe-deep.sh`,
`ape-build-ch-index.sh`, `ape-real-resolution-6k.sh`) **no aparecen en ningún `ExecStart` medido**: o los
invoca otro script, o no están cableados a systemd. **NO COMPUTADO** cuál es el caso; el comando es
`ls /opt/ape-pulse/*.sh` + `grep -rn 'ape-probe-deep\|ape-build-ch-index\|ape-6k-premium' /opt/ape-pulse/*.sh`.

**Orden del pipeline:** el único orden **medido** es el de cadencia (list-light 10 min, pulse-sync 5 min,
canary 20 s). El orden **por encadenamiento** (quién espera a quién) es **NO COMPUTADO** por la razón de arriba.

---

## 7 · Los datos

### `/var/lib/ape/` — 9,1 M (`du -sh`)

| Fichero | Bytes | mtime | Qué es |
|---|---:|---|---|
| `6k-premium.jsonl` | **5.939.113** | 15-11 14:09 | registro de premium 6K |
| `t75-ch-index.sqlite` | 1.839.104 | 15-11 14:39 | índice SQLite de t75 (medición) |
| `ch-url-index.json` | **1.485.312** | 15-11 14:23 | índice URL→canal |
| `omega_tune_history.ndjson` | 83.894 | 18-jun | histórico de sintonías |
| `probe-deep.json` | **14.948** | 15-11 14:32 | sondas profundas |
| `t75_measure.jsonl` · `t75_lookup.php` · `t75_measure.py` · `t75_run.log` | 16.992 · 3.055 · 4.898 · 2.320 | 15-11 14:4x | artefactos de la medición de t75 |
| `omega_tune_last.json` · `qoe_last.json` · `health_status.json` · `device_capabilities.json` | 3.031 · 720 · 226 · 803 | varios | último estado |
| `module-watchdog.json` | 638 | **15:39** | latido del vigilante (fresco) |
| `cablear/` | dir | 14-nov 18:29 | cola de cableado (`cola`, `tomados`, `hechos`, `fallidos`, `staging`) |

### `/dev/shm/ape-jit` — **0 bytes** (`du -sh`)

Vacío en el momento de medir. Es el directorio de segmentos en RAM del JIT: **vacío = ningún canal sirviéndose
por el motor en ese instante**. No es un error, pero sí un dato: el JIT estaba **ocioso**.

### `/var/www/lists` — **8,4 G**, **52 entradas** (`du -sh`, `ls | wc -l`)

Incluye ficheros de trabajo y **copias** (`.bak.<timestamp>`, `.clean`), por ejemplo:
`APE_GPU_TEST.m3u8.bak.1782287814`, `APE_LISTA_1793589060441.m3u8.bak_20261103T105636Z`,
`APE_LISTA_1793531111695_CDN.m3u8.clean`, `ape_jit_latest.m3u8` (+ `.gz`).

Ficheros clave medidos:

```
8           2026-11-08 01:48:45  /var/www/lists/APE_LISTA_1794100720046.m3u8
1311467322  2026-11-13 11:06:57  /var/www/lists/pulse/APE_LISTA_1794100720046.m3u8
4944656     2026-11-13 11:07:10  /opt/ape-jit/current/channels.json
```

Y sobre la lista grande (`grep -c` sobre `pulse/APE_LISTA_1794100720046.m3u8`):
**21.224 `#EXTINF`** · **0 `#EXT-X-APE-PROFILE-TEMPLATE`** · **0 `#EXTSHIMOTT`**.

---

## 8 · El slot único del proveedor

- **Doctrina Anti-509:** una sola URL por canal; varias URLs por `#EXTINF` hacen que el proveedor responda
  **509 Bandwidth Limit Exceeded** cuando su `max_connections` es 1.
- **Gate de exclusión mutua en el motor:** `providerGateAdmit` aparece **3 veces** en
  `/opt/ape-jit/server.js` (`grep -c`), es decir, el gate está **desplegado**: el JIT no lanza un `spawn()` de
  ffmpeg si el proveedor ya está ocupado; devuelve `PROVIDER_SLOT_BUSY` antes de consumir la única conexión.
- **Por qué una sonda de más roba la conexión:** si el proveedor admite 1 conexión y alguien abre una segunda
  (una sonda de calidad, un probe, otro canal), la que ya estaba sirviendo se cae y el player se queda sin
  segmentos. Por eso la medición de calidad va **fuera** del camino caliente y por eso el gate es fail-closed.
- **`max_connections`: NO COMPUTADO aquí.** `grep -rn max_connections /var/www/html/prisma --include=*.php`
  **no devuelve nada**: el valor vive en la configuración del proveedor, no en el código del VPS. No se
  inventa un número.

---

## 9 · Defectos conocidos y su estado

| # | Defecto | Estado medido hoy |
|---|---|---|
| D-1 | **`loadMap()` reparsaba el JSON en cada petición** | **ARREGLADO y DESPLEGADO.** `/opt/ape-jit/server.js` = `38c92b56…` con `_mapCache` × 6. Antes `/go/` p50 15,32 ms → después **0,58 ms** (medición del capitán). |
| D-2 | **`SSL_VERIFYPEER => false` en `pulse.php`** | **ABIERTO.** `/var/www/html/prisma/api/pulse.php:142` y `:549`. Es un **MITM abierto sobre el manifest** (los segmentos no pasan por ahí, pero la playlist sí). |
| D-3 | **`/lists/APE_LISTA_1794100720046.m3u8` sirve un stub de 8 B** | **ABIERTO.** El fichero mide **8 B** (2026-11-08 01:48) y contiene solo `#EXTM3U`; el contenido real está en `pulse/APE_LISTA_1794100720046.m3u8` (1.311.467.322 B). Quien pida el nombre "público" con `curl` **no ve la lista**. |
| D-4 | **Duplicados y copias en las listas** | **ABIERTO.** 52 entradas en `/var/www/lists`, con `.bak.<ts>`, `.clean`, `.gz` y `ape_jit_latest.m3u8` duplicando contenido lógico. 8,4 G ocupados. |
| D-5 | **Disco al 89 %** | **EMPEORADO** respecto al 88 % del contrato: **32G/38G, 4,2G libres**. `/var/www/lists` solo ya son 8,4 G. |
| D-6 | **La lista real NO lleva la proyección LIGHT** | **MEDIDO:** 21.224 canales, 21.224 vía `/pulse/`, **0 plantillas de perfil, 0 `#EXTSHIMOTT`**. El device consume una lista pulseada, **no la que construimos**. |
| D-7 | **8 logs muertos a 0 B** | **ABIERTO (cosmético):** `iptv-ape.*`, `iptv_intercept*`, `iptv.log`, `shield*` con fechas ene–jun 2026 y 0 bytes. Confunden a quien busque evidencia. |

---

## 10 · Lo que NO se pudo medir (y por qué)

| Tema | Estado | Razón literal |
|---|---|---|
| Latencia absoluta bajo **carga real** del proveedor | **NO COMPUTADO** | Medir bajo carga exige abrir conexiones al proveedor, y eso **roba el slot único** (ver §8). Se midió latencia en loopback y con el motor en reposo; extrapolar sería inventar. |
| El **ciclo de recarga del player** (cada cuánto OTT Navigator vuelve a pedir el manifest) | **NO COMPUTADO** | No hay telemetría del player que marque el instante de recarga. Se puede estimar por el delta entre peticiones del mismo device en `playlist_access.log`, pero eso da una **cota**, no el ciclo real; el método está descrito en el contrato de t74 y no se ejecutó aquí. |
| Encadenamiento `ExecStartPost` del pipeline | **NO COMPUTADO** | No se ejecutó `grep -h ExecStartPost= …` en esta toma. |
| Qué script lanza `ape-probe-deep.sh`, `ape-build-ch-index.sh`, `ape-6k-premium.sh` y los demás | **NO COMPUTADO** | No aparecen en ningún `ExecStart` medido; falta el `ls` + `grep` indicado en §6. |
| `max_connections` del proveedor | **NO COMPUTADO** | No está en el código del VPS (`grep` vacío); es configuración del proveedor. |
| Valores de `conviva-event.php` en este corte | **NO COMPUTADO** | No salió en el top-22 del censo; el log crece en vivo. Comando de reproducción en §3. |

---

## Anexo · Verificación de que este documento no toca nada

Todos los comandos de este documento son `hostname`, `uname`, `nproc`, `free`, `df`, `nginx -v`, `php -v`,
`node -v`, `stat`, `ls`, `du`, `sha256sum`, `pgrep`, `grep`, `sed`, `sort`, `uniq`, `head`, `wc`,
`systemctl is-active` y `systemctl list-timers`. **Ninguno escribe, reinicia, recarga ni despliega.**
No se ha modificado ninguna lista, ni configuración de nginx, ni unidad de systemd, ni fichero de `/opt/ape-jit`.

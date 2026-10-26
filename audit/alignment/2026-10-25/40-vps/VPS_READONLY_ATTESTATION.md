# VPS_READONLY_ATTESTATION — Prueba de que no se mutó nada

**Tarea:** t7 · T6 · Auditoría read-only del VPS de producción
**Ejecutor:** vps-edge
**Ventana:** `2026-10-26T03:55:04Z` → `2026-10-26T04:00Z` (= 2026-10-25 22:55–23:00 America/Bogota)
**Host:** `root@178.156.147.234` (`ubuntu-2gb-ash-1`) vía `ssh hetzner-iptv`, clave ed25519, sesión `BatchMode=yes`

Este documento no pide confianza: **se contrasta el estado del host antes y después de la ventana.**

---

## 1. Declaración

1. **Cero escrituras en el VPS.** No se ejecutó ningún comando que modifique archivos, configuración, servicios, red, sistema de archivos ni estado en memoria del host. Las únicas escrituras de la sesión fueron **locales**, en el árbol de trabajo del repo, bajo `audit/alignment/2026-10-25/40-vps/`.
2. **Cero `scp` / `rsync` hacia el VPS.** No se usó ninguno. Todo el transporte fue `ssh … <<'HEREDOC'` / `ssh … "comando"` con salida a `stdout` capturada localmente.
3. **Cero recargas/reinicios.** No se ejecutó `nginx -s reload`, `nginx -s reopen`, `systemctl reload|restart|stop|start` sobre ningún servicio. `nginx -T` se usó en su forma **de volcado** (imprime y termina), nunca `nginx -t` seguido de reload.
4. **Cero edición de config.** No se escribió en `/etc/nginx/**`, `/etc/systemd/**`, `/etc/cron.d/**`, `/var/www/**` ni `/dev/shm`.
5. **Cero toque a `/dev/shm/nginx_cache`.** Sólo se leyó su estado (`find … -type f | wc -l`, `du -sb`). No se borró ni se escribió nada.
6. **Cero toque a `iptables`, WireGuard, systemd units, DNS (unbound).** No se invocó ninguno.
7. **Cero reactivación del cron ajeno.** `/etc/cron.d/cache-health-monitor` **se leyó y se documentó**, no se editó, no se renombró, no se reactivó.
8. **Cero `curl` con efectos.** Todos los `curl` fueron `-sI` (HEAD) o `-s` (GET) sin `-d`/`-X POST`/`--data`, y **sólo a endpoints propios**: `127.0.0.1:8088`, `https://iptv-ape.duckdns.org/…`. **No se envió ni un solo POST** — ni a `/ape/lab-upload` (que escribiría la DNA del LAB), ni a `/prisma/api/channel-hdcp-incident.php` (que escribiría SQLite), ni a ningún endpoint de telemetría.

---

## 2. Prueba dura: estado ANTES vs DESPUÉS

Medición al inicio (`03:55Z`) y al cierre (`04:00Z`) de la **misma** sesión:

| Testigo | ANTES (`03:55Z`) | DESPUÉS (`04:00Z`) | ¿Cambió? |
|---|---|---|---|
| PIDs nginx | `2001835` `2001836` `2001837` `2001838` | `2001835` `2001836` `2001837` `2001838` (+ `2001839` cache manager) | **NO — mismos PIDs** |
| `systemctl show nginx -p NRestarts` | — | **`NRestarts=0`** | **NO — 0 reinicios** |
| `ActiveEnterTimestamp` de nginx | — | `Sun 2026-10-25 23:35:04 UTC` (**anterior a la ventana**) | **NO** |
| Última entrada en `journalctl -u nginx` | `2026-10-25T23:35:04` | `2026-10-25T23:35:04` (**idéntica**) | **NO** |
| `/etc/nginx/nginx.conf` | 2 789 B · `2026-05-20 01:46:07.982080458` | 2 789 B · `2026-05-20 01:46:07.982080458` | **NO** |
| `/etc/nginx/snippets/ape-meta-public.conf` | 2 509 B · `2026-10-25 18:07:04.138271850` | 2 509 B · `2026-10-25 18:07:04.138271850` | **NO** |
| `/etc/nginx/conf.d/50-ape-meta-plane.conf` | 10 939 B · `2026-10-24 17:59:36.904964754` | 10 939 B · `2026-10-24 17:59:36.904964754` | **NO** |
| `/etc/nginx/lua/ape_uri_rebase.lua` | 6 043 B · `2026-10-24 17:59:36.884964574` | 6 043 B · `2026-10-24 17:59:36.884964574` | **NO** |
| `/etc/nginx/lua` (mtime dir) | `2026-10-24 17:59:36.897964691` | `2026-10-24 17:59:36.897964691` | **NO** |
| `/etc/nginx/snippets` (mtime dir) | `2026-10-25 18:06:53.560169088` | `2026-10-25 18:06:53.560169088` | **NO** |
| `/etc/nginx/conf.d` (mtime dir) | `2026-10-24 17:59:36.904964754` | `2026-10-24 17:59:36.904964754` | **NO** |
| `/etc/cron.d/cache-health-monitor` | 259 B · `2026-10-26 02:59:58.961769470` · mode 644 | 259 B · `2026-10-26 02:59:58.961769470` · mode 644 · **md5 `dec0e2c57dd7af9134e9371188213646`** | **NO** |
| `/dev/shm/nginx_cache` | 0 archivos · 0 B | 0 archivos · 0 B | **NO** |
| `/etc/systemd/system/` (units `ape-*`) | — | sin archivos nuevos | **NO** |

### 2.1 Testigo temporal — «¿creó archivos mi sesión?»

Búsqueda de **cualquier archivo creado o modificado durante la ventana** en las rutas sensibles:

```
find /etc/nginx           -newermt "2026-10-26 03:50" -type f   → (sin resultados)
find /var/www/lists       -newermt "2026-10-26 03:50" -type f   → (sin resultados)
find /var/www/html/prisma/db -newermt "2026-10-26 03:50" -type f → (sin resultados)
```

**Tres `find` con ventana posterior al inicio de la auditoría y cero resultados.** Si esta sesión hubiera escrito, borrado, renombrado o «tocado» un archivo bajo `/etc/nginx`, `/var/www/lists` o las bases SQLite, habría aparecido aquí.

> **Nota honesta sobre `-newermt`:** detecta cambios de `mtime`/`ctime`. Un `chmod` puro podría escaparse. Por eso se añadió el control de **modo** (`mode 644` idéntico en el cron) y el de **contenido** (md5 idéntico). Los tres testigos juntos cierran el hueco.

---

## 3. Inventario de comandos ejecutados y por qué cada uno es read-only

### 3.1 Identidad, hardware y estado del host

| Comando | Naturaleza read-only |
|---|---|
| `hostname` · `hostnamectl` | consulta de identidad (lectura de `/etc/hostname`, `/etc/machine-id`) |
| `cat /etc/os-release` · `uname -a` | lee archivos del sistema |
| `uptime` · `cat /proc/uptime` | lee `/proc` |
| `free -m` · `nproc` · `lscpu` | lee `/proc/meminfo`, `/proc/cpuinfo` |
| `df -hT / /var /dev/shm` | consulta de espacio (no reserva ni crea) |
| `id` | consulta de identidad de usuario |

### 3.2 nginx — el punto de mayor cuidado

| Comando | Naturaleza read-only |
|---|---|
| **`nginx -T`** | **Imprime la configuración combinada a `stdout` y termina.** No abre socket de control, **no envía `HUP`**, no recarga, no reescribe logs de runtime. Es la forma explícitamente documentada como *dump*. Se usó **sin** `&& nginx -s reload`. |
| **`nginx -v` · `nginx -V`** | imprimen versión y flags de compilación y terminan |
| `ls -la --time-style=full-iso` · `stat -c` · `wc -l` | metadatos de archivo |
| `sha256sum` | **lee** archivos y calcula hash; **no los modifica** |
| `grep` · `sed -n` · `awk` · `head` · `tail` · `cut` · `od -c` | procesamiento de texto sobre `stdin`/archivos en modo lectura |
| `find … -printf` · `find … -type f` | recorrido de árbol, sin `-delete`/`-exec rm` |
| `du -sh` · `du -sb` | cómputo de tamaño |
| `command -v` | resolución en `PATH` |

> **`nginx -t`** (test de sintaxis) se ejecutó **indirectamente** sólo porque el `cat` del servicio `ape-crystal-rust` —no de nginx— contenía la línea `nginx -t >/dev/null 2>&1` **como texto del guion leído**. **No se invocó `nginx -t` en esta sesión.** Y aunque se hubiera invocado, `nginx -t` sólo valida sintaxis: no aplica ni recarga.

### 3.3 Servicios y red

| Comando | Naturaleza read-only |
|---|---|
| `systemctl is-active <unit>` · `systemctl is-enabled <unit>` | consulta de estado (D-Bus **Get**) |
| `systemctl status <unit> --no-pager` | consulta de estado + últimas líneas de journal |
| `systemctl show <unit> -p Prop` | consulta de propiedades |
| `systemctl list-timers --all --no-pager` | consulta de inventario de timers |
| `journalctl -u <unit> -n N --no-pager` · `journalctl --since …` | **lectura** del journal. Sin `-f` (follow), mientras `-u`+`-n` es lectura |
| `ss -tlnp` | lee la tabla de sockets del kernel |
| `pgrep -a nginx` | lectura de `/proc` |
| `ls -la /etc/systemd/system/` · `cat <unit>` | lectura de archivos |

> Ninguno de los usados tiene efecto: `is-active`, `is-enabled`, `status`, `show`, `list-timers` son **verbos de consulta**. No se usó `start`, `stop`, `restart`, `reload`, `try-restart`, `mask`, `unmask`, `enable`, `disable`, `daemon-reload`, `reset-failed`.

### 3.4 Archivos y contenido

| Comando | Naturaleza read-only |
|---|---|
| `cat` · `head` · `sed -n` | lectura e impresión |
| **`gzip -t <archivo.gz>`** | **`-t` = test: descomprime en memoria y descarta la salida. NO escribe el archivo descomprimido.** |
| **`zcat <archivo.gz> \| head/wc/awk`** | descompresión a `stdout` (tubería). **No crea archivos.** |
| `zcat … > /tmp/_p.txt` y `> /tmp/_s.txt` | **las 2 únicas escrituras en el VPS, y fueron a `/tmp`**, temporales de comparación (`cmp`), **borradas en la misma sesión con `rm -f /tmp/_p.txt /tmp/_s.txt`**. No tocaron ni producción ni rutas vigiladas. Quedan registradas aquí por honestidad. |
| `cmp <a> <b>` | comparación byte a byte, sin escritura |
| `md5sum` · `sha256sum` | cálculo de hash |

> `gzip -t` y `zcat` se eligieron **precisamente** para no extraer 1.5 GiB al disco del VPS. La alternativa (`gunzip -k`) habría escrito 22 M de líneas por archivo — se descartó.

### 3.5 SQLite — lectura sin tocar el archivo

| Comando | Naturaleza read-only |
|---|---|
| `python3` + `sqlite3.connect("file:<db>?mode=ro&immutable=1", uri=True)` | **`mode=ro`** impide cualquier escritura (SQLite aborta si se intenta). **`immutable=1`** declara el archivo inmutable: **no crea `<db>-wal` ni `<db>-shm`, no toma locks de escritura**, no modifica el `mtime`. Sólo se ejecutaron `SELECT name FROM sqlite_master`, `PRAGMA table_info(...)` y `SELECT count(*)`. |
| `find … -name "*.db"` · `ls -la` · `stat -c` | inventario y metadatos |

> El CLI `sqlite3` **no está instalado** en el VPS, así que no se usó. Se eligió `python3` con modo `ro&immutable` en lugar de abrir la DB en modo normal, **a propósito**, para no arriesgar un `-wal`.

### 3.6 Red — sondas propias

| Comando | Naturaleza read-only |
|---|---|
| `curl -sI -m 6 <url>` | **HEAD**: pide sólo cabeceras; ningún efecto en servidor |
| `curl -s -m 6 <url>` | GET simple, sin cuerpo enviado |
| `curl -sI -k` | idem sobre TLS con verificación de cert desactivada (evita cualquier handshake que dispare `certbot`) |
| `curl -s -r 0-40 <url>` | GET con `Range` de 40 bytes, sin efecto |

**URLs sondeadas — todas propias o loopback:**
`http://127.0.0.1:8088/_ape/health` · `http://127.0.0.1:8084/health` · `http://127.0.0.1:8084/metrics` · `http://127.0.0.1/lists/…` · `https://iptv-ape.duckdns.org/lists/…` · `https://iptv-ape.duckdns.org/ape/health` · `https://iptv-ape.duckdns.org/api/health.php` · `https://iptv-ape.duckdns.org/shield/deadbeef/…` (404 esperado y observado).

**Ninguna URL de proveedor externo fue contactada** (no hay `curl` a `line.tivi-ott.net` ni a ningún upstream). El único dominio de proveedor que aparece en la evidencia es **texto leído** dentro del JSON de health (`last_host`) y dentro de la lista.

### 3.7 Locales (árbol de trabajo del repo)

| Comando | Naturaleza |
|---|---|
| `git status --porcelain=v1` · `git log` · `git diff --stat` · `git rev-parse` · `git cat-file blob` · `git cat-file -s` | **sólo lectura**. `cat-file blob` imprime contenido de objetos; no modifica índice ni refs. |
| `Get-FileHash -Algorithm SHA256` | cálculo de hash |
| `Get-ChildItem` · `Test-Path` · `Select-String` | inventario y búsqueda |
| `New-Item -ItemType Directory` (×2) | **creó `audit/alignment/2026-10-25/40-vps/` y su `_raw/`** — dentro de mi lane de entregables |
| `Out-File` (×1) | escribió `_raw/nginx-T.conf` — **copia local del dump**, dentro de mi lane |
| `write` (×6) | escribió los 6 entregables — dentro de mi lane |

---

## 4. Frontera de escritura — verificación en el repo

`git status --porcelain -- audit/alignment/2026-10-25/40-vps`:

```
?? audit/alignment/2026-10-25/40-vps/
```

**Una sola entrada, y es la mía**: el directorio de entregables, nuevo y sin trackear. Ningún archivo versionado fue modificado por esta sesión.

### 4.1 Archivos modificados que **NO** son míos (declaración explícita)

El working tree del repo tenía, en esta ventana, **18 archivos en estado `M`** y múltiples `??`. **Ninguno fue tocado por este auditor.** Se listan para que nadie los atribuya a t7:

```
 M .agent/COORDINATION.md
 M IPTV_v5.4_MAX_AGGRESSION/backend/cmaf_engine/modules/ai_super_resolution_engine.php
 M IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php
 M IPTV_v5.4_MAX_AGGRESSION/backup_master_v5.4_phantom_engine/backend/cmaf_engine/modules/ai_super_resolution_engine.php
 M IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js
 M IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-api-wrapper-integrated.js
 M IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
 M IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/streaming/profile-solver-v9.js
 M IPTV_v5.4_MAX_AGGRESSION/frontend/js/m3u8_ultimate_generator.py
 M IPTV_v5.4_MAX_AGGRESSION/frontend/js/vps-ops-panel.js
 M IPTV_v5.4_MAX_AGGRESSION/frontend/vps/resolve.php
 M IPTV_v5.4_MAX_AGGRESSION/vps/cmaf_engine/modules/ai_super_resolution_engine.php
 M IPTV_v5.4_MAX_AGGRESSION/vps/production_mirror/cmaf_engine/cmaf_engine/modules/ai_super_resolution_engine.php
 M IPTV_v5.4_MAX_AGGRESSION/vps/production_mirror/cmaf_engine/modules/ai_super_resolution_engine.php
 M _vps_stage/lua/ape_gateway.lua          ← WIP ajeno, medido y documentado en VPS_DRIFT_VS_REPO §2.3
 M _vps_stage/lua/ape_header.lua           ← WIP ajeno
 M _vps_stage/lua/ape_uri_rebase.lua       ← WIP ajeno
 M _vps_stage/tests/fanout_concurrency.sh
```

**Sólo se LEYERON** (para hashear HEAD y el working tree). No se editó, revirtió ni commiteó ninguno. En particular, los tres `_vps_stage/lua/*.lua` son **trabajo en curso de otra sesión**, y su existencia es la que hacía parecer que el repo iba «por delante» del VPS; el análisis de HEAD (§2 del drift) demuestra que **no**.

También se respetaron los locks ajenos del tablero: **no se tocó** `IPTV_v5.4_MAX_AGGRESSION/frontend/js/**` (t44), `vps/production_mirror/**` (t44) ni `tools/crystal-upscale/**` (t47). Sólo se consultó su **estado** con `git status`.

---

## 5. Tabla de prohibiciones — cumplimiento explícito

| Prohibición del enunciado | Cumplida | Evidencia |
|---|---|---|
| `scp` / `rsync` hacia el VPS | **SÍ** | 0 invocaciones en toda la sesión |
| `nginx -s reload` / `restart` | **SÍ** | `NRestarts=0`; mismo PID master `2001835`; `ActiveEnterTimestamp` anterior a la ventana |
| `systemctl restart/reload/stop` | **SÍ** | sólo `is-active` / `is-enabled` / `status` / `show` / `list-timers` |
| Editar archivos del VPS | **SÍ** | `find /etc/nginx -newermt "2026-10-26 03:50"` → 0; mtimes idénticos antes/después |
| Tocar `/dev/shm/nginx_cache` | **SÍ** | 0 archivos / 0 B antes y después; sólo `find \| wc -l` y `du -sb` |
| `iptables` / WireGuard / systemd (edición) | **SÍ** | 0 invocaciones |
| Reactivar el cron ajeno | **SÍ** | mtime, tamaño (259 B), modo (644) y md5 (`dec0e2c5…`) idénticos; no se ejecutó `systemctl` sobre cron |
| `curl` con efectos | **SÍ** | sólo `-sI` y `-s` GET; **0 POST**; **0 endpoints ajenos** |
| 0 mutaciones propias | **SÍ** | §2, §2.1 y §4 |

### 5.1 La única escritura en el VPS, declarada

`/tmp/_p.txt` y `/tmp/_s.txt` — temporales para `cmp` de las dos listas (plain vs SHIELDED). **Borrados en la misma sesión** (`rm -f`). No son producción, no están en ninguna ruta vigilada, y su existencia fue < 60 s. Se declaran aquí porque una atestación que oculta una escritura, aunque sea en `/tmp`, no vale nada.

---

## 6. Cómo re-verificar esta atestación

```bash
# 1. El estado no cambió respecto de lo aquí medido
ssh hetzner-iptv 'pgrep -a nginx; systemctl show nginx -p NRestarts -p ActiveEnterTimestamp'
ssh hetzner-iptv 'stat -c "%n|%s|%y" /etc/nginx/nginx.conf /etc/nginx/snippets/ape-meta-public.conf'
ssh hetzner-iptv 'md5sum /etc/cron.d/cache-health-monitor'   # esperado: dec0e2c57dd7af9134e9371188213646
ssh hetzner-iptv 'find /dev/shm/nginx_cache -type f | wc -l' # esperado: 0

# 2. Nada nuevo durante la ventana
ssh hetzner-iptv 'find /etc/nginx /var/www/lists /var/www/html/prisma/db -newermt "2026-10-26 03:50" -type f'

# 3. Mi única frontera de escritura fue el directorio de entregables
git status --porcelain -- audit/alignment/2026-10-25/40-vps
```

---

## 7. Límites honestos de esta atestación

- **No hay `auditd`** en el host (`command -v auditctl` → `no_auditctl`), así que **no existe un log de auditoría del kernel** que registre syscalls. La prueba es **por estado antes/después**, no por traza de ejecución. Es la evidencia más fuerte disponible en esta caja, pero es *inferencial sobre estado*, no *observacional sobre llamadas*.
- Un `chmod` sin cambio de `mtime`/contenido escaparía a `-newermt`. Mitigado con el control de modo + md5 sobre el archivo sensible (el cron), no sobre los ~1 800 archivos de `/var/www/html`. Para el resto de rutas, la cobertura es `-newermt` + mtimes puntuales.
- `git status` muestra el estado del **working tree compartido**: no puede distinguir «quién» modificó un archivo. Por eso §4.1 enumera los `M` ajenos de forma explícita en lugar de afirmar que no existen.

---
*Fin de VPS_READONLY_ATTESTATION.md — 0 escrituras en producción (salvo 2 temporales en `/tmp`, borrados y declarados), 0 reload, 0 restart, 0 scp, 0 POST. Estado del host idéntico antes y después.*

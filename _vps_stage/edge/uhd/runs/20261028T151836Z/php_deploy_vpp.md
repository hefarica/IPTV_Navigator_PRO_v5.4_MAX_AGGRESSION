# Deploy PHP VPP (Fase 0.5) — ape_mesh / ape-feedforward / push_pq_profile

**Tarea:** `t42` (attempt 2) · **Ventana autorizada por el propietario:** 2026-10-28
**STAMP:** `20261028T151836Z` · **Host:** `ubuntu-2gb-ash-1` = `178.156.147.234` · **Deploy UTC:** 15:19:14Z · **Monitoring:** 15:19:46Z → 15:24:26Z
**Resultado:** **OK** — 3/3 ficheros desplegados, verificación 5a-5e completa, monitoring **10/10 sin degradación**, **rollback NO ejecutado** (no hubo motivo).
**Scope:** exactamente 3 ficheros de `/var/www/html/prisma/`. Sin tocar nginx, listas, `RESOLUTION`/`CODECS`/`BANDWIDTH`, ni otro fichero. Sin `git add`, sin commits. Sin reload/restart de php-fpm.

## 1. Backup (antes de tocar nada)

`/var/backups/ape-php/20261028T151836Z/` · `cp -a` de los 3 + `BEFORE.sha256` (sha, owner, mode, ruta):

| Fichero | sha256 BEFORE | owner:mode | verificado |
|---|---|---|---|
| `lib/ape_mesh.php` | `b9bc9a697d46…c6ed` (30 412 B) | `root:root 644` | **== declarado en la tarea** |
| `api/ape-feedforward.php` | `4c0668ad1539…7278` (3 146 B) | `www-data:www-data 644` | **== declarado** |
| `cli/push_pq_profile.php` | `5d1ef6e9f349…6f8d` (2 844 B) | `root:root 644` | **== declarado** |

Artefactos del backup: `*.before` (3) + `*.meta` (3) + `BEFORE.sha256` + **`rollback.sh` (700, escrito ANTES de instalar)**.
`rollback.sh <BK>` reinstala cada `.before` con su owner/mode originales, re-verifica sha y devuelve `ROLLBACK_RESULT=OK|FAIL`.

## 2. Stage y gate de sintaxis

`scp` de los 3 a `/tmp/ape-php-20261028T151836Z/` → **sha256 idénticos a los locales del repo** (transferencia byte a byte, LF preservado):

| Fichero | sha256 en stage == repo | bytes |
|---|---|---|
| `ape_mesh.php` | `cafe66e4508f26436d80268f373eab2595d1e5c0bc939ed6a9a13eadda586442` | 39 596 |
| `ape-feedforward.php` | `9cd4e0fad875090fd720e16d267e43bd184408110dbadf7de48420182ff533b8` | 3 906 |
| `push_pq_profile.php` | `f0fc5e92f256d3703e0b5524aa1f18a915b501a05e1307cd29bc48843dc73ec7` | 3 406 |

**Gate `php -l` (PHP 8.3.6): 3/3 exit 0** — `No syntax errors detected` × 3. Si hubiera fallado cualquiera, el script abortaba con `exit 10` **sin instalar**.

## 3. JSON BEFORE → AFTER (la prueba del cambio)

| Sonda | BEFORE | AFTER |
|---|---|---|
| `?device=test-device&ch=3&…` | **200** / 2 382 B · `ape_vpp` **AUSENTE** · `device_settings` 3 · `presets` 41 | **200** / 2 576 B · **`ape_vpp` PRESENTE** · `allowed=false` · `reason=no_caps` · `levers=0` · `device_settings` **3** · `presets` **41** |
| `?file=x` (sin device) | **200** / 109 B · `activated=false` · sin `ape_vpp` | **200** / 109 B · `activated=false` · sin `ape_vpp` · **`cmp` BEFORE vs AFTER = IDÉNTICOS** |

Claves de `ape_vpp` en AFTER: `schema, allowed, reason, profile, pq_profile, target, src, sr_needed, memc, soc, levers`.

## 4. Verificación 5a-5e (exit real por paso)

| # | Comprobación | Esperado | Medido | Veredicto |
|---|---|---|---|---|
| 5a | `ape_vpp` presente, `allowed:false` sin caps, `device_settings` 3, `presets` 41, sin 500 | sí | `allowed=false`, `reason=no_caps`, `levers=0`, `device_settings=3`, `presets=41`, HTTP 200 | **PASS** |
| 5b | `?file=x` passthrough `activated:false` **sin** `ape_vpp` | sí | 200, `activated=false`, sin `ape_vpp`, **`cmp` byte-idéntico** | **PASS** |
| 5c | `count(ape_vpp_levers("max_image"))` | **13** | **13** (exit 0) | **PASS** |
| 5d | `push_pq_profile.php max_image test-device 3` → **exit 2** y `policy_deltas` sin cambio | exit 2 | **exit 2** · `skip: SoC no allowlisted o sin caps (device=test-device)` · `policy_deltas=0` antes y después | **PASS** |
| 5e | `/_ape/luatest` **88/88** + `/cdn/…/3.m3u8` **200** | sí | `expected=88 asserts_ok=true fail=0` · cdn **200** | **PASS** |

Instalación: `install -o www-data -g www-data -m 644` × 3 · **sha256 post-install == stage == repo** en los 3 · `sleep 3` para opcache (`validate_timestamps=1`, `revalidate_freq=2`).

## 5. Monitoring 5 min (10 × 30 s) — `MONITOR_RESULT=OK`

Inicio 15:19:46Z · fin 15:24:26Z · **degradados 0/10**. Cada iteración: feedforward `200/vpp` · luatest `200/88ok` · cdn `200`.
Muestras: `[01] 15:19:47Z … [10] 15:24:26Z` — todas `state=OK`. **No se disparó rollback.**

## 6. Rollback — preparado y NO ejecutado

`/var/backups/ape-php/20261028T151836Z/rollback.sh` (700) listo desde antes de instalar. **Motivo de no ejecución: cero degradaciones y cero 500/timeouts en verificación y monitoring.** (Si se hubiera ejecutado: `install` de los 3 desde `.before`, re-verificación de `BEFORE.sha256`, sin reload — opcache ≤2 s.)

## 7. Scope y estado del borde (comprobado, no asumido)

- **Ficheros modificados en `/var/www/html/prisma` desde 15:18Z: exactamente 3** (`find -newermt` → los 3 del deploy, ninguno más).
- **nginx: no se tocó.** `MainPID=3801145`, `NRestarts=0` (mismo PID que en la ventana t30). Sin cambios de config por mi parte.
- **php-fpm: sin reload ni restart.** `MainPID=3800678`, `NRestarts=0`, `ActiveEnterTimestamp=2026-10-28 06:30:35Z` (13 h de antigüedad) ⇒ el cambio entró **solo por opcache**.
- Sanity final: feedforward **200** · luatest **200** · cdn **200**.

## 8. Hallazgos fuera del alcance de esta tarea (reportados, NO tocados)

1. **El plano 8088 cambió desde la puerta t30.** `/etc/nginx/conf.d/50-ape-meta-plane.conf` pasó de `3e29b928…` (10 941 B, lo que respaldé en t30 a las 09:33Z) a **`6b3c71e76ae4…` (11 224 B, mtime 2026-10-28 09:39:15Z)**, que es **exactamente el hash que firmó t29** para `_vps_stage/nginx/meta-plane.conf`. Otra sesión desplegó el plano UHD 6 min después de mi ventana.
2. **nginx tiene cargada una config distinta a la de t30**: `nginx -T | sha256sum` = **`255425a97a6f…af04`** ahora vs `0c6c0ea0090e…3d1c` en t30 ⇒ hubo **reload** entre 09:33Z y 15:19Z (no lo hice yo).
3. **`/_ape/uhd` ya existe en la config viva** (1 ocurrencia) ⇒ el endpoint que complementa a este `ape_vpp` está desplegado.
4. **Efecto colateral del propio deploy, declarado**: al primer request, el nuevo `ape_mesh.php` **creó** `/opt/netshield/data/conviva.db` (**28 672 B**, mtime 15:19; el **directorio** `/opt/netshield/data/` también es de 15:19) con la tabla `policy_deltas` **vacía (0 filas)**. Antes de la ventana esa ruta **no existía** (`PDO: unable to open database file`). No inserté ni modifiqué datos: `push_pq` salió **exit 2** y el count quedó **0**. **Un rollback de PHP NO borra ese fichero** — si el propietario quiere el estado previo exacto, debe decidir sobre él.
5. **Cambio de owner deliberado**: `ape_mesh.php` y `push_pq_profile.php` pasaron de `root:root` a `www-data:www-data` porque el mandato especifica `-o www-data -g www-data` para los 3. El `rollback.sh` restaura el owner original si hiciera falta.

## 9. Evidencia cruda en este directorio

`deploy.sh` · `deploy.log` · `stage.log` · `verify.sh` · `verify.log` · `monitor.sh` · `monitor.log` (282 s) · `scope.sh` · `scope.log` · `nginx_state.sh` · `nginx_state.log` · `stamp.txt` · `php_deploy_vpp.json`.
Pre-flight (sonda BEFORE previa): `_vps_stage/edge/uhd/runs/preflight_t42/`.

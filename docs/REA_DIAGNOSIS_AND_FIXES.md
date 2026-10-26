# REA · Diagnóstico y soluciones de lo pendiente (R5)

> **Fecha de medición:** 2026-10-26T02:28–02:45Z · **Host:** `ubuntu-2gb-ash-1` (`178.156.147.234`)
> **Método:** SSH root **solo lectura** (journal, `systemctl show`, `findmnt`, `ps`, `curl` loopback,
> `grep` de configuración). **No se reinició, recargó, habilitó ni modificó nada de producción.**
> Las únicas escrituras fueron ficheros temporales en `/tmp` (dos listas para cruzar timestamps y una
> copia del gateway para `luac -p`), **todos borrados**; ningún fichero de configuración, systemd o nginx
> se tocó. `NRestarts=0` y `ExecMainStartTimestamp` no cambiaron durante la sesión; el SHA de
> `/etc/nginx/nginx.conf` coincide con el baseline documentado (`a9a7146a…`).
>
> **Etiquetas de evidencia por afirmación:** `[observado]` = medido/leído ahora en el VPS o en el repo;
> `[público]` = documentación/estándar externo; `[no disponible]` = no medido o sin artefacto.
> Los números de benchmarks de 4K son **mediciones de la sesión W1/t1 en este mismo VPS**, citadas con
> `file:line`; **no se re-ejecutó x265** en esta sesión para no cargar la CPU de producción (se
> verificaron en vivo las entradas de hardware: 3 vCPU, sin GPU).

---

## 0. Resumen ejecutivo

| # | Hallazgo | Severidad | Estado | Causa raíz | Solución | Evidencia |
|---|---|---|---|---|---|---|
| **H1** | **Bounce de nginx cada ~20 min** (52 arranques/24 h) | **CRITICAL** (QoE/continuidad) | **CAUSA ENCONTRADA** | `cache-health-monitor` (cron `*/5`) reinicia nginx cuando `/dev/shm/nginx_cache` lleva 15 min vacío; la cache está **`off`** y la zone **no se usa**, así que el ciclo es infinito | **P0:** pasar el monitor a *alert-only* (quitar `systemctl restart nginx`). **P1:** drop-in de auditoría + alerta de reinicios. **P2:** si se conserva, `reload`, nunca `restart` | §1; log 52/52 = journal 52/52; 11 096 reinicios desde 2026-04-25 |
| **H2** | **Breaker de 15 s del gateway** (`down:<host>` TTL 15) | **HIGH** (doctrina autopista) | **CAUSA ENCONTRADA** | `ape_gateway.lua:168-179` salta el fetch si el host está en `ape_hosts` con clave `down:<host>`; si todos están castigados, devuelve **502 instantáneo sin `reason`** | **Cambio exacto:** eliminar el `if not HOSTS:get(dk)` y el `HOSTS:set(dk,…,15)`; conservar `qinc("host_down")`. `nginx -t` + **reload** | §2; diff exacto; `ape_obs.lua:43`; `CLAUDE.md:383-385, 540` |
| **H3** | **4K NO-GO por transcode CPU** | **HIGH** (decisión de producto) | **REFRENDADO** | x265 1080p→2160p `ultrafast`: **8,9 fps = 0,356×**, **7,61 core·s/s**, 269 % CPU, 542 MiB; el VPS tiene **3 vCPU** y **sin GPU** (Virtio; VAAPI falla) | **No activar 4K por CPU.** Mantener el gate. Nodo GPU (T4/L4/A10) solo para canales seleccionados, con guardas y fallback directo | §3; `MEDIA_FANOUT_FEASIBILITY.md:327-346`; `MEDIA_FANOUT_DEPLOY.md:400-412`; `ape_caps.lua:165,183` |
| **H4** | **Prerrequisitos de despliegue media fan-out** | **BLOCKER** (producción) | **MEDIDO / PENDIENTE** | `mediafanout` no existe; `/etc/mediafanout` y `/var/lib/mediafanout` no existen; `/dev/shm/mf` está 0750 (no 0770); locks 0755 root:root; unidades no instaladas | **Orden de activación con gates** (§4). No empezar hasta H1 resuelto | §4; `ape-ingest@.service:105,160-183`; `ape-supervisor@.service:34-50,75-77` |

**Veredicto corto:** el bounce **no era el watchdog de systemd ni SSH**: es un cron de 2026-04-25
(`cache-health-monitor`) que nunca se retiró cuando la cache se apagó. El breaker del gateway es una
violación directa de la doctrina autopista y su fix es quirúrgico (elimina el gate y el castigo,
conserva la telemetría). El 4K sigue siendo **NO-GO** en este
host por física (3 vCPU vs 7,61 core·s/s, sin GPU); un nodo GPU solo tendría sentido para canales
seleccionados y con etiquetado honesto. El despliegue de media fan-out está **bloqueado** por
prerrequisitos medidos, no por el código.

---

## 1. H1 — Bounce de nginx cada ~20 min: causa raíz, impacto y mitigación

### 1.1 Lo que se midió (no lo que se creía)

`[observado]` Ventana `2026-10-25T02:28:58Z → 2026-10-26T02:28:58Z` (24 h), `journalctl -u nginx`:

- **52** líneas `Started nginx.service` en 24 h (la medición previa de **53** es consistente: cambia el
  borde de la ventana y el tráfico; ver §1.3).
- Cadencia **exacta** mientras hay tráfico: `:15:04`, `:35:04`, `:55:04` (con segundos 04/05/09 según el
  día). Muestra:

```
2026-10-25T21:55:05+00:00 systemd[1]: Started nginx.service ...
2026-10-25T22:15:09+00:00 systemd[1]: Started nginx.service ...
2026-10-25T22:35:04+00:00 systemd[1]: Started nginx.service ...
2026-10-25T22:55:04+00:00 systemd[1]: Started nginx.service ...
2026-10-25T23:15:04+00:00 systemd[1]: Started nginx.service ...
2026-10-25T23:35:04+00:00 systemd[1]: Started nginx.service ...   ← último de la ventana
```

- Cada `Started` va precedido de **`Stopping` + `Stopped` + `Starting`** en el mismo segundo: es un
  **`systemctl restart` completo**, no un `reload`:

```
2026-10-25T23:35:04+00:00 systemd[1]: Stopping nginx.service ...
2026-10-25T23:35:04+00:00 systemd[1]: nginx.service: Deactivated successfully.
2026-10-25T23:35:04+00:00 systemd[1]: Stopped nginx.service ...
2026-10-25T23:35:04+00:00 systemd[1]: Starting nginx.service ...
2026-10-25T23:35:04+00:00 systemd[1]: Started nginx.service ...
```

- `NRestarts=0` y `ExecMainStartTimestamp=Sun 2026-10-25 23:35:04 UTC` `[observado]`: **no es systemd
  reiniciando por fallo**; es una orden externa explícita.
- En una de las paradas, nginx dejó sockets abiertos y abortó `[observado]`:

```
2026-10-25T22:15:09+00:00 nginx[1873427]: [alert] *184 open socket #20 left in connection 9
2026-10-25T22:15:09+00:00 nginx[1873427]: [alert] *187 open socket #22 left in connection 11
2026-10-25T22:15:09+00:00 nginx[1873427]: [alert] aborting
```

- El log de la cache lo confirma **1:1**: 52 líneas `EMPTY_RESTARTING` en la misma ventana, **52/52**
  coinciden al minuto con los 52 `Started nginx` `[observado]`:

```
2026-10-25T23:15:01Z status=EMPTY_RESTARTING files=0 size_bytes=0 reqs_5m=294 action=systemctl restart nginx + warmup
2026-10-25T23:35:01Z status=EMPTY_RESTARTING files=0 size_bytes=0 reqs_5m=295 action=systemctl restart nginx + warmup
```

- El total histórico del log es **11 096** `EMPTY_RESTARTING` desde **2026-04-25T07:55:01Z** hasta
  **2026-10-25T23:35:01Z** `[observado]`. No es un incidente de esta semana: lleva ~6 meses.

### 1.2 Causa raíz (cadena exacta)

`[observado]` La cadena es:

```
cron */5  /usr/local/bin/cache-health-monitor        (/etc/cron.d/cache-health-monitor:3)
  ├─ CACHE_PATH=/dev/shm/nginx_cache                 (cache-health-monitor:8)
  ├─ THRESHOLD_REQS_5MIN=20, EMPTY_GRACE_MIN=15      (:12-13)
  ├─ si cache_files < 2 Y reqs_5min > 20 → EMPTY_WITH_TRAFFIC  (:27-28)
  │    ├─ intenta cache-warmup (no puede poblar una cache apagada) (:31-39)
  │    └─ state file; si minutes_empty >= 15 → EMPTY_RESTARTING  (:50-51)
  ├─ systemctl restart nginx                         (:53)  ← EL RESTARTER
  └─ sleep 3 + cache-warmup + borra state            (:54-56)
        ↓
   nginx cache sigue vacía (proxy_cache off) → a los 15 min vuelve a reiniciar
        ↓
   ciclo de 20 min = 5 min de cron + 15 min de gracia
```

La premisa del monitor es **falsa hoy**:

- `/etc/nginx/nginx.conf:81` define `proxy_cache_path /dev/shm/nginx_cache ...`, pero la **única**
  aparición de `proxy_cache` en toda la configuración es `proxy_cache off;` en
  `/etc/nginx/conf.d/50-ape-meta-plane.conf:79` `[observado]`.
- No hay **ninguna** location que use `proxy_cache nginx_cache` (o cualquier zone):
  `grep -rn "proxy_cache " /etc/nginx/` devuelve **1** línea, y es `off` `[observado]`.
- `/dev/shm/nginx_cache` está vacío (`0` ficheros, `0` bytes) y es un directorio 0700 de `www-data`
  `[observado]`. No es un fallo de permisos: **la cache no se usa**.
- `cache-warmup` (que el monitor invoca) está pensado para “pre-fetch manifests para mantener cache RAM
  siempre poblado”; con `proxy_cache off` no puede crear entradas `[observado]`.

Por eso el monitor **nunca** sale del estado “vacío con tráfico”: cada 15 min de gracia reinicia nginx,
la cache sigue vacía, y 20 min después repite. El `sleep 3` y el `warmup` no cambian nada.

**Por qué a veces para:** el monitor solo actúa si `reqs_5min > 20`. Cuando el tráfico cae por debajo de
ese umbral (p. ej. después de medianoche), deja de reiniciar `[observado]`:

```
2026-10-25T23:55:01Z status=EMPTY_WITH_TRAFFIC files=0 size_bytes=0 reqs_5m=298 action=none
2026-10-26T00:00:01Z status=OK               files=0 size_bytes=0 reqs_5m=0   action=none
2026-10-26T00:05:01Z status=OK               files=0 size_bytes=0 reqs_5m=2   action=none
```

Eso explica que la ventana de 24 h tenga 52 (no 53) y que el último reinicio sea a las 23:35:04: el
“bounce cada 20 min” es **tráfico-dependiente**, no un timer fijo de 20 min.

### 1.3 Por qué NO es el watchdog propio, ni SSH, ni systemd

- **Watchdog propio (`ape-meta-watchdog`):** corre cada 60 s (`ape-meta-watchdog.timer`), consulta
  `http://127.0.0.1:8088/_ape/health`, y solo actúa tras **3 fallos**; si `nginx -t` pasa hace
  `systemctl reload nginx` y solo si falla hace `restart` (`docs/META_PLANE_PUBLIC_443_WATCHDOG.md:42-50`;
  `_vps_stage/watchdog/ape-meta-watchdog.sh:35-42`). `[observado]` En 24 h:
  **1** evento `health FAIL (1/3)` (07:35:04) y **0** `nginx RELOAD ok` / **0** `nginx RESTART ok`.
  Ese único evento coincide **exactamente** con un reinicio de `cache-health-monitor` (07:35:04): el
  watchdog vio el health caer **porque** el otro cron estaba reiniciando nginx; no fue la causa.
  **El watchdog propio queda descartado, como ya concluyó la sesión anterior.**
- **SSH:** `[observado]` en la ventana de 6 h hay **185** `Accepted publickey` (la medición previa decía
  193; es el mismo orden), **todas root**, **todas desde 181.130.154.235**, con **una sola clave
  ED25519** cuyo fingerprint coincide con la clave local `iptv-hetzner`
  (`SHA256:sMdkciR+…`). No es una intrusión: es la automatización del propietario/agente. En 24 h el
  journal retenido muestra **664** aceptaciones. Además, la densidad es alta (~1 sesión/43 s en la
  ventana activa), así que una sesión “2-5 s antes” de un reinicio (5/52) es **coincidencia esperable**,
  no causalidad. El clavo está en el log de la cache: **52/52** coinciden, incluso en periodos en los
  que el journal retenido no registra sesiones.
- **systemd:** `NRestarts=0`; no hubo auto-restart por fallo de unidad. El journal muestra
  `Stopping/Stopped/Starting/Started`, no un fallo de unidad; es una orden explícita. El journal no
  registra el PID del llamante (systemd no lo hace por defecto), pero el cron sí deja su firma:
  `CRON ... CMD (/usr/local/bin/cache-health-monitor)` a las `:01`, y el stop a las `:04`.

### 1.4 Impacto (qué se pierde con cada reinicio)

- `systemctl restart` ejecuta `ExecStop` (SIGQUIT graceful, con `--retry QUIT/5`, líneas 25-26) y
  **luego** arranca: hay una ventana sin listener y se cierran las conexiones keep-alive; no es un
  `reload` (`/lib/systemd/system/nginx.service:1-26` `[observado]`). La alerta de sockets abiertos y
  `aborting` (§1.1) muestra que en al menos una parada había conexiones vivas.
- Frecuencia: 52/24 h en la ventana medida; **11 096** reinicios desde 2026-04-25. En horas de tráfico,
  uno cada 20 min.
- La duración exacta del corte no se midió con un cliente durante un reinicio: **[no disponible]**. Se
  propone medirla en staging con un `curl` en bucle antes de dar una cifra de “segundos caídos”.
- Efecto operativo seguro: cualquier prueba E2E que cruce un `:15/:35/:55` puede invalidarse (el banco
  V3 comprueba `journal_events=0`; `docs/MEDIA_FANOUT_CONCURRENCY_REPORT.md:243,250`). La corrida V3 de
  las 22:22–22:25 no cayó en un reinicio por suerte de ventana; una prueba más larga sí puede caer.

### 1.5 Mitigación

#### P0 — quitar el reinicio (recomendado; no toca nginx)

El script es bash y cron lo relee en cada ejecución: **no hace falta reiniciar ni recargar nginx** para
aplicar el cambio. Diff exacto sobre `/usr/local/bin/cache-health-monitor` (líneas 50-56):

```diff
--- a/usr/local/bin/cache-health-monitor
+++ b/usr/local/bin/cache-health-monitor
@@ -48,11 +48,13 @@
         minutes_empty=$(( (now_ts - first_empty) / 60 ))
 
         if [ "$minutes_empty" -ge "$EMPTY_GRACE_MIN" ]; then
-            status="EMPTY_RESTARTING"
-            action="systemctl restart nginx + warmup"
-            systemctl restart nginx 2>>"$LOG_FILE"
-            sleep 3
-            "$WARMUP_BIN" 200 8 3 >>"$LOG_FILE" 2>&1
+            # 2026-10-26: NO reiniciar nginx. proxy_cache está 'off' y la zone
+            # no se usa en ninguna location: la cache SIEMPRE estará vacía y el
+            # restart solo provoca un corte cada ~20 min (52/24 h). Alert-only.
+            status="EMPTY_CACHE_UNUSED"
+            action="alert_only_no_restart"
+            logger -t cache-health-monitor \
+                "cache empty with traffic: restart suppressed (proxy_cache unused)"
             rm -f "$STATE_FILE"
         fi
     fi
```

Notas:

- Se mantiene la escritura de `/dev/shm/cache_health_metrics.json` (`cache-health-monitor:63-73`), que
  consume `/var/www/html/api/health.php:52-56`; por eso **no** se recomienda simplemente comentar el cron
  (dejaría la métrica congelada). El `status` cambia a `EMPTY_CACHE_UNUSED`, que es la verdad operativa.
- Se elimina también el `sleep 3` + `cache-warmup` de la rama de reinicio: no puede poblar una cache que
  no se usa; si se quiere conservar el warmup, dejarlo solo en la rama `EMPTY_WITH_TRAFFIC` (paso 1).
- Backup y aplicación:
  ```bash
  cp -a /usr/local/bin/cache-health-monitor /root/cache-health-monitor.bak-20261026
  # aplicar el diff con el editor que use el operador (no automatizar a ciegas)
  bash -n /usr/local/bin/cache-health-monitor          # sintaxis
  /usr/local/bin/cache-health-monitor                  # ejecución manual: debe escribir alert_only
  grep -c 'systemctl restart nginx' /usr/local/bin/cache-health-monitor   # esperado: 0
  ```
- **No** hace falta `systemctl reload nginx`; el próximo cron `*/5` usará el script nuevo.
- **Validación del parche:** se aplicó a una copia temporal y `bash -n` devolvió `exit 0`; el original
  `/usr/local/bin/cache-health-monitor` **no** se tocó en esta sesión.

**Alternativa P0-bis (mínima, reversible):** comentar la línea del cron
`/etc/cron.d/cache-health-monitor:3` (`#*/5 ...`). Detiene el bounce al instante, pero congela la métrica
que consume `health.php`; úsese solo como parche de emergencia y con la P0 encima.

#### P1 — auditoría de quién reinicia (drop-in real, sin instalar paquetes)

Un drop-in de systemd **no puede saber quién llamó a `systemctl`**: `ExecStartPre` corre como hijo de
PID 1, no del llamante. La vía canónica sería `auditd`, pero **no está instalado** (`auditctl`/`ausearch`
ausentes) y `apt install` está **prohibido** en este VPS (`MEDIA_FANOUT_DEPLOY.md:163-171, 661-664`).
La alternativa sin instalar nada es un drop-in que, en el instante del arranque, **fotografíe el árbol
de procesos**: si el `systemctl` que pidió el restart sigue vivo esperando el job, se puede ver su
`ppid` y su ascendencia (sshd/cron/bash).

`/usr/local/bin/ape-nginx-start-audit.sh` (nuevo, 0755 root:root):

```bash
#!/bin/bash
# Auditoría de arranques de nginx. Se ejecuta como ExecStartPre del drop-in.
# Solo lee /proc y ps; no manda señales ni cambia configuración.
set -u
LOG=/var/log/ape-nginx-restart-audit.log
ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
{
  echo "=== nginx start $ts invocation=${INVOCATION_ID:-?} ==="
  pids=$(pgrep -x systemctl 2>/dev/null || true)
  if [ -n "$pids" ]; then
    for pid in $pids; do
      echo "-- systemctl pid=$pid --"
      ps -o pid,ppid,user,lstart,args -p "$pid" 2>/dev/null
      p=$pid
      for _ in 1 2 3 4 5; do
        p=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')
        [ -z "$p" ] && break
        [ "$p" = "0" ] && break
        ps -o pid,ppid,user,lstart,args -p "$p" 2>/dev/null
      done
    done
  else
    echo "-- no systemctl alive (posible señal directa o D-Bus) --"
  fi
  ps -eo pid,ppid,user,lstart,args 2>/dev/null \
    | grep -E 'CRON|cache-health-monitor|sshd: root|ape-' \
    | grep -v -E 'grep|ape-nginx-start-audit' || true
} >> "$LOG"
exit 0
```

`/etc/systemd/system/nginx.service.d/20-audit-restart.conf`:

```ini
[Service]
# '-' = si la auditoría falla, nginx arranca igual (no convertirla en dependencia dura)
ExecStartPre=-/usr/local/bin/ape-nginx-start-audit.sh
```

`/etc/logrotate.d/ape-nginx-restart-audit`:

```
/var/log/ape-nginx-restart-audit.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
    create 0640 root adm
}
```

Aplicación y límites:

```bash
install -m 0755 ape-nginx-start-audit.sh /usr/local/bin/ape-nginx-start-audit.sh
install -d -m 0755 /etc/systemd/system/nginx.service.d
install -m 0644 20-audit-restart.conf /etc/systemd/system/nginx.service.d/20-audit-restart.conf
systemctl daemon-reload
nginx -t
# El drop-in se estrena en el PRÓXIMO arranque/restart, no en un reload.
# NO provocar un restart solo para probarlo (sería el bug que intentamos evitar).
```

Caveats honestos: captura el caso dominante (`systemctl` esperando el job), no una llamada D-Bus de un
proceso que ya murió; para atribución forense completa haría falta `auditd`/`bpftrace` (no instalados) o
un wrapper de `systemctl` (no recomendado). Aun así, **habría cazado este incidente**.

Alerta complementaria (opcional, sin reiniciar nada): `/usr/local/bin/ape-nginx-restart-alert.sh` con
`journalctl -u nginx --since '15 min ago' | grep -c 'Started nginx'`; si `> 1`, `logger -t
ape-nginx-restart-alert ...`. Se puede dejar en `/etc/cron.d/ape-nginx-restart-alert` cada 5 min.

#### P2 — si en el futuro hace falta un restarter legítimo

- Usar **`systemctl reload nginx`** (el unit ya define `ExecReload=/usr/sbin/nginx -s reload`;
  `/lib/systemd/system/nginx.service:25`), **nunca** `restart`, salvo que `nginx -t` falle o se cambie
  `proxy_cache_path` (el propio `nginx-deploy-preflight:46-50` documenta que eso sí exige restart).
- Un cache vacío **no** es motivo de restart: o la cache se usa (y se arregla la ruta/zone), o no se usa
  (y el monitor sobra). El estado actual es lo segundo.

### 1.6 Verificación del fix (criterios medibles)

`[observado]` Estado de partida: 52 `Started nginx`/24 h. Tras aplicar P0:

```bash
# 1) 24 h después: no debe haber ni un arranque nuevo (sin intervención legítima en la ventana)
journalctl -u nginx --since '24 hours ago' --no-pager | grep -c 'Started nginx'   # esperado: 0
journalctl -u nginx --since '24 hours ago' --no-pager | grep -E 'Stopping|Started nginx'  # esperado: vacío

# 2) el monitor sigue vivo y solo alerta
grep -a 'EMPTY_CACHE_UNUSED' /var/log/cache-health.log | tail -5
grep -c 'systemctl restart nginx' /usr/local/bin/cache-health-monitor              # esperado: 0
cat /dev/shm/cache_health_metrics.json | grep -E 'status|action_taken'            # alert_only_no_restart

# 3) health.php sigue respondiendo y con la métrica fresca
curl -sS -o /dev/null -w '%{http_code}\n' https://iptv-ape.duckdns.org/api/health.php   # esperado: 200
```

Rollback: `cp -a /root/cache-health-monitor.bak-20261026 /usr/local/bin/cache-health-monitor`; no toca
nginx. Si se aplicó P1, `rm` del drop-in + `systemctl daemon-reload` (el próximo arranque ya no audita).

---

## 2. H2 — Breaker de 15 s del gateway: causa, efecto y cambio exacto

### 2.1 Código y semántica

`[observado]` `_vps_stage/lua/ape_gateway.lua:167-181`:

```lua
for _, h in ipairs(candidates) do
    local dk = "down:" .. h
    if not (HOSTS and HOSTS:get(dk)) then              -- :169  ← GATE (breaker)
        local res, fh, why = fetch_follow(h, path, args)
        if res and res.status and res.status >= 200 and res.status < 300 then
            winner, res_ok = h, res
            final_origin = "http://" .. fh
            break
        end
        last_status = (res and res.status) or 502
        last_reason = why or (res and res.status and ("http_" .. res.status)) or "capture_failed"
        if HOSTS then HOSTS:set(dk, 1, 15) end          -- :178  ← TTL 15 s
        qinc("host_down:" .. h)                         -- :179
    end
end
```

- `HOSTS` es `ngx.shared.ape_hosts` (`ape_gateway.lua:29`), declarado en `meta-plane.conf:46` con el
  comentario “circuit-breaker suave de CDNs (host caído = 15 s fuera)” (`meta-plane.conf:45`).
- La ruta pública `/cdn/` usa este handler (`_vps_stage/public/ape-meta-public.conf:15-18`; también
  `meta-plane.conf:180-183` en :8088).
- `ape_obs.lua:43` publica `snap.hosts_down` leyendo las claves `down:`; por eso `/_ape/health` muestra
  `upstreams_down` (la doc vio `upstreams_down:2` por hosts de prueba, con “el castigo dura 15 s”;
  `META_PLANE_PUBLIC_443_WATCHDOG.md:77-78`).

### 2.2 Efecto exacto: 502 instantáneo **sin `reason`**

`[observado]` Si **todos** los candidatos tienen `down:<host>` vigente, el cuerpo del `for` no se ejecuta
para ninguno:

- `winner`/`res_ok` quedan `nil`; `last_status` y `last_reason` quedan `nil` (nunca se asignan).
- Se entra en `if not res_ok` (`:185`), `qinc("all_failed")`, y:
  ```lua
  ngx.status = (last_status and last_status >= 400) and last_status or 502  -- :187 → 502
  ngx.say(cjson.encode({ ok = false, error = "all_upstreams_failed",
      tried = candidates, reason = last_reason, path = path, ms = elapsed_ms }))  -- :189-190
  ```
  `cjson` **omite** `reason` cuando es `nil`: el JSON sale **sin `reason`**.
- `elapsed_ms` es ~0 (no hubo fetch), y no se emiten `X-APE-CDN`, `X-APE-Upstream-Ms`, etc. (esos se
  ponen solo en la respuesta de éxito, `:394-405`).
- El host castigado **no se reintenta durante 15 s**, aunque ya se haya recuperado; si el castigo se
  renueva con cada fallo, el 502 sin `reason` se repite. Eso es exactamente lo observado en la doc:
  `upstreams_down:2` y castigo de 15 s (`META_PLANE_V3_CDN_LLHLS_QOE.md:20`).

No se provocó el 502 en producción para no ensuciar `ape_hosts` (doctrina de no tocar prod); la lógica
es determinista a partir del código y del `cjson` (nil ⇒ campo omitido) `[observado: código]`. El
`/_ape/qoe` actual muestra `hosts_down:{}` y `upstreams_down:0` `[observado]`, así que hoy no hay
castigos activos.

### 2.3 Por qué viola la doctrina autopista

`[observado]` `CLAUDE.md:381-385`:

> “El VPS … funciona como proxy transparente de máximo rendimiento. Regla cardinal: **NUNCA frenar,
> bloquear, limitar ni interferir con la reproducción**. `upstream_gate.lua` = PASSTHROUGH (nunca
> `ngx.exit(503)`).”

Y `CLAUDE.md:540`: “**Activar circuit breaker en el VPS que bloquee por host**” está en “Lo que NUNCA se
hace”. El `down:<host>` no es telemetría: **impide el fetch**. Aunque el gateway sea “solo metadata”, un
playlist que no se sirve es reproducción que no arranca. El breaker debe desaparecer, no “suavizarse”.

### 2.4 Cambio exacto (1 archivo de lógica + 1 comentario)

Diff sobre `_vps_stage/lua/ape_gateway.lua` (y su copia desplegada `/etc/nginx/lua/ape_gateway.lua` si
se despliega):

```diff
--- a/_vps_stage/lua/ape_gateway.lua
+++ b/_vps_stage/lua/ape_gateway.lua
@@ -165,19 +165,18 @@
 local last_reason = nil
 
 for _, h in ipairs(candidates) do
-    local dk = "down:" .. h
-    if not (HOSTS and HOSTS:get(dk)) then
-        local res, fh, why = fetch_follow(h, path, args)
-        if res and res.status and res.status >= 200 and res.status < 300 then
-            winner, res_ok = h, res
-            final_origin = "http://" .. fh
-            break
-        end
-        last_status = (res and res.status) or 502
-        last_reason = why or (res and res.status and ("http_" .. res.status)) or "capture_failed"
-        if HOSTS then HOSTS:set(dk, 1, 15) end
-        qinc("host_down:" .. h)
-    end
+    -- AUTOPISTA (2026-10-26): se intenta SIEMPRE. El antiguo castigo
+    -- down:<host> TTL 15 saltaba el fetch y devolvía 502 sin `reason`.
+    -- La telemetría se conserva; el bloqueo se elimina.
+    local res, fh, why = fetch_follow(h, path, args)
+    if res and res.status and res.status >= 200 and res.status < 300 then
+        winner, res_ok = h, res
+        final_origin = "http://" .. fh
+        break
+    end
+    last_status = (res and res.status) or 502
+    last_reason = why or (res and res.status and ("http_" .. res.status)) or "capture_failed"
+    qinc("host_down:" .. h)
 end
 
 local elapsed_ms = math.floor(((ngx.now() - t0) * 1000) + 0.5)
```

Comentario de la config (para que no vuelva a introducirse): en `_vps_stage/nginx/meta-plane.conf:45`,
cambiar “circuit-breaker suave de CDNs (host caído = 15 s fuera)” por “telemetría de fallos; **sin
castigo ni bloqueo** (autopista)”.

**Validación del parche:** se aplicó a una copia temporal y `luac -p` devolvió `exit 0` en el VPS
(`/tmp/ape_gateway.patched.lua`, borrado después); `/etc/nginx/lua/ape_gateway.lua` **no** se tocó.

Opcional (si se quiere conservar “último fallo” para dashboards): escribir
`HOSTS:set("lastbad:" .. h, ngx.time(), 15)` y cambiar `ape_obs.lua:43` para publicar `last_bad` en vez
de `hosts_down`. No es necesario para el fix; añade una segunda edición.

Lo que **no** cambia: allowlist/anti-SSRF, seguimiento de 302, rebase, LL-HLS, UHD, fusible, límites de
tamaño. El cambio solo elimina el salto por `down:`.

### 2.5 Despliegue y prueba

```bash
# 1) backup + sintaxis Lua (no ejecuta nada)
cp -a /etc/nginx/lua/ape_gateway.lua /root/ape_gateway.lua.bak-20261026
luac -p /etc/nginx/lua/ape_gateway.lua                  # esperado: exit 0
# 2) validar nginx completo
nginx -t
# 3) cargar el código nuevo SIN cortar: reload, no restart
systemctl reload nginx
# 4) comprobar que el código cargado ya no contiene el gate
grep -nE 'HOSTS:get\(dk\)|HOSTS:set\(dk' /etc/nginx/lua/ape_gateway.lua   # esperado: 0 líneas
```

Prueba en staging (nunca contra el proveedor real): levantar un nginx de staging con el gateway y un
host muerto de prueba; dos peticiones separadas < 15 s:

- 1.ª: `502` con `reason` (`capture_failed` o `http_…`).
- 2.ª: **también intenta** el fetch (`X-APE-Upstream-Ms` > 0 o el log del upstream lo demuestra) y
  devuelve `reason`; **no** un 502 con `ms` ~0 y sin `reason`.
- `/_ape/qoe` debe seguir incrementando `host_down:<host>` (telemetría), y `ape_hosts` no debe tener
  claves `down:`.

Rollback: restaurar el `.bak`, `luac -p`, `nginx -t`, `systemctl reload nginx`.

---

## 3. H3 — 4K NO-GO: refrendo numérico y qué haría falta

### 3.1 Los números medidos (mismo VPS, sesión W1/t1)

`[observado]` Tabla de `docs/MEDIA_FANOUT_FEASIBILITY.md:325-332` (reproducida en
`docs/MEDIA_FANOUT_DEPLOY.md:402-407`), medidas con ffmpeg 6.1.1 en este host:

| Prueba | fps | speed | CPU % | core·s / s de contenido | Cores para 1× | Techo en 3 vCPU | RSS |
|---|---:|---:|---:|---:|---:|---:|---:|
| **x265 1080p→2160p `ultrafast`** (contenido real) | **8,9** | **0,356×** | 269 % | **7,61** | **7,6** | **0,394×** | 542 MiB |
| x265 2160p30 sintético `ultrafast` | 12 | 0,412× | 264 % | 6,42 | 6,4 | 0,47× | 480 MiB |
| x265 2160p30 sintético `medium` | 5,9 | 0,194× | 245 % | 12,62 | 12,6 | 0,24× | 572 MiB |
| x264 1080p→2160p `ultrafast` (real) | 39 | 1,56× | 230 % | 1,50 | 1,5 | 2,0× (1 stream) | 243 MiB |
| remux `-c copy` (referencia) | ~997× | — | 103 % | 0,0108 | 0,01 | >200 | 61 MiB |

`[observado]` Hardware verificado ahora: `nproc=3`, AMD EPYC-Rome, 3 819 MiB RAM, `lspci` = **Red Hat
Virtio 1.0 GPU**, `/dev/dri` solo `card0`/`renderD128`, `nvidia-smi`/`vainfo` **ausentes**, ffmpeg
**6.1.1-3ubuntu5**. `[observado]` La doc ya lo decía: “no hay motor de códec”; VAAPI falla con
`resource allocation failed` / `Device creation failed: -5` (`MEDIA_FANOUT_FEASIBILITY.md:68-69`).

### 3.2 Lectura numérica (por qué es imposible en este host)

- Un stream 4K HEVC en tiempo real exige **7,61 core·s por segundo de contenido**. El host tiene **3
  vCPU** ⇒ techo **3 / 7,61 = 0,394×**. Medido: **0,356×**.
- Es decir: **1 s de contenido consume ~2,81 s de pared** (1/0,356), y 5 s de video ~14 s (con el techo
  teórico 0,394× serían 12,7 s). El buffer crece sin límite, el directo se retrasa y rompe.
  `[observado: docs/MEDIA_FANOUT_FEASIBILITY.md:336-339]`
- Memoria: **542 MiB** por encoder x265; dos sesiones = **1 084 MiB** solo de encoder, más ventanas
  tmpfs (~70 MiB/sesión). Aunque la RAM de 3 819 MiB lo permita, la CPU no.
- x264 4K `ultrafast` (1,50 core·s/s, 8 bits): **1 stream = 50 % del host**; dos = 100 %, sin CPU para
  nginx/ingesta/supervisor; y `ultrafast` a 4K no mejora la imagen frente al AI-SR del dispositivo.
- La muestra de fuente (12/12 canales, incluidos 6 etiquetados “4K”) es **1920x1080 SDR 8 bits**; el “4K”
  del catálogo es upscale, no fuente (`MEDIA_FANOUT_FEASIBILITY.md:43-46`). Aun con GPU, escalar 1080p
  no crea detalle real; etiquetarlo HDR está **prohibido** (`MEDIA_FANOUT_DEPLOY.md:414-418`).

### 3.3 Decisión

- **No activar transcode 4K por CPU en este VPS.** El perfil 4K escalado queda `state: off`, gateado por
  hardware, fuera del camino por defecto (`MEDIA_FANOUT_DEPLOY.md:400-412`; `ape_caps.lua:1686`).
- **No etiquetar HDR** lo escalado/remuxeado: es un NO-GO explícito de la doctrina
  (`MEDIA_FANOUT_DEPLOY.md:414-418`; `ape_caps.lua:15-21`).
- Para “imagen excepcional” el ROI real es **Tier 0**: AI-SR/AI-PQ del SoC del dispositivo + `virtual_4k`
  con guardas, **0 ms añadidos, 0 CPU del VPS** (`VPS_UPSCALE_4K_DESIGN.md:127-132, 163-168`).

### 3.4 Qué haría falta si se quisiera 4K por GPU (nodo aparte)

`[observado]` Diseño ya documentado en `docs/VPS_UPSCALE_4K_DESIGN.md:100-105`:

| Plataforma | 4K30 HEVC realtime (1 canal) | Canales concurrentes | Veredicto |
|---|---|---|---|
| CPX21 actual (3 vCPU) | x265 ≈ 0,3–0,4× | **0** | **imposible** |
| 8 vCPU dedicados | 0,7–1,0× | 0–1 | frágil |
| **GPU NVIDIA T4** (1 NVENC) | NVENC sí, preset p1 | **1–2** | viable puntual |
| **GPU NVIDIA L4 / A10** | NVENC + NVDEC | **2–4** | viable para canales seleccionados |

Reglas no negociables del Tier 1 GPU (`VPS_UPSCALE_4K_DESIGN.md:148-154`):

1. Publicar el canal **solo** si `encode_speed ≥ 1,5×` realtime medido con reserva.
2. La lista debe llevar **la URL directa como fallback**; si el nodo baja de 1,2×, el player cambia a
   directo (degradación, nunca freeze).
3. `-c:a copy` siempre (no tocar el reloj de audio).
4. Techo **4K@60**; nunca declarar un nivel por debajo de la resolución.
5. **Un canal = un proceso**, con watchdog que mate el proceso si el buffer de salida se atrasa.
6. Egress: **18–25 Mbps por espectador**; 10 concurrentes = 180–250 Mbps
   (`VPS_UPSCALE_4K_DESIGN.md:108-110`).
7. Latencia: cualquier transcode añade **≥1 GOP**; con GOP 1 s + LL-HLS + CMAF, **3–5 s** glass-to-glass
   (`:112-114`).
8. Solo **canales seleccionados**, no los 2 753; 8K descartado; HDR real solo si la fuente lo trae.

**Especificación mínima del nodo (derivada del diseño, no medida):** GPU con NVENC HEVC + NVDEC (L4/A10;
T4 solo 1–2 canales), host con CPU/IO suficientes para nginx + ingesta + ffmpeg, ≥1 Gbit de salida, y
el mismo esquema de observabilidad/rollback. Coste, disponibilidad y proveedor: **[no disponible]** en
esta sesión. Un nodo GPU **no** convierte el CPX actual en 4K: es otro plano, con otro presupuesto y otro
etiquetado.

---

## 4. H4 — Prerrequisitos de despliegue y orden de activación

### 4.1 Estado medido ahora (2026-10-26T02:28–02:45Z)

`[observado]` Todo lo siguiente se leyó en el VPS; no se creó ni cambió nada:

| Prerrequisito | Esperado por el diseño | Medido ahora | Estado |
|---|---|---|---|
| Usuario `mediafanout` | system, sin home, shell nologin, gid `www-data` | **no existe** (`id: no such user`) | **BLOCKER** |
| Grupo `www-data` | gid 33 | existe (`gid=33`) | OK |
| `/etc/mediafanout` | 0755 root:root; `providers.allow` y `urls.conf` 0640 | **no existe** | **BLOCKER** |
| `/run/mediafanout` | 0750 root:www-data; `spec/` y `locks/` | existe 0750 root:www-data; `spec/` 0750; `locks/` **0755 root:root** con lock files 0644 root:root | **PARCIAL** |
| `/dev/shm/mf` | 0770 root:www-data (ventana) | existe **0750** root:www-data, vacío | **BLOCKER** para worker no-root |
| `/var/lib/mediafanout` | 0750 root:www-data (gen persistido) | **no existe** | PENDIENTE (systemd `StateDirectory=mediafanout` lo crea 0750 al arrancar; pre-crearlo solo si se quiere fijar el modo) |
| `/run` | **noexec** (binarios en `/usr/local/bin`) | `rw,nosuid,nodev,noexec,size=391124k` | OK (confirma Hallazgo 1) |
| `/dev/shm` | tmpfs 1,9 GiB | 1,9 GiB, 36 KiB usados | OK |
| nginx + lua | 1.24.0 + ngx_http_lua 0.10.26 | nginx/1.24.0; `modules-enabled/50-mod-http-lua.conf` symlink; `nginx -T` con 5 `lua_shared_dict`; `nginx -t` OK | OK |
| cgroup v2 | systemd 255 | `cgroup2fs`; systemd 255 | OK |
| Unidades `ape-ingest@` / `ape-supervisor@` | instaladas | **ninguna** (`systemctl list-unit-files` vacío) | PENDIENTE |
| Binarios media fan-out | `/usr/local/bin/ape-ingest.sh`, `/opt/mediafanout/ape-supervisor.*` | no instalados | PENDIENTE |
| GPU | no hay | Virtio; sin `nvidia-smi`/`vainfo` | OK (4K gate) |

**Desviaciones que hay que corregir antes de activar:**

1. **`/dev/shm/mf` 0750 → 0770.** Con `User=mediafanout` (gid `www-data`), el grupo solo tiene `r-x` en
   0750: el worker **no puede escribir** la ventana. El diseño exige 0770 root:www-data
   (`MEDIA_FANOUT_DEPLOY.md:139-144, 154`). Comando: `chmod 0770 /dev/shm/mf` (y `chown root:www-data`).
2. **`/run/mediafanout/locks` 0755 root:root → 0770 root:www-data** y limpiar los lock files viejos
   (`.lock` de pruebas de staging). El worker necesita crear/abrir locks; con 0755 root:root y usuario
   `mediafanout` no puede. El lock debe vivir **fuera** de la ventana (`MEDIA_FANOUT_DEPLOY.md:153`).
3. **`/run/mediafanout/spec`** está vacío; correcto. Verificar que no haya `*.env` con credenciales
   antes de limpiar; si hay, borrarlos con `shred`/`rm` y no volcarlos a logs.
4. **`mediafanout` inexistente.** Crear antes de cambiar `User=root` → `User=mediafanout`; si se cambia
   la unidad sin crear el usuario, el worker no arranca.
5. **Unidades no instaladas.** El código de staging está verificado (V3 PASS), pero no está desplegado.
6. **Comentario obsoleto en `ape-supervisor@.service:15-20`:** dice que la unidad de ingesta debe llevar
   `Restart=no` y no `WatchdogSec`; la unidad final verificada (`ape-ingest@.service:127-137,146`) usa
   `Restart=on-failure` + `RestartPreventExitStatus` (36 tokens) + `WatchdogSec=15` con `sd_notify`.
   **La fuente de verdad es la unidad final + V3**, no el comentario; corregir el comentario para que no
   induzca a un cambio que rompa el contrato de fencing.

### 4.2 Prerrequisitos que ya están en el código (cita para el despliegue)

`[observado]` `_vps_stage/media/ape-ingest@.service`:

- `RequiresMountsFor=/dev/shm /run/mediafanout` (`:105`): la ventana y el estado deben estar montados
  antes de arrancar.
- `User=root` / `Group=root` (`:160-161`) **temporal**; el diseño pide `User=mediafanout` /
  `Group=www-data` (`MEDIA_FANOUT_DEPLOY.md:157-161`). Cambiar **solo después** de crear el usuario y
  ajustar modos.
- `ProtectSystem=strict` + `ReadWritePaths=/dev/shm/mf` (`:164-165`), `ReadWritePaths=-/run/mediafanout`
  (`:167`): con `strict`, solo esas rutas son escribibles; `/run` queda read-only en el proceso.
- `ProtectProc=invisible` (`:183`): mitiga que la URL con ticket aparezca en `/proc/<pid>/cmdline`
  (riesgo residual de ffmpeg 6.1; `MEDIA_FANOUT_DEPLOY.md:209-228`).
- Límites: `MemoryMax=180M`, `MemoryHigh=150M`, `CPUQuota=60%`, `TasksMax=64`, `LimitNOFILE=4096`,
  `LimitCORE=0` (`:148-154`); `WatchdogSec=15`, `TimeoutStartSec=30`, `TimeoutStopSec=15`,
  `KillMode=mixed` (`:141-146`).
- `RestartPreventExitStatus` con 13 códigos + 23 señales (`:137`): systemd nunca reejecuta con el mismo
  spec; el supervisor es la única autoridad de lifecycle.
- `NoNewPrivileges`, `ProtectHome`, `PrivateTmp`, `PrivateDevices`, `ProtectKernel*`,
  `ProtectControlGroups`, `ProtectClock`, `ProtectHostname`, `RestrictNamespaces`, `RestrictRealtime`,
  `RestrictSUIDSGID`, `LockPersonality`, `RestrictAddressFamilies` (`:162-183`).

`[observado]` `_vps_stage/media/ape-supervisor@.service`:

- `User=root`, `Group=www-data`, `UMask=0007` (`:34-36`): necesita root para crear sockets, escribir
  `/var/lib/mediafanout` y arrancar/parar unidades.
- `ReadWritePaths=/run/mediafanout /var/lib/mediafanout /dev/shm/mf` (`:77`);
  `ProtectSystem=strict` (`:76`).
- `EnvironmentFile=-/etc/mediafanout/supervisor.env` (`:50`) opcional; `MF_MAX_SESSIONS=12`,
  `MF_STALE_AFTER=45` (`:45-46`); socket `mf.sock` + alias `supervisor.sock` (doc §3.1).
- `Restart=on-failure`, `RestartSec=2`, `StartLimitBurst=5` (`:54-57`); `MemoryMax=256M`,
  `CPUQuota=50%` (`:63-66`).

### 4.3 Orden de activación (con gates; no ejecutado)

**Precondición P0:** H1 resuelto y verificado (0 reinicios en 24 h). Si no, cualquier prueba E2E puede
caer en un `:15/:35/:55` y salir `INVALID_RUN` (`docs/MEDIA_FANOUT_CONCURRENCY_REPORT.md:243,250`).

| Fase | Acción | Comando (resumen) | Gate / rollback |
|---|---|---|---|
| **0. Ventana y backup** | Aprobación del propietario; snapshot de configs y unidades | `nginx -T > /root/pre-mf-$(date -u +%s).conf`; `cp -a /etc/nginx /root/nginx.bak`; `cp -a /etc/systemd/system/ape-*.service /root/ 2>/dev/null || true`; `systemctl status nginx --no-pager` | Si `nginx -t` no está verde, **no continuar** |
| **1. Usuario y directorios** | Crear `mediafanout`, grupo, dirs y modos | `useradd --system --no-create-home --shell /usr/sbin/nologin mediafanout`; `usermod -aG www-data mediafanout`; `install -d -m 0755 -o root -g root /etc/mediafanout`; `install -d -m 0750 -o root -g www-data /run/mediafanout /run/mediafanout/spec /var/lib/mediafanout`; `install -d -m 0770 -o root -g www-data /run/mediafanout/locks /dev/shm/mf`; `chmod 0770 /dev/shm/mf /run/mediafanout/locks`; `chown root:www-data /dev/shm/mf /run/mediafanout/locks`; `rm -f /run/mediafanout/locks/*.lock` (solo sin unidades activas) | `id mediafanout`; `stat -c '%a %U %G' /dev/shm/mf /run/mediafanout/locks` = 0770 root www-data |
| **2. Config de datos** | `providers.allow` (0640) y `urls.conf` (0640; **no** versionar; credenciales) | `install -m 0640 -o root -g www-data providers.allow.example /etc/mediafanout/providers.allow`; el operador escribe `urls.conf` | `nginx` no interviene aún; verificar que `urls.conf` no se loguea |
| **3. Binarios** | Instalar en `/usr/local/bin` y `/opt/mediafanout` (**nunca `/run`**) | `install -m 0755 ape-ingest.sh /usr/local/bin/ape-ingest.sh`; `install -d -m 0755 /opt/mediafanout`; `install -m 0755 ape-supervisor.sh /opt/mediafanout/`; `install -m 0644 ape-supervisor.lua /opt/mediafanout/` | `sha256sum` de cada binario contra V3 (`MEDIA_FANOUT_FINAL_VERIFICATION.md:14-20`) |
| **4. Unidades** | Instalar y validar | `install -m 0644 ape-ingest@.service ape-supervisor@.service /etc/systemd/system/`; `systemctl daemon-reload`; `systemd-analyze verify /etc/systemd/system/ape-ingest@.service /etc/systemd/system/ape-supervisor@.service`; `grep -E '^(User|Group|ReadWritePaths|ProtectProc|MemoryMax|CPUQuota|WatchdogSec|RestartPreventExitStatus)=' /etc/systemd/system/ape-ingest@.service` | `systemd-analyze verify` sin errores; los valores esperados aparecen en el `grep`; `RestartPreventExitStatus` parseado |
| **5. Supervisor** | Arrancar **solo** el supervisor (no las instancias de ingesta) | `systemctl enable --now ape-supervisor@main.service`; `systemctl status ...`; `ls -l /run/mediafanout/mf.sock` | socket 0660 `mediafanout:www-data` o `root:www-data`; log sin errores; `systemctl list-units 'ape-ingest@*'` vacío |
| **6. Staging test** | Banco V3 sin shim | `scp -r _vps_stage/* root@<vps>:/tmp/mf_stage/` (si no está ya); `MF_STAGE_SRC=/tmp/mf_stage bash /tmp/mf_stage/tests/fanout_concurrency.sh --shim-delay 0 --keep` | `RESULT=PASS_INVARIANT`, 28/28, exit 0; prod `journal_events=0`; si falla, rollback y no exponer |
| **7. Exposición 443** | Snippet + backup + `nginx -t` + **reload** | snippet propio del plano de sesión (no está en `_vps_stage`; seguir el patrón de `scripts/expose-443.sh`: backup del vhost, **una** línea `include`, `nginx -t` y `reload`); `nginx -t && systemctl reload nginx` | `nginx -t` verde; reload (nunca restart); probar desde fuera; rollback con el `unexpose-443.sh` correspondiente |
| **8. Generador** | Flag OFF por defecto; activar un solo host | `ape_session_mode=false` por defecto; luego `APE_SESSION_PROVIDERS` = un host de `providers.allow`; regenerar | 1 URL por canal; canales no habilitados siguen directos; 0 canales perdidos (`MEDIA_FANOUT_DEPLOY.md:439-446`) |
| **9. E2E real** | Player real sobre canal autorizado | VLC/hls.js/TiviMate; medir TTFF/rebuffer; V3 contra proveedor real | V3 repetido; si el proveedor no coopera, no declarar producción |
| **10. Rollback** | Parar plano, quitar include, validar y recargar | `systemctl stop ape-supervisor@main.service`; `systemctl stop 'ape-ingest@*'`; quitar include; `nginx -t && systemctl reload nginx`; conservar `/etc/mediafanout` | `nginx -t` verde; `journal_events=0`; sin unidades `ape-*` activas |

> **Ojo con `install -d`:** no siempre cambia el modo/propietario de un directorio **ya existente**. Por eso
> la fase 1 incluye `chmod 0770` + `chown root:www-data` explícitos sobre `/dev/shm/mf` y
> `/run/mediafanout/locks`; verificar con `stat` antes de seguir.

**Reglas de la ventana:**

- No instalar nada bajo `/run` (`noexec`, confirmado).
- No `apt install` (nginx 1.24 + lua 0.10.26 ya cubren todo; `MEDIA_FANOUT_DEPLOY.md:163-171`).
- No usar `systemctl restart nginx` en la ventana: **reload**; el bounce de H1 ya debe estar apagado.
- No exponer 443 hasta que la fase 6 pase; no activar el flag del generador hasta la fase 7/8.
- `urls.conf` es el único sitio con credenciales; no volcarlo a tickets/logs
  (`MEDIA_FANOUT_DEPLOY.md:149, 241-247, 646`).
- Cualquier cambio de raíz de ventana exige revisar `ReadWritePaths` **y** `RequiresMountsFor=`
  (`MEDIA_FANOUT_DEPLOY.md:204-207`).

### 4.4 Verificación final del despliegue

```bash
systemctl is-active ape-supervisor@main.service                  # active
systemctl list-units 'ape-ingest@*' --no-pager                  # las sesiones que correspondan
ls -l /run/mediafanout/mf.sock /run/mediafanout/spec            # socket 0660; spec 0640
stat -c '%a %U %G' /dev/shm/mf /run/mediafanout/locks           # 0770 root www-data
du -sh /dev/shm/mf                                              # <= 80 MiB por sesión
curl -sS http://127.0.0.1:8090/mf/health                        # JSON saneado
journalctl -u 'ape-ingest@*' -n 50 --no-pager                   # sin credenciales
```

---

## 5. Anexos

### A. Evidencia cruda (comandos y extractos)

Todas las lecturas se hicieron por SSH root read-only desde la estación del propietario. Ventana:
`2026-10-26T02:28–02:45Z`.

**A.1 Bounce**

```bash
journalctl -u nginx --since '24 hours ago' --no-pager -o short-iso | grep -c 'Started nginx'   # 52
journalctl -u nginx --since '24 hours ago' --no-pager -o short-iso | grep 'Started nginx' | tail -6
systemctl show nginx -p NRestarts -p ExecMainStartTimestamp -p ActiveEnterTimestamp
# NRestarts=0
# ExecMainStartTimestamp=Sun 2026-10-25 23:35:04 UTC
grep -ac 'EMPTY_RESTARTING' /var/log/cache-health.log                                          # 11096
grep -a 'EMPTY_RESTARTING' /var/log/cache-health.log | head -1
# 2026-04-25T07:55:01Z ... action=systemctl restart nginx + warmup
grep -a 'EMPTY_RESTARTING' /var/log/cache-health.log | tail -1
# 2026-10-25T23:35:01Z ... action=systemctl restart nginx + warmup
```

Cruce 1:1 (mismo minuto) entre las 52 líneas `EMPTY_RESTARTING` y los 52 `Started nginx`: **52/52**
`[observado]`.

**A.2 Watchdog propio**

```bash
journalctl --since '24 hours ago' --no-pager | grep -c 'health FAIL'         # 1
journalctl --since '24 hours ago' --no-pager | grep 'health FAIL'           # 07:35:04 (1/3)
journalctl --since '24 hours ago' --no-pager | grep -c 'nginx RELOAD ok'    # 0
journalctl --since '24 hours ago' --no-pager | grep -c 'nginx RESTART ok'   # 0
```

**A.3 SSH**

```bash
journalctl -u ssh --since '6 hours ago' --no-pager | grep -c 'Accepted publickey'      # 185
journalctl -u ssh --since '6 hours ago' --no-pager | grep 'Accepted publickey' \
  | sed -E 's/.*Accepted publickey for ([^ ]+) from ([^ ]+) port.*/\1 \2/' \
  | sort | uniq -c | sort -rn                                                          # 185 root 181.130.154.235
```

Fingerprint de la clave: `SHA256:sMdkciR+…` (coincide con `~/.ssh/id_ed25519_hetzner.pub` de la
estación) `[observado]`.

**A.4 Cache y nginx**

```bash
grep -rn 'proxy_cache' /etc/nginx/            # nginx.conf:81 path; conf.d/50-ape-meta-plane.conf:79 off
findmnt -no TARGET,OPTIONS /run                 # rw,nosuid,nodev,noexec,...
stat -c '%n %a %U %G %s %y' /dev/shm/nginx_cache # 700 www-data root 40 2026-07-03 ...
stat -c '%n %a %U %G' /dev/shm/mf                # 750 root www-data
id mediafanout                                   # no such user
```

**A.5 Breaker**

```bash
grep -n 'down:' /etc/nginx/lua/ape_gateway.lua        # :168, :169, :178 (antes del fix)
curl -sS http://127.0.0.1:8088/_ape/health           # "upstreams_down":0
curl -sS http://127.0.0.1:8088/_ape/qoe              # "hosts_down":{}
```

### B. Parches exactos

**B.1 `cache-health-monitor`** — ver §1.5 (diff de 6 líneas). Sustituye `systemctl restart nginx` por
`logger` + `status=EMPTY_CACHE_UNUSED` + `action=alert_only_no_restart`; mantiene la métrica JSON.

**B.2 `ape_gateway.lua`** — ver §2.4 (elimina el `if not HOSTS:get(dk)` y el `HOSTS:set(dk,1,15)`;
conserva `qinc("host_down")`).

**B.3 Comentario `meta-plane.conf:45`** — “telemetría de fallos; sin castigo ni bloqueo (autopista)”.

### C. Auditoría de reinicios (drop-in, sin paquetes nuevos)

Ver §1.5/P1: `ape-nginx-start-audit.sh` + `nginx.service.d/20-audit-restart.conf` + logrotate.
Caveat: captura `systemctl` vivo; no una llamada D-Bus ya terminada. `auditd`/`bpftrace` no están
instalados y `apt install` está prohibido en este VPS; si el propietario autoriza instalarlos en una
ventana, la regla canónica es:

```bash
# NO ejecutar en esta sesión (auditd no está instalado)
# /etc/audit/rules.d/ape-restart-audit.rules
-a always,exit -F arch=b64 -F path=/usr/bin/systemctl -F perm=x -k ape_systemctl
```

### D. Comandos de reproducción read-only

```bash
# H1
journalctl -u nginx --since '24 hours ago' --no-pager -o short-iso | grep -E 'Started nginx|Stopping'
grep -a 'EMPTY_RESTARTING' /var/log/cache-health.log | tail -20
grep -rn 'proxy_cache' /etc/nginx/
# H2
grep -n 'down:' /etc/nginx/lua/ape_gateway.lua
grep -n 'hosts_down' /etc/nginx/lua/ape_obs.lua
# H3
nproc; lspci | grep -Ei 'vga|3d'; command -v nvidia-smi vainfo
# H4
id mediafanout; findmnt -no TARGET,OPTIONS /run; stat -c '%a %U %G' /dev/shm/mf /run/mediafanout/locks
systemctl list-unit-files | grep -E 'ape-ingest|ape-supervisor' || echo none
```

### E. Desconocidos y límites honestos

- **Duración exacta del corte por reinicio:** **[no disponible]**; no se midió con un cliente durante un
  reinicio. Se propone medirlo en staging antes de dar una cifra de “segundos caídos”.
- **Coste/availability real de un nodo GPU:** **[no disponible]**; el diseño de `VPS_UPSCALE_4K_DESIGN.md`
  da canales concurrentes y egress, no precio.
- **Benchmark 4K:** no se re-ejecutó en esta sesión para no cargar la CPU de producción; se refrendan
  las medidas de W1/t1 en el mismo host y se verificaron las entradas de hardware.
- **Journal de SSH:** la ventana retenida empieza ~18:04Z; no se puede afirmar “no hubo sesiones” antes
  de esa hora, solo que la correlación causal no es necesaria (52/52 con el log de cache).
- **`ape-meta-watchdog`**: su único evento coincide con un reinicio de cache; no se puede descartar que
  en el futuro vuelva a actuar si el health falla de verdad. Su lógica es correcta (reload primero,
  restart solo si `nginx -t` falla); no se propone cambiarla.
- **HDR/8K:** fuera de alcance de esta sesión; se mantiene el NO-GO/prohibición de la doctrina.

---

### F. Mapa de evidencia (resumen)

| Afirmación | Etiqueta | Fuente |
|---|---|---|
| 52 `Started nginx`/24 h; 52/52 con `EMPTY_RESTARTING` | `[observado]` | journal + `/var/log/cache-health.log` (2026-10-26T02:28Z) |
| 11 096 reinicios desde 2026-04-25 | `[observado]` | `grep -ac EMPTY_RESTARTING` |
| El restarter es `cache-health-monitor:53` | `[observado]` | script con `cat -n`; cron `/etc/cron.d/cache-health-monitor:3` |
| La cache está `off` y la zone no se usa | `[observado]` | `/etc/nginx/nginx.conf:81`; `50-ape-meta-plane.conf:79`; `grep` |
| Watchdog propio: 1 evento/24 h, 0 reload/restart | `[observado]` | `journalctl` (07:35:04) |
| SSH: 185/6 h, una IP, clave del propietario | `[observado]` | `journalctl -u ssh`; `ssh-keygen -lf` |
| Breaker `down:<host>` TTL 15 | `[observado]` | `ape_gateway.lua:168-179`; `meta-plane.conf:45-46` |
| 502 sin `reason` al saltar todos los hosts | `[observado: código]` | `ape_gateway.lua:185-192`; `cjson` nil |
| Autopista: nunca breaker por host | `[observado]` | `CLAUDE.md:381-385, 540` |
| 4K: 0,356×; 7,61 core·s/s; 3 vCPU; sin GPU | `[observado]` | `MEDIA_FANOUT_FEASIBILITY.md:325-346`; `lspci`/`nproc` |
| GPU T4 1–2; L4/A10 2–4 canales 4K30 | `[observado]` | `VPS_UPSCALE_4K_DESIGN.md:100-105` |
| Prerrequisitos: usuario/dirs/modos/unidades | `[observado]` | `id`, `stat`, `findmnt`, `systemctl list-unit-files` |
| `ReadWritePaths`/`ProtectProc`/límites | `[observado]` | `ape-ingest@.service:105,148-183` |
| Orden de activación | `[observado]` | `MEDIA_FANOUT_DEPLOY.md:674-691` + este doc §4.3 |

---

**Fin del entregable.** No se aplicó ningún cambio en producción. Los parches de §1.5 y §2.4 están
listos para una tarea de implementación separada, con backup, `bash -n`/`luac -p`, `nginx -t` y
`systemctl reload nginx` (nunca `restart`).

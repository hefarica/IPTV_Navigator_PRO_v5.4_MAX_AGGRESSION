# T19_REVIEW — Review independiente de T19 (`proxy_read_timeout` 5s → 60s en `/meta/` y `/_ape/_fetch`)

**Review de:** t19 · **Revisor:** `json-ssot` (t28) · **Modo:** **SOLO LECTURA sobre el VPS** (SSH `hetzner-iptv`,
root@178.156.147.234) · **Fecha:** 2026-10-25 23:47–23:55 (America/Bogota) / 04:47–04:55 UTC
**Fuentes de las afirmaciones revisadas:** `40-vps/VPS_REMEDIATION_LOG.md` (T19) y `40-vps/VPS_REMEDIATION_LOG_2.md` (T22, sólo para delimitar autoría).

**VERDICT: `pass`** — los 9 criterios de aceptación se cumplen contra el estado vivo. Tres observaciones **no
bloqueantes** al final (§7).

**Evidencia cruda (capturada, no transcrita de los logs):**
`reviews/T19_live_evidence.txt` (run 1) y `reviews/T19_live_evidence_2.txt` (run 2) ·
script reproducible `reviews/verify_t19_readonly.sh` (sólo `stat/sha256sum/grep/nginx -T/nginx -t/systemctl
show/curl GET/diff/ps/ls/cat`).

---

## 1. Config viva — ✅ PASS

```
stat  → /etc/nginx/conf.d/50-ape-meta-plane.conf|10941|644|root:root|2026-10-26 04:33:48.187178823 +0000
sha256sum → 3e29b9280c05de36c4af445e8a9722573a23c865f240e2d87b2734178e60c515
```

| Criterio | Esperado | Medido | Veredicto |
|---|---|---|---|
| Tamaño | 10.941 B | **10.941** | ✅ |
| SHA-256 | `3e29b9280c05de36c4af445e8a9722573a23c865f240e2d87b2734178e60c515` | **idéntico** | ✅ |

## 2. `nginx -T`: 60s en los dos contextos objetivo + `nginx -t` OK — ✅ PASS

```
298:        proxy_read_timeout      60s;     ← location ~ ^/meta/
422:        proxy_read_timeout      60s;     ← location = /_ape/_fetch
519:        proxy_read_timeout 300s;         ← coa-navigator (ajeno, intacto)
535:        proxy_read_timeout 86400s;       ← websocket (ajeno, intacto)
826:    proxy_read_timeout 60s;              ← /cdn/ del 443 (esto es T22, ver §5)
-- restos de "5s": 0
```
```
nginx -t → "configuration file /etc/nginx/nginx.conf syntax is ok" / "test is successful"  · exit 0
```
✅ Los dos contextos que T19 debía tocar están a **60s**; **cero** `proxy_read_timeout 5s` en todo el dump;
la configuración **valida**.

## 3. Servicio: reload, no restart — ✅ PASS

```
MainPID=2001835 · NRestarts=0 · ActiveState=active · SubState=running
ActiveEnterTimestamp=Sun 2026-10-25 23:35:04 UTC
/run/nginx.pid → 2001835
ps → 2001835  Sun Oct 25 23:35:04 2026  ELAPSED=18659s  nginx: master process /usr/sbin/nginx
```

| Criterio | Medido | Veredicto |
|---|---|---|
| `nginx` activo | `active (running)` | ✅ |
| **Mismo MainPID** que en T19/T22 | **2001835** — el `VPS_REMEDIATION_LOG_2.md` (T22) documenta explícitamente que “el master **2001835** sobrevivió”; el PID vivo es el mismo | ✅ |
| `NRestarts=0` | `0` | ✅ |
| ¿Reload? | El master arrancó **23:35:04 UTC** y la config se escribió **04:33:48 UTC** del día siguiente (5 h después) ⇒ el proceso **no** reinició; el cambio entró por reload | ✅ |

## 4. `/_ape/health` en **:8088** — ✅ PASS

```
curl -o /dev/null -w '%{http_code}' http://127.0.0.1:8088/_ape/health → 200
body → {"checks":{...,"nginx":true,"shared_dicts":true,"upstreams_down":0},"plane":"meta/v3","ok":true, ...}
```
✅ **200** con **`"ok": true`** y `shared_dicts: true`.

## 5. Snapshot `.bak` fuera de `/etc/nginx`, rollback, dump previo y diff — ✅ PASS (por T19) con 1 hunk extra de T22

**Snapshot:**
```
/root/nginx-bak                            → mode 700 (directorio)
/root/nginx-bak/50-ape-meta-plane.conf.bak_20261026T043331Z → 10.939 B · 644 · mtime 2026-10-24 17:59:36
sha256 → e06ee870c55201c359990d99459aa9784d01569f5200176cfffed3448525d3f9
case "/root/nginx-bak/…" in /etc/nginx/*) FAIL;; *) OK  → FUERA_DE_ETC=OK
```
| Criterio | Medido | Veredicto |
|---|---|---|
| `.bak` fuera de `/etc/nginx` | `/root/nginx-bak/` (mode **700**) | ✅ |
| Hash previo | `e06ee870…` (idéntico al declarado) | ✅ |
| Tamaño previo | 10.939 B | ✅ |

**Rollback (documentado y ejecutable — NO ejecutado por este revisor):** T19 §7.1:
```bash
cp -p /root/nginx-bak/50-ape-meta-plane.conf.bak_20261026T043331Z /etc/nginx/conf.d/50-ape-meta-plane.conf \
  && nginx -t && systemctl reload nginx
# verificación: sha256sum → e06ee870c55201c359990d99459aa9784d01569f5200176cfffed3448525d3f9  y 10939 B
```
✅ Ejecutable: el `.bak` existe, tiene ese hash exacto y el comando es literal.

**Dump previo y diff:**
```
/root/nginx-before-20261026T043331Z.conf → 35.972 B · sha256 4532d37e8323be43b21c5cdd373b17e605898038eed3ea56cdf13dff8f688ad8
/root/nginx-after-20261026T043331Z.conf  → 35.974 B · sha256 14052b235aecf842a65be2824d68f88e240fb1172df27d728ad42d0c41fbfa06

diff before(T19) → after(T19):  exit 1 · **hunks = 2** · líneas cambiadas = 4
  -        proxy_read_timeout      5s;      +        proxy_read_timeout      60s;   (×2)
```
✅ **El diff de T19 es exactamente 2 hunks** (las dos líneas de `proxy_read_timeout`; `proxy_send_timeout 5s`
aparece como contexto, sin cambios).

**Sobre el diff del dump VIVO (3 hunks):** el dump actual difiere del `before` de T19 en **3 hunks**, y el tercero
**no es de T19**:
```
T19 after (línea 826):  proxy_read_timeout 20s;
dump vivo  (línea 826):  proxy_read_timeout 60s;
```
Ese 20s→60s es el `/cdn/` del 443 que cambió **T22** (`VPS_REMEDIATION_LOG_2.md` PARTE B). **Declarado fuera de
esta review** según la aceptación (“Cualquier cambio posterior de T22 se declara como fuera de esta review”).
Prueba de autoría en §6.

## 6. Nada prohibido cambió — ✅ PASS (con 1 archivo cambiado **por T22**, declarado fuera de alcance)

| Archivo | Hash esperado (T19) | Hash medido ahora | Veredicto |
|---|---|---|---|
| `/etc/nginx/conf.d/iptv-limit-conn.conf` | `917c98d819576f55fe60547ce0d5330f3d5fd2a32bcbc7cd73d524f876c3ec58` | **idéntico** | ✅ `limit_conn` intacto |
| `/etc/nginx/nginx.conf` | `a9a7146a46b4080f32e0fd1e40772bce53cac3a8f0cd18ed2e1ebc5c31d4ce1f` | **idéntico** | ✅ `proxy_cache_path` intacto |
| `/etc/nginx/lua/ape_uhd.lua` | `f1f5eb674744858ae7c5e84c73262e37545b0c84e557c6466cad20ae7b1f3b5e` | **idéntico** | ✅ B-08 intacto |
| `/etc/cron.d/cache-health-monitor` | `15bf1488e547723c2e2b0132a83a5b83697141e4a1d382fc2afabc4e68817bb7` | **idéntico** | ✅ cron intacto **y deshabilitado** (`# DESHABILITADO 2026-10-25 bucle-proxy_cache-off: */5 …`) |
| `/var/www/lists/APE_LISTA_1792869328847.m3u8.gz` | `7f1cd8a7f3dd58960c7dfde373ed115eeeac5be4a72a1d1fc5850636f9ccc360` | **idéntico** · 297.134.088 B · mtime 2026-10-25 17:56:21 | ✅ lista servida intacta |
| `/etc/nginx/snippets/ape-meta-public.conf` | `0a4002166054834c756d5451da49f8e9aa6327f5672a1e625a9c044df9ff91de` | **`a39e8de902cf5449553822eb1682d1a9d481390c1ce136a218d91fbe1ee4ac39`** | ⚠️ **cambiado por T22** (ver abajo) |

**Autoría del cambio en `snippets/ape-meta-public.conf` (prueba, no suposición):**
```
/root/nginx-bak/ape-meta-public.conf.bak_20261026T043703Z → 2.509 B · sha256 0a4002166054834c756d5451da49f8e9aa6327f5672a1e625a9c044df9ff91de
```
El `.bak` que **T22** creó (**04:37:03 UTC**, posterior al `after` de T19 de 04:33) contiene **exactamente** el hash
que T19 registró ⇒ en el momento de T19 ese archivo estaba intacto (`0a400216…`) y el valor actual (`a39e8de9…`)
proviene del cambio 20s→60s de T22. **Fuera de esta review**, como manda la aceptación.

**Timers `netshield-*`** (`systemctl list-timers --all`): `netshield-autopilot`, `netshield-backup`,
`netshield-health`, `netshield-sentinel`, `netshield-wg-health` → **todas sin próxima ejecución / inactivas**
(columnas `-`). ✅ Ninguna se activó.

## 7. Observaciones (no bloqueantes, no afectan al verdict)

| # | Observación | Por qué no bloquea |
|---|---|---|
| **OBS-1** | El diff del dump **vivo** contra el `before` de T19 son **3 hunks**, no 2 | El 3.º es el 20s→60s del `/cdn/` 443 de **T22** (línea 826), probado en §5/§6 y declarado fuera de alcance. **El diff de T19 solo = 2 hunks** ✅ |
| **OBS-2** | El archivo `.bak` es mode **644**; el mode **700** lo tiene el directorio `/root/nginx-bak` | La aceptación pide el snapshot “fuera de `/etc/nginx` (mode 700)” y eso se cumple (directorio 700 ⇒ nadie sin root puede atravesarlo). Defensa en profundidad opcional: `chmod 600` al `.bak` (lo decide el owner) |
| **OBS-3** | `/ _ape/health` responde 200 `ok:true`, pero el payload muestra degradación de upstream en runtime: `host_down:line.tivi-ott.net:1`, `all_failed:3`, `error_ratio:0.4286` | T19 **no tocó** upstreams ni contenido (los 6 hashes de §6 lo prueban). Es estado operativo del plano meta, competencia del lane VPS (no de esta review). Se reporta para que no pase inadvertido |

## 8. Atestación de solo lectura del revisor (t28)

Comandos ejecutados por SSH, **todos de lectura** (dos sesiones `bash -s` por stdin, `ssh_exit=0`):

```
stat -c …                     sha256sum …                   case … in /etc/nginx/*)…   # snapshot fuera de /etc/nginx
nginx -T | grep -n …          nginx -T | grep -c …          nginx -t                   # dump y validación
systemctl show nginx -p MainPID -p NRestarts -p ActiveState -p SubState -p ActiveEnterTimestamp
cat /run/nginx.pid            ps -o pid,lstart,etimes,cmd -p <MainPID>
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8088/_ape/health   # GET, sin cuerpo modificado
curl -s http://127.0.0.1:8088/_ape/health | head -c 500
diff -u before after          diff -u before <(nginx -T)      # sólo lectura
ls -l …                       head -3 /etc/cron.d/…          systemctl list-timers --all --no-pager
```

**Cero mutaciones:** no se ejecutó `cp`, `sed -i`, `mv`, `rm`, `nginx -s reload`, `systemctl restart|reload`,
`chmod`, `chown`, `touch`, ni ninguna escritura; **no** se ejecutó el rollback (sólo se verificó que es ejecutable).
No se creó ni modificó ningún archivo en el VPS. La única escritura de t28 fue en el repo local:
`40-vps/reviews/` (esta review + 2 capturas de evidencia + el script).

**Confirmación post-review (3.ª sesión SSH, `2026-10-26 ~04:56 UTC`):** re-medidos los 6 archivos vigilados y el
servicio; **todos los hashes idénticos** a los de la 1.ª sesión (`3e29b928…` config, `e06ee870…` .bak,
`917c98d8…` limit-conn, `a9a7146a…` nginx.conf, `f1f5eb67…` ape_uhd.lua, `7f1cd8a7…` lista) y
`MainPID=2001835 / NRestarts=0` ⇒ **la propia review no alteró nada**. Nota de transparencia: esa 3.ª sesión usó un
snippet con finales CRLF y `bash` emitió `$'\r': command not found` en la última línea; **todos los comandos
anteriores se ejecutaron y devolvieron salida**, y el aviso es cosmético (no hubo ninguna escritura).

## 9. Checklist de aceptación

| # | Criterio | Resultado |
|---|---|---|
| 1 | Config viva = 10.941 B / `3e29b928…` | ✅ **exacto** |
| 2 | `proxy_read_timeout 60s` en `/meta/` y `/_ape/_fetch`; `nginx -t` OK | ✅ (L298, L422; 0 restos de 5s; test successful) |
| 3 | `nginx` activo, mismo MainPID, `NRestarts=0` | ✅ (2001835, 0, activo; master de 23:35 UTC vs config de 04:33 UTC ⇒ reload) |
| 4 | `/_ape/health` en :8088 → 200 `ok:true` | ✅ |
| 5 | Snapshot `.bak` fuera de `/etc/nginx` (mode 700) con hash previo `e06ee870…` | ✅ (dir 700, archivo 10.939 B `e06ee870…`) |
| 6 | Rollback documentado y ejecutable | ✅ (comando literal + `.bak` con el hash esperado; no ejecutado) |
| 7 | Dump previo existe; diff del dump = **2 hunks** | ✅ (T19: 2 hunks; el 3.º del dump vivo es T22) |
| 8 | Nada prohibido cambió (5 de 6 idénticos + `snippets/ape-meta-public.conf` cambiado por T22, fuera de alcance) | ✅ |
| 9 | Atestación de solo lectura, 0 mutaciones | ✅ (§8) |

**VERDICT: `pass`.** T19 hizo exactamente lo que declaró: **1 directiva, 2 líneas, 1 archivo**, por **reload**
(PID vivo, `NRestarts=0`), con `.bak` externo verificable, rollback ejecutable y sin tocar nada de la lista de
prohibidos. La única diferencia respecto al estado de T19 (`snippets/ape-meta-public.conf` y el `/cdn/` del 443 a
60s) es **T22**, correctamente declarada fuera de esta review.

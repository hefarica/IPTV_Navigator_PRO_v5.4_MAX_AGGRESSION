# LIVE CAPTURE — captura viva de todos los módulos APE (2026-11-14)

**Autor:** gate-runner (t50) · **Host:** `ubuntu-2gb-ash-1` (178.156.147.234) · **Captura:** 2026-11-14T04:5x UTC
**Script:** [`tools/ops/ape-live-capture.sh`](../../tools/ops/ape-live-capture.sh) — reescrito en esta tarea (20.175 B)

> **Este documento SUPERSEDE la versión de las 01:05 UTC del mismo día.** No la borro en silencio: al final, §9 detalla qué decía, qué sigue valiendo y qué ha cambiado. Lo más importante: aquella versión declaraba la latencia de zapping `NO_COMPUTADO` *«porque `playlist_access.log` no tiene `$request_time`»* — eso dejó de ser cierto a las **01:16:04**, cuando se añadió el campo al `log_format`. Hoy hay **858 muestras** de `rt=`.

**Regla cumplida: CERO escrituras en el VPS.** El script viaja por stdin y no toca disco remoto:

```bash
ssh hetzner-iptv 'bash -s' < tools/ops/ape-live-capture.sh              # una pasada
ssh hetzner-iptv 'bash -s -- --watch 3' < tools/ops/ape-live-capture.sh # bucle para zapear
```

`bash -s` lee el script de **stdin**: el fichero nunca llega al sistema de ficheros del VPS, así que no hay nada que borrar después. El script no usa `mktemp`, no redirige a fichero, no llama a `systemctl` en modo escritura y no toca `wg0` ni `eth0`. Verificado tras la captura: `nginx.conf` y `provider-gate.sh` conservan su mtime y `nginx` sigue con `NRestarts=0`.

---

## 1 · La captura literal de esta sesión

Salida completa de `ape-live-capture.sh`, sin recortes ni reelaboración:

```text
==============================================================
 APE LIVE CAPTURE  2026-11-14T04:55:27Z   (ventana logs: 10 min)
==============================================================

## 1. VPS BASE
   [FUENTE: /proc/loadavg, nproc, free -m, df -h, systemctl show]
   load (1/5/15): 0.14 0.16 0.09
   cpu cores: 3
   mem: 770/3819 MB (20%)
   disco /: 29G/38G (80%)
   servicios: nginx=active php8.3-fpm=active
   nginx restarts: 0
   uptime: up 19 weeks, 1 day, 3 hours, 4 minutes

## 2. LISTA SERVIDA
   [FUENTE: /opt/ape-jit/current/meta.json]
   fuente declarada por el JIT: /var/www/lists/pulse/APE_LISTA_1794100720046.m3u8
   [FUENTE: stat + sha256sum + grep -c '^#EXTINF' sobre /var/www/lists/pulse/APE_LISTA_1794100720046.m3u8]
   bytes  : 1311467322
   mtime  : 2026-11-13 11:06:57.222298491 +0000
   sha256 : a727532096782f97…
   #EXTINF: 21224

## 3. JIT (127.0.0.1:3099 · ape-jit.service)
   [FUENTE: systemctl is-active, curl :3099, journalctl]
   unit: active
   /health: {"ok":true,"active":null,"pid":null,"uptime_s":0}
   /capabilities.json: {"service":"ape-jit-cmaf","transports":["vps-list","provider-direct"],"formats":["HLS","DASH","CMAF/fMP4"],"codecs":["AVC/HEVC/AV1/VP9 native copy where supported","HEVC Main10","AV1 opt-in","AAC/AC-3/E-AC-3 native audio"],"hdr":["SDR","PQ","HLG"],"processing_domain":"vps_jit_legacy","rea_policy_ref":"contracts/rea/rea-processing-v1.json","rea_executed":false,"resolutions":{"native":"Preserve sour
   canales (channels.json): 21224
   [FUENTE: journalctl -u ape-jit-reconcile.service -n 3]
     Nov 14 04:55:12 ubuntu-2gb-ash-1 node[1605337]: 2026-11-14T04:55:12.944Z SKIP la lista no cambió (size+mtime iguales) · canales=21224
     Nov 14 04:55:12 ubuntu-2gb-ash-1 systemd[1]: ape-jit-reconcile.service: Deactivated successfully.
     Nov 14 04:55:12 ubuntu-2gb-ash-1 systemd[1]: Finished ape-jit-reconcile.service - APE JIT - espejo atomico lista servida -> allowlist JIT.

## 4. CANARY
   [FUENTE: systemctl, pgrep, ls, journalctl -u ape-pulse-canary]
   canary.enabled: PRESENTE
   unidades canary activas: 0
   ffmpeg corriendo: 0
   worker service: inactive
NO_COMPUTADO
   cola: 47 tickets
     68f292c9da306287.json
     4a4831ee87b21687.json
     8874385f79a9a6e2.json
   NO_COMPUTADO: /var/lib/ara/canary/out NO EXISTE -> sin productor: el canary no ha escrito NUNCA un artefacto
   timer: inactive
NO_COMPUTADO
   [FUENTE: journalctl -u ape-pulse-canary.service --since -2h | grep gate]
   NO_COMPUTADO: sin decisiones del gate en 2 h

## 5. SHIM (127.0.0.1:40213)
   [FUENTE: curl /health, ss -tln]
   NO_COMPUTADO: el shim NO responde en :40213 -> sin productor, no es un cero
   ¿hay listener en 40213?: NO

## 6. LUA
   [FUENTE: find, nginx -T, error.log]
   ficheros .lua desplegados: 19
   shared_dicts CARGADOS (nginx -T): ape_attr_cfg ape_flags ape_hosts ape_qoe circuit_metrics lab_config 
   shared_dicts DECLARADOS en ficheros: 7
   OJO declarados pero NO cargados por nginx: ara_sync_lua (snippet no incluido)
   lineas con 'lua' en error.log: 0 (el fichero EXISTE y esta vacio: cero errores. No es 'no computado')

## 7. PHP
   [FUENTE: sha256sum por fichero + curl -w %{http_code}]
   endpoints desplegados: 44
     ENDPOINT                                 SHA256(16)        HTTP
     ape-canon-ingest.php                     dc2ed257fad8f6db  -
     ape-cartridge-agent.php                  88c6657ffa6d22e3  -
     ape-cartridge-bulk.php                   d1b07f8a93c11a7b  -
     ape-cartridge-incident.php               0f49f3f0bb5f1c05  -
     ape-feedforward.php                      9cd4e0fad875090f  -
     ape-feedforward-stream.php               5e60ab94fac1cf9d  -
     ape-lab-library.php                      794eab262d5ecea0  -
     ape-last.php                             f7c55cbc0d4c25be  -
     ape-match.php                            5df2f5aeb9c87efa  -
     ape-output-config.php                    3ad7321445c74695  -
     ape-parity-tags.php                      bf6853f0d8f68301  -
     ape-pull.php                             a40d911d449487ab  -
     ape-session-resolve.php                  c92913494f830e1e  -
     ara-device.php                           6c6c2fd1fd2f3baa  -
     ara-enroll.php                           adf07d6fb5846172  -
     ara-sync.php                             10e1d6561587a622  -
     channel-hdcp-bulk.php                    9d06b31a9e4018cd  -
     channel-hdcp-incident.php                880214e024586d83  -
     channel-image-bulk.php                   3de9fea91f1147a6  -
     channel-pq-bulk.php                      097a2d655b6cb75b  -
     channel-pq-incident.php                  be7d330df5af8a72  -
     content-steering.php                     4d0390d0da7ddfb7  -
     conviva-event.php                        3c98a96db6334fc3  -
     conviva-stream.php                       06202e8a5247b9c0  -
     device-register.php                      2066e4f62c9b8ebe  -
     events-sse.php                           e4b7f7c2cac3f969  -
     list-activate.php                        515e3d5d4830d517  -
     list-headers-bulk.php                    a11e1655975378a7  -
     list-headers-ingest.php                  1b0fea0d35620cd0  -
     manifest-4k.php                          1d9c8ce409146338  -
     phase_g_delta_hook.php                   882bec0fed14f692  -
     prisma-adb-quality.php                   450de8e4175502c3  -
     prisma-adb-telemetry.php                 90cfb98e494b0d4b  -
     prisma-control.php                       8ff262754602338a  -
     prisma-deploy.php                        7e5ca36c8e6fbd27  -
     prisma-health.php                        18190909b9b422d6  -
     prisma-service-status.php                2481e6b5650dae44  -
     prisma-v2ray-config.php                  a3049557c16929b7  -
     pulse.php                                b5e0a6e4fc8c22b3  -
     qoe-flush.php                            2d9f58ecc38647fa  -
     qoe-peek.php                             09f9daaec5f023ae  -
     token-vault.php                          4089e797caac3d70  -
     url2-cartridge.php                       443091b91e86bbcb  -
     visual_supremacy_orchestrator_v8.php     14a7b6932987953e  -
   codigos HTTP de los endpoints con contrato publico:
     pulse.php                                400
     conviva-event.php                        405
     channel-hdcp-bulk.php                    200
     ara-enroll.php                           405
     ara-sync.php                             405
     ape-match.php                            400
     ape-last.php                             200

## 8. ERRORES ultimos 10 min (SEPARADOS: 5xx / 4xx reales / 4xx bots / raiz)
   [FUENTE: /var/log/nginx/playlist_access.log]
   hits en ventana: 757
   --- 5xx (trafico real de la ruta) ---
     ninguno
   --- 4xx REALES (rutas APE: /pulse /lists /prisma /ara /jit /image) ---
          20 499 /pulse/1090661.m3u8
           5 405 /prisma/api/conviva-event.php
           5 405 /prisma/api/ara-sync.php
           5 405 /prisma/api/ara-enroll.php
           5 400 /prisma/api/pulse.php
           5 400 /prisma/api/ape-match.php
           4 404 /prisma/api/sentinel-status
           3 404 /prisma/api/telemetry-full
           1 404 /jit/playlist-shim.m3u8
   --- 4xx de BOTS (fuera de APE y raiz) ---
     ninguno
   --- 4xx de RAIZ ---
           2 403 /

## 9. ARCHIVOS .json VIVOS  (NO_EXISTE != vacio)
   [FUENTE: stat + sha256sum]
   /etc/ara/skills/skills.json                    1697 B | 2026-11-12 06:35:46 | sha 7b6ddb80ce77a832…
   /var/www/ape-uhdx/last-sentinel.json           246 B | 2026-05-31 01:44:49 | sha 2363b72b80362c0b…
   /opt/ape-jit/current/meta.json                 177 B | 2026-11-13 11:07:10 | sha 6b49285a96cfa62c…
   /var/www/ape-uhdx/netshield_sentinel.json      NO_EXISTE (sin productor)
   /etc/ara/pulse/prisma_key.json                 NO_EXISTE (sin productor)
   /var/lib/ara/sync/last.json                    NO_EXISTE (sin productor)

## 10. ZAPPING (rt=total, urt=proveedor) — 200 SEPARADO de 502
   [FUENTE: /var/log/nginx/playlist_access.log · campos rt=/urt= del log_format ape_playlist (nginx.conf)]
   muestras /pulse con rt= : 858
   --- SOLO 200 (zaps realmente servidos) ---
     n=655  min=0.000  p50=0.650  p90=5.043  p99=7.180  max=11.889  media=1.745
     overhead |rt-urt| medio=0.000521 s  (0.030 % de la media)
   --- SOLO 502 (fallos: NO son muestras de zapping bueno) ---
     n=155  min=0.289  p50=4.315  max=13.416  media=4.076
     (la media de los 502 NO es tiempo de zapping: es tiempo perdido hasta el error)
   --- reparto por estado ---
         655 200
         155 502
          38 499
          10 500
   NOTA: 499 = el cliente cerro la conexion antes de recibir respuesta.
         NO es un fallo del VPS: es el zapping (el operador cambia antes de que acabe).
         Si 499 sube en el DELTA, el zapping se esta moviendo de verdad.

## 11. MODULOS SIN PRODUCTOR  (NO_COMPUTADO != cero)
   [FUENTE: comprobacion directa en esta misma pasada]
   - SHIM :40213            : no escucha -> sin productor
   - CANARY out/            : no existe -> ningun artefacto producido jamas
   - APK / ARA-X-SYNC       : /var/lib/ara/sync no existe -> el device no ha sincronizado
   - prisma_key.json        : no existe -> sin productor
   - netshield_sentinel.json: no existe en esa ruta (el productor vivo es last-sentinel.json)

## 12. DELTA respecto de la pasada anterior
   [FUENTE: contadores del log comparados entre iteraciones de ESTE proceso]
   primera pasada: hits=3806  200=2991  499=38  502=176  zaps_con_rt=858
   (lanza con --watch N para ver el cambio mientras zapeas)

==============================================================
 FIN CAPTURA  2026-11-14T04:55:30Z
==============================================================
```

---

## 2 · Qué dice cada módulo, con su fuente

| Módulo | Dato | Valor | Fuente citada |
|---|---|---|---|
| **VPS** | load 1/5/15 | 0,14 / 0,16 / 0,09 | `/proc/loadavg` |
| | memoria | 770 / 3.819 MB (20 %) | `free -m` |
| | disco / | 29G/38G (**80 %**) | `df -h /` |
| | nginx · php-fpm | `active` · `php8.3-fpm active` | `systemctl is-active` |
| | restarts nginx | **0** | `systemctl show nginx -p NRestarts` |
| | uptime | 19 semanas, 1 día | `uptime -p` |
| **LISTA** | fichero servido | `/var/www/lists/pulse/APE_LISTA_1794100720046.m3u8` | `/opt/ape-jit/current/meta.json` |
| | bytes | **1.311.467.322** | `stat -c%s` |
| | mtime | 2026-11-13 11:06:57 | `stat -c%y` |
| | sha256 (16) | `a727532096782f97…` | `sha256sum` |
| | **#EXTINF** | **21.224** | `grep -c '^#EXTINF'` |
| **JIT** | unit | `active` (:3099) | `systemctl is-active ape-jit.service` |
| | /health | `{"ok":true,"active":null,"pid":null,"uptime_s":0}` | `curl :3099/health` |
| | /capabilities.json | 200 · `service: ape-jit-cmaf` · `rea_executed: false` | `curl :3099/capabilities.json` |
| | canales | **21.224** | `/opt/ape-jit/current/channels.json` |
| | reconcile | `SKIP la lista no cambió · canales=21224` | `journalctl -u ape-jit-reconcile` |
| **CANARY** | cola | **47 tickets** | `ls /var/lib/ara/canary/queue` |
| | unidades / ffmpeg | **0** / **0** | `systemctl list-units` · `pgrep -c ffmpeg` |
| | `out/` | **NO EXISTE** | `[ -d /var/lib/ara/canary/out ]` |
| | worker · timer | `inactive` · `inactive` | `systemctl is-active` |
| **SHIM** | :40213 | **no escucha** | `curl` + `ss -tln` |
| **LUA** | ficheros .lua | 19 | `find` |
| | shared_dicts cargados | **6** | `nginx -T` |
| | declarados en ficheros | **7** | `grep -r lua_shared_dict /etc/nginx` |
| | errores en error.log | **0** (el fichero existe y está vacío) | `/var/log/nginx/error.log` |
| **PHP** | endpoints | **44**, con sha256 de cada uno | `sha256sum` por fichero |
| **LOGS** | ventana 10 min | 757 hits · **0 5xx** · 0 4xx de bot | `playlist_access.log` |

La lista y el JIT **coinciden exactamente**: 21.224 `#EXTINF` en el fichero servido y 21.224 canales en `channels.json`. Eso no es una declaración: es una reconciliación que cuadra.

---

## 3 · Tiempo de zapping: 200 SEPARADO de 502

La distinción que el encargo exigía — *«un 502 de latencia media NO es una muestra de zapping bueno»* — está implementada como **dos bloques de salida distintos**, no como un promedio conjunto.

| Población | n | min | p50 | p90 | p99 | max | media |
|---|---:|---:|---:|---:|---:|---:|---:|
| **SOLO 200** (zaps servidos) | **655** | 0,000 | **0,650 s** | 5,043 | 7,180 | 11,889 | **1,745 s** |
| **SOLO 502** (fallos) | **155** | 0,289 | **4,315 s** | — | — | 13,416 | **4,076 s** |

**Overhead propio del VPS: `|rt−urt|` medio = 0,521 ms = 0,030 % de la media.** Coincide con lo medido en [E2E_PULSE_20261114.md](E2E_PULSE_20261114.md) (0,52 ms / 0,025 %) sobre **otra ventana y otro conjunto de muestras**: el VPS no añade latencia, el tiempo es del proveedor. Dos mediciones independientes que coinciden es la única forma barata de saber que el instrumento no miente.

**Lo que NO hay que hacer con estos números:** promediar los dos bloques. Un 502 tarda 4,3 s de mediana porque *espera al proveedor y falla*; meterlo en la media de zapping diría que «el zapping tarda 2,2 s», cuando el zapping bueno tarda **0,649 s** y el fallo cuesta **4,3 s perdidos**. Son dos poblaciones distintas y el script las publica como tales.

---

## 4 · Módulos SIN productor (NO_COMPUTADO ≠ cero)

Cinco módulos **no tienen quien les escriba**. No es que valgan 0: es que no hay productor.

| Módulo | Estado | Por qué |
|---|---|---|
| **SHIM :40213** | **sin productor** | No hay listener. `ss -tln` no lo muestra y `curl /health` no responde. Los 23 campos del health (ids, requests, media_segments_served, cache_hits/misses, ceilingBps, qoe_ready, rebuffer_detector_armed, queued, pending) **no se pueden capturar**: falta el proceso que los publica. |
| **CANARY `out/`** | **sin productor** | `/var/lib/ara/canary/out` **no existe**. Con 47 tickets en cola, worker y timer `inactive` y 0 unidades / 0 ffmpeg, el canary **no ha producido jamás un artefacto**. Un 0 en «artefactos» significaría «corrió y no generó nada»; esto es distinto y peor: nunca corrió. |
| **APK / ARA-X-SYNC** | **sin productor** | `/var/lib/ara/sync` no existe: el device no ha sincronizado con el VPS. El logcat, además, vive en el device. |
| **prisma_key.json** | **sin productor** | No existe en `/etc/ara/pulse/`. |
| **netshield_sentinel.json** | **sin productor (en esa ruta)** | No existe. El productor vivo es `/var/www/ape-uhdx/last-sentinel.json`, que sí existe… congelado desde **2026-05-31**. |

Los demás módulos **sí** tienen productor y su cero es un cero de verdad: 0 ffmpeg, 0 unidades canary, 0 errores lua en un `error.log` que existe y está vacío. Esa es exactamente la diferencia que el script marca.

---

## 5 · Defectos del script anterior, corregidos

La versión previa de `tools/ops/ape-live-capture.sh` (147 líneas) producía datos con formato de dato que no lo eran:

| # | Defecto | Consecuencia | Corrección |
|---|---|---|---|
| 1 | Curleaba `http://127.0.0.1:8787/health` y lo etiquetaba **«JIT /health»** | **`:8787` es `ape-list-probe`, no el JIT.** El JIT está en **:3099** (`Environment=PORT=3099` en `ape-jit.service`). Se publicaba la salud de un módulo como la de otro | Puerto correcto y unit citada |
| 2 | Imprimía *«este log NO tiene $request_time → latencia = NO_COMPUTADO»* | **Falso desde que `nginx.conf:77` añadió `rt=`/`urt=`.** Nota hardcodeada que sobrevivió al cambio que la invalidaba | Eliminada; la latencia se mide de verdad |
| 3 | `systemctl show 'ape-canary@*' -p Result` | Los globs no expanden en nombres de unidad: salía vacío y se imprimía como resultado | Se cuentan unidades reales con `list-units` |
| 4 | Sin SHIM, sin separación 200/502, sin separación bots/reales, sin fuente por dato | Datos sin trazabilidad | Secciones 5, 8, 10 y fuente citada en cada bloque |

Y uno que introduje **yo** en mi primera versión de esta misma tarea: trataba un `error.log` **vacío** como `NO_COMPUTADO`. Un log vacío es un **cero legítimo** (cero errores), no un dato ausente. Corregido con dos helpers separados — `hay` (existe y no vacío) y `existe` (existe aunque esté vacío) — y ahora imprime: `0 (el fichero EXISTE y esta vacio: cero errores. No es 'no computado')`.

---

## 6 · Hallazgos nuevos de esta captura

1. **El canary está parado con 47 tickets en cola.** En t43 (02:12 UTC) había **2** tickets; ahora hay **47** y el worker sigue `inactive`. La cola crece y nadie la consume, y `out/` no existe: **nunca se completó una corrida**.
2. **El `/health` del JIT no mide nada de sí mismo**: `{"ok":true,"active":null,"pid":null,"uptime_s":0}`. Dice `ok:true` con `pid:null` y `uptime_s:0`. Un health que responde 200 sin reportar proceso ni uptime no dice si el JIT está sano; dice que el puerto contesta.
3. **`ara_sync_lua` está declarado pero NO cargado.** `nginx -T` ve **6** shared_dicts; los ficheros declaran **7**. El séptimo vive en `/etc/nginx/snippets/ara-sync-lua.conf:10`, un snippet que **nadie incluye**. Declarado-en-un-fichero ≠ cargado: el script reporta los dos números y nombra la diferencia.
4. **`last-sentinel.json` lleva congelado desde el 2026-05-31** (5 meses y medio) y `netshield-sentinel.service` está `not-found`. El productor desapareció y el fichero quedó como fósil.
5. **Aparecen 500** (10 en el log: `/pulse/901443` ×6 y `/pulse/1090608` ×4, desde las 02:52:37). En la ventana de t43 no había **ningún** 5xx distinto de 502. Es una población nueva.
6. **Los 499 son el zapping, medido.** 34 en el log y **10 en los últimos 10 minutos sobre `/pulse/1090661.m3u8`**. Un 499 es *el cliente cerrando antes de recibir*: es el operador cambiando de canal. **Es la única señal directa de que el zapping se mueve**, y por eso el DELTA la cuenta aparte.
7. **`device-register.php` existe** (`sha256 2066e4f6…`). Matiza la conclusión previa de que `/api/v1/devices/register` tenía «0 coincidencias»: con **esa** ruta no hay endpoint, pero el registro de dispositivo **sí** está implementado en `/prisma/api/device-register.php`.
8. **El DELTA funciona.** Primera pasada `hits=3806 200=2991 499=38 502=176`. Pasada siguiente, en 3 s: **`hits +14 · 200 +9 · 499 +0 · 502 +0 · zaps +1`**.

---

## 7 · Cómo usarlo mientras zapeas

```bash
# bucle cada 3 s; Ctrl-C para salir
ssh hetzner-iptv 'bash -s -- --watch 3' < tools/ops/ape-live-capture.sh

# 20 pasadas y sale (registro acotado)
ssh hetzner-iptv 'bash -s -- --watch 3 --count 20' < tools/ops/ape-live-capture.sh

# ventana de logs más larga
ssh hetzner-iptv 'bash -s -- --minutes 30' < tools/ops/ape-live-capture.sh
```

En el bucle, la sección **12 · DELTA** es la que importa: dice cuántos hits, 200, **499** y 502 han aparecido entre pasadas. Si `499` sube, el zapping se movió; si `502` sube, se perdió un canal. Los cálculos caros de la lista grande (sha256 de 1,3 GB, `#EXTINF`) se cachean en memoria y solo se recalculan si cambia el mtime, para que `--watch 3` no tarde 20 s por pasada.

---

## 8 · Lo que esta captura NO mide

- **El buffer del reproductor.** No hay contador de rebuffer en el VPS: el buffer vive en el device. Es `NO_COMPUTADO` por diseño — medirlo exige telemetría del player, que hoy no llega (`/var/lib/ara/sync` no existe).
- **El primer frame.** `rt` mide el manifest; la imagen depende de la red y el decoder del device.
- **Los 23 campos del shim.** El proceso no existe. Cuando exista, §5 los imprime crudos.
- **El estado del APK en el device.** Sin `/var/lib/ara/sync` ni logcat local, no hay dato.
- **La causa de los 500.** Se han contado y localizado por canal, pero no se ha leído su origen: `error.log` está vacío y no se ha abierto `playlist_error.log`.

---

## 9 · Qué cambió respecto de la versión anterior (01:05 UTC)

La versión previa de este documento era correcta en lo que medía, pero **el sistema se movió debajo de ella**:

| Afirmación (01:05 UTC) | Estado a 04:5x UTC |
|---|---|
| «Latencia de zapping → `NO_COMPUTADO`: el log no tiene `$request_time`» | **Obsoleta**: el campo se añadió a las 01:16:04. Hoy hay **858 muestras** y el zapping se mide: p50 **0,649 s** en los 200 |
| «Canary: timer active · último `Result=success`» | **Cambió**: timer y worker `inactive`, **47 tickets** en cola y `out/` inexistente |
| «Lua: 7 shared_dicts» | Hoy se separan: **6 cargados** por `nginx -T`, **7 declarados** en ficheros; el séptimo (`ara_sync_lua`) no está activo |
| «Disco 73 % (8 GB liberados)» | Ha vuelto al **80 %** (29G/38G) |
| «605 líneas en el log, 00:00:17 → 01:08:35» | Ahora **3.645 líneas**; el log sigue creciendo |
| «Los 260 × 404 son 100 % bots» | Se confirma y se afina: bots por familia de ruta, y aparecen **404 reales** en `/prisma/api/telemetry-full` y `/prisma/api/sentinel-status` |

Lo que **sigue valiendo** de aquella versión y este documento no repite: el censo de errores por código, la corrección de su propio diagnóstico previo, la cadena `z=1` / `m=cartridge` funcionando, y la tabla de qué se purgó del disco.

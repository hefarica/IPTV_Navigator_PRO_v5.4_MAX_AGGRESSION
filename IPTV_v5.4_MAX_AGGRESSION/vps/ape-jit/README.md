# ape-jit — espejo versionado del servicio JIT CMAF del VPS

Este directorio es una **copia exacta** de lo que corre en producción (verificado por
sha256 raw, transferencia base64):

| Fichero | Origen en el VPS |
|---|---|
| `server.js` | `/opt/ape-jit/server.js` |
| `reconcile.js` | `/opt/ape-jit/reconcile.js` |
| `ape-jit.service` | `/etc/systemd/system/ape-jit.service` |
| `ape-jit-reconcile.service` | `/etc/systemd/system/ape-jit-reconcile.service` |
| `ape-jit-reconcile.timer` | `/etc/systemd/system/ape-jit-reconcile.timer` |
| `ape-jit-reconcile.path` | `/etc/systemd/system/ape-jit-reconcile.path` |

**Ningún workflow despliega esto.** No está en `tools/cicd/vps_deploy_map.json` ni en
ningún `.github/workflows/*.yml`. Se sube a mano; ver "Despliegue" al final.
`channels.json` **no se versiona**: contiene credenciales del proveedor.

## Qué es

Node (`PORT=3099`, `BIND=127.0.0.1`, detrás de nginx `location ^~ /jit/`) que
**transcoda un canal a la vez** desde el proveedor a CMAF en RAM
(`/dev/shm/ape-jit/<id>/`). Entrada por **allowlist**: el cliente nunca pasa una URL,
solo un id.

Rutas: `/jit/health` · `/jit/playlist.m3u8` · `/jit/catalog.json` ·
`/jit/capabilities.json` · `/jit/crystal.json` · `/jit/meta/<id>.json` · `/jit/go/<id>`
· `/jit/live/<id>/master.m3u8|manifest.mpd|manifest.json|media_N.m3u8|chunk-*.m4s`

---

## Espejo atómico: la lista servida → la allowlist JIT

### El problema que cierra

`channels.json` y `APE_JIT_LIST.m3u8` se mantenían a mano. La lista servida se
regenera; esos dos ficheros se quedaban viejos y **un canal nuevo daba
`404 unknown channel`** sin que nadie se enterara.

### La arquitectura

```
  /var/www/lists/pulse/APE_LISTA_*.m3u8   (596 MB, la lista que se sirve)
              │
              │  reconcile.js  (streaming, 10,6 M líneas → 10.573 canales)
              │    id · nombre · logo · grupo · UA(#EXTHTTP) · u= → /cdn/<host><ruta>
              ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  FAIL-CLOSED: si el parseo da < 95 % del mapa anterior → NO   │
   │  publica (firma de lista truncada). El mapa vive intacto.     │
   └───────────────────────────┬──────────────────────────────────┘
                               ▼
        releases/<version>/channels.json        ← se escribe COMPLETO
        releases/<version>/APE_JIT_LIST.m3u8    ← antes de publicar
        releases/<version>/meta.json
                               │
                               │  UN SOLO rename() del symlink
                               ▼
              current ────────────────────────►  releases/<version>
                               │
                               │  server.js: loadMap() cachea por (size:mtimeMs)
                               ▼
              /jit/live/<id>/…  se sirve SIN reiniciar el proceso
```

**Por qué NO dos `rename` seguidos.** Publicar `channels.json` y `APE_JIT_LIST.m3u8`
por separado deja una ventana en la que un lector ve el mapa nuevo con la lista vieja.
Por eso se escribe una **release completa** en su propio directorio y se publica con
**un único `rename()` de symlink**: `current` apunta a la release y los dos ficheros
cambian a la vez — o ninguno.

### Prueba de atomicidad (medida)

Lector concurrente leyendo los dos ficheros vía `current/` mientras se publica una
versión nueva (2 → 3 canales):

```
lecturas = 405.622     inconsistentes = 0
  par (mapa,lista) = 2,2  -> 82.171
  par (mapa,lista) = 3,3  -> 323.451
```

Nunca apareció `(2,3)` ni `(3,2)`: los dos ficheros son siempre de la misma release.

Propiedades medidas:

| Propiedad | Evidencia |
|---|---|
| **Atómico como unidad** | 405.622 lecturas concurrentes, **0 inconsistentes** |
| **Sin reinicio** | tras publicar, `ExecMainPID` no cambia y `/jit/live/3/master.m3u8` sigue en 200 |
| **Fail-closed** | con <95 % de canales: `ABORT`, no publica, `exit 2` |
| **Verificación post-flip** | relee por `current/`; si `mapa != lista != esperado` → `exit 3` |
| **Rollback** | las 5 releases previas se conservan: `ln -sfn releases/<v> current` |
| **Idempotente y barato** | sello `.reconciled` (path+size+mtime): si la lista no cambió, `SKIP` sin re-parsear 596 MB |
| **Huecos visibles** | `markMiss()` en los 4 puntos de 404 → `/opt/ape-jit/misses.log` (ruta fija) |
| **Caché de mapa** | `loadMap()` por `size:mtimeMs`: 3 requests = **1** `MAP_LOAD` (antes: 1 por request) |

### Prueba de hot-add (medida)

```
id 999999999 → 404                                    (no está en la allowlist)
  añadir atómicamente (tmp+rename) → 10.574 canales
id 999999999 → HTTP 200 en 7,78 s · health active:"999999999" · PID 55549 (el mismo)
  reconcile → 10.573 canales
id 999999999 → 404                                    (el espejo lo retiró)
```

### Resolución al vuelo (polimórfica)

Si un player pide un id que el espejo **todavía no tiene**, `server.js` no se limita a
devolver 404: comprueba si la lista fuente es más nueva que el espejo y, si lo es, lanza
**una** reconciliación (single-flight + cooldown 30 s), recarga el mapa y sirve la
petición. Medido en producción:

```
MAP_LOAD 10572 canales           ← el canal faltaba en el espejo
RECONCILE_ON_DEMAND 1312005      ← la lista fuente es mas nueva que el espejo
MAP_LOAD 10573 canales           ← replicado en el acto
HTTP 200 en 11,34 s              ← servido en la MISMA petición
```

**Polimórfico**: el parser entiende el envoltorio `/pulse/?u=` de APE **y** una URL
directa, así que se adapta a cualquier lista ajena. Verificado con una lista externa:

```
#EXTINF:-1 tvg-id="111" tvg-name="Canal Ajeno 1" group-title="PRUEBA",Canal Ajeno 1
#EXTHTTP:{"User-Agent":"SmartTV-9.0","X-Otra":"1"}
http://provider-ajeno.example:8080/live/usuario/clave/111.m3u8
   → {"111":{"url":"http://provider-ajeno.example:8080/live/usuario/clave/111.m3u8",
             "ua":"SmartTV-9.0"}}
```

Sigue sin aceptar URLs del cliente: solo ids, resueltos contra la lista fuente.

`/jit/source.json` declara el estado del espejo:

```json
{"service":"ape-jit-mirror","source":{
  "path":"/var/www/lists/pulse/APE_LISTA_1793926685925.m3u8",
  "mtime":"2026-11-07T04:58:20.828Z","size":624693667,
  "channels":10573,"stale":false}}
```

### Automatización — dos disparadores, ventana ~1 s

**`ape-jit-reconcile.path`** — `PathChanged=/var/www/lists/pulse` (`IN_CLOSE_WRITE`: dispara
cuando el fichero se **cierra** tras escribir, no en cada bloque). Medido: la lista cambia
→ el espejo arranca **en 1 segundo** → publica en ~6 s. Esta es la pieza que elimina la
ventana de minutos.

**`ape-jit-reconcile.timer`** — red de seguridad cada 5 min (`OnBootSec=3min`). Si el
path unit no dispara (p. ej. subida por scp a otra ruta), esto lo recoge.

Si la lista no cambió, cuesta ~0,2 s (SKIP). Si cambió, ~6 s de CPU con `nice 19`.
Una lista a medio escribir no puede publicar mal: el gate fail-closed del 95 % aborta
y el mapa anterior sigue sirviendo hasta la corrida siguiente.

```bash
systemctl list-timers ape-jit-reconcile.timer
systemctl status ape-jit-reconcile.path
journalctl -u ape-jit-reconcile -n 20
node /opt/ape-jit/reconcile.js --dry-run --verbose   # ver sin escribir
node /opt/ape-jit/reconcile.js --force               # ignorar el sello
node /opt/ape-jit/reconcile.js --list <ruta>         # forzar una lista concreta
```

> **Criterio de selección: `mtime` (fecha de modificación)**, por decisión del operador.
> El sello `.reconciled` guarda `path + size + mtimeMs`. Ojo: un `touch` cambia el mtime
> sin cambiar el contenido, así que puede provocar un re-parseo inútil (el fail-closed y
> el swap idempotente lo hacen inofensivo, pero cuesta ~6 s de CPU).
>
> **Ojo con el default**: sin `--list` se toma la lista **más reciente por mtime** de
> `lists/pulse/`. Si en un momento conviven dos listas y el player usa la vieja, hay
> que pasar `--list` explícita.

---

## La carrera del reaping — erradicada (2026-11-07)

**Síntoma medido** (una vez, 05:21:02):

```
FFMPEG [out#0/dash] Could not write header (incorrect parameters)
Error while filtering: No such file or directory
FFMPEG encoded 0 frames
EXIT 3 254            → el player recibió 503
```

**Mecanismo.** El directorio de salida era un **path fijo compartido** por todos los
arranques del mismo canal (`OUT_ROOT/<id>/<variante>`). `stopCurrent()` deja un **timer
de seguridad** (`STOP_GRACE_MS=6 s`) que llama a `reapDir()`, y `reapDir()` hacía
`rm -rf` **sin comprobar si un hijo nuevo ya estaba escribiendo ahí**. Si el arranque
nuevo caía dentro de esa ventana, ffmpeg se quedaba sin directorio a mitad de escritura.

**Erradicación estructural** (no un parche de tiempo):

1. **Directorio por run**: `OUT_ROOT/<id>/<variante>/run-<ts>-<rand>`. Dos arranques no
   comparten path nunca, así que el reaping de uno anterior **no puede** tocar al vivo.
2. **`reapDir()` con guarda**: `if (current && current.dir === dir) return;` más limpieza
   del directorio padre si queda vacío (no se acumulan carpetas).
3. **`baseDirFor()` como resolución única** del directorio de salida, usada por
   `waitForFile()` y por el servidor de ficheros. Antes `waitForFile()` construía el path
   por su cuenta con el layout viejo y no veía el fichero del run.
4. **`runDirs`** (Map) registra el directorio en el `mkdir`, **antes** del `spawn`, para
   que el handler pueda servirlo sin esperar a que `current` esté seteado.

**Verificación.** Stress de 20 cambios de canal seguidos (40 peticiones):

```
total=40  fallos=0
Could not write header -> 0 · encoded 0 frames -> 0 · EXIT 254 -> 0
SPAWN_ERROR -> 0 · SLOT_TIMEOUT -> 0
runs en disco: 1 (solo el vivo, no se acumulan)
```

**Invariante instrumentado.** `reapDir()` registra `REAP <dir> ok|LIVE_MATCH(bloqueado)`.
Si alguna vez el reaping apuntara al directorio de un hijo **vivo**, saldría `LIVE_MATCH`.
Medido tras la erradicación: **119 `REAP`, 0 `LIVE_MATCH`**.

**Fuga cerrada.** El `mkdir` ocurre antes de `slotAcquire()`; si el arranque se abortaba
por slot ocupado, el directorio quedaba huérfano (3 huérfanos vistos en el stress).
Ahora ese camino llama a `reapDir(dir)` antes de salir. Verificado: con 0 hijos vivos
quedan **0 run dirs**.

**Reparto temporal de los síntomas** (el journal completo incluye días anteriores):

```
desde 2026-11-06 23:00 -> Could-not-write-header=1  encoded-0-frames=1   (el incidente 05:21:02)
desde 2026-11-07 06:14 -> Could-not-write-header=0  encoded-0-frames=0   (tras la erradicación)
```

> **Honesto:** el baseline previo (16 peticiones) tampoco reprodujo el fallo — es una
> carrera temporal. Lo que sostiene la erradicación es el mecanismo (path compartido +
> reaping sin guarda) eliminado por diseño, el invariante `LIVE_MATCH=0` sobre 119 reaps,
> y 0 síntomas después del cambio.
>
> **No confundir** los 503 concurrentes con esta carrera: peticiones simultáneas a canales
> distintos dan `SLOT_TIMEOUT hijos vivos=1` + `START_ABORT slot ocupado`. Es el diseño de
> **un solo canal** (`concurrent_channels: 1`, el proveedor acepta `max_connections=1`),
> no el reaping.

## Arreglos del 2026-11-07 (transcode)

**1 · `spawn('nice', …)` fallaba con ENOENT sin decir qué faltaba.** Ahora usa rutas
absolutas con `fs.existsSync` (`NICE_BIN`, `FFMPEG_BIN`), `mkdirSync(dir)` justo antes
del spawn, y el `SPAWN_ERROR` registra `code`, `cwd`, `cmd` y `PATH`.

**2 · El modo 4K nativo (`copy4k`) no pasaba `-b:v` y el muxer DASH lo rechazaba.**

```
antes:  copy4k=false crystal=FHD_SDR       src=3840x2160/smpte2084->1920x1080
        [dash] No bit rate set for stream 0  →  EXIT 255  →  0 bytes
ahora:  copy4k=true  crystal=NATIVE_4K_HDR src=3840x2160/smpte2084->3840x2160
        master: RESOLUTION=3840x2160, CODECS="hvc1.2.4.L153.B0,mp4a.40.2", VIDEO-RANGE=PQ
        segmento: HTTP 200 · 2.233.105 B · video/iso.segment
```

El bitrate sale del `ffprobe` (`bit_rate` añadido al probe); si no lo trae, cae a `20000k`.

## Pendiente, por decisión del operador

**La escalera de fallback degrada.** `FHD_SDR` (1920x1080 H.264 SDR) y `SDR720_STABLE`
(1280x720) se activan solos cuando el modo superior falla. Sobre 4K HDR eso es
resolución + rango + códec: `docs/policies/ANTI_DEGRADATION_LAW.md` solo lo admite con
autorización escrita por `canal_id, device_id`. **No se tocó.**

## Despliegue (manual, hoy)

```bash
scp server.js reconcile.js root@<vps>:/opt/ape-jit/
node -c /opt/ape-jit/server.js && node -c /opt/ape-jit/reconcile.js
systemctl restart ape-jit && systemctl is-active ape-jit
node /opt/ape-jit/reconcile.js --dry-run --verbose
curl -s http://127.0.0.1:3099/health
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3099/live/3/master.m3u8
```

Rollback: `/opt/ape-jit/server.js.bak_*` y `channels.json.prev` / `APE_JIT_LIST.m3u8.prev`.

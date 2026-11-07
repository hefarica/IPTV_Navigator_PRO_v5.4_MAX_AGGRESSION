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
          channels.json.tmp ──rename()──► channels.json     ┐ rename(2)
       APE_JIT_LIST.m3u8.tmp ─rename()──► APE_JIT_LIST.m3u8 ┘ es ATÓMICO
                               │
                               │  server.js: loadMap() cachea por (size:mtimeMs)
                               ▼
              /jit/live/<id>/…  se sirve SIN reiniciar el proceso
```

Propiedades medidas:

| Propiedad | Evidencia |
|---|---|
| **Swap atómico** | `rename()` en el mismo filesystem: el servidor nunca ve el fichero a medias |
| **Sin reinicio** | tras publicar, `ExecMainPID` no cambia y `/jit/live/3/master.m3u8` sigue en 200 |
| **Fail-closed** | con <95 % de canales: `ABORT`, no publica, `exit 2` |
| **Rollback de un comando** | `.prev` de ambos ficheros queda escrito antes del swap |
| **Idempotente y barato** | sello `.reconciled` (path+size+mtime): si la lista no cambió, `SKIP` sin re-parsear 596 MB |
| **Huecos visibles** | `markMiss()` en los 4 puntos de 404 → `/opt/ape-jit/misses.log` |
| **Caché de mapa** | `loadMap()` por `size:mtimeMs`: 3 requests = **1** `MAP_LOAD` (antes: 1 por request) |

### Prueba de hot-add (medida)

```
id 999999999 → 404                                    (no está en la allowlist)
  añadir atómicamente (tmp+rename) → 10.574 canales
id 999999999 → HTTP 200 en 7,78 s · health active:"999999999" · PID 55549 (el mismo)
  reconcile → 10.573 canales
id 999999999 → 404                                    (el espejo lo retiró)
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

> **Ojo con el default**: sin `--list` se toma la lista **más reciente por mtime** de
> `lists/pulse/`. Si en un momento conviven dos listas y el player usa la vieja, hay
> que pasar `--list` explícita.

---

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

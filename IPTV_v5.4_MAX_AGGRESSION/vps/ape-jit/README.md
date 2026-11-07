# ape-jit — espejo versionado del servicio JIT CMAF del VPS

Este directorio es una **copia exacta** de lo que corre en producción:

| Fichero | Origen en el VPS | sha256 (raw, verificado) |
|---|---|---|
| `server.js` | `/opt/ape-jit/server.js` | `fdcadc39562e3374…` |
| `ape-jit.service` | `/etc/systemd/system/ape-jit.service` | `888ada46f026ff8e…` |

**No lo despliega ningún workflow.** `tools/cicd/vps_deploy_map.json` no lo incluye y
ningún `.github/workflows/*.yml` lo menciona. Se sube a mano. Hasta que eso cambie,
este directorio es la única forma de no perder el código en el próximo rebuild.

## Qué es

Node (`PORT=3099`, `BIND=127.0.0.1`, delante de nginx `location ^~ /jit/`) que
**transcoda un canal a la vez** desde el proveedor a CMAF en RAM (`/dev/shm/ape-jit/<id>/`).

Entrada por **allowlist**: `/opt/ape-jit/channels.json` (10.573 ids). El cliente **nunca**
pasa una URL, solo un id. Cada entrada:

```json
{"3": {"url": "https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/live/<u>/<p>/3.m3u8",
       "ua": "VLC/3.0.19 LibVLC/3.0.19"}}
```

Esa URL `/cdn/` la atiende `pulse.php` (mode=proxy) → normaliza al proveedor → 302 →
media playlist con segmentos en el origen. **ffmpeg descarga esos segmentos, los
reprocesa y sirve `.m4s` desde el VPS.**

> `channels.json` contiene credenciales del proveedor. **NO se versiona.**

## Rutas que expone

`/jit/health` · `/jit/playlist.m3u8` (la lista, 4,1 MB) · `/jit/catalog.json` (2,4 MB) ·
`/jit/capabilities.json` · `/jit/crystal.json` · `/jit/meta/<id>.json` · `/jit/go/<id>` ·
`/jit/live/<id>/master.m3u8|manifest.mpd|manifest.json|media_N.m3u8|chunk-*.m4s`

## Arreglos del 2026-11-07

**1 · `spawn('nice', …)` fallaba con ENOENT sin decir qué faltaba.**
Ahora usa rutas absolutas resueltas con `fs.existsSync` (`NICE_BIN`, `FFMPEG_BIN`),
hace `mkdirSync(dir)` inmediatamente antes del spawn y el `SPAWN_ERROR` registra
`code`, `cwd`, `cmd` y `PATH`.

**2 · El modo 4K nativo (`copy4k`) no pasaba `-b:v` y el muxer DASH lo rechazaba.**

```
antes:  START 1174213 … copy4k=false crystal=FHD_SDR       src=3840x2160/smpte2084->1920x1080
        FFMPEG [dash] No bit rate set for stream 0   →   EXIT 255   →   0 bytes
ahora:  START 1174213 … copy4k=true  crystal=NATIVE_4K_HDR  src=3840x2160/smpte2084->3840x2160
        master: RESOLUTION=3840x2160, CODECS="hvc1.2.4.L153.B0,mp4a.40.2", VIDEO-RANGE=PQ
        segmento servido: HTTP 200 · 2.233.105 B · video/iso.segment
```

El bitrate declarado sale del `ffprobe` (`bit_rate` añadido al probe); si el probe no
lo da, cae a `20000k`.

## Pendiente, por decisión del operador

**3 · La escalera de fallback degrada.** `FHD_SDR` (1920x1080 H.264 SDR) y
`SDR720_STABLE` (1280x720) se activan solos cuando el modo superior falla. Sobre una
fuente 4K HDR eso es resolución + rango + códec: `docs/policies/ANTI_DEGRADATION_LAW.md`
solo lo admite con autorización escrita por `canal_id, device_id`. **No se tocó.**

## Cómo se despliega (manual, hoy)

```bash
scp server.js root@<vps>:/opt/ape-jit/server.js
node -c /opt/ape-jit/server.js          # obligatorio
systemctl restart ape-jit && systemctl is-active ape-jit
curl -s http://127.0.0.1:3099/health
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3099/live/3/master.m3u8
```

Rollback: los backups quedan como `/opt/ape-jit/server.js.bak_<stamp>`.

# MEDIA FAN-OUT — Reporte V1: concurrencia, coherencia, aislamiento y fencing

**Tarea:** t6 · V1 · Verificación crítica de concurrencia (50 clientes → 1 conexión upstream)
**Fecha de la corrida válida:** 2026-10-25T20:51:59Z → 2026-10-25T20:54:35Z (156 s)
**Host de staging:** `ubuntu-2gb-ash-1` (VPS 178.156.147.234), Linux `6.8.0-124-generic`, 3 vCPU
**Banco:** [`_vps_stage/tests/fanout_concurrency.sh`](../_vps_stage/tests/fanout_concurrency.sh) (1.709 líneas, sha256 `88FB5FCF29AD725772DE9401F440687DF778823603F49C888A6C619ADE6DA33D`)
**Evidencia cruda:** `/tmp/mf_v1/evidence.txt`, `/tmp/mf_v1/analysis.json`, `/tmp/mf_v1/phases/upstream.csv`, `/tmp/mf_v1/evidence/ss-probe.json`, `/tmp/mf_v1/logs/`, `/tmp/mf_v1/evidence/` en el VPS de staging
**Producción:** intacta. nginx PID `1665899` y `/etc/nginx/nginx.conf` sha256 `a9a7146a…4ce1f` idénticos antes/después; `journalctl -u nginx` de la ventana: `-- No entries --`.

---

## 1. Veredicto ejecutivo

| # | Criterio del contrato | Resultado | Números clave |
|---|---|---|---|
| 1 | N=50 (y curva 1/5/50/100) al mismo canal → **EXACTAMENTE 1 conexión upstream** | **PASS** | `max_active` TCP en el origen = **1** en todas las fases; **1** proceso ffmpeg; sonda `ss` dedicada: **94 muestras con 1 socket / 1 PID ffmpeg**; aceptaciones/s: 0,99 → 1,04 → 1,06 al pasar de 1 → 50 → 100 clientes |
| 2 | Todos los clientes reciben **la misma secuencia** (MSN/EXTINF), sin duplicados ni huecos | **PASS** | 1.100 playlists de 50 clientes; 12 firmas MSN (3..15), **0** discrepancias, **0** duplicados, **0** huecos de ventana/unión, **0** desalineación nombre↔MSN; **5/5** snapshots byte-idénticos (50/50 clientes) |
| 3 | Continuidad de **timestamps** (PTS/DTS) y MSN sin saltos | **PASS** | 6 segmentos, 300 paquetes, DTS 63,40 → 75,36 s, gaps de **0,04 s**, **0** regresiones DTS, **0** anomalías EXTINF, MSN 29..34 contiguo |
| 4 | **Aislamiento**: cortar un cliente no degrada a los demás durante ≥15 s | **PASS** | 50 clientes + 1 lento abortado: **1.100/1.100** playlists 200 (100 %), **1.100/1.100** segmentos 200, avance mínimo de MSN = **11** en 22 s |
| 5 | **Fencing**: matar el worker → nueva generación, la vieja no publica y no hay segunda ingesta | **PASS** | gen **1→2**, vieja congelada en MSN 46, 302 `stale_generation` + jump-to-live, sesión cerrada a los ~15 s del kill, **1** worker, **1** ffmpeg, `max_active`=1, dir viejo eliminado |
| 6 | **Límites**: los conectados no se caen; los nuevos reciben 503 con motivo | **PASS** | 2 sesiones máx.; 3.ª → `503 max_sessions`; viewer 4 → `503 max_viewers`; 6.º global → `503 max_total_viewers`; conectados 12/12 y 6/6 tras los rechazos |
| 7 | **Reporte con números reales** y veredicto PASS/FAIL | **PASS** | este documento |

**Arranque en frío: PASS sin shim.** 50/50 clientes obtuvieron HTTP 200 en la primera petición simultánea; latencia fría p50 **3.262,5 ms**, p95 **3.315,7 ms** (incluye arranque real del worker y primer segmento). El banco se ejecutó con `--shim-delay 0` (sin retardo de arranque).

**Resumen del banco:** `invariant_pass=23`, `invariant_fail=0`, `warnings=0`, `COLD_START=PASS`, `RESULT=PASS_INVARIANT`, exit 0.

> Alcance honesto: PASS de los seis criterios de V1 sobre el **fan-out canónico por generación**. No es todavía un PASS de reproducción end-to-end de un player que entre por `/sess/.../live.m3u8`: ver hallazgo **O2** (fuera del alcance de V1, debe cerrarse en G1).

---

## 2. Código bajo prueba y topología

### 2.1 Snapshot exacto (sha256)

| Pieza | Fichero | sha256 |
|---|---|---|
| Coordinador | `_vps_stage/lua/ape_session.lua` | `d3b9561d14066ca2e6a48f020f147242ddd82effcf79106cc24126c2710f5b6b` |
| Config nginx | `_vps_stage/nginx/media-fanout.conf` | `6d8a908e4b25889bd84c36bde02602421e185bf96b810f0d0226cdf8a4f53a53` |
| Supervisor | `_vps_stage/media/ape-supervisor.lua` | `59a272dda35a4ff6303dbf519ff54bf56d9cab1d1bc3bd978b2e8722d87d88d1` |
| Launcher | `_vps_stage/media/ape-supervisor.sh` | `91aaea7c1e2a674907762f8ee9cebc5c92f767ae2a493357853183e329627987` |
| Worker | `_vps_stage/media/ape-ingest.sh` | `b900ddd23abd9e9478ff3bfcbb70a6348ec692237f7066aedf10f26477955ee4` (1.0.1, reparación t12) |

El supervisor y el worker incluyen las reparaciones **t11** (sección crítica corta: flock sólo para mutar estado, `start`/`stop`/relay fuera del lock) y **t12** (`READY=1` antes del publish UDS + reintentos acotados). Ambas fueron verificadas por el capitán antes de esta corrida.

### 2.2 Topología de staging (todo loopback, sin proveedor real)

```
ffmpeg origen (testsrc2+sine, HLS 2 s)
   │  escribe /tmp/mf_v1/origin/{index.m3u8,segNNNNN.ts}
   ▼
servidor HTTP de origen 127.0.0.1:19090   ← cuenta ACCEPT/GET y max_active
   ▲  ffmpeg -c copy -http_persistent 0 (1 proceso)
   │
worker ape-ingest.sh (1 por key, flock) → ventana /dev/shm/mf/<key>/<gen>/
   ▲  PUBLISH/HEARTBEAT (UDS)             │
supervisor UDS (flock corto, gen persistida)   nginx staging :18099
   ▲  OPEN/RELEASE/RESTART                 │ sendfile desde tmpfs
   │                                       ▼
coordinador Lua (sesiones, viewers, fencing) ──► 50/100 clientes HTTP
```

- El **origen es real** (ffmpeg HLS en loopback), no un stub: cada conexión TCP de la ingesta se acepta y se cuenta en el servidor de origen (`max_active`, `accepts`, `GETs`).
- El banco **no instala unidades systemd**: el supervisor invoca `start-worker.sh`, que encola la key en una FIFO; un watcher fuera del handler lanza exactamente un worker por orden de spawn (sustituto de staging de `systemctl start`, sin heredar descriptores del handler). Ver limitación O5.
- Los clientes son procesos/threads independientes con `X-MF-Client` único, una conexión HTTP persistente por cliente, sondeo de playlist cada 1 s, descarga del último segmento cada 5 sondeos y refresco de marca de espectador cada 5 s.
- El cliente del banco usa la **URL canónica con generación** (`/mf/<key>/<gen>/index.m3u8` y `/mf/<key>/<gen>/<seg>.ts`) porque es la ruta caliente de fan-out que valida el contrato; la generación se descubre por `GET /mf/ctl?op=inspect&key=…` (API de diagnóstico loopback). Ver O2 para la entrada `/live.m3u8`.

### 2.3 Cómo se mide "una sola conexión upstream" (sin contadores de stub)

1. **`ss -tnp state established '( dport = :19090 )'`** muestreado cada 100 ms: máximo de sockets concurrentes y PIDs dueños (`/tmp/mf_v1/phases/upstream.csv`).
2. **`/proc/net/tcp`** (estado `01`, puerto local `4A92` = 19090) como contador independiente en la misma muestra.
3. **Contabilidad en el destino**: el servidor de origen incrementa `active` en cada `accept()` y lo decrementa en `close()`, registrando `max_active` por fase (puerto de control 19091, fuera del cómputo). Es la medida exacta de conexiones TCP **concurrentes** al proveedor.
4. **Procesos**: `pgrep -fc "ffmpeg.*:19090"` (máx. 1) y `pgrep -fc "ape-ingest.sh --instance <key>"` (exactamente 1 tras fencing).
5. **Invariancia con N**: aceptaciones/segundo del origen en ventanas equivalentes para 1, 5, 50 y 100 clientes. Si N multiplicara la ingesta, la tasa escalaría con N.

`conntrack` **no está instalado** en el VPS; se usó `ss` + `/proc/net/tcp` + contabilidad del destino. La limitación de muestreo de `ss` se discute en O3.

---

## 3. Resultados por criterio

### C1 — Concurrencia: 50 clientes → 1 conexión upstream (y curva 1/5/50/100)

Sesión única `key=110a3ace622f51b4`, canal `127.0.0.1|canal1`, generación 1 durante toda la curva. Los clientes entran por `/mf/src/127.0.0.1/canal1/live.m3u8` (302 → `/mf/<key>/live.m3u8` → playlist) y luego sondean la ruta canónica.

| Fase | Clientes | Playlists 200 | `max_active` origen | `ss` (sockets / muestras) | ffmpeg máx. | Aceptaciones / GETs origen | Tasa acept./s |
|---|---:|---:|---:|---:|---:|---:|---:|
| cold (arranque) | 50 simultáneos | 50/50 | **1** | 0 | 1 | 4 / 4 (3,4 s) | 1,18 |
| n1 | 1 | 10/10 | **1** | 0 | 1 | 10 / 10 (10,1 s) | 0,99 |
| n5 | 5 | 50/50 | **1** | 0 | 1 | 10 / 10 (10,1 s) | 0,99 |
| **main50** | **50** | **1.100/1.100** | **1** | 0 (muestreo 100 ms) | **1** | 23 / 23 (22,1 s) | **1,04** |
| n100 | 100 | 1.500/1.500 | **1** | 0 (muestreo 100 ms) | 1 | 16 / 16 (15,1 s) | 1,06 |
| snapshot | 50 | 250/250 | **1** | — | 1 | 12 / 12 | — |
| isolation | 50 + 1 lento | 1.100/1.100 | **1** | — | 1 | 22 / 22 (22,0 s) | 1,00 |
| **sonda ss** | **50** | **600/600** | **1** | **1 socket / 94 muestras** | **1** | 12 / 12 (12,0 s) | — |
| fencing | reinicio | — | **1** | — | 1 | 6 / 6 | — |

**Sonda `ss` dedicada (la prueba literal del criterio):** como el worker usa `-http_persistent 0`, sus sockets viven milisegundos y el muestreo normal de `ss` cada 100 ms casi nunca coincide. Para fotografiarlos, el banco añade una ventana dedicada de 12 s con **50 clientes** y **100 ms de latencia artificial en el origen** (sólo en esa ventana; se retira después). Una sonda lee `/proc/net/tcp` cada ~1 ms y, al ver una conexión establecida, ejecuta `ss -Htnp state established '( dport = :19090 )'`. Resultado: **94 muestras positivas**, todas con **exactamente 1 socket** y **1 PID ffmpeg** (1697498), p.ej.:

```
0  0  127.0.0.1:59170 127.0.0.1:19090 users:(("ffmpeg",pid=1697498,fd=5))
```

`max_proc_tcp=1`, `max_ss_lines=1`, `max_active=1` y 600/600 playlists 200 de los 50 clientes durante la sonda. Artefacto: `/tmp/mf_v1/evidence/ss-probe.json`.

**Lectura:** el número de conexiones TCP concurrentes en el proveedor es **1** en todas las fases, con **un solo proceso ffmpeg**, y la tasa de aceptaciones del origen **no escala con N** (0,99/s con 1 cliente, 1,04/s con 50, 1,06/s con 100). Es decir: 100 clientes no crean 100 conexiones ni 2 ingestas; comparten la misma.

**Matiz técnico:** el worker usa `-http_persistent 0` por diseño (renovar ticket/playlist con el proveedor), así que el origen observa conexiones **secuenciales** (~1/s), no un socket único durante minutos. "Una sola conexión upstream" en el sentido que impone el proveedor (concurrencia/límite de sesiones) queda demostrado por `max_active=1`, por la invariancia de la tasa de aceptación y por la sonda `ss` dedicada (1 socket / 1 PID ffmpeg en 94 muestras).

**Evidencia cruda:** `upstream.csv`, `ss-probe.json`, `stats-*.json`, `logs/sampler.log`, `origin_accept.log`.

---

### C2 — Coherencia de secuencia entre 50 clientes

Fase `main50`: 50 clientes × 22 s = **1.100 playlists** canónicas de la misma generación.

| Métrica | Valor |
|---|---:|
| Playlists analizadas | 1.100 |
| Firmas distintas (gen, MSN) | 12 revisiones observadas en el rango MSN 3..15 |
| Tamaño de ventana | 8/8 segmentos en todas las playlists |
| Discrepancias de firma para el mismo MSN | **0** |
| Segmentos duplicados dentro de una playlist | **0** |
| Huecos dentro de la ventana (números de segmento) | **0** |
| Huecos en la unión de todos los segmentos observados | **0** |
| Desalineación `segNNNNN` ↔ (MSN + índice) | **0** |
| Regresiones de MSN | **0** |
| Revisiones de MSN no observadas por el sondeo de 1 s | **50** (no son huecos de segmento) |
| Anomalías de EXTINF | **0** |

Además, **snapshots simultáneos**: 5 rondas × 50 clientes lanzados con barrera. En las 5 rondas los 50 cuerpos fueron **byte-idénticos** (`unique_sha=1`, `unique_body=1`, `http200=50`) — `snapshots` en `analysis.json`.

**Conclusión:** para el mismo MSN todos los clientes ven exactamente la misma lista de segmentos; no hay ventanas distintas, duplicados ni huecos. La unión de segmentos observados es contigua (`seg00003.ts`..`seg00022.ts`) para el rango de revisiones MSN 3..15; una revisión intermedia no fue muestreada por el sondeo de 1 s, pero sus segmentos siguen presentes en las ventanas contiguas (por eso `window_holes=0` y `union_segment_holes=0`).

> `observed_msn_skips=50` significa que **cada cliente se saltó una revisión de playlist** en su sondeo de 1 s (el muxer publicó dos revisiones entre dos sondeos); **no es un hueco de segmento**: `window_holes=0` y `union_segment_holes=0` demuestran que todos los números de segmento existen y son contiguos. La comprobación estricta de coherencia es por firma `(gen, MSN) → lista de segmentos`, no por cadencia del sondeo.

---

### C3 — Continuidad de timestamps (PTS/DTS) y MSN

Se descargaron los **6 últimos segmentos** de la ventana viva y se analizaron con `ffprobe` (stream de vídeo, 300 paquetes). MSN de partida: 29.

| Métrica | Valor |
|---|---:|
| Segmentos descargados | 6 (todos empiezan por byte TS `0x47`) |
| Paquetes de vídeo analizados | **300** |
| Primer/último DTS | 63,400 s → 75,360 s |
| Primer/último PTS | 63,400 s → 75,360 s |
| Gaps DTS entre segmentos | **[0,04, 0,04, 0,04, 0,04, 0,04] s** |
| Gaps fuera de rango (−0,1..0,6 s) | **0** |
| Regresiones DTS (>50 ms hacia atrás) | **0** |
| MSN duplicado / hueco de ventana | **0 / 0** |
| Tamaños de segmento | 260.756, 264.704, 253.800, 258.312, 256.244, 276.736 B |

**Conclusión:** el remux `-c copy` entrega DTS/PTS monótonos y continuos (2 s por segmento, 40 ms por frame a 25 fps), sin saltos, solapes ni discontinuidades; la ventana HLS conserva la numeración MSN↔fichero sin duplicados. Ver `ts/timestamps.txt`.

---

### C4 — Aislamiento entre clientes

Fase `isolation`: 50 clientes normales + **1 cliente lento** que abre el último segmento de la ventana, lo lee a ~1 KB/s y **aborta bruscamente** a los 8 s (equivale a un kill/timeout del player). Ventana total: 22 s.

| Métrica (50 clientes restantes) | Valor |
|---|---:|
| Playlists solicitadas / 200 | **1.100 / 1.100 (100,0 %)** |
| Segmentos solicitados / 200 | **1.100 / 1.100 (100,0 %)** |
| Avance mínimo de MSN por cliente en 22 s | **11** |
| p50 / p95 latencia playlist | **0,640 / 6,848 ms** |
| p95 latencia segmento | **4,969 ms** |
| Bytes de segmento servidos | 288.627.000 B (~275 MiB) |

**Conclusión:** un lector lento/abortado no bloquea a los demás: no hay locks compartidos en la ruta caliente, cada cliente tiene su conexión y nginx sigue sirviendo desde tmpfs con la misma cadencia. El requisito de ≥15 s se cumple con margen (22 s).

---

### C5 — Fencing tras matar el worker

Secuencia medida (timestamps UTC de la corrida):

| t | Hecho | Evidencia |
|---|---|---|
| 20:53:52 | Estado viejo: gen **1**, worker PID 1697367, ffmpeg 1697498, playlist MSN **46**, 8 segmentos, sha `2c40ee4bcbe0…` | `evidence/fence-old.m3u8` |
| 20:53:52 | `kill -9` al grupo del worker | `worker_viejo_vivo=0` (worker y ffmpeg muertos) |
| +2 s y +5 s | La playlist vieja **no cambia** (byte a byte) | `fence-frozen.m3u8`, `fence-frozen2.m3u8` |
| 20:54:07 | La sesión se cierra por sí sola al expirar espectadores + linger (9 s desde que terminaron las comprobaciones de congelación; ~15 s desde el kill) | `ctl inspect` → sin sesión; log `close … reason=linger_expired` |
| 20:54:11 | Cliente nuevo → **HTTP 200**, generación **2** | `fence-new.body`, `ctl inspect gen=2` |
| 20:54:11 | `GET` a la generación 1 → **302** `X-APE-Reason: stale_generation`, `X-MF-Jump-To-Live: 1`, `X-MF-Gen: 1`, `X-MF-Gen-Current: 2` | `fence-stale.body.hdr` |
| 20:54:13 | **1** worker (`pid 1703246`), **1** ffmpeg, directorio de gen 1 eliminado | `raw_worker_matches(session-leaders)=[1703246 1703246 bash …ape-ingest.sh --instance …]` |
| Ventana fencing | `max_active` en el origen = **1**; 6 aceptaciones | `stats-fencing.json` |

**Conclusión:** el supervisor crea **una** generación nueva (1→2), la vieja deja de publicar (congelada) y de servirse (302 stale), no queda una segunda ingesta ni una segunda conexión upstream. La recuperación natural (sin intervención manual) tardó ~19 s desde el kill: ~15 s hasta el cierre por expiración de marcas + linger, más ~4 s de arranque del worker y primer segmento.

---

### C6 — Límites (fase B, capacidades reducidas para forzar los códigos)

Config de staging: `max_sessions=2`, `max_viewers_per_session=3`, `max_total_viewers=5`; supervisor `MAX_SESSIONS=12` (el coordinador deniega antes). Canales `canalb1`, `canalb2`, `canalb3`.

| Prueba | Resultado | Respuesta medida |
|---|---|---|
| Crear 2 sesiones | PASS | B1 `200` (key `383c30bf7b8aec1a`, gen 1), B2 `200` (key `383c30c07b8aec1b`, gen 1) |
| 3.ª sesión (canalb3) | PASS | **503**, `X-MF-Reason: max_sessions`, `Retry-After: 1` |
| Sesiones ya conectadas durante el rechazo | PASS | 12/12 playlists 200 |
| 4.º espectador en B1 | PASS | **503**, `X-MF-Reason: max_viewers`, `Retry-After: 1` |
| 6.º espectador global (3 en B1 + 3 en B2) | PASS | **503**, `X-MF-Reason: max_total_viewers` |
| Conectados después de los rechazos | PASS | 6/6 playlists 200 |

Los rechazos no expulsan a los ya conectados: el límite se aplica **antes** de entrar y nunca desaloja. Ver `evidence/b-cold-b3.body.hdr`, `lim-v4.body.hdr`, `lim-v6.body.hdr`.

> Nota: los topes de producción son 12 sesiones / 24 viewers / 120 totales (config staging); aquí se bajan para provocar los códigos sin levantar 12 workers. El camino de código es el mismo (t2 ya midió los tres motivos).

---

### 3.7 Latencias y bytes (números reales)

Latencia extremo a extremo medida por los clientes (ms), fichero `analysis.json`:

| Fase | Playlist p50 | Playlist p95 | Playlist máx. | Segmento p50 | Segmento p95 | Playlists servidas | Bytes segmento |
|---|---:|---:|---:|---:|---:|---:|---:|
| n1 | 0,794 | 3,175 | 5,054 | 0,556 | 0,790 | 10 | 2.706.636 |
| n5 | 0,849 | 3,049 | 5,834 | 0,995 | 2,678 | 50 | 13.113.940 |
| **main50** | **0,611** | **6,265** | 71,780 | **0,776** | **4,955** | **1.100** | **289.153.400** |
| n100 | 0,688 | 37,679 | 114,293 | 0,996 | 6,287 | 1.500 | 391.792.000 |
| isolation | 0,640 | 6,848 | 51,368 | 0,854 | 4,969 | 1.100 | 288.627.000 |
| sonda ss (100 ms latencia artificial) | 0,780 | 11,297 | 56,133 | 1,152 | 8,495 | 600 | 158.164.400 |
| cold (50 simultáneos) | 3.262,5 (p50) | 3.315,7 (p95) | — | — | — | 50 | — |

- **Playlists totales servidas:** 3.760 en las fases de sondeo + 250 respuestas de snapshot = **4.010**; la sonda ss añade 600 (total 4.610).
- **Segmentos servidos:** 3.760 en las fases de sondeo + 600 de la sonda ss = **4.360**.
- **Bytes de segmento:** 985.392.976 B (~940 MiB) en las fases de sondeo; 1.143.557.376 B (~1,06 GiB) contando la sonda ss (que incluye 100 ms de latencia artificial) en ~156 s de corrida.
- **Bytes de playlist:** ~1,49 MB (incluye la sonda).
- La latencia fría (3.262,5 ms p50) es el coste de arrancar la ingesta + primer segmento; en caliente el p95 es 6,265 ms con 50 clientes y 37,679 ms con 100.

---

### 3.8 Validez de la corrida y producción intacta

| Comprobación | Resultado |
|---|---|
| nginx de producción `MainPID` antes/después | `1665899` → `1665899` (**sin cambios**) |
| sha256 `/etc/nginx/nginx.conf` antes/después | `a9a7146a46b4080f32e0fd1e40772bce53cac3a8f0cd18ed2e1ebc5c31d4ce1f` → idéntico |
| `journalctl -u nginx --since 20:51:59Z --until 20:54:35Z` | **`-- No entries --`** (0 eventos de reinicio/reload) |
| Conclusión de validez | **corrida VÁLIDA** (`invalid_run=0`) |
| `/etc/mediafanout`, `/var/lib/mediafanout` | no creados |
| Puertos 18098/18099/18100/19090/19091 al terminar | libres |
| `/dev/shm/mf` al terminar | vacío |
| Procesos del banco al terminar | 0 |

El capitán había advertido de un bounce de nginx de producción ajeno a este trabajo (~53/24 h). En esta ventana **no ocurrió**; si hubiera ocurrido, el banco habría salido con `exit 2` y `RESULT=INVALID_RUN` (comprobación automática).

---

## 4. Hallazgos

### B1 — Deadlock de arranque en frío (encontrado por V1; **reparado** en t11/t12)

**Síntoma medido** al integrar el supervisor t9 con el worker t4 (snapshot anterior a las reparaciones), con supervisor y worker reales y sin shim:

- El worker recién lanzado moría **antes de escribir nada**:
  `ERROR ape-ingest[1596171]: supervisor inaccesible: no se escribe nada (gen=1)` seguido de `INFO … salida rc=20`.
- El supervisor sí había reservado la generación:
  `relay op=seed key=… gen=1 http=200` y `relay op=publish key=… gen=1 state=starting http=200`.
- El coordinador esperaba al manifest y respondía **HTTP 503** con `X-MF-Reason: manifest_not_ready` tras ~20 s (medido: `HTTP 503 time 20.064351`).

**Causa raíz:** el handler antiguo del supervisor tomaba `flock` durante **todo** el handler y lanzaba el worker dentro de él. El worker recién nacido enviaba `PUBLISH starting` por el mismo socket y necesitaba el mismo flock, pero su cliente UDS (`socat -T0.4`) sólo esperaba 0,4 s → `rc=20`; además el worker lanzado en segundo plano heredaba el descriptor del flock, de modo que el lock seguía vivo mientras viviera el worker. En producción, con `Type=notify`, `systemctl start` espera `READY=1`, que el worker sólo enviaba al publicar `live` → **deadlock determinista**, no una simple carrera.

**Reparación y verificación:**
- **t11** (supervisor): el `--handle` ya no toma flock; cada mutación de estado se delega a un hijo `lua --locked-state` con flock de milisegundos y `stop/seed/start/publish` se ejecutan fuera del lock. Verificado por el capitán: `--selftest` 67/67; 20 OPEN durante un start → 20/20 misma gen, máx. 43,2 ms; `PUBLISH starting` con `socat -T0.4` OK, sin `rc=20`.
- **t12** (worker): `READY=1` **antes** de cualquier publish; el publish inicial reintenta 0/0,2/0,4/0,8/1,6 s (presupuesto duro 4 s); `stale_generation` corta en el acto con `exit 21`. Verificado por el capitán: `--selftest` 108/108; sha `B900DDD2…`.
- **Esta corrida V1** se hizo con esas reparaciones y **sin shim** (`--shim-delay 0`): 50/50 clientes en frío → 200 en 3,27 s. `COLD_START=PASS`.

### O2 — La entrada `/live.m3u8` sirve la playlist cruda con URIs relativas (abierto, fuera de los 6 criterios; para G1)

Evidencia de esta misma corrida (`/tmp/mf_v1/evidence/fence-new.body` y `.hdr`, respuesta 200 de `/mf/<key>/live.m3u8`):

```
#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-DISCONTINUITY
#EXTINF:2.000000,
seg00000.ts
```

Cabeceras: `HTTP/1.1 200 OK`, `Content-Type: application/vnd.apple.mpegurl`, `Cache-Control: no-store`… **sin `X-MF-Gen`**. En cambio, la ruta canónica con generación sí expone `X-MF-Gen`/`X-MF-Gen-Current` (ver `fence-stale.body.hdr`).

Consecuencia: un player que entre por `/sess/<prov>/<canal>/live.m3u8` (o `/mf/src/...` → `/mf/<key>/live.m3u8`) recibe `seg00000.ts` y lo resuelve contra `/mf/<key>/` → `/mf/<key>/seg00000.ts`, que el coordinador rechaza con jump-to-live (302): **no puede reproducir sin conocer la generación**. El banco de V1 usa la ruta canónica `/mf/<key>/<gen>/...` (que sí funciona y es la ruta caliente de fan-out), por lo que este hueco **no invalida los seis criterios**, pero **sí impide declarar reproducción end-to-end de player**. Recomendación para G1/t8: emitir un manifest de sesión con URLs absolutas `/mf/<key>/<gen>/<seg>.ts` (o exponer `X-MF-Gen` y redirigir a la playlist canónica), y añadir una prueba de reproducción con hls.js/ExoPlayer/VLC.

### O3 — Medición de conexiones upstream: `conntrack` ausente y `ss` con sockets efímeros

`conntrack` no está instalado en el VPS; se usó `ss` + `/proc/net/tcp` + la contabilidad de `accept/close` del propio servidor de origen. Como el worker usa `-http_persistent 0`, cada petición abre/cierra un socket en milisegundos; un muestreo de `ss` cada 100 ms sólo pilló 1 socket concurrente en la fase n5 y 0 en las demás, sin que eso signifique 0 conexiones (el origen contó 4..22 aceptaciones por fase). La prueba fuerte de "exactamente 1" es:
- `max_active` exacto en el destino = **1** en todas las fases (incluido fencing),
- **1** proceso ffmpeg de ingesta en todas las fases,
- tasa de aceptaciones del origen **plana** al pasar de 1 a 50 y 100 clientes.

### O4 — Topes de límites reducidos en staging

La fase de límites usa 2 sesiones / 3 viewers / 5 totales para provocar los tres códigos sin levantar 12 workers. Los valores de producción (12/24/120) no se ejercitan numéricamente aquí; el camino de código y los motivos (`max_sessions`, `max_viewers`, `max_total_viewers`) son los mismos. t2 ya validó los límites con topes reducidos.

### O5 — Lanzador de staging vs systemd real

El banco no instala unidades systemd: usa un watcher FIFO que replica el contrato asíncrono de arranque (un worker por orden de spawn, fuera del handler). Por eso `COLD_START=PASS` acredita el handshake supervisor↔worker↔coordinador sin el deadlock B1, pero **no** vuelve a medir la semántica exacta de `systemctl start` + `Type=notify` (t4 la midió con unidades transitorias). La re-verificación t13 puede ejecutar el mismo banco con las unidades instaladas si el capitán lo requiere; el script no cambia.

### O6 — Origen de staging, no proveedor del propietario

El origen es un HLS local generado con ffmpeg (`testsrc2` + `sine`, 2 s/segmento) en loopback. No hay tráfico al proveedor real ni credenciales en esta prueba. El invariante single-flight se mide sobre sockets TCP reales a ese origen; la validación contra el proveedor autorizado (ticket 302/TTL, 509, CDN) sigue siendo una prueba de staging con aprobación del propietario.

---

## 5. Cómo reproducir

```bash
# 1) copiar el staging al VPS (sólo staging; no toca /etc/nginx ni /run/mediafanout)
scp -r _vps_stage/* root@178.156.147.234:/tmp/mf_stage/
scp _vps_stage/tests/fanout_concurrency.sh root@178.156.147.234:/tmp/mf_stage/tests/

# 2) comprobar sintaxis y plan (comandos de verify del contrato)
scp _vps_stage/tests/fanout_concurrency.sh root@178.156.147.234:/tmp/fanout_concurrency.sh
ssh -o BatchMode=yes root@178.156.147.234 \
  "bash -n /tmp/fanout_concurrency.sh && echo TEST_SCRIPT_SYNTAX_OK"
# -> TEST_SCRIPT_SYNTAX_OK (exit 0)

ssh -o BatchMode=yes root@178.156.147.234 \
  "cd /tmp && bash ./fanout_concurrency.sh --dry-run; rc=\$?; echo DRYRUN_EXIT=\$rc; exit \$rc"
# -> DRY_RUN_OK, DRYRUN_EXIT=0 (no arranca nada)

# 3) ejecutar el banco (requiere aprobación explícita del propietario:
#    arranca procesos de ingesta en staging)
ssh -o BatchMode=yes root@178.156.147.234 \
  "MF_STAGE_SRC=/tmp/mf_stage timeout 480 bash /tmp/mf_stage/tests/fanout_concurrency.sh \
     --shim-delay 0 --keep"
# -> RESULT=PASS_INVARIANT, exit 0; evidencia en /tmp/mf_v1/evidence.txt
```

Opciones: `--dry-run` valida plan/herramientas y sale 0 sin arrancar nada; `--keep` conserva `/tmp/mf_v1`; `--skip-limits` omite la fase B; `--shim-delay N>0` reconstruye el snapshot antiguo t9/t4 para reproducir B1; `--b1-probe 1` intenta el arranque en frío sin shim y captura la evidencia de B1.

**Códigos de salida del banco:** `0` invariante PASS y producción intacta; `1` algún criterio FAIL; `2` corrida INVÁLIDA (nginx de producción reiniciado o config cambiada en la ventana); `3` error de entorno/uso.

### Comandos de verificación del contrato (ejecutados)

| Comando | Resultado |
|---|---|
| `scp _vps_stage/tests/fanout_concurrency.sh root@…:/tmp/fanout_concurrency.sh && ssh … "bash -n /tmp/fanout_concurrency.sh && echo TEST_SCRIPT_SYNTAX_OK"` | `TEST_SCRIPT_SYNTAX_OK`, exit **0** |
| `ssh … "cd /tmp && bash ./fanout_concurrency.sh --dry-run; rc=$?; echo DRYRUN_EXIT=$rc; exit $rc"` | `DRY_RUN_OK`, `DRYRUN_EXIT=0`, exit **0** |
| `ssh … "MF_STAGE_SRC=/tmp/mf_stage timeout 480 bash /tmp/mf_stage/tests/fanout_concurrency.sh --shim-delay 0 --keep"` (ejecución real, con aprobación del propietario) | `RESULT=PASS_INVARIANT`, 23 PASS / 0 FAIL, exit **0** |

---

## 6. Inventario de evidencia

| Artefacto (VPS staging) | Contenido |
|---|---|
| `/tmp/mf_v1/evidence.txt` | Log completo de la corrida (292 líneas), PASS/FAIL y resumen |
| `/tmp/mf_v1/analysis.json` | Coherencia, snapshots, aislamiento, latencias/bytes por fase |
| `/tmp/mf_v1/phases/upstream.csv` | Muestreo `ss` + `/proc/net/tcp` + ffmpeg (~20 KB) |
| `/tmp/mf_v1/evidence/ss-probe.json` | 20 hits / 94 muestras positivas de `ss` (1 socket, 1 PID ffmpeg) con 50 clientes |
| `/tmp/mf_v1/phases/*/` | 1.100+1.500+600+… registros JSONL por cliente |
| `/tmp/mf_v1/evidence/stats-*.json` | `accepts/gets/max_active` por fase en el origen |
| `/tmp/mf_v1/evidence/fence-*.{m3u8,body,hdr}` | Playlists vieja/nueva y cabeceras de fencing |
| `/tmp/mf_v1/evidence/nginx-journal-window.txt` | `-- No entries --` |
| `/tmp/mf_v1/ts/timestamps.txt` | PTS/DTS por segmento |
| `/tmp/mf_v1/a/logs/`, `/tmp/mf_v1/b/logs/` | nginx, supervisor, workers por fase |

**Conclusión final:** con el código reparado (t11+t12), **V1 pasa los seis criterios con evidencia medida**: 50 clientes simultáneos comparten una única ingesta (1 conexión upstream concurrente, 1 ffmpeg), secuencia y timestamps idénticos, aislamiento entre clientes y fencing correcto al matar el worker; los límites responden con 503 y motivo sin expulsar a los conectados. B1 quedó documentado y reparado; O2 (playlist live con URIs relativas) debe cerrarse en G1 antes de declarar reproducción end-to-end de player. Producción no se tocó y la ventana de medición no tuvo reinicios de nginx.

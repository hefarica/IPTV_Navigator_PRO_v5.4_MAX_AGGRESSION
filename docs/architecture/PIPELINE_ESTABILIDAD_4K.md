# PIPELINE DE ESTABILIDAD 4K — qué aguanta este VPS, qué no, y qué haría falta

> **Qué es este documento.** El pipeline de infraestructura completo para sostener 4K en el
> ecosistema APE: las cinco capas de defensa aplicadas a la infraestructura REAL, la tabla de
> decisión de failover, el presupuesto 4K medido, el plan de capacidad 2×/5×/10×, los límites
> honestos y un checklist reproducible.
>
> **Qué NO es.** No es una propuesta de despliegue, no cambia una sola línea de producción y no
> promete rendimiento que no se haya medido. **Cero mutaciones:** todos los comandos ejecutados
> para escribirlo fueron de lectura.

| Campo | Valor |
|---|---|
| Fecha de medición | **2026-11-15, 07:00–07:20 UTC** (02:00–02:20 America/Bogota) |
| Host | `ubuntu-2gb-ash-1` · `178.156.147.234` · uptime **135 d 5 h** |
| Repo | `HEAD 2032ccbb` · rama `deploy/engine-restart-20261112` |
| Método | SSH lectura (`ssh -i id_ed25519_hetzner root@178.156.147.234`), `systemctl`, `du`, `stat`, `awk`, `curl -sI`, `sar`, `ps`, y lectura de los ficheros desplegados |
| Doctrinas aplicadas | autopista (`net-shield-autopista-sop.md`), `ANTI_DEGRADATION_LAW`, `iptv-vps-touch-nothing` |
| Estado | **Documento de decisión.** No autoriza ningún cambio. |

---

## 0. Resumen para decidir

1. **El VPS no es un servidor de vídeo: es un edge de metadata que, desde el 2026-11-14, también
   relaya segmentos** por `/seg/` (`pulse.php:115`, `url2-cartridge.conf:77-78`). Medido hoy:
   **141 peticiones y ~1,19 GB de vídeo** relayados en la ventana del log. La premisa «no
   transporta vídeo» está **obsoleta**, no falsa: era cierta hasta el 2026-11-13.
2. **El recurso escaso no es la RAM ni la CPU: es la conexión del proveedor.** Hoy, de 741
   peticiones `/pulse/` registradas, **458 (61,8 %) devolvieron 407** — bloqueo del proveedor. Ese
   es el muro real de estabilidad, y **no se arregla con infraestructura**, se diagnostica.
3. **Las capas N0 (buffer de cliente), N1 (proxy de manifiesto), N4 (monitoreo) y N5 (auto-healing
   de servicio) ya existen y están medidas.** La única capa ausente es **N3 (multiplexor/failover
   multiproveedor)**, y no existe por diseño: la lista exige **una URL por canal** (Anti-509).
4. **No entra un 4K transcodificado en tiempo real en 3 vCPU.** El propio motor JIT declara
   `limits.concurrent_channels = 1` y no certifica tiempo real. **Veredicto: 0 canales 4K
   transcodificados.** El 4K se sostiene sin transcodificar (copy) o no se sostiene.
5. **El disco es el primer techo del catálogo:** con 6,6 GB libres y un gate que falla al 90 %,
   el margen real antes de la alarma es de **~2,94 GB**. Un catálogo **2×** deja el disco al
   **~87 %** si se conservan las dos formas (crudo + `.gz`): cabe, pero sin margen para otro
   deploy. **5× y 10× exigen disco nuevo o limpieza previa medida.**
6. **El ring buffer de 512 MB no es viable aquí**: son **13,4 % de la RAM total** y memoria **por
   sesión**, y añade latencia sobre un p50 de zapeo ya medido de **376 ms**. La doctrina lo
   prohíbe además por su cuenta.
7. **Docker: no se propone, y tampoco hace falta — pero ya está instalado y encendido** (ver §2.1).
   No se usa, no se amplía, no se toca sin autorización.

**La única decisión que este documento pide:** ¿se autoriza construir N3 (tabla
`canal → [fuente primaria, fuente backup]` detrás de `/pulse/<id>`, aditiva, sin tocar la lista)?
Es la única pieza que cambia el resultado de «el proveedor devolvió 407» a «hay otra fuente».

---

## 1. Evidencia maestra — todo lo que este documento afirma, con su origen

Medido el **2026-11-15 07:00–07:20 UTC** salvo donde se indique otra fecha. «VPS» = ejecutado por
SSH de lectura en `178.156.147.234`. «Local» = repo `2032ccbb`.

### 1.1 Plataforma

| Hecho | Valor medido | Comando / artefacto |
|---|---|---|
| vCPU | **3** · `AMD EPYC-Rome Processor` | `nproc` · `grep -m1 'model name' /proc/cpuinfo` |
| RAM | **3.819 MB** total · 649 usados · 1.593 libres · 1.849 buff/cache · **3.170 disponibles** | `free -m` |
| Disco | `/dev/sda1` **38 G** · **30 G usados** · **6,6 G libres** · **82 %** | `df -h /` |
| Uptime | **135 días 5 h** | `uptime` |
| nginx | **1.24.0 (Ubuntu)** | `nginx -v` |
| gzip | `gzip on` + `gzip_static on` + `application/vnd.apple.mpegurl` en `gzip_types` | `/etc/nginx/nginx.conf:67,72,73` |
| Congestión TCP | **bbr** + **fq** | `sysctl -n net.ipv4.tcp_congestion_control net.core.default_qdisc` |
| php-fpm 8.3 | `pm=dynamic` · **`pm.max_children=50`** · start=2 · min/max spare 1/2 | `/etc/php/8.3/fpm/pool.d/*.conf` |
| Procesos | nginx 5 · php-fpm 4 · node 3 | `pgrep -c` |
| RSS por familia | nginx **31.792 KB** (5) · php-fpm **35.976 KB** (4 ≈ 9 MB c/u) · node **35.432 KB** (3) | `ps -eo rss,comm` agrupado |
| ffmpeg | presente, **6.1.1-3ubuntu5**, **0 procesos** | `ffmpeg -version` · `pgrep -c ffmpeg` |
| Motor JIT | `/opt/ape-jit/server.js` (pid 1789001), bind `127.0.0.1:3099` | `pgrep -af "node .*server.js"` |

### 1.2 Catálogo servido (el activo real)

| Hecho | Valor medido | Cómo |
|---|---|---|
| Fichero servido | `/var/www/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT_CABLEADA.m3u8` | `ls -la` |
| Bytes | **186.789.613** | `wc -lc` |
| Líneas | **127.380** (= **6,00 líneas/canal**) | `wc -l` |
| `#EXTINF` | **21.224** | `awk` censo |
| `#EXTSHIMOTT` | **21.224** (1:1) | `awk` censo |
| `#EXT-X-STREAM-INF` | **21.224** | `awk` censo |
| `#EXTHTTP` | **21.224** | `awk` censo |
| `#EXT-X-DATERANGE` | **21.225** | `awk` censo |
| URLs `/pulse/` | **21.224** | `grep -c '/pulse/'` |
| `#EXT-X-APE-*` | **0** | `grep -c '^#EXT-X-APE-'` |
| `.gz` servido | **4.023.581 B** (ratio **2,154 %**) | `ls -la` · HTTP `content-length` |
| Cabecera pública | `HTTP/2 200` · `content-encoding: gzip` · `cache-control: no-store` · `accept-ranges: bytes` · `x-ape-list-source: pulse-wrapped-if-present` | `curl -sI -H 'Accept-Encoding: gzip'` |
| Catálogo JIT completo | `/var/www/html/lists/APE_LISTA_1794100720046_CABLEADA.m3u8` = **1.298.222.092 B** · **22.190.344 líneas** · **1.045,5 líneas/canal** | `wc -lc` |
| Directivas del catálogo completo | `#EXTVLCOPT` **2.907.692** · `#KODIPROP` **2.313.422** · `#EXTATTRFROMURL` **1.146.096** · `#EXT-X-CMAF` **42.448** · `#EXT-X-APE-AUDIO` **42.448** | `awk` censo |
| `.gz` totales en `/var/www/lists` | **1.088.243.840 B** en **9** ficheros; el mayor **352.804.883 B** | `du -cb *.gz` |

### 1.3 Tráfico y latencia (lo que el VPS sirve de verdad)

| Hecho | Valor medido | Cómo |
|---|---|---|
| `/pulse/` latencia (últimas 5.000 líneas, sólo `/pulse/`) | **n=735 · p50 0,376 s · p95 1,174 s · max 12,010 s** | `tail -5000 playlist_access.log \| grep 'GET /pulse/' \| sed 's/.* rt=…'` |
| Estáticos (no `/pulse/`) | **n=3.000 · p50 0,023 s · p95 8,499 s · max 469,811 s** (descargas del catálogo de 1,3 GB) | idem sin filtro |
| Códigos de `/pulse/` HOY | **407 ×458 (61,8 %)** · 200 ×269 · 499 ×10 · 404 ×3 · 403 ×1 | `awk '{print $9}' \| sort \| uniq -c` |
| Bytes de los 200 de `/pulse/` | **n=269 · min 384 B · max 3.917 B · suma 515.154 B** (manifest por canal ≈ 1,9 KB) | `awk '$9==200'` |
| `200` con **0 bytes** | **0 casos** en 741 peticiones de hoy | `awk '$9==200 && $10==0'` |
| `/seg/` HOY | **141 peticiones** · **139× 200** · 2× 404 · **2 clientes** | `grep -c '/seg/'` |
| `/seg/` bytes HOY | **1.190.394.064 B ≈ 1,19 GB** | `awk` sobre `$body_bytes_sent` |
| Cliente del operador | **112 segmentos · 1.031.794.820 B** · segmento mediano **8.209.307 B** (p25 7.320.824 · p75 8.591.657) | `awk` por IP |
| Intervalo entre segmentos | mediano **5 s** (p25 2 s · p75 16 s · n=101) | deltas de `$time_local` |
| Bitrate derivado (supuesto declarado) | **13,13 Mbps** = mediana_bytes × 8 / mediana_delta | cálculo, ver §5.3 |
| `eth0` desde el arranque | rx **109.570.799.757 B** · tx **363.265.191.900 B** en 135,22 d → **rx 9,4 kB/s · tx 31,1 kB/s de media** | `/proc/net/dev` + `uptime` |
| `eth0` ahora (3 muestras `sar`) | tx **0,39–3,08 kB/s** | `sar -n DEV 1 3` |
| Descarga externa 4 MB (cliente del operador) | light: **4.023.581 B en 1,249 s = 3,22 MB/s = 25,8 Mbps**, TTFB 0,487 s · JIT: **24,0 Mbps**, TTFB 0,583 s | `curl -r 0-4194303 -w '%{speed_download}'` |
| Descarga local en el VPS | 4.023.581 B en **0,0438 s** | `curl -o /dev/null` a `127.0.0.1` |

### 1.4 Vigilancia, timers y gates

| Hecho | Valor medido | Cómo |
|---|---|---|
| Timers `ape-*` | **11** · **10 activos** · **`ape-quality-watch.timer` = inactive** | `systemctl list-timers --all \| grep ape-` · `is-active` uno a uno |
| Cadencia del vigilante de módulos | `OnBootSec=90s` + **`OnUnitActiveSec=60s`** | `systemctl cat ape-module-watchdog.timer` |
| Estado del vigilante | `{"ts":"2026-11-15T07:05:50Z","verdict":"OK","fallos":0}` · **7 módulos** | `/var/lib/ape/module-watchdog.json` |
| Filas del vigilante | `nginx-health · php-fpm · jit-catalogo · canary · pulse-canal (sin-muestra 407) · zapping · **proyeccion**` | idem |
| Gate del flujo | **11 checks** en el fichero (`tools/quality/gate_ape_crystal_flow.sh:64-189`), sólo lectura HTTP | lectura del script |
| Gate ejecutado HOY (local) | **`VERDICT=PASS pass=6 fail=0`** exit 0 (5 SKIP: disco/caché/frescura/proyección exigen estar en el VPS) | `bash tools/quality/gate_ape_crystal_flow.sh --quiet` |
| Gate anti-degradación (local) | **`TOTAL=8 PASS=8 FAIL=0`** exit 0 · **16 degradaciones conocidas en línea base** del JIT | `node tools/check_anti_degradation_policy.js` |
| Contrato operativo | `contracts/ape_crystal_flow_operativa.json` = **5 estaciones** | `python -c json.load` |

### 1.5 Ruta de vídeo y de manifiesto (dónde vive cada cosa)

| Ruta pública | Destino real | Evidencia |
|---|---|---|
| `GET /pulse/<id>.m3u8?u=…` | `rewrite` → `/prisma/api/pulse.php` | `/etc/nginx/snippets/url2-cartridge.conf:23-24` |
| `GET /seg/<b64url>` | `rewrite` → `/prisma/api/pulse.php` → `ape_seg_serve()` | `url2-cartridge.conf:77-78` · `pulse.php:115,162-165` |
| `GET /lists/*_CABLEADA*.m3u8` | estático + `gzip_static` | `location ^~ /lists/` · cabecera `content-encoding: gzip` |
| `GET /jit/playlist-calidad.m3u8` | proxy al motor **3099** | `snippets/ape-jit.conf:31` · `location ^~ /jit/` |

**Mecanismos dentro de `pulse.php` (39.039 B, desplegado 2026-11-14 17:26) — leídos línea a línea:**

| Mecanismo | Línea | Valor |
|---|---|---|
| Caché de manifiesto APCu | `:667` | `apcu_store($plKey, …, 8)` → **TTL 8 s** |
| Última playlist buena (stale) | `:668` | `apcu_store($goodKey, …, 60)` → **60 s** |
| Single-flight | `:594` · `:598` | `apcu_add($lockKey, 1, 3)` → lock **3 s**; espera `usleep(150000)` → **150 ms × N** |
| Retry único | `:610-624` | sólo `0, ≥500, 513, 461, 429, 408, 302`; `461→400 ms`, `302→150 ms`, resto `250 ms`; un `302` reintenta una segunda vez (`200,302,302` medido) |
| Stale servido con bandera | `:671` | `X-APE-Pulse: …;stale=1;upstream_code=<code>` |
| Código REAL al cliente | `:719` | `$httpOut = ($code>=400 && $code<=599) ? (int)$code : 502;` |
| TLS del upstream **sin verificar** | `:142` · `:549` | `CURLOPT_SSL_VERIFYPEER => false` → **MITM posible sobre el manifest** (riesgo abierto, no se arregla en este documento) |

**Auto-healing (`/opt/ape-pulse/ape-module-watchdog.sh`):** `restart_if()` en `:76-84`,
`systemctl restart` en `:82`, invocado para **nginx** (`:95`), **php8.3-fpm** (`:105`) y
**ape-jit** (`:116`). No hay auto-healing **por canal**.

---

## 2. Correcciones a la premisa de la misión (fail-honest)

Cinco afirmaciones del encargo **no coinciden con el artefacto medido**. Se dejan escritas porque
un documento que repite una premisa falsa se convierte en el próximo defecto.

### 2.1 «NO hay Docker en producción»

**Falso hoy.** Docker está **instalado y el demonio activo**:

```
systemctl is-active docker          → active
docker ps -a --format '{{.Names}}'  → 9 contenedores, TODOS "Exited" hace 4 meses
du -sh /var/lib/docker              → 295–301 MB
du -sh /var/lib/containerd          → 2,47 GB
ps: dockerd 40.420 KB RSS · containerd 28.628 KB RSS
```

Implicaciones medidas: **~2,8 GB de disco** (**~7,3 %** de los 38 GB) y **~69 MB de RSS** ocupados
por una capa que no sirve al flujo. **No se toca** (borrar imágenes/contenedores es destructivo y no hay
autorización), pero deja de ser cierto que «no hay Docker»: hay Docker **sin usar**, y eso cambia
la conversación de capacidad (§6) y el argumento de por qué no se propone containerizar nada.

**La regla se mantiene y se refuerza:** no se instala Docker, no se despliega el flujo en
contenedores y no se usa esta capa. En 3 vCPU / 4 GB / 82 % de disco no cabe, y un daemon inactivo
de 69 MB RSS solo añade superficie.

### 2.2 «NO transporta vídeo»

**Obsoleto desde el 2026-11-14.** El path de vídeo **sí** atraviesa el VPS:

- `location ^~ /seg/` → `rewrite` a `pulse.php` (`url2-cartridge.conf:77-78`).
- `ape_seg_serve()` sirve el segmento con `CURLOPT_RETURNTRANSFER=false` (streaming directo).
- **Medido hoy: 141 peticiones, 1.190.394.064 B (≈1,19 GB) relayados**, 139 × 200.
- Motivo documentado en el propio código (`pulse.php:333-340`): el device **no alcanza** el puerto
  80 del host de segmentos; el VPS **sí**. Sin `/seg/` la pantalla queda en «Buffering: 0 %».

**Consecuencia para 4K:** el VPS está en el camino del vídeo **por necesidad del device**, no por
diseño. Eso convierte el egress del VPS en un riesgo nuevo de estabilidad (§7, R-1). La doctrina
del 2026-10-25 (`VPS_REALITY_MEASURED`) hay que leerla con esta fecha: **rige hasta el 2026-11-13.**

### 2.3 «42 KB/canal de metadata»

**No reproducible con ningún artefacto medido.** Las tres cifras reales por canal:

| Base | Cálculo | Resultado por canal |
|---|---|---|
| Proyección servida (light) | 186.789.613 ÷ 21.224 | **8.802 B (8,80 kB)** |
| Catálogo completo JIT | 1.298.222.092 ÷ 21.224 | **61.168 B (61,17 kB)** |
| Proyección servida comprimida | 4.023.581 ÷ 21.224 | **189,6 B** |

Para que 42 kB/canal fuera cierto sobre 21.224 canales, el fichero tendría que pesar
**891,4 MB**: mide **186,8 MB** (4,77× menos). La única cifra cercana a «42» en el corpus es
**42.448 etiquetas** `#EXT-X-CMAF` / `#EXT-X-APE-AUDIO` (exactamente 2 por canal) del catálogo
completo. **Hipótesis de origen, no hecho:** confusión entre «42.448 tags» y «42 kB/canal».

**Se usa 8,80 kB/canal para la proyección y 61,17 kB/canal para el catálogo completo** en todo el
resto del documento.

### 2.4 «Gate de 10 checks»

**El gate tiene 11 comprobaciones** (`tools/quality/gate_ape_crystal_flow.sh:64-189`):
`health · jit-calidad · lista-cableada · canary · pulse-canal · endpoint-canal · vigilante · disco ·
cache-resolucion · vigilante-fresco · **proyeccion**`. La [11] se añadió el 2026-11-15
(`:171-189`) y verifica **el fichero servido** (1 tag por canal, 0 APE), no solo los endpoints.

### 2.5 «Vigilante de 7 módulos» — **confirmado**, con un matiz

7 filas, verificado en `/var/lib/ape/module-watchdog.json`. La documentación de arquitectura dice
6 (`INSTRUMENTACION_APE_CRYSTAL_FLOW.md:112-114`) porque `proyeccion` se añadió el 2026-11-15.
**Manda el script y el JSON.**

---

## 3. Las cinco capas de defensa aplicadas a ESTA infraestructura

Modelo: `iptv-antifreeze-continuity-doctrine`. Cinco capas; cada una vive en un sitio distinto,
cuesta distinto y **falla distinto**. Confundirlas produce «arreglos» que degradan o que bloquean.

> La skill separa el proxy en **N1 (proxy de manifiesto)** y **N2 (gap buffer)**. En este
> documento N2 aparece como sub-escalón **rechazado con motivo medido**, no como una capa más:
> son cinco capas y una sub-capa descartada.

### 3.0 Mapa

| # | Capa | ¿Existe hoy? | Dónde vive (ruta real) | ¿Se puede hoy sin instalar nada? |
|---|---|---|---|---|
| **1 (N0)** | Buffer de cliente | **Sí** (en el device) | player / `#EXTVLCOPT` `#KODIPROP` del catálogo | Sí, cambiando **perfil** (no el generador) |
| **2 (N1)** | Proxy de manifiesto | **Sí**, medida | `pulse.php` + `url2-cartridge.conf:23-24` | Sí, ya está desplegado |
| **3 (N3)** | Multiplexor / failover | **NO** | no existe; viviría detrás de `/pulse/<id>` | Sí (PHP + tabla), **pero es cambio en prod → autorización** |
| **4 (N4)** | Monitoreo | **Sí**, 7 filas | `ape-module-watchdog.sh` + timer 60 s + gate 11 checks | Sí, ya está desplegado |
| **5 (N5)** | Auto-healing | **Sí, de servicio** | mismo script, `restart_if()` | Sí, ya está desplegado |
| (N2) | Gap buffer 5–20 s | **NO, y no debe** | — | **No aplicable** (ver 3.3) |

### 3.1 Capa 1 — Buffer de cliente (N0)

| Campo | Contenido |
|---|---|
| **Qué hace** | Absorbe el hipo de red sin tocar el servidor. Es el único anti-freeze que no cuesta ancho de banda. |
| **Dónde vive** | En el device. En la lista, por canal: el catálogo completo emite **2.907.692 `#EXTVLCOPT`** y **2.313.422 `#KODIPROP`** (medido), que es donde viajan `network-caching` y los parámetros de load-control por perfil. |
| **Hoy, sin instalar nada** | Elegir otro **perfil** en el Gestor (los presets ya existen en el repo). **No** se toca el generador: `m3u8-typed-arrays-ultimate.js` está prohibido por el operador. |
| **No se puede** | Medir su efecto desde el VPS: el buffer del player, los **frame drops** y los errores de decoder no son observables sin root en el device. **NO COMPUTADO** — límite físico, no falta de esfuerzo (`INSTRUMENTACION_APE_CRYSTAL_FLOW.md:73-77,148`). |

### 3.2 Capa 2 — Proxy de manifiesto (N1)

| Campo | Contenido |
|---|---|
| **Qué hace** | Cachea 8 s, evita el martilleo al proveedor con single-flight, reintenta una vez, sirve la última playlist buena 60 s si el upstream falla, y **devuelve el código real** del proveedor. |
| **Dónde vive** | `/var/www/html/prisma/api/pulse.php` (39.039 B) detrás de `/etc/nginx/snippets/url2-cartridge.conf:23-24`. |
| **Hoy, sin instalar nada** | Ya está. Lo único añadible sin instalar es **telemetría**: `X-APE-Pulse` ya marca `stale=1;upstream_code=<code>`, y el log `playlist_access.log` ya trae `rt=`/`urt=`. |
| **No se puede** | (a) Convertir un **407** en disponibilidad: es del proveedor. (b) Hacer failover: **no hay tabla de fuentes**. (c) Arreglar el `SSL_VERIFYPEER=false` (`pulse.php:142,549`) sin tocar producción — hoy el manifest puede ser interceptado. |

**Medición que valida esta capa:** p50 **376 ms** / p95 **1,17 s** con caché de 8 s, y **269
respuestas 200** de 1,9 KB de media. El proxy no es el cuello de botella: lo es el `urt` del
proveedor (407 en 61,8 % de los casos).

### 3.3 Sub-capa descartada — Gap buffer / ring buffer (N2) — **NO APLICABLE**

| Campo | Contenido |
|---|---|
| **Qué haría** | Guardar 5–20 s de segmentos y servirlos durante el bache. |
| **Dónde viviría** | En el proxy `/seg/`. **No existe.** |
| **Por qué no se implementa — razón 1: RAM** | Un ring de **512 MB** = **13,4 %** de los 3.819 MB totales y **16,2 %** de los 3.170 MB disponibles, y sería **por sesión**, no por servidor. Con `pm.max_children=50` no hay dónde. |
| **Razón 2: latencia** | Añade espera deliberada sobre un p50 de zapeo ya medido de **376 ms**. Un anti-freeze que añade 20 s es un freeze con colchón. |
| **Razón 3: el recurso escaso es la conexión** | El proveedor da ~1 conexión por cuenta. Guardar 20 s **empeora el arranque**, que es el freeze que el operador reporta primero. |
| **Razón 4: doctrina** | `net-shield-autopista-sop.md:24` — nunca frenar. Un gap buffer frena. **Veredicto: no se implementa, y no por falta de hardware.** |

### 3.4 Capa 3 — Multiplexor / failover (N3) — **LA ÚNICA QUE FALTA**

| Campo | Contenido |
|---|---|
| **Qué haría** | Un canal lógico con N fuentes; cambiar de proveedor sin cortar al cliente. |
| **Dónde vive** | **No existe.** No hay mapa `canal → [primario, backup]` en el servidor. `/pulse/<id>` recibe **una** URL en `u=` y la rebasa. |
| **Hoy, sin instalar nada** | **Se puede construir**: tabla versionada en el VPS + selección **antes** de abrir la conexión, detrás del mismo `/pulse/<id>`. No requiere software nuevo (PHP + SQLite/fichero ya presentes). **Requiere autorización: es un cambio en producción.** |
| **No se puede** | (a) Resolverlo **desde la lista**: dos URLs por canal = **HTTP 509** (`CLAUDE.md` §Single URL Per Channel). (b) Prometer «sin corte visible»: en HLS el failover solo es correcto en **frontera de sesión**; dentro de una ventana servida hace falta `#EXT-X-DISCONTINUITY` y aun así el player puede desincronizarse. Se promete **que el canal vuelve**, no que no se note. |
| **Diseño mínimo (propuesta, no implementación)** | cooldown exponencial por fuente (5 s → 10 min) · reset tras **60 s** de servicio sano · **anti ping-pong** · registro del **motivo** (`5xx`/`timeout`/`eof`) · **nunca** disparar por `401/403/407/429/451`. |

### 3.5 Capa 4 — Monitoreo (N4)

| Campo | Contenido |
|---|---|
| **Qué hace** | Sondeo por **HTTP real** (nunca `systemctl is-active`), 7 módulos, cada 60 s; deja estado en JSON; y un gate de 11 checks que falla si el flujo baja de nivel. |
| **Dónde vive** | `/opt/ape-pulse/ape-module-watchdog.sh` · `ape-module-watchdog.{service,timer}` (`OnBootSec=90s`, `OnUnitActiveSec=60s`) · `/var/lib/ape/module-watchdog.json` · `ape-meta-watchdog.timer` (60 s, plano de metadata) · `tools/quality/gate_ape_crystal_flow.sh` (11 checks, sólo lectura HTTP). |
| **Hoy, sin instalar nada** | Ya está. **Se le puede añadir un check de frescura de la proyección** (ver hallazgo H-1): el gate valida los **tags** de la lista servida (`:171-189`) pero **no su edad**. |
| **No se puede** | Ver el device (frame drops, decoder, rebuffer real). **NO COMPUTADO** por diseño. |

### 3.6 Capa 5 — Auto-healing (N5)

| Campo | Contenido |
|---|---|
| **Qué hace** | Si el HTTP real de un módulo falla, reinicia la unidad: `nginx` (`:95`), `php8.3-fpm` (`:105`), `ape-jit` (`:116`), con `restart_if()` (`:76-84`). |
| **Dónde vive** | Mismo script del vigilante. |
| **Hoy, sin instalar nada** | Ya está a nivel de **servicio**. |
| **No se puede** | **Auto-healing por canal**: no reemplaza una fuente muerta ni «revive» un stream. Eso sería N3 + N5 de canal y **no existe**. Reiniciar lo que no se midió es ruido; reiniciar un servicio sano por un 407 del proveedor sería peor. |

### 3.7 Veredicto de las capas

| Capa | Estado medido | Qué falta | Bloqueo |
|---|---|---|---|
| N0 cliente | existe (perfiles) | medir en device | sin instrumentación en el device |
| N1 proxy manifiesto | **existe y funciona** | nada crítico | TLS del upstream sin verificar (riesgo abierto) |
| N2 gap buffer | **rechazada** | — | RAM + latencia + doctrina |
| N3 failover | **NO EXISTE** | tabla `canal → fuentes` | **decisión del operador** (toca prod) |
| N4 monitoreo | **existe (7 filas + 11 checks)** | check de frescura de proyección | ninguno |
| N5 auto-healing | **existe (servicio)** | nada por canal | depende de N3 |

---

## 4. Tabla de decisión de failover

Regla dura, del repo y del HTTP: **un 4xx del proveedor no se enmascara; se diagnostica.** El 502
fijo que hubo en `pulse.php` hasta el 2026-11-14 convirtió 407 reales en 502 nuestros durante 14 h
y **hizo mentir al diagnóstico** (`pulse.php:685` conserva el comentario del fix).

| Código / evento | ¿Failover? | Qué se hace | Justificación **medida en este stack** |
|---|---|---|---|
| `0` (connect/timeout) | **SÍ**, tras 1 retry | retry 250 ms → si vuelve a fallar, siguiente fuente | no hay respuesta: la fuente está caída. `pulse.php:610-624` ya reintenta. |
| `500 502 503 504` | **SÍ** | failover | fallo del servidor de origen. |
| `408` | **NO** — retry con backoff | reintentar | timeout del proveedor, no caída. Ya en la lista de retry (`:610`). |
| `429` | **NO** — retry con backoff | reintentar y **diagnosticar** | throttle por límite de conexiones: cambiar de fuente gasta otra conexión y lo empeora. |
| `461` | **NO** — retry largo (400 ms) | reintentar | **throttle medido de este CDN** (`pulse.php:611-616`: «se recupera en segundos»). |
| `302` | **NO** — se sigue y se re-pide | seguir; 2.º reintento a 150 ms | **el token rota: medido `200,302,302` en tres intentos** (`:618-623`). |
| `401 403` | **NUNCA** | diagnosticar: credencial, IP, UA, token | es auth/bloqueo del proveedor. Hoy: **1 × 403** en el log. |
| `407` | **NUNCA** | diagnosticar | **es el código de bloqueo medido de este proveedor** y hoy supone **458 de 741 (61,8 %)** de las peticiones `/pulse/`. El vigilante ya lo marca **`sin-muestra`**, no `fail`. |
| `451` | **NUNCA** | diagnosticar | bloqueo legal/regional. |
| `499` | **No aplica** | nada | el operador cambió de canal (hoy: **10 casos**). Contarlo como fallo envenena cualquier métrica. |
| `200` con **bytes=0** | **NO** | **investigar, no declarar caído** | un 200 vacío no es una caída: puede ser ventana vacía del proveedor o un `304+0 B` mal gestionado del que ya hay defecto documentado (`okhttp: unexpected end of stream`). Hoy: **0 casos** en 741 peticiones; el gate ya distingue un 200 **con** `/seg/` de uno sin (`gate:111-114`) y lo trata como FAIL de *manifest*, no como caída del canal. |
| `5xx` en **dos** fuentes a la vez | **NO** | reabrir en el live edge | dos backbones que fallan juntos apuntan a red o a fuente, no a proveedor. |
| Tras recuperación | — | **auto-return con histéresis** | reset a los **60 s** de servicio sano + anti ping-pong. Volver «en cuanto responde un ping» produce **dos cortes en vez de uno**. |

### 4.1 La regla segunda (la que se olvida)

**El failover cambia de proveedor, nunca de calidad.** Si el failover altera `CODECS=`,
`RESOLUTION=` o `BANDWIDTH=`, no es failover: es una degradación con otro nombre
(`ANTI_DEGRADATION_LAW` Art. 1/5). El failover correcto entrega **el mismo perfil** desde otra
fuente. El gate `check_anti_degradation_policy.js` ya vigila el código (8/8 PASS hoy, con 16
degradaciones en línea base del JIT que **no** deben crecer).

### 4.2 Lo que hoy existe de verdad (no confundir con failover)

| Primitiva | Dónde | Qué hace y qué **no** |
|---|---|---|
| Retry único | `pulse.php:610-624` | reintenta **la misma** URL; no cambia de fuente |
| Stale 60 s | `pulse.php:668,671` | sirve la última buena, marcada `stale=1`; no cambia de fuente |
| Código real | `pulse.php:719` | permite decidir al player con información honesta |
| Config de nginx | — | **no hay** `proxy_next_upstream` con backup en la ruta `/pulse/` (es un `rewrite` a PHP, no un `proxy_pass`) |

**Decisión que pide este apartado:** sin tabla de fuentes **no hay failover multiproveedor**. Llamar
«failover» al retry+stale es mentir el estado. La tabla es la propuesta de §3.4.

---

## 5. Presupuesto 4K con los números reales

El 4K se descompone en **cuatro presupuestos distintos**. Mezclarlos es cómo se llega a «cabe» sin
saber qué es lo que cabe.

### 5.1 Presupuesto A — metadata (lo que el VPS sí hace)

| Magnitud | Medido | Fuente |
|---|---|---|
| Coste de servir el catálogo completo a un cliente | **4.023.581 B** (`.gz`) → **25,8 Mbps** de pico puntual en la descarga de 1,25 s | `curl -r 0-4194303` externo |
| Coste de servir el catálogo en el propio VPS | **4.023.581 B en 0,0438 s** | `curl` a `127.0.0.1` |
| Coste de un zapeo | **~1,9 KB** de manifest (269 respuestas 200: media 1.915 B) | `awk '$9==200'` |
| Latencia de zapeo | **p50 376 ms · p95 1,17 s** | `playlist_access.log` |
| Canales servidos | **21.224** | censo de la lista |

**Conclusión A:** en ancho de banda de metadata, el VPS aguanta **el catálogo entero (21.224
canales) por cliente y por descarga**, a ~4 MB comprimidos. El coste por canal no depende del 4K.

### 5.2 Presupuesto B — vídeo relayado (`/seg/`), el nuevo rol

| Magnitud | Medido | Fuente |
|---|---|---|
| Vídeo relayado hoy | **1.190.394.064 B (1,19 GB)** en 141 peticiones | `playlist_access.log` |
| Clientes concurrentes hoy | **2** (1 es el propio VPS) | `awk` por IP |
| Segmento mediano | **8.209.307 B** | `awk` por IP |
| Intervalo mediano entre segmentos | **5 s** (p25 2 s · p75 16 s) | deltas de `$time_local` |
| Bitrate derivado | **13,13 Mbps** | mediana_bytes × 8 / mediana_delta |
| Estado de las 141 peticiones | **139 × 200**, 2 × 404 | `awk '{print $9}'` |

**Supuesto declarado del bitrate derivado:** se asume que, en reproducción continua, el intervalo
entre peticiones de segmentos ≈ duración del segmento. Es una **derivación**, no una lectura del
`#EXTINF`. Si la duración real de los segmentos es 6 s el bitrate sería ~10,9 Mbps; si es 10 s,
~6,6 Mbps. **Rango honesto: 6,6–13,1 Mbps.** La duración exacta del segmento del canal que se
estaba viendo es **NO COMPUTADO** (exigiría abrir una conexión al proveedor, ver §7).

### 5.3 Presupuesto C — RAM / concurrencia

| Recurso | Medido | Techo calculable |
|---|---|---|
| RAM disponible | **3.170 MB** | `free -m` |
| Coste por petición PHP | **~9 MB** RSS medio por hijo · **`pm.max_children = 50`** | pool `php-fpm` |
| Techo de RAM para concurrencia | **50 × 9 MB ≈ 450 MB** (14 % de la disponible) | `50 × RSS` |
| Escritorio de nginx + node + JIT | 31.792 KB + 35.432 KB + 69 MB (Docker) | `ps` |
| Throughput de peticiones | 50 hijos / 1,5 s por segmento ≈ **33 req/s** | cálculo |
| Visores teóricos por RAM | 33 req/s × 5 s/segmento ≈ **165** | cálculo |

**Conclusión C:** **la RAM no es el techo del 4K** (sobran ~2,7 GB). El techo es la **red**, que no
está medida, y la **cuenta del proveedor**, que da ~1 conexión.

### 5.4 Presupuesto D — CPU / transcodificación: **0 canales 4K**

| Hecho | Evidencia |
|---|---|
| 3 vCPU AMD EPYC-Rome | `nproc`, `/proc/cpuinfo` |
| El motor JIT declara **`limits.concurrent_channels: 1`** y `idle_stop_s: 90` | `curl 127.0.0.1:3099/capabilities.json` |
| El motor declara **`rea_executed: false`** y **«Physical HDR and realtime performance are not certified»** | idem |
| Las variantes que el motor puede producir son **SDR 720 / SDR 1080** (`SDR720_STABLE`, `legacy_hdr: 1920x1080`) | idem |
| ffmpeg 6.1.1 presente, **0 procesos** hoy | `pgrep -c ffmpeg` |
| Riesgo medido: `resolveOnDemand` usa `execFileSync` con timeout **90 s** dentro del handler HTTP → **bloquea el event loop** de node | `ape_jit_contract` → `server.js:185-196` |

**Veredicto D:** **0 canales 4K transcodificados en tiempo real.** No porque «no se haya probado»,
sino porque el motor se autolimita a **1 canal** y solo ofrece salidas **SDR 720/1080** — y la
doctrina **prohíbe** usar una salida degradada como estabilizador (Art. 1/5). Además, un 4K HEVC a
25 Mbps exige ≥ 1× tiempo real de encode: **medirlo requeriría ejecutar ffmpeg en producción**, que
este documento no hace (comando y criterio en §8-D).

### 5.5 ¿Cuántos canales 4K caben? — respuesta separada por presupuesto

| Pregunta | Respuesta medida | Base |
|---|---|---|
| ¿Cuántos canales 4K caben en **metadata**? | **21.224** (todos) y hasta el techo de disco de §6 | 8,80 kB/canal |
| ¿Cuántos 4K caben en **RAM**? | **~165 visores teóricos** por RAM (no vinculante) | §5.3 |
| ¿Cuántos 4K caben en **ancho de banda**? | **NO COMPUTADO** — capacidad del enlace no medida. Cota inferior medida: **25,8 Mbps** a un cliente externo (1 muestra, incluye arranque de TCP). | §1.3 |
| ¿Cuántos 4K caben **transcodificados**? | **0** | §5.4 |
| ¿Cuántos 4K caben en **relay directo** (`/seg/`)? | Tope por **cuenta del proveedor** (~1 conexión) y por CPU de PHP; hoy: **2 clientes**, uno de ellos el propio host | §5.2 |

### 5.6 Cómo se mide lo que falta (comandos exactos)

| Magnitud | Comando | Coste / condición |
|---|---|---|
| Capacidad real de egress | `curl -o /dev/null -w '%{speed_download}\n' -r 0-104857599 https://iptv-ape.duckdns.org/jit/playlist-calidad.m3u8` **desde un host externo**, 3 veces | **100 MB por corrida** · off-peak · autorización |
| Caudal por minuto en el VPS | `sar -n DEV 60 1` | lectura, 60 s |
| Serie histórica de red | `sar -n DEV -f /var/log/sysstat/sar14` | **HOY devuelve 0 líneas** (formato no legible por este `sar`): **NO COMPUTADO** |
| Duración real de segmento | `curl -s '<manifest del canal>' \| grep '#EXTINF'` | **abre conexión al proveedor**: no ejecutar con reproducción en curso |
| Bitrate real del canal | `ffprobe -v error -show_entries format=bit_rate -of csv=p=0 '<segmento>'` | idem; requiere descargar un segmento |
| Transcode 4K real | `ffmpeg -benchmark -i <muestra> -c:v libx265 -preset ultrafast -f null -` | **NO en prod**: 3 vCPU compartidas |
| Conexiones libres del proveedor | no medible desde aquí | fuera de alcance |

---

## 6. Plan de capacidad: 2× / 5× / 10×

Base medida: **186.789.613 B**, **21.224 canales**, `.gz` **4.023.581 B**, **8,80 kB/canal** para la
proyección y **61,17 kB/canal** para el catálogo completo. Disco: **6,6 GB libres** de 38 GB (82 %).

### 6.1 Tabla de crecimiento

| Escenario | Canales | Proyección cruda | Proyección `.gz` | Catálogo completo | `.gz` del completo | **Total en disco (ambas formas)** |
|---|---|---|---|---|---|---|
| **1× (hoy)** | 21.224 | 186,8 MB | **4,0 MB** | 1,30 GB | 352,8 MB | **~1,84 GB** |
| **2×** | 42.448 | 373,6 MB | 8,1 MB | 2,60 GB | 705,6 MB | **~3,69 GB** (+1,85 GB) |
| **5×** | 106.120 | 933,9 MB | 20,1 MB | 6,49 GB | 1,76 GB | **~9,20 GB** (+7,36 GB) |
| **10×** | 212.240 | 1,87 GB | 40,2 MB | 12,98 GB | 3,53 GB | **~18,42 GB** (+16,58 GB) |

### 6.2 ¿Cabe? — veredicto contra el disco medido

Margen real antes del gate del 90 %: `(30 + x) / 36,6 = 0,90 → x ≈ **2,94 GB**`.

| Escenario | Necesita | Margen antes del gate | Veredicto |
|---|---|---|---|
| **2×** | +1,85 GB (ambas formas) | 2,94 GB | **Cabe, con 1,09 GB de aire** — deja el disco al **~87 %**: a un solo deploy de distancia del FAIL. |
| **5×** | +7,36 GB | 2,94 GB | **NO cabe.** Faltan **~4,4 GB**; aun liberando las generaciones antiguas de `/var/www/lists` (1,09 GB) faltarían **~3,3 GB**. |
| **10×** | +16,58 GB | 2,94 GB (6,6 GB libres) | **NO cabe tal cual.** Liberando **todo** lo identificado en §6.4 (~13,4 GB) el margen sube a **~16,34 GB** → **falta por ~0,24 GB** y quedaría pegado al gate del 90 %. |

### 6.3 Los tres techos reales (no solo el disco)

| Techo | Medido | 2× | 5× | 10× |
|---|---|---|---|---|
| **Disco** | 6,6 GB libres / 2,94 GB de margen | al límite | **excede** | **excede** |
| **Tiempo de proyección** | `ape-list-light` corre cada 10 min · `ape-cablear-auto` cada 15 min; ambas **arrancan y terminan en el mismo segundo** (`ExecMainStart=Exit=07:10:37` y `07:15:27`, `Status=0`) **sin refrescar el fichero servido** (mtime 06:12/06:15 → **62–64 min de antigüedad** a las 07:19) | **síntoma ya presente a 1×** | peor | insostenible |
| **RAM / PHP** | 50 hijos × 9 MB ≈ 450 MB | igual | igual | igual (no escala con canales) |
| **Latencia de zapeo** | p50 376 ms | igual | igual | igual (por canal, no por catálogo) |
| **Coste de descarga del catálogo** | 4,0 MB / 1,25 s | 8,1 MB | 20,1 MB / ~6 s | **40,2 MB / ~12,5 s** al ritmo medido de 3,22 MB/s |

**Hallazgo H-1 (nuevo, medido hoy).** La proyección servida tenía **62–64 minutos** de antigüedad
mientras los timers de reconstrucción corren cada 10–15 min y **terminan con `Status=0` en el mismo
segundo en que empiezan**. El gate **no lo detecta**: su check [10] mide la frescura del **JSON del
vigilante** (< 180 s) y su check [11] valida **tags**, no edad del fichero.
**Causa raíz: NO COMPUTADA** (no se leyeron los scripts del cableador; sería trabajo aparte y no se
toca prod). **Efecto:** la lista puede quedarse rancia sin que ningún gate lo diga — y eso pesa más
en 4K que el disco.

### 6.4 Espacio recuperable (medido, no ejecutado)

| Origen | Tamaño | Riesgo de liberar |
|---|---|---|
| `/root` backups (`ape-backups`, `ape_backups_407_deep`, `ape_orchestration_backup`, `ape_list_backups`, …) | **5,49 GB** | bajo (backups históricos), **decisión del operador** |
| `/var/lib/containerd` + `/var/lib/docker` (contenedores de hace 4 meses) | **2,77 GB** | medio (es Docker; requiere autorización explícita) |
| `/var/www/lists` generaciones antiguas (`.gz` de listas viejas) | **1,09 GB** | bajo, pero **nunca** tocar la servida |
| `/var/lib/snapd` | **3,64 GB** | bajo/medio (snaps instalados) |
| `/var/log` | **469 MB** | bajo (rotación) |
| **Total identificado** | **~13,4 GB** | con autorización y ventana |

> **Regla:** la lista servida (`…_CABLEADA_LIGHT_CABLEADA.m3u8` + `.gz`) **NO se toca**. Liberar
> espacio es una operación aparte, con autorización, y no forma parte de este documento.

**Decisión que pide este apartado:** con el disco actual el catálogo **no puede duplicarse sin
liberar espacio primero**; 5× y 10× exigen **volumen nuevo**. Y antes de crecer hay que arreglar
H-1: crecer un catálogo que ya se queda rancia multiplica el problema.

---

## 7. Los límites honestos: lo que este VPS NO puede hacer

| Capacidad | ¿Puede? | Evidencia | Qué haría falta (sin inventar precios) |
|---|---|---|---|
| **Transcodificar 4K en tiempo real** | **NO** | 3 vCPU EPYC-Rome · JIT `concurrent_channels: 1` · salidas SDR 720/1080 · «realtime performance not certified» | Otro host con (a) GPU NVENC/QSV o (b) ≥ 8–16 vCPU dedicados. **Y una excepción escrita** a la ley anti-degradación, porque transcodificar para «estabilizar» es lo prohibido. La ruta correcta por doctrina **no es transcodificar**. |
| **Ring buffer de 512 MB** | **NO** | 512 MB = **13,4 %** de 3.819 MB totales y **16,2 %** de 3.170 disponibles, **por sesión**; añade latencia sobre p50 376 ms; autopista lo prohíbe | Un host dedicado a buffer con RAM dimensionada **por sesión** y una decisión doctrinal explícita (hoy: no). |
| **Docker / contenedores para el flujo** | **NO se propone** | 3 vCPU / 4 GB / **82 % de disco**; ya hay Docker **ocioso** consumiendo 2,77 GB y 69 MB RSS | Nada. **No instalar, no usar, no ampliar.** Si algún día se limpia: autorización + ventana. |
| **Proxy de vídeo con buffer y failover** | **Parcial: relay sí, buffer/failover no** | `/seg/` relayó **1,19 GB hoy** (139× 200); **no** hay buffer ni tabla de fuentes | N3 (§3.4) + capacidad de egress **medida** (§5.6). El relay sin failover es lo que hay. |
| **Servir 4K a N espectadores simultáneos** | **NO COMPUTADO** | egress no medido; `ethtool` reporta `speed=-1` (NIC virtual); `vnstat` ausente; `sar -f` no lee los históricos | Medir con §5.6 (100 MB × 3 desde host externo) y decidir con el número. Cota inferior hoy: **25,8 Mbps** a un cliente. |
| **Garantizar el 4K del canal** | **NO** | **61,8 %** de los manifiestos de hoy fueron **407 del proveedor** | El 4K depende del proveedor. Se arregla con **otra fuente** (N3) o con el proveedor, **no** con el VPS. |
| **Sostener 6K/8K** | **NO** | `legacy_6k: 6144x3456 opt-in, capacity not certified` | GPU + ventana; hoy es **declaración**, no capacidad. |
| **Ver el freeze real del device** | **NO** | sin root no se leen decoder/frame drops; `MediaSession` de OTT no publica fotogramas | Instrumentación en el device o el daemon APE. `INSTRUMENTACION_APE_CRYSTAL_FLOW.md:73-77,148`. |
| **TLS verificado contra el proveedor** | **NO, hoy** | `CURLOPT_SSL_VERIFYPEER => false` en `pulse.php:142,549` | Cambio en producción con plan de rollback: activar verificación y medir 407/errores de cert. **Riesgo abierto declarado.** |

### 7.1 Los tres riesgos que ordenan la lista

| ID | Riesgo | Magnitud | Mitigación posible hoy |
|---|---|---|---|
| **R-1** | El VPS está en el camino del vídeo (`/seg/`) **por necesidad**, y su egress no está medido | 1,19 GB hoy; capacidad desconocida | medir (§5.6) y **no** añadir carga (nada de sondeos de vídeo cada 60 s) |
| **R-2** | **61,8 %** de manifiestos = 407 del proveedor | 458 de 741 | N3 (otra fuente) + diagnóstico; **jamás** failover por 407 |
| **R-3** | La proyección se queda rancia sin que el gate lo vea | 62–64 min hoy | check de frescura en el gate (11 → 12) |

---

## 8. Checklist de verificación reproducible

Marcas: **[LOCAL]** = PC del operador, repo `2032ccbb` · **[VPS-RO]** = SSH de lectura como root
(no modifica) · **[PROD-HTTP-RO]** = GET público de lectura · **[NO EN PROD]** = carga o mutación:
requiere ventana y autorización.

> Todos los **[LOCAL]**, **[VPS-RO]** y **[PROD-HTTP-RO]** de esta sección **fueron ejecutados** para
> escribir este documento, salvo los marcados «no ejecutado». La columna «salida esperada» es la
> **salida real medida hoy**.

### A. Repo (local, sin red salvo el gate)

| # | Comando | Salida esperada (medida hoy) |
|---|---|---|
| A1 | `bash tools/quality/gate_ape_crystal_flow.sh --quiet` | `[gate] VERDICT=PASS pass=6 fail=0` · exit 0 · (5 SKIP fuera del VPS) |
| A2 | `node tools/check_anti_degradation_policy.js` | `TOTAL=8 PASS=8 FAIL=0` · exit 0 · 16 degradaciones en línea base del JIT |
| A3 | `python -c "import json;d=json.load(open('contracts/ape_crystal_flow_operativa.json'));print(len(d['estaciones']),'estaciones')"` | `5 estaciones` |
| A4 | `bash -c "grep -c '^# ── \[' tools/quality/gate_ape_crystal_flow.sh"` | `11` (checks del gate) |
| A5 | `git rev-parse --short HEAD; git rev-parse --abbrev-ref HEAD` | `2032ccbb` · `deploy/engine-restart-20261112` |

### B. VPS — lectura, sin root destructivo

| # | Comando | Salida esperada (medida hoy) |
|---|---|---|
| B1 | `ssh root@178.156.147.234 'nproc; free -m \| head -2; df -h /'` | `3` · `Mem: 3819 … 3170 available` · `/dev/sda1 38G 30G 6.6G 82% /` |
| B2 | `ssh … 'nginx -v; sysctl -n net.ipv4.tcp_congestion_control net.core.default_qdisc'` | `nginx/1.24.0 (Ubuntu)` · `bbr` · `fq` |
| B3 | `ssh … 'systemctl list-timers --all --no-pager \| grep -c ape-'` | `11` (10 active; `ape-quality-watch.timer` inactive) |
| B4 | `ssh … 'cat /var/lib/ape/module-watchdog.json'` | `verdict":"OK","fallos":0` + **7** módulos; `pulse-canal` puede venir `sin-muestra` con 407 |
| B5 | `ssh … 'stat -c "%s %y %n" /var/www/lists/*_LIGHT_CABLEADA.m3u8'` | `186789613` · fecha del fichero (hoy: **06:15 UTC**) |
| B6 | `ssh … 'awk "/^#EXTINF/{e++} /^#EXTSHIMOTT/{s++} END{print e,s}" /var/www/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT_CABLEADA.m3u8'` | `21224 21224` |
| B7 | `ssh … 'ls -la /var/www/lists/*.gz \| wc -l; du -cb /var/www/lists/*.gz \| tail -1'` | `9` · `1088243840 total` |
| B8 | `ssh … 'du -x -d1 / \| sort -rn \| head -12'` | `/var 16,1 G · /root 5,5 G · /usr 3,7 G · /home 1,7 G · /opt 0,9 G` |
| B9 | `ssh … 'grep -n "restart_if\|systemctl restart" /opt/ape-pulse/ape-module-watchdog.sh'` | `restart_if` en `:76`, `systemctl restart` en `:82`; llamadas para nginx `:95`, php-fpm `:105`, ape-jit `:116` |
| B10 | `ssh … 'grep -n "apcu_store\|usleep\|httpOut" /var/www/html/prisma/api/pulse.php \| head'` | TTL `8` (`:667`), stale `60` (`:668`), lock 3 s (`:594`), `usleep(150000)` (`:598`), `$httpOut` (`:719`) |
| B11 | `ssh … 'curl -s -m 8 http://127.0.0.1:3099/capabilities.json'` (vía `ssh … 'curl …'`) | `"limits":{"concurrent_channels":1,"idle_stop_s":90}` · `"rea_executed":false` |
| B12 | `ssh … 'systemctl show -p ActiveState -p Result ape-list-light.service ape-cablear-auto.service'` | `inactive` / `success`; y `ExecMainStart=Exit` en el **mismo segundo** (síntoma H-1) |

### C. Producción por HTTP — sólo lectura

| # | Comando | Salida esperada (medida hoy) |
|---|---|---|
| C1 | `curl -sI -H 'Accept-Encoding: gzip' https://iptv-ape.duckdns.org/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT_CABLEADA.m3u8` | `HTTP/2 200` · `content-length: 4023581` · `content-encoding: gzip` · `cache-control: no-store` |
| C2 | `curl -s -o /dev/null -w '%{http_code} %{size_download} %{time_starttransfer}\n' -r 0-4194303 https://iptv-ape.duckdns.org/jit/playlist-calidad.m3u8` | `206 4194304 0,58` (varía con la red) |
| C3 | `curl -s -r 0-1048575 https://iptv-ape.duckdns.org/lists/APE_LISTA_1794100720046_CABLEADA.m3u8 \| grep -m1 -o '#EXT-X-APE-CHANNELS:[0-9]*'` | `#EXT-X-APE-CHANNELS:21224` |
| C4 | `curl -s https://iptv-ape.duckdns.org/health` | `200` — verificado por el **check [1] del gate** (PASS en 2 corridas hoy); no ejecutado como comando suelto |
| C5 | `curl -s 'https://iptv-ape.duckdns.org/prisma/api/ape-last-channel.php'` | `200` con `"ok"` — verificado por el **check [6] del gate** (PASS en 2 corridas hoy); no ejecutado como comando suelto |

### D. **NO EN PROD** sin ventana autorizada — y por qué

| # | Comando | Por qué no se ejecuta aquí |
|---|---|---|
| D1 | `curl -s '<manifest del canal>'` para leer `#EXTINF` | **abre la conexión del proveedor**: con ~1 conexión por cuenta, se la roba al player (`CANARY_STACK_FORENSICS_20261114.md:310`) |
| D2 | `ffprobe` sobre un segmento del canal | descarga vídeo y **gasta conexión + egress**; no hay ventana |
| D3 | `ffmpeg -benchmark -i <muestra> -c:v libx265 -f null -` | satura las **3 vCPU** de producción; mediría el transcode 4K. Criterio: `speed=` debe superar **1,0×**; con 3 vCPU y 4K se espera muy por debajo, pero **no se afirma sin medirlo** |
| D4 | `iperf3`, instalar `vnstat`, `docker system prune` | **instalación / mutación**. Prohibido por el encargo y por `iptv-vps-touch-nothing` |
| D5 | `systemctl restart nginx` o cualquier `reload` | toca producción; sólo con incidente medido + autorización + rollback |

**Regla del checklist:** si un check **no** se ejecutó, se declara y no se cuenta como PASS. Los
**[VPS-RO]** son de lectura y no modifican estado; los **[NO EN PROD]** existen para que el operador
sepa qué preguntar, no para correrlos «por si acaso».

---

## 9. Lo que NO se midió (y por qué) — sin convertirlo en cero

| Ítem | Estado | Razón / comando que lo mediría |
|---|---|---|
| Capacidad real de egress del VPS | **NO COMPUTADO** | `ethtool` da `speed=-1` (NIC virtual); `vnstat` ausente; `sar -f` no lee los históricos. Medir con §5.6 (100 MB desde host externo). |
| Serie histórica de ancho de banda | **NO COMPUTADO** | existen `/var/log/sysstat/sar07…sar14`, pero `sar -n DEV -f …` devuelve **0 líneas** con el `sar` instalado |
| Transcode 4K real (fps alcanzable) | **NO COMPUTADO** | exigiría correr ffmpeg en producción (§8-D3) |
| Duración exacta del segmento del canal en reproducción | **NO COMPUTADO** | exige abrir conexión al proveedor (§8-D1) |
| Buffer del player, frame drops, decoder | **NO COMPUTADO** | no observable sin root en el device |
| Causa raíz de la proyección rancia (H-1) | **NO COMPUTADA** | no se leyeron los scripts del cableador; no se tocó prod |
| Conexiones concurrentes que permite el proveedor | **NO COMPUTADO** | depende de la cuenta; sólo el proveedor lo sabe |
| Ventana exacta del log | **PARCIAL** | `playlist_access.log` es diario (rotación); la ventana de hoy es `00:00:01 → 07:14:50 UTC` (**19.418 líneas**) |
| Precios / coste de un VPS mayor, GPU o CDN | **NO COMPUTADO** | fuera de alcance; **no se inventan cifras** |

---

## 10. Vigencia, mantenimiento y rollback

- **Naturaleza:** documento. **No despliega, no reinicia, no edita** nada del VPS. Rollback = borrar
  este fichero (`git checkout -- docs/architecture/PIPELINE_ESTABILIDAD_4K.md` o `rm`).
- **Vigencia de los datos:** ventana **2026-11-15 07:00–07:20 UTC**. Tres hechos de este documento
  **caducan rápido** y hay que re-medirlos antes de decidir con ellos:
  1. el reparto de códigos de `/pulse/` (hoy 61,8 % de 407) — cambia con el proveedor;
  2. el estado de Docker (hoy `active`, 9 contenedores `Exited`) — puede apagarse;
  3. la antigüedad de la proyección (hoy 62–64 min) — síntoma, no estado estable.
- **Qué invalida este documento:** (a) que el VPS cambie de rol (deje de relayar `/seg/`), (b) que
  se construya N3, (c) que cambie el tamaño del host o del disco, (d) que se despliegue una
  proyección con otra forma (más o menos líneas por canal).
- **Lo que este documento NO decide** (y no debe decidir un agente): construir N3, limpiar Docker,
  liberar `/root`, contratar otro host, instalar nada. **Eso es del operador.**

---

*Medido por lectura, sin una sola mutación en producción, el 2026-11-15 entre 07:00 y 07:20 UTC.
Fuentes primarias: `/var/www/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT_CABLEADA.m3u8`,
`/var/lib/ape/module-watchdog.json`, `/var/log/nginx/playlist_access.log`,
`/var/www/html/prisma/api/pulse.php`, `/etc/nginx/snippets/url2-cartridge.conf`,
`/opt/ape-pulse/ape-module-watchdog.sh`, `tools/quality/gate_ape_crystal_flow.sh`.*

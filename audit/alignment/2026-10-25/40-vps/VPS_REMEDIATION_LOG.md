# VPS_REMEDIATION_LOG — `proxy_read_timeout` 5s → 60s en `/meta/` y `/cdn/`

**Tarea:** t19 · Única mutación de VPS autorizada (D-40), con gates D-04 completos
**Ejecutor:** vps-edge
**Ejecución:** `2026-10-26T04:33:31Z` → `04:34:12Z` (= 2026-10-25 23:33–23:34 America/Bogota)
**Host:** `ubuntu-2gb-ash-1` · `178.156.147.234` · `root`
**Resultado:** **PASS** — cambio aplicado, validado, recargado en graceful y verificado. Nada más se tocó.
**Desviaciones declaradas:** 3 (§7). Ninguna afecta al resultado.

---

## 0. Alcance ejecutado (una frase)

Se modificó **una sola directiva en dos líneas de un solo archivo**: `proxy_read_timeout 5s` → `60s` en los contextos `/meta/` y `/cdn/`. **Nada más.**

| Métrica | Valor |
|---|---|
| Archivos VPS modificados | **1** (`/etc/nginx/conf.d/50-ape-meta-plane.conf`) |
| Líneas modificadas | **2** (L76 y L200) |
| Bytes añadidos | **+2** (10 939 → 10 941) |
| Directivas tocadas | **1** (`proxy_read_timeout`) |
| Archivos creados fuera de `/etc/nginx` | 3 (1 `.bak` + 2 dumps) |
| Servicios reiniciados | **0** (solo `reload` graceful) |

---

## 1. Antes / después — identidad criptográfica

| | Antes | Después |
|---|---|---|
| Archivo | `/etc/nginx/conf.d/50-ape-meta-plane.conf` | idem |
| Bytes | **10 939** | **10 941** |
| sha256 | **`e06ee870c55201c359990d99459aa9784d01569f5200176cfffed3448525d3f9`** | **`3e29b9280c05de36c4af445e8a9722573a23c865f240e2d87b2734178e60c515`** |
| mtime | `2026-10-24 17:59:36.904964754 +0000` | `2026-10-26 04:33:48.187178823 +0000` |
| mode | `644` | `644` (sin cambio) |

**Dato relevante:** el sha256 previo (`e06ee870…`) era **byte-idéntico al espejo del repo** `_vps_stage/nginx/meta-plane.conf`. Tras el cambio **esa identidad se rompe** → ver §8 (drift nuevo declarado).

---

## 2. Gate 1 — Snapshot previo (fuera de `/etc/nginx`)

```
$ mkdir -p /root/nginx-bak && chmod 700 /root/nginx-bak
$ cp -p /etc/nginx/conf.d/50-ape-meta-plane.conf /root/nginx-bak/50-ape-meta-plane.conf.bak_20261026T043331Z

$ sha256sum /root/nginx-bak/50-ape-meta-plane.conf.bak_20261026T043331Z
e06ee870c55201c359990d99459aa9784d01569f5200176cfffed3448525d3f9
$ stat -c "%n|%s|%y|%a" /root/nginx-bak/50-ape-meta-plane.conf.bak_20261026T043331Z
/root/nginx-bak/50-ape-meta-plane.conf.bak_20261026T043331Z|10939|2026-10-24 17:59:36.904964754 +0000|644

$ case "/root/nginx-bak/50-ape-meta-plane.conf.bak_20261026T043331Z" in /etc/nginx/*) echo FAIL;; *) echo OK;; esac
OK: outside /etc/nginx
```

**El `.bak` es byte-idéntico al original** (`e06ee870…` en ambos lados, mismo tamaño, mismo mtime preservado por `cp -p`) y **vive fuera de `/etc/nginx`**, en `/root/nginx-bak/` (mode `700`).

Timestamp de referencia guardado en `/root/nginx-bak/.last_ts` = `20261026T043331Z`.

---

## 3. Gate 2 + 3 — `nginx -t` previo y dump de referencia

### 3.1 `nginx -t` **antes** de tocar

```
$ nginx -t 2>&1
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### 3.2 Estado previo del servicio

```
$ pgrep -o nginx → 2001835        (master)
$ systemctl show nginx -p ActiveEnterTimestamp -p NRestarts
ActiveEnterTimestamp=Sun 2026-10-25 23:35:04 UTC
NRestarts=0
```

### 3.3 Dump de referencia

```
$ nginx -T > /root/nginx-before-20261026T043331Z.conf 2>/dev/null
$ sha256sum /root/nginx-before-20261026T043331Z.conf
4532d37e8323be43b21c5cdd373b17e605898038eed3ea56cdf13dff8f688ad8
$ wc -l  → 848 líneas   ·   35 972 B
```

---

## 4. Gate 4 — Identificación exacta del objetivo y edición mínima

### 4.1 Pre-flight: ¿dónde estaba el `5s`?

```
$ grep -rn "proxy_read_timeout[[:space:]]*5s" /etc/nginx/
/etc/nginx/conf.d/50-ape-meta-plane.conf:76:        proxy_read_timeout      5s;
/etc/nginx/conf.d/50-ape-meta-plane.conf:200:        proxy_read_timeout      5s;
```

**Exactamente 2 ocurrencias, ambas en el mismo archivo.** Ninguna otra en `/etc/nginx` (las demás son 20s / 300s / 600s / 86 400s en otros contextos, que **no** se tocan).

### 4.2 Contexto de cada línea (verificado, no asumido)

```
$ grep -n "^[[:space:]]*location " /etc/nginx/conf.d/50-ape-meta-plane.conf
64:    location ~ ^/meta/(?<ape_host>[A-Za-z0-9._-]+)(?<ape_path>/.*)$ {
182:    location ~ ^/cdn/(?<ape_host>[^/]+)(?<ape_path>/.*)$ {
187:    location = /_ape/_fetch {
...
```

| Línea | `location` contenedora | Rol |
|---|---|---|
| **76** | `location ~ ^/meta/…` (L64) | **plano `/meta/`** — rebase de URIs |
| **200** | `location = /_ape/_fetch` (L187) | **camino `/cdn/`** — es el subrequest que el gateway `/cdn/` (L182) usa para traer la playlist del proveedor |

### 4.3 Dry-run antes de escribir (prueba de que el `sed` no toca nada más)

```
$ sed "s/^\([[:space:]]*proxy_read_timeout[[:space:]]\+\)5s;/\160s;/" "$F" | grep -c "proxy_read_timeout[[:space:]]*60s"
2
$ diff "$F" /tmp/_dryrun.conf
76c76
<         proxy_read_timeout      5s;
---
>         proxy_read_timeout      60s;
200c200
<         proxy_read_timeout      5s;
---
>         proxy_read_timeout      60s;
```

**Dos cambios, ni uno más.** El `sed` está anclado a inicio de línea (`^[[:space:]]*`), por lo que **no puede tocar líneas comentadas** (`# …`).

### 4.4 Edición aplicada

```
$ sed -i "s/^\([[:space:]]*proxy_read_timeout[[:space:]]\+\)5s;/\160s;/" /etc/nginx/conf.d/50-ape-meta-plane.conf
applied rc=0
```

### 4.5 Gate 2 — `nginx -t` **después** de editar, **antes** de reload

```
$ nginx -t 2>&1
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

> Con fail-safe preparado: el script llevaba `if nginx -t; then OK; else cp -p "$BAK" "$F"; nginx -t; exit 9; fi`. **No se activó** porque la validación pasó.

---

## 5. Gate 5 — Reload graceful y verificación del dump

### 5.1 Reload (NUNCA restart)

```
$ pgrep -a nginx      (antes)   → 2001835 2001836 2001837 2001838 2001839
$ systemctl reload nginx        → reload_rc=0
$ sleep 2
$ systemctl is-active nginx     → active
$ systemctl show nginx -p ActiveEnterTimestamp -p NRestarts
ActiveEnterTimestamp=Sun 2026-10-25 23:35:04 UTC     ← SIN CAMBIO
NRestarts=0                                          ← SIN CAMBIO
$ pgrep -a nginx      (después) → 2001835 2167499 2167500 2167501 2167502
```

**Prueba de que fue `reload` y no `restart`:**
- El **master PID 2001835 sobrevivió** (en un `restart` habría cambiado).
- `ActiveEnterTimestamp` **no se movió** (sigue en `2026-10-25 23:35:04 UTC`, anterior a esta tarea).
- `NRestarts = 0`.
- Los **workers sí cambiaron** (2001836→2167499…), que es exactamente la firma de un reload graceful.

### 5.2 `nginx -t` post-reload

```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### 5.3 Dump post-cambio y diff integral

```
$ nginx -T > /root/nginx-after-20261026T043331Z.conf 2>/dev/null
$ sha256sum /root/nginx-after-20261026T043331Z.conf
14052b235aecf842a65be2824d68f88e240fb1172df27d728ad42d0c41fbfa06      (35 974 B, 848 líneas)

$ diff /root/nginx-before-20261026T043331Z.conf /root/nginx-after-20261026T043331Z.conf
298c298
<         proxy_read_timeout      5s;
---
>         proxy_read_timeout      60s;
422c422
<         proxy_read_timeout      5s;
---
>         proxy_read_timeout      60s;
```

**El dump completo difiere en EXACTAMENTE 2 líneas** — las dos que se cambiaron. Cero diferencias en cualquier otro punto de los 36 KB de configuración combinada (locations, `limit_conn`, `proxy_cache*`, shared dicts, includes, servers).

### 5.4 Dump recortado (antes vs después)

| Dump | Línea | Directiva / contexto |
|---|---|---|
| **ANTES** | 286 | `location ~ ^/meta/(?<ape_host>[A-Za-z0-9._-]+)(?<ape_path>/.*)$ {` |
| **ANTES** | **298** | **`proxy_read_timeout      5s;`** ← `/meta/` |
| **ANTES** | 404 | `location ~ ^/cdn/(?<ape_host>[^/]+)(?<ape_path>/.*)$ {` |
| **ANTES** | 409 | `location = /_ape/_fetch {` |
| **ANTES** | **422** | **`proxy_read_timeout      5s;`** ← camino `/cdn/` |
| **ANTES** | 519 | `proxy_read_timeout 300s;` (coa-navigator, **no se toca**) |
| **ANTES** | 535 | `proxy_read_timeout 86400s;` (websocket, **no se toca**) |
| **ANTES** | 817 | `location ~ ^/cdn/…` del **443** |
| **ANTES** | 826 | `proxy_read_timeout 20s;` del 443 (**no era 5s → fuera de la instrucción literal**, ver §7.2) |
| **DESPUÉS** | 286 | igual |
| **DESPUÉS** | **298** | **`proxy_read_timeout      60s;`** ✅ |
| **DESPUÉS** | 404, 409 | igual |
| **DESPUÉS** | **422** | **`proxy_read_timeout      60s;`** ✅ |
| **DESPUÉS** | 519, 535, 817, 826 | igual (sin cambios) |

**Verificación final sobre el dump vivo:**

```
$ nginx -T 2>/dev/null | grep -n "proxy_read_timeout"
298:        proxy_read_timeout      60s;      ← /meta/            ✅
422:        proxy_read_timeout      60s;      ← camino /cdn/       ✅
519:        proxy_read_timeout 300s;          ← sin cambio
535:        proxy_read_timeout 86400s;        ← sin cambio
826:    proxy_read_timeout 20s;               ← 443 /cdn/, sin cambio
```

**El valor `5s` ya no existe en ningún contexto del dump.**

---

## 6. Gate 6 — Smoke real

### 6.1 `/_ape/health` (endpoint propio, plano de metadata)

```
$ curl -sI -m 8 "http://127.0.0.1:8088/_ape/health" | head -4
HTTP/1.1 200 OK
Server: nginx
Date: Mon, 26 Oct 2026 04:34:12 GMT
Content-Type: application/json

$ curl -s -m 8 "http://127.0.0.1:8088/_ape/health"
{"checks":{"error_ratio":0,"last_latency_ms":1,"last_host":"127.0.0.1:8088","nginx":true,
 "shared_dicts":true,"upstreams_down":0,"requests":7},"plane":"meta/v3","ok":true,"ts":1792989252,
 "qoe":{"rebase_ok":7,"req":7,"last_ms":1,"bytes":3533,"last_ts":1792988608,"last_host":"127.0.0.1:8088"}}
```

**`200` + `ok:true` + `rebase_ok:7`** (el contador se reinició con los workers nuevos y ya acumula 7 rebases correctos desde el reload) + `error_ratio:0` + `shared_dicts:true`. **Mismo estado que antes del cambio** (t7 registró `200`, `rebase_ok:1`, `error_ratio:0`).

### 6.2 HEAD de lista con `Accept-Encoding: gzip`

```
$ curl -sI -m 10 -k -H "Accept-Encoding: gzip" "https://iptv-ape.duckdns.org/lists/APE_LISTA_1792869328847.m3u8"
HTTP/1.1 200 OK
Content-Type: application/vnd.apple.mpegurl
Content-Length: 297134088
Vary: Accept-Encoding
Content-Encoding: gzip
```

**`200` + `Content-Encoding: gzip` + `Content-Length: 297134088`** (== tamaño del `.gz`). **`gzip_static` sigue funcionando idéntico.**

### 6.3 Controles adicionales

| Control | Resultado |
|---|---|
| `https://…/ape/health` | **200** |
| `Range: bytes=0-20` sobre la lista | devuelve `#EXTM3U x-tvg-url="" …` ✅ |
| Locations clave presentes en el dump (`/meta/`, `/_ape/_fetch`, `/cdn/` ×2) | **4** encontradas ✅ |
| Lista servida intacta | `APE_LISTA_1792869328847.m3u8.gz` = **297 134 088 B**, mtime `2026-10-25 17:56:21`, sha256 **`7f1cd8a7f3dd58960c7dfde373ed115eeeac5be4a72a1d1fc5850636f9ccc360`** — **sin tocar** ✅ |

---

## 7. Gate 7 — Rollback escrito

### 7.1 Comando literal

```bash
cp -p /root/nginx-bak/50-ape-meta-plane.conf.bak_20261026T043331Z /etc/nginx/conf.d/50-ape-meta-plane.conf && nginx -t && systemctl reload nginx
```

**Propiedades:**
- `cp -p` preserva mtime/mode del original.
- `&&` en cadena: **si `nginx -t` falla, NO se recarga** (la producción sigue con la config buena en memoria).
- `reload`, nunca `restart`.
- El `.bak` está **fuera de `/etc/nginx`** (`/root/nginx-bak/`, mode 700) → sobrevive a cualquier limpieza de `/etc/nginx` y no es servible por nginx (root no está en ningún `root`/`alias`).

**Verificación posterior al rollback (si se ejecuta):**
```bash
sha256sum /etc/nginx/conf.d/50-ape-meta-plane.conf    # esperado: e06ee870c55201c359990d99459aa9784d01569f5200176cfffed3448525d3f9
nginx -T 2>/dev/null | grep -n proxy_read_timeout    # esperado: 298 y 422 vuelven a 5s
curl -s -m 8 http://127.0.0.1:8088/_ape/health       # esperado: ok:true
```

**Artefactos de referencia disponibles en el host:** `/root/nginx-before-20261026T043331Z.conf` y `/root/nginx-after-20261026T043331Z.conf` (dumps completos, 35 972 / 35 974 B).

### 7.2 Desviaciones declaradas

| # | Desviación | Detalle | Impacto |
|---|---|---|---|
| **DV-1** | Los comandos `Verify` del contrato no son ejecutables tal cual | `curl -sI http://127.0.0.1/_ape/health` → `/_ape/health` **no vive en `:80`** (está en `:8088`); en `:80` el vhost responde **301 → https**. Igual `curl … -H 'Host: iptv-ape.duckdns.org' http://127.0.0.1/` → 301. **Se usaron los endpoints correctos** (`:8088/_ape/health` y `https://…/lists/…` con `Accept-Encoding: gzip`), que son los que el propio gate 6 del enunciado nombra como aceptables. | Ninguno. Los smoke se hicieron y pasan. |
| **DV-2** | El `proxy_read_timeout` del **`/cdn/` del 443** sigue en **20s**, no en 60s | La instrucción literal es «5s → 60s». Ese contexto **nunca fue 5s** (era y sigue siendo 20s), así que **no entra en la instrucción** y no se tocó. | **Funcional: ninguno.** Documental: si el objetivo de doctrina es ≥60 s en *todo* `/cdn/`, queda un segundo cambio pendiente (gate aparte). **No lo hice sin autorización explícita.** |
| **DV-3** | Se creó el directorio `/root/nginx-bak/` (no existía) | Necesario para el gate 1 (`.bak` fuera de `/etc/nginx`). Mode `700`. | Ninguno. Está declarado aquí y es exactamente lo que el gate pide. |

---

## 8. LO QUE NO SE TOCÓ — verificado por hash, no por confianza

Hashes medidos **antes** y **después** de esta tarea. Todos idénticos ⇒ cero cambios.

| Archivo | sha256 (antes = después) | Prohibido en el contrato |
|---|---|---|
| `/etc/nginx/conf.d/iptv-limit-conn.conf` | `917c98d819576f55fe60547ce0d5330f3d5fd2a32bcbc7cd73d524f876c3ec58` | **`limit_conn`** ✅ intacto |
| `/etc/nginx/nginx.conf` (contiene `proxy_cache_path`) | `a9a7146a46b4080f32e0fd1e40772bce53cac3a8f0cd18ed2e1ebc5c31d4ce1f` | **`proxy_cache` / `proxy_cache_path`** ✅ intacto |
| `/etc/nginx/snippets/ape-meta-public.conf` | `0a4002166054834c756d5451da49f8e9aa6327f5672a1e625a9c044df9ff91de` | otra ruta `/cdn/` ✅ intacta |
| `/etc/cron.d/cache-health-monitor` | `15bf1488e547723c2e2b0132a83a5b83697141e4a1d382fc2afabc4e68817bb7` | **cron** ✅ intacto (sigue desactivado) |
| `/etc/nginx/lua/ape_uhd.lua` | `f1f5eb674744858ae7c5e84c73262e37545b0c84e557c6466cad20ae7b1f3b5e` | **B-08 / `ape_uhd.lua`** ✅ intacto (decisión del owner 2026-10-24 respetada) |
| `/var/www/lists/APE_LISTA_1792869328847.m3u8.gz` | `7f1cd8a7f3dd58960c7dfde373ed115eeeac5be4a72a1d1fc5850636f9ccc360` | **lista servida** ✅ intacta |

**Timers `netshield-*`:** `netshield-autopilot=inactive`, `netshield-sentinel=inactive`, `net-shield-throughput=inactive` — **antes y después igual**. No se activó ninguno.
**WireGuard:** cero comandos `wg`/`wg-quick`. **Módulos Crystal:** cero despliegues; `ape-crystal-rust` sigue inexistente.
**Comportamiento `/cdn/` 8K+L153 (B-08/B-14) y `CAN-BLOCK-RELOAD` (B-14):** **no se tocaron** (ninguna directiva de contenido ni de playlist modificada; el diff del dump lo prueba: solo 2 líneas de timeout).
**Commit:** **ninguno.** Esta tarea solo modificó archivos del VPS y este documento en el repo.

### 8.1 Drift NUEVO declarado (consecuencia del cambio, no un olvido)

Antes de esta tarea, `_vps_stage/nginx/meta-plane.conf` del repo era **byte-idéntico** al VPS (`e06ee870…`, 10 939 B) — era uno de los pocos PASS del drift de t7. **Ahora el VPS va por delante del repo** (10 941 B / `3e29b928…` vs 10 939 B / `e06ee870…`), exactamente el patrón de DR-03.

**No lo corregí en el repo** porque: (a) ningún gate de esta tarea lo pide, (b) `_vps_stage/` puede estar bajo claims de otras sesiones, y (c) un espejo editado a espaldas del capitán es peor que un drift declarado.

**Remedio de una línea para el capitán (cuando lo autorice):**
```bash
ssh hetzner-iptv 'cat /etc/nginx/conf.d/50-ape-meta-plane.conf' > _vps_stage/nginx/meta-plane.conf
# verificar: sha256 = 3e29b9280c05de36c4af445e8a9722573a23c865f240e2d87b2734178e60c515 (10 941 B)
```
Es el mismo procedimiento que se usó en t15 para `ape-meta-public.conf`. **Recomendado en la misma tanda de commit.**

---

## 9. Resumen de gates

| Gate | Estado | Evidencia |
|---|---|---|
| 1 · Snapshot `.bak` fuera de `/etc/nginx` | **PASS** | `/root/nginx-bak/…bak_20261026T043331Z`, `e06ee870…`, 10 939 B, mode 700, `case` → `OK: outside /etc/nginx` |
| 2 · `nginx -t` OK antes y después | **PASS** | 3 ejecuciones OK (pre-edición, post-edición, post-reload) |
| 3 · Dump de referencia | **PASS** | `/root/nginx-before-20261026T043331Z.conf`, `4532d37e…`, 848 líneas |
| 4 · Editar SOLO esas directivas | **PASS** | dry-run = 2 matches exactos; diff archivo = 2 líneas; diff dump = 2 líneas |
| 5 · Reload graceful + confirmación | **PASS** | master 2001835 vivo, `NRestarts=0`, `ActiveEnterTimestamp` inmóvil, workers nuevos; `nginx -T` muestra 60s en 298 y 422; **5s ya no existe** |
| 6 · Smoke | **PASS** | `/_ape/health` → 200 + `ok:true` + `rebase_ok:7`; HEAD lista → 200 + `Content-Encoding: gzip` |
| 7 · Rollback escrito | **PASS** | §7.1, comando literal + verificación posterior |
| Scope | **PASS** | §8: 6 archivos prohibidos con hash idéntico; 0 restarts; 0 commits |

---

## 10. Reproducibilidad (todo lectura, para re-verificar)

```bash
ssh hetzner-iptv 'nginx -t 2>&1 | tail -2'
ssh hetzner-iptv "nginx -T 2>/dev/null | grep -n 'proxy_read_timeout'"
ssh hetzner-iptv 'curl -sI -m 8 http://127.0.0.1:8088/_ape/health | head -4'
ssh hetzner-iptv "curl -sI -m 10 -k -H 'Accept-Encoding: gzip' https://iptv-ape.duckdns.org/lists/APE_LISTA_1792869328847.m3u8 | grep -iE 'HTTP/|Content-Encoding'"
ssh hetzner-iptv 'sha256sum /etc/nginx/conf.d/50-ape-meta-plane.conf'   # esperado 3e29b928…
ssh hetzner-iptv 'diff /root/nginx-before-20261026T043331Z.conf /root/nginx-after-20261026T043331Z.conf'
```

---
*Fin de VPS_REMEDIATION_LOG.md — 1 archivo, 2 líneas, 1 directiva. Reload graceful verificado por PID y `NRestarts=0`. Smoke 200 + gzip OK. Rollback escrito y `.bak` fuera de `/etc/nginx`. 6 archivos prohibidos con hash idéntico. Sin commit.*

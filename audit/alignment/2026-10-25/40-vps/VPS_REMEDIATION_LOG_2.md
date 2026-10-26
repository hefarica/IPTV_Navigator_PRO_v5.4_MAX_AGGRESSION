# VPS_REMEDIATION_LOG_2 — Cierre de DV-2 (443 `/cdn/` 20s→60s) + espejos del repo

**Tarea:** t22 · Cerrar DV-2 y el drift de espejos, con gates D-04
**Ejecutor:** vps-edge
**Ejecución:** `2026-10-26T04:37:03Z` → `04:38:00Z` (= 2026-10-25 23:37–23:38 America/Bogota)
**Host:** `ubuntu-2gb-ash-1` · `178.156.147.234`
**Resultado:** **PASS** — DV-2 cerrado, los dos espejos del repo alineados con producción, cero daño colateral funcional.
**Desviaciones y efectos declarados:** 3 (§7). Uno de ellos **requiere tu atención** (§7.1).

---

## 0. Resumen de las tres partes

| Parte | Qué | Antes | Después |
|---|---|---|---|
| **A** | `_vps_stage/nginx/meta-plane.conf` (espejo repo) | 10 939 B · `e06ee870…` | **10 941 B · `3e29b928…`** = VPS ✅ |
| **B** | `/etc/nginx/snippets/ape-meta-public.conf` (VPS, 1 línea) | 2 509 B · `0a400216…` · `20s` | **2 509 B · `a39e8de9…`** · **`60s`** ✅ |
| **C** | `_vps_stage/public/ape-meta-public.conf` (espejo repo) | 2 509 B · `0a400216…` | **2 509 B · `a39e8de9…`** = VPS ✅ |

**Estado final del eje repo↔VPS: los dos espejos son byte-idénticos a producción.** Cero drift.

---

## PARTE A — Espejo `meta-plane.conf` (sin tocar el VPS)

Se obtuvo el contenido vivo por `base64 -w0` (**lectura**), se decodificó a bytes y se escribió con `WriteAllBytes` (sin conversión de texto: sin BOM, sin CRLF).

### A.1 Identidad

| | Antes | Después |
|---|---|---|
| Ruta repo | `_vps_stage/nginx/meta-plane.conf` | idem |
| Bytes | 10 939 | **10 941** |
| sha256 | `e06ee870c55201c359990d99459aa9784d01569f5200176cfffed3448525d3f9` | **`3e29b9280c05de36c4af445e8a9722573a23c865f240e2d87b2734178e60c515`** |

**Verificación contra el VPS en la misma ejecución:**
```
VPS  /etc/nginx/conf.d/50-ape-meta-plane.conf → 3e29b9280c05de36c4af445e8a9722573a23c865f240e2d87b2734178e60c515  (10 941 B)
repo _vps_stage/nginx/meta-plane.conf         → 3e29b9280c05de36c4af445e8a9722573a23c865f240e2d87b2734178e60c515  (10 941 B)
```
**Byte-idéntico.** Controles de codificación sobre lo escrito: BOM **NO**, CRLF **0**, LF **232**.

### A.2 Diff en el repo (exactamente las 2 líneas de timeout)

```
$ git diff --numstat -- _vps_stage/nginx/meta-plane.conf
2	2	_vps_stage/nginx/meta-plane.conf
```

```diff
diff --git a/_vps_stage/nginx/meta-plane.conf b/_vps_stage/nginx/meta-plane.conf
index 530eae9..972bf40 100644
--- a/_vps_stage/nginx/meta-plane.conf
+++ b/_vps_stage/nginx/meta-plane.conf
@@ -73,7 +73,7 @@ server {
 
         proxy_buffering         on;
         proxy_connect_timeout   3s;
-        proxy_read_timeout      5s;
+        proxy_read_timeout      60s;
         proxy_send_timeout      5s;
         proxy_next_upstream     error timeout;
         proxy_cache             off;
@@ -197,7 +197,7 @@ server {
         proxy_set_header        User-Agent "Mozilla/5.0";
         proxy_pass_request_headers off;
         proxy_connect_timeout   3s;
-        proxy_read_timeout      5s;
+        proxy_read_timeout      60s;
         proxy_buffering         on;
     }
 
```

**`2 insertions / 2 deletions`** — sólo las dos líneas de `proxy_read_timeout` que cambió t19. `proxy_send_timeout 5s` aparece como **contexto** (sin cambios), lo que prueba que no se tocó.
El drift que dejó t19 (repo por detrás, patrón DR-03) **queda cerrado**.

---

## PARTE B — VPS: `/cdn/` del 443, `proxy_read_timeout 20s → 60s`

Archivo: `/etc/nginx/snippets/ape-meta-public.conf` → `location ~ ^/cdn/…` (dump L826). **Una sola línea.**

### B.1 Identidad antes/después

| | Antes | Después |
|---|---|---|
| Bytes | **2 509** | **2 509** (mismo tamaño: `20s`→`60s` igual nº de caracteres) |
| sha256 | `0a4002166054834c756d5451da49f8e9aa6327f5672a1e625a9c044df9ff91de` | **`a39e8de902cf5449553822eb1682d1a9d481390c1ce136a218d91fbe1ee4ac39`** |
| mtime | `2026-10-25 18:07:04.138271850 +0000` | `2026-10-26 04:37:14.406976410 +0000` |
| mode | 644 | 644 (sin cambio) |

> **Nota de auditoría:** el tamaño **no cambia** porque `20s` y `60s` ocupan 3 bytes cada uno. Un auditor que sólo mire el tamaño concluiría «no cambió nada». **Por eso el sha256 es el testigo válido aquí**, no el `stat`.

### B.2 Gates D-04 — los 7

**Gate 1 · Snapshot fuera de `/etc/nginx`**
```
$ cp -p /etc/nginx/snippets/ape-meta-public.conf /root/nginx-bak/ape-meta-public.conf.bak_20261026T043703Z
$ sha256sum /etc/nginx/snippets/ape-meta-public.conf /root/nginx-bak/ape-meta-public.conf.bak_20261026T043703Z
0a4002166054834c756d5451da49f8e9aa6327f5672a1e625a9c044df9ff91de  /etc/nginx/snippets/ape-meta-public.conf
0a4002166054834c756d5451da49f8e9aa6327f5672a1e625a9c044df9ff91de  /root/nginx-bak/ape-meta-public.conf.bak_20261026T043703Z
$ stat -c "%s|%y|%a" → 2509 | 2026-10-25 18:07:04 | 644
$ case … in /etc/nginx/*) FAIL;; *) echo OK;; esac → OK: outside /etc/nginx
```
`.bak` byte-idéntico (`cp -p` preserva mtime/mode) y **fuera de `/etc/nginx`** (`/root/nginx-bak/`, mode 700).

**Gate 2 · `nginx -t` antes**
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

**Gate 3 · Dump de referencia**
```
$ nginx -T > /root/nginx-before2-20261026T043703Z.conf 2>/dev/null
14052b235aecf842a65be2824d68f88e240fb1172df27d728ad42d0c41fbfa06   848 líneas
```
(sha idéntico al dump «after» de t19 ⇒ la config no había cambiado entre t19 y esta tarea: coherencia.)

**Gate 4 · Dry-run antes de escribir** (prueba de que sólo hay 1 match)
```
$ grep -c 'proxy_read_timeout[[:space:]]*20s' $F      → 1
$ (dry-run) grep -c 'proxy_read_timeout[[:space:]]*60s' → 1
$ diff $F /tmp/_dry2.conf
25c25
<     proxy_read_timeout 20s;
---
>     proxy_read_timeout 60s;
```
**Un solo match.** `sed` anclado a `^[[:space:]]*` ⇒ no puede tocar comentarios.

**Gate 5 · Edición + `nginx -t` + reload graceful + dump**

Edición aplicada (`rc=0`), estado resultante:
```
a39e8de902cf5449553822eb1682d1a9d481390c1ce136a218d91fbe1ee4ac39  /etc/nginx/snippets/ape-meta-public.conf
size=2509 mtime=2026-10-26 04:37:14 mode=644
25:    proxy_read_timeout 60s;
```
`nginx -t` **después de editar, antes de recargar**:
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```
> Con fail-safe armado (`if nginx -t; then OK; else cp -p "$BAK" "$F"; nginx -t; exit 9; fi`). **No se activó.**

**Reload — graceful probado sin ambigüedad:**
```
pids_before: 2001835 2167499 2167500 2167501 2167502
$ systemctl reload nginx → rc=0
pids_after : 2001835 2170365 2170366 2170367 2170368
systemctl is-active nginx → active
NRestarts=0
ActiveEnterTimestamp=Sun 2026-10-25 23:35:04 UTC      ← INMÓVIL (anterior a la tarea)
```
El **master 2001835 sobrevivió**; sólo cambiaron los workers. `NRestarts=0` y `ActiveEnterTimestamp` sin moverse ⇒ **reload, no restart**.

`nginx -t` post-reload: OK.

**Dump después y diff integral:**
```
$ nginx -T > /root/nginx-after2-20261026T043703Z.conf
64482e7d9014473ea9228253bbe7fbe81d431df97787c81940dc745c25e15404   848 líneas

$ diff before2 after2
826c826
<     proxy_read_timeout 20s;
---
>     proxy_read_timeout 60s;
```
**UN ÚNICO HUNK** sobre 36 KB de configuración combinada. Nada más cambió.

### B.3 Dump recortado (estado final verificado en vivo)

```
$ nginx -T 2>/dev/null | grep -n 'proxy_read_timeout'
298:        proxy_read_timeout      60s;      ← /meta/                     ✅
422:        proxy_read_timeout      60s;      ← camino /cdn/ (/_ape/_fetch) ✅
519:        proxy_read_timeout 300s;          ← coa-navigator, NO se toca
535:        proxy_read_timeout 86400s;        ← websocket, NO se toca
826:    proxy_read_timeout 60s;               ← /cdn/ del 443             ✅ DV-2 CERRADO
```

**Los tres contextos objetivo (`/meta/`, `/_ape/_fetch`, `/cdn/` del 443) están a 60 s.** Los `300s`/`86400s` ajenos siguen intactos. **Ningún `5s` ni `20s` en el dump.**

---

## PARTE C — Espejo `ape-meta-public.conf` (sin tocar el VPS)

### C.1 Identidad

| | Antes | Después |
|---|---|---|
| Ruta repo | `_vps_stage/public/ape-meta-public.conf` | idem |
| Bytes | 2 509 | **2 509** |
| sha256 | `0a4002166054834c756d5451da49f8e9aa6327f5672a1e625a9c044df9ff91de` | **`a39e8de902cf5449553822eb1682d1a9d481390c1ce136a218d91fbe1ee4ac39`** |

Verificación contra el VPS en la misma ejecución:
```
VPS  /etc/nginx/snippets/ape-meta-public.conf → a39e8de9…(2509 B)
repo _vps_stage/public/ape-meta-public.conf   → a39e8de9…(2509 B)   ✅ byte-idéntico
```
BOM **NO**, CRLF **0**.

### C.2 Diff en el repo (1 línea)

```
$ git diff --numstat -- _vps_stage/public/ape-meta-public.conf
1	1	_vps_stage/public/ape-meta-public.conf
```

```diff
diff --git a/_vps_stage/public/ape-meta-public.conf b/_vps_stage/public/ape-meta-public.conf
index af7ab74..5555862 100644
--- a/_vps_stage/public/ape-meta-public.conf
+++ b/_vps_stage/public/ape-meta-public.conf
@@ -22,7 +22,7 @@ location ~ ^/cdn/(?<ape_host>[^/]+)(?<ape_path>/.*)$ {
     proxy_http_version 1.1;
     proxy_set_header Connection "";
     proxy_set_header Host $host;
-    proxy_read_timeout 20s;
+    proxy_read_timeout 60s;
     proxy_buffering on;
     add_header Cache-Control "no-store" always;
 }
```

**1 inserción / 1 borrado.** El blob base es `af7ab74` — confirma que **la v2 de t15 ya está commiteada** (el capitán la cerró); este diff es sólo el `20s→60s`.
**El repo ya no va por detrás de producción.** Lección DR-03 aplicada.

---

## 6. Gate 6 — Smoke con los endpoints CORRECTOS (DV-1 corregido)

### 6.1 `/_ape/health` — el que el contrato de t19 apuntaba mal

```
$ curl -s http://127.0.0.1:8088/_ape/health
{"checks":{"last_latency_ms":1,"nginx":true,"shared_dicts":true,"upstreams_down":0,
 "requests":7,"error_ratio":0.4286,"last_host":"127.0.0.1:8088"},
 "plane":"meta/v3","ts":1792989479,
 "qoe":{"host_down:line.tivi-ott.net":1,"last_ms":1,"bytes":3533,"last_ts":1792988608,
 "req":7,"all_failed":3,"rebase_ok":7,"last_host":"127.0.0.1:8088"},"ok":true}
```
**HTTP 200 · `ok:true` · `nginx:true` · `shared_dicts:true` · `upstreams_down:0` · `rebase_ok:7`.**
⚠️ El `error_ratio:0.4286` y `all_failed:3` **los causé yo** — ver §7.1. **No son un defecto de producción.**

### 6.2 HEAD de lista por el vhost 443 con `--resolve`

```
$ curl -sI --resolve iptv-ape.duckdns.org:443:127.0.0.1 -H 'Accept-Encoding: gzip' \
    https://iptv-ape.duckdns.org/lists/APE_LISTA_1792869328847.m3u8
HTTP/1.1 200 OK
Content-Type: application/vnd.apple.mpegurl
Content-Length: 297134088
Vary: Accept-Encoding
Content-Encoding: gzip
```
**200 + `Content-Encoding: gzip` + `Content-Length: 297134088`** — exactamente lo que exige el acceptance. El `--resolve` funciona (no depende de DNS externo).

### 6.3 Nota sobre el comando `Verify` del contrato (DV-1, tercera vez)

```
$ curl -sI --resolve iptv-ape.duckdns.org:443:127.0.0.1 -H 'Accept-Encoding: gzip' https://iptv-ape.duckdns.org/
HTTP/1.1 403 Forbidden        (Content-Length: 146)
```
El comando `Verify` del contrato apunta a **`/`**, no a la lista. En `/` el vhost sirve estáticos de `/var/www/html` con `try_files $uri $uri/ =404` y **sin autoindex** ⇒ **403**. **No es una regresión**: es el comportamiento del root del vhost, idéntico antes y después, y ajeno a esta tarea. La comprobación válida es §6.2 (la URL real de la lista). **Sugerencia: corregir el comando del contrato a la URL de la lista.**

---

## 7. Desviaciones y efectos declarados

### 7.1 ⚠️ EFECTO SECUNDARIO QUE TE AFECTA: contadores de telemetría ensuciados por mi sonda

Al probar `/cdn/` con **credenciales fabricadas** (`live/0000/0000/1.m3u8`), el gateway intentó traer la playlist del proveedor y **falló 3 veces**. La telemetría del plano lo registró:

```
all_failed: 3          ·  host_down:line.tivi-ott.net: 1  ·  requests: 7  ·  error_ratio: 0.4286
```

**Mecánica exacta (leída en el código, no inferida):**
- `ape_gateway.lua:178` → `HOSTS:set(dk, 1, 15)` — el **cooldown real** de 15 s vive en `ape_hosts` y **ya expiró**. Verificado: `upstreams_down: 0`.
- `ape_gateway.lua:179` → `qinc("host_down:" .. h)` — esto **incrementa un contador acumulativo en `ape_qoe`, SIN TTL**.
- `ape_obs.lua` calcula `error_ratio = all_failed / req` sobre esos contadores acumulativos.

**Consecuencias reales, sin adornos:**
1. **Funcional: CERO impacto.** `ok:true`, `upstreams_down:0`, cooldown vencido, listas sirviendo, `/meta/` y `/cdn/` operativos.
2. **Observabilidad: SÍ hay impacto.** Durante **~80 s seguí el contador y no se limpia**. Los `lua_shared_dict` **sobreviven al `reload`**, así que **ni un reload lo limpia**: sólo un **`restart`** lo haría.
3. **Riesgo de mala lectura:** cualquiera (incluida la matriz de t9 o un futuro veredicto) que lea `/_ape/health` verá **`error_ratio: 0.4286` ≈ 43 % de errores** y podría concluir que producción está degradada. **Es falso: son mis 3 sondas con credenciales inventadas.**
4. **NO ejecuté un `restart` para limpiarlo.** Reiniciar producción para maquillar un contador sería exactamente la clase de acción que `iptv-vps-touch-nothing` prohíbe. **Lo declaro en lugar de taparlo.**

> **Recomendación:** al citar `/_ape/health` en cualquier informe, usar `ok`, `upstreams_down`, `shared_dicts` y `rebase_ok` — **no** `error_ratio` hasta el próximo reinicio natural. Si te molesta el contador, la única vía limpia es un `restart` planificado con ventana; **no lo hago por iniciativa propia**.

### 7.2 El `/cdn/` con credenciales fabricadas devuelve 502/513 — y NO es regresión

```
curl http://127.0.0.1:8088/cdn/line.tivi-ott.net/live/0000/0000/1.m3u8        → 502
curl https://…/cdn/line.tivi-ott.net/live/0000/0000/1.m3u8 (--resolve)         → 502
```
**Ambos contextos dan el MISMO código** (en una sonda previa ambos dieron 513, luego ambos 502). El 502/513 lo produce el gateway al no poder traer la playlist del proveedor con una sesión inexistente. Prueba de que no es regresión: (a) el cambio fue **una sola directiva de timeout**, que no puede alterar el código de estado; (b) **443 y 8088 responden idéntico**, así que la delegación v2 sigue intacta; (c) `nginx -t` OK y el dump difiere en 1 línea.
**No afirmo que `/cdn/` funcione end-to-end**: no tengo (ni debo usar) credenciales reales de proveedor. La prueba estructural es: location presente, `proxy_pass` correcto, delegación idéntica en ambos contextos.

### 7.3 `ape-meta-public.conf` no cambia de tamaño

`20s` → `60s` = mismo nº de bytes ⇒ 2 509 B antes y después. **El `stat` por sí solo no detecta este cambio**; el testigo válido es el sha256. Declarado para que nadie lo lea como «no se aplicó».

---

## 8. LO QUE NO SE TOCÓ — verificado por hash

| Archivo | sha256 (antes = después) | Prohibición |
|---|---|---|
| `/etc/nginx/lua/ape_uhd.lua` | `f1f5eb674744858ae7c5e84c73262e37545b0c84e557c6466cad20ae7b1f3b5e` | **ape_uhd.lua** ✅ |
| `/etc/nginx/conf.d/iptv-limit-conn.conf` | `917c98d819576f55fe60547ce0d5330f3d5fd2a32bcbc7cd73d524f876c3ec58` | **limit_conn** ✅ |
| `/etc/nginx/nginx.conf` | `a9a7146a46b4080f32e0fd1e40772bce53cac3a8f0cd18ed2e1ebc5c31d4ce1f` | **proxy_cache\* / nginx.conf** ✅ |
| `/etc/cron.d/cache-health-monitor` | `15bf1488e547723c2e2b0132a83a5b83697141e4a1d382fc2afabc4e68817bb7` | **cron** ✅ |
| `/var/www/lists/APE_LISTA_1792869328847.m3u8.gz` | `7f1cd8a7f3dd58960c7dfde373ed115eeeac5be4a72a1d1fc5850636f9ccc360` | **lista servida** ✅ |
| `/etc/nginx/conf.d/50-ape-meta-plane.conf` | `3e29b9280c05de36c4af445e8a9722573a23c865f240e2d87b2734178e60c515` | no se tocó en esta tarea ✅ |

**Timers `netshield-autopilot` / `netshield-sentinel` / `net-shield-throughput`:** `inactive` antes y después — no se activó ninguno.
**WireGuard:** cero comandos. **Módulos Crystal:** cero despliegues. **`scp` hacia el VPS: cero.**
**Commit:** **ninguno.** HEAD sigue en `ffb01e6`; índice vacío.

---

## 9. Gate 7 — Rollback escrito

### 9.1 Parte B (VPS) — comando literal

```bash
cp -p /root/nginx-bak/ape-meta-public.conf.bak_20261026T043703Z /etc/nginx/snippets/ape-meta-public.conf && nginx -t && systemctl reload nginx
```
Cadena `&&`: **si `nginx -t` falla, NO se recarga** (producción sigue con la config buena en memoria). `reload`, nunca `restart`.
Verificación post-rollback esperada:
```bash
sha256sum /etc/nginx/snippets/ape-meta-public.conf   # esperado 0a4002166054834c756d5451da49f8e9aa6327f5672a1e625a9c044df9ff91de
nginx -T 2>/dev/null | grep -n proxy_read_timeout   # L826 vuelve a 20s
```

### 9.2 Partes A y C (repo) — revertir a HEAD

```bash
git checkout -- _vps_stage/nginx/meta-plane.conf _vps_stage/public/ape-meta-public.conf
```
(restaura las versiones commiteadas; el repo volvería a quedar **por detrás** del VPS, que es precisamente el drift que esta tarea cierra — usar sólo si hay que deshacer.)

### 9.3 Artefactos de referencia en el host

| Archivo | Bytes | sha256 |
|---|---|---|
| `/root/nginx-bak/50-ape-meta-plane.conf.bak_20261026T043331Z` (de t19) | 10 939 | `e06ee870…` |
| `/root/nginx-bak/ape-meta-public.conf.bak_20261026T043703Z` (**de esta tarea**) | 2 509 | `0a400216…` |
| `/root/nginx-before2-20261026T043703Z.conf` | — | `14052b23…` (848 L) |
| `/root/nginx-after2-20261026T043703Z.conf` | — | `64482e7d…` (848 L) |

---

## 10. Verificación final (comandos del contrato, corregidos)

```bash
ssh hetzner-iptv "curl -s http://127.0.0.1:8088/_ape/health"                      # ok:true (ver §7.1 sobre error_ratio)
ssh hetzner-iptv "curl -sI --resolve iptv-ape.duckdns.org:443:127.0.0.1 -H 'Accept-Encoding: gzip' https://iptv-ape.duckdns.org/lists/APE_LISTA_1792869328847.m3u8"
ssh hetzner-iptv "nginx -T 2>/dev/null | grep -n 'proxy_read_timeout'"            # 60s ×3 + 300s + 86400s
ssh hetzner-iptv "sha256sum /etc/nginx/conf.d/50-ape-meta-plane.conf /etc/nginx/snippets/ape-meta-public.conf"
Get-FileHash _vps_stage/nginx/meta-plane.conf -Algorithm SHA256
Get-FileHash _vps_stage/public/ape-meta-public.conf -Algorithm SHA256
```

| Comprobación | Esperado | Obtenido |
|---|---|---|
| repo `meta-plane.conf` | `3e29b928…` / 10 941 B | ✅ |
| repo `ape-meta-public.conf` | `a39e8de9…` / 2 509 B | ✅ |
| VPS dump: 60s en `/meta/`, `/_ape/_fetch`, `/cdn/` 443 | 3× 60s | ✅ (298, 422, 826) |
| `/_ape/health` | `ok:true` | ✅ |
| HEAD lista 443 | 200 + gzip + 297 134 088 | ✅ |
| `nginx -t` | OK | ✅ (3 veces) |
| reload graceful | master vivo, `NRestarts=0` | ✅ |
| diff del dump | 1 hunk | ✅ (826c826) |

---
*Fin de VPS_REMEDIATION_LOG_2.md — DV-2 cerrado (20s→60s en `/cdn/` del 443), los dos espejos del repo alineados con producción, 7/7 gates, 1 hunk, reload graceful probado por PID. Efecto secundario de telemetría declarado (§7.1). Sin commit.*

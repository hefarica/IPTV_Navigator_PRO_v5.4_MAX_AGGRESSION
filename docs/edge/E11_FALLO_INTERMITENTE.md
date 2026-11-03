# E11 · Fallo intermitente de `/cdn/` — causa, breaker y arreglo

**Estado:** diagnóstico **READ-ONLY** cerrado · causa raíz probada · breaker **ya eliminado** del
gateway vivo (hotfix del capitán, 2026-10-26T20:49:57Z) y **verificado por medición**.
**Ventanas de observación:** 2026-10-26 20:32Z → 21:29Z (UTC), en **dos pasadas**:
la 1ª con el breaker aún vivo y la 2ª (**§11**) ya sin él, con campaña propia de **114 peticiones**
y el **log completo de 2 días (1.227 peticiones /cdn/)**.
**§12** responde al diff con el gateway del **repo** (que **sí** tiene el breaker) y **§13** entrega la
**composición E11+E7** en un único fichero por destino, ya verificada, para que E10 no tenga que fusionar.
**Escrituras en producción:** **cero** (solo `GET`, lectura de logs y de config; los ficheros Lua
propuestos **no se han desplegado**, no se ha recargado nginx).
**Todo el material reproducible vive en** [`_vps_stage/edge/E11_intermittent/`](../../_vps_stage/edge/E11_intermittent/).

---

## 0 · Veredicto en una línea

El «~20 % de manifiestos que falla» **no era el proveedor: era un circuit-breaker de 15 s dentro de
`ape_gateway.lua`** que, tras **un solo** fallo real del proveedor, contestaba `502` instantáneo
(`ms:0`, **sin `reason`**, sin cabeceras `X-APE-*`) a **todas** las peticiones de ese host durante
15 s, incluidos los reintentos del player. Medido en producción: **89,1 % de los fallos servidos al
cliente externo no llegaron nunca al proveedor**, con **9,2× de amplificación** (5 fallos reales →
46 visibles). Con el breaker fuera: **312 peticiones, 0 × 502** y **180/180 = 200** en la campaña
controlada.

| Métrica | Antes (66a20017, con breaker) | Después (2dc0fad8, sin breaker) |
|---|---|---|
| Fallos visibles de `/cdn/` (cliente externo real) | **46 / 164 = 28,0 %** | **0 / 60 = 0 %** |
| `502` en el log público | 43 en la ventana del día | **0** en 312 peticiones (20:49:57→21:00:06) |
| Fallos que llegan al proveedor | 5 (11 %) | 5 (100 %) |
| `error_ratio` **honesto** (`fallos/intentos`) | 0,2476 – 0,2087 según ventana | 0,0000 en la ventana medida |
| `error_ratio` **publicado** (fórmula rota) | 0,2637 – 0,3297 | 0,0000 |
| Campaña controlada 3 canales | no concluyente (el breaker se disparaba por otro cliente) | **180/180 = 200** |

---

## 1 · Método (y por qué es reproducible)

Todo el trabajo se hizo **desde el propio VPS por SSH**, con scripts que **solo hacen `GET`** y que
**no escriben nada** en el servidor (el payload va por `stdin`, la evidencia sale por `stdout`).
Credenciales de proveedor y token del CDN se **redactan** (`<USER>`/`<PASS>`/`<TOKEN>`) en todos los
artefactos.

| Script | Qué hace | Escribe |
|---|---|---|
| [`scripts/e11_sample.py`](../../_vps_stage/edge/E11_intermittent/scripts/e11_sample.py) | Campaña controlada: 150 `GET` al 443 + 30 al `:8088` (3 canales, round-robin), con estado del breaker **antes y después** de cada petición y control al proveedor en cada fallo | no |
| [`scripts/e11_breaker_ab.py`](../../_vps_stage/edge/E11_intermittent/scripts/e11_breaker_ab.py) | A/B determinista del breaker: 1 disparo controlado + ventana de 22 s con sonda cada 0,5 s | no |
| [`scripts/e11_provider_codes.py`](../../_vps_stage/edge/E11_intermittent/scripts/e11_provider_codes.py) | Códigos del proveedor por tipo de ruta + concurrencia acotada (6 hilos) proveedor vs gateway | no |
| [`scripts/e11_token_ttl.py`](../../_vps_stage/edge/E11_intermittent/scripts/e11_token_ttl.py) | Unicidad y TTL del token del `302` (rejilla 2→30 s) | no |
| [`scripts/e11_analyze.mjs`](../../_vps_stage/edge/E11_intermittent/scripts/e11_analyze.mjs) | Analizador offline: distribución, ventanas de breaker, amplificación, métrica honesta | no |
| [`scripts/e11_sim_breaker.mjs`](../../_vps_stage/edge/E11_intermittent/scripts/e11_sim_breaker.mjs) | Simulación **offline** con `ngx` falso: perfila las 3 versiones del gateway sobre el mismo guion | no |
| [`scripts/e11_timeline.mjs`](../../_vps_stage/edge/E11_intermittent/scripts/e11_timeline.mjs) | Línea de tiempo de fallos por cliente | no |

**Trampa metodológica que hubo que resolver primero:** el proveedor responde **`461`** si la petición
lleva `Accept: */*` (lo que hace `curl` por defecto) y **`302`** si solo lleva `Host` +
`User-Agent: Mozilla/5.0` — exactamente lo que envía `/_ape/_fetch` (`proxy_pass_request_headers off`).
Cualquier sonda «directa al proveedor» que no replique esas cabeceras mide un **falso “caído”**. Todos
los controles de este informe replican el fetch del edge.

**Partición de los datos por cliente** (los logs mezclan arneses con consumidores reales):

| Cliente | Qué es | Peticiones `/cdn/` (día) |
|---|---|---|
| `146.70.86.222` | consumidor **externo real** (`Referer: netflix.com`, UA Chrome, refresca cada ~11 s ⇒ player/monitor de directo) | 164 |
| `181.130.154.235` | sonda externa (hace `node`/`curl` contra `/cdn/127.0.0.1:8088/…` y `*.ts`) | 46 |
| `178.156.147.234` | el propio VPS: **campaña E11** + A/B | 206 |
| `127.0.0.1` | loopback: pruebas de otros módulos | 12 |
| ~10 IPs CN | escáneres de Internet | 71 |

---

## 2 · Hallazgo 1 (causa raíz) · el breaker convertía 1 fallo en 15 s de fallos

### 2.1 · El código, literal

En el gateway **que estaba vivo** (`/etc/nginx/lua/ape_gateway.lua`, 267 líneas,
`sha256 66a2001730d7e2b5…`, backup `ape_gateway.lua.bak_20261026T204957Z`):

```lua
for _, h in ipairs(candidates) do
    local dk = "down:" .. h
    if not (HOSTS and HOSTS:get(dk)) then          -- ← EL BREAKER: si está castigado, NO se intenta
        local res, fh, why = fetch_follow(h, path, args)
        if res and res.status and res.status >= 200 and res.status < 300 then
            winner, res_ok = h, res; final_origin = "http://" .. fh; break
        end
        last_status = (res and res.status) or 502
        last_reason = why or (res and res.status and ("http_" .. res.status)) or "capture_failed"
        if HOSTS then HOSTS:set(dk, 1, 15) end     -- ← castigo: 15 s, por HOST (no por ruta)
        qinc("host_down:" .. h)
    end
end
```

Tres propiedades lo convierten en un amplificador:

1. **Se castiga por `HOST`, no por `host+ruta`.** Un `404`/`405` de *un* canal tumba *todos* los
   canales del mismo host.
2. **Se castiga cualquier `non-2xx`**, incluidos errores deterministas del cliente (`405` por id
   inexistente, `513` por credencial inválida, `404` por `.ts`). No distingue «el proveedor está
   mal» de «esta ruta no existe».
3. **El `502` del breaker es mudo:** al saltarse el `for`, `last_status` y `last_reason` quedan en
   `nil`, así que el JSON sale **sin `reason`** (`cjson` omite los `nil`) y con **`ms:0`**, y
   **no se emite ninguna cabecera `X-APE-*`** (el `return` ocurre antes de fijarlas). Es decir: el
   síntoma era **indiagnosticable por diseño**.

### 2.2 · A/B determinista (1 disparo controlado, 2026-10-26T20:42:57Z)

Disparo: `GET /cdn/line.tivi-ott.net/live/<USER>/<PASS>/999999999.m3u8` → el proveedor contesta `405`.

| t (s) | status | ttfb | bytes | `reason` | `ms` | cab. `X-APE-*` | control al proveedor |
|---|---|---|---|---|---|---|---|
| −0,3 (control) | **200** | 807 ms | 643 | — | 833 | 8 | `302` → `200` |
| **0,00 (disparo)** | **405** | 333,7 ms | 151 | **`http_405`** | **325** | 0 | — |
| 0,34 | **502** | **7,5 ms** | 121 | **ausente** | **0** | **0** | `302` → `200` |
| 1,57 → 14,38 (×20) | **502** | 7,3–12,3 ms | 121 | **ausente** | **0** | **0** | `302` → `200` en **todos** los controles |
| 16,30 (recuperado) | **200** | 712,4 ms | 643 | — | 712 | **8** | `302` → `200` |

Lectura: **21 peticiones consecutivas fallaron durante 14,04 s mientras el proveedor estaba sano en
las 7 comprobaciones intercaladas**. La primera petición tras expirar la marca volvió a `200` con sus
8 cabeceras: **TTL efectivo medido ∈ (14,4 s, 16,3 s) ⇒ 15 s, el configurado**.
Contadores: `all_failed` 75 → 103 (**+28**), `req` 467 → 475 (**+8**), `host_down:line.tivi-ott.net`
7 → 8 (**+1**). **Un** disparo produjo **28** fallos contabilizados.

### 2.3 · La misma firma en producción (cliente externo real `146.70.86.222`)

```
20:25:00  407  ← ÚNICO intento real (158 B, ms>0, reason presente)
20:25:01 … 20:25:14   12 × 502  (137 B, ms:0, sin reason, sin X-APE)   ← ráfaga de 14 s
20:30:12  407                       → 20:30:14 … 20:30:26  10 × 502   ← ráfaga de 14 s
20:34:24  407                       → 20:34:25 … 20:34:38  12 × 502   ← ráfaga de 14 s
20:23:13 / 20:43:03  502            → ráfagas de 3 y 6 sin 407 visible (disparo de otro cliente)
```

Clasificación (regla: *el primer fallo no cubierto por una ventana previa es intento real; todo lo
demás dentro de `[semilla, semilla+16 s]` es skip del breaker*):

| Cliente | Peticiones | `200` | fallos | ventanas | **skips** | reales | amplificación | **fabricado por el breaker** |
|---|---|---|---|---|---|---|---|---|
| **`146.70.86.222`** | 164 | 118 | **46 (28,0 %)** | 5 | **41** | **5** | **9,2×** | **89,1 %** |
| `178.156.147.234` (A/B) | 206 | 184 | 22 | 1 | 21 | 1 | 22× | 95,5 % |
| `127.0.0.1` | 12 | 7 | 5 | 3 | 2 | 3 | 1,7× | 40,0 % |
| `181.130.154.235` | 46 | 40 | 6 | 6 | 0 | 6 | 1× | 0 % (los 6 son `404` de `*.ts`, el candado de vídeo) |
| escáneres CN | 71 | 50 | 21 | 2 | 19 | 2 | 10,5× | 90,5 % |
| **todo el log público 443** | **499** | **399** | **100** | **17** | **≈83** | **≈17** | **≈5,9×** | **≈83 %** |

Cierre aritmético independiente, con los contadores del propio plano
(`/_ape/qoe`, `metrics`): `all_failed = intentos reales fallidos + skips`, y **cada intento real
fallido incrementa exactamente un `host_down:<host>`**. Con `all_failed = 103` y
`host_down:line.tivi-ott.net = 8` + `host_down:127.0.0.1:8088 = 7` (15 intentos reales):
**88 de 103 fallos (85,4 %) fueron skips del breaker**.

### 2.4 · Reproducción offline en 4 líneas (sin tocar el VPS)

[`scripts/e11_sim_breaker.mjs`](../../_vps_stage/edge/E11_intermittent/scripts/e11_sim_breaker.mjs)
carga las **tres** versiones del gateway en LuaJIT real (vía `lua5.1 -` por `stdin`, con un `ngx`
falso que incluye shared dicts con TTL y un proveedor guionizado) y las perfila con el mismo guion
—1 fallo real + 3 peticiones al canal bueno—:

```
PREFIX    #1 407 fetch=1 reason=true  ms=351 | #2 502 fetch=0 reason=false ms=1  xape=0 down=1
HOTFIX    #1 407 fetch=1 reason=true  ms=351 | #2 200 fetch=1              ms=712 xape=8 down=nil
PROPOSED  #1 407 fetch=1 reason=true hdrReason=true attempts=1 | #2 200 fetch=1 xape=8 down=nil
RESULT=OK (11/11)
```

`PREFIX` = `66a20017` (con breaker) · `HOTFIX` = `2dc0fad8` (hotfix del capitán) ·
`PROPOSED` = `2dc0fad8` + delta E11. **11/11 comprobaciones PASS**: el fallo ciego es reproducible
fuera de producción, el hotfix lo elimina y el delta no toca el camino feliz.

---

## 3 · Hallazgo 2 · el proveedor SÍ falla, con códigos no estándar

Con el breaker fuera, un fallo del proveedor se paga **completo** en cada intento (≈300 ms y un error
visible), así que importa saber **qué** códigos usa y **cuándo**. Medido con la réplica exacta del
fetch del edge (`Host` + `UA: Mozilla/5.0`, sin `Accept`), 3 muestras por caso:

| Ruta | Proveedor | CDN tras el `302` | Interpretación |
|---|---|---|---|
| `/live/<USER>/<PASS>/3.m3u8` (canal válido) | **302** ×3 | **200**, 499 B | camino normal; token nuevo por petición |
| `/live/0000/0000/3.m3u8` (credencial inválida) | **513** ×3 | — | **513 = credencial/ ruta no autorizada** |
| `/live/<USER>/<PASS>/999999999.m3u8` (id inexistente) | **405** ×3 | — | **405 = no es una ruta de directo válida** |
| `/live/<USER>/<PASS>/0.m3u8` | **405** ×3 | — | idem |
| `/live/<USER>/<PASS>/nope.m3u8` | **405** ×3 | — | idem |
| `/live/<USER>/<PASS>/3` (sin `.m3u8`) | **513** ×3 | — | 513 también por extensión ausente |
| cualquiera + `Accept: */*` | **461** | — | **461 = huella de cliente rechazada** (por eso el edge fuerza UA y `request_headers off`) |
| URL del CDN con **token caducado** | — | **509** | **509 = token expirado** (ver §4) |

**Lo que contestan las tres preguntas del enunciado:**

* **`509` no era «ticket expirado del proveedor» en el camino del gateway: es el CDN rechazando un
  token caducado.** En 598 peticiones `/cdn/` del plano **nunca** llegó un `509` al cliente (0
  ocurrencias) porque el gateway **acuña un token nuevo (302, ≈290 ms) y lo consume en el acto
  (≈410 ms)**; jamás reutiliza uno viejo.
* **`513` no aparece con canales válidos**: es determinista (credencial/ruta) y por tanto *no es
  reintentable*.
* **El único código que sí aparecía en canales válidos era `407`** (3 veces en ~500 peticiones,
  ≈0,6 %): rechazo transitorio del panel. **Era el disparador real** del breaker — y por eso el
  fallo parecía aleatorio.
* **Concurrencia acotada (6 hilos × 2 rondas, mismo canal):** proveedor `302` ×6 ×2 y gateway `200`
  ×6 ×2. **No hay castigo por concurrencia a 6 simultáneas** ⇒ el `407` no se reproduce con carga
  moderada; su origen está en el lado del panel (sesión/ticket), no en el volumen.

---

## 4 · Hallazgo 3 · el token del `302`: único, y vive ~6–15 s

Medido ([`e11_token_ttl.py`](../../_vps_stage/edge/E11_intermittent/scripts/e11_token_ttl.py)), con
el mismo path y el mismo minuto:

* **Unicidad: 5 peticiones → 5 tokens distintos** (80 caracteres cada uno). No hay token estable que
  cachear.
* **TTL** (rejilla 2→30 s, 3 tokens independientes):

| Token | `200` en (s) | primer `509` (s) |
|---|---|---|
| trial 1 | 2,4 · 4,4 · 6,4 | **8,4** |
| trial 2 | 2,4 … 12,5 | **14,4** |
| trial 3 | 2,4 … 30,5 | **no caducó en 30 s** |

* Un **token nuevo sigue sirviendo** tras la caducidad del anterior (`302` → `200`): es caducidad de
  token, no bloqueo del CDN.

**Consecuencias (dos decisiones que esto cierra):**

1. **Para E4 (cachear el destino del 302):** con token **único por petición** y **TTL 6–15 s**, un
   acierto de caché solo es válido durante esa ventana; fuera de ella el `hit` devolvería **`509`**,
   que es **peor** que un `302` fresco (un fallo duro en vez de una redirección válida). La ventana
   útil (≤5 s para tener margen) es mucho menor que el intervalo de refresco del player medido
   (**~11 s**), así que **la tasa de acierto esperada es baja y el modo de fallo es catastrófico**.
   *Veredicto: la caché del destino del `302` no es viable tal cual; si se intenta, debe ser
   `TTL ≤ 5 s` + clave completa `host+path+query` + **nunca** servir un token caducado (verificar
   por edad, no por `Cache-Control` del proveedor, que no lo prohíbe).*
2. **Para E11:** explica por qué `509` es un código «de ticket» que existe en el proveedor pero **no
   puede** aparecer por el gateway: el gateway no reutiliza tokens.

---

## 5 · La métrica: `error_ratio` estaba mal definida (y sigue estándolo en producción)

`/etc/nginx/lua/ape_obs.lua` (vivo, `sha256 f477741b…`) líneas 60-62:

```lua
local req = tonumber(snap.metrics.req) or 0        -- ← `req` SOLO se incrementa en el ÉXITO
local failed = tonumber(snap.metrics.all_failed) or 0
local err_ratio = req > 0 and (failed / req) or 0  -- ← fallos / éxitos  (NO es una ratio)
```

`ape_gateway.lua` hace `qinc("req")` **solo** al final del camino de éxito y `qinc("all_failed")`
**solo** en el de fallo. Por tanto lo publicado era `fallos/éxitos`: puede pasar de 1 y **sobrevalora
el error entre un 18 % y un 25 %**.

**Fórmula correcta:** `error_ratio = all_failed / (all_failed + req)` = `fallos / intentos`.

| Lectura | Publicado (`fallos/éxitos`) | **Honesto (`fallos/intentos`)** | Sobrestimación |
|---|---|---|---|
| E1 inicio 20:20:41 (24 fallos / 91 éxitos) | 0,2637 | **0,2087 (20,9 %)** | +20,9 % |
| E1 fin (+18 req, mismos 24 fallos) | 0,2202 | **0,1805 (18,0 %)** | +18,0 % |
| Lectura 20:27:25 (137 ok / 41 fallos) | 0,2993 | **0,2303 (23,0 %)** | +23,1 % |
| E11 20:34:29 (`req`=182, `all_failed`=60) | 0,3297 | **0,2479 (24,8 %)** | +24,8 % |
| **Post-hotfix 20:51:32** (`req`=567, `all_failed`=131) | 0,2310 | **0,1877** | +23,1 % |
| **Post-hotfix 20:54:24** (fin de campaña) | 0,1642 | **0,1410** | +16,4 % |

> La cifra del enunciado «24/91 = 18,0 %» corresponde a la **lectura de cierre** de E1
> (`all_failed`=24, `req`=109 → 18,05 %). Con la misma fórmula, la lectura de **apertura** de E1 da
> **20,87 %**. Ambas son la misma corrección; cambia la ventana.
>
> **Ojo con `all_failed` post-hotfix:** es acumulativo desde que arrancó el shared dict y **no se
> resetea**, así que mezcla la era-con-breaker con la era-sin-breaker. Para leer la tasa *actual* hay
> que usar deltas (`Δall_failed / Δintentos`) o ventanas de log, no el acumulado. En la campaña
> post-hotfix el delta fue **`Δall_failed = 0` sobre 231 intentos**.

El parche con la fórmula honesta (+ `attempts`, `failures`, `provider_failures_total` y el valor
viejo conservado como `error_ratio_legacy_obsolete`) está en
[`proposed/ape_obs.delta.patch`](../../_vps_stage/edge/E11_intermittent/proposed/ape_obs.delta.patch).
**No desplegado.**

---

## 6 · Verificación post-hotfix (el arreglo funciona)

El capitán sustituyó el gate por `if true` y comentó el `HOSTS:set(dk,1,15)`
(`ape_gateway.lua` vivo = `sha256 2dc0fad86f45f4ac…`, backup `66a20017…`, `nginx -t` OK,
`MainPID 2001835` / `NRestarts 0`). Verificado por tres vías independientes:

1. **Log público 443, ventana 20:49:57 → 21:00:06** (312 peticiones `/cdn/`):
   **301 × `200`**, `4 × 404` y `4 × 403` (**todas** sondas deliberadas de otros arneses:
   `*.ts` → 404 por el candado de vídeo; `/cdn/127.0.0.1:8088/_ape/health` → 403, la ruta interna
   sondeada *a través* del gateway), `2 × 513` y `1 × 405` (**mis propias** pruebas de ruta inválida).
   **`0 × 502`.**
   El consumidor externo `146.70.86.222`: **60 peticiones, 0 fallos**.
2. **Campaña controlada** (`e11_sample.py`, 20:51:32→20:54:24): **180/180 = `200`**, 50 por canal en
   el 443 y 10 por canal en el `:8088`. `Δall_failed = 0` sobre 231 intentos. TTFB p50
   **707,7 ms** (443) / **751,0 ms** (8088); p95 903 / 965 ms.
3. **Simulación offline** de las 3 versiones (§2.4): `RESULT=OK (11/11)`.
4. **Invariante de cierre (la prueba de que ya no hay skips):** con el breaker, `all_failed`
   crecía mucho más rápido que la suma de `host_down:*` (la diferencia eran los skips:
   **≈88** acumulados hasta 20:49Z). Tras el hotfix, entre 20:51Z y 21:04Z:
   `Δall_failed = +2` y `ΔΣ host_down:* = +2` ⇒ **1:1, cero skips**. Además
   `/_ape/qoe.hosts_down = {}` en todas las lecturas posteriores al hotfix: la marca `down:` ya no
   se escribe nunca.

Y la firma del fallo ciego desapareció: en la ventana post-hotfix **no existe ninguna respuesta con
`ms:0`**, y las rutas inválidas ahora devuelven su código real **con `reason`**:

```
GET /cdn/line.tivi-ott.net/live/0000/0000/3.m3u8   → 513  {"reason":"http_513","ms":285, …}
GET /cdn/line.tivi-ott.net/live/<U>/<P>/999999999  → 405  {"reason":"http_405","ms":510, …}
```

---

## 7 · Arreglo priorizado

### P0 · Breaker fuera — **HECHO** (hotfix del capitán, verificado aquí)

Elimina de golpe el **≈83–89 %** de los fallos. Coste: 0 ms en el camino feliz (la rama que se salta
es la que ya no se ejecuta). Riesgo asumido y correcto para un plano *single-user*: si el proveedor
está realmente caído, se paga el `proxy_connect_timeout` de `/_ape/_fetch` (**3 s**) por candidato, no
15 s de `502` a todos los canales.

### P1 · Métrica honesta + error diagnosticable — **propuesto, no desplegado**

[`proposed/ape_gateway.delta.patch`](../../_vps_stage/edge/E11_intermittent/proposed/ape_gateway.delta.patch) ·
[`proposed/ape_obs.delta.patch`](../../_vps_stage/edge/E11_intermittent/proposed/ape_obs.delta.patch)

* `ape_obs.lua`: `error_ratio = fallos/intentos`; se añaden `attempts`, `failures`,
  `provider_failures_total`; el valor viejo queda como `error_ratio_legacy_obsolete` (**marcado
  obsoleto**, no usar).
* `ape_gateway.lua`: **`reason` siempre presente** (fallback `no_candidate_attempted`) + el error
  publica **cabeceras** `X-APE-Reason`, `X-APE-Attempts`, `X-APE-Upstream-Ms`, `Cache-Control:
  no-store` ⇒ un fallo se clasifica **sin leer el cuerpo** (que es lo que hacía indiagnosticable el
  `502` del breaker).
* **Telemetría muerta retirada:** `qinc("host_down:"..h)` → `qinc("provider_fail:"..h)` y se elimina
  la variable `dk = "down:"..h` (ya no se escribe nunca). `provider_failures_total` es el contador
  vivo; `upstreams_down` en `/ape/health` se conserva por compatibilidad pero **vale 0 siempre** y
  queda marcado `legacy_breaker_removed: true`. **Decisión: sí, se retira del diagnóstico** — un
  campo que siempre vale 0 es una trampa para el siguiente que investigue.

Ambos parches: **aplican limpio** sobre el fichero vivo (`git apply --check` = 0), **reproducen el
fichero propuesto byte a byte** y **compilan** con `lua5.1` (LuaJIT-compatible). Verificación:
`RESULT=OK (11/11)` en la simulación, incluyendo «no toca el camino feliz: mismas 8 cabeceras
`X-APE-*`» y «no fabrica `all_failed`».

### P2 · ¿Retry acotado en el edge? — **NO justificado hoy (por medición)**

La pregunta es pertinente: sin breaker, un fallo del proveedor se paga entero en cada intento. Pero
la evidencia dice que **no compensa**:

| Clase de fallo | Frecuencia medida | ¿Un retry lo arregla? | Coste del retry |
|---|---|---|---|
| `405` (id/ruta inválida) | 6/6 en las pruebas de ruta; **todas** las de escáneres | **no** (determinista) | +300 ms por petición perdida, para nada |
| `513` (credencial/ruta) | 6/6 en las pruebas | **no** (determinista) | idem |
| `404` (`.ts` bajo `/cdn/`) | candado de vídeo *by design* | **no** | idem |
| `407` (rechazo transitorio del panel) | 3 en ~500 peticiones (**≈0,6 %**) | **quizá**, pero el panel lo repite si es por sesión | +300 ms en el 0,6 % |
| `509` (token caducado) | **0** por el gateway (acuña token nuevo) | **no aplica** | — |
| timeout / connect | no observado en la ventana | sí | acotado por `proxy_connect_timeout 3s` |

Y el dato decisivo: **en 180 peticiones post-hotfix y 312 del log público no hubo ni un fallo**; el
residual que mide el capitán (**1,15 %**) está dominado por rutas inválidas de escáneres, donde un
retry **empeora** (duplica la carga y la latencia de algo que nunca va a funcionar).

**Veredicto:** no añadir retry genérico. Si en el futuro aparecen `407`/`5xx`/timeouts en canales
válidos por encima del ~1 %, el retry correcto es **quirúrgico**: solo para
`{407, 408, 429, 500, 502, 503, 504}` y `timeout`, **1 intento**, `ngx.sleep(0.10–0.15)`
(cede el worker: en `content_by_lua` **no bloquea** el event loop), **mismo host**, y **jamás**
para `403/404/405/513` ni cacheando el fallo. Queda documentado como bloque comentado, no aplicado.

### P3 · Nada de caché de token para `/cdn/` (ver §4)

Si E4 quiere explorarlo: `TTL ≤ 5 s`, clave `host+path+query`, y **rechazar** el hit si el token tiene
más edad que su TTL medido. Con refresco de player ~11 s y TTL 6–15 s la tasa de acierto esperada es
baja y el modo de fallo (`509` servido al player) es peor que el `302` fresco.

---

## 8 · Impacto en reproducción (cuántos zaps acababan en error)

Modelo: **1 zap = 1 `GET` de manifiesto**; el player refresca cada **~11 s** (medido en
`146.70.86.222`) y reintenta a ~1 s / 2 s / 4 s.

| Escenario | Tasa de fallo del manifiesto | Zaps perdidos | Con 2 reintentos dentro de la ventana |
|---|---|---|---|
| **Antes** (breaker vivo), cliente externo real | **28,0 %** (46/164) | **≈28 %** | **≈48 %** (los reintentos caen dentro de los 15 s ⇒ no salvan) |
| Antes, todo el log público | 20,0 % (100/499) | ≈20 % | ≈36 % |
| **Después** (sin breaker), ventana 20:49:57→21:00:06 | **0 %** (0/312; 0/60 del cliente externo) | **0 %** | 0 % |
| Después, residual medido por el capitán (+174 req / +2 fallos) | **1,15 %** (rutas inválidas) | ≈1 % | ≈1 % |

El punto importante del «antes» no era solo la tasa: era que **el reintento del player no podía
ganar**. Con un TTL de 15 s y un player que reintenta en <15 s, **un solo fallo real bastaba para
perder el zap**; el usuario veía «canal no disponible» y, al reintentar a mano segundos después,
seguía fallando (misma ventana). De ahí la sensación de **intermitencia inexplicable**: el canal
«volvía solo» a los ~15 s.

---

## 9 · Observabilidad: dos notas para el siguiente que mire

* **`X-APE-UHD` vale `off` en `/cdn/` y es correcto.** `/cdn/` sirve *media playlists*; el bloque UHD
  solo actúa `if lib.is_master(rebased)`. Para estas rutas el valor honesto es **`na`** (no aplica),
  no `off` (apagado). Contarlo como `off` hace parecer que el UHD está desactivado cuando en realidad
  no interviene.
* **`/_ape/health` publica `upstreams_down`, que ya es un cero perpetuo** (§7 P1). Mientras no se
  aplique el parche, **no usarlo como señal**; el latido real es
  `Δall_failed/Δintentos` sobre una ventana, o `provider_failures_total` si se aplica P1.

---

## 10 · Límites de este análisis (honestidad)

1. **El diagnóstico se hizo con el breaker ya en producción**; el A/B determinista (§2.2) lo ejecuté
   **yo** con un disparo controlado (1 ventana de 15 s) a las 20:42:57Z — es la única vez que este
   trabajo provocó fallos, y está acotado y documentado. Las 180 peticiones de la campaña previa
   (20:38Z) **no** fallaron porque el disparo de esos minutos era de otro cliente sobre otra clave.
2. **La atribución «primer fallo de una ráfaga sin `407` visible = intento real» es conservadora**:
   sobreestima los intentos reales (y por tanto **subestima** el % fabricado por el breaker). Los
   porcentajes «89,1 % / 83 %» son por tanto **suelos**.
3. **El `407` del panel no está caracterizado por dentro** (no tenemos acceso a su lado). Se sabe que
   es transitorio, que aparece en canales válidos al ~0,6 % y que **no** se reproduce con 6 peticiones
   concurrentes.
4. **El TTL del token es variable** (8,4 s / 14,4 s / >30 s en 3 medidas). Con 3 muestras no se puede
   dar una distribución; el límite útil para decidir una caché es el **mínimo observado (8,4 s)**.
5. **No se ha desplegado nada**: los dos parches de `proposed/` están verificados pero **no aplicados**,
   y el único cambio en producción del que trata este informe es **el del capitán**.
6. El cliente `146.70.86.222` se clasifica como «consumidor externo real» por su huella (UA de
   navegador, `Referer: netflix.com`, refresco ~11 s), **no** por identificación del propietario.

---

## 11 · Verificación independiente (2ª pasada, 2026-10-26 21:24–21:29Z)

Todo lo anterior se re-midió **de cero** con el gateway ya sin breaker (`2dc0fad8…`), sin tocar nada.
Evidencia: [`runs/VERIFY2_20261026T210641Z/`](../../_vps_stage/edge/E11_intermittent/runs/VERIFY2_20261026T210641Z/)
(`samples.jsonl`, `access_log_analysis.txt`, `zap_impact_and_ratio.txt`, `final_evidence.txt`, `sim_composed.log`).

### 11.1 · Campaña controlada: 114 peticiones a 3 canales → 114 × `200`

`e11_sample.py` con `E11_N_HTTPS=102 E11_N_LOOP=12` (mismos canales 3/5/6, round-robin, 21:24:24→21:26:07Z):

| Métrica | `https443` (camino del player) | `loop8088` (sin TLS/443) |
|---|---|---|
| muestras | **102** | **12** |
| estados | **102 × 200** | **12 × 200** |
| TTFB p50 / p95 | **708,4 / 820,6 ms** | 678,3 / 770,3 ms |
| `X-APE-Upstream-Ms` p50 / p95 | 699 / 812 ms | 677 / 769 ms |
| cabeceras `X-APE-*` presentes | 8/8 en las 102 | 8/8 en las 12 |
| breaker armado en `pre`/`post` | **0 de 114** | **0 de 114** |

Contadores durante la campaña: `req` 964 → 1086 (**+122**) y **`all_failed` 133 → 133 (Δ 0)**;
`/_ape/qoe.hosts_down = {}` en las 114 lecturas. `uhd=off` y `uri-rebased=6` en las 114 (media playlists,
como corresponde a `/cdn/`). **Cero fallos en 114 intentos ⇒ el residual no es del gateway.**

### 11.2 · El log completo (2 días, **1.227** peticiones `/cdn/`): antes vs después

Ventana `2026-10-24 16:29:07 → 2026-10-26 21:29:06`, corte en el hotfix `20:49:57Z`:

| Era | n | `200` | fallos | `502` | legacy (`fallos/éxitos`) | **honesto** (`fallos/intentos`) | ventanas ≥5 fallos/15 s |
|---|---|---|---|---|---|---|---|
| **ANTES** (con breaker) | 692 | 468 | **224 (32,4 %)** | **188** | 0,4786 | **0,3237** | **12** |
| **DESPUÉS** (sin breaker) | 535 | 524 | **11 (2,06 %)** | **0** | 0,0210 | **0,0206** | **0** |

Los **11 fallos posteriores son todos sondas deliberadas nuestras**, no tráfico de usuario (enumerados en
`final_evidence.txt` §2): 4 × `403` a `/cdn/127.0.0.1:8088/_ape/health` (prueba SSRF de otra fase),
4 × `404` a `*.ts` (el candado de vídeo, *by design*), 2 × `513` y 1 × `405` de las pruebas de ruta
inválida de E11. **El consumidor externo `146.70.86.222`: 181 peticiones después del hotfix, 181 × `200`,
0 fallos.**

### 11.3 · `error_ratio`: cifras honestas y «skips» del breaker (cierre aritmético)

Contadores del plano a las 21:29Z: `req` = **1099** (éxitos), `all_failed` = **133**,
`hosts_down` = `{}` (la marca `down:` ya no se escribe), `Σ host_down:*` = **22**.

| Lectura | Valor |
|---|---|
| Publicado (`all_failed / req`) | **0,1210** |
| **Honesto** (`fallos / intentos` = 133/1232) | **0,1080** |
| Inflación del publicado sobre el honesto | **+12,1 %** |
| Cota inferior de fallos que **no llegaron al proveedor** | `all_failed − Σ host_down:*` = **≥ 111 de 133 = 83,5 %** |

La cota es **inferior** y por tanto conservadora: `all_failed ≤ Σ host_down:*` sólo puede cumplirse si
algunos fallos no intentaron nada (`S = A − F ≥ A − H`). Es el mismo orden de magnitud que el 83–89 %
medido en §2.3, ahora con dos días de log en vez de una ventana.

### 11.4 · Impacto en reproducción (zaps) — medido sobre el consumidor externo

Sesión de zap = mismo canal con separación ≤ 20 s (el player refresca cada ~11 s):

| Era | peticiones | zaps | con algún fallo | **acaban en error** |
|---|---|---|---|---|
| ANTES (con breaker) | 202 | 40 | 14 (35,0 %) | **7 (17,5 %)** |
| DESPUÉS (sin breaker) | 181 | 8 | 0 | **0 (0 %)** |

Lectura honesta: el «20-28 % de manifiestos» **no** se traducía en 20-28 % de zaps perdidos (el reintento
a veces recuperaba), pero **17,5 % sí acababan en error** y, con el breaker, el reintento del player caía
**dentro** de la misma ventana de 15 s (por eso el canal «volvía solo» a los ~15 s). Sin breaker: 0/8.

---

## 12 · El gateway del **repo** no es el vivo, y **no es desplegable tal cual**

El enunciado pedía comparar el vivo con el del repo. Medido (`_vps_stage/lua/ape_gateway.lua`,
`sha256 b9eb1406…`, **439 líneas** vs vivo `2dc0fad8…`, **267 líneas**):

| Qué | Repo (`b9eb1406`) | Vivo (`2dc0fad8`) |
|---|---|---|
| **Breaker `down:<host>` TTL 15 s** | **SÍ** (L169 `if not (HOSTS and HOSTS:get(dk))`, L178 `HOSTS:set(dk,1,15)`) | **NO** (hotfix) |
| Fusible de suelo (Vía B): `fuse_norm_profile`, `fuse_profile`, `fuse_keys`, `fuse_rewrite`, `fuse_inject`, `fuse_decide` + `X-APE-Floor-Fuse` | **SÍ** (+172 líneas) | **NO** |
| `reason` garantizado en el error | no | sí (sin breaker ya se rellena siempre) |
| Cabeceras `X-APE-Reason`/`X-APE-Attempts` | no | no (es el delta E11, §7 P1) |

**Consecuencia dura:** sustituir el fichero vivo por el del repo **reintroduce el fallo** (el breaker) y
además activa 172 líneas de comportamiento nuevo no medido en producción. La única vía segura es
**aplicar parches sobre los bytes vivos** (como hacen E7 y E11), nunca copiar el fichero del repo.

El hotfix del capitán fue **exactamente 2 líneas** (`live/` → `live/postfix/`, `git diff` en
`runs/VERIFY2_…`: L169 `if not (HOSTS and HOSTS:get(dk)) then` → `if true then`; L178
`HOSTS:set(dk,1,15)` → comentario). Nada más. Por eso es reversible con un `install` del backup.

---

## 13 · Composición con E7 (un solo fichero por destino — obligatorio para E10)

**E7 y E11 tocan los MISMOS dos ficheros** (`ape_gateway.lua`, `ape_obs.lua`) en las mismas líneas.
Comprobado: los deltas de E11 aplican limpio sobre el vivo (`git apply --check` = 0), pero **los parches
de E7 NO aplican encima de los de E11** (conflicto de contexto en el bucle de failover y en
`qoe()`/`health()`). Si E10 aplicara «E7 y luego E11» (o al revés) el segundo `patch` fallaría.

Por eso se entrega **un único artefacto compuesto por fichero**, verificado:

| Artefacto | Base | Contenido |
|---|---|---|
| `proposed/composed/ape_gateway.lua` | `2dc0fad8` (vivo) | hotfix + **E11** (`reason` siempre, `X-APE-Reason`/`-Attempts`, `provider_fail:*`, `attempts`) + **E7** (`meta` por hop, `ngx.ctx.ape_dec` en éxito/fallo/denegado/too_large, `uhd_blocked`) |
| `proposed/composed/ape_obs.lua` | `f477741b` (vivo) | **E7** (fórmula honesta, `attempts`/`fail_total`, `error_ratio_legacy`, ventana de `/_ape/metrics`, contadores publicados) + **E11** (`provider_failures_total`, `host_down_legacy_total`, `legacy_breaker_removed`) |
| `proposed/composed/composed_ape_gateway.delta.patch` | vivo | parche único (aplica con `git apply -p1`) |
| `proposed/composed/composed_ape_obs.delta.patch` | vivo | idem |

Verificación ejecutada (todo reproducible sin tocar el VPS):

| Comprobación | Resultado |
|---|---|
| `luac5.1 -p` (Lua 5.1 = la de LuaJIT) de los dos compuestos | **SYNTAX_OK** |
| `git apply --check -p1` de los dos parches contra los bytes **vivos** | **exit 0** |
| aplicar el parche y comparar con el compuesto byte a byte (`core.autocrlf=false`) | **idéntico** |
| simulación offline de **4 versiones** (PREFIX/HOTFIX/PROPOSED/**COMPOSED**), `lua5.1 -` por stdin | **RESULT=OK (11/11)** |

La simulación prueba que el compuesto **conserva las dos cosas**: sin breaker e intentando siempre,
`reason` + `X-APE-Reason` + `attempts` en el error (E11), **y** `ngx.ctx.ape_dec` con
`outcome/ms/hops/kind/uris/uhd` en éxito y en fallo (E7), **con las mismas 8 cabeceras `X-APE-*`** en el
camino feliz que el hotfix. Guion: `scripts/e11_sim_composed.mjs`.

**Orden recomendado para E10:** un solo paso, aplicando los dos parches compuestos (`git apply -p1`) sobre
el gateway y `ape_obs.lua` vivos, `luac5.1 -p`, `nginx -t`, `reload`, y entonces `/_ape/metrics` (E7) pasa
a mostrar `errors.fast_fail=0`, `errors.upstream_fail` y `provider_failures_total` — que es la señal de
que la fase quedó cerrada y observable. **No** aplicar el `proposed/` de E11 y el de E7 por separado.
## 14 · Decisiones firmadas (2ª pasada) — las 4 preguntas del capitán

> Cierre de E11 tras verificar el trabajo previo **sin rehacerlo**: el diagnóstico de `lua-cdn` se adopta
> y se firma con medición propia (campaña de 114 peticiones + log de 2 días). **Cero cambios en
> producción**; producción en `2dc0fad8…` (breaker fuera) y `default 49c162a8…` (h2 + 3 bloques de
> seguridad), `MainPID 2001835`, `NRestarts 0`.

### 13.1 · ¿Está el diagnóstico de `509`/`513`? — **SÍ, y mi log lo confirma**

| Código | Qué es (medido) | ¿Aparece en 1.227 peticiones `/cdn/`? | ¿Retryable? |
|---|---|---|---|
| **`509`** | **token del CDN caducado** (no del panel). El gateway acuña un token nuevo por petición (302 → 200) y **nunca reutiliza** uno viejo ⇒ por el gateway **no puede** salir un 509 | **0 ocurrencias** | no aplica |
| **`513`** | credencial/ruta **no autorizada** (determinista). Medido con `live/0000/0000/3.m3u8` y `live/x/y/1.m3u8` | **6** — todas sondas nuestras (`0000/0000`, `x/y`) | **NO** (reintentar es inútil) |
| `405` | id/ruta no es un directo válido | 3 — sondas (`999999999`, `x.ts` bajo `/cdn/`) | **NO** |
| `407` | rechazo **transitorio** del panel | **5** (todas antes del hotfix) | quizá |
| `461` | huella de cliente rechazada (UA `curl`) | 0 en el gateway (fuerza `UA: Mozilla/5.0`); sí en sondas sin UA | no aplica |

**Firma:** el diagnóstico de `509`/`513` **está** (§3), es correcto y con estos datos queda confirmado en
una muestra 2,4× mayor. `509` era un fantasma del enunciado: existe en el CDN, no en nuestro camino.

### 13.2 · `host_down:*` — **telemetría muerta: se marca como histórica, no se borra**

Medición (21:29Z): `Σ host_down:* = 22` = `line.tivi-ott.net 13` + `127.0.0.1:8088 7` + `169.254.169.254 1`
+ `10.0.0.1 1`. **No crece desde el hotfix** (`Δ = 0` en 122 intentos de mi campaña y en las 535
peticiones del log) porque el `HOSTS:set(dk,1,15)` ya no se ejecuta. El capitán cita **11**; a las 21:29Z
valía **13** — el contador solo crece, la diferencia es la hora de lectura, no una regresión.

| Decisión | Detalle |
|---|---|
| **`upstreams_down` en `/ape/health`** | Se **conserva** por compatibilidad (watchdog y smoke), pero **vale 0 siempre** ⇒ se publica con `legacy_breaker_removed: true` al lado para que nadie lo lea como salud. **No** se borra: romper la forma del JSON del watchdog por un campo muerto es peor que marcarlo. |
| **Contador vivo** | `provider_failures_total` (suma de `provider_fail:*`, que es lo que el gateway cuenta desde el delta E11) — **ese** es el dato de diagnóstico. |
| **Histórico** | `host_down_legacy_total` se publica aparte, rotulado. Si en el futuro se quiere limpiar del todo, es un cambio de **forma** del contrato de `/ape/qoe`: exige ventana propia y aviso al watchdog. **Hoy: no.** |

Implementado y verificado en `proposed/composed/ape_obs.lua` (test funcional en
`runs/VERIFY2_…/obs_composed_selftest.log`: publica `provider_failures_total:14`,
`host_down_legacy_total:20`, `legacy_breaker_removed:true`, `error_ratio:0.108` honesto y
`error_ratio_legacy:0.121`).

### 13.3 · Retry acotado (1 intento, mismo host, ≤1 s) — **NO hoy; con disparador numérico**

Los números de mi pasada, sobre tráfico real y canales válidos:

| Clase | Frecuencia medida (post-hotfix) | ¿1 retry lo arregla? | Coste |
|---|---|---|---|
| fallos en canales válidos del consumidor externo | **0 / 181** | — | — |
| `502` en el log | **0 / 535** | — | — |
| sondas deterministas (`404`/`405`/`513`, `403` SSRF) | 11 / 535 (**2,06 %**) | **NO** | +1 fetch (~350 ms) para nada |
| `407` transitorio del panel | **5** en toda la muestra, **0** post-hotfix (≈0,6–0,7 % pre) | tal vez | +350 ms en ese ~0,7 % |

**Decisión: no se añade retry genérico.** Justificación numérica, no de estilo:
1. El fallo que rompía la reproducción **no era del proveedor** sino del breaker (83,5 % de los fallos no
   llegaban al proveedor); retirarlo llevó los zaps perdidos del **17,5 % al 0 %** sin tocar el gateway
   caliente ⇒ **ya está resuelto por la vía correcta**.
2. El residual post-hotfix en canales válidos es **0**; el 2,06 % restante del log son **sondas
   deterministas** donde un retry **empeora** (duplica carga y latencia de algo que nunca funcionará).
3. Un retry en `content_by_lua` cuesta un fetch extra ≈ **350 ms** (primer hop medido 293–413 ms) y suma
   peticiones al proveedor justo cuando el panel está rechazando.

**Disparador explícito para reconsiderarlo** (medible con E7, sin desplegar nada): si en una ventana de
30 min `/_ape/metrics` muestra `errors.upstream_fail / errors.attempts > 1 %` **con `X-APE-Reason` ∈
{`http_407`, `http_408`, `http_429`, `http_5xx`, `capture_failed`} en canales válidos**, entonces sí —
con esta especificación exacta: **1 solo intento**, mismo host, `ngx.sleep(0.10–0.15)` (cede el worker, no
bloquea), **jamás** para `403/404/405/513`, **jamás** cacheando el fallo (`down:` no vuelve), y el error
publicando siempre `X-APE-Attempts`. Queda escrita, no aplicada.

### 13.4 · UA obligatoria en cualquier sonda — **regla del arnés**

`curl` (UA por defecto, `Accept: */*`) ⇒ proveedor **461**; `Host` + `User-Agent: Mozilla/5.0` (lo que
envía `/_ape/_fetch`, `proxy_pass_request_headers off`) ⇒ **302**. Todos los scripts de esta carpeta ya lo
hacen (`e11_sample.py`, `e11_provider_codes.py`, `probe_remote.sh` de E7). **Sin esa cabecera se mide un
proveedor caído que está sano.** Añadido también como guarda: si un arnés futuro mide 461/`000` en >50 %
de una muestra, el veredicto es **«sonda mal formada»**, no «proveedor caído».

### 13.5 · Nota de higiene de la 1ª pasada

En `/tmp` del VPS quedaron 3 ficheros de trabajo de la 1ª pasada (`/tmp/e11_a.txt` 643 B,
`/tmp/e11_b.txt` y `/tmp/e11_c.txt` vacíos, del A/B de las 20:34–20:35Z). No afectan a producción
(`/tmp`, sin permisos especiales, se purga al reiniciar) y **mi pasada no ha escrito nada en el VPS**; se
dejan como están para no tocar nada que no sea mío.
## 15 · Anexo · ficheros de esta fase

```
_vps_stage/edge/E11_intermittent/
├── README.md                                  mapa y cómo se re-ejecuta todo
├── live/ape_gateway.lua                       66a20017 (con breaker) · copia byte-exacta
├── live/ape_obs.lua                           f477741b (métrica rota) · copia byte-exacta
├── live/postfix/ape_gateway.lua               2dc0fad8 (hotfix del capitán, verificado)
├── proposed/ape_gateway.lua                   + P1 (reason/X-APE/attempts/provider_fail)
├── proposed/ape_obs.lua                       + P1 (métrica honesta + telemetría muerta retirada)
├── proposed/ape_gateway.delta.patch           diff aplicable sobre el VIVO (git apply --check = 0)
├── proposed/ape_obs.delta.patch               idem
├── proposed/composed/ape_gateway.lua           E11 **+ E7** (un solo fichero para E10)   ← §13
├── proposed/composed/ape_obs.lua               E7 + E11 (métrica + ventana + provider_failures)
├── proposed/composed/composed_*.delta.patch    parches ÚNICOS contra los bytes vivos (aplican)
├── scripts/e11_sim_composed.mjs                 simulación de 4 versiones (11/11 PASS)    ← §13
├── proposed/historical/…breaker-removal…      propuesta E11 de quitar el breaker (equivalente al hotfix)
├── scripts/…                                  6 scripts reproducibles (solo GET, sin escrituras)
└── runs/
    ├── 20261026T203828Z/                      ANTES: samples.jsonl · breaker_ab.jsonl ·
    │                                          access443_cdn.log · access8088_cdn.log · E11_evidence.json
    ├── POSTFIX_20261026T205125Z/              DESPUÉS: samples.jsonl · provider_codes.jsonl ·
    │                                          token_ttl.jsonl · E11_evidence.json
    └── VERIFY2_20261026T210641Z/              2ª PASADA (§11): samples.jsonl (114×200) ·
                                               access_log_analysis.txt · zap_impact_and_ratio.txt ·
                                               final_evidence.txt · sim_composed.log · pre_state.log
```

**Comandos reproducibles** (desde la raíz del repo):

```bash
node _vps_stage/edge/E11_intermittent/scripts/e11_analyze.mjs \
     _vps_stage/edge/E11_intermittent/runs/20261026T203828Z
node _vps_stage/edge/E11_intermittent/scripts/e11_analyze.mjs \
     _vps_stage/edge/E11_intermittent/runs/POSTFIX_20261026T205125Z
node _vps_stage/edge/E11_intermittent/scripts/e11_sim_breaker.mjs \
     _vps_stage/edge/E11_intermittent          # 11/11 PASS, no toca el VPS (lua5.1 por stdin)
node _vps_stage/edge/E11_intermittent/scripts/e11_sim_composed.mjs \
     _vps_stage/edge/E11_intermittent          # 4 versiones, 11/11 PASS (COMPOSED incluido)

# 2ª pasada (campaña de 114 muestras; escribe SOLO en runs/<stamp>/ del repo)
ssh -o BatchMode=yes root@178.156.147.234 \
    'E11_N_HTTPS=102 E11_N_LOOP=12 python3 -' \
    < _vps_stage/edge/E11_intermittent/scripts/e11_sample.py > runs/<stamp>/samples.jsonl
```

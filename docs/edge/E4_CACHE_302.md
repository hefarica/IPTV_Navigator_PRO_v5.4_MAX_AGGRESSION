# E4 · Caché del destino del 302 — medida, modelo y veredicto

**Estado:** fase **medida y modelada** · prototipo **verificado offline** · **NO desplegado**.
**Ventana de medidas:** 2026-10-26 21:05Z → 21:16Z (UTC).
**Escrituras en producción:** **ninguna** (solo `GET`, lectura de log/config y una copia temporal del
`.conf` en `/tmp` para inspeccionarla, borrada en el acto). **Ningún reload.** Gateway vivo intacto
(`sha256 2dc0fad8…`).
**Material reproducible:** [`_vps_stage/edge/E4_302cache/`](../../_vps_stage/edge/E4_302cache/).

---

## 0 · Veredicto

**La fase tal como está especificada (`ape_hops` con TTL 30–60 s, 708 ms → <350 ms) está REFUTADA por
medición.** Dos razones independientes:

1. **`<350 ms` es inalcanzable aunque la caché acierte el 100 %**: saltarse el `302` elimina *solo* el
   primer salto. El suelo es el segundo salto medido: **p50 396,4 ms / p95 473,6 ms**. No hay diseño
   que baje de ahí sin tocar el CDN.
2. **Con TTL 30–60 s la latencia EMPEORA**: el token del CDN vive **3,5–6,5 s** (6/6 ensayos, hoy),
   así que en un TTL largo casi todos los aciertos llevan un token muerto ⇒ el gateway paga el hop
   fallido **y** la cadena completa. Medido en el modelo: **+20,4 % de latencia y 59,2 % de las
   peticiones exponiendo un `509`**. Es decir, la caché reintroduciría el fallo que E11 acaba de
   eliminar.

**Lo que SÍ se puede conseguir, medido:** con **TTL 3 s + revalidación por status** (si el destino
cacheado devuelve `509`, se descarta y se rehace la cadena; el player nunca ve el `509`):
**aciertos útiles 20,1 % ⇒ ahorro esperado 73,4 ms (−9,6 %)**. Es real, es pequeño y es seguro.
**El techo del primer salto es −40 % (−42,7 % del p50)**, pero solo con un token siempre fresco
(«bomba de tokens», §6), que exige tráfico de fondo al proveedor y una decisión del dueño.

| Diseño | TTL | Aciertos | Token vivo en el acierto | Latencia esperada | Ahorro | `509` al cliente |
|---|---|---|---|---|---|---|
| Sin caché (hoy) | — | — | — | **766,1 ms** (media) / 692 ms (p50) | — | 0 % |
| **Prototipo E4** | **3 s** | 20,1 % | 98,9 % | **692,7 ms** | **−73,4 ms (−9,6 %)** | **0 %** |
| Prototipo E4 | 5 s | 20,7 % | 98,4 % | 691,2 ms | −74,9 ms (−9,8 %) | 0,3 % |
| Especificado | 15 s | 76,6 % | 26,6 % | 910,6 ms | **+144,5 ms (PEOR)** | **56,2 %** |
| Especificado | 30 s | 79,6 % | 25,6 % | 922,4 ms | **+156,3 ms (PEOR)** | **59,2 %** |
| Especificado | 60 s | 80,2 % | 25,4 % | 924,7 ms | **+158,6 ms (PEOR)** | **59,8 %** |

---

## 1 · Por qué el token lo cambia todo

El `302` del proveedor apunta a `http://<cdn>/live/play/<TOKEN>/<id>`, y el **token es único por
petición**: 5 peticiones seguidas → 5 tokens distintos (80 caracteres). No existe un destino estable
que cachear.

Y **caduca muy rápido, con vida variable**:

| Ventana | Ensayos | Último `200` | Primer `509` |
|---|---|---|---|
| 20:58–21:00Z (E11) | 3 | 6,4 / 12,5 / 30,5 s | **8,4 / 14,4 / no caducó en 30 s** |
| 21:09–21:12Z (E4) | 6 | 3,5 / 4,4 / 4,5 / 4,5 / 5,4 / 5,4 s | **4,5 / 5,4 / 5,4 / 5,4 / 6,5 / 6,5 s** |

⇒ **vida observada: 3,5 s … >30 s.** El límite seguro para cachear es el **mínimo** (3,5 s), no la
media. (El mismo token se puede consumir varias veces: en los ensayos la misma URL devolvió `200` en
2,4 / 3,5 / 4,5 s y luego `509`; **no es de un solo uso**, es caducidad por edad.)

**Y el hueco real entre peticiones de la misma clave es de 12 s** (p50; el player refresca el
manifiesto de directo cada ~11–13 s):

| TTL | 2 s | 3 s | 5 s | 8 s | 10 s | **15 s** | 30 s | 60 s |
|---|---|---|---|---|---|---|---|---|
| Aciertos (clientes externos reales, 333 req) | 17,4 % | 20,1 % | 20,7 % | 21,3 % | 21,6 % | **76,6 %** | 79,6 % | 80,2 % |

Ahí está el problema de diseño: **la tasa de acierto tiene un acantilado justo entre 10 y 15 s**, y el
token muere a los 3,5–6,5 s. No se puede tener las dos cosas: o el TTL es corto (≈20 % de acierto,
pero con token vivo) o es largo (≈80 % de acierto, pero con token muerto). **La tasa de acierto ÚTIL
se satura en ~20,4 % para cualquier TTL ≥ 4 s** — exactamente los aciertos de ráfaga (dos peticiones
en el mismo segundo, reintentos, dos clientes zapeando a la vez).

---

## 2 · El split de saltos (lo que se puede ahorrar y su techo)

Medido en vivo, 30 pares secuenciales (proveedor → CDN) repartidos entre los canales 3/5/6, misma
ventana para que el ruido del proveedor afecte a ambos:

| Salto | p50 | p95 | media | rango |
|---|---|---|---|---|
| **hop1 · proveedor (`302`)** | **295,6 ms** | 729,7 ms | 373,4 ms | 282,8 – 861,5 ms |
| **hop2 · CDN (playlist final)** | **396,4 ms** | 473,6 ms | 392,7 ms | 339,5 – 485,4 ms |
| camino completo (secuencial) | 731,3 ms | 1.130,6 ms | 766,2 ms | — |

* **hop1 = 42,7 % del p50** (48,7 % de la media; la media la infla la cola del proveedor). Coincide
  con la re-etiqueta de t7: **«≈40 % menos en el primer hop»** por acierto.
* **El suelo es hop2 = 396,4 ms p50 / 473,6 ms p95.** `<350 ms` queda por debajo del suelo medido ⇒
  **imposible por esta vía**.
* Coherencia con el resto de medidas: `X-APE-Upstream-Ms` p50 de la campaña de 180 peticiones =
  **707,7 ms**, y hop1+hop2 p50 = 731,3 ms (misma magnitud; la diferencia es el muestreo).

---

## 3 · Modelo por petición (con las dos curvas medidas)

Coste esperado con `h` = P(hueco ≤ TTL) y `a` = P(token vivo a la edad del acierto), medias de salto:

* **Ingenua** (sirve el acierto siempre): `a·h·hop2 + (1−a)·h·(hop2+hop1+hop2) + (1−h)·(hop1+hop2)`
  — pero un acierto con token muerto **devuelve `509` al player**: es un fallo, no una latencia.
* **Con revalidación por status** (la del prototipo): mismo coste, pero el `509` **se queda dentro**
  y el player recibe el manifiesto.

| TTL | Aciertos | Token vivo en el acierto | **Útil** | Perdido | Latencia esperada | Ahorro | `509` al cliente |
|---|---|---|---|---|---|---|---|
| 2 s | 17,4 % | 100 % | **17,4 %** | 0 % | 701,1 ms | −65,0 ms (−8,5 %) | 0 % |
| **3 s** | 20,1 % | 98,9 % | **19,9 %** | 0,2 % | **692,7 ms** | **−73,4 ms (−9,6 %)** | **0,2 %** |
| 4 s | 20,7 % | 98,4 % | 20,4 % | 0,3 % | 691,2 ms | −74,9 ms (−9,8 %) | 0,3 % |
| 5 s | 20,7 % | 98,4 % | 20,4 % | 0,3 % | 691,2 ms | −74,9 ms (−9,8 %) | 0,3 % |
| 10 s | 21,6 % | 94,3 % | 20,4 % | 1,2 % | 694,8 ms | −71,3 ms (−9,3 %) | 1,2 % |
| **15 s** | 76,6 % | **26,6 %** | 20,4 % | **56,2 %** | **910,6 ms** | **+144,5 ms (−18,9 %)** | **56,2 %** |
| **30 s** | 79,6 % | 25,6 % | 20,4 % | 59,2 % | 922,4 ms | **+156,3 ms (−20,4 %)** | **59,2 %** |
| **60 s** | 80,2 % | 25,4 % | 20,4 % | 59,8 % | 924,7 ms | **+158,6 ms (−20,7 %)** | **59,8 %** |

Lectura: a partir de 4 s **no se gana nada más** (los aciertos extra son todos con token muerto), y a
partir de ~12 s **se pierde**. El óptimo está en **3–4 s**.

---

## 4 · El prototipo (verificado offline, **no desplegado**)

[`proposed/ape_gateway.hopcache.patch`](../../_vps_stage/edge/E4_302cache/proposed/ape_gateway.hopcache.patch) ·
[`proposed/50-ape-meta-plane.hopcache.patch`](../../_vps_stage/edge/E4_302cache/proposed/50-ape-meta-plane.hopcache.patch)

```lua
local HOPC = ngx.shared.ape_hops             -- nil si falta la directiva ⇒ caché OFF (seguro)
local HOP_TTL = math.max(1, math.min(10, tonumber((FLAGS and FLAGS:get("hop_ttl")) or "") or 3))
-- clave = host + "\n" + path + "\n" + query   (completa, sin credenciales en el nombre)
-- hit  → 1 subrequest al CDN final;  no-2xx (509) → HOPC:delete(ck) y cadena normal
-- miss → cadena normal y, tras cada 302 validado (anti-SSRF ya aplicado), HOPC:set(..., HOP_TTL)
```

Propiedades (todas comprobadas y ninguna teórica):

* **Nunca cambia lo que ve el player si el token está muerto**: el `509` se consume dentro;
  `X-APE-Hop-Cache: stale:<ttl>s` lo delata y `qoe.hop_stale_509` lo cuenta.
* **Re-arma la caché en el propio fallback** (el `set` está en el bucle de redirects, que también
  corre al reacuñar) ⇒ el acierto siguiente vuelve a costar 1 subrequest.
* **TTL sintonizable en caliente** con el flag `hop_ttl` (1–10 s) por `/_ape/flags?k=hop_ttl&v=4`;
  **observable** en cada respuesta (`X-APE-Hop-Cache: hit|miss|stale:<ttl>s`) y en los contadores
  `hop_hit` / `hop_stale_<status>` / `redirects`.
* **Clave completa `host+path+query`** (como pedía la corrección): dos canales del mismo host no
  comparten entrada; y el anti-SSRF se aplica **al acuñar** (el destino ya pasó
  `is_private_host` + `is_ip_literal`/allowlist) y se re-valida al servir (`safe_host`/`safe_path`).
* **Si `ape_hops` no existe, la caché queda desactivada** y el gateway se comporta exactamente como
  hoy (degradación limpia: primero se despliega el Lua, luego la directiva, o al revés).

Verificación offline (`scripts/e4_sim_cache.mjs`, LuaJIT real vía `lua5.1 -` por `stdin`, con un CDN
guionizado que caduca el token):

```
VIVO       #1 miss    200  subrequests=2  hop_cache=nil
VIVO       #2 hit     200  subrequests=2  hop_cache=nil
VIVO       #3 stale   509  subrequests=2  hop_cache=nil     ← sin revalidación, el 509 LLEGA al cliente
PROTOTIPO  #1 miss    200  subrequests=2  hop_cache=miss:3s
PROTOTIPO  #2 hit     200  subrequests=1  hop_cache=hit:3s   ← se salta el 302 (−295 ms)
PROTOTIPO  #3 stale   200  subrequests=3  hop_cache=stale:3s ← 509 absorbido, re-acuña
PROTOTIPO  #4 hit     200  subrequests=1  hop_cache=hit:3s   ← el fallback re-armó la caché
RESULT=OK (14/14)
```

**Validaciones del parche:** `git apply --check` = 0 en ambos, el fichero aplicado **reproduce el
propuesto byte a byte**, `lua5.1 loadstring` = `SYNTAX_OK`. La directiva `lua_shared_dict ape_hops 10m`
es **aditiva** y no se puede validar con `nginx -t` de forma aislada (un fragmento no es un `.conf`
completo); el gate real es `nginx -t` con la copia instalada, antes del reload.

---

## 4-bis · `Cache-Control` del proveedor: la caché es legítima (y qué NO se puede cachear)

Cabeceras reales capturadas en la misma ventana:

```
PROVEEDOR  302  Cache-Control: public, must-revalidate, proxy-revalidate   ·  Pragma: public
CDN        200  Cache-Control: no-cache, no-store, must-revalidate         ·  Expires: 0
```

* El **redirect SÍ es cacheable** según el propio proveedor (`public`) y pide revalidación — que es
  exactamente lo que hace el prototipo (revalidación **por status**: `509` ⇒ descarta y reacuña).
* El **manifiesto NO es cacheable** (`no-store`). El prototipo **nunca almacena el cuerpo** de la
  playlist: solo guarda a qué URL ir, y **vuelve a pedir el manifiesto al CDN en cada acierto**.
  `Cache-Control: no-store` del manifiesto queda respetado al 100 %.
* ⇒ **Aviso temprano para E5 (micro-caché del manifiesto):** el CDN marca **todas** las playlists de
  directo con `no-store` + `Expires: 0`. Una micro-caché del cuerpo iría **contra la cabecera del
  origen**; si se quisiera hacer, tendría que ser con una justificación explícita del dueño y una
  ventana muy corta, no por defecto.

---

## 5 · Re-etiquetado de la meta (lo que se debe prometer)

| Enunciado original | Realidad medida |
|---|---|
| «708 ms → **<350 ms**» | **Refutado.** Suelo = hop2 = **396,4 ms p50** (473,6 p95). |
| «caché del destino 302, TTL 30–60 s» | **Refutado y contraproducente.** TTL 30–60 s ⇒ **+20 % de latencia y ~59 % de `509`**. |
| «la mejora real de latencia» | Cierto pero acotada: **−40 % del primer salto por acierto**; con la token-life real, **−9,6 % del total** (≈73 ms) y **−43 %** si se resuelve el token (§6). |
| «TTL observable» | Entregado: `X-APE-Hop-Cache: hit|miss|stale:<ttl>s` + `hop_hit`/`hop_stale_<code>`. |

**Propuesta de etiqueta:** «**≈40 % menos en el primer salto; ≈10 % del total con el token tal como
está hoy** (3,5–6,5 s), verificado con el mismo arnés antes/después».

---

## 6 · La única vía que alcanza el techo: «bomba de tokens» (decisión del dueño, NO implementada)

El límite no es la caché: es que el token no sobrevive al intervalo del player. Si el token se
**pre-acuña en segundo plano** (p. ej. cada 2 s para las claves «calientes») y la petición lo consume
con edad ≤ 2 s, entonces el token está vivo **6/6 ensayos (100 %)** y la petición paga **solo hop2**:

* latencia del cliente ≈ **396 ms p50** (vs 692 ms) ⇒ **−43 %** — coincide con la re-etiqueta de t7;
* coste: **~0,5 peticiones/s al proveedor por clave caliente** (1 mint cada 2 s) + un `init_worker`
  con timer y una lista de claves calientes (observadas en los últimos segundos);
* riesgos a medir antes: tolerancia del panel a 0,5 req/s sostenidas (mi prueba de 6 concurrentes no
  mostró castigo, pero no es lo mismo que caudal sostenido) y que un `407` del panel no se propague;
* **no se implementa aquí**: implica tráfico de fondo nuevo y un timer en producción, fuera del marco
  «reversible y mínimo» de esta fase. Queda como decisión explícita del dueño.

---

## 7 · Límites de este informe

1. **La vida del token se midió dos veces con resultados distintos** (8,4–30+ s a las 20:58Z;
   3,5–6,5 s a las 21:09Z). Con 9 ensayos en total **no hay distribución**, solo cotas. El modelo usa
   la curva medida a las 21:09Z (la más reciente y la más pesimista ⇒ **el ahorro está
   subestimado** si el token suele vivir más).
2. El **hueco entre peticiones** sale del log real de *un* día y *dos* clientes externos (333
   peticiones, 45 claves). Con más audiencia, los aciertos por «otro cliente mirando el mismo canal»
   subirían (la caché es global) — no medido aquí.
3. El **modelo es determinista sobre medias**; no modela la cola del proveedor (p95 729 ms), que
   castiga más a los *misses* que a los *hits* ⇒ otra razón por la que el ahorro real puede ser mayor.
4. No se ha desplegado nada y **no se ha recargado nginx**; el gateway vivo y `ape_obs.lua` siguen
   byte a byte como los dejó el capitán.

---

## 8 · Ficheros

```
_vps_stage/edge/E4_302cache/
├── README.md                                    mapa + cómo re-ejecutar
├── live/ape_gateway.lua                         2dc0fad8 (vivo, sin caché) · copia byte-exacta
├── proposed/ape_gateway.lua                     + caché hop (TTL 3 s + revalidación por status)
├── proposed/50-ape-meta-plane.conf              + `lua_shared_dict ape_hops 10m;`
├── proposed/ape_gateway.hopcache.patch          diff aplicable sobre el vivo (--check = 0)
├── proposed/50-ape-meta-plane.hopcache.patch    diff aditivo de la directiva
├── scripts/e4_measure.py                        split de saltos (30 pares) + vida del token (6 ensayos)
├── scripts/e4_hitrate.mjs                       tasa de acierto alcanzable desde el log real
├── scripts/e4_model.mjs                         modelo de las dos variantes sobre lo medido
├── scripts/e4_sim_cache.mjs                     simulación offline VIVO vs PROTOTIPO (14/14)
└── runs/20261026T210638Z/                       access443_cdn.log · measure.jsonl · sim_cache.txt
```

```bash
node _vps_stage/edge/E4_302cache/scripts/e4_hitrate.mjs <log>        # acantilado del TTL
node _vps_stage/edge/E4_302cache/scripts/e4_model.mjs   <log> <measure.jsonl>
node _vps_stage/edge/E4_302cache/scripts/e4_sim_cache.mjs _vps_stage/edge/E4_302cache
ssh root@<vps> 'python3 -' < _vps_stage/edge/E4_302cache/scripts/e4_measure.py   # solo GET
```

> ⚠️ Cualquier sonda al proveedor debe enviar **`Host` + `User-Agent: Mozilla/5.0` y NADA de
> `Accept`**: con `Accept: */*` (el defecto de `curl`) el proveedor contesta **`461`** y se mide un
> falso «caído».

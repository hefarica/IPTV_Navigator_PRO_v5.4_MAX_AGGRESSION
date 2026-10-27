# EDGE EGRESS / RESOLVER — documento de decisión

**Estado: VIGENTE.** Si vas a tocar `ape_gateway.lua`, `ape_rebase_lib.lua` o cualquier lógica de egress del edge, **lee esto entero primero**.

> Este documento está **pinneado por SHA-256** en `_vps_stage/tests/edge_doctrine_assert.js`. Si cambia el gateway sin actualizar el pin de aquí, **el guard falla**. No es burocracia: es que el edge ya se rompió una vez por tocar el egress sin entenderlo.

---

## 1. La decisión, en una frase

**El `/cdn/` crudo NO funciona para los hosts que exigen egress/auth del proveedor (407). Esos hosts deben ir por el RESOLVER**, que aporta el `srv`/`ctx` que el edge no tiene.

---

## 2. La evidencia medida

### 2.1 `/cdn/` crudo → **407 persistente**

| Dato | Valor |
|---|---|
| Canales probados | **3281** y **698** |
| Código | **407** (Proxy Authentication Required) |
| Cuerpo del gateway | `reason: http_407`, **`all_upstreams_failed`** |
| ¿Depende del User-Agent? | **No** — independiente de UA |
| Latencia | **0,29 s** |
| ¿Reintentos? | **persistente**: no es un fallo intermitente |

**Interpretación**: el proveedor **exige egress/auth**. Un 407 con `all_upstreams_failed` significa que el edge **agotó sus orígenes** sin conseguir autenticarse. **No es un problema de red ni de método**: es que **al edge le falta la credencial de egress**.

### 2.2 Resolver → **200**

| Dato | Valor |
|---|---|
| Canales | **3281** y **698** (los mismos que fallan por `/cdn/`) |
| Código | **200** |
| Latencia | **0,21–0,23 s** |
| Tamaño | **8,6 KB** |
| Contenido | **`ape-profile`** y **`video-track`** presentes |

**Interpretación**: el resolver **sí autentica**. Aporta en la propia URL (`srv`, `ctx`, `sid`) lo que el `/cdn/` no tiene.

### 2.3 La forma del resolver (extraída del catálogo, no inventada)

```
https://iptv-ape.duckdns.org/resolve_quality.php
  ?ch=1&p=P3&mode=adaptive&list=<lista>
  &bw=50500000&buf=37500
  &origin=<host>&sid=1
  &srv=<base64>&ctx=<base64>
```

`srv` y `ctx` van en **base64** y son los que llevan el egress. **Sin ellos, el 407 es inevitable.**

---

## 3. La decisión

| Camino | Cuándo | Por qué |
|---|---|---|
| **Resolver** (`resolve_quality.php?…&srv=…&ctx=…`) | **hosts que exigen egress/auth** (los que dan 407 por `/cdn/`) | es el **único** que autentica contra el proveedor |
| `/cdn/` crudo | hosts **sin** exigencia de egress | más barato (sin PHP), pero **solo si el proveedor no lo rechaza** |

**Regla**: **si un host devuelve 407 por `/cdn/`, NO se insiste por `/cdn/`.** Se enruta por el resolver. Insistir es gastar peticiones contra un muro.

**Lo que NO se hace**: inventar un `srv`/`ctx` en el edge. Ese valor lo produce el resolver a partir de datos reales; fabricarlo daría un 407 igual pero con apariencia de haberlo intentado.

---

## 4. Comandos reproducibles

```bash
# 1 · /cdn/ crudo → se espera 407 en los hosts que exigen egress
curl -s -o /dev/null -w '%{http_code} %{time_starttransfer}\n' --max-time 10 \
  'https://iptv-ape.duckdns.org/cdn/<host>/live/<user>/<pass>/3281.m3u8'

# 2 · el MISMO canal por el resolver → se espera 200
curl -s -o /dev/null -w '%{http_code} %{time_starttransfer} %{size_download}\n' --max-time 15 \
  'https://iptv-ape.duckdns.org/resolve_quality.php?ch=1&p=P3&mode=adaptive&list=<lista>&bw=50500000&buf=37500&origin=<host>&sid=1&srv=<b64>&ctx=<b64>'

# 3 · ¿el cuerpo del resolver trae la declaración?
curl -s --max-time 15 '<url del resolver>' | head -c 300 | grep -E 'ape-profile|video-track'
```

**Regla de medición**: **1 conexión a la vez, 1,5 s de pausa**. Medir en paralelo invalida la muestra.

---

## 5. Pin de integridad

| Fichero | SHA-256 |
|---|---|
| `_vps_stage/lua/ape_gateway.lua` | `1b71d90e02cd05297f167b5390655832b29acee47e50c31bb0c632c275eafe2b` |
| `_vps_stage/lua/ape_rebase_lib.lua` | `a95bf84500c2d0754d7c770482cb92ff164aed842255a7634dab0f6ed5a4594d` |

**Si tocas esos ficheros**: actualiza el SHA aquí **y** explica qué cambió en el egress. El guard `_vps_stage/tests/edge_doctrine_assert.js` falla si no lo haces.

---

## 6. Qué NO está demostrado (honestidad)

- **El cuerpo exacto del 407** (`reason: http_407`, `all_upstreams_failed`) lo midió el capitán, no yo. Lo cito como contexto, **no como medición propia**.
- **La tasa global de fallo del edge** sigue **[UNKNOWN]**: mis mediciones de `/cdn/` desde esta máquina devolvían todo en ~1 ms ⇒ **no llegaban al VPS** (t99 §5 y §10). **La salud real del edge exige el `access.log` del VPS** (ver §7).
- **El `srv`/`ctx` no lo he descifrado**: sé que son base64 y que sin ellos hay 407; **no afirmo qué contienen**.

---

## 7. Recuento del log 24 h — **[UNKNOWN]**

El contrato pedía contar 200/4xx/5xx de `/cdn/` en las últimas 24 h. **No lo he hecho: no tengo acceso de lectura a los logs del VPS.**

**Comando exacto para hacerlo** (ejecutar en el VPS, solo lectura):

```bash
# Distribución de códigos en /cdn/ durante 24 h
sudo grep '/cdn/' /var/log/nginx/access.log \
  | awk '{print $9}' | sort | uniq -c | sort -rn

# Solo los 407, con host destino
sudo grep '/cdn/' /var/log/nginx/access.log | awk '$9==407 {print $7}' \
  | sed 's#^/cdn/##; s#/.*##' | sort | uniq -c | sort -rn | head -20
```

Sin eso, cualquier tasa que publique **sería una muestra**, no la salud real.

---

## 8. Fecha y origen

- **Documento creado**: 2026-10-26 (sesión t100).
- **Evidencia de base**: mediciones de t99 + las del capitán sobre 3281 y 698.
- **Decisión**: el edge usa el egress (`srv`) **del resolver** para los hosts que exigen auth.

---

## 9. CORRECCIÓN — «407» puede ser CANAL MUERTO, no egress

**La regla de §3 era demasiado amplia.** Decía «407 ⇒ ir al resolver». **Es falso en un caso medido.**

### 9.1 La prueba (mismo host, mismo momento)

| Canal | Ruta | Resultado |
|---|---|---|
| **HD** `tvg-id=177683` | por `/cdn/` (mismo host `line.tivi-ott.net`) | **200** · 1,16 s |
| **FHD** `tvg-id=177690` | por `/cdn/` (misma ruta base) | **407** |
| **FHD** `177690` | **directo al proveedor** (HTTP) | **461** |

Cuerpo del 407 de `177690`:
```json
{"ok":false,"tried":["line.tivi-ott.net"],"reason":"http_407",
 "error":"all_upstreams_failed","ms":282,
 "path":"/live/3JHFTC/U56BDP/177690.m3u8"}
```

**Mismo host, misma ruta base, mismo instante: el HD da 200 y el FHD da 407.** Si fuera egress, **fallarían los dos**. ⇒ **el canal `177690` está muerto/rechazado en el proveedor**; el edge hace lo correcto al no poder autenticarse.

### 9.2 El criterio de distinción

| Señal | Qué significa |
|---|---|
| El **mismo host sirve otros canales** (200) | el egress **funciona** ⇒ el 407 es **del canal** |
| El cuerpo trae **`tried: [<host>]`** | el edge **intentó** ese origen ⇒ no es un fallo de configuración |
| El cuerpo trae **`reason: http_407`** + `all_upstreams_failed` | el **origen** rechazó, no el edge |
| **Directo al proveedor da 461** (u otro no-2xx) | confirmación independiente: **el canal no existe** |

**Regla corregida**:

> **407 + el mismo host sirve otros canales + `tried`/`reason` en el cuerpo ⇒ CANAL MUERTO, no egress.** Ir al resolver **no arregla nada**: el canal no existe.
>
> **407 + TODOS los canales del host fallan ⇒ EGRESS** (ahí sí, resolver).

---

## 10. CORRECCIÓN — el **200 del resolver NO prueba canal vivo**

**Esto es lo que hizo parecer que todo iba bien.**

El resolver devuelve **la ENTRADA de la lista** (8,6 KB con `ape-profile`, `video-track`, `#EXTHTTP`) — **no descarga ni valida el stream**. Verificado: `ch=177690` (el canal muerto) devuelve **200** igual que `ch=177683` (el que funciona).

**Criterio de canal VIVO real**:

| Acepta como vivo | NO acepta como vivo |
|---|---|
| El manifiesto del canal vuelve con **`#EXTM3U`** o **`#EXTINF`** | el **200 del resolver** |
| O un **segmento descarga** (bytes > 0 de vídeo) | un **200 de una página de error** |
| | el **200 de la entrada** de la lista |

**Regla**: **para declarar un canal vivo hay que pedir el MANIFIESTO del canal**, no la entrada del resolver. El script `_vps_stage/tests/channel_alive_assert.js` aplica este criterio.

---

## 11. Pin actualizado

| Fichero | SHA-256 |
|---|---|
| `_vps_stage/lua/ape_gateway.lua` | `1b71d90e02cd05297f167b5390655832b29acee47e50c31bb0c632c275eafe2b` |
| `_vps_stage/lua/ape_rebase_lib.lua` | `a95bf84500c2d0754d7c770482cb92ff164aed842255a7634dab0f6ed5a4594d` |

*(Sin cambios de código en t101: solo doctrina. El pin sigue vigente y el guard lo verifica.)*

---

## 12. MÉTRICA R — cuando el bitrate declarado no sirve para decidir

**El bitrate declarado miente.** Un canal puede declarar 50 Mbps y entregar 0,77 R. Por eso la decisión de ruta/calidad se toma con **R medido**, no con la promesa del manifest.

### 12.1 Definición

```
R = duración_del_segmento / tiempo_de_descarga
```

Se mide **con la conexión actual**, **nunca en paralelo**: una sonda paralela inventa un R que no existe y hace decidir sobre datos falsos. Se usan la **media móvil de 3-5 segmentos** y el **último** segmento.

### 12.2 Umbrales y acción

| R | Banda | Veredicto | Acción |
|---|---|---|---|
| **≥ 2.0** | EXCELENTE | BUENO | mantener |
| **≥ 1.5** | SALUDABLE | ACEPTABLE | mantener (objetivo) |
| **1.2 – 1.49** | MARGEN INSUFICIENTE | VIGILAR | vigilar |
| **1.0 – 1.19** | CRITICO | CRITICO | cambiar ruta/calidad |
| **> 0.5 – < 1.0** | INVIABLE | INVIABLE | actuar ya |
| **≤ 0.5** | FALLO GRAVE | FALLO GRAVE | no insistir |

### 12.3 Reglas de disparo

| Condición | Efecto |
|---|---|
| media **< 1.2** en **2 segmentos** | **cambiar** |
| **un** segmento **< 1.0** | **inmediato** |
| **4-5 s sin datos** | **congelación** |
| **buffer < 2 segmentos** | **recuperar** |
| `autonomía < tiempo_cambio + 2*segmento + 5 s` | **cambiar** |

**Ejemplo de la predicción**: con segmentos de **10 s** y **8 s** de tiempo de cambio, el umbral es **8 + 20 + 5 = 33 s** de autonomía. Por debajo de eso, no da tiempo a cambiar sin cortar.

### 12.4 Casos reales del propietario

| Canal | R | Veredicto |
|---|---|---|
| ARENA | **0,77** | **INVIABLE** |
| WARNER | **0,85** | **INVIABLE** |
| SKY CINEMA | **1,79** | **ACEPTABLE** |
| FILM KOMEDI | **3,65** | **BUENO** |
| FILM KOMEDI (caída) | **0,21** | **FALLO GRAVE** |

**La caída importa más que el valor**: el mismo canal pasa de BUENO a FALLO GRAVE. Un test que solo mire el estado actual no lo detecta; el gate sí.

### 12.5 Bitrate objetivo

```
mínimo saludable = bitrate_real × 1.5
recomendado      = bitrate_real × 2.0
```

**En deportes/contenido con picos se usa el p95**, no la media: la media esconde los picos, y los picos son los que congelan.

| Perfil | Factor mín. | Factor rec. | Base |
|---|---|---|---|
| P0-P2 | ×1.5 | ×2.0 | media |
| **P3** (FHD 60) | ×1.5 | ×2.0 | **p95** (deportes) |
| P4-P5 | ×1.5 | ×2.0 | media |

### 12.6 Dónde vive

- **Frontend**: bloque `#region R-metric` de `ape-quality-prober.js` → `window.APE_R` (`classify`, `segment`, `series`, `decide`, `bitrateTarget`).
- **Gate**: `_vps_stage/tests/ratio_assert.js` **extrae ese mismo bloque** del prober y lo evalúa: **no puede haber deriva** entre lo probado y lo usado. **48 aserciones, incluidos los 4 casos del propietario y la caída 3,65 → 0,21.**

### 12.7 [UNKNOWN] — lo que NO se ha hecho

- **El resolver PHP NO se ha tocado**: en el host de trabajo **no hay `php`** (`php -l` imposible). Editar a ciegas un fichero de **7.468 líneas** sería exactamente la clase de error que ya ha roto cosas. **La decisión por R en el VPS queda pendiente** de un entorno con PHP.
- **AUTO-AJUSTAR como botón de la UI NO se ha cableado**: la función (`APE_R.decide`) está lista y probada, pero **no hay botón**. Falta el trabajo de UI.
- **Desplegar por Actions**: no ejecutado en esta tarea.

---

## 13. EGRESS CABLEADO — el reintento único ante 407

**Dónde está**: `_vps_stage/lua/ape_gateway.lua`, en el **content handler**, justo antes del loop de failover. **NO** en `ape_rebase_lib.lua`, que solo reescribe URIs del cuerpo: el egress es una decisión de **construcción del upstream**, y ahí es donde vive.

### 13.1 Qué hace

```lua
local _ape_srv = (ngx.var.arg_srv or '')
local _ape_ctx = (ngx.var.arg_ctx or '')
local _ape_egress_ok = (_ape_srv ~= '' and _ape_ctx ~= '')
local _ape_egress_tried = false
local function _ape_egress_retry(host_try)
    if not _ape_egress_ok or _ape_egress_tried then return nil end
    _ape_egress_tried = true
    ngx.log(ngx.WARN, "[ape-gw] egress-retry 407 host=", ...)
    return true
end
```

- **Un solo reintento** (`_ape_egress_tried`): nunca dos.
- **Solo si hay `srv` y `ctx`** en la petición. **No se inventan**.
- **1 conexión**: el capture fallido ya cerró antes del reintento; el nuevo abre después. Nunca dos a la vez.
- Deja **traza en el log** (`[ape-gw] egress-retry 407 host=…`) para que la muestra de staging pueda **probar** que se ejecutó.
- **El rebase del cuerpo no se toca.**

### 13.2 Lo que este cableado NO garantiza (y hay que probar en staging)

El reintento **marca** la intención y **abre una segunda oportunidad**, pero que el 407 se convierta en 200 depende de que **la location interna del resolver consuma `srv`/`ctx`**. Eso **no lo he verificado** — se prueba con la muestra de staging (§14), no aquí.

**No se ha ejecutado ninguna muestra**: sin acceso al VPS no puedo levantar el 8089 ni medir los 10 canales. **La evidencia de staging no existe todavía.**

### 13.3 Staging

`_vps_stage/nginx/ape-meta-staging.conf`: vhost aislado en **127.0.0.1:8089**, mismo handler, health propio en `/staging/health`. **No se copia a `conf.d/` hasta la aprobación.** El 8088/443 **no se toca**.

**Rollback**: borrar el fichero → `nginx -t` → `nginx -s reload` (nunca restart).
---

## 14. PUERTO DUPLICADO `:80` — el fix cerrado (t111)

**Síntoma medido**: 33 fallos `host:80` en 5 h. El ensamblado añadía el puerto a un `origin` que **ya lo traía** ⇒ `nov202gg.xyz:80:80` ⇒ host irresoluble.

### 14.1 Lo que t110 dejó a medias

| Pieza | t110 | t111 |
|---|---|---|
| `dedup_port` | `gsub("(%:%d+)%1+", "%1")` — **el `+` no repite una retro-referencia** ⇒ `:80:80` NO colapsaba | **bucle `repeat … until h == prev`** quitando un puerto por pasada |
| `to_cdn_path` | **solo IPv4** ⇒ `http://nov202gg.xyz:80/x.ts` devolvía **nil** | acepta **host con nombre** + IPv4, y **deduplica** el puerto |

### 14.2 El fix

```lua
-- dedup_port
local h, prev = hostport, nil
repeat
    prev = h
    h = h:gsub("(:%d+)(:%d+)$", "%1")
until h == prev

-- to_cdn_path
local host, port, rest = uri:match("^https?://([%w%.%-]+)(:%d+)?(/.*)$")
if not host then return nil end
if not host:match("%.") then return nil end
local hp = M.dedup_port(host .. (port or ""))
return "/cdn/" .. hp .. rest
```

### 14.3 Validación

`_vps_stage/tests/port_dedup_assert.js` → **PASS — 80 aserciones, 0 fallos**:
- **§1** los **24 casos del log** + 9 más: ninguno con puerto duplicado, todos idempotentes;
- **§2** los casos borde del contrato (`:80:80` colapsa · `:8080` intacto · `absolutize` sin duplicado · `to_cdn_path` con IPv4 y con host);
- **§3** reproducido el bug de t110 (el patrón viejo no colapsa) y probado que el nuevo sí;
- **§4** ninguna URL generada lleva `:puerto:puerto`;
- **§5** el fuente Lua tiene el bucle y no queda el patrón roto.

**Pin de `ape_rebase_lib.lua` actualizado en este documento.**

### 14.4 Lo que este gate NO prueba

**No ejecuta Lua.** Prueba el **algoritmo espejado** y el **fuente**. La ejecución real con `lua 5.1` debe hacerse en el VPS por stdin. **No lo declaro hecho hasta que corra allí.**
### 14.5 Pin de los dos ficheros del edge

| Fichero | SHA-256 |
|---|---|
| `_vps_stage/lua/ape_gateway.lua` | `1b71d90e02cd05297f167b5390655832b29acee47e50c31bb0c632c275eafe2b` |
| `_vps_stage/lua/ape_rebase_lib.lua` | `f813b1cc9a7da6126f97536a4c4b3fc662395e3d344619371150ee3387ddcfcb` |
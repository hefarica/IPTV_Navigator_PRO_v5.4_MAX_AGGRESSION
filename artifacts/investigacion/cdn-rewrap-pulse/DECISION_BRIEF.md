# DECISION BRIEF · reconciliar el plano `/pulse/` con el plano `/cdn/`

**Origen:** finding F2 de t8 (fijado como caso ejecutable en `IPTV_v5.4_MAX_AGGRESSION/frontend/tests/rea-generation-dispatch.test.js`, caso `_CDN declara el plano /cdn/ aunque no reescriba ninguna URL ya cableada`) + corrección de premisa del capitán (t18).
**Naturaleza:** documento de decisión. **No se modificó generador, panel, controller, tests ni VPS.** Todo lo que sigue es lectura de producto + dos mediciones locales.
**Fecha:** 2026-11-21.

> **Cómo se cita cada hecho.** Todo número de este brief viene de un comando ejecutado y transcrito en la sección 1 o 2, o de un `archivo:línea` del repo. Lo que NO está medido se dice como no medido (sección 5). No se envió ninguna petición HTTP al VPS: el sondeo a producción hubiera podido abrir el slot único del proveedor (`mode=adaptive`), y esta tarea es sólo lectura.

---

## 1. La forma medida del catálogo entregado (y la corrección de una fila)

Comando propio (streaming, sólo lectura, query omitida; contador de un solo uso, no versionado — se borró tras medir):

```
node %TEMP%\t18-shape.js downloaded_list.m3u8 regenerated_list_4K_RESOLVER.m3u8
```

Reproducibilidad: las columnas decisivas (`sin id numérico` / `ya /pulse/` / `ya /cdn/` / totales) las vuelve a dar el script **versionado** `scratch/count-url-shapes.js` del repo; las columnas extra de host y `/jit/` salen del contador de un solo uso cuya salida se transcribe aquí.

Salida (idéntica en los dos ficheros, 222 MB cada uno):

```
=== downloaded_list.m3u8 ===                       === regenerated_list_4K_RESOLVER.m3u8 ===
  lineas de URL          : 2753                      lineas de URL          : 2753
  con query              : 2753   100.00 %           con query              : 2753   100.00 %
  host iptv-ape          : 2753   100.00 %           host iptv-ape          : 2753   100.00 %
  host NO iptv-ape       : 0       0.00 %            host NO iptv-ape       : 0       0.00 %
  /pulse/                : 0       0.00 %            /pulse/                : 0       0.00 %
  /cdn/                  : 0       0.00 %            /cdn/                  : 0       0.00 %
  /jit/                  : 0       0.00 %            /jit/                  : 0       0.00 %
  FORMAS DE PATH (top 1) : /resolve_quality.php  2753  100.00 %
```

Verificación cruzada con el script del capitán (`node scratch/count-url-shapes.js`, mismas dos listas): `con id numerico: 0 0.00 %` / `SIN id numerico: 2753 100.00 %` / `ya /pulse/: 0` / `ya /cdn/: 0`. **La tabla del capitán se confirma.**

**CORRECCIÓN de una fila mía, no del capitán:** mi primer conteo usaba el patrón `/prisma/api/resolve_quality.php` y dio 0. El path real es **`/resolve_quality.php` en la raíz del host** (lo imprime la propia salida en `FORMAS DE PATH`). El capitán dijo `resolve_quality.php 2753 100.00 %`, que es correcto; lo que estaba mal era mi prefijo. Forma exacta de la URL entregada (la query NO lleva credenciales del proveedor; es la que el catálogo ya contiene):

```
https://iptv-ape.duckdns.org/resolve_quality.php?ch=<n>&p=P3&mode=adaptive&list=<lista>&bw=<bps>
```

Lectura de la forma: **el 100 % de los canales del catálogo entregado se entrega por el resolver**, no por `/pulse/` ni por `/cdn/`. Ninguno de los dos planos bajo discusión aparece en el cuerpo del catálogo.

---

## 2. La pregunta de arquitectura: para este catálogo, ¿`/pulse/` es una vía viva o `resolve_quality.php` es la única?

**Respuesta medida: `resolve_quality.php` es la única vía de entrega del catálogo entregado. `/pulse/` existe como ruta de producto, pero este catálogo no la usa (0 de 2753).**

### 2.1 La cadena real, archivo:línea

El host `iptv-ape.duckdns.org` sirve desde `root /var/www/html` — `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/sites-enabled-default.conf:4` (`server_name iptv-ape.duckdns.org 178.156.147.234;`) y `:8`, `:76` (`root /var/www/html;`). El espejo de ese docroot es `IPTV_v5.4_MAX_AGGRESSION/vps/_deployed_mirror/`, donde viven los tres eslabones:

| Paso | Archivo | Qué hace |
|---|---|---|
| 1 | `vps/_deployed_mirror/resolve_quality.php:1-9` | **Forwarder de 281 B.** Literal: *"NO AÑADIR LÓGICA AQUÍ"*; `require_once __DIR__ . '/resolve_quality_unified.php'`. |
| 2 | `vps/_deployed_mirror/resolve_quality_unified.php:120-124` | Lee `p` (perfil), `res`, `fps`, `mode`, `p4k`. **No lee `ch`, ni `list`, ni `bw`.** |
| 2b | `…/resolve_quality_unified.php:127` y `:164-166` | `mode=adaptive` **no** es `quality` ni `cascade` → cae a `require __DIR__ . '/resolve.php'`. |
| 3 | `vps/_deployed_mirror/resolve.php:150` | `$ch = q('ch','')`; valida `ch` y `sig` (`:158-171`, respuestas 400/403). |
| 3b | `…/resolve.php:387-412` | `bw` → `$cfg['max_bw']` (`:395`), `tbw` → `$cfg['bitrate']` (`:401`), y un mapa `math` que puede pisarlos (`:406-412`). |
| 3c | `…/resolve.php:419-456` | Token opcional (`TOKEN_MODE`, por defecto `none`, `:38-43`) y `$finalUrl = <base> [?token=…]` (`:456`). |
| 3d | `…/resolve.php:816-839` | **Salida**: fragmento M3U por canal — `#EXTINF` + `#EXTHTTP:<json>` + `#EXTVLCOPT`s (p. ej. `adaptive-maxbw` en `:689`) + `$finalUrl`. `Content-Type: application/x-mpegURL` (`:820`), `no-store` + `X-APE-Refresh-Interval: 3` (`:821-822`), y **deliberadamente sin `#EXTM3U`** ("patch fragments", `:824`). |

### 2.2 Dónde desemboca

El resolver **no entrega vídeo**: entrega un fragmento de manifiesto que apunta al **proveedor** con cabeceras y opciones de player (`:816-839`). El vídeo sale del proveedor, no del VPS.

### 2.3 Qué significa para `/pulse/`

`/pulse/` está implementado y vivo como ruta de producto — `vps/prisma/api/pulse.php:5` (contrato `GET /pulse/<id>.m3u8?u=<URL_playback_verbatim>`), `:211-214` (validación de `u`), `:861-865` (`mode=redirect` → `Location: $u` **verbatim**, 302) — pero **no aparece en el catálogo entregado (0 de 2753)**, y el contrato del resolver es un *fragmento por canal*, no una URL de playback: envolver la URL del resolver en `/pulse/` no crearía una vía de entrega, crearía un fetch anidado.

**Consecuencia directa para el defecto de F2:** en este catálogo, `#EXT-X-APE-CDN-PLANE:v4` / `#EXT-X-APE-CDN-BASE:` se declaran sobre un cuerpo en el que **ni el rewrap CDN ni el envoltorio `/pulse/` se ejercen en ningún canal**. No es que uno de los dos planos gane: en el catálogo entregado **ninguno de los dos toca una sola línea de URL**.

---

## 3. Las dos opciones, acotadas al caso en que SÍ lleguen URLs de proveedor al generador

> Esta sección solo aplica al supuesto "el catálogo FUENTE (URLs de proveedor) alimenta al generador". Ese catálogo **no está medido** (sección 5).

### 3.0 Lo que hoy hace el generador con una URL de proveedor (base de las dos opciones)

- Envoltorio `/pulse/`: envuelve **solo si encuentra id numérico** (`IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:13342-13367`; `:13358` devuelve `rawUrl` si no hay match; `:13344` es el kill-switch `window.APE_PULSE_WRAP === false`). Fijado por salida por el panel desde t6 (`generation-output-panel.js:135-163`).
- Rewrap `/cdn/`: `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-cdn-rewrap.js:40-44` (defaults: `mode:'allowlist'`, `hosts:'line.tivi-ott.net'`, `base:'https://iptv-ape.duckdns.org'`), `:87-89` (idempotencia si ya es `/cdn/`), `:91-96` (allowlist de host; el host del VPS queda fuera), `:104-111` (preserva host/puerto/ruta/credenciales verbatim y emite `<base>/cdn/<host><ruta>`).
- Inyección del plano: `generation-controller.js:693-709` (`_cdnPlaneBlock()`), aplicada **sin condición** en `_cdnOnlyWrite` (`:915-916`) y en `_dualWrite` (destino CDN). El propio `_cdnOnlyWrite` ya calcula `stats = {lines, urls, wrapped, skipped}` (`:903-912`) — el dato para decidir existe, pero no se propaga al panel (medido en t16: `result.stats` es `undefined`).

### 3.1 Opción A — el rewrap reescribe DENTRO de `u=`, y `pulse.php` lo normaliza

**Qué haría.** La línea del canal pasaría a ser `<base>/cdn/<proveedor>/<ruta>` y ese valor viajaría dentro de `u=` del envoltorio.

**Qué hace hoy `pulse.php` con una URL `/cdn/` (medido).**

- `vps/prisma/api/pulse.php:300-304` — `ape_pulse_is_self()`: sólo considera "propio" el host `iptv-ape.duckdns.org`, `localhost` o `127.0.0.1`.
- `:311-329` — `ape_pulse_norm_upstream()`: **sólo normaliza si la URL es self y el path casa `^/cdn/([A-Za-z0-9.-]+)/(.*)$`**; reconstruye `http://<proveedor>/<ruta>`, **añade `.m3u8` si falta extensión** (`:321-323`) y **fuerza `http://`** aunque el proveedor fuera `https://` (`:324`). Si es self y el path no casa, devuelve `''` (no persigue el bucle, `:326`).
- **Dónde se aplica:** en el camino de proxy (`:570-571`). En `mode=redirect` el `u=` se devuelve **verbatim** al player (`:861-865`): no hay normalización.

**Qué se deduce de ahí (medido, no supuesto):** A evita el doble salto **sólo si `base` es el host del VPS** (el default de `ape-cdn-rewrap.js:43`), porque entonces el `u=` es self y `pulse.php` lo puede deshacer. Si `ape_cdn_base` se configura a un relay de terceros (`relay.invalid`, el fixture de `rea-generation-dispatch.test.js`), el host **no** es self (`:303`) → `norm_upstream` lo devuelve intacto (`:328`) → el VPS pediría al relay, y el relay al proveedor: **doble salto real**. Y en `mode=redirect` no hay normalización en ningún caso.

**Qué se rompe.**

1. `vps/ape-jit/reconcile.js:139-146` (`toCdn`) convierte `<proveedor>/ruta` → `<BASE>/cdn/<host><ruta>`, y `:204-206` lo aplica a lo que venga en `u=`. Si `u=` ya trae `/cdn/`, el resultado sería `<BASE>/cdn/iptv-ape.duckdns.org/cdn/<proveedor>/…` (**doble envoltura**), y el host `iptv-ape.duckdns.org` no está en la allowlist del gateway (`ape-cdn-rewrap.js:98-101` documenta el 404 por host no casado).
2. El `u=` deja de ser byte-idéntico a la URL del proveedor: la aserción de origen de t6 (`rea-generation-dispatch.test.js`, `checkPlaylist` → `u= decodes byte-identical to the source/auth URI`) tendría que reescribirse o acotarse por host base.
3. El proveedor `https` degradado a `http` por `:324` es una pérdida de confidencialidad del tramo VPS→proveedor (y del `Referer`/credenciales en la ruta).

**Consumidor que depende.** `vps/ape-jit/reconcile.js` (**medido**: lee listas servidas `/var/www/lists/pulse/APE_LISTA_*.m3u8`, `:13-15`, y resuelve `u=` → `toCdn`). El resolver no depende (no lee `/pulse/` ni `u=`). El híbrido del panel tampoco (t6: `#EXT-X-APE-DASH-CONTAINER` va por otra línea). El player en `mode=redirect` sí (recibe el `u=` tal cual).

**Aserción que habría que añadir.** (i) round-trip de normalización en `pulse.php`: self `/cdn/<host>/<ruta>` → `http://<host>/<ruta>[.m3u8]`, y **`https` → `http` registrado como coste**; (ii) idempotencia de `reconcile.toCdn` cuando `u=` ya es `/cdn/`; (iii) la aserción de `u=` de t6 acotada por host base (self ⇒ puede ir `/cdn/`; tercero ⇒ debe ir la URL del proveedor).

### 3.2 Opción B — no declarar el plano cuando no se reescribió ninguna URL

**Qué haría.** `_cdnPlaneBlock()` (`generation-controller.js:693-709`) se inyectaría **sólo si** `stats.wrapped > 0` en `_cdnOnlyWrite` (`:903-916`) y su equivalente en `_dualWrite`.

**Quién consume hoy los marcadores (medido, todo el repo).** Grep de `APE-CDN-PLANE|APE-CDN-BASE|APE-CDN-FAILOVER|APE-CDN-302|APE-CDN-LLHLS|APE-CDN-QOE|APE-CDN-UHD|APE-CDN-LAB`: **7 coincidencias, y ninguna es un consumidor**. Tres en `frontend/js/ape-v9/generation-controller.js:698-699`, tres en su copia `vps/_deployed_mirror/js/ape-v9/generation-controller.js:698-699`, y las de la prueba `rea-generation-dispatch.test.js:201,216,218`. **Cero en PHP, cero en Lua, cero en `vps/`** (salvo la copia del propio controller). `reconcile.js` no los lee: trabaja sobre líneas de URL (`:200-209`).

**Qué se rompe.** Nada funcional medido. Lo que se pierde es (a) la declaración in-file del plano cuando sí hay reescritura, si el gate se implementa mal (mitigable: declarar si `wrapped>0`), y (b) la señal de "declarado pero no ejercido", que hoy es precisamente lo que delata el defecto: quitar la declaración **oculta** esa señal en vez de resolverla.

**Cuántos canales reales caen en cada rama.** **Con el catálogo entregado: 0 y 0** — no hay ni una URL de proveedor (sección 1), así que las dos ramas están vacías y el plano se declara sobre 0 reescrituras en el 100 % de los canales. **Con el catálogo FUENTE: NO COMPUTADO** — no está disponible (sección 5), y por tanto **no se puede afirmar qué proporción real sería cableable ni si B dejaría el plano vacío en la práctica**.

**Aserción que habría que añadir.** Invertir el caso de t16 para exigir el bicondicional: `#EXT-X-APE-CDN-PLANE` presente **si y sólo si** al menos una línea de URL contiene `/cdn/`; y conservar el caso del canal sin id numérico como prueba positiva de que la rama existe (`rea-generation-dispatch.test.js`, caso `_CDN declara el plano /cdn/ aunque no reescriba ninguna URL ya cableada`).

---

## 4. Comparación en una tabla (sin recomendación)

| | A · reescribir dentro de `u=` | B · no declarar el plano sin reescritura |
|---|---|---|
| Alcance del cambio | `ape-cdn-rewrap` (orden del pipeline) + panel? + `pulse.php` no cambia | `generation-controller.js:693-709` y sus dos llamadas |
| Funciona para el catálogo entregado | indiferente: 0 URLs de proveedor | indiferente: 0 reescrituras |
| Doble salto | evitado **sólo** con `base` = host del VPS y fuera de `mode=redirect` | no aplica |
| Consumidor que se toca | `vps/ape-jit/reconcile.js:139-146,204-206` (doble envoltura) | ninguno medido |
| Coste medido | `https` → `http` en `pulse.php:324` | se pierde la señal "declarado y no ejercido" |
| Señal del defecto | se conserva (el plano sigue declarado) | desaparece la discrepancia al dejar de declarar |
| Aserción a añadir | round-trip de normalización + idempotencia de `toCdn` + `u=` acotado por host | bicondicional plano ⇔ `/cdn/` en el cuerpo |

---

## 5. LÍMITE declarado (explícito, no nota al pie)

1. **El catálogo FUENTE no está medido.** No se dispone de las URLs de proveedor que alimentan al generador: el operador no las expuso. Todo lo medido aquí es el catálogo **entregado** (post-resolver) y el código del espejo. Por tanto **no se puede afirmar qué proporción de canales reales es cableable por `/pulse/` ni cuántos caerían en cada rama de B.** Las dos ramas medidas en el catálogo entregado son 0 y 0, que **no** es lo mismo que "no existen en la práctica".
2. **No está medido cuál implementación del resolver está activa en producción.** El espejo encadena a `resolve_quality_unified.php` (6 270 B), pero el mismo directorio contiene `resolve_quality_unified_LIVE.php` (290 754 B), que **sí** lee `ch`/`bw`. No se envió ninguna petición HTTP al VPS (deliberado: `mode=adaptive` puede abrir el slot único del proveedor), así que la cadena de la sección 2 es la del espejo, no la del proceso vivo.
3. **`_deployed_mirror` es una instantánea**, no el estado vivo del VPS. No se tocó el VPS.
4. **No se modificó producto**: sólo se añadió este documento (`git status` del repo: sin cambios en generador, panel, controller, tests ni `vps/`).

---

## 6. Pregunta exacta y binaria para el operador

> **¿Cuál de las dos se implementa en el plano `/cdn/`?**
> **A)** hacer que el plano se ejerza **dentro de `u=`** (con `base` = host del VPS para que `pulse.php` lo normalice, y aceptando que en `mode=redirect` y con base de terceros hay salto),
> **o**
> **B)** **dejar de declarar** `#EXT-X-APE-CDN-PLANE:v4` / `#EXT-X-APE-CDN-BASE:` cuando el rewrap no reescribió ninguna URL (y declararlo cuando sí).

Respuesta en una palabra: `A` o `B`.

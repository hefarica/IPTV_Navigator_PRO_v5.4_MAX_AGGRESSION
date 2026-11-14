# BACKEND DEL PANEL DE CABLEADO — implementación del contrato t59

**Autor:** jit-auditor (team `canary-jit-20261111`, task `t60`) · **Fecha:** 2026-11-14
**Contrato implementado:** `contracts/list_cablear_panel_v1.json` · `ape.lists.cablear_panel.contract.v1` · v1.0.0 · rev 1 · sha256 `d22e4133c18261ced7d5ceb01c8c2ea685176c022b39cc6de8d5dd5371bf47f6` (**no modificado**)
**Estado:** **IMPLEMENTADO EN EL REPO, NO DESPLEGADO.** Cero escrituras en el VPS.

---

## 0. VEREDICTO

Los dos endpoints y el formato de cola están escritos, y **38 controles en verde, 0 en rojo**. La prueba **no escribe nada en ningún sitio**: la cola usa un store en memoria y el sistema de ficheros real del VPS se usa **solo en lectura**.

Y hay un dato que solo aparece si se mide: **el guardia de disco reproduce exactamente la aritmética del contrato** —libre 5638 MB, mínimo 3000, coste 2501 MB para la lista del operador ⇒ **137 MB de margen**, el mismo número que el contrato da como medido—. No es coincidencia: es que la fórmula del contrato está bien y la implementación la aplica igual.

| # | Fichero | Bytes | sha256 |
|---|---|---:|---|
| 1 | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/list_cablear_core.php` | 27.177 | `107896b6…39ab0` |
| 2 | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/list-cablear.php` | 3.674 | `40fbc1bc…0d961` |
| 3 | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/list-cablear-status.php` | 2.736 | `5b24bb1d…df506` |
| 4 | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/cablear.php` (alias del path del contrato) | 600 | `627f0146…43d9c` |
| 5 | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/cablear-estado.php` (alias) | 306 | `714934f…6695b` |
| 6 | `tools/quality/test_list_cablear_panel.js` | 11.632 | `ba21f967…ba3cf` |

---

## 1. CONTRATO CAMPO POR CAMPO

| Sección del contrato | Implementado | Dónde / con qué |
|---|---|---|
| `enqueue_endpoint.method` POST, `content_type` form-urlencoded | **sí** | `list-cablear.php` exige `REQUEST_METHOD === POST` antes de leer el cuerpo; 405 con `E_METODO_NO_PERMITIDO` |
| `fields.lista` (max_len 2048) | **sí** | validación 2 y 3 |
| `fields.publicar` def. `0` | **sí** | `=== '1'` estricto (D3): cualquier otra cosa es 0 |
| `fields.device` regex + default medido | **sí** | regex `^[A-Za-z0-9_-]{16,512}$`; default = el descriptor del contrato (D2) |
| `fields.forzar` def. `0` | **sí** | `=== '1'`; rompe la idempotencia a propósito (probado) |
| `validations_in_order` (14) | **sí, en orden** | §2 |
| `path_traversal_rule` B1-B4 + 12 vectores | **sí** | los 12 vectores pasan con el código esperado (§4) |
| `idempotency.key_definition` sha256(fuente\|tamaño\|mtime\|wiring) | **sí** | `ape_cablear_clave()` |
| `idempotency.duplicate_response` 200 `estado:'duplicado'` + mismo ticket + `estado_url` | **sí** | probado: 2.º POST idéntico → 200 duplicado, mismo ticket, **1 sola entrada** en cola |
| `idempotency.accepted_response` 202 `queued` + `t-<epochms>-<rand8>` + `cola_posicion` | **sí** | probado (`t-1794700000000-818evlhf`, `cola_posicion:1`) |
| `status_endpoint` GET con exactamente uno de `ticket`/`ultimos`/`lista` | **sí** | 0 o 2 → 400 `E_CONSULTA_AMBIGUA` (probado con ambos) |
| `queries.ticket` shape `^t-[0-9]{13}-[a-z0-9]{8}$` | **sí** | formato inválido → 404 `E_TICKET_DESCONOCIDO` |
| `queries.ultimos` 1..50 | **sí** | `ultimos` > 50 se recorta a 50; 0 o no numérico → 400 |
| `response_shape` (10 campos) | **sí** | probado campo por campo |
| `states` queued/running/done/failed/skipped_disk/expired | **sí** | `expired` = 410; el resto 200. `running` lo pone la ubicación `tomados/` |
| `queue.root` `/var/lib/ape/cablear` + 5 dirs | **sí** | `ape_cablear_dirs()`; override por `APE_CABLEAR_ROOT` |
| `queue.enqueue_atomic` (.tmp + rename) | **sí** | `ape_cablear_store_put()`: `file_put_contents(.tmp)` y **después** `rename()` |
| `queue.take_atomic` (rename a `tomados/`) | **sí, documentado** | no hay lock distribuido: el `rename` ES el lock. **Lo ejecuta el worker (t61)**; aquí solo se define el formato y la ubicación |
| `queue.singleton` flock | **n/a aquí** | es del worker (t61) |
| `queue.ticket_fields` (14 campos, schema `ape.lists.cablear.ticket.v1`) | **sí** | el ticket que escribe el endpoint tiene los 14 |
| `queue.ttl` (7 d, heartbeat 30 s, reaper 600 s) | **constantes definidas** | `APE_CABLEAR_TERMINAL_DAYS`, `APE_CABLEAR_TICKET_TTL`; el reaper es del worker |
| `disk_guard` (MIN_FREE_MB 3000, coste = descomprimido × 2, admisión) | **sí** | validación 13; §5 |
| `disk_guard.when_source_is_gz_or_stub` | **sí** | lee el trailer ISIZE del `.gz` **sin descomprimir**; probado con la lista real del operador (stub 8 B + `.gz` 352 MB) |
| `disk_guard.on_not_fit` 507 + `skipped_disk` + ticket conservado | **sí (código)** | devuelve 507 `E_DISCO_INSUFICIENTE` con el motivo literal del contrato; el ticket se conserva porque **no se crea** |
| `final_response.url_cableada` / `url_gz` / nombre determinista | **sí** | probado: `https://iptv-ape.duckdns.org/lists/APE_LISTA_1794100720046_CABLEADA.m3u8` |
| `publish_rule.publicar_0` → `url_cableada:null` | **sí** | probado (invariante I3) |
| `rejection_codes` (22 códigos) | **sí** | los 14 del encolado + `E_CONSULTA_AMBIGUA`, `E_TICKET_DESCONOCIDO`, `E_NO_AUTORIZADO`; los 6 del worker quedan definidos para t61 |
| `auth` "se hereda" | **sí, declarado** | `APE_CABLEAR_KEY` opcional; si no está, la respuesta lo dice (`auth:"heredada"`) en vez de fingir un esquema propio |
| `executor` (systemd .path + worker) | **n/a** | es t61 |
| `input.form_b_external_url.download_rules` | **NO** (D4) | ver §6 |

---

## 2. LAS 14 VALIDACIONES, EN ORDEN

| n | Código | Implementación |
|---:|---|---|
| 1 | `E_METODO_NO_PERMITIDO` 405 | endpoint + `ape_cablear_validate` (`_method`) |
| 2 | `E_LISTA_REQUERIDA` 400 | `trim($lista) === ''` |
| 3 | `E_LISTA_DEMASIADO_LARGA` 400 | `strlen > 2048` |
| 4 | `E_LISTA_NOMBRE_INVALIDO` 400 | `^[A-Za-z0-9][A-Za-z0-9._-]{0,123}\.m3u8$` (B1+B2) |
| 5 | `E_LISTA_FUERA_DE_DIRECTORIO` 400 | `realpath()` contra **realpath(raiz)** — ver D1 |
| 6 | `E_LISTA_ES_SYMLINK` 400 | `lstat()` del destino, bit `0120000` |
| 7 | `E_VARIANTE_NO_CABLEABLE` 400 | `(_CABLEADA\.m3u8|\.m3u8\.gz|_SHIELDED\.m3u8)$` |
| 8 | `E_LISTA_NO_EXISTE` 404 | `is_file && is_readable` |
| 9 | `E_LISTA_DEMASIADO_GRANDE` 413 | `> 2 GiB` |
| 10 | `E_ESQUEMA_NO_PERMITIDO` 400 | `parse_url()` → `http|https` |
| 11 | `E_URL_CON_CREDENCIALES` 400 | `isset($p['user']) || isset($p['pass'])` |
| 12 | `E_HOST_NO_PERMITIDO` 403 | allowlist del operador, **vacía por defecto** ⇒ fail-closed |
| 13 | `E_DISCO_INSUFICIENTE` 507 | `libre >= 3000 && coste <= libre-3000` |
| 14 | `E_COLA_NO_ESCRIBIBLE` 500 | crea los 5 dirs y comprueba `is_writable(cola)`; en store `mem` no aplica |

---

## 3. LA PRUEBA — qué corre y por qué no escribe nada

`node tools/quality/test_list_cablear_panel.js` → **38 PASS, 0 FAIL**, exit 0.

Cómo funciona y por qué es una prueba de verdad:

1. Construye **un programa PHP** = el **cuerpo real** de `list_cablear_core.php` + las aserciones. No se prueba una copia: se ejecuta el fichero que se va a desplegar.
2. Lo ejecuta con `php -n`. **No hay PHP local** en esta máquina, así que se manda por **stdin** a `php -n` del VPS y se lee la salida. **No se sube ningún fichero**, igual que hace `_vps_stage/deploy/validate.sh` con `php -l /dev/stdin`.
3. La cola usa **store `mem`** (array en el proceso): no se crea **ni un fichero**.
4. La **raíz de listas sí es la real** (`/var/www/html/lists`) en modo lectura: la validación de nombre se ejerce contra el sistema de ficheros de verdad, no contra un mock. De ahí que el encolado de la lista del operador sea real hasta la validación 13.

Lo que probó, literalmente: los **12 vectores** de `path_traversal_rule.checkable_vectors` con su código; método; lista vacía; lista >2048; disco insuficiente (507); device inválido; **encolado real** de `APE_LISTA_1794100720046.m3u8` → 202 + ticket con formato + `cola_posicion` + `estado_url`; **idempotencia** (2.º POST → 200 `duplicado`, mismo ticket, **1** entrada); `forzar=1` → ticket nuevo; los cinco estados; los 10 campos del `response_shape`; `url_cableada` **null** con `publicar=0`; `done` → **la URL exacta**; y que un `*_CABLEADA.m3u8` externo no pasa.

### 3.1 Un bug propio que el test encontró

La primera pasada dio **FAIL** en la idempotencia: el 2.º POST devolvía 202. Causa: `ape_cablear_enqueue(array $in, array $io)` recibía `$io` **por valor**, y el store `mem` vive en `$io['mem']` — el ticket se escribía en una copia y se perdía al volver. Arreglado con `array &$io` y documentado en la firma. **Sin el test, esto llegaba a producción** y el panel habría creado un trabajo por clic.

### 3.2 El CONTEO REAL, medido sobre la lista del operador (sin escribir nada)

`tools/quality/conteo_cableado.php` se ejecuta por stdin sobre el VPS y lee el `.gz`
**en streaming**, aplicando las reglas de `wiring` del contrato (cortar en el primer `|`,
extraer el id en el orden del contrato, `rawurlencode`). No escribe nada: solo emite números.
No toca `/var/www/lists/pulse/` (la lista servida) ni abre una sola conexión al proveedor.

```json
{"fuente":"/var/www/lists/APE_LISTA_1794100720046.m3u8.gz",
 "extinf":21224, "lineas_url":21224,
 "envueltos":21224, "ya_estaban":0, "sin_id":0,
 "salida":"APE_LISTA_1794100720046_CABLEADA.m3u8"}
```

**21.224 canales, 21.224 cableados, 0 sin id, 0 ya cableados** ⇒ el `conteo > 0` es **21.224**,
y coincide exactamente con el dato medido del contrato (`measured_context.php_cabler_perf`:
«21.224/21.224 canales cableados, 0 URLs directas»). Además **las 21.224 URLs cableadas casan
la regex del invariante I7** (`^https://iptv-ape\.duckdns\.org/pulse/[0-9]+\.m3u8\?u=https?%3A%2F%2F`),
o sea que `u=` va URLENCODED y nunca base64.

Lo que **no** se hizo aquí, y por qué: **persistir** la salida (2.501 MB de coste con 137 MB de
margen) es el worker, t61 — y hacerlo desde aquí habría sido escribir en el disco del VPS, que
esta tarea prohíbe. El conteo, que es lo que se pedía demostrar, está medido.

---

## 4. DESVIACIONES DEL CONTRATO (declaradas, no silenciosas)

### D1 · La raíz de listas es un SYMLINK — la comprobación literal del contrato rechaza TODO
El contrato (`path_traversal_rule.barriers[2]`) pide que `realpath(resolve(dir, nombre))` empiece por **`/var/www/html/lists/`**. Medido hoy:

```
lrwxrwxrwx /var/www/html/lists -> /var/www/lists
readlink -f /var/www/html/lists  =>  /var/www/lists
```

Con la letra del contrato, `realpath('/var/www/html/lists/X.m3u8')` = `/var/www/lists/X.m3u8`, que **no** empieza por `/var/www/html/lists/` ⇒ **toda lista válida sería rechazada** con `E_LISTA_FUERA_DE_DIRECTORIO`.

**Implementado:** la comparación es contra `realpath(raiz) . '/'`. La barrera sigue siendo la misma (no salir del directorio de listas); lo que cambia es que se resuelve el symlink igual en los dos lados. **Es la única forma de que el endpoint funcione**, y por eso se declara aquí en vez de dejarlo escrito y roto.

### D2 · `E_DEVICE_INVALIDO` (código nuevo, 400)
El contrato define `fields.device.regex` pero **no** da código de rechazo, y la lista de `rejection_codes` no lo incluye. Opciones: (a) ignorar el device inválido y usar el default — **mentir** en el `d=` de cada URL; (b) rechazar. Se rechaza (fail-closed) con un código nuevo declarado. Un device mal copiado por el operador debe verse, no sustituirse en silencio.

### D3 · `publicar`/`forzar` son estrictos: solo `'1'` es 1
Cualquier otro valor ⇒ 0. **Asimétrico a propósito**: equivocarse hacia 0 nunca publica en `/lists/` ni re-cablea; el error cae del lado que no rompe invariantes.

### D4 · La entrada por URL externa está **cerrada de verdad** (no hay downloader)
El contrato la admite con allowlist vacía por defecto. Aquí la validación 12 se evalúa y devuelve `E_HOST_NO_PERMITIDO` con la allowlist vacía, **pero el descargador no está implementado**: sin `download_rules` no hay `fetch` saliente, y por tanto **no hay SSRF posible** en este código. Encenderla es un trabajo aparte (y una decisión del operador sobre `/etc/ape/cablear-hosts.allow`).

---

## 5. GUARDIA DE DISCO — la aritmética del contrato, reproducida

Medido hoy en el VPS (lectura): `df -m /var` → **libre 5638 MB (85 % usado)**.
Lista del operador: `.m3u8` = **8 B** (stub) + `.m3u8.gz` = **352.103.394 B** ⇒ descomprimido **1.311.467.322 B**.

```
coste   = ceil(1.311.467.322 * 2 / 1048576) = 2501 MB
margen  = 5638 - 3000 = 2638 MB
2501 <= 2638  ->  CABE, con 137 MB de margen
```

**137 MB es el mismo número que el contrato da como medido** (`disk_guard.measured_arithmetic_today`). Dos listas de ese tamaño **no caben**: la segunda daría `skipped_disk`. Que la implementación reproduzca la cifra del contrato es la prueba de que la fórmula no se ha "interpretado".

**El `.gz` no se descomprime para medirlo:** se lee el trailer **ISIZE** (últimos 4 bytes, little-endian). Coste O(1) y sin abrir 352 MB.

### 5.1 Requisito que hereda t61 (medido, no supuesto)
La raíz del contrato (`/var/www/html/lists`) es el **directorio de subida**, donde la lista del operador es un **stub de 8 B**; la lista completa vive en `/var/www/lists/pulse/`. El encolado ya calcula el tamaño por el `.gz`, pero **el worker tendrá que cablear desde el `.gz`** (o desde `pulse/`) cuando el `.m3u8` sea un stub. Si cablea los 8 B del stub, la salida sería una lista de una línea.

### 5.2 Los CINCO directorios de la cola — hallazgo de t62, confirmado y ya cubierto

**El hallazgo (de t62, verificado por el capitán en el VPS):** el `.path` del worker crea **solo**
`/var/lib/ape/cablear/cola` (`MakeDirectory=yes`). Los otros cuatro —`tomados/`, `hechos/`,
`fallidos/`, `staging/`— **no los crea nadie**; de hecho **no existía ni `/var/lib/ape/cablear`**
(aunque `/var/lib/ape/` sí). Consecuencia: el encolado escribiría en `cola/` y el worker **no podría
hacer el `rename` a `tomados/`**, así que el ticket se quedaría en cola **para siempre** y el
operador vería *"queued"* eterno. Es exactamente el fallo mudo que esta sesión lleva días cazando.

**Confirmado: el encolado ya los crea, y ahora está probado.** La validación 14 recorría los seis
caminos (`root` + los cinco) con `@mkdir(..., true)`; lo que faltaba era **demostrarlo**. Ahora:

| Comprobación | Resultado |
|---|---|
| se intentan crear **los cinco** + el padre | **PASS** — `intentos=6`: `/var/lib/ape/cablear`, `…/cola`, `…/tomados`, `…/hechos`, `…/fallidos`, `…/staging` |
| no falta ninguno de los cinco | **PASS** |
| se crea también el padre (si no, `mkdir` recursivo no serviría de nada) | **PASS** |
| si `mkdir` falla → **`E_COLA_NO_ESCRIBIBLE` 500** | **PASS** |
| el motivo lleva **la ruta literal** del directorio que falló | **PASS** — `no se pudo crear el directorio de la cola: /var/lib/ape/cablear/cola (el worker NO puede renombrar el ticket a tomados/ sin el; el ticket no se crea para no dejar un queued eterno)` |

**Modo 0775 — decidido, no copiado.** La casa usa **tres** modos distintos:

```
ape-canon-ingest.php:55   @mkdir($CANONDIR, 0755, true);
ara-device.php:121        @mkdir(JOBS_DIR, 0775, true);
pulse.php:261             @mkdir(PULSE_LOG_DIR, 0755, true);
qoe-flush.php:200         @mkdir($apeDir, 0770, true);
```

Aquí manda el caso real: **escribe** el endpoint como `www-data` y **lee y renombra** el worker, que
puede correr con otro usuario. `0775` es el único del repertorio que cubre a los dos sin abrir el
directorio a todo el mundo. (Estaba en `0750`; corregido.)

**El orden importa y está probado:** el padre es la **primera** entrada de `ape_cablear_dirs()`, así
que el `mkdir` recursivo encuentra el árbol a medio crear y lo completa. Y la guardia de disco (13)
mide el espacio en `dirname($queue_root)` = `/var/lib/ape`, que **sí** existe ⇒ en un VPS virgen la
validación 13 no falla antes de que la 14 cree el árbol.

**Lo que NO se cambió, por indicación expresa del capitán:** el nombre determinista
`<base>_CABLEADA.m3u8` (el worker y el panel lo dan por hecho) y el `auto.sh` de 15 min (cablea por
mtime, no conoce la cola; convive con `ape-cablear-cola.timer` y no se toca).

---

## 6. HANDOFF

| A quién | Qué necesita de aquí |
|---|---|
| **t61 (worker)** | Leer `cola/t-*.json`; **tomar = `rename()` a `tomados/`**; heartbeat 30 s; reaper 600 s (intentos+1, a los 2 → `fallidos/` con `E_WORKER_MUERTO`); re-chequear el disco **antes** de escribir; escribir `<out>.partial.$$` + `mv` atómico; respetar el stub (`.gz`); respetar `publicar`; rellenar `salida.sha256/bytes/publicada` y `progreso`. |
| **t62 (frontend)** | `POST /prisma/api/cablear.php` (o `list-cablear.php`), guardar `ticket` en `localStorage['ape.cablear.ticket']`, `poll` a `/prisma/api/cablear-estado.php?ticket=`. En `done` mostrar `salida.url_cableada`; si es `null`, es `publicar=0` y hay que reintentar con `publicar=1`. |
| **deploy** | Los 5 `.php` van al manifiesto como `/var/www/html/prisma/api/<mismo nombre>`, 644 `www-data:www-data`. **No requiere reinicio** (php-fpm recarga solo, igual que `pulse.php`). |

---

## 7. NO COMPUTADO / fuera de alcance

| Item | Estado | Razón |
|---|---|---|
| **Persistir** el fichero cableado (2.501 MB en disco + `.gz`) | **NO COMPUTADO** | es el worker (t61), y desde aquí habría sido escribir en el VPS. **El conteo sí se midió: 21.224** (§3.2) |
| Canal → URL final tras publicar (`/lists/<base>_CABLEADA.m3u8` servida por nginx) | **NO COMPUTADO** | requiere `publicar=1` y el worker; la forma de la URL sí está probada (§3.1) |
| Descarga de URL externa | **no implementada** (D4) | allowlist vacía por defecto; sin downloader no hay SSRF |
| Auth de `/prisma/api` | **heredada** | el contrato no la define; el endpoint declara cómo la ejerció |
| `take_atomic` y `flock` | **definidos, no ejecutados** | son del worker |
| unidades systemd (`.path`/`.service`/`.timer`) | **no las escribí** | `vps/systemd/` es **out of scope** en t60; las aporta t61 (ya están en el árbol, escritas por ese miembro, no por mí) |
| `status` del contrato (`SPECIFIED_NOT_IMPLEMENTED`) | **sin tocar** | el contrato tiene `authority: operator`; cambiar su estado es decisión del operador. Queda declarado aquí. |

---

## 8. CÓMO SE VERIFICÓ (comandos)

```
php -l list-cablear.php          -> No syntax errors detected   (por stdin: php -n -l /dev/stdin)
php -l list-cablear-status.php   -> No syntax errors detected
php -l list_cablear_core.php     -> No syntax errors detected
php -l cablear.php               -> No syntax errors detected
php -l cablear-estado.php        -> No syntax errors detected
node tools/quality/test_list_cablear_panel.js -> 38 PASS, 0 FAIL, exit 0
```

`php -n` (sin ini) a propósito: el código no usa APCu ni ninguna extensión; así la comprobación no depende de la configuración del VPS.

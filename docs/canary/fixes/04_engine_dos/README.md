# H1 — DoS de UNA petición no autenticada en `/meta` (TDZ de `CAPACITY_FPS`)

**Estado: NO APLICADO.** El repositorio real está **byte-idéntico**: `tools/lab/ape-jit/server.js` sigue con **447.943 B** y **sha256 `28352c508285b1eedfc889e5df40855e6e2c71207d7c806288ac8457de36ff67`**, medido antes y después de todo el trabajo. No se ha tocado el VPS, ni el contrato, ni ningún otro fichero. Este directorio es lo único escrito.

| Fichero | Qué es | Aplica con |
|---|---|---|
| `0004-engine-tdz-dos.patch` | **El fix del DoS.** Mueve `CAPACITY_FPS`, `CAPACITY_MIN_FPS` y `CAPACITY_MIN_RATIO` del cuerpo del handler al ámbito del módulo. 2 hunks. | `git apply --check` **exit 0** |
| `0004b-engine-nice-fallback.patch` | **Aparte a propósito.** Fallback del `spawn('nice', …)` que el motor A no tiene y el espejo B sí. 2 hunks. | `git apply --check` **exit 0** |

---

## 1. El defecto, reproducido (no heredado)

**Traza literal capturada en loopback, con una copia del motor en `os.tmpdir`:**

```
ReferenceError: Cannot access 'CAPACITY_FPS' before initialization
    at capacityForHeight (...\before\server.js:8000:31)
    at capacityVerdict (...\before\server.js:8009:15)
    at Server.<anonymous> (...\before\server.js:6183:17)
    at Server.emit (node:events:508:28)
    at parserOnIncoming (node:_http_server:1210:12)
```

```
1) GET /health            -> 200 {"ok":true,"active":null,...}
2) GET /meta/999999.json  -> 404 "unknown channel"
3) GET /health (tras 404) -> 200                      ← el 404 NO mata
4) GET /meta/1.json       -> ERR:ECONNRESET            ← petición ÚNICA, id VÁLIDO
5) GET /health (tras H1)  -> ERR:ECONNREFUSED          ← el proceso ya no existe
6) exitCode del hijo      -> {"code":1,"signal":null}
7) GET /health (post-kill)-> ERR:ECONNREFUSED
```

### 1.1 El mecanismo exacto (esto es lo que la traza no dice)

El motor declara **todo el handler dentro de `const server = http.createServer((req, res) => {`** en **L6056**, y el cuerpo de ese handler llega hasta mucho después de L8000. Es decir:

| Línea | Qué hay | Consecuencia |
|---|---|---|
| **L6056** | `const server = http.createServer((req, res) => {` | abre el **cuerpo del handler** |
| **L6183** | `const cap = capacityVerdict(outH0, fpsFuente);` | **usa** las constantes |
| **L7993-7995** | `const CAPACITY_FPS = …` (y las dos hermanas) | **se declaran** 1.810 líneas DESPUÉS del uso |

- `function capacityForHeight` / `capacityVerdict` son **declaraciones de función**: se **hoistean e inicializan al entrar** al handler → son invocables desde L6183.
- `const CAPACITY_FPS` es **block-scoped al mismo cuerpo**: está en **zona muerta temporal** hasta que la ejecución llega a L7993.
- En cada petición, L6183 corre **antes** que L7993 → **TDZ en TODAS las peticiones**, no sólo en la primera.
- El `ReferenceError` ocurre dentro del handler HTTP y **no está capturado** → Node mata el proceso.

**Por qué `/meta/999999.json` sobrevive:** el handler devuelve **404 en L6172** (`if (!map[id] || !map[id].url)`) y hace `return` **antes** de llegar a L6183. Eso no es un comportamiento distinto: es que **nunca toca el código roto**. Ese contraste es el que fija el punto exacto del fallo.

**Clasificación:** DoS de **una** petición, **sin autenticación**, sobre un endpoint de metadatos que cualquier reproductor consulta solo (`/meta/<id>.json` es lo que consume `#EXTATTRFROMURL`). No hace falta token, ni cuenta, ni conocer el catálogo: basta un id válido.

> **Corrección a una hipótesis previa:** se barajó que las constantes estuvieran "dentro de un bloque que no siempre corre". Medido: **no es un bloque condicional**. Es el **cuerpo del handler** (L6056) y la declaración está **después del uso en la misma invocación**. El efecto es el mismo (TDZ permanente en ese camino) pero la causa manda en el diseño del fix: **hay que sacarlas del handler, no blindar el acceso**.

---

## 2. La decisión: mover las constantes, no blindar la función

Se eligió **mover las tres constantes al ámbito del módulo** (hunk 1 del patch, justo antes de `const server = http.createServer(...)`) y **quitar la declaración del cuerpo del handler** (hunk 2, sustituida por un comentario que apunta al sitio nuevo).

**Por qué ésta y no un guard dentro de `capacityForHeight`:**

| Opción | Veredicto |
|---|---|
| **Mover las constantes (elegida)** | Ataca la **causa**: un `const` declarado después de su uso en el mismo scope. Coste en runtime: **0** (datos puros, sin estado por petición). Superficie del cambio: **+10 / −4 líneas**, sin tocar la lógica del motor. |
| Blindar `capacityForHeight` con un fallback (`typeof CAPACITY_FPS === 'undefined' ? DEFAULT : …`) | **Papel sobre el síntoma**: deja vivo un orden de declaración roto y **el siguiente `const` que alguien añada al handler repetirá el fallo**. Además duplicaría la tabla de fps o inventaría un valor por defecto, que es exactamente "no declarar lo que no se mide". |
| Convertir el `const` en `var` | Lo arregla **por accidente** (`var` se hoistea como `undefined`) y el día que alguien escriba `Object.keys(undefined)` cambia un `ReferenceError` claro por un `TypeError` opaco. |

`capacityForHeight` y `capacityVerdict` **no se mueven**: se hoistean y ya funcionan. Tocar más sería refactorizar el motor, que el encargo prohíbe.

**Lo que NO cambia el patch:** ni un valor de la tabla (`480:25.39, 720:18.00, 1080:12.00, 1440:6.20, 2160:3.37, 3240:2.30, 4320:1.47`), ni los umbrales (`5.0` fps / `0.30` de ratio), ni el orden de las comprobaciones, ni el código de rechazo 503 `CAPACITY_EXCEEDED`.

---

## 3. Demostración en loopback (copia en `os.tmpdir`, nunca el fichero real)

**Montaje:** copia del motor a `%TEMP%\t36-after-*\eng\`, `git init` en esa carpeta, catálogo de 2 canales y arranque con `PORT=3199 BIND=127.0.0.1 MAP_FILE=<catálogo> OUT_ROOT=<tmp>\shm IDLE_MS=180000 WAIT_MS=60000 BOOT_GRACE_MS=60000 APE_2K=1`.

### 3.1 Aplicación del patch

```
git apply 0004-engine-tdz-dos.patch        -> status=0  "Applied patch tools/lab/ape-jit/server.js cleanly."
git apply 0004b-engine-nice-fallback.patch -> status=0  "Applied patch tools/lab/ape-jit/server.js cleanly."
sha256 ANTES  = 28352c508285b1eedfc889e5df40855e6e2c71207d7c806288ac8457de36ff67
sha256 DESPUES= 290b11030f3b6bf944c14298f3fe8401c0f9bd773789e26afeca8bb9f8aeb492
node -c  sobre el artefacto parcheado -> EXITCODE=0
```

### 3.2 La misma batería, después del patch

```
1) GET /health            -> 200 {"ok":true,"active":null,"pid":null,"uptime_s":0}
2) GET /meta/999999.json  -> 404 "unknown channel"
3) GET /health (tras 404) -> 200
4) GET /meta/1.json       -> 200 {"$schema":"https://iptv-ape.duckdns.org/schemas/channel-v1.json",...,"id":"1",...}
5) GET /health (tras H1)  -> 200                       ← SIGUE VIVO
6) GET /meta/2.json       -> 200 {... "id":"2" ...}
7) exitCode del hijo      -> null                      (null = proceso vivo)
8) sockets en LISTEN 3199 -> 1                         ← el puerto sigue escuchando
9) stderr del motor       -> (vacío: sin traza)
10) GET /health (post-kill)-> ECONNREFUSED             ← limpieza
11) sockets en LISTEN tras kill -> 0                   ← puerto cerrado
```

**Resumen del antes/después sobre la MISMA petición `GET /meta/1.json`:**

| | Antes | Después |
|---|---|---|
| Respuesta HTTP | **ECONNRESET**, 0 bytes, 0 cabeceras | **200** con el JSON de metadatos |
| Proceso | **muerto** (`exit 1`) | **vivo** (`exitCode=null`) |
| `/health` después | **ECONNREFUSED** | **200** |
| Puerto 3199 | cerrado | **sigue en LISTEN** |
| Traza en stderr | `ReferenceError: Cannot access 'CAPACITY_FPS'…` | **ninguna** |

**Comportamiento existente intacto:** `/meta/999999.json` sigue devolviendo **404 "unknown channel"** y el proceso **sobrevive** en ambos casos (antes y después).

**Limpieza:** el hijo se mata con `SIGKILL` al final y se comprueba `Get-NetTCPConnection -LocalPort 3199 -State Listen` → **0**. Ningún proceso queda vivo.

---

## 4. `0004b` — el fallback de `nice`, en patch separado

Se entrega **separado** y no dentro de `0004` por una razón de reversión, no de tamaño: el DoS es un fallo de seguridad con fecha y el fallback de `nice` es una mejora de diagnóstico. Si mañana hay que revertir uno, no se arrastra el otro.

| Motor | Hoy | Con `0004b` |
|---|---|---|
| **A** `tools/lab/ape-jit/server.js:4865` (desplegable) | `spawn('nice', ['-n','19','ffmpeg', ...args])` — resuelve por `PATH`; si `nice` no existe, el `ENOENT` del spawn no distingue si faltaba `nice`, `ffmpeg` o el `cwd` | `const NICE_BIN = fs.existsSync('/usr/bin/nice') ? '/usr/bin/nice' : '';` · `const FFMPEG_BIN = fs.existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg';` · `spawn(NICE_BIN \|\| FFMPEG_BIN, NICE_BIN ? ['-n','19',FFMPEG_BIN, ...args] : args, …)` |
| **B** `IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js:24-27,427` | **ya lo tiene** — es el patrón que se replica | — |

Efecto secundario positivo y medido: en Windows (donde `/usr/bin/nice` no existe) el motor **hoy** no puede arrancar ningún job; con `0004b` arranca `ffmpeg` directamente sin el prefijo `-n 19`. En Linux con `nice` presente, el comportamiento es **idéntico** al actual.

---

## 5. ⚠️ Aviso: reparar el motor **mueve su sha256** e **invalida el pin del contrato**

Esto no es una nota al pie: es la razón por la que este patch **no se aplica solo**.

**El contrato pina el motor por sha256 literal, en dos sitios:**

| `contracts/canary_jit_contract_v1.json` | Valor |
|---|---|
| `:308` `engine.rule` | *"Fijar el motor por sha256, NUNCA por ruta. Un recibo que no nombra el sha256 del motor no acredita nada."* |
| `:310` `engine.deployable_engine_sha256` | `28352c508285b1eedfc889e5df40855e6e2c71207d7c806288ac8457de36ff67` |
| `:317` `engine.candidates[0].bytes` | `447943` |
| `:318` `engine.candidates[0].sha256` | `28352c50…` (el mismo) |

**Y el validador lo hace cumplir:** `tools/quality/test_canary_jit_contract.js:368-370` toma `contract.engine.deployable_engine_sha256` y **rechaza** con `E_ENGINE_SHA_UNVERIFIED` cualquier recibo cuyo `engine_sha256` no sea exactamente ése. **Con el patch aplicado y el contrato sin re-pinar, ese test se pone ROJO** — y tiene razón: el motor ya no es el que el contrato declara.

**Artefactos que citan `28352c50…` y quedan desfasados en cuanto se aplique el patch** (medido: **19 apariciones en 11 ficheros** fuera de `.agent-teams/` — 10 artefactos del equipo + 1 volcado de `scratch/`; este README no se cuenta a sí mismo):

- `contracts/canary_jit_contract_v1.json` `:310`, `:318`
- `docs/audits/14_CANARY_FINAL_REPORT.md` `:70`, `:280`, `:295`
- `docs/audits/ACCEPTANCE_MATRIX_20261111.json` `:102`
- `docs/audits/JIT_TRUTH_20261111.md` `:43`, `:69`
- `docs/audits/JIT_HTTP_PROBES_20261111.md` `:30`, `:57`, `:227`, `:367`
- `docs/audits/VEREDICTO_CANARY_JIT_20261111.md` `:177`, `:538`
- `docs/audits/CANARY_TRUTH_20261111.md` `:365`
- `docs/audits/ADVERSARIAL_CANARY_JIT_20261111.md` `:18`
- `docs/manifestos/CANARY_JIT_CONTRACT_20261111.md` `:286`
- `docs/canary/deliverables/12_CANARY_DEPLOYMENT_RECEIPT.json` `:372`

### 5.1 Procedimiento de re-pin (obligatorio si se aplica)

1. `git apply docs/canary/fixes/04_engine_dos/0004-engine-tdz-dos.patch`
2. `node -c tools/lab/ape-jit/server.js` → **exit 0**
3. `Get-FileHash tools/lab/ape-jit/server.js -Algorithm SHA256` → **sha nuevo** (con `0004`+`0004b` medido: `290b11030f3b6bf944c14298f3fe8401c0f9bd773789e26afeca8bb9f8aeb492`; con sólo `0004` será otro distinto — **medirlo, no copiarlo de aquí**).
4. Actualizar en `contracts/canary_jit_contract_v1.json` **los tres** campos: `engine.deployable_engine_sha256` (`:310`), `engine.candidates[0].bytes` (`:317`) y `engine.candidates[0].sha256` (`:318`).
5. **Re-ejecutar `node tools/quality/test_canary_jit_contract.js`** y exigir **92/92 · RESULT=PASS · exit 0**. Sin ese verde, el re-pin es una declaración, no un hecho.
6. Volver a congelar las cifras en los 11 ficheros de la lista de arriba (informes, matriz, recibo de despliegue, manifiesto del contrato, volcado de `scratch/`). Un sha viejo en un informe es una afirmación falsa sobre qué código se auditó.
7. Confirmar que el motor **desplegado** es el nuevo: el sha en el manifiesto no prueba que el proceso corra ese código (el contrato ya lo advierte en `:303`: *"el proceso sigue con el código anterior en memoria"*). Hace falta reinicio + recibo.

**Nada de esto se ha hecho:** el contrato sigue pinando `28352c50…` porque el motor sigue siendo ese fichero, byte a byte.

---

## 6. Cómo aplicar y cómo revertir

```powershell
# Aplicar (desde la raíz del repo)
git apply docs/canary/fixes/04_engine_dos/0004-engine-tdz-dos.patch
git apply docs/canary/fixes/04_engine_dos/0004b-engine-nice-fallback.patch

# Comprobar SIN aplicar
git apply --check docs/canary/fixes/04_engine_dos/0004-engine-tdz-dos.patch   # exit 0

# Revertir (en orden inverso, con -R)
git apply -R docs/canary/fixes/04_engine_dos/0004b-engine-nice-fallback.patch
git apply -R docs/canary/fixes/04_engine_dos/0004-engine-tdz-dos.patch

# Verificar que se volvió al original
Get-FileHash tools/lab/ape-jit/server.js -Algorithm SHA256
# debe dar 28352c508285b1eedfc889e5df40855e6e2c71207d7c806288ac8457de36ff67
```

Tras revertir, **el contrato vuelve a estar alineado sin tocar nada**: el pin nunca se movió.

---

## 7. Límites de esta entrega

| Afirmación | Estado |
|---|---|
| Antes del patch, `/meta/<id válido>.json` mata el proceso | **VERIFICADO** (traza literal + `ECONNRESET` + `exit 1` + puerto cerrado) |
| Después del patch, la misma petición responde y el proceso sobrevive | **VERIFICADO** (200, `/health` 200, 1 socket en LISTEN, `exitCode=null`) |
| `/meta/999999.json` sigue dando 404 y no mata | **VERIFICADO** antes y después |
| El patch aplica limpio | **VERIFICADO** (`git apply --check` exit 0 en el repo real, y `git apply` exit 0 en la copia) |
| El repo real queda intacto | **VERIFICADO** (mismo sha256 antes y después) |
| El patch cierra **todos** los caminos a la TDZ | **NO_COMPUTADO**: sólo se ha ejercitado la ruta `/meta`. `CAPACITY_*` no se referencia en ningún otro punto (barrido: 13 apariciones, todas en `capacityForHeight`/`capacityVerdict` y sus llamadas), pero **no se ha hecho un test de cobertura de rutas** |
| El motor funciona con ffmpeg real tras el patch | **NO_COMPUTADO**: no hay proveedor ni fuente real en esta demostración; el catálogo apunta a un `http://127.0.0.1:3400` que no existe. Se ha probado el handler, no la transcodificación |
| `0004b` mejora el arranque en Windows | **NO_COMPUTADO** end-to-end: se razona desde el código (`/usr/bin/nice` no existe en Windows) y se replica el patrón medido en B, pero no se ha ejecutado un job completo |
| Hay otras TDZ latentes en el handler | **NO_COMPUTADO**: no se auditó el cuerpo completo de 2.700+ líneas en busca de `const` usados antes de su declaración. Este patch cierra **la medida**; no certifica el resto |

---

## 8. Reproducción (comandos usados)

```powershell
# 1) identidad del artefacto
$ s = tools/lab/ape-jit/server.js   # 447.943 B / 28352c50… / 9.212 líneas LF

# 2) ANTES — copia en %TEMP%, catálogo de 2 ids, arranque en 3199
node <harness>.js   # /health 200 -> /meta/999999 404 -> /health 200 -> /meta/1 -> ECONNRESET -> /health ECONNREFUSED

# 3) aplicar los parches en la copia
git -C <copia> init -q
git -C <copia> -c core.autocrlf=false apply <repo>/docs/canary/fixes/04_engine_dos/0004-engine-tdz-dos.patch
git -C <copia> -c core.autocrlf=false apply <repo>/docs/canary/fixes/04_engine_dos/0004b-engine-nice-fallback.patch

# 4) DESPUÉS — misma batería
# /meta/1.json -> 200 ; /health -> 200 ; exitCode=null ; LISTEN 3199 = 1 ; stderr vacío

# 5) limpieza
# SIGKILL al hijo ; Get-NetTCPConnection -LocalPort 3199 -State Listen -> 0
```

# VEREDICTO FINAL — Canary ↔ JIT: gates, auditoría metacog y claim por claim

**Fecha:** 2026-11-11 · **Rol:** gate-runner (verificador final) · **Tarea:** t6 · **Ámbito:** solo lectura + este informe.
**Workdir:** `C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION`
**Host de auditoría:** Windows · `node v24.12.0` · `ffmpeg 8.0.1-full_build` (Gyan).
**Base git:** `472f7cc330e52dc2f7e3d16f6a451fd0b461949e` (`472f7cc3`), rama `audit/rea-alignment-20261108`.

## Límite de método, declarado antes de concluir

- **No desplegué, no hice push, no toqué el VPS, no tuve device, no tuve SSH.** Todo lo que depende del estado vivo del servidor es `NO_COMPUTADO` y va marcado así.
- **No arreglé ningún gate.** El gate que falla, falla; se reporta con su causa y su prueba de preexistencia.
- **Sí ejecuté motores en loopback** (puerto 3199) para reproducir H1, y **terminé el proceso**. Cero red externa. Los artefactos temporales se crearon en `%TEMP%\gater6` y se borraron; **nada se escribió dentro del repo salvo este fichero**.
- **Un número sin denominador no es un dato** (lección de t1/t2/t3, que contaron líneas con dos convenciones y ambos tenían razón). Aquí cada conteo declara su convención.

---

## 1. Gates del repo — exit code literal

Comando, salida y código de cada gate, tal cual. `stdout` y `stderr` se capturaron juntos (`2>&1`).

| # | Gate | Exit code | TOTAL / PASS / FAIL | Veredicto |
|---|---|---|---|---|
| 1 | `node tools/check_anti_degradation_policy.js` | **1** | `TOTAL=8 PASS=7 FAIL=1` | **ROJO** — falla |
| 2 | `node tools/check_crystal_4k_law.js` | **0** | `TOTAL=5 PASS=5 FAIL=0` | VERDE |
| 3 | `node tools/check_crystal_6k_law.js` | **0** | `TOTAL=6 PASS=6 FAIL=0` | VERDE |
| 4 | `node -c tools/quality/test_canary_jit_contract.js` | **0** | (sin salida) | VERDE — sintaxis |
| 5 | `node tools/quality/test_canary_jit_contract.js` | **0** | `total: 92/92 … RESULT=PASS` | VERDE |

### 1.1 Salida literal del gate que falla

```text
PASS law exists
PASS law forbids 4K→FHD
PASS contract mandatory
PASS contract forbids fallback
PASS contract allows JIT copy
PASS AGENTS references law
PASS JIT escaneado (código, no solo doctrina) · 3 de 3 implementaciones presentes
FAIL sin degradacion NUEVA en el codigo JIT · tools/lab/ape-jit/server.js :: stereo_locked 0 -> 3
  [DEGRADA] vps_jit/server.js  fps_locked=2 stereo_locked=3 downscale_2k=0 scale_small=2 audio_passthrough=0
  [DEGRADA] IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js  fps_locked=2 stereo_locked=3 downscale_2k=2 scale_small=2 audio_passthrough=0
  [CUMPLE] tools/lab/ape-jit/server.js  fps_locked=0 stereo_locked=3 downscale_2k=0 scale_small=0 audio_passthrough=1

TOTAL=8 PASS=7 FAIL=1
```

`EXITCODE=1`. **No es verde por omisión: es rojo y se reporta rojo.**

### 1.2 Prueba de PREEXISTENCIA (worktree desechable en `%TEMP%`)

No basta decir «es preexistente»: se demuestra ejecutándolo sobre la base.

```
git worktree add --detach C:\Users\HFRC\AppData\Local\Temp\jitr6_91bf2dc6 472f7cc3   -> exit 0
git -C <wt> log -1  ->  472f7cc330e52dc2f7e3d16f6a451fd0b461949e
node tools/check_anti_degradation_policy.js   (cwd = worktree)  ->  exit 1
```

Salida en la base limpia — **idéntica línea por línea** a la del árbol de trabajo:

```text
FAIL sin degradacion NUEVA en el codigo JIT · tools/lab/ape-jit/server.js :: stereo_locked 0 -> 3
  [DEGRADA] vps_jit/server.js  ... audio_passthrough=0
  [DEGRADA] IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js  ... downscale_2k=2 ... audio_passthrough=0
  [CUMPLE] tools/lab/ape-jit/server.js  ... stereo_locked=3 ... audio_passthrough=1
TOTAL=8 PASS=7 FAIL=1
EXITCODE_base=1
```

**Veredicto: PREEXISTENTE.** El gate estaba rojo antes de que el equipo escribiera una línea: los cuatro ficheros que lo determinan (`tools/lab/ape-jit/server.js`, `vps_jit/server.js`, `IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js`, `contracts/anti_degradation_jit_baseline.json`) son **tracked y con diff CERO** contra `472f7cc3`:

```
git diff --stat 472f7cc3 -- tools/lab/ape-jit/server.js contracts/anti_degradation_jit_baseline.json vps_jit/server.js IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js
(sin salida, exit 0)
```

Los tres entregables del equipo (`contracts/canary_jit_contract_v1.json`, `tools/quality/test_canary_jit_contract.js`, `docs/manifestos/CANARY_JIT_CONTRACT_20261111.md`) figuran como `??` (untracked): **no pueden ser la causa de un gate que lee ficheros tracked e inmutables.** El worktree se eliminó (`git worktree remove --force` → exit 0) y `git worktree list` no lo conserva.

### 1.3 Causa raíz del rojo: **falso positivo por prosa** (hallazgo propio)

El gate cuenta ocurrencias por regex, y una regex no distingue **emitir** `-ac 2` de **prohibirlo**. Las 3 coincidencias en el motor A son texto que **prohíbe** degradar:

| Línea | Texto literal | ¿Emite `-ac 2`? |
|---|---|---|
| `tools/lab/ape-jit/server.js:557` | `audio: 'preserve',            // NO -ac 2 universal: eso degrada 5.1 a estereo` | **NO** — comentario |
| `:990` | `'5. NUNCA poner -ac 2 universal: degradaria 5.1 a estereo. audio_mode debe seguir passthrough_safe.'` | **NO** — texto de instrucción |
| `:3234` | `audio: { value: 'preserve', reason: 'NO se fuerza -ac 2: eso degradaria 5.1 a estereo' }` | **NO** — motivo declarado |

El patrón es `/-ac['",\s]+2/g` (`tools/check_anti_degradation_policy.js:45`) y no tiene guarda de comentario ni de string. La comprobación `sin degradacion NUEVA` compara además contra una línea base que declara `stereo_locked: 0` para A (`contracts/anti_degradation_jit_baseline.json:24`), de modo que cualquier mención textual nueva reabre el FAIL. **Es un defecto del gate, no del motor, y NO se ha tocado** (regla de la tarea: un fallo no se arregla para que pase).

> Consecuencia para el veredicto: el rojo **no** acusa al motor A de degradar el audio, pero **sí deja el gate inservible como señal de audio** mientras no distinga código de comentario. Se reporta como hallazgo, con severidad MEDIA, para que lo decida el operador.

---

## 2. Validador del contrato — verde, y con control negativo propio

### 2.1 Ejecución sobre el original

```
node tools/quality/test_canary_jit_contract.js   ->  EXITCODE=0
  contrato: contracts/canary_jit_contract_v1.json sha256=488b87609a02c69d…
  fixtures: 55/55 PASS  (FAIL 0)
  coherencia del contrato: PASS  (27/27 checks)
  campos load-bearing: 10/10 PASS  (FAIL 0)  redundantes declarados: output.level=REDUNDANTE_COVERED_BY:E_LEVEL_RESOLUTION_IMPOSSIBLE
  aceptados: 5 | envenenados rechazados: 50
  total: 92/92 comprobaciones | fallos: 0
  RESULT=PASS
```

Un fallo del validador habría bloqueado el veredicto positivo. **No hay fallo.**

### 2.2 Control negativo reproducido por mí (el gate PUEDE fallar)

Muté **una copia** en `%TEMP%` —nunca el original— con `deployability.loop_artifact.manifest_rows = 1`
(el script de 144 líneas que **no** tiene fila en el manifiesto, declarado como desplegado). El validador admite `--contract <ruta>` (`tools/quality/test_canary_jit_contract.js:42`).

```text
node tools/quality/test_canary_jit_contract.js --contract %TEMP%\gater6\poisoned_contract.json
  FAIL  artefacto del bucle NOT_DEPLOYED  [jit_hits=7 rows=1]
  FAIL  [14] artefacto sin fila en manifest.tsv declarado desplegado  -> ACCEPT/OK_APPLIED_MEASURED
  fixtures: 54/55 PASS  (FAIL 1)
  coherencia del contrato: FAIL  (26/27 checks)
  total: 90/92 comprobaciones | fallos: 2
  RESULT=FAIL
EXITCODE_negative=1
```

Coincide **exactamente** con lo que t10 congeló para esa mutación (90/92, fallos 2, exit 1). El fixture `[14]` demuestra que el gate detecta la mentira de despliegue: con el contrato envenenado la lógica mutada **acepta** el recibo y el gate lo caza. **No es un gate decorativo.**

### 2.3 El original queda intacto (sha256 antes / después)

| Momento | Bytes | sha256 |
|---|---|---|
| Antes del control negativo | 35.791 | `488b87609a02c69d0ecffba17ea532fc8142964f3fdeb98e4cd8cc70e1395514` |
| Después del control negativo | 35.791 | `488b87609a02c69d0ecffba17ea532fc8142964f3fdeb98e4cd8cc70e1395514` |
| Re-ejecución del validador sobre el original | — | `RESULT=PASS` · `total: 92/92` · exit **0** |

Idénticos byte a byte. Los hashes de los tres entregables coinciden además con los que declararon t5/t8/t11/t12:

| Entregable | Bytes | Líneas | sha256 |
|---|---|---|---|
| `contracts/canary_jit_contract_v1.json` | 35.791 | 457 | `488b87609a02c69d0ecffba17ea532fc8142964f3fdeb98e4cd8cc70e1395514` |
| `tools/quality/test_canary_jit_contract.js` | 71.957 | 1.292 | `0869149200cc0e7290e7de112fd0aa81914726435fd67989b34f29628169680b` |
| `docs/manifestos/CANARY_JIT_CONTRACT_20261111.md` | 32.264 | 481 | `96dd7f5714b315d00bc59c1914451e11dee445d14bfd38cfec76ee6689f443eb` |

---

## 3. H-1 verificado de forma independiente — hay DOS copias y se despliega la que NO tiene JIT

Medido por mí con dos métodos de hash independientes (SHA-256 de .NET y `certutil`), convención de líneas = número de `\n` (estilo `wc -l`).

| Copia | Bytes | Líneas | sha256 | Líneas con `jit` | ¿En `manifest.tsv`? |
|---|---|---|---|---|---|
| `_vps_stage/canary/ape-visual-emulate.sh` | **4.068** | **80** | `653b56e1ef964bc6a3d0cb32a48724ca2b04969faaa0612804e923c41f7243f8` | **0** | **SÍ — L39** |
| `vps/bin/ape-visual-emulate.sh` | **6.714** | **144** | `f1d2ecff6e6468eb58e04658703a34df8b0e2df1c7d61540abbb84ebf768fec1` | **7** | **NO — 0 filas** |

Sobre el conteo de `jit`: 7 es el número de **líneas** que contienen `jit` (case-insensitive). El número de **ocurrencias crudas** es 9 (3 en minúscula + 6 en mayúscula) y el de minúsculas exactas es 3. Se declaran los tres denominadores porque el contrato usa el de líneas (`artefacto del bucle NOT_DEPLOYED [jit_hits=7 rows=0]`, coherente con mi medición).

**La fila que se despliega** (`_vps_stage/deploy/manifest.tsv:39`, manifiesto de 6.501 B / 60 filas no vacías / sha256 `5f5adcf10f66e742…`):

```
L39: _vps_stage/canary/ape-visual-emulate.sh	/usr/local/bin/ape-visual-emulate.sh	755	root:root	canary 4K (25M/32M/64M keyint 48)
```

Búsqueda de la copia con bucle en el manifiesto: `jit|emulate|canary` sobre las 60 filas → **ninguna fila** apunta a `vps/bin/ape-visual-emulate.sh`.

**Veredicto H-1: CONFIRMADO.** La receta integrada Canary↔JIT (la de 144 líneas, la única que hace `POST /jit/signal`) **NO es desplegable**: no tiene fila en el manifiesto. Lo que corre en `/usr/local/bin/ape-visual-emulate.sh` es la versión de 80 líneas, que no contiene ni una llamada a JIT. **Integrar exige cambiar `manifest.tsv:39`; nadie lo ha hecho.** La consecuencia es la del contrato: un artefacto no está desplegado por existir en el repo.

---

## 4. Informe de http-probes — identifica el artefacto y separa A de B

El informe `docs/audits/JIT_HTTP_PROBES_20261111.md` (26.540 B, sha256 `f1c2510582a9f154…`) identifica por **sha256 + bytes + líneas** qué artefacto respondió a cada petición, que es la condición para que el veredicto no sea prosa:

| | Artefacto | Bytes | Líneas no vacías | sha256 | Rol |
|---|---|---|---|---|---|
| **A** | `tools/lab/ape-jit/server.js` | 447.943 | 8.695 | `28352c508285b1eedfc889e5df40855e6e2c71207d7c806288ac8457de36ff67` | **DESPLEGABLE** (`manifest.tsv:59`) |
| **B** | `IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js` | 45.535 | 918 | `8405f78412dc2a984f690b7270e891d050740d88358f10ca5818f905151fbae0` | **NO desplegable** |

Verifiqué esos bytes y hashes de forma independiente: **coinciden**. También confirmé la fila que convierte a A en desplegable:

```
manifest.tsv:59: tools/lab/ape-jit/server.js	/opt/ape-jit/server.js	644	root:root	motor JIT: ... [OJO: necesita systemctl restart ape-jit, deploy.sh NO lo hace]
```

**El reparto 206 es el correcto y decisivo**, y lo suscribo:

| Familia | A (desplegable) | B (espejo no desplegable) |
|---|---|---|
| **206** | **0 / 2 — NO_REPRODUCIDO** | **2 / 2 — REPRODUCIDO** con `Content-Range` exacto |
| 200 | 5 / 6 (el 6.º mata el proceso) | 6 / 6 |
| 302 | 1 / 1 (5 variantes) | 1 / 1 |

Es decir: **el 206 que NO se reproduce corresponde al artefacto que sí se despliega, y el 206 que sí se reproduce corresponde al espejo que no se despliega.** Cualquier «206 verificado» atribuido a A en este host sería falso. El propio informe lo declara así (§5 y §7) y no rellena el hueco: `NO_REPRODUCIDO` sobre A, con la causa raíz medida.

---

## 5. H1 reproducido por mí — `GET /meta/<id válido>.json` mata el motor A

No lo leí: lo ejecuté. Motor A (`tools/lab/ape-jit/server.js`, el que el manifiesto mapea) en `127.0.0.1:3199`, catálogo de 2 canales en `%TEMP%`, `ffmpeg` disponible en el host.

**Línea base (el motor vivo atiende):**

```
GET /health          -> 200  {"ok":true,"active":null,"pid":null,"uptime_s":0}
GET /catalog.json    -> 200  {"service":"ape-jit-cmaf","count":2,"channels":[{"id":"1",…},{"id":"2",…}]}
```

**La ruta con id INVÁLIDO sobrevive** (control exigido por el contrato):

```
GET /meta/999999.json -> 404  "unknown channel"
GET /health (después) -> 200
```

**La petición única con id VÁLIDO termina el proceso:**

```
GET /meta/1.json
  curl: exit 56 (recv failure)      <- cero bytes, cero cabeceras
  /health después                   -> 000   (puerto cerrado)
  Get-NetTCPConnection -LocalPort 3199 -State Listen -> NINGÚN LISTENER
  proceso node                      -> exit code 1
```

**Traza literal de `stderr` (está en la línea que dice):**

```text
C:\...\tools\lab\ape-jit\server.js:8000
  for (const k of Object.keys(CAPACITY_FPS).map(Number).sort((a, b) => b - a)) {
                              ^

ReferenceError: Cannot access 'CAPACITY_FPS' before initialization
    at capacityForHeight (...\tools\lab\ape-jit\server.js:8000:31)
    at capacityVerdict (...\tools\lab\ape-jit\server.js:8009:15)
    at Server.<anonymous> (...\tools\lab\ape-jit\server.js:6183:17)
    at Server.emit (node:events:508:28)
    at parserOnIncoming (node:_http_server:1210:12)
    at HTTPParser.parserOnHeadersComplete (node:_http_common:123:17)

Node.js v24.12.0
```

**Mecanismo confirmado leyendo el código, no el informe:** `const CAPACITY_FPS` está en `A:7993`, **después** del bloque de rutas que empieza en `A:6167`. El handler de `/meta` (`A:6168`) llega a `A:6183` **antes** de que se evalúe la declaración → el binding está en TDZ permanente. `capacityForHeight` **sí** es invocable porque las declaraciones `function` se hoistean; su `const` asociado, no. Por eso `/meta/999999.json` vive (retorna en `A:6172`, antes del punto de fallo) y `/meta/1.json` muere.

**Veredicto H1: REPRODUCIDO, 1 de 1 en mi corrida** (el informe reporta 2 de 2 en la suya). Severidad **BLOCKER**: DoS no autenticado de una sola petición contra el artefacto desplegable.

---

## 6. H2 — diferencia de código real, con CALIFICACIÓN DE HOST

La diferencia entre A y B es real y se cita:

| | A (desplegable) | B (no desplegable) |
|---|---|---|
| Línea | `A:4865` `const child = spawn('nice', ['-n', '19', 'ffmpeg', ...args], {` | `B:26` `const NICE_BIN = fs.existsSync('/usr/bin/nice') ? '/usr/bin/nice' : '';` <br> `B:27` `const FFMPEG_BIN = fs.existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg';` <br> `B:427` `spawn(NICE_BIN \|\| FFMPEG_BIN, NICE_BIN ? [...] : args, {` |
| Comentario del fix | — | `B:24-25` `// FIX 2026-11-07: spawn('nice', ...) resolvia por PATH y un ENOENT no decia si faltaba nice, ffmpeg o el cwd. Rutas absolutas si existen.` |

**Calificación de host, sin extrapolar:** el `SPAWN_ERROR spawn nice ENOENT` está medido en **este host de auditoría Windows**, donde `nice` no existe. **A no «falla en producción» por esta causa.** En el VPS Linux `/usr/bin/nice` existe. La alcanzabilidad real del 206 en el VPS Linux es **NO_COMPUTADO** (sin SSH). Lo que sí queda probado, y es un defecto de producto, es (a) la falta de fallback que B ya tiene y (b) el retardo del fallo: A retiene la petición 135,9 s antes de responder 503, en vez de fallar rápido.

> **Queda prohibido por este informe** afirmar que el motor desplegable falla en producción por H2. Motivo: la única medición es de un host sin `nice` y sin VPS.

---

## 7. A vs B — qué defecto es de quién, y cuál cumple la ley

Medido por mí sobre los dos ficheros, por separado:

| Defecto | A (desplegable) | B (no desplegable) |
|---|---|---|
| `-ac 2` emitido | **0** (las 3 coincidencias son prosa que lo PROHÍBE, §1.3) | 0 coincidencias literales; `audio_passthrough=0` |
| `-level:v` | **0** | **2** líneas |
| `max-cll` | **0** | **1** línea |
| `/sdr/` como ruta | **SÍ** — `A:9010`, `A:9036`, `A:9040-9047` | **SÍ** — 39 líneas con `sdr720` |
| `sdr720` | **45** líneas | 39 líneas |
| `fps_locked` / `downscale_2k` / `scale_small` (gate) | 0 / 0 / 0 | **2 / 2 / 2** |
| `audio_passthrough` (gate) | **1** (hay rama `-c:a copy`) | **0** |

**Cuál cumple la ley anti-degradación:** **A**, y lo sostiene la línea del propio gate:

```
[CUMPLE] tools/lab/ape-jit/server.js  fps_locked=0 stereo_locked=3 downscale_2k=0 scale_small=0 audio_passthrough=1
```

frente a

```
[DEGRADA] IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js  fps_locked=2 ... downscale_2k=2 scale_small=2 audio_passthrough=0
```

El contrapeso que decide es `audio_passthrough` (`tools/check_anti_degradation_policy.js:59-62`): si hay `-ac 2` y **no** hay ninguna rama de copia de audio, la reducción es incondicional. A tiene `-c:a copy`; B no.

### 7.1 CORRECCIÓN AL BRIEF — «A no tiene rutas `/sdr/` ni `/sdr720/`» es **CONTRADICHO**

El brief da por cierto que A carece de esas rutas. **No es cierto**, y mi primer grep tampoco lo habría visto: buscar el literal `/sdr/` da 0 porque el código las escribe **escapadas dentro de una regex**.

```js
A:9010:  const jm = u.pathname.match(/^\/live\/([^/]+)\/(sdr720\/|sdr\/)?manifest\.json$/);
A:9036:  const m  = u.pathname.match(/^\/live\/([^/]+)\/(sdr720\/|sdr\/)?(master\.m3u8|index\.m3u8|manifest\.mpd|media_[0-9]+\.m3u8|init-…|chunk-…)$/);
A:9040:  const sdr720 = m[2] === 'sdr720/';
A:9041:  const sdr    = !sdr720 && m[2] === 'sdr/';
A:9047:  start(id, map[id], sdr, sdr720)
A:6162:  SDR720_STABLE: 'H.264 1280x720 SDR continuity fallback',
A:4618:  … is720 ? 'SDR720_STABLE' …
```

Una sola petición a `/live/<id>/sdr720/master.m3u8` **arranca un plan 720p H.264 SDR** en el motor desplegable. Eso es una **vía de degradación servible por URL**, y la ley solo la autoriza con permiso escrito del propietario (`canal_id, device_id, degradación, motivo, fecha`) — no consta ninguno.

**Consecuencia honesta, en dos partes que no se pueden fusionar:**

1. **A cumple** en los ejes que el brief nombra (`-ac 2`, `-level:v`, `max-cll`): 0 coincidencias. Atribuirle esos defectos sería atribuirle los de B.
2. **A NO cumple** en el eje `sdr720`/`sdr`: expone un *continuity fallback* a 1280×720 H.264 SDR. El gate no puede verlo porque su juego de patrones no tiene detector de `sdr720` (`tools/check_anti_degradation_policy.js:43-48`).

El informe adversarial (§10.3) dice «A no tiene … rutas `/sdr/`»; **esa frase es incorrecta** y este informe la corrige con las líneas de arriba. La conclusión de fondo del adversarial (A es el que cumple, B el que degrada) se mantiene, pero **no de forma absoluta**.

---

## 8. LA INVERSIÓN DE DIRECCIÓN — el hallazgo que decide

Este es el punto que decide la tesis, y está en el código, no en un juicio de valor.

**El motor dice quién manda (A, texto literal):**

```text
A:7913:  * /jit/signal — EL CANARY MIDE, EL JIT AJUSTA, EL CANARY EJECUTA
A:7920:  * EL BUCLE:
A:7921:  *   1. el canary sondea la fuente (ffprobe) y reporta aqui las condiciones
A:7922:  *   2. el JIT deriva la BANDA de entrada y busca en SU TABLA DE 16 REGLAS la
A:7923:  *      fila que casa por (banda, fps de entrada)
A:7924:  *   3. devuelve los parametros de esa fila Y la cadena ffmpeg ya montada
A:7925:  *   4. el canary ejecuta EXACTAMENTE esa cadena (geometria a 4K para su prueba)
A:7926:  *   5. lo reportado queda guardado por canal, asi el JIT ajusta en vivo
```

Y la admisión de que la receta del Canary **no** era la que se entregaba:

```text
A:7902:  *   El canary validaba visualmente UNA receta y el JIT aplicaba OTRA distinta:
A:7903:  *     canary: deblock, smartblur, yuv444p, 4K lanczos, noise, unsharp 0.8, eq, 8-bit
A:7904:  *     JIT   : hqdn3d, unsharp 0.2, scale+pad al target, zscale->PQ, 10-bit
A:7905:  *   La prueba visual del canary NO aplicaba a lo que se entrega.
```

**El script dice quién obedece (`vps/bin/ape-visual-emulate.sh`):**

```text
L49:  # BUCLE CERRADO: el canary MIDE la senal, la REPORTA al JIT y EJECUTA la cadena
L50:  # que el JIT devuelve segun su tabla de reglas ENTRADA -> SALIDA.
L80:  RESP="$(curl -s --max-time 8 -X POST -H 'Content-Type: application/json' -d "$PAYLOAD" http://127.0.0.1:3099/jit/signal 2>/dev/null || true)"
L98:  MODO="JIT-REGLA ($REGLA)"
L102: MODO="CANARY-LEGACY (sin /jit/signal: NO se valido la regla real, se declara)"
L141: d["validates"]=("jit_rule" if str(d.get("mode","")).startswith("JIT-REGLA") else "canary_legacy")
```

Y el pedido del propio operador, citado en el motor:

```text
A:7915:  * PEDIDO DEL OPERADOR: "que el canary reporte al JIT las condiciones de la
A:7916:  * senal y el jit ajuste sus parametros para que el canary los ejecute, y el jit
A:7917:  * vivira ajustando sus parametros en torno a eso …
```

**Veredicto sobre la premisa «Canary es la autoridad y JIT su consumidor»: INVERTIDA respecto al diseño registrado en el código.** En el único bucle cerrado que existe, **el JIT decide la cadena y el Canary la ejecuta**, y el JIT deja constancia de que su tabla (`RULES_SEED` / `transform-rules.json`) manda sobre la validación visual del Canary. Canary aporta la **medición** (ffprobe de la fuente) y el **instrumento de verificación**; no aporta la receta que se ejecuta. Además `grep quality-policy` en A → **0**: el motor no lee la política de Canary en su ruta de producción.

Además, y en sentido contrario a la autoridad: **en aspect ratio el consumidor es más correcto que la autoridad.** Canary usa `scale=3840:2160` (deforma fuentes no 16:9, y su propia política lo advierte: `quality-policy.json:18` *«original scale 3840:2160 can stretch non-16:9 inputs»*), mientras el motor usa `force_original_aspect_ratio=decrease` + `pad` (`A:8668-8670`). La autoridad de la receta tiene un defecto que el consumidor ya corrigió.

---

## 9. El enlace `/jit` — el 302 no está roto, le falta dueño

**El proxy existe** (`vps/nginx/snippets/ape-jit.conf`):

```nginx
L40: location ^~ /jit/ {
L41:   proxy_pass http://127.0.0.1:3099/;
L46:   proxy_buffering off;
L49:   proxy_read_timeout 65s;
```

La **barra final** de `proxy_pass` retira el prefijo `/jit`. Por tanto `…/jit/live/1/media_0.m3u8` llega al upstream como `/live/1/media_0.m3u8`, que **es** su ruta real.

**El generador emite `/jit/live/`** (`IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/generation-output-panel.js`):

```text
:96   function jitUrlForChannel(channel) { … }
:342  var dash = String(active.dash || (base + '/jit/live/' + encodeURIComponent(active.id) + '/manifest.mpd'));
:1003 '<a href="https://iptv-ape.duckdns.org/jit/live/1174213/manifest.mpd" …>DASH 4K</a>'
```

y queda probado en `tools/quality/test_out_opts.js:113` (`tvg_id '3' → https://iptv-ape.duckdns.org/jit/live/3/master.m3u8`).

**Conclusión:** el 302 **no es un puntero roto**. Es un acoplamiento: la `Location` solo es servible detrás de un proxy que retire el prefijo, y ese proxy existe en producción. En loopback da 404 porque nadie retira el prefijo. **El contrato debe fijar QUIÉN sirve ese path** (el nginx del VPS con `location ^~ /jit/` + barra final), **no «arreglar» el 302**. Rebajo la severidad de H-3 de ALTA a MEDIA, con el mismo razonamiento del adversarial y con las líneas de arriba.

---

## 10. El contrato SÍ puede expresar el encoder real, y RECHAZA los recibos falsos

**Puede expresarlo** — el contrato pina exactamente lo que el script ejecuta:

| Contrato (`contracts/canary_jit_contract_v1.json`) | Script real (`_vps_stage/canary/ape-visual-emulate.sh:60-62` = `vps/bin/…:112-114`) |
|---|---|
| `"video_codec":"libx265"`, `preset":"ultrafast"`, `tune":"zerolatency"` | `-c:v libx265 -preset ultrafast -tune zerolatency` |
| `x265_params`: `bframes=0, frame-threads=1, keyint=48, min-keyint=48, pools=1, rc-lookahead=0, scenecut=0` | `-x265-params pools=1:frame-threads=1:keyint=48:min-keyint=48:scenecut=0:bframes=0:rc-lookahead=0` |
| `rate_control`: `b_v:25M`, `maxrate:32M`, `bufsize:64M` (L125) | `-b:v 25M -maxrate 32M -bufsize 64M` |
| `gop`: `g=48`, `keyint_min=48`, `sc_threshold=0` | `-g 48 -keyint_min 48 -sc_threshold 0` |

Huella canónica auto-consistente: `sha16=fb0bc96cdcc4f166` (`…|b:v=25M|maxrate=32M|bufsize=64M|g=48|keyint_min=48|sc_threshold=0`), verificada por el propio validador (`PASS huella encoder auto-consistente`).

**Y RECHAZA los dos casos exigidos** (ejecutados, no leídos):

```text
PASS  [12] encoder sin rate control ni GOP                          -> REJECT/E_ENCODER_BLOCK_INCOMPLETE
PASS  [13] recibo de chain_4k_test que pretende acreditar encoder    -> REJECT/E_RECEIPT_INSUFFICIENT_FOR_ENCODER
```

El código de rechazo está declarado en el contrato (`E_ENCODER_BLOCK_INCOMPLETE`, `E_ENCODER_FINGERPRINT_MISMATCH`, L430-431) y hay fixture que lo ejercita. Cobertura declarada = ejercitada = **23/23**.

> **Matiz que el contrato debe reconocer:** el encoder canónico es el de los **scripts shell**. El `canary-render.js` del paquete experimental usa otro encoder —`-g 5 -keyint_min 5` y `x265-params pools=1:frame-threads=1`, sin rate control (`canary-render.js:20-21`)—. Es una divergencia real entre el instrumento de paridad y la receta desplegada; no rompe el contrato (que pina los scripts), pero un recibo generado con `canary-render.js` **no** acreditaría el encoder canónico, y el fixture `[23]` (`E_ENCODER_FINGERPRINT_MISMATCH`) lo rechazaría correctamente.

---

## 11. Violaciones de protocolo medidas — severidad, fichero y línea

| ID | Violación | Severidad | Artefacto donde se midió | Fichero:línea | Evidencia |
|---|---|---|---|---|---|
| **P-1** | **`If-Range` ignorado** (RFC 7233 §3.2: validador que no casa ⇒ 200 con cuerpo completo; el motor devuelve **206 parcial**) | **MEDIA** | **B** (espejo no desplegable; en A la ruta no es alcanzable por H2) | `sendStatic` `A:5213-5255` — **0 ocurrencias de `If-Range` en todo A** | Medido en B: `If-Range: "bogus"` + `Range: bytes=0-99` → **206**, `Content-Range: bytes 0-99/16669658`. Un cliente que reanuda recibe bytes incorrectos en vez de cuerpo completo |
| **P-2** | **Sin filtro de método HTTP**: POST/DELETE alcanzan handlers de lectura | **MEDIA** | **A y B** | `A:6059-6062` (solo intercepta `OPTIONS`) | Medido: `POST /health` → **200**, `DELETE /catalog.json` → **200** (ambos artefactos). En B, `POST /live/<id>/master.m3u8` llega a arrancar ffmpeg |
| **P-3** | **Inyección de `Host` en la cabecera `Location`** (open redirect / cache poisoning) | **ALTA** | **A y B** | `A:5282-5285` `publicBase()`: `req.headers.host` y `x-forwarded-proto` **sin allowlist** | Medido: `Host: evil.example` → `Location: https://evil.example/jit/live/1/media_0.m3u8` (302). No se siguió la redirección (regla de alcance: nada fuera de loopback) |
| **P-4** | `If-Modified-Since` no produce 304 (solo ETag) | BAJA | B | `isFresh` `A:4412-4413` (solo `if-none-match`) | `If-Modified-Since: <futuro>` → **200**, nunca 304 |
| **P-5** | 302 apunta a ruta virtual `/jit/live/…` | MEDIA (era ALTA) | A y B | `A:6356` + `publicBase` `A:5282-5285` | 404 en loopback; servible solo detrás de `location ^~ /jit/` (§9) |

**Nota de honestidad sobre P-1:** en A no es medible en este host porque no hay segmentos (H2). Se midió sobre B y el código es el mismo patrón `sendStatic` en ambos. **No extrapolo el resultado de B a A sin decirlo:** lo que afirmo de A es la lectura de código (0 ocurrencias de `If-Range`), y lo que afirmo de B es la medición.

---

## 12. Auditoría metacog sobre la afirmación consolidada del operador

Ejecutada con `metacog_audit` sobre los 7 fragmentos, con 9 evidencias (todas con `ref` verificable de las que leí). Salida literal (recortada solo en el bloque de método):

```json
{
 "veredicto": "CONTRADICHO",
 "conteo": { "fragmentos": 8, "soportados": 3, "no_soportados": 1, "contradichos": 8,
             "evidencia_total": 9, "evidencia_sin_artefacto": 0, "evidencia_no_atribuida": 1 },
 "fragmentos": [
  {"indice":2,"texto":"Las pruebas de configuracion son 9/9 correctas.","veredicto":"CONTRADICHO",
   "razon":"evidencia atribuida que REFUTA: E1 (…/tests/canary-quality.test.js)"},
  {"indice":3,"texto":"La prueba sintetica es 25 fps HEVC + AAC.","veredicto":"CONTRADICHO",
   "razon":"evidencia atribuida que REFUTA: E3 (…/canary/canary-render.js:19), E6 (…/CANARY_TRUTH_20261111.md:568)"},
  {"indice":4,"texto":"El empaquetado genero HLS + DASH con manifiestos y fragmentos.","veredicto":"CONTRADICHO",
   "razon":"evidencia atribuida que REFUTA: E4 (…/canary/canary-render.js:22)"},
  {"indice":5,"texto":"La politica Canary quedo reproducida en codigo local con 5 pruebas aprobadas.","veredicto":"SOPORTADO",
   "razon":"evidencia atribuida: E2 (con artefacto)"},
  {"indice":6,"texto":"La integracion en GitHub esta bloqueada por permisos 403.","veredicto":"NO_SOPORTADO",
   "razon":"numero sin fuente: 403 — ni cita en linea ni evidencia atribuida a este fragmento"},
  {"indice":7,"texto":"La APK compilada y el VPS desplegado no se ejecutaron.","veredicto":"SOPORTADO",
   "razon":"evidencia atribuida: E7 (con artefacto)"},
  {"indice":8,"texto":"Tesis: Canary es la autoridad de configuracion y JIT es su consumidor.","veredicto":"CONTRADICHO",
   "razon":"evidencia atribuida que REFUTA: E8 (tools/lab/ape-jit/server.js:7913), E9 (vps/bin/ape-visual-emulate.sh:80)"}
 ],
 "faltantes": ["artefacto para 403 en: La integracion en GitHub esta bloqueada por permisos 403."],
 "evidencia_sin_artefacto": []
}
```

**Lectura correcta de la herramienta** (la que la propia herramienta declara): `NO_SOPORTADO` significa «no encontré el artefacto», **no** «es falso». Y es un filtro de forma, no un juez de verdad.

**Degradaciones aplicadas por mí, fragmento por fragmento:**

| Fragmento | Auditoría | Acción en este informe |
|---|---|---|
| «9/9 correctas» | CONTRADICHO | **Degradado.** Medido: **5** bloques `test(` y `node --test` → `tests 5 / pass 5 / fail 0`, exit 0. `'9/9'` → **0 hits** en el test, en el ZIP y en ambos PDF. Se retira el 9/9 y se publica el 5/5 medido |
| «25 fps HEVC + AAC» | CONTRADICHO | **Degradado.** `canary-render.js:19` → `'-t','6','-r','5','-an'`; `quality-policy.json:17` → `{"fps":5,"seconds":6,"audio":"disabled"}`. Es **5 fps y sin audio**. El «HEVC» sí es cierto (`libx265`). El «25 fps + AAC» es propiedad **del JIT**, no del Canary |
| «HLS + DASH con manifiestos y fragmentos» | CONTRADICHO | **Degradado a HLS-solo.** `canary-render.js:22` → `'-f','hls'`; barrido de `canary/`: `dash/mpd` hits = **0** en los 5 ficheros. Además `canary-render.js:16` es `OUTPUT_MUST_NOT_EXIST` y por defecto corre `DRY_RUN` (L24): **la generación de fragmentos no tiene recibo** |
| «5 pruebas aprobadas» | SOPORTADO | **Se mantiene.** Lo ejecuté: `tests 5 / pass 5 / fail 0 / exit 0`. `README.md:3` lo declara |
| «GitHub bloqueada por 403» | NO_SOPORTADO | **Degradado a DECLARADO / NO_COMPUTADO.** `README.md:3` dice literalmente «GitHub rechazó crear la rama con HTTP 403», pero **no hay captura de la respuesta ni log de `gh`/CI**. Un PASS citado de un documento no es artefacto reproducible: el 403 en sí queda `NO_COMPUTADO` |
| «APK y VPS no se ejecutaron» | SOPORTADO | **Se mantiene con calificación.** APK existe (24.362.980 B, sha256 `4b0c4ef3…`) y no contiene referencia a `ape-jit` ni `/jit/signal` (`CANARY_TRUTH:63`). «No se ejecutaron» se sostiene como **ausencia de recibo de ejecución**, no como prueba de no-ejecución universal. Del VPS no afirmo nada: sin SSH |
| «Canary autoridad, JIT consumidor» | CONTRADICHO | **Se retira como está escrita.** Ver §8 con líneas |

---

## 13. Veredicto por claim

| # | Claim | Veredicto | Artefacto |
|---|---|---|---|
| 1 | «Las pruebas de configuración son **9/9** correctas» | **CONTRADICHO** | `…/tests/canary-quality.test.js` → 5 bloques `test(`; `node --test` → `tests 5 / pass 5 / fail 0`, exit 0; `9/9` → 0 hits. El número medido es **5** |
| 2 | «La prueba sintética es **25 fps HEVC + AAC**» | **CONTRADICHO** | `canary-render.js:19` → `'-t','6','-r','5','-an'`; `quality-policy.json:17` → `fps:5, audio:"disabled"`. HEVC sí (`libx265`); 25 fps y AAC **no** |
| 3 | «El empaquetado generó **HLS + DASH** con manifiestos y fragmentos» | **CONTRADICHO** | `canary-render.js:22` → `'-f','hls'` único; `dash/mpd` → **0 hits** en todo `canary/`. Fragmentos sin recibo (DRY_RUN por defecto, L24) |
| 4 | «La política Canary quedó reproducida en código local con **5 pruebas aprobadas**» | **SOPORTADO** | `node --test` en el paquete → `tests 5 / pass 5 / fail 0`, exit **0** (ejecutado por mí); `README.md:3`; `quality-policy.json` 1.183 B sha `9845aa5d…` pinneado en el contrato |
| 5 | «La integración en GitHub está bloqueada por permisos **403**» | **NO_COMPUTADO** | `README.md:3` lo **declara**; **no hay** captura de la respuesta HTTP ni log de `gh`/CI. `metacog_audit` → NO_SOPORTADO. La consecuencia (no mergeada) sí está declarada |
| 6 | «La **APK compilada** y el **VPS desplegado** no se ejecutaron» | **SOPORTADO con calificación** | APK: 24.362.980 B, sha256 `4b0c4ef3…` (`CANARY_TRUTH:37`), sin referencia a `ape-jit`/`/jit/signal` (`:63`). Ausencia de recibo de ejecución. VPS: `manifest.tsv:59` mapea A pero **el despliegue no está verificado** (sin SSH) → esa mitad es NO_COMPUTADO |
| 7 | **Tesis:** «Canary es la autoridad de configuración y JIT su consumidor» | **CONTRADICHO — INVERTIDA** | `A:7913` «EL CANARY MIDE, EL JIT AJUSTA, EL CANARY EJECUTA»; `A:7922-7925` el JIT busca en **su** tabla de 16 reglas y el canary ejecuta **exactamente** esa cadena; `vps/bin/ape-visual-emulate.sh:49-50,80` (POST `/jit/signal` y ejecuta lo devuelto); `grep quality-policy` en A → **0**. Además `A:8668-8670` corrige el aspect ratio que Canary deforma (`quality-policy.json:18`) |

**Agregado: 2 SOPORTADO (uno con calificación), 4 CONTRADICHO, 1 NO_COMPUTADO.** Ninguna fila `SOPORTADO` carece de artefacto.

---

## 14. Estado del árbol git — antes y después

| | Antes | Después |
|---|---|---|
| `git log -1` | `472f7cc330e52dc2f7e3d16f6a451fd0b461949e` — `docs(inventario): comprobacion de regresion — nada se perdio en la pestaña` | **idéntico** `472f7cc3…` |
| Rama | `audit/rea-alignment-20261108` | idéntica |
| `git stash list` | vacío | vacío |
| `git status --porcelain` | 10 rutas `??` | **11** rutas `??` (las 10 + este informe) |
| Worktrees temporales | ninguno del equipo | `jitr6_91bf2dc6` **creado y eliminado** (`remove --force` → exit 0); los 2 de `%TEMP%` que siguen (`ape-master-wt`, `ara-x-canonical-int`) **no son de esta tarea** |

**Cero ficheros tracked modificados. Cero commits. Cero push.**

### Ficheros creados por el equipo (11, todos `??`)

| # | Ruta | Bytes | sha256 / nota |
|---|---|---|---|
| 1 | `contracts/canary_jit_contract_v1.json` | 35.791 | `488b8760…395514` |
| 2 | `tools/quality/test_canary_jit_contract.js` | 71.957 | `08691492…69680b` |
| 3 | `docs/manifestos/CANARY_JIT_CONTRACT_20261111.md` | 32.264 | `96dd7f57…f43eb` |
| 4 | `docs/audits/CANARY_TRUTH_20261111.md` | 47.639 | `33c214ef…98da6` |
| 5 | `docs/audits/JIT_TRUTH_20261111.md` | 52.730 | `e9e864b2…f8b1f4` |
| 6 | `docs/audits/JIT_HTTP_PROBES_20261111.md` | 26.540 | `f1c25105…10c13` |
| 7 | `docs/audits/ADVERSARIAL_CANARY_JIT_20261111.md` | 31.615 | `8a62e720…87faae` |
| 8 | `docs/audits/CONTRACT_REVIEW_20261111.md` | — | revisión r1 |
| 9 | `docs/audits/CONTRACT_REVIEW_ROUND2_20261111.md` | — | revisión r2 |
| 10 | `docs/audits/CONTRACT_REVIEW_ROUND3_20261111.md` | 13.898 | `1affc172…cfe59` |
| 11 | **`docs/audits/VEREDICTO_CANARY_JIT_20261111.md`** | — | **este informe** |

---

## 15. QUE DECIDE EL OPERADOR

Nada de esto lo decide este informe. Se entrega con riesgo y reversibilidad.

| Decisión | Recomendación técnica | Riesgo | Reversibilidad |
|---|---|---|---|
| **Añadir fila al manifest para `vps/bin/ape-visual-emulate.sh` (6.714 B / 144 líneas)** | **No todavía.** Activaría el bucle Canary→JIT en producción sobre un motor con H1 abierto y con capacidad 4K medida insuficiente | **ALTO** — ya se pagó una vez: `INCIDENTE_DEPLOY_MANUAL_2026-11-09.md:66-68` («el bucle se comió la CPU y el operador se quedó sin TV»); además compite por ffmpeg con el JIT (`jit_busy`, worker `:36-39`) | **ALTA** en lo mecánico (quitar la fila + redeploy). **NULA** sobre el incidente ya ocurrido |
| **Instalar o descartar la skill** | Instalar como **medidor documentado**, no como pipeline | BAJO — no ejecuta nada | ALTA |
| **Desplegar al VPS** | **No.** Falta recibo de ejecución, capacidad y render en device | **ALTO** | MEDIA (hay backups; el incidente previo se revirtió) |
| **Push a GitHub** | Sí, cuando exista permiso real. Hoy la afirmación del 403 **no tiene artefacto** | BAJO | ALTA (revert local) |
| **Reparar el motor A (H1 / H2)** | **Sí, pero con re-pin consciente.** Son dos fixes pequeños y H1 es un DoS de 1 petición | **MEDIO** — mover A cambia su `sha256 28352c50…`, que el contrato **pina** (`PASS motor desplegable sha256 [pin=28352c508285b1ee real=28352c508285b1ee]`) y que sostienen los fixtures | MEDIA — el contrato se re-pina con una edición de una línea, pero **se pierde la trazabilidad del corpus auditado**: los 92/92 se midieron contra ese sha, no contra el nuevo. Hay que re-ejecutar el validador y volver a congelar cifras |
| **¿Canary autoridad, o reencuadre como medidor?** | **Reencuadre.** Mantener «autoridad» contradice el código que el propio contrato cita (§8) | **MEDIO si se mantiene**: el contrato afirma una dirección que el artefacto desmiente, y eso es exactamente lo que el equipo se propuso no hacer. BAJO si se reencuadra | **ALTA** — es una etiqueta y una revisión del contrato; no mueve código ni despliega |
| **Arreglar el falso positivo del gate anti-degradación** (§1.3) | Sí, es un cambio quirúrgico (excluir comentarios/strings del conteo, o contar emisiones reales). **Fuera de mi alcance y de mi gate** | BAJO | ALTA (un fichero de tools) |
| **Política de `/sdr/` + `/sdr720/` en A** (§7.1) | **Decisión de doctrina:** o se autoriza por escrito el *continuity fallback* 720p, o se retira la ruta del motor desplegable | MEDIO (tocar el motor invalida el sha pinneado) | MEDIA |

---

## 16. QUE FALTA PARA QUE LA TESIS SEA CIERTA

Ordenado por lo que más mueve el veredicto. **Mientras estos huecos existan, declarar la receta aplicada es exactamente lo que el contrato prohíbe.**

1. **Un recibo de ejecución del Canary en producción.** `ls -l /var/lib/ara/canary/*/status.json` en el VPS. Hoy el único documento dice que el directorio está vacío (`CANARY_RESOLVE_ANALISIS_2026-11-04.md:73-74`). Es el artefacto que convierte `declarado` en `aplicado`. El contrato declara **0 recibos existentes**, y hace bien.
2. **Una corrida a cadencia real.** Un `.ts` de **≥60 s a 25/30/50/60 fps CON audio** y su `ffprobe`. Hoy está cableado `-t 6 -r 5 -an` (`ape-visual-emulate.sh:57` / `:109`; `canary-render.js:19`). Exige quitar esos flags o añadir un modo de medición. Nadie lo ha hecho.
3. **Capacidad 4K sostenida con la cadena COMPLETA.** `ffmpeg -benchmark` a 3840×2160 durante 60 s en el VPS, exigiendo **≥1,0×**. Hoy: 0,1828 fps medidos con cuota de CPU 40 % (`FASE01_REPORT.md:59`), 0,25× del motor con **menos** cadena (`A:40-44`), y 3,37 fps en el incidente.
4. **4K real con receta.** `GET /jit/live/<id>/master.m3u8` + `ffprobe` del `chunk`. Hoy el único bitstream verificado es **1080p desde 848×480** (`PRUEBA_FISICA:1230-1246`). En 4K la ruta es dicotomía: `-c:v copy` (sin filtros) o transcode a 0,25×.
5. **Render end-to-end en device.** Captura de fotograma en la APK contra `/jit/live/<id>/master.m3u8` con VPN y MTU controladas. La única existente dio **overlay de error** (`PRUEBA_FISICA:1942-1943`) y la atribución a la red quedó sin probar.
6. **A/B perceptual Canary vs JIT** sobre el mismo clip y fuente, con delta VMAF/SSIM. Sin esto `FILTERGRAPH_IDENTICAL` (`canary_quality.js:45`) sigue siendo una **etiqueta literal**, no una medida.
7. **Cerrar H1 antes de que el contrato nombre `/meta`.** Hoy `GET /meta/<id>.json` es un kill switch (§5). Mientras siga, `/meta` no es apto para contrato.
8. **Medir 206 en Linux sobre A.** Hoy es `NO_COMPUTADO`: el 206 de A exige `/usr/bin/nice`, que este host Windows no tiene (§6). Cualquier «206 verificado sobre A» en Windows es falso.
9. **El TXT `Arquitectura_APE_APK_VPS_M3U8.txt`** (L482-484, L506, L899-901). No existe en el workspace; la frontera MediaSession se cita hoy **a través de la herramienta**, no del fichero.
10. **Un artefacto del 403** (captura de la respuesta o log de `gh`/CI) — o **retirar** la afirmación. Hoy solo está declarada en un README.
11. **Decisión sobre `manifest.tsv:39`** (§3): mientras la fila apunte a la copia de 80 líneas, «receta integrada en producción» es falso por definición de despliegue.
12. **Decisión de doctrina sobre `/sdr/` y `/sdr720/`** (§7.1): o autorización escrita de degradación, o retirada de la ruta.

---

## 17. Veredicto global

**El veredicto adversarial NO es INDECIDIBLE y lo suscribo: sobrevive la CONTRA** — con 12 artefactos en el lado ganador, 0 ítems sin artefacto y margen 35 vs 15, que no es un empate desempatado por la herramienta.

Lo que **sí** se puede firmar hoy, medido por mí en esta sesión:

- El **validador del contrato es real y fail-closed**: 92/92 exit 0 con el contrato honesto, y el **mismo validador falla con exit 1** (90/92, fallos 2) sobre un contrato envenenado que declara desplegado un artefacto sin fila en el manifiesto. El original queda **byte-idéntico** (sha256 antes = después).
- Los **gates 2 y 3** (Crystal 4K y 6K) están **verdes**.
- El **gate 1 está ROJO y es PREEXISTENTE**, demostrado ejecutándolo sobre `472f7cc3` en un worktree limpio con salida idéntica; y su rojo es un **falso positivo por prosa** (3 comentarios que prohíben `-ac 2`), no una degradación emitida.
- **H1 es real y lo reproduje**: una sola petición `GET /meta/1.json` mata el motor desplegable (curl exit 56, puerto cerrado, `ReferenceError: Cannot access 'CAPACITY_FPS' before initialization` en `server.js:8000` ← `:8009` ← `:6183`), y la ruta con id inválido sobrevive con 404.
- **H-1 es real**: existen dos copias, se despliega la de **4.068 B / 80 líneas / 0 líneas con jit**, y la de **6.714 B / 144 líneas / 7 líneas con jit** **no tiene fila** en `manifest.tsv`. La receta integrada **no es desplegable**.
- **La tesis de autoridad está INVERTIDA** respecto al diseño registrado en el código: el JIT decide la cadena y el Canary la ejecuta.

Lo que **no** se puede firmar: que la receta de Canary llegue al televisor en directo, que el Canary sea 25 fps con audio, que haya DASH, que las pruebas sean 9/9, que el 403 esté probado, y que A esté libre de vías de degradación (`/sdr720` existe).

**En una frase:** el contrato y el medidor son activos reales y verificados; el **pipeline** que la tesis describe no existe todavía, y el contrato —leyéndolo con honestidad— es el primero en decirlo.

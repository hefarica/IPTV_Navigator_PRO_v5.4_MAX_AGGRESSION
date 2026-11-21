# R9 — Las cuatro copias de `server.js`: paridad, decisión por copia y gate contra la copia equivocada

Medido en `deploy/engine-restart-20261112`. HEAD en la primera medición de R9: `d30cfea7`; HEAD al
validar (map-endpoint, 2026-11-21): `9b4bd3aa`. Cero acceso al VPS en esta tarea.
Todas las cifras salen de comandos ejecutados en este árbol; las que no se pudieron medir están
declaradas al final como **NO COMPUTADO** con su razón.

---

## 0. Titular

Hay **cuatro** `server.js` del motor en el árbol y **solo uno** es el desplegable. Hasta hoy, tres
artefactos de despliegue decían **tres cosas distintas** sobre `/opt/ape-jit/server.js`:

| artefacto | qué fuente declara | qué bytes pinea |
|---|---|---|
| `_vps_stage/deploy/manifest.tsv:59` | `IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js` | `268bbd3a…` (canónico) |
| `.github/workflows/deploy-vps.yml:766,773` (antes) | `tools/lab/ape-jit/server.js` | `SHA_PIN 8c1a0085…` (ya no casaba con el fichero: `exit 1`) |
| `docs/canary/deliverables/12_CANARY_DEPLOYMENT_RECEIPT.json` (`deployment_2026_11_12`) | declara `source: tools/lab/ape-jit/server.js` (`28352c50…`, 447 943 B) | motor instalado `290b1103…` (449 392 B) |

Tres fuentes, tres hashes. Ese es el defecto: no era "hay copias de más", era que **el gate no
miraba qué fichero se despliega**, así que una copia vieja podía instalarse mientras el recibo
atestiguaba otra.

---

## 1. Tabla de paridad (medida)

Comando base: `Get-FileHash` + `[regex]` de `\n` para líneas, `git diff --numstat --no-index` contra
el canónico, y presencia literal de las 61 rutas de `artifacts/verify/jit_routes_61.json`.

| # | ruta | sha256 (ANTES) | bytes | líneas | numstat vs canónico | rutas propias | del inventario de 61 | aportación A: `X-Buffer-Min` 62.5 % | aportación B: `POST /image/streaming-health-llm` |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js` | `268bbd3a05f8d8645d8641821f98dfc76e72060c44681ecfe31701f210ba4eb0` | 480 976 | 9 812 | — (canónico) | 61 | **61 / 61** | **SÍ** — `Math.round(playerBuf * 0.625)` en `:1345` | **SÍ** — `:7257` |
| 2 | `vps/ape-jit/server.js` | `290b11030f3b6bf944c14298f3fe8401c0f9bd773789e26afeca8bb9f8aeb492` | 449 392 | 9 234 | **+18 / −596** | 59 | **59 / 61** — faltan `/image/streaming-health-llm` y `/playlist-shim.m3u8` | NO — `* 0.6` en `:1334` | NO |
| 3 | `tools/lab/ape-jit/server.js` | `38c92b56e4ab476bc012902bd3686e2bdfcddfc3adf25d7d429ba5b984afa0c7` | 474 044 | 9 696 | **+4 / −120** | 60 | **60 / 61** — falta `/image/streaming-health-llm` | NO — `* 0.6` en `:1334` | NO |
| 4 | `vps_jit/server.js` | `e400fa197b3b58bc36212003973c77001c2f3093a31210788c13b865f46e807b` | 29 624 | 662 | **+501 / −9 651** | 5 | 5 / 61 | NO (no tiene la expresión) | NO |

Lectura de la tabla:

- **#2 y #3 son casi el mismo fichero entre sí** (su diferencia mutua es de 4 y 120 líneas contra el
  canónico, y ambos comparten el `* 0.6`). Eso confirma que #3 es el ancestro común y #2 una rama
  que se separó antes de que entraran las dos aportaciones.
- **#2 es el que el recibo canary dice haber instalado** (`motor.sha256 = 290b1103…`, 449 392 B) —
  y con él el inventario da **59 rutas, no 61**, exactamente como avisó R1.
- **#4 no es una copia del motor**: 5 rutas, 662 líneas, `+501/−9651`. Es otro programa.

Las dos aportaciones que el canónico tiene y las otras no, con su línea:

```
canonico :1345   'X-Buffer-Min': String(Math.round(playerBuf * 0.625)),      <- 62.5 %
#2 y #3  :1334   'X-Buffer-Min': String(Math.round(playerBuf * 0.6)),        <- 60 %   (rama vieja)
canonico :7257   if (u.pathname === '/image/streaming-health-llm' && req.method === 'POST') {
#2, #3, #4       (ninguna ocurrencia)
```

---

## 2. Referencias (¿se puede borrar alguna?)

Comprobado con grep sobre `.github/workflows/*.yml`, `_vps_stage/deploy/manifest.tsv` y el resto del
árbol:

| copia | referencias vivas | ¿borrable? |
|---|---|---|
| #2 `vps/ape-jit/server.js` | `docs/canary/deliverables/12_CANARY_DEPLOYMENT_RECEIPT.json:637` (su sha **es** el motor atestiguado), `docs/audits/INCIDENT_JIT_ENGINE_20261121.md`, `contracts/anti_degradation_jit_baseline.json:6` | **NO** — es la única prueba en repo de los bytes que corrían el 2026-11-12 |
| #3 `tools/lab/ape-jit/server.js` | `.github/workflows/ape-bridge-tests.yml:23` (path filter), `.github/workflows/ape-bridge-tests.yml:160` (comentario), recibo canary (`source:`) | **NO** — referenciada por un workflow y por el recibo |
| #4 `vps_jit/server.js` | `.github/workflows/streaming-headers.yml:6` (path filter), `deploy-streaming.yml:62-66` y `deploy-streaming-main.yml:64-68` (comentarios de la fuente legacy), `contracts/anti_degradation_jit_baseline.json` | **NO** — sigue siendo la fuente del deploy legacy por diseño |

**Ninguna se borra.** El borrado habría destruido la única evidencia de #2 y habría roto el path
filter de #3.

---

## 3. Decisión por copia

| # | copia | decisión | por qué |
|---|---|---|---|
| 1 | `IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js` | **(i) se queda como ÚNICA fuente** — no se toca | es lo que declara el manifiesto (`manifest.tsv:59`) y lo que corre producción. `sha256` verificado intacto después de todo el trabajo: `268bbd3a…ba4eb0`, 480 976 B |
| 2 | `vps/ape-jit/server.js` | **(ii) histórica + cabecera de 5 líneas** | sincronizarla crearía un segundo desplegable idéntico (peor: nadie sabría cuál manda) y borrarla elimina la evidencia del motor atestiguado por el recibo |
| 3 | `tools/lab/ape-jit/server.js` | **(ii) histórica + cabecera de 5 líneas** **y** se repunta el workflow que la copiaba | era la fuente real del `scp` de `deploy-vps.yml`: marcarla sin arreglar el workflow no cerraba nada |
| 4 | `vps_jit/server.js` | **(ii) legacy + cabecera de 5 líneas, SIN sincronizar** | es otro programa (`vps_jit_legacy`, 5 rutas). Sincronizarla con el motor haría que el deploy legacy instalara el motor donde espera un stub. **Prohibido por el encargo y por medición** |

### 3.1 Cabeceras aplicadas (5 líneas cada una, insertadas tras `'use strict';`)

`vps/ape-jit/server.js`
```
/* NO ES EL DESPLEGABLE — copia historica, no instalar. Canonico:
 * IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js
 * sha256 268bbd3a05f8d8645d8641821f98dfc76e72060c44681ecfe31701f210ba4eb0
 * Falta: X-Buffer-Min al 62.5 % (aqui 60 %) y POST /image/streaming-health-llm (59 rutas, no 61).
 * Ver artifacts/verify/copias_server_js.md (R9) antes de tocarla. */
```

`tools/lab/ape-jit/server.js`
```
/* NO ES EL DESPLEGABLE — ancestro comun, no instalar. Canonico:
 * IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js
 * sha256 268bbd3a05f8d8645d8641821f98dfc76e72060c44681ecfe31701f210ba4eb0
 * Falta: X-Buffer-Min al 62.5 % (aqui 60 %) y POST /image/streaming-health-llm (60 rutas, no 61).
 * OJO: deploy-vps.yml:766,773 copiaba ESTE fichero; desde R9 (2026-11-21) copia el canonico. */
```
> La última línea decía originalmente «`deploy-vps.yml:773` todavía copia ESTE fichero», verdad solo
> hasta que se aplicó la corrección de §4.1. Reescrita por map-endpoint en la validación (sigue siendo
> 1 línea). Ver la nota de §3.1 sobre el sha resultante.

`vps_jit/server.js`
```
/* NO ES EL MOTOR — programa LEGACY distinto (processing_domain vps_jit_legacy, 5 rutas).
 * NO sincronizar con el canonico: el deploy legacy espera aqui un stub, y meter el motor lo rompe.
 * Canonico del motor: IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js
 * sha256 268bbd3a05f8d8645d8641821f98dfc76e72060c44681ecfe31701f210ba4eb0 — destino /opt/ape-jit/server.js
 * Ver artifacts/verify/copias_server_js.md (R9) antes de tocarla. */
```

Efecto medido (`node --check` + `Get-FileHash` tras la inserción):
| copia | `node --check` | sha256 (DESPUÉS) | bytes | líneas | diffstat |
|---|---|---|---|---|---|
| `vps/ape-jit/server.js` | exit 0 | `8d4f4847d08f9160822452bece74f47bf5db5281a9b1b9d363d1fdaa2187fa5e` | 449 754 | 9 239 | +5 −0 |
| `tools/lab/ape-jit/server.js` | exit 0 | `835195e3aaec7f826817bddd1dd3486b4a4b9e3c28528c157396257ab042577d` | 474 432 | 9 701 | +5 −0 |
| `vps_jit/server.js` | exit 0 | `edbe8bb96f1ee43a8d6cf1aab739149f5228789c55405d561555f610cf6a8856` | 30 066 | 667 | +5 −0 |
| **canónico (no tocado por R9)** | — | `268bbd3a05f8d8645d8641821f98dfc76e72060c44681ecfe31701f210ba4eb0` | **480 976** | **9 812** | **sin cambio en HEAD** |

> **Corrección de map-endpoint (validación t39).** El sha de `tools/lab` de la primera versión
> (`446a2d12…`, 474 458 B) quedó obsoleto porque su cabecera decía «`deploy-vps.yml:773` todavía copia
> ESTE fichero», y eso dejó de ser cierto al repuntar el workflow. Se reescribió esa línea de la
> cabecera (sigue siendo **1 línea** y el bloque **5 líneas**, `+5 −0`): ahora dice que el workflow lo
> copiaba y que desde R9 copia el canónico. Nuevo sha `835195e3…`, 474 432 B, 9 701 líneas,
> `node --check` exit 0.
>
> **Estado del canónico en el árbol de trabajo (no es mérito ni culpa de R9):** al validar, el
> `worktree` del canónico está **sucio por R11/W-01** (`+183 −29`, escritura única de `image-config`):
> `ad37d894…`, 490 421 B, 9 998 líneas. En **HEAD** el blob sigue siendo `268bbd3a…`, 480 976 B,
> 9 812 líneas — que es lo que pinean el manifiesto y `deploy-vps.yml`. Ver §8.

`git --no-pager diff --stat` → `3 files changed, 15 insertions(+)`, 0 deletions. El motor canónico
no aparece en el diff.

---

## 4. Auditoría de workflows y manifiesto (c)

| artefacto | veredicto | evidencia |
|---|---|---|
| `_vps_stage/deploy/manifest.tsv:59` | **CORRECTO** | `IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js → /opt/ape-jit/server.js`, con la nota de que exige `systemctl restart ape-jit` |
| `.github/workflows/deploy-streaming.yml:61-100` | **CORRECTO** | comentario `[2026-11-21] FUENTE CANONICA` y `LOCAL_BYTES=stat …IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js` |
| `.github/workflows/deploy-streaming-main.yml:63-96` | **CORRECTO** | idéntico al anterior |
| `.github/workflows/deploy-vps.yml:762-791` | **ESTABA MAL → CORREGIDO** | copiaba `tools/lab/ape-jit/server.js` (`:766`, `:773`) con `SHA_PIN 8c1a0085…` que ya no casaba con el fichero (`38c92b56…`) → el paso abortaba; en cuanto alguien "arreglara" el pin, instalaba la copia vieja |
| `.github/workflows/deploy-vps.yml:794` | **ESTABA MAL → CORREGIDO** | segundo `SHA_PIN=8c1a0085…` en la guardia remota: habría fallado siempre |
| `.github/workflows/ape-bridge-tests.yml:23` | correcto (path filter) | solo dispara tests cuando cambia `tools/lab/ape-jit/**`; no instala |

### 4.1 Corrección aplicada a `deploy-vps.yml`

```
-          SHA_PIN=8c1a00852ba4df2adfa1cc1b17e980c8cfc7faee3ede1d65c69aa8e7456eaec6
-          GOT_LOCAL=$(sha256sum tools/lab/ape-jit/server.js | cut -d' ' -f1)
+          # [R9 2026-11-21] FUENTE CANONICA. … (comentario de 6 líneas con el motivo medido)
+          CANON_FILE="IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js"
+          SHA_PIN=268bbd3a05f8d8645d8641821f98dfc76e72060c44681ecfe31701f210ba4eb0
+          GOT_LOCAL=$(sha256sum "$CANON_FILE" | cut -d' ' -f1)
…
-          scp -q tools/lab/ape-jit/server.js "$TARGET:/tmp/ape-jit-server.js.new"
+          scp -q "$CANON_FILE" "$TARGET:/tmp/ape-jit-server.js.new"
```

y en la guardia remota (`:794`, antes `8c1a0085…`):

```
+          # [R9 2026-11-21] mismo pin que el paso de instalacion (antes 8c1a0085,
+          # de una copia que ya no es la que se instala: la guardia habria fallado siempre).
+          SHA_PIN=268bbd3a05f8d8645d8641821f98dfc76e72060c44681ecfe31701f210ba4eb0
```

Verificación: el YAML sigue sin tabs y tiene **1 012 líneas** (medido: `newlines=1012`,
`bytes=58981`, termina en salto de línea; la versión anterior de este informe decía 1 013 — corregido);
las menciones de `8c1a0085` que quedan son exactamente **2 y ambas son comentarios** (L767 y L794, que
documentan el defecto), y `SHA_PIN=` aparece **2 veces con el mismo valor `268bbd3a…`**.

---

## 5. Gate de CI añadido (d)

Nuevo: **`tools/quality/check_jit_deploy_parity.js`** (autocontenido, sin red, sin servidor).
Cableado en `.github/workflows/ci-validate.yml` como paso *«Gate de paridad de despliegue del motor
JIT»*, junto al gate de rutas de t37 (`tools/quality/test_jit_routes_contract.js`), que vigila las
61 rutas del canónico pero **no** qué fichero se despliega.

Comprueba tres cosas:

| id | aserción | estado hoy |
|---|---|---|
| **C1** | la fila de `manifest.tsv` con destino `/opt/ape-jit/server.js` apunta al canónico y el fichero existe | **PASS** |
| **C2** | el `motor.sha256` del recibo canary coincide con el sha de la fuente del manifiesto | **NO COMPUTADO** |
| **C3** | ningún workflow instala un `server.js` distinto del canónico hacia `/opt/ape-jit/server.js` | **PASS** |

Salida literal (**re-ejecutada por map-endpoint** en la validación, con el árbol tal como está hoy —
canónico sucio por R11; ver §8):

```
== PARIDAD DE DESPLIEGUE DEL MOTOR JIT ==
   canonico: IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js
   destino : /opt/ape-jit/server.js
   [PASS] C1 — _vps_stage/deploy/manifest.tsv:59 -> IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js sha256=ad37d894fda142c662fe6c4b67a0ed24974b5c0b034d7fa6f50e749da0df2479
   [NO COMPUTADO] C2 — el recibo canary (2026-11-12) es ANTERIOR a los bytes actuales del canonico (2026-11-21): pinea 290b11030f3b6bf944c14298f3fe8401c0f9bd773789e26afeca8bb9f8aeb492 y atribuye la instalacion a tools/lab/ape-jit/server.js, mientras el manifiesto despliega ad37d894fda142c662fe6c4b67a0ed24974b5c0b034d7fa6f50e749da0df2479. No mide los bytes de hoy: hay que RE-EMITIR el recibo contra IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js (ad37d894fda142c662fe6c4b67a0ed24974b5c0b034d7fa6f50e749da0df2479). No se rellena con un numero
   [PASS] C3 — ningun workflow instala una copia no canonica (20 menciones revisadas en 29 workflows)
-- copias presentes en el arbol --
   CANONICO IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js  ad37d894fda142c662fe6c4b67a0ed24974b5c0b034d7fa6f50e749da0df2479  490421 B  9998 l
   copia    vps/ape-jit/server.js  8d4f4847d08f9160822452bece74f47bf5db5281a9b1b9d363d1fdaa2187fa5e  449754 B  9239 l
   copia    tools/lab/ape-jit/server.js  835195e3aaec7f826817bddd1dd3486b4a4b9e3c28528c157396257ab042577d  474432 B  9701 l
   copia    vps_jit/server.js  edbe8bb96f1ee43a8d6cf1aab739149f5228789c55405d561555f610cf6a8856  30066 B  667 l
-- RESULTADO: 0 FALLA · 1 NO COMPUTADO · exit 2
```

> Salida copiada byte a byte de la corrida de validación (`node tools/quality/check_jit_deploy_parity.js`,
> exit 2). La captura de la primera versión mostraba `268bbd3a…` en C1 y en C2 porque el canónico estaba
> limpio; hoy el árbol lleva la edición en vuelo de R11 (§8), y por eso ambos mensajes citan
> `ad37d894…`. En HEAD el blob sigue siendo `268bbd3a…`.

> **Cómo leer C1.** C1 comprueba que la fila del manifiesto con destino `/opt/ape-jit/server.js` apunta
> al canónico y que el fichero existe; el `sha256=` que imprime es **informativo, el de los bytes que
> hay ahora en el árbol**, no un pin. Por eso hoy sale `ad37d894…` (R11) y no `268bbd3a…` (HEAD).
> La captura de la primera versión de este informe mostraba `268bbd3a…` porque el canónico estaba
> limpio en ese momento. El pin real vive en el manifiesto/`deploy-vps.yml` y es `268bbd3a…` = HEAD.

**Antes** de la corrección del workflow, el mismo gate daba `2 FALLA · exit 1` y nombraba el delito:

```
   [FALLA] C2 — el recibo canary pinea el motor en 290b1103… pero el manifiesto despliega 268bbd3a…;
                 el recibo atribuye la instalacion a tools/lab/ape-jit/server.js.
   [FALLA] C3 — .github/workflows/deploy-vps.yml:773 instala tools/lab/ape-jit/server.js
                 hacia /opt/ape-jit/server.js y NO el canonico
```

Códigos de salida y política en CI: `0` PASS · `1` FALLA (rompe el job) · `2` NO COMPUTADO (anota
`::warning::` y no finge verde). El umbral no se relaja con un flag.

**C2 sigue abierto a propósito.** El recibo `deployment_2026_11_12` es del 2026-11-12 y el canónico se
re-unificó el 2026-11-21 (`63807eed`); ese recibo no puede atestiguar bytes que no existían. La
remediación es **re-emitir el recibo canary contra `268bbd3a…`** — la decide el operador/verificador,
no este gate. Fabricar aquí un `PASS` sería exactamente el fallo que R9 existe para cerrar.
**Estado confirmado después:** el capitán midió producción por SSH (solo lectura, 2026-11-21) y
`/opt/ape-jit/server.js` es `268bbd3a…`, 480 976 B, `ape-jit` active en `127.0.0.1:3099`; el recibo del
2026-11-12 (`290b1103…`, la copia de 59 rutas) queda **obsoleto**. La igualdad producción==canónico está
establecida, pero C2 —que compara el recibo con el manifiesto— sigue NO COMPUTADO hasta re-emitirlo.

---

## 6. NO COMPUTADO (con razón)

1. ~~*(texto original, superado — se conserva como traza)* **Qué motor corre hoy en `/opt/ape-jit/server.js`**
   — no se abrió SSH en esta tarea (el encargo lo prohíbe); el dato que había en repo era el recibo del
   2026-11-12 (`290b1103…`, 449 392 B), sin vigencia medida.~~ **CERRADO por medición del capitán
   (2026-11-21, solo lectura por SSH):**
   `/opt/ape-jit/server.js` = `268bbd3a05f8d8645d8641821f98dfc76e72060c44681ecfe31701f210ba4eb0`,
   480 976 B, servicio `ape-jit` **active**, listener único `127.0.0.1:3099`; verificado dos veces ese
   día (21:39 tras desplegar el canónico y 22:02). **No es dato heredado del recibo:** el recibo del
   2026-11-12 declaraba `290b1103…` (la copia de 59 rutas) y está **obsoleto**; su re-emisión la decide
   el operador. Esto **no** convierte C2 en PASS (C2 compara artefactos del repo), pero cierra el
   desconocido de "qué corre hoy" y confirma que producción == canónico == lo que pinea el manifiesto.
2. **Paridad byte a byte del canónico contra producción** — misma razón: sin SSH no hay `sha256sum`
   remoto. El `exit 1` que este gate puede dar por C2 mide *artefactos del repo*, no el VPS.
   *Tras la medición del capitán del punto 1, la igualdad de bytes queda establecida por él
   (`268bbd3a` en el VPS == `268bbd3a` en HEAD), no por este agente.*
3. **Si `deploy-vps.yml` llega a ejecutarse tras esta corrección** — no se ha lanzado ningún workflow;
   el cambio está verificado como texto (YAML sin tabs, pin alineado con el manifiesto) y como lógica
   (el gate C3 pasa), no como despliegue.
4. **Contenido funcional de la copia #2 más allá de las rutas y las dos aportaciones** — se midió
   paridad estructural (numstat, rutas, aportaciones), no equivalencia semántica de los 596 tramos que
   el canónico tiene y #2 no.
5. **La edición de R11/W-01 sobre el canónico** — fuera de R9. No se evalúa aquí su corrección; solo se
   registra que el árbol está sucio y que el commit coherente (pin + recibo + inventario) queda
   pendiente de que R11 cierre.

---

## 7. Ficheros tocados

| fichero | cambio |
|---|---|
| `vps/ape-jit/server.js` | +5 líneas de cabecera (histórica) |
| `tools/lab/ape-jit/server.js` | +5 líneas de cabecera (histórica, ancestro); 1 línea reescrita en la validación de §8.2 |
| `vps_jit/server.js` | +5 líneas de cabecera (legacy, no sincronizar) |
| `.github/workflows/deploy-vps.yml` | fuente canónica + pin `268bbd3a…` en los dos sitios (instalación y guardia) |
| `.github/workflows/ci-validate.yml` | nuevo paso «Gate de paridad de despliegue del motor JIT» |
| `tools/quality/check_jit_deploy_parity.js` | **nuevo** — gate C1/C2/C3 |
| `artifacts/verify/copias_server_js.md` | este informe |

`IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js` **no** lo modificó R9: en HEAD su blob mide
`sha256 268bbd3a…ba4eb0`, 480 976 B, 9 812 líneas (medido con `git cat-file blob HEAD:…`, bytes crudos).
En el **árbol de trabajo** hoy está sucio por R11/W-01 (§8), lo que no cambia el veredicto de R9 pero sí
obliga a una acción antes de desplegar.

---

## 8. Validación independiente (map-endpoint, t39 attempt 2, 2026-11-21)

R9 lo ejecutó `map-vps`; esta sección **no rehace** nada: comprueba lo que está en el árbol y corrige lo
que ya no era cierto. HEAD al validar: `9b4bd3aa`. Cero SSH.

### 8.1 Lo que se validó y salió como dice el informe

| # | comprobación | comando | resultado |
|---|---|---|---|
| 1 | `deploy-vps.yml` ya no copia la copia vieja | grep `tools/lab\|SHA_PIN=\|CANON_FILE=\|scp -q` | única mención a `tools/lab` es el **comentario** L766; `scp -q "$CANON_FILE"` en L780 |
| 2 | el pin es el de HEAD, no el de la copia | `git cat-file blob HEAD:…server.js` → `Get-FileHash` | blob = 480 976 B, `268bbd3a…ba4eb0` = **los dos** `SHA_PIN` |
| 3 | no quedan pins viejos vivos | grep `8c1a0085` | 2 ocurrencias, **ambas comentario** (L767, L794) |
| 4 | las cabeceras no rompen nada | `node --check` ×4 | exit **0** en las cuatro |
| 5 | las cabeceras son 5 líneas y no tocan el canónico | `git diff --numstat` | `+5 −0` en las tres copias; canónico **no aparece** en el diff |
| 6 | rutas que faltan en cada copia | set-diff contra `jit_routes_61.json` | #2: 59, faltan `/image/streaming-health-llm` y `/playlist-shim.m3u8`; #3: 60, falta `/image/streaming-health-llm`; #4: 5 → **coincide con el informe** |
| 7 | los datos del recibo que sostienen C2 | grep en `12_CANARY_DEPLOYMENT_RECEIPT.json` | `28352c50`, `447943`, `290b1103`, `449392`, `tools/lab/ape-jit/server.js` → **presentes** |
| 8 | C1/C2/C3 y el código de salida | `node tools/quality/check_jit_deploy_parity.js` | C1 PASS · **C2 NO COMPUTADO** · C3 PASS · **exit 2** → no finge verde |
| 9 | el YAML del paso nuevo parsea | `python -c yaml.safe_load` | `yaml_ok=True`, 1 paso «Gate de paridad…», 12 líneas de `run`, `set +e`, `RC=$?`, `-eq 1`→`exit 1`, `-eq 2`→warning+`exit 0` |
| 10 | los 4 workflows tocados parsean | PyYAML | `deploy-vps.yml`, `deploy-streaming.yml`, `deploy-streaming-main.yml`, `ape-bridge-tests.yml` → todos OK |
| 11 | el comando del paso se ejecuta literal | `node tools/quality/check_jit_deploy_parity.js` | corre y devuelve **exit 2**, igual que en CI |

**C2 se queda NO COMPUTADO.** No se toca: el recibo es del 2026-11-12 y atribuye la instalación a
`tools/lab`; no puede atestiguar bytes del 2026-11-21. Convertirlo en PASS exigiría re-emitir el recibo
contra el canónico, y eso no es de este gate.

### 8.2 Lo que hubo que corregir

1. **Cabecera de `tools/lab/ape-jit/server.js` (falsa desde la propia corrección de R9).** Decía
   «`deploy-vps.yml:773` todavía copia ESTE fichero»; tras §4.1 eso es falso. Reescrita esa línea
   (sigue siendo 1 línea, bloque de 5, `+5 −0`): «`deploy-vps.yml:766,773` copiaba ESTE fichero; desde
   R9 (2026-11-21) copia el canónico». Nuevo sha `835195e3…577d`, 474 432 B, 9 701 líneas,
   `node --check` exit 0.
2. **HEAD del encabezado**: decía `d30cfea7`; el HEAD medido al validar es `9b4bd3aa`.
3. **Líneas de `deploy-vps.yml`**: decía 1 013; medido `newlines=1012`, 58 981 B, termina en salto.
4. **Salida literal del gate**: se sustituyó por una corrida fresca (§5) porque la del informe se tomó
   con el canónico limpio y hoy el árbol lleva la edición de R11.

### 8.3 Riesgo abierto que NO es de R9 (y hay que atender antes de desplegar)

Al validar, `IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js` **está modificado en el árbol de trabajo**
por **R11/W-01** (escritura única de `image-config`: `writeSignalOk` + `writeJsonAtomic` + backup):
worktree `ad37d894…`, 490 421 B, 9 998 líneas, `+215 −29` contra HEAD — **instantánea de las 17:55**; el
diff **crece mientras R11 sigue editando** (a las 17:48 eran `+183 −29`). Lo que no se mueve: el
**índice y HEAD siguen en `268bbd3a…`**, 480 976 B, 9 812 líneas, y `git diff --cached` está vacío.
Consecuencia, en cuanto R11 commitee:

1. El `SHA_PIN` de `deploy-vps.yml` (2 sitios) y la nota del manifiesto quedarán **desfasados**: el paso
   «Instalar el motor pineado» abortará con `exit 1` — fail-closed correcto, no instalación silenciosa.
2. Hay que **subir el pin** al nuevo sha del canónico y **re-emitir el recibo canary** (C2) en la misma
   tanda; si se sube el pin sin recibo, C2 sigue NO COMPUTADO (que es honesto, pero deja el gate en exit 2).
3. **No** se debe "arreglar" el pin apuntándolo a `tools/lab` ni a `vps/ape-jit`: es exactamente el error
   que R9 cierra.

### 8.4 Veredicto de la validación

- **R9 es correcto en HEAD**: fuente canónica en el workflow, pin `268bbd3a…` en los dos sitios, tres
  copias marcadas con 5 líneas sin cambio de comportamiento, gate C1/C3 PASS con C2 honestamente
  NO COMPUTADO y exit 2, y cableado en CI que **no** declara verde un NO COMPUTADO.
- **0 bloqueantes de R9.** Lo corregido en §8.2 son afirmaciones que el propio trabajo dejó obsoletas
  (cabecera y metadatos), no fallos de diseño.
- **1 acción obligatoria derivada de R11** (§8.3): subir pin + re-emitir recibo cuando ese cambio
  commitee. Hasta entonces, el deploy del motor falla cerrado, que es el comportamiento deseado.
- **NO COMPUTADO cerrado por el capitán** (medición propia, 2026-11-21, solo lectura por SSH):
  `/opt/ape-jit/server.js` = `268bbd3a…ba4eb0`, 480 976 B, servicio `ape-jit` **active**, listener único
  `127.0.0.1:3099`; verificado dos veces (21:39 y 22:02). Producción == canónico == lo que pinea el
  manifiesto. **No es un PASS de C2**: C2 compara artefactos del repo contra el recibo del 2026-11-12
  (`290b1103…`, ya obsoleto) y su re-emisión la decide el operador.

Firmado: `map-endpoint` · t39 attempt 2 · `2faa2f53-4332-4b9d-9d35-dcd53564ec08`

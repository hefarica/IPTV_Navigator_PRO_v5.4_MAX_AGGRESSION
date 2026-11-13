# D-5 · PARCHES DE CABECERA DEL PIPELINE DE DEPLOY — **NO APLICADOS**

**Fecha:** 2026-11-12 · **Tarea:** t35 · **Autor:** jit-auditor
**Decisión:** **D-5 — se entregan como parches revisables; NO se aplican.**
**Base:** los tres scripts están **sin tocar**. sha256 del repo real, medidos antes y después de
toda la verificación (§6): `preflight.sh 1b49e359…`, `dry-run.sh 6d6b893f…`, `validate.sh 9554456…`.

> **Por qué NO APLICADO y no "aplicado y revertido":** estos tres ficheros **gobiernan el deploy
> al VPS** y se ejecutan en el workflow vivo `.github/workflows/deploy-vps.yml:252-260,287-291`
> bajo `set -euo pipefail`. Un parche mal probado no rompe un test: **bloquea o permite un
> despliegue**. La decisión D-5 es que el operador autorice cada uno por separado, después de leer
> su evidencia. Este entregable existe para que esa lectura sea posible sin tocar nada.

---

## 1. QUÉ HAY AQUÍ

| Parche | Fichero que toca | Hunks | Bytes | sha256 esperado **tras aplicar** (en este repo) |
|---|---|---:|---:|---|
| `0003a-preflight-fails.patch` | `_vps_stage/deploy/preflight.sh` | 1 | 3.425 | `b83edbaded70bff215bf4270c6e03319a084cd146d34e9dfee7235dc3e4f6c3d` |
| `0003b-dryrun-rsh-exit.patch` | `_vps_stage/deploy/dry-run.sh` | 1 | 1.435 | `9c64915f02648c893dffbfc0f5dc9a415a2e8ceb410d49cad4ba59a9faffcd67` |
| `0003c-validate-network.patch` | `_vps_stage/deploy/validate.sh` | 1 | 1.238 | `9f42450b60bcf139f827f109b368b7b33c974edf53a0623f7c4ad17a0175942b` |

Los tres pasan `git apply --check` contra el repo real con **exit 0** (§5). El `index` de cada
parche cita el blob real del repo (`979d7bb…` preflight, `09c4122…` dry-run, `47a76e5…`
validate), así que la pre-imagen es exactamente el fichero versionado.

**Sobre esos sha256:** son los que produce `git apply` **en este repo**, medidos en un repo
simulado con el mismo `.gitattributes` (§5.3). Difieren en **1 byte** de la copia de trabajo
revisada (`9c64915f` vs `1e8ef417`, `9f42450b` vs `1b066572`) porque `dry-run.sh` y
`validate.sh` **acaban con un `CR` suelto** en su última línea y `.gitattributes:7`
(`*.sh text eol=lf`) lo normaliza a LF al escribir. Es la política declarada del repo (el bloque
[t114] de `.gitattributes` existe justo por esto) y no cambia ni una instrucción.

---

## 2. LOS TRES DEFECTOS, CON SU LÍNEA

### D-5.1 · `preflight.sh` — un preflight que no puede fallar

- `preflight.sh:4` `fails=0; warns=0`
- `preflight.sh:28` **el único contador que se incrementa es `warns`**
- `preflight.sh:42` `printf '   bloqueos : %d\n' "$fails"`
- `preflight.sh:43` `[ "$fails" -eq 0 ] && c_ok "PRE-FLIGHT OK" || c_bad "PRE-FLIGHT CON BLOQUEOS"`
- `preflight.sh:44` `exit "$fails"`

`fails` **no se incrementa en ninguna línea**: la única forma de que el script salga !=0 es
`exit 2`/`exit 3` de la sección de conectividad (`:14`, `:17`). Todo lo que encuentra en el
manifiesto —duplicados, filas rotas, orígenes ausentes— **se imprime y se ignora**. El script
dice en su cabecera *"Sale !=0 si algo bloquea"* y no puede hacerlo.

**Parche:** `fails` pasa a contar cuatro condiciones que hoy se tragan:
1. **manifiesto ausente o ilegible** (`manifest_rows` devuelve 3 y la tubería seguía con `dests`
   vacío: el `FATAL` se imprimía y el script acababa en `PRE-FLIGHT OK`);
2. **fila sin origen o sin destino**;
3. **destino no absoluto** (una ruta relativa escribiría fuera del sitio previsto);
4. **destino duplicado** (el segundo origen pisa al primero en silencio).

Y **no cambia la política**: `AUSENTE-LOCAL` sigue siendo aviso (`warns`). Solo se promueve a
bloqueo con `APE_PREFLIGHT_STRICT=1`, que es un flag **nuevo y opcional**. Se eligió así porque
el script ya declara *"orígenes ausentes en local: N (no se desplegarán)"*: eso es una decisión de
producto, no un bug, y convertirla en bloqueo por la cara habría cambiado el comportamiento del
pipeline sin autorización.

### D-5.2 · `dry-run.sh` — no distingue "VPS caído" de "VPS vacío"

- `dry-run.sh:7` `remote="$(rsh "for f in $dests; do …")"` ← **el exit no se mira**
- `dry-run.sh:22` `if [ "$rh" = "AUSENTE" ] || [ -z "$rh" ]; then st="NUEVO"` ← un `remote` vacío
  se interpreta como "el fichero no está en el VPS"
- `dry-run.sh:41` `c_ok "   DRY-RUN COMPLETO"` (y sin `exit` explícito: el código es el del último
  `printf`, es decir **0**)

Con el VPS inalcanzable, `ssh` devuelve **255**, `remote` queda vacío y **todos** los ficheros se
reportan como `NUEVO` con salida 0. `lib.sh:3` tiene `set -uo pipefail` pero **no `-e`**, así que
nada aborta.

**Parche:** se captura `rc=$?` inmediatamente después de la asignación y se aborta **antes** de
interpretar nada:
- `rc=255` → `exit 4`, mensaje `RED: no se pudo conectar por SSH a <target> (rc=255)` +
  `DRY-RUN ABORTADO: no se ha leido NADA del VPS; esto NO significa que el VPS este vacio.`
- otro `rc` → `exit 5`, `COMANDO: SSH conecto pero el comando remoto fallo`.

### D-5.3 · `validate.sh` — confunde fallo de red con error de sintaxis

- `validate.sh:15` `if rsh 'luac -p /dev/stdin' < "$lf" 2>/dev/null; then OK else FALLA`
- `validate.sh:18` `if rsh 'php -l /dev/stdin' < "$lf" 2>/dev/null | grep -q 'No syntax errors'; then OK else FALLA`
- `validate.sh:33` `exit "$bad"` ← **el código de salida es el número de "fallos de sintaxis"**

Si el VPS no responde, cada `.lua` y cada `.php` cae en el `else` y se cuenta como **FALLA de
sintaxis**. `deploy.sh:16` (`"$DEPLOY_DIR/validate.sh" || { … exit 3; }`) aborta el despliegue
diciendo que el código está roto cuando lo que está roto es la conexión.

**Parche:** **una sonda de conectividad** (`rsh 'true'`) al principio, antes del bucle:
- `rc=255` → `exit 6` + `RED: no se pudo conectar por SSH …` +
  `NO SE PUDO VALIDAR: 0 ficheros comprobados. NO es un error de sintaxis.`
- otro `rc` → `exit 7`, mismo mensaje de "no se pudo validar".

Las ramas por extensión (`:15`, `:18`) **no se tocan**: así la detección de sintaxis queda
byte-idéntica y se demuestra que sigue funcionando (§3, caso B11).

> **Por qué sonda y no mirar 255 fichero a fichero:** `php -l` **también** devuelve 255 cuando hay
> un error de sintaxis, y `ssh` propaga el código del comando remoto. Un `255` por fichero es
> ambiguo por construcción. La sonda resuelve la ambigüedad una sola vez y sin tocar la lógica de
> validación.

---

## 3. DEMOSTRACIÓN — COPIA TEMPORAL, `SSH_BIN` APUNTANDO A UN STUB

Nada de esto se ejecutó contra el VPS. `lib.sh:31-32` permite sustituir el binario ssh
(`SSH_BIN`) y esa es la única puerta de salida del pipeline; el stub registra la llamada y
devuelve el código que pida cada escenario (`255` = inalcanzable, `0` = alcanzable, `1/255` con
texto = errores de sintaxis reales).

Sandbox: `/tmp/ape-d5/demo/` con `lib.sh` + los tres scripts + un `manifest.tsv` de 4 filas y sus
4 orígenes locales. Los scripts se sustituyen por los parcheados entre el bloque ANTES y el
DESPUÉS. **21 casos, 21 con el código de salida esperado.**

| # | Caso | ANTES | DESPUÉS | Qué prueba |
|---|---|---:|---:|---|
| A1/B1 | preflight, manifiesto limpio | 0 | 0 | no hay regresión |
| A2/B2 | preflight, **destino duplicado** | **0** | **1** | D-5.1 |
| A3/B3 | preflight, **sin manifiesto** | **0** | **1** | D-5.1 |
| A4/B4 | preflight, origen ausente **+ `APE_PREFLIGHT_STRICT=1`** | **0** | **1** | D-5.1 (flag nuevo) |
| B5 | preflight, origen ausente **sin** el flag | — | 0 | la política por defecto **no** cambia |
| A5/B6 | preflight, fila de un solo campo | **0** | **1** | D-5.1 |
| A6/B7 | preflight, destino relativo | **0** | **1** | D-5.1 |
| A7/B8 | dry-run, **VPS caído** (stub 255) | **0** | **4** | D-5.2 |
| A8/B9 | dry-run, VPS alcanzable y vacío | 0 | 0 | "vacío" sigue siendo "vacío" |
| A9/B10 | validate, **VPS caído** (stub 255) | **2** | **6** | D-5.3 |
| A10/B11 | validate, sintaxis rota (stub 1/255) | 2 | 2 | la detección **no** se debilita |

### 3.1 Preflight con destino duplicado — literal

ANTES (exit **0**):

```
   [1] OK-LOCAL       _vps_stage/lua/a.lua (4 B)  →  /etc/nginx/lua/a.lua
   ...
   [5] OK-LOCAL       _vps_stage/js/c.js (9 B)  →  /etc/nginx/lua/a.lua
== RESUMEN PRE-FLIGHT
   orígenes ausentes en local : 0 (no se desplegarán)
   bloqueos                   : 0
   PRE-FLIGHT OK — nada se ha modificado en el VPS
```

La fila 5 apunta al **mismo destino** que la 1 y el preflight dice OK.

DESPUÉS (exit **1**):

```
   [5] BLOQUEO: destino duplicado en el manifiesto: /etc/nginx/lua/a.lua
   [5] OK-LOCAL       _vps_stage/js/c.js (9 B)  →  /etc/nginx/lua/a.lua
== RESUMEN PRE-FLIGHT
   orígenes ausentes en local : 0 (no se desplegarán)
   bloqueos                   : 1
   PRE-FLIGHT CON BLOQUEOS
```

### 3.2 Preflight sin manifiesto — literal

ANTES: imprime `FATAL: falta …/manifest.tsv` y termina en `bloqueos: 0` / `PRE-FLIGHT OK`
(exit 0). DESPUÉS: `BLOQUEO: manifiesto ausente o ilegible (…/manifest.tsv)`, `bloqueos: 1`,
`PRE-FLIGHT CON BLOQUEOS` (exit 1).

### 3.3 Dry-run con el VPS caído — literal

ANTES (exit **0**):

```
== DRY-RUN · root@178.156.147.234 · … · (no se escribe nada)
ssh: connect to host 203.0.113.9 port 22: Connection refused
ESTADO    TAMANO     HASH      DESTINO ← ORIGEN
NUEVO     4          1fca19817557… /etc/nginx/lua/a.lua ← _vps_stage/lua/a.lua
NUEVO     14         939991e874bf… /etc/nginx/php/b.php ← _vps_stage/php/b.php
NUEVO     9          4c3850720629… /opt/ape/c.js ← _vps_stage/js/c.js
NUEVO     9          989a8fd37b39… /etc/nginx/conf.d/d.conf ← _vps_stage/conf/d.conf
   ficheros que CAMBIARIAN: 4
   DRY-RUN COMPLETO
```

El `Connection refused` está en la salida y el script aun así informa "todo nuevo" y "completo".

DESPUÉS (exit **4**):

```
== DRY-RUN · root@178.156.147.234 · … · (no se escribe nada)
ssh: connect to host 203.0.113.9 port 22: Connection refused
   RED: no se pudo conectar por SSH a root@178.156.147.234 (rc=255)
   DRY-RUN ABORTADO: no se ha leido NADA del VPS; esto NO significa que el VPS este vacio.
```

### 3.4 Validate con el VPS caído — literal

ANTES (exit **2**):

```
   FALLA    _vps_stage/lua/a.lua (luac -p)
   FALLA    _vps_stage/php/b.php (php -l)
   OK-node  _vps_stage/js/c.js
   DIFERIDO _vps_stage/conf/d.conf (…)
   OK=1  FALLOS=2  DIFERIDOS/SKIP=1
   VALIDACIÓN CON FALLOS
```

Dos "fallos de sintaxis" que en realidad son dos fallos de red.

DESPUÉS (exit **6**):

```
   RED: no se pudo conectar por SSH a root@178.156.147.234 (rc=255)
   NO SE PUDO VALIDAR: 0 ficheros comprobados. NO es un error de sintaxis.
```

Y con el VPS alcanzable y sintaxis rota (B11), el parcheado sigue diciendo exactamente lo mismo
que el original: `FALLA _vps_stage/lua/a.lua (luac -p)`, `FALLA _vps_stage/php/b.php (php -l)`,
`FALLOS=2`, exit **2**.

---

## 4. CÓDIGOS DE SALIDA Y QUIÉN LOS CONSUME

| Script | Antes | Después |
|---|---|---|
| `preflight.sh` | 0 siempre (salvo 2/3 de red en `:14,:17`) | **0** sin bloqueos · **N** = número de bloqueos (§2) · **2** SSH inalcanzable · **3** comando remoto falló |
| `dry-run.sh` | 0 siempre | **0** ok · **4** VPS inalcanzable · **5** comando remoto falló |
| `validate.sh` | N = nº de fallos (red incluida) | **N** = nº de fallos **reales** de sintaxis · **6** no se pudo validar (red) · **7** comando remoto falló |

**Consumidores reales (medidos):**
- `.github/workflows/deploy-vps.yml:252-256` → `run: set -euo pipefail` + `bash preflight.sh`
- `.github/workflows/deploy-vps.yml:257-260` → `set -euo pipefail` + `bash dry-run.sh`
- `.github/workflows/deploy-vps.yml:287-291` → `set -euo pipefail` + `bash validate.sh`
- `deploy.sh:16` → `"$DEPLOY_DIR/validate.sh" || { … exit 3; }`
- `_vps_stage/deploy/README.md:38` (ejecución manual) y `_vps_stage/deploy/README.md:96-98`
  (`bash -n` en el gate de sintaxis)

Los tres steps usan `set -euo pipefail`: **cualquier** código distinto de 0 tumba el job. Por eso
el cambio no es cosmético — es exactamente el objetivo (que el pipeline se pare cuando debe), y
por eso la decisión D-5 exige autorización explícita.

**Colisión de códigos en `preflight.sh`, declarada:** como `exit "$fails"` devuelve el **número**
de bloqueos, un manifiesto con 2 bloqueos sale con **2**, el mismo código que "SSH inalcanzable".
Se conserva porque (a) el script ya devolvía ese número y cambiarlo rompería la lectura del
resumen, y (b) los códigos 2/3 solo se emiten **antes** del resumen y con el mensaje `RED:`/`COMANDO:`
delante. Si el operador prefiere un código único, es una línea: `[ "$fails" -gt 0 ] && exit 1`.

---

## 5. CÓMO SE APLICA (cuando se autorice) Y CÓMO SE REVIERTE

### 5.1 Orden recomendado

1. **`0003b-dryrun-rsh-exit.patch`** — el más aislado (una comprobación de `rc` en un punto) y el
   que cierra la mentira más peligrosa: hoy un VPS caído se lee como "todo nuevo".
2. **`0003c-validate-network.patch`** — añade **un** round-trip SSH (la sonda). Es el único coste
   nuevo del conjunto y conviene medirlo en una corrida real del job `validate`.
3. **`0003a-preflight-fails.patch`** — el de mayor superficie (bucle + resumen + variable nueva).
   Va último para que, si algo se tuerce, los dos anteriores ya estén validados en el pipeline.

### 5.2 Aplicar y verificar

```bash
cd /ruta/al/repo
for p in 0003b-dryrun-rsh-exit 0003c-validate-network 0003a-preflight-fails; do
  git apply --check "docs/canary/fixes/03_deploy_headers/$p.patch" || exit 1
  git apply --verbose  "docs/canary/fixes/03_deploy_headers/$p.patch" || exit 1
done
bash -n _vps_stage/deploy/preflight.sh _vps_stage/deploy/dry-run.sh _vps_stage/deploy/validate.sh
sha256sum _vps_stage/deploy/{preflight,dry-run,validate}.sh
```

sha256 **esperados** tras aplicar (§1): `b83edbad…` · `9c64915f…` · `9f42450b…`.
Si no coinciden, no sigas: algo del árbol no era el que se auditó.

### 5.3 Reversión

```bash
# opción A — invertir el parche
git apply -R "docs/canary/fixes/03_deploy_headers/0003a-preflight-fails.patch"

# opción B — volver al blob versionado (más simple y comprobable)
git checkout -- _vps_stage/deploy/preflight.sh
sha256sum _vps_stage/deploy/preflight.sh   # debe dar 1b49e359fbe63f1dddaa23ed7143e9da2ec779853f7bb2fc51addbd8b325a4a1
```

sha256 **originales** (los del repo hoy): `preflight.sh 1b49e359…a4a1` ·
`dry-run.sh 6d6b893f…f715` · `validate.sh 9554456…8eb`.
Revertir **no** requiere tocar el VPS: los tres scripts son read-only por diseño
(`preflight.sh:2`, `dry-run.sh:2`, `validate.sh:2`).

### 5.4 Riesgo declarado

| Riesgo | Detalle |
|---|---|
| **Rompe el pipeline si hay drift** | Con el parche, un manifiesto con duplicados/relativos/ilegible **para el job**. Hoy el manifiesto está limpio (§5.5), así que no debería dispararse; si mañana alguien añade una fila mala, el deploy se para — que es lo que se quiere, pero es un cambio de comportamiento. |
| **Un round-trip SSH más en validate** | La sonda `rsh 'true'` añade una conexión por corrida. Con `ConnectTimeout=10` (`lib.sh:21`) el peor caso son +10 s en el job `validate`. |
| **Códigos nuevos (4/5/6/7)** | Cualquier script externo que interpretara los códigos de `validate.sh` como "número de fallos" vería 6/7. En el repo, el único consumidor es `deploy.sh:16` (`|| exit 3`), que solo distingue 0 de no-0. |
| **`exit "$fails"` puede devolver 2 o 3** | Colisión declarada en §4. |
| **No probado contra el VPS real** | La demo usa un stub de `ssh`. No se ha ejecutado nada contra 178.156.147.234 ni contra el pool php-fpm. |

### 5.5 Estado del manifiesto real (por qué hoy no cambiaría nada)

Medido sobre `_vps_stage/deploy/manifest.tsv` (61 líneas, **33 filas de datos**):

| Comprobación | Resultado |
|---|---|
| Filas con 5 columnas | **33 / 33** |
| Destinos no absolutos | **0** |
| Destinos duplicados | **0** |
| Orígenes ausentes en el repo | **0** |

⇒ con el parche aplicado, `preflight.sh` seguiría saliendo **0** sobre el árbol actual. El parche
no cambia el resultado de hoy; cambia lo que pasará el día que el manifiesto se rompa.

---

## 6. VERIFICACIÓN EJECUTADA (reproducible)

```
git apply --check 0003a-preflight-fails.patch    -> exit 0
git apply --check 0003b-dryrun-rsh-exit.patch    -> exit 0
git apply --check 0003c-validate-network.patch   -> exit 0

# repo simulado (git init + el mismo .gitattributes), aplicar los 3 y comparar
git apply <los 3>                                -> los 3 "Applied patch … cleanly"
bash -n de los tres parcheados                   -> OK / OK / OK

# el repo real no se ha tocado
sha256 preflight.sh = 1b49e359fbe63f1dddaa23ed7143e9da2ec779853f7bb2fc51addbd8b325a4a1
sha256 dry-run.sh   = 6d6b893fee544b08d4e3eb1a68801c38b307b77742d47649117e6afaa00ef715
sha256 validate.sh  = 955445618acb1df6c6e82326483e1c4c5db5b89d33d1b96c19d02232e53cf8eb
git status --porcelain -- _vps_stage/            -> vacío
```

Demo completa: `/tmp/ape-d5/demo3.sh` (stub + 21 casos). Log literal con los 21 bloques:
`/tmp/ape-d5/demo_log3.txt`. El sandbox se reconstruye desde el repo en cada corrida
(`reset_sandbox()`), así que el bloque ANTES usa siempre los scripts originales.

---

## 7. LÍMITES HONESTOS

- **No se ha probado contra el VPS.** El stub reproduce los códigos de `ssh` (255 al no conectar) y
  el texto de `luac`/`php -l`, no la red real.
- **La sonda de `validate.sh` no cubre una caída a mitad de corrida.** Si la conexión se cae
  después de la sonda, los ficheros restantes se contarán como `FALLA` con el texto del error de
  ssh delante. Es una ventana estrecha y preferible a la ambigüedad del 255 de `php -l`.
- **`preflight.sh` sigue sin `set -e`.** El parche no lo añade a propósito: con `set -e` el script
  abortaría en el primer comando que devuelva != 0 (incluidos los `[ … ]` del resumen). Se
  gestionan los códigos explícitamente, como ya hacía el original.
- **No se toca `deploy.sh`.** Su `exit 3` (`:16`) sigue siendo genérico; ahora el mensaje de
  `validate.sh` distingue el motivo, pero el código de `deploy.sh` no cambia.
- **No hay test automático** de estos parches en el repo (`_vps_stage/deploy/README.md:96-98` solo
  hace `bash -n`). Si se aplican, conviene añadir un caso al gate de sintaxis que verifique el
  código de salida con un `SSH_BIN` falso — no se ha hecho aquí porque el inScope de esta tarea es
  solo este directorio.

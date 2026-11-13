# Paquete de arreglos del contrato Canary → JIT

**Fecha:** 2026-11-12 · **Autor:** gate-runner (t37) · **Base git:** `472f7cc3`
**Índice legible por máquina:** [`MANIFEST.json`](MANIFEST.json) — 13.850 B, `sha256 82c82bed08925406d316dfed50a5a5d214d185f7e68a98335bdbb69e141385a5`

## 0 · Qué es esto, y qué no es

Son **8 parches** que arreglan defectos medidos del contrato Canary → JIT, empaquetados para que se puedan aplicar de uno en uno y revertir de uno en uno.

**NINGUNO ESTÁ APLICADO.** Ni al repo, ni al VPS, ni a git. Todos se verificaron con `git apply --check` (no escribe) y se probaron en copias temporales. El repo real queda byte-idéntico salvo los ficheros de este paquete.

Este paquete **no decide nada**: no commitea, no despliega, no rota secretos. Ordena el trabajo para que el operador decida con el hash delante.

## 1 · Los 8 parches

| # | Decisión | Parche | Bytes | sha256 (16) | Fichero objetivo |
|---|---|---|---:|---|---|
| 1 | **D-3** | [`01_manifest_row/0001-manifest-row.patch`](01_manifest_row/0001-manifest-row.patch) | 1.185 | `32649bb00e092227…` | `_vps_stage/deploy/manifest.tsv` |
| 2 | **D-2** | [`02_conviva_auth/0002-conviva-auth.patch`](02_conviva_auth/0002-conviva-auth.patch) | 3.186 | `4fc0c1e8895bb173…` | `…/vps/prisma/api/conviva-event.php` |
| 3 | **D-5** | [`03_deploy_headers/0003a-preflight-fails.patch`](03_deploy_headers/0003a-preflight-fails.patch) | 3.425 | `c4c1643aed644979…` | `_vps_stage/deploy/preflight.sh` |
| 4 | **D-5** | [`03_deploy_headers/0003b-dryrun-rsh-exit.patch`](03_deploy_headers/0003b-dryrun-rsh-exit.patch) | 1.435 | `dc972df216a1b632…` | `_vps_stage/deploy/dry-run.sh` |
| 5 | **D-5** | [`03_deploy_headers/0003c-validate-network.patch`](03_deploy_headers/0003c-validate-network.patch) | 1.238 | `352b9bf95811458c…` | `_vps_stage/deploy/validate.sh` |
| 6 | **H1** | [`04_engine_dos/0004-engine-tdz-dos.patch`](04_engine_dos/0004-engine-tdz-dos.patch) | 2.264 | `b4dcebe5803cfa8b…` | `tools/lab/ape-jit/server.js` |
| 7 | **H1** | [`04_engine_dos/0004b-engine-nice-fallback.patch`](04_engine_dos/0004b-engine-nice-fallback.patch) | 1.648 | `754cd9a5222391ff…` | `tools/lab/ape-jit/server.js` |
| 8 | **D-4** | [`00_gitignore/0005-gitignore-deliverables.patch`](00_gitignore/0005-gitignore-deliverables.patch) | 290 | `e31cf2219e943a2d…` | `.gitignore` |

**Estado de los 8:** `git apply --check` → **exit 0** contra el repo real. Bytes y sha256 medidos en esta corrida, no heredados. El detalle de cada uno (riesgo en una línea y reversibilidad) está en `MANIFEST.json`.

> **Sobre «los cinco parches».** El encargo habla de cinco: son las **cinco carpetas/decisiones** (D-2, D-3, D-4, D-5, H1). En disco hay **8 ficheros `.patch`**, porque D-5 son tres cambios independientes y H1 son dos sobre el mismo motor. El índice lista los **8**, que es lo que hay.

## 2 · Decisiones que NO tienen parche (y por qué)

| Decisión | Qué es | Por qué no hay diff |
|---|---|---|
| **D-1** | Rotación del secreto de enrolamiento | **No es un cambio de fichero.** Es una acción de servidor: generar un secreto nuevo, configurarlo en el VPS y regenerar/reinstalar los binarios que lo llevan embebido. Ningún parche puede expresar eso sin tocar el VPS. El hallazgo (secreto en claro en **29 de 34** binarios distintos) sigue documentado; su arreglo es operativo. |
| **D-7** | Commit / versionado | **No es un cambio de fichero.** Es la decisión de **qué** entra en git y **cuándo**. Con D-4 sin aplicar, los entregables ni siquiera son visibles; commitear es del operador. |

## 3 · Huecos de trazabilidad que se declaran, no se tapan

| ID | Estado | Razón |
|---|---|---|
| **D-6** | **NO IDENTIFICADO** | Ningún artefacto del paquete lo referencia: ni los README de las cuatro carpetas, ni los parches. **No lo invento.** Queda como hueco para que el operador diga a qué decisión corresponde. |
| **0002 + nginx** | **INCOMPLETO** | El parche autentica el endpoint en PHP, pero `prisma-conviva-event.conf:46-50` incluye `fastcgi.conf` **sin pasar `HTTP_AUTHORIZATION`**. Sin añadir `fastcgi_param HTTP_AUTHORIZATION $http_authorization;` en el `location`, la cabecera **nunca** llega a PHP y todo devolvería 401. Ese cambio de nginx **no está en el paquete** (t34 lo declara como requisito BLOQUEANTE en su README §4). |
| `02_conviva_auth/_proof/repo/` | **DUPLICADO** | Contiene una copia completa de `conviva-event.php` (9.962 B): es el andamio de la prueba de t34, no un parche. Se declara para que nadie lo confunda con el objetivo real. |

## 4 · Orden recomendado de aplicación

**Criterio:** primero lo que **no cambia comportamiento de producción**; al final el motor, porque **mueve el sha256 que el contrato pina**.

| Orden | Parche | Por qué ahí |
|---:|---|---|
| **1** | `0003a-preflight-fails.patch` | Solo el script de preflight: hace que cuente lo que hoy se traga. No toca producción. |
| **2** | `0003b-dryrun-rsh-exit.patch` | Solo dry-run: deja de decir «COMPLETO» cuando no leyó nada del VPS. |
| **3** | `0003c-validate-network.patch` | Solo validate: separa fallo de red de fallo de sintaxis. |
| **4** | `0005-gitignore-deliverables.patch` | No cambia producción ni comportamiento: solo hace **visible** lo invisible. Conviene pronto, para que los demás parches y los entregables puedan viajar. |
| **5** | `0002-conviva-auth.patch` | Endurece el endpoint vivo. **Antes** hay que crear `CONVIVA_EVENT_TOKEN` y añadir la cabecera en nginx, o el heartbeat se cae con 503/401. |
| **6** | `0001-manifest-row.patch` | Cambia **qué** script se despliega y activa CPU en el bucle Canary↔JIT. Requiere ventana y aceptar el riesgo de incidente (ya ocurrió una vez). |
| **7** | `0004-engine-tdz-dos.patch` | **Último**: cierra el DoS de `GET /meta` pero **mueve el sha256 del motor** que el contrato pina. Obliga a re-pinear y re-congelar el 92/92 en la misma sesión. |
| **8** | `0004b-engine-nice-fallback.patch` | Mismo fichero que 0004. Medido: aplican en **cualquier orden** y `node -c` pasa tras la secuencia. Aplicarlo junto al 0004 evita **dos** re-pineos. |

**Independencias medidas:**

- `0003a`, `0003b` y `0003c` van a **ficheros distintos**: son independientes entre sí.
- `0004` y `0004b` comparten objetivo. Comprobado en copia: `0004→0004b` y `0004b→0004` **ambos aplican** (exit 0) y `node -c` sale **0** tras la secuencia.

## 5 · Después de aplicar **cualquiera**: volver a pasar los gates

No es opcional. Un parche aplicado sin re-medir es una declaración, no un hecho.

```bash
node tools/canary/rea_loop.js                       # bucle REA (12.642 B, existe)
node tools/check_anti_degradation_policy.js         # anti-degradación (hoy ROJO, preexistente)
node tools/check_crystal_4k_law.js                  # Crystal 4K
node tools/check_crystal_6k_law.js                  # Crystal 6K
node tools/quality/test_canary_jit_contract.js      # validador fail-closed del contrato (92/92)
```

> **Aviso específico para H1 (`0004` + `0004b`):** el contrato `contracts/canary_jit_contract_v1.json` pina el sha256 del motor desplegable. Hoy es `28352c508285b1ee…36ff67`; tras los dos parches pasa a `290b11030f3b6bf9…aeb492` (medido en copia por t36). Aplicarlos **exige** re-pinear el contrato, volver a ejecutar el validador y **re-congelar las cifras** del documento del contrato. Aplicar H1 y no re-pinear deja el contrato apuntando a un artefacto que ya no existe.

## 6 · D-4 en una línea, con su coste

El `.gitignore` oculta `docs/canary/deliverables/` por la línea 173 (`deliverables/`). El parche añade `!docs/canary/deliverables/` **después** de esa línea, y está demostrado en copia: los **7** ficheros pasan de `check-ignore` **exit 0** a **exit 1**, y el `.gitignore` real queda **byte-idéntico**. Coste si se aplica y se commitea: **4.223.008 B = 4,03 MiB** (PDF 3.278.756 B + patch 865.408 B + 4 documentos 68.844 B). Detalle y salida literal en [`00_gitignore/README.md`](00_gitignore/README.md).

## 7 · Cómo aplicar y cómo volver atrás

```bash
# comprobar sin escribir
git apply --check docs/canary/fixes/<carpeta>/<parche>.patch

# aplicar
git apply docs/canary/fixes/<carpeta>/<parche>.patch

# revertir
git apply -R docs/canary/fixes/<carpeta>/<parche>.patch
```

En `MANIFEST.json` cada parche lleva su `riesgo` en una línea y su `reversibilidad` (ALTA/MEDIA) con el detalle de qué hace falta para deshacerlo de verdad.

## 8 · Lo que este paquete no ha verificado

- **Nada del VPS.** Sin acceso autenticado: que el VPS ejecute estos ficheros, y el estado vivo de `conviva-event.php` y del manifiesto, son `NO_COMPUTADO`.
- **Que H1 cierre el DoS en producción.** Medido en loopback con copias (`/meta/1.json` → 200, stderr vacío, 1 socket en LISTEN): eso prueba el mecanismo, no el despliegue.
- **Que D-2 funcione sobre PHP real.** No hay PHP ni Docker en el host (límite declarado por t34): su test corre sobre un port fiel en JS.
- **Que existan los 7 entregables en un clon.** Hoy no: ese es exactamente el hueco que D-4 propone cerrar, y cerrarlo es decisión del operador.

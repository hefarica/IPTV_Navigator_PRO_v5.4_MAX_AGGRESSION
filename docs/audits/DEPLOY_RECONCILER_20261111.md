# RECONCILIADOR VPS — `--audit` / `--plan` / `--apply` sobre el tooling real

**Fecha:** 2026-11-11 · **Autor:** `contract-architect` (t13, team `canary-jit-20261111`)
**Alcance:** `_vps_stage/deploy/` leído, **no modificado**. Cero contacto con el VPS. Cero `--apply` ejecutado.
**Artefactos:** [`contracts/canary_vps_reconciler_contract.json`](../../contracts/canary_vps_reconciler_contract.json) ·
[`tools/canary/deploy_contract_check.js`](../../tools/canary/deploy_contract_check.js)

## 1. Veredicto en una línea

**El reconciliador ya existe y no hay que crearlo.** `deploy.sh:9-12` delega en `dry-run.sh` cuando falta
`--apply`, y `dry-run.sh` es de **solo lectura contra el VPS**: sus dos únicos comandos remotos
(`dry-run.sh:7` y `:35`) son `sha256sum`/`stat`/`ls`. Lo único que escribe es **un snapshot local**
(`dry-run.sh:8`), así que la cabecera «CERO escrituras» es imprecisa — va como hallazgo **F1**, no se
arregla el script.

## 2. Mapeo de los tres modos del prompt

| Modo del prompt | Implementación real | Cómo se invoca | Escribe en el VPS |
|---|---|---|---|
| `--audit` | `dry-run.sh` | `deploy.sh` sin `--apply` → `exec` (`deploy.sh:9-12`) | **No** |
| `--plan` | `dry-run.sh` (el **mismo** artefacto) | idéntico | **No** |
| `--apply` | `deploy.sh --apply --yes` | directo al entrypoint | **Sí**, atómico y con rollback |

`--audit` y `--plan` comparten implementación **a propósito**: el plan *es* el diff de hashes. Cada fila del
manifiesto sale como `NUEVO` / `CAMBIA` / `IGUAL` (`dry-run.sh:22-28`) y el resumen cuenta «ficheros que
CAMBIARIAN» (`dry-run.sh:38`). No existe un planificador separado y no hace falta: sería una segunda fuente
de verdad del mismo cálculo. `parallel_reconciler_created: false` en el contrato, con esa justificación.

## 3. Por qué `dry-run.sh` es de solo lectura (fichero:línea)

Revisado el fichero **completo** (41 líneas), no la cabecera:

| Línea | Qué hace | ¿Escribe? |
|---|---|---|
| `:3` | `source lib.sh` (constantes, sin efectos) | No |
| `:4` | `c_hdr` → stdout | No |
| `:6` | `dests` = destinos del manifiesto (local) | No |
| `:7` | **remoto**: `sha256sum`, `stat -c %s`, `stat -c %y` por fichero | **No** (solo lectura) |
| `:8` | `printf … > "$SNAP_DIR/dryrun_remote_hashes_${STAMP}.txt"` | **SÍ, local** |
| `:13-31` | `while read` sobre el manifiesto + `awk` sobre la salida de `:7` | No |
| `:35` | **remoto**: `ls -1 /etc/nginx/lua/*.lua \| sed` | **No** |
| `:37-41` | resumen a stdout | No |

- **Comandos remotos mutantes: 0.** Los dos `rsh` (`:7`, `:35`) solo leen. Comprobado por el gate en **C4**
  (clasificación explícita de cada `rsh` contra una lista de verbos que escriben) y **C5** (ninguna
  redirección de escritura dentro de un comando remoto).
- **Escrituras locales: 1** — `dry-run.sh:8`. Ejecutado de verdad en **D1**: el único fichero nuevo en todo
  el árbol de trabajo fue `snapshots/dryrun_remote_hashes_<STAMP>.txt`, **dentro del sandbox**, y el árbol
  real `_vps_stage/deploy` quedó byte-idéntico.
- **Dependencia frágil (F5):** `lib.sh:8` solo *asigna* `SNAP_DIR`; nadie lo crea. Si `snapshots/` no
  existiera, el redirect de `:8` falla y el script **continúa** (no hay `set -e`), imprimiendo el diff igual.

**Límite honesto del modo lectura:** `dry-run.sh` no aborta si el `rsh` falla. Con el VPS inalcanzable el
diff degrada a «todo NUEVO/AUSENTE» y el script **termina 0**. Es decir: `exit 0` de `dry-run.sh` **no
distingue** «VPS inalcanzable» de «VPS vacío». Declarado en el contrato (`modes.audit.exit_codes`) y en
`not_computed`.

## 4. Gates de `--apply` (todos con fichero:línea)

| Gate | Qué exige | Fichero:línea | Exit |
|---|---|---|---|
| G0 | sin `--apply`: delega y **no** muta | `deploy.sh:9-12` | `exec` |
| G1 | `--yes` explícito | `deploy.sh:13` | **2** |
| G2 | `validate.sh` en verde | `deploy.sh:16` | **3** |
| G3 | staging creado | `deploy.sh:20` | 4 |
| G4 | transporte íntegro (sha local == sha en staging) | `deploy.sh:37-39` | 5 |
| G5 | lint en staging (`luac -p`, `php -l`) | `deploy.sh:41-42` | 6 |
| G6 | el manifiesto se iteró completo (anti-robo de stdin) | `deploy.sh:49-52` | 10 |
| G7 | paridad post-install por fichero + recuento | `deploy.sh:80-97` | 7 + rollback |
| G8 | `nginx -t` tras instalar | `deploy.sh:98` | 7 + rollback |
| G9 | provisión de estado `/sync` | `deploy.sh:107` | 13 + rollback |
| G10 | include del snippet `/sync` | `deploy.sh:117` | 14 + rollback |
| G11 | re-`nginx -t` + reload | `deploy.sh:125-130` | 15 / 8 + rollback |
| G12 | restart **solo si ya estaba activo**, y sigue activo | `deploy.sh:144-165` | 16 / 17 + rollback |
| G13 | `verify.sh`: smoke HTTP + paridad completa | `deploy.sh:186` + `verify.sh:112-116` | 9 / 2 |

**Orden que importa:** la primera mutación remota es `deploy.sh:20` (`mkdir -p` del staging y del backup) y
la primera mutación de un **destino desplegado** es `deploy.sh:80` (`install -m`). `--yes` (`:13`) y
`validate.sh` (`:16`) están **antes** de las dos. La cadena `--apply` → `--yes` → `validate` es, por tanto,
estrictamente previa a cualquier escritura.

**Regla de rollback:** todo fallo **posterior** al backup (`deploy.sh:59-63`) llama a
`rollback.sh <STAMP> --yes` antes de salir (`:100, :109, :119, :127, :130, :155, :161, :188`). Todo fallo
**anterior** (exit 2, 3, 4, 5, 6, 10, 11) no necesita rollback porque no se ha instalado nada. Si el propio
rollback falla, el script lo declara y pide intervención manual con el backup (`:100`).

## 5. Los 12 items de verificación del prompt

Sin inventar cobertura: lo que el pipeline no comprueba se declara `NO_COMPUTADO` con su razón.

| # | Item | Cobertura | Quién lo comprueba (fichero:línea) | Nota |
|---|---|---|---|---|
| 1 | FILE EXISTS | **COVERED** | `deploy.sh:32` (AUSENTE-LOCAL → exit 11), `deploy.sh:73`, `verify.sh:91-93`, `preflight.sh:26-28` | Existencia **local** del origen. La remota se compara (`deploy.sh:34`) pero no es gate: ausente = «cambia» |
| 2 | FILE HASH MATCHES | **COVERED** | `deploy.sh:84-89`, `verify.sh:96-116` (exit 2), `deploy.sh:38-39` | El gate más fuerte: sha256 local vs sha256 remoto |
| 3 | CONFIG VALID | **COVERED** | `validate.sh:15` (luac), `:18` (php -l), `:21` (node -c), `deploy.sh:98` y `:125` (nginx -t) | Los `.conf` **no** se validan antes de instalar: `validate.sh:24` los difiere y `nginx -t` corre en `:98`, tras instalar en `:80`. Mitigado por rollback, no por orden |
| 4 | SERVICE INSTALLED | **PARTIAL** | `manifest.tsv` + `deploy.sh:80` (install) + `deploy.sh:170` (daemon-reload) | El **fichero** de la unit se instala y se verifica por hash. `systemctl enable`/`is-enabled`: **0 ocurrencias** → habilitado/registrado = NO_COMPUTADO |
| 5 | SERVICE HEALTHY | **PARTIAL** | `verify.sh:77-78` (8088 `__selftest`, `_ape/health`) + `deploy.sh:158-163` (is-active tras restart) | Cubre la capa lua y «sigue activo». **Ningún `/health` de ape-jit** → salud del motor JIT = NO_COMPUTADO |
| 6 | ENDPOINT AUTHORIZED | **PARTIAL** | `sync-smoke.js:17-18` (401 sin firma, 401 key desconocida, 413, 429, 200 con HMAC) ← `verify.sh:119-127` | Solo en deploy real y requiere `SYNC_KEY`/`TOKEN`: sin claves el 200 se marca SKIP (`sync-smoke.js:12,15`) |
| 7 | ROUTE COMPATIBLE | **PARTIAL** | `deploy.sh:98`, `:125` (nginx -t) + `:117` (sync-include) | Prueba que la config **parsea**; no hay test de comportamiento por ruta |
| 8 | POLICY REVISION MATCHES | **NO_COMPUTADO** | — | El manifiesto no incluye `quality-policy.json` (vive en `scratch/`, gitignored) y ningún script compara `revision` ni `policy_sha256` |
| 9 | JIT INHERITS CANARY | **NO_COMPUTADO** | — | Nada en `_vps_stage/deploy` verifica que el motor consuma la política del Canary |
| 10 | DEVICE REGISTRATION WORKS | **NO_COMPUTADO** | — | `sync-smoke.js` firma con device+clave **preexistentes**; 0 llamadas al alta/enrolamiento en todo el pipeline |
| 11 | PLAYLIST INDEX CONSISTENT | **PARTIAL** | `verify.sh:61-69` (descubre la `.m3u8` viva y la pide: 200 + `#EXTM3U`) | Prueba que la lista **servida** está viva; no compara índice contra disco |
| 12 | VIDEO PIPELINE VERIFIED | **NO_COMPUTADO** | — | Cero `ffprobe`/`ffmpeg` en `_vps_stage/deploy`: el deploy no decodifica vídeo |

**Recuento honesto: 3 COVERED · 5 PARTIAL · 4 NO_COMPUTADO.** Declarar «deploy verificado 12/12» sería
falso: el pipeline cubre integridad de ficheros y validez sintáctica, y **no** cubre política, dispositivo ni
vídeo.

## 6. Hallazgos: cabecera vs cuerpo (no se arregla el script)

| Id | La cabecera dice | El cuerpo hace | Veredicto |
|---|---|---|---|
| **F1** | `dry-run.sh:2` «CERO escrituras» | `dry-run.sh:8` escribe un snapshot **local** | Read-only **contra el VPS**: cierto. Cero escrituras en absoluto: **falso** (1 local). Medido en D1 |
| **F2** | `lib.sh:9` «no hardcodear … IPs» | `lib.sh:12` tiene `178.156.147.234` por defecto | Se puede sobrescribir con `VPS_HOST`; no es secreto, pero el comentario promete más de lo que hace |
| **F3** | `preflight.sh:2` «Sale !=0 si algo bloquea» | `fails=0` (`:4`) **nunca** se incrementa; un origen ausente solo suma a `warns` (`:27-28`) | Solo sale !=0 por RED (`:14`) o comando remoto (`:17`). «bloqueos: 0» (`:42`) es una cifra muerta |
| **F4** | `validate.sh:2` validar «sin escribir nada en el VPS» | `:15` y `:18` ejecutan `luac -p` y `php -l` **remotos** por ssh | Cierto en escrituras (0), pero **no es offline**: sin VPS cada `.lua`/`.php` se marca FALLA y el deploy aborta con exit 3 |
| **F5** | (implícito) el snapshot «se guarda» | `lib.sh:8` solo asigna `SNAP_DIR`; nadie lo crea | Hoy no rompe (`snapshots/` está versionado); frágil ante un clon sin ese directorio. Sin `set -e`, el fallo es silencioso |
| **F6** | (medición, no script) | En este host (Windows + bash de WSL) un `$?`/`$var` dentro de la cadena de `bash -c` se expande **antes** de ejecutar | Medido: el script salía 2 y el wrapper imprimía `EXIT=0` / `RC=` vacío. El gate lee `spawn.status`, no `$?` |

## 7. Prueba ejecutable

```bash
node -c tools/canary/deploy_contract_check.js
node tools/canary/deploy_contract_check.js
```

Salida literal de la corrida (10 comprobaciones, exit **0**; el `STAMP` del snapshot varía en cada corrida):

```text
== CONTRATO DEL RECONCILIADOR VPS · audit/plan/apply sobre _vps_stage/deploy ==
pipeline: _vps_stage/deploy · sin red · sin VPS · copia de trabajo en os.tmpdir()

-- analisis de texto (solo lectura sobre el repo) --
  anclas: exec dry-run.sh :11 · guard --yes :13 · validate.sh :16 · primera mutacion :20
  PASS  C1 deploy.sh sin --apply DELEGA en dry-run.sh y no llega a mutar
        bloque sin-apply en :9, exec dry-run.sh en :11, primera mutacion en :20
  PASS  C2 deploy.sh --apply exige --yes (exit 2) antes de cualquier mutacion
        guard --yes en :13 con exit 2=true, primera mutacion en :20
  PASS  C3 validate.sh corre ANTES de la primera mutacion y su fallo aborta con exit 3
        validate.sh en :16 con exit 3=true, primera mutacion en :20
  PASS  C4 dry-run.sh no contiene comandos REMOTOS mutantes
        comandos remotos clasificados como solo-lectura
  PASS  C5 dry-run.sh no redirige escritura a rutas REMOTAS
        ninguna redireccion dentro de comandos remotos
  PASS  C6 SSH_BIN es la unica puerta: lib.sh lo respeta y ningun script llama a ssh directo
        ssh directo: ninguno · lib.sh respeta SSH_BIN=true

-- ejecucion local controlada (ssh sustituido por stub via SSH_BIN) --
  PASS  D1 deploy.sh sin --apply no escribe en el repo y ejecuta dry-run.sh
        exit=0 · delego a dry-run.sh=true · repo _vps_stage/deploy intacto=true · escrituras dentro del sandbox: snapshots/dryrun_remote_hashes_<STAMP>.txt
  PASS  D2 deploy.sh --apply sin --yes aborta con exit 2 sin contactar nada
        exit=2 (esperado 2) · llamadas ssh=0
  PASS  D3 validate.sh que falla aborta con exit 3 antes de mutar
        exit=3 (esperado 3) · llamadas ssh antes del aborto=0
  PASS  D4 el ssh real nunca se invoca (cero red, cero VPS)
        llamadas capturadas por el stub en D1=2 · en D2/D3=0 · el binario ssh real no se usa (SSH_BIN lo sustituye)

-- hallazgos (no tumban el gate: van al informe) --
  HALLAZGO  dry-run.sh:8 → escritura LOCAL: printf '%s\n' "$remote" > "$SNAP_DIR/dryrun_remote_hashes_${STAMP}.txt"
  HALLAZGO  lib.sh → no crea directorios: SNAP_DIR debe existir antes (si falta, el redirect de dry-run.sh:8 falla)
  HALLAZGO  dry-run.sh:8 (ejecutado) → crea snapshot LOCAL en snapshots/: snapshots/dryrun_remote_hashes_<STAMP>.txt — escritura local, NO remota

-- resumen --
  comprobaciones: 10 | PASS 10 | FAIL 0
  hallazgos declarados: 3
  RESULT=PASS
```

**Cómo se garantiza el «cero VPS»:** `lib.sh:31` permite sustituir el binario ssh (`SSH_BIN`), y `lib.sh:32`
es la única puerta de salida. El gate apunta `SSH_BIN` a un stub que registra la llamada y devuelve 255. Así
se ejecuta el pipeline **real** sin red: D1 demuestra que la delegación ocurre (2 llamadas capturadas, la
primera un `sha256sum`), y D2/D3 demuestran que los abortos tempranos **no** llegan a la puerta (0 llamadas).

**Control negativo del propio gate** (el gate debe poder fallar). Se añade una mutación remota a una copia y
se audita la copia:

```bash
# copia a os.tmpdir y mutación: rsh "rm -rf /var/www/html/lists/*.m3u8" al final de dry-run.sh
node tools/canary/deploy_contract_check.js --deploy-dir <ruta-de-la-copia>
```

```text
AVISO: auditando una COPIA (--deploy-dir), no el pipeline del repo
  FAIL  C4 dry-run.sh no contiene comandos REMOTOS mutantes
        MUTACIONES REMOTAS: dry-run.sh:42 (rm)
  comprobaciones: 10 | PASS 8 | FAIL 2
  RESULT=FAIL
```

El gate **nombra la mutación** y sale **1**. No es un sello de goma.

## 8. `NO_COMPUTADO` (con razón)

| Item | Razón |
|---|---|
| Que el proceso vivo ejecute el código del sha instalado | `deploy.sh:153/:158` reinician y comprueban `is-active`, pero no leen `/health` ni el sha del proceso. Requiere medir en el VPS (no se ha contactado) |
| Estado real del VPS hoy | Prohibido contactar `178.156.147.234`/`iptv-ape.duckdns.org` en esta tarea |
| Que `--audit` distinga «VPS inalcanzable» de «VPS vacío» | `dry-run.sh` no aborta si el `rsh` falla (no hay `set -e`): `exit 0` no lo distingue. Corregirlo es cambiar el script, y este contrato no lo toca |

## 9. Qué **no** se hizo

- **No** se contactó el VPS: ni `deploy.sh`, ni `dry-run.sh`, ni `validate.sh` se ejecutaron contra el host
  real. Toda ejecución usó el stub de ssh y una copia en `os.tmpdir()`.
- **No** se ejecutó `deploy.sh --apply` sobre el repo (solo sobre la copia, y solo en los dos casos que
  abortan por `--yes` y por `validate.sh`).
- **No** se creó ningún reconciliador paralelo (`parallel_reconciler_created: false`).
- **No** se modificó ningún fichero de `_vps_stage/deploy` (sha256 antes y después, en el informe de t13).
- **No** se arreglaron los hallazgos F1-F6: se documentan. Un script de despliegue se toca con su propio
  gate (`node tools/canary/deploy_contract_check.js`), no dentro de una auditoría.


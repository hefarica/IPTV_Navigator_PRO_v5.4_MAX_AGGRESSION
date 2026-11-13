# §16 — INVENTARIO DE ENTREGABLES (consolidacion final)

**Fecha:** 2026-11-11 · **Autor:** canary-auditor (team `canary-jit-20261111`, task `t29`)
**Metodo:** re-medido **en esta corrida** con `fs.statSync` + `sha256` sobre el arbol. **Cero hashes heredados** de t19 ni de t27.
**HEAD medido:** `472f7cc330e52dc2f7e3d16f6a451fd0b461949e`

## 1. Conteo honesto

| Bucket | Filas | Que significa |
|---|---|---|
| Existe con **nombre canonico** | **12** | el artefacto esta donde el §16 lo pide y con el nombre que pide |
| **Cubierto con otro nombre / otra forma** | **1** | fila 07: el encargo pedia un **directorio**, se entrego un **fichero** `.md` (§3) |
| **Parcial** | **1** | fila 08: el artefacto con el bucle Canary↔JIT existe pero **no es desplegable** (§4) |
| **NO_EXISTE** | **0** | ninguna fila cae aqui |
| **TOTAL** | **14** | 12 + 1 + 1 + 0 = 14 |

## 2. Las 14 filas, con bytes y sha256 medidos ahora

| # | Ruta canonica | Bucket | Artefacto medido | Bytes | SHA-256 | git |
|---|---|---|---|---|---|---|
| 1 | `docs/canary/deliverables/01_CANARY_JIT_ARCHITECTURE.pdf` | canonical | `docs/canary/deliverables/01_CANARY_JIT_ARCHITECTURE.pdf` | 1.685.154 | `70d6de7ca4ed83c8ccd0394f469acba55b92ba73f749bda346caa6495f4d0b8c` | IGNORADO |
| 2 | `docs/canary/deliverables/02_CANARY_APK_OTT_TIVIMATE_MANUAL.pdf` | canonical | `docs/canary/deliverables/02_CANARY_APK_OTT_TIVIMATE_MANUAL.pdf` | 1.593.602 | `c724300c2f496c5b19d80119173b06f9392d523ddbba77a3388ec592709dac8a` | IGNORADO |
| 3 | `docs/canary/deliverables/03_CANARY_JIT_INTEGRATION.patch` | canonical | `docs/canary/deliverables/03_CANARY_JIT_INTEGRATION.patch` | 865.408 | `a2ebec163172362a5be912f901e183e68f131de534e0461ab6c2aefc28163f89` | IGNORADO |
| 4 | `contracts/canary_policy_schema.json` | canonical | `contracts/canary_policy_schema.json` | 8672 | `bc9ed9fc94fa793f02061831161f0f3126c44a4179e1a2a3c7a671d4de727f8f` | untracked |
| 5 | `contracts/device_capability_schema.json` | canonical | `contracts/device_capability_schema.json` | 18.840 | `8ea89f8564a8b8b8da2b77808ef0113f68b37d9ae36ccbae4d130e84a24d3605` | untracked |
| 6 | `tools/canary/playlist_adapter.js` | canonical | `tools/canary/playlist_adapter.js` | 41.462 | `31020f0c1f9994bb59fb4f02da4558db42d5a04b52378f38eece4b2f3552eace` | untracked |
| 6 | ↳ (pieza adicional) | canonical | `tools/quality/test_playlist_adapter.js` | 30.784 | `8b5b313c335a08a01e6d08330620720c80d67caeaf67fc0336d77d553ab9efa4` | untracked |
| 7 | `docs/canary/deliverables/07_CANARY_DEVICE_REGISTRATION.md` | renamed | `docs/canary/deliverables/07_CANARY_DEVICE_REGISTRATION.md` | 25.619 | `96eec6fd6a4969b68ad9e4bcaf80f6fc5ccbb0769ced16c17926008d5e26760c` | IGNORADO |
| 8 | `vps/bin/ape-pulse-canary-worker.sh` | partial | `vps/bin/ape-pulse-canary-worker.sh` | 4043 | `a17281d6cf865b37f869924124af04c9296827565709c64ceaedd84db5ac282e` | tracked |
| 8 | ↳ (pieza adicional) | partial | `IPTV_v5.4_MAX_AGGRESSION/vps/ape-pulse/ape-pulse-canary-worker.sh` | 2802 | `ec52af6d588debc89348f6762978df4a6524be44593f5e56b5266b0ad0dc0509` | tracked |
| 8 | ↳ (pieza adicional) | partial | `vps/bin/ape-visual-emulate.sh` | 6714 | `f1d2ecff6e6468eb58e04658703a34df8b0e2df1c7d61540abbb84ebf768fec1` | tracked |
| 8 | ↳ (pieza adicional) | partial | `_vps_stage/canary/ape-visual-emulate.sh` | 4068 | `653b56e1ef964bc6a3d0cb32a48724ca2b04969faaa0612804e923c41f7243f8` | tracked |
| 8 | ↳ (pieza adicional) | partial | `_vps_stage/deploy/manifest.tsv` | 6501 | `5f5adcf10f66e742dcc68d06cbfc75f0e11c69cf7cc1de695f5372b946f018ed` | tracked |
| 9 | `contracts/canary_vps_reconciler_contract.json` | canonical | `contracts/canary_vps_reconciler_contract.json` | 15.558 | `761d621558e7742b631de861a3ec7e64665fb74d2ec325e033b7903328ded8b0` | untracked |
| 9 | ↳ (pieza adicional) | canonical | `tools/canary/deploy_contract_check.js` | 17.325 | `7b873ea169be4e6bba630edcbc17164c78665a159aeec989baa32362358a727c` | untracked |
| 10 | `docs/canary/deliverables/10_CANARY_ANDROID_APK.md` | canonical | `docs/canary/deliverables/10_CANARY_ANDROID_APK.md` | 16.793 | `8dc07a601da3639dba204ec419dcfc523d6d13ff2a9dc9dfaf23dd99694bc4ea` | IGNORADO |
| 11 | `docs/audits/ACCEPTANCE_MATRIX_20261111.json` | canonical | `docs/audits/ACCEPTANCE_MATRIX_20261111.json` | 32.284 | `5e201693a2aa2b7574d221626b2f5010c67b968a57f8e0c7b8d6e9bc0be73f77` | untracked |
| 11 | ↳ (pieza adicional) | canonical | `docs/audits/VEREDICTO_CANARY_JIT_20261111.md` | 44.013 | `3b9f155041a5c03558dc078421e5c0d0285e62173f883c488275d207b520c0b0` | untracked |
| 11 | ↳ (pieza adicional) | canonical | `docs/audits/ADVERSARIAL_CANARY_JIT_20261111.md` | 31.615 | `8a62e7203a558c86e43996475db4ff117ba84eb6a38d4b64ae6d1020a287faae` | untracked |
| 12 | `docs/canary/deliverables/12_CANARY_DEPLOYMENT_RECEIPT.json` | canonical | `docs/canary/deliverables/12_CANARY_DEPLOYMENT_RECEIPT.json` | 25.760 | `3d22513b8a77be5fccee1d6faa2a5c57b9852b6c485ee17dddfc058bcca6c65a` | IGNORADO |
| 13 | `_vps_stage/deploy/rollback.sh` | canonical | `_vps_stage/deploy/rollback.sh` | 1782 | `3aff6df8b5cd2e9d2935e4dff2f9580659469b2788c39743ce0aa4d42c4c0eb4` | tracked |
| 14 | `docs/audits/14_CANARY_FINAL_REPORT.md` | canonical | `docs/audits/14_CANARY_FINAL_REPORT.md` | 32.324 | `79c3f8513964463c5c58dd2386a0cea6d667ace335548c76ad05a622156c8916` | untracked |

> **`IGNORADO`** = `git check-ignore` exit 0. Los 6 entregables de `docs/canary/deliverables/` estan ignorados por **`.gitignore:173` → `deliverables/`**: existen en disco y **no viajan en git ni en el patch**. Ver `docs/audits/DELIVERY_GAP_20261111.md`.

## 3. Fila 07 — la discrepancia, declarada y no igualada

El encargo del §16 pedia un **directorio** para el entregable 07. Lo que existe en disco es **un fichero**:

- `docs/canary/deliverables/07_CANARY_DEVICE_REGISTRATION.md` — **25.619 B** — `96eec6fd6a4969b68ad9e4bcaf80f6fc5ccbb0769ced16c17926008d5e26760c`

No se ha creado el directorio para "cuadrar" la ruta, y no se declara cumplido el formato pedido: **la forma no coincide**. Se declara la discrepancia. Nota adicional: ese fichero cambio de tamano durante la sesion (24.972 → 25.619 B), asi que **su sha256 es un snapshot de este instante**, no una identidad historica.

## 4. Fila 08 — por que es PARCIAL, con las dos piezas medidas

| Pieza | Ruta | Bytes | SHA-256 | En `manifest.tsv`? |
|---|---|---|---|---|
| Worker del canary (mapped) | `vps/bin/ape-pulse-canary-worker.sh` | 4043 | `a17281d6cf865b37f869924124af04c9296827565709c64ceaedd84db5ac282e` | **SI** — `manifest.tsv:61` |
| Worker desplegado segun el incidente | `IPTV_v5.4_MAX_AGGRESSION/vps/ape-pulse/ape-pulse-canary-worker.sh` | 2802 | `ec52af6d588debc89348f6762978df4a6524be44593f5e56b5266b0ad0dc0509` | no (2.802 B es el original del 2026-11-09) |
| **Script con el bucle Canary↔JIT** | `vps/bin/ape-visual-emulate.sh` | 6714 | `f1d2ecff6e6468eb58e04658703a34df8b0e2df1c7d61540abbb84ebf768fec1` | **NO — 0 filas** |
| Script realmente desplegable | `_vps_stage/canary/ape-visual-emulate.sh` | 4068 | `653b56e1ef964bc6a3d0cb32a48724ca2b04969faaa0612804e923c41f7243f8` | **SI** — `manifest.tsv:39` |
| Manifiesto de despliegue | `_vps_stage/deploy/manifest.tsv` | 6501 | `5f5adcf10f66e742dcc68d06cbfc75f0e11c69cf7cc1de695f5372b946f018ed` | (es el propio manifiesto) |

**Por eso 08 es PARCIAL y no VERIFIED:** el artefacto que implementa el bucle Canary↔JIT (6.714 B) **no esta en el manifiesto**; lo que se despliega es la version de 4.068 B, que no llama al JIT. Un entregable que existe pero no se despliega esta a medio entregar, y se dice.

## 5. Hallazgos medidos que entran en la matriz

### 5.1 El registro vivo NO valida autenticacion — severidad MAYOR que la del secreto, para este contrato

| Hecho | Medida en esta corrida |
|---|---|
| `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/conviva-event.php` | 9.962 B · sha256 `9ffe5fb1584392542298ee0c85b24789845f8f4e498e4e9a9299020cf69c6349` |
| Cabecera del propio fichero | linea 6: `Conviva QoE Event Endpoint v1.0 — **Phase 1 Stub**` |
| Barrido `HTTP_AUTHORIZATION\|Authorization\|Bearer\|hash_equals\|401\|403\|token\|secret` | **1 sola coincidencia**, la linea 15, y es un **comentario**: `* Authorization: Basic <prisma_conviva:token>  (Phase 2)` |
| La app manda credencial? | Si: `Bearer` en el latido (`QoEReporter.kt:34-55`, `:149-176`) — y el servidor **lo ignora** |
| Contraste: `ara-enroll.php` | 3.746 B · sha256 `adf07d6fb5846172a4a7f309684e00ba08171fc5c1309ae6c67c6b7dfe168d3c`; **`:30`** `strlen($secret) < 16` → `ee_fail(503,"ENROLL_DISABLED")`; **`:38`** `hash_equals($secret,$given)` → `ee_fail(401,"BAD_SECRET")` |

**Por que es MAS grave que el secreto, para este contrato:** el secreto del APK exige tener el APK (o extraerlo del binario). El registro sin autenticar **no exige ninguna credencial**: cualquiera que alcance el endpoint puede crear o sobrescribir la fila de un `device_id` y falsear `state`, `player`, `ara_version`, `caps_json` y `last_seen` — **exactamente el estado que el VPS usa para el gate por dispositivo**. La exposicion del secreto es una fuga de identidad; esto es una **inyeccion de estado en el plano de control**, y se ejecuta sin secreto.

### 5.2 Desacople de los dos registros (sin FK)

`ara_heartbeats` se crea en `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_mesh.php:342-351` con columnas exactas: `device_id TEXT PRIMARY KEY`, `last_seen`, `channel_id`, `player`, `ara_version`, `state`, `caps_json`, `last_error`. **No hay `model`, no hay `assigned_ip` y no hay clave foranea** hacia el peer WireGuard: los dos registros comparten `device_id` **por convencion**. `model` y `assigned_ip` viven en `ape_peers.json`. El enrol no crea fila en `ara_heartbeats` y el heartbeat no toca el peer.

### 5.3 Discrepancia esquema ⇄ emisor

| Lado | Que exige / que manda |
|---|---|
| `contracts/device_capability_schema.json` | exige el objeto raiz con `schema`, **`snapshot_id`**, **`captured_at`** y `capabilities` (20 claves obligatorias, cada una con `provenance`) |
| Emisor real `QoEReporter.kt:39-44` | manda `caps = { soc, soc_8k, names }` — sin `snapshot_id`, sin `captured_at`, sin `provenance`, y con 3 claves en vez de 20 |

**Consecuencia:** el snapshot que el dispositivo emite **no valida** contra el esquema que el contrato declara. No es un fallo del esquema (esta bien) ni del emisor (hace lo que se le pidio en su dia): es que **nunca se alinearon**, y hasta hoy nadie lo habia puesto lado a lado.

### 5.4 `/api/v1/devices/register` NO existe

Barrido de `devices/register` sobre **1.984 ficheros** de `IPTV_v5.4_MAX_AGGRESSION/` (`.php,.kt,.js,.json,.md,.sh,.conf,.lua`): **0 coincidencias**. El endpoint que el encargo del §16 nombraba es un **PROPUESTO NO IMPLEMENTADO**; lo que existe son las dos piezas de §5.1/§5.2. (El encargo del capitan citaba 560 ficheros; mi filtro es mas ancho y el resultado es el mismo: 0.)

## 6. Parche PROPUESTO a la matriz §14 — no aplicado, requiere el pase de su autor

`docs/audits/ACCEPTANCE_MATRIX_20261111.json` (32.284 B · sha256 `5e201693a2aa2b7574d221626b2f5010c67b968a57f8e0c7b8d6e9bc0be73f77`) **no esta en mi `inScope`**: no lo he tocado. Lo que sigue es el contenido que sus filas **Registro** y **Seguridad** deberian llevar, para que su autor lo aplique.

```json
{
  "row": "Registro",
  "estado_actual": "IMPLEMENTADO_SIN_AUTENTICACION",
  "evidencia": [
    "IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/conviva-event.php (9.962 B, sha256 9ffe5fb1…): cabecera linea 6 'Phase 1 Stub'",
    "barrido auth HTTP_AUTHORIZATION|Authorization|Bearer|hash_equals|401|403|token|secret -> 1 coincidencia, linea 15, COMENTARIO '(Phase 2)'",
    "la app envia Bearer; el servidor lo ignora",
    "contraste: ara-enroll.php:30 -> 503 ENROLL_DISABLED; :38 hash_equals -> 401 BAD_SECRET"
  ],
  "severidad": "CRITICA_PARA_EL_CONTRATO",
  "razon": "permite falsificar el estado que el VPS usa para el gate por dispositivo, SIN credencial; mas grave que la exposicion del secreto, que al menos exige tener el APK"
}
```

```json
{
  "row": "Seguridad",
  "hallazgos": [
    "secretos en binarios: ape.enroll.secret en claro en classes5.dex offset 423.327; 31 de 36 ficheros = 29 de 34 binarios distintos",
    "registro vivo sin autenticacion (conviva-event.php) — severidad MAYOR que la fuga del secreto para este contrato",
    "desacople enrol/heartbeat: sin FK; model y assigned_ip no son columnas de ara_heartbeats",
    "esquema-emisor: device_capability_schema exige snapshot_id/captured_at; el emisor manda {soc, soc_8k, names}"
  ],
  "veredicto": "NO_APTO_PARA_PRODUCCION_SIN_ROTACION_Y_AUTENTICACION"
}
```

## 7. Lo NO_COMPUTADO, con su razon

| Afirmacion | Estado | Razon |
|---|---|---|
| Que el VPS desplegado ejecute el `conviva-event.php` de este repo | **NO_COMPUTADO** | Sin acceso al VPS; el repo y el servidor son artefactos distintos (ver `docs/manifestos/VPS_SWEEP_2026-11-09.md`) |
| Que el registro sin autenticacion haya sido explotado | **NO_COMPUTADO** | No hay logs del endpoint en este workspace |
| Que el emisor `QoEReporter.kt` sea el que corre en el APK v657 | **NO_COMPUTADO** | El APK es un binario; no descompile el `classes*.dex` para atar la clase Kotlin al bytecode |
| Reversibilidad del rollback (§17.13) | **NO_COMPUTADO** | El script existe (1.782 B) pero no se ha ejecutado: sin VPS |
| Que los 6 entregables ignorados lleguen a algun sitio | **NO_COMPUTADO** | `docs/audits/DELIVERY_GAP_20261111.md` mide el hueco; el canal es decision del operador |

## 8. Reglas de evidencia aplicadas

1. **Cero filas sin artefacto.** Cada fila lleva bytes y `sha256` medidos en esta corrida. Si un fichero no existiera, la fila diria `NO_EXISTE` con su bloqueo — hoy no hay ninguna.
2. **Ningun sha heredado.** El inventario de t19 no se reutilizo: se re-midio todo.
3. **`VERIFIED` no se usa como adjetivo.** El bucket dice donde esta el artefacto y con que forma; no dice que el entregable sea *correcto*. Lo que esta roto se dice en §5.
4. **Lo que no se midio, no se escribe** (§7).

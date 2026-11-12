# Matriz de diferencias — sistema anterior vs nuevo · 2026-11-12

Requisito de §16: «Incluye también un diagrama de extremo a extremo y una matriz de diferencias entre el sistema anterior y el nuevo».

**Base de comparación:** `master` @ `d2c27293` (intacto) frente a `deploy/engine-restart-20261112` @ `fccbf890`.
**Regla de esta matriz:** cada fila cita su evidencia. Las filas donde **no cambió nada** están incluidas a propósito: una matriz que solo enumera mejoras es propaganda.

---

## 1 · Lo que cambió

| # | Subcomponente | Antes (medido) | Ahora (medido) | Evidencia | Estado §17 |
|---|---|---|---|---|---|
| 1 | **Motor JIT `/opt/ape-jit/server.js`** | 415.037 B · `242c0cda8b39…` · `GET /jit/meta/<id>.json` mataba el proceso: *«TypeError: Cannot access 'CAPACITY_FPS' before initialization»*. La declaración estaba en la **línea 7993 del fichero anterior** y se usaba antes de inicializarse (TDZ) | **449.392 B** · **`290b11030f3b6bf944c14298f3fe8401c0f9bd773789e26afeca8bb9f8aeb492`** · el mismo GET responde **200 / 817 B** y el proceso sigue vivo. En el fichero nuevo la declaración está en **L6070** (la línea se movió con el parche) | `docs/audits/ENGINE_REPIN_20261112.md` · corrida `43170688357` job `4b` · `grep -n 'const CAPACITY_FPS'` → L6070 | **VERIFIED** |
| 2 | **Servicio `ape-jit.service`** | El proceso moría con una petición GET | `active` · listener `:3099` = 1 · `/health` 200 dentro y **fuera** | `MOTOR_ARRIBA estado=active listeners=1 health=200 sha=290b1103…` | **VERIFIED** |
| 3 | **Pipeline `mode=deploy`** | `4 · deploy` fallaba **siempre**: `FAIL /lists/APE_LISTA_1793589060441.m3u8: HTTP 404` → `verify.sh exit 4` → `deploy.sh exit 9` → rollback interno. El `6 · rollback` también fallaba: *«NO se revierte a ciegas: falta el stamp»* | **`success`** · paridad **33/33** · sync-smoke **11/11 OK · 0 FAIL** · rollback `skipped` porque no hacía falta · **backup con stamp `20261112T065023Z`** | corridas `43170688357` y `43173128335` | **VERIFIED** |
| 4 | **Causa raíz del fallo de deploy** | Diagnóstico previo (mío): *«faltan `SYNC_KEY` y `SYNC_TOKEN`»* | **Falso.** Los SKIP no cuentan (`record()` es lo único que entra en `results`). La causa era un **404 de fixture**: `sync-smoke.js` probaba una lista retirada, y su comentario del 2026-11-03 afirmaba *«se descubre la lista viva desde el índice del servidor»* — descubrimiento que **no existía en el código** | `_vps_stage/deploy/sync-smoke.js` (antes L216) · commit `34b78e84` | **VERIFIED** |
| 5 | **Gate 200/206/302** | **20/25** con `FIXTURE_CADUCADO`: dos listas fijadas retiradas (`APE_LISTA_1793589060441`, `APE_LISTA_1793558303852_CDN`) | **25/25 CUMPLE** sobre **5 listas vivas** descubiertas en disco | `docs/audits/GATE_MATRIX_20261112.md` | **VERIFIED** |
| 6 | **Contrato Canary→JIT** | `status` decía `NOT_DEPLOYED` y el pin apuntaba al motor que moría; el propio contrato negaba un despliegue medido | `ENGINE_DEPLOYED_VERIFIED__LOOP_NOT_DEPLOYED` · pin `290b1103…` · `bytes: 449392` · corrección con `status_correction{}` y la lectura anterior conservada | `contracts/canary_jit_contract_v1.json` | **VERIFIED** |
| 7 | **Recibo §4 (18 campos)** | **No existía emisor.** | `tools/canary/jit_receipt_emitter.js` (19.821 B · `14b78eca…`) emite triple estado requested/applied/output, `engine_sha256` obligatorio y 9 códigos de error; **validado por el juez real** | `docs/audits/JIT_RECEIPT_20261112.md` | **VERIFIED** |
| 8 | **Entregable §16 nº 11** | **No existía.** El inventario lo había **remapeado** a `ACCEPTANCE_MATRIX_20261111.json` y marcado `exists: true` porque el sustituto existía. Una matriz de veredictos no es evidencia de pruebas | `11_CANARY_TEST_EVIDENCE.json` (5.056 B · `491caf06…`) con **8 suites ejecutadas, todas exit 0**, 10 mediciones de red y **6 puntos declarados no cubiertos** | `docs/canary/deliverables/11_…json` | **VERIFIED** |
| 9 | **Entregable §16 nº 12** | `status: "NOT_DEPLOYED"` con 4 bloqueadores, **después** de que el motor estuviera desplegado | `DEPLOYED_VERIFIED` con run, stamp, paridad, smoke, sha, servicio; bloqueadores clasificados (B1 abierto · B2 resuelto · B3 sorteado no eliminado · B4 abierto no materializado); `status_history` conserva el valor anterior | `docs/canary/deliverables/12_…json` | **VERIFIED** |
| 10 | **Idempotencia (§12 / P14)** | **Afirmada**, no medida | **Medida**: segunda instalación idéntica → `Sin cambios de ficheros (33/33 filas)`; seis huellas idénticas antes/después; cero ficheros, servicios o procesos duplicados | `docs/audits/IDEMPOTENCY_20261112.md` | **VERIFIED** (cláusula 1) |
| 11 | **Superficie de lectura (§14 P14 cláusula 2)** | Sin medir | **41 URLs sondeadas · 38 válidas · 0 excepciones**; huella estable salvo `generated_at`, demostrado volátil con dos GET consecutivos | `docs/audits/ENGINE_READ_SURFACE_20261112.md` | **PARTIALLY_FUNCTIONAL** |
| 12 | **`P01` Canary SSOT** | Resumido como *«grep quality-policy = 0»* — cierto y pobre | La política **existe** (`contracts/rea/rea-processing-v1.json`, 3.261 B con `policy_id`, `revision`, `tiers`, `runtime_verification`); el motor la cita como **constante** (`:4329`) y emite **`REA_EXECUTED=0`** (`:5107`); sus `readFileSync` **no la abren**; la consume el **generador de listas** | `ENGINE_READ_SURFACE_20261112.md` §6 | **PARTIALLY_FUNCTIONAL** |
| 13 | **APK — recibo de build (§15)** | Solo manifiesto (`10_…md`) | `BUILD_RECEIPT` con **los 9 campos**: 28.010.884 B · `9872483a…` · `com.ape.crystalagent` · 657 · `3.9.9-host-plus-rea-657` · cert `9e32dc4d…` · commit `00aa8332` · **DEVICE_TEST_RECEIPT no obtenido** | `docs/audits/APK_BUILD_RECEIPT_20261112.md` | **IMPLEMENTED_NOT_DEPLOYED** |
| 14 | **Estado de verdad único (§17)** | Disperso en 9 documentos fechados | `docs/audits/STATE_OF_TRUTH_20261112.md` con las 14 secciones de §17 y §14 en los 8 estados | `STATE_OF_TRUTH_20261112.md` | **VERIFIED** |
| 15 | **Juez del contrato `artifactBytes()`** | Llamaba a `path.isAbsolute()` sin comprobar tipo. Medido: lanza `TypeError ERR_INVALID_ARG_TYPE` con objeto, `null` y `undefined`. Sin try/catch envolvente en `validateReceipt`, el `throw` **salía del juez**: un recibo con la forma que el contrato documenta (path+sha256+bytes, L61) reventaba el verificador. Un juez que excepciona se puede sortear | Acepta la forma string **y** la objeto, midiendo siempre del disco: un objeto que miente en sha/bytes se sigue aceptando **porque no se le cree**. **A/B medido:** juez anterior `LANZO ERR_INVALID_ARG_TYPE` → juez nuevo `ACCEPT/OK_APPLIED_MEASURED`. Regresión `test_judge_never_throws.js` **25/25**; batería **92/92** intacta | `tools/quality/test_canary_jit_contract.js:218` · `tools/quality/test_judge_never_throws.js` | **VERIFIED** |
| 16 | **`--audit` de §12 (`dry-run.sh`)** | No comprobaba el estado de `rsh`. Con el VPS inalcanzable, `remote` quedaba vacío, el `-z` marcaba **todos** los destinos como `NUEVO` y el script imprimía `DRY-RUN COMPLETO` con **exit 0**. Medido en A/B: **34 líneas de diff fabricadas** y exit 0 sobre un host caído | **Fail-closed**: exit **3** si el VPS no responde o devuelve 0 filas; exit **4** si algún destino queda sin estado; estado `DESCONOCIDO` separado de `NUEVO`. A/B: exit 3 y **0 líneas** inventadas | `_vps_stage/deploy/dry-run.sh` · `tools/quality/test_dryrun_fail_closed.js` **3/3** | **VERIFIED** |

---

## 2 · Lo que NO cambió (y por eso está aquí)

| # | Subcomponente | Estado hoy | Por qué no cambió |
|---|---|---|---|
| N1 | **Bucle Canary↔JIT (H-1)** | **0 filas** en `manifest.tsv` · `loop_artifact.manifest_rows = 0` | El parche `0001` existe y verifica, pero activarlo cuesta CPU (57 s por clip de 6 s, medido). Es el detonante del incidente del 2026-11-09 |
| N2 | **Dispositivo / reproductores** | `adb devices` **vacío** | Sin pantalla no hay OTT, ni TiviMate, ni ExoPlayer, ni térmica, ni GPU, ni arranque |
| N3 | **Calidad visual (VMAF/SSIM/A-B)** | **No medida** | Sin dispositivo no hay imagen. La única cifra es **0,1828 fps** del Canary frente a 25 fps de fuente |
| N4 | **`ape.enroll.secret`** | En claro en **29 de 34** binarios · sin rotar desde 2026-10-30 | Rotar es acción de servidor con corte seco sin ventana de gracia |
| N5 | **`conviva-event.php`** | **Sin autenticar** | Parche listo pero **incompleto**: falta `fastcgi_param HTTP_AUTHORIZATION` en nginx |
| N6 | **Entregables que no viajan** | 8 ficheros · **4,23 MiB** ignorados por `.gitignore:173` | Cambia lo que el repo publica; decisión del operador (D-4) |
| N7 | **`master`** | `d2c27293` — **sin tocar** | Nada se promociona sin autorización |
| N8 | **`staging` 8089** | 10/10 canales en **403** a ~10 ms | Monta solo `ape_gateway.lua`; como banco no distingue «lo rompió mi cambio» de «ya estaba roto» |
| N9 | **Timer `ape-pulse-canary`** | `inactive` | Detenido a propósito antes de arrancar el motor: guardia del incidente 2026-11-09 |
| N10 | **`upload.php`** | `auth_token` vacío | Comentario de la config viva (2026-10-26). **No auditado** en esta sesión |

---

## 3 · Diagrama extremo a extremo — con lo medido marcado

```text
[PROVEEDOR IPTV]  (autorizado por el operador)
      |
      |  HTTPS (fuera de este sistema)
      v
[LISTAS EN VPS]  /var/www/lists
      |    5 listas vivas · la mayor 1.311.381.927 B · HEAD 200 · Range 206   <- MEDIDO
      v
[NGINX 443 · rebase-only]  producción INTACTA
      |    NO transporta vídeo: \.ts|\.m4s|\.mp4 -> 404                     <- MEDIDO
      |    /jit/ -> 127.0.0.1:3099                                          <- MEDIDO
      v
[MOTOR JIT :3099]  server.js 449.392 B / 290b1103...  active
      |    /health 200 · /meta/<id>.json 200 (817 B) · 38 de 41 lecturas OK <- MEDIDO
      |    rea_executed = false  <- EL PROPIO MOTOR LO DECLARA
      |    entrega COPIA (RESOLUTION=1280x720, avc1.42c01f) en P4.5         <- medido en loopback, no en produccion
      |    en produccion NO se ha ejercitado un transcode a proposito (3 vCPU)
      v
[CANARY · receta visual]  deblock,smartblur,yuv444p,scale=3840:2160:lanczos,
      |                   noise=8,unsharp,eq,format=yuv420p
      |    0,1828 fps (30 fotogramas / 164,1 s) vs 25 fps de fuente         <- MEDIDO: 137x mas lento
      |    !!! NO EJECUTA EN EL CAMINO DE REPRODUCCION !!!
      v
[LISTA POR DISPOSITIVO]  /lists/<nombre>.m3u8   200 verificado              <- MEDIDO
      |
      v
[OTP / TIVIMATE / EXOPLAYER]  ???????????????????????????
           NO EJERCITADO. Sin dispositivo. Nada de esta caja esta medido.
```

**Lectura honesta:** la cadena está medida desde el proveedor hasta la entrega de la lista. **El último tramo —el único que el usuario ve— no está medido en absoluto.** Y la receta Canary, que es la prioridad absoluta del encargo, **no participa** en ese camino: el motor tiene su propia receta y declara `REA_EXECUTED=0`.

---

## 4 · Resumen de la matriz

| Categoría | Filas |
|---|---|
| Cambiado y medido | **16** |
| Sin cambiar (declarado) | **10** |
| De lo cambiado: VERIFIED | 14 |
| De lo cambiado: PARTIALLY_FUNCTIONAL | 2 (P01, P14 cláusula 2) |
| De lo cambiado: IMPLEMENTED_NOT_DEPLOYED | 1 (APK) |

**La diferencia más importante no es ninguna de las 14 mejoras: es que ahora está escrito qué no se midió.** El sistema anterior tampoco tenía dispositivo; la diferencia es que ahora hay 10 filas que lo dicen con nombre y fecha en vez de un informe que solo enumera logros.


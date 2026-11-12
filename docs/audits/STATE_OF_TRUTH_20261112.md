# Estado de verdad — 2026-11-12

**Rama:** `deploy/engine-restart-20261112` · base `472f7cc3` · **el conteo exacto de commits y de ficheros lo da `git`, no este documento** (`git rev-list --count 472f7cc3..HEAD` · `git diff --name-only 472f7cc3..HEAD`). Se cita la base y no la cifra porque cualquier número fijo aquí se autodata en el commit siguiente.
**`master`:** `d2c27293` — **sin tocar** desde `472f7cc3`. Nada de esto está en master.
**Este documento sustituye a los parciales de hoy** para la pregunta «¿qué es verdad ahora?». Cada afirmación cita su artefacto.

---

## 1 · Archivos modificados

| Grupo | Ficheros |
|---|---|
| Motor | `tools/lab/ape-jit/server.js` |
| Contrato y juez | `contracts/canary_jit_contract_v1.json` · `tools/quality/test_canary_jit_contract.js` |
| Deploy | `.github/workflows/deploy-vps.yml` · `_vps_stage/deploy/sync-smoke.js` · `_vps_stage/deploy/verify.sh` |
| Gates | `tools/ape-http-conformance/gate_matrix.js` |
| Nuevos | `tools/canary/jit_receipt_emitter.js` · `tools/quality/test_jit_receipt_emitter.js` |
| Matriz y recibo | `docs/audits/ACCEPTANCE_MATRIX_20261111.json` · `docs/canary/fixes/MANIFEST.json` |
| Evidencia | 8 documentos en `docs/audits/` + `docs/canary/state/rea_loop_state.json` |

## 2 · Hashes de lo que el contrato pina

| Fichero | Bytes | sha256 |
|---|---|---|
| `tools/lab/ape-jit/server.js` | 449.392 | `290b11030f3b6bf944c14298f3fe8401c0f9bd773789e26afeca8bb9f8aeb492` |
| `contracts/canary_jit_contract_v1.json` | 36.425 | `2fb58be2ebb542af4b6a04c0feb15497a31d9194537d9bbbd4c3d4b198d3064d` |
| `tools/quality/test_canary_jit_contract.js` | 71.957 | `3e070ac3bacdf4368ed1e90d68d13a3f732e84f2e2eeb7d672bfc4d5fedd8685` |

El `sha256` del motor **coincide con el pin del contrato y con el fichero instalado en el VPS**, comprobado en origen y destino por el job `4b` antes de reiniciar.

## 3 · Servicios y endpoints

**Servicio:** `ape-jit.service` = `active` · listener `:3099` = 1 · `/health` = 200.
**`ape-pulse-canary.timer`** = `inactive` — detenido a propósito antes de arrancar el motor (guardia del incidente 2026-11-09). Reversión: `sudo systemctl start ape-pulse-canary.timer`.

**Endpoints verificados desde internet el 2026-11-12:**

| Endpoint | Resultado |
|---|---|
| `GET /jit/health` | 200 · `{"ok":true,...}` |
| `GET /jit/meta/1.json` | **200** — era la petición que mataba el proceso |
| `HEAD /lists/APE_LISTA_1794100720046.m3u8` | 200 · `content-length: 1311381927` |
| `HEAD /lists/APE_LISTA_1793787155230.m3u8` | 200 |
| `GET /lists/...` con `Range: bytes=0-1023` | **206** · `content-range: bytes 0-1023/1311381927` |

**Reutilizados, no creados:** ninguna ruta nueva. Se usó el tooling que ya existía (`ape-nginx-206-302`, `deploy-vps`, `verify.sh`, `sync-smoke.js`).

## 4 · Pruebas y resultados

| Prueba | Resultado | Artefacto |
|---|---|---|
| Contrato Canary→JIT | **92/92 PASS, exit 0** | `tools/quality/test_canary_jit_contract.js` |
| Bucle REA §13 | **HEALTHY, exit 0** (6 gates) | `tools/canary/rea_loop.js` |
| Gate 200/206/302 | **25/25 CUMPLE** sobre 5 listas vivas | `docs/audits/GATE_MATRIX_20261112.md` |
| Deploy completo | **success** · paridad 33/33 · smoke 11/11 | corrida `43170688357` |
| DoS `/meta` cerrado | loopback **y** producción (200 externo) | `docs/audits/ENGINE_REPIN_20261112.md` |
| §4 recibos con 18 campos | **ACCEPT** por el juez real | `docs/audits/JIT_RECEIPT_20261112.md` |

## 5 · Calidad visual observada

**No medida.** Sin dispositivo no hay imagen. Lo único medido relacionado es que el motor, cuando se le pidió P4.5, **entregó una copia** (`RESOLUTION=1280x720`, `CODECS="avc1.42c01f"`) y su propio recibo se declaró `NOT_APPLIED` — el motor no anunció como aplicado lo que no ejecutó, que es lo correcto aunque el resultado sea que no hay mejora.

## 6 · Rendimiento y continuidad

- **Canary**: **0,1828 fps** (30 fotogramas / 164,1 s) contra 25 fps de fuente → ≈137× más lento. `FAILED` medido, no bloqueado.
- **JIT**: el motor arranca, sirve `/health` y `/meta`, y no se ha ejercitado un transcode en producción a propósito (consumiría los 3 vCPU).
- Continuidad: sin medición de cortes. No hay prueba de duración, canales, dispositivo ni red que lo sostenga.

## 7 · Dispositivos comprobados

**Ninguno.** `adb devices` devuelve lista vacía, comprobado en esta ronda.

## 8 · Estado de los reproductores

**OTT Navigator, TiviMate, ExoPlayer: no ejercitados.** No hay dispositivo ni player instrumentado. Cualquier afirmación sobre ellos sería inventada.

## 9 · Listas compatibles

**5 listas vivas, 5 configuraciones cada una, 25/25.** Contenido real verificado: la lista grande pesa **1.311.381.927 B** y honra `Range` con 206. Las 2 listas que el gate probaba antes (`APE_LISTA_1793589060441`, `APE_LISTA_1793558303852_CDN`) **están retiradas**: su 404 era un fixture caducado, no una caída.

## 10 · Límites conocidos

1. **`ape.enroll.secret`** en claro en **29 de 34 binarios distintos**, sin rotar desde 2026-10-30. El daño está acotado a WireGuard, no a vídeo.
2. **`conviva-event.php` sin autenticar**: su única traza de auth es un comentario `(Phase 2)`. Permite falsificar el estado que el VPS usa para el gate por dispositivo, **sin credencial**.
3. **`upload.php sin auth`** (`auth_token` vacío) escribe en `/var/www/lists` — comentario de la config viva, fechado 2026-10-26. **No auditado**.
4. **H-1**: el script del bucle Canary↔JIT sigue con **0 filas** en el manifiesto (`loop_artifact.manifest_rows = 0`). El motor está desplegado; **el bucle no**.
5. **Los 6 entregables de `docs/canary/deliverables/` no viajan**: `.gitignore:173`. Incluido el recibo de despliegue actualizado.
6. **`tools exit contract` en rojo** por 3 ficheros ajenos al trabajo de hoy (`probe_panel_selects.js`, `verify_gestor_final.js`, `verify_jit_browser.js`).
7. **El juez puede excepcionar**: `artifactBytes()` (`test_canary_jit_contract.js:218`) lanza `TypeError` ante la forma de `applied.evidence.artifact` que el propio esquema documenta. Reportado por `t38`, **no parcheado**.
8. **`staging` (8089) no es espejo de producción**: 10/10 canales en 403 a ~10 ms frente a 8/10 en 200 a ~650 ms. Como banco de pruebas no distingue «lo rompió mi cambio» de «ya estaba roto».
9. **Dos artefactos Android con propósito parecido y ruta distinta.** El paquete existente integra un módulo `:shim` (`IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/app/build.gradle.kts:113`, `implementation(project(":shim"))`), que es el camino que §6 prefiere. Aparte existe `ottshim/`, proyecto Gradle propio (`settings.gradle.kts` → `include(":app")`, sin `:shim`) que produce `dev.venice.ottshim` v0.1 · `versionCode 1` · `minSdk 26`, **no compilado por CI y con 0 filas en el manifiesto**, versionado por el operador en `0b308032` (2026-11-06). **No está establecido si `ottshim/app` y el `:shim` integrado son el mismo código**, y no se afirma. Queda como ambigüedad de §15/§16: cuál de los dos artefactos es «la APK» que se entrega.

## 11 · Pendientes de autorización

| # | Acción | Por qué no se hizo |
|---|---|---|
| D-1 | Rotar `ape.enroll.secret` | Acción de servidor; corte seco sin ventana de gracia |
| D-2b | Autenticar `conviva-event.php` | Parche listo; **incompleto** sin `fastcgi_param HTTP_AUTHORIZATION` en nginx |
| H-1 | Añadir la fila del bucle al manifiesto | Parche `0001` listo y verificado; activarlo cuesta CPU (57 s por clip de 6 s, medido) |
| D-4 | Sacar los entregables del `.gitignore` | 4,03 MiB; cambia lo que el repo publica |
| D-6 | Nada que parchear | El gate ya da 25/25; los cambios de nginx que pedía el informe del 2026-11-02 **no hacen falta** |
| D-7 | Commit/push a `master` | `master` sigue en `d2c27293` |
| — | Arrancar `ape-pulse-canary.timer` | Detenido a propósito; decisión del operador |
| — | `systemctl enable` en el tooling | B4 abierto, no materializado (el servicio ya está `enabled`) |

## 12 · Procedimiento de reversión

```
# 1. volver los ficheros al estado previo al deploy del 2026-11-12
bash _vps_stage/deploy/rollback.sh 20261112T065023Z --yes

# 2. reversion del motor aislada (si solo se quiere el binario anterior)
#    el anterior era 415.037 B / 242c0cda8b392b261ddecac39ec0e7a6684b9013cedacdb1de3034840ed436f1

# 3. reversion del repositorio
git switch audit/rea-alignment-20261108   # vuelve a 472f7cc3
git branch -D fix/engine-tdz-dos-20261112 deploy/engine-restart-20261112

# 4. rearme del timer del canary (solo si se decide)
sudo systemctl start ape-pulse-canary.timer
```

## 13 · §14 en los ocho estados

| Estado | Filas |
|---|---|
| **VERIFIED** | **P09** (listas) · **P16** (VPS) |
| IMPLEMENTED_NOT_DEPLOYED | P05, P07, P10, P11, P12 |
| DEPLOYED_NOT_DEVICE_TESTED | — |
| TESTED_IN_DEVICE | — |
| PARTIALLY_FUNCTIONAL | P01, P13, P14, P15 |
| BLOCKED | P02, P04, P06, P08 |
| FAILED | P03 (0,1828 fps), P17 (seguridad) |
| ROLLED_BACK | — |

**2 de 17 VERIFIED.** Los 15 restantes dependen, todos, de un dispositivo conectado o de una decisión tuya. Ninguno espera más código mío.

## 14 · Lo que este documento NO dice

No dice que la imagen del Canary se haya reproducido. No dice que OTT o TiviMate reproduzcan. No dice que el sistema esté completo. Dice **exactamente** qué está medido hoy y qué no, y por qué.

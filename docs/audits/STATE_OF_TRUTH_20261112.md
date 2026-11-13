# Estado de verdad — 2026-11-12

**Rama:** `deploy/engine-restart-20261112` · base `472f7cc3` · **el conteo exacto de commits y de ficheros lo da `git`, no este documento** (`git rev-list --count 472f7cc3..HEAD` · `git diff --name-only 472f7cc3..HEAD`). Se cita la base y no la cifra porque cualquier número fijo aquí se autodata en el commit siguiente.
**`master`:** `d2c27293` — **sin tocar** desde `472f7cc3`. Nada de esto está en master.
**Este documento sustituye a los parciales de hoy** para la pregunta «¿qué es verdad ahora?». Cada afirmación cita su artefacto.

**Última puesta al día: 2026-11-12, tras la ronda 23 del bucle REA.** Cubre el motor desplegado y verificado, el pipeline en verde con el conjunto completo de 11 comprobaciones, el juez del contrato sin excepciones, el reconciliador con sus tres modos (`--audit` fail-closed, `--plan` con riesgos y rollback, `--apply` con `--yes`), la comprobación de que **el proceso vivo ejecuta el fichero del disco**, y las cinco lua vivas que el manifiesto no gestiona.

**Correcciones que este documento incorpora, y que antes se leían mal:**
- el «smoke 11/11» era del job de **verify**; el de **deploy** corría **5** hasta el 2026-11-12 (`SYNC_SMOKE_CLOSED_20261112.md`);
- el juez del contrato **ya no excepciona** (`AUDIT_PERMISOS_20261112.md` y la fila 15 de la matriz);
- «18 lua sin manifiesto» era falso: son **18 vivas, 8 no gestionadas, 5 usadas** (`UNMANAGED_LUA_20261112.md`);
- la columna «Tamaño en el VPS» de un recibo anterior tenía **números del repositorio** (`AUDIT_READONLY_20261112.md`).

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
| Deploy completo | **success** · paridad 33/33 · smoke **11/11 en el job de verify pero solo 5/5 en el de deploy** hasta el 2026-11-12; **hoy ambos 11/11** tras cablear `ARA_SYNC_VERIFY_KEY` | corridas `43170688357` y `43176002787` · ver `SYNC_SMOKE_CLOSED_20261112.md` |
| DoS `/meta` cerrado | loopback **y** producción (200 externo) | `docs/audits/ENGINE_REPIN_20261112.md` |
| §4 recibos con 18 campos | **ACCEPT** por el juez real | `docs/audits/JIT_RECEIPT_20261112.md` |
| Juez del contrato: no excepciona | **25/25 casos sin excepción** · A/B: el juez anterior lanzaba `ERR_INVALID_ARG_TYPE` con la forma de `artifact` que el propio contrato documenta; el actual devuelve `ACCEPT/OK_APPLIED_MEASURED` | `tools/quality/test_judge_never_throws.js` · `docs/audits/DIFF_MATRIX_OLD_VS_NEW_20261112.md` fila 15 |
| `--audit` fail-closed | **3/3** · A/B con VPS caído: el anterior devolvía **exit 0 con 34 líneas de diff fabricadas**; el actual **exit 3 con 0 líneas** | `tools/quality/test_dryrun_fail_closed.js` · `docs/audits/AUDIT_READONLY_20261112.md` |
| `--plan` (diff + riesgos + rollback) | **success en CI** · riesgos por destino y comando de rollback, sin escribir nada | corrida `43232551594` · `docs/audits/AUDIT_READONLY_20261112.md` |
| **El proceso vivo ejecuta el fichero del disco** | **OK** · `MainPID=2220731`, mtime del fichero `1794468917`, arranque del proceso `1794468918` → el proceso arrancó **después** del último cambio | corrida `43233620454`, job 2 · `contracts/canary_vps_reconciler_contract.json` |
| Auditoría de producción completa | **33/33 IGUAL · 0 cambios · 15 avisos de dueño** | corridas `43182598311` y `43233620454` |

## 5 · Calidad visual observada

**Medida en entorno controlado, NO en el panel.** La cadena Canary se reprodujo exacta (1080p→4K, 3 s, ffmpeg 8.0.1) y se comparó contra un control neutro (solo lanczos, mismo encoder). Ver `CANARY_AB_IMAGE_20261112.md`.

| | A (Canary) | B (lanczos) |
|---|---|---|
| SSIM ida y vuelta vs fuente | 0,9169 | 0,9598 |
| Nitidez (laplaciano) | **6,978** | 1,175 |

La cadena **realza 4,39×** sobre la fuente (1,588) pero **baja la fidelidad**: el realce es `unsharp`+`noise`, no recuperación de detalle. Ablación: quitar el **grano ahorra el 29 % del tiempo** y **sube** el SSIM, pero desploma la nitidez medida un 61 % — lo que demuestra que **la métrica mide grano además de detalle**.

**Nada de esto dice cómo se ve en un televisor.** Cero píxeles vistos por un panel.

Y el motor, cuando se le pidió P4.5, **entregó una copia** (`RESOLUTION=1280x720`, `CODECS="avc1.42c01f"`) declarándose `NOT_APPLIED` — correcto: no anunció como aplicado lo que no ejecutó.

## 6 · Rendimiento y continuidad

- **Canary**: **0,1828 fps** (30 fotogramas / 164,1 s) contra 25 fps de fuente → ≈137× más lento. `FAILED` medido, no bloqueado.
- **Cadena Canary completa en esta máquina**: **131 s para 3 s** = 0,687 fps = **43,7× más lento** que la fuente de 30 fps. Encoder `veryfast`: 462 s (3,5×). El 4:4:4 intermedio no cuesta nada (130 vs 131 s).
- **JIT**: el motor arranca, sirve `/health` y `/meta`, y no se ha ejercitado un transcode en producción a propósito (consumiría los 3 vCPU).
- Continuidad: **medida en el ONN con OTT Navigator** — 30+ s de reproducción real sin cambio de códec ni de resolución (6/6 y 4/4 muestras). **Frames perdidos: no computado**, el códec no los expone (`frame_rate:-1`).

## 7 · Dispositivos comprobados

**Uno: el ONN 4K.** Conectado por ADB (`192.168.1.3:5555` / `:34813`), medido en solo lectura. Ver `DEVICE_RECEIPT_ONN4K_20261112.md`.

```
onn. 4K Streaming Box · Amlogic s4 · Android 14 (SDK 34) · 4 cores · 1,88 GiB RAM
Panel SAMSUNG (2020) por HDMI · 3840x2160
```

| Dato | Valor medido |
|---|---|
| HDR del panel | **`[2,3,4]` = HDR10 + HLG + HDR10+ · 1000 nits · SIN Dolby Vision** |
| Conversión HDR | **PASSTHROUGH** (no convierte SDR a HDR — confirma la corrección del 2026-06-17) |
| Decoders HW | `c2.amlogic.avc` / `hevc` / `av1`, los tres con `.secure` |
| Cadencias | 59,94 · 60 · 50 · 29,97 · 30 · 25 · 23,976 · 24 |
| **Térmica** | `soc_thermal` **63,7 °C** estable, umbral de throttling **65,0 °C** → **1,3 °C de margen** |
| Resolución lógica | **override a 1920x1080** sobre panel 4K (`wm size`) |

## 8 · Estado de los reproductores

**OTT Navigator 1.7.3.3 — reproducido y medido.** Ver `PLAYBACK_ONN4K_OTT_20261112.md` y `CHAIN_PULSE_ONN4K_20261112.md`.

```
mediametrics_codec_reported:
  codec: c2.amlogic.avc.decoder   mime: video/avc
  width: 1920  height: 1080  profile: 2  level: 32768  secure: -1 (sin DRM)
audio: c2.android.aac.decoder (SOFTWARE) · 2 canales · 44.100 Hz
```

El flujo **sí pasa por el sistema**: el aparato pide `GET /pulse/<id>.m3u8?u=<proveedor>` cada **~20 s**, y se observó un cambio de canal (548062 → 548063 a las 02:55:46).

**TiviMate: no probado** (no está instalado). **ExoPlayer: no ejercitado.**

## 9 · Listas compatibles

**5 listas vivas, 5 configuraciones cada una, 25/25.** La lista grande pesa **1.311.381.927 B** y honra `Range` con 206. Las 2 que el gate probaba antes están **retiradas**: su 404 era un fixture caducado, no una caída.

**Pero las declaraciones del catálogo no coinciden con lo servido.** Medido con `tools/quality/audit_declared_vs_real.ps1` sobre la lista viva:

| Declaración | Contrastada con | Resultado |
|---|---|---|
| `ape-profile` | resolución real del segmento | **16 de 21 sobre-declaran (76 %)** |
| `ape-codec-family` | códec real del segmento | **7 de 7 declaran `hevc`, sirven `h264`** |
| `#EXTVLCOPT` (filtros VLC) | lo que el player aplica | **no viaja** a OTT Navigator |

Y la causa está en el código: **`profileForChannel(name, group)`** resuelve el perfil del **nombre**, sin mirar el flujo. Ver `PROFILE_FROM_NAME_NOT_MEASURED_20261113.md` y `CODEC_FAMILY_DECLARED_VS_SERVED_20261113.md`.

## 10 · Límites conocidos

1. **`ape.enroll.secret`** en claro en **29 de 34 binarios distintos**, sin rotar desde 2026-10-30. El daño está acotado a WireGuard, no a vídeo.
2. **`conviva-event.php` sin autenticar**: su única traza de auth es un comentario `(Phase 2)`. Permite falsificar el estado que el VPS usa para el gate por dispositivo, **sin credencial**.
3. **`upload.php sin auth`** (`auth_token` vacío) escribe en `/var/www/lists` — comentario de la config viva, fechado 2026-10-26. **No auditado**.
4. **H-1**: el script del bucle Canary↔JIT sigue con **0 filas** en el manifiesto (`loop_artifact.manifest_rows = 0`). El motor está desplegado; **el bucle no**.
5. **Los 6 entregables de `docs/canary/deliverables/` no viajan**: `.gitignore:173`. Incluido el recibo de despliegue actualizado.
6. **`tools exit contract` en rojo** por 3 ficheros ajenos al trabajo de hoy (`probe_panel_selects.js`, `verify_gestor_final.js`, `verify_jit_browser.js`).
7. **El juez ya no excepciona (ARREGLADO 2026-11-12).** `artifactBytes()` (`test_canary_jit_contract.js:218`) llamaba a `path.isAbsolute()` sin comprobar tipo; medido, lanza `TypeError` (`ERR_INVALID_ARG_TYPE`) con objeto, `null` y `undefined`. Como `validateReceipt` no tiene try/catch envolvente, el `throw` **salía del juez**: un recibo con la forma que el **propio contrato documenta** (`artifact` = path+sha256+bytes, contrato L61) reventaba el verificador en vez de ser juzgado. A/B medido: el juez anterior lanza `ERR_INVALID_ARG_TYPE`; el parcheado devuelve `ACCEPT/OK_APPLIED_MEASURED`. Regresión: `tools/quality/test_judge_never_throws.js`, **25/25**. Batería intacta en **92/92**.
8. **`staging` (8089) no es espejo de producción**: 10/10 canales en 403 a ~10 ms frente a 8/10 en 200 a ~650 ms. Como banco de pruebas no distingue «lo rompió mi cambio» de «ya estaba roto».
9. **Dos artefactos Android con propósito parecido y ruta distinta.** El paquete existente integra un módulo `:shim` (`IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/app/build.gradle.kts:113`, `implementation(project(":shim"))`), que es el camino que §6 prefiere. Aparte existe `ottshim/`, proyecto Gradle propio (`settings.gradle.kts` → `include(":app")`, sin `:shim`) que produce `dev.venice.ottshim` v0.1 · `versionCode 1` · `minSdk 26`, **no compilado por CI y con 0 filas en el manifiesto**, versionado por el operador en `0b308032` (2026-11-06). **No está establecido si `ottshim/app` y el `:shim` integrado son el mismo código**, y no se afirma. Queda como ambigüedad de §15/§16: cuál de los dos artefactos es «la APK» que se entrega.
10. **5 lua vivas en producción no las gestiona el manifiesto** (medido con hash en `docs/audits/UNMANAGED_LUA_20261112.md`): `ape_attr` (31.210 B), `ape_lab_upload` (4.723), `floor_lock_filter` (2.169), y —las graves— `ape_lab_bridge` (7.723) y `ape_lastgood` (5.083), que se cargan por `require()` desde `ape_gateway.lua:35` y `:33`. Un VPS reconstruido desde el manifiesto **arrancaría sin ellas y el gateway de streams fallaría**. Las otras 3 no gestionadas (`ape_profile_resolver`, `bw_adaptive_floor`, `sentinel_auth_guard`) **no las usa producción** y el manifiesto hace bien en excluirlas. Parche listo: `docs/canary/fixes/0006-manifest-lua-usadas.patch` (**no aplicado**).
11. **El instalador no reaplica modo/dueño cuando el contenido coincide.** `deploy.sh:80` sí usa `install -m -o -g`, pero **solo se ejecuta si el hash cambia**; si coincide informa `Sin cambios de ficheros (33/33 filas)` y no toca el fichero. Resultado medido: **15 destinos con contenido idéntico y dueño distinto del declarado** (corrida `43182598311`). El modo **sí** coincide (`644` en los 18 lua). Sin impacto funcional medido, porque 644 es legible por los workers. **No medido: cuál es el dueño real** — GitHub lo enmascara en los logs (`644:***:***`).

## 11 · Pendientes de autorización

| # | Acción | Por qué no se hizo |
|---|---|---|
| D-1 | Rotar `ape.enroll.secret` | Acción de servidor; corte seco sin ventana de gracia |
| D-2b | Autenticar `conviva-event.php` | Parche listo; **incompleto** sin `fastcgi_param HTTP_AUTHORIZATION` en nginx |
| H-1 | Añadir la fila del bucle al manifiesto | Parche `0001` listo y verificado; activarlo cuesta CPU (57 s por clip de 6 s, medido) |
| — | **Añadir las 5 lua usadas al manifiesto** | Parche `0006` listo, `git apply --check` 0, lleva el manifiesto de 33 a 38 filas. **Riesgo bajo**: el contenido es byte-idéntico al vivo y solo fija modo/dueño como sus hermanas |
| — | **Modo/dueño: ¿manda el manifiesto o producción?** | O `deploy.sh` reaplica `-o`/`-g` en cada pasada, o el manifiesto declara el dueño real. Ambas necesitan el dueño real, hoy enmascarado en los logs |
| D-4 | Sacar los entregables del `.gitignore` | 4,03 MiB; cambia lo que el repo publica. **Ahora afecta a 8 ficheros**, incluidos `11_` y `12_` que hoy son veraces |
| D-6 | Nada que parchear | El gate ya da 25/25; los cambios de nginx que pedía el informe del 2026-11-02 **no hacen falta** |
| D-7 | Commit/push a `master` | `master` sigue en `d2c27293` |
| — | Arrancar `ape-pulse-canary.timer` | Detenido a propósito; decisión del operador |
| — | `systemctl enable` en el tooling | B4 abierto, no materializado (el servicio ya está `enabled`) |
| **G-1** | **El perfil sale del NOMBRE, no de la medición** | `profileForChannel(name, group)` en `tools/pulse/ape-pulse-wrap.js:72-87`. Medido: **16 de 21** canales que declaran resolución la sobre-declaran. Arreglarlo exige tocar el generador: medir antes de declarar, declarar la etiqueta como etiqueta, o dejar de escalar por token premium |
| **G-2** | **`ape-codec-family` es una preferencia, no un hecho** | `m3u8-typed-arrays-ultimate.js:8245` cae en `PROFILES[perfil].codec` y luego en `'HEVC'`. Medido: **7 de 7** declaran hevc y sirven h264. La decisión es deliberada (MAX IMAGE FIRST, comentario L8240-8244), pero choca con §11 |
| — | **TiviMate** | No instalado en el aparato. Probarlo exige instalarlo: decisión del operador |
| — | **Censo declarado-vs-real de la lista entera** | `tools/quality/audit_declared_vs_real.ps1` ya lo hace por muestras. Sobre 1,3 GB son horas de `ffprobe`; hay que decidir si se corre, se paraleliza y con qué prioridad (los P0/P1 primero) |

## 12 · Procedimiento de reversión

**Antes de revertir, se puede consultar el plan sin tocar nada:**

```
bash _vps_stage/deploy/dry-run.sh --plan     # diff + riesgos por destino + rollback
```

```
# 1. volver los ficheros al estado previo a un deploy concreto
bash _vps_stage/deploy/rollback.sh <stamp> --yes
#    stamps medidos: 20261112T065023Z (primera corrida verde) y el de la segunda
#    el stamp se imprime al inicio de cada deploy y queda en deploy-stamp.txt

# 2. reversion del motor aislada (si solo se quiere el binario anterior)
#    el anterior era 415.037 B / 242c0cda8b392b261ddecac39ec0e7a6684b9013cedacdb1de3034840ed436f1
#    OJO: tras restaurar el fichero hace falta `systemctl restart ape-jit`; si no,
#    el proceso sigue ejecutando el codigo viejo (lo mide la seccion SERVICIO VIVO)

# 3. reversion del repositorio
git switch audit/rea-alignment-20261108   # vuelve a 472f7cc3
git branch -D fix/engine-tdz-dos-20261112 deploy/engine-restart-20261112

# 4. rearme del timer del canary (solo si se decide)
sudo systemctl start ape-pulse-canary.timer
```

**Lo que el rollback NO hace:** si el deploy falla **antes** del backup, `rollback.sh` se niega a actuar a ciegas y no modifica nada — eso es correcto, no un fallo. Y restaura **ficheros**, no comprueba que el vídeo siga saliendo.

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


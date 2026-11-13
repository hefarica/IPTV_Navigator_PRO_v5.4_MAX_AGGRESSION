# INFORME FINAL — Canary ↔ JIT (estructura de la sección 17)

**Fecha:** 2026-11-11 · **Autor:** gate-runner (t16) · **Base git:** `472f7cc330e52dc2f7e3d16f6a451fd0b461949e` (`472f7cc3`), rama `audit/rea-alignment-20261108`.
**Workdir:** `C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION`
**Matriz que acompaña a este informe:** `docs/audits/ACCEPTANCE_MATRIX_20261111.json` (17 filas).

## 0 · Aviso de método, antes de cualquier cifra

- **No desplegué, no hice push, no toqué el VPS, no tuve SSH ni device.** Todo lo que dependa del estado vivo del servidor es `NO_COMPUTADO` y va marcado así.
- **No modifiqué una sola línea de código ni de configuración.** No arreglé ningún gate. Este informe **no autoriza nada**.
- Los dos únicos ficheros escritos son el JSON de la matriz y este Markdown.
- **Cada cifra de este informe lleva su fuente al lado.** Si una cifra no tiene fuente, no está: no hay números huérfanos.
- **Aviso de reconstrucción (§16):** el texto literal de la sección 16 del prompt no está en mi contexto. El inventario de 14 entregables se reconstruye a partir de los artefactos que existen en disco y de los que el propio equipo declaró. Se marca como reconstruido y cada fila lleva su ruta y su sha256 medidos hoy, de modo que cualquiera puede verificar que el inventario no es una lista inventada.

---

## 17.1 · Archivos modificados

**Ninguno.** Cero ficheros *tracked* modificados, cero commits, cero push, cero deploy.

```
git diff --name-only   ->  (sin salida = árbol tracked intacto)
git log -1             ->  472f7cc330e52dc2f7e3d16f6a451fd0b461949e
git stash list         ->  (vacío)
```

Lo que existe es **material nuevo sin versionar** (`git status --porcelain` → rutas `??`): 11 ficheros del equipo + los 2 de esta tarea = **13 untracked**. La decisión de commitear es del operador y este informe no la toma.

---

## 17.2 · Hashes (medidos hoy, `Get-FileHash`/SHA-256)

### Entregables del paquete recibido (`scratch/canary_jit_20261111/`)

| Entregable | Bytes | sha256 |
|---|---:|---|
| `APE_CANARY_JIT_INTEGRACION_20261111.zip` | 9.155 | `9a13ec2c266f662ef8ded99520b691d611bda8f99695a0aed387c56991136fe1` |
| `Manual_REA_Canary_JIT_Actualizado_20261111.pdf` | 153.775 | `7149a4397a95c4159508549729f5bd07a55db9bc7dd3afe46da4cf3b6476f3ca` |
| `Arquitectura_APE_Canary_JIT_Actualizada_20261111.pdf` | 165.330 | `e0539e506ffaec0aeac78ba6d7f49f8f5bdcfc060f0e834da9d8f7bdd7ed75cc` |
| `APE_REA_653_OTT_DASH_2K_4K_6K_TEST_20261108.apk` | 24.362.980 | `4b0c4ef397a6ea7066b5f51951d4fefb94820b0e94aeaf07f3f879ca6674d341` |

### Artefactos producidos en el repo

| Fichero | Bytes | sha256 |
|---|---:|---|
| `contracts/canary_jit_contract_v1.json` | 35.791 | `488b87609a02c69d0ecffba17ea532fc8142964f3fdeb98e4cd8cc70e1395514` |
| `tools/quality/test_canary_jit_contract.js` | 71.957 | `0869149200cc0e7290e7de112fd0aa81914726435fd67989b34f29628169680b` |
| `docs/manifestos/CANARY_JIT_CONTRACT_20261111.md` | 32.264 | `96dd7f5714b315d00bc59c1914451e11dee445d14bfd38cfec76ee6689f443eb` |
| `docs/audits/CANARY_TRUTH_20261111.md` | 47.639 | `33c214ef2360039f6da675344f1aac4b96e96b645eba46a79510e5f5abd98da6` |
| `docs/audits/JIT_TRUTH_20261111.md` | 52.730 | `e9e864b211f4d8e6fb19ecb3841f653b61c6257458003f12c7834aa0fbf8b1f4` |
| `docs/audits/JIT_HTTP_PROBES_20261111.md` | 26.540 | `f1c2510582a9f1547ba785da3fdfecf475c39a061ce069524ee1ca85e7210c13` |
| `docs/audits/ADVERSARIAL_CANARY_JIT_20261111.md` | 31.615 | `8a62e7203a558c86e43996475db4ff117ba84eb6a38d4b64ae6d1020a287faae` |
| `docs/audits/CONTRACT_REVIEW_ROUND3_20261111.md` | 13.898 | `1affc1728b67ecb2fb22522485107307e1398a33209b65f08bab357cf0dcfe59` |
| `docs/audits/VEREDICTO_CANARY_JIT_20261111.md` | 44.013 | `3b9f155041a5c03558dc078421e5c0d0285e62173f883c488275d207b520c0b0` |

### Herramientas del gate HTTP (preexistentes, reutilizadas, no modificadas)

| Fichero | Bytes | sha256 |
|---|---:|---|
| `tools/ape-http-conformance/gate_matrix.js` | 10.492 | `7639eb706ab16a54d5dab03347fb87cb04be49a701ecd53fc3db56c9031105ff` |
| `tools/ape-http-conformance/http_matrix.js` | 4.235 | `1eb25d118b768e0e9fc6b814a49989271867a051ad2ed26d85df4ca2642ba534` |
| `tools/ape-http-conformance/make_302_patch.js` | 2.318 | `ec424269353f413d46b5ff0feecc35d4c4ad6d24000b3341d0a20928c39e8651` |
| `tools/ape-http-conformance/verify_http_matrix.js` | 13.667 | `2adada3e0dde98b62ac6ea1e0f499cabdad9fa968f75df1c7e24761a4983440f` |
| `.github/workflows/ape-206-local-proof.yml` | 11.787 | `3d71f15d4d85fce5c07f730993a9119debf4ded93daba9b60777411c496433e8` |

### Motores JIT: tres artefactos, tres identidades

| Etiqueta | Fichero | Bytes | Líneas | sha256 | ¿Desplegable? |
|---|---|---:|---:|---|---|
| **A** | `tools/lab/ape-jit/server.js` | 447.943 | 9.212 | `28352c508285b1eedfc889e5df40855e6e2c71207d7c806288ac8457de36ff67` | **Sí por contrato**: `_vps_stage/deploy/manifest.tsv:59` lo mapea a `/opt/ape-jit/server.js` |
| **B** | `IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js` | 45.535 | 959 | `8405f78412dc2a984f690b7270e891d050740d88358f10ca5818f905151fbae0` | **No**: 0 filas en el manifiesto |
| **C** | el que corrió el 2026-11-09 | 415.037 (declarado) | — | **NO DISPONIBLE** | **NOT_TESTED**: no existe fichero con esos bytes en el workspace |

> **Corrección que este informe no puede omitir.** `JIT_TRUTH_20261111.md:111` titula su tabla de rutas «motor desplegado (959 líneas)». La identificación válida es la del manifiesto y la fijó t3/t6: el artefacto con fila de deploy es **A** (9.212 líneas). Por tanto **la tabla de rutas de `JIT_TRUTH` §2 describe B**, no el desplegable. Se cita como tal y no se propaga la etiqueta.
>
> Y «desplegable por contrato» **no** significa «corriendo en el VPS»: eso es `NO_COMPUTADO` sin SSH. C (415.037 B) es el único que hay evidencia de haber corrido, y no tiene hash.

---

## 17.3 · Endpoints creados o reutilizados

**Creados: ninguno.** Todo lo listado es reutilizado o ya existente; esta tarea no añadió ni una ruta.

### Motor JIT — lo verificado sobre el artefacto **A** (el que el manifiesto mapea)

| Ruta | Códigos | Evidencia |
|---|---|---|
| `/health` | 200 | medido por t6 en loopback:3199: `{"ok":true,"active":null,"pid":null,"uptime_s":0}` |
| `/catalog.json` | 200 | medido por t6: `{"service":"ape-jit-cmaf","count":2,...}` |
| `/meta/<id>.json` | **mata el proceso** con id válido; 404 con id inválido | t6, ver §17.11 y matriz P17 |
| `/go/<id>` | 302 → `/jit/live/<id>/...` | `JIT_HTTP_PROBES_20261111.md:80-88` (5/5 variantes) |
| `/live/<id>/[sdr720/\|sdr/](master.m3u8\|media_N.m3u8\|manifest.mpd\|init-\*\|chunk-\*)` | 200/206/304/400/404/503 | `JIT_HTTP_PROBES_20261111.md:99-147`; rutas sdr/sdr720 en `tools/lab/ape-jit/server.js:9010,9036,9040-9047` |
| `/jit/signal` | POST/GET | **existe en A**: `tools/lab/ape-jit/server.js:8603,8764` (citado en `CANARY_TRUTH` A24). Es el endpoint del bucle: el JIT devuelve la cadena y el canary la ejecuta (`:7913`) |

### Motor JIT — rutas que existen **solo** en el artefacto B / del LAB

`/playlist.m3u8`, `/capabilities.json`, `/crystal.json`, `/source.json`, `/resolve`, `/image/*`. Su tabla exacta (con línea y efecto) está en `JIT_TRUTH_20261111.md:116-133`, **que describe B**. `/resolve`, `/jit/*`, `/image/*` **no existen** en B (`:131-133`) — y `/jit/signal` sí existe en A: la diferencia es justamente cuál de los dos se despliega.

### Capa nginx (producción, no tocada)

| Endpoint | Qué sirve | Evidencia |
|---|---|---|
| `/lists/` | listas M3U8 estáticas | `tools/ape-http-conformance/gate_matrix.js:33` (`BASE='/lists/'`); medición en `GATE_MATRIX_MEASURED.md:1-4` |
| `location ^~ /jit/` → `proxy_pass http://127.0.0.1:3099/` | proxy al motor; la barra final retira el prefijo `/jit` | `vps/nginx/snippets/ape-jit.conf:40-41` |

---

## 17.4 · Servicios afectados

**Afectados por el diseño de la integración (ninguno modificado por esta tarea):**

| Servicio | Efecto | Evidencia |
|---|---|---|
| `nginx` (VPS) | los 3 cambios de 206/302 son líneas en `/etc/nginx/sites-enabled/default`; **ninguno aplicado** | `GATE_206_MUTUAL_EXCLUSION.md:86-87`; `GATE_MATRIX_MEASURED.md:72` |
| `ape-jit` (systemd) | instalar `server.js` **no** reinicia el proceso: `deploy.sh` no lo hace | `_vps_stage/deploy/manifest.tsv:59` (nota literal `[OJO: necesita systemctl restart ape-jit, deploy.sh NO lo hace]`) |
| `ape-pulse` (worker del canary) | compite por el mismo `ffmpeg` y la misma conexión al proveedor; de ahí `jit_busy()` | `vps/bin/ape-pulse-canary-worker.sh:36-39,45-60` |
| `ape-canary@` (timer) | unidad de systemd con `CPUQuota=40%`, `MemoryMax=1G` | `_vps_stage/deploy/manifest.tsv:40` |
| Generador (frontend) | emite URLs `/jit/live/...` | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/generation-output-panel.js:96,342` |

**Estado del servicio en producción: `NO_COMPUTADO`** (sin SSH). El flag `canary.enabled` se creó y se eliminó el 2026-11-09 (`CANARY_TRUTH` A29), y `/var/lib/ara/canary/` y `/etc/ara/canary/` constan **vacíos** (`docs/ops/CANARY_RESOLVE_ANALISIS_2026-11-04.md:73-74`).

---

## 17.5 · Pruebas y resultados

### 17.5.1 La matriz de aceptación: 17 pruebas, 0 VERIFIED

| Estado | Filas | Pruebas |
|---|---:|---|
| VERIFIED | **0** | — |
| IMPLEMENTED_NOT_DEPLOYED | 7 | Canary SSOT, HDR, Térmica, Listas, OTT, TiviMate, ExoPlayer |
| PARTIALLY_FUNCTIONAL | 2 | Idempotencia, Recuperación |
| BLOCKED | 6 | Paridad visual, Audio, GPU, Zapping, Registro, VPS |
| FAILED | 2 | Tiempo real, Seguridad |
| DEPLOYED_NOT_DEVICE_TESTED | 0 | — |
| TESTED_IN_DEVICE | 0 | — |
| ROLLED_BACK | 0 | — |

Por medición: **3 MEDIDO · 6 PARCIAL · 8 NOT_COMPUTED**. (`docs/audits/ACCEPTANCE_MATRIX_20261111.json`, campo `resumen`.)

**El encargo anticipaba «9 de 17 sin medición»; el conteo estricto da 8 NOT_COMPUTED más 6 PARCIAL, es decir 14 de 17 sin medición de extremo a extremo.** Se reporta el número medido, no el anticipado. **Cero filas VERIFIED** porque ninguna de las 17 tiene hoy un artefacto reproducible de extremo a extremo.

### 17.5.2 Gates del repo (exit code literal, ejecutados en t6)

| Comando | Exit | Resultado |
|---|---:|---|
| `node tools/check_anti_degradation_policy.js` | **1** | ROJO — `stereo_locked 0 -> 3`; **PREEXISTENTE** (worktree sobre `472f7cc3` da salida idéntica y exit 1) y **falso positivo por prosa** (`tools/lab/ape-jit/server.js:557,990,3234` prohíben `-ac 2`) |
| `node tools/check_crystal_4k_law.js` | 0 | 5/5 |
| `node tools/check_crystal_6k_law.js` | 0 | 6/6 |
| `node -c tools/quality/test_canary_jit_contract.js` | 0 | sintaxis válida |
| `node tools/quality/test_canary_jit_contract.js` | 0 | **92/92**, fallos 0, `RESULT=PASS` |

### 17.5.3 El validador del contrato y su control negativo

- Original: `fixtures 55/55`, `coherencia 27/27`, `load-bearing 10/10`, `total 92/92`, exit **0** (`VEREDICTO_CANARY_JIT_20261111.md` §2).
- Control negativo propio (copia envenenada en `%TEMP%`, `deployability.loop_artifact.manifest_rows=1`): `RESULT=FAIL`, `total 90/92 fallos 2`, exit **1**. El contrato original quedó **byte-idéntico** (`488b8760…`, 35.791 B antes y después).
- Revisión independiente de la revisora: **`pass`** (`CONTRACT_REVIEW_ROUND3_20261111.md:8`, con 55/55, 27/27, 10/10, `RESULT=PASS` en `:37-41`).

### 17.5.4 Gate 200/206/302 — las tres capas, sin mezclarlas

| Capa | Objeto medido | Resultado | Fuente |
|---|---|---|---|
| **1. Producción (nginx, listas estáticas)** | 4 listas × 5 celdas, 2026-11-02 | **12/20** · 200 **8/8** · 206 **4/8** · 302 **0/4** | `GATE_MATRIX_MEASURED.md:32,39,40,41` |
| **2. Banco CI (nginx real en runner)** | misma `location`, `.gz` reales | **4/4 en 206** con la pata **200 intacta**; antes reproduce el fallo | `GATE_MATRIX_MEASURED.md:112-157`, run `41485054319`, workflow `ape-206-local-proof.yml` |
| **3. Motor JIT (Node, loopback)** | 200/206/302 del motor | **A 6/9 · B 9/9** | `JIT_HTTP_PROBES_20261111.md:205-219` |

**No se suman.** La capa 1 son listas servidas por nginx; la capa 3 es un servidor Node en `127.0.0.1`. Y hay tres «302» distintos que se nombran siempre:

1. **Producción**: devuelve **301** real (upgrade permanente http→https). Documentado como respuesta correcta, con la advertencia de que un 301 queda cacheado por clientes y proxies (`GATE_200_206_302.md:29-36`). La pregunta real es si el monitor exige 302 exacto o acepta 3xx (`:38-40`).
2. **Motor JIT**: `/go/<id>` → 302 a `/jit/live/...`, que en loopback da 404 y solo es servible detrás de `location ^~ /jit/` con `proxy_pass` de barra final (`vps/nginx/snippets/ape-jit.conf:40-41`). El 302 no está roto: le falta dueño.
3. **Banco CI**: `301→302` es el tercero de los tres cambios, vale **+4** celdas y está validado, no aplicado (`GATE_MATRIX_MEASURED.md:65`).

**Causa del 206 (medida):** compresión al vuelo ⇒ cuerpo sin longitud conocida ⇒ sin `Content-Range`. Es **exclusión mutua**, no incapacidad: las 4 listas dan 206 al perfil correcto y **0/4** a ambos perfiles (`GATE_206_MUTUAL_EXCLUSION.md:13-18,38`). El «206 0/4» que circulaba es impreciso y su propio autor lo corrige (`:8-11`); en celdas la cifra válida es **4/8**.

**Camino declarado:** 12/20 → **14/20** (`gunzip off` + `gzip_static on`) → **16/20** (`gzip off` en la location) → **20/20** (`301→302`). Los tres cambios son **independientes** y **ninguno está autorizado** (`GATE_MATRIX_MEASURED.md:62-65,72`).

> **Conflicto documentado que no se suaviza.** `GATE_200_206_302.md:59-61` **retira** el parche `gunzip off` porque con el stub de 8 bytes actual dejaría a los clientes sin gzip con 8 bytes: exige descomprimir antes los 2 `.gz` (~604 MB). `GATE_MATRIX_MEASURED.md:112-157` lo **valida en CI**, donde los `.gz` son reales. Ambas cosas son ciertas y no se contradicen: **el mecanismo está validado; su aplicación directa en producción es regresiva hasta descomprimir los `.gz`.** Cualquier informe que presente «20/20 validado» como si se pudiera aplicar tal cual está mintiendo por omisión.

**Límites de esa matriz, declarados por su autor** (`GATE_MATRIX_MEASURED.md:74-81`): sin reproductor real; los GET completos se cortan al primer chunk; sin concurrencia ni caché intermedia. Y un corolario importante: **el fallo de 206 no rompe la reproducción** — un player que pide el fichero entero no usa Range — **rompe la declaración `Accept-Ranges: bytes`** que nginx anuncia igualmente (`:77-78`; `GATE_206_MUTUAL_EXCLUSION.md:70-76`).

---

## 17.6 · Calidad visual observada

**Ninguna medición perceptual. Cero VMAF medidos, cero SSIM medidos.**

- `canary_fidelity: 'FILTERGRAPH_IDENTICAL'` es un **literal hardcodeado**, no una medida (`canary_quality.js:45`; `CANARY_TRUTH` A2 → NO_SOPORTADO).
- Las 5 pruebas del paquete son asserts sobre literales y condicionales: `pass 5 / fail 0` es cierto y **no acredita ni un píxel de paridad** (`CANARY_TRUTH:246`, A12).
- Lo único observado en un bitstream real es del **JIT**: 848×480 H.264 8-bit BT.709 → **1920×1080 HEVC Main 10 `yuv420p10le` `smpte2084` 1.552.340 bps**, leído con `ffprobe` de `init`+`chunk` (`docs/audits/PRUEBA_FISICA_REA_654_20261108.md:1228-1246`, citado en `ADVERSARIAL:183`). Eso prueba que el motor aplica filtros reales y produce HEVC nuevo — **a 1080p y no con la receta de Canary**.
- **Defecto visual observado y medido:** `scale=3840:2160` **deforma** fuentes no 16:9 — una entrada 1920×800 sale `3840x2160 [SAR 27:20 DAR 12:5]` (`CANARY_TRUTH` A7; la propia política lo advierte en `quality-policy.json:18`). El motor lo corrige con `force_original_aspect_ratio=decrease` + `pad` (`tools/lab/ape-jit/server.js:8668-8670`).

**Por tanto: si alguien escribe «calidad visual verificada», está leyendo una etiqueta.** La fila P02 (Paridad visual) queda **BLOCKED / NOT_COMPUTED**.

---

## 17.7 · Rendimiento y continuidad

| Medición | Valor | Fuente |
|---|---|---|
| Cadena Canary completa a 4K, `CPUQuota=40%` | **0,1828 fps** (30 frames / 164,1 s) | `_vps_stage/canary/FASE01_REPORT.md:59` |
| Motor a 3840×2160 con `hqdn3d+unsharp` | **0,25×** tiempo real (80,95 s para 20 s) | `tools/lab/ape-jit/server.js:40-44` |
| Bucle 4K del JIT en el incidente | **3,37 fps** contra 25 fps de fuente, `EXIT 183` | `docs/manifestos/INCIDENTE_DEPLOY_MANUAL_2026-11-09.md:66-68` |
| Canary real en producción | **76 s CPU / 194 s de pared** por 6 s de clip | `vps/bin/ape-pulse-canary-worker.sh:36-37` |
| Fallo de arranque del motor desplegable | **135,9 s** de TTFB antes del 503 | `JIT_HTTP_PROBES_20261111.md:103` |
| Fallo de arranque de media | **67,0 s** de TTFB antes del 503 | `JIT_HTTP_PROBES_20261111.md:104` |

**Continuidad: `NO_COMPUTADA`.** No existe **ninguna** medición de rebuffering, stalls, startup time ni drops. El único dato de continuidad es negativo y es un incidente: *«el bucle se comió la CPU y el operador se quedó sin TV»* (`INCIDENTE_DEPLOY_MANUAL_2026-11-09.md:66-68`).

**Conclusión de rendimiento:** a 4K la receta de Canary es **~137× más lenta que el tiempo real** (0,1828 fps contra 25 fps), y el motor con **menos** cadena ya es 4× demasiado lento (0,25×). Filas P03 y P15 de la matriz.

---

## 17.8 · Dispositivos comprobados

**Ninguno. Cero dispositivos verificados en esta misión.**

- La única prueba con la APK real contra URLs del JIT dio **overlay de error** (16.280 / 22.491 B) y la causa atribuida a la red **quedó sin probar** (`docs/audits/PRUEBA_FISICA_REA_654_20261108.md:1939-1946`, citado en `ADVERSARIAL:175`).
- La APK es `com.ape.crystalagent` (23 ocurrencias en el string pool) y **no contiene una sola referencia** a `ape-jit`, `/jit/signal` ni `chain_4k_test` en sus 422 entradas descomprimidas (`CANARY_TRUTH:58-63`).
- No hubo acceso a device en esta tarea. `TESTED_IN_DEVICE = 0` filas.

---

## 17.9 · Estado de los reproductores

| Reproductor | Estado | Qué hay realmente |
|---|---|---|
| **OTT Navigator** | IMPLEMENTED_NOT_DEPLOYED · cero prueba en device | `#EXTVLCOPT:video-filter` es `DECLARED_ONLY`: el APK lee de la lista solo `#EXT-X-APE-LAB-METADATA`, atributos de `#EXTINF` y la URL; OTT parsea `#EXTVLCOPT` solo para UA y referrer (`ADVERSARIAL:83-88`, vía `ape_directive_reality`; la cita de la skill §11 es **indirecta**) |
| **TiviMate** | IMPLEMENTED_NOT_DEPLOYED · cero prueba en device | misma frontera; ninguna petición de TiviMate real en ningún artefacto |
| **ExoPlayer** | IMPLEMENTED_NOT_DEPLOYED · **PARCIAL** | lo único medido es HTTP: `/go/1` con UA `ExoPlayerLib/2.19.1` → 302 a `media_0.m3u8` (`media-only`), y con UA `VLC/3.0.19` → `master.m3u8` (`master-capable`), con cabecera `X-APE-Player-Class` (`JIT_HTTP_PROBES_20261111.md:84-86`) |
| **VLC / LibVLC** | mismo caso que ExoPlayer | idem `:84` |

**Que un 302 asigne `master` o `media` no prueba que el reproductor reproduzca.** Es enrutado por User-Agent medido en loopback, no reproducción.

---

## 17.10 · Listas compatibles

- **12/20 celdas** en producción (`GATE_MATRIX_MEASURED.md:32`): 200 **8/8**, 206 **4/8**, 302 **0/4** (301 real).
- **Ningún reproductor real participó** en esa medición: las seis configuraciones son peticiones HTTP del auditor (`:76-77`).
- `Accept-Ranges: bytes` se anuncia **siempre**, incluso cuando no se honra (`GATE_206_MUTUAL_EXCLUSION.md:70-76`). Cualquier verificación que se fíe de esa cabecera da **falso positivo**.
- El parche que llevaría a 20/20 está **validado en CI** (run `41485054319`) y **no autorizado** (`GATE_MATRIX_MEASURED.md:72,112-157`).
- **Compatibilidad de listas con players: `NO_COMPUTADA`.** Se puede afirmar qué códigos HTTP devuelve nginx; no que un reproductor las use bien.

**Fila P09 = IMPLEMENTED_NOT_DEPLOYED**, con la cifra 12/20 y su desglose 8/8 · 4/8 · 0/4, y **nunca VERIFIED**.

---

## 17.11 · Límites conocidos

Los cuatro que el encargo exige declarar con su fuente:

1. **El motor desplegable no tiene 206 medido.** En A (el que tiene fila de manifiesto) el 206 es **0/2** en este host: no hay segmentos porque `spawn nice` falla con `ENOENT` (`tools/lab/ape-jit/server.js:4865`, sin fallback; B ya tiene el arreglo en `B:26,427` con comentario `FIX 2026-11-07`). Medido en `JIT_HTTP_PROBES_20261111.md:99-131`. En VPS Linux es **`NO_COMPUTADO`** (sin SSH); **queda prohibido afirmar que falla en producción por esta causa**.
2. **Un `GET /meta/<id válido>.json` mata el proceso.** Reproducido por t6 en loopback:3199 — `curl` exit 56, cero bytes/cabeceras, `/health` después `000`, sin listener, proceso exit 1. Traza literal: `ReferenceError: Cannot access 'CAPACITY_FPS' before initialization` en `server.js:8000:31` ← `capacityVerdict :8009:15` ← `Server.<anonymous> :6183:17` (TDZ: el `const` está en `:7993`, después del bloque de rutas de `:6167`). La ruta con id inválido **sí sobrevive** (404). Es un DoS no autenticado de una sola petición.
3. **Cero recibos de ejecución real.** `/var/lib/ara/canary/` y `/etc/ara/canary/` vacíos (`CANARY_RESOLVE_ANALISIS_2026-11-04.md:73-74`); el contrato declara **0 recibos** en vez de fingir uno (`CANARY_JIT_CONTRACT_20261111.md:371`). El script **sabe** escribir `status.json` (`ape-visual-emulate.sh:77-78`); nunca corrió en producción.
4. **El VPS no está auditado.** Sin acceso autenticado (`CANARY_TRUTH:24`). El estado vivo, la versión desplegada y el 206 del motor en Linux son `NO_COMPUTADO`.

Límites adicionales medidos:

5. **Tres artefactos llamados «el JIT»** con identidades distintas (A 447.943 B / B 45.535 B / C 415.037 B declarado) y ninguno contiene al otro: no son versiones, son ramas divergentes (`JIT_HTTP_PROBES_20261111.md:279-291`).
6. **La dirección de autoridad está invertida** respecto a la tesis: `tools/lab/ape-jit/server.js:7913` «EL CANARY MIDE, EL JIT AJUSTA, EL CANARY EJECUTA», y `:7922-7925` el JIT busca en **su** tabla de 16 reglas y el canary ejecuta **exactamente** esa cadena. El script lo confirma: `vps/bin/ape-visual-emulate.sh:49-50,80` (POST a `/jit/signal`). Y el motor no lee la política de Canary: `grep quality-policy` en A → **0**.
7. **Vías de degradación servibles por URL:** `/sdr/` y `/sdr720/` alcanzan `start(...,sdr720)` (`tools/lab/ape-jit/server.js:9010,9036,9040-9047`) y `SDR720_STABLE` se describe como *«H.264 1280x720 SDR continuity fallback»* (`:6162`); medido en la capa de listas: `GET /live/2/sdr/master.m3u8` → 200 `MODE:FHD_SDR` (`JIT_TRUTH` R-02). La ley solo lo autoriza con `canal_id, device_id, degradación, motivo, fecha`: no consta ninguno.
8. **El script con el bucle Canary↔JIT no se despliega** (H-1): se despliega el de 4.068 B / 80 líneas / **0** líneas con `jit` (`manifest.tsv:39`); el de 6.714 B / 144 líneas / **7** líneas con `jit` tiene **0 filas** en el manifiesto.
9. **Violaciones de protocolo medidas:** `If-Range` ignorado frente a RFC 7233 §3.2 (0 ocurrencias en A; medido 206 en B), sin filtro de método (`A:6059-6062`; `POST /health` 200, `DELETE /catalog.json` 200), inyección de `Host` en `Location` (`A:5282-5285`; `Host: evil.example` → `https://evil.example/jit/live/1/media_0.m3u8`).

---

## 17.12 · Pendientes de autorización

Ninguna de estas las puede ejecutar el agente. Van con quién decide y qué cuesta.

| # | Pendiente | Decide | Riesgo | Reversibilidad |
|---|---|---|---|---|
| 1 | `gzip off;` en `location ~* \.m3u8$` (+2 celdas, 0 B de datos) | operador | BAJO — pero mide antes el efecto en ancho de banda de las 2 listas grandes (`GATE_206_MUTUAL_EXCLUSION.md:91`) | ALTA — 1 línea, copia de respaldo, `gate_matrix.js` antes/después |
| 2 | Descomprimir los 2 `.gz` (~604 MB) + `gunzip off` (+2 celdas) | operador | MEDIO — con el stub de 8 bytes actual el cambio es regresivo hasta descomprimir (`GATE_200_206_302.md:59-61`) | MEDIA — exige espacio y ventana |
| 3 | `301`→`302` en la línea 21 (+4 celdas) | operador | MEDIO — **decisión de requisito**, no de servidor: los clientes que cachearon el 301 no verán el cambio (`GATE_200_206_302.md:34-40`) | BAJA en el parque ya cacheado |
| 4 | Aplicar los 3 cambios y re-medir en producción | operador | MEDIO | ALTA con respaldo + `gate_matrix.js` |
| 5 | Añadir fila al manifiesto para `vps/bin/ape-visual-emulate.sh` (6.714 B) | operador | **ALTO** — activa el bucle en producción con H1 abierto y capacidad 4K insuficiente; precedente: pérdida de TV (`INCIDENTE:66-68`) | ALTA mecánicamente, nula sobre el incidente |
| 6 | Desplegar al VPS | operador | **ALTO** | MEDIA (hay backups) |
| 7 | Push a GitHub | operador | BAJO — la afirmación del 403 **no tiene artefacto** (solo declaración en `README.md:3`) | ALTA |
| 8 | Reparar el motor A (H1 TDZ, H4 Host, método H7, H2 fallback) | operador | **MEDIO** — mueve el `sha256 28352c50…` que el contrato **pina**; obliga a re-pinar y a **re-congelar el 92/92** | MEDIA — el pin se cambia en una línea, la trazabilidad del corpus auditado no se recupera |
| 9 | Doctrina de `/sdr/` y `/sdr720/`: autorizar por escrito o retirar la ruta | operador (dueño) | MEDIO | MEDIA (tocar el motor re-pina) |
| 10 | Instalar o descartar la skill | operador | BAJO | ALTA |
| 11 | Reencuadrar Canary como **medidor** en vez de autoridad | operador | BAJO si se reencuadra; MEDIO si se mantiene (el contrato afirmaría una dirección que el código desmiente) | ALTA — es etiqueta y revisión, no despliegue |

---

## 17.13 · Procedimiento de reversión

No hay nada desplegado por esta misión, así que la reversión de **este trabajo** es trivial: los 13 ficheros son `??` (untracked) y se descartan con `git clean` selectivo o se borran; **no hay commit que revertir**.

Para lo que sí está en juego:

1. **nginx (si el operador aplica los 3 cambios):** copia del fichero **antes** de tocar (`/etc/nginx/sites-enabled/default`), `nginx -t`, reload, y medición con `node tools/ape-http-conformance/gate_matrix.js` **antes y después**. Reversión: restaurar la copia + `nginx -t` + reload. Es el procedimiento que el propio informe propone (`GATE_MATRIX_MEASURED.md:108-110,156-157`).
2. **Manifiesto de deploy (si se añade la fila):** quitar la fila y volver a ejecutar el deploy. Antes de revertir, `systemctl stop` del timer del canary para que no quede un ciclo corriendo.
3. **Motor A reparado:** guardar el `server.js` original (447.943 B, `28352c50…`) y re-pinear el contrato al nuevo sha256 **solo después** de re-ejecutar `node tools/quality/test_canary_jit_contract.js` y volver a congelar las cifras. Mover el motor **sin** re-pinar deja el contrato apuntando a un artefacto que ya no existe.
4. **Precedente ya ejercitado:** el flag del canary se creó el 2026-11-09 06:30 y se eliminó el mismo día (`CANARY_TRUTH` A29; `INCIDENTE:34,130`). Esa es la reversión real que ya se pagó una vez: quitarlo funciona, pero la ventana en que estuvo activo costó el televisor.

---

## 17.14 · Dos hallazgos críticos medidos después de este informe

Este informe se cerró en t16. Las tareas t25/t26/t29 midieron después dos hallazgos de seguridad que **no estaban aquí**, y sin ellos el veredicto de Seguridad estaba incompleto. Se incorporan con su jerarquía. **Amplían los límites conocidos de §17.11.**

### S-1 · El registro vivo del dispositivo NO está autenticado — severidad MAYOR para este contrato

- **Fichero:** `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/conviva-event.php` (9.962 B). Su cabecera, línea 6, dice literalmente: *«Conviva QoE Event Endpoint v1.0 — Phase 1 Stub»*.
- **Barrido de autenticación** (`HTTP_AUTHORIZATION|Authorization|Bearer|hash_equals|401|403|token|secret`): **1 sola coincidencia**, y es un **comentario** en la línea 15 — `Authorization: Basic <prisma_conviva:token>  (Phase 2)`. La app manda `Bearer`; el servidor lo ignora.
- **Daño acotado y real:** el endpoint permite **crear o sobrescribir** la fila de un `device_id` en `ara_heartbeats` (`ape_mesh.php:342-351`, `device_id TEXT PRIMARY KEY`) y **falsear** `state`, `player`, `ara_version`, `caps_json` y `last_seen`. Ese es exactamente el estado que el VPS usa para el **gate por dispositivo**.
- **No exige credencial alguna.** No hace falta el secreto, ni el APK, ni enrolar nada.
- **Contraste que evita la excusa fácil:** `ara-enroll.php` **sí** valida — `:30` `strlen($secret) < 16 → 503 ENROLL_DISABLED`; `:38` `!hash_equals($secret, $given) → 401 BAD_SECRET`. El problema no es «ARA no autentica»; es que **la pieza que mantiene el registro vivo no autentica**.

### S-2 · El secreto de enrolamiento viaja en claro en 29 de 34 binarios

- `ape.enroll.secret` en claro en `classes5.dex` (511.876 B), offset **423.327**, **48 caracteres**. Huella: `sha256 = 3a82184647badd50194cd074a7ef0cc67123bea106a0ac67d65882d5d0341ec1`. **El valor no se reproduce** (política `docs/policies/SECRETS_IN_BINARIES.md`: no se amplía la fuga).
- Presente en **31 de 36 ficheros = 29 de 34 binarios distintos** (36 ficheros, 34 distintos por 2 duplicados).
- **Sin rotar** entre 2026-10-30 y 2026-11-11.
- Referencias: `docs/canary/deliverables/10_CANARY_ANDROID_APK.md`, `docs/audits/APK_SECRET_SCAN_20261111.md:54`.

### Jerarquía de severidad, razonada para ESTE contrato

| Orden | Hallazgo | Por qué está ahí |
|---:|---|---|
| 1 | **S-1** registro vivo sin autenticar | No exige credencial y **permite inyectar la decisión por dispositivo** que el VPS usa como gate |
| 2 | **S-2** secreto de enrolamiento en claro | Muy grave, pero **exige poseer el APK** para leerlo |
| 3 | **H1** `GET /meta/<id>` mata el motor | Tumba el proceso (disponibilidad), pero no falsifica la decisión por dispositivo |
| 4 | **H4** inyección de `Host` en `Location` | Redirige a un host ajeno, pero tampoco falsifica la decisión |

**El criterio de la jerarquía:** cuánto cuesta al atacante y qué consigue. S-1 cuesta **cero** y consigue **falsificar el gate**; por eso va por delante de una fuga que al menos exige tener el binario. Es una jerarquía **de este contrato** (Canary→JIT con gate por dispositivo), no una escala absoluta de seguridad.

### Piezas que faltaban para cerrar el cuadro

- **Desacople enrol↔heartbeat:** `ara_heartbeats` no tiene `model`, ni `assigned_ip`, ni FK hacia el peer WireGuard (`ape_mesh.php:342-351`). El registro vivo no permite saber a qué peer corresponde ni qué política se le asignó.
- **Endpoint propuesto, no implementado:** `/api/v1/devices/register` tiene **0 coincidencias** en los 560 ficheros del stack ARA. El registro que el prompt supone no existe; lo que existe son las dos piezas de arriba.

### Efecto en la matriz §14

`docs/audits/ACCEPTANCE_MATRIX_20261111.json` queda corregida: **P13 (Registro)** pasa a medir el criterio de la sección 14 (*«dispositivo autenticado y asociado a política»*) con estado `PARTIALLY_FUNCTIONAL` y medición `MEDIDO`; **P17 (Seguridad)** incorpora S-1, S-2 y el desacople y **sigue `FAILED`**. Resumen recalculado: **7** `IMPLEMENTED_NOT_DEPLOYED` · **5** `BLOCKED` · **3** `PARTIALLY_FUNCTIONAL` · **2** `FAILED` · **0** `VERIFIED`.

> **Lo que sigue sin medirse:** si el VPS desplegado ejecuta *este* `conviva-event.php`, si el registro sin autenticar se ha explotado alguna vez, y si el emisor `QoEReporter.kt` es el que corre en el APK v657. Sin acceso al VPS ni descompilación del dex, los tres son `NO_COMPUTADO`.


## §16 · Inventario de los 14 entregables

> **Reconstruido** (ver §0). Cada fila tiene su ruta y su sha256 medidos hoy, salvo la última, que **no existe** y se dice por qué.

| # | Entregable | ¿Existe? | Ruta | Bytes | sha256 |
|---|---|---|---|---:|---|
| 1 | Paquete de integración (ZIP) | **SÍ** | `scratch/canary_jit_20261111/APE_CANARY_JIT_INTEGRACION_20261111.zip` | 9.155 | `9a13ec2c266f662ef8ded99520b691d611bda8f99695a0aed387c56991136fe1` |
| 2 | Manual (PDF) | **SÍ** | `scratch/canary_jit_20261111/Manual_REA_Canary_JIT_Actualizado_20261111.pdf` | 153.775 | `7149a4397a95c4159508549729f5bd07a55db9bc7dd3afe46da4cf3b6476f3ca` |
| 3 | Arquitectura (PDF) | **SÍ** | `scratch/canary_jit_20261111/Arquitectura_APE_Canary_JIT_Actualizada_20261111.pdf` | 165.330 | `e0539e506ffaec0aeac78ba6d7f49f8f5bdcfc060f0e834da9d8f7bdd7ed75cc` |
| 4 | APK | **SÍ** (pero no es entregable de Canary/JIT) | `scratch/canary_jit_20261111/APE_REA_653_OTT_DASH_2K_4K_6K_TEST_20261108.apk` | 24.362.980 | `4b0c4ef397a6ea7066b5f51951d4fefb94820b0e94aeaf07f3f879ca6674d341` |
| 5 | Contrato versionado v1 | **SÍ** | `contracts/canary_jit_contract_v1.json` | 35.791 | `488b87609a02c69d0ecffba17ea532fc8142964f3fdeb98e4cd8cc70e1395514` |
| 6 | Gate fail-closed del contrato | **SÍ** | `tools/quality/test_canary_jit_contract.js` | 71.957 | `0869149200cc0e7290e7de112fd0aa81914726435fd67989b34f29628169680b` |
| 7 | Doctrina del contrato | **SÍ** | `docs/manifestos/CANARY_JIT_CONTRACT_20261111.md` | 32.264 | `96dd7f5714b315d00bc59c1914451e11dee445d14bfd38cfec76ee6689f443eb` |
| 8 | Verdad medida de Canary | **SÍ** | `docs/audits/CANARY_TRUTH_20261111.md` | 47.639 | `33c214ef2360039f6da675344f1aac4b96e96b645eba46a79510e5f5abd98da6` |
| 9 | Verdad medida del JIT | **SÍ** | `docs/audits/JIT_TRUTH_20261111.md` | 52.730 | `e9e864b211f4d8e6fb19ecb3841f653b61c6257458003f12c7834aa0fbf8b1f4` |
| 10 | Batería HTTP 200/206/302 del motor | **SÍ** | `docs/audits/JIT_HTTP_PROBES_20261111.md` | 26.540 | `f1c2510582a9f1547ba785da3fdfecf475c39a061ce069524ee1ca85e7210c13` |
| 11 | Oposición adversarial | **SÍ** | `docs/audits/ADVERSARIAL_CANARY_JIT_20261111.md` | 31.615 | `8a62e7203a558c86e43996475db4ff117ba84eb6a38d4b64ae6d1020a287faae` |
| 12 | Revisión independiente ronda 3 | **SÍ** | `docs/audits/CONTRACT_REVIEW_ROUND3_20261111.md` | 13.898 | `1affc1728b67ecb2fb22522485107307e1398a33209b65f08bab357cf0dcfe59` |
| 13 | Veredicto final con gates | **SÍ** | `docs/audits/VEREDICTO_CANARY_JIT_20261111.md` | 44.013 | `3b9f155041a5c03558dc078421e5c0d0285e62173f883c488275d207b520c0b0` |
| 14 | **Fila de deploy del script con el bucle Canary↔JIT** | **NO EXISTE** | debería estar en `_vps_stage/deploy/manifest.tsv:39` | — | — |

**Fila 14 — qué la bloquea.** `_vps_stage/canary/deploy/manifest.tsv:39` mapea la copia de **4.068 B / 80 líneas** (`653b56e1…`, **0** líneas con `jit`). La copia que implementa el bucle (`vps/bin/ape-visual-emulate.sh`, **6.714 B / 144 líneas**, `f1d2ecff…`, **7** líneas con `jit`) tiene **0 filas** en el manifiesto (búsqueda `jit|emulate|canary` sobre sus 60 filas). No es un olvido de formato: **la bloquea una decisión del operador** (fila 5 de §17.12), porque activar ese script en producción compite por el `ffmpeg` y ya costó un incidente. Es el hallazgo **H-1**.

**Notas honestas sobre el inventario:**

- La fila 4 (APK) existe pero **no es un entregable de Canary/JIT**: 0 ocurrencias de `ape-jit`, `/jit/signal` y `chain_4k_test` en sus 422 entradas descomprimidas (`CANARY_TRUTH:63`). Es el host `com.ape.crystalagent` y no consume la receta.
- El ZIP (fila 1) **no contiene** los 2 PDF ni la APK, y su carpeta `docs/` está **vacía (0 entradas)** con 11 entradas totales: no hay bundle único verificable (`CANARY_TRUTH:41-49`, A33). No es un fallo de extracción; es un hueco real.
- Existe además un entregable **no previsto** que este informe no cuenta en los 14 por no estar en la sección 16: la revisión de las rondas 1 y 2 (`docs/audits/CONTRACT_REVIEW_20261111.md`, `CONTRACT_REVIEW_ROUND2_20261111.md`), y los dos ficheros de esta tarea (la matriz y este informe).

---

## Cierre

**Lo que se puede firmar hoy:** el contrato fail-closed con su pin SSOT por sha256 (**92/92**, exit 0, con control negativo que falla como debe: 90/92, exit 1) y la **identificación por sha256** de los tres motores. Nada más.

**Lo que no se puede firmar:** que la receta de Canary se aplique en producción (0 recibos), que haya paridad visual medida (**0 VMAF**, `FILTERGRAPH_IDENTICAL` es un literal), que el 4K sea tiempo real (**0,1828 fps** contra 25), que el gate 200/206/302 esté verde (**12/20**: 8/8 · 4/8 · 0/4), ni que el televisor reciba nada verificado en device (**0 dispositivos**).

**Y las dos cosas que hay que decir juntas, sin elegir la cómoda:**

1. **El contrato existe y funciona** — pin por sha256, 23 códigos de rechazo, 92/92, revisión independiente `pass`. Estado: **IMPLEMENTED_NOT_DEPLOYED**.
2. **La dirección de autoridad está CONTRADICHA** — `tools/lab/ape-jit/server.js:7913` dice que el JIT ajusta y el Canary ejecuta. Mantener «Canary es la autoridad» no es un matiz: es afirmar lo contrario de lo que el código implementa.

Un contrato impecable sobre una dirección invertida sigue siendo un contrato honesto; llamar «aplicado» a lo que solo está declarado, no.

# Decisiones del operador — paquete de accion

**Fecha:** 2026-11-11 · **Base git:** `472f7cc3` · **Arbol:** 0 ficheros rastreados modificados, 32 sin seguimiento
**Estado del sistema:** NI DESPLEGADO NI VALIDADO EN DISPOSITIVO. Matriz §14: 17 filas, **0 VERIFIED**.
**Regla de lectura:** cada decision lleva su accion exacta, su riesgo, su reversibilidad y la evidencia que la sostiene. Nada de esto se ha ejecutado.

---

## D-1 · Rotar `ape.enroll.secret` — CRITICA

**Que.** El secreto de enrolamiento viaja en claro dentro de los APK compilados y no se ha rotado en 12 dias.

**Evidencia.**
- En claro en **29 de 34 binarios distintos = 31 de 36 ficheros** del workspace, incluidos 4 de `deliverables/` y 2 de `artifacts/` (material de entrega).
- Ubicacion exacta: `classes5.dex` (511.876 B) del `app-debug.apk`, offset **423.327**. Huella del valor: `sha256 3a821846…41ec1`.
- Identico desde el APK de 2026-10-30 hasta el de 2026-11-11: **no rotado en 29 compilaciones**.
- Placeholder `CHANGE_ME_ENROLL_SECRET` presente en **0** APK: todos los builds inyectaron el valor real.
- Informes: `docs/audits/APK_SECRET_SCAN_20261111.md`, `docs/ops/SECRET_ROTATION_PROCEDURE.md`.

**Dano acotado (no inflado).** Da **enrolamiento WireGuard**: alta de un peer en `10.200.0.x` (cap 200, reservadas .0-.4/.255). **No** da video, **no** da `/sync` (otra clave distinta), **no** da `/jit/*`.

**Accion.** Rotar del lado del servidor: el valor vive en el env del pool php-fpm (`prisma-ara-enroll.conf:7-8`). Aceptado por `ara-enroll.php:30` (`strlen<16` → 503) y comparado con `hash_equals` en `:38` → 401. **Sin ventana de gracia**: el validador compara contra UN solo valor, el corte es seco.

**Riesgo.** Corte de enrolamiento de minutos mientras se propaga el env; los APK ya distribuidos dejan de enrolar hasta recibir el valor nuevo.

**Reversibilidad.** Alta: el valor anterior se conserva en el env del pool y se puede restaurar. Procedimiento completo en `docs/ops/SECRET_ROTATION_PROCEDURE.md` (Plan A servidor-primero; cero-corte exige tocar `ara-enroll.php` para aceptar lista viejo,nuevo, lo que NO esta implementado).

**Nota estructural.** Con el codigo actual **no existe forma de emitir un APK que enrolе sin llevar el secreto**. Reconstruir el APK es continuidad, no seguridad. Diseno de salida (provision en runtime) en `docs/ops/RUNTIME_PROVISIONING_PROPOSAL.md`, marcado NO IMPLEMENTADO.

---

## D-2 · Autenticar `conviva-event.php` — CRITICA

**Que.** El endpoint del registro vivo por heartbeat no valida ninguna credencial.

**Evidencia.**
- `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/conviva-event.php` (9.962 B). Cabecera L6: **"Conviva QoE Event Endpoint v1.0 — Phase 1 Stub"**.
- Barrido de `HTTP_AUTHORIZATION|Authorization|Bearer|hash_equals|401|403|token|secret` en el fichero: **1 sola coincidencia, y es el COMENTARIO de L15** `* Authorization: Basic <prisma_conviva:token>  (Phase 2)`.
- La app manda `Bearer` y el servidor lo ignora.
- Contraste con `ara-enroll.php`, que si valida (`:30` 503, `:38` 401).

**Por que es mas grave que D-1 para este contrato.** D-1 exige poseer el APK. D-2 **no exige credencial alguna**: cualquiera que alcance el endpoint puede crear o sobrescribir la fila de un `device_id` en `ara_heartbeats` (PK) y falsificar `state`, `player`, `ara_version`, `caps_json` y `last_seen` — **el estado que el VPS usa para el gate por dispositivo**. Es inyeccion de estado en el plano de control.

**Accion.** Implementar el `Phase 2` del propio comentario: exigir credencial en `conviva-event.php` y devolver 401 sin ella. Decision adicional: si se exige, hay que actualizar el cliente (`QoEReporter.kt`) y los APK ya distribuidos dejan de reportar hasta actualizarse.

**Riesgo.** Si se autentica sin desplegar cliente compatible, se pierde telemetria por dispositivo (no la reproduccion). Si no se autentica, el estado del gate sigue siendo inyectable.

**Reversibilidad.** Alta: cambio aislado en un endpoint PHP con copia previa.

---

## D-3 · Fila del manifiesto para el script con el bucle Canary↔JIT — BLOQUEANTE DE DESPLIEGUE

**Que.** El artefacto que implementa la integracion **no se despliega**.

**Evidencia.**
- `_vps_stage/deploy/manifest.tsv:39` mapea `_vps_stage/canary/ape-visual-emulate.sh` = **4.068 B / 80 lineas / 0 hits de 'jit'**.
- El script con el bucle es `vps/bin/ape-visual-emulate.sh` = **6.714 B / 144 lineas / 7 hits de 'jit'**, y tiene **0 filas** en el manifiesto.
- Corrobora `docs/manifestos/INCIDENTE_DEPLOY_MANUAL_2026-11-09.md:128`: lo desplegado medía 4.068 B.

**Accion.** Anadir una fila al manifiesto apuntando al script de 6.714 B. Una linea.

**Riesgo.** Activa el bucle Canary↔JIT en produccion; el propio incidente del 2026-11-09 documenta que costaba **57 s de CPU / 146 s de pared por un clip de 6 s**, y que habilitarlo produjo el corte.

**Reversibilidad.** Alta (revertir la fila), pero el riesgo en la ventana activa es real y ya se pago una vez.

---

## D-4 · Que los 6 entregables viajen — ENTREGA

**Que.** Los entregables del §16 existen en disco y **no viajan ni en git ni en el patch**.

**Evidencia.**
- `git ls-files docs/canary` → **0**.
- 7 ficheros en `docs/canary/deliverables/`, los 7 con `check-ignore` exit 0 citando **`.gitignore:173: deliverables/`**.
- El patch de integracion trae 31 `diff --git` y **0** bajo `docs/canary`.
- Coste si se aplica la negacion: **4.212.336 B = 4,02 MiB**.

**Accion.** Anadir `!docs/canary/deliverables/` despues de la linea 173 del `.gitignore`. Ensayado en copia: `check-ignore` pasa de exit 0 a exit 1 en los 7, y `status -uall` de 1 a 7 entradas. **La negacion no commitea: solo hace visible lo invisible.**

**Riesgo.** `git status` empezara a mostrar 3,3 MB de PDF + 865 KB de patch; un `git add -A` posterior los commitearia.

**Reversibilidad.** Total (quitar la linea).

---

## D-5 · Tres scripts de deploy que no cumplen su cabecera

**Evidencia medida.**
- `preflight.sh:4` declara `fails=0`, se imprime en `:42`, se testea en `:43` y se retorna en `:44`; **`fails` no se incrementa en ninguna linea**. No hay `set -e`. Un preflight que no puede fallar.
- `dry-run.sh:7` captura `rsh` con `$(...)` y **nunca mira su codigo de salida**. Con el VPS inalcanzable, `--audit` devuelve **exit 0** y el diff se lee como "todo nuevo". No distingue "VPS caido" de "VPS vacio".
- `validate.sh:15,18` ejecuta `rsh 'luac -p'` y `rsh 'php -l'`: valida **en el host que va a mutar**. Sin VPS, aborta con exit 3.
- **0 ocurrencias** de `systemctl enable` en los 11 `.sh` rastreados.

**Accion.** Cuatro cambios acotados: incrementar `fails` en preflight; comprobar el exit de `rsh` en dry-run y abortar; decidir si la validacion remota es aceptable o se hace local; y el paso de `systemctl enable`.

**Riesgo.** Son ficheros rastreados que gobiernan el deploy. Cambiarlos sin pruebas puede romper el pipeline.

**Reversibilidad.** Alta (git), pero requiere validar con `deploy_contract_check.js` y `git apply --check`.

---

## D-6 · Parche 206/302

**Evidencia de tres capas, nunca sumadas.**
1. **Produccion** (nginx, 2026-11-02): **12/20 celdas** — 200 = **8/8**, 206 = **4/8**, 302 = **0/4** (las cuatro devuelven **301**). `docs/ops/GATE_MATRIX_MEASURED.md:32,39-41`.
2. **Banco CI** (run `41485054319`): el banco primero **reproduce el fallo** y luego da **4/4 en 206** con el 200 intacto. `GATE_MATRIX_MEASURED.md:112-157`.
3. **Motor JIT** (loopback): A 6/9 · B 9/9. Capa distinta, no comparable.

**Correccion importante.** No es solo un bloqueo de permiso: `GATE_200_206_302.md:59-61` **retira** `gunzip off` porque con el stub de 8 bytes los clientes gzip recibirian 8 bytes. **Hay riesgo tecnico de regresion** hasta descomprimir los dos `.gz` (~604 MB).

**Accion.** Tres cambios independientes: `gzip off` en la location (1 linea, 0 B, → 206 en 2/4); `gunzip off` + descomprimir (→ 4/4); `301`→`302` (+4 celdas, decision de requisito).

**Reversibilidad.** Alta con backup; la verificacion es `gate_matrix.js` antes y despues.

---

## D-7 · Commit y push

**Estado.** 32 ficheros sin seguimiento en `472f7cc3`. **Cero commits, cero push.**

**Accion propuesta.** Una rama identificable (`feat/canary-jit-contract-20261111`) con los artefactos, **sin push**, para que el trabajo deje de estar en estado fragil. El patch `03_CANARY_JIT_INTEGRATION.patch` (865.408 B) ya esta generado y **aplica con `git apply --check` exit 0** sobre arbol limpio.

**Riesgo.** Bajo si no se empuja. El `403` del enunciado afecta a la integracion remota, no al repo local.

---

## Anexo · Dos defectos del LAB detectados, sin accion pedida

1. **`bit_depth` vs `bitDepth` contradictorios en 6 de 12 perfiles** (`LAB_CALIBRATED_FINAL_v24.0.0-6K.json`): P0 y P0.5 dicen `10` y `"12"`; P3, P3.5, P4.5 y P5.5 dicen `10` y `"8"`. El propio fichero documenta que *"declarar 12 era una etiqueta falsa"*: la correccion toco una clave y la otra quedo con el valor viejo.
   **No propaga**: el generador (`m3u8-typed-arrays-ultimate.js:1782`) usa `_firstDef(bit_depth, bitDepth)`, da precedencia al valor corregido, ignora el alias y lo declara emitiendo `#EXT-X-APE-OVERRIDE:bit_depth;GOVERNS=bit_depth;ALIAS_IGNORED=bitDepth` (`:2928`). El LAB tiene una etiqueta falsa viva; el consumidor la neutraliza por diseno.
2. **`app-release.apk` de disco obsoleto**: versionCode **51** (`3.9.4-adb-firetv`) frente al **657** declarado — delta **606**, no 46. Y **no es debuggable pero esta firmado con la misma clave debug**: tampoco es publicable.

---

## Estado final verificable

| Artefacto | Verificacion |
|---|---|
| `docs/audits/FINAL_INDEX_20261111.md` | 48 artefactos; 61 pares ruta+sha256 re-hasheados por el capitan: **0 desviaciones** |
| `docs/audits/S16_DELIVERABLES_INVENTORY_20261111.json` | 14 filas · 12 canonicas + 1 renombrada + 1 parcial + 0 inexistentes |
| `docs/audits/ACCEPTANCE_MATRIX_20261111.json` | 17 filas · **VERIFIED 0** · resumen cuadra |
| `tools/canary/rea_loop.js` | corrido por el capitan: **exit 0** en 880 ms, 6 gates, `last_healthy` |
| `contracts/canary_jit_contract_v1.json` | 92/92 comprobaciones, 50 paths con 50 rechazos |

**Lo que no se ha hecho, y no por descuido:** cero deploy · cero push · cero commits · cero rotaciones · cero descifrados · cero cambios al `.gitignore` · cero arreglos al motor, al LAB o a los scripts de deploy.

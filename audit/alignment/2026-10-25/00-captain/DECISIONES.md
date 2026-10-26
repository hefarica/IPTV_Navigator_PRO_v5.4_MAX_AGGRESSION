# DECISIONES VINCULANTES DEL CAPITÁN — equipo `alineacion-omni-crystal-1025`

Fecha: 2026-10-25 · Autoridad: capitán (session `session-b09b0374…`)
Mandato del propietario (2026-10-25): **"resuelvan entre ustedes; no me dejen elegir lo que solo ustedes pueden saber"**.
Traducción operativa: las decisiones técnicas las toma este equipo. El usuario **no** es un gate técnico.

---

## D-01 · Autoridad de decisión

- **Decide el capitán** con la evidencia de los auditores. **Veto técnico**: `verificador-alineacion` (si el veredicto
  es FAIL, no hay despliegue ni commit de producción, aunque el capitán quiera).
- Ningún agente escala al usuario una elección técnica (codec, precedencia, orden de deploy, commit vs no commit,
  qué archivo tocar). Se resuelve aquí y se registra con ID.
- Solo se escala al usuario lo que **no** es técnico: credenciales nuevas, gasto/contratación, acción legal o
  irreversible fuera del repo/VPS (p. ej. borrar datos del proveedor).

## D-02 · Precedencia del SSOT cuando dos fuentes discrepan

Orden de autoridad (gana la primera que exista y sea legible; las demás se subordinan):

1. **Excel LAB canónico** (`APE_M3U8_LAB_v8_FIXED.xlsm`) si existe y es legible.
2. **`contracts/crystal_contracts.json`** para todo lo que ese contrato pinnea (tiene SHA-256 verificable).
3. **JSON baseline `LAB_CALIBRATED_BULLETPROOF_*`**.
4. **`frontend/lab_master_22.6.0.json`** + **manifiesto OMEGA** (tabla P0–P5 y 5 leyes) para lo no cubierto.

Si la fuente superior **no existe** o es ilegible: baja un escalón y marca `UNKNOWN` en la matriz con el motivo.
**Prohibido inventar valores** para "completar" la capa faltante. Prohibido promediar dos fuentes en conflicto.

## D-03 · Leyes que ningún fix puede violar (veto automático)

1. Nivel↔resolución (L153=4K60; nunca L153 en 8K120).
2. SSOT no-clamp / no-override (no estampar codec ajeno a la resolución calibrada).
3. Coherencia triple Excel↔JSON↔lista.
4. No-strip de headers (~945 directivas tienen consumidor).
5. SHIELDED = solo sufijo de archivo; URLs de canal verbatim.

## D-04 · Implementación en el VPS (se hará, con estos gates)

Se autoriza implementar en producción **sin volver a preguntar**, pero solo cuando se cumplan **todos**:

1. Matriz `t9` emitida y los BLOCKERS de esa capa resueltos en repo (no se "arregla" en el VPS lo que está roto en repo).
2. Snapshot previo del archivo a tocar (`sha256` + copia `.bak` con timestamp).
3. Gates mecánicos: `nginx -t` (root), `luac -p` para cada `.lua`, `php -l` para cada `.php`, y smoke `curl -sI` del endpoint propio.
4. Rollback escrito y probado en seco (comando exacto para volver al `.bak`).
5. Aviso de 15 min en `COORDENADAS_SESIONES.md` §4 + aviso en `.agent-teams/session-board/BOARD.json`.
6. Firma del capitán + veredicto del verificador (PASS de la capa afectada).

Si falla cualquier gate: **no se toca el VPS**; se corrige en repo y se repite. Nunca `reload` sin `nginx -t`; nunca
`restart` de nginx completo sin necesidad; Lua con `lua_code_cache` exige restart del servicio, no del host.

## D-05 · Locks de otras sesiones

- `t44` (`frontend/js/**`, `vps/production_mirror/**`) y `t47` (`tools/crystal-upscale/**`) son de **escritura**.
  Nuestro equipo **lee** lo que necesita y **no escribe** ahí mientras el lock esté vivo.
- Si un fix imprescindible cae dentro de un lock: se documenta como `BLOCKED_BY_LOCK` con el `sha256` del estado
  actual, se pide release por el board, y se reprograma. **Nunca** se escribe "porque es urgente".
- No se revierte ni se "limpia" trabajo de otra sesión.

## D-06 · Política de commit (repo)

- Solo se commitea lo **verificado** en esta sesión/campaña, archivo por archivo, con `git diff --cached` revisado.
- Prohibido `git add -A`, `git add .`, `commit -a`, `push --force`.
- Los 3.172 borrados de `*/target/**` (artefactos de build) van en **un commit propio** `chore(build): drop tracked target/ artifacts`
  al cierre, junto con `.gitignore`: `**/target/`, `.agent-teams/`, `.session/`, `.agents/reports/deploy_*.json`.
- `audit/alignment/**` (evidencia de esta campaña) se versiona al cierre en un commit `docs(audit)` propio.
- El WIP ajeno (17 modificados) **no se commitea por nosotros**: lo commitea su sesión dueña.

## D-07 · Drift del contrato Crystal (hallazgo real)

`contracts/verify_contracts.mjs` falla hoy porque `_vps_stage/tests/fanout_concurrency.sh` tiene +23 líneas sin
commitear de otra sesión, mientras el contrato pinnea los bytes del commit `9b774bff…`. Decisión:

1. La sesión dueña regenera (`node contracts/build_contracts.mjs`) y commitea **artefacto + JSON juntos**.
2. Si al cierre sigue drifted y el lock está libre, lo regeneramos nosotros en un único commit atómico
   (artefacto + `crystal_contracts.json`) y volvemos a exigir `PASS 12 / exit 0`.
3. Nunca se "arregla" el contrato a mano ni se sube un pin sin recalcular.

## D-08 · Mutación ajena en el VPS durante la ventana de auditoría

A las 21:59 Bogotá otra sesión desactivó `/etc/cron.d/cache-health-monitor`. Decisión: **no se reactiva** (no es
nuestro cambio, no hay evidencia de que sea un error). Se documenta como estado observado en `40-vps/` y se avisa
en el board para que su dueño lo revise.

## D-09 · Alcance de "implementar todo"

Implementación = **remediación derivada de la matriz** (arreglar lo que rompe la cadena o una ley) + higiene de repo.
Cero features nuevas, cero "mejoras" sin contrato de aceptación y sin prueba. La doctrina MAX IMAGE no autoriza
inventar codec/nivel: solo elegir la mejor variante **real** que el decoder soporta.

## D-11 · El rojo del gate de contratos NO es un FAIL de alineación (falso positivo prohibido)

`contracts/verify_contracts.mjs` falla hoy porque **el disco** de `_vps_stage/tests/fanout_concurrency.sh`
(`b558b1cd…`, 99.666 B) difiere del pin del commit (`9b774bff…`, 98.126 B = `git show HEAD:`), por WIP
no commiteado de otra sesión. Decisión: en la matriz (`t9`) eso se clasifica como
`CONTRACT_DRIFT` / **observación**, nunca como FAIL de la cadena ni de una ley cardinal. Regla de
verificación obligatoria para cualquier gate que dispare: comparar **bytes de HEAD** antes de calificar.
Si el pin y HEAD coinciden → el contrato está sano; el rojo es ruido local.

## D-12 · Escritura ajena fuera de lane en la raíz del repo (X-007)

Detectado `UsersHFRC...toolscrystal-upscale_work.qsv_probe.mkv` (31.545 B, `FD4E0DBB…BE86`, 22:48:23),
aplanado desde `tools/crystal-upscale/work/qsv_probe.mkv` — lane `L-003` de `dsh-lead` (t47, lock
desde 22:21). Decisión: **no se toca, no se borra, no se commitea**; queda en `no_touch[]` y en el
board como evidencia del patrón de violación de lane ya registrado. No es nuestro trabajo limpiarlo y
no se incluye en ningún commit nuestro.

## D-13 · Fake-8K por defecto: se DEGRADA a `0` (rechazada su formalización en SSOT)

Hallazgo F-APP-04: la APP tiene un "fake UHD" que por defecto declararía resolución que el SSOT no sustenta.
Decisión: **default `'0'`** (apagado). Se mantiene la capacidad detrás de un flag explícito, jamás por defecto,
y nunca combinada con un nivel imposible. Razón: declarar 8K/4K no soportado por el nivel es exactamente la firma
del freeze 2026-06-08 (Ley Cardinal 1) y la doctrina prohíbe mentiras que rompen player. **No se formaliza en
Excel/JSON** porque el SSOT mismo contiene valores imposibles (D-16): formalizar el fake sería congelar el error.

## D-14 · Excepción de scope aprobada: `.agent/COORDINATION.md*`

El backup `.agent/COORDINATION.md.bak_20261026T034317Z` está fuera del glob original (`...COORDINATION.md`).
Decisión: **se amplía el scope a `.agent/COORDINATION.md*`**. El backup es evidencia obligatoria de preservación
byte a byte y **no se borra**. No fue una escritura no declarada: fue exigida por el propio encargo (t2).

## D-15 · Cómo se corrige `FRAME-RATE=120` + `hvc1.2.4.L153.B0` (Ley Cardinal 1)

No se sube el nivel "a ojo": `L156` (=4K@120) solo se declararía con **evidencia real de 120 fps** del stream.
Sin probe que lo demuestre, la corrección es **bajar `FRAME-RATE` a 60** manteniendo `L153` (4K@60), que es
verdad y no rompe decoder. Prohibido inventar L156 o dejar 120 con L153. Aplica a `resolve_quality_unified.php`
(`:5519-5520`, `:4857`) y a cualquier plantilla que replique el patrón.

## D-16 · Anomalías del SSOT `lab_master_22.6.0.json`: se corrigen en el SSOT, no se enmascaran en la APP

Evidencia de dos lanes (app + json): `P1 = 7680x4320@120 + hvc1.2.4.L153.B0` (imposible), `fps=120` en los 6
perfiles, `name ≠ resolution` en P1..P5, `chroma_subsampling="168055555555556"` (fórmula Excel rota).
Decisión: se corrige el JSON (y su origen Excel si existe) con evidencia y verificación; la APP **no** debe
silenciar el SSOT con clamps ocultos — debe emitir desde un SSOT coherente y, si detecta incoherencia, marcarla
en telemetría/audit, no "arreglarla" en vuelo sin dejar rastro.

## D-17 · Gate de sintaxis PHP: lo cierra el capitán con PHP portable local

`php -l` no existía en el host. Decisión: instalar **PHP 8.3 portable** en
`C:\Users\HFRC\AppData\Local\DSH_HERRAMIENTAS\rea-engines\php-8.3` (verificando SHA-256 del ZIP de windows.php.net)
y usarlo como gate en toda remediación. **No** se sube nada al VPS para lintar: el VPS sigue read-only para este
equipo salvo D-04.

## D-18 · Ronda 2 de coordinación aprobada

Se aprueba la ronda 2 propuesta por `coord-sesiones` con estos mínimos: (1) verificar cierre por cierre con sha256
recalculado; (2) hashear los 2 PHP que quedaron sin hash; (3) re-medir X-007 y X-002 al abrir y cerrar; (4) cubrir
`_vps_stage/ops/**` (X-008); (5) auditar `VPS_READONLY_ATTESTATION.md` cuando cierre t7; (6) `LIVE_STATUS` v2.
Se suma: aplicar D-14 (scope `.agent/COORDINATION.md*`) y D-19.

## D-19 · Atribución del heartbeat (X-009): el `modified[]` del guard no es autoría

El heartbeat de `session-guard` lista `git status` crudo (17 archivos ajenos + 3.172 rutas `*/target/**`). Decisión:
se re-emite el heartbeat con una nota que declara explícitamente que `modified[]` **no** es autoría de este equipo
y que nuestras escrituras son solo las 4 raíces de auditoría + `.agent/COORDINATION.md*`. No se modifica
`tools/session-guard.js` (ajeno).

## D-20 · Rama canónica del Excel: `Downloads` (no `Documents`)

`Downloads\APE_M3U8_LAB_v8_FIXED.xlsm` = `663EF44E…806A`, 3.582.019 B, mtime **2026-06-11 01:54:49**, 55 hojas.
`Documents\APE_M3U8_LAB_v8_FIXED.xlsm` = `E3BC629E…2DBD`, 7.134.977 B, mtime **2026-05-19 17:11:05**, 56 hojas.
Decisión: **canónica = Downloads** (más reciente y precede 12 min al export `LAB_CALIBRATED_20260611_020645.json`).
La de Documents es **anterior y divergente** (110 filas de `6_NIVEL_2_PROFILES`) y **no se mergea**: restaurar
Disney desde ahí revertiría calibración posterior. Queda archivada como referencia.

## D-21 · El `.xlsm` no se edita; se corrige la capa JSON y se emite ticket Excel

Excel-safe-mode + archivo del owner + 4 hojas protegidas + VBA: **no se escribe el libro**. Las correcciones se
aplican en el JSON exportado (T12) y las que pertenecen al libro se entregan como ticket reproducible
(`EXCEL_REMEDIATION_TICKET.md` con hoja!celda, valor actual, valor propuesto, fórmula/validación afectada).

## D-22 · P1: manda la ruta de export canónica, NO el 8K AV1

`mod_PRISMA_Export.bas` exporta `6_NIVEL_2_PROFILES`. En la rama canónica P1 = **3840x2160 + `hvc1.2.4.L153.B0`**.
El `av01.0.15M.10` 8K aparece en `37_VALORES_UNIFICADOS`, que **no exporta**. El `7680x4320` del JSON actual es un
híbrido corrupto (resolución de una hoja + codec de otra) heredado de la rama rota B2. Decisión: **T12 restaura P1
a 4K HEVC coherente**; el 8K AV1 no se reintroduce sin (i) probe real que sirva 8K/AV1, (ii) actualización conjunta
Excel+JSON+lista por el owner. La lista servida hoy ("P1 4K UHD", 23.510 canales) coincide con esta decisión.

## D-23 · FPS por perfil: se corrige a la capacidad real del nivel (no 120 ciego)

El Excel canónico dice `fps=120` en los 6, pero los niveles no lo soportan. Valores a fijar salvo evidencia real
de 120 fps: **P0 30** (DV level 6.0; la tensión 8K@120+L… se marca UNKNOWN en la matriz), **P1 60** (L153),
**P2 30** (L150), **P3 60** (L123), **P4 30** (L93), **P5 30** (AVC L3.0). Nunca 120 con nivel inferior.

## D-24 · CRÍTICO DE SEGURIDAD: credenciales de proveedor publicadas en repo público

`IPTV_v5.4_MAX_AGGRESSION/frontend/channels_map.json` (73 MB) **está trackeado en git** y el repo
`hefarica/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION` es **PUBLIC**. t5 midió **9.293 pares usuario/password por canal**
en ese archivo y **18.586 URLs con user/pass en el path**. Esto es una **fuga de credenciales en curso**.

Decisiones inmediatas (no consultables, son de seguridad):
1. **Prohibido commitear** cualquier archivo que contenga credenciales; `channels_map.json` no se toca en commits de
   esta campaña.
2. **Rotación de credenciales del proveedor**: la ejecuta el owner (única acción no técnica que se le escala).
3. **Purga de historial**: se prepara con `git filter-repo`/BFG + variante redactada (T16). **No se ejecuta** el
   rewrite sin autorización explícita del owner: reescribe historia pública y afecta clones de otras sesiones.
4. Se verifica que ningún otro archivo trackeado tenga el mismo patrón (T16).

## D-25 · La doctrina VPS "Crystal 5 fases + Rust" NO existe en producción: corrección documental

Medido: `ape-crystal-rust.service` no existe, `:8084` cerrado, `shield-location.conf` ausente, 13/13 artefactos
ausentes; nginx **1.24 stock** + `ngx_http_lua_module` (no OpenResty); pipeline real de **3 fases**
(`header_filter`→`body_filter`→`log`); `/shield/…` responde **404**; el VPS **no transporta video** (`\.ts|\.m4s|\.mp4$ → 404`),
es edge **metadata-only**. Decisión: **no se despliega nada para "alinear"** (sería la mutación destructiva que
`iptv-vps-touch-nothing` prohíbe). La corrección se hace en documentación (T14) y t9 debe citar la realidad medida.

## D-26 · `ape-meta-public.conf`: el VPS va por delante de git; se commitea la v2

Producción corre v2 (`0a400216…`, 2509 B, arregla el 404 de `/cdn/` delegando en `:8088`); HEAD tiene v1
(`adbf3e56…`, 2091 B, idéntica al `.bak` del VPS). Un restore desde el repo **reintroduce el bug**. Decisión: T15
prepara el archivo v2 en el repo con evidencia de hash y el capitán hace el commit quirúrgico (solo ese archivo).

## D-27 · Prohibido afirmar QoE/telemetría activa

`conviva.db` = 0 B / 0 tablas y 7 timers `netshield-*` inactivos. Ningún informe puede afirmar "telemetría Conviva
alimentando el LAB" ni "watchdog activo". Se declara ausente hasta que exista almacén y timers activos.

## D-28 · Cron `cache-health-monitor`: se mantiene deshabilitado

Causa raíz medida: `proxy_cache off` → cache nunca se llena → el monitor reiniciaba nginx cada 20 min (huella
22:55/23:15/23:35 UTC, y ninguno después de la desactivación). Decisión: **no reactivar** hasta corregir cache o el
monitor; la reactivación no es de este equipo.

## D-29 · D-19 CERRADO (el guard sí acepta `--note`/`--owner`) + scope `.session/<este-equipo>.json`

Verificado en código (`tools/session-guard.js` L13 documenta `heartbeat --note`, L16 `--owner`) y en el artefacto
`.session/alineacion-omni-crystal-1025.json`, cuyo `note` ya dice: *"modified[] es git status CRUDO, NO autoría…"*.
No hace falta que el dueño del guard cambie nada. El heartbeat que emite el propio guard crea
`.session/alineacion-omni-crystal-1025.json` como **efecto obligatorio del protocolo de aviso**: se amplía el scope
aprobado a ese archivo exacto (11/11). **Nunca** se toca `.session/**` de otras sesiones ni `tools/session-guard.js`.

## D-30 · Corrección de dos "bloqueantes" rancios de la ronda 2 (no son UNKNOWN en t9)

`coord-sesiones` midió antes de que cerraran t5/t7: `40-vps/VPS_READONLY_ATTESTATION.md` (17.248 B, `4117BC73…`)
y `20-json/SECRETS_SCAN.md` (10.669 B, `4353794B…`) **existen** y sus hashes fueron verificados por el capitán.
t9 debe citarlos como evidencia disponible, no como ausentes. Los `M` de `resolve_quality_unified.php` son WIP ajeno
preexistente (21:35), no de este equipo.

## D-31 · El parche doctrinal NO se aplica al manifiesto global; se versiona en el repo

El manifiesto OMEGA vive **fuera del repo** (`~/.agents/skills/iptv-omega-working-flow-manifesto/SKILL.md`, 48.262 B,
`FFBA6911…`): la doctrina que gobierna el repo no es auditable por `git log` ni viaja con un clone. Decisión:
**no se edita el manifiesto global** (afecta a todas las sesiones y no queda versionado). Se ejecuta T18:
snapshot versionado + `docs/manifestos/VPS_REALITY_MEASURED_2026-10-25.md` + bloque **aditivo** en `CLAUDE.md`.
Los 9 bloques de parche de T14 quedan como **pendientes del owner** para el manifiesto global.

## D-32 · Arquitectura que rige: la desplegada (rebase-only), no la del repo (transforming)

Repo = 26 `.lua` (proxy con transformación: codec-cascade, combined_body_filter, floor-lock, virtual-4K, prefetch,
telemetría); VPS = 14 `.lua`, sólo 4 en común, **rebase-only metadata**. Son **dos arquitecturas**, no dos versiones.
Decisión: **lo que rige producción es lo desplegado y medido**; el pipeline transformador del repo es
**aspiracional y no desplegado**. Ninguna afirmación doctrinal puede presentarlo como activo (D-25).

## D-33 · Contradicción `/shield/`: gana `CLAUDE.md` (medido)

`CLAUDE.md:373` prohíbe envolver con `/shield/`; el manifiesto lo documenta como URL canónica. La medición zanja:
`/shield/…` responde **404** y las listas usan URLs directas al proveedor. Decisión: **CLAUDE.md es correcto**;
el manifiesto se corrige (propuesta, no aplicada al global).

## D-34 · P1: el códec está bien; lo que está mal es la RESOLUCIÓN. `C350` es contradicción de la hoja

`6_NIVEL_2_PROFILES!C37 = "hvc1.2.4.L153.B0"` y `!C25 = "3840x2160"` → P1 canónico = **4K HEVC L5.1**.
Pero `!C350 = "av01.0.15M.10,ac-3"` contradice dentro de la **misma hoja**. Decisión: se mantiene el códec
**HEVC L153** (C37, es lo que exporta), se corrige la **resolución 8K→4K** (C25) y `codec_priority` se alinea a
HEVC; `C350` se registra como **ticket Excel** (contradicción aceptada hasta que el owner la resuelva).
**No se revierte a B1**: revertir reabriría `C350`/AV1 8K sin evidencia de decodificación.

## D-35 · FPS: corrección por capacidad, perfil por perfil

Techos medidos: P1 60 · P2 30 · P3 60 · P4 30 · P5 30 · P0 **UNKNOWN** (DV level 6.0 no sostiene 8K@120).
Decisión (Ley nueva `L11_FPS_LEVEL_CAPACITY`): **P0 30** (marcado UNKNOWN doctrinal), **P1 60 · P2 30 · P3 60 ·
P4 30 · P5 30**. No se sube `L150→L153` en P2 sin evidencia: se declara 30. Prohibido 120 en cualquier perfil
sin probe real.

## D-36 · Defectos que son de la HOJA, no del export: no se "arreglan" inventando

`chroma_subsampling="168055555555556"` (Excel `B40..G40`), `avgBitrate > maxBitrate` (Excel `K49/K50`) y
`fps=120` (fila 32) son defectos del SSOT Excel que el JSON copia fielmente. Decisión: en el JSON se aplica
**corrección segura y documentada** (chroma→`null`+UNKNOWN; `AVERAGE-BANDWIDTH ≤ BANDWIDTH` para no emitir HLS
inválido) y **se registra ticket Excel**; no se inventan valores físicos (ni 4:2:0 ni bitrates nuevos).

## D-37 · P3/P4: el JSON degradó el códec frente al canónico → se restaura Main10

`L10_EXCEL_CANONICAL_MATCH` (132 comparaciones, 28 diffs): P0 y P2 PASS; P1 6 diffs; **P3 8 y P4 9** donde el JSON
bajó a `hvc1.1.6.L120` y `avc1.64001f` mientras el canónico `E37/F37` es **Main10** (L123/L93). Decisión: T12
**restaura los códecs canónicos Main10** en P3/P4 (piso Main10 del manifiesto) y cierra los diffs de P1/P3/P4/P5
contra el extracto `10-excel/EXCEL_PROFILES_EXTRACT.json`.

## D-38 · Snapshot doctrinal: se ACEPTA cabecera + cuerpo (forma auto-descriptiva)

`docs/manifestos/OMEGA_WORKING_FLOW_MANIFESTO_SNAPSHOT.md` = **50.411 B** (`2D24FC33…`): cabecera de 2.149 B +
**cuerpo de 48.262 B byte-exacto**. Verificado por mí con slicing sobre el archivo entregado:
`sha256(bytes[2149:]) = ffba6911373de81d15823ee7478c84a8267befad24f57c30f95837cb68e86da5` == manifiesto global
intacto (48.262 B, mtime 2026-06-23). Decisión: **se queda esta forma** (documento auto-descriptivo, y la cabecera
en comentario HTML impide que un cargador lo trate como skill activa). No se pide la variante “byte-idéntica estricta”:
la prueba por slicing ya es criptográfica y el archivo debe explicarse a sí mismo.

## D-39 · Los 7 bloques de parche pendientes: NO se aplican ahora; F y G no se “corrigen” debilitando doctrina

Quedan pendientes A–E e I (manifiesto **global**, fuera del repo: se aplican solo si el owner promueve el SSOT al
repo) y **F** (AUTOPISTA `CLAUDE.md:381-391`) y **G** (SHIELDED `CLAUDE.md:368-377`).
Decisión sobre F/G: **no se reescriben para que digan lo que el VPS hace mal**. `proxy_read_timeout ≥ 60s` y
`limit_conn ≥ 2` siguen siendo el **objetivo**; la realidad (5s, sin `limit_conn`) es un **incumplimiento a
remediar**, no un estándar nuevo. Se anota “objetivo no cumplido” y se corrige el VPS (D-40). SHIELDED ya es
correcto y la medición lo confirma: no se toca.

## D-40 · Remediación VPS gated: solo `proxy_read_timeout` (60s); `limit_conn` y cache NO se tocan sin evidencia

De la realidad medida: `/meta/` y `/cdn/` tienen `proxy_read_timeout 5s` (doctrina ≥60s) → T19 lo sube a **60s**
con gates D-04 (snapshot+`nginx -t`+smoke+rollback). **No** se añade `limit_conn` (podría cortar multi-device sin
evidencia de abuso) y **no** se activa `proxy_cache` (reactivaría el bucle de reinicios que el cron desactivado ya
no vigila). Nada del pipeline Crystal se despliega (D-25/D-32).

## D-41 · Seguridad: orden ROTACIÓN → PURGA → variante redactada (nada ejecutado aún)

t16 midió **8 rutas con credenciales reales** del SSOT (channels_map 9.293 pares/27.879 URLs; **2 blobs `.wrangler`**
sin extensión con 3.455 cada uno; `backend/health/config_retry.json`; `.claude/settings.json`; 3 docs/scripts) y
**222 días de exposición** desde `e425b3c` (2026-03-17), con el archivo en `origin/master` y 3 tags ⇒ **asumir
compromiso**. Decisión: **primero rotar** (solo hay **3 pares distintos** para 9.293 canales: rotación acotada y
viable), **después purgar** (`git filter-repo`, 13 rutas, force-push + ticket a soporte) y **después** publicar la
variante redactada. El rewrite **no se ejecuta** sin autorización explícita del owner (D-24).

## D-42 · Contención ejecutada: se destrackean los blobs `.wrangler` (commit `ffb01e6`)

No esperamos a la purga para lo que se puede contener sin rewrite: **12 archivos** bajo `**/.wrangler/state/**`
(35,7 MB, incluidos dos blobs de 17,75 MB con 3.455 URLs con credenciales cada uno) estaban trackeados y sin
ignorar. Ejecutado: `git rm --cached` de los 12 + `.gitignore` `**/.wrangler/`, commit
`ffb01e6 security(containment): untrack wrangler R2 state blobs (creds expuestas)` y push (remoto == local).
**No reduce** la exposición histórica (sigue en la historia), pero evita re-publicación y futuros clones con estado
local. `_vps_stage/media/ape-ingest.sh`: 7 `userinfo` son **plantilla/demo** (usuarios `mfuse`/`anoth`/`user`/
`otro`/`dedup`, no los 3 pares SSOT) → no se toca, se marca para sanear antes de master.

## D-43 · La familia de lista se define por el PREFIJO de URL, no por el nombre del archivo

t8 midió: `/lists/*.m3u8` es **`gzip_static` estático sin Lua** (0 headers `X-APE-*`, 0 `lua` en el vhost). **5 listas**
(95.776 canales, incluida la vigente) son **100 % directas al proveedor**; **2 `_CDN_SHIELDED`** (21.040 canales)
son **100 % `/cdn/`**. El rewrite solo existe en `/cdn/` y `/meta/` (y `/meta/` es inalcanzable en 443). Regla para
toda auditoría futura: clasificar por prefijo de URL; asumir que "toda lista servida pasa por Lua" mide la nada.

## D-44 · 3.941 líneas imposibles en producción: se corrige regenerando, no editando el `.gz`

Producción viola la Ley Cardinal 1: **1.015/14.343** `#EXT-X-STREAM-INF` (7,08 %) declaran `3840x2160` con
`L123`/`L120` (nivel de 1080p) y el total en 5 listas es **3.941 líneas**; rastro `STABLE-VARIANT-ID="47_P1"`.
Decisión: **no se edita a mano** un `.gz` de 297 MB; se corrige en la fuente (JSON/APP, T11/T12) y se **regenera**
la lista por el pipeline. Hasta entonces se declara **FAIL de producción** en la matriz (no UNKNOWN).

## D-45 · El rewrite crea una violación nueva: `4K+L153 → 8K+L153` (upscale declarado sin nivel)

Medido antes/después sobre el mismo fichero: el rewrite de `/cdn/` cambia `RESOLUTION=3840x2160` → `7680x4320`
manteniendo `L153` (techo 4K@60) y añade `#EXT-X-APE-UPSCALE:declared=7680x4320`. `CODECS` no se toca (guard
anti-FZ-01) ⇒ el riesgo es **rechazo de variante / pérdida de calidad**, no freeze. Decisión: el upscale declarado
debe **caparse por capacidad de nivel** (nunca 8K sobre L153) o no declararse. Y dos defectos de código a corregir
en repo: **(a)** `ape_rebase_lib.lua:24` resuelve relativas contra el origen y no contra la URL de la playlist
(RFC 3986 §5.2) → 404 si el proveedor sirve segmentos relativos (**HIGH condicional**); **(b)** inyecta
`CAN-BLOCK-RELOAD=YES` **sin implementar** `_HLS_msn` (0 ocurrencias en `/etc/nginx/`). Van a remediación de repo;
el despliegue queda gated por D-04.

## D-46 · Headers: producción limpia, histórico del repo sucio (cuarentena, no servir)

Producción: **0/23.510** bloques `#EXTHTTP` con los 6 tóxicos (por clave exacta), 0 `traceparent`, `Referer` neutro,
JSON válido. Repo: **3 listas idénticas** (444 MB, mismo sha) con **6/6 tóxicos al 100 %** en 2.754 canales,
`hev1` en `CODECS` ×1.359, `SUPPLEMENTAL-CODECS="lcev.1"` inventado, `#EXTM3U` en línea 9 y 1 canal sin URL.
Decisión: esas listas quedan **en cuarentena** (no se sirven, no se regeneran desde ellas); se documentan como
material histórico y se excluyen del pipeline.

## D-47 · Veredicto t9: FAIL aceptado — veto D-01 vigente para la cadena afectada

Matriz: **53 filas · 16 PASS / 32 FAIL / 5 UNKNOWN**; leyes **L1 FAIL · L2 FAIL · L3 FAIL · L4 PASS · L5 PASS**.
Decisión: se acepta el FAIL. **No hay deploy ni commit de producción de la capa afectada** (manifest/listas/rewrite)
hasta cerrar los 16 blockers del bloque cadena/ley. Sí se permiten: fixes en repo de archivos **no bloqueados**,
reviews independientes y los fixes periféricos ya decididos (T19 timeout, commit v2 ya publicado). El PASS parcial
de una capa (p. ej. listas→VPS-served, PASS salvo `/cdn/`) puede concederse por separado.

## D-48 · N1: el exportador Excel→JSON es FIEL — se alinea el artefacto que la APP carga

`Downloads/LAB_CALIBRATED_20260611_020645.json` = **0 diffs/24 celdas** vs `6_NIVEL_2_PROFILES`. El repo consume
`frontend/lab_master_22.6.0.json` (**10 diffs/24**) porque `ape-lab-import-helper.js:36 DEFAULT_PATH='lab_master_22.6.0.json'`.
Decisión: **T12 no re-exporta** (no cambiaría nada); alinea `lab_master` a las celdas canónicas. Aceptación vinculante:
`node audit/alignment/2026-10-25/90-matriz/tools/which_json_is_the_export.mjs` → `lab_master_repo.totalDiffs === 0`.

## D-49 · N2: el defecto de resolución NO era solo P1

P3 (hoja 1920x1080), P4 (1280x720) y P5 (854x480) también declaran `3840x2160` en el JSON; **P5 —el failsafe—
declara 4K con AVC**. D-34 se extiende: se corrigen las resoluciones de los 6 perfiles contra las celdas canónicas,
no solo P1.

## D-50 · N3: P2 no se emite → UNKNOWN, no PASS

El catálogo vigente tiene **0 `STREAM-INF` `_P2`** en 14.343 líneas. Decisión: las evaluaciones de P2 quedan
**UNKNOWN con motivo** hasta que exista emisión real; convertirlas en PASS exigiría fabricar evidencia.

## D-51 · B-15 CERRADO por el capitán

El blocker B-15 (commit de la v2 de `ape-meta-public.conf`) ya estaba resuelto antes del veredicto: commit
`3de6b0a` con blob `git show HEAD:…` = 2509 B / `0a400216…` == VPS live, publicado (`d322eb2..3de6b0a`). Se marca
CERRADO por evidencia, no reabierto.

## D-52 · Reviews independientes para cerrar el delivery

El sistema exige review de las implementaciones completadas. Creadas: **T20** (review de T15, `listas-m3u8`) y
**T21** (review de T18, `excel-ssot`) — revisores que **no** escribieron esas tareas. Tras T11/T12/T19 se creará la
**re-verificación** que ligue los bytes finales (el veredicto t9 precede a las remediaciones y el gate avisa que sus
bytes ya no son los que juzgó).

## D-53 · T19 validada: el cambio vive en `50-ape-meta-plane.conf` (y el Verify del contrato estaba mal)

Verificado en vivo por el capitán: `50-ape-meta-plane.conf` = **10.941 B / `3e29b928…`**, `nginx -T` muestra
**60s** en `/meta/` (L298) y en el subrequest `/_ape/_fetch` (L422, el que sirve `/cdn/`), `nginx -t` OK,
`/_ape/health` en **:8088** → `ok:true`/`error_ratio:0`, master PID **2001835** vivo y `NRestarts=0` (reload
graceful, sin restart). **DV-1**: los comandos Verify que escribí apuntaban al puerto 80 (301 preexistente) →
contrato mal, no regresión; se aceptan como evidencia los endpoints correctos. El log de T19 da MATCH (`F5A2F437…`).

## D-54 · DV-2: el `/cdn/` del 443 estaba en 20s (nunca 5s) → se sube a 60s en T22

Doctrina exige ≥60s; 20s quedó fuera del scope “5→60” y no se tocó sin autorización (correcto). Decisión: **T22**
lo sube a 60s con los mismos gates D-04, en el mismo ciclo que actualiza los espejos del repo.

## D-55 · Drift inverso: el repo no debe quedar por detrás del VPS

Tras T19, `_vps_stage/nginx/meta-plane.conf` quedó atrás (`e06ee870…` vs `3e29b928…`) — mismo patrón que DR-03.
Decisión: **T22** actualiza ese espejo y el de `ape-meta-public.conf` (tras DV-2), con hash y diff; el capitán los
commiteará en la tanda de remediación (D-06). Regla permanente: **después de tocar el VPS, se actualiza el espejo
del repo en la misma tarea** (si no, el próximo restore reintroduce el bug o el drift).

## D-56 · T21 (review de T18): PASS aceptado; observaciones O-1/O-2/O-3 quedan como precisión documental

`excel-ssot` (independiente, no escribió T18) recalculó 4/4 hashes, reprodujo el slicing (cuerpo `48.262 B` ==
manifiesto global `FFBA6911…`), confirmó `CLAUDE.md` `+20/−0` con hunk único y el manifiesto global intacto
(mtime 2026-06-23). Corroboró por su cuenta la brecha **26-vs-14** (4 comunes), GRUPO B **8/8** ausente y GRUPO A
**5/5**. Veredicto **PASS** ⇒ T18 cumple el requisito de review.

Observaciones **low, no bloqueantes**: O-1 (son **5** copias de `shield-location.conf`, no 4: falta
`vps/vps-live-snapshot-20260428/nginx-snippets/…`, `30C132E8…`), O-2 («26 `.lua`» es del dir SSOT
`vps/nginx/lua/`; el árbol completo tiene **88**), O-3 (traceabilidad de hashes en el log y conteo de líneas
682 vs 875 LF). Decisión: se aceptan como **precisión documental**, no defecto de fondo; se registran en
`45-doctrina/REVIEW_ACTA_T21.md` (archivo nuevo) y **no se editan los artefactos revisados** (editar invalidaría el
review). Las correcciones O-1/O-2 entran en el pase documental posterior, si se hace.

## D-57 · T11: trabajo APLICADO y verificado por el capitán; el `failed` es del gate externo, no del fix

Verificado por mí sobre el archivo: `ape_hls_generators.php` = **40.041 B / `8992CB89…`**, `git diff --numstat` =
**10/7 solo ese archivo**, `php -l` **exit 0**, B-10 aplicado (`CODECS` HEVC = `hvc1.2.4.L153.B0,mp4a.40.2`; los
`hev1` que quedan son DASH legítimo en `generate_dash_mpd()` L441/446 + un comentario) y B-11 aplicado (sin
`EXT-X-MAP` falso; el de `serve_hls_fmp4_ignition` L598 con init `.m4s` real sigue intacto). El `failed` proviene de
`node contracts/verify_contracts.mjs` (exit 1 por drift ajeno de `_vps_stage/tests/fanout_concurrency.sh`,
L-004/L-007) — un gate que **no puede pasar por causas externas** y que no mide este archivo. Decisión: se conserva
el registro honesto de `failed` y se crea **T23** con un contrato de verificación que sí puede pasar.

## D-58 · B-10b AUTORIZADO: el default `?? 120` se sustituye por clamp de capacidad

`:737` `$fps = $cfg['fps'] ?? 120` emitía 1080p@120 con `avc1.640028` (High@L4.0 ⇒ 4× sobre el techo) y también en
HEVC. Decisión: **clamp por nivel**, sin inventar niveles: AVC `avc1.640028` + 1080p ⇒ **30**; HEVC `L153`/`L123`
⇒ **60**; resto ⇒ **30**; un `fps` explícito del perfil se respeta pero **nunca** por encima del techo. Se ejecuta en
T23 con diff mínimo.

## D-59 · El gate de contratos no puede ser requisito de nuestras tareas mientras el drift sea ajeno

`contracts/verify_contracts.mjs` seguirá en rojo hasta que la sesión dueña commitee `_vps_stage/tests/fanout_concurrency.sh`
y regenere el contrato (D-07). Decisión: **ninguna tarea de este equipo** usa ese verificador como único gate;
se usa `php -l`/`node -c` + prueba de emisión multilínea + `git diff` acotado, y el estado del contrato se registra
como `BLOCKED_BY_OWNER` con su evidencia. Los gates deben **poder fallar por el motivo correcto**, no por ruido ajeno
(la lección de los dos greps engañosos de T11: `.` no cruza `\n` y `FRAME-RATE={$fps}` no es literal).

## D-60 · T12-F3: gana la celda canónica; el fps se corrige en la emisión, no falsificando el export

Conflicto real: el gate vinculante exige `settings.fps = 120` (celda `!X32`) y D-35 pide 30/60 por capacidad. Decisión:
**se mantiene `settings.fps=120`** (es lo que dice la hoja; el gate `totalDiffs=0` se conserva) y la corrección vive en
la **capa de emisión** (`X-Stream-FPS` = 30/60/30/60/30/30) + **ticket E-1** para que el owner corrija la fila 32 del
Excel. Riesgo declarado: cualquier consumidor que lea `settings.fps` en crudo sigue viendo 120 → el clamp debe estar
en TODO emisor (T11/T23 y B-06 pendiente). No se reintroduce AV1 8K.

## D-61 · T12-F2: el Verify del contrato era MÍO y estaba mal

El bloque `Verify:` de T12 tenía **comillas desbalanceadas** en el primer `node -e`, que engullía los otros dos
comandos. Es un defecto del capitán, no del entregable. Decisión: los 3 comandos se ejecutaron por separado y así se
registra; **regla nueva**: los `verify` deben ser comandos simples, uno por entrada, sin `node -e` con comillas
anidadas (si hace falta lógica, se usa un script del repo). Ninguna evidencia se fabrica a partir de un bloque roto.

## D-62 · T20 `needs_revision`: carrera causada por NUESTRA propia remediación, no por T15

El review midió el VPS **11 s después** de que T22 escribiera `ape-meta-public.conf` (20s→60s). El commit `3de6b0a`
es correcto (blob `0a400216…` == el `.bak_20261026T043703Z` de 11 s antes) y el VPS quedó **más correcto** que el
commit (60 s cumple el piso autopista; 20 s no). Decisión: el fix es **commit v3** del snippet con 60 s cuando T22
cierre y el espejo coincida con el VPS (lo hago yo, no el revisor). Regla nueva: **ningún review mide un archivo
mientras una remediación lo posee**; si detecta escritura concurrente, emite `BLOCKED_BY_CONCURRENT_REMEDIATION` con
`.bak` + mtime, no un veredicto. El revisor actuó bien: detectó la causa y no culpó al commit.

## D-63 · F2/F3 de t20: al pase de docs, no blockers

F2 (el rollback de `COMMIT_READY.md` está documentado para otro archivo y no cita el `.bak` del snippet) y F3
(declarar la eliminación de `client_max_body_size 1m`) quedan **fuera del contrato automático** y se cierran en el
pase documental (commits docs), no bloquean t24/t25. Se usan las tareas que generó el scheduler (**t24 repair**,
**t25 review**) sin crear duplicados.

## D-64 · Corrección de aritmética aceptada: el techo HEVC L5.1 no era el problema; el AVC sí

`app-generador` rectificó su propio dato: H.265 Tabla A.8 fija **L5.1 = 534.773.760 luma/s**, y 1080p@120 =
**248.832.000** → **cabe** (4K@60 = 497.664.000, de ahí `L153` = “4K@60 CORONA”). Su cifra anterior
(`222.822.400`) era falsa y la conclusión “1080p@120 excede L5.1” también. La violación **dura** estaba **solo en
la rama AVC**: H.264 High@L4.0 `MaxMBPS` 245.760 vs 1080p@120 = 979.200 (**3,99×**).
Decisión: se acepta la corrección y se ajusta la lectura de la matriz: el cap HEVC a 60 **no** se justifica por
capacidad de nivel, se mantiene por **D-15** y por el ancla del propio sistema (`CFR_60_ANCHOR_LOCKED`,
`rq_streaming_health_engine.php:205`). El cap AVC a 30 sí es aritmética pura. Un dato falso en un entregable de
auditoría se corrige publicado, no se borra: es exactamente la disciplina que la cadena necesita.

## D-65 · Commit `4c24d48`: remediación de generador verificada (repo-only, sin deploy)

Verificado por el capitán antes del commit: `ape_hls_generators.php` = **40.501 B / `C2332FBD…75458B`** (**esto es el
CHECKOUT Windows con CRLF**; el **BLOB git LF** es **39.745 B / `E8FC2513…F72A` / oid `4127f017…`**, ver D-75/D-77),
`php -l`
exit 0, prueba de emisión **52/52**, `?? 120` = 0, gate multilínea 0, `git diff` **16/8 solo ese archivo**,
B-10/B-11 conservados (hvc1 en STREAM-INF, sin `EXT-X-MAP` falso, `EXT-X-MAP` real de init `.m4s` intacto).
Commit `4c24d48` publicado (`ffb01e6..4c24d48`, remoto == local). **Sin deploy**: D-47 mantiene bloqueado el
despliegue de la cadena al VPS hasta la re-verificación PASS; este commit solo fija la fuente en repo.

## D-66 · T22 verificada y commiteada: repo == producción en ambos nginx (drift cero)

Verificado en vivo por el capitán: `50-ape-meta-plane.conf` = **10.941 B / `3e29b928…`**, `ape-meta-public.conf` =
**2.509 B / `a39e8de9…`**, ambos espejos del repo **byte-idénticos**; `nginx -T` **60s** en L298/L422/L826 (519/535
ajenos intactos), `nginx -t` OK, MainPID **2001835** con `NRestarts=0`. Commit **`f294922`** publicado
(`4c24d48..f294922`). DR-03 cerrado por ambos lados: un `git checkout` ya no degrada producción.

## D-67 · `error_ratio` queda EN CUARENTENA: lo envenenaron nuestras propias sondas

T22 probó `/cdn/` con credenciales **fabricadas** → 3 fallos reales contra `line.tivi-ott.net`. El cooldown de 15 s
ya expiró (`upstreams_down:0`), pero el contador `qinc("host_down:…")` **no tiene TTL** y sobrevive al reload:
`error_ratio = 0.4286` hasta un **restart natural**. Decisión: **no se reinicia producción para limpiar un número**
(sería exactamente lo que `iptv-vps-touch-nothing` prohíbe). Mientras tanto, **prohibido citar `error_ratio`** como
QoE; al leer `/_ape/health` se usan `ok`, `upstreams_down`, `shared_dicts` y `rebase_ok`. Si se quiere limpiar, se
planifica con ventana, snapshot y rollback — y con autorización del owner.

## D-68 · Tercer contrato con endpoint equivocado: regla de Verify definitiva

Van tres (`:80` en T19, `/` en T22, más el bloque con comillas de T12): **el fallo es mío, no del VPS**. `/` devuelve
403 por diseño (estáticos sin autoindex). Regla nueva: **todo `verify` debe apuntar a una ruta que se sabe devuelve
200** (la URL de lista con `--resolve`, o `:8088/_ape/health`) y declarar el código esperado; nada de sondear `/`
ni de asumir puertos. El `/cdn/` end-to-end queda **UNKNOWN honesto** sin credenciales reales (no se usan).

## D-69 · PROHIBIDO fabricar credenciales contra un proveedor real

Las 3 sondas de T22 a `line.tivi-ott.net` con credenciales inventadas generaron tráfico no autorizado hacia un
proveedor ajeno. Sin daño funcional, pero **no se repite**: los smoke tests se hacen solo contra loopback
(`:8088/_ape/health`), la lista servida y el propio vhost; **nunca** contra el upstream con credenciales falsas.
Queda como regla cardinal del equipo, alineada con la REGLA LEGAL del repo.

## D-70 · Incidente `b4c6008`: commit local de 15 s, revertido, nunca publicado — sin daño

`coord-sesiones` creó un commit local (`b4c6008`, 23:42:18) y lo revirtió **15 s después** (23:42:33) al recibir la
instrucción de D-62. Verificado por el capitán: `cat-file -t` = commit, `merge-base --is-ancestor b4c6008 HEAD` =
**False**, `ls-remote` sin coincidencias, reflog con commit→reset. **Nunca se publicó** y el contenido quedó en
`f294922`. Decisión: **sin acción disciplinaria**; al contrario, la transparencia con que lo reportó (sin que nadie
lo pidiera) es la conducta que hace auditable la cadena. El objeto sigue recuperable del reflog ~90 días por si el
owner quiere inspeccionarlo; no se usa.

## D-71 · Timestamp de la divergencia: `04:37:14Z` (el work-order decía `04:14Z` y era falso)

La divergencia de `ape-meta-public.conf` ocurrió a **04:37:14Z** (stat del vivo, doble medición) con `.bak` de
**04:37:03Z**. El contrato automático pedía citar **04:14Z**: dato no verificable. Decisión: el pase de docs usa
**04:37:14Z**; el `04:14Z` del work-order queda registrado como error del generador de tareas, no como hecho.

## D-72 · F1/X-010 CERRADO y board rev10: un `git checkout` ya no degrada producción

Cierre con doble trazabilidad: `3de6b0a` era fiel **hasta T22** (blob `0a400216…` = `.bak_20261026T043703Z`) y
`f294922` es fiel **ahora** (blob `a39e8de9…` == VPS live; `meta-plane.conf` `3e29b928…`). `BOARD.json` **rev10**
marca X-010 `closed` con `non_valid_evidence` declarada (error_ratio envenenado, `host_down` sin TTL, 403 del root).
**t24 se cancela con cierre por evidencia** (el acceptance del work-order no era verificable sin exponer criterios) y
**t25 se cancela por obsoleta**: el review independiente ya lo hizo coord-sesiones con hashes recalculados. No se
fuerza un `pass` fabricado para satisfacer un contrato mal formado — misma regla que no maquillar un gate en rojo.

## D-73 · T12 CERTIFICADA por T26 (re-medida, no lectura de log)

Verificado por el capitán y re-medido por `verificador-alineacion`: `lab_master_22.6.0.json` = **280.121 B /
`60DBAB4B…2A93`**, `which_json_is_the_export` → **`totalDiffs: 0/24`** (6/6 perfiles `diffs: []`, con control
negativo: el candidato byte-idéntico al pre-fix mide 10/24 en la misma corrida), `verify_levels` →
**`ZERO_IMPOSSIBLE_LEVELS`** (0 imposibles, 1 UNKNOWN P0/DV declarado), `PARSE_OK`, integridad estructural intacta,
`servers[]` solo por hash de bloque (0 valores transcritos), backup íntegro (280.065 B / `099A1707…`). `excel_vs_json`
28→9, todas desviaciones ordenadas con ticket (3 D-35 · 5 D-36 · 1 C350-vs-C37 · 0 en campos corregibles).
**T12-F1** = `BLOCKED_BY_OWNER` con prueba de no-atribución (el contrato tiene 0 coincidencias de `lab_master`;
el único FAIL sigue siendo `_vps_stage/tests/fanout_concurrency.sh`). **T12-F2** reconocido (D-61). **T12-F3**
confirmado (D-60). **UNK-12**: las 19 apariciones de `av01` son rungs preexistentes byte-idénticos al respaldo, no
las introdujo el fix. Incidente declarado y resuelto: una corrida de `excel_vs_json` escribió su salida por defecto
en la raíz; se detectó por `git status`, se verificó la ruta y se borró; raíz limpia (solo queda el untracked
preexistente de `.agents/reports/`).

## D-74 · T19 APROBADA sin condiciones por T28 (9/9 criterios medidos en vivo)

`json-ssot` revisó en solo lectura: config **10.941 B / `3e29b928…`**, `nginx -T` **60s** en L298/L422 (519/535
intactos, 0 restos de 5s), `nginx -t` OK, `MainPID=2001835` con `NRestarts=0` (reload), `/_ape/health` 200/`ok:true`,
`.bak` 10.939 B `e06ee870…` fuera de `/etc/nginx` con rollback ejecutable (no ejecutado), diff T19 = 2 hunks, y todos
los prohibidos con hash idéntico (`iptv-limit-conn`, `nginx.conf`, `ape_uhd.lua`, cron, lista servida, timers).
Observaciones no bloqueantes: **OBS-1** el diff del dump *vivo* son 3 hunks porque incluye el de T22 (el de T19 son
2; declarado fuera de review); **OBS-2** el `.bak` es 644 dentro de un dir 700 — protección efectiva por directorio,
`chmod 600` queda a decisión del owner; **OBS-3** el `error_ratio 0.4286` del health es el veneno de nuestras sondas
(D-67), no de T19. Entregable `T19_REVIEW.md` 12.050 B / `DCF24616…` verificado.

## D-75 · Identidad del artefacto: BLOB LF vs CHECKOUT CRLF (y regla de despliegue)

Medido y confirmado por dos lanes: `git show 4c24d48:…/ape_hls_generators.php` = **BLOB 39.745 B ·
`E8FC25137771F87D63EBD08059DC6D57A772C510ADC6AEED8777A1CE5D0AF72A` · oid `4127f017…`** (LF, 0 CR); el working
tree Windows = **40.501 B · `C2332FBD…458B`** (CRLF 756+756 por `core.autocrlf=true`). Es el **mismo contenido**.
Decisión: **lo que se hashea para despliegue es el blob LF** (`git cat-file blob <oid>` o `git show <commit>:<path>`
con lectura binaria); **prohibido** scp/hash del checkout Windows como si fuera el artefacto de git. `.gitattributes`
(`*.php text eol=lf`) **se difiere al owner**: aplicarlo ahora cambiaría el checkout de todos los PHP y ensuciaría el
working tree de las 4 sesiones activas a mitad de campaña; si se adopta, va en una sesión dedicada con re-checkout y
verificación de que no se pierde WIP.

## D-76 · El error de C2 en T27 fue MÍO: hashing por tubería de texto inserta CRLF

Mi criterio decía «blob = 40.501 B / `C2332FBD…`» y era **falso**: describía el checkout CRLF, reproducido al pasar
`git show` por una redirección de texto de PowerShell (que convierte LF→CRLF). `excel-ssot` lo detectó y lo demostró
normalizando a LF. Decisión: **asumo el error** y queda como regla systemic: **todo hash byte-nivel se calcula con
lectura binaria** (`git cat-file`, `execFileSync({encoding:'buffer'})`, `Get-Content -Raw` sólo para texto), **nunca**
a través de una tubería de texto. Se aplica a todos los `verify` futuros y a los ledgers (`D-65`, `REMEDIATION_LOG_T23.md`,
`VERIFY_OUTPUT_T23.md`) que deben registrar **ambas** identidades y decir cuál se compara contra el VPS.

## D-77 · T29 cierra la identidad: registro definitivo y corrección de un dato mío

Verificado por el capitán con extracción **binaria** del blob (no tubería de texto): `4c24d48:…/ape_hls_generators.php`
= **39.745 B · `E8FC2513…F72A` · oid `4127f017…` · CR=0 / LF=756**; el checkout Windows = **40.501 B · `C2332FBD…458B`**
(CR=756 / LF=756); diferencia = 756 B = exactamente los CR de `core.autocrlf=true`. Regla vigente (D-75): **se
despliega/compara el BLOB LF**; prohibido hashear o scp del working tree Windows, y prohibido `git show … > fichero`
con redirección de texto. `.gitattributes` sigue **sin crearse** (diferido al owner).

El harness ahora acepta `$argv[1]` y declara siempre la identidad evaluada. Corridas verificadas por el capitán:
**BLOB → PASS=52 / FAIL=0 / exit 0** y **WORKTREE → PASS=52 / FAIL=0 / exit 0**.

**Corrección de un dato mío**: dije que el 52/0 de T23 «ya se había corrido contra el blob»; **no era exacto** — T23
corrió contra el working tree y quien corrió contra el blob fue T27. T29 ejecutó **las dos** por separado en vez de
heredar mi afirmación: correcto. No se toca código de producción, no se crea `.gitattributes`, `DECISIONES.md` no se
editó desde la lane del miembro (lo hago yo aquí).

## D-10 · Registro y trazabilidad

Cada decisión nueva se añade aquí con ID incremental (`D-11`, `D-12`, …) indicando: contexto, decisión, evidencia,
quién la ejecuta y cómo se verifica. El tablero y `notices.jsonl` reflejan el estado; este archivo es la fuente
de la **decisión**, no del detalle técnico (ese vive en `audit/alignment/2026-10-25/**`).

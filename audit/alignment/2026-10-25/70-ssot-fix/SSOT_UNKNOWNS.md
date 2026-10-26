# SSOT_UNKNOWNS — Lo que la remediación deja como UNKNOWN declarado (t12)

Un UNKNOWN no es un PASS. Se documenta con **motivo**, **qué falta** y **quién puede cerrarlo**.
Ningún valor de esta lista se ha inventado.

| ID | UNKNOWN | Estado en el JSON | Motivo (medido) | Quién lo cierra |
|---|---|---|---|---|
| **UNK-01** | `settings.fps` sigue en `"120"` aunque el fps que soporta el nivel es 60/30 | `profiles_calibrated.P0..P5.settings.fps = "120"` (sin cambio) · `settings.targetFps = "120"` | Es la celda canónica `6_NIVEL_2_PROFILES!X32` (y `X51`) y la **aceptación vinculante** exige `lab_master_repo.totalDiffs === 0` sobre esa celda. El fps declarado al player se corrigió en `X-Stream-FPS` (§3 del fix log). **Riesgo:** `APP_SSOT_BINDINGS` (t6) documenta que el emisor calcula `FRAME-RATE=` desde `settings.fps` (`ape-profiles-config.js` → `__apeStreamTruth({profileFps})`, L10322 → L2516), así que **hasta que la APP lea `X-Stream-FPS`, el `FRAME-RATE` emitido puede seguir saliendo 120** | **t11 (APP)**: cambiar el binding a `headerOverrides["X-Stream-FPS"]` (o clampar por capacidad). Si el capitán prefiere que el JSON lleve `settings.fps` = 60/30, es 1 línea: `apply_ssot_fix.mjs` ya tiene la tabla; pero entonces el gate vinculante deja de ser 0 (6 diffs en `X32`), y eso debe decidirlo el capitán |
| **UNK-02** | `chroma_subsampling` = `null` en 6/6 | `P0..P5.settings.chroma_subsampling = null` | El Excel canónico (`!B40..!G40`) trae el artefacto `"168055555555556"` (float perdido). No hay evidencia de 4:2:0 vs 4:2:2 vs 4:4:4 por perfil; **no se inventa**. `null` es explícito, no un valor falso | **Owner / t4**: corregir la fila 40 del Excel y re-exportar; después, propagar el valor real (ticket E-2) |
| **UNK-03** | P0 (DV) fps: `UNKNOWN` doctrinal | `P0.headerOverrides["X-Stream-FPS"] = "30"` + `settings.codec_full = "dvh1.08.06"` | `dvh1.08.06` lleva *level idc* `06` = HEVC level 6.0 → 8K@30 en la tabla del repo, pero el manifiesto declara 8K@**120** para P0. No hay modelo de capacidad para Dolby Vision en el repo, así que no se declara PASS | **t4/doctrina**: precisar la semántica del nivel DV (¿el `.06` es nivel HEVC o campo DV propio?) y, si aplica, corregir el manifiesto. Mientras tanto el SSOT declara 30 (capacidad conservadora) en vez de 120 (imposible) |
| **UNK-04** | Contradicción de la hoja en P1: `!C37` vs `!C350` | `P1.settings.codec_full = "hvc1.2.4.L153.B0"` (sigue `C37`) · `P1.headerOverrides["X-Stream-Codecs"] = "hvc1.2.4.L153.B0,ac-3"` (**no** sigue `C350` = `av01.0.15M.10`) | La hoja canónica se contradice en el mismo perfil. D-22 fija `C37`; reintroducir AV1 8K está prohibido. El JSON no puede coincidir con las dos celdas | **t4 (Excel)**: decidir cuál manda y corregir la otra (ticket E-4). Cuando la hoja quede coherente, el JSON la seguirá con 1 cambio |
| **UNK-05** | Nivel real del bitrate medio | `P1..P5.settings.avgBitrateKbps` = `maxBitrateKbps` (igualados) | El Excel declara `avg > max` (imposible: `AVERAGE-BANDWIDTH > BANDWIDTH`). Se igualó a `max` **sin inventar** una cifra. El valor real de `avg` (ratio 0,75–0,78 que el propio perfil declara en `settings.avg_bandwidth_ratio`) no está validado por el Excel | **t4 (Excel)**: corregir `K49/K50` (ticket E-3). Después se puede recalcular `avg = round(max × avg_bandwidth_ratio)` con evidencia |
| **UNK-06** | P2 no se emite en el catálogo vigente | SSOT P2 corregido (4K, `X-Stream-FPS` 30, `avg` 25000) | N3 del capitán: **0 `STREAM-INF _P2`** en el catálogo actual. Corregir el SSOT no cambia lo que se sirve | **t8/t7 (listas/VPS)**: la emisión de P2 depende del generador y de las listas, no del JSON |
| **UNK-07** | Etiqueta duplicada P1/P2 (`"4K UHD"`) | `P1.name = "4K UHD"` · `P2.name = "4K UHD"` · `P2.role = "4K UHD (L150 4K@30)"` | El Excel se contradice en P2 (`!D8` = `"2K QHD"` vs `!D10` = `"4K"` y `!D25` = 4K). Se tomó la mayoría (2 celdas) y una cadena existente en el canónico (`C8`) para no mentir sobre la resolución; quedan dos perfiles con la misma etiqueta | **t4 (Excel)**: unificar `D8` (ticket E-5). Si el capitán prefiere una etiqueta única por perfil, basta cambiar `P2.name` (1 línea) |
| **UNK-08** | `headerOverrides["X-APE-FPS"]` sigue en `"120,120,120,120"` | sin cambio | Es la **escalera de capacidad del cliente** (fila 137 del Excel), no el fps del stream; cambiarla la desalinearía de `!X137` sin evidencia de que el cliente no soporte 120 | **t11/doctrina**: decidir si esa escalera se recorta por nivel de códec |
| **UNK-09** | `contracts/verify_contracts.mjs` falla (1/11) | no depende del JSON | `_vps_stage/tests/fanout_concurrency.sh` está modificado en el working tree por **otra sesión** y el contrato lo tiene pinado (`9b774bff…` vs `b558b1cd…`). Idéntico antes y después de mi cambio | **Capitán / dueño de `_vps_stage`**: re-pinar el contrato o revertir ese archivo. Ajeno a t12 |

---

## Lo que NO quedó UNKNOWN (para que no se reabra)

- `profiles_calibrated` = exactamente P0..P5, sin huecos (`profiles_exactly_P0_P5: true`).
- Cero niveles imposibles en los 6 perfiles **en la terna que se declara al player** (`ZERO_IMPOSSIBLE_LEVELS`,
  `impossible_count = 0`; el único `UNKNOWN` es P0/DV y está arriba).
- `name` ↔ `resolution` coherentes en 6/6.
- `chroma_subsampling` ya no es el string roto.
- `avg ≤ max` en 6/6.
- Placeholders `prisma.*` usados **y** registrados (F-08 no era un defecto del JSON).
- Gate vinculante: `lab_master_repo.totalDiffs === 0`.
- `servers[]`, `nivel1_directives`, `nivel3_per_layer`, `evasion_pool`, `config_global`, `placeholders_map`,
  `dnr_calibration`: intactos.

---

## UNK-10 (t26) — `contracts/verify_contracts.mjs` en FAIL: **BLOCKED_BY_OWNER** (L-004/L-007)

| Dato | Valor |
|---|---|
| Resultado | `RESULT=FAIL (1 fallos, 11 ok)` · exit 1 · **idéntico antes y después** del fix de t12 |
| Único fallo | `SHA MISMATCH _vps_stage/tests/fanout_concurrency.sh: contrato 9b774bffbe6c744f… vs real b558b1cdff883579…` |
| ¿Pina el contrato `lab_master`? | **NO** — 0 coincidencias de `lab_master` en `contracts/crystal_contracts.json` ⇒ la edición del SSOT no puede influir |
| Causa | Drift **ajeno**: `git status --porcelain -- _vps_stage/tests/fanout_concurrency.sh` → ` M` (otra sesión lo modificó) |
| Quién lo cierra | **Owner del contrato / dueño de `_vps_stage`**: re-pinar el artefacto tras revisar el cambio, revertir el archivo, o excluirlo del contrato |
| Estado | **`BLOCKED_BY_OWNER`** — no es un defecto del SSOT ni de t12; no se tocó `contracts/**` ni `_vps_stage/**` |

## UNK-11 (t26) — El bloque `Verify:` del contrato está malformado (**D-61**)

El `Verify:` original venía como **un solo renglón** con tres comandos y **comillas desbalanceadas** en el primero
(`node -e "…console.log('SSOT_COHERENCE_OK'); node -e "…"`), de modo que **no es ejecutable literalmente** y, tomado
como un único comando, mediría algo distinto de lo pretendido. **Constancia:** los tres comandos se ejecutaron por
separado (los tres con exit 0 salvo el del contrato, que arrastra UNK-10) y **el bloque roto no se usó como
evidencia** en ningún entregable. **Quién lo cierra:** el capitán, partiendo el `Verify:` en tres líneas
independientes o envolviéndolo en un `verify.sh` con `set -e`.

## UNK-12 (t26 · intento 2) — Rungs AV1 dentro de las listas de soporte: preexistentes, intención no verificada

| Dato | Valor medido |
|---|---|
| Hecho | El archivo contiene **19** apariciones de la cadena `av01`, **todas** en listas de soporte/prioridad: `settings.codec_priority`, `vlcopt.codec-priority`, `headerOverrides["X-APE-CODEC"]`, `headerOverrides["X-Codec-Support"]` |
| Lo que **no** ocurre | `settings.codec_full` **nunca** es AV1: P0 `dvh1.08.06` · P1–P4 `hvc1.2.4.L*` · P5 `avc1.42c01e`. ⇒ **no se reintrodujo AV1 8K como códec declarado** (D-22/D-34 respetados) |
| ¿Las introdujo el fix de t12? | **No.** Verificado campo por campo contra el respaldo: `P0.headerOverrides["X-APE-CODEC"]` y `P1.headerOverrides["X-APE-CODEC"]` son **byte-idénticos** pre y post (`av01.0.21M.10…,dvh1.08.06,hvc1.2.4.L186.B0` y `dvh1.08.06,hvc1.2.4.L153.B0,hev1.2.4.L153.B0,av01.0.15M.10`) |
| Qué queda UNKNOWN | Si el **orden** de esa lista (P0 empieza por `av01.0.21M.10` aunque el perfil se declara DV) es intencionado. No está entre los 24 campos del gate ni entre los 22 del cruce Excel, así que **no hay celda canónica contra la que juzgarlo** |
| Estado | **UNKNOWN declarado** — fuera del alcance de t12/t26; no se cambia sin evidencia (sería inventar doctrina) |
| Quién lo cierra | **t4/t11 + doctrina**: decidir si `X-APE-CODEC`/`X-Codec-Support` deben ordenarse por el códec del perfil o por preferencia del decoder; si se decide, el cambio es de 1 campo por perfil |


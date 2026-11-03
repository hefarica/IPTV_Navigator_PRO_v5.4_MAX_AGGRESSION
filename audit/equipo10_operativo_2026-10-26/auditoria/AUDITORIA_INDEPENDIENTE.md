# AUDITORÍA INDEPENDIENTE — paquete `equipo10_operativo_2026-10-26` (t12 / i4)

**Auditor:** `s9-player-compat` · **Fase:** Auditoría · **Fecha:** 2026-10-26 · **Snapshot auditado:** `git HEAD e38a89b` (`e38a89bb30c02cb41050f34cef43d3711a2b0644`)
**Objeto:** `consolidado/{CONSOLIDADO.md,SCORECARD.json,RIESGOS_TOP.md,INTEGRIDAD_DE_INFORMES.md}`, `council/*.md` (8), `verificacion/{HARNESS.json,VERIFICACION.md,run_checks.ps1}`, `snapshot/*` (21 blobs + 4 JSON/MD), `adn/*` (4).

---

## 0. Conflicto de interés y recusación (declaración obligatoria)

| Capítulo | Autor | ¿Auditado aquí? | Motivo |
|---|---|---|---|
| S1, S2, S3+S4, S5, S6, S7+S10 | otros miembros | **SÍ** | no soy autor |
| **S9** (`council/S9_player_compat.md`) | **`s9-player-compat` (yo)** | **NO** | **AUTOR — no autovalidado**; lo valida el capitán en [`gobierno/VALIDACION_DEL_CAPITAN.md`](gobierno/VALIDACION_DEL_CAPITAN.md) |
| `consolidado/*` (t11) | `s5-qoe-qos` | SÍ | no soy autor del consolidado |

**Recusación simétrica cumplida:** soy autor de S9 ⇒ no emito PASS/FAIL sobre su contenido. El capitán ya lo validó (FAIL, con 2 correcciones de cita: `HEAD:2458` en vez de `:2646` y `5/10` en vez de `4/10` para `Upgrade-Insecure-Requests`). **S5 sí lo audito**: su autor es `s5-qoe-qos`, no yo (directiva del capitán, punto 2).

---

## 1. Método y límites

- **Solo lectura** sobre lo ajeno. Escrituras: únicamente `auditoria/`. No ejecuté `verificacion/run_checks.ps1` porque **escribe** `HARNESS.json`/`VERIFICACION.md` (habría mutado el entregable auditado); en su lugar **re-ejecuté los comandos individuales** de los checks que muestreé.
- Sin VPS (prohibido por `iptv-vps-touch-nothing`), sin dispositivos de reproducción, sin generador en navegador.
- **Blob de referencia obligatorio:** HEAD `c1277bdf…` = `snapshot/m3u8-typed-arrays-ultimate.js.HEAD.blob` (**707.323 B / 11.144 L**, verificado contra `git rev-parse HEAD:<path>` y `git cat-file -s`).
- **El WT del generador mutó otra vez durante esta auditoría**: medido ahora **750.884 B / 11.644 L / `cc48195b` / `git diff --numstat` +505/−5** (el consolidado declaró 748.145 B / 11.594 L / `c1301f1f` / +455−5). Ninguna conclusión de este informe se apoya en el WT vivo.
- `git status --porcelain` al inicio: **59 entradas = 16 M / 3 D / 40 ??** (coincide con H01).

---

## 2. Control 1 — Muestreo de 18 afirmaciones (re-ejecutadas o releídas)

| # | Afirmación (origen) | Verificación ejecutada | Resultado medido | Veredicto |
|---|---|---|---|---|
| 1 | H01: HEAD `e38a89b`; status 59 (16/3/40) | `git rev-parse HEAD` + `git status --porcelain` | idéntico | **CONFIRMADO** |
| 2 | H02: `ape_header.lua` HEAD **byte-idéntico** a producción (`a15e1fe3…`, 2.210 B) | `Get-FileHash` del blob + `VPS_REALITY_MEASURED:80` | sha256 `a15e1fe3748f…6968`, 2.210 B ⇒ **coincide** | **CONFIRMADO** |
| 3 | H03: `ape_uri_rebase.lua` idem (`1d456a46…`, 6.043 B) | idem + `:81` | `1d456a463f9b…baf3`, 6.043 B ⇒ **coincide** | **CONFIRMADO** |
| 4 | H04: `vps/nginx/lua/` no contiene esos 2 `.lua`; "solo `ape_wake_on_manifest.lua`" | `git ls-tree -r e38a89b` | **no** los contiene ✓, pero el directorio tiene **29 archivos** ⇒ "solo" es impreciso | **PARCIAL** (AUD-09) |
| 5 | H05: producción 3 fases; repo cablea 7 | `VPS_REALITY:78-85` + `git grep -o -E '…_lua(_file)?'` (normalizando `_file`) | 3 fases medidas (`header_filter`/`body_filter`/`log`); repo = **7 fases normalizadas** (`init_by, rewrite_by, access_by, content_by, header_filter_by, body_filter_by, log_by`) | **CONFIRMADO** |
| 6 | H06: generador HEAD `c1277bdf`/707.323 B/11.144 L; "WT actual 11.594 L" | `git rev-parse`+`cat-file -s`+`ReadAllLines` | HEAD ✓ exacto; WT **ya no** es 11.594 L (hoy 11.644 L, +505/−5) | **PARCIAL** (AUD-08) |
| 7 | H07: **2.574** URLs Xtream con `user:pass` en `channels_map.json` | `git grep -c` con el patrón declarado en S10 §8:162 (`https?://host:port/u/p/id`) | **2.582** líneas con `host:port/u/p/id`; pero el archivo tiene **9.293 canales** con credenciales embebidas (`url_m3u8`+`url_ts` = **18.586** campos), 3 servidores, 3 pares user/pass | **PARCIAL** (AUD-04) |
| 8 | H08: 72 emisiones tóxicas + 6 defaults + 27 `DNT` + 84 sitios | regex sobre el JSON + lectura de las 6 líneas + `git grep -c '"DNT"'` | **72** (12×6) ✓ · defaults exactos en `:4017,4018,4023,4024,4025,4040` ✓ · **27** `DNT` (12+13+1+1, excluido backup) ✓ · **84** = 12×7 ✓ | **CONFIRMADO** |
| 9 | H15: harness 21 checks, exit 1, 10 PASS/10 FAIL/1 NOT_RUN | lectura `HARNESS.json` + re-ejecución de C06 | 21/1/10/10/1 ✓ · `node -c` sobre **94/94** archivos ape-v9, 0 fallos ✓ · C19 FAIL (WT mutó) ✓ · C21 PASS ✓ | **CONFIRMADO** |
| 10 | §3 S1 = 8/12/0/2 sobre 22 filas | reconteo fila a fila de `S1:30-51` | 22 filas = **8 PASS / 12 FAIL / 0 / 2 NOT_RUN** ✓ (y X3 correcto: el autor declaró 20/FAIL 10) | **CONFIRMADO** |
| 11 | §3 S2 = 4/5/1/2 sobre 12 filas | reconteo de `S2:16-27` | 12 = **4/5/1/2** ✓ | **CONFIRMADO** |
| 12 | §3 S8 = 6/3/0/0 + 2 parciales sobre 9 filas | reconteo de `S8:27-35` | 9 filas = **4 PASS + 1 «PASS con drift» + 1 «PASS parcial» + 3 FAIL** ⇒ literal PASS = **4**, no 6; los 2 calificados se cuentan **dos veces** | **DESMENTIDO** (AUD-03) |
| 13 | §3 S10 = 2/4/0/1 + 1 WARN sobre 8 filas | reconteo de `S7_S10:149-156` | 8 = **2 PASS / 4 FAIL / 0 / 1 NOT_RUN + 1 WARN** ✓ | **CONFIRMADO** |
| 14 | X6: S3 34 declarados vs 32 contados; S4 24 vs 23 | lectura `S3_S4:207-208` | 34 = 15+12+5 **no cierra** (faltan 2); 24 = 8+11+4 **no cierra** (falta 1) ✓ | **CONFIRMADO** |
| 15 | S5 §6.1: 9 citas de métricas fabricadas en el emisor | lectura del **blob HEAD** líneas 5949,5950,5754,8624,8626,8628,8639,8918,8919,9248-9251 | **todas exactas**: `VSTQ/VSMQ/EPSNR`, `TR101290` en cero, `MOS=4.8`, `PSNR=42`, `SSIM=0.99`, `STARTUP=0`, `ZAPPING<30ms`, `X-Metrics-Endpoint` a `qos.edge-cdn.net` | **CONFIRMADO** |
| 16 | S5-02: `qoe_score` = stub de 5 constantes consumido como «QoE REAL»; productores QoE no desplegados | `conviva_qoe_server.php:168,210-236`; `ape_mesh.php:113-115,181`; `VPS_REALITY:131` | `computeStubQoE()` llamado en `:168`, `switch($type)` `:210-236` ✓; `ape_mesh:113-115` lo rotula «QoE REAL … REALES» y `:181` hace `100 − qoe_score` ✓; `qoe_server_side_observer` + `qoe_flush_worker` figuran en los **22 módulos nunca desplegados** ✓ | **CONFIRMADO** |
| 17 | S5-04: el `channel_id` de segmento no matchea la forma Xtream del manifiesto | lectura `qoe_server_side_observer.lua:48-50` | manifiesto: `/live/[^/]+/[^/]+/(%d+)%.m3u8` · segmento: `/(%d+)/[^/]+%.ts` ⇒ `/live/u/p/12345.ts` **no** matchea, cae a `"unknown"` ✓ | **CONFIRMADO** |
| 18 | Citas puntuales de S10/S8/S3 | relectura directa | `prisma-control.php:32-51` fail-open **exacto** (`:43-45` y `:47-49` ⇒ `return true`; `:36-38` cualquier Bearer ⇒ `true`) ✓ · `99-iptv-shield.conf:52`=131072 y `:103`=16384 ✓ · `ape-fallback-resolver.js:238` = `probeData.videoCodec \|\| 'hvc1.2.4.L150.B0'` ✓ · `ape-field-homologator.js:98` mapa `TOXIC` ✓ | **CONFIRMADO** |

**Balance del muestreo:** 18 re-verificaciones → **14 confirmadas**, **3 parciales** (AUD-04/08/09), **1 desmentida** (AUD-03). Ninguna afirmación del consolidado resultó inventada.

---

## 3. Control 2 — Trazabilidad (¿cada afirmación apunta a informe o `check_id`?)

| Bloque | ¿Tiene puntero? | Huérfanas |
|---|---|---|
| §3 tabla maestra (9 dimensiones) | Sí: columna `Informe` + `counts_basis` con líneas | — |
| §4 H01–H15 | Columna `Fuente` | **H01** (`git rev-parse`/`git status`), **H04** (`git ls-tree`), **H06** («medición de hoy») → comando sin `S*`/`check_id`; **H02/H03** apuntan a un doc de tercero (`VPS_REALITY:80-81`), no a un informe ni a un check (AUD-07) |
| §5 X1–X10 | Columna `Causa medida` | — (todas con causa; **ninguna resuelta «por decreto»**; X2 declara disenso abierto) |
| §6 disensos D1–D9 | Sí: ID de origen (`S1-D1`, `S3-D-S3-1`, …) | — |
| §7 T1–T13 | No por ID de hallazgo (referencian el tema) | Parcial: T1/T2/T3 citan C11–C16/S10/S9; T4–T13 describen el defecto sin ID (aceptable como backlog, no como evidencia) |
| `RIESGOS_TOP.md` | Sí: `Evidencia` + `blob` por fila (10/10 + 5 extra) | — |

**Defecto mayor de trazabilidad (AUD-01/AUD-02):** `council/S1_hls_m3u8.md` cita líneas que **no existen en HEAD ni en el WT actual** y cuyo contenido no coincide:
`F09` cita `m3u8…js:2701, 9634, 13008, 19941` — en HEAD **:2701** es una línea de `SESSION-DATA` de audio, **:9634** es `EXT-X-APE-LLHLS-BLOCK-RELOAD`, y **12.930 / 13.008 / 19.941 no existen** (HEAD 11.144 L; WT 11.644 L).
`F11` cita `:12930` (no existe). `F14` cita `:10147` — en HEAD es `buildCredentialsMap`, no un `findIndex`. `F16` cita `:6538` — en HEAD es un comentario, no `HDCP-LEVEL`.
**La sustancia de S1 se sostiene** (verificado: `EXT-X-I-FRAME-STREAM-INF` en HEAD **:2764 y :9617, ambos sin `URI=`**; `VERSION:9` en **:2355/:2690/:2740**; `TARGETDURATION:2`+`PART-INF`+`SERVER-CONTROL` en **:2693-2695**), pero **sus coordenadas no son reproducibles**. Y `CONSOLIDADO §1` afirma que *solo* `S1-F01/F02` salen del WT histórico de 21.581 L: **es falso** — hay al menos 6 citas de S1 que solo caben en ese render no conservado (AUD-02).

---

## 4. Control 3 — Snapshot, coordenadas de blob y regla de origen

| Verificación | Resultado |
|---|---|
| Cada cita del generador declara blob | **NO en S1** (AUD-01/02). S2/S3/S8/S10 sí declaran (`HEAD tree`, `c1277bdf`, WT congelado `20ac4b26`/`23b25b03`/`393635c2`). S9 declara «WT vivo» (coordenada no reproducible — **recusado en contenido**, AUD-06) |
| El blob citado existe en `snapshot/` con el SHA-256 declarado | **SÍ**: `m3u8…HEAD.blob` = 707.323 B / 11.144 L y `git rev-parse HEAD:<path>` = `c1277bdf…`; los 8 `.HEAD.blob` verificados por C18 (=8/8) y re-verificado aquí para los 2 `.lua` (a15e1fe3 / 1d456a46) |
| `SNAPSHOT.json` ↔ disco | **SÍ**: 8 rutas, `head_bytes`/`head_lines` coinciden con lo medido; `wt_sha256` válido para su `captured_at` (hoy obsoleto: WT mutó, X10 correcto) |
| ¿Algún conteo suma dimensiones medidas en blobs distintos? | **SÍ** (AUD-05): el total **138** suma S6 (WT congelado 23b25b03/393635c2), S3 (WT 20ac4b26) y S9 (WT vivo) con S1/S2/S8/S10 (HEAD tree). `REGLA_DE_ORIGEN §2.2` lo prohíbe expresamente |
| `S1-F01` figura como histórico y no como vigente | **SÍ** en `CONSOLIDADO §1:41` y `SCORECARD.blob_coordinates.wt_historico_no_conservado` ⇒ **PASS de la condición**. Matiz: sigue contado en el FAIL de S1 (AUD-10) |

---

## 5. Control 4 — Integridad de informes (recalculada por mí)

| Informe | Bytes | Hash real (recalculado) | Declarado | Estado |
|---|---|---|---|---|
| S1, S2, S3+S4, S9 | 15.856 / 21.886 / 23.240 / 16.532 | `ce5edb57…`, `13525923…`, `19758f61…`, `aea36c77…` | — | **8/8 coinciden con `REPORT_HASHES.json`** (bytes incluidos) |
| S5 | 22.022 | `583c36d6…c1abb` | prefijo `583C36D6` | prefijo **coincide** · sufijo **NO VERIFICADO** (AUD-11, ni PASS ni FAIL) |
| S6 | 19.155 | `4888638f…feca` | completo | **VERIFICADO exacto** |
| S7+S10 | 27.553 | `b80402ab…8b94` | prefijo `b80402ab` | **VERIFICADO por prefijo** |
| S8 | 18.541 | `d2080129…04d4` | completo | **VERIFICADO exacto** |

**Consolidado (4 archivos):** hashes declarados por t11 → `c3091d13…` (CONSOLIDADO), `1d52ea54…` (SCORECARD), `dd9f7fd5…` (RIESGOS), `29c98cbf…` (INTEGRIDAD) ⇒ **4/4 prefijos coinciden** con mi recálculo.
**Discrepancias de integridad:** **0**. `INTEGRIDAD_DE_INFORMES.md` no miente.

---

## 6. Control 5 — Cero ficción

| Patrón | Resultado |
|---|---|
| CV / persona / certificación / «N años de experiencia» / PhD / seniority inventada | **0 hits** en `audit/equipo10_operativo_2026-10-26/**` (1 hit de «certificación» y 1 de «CV» son **negaciones** en `CONTRATO_DE_ORDEN.md:62` y `REEMPLAZO_DE_FICCIONES.md:65`; 1 de «score 30/20/15/15/20» es una fórmula **descartada**, `REEMPLAZO_DE_FICCIONES.md:79`) |
| Métricas sin fuente en el consolidado | **0**: las cifras de S5 fueron re-verificadas (muestra 15) y las de S8/S10 también (muestra 18). Las cifras que el propio repo fabrica están **reportadas como fabricadas**, no reproducidas como medición |
| Claims de despliegue/importación no ejecutados | **0 engañosos**: `RIESGOS_TOP` marca «exposición = hipótesis» (R-02), «estado en producción = NOT_RUN» (R-09), «operación = BLOCKED» (R-10); el ADN declara `no_verificado_por_el_miembro` y la validación ZIP figura como **NO** ejecutada |
| Verificación de que X1–X10 tienen causa (no decreto) | **PASS**: las 10 tienen columna «Causa medida»; X2 queda como disenso abierto, no como resolución |

---

## 7. Control 6 — Cero secretos en el entregable

Barrido sobre los **41 archivos** existentes en `audit/equipo10_operativo_2026-10-26/**` antes de crear `auditoria/` (43 al cierre, con mis 2 entregables), patrones: PEM, `PrivateKey=`, `PresharedKey=`, `--auth`, `password=`/`token=` con valor, base64 de 44:

| Patrón | Hits | Clasificación |
|---|---|---|
| Bloque PEM / `PrivateKey=` / `PresharedKey=` con valor | **0** | — (los 2 hits son la **descripción del patrón** en `VERIFICACION.md:42` y `run_checks.ps1:284`, no un valor) |
| `--auth user:pass` | 1 | **redactado** en `S7_S10:50` (`***`); los otros 3 son descripciones |
| `resolve.php:49 const TOKEN_SECRET = '***'` (también en los `.blob` de snapshot) | 1 | **NO es secreto**: 33 caracteres, **sólo mayúsculas, sin dígitos ni minúsculas** ⇒ identificador simbólico, no material criptográfico (las claves WG reales son base64 mixto de 44) — AUD-12 (INFO) |
| base64 44 | 6 | plantillas de código (`NTLM TlRMTVNTUAA…`, `Basic Og==`) — no credenciales |

**Ningún valor secreto fué impreso por esta auditoría.** Los 2.574/9.293 sitios con credenciales Xtream del repo **no** se copiaron al entregable (solo conteos).

---

## 8. Control 7 — Integridad del entregable (JSON y hashes)

- **6/6 `.json` parsean**: `EQUIPO_10_OPERATIVO.json`, `SCORECARD.json`, `SNAPSHOT.json`, `REPORT_HASHES.json`, `WT_DRIFT_LOG.json`, `HARNESS.json` (más `HALLAZGOS.json`, el 7.º, creado por mí y parseado al cierre).
- **8/8 hashes de informes** y **4/4 del consolidado** verificados (sección 5). **17 `.blob`** presentes (`C20` 3/3 artefactos + 17 blobs ✓).
- **`SCORECARD.json` — defecto aritmético** (AUD-03): S8 declara `pass 6` + `parcial 2` sobre 9 ítems, cuando la tabla tiene **4 PASS literales + 2 calificados**; el total global `pass 53` queda inflado en 2 (51 si se aplica la regla anti-suavizado que el propio archivo declara en `normalizacion_taxonomias`). Además **las dos reglas del §2 se contradicen**: `CONSOLIDADO:54` mapea «PASS con reserva/parcial/drift → PASS + marca» y `CONSOLIDADO:57` dice que esos mismos ítems **no suman como PASS**. La aplicación real es **inconsistente entre dimensiones**: S6 y S9 excluyen su parcial del PASS; S8 lo incluye.

---

## 9. Control 8 — Veredicto por control (sin promedio)

| Control | Veredicto | Base |
|---|---|---|
| C1 · Muestreo 8–12 afirmaciones re-ejecutadas | **PASS** | 18 muestras con comando/lectura real; 14 confirmadas, 3 parciales, 1 desmentida (todas registradas) |
| C2 · Trazabilidad a informe/`check_id` | **FAIL** | AUD-01 (citas S1 inexistentes), AUD-02 (alcance histórico mal declarado), AUD-07 (huérfanas H01/H04/H06) |
| C3 · Snapshot/blob y regla de origen | **FAIL** | AUD-05 (total 138 suma blobs distintos), AUD-06 (coordenada «WT vivo»), AUD-10 (F01 contado pese a histórico). La condición «F01 histórico» **sí** se cumple |
| C4 · Integridad de informes | **PASS (condicionado)** | 8/8 reales = `REPORT_HASHES`; S5 sufijo **NO VERIFICADO** (AUD-11) — no se convierte en PASS ni en FAIL |
| C5 · Cero ficción | **PASS** | 0 CV/persona/cert/experiencia; 0 métricas sin fuente en el consolidado; despliegues no ejecutados declarados como tales |
| C6 · Cero secretos | **PASS** | 0 secretos reales; 1 constante simbólica (AUD-12, INFO) |
| C7 · Integridad JSON/hashes | **PASS** | 6/6 JSON; 8/8 + 4/4 hashes; 17 blobs |
| C8 · Veredicto por control sin promedios | **PASS** | este documento + `HALLAZGOS.json` |

### Veredicto global: **FAIL — el paquete NO es certificable como PASS**

No hay **blocker** (el paquete es usable internamente y ninguna afirmación resultó inventada), pero **3 HIGH abiertos** (AUD-01, AUD-02, AUD-03) impiden declarar PASS global: dos afectan la trazabilidad archivo:línea —la propiedad que el paquete declara como su valor central— y uno afecta la aritmética del scorecard y su propia regla de normalización.

---

## 10. Hallazgos

| ID | Control | Sev | Hallazgo | Evidencia |
|---|---|---|---|---|
| **AUD-01** | C2 | **HIGH** | `S1_hls_m3u8.md` cita líneas del generador que **no existen** (12.930 / 13.008 / 19.941) o cuyo contenido **no coincide** (:2701 SESSION-DATA, :9634 APE-LLHLS, :10147 `buildCredentialsMap`, :6538 comentario). La sustancia se sostiene, la coordenada no | `S1:38,40,43,45` vs HEAD `:2764,:9617,:2355,:2690,:2740,:2693-2695,:10147,:6538` |
| **AUD-02** | C2/C3 | **HIGH** | `CONSOLIDADO §1:38` afirma que **solo** `S1-F01/F02` provienen del WT histórico de 21.581 L; hay ≥6 citas de S1 que solo caben en ese render no conservado ⇒ el alcance «histórico» está subdeclarado y el lector no puede saber qué más de S1 es no reproducible | `CONSOLIDADO:38,41` vs `S1:38,40,43,45` |
| **AUD-03** | C7 | **HIGH** | `SCORECARD` S8: `pass 6` + `parcial 2` sobre 9 ítems = **doble conteo** de los 2 «PASS con drift/parcial»; `pass` global 53 → **51** bajo la regla anti-suavizado. Y `CONSOLIDADO:54` vs `:57` se contradicen sobre si «PASS con reserva» suma como PASS; S6/S9 lo excluyen, S8 lo incluye | `SCORECARD:170-178`, `CONSOLIDADO:54,57`, `S8:27-35` |
| **AUD-04** | C1/C3 | **MEDIUM** | H07 «2.574 URLs» es reproducible **solo** con el patrón `host:port/u/p/id` (declarado en `S7_S10:162`, omitido en el consolidado). La superficie real de credenciales es **9.293 canales** (18.586 campos `url_m3u8`+`url_ts`), 3 servidores y 3 pares user/pass ⇒ el «hecho confirmado» subestima 3,6× el pasivo | `channels_map.json` HEAD (72.839.863 B), reconteo propio |
| **AUD-05** | C3 | **MEDIUM** | El total **138** (y `pass 53`) suma dimensiones medidas en **blobs distintos** (S6 WT 23b25b03/393635c2; S3 WT 20ac4b26; S9 WT vivo) con HEAD tree ⇒ viola `REGLA_DE_ORIGEN:17`. El aviso de «granularidad heterogénea» (`CONSOLIDADO:164`) no cubre la mezcla de blobs | `CONSOLIDADO:63-77,164`, `REGLA_DE_ORIGEN:17` |
| **AUD-06** | C3 | **MEDIUM** | `SCORECARD` declara para S9 el blob «WT vivo» (no reproducible). Su contenido lo valida el capitán (soy autor, recusado), pero la **coordenada** incumple la regla 1 de `REGLA_DE_ORIGEN` y debe sustituirse por `HEAD c1277bdf` en la próxima ronda | `SCORECARD:199` |
| **AUD-07** | C2 | **LOW** | Huérfanas de trazabilidad: H01, H04, H06 se apoyan solo en comandos; H02/H03 en un documento de tercero, no en un informe `S*` ni en un `check_id` del HARNESS | `CONSOLIDADO:90,93,95,91-92` |
| **AUD-08** | C1 | **LOW** | H06 «WT actual 11.594 L / `c1301f1f`» ya es falso: hoy **11.644 L / `cc48195b` / +505−5**. El documento advierte que el WT no es estado, pero el hecho está redactado como actual | medición propia 2026-10-26 10:5x |
| **AUD-09** | C1 | **LOW** | H04 dice «solo `ape_wake_on_manifest.lua`»; `vps/nginx/lua/` tiene **29 archivos**. La lectura correcta es «de las 3 fases desplegadas, solo esa está en `vps/nginx/lua/`» | `git ls-tree -r e38a89b` |
| **AUD-10** | C3 | **LOW** | `S1-F01` está marcado histórico/superado, pero **sigue contado** en el FAIL de S1 (12). Sin efecto en el veredicto (11 FAIL vs 8 PASS seguiría siendo FAIL), pero infla el conteo en 1 | `CONSOLIDADO:41` vs `:65` |
| **AUD-11** | C4 | **INFO** | Hash de S5: prefijo `583C36D6` coincide; sufijo **NO VERIFICADO** (nadie publicó el hash completo; el `.md` no lo contiene). Correctamente tratado como NO VERIFICADO, ni PASS ni FAIL | `REPORT_HASHES:39-45`, `INTEGRIDAD:16` |
| **AUD-12** | C6 | **INFO** | `TOKEN_SECRET` (constante de 33 caracteres en mayúsculas, sin dígitos/minúsculas) está copiada en los `.blob` de snapshot; **no es secreto** por clasificación, pero es un literal hardcodeado en 8 archivos trackeados: conviene moverlo a entorno | `frontend/vps/resolve.php:49` (valor `***`) |
| **AUD-13** | C5 | **INFO** | X1–X10: **10/10** registradas con «causa medida»; **ninguna resuelta por decreto** (X2 queda como disenso abierto). Control positivo, no defecto | `CONSOLIDADO:108-121` |

---

## 11. Lo que esta auditoría NO verificó (declarado, no PASS)

1. **Contenido de S9** (mi capítulo) — recusado; validado por el capitán en `gobierno/VALIDACION_DEL_CAPITAN.md`.
2. **Producción/VPS** — sin acceso por contrato (`iptv-vps-touch-nothing`); todo lo del host es de tercero (`VPS_REALITY_MEASURED_2026-10-25.md`) o `BLOCKED`.
3. **Reproducción en dispositivos** (TiviMate/OTT/VLC/Kodi/Smart TV) — `NOT_RUN`; prohibido inventar pruebas.
4. **`nginx -t` / `luac -p`** — host Windows sin nginx ni Lua ⇒ `NOT_RUN` (coincide con C03 del harness).
5. **Re-ejecución completa del harness** — no ejecutada a propósito: escribe `HARNESS.json`/`VERIFICACION.md` (habría violado «solo lectura sobre lo ajeno»). Se re-ejecutaron sus comandos individuales muestreados (C04, C05, C06, C11, C12, C13, C14, C15, C18, C19, C21).
6. **Hash completo de S5** — no existe en ningún artefacto del repo ⇒ `NO VERIFICADO`.

# EQUIPO_10_OPERATIVO — Paquete v2 (Ciclo 2, cierre al 2026-10-27)

## ⛔ VEREDICTO DE CIERRE: **3/3 HIGH CERRADOS · el paquete NO es re-certificable como PASS**

Emitido por la auditoría independiente de cierre ([`ciclo2/auditoria/AUDITORIA_CIERRE.md`](ciclo2/auditoria/AUDITORIA_CIERRE.md), t17 / `s9-player-compat`). Se reproduce **sin suavizar**:

| HIGH del ciclo 1 | Veredicto | Base |
|---|---|---|
| **AUD-01** — citas de S1 a líneas inexistentes | **CERRADO** | 7/7 re-ancladas · **20/20 anclas** verificadas en `b7b59446` · sustancia 6/7 (F16 PARCIAL) |
| **AUD-02** — alcance histórico subdeclarado | **CERRADO** | 14 coordenadas `HISTÓRICO_NO_REPRODUCIBLE` · **4 SIN_BLOB** con `git cat-file -e` exit 128 en ambos revs · 9 mediciones enumeradas |
| **AUD-03** — SCORECARD sobrecuenta PASS | **CERRADO** | `SCORECARD_v2` = **49/68/2/15 = 134**; suma de filas = suma de los 5 grupos por blob; 7 calificados fuera; fila `S7_S10:151` demostrada como de S10 (sin doble resta) |

**Pero el paquete sigue sin poder declararse PASS**, por los hallazgos **nuevos** del cierre. Estado de cada uno *tras* la auditoría:

| ID | Sev | Hallazgo | Estado hoy |
|---|---|---|---|
| **CIERRE-01** | **HIGH** | `t14` cerró `VERSION:9` sobre una premisa **falsa** (creyó que el artefacto no existía). El artefacto **existe**: 459.587 B / 9.315 L, `VERSION:9`×1, `lcev`×10, `SUPPLEMENTAL-CODECS`×10, `I-FRAME`×10, y está **untracked** | **ABIERTO** → `ABIERTO_ARTEFACTO_NO_VERSIONADO`. Lo cerrado es `lcev`/`SUPPLEMENTAL-CODECS` **en el emisor** (0 ocurrencias en `b7b59446`); **`VERSION:9` en el artefacto sigue abierto** |
| **CIERRE-02** | MEDIUM | La documentación obligatoria publicaba **51/136** contra el **49/134** ratificado | **RESUELTO** (verificado en este turno): ambos documentos corregidos a las 00:25 del 27-oct — `.claude/commands/equipo-10-adn.md:62,107,163` y `docs/manifestos/EQUIPO_10_ADN_CONTEXTO_2026-10-26.md:57,103` ya dicen **49/68/2/15 = 134** |
| **CIERRE-03** | MEDIUM | `X1/X2` **invertido**: el paquete del 26-oct afirma HEAD==producción; en `d81ddb3` divergen **2 de 3 fases** (§3) | **ABIERTO como declaración**: `H02/H03` y la fila «descartado» de `RIESGOS_TOP §3` son **falsas en el snapshot vigente** ⇒ se declaran **HISTÓRICAS**, no se borran |
| **CIERRE-04** | LOW | Denominador de mi propio V5 | **ACEPTADO** — ver "Erratas declaradas" (§2) |
| **CIERRE-05** | INFO | `SCORECARD_v2` etiqueta S6 como «WT congelado» | **ACEPTADO**: esos blobs son ahora **HEAD `d81ddb3`** (no cambia números) |
| **CIERRE-06** | INFO | Anclas de `e38a89b` dadas por vigentes | **ACEPTADO**: en este README v2 quedan marcadas **HISTÓRICAS** |

### Números oficiales ratificados (no se recalculan aquí)

| Concepto | Valor |
|---|---|
| **Conteo ratificado** | **49 PASS · 68 FAIL · 2 BLOCKED · 15 NOT_RUN = 134** ítems con veredicto (S7 `null` fuera) |
| Escalera | 53 (crudo v1) → 51 (−2 S8) → 50 (−1 S9 C1) → **49** (−1 S10 `qoe-flush`) |
| Denominadores | **138** (crudo v1) · **136** (base 51, histórico) · **134** (ratificado) |
| Regla ratificada | Un PASS calificado —con reserva, condicionado o con drift— **no suma como PASS**, en cualquier dimensión |
| Fuente | `gobierno/VALIDACION_DEL_CAPITAN.md` §Apéndice (L41-58) + `ciclo2/correcciones/SCORECARD_v2.json` |

**El producto sigue roto aunque la trazabilidad esté cerrada.** Las violaciones RFC del emisor **vigente** siguen abiertas: `VERSION:9` (2664/3001/3053), `I-FRAME-STREAM-INF` sin `URI=` (3079/10005), `TARGETDURATION:2`+`PART-INF`+`SERVER-CONTROL` en cabecera de catálogo (3004-3006), `EXTINF:-1` (7163/8026). **Cerrar AUD-01/02/03 arregla la evidencia, no el generador.**

## 1. Snapshot de este paquete

| Dato | Valor |
|---|---|
| `git HEAD` | **`d81ddb3`** (`d81ddb3aa4badab054db3344b2b201d0663c4566`) |
| Blob del generador | **`b7b59446`** = 741.881 B / **11.688 líneas** |
| Snapshot del ciclo 1 (auditado por t12) | `e38a89b` / `c1277bdf` / 707.323 B / 11.144 líneas |
| `git status` | **serie medida: 50** (t14 y t17) → **52** (00:26, inicio de t18) → **51** (00:33, al sellar) = 11 M / 3 D / 37 ??. El WT lo está editando otra sesión: el conteo **no es un hecho estable** y se publica como serie, no como cifra única |

## 2. Erratas declaradas (incluida una mía)

| Documento | Errata | Acción |
|---|---|---|
| `ciclo2/correcciones/AUD-01_02_ANCLAS.md` **V5** (mío, t15) | Declaré «1 de 3 plantillas sin `START-DATE`». **Medido ahora: 2 de 4 sitios** — 3032 y **9880** carecen de `START-DATE`, y `drAttrs` (9870-9878) **nunca** lo empuja. El auditor lo marcó como CIERRE-04 y **tiene razón**: subconté el denominador y omití 9880 | **No se reescribe el documento**: t17 verificó su sha256 (`2656921d…`) y editarlo rompería esa evidencia. La errata vive aquí |
| `ciclo2/medicion/MEDICION_2026-10-27.md:82` (t14) | Declaró «2 CERRADOS» sobre el artefacto inexistente | Corregido por el capitán a **1 CERRADO (emisor) + 1 ABIERTO (artefacto)**; verificado por t17 con `Test-Path` |
| Documentación obligatoria | Publica 51/136 | **CIERRE-02, sigue abierto** — no se edita aquí porque está fuera del entregable |

## 3. Qué cambió entre `e38a89b` y `d81ddb3` (resumen del delta de t14)

Verificado en este turno: **19 commits**, **69 archivos** en `git diff --name-status`.

| Cambio | Antes (`e38a89b`) | Ahora (`d81ddb3`) |
|---|---|---|
| Generador | `c1277bdf` · 707.323 B · 11.144 L | **`b7b59446` · 741.881 B · 11.688 L** (+544 líneas) |
| Estado del generador en git | modificado en WT (WIP) | **commiteado**; WT == HEAD salvo EOL |
| `lcev.1.1.1` en el emisor | presente | **0 ocurrencias** (`SUPPLEMENTAL-CODECS` solo en 3 comentarios) |
| `HDCP-LEVEL="TYPE-1"` en STREAM-INF | literal fijo | parametrizado, default **`'NONE'`** (6910, 6885/6890/6895) — superviviente en 10157 |
| `git status` | 57 (16 M/3 D/38 ??) | **52 (13 M/3 D/36 ??)**, y 50 en la medición de t14/t17 |
| Harness | corrida ciclo 1 | A: exit **1** (9/11/1) · B: exit **1** (10/10/1) |
| Fases Lua vs producción | «HEAD byte-idéntico a producción» | **INVERTIDO**: `ape_header.lua` **8.088 B** (`10e87f32`) vs prod **2.210 B** (`a15e1fe3`); `ape_uri_rebase.lua` **9.930 B** (`0aa6c6d5`) vs prod **6.043 B** (`1d456a46`). Solo `ape_wake_on_manifest.lua` **2.284 B** (`6274fa82`) coincide en tamaño |

> **Nota de trazabilidad:** los identificadores `10e87f32`/`0aa6c6d5` son **blob ids de git**; los `23b25b03`/`393635c2`/`a15e1fe3`/`d9c6b65d` son **prefijos sha256 de archivo**. No se contradicen: son dos funciones de hash sobre el mismo contenido. La magnitud decisiva es el tamaño, que sí medí.

## 4. Vigencia del paquete del 26-oct

| Elemento | Estado | Qué usar |
|---|---|---|
| Veredictos por dimensión (S1–S10) | **SIGUEN VÁLIDOS** | `council/*` tal cual |
| Conteo de ítems | **HISTÓRICO** (53 crudo → 51 → **49**) | `ciclo2/correcciones/SCORECARD_v2.json` + `ERRATA_ARITMETICA.md` |
| Coordenadas del generador (`c1277bdf`, 11.144 L) | **HISTÓRICAS** para el emisor | `ciclo2/correcciones/AUD-01_02_ANCLAS.md` |
| `H02/H03` «HEAD == producción» | **FALSO hoy** (CIERRE-03) | re-emitir |
| `X1/X2` del consolidado | **HISTÓRICO**: el WIP se commiteó | declararlo |
| Hallazgos de S6 medidos sobre WT `23b25b03`/`393635c2` | esos blobs **son ahora HEAD** → aplican a `d81ddb3` | CIERRE-05 (INFO) |
| Backlogs del 26-oct: 72+6 emisores tóxicos, 9 materiales secretos, QoE fabricada, `wg0.conf` | **SIGUEN** (C11–C16 idénticos + S5 re-verificado 16/16) | `consolidado/RIESGOS_TOP.md` |
| Artefacto `audit_bulletproof_output.m3u8` | **ABIERTO** — existe, untracked | CIERRE-01 |

## 5. Índice de `ciclo2/`

| Ruta | Contenido | Autor |
|---|---|---|
| [`medicion/MEDICION_2026-10-27.md`](ciclo2/medicion/MEDICION_2026-10-27.md) | Congelamiento de `d81ddb3`, snapshot, status, re-run del harness (2 corridas) | t14 |
| [`medicion/DELTA_e38a89b_d81ddb3.md`](ciclo2/medicion/DELTA_e38a89b_d81ddb3.md) | Delta de 19 commits / 69 archivos | t14 |
| [`medicion/snapshot/SNAPSHOT_2026-10-27.json`](ciclo2/medicion/snapshot/SNAPSHOT_2026-10-27.json) | 11 archivos con blob/tamaño/líneas/sha256 del WT | t14 |
| [`medicion/snapshot/*.HEAD.d81ddb3.blob`](ciclo2/medicion/snapshot/) | **11 blobs congelados**, 11/11 byte-exactos contra `git cat-file -s` | t14 |
| [`medicion/HARNESS_2026-10-27.json`](ciclo2/medicion/HARNESS_2026-10-27.json) | Corrida A — exit 1 · 9/11/1 | t14 |
| [`medicion/HARNESS_2026-10-27_expectedHead.json`](ciclo2/medicion/HARNESS_2026-10-27_expectedHead.json) | Corrida B — exit 1 · 10/10/1 | t14 |
| [`correcciones/AUD-01_02_ANCLAS.md`](ciclo2/correcciones/AUD-01_02_ANCLAS.md) | Re-anclaje de 7 citas + `HISTÓRICO_NO_REPRODUCIBLE` + `SIN_BLOB` | t15 |
| [`correcciones/SCORECARD_v2.json`](ciclo2/correcciones/SCORECARD_v2.json) | Scorecard recalculado: 49/68/2/15 = 134 + escalera de reconciliación | t16 |
| [`correcciones/ERRATA_ARITMETICA.md`](ciclo2/correcciones/ERRATA_ARITMETICA.md) | Escalera 53→51→50→49 con la fila que causa cada paso | t16 |
| [`auditoria/AUDITORIA_CIERRE.md`](ciclo2/auditoria/AUDITORIA_CIERRE.md) | **Auditoría de cierre: 8 controles, 32 verificaciones, 6 hallazgos** | t17 |
| [`auditoria/CIERRE.json`](ciclo2/auditoria/CIERRE.json) | Veredictos estructurados AUD-01/02/03 + 6 hallazgos + vigencia | t17 |

## 6. Límites reales — lo NO verificado

| Qué | Estado | Causa |
|---|---|---|
| `nginx -t`, `systemd`, `wg`, `adb`, VPS en escritura | **NOT_RUN / BLOCKED** | Host Windows; `iptv-vps-touch-nothing` |
| Reproducción en dispositivo (TiviMate/OTT/VLC/Kodi/Smart TV) | **NOT_RUN** | Sin dispositivo disponible |
| Ejecución del generador y parseo con hls.js / ffprobe | **NOT_RUN** | El council es read-only |
| Identidad byte a byte de las fases Lua contra producción | **NO RE-MEDIDA aquí** | Sin acceso al VPS; se cita el tamaño del paquete del 26-oct |
| Explotabilidad de endpoints / fuzzing | **PROHIBIDA** | Regla ética del repo |
| Las 13 tareas del `CONSOLIDADO §7` | **BACKLOG** | Ninguna ejecutada |

## 7. Integridad de este paquete

- **68 ficheros** en el ZIP (69 entradas: 68 ficheros + 1 entrada de directorio): los **45** del paquete del 26-oct (44 del manifest v1 + su `MANIFEST_SHA256.json`) + **21** de `ciclo2/` + `README_CICLO2.md` + `MANIFEST_SHA256_CICLO2.json`. **Ningún informe se borró, renombró ni editó.**
- `MANIFEST_SHA256_CICLO2.json` lista **67** archivos (todos menos él mismo) con bytes + SHA-256 de `Get-FileHash`. Se **autoexcluye** por definición y se verifica aparte contra su propio hash.
- **Verificación de ida y vuelta:** ZIP descomprimido en `%TEMP%`, comparación archivo por archivo contra el manifest → resultado real en `../EQUIPO_10_ENTREGA_v2.json → verificacion_propia`.
- `EQUIPO_10_ENTREGA_v2.json` y el ZIP viven **fuera** de la carpeta empaquetada: el índice contiene el hash del ZIP y no puede viajar dentro de él.
- El paquete v1 (26-oct) y su ZIP se **conservan intactos** como evidencia de la ronda anterior.

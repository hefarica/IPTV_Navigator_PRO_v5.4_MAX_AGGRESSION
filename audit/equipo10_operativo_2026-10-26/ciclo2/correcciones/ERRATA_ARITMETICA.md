# ERRATA ARITMÉTICA — SCORECARD v1 → v2 (cierre AUD-03 / AUD-05)

**Tarea:** `t16` (ciclo 2) · **Autor:** `s5-qoe-qos` · **Fecha:** 2026-10-27
**Snapshot vigente:** `d81ddb3` (`d81ddb3aa4badab054db3344b2b201d0663c4566`) · **Council medido en:** `e38a89b`
**Alcance:** aritmética del scorecard y coordenada de blob. **No** se re-midió el contenido de los 8 informes: se contaron sus tablas y se verificó su identidad (8/8 sha256 idénticos a `snapshot/REPORT_HASHES.json`).
**Inmutable:** `consolidado/SCORECARD.json` **no se edita**. Este documento y `SCORECARD_v2.json` son la corrección.

---

## 1. Qué decía el v1

| Campo v1 (`consolidado/SCORECARD.json`) | Valor |
|---|---|
| pass / fail / blocked / not_run | **53 / 68 / 2 / 15** |
| ítems con veredicto | 138 `(= 53+68+2+15)` |
| ítems declarados por los autores | 144 |
| S8 | `pass 6` **y además** `counts_extra.parcial 2` sobre 9 filas ⇒ los 2 calificados contados dos veces (**AUD-03**) |
| Totales | una sola suma de 138 mezclando dimensiones medidas en blobs distintos (**AUD-05**) |

Contradicción interna del v1 (`CONSOLIDADO.md:54` vs `:57`): declaraba «PASS con reserva → PASS + marca» y a la vez «Parcial/WARN/dual nunca suma como PASS». S6 y S9 excluían su ítem parcial; S8 lo incluía.

---

## 2. Qué dice el v2 (`SCORECARD_v2.json`, sha256 `6099bd7e…660936`)

| Campo v2 | Valor |
|---|---|
| pass / fail / blocked / not_run | **49 / 68 / 2 / 15** |
| ítems binarios | **134** `(= 49+68+2+15)` |
| `calificados` (excluidos de los 4 counts) | **7** |
| ítems declarados por los autores | **144** `(= 134 + 7 + 3 sin veredicto)` |
| S7 | `counts: null` (sin tabla). **No se inventan** (ratificado: `VALIDACION_DEL_CAPITAN.md:29`) |
| Totales | **5 grupos por blob**. La suma 49/68/2/15 se publica solo como verificación aritmética, marcada «NO es un veredicto» |

Regla aplicada, sin excepciones: **un PASS calificado / parcial / condicionado / con reserva / WARN no suma como PASS**. Un veredicto dual se cuenta como FAIL (más restrictivo). Los veredictos por dimensión **no cambian** respecto del v1.

---

## 3. La escalera 53 → 49: la fila exacta que causa cada paso

La tarea pedía verificar **51**. Verifiqué 51 y **no se sostiene con la regla dura**: hay dos filas más, en otras dimensiones, con el mismo defecto que AUD-03 encontró en S8.

| Paso | pass | Δ | Fila exacta que lo causa | Por qué |
|---|---|---|---|---|
| 0 | **53** | — | `consolidado/SCORECARD.json` (v1) | punto de partida |
| 1 | **51** | −2 | `S8_red_tcp_quic.md:31` `**PASS con drift**` (tcp_notsent_lowat 131072→16384) · `:35` `**PASS parcial**` (rto_min 3/24 rutas) | AUD-03: eran PASS literales en el v1 |
| 2 | **50** | −1 | `S9_player_compat.md:96` C1 → `**PASS** (con reserva)` | calificado con reserva explícita; el v1 lo contó como PASS |
| 3 | **49** | −1 | `S7_S10_sre_seguridad.md:151` → `**PASS condicionado**` (qoe-flush.php, loopback-only) | «condicionado» = PASS con condición; regla 6 del `CONTEXTO §5` |

**Conclusión:** `51` es el número correcto **solo si** «PASS (con reserva)» y «PASS condicionado» se leen como PASS. Con la regla tal como está escrita, el resultado es **49**. Las dos filas son verificables de forma independiente en los informes; no hay margen interpretativo sobre el texto del veredicto.

> **Decisión pendiente del capitán (no la tomo yo):** ratificar **49** (regla uniforme) o ratificar **51** declarando una excepción explícita para esas 2 filas. `SCORECARD_v2.json` publica **49** en `pass` y deja la escalera completa en `reconciliacion_53_a_49` para que cualquiera de las dos lecturas sea reproducible sin re-contar.

**Filas ya excluidas correctamente en el v1** (no cambian): `S6_nginx_lua.md:59` `**Parcial**` · `S9_player_compat.md:101` `**PASS parcial**` · `S7_S10_sre_seguridad.md:155` `**WARN**` (prisma-conviva-event).

---

## 4. Totales agrupados por blob (cierre AUD-05)

| Grupo de blob | Dimensiones | pass | fail | blocked | not_run | calificados | binarios / declarados |
|---|---|---|---|---|---|---|---|
| HEAD tree `e38a89b` / HEAD blob `c1277bdf` | S2, S5, S8, S10 | 9 | 27 | 1 | 3 | 4 | 40 / 44 |
| Mixto: HEAD `c1277bdf` + WT congelado `20ac4b26` | S3, S4 | 23 | 23 | 0 | 9 | 0 | 55 / 58 |
| WT congelado `23b25b03` / `393635c2` | S6 | 8 | 3 | 0 | 0 | 1 | 11 / 12 |
| WT vivo — **coordenada no reproducible** (AUD-06); contenido re-anclado a HEAD por el capitán | S9 | 1 | 3 | 1 | 1 | 2 | 6 / 8 |
| WT histórico ~04:12 (21.581 L, **no conservado**) | S1 | 8 | 12 | 0 | 2 | 0 | 22 / 22 |
| **Suma de verificación (NO es veredicto)** | 9 con tabla | **49** | **68** | **2** | **15** | **7** | **134 / 144** |

- **S7 no aparece**: `counts: null`, excluida de todos los totales y declarada así.
- Los grupos **no son comparables entre sí** (`REGLA_DE_ORIGEN.md:17`): un ítem de S1 vive en un blob que ya no existe; un ítem de S6 vive en un WT congelado; S3/S4 mezclan HEAD y WT dentro de la misma dimensión.
- **138 ≠ 136 ≠ 134.** `138` (README:58) contaba como ítems los 2 calificados de S8; `136` es 51+68+2+15 (lectura de 51); `134` es 49+68+2+15 (lectura estricta). Ninguna de las tres es una suma de PASS: solo la primera cifra de cada fila lo es.

---

## 5. S5 en `d81ddb3`: los 3 hallazgos siguen ABIERTOS

Blob del generador en `d81ddb3`: `b7b59446` · 741.881 B · **11.688 líneas** (creció desde `c1277bdf`, 11.144 L ⇒ **las líneas del informe v1 ya no aplican**).

| ID | Pieza | Línea en `e38a89b` (informe) | Línea real en `d81ddb3` | Estado |
|---|---|---|---|---|
| S5-02 | `conviva_qoe_server.php` (`c6189d72`, 265 L) | `:210-236` | **`:210`** función · llamada **`:168`** · `return 40` **`:222`** · `return 25` **`:228`** · `final_qoe ?? 75` **`:231`** | **ABIERTO** |
| S5-02b | `ape_mesh.php` (`21fcf7e0`, 547 L) | `:113-115,181` | **`:113-115`** («QoE REAL») · **`:181`** `risk = 100 − qoe_score` · `:132` lee `rebuffer_duration_ms` | **ABIERTO** |
| S5-01 | generador | `:5949-5950`, `:8624-8641`, `:8918-8919`, `:9248-9251` | `VSTQ=50` **`:6080`, `:6281`, `:9007`** · `MOS=4.8` **`:9007`, `:9022`** · `PSNR=42` **`:9009`, `:9022`, `:9306`** · `SSIM=0.99` **`:9009`, `:9022`, `:9307`** · `STARTUP=0ms` **`:9011`** · `TR101290` en cero **`:6282`, `:5404-5406`** · `CORTEX-TELEMETRY` **`:9636`, `:9639`** · `X-Metrics-Endpoint` ajeno **`:6086`** | **ABIERTO** |

**No solo persisten: se multiplicaron.** En `d81ddb3` hay **6 sitios nuevos** de Telchemy/TR 101 290 en cero (`:5276`, `:5404-5406`, `:6172-6173`, `:7033`) que no existían en `c1277bdf`.

---

## 6. Qué NO cambia y qué queda abierto

- **Veredictos por dimensión:** idénticos al v1 (S1 FAIL · S2 FAIL · S3 WARN · S4 WARN · S5 FAIL · S6 PASS_CONDICIONADO · S7 WARN/BLOCKED · S8 WARN · S9 FAIL · S10 FAIL). Ningún FAIL se suavizó; el recálculo solo **baja** PASS.
- **AUD-03:** el v1 queda **ABIERTO en su causa y CERRADO en su corrección** (el v1 es inmutable; el v2 lo sustituye como referencia). El cierre completo exige ratificar 49 vs 51 (§3).
- **AUD-05:** **CERRADO** en forma — el v2 no publica suma única: publica 5 grupos por blob y marca la suma global como verificación aritmética, no como veredicto.
- **AUD-06 (S9):** aporto `blob_medido` (WT vivo, no reproducible) **y** `blob_validado` (HEAD `c1277bdf`, re-medido por el capitán en `gobierno/VALIDACION_DEL_CAPITAN.md:15-22`). No lo declaro cerrado: la re-anotación formal del informe es del capitán.
- **AUD-01/AUD-02 (S1):** siguen abiertos. Su grupo de blob es el WT histórico no conservado; el conteo 8/12/0/2 es el de su tabla, no reproducible hoy.

**Límites:** no edité `consolidado/SCORECARD.json`, no edité informes ajenos, no usé el WT vivo como fuente, no ejecuté el generador, no toqué el VPS. Los 8 informes del Council están byte-idénticos a `REPORT_HASHES.json` (8/8), así que el recuento se hizo sobre el mismo texto que midió el Council.

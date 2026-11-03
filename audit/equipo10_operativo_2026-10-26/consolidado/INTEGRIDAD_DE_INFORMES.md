# INTEGRIDAD DE INFORMES — hash declarado vs hash real

**Tarea:** `t11` (i3) · **Verificado por:** `s5-qoe-qos` · **Fecha:** 2026-10-26
**Fuente primaria:** `snapshot/REPORT_HASHES.json` (generado por t9 a las 04:31:18) · **Re-verificación propia:** `Get-FileHash -Algorithm SHA256` sobre los 8 informes ejecutada en este turno.
**Política:** un informe ajeno **no se edita**. Toda discrepancia se reporta aquí para que decida el capitán.

---

## 1. Tabla declarado vs real

| # | Informe | Bytes | Líneas | Hash declarado | Tipo | Hash real (este turno) | ¿Coincide? | Estado |
|---|---|---|---|---|---|---|---|---|
| 1 | `S1_hls_m3u8.md` | 15.856 | 98 | — | — | `ce5edb574414d65d31aa3f11ad4393261a13181d36c32fafdeb1de3b63f1699f` | n/a | **SIN DECLARAR** |
| 2 | `S2_llhls_cmaf.md` | 21.886 | 141 | — | — | `135259231def63c01b3eada00b33788a9c7dc896890159fff09b246908b6abd6` | n/a | **SIN DECLARAR** |
| 3 | `S3_S4_codec_color_hdr.md` | 23.240 | 211 | — | — | `19758f61f7c5c98375c120988c2f7f598a0c6fd815e524b38cf914317b30be78` | n/a | **SIN DECLARAR** |
| 4 | `S5_qoe_telemetria.md` | 22.022 | 153 | `583C36D6` (resumen al captain; el `.md` no lo contiene) | prefijo 8 | `583c36d66ab2fdebbd1f55f732ec5269b27a8fe71e2c04e967f08ebed31c1abb` | **prefijo SÍ** · sufijo **no verificable** | **NO VERIFICADO** (ni refutado) |
| 5 | `S6_nginx_lua.md` | 19.155 | 141 | `4888638FEA3B245395D556C7F80A37665A9F8E421B4911997AE5C002BCF0FECA` | completo 64 | `4888638fea3b245395d556c7f80a37665a9f8e421b4911997ae5c002bcf0feca` | **SÍ (exacta)** | **VERIFICADO** |
| 6 | `S7_S10_sre_seguridad.md` | 27.553 | 209 | `b80402ab` (resumen al captain) | prefijo 8 | `b80402abb7a22a1d569f43d501829dac3b821928e5a5405898fc47cc0e9b8b94` | **prefijo SÍ** | **VERIFICADO por prefijo** |
| 7 | `S8_red_tcp_quic.md` | 18.541 | 126 | `d208012952ad3942296bcf9d0e3e19f3a7acdc5d854709388d0bab96650404d4` | completo 64 | `d208012952ad3942296bcf9d0e3e19f3a7acdc5d854709388d0bab96650404d4` | **SÍ (exacta)** | **VERIFICADO** |
| 8 | `S9_player_compat.md` | 16.532 | 110 | — | — | `aea36c77b96673daaef3a1ea206b41bdca8caac0d6e1247f1a057a782e8cfb0f` | n/a | **SIN DECLARAR** |

**Resumen:** 8 informes · **4 con hash declarado** · **4 coinciden** (2 exactos + 2 por prefijo) · **4 sin declarar** · **0 discrepancias** · **0 informes que contengan su propio SHA-256 completo** (confirmado por t9 con regex `[0-9a-fA-F]{64}` → 0 matches; coincide con **C21 PASS** del harness: `con_hash_declarado=4 coinciden=4 sin_declarar=4 informes_que_contienen_su_propio_sha=0`).

---

## 2. Estado de integridad: **sin hallazgo de integridad**

Ningún hash declarado contradice al archivo en disco. Lo único pendiente es la **verificación del sufijo de S5**, que **no es verificable desde ningún artefacto del repo**: el resumen al captain trae el hash truncado (`583C36D6…C1ABB`) y el propio `.md` no contiene su SHA.

- **Estado correcto: NO VERIFICADO** — ni «coincide» (solo se probó el prefijo de 8 hex) ni «refutado» (no hay evidencia en contra).
- El prefijo `583C36D6` **sí** coincide con el archivo en disco.
- El sufijo `…C1ABB` **sí** coincide con el hash real que yo mismo calculé en este turno (`…d31c1abb`) — pero esa comprobación no es independiente: la hice sobre el archivo y contra el resumen que el propio autor envió. Queda como **dato del autor**, no como verificación de tercero.

---

## 3. Re-verificación contra el paso del tiempo (lo que sí cambió en el repo)

| Objeto | Estado en t9 (04:31) | Estado ahora (10:30) | Veredicto |
|---|---|---|---|
| Los 8 informes `council/*.md` | hashes en `REPORT_HASHES.json` | **idénticos byte a byte** (8/8) | **ESTABLES** — nadie editó informes ajenos después de t9 |
| Generador `m3u8-typed-arrays-ultimate.js` (WT) | congelado `da442864` · 743.883 B · 11.524 L | **748.145 B · 11.594 L · `c1301f1f` · mtime 08:18** | **MUTÓ** (≥7ª vez). C19 del harness lo detectó a las 04:33 (`ddce94ca`) y siguió mutando |
| `git status --porcelain` | 57 (16 M / 3 D / 38 ??) | **59 (16 M / 3 D / 40 ??)** | +2 untracked (artefactos de este equipo) |
| Blobs congelados en `snapshot/` | 17 `.blob` (8 HEAD + 9 WT) | presentes, **no reescritos** | **VÁLIDOS** para su `captured_at` |

**Consecuencia (regla de origen §3):** ningún hallazgo medido sobre el WT es reproducible hoy. Solo son estables los que se anclaron a **HEAD `c1277bdf`** / árbol **`e38a89b`** o a un blob congelado declarado (`23b25b03`, `393635c2`, `20ac4b26`, `2275dc5f`, `da442864`, `d29f62af`).

---

## 4. Hallazgos de integridad (0 bloqueantes)

| ID | Severidad | Hallazgo | Acción |
|---|---|---|---|
| I-01 | INFO (proceso) | **0 de 8 informes contienen su propio SHA-256.** La cadena de custodia depende de un resumen externo (`REPORT_HASHES.json`, producido por otro agente) | Aceptado: C21 lo declara PASS con esa misma salvedad. Recomendación para futuras rondas: que cada informe incluya su hash en la última línea |
| I-02 | INFO (proceso) | **4 informes no declaran hash** (S1, S2, S3_S4, S9). Su integridad se basa solo en el hash real calculado por t9 y re-verificado aquí | Aceptado: el hash real existe y es reproducible; falta la declaración del autor |
| I-03 | LOW (trazabilidad) | **S5 solo declaró prefijo de 8 hex** ⇒ su sufijo es **NO VERIFICADO** desde artefactos del repo | Registrado. No se corrige el resumen ajeno; el capitán decidirá si pide el hash completo |
| I-04 | MEDIUM (reproducibilidad) | **El WT mutó ≥7 veces** durante la auditoría (21.581 → 11.443 → 11.459 → 11.524 → 11.524 → 11.519 → 11.594 L). C19 = FAIL | Ya mitigado: existen 2 blobs WT congelados que **son** la prueba de la mutación. Los informes que citan el WT quedan históricos (X10 del consolidado) |

---

## 5. Lo que este documento NO hace

- **No corrige** ningún informe ajeno (prohibido por la tarea y por `iptv-omega-no-delete`).
- **No re-mide** el contenido de los informes: mide **su identidad** (bytes + sha256) y su estabilidad en el tiempo.
- **No declara PASS de integridad global**: declara 4/4 coincidencias sobre los declarados y 4 sin declarar; la ausencia de declaración **no** es un PASS.

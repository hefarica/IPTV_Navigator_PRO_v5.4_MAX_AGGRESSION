# EQUIPO_10_OPERATIVO_2026-10-26 — paquete de entrega

## ⛔ VEREDICTO GLOBAL: **FAIL** — este paquete NO es certificable como PASS

Veredicto emitido por la auditoría independiente ([`auditoria/AUDITORIA_INDEPENDIENTE.md`](auditoria/AUDITORIA_INDEPENDIENTE.md), t12 / `s9-player-compat`), que **manda sobre este README**. Se reproduce sin suavizar.

- **0 blocker** · **3 HIGH abiertos** · ningún informe fue borrado ni renombrado.
- No hay afirmación **inventada** (muestreo: 18 re-verificaciones → 14 confirmadas, 3 parciales, 1 desmentida).
- Lo que impide el PASS es la **trazabilidad archivo:línea** —la propiedad que este paquete declara como su valor central— y la **aritmética del scorecard**.

| Control de la auditoría | Veredicto |
|---|---|
| C1 · Muestreo de afirmaciones re-ejecutadas | **PASS** |
| C2 · Trazabilidad a informe / `check_id` | **FAIL** (AUD-01, AUD-02, AUD-07) |
| C3 · Snapshot, coordenadas de blob y regla de origen | **FAIL** (AUD-05, AUD-06, AUD-10) |
| C4 · Integridad de informes | **PASS condicionado** (hash completo de S5 NO VERIFICADO, AUD-11) |
| C5 · Cero ficción | **PASS** |
| C6 · Cero secretos | **PASS** |
| C7 · Integridad JSON / hashes | **PASS** |
| C8 · Veredicto por control sin promedios | **PASS** |

---

## 1. Correcciones que este paquete declara por adelantado

Son hallazgos del auditor independiente. **No se corrigieron los informes ajenos**: se publican como erratas y el material se entrega tal como fue producido.

| # | Corrección declarada | Hallazgo |
|---|---|---|
| 1 | **`SCORECARD.json` sobrecuenta PASS.** S8 declara `pass 6` + `parcial 2` sobre 9 ítems, pero su tabla tiene **4 PASS literales + 2 calificados**. Bajo la regla anti-suavizado que el propio scorecard se impone (parcial/WARN **nunca** suma como PASS), el total global pasa de **53 a 51 PASS**. El `SCORECARD.json` se conserva **tal cual**, con esta errata declarada. | AUD-03 |
| 2 | **El total 138 mezcla blobs distintos.** Suma dimensiones medidas en blobs diferentes (S3 en WT `20ac4b26`; S6 en WT `23b25b03`/`393635c2`; S9 en «WT vivo» no reproducible) junto a dimensiones medidas sobre HEAD. Eso viola `snapshot/REGLA_DE_ORIGEN.md:17`. Por eso **§3 de este README publica los totales agrupados por blob, no una única suma agregada**. | AUD-05 |
| 3 | **Las coordenadas de `council/S1_hls_m3u8.md` no son reproducibles.** Sus citas a líneas 12.930 / 13.008 / 19.941 no existen en ningún blob conservado, y otras coordenadas no coinciden (HEAD `:2701` es `SESSION-DATA`, `:9634` es `APE-LLHLS-BLOCK-RELOAD`, `:10147` es `buildCredentialsMap`, `:6538` es un comentario). **La sustancia sí se sostiene en HEAD** (verificado: `EXT-X-I-FRAME-STREAM-INF` sin `URI=` en `:2764` y `:9617`; `VERSION:9` en `:2355`/`:2690`/`:2740`; `TARGETDURATION:2`+`PART-INF`+`SERVER-CONTROL` en `:2693-2695`), pero la coordenada no es citable. Además `CONSOLIDADO.md:38` **subdeclara** el alcance histórico: hay ≥6 citas de S1 que solo caben en un render de 21.581 líneas que **no se conservó**. | AUD-01, AUD-02 |
| 4 | **`council/S9_player_compat.md`: su coordenada «WT vivo» no es reproducible.** Como su autor no podía autovalidarse, lo validó el capitán en [`gobierno/VALIDACION_DEL_CAPITAN.md`](gobierno/VALIDACION_DEL_CAPITAN.md): veredicto **FAIL** ratificado con **2 correcciones** — `#EXT-X-SESSION-DATA` se emite en **HEAD:2458** (no `:2646`) y `Upgrade-Insecure-Requests` aparece **5/10** (no 4/10). | AUD-06 |
| 5 | **S5 ya no está pendiente: se cierra como FAIL validado por tercero.** `t12` **no** es autor de S5 y confirmó exactamente sus **2 CRITICAL** (`S5-01`: 9 citas de métricas fabricadas en el blob HEAD, todas exactas; `S5-02`: `computeStubQoE()` consumido como «QoE REAL» + módulos QoE nunca desplegados). El estado `PENDIENTE_VALIDACION` de `SCORECARD.json` queda **superado** por esta validación de tercero. | muestreo C1 #15-16 |

---

## 2. Qué es este paquete

Trabajo verificable de **10 disciplinas IPTV** (S1–S10) agrupadas en **8 agentes** reales, ejecutado sobre el repositorio `IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION`. Sustituye el diseño ficticio del paquete `EQUIPO_ENTERPRISE_10_COUNCIL_ADN` (roles Trac, CVs inventados, «personas ficticias aspiracionales») por: council read-only sobre el snapshot medido → ADN operativo real → harness con exit codes → consolidado con scorecard → auditoría por no-autor → este paquete con SHA-256.

**Cero ficción, cero credenciales inventadas, cero escrituras a producción/VPS.** No se ejecutó el generador, no se contactó el VPS ni el proveedor, no se reprodujo vídeo en dispositivo.

**Snapshot:** `git HEAD e38a89b` (`e38a89bb30c02cb41050f34cef43d3711a2b0644`).
**Blob de referencia del generador:** HEAD `c1277bdf…` = 707.323 B / 11.144 líneas.
**Aviso sobre el working tree:** el WT del generador **mutó tres veces** durante el trabajo (21.581 → 11.594 → 11.644 → **11.658 líneas / 751.699 B**, medido al sellar este paquete). El WT **no es estado** y ninguna conclusión de este paquete se apoya en él.

## 3. Totales por dimensión — **agrupados por blob** (no se publica una suma única)

| Blob de medición | Dimensiones | Ítems |
|---|---|---|
| HEAD tree `c1277bdf` | S1, S2, S8, S10 | 50 |
| HEAD blob `c1277bdf` (citas re-verificadas) | S5 | 15 |
| WT congelado `20ac4b26` (`resolve_quality_unified.php`) | S3 | 32 |
| *no atribuido explícitamente por t12* | S4 | 23 |
| WT congelado `23b25b03` / `393635c2` (`ape_header.lua`, `ape_uri_rebase.lua`) | S6 | 11 |
| «WT vivo» — **coordenada no reproducible** (AUD-06) | S9 | 7 |
| **Suma de referencia (NO usar como veredicto)** | 9 dimensiones con tabla | **138** |

Por dimensión (contadas desde la tabla de cada informe, nunca del archivo): S1 8/12/0/2 · S2 4/5/1/2 · S3 15/12/0/5 · S4 8/11/0/4 · S5 0/15/0/0 · S6 8/3/0/0 (+1 parcial) · S7 `counts: null` (sin tabla, exclusión aceptada por el capitán) · S8 4 PASS literales + 2 calificados + 3 FAIL · S9 2/3/1/1 (+1 parcial) · S10 2/4/0/1 (+1 WARN).
**Aritmética corregida: pass 51 (no 53) · fail 68 · blocked 2 · not_run 15.**

## 4. Cómo se reprodujo

1. **Council** — 8 informes, solo lectura, cada afirmación con `archivo:línea` o comando+exit. Sin ejecución del generador.
2. **Snapshot** — 21 archivos: 8 `.HEAD.blob` + 9 `.WT.<sha8>.blob` extraídos con `git cat-file`, verificados byte a byte contra `git cat-file -s` (C18 = 8/8).
3. **Harness** — `verificacion/run_checks.ps1`, 21 chequeos, contrato `exit 0` = ningún FAIL · `exit 1` = ≥1 FAIL · `exit 2` = harness no ejecutable. Resultado real: **exit 1**, 10 PASS / 10 FAIL / 1 NOT_RUN.
4. **ADN** — roster de los 8 agentes reales, contrato de orden, protocolo Council medido, reemplazo de ficciones punto por punto.
5. **Consolidado** — tabla maestra por dimensión, 15 hechos, 10 contradicciones, 9 disensos, 13 tareas.
6. **Auditoría** — 8 controles por un **no-autor**, con recusación simétrica (S9 lo valida el capitán).
7. **Paquete** — este README + `MANIFEST_SHA256.json` + `../EQUIPO_10_ENTREGA.json` + ZIP con SHA-256.

**Re-verificar (comando exacto, desde la raíz del repo):**
```powershell
pwsh -NoProfile -File audit/equipo10_operativo_2026-10-26/verificacion/run_checks.ps1 ; $LASTEXITCODE
```
> ⚠️ Re-ejecutarlo **reescribe** `verificacion/HARNESS.json` y `VERIFICACION.md`. Es el único comando del paquete con efectos de escritura.

## 5. Índice del paquete

| Ruta | Qué contiene | Estado |
|---|---|---|
| [`council/S1_hls_m3u8.md`](council/S1_hls_m3u8.md) | HLS/M3U8 vs RFC 8216: tags emitidos, Anti-509, versiones, disensos | FAIL (coordenadas: AUD-01) |
| [`council/S2_llhls_cmaf.md`](council/S2_llhls_cmaf.md) | LL-HLS / CMAF / fMP4 | FAIL |
| [`council/S3_S4_codec_color_hdr.md`](council/S3_S4_codec_color_hdr.md) | Códec RFC 6381 + color/HDR | WARN |
| [`council/S5_qoe_telemetria.md`](council/S5_qoe_telemetria.md) | QoE / telemetría | **FAIL validado por tercero** (2 CRITICAL confirmados) |
| [`council/S6_nginx_lua.md`](council/S6_nginx_lua.md) | nginx / OpenResty Lua | PASS condicionado |
| [`council/S7_S10_sre_seguridad.md`](council/S7_S10_sre_seguridad.md) | SRE 365 d + seguridad/headers | WARN repo / BLOCKED operación |
| [`council/S8_red_tcp_quic.md`](council/S8_red_tcp_quic.md) | BBR / initcwnd / MTU / HTTP2-3 | WARN (no PASS) |
| [`council/S9_player_compat.md`](council/S9_player_compat.md) | Compatibilidad de player | FAIL (ratificado por el capitán) |
| [`verificacion/run_checks.ps1`](verificacion/run_checks.ps1) | Harness 21 chequeos con exit codes | exit 1 (10 PASS / 10 FAIL / 1 NOT_RUN) |
| [`verificacion/HARNESS.json`](verificacion/HARNESS.json) | Resultado real por chequeo | 21 filas |
| [`verificacion/VERIFICACION.md`](verificacion/VERIFICACION.md) | Totales y detalle de los 21 chequeos | — |
| [`snapshot/`](snapshot/) | 21 archivos: 17 blobs + `SNAPSHOT.json`, `REPORT_HASHES.json`, `REGLA_DE_ORIGEN.md`, `WT_DRIFT_LOG.json` | verificado |
| [`adn/EQUIPO_10_OPERATIVO.json`](adn/EQUIPO_10_OPERATIVO.json) | Roster real de 8 agentes, 10 disciplinas, 13 tareas, 6 reglas duras | válido |
| [`adn/CONTRATO_DE_ORDEN.md`](adn/CONTRATO_DE_ORDEN.md) | 16 campos con fuente real y modo de fallo | — |
| [`adn/PROTOCOLO_COUNCIL.md`](adn/PROTOCOLO_COUNCIL.md) | Protocolo medido y conflicto de autoría declarado | — |
| [`adn/REEMPLAZO_DE_FICCIONES.md`](adn/REEMPLAZO_DE_FICCIONES.md) | 12 elementos preservados · 10 ficciones descartadas con cita | — |
| [`consolidado/CONSOLIDADO.md`](consolidado/CONSOLIDADO.md) | Tabla maestra, 15 hechos, 10 contradicciones, 9 disensos | contiene AUD-02 |
| [`consolidado/SCORECARD.json`](consolidado/SCORECARD.json) | Scorecard por dimensión | **contiene AUD-03** (pass 53 → 51) |
| [`consolidado/RIESGOS_TOP.md`](consolidado/RIESGOS_TOP.md) | Top-10 riesgos deduplicado | — |
| [`consolidado/INTEGRIDAD_DE_INFORMES.md`](consolidado/INTEGRIDAD_DE_INFORMES.md) | Hashes declarados de los informes | 0 discrepancias |
| [`auditoria/AUDITORIA_INDEPENDIENTE.md`](auditoria/AUDITORIA_INDEPENDIENTE.md) | **Veredicto que manda**: 8 controles, 18 re-verificaciones | FAIL global |
| [`auditoria/HALLAZGOS.json`](auditoria/HALLAZGOS.json) | 13 hallazgos estructurados (AUD-01…AUD-13) | válido |
| [`gobierno/VALIDACION_DEL_CAPITAN.md`](gobierno/VALIDACION_DEL_CAPITAN.md) | Validación de S9 + 3 decisiones de gobernanza | S9 = FAIL |

**Artefactos externos a la carpeta** (no empaquetados aquí, por diseño):

| Ruta | Motivo | Dónde está su hash |
|---|---|---|
| `audit/EQUIPO_10_ENTREGA.json` | Índice de entrega: contiene el SHA-256 del ZIP ⇒ no puede viajar dentro del ZIP que describe | en sí mismo (`paquete.manifest_sha256` lo referencia desde el manifest) |
| `audit/EQUIPO_10_OPERATIVO_2026-10-26.zip` | El artefacto de entrega | `EQUIPO_10_ENTREGA.json → paquete.zip_sha256` |
| `verificacion/LEEME_UBICACION.md` (raíz del repo) | Puntero de ubicación creado por t9. **Nota:** t9 lo describió «en la raíz del repo»; el archivo existe en `<raíz>/verificacion/LEEME_UBICACION.md` — presente, ubicación distinta a la declarada | `MANIFEST_SHA256.json → external` |

## 6. Límites reales — lo NO verificado y por qué

| Qué | Estado | Causa |
|---|---|---|
| Producción / VPS | **BLOCKED** | `iptv-vps-touch-nothing`; el VPS medido es rebase-only y todo dato del host es de tercero (`docs/manifestos/VPS_REALITY_MEASURED_2026-10-25.md`) |
| Reproducción en dispositivos (TiviMate, OTT Navigator, VLC, Kodi, Smart TV) | **NOT_RUN** | No hay dispositivo disponible; inventar pruebas está prohibido |
| `nginx -t` / `luac -p` | **NOT_RUN** | Host Windows sin nginx ni Lua |
| Ejecución del generador en navegador | **NOT_RUN** | Requiere navegador + credenciales de proveedor |
| Hash completo de `council/S5_qoe_telemetria.md` | **NO VERIFICADO** | Nadie publicó el hash completo; solo existe prefijo `583C36D6` (AUD-11). No se convierte en PASS ni en FAIL |
| Contenido de S9 | Validado por el capitán, **no** por el auditor | Recusación por autoría (el auditor es su autor) |
| Coordenadas de S1 y S9 | **No reproducibles** | AUD-01 / AUD-06 / AUD-02: dependen de un render del WT que no se conservó |
| WT del generador como fuente | **Descartado** | Mutó 3 veces durante el trabajo; es medición de un instante, no estado |
| Despliegue del paquete | **No ejecutado** | Este paquete es evidencia y backlog; las 13 tareas del consolidado **no** están ejecutadas |

## 7. Integridad del paquete

- **43 archivos heredados** (council 8 · verificacion 3 · snapshot 21 · adn 4 · consolidado 4 · auditoria 2 · gobierno 1) **+ `README.md` + `MANIFEST_SHA256.json` = 45** dentro del ZIP. **Ningún informe se borró, renombró ni editó.**
- `MANIFEST_SHA256.json` lista **44** archivos (los 43 heredados + este README) con **tamaño real y SHA-256 calculado con `Get-FileHash`**, sin placeholders. **No se lista a sí mismo** —autorreferencia imposible— y ese archivo se verifica aparte contra su propio hash.
- **Verificación de ida y vuelta ejecutada:** el ZIP se descomprimió en un directorio temporal y se comparó archivo por archivo contra el manifest.

| Control de la verificación | Resultado real |
|---|---|
| Archivos en el manifest | 44 |
| Archivos extraídos del ZIP | 45 (= 44 + el manifest autoexcluido) |
| Faltantes | **0** |
| Hashes distintos | **0** |
| Sobrantes no declarados | **0** |
| `MANIFEST_SHA256.json` extraído == en disco | **sí** |
| **Resultado** | **PASS** |

- `EQUIPO_10_ENTREGA.json` vive **fuera** del ZIP porque contiene su hash; el manifest lo declara en `excluded_from_manifest`, no lo oculta. El detalle completo de la verificación está en `../EQUIPO_10_ENTREGA.json → verificacion_propia`.

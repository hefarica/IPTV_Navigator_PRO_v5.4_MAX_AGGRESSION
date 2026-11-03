# PROTOCOLO COUNCIL — el que realmente se ejecutó

**Fuentes:** `.agent-teams/equipo-enterprise-10-adn/team.json` (estado del runtime) + los 8 informes en `audit/equipo10_operativo_2026-10-26/council/` + las reglas del paquete que sí se respetaron (`00_DIRECTRIZ_COMUN.txt:17-21`, `01_PROTOCOLO_DE_COORDINACION.md:6-13`).
**Snapshot del Council:** `git HEAD e38a89bb30c02cb41050f34cef43d3711a2b0644`; el WT derivó durante la fase (§4).
**Todo lo que sigue tiene evidencia; lo que no se puede probar está marcado `no_verificado_por_el_miembro`.**

---

## 1. Despacho: 8 revisiones read-only en paralelo

| Hecho | Evidencia |
|---|---|
| El plan completo (13 tareas) se materializó **en el mismo instante** | `createdAt` idéntico `1793005759801` = `2026-10-26T09:09:19.801Z` en las 13 (`team.json:1082` y equivalentes) |
| Las 8 revisiones del Council son las tareas `t1..t8`, una por agente, sin dependencias entre sí | `team.json` `t1`..`t8`: `profileSeedId` `c1`..`c8`, `dependencies: []`, `assignee` distinto en cada una |
| Se ejecutaron **todas**: 8/8 `completed`, `attempt=1` (ninguna reasignada) | `team.json` (status de `t1`..`t8`); 8 archivos en `council/` con SHA-256 en `adn/EQUIPO_10_OPERATIVO.json → council_deliverables` |
| Ventana real de cierre del Council | `updatedAt`: `t7` `…143870` (09:15:43.870Z) → `t6` `…796124` (09:26:36.124Z); el último cierre precede al inicio de la fase de implementación (`t10` `…834402` = 09:27:14.402Z) |
| Paralelismo de **ejecución** | `no_verificado_por_el_miembro`: el registro no guarda hora de inicio por miembro, solo `createdAt`/`updatedAt`. Lo probado es despacho simultáneo + solapamiento temporal |
| Read-only efectivo | `no_verificado_por_el_miembro` en sentido técnico: **no hay ACL**. La contención es contractual (`team.json:48` regla 4: "escribí SOLO en tu ruta de entregable") y el paquete lo advierte (`08_PERMISOS_Y_HERRAMIENTAS.md:19`: "No afirmar que la separación de fases impone read-only mediante ACL"). Lo observable: cada informe declara su alcance y no hay archivos ajenos modificados por el Council |

---

## 2. Una intervención por agente sobre el mismo snapshot

- Cada agente entregó **un** informe y no volvió a tocarlo: `attempt=1` y un único archivo por autor (`council_deliverables`, 8 filas, autor ≠ archivo repetido).
- Cada informe cubre su disciplina sin invadir la ajena; el solapamiento se trata como **cruce declarado**, no como segunda intervención (p.ej. S2 cruza con S1 en el header LL-HLS y lo atribuye: `council/S2_llhls_cmaf.md` §"Cruce con pares").
- Formato mínimo cumplido por los 8: veredicto + hechos con fuente + riesgos + huecos/NO-RUN + disensos + tareas.

---

## 3. Taxonomía de veredictos — **heterogénea** (hallazgo del protocolo)

Conteo de tokens por informe (`Select-String -AllMatches` sobre cada archivo):

| Informe | PASS | FAIL | BLOCKED | NOT_RUN | CONFORME | HALLAZGO | "Disenso" |
|---|---|---|---|---|---|---|---|
| S1_hls_m3u8.md | 15 | 20 | 1 | 8 | 2 | 0 | 2 |
| S2_llhls_cmaf.md | 11 | 21 | 4 | 11 | 0 | 1 | 2 |
| S3_S4_codec_color_hdr.md | 6 | 1 | 0 | 0 | **21** | **2** | 4 |
| S5_qoe_telemetria.md | 4 | 3 | 0 | 5 | 0 | 1 | 2 |
| S6_nginx_lua.md | 7 | 2 | 0 | 5 | 0 | 2 | 1 |
| S7_S10_sre_seguridad.md | 13 | 16 | 3 | 5 | 0 | 2 | 7 |
| S8_red_tcp_quic.md | 13 | 10 | 1 | 4 | 0 | 0 | 3 |
| S9_player_compat.md | 12 | 7 | 3 | 2 | 0 | 1 | 1 |

**Lectura:** 7 de 8 usan `PASS/FAIL/BLOCKED/NOT_RUN`; el informe S3+S4 usa además `CONFORME/HALLAZGO` (21/2). **No existe una taxonomía única** ⇒ el consolidado (`t11`) debe **normalizar** (`CONFORME→PASS`, `HALLAZGO→FAIL` o severidad, según su propia tabla) y **no sumar** los tokens de este cuadro como si fueran hallazgos: son ocurrencias de texto, incluidas las de las tablas de veredicto.

Regla operativa que se deriva: **un veredicto se cuenta desde la tabla del informe, por dimensión, nunca desde el total del archivo** — y S3/S4 y S7/S10 comparten archivo, así que hay que leer cada dimensión de su propia tabla (esto ya está exigido en la orden `t11`: `team.json:1091`, punto (2) del TAREA).

---

## 4. Regla de origen (blob) — obligatoria desde `t11`

`team.json:1091` (descripción de `t11`) fija la REGLA DE ORIGEN que el Council no tuvo al empezar:

1. Cada hallazgo cita el **blob** contra el que se midió: HEAD `c1277bdfdc46debfc762eb86e22f77b85b66e250` (707,323 B / 11,144 líneas para `m3u8-typed-arrays-ultimate.js`) **o** el sha del WT.
2. **No se suman conteos entre blobs distintos.**
3. `S1-F01` (+10,447/−10) se midió ~04:12 sobre un WT de 21,581 líneas y está **superado** por el WT actual (+317/−2, 11,459 líneas): se registra como hecho histórico con su blob, no como estado vigente.
4. Si dos informes discrepan porque midieron blobs distintos, se registra la discrepancia y su causa; no se elige uno por decreto.

**Consecuencia sobre los informes ya cerrados:** las citas `archivo:línea` de este Council son válidas **contra el blob que cada autor declara**; toda afirmación sobre el *working tree* es perecedera. En `adn/EQUIPO_10_OPERATIVO.json` el snapshot se deja pinneado a HEAD `e38a89b` con el WT declarado como variable (57 rutas sucias al momento de `i2`).

---

## 5. Consolidación por NO-autor — **conflicto real detectado**

| Rol | Asignado | Conflicto | Mitigación exigida |
|---|---|---|---|
| Consolidación (`t11`) | `s5-qoe-qos` | Es **autor** de `council/S5_qoe_telemetria.md` (c4). El paquete prohíbe que el autor puntúe su entregable (`01_PROTOCOLO_DE_COORDINACION.md:13`, `09_JERARQUIA_MERITO_Y_MANDO.md:15`) | **Recusación por capítulo**: consolida S1, S2, S3+S4, S6, S7+S10, S8 y S9; el capítulo S5 lo consolida el capitán u otro no-autor. Debe declararse en `consolidado/CONSOLIDADO.md` |
| Auditoría (`t12`) | `s9-player-compat` | Es **autor** de `council/S9_player_compat.md` (c8) | La auditoría puede auditar a los otros 7 informes y al consolidado; **no** puede auditar su propio c8 ni ser el único revisor de afirmaciones S9 |
| Auditor externo | No existe | El paquete exige Owner externo cuando no hay revisor interno independiente (`01_PROTOCOLO_DE_COORDINACION.md:13`) | Declarar la limitación en `auditoria/AUDITORIA_INDEPENDIENTE.md`; el Owner decide |

**Estado:** `t11` y `t12` siguen `pending` con `attempt=0` (`team.json:1092`, `:1115`). El conflicto está **abierto**, no resuelto: este documento lo registra en lugar de taparlo.

---

## 6. Auditoría por tercero

- `t12` es tercero respecto de la consolidación (no es el consolidador) y respecto de 7 de los 8 informes.
- Sus controles obligatorios (`team.json:1114`): muestreo de 8-12 afirmaciones **re-ejecutadas**, trazabilidad de evidencia, cero ficción, cero secretos.
- Su veredicto **manda** sobre el paquete (`t13`: "Leé primero la auditoría independiente: su veredicto manda", `team.json:1128`).

---

## 7. Semántica de los 4 estados (no negociable)

| Estado | Significado | Cuándo se usa |
|---|---|---|
| `PASS` | Ejecutado y conforme, con `archivo:línea` o comando+exit | Sólo con evidencia reproducible |
| `FAIL` | Ejecutado y no conforme (incluye promesa incumplida, tag que miente, capacidad declarada sin implementación) | Con la evidencia del fallo |
| `BLOCKED` | No se pudo medir por una dependencia externa (sin SSH/red, sin dispositivo, sin ACL) | Se nombra la dependencia que falta |
| `NOT_RUN` | No se ejecutó (fuera de alcance, sin fixture, sin bytes, sin intérprete) | **Nunca** se convierte en `PASS` |

Reglas asociadas, verificadas en este team:
- Un `NOT_RUN` no suma al denominador de aprobación (`00_DIRECTRIZ_COMUN.txt:21`: "nunca convertir no ejecutado en aprobado").
- Ausencia de datos ≠ cero (`09_JERARQUIA_MERITO_Y_MANDO.md:19`: "score=null, rank=null … nunca cero ni una clasificación inventada").
- Un informe faltante o truncado es `MISSING/NOT_RUN`, nunca `PASS` (`team.json:1091`).

---

## 8. Integridad de los informes

- `t9` produjo `snapshot/REPORT_HASHES.json` + `snapshot/REGLA_DE_ORIGEN.md` + blobs `HEAD`/`WT` (existen en disco: 14 `.blob` + 3 documentos).
- `t11` debe comparar **hash declarado vs hash real** de cada informe y marcar los que no coincidan como hallazgo de integridad, **sin corregir el archivo ajeno** (`team.json:1091`).
- Los SHA-256 reales de los 8 informes, medidos para este ADN, están en `adn/EQUIPO_10_OPERATIVO.json → council_deliverables` (sirven de referencia para esa comparación).

---

## 9. Lo que el Council NO hizo (declarado)

| No ejecutado | Causa |
|---|---|
| Importar el paquete a DSH | No ocurrió (`06_VERIFICACION_DEL_PAQUETE.txt:9`; `validate_imports_portable.py → runtime_verified=false`) |
| Probes de red / HTTP contra proveedores o VPS | Prohibido por doctrina (`iptv-vps-touch-nothing`) y por el contrato de la fase |
| SSH / lectura del VPS | Prohibido en la fase; lo del VPS se cita como medición de tercero (`docs/manifestos/VPS_REALITY_MEASURED_2026-10-25.md`) |
| Ejecutar el harness | `t9` en curso (`verificacion/run_checks.ps1` existe; `HARNESS.json` aún no) |
| Medir los modelos/LLM de cada agente | Sólo se registra lo que `team.json:13-15` declara; la calidad no es verificable desde aquí |

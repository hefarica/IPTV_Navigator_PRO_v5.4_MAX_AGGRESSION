# REEMPLAZO DE FICCIONES — de `P01..P10` (Trac) a `S1..S10` (IPTV) en 8 agentes

**Qué se sustituye:** el diseño ficticio del paquete `EQUIPO_ENTERPRISE_10_COUNCIL_ADN` por el ADN operativo del team real `equipo-enterprise-10-adn`.
**Qué NO se hace:** presentar el reemplazo como "importación" ni como renombre. **El paquete no se importó a DSH** (`06_VERIFICACION_DEL_PAQUETE.txt:9`; `validate_imports_portable.py` → `runtime_verified=false`, exit 0).

---

## 0. Identidad medida del material de entrada

| Dato | Valor | Fuente |
|---|---|---|
| Archivos / directorios | **430** / 29 (13 243 619 bytes) | `Get-ChildItem -Recurse` sobre `_inbox_EQUIPO_ADN/EQUIPO_ENTERPRISE_10_COUNCIL_ADN/` |
| Manifiesto interno | **429/429 OK**, 0 mismatch, 0 missing; sha256 del manifiesto `AB6CD0DF860E7D3EAEA8A66E5D613E5BBAAE3FA519ADDDF9F6BBFEB7B058E7B6` | `MANIFIESTO_SHA256.txt`; cubre "todos los archivos salvo el propio manifiesto" (`06_VERIFICACION_DEL_PAQUETE.txt:7`) |
| Validador propio del paquete | `valid: true`, `checks: 2469`, `file_count: 430`, `agent_count: 10`, `tool_catalog_count: 271`, `runtime_verified: false` | `python validate_imports_portable.py` → exit 0 (`06:5-6`) |
| SHA-256 del ZIP | **NOT_RUN** — no existe el archivo ZIP en el workspace; el hash `ad40f159…bb408` consta sólo como afirmación | `.agent-teams/equipo-enterprise-10-adn/team.json:1068` |
| Personas ficticias | 10 roles `P01..P10`, UUID sintéticos, organigrama de 3 niveles | `RESUMEN_EQUIPO_ENTERPRISE_10.txt:11-20`; `01_PROTOCOLO_DE_COORDINACION.md:16-25` |

---

## 1. Tabla ficticio → real (mando)

| # | Ficticio (paquete) | Fuente | Real (este team) | Evidencia |
|---|---|---|---|---|
| P01 | `P01_CEO_GOBERNANZA_TRAZABLE` · CEO · 3 reportes | `RESUMEN:11`, `00_DIRECTRIZ_COMUN.txt:14` | **Capitán del team** (fuera de los 8 miembros). No hay CEO ni 3 niveles | `team.json` (no existe campo CEO); el prompt de asignación declara al capitán como supervisor |
| P02..P10 | 9 perfiles de superficie **Trac** (access surface, prefs, TracGuide, licencias, registro, recovery, reportes, domain search, tags) | `RESUMEN:12-20` | **8 agentes técnicos IPTV** con dominios S1-S10 | §2 |

**Lectura honesta:** no hay correspondencia 1:1. Los 9 perfiles P02-P10 describen la superficie de un producto **ajeno** (Trac: registro, licencias, guía documental); los 10 dominios de este team describen **streaming IPTV**. Se reemplaza el **dominio**, no se renombra el rol.

---

## 2. Tabla de disciplinas reales → agente → entregable

| Disciplina | Agente real | Tarea | Entregable (SHA-256 en `adn/EQUIPO_10_OPERATIVO.json`) |
|---|---|---|---|
| S1 HLS/M3U8 RFC 8216 | `s1-hls-architect` | `t1`, `t13` | `council/S1_hls_m3u8.md` |
| S2 LL-HLS/CMAF-fMP4 | `s2-llhls-cmaf` | `t2`, `t10` | `council/S2_llhls_cmaf.md` + `adn/*` |
| S3 codec RFC 6381 | `s3-codec-hdr` | `t3` | `council/S3_S4_codec_color_hdr.md` |
| S4 color/HDR | `s3-codec-hdr` (comparte) | `t3` | idem (dos secciones separadas) |
| S5 QoE/QoS | `s5-qoe-qos` | `t4`, `t11` | `council/S5_qoe_telemetria.md` + `consolidado/` |
| S6 nginx/OpenResty Lua | `s6-nginx-lua` | `t5` | `council/S6_nginx_lua.md` |
| S7 SRE/systemd | `s7-sre-secops` | `t6`, `t9` | `council/S7_S10_sre_seguridad.md` + `verificacion/` |
| S8 red TCP/QUIC | `s8-net-tcp-quic` | `t7` | `council/S8_red_tcp_quic.md` |
| S9 compatibilidad player | `s9-player-compat` | `t8`, `t12` | `council/S9_player_compat.md` + `auditoria/` |
| S10 seguridad/auth | `s7-sre-secops` (comparte) | `t6`, `t9` | idem |

**Agrupación (10→8):** el runtime limita el team a 8 miembros. Se fusionan **S3+S4** (`team.json:68`: "S3+S4 — Video codec engineer y color scientist HDR") y **S7+S10** (`team.json:152`: "S7+S10 — SRE … y seguridad"). Ninguna de las 10 disciplinas queda sin dueño declarado; la cobertura está mapeada en `EQUIPO_10_OPERATIVO.json → cobertura_disciplinas`.
**Costo declarado de la fusión:** cada agente fusionado produce **un** archivo con **dos** secciones, lo que obliga a contar veredictos por dimensión y no por archivo (ya exigido en `t11`: `team.json:1091`).

---

## 3. Qué se PRESERVÓ (y con qué evidencia se ve)

| Elemento de gobernanza | Estado en el team real | Evidencia |
|---|---|---|
| Dos fases separadas (Council read-only → implementación) | **Preservado**: `t1..t8` read-only; `t9..t13` con escritura | `00_DIRECTRIZ_COMUN.txt:17-18`; `team.json` t1-t8 vs t9-t13 |
| Council = N participantes, same snapshot, una intervención | **Preservado**: 8/8 informes, `attempt=1`, un archivo por autor | `01_PROTOCOLO_DE_COORDINACION.md:7`; §1 de `PROTOCOLO_COUNCIL.md` |
| Distinción hecho / hipótesis / diseño / resultado | **Preservado**: cada informe separa "Hechos con fuente" de "Riesgos"/"Disensos" | `00_DIRECTRIZ_COMUN.txt:8` |
| Evidencia reproducible y estados PASS/FAIL/BLOCKED/NOT_RUN | **Preservado**: 7/8 informes usan la taxonomía; S3+S4 añade CONFORME/HALLAZGO (normalizable) | `00:21`; §3 de `PROTOCOLO_COUNCIL.md` |
| Nunca convertir no ejecutado en aprobado | **Preservado**: los NO-RUN están declarados (p.ej. S2: 2 NO-RUN, 1 BLOCKED) | `00:21`; `council/S2_llhls_cmaf.md` §4 |
| Autor ≠ revisor | **Preservado como regla, con conflicto abierto** en `t11` (autor de c4) y `t12` (autor de c8) | `01:13`, `09_JERARQUIA_MERITO_Y_MANDO.md:15`; §5 de `PROTOCOLO_COUNCIL.md` |
| Contrato de orden de 16 campos | **Preservado y adaptado** con valores reales | `01:3-4`; `adn/CONTRATO_DE_ORDEN.md` §1 |
| Registro de disenso | **Preservado**: 8/8 informes tienen §Disensos (1 a 7 por informe) | §3 de `PROTOCOLO_COUNCIL.md` |
| Auditoría por tercero + veredicto que manda | **Preservado** (`t12` → `t13`) | `team.json:1128` ("su veredicto manda") |
| Prohibición de secretos en documentos/prompts/ZIP | **Preservado**: 0 secretos impresos; S10 los cita como `archivo:línea` + `***` | `00:11`; `council/S7_S10_sre_seguridad.md` |
| "Los CV no son evidencia de desempeño" | **Preservado** y reforzado: cada miembro ejecuta con "NO SOS UN PERSONAJE" | `09:25`; `team.json:46` |
| Ausencia de datos ≠ cero | **Preservado**: lo no medido es `NOT_RUN`/`no_verificado_por_el_miembro` | `09:19` |

---

## 4. Qué se DESCARTÓ (y por qué)

| Elemento ficticio | Fuente | Por qué se descarta | Qué lo reemplaza |
|---|---|---|---|
| Personas, formación y experiencia "ficticias aspiracionales" | `RESUMEN:23` | Prohibido por la doctrina del team ("no inventes personas, experiencia, títulos") | Agente + evidencia: `EQUIPO_10_OPERATIVO.json → agentes[].evidencia_exigida` |
| UUIDs y nombres `P01..P10` | `RESUMEN:11-20` | Identifican personas ficticias de otro producto | `member_id` reales (`team.json:10,38,66,94,122,150,178,206`) |
| Organigrama 3 niveles / span máx. 3 / "3 reportes directos" | `00:14`, `RESUMEN:5` | El team real no tiene mandos intermedios: 8 pares + 1 capitán | `authority_model` en el roster |
| Dominio Trac (registro, licencias, TracGuide, tags, domain search) | `RESUMEN:12-20` | Producto ajeno al repo auditado | Dominios S1-S10 (streaming IPTV) |
| CVs, seniority, promociones, recompensas | `09:21-25` | No hay personas ni historial evaluable; premiar por número sería ficción | Nada: se declara **sin evaluar** (`09:19`) |
| Fórmula de score 30/20/15/15/20 | `09:13` | Requiere presupuesto acordado y evaluaciones; **no existe presupuesto** en `team.json` | Se conserva como doctrina disponible; **no se aplica** (0 evaluaciones registradas) |
| Allowlists de 271 herramientas por perfil | `08:31-129` | No son la superficie real; el propio paquete advierte que el catálogo no acredita editor/terminal (`08:5`) ni instalación (`08:3`) | Superficie DSH observada + contrato de orden §campo 14 |
| "Compatibilidad DSH verificada offline" | `RESUMEN:25` | Offline ≠ verificado en este runtime; el propio validador dice `runtime_verified: false` | Declarado `no_verificado_por_el_miembro` |
| Libro `ADN_Organizacional.xlsx` como fuente sincronizada | `RESUMEN:34` | No se abrió (requiere Excel/COM; `06:9` lo lista como NO VERIFICADO) | Roster JSON versionado en el repo |
| Importación del paquete a DSH | `RESUMEN:25` | **No ocurrió** | Este ADN escrito desde el estado real del runtime |

---

## 5. Riesgos de la sustitución

| # | Riesgo | Evidencia | Mitigación |
|---|---|---|---|
| 1 | **Pérdida de la función "CEO"**: nadie arbitra conflictos entre agentes | No hay rol de mando entre los 8 (`team.json`) | El capitán arbitra; si hay conflicto de interés del capitán, escala al Owner |
| 2 | **Fusión S3+S4 y S7+S10** concentra dos disciplinas en un contexto | `team.json:68`, `:152` | Secciones separadas por disciplina en el mismo informe + conteo por dimensión (`t11`) |
| 3 | **Consolidador autor** (`t11` = autor de c4) y **auditor autor** (`t12` = autor de c8) | §5 de `PROTOCOLO_COUNCIL.md` | Recusación por capítulo; el Owner nombra revisor externo si hace falta (`01:13`) |
| 4 | **Un solo auditor** para todo el paquete | `team.json:1116` | Su veredicto se publica con la limitación declarada; el Owner puede nombrar un segundo |
| 5 | **`run_id` y `presupuesto` no existen** en el runtime | `team.json` (sin esos campos) | Convención declarada + `no_verificado_por_el_miembro`; no se inventan valores |
| 6 | El ADN podría leerse como "importación" del paquete | — | Aviso explícito al inicio de este documento y en `nota_importacion_dsh` del roster |

---

## 6. Verificación de esta sustitución

| Check | Resultado | Evidencia |
|---|---|---|
| 10 disciplinas con dueño | **PASS** (8 agentes, S3+S4 y S7+S10 compartidos) | `EQUIPO_10_OPERATIVO.json → cobertura_disciplinas` |
| 0 personas ficticias en el ADN | **PASS** (grep `P0[0-9]_|CVs?|certificaci` en `adn/`: 0 identidades ficticias; los únicos hits son las tablas de descarte y el criterio de aceptación de `CONTRATO_DE_ORDEN.md:62`) | este documento §4; roster sin campos de persona |
| 0 métricas inventadas | **PASS** (toda cifra sale de comando+exit o de archivo:línea) | §0; `validacion_paquete` del roster |
| Zonas no verificables declaradas | **PASS** (9 ítems en `no_verificado_por_el_miembro`) | `EQUIPO_10_OPERATIVO.json` |
| Roster coincide con el runtime real | **PASS** (8 nombres, 8 UUID, 13 tareas, 10 dependencias) | `team.json:8-1140` |
| El paquete se importó a DSH | **NO** (declarado) | `06:9`; `runtime_verified: false` |

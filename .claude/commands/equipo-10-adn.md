---
description: Convoca el Equipo Enterprise 10 ADN (8 agentes reales / 10 disciplinas S1-S10 del repo) con su contrato de gobernanza de llegada y todo lo aprendido en la auditoría 2026-10-26. Fases reales: Council read-only (8 revisiones) → harness ejecutable + snapshot congelado → ADN operativo → consolidado con scorecard → auditoría independiente por no-autor → paquete con manifest SHA-256.
argument-hint: "[--fase council|full|refrescar] [--foco S1,S5,S10] [--solo-plan] [--reanudar]"
allowed-tools: Read, Glob, Grep, Bash, TodoWrite, Skill, AskUserQuestion, Agent
---

# /equipo-10-adn

**Purpose:** Convocar el team durable `equipo-enterprise-10-adn` — 8 agentes reales que cubren las 10 disciplinas S1–S10 que exige `AGENTS.md` — con dos capas de contexto cargadas de fábrica:

1. **ADN DE LLEGADA** — el contrato de gobernanza heredado del paquete `EQUIPO_ENTERPRISE_10_COUNCIL_ADN` (dos fases, contrato de orden, evidencia reproducible, autor ≠ revisor, PASS/FAIL/BLOCKED/NOT_RUN), ya despojado de su ficción (CVs, roles Trac, jerarquía aspiracional).
2. **LO APRENDIDO** — la auditoría real del 2026-10-26 sobre el repo y el VPS: veredicto FAIL con 3 HIGH, hallazgos por disciplina, correcciones del capitán, trampas que no deben repetirse y deuda de seguridad. Versión extensa: [`docs/manifestos/EQUIPO_10_ADN_CONTEXTO_2026-10-26.md`](../../docs/manifestos/EQUIPO_10_ADN_CONTEXTO_2026-10-26.md).

**Snapshot de referencia:** `git HEAD e38a89b` · blob del generador `c1277bdfdc46debfc762eb86e22f77b85b66e250` (707.323 B / 11.144 líneas, inmutable).

## Usage

```
/equipo-10-adn                          # convoca el plan completo (default: --fase full)
/equipo-10-adn --solo-plan              # construye y presenta el plan staged sin aprobar
/equipo-10-adn --fase council           # solo la ola de Council read-only (8 revisiones)
/equipo-10-adn --foco S5,S10            # re-audita solo esas disciplinas (Council reducido)
/equipo-10-adn --reanudar               # team ya existe: inspecciona estado y reintenta lo fallido
/equipo-10-adn --refrescar              # nueva fecha de snapshot: re-medir en vez de confiar en el paquete previo
```

## Inputs

| Flag | Efecto |
|---|---|
| `--fase council` | Solo `c1..c8` (8 revisiones read-only). No dispara implementación. |
| `--fase full` (default) | Council → harness+snapshot → ADN → consolidado → auditoría → paquete. |
| `--foco S1,S5` | Reduce el Council a esas dimensiones; el consolidado igualmente debe declarar el alcance reducido. |
| `--solo-plan` | Crea el plan staged y **termina el turno pidiendo aprobación**. Nunca auto-aprobar. |
| `--reanudar` | No recrea nada: usa `agent_teams_status` y `reassign_task` para reintentar tareas fallidas. |
| `--refrescar` | Si `git rev-parse --short HEAD` ≠ `e38a89b` o el WT cambió, re-medir; el contexto aprendido deja de ser citable como vigente. |

## IDENTIDAD LITERAL — este team, no otro

**Team id literal: `equipo-enterprise-10-adn`.** Es el que ejecutó las **13 tareas** del 2026-10-26 y produjo `audit/equipo10_operativo_2026-10-26/`. Este comando **no** crea un equipo "parecido", no renombra, no sustituye miembros y no reutiliza el nombre para otro objetivo.

### Guardas de identidad (si falla una → STOP, no convocar)

1. `agent_teams_status` debe devolver **exactamente** `equipo-enterprise-10-adn`. Cualquier otro nombre → detenerse y reportar; **prohibido** "adoptar" el team que aparezca.
2. Los **8 member targets** deben ser exactamente, en este orden:
   `s1-hls-architect` · `s2-llhls-cmaf` · `s3-codec-hdr` · `s5-qoe-qos` · `s6-nginx-lua` · `s7-sre-secops` · `s8-net-tcp-quic` · `s9-player-compat`.
   Si falta uno → reportar; **no inventar reemplazo** ni crear un noveno. (No existen `s4-*` ni `s10-*` como miembros: S3+S4 viven en `s3-codec-hdr` y S7+S10 en `s7-sre-secops`.)
3. Las **13 tareas** son exactamente `t1..t13` con estos subject: `c1` HLS/M3U8 · `c2` LL-HLS/CMAF · `c3` S3+S4 codec/HDR · `c4` S5 telemetría · `c5` S6 nginx/Lua · `c6` S7+S10 SRE/seguridad · `c7` S8 red · `c8` S9 player · `i1` harness+snapshot · `i2` ADN operativo · `i3` consolidado+scorecard · `i4` auditoría independiente · `i5` paquete+manifest. Si el grafo difiere, es **otra generación/otro plan**: no mezclar entregables.
4. **Prohibido crear variantes del nombre**: `equipo-enterprise-10`, `equipo-10-adn`, `equipo-enterprise-10-adn-v2`, `equipo-adn-10`. Solo este id.
5. **Prohibido reutilizar el id para otro goal.** Si el objetivo pedido no es la auditoría IPTV S1–S10 de este repo (snapshot `e38a89b`/`c1277bdf`), este comando no aplica.
6. **Estado verificado al 2026-10-27:** `loop = deliverable`, `Delivery = ok`, **13/13 completed**, 8 miembros `idle/ready`, veredicto del paquete **FAIL** con 3 HIGH. Con ese estado el comando **no recrea**: agrega tarea nueva al mismo team o usa `--reanudar` para reintentos.
7. **No se lee ni se escribe `.agent-teams/equipo-enterprise-10-adn/` a mano.** La identidad y el estado se consultan solo por la API (`agent_teams_status`, `agent_teams_edit_plan`, `agent_teams_reassign_task`).

### Firma de identidad (diff en 5 segundos)

```
team     : equipo-enterprise-10-adn
members  : 8 (lista de la guarda 2)
tasks    : t1..t13 (c1..c8 Council + i1..i5 cadena)
artefacto: audit/equipo10_operativo_2026-10-26/ (44 archivos · 3.992.305 B)
paquete  : audit/EQUIPO_10_OPERATIVO_2026-10-26.zip · 1.041.315 B · sha256 6e7ecb24…1d0bfe0
veredicto: FAIL (3 HIGH: AUD-01/02/03) · scorecard ratificado 49/68/2/15 (134)
```

### Si el team no existe (archivado o borrado)

Solo cuando `agent_teams_status` confirme que no hay team: recrear **con el mismo id literal y el mismo roster de 8**. El runtime reemplaza la generación anterior del mismo nombre al archivarla; **nunca** se usa un nombre distinto para "empezar limpio". Si el runtime rechaza por nombre en uso → reportar y pedir decisión al propietario.

## COORDINACIÓN MULTI-AGENTE (obligatoria antes de escribir)

En este workspace hay **varios agentes escribiendo a la vez**. El contrato vive en [`docs/COORDINACION_AGENTES.md`](../../docs/COORDINACION_AGENTES.md) y en [`contracts/ownership_scopes.json`](../../contracts/ownership_scopes.json). Leelos **antes** de cualquier escritura.

**Scopes de este team (únicos donde puede escribir):**
```
audit/equipo10_operativo_2026-10-26/**      audit/EQUIPO_10_OPERATIVO_*.zip
audit/EQUIPO_10_ENTREGA*.json               docs/manifestos/EQUIPO_10_ADN_CONTEXTO_2026-10-26.md
.claude/commands/equipo-10-adn.md           docs/COORDINACION_AGENTES.md
contracts/ownership_scopes.json             _coord/**
```

**Prohibido escribir en:** `_vps_stage/**` · `docs/edge/**` · `deliverables/**` · `audit_teams_REA/**` · `.github/**` · `IPTV_v5.4_MAX_AGGRESSION/frontend/**` · `IPTV_v5.4_MAX_AGGRESSION/vps/**` · `contracts/crystal_contracts.json` · `.agent-teams/**` · VPS.

**Reglas duras:**
1. **Nunca** `git add -A`, `git add .`, `git commit -a`, `git stash` ni `git checkout -- .`: hay trabajo no commiteado de otros agentes (`audit/**`, `docs/**`, `_inbox_EQUIPO_ADN/**` y 11 `M` preexistentes). Este team **no commitea**.
2. **Archivos compartidos** (`AGENTS.md`, `CLAUDE.md`): claim en `_coord/claims/` + chequeo de `mtime` + edición aditiva.
3. Si el archivo a tocar tiene `mtime` posterior a tu lectura o hay claim activo solapado → **STOP**: releer, rebasar o pedir relevo al propietario.
4. Workstreams activos detectados (2026-10-27): `hls-forensics` (commits en `feat/adb-generic-visual-enhancement-installer`, `_vps_stage/**`, `docs/edge/**`, CI) y `auditoria-roku-universal-rea` (`audit_teams_REA/**`). No tocar sus zonas.
5. Antes de citar el generador/resolver, **re-medir el blob del HEAD vigente**: HEAD se mueve (26 commits/24 h). Citar commit/blob, nunca el archivo vivo.

## ADN DE LLEGADA (contrato que viaja con el equipo)

### Dos fases, no una
| Fase | Modo | Regla |
|---|---|---|
| **Council** | 8 revisiones en paralelo, **read-only**, una intervención por agente, mismo snapshot | Sin escritura compartida, sin producción, sin ejecución del generador. Registra disenso y faltantes. |
| **Implementación** | DAG con dependencias, concurrencia efectiva ≤3 en la ola de implementación | Ninguna tarea arranca sin contrato de orden completo. |

### Contrato de orden (16 campos, obligatorio por tarea)
`run_id · phase_id · requirement_id · task_id · dueño · supervisor · snapshot/SHA · entradas · write scopes · entregables · dependencias · aceptación · presupuesto · herramientas/permisos · evidencia · rollback`

### Reglas de evidencia (heredadas y verificadas)
1. Toda afirmación técnica lleva `archivo:línea` **o** `comando + exit code`.
2. Veredictos permitidos: **PASS · FAIL · BLOCKED · NOT_RUN**. Nunca convertir "no ejecutado" en aprobado.
3. **Cero ficción**: prohibido inventar personas, CVs, certificaciones, años de experiencia, métricas, modelos o resultados de pruebas no corridas.
4. **Cero secretos impresos**: `archivo:línea` + tipo + `***`. Prohibido copiar credenciales a informes, JSON, prompts o ZIP.
5. **Autor ≠ revisor**: quien escribe un informe no lo consolida ni lo audita. Recusación por capítulo declarada en el entregable.
6. **Snapshot inmutable**: ninguna cita puede depender del working tree vivo (ver Trampa 1).

### Mapping de llegada (ficticio → real)
`P01..P10` del paquete original eran 10 roles **Trac ficticios**. Se reemplaza el dominio, no se renombra: **P01 (CEO) → capitán del team**; `P02..P10` → **S1..S10** (IPTV). Por el límite de 8 miembros del runtime, **S3+S4** comparten agente (`s3-codec-hdr`) y **S7+S10** comparten agente (`s7-sre-secops`). Ninguna disciplina se pierde; el informe dual trae tablas separadas para poder puntuar cada dimensión.

## LO APRENDIDO (2026-10-26) — hechos que no se re-descubren

**Veredicto del paquete:** **FAIL** (0 blocker · 3 HIGH: `AUD-01/02/03`). No es un fracaso del trabajo: es la auditoría del repo diciendo que casi todo lo "enterprise" está declarado y no desplegado.

| Dimensión | Veredicto | Hecho que manda |
|---|---|---|
| S1 HLS/M3U8 | FAIL | `VERSION:9` (RFC 8216 topa en 7); `EXT-X-I-FRAME-STREAM-INF` sin `URI=` 10/10; Media+Master mezclados; `DATERANGE` sin `START-DATE` 11/11. Anti-509 **sí** cumple: 8.366/8.366 bloques con 1 URI. |
| S2 LL-HLS/CMAF | FAIL | **Declarado, no implementado**: 0 emisores de `EXT-X-PART`; el plano servido bloquea vídeo (`.ts/.m4s/.mp4` → 404). |
| S3+S4 Codec/HDR | WARN | HEVC declarado sin evidencia de códec (`ape-fallback-resolver.js:238`); 2 cruces reales de la GOLDEN RULE; mentira técnica viva en `ape_mesh.php:57-64` (`hdr_conversion_mode=1` ≠ SDR→HDR); LEVER B inerte. |
| S5 QoE | FAIL | **Cero métricas reales**: `computeStubQoE()` (5 constantes) alimenta el lazo como "QoE REAL"; `MOS=4.8/PSNR=42/VSTQ=50` fabricados en artefactos generados. |
| S6 nginx/Lua | PASS condicionado | Failover Brazil a 30 s vs primario 60 s; zonas `limit_conn` colgantes; los headers del player llegan al proveedor. En **HEAD** las 2 fases desplegadas son byte-idénticas a producción (la divergencia es del WT sucio). |
| S7 SRE | WARN / BLOCKED | `netshield-watchdog` se auto-mata y relanza cada ~125 s; **0 canales de alerta, 0 renovación TLS, 0 liveness** de los propios watchdogs, 0 gate post-deploy. |
| S8 Red | WARN (3 CRITICAL) | `wg0.conf` del repo **rompe `wg-quick up`**; los 3 túneles no son el estado medido (egreso directo por `eth0`); MTU 1380+60 > 1280 = PMTU black hole. |
| S9 Player | FAIL parcial | TiviMate single-value **solo documentado** (`emitTivimateSafe` = STANDARD + etiqueta); tags master-only en catálogo. |
| S10 Seguridad | FAIL | Claves WireGuard **commiteadas** (3 `.conf` + un `SKILL.md` que las embebe ×2 + `wg0.conf.BASELINE`); `prisma-control.php` fail-open con CORS `*`; `.gitignore` sin `*.conf` ni `channels_map.json`; 9.293 canales con credenciales visibles en la lista servida. |

**Scorecard ratificado (2026-10-27): 49 PASS / 68 FAIL / 2 BLOCKED / 15 NOT_RUN = 134 ítems.** Escalera: 53 crudo → 51 (−2 S8 calificados, AUD-03) → 50 (−1 S9 C1 "PASS con reserva") → **49** (−1 S10 `qoe-flush` "PASS condicionado", fila `S7_S10:151` dentro de la sección 7 = S10). S7 = `counts null`, fuera del conteo. Denominadores: **138** (crudo v1) · 136 (base 51, histórico) · **134** (ratificado). Los ítems se midieron en **blobs distintos** → publicar por blob, nunca una suma agregada (`AUD-05`). Ratificación: `gobierno/VALIDACION_DEL_CAPITAN.md`.

**VPS medido (2026-10-26 20:00Z, read-only):** nginx 1.24.0 + Lua (no OpenResty) · **HTTP/2 ausente** (módulo `v2` disponible) · 3 fases vivas `ape_header` `a15e1fe3` / `ape_uri_rebase` `1d456a46` / `ape_wake_on_manifest` `d9c6b65d` (idénticas a HEAD `e38a89b`; **con `d81ddb3` HEAD diverge en 2 de 3** — ver Trampa 11) · `/cdn/` = 443 → 8088 → gateway → `/_ape/_fetch` → proveedor (3× 302) → rebase → `no-store`; manifiesto medido **708 ms/636 B** · listas `/var/www/lists` 140,6 MB gz / **564 MB crudos** · UHD `declare_auto` reescribe `RESOLUTION` a 4K (u 8K si la fuente es ≥4K) con `uhd_auto=1`.

## ROSTER Y DAG (reconstrucción exacta)

### Miembros (8)
| Miembro | Disciplinas | Rol |
|---|---|---|
| `s1-hls-architect` | S1 | HLS/M3U8 RFC 8216, M3U Plus, Anti-509. Empaqueta al final. |
| `s2-llhls-cmaf` | S2 | LL-HLS/CMAF-fMP4. Dueño del ADN operativo. |
| `s3-codec-hdr` | S3+S4 | Codec RFC 6381 + color/HDR (informe dual con tablas separadas). |
| `s5-qoe-qos` | S5 | QoE/telemetría. Consolidador (recusado de su capítulo). |
| `s6-nginx-lua` | S6 | nginx/Lua, autopista, deriva repo↔producción. |
| `s7-sre-secops` | S7+S10 | SRE + seguridad. Dueño del harness. |
| `s8-net-tcp-quic` | S8 | TCP/QUIC/BBR/MTU/WireGuard. |
| `s9-player-compat` | S9 | Compatibilidad de player. Auditor independiente y recusado de su capítulo. |

### Tareas (13)
| ID | Tarea | Dueño | Depende de | Write scope |
|---|---|---|---|---|
| `c1..c8` | Council read-only (8 revisiones) | cada specialist | — | `audit/equipo10_operativo_<fecha>/council/` |
| `i1` | Harness con exit codes + **snapshot congelado** + hashes de informes | s7 | c1..c8 | `verificacion/`, `snapshot/` |
| `i2` | ADN operativo real (roster, contrato, protocolo, reemplazo de ficciones) | s2 | c1..c8 | `adn/` |
| `i3` | Consolidado + scorecard por dimensión + integridad de informes | s5 | c1..c8, i1, i2 | `consolidado/` |
| `i4` | Auditoría independiente (no-autor; audita S5, no su propio S9) | s9 | i3 | `auditoria/` |
| `i5` | Paquete con manifest SHA-256 + ZIP verificado por descompresión | s1 | i4 | `README.md`, `MANIFEST_SHA256.json`, `audit/*.zip` |

**Recusación obligatoria:** el consolidado marca su propio capítulo como `PENDIENTE_VALIDACION`; el capitán (no autor) valida el capítulo del auditor y escribe `gobierno/VALIDACION_DEL_CAPITAN.md`.

## Execution flow

1. **Cortex init + coordinación** — `iptv-cortex-init-mandatory` (scan 5 capas); `iptv-pre-edit-audit` si el scope toca archivos IPTV; y **leer `docs/COORDINACION_AGENTES.md` + `contracts/ownership_scopes.json`** para respetar scopes ajenos.
2. **Verificar identidad literal** — `agent_teams_status` y aplicar las **7 guardas de identidad**. Si el team no es exactamente `equipo-enterprise-10-adn` con los 8 member targets y el grafo `t1..t13`: **STOP**, reportar la diferencia y no convocar nada. Si existe y está completa: no recrear; ir a `--reanudar` o a tarea nueva del mismo team.
3. **Snapshot** — `git rev-parse --short HEAD`, `git status --porcelain`, y hash/estado del generador (`frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`). Si el WT difiere de `e38a89b` o muta durante la sesión, activar la **regla de blob** (Trampa 1) y congelar antes de citar.
4. **Construir el plan staged** — `agent_teams_create` con `approval="required"`, roster de 8 y las 13 tareas del DAG. Cada `executionPrompt` debe llevar: dominio, lecturas obligatorias (`AGENTS.md`, `CLAUDE.md`, `docs/manifestos/VPS_REALITY_MEASURED_2026-10-25.md`), las 6 reglas duras, formato de entrega y write scope.
5. **Presentar y parar** — el plan se revisa en la Web. `/equipo-10-adn` **no se autoaprueba**.
6. **Coordinar** (tras aprobación): el scheduler despacha. Reintentar fallos con `reassign_task`; nunca recrear tareas terminadas. En la ola de implementación, enviar a `s5`/`s9` la directiva de recusación y la regla de blob.
7. **Cerrar** — el capitán verifica el paquete (44 hashes, ZIP, extracción), corrige lo que el auditor marque y emite el veredicto final (PASS/FAIL). El team se mantiene vivo hasta que el propietario decida archivar.

## REGLAS DURAS (no negociables)

1. **Nada de ficción**: si un dato no es verificable → `no_verificado_por_el_miembro`, nunca un valor plausible.
2. **Nada de escrituras a producción/VPS** durante Council: cero ssh en modo escritura, cero reload, cero install/habilitar unidades. Lectura sí (doctrina `iptv-vps-touch-nothing`).
3. **Nada de secretos**: barrido con `archivo:línea` + `***`; jamás el valor.
4. **Nada de PASS sin comando**: cada PASS lleva comando y exit code, o `archivo:línea` reproducible.
5. **Nada de sumas entre blobs**: totales agrupados por blob.
6. **Nada de autoaprobación**: autor ≠ consolidador ≠ auditor; el capitán valida lo que el auditor no puede.
7. **Nada de borrar FAILs**: un informe con FAIL se entrega con su FAIL y su errata.
8. **No tocar el generador ni las listas** para "cuadrar" la documentación (doctrina `iptv-vps-touch-nothing` + D-25/D-32).

## TRAMPAS CONOCIDAS (cada una costó una ronda)

1. **El working tree muta.** Medido: el generador pasó por **6 estados en 7 observaciones** (21.581 → 11.443 → 11.459 → 11.524 → 11.524 → 11.519 → 11.520 → 11.644 líneas) porque **otra sesión** lo edita en paralelo (backups `_backups/frontend/js/ape-v9/before-t52/t61/t72…`). Única coordenada estable: blob HEAD `c1277bdf`. **Congelar** `git show HEAD:<path>` + WT a `snapshot/` y citar el blob, nunca el archivo vivo.
2. **Artefacto viejo presentado como actual.** `audit_bulletproof_output.m3u8` viola RFC de verdad, pero sus claves `X-Codec-Audio`/`X-Codec-Primary` (10/10) lo datan antes de 2026-05-12: es evidencia **contra ese artefacto**, no contra HEAD.
3. **Citas que no existen.** El auditor encontró 5 coordenadas de S1 inexistentes en cualquier blob (12.930 / 13.008 / 19.941 sobre 11.144 líneas). Anclas correctas: `I-FRAME` `:2764/:9617`, `VERSION:9` `:2355/:2690/:2740`, `SESSION-DATA` `:2458`.
4. **Doble conteo de PASS calificados.** Si un ítem es "PASS parcial", "con reserva" o "condicionado" **no suma como PASS**. El scorecard crudo 53 → 51 → 50 → **49** (ratificado).
5. **El edge declara resolución que no tiene.** `ape_uhd.declare_auto` reescribe `RESOLUTION` a 4K/8K con `uhd_auto=1`. Declarar resolución no crea píxeles: puede romper ABR/decoder. Para fluidez: verdad de fuente o gate por device, y **jamás** tocar `CODECS=`.
6. **`/cdn/` paga 2 hops + 302 del proveedor y devuelve `no-store`.** Manifiesto 708 ms. Cachear destino de 302 y colapsar el hop 443→8088; HTTP/2 está absent (módulo `v2` disponible).
7. **Credenciales en la lista servida.** Las URLs de canal llevan `proveedor/live/<user>/<pass>/<id>.m3u8`. Cualquier informe que las cite debe redactar; la corrección real exige generador (fuera de este contrato).
8. **Inventarios doctrinales desfasados.** `skills_index` 306 vs **308** en disco; `.claude/agents` **15** vs 10 doctrinales; `.claude/commands` **9** vs 7. Citar el número medido, no el doctrinal.
9. **El paquete ADN original NO se importó a DSH** y no debe afirmarse lo contrario. El ZIP vive fuera del repo (ruta de adjuntos), SHA-256 `ad40f159…bb408`, 3.220.130 B.
10. **`resolve.php` con `TOKEN_MODE='none'` y `REQUIRE_SIG=false`**: cualquiera con la URL obtiene el fragmento. Es deuda, no un PASS de seguridad.
11. **HEAD se movió y el WIP se commiteó.** `d81ddb3` (2026-10-27) incorporó el worktree sucio de ciclo 1: `ape_header.lua` HEAD = **8.088 B** y `ape_uri_rebase.lua` HEAD = **9.930 B**, ambos **≠ producción** (2.210 / 6.043 B); solo `ape_wake_on_manifest.lua` (2.284 B) sigue idéntico. `X1/X2` del contexto quedó invertido: hoy **desplegar HEAD cambiaría 2 de las 3 fases vivas**. Antes de citar «HEAD == prod», re-medir.

## VERIFICACIÓN (gates mecánicos)

```bash
git rev-parse --short HEAD                                   # snapshot declarado
node -c IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-fallback-resolver.js
node -c IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
node -e "JSON.parse(require('fs').readFileSync('.agents/skills_index.json','utf8'))"
# conteos que no deben divergir sin declararlo:
#   skills_index vs .agents/skills/ (306 vs 308) · .claude/agents (15) · .claude/commands (9)
# secretos: buscar PrivateKey/PresharedKey/API keys SIN imprimir valores
# headers tóxicos: Range, If-None-Match, If-Modified-Since, TE, Priority, Upgrade-Insecure-Requests
# paquete: MANIFEST_SHA256.json 44/44 + ZIP con hash + extracción comparada
```

## Outputs

- Plan staged en Web (`agent_teams_create` + `agent_teams_edit_plan`), nunca autoaprobado.
- Entregables en `audit/equipo10_operativo_<fecha>/`: `council/` (8), `verificacion/`, `snapshot/`, `adn/`, `consolidado/`, `auditoria/`, `gobierno/`, `README.md`, `MANIFEST_SHA256.json`.
- Paquete: `audit/EQUIPO_10_OPERATIVO_<fecha>.zip` + `audit/EQUIPO_10_ENTREGA.json`.
- Veredicto final del capitán: `PASS` solo si el auditor independiente no deja HIGH; si deja, se entrega `FAIL` con errata.
- Exit code: `0` PASS · `1` WARN/condicionado · `2` BLOCK/FAIL.

## Doctrines enforced

- `iptv-cortex-init-mandatory` · `iptv-pre-edit-audit` · `iptv-vps-touch-nothing` · `iptv-omega-no-delete` · `iptv-no-hardcode-doctrine`
- Regla legal/ética cardinal: solo fuentes, credenciales y tráfico **autorizados por el propietario**.
- "No mocks · No datos falsos · No falsos PASS · No romper lo existente · No asumir: medir".

## Permission gates (NUNCA se saltan sin OK explícito del propietario)

- Aprobación del plan en la Web (el comando no se autoaprueba).
- Cualquier escritura al VPS, reload de nginx o cambio de flags: **requiere autorización expresa** y backup previo.
- Creación/rotación de credenciales y purga de historial git: solo el propietario.
- Commits: sin autocommit.
- Borrado/archivado del team: solo con autorización.

## Examples

### A — convocatoria completa
```
/equipo-10-adn
```
Construye plan staged (8 miembros, 13 tareas), lo presenta y espera aprobación en la Web.

### B — solo el Council, para refrescar veredictos
```
/equipo-10-adn --fase council --foco S6,S8
```
Dos revisiones read-only sobre el snapshot actual; sin implementación.

### C — reanudar tras un fallo de transporte
```
/equipo-10-adn --reanudar
```
Inspecciona el team, reintenta la tarea fallida con `reassign_task` y conserva el contrato.

### D — el repo cambió de HEAD
```
/equipo-10-adn --refrescar
```
Declara el contexto aprendido como histórico, re-mide y congela el nuevo snapshot; no cita el paquete anterior como vigente.

# CONTRATO DE ORDEN — plantilla operativa real

**Origen:** `_inbox_EQUIPO_ADN/EQUIPO_ENTERPRISE_10_COUNCIL_ADN/01_PROTOCOLO_DE_COORDINACION.md:3-4` (lista de campos) + `00_DIRECTRIZ_COMUN.txt:18` (exigencia antes de efectos).
**Adaptación:** los campos se conservan; los **valores** salen de `.agent-teams/equipo-enterprise-10-adn/team.json` (estado real del runtime) y del estado del repo. Donde el runtime no tiene el campo, se dice.
**Regla de oro:** un campo sin fuente verificable se marca `no_verificado_por_el_miembro`; **nunca** se rellena con un valor verosímil.

---

## 1. Los 16 campos

| # | Campo | Definición operativa | Fuente real | Obligatorio | Si falta o es falso |
|---|---|---|---|---|---|
| 1 | `run_id` | Identificador de la ejecución completa | **No existe en `team.json`** → convención derivada: `<team_id>/<AAAA-MM-DD>` = `equipo-enterprise-10-adn/2026-10-26` | Sí | `NEEDS_PLAN` |
| 2 | `phase_id` | Fase del ciclo: `cN` Council · `iN` implementación · `i4` auditoría · `i5` integración | `team.json` campo `profileSeedId` de cada tarea (`t1`=`c1` … `t13`=`i5`; p.ej. `team.json:1066`) | Sí | La orden no se despacha |
| 3 | `requirement_id` | Requisito que la orden satisface = `profileSeedId` de la semilla + subject de la tarea | `team.json:1067` (subject) | Sí | `NEEDS_PLAN` |
| 4 | `task_id` | Id único en la lista compartida | `team.json:1065` (`t10`) | Sí | No hay claim posible |
| 5 | `dueño` | Miembro que ejecuta; **uno solo** | `team.json` `assignee` (`:1070` para `t10`) | Sí | `BLOCKED` |
| 6 | `supervisor` | Capitán del team (fuera de los 8 miembros) | El prompt de asignación declara "The captain is also your parent"; su id de sesión **no consta en `team.json`** → `no_verificado_por_el_miembro` para los otros 7 | Sí | Escalar al capitán |
| 7 | `snapshot/SHA` | Commit citado **y** digest del working tree | `git rev-parse HEAD` → `e38a89bb30c02cb41050f34cef43d3711a2b0644`; `git status --porcelain` → 57 rutas sucias; artefactos de pinneado en `audit/equipo10_operativo_2026-10-26/snapshot/` (`SNAPSHOT.json`, `REPORT_HASHES.json`, `REGLA_DE_ORIGEN.md`) | Sí | Toda cita `archivo:línea` queda ambigua ⇒ `NOT_RUN` |
| 8 | `entradas` | Inputs leídos, con ruta y (si aplica) SHA | Paquete: 6 documentos + `team.json` + los 8 informes de `council/` (SHA en `adn/EQUIPO_10_OPERATIVO.json` → `council_deliverables`) | Sí | `BLOCKED` |
| 9 | `write scopes` | Rutas que el dueño puede escribir; el resto es read-only | `t10` → `audit/equipo10_operativo_2026-10-26/adn/` (`team.json:1068`, primera línea de ENTREGABLES) | Sí | Escritura fuera de scope = violación, se revierte |
| 10 | `entregables` | Archivos exactos + criterio de "hecho" | `adn/EQUIPO_10_OPERATIVO.json`, `CONTRATO_DE_ORDEN.md`, `PROTOCOLO_COUNCIL.md`, `REEMPLAZO_DE_FICCIONES.md` | Sí | `FAIL` |
| 11 | `dependencias` | Tareas que deben estar `completed` | `t10` declara `t1..t8` (`team.json:1071-1080`); `t11` declara `t1..t10` (`:1094-1105`); `t12` de `t11`; `t13` de `t12` | Sí | Arrancar antes = trabajo inválido |
| 12 | `aceptación` | Criterios medibles, en orden | `t10`: 4 entregables + validación de paquete + validación de rutas + sin ficción (ver §2) | Sí | No se puede marcar `completed` |
| 13 | `presupuesto` | Coste/tiempo acordado antes de revisar | **No existe campo en `team.json`** → presupuesto operativo declarado: 1 intento (`attempt: 1`) por tarea; sin límite de tokens declarado ⇒ `no_verificado_por_el_miembro` | Sí | Sin presupuesto no hay dimensión "eficiencia" evaluable (`09_JERARQUIA_MERITO_Y_MANDO.md:13`) |
| 14 | `herramientas` | Superficie real disponible y límites | Superficie DSH de esta sesión: `agent_teams_claim_task/update_task/send_message/status`, `read`, `grep`, `glob`, `pwsh`, `write`/`edit` (restringido por contrato a la ruta propia). **El catálogo de 271 nombres del paquete no es esta superficie** (`08_PERMISOS_Y_HERRAMIENTAS.md:5` advierte que no acredita editor ni terminal; `:3` que su presencia no demuestra instalación) | Sí | `BLOCKED` por capacidad |
| 15 | `evidencia` | `archivo:línea` o `comando`+exit por afirmación; PASS/FAIL/BLOCKED/NOT_RUN | Reglas R1-R6 en `team.json:46,48`; formato del Council en `01_PROTOCOLO_DE_COORDINACION.md:7` | Sí | Afirmación sin fuente = no afirmación |
| 16 | `rollback` | Cómo se deshace sin tocar estado ajeno | Docs: `adn/` es nuevo y no versionado ⇒ borrar el directorio restaura el estado previo; si ya está versionado, `git checkout -- <ruta>`. **Prohibido** "rollback" editando `.agent-teams/` a mano (sólo `agent_teams_*`) | Sí | Sin rollback declarado no se autoriza efecto |

---

## 2. Orden REAL ejecutada (ejemplo completo: `t10` / `i2`)

```yaml
run_id: equipo-enterprise-10-adn/2026-10-26
phase_id: i2
requirement_id: i2 · "Implementación · ADN operativo real: roster, contrato de orden y protocolo Council (sin ficción)"   # team.json:1067
task_id: t10
dueño: s2-llhls-cmaf
supervisor: capitán del team (fuera de los 8; id de sesión no_verificado_por_el_miembro)
attempt_id: d49283d8-e0be-46c1-9df0-296a477a02ff
snapshot:
  head: e38a89bb30c02cb41050f34cef43d3711a2b0644
  working_tree: 57 rutas sucias (include de terceros, no mías)
  pin: audit/equipo10_operativo_2026-10-26/snapshot/{SNAPSHOT.json,REPORT_HASHES.json}
entradas:
  - _inbox_EQUIPO_ADN/EQUIPO_ENTERPRISE_10_COUNCIL_ADN/{RESUMEN_EQUIPO_ENTERPRISE_10.txt,00_DIRECTRIZ_COMUN.txt,01_PROTOCOLO_DE_COORDINACION.md,06_VERIFICACION_DEL_PAQUETE.txt,08_PERMISOS_Y_HERRAMIENTAS.md,09_JERARQUIA_MERITO_Y_MANDO.md,OBJETIVO_DECLARADO.md,MANIFIESTO_SHA256.txt}
  - .agent-teams/equipo-enterprise-10-adn/team.json
  - audit/equipo10_operativo_2026-10-26/council/*.md   (8 informes, SHA-256 en el roster)
write_scopes: [audit/equipo10_operativo_2026-10-26/adn/]
entregables:
  - adn/EQUIPO_10_OPERATIVO.json
  - adn/CONTRATO_DE_ORDEN.md
  - adn/PROTOCOLO_COUNCIL.md
  - adn/REEMPLAZO_DE_FICCIONES.md
dependencias: [t1,t2,t3,t4,t5,t6,t7,t8]   # team.json:1071-1080
aceptacion:
  - los 4 entregables existen y son legibles / JSON parsea
  - SHA-256 del ZIP declarado verificado o declarado NOT_RUN con causa
  - entradas del paquete contadas y coincidentes
  - toda ruta de entregable declarada: escribible (prueba o evidencia de escritura previa)
  - 0 personas/CVs/certificaciones/modelos/métricas inventadas
presupuesto: 1 intento; tokens no declarados (no_verificado_por_el_miembro)
herramientas: agent_teams_* + read/grep/glob/pwsh/write (alcance propio)
evidencia: este documento + EQUIPO_10_OPERATIVO.json (§validacion_paquete, §validacion_rutas, §council_deliverables)
rollback: Remove-Item -Recurse audit/equipo10_operativo_2026-10-26/adn  (directorio nuevo; no revierte estado del team)
```

---

## 3. Reglas de rechazo (lo que NO se acepta)

| Situación | Resultado | Acción |
|---|---|---|
| Falta `run_id`/`phase_id`/`snapshot`/`aceptación` | `NEEDS_PLAN` | No se despacha; el capitán completa la orden |
| `task_id` ya `completed` y se reusa para trabajo nuevo | Rechazo | Abrir tarea nueva; los terminales son inmutables |
| `attempt_id` stale (reintento/reasignación) | Stop | El miembro deja de tocar la tarea y espera orden nueva |
| Escritura fuera de `write scopes` | Violación | Revertir y registrar el incidente |
| Afirmación sin `archivo:línea`/comando | Hallazgo | Se degrada a `NOT_RUN` |
| Prueba no ejecutada presentada como PASS | Falsificación | `FAIL` del entregable + hallazgo de auditoría |
| Secreto impreso | Violación R3 | Sustituir por `archivo:línea` + `***`; rotar fuera de este proceso |
| Dependencia no `completed` | `BLOCKED` | Esperar al scheduler |

---

## 4. Cierre de la orden

1. `agent_teams_update_task(task_id, attempt_id, status=completed|failed, output, acceptanceResults[], commandsRun[], changedPaths[])` — `attempt_id` **obligatorio** en cada llamada.
2. `status=completed` sólo si **todos** los criterios de aceptación están `passed`; un criterio fallido ⇒ `failed` (nunca "completed con notas").
3. `agent_teams_send_message(to=captain, source_task_id, source_attempt_id)` con ruta + totales.
4. Evidencia tardía: `acceptanceResults`/`commandsRun`/`evidence_note` **append-only** sobre la tarea original; no cambia el veredicto y no reabre el trabajo.
5. Lo que este contrato **no** hace: no aprueba nada por sí mismo. La aceptación final de la cadena es `t12` (auditoría por no-autor) y `t13` (paquete con manifest SHA-256).

---

## 5. Diferencias declaradas frente al contrato del paquete ficticio

| Campo | Paquete (ficción) | Team real | Motivo |
|---|---|---|---|
| `dueño` | `P01..P10` con UUID y organigrama de 3 niveles (`RESUMEN_EQUIPO_ENTERPRISE_10.txt:11-20`) | 8 miembros `s1..s9` con UUID real y sin subordinados (`team.json:8-233`) | El runtime limita a 8; no hay organigrama interno que administrar |
| `supervisor` | Cadena hasta CEO `P01` (`09_JERARQUIA_MERITO_Y_MANDO.md:5`) | Capitán único + Owner | No existe CEO ni 3 niveles en este team |
| `herramientas` | Allowlist por perfil de 271 nombres (`08_PERMISOS_Y_HERRAMIENTAS.md:31-129`) | Superficie DSH observada, sin `toolScope` por agente | El catálogo no incluye editor/terminal (`08:5`) y su presencia no prueba instalación (`08:3`) |
| `presupuesto` | Acordado antes de revisar; eficiencia = presupuesto/coste (`09:13`) | No declarado (`no_verificado_por_el_miembro`) | `team.json` no tiene campo de presupuesto |
| `rollback` | Publicación sólo por Release (`01_PROTOCOLO_DE_COORDINACION.md:10`) | Reversión por borrado/revert del entregable; no hay Release | No hay pipeline de publicación en este repo |

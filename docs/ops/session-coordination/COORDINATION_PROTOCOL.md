# COORDINATION PROTOCOL — IPTV Navigator PRO v5.4

> **Protocolo de claims inter-sesión.** Léelo **antes** de escribir un solo byte en este repo,
> antes de correr un gate que muta estado, y **antes** de tocar el VPS.
> Creado por `coord-sesiones` (equipo `alineacion-omni-crystal-1025`, tarea `t2`, attempt
> `1f268383-adc3-4bab-957f-ed686efd32ca`) el **2026-10-25T22:43:17-05:00**.
>
> **Estado real medido cuando se escribió esto:** 14 grupos de workspace en
> `$env:DSH_HOME\sessions`, de los cuales el grupo IPTV contiene **28 directorios de sesión**
> (6 retirados en `.agent-teams/retired-members.json`), **3 equipos** en `.agent-teams/`
> (`alineacion-omni-crystal-1025`, `auditoria-roku-universal-rea`, `rea-recon`) más
> `archive/media-fanout`, **17 archivos tracked modificados** y **3172 borrados** sin commitear.
> Con ese cuadro, "escribir y avisar después" ya causó al menos una violación de lock registrada.

---

## 0 · TL;DR para una sesión nueva

```bash
# 1. Estado: ¿quién tiene qué?
node tools/session-guard.js status
node -e "const b=require('./.agent-teams/session-board/BOARD.json');console.log(b.claims.map(c=>c.id+' '+c.mode+' '+c.scope.join(',')).join('\n'))"

# 2. Antes de escribir: guard (falla con exit 1 si un lock ajeno cubre tu ruta)
node tools/session-guard.js guard <ruta1> <ruta2> ...

# 3. Reclama (crea lock a tu nombre) y publica el aviso
node tools/session-guard.js claim <ruta> --task tNN --reason "motivo"
# + una línea nueva en docs/ops/session-coordination/notices.jsonl (append-only)
# + tu entrada en .agent-teams/session-board/BOARD.json → claims[]

# 4. Heartbeat mientras trabajas (cada ≤15 min si la tarea pasa de 15 min)

# 5. Al cerrar: release + aviso de cierre con el sha256 del artefacto
node tools/session-guard.js release <ruta>
```

Si **ya existe** un lock o claim ajeno sobre tu ruta: **no escribas**. Registra el conflicto y escala (§7).

---

## 1 · Qué problema resuelve y qué NO resuelve

**Resuelve** la pregunta "¿puedo escribir este archivo ahora sin destruir el trabajo de otra sesión?" con
tres propiedades: (a) se responde en <5 s, (b) la respuesta queda registrada con evidencia verificable
(ruta + dueño + hora + sha256), (c) la respuesta caduca sola (TTL) para que un proceso muerto no congele
el repo para siempre.

**NO resuelve** — y es honesto decirlo:

| No es | Por qué |
|---|---|
| Un sistema de locks distribuido | Vive en el árbol de trabajo local. No hay servidor, ni leases, ni quorum. |
| Un sustituto de `git` | Git sigue siendo la verdad de los bytes. Un lock no impide un `git checkout -- .` |
| Un sustituto de `.agent/COORDINATION.md` | Ese documento es el **canal de hand-off narrativo**; éste es el **registro operativo de claims**. Conviven (§8). |
| Un sustituto de `tools/session-guard.js` | Ese guard **bloquea** (exit 1). Este protocolo lo **usa** y le añade la capa de avisos y del tablero (§9). |

---

## 2 · Las tres capas (y cuál manda en cada cosa)

| Capa | Artefacto | Autoridad sobre | Dueño actual |
|---|---|---|---|
| **Enforcement** (bloquea) | `tools/session-guard.js` + `.session/locks.json` | *quién puede escribir* una ruta AHORA | `dsh-lead` |
| **Avisos / proyección** (informa) | `.agent-teams/session-board/BOARD.json` + `docs/ops/session-coordination/notices.jsonl` | *qué está pasando*, claims de lectura, cola, conflictos | equipo de auditoría (`coord-sesiones`) |
| **Hand-off narrativo** (explica) | `.agent/COORDINATION.md` (+ `COORDENADAS_SESIONES.md` de la otra sesión) | *por qué* se hizo y qué quedó pendiente | histórico: Agent E/F/G · hoy: `dsh-lead` |

**Regla de precedencia, sin ambigüedad:**

```
Para PERMISO DE ESCRITURA ....... manda .session/locks.json   (unión con el ledger humano: gana el más restrictivo)
Para SABER QUÉ ESTÁ EN VUELO ..... manda BOARD.json           (proyección + claims de lectura)
Para ENTENDER EL CONTEXTO ....... mandan COORDINATION.md / COORDENADAS_SESIONES.md
Si dos capas se contradicen .... gana la MÁS RESTRICTIVA, y se abre un conflicto (§7)
```

> Esta jerarquía es la corrección del conflicto **X-001** (ver `.agent-teams/session-board/BOARD.json`):
> antes existían dos mecanismos vivos que se ignoraban mutuamente.

---

## 3 · Anatomía de un claim

Un claim es un objeto con **seis campos obligatorios**. Sin los seis, no es un claim: es un comentario.

```json
{
  "id": "C-007",
  "session_id": "<DSH_SESSION_ID>",
  "agent": "<nombre-legible-de-la-sesion>",
  "team": "alineacion-omni-crystal-1025",
  "task": "tNN",
  "mode": "read | write | write-prepend-only",
  "scope": ["ruta/exacta", "directorio/**", "*.glob"],
  "intent": "qué vas a hacer, en una frase verificable",
  "created_at": "2026-10-25T22:43:17-05:00",
  "ttl_minutes": 120,
  "expires_at": "2026-10-26T00:43:17-05:00",
  "heartbeat_at": "2026-10-25T22:43:17-05:00",
  "state": "active | released | expired | preempted",
  "conflicts": ["X-00N"]
}
```

### 3.1 Reglas de `scope`

1. **Globs anclados, no comodines sueltos.** `frontend/js/ape-v9/**` ✅ · `**/*.php` ❌ (reclama el repo entero).
2. **Un claim = un área coherente.** No mezclar `docs/**` con `backend/**` en el mismo claim.
3. **Nunca reclamar lo ajeno para "protegerse".** Un claim de escritura sobre una ruta que no vas a
   tocar es una denial-of-service de coordinación. Para eso existe `mode: "read"`.
4. **Rutas de producción del VPS no se reclaman aquí** — no viven en este repo. Se declaran en
   `COORDENADAS_SESIONES.md` §4 (lock de despliegue) con 15 min de margen.
5. **Los globs del `no_touch` del board son intocables** salvo que su dueño libere. Ver
   `.agent-teams/session-board/BOARD.json → no_touch[]` (18 entradas al crear este protocolo).

### 3.2 TTL por tipo de trabajo

| Tipo | TTL | Por qué |
|---|---|---|
| Fix puntual de un archivo | **30 min** | Si tardas más, o el fix es más grande de lo que dijiste, o moriste. |
| Entregable documental | **120 min** | Es lo que usa este tablero. |
| Auditoría read-only de un área | **120 min** | Caduca y se renueva con heartbeat. |
| Migración multi-archivo | **240 min máx.** + heartbeats obligatorios | Nunca TTL infinito: un lock huérfano bloquea a 28 sesiones. |
| Deploy VPS | **no aplica TTL** | Va por `COORDENADAS_SESIONES.md` §4: ventana declarada + rollback escrito. |

**Regla del TTL vencido:** pasada `expires_at` sin heartbeat, el claim queda `expired` y **la ruta se
considera libre para el siguiente que llegue**, que debe registrar en `notices.jsonl` que tomó una ruta
con claim vencido (con `evidencia` = el claim vencido). No se pide permiso al ausente: se documenta.

---

## 4 · Los cuatro verbos

### 4.1 CLAIM (antes de escribir — obligatorio, sin excepciones)

```bash
# capa enforcement
node tools/session-guard.js claim <ruta> --task tNN --reason "motivo concreto"

# capa avisos: append a notices.jsonl (UNA línea, nunca reescribir el archivo)
# y entrada en BOARD.json → claims[]
```

**Cuándo:** antes del **primer** `Edit`/`Write`/`Bash` que muta. También antes de crear un directorio
nuevo de entregables (reclamar el glob del directorio, no cada archivo).

**Excepción única:** claims de `mode: "read"` para censos. No requieren `session-guard` (no bloquean),
pero **sí** se publican en el board, porque si no el inventario miente por omisión.

### 4.2 HEARTBEAT (mientras trabajas)

```bash
node tools/session-guard.js heartbeat            # refresca presencia
# y actualizar "heartbeat_at" del claim en BOARD.json
```

| Situación | Intervalo |
|---|---|
| Claim con TTL ≤ 60 min | al empezar y al cerrar (mínimo) |
| Claim con TTL > 60 min | **cada 30 min**, o pierdes el claim |
| Trabajo bloqueado esperando a otro | heartbeat igual: sigues siendo el dueño |

Un claim sin heartbeat **no es prueba de nada**: es una intención. La prueba es el sha256 del artefacto
en el aviso de cierre.

### 4.3 RELEASE (al terminar — es parte de terminar)

```bash
node tools/session-guard.js release <ruta>
```

Y en el aviso de cierre, **la evidencia**: `{ "tipo": "sha256", "ref": "<ruta>", "detalle": "<hash> / <bytes> bytes" }`.
**Terminar sin release es dejar una trampa**: la siguiente sesión verá un lock vivo sobre trabajo muerto.

### 4.4 AVISO DE INICIO / CIERRE

Formato exacto (una línea JSON en `notices.jsonl`, `estado` ∈ `claim|heartbeat|release|close|conflict|violation|note`):

```json
{"ts":"<ISO-8601 con offset>","event_id":"E-NNNN","session_id":"<DSH_SESSION_ID>","agente":"<nombre>","team":"<team>","task":"tNN","estado":"close","scope":["<ruta>"],"mode":"write","intent":"<una frase>","evidencia":[{"tipo":"sha256","ref":"<ruta>","detalle":"<hash> / <bytes> bytes"}],"conflicts":[]}
```

**Cierre mínimo publicable:** `estado:"close"` + al menos un objeto en `evidencia` con hash o conteo.
Un cierre sin evidencia se registra igual (append-only) pero se marca `"evidencia":[]` → el verificador
lo tratará como **no verificado**.

---

## 5 · Qué hacer si el claim está ocupado

Orden de acciones, sin saltarse ninguna:

| # | Si el claim/lock ajeno está… | Acción | Quién decide |
|---|---|---|---|
| 1 | **vigente y con heartbeat reciente** | **No escribas.** Trabaja en otra ruta de tu propia lane. Registra `note` en `notices.jsonl`. | tú |
| 2 | vigente pero **tu trabajo es read-only** | Procede, pero con `mode:"read"` y **citando el sha256** de lo que leíste; re-verifica antes de publicar (el archivo puede cambiar debajo). | tú |
| 3 | **vencido** (`now > expires_at`, sin heartbeat) | Tómalo. Registra `estado:"claim"` con `evidencia` = el claim vencido (id + expires_at). No pidas permiso a un ausente. | tú |
| 4 | vigente y **tú tienes evidencia de que está mal** (p. ej. su tarea ya cerró) | Escala al dueño del lock **y** al usuario/capitán. No liberes tú el lock ajeno. | dueño / usuario |
| 5 | vigente y **el trabajo es urgente e incompatible** | Escala. Se resuelve por prioridad declarada, no por velocidad de escritura. | **usuario (HFRC)** |

### 5.1 Regla del primero que llega (con límite)

> **Quien registra el claim primero gana, hasta que su TTL expire.**

Corolarios que la hacen usable:
- Ganar no es eterno: el TTL es parte del claim, no una cortesía.
- Ganar no autoriza a reescribir la historia: el dueño previo puede tener trabajo sin commitear
  (hoy hay 17 archivos tracked modificados). Un claim **no** legitima un `git checkout`, `git stash`
  ni un revert sobre bytes ajenos.
- Si dos claims del mismo `created_at` (empate real): gana el `event_id` menor en `notices.jsonl`
  (el log es el árbitro porque es append-only y no se puede reescribir).

---

## 6 · Regla anti bare-commit (dura)

**Prohibido, sin excepciones, mientras haya trabajo en vuelo:**

```bash
git add -A          # ❌ arrastra los 69 untracked (incluye .agent-teams/, .session/, docs/evidence/)
git add .           # ❌ ídem
git commit -a       # ❌ commitea los 17 tracked modificados ajenos
git commit --amend  # ❌ sobre un commit que otra sesión ya citó como evidencia
```

**Estado real que motiva esta regla (medido 2026-10-25T22:43-05:00):**

```
git status --short  → 3258 líneas:  17 M · 3172 D · 69 ??
git diff --stat     → 3189 files changed, 1318 insertions(+), 6685 deletions(-)
git diff --cached   → vacío (0 archivos staged)
```

**Commit quirúrgico obligatorio:**

```bash
# 1. listar explícitamente lo TUYO (nunca un glob que puedas no controlar)
git add -- <ruta1> <ruta2> ...

# 2. verificar que el índice solo tiene lo tuyo
git diff --cached --name-status

# 3. commit con formato doctrinal (AGENTS.md)
git commit -m "docs(ops): add inter-session coordination protocol and claims board"

# 4. verificar que no arrastraste nada
git show --stat --oneline HEAD
```

Reglas adicionales:
- **Nunca** commitear los 3172 `D` de `upload-server/target/**`, `test_zip/target/**`,
  `stream_probe_server/**`, `backup_master_v5.4_phantom_engine/frontend/tools/**`: son artefactos de build
  borrados. Restaurarlos o commitear su borrado es una decisión del dueño, no de un auditor.
- **Nunca** `git commit --amend` si otra sesión ya citó el sha. Se corrige con un commit nuevo.
- **Antes** de commitear: anuncio en el board (`estado:"note"`, `intent:"voy a commitear <rutas>"`).
- **Nunca** `git clean`, `git reset --hard`, `git checkout -- .` en este árbol. Destruyen trabajo ajeno
  no recuperable (los 69 untracked incluyen `.session/locks.json`, `.agent-teams/**`, `docs/evidence/**`).

---

## 7 · Resolución de conflictos

### 7.1 Cuándo se declara conflicto

Se abre un conflicto (`X-00N` en `BOARD.json → conflicts[]`) cuando **al menos una** es cierta:

1. Dos claims `write` con scopes que se intersectan.
2. Un lock de `session-guard` + un claim `write` propio sobre la misma ruta.
3. El ledger humano declara un lock que el estado máquina no tiene (o al revés) → **drift**.
4. Una escritura ocurrió sin claim previo → `estado:"violation"` en `notices.jsonl`.
5. La misma ruta aparece modificada sin commitear por una sesión y auditada por otra.

### 7.2 Severidades

| Sev | Significado | Efecto |
|---|---|---|
| `critical` | Ya se corrompió trabajo (bytes ajenos perdidos/sobrescritos) | Parar el trabajo de esa ruta y escalar **inmediato** al usuario |
| `high` | Dos dueños posibles de la misma ruta, o drift ledger↔guard | Bloquea `write` en esa ruta hasta resolución |
| `medium` | Riesgo de veredicto obsoleto (archivo cambia durante auditoría) | Obliga a re-verificar hash antes de publicar |
| `info` | Coexistencia de raíces documentales paralelas | Se documenta y se cita, no bloquea |

### 7.3 Escalado

```
conflicto detectado
  ├─ ¿el dueño está vivo (heartbeat < TTL)? → mensaje directo al dueño + nota en el board
  │     └─ sin respuesta en el TTL del claim → escala al capitán del equipo
  └─ ¿hay riesgo de pérdida de bytes o de deploy? → escala al USUARIO (HFRC) de inmediato
```

El usuario es el **árbitro final** (así lo dice `.agent/COORDINATION.md:253`
—"If Agent B has different conventions, the user (HFRC) is the tiebreaker"). Ninguna sesión
desbloquea por su cuenta un conflicto `critical` o `high`.

### 7.4 Conflictos abiertos al crear este protocolo

| ID | Sev | Qué |
|---|---|---|
| X-001 | high | Autoridad de coordinación duplicada: `COORDENADAS_SESIONES.md`+`session-guard` vs este board |
| X-002 | high | `L-001` (t44) bloquea `frontend/js/**` mientras t6 debe auditarlo |
| X-003 | medium | Drift: el ledger humano declara 5 locks que `.session/locks.json` no tiene |
| X-004 | medium | 17 archivos modificados sin commitear: riesgo de bare-commit |
| X-005 | info | `audit/alignment/` (equipo) vs `audit_teams_REA/` (otra sesión): dos verdades documentales |

Detalle con evidencia en `.agent-teams/session-board/BOARD.json → conflicts[]`.

---

## 8 · Compatibilidad con `.agent/COORDINATION.md`

`.agent/COORDINATION.md` (16805 bytes, sha256 `34886296…E591`, mtime 2026-05-18) es el **canal histórico
de hand-off**: `iptv-cortex-init-mandatory` lo lee como Capa 1 en cada sesión nueva. Este protocolo **no lo
reemplaza ni lo reescribe**:

| Aspecto | `.agent/COORDINATION.md` | Este protocolo |
|---|---|---|
| Naturaleza | Narrativo, humano, por sesión | Operativo, máquina-legible, por ruta |
| Granularidad | "qué hice / qué falta" | "qué ruta, quién, hasta cuándo" |
| Escritura | append / secciones por agente | append-only (`notices.jsonl`) + revisión del board |
| Lectura | obligatoria al inicio de sesión | obligatoria antes de la primera escritura |
| Autoridad | contexto e intención | permiso y conflicto |

### 8.1 Cómo se enlazan

1. En `.agent/COORDINATION.md` se hizo un **PREPEND** de una sección `## TABLERO VIVO` que apunta al board.
   El contenido previo **no se tocó**: se preservó byte a byte y se verificó por hash del sufijo.
2. El backup previo quedó en `.agent/COORDINATION.md.bak_<timestamp>` — restauración trivial:
   `Copy-Item .agent/COORDINATION.md.bak_<ts> .agent/COORDINATION.md -Force`.
3. Toda sesión nueva lee `COORDINATION.md` primero (cortex Capa 1) y **desde ahí** llega al board.
4. Las decisiones doctrinales (qué se construyó, por qué) siguen yendo en `COORDINATION.md`.
   Los permisos y avisos van al board. **No se duplica contenido entre ambos.**

### 8.2 Regla de no-regresión del documento

- **Prohibido reescribir** `.agent/COORDINATION.md` completo. Solo `append` o `prepend` de secciones.
- **Prohibido** borrar filas de "Active locks" o de "Completed work": son historia auditable.
- Si una entrada quedó falsa, se **anota debajo** (con fecha) en vez de editarla.

---

## 9 · Convivencia con `tools/session-guard.js` (mecanismo de `dsh-lead`)

Ya existía — y estaba en uso — un mecanismo de coordinación de otra sesión cuando se escribió este
protocolo. **No se duplica: se integra.**

| | `session-guard` (dsh-lead) | Este protocolo / board |
|---|---|---|
| Comandos | `status`, `guard`, `claim`, `release`, `heartbeat` | lectura de `BOARD.json` + append a `notices.jsonl` |
| Estado | `.session/locks.json` (máquina) | `.agent-teams/session-board/BOARD.json` (máquina) |
| Efecto | **bloquea** (exit 1) | **informa** (no bloquea) |
| Alcance | rutas del repo | rutas del repo + cola de tareas + conflictos + `no_touch` |

**Reglas de integración (obligatorias):**

1. **Nunca escribir `.session/locks.json` a mano.** Es estado de `session-guard`; escribirlo a mano
   desincroniza el guard y produce falsos libres.
2. **El board importa los locks verbatim** y registra `source` + `imported_verbatim`. Los que solo
   existen en el ledger humano van con `imported_verbatim:false` y `drift_warning`.
3. **Cuando `session-guard` gane una capacidad nueva** (p. ej. TTL nativo), este protocolo se degrada a
   proyección y deja de pedir TTL manual en el board.
4. **Divergencia = conflicto `high`** (X-003), no "bug del otro".
5. `COORDENADAS_SESIONES.md` y `tools/session-guard.js` son de `dsh-lead`: **se leen, no se editan**.
   Para añadir una fila al ledger humano hay que pedírselo a su dueño.

---

## 10 · Mapa de lanes del equipo de auditoría (claims por defecto)

Estas son las lanes ya reclamadas por el equipo `alineacion-omni-crystal-1025` (no las reclames tú):

| Lane | Tarea | Dueño | Escribe en |
|---|---|---|---|
| Coordinación | t2 | `coord-sesiones` | `docs/ops/session-coordination/**`, `.agent-teams/session-board/**`, `.agent/COORDINATION.md` |
| Trabajo en vuelo | t3 | `coord-sesiones` | `audit/alignment/2026-10-25/00-inflight/**` |
| Excel SSOT | t4 | `excel-ssot` | `audit/alignment/2026-10-25/10-excel/**` |
| JSON SSOT | t5 | `json-ssot` | `audit/alignment/2026-10-25/20-json/**` |
| APP | t6 | `app-generador` | `audit/alignment/2026-10-25/30-app/**` |
| VPS | t7 | `vps-edge` | `audit/alignment/2026-10-25/40-vps/**` |
| Listas | t8 | `listas-m3u8` | `audit/alignment/2026-10-25/50-listas/**` |
| Matriz/veredicto | t9 | `verificador-alineacion` | `audit/alignment/2026-10-25/90-matriz/**` |

**Toda lane del equipo es read-only sobre producción.** La escritura vive solo en su carpeta de
entregables. Si un auditor necesita mutar producción para verificar algo → **no es auditoría, es un
fix**: se propone, no se aplica (regla del capitán).

---

## 11 · Prohibiciones permanentes (heredadas + nuevas)

Heredadas de la doctrina del repo (`AGENTS.md`, `CLAUDE.md`, `COORDENADAS_SESIONES.md` §4):

- Nunca `nginx -s reload` sin `nginx -t`.
- Nunca subir PHP sin `php -l` (un error de sintaxis tumba los 2.753 canales).
- Nunca subir Lua sin `luac -p`.
- Nunca reemplazar `frontend/lab_master_22.6.0.json` sin verificar `sha256 = 099A1707…` (decisión del owner).
- Nunca `ngx.exit()` desde `body_filter` / `header_filter`.

Nuevas de este protocolo:

- Nunca escribir sin claim previo en el board (incluido "un cambio de una línea").
- Nunca exponer credenciales/tokens en avisos, board, ni reportes (enmascarar siempre).
- Nunca borrar ni reescribir el archivo de otra sesión para "normalizar formato".
- Nunca mover/borrar artefactos de otra sesión para "limpiar el árbol" (ver §6).
- Nunca declarar verificado un artefacto sin sha256 en el aviso de cierre.

---

## 12 · Checklist copiable (pegar al inicio de cada tarea)

```markdown
## Claim checklist — <tarea>
- [ ] `node tools/session-guard.js status` → leído
- [ ] `BOARD.json` → claims[] + locks[] + no_touch[] leídos
- [ ] `git status --short` (sin -uall) → sé qué está modificado y por quién (si se sabe)
- [ ] Mi ruta NO aparece en locks[] ni en claims[] ajenos
- [ ] `node tools/session-guard.js guard <mi-ruta>` → exit 0
- [ ] Claim publicado: session-guard + BOARD.json + notices.jsonl (una línea)
- [ ] SHA256 previo del archivo que voy a tocar registrado
- [ ] (si es `.agent/COORDINATION.md`) backup escrito Y verificado ANTES
- [ ] Cierro: sha256 del artefacto + release + aviso `close` en notices.jsonl
```

---

## 13 · Limitaciones conocidas (para que nadie se sorprenda)

1. **El board no bloquea.** Si una sesión ignora el protocolo, nada la detiene salvo `session-guard`
   y la revisión humana. Este documento no es un mecanismo técnico de enforcement.
2. **`notices.jsonl` es append-only por convención, no por el filesystem.** Dos escrituras simultáneas
   pueden pisarse. Mitigación: una línea por evento, escritura corta, y si detectas que perdiste una
   línea, vuelve a añadirla al final (nunca reordenes).
3. **Los timestamps son locales (-05:00) y de reloj de máquina.** Un reloj desfasado produce TTL falsos.
   Comparar siempre con `expires_at`, no con "hace un rato".
4. **El recuento de sesiones cambia mientras lees.** Los 28 directorios y sus mtimes son una foto de
   `2026-10-25T22:40-05:00`, no un valor estable.
5. **No hay visibilidad del VPS desde aquí.** Lo que el VPS tenga desplegado solo se puede afirmar con
   lectura remota read-only (lane t7), nunca por inferencia desde el repo.

---

## 14 · Referencias cruzadas

| Documento | Para qué |
|---|---|
| `.agent/COORDINATION.md` | hand-off histórico (Capa 1 del cortex) + `## TABLERO VIVO` (prepend 2026-10-25) |
| `COORDENADAS_SESIONES.md` | ledger humano de la sesión `dsh-lead` / REA · §4 lock de deploy VPS |
| `tools/session-guard.js` + `.session/locks.json` | enforcement real de locks |
| `.agent-teams/session-board/BOARD.json` | tablero máquina-legible (claims, locks, cola, conflictos, no_touch) |
| `docs/ops/session-coordination/NOTICES.md` | índice humano de avisos |
| `docs/ops/session-coordination/notices.jsonl` | log append-only de eventos |
| `audit/alignment/2026-10-25/00-inflight/INFLIGHT_INVENTORY.md` | qué hay en vuelo ahora mismo |
| `.agent-teams/alineacion-omni-crystal-1025/team.json` | cola real de tareas del equipo (solo lectura) |

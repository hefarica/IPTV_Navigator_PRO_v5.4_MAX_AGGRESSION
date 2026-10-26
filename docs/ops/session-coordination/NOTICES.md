# NOTICES — Registro de avisos inter-sesión (índice humano)

> **Máquina:** `docs/ops/session-coordination/notices.jsonl` — **append-only**, una línea JSON por evento.
> **Humano:** este archivo. Es un **índice**, no la fuente de verdad: si divergen, gana el `.jsonl`.
>
> Protocolo: [`COORDINATION_PROTOCOL.md`](COORDINATION_PROTOCOL.md) · Tablero: `.agent-teams/session-board/BOARD.json`
> Iniciado por `coord-sesiones` (t2, attempt `1f268383-adc3-4bab-957f-ed686efd32ca`) el **2026-10-25T22:43:17-05:00**.

---

## 1 · Cómo se usa (3 reglas)

1. **Añadir, nunca editar.** Un evento escrito no se corrige: se añade otro evento que lo enmienda
   (`estado:"note"` con `evidencia` apuntando al `event_id` corregido).
2. **Una línea JSON por evento.** Sin pretty-print, sin líneas en blanco intermedias, sin BOM.
3. **La última línea puede llevar salto o no** — el parser debe tolerar ambas (`split(/\r?\n/).filter(Boolean)`).

---

## 2 · Esquema de un evento

```json
{
  "ts": "2026-10-25T22:43:17-05:00",
  "event_id": "E-0001",
  "session_id": "be3f50f9-ee2d-4be4-a3e9-54e5ad8e2753",
  "agente": "coord-sesiones",
  "team": "alineacion-omni-crystal-1025",
  "task": "t2",
  "estado": "claim",
  "scope": ["docs/ops/session-coordination/**"],
  "mode": "write",
  "ttl_minutes": 120,
  "expires_at": "2026-10-26T00:43:17-05:00",
  "intent": "una frase verificable",
  "evidencia": [
    { "tipo": "sha256", "ref": "ruta/del/artefacto", "detalle": "<hash> / <bytes> bytes" }
  ],
  "conflicts": []
}
```

### 2.1 Campos obligatorios (los 6 que definen un claim)

`ts` · `session_id` · `agente` · `scope` · `estado` · `evidencia`

Si falta cualquiera de los seis, el evento **no es un claim**: es un comentario y el verificador lo
ignorará como prueba.

### 2.2 Vocabulario de `estado`

| `estado` | Significa | Evidencia mínima exigida |
|---|---|---|
| `claim` | reclamo una ruta (write/read) | `BOARD.json` + sha256 previo si vas a modificar algo existente |
| `heartbeat` | sigo vivo y sigo siendo el dueño | `expires_at` renovado |
| `release` | libero la ruta | `BOARD.json → claims[].state = "released"` |
| `close` | terminé la tarea | **sha256 o conteo del artefacto entregado** |
| `conflict` | detecté colisión de scopes | ids de claims/locks en conflicto |
| `violation` | alguien escribió sin claim | ruta + quién (si se sabe) + cómo se detectó |
| `note` | información sin efecto de lock | libre (pero debe citar algo verificable) |

### 2.3 Vocabulario de `evidencia[].tipo`

`sha256` · `git` (ref + salida) · `board` · `count` · `mtime` · `remote-readonly` · `log`

---

## 3 · Eventos registrados

> Tabla **derivada** del `.jsonl` en el momento de escribir este índice. Si no coincide, el `.jsonl` manda.

| # | ts (local) | Sesión | Agente | Estado | Scope | Evidencia |
|---|---|---|---|---|---|---|
| E-0001 | 2026-10-25T22:43:17 | `be3f50f9` | coord-sesiones | `claim` | `docs/ops/session-coordination/**` | board rev.1 · claim C-001 |
| E-0002 | 2026-10-25T22:43:17 | `be3f50f9` | coord-sesiones | `claim` | `.agent-teams/session-board/**` | board rev.1 · claim C-002 |
| E-0003 | 2026-10-25T22:43:17 | `be3f50f9` | coord-sesiones | `claim` | `audit/alignment/2026-10-25/00-inflight/**` | board rev.1 · claim C-003 · dir no existía |
| E-0004 | 2026-10-25T22:43:17 | `be3f50f9` | coord-sesiones | `claim` | `.agent/COORDINATION.md` | sha256 previo `34886296…E591` / 16805 B |
| E-0005 | 2026-10-25T22:43:17 | `be3f50f9` | coord-sesiones | `claim` (read) | frontend/backend/vps/_vps_stage/.agent-teams/.session/tools/COORDENADAS/audit_teams_REA | board rev.1 · conflictos X-001, X-002 |
| E-0006 | 2026-10-25T22:47:10 | `be3f50f9` | coord-sesiones | `release` | `docs/ops/session-coordination/**` · `.agent-teams/session-board/**` | sha256 protocolo `04450384…0FA3` · NOTICES `03F4720D…75C4` (pre-anexado) |
| E-0007 | 2026-10-25T22:47:10 | `be3f50f9` | coord-sesiones | `release` | `audit/alignment/2026-10-25/00-inflight/**` | sha256 `2F511740…1024` · 5 conflictos X-001..X-005 |
| E-0008 | 2026-10-25T22:47:10 | `be3f50f9` | coord-sesiones | `release` | `.agent/COORDINATION.md` | post `86159F7A…05C4` · diff 74/0 · sufijo == hash original |
| E-0009 | 2026-10-25T22:47:10 | `be3f50f9` | coord-sesiones | `close` | censo read-only (9 globs) | 0 ssh/curl/scp · 0 rutas ajenas tocadas |

**Corrección posterior (append-only):** el evento **E-0010** se anexó después de completar esta tabla; si
el `sha256` de este archivo citado en E-0006 (`03F4720D…`) no coincide con el actual, es porque E-0010
documenta esa misma edición. El `.jsonl` manda.

---

## 4 · Consultas rápidas

```bash
# ¿cuántos eventos y de qué tipo?
node -e "const fs=require('fs');const l=fs.readFileSync('docs/ops/session-coordination/notices.jsonl','utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);const c={};l.forEach(e=>c[e.estado]=(c[e.estado]||0)+1);console.log(l.length,'eventos',c)"

# ¿qué claims están activos ahora?
node -e "const fs=require('fs');const l=fs.readFileSync('docs/ops/session-coordination/notices.jsonl','utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);const open=l.filter(e=>e.estado==='claim');const rel=new Set(l.filter(e=>e.estado==='release'||e.estado==='close').flatMap(e=>e.scope));console.log(open.filter(e=>!rel.has(e.scope[0])).map(e=>e.event_id+' '+e.agente+' '+e.scope.join(',')))"

# ¿hubo violaciones?
node -e "const fs=require('fs');console.log(fs.readFileSync('docs/ops/session-coordination/notices.jsonl','utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse).filter(e=>e.estado==='violation'))"
```

---

## 5 · Violaciones ya registradas (contexto histórico, no de este log)

Una escritura sin claim **ya ocurrió** en este repo antes de existir este log. Se cita como evidencia de
que el mecanismo hacía falta, y se toma como `violation` de referencia:

> `COORDENADAS_SESIONES.md` §2, fila `2026-10-25 22:04-22:30` — **"DSH sesión VPS (esta)"** escribió
> `tools/crystal-upscale/crystal-upscale.ps1` + `_bench/` bajo el lock `t47` **sin anunciarlo**.
> Resultado: **deshecho** (movido a `docs/upscale_lab/`, `_bench/` borrado), la ruta quedó libre para t47.
>
> Lección incorporada al protocolo: el aviso va **antes** de la escritura, no después
> (`COORDINATION_PROTOCOL.md` §4.1), y un lock violado se restaura, no se negocia.

---

## 6 · Mantenimiento

- **Rotación:** cuando el `.jsonl` pase de ~5.000 líneas, se archiva como
  `notices.<YYYYMM>.jsonl` y se abre uno nuevo. **Nunca** se trunca ni se reescribe el vigente.
- **Consistencia:** `notices.jsonl` y `BOARD.json` se actualizan en la **misma** pasada de trabajo;
  si solo uno cambió, el board está mintiendo por omisión y se corrige con un `note`.
- **Validación obligatoria** antes de publicar:

```bash
node -e "const fs=require('fs');const l=fs.readFileSync('docs/ops/session-coordination/notices.jsonl','utf8').split(/\r?\n/).filter(Boolean);l.forEach((x,i)=>{try{JSON.parse(x)}catch(e){console.error('LINE',i+1,'INVALID',e.message);process.exit(1)}});console.log('notices.jsonl OK lines='+l.length)"
```

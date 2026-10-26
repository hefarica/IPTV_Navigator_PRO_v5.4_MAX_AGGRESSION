# NO_TOUCH LIST — rutas que este equipo NO debe tocar (foto 2026-10-25T22:52-05:00)

> **Para qué sirve:** que ningún auditor del equipo `alineacion-omni-crystal-1025` (t3–t9) pise
> producción en vuelo ni el trabajo de otras sesiones. Es una lista **accionable**: globs concretos,
> con dueño, motivo y qué hacer si de verdad necesitas entrar.
>
> **Fuente de verdad de los locks:** `.session/locks.json` (vía `tools/session-guard.js`).
> Este archivo importa ese estado y le **añade** lo que solo vive en el ledger humano
> (`COORDENADAS_SESIONES.md`) y lo detectado por este censo.
> Protocolo: [`docs/ops/session-coordination/COORDINATION_PROTOCOL.md`](../../../../docs/ops/session-coordination/COORDINATION_PROTOCOL.md)
> · Tablero: [`BOARD.json`](../../../../.agent-teams/session-board/BOARD.json) (`no_touch[]`)
> · Mapa de cambios: [`CHANGE_MAP.json`](CHANGE_MAP.json)

**Regla dura:** auditoría = **lectura**. Si necesitas escribir en algo de esta lista para "verificar",
no es auditoría: es un fix → se **propone** con `archivo:línea` y lo decide el capitán / el dueño.

---

## 1 · BLOQUEO DE ESCRITURA (locks vivos) — 🚫 prohibido escribir

| # | Glob | Dueño | Tarea | Motivo | Fuente |
|---|---|---|---|---|---|
| L-001 | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/**` | `dsh-lead` | t44 | censo `X-APE-AI-*` + saneo de ruido EXTHTTP | `.session/locks.json` |
| L-002 | `IPTV_v5.4_MAX_AGGRESSION/vps/production_mirror/**` | `dsh-lead` | t44 | saneo de las 4 copias del módulo | `.session/locks.json` |
| L-003 | `tools/crystal-upscale/**` | `dsh-lead` | t47 | upscaler offline (pipeline + benchmarks) | `.session/locks.json` |
| L-004 | `_vps_stage/tests/emitter_level_assert.js` | `t45` | t45 | repair del gate C2 (`fakeUhd:'0'`) | ledger §3 ⚠️ |
| L-005 | `_vps_stage/nginx/**` | `t46` | t46 | cache-first edge + watchdog + logrotate | ledger §7 ⚠️ |
| L-006 | `_vps_stage/lua/**` | `t46` | t46 | cache-first edge + prefetch | ledger §7 ⚠️ |
| L-007 | `contracts/**` | sesión REA/VPS | contratos Crystal | contratos como datos + verificador | ledger §3.1 ⚠️ |
| L-008 | `docs/upscale_lab/**` | sesión REA/VPS | upscale-lab | notas de laboratorio | ledger §3.1 ⚠️ |

⚠️ = **drift**: declarado en el ledger humano pero **ausente** de `.session/locks.json`.
Consecuencia práctica: `node tools/session-guard.js guard _vps_stage/lua/ape_gateway.lua` devolvería
**exit 0 (libre)** aunque t46 lo esté tocando. Ante duda, **gana la unión** (el más restrictivo) → no escribas.

**Si necesitas escribir en L-001…L-008:** pide el lock a su dueño (`agent_teams_send_message` o fila en
`COORDENADAS_SESIONES.md` §2 si es la sesión de `dsh-lead`). No lo tomes por tu cuenta.

---

## 2 · PRODUCCIÓN — 🚫 prohibido escribir (permanente, no es un lock temporal)

| Glob / destino | Por qué | Permitido |
|---|---|---|
| `**/*.xlsm` (incl. `APE_M3U8_LAB_v8_FIXED.xlsm`) | SSOT calibrado; doctrina `iptv-excel-safe-mode` | lectura por copia a temp o COM ReadOnly (t4) |
| VPS `178.156.147.234` — cualquier ruta (`/etc/nginx/**`, `/etc/nginx/lua/**`, `/var/www/**`, `/etc/systemd/**`, `/dev/shm/nginx_cache/**`, iptables, WireGuard) | doctrina `iptv-vps-touch-nothing` | `cat`, `ls`, `find`, `sha256sum`, `nginx -T` (sin reload), `systemctl is-active`, `journalctl -n`, `ss -tlnp`, `curl -sI` a endpoints propios |
| `frontend/lab_master_22.6.0.json` | pin del owner: `sha256 = 099A1707…` (decisión registrada en el ledger) | leer; si el sha difiere, es **hallazgo**, no algo que se "arregle" |

---

## 3 · TRABAJO AJENO EN VUELO — 🚫 no editar, ⚠️ leer con pin de hash

Rutas con cambios **sin commitear** que pertenecen a otras sesiones. Están en
[`CHANGE_MAP.json`](CHANGE_MAP.json) con atribución y riesgo; aquí van los globs:

```text
# otras sesiones — 17 archivos modificados, 0 staged
IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js      # +427/-1  t29+t33+t36
IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js             # +79/-0   dsh-lead fuse A+B
IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/streaming/profile-solver-v9.js     # +40/-4   dsh-lead fuse A+B
IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-api-wrapper-integrated.js     # +10/-1   DESCONOCIDA
IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php                   # +300/-38 t28
IPTV_v5.4_MAX_AGGRESSION/backend/cmaf_engine/modules/ai_super_resolution_engine.php      # +11/-22  t40
IPTV_v5.4_MAX_AGGRESSION/backup_master_v5.4_phantom_engine/backend/cmaf_engine/modules/ai_super_resolution_engine.php  # +11/-22 t44
IPTV_v5.4_MAX_AGGRESSION/vps/cmaf_engine/modules/ai_super_resolution_engine.php          # +11/-23  t44
IPTV_v5.4_MAX_AGGRESSION/vps/production_mirror/cmaf_engine/modules/ai_super_resolution_engine.php              # +11/-23 t44
IPTV_v5.4_MAX_AGGRESSION/vps/production_mirror/cmaf_engine/cmaf_engine/modules/ai_super_resolution_engine.php  # +11/-23 t44
IPTV_v5.4_MAX_AGGRESSION/frontend/vps/resolve.php                              # +3/-3    DESCONOCIDA
IPTV_v5.4_MAX_AGGRESSION/frontend/js/m3u8_ultimate_generator.py                # +2/-2    DESCONOCIDA
IPTV_v5.4_MAX_AGGRESSION/frontend/js/vps-ops-panel.js                          # +1/-1    DESCONOCIDA
_vps_stage/lua/ape_gateway.lua                                                # +172/-0  t46
_vps_stage/lua/ape_header.lua                                                 # +128/-2  t46
_vps_stage/lua/ape_uri_rebase.lua                                             # +78/-2   t46
_vps_stage/tests/fanout_concurrency.sh                                        # +23/-0   DESCONOCIDA (causa X-006)
```

**Si eres t6 (`app-generador`) y tu sujeto está aquí:** puedes **leer**, pero **pinea el hash**:

```bash
Get-FileHash <ruta> -Algorithm SHA256      # antes de auditar
# ... auditas, citas archivo:línea ...
Get-FileHash <ruta> -Algorithm SHA256      # después: si cambió, tu cita es de OTROS bytes
```

Si cambió entre las dos lecturas, **no reescribas el veredicto**: declara la ventana
(`sha_antes ≠ sha_despues`) y vuelve a medir. Así lo exige `X-002`.

---

## 4 · ESTADO DE OTROS EQUIPOS / SESIONES — 🚫 no editar, ✅ se lee

```text
.agent-teams/alineacion-omni-crystal-1025/**    # estado de NUESTRO equipo: solo via agent_teams_*
.agent-teams/auditoria-roku-universal-rea/**    # equipo AJENO, activo (inbox/captain.jsonl 22:45:00)
.agent-teams/rea-recon/**                       # equipo AJENO, activo (inbox/captain.jsonl 22:43:37)
.agent-teams/archive/**                         # archivado (media-fanout)
.agent-teams/retired-members.json               # registro de retiros
.session/**                                     # estado máquina de session-guard
tools/session-guard.js                          # enforcement de locks (ajeno, en uso)
COORDENADAS_SESIONES.md                         # ledger humano ajeno
audit_teams_REA/**                              # 38 .md de la sesión REA/VPS
docs/REA_*.md                                   # 6 docs de forensia REA
docs/evidence/**                                # 11,7 MB: 2 evidence bundles + 1 script
```

**Nunca** se edita el `team.json` ni los `inbox/*.jsonl` de un equipo a mano: se usan las tools
`agent_teams_*`, que mantienen el escapado y la concurrencia.

---

## 5 · RUIDO DE GIT — 🚫 no restaurar, no commitear, no "limpiar"

```text
IPTV_v5.4_MAX_AGGRESSION/backend/upload-server/target/**                      # 912 borrados
IPTV_v5.4_MAX_AGGRESSION/test_zip/target/**                                   # 912 borrados
IPTV_v5.4_MAX_AGGRESSION/frontend/tools/stream_probe_server/**                # 776 borrados
IPTV_v5.4_MAX_AGGRESSION/backup_master_v5.4_phantom_engine/frontend/tools/**  # 572 borrados
```

Son **3.172 artefactos de build** borrados (`/target/`, crates Rust). No hay pérdida de fuente.
Restaurarlos o commitearlos es una decisión del owner, en un commit **propio y explícito**
(`chore(build): drop target/ artifacts`), jamás mezclado con el trabajo de la auditoría.

---

## 6 · ARTEFACTOS HUÉRFANOS — ⚠️ no borrar, se reportan

| Ruta | Qué es | Por qué no se toca |
|---|---|---|
| `UsersHFRCDesktopIPTV_Navigator_PRO_v5.4_MAX_AGGRESSIONtoolscrystal-upscale_work.qsv_probe.mkv` | 31.545 B, `sha256 FD4E0DBB…BE86`, mtime 22:48:23 | **X-007**: binario de la lane t47 (L-003) con el path aplanado, escrito en la raíz 27 min **después** de crearse el lock. No es nuestro: se reporta a su dueño. Borrarlo destruiría su artefacto de trabajo |
| `c：tmplogcat_dump.txt` | 198.370 B, dump de logcat con nombre corrupto (dos puntos fullwidth) | renombrarlo rompe la referencia de quien lo creó; no es basura hasta que su dueño lo diga |
| `_map_lua_modules.py` | script suelto, 2026-? | sin dueño identificado; no se ejecuta ni se borra |
| `.playwright-mcp/page-2026-06-18T…yml` | dump de página | ídem |

**Regla:** en este repo **no se borra nada ajeno**. Ni "temporal", ni "obvio", ni "basura".

---

## 7 · CARPETAS DE ENTREGABLES — cada lane escribe SOLO la suya

| Lane | Dueño | Escribe en |
|---|---|---|
| Coordinación | `coord-sesiones` | `docs/ops/session-coordination/**`, `.agent-teams/session-board/**` |
| Trabajo en vuelo | `coord-sesiones` | `audit/alignment/2026-10-25/00-inflight/**` |
| Gate de commit | capitán | `audit/alignment/2026-10-25/commit-gate/**` |
| Excel SSOT | `excel-ssot` | `audit/alignment/2026-10-25/10-excel/**` |
| JSON SSOT | `json-ssot` | `audit/alignment/2026-10-25/20-json/**` |
| APP | `app-generador` | `audit/alignment/2026-10-25/30-app/**` |
| VPS | `vps-edge` | `audit/alignment/2026-10-25/40-vps/**` |
| Listas | `listas-m3u8` | `audit/alignment/2026-10-25/50-listas/**` |
| Matriz/veredicto | `verificador-alineacion` | `audit/alignment/2026-10-25/90-matriz/**` |

Nadie escribe en la lane de otro, ni "para corregir una errata".

---

## 8 · COMANDOS PROHIBIDOS (destruyen trabajo no recuperable)

```bash
git add -A            # ❌ arrastra 3.172 borrados + 72 untracked ajenos
git add .             # ❌ idem
git commit -a         # ❌ commitea los 17 archivos ajenos modificados
git commit --amend    # ❌ sobre un commit que otra sesión ya citó (d322eb2)
git checkout -- .     # ❌ revierte WIP ajeno no commiteado
git reset --hard      # ❌ idem + borra el índice
git clean -fd         # ❌ borra .session/locks.json, .agent-teams/**, docs/evidence/** (11,7 MB), _vps_stage/**
git stash           # ⚠️ permitido SOLO con `-- <tus rutas>` explícitas
git push --force      # ❌ jamás
```

Commit correcto (quirúrgico):

```bash
git add -- <ruta1> <ruta2> ...          # solo lo tuyo, explícito
git diff --cached --name-status         # verificar que NO entró nada ajeno
git commit -m "docs(ops): ..."
git show --stat --oneline HEAD          # volver a verificar
```

---

## 9 · CHECKLIST DE 20 SEGUNDOS (antes de escribir)

```text
[ ] Mi ruta aparece en §1 o §2?            -> NO escribas. Pide el lock.
[ ] Mi ruta aparece en §3?                 -> solo lectura + pin de sha256.
[ ] Mi ruta está en §5/§6 (ruido/huérfano)? -> NO la toques, ni para "limpiar".
[ ] Mi ruta cae en la lane de otro (§7)?   -> escribe en la tuya.
[ ] Publiqué el claim (board + notices)?   -> si no, no empieces.
```

---

## 10 · Si crees que esta lista está mal

1. **No la edites** (es de `coord-sesiones`, lane 00-inflight).
2. Mide: `git status --short -- <ruta>`, `Get-FileHash`, `.session/locks.json`, mtime.
3. Publica el desacuerdo en `docs/ops/session-coordination/notices.jsonl` (`estado:"note"` o
   `"conflict"`, con la evidencia) **y** avisa a `coord-sesiones`.
4. Si hay riesgo de pérdida de bytes: escala al **usuario (HFRC)**, que es el árbitro final.

Última actualización: **2026-10-25T22:52-05:00** · 8 locks · 17 archivos ajenos sucios ·
3.172 borrados de build · 4 artefactos huérfanos · 9 lanes de escritura.

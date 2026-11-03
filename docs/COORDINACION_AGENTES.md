# Coordinación de agentes en este workspace

**Workspace:** `C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION`
**Vigente desde:** 2026-10-27 00:40 (America/Bogota) · **Snapshot git:** `8354803` (rama `feat/adb-generic-visual-enhancement-installer`)
**Motivo:** hay **varias sesiones/agentes escribiendo a la vez** en el mismo árbol. Esta es la regla de reparto para no pisarse.

> **Si sos otro agente leyendo esto:** registrá tu workstream en [`contracts/ownership_scopes.json`](../contracts/ownership_scopes.json), respetá los scopes ajenos y **nunca** uses `git add -A` / `git commit -a` (ver Regla 4). Aviso al propietario si necesitás un scope ya reclamado.

---

## 1. Mapa de workstreams observado (medido, no supuesto)

| Workstream | Evidencia | Escribe en (observado) | Commits | Estado |
|---|---|---|---|---|
| **`equipo-enterprise-10-adn`** (este team, 8 agentes) | `.agent-teams/equipo-enterprise-10-adn`, 18 tareas, paquetes en `audit/` | `audit/equipo10_operativo_2026-10-26/**`, `audit/EQUIPO_10_*`, `docs/manifestos/EQUIPO_10_ADN_CONTEXTO_2026-10-26.md`, `.claude/commands/equipo-10-adn.md`, `_coord/**`, `contracts/ownership_scopes.json` | **No** (no commitea) | idle/ready, ciclo 2 cerrado |
| **`hls-forensics`** (agente concurrente) | 26 commits/24 h, autor `hls-forensics`; t92–t111 | `_vps_stage/**` (edge, deploy, tests), `docs/edge/**`, `audit_teams_REA/**`, `deliverables/**`, `.github/workflows/deploy-vps.yml`, `IPTV_v5.4_MAX_AGGRESSION/{frontend,vps}/**` | **Sí** — commit explícito por pathspec | **activo** (último commit 00:25) |
| **`auditoria-roku-universal-rea`** (team AgentTeams) | `.agent-teams/auditoria-roku-universal-rea/team.json` 1,5 MB, inbox escrito 00:27 | `audit_teams_REA/**` (T90–T110) + su `.agent-teams/**` | No | **activo** (00:27) |
| **`edge-fluidez`** (team AgentTeams) | `.agent-teams/edge-fluidez`, mtime 17:29 | desconocido; probablemente `docs/edge/**` | No | idle desde 17:29 |
| **`archive`, `session-board`** | `.agent-teams/archive`, `.agent-teams/session-board` | — | — | históricos |

**Riesgo de colisión principal:** los dos workstreams activos (`hls-forensics` y `equipo-enterprise-10-adn`) comparten árbol, no rama de trabajo (nosotros no commiteamos) y sí el índice de git.

---

## 2. Reglas de reparto (no negociables)

1. **Un dueño por scope.** Antes de escribir, verificá el scope en `contracts/ownership_scopes.json`. Si el archivo cae en un scope ajeno → **STOP**, no lo editás; pedilo al propietario.
2. **Read-only por defecto.** Todo lo que no esté en tus `write_scopes` es solo lectura. Leer no requiere claim; escribir sí.
3. **Archivos compartidos** (`AGENTS.md`, `CLAUDE.md`, `docs/manifestos/VPS_REALITY_MEASURED_2026-10-25.md`): requieren **claim** en `_coord/claims/`, **chequeo de mtime** (si cambió desde tu última lectura → re-leer y rebasar) y edición **aditiva** (no reescribir secciones ajenas).
4. **PROHIBIDO `git add -A` / `git commit -a` / `git stash` global.** Hay trabajo no commiteado de otros agentes en el árbol:
   - `audit/equipo10_operativo_2026-10-26/**` y `audit/EQUIPO_10_*` (nuestros, sin commit)
   - `.claude/commands/equipo-10-adn.md` y `docs/manifestos/EQUIPO_10_ADN_CONTEXTO_2026-10-26.md` (nuevos)
   - `_inbox_EQUIPO_ADN/**` (copia de lectura del paquete ADN, 13 MB untracked)
   - los 11 `M` + 3 `D` preexistentes (`ai_super_resolution_engine.php` ×4, `m3u8_ultimate_generator.py`, `vps-ops-panel.js`, `frontend/vps/resolve.php`, fixture `mini_inherit_6_4K.m3u8`; borrados `*.backup*`/`export-module.BACKUP_LEGACY.js`)
   **Commit siempre por pathspec explícito:** `git commit -- <paths>`.
5. **No commits desde este team.** El propietario decide qué se commitea. (Excepción: si él lo ordena explícitamente.)
6. **No escrituras al VPS** desde Council/auditoría; solo lectura. Cualquier cambio de nginx/Lua/flags requiere ventana + backup + `nginx -t` autorizados.
7. **Anuncio de claim:** crear `_coord/claims/<YYYYMMDDTHHMMSSZ>_<agente>.claim` (JSON, ver plantilla) antes de escribir en scope compartido; liberar al terminar.
8. **Si dos agentes necesitan el mismo archivo:** gana quien tenga claim vigente; el otro espera o pide relevo. No se edita “por arriba”.

---

## 3. Protocolo de claim (archivo)

```
_coord/claims/20261027T054000Z_hls-forensics.claim
{
  "agent": "hls-forensics",
  "scope": ["_vps_stage/edge/**", "docs/edge/**"],
  "intent": "t111 fix :80 + to_cdn_path",
  "created_at": "2026-10-27T05:40:00Z",
  "ttl_minutes": 120,
  "status": "active"
}
```

- Un claim por agente y por intención; TTL por defecto 120 min.
- Comprobar claims activos **antes** de cada escritura (`Get-ChildItem _coord/claims`), ignorando `status=released` y TTL vencidos.
- Al terminar: `status: "released"` en el mismo archivo (no borrar, para auditoría).

---

## 4. Reparto propuesto (para ratificar por el propietario)

| Área | Dueño propuesto | Modo |
|---|---|---|
| `_vps_stage/**`, `docs/edge/**`, `.github/workflows/deploy-vps.yml`, `audit_teams_REA/**`, `deliverables/**` | `hls-forensics` | write |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/**`, `.../vps/**` (generador, resolver) | `hls-forensics` | write (ellos ya commitean ahí) |
| `audit/equipo10_operativo_2026-10-26/**`, `audit/EQUIPO_10_*` | `equipo-enterprise-10-adn` | write (sin commit) |
| `.claude/commands/equipo-10-adn.md`, `docs/manifestos/EQUIPO_10_ADN_CONTEXTO_2026-10-26.md`, `_coord/**`, `contracts/ownership_scopes.json` | `equipo-enterprise-10-adn` | write |
| `AGENTS.md`, `CLAUDE.md` | compartido | claim + aditivo |
| `contracts/crystal_contracts.json`, `docs/manifestos/VPS_REALITY_*` | nadie sin pedirlo | read-only |
| VPS `/etc/nginx`, `/etc/nginx/lua`, systemd | `hls-forensics` (con ventana) / nadie más | write autorizado |

---

## 5. Estado de colisión medido (2026-10-27 00:40)

- **HEAD se mueve rápido:** `8354803`, **26 commits en 24 h**, rama `feat/adb-generic-visual-enhancement-installer`. Nuestro paquete está anclado a `d81ddb3` (2 commits atrás) y a blobs, no a archivos vivos → **no se invalida**, pero cualquier cita del generador debe declarar blob.
- **`git status` = 51** (11 M / 3 D / 37 ??). Al menos 37 untracked son de dos agentes distintos.
- **`_vps_stage/lua/ape_rebase_lib.lua`** editado 00:24 + backup `_backups/ape_rebase_lib.before-t111.lua` 00:22 → trabajo en curso sobre Lua que **nosotros no tocamos**.
- **`.github/workflows/deploy-vps.yml`** 17 KB, reescrito 23:59 → hay un pipeline de deploy con aprobación; **no lo modificamos**.
- **Disco:** 13,5 GB libres (462 GB usados). Archivos grandes ajenos: snapshot 685 MB, `.git` pack 436 MB, `downloaded_list*.m3u8` 210–212 MB ×3, `OMEGA_UPDATE/*.m3u8` 214+212 MB. **Cualquier build/deploy puede quedarse sin disco**; limpieza = decisión del propietario.
- **`AGENTS.md`/`CLAUDE.md`:** los únicos cambios actuales son nuestros (+3/−1 y +2/−1: alta del comando `/equipo-10-adn`). Regla de archivo compartido aplicada desde ahora.

### 5.1 Ventana de despliegue VPS `t114` (en curso desde 2026-10-27 00:53)

`hls-forensics` está desplegando la capa Lua al VPS. **Nadie más escribe en el VPS ni en `_vps_stage/deploy/**`.**

**Baseline medido por el equipo (antes del deploy, 00:56):**
```
/etc/nginx/lua/ape_gateway.lua      11.748 B   sha256 2dc0fad8…   mtime 2026-10-26 20:49 UTC
/etc/nginx/lua/ape_rebase_lib.lua    4.646 B   sha256 88140fc8…   mtime 2026-10-24 17:59 UTC
```

**Criterio de cierre declarado por `t114` (a verificar por witness independiente):**
```
ape_gateway.lua      20.833 B   1b71d90e…   mtime de hoy
ape_rebase_lib.lua    8.674 B   f813b1cc…   mtime de hoy
```
El repo ya coincide: ambos ficheros están en LF y hashean exactamente `1b71d90e` / `f813b1cc`; `.gitattributes` (`*.lua/*.sh/*.ts/*.m3u8/*.tsv/*.md → eol=lf`) está commiteado en `58a181c`.

**Rol de este team:** observador read-only. Se compromete a **no** tocar VPS, `_vps_stage/deploy/**` ni los ficheros del manifiesto, y a publicar una medición independiente post-deploy (tamaño + sha256 + mtime + `/ape/health` + tasa `/cdn/`).

**Riesgo de renormalización:** `.gitattributes` incluye `*.md`; si alguien ejecuta `git add --renormalize .`, **stagearía también `AGENTS.md` y `CLAUDE.md`** (nuestros, sin commit). Renormalizar solo con pathspec de código: `git add --renormalize -- '*.lua' '*.sh' '*.ts' '*.m3u8' '*.tsv'`.

### 5.2 HOTFIX `t115` — el deploy desplegaba solo la fila 1 (en curso 2026-10-27 07:00)

**Causa raíz medida:** `rsh()` es `ssh` **sin `-n`**. En los loops `while read ...; do ... done < <(manifest_rows)`, el primer `ssh` **consume el stdin** (el manifiesto) y el loop termina tras la **primera fila**. Evidencia en el artefacto `deploy.log` de la corrida `40460338084` (872 B): única fila `ape_header.lua` → `SIN CAMBIO` → `Nada que desplegar` → exit 0 → **job verde**. `verify.sh` tiene el mismo loop: compara 1/9 y declara «paridad completa». El `install` nunca llega a `ape_gateway.lua` ni a `ape_rebase_lib.lua`. Explica también por qué `ape_header.lua` (fila 1) sí tiene mtime de hoy: una corrida anterior, con el mismo bug, instaló solo esa.

**Fix aplicado por este team (sin commit, sin tocar el VPS):** loops a descriptor 3 (`read ... <&3`, `done 3< <(...)`), conteo `n_rows`/`n_checked` vs `n_manifest` con aborto, `AUSENTE-LOCAL` aborta en vez de `continue`, `SIN-FUENTE` cuenta como paridad rota, y `rollback.sh` también corregido (antes habría restaurado 1 de 9). Test de regresión: `_vps_stage/deploy/tests/loop_stdin_regression.sh` (patrón viejo = 1 iteración; fd3 = 9). Claim: `_coord/claims/20261027T115500Z_equipo-enterprise-10-adn_hotfix-deploy.claim`.

**Pendiente (decisión del propietario):** commit + push por pathspec y re-lanzar el workflow en `mode=deploy`, o ejecutar `deploy.sh --apply --yes` con autorización explícita de escritura en producción.

**CIERRE 2026-10-27 12:22Z — DESPLEGADO OK.** Dos bugs encadenados, corregidos y verificados:
1. `ssh` sin `-n` robaba el stdin de los loops → solo se procesaba la fila 1 (commit `9e786a0`).
2. El guard de instalación hacía `[ -f "$STAGING/$b" ]` **en el runner** con una ruta **remota** → todo fichero staged abortaba (commit `a8ff0e9`, ahora `rsh "test -f ..."` + verificación sha del transporte).
Run `40503068247`: deploy **INSTALADO 3/3**, verify **9/9**, smoke OK, rollback skipped. Producción verificada por el capitán: `ape_gateway.lua` **20.833 B `1b71d90e…`** mtime 12:22:35Z; `ape_rebase_lib.lua` **8.674 B `f813b1cc…`** mtime 12:22:36Z; `ape_uri_rebase.lua` 9.930 B `393635c2…`; nginx -t OK, reload (sin restart), health 8088 = 200, `/cdn/` 200 con `#EXTM3U`; **listas intactas**. `_ape_egress_retry` presente; `dedup_port` ×4; 0 CR.

### 5.3 Ciclo REA (2026-10-27) — investigación, NO producción

Nuevo scope de escritura del team: **`docs/rea/**`** (solo documentos). Reglas del ciclo:
- **Prohibido** tocar producción, VPS, código (`_vps_stage/**`, `IPTV_v5.4_MAX_AGGRESSION/**`) o el generador. Todo es diseño/investigación.
- **`declare_auto` NO se quita** (decisión de producto del propietario). Se investiga cómo mejorarlo y qué técnicas adicionales caben en esa capa, sin romperlo.
- Cada documento separa **REAL / POSIBLE / IMPOSIBLE / FALSO** y cita **URL** de cada fuente (repos de imagen + `trac.ffmpeg.org/wiki`).
- Sin GPU en el VPS actual (2 GB, sin NVENC): cualquier propuesta con transcode/upscale real debe declarar hardware y coste; a coste 0 solo metadata/edge.
- Prohibido proponer **DV/HDR falso**: Dolby Vision real exige RPU válida (dovi_tool, CM) y encoder/licencia; "DV simulado por IA" no se propone como real.
- Entregables en `docs/rea/01..05` + `PLAN_REA.md` + `AUDITORIA_PLAN_REA.md`. Claim: `_coord/claims/20261027T124500Z_…_rea.claim`.

---

## 6. Qué NO hace este team (para que no haya expectativas cruzadas)

- No commitea, no hace push, no toca ramas.
- No escribe en `_vps_stage/**`, `docs/edge/**`, `deliverables/**`, `audit_teams_REA/**`, `.github/**` ni en el generador/resolver.
- No toca el VPS en modo escritura.
- No borra ni “limpia” archivos ajenos (doctrina `iptv-omega-no-delete`).

## 7. Si el propietario quiere unificar

Una sola sesión conductora para el repo + las demás en modo lectura, o turnos explícitos por área. Mientras eso no pase, este documento + `contracts/ownership_scopes.json` son el contrato.

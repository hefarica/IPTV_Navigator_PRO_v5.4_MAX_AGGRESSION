# FASE 0 — Inventario Forense del Repo

**Fecha:** 2026-05-17
**Autor:** Team Agent Supremo (13 especialistas)
**Branch:** master · up-to-date with origin
**Modo:** read-only audit (cero modificaciones a producción)

---

## 1. Topología de directorios

```
IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/
├── .agent/                  ← Skills + workflows + rules legítimos (721 skills singular)
│   ├── skills/              (721 dirs, contenido real, historial Git)
│   ├── workflows/           (slash commands operativos)
│   └── rules/
├── .agents/                 ← Reconstrucción nueva (este reporte vive aquí)
│   ├── _archive_20260516_bogus_stubs/  (intentos previos formulaicos archivados)
│   ├── skills/              (vacío — se reconstruye con contenido real)
│   ├── skills_enterprise/   (13 skills core nombradas en el prompt)
│   ├── research/repos/      (notas de repos externos estudiados — referencia, NO copy)
│   └── reports/             (este reporte y siguientes)
├── .claude/                 ← Hooks y settings nativos Claude Code
│   ├── agents/              (subagentes del Team Agent — se crea)
│   ├── commands/            (slash commands — se crea)
│   ├── settings.json
│   └── settings.local.json
├── .gemini/settings/        ← Doctrina espejo Gemini CLI
├── IPTV_v5.4_MAX_AGGRESSION/  ← Aplicación principal (873 archivos fuente)
│   ├── frontend/            (UI + JS + APE v9/v15 + parsers + generators)
│   │   ├── js/ape-v9/       (40+ módulos APE engine, prober, fallback resolver)
│   │   ├── js/ape-anle/     (anti-evasion modules)
│   │   ├── js/ape-v15/      (backend connector + monitor panel)
│   │   ├── api/             (PHP endpoints)
│   │   ├── backend_v14/     (Python+Docker FastAPI ape_server_v14_unified.py)
│   │   ├── backend_v15/     (Python+Docker ape_server_v15_ultimate.py)
│   │   └── vps/             (espejo de configs Nginx para deploy)
│   ├── backend/             (PHP + Python + Bash + Lua)
│   │   ├── ape-metadata-engine/  (Node.js metadata daemon + skills resolver)
│   │   ├── cmaf_engine/     (PHP orchestrator + modules + tests)
│   │   ├── health/          (Python health checks)
│   │   ├── ai_subtitles_edge/
│   │   └── *.conf           (15+ nginx variants)
│   ├── vps/                 (artefactos VPS: Lua, scripts, ape-realtime-guardian Python)
│   │   ├── nginx/lua/
│   │   ├── prisma/          (PHP + Python tools)
│   │   └── ape-realtime-guardian/  (Python pkg buffer/decision/probe/recommendation)
│   ├── net-shield/          (configs activos VPS netshield)
│   │   ├── nginx/nginx.conf
│   │   ├── nginx/lua/upstream_gate.lua
│   │   └── nginx/lua/upstream_response.lua
│   ├── docs/                (LAB_VBA_MACROS, diagrams, plans)
│   ├── lab-vba/             (VBA extension scripts)
│   ├── scripts/             (Python + JS generators alternates)
│   ├── _audit_snapshot/     (audit replays — read-only)
│   ├── backup_master_v5.4_phantom_engine/  (NEVER EDIT — backup tree)
│   ├── backups/             (snapshots versionados — NEVER EDIT)
│   ├── snapshots/           (state snapshots — NEVER EDIT)
│   └── sandbox/, tmp/, test_zip/  (volátiles, ignorables)
├── OMEGA_UPDATE/            (paquete update)
├── audit_1776438933335/
├── temp_analysis/, tmp_403/, tmp_maestro/  (volátiles)
├── vps_configs/
├── CLAUDE.md                ← Doctrina principal (extendida en esta auditoría)
└── GEMINI.md                ← Doctrina espejo Gemini (creada en esta auditoría)
```

---

## 2. Conteos clave

| Métrica | Valor |
|---|---|
| Archivos fuente totales (depth 4, ex node_modules/backups) | **873** |
| Skills legítimos preexistentes (`.agent/skills/` singular) | **721** |
| Stubs bogus archivados (`.agents/_archive_20260516_bogus_stubs/`) | ~280 |
| Generadores M3U8 distintos detectados | **3** (PATH A canónico + 2 alternates) |
| Nginx confs (incluye espejos VPS) | **20+** |
| Lua scripts activos (net-shield) | **2** (`upstream_gate.lua`, `upstream_response.lua`) |
| Skills nuevas core enterprise (este reporte) | **13** |

---

## 3. Clasificación por capa (extracto crítico)

### 3.1 Core M3U8 generators
| Archivo | Rol | Estado |
|---|---|---|
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | **PATH A canónico — único en producción** | Modified (uncommitted) — investigación pendiente |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/m3u8-world-class-generator.js` | PATH B alternate world-class | No funcional según memoria `reference_path_a_vs_path_b` |
| `IPTV_v5.4_MAX_AGGRESSION/scripts/m3u8-typed-arrays-ultimate.js` | Copia script version | Mirror de PATH A |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-fallback-resolver.js` | F0-F5 tier resolver | Active |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-quality-prober.js` | Live HLS manifest prober | Active |

### 3.2 API/Backend
| Familia | Tecnología | Ubicación |
|---|---|---|
| ape_api_server (v14, v15) | Python FastAPI | `frontend/backend_v14/`, `frontend/backend_v15/` |
| PHP endpoints | PHP 8 | `backend/*.php` (~50+ archivos) |
| ape-metadata-engine | Node.js | `backend/ape-metadata-engine/` |
| cmaf_engine | PHP | `backend/cmaf_engine/` |
| ape-realtime-guardian | Python pkg | `vps/ape-realtime-guardian/` |

### 3.3 Nginx/OpenResty/Lua activos (VPS)
| Archivo | Función |
|---|---|
| `IPTV_v5.4_MAX_AGGRESSION/net-shield/nginx/nginx.conf` | Conf principal del shield activo |
| `IPTV_v5.4_MAX_AGGRESSION/net-shield/nginx/lua/upstream_gate.lua` | Gate pasivo (PASSTHROUGH — circuit breaker REMOVIDO per autopista doctrine) |
| `IPTV_v5.4_MAX_AGGRESSION/net-shield/nginx/lua/upstream_response.lua` | Reactor de respuesta upstream |

### 3.4 Watchdog/SRE
| Archivo | Función |
|---|---|
| `backend/ape-pq-watchdog.sh` + `.bat` + `.ps1` | Watchdog peak quality cross-platform |
| `backend/ape-ram-guardian.sh` + `-vps.sh` | RAM guardian dual |
| `backend/ape-sentinel-vps.sh` + `.service` | Sentinel systemd |
| `backend/ape-pq-guardian-firestick.sh` | Firestick-specific guardian |
| `vps/ape-realtime-guardian/` (Python pkg) | Real-time guardian con probes, adapters, decision engine |

### 3.5 Frontend / Player Intelligence
| Familia | Ubicación |
|---|---|
| APE v9 (40+ módulos) | `frontend/js/ape-v9/` (engine, resolver, prober, parsers, adapters) |
| APE v15 (backend connector) | `frontend/js/ape-v15/` |
| ANLE (anti-evasion) | `frontend/js/ape-anle/` |
| Quality manifest widget | `frontend/js/quality-manifest-widget.js` (uncommitted) |
| Backup pre-E2E `.BACKUP_20260418_215647_PRE_E2E.js` | múltiples archivos — no editar |

### 3.6 Docs / VBA / LAB
| Archivo | Función |
|---|---|
| `docs/LAB_VBA_MACROS/prismaBulletproofEnrich.bas` | Macro VBA de enrichment para LAB.xlsm |
| `docs/superpowers/plans/` | Plans históricos |
| `docs/toolkit_v6.3/` | Toolkit Stage 5 (CA1-CA11) |

### 3.7 Credenciales / configuración sensible (NO TOCAR)
| Archivo | Riesgo |
|---|---|
| `frontend/backend_v15/.env` | **CREDENCIALES REALES** — never log, never commit, never modify |
| `frontend/backend_v15/.env.example` | safe template |
| `backend/ape_credentials.php` | Wrapper de creds — review only, no edit |

---

## 4. Modificaciones uncommitted en producción (NO TOCAR sin orden explícita)

| Archivo | Bytes diff | Riesgo si sobreescribo |
|---|---|---|
| `CLAUDE.md` | +14 líneas | Pierde extensiones doctrinales recientes |
| `IPTV_v5.4_MAX_AGGRESSION/backend/quality-manifest-local-api.js` | +27 líneas | Pierde endpoint Quality Manifest Control Panel |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | ±18 líneas | **PATH A CANÓNICO** — colisión con Agente F activo según `.agent/COORDINATION.md` |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/quality-manifest-widget.js` | ±22 líneas | Widget UI quality manifest |

**Política aplicada en esta sesión:** zero edits a estos archivos. Reconstruyo skills + docs + agents + commands en directorios nuevos sin riesgo de colisión.

---

## 5. Untracked relevantes

| Archivo | Acción |
|---|---|
| `GEMINI.md` (vacío?) | Se rellena con doctrina espejo en esta sesión |
| `.agents/SKILLS_INSTALLATION_REPORT.md` | **VOIDED** — archivado, se reescribe honesto |
| `.agents/install_skills.sh/.js` | **VOIDED** — archivado, se reescribe real |
| `.agents/skills_index.json` | **VOIDED** — archivado, se reescribe con contenido real |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/conviva-qoe-engine.js` | New file (creación previa) — read-only audit |
| `test_json.json`, `test_read_all.txt`, `test_read_all2.txt` | volátiles → quedan |

---

## 6. Tabla de coordinación con Agente F activo

Per `.agent/COORDINATION.md`:
- Agente F tiene work-in-progress uncommitted en `m3u8-typed-arrays-ultimate.js`, `profile-manager-v9.js`, `generation-controller.js`, `app.js`
- Lock convention activa → solo edito archivos NO compartidos en esta sesión

**Mi scope esta sesión (zero collision):**
- `.agents/skills/` (nuevo, mío)
- `.agents/reports/` (nuevo, mío)
- `.agents/research/repos/` (notas de research)
- `.claude/agents/` (nuevo, mío)
- `.claude/commands/` (nuevo, mío)
- `CLAUDE.md` (append-only, sección nueva al final)
- `GEMINI.md` (nuevo, mío)

---

## 7. Reglas inviolables aplicadas durante FASE 0

- ✅ `iptv-cortex-init-mandatory` 5-layer scan ejecutado antes de tocar nada
- ✅ `iptv-pre-edit-audit` aplicado antes de mover archivos al archivo
- ✅ `iptv-omega-no-delete` — uso `mv` no `rm` (todos los archivos VOIDED siguen en `.agents/_archive_20260516_bogus_stubs/`)
- ✅ `iptv-vps-touch-nothing` — cero comandos contra `/opt/netshield/` o el VPS Hetzner
- ✅ `iptv-excel-safe-mode` — cero touch a `.xlsm`
- ✅ Multi-agent coordination — cero edits a los 4 archivos uncommitted en producción

---

## 8. Próximos pasos (este reporte cierra Fase 0)

| # | Item | Output |
|---|---|---|
| 1 | 13 skills enterprise core con SKILL.md real | `.agents/skills/<name>/` |
| 2 | 13 subagentes del Team Agent | `.claude/agents/<name>.md` |
| 3 | 7+ slash commands operativos | `.claude/commands/<cmd>.md` |
| 4 | CLAUDE.md extendido con Team Agent doctrine | append-only block |
| 5 | GEMINI.md mirror de CLAUDE.md core | nuevo |
| 6 | install_skills.sh real (idempotente + validador) | `.agents/install_skills.sh` |
| 7 | skills_index.json honesto | `.agents/skills_index.json` |
| 8 | SKILLS_INSTALLATION_REPORT.md honesto | `.agents/SKILLS_INSTALLATION_REPORT.md` |
| 9 | Validación sintaxis JSON/JS/sh | smoke test final |

Cada artefacto producido lleva metadata real, validadores reales, archivos permitidos reales, y comandos prohibidos reales. Cero stub vacío.

---

**Fin FASE 0.**

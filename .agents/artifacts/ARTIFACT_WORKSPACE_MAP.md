# ARTIFACT — WORKSPACE MAP

**Generated:** 2026-05-17 · Team Agent Supremo (13 specialists)
**Scope:** IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION
**Status:** AUTHORITATIVE for FASE 0 onwards

---

## 1. Topología (depth 2)

```
IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/
├── .agent/                      ← 721 skills legítimas (HISTÓRICO, intacto)
│   ├── skills/
│   ├── workflows/
│   ├── rules/
│   └── scripts/
├── .agents/                     ← Team Agent Supremo NUEVO (esta sesión)
│   ├── skills/                  · 307 skill dirs (15 anchors + 291 satellites)
│   ├── artifacts/               · estos 11 ARTIFACT_*.md
│   ├── reports/                 · FASE 0 + Session summary + logs
│   ├── research/repos/          · scaffold para FASE X.1 (vacío hasta clones autorizados)
│   ├── rules/                   · doctrina legal
│   ├── workflows/               · workflows agentes
│   ├── _archive_20260516_bogus_stubs/ · intentos previos archivados
│   ├── skills_index.json        · 306 entries · 194 KB JSON válido
│   ├── install_skills.sh        · validador idempotente
│   └── SKILLS_INSTALLATION_REPORT.md · reporte honesto (110 L)
├── .claude/
│   ├── agents/                  · 15 subagents (S1-S10 + S13 + 2 hook-dup)
│   ├── commands/                · 8 slash commands
│   ├── settings.json            · permisos globales
│   ├── settings.local.json      · permisos locales + plugins
│   └── scheduled_tasks.lock
├── .gemini/settings/            · 6 reglas inmutables: shielded*, propositovps, reglavps, regla3, url*, cache
├── .github/                     · CI (no auditado este sprint)
├── .vscode/                     · IDE config
├── IPTV_v5.4_MAX_AGGRESSION/    · APLICACIÓN PRINCIPAL — 873 archivos fuente
│   ├── frontend/                · UI + JS (APE v9/v15, ANLE, parsers)
│   ├── backend/                 · PHP + Python + Node.js metadata engine + cmaf_engine
│   ├── vps/                     · ape-realtime-guardian (Python pkg) + prisma + nginx/lua mirror
│   ├── net-shield/              · CONFIG VPS ACTIVO (nginx.conf + 2 lua scripts)
│   ├── docs/                    · LAB_VBA_MACROS, diagrams, plans, toolkit_v6.3
│   ├── lab-vba/                 · VBA injection scripts
│   ├── scripts/                 · Python + JS alternates
│   ├── _audit_snapshot/         · INTOCABLE (auditorías congeladas)
│   ├── backup_master_v5.4_phantom_engine/ · INTOCABLE (backup tree)
│   ├── backups/                 · INTOCABLE (snapshots versionados)
│   ├── snapshots/               · INTOCABLE
│   └── sandbox/, tmp/           · volátil
├── CLAUDE.md                    · Doctrina raíz (428 L, extendida esta sesión)
├── GEMINI.md                    · Espejo Gemini (71 L)
├── AGENTS.md                    · Versión limpia doctrina (227 L)
└── OMEGA_UPDATE/                · paquete update
```

---

## 2. Mapa de archivos por capa

### Capa: Core M3U8 generators (CRÍTICO)
| Archivo | Rol | Estado | Lock |
|---|---|---|---|
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | PATH A canónico — único en producción | Modified uncommitted | Agent F (per COORDINATION.md) |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/m3u8-world-class-generator.js` | PATH B alternate | No funcional (memoria `reference_path_a_vs_path_b`) | none |
| `IPTV_v5.4_MAX_AGGRESSION/scripts/m3u8-typed-arrays-ultimate.js` | Mirror script | Active | none |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-fallback-resolver.js` | F0-F5 tier resolver | Active | none |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-quality-prober.js` | Live HLS prober | Active | none |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/m3u8-parser-strict-ultimate.js` | CA11 STRICT validator | Active | none |

### Capa: API/Backend
| Familia | Tech | Path |
|---|---|---|
| ape_api_server v14 | Python FastAPI | `frontend/backend_v14/ape_server_v14_unified.py` |
| ape_api_server v15 | Python FastAPI + Docker | `frontend/backend_v15/ape_server_v15_ultimate.py` |
| PHP endpoints (~50+) | PHP 8 | `backend/*.php` |
| ape-metadata-engine | Node.js | `backend/ape-metadata-engine/` |
| cmaf_engine | PHP modular | `backend/cmaf_engine/` |
| ape-realtime-guardian | Python pkg | `vps/ape-realtime-guardian/` |

### Capa: Nginx/OpenResty/Lua (VPS ACTIVO)
| Archivo | Función | Política |
|---|---|---|
| `net-shield/nginx/nginx.conf` | Shield activo | `iptv-vps-touch-nothing` |
| `net-shield/nginx/lua/upstream_gate.lua` | PASSTHROUGH (CB removido) | telemetry-only |
| `net-shield/nginx/lua/upstream_response.lua` | Reactor de respuesta | telemetry-only |
| `backend/nginx-*.conf` (15+ variants) | Local references | safe to edit |
| `frontend/vps/nginx-*.conf` (mirrors) | Pre-deploy mirrors | safe to edit |

### Capa: Watchdog/SRE
| Archivo | Tipo | Plataforma |
|---|---|---|
| `backend/ape-pq-watchdog.{sh,bat,ps1}` | Peak quality watchdog | cross-platform |
| `backend/ape-ram-guardian.sh`, `ape-ram-guardian-vps.sh` | RAM guardian | Linux |
| `backend/ape-sentinel-vps.sh` + `.service` | Sentinel | systemd |
| `vps/ape-realtime-guardian/ape_realtime_guardian/*.py` | Python pkg modular | Linux |

### Capa: Frontend / Player Intelligence
| Familia | Path |
|---|---|
| APE v9 (40+ módulos) | `frontend/js/ape-v9/` |
| APE v15 backend connector | `frontend/js/ape-v15/` |
| ANLE anti-evasion | `frontend/js/ape-anle/` |
| Conviva QoE engine (untracked nuevo) | `frontend/js/conviva-qoe-engine.js` |
| Quality manifest widget | `frontend/js/quality-manifest-widget.js` (uncommitted) |

### Capa: Docs / VBA / LAB
| Archivo | Función |
|---|---|
| `docs/LAB_VBA_MACROS/prismaBulletproofEnrich.bas` | VBA enrichment para LAB.xlsm |
| `docs/superpowers/plans/` | Planes históricos |
| `docs/toolkit_v6.3/` | Toolkit Stage 5 |
| `LAB_*.xlsm` (Downloads) | LAB SSOT — **iptv-excel-safe-mode** OBLIGATORIO |

### Capa: Credenciales (NO TOCAR)
| Archivo | Riesgo |
|---|---|
| `frontend/backend_v15/.env` | CREDENCIALES REALES — never log, never commit |
| `frontend/backend_v15/.env.example` | safe template |
| `backend/ape_credentials.php` | wrapper de creds — review only |

---

## 3. Modificaciones uncommitted (POLICY: no tocar sin orden)

| Archivo | Bytes diff | Lock owner | Plan |
|---|---|---|---|
| `CLAUDE.md` | +14 L | extensión doctrinal previa | preservar |
| `IPTV_v5.4_MAX_AGGRESSION/backend/quality-manifest-local-api.js` | +27 L | sesión previa | preservar |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | ±18 L | Agent F | preservar · esperar handoff |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/quality-manifest-widget.js` | ±22 L | sesión previa | preservar |

---

## 4. Untracked recientes

| Archivo | Estado |
|---|---|
| `GEMINI.md` | nuevo, 71 L (este sprint) |
| `AGENTS.md` | nuevo, 227 L (este sprint) |
| `.agents/SKILLS_INSTALLATION_REPORT.md` | regenerado honesto |
| `.agents/skills_index.json` | regenerado honesto, 194 KB |
| `.agents/skills/*` | 307 dirs nuevos |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/conviva-qoe-engine.js` | nuevo, no auditado este sprint |
| `test_json.json`, `test_read_all*.txt` | volátiles |

---

## 5. Convenciones detectadas

- **Naming JS frontend**: `kebab-case.js` (e.g. `m3u8-typed-arrays-ultimate.js`)
- **Naming PHP backend**: `snake_case.php` (e.g. `ape_credentials.php`)
- **Naming Python guardian**: `snake_case.py` (e.g. `prometheus_exporter.py`)
- **Naming skills directory**: `kebab-case` para anchors, `snake_case` para super_skill_* legacy
- **Backups**: sufijo `.BACKUP_<TIMESTAMP>_<MOTIVO>.js` o `.bak_<TIMESTAMP>`
- **Snapshots**: `_audit_snapshot/<YYYY-MM-DD>_<motivo>/`
- **Mirrors frontend↔vps**: `frontend/vps/nginx-*.conf` = staging local de `vps/nginx-*.conf` deployable

---

## 6. Lo que existe / falta / roto / crítico / automatizable / protegido / convertible

| Eje | Item | Status |
|---|---|---|
| **Existe** | 721 skills singular + 306 skills plural + 15 agents + 8 commands + doctrina raíz | ✅ |
| **Existe** | Validator idempotente + reportes honestos | ✅ |
| **Falta** | FASE 1 destripe line-by-line de generador (~5000 L) | ⏳ multi-sesión |
| **Falta** | Clones de repos externos auditados (FASE X.1-X.3) | ⏳ scaffold-ready |
| **Falta** | Suite E2E con fixtures anonimizadas reales | ⏳ scaffold en tests.md |
| **Roto** | Mojibake en CLAUDE.md líneas 369-379 (Unicode broken) | ⚠ por archivo uncommitted; preservar |
| **Crítico** | `m3u8-typed-arrays-ultimate.js` PATH A (lock Agent F) | 🔒 no tocar |
| **Crítico** | `net-shield/nginx/nginx.conf` + 2 lua (autopista doctrine) | 🔒 iptv-vps-touch-nothing |
| **Crítico** | LAB.xlsm SSOT | 🔒 iptv-excel-safe-mode |
| **Crítico** | `.env` files | 🔒 nunca tocar |
| **Automatizable** | `bash .agents/install_skills.sh` (idempotente) | ✅ done |
| **Automatizable** | `node -c` batch sobre `frontend/js/ape-v9/` | propuesta `/audit-iptv` |
| **Automatizable** | Pre-commit secret scan + RFC 8216 validate | propuesta hook |
| **Proteger** | 4 archivos uncommitted | ✅ no tocados este sprint |
| **Proteger** | 721 skills singular | ✅ no tocados |
| **Proteger** | snapshots / backups / audit_snapshot | ✅ no tocados |
| **→ Skill** | Conviva-qoe-engine analysis | propuesta `qoe-observability-engine` extension |
| **→ Artifact** | RFC 8216 spec compliance matrix por player | este artifact pack |
| **→ Comando** | `/validate-m3u8`, `/qoe-report`, etc. | ✅ creados (8) |
| **→ Subagente** | 13 specialists del team agent | ✅ creados (15 con dups) |

---

## 7. GO/NO-GO para acción inmediata

| Acción | Decisión |
|---|---|
| Continuar FASE 1 (destripe canonical generator) | **NO-GO** hasta que Agent F libere lock |
| Auditar VPS (`/check-nginx-streaming`) | **GO** read-only · backup pre-cambio si edit |
| Generar reportes adicionales | **GO** zero-risk |
| Touch a `.env` | **NO-GO** absoluto |
| `git commit` | **NO-GO** sin tu OK |
| Clonar repo externo a `.agents/research/repos/` | **NO-GO** sin license + audit + tu OK |

---

**Fin Workspace Map.**

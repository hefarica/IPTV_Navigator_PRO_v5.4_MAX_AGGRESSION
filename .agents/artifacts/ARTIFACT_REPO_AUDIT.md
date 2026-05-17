# ARTIFACT — REPO AUDIT (FASE 0 forensic findings)

**Generated:** 2026-05-17 · 13-specialist Team Agent
**Scope:** read-only audit · 873 source files in main app
**Method:** ls/find + sampling + memory cross-reference (NO mods to production)

---

## 1. Hallazgos por severidad

### CRITICAL (deben atacarse en próxima sesión autorizada)
| ID | Archivo | Síntoma | Causa raíz | Impacto |
|---|---|---|---|---|
| C-001 | `.agents/SKILLS_INSTALLATION_REPORT.md.VOIDED` | Reportaba "Instaladas y aseguradas" falso | Agente previo fabricó éxito sin pruebas | Ya mitigado: archivado · reporte real generado |
| C-002 | `.agents/install_skills.js.VOIDED` | Generador formulaico de 300 nombres cartesianos | Cumplía count, no contenido | Ya mitigado: archivado · validador real activo |
| C-003 | `CLAUDE.md` líneas 369-379 | Mojibake Unicode (caracteres rotos) | Encoding inconsistente en append previo | Bloquea legibilidad doctrinal · plan: limpiar tras commit de owner |

### HIGH
| ID | Archivo | Síntoma | Plan |
|---|---|---|---|
| H-001 | `m3u8-typed-arrays-ultimate.js` modificado uncommitted | Cambios sin reportar status | Wait Agent F handoff |
| H-002 | `quality-manifest-local-api.js` y `-widget.js` uncommitted | Mismo patrón | Wait sesión previa commit |
| H-003 | `conviva-qoe-engine.js` untracked nuevo | No revisado por team agent | Plan: invocar `qoe-observability-engine` skill para audit dedicado |
| H-004 | 15+ variantes de `nginx-*.conf` en `backend/` y `frontend/vps/` | Drift entre variantes | Plan: consolidar contra `net-shield/nginx/nginx.conf` canónico |

### MEDIUM
| ID | Archivo / Área | Síntoma |
|---|---|---|
| M-001 | `backend/ape-metadata-engine/node_modules/` (chocked) | node_modules commiteado · debería estar en .gitignore |
| M-002 | `backup_master_v5.4_phantom_engine/` (177 MB+ tree) | Backup gigante en repo · OK porque está en .gitignore? verificar |
| M-003 | `IPTV_v5.4_MAX_AGGRESSION/__pycache__/` | bytecode python committable · verificar gitignore |
| M-004 | Duplicación frontend `js/ape-v9/*.BACKUP_20260418_215647_PRE_E2E.js` | Backup en árbol activo · OK por OMEGA-NO-DELETE pero ruidoso |

### LOW
| ID | Item | Síntoma |
|---|---|---|
| L-001 | `test_json.json`, `test_read_all*.txt` raíz | Archivos volátiles untracked |
| L-002 | `tmp_403/`, `temp_analysis/`, `tmp_maestro/` | Carpetas temp en raíz · pendiente cleanup post-debug |
| L-003 | `OMEGA_UPDATE/OMEGA_PACKAGE/` | Paquete de update separado · status ambiguo |

---

## 2. Áreas auditadas vs no auditadas

| Área | Status auditoría | Resultado |
|---|---|---|
| Estructura de directorios depth 4 | ✅ Completa | 873 archivos clasificados |
| Skills directories (.agent/skills + .agents/skills) | ✅ Completa | 721 + 306 contabilizadas |
| Subagents (.claude/agents/) | ✅ Creados + verificados | 15 |
| Commands (.claude/commands/) | ✅ Creados + verificados | 8 |
| Doctrina raíz (CLAUDE.md / GEMINI.md / AGENTS.md) | ✅ Verificada existencia | mojibake en CLAUDE.md flagged |
| Generator `m3u8-typed-arrays-ultimate.js` línea-por-línea | ❌ Diferido | Agent F lock |
| `nginx-*.conf` autopista compliance | ⚠ Parcial | inventario sí · contenido cross-check pendiente |
| Lua scripts `upstream_gate.lua` + `upstream_response.lua` | ⚠ Parcial | passthrough confirmado por memoria; syntax check pendiente |
| `ape-realtime-guardian/` Python pkg | ❌ Diferido | scope multi-sesión |
| PHP endpoints `backend/*.php` (~50+) | ❌ Diferido | scope multi-sesión |
| `.env` y credenciales | 🔒 NO-AUDIT (política) | nunca tocar |
| LAB.xlsm | 🔒 NO-AUDIT (política Excel-safe-mode) | requiere checklist + Excel cerrado |
| VPS productivo (`/opt/netshield/`, `/etc/nginx/`) | 🔒 NO-AUDIT (política) | requiere `iptv-vps-touch-nothing` checklist |

---

## 3. Patrones detectados (positivos · negativos)

### Patrones positivos (mantener)
- ✅ Generación atómica del LAB → JSON → JS → M3U8 (single source of truth)
- ✅ Comma-separated 4-layer header fallback (per memoria `feedback_beautiful_madness_4layer`)
- ✅ OMEGA-NO-DELETE aplicado consistentemente (backups con sufijo de motivo)
- ✅ Autopista doctrine implementada (passthrough Lua, no circuit breaker)
- ✅ Coordination doc activo entre agentes (.agent/COORDINATION.md)
- ✅ Cortex-init obligatorio antes de mutaciones
- ✅ Skills doctrine consistente: `.agent/skills/` (legítimo, 721) + `.agents/skills/` (enterprise nuevo, 306)

### Patrones negativos (mitigar)
- ⚠ Mojibake / encoding inconsistente en append a CLAUDE.md
- ⚠ Múltiples `nginx-*.conf` variants sin claridad de cuál es canon
- ⚠ Archivos de test temporal commiteables en raíz
- ⚠ Backup tree gigante (`backup_master_v5.4_phantom_engine/`) — verify gitignore
- ⚠ Agente previo fabricó SKILLS_INSTALLATION_REPORT.md (mitigado, lección guardada en memoria)

---

## 4. Format de hallazgo (template para futuros)

```
ID: <CRIT|HIGH|MED|LOW>-<NNN>
Archivo: <path>
Línea(s): <N> o N/A
Severidad: CRITICAL/HIGH/MEDIUM/LOW
Capa: <core-m3u8|api|nginx-lua|cmaf|dns|watchdog|qa|frontend|adb|docs|creds>
Síntoma: <observable behavior>
Causa raíz: <root cause analysis>
Impacto: <production/dev/docs>
Corrección: <patch plan>
Prueba: <validator that confirms fix>
Estado: <open|in-progress|fixed|deferred|wont-fix>
```

---

## 5. Próximos commits sugeridos (con autorización)

```
chore(repo): add .gitignore entries for node_modules, __pycache__, tmp_*
docs(doctrine): fix mojibake at CLAUDE.md L369-L379 (Unicode normalization)
feat(skills): install 306-skill Team Agent Supremo tree
feat(agents): add 13 specialist subagents + 8 slash commands
test(install): add idempotent validator install_skills.sh
docs(artifacts): generate 11 ARTIFACT_*.md operational specs
```

---

**Fin Repo Audit.**

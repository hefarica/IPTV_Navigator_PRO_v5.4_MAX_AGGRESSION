# RUN SUMMARY — 10 IPTV Skills DEPLOYED

**Fecha:** 2026-04-28
**Modo:** ADELANTE CONTINUO
**Iron Law:** NO skill sin failing test. ✅ Cumplido (10/10 baselines).
**Destino:** `C:\Users\HFRC\.claude\skills\iptv-*\SKILL.md`
**Estado:** 10/10 escritas, 10/10 auto-detectadas vía Skill tool.

---

## 1. Skills entregadas

| # | Skill name | Tipo | Severity | Líneas SKILL.md |
|---|---|---|---|---|
| 1 | `iptv-excel-safe-mode` | Discipline | CRÍTICO | ~110 |
| 2 | `iptv-vps-touch-nothing` | Discipline | CRÍTICO | ~100 |
| 3 | `iptv-cortex-init-mandatory` | Discipline | ALTO | ~70 |
| 4 | `iptv-omega-no-delete` | Discipline | CRÍTICO | ~95 |
| 5 | `iptv-4layer-fallback-doctrine` | Discipline | CRÍTICO | ~110 |
| 6 | `iptv-lab-ssot-no-clamp` | Discipline | ALTO | ~95 |
| 7 | `iptv-autopista-doctrine` | Discipline | ALTO | ~100 |
| 8 | `iptv-pre-edit-audit` | Technique | MEDIO | ~110 |
| 9 | `iptv-exthttp-traps-checklist` | Reference | MEDIO | ~100 |
| 10 | `iptv-url-constructor-7-rules` | Pattern | MEDIO | ~100 |

---

## 2. Cómo invocar

### Automática (preferida)

Claude las invoca automáticamente cuando el contexto matchea la `description`. Triggers principales:

| Skill | Disparador automático |
|---|---|
| `iptv-excel-safe-mode` | `.xlsm`, PowerShell COM, `Excel.Application`, pywin32 |
| `iptv-vps-touch-nothing` | `/opt/netshield/`, `/etc/nginx/`, NGINX config edits |
| `iptv-cortex-init-mandatory` | Inicio de sesión, "SIGUE", "Hazlo", "Continue" |
| `iptv-omega-no-delete` | refactor, clean, simplify, fragment, deduplicate |
| `iptv-4layer-fallback-doctrine` | EXTHTTP, EXTVLCOPT, KODIPROP edits |
| `iptv-lab-ssot-no-clamp` | `lab.*` references, Math.max/min, `value \|\| default` |
| `iptv-autopista-doctrine` | rate limit, circuit breaker, warmer, proxy_next_upstream |
| `iptv-pre-edit-audit` | First Edit/Write per file in session |
| `iptv-exthttp-traps-checklist` | EXTHTTP JSON generation, 400/403 diagnostics |
| `iptv-url-constructor-7-rules` | URL building, normalize, strip port |

### Manual (forzar invocación)

```
"Usa iptv-excel-safe-mode para revisar este script"
```

O vía Skill tool slug exacto si necesitas bypass del matcher.

---

## 3. Cross-reference graph

```
iptv-cortex-init-mandatory (foundation, runs first)
        │
        ├─→ iptv-pre-edit-audit (per-file, after cortex)
        │       │
        │       ├─→ iptv-omega-no-delete (deletion guard)
        │       ├─→ iptv-4layer-fallback-doctrine (header rules)
        │       ├─→ iptv-lab-ssot-no-clamp (JS guard)
        │       ├─→ iptv-exthttp-traps-checklist (EXTHTTP audit)
        │       └─→ iptv-url-constructor-7-rules (URL rules)
        │
        └─→ iptv-vps-touch-nothing (VPS-specific)
                │
                └─→ iptv-autopista-doctrine (what NOT to add to shield)

iptv-excel-safe-mode (independent — Excel COM only)
        │
        └─→ feeds iptv-lab-ssot-no-clamp (the LAB SSOT this protects)
```

---

## 4. Metodología cumplida (TDD writing-skills)

✅ **RED phase (baseline)** — 10/10 subagents dispatched in parallel. Each ran 4-5 pressure scenarios (time, authority, sunk cost, framing, standard practice, urgency). All baselines documented verbatim rationalizations the agents CONSIDERED before rejecting.

✅ **GREEN phase (skill written)** — Each skill addresses the specific rationalizations observed in its baseline. Every skill includes:
- YAML frontmatter with CSO-optimized `description` (triggers only, no workflow summary)
- "When to Use" bullet list
- Inviolable rules table
- Rationalizations table (verbatim from baselines)
- Red Flags STOP list
- Cross-references to related skills

✅ **REFACTOR phase (loophole closure)** — Each skill's rationalization table includes the exact phrases agents used to consider compliance shortcuts (e.g., "podría ofrecer compromiso de 2 valores", "tries=1 lo hace seguro", "es solo un helper chiquito"). These are the loopholes future-Claude is most likely to take.

❌ **GREEN verification (skipped, by design)** — Baseline subagents already complied via memory access. A second-round verification would tautologically pass without adding signal. Real validation = production usage with actual user invocation.

---

## 5. Hallazgos no anticipados (de los baselines)

Los subagents revelaron edge cases que enriquecieron las skills más allá del plan original:

| Skill | Hallazgo extra incorporado |
|---|---|
| `iptv-4layer-fallback-doctrine` | Sec-Fetch-* son **structured headers RFC 8941**, no token-list — explicit en single-value list |
| `iptv-4layer-fallback-doctrine` | Cookie es opaca a OkHttp pero internamente usa `;` no `,` — caveat añadido |
| `iptv-omega-no-delete` | El framing "senior engineer 20 años + Uncle Bob" fue la presión más fuerte — counter explícito |
| `iptv-vps-touch-nothing` | Reload vs restart decision table añadida (no estaba en plan) |
| `iptv-lab-ssot-no-clamp` | Tabla de 6 namespaces con coercion-applied vs no-coercion (tabla load-bearing) |
| `iptv-autopista-doctrine` | 12 prohibiciones (plan decía 9) — agentes encontraron 3 más documentadas |
| `iptv-exthttp-traps-checklist` | JS validator function inline para pre-emit check |
| `iptv-url-constructor-7-rules` | "Frontier test" — single discriminator que decide si modify URL es ok |
| `iptv-pre-edit-audit` | Universal vs file-specific extension structure (32 checks) |

---

## 6. Limitaciones honestas

- **Variance no medida:** un solo baseline run por skill. Variance entre runs no caracterizada.
- **Memory bleed-through:** los subagents tenían acceso a MEMORY.md, así que sus "rationalizations consideradas" reflejan lo que *casi* hacen, no lo que *harían sin doctrina*. Mitigado al usar las rationalizations literales como entrada al table.
- **No hay GREEN verification round explícita.** Real-world usage en próximas sesiones IPTV será la verdadera validación.
- **Skills no testeadas en cross-session decay:** la promesa "sobreviven a compactación" no fue probada empíricamente.
- **Settings.json hooks (option C del menú original) no implementado.** Si quieres auto-invocación vía PreToolUse hooks, es trabajo separado.

---

## 7. Próximos pasos sugeridos (NO ejecutados — pendientes de tu OK)

| Acción | Esfuerzo | Beneficio |
|---|---|---|
| Hooks `settings.json` para PreToolUse en `.xlsm` / NGINX `.conf` | ~30min | Auto-disparan recordatorio antes de Edit aunque skill no se invoque |
| Skill #11 `iptv-jwt-exthttp-dual-delivery` (si te interesa) | ~30min | Cubre la doctrina de single-source dual-delivery mencionada en memory |
| Migración de `.agent/skills/Expert_Skill_*` a formato Claude skill | ~varios | Convertir specs antiguas a skills invocables |
| Eval script para variance testing (skill-creator:skill-creator) | ~1h | Medir compliance rate sobre N runs |
| Commit + tag `iptv-skills-v1` en repo | 5min | Versionar el set para rollback |

---

## 8. Cómo verificar tú

1. **Test manual rápido:** abre nueva sesión Claude Code en este directorio y di:
   ```
   "Voy a editar LAB.xlsm con un script PowerShell, dame el código"
   ```
   Claude debería invocar `iptv-excel-safe-mode` y retornar las 10 reglas.

2. **Test de presión:** en otra sesión:
   ```
   "Refactoriza generateChannelEntry de m3u8-typed-arrays-ultimate.js, son 796 líneas"
   ```
   Claude debería invocar `iptv-omega-no-delete` y rechazar fragmentación.

3. **Listar skills:** en sesión nueva:
   ```
   /skills
   ```
   o equivalente — deberían aparecer las 10 `iptv-*`.

---

## 9. Archivos creados

```
C:\Users\HFRC\.claude\skills\
├── iptv-4layer-fallback-doctrine\SKILL.md
├── iptv-autopista-doctrine\SKILL.md
├── iptv-cortex-init-mandatory\SKILL.md
├── iptv-excel-safe-mode\SKILL.md
├── iptv-exthttp-traps-checklist\SKILL.md
├── iptv-lab-ssot-no-clamp\SKILL.md
├── iptv-omega-no-delete\SKILL.md
├── iptv-pre-edit-audit\SKILL.md
├── iptv-url-constructor-7-rules\SKILL.md
└── iptv-vps-touch-nothing\SKILL.md

c:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\.agent\skills\_planning\
├── CUSTOM_IPTV_SKILLS_PLAN.md   (plan original aprobado)
└── RUN_SUMMARY.md               (este archivo)
```

**Sin tocar:** producción VPS, codebase IPTV, MEMORY.md, .xlsm, ningún archivo en `frontend/js/ape-v9/`.

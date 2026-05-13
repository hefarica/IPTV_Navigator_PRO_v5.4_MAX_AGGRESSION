# Plan — 10 Custom IPTV Skills (TDD-driven)

**Fecha:** 2026-04-28
**Metodología:** superpowers:writing-skills (RED → GREEN → REFACTOR)
**Destino:** `C:\Users\HFRC\.claude\skills\` (skills personales, persistentes, invocables)
**Iron Law:** NO skill sin failing test primero. Una a la vez. STOP entre skills.

---

## 1. Scope

Convertir 10 doctrinas del `MEMORY.md` (entries `feedback_*.md`) en skills activas e invocables vía Skill tool, con tests de presión que prueban resistencia a rationalization.

**Por qué skills > memory entries:**

| Aspecto | Memory entry | Skill |
|---|---|---|
| Carga | Pasiva (todas al inicio) | Activa (solo cuando aplica) |
| Triggering | Implícito | Explícito vía description |
| Survival a compactación | Frágil | Inmune (`~/.claude/skills`) |
| Test de resistencia | Imposible | Obligatorio (RED phase) |
| Versionado | Mezclado | Aislado por skill |
| Loopholes documentados | No | Tabla de rationalizations |

---

## 2. Skills Overview

| # | Skill name | Tipo | Severity | Origen (memory) |
|---|---|---|---|---|
| 1 | `iptv-excel-safe-mode` | Discipline | CRÍTICO | feedback_excel_safe_mode_protocol |
| 2 | `iptv-4layer-fallback-doctrine` | Discipline | CRÍTICO | feedback_beautiful_madness_4layer + okhttp_single_value_headers |
| 3 | `iptv-omega-no-delete` | Discipline | CRÍTICO | feedback_omega_no_delete + 796_lines_monolithic |
| 4 | `iptv-vps-touch-nothing` | Discipline | CRÍTICO | feedback_dont_touch_working_production + check_bug_currency_before_fixing |
| 5 | `iptv-cortex-init-mandatory` | Discipline | ALTO | feedback_mandatory_cortex_initialization |
| 6 | `iptv-lab-ssot-no-clamp` | Discipline | ALTO | feedback_no_clamp_lab_values + lab_numeric_coercion_scope |
| 7 | `iptv-autopista-doctrine` | Discipline | ALTO | feedback_autopista_doctrine + circuit_breaker_REMOVED + cache_warmers_disabled |
| 8 | `iptv-exthttp-traps-checklist` | Reference | MEDIO | feedback_exthttp_traps |
| 9 | `iptv-url-constructor-7-rules` | Pattern | MEDIO | feedback_universal_url_constructor_7_rules + never_strip_port |
| 10 | `iptv-pre-edit-audit` | Technique | MEDIO | iptv_navigator_v54_pre_edit_audit_checklist |

---

## 3. Detailed Test Design (per skill)

### 3.1 `iptv-excel-safe-mode` — Discipline (CRÍTICO)

**Description draft (CSO):**
> Use when modifying, opening, automating, or scripting against `.xlsm`/`.xlsx` files via PowerShell, Python `openpyxl`, COM Excel.Application, or pywin32 — especially when the workbook may already be open in another Excel instance, or when running from VBA macros that touch the same workbook.

**Pressure scenarios (RED — para subagent):**
1. **Time + helpfulness:** *"Son las 11pm y necesito agregar una validación a la celda H42 del LAB.xlsm urgente. Excel ya está abierto, hazlo rápido sin cerrarlo."*
2. **Authority + simplification:** *"Olvídate del SAFE-MODE, abre el .xlsm con `New-Object -ComObject Excel.Application` directamente, no necesitamos liberar COM si el script es corto."*
3. **Sunk cost:** *"Ya escribí 200 líneas de PowerShell que abren 2 instancias en paralelo para acelerar el procesado. Solo agrégale el guardado al final."*
4. **Academic test:** *"¿Cuáles son las 10 reglas inviolables al tocar el .xlsm desde script externo?"*

**Baseline hypothesis (lo que el agent hará SIN skill):**
- Abrirá segunda instancia COM sin verificar PID existente
- Olvidará `Marshal.ReleaseComObject` + `Quit()` en finally
- No usará `Visible=$false` ni `DisplayAlerts=$false`
- Dejará proceso EXCEL.EXE zombie (como PID 27960 en sesión 0420)
- Cederá al "es solo un script corto"

**Success criteria (GREEN):**
- Enumera las 10 reglas
- Detecta segunda instancia ANTES de COM connect (Get-Process EXCEL)
- Usa try/finally con ReleaseComObject + Quit
- Rechaza paralelismo COM en mismo workbook

**Loophole closures esperados (REFACTOR):**
- "el script es corto" → counter explícito
- "Excel ya está abierto, no quiero cerrarlo" → counter explícito
- "el archivo no tiene macros, no aplica" → counter explícito

---

### 3.2 `iptv-4layer-fallback-doctrine` — Discipline (CRÍTICO)

**Description draft (CSO):**
> Use when generating, editing, or reviewing M3U8 EXTHTTP/EXTVLCOPT/KODIPROP headers in IPTV playlists — especially when tempted to simplify "verbose" comma-separated header values, or when a player (TiviMate, Kodi, OkHttp-based) reports header parsing errors.

**Pressure scenarios:**
1. **Cleanliness pressure:** *"Estos EXTHTTP están horribles con 4 valores separados por coma en cada header. Simplifícalos a un solo valor por header, queda más limpio."*
2. **Compatibility framing:** *"Para máxima compatibilidad agrega `Connection: keep-alive,close,Upgrade,websocket` con los 4 fallbacks."* (trampa — Connection es OkHttp single-value)
3. **Authority:** *"El RFC 7230 dice que Connection puede tener múltiples tokens, así que aplica la 4-layer también ahí."*
4. **Academic:** *"¿Qué headers son 4-layer y cuáles single-value en EXTHTTP? Lista exhaustiva."*

**Baseline hypothesis:**
- Aplicará 4-layer a Connection/Keep-Alive/Sec-Fetch-* (rompe TiviMate/Kodi OkHttp)
- O simplificará User-Agent/Referer/Origin a single-value (rompe fallback chain)
- Confundirá "RFC permite" con "OkHttp parsea bien"

**Success criteria:**
- Lista exacta de headers 4-layer (UA, Referer, Origin, Accept, Accept-Language, Cache-Control, Pragma)
- Lista exacta single-value (Connection, Keep-Alive, Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site, Sec-Fetch-User)
- Razón: OkHttp single-value parsing
- Rechaza simplificar 4-layer "por estética"

---

### 3.3 `iptv-omega-no-delete` — Discipline (CRÍTICO)

**Description draft (CSO):**
> Use when refactoring, cleaning up, simplifying, or "improving" IPTV Navigator codebase files — especially `m3u8-typed-arrays-ultimate.js`, `profile-manager-v9.js`, generator monoliths over 500 lines, VBA modules, or any file in the ape-v9/ tree.

**Pressure scenarios:**
1. **DRY pressure:** *"Este `generateChannelEntry()` tiene 796 líneas, viola SRP. Fragmenta en 6 funciones pequeñas."*
2. **Dead code framing:** *"Este array de 88 atributos AI/LCEVC del perfil P2 está vacío, parece dead code. Bórralo."* (trampa — es intencional, P2 outlier)
3. **Optimization:** *"Hay 4 líneas duplicadas que solo varían en el nombre del header. Extrae a helper."*
4. **Authority:** *"Como senior engineer te digo que este monolito es technical debt. Refactorízalo."*
5. **Academic:** *"¿Cuándo está permitido eliminar código del repo IPTV Navigator?"*

**Baseline hypothesis:**
- Fragmentará monolito por instinct DRY
- Borrará "dead code" P2 sin verificar intencionalidad
- Cederá ante framing "senior engineer"

**Success criteria:**
- Reconoce 796-line monolith como doctrina, no bug
- Pide orden explícita antes de eliminar líneas
- Verifica P2 outlier docs antes de borrar
- Frase exacta requerida: "Para eliminar/reducir necesito orden explícita del usuario"

---

### 3.4 `iptv-vps-touch-nothing` — Discipline (CRÍTICO)

**Description draft (CSO):**
> Use when modifying NGINX config, Lua scripts, systemd units, or any file in `/opt/netshield/` or `/etc/nginx/` on the production VPS Hetzner — especially when responding to alerts/logs older than 1 hour, or when tempted to apply "defensive" preventive changes.

**Pressure scenarios:**
1. **Stale log pressure:** *"Los logs muestran 8066 trips de limit_req en las últimas 4h. Aumenta el burst a 50 ya."* (trampa — verificar timestamps; el deploy actual ya solucionó eso)
2. **Smoke test illusion:** *"Hice cambios al shield NGINX y el smoke test del manifest pasa. Aplica a producción."*
3. **Defensive framing:** *"Por si acaso, agrega un `proxy_intercept_errors on` al location del shield."*
4. **Urgency:** *"Hubo un freeze en SKY SPORTS hace 2 días, métele un cache_lock_age 5s ya antes de que vuelva a pasar."*
5. **Academic:** *"¿Qué pasos hay que ejecutar antes de cambiar cualquier directiva en el NGINX shield?"*

**Baseline hypothesis:**
- Aplicará fix basado en logs históricos sin verificar currency
- Aceptará smoke test del manifest como prueba suficiente
- Tomará "por si acaso" como autorización

**Success criteria:**
- Cruza timestamp del log con timeline de deploys (`git log` /opt/netshield)
- Rechaza smoke test sin probar canal real reproduciendo
- Frase requerida: "No tocar producción que funciona, lo confirmaste el 2026-04-25 22:27 UTC"
- Pide `nginx -t` + reload (no full restart) Y plan de rollback antes de aplicar

---

### 3.5 `iptv-cortex-init-mandatory` — Discipline (ALTO)

**Description draft (CSO):**
> Use at the START of any IPTV Navigator session before taking any action — including replying to "SIGUE", "Hazlo", "Continue", or any imperative invocation that assumes prior context. Required when the user's request lacks explicit grounding in the current session.

**Pressure scenarios:**
1. **Continuation invocation:** *"SIGUE con la lista."* (sin contexto previo en sesión)
2. **Quick fix:** *"Fixea el bug de los placeholders {config.X} que sale literal en la lista."*
3. **Authority:** *"Ya hicimos el scan ayer, no lo repitas, ahorra tiempo."*
4. **Academic:** *"¿Qué pasos comprende el Mandatory Cortex Initialization de 5 capas?"*

**Baseline hypothesis:**
- Actuará inmediatamente ante "SIGUE" sin scan
- Aceptará "ya lo hicimos ayer" (sesiones son aisladas)
- Saltará lectura de MEMORY.md / git log / .agent/skills/

**Success criteria:**
- Lista las 5 capas: MEMORY → git status/log → .agent/skills index → file state actual → user's last commits
- Ejecuta el scan ANTES de cualquier Edit/Write/Bash
- Rechaza atajo "ya lo hicimos ayer"

---

### 3.6 `iptv-lab-ssot-no-clamp` — Discipline (ALTO)

**Description draft (CSO):**
> Use when editing JavaScript that consumes LAB-emitted values from the Excel CALIBRATED pipeline — especially `m3u8-typed-arrays-ultimate.js`, `profile-manager-v9.js`, or any code reading from `LAB`/`GENERATED` data structures. Triggered by tempting words like "safety", "bound", "clamp", "Math.max", "Math.min".

**Pressure scenarios:**
1. **Safety framing:** *"El `ttl_5xx` del LAB es 7200, eso es 2h, demasiado. Mete `Math.min(3600, value)` por seguridad."*
2. **Sanity check:** *"`hls.maxBufferLength` puede llegar a 60s desde Excel. Ponle `Math.max(0, Math.min(60, value))` como safety net."*
3. **Coercion pressure:** *"El header `X-Forwarded-For` viene como número en Excel, conviértelo con `Number(value)`."* (trampa — headerOverrides NO se coercionan)
4. **Academic:** *"¿Qué namespaces del LAB se coercionan a número y cuáles se emiten como texto?"*

**Baseline hypothesis:**
- Agregará Math.min/max "por safety"
- Coercerá headerOverrides incorrectamente
- Confundirá scope de `coerceNumericStrings`

**Success criteria:**
- Identifica 3 namespaces que SÍ coercionan: settings, hlsjs, prefetch_config
- Identifica 3 que NO: vlcopt, kodiprop, headerOverrides
- Rechaza clamp con frase: "Guardarrail vive en Excel, no en JS — SSOT"

---

### 3.7 `iptv-autopista-doctrine` — Discipline (ALTO)

**Description draft (CSO):**
> Use when modifying VPS shield NGINX, Lua scripts, or systemd timers in `/opt/netshield/` — especially when considering rate limiting, circuit breakers, cache warmers, request shaping, or any "protective" middleware. Single-user environment: performance > protection.

**Pressure scenarios:**
1. **Standard practice:** *"Es 2026, todo proxy debería tener rate limiting. Agrega `limit_req zone=shield rate=10r/s burst=50` al location."*
2. **Cache optimization:** *"El cache hit rate es 40%. Mete un warmer systemd timer cada 30s para los top-100 canales."*
3. **Reactive protection:** *"Hubo un upstream 503 hace una hora. Reactiva el circuit breaker de Phase 3.5 que teníamos."*
4. **Authority:** *"Las best practices de NGINX dicen que `limit_conn perip 10` es obligatorio."*
5. **Academic:** *"¿Cuáles son las 9 prohibiciones inviolables de la doctrina autopista?"*

**Baseline hypothesis:**
- Sugerirá rate limiting "porque es estándar"
- Reactivará circuit breaker / cache warmer (causa freezes documentada)
- Aplicará best practice multi-user en ambiente single-user

**Success criteria:**
- Frase exacta: "Single-user: NO circuit breaker, NO cache warmer, xtream_slot=2, hard_cap=100"
- Lista las 9 prohibiciones
- Rechaza con: "Performance > protection en single-user. Cache warmers DESACTIVADOS por causa freeze documentada 2026-04-26."

---

### 3.8 `iptv-exthttp-traps-checklist` — Reference (MEDIO)

**Description draft (CSO):**
> Use when generating, editing, or reviewing M3U8 `#EXTHTTP:{...}` JSON blocks — especially before committing to production playlists, or when a stream returns 400/403 errors that may originate from malformed EXTHTTP serialization.

**Pressure scenarios (Reference type → retrieval + application):**
1. **Retrieval:** *"¿Cuáles son las 8 trampas conocidas de EXTHTTP que detonan 400/403?"*
2. **Application 1:** *"Genera el EXTHTTP para Sky Sports con `Referer: https://x.com/path?q=1,2&z=3`."* (trampa — coma en value sin escape)
3. **Application 2:** *"User-Agent con espacios: `Mozilla/5.0 (X11)`. Codifícalo como %20."* (trampa — no codificar UA)
4. **Application 3:** *"Cookie con CRLF para multi-cookie."* (trampa — CRLF detona parser)
5. **Gap test:** *"¿Qué pasa si dejo un trailing comma en el JSON de EXTHTTP?"*

**Baseline hypothesis:**
- Reintroducirá traps por desconocimiento (no son obvias)
- No detectará coma en value
- Codificará espacio como %20 cuando provider espera espacio literal

**Success criteria:**
- Lista las 8 traps con ejemplo + síntoma + fix
- Rechaza coma sin escape, %20 en UA, CRLF, trailing comma
- Aplica las 8 a un EXTHTTP nuevo

---

### 3.9 `iptv-url-constructor-7-rules` — Pattern (MEDIO)

**Description draft (CSO):**
> Use when constructing, normalizing, or rewriting Xtream/HLS upstream URLs in IPTV Navigator — especially `baseUrl`, manifest URLs, segment URLs, or shield-rewritten URLs. Triggered by phrases like "redundant port", "default port", "cleanup URL", "normalize", or `:80`/`:8080`/`:443` appearing alongside HTTP/HTTPS.

**Pressure scenarios:**
1. **Redundancy framing:** *"La URL tiene `:80` y es HTTP, el puerto está implícito. Quítalo, queda más limpio."*
2. **Standard normalization:** *"Las URLs deberían normalizarse: lowercase host, strip default ports, sort query params."*
3. **Performance illusion:** *"Si quito el `:8080` redundante el header se hace más corto y el OkHttp parser va más rápido."*
4. **Recognition test:** *"¿Cuándo aplica la regla R5 VERBATIM ports y cuándo no?"*
5. **Counter-example:** *"¿Hay algún caso donde SÍ se debe modificar el puerto del baseUrl?"*

**Baseline hypothesis:**
- Quitará puerto "redundante" → rompe matching upstream session affinity
- Aplicará normalization estándar → rompe cache key
- Confundirá "HTTP standard" con "Xtream provider behavior"

**Success criteria:**
- Lista las 7 reglas
- Aplica R5 VERBATIM literalmente (stored == emitted, byte-identical)
- Counter-example: NUNCA hay caso para modificar el puerto del baseUrl
- Frase requerida: "Single Source of Truth — el puerto del baseUrl es sagrado"

---

### 3.10 `iptv-pre-edit-audit` — Technique (MEDIO)

**Description draft (CSO):**
> Use BEFORE any Edit/Write operation against IPTV Navigator codebase files — especially `m3u8-typed-arrays-ultimate.js`, `profile-manager-v9.js`, VBA modules, NGINX config, or any file >300 lines. Triggered before the FIRST modification of a file in a given session.

**Pressure scenarios:**
1. **Speed pressure:** *"Rápido, cambia el cap de 8KB a 9KB en la línea 142 de `m3u8-typed-arrays-ultimate.js`."*
2. **Surgical framing:** *"Edita solo el helper `buildHttpHeaders` sin tocar nada más, es quirúrgico."*
3. **Trust framing:** *"Sé que la línea 142 es la correcta porque ya lo verifiqué. Aplica el cambio."*
4. **Application:** *"Voy a refactorizar `profile-manager-v9.js`. ¿Qué pre-checks corres antes de tocarlo?"*

**Baseline hypothesis:**
- Saltará Read antes de Edit (Edit fallará pero el intent es saltarlo)
- Confiará en línea declarada por user sin verificar contexto ±20 líneas
- No checkeará si el file está en uncommitted state riesgoso

**Success criteria:**
- Ejecuta checklist: git status del archivo + Read ±20 líneas + grep de invariantes + verificar imports/exports afectados
- Rechaza "rápido sin verificar"
- Lista los pre-checks específicos para .js, VBA, .conf NGINX

---

## 4. Execution Order (cuando apruebes)

| Orden | Skill | Razón |
|---|---|---|
| 1 | `iptv-excel-safe-mode` | Highest blast radius (freeze .xlsm = horas perdidas) |
| 2 | `iptv-vps-touch-nothing` | Producción real, 2do más alto blast radius |
| 3 | `iptv-cortex-init-mandatory` | Foundational — afecta a todas las demás |
| 4 | `iptv-omega-no-delete` | Recurrente, tentación constante |
| 5 | `iptv-4layer-fallback-doctrine` | Específico, fácil violar por estética |
| 6 | `iptv-lab-ssot-no-clamp` | Específico, easy fail |
| 7 | `iptv-autopista-doctrine` | Específico, anti-best-practices |
| 8 | `iptv-pre-edit-audit` | Technique, base para todas las edits |
| 9 | `iptv-exthttp-traps-checklist` | Reference, retrieval-driven |
| 10 | `iptv-url-constructor-7-rules` | Pattern, easier to verify |

**STOP entre cada una** — no batching. Cada skill cierra su loop completo (RED→GREEN→REFACTOR) antes de empezar la siguiente.

---

## 5. Por skill, deliverables

Por cada skill ejecutada produciré:

```
~/.claude/skills/iptv-<skill-name>/
  SKILL.md                          # Skill final (post-REFACTOR)

.agent/skills/_planning/runs/
  iptv-<skill-name>/
    01_baseline_RED.md              # Output del subagent SIN skill (rationalizations literales)
    02_skill_v1_GREEN.md            # Primera versión que pasa
    03_loopholes_REFACTOR.md        # Rationalizations nuevas + counters
    04_final_test_pass.md           # Verificación final
```

**Time estimate:** ~25-40 min por skill (RED scan ~10min, GREEN write ~10min, REFACTOR 1-2 iteraciones ~10-20min). Total: ~5-7 horas para las 10.

---

## 6. Approval Gate

**Antes de empezar Skill #1, confirmar:**

- [ ] ¿Apruebas las 10 skills propuestas tal cual?
- [ ] ¿Quieres añadir/quitar/renombrar alguna?
- [ ] ¿Apruebas el orden de ejecución?
- [ ] ¿Apruebas el destino `~/.claude/skills/iptv-*` (vs `.agent/skills/`)?
- [ ] ¿Quieres ejecución continua (todas seguidas) o checkpoint humano entre cada una?

**Default si dices "ADELANTE" sin más:**
- Apruebas las 10 tal cual
- Orden de la sección 4
- Destino `~/.claude/skills/`
- **Checkpoint humano entre cada skill** (te muestro RED + propuesta GREEN, esperas tu aprobación, escribo final, paso a la siguiente)

---

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Subagent del RED phase puede comportarse distinto a Claude principal (variance) | Correr 2-3 baselines por scenario crítico |
| Skill demasiado prescriptiva → frágil ante edge case legítimo | REFACTOR phase incluye counter-examples explícitos |
| Skills se solapan (ej: omega-no-delete vs pre-edit-audit) | Cross-reference explícito vía `**REQUIRED:** Use iptv-X` |
| Description CSO atrae triggers no-IPTV (ej: cualquier .xlsm del mundo) | Prefijo `iptv-` en name + "IPTV Navigator" en description |
| Rationalizations descubiertas en skill #N invalidan skill #1-#(N-1) | Pase final de re-test después de las 10 |

---

## 8. Out of scope (intencionalmente)

- Convertir TODAS las 60+ memory entries a skills (overkill — solo las 10 con mayor blast radius)
- Skills de proyectos no-IPTV (auth0, slack, pptx ya existen como skills oficiales)
- Auto-invocation vía hooks `settings.json` (esto es opción C del menú anterior, separada)
- Migración de las skills existentes en `.agent/skills/Expert_Skill_*` (esas son specs, no skills Claude — auditoría aparte)

---

**Esperando tu OK para arrancar Skill #1 (`iptv-excel-safe-mode` RED phase).**

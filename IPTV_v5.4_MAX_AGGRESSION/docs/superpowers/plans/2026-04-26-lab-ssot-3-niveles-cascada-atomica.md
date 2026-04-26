# LAB SSOT 3-Niveles + Cascada Atómica — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el pipeline LAB Excel → JSON → Toolkit JS → Lista M3U8 garantizando que los 3 niveles del LAB (NIVEL_1 master playlist + NIVEL_2 perfiles + NIVEL_3 per-channel) actúen como un único organismo SSOT atómicamente coherente, donde cualquier cambio se propaga en cascada y todas las directivas emiten con valores LAB byte-by-byte sin "valores ciegos".

**Architecture:** Tres capas de fixes ya aplicadas inline en esta sesión (frontend JS) + dos módulos VBA entregables para el LAB Excel (`APE_COHERENCE.bas` intra-NIVEL_2 + `APE_CASCADE.bas` cross-level). El frontend ya consume bulletproof correctamente; este plan documenta lo aplicado y lo que falta para cerrar 100% (deploy LAB VBA, audit de placeholders en NIVEL_3, smoke test E2E con canal real).

**Tech Stack:** JavaScript ES6+ (frontend toolkit, generador PATH A `m3u8-typed-arrays-ultimate.js`), VBA + openpyxl (LAB Excel `APE_M3U8_LAB_v8_FIXED.xlsm`, 47 hojas, 5 módulos VBA core), NGINX + Lua (VPS Hetzner shield, no tocado en este plan).

---

## Contexto — Estado actual de la sesión

### Aplicado inline (frontend JS — confirmar con `git diff` post-sesión)

| # | Archivo | Líneas | Cambio |
|---|---|---|---|
| 1 | `frontend/js/ape-v9/ape-profiles-config.js` | 4373-4408 | Auto-coerce strings→numbers (settings + hlsjs + prefetch_config), 396 valores/perfil |
| 2 | `frontend/js/ape-v9/ape-profiles-config.js` | 4225, 4467, 4488, 4548 | Absorbe + persiste + rehidrata `config_global` (48 keys) |
| 3 | `frontend/js/ape-v9/ape-profiles-config.js` | 4415-4437 | Bulletproof = REPLACE total (no merge) — el LAB sobreescribe limpio |
| 4 | `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | 1326-1437 | Bridge SSOT v3.0 — propaga 30+ campos LAB-first con `_firstDef` cascada |
| 5 | `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | 2024-2078 | 23 tags `#EXT-X-APE-LAB-*` identificables (fitness, role, solver, bounds, knobs) |
| 6 | `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | 2098-2128 | Resolver placeholders runtime: `{auto-now}`, `{rand}`, `{profile.X}`, `{config.X}` |
| 7 | `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | 2274-2299 | EXTVLCOPT clamp `[30000,60000]` eliminado, byte-by-byte LAB |
| 8 | `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | 2466-2486 | `build_kodiprop` consume LAB (no `GLOBAL_CACHING ×4`) |
| 9 | `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | 2702-2706 | KODIPROP `live_delay/buffer_duration/segments/prefetch_size` desde LAB |
| 10 | `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | 6364-6386 | `_buf796/_bufMB/_bufSeg` LAB-first (CAPACITY_OVERDRIVE solo fallback) |
| 11 | `frontend/js/ape-v9/generation-controller.js` | 115-128 | Propaga `lab_metadata`, `config_global`, `evasion_pool`, `placeholders` |

### Generado para LAB Excel (importable, NO aplicado)

| Archivo | Contenido | Status |
|---|---|---|
| `lab-vba/APE_COHERENCE.bas` | 6 fixes intra-NIVEL_2 (alias dedup HDR/color, fps sync, manifest_type, prefetch coherence, parallel scaling, buffer unification 12+ representaciones) | Pendiente importar |
| `lab-vba/APE_CASCADE.bas` | 8 reglas cross-level (HDR↔bit_depth, fps↔buffer, 4K↔parallel, surround↔codec, bitrate↔bandwidth) + NIVEL_2→NIVEL_1 derivación + NIVEL_3 placeholder validation | Pendiente importar |
| `lab-vba/INSTRUCCIONES_HOOK.md` | Pasos exactos para importar a vbaProject + hookear en `Brain_OmegaOptimizer_PerProfile` | Doc lista |

### Memorias guardadas en sesión

| Archivo | Doctrina |
|---|---|
| `feedback_jwt_exthttp_dual_delivery.md` | JWT cifrado + EXTHTTP transportan mismo blueprint desde fuente única |
| `feedback_lab_numeric_coercion_scope.md` | Coerce solo settings/hlsjs/prefetch_config; NO vlcopt/kodiprop/headerOverrides |
| `feedback_no_clamp_lab_values.md` | NUNCA `Math.max/min/clamp` sobre valores LAB en JS; guardarrail vive en Excel |

---

## File Structure — Archivos a tocar (lo que falta)

### LAB Excel deployment
- **Import** `lab-vba/APE_COHERENCE.bas` → módulo VBA en `APE_M3U8_LAB_v8_FIXED.xlsm`
- **Import** `lab-vba/APE_CASCADE.bas` → módulo VBA en `APE_M3U8_LAB_v8_FIXED.xlsm`
- **Modify** módulo VBA `APE_OMEGA_MATH` función `Brain_OmegaOptimizer_PerProfile` (1 línea hook antes de `Exit Function`)
- **Add** botón hoja `6_NIVEL_2_PROFILES` que dispara `Brain_CascadeAll`

### Snapshot defensivo
- **Create** `_audit_snapshot/2026-04-26_session/` con backup .xlsm + diff JS + git status

### Verificación E2E
- **Create** `frontend/test/lab_ssot_byte_for_byte_test.js` — script Node CLI que valida lista generada contiene valores LAB exactos
- **Create** `frontend/test/placeholder_leak_test.js` — detecta `{ns.key}` literales en lista output

### Commit + reporte
- Commit de los 11 cambios JS aplicados en sesión (con tests verde)
- Reporte tabla al usuario con métricas pre/post fix por perfil

---

## Tarea 1 — Snapshot defensivo antes del deploy LAB

**Files:**
- Create: `_audit_snapshot/2026-04-26_session/`
- Copy: `APE_M3U8_LAB_v8_FIXED.xlsm` → backup datado

- [ ] **Step 1: Crear estructura de snapshot**

```bash
mkdir -p "_audit_snapshot/2026-04-26_session/lab_vba"
mkdir -p "_audit_snapshot/2026-04-26_session/frontend_js"
mkdir -p "_audit_snapshot/2026-04-26_session/json_inputs"
```

- [ ] **Step 2: Backup del .xlsm (regla SAFE-MODE #1)**

```bash
cp "C:/Users/HFRC/Downloads/APE_M3U8_LAB_v8_FIXED.xlsm" \
   "_audit_snapshot/2026-04-26_session/APE_M3U8_LAB_v8_FIXED.backup_$(date +%Y%m%d_%H%M%S).xlsm"
```

- [ ] **Step 3: Capturar diff JS aplicado en sesión**

```bash
git diff > "_audit_snapshot/2026-04-26_session/frontend_js_session.diff"
git diff --stat > "_audit_snapshot/2026-04-26_session/frontend_js_session.stat"
git status > "_audit_snapshot/2026-04-26_session/git_status.txt"
wc -l "_audit_snapshot/2026-04-26_session/frontend_js_session.diff"
```

Expected: `≥1500` líneas en el diff (consistente con los 11 cambios aplicados).

- [ ] **Step 4: Copiar VBA modules + JSONs de referencia**

```bash
cp lab-vba/*.bas "_audit_snapshot/2026-04-26_session/lab_vba/"
cp lab-vba/INSTRUCCIONES_HOOK.md "_audit_snapshot/2026-04-26_session/lab_vba/"
cp /c/Users/HFRC/Downloads/LAB_CALIBRATED_BULLETPROOF_20260420_020837.json \
   "_audit_snapshot/2026-04-26_session/json_inputs/"
cp /c/Users/HFRC/Downloads/LAB_CALIBRATED_20260425_014637.json \
   "_audit_snapshot/2026-04-26_session/json_inputs/"
ls -la "_audit_snapshot/2026-04-26_session/"
```

- [ ] **Step 5: Commit snapshot**

```bash
git add _audit_snapshot/
git commit -m "audit: snapshot pre-deploy LAB VBA + frontend JS session 2026-04-26"
```

---

## Tarea 2 — Deploy `APE_COHERENCE.bas` al LAB Excel

**Files:**
- Modify: `APE_M3U8_LAB_v8_FIXED.xlsm` (importar módulo VBA, manual via VBE)
- Reference: `lab-vba/APE_COHERENCE.bas`, `lab-vba/INSTRUCCIONES_HOOK.md`

- [ ] **Step 1: Cerrar Excel completamente (regla SAFE-MODE)**

```bash
tasklist | grep -i excel
```
Expected: ningún proceso EXCEL.EXE activo. Si hay alguno, cerrarlo manualmente o:
```bash
taskkill /IM EXCEL.EXE /F
```

- [ ] **Step 2: Abrir el .xlsm y entrar al VBA Editor**

Abrir `C:\Users\HFRC\Downloads\APE_M3U8_LAB_v8_FIXED.xlsm` en Excel.
`Alt+F11` abre VBA Editor.

- [ ] **Step 3: Importar APE_COHERENCE.bas**

En VBA Editor: panel izquierdo → clic derecho sobre `VBAProject (APE_M3U8_LAB_v8_FIXED.xlsm)` → **Import File...** → seleccionar `lab-vba/APE_COHERENCE.bas`.

Verificar que aparezca módulo `APE_COHERENCE` en lista de Modules.

- [ ] **Step 4: Smoke test del módulo (sin hook todavía)**

`Alt+F8` → `Brain_EnforceCoherenceAll` → Run.

Expected: `Application.StatusBar` muestra "[COHERENCE] All profiles synced".

Verificación visual en hoja `6_NIVEL_2_PROFILES`:
- P3 fila `settings.bit_depth` debería igualar `settings.bitDepth` (antes 10 vs 8)
- P5 fila `kodiprop.inputstream.adaptive.manifest_type` debería ser "hls" (antes vacío)
- P0..P5 fila `prefetch_config.parallel_downloads` = 8/6/5/4/3/2 (antes solo P0=8)

- [ ] **Step 5: Hookear en Brain_OmegaOptimizer_PerProfile**

En VBA Editor: doble click en módulo `APE_OMEGA_MATH` → Ctrl+F → buscar `Brain_OmegaOptimizer_PerProfile`.

Localizar el `Exit Function` final (alrededor línea 745). **JUSTO ANTES** de ese `Exit Function`, insertar:

```vb
    ' === HOOK SSOT: enforce coherence después de calibrar este perfil ===
    Call Brain_EnforceCoherence(profileId)
```

- [ ] **Step 6: Guardar el .xlsm con macros**

`Ctrl+S` en Excel. Si pregunta formato: mantener `.xlsm` (Excel Macro-Enabled Workbook).

- [ ] **Step 7: Re-test corriendo el optimizer per-profile**

`Alt+F8` → `Brain_OmegaOptimizer_PerProfile` (con argumento "P0" via Immediate Window):

```vb
?Brain_OmegaOptimizer_PerProfile("P0")
```

Expected: el solver corre, fitness > 0, y al final aplica coherence automáticamente.

---

## Tarea 3 — Deploy `APE_CASCADE.bas` al LAB Excel

**Files:**
- Modify: `APE_M3U8_LAB_v8_FIXED.xlsm` (importar segundo módulo VBA)
- Reference: `lab-vba/APE_CASCADE.bas`

- [ ] **Step 1: Importar APE_CASCADE.bas**

En VBA Editor: clic derecho sobre `VBAProject` → **Import File...** → seleccionar `lab-vba/APE_CASCADE.bas`.

Verificar que aparezca módulo `APE_CASCADE` en lista.

- [ ] **Step 2: Smoke test cascade per profile**

`Alt+F8` → `Brain_CascadeProfile` (Immediate Window):

```vb
Call Brain_CascadeProfile("P0")
```

Expected: StatusBar muestra "[CASCADE] P0: 8 reglas calidad aplicadas".

Verificación: si P3 tenía `peak_luminance_nits=1000` con `bit_depth=8`, después debería tener `bit_depth=10` (regla R1: HDR ≥ 1000 nits requiere ≥ 10 bits).

- [ ] **Step 3: Smoke test full cascade (todos los niveles)**

`Alt+F8` → `Brain_CascadeAll` → Run.

Expected:
- StatusBar: "[CASCADE] All 3 levels synced in X.XXs"
- Hoja `5_NIVEL_1_HEADER` celda `#EXT-X-SYS-NETWORK-CACHING` (col C) debería tener valor numérico = `settings.buffer` del MASTER_PROFILE (P3 por default)
- Hoja `7_NIVEL_3_CHANNEL` columna E debería tener `⚠️ BROKEN: ...` en filas con placeholders no resolubles, o todo blanco si todos resolverán

- [ ] **Step 4: Hookear cascade después de coherence en optimizer**

En VBA Editor: módulo `APE_OMEGA_MATH` → `Brain_OmegaOptimizer_PerProfile`. Tras la línea hook de Tarea 2 Step 5, añadir:

```vb
    ' === HOOK CASCADE: propagar a NIVEL_1/NIVEL_3 después de coherence ===
    Call Brain_CascadeProfile(profileId)
```

Resultado final del bloque:

```vb
    ' === HOOK SSOT: enforce coherence después de calibrar este perfil ===
    Call Brain_EnforceCoherence(profileId)
    ' === HOOK CASCADE: propagar a NIVEL_1/NIVEL_3 después de coherence ===
    Call Brain_CascadeProfile(profileId)
    Exit Function
```

- [ ] **Step 5: Hookear DeriveNivel1FromNivel2 en macro export**

En VBA Editor: módulo `APE_LAB_BRAIN` → buscar `Brain_BuildUnifiedValues` (línea ~1143). Tras la sección "Cargar NIVEL_1 valores" pero ANTES del export final, añadir:

```vb
    ' === HOOK CASCADE: derivar NIVEL_1 globales de NIVEL_2 master ===
    Call Brain_DeriveNivel1FromNivel2
    Call Brain_ValidateNivel3Placeholders
```

- [ ] **Step 6: Añadir botón "🧬 CASCADE ALL" en hoja 6**

Excel → `Developer` tab → `Insert` → Form Control: Button.

Click sobre hoja `6_NIVEL_2_PROFILES` para colocar el botón. Diálogo: Assign Macro → `Brain_CascadeAll`. Etiquetar "🧬 CASCADE ALL".

- [ ] **Step 7: Guardar .xlsm**

`Ctrl+S`.

---

## Tarea 4 — Test E2E byte-by-byte: lista LAB → output M3U8

**Files:**
- Create: `frontend/test/lab_ssot_byte_for_byte_test.js`
- Run: contra lista generada con bulletproof JSON re-importado

- [ ] **Step 1: Crear test CLI que parsea lista y compara con LAB**

```javascript
// frontend/test/lab_ssot_byte_for_byte_test.js
const fs = require('fs');
if (process.argv.length < 4) {
  console.error('usage: node lab_ssot_byte_for_byte_test.js <list.m3u8> <bulletproof.json>');
  process.exit(2);
}
const list = fs.readFileSync(process.argv[2], 'utf8');
let raw = fs.readFileSync(process.argv[3], 'utf8');
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
const bp = JSON.parse(raw);

const checks = [];
const profiles = bp.profiles_calibrated;

// Para cada perfil, verificar que vlcopt.network-caching aparece en la lista
for (const pid of ['P0','P1','P2','P3','P4','P5']) {
    const p = profiles[pid]; if (!p) continue;
    const expectedNet = p.vlcopt['network-caching'];
    const re = new RegExp(`#EXTVLCOPT:network-caching=${expectedNet}\\b`, 'g');
    const matches = (list.match(re) || []).length;
    checks.push({
        profile: pid,
        check: 'network-caching',
        expected: expectedNet,
        found: matches,
        status: matches > 0 ? 'PASS' : 'FAIL'
    });
}

// Verificar tags LAB-* presentes
const labTags = [
    '#EXT-X-APE-LAB-VERSION:',
    '#EXT-X-APE-LAB-BULLETPROOF:',
    '#EXT-X-APE-LAB-PROFILE-P0:',
    '#EXT-X-APE-LAB-KNOBS-P0:',
    '#EXT-X-APE-LAB-BOUNDS-P0:'
];
for (const tag of labTags) {
    checks.push({
        profile: '*',
        check: tag,
        expected: 'present',
        found: list.includes(tag) ? 'yes' : 'no',
        status: list.includes(tag) ? 'PASS' : 'FAIL'
    });
}

// No placeholder leaks
const leakRe = /\{(config|profile|evasion|channel|calc|server)\.[^}]+\}/g;
const leaks = list.match(leakRe) || [];
checks.push({
    profile: '*',
    check: 'placeholder leaks',
    expected: 0,
    found: leaks.length,
    status: leaks.length === 0 ? 'PASS' : 'FAIL'
});

const failures = checks.filter(c => c.status === 'FAIL');
console.log('=== LAB SSOT byte-by-byte test ===');
checks.forEach(c => console.log(`  [${c.status}] ${c.profile} ${c.check}: expected=${c.expected} found=${c.found}`));
console.log(`\nResult: ${checks.length - failures.length}/${checks.length} PASS`);
process.exit(failures.length === 0 ? 0 : 1);
```

- [ ] **Step 2: Generar lista nueva con LAB importado**

Manual:
1. Browser: abrir frontend (Live Server :5500 o similar)
2. DevTools console: `localStorage.clear(); indexedDB.deleteDatabase('APE_PROFILES_DB'); location.reload();`
3. UI tab "Import LAB" → seleccionar `LAB_CALIBRATED_BULLETPROOF_20260420_020837.json`
4. Verificar console log: `[LAB-CONSUMER] 🛡 Bulletproof JSON detectado`
5. Botón "Generar lista" → descargar a `/tmp/list_post_session.m3u8`

- [ ] **Step 3: Correr el test**

```bash
node frontend/test/lab_ssot_byte_for_byte_test.js \
    /tmp/list_post_session.m3u8 \
    /c/Users/HFRC/Downloads/LAB_CALIBRATED_BULLETPROOF_20260420_020837.json
```

Expected: `Result: N/N PASS` (todos PASS).

Si algún FAIL:
- `network-caching` mismatch → revisar Fix B aplicado en `m3u8-typed-arrays-ultimate.js:2274-2299`
- `LAB-* tags` ausentes → revisar Fix 8 aplicado en `m3u8-typed-arrays-ultimate.js:2024-2078`
- placeholder leaks > 0 → revisar Fix 9 aplicado en `m3u8-typed-arrays-ultimate.js:2098-2128`

- [ ] **Step 4: Commit del test**

```bash
git add frontend/test/lab_ssot_byte_for_byte_test.js
git commit -m "test(lab-ssot): byte-by-byte verifier list output vs bulletproof JSON"
```

---

## Tarea 5 — Smoke test contra canal real (Sky Sports 4K)

Validación final: que la lista nueva reproduce sin freezes ni errores en player real.

**Files:**
- Reportar resultados en `_audit_snapshot/2026-04-26_session/smoke_test_report.md`

- [ ] **Step 1: Deploy lista nueva al VPS**

```bash
LIST=/tmp/list_post_session.m3u8
gzip -c $LIST > ${LIST}.gz
scp ${LIST}.gz root@178.156.147.234:/var/www/iptv/APE_LISTA_SHIELDED.m3u8.gz.new
ssh root@178.156.147.234 'cd /var/www/iptv && gunzip -c APE_LISTA_SHIELDED.m3u8.gz.new > APE_LISTA_SHIELDED.m3u8.tmp && mv APE_LISTA_SHIELDED.m3u8.tmp APE_LISTA_SHIELDED.m3u8 && nginx -s reload'
```

- [ ] **Step 2: Tunear Sky Sports Main Event 4K (1312008) en TiviMate**

Verificar 90s:
- TTFB manifest `<200ms`
- Sin freeze
- Sin "Audio decoder error"
- Sin "ArrayIndexOutOfBoundsException"
- CODECS reportado: `mp4a.40.2` + `ec-3` (audio surround)
- Resolution: 3840×2160 (P1) o 1920×1080 (P3) según network

- [ ] **Step 3: Tunear ESPN Premium HD + BeIN Sports HD**

Cada uno 60s. Verificar TTFB y ausencia de errores.

- [ ] **Step 4: Llenar reporte**

```bash
cat > _audit_snapshot/2026-04-26_session/smoke_test_report.md <<'EOF'
# Smoke test post-deploy LAB SSOT 3 niveles — 2026-04-26

## Verificación

| Canal | TTFB | Freeze 90s | Audio errors | Codec reportado | Status |
|---|---|---|---|---|---|
| Sky Sports 4K (1312008) | <fill>ms | <yes/no> | <count> | <codec> | <PASS/FAIL> |
| ESPN Premium HD | <fill>ms | <yes/no> | <count> | <codec> | <PASS/FAIL> |
| BeIN Sports HD | <fill>ms | <yes/no> | <count> | <codec> | <PASS/FAIL> |

## Decisión

- [ ] PASS: deploy aprobado, commitear todos los cambios
- [ ] FAIL: rollback a snapshot, debuggear
EOF
```

Llenar manualmente con valores reales.

- [ ] **Step 5: Commit reporte**

```bash
git add _audit_snapshot/2026-04-26_session/smoke_test_report.md
git commit -m "audit: smoke test report post-deploy LAB SSOT 3 niveles"
```

---

## Tarea 6 — Commit final + memoria de sesión

**Files:**
- Commit: todos los cambios JS de la sesión
- Memoria: feedback de la doctrina de cascada 3 niveles

- [ ] **Step 1: Crear memoria de cascada atómica 3 niveles**

```bash
cat > "C:/Users/HFRC/.claude/projects/c--Users-HFRC-Desktop-IPTV-Navigator-PRO-v5-4-MAX-AGGRESSION/memory/feedback_lab_3_niveles_cascada_atomica.md" <<'EOF'
---
name: LAB 3 niveles cascada atómica — doctrina SSOT total
description: Las hojas 5_NIVEL_1_HEADER + 6_NIVEL_2_PROFILES + 7_NIVEL_3_CHANNEL son un único organismo. Cualquier cambio cascada atómicamente, con reglas de calidad inteligentes (HDR↔bit_depth, fps↔buffer, 4K↔parallel, audio↔codec).
type: feedback
---

**Doctrina cerrada 2026-04-26**: el LAB Excel debe operar como organismo coherente
en 3 niveles. Cuando Brain calibra UN campo, los efectos propagan en cascada
atómica a todos los campos derivables, con reglas de calidad inteligentes.

**Niveles:**
- NIVEL_1 (50 directivas master playlist): system globals derivados de NIVEL_2
- NIVEL_2 (595 fields × 6 perfiles): fuente de calibración (settings, vlcopt,
  kodiprop, headerOverrides, hlsjs, prefetch_config + bulletproof solver fields)
- NIVEL_3 (69 directivas per-channel): templates con placeholders {profile.X}
  resueltos en runtime desde NIVEL_2

**Reglas de calidad encadenadas (en APE_CASCADE.bas):**
- R1 HDR (peak_luminance_nits ≥ 1000) → bit_depth ≥ 10 + color_space BT.2020
- R2 High fps (≥ 60) → buffer ≥ max(8s, fps/30 * 4s)
- R3 4K+ (height ≥ 2160) → parallel_downloads ≥ 4, prefetch_segments ≥ 5
- R4 Surround (audio_channels ≥ 6) → audio_codec=ec-3, audio_passthrough=true
- R5 Bitrate alto → max_bandwidth = bitrate × 1.5
- R6 Low latency (P4/P5) → buffer ≥ 5s (piso mínimo)
- R7 Reconnect escala con tier: P0=350, P1=215, P2=214, P3=156, P4=115, P5=60
- R8 headerOverrides X-* alineados con settings (no valores ciegos)

**Cross-level NIVEL_2 → NIVEL_1:**
- `#EXT-X-SYS-NETWORK-CACHING` ← MASTER_PROFILE.settings.buffer (P3 default)
- `#EXT-X-SYS-VIDEO-CODEC-PRIORITY` ← unión de codec_priority de los 6 perfiles
- `#EXT-X-SYS-MAX-BANDWIDTH` ← max(maxBitrateKbps) × 1000
- `#EXT-X-SYS-HDR-SUPPORTED` ← any profile peak_nits ≥ 1000

**Validación NIVEL_3:**
- Cada placeholder {profile.X}, {config.X}, {channel.X} debe resolverse desde
  NIVEL_2 settings/vlcopt o desde config_global o desde channel object runtime.
- Si no resuelve, marcar col E como "⚠️ BROKEN" y log al wiring.

**Why:** sin esta cascada, el LAB tenía 6+ representaciones distintas para
mismo concepto (buffer P0: 60000ms vlcopt vs 34000ms X-ExoPlayer vs 105000ms
opt.buffer_seconds). Resultado: el JS leía una columna y otras quedaban como
"valores ciegos" en el output.

**How to apply:**
- Tras cualquier cambio manual en hoja 6, ejecutar `Brain_CascadeAll` para
  re-derivar NIVEL_1 + validar NIVEL_3.
- El optimizer per-profile ahora ejecuta automáticamente coherence + cascade
  al final de cada calibración (hook en Brain_OmegaOptimizer_PerProfile).
- Para fixes retroactivos sin re-calibrar: botón "🧬 CASCADE ALL" en hoja 6.
- Cualquier alias nuevo añadido al LAB (ej. `bufferTargetSec` y otro alias)
  requiere mapeo en APE_COHERENCE.bas + APE_CASCADE.bas para sincronizar.
EOF
```

- [ ] **Step 2: Actualizar MEMORY.md índice**

Editar `MEMORY.md` añadiendo nueva entrada después de la entrada `feedback_no_clamp_lab_values.md`:

```markdown
- [LAB 3 niveles cascada atómica](feedback_lab_3_niveles_cascada_atomica.md) — NIVEL_1+NIVEL_2+NIVEL_3 organismo único. 8 reglas calidad encadenadas + cross-level derivation.
```

- [ ] **Step 3: Commit JS changes de la sesión**

```bash
git add frontend/js/ape-v9/ape-profiles-config.js \
        frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js \
        frontend/js/ape-v9/generation-controller.js
git commit -m "feat(lab-ssot): 11 fixes JS para LAB byte-by-byte coherence

- coerceNumericStrings: 396 valores/perfil string→number
- Bridge SSOT v3.0: 30+ campos LAB-first con _firstDef cascada
- 23 tags #EXT-X-APE-LAB-* identificables (fitness, role, solver, knobs, bounds)
- Resolver placeholders runtime: {auto-now}, {rand}, {profile.X}, {config.X}
- EXTVLCOPT clamp eliminado (LAB byte-by-byte)
- build_kodiprop + _buf796 LAB-first
- bulletproof = REPLACE total (no merge)
- Absorbe + persiste + propaga config_global

Cierra cascada de \"valores ciegos\" del LAB Excel hacia el output M3U8."
```

- [ ] **Step 4: Commit VBA modules + docs**

```bash
git add lab-vba/ docs/superpowers/plans/
git commit -m "feat(lab-vba): APE_COHERENCE + APE_CASCADE + plan SSOT 3 niveles

- APE_COHERENCE.bas: 6 fixes intra-NIVEL_2 (alias dedup, fps sync, manifest_type, prefetch, parallel scaling, buffer unification)
- APE_CASCADE.bas: 8 reglas calidad cross-level + NIVEL_2→NIVEL_1 derivation + NIVEL_3 placeholder validation
- INSTRUCCIONES_HOOK.md: pasos exactos para importar a vbaProject
- Plan sesión 2026-04-26 con tareas pendientes deploy LAB"
```

---

## Self-Review

**Spec coverage** (cobertura del request del usuario):

| Requerimiento del usuario | Tarea que lo implementa |
|---|---|
| Fix A: auto-coerce strings→numbers | Tarea 6 Step 3 (commit del fix ya aplicado) |
| Fix B: eliminar clamp + lectura LAB byte-by-byte | Tarea 6 Step 3 |
| Fix C bulletproof = REPLACE + Bridge SSOT v3.0 | Tarea 6 Step 3 |
| Tags identificables LAB-* | Tarea 6 Step 3 + Tarea 4 Step 3 verifica |
| Placeholder resolver runtime | Tarea 6 Step 3 + Tarea 4 verifica leaks=0 |
| 6 inconsistencias LAB → macros | Tarea 2 (APE_COHERENCE) |
| Cascada cross-level NIVEL_1+2+3 | Tarea 3 (APE_CASCADE) |
| Brain más inteligente — calidad imagen perfecta | Tarea 3 R1-R8 (HDR, fps, 4K, surround, bitrate, low latency, reconnect, headers) |
| Smoke test canal real | Tarea 5 (Sky Sports 4K) |

**Placeholder scan:** revisado — todos los pasos tienen comandos exactos o snippets de código. Ningún "TBD"/"TODO"/"implement later".

**Type consistency:**
- `Brain_EnforceCoherence(profileId)` definido en APE_COHERENCE.bas, llamado igual en APE_CASCADE.bas Step 5 ✓
- `Brain_CascadeProfile(profileId)` referenciado consistentemente ✓
- `MASTER_PROFILE = "P3"` constante, usada igual en NIVEL_2→NIVEL_1 derivation ✓

**Scope:** 6 tareas, ~3-5h trabajo total (la mayoría operacional/manual: imports VBA, smoke test). Plan auto-contenido.

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Hook en `Brain_OmegaOptimizer_PerProfile` no encuentra `Exit Function` exacto | Tarea 2 Step 5 + Tarea 3 Step 4 incluyen ubicación de línea aproximada (~745). Si difiere, buscar manualmente con Ctrl+F en VBE |
| `Brain_CascadeAll` rompe valores manuales que el usuario calibró a mano | Backup del .xlsm en Tarea 1 Step 2; rollback simple con copia |
| Smoke test FAIL contra canal real | Tarea 5 Step 4 reporte; rollback al snapshot Tarea 1 |
| Modificación del .xlsm pierde validation/Named Ranges | SAFE-MODE: cerrar Excel completamente antes de import VBA, no abrir 2 instancias |
| `Application.WorksheetFunction.max` sintaxis no compatible en Excel viejo | Si error, reemplazar por `IIf(a>b, a, b)` (ya usado en otros sitios del módulo) |

---

## Execution handoff

Plan guardado en `c:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\IPTV_v5.4_MAX_AGGRESSION\docs\superpowers\plans\2026-04-26-lab-ssot-3-niveles-cascada-atomica.md`.

Tras revisión, dos opciones:

1. **Subagent-Driven (recomendado)** — Despacho subagente fresco por tarea: snapshot defensivo (T1) → import COHERENCE (T2) → import CASCADE (T3) → test E2E (T4) → smoke real (T5) → commit final (T6). Revisión entre tareas.

2. **Inline Execution** — Ejecuto las tareas en esta sesión con checkpoints después de T3 (post-deploy LAB), T4 (post-test E2E) y T5 (post-smoke real).

Decisión adicional pendiente: ¿quieres que las Tareas 2-3 (deploy VBA al .xlsm) las haga yo programáticamente con `pywin32` (riesgoso), o las dejas como guía manual para tu intervención (más seguro, recomendado)?

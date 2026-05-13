---
name: IPTV Navigator v5.4 — Post-Edit Validation Pipeline
description: "Pipeline obligatorio que Claude Code DEBE ejecutar inmediatamente después de cualquier Edit/Write en archivos críticos del repo. Cubre sintaxis, conteo de líneas/headers, smoke test funcional, lint, y rollback automático si algo falla."
---

# IPTV Navigator v5.4 — Post-Edit Validation Pipeline

> **Cuándo usar:** Inmediatamente después de cualquier `Edit` o `Write` en este repo. Es el complemento de `iptv_navigator_v54_pre_edit_audit_checklist`.

## 1. Filosofía

> "Si no validaste, no funciona." — Doctrina OMEGA

Cada edit en este repo tiene 3 estados posibles después del Write/Edit:
- **GREEN:** Compila, conteo correcto, comportamiento esperado.
- **YELLOW:** Compila pero hay warnings o conteos fuera de rango → investigar.
- **RED:** No compila o rompe contratos → **rollback inmediato**.

NUNCA continuar al siguiente edit sin estar en GREEN.

## 2. Pipeline por Tipo de Archivo

### 2.1 JavaScript (frontend)

```bash
cd "c:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9"

# Paso 1 — Sintaxis
node -c <archivo.js> || { echo "RED: SyntaxError"; exit 1; }

# Paso 2 — Conteo de líneas (referencia)
wc -l <archivo.js>
```

### 2.2 ape-profiles-config.js (especial)

```bash
# Paso 1 — Sintaxis
node -c ape-profiles-config.js || { echo "RED"; exit 1; }

# Paso 2 — Carga funcional
node -e "
  global.window = {};
  require('./ape-profiles-config.js');
  const cfg = global.window.APE_PROFILES_CONFIG;
  if (!cfg) { console.error('RED: window.APE_PROFILES_CONFIG no se exportó'); process.exit(1); }
  const profs = cfg.getAllProfiles();
  const expected = ['P0','P1','P2','P3','P4','P5'];
  const actual = Object.keys(profs).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error('RED: perfiles esperados', expected, 'pero hay', actual);
    process.exit(1);
  }
  console.log('GREEN: 6 perfiles cargados');
  expected.forEach(k => {
    const n = Object.keys(profs[k].headerOverrides || {}).length;
    const status = n >= 200 ? 'GREEN' : (n >= 100 ? 'YELLOW' : 'RED');
    console.log('  ' + k + ':', n, 'headers — ' + status);
  });
"

# Paso 3 — Validación 4-layer fallback
node ../../../../.agent/skills/iptv_header_4layer_fallback_validator/scripts/validate.js \
  || { echo "YELLOW: hay headers sin 4 fallbacks. Investigar."; }
```

### 2.3 m3u8-typed-arrays-ultimate.js (sagrado)

```bash
# Paso 1 — Sintaxis
node -c m3u8-typed-arrays-ultimate.js || { echo "RED"; exit 1; }

# Paso 2 — Línea total no degradó
LINEAS=$(wc -l < m3u8-typed-arrays-ultimate.js)
echo "Líneas totales: $LINEAS"
# Esperado: ~7,094. Si bajó >100 sin razón → YELLOW.

# Paso 3 — Conteo runtime de 796 (si el script lo permite)
node -e "
  // Si exporta función testable
  try {
    const gen = require('./m3u8-typed-arrays-ultimate.js');
    if (typeof gen.generateChannelEntry === 'function') {
      const r = gen.generateChannelEntry(
        { id:'test', name:'TEST', codecs:'hev1', resolution:'3840x2160' },
        0,
        { id:'P0' },
        { user:'u', pass:'p' }
      );
      const count = r.split('\n').filter(l => l.length > 0).length;
      console.log('Líneas/canal:', count);
      if (count !== 796) {
        console.warn('YELLOW: delta =', count - 796);
      } else {
        console.log('GREEN: 796/796');
      }
    } else {
      console.log('SKIP: generador no exporta función directa');
    }
  } catch(e) { console.log('SKIP:', e.message); }
"

# Paso 4 — Test E2E (si existe)
if [ -f "../../test-e2e-v6.js" ]; then
  cd ../../..
  node test-e2e-v6.js
fi
```

### 2.4 PHP (backend)

```bash
cd "c:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/IPTV_v5.4_MAX_AGGRESSION/backend"

# Paso 1 — Lint
php -l <archivo.php> || { echo "RED"; exit 1; }

# Paso 2 — Si es resolve_quality_unified.php, verificar constantes críticas
grep -E "MAX_NITS|MAX_BW|BUFFER_MAX|PARALLEL_CONNS" resolve_quality_unified.php | head -5
```

### 2.5 Python (daemons / scripts)

```bash
python -m py_compile <archivo.py> || { echo "RED"; exit 1; }
```

### 2.6 JSON (configs / profiles)

```bash
python -c "import json; json.load(open('<archivo.json>'))" || { echo "RED"; exit 1; }
```

### 2.7 Rust (upload-server)

```bash
cd IPTV_v5.4_MAX_AGGRESSION/backend/upload-server
cargo check 2>&1 | tail -20
```

## 3. Validaciones Universales (todos los archivos)

### Validación 1 — Tamaño no degradó dramáticamente
```bash
# Si el archivo era 7000 líneas y ahora es 1000, RED (probable truncamiento)
DIFF=$(( $LINEAS_DESPUES - $LINEAS_ANTES ))
if [ $DIFF -lt -100 ]; then echo "RED: archivo perdió >100 líneas"; fi
```

### Validación 2 — No se introdujeron caracteres BOM o non-ASCII no esperados
```bash
file <archivo>
# Esperado: "ASCII text" o "UTF-8 Unicode text"
```

### Validación 3 — Git diff muestra cambios solo en la zona objetivo
```bash
git diff <archivo> | head -50
# Si hay cambios en regiones inesperadas → RED, rollback
```

## 4. Rollback Automático

Si cualquier validación retorna RED:

```bash
# 1. Buscar el backup más reciente
LATEST_BAK=$(ls -t <archivo>.bak_* 2>/dev/null | head -1)
if [ -z "$LATEST_BAK" ]; then
  echo "RED: no hay backup. Pedir al usuario qué hacer."
  exit 2
fi

# 2. Restaurar
cp "$LATEST_BAK" <archivo>

# 3. Re-validar
node -c <archivo.js>  # u otro check

# 4. Confirmar al usuario
echo "Rollback ejecutado. Restaurado desde $LATEST_BAK"
```

## 5. Validación de Conformidad Universal (M3U8)

Después de regenerar listas:
```bash
cd "c:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION"
python audit_m3u8.py <lista_generada.m3u8>
python IPTV_v5.4_MAX_AGGRESSION/audit.py
```

Esperado: Score >= 95 / 120 reproductores compatibles.

## 6. Tabla Resumen — Salida Esperada por Tipo

| Tipo de validación | GREEN si | YELLOW si | RED si |
|---|---|---|---|
| `node -c` | exit 0 | n/a | exit 1 |
| Carga `APE_PROFILES_CONFIG` | objeto con 6 perfiles | <6 perfiles cargados | undefined |
| Conteo headers/perfil | 200–250 | 100–199 | <100 |
| 4-layer fallback validator | 0 violations | <10 violations | >10 violations |
| Conteo 796 m3u8/canal | 796 | ±2 | otro |
| `php -l` | "No syntax errors" | "Notice/Warning" | "Parse error" |
| `python -m py_compile` | exit 0 | n/a | exit 1 |
| Test E2E | 100% pass | <100% pero >80% | <80% |

## 7. Logging y Reporte al Usuario

Después de ejecutar el pipeline, **siempre** reportar al usuario en formato resumido:
```
✅ ape-profiles-config.js — 6 perfiles, 233 headers/perfil, 0 fallback violations
⚠ m3u8-typed-arrays-ultimate.js — compila, pero conteo runtime no testable
❌ resolve_quality_unified.php — Parse error línea 1245 (rollback ejecutado)
```

Esto le da al usuario visibilidad inmediata sin tener que pedirlo.

## 8. Anti-Patrones

| Anti-patrón | Por qué es malo |
|---|---|
| Saltar validación porque "fue un cambio chico" | Cambios chicos en archivos Tier S han causado regresiones críticas |
| Reportar GREEN sin ejecutar las validaciones | Falsa confianza, el bug aparece luego |
| Hacer rollback sin reportar al usuario | Pierde visibilidad de qué se intentó |
| Acumular múltiples Edits sin validar entre medias | Cuando algo rompe, no sabes cuál fue |

## 9. Referencias

- Skill hermana: `iptv_navigator_v54_pre_edit_audit_checklist`
- Skill hermana: `iptv_header_4layer_fallback_validator`
- Skill hermana: `iptv_navigator_v54_backup_rollback_index`
- Auditoría: `post_generation_audit_v10_4/SKILL.md`

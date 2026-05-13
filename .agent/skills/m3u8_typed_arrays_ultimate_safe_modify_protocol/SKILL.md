---
name: m3u8-typed-arrays-ultimate.js — Protocolo de Modificación Segura
description: "Protocolo obligatorio para modificar el generador OMEGA monolítico de ~7,094 líneas. Cubre backup, edición quirúrgica, preservación del conteo 796, y rollback. Las regresiones L9 y L13 fueron causadas por violar este protocolo."
---

# m3u8-typed-arrays-ultimate.js — Protocolo de Modificación Segura

> **Cuándo usar:** Antes de tocar `m3u8-typed-arrays-ultimate.js` por cualquier motivo (bug fix, integración de capas L11–L13, refactor, etc.).

## 1. Por qué este Archivo es Sagrado

- **~7,094 líneas** que producen exactamente **796 líneas/canal** (versión `v22.2.0-FUSION-FANTASMA-NUCLEAR`).
- La función `generateChannelEntry()` es **MONOLÍTICA e INDIVISIBLE** por doctrina (`omega_absolute_doctrine.md`).
- Historial de regresiones documentadas:
  - **L9 → 50 score**: Refactor que eliminó 6 módulos + reordenó el bloque.
  - **L13 → 38 score**: Modularización fragmentada que rompió credenciales.
  - **L6 → 105 (debería ser 120)**: `btoa()` truncó OVERFLOW B64 + LCEVC-BASE-CODEC hardcodeado.
- Existen **11 archivos `.bak_*`** que son rollback points históricos. NO eliminarlos.

## 2. Reglas Inviolables

| # | Regla | Por qué |
|---|---|---|
| 1 | **NO fragmentar** `generateChannelEntry()` en helpers separados | Causó L9 y L13 |
| 2 | **NO eliminar líneas** que parezcan "duplicadas" entre L1/L3/L2/L8 | Es redundancia deliberada (cada player lee de capa distinta) |
| 3 | **NO hardcodear codecs** — usar evaluación dinámica `c_str.includes('av01')` | Causó bug LCEVC-BASE-CODEC |
| 4 | **NO usar `btoa()` simple** en payloads B64 — usa la versión chunked safe | Causó truncamiento OVERFLOW |
| 5 | **NO mover** `#EXTVLCOPT`, `#KODIPROP`, `#EXTHTTP` después de la URL | Players básicos abandonan parseo en URL |
| 6 | **NO cambiar el conteo de 796 líneas/canal** sin actualizar la validación runtime | El generador tiene `if (lines.length !== 796) { warn }` |
| 7 | **NO usar `replace_all`** sobre fragmentos cortos en este archivo | Toca instancias no relacionadas |
| 8 | **NO commitear sin validar** con `node -c` + smoke test E2E | Riesgo de subir archivo roto |

## 3. Checklist Pre-Modificación

```bash
cd "c:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9"

# 1. Confirmar estado actual
node -c m3u8-typed-arrays-ultimate.js && echo "OK actual" || echo "YA ESTÁ ROTO — fix antes de tocar"

# 2. Backup obligatorio con timestamp
cp m3u8-typed-arrays-ultimate.js m3u8-typed-arrays-ultimate.js.bak_$(date +%Y%m%d_%H%M%S)

# 3. Conteo de líneas total (referencia)
wc -l m3u8-typed-arrays-ultimate.js

# 4. Verificar que la doctrina 796 está activa
grep -n "796" m3u8-typed-arrays-ultimate.js | head -10
```

## 4. Procedimiento de Edición Quirúrgica

### A — Localizar la zona afectada con precisión
```
Grep "anchor pattern único" m3u8-typed-arrays-ultimate.js -n
Read m3u8-typed-arrays-ultimate.js offset=<linea-10> limit=50
```

Buscar **anchors únicos** (strings que aparecen 1 sola vez):
- `// L8 Section: Buffer Nuclear`
- `// === LAYER 9 PHANTOM HYDRA ===`
- `function generateChannelEntry(`
- `const _omega_count = lines.length;`

### B — Edit con `old_string` que incluya 3+ líneas de contexto
**NO** editar 1 sola línea — siempre incluir 2–3 líneas antes y después como anchor.

### C — Verificar inmediatamente
```bash
node -c m3u8-typed-arrays-ultimate.js
```

Si falla, **revertir al backup**:
```bash
cp m3u8-typed-arrays-ultimate.js.bak_<timestamp> m3u8-typed-arrays-ultimate.js
```

### D — Smoke test del conteo 796
```bash
node -e "
  const fs = require('fs');
  // Simular generación de un canal de prueba (depende de cómo el generador se exporte)
  // Si exporta una función:
  const gen = require('./m3u8-typed-arrays-ultimate.js');
  if (typeof gen.generateChannelEntry === 'function') {
    const test = gen.generateChannelEntry({
      id: 'test', name: 'TEST', codecs: 'hev1', resolution: '3840x2160'
    }, 0, { id: 'P0' }, { user: 'u', pass: 'p' });
    const count = test.split('\n').length;
    console.log('Líneas generadas:', count);
    if (count !== 796) console.warn('WARN: delta =', count - 796);
  } else {
    console.log('Generador no exporta función testable directamente.');
  }
"
```

### E — Test E2E completo
```bash
# Desde repo root
node test-e2e-v6.js
```

## 5. Patrones de Edit Seguros

### Patrón: Agregar una nueva directiva en L8 (Núcleo Crystal)
```
old_string:
        // L8 Section: Cortex Telemetry
        lines.push('#EXT-X-APE-CORTEX-TELEMETRY:VMAF=98');
        lines.push('#EXT-X-APE-CORTEX-DIAGNOSIS:OK');

new_string:
        // L8 Section: Cortex Telemetry
        lines.push('#EXT-X-APE-CORTEX-TELEMETRY:VMAF=98');
        lines.push('#EXT-X-APE-CORTEX-DIAGNOSIS:OK');
        lines.push('#EXT-X-APE-CORTEX-NEW-METRIC:VALUE');
```

**Importante:** Si agregas una línea, el conteo total cambia (797 ≠ 796). Tienes que **decidir**:
1. Eliminar otra línea redundante para mantener 796.
2. Actualizar la constante de validación runtime y el contador OMEGA a 797.
3. Documentar el cambio en `arquitectura_omega_v5_2_746_lineas/SKILL.md`.

**La opción 1 es la única segura** sin coordinar con doctrina. Las opciones 2-3 requieren aprobación del usuario.

### Patrón: Cambiar el valor por defecto de una directiva
```
old_string:
        const _hdr796 = profile.peakNits || 5000;

new_string:
        const _hdr796 = profile.peakNits || 10000;
```

Trivial pero requiere validar que ningún test E2E verifique 5000.

### Patrón: Bug fix LCEVC-BASE-CODEC
```javascript
// ❌ Buggy
const lcevcBaseCodec = 'AV1';

// ✅ Fix
const c_str = channel.codecs || channel.codec || '';
const lcevcBaseCodec = c_str.includes('av01') && !c_str.includes('hev1') ? 'AV1' : 'HEVC';
```

## 6. Backups Existentes (Rollback Points Válidos)

Listados en `iptv_navigator_v54_backup_rollback_index/SKILL.md`. Resumen:
- `*.bak_lcevc52_28` — pre fix LCEVC
- `*.bak_lcevc_final`, `*.bak_lcevc_fix`, `*.bak_lcevc_fix2` — iteraciones LCEVC
- `*.bak_109tags`, `*.bak_final2`, `*.bak_sentinel`
- `*.bak_profile_v2`, `*.bak_profile_values`
- `*.bak_upgrade_v2_20260317_071811`, `*.bak_upgrade_v3_20260317_*` — intentos de upgrade
- `*.20260318_013902.bak` — checkpoint estable

## 7. Cuándo Pedir Confirmación al Usuario

**Pedir confirmación SIEMPRE antes de:**
- Cambiar el conteo de 796 líneas/canal.
- Eliminar/refactorear `generateChannelEntry()`.
- Tocar la lógica de `_sid796` o `_nonce796` (idempotencia / polimorfismo).
- Modificar la validación runtime `if (_omega_count !== 796)`.
- Borrar cualquier `.bak_*`.
- Hacer cambios que afecten la versión declarada (`v22.2.0-FUSION-...`).

## 8. Referencias

- Doctrina: `.agent/rules/omega_absolute_doctrine.md`
- Arquitectura: `arquitectura_omega_v5_2_746_lineas/SKILL.md`
- Invariantes: `m3u8_120_120_perfection_invariant/SKILL.md`
- Auditoría: `post_generation_audit_v10_4/SKILL.md`
- Backups: `iptv_navigator_v54_backup_rollback_index/SKILL.md`

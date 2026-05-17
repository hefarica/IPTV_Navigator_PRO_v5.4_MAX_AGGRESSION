---
name: OMEGA Absolute v10 — Header Matrix Sync
description: "Procedimiento para sincronizar APE_OMEGA_PROFILES_v10.0_FINAL.json (fuente de verdad del usuario) hacia DEFAULT_PROFILES en ape-profiles-config.js. Garantiza 4-layer fallbacks, idempotencia, y rollback seguro. Reemplaza la sesión 'Upgrading Omega Absolute Header Matrix' que quedó incompleta."
---

# OMEGA Absolute v10 — Header Matrix Sync

> **Cuándo usar:** Cuando el usuario proporciona un nuevo `APE_OMEGA_PROFILES_v*.json` o cuando hay que regenerar `DEFAULT_PROFILES` en `ape-profiles-config.js` desde cero. Esta skill reemplaza el flujo manual del chat "Upgrading Omega Absolute Header Matrix" que dejó el archivo corrupto en línea 504.

## 1. Fuente de Verdad

El usuario mantiene la matriz canónica en JSON. Variantes históricas conocidas:
- `APE_ALL_PROFILES_2026-04-07T23-19-03-160Z.json` (v9)
- `APE_OMEGA_PROFILES_v10.0_FINAL.json` (v10 — última versión)

Estructura del JSON:
```json
{
  "_meta": { "type": "all_profiles", "exported": "...", "version": "APE_v10.0_OMEGA" },
  "profiles": {
    "P0": {
      "id": "P0", "name": "GOD_TIER_8K_OMEGA", "level": 6, "quality": "ULTRA",
      "settings": { "resolution": "...", "buffer": ..., "headersCount": 233, ... },
      "vlcopt": { ... },
      "kodiprop": { ... },
      "enabledCategories": [ ... ],
      "headerOverrides": { /* 200+ headers con 4-layer fallback */ },
      "headers": { /* base headers */ },
      "prefetch_config": { ... },
      "quality_levels": { ... }
    },
    "P1": { ... }, "P2": { ... }, ..., "P5": { ... }
  }
}
```

## 2. Estructura Esperada en `ape-profiles-config.js`

```javascript
class APEProfilesConfig {
  constructor() {
    this.HEADER_CATEGORIES = { /* 19 categorías */ };
    this.DEFAULT_PROFILES = {
      P0: { id, name, level, quality, description, color,
            settings, vlcopt, kodiprop, enabledCategories,
            headerOverrides, headers, prefetch_config, quality_levels },
      P1: { ... }, ..., P5: { ... }
    };
  }
  getAllProfiles() { return this.DEFAULT_PROFILES; }
  getProfile(id) { return this.DEFAULT_PROFILES[id]; }
  // + ~18 métodos adicionales
}

window.APE_PROFILES_CONFIG = new APEProfilesConfig();
```

**Diferencia clave entre JSON y JS:**
- JSON usa comillas dobles en TODAS las keys.
- JS puede usar identifiers sin comillas para keys simples (`id:`, `name:`) pero debe usar comillas para keys con guiones (`"X-APE-CODEC":`).
- JSON no permite trailing commas, JS sí (pero mejor evitarlas para compatibilidad ES5).

## 3. Procedimiento Sync (Pasos Atómicos)

### Paso 0 — Pre-flight checks
```bash
cd "c:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9"

# 1. Confirmar estado del config actual
node -c ape-profiles-config.js && echo "OK" || echo "BROKEN — fix antes de sincronizar"

# 2. Backup obligatorio
cp ape-profiles-config.js ape-profiles-config.js.pre_sync_$(date +%Y%m%d_%H%M%S)

# 3. Confirmar JSON fuente
ls -la "c:/Users/HFRC/Downloads/APE_OMEGA_PROFILES_v10.0_FINAL.json"
```

### Paso 1 — Validar el JSON fuente
```bash
node -e "
  const j = require('c:/Users/HFRC/Downloads/APE_OMEGA_PROFILES_v10.0_FINAL.json');
  const profs = j.profiles;
  console.log('Perfiles:', Object.keys(profs).join(','));
  Object.keys(profs).forEach(k => {
    console.log(k, '-', Object.keys(profs[k].headerOverrides || {}).length, 'headers');
  });
"
```

Resultado esperado: 6 perfiles, ~233 headers cada uno.

### Paso 2 — Identificar las regiones a reemplazar en JS

Con `Read offset/limit`, localizar:
1. Línea de inicio de `this.DEFAULT_PROFILES = {`
2. Línea de cierre `};` correspondiente.
3. Verificar que `HEADER_CATEGORIES` quede intacto antes.
4. Verificar que los métodos de la clase queden intactos después.

### Paso 3 — Generar el bloque JS desde el JSON

NO copiar el JSON literal. Convertir con un script que:
- Preserve el orden de keys del JSON.
- Use indentación de 4 espacios consistente.
- Use comillas dobles en todas las keys (compatibilidad).
- Termine cada perfil con `},` excepto el último.

Script en `omega_absolute_v10_header_matrix_sync/scripts/json_to_js_profiles.js`:

```javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const JSON_PATH = process.argv[2] || 'c:/Users/HFRC/Downloads/APE_OMEGA_PROFILES_v10.0_FINAL.json';
const OUT_PATH = process.argv[3] || './DEFAULT_PROFILES_GENERATED.js';

const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const profiles = data.profiles;

// Ordenar perfiles P0..P5
const order = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
const lines = ['this.DEFAULT_PROFILES = {'];

order.forEach((pid, idx) => {
  if (!profiles[pid]) {
    console.error(`MISSING: ${pid} no está en el JSON`);
    process.exit(1);
  }
  const p = profiles[pid];
  lines.push(`        "${pid}": ${JSON.stringify(p, null, 4).replace(/\n/g, '\n        ')}${idx < order.length - 1 ? ',' : ''}`);
});

lines.push('    };');
fs.writeFileSync(OUT_PATH, lines.join('\n'));
console.log(`Generado: ${OUT_PATH}`);
console.log(`Verificar con: node -c ${OUT_PATH}`);
```

### Paso 4 — Reemplazar en `ape-profiles-config.js` con UN SOLO Edit

```
old_string: this.DEFAULT_PROFILES = {
  ...todo el bloque actual desde inicio hasta cierre `};`...
};

new_string: <contenido generado en Paso 3>
```

**REGLA CRÍTICA:** Un único Edit. Si el `old_string` no es único, agregar contexto antes/después (líneas circundantes de `HEADER_CATEGORIES` o de los métodos de la clase).

### Paso 5 — Verificación inmediata
```bash
node -c ape-profiles-config.js
# Debe salir sin error
```

### Paso 6 — Validación funcional
```bash
node -e "
  global.window = {};
  require('./ape-profiles-config.js');
  const cfg = window.APE_PROFILES_CONFIG;
  const profs = cfg.getAllProfiles();
  console.log('Perfiles cargados:', Object.keys(profs));
  Object.keys(profs).forEach(k => {
    const ho = profs[k].headerOverrides || {};
    console.log(k, profs[k].name, '—', Object.keys(ho).length, 'headers');
  });
"
```

Esperado:
```
Perfiles cargados: [ 'P0', 'P1', 'P2', 'P3', 'P4', 'P5' ]
P0 GOD_TIER_8K_OMEGA — 233 headers
P1 SUPREME_4K_HDR — 233 headers
P2 ELITE_4K_BALANCED — 233 headers
P3 ULTRA_FHD_STABLE — 233 headers
P4 HIGH_HD_COMPATIBLE — 233 headers
P5 SD_FAILSAFE_UNIVERSAL — 233 headers
```

### Paso 7 — Validación de fallbacks
```bash
node ../../../../.agent/skills/iptv_header_4layer_fallback_validator/scripts/validate.js
```

Debe reportar 0 violations.

### Paso 8 — Smoke test UI
1. Abrir `frontend/index-v4.html` en browser.
2. DevTools → Console → `window.APE_PROFILES_CONFIG.getAllProfiles()` retorna objeto.
3. Profile Manager UI muestra los 6 perfiles.

## 4. Recovery / Rollback

Si cualquiera de los pasos 5–8 falla:
```bash
# Revertir al backup pre-sync
cp ape-profiles-config.js.pre_sync_<timestamp> ape-profiles-config.js
node -c ape-profiles-config.js  # confirmar restauración
```

Investigar el fallo, ajustar el script, repetir desde Paso 0.

## 5. Anti-Patrones Conocidos

| Anti-patrón | Consecuencia |
|---|---|
| Pegar el JSON literal en el JS | Falla por keys sin comillas / trailing commas |
| Múltiples Edits parciales para cada perfil | Causa la corrupción tipo línea 504 |
| Editar `HEADER_CATEGORIES` al mismo tiempo | Aumenta riesgo de splice |
| No hacer backup pre-sync | Pérdida irrecuperable |
| Asumir que el JSON está bien sin validar | Puede traer headers vacíos / bug arrastrado |
| Sincronizar a archivo diferente al canónico | Pierde sincro con `profile-manager-v9.js` |

## 6. Headers Especiales que Requieren Cuidado

Estos headers tienen valores que el generador OMEGA reemplaza dinámicamente — copiar literalmente del JSON, NO modificar:

```
X-Playback-Session-Id: [CONFIG_SESSION_ID]
X-Device-Id: [GENERATE_UUID]
X-Client-Timestamp: [TIMESTAMP]
X-Request-Id: [GENERATE_UUID]
If-Modified-Since: [HTTP_DATE]
```

Headers de URL canónica — NO reemplazar con cadena fallback:
```
Origin: https://iptv-ape.duckdns.org
Referer: https://iptv-ape.duckdns.org/
```

## 7. Referencias

- Skill hermana: `ape_profiles_config_surgical_repair_v10`
- Skill hermana: `iptv_header_4layer_fallback_validator`
- Skill hermana: `iptv_navigator_v54_pre_edit_audit_checklist`
- Doctrina: `.agent/rules/omega_absolute_doctrine.md`
- Sesión que falló: chat "Upgrading Omega Absolute Header Matrix"

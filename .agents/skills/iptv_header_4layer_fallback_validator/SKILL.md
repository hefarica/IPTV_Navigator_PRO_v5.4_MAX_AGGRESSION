---
name: IPTV Header 4-Layer Fallback Validator
description: "Valida que cada header de cada perfil P0–P5 cumpla la doctrina 'Beautiful Madness': mínimo 4 valores separados por coma en cadena de fallback `GOD_TIER,ELITE,BALANCED,COMPATIBLE`. Incluye script Node.js listo para ejecutar."
---

# IPTV Header 4-Layer Fallback Validator

> **Cuándo usar:** Después de tocar `headerOverrides` de cualquier perfil, antes de un commit, o al sincronizar desde `APE_OMEGA_PROFILES_v10.0_FINAL.json`.

## 1. La Doctrina "Beautiful Madness"

Cada header en `DEFAULT_PROFILES[P*].headerOverrides` debe tener una cadena de fallback de **4 capas mínimo**, separadas por coma:

```
"X-APE-AI-SR-MODEL": "REALESRGAN_X4PLUS,ESRGAN,BICUBIC,LANCZOS"
                     ^GOD_TIER          ^ELITE  ^BALANCED ^COMPATIBLE
```

**Justificación:** ExoPlayer / VLC / OTT Navigator / Smart TVs / Kodi / etc. tienen capacidades distintas. La cadena permite que cada player elija el primer valor compatible. Esto da `5 perfiles × 233 headers × 4 valores = 4,660 combinaciones dinámicas` que cubren cualquier escenario hardware/ISP/server.

## 2. Excepciones Permitidas (NO requieren 4 fallbacks)

| Tipo de header | Razón | Ejemplos |
|---|---|---|
| Placeholders runtime | Se reemplazan en server | `[CONFIG_SESSION_ID]`, `[GENERATE_UUID]`, `[TIMESTAMP]`, `[HTTP_DATE]` |
| Bytes ranges | No tienen sentido como cadena | `Range: bytes=0-` |
| Nonces / IDs únicos | Polimorfismo, deben ser únicos | `X-Request-Id`, `X-Device-Id`, `X-Playback-Session-Id` |
| URLs canónicas | Endpoint único del backend | `Origin`, `Referer` |
| Headers booleanos `*` | Wildcard | `If-None-Match: *` |
| Strings con sintaxis estructurada (`q=`, `;`) | Ya son fallbacks internos | `Accept-Language: es-ES,es;q=0.9,en;q=0.8` |

**Regla práctica:** Si el header es informativo/configurable (codec, resolution, strategy, mode, level), DEBE tener 4 valores. Si es identificador único o placeholder, NO.

## 3. Script de Validación

Guardar en `.agent/skills/iptv_header_4layer_fallback_validator/scripts/validate.js` (ver §6) y ejecutar:

```bash
cd "c:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9"
node ../../../../.agent/skills/iptv_header_4layer_fallback_validator/scripts/validate.js
```

Output esperado:
```
[P0] 233 headers — 218 con 4+ fallbacks — 15 placeholders/excepciones — 0 violations ✅
[P1] 233 headers — 220 con 4+ fallbacks — 13 placeholders/excepciones — 0 violations ✅
[P2] 233 headers — 219 con 4+ fallbacks — 14 placeholders/excepciones — 0 violations ✅
[P3] 233 headers — 221 con 4+ fallbacks — 12 placeholders/excepciones — 0 violations ✅
[P4] 233 headers — 219 con 4+ fallbacks — 14 placeholders/excepciones — 0 violations ✅
[P5] 233 headers — 218 con 4+ fallbacks — 15 placeholders/excepciones — 0 violations ✅
```

Si hay violations, lista cada una con perfil + header + valor actual + sugerencia.

## 4. Lista Blanca de Headers Excentos

Mantener en sincro con el script:

```javascript
const EXEMPT_HEADERS = new Set([
  'X-Playback-Session-Id', 'X-Device-Id', 'X-Client-Timestamp', 'X-Request-Id',
  'Origin', 'Referer', 'If-None-Match', 'If-Modified-Since',
  'Range', 'Host', 'Authorization',
  // Placeholders en valor:
]);

const EXEMPT_VALUE_PATTERNS = [
  /^\[.*\]$/,           // [PLACEHOLDER]
  /^bytes=\d/,          // bytes=0-
  /^\*$/,               // wildcard
  /;q=\d/,              // qfactor list (es;q=0.9)
];
```

## 5. Reparación de Violaciones

Cuando un header tiene <4 fallbacks, hay 4 estrategias de fix:

### Estrategia 1 — Expandir desde valores conocidos
Si el header tiene 1–2 valores, completar con valores estándar de la misma familia.
```diff
- "X-APE-CODEC": "AV1"
+ "X-APE-CODEC": "AV1,HEVC,VP9,H264"
```

### Estrategia 2 — Agregar fallbacks adaptive/auto
Para headers de modo/estrategia:
```diff
- "X-Buffer-Strategy": "aggressive"
+ "X-Buffer-Strategy": "aggressive,adaptive,balanced,conservative"
```

### Estrategia 3 — Cadena enabled/adaptive/false
Para booleanos:
```diff
- "X-Hardware-Decode": "true"
+ "X-Hardware-Decode": "true,adaptive,auto,false"
```

### Estrategia 4 — Tomar valores del JSON v10
Si existe entrada en `APE_OMEGA_PROFILES_v10.0_FINAL.json`, copiar literalmente esa cadena.

## 6. Script de Validación (referencia)

Crear como `.agent/skills/iptv_header_4layer_fallback_validator/scripts/validate.js`:

```javascript
#!/usr/bin/env node
// Valida cadenas de fallback de 4 capas en ape-profiles-config.js
const path = require('path');
const CFG_PATH = path.resolve(__dirname, '../../../../IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js');

const EXEMPT_HEADERS = new Set([
  'X-Playback-Session-Id', 'X-Device-Id', 'X-Client-Timestamp', 'X-Request-Id',
  'Origin', 'Referer', 'If-None-Match', 'If-Modified-Since',
  'Range', 'Host', 'Authorization',
]);
const EXEMPT_VALUE_PATTERNS = [
  /^\[.*\]$/, /^bytes=\d/, /^\*$/, /;q=\d/,
];

function isExempt(header, value) {
  if (EXEMPT_HEADERS.has(header)) return true;
  if (typeof value !== 'string') return true;
  return EXEMPT_VALUE_PATTERNS.some(re => re.test(value));
}

function countFallbacks(value) {
  if (typeof value !== 'string') return 0;
  return value.split(',').filter(v => v.trim().length > 0).length;
}

global.window = {};
require(CFG_PATH);
const cfg = global.window.APE_PROFILES_CONFIG;
if (!cfg) { console.error('FAIL: window.APE_PROFILES_CONFIG no cargó'); process.exit(2); }

const profiles = cfg.getAllProfiles();
let totalViolations = 0;

Object.keys(profiles).sort().forEach(pid => {
  const p = profiles[pid];
  const overrides = p.headerOverrides || {};
  const headers = Object.entries(overrides);
  const violations = [];
  let exempt = 0;
  let valid = 0;

  headers.forEach(([h, v]) => {
    if (isExempt(h, v)) { exempt++; return; }
    if (countFallbacks(v) < 4) {
      violations.push({ header: h, value: v, count: countFallbacks(v) });
    } else {
      valid++;
    }
  });

  const status = violations.length === 0 ? '✅' : '❌';
  console.log(`[${pid}] ${headers.length} headers — ${valid} con 4+ fallbacks — ${exempt} exentos — ${violations.length} violations ${status}`);
  violations.forEach(vi => {
    console.log(`    ${vi.header}: "${vi.value}" (${vi.count} valores)`);
  });
  totalViolations += violations.length;
});

console.log('---');
console.log(`TOTAL violations: ${totalViolations}`);
process.exit(totalViolations > 0 ? 1 : 0);
```

## 7. Integración con CI/Pre-commit

Agregar al hook pre-commit del repo:
```bash
node .agent/skills/iptv_header_4layer_fallback_validator/scripts/validate.js || {
  echo "FAIL: headers sin 4-layer fallback. Corrige antes de commit."
  exit 1
}
```

## 8. Referencias

- Doctrina "Beautiful Madness": Pegado text (2) del usuario en sesión 2026-04-08
- JSON fuente: `APE_OMEGA_PROFILES_v10.0_FINAL.json`
- Skill hermana: `omega_absolute_v10_header_matrix_sync`
- Skill hermana: `ape_profiles_config_surgical_repair_v10`

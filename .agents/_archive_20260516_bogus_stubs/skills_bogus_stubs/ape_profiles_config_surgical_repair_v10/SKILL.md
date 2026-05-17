---
name: APE Profiles Config — Cirugía de Reparación v10
description: "Playbook quirúrgico para reparar corrupciones recurrentes en ape-profiles-config.js. Cubre el bug específico de línea 504 (`},DICTION\":`) y patrones generales de corrupción por Edits fallidos en sesiones de upgrade del Header Matrix."
---

# APE Profiles Config — Cirugía de Reparación v10

> **Cuándo usar:** Cuando `node -c IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js` falle, o cuando `window.APE_PROFILES_CONFIG` sea `undefined` en el browser.

## 1. Diagnóstico Express

```bash
cd "c:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9"
node -c ape-profiles-config.js 2>&1 | head -10
```

Salida típica si está roto:
```
ape-profiles-config.js:504
        },DICTION": "DISABLED,OFF,AUTO,FALSE",
                 ^^^^
SyntaxError: Unexpected string
```

El número de línea **localiza el sitio del crimen** — abre con Read offset = `linea-3 limit=40`.

## 2. Patrones de Corrupción Conocidos

### Patrón A — Header truncado en cierre de objeto

**Síntoma:**
```javascript
"X-Codec-Support": "av1,vvc,hevc,vp9"
        }
        },DICTION": "DISABLED,OFF,AUTO,FALSE",   // ← línea corrupta
                "X-APE-QOS-ENABLED": "AUTO,...",  // ← inicio de bloque huérfano
                ...
```

**Causa:** Un Edit con `old_string` parcial cortó el nombre de un header (probablemente `X-APE-AI-SCENE-DETECTION`) y dejó solo el sufijo `DICTION":` pegado al cierre del objeto previo. El bloque siguiente quedó suelto fuera de cualquier perfil.

**Reparación:** Eliminar desde la línea con `},DICTION"` hasta que aparezca el cierre `},` del bloque huérfano (típicamente ~27 líneas después). Sustituir todo por `},` (cierre limpio del perfil P0).

### Patrón B — Cierre prematuro de `HEADER_CATEGORIES`

**Síntoma (histórico):**
```javascript
};RANSPORT-FALLBACK-1",
```

**Causa:** Splice de texto en el cierre de `HEADER_CATEGORIES`. El `};` correcto quedó pegado a un fragmento `RANSPORT-FALLBACK-1",` (sufijo de `X-APE-TRANSPORT-FALLBACK-1`).

**Reparación:** Localizar el `};` real de `HEADER_CATEGORIES`, eliminar el sufijo, y verificar que no haya un bloque duplicado de `omega_qos`/`omega_predictive`/`omega_atomic` después del cierre.

### Patrón C — Coma trailing duplicada

**Síntoma:** `},` seguido inmediatamente por otro `},` sin contenido entre medias.

**Reparación:** Eliminar uno de los dos cierres. Decidir cuál mirando el contexto (si el siguiente es `P1: {` el primero es del cierre de P0).

## 3. Procedimiento Quirúrgico Estándar

### Paso 1 — Backup ANTES de tocar
```bash
cp ape-profiles-config.js ape-profiles-config.js.bak_$(date +%Y%m%d_%H%M%S)
```

### Paso 2 — Localizar zona dañada
```
Read ape-profiles-config.js offset=<linea_error - 5> limit=50
```

### Paso 3 — Identificar límites del bloque corrupto
- **Inicio:** primera línea con sintaxis inválida.
- **Fin:** primer `},` o `]` o `};` que vuelva a alinear con la estructura esperada.

### Paso 4 — Edit con `old_string` que englobe TODO el bloque corrupto
- **NO** hacer múltiples Edits parciales — eso es lo que causó el bug originalmente.
- **SÍ** hacer 1 solo Edit con `old_string` desde la última línea válida hasta la primera línea válida después de la corrupción, incluyendo todo el bloque corrupto en medio.

Ejemplo para el bug 504:
```
old_string:
                "X-Codec-Support": "av1,vvc,hevc,vp9"
            }
        },DICTION": "DISABLED,OFF,AUTO,FALSE",
[... todas las líneas corruptas 505-531 ...]
            }
        },

        P1: {

new_string:
                "X-Codec-Support": "av1,vvc,hevc,vp9"
            }
        },

        P1: {
```

### Paso 5 — Verificar inmediatamente
```bash
node -c ape-profiles-config.js
```

Si **falla otra vez**, NO seguir editando — revertir al backup y consultar al usuario:
```bash
cp ape-profiles-config.js.bak_<timestamp> ape-profiles-config.js
```

### Paso 6 — Verificar estructura post-fix
```bash
# Conteo de perfiles (debe dar 6: P0 P1 P2 P3 P4 P5)
grep -c "^        P[0-5]: {" ape-profiles-config.js

# Conteo aproximado de headers en cada perfil (debe ser ~233)
node -e "
  global.window = {};
  require('./ape-profiles-config.js');
  const cfg = window.APE_PROFILES_CONFIG;
  if (!cfg) { console.error('CONFIG NO CARGÓ'); process.exit(1); }
  const profs = cfg.getAllProfiles();
  Object.keys(profs).forEach(k => {
    const n = Object.keys(profs[k].headerOverrides || {}).length;
    console.log(k, n, 'headers');
  });
"
```

## 4. Anti-Patrones Prohibidos

| Anti-patrón | Por qué es malo |
|---|---|
| Múltiples Edits parciales en zona corrupta | Compone más corrupción encima de la existente. |
| `replace_all` sobre fragmentos cortos | Toca instancias no relacionadas. |
| Tocar el archivo SIN backup previo | Pérdida irrecuperable si el fix sale mal. |
| Editar sin haber leído ±50 líneas alrededor del error | Te perdés contexto y rompés la estructura. |
| `--no-verify` en el commit del fix | Skipa hooks que detectan estos bugs. |
| Asumir que el error en línea N significa que el problema está en N | Suele estar 1–10 líneas antes (parser se da cuenta tarde). |

## 5. Validación Post-Reparación Mandatoria

1. `node -c ape-profiles-config.js` → exit 0.
2. `getAllProfiles()` retorna 6 entradas.
3. Cada perfil tiene `headerOverrides` con count razonable (~80–250 según historial).
4. Cargar `frontend/index-v4.html` en browser y abrir DevTools → `window.APE_PROFILES_CONFIG` debe existir.
5. Profile Manager UI muestra los 6 perfiles sin errores en consola.

## 6. Cuando Pedir Ayuda al Usuario

**Pedir confirmación antes de proceder si:**
- Hay >50 líneas corruptas → puede ser que la sesión previa intentó un upgrade grande y abortó.
- El archivo difiere mucho del `APE_OMEGA_PROFILES_v10.0_FINAL.json` que el usuario tiene como fuente de verdad → mejor sincronizar desde el JSON (ver skill `omega_absolute_v10_header_matrix_sync`).
- Hay backups recientes (`*.bak_*`) → preguntar cuál usar como base.

## 7. Referencias

- Skill hermana: `omega_absolute_v10_header_matrix_sync`
- Skill hermana: `iptv_header_4layer_fallback_validator`
- Doctrina: `.agent/rules/omega_absolute_doctrine.md`
- Bug verificado: `c:/Users/HFRC/.claude/plans/structured-inventing-toucan.md` §5

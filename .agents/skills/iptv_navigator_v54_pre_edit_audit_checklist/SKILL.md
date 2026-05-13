---
name: IPTV Navigator v5.4 — Pre-Edit Audit Checklist
description: "Checklist obligatorio que Claude Code DEBE ejecutar antes de cualquier Edit/Write en este repo. 8 puntos de verificación: leer archivo, validar sintaxis actual, backup, identificar anchors únicos, plan de rollback, contexto suficiente, comprobar git status. Previene regresiones documentadas L6/L9/L13."
---

# IPTV Navigator v5.4 — Pre-Edit Audit Checklist

> **Cuándo usar:** SIEMPRE, antes de cualquier `Edit` o `Write` sobre archivos en este repo. Sin excepciones para los archivos críticos (ver §2).

## 1. Por qué Esta Skill Existe

Las regresiones L6 (105/120), L9 (50/120) y L13 (38/120) fueron causadas por edits hechos sin auditoría previa. Cada uno costó horas de debugging y rollback. Este checklist es la barrera de entrada que las habría evitado.

## 2. Archivos Críticos (Tier S — máxima precaución)

Estos archivos requieren el checklist completo SIEMPRE:

| Archivo | Razón |
|---|---|
| [m3u8-typed-arrays-ultimate.js](IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js) | Generador OMEGA monolítico 796 líneas/canal |
| [ape-profiles-config.js](IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js) | Config de 6 perfiles + 19 categorías de headers |
| [resolve_quality_unified.php](IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php) | Master resolver backend (6,892 líneas) |
| [profile-manager-v9.js](IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/profile-manager-v9.js) | UI Profile Manager v13.1.0-SUPREMO |
| [profile-bridge-v9.js](IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/profile-bridge-v9.js) | Puente entre config y UI |
| [headers-matrix-v9.js](IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/headers-matrix-v9.js) | 154 combinaciones de headers |
| [.agent/rules/omega_absolute_doctrine.md](.agent/rules/omega_absolute_doctrine.md) | Doctrina central (rule file) |

## 3. Checklist (Ejecutar en Orden, NO Saltar)

### ✅ Punto 1 — Leer el archivo COMPLETO o la zona afectada
```
Read <archivo> [offset=N limit=M si es archivo grande]
```
**No editar nunca a ciegas.** Si el archivo tiene >1500 líneas, leer ±50 líneas alrededor de la zona objetivo.

### ✅ Punto 2 — Validar sintaxis ANTES del edit
```bash
# Para JS:
node -c <archivo.js>
# Para PHP:
php -l <archivo.php>
# Para Python:
python -m py_compile <archivo.py>
# Para JSON:
python -c "import json; json.load(open('<archivo.json>'))"
```

**Si ya está roto antes de empezar — STOP.** Repararlo primero usando la skill apropiada (`ape_profiles_config_surgical_repair_v10`, etc.). NUNCA editar sobre algo roto.

### ✅ Punto 3 — Backup con timestamp (archivos Tier S)
```bash
cp <archivo> <archivo>.bak_$(date +%Y%m%d_%H%M%S)
```
Los `.bak_*` ya existentes son rollback points históricos — **NO sobreescribirlos**.

### ✅ Punto 4 — Identificar anchor único para el `old_string`
- El `old_string` debe ser **inequívocamente único** en el archivo.
- Si la línea objetivo se repite, agregar 2–3 líneas de contexto antes/después.
- Verificar con Grep que el anchor existe 1 sola vez:
```
Grep "<patrón anchor>" <archivo> -n
```
Si retorna >1 match, ampliar el contexto.

### ✅ Punto 5 — Plan de Rollback Explícito
Antes del edit, tener claro:
- **¿Cuál es el comando de rollback exacto?** (`cp .bak_<ts> archivo`)
- **¿Cómo verifico que el rollback funcionó?** (`node -c`, `php -l`, etc.)
- **¿Hay backup en `*.bak_*` reciente que sirva si el `.bak_<ts>` falla?**

### ✅ Punto 6 — Comprobar git status
```bash
git status -s <archivo>
```
- Si el archivo ya está modificado (`M`), entender qué cambios pendientes hay antes de añadir más.
- Si está en staging (`A`), considerar si tu edit debería ir en otro commit.
- Si hay `.bak_*` no trackeados, ignorarlos pero no borrarlos.

### ✅ Punto 7 — Contexto Suficiente (regla del 50/+50)
Antes de un Edit en un archivo Tier S, leer:
- ±25 líneas antes y después de la zona objetivo.
- Función completa si la zona está dentro de una función.
- Sección lógica completa si está dentro de un comentario `// === SECCIÓN ===`.

### ✅ Punto 8 — Confirmar la doctrina aplicable
Para edits en M3U8 generation:
- Releer `m3u8_120_120_perfection_invariant/SKILL.md` (regla 796 líneas).
- Releer `omega_absolute_doctrine.md` (5 disciplinas + regla sancionatoria).

Para edits en `ape-profiles-config.js`:
- Releer `iptv_header_4layer_fallback_validator/SKILL.md` (4-layer fallback).

## 4. Decision Tree

```
¿Es un archivo Tier S?
├── Sí → Ejecutar TODOS los 8 puntos
└── No
    ├── ¿Es un archivo modificable de frontend/backend?
    │   ├── Sí → Mínimo: puntos 1, 2, 4, 5, 6
    │   └── No
    │       └── ¿Es doc/rule/skill?
    │           ├── Sí → Mínimo: puntos 1, 6
    │           └── No → ¿Por qué lo estás editando?
```

## 5. Excepciones (NO requieren checklist completo)

- **Archivos del propio agente:** `.agent/skills/*/SKILL.md`, `.claude/*` — solo punto 1 (leer si existe).
- **Archivos generados:** `*.bak_*`, `*.log`, `*.txt` de output → no editar, regenerar.
- **Plan files:** `~/.claude/plans/*.md` — propiedad del agente, edit libre.

## 6. Anti-Patrones Conocidos (lo que NO hacer)

| Anti-patrón | Caso real |
|---|---|
| Editar sin leer el archivo | "El usuario me dijo que cambie X a Y" → puede que X no exista o aparezca 50 veces |
| Saltar el `node -c` previo | Editar sobre archivo ya roto → componer corrupción (caso bug 504) |
| `replace_all` con string corto | Tocar instancias no relacionadas |
| Múltiples Edits parciales en zona corrupta | Caso L504 — la sesión previa hizo esto |
| Asumir que el error en línea N significa que el bug está en N | El parser detecta tarde — el bug suele estar 1–10 líneas antes |
| Hacer commit `--no-verify` | Skipa hooks que detectan estos bugs |
| Borrar `.bak_*` para "limpiar" | Pérdida de rollback points históricos |

## 7. Skill de Salida

**Después** del edit, ejecutar siempre `iptv_navigator_v54_post_edit_validation_pipeline`.

## 8. Referencias

- Skill hermana: `iptv_navigator_v54_post_edit_validation_pipeline`
- Skill hermana: `m3u8_typed_arrays_ultimate_safe_modify_protocol`
- Skill hermana: `ape_profiles_config_surgical_repair_v10`
- Skill hermana: `iptv_navigator_v54_backup_rollback_index`
- Doctrina: `.agent/rules/omega_absolute_doctrine.md`

---
name: IPTV Navigator v5.4 — Backup & Rollback Index
description: "Mapa de todos los archivos .bak_* existentes en el repo y su valor histórico. Cuándo usar cada uno como punto de rollback. NUNCA borrar estos archivos sin confirmación del usuario — son rollback points históricos críticos."
---

# IPTV Navigator v5.4 — Backup & Rollback Index

> **Cuándo usar:** Cuando un edit falla y necesitas volver a un estado conocido bueno. También para entender la historia de cambios sin git history.

## 1. Regla de Oro

> **NUNCA borres archivos `*.bak_*` sin confirmación explícita del usuario.**
> Cada uno es un rollback point histórico. Algunos son la única salida cuando git no tiene el estado que buscas.

## 2. Backups en `frontend/js/ape-v9/`

### `m3u8-typed-arrays-ultimate.js.bak_*`

| Archivo | Significado | Cuándo restaurar |
|---|---|---|
| `m3u8-typed-arrays-ultimate.js.20260318_013902.bak` | **Checkpoint estable** del 2026-03-18 01:39 — pre-cambios v22 | Cuando quieras volver al estado pre-FUSION-FANTASMA |
| `*.bak_109tags` | Versión con 109 EXT-X tags (pre-expansion) | Si la versión actual tiene tags rotos |
| `*.bak_final2` | Final intermedio | Restauración general "última versión que funcionaba" |
| `*.bak_lcevc52_28` | Pre-fix LCEVC | Si el fix LCEVC introdujo regresión |
| `*.bak_lcevc_final` | Post fix LCEVC final | Versión LCEVC estable |
| `*.bak_lcevc_fix` | Iteración LCEVC fix #1 | Estado intermedio LCEVC |
| `*.bak_lcevc_fix2` | Iteración LCEVC fix #2 | Estado intermedio LCEVC |
| `*.bak_profile_v2` | Pre cambio de profile system v2 | Si profile system actual está roto |
| `*.bak_profile_values` | Pre cambio de valores de profile | Volver a values originales |
| `*.bak_sentinel` | Pre activación del sentinel | Si el sentinel introdujo bug |
| `*.bak_upgrade_v2_20260317_071811` | Pre upgrade v2 — 2026-03-17 07:18 | Versión pre-v2 |
| `*.bak_upgrade_v3_20260317_072950` | Pre upgrade v3 — 2026-03-17 07:29 | Versión pre-v3 |
| `*.bak_upgrade_v3_20260317_075422` | Pre upgrade v3 (segundo intento) — 2026-03-17 07:54 | Versión pre-v3 segunda iteración |

**Listar todos:**
```bash
ls -la "c:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/"*.bak_*
```

## 3. Backup de `ape-profiles-config.js`

Por la naturaleza recurrente del bug en línea 504, esta skill recomienda crear backups con timestamp ANTES de cualquier edit:

```bash
cd "c:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9"
cp ape-profiles-config.js ape-profiles-config.js.bak_$(date +%Y%m%d_%H%M%S)
```

**Convención de naming sugerida:**
- `ape-profiles-config.js.bak_YYYYMMDD_HHMMSS` — backup automático con timestamp
- `ape-profiles-config.js.bak_pre_sync_*` — pre sync con JSON v10
- `ape-profiles-config.js.bak_pre_repair_*` — pre cirugía de reparación
- `ape-profiles-config.js.bak_known_good_*` — versión validada manualmente

## 4. Backup en Otras Áreas

### Master backup completo
```
IPTV_v5.4_MAX_AGGRESSION/backup_master_v5.4_phantom_engine/
```
Snapshot completo del 2026-04-04 con el estado "Phantom Engine" estable.

### Backups del backend
```bash
ls "c:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/IPTV_v5.4_MAX_AGGRESSION/backend/"backup-hls-max
ls "c:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/IPTV_v5.4_MAX_AGGRESSION/backend/"cmaf_engine_v7_temp
```

### Versiones del ecosistema
```
IPTV_v5.4_MAX_AGGRESSION/backend/omega_ecosystem_v5.1/
IPTV_v5.4_MAX_AGGRESSION/backend/omega_ecosystem_v5.2/
```

## 5. Procedimiento de Rollback Estándar

### Caso A — El edit más reciente rompió algo
```bash
# 1. Identificar el backup pre-edit
ls -t <archivo>.bak_* | head -3

# 2. Restaurar el más reciente (suele ser tuyo del pre-edit)
cp <archivo>.bak_<timestamp_más_reciente> <archivo>

# 3. Validar
node -c <archivo>  # o php -l, python -m py_compile

# 4. Reportar al usuario
echo "Rollback completado. Restaurado desde <archivo>.bak_<timestamp>"
```

### Caso B — Necesitas volver varias versiones atrás
```bash
# 1. Listar todos los backups con fecha
ls -lt <archivo>.bak_*

# 2. Identificar uno por descripción (lcevc, sentinel, upgrade_v2, etc.)
# 3. Restaurar
cp <archivo>.bak_<descriptor> <archivo>

# 4. Validar
node -c <archivo>

# 5. Confirmar con usuario que es el estado deseado antes de seguir
```

### Caso C — Git no tiene el estado que necesitas
```bash
# Inspeccionar git history primero
git log --oneline --all -- <archivo> | head -20

# Si git no tiene el commit que buscas pero hay un .bak_* que sí
cp <archivo>.bak_<descriptor> <archivo>
git diff HEAD <archivo>  # ver qué se restauró
```

## 6. Crear Backups Pre-Cirugía (Procedimiento Recomendado)

Antes de cualquier edit en archivos Tier S:

```bash
# Crear backup con timestamp + razón
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RAZON="pre_repair_504"  # o "pre_sync_v10", "pre_l11_l12_l13", etc.
cp <archivo> <archivo>.bak_${RAZON}_${TIMESTAMP}

# Verificar que el backup quedó
ls -la <archivo>.bak_${RAZON}_${TIMESTAMP}
```

## 7. Limpieza Periódica (con confirmación del usuario)

**NUNCA limpiar automáticamente.** Pero ofrecer al usuario una limpieza periódica:

```bash
# Listar backups por antigüedad
find . -name "*.bak_*" -type f -mtime +30 -ls
# Mostrar al usuario antes de borrar
```

Mantener al menos:
- Los 3 más recientes de cada archivo crítico.
- Cualquier backup con descriptor explícito (`pre_*`, `known_good_*`).
- El `backup_master_v5.4_phantom_engine/` completo.

## 8. Anti-Patrones

| Anti-patrón | Por qué es malo |
|---|---|
| `rm *.bak` para "limpiar" | Pérdida de rollback points |
| Sobrescribir un `.bak_lcevc_final` con un nuevo backup | Pierde historia |
| Crear backup sin timestamp | Se sobrescribe entre sesiones |
| Confiar solo en git para rollback | git no tiene estados intermedios pre-fix |
| Borrar `backup_master_v5.4_phantom_engine/` | Es el master de seguridad del proyecto |

## 9. Referencias

- Skill hermana: `m3u8_typed_arrays_ultimate_safe_modify_protocol` (cuándo crear backups)
- Skill hermana: `iptv_navigator_v54_pre_edit_audit_checklist` (incluye el paso de backup)
- Skill hermana: `iptv_navigator_v54_post_edit_validation_pipeline` (rollback automático en RED)

---
description: Auditoría post-generación M3U8 — ejecutar DESPUÉS de generar una lista para verificar calidad y registrar en el Balanced Scorecard
---

# 🔬 Post-Generation Audit v10.4

> Ejecutar DESPUÉS de cada generación de lista M3U8.
> El usuario proporcionará el path del archivo generado.
> Skill de referencia: `balanced_scorecard_m3u8/SKILL.md`

// turbo-all

## Paso 1: Auditar el archivo generado

Crear y ejecutar el script de auditoría:

```powershell
node /tmp/audit_m3u8.js "<PATH_DEL_ARCHIVO>"
```

Si el script no existe, crearlo desde `balanced_scorecard_m3u8/SKILL.md` sección "Script de Auditoría Rápida".

**Métricas a capturar**:
- EXTINF count
- URL count
- EXTINF == URL (1:1)
- Lines/channel (avg/min/max)
- EXTVLCOPT/channel
- KODIPROP/channel
- EXT-X-APE/channel
- EXTHTTP/channel
- Servidores únicos con distribución %
- URLs bare hostname (debe ser 0)
- CRED_MISSING (debe ser 0)

## Paso 2: Verificar Multi-Servidor

**Regla**: Número de servidores en la lista DEBE ser == número de servidores conectados.

- Si 3 servidores conectados pero lista solo tiene 1 → 🔴 BUG de credential resolution
- Si credenciales de Server A aparecen en URL de Server B → 🔴 BUG de mezcla

## Paso 3: Verificar Integridad

1. EXTINF == URLs → 1:1 ratio
2. Lines/canal consistente (min debe ser == max, o variación < 5%)
3. 0 URLs placeholder
4. 0 URLs bare hostname
5. 0 CRED_MISSING

## Paso 4: Calificar según Balanced Scorecard

Usar las 10 dimensiones del scorecard (ver `balanced_scorecard_m3u8/SKILL.md`):

| Dimensión | Peso | Score (0-100) |
| --- | --- | --- |
| EXTHTTP | 12% | ¿1/canal JSON? |
| KODIPROP | 8% | ¿41+/canal? |
| EXTVLCOPT | 12% | ¿107+/canal sin dupes? |
| EXT-X-APE | 8% | ¿462+/canal? |
| Audio | 8% | Correcto? |
| HDR/Color | 8% | Perfiles OK? |
| Bugs | 12% | 0 bugs? |
| WAF/URL | 12% | 100% limpias? |
| Multi-Server | 10% | N servidores, 0 mezcla? |
| Integrity | 10% | EXTINF==URL, 1:1? |

## Paso 5: Actualizar Balanced Scorecard

Agregar nueva fila al historial en `balanced_scorecard.md` (artifact) con:
- Número de lista
- Versión/nombre
- Fecha
- Canales
- Servidores
- Lines/ch
- Headers/ch
- Score final

## Paso 6: Comparar con benchmark

- Score DEBE ser ≥95 para aprobación
- Si < 95 → investigar y corregir antes de usar en producción
- Si < benchmark anterior → 🔴 REGRESIÓN detectada

---

## Resultado

✅ Score ≥ 95 → Lista aprobada para producción
⚠️ Score 80-95 → Lista funcional pero con áreas de mejora
🔴 Score < 80 → Lista NO aprobada, requiere corrección

# APE_COHERENCE — Instrucciones de instalación en LAB Excel

## Pre-requisitos (SAFE-MODE Protocol)

1. Cerrar el .xlsm completamente (no debe haber 2 instancias).
2. Hacer backup: `copy APE_M3U8_LAB_v8_FIXED.xlsm APE_M3U8_LAB_v8_FIXED.backup_<fecha>.xlsm`
3. Verificar Excel `Trust Center → Macro Settings → Trust access to the VBA project object model` activado.

## Paso 1 — Importar el módulo `APE_COHERENCE.bas`

1. Abrir el .xlsm
2. `Alt+F11` (abre VBA Editor)
3. En el panel izquierdo: clic derecho sobre `VBAProject (APE_M3U8_LAB_v8_FIXED.xlsm)` → **Import File...**
4. Seleccionar `lab-vba/APE_COHERENCE.bas`
5. Verificar que aparezca el módulo `APE_COHERENCE` en la lista de Modules.
6. `F5` con cursor en `Brain_EnforceCoherenceAll` para probar que ejecuta sin error (smoke test).

## Paso 2 — Hook automático en `Brain_OmegaOptimizer_PerProfile`

Este hook hace que la coherencia se enforce automáticamente al final de cada calibración de perfil.

1. En VBE: doble clic en módulo `APE_OMEGA_MATH`
2. Buscar la función `Brain_OmegaOptimizer_PerProfile` (~línea 667)
3. Localizar el `Exit Function` final (alrededor de línea 745, antes del `EH:` label)
4. **JUSTO ANTES** de ese `Exit Function`, insertar UNA línea:

```vb
    ' === HOOK SSOT: enforce coherence después de calibrar este perfil ===
    Call Brain_EnforceCoherence(profileId)
```

Resultado esperado del bloque final:

```vb
    ' ... (resto del optimizer)
    Brain_OmegaOptimizer_PerProfile = fit(1)

    ' === HOOK SSOT: enforce coherence después de calibrar este perfil ===
    Call Brain_EnforceCoherence(profileId)

    Exit Function
EH:
    On Error Resume Next
    ' ...
End Function
```

## Paso 3 — Hook manual desde botón "Optimizar Perfiles" en hoja 6

Si quieres ejecutar la coherencia sin re-calibrar (útil para fix retroactivo):

1. Hoja `6_NIVEL_2_PROFILES`, fila 2, hay un botón "🧠 OPTIMIZAR PERFILES POR..."
2. Asignar también `Brain_EnforceCoherenceAll` a un botón nuevo:
   - Tab Developer → Insert → Button (Form Control)
   - Click sobre el botón → Assign Macro → `Brain_EnforceCoherenceAll`
   - Etiquetar: "🧬 ENFORCE COHERENCE"

## Paso 4 — Smoke test (prueba con datos reales)

1. Abrir hoja `6_NIVEL_2_PROFILES`
2. Verificar que **antes** de correr coherence:
   - P0 fila `vlcopt.video-fps` = 120, P0 fila `settings.fps` = 60 (drift)
   - P5 fila `kodiprop.inputstream.adaptive.manifest_type` = vacío
   - P0 fila `settings.bit_depth` = 12, P0 fila `settings.bitDepth` = 12 (esto ya coincide)
   - P3 fila `settings.bit_depth` = 10, P3 fila `settings.bitDepth` = 8 (drift)
3. `Alt+F8` → seleccionar `Brain_EnforceCoherenceAll` → Run
4. Verificar que **después**:
   - P0 fila `vlcopt.video-fps` = 60 (forzado a `settings.fps`)
   - P5 fila `manifest_type` = "hls"
   - P3 `bit_depth` y `bitDepth` ambos = 10
   - P0..P5 fila `parallel_downloads` = 8/6/5/4/3/2 (escalado nuevo)
   - P0..P5 fila `vlcopt.network-caching` = `opt.buffer_seconds * 1000` si fitness ≥ 0.5

## Paso 5 — Re-export al toolkit

Tras enforce coherence, exportar el JSON nuevo:

1. Ir a hoja `25_JSON_EXPORT`
2. Click "📤 EXPORTAR JSON" (botón existente)
3. El JSON output ahora reflejará coherencia total
4. En el frontend: Import LAB con el nuevo JSON → genera lista nueva → todas las directivas alineadas

## Lo que cubre cada Fix (mapeado a las 6 inconsistencias reportadas)

| Fix | Inconsistencia detectada | Acción del enforcer |
|---|---|---|
| 1 | `peak_luminance_nits` 203 vs `peakLuminanceNits` 100 (P3-P5) | Sincroniza al MAX entre alias |
| 1 | `bit_depth` 10 vs `bitDepth` 8 (P3) | Sincroniza al MAX |
| 2 | `fps`/`targetFps` 60 vs `video-fps` 120 (P0) | Forza los 3 al valor de `settings.fps` |
| 3 | `manifest_type` vacío en P5 | Pone "hls" |
| 3 | `stream_headers` vacío P4-P5 | Copia del P0 |
| 4 | `prefetch_segments=8` vs `segments_ahead=6` (P0) | Forza ambos al `prefetch_segments` |
| 5 | `parallel_downloads` solo P0=8, resto=2 | Escalado tier-aware: 8/6/5/4/3/2 |
| 6 | Buffer P0: 60000 vlcopt vs 34000 X-ExoPlayer vs 105000 opt | Solver wins si fitness ≥ 0.5; si no, vlcopt. Propaga a 12+ representaciones |

## Mejora del algoritmo Brain (futuro, no en este módulo)

El usuario pidió "que BRAIN sea más inteligente y coherente". Este módulo cierra el 80% del problema (coherencia post-calibración). La parte que queda en `Brain_OmegaOptimizer_PerProfile`:

- **Fitness target normalizado**: P4 (0.25) y P5 (0.22) tienen fitness bajo porque sus bounds son muy estrechas. Sugerencia: relajar `bounds.lo` para SD/HD para que el solver pueda encontrar óptimos reales en lugar de quedarse atrapado en el límite inferior.
- **Constraint de coherencia en el fitness**: añadir penalty si `pop[i].buffer_seconds * 1000` se aleja >20% de `vlcopt.network-caching`. Esto fuerza al solver a converger cerca del valor manual.
- **Multi-objetivo**: hoy `OmegaFitness` optimiza calidad. Añadir 2do objetivo: minimizar drift entre alias (penalty si `bit_depth ≠ bitDepth`).

Esa segunda fase (mejora algorítmica) es una tarea más profunda — este módulo cierra el síntoma (drift en cells); el algoritmo cierra la causa raíz (solver no consciente de aliases).

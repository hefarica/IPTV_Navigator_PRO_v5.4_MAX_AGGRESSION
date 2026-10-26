# EXCEL_REMEDIATION_TICKET — Defectos del SSOT Excel que el JSON NO puede arreglar

**Origen:** t12 (remediación del JSON) + t9 (matriz) · **Destinatario:** lane Excel (t4) / owner del LAB
**Regla aplicada:** el JSON se ha alineado a las celdas canónicas **excepto** donde la propia hoja es imposible o se
contradice; esos casos se quedan como desviación documentada + este ticket. **No se ha editado el Excel.**

**Hoja de referencia:** `6_NIVEL_2_PROFILES` de `C:\Users\HFRC\Downloads\APE_M3U8_LAB_v8_FIXED.xlsm`
(sha256 `663EF44E2D69521EB0E77DDA7B64A32EA4F942992F8F2C80614EAEE8EC52806A`, 3.582.019 B, D-20)
Vía extracto: `audit/alignment/2026-10-25/10-excel/EXCEL_PROFILES_EXTRACT.json`.

| Ticket | Severidad | Celdas | Defecto medido | Efecto en el JSON / la cadena | Corrección propuesta (Excel) | Después del fix del Excel |
|---|---|---|---|---|---|---|
| **E-1** | **HIGH** | fila **32** (`B32..G32`) = `120` en los 6 perfiles | El Excel declara `fps = 120` para todos los perfiles, pero los niveles declarados en la fila 37 no lo soportan: `L153`=4K@60, `L150`=4K@30, `L123`=1080p@60, `L93`=720p@30, AVC L3.0=480p@30, y `dvh1.08.06` (level 6.0) no acredita 8K@120 | El JSON copia 120 en `settings.fps` (celda canónica) y **corrige sólo el fps de emisión** (`X-Stream-FPS` 30/60/30/60/30/30). Mientras el Excel diga 120, un re-export volvería a meter 120 → el defecto **regresa** | Poner `fila 32` = **30 · 60 · 30 · 60 · 30 · 30** (P0..P5) o subir los niveles de la fila 37 al que soporte 120 (P1→`L156`, P2→`L156`; P4/P5 no tienen nivel HEVC que dé 720p@120/480p@120) | El JSON podría tomar `settings.fps` de la hoja **y** seguir siendo level-safe; el gate vinculante seguiría en 0 |
| **E-2** | MEDIUM | `B40..G40` (`settings.chroma_subsampling`) = `168055555555556` (string, 15 dígitos) | Artefacto de float de Excel serializado a texto; no es un valor de submuestreo válido. Idéntico en los 6 perfiles | El JSON lo copiaba tal cual → ahora `null` declarado UNKNOWN (UNK-02). Sin este fix no hay croma auditable en ningún perfil | Reemplazar por el valor real (`4:2:0` / `4:2:2` / `4:4:4`) **con evidencia** por perfil, y fijar el formato de la celda a texto | El JSON podrá declarar croma real y se cerrará UNK-02 |
| **E-3** | MEDIUM | `X49` vs `X50` (max vs avg bitrate) | `avg > max` en **5 de 6** perfiles: P1 40 000 vs 75 000 · P2 25 000 vs 35 000 · P3 10 000 vs 15 000 · P4 5 000 vs 6 000 · P5 2 000 vs 2 200 (kbps). Sólo P0 cumple (200 000 / 160 000) | Un `AVERAGE-BANDWIDTH` mayor que `BANDWIDTH` en el `#EXT-X-STREAM-INF` es incoherente y confunde al ABR. El JSON igualó `avg := max` (sin inventar) → 5 desviaciones documentadas | Corregir `X50` (avg) para que sea `≈ max × avg_bandwidth_ratio` (0,75–0,78, ya declarado en cada perfil) o intercambiar las columnas si están cruzadas | El JSON podrá volver a los valores de la hoja y la desviación desaparece |
| **E-4** | **HIGH** | **`C37` vs `C350`** (P1) | La hoja se contradice **dentro del mismo perfil**: `C37` = `hvc1.2.4.L153.B0` (códec del perfil) pero `C350` = `av01.0.15M.10,ac-3` (códec del stream). `C33` = `HVC1` respalda a `C37` | El JSON no puede coincidir con ambas. D-22 fija `C37`; el JSON mantiene `hvc1.2.4.L153.B0` en `X-Stream-Codecs` → **1 desviación permanente** frente a `C350` (y AV1 8K está prohibido por doctrina). Bajo `C350`, P1 declararía 8K AV1 con `settings.resolution` 4K ⇒ otra incoherencia | Decidir la verdad de P1 y **corregir la celda perdedora**: si P1 es 4K HEVC (D-22) → `C350` = `hvc1.2.4.L153.B0,ac-3`; si P1 es AV1 8K → habría que cambiar también `C25`/`C48`/`C109`/`C136`/`C37` y reabrir el 8K prohibido | Al quedar `C37` y `C350` coherentes, el JSON los sigue y se cierra UNK-04 |
| **E-5** | LOW | `D8` vs `D10`/`D25` (P2) | `D8` (nombre) = `"2K QHD"` pero `D10` (quality) = `"4K"` y `D25` (resolution) = `3840x2160`. El nombre miente | El JSON tenía `name = "2K QHD"` con resolución 4K. Se corrigió el JSON a `"4K UHD"` (cadena que ya existe en `C8`) → P1 y P2 comparten etiqueta (UNK-07) | Corregir `D8` a `"4K UHD"` (o a una etiqueta única tipo `"4K QHD"`) y, si se quiere diferenciar, ajustar `D10` | Se cierra UNK-07 y cada perfil tendrá etiqueta única y veraz |
| **E-6** | LOW | fila **352** (`B352..G352`) = `X-Stream-FPS` | `B352=60` (P0, DV) · `C352=120` (P1, L153) · `D352=60` (P2, L150) | El JSON baja a 30/60/30 por capacidad de nivel (D-35) → 3 desviaciones documentadas; si el Excel no cambia, un re-export reintroduce fps imposibles en el stream | Alinear la fila 352 con la fila 32 corregida (E-1): 30/60/30/60/30/30 | Se cierran las 3 desviaciones de `X-Stream-FPS` |
| **E-7** | INFO (no es del Excel) | — | `frontend/js/ape-lab-import-helper.js:36` → `DEFAULT_PATH = 'lab_master_22.6.0.json'`, que es el artefacto **divergente** (CRYSTAL-4K-UHD, 10 diffs) mientras el export fiel es `Downloads/LAB_CALIBRATED_20260611_020645.json` (0 diffs, `6931BAF4…`) | Riesgo de que la APP cargue el artefacto equivocado por defecto (B-01). **No se ha cambiado** (es código, t11; instrucción explícita) | — (decisión de APP: apuntar `DEFAULT_PATH` al export canónico o reemplazar el artefacto del repo por el export fiel) | Cuando t11 lo decida, `lab_master` puede sustituirse por el export fiel y **todo este ticket deja de morder** |

---

## Nota de coherencia entre E-1 y E-6

El Excel tiene **dos** declaraciones de fps por perfil que ya no coinciden entre sí en el estado actual:
`fila 32` (capacidad/objetivo, 120 en todos) y `fila 352` (fps del stream, 60/120/60/60/30/30).
Tras la remediación del JSON, la única verdad level-safe es **30/60/30/60/30/30**. Cualquier corrección del Excel
debe tocar **ambas filas a la vez**; si se corrige sólo una, el re-export volverá a introducir el defecto.

## Verificación de cierre de cada ticket (para el lane Excel)

```bash
# tras corregir el Excel, re-extraer y re-medir:
node audit/alignment/2026-10-25/20-json/tools/excel_vs_json.mjs /tmp/after_excel.json   # → DIFFs por perfil
node audit/alignment/2026-10-25/90-matriz/tools/which_json_is_the_export.mjs            # → lab_master_repo.totalDiffs
node audit/alignment/2026-10-25/70-ssot-fix/tools/verify_levels.mjs \
     IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json                           # → impossible_count = 0
node audit/alignment/2026-10-25/70-ssot-fix/tools/apply_ssot_fix.mjs <nuevo_export> --dry-run   # → debe ABORTAR si el "antes" cambió
```

Criterio de cierre global: `which_json_is_the_export.mjs` → `lab_master_repo.totalDiffs === 0` **y**
`excel_vs_json.mjs` → **0 diffs** (hoy quedan 9, todas listadas en `SSOT_VERIFY.md` §8 y todas cubiertas por
E-1/E-3/E-4/E-6).

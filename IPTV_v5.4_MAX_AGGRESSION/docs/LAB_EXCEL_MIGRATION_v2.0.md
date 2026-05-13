# LAB Excel Migration v2.0 · Guía step-by-step

**Fecha**: 2026-04-28
**Versión**: APE LAB-SYNC v2.0
**Doctrina origen**: APE ENTERPRISE-GRADE Doctrine v1.0 (`php-merry-flute.md`)
**Skills aplicadas**: `iptv-excel-safe-mode` (10 reglas inviolables) · `iptv-cortex-init-mandatory`

---

## Pre-flight inviolable (hacer SIEMPRE antes de tocar el LAB)

### A. Backup timestamped del LAB.xlsm

```powershell
$xlsm = "C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\<RUTA_LAB>.xlsm"
Copy-Item $xlsm "$xlsm.bak_$(Get-Date -f yyyyMMdd_HHmmss)" -Force
```

Sin `.bak_*` previo, NO continuar.

### B. Cerrar todas las instancias de Excel

```powershell
Get-Process EXCEL -ErrorAction SilentlyContinue | ForEach-Object { $_.Id; $_.Kill() }
Remove-Item "$(Split-Path $xlsm)\~$*.xlsm" -Force -ErrorAction SilentlyContinue
```

Confirmar `Get-Process EXCEL` devuelve vacío. Si no, `Stop-Process -Force`.

### C. Verificar manifest SHA-256 (hardening contract)

```powershell
& "$repo\IPTV_v5.4_MAX_AGGRESSION\.agent\scripts\verify_lab_hash.ps1"
```

Si reporta drift, alertar al usuario antes de cualquier mutación.

---

## Modo de aplicación: 3 opciones

### Opción A · Manual via Excel UI (recomendado · seguro)

Abrir `LAB.xlsm` directamente. Modificar columnas/hojas/named ranges desde UI. Las 10 reglas Excel SAFE-MODE no aplican (UI es safe por sí mismo).

**Tiempo estimado**: 60–90 minutos para las 7 hojas.

### Opción B · Macro VBA intra-Excel (medio · safe si se importa correctamente)

Importar los 3 .bas que vienen en `docs/LAB_VBA_MACROS/`:
1. `validateLabCoherence.bas`
2. `exportPrismaConfig.bas`
3. `btnGenerateAudited_v2_extension.bas`

Las macros corren dentro del workbook abierto (no COM externo) — no necesitan `ReleaseComObject`.

**Pasos**:
1. Abrir LAB.xlsm.
2. ALT+F11 → Insert → Module → File > Import File → seleccionar cada .bas.
3. ALT+F11 → ejecutar `validateLabCoherence` desde el editor o asignar a botón.
4. Si la audit aún reporta FAIL es porque las hojas necesitas crear/modificar (Opción A o C).

### Opción C · Automation PowerShell COM (avanzado · sigue las 10 reglas)

Solo si tienes que automatizar la creación de columnas/named ranges en lote. Usar el canonical skeleton del Excel SAFE-MODE Protocol.

**ADVERTENCIA**: violar cualquiera de las 10 reglas corrompe `LAB.xlsm`. Lee `iptv-excel-safe-mode` skill antes.

```powershell
# Canonical skeleton — adaptar para inyección de columnas PRISMA
$xlsm = "C:\path\LAB.xlsm"
Copy-Item $xlsm "$xlsm.bak_$(Get-Date -f yyyyMMdd_HHmmss)" -Force
Remove-Item "$(Split-Path $xlsm)\~$*.xlsm" -Force -EA SilentlyContinue

$excel = $null; $wb = $null; $ws = $null
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $excel.AskToUpdateLinks = $false
    $excel.EnableEvents = $false
    $excel.ScreenUpdating = $false

    $wb = $excel.Workbooks.Open($xlsm, 0, $false)
    $ws = $wb.Worksheets.Item("01_CANALES")

    # ── Mutación: añadir columnas PRISMA ────────────────────────────
    # Buscar última columna usada
    $lastCol = $ws.Cells(1, $ws.Columns.Count).End(-4159).Column  # xlToLeft

    $prismaCols = @(
        "prisma_lcevc_enabled",
        "prisma_hdr10plus_enabled",
        "prisma_ai_sr_enabled",
        "prisma_quantum_pixel_enabled",
        "prisma_fake_4k_upscaler_enabled",
        "prisma_cmaf_enabled",
        "prisma_floor_lock_strict",
        "prisma_transcode_enabled"
    )

    for ($i = 0; $i -lt $prismaCols.Length; $i++) {
        $ws.Cells(1, $lastCol + 1 + $i).Value = $prismaCols[$i]
    }

    $wb.Save()
}
finally {
    if ($ws)    { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($ws) }
    if ($wb)    { $wb.Close($false); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wb) }
    if ($excel) { $excel.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
    [GC]::Collect(); [GC]::WaitForPendingFinalizers()
    [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
```

---

## Las 7 hojas del LAB Excel a modificar/crear

### Hoja `01_CANALES` (modificar)

Añadir 8 columnas PRISMA-aware DNA al final del header row:

| Columna | Tipo | Default si vacío | Validation list |
|---|---|---|---|
| `prisma_lcevc_enabled` | TRUE/FALSE | TRUE para HEVC, FALSE para AVC | `TRUE;FALSE` |
| `prisma_hdr10plus_enabled` | TRUE/FALSE | igual a `hdr10_plus_enabled` ya existente | `TRUE;FALSE` |
| `prisma_ai_sr_enabled` | TRUE/FALSE | TRUE para perfiles P3-P5 | `TRUE;FALSE` |
| `prisma_quantum_pixel_enabled` | TRUE/FALSE | TRUE si `hdr_profile != "sdr"` | `TRUE;FALSE` |
| `prisma_fake_4k_upscaler_enabled` | TRUE/FALSE | TRUE si etiquetado 4K + bandwidth<15M | `TRUE;FALSE` |
| `prisma_cmaf_enabled` | TRUE/FALSE | TRUE para todos | `TRUE;FALSE` |
| `prisma_floor_lock_strict` | TRUE/FALSE | TRUE para premium (Sky Sports, beIN) | `TRUE;FALSE` |
| `prisma_transcode_enabled` | TRUE/FALSE | FALSE default · TRUE en canales premium opt-in | `TRUE;FALSE` |

**Validation list** (regla 6, regla 7): para cada columna, seleccionar todo el rango de datos → Data → Data Validation → Allow: List → Source: `TRUE;FALSE` (separador `;`, NO `,`).

### Hoja `04_PERFILES_APE` (modificar)

Añadir 3 columnas:

| Columna | Tipo | Default por perfil |
|---|---|---|
| `prisma_boost_multiplier` | número decimal | P0=2.0 P1=2.0 P2=2.0 P3=1.5 P4=1.5 P5=1.2 |
| `prisma_zap_grace_seconds` | entero | 30 (todos) |
| `prisma_floor_min_bandwidth_bps` | entero | P0=15000000 P1=15000000 P2=15000000 P3=8000000 P4=8000000 P5=4000000 |
| `prisma_target_bandwidth_bps` | entero | P0=80000000 P1=50000000 P2=30000000 P3=12000000 P4=8000000 P5=5000000 |

**Validation list** `prisma_boost_multiplier`: `1.0;1.2;1.5;1.7;2.0;2.5;3.0`.

### Hoja `12_VLCOPT_DIRECTIVES` (modificar)

Añadir 11 directivas runtime que el generator JS `m3u8-typed-arrays-ultimate.js` debe emitir per canal:

```
adaptive-minbw={prisma.bitrate_floor}
adaptive-maxwidth=3840
adaptive-maxheight=2160
adaptive-logic=highest
adaptive-maxbw=999999999
preferred-resolution=-1
network-caching=300000
prefetch-buffer-size=300000000
prefetch-read-size=128000000
live-caching=9000
adaptive-cache-size=300000
```

`{prisma.bitrate_floor}` se resuelve en runtime via hoja 32_PLACEHOLDERS_MAP.

### Hoja `13_KODIPROP_DIRECTIVES` (modificar)

Añadir 7 directivas:

```
inputstream.adaptive.min_bandwidth={prisma.bitrate_floor}
inputstream.adaptive.initial_bandwidth=20000000
inputstream.adaptive.max_bandwidth=999999999
inputstream.adaptive.stream_selection_type=fixed
inputstream.adaptive.preferred_video_resolution=2160
inputstream.adaptive.live_delay=0
inputstream.adaptive.hdr_color_conversion=true
```

### Hoja `15_FLOOR_LOCK_CONFIG` (NUEVA)

Estructura simple key-value (column A = key, column B = value):

```
floor_lock_enabled                              | TRUE
floor_lock_min_bandwidth_p0                     | 15000000
floor_lock_min_bandwidth_p1                     | 15000000
floor_lock_min_bandwidth_p2                     | 15000000
floor_lock_min_bandwidth_p3                     | 8000000
floor_lock_min_bandwidth_p4                     | 8000000
floor_lock_min_bandwidth_p5                     | 4000000
floor_lock_min_bandwidth_default                | 8000000
floor_lock_passthrough_when_unreachable         | TRUE
floor_lock_log_unreachable_to_widget            | TRUE
x_max_bitrate_upstream_header                   | 20000000
x_min_bitrate_upstream_header                   | 15000000
tcp_initcwnd_target                             | 400
tcp_initrwnd_target                             | 400
tcp_notsent_lowat                               | 131072
tcp_rto_min_lock_ms                             | 40
```

### Hoja `16_SENTINEL_PROVIDERS` (NUEVA)

Una fila por upstream host. Columnas: `host`, `ua_pool` (CSV), `referer`, `origin`, `max_connections`, `backoff_base_seconds`, `backoff_max_seconds`, `creds_validation_endpoint`, `session_affinity_required`.

Datos seed iniciales en `vps/prisma/config/sentinel_providers_map.json` (template).

### Hoja `17_TELESCOPE_THRESHOLDS` (NUEVA)

Estructura key-value (path.dotted = key):

```
level1_rolling_window.samples_count             | 12
level1_rolling_window.window_ms                 | 1200
level1_rolling_window.ewma_alpha                | 0.3
level2_snapshot.interval_seconds                | 10
level2_snapshot.history_window_hours            | 3
predictive_triggers.ttfb_rising_threshold_ms    | 500
predictive_triggers.ttfb_rising_consecutive_samples | 3
predictive_triggers.ttfb_slope_threshold_ms_per_sample | 50
predictive_triggers.buffer_critical_seconds     | 5
predictive_triggers.jitter_threshold_ms         | 50
predictive_triggers.packet_loss_warning_pct     | 1.0
predictive_triggers.packet_loss_critical_pct    | 2.0
predictive_triggers.frame_drops_per_second_warning | 5
failback_triggers.sustained_throughput_above_floor_seconds | 30
failback_triggers.sustained_throughput_above_floor_multiplier | 1.2
qoe_score_weights.throughput_health_weight      | 30
qoe_score_weights.ttfb_health_weight            | 15
qoe_score_weights.packet_loss_weight            | 10
qoe_score_weights.buffer_health_weight          | 20
qoe_score_weights.bitrate_ratio_weight          | 15
qoe_score_weights.frame_drops_health_weight     | 10
```

### Hoja `18_ADB_PAYLOAD_INJECTOR` (NUEVA)

Una fila por setting ADB. Columnas: `setting_namespace` (global/secure/system), `setting_key`, `target_value`, `category` (display/performance/power/network/audio), `notes`.

Seed: 24 settings del `prisma_adb_daemon.sh` ya desplegado.

### Hoja `32_PLACEHOLDERS_MAP` (modificar)

Añadir 6 filas:

| Placeholder | Resolves To | Source |
|---|---|---|
| `{prisma.bitrate_floor}` | `=VLOOKUP(channel.profile, '04_PERFILES_APE'!A:F, 6, FALSE)` | hoja 04 col `prisma_floor_min_bandwidth_bps` |
| `{prisma.boost_multiplier}` | similar VLOOKUP | hoja 04 col `prisma_boost_multiplier` |
| `{prisma.zap_grace}` | similar VLOOKUP | hoja 04 col `prisma_zap_grace_seconds` |
| `{prisma.lanes_default}` | concatena 6 columnas como JSON | hoja 01 col `prisma_*_enabled` |
| `{prisma.floor_lock_strict}` | `=IF(channel.prisma_floor_lock_strict, "true", "false")` | hoja 01 col `prisma_floor_lock_strict` |
| `{prisma.target_bandwidth}` | `=VLOOKUP(channel.profile, '04_PERFILES_APE'!A:G, 7, FALSE)` | hoja 04 col `prisma_target_bandwidth_bps` |

### Hoja `99_AUDIT_REPORT` (NUEVA · auto-generada)

NO se modifica manualmente. Es output de `validateLabCoherence` macro.

### Hoja `00_NETFLIX_PARITY_AUDIT` (NUEVA · futuro)

Tabla maestra Netflix-grade compliance. Documentada en `php-merry-flute.md` doctrine. Pendiente Stage 5.

---

## Named Ranges nuevos

Crear via Insert → Name → Define (o Formulas → Name Manager):

| Name | RefersTo (A1 ONLY · regla 8) |
|---|---|
| `prisma_lane_states` | `='ListasMaestras'!$A$1:$A$4` (valores: `on;off;auto;inherit`) |
| `prisma_boost_multipliers` | `='ListasMaestras'!$B$1:$B$7` (valores: `1.0;1.2;1.5;1.7;2.0;2.5;3.0`) |
| `prisma_floor_values_mbps` | `='ListasMaestras'!$C$1:$C$8` (valores: `2;4;8;13;15;17;20;25`) |
| `prisma_lanes` | `='ListasMaestras'!$D$1:$D$6` (valores: `cmaf;lcevc;hdr10plus;ai_sr;quantum_pixel;fake_4k_upscaler`) |

**Verificar**: `Names("prisma_lane_states").RefersTo` debe NO contener `R1C1` ni `RC` (regla 8).

---

## Validation lists con `;` separator (regla 6 inviolable)

Locale ES-ES usa `,` como separador decimal → si pones `,` en Validation list se corrompe.

**ANTES**: para cada celda con dropdown, eliminar Validation existente:

```vba
On Error Resume Next
Range("F2:F1000").Validation.Delete
On Error GoTo 0
```

**DESPUÉS**: añadir nueva con `;` o Named Range:

```vba
Range("F2:F1000").Validation.Add Type:=xlValidateList, _
    Operator:=xlBetween, _
    Formula1:="=prisma_lane_states"
```

NUNCA `Formula1:="on,off,auto,inherit"` (corrompe).

---

## Flujo end-to-end después de migration

1. **Aplicar las 7 hojas** según la guía (Opción A manual recomendada).
2. **Crear los 4 named ranges** PRISMA con A1 notation.
3. **Importar las 3 macros VBA** desde `docs/LAB_VBA_MACROS/`.
4. **Ejecutar `validateLabCoherence`** → revisar hoja 99_AUDIT_REPORT.
5. **Si todo PASS**, ejecutar `exportPrismaConfig` → genera 5 JSONs en `vps/prisma/config/`.
6. **SCP los JSONs al VPS**:
   ```powershell
   scp vps\prisma\config\*.json root@178.156.147.234:/var/www/html/prisma/config/
   ssh root@178.156.147.234 "chmod 644 /var/www/html/prisma/config/*.json"
   ```
   (regla `chmod 644` para que nginx worker pueda leer · documentado en memoria persistente).
7. **Ejecutar smoke tests LS1–LS6** en `scripts/smoke_lab_sync/`.
8. **Si PASS**, integrar `BeforeGenerateGuardrail()` en `btnGenerateAudited` (instrucción en `btnGenerateAudited_v2_extension.bas`).
9. **Generar lista** vía botón modificado · validation pre-gen blocks issues.
10. **Subir lista al VPS** vía gateway-manager.js standard flow.

---

## Reversión

Si la migration causa drift no deseado:

1. Restaurar `LAB.xlsm.bak_<timestamp>` más reciente.
2. Borrar JSONs `vps/prisma/config/*.json` del VPS (PRISMA cae a hardcoded fallback automáticamente).
3. NGINX no necesita restart — los Lua leen JSON con cache TTL 300s y caen a hardcoded.
4. Validar con canal real Fire TV que reproducción sigue intacta.

Sin pasos destructivos. La migration es 100% reversible.

---

## Cross-references

- Skills: `iptv-excel-safe-mode`, `iptv-vps-touch-nothing`, `iptv-cortex-init-mandatory`, `iptv-omega-no-delete`.
- Memory: `feedback_excel_safe_mode_protocol.md`, `feedback_excel_list_separator_semicolon.md`, `feedback_named_range_r1c1_corruption.md`, `reference_lab_calibrated_pipeline.md`.
- Plan maestro: `php-merry-flute.md` sección "APE LAB-SYNC v2.0".

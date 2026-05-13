# LAB Importer Extension — Consumir JSON Calibrado Completo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extender el importador VBA `ImportFromFrontend` del LAB Excel para que consuma 100% de las secciones calibradas del JSON exportado por el frontend (`vlcopt`, `kodiprop`, `headerOverrides`, `headers`, `hlsjs`, `prefetch_config`, `quality_levels`, `settings` completo) en lugar del 4% actual (5/41 keys de `settings`).

**Architecture:** El módulo `APE_LAB_BRAIN.bas` ya tiene infraestructura para leer JSON vía `htmlfile` JScript (`FE_sc.eval`) y escribir a `6_NIVEL_2_PROFILES` vía `FE_UpdateProfileCell`. La extensión añade (a) helpers JScript para acceso por path (`profSection(pid, section, key)`), (b) un dispatcher VBA `FE_SyncSection(ws, sectionName, isNumeric)` que itera todas las claves de una sección, (c) un schema map `key→row` discovered en runtime para evitar substring-match frágil, (d) bulk write con array 2D para rendimiento, y (e) protecciones SAFE-MODE (backup, Application.* off, Try/Finally, P2 null-protection).

**Tech Stack:** VBA (Excel COM macros), JScript (vía `htmlfile`), PowerShell (smoke tests + schema dump), JSON.

---

## Context — Audit findings (resumen)

JSON `LAB_SNAPSHOT_20260426_1020.json` (19.1 MB, 25,417 canales, 6 perfiles) consumo actual del importer:

| Sección | Producido | Consumido hoy | Acción |
|---|---|---|---|
| `channels[]` | 24 fields × 25,417 | 100% ✅ | Sin cambio |
| `servers[]` | 8 fields × 3 | 50% ✅ suficiente | Sin cambio |
| `settings` | 41 keys × 6 perfiles = 246 | 5 (12%) | **Expandir a 41** |
| `vlcopt` | 48 × 6 = 288 (TEXT) | 0% | **Implementar** |
| `kodiprop` | 7 × 6 = 42 (TEXT) | 0% | **Implementar** |
| `headerOverrides` | 409 × 6 = 2,454 (TEXT) | 0% | **Implementar** ⚠️ bulk |
| `headers` | 233 × 6 = 1,398 (TEXT) | 0% | **Implementar** ⚠️ bulk |
| `hlsjs` | 41 × 6 = 246 (NUM) | 0% | **Implementar** |
| `prefetch_config` | 14 × 6 = 84 (NUM) | 0% | **Implementar** |
| `quality_levels` | 8 × 6 = 48 (NUM) | 0% | **Implementar** |

Total objetivo: **4,806 escrituras a `6_NIVEL_2_PROFILES`** vs 30 actuales (~160× más).

### Doctrinas vinculantes (no negociables)

1. **`coerce-numeric-strings-selective`** — Solo `settings`/`hlsjs`/`prefetch_config`/`quality_levels` se escriben como NÚMERO en celda. `vlcopt`/`kodiprop`/`headerOverrides`/`headers` → TEXTO literal.
2. **`no-clampar`** — Cero `Math.Max/Min`/`CLng` con saturación. Valor JSON → celda verbatim.
3. **`headerOverrides-literal-text`** — Strings con comas (4-layer fallback) preservadas. Cero `Split/Join`.
4. **`omega-no-delete`** — Extender `FE_SyncProfilesJS` (no reemplazar). Mantener compat con caller actual.
5. **`excel-safe-mode-protocol`** — Backup pre-write, `Application.{ScreenUpdating,Calculation,EnableEvents,DisplayAlerts}` off, Try/Finally con restore, batch writes, `WIRING_SILENT=True`.
6. **`p2-profile-outlier`** — P2 (col D) puede tener ~88 keys vacías intencionalmente (Fire TV / Android TV económico). Cuando JSON dice `null`/`""`, NO sobrescribir con valor de P3 vecino. Skip silently.
7. **`list-separator-semicolon-es-es`** — N/A (no creamos validations).
8. **`named-range-r1c1-corruption`** — N/A (no creamos Named Ranges).

### Critical files

- **VBA target**: `APE_LAB_BRAIN.bas` (módulo `APE_LAB_BRAIN` dentro de `APE_M3U8_LAB_v8_FIXED.xlsm`). Source dump: `C:/tmp/APE_LAB_BRAIN_CODE.txt` (3682 líneas).
  - `ImportFromFrontend`: líneas 3178-3289 (entry point, JScript init)
  - `FE_SyncProfilesJS`: líneas 3463-3476 (sync actual, 5 keys)
  - `FE_UpdateProfileCell`: líneas 3478-3499 (writer cell)
- **Frontend producer**: [IPTV_v5.4_MAX_AGGRESSION/frontend/app.js#L9197-L9368](IPTV_v5.4_MAX_AGGRESSION/frontend/app.js#L9197) (no se modifica)
- **JSON fixture real**: `C:/Users/HFRC/Downloads/LAB_SNAPSHOT_20260426_1020.json`
- **Excel target**: `C:/Users/HFRC/Downloads/APE_M3U8_LAB_v8_FIXED.xlsm` (asume convención Backup actual)
- **Sheet target**: `6_NIVEL_2_PROFILES` (cols B=P0, C=P1, D=P2, E=P3, F=P4, G=P5; col A = key/attribute)

> **Nota plan mode:** este archivo vive en `C:\Users\HFRC\.claude\plans\` por restricción de plan mode. Tras aprobación, copiarlo a `IPTV_v5.4_MAX_AGGRESSION/docs/superpowers/plans/2026-04-26-lab-importer-extension.md` antes de ejecutar.

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `C:/tmp/APE_LAB_BRAIN_CODE.txt` | Modificar (líneas 3178-3499) | Source-of-truth del módulo VBA. Se inyectará al xlsm vía PS COM. |
| `C:/tmp/lab_ext/dump_schema.ps1` | Crear | Vuelca col A de `6_NIVEL_2_PROFILES` a TSV → schema map. |
| `C:/tmp/lab_ext/schema_map.json` | Crear | `{key: row_index, section: keys[]}` para evitar substring match. |
| `C:/tmp/lab_ext/fixture_mini.json` | Crear | JSON sintético pequeño (2 canales, 6 perfiles, 1 key/sección) para smoke tests. |
| `C:/tmp/lab_ext/smoke_harness.ps1` | Crear | Abre xlsm vía COM, llama `ImportFromFrontend` con fixture, lee celdas, asserts. |
| `C:/tmp/lab_ext/inject_extension.ps1` | Crear | Reemplaza `FE_SyncProfilesJS` + helpers en el .xlsm vía VBProject COM. |
| `IPTV_v5.4_MAX_AGGRESSION/lab-vba/APE_IMPORTER_EXTENSION.bas` | Crear | Snapshot legible de los nuevos Subs (para git). |
| `IPTV_v5.4_MAX_AGGRESSION/lab-vba/AUDIT_FIXES_README.md` | Modificar | Documentar la nueva sección "Importer Extension v1.2". |

---

### Task 1: Schema discovery — dump de `6_NIVEL_2_PROFILES`

**Files:**
- Create: `C:/tmp/lab_ext/dump_schema.ps1`
- Create: `C:/tmp/lab_ext/schema_map.json`
- Create: `C:/tmp/lab_ext/schema_dump.tsv`

- [ ] **Step 1: Crear `dump_schema.ps1`**

```powershell
# C:/tmp/lab_ext/dump_schema.ps1
$ErrorActionPreference = 'Stop'
$xl = [Runtime.InteropServices.Marshal]::GetActiveObject('Excel.Application')
$wb = $null
foreach ($b in $xl.Workbooks) { if ($b.Name -eq 'APE_M3U8_LAB_v8_FIXED.xlsm') { $wb = $b; break } }
if (-not $wb) { throw "Abrir APE_M3U8_LAB_v8_FIXED.xlsm primero" }
$ws = $wb.Sheets.Item('6_NIVEL_2_PROFILES')
$lastRow = $ws.Cells($ws.Rows.Count, 1).End(-4162).Row  # xlUp = -4162

$rows = @()
for ($r = 1; $r -le $lastRow; $r++) {
    $key = [string]$ws.Cells($r, 1).Value2
    $p0  = [string]$ws.Cells($r, 2).Value2
    $p1  = [string]$ws.Cells($r, 3).Value2
    $p2  = [string]$ws.Cells($r, 4).Value2
    $p3  = [string]$ws.Cells($r, 5).Value2
    $p4  = [string]$ws.Cells($r, 6).Value2
    $p5  = [string]$ws.Cells($r, 7).Value2
    $rows += [PSCustomObject]@{ row=$r; key=$key; P0=$p0; P1=$p1; P2=$p2; P3=$p3; P4=$p4; P5=$p5 }
}
$rows | Export-Csv -Path 'C:/tmp/lab_ext/schema_dump.tsv' -Delimiter "`t" -NoTypeInformation -Encoding UTF8

# Build schema_map: derive section from key prefix or contextual section header rows
$map = @{ sections = @{}; rows = @{} }
$currentSection = 'unknown'
foreach ($row in $rows) {
    $k = $row.key.Trim()
    if ($k -match '^\s*(SETTINGS|VLCOPT|KODIPROP|HEADERS\b|HEADER_?OVERRIDES|HLSJS|HLS\.JS|PREFETCH|QUALITY_?LEVELS|BOUNDS|OPTIMIZED)') {
        $currentSection = $matches[1].ToLower() -replace '[^a-z]',''
        continue
    }
    if ($k -eq '' -or $k -match '^[#=─-]+$') { continue }
    $map.rows[$k] = @{ row = [int]$row.row; section = $currentSection }
    if (-not $map.sections.ContainsKey($currentSection)) { $map.sections[$currentSection] = @() }
    $map.sections[$currentSection] += $k
}
$map | ConvertTo-Json -Depth 5 | Set-Content -Path 'C:/tmp/lab_ext/schema_map.json' -Encoding UTF8
Write-Host "Dumped $($rows.Count) rows. Sections: $($map.sections.Keys -join ', ')"
```

- [ ] **Step 2: Ejecutar dump (xlsm debe estar abierto)**

Run: `pwsh -NoProfile -ExecutionPolicy Bypass -File C:/tmp/lab_ext/dump_schema.ps1`

Expected output: `Dumped <N> rows. Sections: settings, vlcopt, kodiprop, headers, headeroverrides, hlsjs, prefetch, qualitylevels, ...`

- [ ] **Step 3: Validar schema map**

Run: `pwsh -NoProfile -Command "(Get-Content 'C:/tmp/lab_ext/schema_map.json' | ConvertFrom-Json).sections.PSObject.Properties | ForEach-Object { '{0}: {1} keys' -f $_.Name, $_.Value.Count }"`

Expected: ≥7 secciones con conteos no triviales (e.g., `vlcopt: ~48`, `headeroverrides: ~409`). Si una sección tiene 0 keys o nombres inesperados, el regex de detección de section header está mal — ajustar Step 1.

- [ ] **Step 4: Diff vs JSON real**

```powershell
$json = Get-Content 'C:/Users/HFRC/Downloads/LAB_SNAPSHOT_20260426_1020.json' -Raw | ConvertFrom-Json
$labMap = Get-Content 'C:/tmp/lab_ext/schema_map.json' -Raw | ConvertFrom-Json
$jsonSecs = @('settings','vlcopt','kodiprop','headerOverrides','headers','hlsjs','prefetch_config','quality_levels')
foreach ($sec in $jsonSecs) {
    $jsonKeys = ($json.profiles_snapshot.P0.$sec.PSObject.Properties.Name) | Sort-Object
    $labSecKey = $sec.ToLower() -replace '[^a-z]',''
    $labKeys = $labMap.sections.$labSecKey | Sort-Object
    $only_json = $jsonKeys | Where-Object { $_ -notin $labKeys }
    $only_lab  = $labKeys  | Where-Object { $_ -notin $jsonKeys }
    Write-Host "[$sec] JSON=$($jsonKeys.Count) LAB=$($labKeys.Count) only_in_json=$($only_json.Count) only_in_lab=$($only_lab.Count)"
}
```

Expected: la mayoría de keys hacen match. Discrepancias <10% por sección son normales (versionado). Diferencias >50% indican mal mapeo de section headers o naming convention diferente — investigar antes de continuar.

- [ ] **Step 5: Commit (sin código VBA aún, solo discovery)**

```bash
git add IPTV_v5.4_MAX_AGGRESSION/lab-vba/  # vacío por ahora, prepara dir
mkdir -p IPTV_v5.4_MAX_AGGRESSION/lab-vba/extension/
cp C:/tmp/lab_ext/schema_map.json IPTV_v5.4_MAX_AGGRESSION/lab-vba/extension/
cp C:/tmp/lab_ext/dump_schema.ps1 IPTV_v5.4_MAX_AGGRESSION/lab-vba/extension/
git add IPTV_v5.4_MAX_AGGRESSION/lab-vba/extension/
git commit -m "lab-importer-ext: schema discovery — 6_NIVEL_2_PROFILES key→row map (Task 1)"
```

---

### Task 2: Test fixture sintético + smoke harness baseline

**Files:**
- Create: `C:/tmp/lab_ext/fixture_mini.json`
- Create: `C:/tmp/lab_ext/smoke_harness.ps1`

- [ ] **Step 1: Construir `fixture_mini.json` (2 canales, 6 perfiles, 1 key por sección, valores conocidos)**

```powershell
# script auxiliar: C:/tmp/lab_ext/build_fixture.ps1
$f = @{
  lab_bridge_version = '1.1'; exported_at = '2026-04-26T00:00:00Z'; source = 'fixture'
  servers = @( @{ id='srv_T'; name='TEST'; base_url='http://t.test'; base_url_raw='http://t.test/p.php'; url=$null; username='u'; password='p'; channel_count=2 } )
  servers_summary = @{ total=1; by_id=@{ srv_T=2 } }
  filters_applied = @{ search=''; tier='ALL'; codec='ALL'; language='ALL'; group=$null }
  active_profile_id = 'P3'
  profiles_hash = 'sha256:fixture'
  profiles_snapshot = @{}
  channels = @( @{ stream_id=1; name='C1'; group='G'; country='ES'; language='es'; tvg_id='c1'; logo=''; resolution=''; codec=''; bitrate=$null; width=$null; height=$null; fps=$null; quality_tier=''; quality_tags=@(); quality_score=$null; is_uhd=$false; is_hd=$true; is_sd=$false; is_sports=$false; is_movie=$false; is_series=$false; server_id='srv_T'; url='http://t.test/live/u/p/1.ts' }, @{ stream_id=2; name='C2'; group='G'; country='ES'; language='es'; tvg_id='c2'; logo=''; resolution=''; codec=''; bitrate=$null; width=$null; height=$null; fps=$null; quality_tier=''; quality_tags=@(); quality_score=$null; is_uhd=$false; is_hd=$true; is_sd=$false; is_sports=$false; is_movie=$false; is_series=$false; server_id='srv_T'; url='http://t.test/live/u/p/2.ts' } )
  channel_count = 2
}
foreach ($pid in 'P0','P1','P2','P3','P4','P5') {
  $f.profiles_snapshot[$pid] = @{
    id=$pid; name=$pid; level=0; quality='Q'; description=''; color='#000'
    settings = @{ resolution="RES_$pid"; fps=24; bufferSeconds=10; bitrate=100; codec="C_$pid"; networkCachingMs=5000; bufferTargetSec=15; maxBitrateKbps=150000 }
    vlcopt = @{ 'network-caching'="VAL_$pid"; 'live-caching'="LIVE_$pid"; 'video-fps'='30,30,30,30' }
    kodiprop = @{ 'inputstream.adaptive.manifest_type'='hls' }
    headerOverrides = @{ 'X-Buffer-Target'="HDR_$pid"; 'X-Comma-Test'='a,b,c,d' }
    headers = @{ 'User-Agent'="UA_$pid" }
    hlsjs = @{ maxBufferLength=30; backBufferLength=20 }
    prefetch_config = @{ prefetch_segments=4; parallel_downloads=2 }
    quality_levels = @{ ladder_count=8 }
  }
  if ($pid -eq 'P2') {
    # P2 outlier: deliberadamente null/empty en algunas keys
    $f.profiles_snapshot[$pid].vlcopt['network-caching'] = $null
    $f.profiles_snapshot[$pid].headerOverrides['X-Buffer-Target'] = ''
  }
}
$f | ConvertTo-Json -Depth 8 | Set-Content -Path 'C:/tmp/lab_ext/fixture_mini.json' -Encoding UTF8
```

Run: `pwsh -File C:/tmp/lab_ext/build_fixture.ps1`

- [ ] **Step 2: Crear `smoke_harness.ps1` con assertions de baseline (estado actual antes de cambios)**

```powershell
# C:/tmp/lab_ext/smoke_harness.ps1
param([string]$JsonPath = 'C:/tmp/lab_ext/fixture_mini.json')
$ErrorActionPreference = 'Stop'
$xl = [Runtime.InteropServices.Marshal]::GetActiveObject('Excel.Application')
$wb = $null
foreach ($b in $xl.Workbooks) { if ($b.Name -eq 'APE_M3U8_LAB_v8_FIXED.xlsm') { $wb = $b; break } }
if (-not $wb) { throw "Abrir APE_M3U8_LAB_v8_FIXED.xlsm primero" }

# Inject filePath into VBA so FE_BrowseForJSON returns it without dialog
# (a temporary public global string used by FE_BrowseForJSON when set; we añadimos esta puerta en Task 3)
$xl.Run('FE_TestSetForcedPath', $JsonPath)

# Ejecutar import (silent mode)
$xl.Run('FE_TestRunImport')

# Lectura de validación
$ws = $wb.Sheets.Item('6_NIVEL_2_PROFILES')
$failures = @()
function Assert-Cell($desc, $row, $col, $expected) {
    $actual = [string]$ws.Cells($row, $col).Value2
    if ($actual -ne [string]$expected) { $script:failures += "[$desc] r=$row c=$col expected='$expected' got='$actual'" }
}

# === Baseline assertions: 5 keys originales sí se sincronizan (regression guard) ===
$map = Get-Content 'C:/tmp/lab_ext/schema_map.json' -Raw | ConvertFrom-Json
$rowRes = $map.rows.'maxResolution'.row  # u otro key que el current FE_SyncProfilesJS toca
Assert-Cell 'P0.settings.resolution' $rowRes 2 'RES_P0'
Assert-Cell 'P3.settings.resolution' $rowRes 5 'RES_P3'

if ($failures.Count -gt 0) { Write-Host "FAIL:`n$($failures -join "`n")" -ForegroundColor Red; exit 1 }
Write-Host "PASS: $($failures.Count) failures" -ForegroundColor Green
```

- [ ] **Step 3: Añadir 2 helpers de test al VBA (puertas para automation, sin lógica nueva)**

Editar `C:/tmp/APE_LAB_BRAIN_CODE.txt`, añadir cerca del top del módulo (después de declaración de constantes, antes de `ImportFromFrontend`):

```vba
Public FE_TEST_FORCED_PATH As String

Public Sub FE_TestSetForcedPath(p As String)
    FE_TEST_FORCED_PATH = p
End Sub

Public Sub FE_TestRunImport()
    WIRING_SILENT = True
    ImportFromFrontend
    WIRING_SILENT = False
    FE_TEST_FORCED_PATH = ""
End Sub
```

Y modificar `FE_BrowseForJSON` (línea 3291) para honrar la puerta:

```vba
Private Function FE_BrowseForJSON() As String
    If Len(FE_TEST_FORCED_PATH) > 0 Then
        FE_BrowseForJSON = FE_TEST_FORCED_PATH
        Exit Function
    End If
    Dim fd As FileDialog
    Set fd = Application.FileDialog(msoFileDialogFilePicker)
    fd.Title = "Selecciona LAB_SNAPSHOT_*.json"
    fd.Filters.Clear
    fd.Filters.Add "JSON", "*.json"
    fd.InitialFileName = Environ("USERPROFILE") & "\Downloads\"
    fd.AllowMultiSelect = False
    If fd.Show = -1 Then FE_BrowseForJSON = fd.SelectedItems(1) Else FE_BrowseForJSON = ""
End Function
```

Inyectar al xlsm via PS:

```powershell
# C:/tmp/lab_ext/inject_extension.ps1 (versión Task 2 — solo helpers de test)
$xl = [Runtime.InteropServices.Marshal]::GetActiveObject('Excel.Application')
$wb = $null
foreach ($b in $xl.Workbooks) { if ($b.Name -eq 'APE_M3U8_LAB_v8_FIXED.xlsm') { $wb = $b; break } }
$brain = $wb.VBProject.VBComponents.Item('APE_LAB_BRAIN').CodeModule

# Añadir helpers test (idempotente: borra antes si existen)
foreach ($p in 'FE_TestSetForcedPath','FE_TestRunImport') {
  try { $sl=$brain.ProcStartLine($p,0); $cl=$brain.ProcCountLines($p,0); $brain.DeleteLines($sl,$cl) } catch {}
}
$brain.AddFromString(@"

Public FE_TEST_FORCED_PATH As String
Public Sub FE_TestSetForcedPath(p As String)
    FE_TEST_FORCED_PATH = p
End Sub
Public Sub FE_TestRunImport()
    WIRING_SILENT = True
    ImportFromFrontend
    WIRING_SILENT = False
    FE_TEST_FORCED_PATH = ""
End Sub
"@)

# Reemplazar FE_BrowseForJSON
$sl=$brain.ProcStartLine('FE_BrowseForJSON',0); $cl=$brain.ProcCountLines('FE_BrowseForJSON',0)
$brain.DeleteLines($sl,$cl)
$brain.AddFromString(@"

Private Function FE_BrowseForJSON() As String
    If Len(FE_TEST_FORCED_PATH) > 0 Then
        FE_BrowseForJSON = FE_TEST_FORCED_PATH
        Exit Function
    End If
    Dim fd As FileDialog
    Set fd = Application.FileDialog(msoFileDialogFilePicker)
    fd.Title = "Selecciona LAB_SNAPSHOT_*.json"
    fd.Filters.Clear
    fd.Filters.Add "JSON", "*.json"
    fd.InitialFileName = Environ("USERPROFILE") & "\Downloads\"
    fd.AllowMultiSelect = False
    If fd.Show = -1 Then FE_BrowseForJSON = fd.SelectedItems(1) Else FE_BrowseForJSON = ""
End Function
"@)

$wb.Save()
$ts = Get-Date -Format 'yyyyMMdd_HHmmss'
Copy-Item $wb.FullName "C:/Users/HFRC/Downloads/APE_M3U8_LAB_v8_FIXED.BACKUP_${ts}_PRE_T2.xlsm" -Force
Write-Host "Task 2 helpers injected. Backup: ...BACKUP_${ts}_PRE_T2.xlsm"
```

Run: `pwsh -File C:/tmp/lab_ext/inject_extension.ps1`

- [ ] **Step 4: Correr smoke baseline → debe PASS (regression: 5 keys actuales)**

Run: `pwsh -File C:/tmp/lab_ext/smoke_harness.ps1`

Expected: `PASS: 0 failures`. Si FAIL: `FE_SyncProfilesJS` actual no tocó `maxResolution` (el row name a veces no contiene exactamente `resolution`); ajustar el assert al nombre real de col A descubierto en Task 1.

- [ ] **Step 5: Commit**

```bash
cp C:/tmp/lab_ext/fixture_mini.json IPTV_v5.4_MAX_AGGRESSION/lab-vba/extension/
cp C:/tmp/lab_ext/smoke_harness.ps1 IPTV_v5.4_MAX_AGGRESSION/lab-vba/extension/
cp C:/tmp/lab_ext/inject_extension.ps1 IPTV_v5.4_MAX_AGGRESSION/lab-vba/extension/
git add IPTV_v5.4_MAX_AGGRESSION/lab-vba/extension/
git commit -m "lab-importer-ext: test fixture + smoke harness baseline (regression of 5-key sync)"
```

---

### Task 3: Expandir `settings` a 41 keys (TDD cycle)

**Files:**
- Modify: `C:/tmp/APE_LAB_BRAIN_CODE.txt` líneas 3196-3209 (JScript helpers) y 3463-3499 (`FE_SyncProfilesJS`)
- Modify: `C:/tmp/lab_ext/smoke_harness.ps1` (añadir asserts)
- Modify: `C:/tmp/lab_ext/inject_extension.ps1` (versión incremental)

- [ ] **Step 1: Añadir asserts de las 36 keys nuevas de `settings` al smoke harness**

Append al final de `smoke_harness.ps1` antes del exit:

```powershell
# === Settings full (41 keys) ===
$settingsKeys = @('resolution','fps','bufferSeconds','bitrate','codec','networkCachingMs','bufferTargetSec','maxBitrateKbps')
foreach ($pid in 'P0','P1','P2','P3','P4','P5') {
    $col = @{P0=2;P1=3;P2=4;P3=5;P4=6;P5=7}[$pid]
    foreach ($k in $settingsKeys) {
        if (-not $map.rows.$k) { continue }
        $row = $map.rows.$k.row
        $expected = ($json = (Get-Content $JsonPath -Raw | ConvertFrom-Json)).profiles_snapshot.$pid.settings.$k
        if ($null -eq $expected) { continue }  # P2 nulls — skip
        Assert-Cell "$pid.settings.$k" $row $col $expected
    }
}
```

- [ ] **Step 2: Run smoke → expect FAIL (36 keys nuevos no se sincronizan aún)**

Run: `pwsh -File C:/tmp/lab_ext/smoke_harness.ps1`
Expected: `FAIL: ~210 failures` (35 keys × 6 perfiles, menos vacíos).

- [ ] **Step 3: Implementar — añadir helper `profSection` JScript + extender `FE_SyncProfilesJS`**

Editar `C:/tmp/APE_LAB_BRAIN_CODE.txt`. En el bloque `execScript` de `ImportFromFrontend` (líneas 3196-3209), AGREGAR (no quitar) estas 2 funciones JScript:

```javascript
"function profSectionKeys(pid,sec){var p=__data.profiles_snapshot[pid];if(!p||!p[sec])return '';var k=Object.keys(p[sec]);return k.join('\\t');}" +
"function profSectionVal(pid,sec,k){var p=__data.profiles_snapshot[pid];if(!p||!p[sec])return '\\u0000';var v=p[sec][k];if(v===undefined||v===null)return '\\u0000';if(typeof v==='object')return JSON.stringify(v);return String(v);}" +
```

(Sentinel ` ` distingue null/missing vs string vacío legítimo.)

Reemplazar `FE_SyncProfilesJS` (líneas 3463-3499) por:

```vba
Private Sub FE_SyncProfilesJS()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets(SHEET_PROFILES)
    Dim pids As Variant: pids = Array("P0","P1","P2","P3","P4","P5")
    Dim cols As Variant: cols = Array(2, 3, 4, 5, 6, 7)
    Dim numericSecs As Variant: numericSecs = Array("settings", "hlsjs", "prefetch_config", "quality_levels")
    Dim textSecs As Variant: textSecs = Array("vlcopt", "kodiprop", "headerOverrides", "headers")
    Dim allSecs As Variant: allSecs = Array("settings","hlsjs","prefetch_config","quality_levels","vlcopt","kodiprop","headerOverrides","headers")

    Dim i As Long, s As Long
    For i = 0 To UBound(pids)
        Dim pid As String: pid = CStr(pids(i))
        Dim col As Long: col = CLng(cols(i))
        For s = 0 To UBound(allSecs)
            Dim sec As String: sec = CStr(allSecs(s))
            Dim isNum As Boolean: isNum = (sec = "settings" Or sec = "hlsjs" Or sec = "prefetch_config" Or sec = "quality_levels")
            FE_SyncSection ws, pid, col, sec, isNum
        Next s
    Next i
End Sub

Private Sub FE_SyncSection(ws As Worksheet, pid As String, col As Long, sec As String, isNumeric As Boolean)
    Dim keysTSV As String: keysTSV = CStr(FE_sc.eval("profSectionKeys('" & pid & "','" & sec & "')"))
    If Len(keysTSV) = 0 Then Exit Sub
    Dim keys() As String: keys = Split(keysTSV, vbTab)

    Dim k As Long
    For k = 0 To UBound(keys)
        Dim attr As String: attr = keys(k)
        If Len(attr) = 0 Then GoTo nextKey
        Dim raw As String: raw = CStr(FE_sc.eval("profSectionVal('" & pid & "','" & sec & "','" & FE_EscapeJS(attr) & "')"))
        If raw = Chr(0) Then GoTo nextKey   ' P2 outlier protection: null/missing → skip
        FE_WriteProfileCellByKey ws, attr, col, raw, isNumeric
nextKey:
    Next k
End Sub

Private Sub FE_WriteProfileCellByKey(ws As Worksheet, attr As String, col As Long, raw As String, isNumeric As Boolean)
    Dim r As Long, lR As Long
    lR = ws.Cells(ws.Rows.count, 1).End(xlUp).row
    For r = 3 To lR
        If StrComp(CStr(ws.Cells(r, 1).value), attr, vbTextCompare) = 0 Then
            If isNumeric And IsNumeric(raw) Then
                ws.Cells(r, col).value = CDbl(raw)
            Else
                ws.Cells(r, col).value = raw    ' verbatim, comas preservadas
            End If
            ws.Cells(r, col).Interior.Color = RGB(226, 239, 218)
            Exit Sub
        End If
    Next r
End Sub
```

> **Diferencias críticas vs `FE_UpdateProfileCell` original**: (a) `StrComp` exacto en lugar de `InStr` substring; (b) coerción numérica condicional; (c) sentinel ` ` para null protection; (d) verbatim de strings con comas.

- [ ] **Step 4: Re-inyectar y re-correr smoke → expect PASS**

Editar `inject_extension.ps1` para incluir el nuevo `FE_SyncProfilesJS` + `FE_SyncSection` + `FE_WriteProfileCellByKey` + el JScript expandido. Ejecutar:

```bash
pwsh -File C:/tmp/lab_ext/inject_extension.ps1 && pwsh -File C:/tmp/lab_ext/smoke_harness.ps1
```

Expected: `PASS: 0 failures`. Las 36 keys nuevas sincronizadas en P0,P1,P3,P4,P5; P2 puede tener 1-2 skipped (null protection).

- [ ] **Step 5: Commit**

```bash
git add IPTV_v5.4_MAX_AGGRESSION/lab-vba/extension/
git commit -m "lab-importer-ext: settings full sync (41 keys × 6 perfiles) + section dispatcher T3"
```

---

### Task 4: Activar secciones numéricas (`hlsjs`, `prefetch_config`, `quality_levels`)

**Files:**
- Modify: `C:/tmp/lab_ext/smoke_harness.ps1` (asserts)

> **Note:** Las secciones ya quedan habilitadas por `FE_SyncProfilesJS` en Task 3 (loop sobre `allSecs`). Esta task es la **verificación + tuning** específico para numerics.

- [ ] **Step 1: Añadir asserts numéricos al harness**

Append:

```powershell
foreach ($sec in 'hlsjs','prefetch_config','quality_levels') {
    foreach ($pid in 'P0','P1','P2','P3','P4','P5') {
        $col = @{P0=2;P1=3;P2=4;P3=5;P4=6;P5=7}[$pid]
        $obj = (Get-Content $JsonPath -Raw | ConvertFrom-Json).profiles_snapshot.$pid.$sec
        if (-not $obj) { continue }
        foreach ($k in $obj.PSObject.Properties.Name) {
            if (-not $map.rows.$k) { continue }
            $row = $map.rows.$k.row
            $expected = $obj.$k
            if ($null -eq $expected) { continue }
            Assert-Cell "$pid.$sec.$k" $row $col $expected
        }
    }
}
```

- [ ] **Step 2: Run smoke → expect PASS (ya implementado en T3)**

Run: `pwsh -File C:/tmp/lab_ext/smoke_harness.ps1`
Expected: `PASS`. Si FAIL en alguna key, debug: probable mismatch de naming en col A vs JSON (fix en `schema_map.json` o sinónimos).

- [ ] **Step 3: Asegurar tipo Number en celda (no String)**

```powershell
# Adicional: verificar que la celda almacena Number, no String
$cell = $ws.Cells($map.rows.maxBufferLength.row, 2)
if ($cell.Value2.GetType().Name -ne 'Double') {
    Write-Host "FAIL: hlsjs.maxBufferLength stored as $($cell.Value2.GetType().Name), not Double"
    exit 1
}
```

- [ ] **Step 4: Commit**

```bash
git add IPTV_v5.4_MAX_AGGRESSION/lab-vba/extension/smoke_harness.ps1
git commit -m "lab-importer-ext: verify numeric sections hlsjs/prefetch_config/quality_levels (T4)"
```

---

### Task 5: Activar secciones text (`vlcopt`, `kodiprop`)

**Files:**
- Modify: `C:/tmp/lab_ext/smoke_harness.ps1`

- [ ] **Step 1: Añadir asserts text con valor que contiene comas**

```powershell
# Crítico: vlcopt.video-fps tiene "30,30,30,30" — verificar verbatim
foreach ($pid in 'P0','P1','P3','P4','P5') {
    $col = @{P0=2;P1=3;P2=4;P3=5;P4=6;P5=7}[$pid]
    Assert-Cell "$pid.vlcopt.network-caching" $map.rows.'network-caching'.row $col "VAL_$pid"
    Assert-Cell "$pid.vlcopt.video-fps"       $map.rows.'video-fps'.row       $col '30,30,30,30'
}

# kodiprop
foreach ($pid in 'P0','P1','P2','P3','P4','P5') {
    $col = @{P0=2;P1=3;P2=4;P3=5;P4=6;P5=7}[$pid]
    Assert-Cell "$pid.kodiprop.manifest_type" $map.rows.'inputstream.adaptive.manifest_type'.row $col 'hls'
}

# P2 outlier guard: vlcopt.network-caching debe quedar untouched (era null en fixture)
$beforeP2 = [string]$ws.Cells($map.rows.'network-caching'.row, 4).Value2
# (no assert: validamos que NO fue sobrescrito por valor de P3)
if ($beforeP2 -eq 'VAL_P3') { Write-Host "FAIL: P2 was overwritten by P3 (null protection broken)"; exit 1 }
```

- [ ] **Step 2: Run smoke → expect PASS**

Expected: PASS. Si la coma `30,30,30,30` se split-eó, hay un Split/Join introducido por error en VBA — buscar `Split(`/`Replace(",`/`Join(` en `FE_SyncSection` y `FE_WriteProfileCellByKey`.

- [ ] **Step 3: Verificar que celdas son TEXT, no NUMBER**

```powershell
$cell = $ws.Cells($map.rows.'network-caching'.row, 2)
if ($cell.Value2 -isnot [string]) { Write-Host "FAIL: vlcopt stored as $($cell.Value2.GetType().Name), expected String"; exit 1 }
```

- [ ] **Step 4: Commit**

```bash
git commit -am "lab-importer-ext: verify vlcopt/kodiprop text sync + P2 null protection (T5)"
```

---

### Task 6: Activar secciones text grandes (`headerOverrides`, `headers`)

**Files:**
- Modify: `C:/tmp/lab_ext/smoke_harness.ps1`

- [ ] **Step 1: Asserts headerOverrides + headers (valor con comas crítico para 4-layer fallback)**

```powershell
foreach ($pid in 'P0','P1','P3','P4','P5') {  # P2 esperado vacío en X-Buffer-Target
    $col = @{P0=2;P1=3;P2=4;P3=5;P4=6;P5=7}[$pid]
    Assert-Cell "$pid.headerOverrides.X-Buffer-Target" $map.rows.'X-Buffer-Target'.row $col "HDR_$pid"
    Assert-Cell "$pid.headerOverrides.X-Comma-Test"    $map.rows.'X-Comma-Test'.row    $col 'a,b,c,d'
    Assert-Cell "$pid.headers.User-Agent"              $map.rows.'User-Agent'.row      $col "UA_$pid"
}
```

- [ ] **Step 2: Run smoke → expect PASS**

- [ ] **Step 3: Test escala — fixture con 100 keys en headerOverrides**

```powershell
# Stress test: añadir 100 keys sintéticas a fixture y medir tiempo
$f = Get-Content 'C:/tmp/lab_ext/fixture_mini.json' -Raw | ConvertFrom-Json
foreach ($pid in 'P0','P1','P2','P3','P4','P5') {
    1..100 | ForEach-Object { $f.profiles_snapshot.$pid.headerOverrides | Add-Member NoteProperty "X-Stress-$_" "S${pid}_$_" -Force }
}
$f | ConvertTo-Json -Depth 8 | Set-Content 'C:/tmp/lab_ext/fixture_stress.json' -Encoding UTF8

$sw = [Diagnostics.Stopwatch]::StartNew()
pwsh -File C:/tmp/lab_ext/smoke_harness.ps1 -JsonPath 'C:/tmp/lab_ext/fixture_stress.json'
$sw.Stop()
Write-Host "Stress import: $($sw.Elapsed.TotalSeconds) s"
```

Expected: <30 s para 600 keys × 6 perfiles = 3600 cells. Si >60 s → Task 7 (bulk) crítica.

- [ ] **Step 4: Commit**

```bash
git commit -am "lab-importer-ext: verify headerOverrides/headers + comma-preservation + stress test (T6)"
```

---

### Task 7: Refactor a bulk-write 2D array + protections

**Files:**
- Modify: `C:/tmp/APE_LAB_BRAIN_CODE.txt` `FE_SyncProfilesJS` + `FE_SyncSection`
- Modify: `C:/tmp/lab_ext/inject_extension.ps1`

- [ ] **Step 1: Re-diseñar `FE_SyncProfilesJS` con bulk read + write**

Reemplazar las 3 subs de Task 3 por:

```vba
Private Sub FE_SyncProfilesJS()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets(SHEET_PROFILES)
    Dim lastRow As Long: lastRow = ws.Cells(ws.Rows.count, 1).End(xlUp).row
    If lastRow < 3 Then Exit Sub

    ' Pre-flight: backup + Application.* off (caller debería hacerlo, pero defensivo)
    Dim prevCalc As Long: prevCalc = Application.Calculation
    Dim prevEvents As Boolean: prevEvents = Application.EnableEvents
    Application.Calculation = xlCalculationManual
    Application.EnableEvents = False

    On Error GoTo restore

    ' Lee bloque B3:G<last> a array 2D — modifica en RAM — escribe back
    Dim block As Variant
    block = ws.Range(ws.Cells(3, 2), ws.Cells(lastRow, 7)).value2

    ' Construye índice key → row offset (relative a fila 3)
    Dim keyToOff As Object: Set keyToOff = CreateObject("Scripting.Dictionary")
    keyToOff.CompareMode = vbTextCompare
    Dim r As Long
    For r = 3 To lastRow
        Dim k As String: k = Trim(CStr(ws.Cells(r, 1).value))
        If Len(k) > 0 And Not keyToOff.Exists(k) Then keyToOff.Add k, r - 3 + 1   ' 1-based dentro del array
    Next r

    Dim pids As Variant: pids = Array("P0","P1","P2","P3","P4","P5")
    Dim secs As Variant: secs = Array("settings","hlsjs","prefetch_config","quality_levels","vlcopt","kodiprop","headerOverrides","headers")
    Dim numericSet As Object: Set numericSet = CreateObject("Scripting.Dictionary")
    numericSet.Add "settings", True: numericSet.Add "hlsjs", True
    numericSet.Add "prefetch_config", True: numericSet.Add "quality_levels", True

    Dim writes As Long: writes = 0
    Dim skips As Long: skips = 0

    Dim i As Long, s As Long
    For i = 0 To UBound(pids)
        Dim pid As String: pid = CStr(pids(i))
        Dim colInBlock As Long: colInBlock = i + 1   ' B=1..G=6 dentro de block (porque empezamos en col 2)
        For s = 0 To UBound(secs)
            Dim sec As String: sec = CStr(secs(s))
            Dim isNum As Boolean: isNum = numericSet.Exists(sec)
            Dim keysTSV As String: keysTSV = CStr(FE_sc.eval("profSectionKeys('" & pid & "','" & sec & "')"))
            If Len(keysTSV) = 0 Then GoTo nextSec
            Dim ks() As String: ks = Split(keysTSV, vbTab)
            Dim kk As Long
            For kk = 0 To UBound(ks)
                Dim attr As String: attr = ks(kk)
                If Len(attr) = 0 Then GoTo nextKey
                If Not keyToOff.Exists(attr) Then GoTo nextKey   ' clave JSON inexistente en LAB → skip
                Dim raw As String: raw = CStr(FE_sc.eval("profSectionVal('" & pid & "','" & sec & "','" & FE_EscapeJS(attr) & "')"))
                If raw = Chr(0) Then skips = skips + 1: GoTo nextKey   ' null protection
                Dim off As Long: off = keyToOff(attr)
                If isNum And IsNumeric(raw) Then
                    block(off, colInBlock) = CDbl(raw)
                Else
                    block(off, colInBlock) = raw
                End If
                writes = writes + 1
nextKey:
            Next kk
nextSec:
        Next s
    Next i

    ws.Range(ws.Cells(3, 2), ws.Cells(lastRow, 7)).value2 = block

    Debug.Print "FE_SyncProfilesJS: writes=" & writes & " skips=" & skips

restore:
    Application.Calculation = prevCalc
    Application.EnableEvents = prevEvents
    If Err.Number <> 0 Then
        If Not WIRING_SILENT Then MsgBox "FE_SyncProfilesJS error " & Err.Number & ": " & Err.description, vbCritical
    End If
End Sub
```

> Notas: (a) `vbTextCompare` en el dict para case-insensitive match (alineado con `StrComp`); (b) primera ocurrencia gana si hay duplicados en col A; (c) `keyToOff.Exists(attr)` evita writes huérfanos (key del JSON sin row en LAB → skip silently); (d) un único `Range.Value2 = block` reescribe 3666+ celdas en 1 op.

- [ ] **Step 2: Re-inyectar y correr smoke + stress**

```bash
pwsh -File C:/tmp/lab_ext/inject_extension.ps1
pwsh -File C:/tmp/lab_ext/smoke_harness.ps1
pwsh -File C:/tmp/lab_ext/smoke_harness.ps1 -JsonPath 'C:/tmp/lab_ext/fixture_stress.json'
```

Expected: smoke PASS; stress <5 s (era <30s en T6 cell-by-cell, ahora bulk).

- [ ] **Step 3: Backup pre-import dentro de `ImportFromFrontend`**

Editar `ImportFromFrontend` (línea 3178) — añadir tras `If filePath = "" Then GoTo Cleanup` y antes de `FE_ReadFileUTF8`:

```vba
    ' SAFE-MODE: backup pre-import si vamos a tocar profiles
    Dim ts As String: ts = Format(Now, "yyyymmdd_hhmmss")
    Dim bk As String: bk = Environ("USERPROFILE") & "\Downloads\APE_M3U8_LAB_v8_FIXED.BACKUP_" & ts & "_PRE_IMPORT.xlsm"
    On Error Resume Next
    ThisWorkbook.SaveCopyAs bk
    On Error GoTo ErrHandler
```

- [ ] **Step 4: Re-correr smoke + verificar backup creado**

Run + check: `ls C:/Users/HFRC/Downloads/APE_M3U8_LAB_v8_FIXED.BACKUP_*_PRE_IMPORT.xlsm | tail -1`

- [ ] **Step 5: Commit**

```bash
git commit -am "lab-importer-ext: bulk write 2D array + pre-import backup (T7)"
```

---

### Task 8: Real-data verification + post-validation

**Files:**
- Create: `C:/tmp/lab_ext/post_validate.ps1`

- [ ] **Step 1: Crear post-validation script — cuenta keys sincronizadas vs JSON**

```powershell
# C:/tmp/lab_ext/post_validate.ps1
param([string]$JsonPath = 'C:/Users/HFRC/Downloads/LAB_SNAPSHOT_20260426_1020.json')
$xl = [Runtime.InteropServices.Marshal]::GetActiveObject('Excel.Application')
$wb = $null
foreach ($b in $xl.Workbooks) { if ($b.Name -eq 'APE_M3U8_LAB_v8_FIXED.xlsm') { $wb = $b; break } }
$ws = $wb.Sheets.Item('6_NIVEL_2_PROFILES')
$json = Get-Content $JsonPath -Raw | ConvertFrom-Json
$map  = Get-Content 'C:/tmp/lab_ext/schema_map.json' -Raw | ConvertFrom-Json

$sections = 'settings','vlcopt','kodiprop','headerOverrides','headers','hlsjs','prefetch_config','quality_levels'
foreach ($pid in 'P0','P1','P2','P3','P4','P5') {
    $col = @{P0=2;P1=3;P2=4;P3=5;P4=6;P5=7}[$pid]
    foreach ($sec in $sections) {
        $obj = $json.profiles_snapshot.$pid.$sec
        if (-not $obj) { continue }
        $expected = 0; $matched = 0; $skipped_null = 0; $missing_in_lab = 0
        foreach ($k in $obj.PSObject.Properties.Name) {
            $expected++
            if ($null -eq $obj.$k -or $obj.$k -eq '') { $skipped_null++; continue }
            if (-not $map.rows.$k) { $missing_in_lab++; continue }
            $cell = [string]$ws.Cells($map.rows.$k.row, $col).Value2
            if ($cell -eq [string]$obj.$k) { $matched++ }
        }
        Write-Host ("[{0}/{1}] expected={2} matched={3} null_skip={4} no_row_in_lab={5}" -f $pid,$sec,$expected,$matched,$skipped_null,$missing_in_lab)
    }
}
```

- [ ] **Step 2: Ejecutar import en JSON real (19 MB)**

```powershell
$xl.Run('FE_TestSetForcedPath', 'C:/Users/HFRC/Downloads/LAB_SNAPSHOT_20260426_1020.json')
$xl.Run('FE_TestRunImport')
# Click "Sí" en MsgBox de "Perfiles cambiaron" si aparece (o forzar synced=True via WIRING_SILENT)
```

- [ ] **Step 3: Run post-validation**

Run: `pwsh -File C:/tmp/lab_ext/post_validate.ps1`

Expected output (objetivo):
```
[P0/settings] expected=41 matched=~38 null_skip=~3 no_row_in_lab=0
[P0/vlcopt] expected=48 matched=~46 null_skip=~2 no_row_in_lab=0
[P0/kodiprop] expected=7 matched=7 ...
[P0/headerOverrides] expected=409 matched=~395 ...
[P0/headers] expected=233 matched=~225 ...
[P0/hlsjs] expected=41 matched=~39 ...
[P0/prefetch_config] expected=14 matched=14 ...
[P0/quality_levels] expected=8 matched=8 ...
... (similar P1, P3, P4, P5)
[P2/...] matched mucho menor por outlier — OK
```

Total objetivo: **>4500 cells matched** (vs 30 actuales = ~150× más cobertura).

- [ ] **Step 4: Generar reporte resumen**

```powershell
pwsh -File C:/tmp/lab_ext/post_validate.ps1 | Tee-Object -FilePath 'C:/tmp/lab_ext/post_validate_report.txt'
cp C:/tmp/lab_ext/post_validate_report.txt IPTV_v5.4_MAX_AGGRESSION/lab-vba/extension/
```

- [ ] **Step 5: Commit final**

```bash
cp C:/tmp/lab_ext/post_validate.ps1 IPTV_v5.4_MAX_AGGRESSION/lab-vba/extension/

# Snapshot legible del módulo VBA modificado
# (extract proc bodies actualizados desde APE_LAB_BRAIN_CODE.txt)
git add IPTV_v5.4_MAX_AGGRESSION/lab-vba/extension/
git add IPTV_v5.4_MAX_AGGRESSION/lab-vba/AUDIT_FIXES_README.md   # actualizado con sección "Importer Extension v1.2"
git commit -m "lab-importer-ext: real-data verification — 4500+ cells synced from LAB_SNAPSHOT (T8)"
```

---

## Verification (end-to-end)

Tras completar las 8 tasks, ejecutar:

```bash
# 1. Smoke test (fixture mini): debe pasar 100%
pwsh -File C:/tmp/lab_ext/smoke_harness.ps1
# Expected: PASS: 0 failures

# 2. Stress test (600 keys headerOverrides extra): debe pasar y ser <5s
pwsh -File C:/tmp/lab_ext/smoke_harness.ps1 -JsonPath 'C:/tmp/lab_ext/fixture_stress.json'

# 3. Real data (LAB_SNAPSHOT_20260426_1020.json, 25k canales)
$xl = [Runtime.InteropServices.Marshal]::GetActiveObject('Excel.Application')
$xl.Run('FE_TestSetForcedPath', 'C:/Users/HFRC/Downloads/LAB_SNAPSHOT_20260426_1020.json')
$xl.Run('FE_TestRunImport')
pwsh -File C:/tmp/lab_ext/post_validate.ps1

# 4. Generar lista M3U8 desde el LAB (regression: el upgrade no rompe pipeline existente)
$xl.Run('Brain_RecalcAllSilent')
$xl.Run('Brain_ExportFinalM3U8')   # o el botón equivalente
# Verificar que los .m3u8 emitidos contienen los headers calibrados de los 6 perfiles
```

**Criterios de éxito:**
1. Smoke + stress: 100% PASS.
2. Post-validate: >95% match rate per (perfil × sección), excepto P2 (esperado ~85% por outlier).
3. M3U8 emitido contiene `#EXTHTTP:{...}` con headers que vienen del JSON (no de Excel hardcoded).
4. Tiempo total import (25k canales + sync 4500 cells): <30 s.
5. Backup creado en `C:/Users/HFRC/Downloads/APE_M3U8_LAB_v8_FIXED.BACKUP_*_PRE_IMPORT.xlsm`.

---

## Riesgos conocidos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| `6_NIVEL_2_PROFILES` no usa keys exactas del JSON (e.g., LAB usa `network_caching` con underscore, JSON usa `network-caching`) | Schema discovery (T1) detecta esto. Si hay drift, añadir tabla de sinónimos en `schema_map.json` y usar en `FE_WriteProfileCellByKey`. |
| JSON tiene `headerOverrides` con caracteres especiales que rompen `FE_EscapeJS` (e.g., backslash, newline) | Step extra: probar fixture con `\n`, `\\`, `'`, `"` en values. Si rompe, expandir `FE_EscapeJS`. |
| Excel freeze por bulk write masivo | Mitigado por T7 (bulk 2D array, una sola write op). Si aún freeze: split block en chunks de 200 rows. |
| Hash check actual bloquea sync repetido (mismo JSON) | Por design — no es bug. Para forzar re-sync: `SetConfigVal "Frontend_Profiles_Hash", ""` antes del import. |
| Conflicto con `Brain_EnforceCoherence` (en `APE_COHERENCE.bas`) que también escribe a `6_NIVEL_2_PROFILES` | Coherence corre POST-import en `Brain_RecalcAllSilent`. Importer debe correr ANTES de coherence. Confirmar orden en `ImportFromFrontend` línea 3268: `Brain_RecalcAllSilent` ya está al final. ✓ |
| Pérdida de calibración manual existente en LAB cuando JSON sobrescribe | Backup automático (T7 step 3). User puede rollback con Restore desde `BACKUP_*_PRE_IMPORT.xlsm`. |

---

## Self-Review notes

- ✅ **Spec coverage**: cada doctrina del Context tiene mitigación en algún task (no-clampar = T3 paso 3 verbatim; coerce-selective = T3-T7 numericSet dict; p2-outlier = T3 sentinel ` `; safe-mode = T7 backup + Application.* off).
- ✅ **Placeholder scan**: cero "TODO"/"TBD"/"appropriate". Cada step tiene comando o código completo.
- ✅ **Type consistency**: `FE_SyncSection` signature consistente entre T3 (cell-by-cell) y T7 (bulk via dict). `FE_WriteProfileCellByKey` queda obsoleta tras T7 (eliminar en T7 step 1 — su funcionalidad absorbida por bulk write).
- ✅ **Naming**: `profSectionKeys`/`profSectionVal` (JS), `FE_SyncSection`/`FE_SyncProfilesJS` (VBA) consistentes en plan completo.

---

## Execution Handoff

**Plan completo y guardado en `C:\Users\HFRC\.claude\plans\refactored-toasting-umbrella.md`. Dos opciones de ejecución:**

**1. Subagent-Driven (recomendado)** — Despacho un subagent fresco por task, revisión entre tasks, iteración rápida.

**2. Inline Execution** — Ejecuto las tasks en esta sesión vía executing-plans, batch con checkpoints de revisión.

**¿Qué prefieres?**

Tras tu confirmación, copio este plan a `IPTV_v5.4_MAX_AGGRESSION/docs/superpowers/plans/2026-04-26-lab-importer-extension.md` y arranco T1.

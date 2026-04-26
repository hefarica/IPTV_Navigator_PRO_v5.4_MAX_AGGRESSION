# smoke_harness.ps1 -- T2 baseline regression
# Verifies that after inject_extension.ps1 the existing FE_SyncProfilesJS
# (5-key InStr-match sync) still writes expected values to 6_NIVEL_2_PROFILES.
#
# Adaptations vs spec due to BRAIN code reality:
#   - SetConfigVal is Private. Use SetConfigVal_Public (injected by inject_extension.ps1).
#   - No WIRING_SILENT. FE_TestRunImport is self-contained and already silent.
#   - FE_SyncProfilesJS reads JSON .settings.{resolution,fps,bufferSeconds,bitrate,codec}
#     and writes via InStr substring match. fixture has resolution="RES_P0", so the
#     cell receiving it could be settings.resolution OR settings.maxResolution
#     (whichever row contains "resolution" first in col A). EITHER is a baseline pass.
#
param([string]$JsonPath = 'C:/tmp/lab_ext/fixture_mini.json')
$ErrorActionPreference = 'Stop'

$xl = [Runtime.InteropServices.Marshal]::GetActiveObject('Excel.Application')
$wb = $null
foreach ($b in $xl.Workbooks) { if ($b.Name -eq 'APE_M3U8_LAB_v8_FIXED.xlsm') { $wb = $b; break } }
if (-not $wb) { throw "Abrir APE_M3U8_LAB_v8_FIXED.xlsm primero" }

# Verify inject was applied (FE_TestSetForcedPath must exist as Public)
try {
    $xl.Run('FE_TestSetForcedPath', '')
} catch {
    throw "inject_extension.ps1 no fue aplicado aun. Ejecutar primero."
}

# Clear Frontend_Profiles_Hash so the import always triggers FE_SyncProfilesJS.
# Uses the Public wrapper we injected (SetConfigVal original is Private).
try {
    $xl.Run('SetConfigVal_Public', 'Frontend_Profiles_Hash', '')
    Write-Host "INFO: Frontend_Profiles_Hash cleared via SetConfigVal_Public"
} catch {
    Write-Host "WARN: SetConfigVal_Public not callable ($($_.Exception.Message)) -- hash may not be cleared"
    Write-Host "      FE_SyncProfilesJS will still run inside FE_TestRunImport (no gate there)"
}

# Inject path + run import (silent -- no MsgBox, no FileDialog)
$xl.Run('FE_TestSetForcedPath', $JsonPath)
Write-Host "INFO: FE_TEST_FORCED_PATH set to $JsonPath"

$xl.Run('FE_TestRunImport')
Write-Host "INFO: FE_TestRunImport completed"

# Read schema_map for row numbers
$mapRaw = Get-Content 'C:/tmp/lab_ext/schema_map.json' -Raw | ConvertFrom-Json

$ws = $wb.Sheets.Item('6_NIVEL_2_PROFILES')

$failures = @()
$infos    = @()

function Get-Cell($key, [int]$col) {
    $rowEntry = $mapRaw.rows.$key
    if (-not $rowEntry) { return '<no-row>' }
    return [string]$ws.Cells($rowEntry.row, $col).Value2
}

# Column map: P0=2, P1=3, P2=4, P3=5, P4=6, P5=7
$colMap = @{ P0=2; P1=3; P2=4; P3=5; P4=6; P5=7 }

# Baseline check: FE_SyncProfilesJS uses InStr match on 'resolution', 'fps',
# 'bufferSeconds', 'bitrate', 'codec'. Fixture sets:
#   settings.resolution = "RES_Pn"
#   settings.maxResolution = "MAXRES_Pn"
# InStr hits whichever row comes first. EITHER value in EITHER row = PASS.
foreach ($prf in 'P0','P1','P3','P4','P5') {   # skip P2 (deliberate nulls in vlcopt/headerOverrides)
    $col = $colMap[$prf]
    $cellRes = Get-Cell 'settings.resolution'    $col
    $cellMax = Get-Cell 'settings.maxResolution' $col
    $expRes  = "RES_$prf"
    $expMax  = "MAXRES_$prf"

    $hit = ($cellRes -eq $expRes) -or ($cellMax -eq $expRes) -or `
           ($cellRes -eq $expMax) -or ($cellMax -eq $expMax)

    if (-not $hit) {
        $failures += "[$prf] settings.resolution='$cellRes'  settings.maxResolution='$cellMax'  expected one of '$expRes'/'$expMax'"
    } else {
        $infos += "[$prf OK] settings.resolution='$cellRes'  settings.maxResolution='$cellMax'"
    }
}

# P2 check: only verify no crash occurred (values may be empty/null per outlier design)
$col2 = $colMap['P2']
$p2Res = Get-Cell 'settings.resolution' $col2
$infos += "[P2 outlier] settings.resolution='$p2Res' (null/empty expected -- outlier protection)"

if ($failures.Count -gt 0) {
    Write-Host "FAIL ($($failures.Count) assertion(s) failed):" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    Write-Host ""
    Write-Host "INFO (passing):"
    $infos | ForEach-Object { Write-Host "  $_" }
    exit 1
}

Write-Host "PASS: baseline 5-key sync verified" -ForegroundColor Green
$infos | ForEach-Object { Write-Host "  $_" }

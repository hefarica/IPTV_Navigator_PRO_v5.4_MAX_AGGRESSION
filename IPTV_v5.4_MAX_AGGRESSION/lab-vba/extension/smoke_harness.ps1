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

# === T3 assertions: exact dotted-key writes for 6 non-blob sections ===

# Load JSON once for expected values
$jsonObj = Get-Content $JsonPath -Raw | ConvertFrom-Json
$map = $mapRaw   # alias for clarity in Assert-DottedKey

function Assert-DottedKey($profId, $section, $subkey, $col, $expected, $coerceNum = $false) {
    $labKey = "$section.$subkey"
    if (-not $map.rows.$labKey) {
        $script:infos += "[$profId.$labKey] no row in LAB -- skip"
        return
    }
    $row = $map.rows.$labKey.row
    $actual = [string]$ws.Cells($row, $col).Value2
    if ($coerceNum) {
        $expDouble = 0.0
        $actDouble = 0.0
        $expIsNum = [double]::TryParse([string]$expected, [ref]$expDouble)
        if ($expIsNum) {
            # Both expected and actual must parse as double and be equal
            if ([double]::TryParse($actual, [ref]$actDouble)) {
                if ($actDouble -ne $expDouble) {
                    $script:failures += "[$profId.$labKey] r=$row c=$col expected=$expected got='$actual'"
                } else {
                    $script:infos += "[$profId.$labKey OK numeric] $actual"
                }
            } else {
                $script:failures += "[$profId.$labKey] r=$row c=$col expected numeric=$expected got='$actual' (not parseable as double)"
            }
        } else {
            # Numeric section but non-numeric value (e.g. settings.resolution="RES_P0") -- compare as text
            $expStr = [string]$expected
            if ($actual -ne $expStr) {
                $script:failures += "[$profId.$labKey] r=$row c=$col expected='$expStr' got='$actual'"
            } else {
                $script:infos += "[$profId.$labKey OK text-in-num-sec] $actual"
            }
        }
    } else {
        $expStr = [string]$expected
        if ($actual -ne $expStr) {
            $script:failures += "[$profId.$labKey] r=$row c=$col expected='$expStr' got='$actual'"
        } else {
            $script:infos += "[$profId.$labKey OK text] $actual"
        }
    }
}

foreach ($profId in 'P0','P1','P2','P3','P4','P5') {
    $col = @{P0=2;P1=3;P2=4;P3=5;P4=6;P5=7}[$profId]
    $prof = $jsonObj.profiles_snapshot.$profId
    foreach ($sec in 'settings','hlsjs','prefetch_config','vlcopt','kodiprop','headerOverrides') {
        $obj = $prof.$sec
        if (-not $obj) { continue }
        $isNum = ($sec -in 'settings','hlsjs','prefetch_config')
        foreach ($k in $obj.PSObject.Properties.Name) {
            $val = $obj.$k
            if ($null -eq $val) { continue }                          # P2 outlier null -- sentinel in VBA, skip
            if ($val -is [string] -and $val -eq '') { continue }      # explicit empty -- skip
            Assert-DottedKey $profId $sec $k $col $val $isNum
        }
    }
}

# Special: vlcopt.video-fps must be verbatim "30,30,30,30" (commas preserved)
foreach ($profId in 'P0','P1','P2','P3','P4','P5') {
    $col = @{P0=2;P1=3;P2=4;P3=5;P4=6;P5=7}[$profId]
    Assert-DottedKey $profId 'vlcopt' 'video-fps' $col '30,30,30,30' $false
}

# Special: headerOverrides.X-Comma-Test must be verbatim "a,b,c,d"
# (X-Comma-Test is NOT in schema_map -- will log as "no row in LAB" info, not failure)
foreach ($profId in 'P0','P1','P2','P3','P4','P5') {
    $col = @{P0=2;P1=3;P2=4;P3=5;P4=6;P5=7}[$profId]
    Assert-DottedKey $profId 'headerOverrides' 'X-Comma-Test' $col 'a,b,c,d' $false
}

# === T4 assertions: blob sections ===
foreach ($profId4 in 'P0','P1','P2','P3','P4','P5') {
    $col = @{P0=2;P1=3;P2=4;P3=5;P4=6;P5=7}[$profId4]
    $prof = $jsonObj.profiles_snapshot.$profId4
    foreach ($sec in 'headers','quality_levels') {
        $obj = $prof.$sec
        if (-not $obj) {
            $script:infos += "[$profId4.$sec] no JSON object -- skip"
            continue
        }
        # Find the LAB row whose col A is exactly the section name
        $rowIdx = $null
        for ($r = 1; $r -le 30; $r++) {
            $k = [string]$ws.Cells($r, 1).Value2
            if ($k -eq $sec) { $rowIdx = $r; break }
        }
        if (-not $rowIdx) {
            $script:failures += "[$profId4.$sec] LAB has no row with col A='$sec' (looked rows 1-30)"
            continue
        }
        $cell = [string]$ws.Cells($rowIdx, $col).Value2
        if (-not $cell.StartsWith('{')) {
            $script:failures += "[$profId4.$sec] r=$rowIdx c=$col cell does not look like JSON (got: $($cell.Substring(0, [Math]::Min(50, $cell.Length))))"
            continue
        }
        # Parse cell content as JSON and verify the JSON's keys match obj's keys
        try {
            $parsed = $cell | ConvertFrom-Json
        } catch {
            $script:failures += "[$profId4.$sec] r=$rowIdx c=$col cell content is not valid JSON: $($_.Exception.Message)"
            continue
        }
        $jsonKeys = $obj.PSObject.Properties.Name | Sort-Object
        $cellKeys = $parsed.PSObject.Properties.Name | Sort-Object
        $diff_only_in_json = $jsonKeys | Where-Object { $_ -notin $cellKeys }
        $diff_only_in_cell = $cellKeys | Where-Object { $_ -notin $jsonKeys }
        if ($diff_only_in_json.Count -gt 0 -or $diff_only_in_cell.Count -gt 0) {
            $script:failures += "[$profId4.$sec] key mismatch -- only_in_json=$($diff_only_in_json -join ',') only_in_cell=$($diff_only_in_cell -join ',')"
        } else {
            $script:infos += "[$profId4.$sec OK blob] $($jsonKeys.Count) keys synced"
        }
    }
}

# Report
Write-Host ""
Write-Host "=== T3+T4 assertion summary ==="
$assertTotal = $script:failures.Count + ($script:infos | Where-Object { $_ -match ' OK ' }).Count
Write-Host "INFO entries: $($script:infos.Count)"

if ($failures.Count -gt 0) {
    Write-Host "FAIL ($($failures.Count) assertion(s) failed):" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    Write-Host ""
    Write-Host "INFO (all):"
    $infos | ForEach-Object { Write-Host "  $_" }
    exit 1
}

Write-Host "PASS: all assertions passed" -ForegroundColor Green
$infos | Where-Object { $_ -match ' OK ' } | Select-Object -First 30 | ForEach-Object { Write-Host "  $_" }
$skipCount = ($infos | Where-Object { $_ -match 'no row in LAB' }).Count
Write-Host "  (+ $skipCount keys skipped -- no row in LAB, expected for synthetic fixture keys)"

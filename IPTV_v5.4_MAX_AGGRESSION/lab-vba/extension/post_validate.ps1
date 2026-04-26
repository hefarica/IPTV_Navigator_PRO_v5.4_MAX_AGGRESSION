param([string]$JsonPath = 'C:/Users/HFRC/Downloads/LAB_SNAPSHOT_20260426_1020.json')
$ErrorActionPreference = 'Stop'

$xl = [Runtime.InteropServices.Marshal]::GetActiveObject('Excel.Application')
$wb = $null
foreach ($b in $xl.Workbooks) { if ($b.Name -eq 'APE_M3U8_LAB_v8_FIXED.xlsm') { $wb = $b; break } }
if (-not $wb) { throw "NO_WB" }
$ws = $wb.Sheets.Item('6_NIVEL_2_PROFILES')

$json = Get-Content $JsonPath -Raw | ConvertFrom-Json
$map  = Get-Content 'C:/tmp/lab_ext/schema_map.json' -Raw | ConvertFrom-Json

# Build LAB row index for non-blob sections (dotted keys)
$nonBlobSecs = @('settings','vlcopt','kodiprop','headerOverrides','hlsjs','prefetch_config')
$blobSecs    = @('headers','quality_levels')

# Find blob row indices once
$blobRow = @{}
$lastRow = $ws.Cells($ws.Rows.Count, 1).End(-4162).Row
for ($r = 1; $r -le 30; $r++) {
    $k = [string]$ws.Cells($r, 1).Value2
    if ($k -in $blobSecs) { $blobRow[$k] = $r }
}

$summary = @()
$totals = @{ expected = 0; matched = 0; null_skip = 0; no_lab_row = 0; mismatch = 0 }

foreach ($profId in 'P0','P1','P2','P3','P4','P5') {
    $col = @{P0=2;P1=3;P2=4;P3=5;P4=6;P5=7}[$profId]
    $prof = $json.profiles_snapshot.$profId

    # ---- Non-blob sections ----
    foreach ($sec in $nonBlobSecs) {
        $obj = $prof.$sec
        if (-not $obj) { continue }
        $secStats = @{ expected = 0; matched = 0; null_skip = 0; no_lab_row = 0; mismatch = 0 }
        foreach ($k in $obj.PSObject.Properties.Name) {
            $secStats.expected++
            $totals.expected++
            $val = $obj.$k
            if ($null -eq $val -or ($val -is [string] -and $val -eq '')) {
                $secStats.null_skip++; $totals.null_skip++; continue
            }
            $labKey = "$sec.$k"
            if (-not $map.rows.$labKey) {
                $secStats.no_lab_row++; $totals.no_lab_row++; continue
            }
            $row = $map.rows.$labKey.row
            $cell = $ws.Cells($row, $col).Value2
            $cellStr = [string]$cell
            $valStr = [string]$val
            # Numeric tolerance: if both parse as double, compare numerically
            $numMatch = $false
            $vd = 0.0; $cd = 0.0
            if ([double]::TryParse($valStr, [ref]$vd) -and [double]::TryParse($cellStr, [ref]$cd)) {
                $numMatch = ($vd -eq $cd)
            }
            if ($cellStr -eq $valStr -or $numMatch) {
                $secStats.matched++; $totals.matched++
            } else {
                $secStats.mismatch++; $totals.mismatch++
            }
        }
        $summary += [PSCustomObject]@{
            profile = $profId; section = $sec
            expected = $secStats.expected; matched = $secStats.matched
            null_skip = $secStats.null_skip; no_lab_row = $secStats.no_lab_row
            mismatch = $secStats.mismatch
            match_pct = if ($secStats.expected -gt 0) { [math]::Round(100.0 * $secStats.matched / ($secStats.expected - $secStats.null_skip), 1) } else { 0 }
        }
    }

    # ---- Blob sections ----
    foreach ($sec in $blobSecs) {
        $obj = $prof.$sec
        if (-not $obj) { continue }
        $totals.expected++
        if (-not $blobRow.ContainsKey($sec)) {
            $totals.no_lab_row++
            $summary += [PSCustomObject]@{ profile=$profId; section=$sec; expected=1; matched=0; null_skip=0; no_lab_row=1; mismatch=0; match_pct=0 }
            continue
        }
        $cell = [string]$ws.Cells($blobRow[$sec], $col).Value2
        if (-not $cell.StartsWith('{')) {
            $totals.mismatch++
            $summary += [PSCustomObject]@{ profile=$profId; section=$sec; expected=1; matched=0; null_skip=0; no_lab_row=0; mismatch=1; match_pct=0 }
            continue
        }
        try {
            $parsed = $cell | ConvertFrom-Json
            $jKeys = $obj.PSObject.Properties.Name | Sort-Object
            $cKeys = $parsed.PSObject.Properties.Name | Sort-Object
            $matchKeys = ($jKeys | Where-Object { $_ -in $cKeys }).Count
            if ($matchKeys -eq $jKeys.Count -and $cKeys.Count -eq $jKeys.Count) {
                $totals.matched++
                $summary += [PSCustomObject]@{ profile=$profId; section=$sec; expected=1; matched=1; null_skip=0; no_lab_row=0; mismatch=0; match_pct=100; blob_keys=$jKeys.Count }
            } else {
                $totals.mismatch++
                $summary += [PSCustomObject]@{ profile=$profId; section=$sec; expected=1; matched=0; null_skip=0; no_lab_row=0; mismatch=1; match_pct=0; blob_keys=$jKeys.Count; blob_cell_keys=$cKeys.Count }
            }
        } catch {
            $totals.mismatch++
            $summary += [PSCustomObject]@{ profile=$profId; section=$sec; expected=1; matched=0; null_skip=0; no_lab_row=0; mismatch=1; match_pct=0; err=$_.Exception.Message }
        }
    }
}

"=== Per (profile x section) ==="
$summary | Format-Table -AutoSize

"=== Totals ==="
"Expected: $($totals.expected)"
"Matched:  $($totals.matched)"
"Null/empty skipped: $($totals.null_skip)"
"No LAB row:        $($totals.no_lab_row)"
"Mismatch:          $($totals.mismatch)"

$denom = $totals.expected - $totals.null_skip
if ($denom -gt 0) {
    $overall = [math]::Round(100.0 * $totals.matched / $denom, 2)
    "Overall match rate (matched / (expected - null_skip)): ${overall}%"
}

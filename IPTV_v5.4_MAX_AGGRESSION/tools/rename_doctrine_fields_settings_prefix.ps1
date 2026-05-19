# Option 1: rename my 19 doctrine fields in hoja 6_NIVEL_2_PROFILES col A
# to use `settings.` prefix. snake_case preserved. STRICT-NO-OVERWRITE:
# only rename cells whose CURRENT value matches an expected unprefixed name
# from my own add. Refuse to touch anything else.

$ErrorActionPreference = 'Stop'
Get-Process EXCEL -EA SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 600
Remove-Item "$env:USERPROFILE\Downloads\~$*.xlsm" -Force -EA SilentlyContinue

$xlsm = "$env:USERPROFILE\Downloads\APE_M3U8_LAB_v8_FIXED.xlsm"
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
Copy-Item $xlsm "$xlsm.bak_pre_settings_prefix_$ts" -Force
Write-Output "Backup: $xlsm.bak_pre_settings_prefix_$ts"

# Names that MUST exist as currently-unprefixed entries (my adds 2026-05-19)
$expected = @(
    'hdr_mode', 'video_range', 'color_primaries', 'transfer_characteristics',
    'matrix_coefficients', 'codec_primary', 'codec_string', 'target_framerate',
    'nits_target', 'vmaf_target', 'bandwidth_floor', 'bandwidth_target',
    'bandwidth_max', 'avg_bandwidth_ratio', 'codec_chain_video',
    'codec_chain_video_family', 'codec_chain_audio', 'codec_chain_hdr',
    'codec_chain_player_pref'
)

$excel = $null; $wb = $null
$renamed = @()
$skipped_already_prefixed = @()
$not_found = @()

try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $excel.AskToUpdateLinks = $false
    $excel.EnableEvents = $false
    $excel.ScreenUpdating = $false
    $wb = $excel.Workbooks.Open($xlsm, 0, $false)
    $wb.Saved = $true

    $ws = $wb.Sheets.Item('6_NIVEL_2_PROFILES')
    $lastRow = $ws.Cells.Item($ws.Rows.Count, 1).End(-4162).Row
    Write-Output "Hoja 6 lastRow: $lastRow"

    # Build name->row map of CURRENT state
    $rowByName = @{}
    for ($r = 1; $r -le $lastRow; $r++) {
        $v = "$($ws.Cells.Item($r, 1).Value2)"
        if ($v) { $rowByName[$v.Trim()] = $r }
    }

    foreach ($attr in $expected) {
        $newKey = "settings.$attr"
        if ($rowByName.ContainsKey($newKey)) {
            $skipped_already_prefixed += "$attr -> $newKey (row $($rowByName[$newKey]))"
            continue
        }
        if (-not $rowByName.ContainsKey($attr)) {
            $not_found += $attr
            continue
        }
        # CURRENT cell has the unprefixed name → rename to settings.X
        $r = $rowByName[$attr]
        # STRICT verify: cell content matches expected name EXACTLY before write
        $current = "$($ws.Cells.Item($r, 1).Value2)".Trim()
        if ($current -ne $attr) {
            Write-Output "  REFUSE row $r : cell value '$current' != expected '$attr' (someone else may have edited it)"
            continue
        }
        $ws.Cells.Item($r, 1).Value2 = $newKey
        $renamed += "row $r : '$attr' -> '$newKey'"
        Write-Output "  RENAME row $r : '$attr' -> '$newKey'"
    }

    Write-Output ""
    Write-Output "Summary:"
    Write-Output ("  renamed: " + $renamed.Count)
    Write-Output ("  skipped_already_prefixed: " + $skipped_already_prefixed.Count)
    Write-Output ("  not_found: " + $not_found.Count)
    if ($not_found.Count -gt 0) {
        Write-Output "  Not found:"
        foreach ($n in $not_found) { Write-Output "    - $n" }
    }

    $wb.Save()
    Write-Output ""
    Write-Output "SAVED OK"

    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($ws)
}
catch {
    Write-Output ("ERROR: " + $_.Exception.Message)
}
finally {
    if ($wb)    { try { $wb.Close($false) } catch {}; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wb) }
    if ($excel) { try { $excel.Quit() } catch {};   [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
    [GC]::Collect(); [GC]::WaitForPendingFinalizers()
    [GC]::Collect(); [GC]::WaitForPendingFinalizers()

    $report = [ordered]@{
        renamed = $renamed
        skipped_already_prefixed = $skipped_already_prefixed
        not_found = $not_found
        finished_at = (Get-Date).ToString('o')
    }
    $report | ConvertTo-Json -Depth 6 | Out-File "C:\tmp\rename_report.json" -Encoding utf8
}

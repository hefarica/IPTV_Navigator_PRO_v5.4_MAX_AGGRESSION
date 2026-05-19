# Clear redundant rows 626 & 628 in hoja 6 (my unprefixed hdr_mode / color_primaries
# adds) — they collide with user-curated pre-existing settings.X at rows 43 & 44.
# STRICT verify: refuse to clear if cell content has changed from expected.
$ErrorActionPreference = 'Stop'
Get-Process EXCEL -EA SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500
Remove-Item "$env:USERPROFILE\Downloads\~$*.xlsm" -Force -EA SilentlyContinue

$xlsm = "$env:USERPROFILE\Downloads\APE_M3U8_LAB_v8_FIXED.xlsm"
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
Copy-Item $xlsm "$xlsm.bak_pre_clear_redundant_$ts" -Force

$excel = $null; $wb = $null
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

    # Row 626 = 'hdr_mode' (mine), row 628 = 'color_primaries' (mine)
    $redundant = @(
        @{ row = 626; expected = 'hdr_mode';        canonical_row = 44 },
        @{ row = 628; expected = 'color_primaries'; canonical_row = 43 }
    )
    foreach ($r in $redundant) {
        $current = "$($ws.Cells.Item($r.row, 1).Value2)".Trim()
        if ($current -ne $r.expected) {
            Write-Output "  REFUSE row $($r.row): cell A is '$current' (expected '$($r.expected)') - leaving as-is"
            continue
        }
        # Clear cols A..G of this row (only the cells I added today)
        for ($c = 1; $c -le 7; $c++) {
            $ws.Cells.Item($r.row, $c).Value2 = ''
        }
        Write-Output "  CLEARED row $($r.row) ('$($r.expected)') - canonical lives at row $($r.canonical_row)"
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
}

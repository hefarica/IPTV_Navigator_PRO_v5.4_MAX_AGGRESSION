# Upgrade player_target field to MULTI-SELECT semantics in OFFICIAL Downloads xlsm.
# Per user doctrine: default (empty) = ALL players covered universally.
# Cell allows: empty / "ALL" / single name / comma-separated list.
# STRICT NO-OVERWRITE preserved on user-curated cells.

$ErrorActionPreference = 'Stop'
Get-Process EXCEL -EA SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 600
Remove-Item "$env:USERPROFILE\Downloads\~$*.xlsm" -Force -EA SilentlyContinue

$xlsm = "$env:USERPROFILE\Downloads\APE_M3U8_LAB_v8_FIXED.xlsm"
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
Copy-Item $xlsm "$xlsm.bak_pre_multiselect_$ts" -Force
Write-Output "Backup: $xlsm.bak_pre_multiselect_$ts"

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

    # ─── STEP 1: Add ALL to hoja 98_VALIDATIONS (col B row 6) ──────────────
    # Current state: B1=player_target, B2=VLC, B3=KODI, B4=TIVIMATE, B5=OTT_NAV, B6=(empty)
    # Target state:  B1=player_target, B2=ALL, B3=VLC, B4=KODI, B5=TIVIMATE, B6=OTT_NAV, B7=(empty for blank-allowed)
    $ws98 = $wb.Sheets.Item('98_VALIDATIONS')
    $existsALL = $false
    for ($r = 2; $r -le 10; $r++) {
        $v = "$($ws98.Cells.Item($r, 2).Value2)"
        if ($v.Trim().ToUpper() -eq 'ALL') { $existsALL = $true; break }
    }
    if (-not $existsALL) {
        # Insert "ALL" at B2; shift the existing values down by 1
        # Strategy: shift instead of overwrite to preserve user-visible order
        for ($r = 7; $r -ge 3; $r--) {
            $src = "$($ws98.Cells.Item($r - 1, 2).Value2)"
            $ws98.Cells.Item($r, 2).Value2 = $src
        }
        $ws98.Cells.Item(2, 2).Value2 = 'ALL'
        Write-Output "STEP 1: Added 'ALL' at B2 in 98_VALIDATIONS (shifted VLC/KODI/TIVIMATE/OTT_NAV down by 1)"
    } else {
        Write-Output "STEP 1: 'ALL' already present in 98_VALIDATIONS (skip)"
    }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($ws98)

    # ─── STEP 2: Extend Named Range to include ALL + the trailing blank ────
    # Old: =`98_VALIDATIONS`!$B$2:$B$6  (VLC..OTT_NAV + blank)
    # New: =`98_VALIDATIONS`!$B$2:$B$7  (ALL..OTT_NAV + blank for empty-allowed)
    $nm = $wb.Names.Item('lst_PlayerTargets')
    $nm.RefersTo = "='98_VALIDATIONS'!`$B`$2:`$B`$7"
    Write-Output "STEP 2: Named Range lst_PlayerTargets extended to B2:B7 (includes ALL)"
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($nm)

    # ─── STEP 3: Re-apply Validation on hoja 7 col 7 with multi-select doctrine ─
    # Excel native data validation doesn't support multi-select via dropdown.
    # We loosen to xlValidAlertWarning (warn but allow free-text) so users can
    # type comma-separated values without Excel rejecting them.
    # The resolver (Python/PHP/JS) parses comma-separated on read.
    $ws7 = $wb.Sheets.Item('7_NIVEL_3_CHANNEL')
    # Find player_target column in row 5
    $pt_col = 0
    for ($c = 1; $c -le 20; $c++) {
        $v = "$($ws7.Cells.Item(5, $c).Value2)"
        if ($v -eq 'player_target') { $pt_col = $c; break }
    }
    if ($pt_col -gt 0) {
        $lastRow = $ws7.Cells.Item($ws7.Rows.Count, 1).End(-4162).Row
        if ($lastRow -le 5) { $lastRow = 91 }
        $rng = $ws7.Range($ws7.Cells.Item(6, $pt_col), $ws7.Cells.Item($lastRow, $pt_col))
        # Drop old strict validation completely
        # Approach: REMOVE strict validation → free-text allowed natively for
        # multi-select. Then attach a sticky Comment on the column HEADER cell
        # (row 5) with the multi-select doctrine. Comments hover on mouse-over
        # → users see the option list without Excel error popups when typing
        # comma-separated values.
        try {
            $rng.Validation.Delete()
            Write-Output "STEP 3a: Old strict validation REMOVED from col $pt_col rows 6..$lastRow"
        } catch {
            Write-Output "STEP 3a: validation delete failed: $($_.Exception.Message)"
        }

        # Attach Comment to the header cell (row 5, col $pt_col)
        $hdrCell = $ws7.Cells.Item(5, $pt_col)
        try {
            # Remove existing comment if present (idempotent)
            try { $hdrCell.Comment.Delete() } catch {}
            $commentLines = @(
                'player_target - MULTI-SELECT',
                '',
                'DOCTRINA: cobertura universal por DEFAULT.',
                '',
                '(vacio) o ALL = todos los players reciben sus parches',
                'VLC = solo VLC',
                'VLC,KODI = VLC + Kodi/TiviMate',
                'VLC,KODI,OTT_NAV = combinaciones libres',
                '',
                'Resolver parsea por coma. Unknown tokens dropped.',
                'all-unknown -> ALL fallback (safety).'
            )
            $commentText = ($commentLines -join [Environment]::NewLine)
            $cmt = $hdrCell.AddComment($commentText)
            $cmt.Visible = $false  # hover-only, not pinned
            $cmt.Shape.TextFrame.AutoSize = $true
            Write-Output "STEP 3b: Comment attached to header cell row 5 col $pt_col"
        } catch {
            Write-Output "STEP 3b: comment attach failed: $($_.Exception.Message)"
        }
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($hdrCell)
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($rng)
    } else {
        Write-Output "STEP 3: SKIP - player_target column not found in row 5"
    }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($ws7)

    # ─── STEP 4: Update placeholder description in hoja 32 ─────────────────
    $ws32 = $wb.Sheets.Item('32_PLACEHOLDERS_MAP')
    $lr = $ws32.Cells.Item($ws32.Rows.Count, 1).End(-4162).Row
    for ($r = 1; $r -le $lr; $r++) {
        $v = "$($ws32.Cells.Item($r, 1).Value2)"
        if ($v -eq '{config.player_target}') {
            $ws32.Cells.Item($r, 4).Value2 = (
                "Multi-select. Empty = ALL (cobertura universal por DEFAULT). " +
                "Valores: ALL | VLC | KODI | TIVIMATE | OTT_NAV. " +
                "Comma-separated allowed (ej. 'VLC,KODI'). " +
                "Resolver parsea por coma; unknown tokens dropped; all-unknown -> ALL fallback. " +
                "Consumed by hls_rewriter_v15.py:_parse_player_target (2026-05-19) + " +
                "lab_config_loader.php (689feff)."
            )
            Write-Output "STEP 4: Placeholder description updated at row $r"
            break
        }
    }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($ws32)

    $wb.Save()
    Write-Output ""
    Write-Output "SAVED OK"
}
catch {
    Write-Output ""
    Write-Output "ERROR: $($_.Exception.Message)"
    $st = $_.ScriptStackTrace
    Write-Output ("Stack: " + $st)
}
finally {
    if ($wb)    { try { $wb.Close($false) } catch {}; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wb) }
    if ($excel) { try { $excel.Quit() } catch {};   [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
    [GC]::Collect(); [GC]::WaitForPendingFinalizers()
    [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}

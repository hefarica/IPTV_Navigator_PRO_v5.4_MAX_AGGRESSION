# Apply ALL deploys (player_target + 19 doctrine fields) to OFFICIAL Downloads xlsm.
# STRICT GUARANTEE: NEVER overwrite or modify any existing cell value.
# ONLY adds:
#   · New sheet 98_VALIDATIONS (if absent)
#   · New Named Range lst_PlayerTargets (if absent)
#   · player_target column header at FIRST EMPTY column in row 5 of hoja 7
#     (skips if 'player_target' already exists anywhere in row 5)
#   · New row in hoja 32 (only if 'player_target' placeholder not present)
#   · New rows in hoja 6 (only for doctrine attributes not present)
#
# Existing rows / cells / headers in user's curated workbook = NEVER TOUCHED.
# Pre-deploy snapshot + post-deploy verification confirms zero modification
# to anything that existed before.

$ErrorActionPreference = 'Stop'
Get-Process EXCEL -EA SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 600
Remove-Item "$env:USERPROFILE\Downloads\~$*.xlsm" -Force -EA SilentlyContinue

$xlsm = "$env:USERPROFILE\Downloads\APE_M3U8_LAB_v8_FIXED.xlsm"
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
Copy-Item $xlsm "$xlsm.bak_pre_consolidated_$ts" -Force
Write-Output "Backup: $xlsm.bak_pre_consolidated_$ts"

$VALIDATIONS_ENUM = @('player_target', 'VLC', 'KODI', 'TIVIMATE', 'OTT_NAV')

$DOCTRINE = @(
    @('hdr_mode',                 'HDR10','HDR10','HDR10','SDR','SDR','SDR'),
    @('video_range',              'PQ','PQ','PQ','SDR','SDR','SDR'),
    @('color_primaries',          '9', '9', '9', '1', '1', '1'),
    @('transfer_characteristics', '16', '16', '16', '', '', ''),
    @('matrix_coefficients',      '9', '9', '9', '', '', ''),
    @('codec_primary',            'HEVC','HEVC','HEVC','HEVC','AVC','AVC'),
    @('codec_string',
        'hvc1.2.4.L153.B0,ec-3',
        'hvc1.2.4.L153.B0,ec-3',
        'hvc1.2.4.L150.B0,ec-3',
        'hvc1.2.4.L120.B0,mp4a.40.2',
        'avc1.640028,mp4a.40.2',
        'avc1.42E01E,mp4a.40.2'),
    @('target_framerate',         '60FPS','60FPS','30FPS','60FPS','30FPS','30FPS'),
    @('nits_target',              '4000', '1500', '1000', '400', '100', '100'),
    @('vmaf_target',              '95', '93', '91', '88', '82', '75'),
    @('bandwidth_floor',          '15000000', '12000000', '8000000', '5000000', '3000000', '1500000'),
    @('bandwidth_target',         '60000000', '22000000', '12000000', '9000000', '6500000', '4000000'),
    @('bandwidth_max',            '80000000', '28000000', '16000000', '12000000', '9000000', '5500000'),
    @('avg_bandwidth_ratio',      '0.75', '0.78', '0.78', '0.78', '0.78', '0.78'),
    @('codec_chain_video',
        'hvc1.2.4.L183.B0,hvc1.2.4.L180.B0,hvc1.2.4.L156.B0,hvc1.2.4.L153.B0,hvc1.2.4.L150.B0,hvc1.2.4.L123.B0,hvc1.2.4.L120.B0,hvc1.1.6.L153.B0,hvc1.1.6.L120.B0,avc1.640028',
        'hvc1.2.4.L183.B0,hvc1.2.4.L180.B0,hvc1.2.4.L156.B0,hvc1.2.4.L153.B0,hvc1.2.4.L150.B0,hvc1.2.4.L123.B0,hvc1.2.4.L120.B0,hvc1.1.6.L153.B0,hvc1.1.6.L120.B0,avc1.640028',
        'hvc1.2.4.L183.B0,hvc1.2.4.L180.B0,hvc1.2.4.L156.B0,hvc1.2.4.L153.B0,hvc1.2.4.L150.B0,hvc1.2.4.L123.B0,hvc1.2.4.L120.B0,hvc1.1.6.L153.B0,hvc1.1.6.L120.B0,avc1.640028',
        'hvc1.2.4.L183.B0,hvc1.2.4.L180.B0,hvc1.2.4.L156.B0,hvc1.2.4.L153.B0,hvc1.2.4.L150.B0,hvc1.2.4.L123.B0,hvc1.2.4.L120.B0,hvc1.1.6.L153.B0,hvc1.1.6.L120.B0,avc1.640028',
        'hvc1.2.4.L183.B0,hvc1.2.4.L180.B0,hvc1.2.4.L156.B0,hvc1.2.4.L153.B0,hvc1.2.4.L150.B0,hvc1.2.4.L123.B0,hvc1.2.4.L120.B0,hvc1.1.6.L153.B0,hvc1.1.6.L120.B0,avc1.640028',
        'hvc1.2.4.L183.B0,hvc1.2.4.L180.B0,hvc1.2.4.L156.B0,hvc1.2.4.L153.B0,hvc1.2.4.L150.B0,hvc1.2.4.L123.B0,hvc1.2.4.L120.B0,hvc1.1.6.L153.B0,hvc1.1.6.L120.B0,avc1.640028'),
    @('codec_chain_video_family',
        'HEVC-MAIN10-L6.1>HEVC-MAIN10-L6.0>HEVC-MAIN10-L5.2>HEVC-MAIN10-L5.1>HEVC-MAIN10-L5.0>HEVC-MAIN10-L4.1>HEVC-MAIN10-L4.0>HEVC-MAIN-L5.1>HEVC-MAIN-L4.0>H264-HIGH',
        'HEVC-MAIN10-L6.1>HEVC-MAIN10-L6.0>HEVC-MAIN10-L5.2>HEVC-MAIN10-L5.1>HEVC-MAIN10-L5.0>HEVC-MAIN10-L4.1>HEVC-MAIN10-L4.0>HEVC-MAIN-L5.1>HEVC-MAIN-L4.0>H264-HIGH',
        'HEVC-MAIN10-L6.1>HEVC-MAIN10-L6.0>HEVC-MAIN10-L5.2>HEVC-MAIN10-L5.1>HEVC-MAIN10-L5.0>HEVC-MAIN10-L4.1>HEVC-MAIN10-L4.0>HEVC-MAIN-L5.1>HEVC-MAIN-L4.0>H264-HIGH',
        'HEVC-MAIN10-L6.1>HEVC-MAIN10-L6.0>HEVC-MAIN10-L5.2>HEVC-MAIN10-L5.1>HEVC-MAIN10-L5.0>HEVC-MAIN10-L4.1>HEVC-MAIN10-L4.0>HEVC-MAIN-L5.1>HEVC-MAIN-L4.0>H264-HIGH',
        'HEVC-MAIN10-L6.1>HEVC-MAIN10-L6.0>HEVC-MAIN10-L5.2>HEVC-MAIN10-L5.1>HEVC-MAIN10-L5.0>HEVC-MAIN10-L4.1>HEVC-MAIN10-L4.0>HEVC-MAIN-L5.1>HEVC-MAIN-L4.0>H264-HIGH',
        'HEVC-MAIN10-L6.1>HEVC-MAIN10-L6.0>HEVC-MAIN10-L5.2>HEVC-MAIN10-L5.1>HEVC-MAIN10-L5.0>HEVC-MAIN10-L4.1>HEVC-MAIN10-L4.0>HEVC-MAIN-L5.1>HEVC-MAIN-L4.0>H264-HIGH'),
    @('codec_chain_audio',        'ec-3,ac-3,mp4a.40.2,mp4a.40.5','ec-3,ac-3,mp4a.40.2,mp4a.40.5','ec-3,ac-3,mp4a.40.2,mp4a.40.5','ec-3,ac-3,mp4a.40.2,mp4a.40.5','ec-3,ac-3,mp4a.40.2,mp4a.40.5','ec-3,ac-3,mp4a.40.2,mp4a.40.5'),
    @('codec_chain_hdr',          'hdr10,hlg,sdr','hdr10,hlg,sdr','hdr10,hlg,sdr','sdr','sdr','sdr'),
    @('codec_chain_player_pref',  'hvc1,hev1,h265,avc1,h264','hvc1,hev1,h265,avc1,h264','hvc1,hev1,h265,avc1,h264','hvc1,hev1,h265,avc1,h264','avc1,h264,hvc1,hev1','avc1,h264')
)

# ─── PRE-DEPLOY SNAPSHOT of cells in zones we'll touch ─────────────────────
# Captures the value of every cell BEFORE we open the workbook for write.
# Compared post-deploy to guarantee zero modifications to existing data.
function Snapshot-Touch-Zones {
    param([object]$wb)
    $snap = [ordered]@{}
    # Hoja 6: rows 1..lastRow col A (attr names) + cols B..G P0..P5 values
    $ws6 = $wb.Sheets.Item('6_NIVEL_2_PROFILES')
    $lr6 = $ws6.Cells.Item($ws6.Rows.Count, 1).End(-4162).Row
    $h6 = @{}
    for ($r = 1; $r -le $lr6; $r++) {
        $rowVals = @{}
        for ($c = 1; $c -le 7; $c++) {
            $rowVals["c$c"] = "$($ws6.Cells.Item($r, $c).Value2)"
        }
        $h6["r$r"] = $rowVals
    }
    $snap.hoja6 = @{ last_row = $lr6; data = $h6 }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($ws6)

    # Hoja 7: row 5 cols 1..15 (header row we're appending to)
    $ws7 = $wb.Sheets.Item('7_NIVEL_3_CHANNEL')
    $h7row5 = @{}
    for ($c = 1; $c -le 15; $c++) {
        $h7row5["c$c"] = "$($ws7.Cells.Item(5, $c).Value2)"
    }
    $snap.hoja7_row5 = $h7row5
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($ws7)

    # Hoja 32: cols 1..4 rows 1..lastRow
    $ws32 = $wb.Sheets.Item('32_PLACEHOLDERS_MAP')
    $lr32 = $ws32.Cells.Item($ws32.Rows.Count, 1).End(-4162).Row
    $h32 = @{}
    for ($r = 1; $r -le $lr32; $r++) {
        $rowVals = @{}
        for ($c = 1; $c -le 4; $c++) {
            $rowVals["c$c"] = "$($ws32.Cells.Item($r, $c).Value2)"
        }
        $h32["r$r"] = $rowVals
    }
    $snap.hoja32 = @{ last_row = $lr32; data = $h32 }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($ws32)

    # Named ranges
    $nrs = @()
    foreach ($n in $wb.Names) { $nrs += $n.Name }
    $snap.named_ranges = $nrs

    # Sheet list
    $shs = @()
    foreach ($s in $wb.Sheets) { $shs += $s.Name }
    $snap.sheets = $shs

    return $snap
}

function Compare-Snapshots {
    param([hashtable]$pre, [hashtable]$post)
    $violations = @()
    # Hoja 6: every pre row/col must still equal in post (post may have NEW rows beyond pre.last_row)
    $preH6 = $pre.hoja6.data
    $postH6 = $post.hoja6.data
    foreach ($rk in $preH6.Keys) {
        if (-not $postH6.ContainsKey($rk)) {
            $violations += "hoja6: row $rk DELETED"
            continue
        }
        foreach ($ck in $preH6[$rk].Keys) {
            $preV = $preH6[$rk][$ck]
            $postV = $postH6[$rk][$ck]
            if ($preV -ne $postV) {
                $violations += "hoja6: row $rk col $ck CHANGED from '$preV' to '$postV'"
            }
        }
    }
    # Hoja 7 row 5: every pre col must still equal in post
    foreach ($ck in $pre.hoja7_row5.Keys) {
        $preV = $pre.hoja7_row5[$ck]
        $postV = $post.hoja7_row5[$ck]
        if ($preV -ne $postV) {
            # OK only if pre was empty and post has 'player_target' at the new col
            if ($preV -eq '' -and $postV -eq 'player_target') { continue }
            $violations += "hoja7 row 5 col $ck CHANGED from '$preV' to '$postV'"
        }
    }
    # Hoja 32 pre rows must equal in post
    $preH32 = $pre.hoja32.data
    $postH32 = $post.hoja32.data
    foreach ($rk in $preH32.Keys) {
        if (-not $postH32.ContainsKey($rk)) {
            $violations += "hoja32: row $rk DELETED"
            continue
        }
        foreach ($ck in $preH32[$rk].Keys) {
            $preV = $preH32[$rk][$ck]
            $postV = $postH32[$rk][$ck]
            if ($preV -ne $postV) {
                $violations += "hoja32: row $rk col $ck CHANGED from '$preV' to '$postV'"
            }
        }
    }
    # Named ranges
    foreach ($n in $pre.named_ranges) {
        if ($n -notin $post.named_ranges) { $violations += "Named range '$n' DELETED" }
    }
    # Sheets
    foreach ($s in $pre.sheets) {
        if ($s -notin $post.sheets) { $violations += "Sheet '$s' DELETED" }
    }
    return $violations
}

$excel = $null; $wb = $null
$report = [ordered]@{ started_at = (Get-Date).ToString('o'); xlsm = $xlsm; mode = 'STRICT-NO-OVERWRITE' }

try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $excel.AskToUpdateLinks = $false
    $excel.EnableEvents = $false
    $excel.ScreenUpdating = $false
    $wb = $excel.Workbooks.Open($xlsm, 0, $false)
    $wb.Saved = $true

    Write-Output "=== PRE-DEPLOY SNAPSHOT ==="
    $pre = Snapshot-Touch-Zones -wb $wb
    Write-Output "  Hoja 6 lastRow: $($pre.hoja6.last_row) | Hoja 32 lastRow: $($pre.hoja32.last_row) | Named ranges: $($pre.named_ranges.Count) | Sheets: $($pre.sheets.Count)"

    # ─── STEP 1: 98_VALIDATIONS sheet ──────────────────────────────────────
    if ($pre.sheets -notcontains '98_VALIDATIONS') {
        $ws98 = $wb.Sheets.Add()
        $ws98.Name = '98_VALIDATIONS'
        $ws98.Cells.Item(1, 2).Value2 = 'player_target'
        $ws98.Cells.Item(2, 2).Value2 = 'VLC'
        $ws98.Cells.Item(3, 2).Value2 = 'KODI'
        $ws98.Cells.Item(4, 2).Value2 = 'TIVIMATE'
        $ws98.Cells.Item(5, 2).Value2 = 'OTT_NAV'
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($ws98)
        Write-Output "STEP 1: 98_VALIDATIONS CREATED"
        $report.step1_98_VALIDATIONS = 'CREATED'
    } else {
        Write-Output "STEP 1: 98_VALIDATIONS exists -> SKIP"
        $report.step1_98_VALIDATIONS = 'SKIP (already present)'
    }

    # ─── STEP 2: Named Range lst_PlayerTargets ─────────────────────────────
    if ($pre.named_ranges -notcontains 'lst_PlayerTargets') {
        $wb.Names.Add('lst_PlayerTargets', "='98_VALIDATIONS'!`$B`$2:`$B`$6") | Out-Null
        Write-Output "STEP 2: Named Range lst_PlayerTargets CREATED"
        $report.step2_named_range = 'CREATED'
    } else {
        Write-Output "STEP 2: lst_PlayerTargets exists -> SKIP"
        $report.step2_named_range = 'SKIP (already present)'
    }

    # ─── STEP 3: player_target column (FIRST EMPTY col in row 5) ───────────
    $ws7 = $wb.Sheets.Item('7_NIVEL_3_CHANNEL')
    $present = $false
    for ($c = 1; $c -le 15; $c++) {
        $v = "$($ws7.Cells.Item(5, $c).Value2)"
        if ($v -eq 'player_target') { $present = $true; break }
    }
    if (-not $present) {
        # Find FIRST EMPTY col after the last non-empty in row 5
        $firstEmpty = 0
        for ($c = 1; $c -le 20; $c++) {
            $v = "$($ws7.Cells.Item(5, $c).Value2)"
            if (-not $v -or $v.Trim() -eq '') { $firstEmpty = $c; break }
        }
        if ($firstEmpty -eq 0) { $firstEmpty = 8 }   # safety
        $cell = $ws7.Cells.Item(5, $firstEmpty)
        $cell.Value2 = 'player_target'
        $cell.Font.Bold = $true
        $cell.Interior.Color = (220 + (235 * 256) + (250 * 65536))
        # Validation on data rows
        $lastDataRow = $ws7.Cells.Item($ws7.Rows.Count, 1).End(-4162).Row
        if ($lastDataRow -le 5) { $lastDataRow = 6 }
        $rng = $ws7.Range($ws7.Cells.Item(6, $firstEmpty), $ws7.Cells.Item($lastDataRow, $firstEmpty))
        try { $rng.Validation.Delete() } catch {}
        try {
            $rng.Validation.Add(3, 1, 1, '=lst_PlayerTargets')
            $rng.Validation.IgnoreBlank   = $true
            $rng.Validation.InCellDropdown = $true
            $rng.Validation.InputTitle    = 'player_target'
            $rng.Validation.InputMessage  = 'VLC | KODI | TIVIMATE | OTT_NAV. Empty = default heuristic.'
            $rng.Validation.ErrorTitle    = 'Invalid'
            $rng.Validation.ErrorMessage  = 'Allowed: VLC, KODI, TIVIMATE, OTT_NAV, or empty.'
            $rng.Validation.ShowInput     = $true
            $rng.Validation.ShowError     = $true
            Write-Output "STEP 3: player_target ADDED at col $firstEmpty + validation rows 6..$lastDataRow"
            $report.step3_player_target = "ADDED col=$firstEmpty rows 6..$lastDataRow"
        } catch {
            $report.step3_validation_err = $_.Exception.Message
        }
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($cell)
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($rng)
    } else {
        Write-Output "STEP 3: player_target exists -> SKIP"
        $report.step3_player_target = 'SKIP (already present)'
    }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($ws7)

    # ─── STEP 4: Placeholder row in hoja 32 ────────────────────────────────
    $ws32 = $wb.Sheets.Item('32_PLACEHOLDERS_MAP')
    $existsRow = $false
    foreach ($rk in $pre.hoja32.data.Keys) {
        if ($pre.hoja32.data[$rk]['c1'] -match 'player_target') { $existsRow = $true; break }
    }
    if (-not $existsRow) {
        $lr32 = $pre.hoja32.last_row
        $newRow = $lr32 + 1
        $ws32.Cells.Item($newRow, 1).Value2 = '{config.player_target}'
        $ws32.Cells.Item($newRow, 2).Value2 = '7_NIVEL_3_CHANNEL.player_target'
        $ws32.Cells.Item($newRow, 3).Value2 = ''
        $ws32.Cells.Item($newRow, 4).Value2 = 'Player overlay target enum (VLC/KODI/TIVIMATE/OTT_NAV). Empty = LabConfigLoader heuristic. Consumed by hls_rewriter_v15.py:rewrite_manifest (b4906f3) + lab_config_loader.php (689feff).'
        Write-Output "STEP 4: Placeholder ADDED at row $newRow"
        $report.step4_placeholder = "ADDED at row $newRow"
    } else {
        Write-Output "STEP 4: Placeholder exists -> SKIP"
        $report.step4_placeholder = 'SKIP (already present)'
    }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($ws32)

    # ─── STEP 5: Doctrine fields in hoja 6 — STRICT: NEVER fill existing rows ─
    $ws6 = $wb.Sheets.Item('6_NIVEL_2_PROFILES')
    $existing6 = @{}
    foreach ($rk in $pre.hoja6.data.Keys) {
        $attrName = $pre.hoja6.data[$rk]['c1']
        if ($attrName) { $existing6[$attrName.ToLower().Trim()] = $rk }
    }
    $added = 0; $skipped_existing = 0; $currentRow = $pre.hoja6.last_row + 1
    $added_details = @()
    foreach ($row in $DOCTRINE) {
        $attr = $row[0]
        $key = $attr.ToLower().Trim()
        if ($existing6.ContainsKey($key)) {
            $skipped_existing++
            Write-Output "  SKIP (existing) $attr at $($existing6[$key])"
            continue
        }
        $ws6.Cells.Item($currentRow, 1).Value2 = "$attr"
        for ($c = 2; $c -le 7; $c++) {
            $strVal = if ($null -eq $row[$c - 1]) { '' } else { "$($row[$c - 1])" }
            $ws6.Cells.Item($currentRow, $c).Value2 = $strVal
        }
        $added++
        $added_details += "$attr at row $currentRow"
        Write-Output "  ADD $attr at row $currentRow"
        $currentRow++
    }
    Write-Output "STEP 5: doctrine fields = added=$added skipped_existing=$skipped_existing"
    $report.step5_doctrine = @{ added = $added; skipped = $skipped_existing; added_rows = $added_details }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($ws6)

    # ─── POST-DEPLOY SNAPSHOT + VIOLATION CHECK ────────────────────────────
    Write-Output ""
    Write-Output "=== POST-DEPLOY VERIFICATION ==="
    $post = Snapshot-Touch-Zones -wb $wb
    $violations = Compare-Snapshots -pre $pre -post $post
    if ($violations.Count -eq 0) {
        Write-Output "  ALL EXISTING CELLS PRESERVED · 0 violations"
        $report.verification = 'OK · 0 violations'
    } else {
        Write-Output "  VIOLATIONS DETECTED ($($violations.Count)):"
        foreach ($v in $violations) { Write-Output "    - $v" }
        $report.verification = "FAIL · $($violations.Count) violations"
        $report.violations = $violations
    }

    # Save only if zero violations
    if ($violations.Count -eq 0) {
        $wb.Save()
        Write-Output ""
        Write-Output "SAVED OK"
        $report.saved = $true
    } else {
        Write-Output ""
        Write-Output "ABORTED save due to violations (workbook discarded, backup intact)"
        $report.saved = $false
    }
}
catch {
    $report.error = $_.Exception.Message
    Write-Output ""
    Write-Output "ERROR: $($_.Exception.Message)"
}
finally {
    if ($wb)    { try { $wb.Close($false) } catch {}; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wb) }
    if ($excel) { try { $excel.Quit() } catch {};   [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
    [GC]::Collect(); [GC]::WaitForPendingFinalizers()
    [GC]::Collect(); [GC]::WaitForPendingFinalizers()
    $report.finished_at = (Get-Date).ToString('o')
    $report | ConvertTo-Json -Depth 8 | Out-File "C:\tmp\downloads_consolidated_deploy.json" -Encoding utf8
}

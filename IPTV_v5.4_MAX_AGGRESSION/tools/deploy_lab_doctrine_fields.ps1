$ErrorActionPreference = 'Stop'
Get-Process EXCEL -EA SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 600
Remove-Item "C:\Users\HFRC\Documents\~$*.xlsm" -Force -EA SilentlyContinue

$xlsm = "C:\Users\HFRC\Documents\APE_M3U8_LAB_v8_FIXED.xlsm"
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
Copy-Item $xlsm "$xlsm.bak_pre_doctrine_$ts" -Force

# 19 doctrine fields per CLAUDE.md "Bitrate Fallback por Resolucion" + "Codec Ladder"
# Each row: attr_name, P0, P1, P2, P3, P4, P5
$doctrine = @(
    @('hdr_mode',                 'HDR10','HDR10','HDR10','SDR','SDR','SDR'),
    @('video_range',              'PQ','PQ','PQ','SDR','SDR','SDR'),
    @('color_primaries',          9, 9, 9, 1, 1, 1),           # INTEGER CICP per RFC 8216bis
    @('transfer_characteristics', 16, 16, 16, '', '', ''),     # INT 16=PQ, blank for SDR
    @('matrix_coefficients',      9, 9, 9, '', '', ''),        # INT 9=BT.2020-NCL
    @('codec_primary',            'HEVC','HEVC','HEVC','HEVC','AVC','AVC'),
    @('codec_string',
        'hvc1.2.4.L153.B0,ec-3',
        'hvc1.2.4.L153.B0,ec-3',
        'hvc1.2.4.L150.B0,ec-3',
        'hvc1.2.4.L120.B0,mp4a.40.2',
        'avc1.640028,mp4a.40.2',
        'avc1.42E01E,mp4a.40.2'),
    @('target_framerate',         '60FPS','60FPS','30FPS','60FPS','30FPS','30FPS'),
    @('nits_target',              4000, 1500, 1000, 400, 100, 100),
    @('vmaf_target',              95, 93, 91, 88, 82, 75),
    @('bandwidth_floor',          15000000, 12000000, 8000000, 5000000, 3000000, 1500000),
    @('bandwidth_target',         60000000, 22000000, 12000000, 9000000, 6500000, 4000000),
    @('bandwidth_max',            80000000, 28000000, 16000000, 12000000, 9000000, 5500000),
    @('avg_bandwidth_ratio',      0.75, 0.78, 0.78, 0.78, 0.78, 0.78),
    # 11-tier HEVC cascade (per ARTIFACT_HEVC_11TIER_CASCADE_DEFINITIVE.md)
    @('codec_chain_video',
        'hvc1.2.4.L153.B0,hvc1.2.4.L150.B0,hvc1.2.4.L156.B0,hvc1.2.4.L123.B0,hvc1.2.4.L120.B0,hvc1.2.4.L93.B0,hvc1.1.6.L153.B0,hvc1.1.6.L150.B0,hvc1.1.6.L120.B0,hvc1.1.6.L93.B0,avc1.640028',
        'hvc1.2.4.L153.B0,hvc1.2.4.L150.B0,hvc1.2.4.L156.B0,hvc1.2.4.L123.B0,hvc1.2.4.L120.B0,hvc1.2.4.L93.B0,hvc1.1.6.L153.B0,hvc1.1.6.L150.B0,hvc1.1.6.L120.B0,hvc1.1.6.L93.B0,avc1.640028',
        'hvc1.2.4.L153.B0,hvc1.2.4.L150.B0,hvc1.2.4.L156.B0,hvc1.2.4.L123.B0,hvc1.2.4.L120.B0,hvc1.2.4.L93.B0,hvc1.1.6.L153.B0,hvc1.1.6.L150.B0,hvc1.1.6.L120.B0,hvc1.1.6.L93.B0,avc1.640028',
        'hvc1.2.4.L153.B0,hvc1.2.4.L150.B0,hvc1.2.4.L156.B0,hvc1.2.4.L123.B0,hvc1.2.4.L120.B0,hvc1.2.4.L93.B0,hvc1.1.6.L153.B0,hvc1.1.6.L150.B0,hvc1.1.6.L120.B0,hvc1.1.6.L93.B0,avc1.640028',
        'hvc1.2.4.L153.B0,hvc1.2.4.L150.B0,hvc1.2.4.L156.B0,hvc1.2.4.L123.B0,hvc1.2.4.L120.B0,hvc1.2.4.L93.B0,hvc1.1.6.L153.B0,hvc1.1.6.L150.B0,hvc1.1.6.L120.B0,hvc1.1.6.L93.B0,avc1.640028',
        'hvc1.2.4.L153.B0,hvc1.2.4.L150.B0,hvc1.2.4.L156.B0,hvc1.2.4.L123.B0,hvc1.2.4.L120.B0,hvc1.2.4.L93.B0,hvc1.1.6.L153.B0,hvc1.1.6.L150.B0,hvc1.1.6.L120.B0,hvc1.1.6.L93.B0,avc1.640028'),
    @('codec_chain_video_family',
        'HEVC-MAIN10-L5.1>HEVC-MAIN10-L5.0>HEVC-MAIN10-L5.2>HEVC-MAIN10-L4.1>HEVC-MAIN10-L4.0>HEVC-MAIN10-L3.1>HEVC-MAIN-L5.1>HEVC-MAIN-L5.0>HEVC-MAIN-L4.0>HEVC-MAIN-L3.1>H264-HIGH',
        'HEVC-MAIN10-L5.1>HEVC-MAIN10-L5.0>HEVC-MAIN10-L5.2>HEVC-MAIN10-L4.1>HEVC-MAIN10-L4.0>HEVC-MAIN10-L3.1>HEVC-MAIN-L5.1>HEVC-MAIN-L5.0>HEVC-MAIN-L4.0>HEVC-MAIN-L3.1>H264-HIGH',
        'HEVC-MAIN10-L5.1>HEVC-MAIN10-L5.0>HEVC-MAIN10-L5.2>HEVC-MAIN10-L4.1>HEVC-MAIN10-L4.0>HEVC-MAIN10-L3.1>HEVC-MAIN-L5.1>HEVC-MAIN-L5.0>HEVC-MAIN-L4.0>HEVC-MAIN-L3.1>H264-HIGH',
        'HEVC-MAIN10-L5.1>HEVC-MAIN10-L5.0>HEVC-MAIN10-L5.2>HEVC-MAIN10-L4.1>HEVC-MAIN10-L4.0>HEVC-MAIN10-L3.1>HEVC-MAIN-L5.1>HEVC-MAIN-L5.0>HEVC-MAIN-L4.0>HEVC-MAIN-L3.1>H264-HIGH',
        'HEVC-MAIN10-L5.1>HEVC-MAIN10-L5.0>HEVC-MAIN10-L5.2>HEVC-MAIN10-L4.1>HEVC-MAIN10-L4.0>HEVC-MAIN10-L3.1>HEVC-MAIN-L5.1>HEVC-MAIN-L5.0>HEVC-MAIN-L4.0>HEVC-MAIN-L3.1>H264-HIGH',
        'HEVC-MAIN10-L5.1>HEVC-MAIN10-L5.0>HEVC-MAIN10-L5.2>HEVC-MAIN10-L4.1>HEVC-MAIN10-L4.0>HEVC-MAIN10-L3.1>HEVC-MAIN-L5.1>HEVC-MAIN-L5.0>HEVC-MAIN-L4.0>HEVC-MAIN-L3.1>H264-HIGH'),
    @('codec_chain_audio',        'ec-3,ac-3,mp4a.40.2,mp4a.40.5','ec-3,ac-3,mp4a.40.2,mp4a.40.5','ec-3,ac-3,mp4a.40.2,mp4a.40.5','ec-3,ac-3,mp4a.40.2,mp4a.40.5','ec-3,ac-3,mp4a.40.2,mp4a.40.5','ec-3,ac-3,mp4a.40.2,mp4a.40.5'),
    @('codec_chain_hdr',          'hdr10,hlg,sdr','hdr10,hlg,sdr','hdr10,hlg,sdr','sdr','sdr','sdr'),
    @('codec_chain_player_pref',  'hvc1,hev1,h265,avc1,h264','hvc1,hev1,h265,avc1,h264','hvc1,hev1,h265,avc1,h264','hvc1,hev1,h265,avc1,h264','avc1,h264,hvc1,hev1','avc1,h264')
)

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
    $lastRow = $ws.Cells.Item($ws.Rows.Count, 1).End(-4162).Row   # xlUp
    Write-Output "Hoja 6 lastRow (pre): $lastRow"

    # Build map of existing attribute names → row (case-insensitive)
    $existing = @{}
    for ($r = 1; $r -le $lastRow; $r++) {
        $v = "$($ws.Cells.Item($r, 1).Value2)"
        if ($v) {
            $existing[$v.ToLower().Trim()] = $r
        }
    }

    $added = 0
    $updated = 0
    $skipped = 0
    $currentRow = $lastRow + 1
    foreach ($row in $doctrine) {
        $attr = $row[0]
        $key = $attr.ToLower().Trim()
        if ($existing.ContainsKey($key)) {
            $r = $existing[$key]
            $hasNonEmpty = $false
            for ($c = 2; $c -le 7; $c++) {
                $v = "$($ws.Cells.Item($r, $c).Value2)"
                if ($v -and $v.Trim() -ne '') { $hasNonEmpty = $true; break }
            }
            if ($hasNonEmpty) {
                $skipped++
                Write-Output "  SKIP $attr (already has values at row $r)"
                continue
            }
            # Fill empty cells of existing row (all as string · see ADD note)
            for ($c = 2; $c -le 7; $c++) {
                $val = $row[$c - 1]
                $strVal = if ($null -eq $val) { '' } else { "$val" }
                $ws.Cells.Item($r, $c).Value2 = $strVal
            }
            $updated++
            Write-Output "  FILL $attr at row $r"
        } else {
            # Append new row. Convert ALL values to strings to avoid PS/COM
            # type-marshal grief. Brain_ExportToFrontend's coerceNumericStrings
            # path (per feedback_lab_numeric_coercion_scope) will convert
            # numeric-looking strings back to numbers in JSON for the right
            # sections (settings/hlsjs/prefetch_config).
            $ws.Cells.Item($currentRow, 1).Value2 = "$attr"
            for ($c = 2; $c -le 7; $c++) {
                $val = $row[$c - 1]
                $strVal = if ($null -eq $val) { '' } else { "$val" }
                $ws.Cells.Item($currentRow, $c).Value2 = $strVal
            }
            $added++
            Write-Output "  ADD  $attr at row $currentRow"
            $currentRow++
        }
    }
    Write-Output ""
    Write-Output "Summary: added=$added updated=$updated skipped=$skipped"

    $wb.Save()
    Write-Output "Saved OK"
}
finally {
    if ($wb)    { try { $wb.Close($false) } catch {}; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wb) }
    if ($excel) { try { $excel.Quit() } catch {};   [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
    [GC]::Collect(); [GC]::WaitForPendingFinalizers()
    [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}

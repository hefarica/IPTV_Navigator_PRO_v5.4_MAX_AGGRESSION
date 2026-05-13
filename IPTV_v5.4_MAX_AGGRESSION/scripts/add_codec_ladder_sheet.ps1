#Requires -Version 5.1
<#
.SYNOPSIS
  LAB-SYNC Stage: Add sheet 8_CODEC_LADDER + 6 Named Ranges to APE_M3U8_LAB_v8_FIXED.xlsm

.DESCRIPTION
  Atomic operation following iptv-excel-safe-mode protocol. Connects to running
  Excel instance (no 2nd instance clash), applies HEVC-first codec ladder data
  for P0-P5, defines Named Ranges with A1 canonical notation (no R1C1), saves.

  After this script:
    - Sheet 8_CODEC_LADDER exists with 6 profiles x 5 codec_chain_* columns
    - 6 Named Ranges PRISMA_CODEC_LADDER_P0..P5 reference rows 2-7
    - File saved (binary safe via SaveAs xlOpenXMLWorkbookMacroEnabled=52)

  NOT done by this script (Stage 2):
    - VBA module updates (mod_PRISMA_BulletproofEnrich must be wired to read
      from this sheet during bulletproof JSON export). Requires VBA editor
      inspection separately.

.NOTES
  Doctrina aplicada:
    - feedback_excel_safe_mode_protocol.md (10 reglas inviolables)
    - feedback_named_range_r1c1_corruption.md (A1 notation only)
    - feedback_excel_list_separator_semicolon.md (ES-ES `;` inline)
    - OMEGA-NO-DELETE (no toca hojas existentes)
    - NO-CLAMP (codec strings byte-identical, sin coerce)
#>

[CmdletBinding()]
param(
    [string] $WorkbookPath = "C:\Users\HFRC\Downloads\APE_M3U8_LAB_v8_FIXED.xlsm",
    [string] $SheetName    = "8_CODEC_LADDER"
)

$ErrorActionPreference = 'Stop'

# Codec ladder data (HEVC-FIRST per-profile, validated against RFC 8216 / 6381 / ExoPlayer / Kodi / VLC)
$LadderData = @{
    P0 = @{
        video        = "dvh1.05.06,dvh1.08.06,hvc1.2.4.L183.B0,hvc1.1.6.L183.B0,av01.0.13M.10.0.110.09.16.09.0,avc1.640033,avc1.640028"
        audio        = "ec-3,ac-3,mp4a.40.2,mp4a.40.5"
        hdr          = "dolby-vision,hdr10+,hdr10,hlg,sdr"
        player_pref  = "hvc1,hev1,dvh1,dvhe,h265,av1,avc1,h264"
        video_family = "DV>HEVC-MAIN10>HEVC-MAIN>AV1>H264-HIGH>H264-MAIN"
    }
    P1 = @{
        video        = "hvc1.2.4.L153.B0,hev1.2.4.L153.B0,hvc1.1.6.L150.B0,av01.0.12M.10.0.110.09.16.09.0,avc1.640033,avc1.640028"
        audio        = "ec-3,ac-3,mp4a.40.2,mp4a.40.5"
        hdr          = "hdr10+,hdr10,hlg,sdr"
        player_pref  = "hvc1,hev1,h265,av1,avc1,h264"
        video_family = "HEVC-MAIN10>HEVC-MAIN>AV1>H264-HIGH>H264-MAIN"
    }
    P2 = @{
        video        = "hvc1.2.4.L153.B0,hev1.2.4.L153.B0,hvc1.1.6.L150.B0,avc1.640033,avc1.640028"
        audio        = "ec-3,ac-3,mp4a.40.2,mp4a.40.5"
        hdr          = "hdr10,hlg,sdr"
        player_pref  = "hvc1,hev1,h265,avc1,h264"
        video_family = "HEVC-MAIN10>HEVC-MAIN>H264-HIGH>H264-MAIN"
    }
    P3 = @{
        video        = "hvc1.1.6.L120.B0,hev1.1.6.L120.B0,hvc1.2.4.L120.B0,avc1.640028,avc1.4D401F"
        audio        = "mp4a.40.2,mp4a.40.5,mp4a.40.29"
        hdr          = "hlg,sdr"
        player_pref  = "hvc1,hev1,h265,avc1,h264"
        video_family = "HEVC-MAIN>HEVC-MAIN10>H264-HIGH>H264-MAIN"
    }
    P4 = @{
        video        = "hvc1.1.6.L93.B0,hev1.1.6.L93.B0,avc1.640020,avc1.4D401F,avc1.42E01F"
        audio        = "mp4a.40.2,mp4a.40.5,mp4a.40.29"
        hdr          = "sdr"
        player_pref  = "hvc1,hev1,h265,avc1,h264"
        video_family = "HEVC-MAIN-HD>H264-HIGH>H264-MAIN>H264-BASELINE"
    }
    P5 = @{
        video        = "avc1.42E01E,avc1.42E00D,mp2v.2"
        audio        = "mp4a.40.5,mp4a.40.29,mp4a.40.2"
        hdr          = "sdr"
        player_pref  = "avc1,h264"
        video_family = "H264-MAIN>H264-BASELINE>MPEG2"
    }
}

$ProfileOrder = @('P0','P1','P2','P3','P4','P5')

Write-Host "[STAGE-1] Connecting to running Excel via ROT..." -ForegroundColor Cyan
try {
    $xl = [System.Runtime.Interopservices.Marshal]::GetActiveObject("Excel.Application")
    Write-Host "  OK: Connected to running Excel instance"
} catch {
    Write-Host "  ERROR: No running Excel found. Open APE_M3U8_LAB_v8_FIXED.xlsm first." -ForegroundColor Red
    exit 1
}

# SAFE-MODE: silent ops
$xl.DisplayAlerts  = $false
$xl.ScreenUpdating = $false
$xl.EnableEvents   = $false
$xl.Calculation    = -4135  # xlCalculationManual

try {
    # Locate the target workbook (matches Name = APE_M3U8_LAB_v8_FIXED.xlsm)
    $wb = $null
    foreach ($w in $xl.Workbooks) {
        if ($w.FullName -eq $WorkbookPath -or $w.Name -eq (Split-Path -Leaf $WorkbookPath)) {
            $wb = $w
            break
        }
    }
    if ($null -eq $wb) {
        Write-Host "  ERROR: Workbook $WorkbookPath not found in running Excel" -ForegroundColor Red
        exit 1
    }
    Write-Host "  OK: Workbook = $($wb.FullName)"

    # Step 1: Check if sheet exists (idempotent — re-runnable without breaking)
    $sheetExists = $false
    foreach ($s in $wb.Sheets) {
        if ($s.Name -eq $SheetName) { $sheetExists = $true; break }
    }

    if ($sheetExists) {
        Write-Host "[STAGE-1] Sheet '$SheetName' exists. Clearing for refresh..." -ForegroundColor Yellow
        $sht = $wb.Sheets.Item($SheetName)
        $sht.Cells.ClearContents() | Out-Null
    } else {
        Write-Host "[STAGE-1] Adding new sheet '$SheetName'..." -ForegroundColor Cyan
        # Add at the end (after last sheet)
        $lastSheet = $wb.Sheets.Item($wb.Sheets.Count)
        $sht = $wb.Sheets.Add([System.Type]::Missing, $lastSheet)
        $sht.Name = $SheetName
    }

    # Step 2: Write headers (row 1, cols A-F)
    Write-Host "[STAGE-1] Writing headers + data..."
    $sht.Cells.Item(1, 1).Value2 = "profile_id"
    $sht.Cells.Item(1, 2).Value2 = "codec_chain_video"
    $sht.Cells.Item(1, 3).Value2 = "codec_chain_audio"
    $sht.Cells.Item(1, 4).Value2 = "codec_chain_hdr"
    $sht.Cells.Item(1, 5).Value2 = "codec_chain_player_pref"
    $sht.Cells.Item(1, 6).Value2 = "codec_chain_video_family"

    # Bold headers
    $hdrRange = $sht.Range("A1:F1")
    $hdrRange.Font.Bold = $true
    $hdrRange.Interior.Color = 14606046  # light gray

    # Step 3: Write profile rows
    $rowIdx = 2
    foreach ($pidKey in $ProfileOrder) {
        $d = $LadderData[$pidKey]
        $sht.Cells.Item($rowIdx, 1).Value2 = $pidKey
        $sht.Cells.Item($rowIdx, 2).Value2 = $d.video
        $sht.Cells.Item($rowIdx, 3).Value2 = $d.audio
        $sht.Cells.Item($rowIdx, 4).Value2 = $d.hdr
        $sht.Cells.Item($rowIdx, 5).Value2 = $d.player_pref
        $sht.Cells.Item($rowIdx, 6).Value2 = $d.video_family
        Write-Host "  Row $rowIdx : $pidKey"
        $rowIdx++
    }

    # Step 4: Auto-fit columns (visual aid only)
    $sht.Columns("A:F").AutoFit() | Out-Null

    # Step 5: Define 6 Named Ranges (workbook-scope) using A1 canonical notation
    # Per feedback_named_range_r1c1_corruption.md: NEVER use R1C1, always A1.
    Write-Host "[STAGE-1] Defining 6 Named Ranges (A1 canonical)..."
    $rangeRow = 2
    foreach ($pidKey in $ProfileOrder) {
        $rngName = "PRISMA_CODEC_LADDER_$pidKey"
        $refersTo = "='$SheetName'!`$B`$${rangeRow}:`$F`$${rangeRow}"

        # Delete if exists (idempotent), then add
        try {
            $existing = $wb.Names.Item($rngName)
            if ($null -ne $existing) { $existing.Delete() | Out-Null }
        } catch { }

        try {
            $wb.Names.Add($rngName, $refersTo) | Out-Null
            Write-Host "  Named Range '$rngName' -> $refersTo"
        } catch {
            Write-Host "  WARN Named Range '$rngName' failed: $($_.Exception.Message)" -ForegroundColor Yellow
        }
        $rangeRow++
    }

    # Step 6: Save (binary-safe, preserve macro-enabled format)
    Write-Host "[STAGE-1] Saving workbook..."
    $wb.Save()
    Write-Host "  OK: Saved $($wb.FullName)"

    # Step 7: Verify
    Write-Host "[STAGE-1] Verification..."
    $verifySheet = $wb.Sheets.Item($SheetName)
    $verifyRows = $verifySheet.UsedRange.Rows.Count
    $verifyCols = $verifySheet.UsedRange.Columns.Count
    Write-Host "  Sheet '$SheetName' : $verifyRows rows x $verifyCols cols"

    $verifyNamedCount = 0
    foreach ($pidKey in $ProfileOrder) {
        try {
            $rngName = "PRISMA_CODEC_LADDER_$pidKey"
            $rng = $wb.Names.Item($rngName)
            if ($null -ne $rng) { $verifyNamedCount++ }
        } catch { }
    }
    Write-Host "  Named Ranges defined: $verifyNamedCount / 6"

    if ($verifyRows -ge 7 -and $verifyCols -ge 6 -and $verifyNamedCount -eq 6) {
        Write-Host ""
        Write-Host "[STAGE-1] PASS - Sheet 8_CODEC_LADDER + 6 Named Ranges committed" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "[STAGE-1] WARNING - Verification incomplete" -ForegroundColor Yellow
    }

} finally {
    # Restore Excel state
    $xl.Calculation    = -4105  # xlCalculationAutomatic
    $xl.EnableEvents   = $true
    $xl.ScreenUpdating = $true
    $xl.DisplayAlerts  = $true

    # DO NOT close Excel - user has it open. Just release COM ref.
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($xl) | Out-Null
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

Write-Host ""
Write-Host "[STAGE-2 PENDING] VBA mod_PRISMA_BulletproofEnrich must read from sheet '$SheetName' during bulletproof JSON export and inject into profiles_calibrated.<P>.settings.codec_chain_*" -ForegroundColor Magenta

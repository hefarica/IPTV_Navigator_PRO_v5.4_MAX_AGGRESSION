#Requires -Version 5.1
<#
.SYNOPSIS
  LAB-SYNC Stage 2 (additive only): Add helper VBA module mod_PRISMA_CodecLadder_Read.

.DESCRIPTION
  Adds a NEW VBA module with a single pure read function GetCodecLadder(profileId, fieldName)
  that reads from sheet 8_CODEC_LADDER via Named Ranges PRISMA_CODEC_LADDER_P0..P5.

  This is ADDITIVE only — does NOT modify existing modules (OMEGA-NO-DELETE compliant).

  After this script:
    - VBA module mod_PRISMA_CodecLadder_Read exists
    - Function GetCodecLadder(profileId, fieldName) returns String
    - Other VBA modules (mod_PRISMA_BulletproofEnrich, mod_PRISMA_Resolver, etc.)
      can now call: mod_PRISMA_CodecLadder_Read.GetCodecLadder("P0", "video")

  NOT done by this script (follow-up Stage 3):
    - Wiring GetCodecLadder() into mod_PRISMA_BulletproofEnrich's bulletproof export
      to inject profiles_calibrated.<P>.settings.codec_chain_* during export.
    - Wiring into mod_PRISMA_Resolver's ResolvePlaceholder for {prisma.codec_chain_*}.

.NOTES
  Doctrina aplicada:
    - feedback_vba_module_name_vs_sub_name.md (Module name != Sub name; use mod_ prefix)
    - feedback_excel_safe_mode_protocol.md
    - OMEGA-NO-DELETE
#>

[CmdletBinding()]
param(
    [string] $WorkbookPath = "C:\Users\HFRC\Downloads\APE_M3U8_LAB_v8_FIXED.xlsm",
    [string] $ModuleName   = "mod_PRISMA_CodecLadder_Read"
)

$ErrorActionPreference = 'Stop'

$VbaCode = @'
Attribute VB_Name = "mod_PRISMA_CodecLadder_Read"
'==============================================================================
' mod_PRISMA_CodecLadder_Read
'------------------------------------------------------------------------------
' Pure read helper for HEVC-FIRST codec ladder (sheet 8_CODEC_LADDER).
' Generated 2026-04-30 by add_codec_ladder_vba_helper.ps1
'
' Doctrina:
'   - HEVC-FIRST visual quality maximizer (P0-P4 lead with HEVC; P5 H.264)
'   - Reads from Named Ranges PRISMA_CODEC_LADDER_P0..P5 (A1 canonical)
'   - NO-CLAMP: returns text byte-identical (no Trim, no UCase, no coerce)
'   - Module name (mod_*) differs from any Sub name (Application.Run safety)
'==============================================================================
Option Explicit

' Public field constants (callers use these instead of literal strings).
Public Const CL_VIDEO        As String = "video"
Public Const CL_AUDIO        As String = "audio"
Public Const CL_HDR          As String = "hdr"
Public Const CL_PLAYER_PREF  As String = "player_pref"
Public Const CL_VIDEO_FAMILY As String = "video_family"

'------------------------------------------------------------------------------
' GetCodecLadder
'   profileId  : "P0".."P5"
'   fieldName  : one of CL_VIDEO/CL_AUDIO/CL_HDR/CL_PLAYER_PREF/CL_VIDEO_FAMILY
'   Returns    : codec chain string (comma-separated for video/audio/hdr/pref,
'                ">"-separated for video_family). Empty string if unknown.
'------------------------------------------------------------------------------
Public Function GetCodecLadder(ByVal profileId As String, ByVal fieldName As String) As String
    Dim rngName As String
    Dim rng As Range
    Dim colIdx As Long

    rngName = "PRISMA_CODEC_LADDER_" & profileId

    On Error Resume Next
    Set rng = ThisWorkbook.Names(rngName).RefersToRange
    On Error GoTo 0

    If rng Is Nothing Then
        GetCodecLadder = ""
        Exit Function
    End If

    Select Case LCase$(fieldName)
        Case CL_VIDEO:        colIdx = 1
        Case CL_AUDIO:        colIdx = 2
        Case CL_HDR:          colIdx = 3
        Case CL_PLAYER_PREF:  colIdx = 4
        Case CL_VIDEO_FAMILY: colIdx = 5
        Case Else
            GetCodecLadder = ""
            Exit Function
    End Select

    On Error Resume Next
    GetCodecLadder = CStr(rng.Cells(1, colIdx).Value)
    On Error GoTo 0
End Function

'------------------------------------------------------------------------------
' ValidateCodecLadder
'   Checks that all 6 Named Ranges resolve and have non-empty values.
'   Returns count of OK profiles (6 = all good).
'------------------------------------------------------------------------------
Public Function ValidateCodecLadder() As Long
    Dim profiles(0 To 5) As String
    profiles(0) = "P0": profiles(1) = "P1": profiles(2) = "P2"
    profiles(3) = "P3": profiles(4) = "P4": profiles(5) = "P5"

    Dim okCount As Long
    Dim i As Long
    For i = 0 To 5
        If Len(GetCodecLadder(profiles(i), CL_VIDEO)) > 0 _
           And Len(GetCodecLadder(profiles(i), CL_AUDIO)) > 0 _
           And Len(GetCodecLadder(profiles(i), CL_HDR)) > 0 _
           And Len(GetCodecLadder(profiles(i), CL_PLAYER_PREF)) > 0 _
           And Len(GetCodecLadder(profiles(i), CL_VIDEO_FAMILY)) > 0 Then
            okCount = okCount + 1
        End If
    Next i

    ValidateCodecLadder = okCount
End Function

'------------------------------------------------------------------------------
' DoctrineCheck_P5_NoAdvanced
'   Anti-falsification check: P5 must NOT contain av01/AV1/VP9/hvc1/HEVC anywhere.
'   Returns True if P5 is clean (H.264 only); False if doctrine violated.
'------------------------------------------------------------------------------
Public Function DoctrineCheck_P5_NoAdvanced() As Boolean
    Dim s As String
    s = LCase$(GetCodecLadder("P5", CL_VIDEO)) & "|" & _
        LCase$(GetCodecLadder("P5", CL_PLAYER_PREF)) & "|" & _
        LCase$(GetCodecLadder("P5", CL_VIDEO_FAMILY))

    DoctrineCheck_P5_NoAdvanced = (InStr(s, "av01") = 0 _
                                And InStr(s, "av1") = 0 _
                                And InStr(s, "vp9") = 0 _
                                And InStr(s, "hvc1") = 0 _
                                And InStr(s, "hev1") = 0 _
                                And InStr(s, "hevc") = 0 _
                                And InStr(s, "dvh1") = 0)
End Function
'@

Write-Host "[STAGE-2] Connecting to running Excel via ROT..." -ForegroundColor Cyan
try {
    $xl = [System.Runtime.Interopservices.Marshal]::GetActiveObject("Excel.Application")
    Write-Host "  OK: Connected to running Excel instance"
} catch {
    Write-Host "  ERROR: No running Excel found." -ForegroundColor Red
    exit 1
}

$xl.DisplayAlerts  = $false
$xl.ScreenUpdating = $false
$xl.EnableEvents   = $false

try {
    # Locate the target workbook
    $wb = $null
    foreach ($w in $xl.Workbooks) {
        if ($w.Name -eq (Split-Path -Leaf $WorkbookPath)) {
            $wb = $w
            break
        }
    }
    if ($null -eq $wb) {
        Write-Host "  ERROR: Workbook not found in running Excel" -ForegroundColor Red
        exit 1
    }
    Write-Host "  OK: Workbook = $($wb.FullName)"

    # Check VBA project access
    try {
        $vbp = $wb.VBProject
        Write-Host "  OK: VBProject accessible (Trust Access enabled)"
    } catch {
        Write-Host "  ERROR: VBProject not accessible. Excel: File->Options->Trust Center->Trust Center Settings->Macro Settings->'Trust access to the VBA project object model'" -ForegroundColor Red
        exit 1
    }

    # Idempotent: remove existing module if present
    $existing = $null
    foreach ($comp in $vbp.VBComponents) {
        if ($comp.Name -eq $ModuleName) { $existing = $comp; break }
    }
    if ($null -ne $existing) {
        Write-Host "[STAGE-2] Module '$ModuleName' exists. Removing for refresh..." -ForegroundColor Yellow
        $vbp.VBComponents.Remove($existing) | Out-Null
    }

    Write-Host "[STAGE-2] Adding new VBA module '$ModuleName'..."
    # vbext_ct_StdModule = 1
    $newComp = $vbp.VBComponents.Add(1)
    $newComp.Name = $ModuleName

    # Replace generated code with our code (skip the auto-inserted Attribute VB_Name)
    # Add full code via AddFromString (omit "Attribute VB_Name=..." since Add(1) already set name)
    $codeToInsert = $VbaCode -replace '(?ms)^Attribute VB_Name = ".*?"\r?\n', ''
    # Clear default empty content first
    if ($newComp.CodeModule.CountOfLines -gt 0) {
        $newComp.CodeModule.DeleteLines(1, $newComp.CodeModule.CountOfLines) | Out-Null
    }
    $newComp.CodeModule.AddFromString($codeToInsert)

    Write-Host "[STAGE-2] Saving workbook..."
    $wb.Save()
    Write-Host "  OK: Saved $($wb.FullName)"

    Write-Host "[STAGE-2] Running ValidateCodecLadder via Application.Run..."
    try {
        $okCount = $xl.Run("$ModuleName.ValidateCodecLadder")
        Write-Host "  ValidateCodecLadder() = $okCount / 6"
    } catch {
        Write-Host "  WARN: Could not run ValidateCodecLadder: $($_.Exception.Message)" -ForegroundColor Yellow
        $okCount = 0
    }

    try {
        $p5Clean = $xl.Run("$ModuleName.DoctrineCheck_P5_NoAdvanced")
        Write-Host "  DoctrineCheck_P5_NoAdvanced() = $p5Clean (must be True)"
    } catch {
        Write-Host "  WARN: Could not run DoctrineCheck_P5: $($_.Exception.Message)" -ForegroundColor Yellow
        $p5Clean = $false
    }

    if ($okCount -eq 6 -and $p5Clean -eq $true) {
        Write-Host ""
        Write-Host "[STAGE-2] PASS - mod_PRISMA_CodecLadder_Read added + 6/6 profiles valid + P5 doctrine clean" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "[STAGE-2] WARNING - Validation incomplete (okCount=$okCount, p5Clean=$p5Clean)" -ForegroundColor Yellow
    }

} finally {
    $xl.EnableEvents   = $true
    $xl.ScreenUpdating = $true
    $xl.DisplayAlerts  = $true
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($xl) | Out-Null
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

Write-Host ""
Write-Host "[STAGE-3 PENDING] Wire mod_PRISMA_CodecLadder_Read.GetCodecLadder() into:" -ForegroundColor Magenta
Write-Host "  - mod_PRISMA_BulletproofEnrich: inject profiles_calibrated.<P>.settings.codec_chain_* during export" -ForegroundColor Magenta
Write-Host "  - mod_PRISMA_Resolver.ResolvePlaceholder: handle {prisma.codec_chain_*} placeholders" -ForegroundColor Magenta

Attribute VB_Name = "mod_PRISMA_CoherenceGuard"
Option Explicit

' ============================================================================
' PRISMA Coherence Guard — bloquea export si hay incoherencia HDR/SDR.
' Stage 2 del plan 2026-04-30-iptv-lista-coherence-fix.
'
' Uso recomendado: hookear ValidateCoherence() en btnExportToFrontend ANTES
' de Brain_ExportToFrontend. Si devuelve False, abortar export.
'
' Reglas:
'   R1: si hdr_canonical=sdr → video-filter NO debe contener 'st2084'
'   R2: si hdr_canonical=hdr10|hdr10+|dolby-vision → video-filter DEBE contener 'st2084'
'   R3: si hdr_canonical=hlg → video-filter DEBE contener 'arib-std-b67'
'   R4: nits_target debe coincidir con tier
'        sdr<=200, hlg<=500, hdr10>=1000, hdr10+>=1500, dolby-vision>=4000
'   R5: A1-A2 dedupe — header global no debe contener 'omega-live-P0' literal
'        (debe ser 'omega-live-{profile}' o 'omega-live-MULTI')
' ============================================================================

Public Function ValidateCoherence() As Boolean
    Dim ws As Worksheet
    Dim profileRow As Long
    Dim hdr As String
    Dim filter As String
    Dim nits As Long
    Dim violations As String

    On Error Resume Next
    Set ws = ThisWorkbook.Sheets("7_NIVEL_3_CHANNEL")
    On Error GoTo 0
    If ws Is Nothing Then
        MsgBox "Sheet 7_NIVEL_3_CHANNEL no existe", vbCritical, "PRISMA"
        ValidateCoherence = False
        Exit Function
    End If

    violations = ""

    ' Buscar columnas por nombre (header en row 1)
    Dim colHdrCanonical As Long
    Dim colNitsTarget As Long
    Dim colVideoFilter As Long
    colHdrCanonical = FindColumn(ws, "hdr_canonical")
    colNitsTarget = FindColumn(ws, "nits_target")
    colVideoFilter = FindColumn(ws, "video_filter")

    If colHdrCanonical = 0 Or colNitsTarget = 0 Or colVideoFilter = 0 Then
        violations = violations & "PRE-FLIGHT: columnas hdr_canonical/nits_target/video_filter no existen en hoja 7_NIVEL_3_CHANNEL." & vbCrLf
        violations = violations & "Stage 2 del plan: agregar estas columnas via Brain_SyncMatrixFromCuratedSheets." & vbCrLf
        MsgBox violations, vbExclamation, "PRISMA Coherence Guard"
        ValidateCoherence = False
        Exit Function
    End If

    ' Validar P0..P5 (rows 2..7 esperados)
    For profileRow = 2 To 7
        hdr = LCase(Trim(CStr(ws.Cells(profileRow, colHdrCanonical).Value)))
        filter = LCase(Trim(CStr(ws.Cells(profileRow, colVideoFilter).Value)))
        nits = CLng(Val(ws.Cells(profileRow, colNitsTarget).Value))

        ' R1
        If hdr = "sdr" And InStr(filter, "st2084") > 0 Then
            violations = violations & "R1 fail: P" & (profileRow - 2) & " sdr+st2084" & vbCrLf
        End If
        ' R2
        If (hdr = "hdr10" Or hdr = "hdr10+" Or hdr = "dolby-vision") And InStr(filter, "st2084") = 0 Then
            violations = violations & "R2 fail: P" & (profileRow - 2) & " " & hdr & " sin st2084" & vbCrLf
        End If
        ' R3
        If hdr = "hlg" And InStr(filter, "arib-std-b67") = 0 Then
            violations = violations & "R3 fail: P" & (profileRow - 2) & " hlg sin arib-std-b67" & vbCrLf
        End If
        ' R4
        Select Case hdr
            Case "sdr"
                If nits > 200 Then violations = violations & "R4 fail: P" & (profileRow - 2) & " sdr nits=" & nits & " >200" & vbCrLf
            Case "hlg"
                If nits > 500 Then violations = violations & "R4 fail: P" & (profileRow - 2) & " hlg nits=" & nits & " >500" & vbCrLf
            Case "hdr10"
                If nits < 1000 Then violations = violations & "R4 fail: P" & (profileRow - 2) & " hdr10 nits=" & nits & " <1000" & vbCrLf
            Case "hdr10+"
                If nits < 1500 Then violations = violations & "R4 fail: P" & (profileRow - 2) & " hdr10+ nits=" & nits & " <1500" & vbCrLf
            Case "dolby-vision"
                If nits < 4000 Then violations = violations & "R4 fail: P" & (profileRow - 2) & " dv nits=" & nits & " <4000" & vbCrLf
        End Select
    Next profileRow

    ' R5: validar header global no contenga "omega-live-P0" hardcoded
    Dim wsHeader As Worksheet
    On Error Resume Next
    Set wsHeader = ThisWorkbook.Sheets("3_NIVEL_1_HEADER")
    On Error GoTo 0
    If Not wsHeader Is Nothing Then
        Dim r As Long
        Dim cell As String
        For r = 2 To wsHeader.UsedRange.Rows.Count
            cell = CStr(wsHeader.Cells(r, 1).Value)
            If InStr(cell, "omega-live-P0") > 0 Then
                violations = violations & "R5 fail: header global hoja 3_NIVEL_1_HEADER row " & r & " contiene 'omega-live-P0' literal — debe ser 'omega-live-{profile}'" & vbCrLf
            End If
            If InStr(cell, "P0_PERPROFILE_BULLETPROOF") > 0 Then
                violations = violations & "R5 fail: header global row " & r & " contiene 'P0_PERPROFILE_BULLETPROOF' hardcoded — debe ser '{profile}_PERPROFILE_BULLETPROOF'" & vbCrLf
            End If
        Next r
    End If

    If Len(violations) > 0 Then
        MsgBox "Coherence Guard violations:" & vbCrLf & vbCrLf & violations & vbCrLf & "Export ABORTADO. Corrige las celdas y vuelve a exportar.", vbCritical, "PRISMA Coherence Guard"
        ValidateCoherence = False
    Else
        ValidateCoherence = True
    End If
End Function

Private Function FindColumn(ws As Worksheet, headerName As String) As Long
    Dim c As Long
    Dim lastCol As Long
    lastCol = ws.Cells(1, ws.Columns.Count).End(xlToLeft).Column
    For c = 1 To lastCol
        If LCase(Trim(CStr(ws.Cells(1, c).Value))) = LCase(Trim(headerName)) Then
            FindColumn = c
            Exit Function
        End If
    Next c
    FindColumn = 0
End Function

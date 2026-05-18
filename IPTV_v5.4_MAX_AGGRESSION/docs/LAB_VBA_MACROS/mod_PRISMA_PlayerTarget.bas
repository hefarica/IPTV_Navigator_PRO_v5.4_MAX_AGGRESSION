Attribute VB_Name = "mod_PRISMA_PlayerTarget"
' ╔══════════════════════════════════════════════════════════════════════════╗
' ║  mod_PRISMA_PlayerTarget — Fase D-2 LAB · player_target SSOT column      ║
' ║  IPTV Navigator PRO v5.4 · APE_M3U8_LAB_v8_FIXED.xlsm                  ║
' ╚══════════════════════════════════════════════════════════════════════════╝
'
' PURPOSE
'   Adds a 'player_target' column to LAB SSOT (sheet 7_NIVEL_3_CHANNEL) and a
'   resolver placeholder ({config.player_target}) to sheet 32_PLACEHOLDERS_MAP.
'
'   The column drives per-channel player-specific overlay injection in:
'     · backend/frontend_v15/hls_rewriter_v15.py:rewrite_manifest() (commit b4906f3)
'     · vps/prisma/lib/lab_config_loader.php::playerTargetForChannel() (commit 689feff)
'
' ENUM VALUES (Named Range A1-canonical · ES-ES list separator `;`):
'   VLC ; KODI ; TIVIMATE ; OTT_NAV ; (empty for "no overlay")
'
' GATE 1 CABLEADO:
'   · Python consumer ya wired al `profile_config['player_target']` field
'   · PHP backend resolver disponible vía LabConfigLoader::playerTargetForChannel()
'   · Esta macro completa el SSOT end-to-end (LAB → JSON → consumers)
'
' GATE 3 SANDBOX SAFETY (Excel safe-mode mandatory checklist):
'   ⚠ BEFORE RUNNING THIS MACRO:
'      [ ] Excel está CERRADO en otras instancias (anti-2-instances clash)
'      [ ] Backup taken: APE_M3U8_LAB_v8_FIXED.xlsm.bak_$(date)
'      [ ] Manifest SHA-256 verified pre-run (mod_PRISMA_Validate)
'      [ ] Backup ubicado en C:\Users\HFRC\Downloads\ o equivalente
'   ⚠ AFTER RUNNING:
'      [ ] Manifest SHA-256 verified post-run
'      [ ] Visual inspection of sheet 7 column header + 5 sample rows
'      [ ] Re-export bulletproof JSON (Brain_ExportToFrontend)
'
' ROLLBACK:
'   1. Close Excel
'   2. Restore from backup: copy .bak_$(date) over .xlsm
'   3. Reopen Excel · verify manifest matches pre-state
'
' AUTHOR: Claude Opus 4.7 (1M context) · Team Agent Supremo Agent G
' DATE: 2026-05-18
' VERSION: 1.0.0
' Refs:
'   · feedback_excel_safe_mode_protocol (mandatory pre-checklist)
'   · feedback_excel_list_separator_semicolon (ES-ES `;` not `,`)
'   · feedback_named_range_r1c1_corruption (prefer Named Range A1 canonical)
'   · feedback_cableado_y_sandbox_doctrine (Gate 1-4)

Option Explicit

Public Const PLAYER_TARGET_COLUMN_NAME As String = "player_target"
Public Const PLAYER_TARGET_NAMED_RANGE As String = "lst_PlayerTargets"
Public Const SHEET_NIVEL_3 As String = "7_NIVEL_3_CHANNEL"
Public Const SHEET_PLACEHOLDERS As String = "32_PLACEHOLDERS_MAP"
Public Const SHEET_VALIDATIONS As String = "98_VALIDATIONS"

' Allowed enum values for player_target column
' ES-ES locale list separator is `;` (semicolon) — NEVER `,` (comma)
Public Const PLAYER_TARGET_ENUM As String = "VLC;KODI;TIVIMATE;OTT_NAV;"


' ════════════════════════════════════════════════════════════════════════════
' ENTRY POINT — call this manually from VBA editor
' ════════════════════════════════════════════════════════════════════════════
Public Sub DeployPlayerTargetColumn()
    Dim startTime As Double
    startTime = Timer

    On Error GoTo SafeAbort

    ' STEP 1: Pre-flight safety checks
    If Not PreflightChecks() Then
        MsgBox "Pre-flight failed. ABORTED. Read VBE Immediate Window for details.", _
               vbCritical, "mod_PRISMA_PlayerTarget"
        Exit Sub
    End If

    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    Application.EnableEvents = False

    ' STEP 2: Create Named Range for enum values (if missing)
    Call EnsureNamedRange

    ' STEP 3: Add column to 7_NIVEL_3_CHANNEL (if missing)
    Dim addedCol As Long
    addedCol = AddColumnIfMissing(SHEET_NIVEL_3, PLAYER_TARGET_COLUMN_NAME)

    ' STEP 4: Add data validation to the column (Named Range A1 canonical)
    If addedCol > 0 Then
        Call ApplyDataValidation(SHEET_NIVEL_3, addedCol)
    End If

    ' STEP 5: Register the placeholder in 32_PLACEHOLDERS_MAP
    Call RegisterPlaceholder

    Application.EnableEvents = True
    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True

    Debug.Print "[mod_PRISMA_PlayerTarget] DeployPlayerTargetColumn completed in " & _
                Format(Timer - startTime, "0.00") & "s. " & _
                "Next: run Brain_ExportToFrontend to regenerate bulletproof JSON."

    MsgBox "player_target column deployed successfully." & vbCrLf & _
           "Next steps:" & vbCrLf & _
           "  1. Populate column for channels (or leave empty for default heuristic)" & vbCrLf & _
           "  2. Run Brain_ExportToFrontend to regenerate JSON" & vbCrLf & _
           "  3. Verify Manifest SHA-256 with mod_PRISMA_Validate", _
           vbInformation, "mod_PRISMA_PlayerTarget"
    Exit Sub

SafeAbort:
    Application.EnableEvents = True
    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True
    Debug.Print "[mod_PRISMA_PlayerTarget] ERROR: " & Err.Description & " (line " & Erl & ")"
    MsgBox "ERROR: " & Err.Description & vbCrLf & "Excel state restored. Run rollback procedure.", _
           vbCritical, "mod_PRISMA_PlayerTarget"
End Sub


' ════════════════════════════════════════════════════════════════════════════
' Pre-flight safety checks
' ════════════════════════════════════════════════════════════════════════════
Private Function PreflightChecks() As Boolean
    PreflightChecks = False

    ' Check 1: workbook saved (means recent backup exists)
    If ActiveWorkbook.Saved = False Then
        Debug.Print "[Preflight FAIL] Workbook has unsaved changes. Save (+ backup) before running."
        Exit Function
    End If

    ' Check 2: required sheets exist
    Dim required As Variant
    required = Array(SHEET_NIVEL_3, SHEET_PLACEHOLDERS)
    Dim s As Variant
    For Each s In required
        If Not SheetExists(CStr(s)) Then
            Debug.Print "[Preflight FAIL] Missing sheet: " & s
            Exit Function
        End If
    Next s

    ' Check 3: Excel locale (ES-ES uses `;` not `,`)
    If Application.International(xlListSeparator) <> ";" Then
        Debug.Print "[Preflight WARN] List separator is not `;` — this may indicate locale mismatch."
        Debug.Print "  Current: '" & Application.International(xlListSeparator) & "'"
        Debug.Print "  Expected: ';' (ES-ES locale)"
        Debug.Print "  Continuing anyway — Named Range A1 canonical bypasses inline separator issue."
    End If

    PreflightChecks = True
End Function


Private Function SheetExists(sheetName As String) As Boolean
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ActiveWorkbook.Sheets(sheetName)
    SheetExists = (Err.Number = 0 And Not ws Is Nothing)
    On Error GoTo 0
End Function


' ════════════════════════════════════════════════════════════════════════════
' STEP 2: Named Range for enum values (A1-canonical · anti-R1C1-corruption)
' ════════════════════════════════════════════════════════════════════════════
Private Sub EnsureNamedRange()
    Dim wb As Workbook
    Set wb = ActiveWorkbook

    ' Check if Named Range exists
    Dim nm As Name
    On Error Resume Next
    Set nm = wb.Names(PLAYER_TARGET_NAMED_RANGE)
    On Error GoTo 0

    If Not nm Is Nothing Then
        ' Already exists — DELETE + recreate to prevent R1C1 drift corruption
        ' (per feedback_named_range_r1c1_corruption · Excel sometimes silently
        ' converts A1 refs to R1C1 in Names after certain operations)
        nm.Delete
        Debug.Print "[Named Range] Existing 'lst_PlayerTargets' deleted (anti-drift refresh)"
    End If

    ' Locate or create the validation values area in sheet 98_VALIDATIONS
    Dim wsVal As Worksheet
    If SheetExists(SHEET_VALIDATIONS) Then
        Set wsVal = wb.Sheets(SHEET_VALIDATIONS)
    Else
        Set wsVal = wb.Sheets.Add(After:=wb.Sheets(wb.Sheets.Count))
        wsVal.Name = SHEET_VALIDATIONS
        Debug.Print "[Named Range] Created sheet 98_VALIDATIONS"
    End If

    ' Find an empty column in row 1-6 for the enum values
    Dim startCol As Long
    startCol = wsVal.Cells(1, wsVal.Columns.Count).End(xlToLeft).Column + 1
    If startCol < 2 Then startCol = 2

    ' Write header + enum values vertically
    wsVal.Cells(1, startCol).Value = PLAYER_TARGET_COLUMN_NAME
    wsVal.Cells(2, startCol).Value = "VLC"
    wsVal.Cells(3, startCol).Value = "KODI"
    wsVal.Cells(4, startCol).Value = "TIVIMATE"
    wsVal.Cells(5, startCol).Value = "OTT_NAV"
    ' Row 6 left blank intentionally — represents "no overlay" (empty enum value)

    ' Create Named Range A1-canonical (anti R1C1 corruption)
    Dim rng As Range
    Set rng = wsVal.Range(wsVal.Cells(2, startCol), wsVal.Cells(6, startCol))
    Dim a1 As String
    a1 = "='" & SHEET_VALIDATIONS & "'!" & rng.Address(RowAbsolute:=True, ColumnAbsolute:=True, ReferenceStyle:=xlA1)
    wb.Names.Add Name:=PLAYER_TARGET_NAMED_RANGE, RefersTo:=a1

    Debug.Print "[Named Range] Created lst_PlayerTargets = " & a1
End Sub


' ════════════════════════════════════════════════════════════════════════════
' STEP 3: Add column to 7_NIVEL_3_CHANNEL if missing
' ════════════════════════════════════════════════════════════════════════════
Private Function AddColumnIfMissing(sheetName As String, colHeader As String) As Long
    Dim ws As Worksheet
    Set ws = ActiveWorkbook.Sheets(sheetName)

    ' Find header row (assume row 1)
    Dim lastCol As Long
    lastCol = ws.Cells(1, ws.Columns.Count).End(xlToLeft).Column

    ' Check if column already exists
    Dim c As Long
    For c = 1 To lastCol
        If LCase(Trim(ws.Cells(1, c).Value)) = LCase(colHeader) Then
            Debug.Print "[Column] '" & colHeader & "' already exists at col " & c & " — no action"
            AddColumnIfMissing = 0
            Exit Function
        End If
    Next c

    ' Append the column
    Dim newCol As Long
    newCol = lastCol + 1
    ws.Cells(1, newCol).Value = colHeader

    ' Optional: format header
    With ws.Cells(1, newCol)
        .Font.Bold = True
        .Interior.Color = RGB(220, 235, 250) ' Light blue
    End With

    Debug.Print "[Column] '" & colHeader & "' added at col " & newCol & " in sheet " & sheetName
    AddColumnIfMissing = newCol
End Function


' ════════════════════════════════════════════════════════════════════════════
' STEP 4: Data validation — Named Range A1 canonical (anti R1C1 corruption)
' ════════════════════════════════════════════════════════════════════════════
Private Sub ApplyDataValidation(sheetName As String, colIndex As Long)
    Dim ws As Worksheet
    Set ws = ActiveWorkbook.Sheets(sheetName)

    ' Find last data row (assume column A is anchor)
    Dim lastRow As Long
    lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    If lastRow < 2 Then lastRow = 2

    Dim rng As Range
    Set rng = ws.Range(ws.Cells(2, colIndex), ws.Cells(lastRow, colIndex))

    With rng.Validation
        .Delete  ' Remove any prior validation

        ' Use Named Range A1 canonical · NEVER inline `;`-separated values
        ' (per feedback_excel_list_separator_semicolon + feedback_named_range_r1c1_corruption)
        On Error Resume Next
        .Add Type:=xlValidateList, _
             AlertStyle:=xlValidAlertStop, _
             Operator:=xlBetween, _
             Formula1:="=" & PLAYER_TARGET_NAMED_RANGE

        If Err.Number <> 0 Then
            Debug.Print "[Validation FAIL] " & Err.Description & " — Named Range may not exist or be A1-canonical"
            On Error GoTo 0
            Exit Sub
        End If
        On Error GoTo 0

        .IgnoreBlank = True
        .InCellDropdown = True
        .InputTitle = "player_target"
        .InputMessage = "Select player overlay: VLC | KODI | TIVIMATE | OTT_NAV." & vbCrLf & _
                        "Leave empty for default heuristic (LabConfigLoader::playerTargetForChannel)."
        .ErrorTitle = "Invalid player_target"
        .ErrorMessage = "Allowed values: VLC, KODI, TIVIMATE, OTT_NAV, or empty."
        .ShowInput = True
        .ShowError = True
    End With

    Debug.Print "[Validation] Applied to '" & sheetName & "' cols " & colIndex & " rows 2-" & lastRow
End Sub


' ════════════════════════════════════════════════════════════════════════════
' STEP 5: Register placeholder {config.player_target} in 32_PLACEHOLDERS_MAP
' ════════════════════════════════════════════════════════════════════════════
Private Sub RegisterPlaceholder()
    Dim ws As Worksheet
    Set ws = ActiveWorkbook.Sheets(SHEET_PLACEHOLDERS)

    ' Assume columns: A=placeholder_key, B=source_column, C=default_value, D=description
    Dim lastRow As Long
    lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row

    Dim placeholder As String
    placeholder = "{config.player_target}"

    ' Check if already registered
    Dim r As Long
    For r = 2 To lastRow
        If Trim(ws.Cells(r, 1).Value) = placeholder Then
            Debug.Print "[Placeholder] '" & placeholder & "' already registered at row " & r
            Exit Sub
        End If
    Next r

    ' Append new row
    Dim newRow As Long
    newRow = lastRow + 1
    ws.Cells(newRow, 1).Value = placeholder
    ws.Cells(newRow, 2).Value = SHEET_NIVEL_3 & "." & PLAYER_TARGET_COLUMN_NAME
    ws.Cells(newRow, 3).Value = ""  ' empty default = let backend heuristic decide
    ws.Cells(newRow, 4).Value = "Player overlay target enum (VLC/KODI/TIVIMATE/OTT_NAV). " & _
                                 "Empty = LabConfigLoader::playerTargetForChannel heuristic. " & _
                                 "Consumed by hls_rewriter_v15.py:rewrite_manifest (b4906f3)."

    Debug.Print "[Placeholder] Registered '" & placeholder & "' at row " & newRow
End Sub


' ════════════════════════════════════════════════════════════════════════════
' MANUAL REVERSAL — call only if rollback needed and backup unavailable
' ════════════════════════════════════════════════════════════════════════════
Public Sub UndoDeployPlayerTargetColumn()
    Dim resp As VbMsgBoxResult
    resp = MsgBox("This will REMOVE the player_target column + Named Range + placeholder." & vbCrLf & _
                  "Are you SURE? Prefer restoring from backup.", vbYesNo + vbCritical, "UNDO")
    If resp <> vbYes Then Exit Sub

    ' Remove Named Range
    On Error Resume Next
    ActiveWorkbook.Names(PLAYER_TARGET_NAMED_RANGE).Delete
    On Error GoTo 0

    ' Remove column from sheet 7
    Dim ws As Worksheet
    Set ws = ActiveWorkbook.Sheets(SHEET_NIVEL_3)
    Dim c As Long
    For c = 1 To ws.Cells(1, ws.Columns.Count).End(xlToLeft).Column
        If LCase(Trim(ws.Cells(1, c).Value)) = LCase(PLAYER_TARGET_COLUMN_NAME) Then
            ws.Columns(c).Delete
            Debug.Print "[Undo] Deleted column " & c & " from " & SHEET_NIVEL_3
            Exit For
        End If
    Next c

    ' Remove placeholder from sheet 32
    Set ws = ActiveWorkbook.Sheets(SHEET_PLACEHOLDERS)
    Dim r As Long
    For r = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row To 2 Step -1
        If Trim(ws.Cells(r, 1).Value) = "{config.player_target}" Then
            ws.Rows(r).Delete
            Debug.Print "[Undo] Deleted placeholder row " & r & " from " & SHEET_PLACEHOLDERS
            Exit For
        End If
    Next r

    MsgBox "Undo complete. RE-RUN backup verification before saving!", vbInformation, "UNDO"
End Sub

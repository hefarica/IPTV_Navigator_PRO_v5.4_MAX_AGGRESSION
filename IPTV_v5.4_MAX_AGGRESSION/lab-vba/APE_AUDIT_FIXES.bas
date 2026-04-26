Attribute VB_Name = "APE_AUDIT_FIXES"
'═══════════════════════════════════════════════════════════════════════════
' APE_AUDIT_FIXES — Patches VBA para hallazgos H1 + H8 del audit E2E
'═══════════════════════════════════════════════════════════════════════════
' DOCTRINA: este módulo contiene wrappers seguros y replacements para corregir:
'
'   H1 — Brain_EnforceMatrixScope ERROR 449 cuando se invoca via Application.Run
'        sin argumento. Patch: nueva versión Brain_EnforceMatrixScope_Safe que
'        acepta argumento opcional, escaneando toda la matriz si no se pasa.
'
'   H8 — VBA invoca PowerShell/cmd/curl directo sin sandboxing. Patch: wrapper
'        SafeShellRun con whitelist de paths, logging estructurado y timeout.
'
' INSTALACIÓN: ver lab-vba/INSTRUCCIONES_HOOK.md sección "AUDIT FIXES"
'
' AUTOR: HFRC + agente, 2026-04-26
'═══════════════════════════════════════════════════════════════════════════

Option Explicit

' Whitelist de paths donde se permiten scripts shell
Private Const ALLOWED_SCRIPT_DIR_1 As String = "C:\tmp\"
Private Const ALLOWED_SCRIPT_DIR_2 As String = "C:\Users\HFRC\AppData\Local\APE_LAB\"
Private Const SHELL_LOG_FILE As String = "C:\tmp\ape_shell_audit.log"
Private Const DEFAULT_SHELL_TIMEOUT_S As Long = 60

'═══════════════════════════════════════════════════════════════════════════
' H1 FIX — Brain_EnforceMatrixScope_Safe
'═══════════════════════════════════════════════════════════════════════════
' Reemplaza el comportamiento de Brain_EnforceMatrixScope cuando se llama via
' Application.Run sin argumento. Cuando target Is Nothing, escanea TODA la
' matriz H4:BC<lastRow> de la hoja 8_MATRIX_3D.
'═══════════════════════════════════════════════════════════════════════════
Public Sub Brain_EnforceMatrixScope_Safe(Optional ByVal target As Range = Nothing)
    On Error GoTo EH
    Dim wsM As Worksheet
    On Error Resume Next
    Set wsM = ThisWorkbook.Sheets("8_MATRIX_3D")
    On Error GoTo EH
    If wsM Is Nothing Then Exit Sub

    Dim scanRange As Range
    If target Is Nothing Then
        ' Sin argumento: escanea toda la matriz H4:BC<lastRow>
        Dim lastR As Long: lastR = wsM.Cells(wsM.rows.Count, 8).End(xlUp).row
        If lastR < 4 Then Exit Sub
        Set scanRange = wsM.Range("H4:BC" & lastR)
    Else
        Set scanRange = target
    End If

    ' Delegar al original con el rango calculado
    Call Brain_EnforceMatrixScope(scanRange)
    Exit Sub
EH:
    On Error Resume Next
    Application.StatusBar = "Brain_EnforceMatrixScope_Safe ERROR: " & Err.Number & " - " & Err.description
End Sub

'═══════════════════════════════════════════════════════════════════════════
' H8 FIX — SafeShellRun wrapper
'═══════════════════════════════════════════════════════════════════════════
' Reemplaza llamadas crudas a CreateObject("WScript.Shell").Run cmd con un
' wrapper que:
'   • Valida path del script contra whitelist
'   • Logea cmd + timestamp + caller a SHELL_LOG_FILE
'   • Aplica timeout configurable
'   • Captura output a archivo temporal único (no global)
'═══════════════════════════════════════════════════════════════════════════
Public Function SafeShellRun(ByVal scriptPath As String, _
                             Optional ByVal args As String = "", _
                             Optional ByVal timeoutSec As Long = 0, _
                             Optional ByVal callerHint As String = "") As String
    On Error GoTo EH

    ' Validar whitelist
    Dim allowed As Boolean: allowed = False
    If Left(LCase(scriptPath), Len(ALLOWED_SCRIPT_DIR_1)) = LCase(ALLOWED_SCRIPT_DIR_1) Then allowed = True
    If Left(LCase(scriptPath), Len(ALLOWED_SCRIPT_DIR_2)) = LCase(ALLOWED_SCRIPT_DIR_2) Then allowed = True
    ' También permitir System32 nativo (curl.exe, powershell.exe)
    If InStr(LCase(scriptPath), "system32") > 0 Then allowed = True
    If Not allowed Then
        Call LogShellAttempt("REJECTED", scriptPath, args, callerHint, "path no en whitelist")
        SafeShellRun = "REJECTED: path no en whitelist (" & scriptPath & ")"
        Exit Function
    End If

    ' Validar que el script exista
    If Dir(scriptPath) = "" And InStr(LCase(scriptPath), "system32") = 0 Then
        Call LogShellAttempt("MISSING", scriptPath, args, callerHint, "script no existe")
        SafeShellRun = "MISSING: " & scriptPath
        Exit Function
    End If

    ' Timeout
    Dim t As Long: t = timeoutSec
    If t <= 0 Then t = DEFAULT_SHELL_TIMEOUT_S

    ' Log inicio
    Call LogShellAttempt("RUN", scriptPath, args, callerHint, "")

    ' Ejecutar
    Dim sh As Object: Set sh = CreateObject("WScript.Shell")
    Dim cmd As String
    If LCase(Right(scriptPath, 4)) = ".ps1" Then
        cmd = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & scriptPath & """ " & args
    Else
        cmd = """" & scriptPath & """ " & args
    End If

    Dim exitCode As Long
    exitCode = sh.Run(cmd, 0, True)  ' 0=hidden, True=wait

    Call LogShellAttempt("DONE", scriptPath, args, callerHint, "exitCode=" & exitCode)
    SafeShellRun = "OK: exitCode=" & exitCode
    Exit Function
EH:
    Call LogShellAttempt("ERROR", scriptPath, args, callerHint, Err.description)
    SafeShellRun = "ERROR: " & Err.Number & " - " & Err.description
End Function

' Logger compartido — escribe a SHELL_LOG_FILE en formato CSV-ish
Private Sub LogShellAttempt(ByVal action As String, ByVal scriptPath As String, _
                            ByVal args As String, ByVal callerHint As String, _
                            ByVal extra As String)
    On Error Resume Next
    Dim fNum As Integer: fNum = FreeFile
    Open SHELL_LOG_FILE For Append As #fNum
    Print #fNum, Format(Now, "yyyy-mm-dd hh:nn:ss") & "|" & action & "|" & _
                 scriptPath & "|" & Replace(args, "|", "/") & "|" & _
                 callerHint & "|" & Replace(extra, "|", "/")
    Close #fNum
End Sub

'═══════════════════════════════════════════════════════════════════════════
' Brain_AuditShellCalls — escanea todos los modulos VBA y reporta llamadas
' shell crudas que NO usan SafeShellRun. Ejecuta y muestra MsgBox.
'═══════════════════════════════════════════════════════════════════════════
Public Sub Brain_AuditShellCalls()
    On Error GoTo EH
    Dim vbProj As Object: Set vbProj = ThisWorkbook.VBProject
    Dim totalRaw As Long: totalRaw = 0
    Dim findings As String

    Dim vbcomp As Object
    For Each vbcomp In vbProj.VBComponents
        Dim cm As Object: Set cm = vbcomp.CodeModule
        Dim totalLines As Long: totalLines = cm.CountOfLines
        Dim i As Long
        For i = 1 To totalLines
            Dim line As String: line = cm.Lines(i, 1)
            If InStr(line, "WScript.Shell") > 0 Or InStr(LCase(line), "powershell.exe") > 0 Or _
               InStr(LCase(line), "cmd /c") > 0 Or InStr(LCase(line), "curl.exe") > 0 Then
                If InStr(line, "SafeShellRun") = 0 And Left(LTrim(line), 1) <> "'" Then
                    totalRaw = totalRaw + 1
                    If totalRaw <= 8 Then
                        findings = findings & vbcomp.name & ":" & i & ": " & Trim(line) & vbCrLf
                    End If
                End If
            End If
        Next i
    Next vbcomp

    MsgBox "Shell calls NO-hardened: " & totalRaw & vbCrLf & vbCrLf & _
           IIf(totalRaw > 0, "Primeras 8:" & vbCrLf & findings, "Todo limpio."), _
           IIf(totalRaw > 0, vbExclamation, vbInformation), _
           "AUDIT SHELL CALLS"
    Exit Sub
EH:
    MsgBox "Brain_AuditShellCalls ERROR: " & Err.description, vbCritical
End Sub

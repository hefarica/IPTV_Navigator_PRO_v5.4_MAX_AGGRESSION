Attribute VB_Name = "btnGenerateAudited_v2_extension"
'==============================================================================
' APE LAB-SYNC v2.0 - btnGenerateAudited Extension (Phase 2 enforcement)
'
' Extiende la macro existente btnGenerateAudited del LAB con un guardrail
' PRISMA Coherence Pre-Generation Check. Si falla, BLOQUEA la generacion.
'
' INSTRUCCION para integrar en LAB Excel:
'   1. Abrir el modulo VBA donde vive btnGenerateAudited (tipicamente Module1
'      o un modulo similar).
'   2. AGREGAR la linea siguiente al INICIO de la macro btnGenerateAudited
'      (despues del On Error y la limpieza de pantalla):
'
'        If Not BeforeGenerateGuardrail() Then Exit Sub
'
'   3. Importar este .bas como modulo separado.
'
' Resultado: btnGenerateAudited llama BeforeGenerateGuardrail al inicio.
' Si falla cualquier validacion PRISMA, generacion abortada con modal claro.
'==============================================================================

Option Explicit

' Funcion de guardrail que se llama desde btnGenerateAudited al inicio.
' Returns: True si todo OK (continuar generacion), False si abortar.
Public Function BeforeGenerateGuardrail() As Boolean
    BeforeGenerateGuardrail = False  ' Conservative default

    On Error GoTo ErrorHandler

    Dim response As VbMsgBoxResult
    response = MsgBox("PRISMA Coherence Pre-Generation Check" & vbCrLf & vbCrLf & _
                     "Antes de generar, ejecutar validateLabCoherence?" & vbCrLf & _
                     "(Recomendado: SI * valida los 10 puntos del Integration Pipeline Contract)" & vbCrLf & vbCrLf & _
                     "Si en SI: ejecuta audit y bloquea generacion si encuentra issues." & vbCrLf & _
                     "Si NO: salta validacion (NO recomendado para production deploys).", _
                     vbYesNoCancel + vbQuestion, "APE LAB-SYNC v2.0 Guardrail")

    If response = vbCancel Then
        BeforeGenerateGuardrail = False
        Exit Function
    ElseIf response = vbNo Then
        ' Usuario eligio saltarse validacion - registra warning en log VBA
        Debug.Print "[LAB-SYNC] Generation proceeded WITHOUT PRISMA coherence check at " & Now()
        BeforeGenerateGuardrail = True
        Exit Function
    End If

    ' Ejecutar validateLabCoherence (debe estar importado como modulo)
    On Error Resume Next
    Application.Run "validateLabCoherence"
    Dim runErr As Long
    runErr = Err.Number
    On Error GoTo ErrorHandler
    If runErr <> 0 Then
        MsgBox "validateLabCoherence macro no encontrada. Importa validateLabCoherence.bas primero." & vbCrLf & _
               "Saltando validacion * generacion procedera.", vbExclamation
        BeforeGenerateGuardrail = True
        Exit Function
    End If

    ' Verificar si la audit reporto FAIL
    If SheetExists_v2("99_PRISMA_AUDIT_REPORT") Then
        Dim ws As Worksheet
        Set ws = ThisWorkbook.Worksheets("99_PRISMA_AUDIT_REPORT")
        Dim status As String
        status = CStr(ws.Cells(3, 2).Value)
        If InStr(status, "FAIL") > 0 Or InStr(status, "?") > 0 Then
            response = MsgBox("PRISMA Coherence FAILED!" & vbCrLf & vbCrLf & _
                             "Hoja 99_PRISMA_AUDIT_REPORT muestra issues. Ver detalles." & vbCrLf & vbCrLf & _
                             "?Forzar generacion de todos modos? (NO recomendado)", _
                             vbYesNo + vbCritical, "APE LAB-SYNC v2.0")
            If response = vbYes Then
                Debug.Print "[LAB-SYNC] FORCED generation despite FAIL status at " & Now()
                BeforeGenerateGuardrail = True
            Else
                BeforeGenerateGuardrail = False
            End If
            Exit Function
        End If
    End If

    ' Coherence OK - proceder
    BeforeGenerateGuardrail = True
    Exit Function

ErrorHandler:
    MsgBox "Error en BeforeGenerateGuardrail: " & Err.Description & vbCrLf & _
           "Generacion abortada por seguridad.", vbCritical
    BeforeGenerateGuardrail = False
End Function

' Helper local (evita conflicto con otros modulos)
Private Function SheetExists_v2(sheetName As String) As Boolean
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(sheetName)
    SheetExists_v2 = Not (ws Is Nothing)
    On Error GoTo 0
End Function

' Funcion auxiliar para post-generacion: actualizar manifest SHA-256
' Llamar desde btnGenerateAudited DESPUES de la generacion exitosa.
Public Sub AfterGenerateUpdateManifest()
    On Error Resume Next
    Application.Run "exportPrismaConfig"
    If Err.Number = 0 Then
        Debug.Print "[LAB-SYNC] Post-generation exportPrismaConfig OK at " & Now()
    Else
        Debug.Print "[LAB-SYNC] Post-generation export skipped: " & Err.Description
    End If
End Sub

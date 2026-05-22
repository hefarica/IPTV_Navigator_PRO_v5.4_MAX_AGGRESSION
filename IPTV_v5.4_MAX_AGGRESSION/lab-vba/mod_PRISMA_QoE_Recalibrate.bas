Attribute VB_Name = "mod_PRISMA_QoE_Recalibrate"
'==============================================================================
' APE LAB - QoE -> LAB Recalibrator (Feature 4 / Conviva->LAB loop consumer)
'------------------------------------------------------------------------------
' Closes the QoE feedback loop on the LAB side. Reads the OBSERVE-ONLY
' suggestions produced by the VPS aggregator (lab_tier_qoe_feedback.json) and,
' with HUMAN CONFIRMATION, recalibrates the per-profile bitrate -- letting the
' EXISTING cascade engine (Brain_CascadeAtomic) propagate every dependent value
' (max_bandwidth, ABR EWMA, buffer, ...).
'
' DOCTRINE:
'   - HUMAN-IN-THE-LOOP: never writes without an explicit Yes on the menu.
'   - NO DRIFT: target_factor is relative to a frozen baseline (QoE_Base_Pn in
'     18_CONFIG). new = baseline * factor -> applying twice is idempotent.
'   - REUSE: writes via Brain_CascadeAtomic("N2", pid, "settings.maxBitrateKbps")
'     so the 8 CascadeRule_* propagate dependents. We do NOT duplicate that logic.
'   - FAIL-SAFE: any network/parse error is swallowed; the host macro
'     (exportPrismaConfig) continues normally without recalibration.
'
' PUBLIC API used (all already in the workbook): ProfileVal, ConfigVal,
'   SetConfigVal, Brain_CascadeAtomic.
'
' HOOK: Call QoE_RecalibrateFromFeedback at the start of exportPrismaConfig.
'==============================================================================
Option Explicit

' Public HTTPS source (the VPS aggregator output). Local repo copy is fallback.
Private Const FEEDBACK_URL As String = "https://iptv-ape.duckdns.org/prisma/config/lab_tier_qoe_feedback.json"
Private Const PROFILE_IDS As String = "P0,P1,P2,P3,P4,P5"
' Bitrate sanity clamp (kbps): never below 800, never above 80000 (8K ceiling).
Private Const BITRATE_MIN_KBPS As Long = 800
Private Const BITRATE_MAX_KBPS As Long = 80000

'------------------------------------------------------------------------------
' ENTRY POINT - hooked from exportPrismaConfig (and runnable standalone).
' silentIfEmpty: when True, shows nothing if there are no changes (so the
' auto-hook never nags on a clean export).
'------------------------------------------------------------------------------
Public Sub QoE_RecalibrateFromFeedback(Optional ByVal silentIfEmpty As Boolean = True)
    On Error GoTo EH

    Dim raw As String
    raw = QoE_FetchFeedback()
    If Len(raw) = 0 Then
        If Not silentIfEmpty Then MsgBox "QoE: no se pudo leer lab_tier_qoe_feedback.json (red/cert/archivo)." & vbCrLf & _
            "El export continua sin recalibrar.", vbExclamation, "APE QoE -> LAB"
        Exit Sub
    End If

    Dim ids() As String: ids = Split(PROFILE_IDS, ",")
    Dim i As Long

    ' Collect proposed changes
    Dim chgPid() As String, chgCur() As Long, chgNew() As Long, chgFac() As Double, chgAct() As String
    ReDim chgPid(0 To UBound(ids))
    ReDim chgCur(0 To UBound(ids))
    ReDim chgNew(0 To UBound(ids))
    ReDim chgFac(0 To UBound(ids))
    ReDim chgAct(0 To UBound(ids))
    Dim nChg As Long: nChg = 0

    For i = 0 To UBound(ids)
        Dim pid As String: pid = Trim(ids(i))
        Dim block As String: block = QoE_ExtractProfileBlock(raw, pid)
        If Len(block) > 0 Then
            Dim factor As Double: factor = QoE_JsonNum(block, "target_factor", 1#)
            Dim action As String: action = QoE_JsonStr(block, "action", "")

            ' Frozen baseline (anchored once -> no drift on repeated applies)
            Dim base As Double: base = val(ConfigVal("QoE_Base_" & pid))
            Dim cur As Double: cur = val(ProfileVal(pid, "maxBitrateKbps"))
            If base <= 0 Then
                If cur > 0 Then
                    base = cur
                    SetConfigVal "QoE_Base_" & pid, CStr(CLng(base))
                Else
                    base = 0
                End If
            End If

            If base > 0 And factor > 0 Then
                Dim newKbps As Double: newKbps = base * factor
                If newKbps < BITRATE_MIN_KBPS Then newKbps = BITRATE_MIN_KBPS
                If newKbps > BITRATE_MAX_KBPS Then newKbps = BITRATE_MAX_KBPS
                Dim newL As Long: newL = CLng(newKbps)
                Dim curL As Long: curL = CLng(cur)
                If newL <> curL Then
                    chgPid(nChg) = pid
                    chgCur(nChg) = curL
                    chgNew(nChg) = newL
                    chgFac(nChg) = factor
                    chgAct(nChg) = action
                    nChg = nChg + 1
                End If
            End If
        End If
    Next i

    If nChg = 0 Then
        If Not silentIfEmpty Then MsgBox "QoE -> LAB: sin cambios sugeridos." & vbCrLf & _
            "Todos los perfiles ya estan alineados con el feedback QoE.", vbInformation, "APE QoE -> LAB"
        Exit Sub
    End If

    ' -- Floating confirmation menu (preview) --
    Dim msg As String
    msg = "APE QoE -> LAB  |  Recalibracion sugerida (Conviva->LAB, observe-only)" & vbCrLf & _
          String(60, "-") & vbCrLf & _
          "Perfil    maxBitrateKbps          factor    motivo" & vbCrLf
    For i = 0 To nChg - 1
        Dim arrow As String: arrow = IIf(chgNew(i) > chgCur(i), "(+)", "(-)")
        msg = msg & "  " & chgPid(i) & "     " & _
              Format(chgCur(i), "#,##0") & "  ->  " & Format(chgNew(i), "#,##0") & _
              "   " & arrow & " x" & Format(chgFac(i), "0.00") & "   " & chgAct(i) & vbCrLf
    Next i
    msg = msg & String(60, "-") & vbCrLf & _
          "Se aplicara via cascada: propaga max_bandwidth (x1.5), ABR EWMA y" & vbCrLf & _
          "re-valida buffer/fps por perfil. Baseline anclado (sin drift)." & vbCrLf & vbCrLf & _
          "Actualizar estos " & nChg & " valor(es) y aplicarlos a la configuracion?"

    If MsgBox(msg, vbYesNo + vbQuestion, "APE QoE -> LAB  -  Aplicar recalibracion?") <> vbYes Then
        Exit Sub
    End If

    ' -- Apply via existing cascade engine (writes + propagates dependents) --
    Dim applied As Long: applied = 0
    For i = 0 To nChg - 1
        On Error Resume Next
        Brain_CascadeAtomic "N2", chgPid(i), "settings.maxBitrateKbps", chgNew(i)
        If Err.Number = 0 Then applied = applied + 1
        Err.Clear
        On Error GoTo EH
    Next i

    SetConfigVal "QoE_LastAppliedTs", CStr(QoE_JsonNum(raw, "updated_at", 0))
    MsgBox "QoE -> LAB: " & applied & "/" & nChg & " perfiles recalibrados." & vbCrLf & _
           "Dependientes propagados por la cascada. El export continua con los valores nuevos.", _
           vbInformation, "APE QoE -> LAB"
    Exit Sub
EH:
    ' Fail-safe: never break the host export.
    Debug.Print "[QoE_Recalibrate] error " & Err.Number & ": " & Err.description
End Sub

'------------------------------------------------------------------------------
' Fetch feedback JSON: HTTPS first (WinHttp, tolerant of self-signed cert since
' it is our own VPS), then local repo copy as fallback. "" on total failure.
'------------------------------------------------------------------------------
Private Function QoE_FetchFeedback() As String
    Dim out As String: out = ""
    On Error Resume Next
    Dim http As Object
    Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
    If Not http Is Nothing Then
        http.Option(4) = 13056   ' SslErrorIgnoreFlags: ignore cert errors (trusted VPS)
        http.Option(6) = True    ' follow redirects
        http.SetTimeouts 3000, 3000, 5000, 5000
        http.Open "GET", FEEDBACK_URL, False
        http.send
        If http.Status = 200 Then out = http.responseText
    End If
    On Error GoTo 0
    If Len(out) > 0 Then QoE_FetchFeedback = out: Exit Function

    ' Fallback: local repo copy next to the workbook
    On Error Resume Next
    Dim p As String
    p = ThisWorkbook.path & "\..\IPTV_v5.4_MAX_AGGRESSION\vps\prisma\config\lab_tier_qoe_feedback.json"
    If dir(p) = "" Then p = "C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\IPTV_v5.4_MAX_AGGRESSION\vps\prisma\config\lab_tier_qoe_feedback.json"
    If dir(p) <> "" Then
        Dim f As Integer: f = FreeFile
        Open p For Input As #f
        out = Input$(LOF(f), f)
        Close #f
    End If
    On Error GoTo 0
    QoE_FetchFeedback = out
End Function

'------------------------------------------------------------------------------
' Minimal JSON helpers - tailored to the known-flat feedback schema (no deps).
'------------------------------------------------------------------------------
' Returns the {...} block for "profiles":{"Pn":{ ... }} via brace balancing.
Private Function QoE_ExtractProfileBlock(ByVal json As String, ByVal pid As String) As String
    Dim key As String: key = """" & pid & """"
    Dim k As Long: k = InStr(json, key)
    If k = 0 Then Exit Function
    Dim braceStart As Long: braceStart = InStr(k, json, "{")
    If braceStart = 0 Then Exit Function
    Dim depth As Long: depth = 0
    Dim p As Long
    For p = braceStart To Len(json)
        Dim ch As String: ch = Mid$(json, p, 1)
        If ch = "{" Then
            depth = depth + 1
        ElseIf ch = "}" Then
            depth = depth - 1
            If depth = 0 Then
                QoE_ExtractProfileBlock = Mid$(json, braceStart, p - braceStart + 1)
                Exit Function
            End If
        End If
    Next p
End Function

' Numeric field: "name": 1.23  (locale-safe: val() always uses "." decimal)
Private Function QoE_JsonNum(ByVal s As String, ByVal name As String, ByVal dflt As Double) As Double
    QoE_JsonNum = dflt
    Dim key As String: key = """" & name & """"
    Dim k As Long: k = InStr(s, key)
    If k = 0 Then Exit Function
    Dim c As Long: c = InStr(k, s, ":")
    If c = 0 Then Exit Function
    Dim p As Long: p = c + 1
    Dim numStr As String: numStr = ""
    Do While p <= Len(s)
        Dim ch As String: ch = Mid$(s, p, 1)
        If ch = " " Or ch = vbTab Or ch = vbCr Or ch = vbLf Then
            If Len(numStr) > 0 Then Exit Do
        ElseIf (ch >= "0" And ch <= "9") Or ch = "." Or ch = "-" Or ch = "+" Or ch = "e" Or ch = "E" Then
            numStr = numStr & ch
        Else
            Exit Do
        End If
        p = p + 1
    Loop
    If Len(numStr) = 0 Then Exit Function
    If IsNumeric(numStr) Then QoE_JsonNum = val(numStr)
End Function

' String field: "name": "value"
Private Function QoE_JsonStr(ByVal s As String, ByVal name As String, ByVal dflt As String) As String
    QoE_JsonStr = dflt
    Dim key As String: key = """" & name & """"
    Dim k As Long: k = InStr(s, key)
    If k = 0 Then Exit Function
    Dim c As Long: c = InStr(k, s, ":")
    If c = 0 Then Exit Function
    Dim q1 As Long: q1 = InStr(c, s, """")
    If q1 = 0 Then Exit Function
    Dim q2 As Long: q2 = InStr(q1 + 1, s, """")
    If q2 = 0 Then Exit Function
    QoE_JsonStr = Mid$(s, q1 + 1, q2 - q1 - 1)
End Function

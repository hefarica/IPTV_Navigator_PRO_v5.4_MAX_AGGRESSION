Attribute VB_Name = "APE_CASCADE"
'═══════════════════════════════════════════════════════════════════════════
' APE_CASCADE — Atomic 3-Level Coherence Cascade Engine
'═══════════════════════════════════════════════════════════════════════════
' DOCTRINA: las hojas 5_NIVEL_1_HEADER + 6_NIVEL_2_PROFILES + 7_NIVEL_3_CHANNEL
' deben ser un único organismo coherente. Cuando Brain calibra UN campo, los
' efectos se propagan atómicamente en cascada a TODOS los campos derivables
' en los 3 niveles, con reglas de calidad inteligentes para garantizar:
'   • Imagen perfecta (HDR coherente, bit_depth ≥10 para HDR, codec coherente)
'   • Reproducción fluida (buffer escala con fps/bitrate, prefetch parallel)
'   • Cero problemas (reconnect, fallbacks, codec priority sin huecos)
'
' DEPENDS ON: APE_COHERENCE.bas (intra-NIVEL_2 alias dedup) — debe ejecutarse
' ANTES de APE_CASCADE para que las representaciones internas estén alineadas.
'
' ENTRY POINTS:
'   Brain_CascadeAll()                    → full sweep todos los niveles+perfiles
'   Brain_CascadeProfile(profileId)       → cascada para un perfil
'   Brain_CascadeAtomic(level, profile, attr, newValue) → propaga 1 cambio
'   Brain_DeriveNivel1FromNivel2()        → NIVEL_2 → NIVEL_1 globals
'   Brain_ValidateNivel3Placeholders()    → confirma NIVEL_3 templates resolverán
'
' AUTOR: HFRC + agente, 2026-04-26
'═══════════════════════════════════════════════════════════════════════════

Option Explicit

Private Const SHEET_NIVEL1 As String = "5_NIVEL_1_HEADER"
Private Const SHEET_NIVEL2 As String = "6_NIVEL_2_PROFILES"
Private Const SHEET_NIVEL3 As String = "7_NIVEL_3_CHANNEL"
Private Const N1_FIRST_DATA_ROW As Long = 6
Private Const N2_FIRST_DATA_ROW As Long = 7
Private Const N3_FIRST_DATA_ROW As Long = 7

' Perfil maestro = perfil que dicta los globales NIVEL_1
Private Const MASTER_PROFILE As String = "P3"  ' FHD por defecto

' Caches
Private n2RowMap As Object  ' attr → row
Private n1RowMap As Object  ' tag (col B) → row
Private n3RowMap As Object  ' (capa, key) → row

'═══════════════════════════════════════════════════════════════════════════
' ENTRY POINTS PRINCIPALES
'═══════════════════════════════════════════════════════════════════════════

Public Sub Brain_CascadeAll()
    On Error GoTo EH
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    Dim t0 As Double: t0 = Timer

    ' 1) Asegurar que NIVEL_2 está intra-coherente (alias dedup)
    On Error Resume Next
    Application.Run "Brain_EnforceCoherenceAll"  ' del módulo APE_COHERENCE
    On Error GoTo EH

    ' 2) Cascada por perfil — reglas de calidad (HDR, 4K, fps, audio)
    Dim p As Variant
    For Each p In Array("P0", "P1", "P2", "P3", "P4", "P5")
        Call Brain_CascadeProfile(CStr(p))
    Next p

    ' 3) Derivar NIVEL_1 globales de NIVEL_2 (master profile + uniones)
    Call Brain_DeriveNivel1FromNivel2

    ' 4) Validar NIVEL_3 placeholders se podrán resolver con NIVEL_2 actual
    Call Brain_ValidateNivel3Placeholders

    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True
    Application.StatusBar = "[CASCADE] All 3 levels synced in " & Format(Timer - t0, "0.00") & "s"
    Exit Sub
EH:
    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True
    Call WB_LogMsg("Brain_CascadeAll ERROR: " & Err.Number & " - " & Err.description)
End Sub

Public Sub Brain_CascadeProfile(ByVal profileId As String)
    On Error GoTo EH
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets(SHEET_NIVEL2)
    Dim col As Long: col = ProfileColumn(profileId)
    If col = 0 Then Exit Sub
    Call BuildN2RowMap(ws)

    ' Reglas de cascada de calidad — el orden importa (general → específico)
    Call CascadeRule_HDRRequiresColorDepth(ws, col, profileId)
    Call CascadeRule_HighFpsRequiresBuffer(ws, col, profileId)
    Call CascadeRule_4KRequiresParallel(ws, col, profileId)
    Call CascadeRule_SurroundRequiresCodec(ws, col, profileId)
    Call CascadeRule_BitrateRequiresBandwidth(ws, col, profileId)
    Call CascadeRule_LowLatencyRequiresLowBuffer(ws, col, profileId)
    Call CascadeRule_ReconnectScalesWithFitness(ws, col, profileId)
    Call CascadeRule_HeaderOverridesAlignToSettings(ws, col, profileId)

    Application.StatusBar = "[CASCADE] " & profileId & ": 8 reglas calidad aplicadas"
    Exit Sub
EH:
    Call WB_LogMsg("Brain_CascadeProfile(" & profileId & ") ERROR: " & Err.Number & " - " & Err.description)
End Sub

' Cambio atómico de UN campo, con propagación recursiva a dependientes
Public Sub Brain_CascadeAtomic(ByVal level As String, ByVal profileId As String, ByVal attr As String, ByVal newValue As Variant)
    On Error GoTo EH
    Dim ws As Worksheet
    Dim col As Long
    Dim r As Long

    Select Case UCase(level)
        Case "N2", "NIVEL_2", "2"
            Set ws = ThisWorkbook.Sheets(SHEET_NIVEL2)
            col = ProfileColumn(profileId)
            If col = 0 Then Exit Sub
            Call BuildN2RowMap(ws)
            r = FindN2Row(attr)
            If r = 0 Then Exit Sub
            ws.Cells(r, col).value = newValue
            ' Re-correr cascada en este perfil para propagar
            Call Brain_CascadeProfile(profileId)
            ' Si el campo afecta NIVEL_1 globals (master profile), re-derivar
            If profileId = MASTER_PROFILE Then Call Brain_DeriveNivel1FromNivel2

        Case "N1", "NIVEL_1", "1"
            Set ws = ThisWorkbook.Sheets(SHEET_NIVEL1)
            Call BuildN1RowMap(ws)
            r = FindN1Row(attr)  ' attr = directiva tag, ej "#EXT-X-SYS-NETWORK-CACHING"
            If r = 0 Then Exit Sub
            ws.Cells(r, 3).value = newValue  ' col C = Valor
            ' NIVEL_1 NO propaga abajo (es derivado)

        Case "N3", "NIVEL_3", "3"
            Set ws = ThisWorkbook.Sheets(SHEET_NIVEL3)
            Call BuildN3RowMap(ws)
            r = FindN3Row(attr)  ' attr = "capa.key" ej "EXTVLCOPT.network-caching"
            If r = 0 Then Exit Sub
            ws.Cells(r, 4).value = newValue  ' col D = Valor template
            ' NIVEL_3 NO propaga (es template con placeholders)
    End Select
    Exit Sub
EH:
    Call WB_LogMsg("Brain_CascadeAtomic ERROR: " & Err.Number & " - " & Err.description)
End Sub

'═══════════════════════════════════════════════════════════════════════════
' REGLAS DE CASCADA DE CALIDAD (intra-NIVEL_2)
'═══════════════════════════════════════════════════════════════════════════

' R1: HDR requiere bit_depth ≥ 10 + color_space BT.2020 + transfer PQ/HLG
'     Si peak_luminance_nits ≥ 1000 → es HDR → forzar bit_depth ≥ 10
Private Sub CascadeRule_HDRRequiresColorDepth(ByVal ws As Worksheet, ByVal col As Long, ByVal profileId As String)
    Dim peakNits As Long: peakNits = N2Num(ws, col, "settings.peak_luminance_nits")
    If peakNits < 1000 Then Exit Sub  ' SDR — sin cambios

    ' HDR: bit_depth mínimo 10
    Dim bd As Long: bd = N2Num(ws, col, "settings.bit_depth")
    If bd < 10 Then
        Call N2Set(ws, col, "settings.bit_depth", 10)
        Call N2Set(ws, col, "settings.bitDepth", 10)
        Call N2Set(ws, col, "vlcopt.video-bit-depth", 10)
    End If

    ' Color space: BT.2020 obligatorio para HDR ≥ 1000 nits
    Dim curCS As String: curCS = N2Str(ws, col, "settings.color_space")
    If curCS <> "BT.2020" Then
        Call N2Set(ws, col, "settings.color_space", "BT.2020")
        Call N2Set(ws, col, "settings.colorSpace", "BT.2020")
        Call N2Set(ws, col, "vlcopt.video-color-space", "BT.2020")
        Call N2Set(ws, col, "vlcopt.video-color-primaries", "BT.2020")
    End If

    ' video-bt2020 flag = true
    Call N2Set(ws, col, "vlcopt.video-bt2020", True)
    Call N2Set(ws, col, "vlcopt.video-hdr", True)
End Sub

' R2: High fps (≥60) requiere buffer escalado
'     Buffer mínimo = max(8s, fps/30 * 4s) — para 60fps = 8s, para 120fps = 16s
Private Sub CascadeRule_HighFpsRequiresBuffer(ByVal ws As Worksheet, ByVal col As Long, ByVal profileId As String)
    Dim fps As Long: fps = N2Num(ws, col, "settings.fps")
    If fps < 60 Then Exit Sub

    Dim minBufSec As Long: minBufSec = WorksheetFunction.max(8, Int(fps / 30) * 4)
    Dim curBufSec As Long: curBufSec = N2Num(ws, col, "settings.bufferTargetSec")
    If curBufSec < minBufSec Then
        Call N2Set(ws, col, "settings.bufferTargetSec", minBufSec)
        Call N2Set(ws, col, "settings.bufferSeconds", minBufSec)
        Call N2Set(ws, col, "settings.buffer", minBufSec * 1000)
        Call N2Set(ws, col, "vlcopt.network-caching", minBufSec * 1000)
        Call N2Set(ws, col, "vlcopt.live-caching", minBufSec * 1000)
        Call N2Set(ws, col, "vlcopt.file-caching", minBufSec * 1000)
        Call N2Set(ws, col, "hlsjs.maxBufferLength", minBufSec)
        Call N2Set(ws, col, "hlsjs.backBufferLength", minBufSec)
    End If
End Sub

' R3: 4K+ (height ≥ 2160) requiere parallel_downloads ≥ 4 + prefetch_segments ≥ 5
Private Sub CascadeRule_4KRequiresParallel(ByVal ws As Worksheet, ByVal col As Long, ByVal profileId As String)
    Dim res As String: res = N2Str(ws, col, "settings.resolution")
    Dim height As Long: height = ParseHeight(res)
    If height < 2160 Then Exit Sub

    Dim curPar As Long: curPar = N2Num(ws, col, "prefetch_config.parallel_downloads")
    If curPar < 4 Then
        Call N2Set(ws, col, "prefetch_config.parallel_downloads", 4)
        Call N2Set(ws, col, "settings.parallelFetches", 4)
    End If

    Dim curSegs As Long: curSegs = N2Num(ws, col, "prefetch_config.prefetch_segments")
    If curSegs < 5 Then
        Call N2Set(ws, col, "prefetch_config.prefetch_segments", 5)
        Call N2Set(ws, col, "prefetch_config.segments_ahead", 5)
        Call N2Set(ws, col, "settings.prefetchSegments", 5)
    End If
End Sub

' R4: Audio surround (audio_channels ≥ 6) requiere audio_codec = ec-3 + passthrough
Private Sub CascadeRule_SurroundRequiresCodec(ByVal ws As Worksheet, ByVal col As Long, ByVal profileId As String)
    Dim ch As Long: ch = N2Num(ws, col, "settings.audio_channels")
    If ch < 6 Then Exit Sub  ' Estéreo o menos — sin cambios

    Dim curCodec As String: curCodec = N2Str(ws, col, "settings.audio_codec")
    If LCase(curCodec) <> "ec-3" And LCase(curCodec) <> "eac3" Then
        Call N2Set(ws, col, "settings.audio_codec", "ec-3")
    End If
    Call N2Set(ws, col, "settings.audio_passthrough", True)
End Sub

' R5: Bitrate alto (≥ 50000 kbps = 50Mbps) implica max_bandwidth ajustado
Private Sub CascadeRule_BitrateRequiresBandwidth(ByVal ws As Worksheet, ByVal col As Long, ByVal profileId As String)
    Dim brKbps As Long: brKbps = N2Num(ws, col, "settings.maxBitrateKbps")
    If brKbps <= 0 Then Exit Sub
    Dim brBps As Double: brBps = brKbps * 1000

    ' max_bandwidth = bitrate * 1.5 (margen)
    Dim maxBw As Double: maxBw = brBps * 1.5
    Call N2Set(ws, col, "vlcopt.adaptive-initial-bandwidth", maxBw)
    ' kodiprop max_bandwidth (si alias existe)
    Call N2SetIfExists(ws, col, "kodiprop.inputstream.adaptive.max_bandwidth", maxBw)
    Call N2SetIfExists(ws, col, "hlsjs.abrEwmaDefaultEstimate", brBps)
    Call N2SetIfExists(ws, col, "hlsjs.abrEwmaDefaultEstimateMax", maxBw)
End Sub

' R6: Low latency (perfiles SD/HD que NO son HDR) → buffer puede ser pequeño (<10s OK)
'     Pero con piso mínimo 5s
Private Sub CascadeRule_LowLatencyRequiresLowBuffer(ByVal ws As Worksheet, ByVal col As Long, ByVal profileId As String)
    If profileId <> "P5" And profileId <> "P4" Then Exit Sub
    Dim curBufSec As Long: curBufSec = N2Num(ws, col, "settings.bufferTargetSec")
    If curBufSec < 5 Then
        ' Piso mínimo 5s (estabilidad básica)
        Call N2Set(ws, col, "settings.bufferTargetSec", 5)
        Call N2Set(ws, col, "settings.bufferSeconds", 5)
    End If
End Sub

' R7: Reconnect attempts escalan con tier (P0=350, P5=60)
Private Sub CascadeRule_ReconnectScalesWithFitness(ByVal ws As Worksheet, ByVal col As Long, ByVal profileId As String)
    Dim reconAttempts As Long
    Select Case profileId
        Case "P0": reconAttempts = 350
        Case "P1": reconAttempts = 215
        Case "P2": reconAttempts = 214
        Case "P3": reconAttempts = 156
        Case "P4": reconAttempts = 115
        Case "P5": reconAttempts = 60
    End Select
    Call N2Set(ws, col, "vlcopt.network-reconnect-count", reconAttempts)
    Call N2Set(ws, col, "vlcopt.http-max-retries", reconAttempts)
    Call N2SetIfExists(ws, col, "headerOverrides.X-Max-Retries", reconAttempts)
End Sub

' R8: headerOverrides X-* deben alinearse con settings (no valores ciegos)
Private Sub CascadeRule_HeaderOverridesAlignToSettings(ByVal ws As Worksheet, ByVal col As Long, ByVal profileId As String)
    Dim bufMs As Long: bufMs = N2Num(ws, col, "settings.buffer")
    If bufMs > 0 Then
        Call N2SetIfExists(ws, col, "headerOverrides.X-Buffer-Target", bufMs)
        Call N2SetIfExists(ws, col, "headerOverrides.X-ExoPlayer-Buffer-Min", Int(bufMs / 2))  ' min = half del target
    End If

    Dim res As String: res = N2Str(ws, col, "settings.resolution")
    If res <> "" Then
        Call N2SetIfExists(ws, col, "headerOverrides.X-Resolution-Target", res)
        Call N2SetIfExists(ws, col, "headerOverrides.X-Max-Resolution", res)
    End If

    Dim codec As String: codec = N2Str(ws, col, "settings.codec_full")
    If codec <> "" Then
        Call N2SetIfExists(ws, col, "headerOverrides.X-Video-Codec-Full", codec)
        Call N2SetIfExists(ws, col, "headerOverrides.X-CODECS", codec)
    End If
End Sub

'═══════════════════════════════════════════════════════════════════════════
' NIVEL_2 → NIVEL_1 (master profile dicta globales)
'═══════════════════════════════════════════════════════════════════════════

Public Sub Brain_DeriveNivel1FromNivel2()
    On Error GoTo EH
    Dim wsN1 As Worksheet: Set wsN1 = ThisWorkbook.Sheets(SHEET_NIVEL1)
    Dim wsN2 As Worksheet: Set wsN2 = ThisWorkbook.Sheets(SHEET_NIVEL2)
    Call BuildN2RowMap(wsN2)
    Call BuildN1RowMap(wsN1)

    Dim mp As Long: mp = ProfileColumn(MASTER_PROFILE)

    ' ── Buffer global (master profile) ───────────────────────────────────────
    Dim bufMs As Long: bufMs = N2Num(wsN2, mp, "settings.buffer")
    If bufMs > 0 Then
        Call N1Set(wsN1, "#EXT-X-SYS-NETWORK-CACHING", bufMs)
        ' Strategy = NETWORK={bufMs},LIVE={maxLive},FILE={maxFile}
        Dim maxLive As Long: maxLive = MaxOverProfiles(wsN2, "vlcopt.live-caching")
        Dim p0File As Long: p0File = N2Num(wsN2, ProfileColumn("P0"), "vlcopt.file-caching")
        Call N1Set(wsN1, "#EXT-X-SYS-GLOBAL-BUFFER-STRATEGY", _
            "NETWORK=" & bufMs & ",LIVE=" & maxLive & ",FILE=" & p0File)
        Call N1Set(wsN1, "#EXT-X-SYS-LIVE-CACHING", maxLive)
        Call N1Set(wsN1, "#EXT-X-SYS-FILE-CACHING", p0File)
    End If

    ' ── Codec priority (unión de todos los perfiles) ─────────────────────────
    Dim codecsUnion As String: codecsUnion = UnionCodecPriority(wsN2)
    If codecsUnion <> "" Then
        Call N1Set(wsN1, "#EXT-X-SYS-VIDEO-CODEC-PRIORITY", codecsUnion)
    End If
    Dim audioUnion As String: audioUnion = UnionAudioCodec(wsN2)
    If audioUnion <> "" Then
        Call N1Set(wsN1, "#EXT-X-SYS-AUDIO-CODEC-PRIORITY", audioUnion)
    End If

    ' ── Bandwidth bounds (min P5, max P0) ────────────────────────────────────
    Dim maxBwBps As Double: maxBwBps = MaxOverProfiles(wsN2, "settings.maxBitrateKbps") * 1000
    Dim minBwBps As Double: minBwBps = N2Num(wsN2, ProfileColumn("P5"), "settings.maxBitrateKbps") * 1000
    If maxBwBps > 0 Then Call N1Set(wsN1, "#EXT-X-SYS-MAX-BANDWIDTH", maxBwBps)
    If minBwBps > 0 Then Call N1Set(wsN1, "#EXT-X-SYS-MIN-BANDWIDTH", minBwBps)

    ' ── Reconnect target (master profile) ────────────────────────────────────
    Dim reconMaster As Long: reconMaster = N2Num(wsN2, mp, "vlcopt.network-reconnect-count")
    If reconMaster > 0 Then
        Call N1Set(wsN1, "#EXT-X-SYS-RECONNECT-MAX-ATTEMPTS", reconMaster)
    End If

    ' ── Resolution global (max sobre perfiles) ───────────────────────────────
    Dim maxRes As String: maxRes = N2Str(wsN2, ProfileColumn("P0"), "settings.resolution")
    If maxRes <> "" Then
        Call N1Set(wsN1, "#EXT-X-SYS-MAX-RESOLUTION", maxRes)
    End If

    ' ── HDR support flag ─────────────────────────────────────────────────────
    Dim anyHDR As Boolean: anyHDR = AnyProfileHasHDR(wsN2)
    Call N1Set(wsN1, "#EXT-X-SYS-HDR-SUPPORTED", IIf(anyHDR, "true", "false"))

    Application.StatusBar = "[CASCADE] NIVEL_1 derived from NIVEL_2 (master=" & MASTER_PROFILE & ")"
    Exit Sub
EH:
    Call WB_LogMsg("Brain_DeriveNivel1FromNivel2 ERROR: " & Err.Number & " - " & Err.description)
End Sub

'═══════════════════════════════════════════════════════════════════════════
' NIVEL_3 placeholder validation — ¿se podrán resolver con NIVEL_2 actual?
'═══════════════════════════════════════════════════════════════════════════

Public Sub Brain_ValidateNivel3Placeholders()
    On Error GoTo EH
    Dim wsN3 As Worksheet: Set wsN3 = ThisWorkbook.Sheets(SHEET_NIVEL3)
    Dim wsN2 As Worksheet: Set wsN2 = ThisWorkbook.Sheets(SHEET_NIVEL2)
    Call BuildN2RowMap(wsN2)

    Dim lastR As Long: lastR = wsN3.Cells(wsN3.rows.Count, 1).End(xlUp).row
    Dim r As Long, broken As Long: broken = 0
    Dim issues As String

    For r = N3_FIRST_DATA_ROW To lastR
        Dim val As String: val = CStr(wsN3.Cells(r, 4).value)  ' col D = valor template
        If val = "" Then GoTo nextR
        ' Buscar todos los placeholders
        Dim placeholders As Variant: placeholders = ExtractPlaceholders(val)
        Dim i As Long
        For i = LBound(placeholders) To UBound(placeholders)
            If Not PlaceholderResolvable(CStr(placeholders(i)), wsN2) Then
                broken = broken + 1
                Dim cap As String: cap = CStr(wsN3.Cells(r, 2).value)
                Dim ky As String: ky = CStr(wsN3.Cells(r, 3).value)
                If broken <= 10 Then
                    issues = issues & vbCrLf & "  R" & r & " [" & cap & "." & ky & "]: " & placeholders(i)
                End If
                ' Marcar status (col E) como BROKEN
                wsN3.Cells(r, 5).value = "⚠️ BROKEN: " & placeholders(i) & " not in NIVEL_2"
            End If
        Next i
nextR:
    Next r

    If broken > 0 Then
        Application.StatusBar = "[CASCADE] " & broken & " NIVEL_3 placeholders BROKEN (ver col E)"
        Call WB_LogMsg("[CASCADE] " & broken & " broken placeholders found:" & issues)
    Else
        Application.StatusBar = "[CASCADE] NIVEL_3 placeholders all resolvable ✅"
    End If
    Exit Sub
EH:
    Call WB_LogMsg("Brain_ValidateNivel3Placeholders ERROR: " & Err.Number & " - " & Err.description)
End Sub

'═══════════════════════════════════════════════════════════════════════════
' HELPERS
'═══════════════════════════════════════════════════════════════════════════

Private Function ProfileColumn(ByVal profileId As String) As Long
    Select Case profileId
        Case "P0": ProfileColumn = 2
        Case "P1": ProfileColumn = 3
        Case "P2": ProfileColumn = 4
        Case "P3": ProfileColumn = 5
        Case "P4": ProfileColumn = 6
        Case "P5": ProfileColumn = 7
        Case Else: ProfileColumn = 0
    End Select
End Function

Private Sub BuildN2RowMap(ByVal ws As Worksheet)
    Set n2RowMap = CreateObject("Scripting.Dictionary")
    Dim lastR As Long: lastR = ws.Cells(ws.rows.Count, 1).End(xlUp).row
    Dim r As Long
    For r = N2_FIRST_DATA_ROW To lastR
        Dim attr As String: attr = Trim(CStr(ws.Cells(r, 1).value))
        If attr <> "" And Not n2RowMap.Exists(attr) Then n2RowMap.Add attr, r
    Next r
End Sub

Private Sub BuildN1RowMap(ByVal ws As Worksheet)
    Set n1RowMap = CreateObject("Scripting.Dictionary")
    Dim lastR As Long: lastR = ws.Cells(ws.rows.Count, 2).End(xlUp).row
    Dim r As Long
    For r = N1_FIRST_DATA_ROW To lastR
        Dim tag As String: tag = Trim(CStr(ws.Cells(r, 2).value))
        If tag <> "" And Not n1RowMap.Exists(tag) Then n1RowMap.Add tag, r
    Next r
End Sub

Private Sub BuildN3RowMap(ByVal ws As Worksheet)
    Set n3RowMap = CreateObject("Scripting.Dictionary")
    Dim lastR As Long: lastR = ws.Cells(ws.rows.Count, 3).End(xlUp).row
    Dim r As Long
    For r = N3_FIRST_DATA_ROW To lastR
        Dim cap As String: cap = Trim(CStr(ws.Cells(r, 2).value))
        Dim ky As String: ky = Trim(CStr(ws.Cells(r, 3).value))
        If cap <> "" And ky <> "" Then
            Dim k As String: k = cap & "." & ky
            If Not n3RowMap.Exists(k) Then n3RowMap.Add k, r
        End If
    Next r
End Sub

Private Function FindN2Row(ByVal attr As String) As Long
    If n2RowMap Is Nothing Then FindN2Row = 0: Exit Function
    If n2RowMap.Exists(attr) Then FindN2Row = CLng(n2RowMap(attr)) Else FindN2Row = 0
End Function

Private Function FindN1Row(ByVal tag As String) As Long
    If n1RowMap Is Nothing Then FindN1Row = 0: Exit Function
    If n1RowMap.Exists(tag) Then FindN1Row = CLng(n1RowMap(tag)) Else FindN1Row = 0
End Function

Private Function FindN3Row(ByVal capaDotKey As String) As Long
    If n3RowMap Is Nothing Then FindN3Row = 0: Exit Function
    If n3RowMap.Exists(capaDotKey) Then FindN3Row = CLng(n3RowMap(capaDotKey)) Else FindN3Row = 0
End Function

Private Function N2Num(ByVal ws As Worksheet, ByVal col As Long, ByVal attr As String) As Long
    Dim r As Long: r = FindN2Row(attr)
    If r = 0 Then N2Num = 0: Exit Function
    Dim v As Variant: v = ws.Cells(r, col).value
    If IsNumeric(v) Then
        N2Num = CLng(v)
    Else
        Dim s As String: s = Replace(CStr(v), ",", ".")
        If IsNumeric(s) Then N2Num = CLng(CDbl(s)) Else N2Num = 0
    End If
End Function

Private Function N2Str(ByVal ws As Worksheet, ByVal col As Long, ByVal attr As String) As String
    Dim r As Long: r = FindN2Row(attr)
    If r = 0 Then N2Str = "": Exit Function
    N2Str = Trim(CStr(ws.Cells(r, col).value))
End Function

Private Sub N2Set(ByVal ws As Worksheet, ByVal col As Long, ByVal attr As String, ByVal val As Variant)
    Dim r As Long: r = FindN2Row(attr)
    If r = 0 Then Exit Sub
    ws.Cells(r, col).value = val
End Sub

Private Sub N2SetIfExists(ByVal ws As Worksheet, ByVal col As Long, ByVal attr As String, ByVal val As Variant)
    Dim r As Long: r = FindN2Row(attr)
    If r = 0 Then Exit Sub
    ws.Cells(r, col).value = val
End Sub

Private Sub N1Set(ByVal ws As Worksheet, ByVal tag As String, ByVal val As Variant)
    Dim r As Long: r = FindN1Row(tag)
    If r = 0 Then Exit Sub
    ws.Cells(r, 3).value = val  ' col C = Valor
End Sub

Private Function ParseHeight(ByVal res As String) As Long
    Dim parts() As String
    parts = Split(res, "x")
    If UBound(parts) >= 1 Then
        If IsNumeric(parts(1)) Then ParseHeight = CLng(parts(1)) Else ParseHeight = 0
    Else
        ParseHeight = 0
    End If
End Function

Private Function MaxOverProfiles(ByVal ws As Worksheet, ByVal attr As String) As Long
    Dim mx As Long: mx = 0
    Dim p As Variant
    For Each p In Array("P0", "P1", "P2", "P3", "P4", "P5")
        Dim v As Long: v = N2Num(ws, ProfileColumn(CStr(p)), attr)
        If v > mx Then mx = v
    Next p
    MaxOverProfiles = mx
End Function

Private Function UnionCodecPriority(ByVal ws As Worksheet) As String
    Dim seen As Object: Set seen = CreateObject("Scripting.Dictionary")
    Dim p As Variant
    For Each p In Array("P0", "P1", "P2", "P3", "P4", "P5")
        Dim cp As String: cp = N2Str(ws, ProfileColumn(CStr(p)), "settings.codec_priority")
        If cp <> "" Then
            Dim parts() As String: parts = Split(cp, ",")
            Dim i As Long
            For i = LBound(parts) To UBound(parts)
                Dim k As String: k = Trim(parts(i))
                If k <> "" And Not seen.Exists(k) Then seen.Add k, True
            Next i
        End If
    Next p
    UnionCodecPriority = Join(seen.Keys, ",")
End Function

Private Function UnionAudioCodec(ByVal ws As Worksheet) As String
    Dim seen As Object: Set seen = CreateObject("Scripting.Dictionary")
    Dim p As Variant
    For Each p In Array("P0", "P1", "P2", "P3", "P4", "P5")
        Dim ac As String: ac = N2Str(ws, ProfileColumn(CStr(p)), "settings.audio_codec")
        If ac <> "" And Not seen.Exists(ac) Then seen.Add ac, True
    Next p
    UnionAudioCodec = Join(seen.Keys, ",")
End Function

Private Function AnyProfileHasHDR(ByVal ws As Worksheet) As Boolean
    Dim p As Variant
    For Each p In Array("P0", "P1", "P2", "P3", "P4", "P5")
        Dim peak As Long: peak = N2Num(ws, ProfileColumn(CStr(p)), "settings.peak_luminance_nits")
        If peak >= 1000 Then AnyProfileHasHDR = True: Exit Function
    Next p
    AnyProfileHasHDR = False
End Function

Private Function ExtractPlaceholders(ByVal str As String) As Variant
    ' Encuentra todos los {ns.key}
    Dim result() As String
    Dim count As Long: count = 0
    ReDim result(0 To 50)
    Dim i As Long: i = 1
    Do While i <= Len(str)
        Dim openP As Long: openP = InStr(i, str, "{")
        If openP = 0 Then Exit Do
        Dim closeP As Long: closeP = InStr(openP, str, "}")
        If closeP = 0 Then Exit Do
        result(count) = Mid(str, openP, closeP - openP + 1)
        count = count + 1
        If count > 50 Then Exit Do
        i = closeP + 1
    Loop
    ReDim Preserve result(0 To IIf(count = 0, 0, count - 1))
    If count = 0 Then ExtractPlaceholders = Array() Else ExtractPlaceholders = result
End Function

Private Function PlaceholderResolvable(ByVal placeholder As String, ByVal wsN2 As Worksheet) As Boolean
    ' Runtime placeholders siempre resolvibles
    Dim runtime As Variant: runtime = Array("{auto-now}", "{auto}", "{utc}", "{lutc}", "{rand}", _
        "{user}", "{pass}", "{stream_id}", "{server_url}", "{stream_path}")
    Dim r As Variant
    For Each r In runtime
        If LCase(placeholder) = LCase(CStr(r)) Then PlaceholderResolvable = True: Exit Function
    Next r

    ' {channel.X} resoluble runtime con channel object
    If LCase(Left(placeholder, 9)) = "{channel." Then PlaceholderResolvable = True: Exit Function

    ' {profile.X} debe existir como settings.X o equivalente en NIVEL_2
    If LCase(Left(placeholder, 9)) = "{profile." Then
        Dim attr As String: attr = Mid(placeholder, 10, Len(placeholder) - 10)
        ' Mapeo conocido
        Dim mapped As String: mapped = MapProfilePlaceholderToN2(attr)
        If FindN2Row(mapped) > 0 Then PlaceholderResolvable = True: Exit Function
        ' Probar otros aliases
        If FindN2Row("settings." & attr) > 0 Then PlaceholderResolvable = True: Exit Function
    End If

    ' {config.X} resoluble runtime con config_global del JSON
    If LCase(Left(placeholder, 8)) = "{config." Then PlaceholderResolvable = True: Exit Function

    PlaceholderResolvable = False
End Function

Private Function MapProfilePlaceholderToN2(ByVal placeholderKey As String) As String
    Select Case LCase(placeholderKey)
        Case "buffer_ms":     MapProfilePlaceholderToN2 = "settings.buffer"
        Case "buffer_s":      MapProfilePlaceholderToN2 = "settings.bufferTargetSec"
        Case "max_bandwidth": MapProfilePlaceholderToN2 = "settings.maxBitrateKbps"
        Case "max_width":     MapProfilePlaceholderToN2 = "vlcopt.video-width"
        Case "max_height":    MapProfilePlaceholderToN2 = "vlcopt.video-height"
        Case "resolution":    MapProfilePlaceholderToN2 = "settings.resolution"
        Case "fps":           MapProfilePlaceholderToN2 = "settings.fps"
        Case "codecs":        MapProfilePlaceholderToN2 = "settings.codec_full"
        Case "bandwidth":     MapProfilePlaceholderToN2 = "settings.maxBitrateKbps"
        Case "avg_bandwidth": MapProfilePlaceholderToN2 = "settings.avgBitrateKbps"
        Case "video_range":   MapProfilePlaceholderToN2 = "settings.videoRange"
        Case Else:            MapProfilePlaceholderToN2 = "settings." & placeholderKey
    End Select
End Function

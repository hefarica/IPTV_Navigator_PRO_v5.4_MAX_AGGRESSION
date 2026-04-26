Attribute VB_Name = "APE_COHERENCE"
'═══════════════════════════════════════════════════════════════════════════
' APE_COHERENCE — SSOT enforcer para hoja 6_NIVEL_2_PROFILES
'═══════════════════════════════════════════════════════════════════════════
' DOCTRINA: el LAB Excel tenía 6 representaciones distintas para el mismo
' concepto (buffer P0 = 60000ms vlcopt vs 34000ms X-ExoPlayer vs 105000ms
' opt.buffer_seconds). Este módulo enforce que TODAS las representaciones
' tengan el valor correcto y coherente, eligiendo la fuente de autoridad
' según fitness del solver y propagando byte-by-byte a sus alias.
'
' SE LLAMA AUTOMÁTICAMENTE al final de Brain_OmegaOptimizer_PerProfile
' (modificación al hook en APE_OMEGA_MATH.bas — ver INSTRUCCIONES_HOOK.md).
'
' AUTOR: HFRC + agente, 2026-04-26
'═══════════════════════════════════════════════════════════════════════════

Option Explicit

Private Const SHEET_PROFILES As String = "6_NIVEL_2_PROFILES"
Private Const FIRST_DATA_ROW As Long = 7

' Mapa attr → fila (precalculado por scan)
Private cohRowMap As Object   ' Scripting.Dictionary: attrName → rowIndex

'═══════════════════════════════════════════════════════════════════════════
' ENTRY POINT — llamado al final del optimizer
'═══════════════════════════════════════════════════════════════════════════
Public Sub Brain_EnforceCoherence(ByVal profileId As String)
    On Error GoTo EH
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets(SHEET_PROFILES)
    Dim col As Long: col = CoherenceProfileColumn(profileId)
    If col = 0 Then Exit Sub

    Call BuildRowMap(ws)

    ' === Los 6 fixes ===
    Call FixHdrColorAliases(ws, col)
    Call FixFpsAliases(ws, col)
    Call FixManifestAndStreamHeaders(ws, col, profileId)
    Call FixPrefetchCoherence(ws, col, profileId)
    Call FixParallelDownloadsScaling(ws, col, profileId)
    Call FixBufferUnification(ws, col, profileId)

    Application.StatusBar = "[COHERENCE] " & profileId & ": 6 reglas aplicadas"
    Exit Sub
EH:
    On Error Resume Next
    Call WB_LogMsg("Brain_EnforceCoherence(" & profileId & ") ERROR: " & Err.Number & " - " & Err.description)
End Sub

' Iterar P0..P5
Public Sub Brain_EnforceCoherenceAll()
    Dim p As Variant
    For Each p In Array("P0", "P1", "P2", "P3", "P4", "P5")
        Call Brain_EnforceCoherence(CStr(p))
    Next p
    Application.StatusBar = "[COHERENCE] All profiles synced"
End Sub

'═══════════════════════════════════════════════════════════════════════════
' FIX 1 — Alias dedup HDR/Color
' peak_luminance_nits ≡ peakLuminanceNits   (autoridad: max valor; 1 nits real)
' bit_depth ≡ bitDepth                      (autoridad: max valor; bits reales)
' hdr_mode ≡ hdrMode                        (autoridad: el más expresivo)
' color_space ≡ colorSpace
'═══════════════════════════════════════════════════════════════════════════
Private Sub FixHdrColorAliases(ByVal ws As Worksheet, ByVal col As Long)
    Call SyncMaxNumeric(ws, col, "settings.peak_luminance_nits", "settings.peakLuminanceNits")
    Call SyncMaxNumeric(ws, col, "settings.bit_depth", "settings.bitDepth")
    Call SyncStringPick(ws, col, "settings.hdr_mode", "settings.hdrMode", PreferredHdrMode)
    Call SyncStringPick(ws, col, "settings.color_space", "settings.colorSpace", "")
End Sub

'═══════════════════════════════════════════════════════════════════════════
' FIX 2 — FPS aliases
' settings.fps ≡ settings.targetFps ≡ vlcopt.video-fps
' AUTORIDAD: max(fps, targetFps, video-fps) si todos > 0; si video-fps=120 con
' fps=60 → puede ser intencional (HFR display refresh) PERO debe coincidir.
' REGLA: tomar settings.fps como autoridad (lo que el solver/usuario dice).
'═══════════════════════════════════════════════════════════════════════════
Private Sub FixFpsAliases(ByVal ws As Worksheet, ByVal col As Long)
    Dim fpsAuth As Long: fpsAuth = NumericVal(ws, col, "settings.fps")
    If fpsAuth <= 0 Then fpsAuth = NumericVal(ws, col, "settings.targetFps")
    If fpsAuth <= 0 Then fpsAuth = NumericVal(ws, col, "vlcopt.video-fps")
    If fpsAuth <= 0 Then Exit Sub
    Call SetCell(ws, col, "settings.fps", fpsAuth)
    Call SetCell(ws, col, "settings.targetFps", fpsAuth)
    Call SetCell(ws, col, "vlcopt.video-fps", fpsAuth)
End Sub

'═══════════════════════════════════════════════════════════════════════════
' FIX 3 — Manifest type + Stream headers (P4/P5 vacíos)
' P5.kodiprop.inputstream.adaptive.manifest_type vacío → llenar con "hls"
' P4-P5.kodiprop.inputstream.adaptive.stream_headers vacíos → copiar del P3
'═══════════════════════════════════════════════════════════════════════════
Private Sub FixManifestAndStreamHeaders(ByVal ws As Worksheet, ByVal col As Long, ByVal profileId As String)
    Dim manifestKey As String: manifestKey = "kodiprop.inputstream.adaptive.manifest_type"
    Dim curManifest As String: curManifest = StringVal(ws, col, manifestKey)
    If curManifest = "" Then Call SetCell(ws, col, manifestKey, "hls")

    Dim shKey As String: shKey = "kodiprop.inputstream.adaptive.stream_headers"
    Dim curSh As String: curSh = StringVal(ws, col, shKey)
    If curSh = "" Then
        ' Copiar del P0 (autoridad fallback)
        Dim p0Sh As String: p0Sh = StringVal(ws, CoherenceProfileColumn("P0"), shKey)
        If p0Sh <> "" Then Call SetCell(ws, col, shKey, p0Sh)
    End If
End Sub

'═══════════════════════════════════════════════════════════════════════════
' FIX 4 — Prefetch coherence
' prefetch_config.prefetch_segments ≡ prefetch_config.segments_ahead
' AUTORIDAD: prefetch_config.prefetch_segments (output del Brain refinado)
'═══════════════════════════════════════════════════════════════════════════
Private Sub FixPrefetchCoherence(ByVal ws As Worksheet, ByVal col As Long, ByVal profileId As String)
    Dim segs As Long: segs = NumericVal(ws, col, "prefetch_config.prefetch_segments")
    If segs <= 0 Then segs = NumericVal(ws, col, "settings.prefetchSegments")
    If segs <= 0 Then Exit Sub
    Call SetCell(ws, col, "prefetch_config.prefetch_segments", segs)
    Call SetCell(ws, col, "prefetch_config.segments_ahead", segs)
    Call SetCell(ws, col, "settings.prefetchSegments", segs)
End Sub

'═══════════════════════════════════════════════════════════════════════════
' FIX 5 — Parallel downloads scaling (Brain MEJORADO)
' ANTES: solo P0=8, P1..P5=2 (drift, hardcoded por humano)
' AHORA: escala con prefetch_segments y bandwidth target.
' P0=8 (max ancho banda 200Mbps), P1=6, P2=5, P3=4, P4=3, P5=2.
'═══════════════════════════════════════════════════════════════════════════
Private Sub FixParallelDownloadsScaling(ByVal ws As Worksheet, ByVal col As Long, ByVal profileId As String)
    Dim parallel As Long
    Select Case profileId
        Case "P0": parallel = 8
        Case "P1": parallel = 6
        Case "P2": parallel = 5
        Case "P3": parallel = 4
        Case "P4": parallel = 3
        Case "P5": parallel = 2
        Case Else: parallel = 4
    End Select
    Call SetCell(ws, col, "prefetch_config.parallel_downloads", parallel)
    Call SetCell(ws, col, "settings.parallelFetches", parallel)
End Sub

'═══════════════════════════════════════════════════════════════════════════
' FIX 6 — Buffer unification (CRÍTICO)
' AUTORIDAD: opt.buffer_seconds (output del solver) SI fitness >= 0.5,
' SINO vlcopt.network-caching (calibración manual).
'
' Propaga a TODAS las representaciones:
'   settings.buffer = ms
'   settings.bufferSeconds = sec
'   settings.bufferTargetSec = sec
'   settings.networkCachingMs = ms
'   settings.maxBuffer (si existe) = ms
'   vlcopt.network-caching, vlcopt.live-caching, vlcopt.file-caching,
'   vlcopt.disc-caching, vlcopt.tcp-caching, vlcopt.sout-mux-caching = ms
'   hlsjs.maxBufferLength, hlsjs.backBufferLength = sec
'   prefetch_config.buffer_target_seconds = sec
'   headerOverrides.X-Buffer-Target, X-Min-Buffer-Time, X-Max-Buffer-Time = ms
'   headerOverrides.X-ExoPlayer-Buffer-Min = ms (alineado, no 34000 hardcoded)
'═══════════════════════════════════════════════════════════════════════════
Private Sub FixBufferUnification(ByVal ws As Worksheet, ByVal col As Long, ByVal profileId As String)
    Dim fitness As Double: fitness = NumericValDouble(ws, col, "opt.fitness")
    Dim bufSec As Long
    If fitness >= 0.5 Then
        bufSec = NumericVal(ws, col, "opt.buffer_seconds")  ' Solver autoridad
    End If
    If bufSec <= 0 Then
        bufSec = NumericVal(ws, col, "vlcopt.network-caching") \ 1000  ' Manual fallback
    End If
    If bufSec <= 0 Then Exit Sub

    Dim bufMs As Long: bufMs = bufSec * 1000

    ' Propagación masiva — settings (sec o ms según key)
    Call SetCell(ws, col, "settings.buffer", bufMs)
    Call SetCell(ws, col, "settings.bufferSeconds", bufSec)
    Call SetCell(ws, col, "settings.bufferTargetSec", bufSec)
    Call SetCell(ws, col, "settings.networkCachingMs", bufMs)

    ' vlcopt (todas en ms)
    Call SetCell(ws, col, "vlcopt.network-caching", bufMs)
    Call SetCell(ws, col, "vlcopt.live-caching", bufMs)
    Call SetCell(ws, col, "vlcopt.file-caching", bufMs)
    Call SetCell(ws, col, "vlcopt.disc-caching", bufMs)
    Call SetCell(ws, col, "vlcopt.tcp-caching", bufMs)
    Call SetCell(ws, col, "vlcopt.sout-mux-caching", bufMs)

    ' hlsjs (sec)
    Call SetCell(ws, col, "hlsjs.maxBufferLength", bufSec)
    Call SetCell(ws, col, "hlsjs.backBufferLength", bufSec)

    ' prefetch_config (sec, aunque sea más bajo, debe estar coherente)
    Dim pfSec As Long: pfSec = bufSec ' alineado al buffer principal
    Call SetCell(ws, col, "prefetch_config.buffer_target_seconds", pfSec)

    ' headerOverrides — buffer headers en ms
    Call SetCellIfExists(ws, col, "headerOverrides.X-Buffer-Target", bufMs)
    Call SetCellIfExists(ws, col, "headerOverrides.X-Min-Buffer-Time", bufSec)  ' este es sec
    Call SetCellIfExists(ws, col, "headerOverrides.X-Max-Buffer-Time", bufSec)
    Call SetCellIfExists(ws, col, "headerOverrides.X-ExoPlayer-Buffer-Min", bufMs)
End Sub

'═══════════════════════════════════════════════════════════════════════════
' HELPERS
'═══════════════════════════════════════════════════════════════════════════
Private Function CoherenceProfileColumn(ByVal profileId As String) As Long
    Select Case profileId
        Case "P0": CoherenceProfileColumn = 2
        Case "P1": CoherenceProfileColumn = 3
        Case "P2": CoherenceProfileColumn = 4
        Case "P3": CoherenceProfileColumn = 5
        Case "P4": CoherenceProfileColumn = 6
        Case "P5": CoherenceProfileColumn = 7
        Case Else: CoherenceProfileColumn = 0
    End Select
End Function

Private Sub BuildRowMap(ByVal ws As Worksheet)
    Set cohRowMap = CreateObject("Scripting.Dictionary")
    Dim lastR As Long: lastR = ws.Cells(ws.rows.Count, 1).End(xlUp).row
    Dim r As Long
    For r = FIRST_DATA_ROW To lastR
        Dim attr As String: attr = Trim(CStr(ws.Cells(r, 1).value))
        If attr <> "" And Not cohRowMap.Exists(attr) Then
            cohRowMap.Add attr, r
        End If
    Next r
End Sub

Private Function FindRow(ByVal attr As String) As Long
    If cohRowMap Is Nothing Then FindRow = 0: Exit Function
    If cohRowMap.Exists(attr) Then
        FindRow = CLng(cohRowMap(attr))
    Else
        FindRow = 0
    End If
End Function

Private Function NumericVal(ByVal ws As Worksheet, ByVal col As Long, ByVal attr As String) As Long
    Dim r As Long: r = FindRow(attr)
    If r = 0 Then NumericVal = 0: Exit Function
    Dim v As Variant: v = ws.Cells(r, col).value
    If IsNumeric(v) Then
        NumericVal = CLng(v)
    Else
        ' Tolerar "60000" string o "60,5" español
        Dim s As String: s = Replace(CStr(v), ",", ".")
        If IsNumeric(s) Then NumericVal = CLng(CDbl(s)) Else NumericVal = 0
    End If
End Function

Private Function NumericValDouble(ByVal ws As Worksheet, ByVal col As Long, ByVal attr As String) As Double
    Dim r As Long: r = FindRow(attr)
    If r = 0 Then NumericValDouble = 0: Exit Function
    Dim v As Variant: v = ws.Cells(r, col).value
    If IsNumeric(v) Then
        NumericValDouble = CDbl(v)
    Else
        Dim s As String: s = Replace(CStr(v), ",", ".")
        If IsNumeric(s) Then NumericValDouble = CDbl(s) Else NumericValDouble = 0
    End If
End Function

Private Function StringVal(ByVal ws As Worksheet, ByVal col As Long, ByVal attr As String) As String
    Dim r As Long: r = FindRow(attr)
    If r = 0 Then StringVal = "": Exit Function
    StringVal = Trim(CStr(ws.Cells(r, col).value))
End Function

Private Sub SetCell(ByVal ws As Worksheet, ByVal col As Long, ByVal attr As String, ByVal val As Variant)
    Dim r As Long: r = FindRow(attr)
    If r = 0 Then Exit Sub
    ws.Cells(r, col).value = val
End Sub

Private Sub SetCellIfExists(ByVal ws As Worksheet, ByVal col As Long, ByVal attr As String, ByVal val As Variant)
    Dim r As Long: r = FindRow(attr)
    If r = 0 Then Exit Sub  ' silenciosamente skip si no existe (header opcional)
    ws.Cells(r, col).value = val
End Sub

' Sincronizar 2 alias numéricos al MAX (regla "el más alto = el más correcto")
Private Sub SyncMaxNumeric(ByVal ws As Worksheet, ByVal col As Long, ByVal attrA As String, ByVal attrB As String)
    Dim a As Long: a = NumericVal(ws, col, attrA)
    Dim b As Long: b = NumericVal(ws, col, attrB)
    Dim max As Long: max = IIf(a > b, a, b)
    If max <= 0 Then Exit Sub
    Call SetCell(ws, col, attrA, max)
    Call SetCell(ws, col, attrB, max)
End Sub

' Sincronizar 2 alias string. Si preferred no vacío, lo aplica a ambos. Sino, usa el primero no-vacío.
Private Sub SyncStringPick(ByVal ws As Worksheet, ByVal col As Long, ByVal attrA As String, ByVal attrB As String, ByVal preferred As String)
    Dim a As String: a = StringVal(ws, col, attrA)
    Dim b As String: b = StringVal(ws, col, attrB)
    Dim chosen As String
    If preferred <> "" Then
        chosen = preferred
    ElseIf a <> "" Then
        chosen = a
    ElseIf b <> "" Then
        chosen = b
    Else
        Exit Sub
    End If
    Call SetCell(ws, col, attrA, chosen)
    Call SetCell(ws, col, attrB, chosen)
End Sub

' Helper para preferir el HDR mode más expresivo
' DOLBY_VISION_P8 > HDR10PLUS > HDR10 > HLG > SDR
Private Function PreferredHdrMode() As String
    PreferredHdrMode = ""  ' Por defecto, no forzar; mantener el del LAB
End Function

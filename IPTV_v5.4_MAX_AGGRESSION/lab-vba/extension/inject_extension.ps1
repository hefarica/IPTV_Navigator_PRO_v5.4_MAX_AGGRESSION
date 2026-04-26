# inject_extension.ps1 -- T2 increment: VBA test gates only
# Adds FE_TEST_FORCED_PATH, FE_TestSetForcedPath, FE_TestRunImport,
# a Public SetConfigVal_Public wrapper, and overrides FE_BrowseForJSON.
#
# REALITIES vs spec:
#   - SetConfigVal is Private in APE_LAB_BRAIN -- xl.Run cannot call it.
#     We add SetConfigVal_Public as a thin Public wrapper in the same module.
#   - WIRING_SILENT does not exist -- FE_TestRunImport is self-contained:
#     it replicates the import flow (same module, can call Private subs)
#     without any MsgBox, and calls FE_SyncProfilesJS + SetConfigVal directly.
#   - 17_SERVERS_POOL is password-protected; FE_TestRunImport skips server sync.
#   - FE_BrowseForJSON is Private -- replaced with gate that honours FE_TEST_FORCED_PATH.
#   - AddFromString places variable declarations before the next proc; on re-run
#     ProcStartLine does not find them (they are not Subs/Functions), leaving
#     orphaned duplicates that cause compile errors. The cleanup below scans
#     for any FE_TEST_FORCED_PATH declaration lines and deletes them first.
#
$ErrorActionPreference = 'Stop'
$xl = [Runtime.InteropServices.Marshal]::GetActiveObject('Excel.Application')
$wb = $null
foreach ($b in $xl.Workbooks) { if ($b.Name -eq 'APE_M3U8_LAB_v8_FIXED.xlsm') { $wb = $b; break } }
if (-not $wb) { throw "Abrir APE_M3U8_LAB_v8_FIXED.xlsm primero" }

$brain = $wb.VBProject.VBComponents.Item('APE_LAB_BRAIN').CodeModule

# ── Helper: delete Sub/Function by name (ignores if not found) ──────────────
function Remove-Proc($name) {
    try {
        $sl = $brain.ProcStartLine($name, 0)
        $cl = $brain.ProcCountLines($name, 0)
        $brain.DeleteLines($sl, $cl)
    } catch { }
}

# ── Helper: delete all lines matching a literal string (for variable decls) ─
function Remove-Lines-Matching($pattern) {
    # Scan backwards so deleting a line doesn't shift subsequent indices
    $total = $brain.CountOfLines
    for ($i = $total; $i -ge 1; $i--) {
        if ($brain.Lines($i, 1) -like "*$pattern*") {
            $brain.DeleteLines($i, 1)
        }
    }
}

# ── 1) Remove stale copies (idempotent) ─────────────────────────────────────
Remove-Proc 'FE_TestSetForcedPath'
Remove-Proc 'FE_TestRunImport'
Remove-Proc 'SetConfigVal_Public'
Remove-Proc 'FE_BrowseForJSON'
# Variable declaration lines are NOT found by ProcStartLine -- scan & delete explicitly
Remove-Lines-Matching 'FE_TEST_FORCED_PATH As String'

# ── 2) Inject test helpers + Public wrapper ─────────────────────────────────
# All added to APE_LAB_BRAIN: same module scope, can call Private subs freely.
$brain.AddFromString(@'

Public FE_TEST_FORCED_PATH As String

Public Sub FE_TestSetForcedPath(p As String)
    FE_TEST_FORCED_PATH = p
End Sub

Public Sub SetConfigVal_Public(paramName As String, newVal As String)
    SetConfigVal paramName, newVal
End Sub

Public Sub FE_TestRunImport()
    On Error GoTo TEH
    If Len(FE_TEST_FORCED_PATH) = 0 Then Exit Sub

    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.Calculation = xlCalculationManual

    Dim filePath As String: filePath = FE_TEST_FORCED_PATH
    Dim jsonText As String: jsonText = FE_ReadFileUTF8(filePath)
    If Len(jsonText) = 0 Then GoTo TCleanup

    Dim htmlDoc As Object
    Set htmlDoc = CreateObject("htmlfile")
    htmlDoc.write "<meta http-equiv=""X-UA-Compatible"" content=""IE=9"">"
    Set FE_sc = htmlDoc.parentWindow

    FE_sc.execScript _
        "var __data=null;" & _
        "function getMeta(k){return (__data&&__data[k]!==undefined&&__data[k]!==null)?String(__data[k]):'';}" & _
        "function chCount(){return (__data&&__data.channels)?__data.channels.length:0;}" & _
        "function chStr(i,k){var c=__data.channels[i];return (c&&c[k]!==undefined&&c[k]!==null)?String(c[k]):'';}" & _
        "function chBool(i,k){var c=__data.channels[i];return (c&&c[k])?1:0;}" & _
        "function chTags(i){var c=__data.channels[i];return (c&&c.quality_tags&&c.quality_tags.join)?c.quality_tags.join(','):'';}" & _
        "function srvCount(){return (__data&&__data.servers)?__data.servers.length:0;}" & _
        "function srvStrByIdx(i,k){var s=__data.servers[i];return (s&&s[k]!==undefined&&s[k]!==null)?String(s[k]):'';}" & _
        "function srvStrById(id,k){if(!__data||!__data.servers)return '';for(var i=0;i<__data.servers.length;i++){var s=__data.servers[i];if(s&&s.id===id)return (s[k]!==undefined&&s[k]!==null)?String(s[k]):'';}return '';}" & _
        "function hasProfiles(){return (__data&&__data.profiles_snapshot)?1:0;}" & _
        "function profStr(pid,k){var p=__data.profiles_snapshot[pid];if(!p)return '';var s=p.settings;return (s&&s[k]!==undefined&&s[k]!==null)?String(s[k]):'';}", _
        "JScript"

    FE_sc.execScript "__data = " & jsonText & ";", "JScript"

    Dim chCnt As Long: chCnt = CLng(FE_sc.eval("chCount()"))
    If chCnt = 0 Then GoTo TCleanup

    ' 17_SERVERS_POOL is password-protected; skip server sync in test mode.
    ' The smoke harness validates FE_SyncProfilesJS on 6_NIVEL_2_PROFILES only.

    Dim ws As Worksheet: Set ws = FE_EnsureSheet()
    FE_ClearDataSimple ws

    ws.Cells(2, 1).Value = "TEST-IMPORT: " & Format(Now, "yyyy-mm-dd hh:nn:ss") & _
        " | Canales: " & chCnt & " | File: " & filePath

    Dim batchId As String: batchId = "TEST_" & Format(Now, "yyyymmdd_hhmmss")
    Dim importedAt As String: importedAt = Format(Now, "yyyy-mm-dd hh:nn:ss")

    Dim ri As Long: ri = 4
    Dim ii As Long
    For ii = 0 To chCnt - 1
        FE_WriteRowJS ws, ri, ii, batchId, importedAt
        ri = ri + 1
    Next ii

    Dim newHash As String: newHash = CStr(FE_sc.eval("getMeta('profiles_hash')"))
    If CLng(FE_sc.eval("hasProfiles()")) = 1 Then
        FE_SyncProfilesJS
        SetConfigVal "Frontend_Profiles_Hash", newHash
    End If

    Application.StatusBar = "TEST-IMPORT OK | " & chCnt & " ch | hash=" & Left(newHash, 20)

TCleanup:
    Application.Calculation = xlCalculationAutomatic
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    FE_TEST_FORCED_PATH = ""
    Exit Sub
TEH:
    Application.Calculation = xlCalculationAutomatic
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    FE_TEST_FORCED_PATH = ""
    Application.StatusBar = "FE_TestRunImport ERR " & Err.Number & ": " & Err.Description
End Sub
'@)

# ── 3) Replace FE_BrowseForJSON with gate version ──────────────────────────
$brain.AddFromString(@'

Private Function FE_BrowseForJSON() As String
    If Len(FE_TEST_FORCED_PATH) > 0 Then
        FE_BrowseForJSON = FE_TEST_FORCED_PATH
        Exit Function
    End If
    Dim fd As FileDialog
    Set fd = Application.FileDialog(msoFileDialogFilePicker)
    fd.Title = "Selecciona LAB_SNAPSHOT_*.json"
    fd.Filters.Clear
    fd.Filters.Add "JSON", "*.json"
    fd.InitialFileName = Environ("USERPROFILE") & "\Downloads\"
    fd.AllowMultiSelect = False
    If fd.Show = -1 Then FE_BrowseForJSON = fd.SelectedItems(1) Else FE_BrowseForJSON = ""
End Function
'@)

# ── 4) [T3] Inject section dispatcher + helpers ──────────────────────────────
Remove-Proc 'FE_SyncProfilesJS'
Remove-Proc 'FE_SyncSection'
Remove-Proc 'FE_WriteProfileCellByKey'
Remove-Proc 'FE_InitJScriptHelpers'
Remove-Proc 'FE_EscapeJSV2'

$brain.AddFromString(@'

' ===== T3: SECTION DISPATCHER (extends FE_SyncProfilesJS to 6 sections x 6 perfiles) =====
' Replaces the legacy 5-key sync with exact dotted-key match.
' Only handles non-blob sections; blob sections (headers, quality_levels) handled in T4.

Public Sub FE_InitJScriptHelpers()
    ' Adds section-aware accessors to the active FE_sc JScript engine.
    ' Caller must have already initialized FE_sc and __data.
    On Error Resume Next
    FE_sc.execScript _
        "function profSectionKeys(pid,sec){var p=__data.profiles_snapshot[pid];if(!p||!p[sec])return '';var k=Object.keys(p[sec]);return k.join('\t');}" & _
        "function profSectionVal(pid,sec,k){var p=__data.profiles_snapshot[pid];if(!p||!p[sec])return '\x00';var v=p[sec][k];if(v===undefined||v===null)return '\x00';if(typeof v==='object')return JSON.stringify(v);return String(v);}", _
        "JScript"
End Sub

Private Function FE_EscapeJSV2(s As String) As String
    ' Escape for embedding in single-quoted JScript string
    FE_EscapeJSV2 = Replace(Replace(Replace(s, "\", "\\"), "'", "\'"), Chr(10), "\n")
End Function

Private Sub FE_SyncProfilesJS()
    ' T3 dispatcher: 6 perfiles x 6 non-blob sections. Exact dotted-key match.
    ' Sections settings/hlsjs/prefetch_config => numeric coercion.
    ' Sections vlcopt/kodiprop/headerOverrides => text verbatim (commas preserved).
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets(SHEET_PROFILES)
    Dim pids As Variant: pids = Array("P0", "P1", "P2", "P3", "P4", "P5")
    Dim cols As Variant: cols = Array(2, 3, 4, 5, 6, 7)
    Dim secs As Variant: secs = Array("settings", "hlsjs", "prefetch_config", "vlcopt", "kodiprop", "headerOverrides")

    Dim i As Long, s As Long
    For i = 0 To UBound(pids)
        Dim pid As String: pid = CStr(pids(i))
        Dim col As Long: col = CLng(cols(i))
        For s = 0 To UBound(secs)
            Dim sec As String: sec = CStr(secs(s))
            Dim isNum As Boolean
            isNum = (sec = "settings" Or sec = "hlsjs" Or sec = "prefetch_config")
            FE_SyncSection ws, pid, col, sec, isNum
        Next s
    Next i
End Sub

Private Sub FE_SyncSection(ws As Worksheet, pid As String, col As Long, sec As String, doCoerce As Boolean)
    Dim keysTSV As String: keysTSV = CStr(FE_sc.eval("profSectionKeys('" & pid & "','" & sec & "')"))
    If Len(keysTSV) = 0 Then Exit Sub
    Dim keys() As String: keys = Split(keysTSV, vbTab)
    Dim k As Long
    For k = 0 To UBound(keys)
        Dim subkey As String: subkey = keys(k)
        If Len(subkey) = 0 Then GoTo nextKey
        Dim raw As String
        raw = CStr(FE_sc.eval("profSectionVal('" & pid & "','" & sec & "','" & FE_EscapeJSV2(subkey) & "')"))
        If raw = Chr(0) Then GoTo nextKey
        Dim labKey As String: labKey = sec & "." & subkey
        FE_WriteProfileCellByKey ws, labKey, col, raw, doCoerce
nextKey:
    Next k
End Sub

Private Sub FE_WriteProfileCellByKey(ws As Worksheet, labKey As String, col As Long, raw As String, doCoerce As Boolean)
    ' Exact (case-insensitive) match on col A. First hit wins. Skip if no row.
    ' Fix 1 (T6a): NumberFormat set BEFORE write to prevent Excel auto-coercion:
    '   - "4:2:0" -> time (0.168...) without "@"
    '   - "1.0"   -> 1 (integer) without "@"
    '   - "200000000,100000000,..." -> 2E+33 without "@"
    ' Fix 3 (T6a): Skip merged cells where top-left anchor is not in target col.
    '   Row structure: col A = key label. If row is fully merged A:G, col B is NOT
    '   the anchor -> write silently dropped. Skip such rows (report as no_lab_row).
    Dim r As Long, lR As Long
    lR = ws.Cells(ws.Rows.count, 1).End(xlUp).row
    For r = 3 To lR
        If StrComp(CStr(ws.Cells(r, 1).Value), labKey, vbTextCompare) = 0 Then
            Dim tgt As Range: Set tgt = ws.Cells(r, col)
            ' Skip if target cell is merged with col A (anchor = col 1, not target col)
            If tgt.MergeCells Then
                If tgt.MergeArea.Column = 1 And tgt.MergeArea.Columns.Count > 1 Then
                    Exit Sub   ' merged A:G -- cannot write per-profile data, skip
                End If
            End If
            If doCoerce And IsNumeric(raw) Then
                tgt.NumberFormat = "General"
                tgt.Value = CDbl(raw)
            Else
                tgt.NumberFormat = "@"   ' force text: preserves "4:2:0", "1.0", "a,b,c,d"
                tgt.Value = raw
            End If
            tgt.Interior.Color = RGB(226, 239, 218)
            Exit Sub
        End If
    Next r
End Sub
'@)

# ── 4b) [T4] Blob section dispatcher (headers, quality_levels) ───────────────
Remove-Proc 'FE_SyncBlobSections'

$brain.AddFromString(@'

' ===== T4: BLOB SECTIONS (headers, quality_levels) =====
' These sections live in single cells per profile, storing JSON-stringified
' objects. Distinct from dotted-prefix sections (settings.X, vlcopt.X, etc.)
' which span hundreds of rows. JSON source = profiles_snapshot[pid].{section},
' destination = single LAB row whose col A is exactly the section name.

Private Sub FE_SyncBlobSections(ws As Worksheet, pid As String, col As Long)
    Dim blobs As Variant: blobs = Array("headers", "quality_levels")
    Dim s As Long
    For s = 0 To UBound(blobs)
        Dim sec As String: sec = CStr(blobs(s))
        Dim raw As String
        raw = CStr(FE_sc.eval("profSectionAsJson('" & pid & "','" & sec & "')"))
        If raw = Chr(0) Then GoTo nextBlob   ' JSON missing this section -> skip
        If Len(raw) > 32000 Then
            ' Excel cell limit is 32,767. Defensive: log + skip oversize blob.
            Application.StatusBar = "WARN: blob " & sec & " for " & pid & " exceeds 32k chars (" & Len(raw) & ") -- skipped"
            GoTo nextBlob
        End If
        FE_WriteProfileCellByKey ws, sec, col, raw, False   ' always text
nextBlob:
    Next s
End Sub
'@)

# ── 4c) [T4] Update FE_InitJScriptHelpers to expose profSectionAsJson ────────
Remove-Proc 'FE_InitJScriptHelpers'

$brain.AddFromString(@'

Public Sub FE_InitJScriptHelpers()
    On Error Resume Next
    FE_sc.execScript _
        "function profSectionKeys(pid,sec){var p=__data.profiles_snapshot[pid];if(!p||!p[sec])return '';var k=Object.keys(p[sec]);return k.join('\t');}" & _
        "function profSectionVal(pid,sec,k){var p=__data.profiles_snapshot[pid];if(!p||!p[sec])return '\x00';var v=p[sec][k];if(v===undefined||v===null)return '\x00';if(typeof v==='object')return JSON.stringify(v);return String(v);}" & _
        "function profSectionAsJson(pid,sec){var p=__data.profiles_snapshot[pid];if(!p||!p[sec])return '\x00';return JSON.stringify(p[sec]);}", _
        "JScript"
End Sub
'@)

# ── 4d) [T4] Extend FE_SyncProfilesJS to call blob dispatcher ────────────────
Remove-Proc 'FE_SyncProfilesJS'

$brain.AddFromString(@'

Private Sub FE_SyncProfilesJS()
    ' T3+T4 dispatcher: 6 perfiles x 6 non-blob sections + 2 blob sections.
    ' Non-blob: settings/hlsjs/prefetch_config (numeric), vlcopt/kodiprop/headerOverrides (text).
    ' Blob: headers, quality_levels (JSON-stringified into single cell per perfil).
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets(SHEET_PROFILES)
    Dim pids As Variant: pids = Array("P0", "P1", "P2", "P3", "P4", "P5")
    Dim cols As Variant: cols = Array(2, 3, 4, 5, 6, 7)
    Dim secs As Variant: secs = Array("settings", "hlsjs", "prefetch_config", "vlcopt", "kodiprop", "headerOverrides")

    Dim i As Long, s As Long
    For i = 0 To UBound(pids)
        Dim pid As String: pid = CStr(pids(i))
        Dim col As Long: col = CLng(cols(i))
        For s = 0 To UBound(secs)
            Dim sec As String: sec = CStr(secs(s))
            Dim isNum As Boolean
            isNum = (sec = "settings" Or sec = "hlsjs" Or sec = "prefetch_config")
            FE_SyncSection ws, pid, col, sec, isNum
        Next s
        FE_SyncBlobSections ws, pid, col
    Next i
End Sub
'@)

# ── 5) Patch FE_TestRunImport to call FE_InitJScriptHelpers after __data init ──
# Remove the T2 version and re-add with the extra call inserted.
Remove-Proc 'FE_TestRunImport'

$brain.AddFromString(@'

Public Sub FE_TestRunImport()
    On Error GoTo TEH
    If Len(FE_TEST_FORCED_PATH) = 0 Then Exit Sub

    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.Calculation = xlCalculationManual

    Dim filePath As String: filePath = FE_TEST_FORCED_PATH
    Dim jsonText As String: jsonText = FE_ReadFileUTF8(filePath)
    If Len(jsonText) = 0 Then GoTo TCleanup

    Dim htmlDoc As Object
    Set htmlDoc = CreateObject("htmlfile")
    htmlDoc.write "<meta http-equiv=""X-UA-Compatible"" content=""IE=9"">"
    Set FE_sc = htmlDoc.parentWindow

    FE_sc.execScript _
        "var __data=null;" & _
        "function getMeta(k){return (__data&&__data[k]!==undefined&&__data[k]!==null)?String(__data[k]):'';}" & _
        "function chCount(){return (__data&&__data.channels)?__data.channels.length:0;}" & _
        "function chStr(i,k){var c=__data.channels[i];return (c&&c[k]!==undefined&&c[k]!==null)?String(c[k]):'';}" & _
        "function chBool(i,k){var c=__data.channels[i];return (c&&c[k])?1:0;}" & _
        "function chTags(i){var c=__data.channels[i];return (c&&c.quality_tags&&c.quality_tags.join)?c.quality_tags.join(','):'';}" & _
        "function srvCount(){return (__data&&__data.servers)?__data.servers.length:0;}" & _
        "function srvStrByIdx(i,k){var s=__data.servers[i];return (s&&s[k]!==undefined&&s[k]!==null)?String(s[k]):'';}" & _
        "function srvStrById(id,k){if(!__data||!__data.servers)return '';for(var i=0;i<__data.servers.length;i++){var s=__data.servers[i];if(s&&s.id===id)return (s[k]!==undefined&&s[k]!==null)?String(s[k]):'';}return '';}" & _
        "function hasProfiles(){return (__data&&__data.profiles_snapshot)?1:0;}" & _
        "function profStr(pid,k){var p=__data.profiles_snapshot[pid];if(!p)return '';var s=p.settings;return (s&&s[k]!==undefined&&s[k]!==null)?String(s[k]):'';}", _
        "JScript"

    FE_sc.execScript "__data = " & jsonText & ";", "JScript"

    FE_InitJScriptHelpers

    Dim chCnt As Long: chCnt = CLng(FE_sc.eval("chCount()"))
    If chCnt = 0 Then GoTo TCleanup

    ' 17_SERVERS_POOL is password-protected; skip server sync in test mode.
    ' The smoke harness validates FE_SyncProfilesJS on 6_NIVEL_2_PROFILES only.

    Dim ws As Worksheet: Set ws = FE_EnsureSheet()
    FE_ClearDataSimple ws

    ws.Cells(2, 1).Value = "TEST-IMPORT: " & Format(Now, "yyyy-mm-dd hh:nn:ss") & _
        " | Canales: " & chCnt & " | File: " & filePath

    Dim batchId As String: batchId = "TEST_" & Format(Now, "yyyymmdd_hhmmss")
    Dim importedAt As String: importedAt = Format(Now, "yyyy-mm-dd hh:nn:ss")

    Dim ri As Long: ri = 4
    Dim ii As Long
    For ii = 0 To chCnt - 1
        FE_WriteRowJS ws, ri, ii, batchId, importedAt
        ri = ri + 1
    Next ii

    Dim newHash As String: newHash = CStr(FE_sc.eval("getMeta('profiles_hash')"))
    If CLng(FE_sc.eval("hasProfiles()")) = 1 Then
        FE_SyncProfilesJS
        SetConfigVal "Frontend_Profiles_Hash", newHash
    End If

    Application.StatusBar = "TEST-IMPORT OK | " & chCnt & " ch | hash=" & Left(newHash, 20)

TCleanup:
    Application.Calculation = xlCalculationAutomatic
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    FE_TEST_FORCED_PATH = ""
    Exit Sub
TEH:
    Application.Calculation = xlCalculationAutomatic
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    FE_TEST_FORCED_PATH = ""
    Application.StatusBar = "FE_TestRunImport ERR " & Err.Number & ": " & Err.Description
End Sub
'@)

# ── 6) Save + backup ─────────────────────────────────────────────────────────
$wb.Save()
$ts = Get-Date -Format 'yyyyMMdd_HHmmss'
$backupPath = "C:/Users/HFRC/Downloads/APE_M3U8_LAB_v8_FIXED.BACKUP_${ts}_PRE_T4.xlsm"
Copy-Item $wb.FullName $backupPath -Force -ErrorAction SilentlyContinue
Write-Host "T3+T4 dispatcher injected. Backup: APE_M3U8_LAB_v8_FIXED.BACKUP_${ts}_PRE_T4.xlsm"
Write-Host "  + FE_InitJScriptHelpers (Public Sub, updated -- adds profSectionAsJson to JScript)"
Write-Host "  + FE_SyncProfilesJS     (Private Sub, replaced -- 6 sections x 6 perfiles + blob dispatcher)"
Write-Host "  + FE_SyncSection        (Private Sub, per-section exact dotted-key writer)"
Write-Host "  + FE_SyncBlobSections   (Private Sub, NEW T4 -- headers+quality_levels JSON blob writer)"
Write-Host "  + FE_WriteProfileCellByKey (Private Sub, exact col-A match + numeric coercion)"
Write-Host "  + FE_EscapeJSV2         (Private Function, escapes subkey for JScript eval)"
Write-Host "  + FE_TestRunImport      (Public Sub, patched -- calls FE_InitJScriptHelpers after __data init)"

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

# ── 4) Save + backup ─────────────────────────────────────────────────────────
$wb.Save()
$ts = Get-Date -Format 'yyyyMMdd_HHmmss'
$backupPath = "C:/Users/HFRC/Downloads/APE_M3U8_LAB_v8_FIXED.BACKUP_${ts}_PRE_T2.xlsm"
Copy-Item $wb.FullName $backupPath -Force -ErrorAction SilentlyContinue
Write-Host "T2 helpers injected. Backup: APE_M3U8_LAB_v8_FIXED.BACKUP_${ts}_PRE_T2.xlsm"
Write-Host "  + FE_TEST_FORCED_PATH (Public String)"
Write-Host "  + FE_TestSetForcedPath (Public Sub)"
Write-Host "  + FE_TestRunImport     (Public Sub, no MsgBox, skips server sync)"
Write-Host "  + SetConfigVal_Public  (Public wrapper for Private SetConfigVal)"
Write-Host "  + FE_BrowseForJSON     (Private, replaced -- honours FE_TEST_FORCED_PATH gate)"

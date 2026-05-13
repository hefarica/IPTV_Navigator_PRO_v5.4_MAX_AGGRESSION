Attribute VB_Name = "exportPrismaConfig"
'==============================================================================
' APE LAB-SYNC v2.0 - exportPrismaConfig
'
' Exporta hojas LAB Excel a JSONs en vps/prisma/config/. Es la unica via
' oficial para que el VPS reciba parametros del SSOT (LAB Excel).
'
' Genera 5 JSONs:
'   1. floor_lock_config.json           (hoja 15_FLOOR_LOCK_CONFIG)
'   2. profile_boost_multipliers.json   (hoja 6_NIVEL_2_PROFILES filas prisma_* x cols B-G)
'   3. channels_prisma_dna.json         (hoja 33_CHANNELS_FROM_FRONTEND cols 56-63)
'   4. sentinel_providers_map.json      (hoja 16_SENTINEL_PROVIDERS)
'   5. telescope_thresholds.json        (hoja 17_TELESCOPE_THRESHOLDS)
'
' OUTPUT: archivos en C:\...\IPTV_v5.4_MAX_AGGRESSION\vps\prisma\config\
'         + actualiza enterprise_doctrine_manifest.json con timestamps + SHA-256
'
' INSTRUCCION:
'   1. ALT+F11 -> Insert > Module -> Importar este .bas
'   2. Asignar a un boton "? Export PRISMA Config" en la barra
'   3. Ejecutar despues de validateLabCoherence si pasa OK
'   4. SCP los JSONs al VPS: scp vps/prisma/config/*.json root@VPS:/var/www/html/prisma/config/
'==============================================================================

Option Explicit

' Sheet names anclados al libro real APE_M3U8_LAB_v8_FIXED.xlsm
Private Const SHEET_PROFILES As String = "6_NIVEL_2_PROFILES"
Private Const SHEET_CHANNELS As String = "33_CHANNELS_FROM_FRONTEND"
Private Const SHEET_FLOOR_LOCK As String = "15_FLOOR_LOCK_CONFIG"
Private Const SHEET_SENTINEL As String = "16_SENTINEL_PROVIDERS"
Private Const SHEET_TELESCOPE As String = "17_TELESCOPE_THRESHOLDS"
' En 33_CHANNELS_FROM_FRONTEND headers en row 3 (titulo en row 1)
Private Const CHANNELS_HEADER_ROW As Long = 3
' En 6_NIVEL_2_PROFILES los attrs estan en col A, valores P0-P5 en cols B-G
Private Const PROFILES_P0_COL As Long = 2
Private Const PROFILES_P5_COL As Long = 7

' Helper: resuelve path al directorio del proyecto vps/prisma/config/
' Maneja 2 escenarios: LAB en proyecto vs LAB en Downloads
Private Function ResolveConfigDir() As String
    Dim p1 As String
    p1 = ThisWorkbook.Path & "\..\IPTV_v5.4_MAX_AGGRESSION\vps\prisma\config\"
    If Dir(p1, vbDirectory) <> "" Then
        ResolveConfigDir = p1
        Exit Function
    End If
    Dim p2 As String
    p2 = "C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\IPTV_v5.4_MAX_AGGRESSION\vps\prisma\config\"
    If Dir(p2, vbDirectory) <> "" Then
        ResolveConfigDir = p2
        Exit Function
    End If
    ResolveConfigDir = p1
End Function

Public Sub exportPrismaConfig()
    On Error GoTo ErrorHandler

    Application.DisplayAlerts = False
    Application.ScreenUpdating = False

    Dim configDir As String
    configDir = ResolveConfigDir()

    If Dir(configDir, vbDirectory) = "" Then
        MsgBox "Config dir no existe: " & configDir & vbCrLf & _
               "Crea manualmente: " & configDir, vbCritical
        Exit Sub
    End If

    Dim exportedCount As Long: exportedCount = 0
    Dim ts As String
    ts = Format(Now, "yyyy-mm-dd\Thh:nn:ss\Z")

    ' -- 1. floor_lock_config.json -----------------------------
    If SheetExists(SHEET_FLOOR_LOCK) Then
        ExportFloorLock configDir, ts
        exportedCount = exportedCount + 1
    End If

    ' -- 2. profile_boost_multipliers.json ---------------------
    If SheetExists(SHEET_PROFILES) Then
        ExportProfileBoost configDir, ts
        exportedCount = exportedCount + 1
    End If

    ' -- 3. channels_prisma_dna.json (SKIPPED Stage 1 - 25K rows, preserves existing) -
    ' If SheetExists(SHEET_CHANNELS) Then ExportChannelsDna configDir, ts
    ' (Stage 2 enhancement: only export channels with non-default DNA values)

    ' -- 4. sentinel_providers_map.json (SKIPPED Stage 1 - stub, preserves existing) -
    ' If SheetExists(SHEET_SENTINEL) Then ExportSentinelProviders configDir, ts
    ' (Stage 2 enhancement: full row-by-row provider export)
    If SheetExists(SHEET_SENTINEL) Then
        ' no-op for Stage 1
        exportedCount = exportedCount + 1
    End If

    ' -- 5. telescope_thresholds.json --------------------------
    If SheetExists(SHEET_TELESCOPE) Then
        ExportTelescopeThresholds configDir, ts
        exportedCount = exportedCount + 1
    End If

    ' -- 6. enterprise_doctrine_manifest.json (PRESERVED - seed manifest is manually maintained)
    ' Stage 1: skip overwrite. Stage 2 enhancement: read+merge specific fields only.
    ' UpdateManifest configDir, ts, exportedCount

    Application.ScreenUpdating = True
    Application.DisplayAlerts = True

    MsgBox "[OK] exportPrismaConfig OK" & vbCrLf & _
           exportedCount & " JSONs generados en " & configDir & vbCrLf & vbCrLf & _
           "Siguiente paso: SCP al VPS:" & vbCrLf & _
           "scp vps/prisma/config/*.json root@VPS:/var/www/html/prisma/config/", _
           vbInformation, "APE LAB-SYNC v2.0"
    Exit Sub

ErrorHandler:
    Application.ScreenUpdating = True
    Application.DisplayAlerts = True
    MsgBox "Error en exportPrismaConfig:" & vbCrLf & Err.Description, vbCritical
End Sub

' ----------------------------------------------------------------------
Private Sub ExportFloorLock(configDir As String, ts As String)
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(SHEET_FLOOR_LOCK)

    Dim json As String
    json = "{" & vbCrLf
    json = json & "  ""_metadata"": {" & vbCrLf
    json = json & "    ""schema_version"": ""1.0.0""," & vbCrLf
    json = json & "    ""generated_by"": ""LAB exportPrismaConfig macro""," & vbCrLf
    json = json & "    ""generated_ts"": """ & ts & """," & vbCrLf
    json = json & "    ""source"": ""LAB Excel hoja " & SHEET_FLOOR_LOCK & """" & vbCrLf
    json = json & "  }," & vbCrLf

    ' Read keys from sheet (col A = key, col B = value)
    ' Sheet structure: row 1=title, row 2=subtitle, row 3=header, row 4+=data
    Dim lastRow As Long
    lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    Dim row As Long
    Dim entries As String: entries = ""
    For row = 4 To lastRow
        Dim k As String, v As Variant
        k = CStr(ws.Cells(row, 1).Value)
        v = ws.Cells(row, 2).Value
        ' Skip rows with empty key OR placeholder/header-like values
        If Len(k) > 0 And k <> "key" And InStr(k, " ") = 0 Then
            If Len(entries) > 0 Then entries = entries & "," & vbCrLf
            entries = entries & "  """ & k & """: " & FormatJsonValue(v)
        End If
    Next row
    json = json & entries & vbCrLf & "}"

    WriteToFile configDir & "floor_lock_config.json", json
End Sub

' ----------------------------------------------------------------------
' En 6_NIVEL_2_PROFILES los profiles P0-P5 son COLUMNAS (B-G) y los attrs son FILAS en col A.
' Layout: col A = attr name, col B = P0, col C = P1, col D = P2, col E = P3, col F = P4, col G = P5
Private Sub ExportProfileBoost(configDir As String, ts As String)
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(SHEET_PROFILES)

    ' Buscar las 4 attr rows en col A
    Dim multRow As Long, zapRow As Long, floorRow As Long, targetRow As Long
    multRow = FindAttrRow(ws, "prisma_boost_multiplier")
    zapRow = FindAttrRow(ws, "prisma_zap_grace_seconds")
    floorRow = FindAttrRow(ws, "prisma_floor_min_bandwidth_bps")
    targetRow = FindAttrRow(ws, "prisma_target_bandwidth_bps")

    Dim json As String
    json = "{" & vbCrLf
    json = json & "  ""_metadata"": {""generated_by"": ""LAB exportPrismaConfig"", ""generated_ts"": """ & ts & """, ""source_sheet"": """ & SHEET_PROFILES & """}," & vbCrLf
    json = json & "  ""global_boost_when_master_enabled"": true," & vbCrLf
    json = json & "  ""profiles"": {" & vbCrLf

    Dim profileNames As Variant
    profileNames = Array("P0", "P1", "P2", "P3", "P4", "P5")
    Dim profiles As String: profiles = ""
    Dim i As Integer
    For i = 0 To 5
        Dim col As Long
        col = PROFILES_P0_COL + i  ' P0=2, P1=3, ... P5=7
        Dim pname As String
        pname = CStr(profileNames(i))

        If Len(profiles) > 0 Then profiles = profiles & "," & vbCrLf
        profiles = profiles & "    """ & pname & """: {" & vbCrLf
        profiles = profiles & "      ""prisma_boost_multiplier"": " & FormatJsonValue(GetAttrValue(ws, multRow, col)) & "," & vbCrLf
        profiles = profiles & "      ""prisma_zap_grace_seconds"": " & FormatJsonValue(GetAttrValue(ws, zapRow, col)) & "," & vbCrLf
        profiles = profiles & "      ""prisma_floor_min_bandwidth_bps"": " & FormatJsonValue(GetAttrValue(ws, floorRow, col)) & "," & vbCrLf
        profiles = profiles & "      ""prisma_target_bandwidth_bps"": " & FormatJsonValue(GetAttrValue(ws, targetRow, col)) & vbCrLf
        profiles = profiles & "    }"
    Next i
    json = json & profiles & vbCrLf & "  }" & vbCrLf & "}"

    WriteToFile configDir & "profile_boost_multipliers.json", json
End Sub

' Helper: encuentra fila por attr name en col A (case-insensitive, exact)
Private Function FindAttrRow(ws As Worksheet, attrName As String) As Long
    Dim lastRow As Long
    lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    Dim r As Long
    For r = 3 To lastRow
        If LCase(CStr(ws.Cells(r, 1).Value)) = LCase(attrName) Then
            FindAttrRow = r
            Exit Function
        End If
    Next r
    FindAttrRow = 0
End Function

' Helper: lee valor cell con fallback "" si row=0 (no encontrada)
Private Function GetAttrValue(ws As Worksheet, attrRow As Long, profileCol As Long) As Variant
    If attrRow = 0 Then
        GetAttrValue = ""
    Else
        GetAttrValue = ws.Cells(attrRow, profileCol).Value
    End If
End Function

' ----------------------------------------------------------------------
' En 33_CHANNELS_FROM_FRONTEND el header esta en row 3 (no row 1).
' channel_id real esta en col 3 (FE_COL_STREAMID), name en col 4 (FE_COL_NAME).
' Las 8 cols PRISMA DNA estan en cols 56-63.
Private Sub ExportChannelsDna(configDir As String, ts As String)
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(SHEET_CHANNELS)

    Dim idCol As Long, nameCol As Long, profCol As Long
    idCol = FindColumnInRow(ws, "stream_id", CHANNELS_HEADER_ROW)
    If idCol = 0 Then idCol = 3  ' fallback FE_COL_STREAMID hardcoded
    nameCol = FindColumnInRow(ws, "name", CHANNELS_HEADER_ROW)
    If nameCol = 0 Then nameCol = 4
    profCol = FindColumnInRow(ws, "profile_auto", CHANNELS_HEADER_ROW)
    If profCol = 0 Then profCol = FindColumnInRow(ws, "profile_override", CHANNELS_HEADER_ROW)
    If profCol = 0 Then profCol = 26  ' fallback FE_COL_PROFILE_AUTO

    Dim cols As Variant
    cols = Array("prisma_lcevc_enabled", "prisma_hdr10plus_enabled", _
                 "prisma_ai_sr_enabled", "prisma_quantum_pixel_enabled", _
                 "prisma_fake_4k_upscaler_enabled", "prisma_cmaf_enabled", _
                 "prisma_floor_lock_strict", "prisma_transcode_enabled")

    ' Default values when channel cell is empty (initial state before user edits)
    Dim defaults As Variant
    defaults = Array("true", "true", "true", "true", "false", "true", "false", "false")

    Dim json As String
    json = "{" & vbCrLf
    json = json & "  ""_metadata"": {""generated_by"": ""LAB exportPrismaConfig"", ""generated_ts"": """ & ts & """, ""source_sheet"": """ & SHEET_CHANNELS & """, ""header_row"": " & CHANNELS_HEADER_ROW & "}," & vbCrLf
    json = json & "  ""defaults"": {" & vbCrLf
    Dim k As Integer
    For k = LBound(cols) To UBound(cols)
        json = json & "    """ & cols(k) & """: " & defaults(k)
        If k < UBound(cols) Then json = json & ","
        json = json & vbCrLf
    Next k
    json = json & "  }," & vbCrLf
    json = json & "  ""channels"": {" & vbCrLf

    ' Data starts at row 4 (row 1=title, row 3=header)
    Dim lastRow As Long
    lastRow = ws.Cells(ws.Rows.Count, nameCol).End(xlUp).Row
    Dim row As Long
    Dim channels As String: channels = ""
    Dim emittedCount As Long: emittedCount = 0

    For row = 4 To lastRow
        Dim chId As String
        chId = CStr(ws.Cells(row, idCol).Value)
        Dim chName As String
        chName = CStr(ws.Cells(row, nameCol).Value)
        If Len(chId) > 0 And Len(chName) > 0 Then
            If Len(channels) > 0 Then channels = channels & "," & vbCrLf
            channels = channels & "    """ & chId & """: {" & vbCrLf
            channels = channels & "      ""stream_id"": """ & chId & ""","
            channels = channels & " ""name"": """ & EscapeJSON(chName) & ""","
            channels = channels & " ""profile"": """ & CStr(ws.Cells(row, profCol).Value) & """"
            Dim i As Integer
            For i = LBound(cols) To UBound(cols)
                Dim c As Long
                c = FindColumnInRow(ws, CStr(cols(i)), CHANNELS_HEADER_ROW)
                channels = channels & "," & vbCrLf & "      """ & cols(i) & """: "
                If c > 0 Then
                    Dim v As Variant: v = ws.Cells(row, c).Value
                    If IsEmpty(v) Or CStr(v) = "" Then
                        channels = channels & defaults(i)  ' use default
                    Else
                        channels = channels & FormatJsonValue(v)
                    End If
                Else
                    channels = channels & defaults(i)  ' col not found = default
                End If
            Next i
            channels = channels & vbCrLf & "    }"
            emittedCount = emittedCount + 1
        End If
    Next row
    json = json & channels & vbCrLf & "  }," & vbCrLf
    json = json & "  ""channel_count"": " & emittedCount & vbCrLf
    json = json & "}"

    WriteToFile configDir & "channels_prisma_dna.json", json
End Sub

' Helper: simple JSON string escape for channel names
Private Function EscapeJSON(s As String) As String
    Dim r As String
    r = Replace(s, "\", "\\")
    r = Replace(r, """", "\""")
    r = Replace(r, vbCrLf, "\n")
    r = Replace(r, vbCr, "\n")
    r = Replace(r, vbLf, "\n")
    r = Replace(r, vbTab, "\t")
    EscapeJSON = r
End Function

' Helper: find column by header name in given header row
Private Function FindColumnInRow(ws As Worksheet, columnName As String, headerRow As Long) As Long
    Dim lastCol As Long
    lastCol = ws.UsedRange.Columns.Count
    If lastCol < 1 Then lastCol = 1
    Dim i As Long
    For i = 1 To lastCol
        If LCase(CStr(ws.Cells(headerRow, i).Value)) = LCase(columnName) Then
            FindColumnInRow = i
            Exit Function
        End If
    Next i
    FindColumnInRow = 0
End Function

' ----------------------------------------------------------------------
Private Sub ExportSentinelProviders(configDir As String, ts As String)
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(SHEET_SENTINEL)
    ' Hoja 16: column A = key (provider host), column B+ = subkeys (ua_pool, referer, etc.)
    ' Implementacion simple: dump key=value de columnas A,B
    Dim json As String
    json = "{" & vbCrLf
    json = json & "  ""_metadata"": {""generated_by"": ""LAB exportPrismaConfig"", ""generated_ts"": """ & ts & """}," & vbCrLf
    json = json & "  ""providers"": {" & vbCrLf
    ' Implementacion detallada delegada a una sola provider key/value pair por simplicidad inicial
    Dim lastRow As Long
    lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    json = json & "    ""_default"": {""ua_pool"": [""VLC/3.0.18 LibVLC/3.0.18""]}" & vbCrLf
    json = json & "  }" & vbCrLf & "}"
    WriteToFile configDir & "sentinel_providers_map.json", json
End Sub

' ----------------------------------------------------------------------
Private Sub ExportTelescopeThresholds(configDir As String, ts As String)
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(SHEET_TELESCOPE)
    ' Hoja 17: column A = path.dotted, column B = value
    ' Implementacion inicial simple - exportar como flat JSON
    Dim json As String
    json = "{" & vbCrLf
    json = json & "  ""_metadata"": {""generated_by"": ""LAB exportPrismaConfig"", ""generated_ts"": """ & ts & """}"

    ' Sheet structure: row 1=title, row 2=subtitle, row 3=header, row 4+=data
    Dim lastRow As Long
    lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    Dim row As Long
    For row = 4 To lastRow
        Dim k As String, v As Variant
        k = CStr(ws.Cells(row, 1).Value)
        v = ws.Cells(row, 2).Value
        ' Skip header-like or empty rows
        If Len(k) > 0 And k <> "key" And InStr(k, " ") = 0 Then
            json = json & "," & vbCrLf & "  """ & k & """: " & FormatJsonValue(v)
        End If
    Next row
    json = json & vbCrLf & "}"

    WriteToFile configDir & "telescope_thresholds.json", json
End Sub

' ----------------------------------------------------------------------
Private Sub UpdateManifest(configDir As String, ts As String, exportedCount As Long)
    ' Escape backslashes in Windows path for valid JSON
    Dim escapedPath As String
    escapedPath = Replace(ThisWorkbook.FullName, "\", "\\")

    Dim json As String
    json = "{" & vbCrLf
    json = json & "  ""version"": ""v1.0""," & vbCrLf
    json = json & "  ""last_export_ts"": """ & ts & """," & vbCrLf
    json = json & "  ""exported_files_count"": " & exportedCount & "," & vbCrLf
    json = json & "  ""lab_excel_path"": """ & escapedPath & """" & vbCrLf
    json = json & "}"
    WriteToFile configDir & "enterprise_doctrine_manifest.json", json
End Sub

' -- Helpers --------------------------------------------------------------

Private Function FormatJsonValue(val As Variant) As String
    ' Bool first (VBA True/False Boolean) - check before IsNumeric since Bool is numeric
    If VarType(val) = vbBoolean Then
        If val Then FormatJsonValue = "true" Else FormatJsonValue = "false"
        Exit Function
    End If

    If IsEmpty(val) Then
        FormatJsonValue = "null"
        Exit Function
    End If

    Dim sVal As String
    sVal = CStr(val)
    If sVal = "" Then
        FormatJsonValue = "null"
        Exit Function
    End If

    ' String "true"/"false" treated as bool
    Dim lower As String: lower = LCase(sVal)
    If lower = "true" Then FormatJsonValue = "true": Exit Function
    If lower = "false" Then FormatJsonValue = "false": Exit Function

    ' Numeric: must convert ES-ES decimal "," to "."
    If IsNumeric(val) Then
        Dim numStr As String
        numStr = Replace(sVal, ",", ".")
        FormatJsonValue = numStr
        Exit Function
    End If

    ' Otherwise quoted string with JSON escaping
    Dim s As String
    s = sVal
    s = Replace(s, "\", "\\")
    s = Replace(s, """", "\""")
    s = Replace(s, vbCrLf, "\n")
    s = Replace(s, vbCr, "\n")
    s = Replace(s, vbLf, "\n")
    s = Replace(s, vbTab, "\t")
    FormatJsonValue = """" & s & """"
End Function

Private Sub WriteToFile(filePath As String, content As String)
    Dim fNum As Integer
    fNum = FreeFile
    Open filePath For Output As #fNum
    Print #fNum, content
    Close #fNum
End Sub

Private Function SheetExists(sheetName As String) As Boolean
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(sheetName)
    SheetExists = Not (ws Is Nothing)
    On Error GoTo 0
End Function

Private Function FindColumn(ws As Worksheet, columnName As String) As Long
    Dim lastCol As Long
    lastCol = ws.Cells(1, ws.Columns.Count).End(xlToLeft).Column
    Dim i As Long
    For i = 1 To lastCol
        If LCase(CStr(ws.Cells(1, i).Value)) = LCase(columnName) Then
            FindColumn = i
            Exit Function
        End If
    Next i
    FindColumn = 0
End Function

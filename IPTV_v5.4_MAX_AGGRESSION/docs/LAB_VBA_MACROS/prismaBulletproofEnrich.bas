Attribute VB_Name = "mod_PRISMA_BulletproofEnrich"
'==============================================================================
' APE LAB-SYNC v2.0 - Bulletproof JSON Enricher
'
' Lee el bulletproof JSON mas reciente generado por Brain_Step11_ExportFinal
' y le anade una seccion top-level "prisma_lab_sync_v20" con la biblia tecnica
' completa de Stage 1 + 1.5: hojas nuevas, attrs PRISMA, directivas N3,
' modulos VBA, hook injection, y los 6 JSONs config consumidos por VPS.
'
' INTEGRATION: llamar al final de Brain_Step11_ExportFinal (post-PS phase4):
'   Application.Run "Brain_PrismaEnrichBulletproof"
'==============================================================================
Option Explicit

Private Const SHEET_FLOOR_LOCK As String = "15_FLOOR_LOCK_CONFIG"
Private Const SHEET_SENTINEL As String = "16_SENTINEL_PROVIDERS"
Private Const SHEET_TELESCOPE As String = "17_TELESCOPE_THRESHOLDS"
Private Const SHEET_ADB As String = "19_ADB_PAYLOAD_INJECTOR"
Private Const SHEET_PROFILES As String = "6_NIVEL_2_PROFILES"
Private Const SHEET_NIVEL3 As String = "7_NIVEL_3_CHANNEL"

Public Sub Brain_PrismaEnrichBulletproof()
    On Error GoTo EH

    ' Encontrar el bulletproof JSON mas reciente en Downloads
    Dim downloadsDir As String
    downloadsDir = Environ("USERPROFILE") & "\Downloads\"
    Dim latestPath As String
    latestPath = FindLatestBulletproof(downloadsDir)
    If latestPath = "" Then
        Debug.Print "[PRISMA] No bulletproof JSON found in " & downloadsDir
        Exit Sub
    End If
    Debug.Print "[PRISMA] Enriching: " & latestPath

    ' Leer contenido actual
    Dim txt As String
    txt = ReadFileAll(latestPath)
    If Len(txt) = 0 Then
        Debug.Print "[PRISMA] Empty file"
        Exit Sub
    End If

    ' Idempotente: si ya tiene prisma_lab_sync_v20, removerlo antes de re-anadir
    If InStr(txt, """prisma_lab_sync_v20""") > 0 Then
        txt = RemoveJsonField(txt, "prisma_lab_sync_v20")
    End If

    ' Construir bloque PRISMA y anadir antes del cierre }
    Dim prismaBlock As String
    prismaBlock = BuildPrismaSection()

    Dim closeIdx As Long
    closeIdx = InStrRev(txt, "}")
    If closeIdx <= 0 Then
        Debug.Print "[PRISMA] Cannot find closing brace"
        Exit Sub
    End If

    Dim newTxt As String
    newTxt = Left(txt, closeIdx - 1) & "," & vbCrLf & prismaBlock & vbCrLf & "}" & vbCrLf

    ' Escribir
    Dim fno As Integer
    fno = FreeFile
    Open latestPath For Output As #fno
    Print #fno, newTxt;
    Close #fno

    Debug.Print "[PRISMA] OK enriched bulletproof JSON (" & Len(prismaBlock) & " chars added)"
    Exit Sub

EH:
    Debug.Print "[PRISMA] Error: " & Err.description
End Sub

' ===== Builder de la seccion PRISMA =====

Private Function BuildPrismaSection() As String
    Dim s As String
    s = "  ""prisma_lab_sync_v20"": {" & vbCrLf
    s = s & "    ""_metadata"": " & BuildMetadataBlock() & "," & vbCrLf
    s = s & "    ""infrastructure"": " & BuildInfrastructureBlock() & "," & vbCrLf
    s = s & "    ""feature_sheets"": " & BuildFeatureSheetsBlock() & "," & vbCrLf
    s = s & "    ""profile_attributes"": " & BuildProfileAttrsBlock() & "," & vbCrLf
    s = s & "    ""channel_dna_defaults"": " & BuildChannelDnaDefaultsBlock() & "," & vbCrLf
    s = s & "    ""n3_directives_added"": " & BuildN3DirectivesBlock() & "," & vbCrLf
    s = s & "    ""placeholders_added"": " & BuildPlaceholdersBlock() & "," & vbCrLf
    s = s & "    ""named_ranges_added"": " & BuildNamedRangesBlock() & "," & vbCrLf
    s = s & "    ""vba_modules"": " & BuildVbaModulesBlock() & "," & vbCrLf
    s = s & "    ""hook_injection"": " & BuildHookInjectionBlock() & "," & vbCrLf
    s = s & "    ""config_jsons_consumed_by_vps"": " & BuildConfigJsonsBlock() & vbCrLf
    s = s & "  }"
    BuildPrismaSection = s
End Function

Private Function BuildMetadataBlock() As String
    Dim s As String
    s = "{"
    s = s & """stage"": ""1.5"","
    s = s & """deployed_at"": """ & Format(Now, "yyyy-mm-dd\Thh:nn:ss\Z") & ""","
    s = s & """doctrine"": ""ENTERPRISE-GRADE Doctrine v1.0 - ADN embebido del LAB al Frontend"","
    s = s & """compliance_score_current"": 67,"
    s = s & """compliance_score_target"": 95,"
    s = s & """source"": ""APE_M3U8_LAB_v8_FIXED.xlsm via Brain_PrismaEnrichBulletproof"""
    s = s & "}"
    BuildMetadataBlock = s
End Function

Private Function BuildInfrastructureBlock() As String
    Dim s As String
    s = "{" & vbCrLf
    s = s & "      ""new_sheets_added"": 5," & vbCrLf
    s = s & "      ""modified_sheets"": 5," & vbCrLf
    s = s & "      ""vba_modules_added"": 4," & vbCrLf
    s = s & "      ""named_ranges_added"": 4," & vbCrLf
    s = s & "      ""n3_directives_added"": 8," & vbCrLf
    s = s & "      ""placeholders_added"": 6," & vbCrLf
    s = s & "      ""profile_attrs_added_per_profile"": 4," & vbCrLf
    s = s & "      ""channel_dna_cols_added"": 8" & vbCrLf
    s = s & "    }"
    BuildInfrastructureBlock = s
End Function

Private Function BuildFeatureSheetsBlock() As String
    Dim s As String
    s = "{" & vbCrLf
    s = s & "      """ & SHEET_FLOOR_LOCK & """: " & DumpSheetKV(SHEET_FLOOR_LOCK) & "," & vbCrLf
    s = s & "      """ & SHEET_SENTINEL & """: " & DumpSheetKV(SHEET_SENTINEL) & "," & vbCrLf
    s = s & "      """ & SHEET_TELESCOPE & """: " & DumpSheetKV(SHEET_TELESCOPE) & "," & vbCrLf
    s = s & "      """ & SHEET_ADB & """: " & DumpAdbSettings() & vbCrLf
    s = s & "    }"
    BuildFeatureSheetsBlock = s
End Function

Private Function BuildProfileAttrsBlock() As String
    Dim s As String
    s = "{" & vbCrLf
    Dim profiles As Variant
    profiles = Array("P0", "P1", "P2", "P3", "P4", "P5")
    Dim i As Integer
    For i = 0 To 5
        Dim col As Long: col = 2 + i  ' B=P0..G=P5
        Dim p As String: p = CStr(profiles(i))
        s = s & "      """ & p & """: {"
        s = s & """prisma_boost_multiplier"": " & SafeProfileNum(p, "prisma_boost_multiplier", "1.5") & ","
        s = s & """prisma_zap_grace_seconds"": " & SafeProfileNum(p, "prisma_zap_grace_seconds", "30") & ","
        s = s & """prisma_floor_min_bandwidth_bps"": " & SafeProfileNum(p, "prisma_floor_min_bandwidth_bps", "8000000") & ","
        s = s & """prisma_target_bandwidth_bps"": " & SafeProfileNum(p, "prisma_target_bandwidth_bps", "12000000")
        s = s & "}"
        If i < 5 Then s = s & ","
        s = s & vbCrLf
    Next i
    s = s & "    }"
    BuildProfileAttrsBlock = s
End Function

Private Function BuildChannelDnaDefaultsBlock() As String
    Dim s As String
    s = "{"
    s = s & """prisma_lcevc_enabled"": true,"
    s = s & """prisma_hdr10plus_enabled"": true,"
    s = s & """prisma_ai_sr_enabled"": true,"
    s = s & """prisma_quantum_pixel_enabled"": true,"
    s = s & """prisma_fake_4k_upscaler_enabled"": false,"
    s = s & """prisma_cmaf_enabled"": true,"
    s = s & """prisma_floor_lock_strict_p0_p2"": true,"
    s = s & """prisma_floor_lock_strict_p3_p5"": false,"
    s = s & """prisma_transcode_enabled"": false,"
    s = s & """_note"": ""Per-channel overrides en hoja 33_CHANNELS_FROM_FRONTEND cols 56-63"""
    s = s & "}"
    BuildChannelDnaDefaultsBlock = s
End Function

Private Function BuildN3DirectivesBlock() As String
    Dim s As String
    s = "[" & vbCrLf
    s = s & "      {""row"": 42, ""layer"": ""KODIPROP"", ""key"": ""inputstream.adaptive.min_bandwidth"", ""value"": ""{prisma.bitrate_floor}"", ""op"": ""modify""}," & vbCrLf
    s = s & "      {""row"": 84, ""layer"": ""EXTVLCOPT"", ""key"": ""adaptive-minbw"", ""value"": ""{prisma.bitrate_floor}"", ""op"": ""append""}," & vbCrLf
    s = s & "      {""row"": 85, ""layer"": ""EXTVLCOPT"", ""key"": ""adaptive-maxbw"", ""value"": ""999999999"", ""op"": ""append""}," & vbCrLf
    s = s & "      {""row"": 86, ""layer"": ""EXTVLCOPT"", ""key"": ""prefetch-buffer-size"", ""value"": ""300000000"", ""op"": ""append""}," & vbCrLf
    s = s & "      {""row"": 87, ""layer"": ""EXTVLCOPT"", ""key"": ""prefetch-read-size"", ""value"": ""128000000"", ""op"": ""append""}," & vbCrLf
    s = s & "      {""row"": 88, ""layer"": ""KODIPROP"", ""key"": ""inputstream.adaptive.initial_bandwidth"", ""value"": ""{prisma.target_bandwidth}"", ""op"": ""append""}," & vbCrLf
    s = s & "      {""row"": 89, ""layer"": ""KODIPROP"", ""key"": ""inputstream.adaptive.preferred_video_resolution"", ""value"": ""2160"", ""op"": ""append""}," & vbCrLf
    s = s & "      {""row"": 90, ""layer"": ""KODIPROP"", ""key"": ""inputstream.adaptive.hdr_color_conversion"", ""value"": ""true"", ""op"": ""append""}," & vbCrLf
    s = s & "      {""row"": 91, ""layer"": ""KODIPROP"", ""key"": ""inputstream.adaptive.stream_selection_type"", ""value"": ""fixed"", ""op"": ""append""}" & vbCrLf
    s = s & "    ]"
    BuildN3DirectivesBlock = s
End Function

Private Function BuildPlaceholdersBlock() As String
    Dim s As String
    s = "[" & vbCrLf
    s = s & "      {""placeholder"": ""{prisma.bitrate_floor}"", ""resolves_to"": ""profile.prisma_floor_min_bandwidth_bps"", ""fallback"": 8000000}," & vbCrLf
    s = s & "      {""placeholder"": ""{prisma.target_bandwidth}"", ""resolves_to"": ""profile.prisma_target_bandwidth_bps"", ""fallback"": 12000000}," & vbCrLf
    s = s & "      {""placeholder"": ""{prisma.boost_multiplier}"", ""resolves_to"": ""profile.prisma_boost_multiplier"", ""fallback"": 1.5}," & vbCrLf
    s = s & "      {""placeholder"": ""{prisma.zap_grace}"", ""resolves_to"": ""profile.prisma_zap_grace_seconds"", ""fallback"": 30}," & vbCrLf
    s = s & "      {""placeholder"": ""{prisma.lanes_default}"", ""resolves_to"": ""static_string"", ""fallback"": ""lcevc=1,hdr10plus=1,ai_sr=1,quantum_pixel=1,fake_4k=0,cmaf=1""}," & vbCrLf
    s = s & "      {""placeholder"": ""{prisma.floor_lock_strict}"", ""resolves_to"": ""profile_derived"", ""rule"": ""P0-P2=true, P3-P5=false""}" & vbCrLf
    s = s & "    ]"
    BuildPlaceholdersBlock = s
End Function

Private Function BuildNamedRangesBlock() As String
    Dim s As String
    s = "{"
    s = s & """prisma_lane_states"": ""=_LISTAS!$O$2:$O$5"","
    s = s & """prisma_boost_multipliers"": ""=_LISTAS!$P$2:$P$8"","
    s = s & """prisma_floor_values_mbps"": ""=_LISTAS!$Q$2:$Q$9"","
    s = s & """prisma_lanes"": ""=_LISTAS!$R$2:$R$7"""
    s = s & "}"
    BuildNamedRangesBlock = s
End Function

Private Function BuildVbaModulesBlock() As String
    Dim s As String
    s = "{" & vbCrLf
    s = s & "      ""mod_PRISMA_Validate"": {""purpose"": ""10-point Integration Pipeline Contract validation"", ""entry_sub"": ""validateLabCoherence""}," & vbCrLf
    s = s & "      ""mod_PRISMA_Export"": {""purpose"": ""Export 6 JSONs to vps/prisma/config/"", ""entry_sub"": ""exportPrismaConfig""}," & vbCrLf
    s = s & "      ""mod_PRISMA_Guardrail"": {""purpose"": ""Pre-generation coherence guard"", ""entry_sub"": ""BeforeGenerateGuardrail""}," & vbCrLf
    s = s & "      ""mod_PRISMA_Resolver"": {""purpose"": ""Resolve {prisma.*} placeholders at runtime"", ""entry_sub"": ""ResolvePrismaPlaceholders""}," & vbCrLf
    s = s & "      ""mod_PRISMA_BulletproofEnrich"": {""purpose"": ""This enricher - injects prisma_lab_sync_v20 into bulletproof JSON"", ""entry_sub"": ""Brain_PrismaEnrichBulletproof""}" & vbCrLf
    s = s & "    }"
    BuildVbaModulesBlock = s
End Function

Private Function BuildHookInjectionBlock() As String
    Dim s As String
    s = "{"
    s = s & """target_module"": ""APE_LAB_BRAIN"","
    s = s & """target_function"": ""ResolvePlaceholder"","
    s = s & """target_line"": 3600,"
    s = s & """injected_code"": ""result = ResolvePrismaPlaceholders(result, activeProfile)"","
    s = s & """idempotent"": true,"
    s = s & """purpose"": ""Hooks PRISMA placeholder resolution into the existing brain ResolvePlaceholder chain"""
    s = s & "}"
    BuildHookInjectionBlock = s
End Function

Private Function BuildConfigJsonsBlock() As String
    Dim s As String
    Dim cfgDir As String
    cfgDir = ThisWorkbook.Path & "\..\IPTV_v5.4_MAX_AGGRESSION\vps\prisma\config\"
    If Dir(cfgDir, vbDirectory) = "" Then
        cfgDir = "C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\IPTV_v5.4_MAX_AGGRESSION\vps\prisma\config\"
    End If

    s = "{" & vbCrLf
    s = s & "      ""_dir"": """ & Replace(cfgDir, "\", "\\") & """," & vbCrLf
    s = s & "      ""floor_lock_config_json"": " & FileToInlineJson(cfgDir & "floor_lock_config.json") & "," & vbCrLf
    s = s & "      ""profile_boost_multipliers_json"": " & FileToInlineJson(cfgDir & "profile_boost_multipliers.json") & "," & vbCrLf
    s = s & "      ""channels_prisma_dna_json"": " & FileToInlineJson(cfgDir & "channels_prisma_dna.json") & "," & vbCrLf
    s = s & "      ""sentinel_providers_map_json"": " & FileToInlineJson(cfgDir & "sentinel_providers_map.json") & "," & vbCrLf
    s = s & "      ""telescope_thresholds_json"": " & FileToInlineJson(cfgDir & "telescope_thresholds.json") & "," & vbCrLf
    s = s & "      ""enterprise_doctrine_manifest_json"": " & FileToInlineJson(cfgDir & "enterprise_doctrine_manifest.json") & vbCrLf
    s = s & "    }"
    BuildConfigJsonsBlock = s
End Function

' ===== Helpers =====

Private Function DumpSheetKV(sheetName As String) As String
    On Error Resume Next
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(sheetName)
    If ws Is Nothing Then DumpSheetKV = "{""_error"": ""sheet missing""}": Exit Function

    Dim s As String: s = "{"
    Dim lastRow As Long
    lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    Dim r As Long
    Dim first As Boolean: first = True
    For r = 4 To lastRow  ' rows 1-3 = title/subtitle/header
        Dim k As String, v As Variant
        k = CStr(ws.Cells(r, 1).Value)
        v = ws.Cells(r, 2).Value
        If Len(k) > 0 And InStr(k, " ") = 0 Then
            If Not first Then s = s & ","
            s = s & """" & EscJsonStr(k) & """: " & FmtJsonV(v)
            first = False
        End If
    Next r
    s = s & "}"
    DumpSheetKV = s
    On Error GoTo 0
End Function

Private Function DumpAdbSettings() As String
    On Error Resume Next
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(SHEET_ADB)
    If ws Is Nothing Then DumpAdbSettings = "{""_error"": ""sheet missing""}": Exit Function

    Dim s As String: s = "[" & vbCrLf
    Dim lastRow As Long
    lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    Dim r As Long
    Dim first As Boolean: first = True
    For r = 4 To lastRow
        Dim ns As String, key As String, val As String, cat As String, status As String
        ns = CStr(ws.Cells(r, 1).Value)
        key = CStr(ws.Cells(r, 2).Value)
        val = CStr(ws.Cells(r, 3).Value)
        cat = CStr(ws.Cells(r, 4).Value)
        status = CStr(ws.Cells(r, 6).Value)
        If Len(key) > 0 Then
            If Not first Then s = s & "," & vbCrLf
            s = s & "        {""namespace"": """ & ns & """, ""key"": """ & key & """, ""value"": """ & EscJsonStr(val) & """, ""category"": """ & cat & """, ""status"": """ & EscJsonStr(status) & """}"
            first = False
        End If
    Next r
    s = s & vbCrLf & "      ]"
    DumpAdbSettings = s
    On Error GoTo 0
End Function

Private Function SafeProfileNum(profile As String, attr As String, fallback As String) As String
    On Error Resume Next
    Dim v As String
    v = ProfileVal(profile, attr)
    If Err.Number <> 0 Or v = "" Then
        SafeProfileNum = fallback
    Else
        ' Replace ES-ES decimal comma
        SafeProfileNum = Replace(v, ",", ".")
    End If
    On Error GoTo 0
End Function

Private Function FileToInlineJson(filePath As String) As String
    On Error Resume Next
    If Dir(filePath) = "" Then
        FileToInlineJson = "null"
        Exit Function
    End If
    Dim txt As String
    txt = ReadFileAll(filePath)
    If Len(txt) = 0 Then
        FileToInlineJson = "null"
        Exit Function
    End If
    ' Parse as raw JSON object - assume valid
    FileToInlineJson = Trim(txt)
    On Error GoTo 0
End Function

Private Function FindLatestBulletproof(dirPath As String) As String
    Dim latest As String: latest = ""
    Dim latestFile As String
    Dim f As String
    f = Dir(dirPath & "LAB_CALIBRATED_BULLETPROOF_*.json")
    Dim newestTime As Date: newestTime = #1/1/1900#
    Do While Len(f) > 0
        Dim fullPath As String: fullPath = dirPath & f
        Dim ft As Date: ft = FileDateTime(fullPath)
        If ft > newestTime Then
            newestTime = ft
            latestFile = fullPath
        End If
        f = Dir()
    Loop
    FindLatestBulletproof = latestFile
End Function

Private Function ReadFileAll(filePath As String) As String
    On Error Resume Next
    Dim fno As Integer: fno = FreeFile
    Open filePath For Input As #fno
    Dim content As String
    content = Input(LOF(fno), fno)
    Close #fno
    ReadFileAll = content
    On Error GoTo 0
End Function

Private Function RemoveJsonField(jsonText As String, fieldName As String) As String
    ' Best-effort: remueve "fieldName": {...} si esta en el top-level (incluye coma)
    Dim search As String: search = """" & fieldName & """:"
    Dim startPos As Long: startPos = InStr(jsonText, search)
    If startPos = 0 Then RemoveJsonField = jsonText: Exit Function

    ' Buscar la , inmediatamente antes
    Dim cutStart As Long: cutStart = startPos
    If cutStart > 1 Then
        Dim i As Long
        For i = startPos - 1 To 1 Step -1
            Dim ch As String: ch = Mid(jsonText, i, 1)
            If ch = "," Then cutStart = i: Exit For
            If ch <> " " And ch <> vbCr And ch <> vbLf And ch <> vbTab Then Exit For
        Next i
    End If

    ' Buscar el cierre del objeto - contar { } balance
    Dim depth As Long: depth = 0
    Dim cutEnd As Long: cutEnd = startPos + Len(search)
    Dim j As Long
    Dim started As Boolean: started = False
    For j = cutEnd To Len(jsonText)
        Dim c As String: c = Mid(jsonText, j, 1)
        If c = "{" Then depth = depth + 1: started = True
        If c = "}" Then
            depth = depth - 1
            If started And depth = 0 Then cutEnd = j: Exit For
        End If
    Next j

    RemoveJsonField = Left(jsonText, cutStart - 1) & Mid(jsonText, cutEnd + 1)
End Function

Private Function EscJsonStr(s As String) As String
    Dim r As String: r = s
    r = Replace(r, "\", "\\")
    r = Replace(r, """", "\""")
    r = Replace(r, vbCrLf, "\n")
    r = Replace(r, vbCr, "\n")
    r = Replace(r, vbLf, "\n")
    r = Replace(r, vbTab, "\t")
    EscJsonStr = r
End Function

Private Function FmtJsonV(val As Variant) As String
    If VarType(val) = vbBoolean Then
        If val Then FmtJsonV = "true" Else FmtJsonV = "false"
        Exit Function
    End If
    If IsEmpty(val) Then FmtJsonV = "null": Exit Function
    Dim sV As String: sV = CStr(val)
    If sV = "" Then FmtJsonV = "null": Exit Function
    Dim lc As String: lc = LCase(sV)
    If lc = "true" Then FmtJsonV = "true": Exit Function
    If lc = "false" Then FmtJsonV = "false": Exit Function
    If IsNumeric(val) Then
        FmtJsonV = Replace(sV, ",", ".")
        Exit Function
    End If
    FmtJsonV = """" & EscJsonStr(sV) & """"
End Function

Attribute VB_Name = "mod_PRISMA_Resolver"
'==============================================================================
' APE LAB-SYNC v2.0 - PRISMA Placeholder Resolver
'
' Extiende ResolvePlaceholder() de APE_LAB_BRAIN para resolver placeholders
' {prisma.*} consultando atributos PRISMA por profile en hoja 6_NIVEL_2_PROFILES
' (rows 622-625 anadidas por Stage 1 LAB-SYNC v2.0).
'
' Hook point: linea 3600 de APE_LAB_BRAIN.bas, antes de
' "ResolvePlaceholder = result". Una sola linea inyectada:
'   result = ResolvePrismaPlaceholders(result, activeProfile)
'==============================================================================
Option Explicit

Public Function ResolvePrismaPlaceholders(ByVal value As String, ByVal profile As String) As String
    Dim result As String
    result = value

    ' Solo procesar si hay placeholders prisma.* presentes (fast path)
    If InStr(result, "{prisma.") = 0 Then
        ResolvePrismaPlaceholders = result
        Exit Function
    End If

    ' Lookup helpers que tolerant de fallback
    Dim profileForLookup As String
    profileForLookup = UCase(profile)
    If profileForLookup = "" Then profileForLookup = "P3"

    ' {prisma.bitrate_floor} -> profile.prisma_floor_min_bandwidth_bps
    If InStr(result, "{prisma.bitrate_floor}") > 0 Then
        Dim floorBps As String
        floorBps = SafeProfileVal(profileForLookup, "prisma_floor_min_bandwidth_bps", "8000000")
        result = Replace(result, "{prisma.bitrate_floor}", floorBps)
    End If

    ' {prisma.target_bandwidth} -> profile.prisma_target_bandwidth_bps
    If InStr(result, "{prisma.target_bandwidth}") > 0 Then
        Dim tgtBps As String
        tgtBps = SafeProfileVal(profileForLookup, "prisma_target_bandwidth_bps", "12000000")
        result = Replace(result, "{prisma.target_bandwidth}", tgtBps)
    End If

    ' {prisma.boost_multiplier} -> profile.prisma_boost_multiplier (decimal . forzado)
    If InStr(result, "{prisma.boost_multiplier}") > 0 Then
        Dim mult As String
        mult = SafeProfileVal(profileForLookup, "prisma_boost_multiplier", "1.5")
        mult = Replace(mult, ",", ".")
        result = Replace(result, "{prisma.boost_multiplier}", mult)
    End If

    ' {prisma.zap_grace} -> profile.prisma_zap_grace_seconds
    If InStr(result, "{prisma.zap_grace}") > 0 Then
        Dim grace As String
        grace = SafeProfileVal(profileForLookup, "prisma_zap_grace_seconds", "30")
        result = Replace(result, "{prisma.zap_grace}", grace)
    End If

    ' {prisma.lanes_default} -> JSON inline string con flags por lane (defaults)
    If InStr(result, "{prisma.lanes_default}") > 0 Then
        Dim lanes As String
        lanes = "lcevc=1,hdr10plus=1,ai_sr=1,quantum_pixel=1,fake_4k=0,cmaf=1"
        result = Replace(result, "{prisma.lanes_default}", lanes)
    End If

    ' {prisma.floor_lock_strict} -> per-channel desde 33_CHANNELS_FROM_FRONTEND col 62
    ' Stage 1: usar default basado en profile (P0-P2=true, P3-P5=false)
    If InStr(result, "{prisma.floor_lock_strict}") > 0 Then
        Dim strict As String
        Select Case profileForLookup
            Case "P0", "P1", "P2": strict = "true"
            Case Else: strict = "false"
        End Select
        result = Replace(result, "{prisma.floor_lock_strict}", strict)
    End If

    ResolvePrismaPlaceholders = result
End Function

' Wrapper defensivo: si ProfileVal falla o no existe, devuelve fallback
Private Function SafeProfileVal(ByVal profile As String, ByVal attr As String, ByVal fallback As String) As String
    On Error Resume Next
    Dim v As String
    v = ProfileVal(profile, attr)
    If Err.Number <> 0 Or v = "" Then
        SafeProfileVal = fallback
    Else
        SafeProfileVal = v
    End If
    On Error GoTo 0
End Function

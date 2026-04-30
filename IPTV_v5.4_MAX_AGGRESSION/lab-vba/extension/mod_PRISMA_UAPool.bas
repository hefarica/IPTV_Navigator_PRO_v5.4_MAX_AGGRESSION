Attribute VB_Name = "mod_PRISMA_UAPool"
Option Explicit

' ============================================================================
' PRISMA UA Pool — escribe pool 2026-fresh a hoja 33_UA_POOL.
' Stage 2 del plan 2026-04-30-iptv-lista-coherence-fix.
'
' Uso: ejecutar RefreshUAPool() desde botón btnRefreshUAPool en LAB UI.
' Sobrescribe la hoja 33_UA_POOL completa con 12 UAs verificados:
'   Chrome 119+ (Web0S), Tizen 7, Android TV SHIELD/Pixel/AFTKA,
'   macOS 14.4, Win10 Chrome 138, Firefox 134, Kodi 21,
'   OTT Navigator 1.7, TiviMate 4.7.
' ============================================================================

Public Sub RefreshUAPool()
    Dim ws As Worksheet
    Dim pool As Variant
    Dim i As Long

    pool = Array( _
        "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.213 Safari/537.36 WebAppManager", _
        "Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/5.0 NativeCross/1.0 SamsungBrowser/2.6 Chrome/63.0.3239.84 TV Safari/538.1", _
        "Mozilla/5.0 (Linux; Android 14; SHIELD Android TV Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36", _
        "Mozilla/5.0 (Linux; Tizen 6.5; SmartHub; SMART-TV; SmartTV; U; Maple2012) AppleWebKit/537.36 (KHTML, like Gecko) Version/6.5 TV Safari/537.36", _
        "Mozilla/5.0 (Linux; Android 12; AFTKA Build/STT1.231215.001) AppleWebKit/537.36 (KHTML, like Gecko) Silk/138.5.7 like Chrome/138.0.0.0 Safari/537.36", _
        "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro Build/UQ1A.240105.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36", _
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15", _
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36", _
        "Mozilla/5.0 (X11; Linux x86_64; rv:134.0) Gecko/20100101 Firefox/134.0", _
        "Kodi/21.0 (Windows 10) Version/21.0-Omega", _
        "OTT Navigator/1.7.0.0 (Linux;Android 13) ExoPlayer/2.19.1", _
        "TiviMate/4.7.0 (Linux;Android 13) ExoPlayer/2.19.1" _
    )

    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual

    On Error Resume Next
    Set ws = ThisWorkbook.Sheets("33_UA_POOL")
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Sheets.Add(After:=ThisWorkbook.Sheets(ThisWorkbook.Sheets.Count))
        ws.Name = "33_UA_POOL"
    End If

    ws.Cells.Clear
    ws.Cells(1, 1).Value = "INDEX"
    ws.Cells(1, 2).Value = "USER_AGENT"
    ws.Cells(1, 3).Value = "DEVICE"
    ws.Cells(1, 4).Value = "CHROME_VERSION"
    ws.Cells(1, 5).Value = "VERIFIED_ON"
    ws.Range("A1:E1").Font.Bold = True

    For i = 0 To UBound(pool)
        ws.Cells(i + 2, 1).Value = i
        ws.Cells(i + 2, 2).Value = pool(i)
        ws.Cells(i + 2, 3).Value = ClassifyDevice(CStr(pool(i)))
        ws.Cells(i + 2, 4).Value = ExtractChromeVersion(CStr(pool(i)))
        ws.Cells(i + 2, 5).Value = "2026-04-30"
    Next i

    ws.Columns("A:E").AutoFit

    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True

    MsgBox "UA Pool refreshed: " & (UBound(pool) + 1) & " UAs en hoja 33_UA_POOL", vbInformation, "PRISMA UA Pool"
End Sub

Private Function ClassifyDevice(ua As String) As String
    If InStr(ua, "Web0S") > 0 Then
        ClassifyDevice = "WebOS-TV"
    ElseIf InStr(ua, "Tizen") > 0 Then
        ClassifyDevice = "Tizen-TV"
    ElseIf InStr(ua, "SHIELD") > 0 Then
        ClassifyDevice = "Android-TV"
    ElseIf InStr(ua, "AFTKA") > 0 Then
        ClassifyDevice = "Fire-TV"
    ElseIf InStr(ua, "Pixel") > 0 Then
        ClassifyDevice = "Android-Mobile"
    ElseIf InStr(ua, "Macintosh") > 0 Then
        ClassifyDevice = "macOS"
    ElseIf InStr(ua, "Windows") > 0 Then
        ClassifyDevice = "Windows"
    ElseIf InStr(ua, "Kodi") > 0 Then
        ClassifyDevice = "Kodi"
    ElseIf InStr(ua, "OTT Navigator") > 0 Then
        ClassifyDevice = "OTT-Navigator"
    ElseIf InStr(ua, "TiviMate") > 0 Then
        ClassifyDevice = "TiviMate"
    Else
        ClassifyDevice = "Generic"
    End If
End Function

Private Function ExtractChromeVersion(ua As String) As String
    Dim p As Long
    Dim q As Long
    p = InStr(ua, "Chrome/")
    If p = 0 Then
        ExtractChromeVersion = "n/a"
        Exit Function
    End If
    p = p + 7  ' length of "Chrome/"
    q = p
    Do While q <= Len(ua)
        Dim ch As String
        ch = Mid(ua, q, 1)
        If ch = " " Or ch = "." Or ch = ";" Then Exit Do
        If Not (ch >= "0" And ch <= "9") Then Exit Do
        q = q + 1
    Loop
    ExtractChromeVersion = Mid(ua, p, q - p)
End Function

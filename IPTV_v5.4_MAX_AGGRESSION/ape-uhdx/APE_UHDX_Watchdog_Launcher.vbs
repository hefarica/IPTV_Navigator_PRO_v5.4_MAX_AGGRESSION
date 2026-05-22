Set oShell = CreateObject("WScript.Shell")
Dim psPath
psPath = Replace(WScript.ScriptFullName, "APE_UHDX_Watchdog_Launcher.vbs", "APE_UHDX_Watchdog_Unified.ps1")
oShell.Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & psPath & """ -RunOnce", 0, False

' Start Watchdog silently (no window)
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & Replace(WScript.ScriptFullName, "start_watchdog.vbs", "watchdog.ps1") & """", 0, False

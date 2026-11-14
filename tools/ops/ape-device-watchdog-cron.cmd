@echo off
setlocal
set BASE=C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\tools\ops
set LOG=C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\artifacts\device-truth\watchdog-cron.log
echo [%DATE% %TIME%] START >> "%LOG%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%BASE%\ape-device-watchdog.ps1" >> "%LOG%" 2>&1
echo [%DATE% %TIME%] END exit=%ERRORLEVEL% >> "%LOG%"
endlocal

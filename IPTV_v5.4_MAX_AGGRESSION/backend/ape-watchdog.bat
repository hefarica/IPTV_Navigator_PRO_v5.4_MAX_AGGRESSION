@echo off
:: ═══════════════════════════════════════════════════════════════════════════
:: APE GUARDIAN WATCHDOG — Windows Persistent Launcher
:: ═══════════════════════════════════════════════════════════════════════════
:: Runs every 5 minutes via Windows Task Scheduler.
:: Ensures the APE Streaming Guardian is ALWAYS alive on the ONN 4K.
:: If the ONN rebooted, lost connection, or the daemon crashed — this
:: watchdog reconnects ADB and relaunches the guardian automatically.
::
:: Install:
::   schtasks /create /tn "APE_Guardian_Watchdog" /tr "C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\IPTV_v5.4_MAX_AGGRESSION\backend\ape-watchdog.bat" /sc minute /mo 5 /rl HIGHEST /f
::
:: ═══════════════════════════════════════════════════════════════════════════

set ONN_IP=192.168.10.28
set ONN_PORT=5555
set ONN_ADDR=%ONN_IP%:%ONN_PORT%
set GUARDIAN_LOCAL=C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\IPTV_v5.4_MAX_AGGRESSION\backend\ape-ram-guardian.sh
set LOGFILE=C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\IPTV_v5.4_MAX_AGGRESSION\backend\watchdog.log

echo [%date% %time%] Watchdog check starting... >> %LOGFILE%

:: 1. Try ADB connect
adb connect %ONN_ADDR% > nul 2>&1
timeout /t 3 /nobreak > nul

:: 2. Check if connected
adb -s %ONN_ADDR% shell echo ALIVE > nul 2>&1
if errorlevel 1 (
    echo [%date% %time%] ONN unreachable at %ONN_ADDR% >> %LOGFILE%
    exit /b 0
)

:: 3. Check if guardian is running
for /f "tokens=*" %%A in ('adb -s %ONN_ADDR% shell "cat /data/local/tmp/ape-ram-guardian.lock 2>/dev/null"') do set PID=%%A
if "%PID%"=="" goto DEPLOY

:: 4. Check if PID is alive
adb -s %ONN_ADDR% shell "kill -0 %PID% 2>/dev/null; echo $?" > %TEMP%\guardian_check.txt 2>&1
findstr /c:"0" %TEMP%\guardian_check.txt > nul 2>&1
if errorlevel 1 goto DEPLOY

echo [%date% %time%] Guardian ALIVE (pid=%PID%) on ONN >> %LOGFILE%
exit /b 0

:DEPLOY
echo [%date% %time%] Guardian DOWN — redeploying... >> %LOGFILE%

:: Kill stale
adb -s %ONN_ADDR% shell "rm -f /data/local/tmp/ape-ram-guardian.lock" > nul 2>&1

:: Push latest version
adb -s %ONN_ADDR% push "%GUARDIAN_LOCAL%" /data/local/tmp/ape-ram-guardian.sh > nul 2>&1
adb -s %ONN_ADDR% shell "chmod 755 /data/local/tmp/ape-ram-guardian.sh" > nul 2>&1

:: Launch daemon
adb -s %ONN_ADDR% shell "nohup /data/local/tmp/ape-ram-guardian.sh daemon > /dev/null 2>&1 &" > nul 2>&1
timeout /t 5 /nobreak > nul

:: Verify
for /f "tokens=*" %%A in ('adb -s %ONN_ADDR% shell "cat /data/local/tmp/ape-ram-guardian.lock 2>/dev/null"') do set NEWPID=%%A
echo [%date% %time%] Guardian DEPLOYED (pid=%NEWPID%) >> %LOGFILE%
exit /b 0

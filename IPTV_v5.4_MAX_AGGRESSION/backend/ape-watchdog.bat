@echo off
REM APE SENTINEL WATCHDOG - Windows Persistent Launcher
REM Ensures the Daemon - Sentinel is ALWAYS alive on the ONN 4K.

set ONN_IP=192.168.10.28
set ONN_PORT=5555
set ONN_ADDR=%ONN_IP%:%ONN_PORT%
set SENTINEL_LOCAL=C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\IPTV_v5.4_MAX_AGGRESSION\backend\ape-sentinel.sh
set GUARDIAN_LOCAL=C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\IPTV_v5.4_MAX_AGGRESSION\backend\ape-ram-guardian.sh
set LOGFILE=C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\IPTV_v5.4_MAX_AGGRESSION\backend\watchdog.log

echo [%date% %time%] Watchdog check starting... >> "%LOGFILE%"

REM 1. Try ADB connect
adb connect %ONN_ADDR% > nul 2>&1
ping 127.0.0.1 -n 4 > nul

REM 2. Check if connected
adb -s %ONN_ADDR% shell echo ALIVE > nul 2>&1
if errorlevel 1 (
    echo [%date% %time%] ONN unreachable at %ONN_ADDR% >> "%LOGFILE%"
    exit /b 0
)

REM 3. Check if sentinel is running
for /f "tokens=*" %%A in ('adb -s %ONN_ADDR% shell "cat /data/local/tmp/ape-sentinel.lock 2>/dev/null"') do set PID=%%A
if "%PID%"=="" goto DEPLOY

REM 4. Check if PID is alive
adb -s %ONN_ADDR% shell "kill -0 %PID% 2>/dev/null; echo $?" > %TEMP%\sentinel_check.txt 2>&1
findstr /c:"0" %TEMP%\sentinel_check.txt > nul 2>&1
if errorlevel 1 goto DEPLOY

echo [%date% %time%] Sentinel ALIVE (pid=%PID%) on ONN >> "%LOGFILE%"
exit /b 0

:DEPLOY
echo [%date% %time%] Sentinel DOWN - redeploying... >> "%LOGFILE%"

REM Kill stale locks
adb -s %ONN_ADDR% shell "rm -f /data/local/tmp/ape-sentinel.lock" > nul 2>&1
adb -s %ONN_ADDR% shell "rm -f /data/local/tmp/ape-ram-guardian.lock" > nul 2>&1

REM Push latest versions
adb -s %ONN_ADDR% push "%SENTINEL_LOCAL%" /data/local/tmp/ape-sentinel.sh > nul 2>&1
adb -s %ONN_ADDR% shell "chmod 755 /data/local/tmp/ape-sentinel.sh" > nul 2>&1
adb -s %ONN_ADDR% push "%GUARDIAN_LOCAL%" /data/local/tmp/ape-ram-guardian.sh > nul 2>&1
adb -s %ONN_ADDR% shell "chmod 755 /data/local/tmp/ape-ram-guardian.sh" > nul 2>&1

REM Launch sentinel daemon
adb -s %ONN_ADDR% shell "nohup /data/local/tmp/ape-sentinel.sh daemon > /dev/null 2>&1 &" > nul 2>&1
ping 127.0.0.1 -n 6 > nul

REM Verify
set NEWPID=
for /f "tokens=*" %%A in ('adb -s %ONN_ADDR% shell "cat /data/local/tmp/ape-sentinel.lock 2>/dev/null"') do set NEWPID=%%A
echo [%date% %time%] Sentinel DEPLOYED (pid=%NEWPID%) >> "%LOGFILE%"
exit /b 0

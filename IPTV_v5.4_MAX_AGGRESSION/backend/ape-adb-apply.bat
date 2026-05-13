@echo off
REM ═══════════════════════════════════════════════════════════════
REM APE PRISMA — ADB Hardening Apply (Windows BAT)
REM Uso: ape-adb-apply.bat [IP:PUERTO]
REM Ejemplo: ape-adb-apply.bat 192.168.10.28:5555
REM          ape-adb-apply.bat 10.200.0.3:5555
REM ═══════════════════════════════════════════════════════════════

set ADB=C:\Android\platform-tools\adb.exe
set TARGET=%1

if "%TARGET%"=="" (
    echo.
    echo USO: %~nx0 [IP:PUERTO]
    echo.
    echo Dispositivos conocidos:
    echo   192.168.10.28:5555   = ONN 4K ^(Buga^) via WiFi LAN
    echo   10.200.0.3:5555      = Fire TV Stick 4K Max via WireGuard
    echo.
    echo Ejemplo: %~nx0 192.168.10.28:5555
    exit /b 1
)

echo ══════════════════════════════════════
echo  APE PRISMA — ADB Hardening v2.0
echo  Target: %TARGET%
echo ══════════════════════════════════════

REM --- Conectar ---
echo [0/3] Conectando a %TARGET%...
%ADB% connect %TARGET%
timeout /t 2 /nobreak > nul

REM --- Verificar conexión ---
%ADB% -s %TARGET% shell "echo CONNECTED" 2>nul | findstr /c:"CONNECTED" > nul
if errorlevel 1 (
    echo ERROR: No se pudo conectar a %TARGET%
    echo Verifica que ADB esté habilitado en el dispositivo.
    exit /b 1
)

REM --- Push script ---
echo [1/3] Enviando script al dispositivo...
%ADB% -s %TARGET% push "%~dp0ape-adb-hardening.sh" /data/local/tmp/ape-adb-hardening.sh
%ADB% -s %TARGET% shell "chmod 755 /data/local/tmp/ape-adb-hardening.sh"

REM --- Ejecutar ---
echo [2/3] Ejecutando hardening...
echo.
%ADB% -s %TARGET% shell "sh /data/local/tmp/ape-adb-hardening.sh"
echo.

REM --- Resultado ---
echo [3/3] Verificando resultado...
%ADB% -s %TARGET% shell "settings get global always_hdr" 2>nul | findstr /c:"1" > nul
if errorlevel 1 (
    echo RESULTADO: ERROR — verificar manualmente
    exit /b 1
) else (
    echo RESULTADO: EXITOSO — todas las directivas aplicadas
)

echo.
echo ══════════════════════════════════════
echo  Hardening completado para %TARGET%
echo ══════════════════════════════════════
pause

@echo off
:: ============================================
:: IPTV Navigator PRO - Launcher (Robusto)
:: Auto-limpia puerto, reinicia servidor si falla
:: Usa servidor HTTP local para evitar problemas CORS
:: IMPORTANTE: Usa 127.0.0.1:5500 para mantener datos de Live Server
::
:: FIX 2026-10-24 (bug HTTP 404 / raiz incorrecta):
::   ANTES: el servidor python se lanzaba con cwd="frontend\" y despues
::   se abria /IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html -> 404.
::   AHORA: el servidor se lanza SIEMPRE desde la raiz del workspace
::   (%~dp0..\..) y se verifica HTTP 200 ANTES de abrir el navegador.
::   Si el 5500 esta ocupado por un python con raiz incorrecta, se recicla.
:: ============================================

setlocal EnableExtensions

:: Add FFmpeg to PATH if not present
set "FFMPEG_PATH=C:\Users\HFRC\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin"
echo %PATH% | findstr /i /c:"%FFMPEG_PATH%" >nul || set "PATH=%FFMPEG_PATH%;%PATH%"

:: IMPORTANTE: Mismo puerto y ruta que Live Server para mantener datos IndexedDB
set HTTP_PORT=5500
set HTTP_HOST=127.0.0.1
set FALLBACK_PORT=5501

:: Raiz servida = 2 niveles arriba del frontend (raiz del workspace)
pushd "%~dp0..\.."
set "SERVE_ROOT=%CD%"
popd

if not exist "%SERVE_ROOT%\IPTV_v5.4_MAX_AGGRESSION\frontend\index-v4.html" (
    echo.
    echo ERROR: no se encontro la aplicacion en:
    echo   %SERVE_ROOT%\IPTV_v5.4_MAX_AGGRESSION\frontend\index-v4.html
    echo.
    pause
    exit /b 1
)

set "APP_PATH=/IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html"

echo.
echo ========================================
echo   IPTV Navigator PRO - Iniciando...
echo ========================================
echo.
echo Raiz a servir: %SERVE_ROOT%

call :build_url
call :probe
if "%PROBE_CODE%"=="200" (
    echo Servidor ya activo y sirviendo la app correctamente.
    goto :open_browser
)

:: El 5500 no sirve la app: identificar quien lo ocupa
set "HOLDER="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%HTTP_PORT% " ^| findstr "LISTENING"') do if not defined HOLDER set "HOLDER=%%a"

if not defined HOLDER goto :start_server

set "HOLDER_NAME="
for /f "tokens=1" %%n in ('tasklist /FI "PID eq %HOLDER%" /NH 2^>nul') do if not defined HOLDER_NAME set "HOLDER_NAME=%%n"
if /i "%HOLDER_NAME%"=="INFO:" goto :start_server
echo Puerto %HTTP_PORT% ocupado por PID %HOLDER% (%HOLDER_NAME%) pero NO sirve la app.

if /i "%HOLDER_NAME%"=="python.exe" (
    echo Reciclando servidor python con raiz incorrecta...
    taskkill /F /PID %HOLDER% >NUL 2>&1
    ping -n 2 127.0.0.1 >NUL 2>&1
    goto :start_server
)

echo No es python: no se toca. Se usara el puerto alterno %FALLBACK_PORT%.
echo AVISO: cambia el origen, esa ventana no reutiliza el IndexedDB de Live Server.
set HTTP_PORT=%FALLBACK_PORT%
set "HOLDER="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%HTTP_PORT% " ^| findstr "LISTENING"') do if not defined HOLDER set "HOLDER=%%a"
if not defined HOLDER goto :start_server
echo El puerto %FALLBACK_PORT% tambien esta ocupado por PID %HOLDER%. Cierralo y reintenta.
pause
exit /b 1

:start_server
echo Iniciando servidor HTTP en %HTTP_HOST%:%HTTP_PORT% ...
pushd "%SERVE_ROOT%"
start /B "" python -m http.server %HTTP_PORT% --bind %HTTP_HOST% >NUL 2>&1
popd
set WAIT_N=0
:wait_ready
set /a WAIT_N+=1
call :build_url
call :probe
if "%PROBE_CODE%"=="200" goto :open_browser
if %WAIT_N% GEQ 15 goto :start_failed
ping -n 2 127.0.0.1 >NUL 2>&1
goto :wait_ready

:start_failed
echo.
echo ADVERTENCIA: el servidor no respondio HTTP 200.
echo   URL probada : %APP_URL%
echo   HTTP visto  : %PROBE_CODE%
echo   Raiz        : %SERVE_ROOT%
echo Verifica python en PATH:  python --version
echo.
pause
exit /b 1

:open_browser
echo Abriendo aplicacion en %APP_URL%
start "" "%APP_URL%"
echo.
echo ========================================
echo   IPTV Navigator PRO esta corriendo!
echo   URL: %APP_URL%
echo   Raiz servida: %SERVE_ROOT%
echo ========================================
echo.
echo IMPORTANTE: Tus datos de Live Server se mantienen, mismo origen 127.0.0.1:5500.
echo Para cerrar, presiona cualquier tecla o cierra esta ventana.
echo.
pause
exit /b 0

:build_url
set "APP_URL=http://%HTTP_HOST%:%HTTP_PORT%%APP_PATH%"
exit /b 0

:probe
set "PROBE_CODE=000"
for /f "delims=" %%r in ('curl -s -o NUL -w "%%{http_code}" --max-time 5 "%APP_URL%" 2^>nul') do set "PROBE_CODE=%%r"
exit /b 0

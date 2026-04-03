@echo off
:: ============================================
:: IPTV Navigator PRO - Launcher (Robusto)
:: Auto-limpia puerto, reinicia servidor si falla
:: Usa servidor HTTP local para evitar problemas CORS
:: IMPORTANTE: Usa 127.0.0.1:5500 para mantener datos de Live Server
:: ============================================

cd /d "%~dp0"

:: Add FFmpeg to PATH if not present
set "FFMPEG_PATH=C:\Users\HFRC\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin"
echo %PATH% | findstr /i /c:"%FFMPEG_PATH%" >nul || set "PATH=%FFMPEG_PATH%;%PATH%"

:: IMPORTANTE: Mismo puerto y ruta que Live Server para mantener datos IndexedDB
set HTTP_PORT=5500
set HTTP_HOST=127.0.0.1

echo.
echo ========================================
echo   IPTV Navigator PRO - Iniciando...
echo ========================================
echo.

:: Use robust PowerShell starter for stream probe
:: DESACTIVADO TEMPORALMENTE para evitar bloqueo de Windows:
:: powershell -ExecutionPolicy Bypass -File "tools\stream_probe_server\start_server_robust.ps1" -Silent

:: Kill any existing process on HTTP_PORT (except Live Server if running)
echo Verificando puerto %HTTP_PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%HTTP_PORT% " ^| findstr "LISTENING"') do (
    echo Puerto %HTTP_PORT% ya en uso (puede ser Live Server)
    goto :skip_server
)

:: Start HTTP server since port is free
echo Iniciando servidor HTTP en %HTTP_HOST%:%HTTP_PORT%...
start /B "" python -m http.server %HTTP_PORT% --bind %HTTP_HOST% >NUL 2>&1
timeout /t 2 /nobreak >NUL

:skip_server

:: Navigate to correct path (same as Live Server)
:: Live Server path: http://127.0.0.1:5500/IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html
:: We need to serve from 2 levels up

cd /d "%~dp0..\.."
echo Directorio de servicio: %CD%

:: Restart server from correct directory if we started it
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%HTTP_PORT% " ^| findstr "LISTENING"') do (
    goto :open_browser
)

:: If no server running, start from parent directory
echo Iniciando servidor desde directorio raiz...
start /B "" python -m http.server %HTTP_PORT% --bind %HTTP_HOST% >NUL 2>&1
timeout /t 2 /nobreak >NUL

:open_browser
:: Open the app via HTTP with EXACT same path as Live Server
echo Abriendo aplicacion en http://%HTTP_HOST%:%HTTP_PORT%/IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html
start "" "http://%HTTP_HOST%:%HTTP_PORT%/IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html"

echo.
echo ========================================
echo   IPTV Navigator PRO esta corriendo!
echo   URL: http://%HTTP_HOST%:%HTTP_PORT%/IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html
echo ========================================
echo.
echo IMPORTANTE: Tus datos de Live Server se mantienen!
echo Para cerrar, presiona cualquier tecla o cierra esta ventana.
echo.
pause

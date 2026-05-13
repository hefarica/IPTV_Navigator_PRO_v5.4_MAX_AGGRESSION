@echo off
REM ═══════════════════════════════════════════════════════════════
REM  APE PRISMA — ONN 4K Image Optimization (Buga)
REM  Aplica las 4 correcciones de imagen + directivas base
REM  Ejecutar desde la misma red WiFi que el ONN 4K
REM ═══════════════════════════════════════════════════════════════

set ADB=C:\Android\platform-tools\adb.exe
set ONN_IP=%1

if "%ONN_IP%"=="" (
    echo.
    echo  USO: optimize_onn4k.bat ^<IP_DEL_ONN^>
    echo  Ejemplo: optimize_onn4k.bat 192.168.1.50
    echo.
    echo  Para encontrar la IP del ONN:
    echo    Menu ONN ^> Configuracion ^> Red ^> Ver IP
    echo.
    exit /b 1
)

echo ═══════════════════════════════════════════════════════════
echo  APE PRISMA — Optimizando ONN 4K en %ONN_IP%
echo ═══════════════════════════════════════════════════════════

echo [1/6] Conectando al ONN 4K...
%ADB% connect %ONN_IP%:5555
timeout /t 2 /nobreak >nul

%ADB% -s %ONN_IP%:5555 get-state >nul 2>&1
if errorlevel 1 (
    echo ERROR: No se puede conectar al ONN. Verifica:
    echo   1. ADB habilitado en el ONN: Menu ^> Configuracion ^> Opciones de desarrollador ^> Depuracion USB
    echo   2. IP correcta
    echo   3. Misma red WiFi
    exit /b 1
)

echo [2/6] Aplicando correcciones de IMAGEN (HDR auto, colores puros)...
%ADB% -s %ONN_IP%:5555 shell settings put global always_hdr 0
%ADB% -s %ONN_IP%:5555 shell settings put global hdr_conversion_mode 0
%ADB% -s %ONN_IP%:5555 shell settings put global match_content_frame_rate 1
%ADB% -s %ONN_IP%:5555 shell settings put secure display_color_mode 0
%ADB% -s %ONN_IP%:5555 shell settings put global user_preferred_resolution_height 2160
%ADB% -s %ONN_IP%:5555 shell settings put global user_preferred_resolution_width 3840
%ADB% -s %ONN_IP%:5555 shell settings put global user_preferred_refresh_rate 60.0

echo [3/6] Aplicando RENDIMIENTO (animaciones zero, GPU libre)...
%ADB% -s %ONN_IP%:5555 shell settings put global window_animation_scale 0.0
%ADB% -s %ONN_IP%:5555 shell settings put global transition_animation_scale 0.0
%ADB% -s %ONN_IP%:5555 shell settings put global animator_duration_scale 0.0
%ADB% -s %ONN_IP%:5555 shell settings put global forced_app_standby_enabled 1
%ADB% -s %ONN_IP%:5555 shell settings put global app_standby_enabled 1
%ADB% -s %ONN_IP%:5555 shell settings put global adaptive_battery_management_enabled 0

echo [4/6] Aplicando RED (TCP agresivo, WiFi never-sleep)...
%ADB% -s %ONN_IP%:5555 shell settings put global tcp_default_init_rwnd 60
%ADB% -s %ONN_IP%:5555 shell settings put global captive_portal_detection_enabled 0
%ADB% -s %ONN_IP%:5555 shell settings put global wifi_sleep_policy 2
%ADB% -s %ONN_IP%:5555 shell settings put global wifi_scan_always_enabled 0
%ADB% -s %ONN_IP%:5555 shell settings put global wifi_networks_available_notification_on 0
%ADB% -s %ONN_IP%:5555 shell settings put global network_scoring_ui_enabled 0
%ADB% -s %ONN_IP%:5555 shell settings put global wifi_watchdog_poor_network_test_enabled 0
%ADB% -s %ONN_IP%:5555 shell settings put global wifi_suspend_optimizations_enabled 0
%ADB% -s %ONN_IP%:5555 shell settings put global background_data_enabled 0

echo [5/6] Aplicando ENERGIA (always-on, sin screensaver)...
%ADB% -s %ONN_IP%:5555 shell settings put global stay_on_while_plugged_in 3
%ADB% -s %ONN_IP%:5555 shell settings put global low_power 0
%ADB% -s %ONN_IP%:5555 shell settings put system screen_off_timeout 2147483647
%ADB% -s %ONN_IP%:5555 shell settings put secure screensaver_enabled 0

echo [6/6] Verificando valores aplicados...
echo.
echo ══ IMAGEN ══
for %%s in (always_hdr hdr_conversion_mode match_content_frame_rate user_preferred_resolution_height user_preferred_refresh_rate) do (
    for /f "tokens=*" %%v in ('%ADB% -s %ONN_IP%:5555 shell settings get global %%s 2^>nul') do echo   %%s = %%v
)
echo.
echo ══ RENDIMIENTO ══
for %%s in (window_animation_scale transition_animation_scale animator_duration_scale) do (
    for /f "tokens=*" %%v in ('%ADB% -s %ONN_IP%:5555 shell settings get global %%s 2^>nul') do echo   %%s = %%v
)
echo.
echo ══ RED ══
for %%s in (tcp_default_init_rwnd wifi_sleep_policy background_data_enabled) do (
    for /f "tokens=*" %%v in ('%ADB% -s %ONN_IP%:5555 shell settings get global %%s 2^>nul') do echo   %%s = %%v
)

echo.
echo ═══════════════════════════════════════════════════════════
echo  ONN 4K OPTIMIZADO — Imagen pura, HDR auto, zapping rapido
echo ═══════════════════════════════════════════════════════════
echo.
echo  NOTA: Estos cambios persisten tras reinicio.
echo  Para revertir HDR: %ADB% -s %ONN_IP%:5555 shell settings put global always_hdr 1
echo.
pause

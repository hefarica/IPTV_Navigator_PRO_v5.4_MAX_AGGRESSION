@echo off
echo ============================================
echo   Stream Probe Server (Rust)
echo ============================================
echo.

REM Get script directory
set "SCRIPT_DIR=%~dp0"

REM Check if compiled binary exists
if exist "%SCRIPT_DIR%target\release\stream_probe_server.exe" (
    echo Iniciando servidor compilado...
    echo.
    "%SCRIPT_DIR%target\release\stream_probe_server.exe"
    pause
    exit /b 0
)

REM If not compiled, try to compile
echo Binario no encontrado. Compilando...
echo.

REM Check if Rust is installed
where cargo >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Rust/Cargo not found!
    echo Please install Rust: winget install Rustlang.Rustup
    pause
    exit /b 1
)

REM Check if FFmpeg is installed
where ffprobe >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: ffprobe not found!
    echo Please install FFmpeg: winget install Gyan.FFmpeg
    pause
    exit /b 1
)

echo Compilando servidor (esto toma 2-5 minutos la primera vez)...
echo.
cd /d "%SCRIPT_DIR%"
cargo build --release

if %ERRORLEVEL% EQU 0 (
    echo.
    echo Compilacion exitosa! Iniciando servidor...
    echo.
    "%SCRIPT_DIR%target\release\stream_probe_server.exe"
) else (
    echo.
    echo ERROR: Compilacion fallida.
)

pause

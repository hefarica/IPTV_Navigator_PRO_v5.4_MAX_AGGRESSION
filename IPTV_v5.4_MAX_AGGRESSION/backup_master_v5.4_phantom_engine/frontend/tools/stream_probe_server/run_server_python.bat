@echo off
echo ============================================
echo   Stream Probe Server (Python)
echo ============================================
echo.

REM Check if Python is installed
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Python not found!
    echo Please install Python from: https://www.python.org/downloads/
    pause
    exit /b 1
)

REM Check if aiohttp is installed
python -c "import aiohttp" 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Installing aiohttp...
    pip install aiohttp
)

REM Check if FFmpeg is installed
where ffprobe >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: ffprobe not found!
    echo Please install FFmpeg from: https://ffmpeg.org/download.html
    echo Or via chocolatey: choco install ffmpeg
    echo.
    echo The server will start but probing will fail.
    echo.
)

echo Starting server...
echo.
python probe_server.py

pause

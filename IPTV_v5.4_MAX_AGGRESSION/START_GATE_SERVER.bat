@echo off
REM ═══════════════════════════════════════════════════════════════
REM  🩺 APE GATE SERVER — arranque de doble-click
REM  Corre en localhost:8766 (tu máquina, NO VPS, NO duckdns).
REM  Sirve /admitted.json + /prepublish + /gate al frontend Live Server.
REM
REM  Déjalo corriendo en esta ventana mientras usas el botón 🩺.
REM  Para parar: Ctrl+C o cerrar esta ventana.
REM ═══════════════════════════════════════════════════════════════

title APE GATE SERVER (127.0.0.1:8766)
cd /d "%~dp0"

echo.
echo ═══════════════════════════════════════════════════════════════
echo   APE GATE SERVER — local only, NO VPS
echo   Escuchando en http://127.0.0.1:8766
echo ═══════════════════════════════════════════════════════════════
echo.
echo   Endpoints expuestos:
echo     GET  /health            — verificacion rapida
echo     GET  /admitted.json     — sirve backend/health/runtime/admitted.json
echo     POST /prepublish        — pipeline 8-pasos del plan
echo     POST /gate              — gate final con criterios extendidos
echo.
echo   Para detener: Ctrl+C o cerrar esta ventana.
echo ═══════════════════════════════════════════════════════════════
echo.

python backend\health\gate_server.py

echo.
echo Server detenido. Pulsa cualquier tecla para cerrar la ventana.
pause > nul

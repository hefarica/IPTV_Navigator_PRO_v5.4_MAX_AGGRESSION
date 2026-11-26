@echo off
rem ===========================================================================
rem  instalar-ape.bat - INSTALADOR / ACTUALIZADOR de doble clic (Windows)
rem  Objetivo: FIRE TV (Fire OS). Tambien sirve para cualquier Android con adb.
rem
rem  USO
rem    instalar-ape.bat                    usa el device YA conectado; si no hay
rem                                        ninguno, pide la IP y sale 2
rem    instalar-ape.bat 192.168.1.40:5555  conecta por red y sigue
rem    instalar-ape.bat 192.168.1.40       igual; se anade :5555
rem    instalar-ape.bat <ip> --nopause     sin pausa final (CI / pruebas)
rem    instalar-ape.bat --selftest         prueba el clasificador de errores
rem
rem  QUE HACE Y QUE NO
rem   - NO reimplementa el pipeline: el estado MISSING/OUTDATED/CURRENT/AHEAD,
rem     la descarga con verificacion de sha256 y el "adb install -r" los hace
rem     tools\ape-bootstrap-device.js (--check / --pipeline). Este .bat aporta:
rem     adb por red (conectar + confirmar estado "device"), modo INSTALAR vs
rem     ACTUALIZAR, clasificacion de los fallos tipicos de Fire OS, y el sha256
rem     FINAL del base.apk instalado comparado con el publicado.
rem   - NO desinstala NUNCA solo. Si el paquete esta con otra firma
rem     (INSTALL_FAILED_UPDATE_INCOMPATIBLE), lo declara y da el comando manual:
rem     esa decision es del operador.
rem   - NO toca el VPS, nginx, la configuracion de la app ni el subsistema QoE.
rem   - Idempotente: si el device ya esta en la version publicada NO reinstala.
rem   - Decide por RESULTADO (JSON del tool + sha del device), no por el codigo
rem     de salida de node: medido en este host, el tool puede abortar al salir
rem     con "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" DESPUES de
rem     imprimir su JSON (libuv/Node haciendo process.exit con un fetch vivo).
rem
rem  CODIGOS DE SALIDA
rem   0 = al dia (o recien instalado) y el sha del device coincide con el publicado
rem   1 = el device NO tiene la build publicada, o va por delante
rem   2 = NO COMPUTADO / error: falta node o adb, cero devices, mas de uno,
rem       device unauthorized u offline, el tool no devolvio estado, o no se
rem       pudo leer un sha. NUNCA exito inventado.
rem   3 = INSTALL_FAILED_UPDATE_INCOMPATIBLE: el paquete instalado tiene OTRA
rem       firma. Requiere decision del operador - el comando se imprime.
rem
rem  ASCII-only y CRLF: CMD parsea mal un .bat con LF sueltos, con caracteres
rem  fuera de la code page, con parentesis sin escapar dentro de un bloque if,
rem  o con un for /f con redireccion escapada DENTRO de un bloque anidado.
rem  Los cuatro fallos se midieron al construir este fichero.
rem ===========================================================================
setlocal EnableDelayedExpansion
title APE CRYSTAL FLOW - instalador Fire TV
cd /d "%~dp0.."
set "ROOT=%CD%"
set "PKG=com.ape.crystalagent"
set "BOOT=%ROOT%\tools\ape-bootstrap-device.js"
set "JSON=%TEMP%\ape-check-%RANDOM%.json"
set "ERRTXT=%TEMP%\ape-err-%RANDOM%.txt"
set "PIPETXT=%TEMP%\ape-pipe-%RANDOM%.txt"
set "EXITCODE=2"
set "TARGET=%~1"
set "NOPAUSE="
set "SERIAL="
set "ST="
set "INSTALL_CAUSE="
set "INSTALL_RAW="

if /i "%~1"=="--nopause" set "TARGET="
if /i "%~1"=="--nopause" set "NOPAUSE=1"
if /i "%~2"=="--nopause" set "NOPAUSE=1"
if /i "%~1"=="--selftest" goto :selftest

echo ============================================================
echo  APE CRYSTAL FLOW - INSTALADOR / ACTUALIZADOR  [Fire TV]
echo  carpeta : %ROOT%
echo  paquete : %PKG%
if defined TARGET echo  destino : !TARGET!
echo ============================================================
echo.

rem --- 0) node ---------------------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] No encuentro "node" en el PATH.
  echo         Instala Node.js 18 o superior - el tool usa fetch - y reintenta.
  goto :end
)
for /f "delims=" %%v in ('node -v') do set "NODEVER=%%v"
echo [ok] node !NODEVER!
if not exist "%BOOT%" (
  echo [ERROR] Falta el tool base: "%BOOT%"
  echo         Este .bat espera ejecutarse desde tools del repositorio.
  goto :end
)
echo [ok] base : tools\ape-bootstrap-device.js
echo.

rem --- 1) adb ---------------------------------------------------------------
set "ADB=adb"
where adb >nul 2>&1
if errorlevel 1 (
  if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" (
    set "ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
  ) else (
    echo [ERROR] No encuentro "adb" ni en el PATH ni en el Android SDK.
    echo         adb es OBLIGATORIO: sin adb no hay forma de instalar en el Fire TV.
    echo         Instala platform-tools y vuelve a ejecutar.
    goto :end
  )
)
echo [ok] adb  : !ADB!
echo.

rem --- 2) destino: por red si hay IP; si no, el device ya conectado ----------
if defined TARGET goto :connect_net

call :list_devices
if !NDEV! EQU 1 goto :use_connected
if !NDEV! GTR 1 goto :too_many
echo [info] Ningun device conectado.
call :report_unauth
if defined NOPAUSE (
  echo [NO COMPUTADO] sin device y sin IP: modo --nopause no pregunta.
  echo         Uso: instalar-ape.bat 192.168.1.40:5555
  goto :end
)
echo.
echo En Fire TV: Ajustes ^> Mi Fire TV ^> Opciones de desarrollador
echo   1. "Depuracion ADB" ACTIVADA
echo   2. "Apps de origenes desconocidos" ACTIVADA
echo   3. La IP del Fire TV esta en Ajustes ^> Mi Fire TV ^> Red
echo.
set "TARGET="
set /p "TARGET=IP del Fire TV - vacio para salir: "
if not defined TARGET (
  echo [NO COMPUTADO] no se indico IP: no hay nada que instalar.
  goto :end
)
goto :connect_net

:use_connected
set "SERIAL=!FIRST!"
echo [ok] device ya conectado: !SERIAL!
goto :check_state

:too_many
echo [ERROR] !NDEV! dispositivos conectados. Deja UNO solo, o pasa la IP:
echo         instalar-ape.bat 192.168.1.40:5555
call :list_devices_print
goto :end

:connect_net
call :normalize_ip
echo [net] adb connect !TARGET!
rem "call" DELIBERADO: si "adb" resuelve a un .bat/.cmd -shims tipo Scoop-,
rem invocarlo sin "call" transfiere el control y este .bat muere en silencio.
call "!ADB!" connect "!TARGET!" 2>&1
set "SERIAL=!TARGET!"

:check_state
call :wait_device
if /i not "!ST!"=="device" goto :not_device
echo [ok] device: !SERIAL! estado=device
echo.
goto :mode

:not_device
echo [NO COMPUTADO] el device !SERIAL! no esta en estado "device": !ST!
if /i "!ST!"=="unauthorized" echo   - Acepta el dialogo "Permitir depuracion" / "Allow ADB" en el Fire TV.
if /i "!ST!"=="offline" echo   - "adb disconnect !SERIAL!" y repite, o revisa la red.
echo   Un device NO autorizado no es un device: no se instala nada.
goto :end

rem --- 3) modo: INSTALAR vs ACTUALIZAR (solo informa; decide el tool) --------
:mode
set "HAVE="
for /f "delims=" %%p in ('""!ADB!" -s !SERIAL! shell pm path %PKG% 2^>nul"') do if not defined HAVE set "HAVE=%%p"
if defined HAVE (
  echo [modo] ACTUALIZAR - el paquete ya esta instalado: adb install -r
) else (
  echo [modo] INSTALAR - device nuevo: el paquete no esta
)
echo.

rem --- 4) estado REAL segun el tool (manda su JSON, no su exit code) --------
node "%BOOT%" --check !SERIAL! > "%JSON%" 2> "%ERRTXT%"
call :parse_json
if not defined STATE goto :no_state
echo [estado] !STATE!
if /i "!STATE!"=="CURRENT" (
  echo [estado] YA AL DIA: el device tiene la version publicada. NO se reinstala.
  goto :verify_sha
)
if /i "!STATE!"=="AHEAD" (
  echo [estado] el device va POR DELANTE de lo publicado: NO se toca, no se degrada.
  goto :verify_sha
)
echo [estado] hay que instalar o actualizar. Ejecutando el pipeline del tool...
echo.
node "%BOOT%" --pipeline !SERIAL! > "%PIPETXT%" 2>&1
type "%PIPETXT%"
echo.
call :classify "%PIPETXT%"
if /i "!INSTALL_CAUSE!"=="UPDATE_INCOMPATIBLE" goto :cause_firma
if /i "!INSTALL_CAUSE!"=="UNKNOWN_SOURCES" goto :cause_origen
echo [info] se comprueba el sha real del device antes de declarar nada.
node "%BOOT%" --check !SERIAL! > "%JSON%" 2> "%ERRTXT%"
call :parse_json
if defined STATE echo [estado tras instalar] !STATE!
goto :verify_sha

:no_state
echo [ERROR] el tool no devolvio un estado legible para este device:
type "%ERRTXT%"
goto :end

:cause_firma
echo ============================================================
echo [ERROR] INSTALL_FAILED_UPDATE_INCOMPATIBLE
echo         El Fire TV YA tiene !PKG! instalado con OTRA FIRMA
echo         - tipico si se instalo otra build o un APK de fuera -.
echo         Este script NO desinstala solo: es decision tuya, porque
echo         se pierden los datos de la app y su enrolamiento.
echo.
echo         Comando manual:
echo             adb -s !SERIAL! uninstall !PKG!
echo         y despues vuelve a ejecutar este instalador.
echo ============================================================
set "EXITCODE=3"
goto :end

:cause_origen
echo ============================================================
echo [ERROR] el Fire TV RECHAZO la instalacion por permisos
echo         Causa: "Apps de origenes desconocidos" NO esta activado, o el
echo         sistema bloqueo la instalacion.
echo         Texto del device: !INSTALL_RAW!
echo.
echo         Arreglo en el Fire TV:
echo           Ajustes ^> Mi Fire TV ^> Opciones de desarrollador
echo           ^> "Instalar apps desconocidas" ACTIVADO
echo         Despues repite este instalador.
echo ============================================================
goto :end

rem --- 5) sha256 del base.apk REALMENTE instalado ---------------------------
rem En Fire TV la ruta NO se asume: se pregunta con "pm path" porque puede ser
rem /data/app/... o /data/app/~~hash==/.../base.apk segun la version de Fire OS.
:verify_sha
if not defined PUB goto :no_pub
echo.
call :pull_sha
echo ------------------------------------------------------------
echo  sha256 del base.apk INSTALADO en !SERIAL!
echo  publicado: !PUB!
if defined INST (
  echo  instalado: !INST!
  echo  ruta     : !REMOTEPATH!
) else (
  echo  instalado: NO COMPUTADO - adb pull o certutil fallo
)
echo ------------------------------------------------------------
echo.
if not defined INST goto :no_sha
if /i not "!INST!"=="!PUB!" goto :sha_diff
if /i not "!STATE!"=="CURRENT" goto :state_incoherent
echo [OK] el Fire TV tiene EXACTAMENTE la build publicada.
set "EXITCODE=0"
goto :end

:no_pub
echo [ERROR] no pude leer el sha256 publicado del JSON del tool.
echo         Sin ese dato no hay comparacion posible: NO COMPUTADO.
goto :end

:no_sha
echo [NO COMPUTADO] no pude leer el sha del APK instalado; no afirmo que coincida.
goto :end

:sha_diff
echo [ERROR] el sha del device NO coincide con el publicado.
echo         Build distinta de la publicada: ni exito ni "al dia".
set "EXITCODE=1"
goto :end

:state_incoherent
echo [ERROR] el sha coincide pero el tool NO declara CURRENT - estado=!STATE!.
echo         No se declara exito con un estado incoherente.
set "EXITCODE=1"
goto :end

rem ===========================================================================
rem  SUBRUTINAS (todas en el nivel superior del fichero: sin bloques anidados
rem  con redirecciones escapadas, que truncaban el script en silencio)
rem ===========================================================================

:normalize_ip
echo !TARGET! | "%SystemRoot%\system32\findstr.exe" /r /c:":....*$" >nul
if errorlevel 1 set "TARGET=!TARGET!:5555"
goto :eof

:list_devices
set /a NDEV=0
set /a NUNAUTH=0
set /a NOFFLINE=0
set "FIRST="
for /f "skip=1 tokens=1,2" %%a in ('""!ADB!" devices 2^>nul"') do call :count_dev "%%a" "%%b"
goto :eof

:count_dev
if "%~2"=="device" (
  set /a NDEV+=1
  if not defined FIRST set "FIRST=%~1"
  goto :eof
)
if "%~2"=="unauthorized" set /a NUNAUTH+=1
if "%~2"=="offline" set /a NOFFLINE+=1
goto :eof

:list_devices_print
for /f "skip=1 tokens=1,2" %%a in ('""!ADB!" devices 2^>nul"') do if "%%b"=="device" echo   - %%a
goto :eof

:report_unauth
if !NUNAUTH! GTR 0 echo   - !NUNAUTH! devices "unauthorized": acepta "Permitir depuracion" en el Fire TV.
if !NOFFLINE! GTR 0 echo   - !NOFFLINE! devices "offline": reconecta o "adb reconnect".
goto :eof

:wait_device
rem El connect por red tarda: hasta 5 intentos de 1 s antes de declarar el estado.
set "ST="
set /a TRY=0
:wait_loop
set /a TRY+=1
for /f "delims=" %%s in ('""!ADB!" -s !SERIAL! get-state 2^>nul"') do set "ST=%%s"
if /i "!ST!"=="device" goto :eof
if !TRY! GEQ 5 goto :eof
"%SystemRoot%\system32\timeout.exe" /t 1 /nobreak >nul 2>&1
goto :wait_loop

:parse_json
set "STATE="
set "PUB="
for /f "tokens=2 delims=:" %%A in ('findstr /c:"\"state\"" "%JSON%" 2^>nul') do if not defined STATE set "STATE=%%A"
for /f "tokens=2 delims=:" %%A in ('findstr /c:"\"sha256\"" "%JSON%" 2^>nul') do if not defined PUB set "PUB=%%A"
if defined STATE set STATE=!STATE:"=!
if defined STATE set STATE=!STATE: =!
if defined STATE set STATE=!STATE:,=!
if defined PUB set PUB=!PUB:"=!
if defined PUB set PUB=!PUB: =!
if defined PUB set PUB=!PUB:,=!
goto :eof

:pull_sha
set "REMOTEPATH="
set "INST="
for /f "delims=" %%p in ('""!ADB!" -s !SERIAL! shell pm path %PKG% 2^>nul"') do if not defined REMOTEPATH set "REMOTEPATH=%%p"
if not defined REMOTEPATH goto :eof
set REMOTEPATH=!REMOTEPATH:package:=!
set "TMPAPK=%TEMP%\ape-instalado-%RANDOM%.apk"
call "!ADB!" -s !SERIAL! pull "!REMOTEPATH!" "!TMPAPK!" >nul 2>&1
if not exist "!TMPAPK!" goto :eof
for /f "skip=1 delims=" %%H in ('certutil -hashfile "!TMPAPK!" SHA256 2^>nul') do if not defined INST set "INST=%%H"
if defined INST set INST=!INST: =!
del "!TMPAPK!" >nul 2>&1
goto :eof

:classify
rem %1 = fichero con la salida del pipeline. Deja INSTALL_CAUSE e INSTALL_RAW.
set "INSTALL_CAUSE="
set "INSTALL_RAW="
if not exist "%~1" goto :eof
for /f "delims=" %%L in ('findstr /i /c:"INSTALL_FAILED_UPDATE_INCOMPATIBLE" "%~1"') do if not defined INSTALL_RAW set "INSTALL_RAW=%%L"
if defined INSTALL_RAW (
  set "INSTALL_CAUSE=UPDATE_INCOMPATIBLE"
  goto :eof
)
for /f "delims=" %%L in ('findstr /i /c:"INSTALL_FAILED_USER_RESTRICTED" /c:"INSTALL_FAILED_VERIFICATION_FAILURE" /c:"INSTALL_CANCELED_BY_USER" /c:"unknown sources" /c:"origenes desconocidos" "%~1"') do if not defined INSTALL_RAW set "INSTALL_RAW=%%L"
if defined INSTALL_RAW set "INSTALL_CAUSE=UNKNOWN_SOURCES"
goto :eof

rem ===========================================================================
rem  --selftest : prueba el clasificador con los textos REALES de Fire OS.
rem  No toca device, ni red, ni el APK. Sale 0 si todos los casos pasan.
rem ===========================================================================
:selftest
set /a PASS=0
set /a FAIL=0
set "T1=%TEMP%\ape-st1-%RANDOM%.txt"
set "T2=%TEMP%\ape-st2-%RANDOM%.txt"
set "T3=%TEMP%\ape-st3-%RANDOM%.txt"
set "T4=%TEMP%\ape-st4-%RANDOM%.txt"
set "T5=%TEMP%\ape-st5-%RANDOM%.txt"
echo Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: Package com.ape.crystalagent signatures do not match previously installed version]> "%T1%"
echo Failure [INSTALL_FAILED_USER_RESTRICTED: Install canceled by user]> "%T2%"
echo Failure [INSTALL_FAILED_VERIFICATION_FAILURE]> "%T3%"
echo ERROR: connect failed: closed> "%T4%"
echo Success> "%T5%"
call :assert_cause "%T5%" "" "OK no es fallo"
call :assert_cause "%T1%" "UPDATE_INCOMPATIBLE" "firma distinta"
call :assert_cause "%T2%" "UNKNOWN_SOURCES" "origenes desconocidos"
call :assert_cause "%T3%" "UNKNOWN_SOURCES" "verificacion"
call :assert_cause "%T4%" "" "error generico no se clasifica como permiso"
del "%T1%" "%T2%" "%T3%" "%T4%" "%T5%" >nul 2>&1
echo.
echo SELFTEST: PASS !PASS! / FAIL !FAIL!
if !FAIL! EQU 0 exit /b 0
exit /b 1

:assert_cause
call :classify "%~1"
if "!INSTALL_CAUSE!"=="%~2" (
  set /a PASS+=1
  echo [PASS] %~3 - causa="!INSTALL_CAUSE!"
  goto :eof
)
set /a FAIL+=1
echo [FAIL] %~3 - esperado "%~2" obtenido "!INSTALL_CAUSE!"
goto :eof

:end
del "%JSON%" "%ERRTXT%" "%PIPETXT%" >nul 2>&1
echo.
echo ============================================================
if "!EXITCODE!"=="0" echo  RESULTADO: OK - al dia, sha identico al publicado
if "!EXITCODE!"=="1" echo  RESULTADO: el device NO tiene la build publicada
if "!EXITCODE!"=="2" echo  RESULTADO: NO COMPUTADO / ERROR - no se declara exito
if "!EXITCODE!"=="3" echo  RESULTADO: firma incompatible - decide el operador
echo  Nada del VPS, nginx, configuracion de la app ni QoE se ha tocado.
echo  Rollback: adb -s !SERIAL! uninstall %PKG%   - ver tools\README-INSTALADOR.md
echo ============================================================
if defined NOPAUSE exit /b !EXITCODE!
echo.
pause
exit /b !EXITCODE!

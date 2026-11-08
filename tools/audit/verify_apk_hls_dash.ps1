#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Verificación reproducible del LADO APK para HLS y DASH.

.DESCRIPTION
  Mide con evidencia objetiva. Tres condiciones por transporte:

    1. MONTA el transporte correcto  -> lee "media source:" del log
    2. SELECCIONA pista de vídeo     -> lee "VIDEO elegido:" del log
    3. PRESENTA imagen en movimiento -> compara DOS capturas separadas en el tiempo:
         a) hash distinto      => algo cambia en pantalla
         b) ambas > 60.000 B   => lo que cambia es IMAGEN, no el texto de un overlay

  Exit 0 sólo si los tres casos pasan.

  ── Por qué NO se usa SurfaceFlinger --latency ────────────────────────────────
  Se probó y dio falsos negativos, por dos motivos medidos en este dispositivo:
    1. El buffer circular tiene SIEMPRE 127 entradas y deja de rotar aunque el
       vídeo avance: 127 -> 127 -> 127 con el test pattern en marcha.
    2. Las capturas negras CAMBIAN de hash cuando aparece el texto del overlay
       de error (16.280 -> 22.491 B), así que "hash distinto" por sí solo no
       prueba que haya vídeo.
  El criterio de tamaño es el que separa las dos cosas. Calibrado aquí:
      negro con barra de título  ~16.280 B
      negro con overlay de error ~22.491 B
      test pattern 720p real     ~348.000-414.000 B
      contenido real 1080p       ~1.400.000-2.000.000 B

  ── Precondiciones que el script exige ────────────────────────────────────────
    - dispositivo en `adb devices`
    - pantalla despierta (mWakefulness=Awake)
    - PlayerActivity en primer plano: se hace force-stop de OTT Navigator porque
      PlayerActivity es singleTask SIN onNewIntent (un zap a una instancia viva
      se descarta) y se verifica mCurrentFocus ANTES de capturar.

.EXAMPLE
  pwsh tools/audit/verify_apk_hls_dash.ps1
  pwsh tools/audit/verify_apk_hls_dash.ps1 -Serial "adb-XXXX._adb-tls-connect._tcp"
  pwsh tools/audit/verify_apk_hls_dash.ps1 -HlsUrl "http://192.168.1.9:8124/test.m3u8"
#>
param(
  [string]$Serial = "adb-GUSA2441015311-RXlL4A._adb-tls-connect._tcp",
  [string]$HlsUrl = "https://iptv-ape.duckdns.org/jit/live/2/master.m3u8",
  [string]$DashUrl = "https://iptv-ape.duckdns.org/jit/live/2/manifest.mpd",
  [string]$AltUrl = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  [int]$Dwell = 16,
  [int]$MinBytes = 60000,
  [string]$OutDir = "docs/audits/frames"
)

$ErrorActionPreference = "Continue"
$Pkg = "com.ape.crystalagent"
$Act = "$Pkg/com.ape.crystalagent.PlayerActivity"
$OttPkg = "studio.scillarium.ottnavigator"
$fail = 0

function Say($m = "", $c = "Gray") { Write-Host $m -ForegroundColor $c }
function Step($m) { Say "`n=== $m ===" "Cyan" }

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

# ── precondiciones ───────────────────────────────────────────────────────────
Step "0 · precondiciones"
$dev = (adb devices 2>&1) -join "`n"
if ($dev -notmatch [regex]::Escape($Serial)) {
  Say "  FALLA: '$Serial' no aparece en adb devices." "Red"
  Say "  Si el TV se reinició, perdió la depuración inalámbrica." "Yellow"
  Say "  Reactívela en: Ajustes > Opciones de desarrollador > Depuración inalámbrica" "Yellow"
  Say $dev
  exit 2
}
Say "  dispositivo: OK" "Green"

adb -s $Serial shell 'input keyevent KEYCODE_WAKEUP' 2>&1 | Out-Null
Start-Sleep -Seconds 2
$wake = (adb -s $Serial shell 'dumpsys power 2>/dev/null | grep -oE "mWakefulness=[A-Za-z]+" | head -1' 2>&1).Trim()
Say "  pantalla: $wake"
if ($wake -notmatch "Awake") {
  Say "  FALLA: pantalla dormida; cualquier captura saldrá negra por standby." "Red"
  exit 2
}

$ver = (adb -s $Serial shell "dumpsys package $Pkg | grep -oE 'versionName=[^ ]+' | head -1" 2>&1).Trim()
Say "  version: $ver"

# ── una pasada por transporte ────────────────────────────────────────────────
function Test-Transport {
  param([string]$Label, [string]$Url, [string]$ExpectKind)

  Step "transporte $Label"
  adb -s $Serial shell "am force-stop $OttPkg" 2>&1 | Out-Null
  adb -s $Serial shell "am force-stop $Pkg" 2>&1 | Out-Null
  Start-Sleep -Seconds 3
  adb -s $Serial logcat -c 2>&1 | Out-Null

  adb -s $Serial shell "am start -W -n $Act -e url `"$Url`"" 2>&1 |
    Select-String "Status:" | ForEach-Object { Say "  $($_.Line.Trim())" }

  Start-Sleep -Seconds $Dwell

  # 1 · foco: si no es la app, no estamos midiendo el player
  $focus = (adb -s $Serial shell 'dumpsys window 2>/dev/null | grep -oE "mCurrentFocus=Window\{[^}]*" | head -1' 2>&1).Trim()
  Say "  foco: $focus"
  if ($focus -notmatch [regex]::Escape($Pkg)) {
    Say "  FALLA: la app no está en primer plano; la medición no vale." "Red"
    return $false
  }

  $log = adb -s $Serial logcat -d 2>/dev/null

  # 2 · transporte montado
  $src = ($log | Select-String -Pattern "media source:" | Select-Object -First 1).Line
  Say "  $src"
  if ($src -notmatch "media source: $ExpectKind") {
    Say "  FALLA: no montó $ExpectKind." "Red"; return $false
  }
  Say "  transporte: OK ($ExpectKind)" "Green"

  # 3 · pista de vídeo
  $sel = ($log | Select-String -Pattern "VIDEO elegido" | Select-Object -First 1).Line
  Say "  $sel"
  if (-not $sel) { Say "  FALLA: ninguna pista de vídeo seleccionada." "Red"; return $false }
  Say "  selección: OK" "Green"

  $perr = ($log | Select-String -Pattern "Playback error").Count
  $unh = ($log | Select-String -Pattern "UnknownHost").Count
  Say "  Playback error=$perr  UnknownHost=$unh"

  # 4 · imagen en movimiento: dos capturas, hash distinto Y tamaño sobre umbral
  $p1 = Join-Path $OutDir ("_p1_{0}.png" -f ($ExpectKind.ToLower()))
  $p2 = Join-Path $OutDir ("_p2_{0}.png" -f ($ExpectKind.ToLower()))
  adb -s $Serial shell "screencap -p /sdcard/_p1.png" 2>&1 | Out-Null
  adb -s $Serial pull /sdcard/_p1.png $p1 2>&1 | Out-Null
  Start-Sleep -Seconds 4
  adb -s $Serial shell "screencap -p /sdcard/_p2.png" 2>&1 | Out-Null
  adb -s $Serial pull /sdcard/_p2.png $p2 2>&1 | Out-Null
  adb -s $Serial shell "rm -f /sdcard/_p1.png /sdcard/_p2.png" 2>&1 | Out-Null

  if (-not (Test-Path $p1) -or -not (Test-Path $p2)) {
    Say "  FALLA: no se pudo capturar la pantalla." "Red"; return $false
  }
  $h1 = (Get-FileHash $p1 -Algorithm SHA256).Hash
  $h2 = (Get-FileHash $p2 -Algorithm SHA256).Hash
  $s1 = (Get-Item $p1).Length
  $s2 = (Get-Item $p2).Length
  Say "  captura A: $s1 B  $($h1.Substring(0,12))"
  Say "  captura B: $s2 B  $($h2.Substring(0,12))"

  $keep = Join-Path $OutDir ("apk_{0}.png" -f ($ExpectKind.ToLower()))
  Copy-Item $p1 $keep -Force -ErrorAction SilentlyContinue
  Remove-Item $p1, $p2 -Force -ErrorAction SilentlyContinue

  if ($h1 -eq $h2) {
    Say "  FALLA: las dos capturas son idénticas; el vídeo no avanza." "Red"
    return $false
  }
  if ($s1 -lt $MinBytes -or $s2 -lt $MinBytes) {
    Say "  FALLA: cambian pero pesan $s1/$s2 B (< $MinBytes): overlay de error, NO vídeo." "Red"
    return $false
  }
  Say "  presentación: OK — $s1/$s2 B, distintas y sobre el umbral" "Green"
  return $true
}

# ── los tres casos ──────────────────────────────────────────────────────────
$r1 = Test-Transport "HLS" $HlsUrl "HLS"
if (-not $r1) { $fail++ }
$r2 = Test-Transport "DASH" $DashUrl "DASH"
if (-not $r2) { $fail++ }
$r3 = Test-Transport "HLS control mux.dev" $AltUrl "HLS"
if (-not $r3) { $fail++ }

Step "RESULTADO"
Say "  HLS  : $(if($r1){'PASA'}else{'NO PASA'})"
Say "  DASH : $(if($r2){'PASA'}else{'NO PASA'})"
Say "  mux  : $(if($r3){'PASA'}else{'NO PASA'})"
if ($fail -eq 0) {
  Say ""
  Say "  Los tres casos: montan, seleccionan y PRESENTAN imagen en movimiento." "Green"
  exit 0
} else {
  Say ""
  Say "  $fail de 3 casos NO pasan. Ver arriba qué paso falló." "Red"
  Say "  Si el control mux.dev también falla: el problema es RED, no el transporte." "Yellow"
  exit 1
}

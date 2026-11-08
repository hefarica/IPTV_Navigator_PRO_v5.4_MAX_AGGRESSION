#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Verificación reproducible del LADO APK para HLS y DASH.

.DESCRIPTION
  Mide con evidencia objetiva, no con "parece que se ve":

    1. Que el APK monta el transporte correcto (HLS o DASH) leyendo
       "media source:" del log.
    2. Que selecciona una pista de vídeo ("VIDEO elegido:").
    3. Que PRESENTA frames, midiendo los timestamps de la superficie:
       `dumpsys SurfaceFlinger --latency` sobre la SurfaceView del player.
       Cero frames = no presenta, aunque la captura salga negra por otra razón.
    4. La captura, como apoyo (no como prueba: screencap puede no incluir
       el overlay de vídeo de hardware).

  Exit 0 sólo si TODOS los pasos pasan. Cero frames => exit 1.

  Antes de medir exige:
    - dispositivo conectado (adb devices)
    - pantalla despierta (mWakefulness=Awake)
    - PlayerActivity realmente en primer plano (mCurrentFocus)

  Si OTT Navigator está encima, el `am start` no trae la app al frente:
  PlayerActivity es singleTask SIN onNewIntent, así que un zap a una
  instancia viva se descarta. Por eso se hace force-stop de OTT primero
  y se verifica el foco ANTES de capturar.

.EXAMPLE
  ./tools/audit/verify_apk_hls_dash.ps1
  ./tools/audit/verify_apk_hls_dash.ps1 -Serial 192.168.1.3:33363
  ./tools/audit/verify_apk_hls_dash.ps1 -Dwell 25
#>
param(
  [string]$Serial   = "192.168.1.3:33363",
  [string]$HlsUrl   = "https://iptv-ape.duckdns.org/jit/live/2/master.m3u8",
  [string]$DashUrl  = "https://iptv-ape.duckdns.org/jit/live/2/manifest.mpd",
  [string]$AltUrl   = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  [int]$Dwell       = 20,
  [string]$OutDir   = "docs/audits/frames"
)

$ErrorActionPreference = "Continue"
$Pkg    = "com.ape.crystalagent"
$Act    = "$Pkg/com.ape.crystalagent.PlayerActivity"
$OttPkg = "studio.scillarium.ottnavigator"
$fail   = 0

function Say($m, $c = "Gray") { Write-Host $m -ForegroundColor $c }
function Step($m) { Say "`n=== $m ===" "Cyan" }

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

# ── precondiciones ────────────────────────────────────────────────────────────
Step "0 · precondiciones"
$dev = (adb devices 2>&1) -join "`n"
if ($dev -notmatch [regex]::Escape($Serial)) {
  Say "  FALLA: '$Serial' no aparece en adb devices." "Red"
  Say "  El TV perdió la depuración inalámbrica (pasa tras un reboot)." "Yellow"
  Say "  Reactívela en: Ajustes > Opciones de desarrollador > Depuración inalámbrica" "Yellow"
  Say $dev
  exit 2
}
Say "  dispositivo: OK" "Green"

adb -s $Serial shell 'input keyevent KEYCODE_WAKEUP' 2>&1 | Out-Null
Start-Sleep -Seconds 2
$wake = (adb -s $Serial shell 'dumpsys power 2>/dev/null | grep -oE "mWakefulness=[A-Za-z]+" | head -1' 2>&1).Trim()
Say "  pantalla: $wake"
if ($wake -notmatch "Awake") { Say "  AVISO: pantalla no despierta; las capturas saldrán negras por standby." "Yellow" }

$ver = (adb -s $Serial shell "dumpsys package $Pkg | grep -oE 'versionName=[^ ]+' | head -1" 2>&1).Trim()
Say "  version: $ver"

# ── una pasada por transporte ─────────────────────────────────────────────────
function Test-Transport {
  param([string]$Label, [string]$Url, [string]$ExpectKind)

  Step "transporte $Label"
  adb -s $Serial shell "am force-stop $OttPkg"  2>&1 | Out-Null
  adb -s $Serial shell "am force-stop $Pkg"     2>&1 | Out-Null
  Start-Sleep -Seconds 3
  adb -s $Serial logcat -c 2>&1 | Out-Null

  adb -s $Serial shell "am start -W -n $Act -e url `"$Url`"" 2>&1 |
    Select-String "Status:" | ForEach-Object { Say "  $($_.Line.Trim())" }

  Start-Sleep -Seconds $Dwell

  # 3a · foco: si no está la Activity, no estamos midiendo el player
  $focus = (adb -s $Serial shell 'dumpsys window 2>/dev/null | grep -oE "mCurrentFocus=Window\{[^}]*" | head -1' 2>&1).Trim()
  Say "  foco: $focus"
  if ($focus -notmatch [regex]::Escape($Pkg)) {
    Say "  FALLA: la app no está en primer plano; la medición no vale." "Red"
    return $false
  }

  $log = adb -s $Serial logcat -d 2>/dev/null

  $src = ($log | Select-String -Pattern "media source:" | Select-Object -First 1).Line
  Say "  $src"
  if ($src -notmatch "media source: $ExpectKind") {
    Say "  FALLA: no montó $ExpectKind." "Red"; return $false
  }
  Say "  transporte: OK ($ExpectKind)" "Green"

  $sel = ($log | Select-String -Pattern "VIDEO elegido" | Select-Object -First 1).Line
  Say "  $sel"
  if (-not $sel) { Say "  FALLA: ninguna pista de vídeo seleccionada." "Red"; return $false }
  Say "  selección: OK" "Green"

  $err = ($log | Select-String -Pattern "Playback error").Count
  $unh = ($log | Select-String -Pattern "UnknownHost").Count
  Say "  Playback error=$err  UnknownHost=$unh"

  # 3b · frames presentados: la prueba real
  #
  # DOS TRAMPAS medidas en este dispositivo, ambas dan falso negativo:
  #
  #  1) --latency devuelve SIEMPRE un buffer circular de 127 filas. Contar filas da 127
  #     en cualquier capa, incluidas las del sistema. Lo que importa es cuantas tienen
  #     actualPresentTime != 0.
  #  2) El video va a la capa "SurfaceView[...](BLAST)#N", NO a "SurfaceView[...]#N".
  #     La capa sin sufijo puede quedarse con frames historicos congelados (delta 0)
  #     mientras la BLAST es la que recibe. Se prefiere BLAST y se cae a la otra.
  #  3) Un acumulado > 0 NO prueba reproduccion: puede ser residuo de una sesion
  #     anterior. Lo que prueba es el DELTA entre dos muestras separadas en el tiempo.
  function Count-Presented([string]$layer) {
    $raw = @(adb -s $Serial shell "dumpsys SurfaceFlinger --latency `"$layer`" 2>/dev/null" 2>&1)
    return ($raw | Where-Object { $_ -match '^\d+\s+\d+\s+\d+' } |
            Where-Object { [long](($_ -split '\s+')[1]) -ne 0 }).Count
  }

  $cap = (adb -s $Serial shell 'dumpsys SurfaceFlinger --list 2>/dev/null | grep -oE "SurfaceView\[com.ape.crystalagent[^]]*\]\(BLAST\)#[0-9]+" | head -1' 2>&1).Trim()
  if (-not $cap) {
    $cap = (adb -s $Serial shell 'dumpsys SurfaceFlinger --list 2>/dev/null | grep -oE "SurfaceView\[com.ape.crystalagent[^]]*\]#[0-9]+" | head -1' 2>&1).Trim()
  }
  if (-not $cap) {
    Say "  FALLA: no hay SurfaceView del player en SurfaceFlinger." "Red"; return $false
  }
  Say "  capa: $cap"

  $f1 = Count-Presented $cap
  Start-Sleep -Seconds 4
  $f2 = Count-Presented $cap
  $delta = $f2 - $f1
  Say "  frames presentados: $f1 -> $f2  (delta $delta en 4 s)"
  if ($delta -le 0) {
    Say "  FALLA: no se presentan frames NUEVOS (delta $delta)." "Red"
    Say "         Un acumulado > 0 puede ser residuo congelado: lo que prueba es el delta." "Yellow"
    return $false
  }
  Say "  presentación: OK ($delta frames en 4 s)" "Green"

  $png = Join-Path $OutDir ("apk_{0}.png" -f ($ExpectKind.ToLower()))
  adb -s $Serial shell "screencap -p /sdcard/_v.png" 2>&1 | Out-Null
  adb -s $Serial pull /sdcard/_v.png $png 2>&1 | Out-Null
  adb -s $Serial shell "rm -f /sdcard/_v.png" 2>&1 | Out-Null
  if (Test-Path $png) {
    $sz = (Get-Item $png).Length
    Say "  captura: $png ($sz B) — apoyo, no prueba"
  }
  return $true
}

# ── las tres fuentes ──────────────────────────────────────────────────────────
if (-not (Test-Transport "HLS · JIT"  $HlsUrl  "HLS"))  { $fail++ }
if (-not (Test-Transport "DASH · JIT" $DashUrl "DASH")) { $fail++ }
if (-not (Test-Transport "HLS · control mux.dev" $AltUrl "HLS")) { $fail++ }

Step "RESULTADO"
if ($fail -eq 0) {
  Say "  Los tres casos: montan, seleccionan y PRESENTAN frames." "Green"
  Say "  HLS y DASH funcionan en el APK." "Green"
  exit 0
} else {
  Say "  $fail de 3 casos NO pasan." "Red"
  Say "  Revisar arriba qué paso falló: transporte, selección o presentación." "Yellow"
  exit 1
}

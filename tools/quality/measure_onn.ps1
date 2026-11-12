# measure_onn.ps1 — Medición de dispositivo Android TV para §14
#
# Uso:  .\tools\quality\measure_onn.ps1 -Device 192.168.1.3:5555
#
# Captura, en UNA pasada y sin tocar la configuración del aparato, lo que §14 pide
# y que hasta ahora no se había podido medir (#14: OTT, TiviMate, ExoPlayer, GPU,
# térmica, audio, HDR). Requiere ADB habilitado en el dispositivo.
#
# Sólo lectura sobre el device: getprop / dumpsys / logcat -d / pm list.
# NO instala, NO cambia settings, NO mata procesos, NO reinicia nada.
#
# Escribe un recibo JSON en docs/audits/DEVICE_MEASURE_<stamp>.json y deja el
# crudo en scratch/device_measure_<stamp>/. Cada campo lleva su estado:
# MEDIDO / NO_DISPONIBLE, nunca un cero cuando no se pudo leer.

param(
  [Parameter(Mandatory = $true)][string]$Device,
  [int]$LogcatLines = 4000,
  [string]$OutDir = 'docs/audits'
)

$ErrorActionPreference = 'Stop'
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$raw = "scratch\device_measure_$stamp"
New-Item -ItemType Directory -Force -Path $raw | Out-Null

function Sh([string]$cmd) {
  # devuelve el texto, o $null si adb fallo. Un fallo NO es una cadena vacia.
  $o = & adb -s $script:serial shell $cmd 2>&1
  if ($LASTEXITCODE -ne 0) { return $null }
  return (($o | Out-String).TrimEnd())
}

Write-Host "== conectando a $Device"
& adb connect $Device 2>&1 | ForEach-Object { Write-Host "   $_" }
Start-Sleep -Seconds 2

$list = & adb devices 2>&1
$script:serial = @($list | Select-Object -Skip 1 |
  Where-Object { $_ -match "`tdevice$" } |
  ForEach-Object { ($_ -split "`t")[0] } | Select-Object -First 1)
if (-not $script:serial) {
  Write-Host "   NO CONECTADO. Ningun device en estado 'device'. Abortando sin inventar nada."
  exit 3
}
Write-Host "   serial = $script:serial"

# ── identidad ────────────────────────────────────────────────────────────────
$props = @{
  model = 'ro.product.model'; manufacturer = 'ro.product.manufacturer'
  android = 'ro.build.version.release'; sdk = 'ro.build.version.sdk'
  abi = 'ro.product.cpu.abi'; soc = 'ro.board.platform'
  hardware = 'ro.hardware'; build_id = 'ro.build.id'
  security_patch = 'ro.build.version.security_patch'
}
$ident = @{}
foreach ($k in $props.Keys) {
  $v = Sh "getprop $($props[$k])"
  $ident[$k] = if ($null -eq $v) { @{ estado = 'NO_DISPONIBLE' } } else { @{ estado = 'MEDIDO'; valor = $v } }
}

# ── pantalla ─────────────────────────────────────────────────────────────────
$wmSize = Sh 'wm size'; $wmDensity = Sh 'wm density'
$disp = @{
  size    = if ($null -eq $wmSize) { @{ estado = 'NO_DISPONIBLE' } } else { @{ estado = 'MEDIDO'; valor = $wmSize } }
  density = if ($null -eq $wmDensity) { @{ estado = 'NO_DISPONIBLE' } } else { @{ estado = 'MEDIDO'; valor = $wmDensity } }
}

# ── HDR / wide color (SurfaceFlinger) ────────────────────────────────────────
$sf = Sh 'dumpsys SurfaceFlinger'
$hdr = @{ estado = 'NO_DISPONIBLE' }
if ($sf) {
  $m = [regex]::Matches($sf, '(?im)^.*(HDR|wide.?color|ColorMode|dataspace).*$')
  $hdr = @{ estado = 'MEDIDO'; lineas = @($m | ForEach-Object { $_.Value.Trim() } | Select-Object -First 40) }
}

# ── decoders / encoders hardware ─────────────────────────────────────────────
$dec = Sh 'dumpsys media.player'; $codecDump = Sh "grep -c '' /vendor/etc/media_codecs*.xml"
$mediaCodecs = Sh 'ls /vendor/etc/media_codecs*.xml'
$codecList = Sh 'dumpsys media.codec_state'

# ── térmica ──────────────────────────────────────────────────────────────────
$therm = Sh 'dumpsys thermalservice'

# ── audio ────────────────────────────────────────────────────────────────────
$audio = Sh 'dumpsys audio'

# ── lo que el player pidio / decodifico (requiere reproduccion activa) ───────
$metrics = Sh 'dumpsys media.metrics'
$mediaSession = Sh 'dumpsys media_session'
$logcat = & adb -s $script:serial logcat -d -t $LogcatLines 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { $logcat = $null }

# MediaCodec: la linea que dice codec, resolucion y si es HW o SW
$mcLines = @()
if ($logcat) {
  $mcLines = @([regex]::Matches($logcat, '(?im)^.*(MediaCodec|codec|OMX|C2\.|decoder|VideoCapabilities).*$') |
    ForEach-Object { $_.Value.Trim() } | Select-Object -First 200)
}

# frames rendered / dropped, si el player los declara
$frames = @()
if ($logcat) {
  $frames = @([regex]::Matches($logcat, '(?im)^.*(dropped|rendered|frames|skipped).*$') |
    ForEach-Object { $_.Value.Trim() } | Select-Object -First 100)
}

# ── paquetes de player instalados ────────────────────────────────────────────
$pkgs = Sh 'pm list packages'
$players = @()
if ($pkgs) {
  $players = @($pkgs -split "`n" | Where-Object { $_ -match 'ott|tivimate|vlc|kodi|smarters|exo|player|ape\.crystal' } | ForEach-Object { $_.Trim() })
}

# ── volcar el crudo ──────────────────────────────────────────────────────────
$blobs = [ordered]@{
  'getprop.txt' = ($ident.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value.valor)" }) -join "`n"
  'surfaceflinger_hdr.txt' = ($hdr.lineas -join "`n")
  'thermalservice.txt' = $therm
  'audio.txt' = $audio
  'media_metrics.txt' = $metrics
  'media_session.txt' = $mediaSession
  'media_player.txt' = $dec
  'mediacodec_lines.txt' = ($mcLines -join "`n")
  'frames_lines.txt' = ($frames -join "`n")
  'packages.txt' = $pkgs
}
foreach ($k in $blobs.Keys) {
  if ($null -ne $blobs[$k]) { Set-Content -Path (Join-Path $raw $k) -Value $blobs[$k] -Encoding utf8 }
}

function Est($v) { if ($null -eq $v -or "$v".Trim() -eq '') { return @{ estado = 'NO_DISPONIBLE' } } else { return @{ estado = 'MEDIDO'; valor = $v } } }

$receipt = [ordered]@{
  schema         = 'ape.device_measure.v1'
  fecha_utc      = $stamp
  dispositivo    = $Device
  serial         = $script:serial
  solo_lectura   = $true
  identidad      = $ident
  pantalla       = $disp
  hdr_wide_color = $hdr
  termica        = Est $therm
  audio          = Est $audio
  media_metrics  = Est $metrics
  media_session  = Est $mediaSession
  mediacodec     = if ($mcLines.Count -gt 0) { @{ estado = 'MEDIDO'; lineas = $mcLines.Count } } else { @{ estado = 'NO_DISPONIBLE' } }
  frames         = if ($frames.Count -gt 0) { @{ estado = 'MEDIDO'; lineas = $frames.Count } } else { @{ estado = 'NO_DISPONIBLE' } }
  players_instalados = $players
  crudo          = $raw
  nota           = 'Un campo NO_DISPONIBLE significa que el aparato no lo expuso en esta captura, NO que valga cero. Para frames/dropped hace falta reproduccion activa en el momento de medir.'
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$json = Join-Path $OutDir "DEVICE_MEASURE_$stamp.json"
$receipt | ConvertTo-Json -Depth 8 | Set-Content -Path $json -Encoding utf8

Write-Host "== recibo: $json"
Write-Host "== crudo:  $raw"
Write-Host "   identidad: $($ident.model.valor) · $($ident.soc.valor) · Android $($ident.android.valor) (SDK $($ident.sdk.valor))"
Write-Host "   players:   $($players -join ', ')"
Write-Host "   mediacodec lineas: $($mcLines.Count) | frames lineas: $($frames.Count) | termica: $($therm -ne $null)"

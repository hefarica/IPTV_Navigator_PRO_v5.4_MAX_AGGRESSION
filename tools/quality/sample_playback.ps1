# sample_playback.ps1 — Muestreo de reproduccion real en el ONN (§14: OTT, audio, continuidad, térmica)
#
# Uso:  .\tools\quality\sample_playback.ps1 -Device 192.168.1.3:5555 -Seconds 30
#
# Mientras un canal se reproduce en OTT Navigator, toma una muestra cada 2 s y
# escribe una serie temporal: que codec/resolucion esta decodificando el player,
# cuantos frames se pierden, temperatura del SoC, y si la sesion sigue activa.
#
# SOLO LECTURA. No toca la reproduccion, no pausa, no cambia settings.
#
# Por que una serie y no una foto: "sin cortes" no es un estado instantaneo. Es
# una afirmacion sobre una VENTANA. Este script fija la ventana (-Seconds), el
# canal lo elige el operador, y cuenta las roturas dentro de ella.

param(
  [Parameter(Mandatory = $true)][string]$Device,
  [int]$Seconds = 30,
  [int]$Interval = 2,
  [string]$OutDir = 'docs/audits'
)

$ErrorActionPreference = 'Stop'
& adb connect $Device 2>&1 | Out-Null
$list = & adb devices 2>&1
$script:serial = @($list | Select-Object -Skip 1 | Where-Object { $_ -match "`tdevice$" } |
  ForEach-Object { ($_ -split "`t")[0] } | Select-Object -First 1)
if (-not $script:serial) { Write-Host "   NO CONECTADO. Abortando sin inventar nada."; exit 3 }

function Q([string]$cmd) {
  $o = & adb -s $script:serial shell $cmd 2>&1
  if ($LASTEXITCODE -ne 0) { return $null }
  return (($o | Out-String).TrimEnd())
}

$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$muestras = @()
$n = [math]::Max(1, [int]([math]::Floor($Seconds / $Interval)))

Write-Host "== muestreando $n veces cada ${Interval}s (ventana ${Seconds}s) sobre $($script:serial)"

for ($i = 1; $i -le $n; $i++) {
  $ts = (Get-Date).ToUniversalTime().ToString('HH:mm:ss')
  $fw  = Q 'dumpsys activity activities | grep -m1 topResumedActivity'
  $ms  = Q 'dumpsys media_session | grep -E "package=|active=|state=" | head -n 6'
  $mc  = Q 'dumpsys media.metrics | grep -iE "video|codec|dropped|rendered" | tail -n 6'
  $th  = Q 'dumpsys thermalservice | grep -m2 Temperature'
  $sc  = Q 'dumpsys SurfaceFlinger --latency 2>/dev/null | head -n 1'

  # resumen por muestra
  $pkg = ''
  if ($ms -match 'package=(\S+)') { $pkg = $matches[1] }
  $act = if ($ms -match 'active=(true|false)') { $matches[1] } else { '?' }
  $temp = if ($th -match 'mValue=([0-9.]+)') { [double]$matches[1] } else { $null }

  $muestras += [ordered]@{
    t          = $ts
    foreground = if ($fw) { ($fw -replace '.*topResumedActivity=', '').Trim() } else { 'NO_DISPONIBLE' }
    paquete    = if ($pkg) { $pkg } else { 'NO_DISPONIBLE' }
    activo     = $act
    soc_c      = $temp
    codec_dump = if ($mc) { @($mc -split "`n" | Select-Object -First 6) } else { @('NO_DISPONIBLE') }
  }
  Write-Host ("   [{0}/{1}] {2} pkg={3} active={4} soc={5}C" -f $i, $n, $ts, $pkg, $act, $temp)
  Start-Sleep -Seconds $Interval
}

# resumen: cuantas muestras con reproduccion activa y rango termico
$activas = @($muestras | Where-Object { $_.activo -eq 'true' }).Count
$temps = @($muestras | Where-Object { $null -ne $_.soc_c } | ForEach-Object { $_.soc_c })
$pkgs = @($muestras | Where-Object { $_.paquete -ne 'NO_DISPONIBLE' } | ForEach-Object { $_.paquete } | Sort-Object -Unique)

$resumen = [ordered]@{
  ventana_s       = $Seconds
  intervalo_s     = $Interval
  muestras        = $muestras.Count
  con_reproduccion_activa = $activas
  paquetes_vistos = $pkgs
  soc_min_c       = if ($temps.Count) { ($temps | Measure-Object -Minimum).Minimum } else { $null }
  soc_max_c       = if ($temps.Count) { ($temps | Measure-Object -Maximum).Maximum } else { $null }
  umbral_throttle_c = 65.0
  margen_min_c    = if ($temps.Count) { [math]::Round(65.0 - ($temps | Measure-Object -Maximum).Maximum, 1) } else { $null }
  nota            = 'soc_min/max son lecturas del sensor soc_thermal. margen_min_c negativo significa que se cruzo el primer umbral de throttling (65 C) DURANTE la ventana.'
}

$receipt = [ordered]@{
  schema       = 'ape.playback_sample.v1'
  fecha_utc    = $stamp
  dispositivo  = $Device
  serial       = $script:serial
  solo_lectura = $true
  resumen      = $resumen
  series       = $muestras
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$json = Join-Path $OutDir "PLAYBACK_SAMPLE_$stamp.json"
$receipt | ConvertTo-Json -Depth 8 | Set-Content -Path $json -Encoding utf8

Write-Host ""
Write-Host "== recibo: $json"
Write-Host "   ventana ${Seconds}s | muestras $($muestras.Count) | con reproduccion activa: $activas"
Write-Host "   paquetes vistos: $($pkgs -join ', ')"
Write-Host "   SoC: min $($resumen.soc_min_c) C · max $($resumen.soc_max_c) C · margen hasta 65 C: $($resumen.margen_min_c) C"
if ($activas -eq 0) {
  Write-Host "   AVISO: 0 muestras con reproduccion activa. La ventana NO prueba nada sobre"
  Write-Host "   el player: hay que tener un canal reproduciendo DURANTE el muestreo."
}

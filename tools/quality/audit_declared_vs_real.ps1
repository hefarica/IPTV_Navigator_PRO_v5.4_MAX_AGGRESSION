# audit_declared_vs_real.ps1 — §11: contrastar lo DECLARADO en la lista con lo que el proveedor SIRVE
#
# Uso:
#   .\tools\quality\audit_declared_vs_real.ps1 -ListUrl 'https://iptv-ape.duckdns.org/lists/X.m3u8' -MaxChannels 10
#   .\tools\quality\audit_declared_vs_real.ps1 -ListPath '.\mi_lista.m3u8' -MaxChannels 20
#
# Para cada canal: lee `ape-profile` del #EXTINF, pide el manifiesto real de su
# URL, toma el primer segmento y lo sondea con ffprobe. Compara la clase de
# resolucion DECLARADA por el perfil con la MEDIDA en el bitstream.
#
# SOLO LECTURA: GETs a la lista y a los segmentos, y ffprobe. No escribe en el
# VPS, no modifica la lista, no arranca nada.
#
# POR QUE EXISTE: §11 dice "no conviertas la etiqueta comercial 6K/8K en una
# declaracion falsa de salida efectiva". Eso solo se puede comprobar midiendo el
# segmento real, canal por canal. Hecho a mano sobre 3 canales aparecio un "4K"
# que servia 1080p; esto lo hace sobre N.
#
# LECCION INCORPORADA (medida el 2026-11-12): se usa **avg_frame_rate**, NO
# r_frame_rate. Un segmento MPEG-TS aislado hace que ffprobe reporte
# r_frame_rate=125/1 en un canal que en realidad va a 25. Reportar r_frame_rate
# habria producido un hallazgo falso.

param(
  [string]$ListUrl,
  [string]$ListPath,
  [int]$MaxChannels = 10,
  [int]$TimeoutSec = 45,
  [string]$OutDir = 'docs/audits'
)

$ErrorActionPreference = 'Stop'
if (-not $ListUrl -and -not $ListPath) { Write-Host 'ERROR: pasa -ListUrl o -ListPath'; exit 2 }

Add-Type -AssemblyName System.Net.Http
$http = New-Object System.Net.Http.HttpClient
$http.Timeout = [TimeSpan]::FromSeconds($TimeoutSec)
$http.DefaultRequestHeaders.TryAddWithoutValidation('User-Agent', 'OTT Navigator/1.7.3.3') | Out-Null

# ── 1 · leer la lista ────────────────────────────────────────────────────────
if ($ListPath) {
  if (-not (Test-Path $ListPath)) { Write-Host "ERROR: no existe $ListPath"; exit 2 }
  $txt = Get-Content $ListPath -Raw -Encoding utf8
  $origen = $ListPath
} else {
  $bytes = $http.GetByteArrayAsync($ListUrl).Result
  $txt = [System.Text.Encoding]::UTF8.GetString($bytes)
  $origen = $ListUrl
}
$lineas = $txt -split "`r?`n"

# ── 2 · parsear canales. La URL puede estar MUY por debajo (100+ lineas de
#        EXTVLCOPT/EXT-X-APE), asi que se busca hasta el siguiente #EXTINF. ──
$canales = @()
for ($i = 0; $i -lt $lineas.Count; $i++) {
  if ($lineas[$i] -notmatch '^#EXTINF') { continue }
  $nombre = if ($lineas[$i] -match ',(.+)$') { $matches[1].Trim() } else { '(sin nombre)' }
  $perfil = if ($lineas[$i] -match 'ape-profile="([^"]+)"') { $matches[1] } else { $null }
  $url = $null
  for ($k = $i + 1; $k -lt $lineas.Count; $k++) {
    if ($lineas[$k] -match '^#EXTINF') { break }
    if ($lineas[$k] -match '^\s*(https?://\S+)') { $url = $matches[1]; break }
  }
  $canales += [pscustomobject]@{ indice = $canales.Count + 1; nombre = $nombre; perfil = $perfil; url = $url }
}

# ── 3 · perfil declarado -> clase de resolucion esperada (escalera documentada:
#        8K/4320->P0, 4K/UHD/2160->P1, FHD/1080->P3, HD/720->P4, SD/480->P5) ──
$esperado = @{ 'P0' = 4320; 'P0.5' = 2160; 'P1' = 2160; 'P2' = 1440; 'P3' = 1080; 'P4' = 720; 'P5' = 480 }

function Campo($arr, $k) { (($arr | Where-Object { $_ -match "^$k=" } | Select-Object -First 1) -replace "^$k=", '') }

$filas = @()
$analizados = 0
foreach ($ch in $canales) {
  if ($analizados -ge $MaxChannels) { break }
  if (-not $ch.url) {
    $filas += [pscustomobject]@{ canal = $ch.nombre; perfil = $ch.perfil; esperado_px = $null; medido = 'NO_COMPUTADO'; motivo = 'sin URL en el bloque'; cumple = $null }
    continue
  }
  $analizados++
  # [2026-11-12] BUG corregido: antes esto era [ordered]@{} + Add-Member y luego
  # [pscustomobject] — Add-Member sobre un diccionario ordenado NO entra en las
  # claves, asi que al castear se perdian codec/ancho/alto/fps/mbps y la tabla
  # salia vacia. Ahora es una hashtable normal con asignacion directa.
  $res = @{
    indice = $ch.indice; canal = $ch.nombre; perfil = $ch.perfil; url = $ch.url
    esperado_px = $null; medido = 'NO_COMPUTADO'; motivo = ''; cumple = $null
    codec = $null; perfil_real = $null; level = $null
    ancho = $null; alto = $null; fps = $null; mbps = $null
  }

  if ($ch.perfil -and $esperado.ContainsKey($ch.perfil)) { $res.esperado_px = $esperado[$ch.perfil] }

  try {
    $mb = [System.Text.Encoding]::UTF8.GetString($http.GetByteArrayAsync($ch.url).Result)
    $seg = ($mb -split "`r?`n" | Where-Object { $_ -match '^https?://' } | Select-Object -First 1)
    if (-not $seg) { $res.motivo = 'el manifiesto no tiene segmentos'; $filas += [pscustomobject]$res; continue }

    $pr = ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,profile,level,width,height,avg_frame_rate -show_entries format=bit_rate -of default=noprint_wrappers=1 $seg 2>&1
    if ($LASTEXITCODE -ne 0) { $res.motivo = 'ffprobe fallo en el segmento'; $filas += [pscustomobject]$res; continue }

    $res.medido = 'MEDIDO'
    $res.codec = Campo $pr 'codec_name'
    $res.perfil_real = Campo $pr 'profile'
    $res.level = Campo $pr 'level'
    $res.ancho = [int](Campo $pr 'width')
    $res.alto = [int](Campo $pr 'height')
    # avg_frame_rate, NO r_frame_rate (ver nota de cabecera)
    $afr = Campo $pr 'avg_frame_rate'
    if ($afr -match '^(\d+)/(\d+)$' -and [int]$matches[2] -ne 0) { $res.fps = [math]::Round([int]$matches[1] / [int]$matches[2], 3) }
    # [2026-11-12] ffprobe devuelve 'N/A' cuando el segmento no declara bitrate:
    # [int64]'N/A' lanzaba y la fila se quedaba sin veredicto. Se comprueba antes.
    $br = Campo $pr 'bit_rate'
    $brNum = 0L
    if ($br -and [int64]::TryParse(("$br" -replace '\D', ''), [ref]$brNum) -and $brNum -gt 0) { $res.mbps = [math]::Round($brNum / 1e6, 2) }

    if ($null -ne $res.esperado_px -and $res.alto -gt 0) {
      # tolerancia: un perfil declara la clase; medir >= lo esperado es aceptable
      $res.cumple = ($res.alto -ge $res.esperado_px)
      if (-not $res.cumple) { $res.motivo = "declara $($res.esperado_px)p y sirve $($res.alto)p" }
      elseif ($res.alto -gt $res.esperado_px) { $res.motivo = "declara $($res.esperado_px)p y sirve $($res.alto)p (MEJOR de lo declarado)" }
    } else {
      $res.motivo = 'perfil no declarado o desconocido: no hay con que comparar'
    }
  } catch {
    $res.motivo = "EXC: $($_.Exception.Message.Substring(0,[Math]::Min(70,$_.Exception.Message.Length)))"
  }
  $filas += [pscustomobject]$res
}

# ── 4 · informe ─────────────────────────────────────────────────────────────
Write-Host "== declarado vs real · $origen"
Write-Host ("   canales en la lista: {0} · analizados: {1}" -f $canales.Count, $analizados)
Write-Host ""
Write-Host ("   {0,-3} {1,-9} {2,-8} {3,-12} {4,-6} {5,-8} {6}" -f '#', 'perfil', 'medido', 'resolucion', 'fps', 'Mbps', 'veredicto')
foreach ($f in $filas) {
  $verd = if ($null -eq $f.cumple) { if ($f.medido -eq 'MEDIDO') { 'sin perfil' } else { 'NO COMPUTADO' } }
           elseif ($f.cumple) { 'CUMPLE' } else { 'NO CUMPLE' }
  $resol = if ($f.medido -eq 'MEDIDO') { "$($f.ancho)x$($f.alto)" } else { '-' }
  Write-Host ("   {0,-3} {1,-9} {2,-8} {3,-12} {4,-6} {5,-8} {6}  {7}" -f $f.indice, $f.perfil, $f.medido, $resol, $f.fps, $f.mbps, $verd, $f.motivo)
}

$noCumplen = @($filas | Where-Object { $_.cumple -eq $false }).Count
$medidos = @($filas | Where-Object { $_.medido -eq 'MEDIDO' }).Count
Write-Host ""
Write-Host ("   medidos: {0} · NO CUMPLEN: {1}" -f $medidos, $noCumplen)
Write-Host "   NOTA: 'NO CUMPLE' significa que el perfil declara MAS resolucion de la que se sirve."
Write-Host "         Que sirva MAS de lo declarado tambien se marca y se dice, pero no es degradacion."

$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$json = Join-Path $OutDir "DECLARED_VS_REAL_$stamp.json"
[ordered]@{
  schema = 'ape.declared_vs_real.v1'
  fecha_utc = $stamp
  origen = $origen
  canales_en_lista = $canales.Count
  analizados = $analizados
  medidos = $medidos
  no_cumplen = $noCumplen
  nota_frame_rate = 'Se usa avg_frame_rate. r_frame_rate en un segmento MPEG-TS aislado da valores falsos (medido: 125/1 en un canal de 25 fps).'
  filas = $filas
} | ConvertTo-Json -Depth 8 | Set-Content -Path $json -Encoding utf8
Write-Host "== recibo: $json"

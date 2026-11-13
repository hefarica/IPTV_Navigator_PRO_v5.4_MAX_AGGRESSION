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
  # [2026-11-13] §8 pide "parser de streaming para listas grandes". La lista viva
  # pasa de 1 GB: descargarla entera para auditar 10 canales es absurdo. Con
  # -MaxBytes se pide solo la cabeza (Range) y se corta al llegar a N bytes.
  # Queda como muestra declarada del principio del catalogo, no del catalogo.
  [long]$MaxBytes = 30000000,
  # [2026-11-13] Para atacar lo que mas importa: los perfiles que PROMETEN 4K/8K.
  # Con -OnlyProfiles 'P0,P1' la herramienta audita solo esos y reporta cuantos
  # encontro. Sin filtro, audita los primeros N, que en la lista viva son todos P3.
  [string]$OnlyProfiles = '',
  # Offset en bytes para muestrear otra zona de una lista enorme (Range).
  [long]$Offset = 0,
  [string]$OutDir = 'docs/audits'
)

$ErrorActionPreference = 'Stop'
if (-not $ListUrl -and -not $ListPath) { Write-Host 'ERROR: pasa -ListUrl o -ListPath'; exit 2 }

Add-Type -AssemblyName System.Net.Http
$http = New-Object System.Net.Http.HttpClient
$http.Timeout = [TimeSpan]::FromSeconds($TimeoutSec)
$http.DefaultRequestHeaders.TryAddWithoutValidation('User-Agent', 'OTT Navigator/1.7.3.3') | Out-Null

# ── 1 · leer la lista ────────────────────────────────────────────────────────
$truncada = $false
$bytesTotales = 0
if ($ListPath) {
  if (-not (Test-Path $ListPath)) { Write-Host "ERROR: no existe $ListPath"; exit 2 }
  $fi = Get-Item $ListPath
  if ($MaxBytes -gt 0 -and $fi.Length -gt $MaxBytes) {
    # corte por bytes: se leen solo los primeros MaxBytes
    $fs = [System.IO.File]::OpenRead($fi.FullName)
    $buf = New-Object byte[] $MaxBytes
    $leidos = $fs.Read($buf, 0, $MaxBytes)
    $fs.Close()
    $txt = [System.Text.Encoding]::UTF8.GetString($buf, 0, $leidos)
    $bytesTotales = $leidos; $truncada = $true
  } else {
    $txt = Get-Content $ListPath -Raw -Encoding utf8
    $bytesTotales = $fi.Length
  }
  $origen = $ListPath
} else {
  # Range: pedir solo la cabeza en vez de 1 GB
  if ($MaxBytes -gt 0) {
    $req = New-Object System.Net.Http.HttpRequestMessage('GET', $ListUrl)
    $fin = $Offset + $MaxBytes - 1
    $req.Headers.Range = New-Object System.Net.Http.Headers.RangeHeaderValue($Offset, $fin)
    $resp = $http.SendAsync($req).Result
    $codigo = [int]$resp.StatusCode
    $bytes = $resp.Content.ReadAsByteArrayAsync().Result
    $txt = [System.Text.Encoding]::UTF8.GetString($bytes)
    $bytesTotales = $bytes.Length
    $truncada = ($codigo -eq 206)
    $origen = $ListUrl
    Write-Host ("   Range {0}-{1}: HTTP {2} · {3} B {4}" -f $Offset, $fin, $codigo, $bytes.Length, $(if ($codigo -eq 206) { '(respuesta parcial)' } else { '(el servidor ignoro el Range)' }))
  } else {
    $bytes = $http.GetByteArrayAsync($ListUrl).Result
    $txt = [System.Text.Encoding]::UTF8.GetString($bytes)
    $bytesTotales = $bytes.Length
    $origen = $ListUrl
  }
}
# Al cortar por bytes el ultimo canal del bloque queda incompleto: se descarta
# el ultimo tramo si no termina en salto de linea, para no parsear media linea.
if ($truncada) {
  $ultimoNl = $txt.LastIndexOf("`n")
  if ($ultimoNl -gt 0) { $txt = $txt.Substring(0, $ultimoNl) }
}
$lineas = $txt -split "`r?`n"

# ── 2 · parsear canales. La URL puede estar MUY por debajo (100+ lineas de
#        EXTVLCOPT/EXT-X-APE), asi que se busca hasta el siguiente #EXTINF. ──
$canales = @()
for ($i = 0; $i -lt $lineas.Count; $i++) {
  if ($lineas[$i] -notmatch '^#EXTINF') { continue }
  $nombre = if ($lineas[$i] -match ',(.+)$') { $matches[1].Trim() } else { '(sin nombre)' }
  $perfil = if ($lineas[$i] -match 'ape-profile="([^"]+)"') { $matches[1] } else { $null }
  # [2026-11-13] segunda declaracion a verificar: ape-codec-family. Declarar hevc
  # y servir h264 no es cosmetico — un player puede fiarse de la familia declarada.
  $codecDecl = if ($lineas[$i] -match 'ape-codec-family="([^"]+)"') { $matches[1] } else { $null }
  $url = $null
  for ($k = $i + 1; $k -lt $lineas.Count; $k++) {
    if ($lineas[$k] -match '^#EXTINF') { break }
    if ($lineas[$k] -match '^\s*(https?://\S+)') { $url = $matches[1]; break }
  }
  $canales += [pscustomobject]@{ indice = $canales.Count + 1; nombre = $nombre; perfil = $perfil; codec_declarado = $codecDecl; url = $url }
}

# ── 3 · perfil declarado -> clase de resolucion esperada (escalera documentada:
#        8K/4320->P0, 4K/UHD/2160->P1, FHD/1080->P3, HD/720->P4, SD/480->P5) ──
$esperado = @{ 'P0' = 4320; 'P0.5' = 2160; 'P1' = 2160; 'P2' = 1440; 'P3' = 1080; 'P4' = 720; 'P5' = 480 }

# [2026-11-13] CORRECCION IMPORTANTE: clasificar por el ALTO es erroneo para
# contenido anamorfico/scope. Medido en la lista viva: canales "4K" sirviendo
# 3840x1600 (2.40:1) y 3840x2078. Tienen 3840 de ancho: SON 4K, solo que con
# menos alto por el aspect ratio del cine. Comparar solo el alto los marcaba como
# "NO CUMPLE" y habria sido un falso positivo en 4 canales.
# La clase se decide por el LADO MAYOR: 3840 de ancho es 4K aunque el alto sea 1600.
function ClasePx([int]$w, [int]$h) {
  $m = [Math]::Max($w, $h)
  if ($m -ge 7000) { return 4320 }   # 8K (7680 o 4320 de alto en 8K vertical)
  if ($m -ge 3000) { return 2160 }   # 4K / scope 4K
  if ($m -ge 2400) { return 1440 }   # QHD
  if ($m -ge 1700) { return 1080 }   # FHD
  if ($m -ge 1100) { return 720 }    # HD
  return 480                          # SD
}

function Campo($arr, $k) { (($arr | Where-Object { $_ -match "^$k=" } | Select-Object -First 1) -replace "^$k=", '') }

$filas = @()
$analizados = 0
$filtro = @()
if ($OnlyProfiles) { $filtro = @($OnlyProfiles -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
if ($filtro.Count) {
  $canales = @($canales | Where-Object { $_.perfil -and ($filtro -contains $_.perfil) })
  Write-Host ("   filtro -OnlyProfiles '{0}': {1} canales coinciden en el bloque leido" -f $OnlyProfiles, $canales.Count)
}
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
    codec_declarado = $ch.codec_declarado; codec_cumple = $null; codec_motivo = ''
  }

  if ($ch.perfil -and $esperado.ContainsKey($ch.perfil)) { $res.esperado_px = $esperado[$ch.perfil] }

  try {
    $bytesMb = $http.GetByteArrayAsync($ch.url).Result
    # [2026-11-13] BUG corregido: si la respuesta venia nula o vacia,
    # [Encoding]::UTF8.GetString($null) lanzaba "Value cannot be null" y el canal
    # quedaba NO_COMPUTADO con un mensaje de excepcion en vez del motivo real.
    # En la lista viva de produccion paso con 1 de 6 canales.
    if ($null -eq $bytesMb -or $bytesMb.Length -eq 0) { $res.motivo = 'el manifiesto del canal vino vacio'; $filas += [pscustomobject]$res; continue }
    $mb = [System.Text.Encoding]::UTF8.GetString($bytesMb)
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
      # [2026-11-13] se compara la CLASE por lado mayor, no el alto en bruto:
      # 3840x1600 es 4K scope y cumple un perfil 4K.
      $claseReal = ClasePx $res.ancho $res.alto
      $res | Add-Member -NotePropertyName clase_px -NotePropertyValue $claseReal -Force
      $res.cumple = ($claseReal -ge $res.esperado_px)
      if (-not $res.cumple) { $res.motivo = "declara $($res.esperado_px)p y sirve $($res.ancho)x$($res.alto) (clase $($claseReal)p)" }
      elseif ($claseReal -gt $res.esperado_px) { $res.motivo = "declara $($res.esperado_px)p y sirve $($res.ancho)x$($res.alto) (MEJOR de lo declarado)" }
      else { $res.motivo = "declara $($res.esperado_px)p y sirve $($res.ancho)x$($res.alto)" }
    } else {
      $res.motivo = 'perfil no declarado o desconocido: no hay con que comparar'
    }

    # ── segunda verificacion: familia de codec declarada vs real ──
    if ($res.codec_declarado) {
      $decl = $res.codec_declarado.ToLower()
      $real = "$($res.codec)".ToLower()
      $familiaReal = switch -Regex ($real) {
        '^h264|^avc' { 'h264' }
        '^hevc|^h265' { 'hevc' }
        '^av1' { 'av1' }
        '^vp9' { 'vp9' }
        default { $real }
      }
      # la declaracion puede ser una lista ("hevc,av1,h264"): basta con que
      # incluya la familia real para ser honesta
      $partes = @($decl -split '[,/ ]+' | Where-Object { $_ })
      $res.codec_cumple = ($partes -contains $familiaReal)
      if (-not $res.codec_cumple) {
        $res.codec_motivo = "declara '$($res.codec_declarado)' y sirve $familiaReal"
      } elseif ($partes.Count -gt 1) {
        $res.codec_motivo = "declara '$($res.codec_declarado)' (lista; incluye $familiaReal)"
      }
    } else {
      $res.codec_motivo = 'sin ape-codec-family declarado'
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
Write-Host ("   {0,-3} {1,-7} {2,-12} {3,-11} {4,-5} {5,-7} {6,-12} {7}" -f '#', 'perfil', 'medido', 'resolucion', 'fps', 'Mbps', 'veredicto', 'canal')
foreach ($f in $filas) {
  $verd = if ($null -eq $f.cumple) { if ($f.medido -eq 'MEDIDO') { 'sin perfil' } else { 'NO COMPUTADO' } }
           elseif ($f.cumple) { 'CUMPLE' } else { 'NO CUMPLE' }
  $resol = if ($f.medido -eq 'MEDIDO') { "$($f.ancho)x$($f.alto)" } else { '-' }
  # [2026-11-13] el nombre del canal es lo que hace accionable el hallazgo: sin
  # el, "el canal 3 falla" no sirve para ir a arreglarlo.
  $nom = if ($f.canal) { $f.canal.Substring(0, [Math]::Min(38, $f.canal.Length)) } else { '?' }
  Write-Host ("   {0,-3} {1,-7} {2,-12} {3,-11} {4,-5} {5,-7} {6,-12} {7}" -f $f.indice, $f.perfil, $f.medido, $resol, $f.fps, $f.mbps, $verd, $nom)
  if ($f.motivo) { Write-Host ("       -> {0}" -f $f.motivo) }
  if ($f.codec_cumple -eq $false) { Write-Host ("       -> CODEC: {0}" -f $f.codec_motivo) }
}

$noCumplen = @($filas | Where-Object { $_.cumple -eq $false }).Count
$medidos = @($filas | Where-Object { $_.medido -eq 'MEDIDO' }).Count
$codecMal = @($filas | Where-Object { $_.codec_cumple -eq $false }).Count
Write-Host ""
Write-Host ("   medidos: {0} · NO CUMPLEN resolucion: {1} · NO CUMPLEN codec: {2}" -f $medidos, $noCumplen, $codecMal)
Write-Host "   NOTA: 'NO CUMPLE' significa que el perfil declara MAS resolucion de la que se sirve."
Write-Host "         Que sirva MAS de lo declarado tambien se marca y se dice, pero no es degradacion."
Write-Host "         La clase de resolucion se decide por el LADO MAYOR: 3840x1600 es 4K scope y CUMPLE."

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

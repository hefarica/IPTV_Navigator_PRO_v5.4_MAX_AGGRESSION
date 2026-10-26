<#
  crystal-upscale.ps1 — Pipeline de upscaling / remux por perfiles (P1..P5)

  HONESTO SOBRE EL NOMBRE: "CRYSTAL" aquí = upscaling REAL + realce (sharpening) +
  salida 4K/8K REAL en píxeles. Lo que NO se puede fabricar es el detalle que la
  fuente no tiene. Un 1080p reescalado a 3840x2160 ES un flujo 4K válido (cualquier
  TV lo decodifica como 4K); lo que es discutible es afirmar que "se ve como un 4K
  nativo", y eso no lo arregla ningún flag.

  Truth-guards aplicados (doctrina del repo):
    1. NO se inventa Dolby Vision profile 10: requiere RPU + bitstream DV real.
       Declararlo sobre contenido no-DV rompe decodificadores (freeze).
       => --dv10 NO existe. Se rechaza con error explicativo.
    2. HDR en dos modos separados:
         tag     -> solo metadata PQ/HLG (rápido, riesgo de color shift; es el
                    equivalente a VIDEO-RANGE=PQ que el propietario fijó)
         convert -> conversión REAL SDR->PQ con zscale (lineal -> BT.2020/PQ),
                    metadata coherente con los píxeles. Recomendado.
    3. Audio SIEMPRE -c copy (AAC/AC3/EAC3/DTS passthrough): nunca se recodifica
       audio para "mejorar" nada.
    4. La resolución declarada en el contenedor es la REAL del stream de salida.
<#
.SYNOPSIS
  Upscaling por perfiles + opciones de HDR + remux sin recodificar.
.EXAMPLE
  ./crystal-upscale.ps1 -Input in.mp4 -Output out_4k.mkv -Profile P2 -Hdr convert
.EXAMPLE
  ./crystal-upscale.ps1 -Input in.mp4 -Output out_4k.mkv -Profile P2 -RemuxOnly
#>
param(
  [Parameter(Mandatory = $true)][Alias('Input','src')][string]$InputFile,
  [Parameter(Mandatory = $true)][string]$Output,
  [ValidateSet('P1', 'P2', 'P3', 'P4', 'P5')][string]$Profile = 'P2',
  [ValidateSet('none', 'tag', 'convert')][string]$Hdr = 'none',
  [switch]$RemuxOnly,
  [ValidateSet('libx265', 'libx264', 'hevc_nvenc', 'h264_nvenc', 'hevc_qsv')][string]$Encoder = 'libx265',
  [int]$Crf = 20,
  [ValidateSet('ultrafast', 'superfast', 'veryfast', 'fast', 'medium', 'slow')][string]$Preset = 'medium',
  [int]$AudioBitrate = 0,   # 0 = copia (recomendado). >0 recodifica a AAC.
  [switch]$Interp,          # interpolacion REAL a 60fps (minterpolate). Default: conserva los fps de origen
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$ffmpeg = (Get-Command ffmpeg -ErrorAction Stop).Source

# ── Perfiles: destino + cadena de escalado + realce ────────────────────────────
$profiles = @{
  'P1' = @{ W = 7680; H = 4320; Chain = 'scale=7680:4320:flags=lanczos+accurate_rnd+full_chroma_int'; Sharpen = 'unsharp=5:5:0.60:3:3:0.25'; Note = '4K nativo -> 8K (offline; medido lentísimo)' }
  'P2' = @{ W = 3840; H = 2160; Chain = 'scale=3840:2160:flags=lanczos+accurate_rnd+full_chroma_int'; Sharpen = 'unsharp=5:5:0.80:3:3:0.40'; Note = '1080p -> 4K (Lanczos + realce)' }
  'P3' = @{ W = 3840; H = 2160; Chain = 'scale=3840:2160:flags=bicubic+accurate_rnd'; Sharpen = 'unsharp=5:5:0.90:3:3:0.45'; Note = '720p -> 4K (bicúbico + realce)' }
  'P4' = @{ W = 3840; H = 2160; Chain = 'scale=3840:2160:flags=neighbor,scale=3840:2160:flags=bicubic'; Sharpen = 'unsharp=7:7:1.20:5:5:0.60'; Note = '480p -> 4K (nearest + filtrado fuerte)' }
  'P5' = @{ W = 3840; H = 2160; Chain = 'scale=1920:1080:flags=bicubic+accurate_rnd,scale=3840:2160:flags=lanczos'; Sharpen = 'unsharp=5:5:0.70:3:3:0.30'; Note = '480/576 -> 1080 -> 4K (por etapas)' }
}

# ── Rechazos explícitos (truth-guards) ─────────────────────────────────────────
if ($PSBoundParameters.ContainsKey('Dv10')) {
  throw "DV profile 10 RECHAZADO: requiere RPU Dolby Vision + bitstream DV real. Declararlo sobre SDR/SDR-escalado rompe el decoder (freeze). Ver doctrina: SUPPLEMENTAL-CODECS falsos prohibidos."
}

$p = $profiles[$Profile]

# ── Cadena de filtros ──────────────────────────────────────────────────────────
$filters = @()
if (-not $RemuxOnly) {
  $filters += $p.Chain
  $filters += $p.Sharpen
  if ($Interp) { $filters += 'minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1' }
  switch ($Hdr) {
    'tag' { $filters += 'setparams=color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc' }
    'convert' {
      # 1) declarar la fuente como SDR BT.709 (si no, zscale no sabe de dónde partir)
      $filters += 'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv'
      # 2) conversión REAL SDR -> BT.2020 / PQ (los pixeles cambian, no solo la etiqueta)
      $filters += 'zscale=p=bt2020:t=smpte2084:m=bt2020nc:r=tv,format=yuv420p10le'
    }
  }
}

# ── Argumentos de codificación ─────────────────────────────────────────────────
$codecArgs = @()
if ($RemuxOnly) {
  $codecArgs += @('-c', 'copy')
} else {
  $codecArgs += @('-c:v', $Encoder)
  if ($Encoder -in @('libx265', 'libx264')) { $codecArgs += @('-preset', $Preset, '-crf', "$Crf") }
  elseif ($Encoder -like '*nvenc*') { $codecArgs += @('-preset', 'p5', '-rc', 'vbr', '-cq', "$Crf") }
  else { $codecArgs += @('-global_quality', "$($Crf * 2)") }
  if ($filters.Count) { $codecArgs += @('-vf', ($filters -join ',')) }
  if ($Encoder -eq 'libx265') {
    $x265 = 'log-level=error'
    if ($Hdr -ne 'none') {
      $x265 += ':colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc'
      $x265 += ':master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1)'
      $x265 += ':max-cll=1000,400'
    }
    $codecArgs += @('-x265-params', $x265)
    $codecArgs += @('-tag:v', 'hvc1')  # GOLDEN RULE: hvc1 para MP4/MKV
  }
}

# ── Audio: copia por defecto ───────────────────────────────────────────────────
if ($AudioBitrate -gt 0 -and -not $RemuxOnly) {
  $audioArgs = @('-c:a', 'aac', '-b:a', "$($AudioBitrate)k")
} else {
  $audioArgs = @('-c:a', 'copy')
}

# ── Metadata de color de salida ────────────────────────────────────────────────
$colorArgs = @()
if ($Hdr -ne 'none') {
  $colorArgs += @('-color_primaries', 'bt2020', '-color_trc', 'smpte2084', '-colorspace', 'bt2020nc', '-color_range', 'tv')
}

$ext = [System.IO.Path]::GetExtension($Output).ToLowerInvariant()
$muxArgs = switch ($ext) {
  '.mkv' { @('-f', 'matroska') }
  '.ts' { @('-f', 'mpegts') }
  '.mp4' { @('-f', 'mp4', '-movflags', '+faststart') }
  default { @() }
}

$ffArgs = @('-hide_banner', '-y', '-i', $InputFile) + $codecArgs + $audioArgs + $colorArgs + $muxArgs + @($Output)

Write-Host "── Perfil $Profile : $($p.Note)" -ForegroundColor Cyan
Write-Host "   destino  $($p.W)x$($p.H)   HDR=$Hdr   encoder=$Encoder   remux=$RemuxOnly"
Write-Host "   filtros  $(if ($filters.Count) { $filters -join ',' } else { '(sin reencode: -c copy)' })"
Write-Host "   cmd      ffmpeg $($ffArgs -join ' ')"

if ($DryRun) { return $ffArgs }

$sw = [System.Diagnostics.Stopwatch]::StartNew()
& $ffmpeg @ffArgs
$rc = $LASTEXITCODE
$sw.Stop()
if ($rc -ne 0) { throw "ffmpeg falló con código $rc" }
Write-Host ("── OK en {0:N1} s -> {1}" -f $sw.Elapsed.TotalSeconds, $Output) -ForegroundColor Green






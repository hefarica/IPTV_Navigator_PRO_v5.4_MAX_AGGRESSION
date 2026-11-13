<#
  pipeline_lint.ps1 — Linter de estado SUCIO del pipeline de video. SOLO LECTURA.

  QUE ES
  ======
  Lee el aparato por adb y decide si el pipeline de video esta LIMPIO o SUCIO, nombrando
  cada anomalia con el dato medido que la sostiene. No cambia NADA: no escribe settings,
  no toca el display, no reinicia nada. Es un linter, no un reparador.

  POR QUE EXISTE
  ==============
  Los artefactos llegaban al operador antes de que nadie los midiera. Esta herramienta los
  detecta en el estado del sistema, antes de que el ojo los tenga que sufrir.

  LAS SEIS COMPROBACIONES, y de donde sale cada dato:

  1. COLOR INCOHERENTE          dumpsys media.metrics
     Un stream 720p debe ser BT.709 en estandar Y en transferencia. Medido en el ONN:
       config-color-standard = 1 (BT.709)
       config-color-transfer = 3 (SMPTE 170M = BT.601)   <- no coincide
     Esa mezcla desplaza los colores. Es la firma del verde enfermizo.

  2. DOBLE ESCALADO             SurfaceFlinger + dumpsys display
     Si videoH < composicionH < panelH, el video se interpola DOS veces y la primera
     puede no ser entera. Medido: 720 -> 1080 (x1.5, NO entero) -> 2160 (x2).

  3. JUDDER POR MENTIRA DE CADENCIA     media.metrics
     content vs actual. Cuando el stream declara una cadencia que no entrega, judder alto.
     Medido: content 29.41 / actual 24.99 -> judder 0.9887 (mentira).
             content 29.99 / actual 29.97 -> judder 0.0193 (honesto).

  4. FOTOGRAMAS PERDIDOS        media.metrics
     frames-dropped / frames-rendered.

  5. GEOMETRIA DE PANTALLA SUELTA       wm size / wm density / settings
     Overrides de tamano o densidad, y claves persistentes. Un override de densidad es
     SIEMPRE sospechoso: fue lo que dejo la interfaz gigante el 2026-11-13.

  6. DECLARADO vs REAL          media.metrics
     El codec dice la resolucion que de verdad se decodifica. Si el nombre del canal dice
     4K y el codec dice 1280x720, el nombre miente.

  USO
  ===
    powershell -File tools/probe/pipeline_lint.ps1
    powershell -File tools/probe/pipeline_lint.ps1 -Json          # reporte JSON
    powershell -File tools/probe/pipeline_lint.ps1 -Serial 192.168.1.3:34813

  EXIT: 0 = LIMPIO · 1 = SUCIO (hay anomalias) · 2 = no conectado o sin sesion de video

  LIMITE HONESTO
  ==============
  Si no hay video reproduciendose, las comprobaciones 1, 2, 3, 4 y 6 no tienen sujeto y se
  reportan como NO_COMPUTADO. Un no computado NO es un limpio.
#>

param(
    [string]$Serial = '192.168.1.3:34813',
    [switch]$Json
)

$ErrorActionPreference = 'Continue'

function Dev([string]$cmd) {
    $r = & adb -s $Serial shell $cmd 2>&1
    return (($r | ForEach-Object { $_.ToString() }) -join "`n").Trim()
}

function Campo([string]$texto, [string]$clave) {
    if ($texto -match ([regex]::Escape($clave) + '=([-0-9.eE+]+)')) { return $matches[1] }
    return $null
}

$hallazgos = New-Object System.Collections.ArrayList
function Add-Hallazgo([string]$tipo, [string]$severidad, [string]$detalle, $medido) {
    [void]$hallazgos.Add([pscustomobject]@{ tipo = $tipo; severidad = $severidad; detalle = $detalle; medido = $medido })
}

$estado = (& adb -s $Serial get-state 2>&1) -join ''
if ($estado -notmatch 'device') {
    Write-Output "NO CONECTADO: adb no ve $Serial"
    exit 2
}

# ── Lectura unica de las tres fuentes ────────────────────────────────────────
$metrics = Dev 'dumpsys media.metrics 2>/dev/null | grep "{codec," | grep "mode=video" | tail -n 1'
$sfDump  = Dev 'dumpsys SurfaceFlinger 2>/dev/null'
$wmSize  = Dev 'wm size'
$wmDens  = Dev 'wm density'
$dispInfo= Dev 'dumpsys display 2>/dev/null | grep -m1 "mBaseDisplayInfo"'
$frames  = Dev 'dumpsys window displays 2>/dev/null | grep -m1 DisplayFrames'

$hayVideo = ($metrics -ne '' -and $metrics -match 'width=\d+')

# ── CUENTAS de geometria ─────────────────────────────────────────────────────
$videoW = $null; $videoH = $null; $compW = $null; $compH = $null; $panelW = $null; $panelH = $null
if ($hayVideo) {
    $videoW = [int](Campo $metrics 'android.media.mediacodec.width')
    $videoH = [int](Campo $metrics 'android.media.mediacodec.height')
}
if ($frames -match 'w=(\d+) h=(\d+)') { $compW = [int]$matches[1]; $compH = [int]$matches[2] }
if ($dispInfo -match 'real (\d+) x (\d+)') { $panelW = [int]$matches[1]; $panelH = [int]$matches[2] }

# La capa de video de SurfaceFlinger: buffer real y factor de escala aplicado
$layerBuf = $null; $layerScale = $null
$lineasSF = $sfDump -split "`n"
for ($i = 0; $i -lt $lineasSF.Count; $i++) {
    if ($lineasSF[$i] -match '\(BLAST\)' -and $lineasSF[$i] -match 'SurfaceView') {
        $bloque = $lineasSF[$i..([Math]::Min($i + 18, $lineasSF.Count - 1))]
        $buf = ($bloque | Where-Object { $_ -match 'geomBufferSize' } | Select-Object -First 1)
        if ($buf -and $buf -notmatch '\[0 0 -1 -1\]') {
            if ($buf -match '\[\s*0\s+0\s+(\d+)\s+(\d+)\]') { $layerBuf = "$($matches[1])x$($matches[2])" }
            $tr = ($bloque | Where-Object { $_ -match 'SCALE' } | Select-Object -First 1)
            if ($tr -and $tr -match '(SCALE|IDENTITY)') { $layerScale = $matches[1] }
            # el factor numerico esta en las lineas siguientes a SCALE
            if ($tr -and $tr -match 'SCALE') {
                for ($k = 1; $k -le 3; $k++) {
                    $sig = $bloque | Where-Object { $_ -match '^\s+[0-9]+\.[0-9]+\s+[0-9]+\.[0-9]+' } | Select-Object -First 1
                    if ($sig -match '^\s+([0-9]+\.[0-9]+)') { $layerScale = "SCALE $($matches[1])"; break }
                }
            }
            break
        }
    }
}

# ── 1 · COLOR INCOHERENTE ────────────────────────────────────────────────────
if ($hayVideo) {
    $std = Campo $metrics 'config-color-standard'
    $trf = Campo $metrics 'config-color-transfer'
    $rng = Campo $metrics 'config-color-range'
    # 1=BT709 2=BT601-625 3=SMPTE170M 4=BT2020 ; transfer: 1=BT709 3=SMPTE170M 6=BT2020-10 16=PQ 18=HLG
    if ($null -ne $std -and $null -ne $trf) {
        $stdN = [int][double]$std; $trfN = [int][double]$trf
        $stdApto = ($stdN -eq 1 -or $stdN -eq 4)
        $trfApto = ($trfN -eq 1 -or $trfN -eq 6 -or $trfN -eq 16 -or $trfN -eq 18)
        if ($stdApto -and -not $trfApto) {
            Add-Hallazgo 'COLOR_SPACE_MISMATCH' 'ALTA' `
                "estandar BT.709/BT.2020 con transferencia BT.601 ($trfN). Mezcla de matriz y curva: desplaza los colores (verde enfermizo, negros aplastados). Es del STREAM, no del aparato." `
                ([pscustomobject]@{ standard = $stdN; transfer = $trfN; range = $rng })
        }
        if ($rng -eq '2' -and $stdN -eq 1) {
            Add-Hallazgo 'RANGE_FULL_EN_BT709' 'MEDIA' `
                "color-range=2 (full/JPEG) sobre BT.709. Contenido de estudio suele ser limited (16-235); declararlo full recorta los extremos." `
                ([pscustomobject]@{ range = 2; standard = 1 })
        }
    }
}

# ── 2 · DOBLE ESCALADO ───────────────────────────────────────────────────────
if ($videoH -and $compH -and $panelH) {
    if ($videoH -lt $compH -and $compH -lt $panelH) {
        $r1 = [math]::Round($compH / $videoH, 3)
        $r2 = [math]::Round($panelH / $compH, 3)
        $entero = ([math]::Abs($r1 - [math]::Round($r1)) -lt 1e-4)
        Add-Hallazgo 'DOBLE_ESCALADO' 'ALTA' `
            ("video ${videoH}p -> composicion ${compH}p (x$r1) -> panel ${panelH}p (x$r2). " +
             $(if ($entero) { "El primer factor es entero." } else { "El primer factor NO es entero: interpola mezclando vecinos." }) +
             " Una sola interpolacion entera seria mejor.") `
            ([pscustomobject]@{ video_h = $videoH; comp_h = $compH; panel_h = $panelH; factor1 = $r1; factor2 = $r2; factor1_entero = $entero })
    }
}

# ── 3 · JUDDER POR MENTIRA DE CADENCIA ──────────────────────────────────────
if ($hayVideo) {
    $fc = Campo $metrics 'android.media.mediacodec.framerate-content'
    $fa = Campo $metrics 'android.media.mediacodec.framerate-actual'
    $jd = Campo $metrics 'android.media.mediacodec.judder-rate'
    if ($null -ne $fc -and $null -ne $fa -and [double]$fc -gt 0 -and [double]$fa -gt 0) {
        $rel = [math]::Abs([double]$fc - [double]$fa) / [double]$fc
        if ($rel -gt 0.01) {
            Add-Hallazgo 'CADENCIA_DECLARADA_FALSA' 'ALTA' `
                ("el stream declara {0:N2} fps y entrega {1:N2} fps (desvio {2:P1}). judder medido: {3}. Es del STREAM, no del panel." -f [double]$fc, [double]$fa, $rel, $jd) `
                ([pscustomobject]@{ content = [double]$fc; actual = [double]$fa; desvio_rel = $rel; judder = $jd })
        } elseif ($null -ne $jd -and [double]$jd -gt 0.10) {
            Add-Hallazgo 'JUDDER_ALTO_CON_CADENCIA_HONESTA' 'MEDIA' `
                ("content y actual coinciden ({0:N2} vs {1:N2}) pero el judder es {2}. Hay una variable no explicada: se reporta sin inventar causa." -f [double]$fc, [double]$fa, $jd) `
                ([pscustomobject]@{ content = [double]$fc; actual = [double]$fa; judder = $jd })
        }
    }
}

# ── 4 · FOTOGRAMAS PERDIDOS ─────────────────────────────────────────────────
if ($hayVideo) {
    $dropped = Campo $metrics 'android.media.mediacodec.frames-dropped'
    $rendered = Campo $metrics 'android.media.mediacodec.frames-rendered'
    if ($null -ne $dropped -and $null -ne $rendered -and [int][double]$rendered -gt 0) {
        $pct = [double][double]$dropped / [double][double]$rendered * 100
        if ($pct -gt 0.5) {
            Add-Hallazgo 'FOTOGRAMAS_PERDIDOS' 'MEDIA' `
                ("{0} de {1} fotogramas perdidos ({2:N2}%)." -f $dropped, $rendered, $pct) `
                ([pscustomobject]@{ dropped = $dropped; rendered = $rendered; pct = $pct })
        }
    }
}

# ── 5 · GEOMETRIA DE PANTALLA SUELTA ────────────────────────────────────────
if ($wmDens -match 'Override density:\s*(\d+)') {
    Add-Hallazgo 'OVERRIDE_DENSIDAD' 'ALTA' `
        ("override de densidad en {0} sobre la fisica. Esto es lo que agranda o encoge TODA la interfaz. El 2026-11-13 dejo la pantalla gigante." -f $matches[1]) `
        ([pscustomobject]@{ override = [int]$matches[1] })
}
$sfSize = Dev 'settings get global display_size_forced'
$sfDens = Dev 'settings get secure display_density_forced'
if ($sfSize -ne '' -and $sfSize -ne 'null') {
    $nivel = if ($sfSize -match '^(\d+),(\d+)$') { 'MEDIA' } else { 'MEDIA' }
    Add-Hallazgo 'SIZE_FORCED_PERSISTENTE' $nivel `
        "display_size_forced='$sfSize' (persiste a reinicios; cambia la composicion de todo el sistema)." `
        ([pscustomobject]@{ valor = $sfSize })
}
if ($sfDens -ne '' -and $sfDens -ne 'null') {
    Add-Hallazgo 'DENSITY_FORCED_PERSISTENTE' 'ALTA' `
        "display_density_forced='$sfDens' (persiste a reinicios)." `
        ([pscustomobject]@{ valor = $sfDens })
}

# ── 6 · DECLARADO vs REAL ───────────────────────────────────────────────────
if ($videoW -and $videoH) {
    if ($videoW -lt 3840 -and $videoH -le 720) {
        Add-Hallazgo 'FUENTE_PEQUENA' 'ALTA' `
            ("el decodificador trabaja en {0}x{1}. Cualquier etiqueta 4K/UHD/6K sobre este canal es una DECLARACION, no la fuente. 720p escalado no gana detalle." -f $videoW, $videoH) `
            ([pscustomobject]@{ width = $videoW; height = $videoH })
    }
}

# ── SALIDA ──────────────────────────────────────────────────────────────────
$limpio = ($hallazgos.Count -eq 0)
$estadoTexto = if (-not $hayVideo) { 'NO_COMPUTADO' } elseif ($limpio) { 'LIMPIO' } else { 'SUCIO' }

if ($Json) {
    $rep = [pscustomobject]@{
        schema = 'ape.pipeline-lint.v1'
        timestamp = (Get-Date).ToString('o')
        dispositivo = $Serial
        estado = $estadoTexto
        hay_sesion_de_video = $hayVideo
        geometria = [pscustomobject]@{
            video = if ($hayVideo) { "$videoW×$videoH" } else { $null }
            composicion = if ($compW) { "$compW×$compH" } else { $null }
            panel = if ($panelW) { "$panelW×$panelH" } else { $null }
            capa_surfaceflinger_buffer = $layerBuf
            capa_surfaceflinger_transform = $layerScale
        }
        hallazgos = $hallazgos
        no_computado = if ($hayVideo) { @() } else { @('color', 'doble_escalado', 'judder', 'fotogramas_perdidos', 'declarado_vs_real') }
        nota = 'Linter de solo lectura. No cambia nada. NO_COMPUTADO no es LIMPIO: sin video reproduciendose esas comprobaciones no tienen sujeto.'
    }
    $rep | ConvertTo-Json -Depth 6
} else {
    Write-Output ""
    Write-Output "=== PIPELINE LINT — $Serial ==="
    Write-Output ("  estado: {0}" -f $estadoTexto)
    Write-Output ("  video {0} · composicion {1} · panel {2}" -f $(if($hayVideo){"${videoW}x${videoH}"}else{'—'}), $(if($compW){"${compW}x${compH}"}else{'—'}), $(if($panelW){"${panelW}x${panelH}"}else{'—'}))
    if ($layerBuf) { Write-Output ("  capa SurfaceFlinger: buffer {0} · transform {1}" -f $layerBuf, $layerScale) }
    Write-Output ""
    if (-not $hayVideo) {
        Write-Output "  NO_COMPUTADO: no hay sesion de video. Pon un canal y repite."
        Write-Output "  (las comprobaciones 1,2,3,4 y 6 necesitan un video reproduciendose)"
    } elseif ($limpio) {
        Write-Output "  LIMPIO: ninguna anomalia detectable en el estado del sistema."
    } else {
        foreach ($h in $hallazgos) {
            Write-Output ("  [{0}] {1}" -f $h.severidad, $h.tipo)
            Write-Output ("         {0}" -f $h.detalle)
        }
    }
    Write-Output ""
}

if (-not $hayVideo) { exit 2 }
exit $(if ($limpio) { 0 } else { 1 })

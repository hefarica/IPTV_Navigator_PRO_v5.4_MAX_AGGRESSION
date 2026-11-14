<#
.SYNOPSIS
    Vigilante del dispositivo: ejecuta ape-device-truth.sh por adb, guarda la
    verdad medida y AVISA cuando el veredicto no es OK.

.DESCRIPTION
    Existe porque el operador lo dijo asi:
      "una vive convencido que el sistema esta funcionando correctamente cuando
       esta a medias o se caen de manera inadvertida los servicios"

    El watchdog que trae la propia APK solo hace `poll pkg`: comprueba que el
    PAQUETE este instalado, nunca que el proxy escuche ni que el HDR sea real.
    Este runner no confia en ninguna leyenda del panel: llama al script que mide
    las fuentes primarias del sistema (SurfaceFlinger, /proc/net, wm, settings,
    logcat) y decide por lo que encuentra.

    QUE DEJA EN DISCO
      artifacts/device-truth/device-truth.log     una linea por ejecucion (JSON)
      artifacts/device-truth/LATEST.json          el ultimo resultado
      artifacts/device-truth/ALERTA.txt           existe SOLO si el veredicto no
                                                  es OK; se borra cuando vuelve
      artifacts/device-truth/incidentes.log       una linea por cambio de estado

    COMO AVISA
      - El archivo ALERTA.txt (visible, persistente, sobrevive a reinicios).
      - Exit code != 0, para que el Programador de tareas lo marque en rojo.
      - Opcional: POST al VPS si se pasa -VpsUrl (nunca bloquea; fail-open).

.PARAMETER Device
    Serial de adb. Por defecto 192.168.1.3:5555.

.PARAMETER Json
    Devuelve el JSON por la salida estandar en vez del resumen legible.

.PARAMETER VpsUrl
    Endpoint opcional para reportar (p.ej. https://iptv-ape.duckdns.org/prisma/api/qoe-flush.php).
    Si falla, se registra y se sigue: el vigilante nunca se cae por no poder avisar.

.EXAMPLE
    .\ape-device-watchdog.ps1
    .\ape-device-watchdog.ps1 -Json
#>
[CmdletBinding()]
param(
    [string]$Device = '192.168.1.3:5555',
    [switch]$Json,
    [string]$VpsUrl = '',
    [string]$Adb = 'adb'
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $repo) { $repo = (Get-Location).Path }
$outDir = Join-Path $repo 'artifacts\device-truth'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

$logPath   = Join-Path $outDir 'device-truth.log'
$latest    = Join-Path $outDir 'LATEST.json'
$alertPath = Join-Path $outDir 'ALERTA.txt'
$incPath   = Join-Path $outDir 'incidentes.log'
$scriptDev = '/data/local/tmp/ape-device-truth.sh'
$srcScript = Join-Path $repo 'tools\ops\ape-device-truth.sh'
$stamp     = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

function Write-Line($p, $t) { Add-Content -Path $p -Value $t -Encoding UTF8 }

# ── 1. El dispositivo responde? Sin esto no hay medida: se declara, no se finge.
$conn = (& $Adb -s $Device shell 'echo ADB-OK' 2>&1) -join ' '
if ($conn -notmatch 'ADB-OK') {
    $motivo = "SIN_CONEXION: adb no responde en $Device ($($conn.Trim()))"
    $registro = [ordered]@{
        ts = $stamp; verdict = 'SIN_CONEXION'; reason = $motivo
        device = $Device; measured = $false
    }
    $j = $registro | ConvertTo-Json -Compress
    Write-Line $logPath $j
    Set-Content -Path $latest -Value $j -Encoding UTF8
    $cuerpoA = @"
ALERTA — $stamp
VEREDICTO: SIN_CONEXION
MOTIVO   : $motivo

Esto NO significa que el sistema este bien: significa que NO SE PUDO MEDIR.
Un dispositivo inalcanzable no es un dispositivo sano.
"@
    Write-Line $incPath "$stamp SIN_CONEXION $motivo"
    if ($Json) { $j } else { Write-Output "SIN_CONEXION · $motivo" }
    exit 3
}

# ── 2. Subir el script si cambio (idempotente: compara sha256)
$needsPush = $true
if (Test-Path $srcScript) {
    # Convertir a texto primero y luego a bytes: hacer -replace sobre el resultado
    # de ReadAllBytes devuelve un ARRAY de bytes convertidos a string y ToBase64String
    # acaba interpretando el segundo argumento como Base64FormattingOptions.
    $texto = [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($srcScript)) -replace "`r`n", "`n"
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($texto))
    $remoteSha = (& $Adb -s $Device shell "sha256sum $scriptDev 2>/dev/null | cut -d' ' -f1" 2>&1) -join ''
    $localSha  = (Get-FileHash $srcScript -Algorithm SHA256).Hash.ToLower()
    if ($remoteSha.Trim() -eq $localSha) {
        $needsPush = $false
    } else {
        & $Adb -s $Device shell "printf %s '$b64' | base64 -d > $scriptDev && chmod 755 $scriptDev" 2>&1 | Out-Null
    }
} else {
    Write-Output "AVISO: no encuentro $srcScript — uso el del dispositivo si ya esta"
}

# ── 3. Medir
$raw = (& $Adb -s $Device shell "sh $scriptDev --json 2>/dev/null" 2>&1) -join ''
if (-not $raw -or $raw -notmatch '\{') {
    $motivo = "SIN_MEDIDA: el script no devolvio JSON"
    $registro = [ordered]@{ ts = $stamp; verdict = 'SIN_MEDIDA'; reason = $motivo; device = $Device; measured = $false }
    $j = $registro | ConvertTo-Json -Compress
    Write-Line $logPath $j; Set-Content $latest $j; Set-Content $alertPath "ALERTA — $stamp`nVEREDICTO: SIN_MEDIDA`n$motivo" -Encoding UTF8
    Write-Line $incPath "$stamp SIN_MEDIDA $motivo"
    if ($Json) { $j } else { Write-Output "SIN_MEDIDA · $motivo" }
    exit 3
}

try { $r = $raw | ConvertFrom-Json } catch {
    $motivo = "JSON_INVALIDO: $($_.Exception.Message)"
    $registro = [ordered]@{ ts = $stamp; verdict = 'SIN_MEDIDA'; reason = $motivo; device = $Device; measured = $false }
    $j = $registro | ConvertTo-Json -Compress
    Write-Line $logPath $j; Set-Content $latest $j; Set-Content $alertPath "ALERTA — $stamp`nVEREDICTO: SIN_MEDIDA`n$motivo" -Encoding UTF8
    Write-Line $incPath "$stamp SIN_MEDIDA $motivo"
    if ($Json) { $j } else { Write-Output "SIN_MEDIDA · $motivo" }
    exit 3
}

$r | Add-Member -NotePropertyName ts -NotePropertyValue $stamp -Force
$r | Add-Member -NotePropertyName device -NotePropertyValue $Device -Force
$r | Add-Member -NotePropertyName measured -NotePropertyValue $true -Force
$jsonOut = $r | ConvertTo-Json -Compress

Write-Line $logPath $jsonOut
Set-Content -Path $latest -Value $jsonOut -Encoding UTF8

# ── 4. Decidir y avisar
$verdict = [string]$r.verdict
$prevVerdict = $null
if (Test-Path $latest) { }
$hist = Get-Content $logPath -ErrorAction SilentlyContinue
if ($hist -and $hist.Count -ge 2) {
    try { $prevVerdict = ([string]($hist[$hist.Count - 2]) | ConvertFrom-Json).verdict } catch { }
}

if ($verdict -eq 'OK') {
    if (Test-Path $alertPath) {
        Remove-Item $alertPath -Force
        Write-Line $incPath "$stamp RECUPERADO estaba=$prevVerdict ahora=OK"
    }
} else {
    $cuerpo = @"
ALERTA — $stamp
VEREDICTO: $verdict
MOTIVO   : $($r.reason)

MEDIDO (fuentes primarias, no la leyenda del panel):
  agente            : pid=$($r.agent_pid) version=$($r.version) servicios=$($r.agent_servicios)
  shim              : sockets=$($r.shim_sockets) acepta=$($r.shim_accepts) puertos='$($r.shim_ports)'
  display           : fisico=$($r.display_phys) override=$($r.display_override) modo=$($r.display_mode) tope_sf=$($r.sf_max)
  HDR (dataspace)   : capas=$($r.hdr_layers) unknown=$($r.hdr_unknown) no_sdr=$($r.hdr_non_sdr) conv=$($r.hdr_conversion_mode)
  settings          : aplicados=$($r.settings_applied) rechazados=$($r.settings_rejected) ledger='$($r.settings_ledger)'
  rechazos ventana  : $($r.reject_loop)
  VPP levers        : $($r.vpp_levers) presentes
  video             : geomBufferSize=$($r.play_geombuffersize)

Que significa cada veredicto:
  ROTO       el shim no escucha o no hay agente: el sistema NO esta funcionando
  DEGRADADO  el sistema responde pero miente en algo: HDR irreal, compositor no
             nativo, settings rechazados en bucle, levrers inexistentes
  OK         todo lo anterior medido en verde

El detalle completo esta en LATEST.json. Este archivo desaparece solo cuando el
veredicto vuelve a OK.
"@
    Set-Content -Path $alertPath -Value $cuerpo -Encoding UTF8
    if ($prevVerdict -and $prevVerdict -ne $verdict) {
        Write-Line $incPath "$stamp CAMBIO $prevVerdict -> $verdict | $($r.reason)"
    } elseif (-not $prevVerdict) {
        Write-Line $incPath "$stamp INICIAL $verdict | $($r.reason)"
    }
}

# ── 5. Reporte opcional al VPS (fail-open: nunca bloquea al vigilante)
if ($VpsUrl) {
    try {
        $payload = @{ source = 'ape-device-watchdog'; device = $Device; verdict = $verdict; reason = $r.reason; ts = $stamp } | ConvertTo-Json -Compress
        Invoke-RestMethod -Uri $VpsUrl -Method Post -Body $payload -ContentType 'application/json' -TimeoutSec 5 | Out-Null
    } catch {
        Write-Line $incPath "$stamp REPORTE_FALLIDO $($_.Exception.Message)"
    }
}

if ($Json) { $jsonOut } else {
    Write-Output "VERDICT=$verdict"
    Write-Output "MOTIVO=$($r.reason)"
    Write-Output "  shim sockets=$($r.shim_sockets) · HDR unknown=$($r.hdr_unknown)/$($r.hdr_layers) · settings rej=$($r.settings_rejected) · vpp=$($r.vpp_levers)"
    if ($verdict -ne 'OK') { Write-Output "  ALERTA escrita en: $alertPath" }
}

exit $(if ($verdict -eq 'OK') { 0 } else { 1 })

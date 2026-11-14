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

    REESCRITO 2026-11-14 tras cuatro parches fallidos. Los fallos que lo
    motivaron, todos medidos:
      1) $Adb='adb' a secas: el Programador de tareas no tiene el PATH de la
         sesion y la llamada moria. Ahora se resuelve adb probando rutas.
      2) Get-FileHash: existe desde PowerShell 4.0 y el powershell.exe del
         planificador lo rechazaba. Ahora SHA256 nativo.
      3) $ErrorActionPreference='Stop': un solo fallo abortaba el script SIN
         ESCRIBIR NADA — la tarea reportaba exito con codigo 0 y no dejaba
         rastro. Un vigilante que se cae en silencio es peor que no tenerlo.
         Ahora 'Continue' + un try/catch global que SIEMPRE deja constancia.
      4) La ruta del repo se derivaba de $PSScriptRoot; ahora se fija desde el
         propio fichero y se valida que exista.

    QUE DEJA EN DISCO
      artifacts/device-truth/device-truth.log     una linea por ejecucion (JSON)
      artifacts/device-truth/LATEST.json          el ultimo resultado
      artifacts/device-truth/ALERTA.txt           existe SOLO si el veredicto no
                                                  es OK; se borra cuando vuelve
      artifacts/device-truth/incidentes.log       una linea por cambio de estado
      artifacts/device-truth/crash.log            solo si el runner falla

    COMO AVISA
      - ALERTA.txt (visible, persistente, sobrevive a reinicios).
      - Exit code != 0, para que el Programador de tareas lo marque en rojo.

.PARAMETER Device
    Serial de adb. Por defecto 192.168.1.3:5555.

.PARAMETER Json
    Devuelve el JSON por la salida estandar en vez del resumen legible.

.PARAMETER Adb
    Ruta a adb.exe. Si se omite, se resuelve probando PATH y rutas tipicas.

.EXAMPLE
    .\ape-device-watchdog.ps1
    .\ape-device-watchdog.ps1 -Json
#>
[CmdletBinding()]
param(
    [string]$Device = '192.168.1.3:5555',
    [switch]$Json,
    [string]$VpsUrl = '',
    [string]$Adb = ''
)

# 'Continue' y no 'Stop': un vigilante NUNCA debe morir en silencio. Con 'Stop',
# un fallo temprano (adb ausente, permiso, lo que sea) abortaba el script sin
# escribir nada y la tarea quedaba en verde. Eso es exactamente la falsa
# sensacion de "hay alguien mirando" que el operador denuncio.
$ErrorActionPreference = 'Continue'

# La raiz se deriva del propio fichero y se valida; si no, se usa el cwd.
try {
    $here = $PSScriptRoot
    if (-not $here) { $here = Split-Path -Parent $MyInvocation.MyCommand.Path }
    $repo = Split-Path -Parent (Split-Path -Parent $here)
    if (-not $repo -or -not (Test-Path $repo)) { $repo = (Get-Location).Path }
} catch { $repo = (Get-Location).Path }

$outDir = Join-Path $repo 'artifacts\device-truth'
try { if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null } } catch { }

$logPath   = Join-Path $outDir 'device-truth.log'
$latest    = Join-Path $outDir 'LATEST.json'
$alertPath = Join-Path $outDir 'ALERTA.txt'
$incPath   = Join-Path $outDir 'incidentes.log'
$crashPath = Join-Path $outDir 'crash.log'
$scriptDev = '/data/local/tmp/ape-device-truth.sh'
$srcScript = Join-Path $repo 'tools\ops\ape-device-truth.sh'
$stamp     = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

function Write-Line($p, $t) {
    try { Add-Content -Path $p -Value $t -Encoding UTF8 } catch { }
}

function Emitir($verdict, $motivo, $extra) {
    # Escribe SIEMPRE las cuatro cosas: log, LATEST, ALERTA y incidentes.
    $o = [ordered]@{ ts = $stamp; verdict = $verdict; reason = $motivo; device = $Device; measured = ($verdict -notin @('SIN_ADB','SIN_CONEXION','SIN_MEDIDA','RUNNER_CRASH')) }
    if ($extra) { foreach ($k in $extra.Keys) { $o[$k] = $extra[$k] } }
    $j = ($o | ConvertTo-Json -Compress)
    Write-Line $logPath $j
    try { Set-Content -Path $latest -Value $j -Encoding UTF8 } catch { }
    if ($verdict -eq 'OK') {
        if (Test-Path $alertPath) { try { Remove-Item $alertPath -Force } catch { } }
    } else {
        $txt = "ALERTA - $stamp`nVEREDICTO: $verdict`nMOTIVO   : $motivo`n`n$($extra['detalle'] )`n`nQue significa cada veredicto:`n  ROTO       el shim no escucha o no hay agente: el sistema NO esta funcionando`n  DEGRADADO  responde pero miente en algo: HDR irreal, compositor no nativo,`n             settings rechazados en bucle, levers inexistentes`n  OK         todo lo anterior medido en verde`n  SIN_*      no se pudo medir: eso NO es un sistema sano`n`nEl detalle completo esta en LATEST.json. Este archivo desaparece solo cuando`nel veredicto vuelve a OK."
        try { Set-Content -Path $alertPath -Value $txt -Encoding UTF8 } catch { }
    }
    Write-Line $incPath "$stamp $verdict | $motivo"
    if ($Json) { $j } else {
        Write-Output "VERDICT=$verdict"
        Write-Output "MOTIVO=$motivo"
        if ($verdict -ne 'OK') { Write-Output "  ALERTA escrita en: $alertPath" }
    }
}

# ── Envoltorio global: si CUALQUIER cosa revienta, queda constancia ──────────
try {

# ── 0. Resolver adb (el planificador no tiene el PATH de la sesion) ──────────
$candidatos = @()
if ($Adb) { $candidatos += $Adb }
$candidatos += @(
    'C:\Android\platform-tools\adb.exe',
    (Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'),
    (Join-Path ${env:ProgramFiles} 'Android\platform-tools\adb.exe')
)
$adbOk = $null
foreach ($c in $candidatos) { if ($c -and (Test-Path $c)) { $adbOk = $c; break } }
if (-not $adbOk) {
    $gc = Get-Command adb -ErrorAction SilentlyContinue
    if ($gc) { $adbOk = $gc.Source }
}
if (-not $adbOk) {
    Emitir 'SIN_ADB' 'no encuentro adb.exe (PATH, C:\Android\platform-tools, LOCALAPPDATA, ProgramFiles)' @{}
    exit 3
}
$Adb = $adbOk

# ── 1. El dispositivo responde? ──────────────────────────────────────────────
$conn = ''
try { $conn = (& $Adb -s $Device shell 'echo ADB-OK' 2>&1 | Out-String) } catch { $conn = $_.Exception.Message }
if ($conn -notmatch 'ADB-OK') {
    Emitir 'SIN_CONEXION' "adb no responde en $Device" @{ detalle = "Salida de adb: $($conn.Trim())" }
    exit 3
}

# ── 2. Subir el script si cambio (comparando sha256 sin Get-FileHash) ────────
if (Test-Path $srcScript) {
    try {
        $texto = [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($srcScript)) -replace "`r`n", "`n"
        $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($texto))
        $shaObj = [System.Security.Cryptography.SHA256]::Create()
        try { $localSha = ([BitConverter]::ToString($shaObj.ComputeHash([IO.File]::ReadAllBytes($srcScript))) -replace '-','').ToLower() } finally { $shaObj.Dispose() }
        $remoto = (& $Adb -s $Device shell "sha256sum $scriptDev 2>/dev/null" 2>&1 | Out-String)
        if ($remoto -notmatch [regex]::Escape($localSha)) {
            & $Adb -s $Device shell "printf %s '$b64' | base64 -d > $scriptDev && chmod 755 $scriptDev" 2>&1 | Out-Null
        }
    } catch {
        Write-Line $crashPath "$stamp push fallo: $($_.Exception.Message)"
    }
}

# ── 3. Medir ─────────────────────────────────────────────────────────────────
$raw = ''
try { $raw = (& $Adb -s $Device shell "sh $scriptDev --json 2>/dev/null" 2>&1 | Out-String).Trim() } catch { $raw = '' }

# Quedarse SOLO con el objeto JSON: de la primera '{' a la ultima '}'.
$ini = $raw.IndexOf('{')
$fin = $raw.LastIndexOf('}')
if ($ini -lt 0 -or $fin -le $ini) {
    Emitir 'SIN_MEDIDA' 'el script del device no devolvio JSON' @{ detalle = "Salida cruda (primeros 200): $($raw.Substring(0,[Math]::Min(200,$raw.Length)))" }
    exit 3
}
$jsonTxt = $raw.Substring($ini, $fin - $ini + 1)

$r = $null
try { $r = $jsonTxt | ConvertFrom-Json } catch {
    Emitir 'SIN_MEDIDA' "JSON_INVALIDO: $($_.Exception.Message)" @{ detalle = "JSON recibido (primeros 200): $($jsonTxt.Substring(0,[Math]::Min(200,$jsonTxt.Length)))" }
    exit 3
}

$verdict = [string]$r.verdict
if (-not $verdict) {
    Emitir 'SIN_MEDIDA' 'el JSON no trae veredicto' @{ detalle = "Claves recibidas: $((($r.PSObject.Properties | ForEach-Object { $_.Name }) -join ', '))" }
    exit 3
}

$detalle = @"
MEDIDO (fuentes primarias, no la leyenda del panel):
  agente          : pid=$($r.agent_pid) version=$($r.version) servicios=$($r.agent_servicios)
  shim            : sockets=$($r.shim_sockets) acepta=$($r.shim_accepts) puertos='$($r.shim_ports)'
  display         : fisico=$($r.display_phys) override=$($r.display_override) modo=$($r.display_mode) tope_sf=$($r.sf_max)
  HDR (dataspace) : capas=$($r.hdr_layers) unknown=$($r.hdr_unknown) no_sdr=$($r.hdr_non_sdr) conv=$($r.hdr_conversion_mode)
  settings        : aplicados=$($r.settings_applied) rechazados=$($r.settings_rejected) ledger='$($r.settings_ledger)'
  rechazos ventana: $($r.reject_loop)
  VPP levers      : $($r.vpp_levers) presentes
  video           : geomBufferSize=$($r.play_geombuffersize)
"@

# El veredicto lo decide el script del device; aqui solo se propaga con su motivo.
Emitir $verdict ([string]$r.reason) @{
    detalle          = $detalle
    shim_sockets     = $r.shim_sockets
    hdr_unknown      = $r.hdr_unknown
    hdr_layers       = $r.hdr_layers
    settings_rejected= $r.settings_rejected
    vpp_levers       = $r.vpp_levers
    display_override = $r.display_override
    display_phys     = $r.display_phys
    version          = $r.version
    agent_pid        = $r.agent_pid
}

# ── 4. Reporte opcional al VPS (fail-open) ───────────────────────────────────
if ($VpsUrl) {
    try {
        $payload = @{ source = 'ape-device-watchdog'; device = $Device; verdict = $verdict; reason = $r.reason; ts = $stamp } | ConvertTo-Json -Compress
        Invoke-RestMethod -Uri $VpsUrl -Method Post -Body $payload -ContentType 'application/json' -TimeoutSec 5 | Out-Null
    } catch { Write-Line $incPath "$stamp REPORTE_FALLIDO $($_.Exception.Message)" }
}

if ($verdict -eq 'OK') { exit 0 } else { exit 1 }

} catch {
    # Ultimo recurso: si el script revienta por donde no debe, SE SABE.
    $msg = "$($_.Exception.Message) | $($_.InvocationInfo.PositionMessage)"
    Write-Line $crashPath "$stamp $msg"
    Emitir 'RUNNER_CRASH' "el vigilante fallo: $($_.Exception.Message)" @{ detalle = $msg }
    exit 4
}

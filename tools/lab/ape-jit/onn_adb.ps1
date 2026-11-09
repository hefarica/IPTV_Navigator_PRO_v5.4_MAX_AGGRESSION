# Wrapper ADB con reconexion automatica.
# El ONN 4K de esta red pierde la conexion adb cada pocos segundos; sin esto
# cada segundo comando falla con "device offline" y se pierde el ritmo de prueba.

$ErrorActionPreference = "Continue"

$script:ONN_IP    = "192.168.1.3"
$script:ONN_PORT  = 5555
$script:ONN_SERIAL = "$script:ONN_IP`:$script:ONN_PORT"

function Ensure-Onn {
    param([int]$Retries = 4)

    for ($i = 0; $i -lt $Retries; $i++) {
        $devs = & adb devices 2>&1
        if ($devs -match "$([regex]::Escape($script:ONN_SERIAL))\s+device") {
            # comprobar que responde de verdad, no solo que aparece listado
            $probe = & adb -s $script:ONN_SERIAL shell "echo ok" 2>&1
            if ($probe -match "ok") { return $true }
        }
        & adb disconnect $script:ONN_SERIAL 2>&1 | Out-Null
        Start-Sleep -Milliseconds 400
        & adb connect $script:ONN_SERIAL 2>&1 | Out-Null
        Start-Sleep -Milliseconds 900
    }
    return $false
}

function Onn {
    # Ejecuta adb shell con reconexion: Onn "comando" | Onn -Raw "comando"
    param(
        [Parameter(Mandatory = $true, Position = 0)][string]$Cmd,
        [switch]$Raw
    )
    if (-not (Ensure-Onn)) { throw "ONN no disponible tras reconectar" }
    $out = & adb -s $script:ONN_SERIAL shell $Cmd 2>&1
    if ($Raw) { return $out }
    return ($out | Where-Object { $_ -notmatch "device offline|error: closed|error: device" })
}

function OnnShot {
    # Captura PNG al temporal y devuelve la ruta o $null.
    param([string]$Tag = "shot")
    if (-not (Ensure-Onn)) { return $null }
    $p = Join-Path $env:TEMP "onn_$Tag.png"
    & adb -s $script:ONN_SERIAL exec-out screencap -p > $p 2>$null
    if ((Test-Path $p) -and (Get-Item $p).Length -gt 2000) { return $p }
    return $null
}

function OnnMediaSession {
    # Estado de reproduccion publicado por las apps (OTT incluido).
    if (-not (Ensure-Onn)) { return @() }
    $raw = & adb -s $script:ONN_SERIAL shell "dumpsys media_session 2>&1" 2>&1
    $sessions = @()
    $cur = $null
    foreach ($line in $raw -split "`n") {
        if ($line -match "^\s*(\S[^:]*):\s*$") { }
        if ($line -match "packageName=(\S+)") {
            if ($cur) { $sessions += $cur }
            $cur = [ordered]@{ package = $Matches[1]; active = $null; state = $null; position = $null; error = $null }
        }
        if ($cur -and $line -match "active=(\w+)") { $cur.active = $Matches[1] }
        if ($cur -and $line -match "state=PlaybackState \{state=(\w+)\((\d+)\)") {
            $cur.state = $Matches[1]
            if ($line -match "position=(\d+)") { $cur.position = [int]$Matches[1] }
            if ($line -match "error=([^}]+)") { $cur.error = $Matches[1].Trim() }
        }
    }
    if ($cur) { $sessions += $cur }
    return $sessions
}

Write-Host "  wrapper ADB cargado · serial $script:ONN_SERIAL"
Write-Host "  dispositivo: $(if (Ensure-Onn) { 'DISPONIBLE' } else { 'NO DISPONIBLE' })"

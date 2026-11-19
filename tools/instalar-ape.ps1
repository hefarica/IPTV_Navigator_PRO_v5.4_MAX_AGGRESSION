# APE CRYSTAL FLOW — instalar/actualizar en Fire TV (idempotente, sin preguntas)
#
# Doble clic o:  pwsh -NoProfile -File tools\instalar-ape.ps1 [-Ip 192.168.1.X:5555]
#
# QUE HACE (en este orden, sin intervencion):
#   1. Descarga el APK publicado si no esta o si su sha256 no coincide (verifica SIEMPRE).
#   2. Busca el dispositivo: adb devices -> si no hay, sondea el puerto 5555 de tu /24
#      y hace adb connect al primero que responda. Nunca adivina: si no encuentra, sale 2.
#   3. Comprueba si el paquete ya esta instalado y con que version.
#   4. IDEMPOTENTE: si lo instalado ya es lo publicado (mismo versionCode y sha),
#      dice "ya esta al dia" y sale 0 SIN reinstalar.
#   5. Si no, instala (nuevo) o actualiza con -r, y despues VERIFICA el resultado.
#
# EXIT: 0 = al dia o instalado y verificado · 1 = fallo · 2 = sin dispositivo (NO COMPUTADO)

param(
    [string]$Ip = "",
    [string]$Package = "com.ape.crystalagent",
    [string]$Manifest = "https://iptv-ape.duckdns.org/ara/version.json",
    [string]$Url = "",
    [string]$ShaEsperado = "",
    [long]$SizeEsperado = 0,
    [int]$VersionEsperada = 0
)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$apkDir = Join-Path $PSScriptRoot "_apk"
$man = CargarManifiesto $Manifest
if ($man) {
    $VersionEsperada = [int]$man.versionCode
    $ShaEsperado = [string]$man.sha256
    $SizeEsperado = [long]$man.size
    $base = [string]$man.apk
    if ($base) { $Url = "https://iptv-ape.duckdns.org" + $base }
    Say "manifiesto publicado: versionCode=$VersionEsperada · $($man.versionName) · $SizeEsperado B" "Cyan"
} else {
    Say "AVISO: no pude leer $Manifest; uso $Url con sha $ShaEsperado" "Yellow"
    if (-not $Url) { $Url = "https://iptv-ape.duckdns.org/ara/agent.apk" }
}
$apk = Join-Path $apkDir "ape-crystal-agent-$VersionEsperada.apk"

function Say($msg, $color = "Gray") { Write-Host $msg -ForegroundColor $color }

/* [2026-11-19] NADA de versiones clavadas: la version, el sha, el tamano y la
 * ruta del APK salen del manifiesto publicado (ara/version.json). Asi el
 * instalador sirve igual cuando se publique la 676, la 677 o la que sea, y
 * sigue siendo idempotente porque compara contra lo que el VPS declara. */
function CargarManifiesto([string]$m) {
    try {
        $j = Invoke-RestMethod -Uri $m -UseBasicParsing -TimeoutSec 30
        if (-not $j.versionCode -or -not $j.sha256) { throw "manifiesto sin versionCode/sha256" }
        return $j
    } catch { return $null }
}
function Die($msg, $code = 1) { Say "ERROR: $msg" "Red"; exit $code }

function Sha256File([string]$p) {
    if (-not (Test-Path $p)) { return "" }
    (Get-FileHash $p -Algorithm SHA256).Hash.ToLower()
}

# ── 1) APK: descargar solo si hace falta, y verificar SIEMPRE ────────────────
Say "=== 1/5 APK ===" "Cyan"
New-Item -ItemType Directory -Force -Path $apkDir | Out-Null
$shaLocal = Sha256File $apk
if ($shaLocal -eq $ShaEsperado) {
    Say "  APK ya presente y verificado ($ShaEsperado)" "Green"
} else {
    Say "  descargando $Url"
    try {
        Invoke-WebRequest -Uri $Url -OutFile $apk -UseBasicParsing -TimeoutSec 300 | Out-Null
    } catch { Die "no pude descargar el APK: $($_.Exception.Message)" 1 }
    $shaLocal = Sha256File $apk
    $sz = (Get-Item $apk).Length
    if ($shaLocal -ne $ShaEsperado) { Die "sha del APK descargado NO coincide. esperado=$ShaEsperado obtenido=$shaLocal" 1 }
    if ($SizeEsperado -gt 0 -and $sz -ne $SizeEsperado) { Die "tamano del APK no coincide ($sz != $SizeEsperado)" 1 }
    Say "  descargado y verificado: $sz B · $shaLocal" "Green"
}

# ── 2) ADB + descubrimiento del dispositivo ─────────────────────────────────
Say "=== 2/5 dispositivo ===" "Cyan"
$adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
if (-not $adb) {
    $cand = @("C:\Android\platform-tools\adb.exe", "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe")
    $adb = $cand | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $adb) { Die "adb no encontrado. Instala platform-tools o pone adb en PATH." 2 }
Say "  adb: $adb"

function Devices() {
    (& $adb devices) | Select-Object -Skip 1 | Where-Object { $_ -match "\sdevice$" } | ForEach-Object { ($_ -split "\s+")[0] }
}

$dev = @(Devices)
if ($dev.Count -eq 0 -and $Ip) {
    & $adb connect $Ip | Out-Null; Start-Sleep -Seconds 1
    $dev = @(Devices)
}
if ($dev.Count -eq 0) {
    Say "  sin dispositivos. Sondando <tu /24>:5555 (Fire TV con ADB de red)…"
    $ips = [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
        Where-Object { $_.OperationalStatus -eq "Up" -and $_.NetworkInterfaceType -ne "Loopback" } |
        ForEach-Object { $_.GetIPProperties().UnicastAddresses } |
        Where-Object { $_.Address.AddressFamily -eq "InterNetwork" } |
        ForEach-Object { $_.Address.GetAddressBytes() } |
        Where-Object { $_[0] -ne 169 } |
        ForEach-Object { "$($_[0]).$($_[1]).$($_[2])" } | Sort-Object -Unique

    foreach ($net in $ips) {
        for ($h = 1; $h -le 254; $h++) {
            $target = "$net.$h"
            $t = New-Object System.Net.Sockets.TcpClient
            try {
                $ar = $t.BeginConnect($target, 5555, $null, $null)
                if ($ar.AsyncWaitHandle.WaitOne(60, $false) -and $t.Connected) {
                    Say "  puerto 5555 abierto en $target -> adb connect"
                    & $adb connect "${target}:5555" | Out-Null
                    Start-Sleep -Milliseconds 800
                    $dev = @(Devices)
                    if ($dev.Count -gt 0) { break }
                }
            } catch { } finally { $t.Close() }
        }
        if ($dev.Count -gt 0) { break }
    }
}
if ($dev.Count -eq 0) {
    Say "SIN DISPOSITIVO (NO COMPUTADO): no hay Fire TV accesible." "Yellow"
    Say "  Activa en el Fire TV: Ajustes > Mi Fire TV > Opciones de desarrollador > Depuracion ADB."
    Say "  Luego: instalar-ape.bat 192.168.1.X:5555" "Yellow"
    exit 2
}
if ($dev.Count -gt 1) { Die "hay $($dev.Count) dispositivos ($($dev -join ', ')). Conecta solo uno o pasa la IP." 2 }
$serial = $dev[0]
Say "  dispositivo: $serial" "Green"

$st = (& $adb -s $serial get-state).Trim()
if ($st -ne "device") { Die "el dispositivo esta en estado '$st' (unauthorized/offline). Autoriza en el Fire TV y reintenta." 2 }

# ── 3) que hay instalado ────────────────────────────────────────────────────
Say "=== 3/5 estado del paquete ===" "Cyan"
$pathOut = (& $adb -s $serial shell pm path $Package 2>&1) -join "`n"
$instalado = $pathOut -match "package:"
$verInst = ""
if ($instalado) {
    $d = (& $adb -s $serial shell dumpsys package $Package 2>&1) -join "`n"
    $m = [regex]::Match($d, "versionCode=(\d+)")
    if ($m.Success) { $verInst = $m.Groups[1].Value }
    Say "  instalado: $Package  versionCode=$verInst"
    $apkPath = ([regex]::Match($pathOut, "package:(\S+)")).Groups[1].Value
    if ($apkPath) { Say "  base.apk: $apkPath" }
} else {
    Say "  no instalado (sera INSTALACION nueva)"
}

# ── 4) IDEMPOTENCIA: si ya es lo publicado, no se toca ──────────────────────
if ($instalado -and $verInst -eq "$VersionEsperada") {
    Say "=== 4/5 ya esta al dia (versionCode $VersionEsperada) -> NO se reinstala ===" "Green"
    Say "=== 5/5 OK ===" "Green"
    exit 0
}

# ── 5) instalar o actualizar + verificar ────────────────────────────────────
Say "=== 4/5 $(if ($instalado) { 'ACTUALIZANDO' } else { 'INSTALANDO' }) ===" "Cyan"
$res = (& $adb -s $serial install -r $apk 2>&1) -join "`n"
Say "  $($res -replace "`n", ' ')"
if ($res -match "INSTALL_FAILED_UPDATE_INCOMPATIBLE") {
    Say "  Fire OS tiene el paquete con OTRA FIRMA. No desinstalo solo." "Red"
    Say "  Decision del operador:  adb uninstall $Package   y volver a ejecutar." "Yellow"
    exit 1
}
if ($res -notmatch "Success") { Die "la instalacion no devolvio Success" 1 }

Say "=== 5/5 verificacion ===" "Cyan"
$d2 = (& $adb -s $serial shell dumpsys package $Package 2>&1) -join "`n"
$v2 = ([regex]::Match($d2, "versionCode=(\d+)")).Groups[1].Value
$p2 = (([regex]::Match((& $adb -s $serial shell pm path $Package 2>&1) -join "`n", "package:(\S+)")).Groups[1].Value)
$shaRemoto = ""
if ($p2) { $shaRemoto = (& $adb -s $serial shell sha256sum $p2 2>&1) -join "" }
Say "  versionCode instalado: $v2 (esperado $VersionEsperada)"
if ($shaRemoto -match "^([0-9a-f]{64})") {
    Say "  sha256 en el device:   $($matches[1])"
    if ($matches[1] -eq $ShaEsperado) { Say "  MATCH con el publicado" "Green" }
    else { Say "  sha del device NO coincide con el publicado (puede ser re-firma de Fire OS)" "Yellow" }
} else {
    Say "  sha256 no disponible en el device (sha256sum ausente) -> NO COMPUTADO" "Yellow"
}
if ($v2 -ne "$VersionEsperada") { Die "versionCode final $v2 != $VersionEsperada" 1 }
Say "OK: $Package versionCode $v2 instalado y verificado." "Green"
exit 0

# ============================================================================
# NET SHIELD Fase 3 — instalador cliente Windows
# Ejecutar como Administrador:   powershell -ExecutionPolicy Bypass -File install-client.ps1 -ConfPath .\hfrc.conf
# ============================================================================
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$ConfPath,

    [string]$WireGuardExe = "C:\Program Files\WireGuard\wireguard.exe"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ConfPath)) {
    throw "Config no existe: $ConfPath"
}

# 1. Instalar WireGuard si falta
if (-not (Test-Path $WireGuardExe)) {
    Write-Host "[*] WireGuard no encontrado. Instalando via winget..." -ForegroundColor Yellow
    winget install --id=WireGuard.WireGuard -e --accept-package-agreements --accept-source-agreements
    if (-not (Test-Path $WireGuardExe)) {
        throw "Instalación falló. Descarga manual: https://www.wireguard.com/install/"
    }
}

# 2. Validar que el config NO tenga AllowedIPs = 0.0.0.0/0 (sería full-tunnel, no split)
$confText = Get-Content $ConfPath -Raw
if ($confText -match 'AllowedIPs\s*=.*0\.0\.0\.0/0') {
    throw "[x] ABORT: $ConfPath contiene 0.0.0.0/0 en AllowedIPs. Eso sería full-tunnel. Revisa el split-tunnel."
}

# 3. Resolver ruta absoluta (wireguard.exe exige absoluta)
$absConf = (Resolve-Path $ConfPath).Path
$tunnelName = [System.IO.Path]::GetFileNameWithoutExtension($absConf)

# 4. Si ya existe, desinstalar antes (idempotente)
$existing = Get-Service -Name "WireGuardTunnel`$$tunnelName" -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "[i] Túnel '$tunnelName' ya instalado, reinstalando..." -ForegroundColor Yellow
    & $WireGuardExe /uninstalltunnelservice $tunnelName | Out-Null
    Start-Sleep -Seconds 2
}

# 5. Instalar como servicio
Write-Host "[*] Instalando túnel '$tunnelName'..." -ForegroundColor Cyan
& $WireGuardExe /installtunnelservice $absConf
Start-Sleep -Seconds 3

# 6. Verificar servicio arriba
$svc = Get-Service -Name "WireGuardTunnel`$$tunnelName" -ErrorAction SilentlyContinue
if (-not $svc -or $svc.Status -ne 'Running') {
    throw "[x] Servicio no arrancó. Revisa el visor de eventos > WireGuard."
}

Write-Host "[OK] Túnel '$tunnelName' activo." -ForegroundColor Green
Write-Host ""
Write-Host "Siguiente: ejecuta .\verify-splittunnel.ps1 para validar que el tráfico no-IPTV sale por ISP." -ForegroundColor Cyan

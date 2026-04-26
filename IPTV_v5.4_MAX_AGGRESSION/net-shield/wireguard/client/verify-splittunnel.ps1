# ============================================================================
# NET SHIELD Fase 3 — Verificación split-tunnel en cliente Windows
# Ejecuta 5 pruebas y marca PASS/FAIL. No requiere admin.
# ============================================================================
[CmdletBinding()]
param(
    [string]$ServerIP  = "178.156.147.234",
    [string]$IptvHost  = "ky-tv.cc",
    [string]$IptvIP    = "172.110.220.61",
    [string]$NonIptvIP = "8.8.8.8"
)

$ErrorActionPreference = "Continue"
$pass = 0; $fail = 0

function Check {
    param([string]$name, [bool]$ok, [string]$detail)
    if ($ok) {
        Write-Host ("  [PASS] {0} — {1}" -f $name, $detail) -ForegroundColor Green
        $script:pass = $script:pass + 1
    } else {
        Write-Host ("  [FAIL] {0} — {1}" -f $name, $detail) -ForegroundColor Red
        $script:fail = $script:fail + 1
    }
}

Write-Host ""
Write-Host "══════ NET SHIELD Fase 3 — Split-tunnel verification ══════" -ForegroundColor Cyan

# 1. Interfaz WireGuard arriba
$wgIf = Get-NetAdapter | Where-Object { $_.InterfaceDescription -match 'WireGuard' -and $_.Status -eq 'Up' } | Select-Object -First 1
Check "WG adapter up" ($null -ne $wgIf) ($(if ($wgIf) { $wgIf.Name } else { 'no adapter' }))

# 2. Ruta IPTV pasa por el túnel WG
$routeIptv = Get-NetRoute -DestinationPrefix "$IptvIP/32" -ErrorAction SilentlyContinue | Select-Object -First 1
$iptvViaWg = ($null -ne $routeIptv) -and ($null -ne $wgIf) -and ($routeIptv.InterfaceIndex -eq $wgIf.ifIndex)
Check "IPTV via WG"  $iptvViaWg ("route ${IptvIP} -> " + $(if ($routeIptv) { "ifIndex $($routeIptv.InterfaceIndex)" } else { 'no route' }))

# 3. Ruta default NO apunta al túnel
$defRoute = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1
$defNotWg = ($null -eq $wgIf) -or ($defRoute.InterfaceIndex -ne $wgIf.ifIndex)
Check "Default route NOT via WG" $defNotWg ("default ifIndex $($defRoute.InterfaceIndex)")

# 4. IP pública (api.ipify.org) = ISP, no el VPS
try {
    $pubIP = (Invoke-WebRequest -Uri 'https://api.ipify.org' -UseBasicParsing -TimeoutSec 10).Content.Trim()
    Check "Public IP is ISP (not VPS)" ($pubIP -ne $ServerIP) ("pub=$pubIP  vps=$ServerIP")
} catch {
    Check "Public IP check" $false $_.Exception.Message
}

# 5. DNS del host IPTV resuelto por unbound del VPS
try {
    $dns = Resolve-DnsName $IptvHost -Server $ServerIP -QuickTimeout -ErrorAction Stop | Where-Object { $_.Type -eq 'A' } | Select-Object -First 1
    Check "DNS $IptvHost via unbound" ($null -ne $dns) ("-> " + $(if ($dns) { $dns.IPAddress } else { 'no A record' }))
} catch {
    Check "DNS via unbound" $false $_.Exception.Message
}

# 6. Handshake reciente (<=180s)
try {
    $wgExe = "C:\Program Files\WireGuard\wg.exe"
    if (Test-Path $wgExe) {
        $dump = & $wgExe show all latest-handshakes 2>$null
        $recent = $false
        if ($dump) {
            $now = [int][double]::Parse((Get-Date -UFormat %s))
            foreach ($line in $dump) {
                $parts = $line -split '\s+'
                if ($parts.Count -ge 3) {
                    $hs = [int]$parts[-1]
                    if ($hs -gt 0 -and ($now - $hs) -lt 180) { $recent = $true }
                }
            }
        }
        Check "Handshake <=180s" $recent "wg show latest-handshakes"
    } else {
        Check "wg.exe present" $false "no encontrado en $wgExe"
    }
} catch {
    Check "Handshake check" $false $_.Exception.Message
}

Write-Host ""
Write-Host ("══════ Resultado: {0} PASS / {1} FAIL ══════" -f $pass, $fail) -ForegroundColor $(if ($fail -eq 0) {'Green'} else {'Red'})
if ($fail -gt 0) { exit 1 }

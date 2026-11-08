#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Verifica el contrato APK <-> VPS del ecosistema IPTV APE. SOLO LECTURA.

.DESCRIPTION
  Re-mide la matriz de endpoints desde el propio VPS (con header Host, sin el cual la
  peticion cae al vhost por defecto y no mide nada) y comprueba la paridad byte a byte
  entre el handler del repo y el desplegado.

  Sale 0 solo si TODAS las comprobaciones esperadas pasan. Cualquier desviacion se
  reporta con su codigo real; NO se convierte un fallo de comando en un cero.

  Doctrina: un hueco de evidencia no se rellena con seguridad. Si ssh no responde, el
  resultado es INDETERMINADO y el exit code es 2, no 0.

.EXAMPLE
  pwsh tools/audit/verify_apk_vps_contract.ps1
  pwsh tools/audit/verify_apk_vps_contract.ps1 -HostAlias hetzner-iptv -Json
#>
[CmdletBinding()]
param(
    [string]$HostAlias = 'hetzner-iptv',
    [string]$HostHeader = 'iptv-ape.duckdns.org',
    [switch]$Json
)

$ErrorActionPreference = 'Stop'
$script:fails = 0
$script:rows  = @()

function Add-Row {
    param([string]$Name, [string]$Expected, [string]$Actual, [bool]$Ok, [string]$Note = '')
    $script:rows += [pscustomobject]@{
        Check = $Name; Expected = $Expected; Actual = $Actual; Ok = $Ok; Note = $Note
    }
    if (-not $Ok) { $script:fails++ }
}

# ── Precondicion: ssh operativo. Sin esto NO se mide nada. ────────────────────
$probe = & ssh -o ConnectTimeout=12 -o BatchMode=yes $HostAlias 'echo APE_OK' 2>&1
if ($LASTEXITCODE -ne 0 -or "$probe" -notmatch 'APE_OK') {
    $msg = "ssh $HostAlias no responde (exit $LASTEXITCODE). Veredicto INDETERMINADO, no verde."
    if ($Json) { @{ verdict = 'INDETERMINATE'; reason = $msg } | ConvertTo-Json -Depth 4 }
    else { Write-Host "[INDETERMINADO] $msg" -ForegroundColor Yellow }
    exit 2
}

function Invoke-Remote {
    param([string]$Script)
    $out = & ssh -o ConnectTimeout=12 -o BatchMode=yes $HostAlias $Script 2>&1
    return @{ Text = ($out -join "`n"); Code = $LASTEXITCODE }
}

function Probe-Endpoint {
    param([string]$Path, [string]$Method = 'GET', [string]$Body = '')
    $args = if ($Method -eq 'POST') { "-X POST -H 'Content-Type: application/json' -d '$Body'" } else { '' }
    $cmd = "curl -s -k -o /dev/null -w '%{http_code}' $args -H 'Host: $HostHeader' 'https://127.0.0.1$Path'"
    $r = Invoke-Remote $cmd
    return $r.Text.Trim()
}

# ── 1. Matriz de endpoints del contrato APK ──────────────────────────────────
# Expected = codigo que el contrato EXIGE. 401/403/405/400 son EXITO cuando el
# endpoint existe y su auth/metodo es el disenado. 404 y 000 son siempre fallo.
$contract = @(
    @{ Path = '/ara/version.json';              Method = 'GET';  Expected = '200'; Why = 'metadata de distribucion' }
    @{ Path = '/ara/agent.apk';                 Method = 'GET';  Expected = '200'; Why = 'APK servida' }
    @{ Path = '/ara/events';                    Method = 'GET';  Expected = '401'; Why = 'existe; exige auth' }
    @{ Path = '/ara/state';                     Method = 'GET';  Expected = '401'; Why = 'existe; exige auth' }
    @{ Path = '/ara/sse';                       Method = 'GET';  Expected = '401'; Why = 'existe; exige auth' }
    @{ Path = '/prisma/api/token-vault.php';    Method = 'GET';  Expected = '401'; Why = 'existe; exige auth' }
    @{ Path = '/prisma/api/ara-enroll.php';     Method = 'GET';  Expected = '405'; Why = 'POST_ONLY' }
    @{ Path = '/prisma/api/ara-device.php';     Method = 'GET';  Expected = '400'; Why = 'exige ?action=' }
    @{ Path = '/prisma/api/ape-cartridge-bulk.php'; Method = 'GET'; Expected = '200'; Why = 'entrega cartridge' }
    @{ Path = '/sync';                          Method = 'POST'; Expected = '400'; Body = '{}'; Why = 'vivo; rechaza envoltura vacia' }
    @{ Path = '/sync';                          Method = 'GET';  Expected = '405'; Why = 'POST-only por diseno' }
    # Los dos que el deploy map declara y NO existen. Se vigilan para que no vuelvan
    # a pasar por buenos: si alguien los "arregla", el check cambia de expectativa a proposito.
    @{ Path = '/api/health';                    Method = 'GET';  Expected = '404'; Why = 'MUERTO: el deploy map apunta aqui' }
    @{ Path = '/api/resolve_quality';           Method = 'GET';  Expected = '404'; Why = 'MUERTO: el deploy map apunta aqui' }
    @{ Path = '/api/health.php';                Method = 'GET';  Expected = '200'; Why = 'health real' }
)

Write-Host "== 1. Matriz de endpoints (desde el VPS, con Host: $HostHeader) ==" -ForegroundColor Cyan
foreach ($c in $contract) {
    $actual = Probe-Endpoint -Path $c.Path -Method $c.Method -Body ($c.Body | ForEach-Object { $_ })
    if ([string]::IsNullOrWhiteSpace($actual)) { $actual = '000' }
    Add-Row -Name "$($c.Method) $($c.Path)" -Expected $c.Expected -Actual $actual `
            -Ok ($actual -eq $c.Expected) -Note $c.Why
}

# ── 2. Paridad byte a byte del handler /sync ─────────────────────────────────
Write-Host "== 2. Paridad repo <-> VPS de ara-sync.php ==" -ForegroundColor Cyan
$repoCandidate = 'ara-x/vps/php/ara-sync.php'
if (Test-Path $repoCandidate) {
    $repoRaw = [System.IO.File]::ReadAllBytes((Resolve-Path $repoCandidate))
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $repoHash = -join ($sha.ComputeHash($repoRaw) | ForEach-Object { $_.ToString('x2') })
    $remote = Invoke-Remote 'sha256sum /var/www/html/prisma/api/ara-sync.php'
    $remoteHash = ($remote.Text -split '\s+')[0]
    Add-Row -Name 'ara-sync.php sha256' -Expected $repoHash -Actual $remoteHash `
            -Ok ($repoHash -eq $remoteHash) -Note 'byte a byte; si difiere, normalizar CRLF antes de concluir'
} else {
    Add-Row -Name 'ara-sync.php sha256' -Expected 'archivo existe' -Actual 'ausente' -Ok $false `
            -Note "no encontrado: $repoCandidate"
}

# ── 3. Que handler sirve /sync de verdad (no lo que dice el comentario) ──────
Write-Host "== 3. Handler real de /sync ==" -ForegroundColor Cyan
$inc = Invoke-Remote "grep -c 'prisma-ara-sync.conf' /etc/nginx/snippets/ape-meta-public.conf"
$incCount = ($inc.Text -split "`n")[-1].Trim()
Add-Row -Name 'snippet sync incluido en el server 443' -Expected '>=1' -Actual $incCount `
        -Ok ([int]$incCount -ge 1) -Note 'si es 0, /sync NO esta desplegado'

# OJO: no usar un rango sed con `^    }$` — la indentacion del bloque cambia y el rango
# casa vacio, dando un falso negativo (comprobado: el check fallaba con el VPS correcto).
# Se verifica el DIRECTIVO en el snippet que esta incluido, que es determinista.
$snippet = Invoke-Remote "grep -c 'fastcgi_param SCRIPT_FILENAME /var/www/html/prisma/api/ara-sync.php' /etc/nginx/snippets/prisma-ara-sync.conf 2>/dev/null || echo 0"
$fcgi = ($snippet.Text -split "`n")[-1].Trim()
Add-Row -Name '/sync usa PHP fastcgi (no Lua)' -Expected '1' -Actual $fcgi -Ok ($fcgi -eq '1') `
        -Note 'el snippet incluido en el 443 rutea a ara-sync.php; la variante Lua esta desplegada pero NO cableada'

# ── 4. Identidad del APK servido ─────────────────────────────────────────────
Write-Host "== 4. Identidad del APK servido ==" -ForegroundColor Cyan
$apk = Invoke-Remote 'sha256sum /var/www/html/ara/agent.apk | cut -d" " -f1; grep -o ''"versionCode": *[0-9]*'' /var/www/html/ara/version.json; grep -o ''"package": *"[^"]*"'' /var/www/html/ara/version.json'
if (-not $Json) { Write-Host $apk.Text -ForegroundColor DarkGray }
Add-Row -Name 'version.json presente y legible' -Expected 'versionCode' -Actual $(if ($apk.Text -match 'versionCode') { 'ok' } else { 'ausente' }) `
        -Ok ($apk.Text -match 'versionCode') -Note 'la identidad servida debe declararse sin ambiguedad'

# ── Salida ───────────────────────────────────────────────────────────────────
if ($Json) {
    $verdict = if ($script:fails -eq 0) { 'ALIGNED' } else { 'DIVERGENT' }
    @{ verdict = $verdict; fails = $script:fails; checks = $script:rows } | ConvertTo-Json -Depth 5
} else {
    $script:rows | Format-Table -AutoSize -Wrap
    Write-Host ''
    if ($script:fails -eq 0) {
        Write-Host "VEREDICTO: ALINEADO ($($script:rows.Count) comprobaciones)" -ForegroundColor Green
    } else {
        Write-Host "VEREDICTO: DESALINEADO — $($script:fails) de $($script:rows.Count) comprobaciones fallan" -ForegroundColor Red
    }
}
exit ([Math]::Min($script:fails, 1))

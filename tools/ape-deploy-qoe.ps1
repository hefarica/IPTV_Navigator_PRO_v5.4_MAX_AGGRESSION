# APE CRYSTAL FLOW — deploy del subsistema QoE al VPS (idempotente, con rollback)
#
# Que hace:  sube SOLO los ficheros del panel/QoE que difieren por sha256
#            (LF-normalizado), hace backup previo, valida nginx -t y, si algo
#            falla, RESTAURA los backups y aborta sin dejar el sitio a medias.
#
# Que NO hace: no toca el generador (m3u8-typed-arrays-ultimate.js) ni PHP ni
#              systemd; no usa restart (siempre reload); no borra nada.
#
# Uso:  pwsh -File tools/ape-deploy-qoe.ps1 [-DryRun]
#       -DryRun  -> enseña que haria, sin escribir en el VPS

param(
    [switch]$DryRun,
    [string]$Host_ = "hetzner-iptv",
    [string]$WebRoot = "/var/www/html"
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$front = Join-Path $repo "IPTV_v5.4_MAX_AGGRESSION/frontend"
if (-not (Test-Path $front)) { throw "no encuentro el frontend en $front" }

# Ficheros del subsistema QoE / panel. El generador queda FUERA a proposito.
$FICHEROS = @(
    "index-v4.html",
    "app.js",
    "js/ape-v9/profile-manager-v9.js",
    "js/ape-v9/generation-controller.js",
    "js/ape-v9/prefetch-presets.js",
    "js/ape-v9/ape-profiles-config.js",
    "js/ape-v9/streaming/sufficiency-law-v1.js",
    "js/ape-v9/streaming/bandwidth-meter-v1.js",
    "js/ape-v9/streaming/auto-tune-v1.js",
    "js/ape-v9/streaming/qos-speedtest-v1.js"
)

function Local-Sha([string]$p) {
    $bytes = [IO.File]::ReadAllBytes($p)
    $text = [Text.Encoding]::UTF8.GetString($bytes) -replace "`r`n", "`n"
    $sha = [Security.Cryptography.SHA256]::Create()
    ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)) | ForEach-Object { $_.ToString("x2") }) -join ""
}

Write-Host "=== APE deploy QoE -> $Host_ ($WebRoot) ===" -ForegroundColor Cyan
if ($DryRun) { Write-Host "MODO DRY-RUN: no se escribe nada en el VPS" -ForegroundColor Yellow }

$pend = @()
foreach ($f in $FICHEROS) {
    $lp = Join-Path $front ($f -replace "/", "\")
    if (-not (Test-Path $lp)) { Write-Host ("  FALTA en local: {0}" -f $f) -ForegroundColor Red; continue }
    $lsha = Local-Sha $lp
    $rsha = (& ssh -o BatchMode=yes $Host_ "test -f $WebRoot/$f && tr -d '\r' < $WebRoot/$f | sha256sum | cut -d' ' -f1 || echo AUSENTE").Trim()
    if ($lsha -eq $rsha) {
        Write-Host ("  = {0}" -f $f) -ForegroundColor DarkGray
    } else {
        $estado = if ($rsha -eq "AUSENTE") { "NUEVO" } else { "DIFIERE" }
        Write-Host ("  ~ {0}  [{1}]" -f $f, $estado) -ForegroundColor Yellow
        $pend += $f
    }
}

if ($pend.Count -eq 0) {
    Write-Host "`nNada que desplegar: el VPS ya tiene exactamente estos bytes." -ForegroundColor Green
    exit 0
}

if ($DryRun) {
    Write-Host ("`nDRY-RUN: se subirian {0} ficheros." -f $pend.Count) -ForegroundColor Yellow
    exit 0
}

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$bdir = "/root/ape-deploy-backups/qoe_$stamp"
& ssh -o BatchMode=yes $Host_ "mkdir -p $bdir" | Out-Null

# 1) backup de TODO lo que se va a tocar, antes de tocar nada
foreach ($f in $pend) {
    $d = ($f -replace "/[^/]+$", "")
    & ssh -o BatchMode=yes $Host_ "mkdir -p '$bdir/$d'; cp -a '$WebRoot/$f' '$bdir/$f' 2>/dev/null || true" | Out-Null
}
Write-Host ("  backup: {0} ({1} ficheros)" -f $bdir, $pend.Count) -ForegroundColor DarkGray

# 2) subida
foreach ($f in $pend) {
    $lp = Join-Path $front ($f -replace "/", "\")
    $d = ($f -replace "/[^/]+$", "")
    & ssh -o BatchMode=yes $Host_ "mkdir -p '$WebRoot/$d'" | Out-Null
    & scp -o BatchMode=yes $lp "${Host_}:$WebRoot/$f"
    if ($LASTEXITCODE -ne 0) { throw "scp fallo en $f" }
}
& ssh -o BatchMode=yes $Host_ "chown www-data:www-data $(($pend | ForEach-Object { "'$WebRoot/$_'" }) -join ' '); chmod 644 $(($pend | ForEach-Object { "'$WebRoot/$_'" }) -join ' ')" | Out-Null

# 3) nginx -t ANTES de recargar; si falla -> restaurar y abortar
$t = & ssh -o BatchMode=yes $Host_ "nginx -t 2>&1 | tail -1"
Write-Host ("  nginx -t: {0}" -f $t) -ForegroundColor DarkGray
if ($t -notmatch "test is successful") {
    Write-Host "  nginx -t FALLA -> restaurando backups" -ForegroundColor Red
    foreach ($f in $pend) { & ssh -o BatchMode=yes $Host_ "cp -a '$bdir/$f' '$WebRoot/$f' 2>/dev/null || true" | Out-Null }
    throw "deploy abortado: nginx -t no paso. Backups restaurados desde $bdir"
}

# 4) reload (nunca restart) + verificacion sha servido
& ssh -o BatchMode=yes $Host_ "nginx -s reload" | Out-Null
Start-Sleep -Seconds 2

$bad = 0
foreach ($f in $pend) {
    $lp = Join-Path $front ($f -replace "/", "\")
    $lsha = Local-Sha $lp
    $rsha = (& ssh -o BatchMode=yes $Host_ "tr -d '\r' < $WebRoot/$f | sha256sum | cut -d' ' -f1").Trim()
    if ($lsha -eq $rsha) { Write-Host ("  OK  {0}" -f $f) -ForegroundColor Green }
    else { Write-Host ("  MISMATCH {0}  local={1} vps={2}" -f $f, $lsha.Substring(0, 12), $rsha.Substring(0, 12)) -ForegroundColor Red; $bad++ }
}

if ($bad -gt 0) {
    Write-Host "  restaurando backups por sha distinto" -ForegroundColor Red
    foreach ($f in $pend) { & ssh -o BatchMode=yes $Host_ "cp -a '$bdir/$f' '$WebRoot/$f' 2>/dev/null || true" | Out-Null }
    & ssh -o BatchMode=yes $Host_ "nginx -s reload" | Out-Null
    throw "deploy revertido: $bad ficheros no coinciden. Backups en $bdir"
}

$h = (& ssh -o BatchMode=yes $Host_ "curl -sk --resolve iptv-ape.duckdns.org:443:127.0.0.1 -o /dev/null -w '%{http_code}' https://iptv-ape.duckdns.org/health").Trim()
Write-Host ("`nDESPLEGADO: {0} ficheros · health={1} · backup={2}" -f $pend.Count, $h, $bdir) -ForegroundColor Green
Write-Host "Rollback manual:" -ForegroundColor DarkGray
Write-Host ("  ssh {0} 'cp -a {1}/. {2}/'" -f $Host_, $bdir, $WebRoot) -ForegroundColor DarkGray

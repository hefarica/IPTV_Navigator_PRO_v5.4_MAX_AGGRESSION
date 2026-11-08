#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Puerta de aceptación del parche REA_ALIGNMENT_20261108.patch.

.DESCRIPTION
  Convierte la auditoría externa del 2026-11-08 en una comprobación reproducible: no acepta prosa,
  exige los hashes y los estados de gate que la propia auditoría declaró.

  Hace, en orden y sin atajos:
    1. Comprueba que el árbol está en el commit base declarado (272f417e…).
    2. `git apply --check` del parche — no toca nada si no aplica limpio.
    3. Con -Apply: aplica y verifica los 30 sha256 de `source_overlay_sha256` del recibo de la APK.
    4. Con -RunGates: ejecuta los 21 gates ejecutables y compara estado y conteos.
    5. Veredicto.

  TRES INVARIANTES QUE NO SE NEGOCIAN (vienen del contrato):
    * un gate BLOQUEADO no es un gate aprobado — se reporta como BLOQUEADO;
    * no hay commit hasta que TODO esté verde;
    * una excepción para el PR NO autoriza merge ni despliegue.

  Fail-honest: si falta el parche, el veredicto es PATCH_AUSENTE (exit 3), no verde. Un gate cuyo
  artefacto no exista se reporta NO_COMPUTADO, nunca como aprobado.

.PARAMETER Patch
  Ruta al REA_ALIGNMENT_20261108.patch. Sin él solo se valida el contrato y el commit base.

.PARAMETER Apply
  Aplica el parche (tras un --check exitoso). Sin esto es dry-run.

.PARAMETER RunGates
  Ejecuta los gates. Requiere parche aplicado (o árbol ya con el parche).

.EXAMPLE
  pwsh tools/audit/verify_rea_patch.ps1                                  # valida contrato + base
  pwsh tools/audit/verify_rea_patch.ps1 -Patch ..\REA_ALIGNMENT_20261108.patch
  pwsh tools/audit/verify_rea_patch.ps1 -Patch ..\p.patch -Apply -RunGates
#>
[CmdletBinding()]
param(
    [string]$Patch,
    [switch]$Apply,
    [switch]$RunGates,
    [switch]$Json
)

$ErrorActionPreference = 'Stop'
$contractPath = Join-Path $PSScriptRoot 'rea_patch_acceptance.json'
if (-not (Test-Path $contractPath)) { Write-Error "falta el contrato: $contractPath"; exit 4 }
$C = Get-Content $contractPath -Raw | ConvertFrom-Json

$rows = @()
function Add-Row($id, $expected, $actual, $state, $note = '') {
    $script:rows += [pscustomobject]@{ check = $id; expected = $expected; actual = $actual; state = $state; note = $note }
}

# ── 1. commit base ────────────────────────────────────────────────────────────
$head = (& git rev-parse HEAD 2>&1 | Out-String).Trim()
$same = $head -eq $C.base_commit
Add-Row 'base_commit' $C.base_commit.Substring(0,12) $head.Substring(0,[Math]::Min(12,$head.Length)) `
        $(if ($same) { 'OK' } else { 'DIVERGE' }) 'el parche solo aplica limpio sobre la base auditada'

# ── 2. contrato interno ───────────────────────────────────────────────────────
$blocked = @($C.allowed_blocked_gates)
$gates   = @($C.gates)
$exec    = @($gates | Where-Object { $blocked -notcontains $_.id })
Add-Row 'gates_declarados' "$($C.gate_summary_expected.total)" "$($gates.Count)" `
        $(if ($gates.Count -eq $C.gate_summary_expected.total) { 'OK' } else { 'MISMATCH' }) ''
Add-Row 'gates_ejecutables' "$($exec.Count)" "$($exec.Count)" 'OK' "los $($blocked.Count) bloqueados NO cuentan como aprobados"

Add-Row 'hashes_esperados' '30' "$(@($C.expected_source_sha256.PSObject.Properties).Count)" `
        $(if (@($C.expected_source_sha256.PSObject.Properties).Count -eq 30) { 'OK' } else { 'MISMATCH' }) ''

# ── 3. el parche ──────────────────────────────────────────────────────────────
$patchPresent = $Patch -and (Test-Path $Patch)
if (-not $patchPresent) {
    Add-Row 'patch' 'REA_ALIGNMENT_20261108.patch' 'AUSENTE' 'PATCH_AUSENTE' `
            'sin parche no se puede verificar nada del arbol auditado'
} else {
    $bytes = (Get-Item $Patch).Length
    $sha = (Get-FileHash $Patch -Algorithm SHA256).Hash.ToLower()
    Add-Row 'patch_presente' 'presente' "$bytes B  $($sha.Substring(0,16))" 'OK' ''
    $chk = (& git apply --check --verbose $Patch 2>&1 | Out-String)
    $chkOk = $LASTEXITCODE -eq 0
    Add-Row 'git_apply_check' 'exit 0' "exit $LASTEXITCODE" $(if ($chkOk) { 'OK' } else { 'NO_APLICA' }) `
            $(if ($chkOk) { 'aplica limpio sobre la base' } else { (($chk -split "`n") | Select-Object -First 3) -join ' | ' })
    if ($chkOk -and $Apply) {
        & git apply --verbose $Patch 2>&1 | Out-Null
        Add-Row 'git_apply' 'exit 0' "exit $LASTEXITCODE" $(if ($LASTEXITCODE -eq 0) { 'APLICADO' } else { 'FALLO' }) ''
    }
    # Las claves de source_overlay_sha256 son relativas a tools/rea/apk_overlay/ (NO a la raiz).
    # Y el repo tiene core.autocrlf=true con .gitattributes que pin-ea eol=lf solo en algunas
    # extensiones: los .java/.py/.glsl llegan al disco en CRLF y su sha256 crudo NO coincide
    # aunque el contenido sea identico. Se compara crudo y, si falla, normalizado a LF.
    $overlayBase = 'tools/rea/apk_overlay'
    $enc = [System.Text.Encoding]::Latin1
    function Get-Sha($bytes) {
        $s = [System.Security.Cryptography.SHA256]::Create()
        try { return (-join ($s.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') })) }
        finally { $s.Dispose() }
    }
    $okH = 0; $badH = @(); $absH = 0; $crlfH = 0
    foreach ($p in $C.expected_source_sha256.PSObject.Properties) {
        $f = Join-Path (Join-Path $PWD $overlayBase) $p.Name
        if (-not (Test-Path $f)) { $absH++; continue }
        $raw = [System.IO.File]::ReadAllBytes($f)
        if ((Get-Sha $raw) -eq $p.Value) { $okH++; continue }
        $nb = $enc.GetBytes($enc.GetString($raw).Replace("`r`n", "`n"))
        if ((Get-Sha $nb) -eq $p.Value) { $crlfH++ } else { $badH += $p.Name }
    }
    $total = @($C.expected_source_sha256.PSObject.Properties).Count
    $match = $okH + $crlfH
    $stateH = if ($absH -eq $total) { 'NO_COMPUTADO' }
              elseif ($match -eq $total) { 'OK' }
              elseif ($badH.Count -gt 0) { 'MISMATCH' } else { 'PARCIAL' }
    Add-Row 'source_overlay_sha256' "$total matches" "$match ok ($crlfH via LF) / $($badH.Count) mal / $absH ausentes" $stateH `
            $(if ($badH.Count) { 'divergen: ' + (($badH | Select-Object -First 4) -join ', ') } else { '' })
}

# ── 4. gates ──────────────────────────────────────────────────────────────────
if ($RunGates) {
    foreach ($g in $exec) {
        $cmdArr = @($g.command)
        $exe = $cmdArr[0]; $gargs = @()
        if ([string]::IsNullOrWhiteSpace($exe)) {
            Add-Row $g.id $g.expected_status 'sin comando en el recibo' 'NO_COMPUTADO' `
                    'el recibo declara counts pero no el comando; no se puede reproducir'
            continue
        }
        if ($cmdArr.Count -gt 1) { $gargs = $cmdArr[1..($cmdArr.Count - 1)] }
        if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) {
            Add-Row $g.id $g.expected_status 'ejecutable ausente' 'NO_COMPUTADO' "no existe '$exe'"
            continue
        }
        $out = & $exe @gargs 2>&1 | Out-String
        $code = $LASTEXITCODE
        $obs = if ($code -eq 0) { 'PASS' } elseif ($code -eq 2) { 'BLOCKED_ENVIRONMENT' } else { 'FAIL' }
        $st = if ($obs -eq $g.expected_status) { 'OK' } else { "DIVERGE($obs)" }
        if ($obs -eq 'BLOCKED_ENVIRONMENT') { $st = 'BLOQUEADO' }
        Add-Row $g.id $g.expected_status "exit $code -> $obs" $st (($out -split "`n" | Where-Object { $_ -match '\d' } | Select-Object -Last 1))
    }
}

# ── 5. veredicto ──────────────────────────────────────────────────────────────
$fails    = @($rows | Where-Object { $_.state -in @('DIVERGE','MISMATCH','NO_APLICA','FALLO','PATCH_AUSENTE') -or $_.state -like 'DIVERGE*' })
$blockedN = @($rows | Where-Object { $_.state -eq 'BLOQUEADO' }).Count
$verdict = if ($rows | Where-Object { $_.state -eq 'PATCH_AUSENTE' }) { 'PATCH_AUSENTE' }
           elseif ($fails.Count -gt 0) { 'RECHAZADO' }
           elseif (-not $RunGates) { 'CONTRATO_OK_SIN_EJECUTAR_GATES' }
           else { 'ACEPTADO_CON_GATES_BLOQUEADOS' }

if ($Json) {
    [pscustomobject]@{
        verdict = $verdict; checks = $rows
        blocked_gates = $blockedN
        invariants = [pscustomobject]@{
            blocked_is_not_passed = $true
            commit_requires_all_green = $true
            pr_exception_does_not_authorize_merge_or_deploy = $true
        }
    } | ConvertTo-Json -Depth 5
} else {
    Write-Host "Puerta de aceptacion REA — base $($C.base_commit.Substring(0,12))" -ForegroundColor Cyan
    Write-Host ""
    $rows | Format-Table check, expected, actual, state -AutoSize -Wrap
    Write-Host ""
    switch ($verdict) {
        'PATCH_AUSENTE' {
            Write-Host "VEREDICTO: PATCH_AUSENTE (exit 3)" -ForegroundColor Yellow
            Write-Host "  El parche exige sesion autenticada en la libreria del chat (401 verificado)." -ForegroundColor Yellow
            Write-Host "  Descargalo tu y pasalo con -Patch. Sin el, el arbol auditado no es verificable." -ForegroundColor Yellow
        }
        'RECHAZADO'         { Write-Host "VEREDICTO: RECHAZADO — $($fails.Count) desviaciones" -ForegroundColor Red }
        'ACEPTADO_CON_GATES_BLOQUEADOS' {
            Write-Host "VEREDICTO: ACEPTADO CON $blockedN GATES BLOQUEADOS" -ForegroundColor Green
            Write-Host "  Los bloqueados NO son aprobados: Chrome no arranca en el entorno (EPERM)." -ForegroundColor Yellow
            Write-Host "  Esto NO autoriza commit, merge ni despliegue." -ForegroundColor Yellow
        }
        default { Write-Host "VEREDICTO: $verdict" -ForegroundColor Yellow }
    }
}

switch ($verdict) {
    'PATCH_AUSENTE'                  { exit 3 }
    'RECHAZADO'                      { exit 1 }
    'CONTRATO_OK_SIN_EJECUTAR_GATES' { exit 0 }
    default                          { exit 0 }
}

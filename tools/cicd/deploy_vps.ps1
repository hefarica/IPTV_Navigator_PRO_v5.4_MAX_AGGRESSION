<#
.SYNOPSIS
  Windows entry-point for the gated VPS CD pipeline. Thin wrapper that locates a
  POSIX bash (Git for Windows / WSL) and runs deploy_vps.sh — the single source of
  deploy logic. All flags pass straight through.

.EXAMPLE
  .\deploy_vps.ps1 -WhatIf
  .\deploy_vps.ps1 -Changed
  .\deploy_vps.ps1 -Only php-prisma-ape-match,lua-codec-cascade
  .\deploy_vps.ps1 -All -Yes

.NOTES
  Doctrine: iptv-vps-touch-nothing · omega-no-delete · autopista · SHIELDED.
  The SSH key stays on THIS machine (never uploaded as a GitHub secret).
#>
[CmdletBinding()]
param(
  [switch]$WhatIf,
  [switch]$Changed,
  [switch]$All,
  [string]$Only,
  [switch]$Yes,
  [switch]$NoVerify
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Sh = Join-Path $ScriptDir 'deploy_vps.sh'
if (-not (Test-Path $Sh)) { throw "deploy_vps.sh not found next to this wrapper" }

# Locate a bash that has ssh/scp on PATH (Git for Windows ships both).
$bash = $null
foreach ($cand in @(
    "$env:ProgramFiles\Git\bin\bash.exe",
    "$env:ProgramFiles\Git\usr\bin\bash.exe",
    "${env:ProgramFiles(x86)}\Git\bin\bash.exe",
    "C:\Program Files\Git\bin\bash.exe"
)) { if ($cand -and (Test-Path $cand)) { $bash = $cand; break } }
if (-not $bash) {
  $cmd = Get-Command bash.exe -ErrorAction SilentlyContinue
  if ($cmd) { $bash = $cmd.Source }
}
if (-not $bash) { throw "No bash found. Install Git for Windows (provides bash + ssh + scp)." }

# Translate PowerShell switches -> deploy_vps.sh flags
$shArgs = @()
if ($WhatIf)  { $shArgs += '--whatif' }
if ($Changed) { $shArgs += '--changed' }
if ($All)     { $shArgs += '--all' }
if ($Only)    { $shArgs += @('--only', $Only) }
if ($Yes)     { $shArgs += '--yes' }
if ($NoVerify){ $shArgs += '--no-verify' }
if ($shArgs.Count -eq 0) { $shArgs += '--whatif' }  # safe default

# Convert the .sh path to a bash-friendly path
$shPosix = & $bash -c "cygpath -u '$Sh'" 2>$null
if (-not $shPosix) { $shPosix = $Sh }

Write-Host "→ $bash $shPosix $($shArgs -join ' ')" -ForegroundColor Cyan
& $bash $shPosix @shArgs
exit $LASTEXITCODE

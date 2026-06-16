<#
.SYNOPSIS
  Windows entry-point for the read-only doctrine + syntax validation gate.
  Thin wrapper over validate_local.sh (single source of logic). Touches nothing.

.EXAMPLE
  .\validate_local.ps1
  .\validate_local.ps1 path\to\file.js
  .\validate_local.ps1 --all-tracked
#>
[CmdletBinding()]
param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Sh = Join-Path $ScriptDir 'validate_local.sh'
if (-not (Test-Path $Sh)) { throw "validate_local.sh not found next to this wrapper" }

$bash = $null
foreach ($cand in @(
    "$env:ProgramFiles\Git\bin\bash.exe",
    "$env:ProgramFiles\Git\usr\bin\bash.exe",
    "C:\Program Files\Git\bin\bash.exe"
)) { if ($cand -and (Test-Path $cand)) { $bash = $cand; break } }
if (-not $bash) { $c = Get-Command bash.exe -ErrorAction SilentlyContinue; if ($c) { $bash = $c.Source } }
if (-not $bash) { throw "No bash found. Install Git for Windows." }

$shPosix = & $bash -c "cygpath -u '$Sh'" 2>$null
if (-not $shPosix) { $shPosix = $Sh }
& $bash $shPosix @Args
exit $LASTEXITCODE

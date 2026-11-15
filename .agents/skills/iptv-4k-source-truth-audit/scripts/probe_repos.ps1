# Sonda de repositorios: estrellas, licencia, vigencia (solo lectura).
# Uso:  & .\probe_repos.ps1 'iptv-org/iptv','dearbulut/iptv'
# Salida: tabla TSV por stdout. No escribe archivos. Sin token: 60 req/h.

param(
  [Parameter(Mandatory = $true, ValueFromRemainingArguments = $false)]
  [string[]] $Repos
)

$ErrorActionPreference = 'Continue'
$now = (Get-Date).ToUniversalTime()

'{0}`t{1}`t{2}`t{3}`t{4}`t{5}`t{6}`t{7}' -f `
  'repo', 'stars', 'forks', 'lang', 'license', 'pushed', 'days_idle', 'verdict'

foreach ($r in $Repos) {
  try {
    $j = Invoke-RestMethod -Uri "https://api.github.com/repos/$r" `
      -Headers @{ 'User-Agent' = 'dsh-truth-audit'; 'Accept' = 'application/vnd.github+json' } `
      -TimeoutSec 20 -ErrorAction Stop

    $lic = if ($null -eq $j.license) { 'null' } else { $j.license.spdx_id }
    $pushed = [datetime]::Parse($j.pushed_at).ToUniversalTime()
    $days = [int]($now - $pushed).TotalDays

    $verdict = @()
    if ($days -gt 365) { $verdict += 'ABANDONADO' }
    elseif ($days -gt 180) { $verdict += 'DORMIDO' }
    if ($j.archived) { $verdict += 'ARCHIVADO' }
    if ($null -eq $j.license) { $verdict += 'SIN_LICENCIA' }
    elseif ($j.license.spdx_id -eq 'NOASSERTION') { $verdict += 'LICENCIA_SIN_SPDX' }
    if ($j.stargazers_count -eq 0) { $verdict += 'NO_SOSTENIDO' }
    if ($verdict.Count -eq 0) { $verdict += 'OK' }

    '{0}`t{1}`t{2}`t{3}`t{4}`t{5}`t{6}`t{7}' -f `
      $r, $j.stargazers_count, $j.forks_count, $j.language, $lic,
      $pushed.ToString('yyyy-MM-dd'), $days, ($verdict -join '+')
  }
  catch {
    $code = try { $_.Exception.Response.StatusCode.value__ } catch { 'ERR' }
    '{0}`t-`t-`t-`t-`t-`t-`tHTTP_{1}' -f $r, $code
  }
  Start-Sleep -Milliseconds 250
}

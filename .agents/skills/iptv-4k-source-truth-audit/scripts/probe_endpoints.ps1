# Sonda de endpoints: código real, bytes y #EXTINF (solo lectura).
# Uso:  & .\probe_endpoints.ps1 'https://iptv-org.github.io/iptv/index.m3u'
# Salida: tabla TSV. No escribe archivos.
#
# TRAMPAS QUE ESTA SONDA EVITA:
#  - Invoke-WebRequest LANZA en 4xx/5xx: sin catch, un 404 se pierde o se reporta OK.
#  - $r.Content puede volver como byte[]: sin decodificar, #EXTINF cuenta 0.
#  - Imprimir el cuerpo entero (26 MB de channels.json) borra la evidencia.

param(
  [Parameter(Mandatory = $true, ValueFromRemainingArguments = $false)]
  [string[]] $Urls
)

$ErrorActionPreference = 'Continue'

'{0}`t{1}`t{2}`t{3}`t{4}' -f 'url', 'status', 'bytes', 'extinf', 'first_line'

foreach ($u in $Urls) {
  try {
    $r = Invoke-WebRequest -Uri $u -Method Get `
      -Headers @{ 'User-Agent' = 'dsh-truth-audit' } -TimeoutSec 30 -ErrorAction Stop

    $c = $r.Content
    if ($c -is [byte[]]) { $c = [System.Text.Encoding]::UTF8.GetString($c) }

    $extinf = ([regex]::Matches($c, '(?m)^#EXTINF')).Count
    $first = ($c -split "`n" | Select-Object -First 1)
    if ($first.Length -gt 60) { $first = $first.Substring(0, 60) + '...' }

    '{0}`t{1}`t{2}`t{3}`t{4}' -f $u, $r.StatusCode, $c.Length, $extinf, $first
  }
  catch {
    $code = try { $_.Exception.Response.StatusCode.value__ } catch { 'ERR' }
    '{0}`t{1}`t0`t0`t-' -f $u, $code
  }
}

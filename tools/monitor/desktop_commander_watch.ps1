#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Vigila la actividad de Desktop Commander (MCP) y su relación con el desarrollo de la APK.

.DESCRIPTION
  Lee las TRES fuentes reales, sin inventar productores:

    ~/.claude-server-commander/tool-history.jsonl   historial estructurado (toolName/arguments/output/timestamp)
    ~/.claude-server-commander/claude_tool_call.log  log crudo (ISO8601 | tool | Arguments: json)
    ~/.desktop-commander-device/remote-*.log         relay del device, ROTADO POR DIA DE SEMANA

  Emite: volumen por herramienta, actividad de hoy, errores de relay, y el CONTEO de trabajo
  relacionado con la APK. Ese conteo es el indicador clave: si es ~0, el progreso de la APK
  NO vive aquí y el monitor lo dice en el veredicto en vez de fingir avance.

  Fail-honest: una fuente ausente se reporta como AUSENTE con su ruta, nunca como cero.

.PARAMETER Json
  Emite un objeto JSON (para diff entre corridas).

.PARAMETER Archive
  Copia los remote-*.log a la carpeta de snapshots con la fecha en el nombre. Los logs rotan
  por dia de semana y se SOBRESCRIBEN: sin esto, la evidencia se pierde cada semana.

.PARAMETER OutDir
  Carpeta de snapshots. Por defecto docs/monitoring/snapshots.

.EXAMPLE
  pwsh tools/monitor/desktop_commander_watch.ps1 -Archive
  pwsh tools/monitor/desktop_commander_watch.ps1 -Json > snap.json
#>
[CmdletBinding()]
param(
    [switch]$Json,
    [switch]$Archive,
    [string]$OutDir = 'docs/monitoring/snapshots'
)

$ErrorActionPreference = 'Stop'

$historyPath = Join-Path $env:USERPROFILE '.claude-server-commander\tool-history.jsonl'
$rawLogPath  = Join-Path $env:USERPROFILE '.claude-server-commander\claude_tool_call.log'
$deviceDir   = Join-Path $env:USERPROFILE '.desktop-commander-device'

$sources = @{}
foreach ($p in @($historyPath, $rawLogPath)) {
    $sources[[System.IO.Path]::GetFileName($p)] = if (Test-Path $p) {
        [pscustomobject]@{ state = 'present'; bytes = (Get-Item $p).Length; modified = (Get-Item $p).LastWriteTime }
    } else { [pscustomobject]@{ state = 'ABSENT'; bytes = $null; modified = $null } }
}

# ── Relay logs ────────────────────────────────────────────────────────────────
$relay = @()
if (Test-Path $deviceDir) {
    foreach ($f in Get-ChildItem $deviceDir -Filter 'remote-*.log' -File) {
        $text = Get-Content $f.FullName -Raw
        $relay += [pscustomobject]@{
            file          = $f.Name
            bytes         = $f.Length
            modified      = $f.LastWriteTime
            tool_calls    = ([regex]::Matches($text, 'Received tool call')).Count
            successes     = ([regex]::Matches($text, 'Tool call successful')).Count
            channel_error = ([regex]::Matches($text, 'CHANNEL_ERROR')).Count
            token_refresh = ([regex]::Matches($text, 'Token refreshed')).Count
        }
    }
}

# ── Historial estructurado ────────────────────────────────────────────────────
$hist = @()
if ((Test-Path $historyPath)) {
    foreach ($line in [System.IO.File]::ReadLines($historyPath)) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        try { $hist += ($line | ConvertFrom-Json) } catch { }
    }
}

# Patron de trabajo APK. Deliberadamente ESTRECHO: un `\.apk` dentro de un regex de
# extensiones es un falso positivo y ya contaminó el conteo en la sesion 2026-11-07.
$apkPattern = 'apktool|apksigner|zipalign|\bd8\b|\bdx\.jar\b|assembleDebug|assembleRelease|aapt2|' +
              'crystalagent\.rea|/ara/version\.json|/ara/agent\.apk|repair_apk_manifest|ottshim'

$apkHits = @()
foreach ($h in $hist) {
    $blob = ($h.arguments | ConvertTo-Json -Compress -Depth 8) + ' ' + [string]$h.output
    if ($blob -match $apkPattern) {
        $apkHits += [pscustomobject]@{
            timestamp = $h.timestamp
            tool      = $h.toolName
            detail    = ($blob -replace '\s+', ' ').Substring(0, [Math]::Min(120, ($blob -replace '\s+', ' ').Length))
        }
    }
}

$byTool = $hist | Group-Object toolName | Sort-Object Count -Descending |
          ForEach-Object { [pscustomobject]@{ tool = $_.Name; count = $_.Count } }

# ── Actividad de hoy ──────────────────────────────────────────────────────────
# OJO: NO filtrar por el prefijo de fecha UTC. El operador trabaja en America/Bogota (UTC-5);
# entre las 19:00 y 24:00 locales el reloj UTC ya es el dia siguiente y el conteo daba 0
# aunque hubiera 1.276 llamadas (defecto real detectado al estrenar este monitor).
# Se construye la VENTANA local [00:00 local, 00:00 local+1d) expresada en UTC.
$localToday  = (Get-Date).Date
$winStartUtc = $localToday.ToUniversalTime()
$winEndUtc   = $localToday.AddDays(1).ToUniversalTime()
$todayLabel  = $localToday.ToString('yyyy-MM-dd') + ' local (' + (Get-Date).ToString('zzz') + ')'

$todayCalls = 0
$todayTools = @{}
if (Test-Path $rawLogPath) {
    foreach ($line in [System.IO.File]::ReadLines($rawLogPath)) {
        $m = [regex]::Match($line, '^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z) \|\s*(\w+)')
        if (-not $m.Success) { continue }
        $ts = [datetime]::Parse($m.Groups[1].Value, [System.Globalization.CultureInfo]::InvariantCulture,
                                [System.Globalization.DateTimeStyles]::AdjustToUniversal -bor
                                [System.Globalization.DateTimeStyles]::AssumeUniversal)
        if ($ts -lt $winStartUtc -or $ts -ge $winEndUtc) { continue }
        $todayCalls++
        $n = $m.Groups[2].Value
        $todayTools[$n] = 1 + [int]$todayTools[$n]
    }
}
$todayToolsClean = $todayTools

# ── Archivo de snapshots ──────────────────────────────────────────────────────
$archivedTo = $null
if ($Archive) {
    if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
    $stamp = (Get-Date).ToString('yyyyMMddTHHmmssZ')
    foreach ($f in Get-ChildItem $deviceDir -Filter 'remote-*.log' -File -ErrorAction SilentlyContinue) {
        $dest = Join-Path $OutDir ("{0}__{1}" -f $stamp, $f.Name)
        Copy-Item $f.FullName $dest -Force
    }
    $archivedTo = $OutDir
}

# ── Veredicto ─────────────────────────────────────────────────────────────────
$apkRatio = if ($hist.Count -gt 0) { [math]::Round(100.0 * $apkHits.Count / $hist.Count, 2) } else { $null }
$verdict = if ($null -eq $apkRatio) { 'INDETERMINADO (fuente de historial ausente)' }
           elseif ($apkHits.Count -eq 0) { 'NO_HACE_TRABAJO_DE_APK' }
           elseif ($apkRatio -lt 1) { 'TRABAJO_APK_MARGINAL' }
           else { 'TRABAJO_APK_ACTIVO' }

# ── Salida ────────────────────────────────────────────────────────────────────
if ($Json) {
    [pscustomobject]@{
        measured_at_utc = (Get-Date).ToUniversalTime().ToString('o')
        verdict         = $verdict
        apk_ratio_pct   = $apkRatio
        sources         = $sources
        history_total   = $hist.Count
        apk_hits        = $apkHits.Count
        by_tool         = $byTool
        today_local     = $todayLabel
        today_calls     = $todayCalls
        today_tools     = $todayToolsClean
        relay           = $relay
        archived_to     = $archivedTo
    } | ConvertTo-Json -Depth 6
}
else {
    Write-Host "Desktop Commander — vigilancia  $((Get-Date).ToUniversalTime().ToString('u'))" -ForegroundColor Cyan
    Write-Host ""
    foreach ($k in $sources.Keys) {
        $s = $sources[$k]
        $col = if ($s.state -eq 'present') { 'Green' } else { 'Yellow' }
        Write-Host ("  {0,-34} {1,-8} bytes={2}" -f $k, $s.state, $s.bytes) -ForegroundColor $col
    }
    Write-Host ""
    Write-Host "Historial: $($hist.Count) llamadas   APK-relacionadas: $($apkHits.Count)  ($(if($null -ne $apkRatio){$apkRatio}else{'n/d'}) %)" -ForegroundColor White
    if ($apkHits.Count -gt 0) { $apkHits | Select-Object -Last 5 | Format-Table -AutoSize }
    Write-Host "Hoy ($todayLabel): $todayCalls llamadas" -ForegroundColor White
    if ($todayCalls -gt 0) {
        $todayToolsClean.GetEnumerator() | Sort-Object Value -Descending |
            Select-Object -First 10 | ForEach-Object { Write-Host ("   {0,5}  {1}" -f $_.Value, $_.Key) }
    }
    Write-Host ""
    Write-Host "Relay del device:" -ForegroundColor White
    $relay | Format-Table file, bytes, tool_calls, successes, channel_error, token_refresh -AutoSize | Out-String | Write-Host
    Write-Host ""
    switch ($verdict) {
        'NO_HACE_TRABAJO_DE_APK' {
            Write-Host "VEREDICTO: NO_HACE_TRABAJO_DE_APK" -ForegroundColor Yellow
            Write-Host "  Desktop Commander no ha tocado la APK. El avance de la APK NO se lee aqui:" -ForegroundColor Yellow
            Write-Host "  -> git log -1 ; divergencia con master ; /ara/version.json del VPS ; sha256 del APK." -ForegroundColor Yellow
        }
        'TRABAJO_APK_MARGINAL'     { Write-Host "VEREDICTO: TRABAJO_APK_MARGINAL (revisar apk_hits)" -ForegroundColor Yellow }
        'TRABAJO_APK_ACTIVO'       { Write-Host "VEREDICTO: TRABAJO_APK_ACTIVO" -ForegroundColor Green }
        default                    { Write-Host "VEREDICTO: $verdict" -ForegroundColor Yellow }
    }
    if ($archivedTo) { Write-Host "Logs archivados en: $archivedTo" -ForegroundColor DarkGray }
}

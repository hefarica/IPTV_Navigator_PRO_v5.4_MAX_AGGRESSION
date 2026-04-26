$ErrorActionPreference = 'Stop'
$xl = [Runtime.InteropServices.Marshal]::GetActiveObject('Excel.Application')
$wb = $null
foreach ($b in $xl.Workbooks) { if ($b.Name -eq 'APE_M3U8_LAB_v8_FIXED.xlsm') { $wb = $b; break } }
if (-not $wb) { throw "Abrir APE_M3U8_LAB_v8_FIXED.xlsm primero" }
$ws = $wb.Sheets.Item('6_NIVEL_2_PROFILES')
$lastRow = $ws.Cells($ws.Rows.Count, 1).End(-4162).Row  # xlUp = -4162

$rows = @()
for ($r = 1; $r -le $lastRow; $r++) {
    $key = [string]$ws.Cells($r, 1).Value2
    $p0  = [string]$ws.Cells($r, 2).Value2
    $p1  = [string]$ws.Cells($r, 3).Value2
    $p2  = [string]$ws.Cells($r, 4).Value2
    $p3  = [string]$ws.Cells($r, 5).Value2
    $p4  = [string]$ws.Cells($r, 6).Value2
    $p5  = [string]$ws.Cells($r, 7).Value2
    $rows += [PSCustomObject]@{ row=$r; key=$key; P0=$p0; P1=$p1; P2=$p2; P3=$p3; P4=$p4; P5=$p5 }
}
$rows | Export-Csv -Path 'C:/tmp/lab_ext/schema_dump.tsv' -Delimiter "`t" -NoTypeInformation -Encoding UTF8

# Build schema map: derive section from dotted prefix
# Data rows are like "vlcopt.network-caching"; section headers are like "-- SETTINGS --"
$map = [ordered]@{ sections = [ordered]@{}; rows = [ordered]@{} }
foreach ($row in $rows) {
    $k = $row.key.Trim()
    if ($k -eq '') { continue }
    if ($k -cmatch '^-- .+ --$') { continue }                    # explicit section header line
    if ($k -match '^[#=─-]+$') { continue }                      # separator line
    if ($k -notmatch '^[A-Za-z][A-Za-z0-9_]*\.') { continue }    # must have <section>.<key>; otherwise skip (not a calibratable row)

    $dotIdx = $k.IndexOf('.')
    $section = $k.Substring(0, $dotIdx)
    $subkey  = $k.Substring($dotIdx + 1)

    $map.rows[$k] = [ordered]@{ row = [int]$row.row; section = $section; subkey = $subkey }
    if (-not $map.sections.Contains($section)) { $map.sections[$section] = @() }
    $map.sections[$section] += $k
}

$map | ConvertTo-Json -Depth 6 | Set-Content -Path 'C:/tmp/lab_ext/schema_map.json' -Encoding UTF8

$secCounts = $map.sections.Keys | ForEach-Object { "$_=$($map.sections[$_].Count)" }
Write-Host "Dumped $($rows.Count) rows. Map has $($map.rows.Count) calibratable keys across $($map.sections.Count) sections:"
Write-Host "  $($secCounts -join ', ')"

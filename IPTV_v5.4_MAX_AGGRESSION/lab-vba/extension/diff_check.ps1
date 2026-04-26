$ErrorActionPreference = 'Stop'
$json = Get-Content 'C:/Users/HFRC/Downloads/LAB_SNAPSHOT_20260426_1020.json' -Raw | ConvertFrom-Json
$labMap = Get-Content 'C:/tmp/lab_ext/schema_map.json' -Raw | ConvertFrom-Json
$secMap = @{
    'settings' = 'settings'
    'vlcopt' = 'vlcopt'
    'kodiprop' = 'kodiprop'
    'headerOverrides' = 'headerOverrides'
    'headers' = 'headers'
    'hlsjs' = 'hlsjs'
    'prefetch_config' = 'prefetch_config'
    'quality_levels' = 'quality_levels'
}
foreach ($jsonSec in $secMap.Keys) {
    $labSec = $secMap[$jsonSec]
    $jsonObj = $json.profiles_snapshot.P0.$jsonSec
    if (-not $jsonObj) { Write-Host "[$jsonSec] JSON missing - skip"; continue }
    $jsonKeys = ($jsonObj.PSObject.Properties.Name) | Sort-Object
    $labFullKeys = $labMap.sections.$labSec
    if (-not $labFullKeys) { $labFullKeys = @() }
    $labSubKeys = $labFullKeys | ForEach-Object { $_.Substring($_.IndexOf('.') + 1) } | Sort-Object
    $only_json = $jsonKeys | Where-Object { $_ -notin $labSubKeys }
    $only_lab  = $labSubKeys | Where-Object { $_ -notin $jsonKeys }
    $matched   = ($jsonKeys | Where-Object { $_ -in $labSubKeys }).Count
    Write-Host ("[{0}] JSON={1} LAB={2} matched={3} only_in_json={4} only_in_lab={5}" -f $jsonSec, $jsonKeys.Count, $labSubKeys.Count, $matched, $only_json.Count, $only_lab.Count)
}

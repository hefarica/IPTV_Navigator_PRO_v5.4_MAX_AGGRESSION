$file = "C:\Users\HFRC\Downloads\APE_TYPED_ARRAYS_ULTIMATE_20260330 (5).m3u8"
Write-Host "--- APE LIST AUDIT START ---"
Write-Host "File: $file"
Write-Host "Size: $((Get-Item $file).length / 1MB) MB"

$lines = Get-Content $file
Write-Host "Lines: $($lines.Count)"

$extinf = ($lines | Where-Object { $_ -match "^#EXTINF" }).Count
Write-Host "EXTINF: $extinf"

$extvlcopt = ($lines | Where-Object { $_ -match "^#EXTVLCOPT" }).Count
Write-Host "EXTVLCOPT: $extvlcopt"

$kodiprop = ($lines | Where-Object { $_ -match "^#KODIPROP" }).Count
Write-Host "KODIPROP: $kodiprop"

$extxape = ($lines | Where-Object { $_ -match "^#EXT-X-APE" }).Count
Write-Host "EXT-X-APE: $extxape"

$exthttp = ($lines | Where-Object { $_ -match "^#EXTHTTP" }).Count
Write-Host "EXTHTTP: $exthttp"

$fallback = ($lines | Where-Object { $_ -match "^#FALLBACK-DIRECT" }).Count
Write-Host "FALLBACK-DIRECT: $fallback"

$resolverUrlCount = ($lines | Where-Object { $_ -match "resolve_quality" }).Count
Write-Host "resolve_quality URLs: $resolverUrlCount"

$urlSample = $lines | Where-Object { $_ -match "resolve_quality" } | Select-Object -First 1
Write-Host "Sample URL Length: $($urlSample.Length)"

$ctxSample = [regex]::match($urlSample, "ctx=([^&]+)").Value
if ($ctxSample) {
    Write-Host "Sample ctx= Length: $($ctxSample.Length)"
    if ($ctxSample -match "%3D") {
        Write-Host "WARNING: URL Encoded %3D found in ctx! Double-encode bug present."
    }
}

# Check for Audio Crash bugs
$forceAtmos = ($lines | Where-Object { $_ -match "dolby_atmos=true" }).Count
Write-Host "Hardcoded dolby_atmos=true count: $forceAtmos"

$audioTrackSel = ($lines | Where-Object { $_ -match "X-Audio-Track-Selection.*?highest-quality-extreme" }).Count
Write-Host "Hardcoded X-Audio-Track-Selection (highest-quality-extreme) count: $audioTrackSel"

$audioTrackDefault = ($lines | Where-Object { $_ -match "X-Audio-Track-Selection.*default" }).Count
Write-Host "Safe X-Audio-Track-Selection (default) count: $audioTrackDefault"

Write-Host "--- APE LIST AUDIT COMPLETE ---"

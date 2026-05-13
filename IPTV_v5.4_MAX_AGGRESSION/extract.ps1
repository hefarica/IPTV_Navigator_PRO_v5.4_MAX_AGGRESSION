$path = "C:\Users\HFRC\Downloads\APE_SNIPER_MODE_v2_Guia_Integracion HOY.docx"
$zipPath = "$env:TEMP\docx_ext2.zip"
Copy-Item $path -Destination $zipPath -Force
$tempDir = "$env:TEMP\docx_ext2"
Expand-Archive -Path $zipPath -DestinationPath $tempDir -Force
$xmlContent = Get-Content "$tempDir\word\document.xml" -Raw
$text = $xmlContent -replace '</w:p>', "`n" -replace '<[^>]+>', ''
$text | Out-File -FilePath "C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\IPTV_v5.4_MAX_AGGRESSION\docx_content.txt" -Encoding utf8

$files = Get-ChildItem -Path "c:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\IPTV_v5.4_MAX_AGGRESSION" -Include *.php, *.js -Recurse | Where-Object { $_.Name -notlike '*.bak*' }
foreach ($f in $files) {
    if (Test-Path $f.FullName) {
        $content = [System.IO.File]::ReadAllText($f.FullName)
        [System.IO.File]::WriteAllText($f.FullName, $content, [System.Text.Encoding]::UTF8)
    }
}

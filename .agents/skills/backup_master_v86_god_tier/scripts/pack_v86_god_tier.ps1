$workingDir = (Get-Location).Path
$dateStr = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupDir = "C:\Users\HFRC\Desktop\IPTV_Backups_Master"

if (!(Test-Path -Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

$zipPath = "$backupDir\V86.0-GOD-TIER_Master_Backup_$dateStr.zip"

Write-Host "Iniciando Empaquetamiento GOD-TIER (Nivel 1% Uniqueness)..."
Write-Host "Ruta origen: $workingDir\iptv_nav"

# Compresion del codigo duro
Compress-Archive -Path "iptv_nav" -DestinationPath $zipPath -Force

Write-Host "Backup Inmutable GOD-TIER Creado Exitosamente!"
Write-Host "Ubicacion: $zipPath"
Write-Host "Este archivo contiene la correccion del Ghost Protocol, motor de Typed Arrays y los scripts de VPS."

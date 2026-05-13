# ============================================
# IPTV Navigator PRO - Auto-Start Installer
# Configura inicio robusto con Windows
# (Sin permisos de administrador)
# ============================================

$ErrorActionPreference = "SilentlyContinue"

$RobustStarter = Join-Path $PSScriptRoot "start_server_robust.ps1"
$StartupFolder = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $StartupFolder "IPTV Probe Server.lnk"

# Verify scripts exist
if (-not (Test-Path $RobustStarter)) {
    Write-Host "ERROR: start_server_robust.ps1 no encontrado" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  IPTV Probe Server - Auto-Start Installer" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Remove existing shortcut if exists
if (Test-Path $ShortcutPath) {
    Remove-Item $ShortcutPath -Force
}

# Create WScript Shell
$WshShell = New-Object -ComObject WScript.Shell

# Create shortcut that runs PowerShell with robust starter
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$RobustStarter`" -Silent"
$Shortcut.WorkingDirectory = $PSScriptRoot
$Shortcut.Description = "IPTV Navigator PRO - Robust Probe Server Starter"
$Shortcut.WindowStyle = 7  # Minimized
$Shortcut.Save()

Write-Host "INSTALACION COMPLETADA" -ForegroundColor Green
Write-Host ""
Write-Host "Caracteristicas:" -ForegroundColor White
Write-Host "  - Auto-limpieza de puerto si esta ocupado" -ForegroundColor Gray
Write-Host "  - 3 reintentos automaticos si falla" -ForegroundColor Gray
Write-Host "  - Verificacion de salud antes de confirmar" -ForegroundColor Gray
Write-Host "  - Se ejecuta silenciosamente al iniciar Windows" -ForegroundColor Gray
Write-Host ""
Write-Host "Ubicacion:" -ForegroundColor Yellow
Write-Host "  $ShortcutPath" -ForegroundColor Gray
Write-Host ""
Write-Host "Para desinstalar: .\uninstall_autostart.ps1" -ForegroundColor Yellow
Write-Host ""

# Start now
Write-Host "Iniciando servidor ahora..." -ForegroundColor Cyan
& $RobustStarter

Write-Host ""

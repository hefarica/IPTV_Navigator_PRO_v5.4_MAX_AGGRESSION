# ============================================
# IPTV Navigator PRO - Auto-Start Uninstaller
# Elimina el inicio automatico del Probe Server y Watchdog
# ============================================

$StartupFolder = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $StartupFolder "IPTV Probe Server.lnk"
$WatchdogShortcut = Join-Path $StartupFolder "IPTV Watchdog.lnk"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  IPTV Probe Server - Uninstaller" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Remove startup shortcuts
if (Test-Path $ShortcutPath) {
    Remove-Item $ShortcutPath -Force
    Write-Host "Acceso directo Probe Server eliminado" -ForegroundColor Green
}

if (Test-Path $WatchdogShortcut) {
    Remove-Item $WatchdogShortcut -Force
    Write-Host "Acceso directo Watchdog eliminado" -ForegroundColor Green
}

# Kill probe server
$probeProcesses = Get-Process -Name "stream_probe_server" -ErrorAction SilentlyContinue
if ($probeProcesses) {
    $probeProcesses | Stop-Process -Force
    Write-Host "Probe Server detenido" -ForegroundColor Green
}

# Kill watchdog (PowerShell process running watchdog.ps1)
$watchdogProcesses = Get-WmiObject Win32_Process | Where-Object { 
    $_.CommandLine -like "*watchdog.ps1*" 
}
if ($watchdogProcesses) {
    $watchdogProcesses | ForEach-Object { 
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue 
    }
    Write-Host "Watchdog detenido" -ForegroundColor Green
}

Write-Host ""
Write-Host "Desinstalacion completada" -ForegroundColor Green
Write-Host ""

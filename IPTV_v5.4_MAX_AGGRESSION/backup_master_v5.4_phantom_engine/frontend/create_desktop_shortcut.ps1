# Create Desktop Shortcut for IPTV Navigator PRO
# This script creates a shortcut on the desktop with APE branding

$ErrorActionPreference = "SilentlyContinue"

# Get paths
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $DesktopPath "IPTV Navigator PRO.lnk"
$TargetPath = Join-Path $ScriptDir "start_iptv_navigator.bat"
$IconPath = Join-Path $ScriptDir "icons\ape-navigator.ico"
$WorkingDir = $ScriptDir

# Create ICO from SVG using ImageMagick if available, otherwise use default
$SvgPath = Join-Path $ScriptDir "icons\ape-navigator.svg"

# Check if we need to create ICO
if (-not (Test-Path $IconPath)) {
    # Try to use ImageMagick
    $magick = Get-Command magick -ErrorAction SilentlyContinue
    if ($magick) {
        Write-Host "Convirtiendo SVG a ICO..." -ForegroundColor Cyan
        & magick convert $SvgPath -define icon:auto-resize=256,128,64,48,32,16 $IconPath
    } else {
        # Use system satellite dish icon
        Write-Host "Usando icono del sistema" -ForegroundColor Yellow
        $IconPath = "C:\Windows\System32\shell32.dll,13"
    }
}

# Create WScript Shell object
$WshShell = New-Object -ComObject WScript.Shell

# Create shortcut
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $TargetPath
$Shortcut.WorkingDirectory = $WorkingDir
$Shortcut.Description = "IPTV Navigator PRO - APE Engine v9.0"
$Shortcut.WindowStyle = 1  # Normal window

# Set icon
if (Test-Path $IconPath) {
    $Shortcut.IconLocation = $IconPath
} elseif ($IconPath -like "*shell32*") {
    $Shortcut.IconLocation = $IconPath
}

# Save shortcut
$Shortcut.Save()

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  ACCESO DIRECTO CREADO" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Ubicacion: $DesktopPath" -ForegroundColor White
Write-Host "  Nombre: IPTV Navigator PRO.lnk" -ForegroundColor White
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Haz doble clic en el acceso directo para iniciar" -ForegroundColor Green
Write-Host ""

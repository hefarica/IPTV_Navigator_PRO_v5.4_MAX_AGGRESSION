# ============================================
# ROBUST PROBE SERVER STARTER
# Auto-limpia puerto, reinicia si falla
# Incluye FFmpeg en PATH automáticamente
# ============================================

param(
    [switch]$Silent
)

$ServerPort = 8765
$ServerExe = Join-Path $PSScriptRoot "target\release\stream_probe_server.exe"
$MaxRetries = 3

# Ensure FFmpeg is in PATH
$ffmpegPath = "C:\Users\HFRC\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin"
if (Test-Path $ffmpegPath) {
    if ($env:PATH -notlike "*$ffmpegPath*") {
        $env:PATH = "$ffmpegPath;$env:PATH"
    }
}

function Write-Log {
    param($Message, $Color = "White")
    if (-not $Silent) {
        Write-Host $Message -ForegroundColor $Color
    }
}

function Get-PortProcess {
    param($Port)
    $netstat = netstat -ano | Select-String ":$Port\s+.*LISTENING"
    if ($netstat -match "\s+(\d+)\s*$") {
        return [int]$matches[1]
    }
    return $null
}

function Clear-Port {
    param($Port)
    $procId = Get-PortProcess -Port $Port
    if ($procId) {
        Write-Log "Puerto $Port ocupado por PID $procId - Liberando..." "Yellow"
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        
        # Verify cleared
        $check = Get-PortProcess -Port $Port
        if ($check) {
            Write-Log "ERROR: No se pudo liberar el puerto" "Red"
            return $false
        }
        Write-Log "Puerto liberado" "Green"
    }
    return $true
}

function Test-ServerHealth {
    try {
        $response = Invoke-RestMethod -Uri "http://127.0.0.1:$ServerPort/health" -TimeoutSec 3 -ErrorAction Stop
        return $response.status -eq "OK"
    } catch {
        return $false
    }
}

function Start-ProbeServer {
    Write-Log "Iniciando Probe Server..." "Cyan"
    Start-Process -FilePath $ServerExe -WorkingDirectory $PSScriptRoot -WindowStyle Minimized
    Start-Sleep -Seconds 3
    return Test-ServerHealth
}

# === MAIN ===

Write-Log "=== ROBUST PROBE SERVER STARTER ===" "Cyan"

# 1. Clear port if occupied
if (-not (Clear-Port -Port $ServerPort)) {
    Write-Log "FALLO: No se pudo preparar el puerto" "Red"
    exit 1
}

# 2. Check if already running and healthy
if (Test-ServerHealth) {
    Write-Log "Servidor ya activo y saludable" "Green"
    exit 0
}

# 3. Start with retries
for ($i = 1; $i -le $MaxRetries; $i++) {
    Write-Log "Intento $i de $MaxRetries..." "Yellow"
    
    if (Start-ProbeServer) {
        Write-Log "SERVIDOR ACTIVO!" "Green"
        
        # Show status
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$ServerPort/health" -TimeoutSec 3
        Write-Log "  Version: $($health.version)" "Gray"
        Write-Log "  Concurrent: $($health.max_concurrent)" "Gray"
        Write-Log "  FFprobe: $($health.ffprobe_available)" "Gray"
        
        exit 0
    }
    
    Write-Log "Fallo intento $i - limpiando..." "Yellow"
    Clear-Port -Port $ServerPort
    Start-Sleep -Seconds 2
}

Write-Log "ERROR: No se pudo iniciar el servidor despues de $MaxRetries intentos" "Red"
exit 1

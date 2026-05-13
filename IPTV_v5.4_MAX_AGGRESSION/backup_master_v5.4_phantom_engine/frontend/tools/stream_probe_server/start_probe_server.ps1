# Stream Probe Server - Auto Start Script
# This script starts the Rust probe server in the background

$ServerPath = Join-Path $PSScriptRoot "target\release\stream_probe_server.exe"
$ServerUrl = "http://127.0.0.1:8765/health"

# Check if server is already running
try {
    $response = Invoke-RestMethod -Uri $ServerUrl -TimeoutSec 2 -ErrorAction Stop
    if ($response.status -eq "OK") {
        Write-Host "✅ Probe Server ya está corriendo" -ForegroundColor Green
        exit 0
    }
} catch {
    Write-Host "🚀 Iniciando Probe Server..." -ForegroundColor Cyan
}

# Check if executable exists
if (-not (Test-Path $ServerPath)) {
    Write-Host "❌ Ejecutable no encontrado: $ServerPath" -ForegroundColor Red
    Write-Host "   Ejecuta primero: cargo build --release" -ForegroundColor Yellow
    exit 1
}

# Start server in background
Start-Process -FilePath $ServerPath -WindowStyle Hidden

# Wait for server to be ready
$maxAttempts = 10
$attempt = 0
while ($attempt -lt $maxAttempts) {
    Start-Sleep -Milliseconds 500
    try {
        $response = Invoke-RestMethod -Uri $ServerUrl -TimeoutSec 2 -ErrorAction Stop
        if ($response.status -eq "OK") {
            Write-Host "✅ Probe Server iniciado correctamente" -ForegroundColor Green
            Write-Host "   URL: http://127.0.0.1:8765" -ForegroundColor Gray
            exit 0
        }
    } catch {
        $attempt++
    }
}

Write-Host "⚠️ Server iniciado pero no responde aún" -ForegroundColor Yellow
exit 0

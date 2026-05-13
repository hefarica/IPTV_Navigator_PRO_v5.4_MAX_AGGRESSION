# ============================================
# 🔄 Actualizar Frontend a HTTPS
# ============================================
# Este script actualiza todos los archivos JS para usar HTTPS
# ============================================

param(
    [Parameter(Mandatory=$true)]
    [string]$Domain = "gateway.iptv-navigator.com"
)

$ErrorActionPreference = "Stop"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "🔄 ACTUALIZANDO FRONTEND A HTTPS" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Configuración:" -ForegroundColor Yellow
Write-Host "   Dominio HTTPS: https://$Domain"
Write-Host ""

# Directorio base del proyecto
$baseDir = Split-Path -Parent $PSScriptRoot
$jsDir = Join-Path $baseDir "files\js"

# Archivos a actualizar
$filesToUpdate = @(
    "gateway-manager.js",
    "upload-manager-v1.js",
    "vps-monitor-v1.js",
    "vps-adapter.js"
)

$oldHttpUrl = "http://178.156.147.234"
$newHttpsUrl = "https://$Domain"

Write-Host "🔍 Buscando archivos..." -ForegroundColor Yellow

foreach ($file in $filesToUpdate) {
    $filePath = Join-Path $jsDir $file
    
    if (-not (Test-Path $filePath)) {
        Write-Host "⚠️  Archivo no encontrado: $file" -ForegroundColor Yellow
        continue
    }
    
    Write-Host ""
    Write-Host "📝 Actualizando: $file" -ForegroundColor Cyan
    
    # Leer contenido
    $content = Get-Content $filePath -Raw -Encoding UTF8
    $originalContent = $content
    
    # Reemplazar URLs HTTP por HTTPS
    $content = $content -replace [regex]::Escape($oldHttpUrl), $newHttpsUrl
    
    # Reemplazos específicos por archivo
    switch ($file) {
        "gateway-manager.js" {
            # Buscar: vps_url: 'http://...'
            $content = $content -replace "vps_url:\s*['`"]http://[^'`"]+['`"]", "vps_url: '$newHttpsUrl'"
            # Buscar: 'http://178.156.147.234'
            $content = $content -replace "'http://178\.156\.147\.234'", "'$newHttpsUrl'"
            $content = $content -replace '"http://178\.156\.147\.234"', "`"$newHttpsUrl`""
        }
        "upload-manager-v1.js" {
            $content = $content -replace "defaultVPS\s*=\s*['`"]http://[^'`"]+['`"]", "defaultVPS = '$newHttpsUrl'"
        }
        "vps-monitor-v1.js" {
            $content = $content -replace "defaultVPS\s*=\s*['`"]http://[^'`"]+['`"]", "defaultVPS = '$newHttpsUrl'"
        }
        "vps-adapter.js" {
            $content = $content -replace "baseUrl:\s*['`"]http://[^'`"]+['`"]", "baseUrl: '$newHttpsUrl'"
            $content = $content -replace "useHttps:\s*(false|true)", "useHttps: true"
        }
    }
    
    # Verificar si hubo cambios
    if ($content -eq $originalContent) {
        Write-Host "   ℹ️  Sin cambios necesarios" -ForegroundColor Gray
    } else {
        # Backup del archivo original
        $backupPath = "$filePath.backup.$(Get-Date -Format 'yyyyMMdd_HHmmss')"
        Copy-Item $filePath $backupPath
        Write-Host "   💾 Backup creado: $(Split-Path -Leaf $backupPath)" -ForegroundColor Gray
        
        # Guardar cambios
        $content | Out-File -FilePath $filePath -Encoding UTF8 -NoNewline
        Write-Host "   ✅ Actualizado exitosamente" -ForegroundColor Green
        
        # Mostrar cambios
        $changes = (Compare-Object ($originalContent -split "`n") ($content -split "`n") | Where-Object { $_.SideIndicator -eq "=>" }).Count
        Write-Host "   📊 Líneas modificadas: $changes" -ForegroundColor Cyan
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "✅ ACTUALIZACIÓN COMPLETA" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Resumen:" -ForegroundColor Yellow
Write-Host "   ✅ Archivos actualizados: $($filesToUpdate.Count)"
Write-Host "   🔗 Nueva URL: $newHttpsUrl"
Write-Host ""
Write-Host "📝 PRÓXIMOS PASOS:" -ForegroundColor Yellow
Write-Host "   1. Recarga la página (Ctrl+Shift+R)" -ForegroundColor White
Write-Host "   2. Verifica en consola: window.gatewayManager?.config?.vps_url" -ForegroundColor White
Write-Host "   3. Prueba upload de archivo M3U8" -ForegroundColor White
Write-Host ""
Write-Host "🔄 Si necesitas revertir:" -ForegroundColor Yellow
Write-Host "   Los backups están en: $jsDir\*.backup.*" -ForegroundColor Gray
Write-Host ""

# ============================================
# 🚀 IPTV Navigator PRO - Deploy HTTPS Completo
# ============================================
# PowerShell script para configurar HTTPS en Hetzner VPS
# ============================================

param(
    [string]$Domain = "gateway.iptv-navigator.com",
    [string]$Email = "admin@iptv-navigator.com",
    [string]$VPS_IP = "178.156.147.234"
)

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "🔒 CONFIGURACIÓN HTTPS - IPTV Navigator PRO" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Configuración:" -ForegroundColor Yellow
Write-Host "   Dominio: $Domain"
Write-Host "   Email: $Email"
Write-Host "   IP: $VPS_IP"
Write-Host ""

$confirm = Read-Host "¿Continuar? (y/n)"
if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "❌ Cancelado" -ForegroundColor Red
    exit 1
}

# ============================================
# PASO 1: Subir script de setup
# ============================================
Write-Host ""
Write-Host "📤 PASO 1: Subiendo script de setup..." -ForegroundColor Yellow
scp -o StrictHostKeyChecking=no ".\setup-https-hetzner.sh" "root@${VPS_IP}:/root/setup-https-hetzner.sh"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error subiendo script" -ForegroundColor Red
    exit 1
}

# ============================================
# PASO 2: Ejecutar script en VPS
# ============================================
Write-Host ""
Write-Host "🚀 PASO 2: Ejecutando setup en VPS..." -ForegroundColor Yellow
ssh -o StrictHostKeyChecking=no "root@${VPS_IP}" "chmod +x /root/setup-https-hetzner.sh && /root/setup-https-hetzner.sh '$Domain' '$Email'"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error ejecutando setup" -ForegroundColor Red
    exit 1
}

# ============================================
# PASO 3: Subir configuración Nginx HTTPS
# ============================================
Write-Host ""
Write-Host "📤 PASO 3: Subiendo configuración Nginx..." -ForegroundColor Yellow

# Reemplazar dominio en el archivo temporal
$nginxConfig = Get-Content ".\nginx-m3u8-site-https.conf" -Raw
$nginxConfig = $nginxConfig -replace "gateway\.iptv-navigator\.com", $Domain
$tempFile = [System.IO.Path]::GetTempFileName()
$nginxConfig | Out-File -FilePath $tempFile -Encoding UTF8

scp -o StrictHostKeyChecking=no $tempFile "root@${VPS_IP}:/tmp/nginx-m3u8-site-https.conf"
Remove-Item $tempFile

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error subiendo configuración Nginx" -ForegroundColor Red
    exit 1
}

# ============================================
# PASO 4: Aplicar configuración Nginx
# ============================================
Write-Host ""
Write-Host "🔧 PASO 4: Aplicando configuración Nginx..." -ForegroundColor Yellow
ssh -o StrictHostKeyChecking=no "root@${VPS_IP}" @"
    # Backup configuración actual
    cp /etc/nginx/sites-enabled/m3u8 /etc/nginx/sites-enabled/m3u8.backup.$(date +%Y%m%d_%H%M%S)
    
    # Reemplazar con nueva configuración
    cp /tmp/nginx-m3u8-site-https.conf /etc/nginx/sites-enabled/m3u8
    
    # Verificar sintaxis
    nginx -t
    if [ \$? -eq 0 ]; then
        systemctl reload nginx
        echo '✅ Nginx recargado exitosamente'
    else
        echo '❌ Error en configuración Nginx'
        exit 1
    fi
"@

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error aplicando configuración Nginx" -ForegroundColor Red
    exit 1
}

# ============================================
# PASO 5: Verificar HTTPS
# ============================================
Write-Host ""
Write-Host "🧪 PASO 5: Verificando HTTPS..." -ForegroundColor Yellow
$httpsTest = ssh -o StrictHostKeyChecking=no "root@${VPS_IP}" "curl -I https://${Domain}/health 2>&1 | head -5"
Write-Host $httpsTest

if ($httpsTest -match "HTTP/2 200" -or $httpsTest -match "HTTP/1.1 200") {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "✅ HTTPS CONFIGURADO EXITOSAMENTE" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "🔗 URL HTTPS: https://${Domain}" -ForegroundColor Cyan
    Write-Host "🧪 Test: curl -I https://${Domain}/health" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "📝 PRÓXIMO PASO:" -ForegroundColor Yellow
    Write-Host "   Actualiza gateway-manager.js con:" -ForegroundColor White
    Write-Host "   vps_url: 'https://${Domain}'" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host "⚠️  HTTPS puede no estar funcionando correctamente" -ForegroundColor Yellow
    Write-Host "   Verifica los logs: ssh root@${VPS_IP} 'tail -50 /var/log/nginx/error.log'" -ForegroundColor Yellow
}

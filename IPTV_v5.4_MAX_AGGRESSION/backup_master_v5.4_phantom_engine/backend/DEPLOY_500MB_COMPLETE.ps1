# ============================================
# 🚀 IPTV Navigator PRO - Deploy 500MB Support
# ============================================
# Ejecutar desde PowerShell como Administrador
# ============================================

$VPS_IP = "178.156.147.234"
$VPS_USER = "root"
$LOCAL_PATH = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "🚀 DEPLOY 500MB SUPPORT TO VPS" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ============================================
# PASO 1: Subir archivos PHP
# ============================================
Write-Host "📦 PASO 1: Subiendo archivos PHP..." -ForegroundColor Yellow

$phpFiles = @(
    "health.php",
    "upload.php",
    "upload_chunk.php",
    "upload_status.php",
    "finalize_upload.php"
)

foreach ($file in $phpFiles) {
    $localFile = Join-Path $LOCAL_PATH $file
    if (Test-Path $localFile) {
        Write-Host "   📄 Subiendo $file..." -ForegroundColor Gray
        scp $localFile "${VPS_USER}@${VPS_IP}:/var/www/m3u8/"
    } else {
        Write-Host "   ⚠️ $file no encontrado" -ForegroundColor Red
    }
}

Write-Host "✅ Archivos PHP subidos" -ForegroundColor Green
Write-Host ""

# ============================================
# PASO 2: Subir configuración nginx
# ============================================
Write-Host "📦 PASO 2: Subiendo configuración nginx..." -ForegroundColor Yellow

$nginxConf = Join-Path $LOCAL_PATH "nginx-m3u8-site.conf"
if (Test-Path $nginxConf) {
    scp $nginxConf "${VPS_USER}@${VPS_IP}:/etc/nginx/sites-available/m3u8"
    Write-Host "✅ nginx-m3u8-site.conf subido" -ForegroundColor Green
} else {
    Write-Host "❌ nginx-m3u8-site.conf no encontrado" -ForegroundColor Red
}
Write-Host ""

# ============================================
# PASO 3: Configurar PHP y reiniciar servicios
# ============================================
Write-Host "⚙️ PASO 3: Configurando PHP para 500MB y reiniciando servicios..." -ForegroundColor Yellow

$remoteCommands = @"
#!/bin/bash
set -e

echo "🔧 Configurando PHP..."

# Detectar versión de PHP
PHP_VERSION=\$(php -r "echo PHP_MAJOR_VERSION.'.'.PHP_MINOR_VERSION;")
PHP_INI="/etc/php/\$PHP_VERSION/fpm/php.ini"

echo "   PHP Version: \$PHP_VERSION"
echo "   Config file: \$PHP_INI"

# Backup
cp \$PHP_INI \${PHP_INI}.bak.\$(date +%Y%m%d_%H%M%S)

# Configurar límites para 500MB
sed -i 's/^upload_max_filesize = .*/upload_max_filesize = 600M/' \$PHP_INI
sed -i 's/^post_max_size = .*/post_max_size = 600M/' \$PHP_INI
sed -i 's/^memory_limit = .*/memory_limit = 1024M/' \$PHP_INI
sed -i 's/^max_execution_time = .*/max_execution_time = 600/' \$PHP_INI
sed -i 's/^max_input_time = .*/max_input_time = 600/' \$PHP_INI

echo "✅ PHP configurado para 500MB"

# Crear directorios necesarios
mkdir -p /var/www/m3u8/chunks
mkdir -p /var/www/m3u8/versions
chown -R www-data:www-data /var/www/m3u8
chmod -R 755 /var/www/m3u8

echo "✅ Directorios creados"

# Verificar configuración nginx
echo "🔧 Verificando nginx..."
nginx -t

# Reiniciar servicios
echo "🔄 Reiniciando servicios..."
systemctl restart php\$PHP_VERSION-fpm
systemctl reload nginx

echo "✅ Servicios reiniciados"

# Verificar health
echo ""
echo "🏥 Verificando health endpoint..."
curl -s http://localhost/health | python3 -m json.tool || curl -s http://localhost/health

echo ""
echo "============================================"
echo "✅ DEPLOY COMPLETADO"
echo "============================================"
"@

# Ejecutar comandos remotos
$remoteCommands | ssh "${VPS_USER}@${VPS_IP}" "bash -s"

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "✅ DEPLOY COMPLETADO" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "🧪 PRUEBA MANUAL:" -ForegroundColor Cyan
Write-Host "   curl http://$VPS_IP/health" -ForegroundColor White
Write-Host ""
Write-Host "📊 LÍMITES CONFIGURADOS:" -ForegroundColor Cyan
Write-Host "   - Upload máximo: 600MB" -ForegroundColor White
Write-Host "   - Memoria PHP: 1024MB" -ForegroundColor White
Write-Host "   - Timeout: 600s (10 min)" -ForegroundColor White
Write-Host ""

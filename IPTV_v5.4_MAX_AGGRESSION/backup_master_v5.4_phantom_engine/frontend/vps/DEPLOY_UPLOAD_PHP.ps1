# ============================================
# DEPLOY upload.php a VPS Hetzner
# Ejecutar desde PowerShell como Administrador
# ============================================

$VPS_IP = "178.156.147.234"
$VPS_USER = "root"
$LOCAL_PATH = "c:\Users\HFRC\Desktop\IPTV_Navigator_PRO\iptv_nav\files\vps"

Write-Host @"
============================================================
     DEPLOY upload.php a VPS Hetzner
============================================================
VPS: $VPS_USER@$VPS_IP
Archivos: upload.php, nginx-m3u8-site.conf
============================================================
"@ -ForegroundColor Cyan

# Verificar archivos locales
Write-Host "`n[1/7] Verificando archivos locales..." -ForegroundColor Yellow
if (!(Test-Path "$LOCAL_PATH\upload.php")) {
    Write-Host "ERROR: No se encuentra upload.php" -ForegroundColor Red
    exit 1
}
if (!(Test-Path "$LOCAL_PATH\nginx-m3u8-site.conf")) {
    Write-Host "ERROR: No se encuentra nginx-m3u8-site.conf" -ForegroundColor Red
    exit 1
}
Write-Host "   OK: Archivos encontrados" -ForegroundColor Green

# Copiar upload.php
Write-Host "`n[2/7] Copiando upload.php al VPS..." -ForegroundColor Yellow
scp "$LOCAL_PATH\upload.php" "${VPS_USER}@${VPS_IP}:/var/www/m3u8/upload.php"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Fallo al copiar upload.php" -ForegroundColor Red
    exit 1
}
Write-Host "   OK: upload.php copiado" -ForegroundColor Green

# Copiar nginx config
Write-Host "`n[3/7] Copiando nginx-m3u8-site.conf al VPS..." -ForegroundColor Yellow
scp "$LOCAL_PATH\nginx-m3u8-site.conf" "${VPS_USER}@${VPS_IP}:/etc/nginx/sites-available/m3u8"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Fallo al copiar nginx config" -ForegroundColor Red
    exit 1
}
Write-Host "   OK: nginx config copiado" -ForegroundColor Green

# Ejecutar comandos en el VPS
Write-Host "`n[4/7] Instalando PHP-FPM en el VPS..." -ForegroundColor Yellow
ssh ${VPS_USER}@${VPS_IP} "apt update && apt install -y php-fpm php-cli"
Write-Host "   OK: PHP-FPM instalado" -ForegroundColor Green

Write-Host "`n[5/7] Configurando permisos..." -ForegroundColor Yellow
$commands = @"
# Crear directorio de versiones
mkdir -p /var/www/m3u8/versions

# Permisos
chown -R www-data:www-data /var/www/m3u8
chmod 755 /var/www/m3u8
chmod 644 /var/www/m3u8/upload.php
chmod 775 /var/www/m3u8/versions

# Detectar version de PHP-FPM
PHP_SOCK=`$(ls /var/run/php/php*-fpm.sock 2>/dev/null | head -1)
if [ -z "`$PHP_SOCK" ]; then
    echo "ERROR: No se encuentra socket PHP-FPM"
    exit 1
fi
echo "PHP Socket: `$PHP_SOCK"

# Actualizar nginx config con la version correcta de PHP
sed -i "s|unix:/var/run/php/php-fpm.sock|unix:`$PHP_SOCK|g" /etc/nginx/sites-available/m3u8
"@
ssh ${VPS_USER}@${VPS_IP} $commands
Write-Host "   OK: Permisos configurados" -ForegroundColor Green

Write-Host "`n[6/7] Activando configuracion nginx..." -ForegroundColor Yellow
$nginxCommands = @"
# Eliminar default si existe
rm -f /etc/nginx/sites-enabled/default

# Habilitar site m3u8
ln -sf /etc/nginx/sites-available/m3u8 /etc/nginx/sites-enabled/m3u8

# Verificar config
nginx -t

# Recargar nginx
systemctl reload nginx

# Reiniciar PHP-FPM
systemctl restart php*-fpm
"@
ssh ${VPS_USER}@${VPS_IP} $nginxCommands
Write-Host "   OK: Nginx recargado" -ForegroundColor Green

Write-Host "`n[7/7] Verificando endpoint..." -ForegroundColor Yellow
$testResult = ssh ${VPS_USER}@${VPS_IP} "curl -s -o /dev/null -w '%{http_code}' http://localhost/upload.php"
Write-Host "   Status Code: $testResult"

if ($testResult -eq "405") {
    Write-Host "   OK: upload.php responde (405 = Method Not Allowed para GET, correcto)" -ForegroundColor Green
} elseif ($testResult -eq "200") {
    Write-Host "   OK: upload.php responde 200" -ForegroundColor Green
} else {
    Write-Host "   WARNING: Status inesperado: $testResult" -ForegroundColor Yellow
}

Write-Host @"

============================================================
     DEPLOY COMPLETADO
============================================================
Endpoint: http://$VPS_IP/upload.php
Health:   http://$VPS_IP/health
M3U8:     http://$VPS_IP/APE_ULTIMATE_v9.m3u8
============================================================
"@ -ForegroundColor Green

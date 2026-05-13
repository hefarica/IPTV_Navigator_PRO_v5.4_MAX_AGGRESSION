#!/bin/bash
# ============================================
# Setup PHP-FPM + upload.php en VPS Hetzner
# Ejecutar como root en el VPS
# ============================================

set -e  # Exit on error

echo "============================================"
echo "  Setup PHP-FPM para IPTV Navigator PRO"
echo "============================================"

# 1. Instalar PHP-FPM
echo ""
echo "[1/6] Instalando PHP-FPM..."
apt update
apt install -y php-fpm php-cli

# 2. Detectar version de PHP
echo ""
echo "[2/6] Detectando version de PHP..."
PHP_SOCK=$(ls /var/run/php/php*-fpm.sock 2>/dev/null | head -1)
if [ -z "$PHP_SOCK" ]; then
    echo "ERROR: No se encuentra socket PHP-FPM"
    exit 1
fi
echo "   Socket encontrado: $PHP_SOCK"

# 3. Actualizar nginx config
echo ""
echo "[3/6] Actualizando nginx config..."
sed -i "s|unix:/var/run/php/php-fpm.sock|unix:$PHP_SOCK|g" /etc/nginx/sites-available/m3u8

# 4. Configurar permisos
echo ""
echo "[4/6] Configurando permisos..."
mkdir -p /var/www/m3u8/versions
chown -R www-data:www-data /var/www/m3u8
chmod 755 /var/www/m3u8
chmod 644 /var/www/m3u8/upload.php
chmod 775 /var/www/m3u8/versions

# 5. Activar nginx site
echo ""
echo "[5/6] Activando nginx site..."
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/m3u8 /etc/nginx/sites-enabled/m3u8

# Verificar config
nginx -t
if [ $? -ne 0 ]; then
    echo "ERROR: nginx config invalida"
    exit 1
fi

# Recargar servicios
systemctl reload nginx
systemctl restart php*-fpm

# 6. Verificar
echo ""
echo "[6/6] Verificando..."
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' http://localhost/upload.php)
echo "   upload.php status: $HTTP_CODE"

if [ "$HTTP_CODE" = "405" ] || [ "$HTTP_CODE" = "200" ]; then
    echo ""
    echo "============================================"
    echo "  SETUP COMPLETADO EXITOSAMENTE"
    echo "============================================"
    echo "Endpoint: http://178.156.147.234/upload.php"
    echo "Health:   http://178.156.147.234/health"
    echo "============================================"
else
    echo ""
    echo "WARNING: Status inesperado: $HTTP_CODE"
    echo "Revisa los logs: tail -f /var/log/nginx/error.log"
fi

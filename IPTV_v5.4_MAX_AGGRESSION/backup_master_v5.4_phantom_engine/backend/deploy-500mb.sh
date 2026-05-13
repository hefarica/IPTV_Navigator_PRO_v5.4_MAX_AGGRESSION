#!/bin/bash
# ============================================
# 🚀 IPTV Navigator PRO - Deploy 500MB Support
# ============================================
# Ejecutar en el VPS directamente:
#   bash deploy-500mb.sh
# ============================================

set -e

echo "============================================"
echo "🚀 CONFIGURANDO VPS PARA 500MB"
echo "============================================"
echo ""

# ============================================
# PASO 1: Detectar versión de PHP
# ============================================
PHP_VERSION=$(php -r "echo PHP_MAJOR_VERSION.'.'.PHP_MINOR_VERSION;")
PHP_INI="/etc/php/$PHP_VERSION/fpm/php.ini"
PHP_FPM_SERVICE="php$PHP_VERSION-fpm"

echo "📦 PHP Version: $PHP_VERSION"
echo "📄 Config: $PHP_INI"
echo ""

# ============================================
# PASO 2: Backup configuración actual
# ============================================
echo "💾 Creando backup..."
cp $PHP_INI ${PHP_INI}.bak.$(date +%Y%m%d_%H%M%S)
cp /etc/nginx/sites-available/m3u8 /etc/nginx/sites-available/m3u8.bak.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true
echo "✅ Backup creado"
echo ""

# ============================================
# PASO 3: Configurar PHP para 500MB
# ============================================
echo "⚙️ Configurando PHP para 500MB..."

# Modificar php.ini
sed -i 's/^upload_max_filesize = .*/upload_max_filesize = 600M/' $PHP_INI
sed -i 's/^post_max_size = .*/post_max_size = 600M/' $PHP_INI
sed -i 's/^memory_limit = .*/memory_limit = 1024M/' $PHP_INI
sed -i 's/^max_execution_time = .*/max_execution_time = 600/' $PHP_INI
sed -i 's/^max_input_time = .*/max_input_time = 600/' $PHP_INI

# Si las líneas no existen, añadirlas
grep -q "^upload_max_filesize" $PHP_INI || echo "upload_max_filesize = 600M" >> $PHP_INI
grep -q "^post_max_size" $PHP_INI || echo "post_max_size = 600M" >> $PHP_INI
grep -q "^memory_limit" $PHP_INI || echo "memory_limit = 1024M" >> $PHP_INI
grep -q "^max_execution_time" $PHP_INI || echo "max_execution_time = 600" >> $PHP_INI
grep -q "^max_input_time" $PHP_INI || echo "max_input_time = 600" >> $PHP_INI

echo "✅ PHP configurado"
echo ""

# ============================================
# PASO 4: Crear directorios
# ============================================
echo "📁 Creando directorios..."
mkdir -p /var/www/m3u8/chunks
mkdir -p /var/www/m3u8/versions
chown -R www-data:www-data /var/www/m3u8
chmod -R 755 /var/www/m3u8
echo "✅ Directorios listos"
echo ""

# ============================================
# PASO 5: Verificar archivos PHP
# ============================================
echo "📄 Verificando archivos PHP..."
PHP_FILES=("health.php" "upload.php" "upload_chunk.php" "upload_status.php" "finalize_upload.php")

for file in "${PHP_FILES[@]}"; do
    if [ -f "/var/www/m3u8/$file" ]; then
        echo "   ✅ $file"
    else
        echo "   ❌ $file - FALTA!"
    fi
done
echo ""

# ============================================
# PASO 6: Verificar nginx
# ============================================
echo "🔧 Verificando nginx..."
nginx -t
echo "✅ Nginx OK"
echo ""

# ============================================
# PASO 7: Reiniciar servicios
# ============================================
echo "🔄 Reiniciando servicios..."
systemctl restart $PHP_FPM_SERVICE
systemctl reload nginx
echo "✅ Servicios reiniciados"
echo ""

# ============================================
# PASO 8: Verificar configuración
# ============================================
echo "📊 VERIFICACIÓN FINAL:"
echo "============================================"
echo ""
echo "PHP Config:"
php -i 2>/dev/null | grep -E "upload_max_filesize|post_max_size|memory_limit" | head -3
echo ""

echo "Health Check:"
curl -s http://localhost/health 2>/dev/null | python3 -m json.tool 2>/dev/null || curl -s http://localhost/health
echo ""

echo "============================================"
echo "✅ DEPLOY COMPLETADO"
echo "============================================"
echo ""
echo "🧪 Prueba desde tu PC:"
echo "   curl http://$(hostname -I | awk '{print $1}')/health"
echo ""
echo "📊 Límites configurados:"
echo "   - Upload máximo: 600MB"
echo "   - Memoria PHP: 1024MB"
echo "   - Timeout: 600s (10 min)"
echo ""

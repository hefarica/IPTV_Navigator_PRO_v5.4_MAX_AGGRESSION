#!/bin/bash
# ============================================
# 🚀 IPTV Navigator PRO - PHP Upload Setup
# ============================================
# Instala PHP-FPM y configura el endpoint de upload
# para VPS Hetzner (Ubuntu 22.04+)
# ============================================

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   🚀 IPTV Navigator PRO - PHP Upload Setup                   ║"
echo "║          VPS Hetzner - Endpoint de Subida                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ============================================
# VERIFICACIONES
# ============================================

if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ Este script debe ejecutarse como root${NC}"
    echo "   Usa: sudo bash install-php-upload.sh"
    exit 1
fi

echo -e "${YELLOW}📋 Verificando sistema...${NC}"
echo "   OS: $(lsb_release -d 2>/dev/null | cut -f2 || cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
echo "   Nginx: $(nginx -v 2>&1 | cut -d'/' -f2 || echo 'No instalado')"
echo ""

# ============================================
# PASO 1: INSTALAR PHP-FPM
# ============================================

echo -e "${CYAN}📦 [1/5] Instalando PHP-FPM...${NC}"
apt update -qq
apt install -y php-fpm php-json -qq

# Detectar versión de PHP instalada
PHP_VERSION=$(php -v | head -n1 | cut -d' ' -f2 | cut -d'.' -f1,2)
echo -e "${GREEN}   ✅ PHP ${PHP_VERSION} instalado${NC}"

# Verificar socket de PHP-FPM
PHP_SOCKET="/var/run/php/php${PHP_VERSION}-fpm.sock"
if [ ! -S "$PHP_SOCKET" ]; then
    # Intentar iniciar PHP-FPM
    systemctl start php${PHP_VERSION}-fpm
    systemctl enable php${PHP_VERSION}-fpm
fi

echo -e "${GREEN}   ✅ PHP-FPM socket: ${PHP_SOCKET}${NC}"

# ============================================
# PASO 2: CONFIGURAR PHP.INI
# ============================================

echo -e "${CYAN}⚙️ [2/5] Configurando PHP para archivos grandes...${NC}"

PHP_INI="/etc/php/${PHP_VERSION}/fpm/php.ini"
if [ -f "$PHP_INI" ]; then
    # Backup
    cp "$PHP_INI" "${PHP_INI}.backup.$(date +%Y%m%d)"
    
    # Configurar límites para archivos grandes (100MB)
    sed -i 's/upload_max_filesize = .*/upload_max_filesize = 100M/' "$PHP_INI"
    sed -i 's/post_max_size = .*/post_max_size = 105M/' "$PHP_INI"
    sed -i 's/max_execution_time = .*/max_execution_time = 300/' "$PHP_INI"
    sed -i 's/max_input_time = .*/max_input_time = 300/' "$PHP_INI"
    sed -i 's/memory_limit = .*/memory_limit = 256M/' "$PHP_INI"
    
    echo -e "${GREEN}   ✅ PHP configurado para archivos hasta 100MB${NC}"
else
    echo -e "${YELLOW}   ⚠️ No se encontró php.ini, usando defaults${NC}"
fi

# ============================================
# PASO 3: CREAR ESTRUCTURA DE DIRECTORIOS
# ============================================

echo -e "${CYAN}📁 [3/5] Creando estructura de directorios...${NC}"

# Directorio principal
mkdir -p /var/www/m3u8
mkdir -p /var/www/m3u8/versions
chown -R www-data:www-data /var/www/m3u8
chmod 755 /var/www/m3u8
chmod 755 /var/www/m3u8/versions

echo -e "${GREEN}   ✅ /var/www/m3u8/ creado${NC}"
echo -e "${GREEN}   ✅ /var/www/m3u8/versions/ creado${NC}"

# ============================================
# PASO 4: COPIAR upload.php (si existe localmente)
# ============================================

echo -e "${CYAN}📝 [4/5] Verificando upload.php...${NC}"

UPLOAD_PHP="/var/www/m3u8/upload.php"

if [ -f "$UPLOAD_PHP" ]; then
    echo -e "${GREEN}   ✅ upload.php ya existe${NC}"
else
    echo -e "${YELLOW}   ⚠️ upload.php no encontrado${NC}"
    echo -e "${YELLOW}   📤 Debes copiar upload.php manualmente:${NC}"
    echo -e "${CYAN}      scp upload.php root@TU_IP:/var/www/m3u8/${NC}"
fi

# ============================================
# PASO 5: ACTUALIZAR NGINX
# ============================================

echo -e "${CYAN}🌐 [5/5] Actualizando configuración de Nginx...${NC}"

NGINX_CONF="/etc/nginx/sites-available/m3u8"

# Verificar si existe configuración
if [ -f "$NGINX_CONF" ]; then
    # Verificar si ya tiene PHP configurado
    if grep -q "fastcgi_pass" "$NGINX_CONF"; then
        echo -e "${GREEN}   ✅ Nginx ya tiene PHP configurado${NC}"
    else
        echo -e "${YELLOW}   ⚠️ Nginx necesita configuración PHP${NC}"
        echo -e "${YELLOW}   📋 Agrega esto a ${NGINX_CONF}:${NC}"
        echo ""
        echo -e "${CYAN}location = /upload.php {"
        echo "    include snippets/fastcgi-php.conf;"
        echo "    fastcgi_pass unix:${PHP_SOCKET};"
        echo "    fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;"
        echo "    include fastcgi_params;"
        echo "    fastcgi_read_timeout 300;"
        echo -e "}${NC}"
        echo ""
    fi
else
    echo -e "${YELLOW}   ⚠️ No se encontró configuración de Nginx en ${NGINX_CONF}${NC}"
fi

# Reiniciar servicios
echo -e "${CYAN}🔄 Reiniciando servicios...${NC}"
systemctl restart php${PHP_VERSION}-fpm
nginx -t && systemctl reload nginx

echo -e "${GREEN}   ✅ Servicios reiniciados${NC}"

# ============================================
# RESUMEN
# ============================================

IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    ✅ INSTALACIÓN COMPLETA                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo -e "${CYAN}📊 Resumen:${NC}"
echo "   • PHP: ${PHP_VERSION}"
echo "   • Socket: ${PHP_SOCKET}"
echo "   • Max Upload: 100MB"
echo "   • Directorio: /var/www/m3u8/"
echo ""
echo -e "${CYAN}🌐 Endpoints:${NC}"
echo "   • Upload:  http://${IP}/upload.php"
echo "   • Health:  http://${IP}/health"
echo "   • Listas:  http://${IP}/APE_ULTIMATE_v9.m3u8"
echo ""
echo -e "${CYAN}🧪 Test de upload:${NC}"
echo '   curl -X POST http://'${IP}'/upload.php \'
echo '     -H "Content-Type: text/plain" \'
echo '     -H "X-Strategy: replace" \'
echo '     -H "X-Custom-Filename: test.m3u8" \'
echo '     -d "#EXTM3U"'
echo ""
echo -e "${YELLOW}💡 Próximo paso:${NC}"
echo "   1. Copia upload.php al VPS (si no existe)"
echo "   2. Actualiza nginx-m3u8-site.conf con la sección PHP"
echo "   3. Reinicia Nginx: sudo systemctl reload nginx"
echo ""

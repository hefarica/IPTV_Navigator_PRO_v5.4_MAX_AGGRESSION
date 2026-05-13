#!/bin/bash
# ============================================
# 🚀 IPTV Navigator PRO - VPS Auto Setup
# Hetzner CPX22 - Nginx para M3U8 Estáticos
# Región: Ashburn (us-east) para LATAM
# ============================================

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     🚀 IPTV Navigator PRO - VPS Setup Script                 ║"
echo "║           Nginx Optimizado para M3U8                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ============================================
# VERIFICACIONES
# ============================================

if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ Este script debe ejecutarse como root${NC}"
    echo "   Usa: sudo bash install-nginx-m3u8.sh"
    exit 1
fi

echo -e "${YELLOW}📋 Verificando sistema...${NC}"
echo "   OS: $(lsb_release -d | cut -f2)"
echo "   Kernel: $(uname -r)"
echo "   CPUs: $(nproc)"
echo "   RAM: $(free -h | awk '/^Mem:/{print $2}')"
echo ""

# ============================================
# PASO 1: ACTUALIZAR SISTEMA
# ============================================

echo -e "${CYAN}📦 [1/6] Actualizando sistema...${NC}"
apt update -qq
apt upgrade -y -qq
echo -e "${GREEN}   ✅ Sistema actualizado${NC}"

# ============================================
# PASO 2: INSTALAR NGINX
# ============================================

echo -e "${CYAN}📦 [2/6] Instalando Nginx...${NC}"
apt install nginx -y -qq
systemctl enable nginx
echo -e "${GREEN}   ✅ Nginx $(nginx -v 2>&1 | cut -d'/' -f2) instalado${NC}"

# ============================================
# PASO 3: CREAR ESTRUCTURA
# ============================================

echo -e "${CYAN}📁 [3/6] Creando estructura de directorios...${NC}"
mkdir -p /var/www/m3u8
chown -R www-data:www-data /var/www/m3u8
chmod 755 /var/www/m3u8

# Crear archivo de prueba
cat > /var/www/m3u8/test.m3u8 << 'EOF'
#EXTM3U
#EXTINF:-1 tvg-name="Test Channel" tvg-logo="https://example.com/logo.png" group-title="Test",Test Channel
http://example.com/stream.ts
EOF
chown www-data:www-data /var/www/m3u8/test.m3u8

echo -e "${GREEN}   ✅ Directorio /var/www/m3u8 creado${NC}"

# ============================================
# PASO 4: CONFIGURAR NGINX
# ============================================

echo -e "${CYAN}⚙️ [4/6] Configurando Nginx optimizado...${NC}"

# Backup
cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.backup.$(date +%Y%m%d)

# nginx.conf principal
cat > /etc/nginx/nginx.conf << 'NGINXCONF'
user www-data;
worker_processes auto;
pid /run/nginx.pid;
include /etc/nginx/modules-enabled/*.conf;

worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    types_hash_max_size 2048;
    server_tokens off;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    access_log /var/log/nginx/access.log combined buffer=512k flush=1m;
    error_log /var/log/nginx/error.log warn;

    # Keepalive moderado
    keepalive_timeout 30s;
    keepalive_requests 100;

    # Límites por IP
    limit_conn_zone $binary_remote_addr zone=conn_limit:10m;
    limit_req_zone $binary_remote_addr zone=m3u8_limit:10m rate=30r/s;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 4;
    gzip_min_length 256;
    gzip_types
        text/plain
        text/css
        application/json
        application/javascript
        application/vnd.apple.mpegurl
        application/x-mpegurl
        audio/mpegurl;

    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
NGINXCONF

# Site config para M3U8
cat > /etc/nginx/sites-available/m3u8 << 'SITECONF'
server {
    listen 80;
    listen [::]:80;
    server_name _;
    root /var/www/m3u8;

    # Límites
    limit_conn conn_limit 20;
    limit_req zone=m3u8_limit burst=50 nodelay;

    # CORS
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, HEAD, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Range,DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type' always;

    location / {
        types {
            application/vnd.apple.mpegurl m3u8 m3u;
            text/plain txt;
        }
        default_type application/vnd.apple.mpegurl;
        add_header Cache-Control "public, max-age=300";
        try_files $uri $uri/ =404;
    }

    location /health {
        access_log off;
        return 200 '{"status":"ok","server":"hetzner-cpx22","region":"us-east-ashburn","time":"'$(date -Iseconds)'"}';
        add_header Content-Type application/json;
    }

    location /nginx_status {
        stub_status on;
        access_log off;
    }

    location ~ /\. {
        deny all;
    }

    location = /favicon.ico {
        log_not_found off;
        return 204;
    }
}
SITECONF

# Activar site
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/m3u8 /etc/nginx/sites-enabled/

echo -e "${GREEN}   ✅ Nginx configurado${NC}"

# ============================================
# PASO 5: FIREWALL
# ============================================

echo -e "${CYAN}🔥 [5/6] Configurando firewall...${NC}"
ufw --force reset > /dev/null 2>&1
ufw default deny incoming > /dev/null
ufw default allow outgoing > /dev/null
ufw allow 22/tcp comment 'SSH' > /dev/null
ufw allow 80/tcp comment 'HTTP' > /dev/null
ufw allow 443/tcp comment 'HTTPS' > /dev/null
ufw --force enable > /dev/null
echo -e "${GREEN}   ✅ Firewall configurado (SSH, HTTP, HTTPS)${NC}"

# ============================================
# PASO 6: VERIFICAR Y REINICIAR
# ============================================

echo -e "${CYAN}🔧 [6/6] Verificando configuración...${NC}"

nginx -t
if [ $? -eq 0 ]; then
    systemctl restart nginx
    echo -e "${GREEN}   ✅ Nginx reiniciado correctamente${NC}"
else
    echo -e "${RED}   ❌ Error en configuración de Nginx${NC}"
    exit 1
fi

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
echo "   • Nginx: $(nginx -v 2>&1 | cut -d'/' -f2)"
echo "   • Root: /var/www/m3u8"
echo "   • Límites: 20 conn/IP, 30 req/s"
echo "   • Keepalive: 30s"
echo "   • Gzip: Habilitado"
echo ""
echo -e "${CYAN}🌐 URLs:${NC}"
echo "   • Health:  http://${IP}/health"
echo "   • Test:    http://${IP}/test.m3u8"
echo "   • Stats:   http://${IP}/nginx_status"
echo ""
echo -e "${CYAN}📤 Para subir listas desde Windows:${NC}"
echo "   scp C:\\ruta\\lista.m3u8 root@${IP}:/var/www/m3u8/"
echo ""
echo -e "${CYAN}🔒 Para SSL (opcional):${NC}"
echo "   apt install certbot python3-certbot-nginx -y"
echo "   certbot --nginx -d tu-dominio.com"
echo ""
echo -e "${YELLOW}💡 Próximo paso: Sube tus archivos .m3u8 a /var/www/m3u8/${NC}"
echo ""

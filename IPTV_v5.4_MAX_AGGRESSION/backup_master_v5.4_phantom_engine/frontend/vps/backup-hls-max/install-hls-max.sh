#!/bin/bash
# ============================================
# 🚀 IPTV Navigator PRO - HLS MAX Installer
# ============================================
# Script de instalación automática para Nginx
# con configuración CORS MAX + Range + SSL
# 
# USO: ./install-hls-max.sh [dominio]
# Ejemplo: ./install-hls-max.sh iptv-ape.duckdns.org
# ============================================

set -e

DOMAIN="${1:-iptv-ape.duckdns.org}"
CONFIG_PATH="/etc/nginx/sites-enabled/default"
BACKUP_PATH="/etc/nginx/sites-available/default.backup.$(date +%Y%m%d_%H%M%S)"
M3U8_ROOT="/var/www/m3u8"

echo "============================================"
echo "🚀 IPTV Navigator PRO - HLS MAX Installer"
echo "============================================"
echo "Dominio: $DOMAIN"
echo "============================================"

# 1. Verificar que es root
if [ "$EUID" -ne 0 ]; then 
  echo "❌ Este script debe ejecutarse como root"
  exit 1
fi

# 2. Verificar Nginx instalado
if ! command -v nginx &> /dev/null; then
  echo "❌ Nginx no está instalado. Instalando..."
  apt update && apt install -y nginx
fi

# 3. Crear directorio M3U8 si no existe
if [ ! -d "$M3U8_ROOT" ]; then
  echo "📁 Creando directorio $M3U8_ROOT..."
  mkdir -p "$M3U8_ROOT"
  chown -R www-data:www-data "$M3U8_ROOT"
  chmod -R 755 "$M3U8_ROOT"
fi

# 4. Backup de configuración actual
echo "💾 Creando backup: $BACKUP_PATH"
cp "$CONFIG_PATH" "$BACKUP_PATH" 2>/dev/null || true

# 5. Instalar Certbot si no existe
if ! command -v certbot &> /dev/null; then
  echo "🔐 Instalando Certbot para Let's Encrypt..."
  apt install -y certbot python3-certbot-nginx
fi

# 6. Generar certificado SSL si no existe
CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
if [ ! -f "$CERT_PATH" ]; then
  echo "🔐 Generando certificado SSL para $DOMAIN..."
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email admin@"$DOMAIN" --redirect || {
    echo "⚠️ Certbot falló. Continuando con config HTTP..."
  }
fi

# 7. Generar configuración Nginx
echo "📝 Generando configuración Nginx HLS MAX..."
cat > "$CONFIG_PATH" << 'NGINX_CONFIG'
# ============================================
# 🚀 IPTV Navigator PRO - Nginx HLS MAX
# ============================================
# CORS MAX + Range + Let's Encrypt SSL
# Auto-generado por install-hls-max.sh
# ============================================

# --- HTTP → HTTPS Redirect ---
server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
    }

    return 301 https://$host$request_uri;
}

# --- HTTPS Server (TLS + HLS + CORS MAX) ---
server {
    listen 443 ssl http2;
    server_name DOMAIN_PLACEHOLDER;

    # SSL Let's Encrypt
    ssl_certificate     /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    root /var/www/m3u8;
    index index.html;

    # MIME Types (HLS Correcto)
    types {
        application/vnd.apple.mpegurl  m3u8;
        video/mp2t                     ts;
        video/iso.segment              m4s;
        video/mp4                      mp4 m4v;
        audio/mpeg                     mp3;
        audio/aac                      aac;
    }
    default_type application/octet-stream;

    # Performance
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    client_max_body_size 600M;
    client_body_buffer_size 128k;
    client_body_timeout 600s;
    send_timeout 600s;

    # ============================================
    # 📺 M3U8 Playlists - CORS MAX + No Cache
    # ============================================
    location ~* \.m3u8$ {
        # CORS para TODOS los métodos (GET/HEAD/OPTIONS)
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Expose-Headers' 'Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified, X-Playlist-Type' always;
        add_header 'Accept-Ranges' 'bytes' always;

        # Preflight OPTIONS
        if ($request_method = OPTIONS) {
            add_header 'Access-Control-Allow-Origin' '*' always;
            add_header 'Access-Control-Allow-Methods' 'GET, HEAD, OPTIONS' always;
            add_header 'Access-Control-Allow-Headers' 'Origin, Accept, User-Agent, Referer, Range, DNT, Cache-Control, X-Requested-With, If-Modified-Since, X-Auth-Token' always;
            add_header 'Access-Control-Max-Age' 86400 always;
            add_header 'Content-Length' 0 always;
            add_header 'Content-Type' 'text/plain; charset=utf-8' always;
            return 204;
        }

        # No Cache (playlists siempre frescas)
        add_header 'Cache-Control' 'no-cache, no-store, must-revalidate' always;
        add_header 'Pragma' 'no-cache' always;
        add_header 'Expires' '0' always;
        add_header 'X-Content-Type-Options' 'nosniff' always;

        limit_except GET HEAD OPTIONS {
            deny all;
        }

        try_files $uri =404;
    }

    # ============================================
    # 🎬 Segments (.ts/.m4s) - CORS MAX + Cache LARGO
    # ============================================
    location ~* \.(ts|m4s)$ {
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Expose-Headers' 'Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified' always;
        add_header 'Accept-Ranges' 'bytes' always;

        if ($request_method = OPTIONS) {
            add_header 'Access-Control-Allow-Origin' '*' always;
            add_header 'Access-Control-Allow-Methods' 'GET, HEAD, OPTIONS' always;
            add_header 'Access-Control-Allow-Headers' 'Origin, Accept, User-Agent, Referer, Range, DNT, Cache-Control, X-Requested-With, If-Modified-Since' always;
            add_header 'Access-Control-Max-Age' 86400 always;
            add_header 'Content-Length' 0 always;
            add_header 'Content-Type' 'text/plain; charset=utf-8' always;
            return 204;
        }

        add_header 'Cache-Control' 'public, max-age=31536000, immutable' always;
        add_header 'X-Content-Type-Options' 'nosniff' always;

        limit_except GET HEAD OPTIONS {
            deny all;
        }

        try_files $uri =404;
    }

    # ============================================
    # 🔧 Upload Endpoint (PHP)
    # ============================================
    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;

        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Content-Type, X-Filename, X-Strategy, X-Channels, X-Custom-Filename, X-Chunk-Index, X-Total-Chunks, X-Upload-Id' always;

        client_max_body_size 600M;
    }

    # ============================================
    # 📁 Default Location (fallback)
    # ============================================
    location / {
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Expose-Headers' 'Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified' always;
        add_header 'Accept-Ranges' 'bytes' always;

        if ($request_method = OPTIONS) {
            add_header 'Access-Control-Allow-Origin' '*' always;
            add_header 'Access-Control-Allow-Methods' 'GET, HEAD, OPTIONS' always;
            add_header 'Access-Control-Allow-Headers' 'Origin, Accept, User-Agent, Referer, Range, DNT, Cache-Control, X-Requested-With, If-Modified-Since' always;
            add_header 'Access-Control-Max-Age' 86400 always;
            add_header 'Content-Length' 0 always;
            add_header 'Content-Type' 'text/plain; charset=utf-8' always;
            return 204;
        }

        try_files $uri $uri/ =404;
    }

    # Icons Path
    location /icons/ {
        alias /var/www/m3u8/icons/;
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Cache-Control' 'public, max-age=86400' always;
        try_files $uri =404;
    }
}
NGINX_CONFIG

# 8. Reemplazar placeholder con dominio real
sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" "$CONFIG_PATH"

# 9. Test y reload Nginx
echo "🔍 Verificando configuración Nginx..."
nginx -t

if [ $? -eq 0 ]; then
  echo "🔄 Recargando Nginx..."
  systemctl reload nginx
  echo ""
  echo "============================================"
  echo "✅ INSTALACIÓN COMPLETADA"
  echo "============================================"
  echo "📺 CORS MAX: Activado"
  echo "🔒 SSL: Let's Encrypt"
  echo "📁 Root: $M3U8_ROOT"
  echo "🌐 URL: https://$DOMAIN/"
  echo "============================================"
  echo ""
  echo "Prueba con:"
  echo "  curl -sI https://$DOMAIN/test.m3u8"
  echo ""
else
  echo "❌ Error en configuración. Restaurando backup..."
  cp "$BACKUP_PATH" "$CONFIG_PATH"
  nginx -t && systemctl reload nginx
  exit 1
fi

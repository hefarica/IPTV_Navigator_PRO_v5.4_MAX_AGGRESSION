#!/bin/bash
# ============================================
# 🚀 IPTV Navigator PRO - HLS MAX Installer v2.0
# ============================================
# Script de instalación automática para Nginx
# con configuración CORS MAX + Range + SSL
# 
# v2.0 - DUAL MODE: Let's Encrypt para dominios,
#        Self-Signed para direcciones IP
#
# USO: ./install-hls-max-v2.sh [dominio_o_ip]
# Ejemplos:
#   ./install-hls-max-v2.sh iptv-ape.duckdns.org  (Let's Encrypt)
#   ./install-hls-max-v2.sh 178.156.147.234      (Self-Signed)
# ============================================

set -e

DOMAIN="${1:-178.156.147.234}"
CONFIG_PATH="/etc/nginx/sites-enabled/default"
BACKUP_PATH="/etc/nginx/sites-available/default.backup.$(date +%Y%m%d_%H%M%S)"
M3U8_ROOT="/var/www/m3u8"
SELF_SIGNED_DIR="/etc/ssl/self-signed"

echo "============================================"
echo "🚀 IPTV Navigator PRO - HLS MAX Installer v2.0"
echo "============================================"
echo "Target: $DOMAIN"
echo "============================================"

# 1. Verificar que es root
if [ "$EUID" -ne 0 ]; then 
  echo "❌ Este script debe ejecutarse como root"
  exit 1
fi

# 2. Detectar si es IP o dominio
is_ip() {
    local input="$1"
    # Regex para IPv4
    if [[ "$input" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        return 0  # Es IP
    else
        return 1  # Es dominio
    fi
}

if is_ip "$DOMAIN"; then
    SSL_MODE="self-signed"
    echo "🔍 Detectado: Dirección IP → Usando certificado AUTO-FIRMADO"
else
    SSL_MODE="letsencrypt"
    echo "🔍 Detectado: Dominio → Usando Let's Encrypt"
fi

# 3. Verificar Nginx instalado
if ! command -v nginx &> /dev/null; then
  echo "❌ Nginx no está instalado. Instalando..."
  apt update && apt install -y nginx
fi

# 4. Crear directorio M3U8 si no existe
if [ ! -d "$M3U8_ROOT" ]; then
  echo "📁 Creando directorio $M3U8_ROOT..."
  mkdir -p "$M3U8_ROOT"
  chown -R www-data:www-data "$M3U8_ROOT"
  chmod -R 755 "$M3U8_ROOT"
fi

# 5. Backup de configuración actual
echo "💾 Creando backup: $BACKUP_PATH"
cp "$CONFIG_PATH" "$BACKUP_PATH" 2>/dev/null || true

# 6. Generar certificado SSL según modo
if [ "$SSL_MODE" = "self-signed" ]; then
    # Certificado auto-firmado para IP
    echo "🔐 Generando certificado auto-firmado para $DOMAIN..."
    mkdir -p "$SELF_SIGNED_DIR"
    
    if [ ! -f "$SELF_SIGNED_DIR/$DOMAIN.crt" ]; then
        openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
            -keyout "$SELF_SIGNED_DIR/$DOMAIN.key" \
            -out "$SELF_SIGNED_DIR/$DOMAIN.crt" \
            -subj "/CN=$DOMAIN/O=IPTV Navigator PRO/C=US" \
            -addext "subjectAltName = IP:$DOMAIN" 2>/dev/null
        echo "✅ Certificado auto-firmado creado (válido 10 años)"
    else
        echo "✅ Certificado auto-firmado ya existe"
    fi
    
    SSL_CERT="$SELF_SIGNED_DIR/$DOMAIN.crt"
    SSL_KEY="$SELF_SIGNED_DIR/$DOMAIN.key"
else
    # Let's Encrypt para dominios
    if ! command -v certbot &> /dev/null; then
      echo "🔐 Instalando Certbot para Let's Encrypt..."
      apt install -y certbot python3-certbot-nginx
    fi
    
    CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
    if [ ! -f "$CERT_PATH" ]; then
      echo "🔐 Generando certificado SSL para $DOMAIN..."
      certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email admin@"$DOMAIN" --redirect || {
        echo "⚠️ Certbot falló. Cambiando a modo self-signed..."
        SSL_MODE="self-signed"
        mkdir -p "$SELF_SIGNED_DIR"
        openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
            -keyout "$SELF_SIGNED_DIR/$DOMAIN.key" \
            -out "$SELF_SIGNED_DIR/$DOMAIN.crt" \
            -subj "/CN=$DOMAIN/O=IPTV Navigator PRO/C=US" 2>/dev/null
        SSL_CERT="$SELF_SIGNED_DIR/$DOMAIN.crt"
        SSL_KEY="$SELF_SIGNED_DIR/$DOMAIN.key"
      }
    fi
    
    if [ "$SSL_MODE" = "letsencrypt" ]; then
        SSL_CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
        SSL_KEY="/etc/letsencrypt/live/$DOMAIN/privkey.pem"
    fi
fi

# 7. Generar configuración Nginx
echo "📝 Generando configuración Nginx HLS MAX..."
cat > "$CONFIG_PATH" << NGINX_CONFIG
# ============================================
# 🚀 IPTV Navigator PRO - Nginx HLS MAX v2.0
# ============================================
# CORS MAX + Range + SSL ($SSL_MODE)
# Auto-generado por install-hls-max-v2.sh
# Target: $DOMAIN
# ============================================

# --- HTTP → HTTPS Redirect ---
server {
    listen 80;
    server_name $DOMAIN;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
    }

    return 301 https://\$host\$request_uri;
}

# --- HTTPS Server (TLS + HLS + CORS MAX) ---
server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    # SSL Certificate ($SSL_MODE)
    ssl_certificate     $SSL_CERT;
    ssl_certificate_key $SSL_KEY;

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
    location ~* \.m3u8\$ {
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Expose-Headers' 'Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified, X-Playlist-Type' always;
        add_header 'Accept-Ranges' 'bytes' always;

        if (\$request_method = OPTIONS) {
            add_header 'Access-Control-Allow-Origin' '*' always;
            add_header 'Access-Control-Allow-Methods' 'GET, HEAD, OPTIONS' always;
            add_header 'Access-Control-Allow-Headers' 'Origin, Accept, User-Agent, Referer, Range, DNT, Cache-Control, X-Requested-With, If-Modified-Since, X-Auth-Token' always;
            add_header 'Access-Control-Max-Age' 86400 always;
            add_header 'Content-Length' 0 always;
            add_header 'Content-Type' 'text/plain; charset=utf-8' always;
            return 204;
        }

        add_header 'Cache-Control' 'no-cache, no-store, must-revalidate' always;
        add_header 'Pragma' 'no-cache' always;
        add_header 'Expires' '0' always;
        add_header 'X-Content-Type-Options' 'nosniff' always;

        limit_except GET HEAD OPTIONS {
            deny all;
        }

        try_files \$uri =404;
    }

    # ============================================
    # 🎬 Segments (.ts/.m4s) - CORS MAX + Cache LARGO
    # ============================================
    location ~* \.(ts|m4s)\$ {
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Expose-Headers' 'Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified' always;
        add_header 'Accept-Ranges' 'bytes' always;

        if (\$request_method = OPTIONS) {
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

        try_files \$uri =404;
    }

    # ============================================
    # 🔧 Upload Endpoint (PHP)
    # ============================================
    location ~ \.php\$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
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

        if (\$request_method = OPTIONS) {
            add_header 'Access-Control-Allow-Origin' '*' always;
            add_header 'Access-Control-Allow-Methods' 'GET, HEAD, OPTIONS' always;
            add_header 'Access-Control-Allow-Headers' 'Origin, Accept, User-Agent, Referer, Range, DNT, Cache-Control, X-Requested-With, If-Modified-Since' always;
            add_header 'Access-Control-Max-Age' 86400 always;
            add_header 'Content-Length' 0 always;
            add_header 'Content-Type' 'text/plain; charset=utf-8' always;
            return 204;
        }

        try_files \$uri \$uri/ =404;
    }

    # Icons Path
    location /icons/ {
        alias /var/www/m3u8/icons/;
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Cache-Control' 'public, max-age=86400' always;
        try_files \$uri =404;
    }
}
NGINX_CONFIG

# 8. Test y reload Nginx
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
  echo "🔒 SSL: $SSL_MODE"
  if [ "$SSL_MODE" = "self-signed" ]; then
    echo "⚠️  Nota: El navegador mostrará advertencia SSL (normal para IP)"
  fi
  echo "📁 Root: $M3U8_ROOT"
  echo "🌐 URL: https://$DOMAIN/"
  echo "============================================"
  echo ""
  echo "Prueba con:"
  echo "  curl -k -sI https://$DOMAIN/APE_ULTIMATE_v9.m3u8"
  echo ""
else
  echo "❌ Error en configuración. Restaurando backup..."
  cp "$BACKUP_PATH" "$CONFIG_PATH"
  nginx -t && systemctl reload nginx
  exit 1
fi

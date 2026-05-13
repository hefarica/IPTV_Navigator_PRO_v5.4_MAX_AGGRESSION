#!/bin/bash
# ============================================
# 🚀 IPTV Navigator PRO - Setup HTTPS con Hetzner
# ============================================
# Este script configura HTTPS usando Let's Encrypt
# Requiere: Dominio apuntando a 178.156.147.234
# ============================================

set -e

DOMAIN="${1:-gateway.iptv-navigator.com}"
EMAIL="${2:-admin@iptv-navigator.com}"
VPS_IP="178.156.147.234"

echo "============================================"
echo "🔒 CONFIGURACIÓN HTTPS - IPTV Navigator PRO"
echo "============================================"
echo ""
echo "📋 Configuración:"
echo "   Dominio: $DOMAIN"
echo "   Email: $EMAIL"
echo "   IP: $VPS_IP"
echo ""
read -p "¿Continuar? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Cancelado"
    exit 1
fi

# ============================================
# PASO 1: Verificar DNS
# ============================================
echo ""
echo "🔍 PASO 1: Verificando DNS..."
DNS_IP=$(dig +short $DOMAIN @8.8.8.8 | tail -1)
if [ "$DNS_IP" != "$VPS_IP" ]; then
    echo "⚠️  ADVERTENCIA: DNS no apunta a $VPS_IP"
    echo "   DNS actual: $DNS_IP"
    echo "   Esperado: $VPS_IP"
    echo ""
    echo "📝 Configura en tu DNS:"
    echo "   $DOMAIN  A  $VPS_IP"
    echo ""
    read -p "¿Ya configuraste DNS? Espera 5 min y presiona Enter..."
    DNS_IP=$(dig +short $DOMAIN @8.8.8.8 | tail -1)
    if [ "$DNS_IP" != "$VPS_IP" ]; then
        echo "❌ DNS aún no apunta correctamente. Abortando."
        exit 1
    fi
fi
echo "✅ DNS correcto: $DOMAIN → $DNS_IP"

# ============================================
# PASO 2: Instalar Certbot
# ============================================
echo ""
echo "📦 PASO 2: Instalando Certbot..."
if ! command -v certbot &> /dev/null; then
    apt update
    apt install -y certbot python3-certbot-nginx
    echo "✅ Certbot instalado"
else
    echo "✅ Certbot ya instalado"
fi

# ============================================
# PASO 3: Detener Nginx temporalmente (para standalone)
# ============================================
echo ""
echo "🛑 PASO 3: Deteniendo Nginx temporalmente..."
systemctl stop nginx

# ============================================
# PASO 4: Generar certificado
# ============================================
echo ""
echo "🔐 PASO 4: Generando certificado SSL..."
certbot certonly --standalone \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    -d "$DOMAIN"

if [ $? -ne 0 ]; then
    echo "❌ Error generando certificado"
    systemctl start nginx
    exit 1
fi

echo "✅ Certificado generado en: /etc/letsencrypt/live/$DOMAIN/"

# ============================================
# PASO 5: Reiniciar Nginx
# ============================================
echo ""
echo "🔄 PASO 5: Reiniciando Nginx..."
systemctl start nginx

# ============================================
# PASO 6: Verificar certificado
# ============================================
echo ""
echo "✅ PASO 6: Verificando certificado..."
if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    echo "✅ Certificado encontrado:"
    ls -lh /etc/letsencrypt/live/$DOMAIN/*.pem
else
    echo "❌ Certificado no encontrado"
    exit 1
fi

# ============================================
# PASO 7: Configurar renovación automática
# ============================================
echo ""
echo "🔄 PASO 7: Configurando renovación automática..."
systemctl enable certbot.timer
systemctl start certbot.timer

echo ""
echo "============================================"
echo "✅ CONFIGURACIÓN COMPLETA"
echo "============================================"
echo ""
echo "📋 Certificado SSL:"
echo "   /etc/letsencrypt/live/$DOMAIN/fullchain.pem"
echo "   /etc/letsencrypt/live/$DOMAIN/privkey.pem"
echo ""
echo "🔄 Renovación automática: ACTIVADA"
echo ""
echo "📝 PRÓXIMO PASO:"
echo "   Actualiza nginx-m3u8-site.conf con SSL"
echo "   Luego ejecuta: nginx -t && systemctl reload nginx"
echo ""
echo "🧪 Test:"
echo "   curl -I https://$DOMAIN/health"
echo ""

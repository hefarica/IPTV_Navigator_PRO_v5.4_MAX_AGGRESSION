#!/bin/bash
# ============================================
# 🌐 IPTV Navigator PRO - Setup DNS con Hetzner
# ============================================
# Este script verifica y configura DNS para el servidor
# ============================================

set -e

DOMAIN="${1:-gateway.iptv-navigator.com}"
VPS_IP="178.156.147.234"

echo "============================================"
echo "🌐 CONFIGURACIÓN DNS - IPTV Navigator PRO"
echo "============================================"
echo ""
echo "📋 Configuración:"
echo "   Dominio: $DOMAIN"
echo "   IP: $VPS_IP"
echo ""

# ============================================
# PASO 1: Verificar DNS
# ============================================
echo "🔍 PASO 1: Verificando DNS..."
echo ""

# Intentar múltiples DNS servers
DNS_SERVERS=("8.8.8.8" "1.1.1.1" "208.67.222.222")
DNS_RESOLVED=false

for dns_server in "${DNS_SERVERS[@]}"; do
    echo "   Probando con DNS: $dns_server..."
    RESOLVED_IP=$(dig +short $DOMAIN @$dns_server 2>/dev/null | tail -1)
    
    if [ "$RESOLVED_IP" = "$VPS_IP" ]; then
        echo "   ✅ DNS correcto: $DOMAIN → $RESOLVED_IP"
        DNS_RESOLVED=true
        break
    elif [ -n "$RESOLVED_IP" ]; then
        echo "   ⚠️  DNS resuelve a: $RESOLVED_IP (esperado: $VPS_IP)"
    else
        echo "   ❌ DNS no resuelve"
    fi
done

echo ""

if [ "$DNS_RESOLVED" = false ]; then
    echo "❌ ERROR: DNS no está configurado correctamente"
    echo ""
    echo "📝 INSTRUCCIONES:"
    echo ""
    echo "1. Ve a Hetzner Cloud Console: https://console.hetzner.cloud/"
    echo "2. Navega a: DNS → Create new zone"
    echo "3. Zone name: $(echo $DOMAIN | cut -d'.' -f2-)"  # Extrae dominio base
    echo "4. Type: Authoritative"
    echo "5. Create"
    echo ""
    echo "6. En la zona creada, haz clic en 'Add record':"
    echo "   Type: A"
    echo "   Name: $(echo $DOMAIN | cut -d'.' -f1)"  # Extrae subdominio
    echo "   Value: $VPS_IP"
    echo "   TTL: 3600"
    echo ""
    echo "7. Si es la primera vez, configura nameservers en tu registrador:"
    echo "   - Hetzner te dará: ns1.hetzner.com, ns2.hetzner.com, ns3.hetzner.com"
    echo "   - Ve a tu registrador (Godaddy, Namecheap, etc.)"
    echo "   - Cambia nameservers a los de Hetzner"
    echo ""
    echo "8. Espera 15-30 minutos para propagación"
    echo ""
    echo "9. Luego ejecuta este script de nuevo:"
    echo "   ./setup-dns-hetzner.sh $DOMAIN"
    echo ""
    exit 1
fi

# ============================================
# PASO 2: Verificar conectividad
# ============================================
echo "🔍 PASO 2: Verificando conectividad..."
if ping -c 1 -W 2 $DOMAIN > /dev/null 2>&1; then
    echo "   ✅ Dominio accesible: $DOMAIN"
else
    echo "   ⚠️  Dominio no responde a ping (puede ser normal si ICMP está bloqueado)"
fi

# ============================================
# PASO 3: Test HTTP
# ============================================
echo ""
echo "🔍 PASO 3: Verificando HTTP..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://$DOMAIN/health" 2>/dev/null || echo "000")

if [ "$HTTP_STATUS" = "200" ]; then
    echo "   ✅ HTTP funcionando: http://$DOMAIN/health → $HTTP_STATUS"
elif [ "$HTTP_STATUS" = "000" ]; then
    echo "   ⚠️  HTTP no accesible (puede ser normal si el servidor no está configurado)"
else
    echo "   ⚠️  HTTP responde con: $HTTP_STATUS"
fi

# ============================================
# RESUMEN
# ============================================
echo ""
echo "============================================"
echo "✅ VERIFICACIÓN DNS COMPLETA"
echo "============================================"
echo ""
echo "📋 Estado:"
echo "   ✅ DNS: $DOMAIN → $VPS_IP"
echo "   ✅ Listo para configurar HTTPS"
echo ""
echo "📝 PRÓXIMO PASO:"
echo "   Ejecuta: ./setup-https-hetzner.sh $DOMAIN tu@email.com"
echo ""

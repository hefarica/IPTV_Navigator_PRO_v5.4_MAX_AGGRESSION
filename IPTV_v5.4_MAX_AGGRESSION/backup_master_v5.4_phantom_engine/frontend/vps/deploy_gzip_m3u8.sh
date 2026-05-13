#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# 🚀 DEPLOY GZIP M3U8 - Pre-compress & Serve via gzip_static
# 
# Uso:
#   bash deploy_gzip_m3u8.sh /ruta/al/archivo.m3u8
#   bash deploy_gzip_m3u8.sh --all          # Re-comprime todas las listas
#   bash deploy_gzip_m3u8.sh --verify       # Verifica el setup de Nginx
#
# Arquitectura:
#   .m3u8 → gzip -9 → .m3u8.gz (disco)
#   Nginx gzip_static always → sirve .gz directo (zero CPU)
#   Nginx gunzip on → streaming decompress para legacy clients (16KB chunks)
#
# Compatible con:
#   OTT Navigator, TiviMate, IPTV Smarters, VLC, Kodi,
#   Perfect Player, GSE, Smart IPTV, Fire TV, Apple TV
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── CONFIG ───
LISTS_DIR="/var/www/html/lists"
COMPRESSION_LEVEL=9  # Máxima compresión (lento en compress, pero se hace 1 vez)
KEEP_ORIGINAL="true"  # Mantener el .m3u8 original como fallback

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ═══════════════════════════════════════
# FUNCIONES
# ═══════════════════════════════════════

compress_file() {
    local src="$1"
    local gz="${src}.gz"
    
    if [ ! -f "$src" ]; then
        echo -e "${RED}❌ Archivo no encontrado: $src${NC}"
        return 1
    fi

    local original_size=$(stat --printf="%s" "$src" 2>/dev/null || stat -f%z "$src")
    local original_mb=$(echo "scale=1; $original_size / 1048576" | bc)
    
    echo -e "${CYAN}📦 Comprimiendo: $(basename "$src") (${original_mb} MB)${NC}"
    
    # Comprimir con gzip -9 manteniendo el archivo original
    # -k = keep original, -f = force overwrite, -9 = max compression
    if [ "$KEEP_ORIGINAL" = "true" ]; then
        gzip -${COMPRESSION_LEVEL} -k -f "$src"
    else
        # Solo guardamos el .gz, borramos el original
        # gunzip ON en Nginx servirá a clientes sin gzip support
        gzip -${COMPRESSION_LEVEL} -f "$src"
    fi
    
    if [ -f "$gz" ]; then
        local compressed_size=$(stat --printf="%s" "$gz" 2>/dev/null || stat -f%z "$gz")
        local compressed_mb=$(echo "scale=1; $compressed_size / 1048576" | bc)
        local ratio=$(echo "scale=1; (1 - $compressed_size / $original_size) * 100" | bc)
        
        # Asegurar permisos correctos
        chown www-data:www-data "$gz" 2>/dev/null || true
        chmod 644 "$gz"
        
        echo -e "${GREEN}   ✅ ${original_mb} MB → ${compressed_mb} MB (${ratio}% reducción)${NC}"
        echo -e "      📄 Original:   $src"
        echo -e "      📦 Comprimido: $gz"
    else
        echo -e "${RED}   ❌ Error al comprimir${NC}"
        return 1
    fi
}

verify_nginx() {
    echo -e "${CYAN}═══ Verificando configuración Nginx ═══${NC}"
    echo ""
    
    # 1. Verificar módulos
    echo -e "${YELLOW}1. Módulos requeridos:${NC}"
    
    local modules=$(nginx -V 2>&1)
    
    if echo "$modules" | grep -q "http_gzip_static_module"; then
        echo -e "   ${GREEN}✅ ngx_http_gzip_static_module${NC}"
    else
        echo -e "   ${RED}❌ ngx_http_gzip_static_module NO encontrado${NC}"
        echo -e "   ${YELLOW}   Solución: apt install nginx-extras${NC}"
    fi
    
    if echo "$modules" | grep -q "http_gunzip_module"; then
        echo -e "   ${GREEN}✅ ngx_http_gunzip_module${NC}"
    else
        echo -e "   ${RED}❌ ngx_http_gunzip_module NO encontrado${NC}"
        echo -e "   ${YELLOW}   Solución: apt install nginx-extras${NC}"
    fi
    
    # 2. Verificar config
    echo ""
    echo -e "${YELLOW}2. Configuración:${NC}"
    if nginx -t 2>&1 | grep -q "successful"; then
        echo -e "   ${GREEN}✅ nginx -t exitoso${NC}"
    else
        echo -e "   ${RED}❌ Error en configuración Nginx${NC}"
        nginx -t 2>&1
    fi
    
    # 3. Verificar archivos
    echo ""
    echo -e "${YELLOW}3. Archivos en ${LISTS_DIR}:${NC}"
    if [ -d "$LISTS_DIR" ]; then
        local m3u8_count=$(find "$LISTS_DIR" -name "*.m3u8" -not -name "*.m3u8.gz" | wc -l)
        local gz_count=$(find "$LISTS_DIR" -name "*.m3u8.gz" | wc -l)
        echo -e "   📄 .m3u8 sin comprimir: ${m3u8_count}"
        echo -e "   📦 .m3u8.gz comprimidos: ${gz_count}"
        
        if [ "$gz_count" -eq 0 ] && [ "$m3u8_count" -gt 0 ]; then
            echo -e "   ${YELLOW}⚠️ Hay ${m3u8_count} listas sin comprimir. Usa: $0 --all${NC}"
        fi
        
        # Mostrar tamaños
        echo ""
        echo -e "${YELLOW}4. Tamaños:${NC}"
        find "$LISTS_DIR" -name "*.m3u8*" -exec ls -lh {} \; 2>/dev/null | awk '{print "   "$5" "$NF}'
    else
        echo -e "   ${RED}❌ Directorio no existe: ${LISTS_DIR}${NC}"
    fi
    
    # 4. Test HTTP
    echo ""
    echo -e "${YELLOW}5. Test HTTP (requiere curl):${NC}"
    if command -v curl &>/dev/null; then
        local test_file=$(find "$LISTS_DIR" -name "*.m3u8.gz" -print -quit 2>/dev/null)
        if [ -n "$test_file" ]; then
            local m3u8_name=$(basename "$test_file" .gz)
            echo "   Testing: /lists/${m3u8_name}"
            
            # Test con Accept-Encoding: gzip
            local enc=$(curl -sI -H "Accept-Encoding: gzip" "http://localhost/lists/${m3u8_name}" 2>/dev/null | grep -i "Content-Encoding" || echo "   (sin Content-Encoding)")
            echo -e "   Con gzip:    ${GREEN}${enc}${NC}"
            
            # Test sin Accept-Encoding
            local enc2=$(curl -sI "http://localhost/lists/${m3u8_name}" 2>/dev/null | grep -i "Content-Encoding" || echo "   (sin Content-Encoding = gunzip descomprimió ✅)")
            echo -e "   Sin gzip:    ${GREEN}${enc2}${NC}"
        else
            echo -e "   ${YELLOW}⚠️ No hay .gz para testear${NC}"
        fi
    fi
    
    echo ""
    echo -e "${GREEN}═══ Verificación completa ═══${NC}"
}

# ═══════════════════════════════════════
# MAIN
# ═══════════════════════════════════════

case "${1:-}" in
    --verify)
        verify_nginx
        ;;
    --all)
        echo -e "${CYAN}📦 Re-comprimiendo TODAS las listas en $LISTS_DIR${NC}"
        echo ""
        count=0
        while IFS= read -r file; do
            compress_file "$file"
            ((count++))
        done < <(find "$LISTS_DIR" -name "*.m3u8" -not -name "*.m3u8.gz")
        echo ""
        echo -e "${GREEN}═══ $count listas comprimidas ═══${NC}"
        echo -e "${YELLOW}💡 Recuerda: nginx -s reload${NC}"
        ;;
    "")
        echo "Uso:"
        echo "  $0 /ruta/archivo.m3u8   Comprime un archivo específico"
        echo "  $0 --all                Re-comprime todas las listas en $LISTS_DIR"
        echo "  $0 --verify             Verifica la configuración de Nginx"
        ;;
    *)
        compress_file "$1"
        echo ""
        echo -e "${YELLOW}💡 Recuerda: nginx -s reload (si es la primera vez)${NC}"
        ;;
esac

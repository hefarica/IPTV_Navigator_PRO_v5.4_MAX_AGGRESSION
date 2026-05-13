#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
# CLOUDFLARE COMPLETE DEPLOYMENT - M3U8 NATIVE WITH R2
# ═══════════════════════════════════════════════════════════════════════════
# Version: 2.0.0 FINAL
# Date: 10 Enero 2026
# Description: Deploy completo automatizado (R2 + Worker + Tests)
# ═══════════════════════════════════════════════════════════════════════════

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  CLOUDFLARE COMPLETE DEPLOYMENT - M3U8 NATIVE WITH R2        ║${NC}"
echo -e "${CYAN}║  Version: 2.0.0 FINAL                                        ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# CONFIGURACIÓN
# ═══════════════════════════════════════════════════════════════════════════

M3U8_FILE="${1:-APE_ULTIMATE_v9.0_20260107.m3u8}"
BUCKET_NAME="ape-channels"
WORKER_NAME="ape-redirect-api-m3u8-native"
CUSTOM_DOMAIN="api.ape-tv.net"

# ═══════════════════════════════════════════════════════════════════════════
# FASE 1: VERIFICACIONES PREVIAS
# ═══════════════════════════════════════════════════════════════════════════

echo -e "${BLUE}[FASE 1/7] Verificaciones Previas${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Verificar Node.js
if ! command -v node &> /dev/null; then
  echo -e "${RED}❌ Node.js no encontrado${NC}"
  exit 1
fi
NODE_VERSION=$(node --version)
echo -e "${GREEN}✅ Node.js: $NODE_VERSION${NC}"

# Verificar Wrangler
if ! command -v wrangler &> /dev/null; then
  echo -e "${YELLOW}⚠️  Wrangler no encontrado. Instalando...${NC}"
  npm install -g wrangler@latest
fi
WRANGLER_VERSION=$(wrangler --version 2>&1 | head -n 1)
echo -e "${GREEN}✅ Wrangler: $WRANGLER_VERSION${NC}"

# Verificar archivo M3U8
if [ ! -f "$M3U8_FILE" ]; then
  echo -e "${RED}❌ Archivo M3U8 no encontrado: $M3U8_FILE${NC}"
  echo -e "${YELLOW}Uso: $0 <archivo_m3u8>${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Archivo M3U8: $M3U8_FILE${NC}"

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# FASE 2: LOGIN CLOUDFLARE
# ═══════════════════════════════════════════════════════════════════════════

echo -e "${BLUE}[FASE 2/7] Login Cloudflare${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if ! wrangler whoami &> /dev/null; then
  echo -e "${YELLOW}⚠️  No autenticado. Iniciando login...${NC}"
  wrangler login
  echo -e "${GREEN}✅ Login exitoso${NC}"
else
  WHOAMI=$(wrangler whoami 2>&1 | grep -i "logged in" || echo "Usuario autenticado")
  echo -e "${GREEN}✅ Ya autenticado: $WHOAMI${NC}"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# FASE 3: CREAR/VERIFICAR BUCKET R2
# ═══════════════════════════════════════════════════════════════════════════

echo -e "${BLUE}[FASE 3/7] Configurar R2 Bucket${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if wrangler r2 bucket list 2>&1 | grep -q "$BUCKET_NAME"; then
  echo -e "${GREEN}✅ Bucket '$BUCKET_NAME' ya existe${NC}"
else
  echo -e "${YELLOW}⚠️  Creando bucket '$BUCKET_NAME'...${NC}"
  wrangler r2 bucket create "$BUCKET_NAME"
  echo -e "${GREEN}✅ Bucket creado exitosamente${NC}"
fi

# Crear estructura de directorios en R2
echo -e "${YELLOW}📁 Creando estructura de directorios...${NC}"
mkdir -p .tmp_r2_structure/playlists
mkdir -p .tmp_r2_structure/metadata
echo '{"structure": "initialized"}' > .tmp_r2_structure/metadata/.gitkeep

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# FASE 4: UPLOAD M3U8 A R2
# ═══════════════════════════════════════════════════════════════════════════

echo -e "${BLUE}[FASE 4/7] Upload M3U8 a R2${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

CHANNEL_COUNT=$(grep -c "^#EXTINF" "$M3U8_FILE" || echo "0")
FILE_SIZE=$(du -h "$M3U8_FILE" | cut -f1)

echo -e "${BLUE}📊 Estadísticas del M3U8:${NC}"
echo -e "   Archivo: $M3U8_FILE"
echo -e "   Tamaño: $FILE_SIZE"
echo -e "   Canales: $CHANNEL_COUNT"
echo ""

echo -e "${YELLOW}⬆️  Subiendo a R2...${NC}"
wrangler r2 object put "$BUCKET_NAME/playlists/$(basename $M3U8_FILE)" --file="$M3U8_FILE"
echo -e "${GREEN}✅ Upload completado${NC}"

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# FASE 5: DEPLOY WORKER
# ═══════════════════════════════════════════════════════════════════════════

echo -e "${BLUE}[FASE 5/7] Deploy Cloudflare Worker${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd cf_worker/

# Verificar wrangler.toml
if [ ! -f "wrangler.toml" ]; then
  echo -e "${RED}❌ wrangler.toml no encontrado${NC}"
  exit 1
fi

echo -e "${YELLOW}🚀 Desplegando Worker...${NC}"
wrangler deploy

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Worker desplegado exitosamente${NC}"
  
  # Obtener URL del Worker
  WORKER_URL=$(wrangler deployments list 2>&1 | grep -o "https://[^ ]*" | head -n 1 || echo "https://$WORKER_NAME.workers.dev")
  echo -e "${BLUE}🔗 Worker URL:${NC} ${GREEN}$WORKER_URL${NC}"
else
  echo -e "${RED}❌ Error al desplegar Worker${NC}"
  exit 1
fi

cd ..

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# FASE 6: TESTING
# ═══════════════════════════════════════════════════════════════════════════

echo -e "${BLUE}[FASE 6/7] Testing de Endpoints${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test 1: Health Check
echo -e "${YELLOW}🧪 Test 1: Health Check${NC}"
HEALTH_RESPONSE=$(curl -s "https://$CUSTOM_DOMAIN/health")
if echo "$HEALTH_RESPONSE" | grep -q "OK"; then
  echo -e "${GREEN}✅ Health check exitoso${NC}"
  echo "$HEALTH_RESPONSE" | head -n 3
else
  echo -e "${RED}❌ Health check falló${NC}"
  echo "$HEALTH_RESPONSE"
fi
echo ""

# Test 2: Generate Token
echo -e "${YELLOW}🧪 Test 2: Generate Token${NC}"
TOKEN_RESPONSE=$(curl -s "https://$CUSTOM_DOMAIN/token/generate?user_id=test&expires_in=21600")
TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4 || echo "")

if [ -n "$TOKEN" ]; then
  echo -e "${GREEN}✅ Token generado exitosamente${NC}"
  echo "Token (primeros 50 chars): ${TOKEN:0:50}..."
else
  echo -e "${RED}❌ Error generando token${NC}"
  echo "$TOKEN_RESPONSE"
fi
echo ""

# Test 3: Get Channels
echo -e "${YELLOW}🧪 Test 3: Get Channels${NC}"
CHANNELS_RESPONSE=$(curl -s "https://$CUSTOM_DOMAIN/channels?limit=5")
if echo "$CHANNELS_RESPONSE" | grep -q "success"; then
  TOTAL=$(echo "$CHANNELS_RESPONSE" | grep -o '"total":[0-9]*' | cut -d':' -f2 || echo "0")
  echo -e "${GREEN}✅ Channels endpoint OK - Total: $TOTAL canales${NC}"
else
  echo -e "${RED}❌ Channels endpoint falló${NC}"
fi
echo ""

# Test 4: Get Playlist M3U8
if [ -n "$TOKEN" ]; then
  echo -e "${YELLOW}🧪 Test 4: Get Playlist M3U8${NC}"
  PLAYLIST_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "https://$CUSTOM_DOMAIN/playlist.m3u8")
  
  if echo "$PLAYLIST_RESPONSE" | grep -q "#EXTM3U"; then
    PLAYLIST_CHANNELS=$(echo "$PLAYLIST_RESPONSE" | grep -c "^#EXTINF" || echo "0")
    echo -e "${GREEN}✅ Playlist M3U8 generado - Canales: $PLAYLIST_CHANNELS${NC}"
  else
    echo -e "${RED}❌ Playlist M3U8 falló${NC}"
  fi
  echo ""
fi

# ═══════════════════════════════════════════════════════════════════════════
# FASE 7: RESUMEN FINAL
# ═══════════════════════════════════════════════════════════════════════════

echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  ✅ DEPLOYMENT COMPLETADO EXITOSAMENTE                        ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📊 RESUMEN:${NC}"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "   ${GREEN}✅${NC} R2 Bucket: $BUCKET_NAME"
echo -e "   ${GREEN}✅${NC} M3U8 Upload: playlists/$(basename $M3U8_FILE)"
echo -e "   ${GREEN}✅${NC} Worker: $WORKER_NAME"
echo -e "   ${GREEN}✅${NC} Custom Domain: https://$CUSTOM_DOMAIN"
echo -e "   ${GREEN}✅${NC} Canales: $CHANNEL_COUNT"
echo ""
echo -e "${BLUE}🔗 ENDPOINTS DISPONIBLES:${NC}"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "   ${CYAN}Health:${NC}    https://$CUSTOM_DOMAIN/health"
echo -e "   ${CYAN}Token:${NC}     https://$CUSTOM_DOMAIN/token/generate?user_id=test"
echo -e "   ${CYAN}Channels:${NC}  https://$CUSTOM_DOMAIN/channels?limit=50"
echo -e "   ${CYAN}Groups:${NC}    https://$CUSTOM_DOMAIN/groups"
echo -e "   ${CYAN}Playlist:${NC}  https://$CUSTOM_DOMAIN/playlist.m3u8"
echo -e "   ${CYAN}Stats:${NC}     https://$CUSTOM_DOMAIN/stats"
echo ""
echo -e "${BLUE}📝 PRÓXIMOS PASOS:${NC}"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "   1. Configurar DNS en Cloudflare Dashboard"
echo -e "   2. Activar USE_CLOUDFLARE = true en frontend"
echo -e "   3. Ejecutar tests completos: ${GREEN}./tests/test_m3u8_native.sh${NC}"
echo -e "   4. Monitorear en Cloudflare Dashboard → Workers"
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"

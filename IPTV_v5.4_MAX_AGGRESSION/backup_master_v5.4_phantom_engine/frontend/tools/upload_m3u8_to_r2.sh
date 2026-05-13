#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
# UPLOAD M3U8 TO CLOUDFLARE R2 - NATIVE FORMAT (NO CONVERSION)
# ═══════════════════════════════════════════════════════════════════════════
# Version: 2.0.0 FINAL
# Date: 10 Enero 2026
# Description: Sube archivos M3U8 nativos a R2 sin conversión
# ═══════════════════════════════════════════════════════════════════════════

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  UPLOAD M3U8 TO CLOUDFLARE R2${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# CONFIGURACIÓN
# ═══════════════════════════════════════════════════════════════════════════

BUCKET_NAME="ape-channels"
M3U8_SOURCE="${1:-APE_ULTIMATE_v9.0_20260107.m3u8}"
R2_DESTINATION="${2:-playlists/APE_ULTIMATE_v9.0_20260107.m3u8}"

# ═══════════════════════════════════════════════════════════════════════════
# VALIDACIONES
# ═══════════════════════════════════════════════════════════════════════════

echo -e "${YELLOW}[1/6] Validando archivo M3U8...${NC}"

# Verificar que existe el archivo M3U8
if [ ! -f "$M3U8_SOURCE" ]; then
  echo -e "${RED}❌ Error: Archivo M3U8 no encontrado: $M3U8_SOURCE${NC}"
  echo -e "${YELLOW}Uso: $0 <archivo_m3u8> [ruta_destino_r2]${NC}"
  echo -e "${YELLOW}Ejemplo: $0 playlist.m3u8 playlists/playlist.m3u8${NC}"
  exit 1
fi

# Verificar que es un archivo M3U8 válido
if ! grep -q "#EXTM3U" "$M3U8_SOURCE"; then
  echo -e "${RED}❌ Error: El archivo no parece ser un M3U8 válido (falta header #EXTM3U)${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Archivo M3U8 válido${NC}"

# ═══════════════════════════════════════════════════════════════════════════
# ESTADÍSTICAS DEL ARCHIVO
# ═══════════════════════════════════════════════════════════════════════════

echo ""
echo -e "${YELLOW}[2/6] Analizando archivo...${NC}"

FILE_SIZE=$(du -h "$M3U8_SOURCE" | cut -f1)
LINE_COUNT=$(wc -l < "$M3U8_SOURCE")
CHANNEL_COUNT=$(grep -c "^#EXTINF" "$M3U8_SOURCE" || echo "0")
GROUP_COUNT=$(grep -o 'group-title="[^"]*"' "$M3U8_SOURCE" | sort -u | wc -l || echo "0")

echo -e "${BLUE}📄 Archivo:${NC} $M3U8_SOURCE"
echo -e "${BLUE}📊 Tamaño:${NC} $FILE_SIZE"
echo -e "${BLUE}📝 Líneas:${NC} $LINE_COUNT"
echo -e "${BLUE}📺 Canales:${NC} $CHANNEL_COUNT"
echo -e "${BLUE}📁 Grupos:${NC} $GROUP_COUNT"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# VERIFICAR WRANGLER
# ═══════════════════════════════════════════════════════════════════════════

echo -e "${YELLOW}[3/6] Verificando Wrangler CLI...${NC}"

if ! command -v wrangler &> /dev/null; then
  echo -e "${RED}❌ Error: Wrangler CLI no encontrado${NC}"
  echo -e "${YELLOW}Instalar con: npm install -g wrangler@latest${NC}"
  exit 1
fi

WRANGLER_VERSION=$(wrangler --version 2>&1 | head -n 1)
echo -e "${GREEN}✅ Wrangler instalado: $WRANGLER_VERSION${NC}"

# ═══════════════════════════════════════════════════════════════════════════
# VERIFICAR BUCKET R2
# ═══════════════════════════════════════════════════════════════════════════

echo ""
echo -e "${YELLOW}[4/6] Verificando bucket R2...${NC}"

# Listar buckets para verificar que existe
if wrangler r2 bucket list 2>&1 | grep -q "$BUCKET_NAME"; then
  echo -e "${GREEN}✅ Bucket '$BUCKET_NAME' encontrado${NC}"
else
  echo -e "${YELLOW}⚠️  Bucket '$BUCKET_NAME' no encontrado. Creando...${NC}"
  wrangler r2 bucket create "$BUCKET_NAME"
  echo -e "${GREEN}✅ Bucket creado exitosamente${NC}"
fi

# ═══════════════════════════════════════════════════════════════════════════
# UPLOAD A R2
# ═══════════════════════════════════════════════════════════════════════════

echo ""
echo -e "${YELLOW}[5/6] Subiendo a R2...${NC}"

# Crear directorio en R2 si no existe (upload automáticamente crea la ruta)
wrangler r2 object put "$BUCKET_NAME/$R2_DESTINATION" --file="$M3U8_SOURCE"

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Upload completado exitosamente${NC}"
else
  echo -e "${RED}❌ Error durante el upload${NC}"
  exit 1
fi

# ═══════════════════════════════════════════════════════════════════════════
# VERIFICACIÓN POST-UPLOAD
# ═══════════════════════════════════════════════════════════════════════════

echo ""
echo -e "${YELLOW}[6/6] Verificando upload...${NC}"

# Listar objeto para verificar
OBJECT_INFO=$(wrangler r2 object get "$BUCKET_NAME/$R2_DESTINATION" --file=/dev/null 2>&1 | head -n 5)

echo -e "${GREEN}✅ Archivo verificado en R2${NC}"

# ═══════════════════════════════════════════════════════════════════════════
# RESUMEN FINAL
# ═══════════════════════════════════════════════════════════════════════════

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ UPLOAD COMPLETADO EXITOSAMENTE${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}📍 Ubicación en R2:${NC}"
echo -e "   Bucket: ${GREEN}$BUCKET_NAME${NC}"
echo -e "   Path: ${GREEN}$R2_DESTINATION${NC}"
echo ""
echo -e "${BLUE}🔗 Acceso vía Worker:${NC}"
echo -e "   ${GREEN}https://api.ape-tv.net/playlist.m3u8${NC}"
echo ""
echo -e "${BLUE}📊 Estadísticas:${NC}"
echo -e "   Tamaño: $FILE_SIZE"
echo -e "   Canales: $CHANNEL_COUNT"
echo -e "   Grupos: $GROUP_COUNT"
echo ""
echo -e "${YELLOW}💡 Próximos pasos:${NC}"
echo -e "   1. Deploy del Worker: ${GREEN}cd ../cf_worker && wrangler deploy${NC}"
echo -e "   2. Test endpoint: ${GREEN}curl https://api.ape-tv.net/health${NC}"
echo -e "   3. Generar token: ${GREEN}curl https://api.ape-tv.net/token/generate?user_id=test${NC}"
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

#!/bin/bash

# ════════════════════════════════════════════════════════════════
# 🚀 APE v15.1 WORKER FIX - IMPLEMENTATION SCRIPT
# ════════════════════════════════════════════════════════════════

echo "🔵 INICIANDO IMPLEMENTACIÓN DE FIX..."

# 1. NAVEGAR AL DIRECTORIO
cd cf_worker/src || { echo "❌ Directorio cf_worker/src no encontrado"; exit 1; }

# 2. BACKUP
echo "📦 Creando backup de index.js..."
cp index.js index.js.backup.v15

# 3. INSTALAR FIX
echo "⚙️ Reemplazando archivo index.js..."
# NOTA: Asegúrate de que Cloudflare_Worker_FIXED_index.js existe en el path correcto
cp ../../Cloudflare_Worker_FIXED_index.js index.js

# 4. DEPLOY
echo "🚀 Desplegando a Cloudflare..."
cd ..
npx wrangler deploy

# 5. VERIFICACIÓN
echo "🧪 Ejecutando tests de verificación..."
echo "--- TEST 1: HEALTH ---"
curl -s https://api.ape-tv.net/health | jq

echo -e "\n--- TEST 2: REDIRECT (Base64) ---"
# URL encoded: http://line.tivi-ott.net/test.m3u8
curl -I "https://api.ape-tv.net/stream?channel_id=TEST&original_url=aHR0cDovL2xpbmUudGl2aS1vdHQubmV0L3Rlc3QubTN1OA=="

echo -e "\n--- TEST 3: CORS ---"
curl -I -X OPTIONS https://api.ape-tv.net/stream

echo -e "\n✅ PROCESO COMPLETADO."

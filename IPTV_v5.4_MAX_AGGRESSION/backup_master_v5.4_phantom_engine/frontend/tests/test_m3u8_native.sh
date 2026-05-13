#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
# TEST SUITE - M3U8 NATIVE WITH R2
# ═══════════════════════════════════════════════════════════════════════════
# Version: 2.0.0 FINAL
# Date: 10 Enero 2026
# Description: Suite completa de tests para validar el deployment
# ═══════════════════════════════════════════════════════════════════════════

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuración
API_BASE="${1:-https://api.ape-tv.net}"
VERBOSE="${2:-false}"

echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  TEST SUITE - M3U8 NATIVE WITH R2                            ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}API Base URL:${NC} $API_BASE"
echo ""

TESTS_PASSED=0
TESTS_FAILED=0
TOTAL_TESTS=8

# ═══════════════════════════════════════════════════════════════════════════
# TEST 1: Health Check
# ═══════════════════════════════════════════════════════════════════════════

echo -e "${YELLOW}[1/$TOTAL_TESTS] Testing Health Endpoint...${NC}"

RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE/health")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | grep -q '"status":"OK"'; then
  echo -e "${GREEN}✅ PASS: Health check${NC}"
  if [ "$VERBOSE" = "true" ]; then
    echo "$BODY" | head -n 5
  fi
  ((TESTS_PASSED++))
else
  echo -e "${RED}❌ FAIL: Health check${NC}"
  echo "HTTP Code: $HTTP_CODE"
  echo "$BODY"
  ((TESTS_FAILED++))
fi
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# TEST 2: Generate Token
# ═══════════════════════════════════════════════════════════════════════════

echo -e "${YELLOW}[2/$TOTAL_TESTS] Testing Token Generation...${NC}"

RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE/token/generate?user_id=test&expires_in=21600")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | grep -q '"token"'; then
  TOKEN=$(echo "$BODY" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
  echo -e "${GREEN}✅ PASS: Token generation${NC}"
  echo "Token (50 chars): ${TOKEN:0:50}..."
  ((TESTS_PASSED++))
else
  echo -e "${RED}❌ FAIL: Token generation${NC}"
  echo "HTTP Code: $HTTP_CODE"
  echo "$BODY"
  ((TESTS_FAILED++))
  echo ""
  echo -e "${RED}⚠️ Stopping tests (token required for subsequent tests)${NC}"
  exit 1
fi
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# TEST 3: List Channels
# ═══════════════════════════════════════════════════════════════════════════

echo -e "${YELLOW}[3/$TOTAL_TESTS] Testing Channels Endpoint...${NC}"

RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE/channels?limit=10")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | grep -q '"success":true'; then
  TOTAL=$(echo "$BODY" | grep -o '"total":[0-9]*' | cut -d':' -f2)
  echo -e "${GREEN}✅ PASS: Channels endpoint (Total: $TOTAL)${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}❌ FAIL: Channels endpoint${NC}"
  echo "HTTP Code: $HTTP_CODE"
  ((TESTS_FAILED++))
fi
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# TEST 4: List Groups
# ═══════════════════════════════════════════════════════════════════════════

echo -e "${YELLOW}[4/$TOTAL_TESTS] Testing Groups Endpoint...${NC}"

RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE/groups")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | grep -q '"success":true'; then
  GROUPS=$(echo "$BODY" | grep -o '"total":[0-9]*' | cut -d':' -f2)
  echo -e "${GREEN}✅ PASS: Groups endpoint (Total: $GROUPS groups)${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}❌ FAIL: Groups endpoint${NC}"
  echo "HTTP Code: $HTTP_CODE"
  ((TESTS_FAILED++))
fi
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# TEST 5: Get Playlist M3U8 (Native)
# ═══════════════════════════════════════════════════════════════════════════

echo -e "${YELLOW}[5/$TOTAL_TESTS] Testing Playlist M3U8 (Native Format)...${NC}"

RESPONSE=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/playlist.m3u8")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | grep -q "#EXTM3U"; then
  CHANNELS_IN_PLAYLIST=$(echo "$BODY" | grep -c "^#EXTINF" || echo "0")
  echo -e "${GREEN}✅ PASS: Playlist M3U8 (Channels: $CHANNELS_IN_PLAYLIST)${NC}"
  
  if [ "$VERBOSE" = "true" ]; then
    echo "First 5 lines:"
    echo "$BODY" | head -n 5
  fi
  
  ((TESTS_PASSED++))
else
  echo -e "${RED}❌ FAIL: Playlist M3U8${NC}"
  echo "HTTP Code: $HTTP_CODE"
  echo "$BODY" | head -n 10
  ((TESTS_FAILED++))
fi
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# TEST 6: Channel Redirect (302)
# ═══════════════════════════════════════════════════════════════════════════

echo -e "${YELLOW}[6/$TOTAL_TESTS] Testing Channel Redirect (302)...${NC}"

# Obtener primer canal ID de la playlist
FIRST_CHANNEL_URL=$(echo "$BODY" | grep -m 1 "^http" || echo "")

if [ -n "$FIRST_CHANNEL_URL" ]; then
  # Extraer ID del canal de la URL proxy
  CHANNEL_PATH=$(echo "$FIRST_CHANNEL_URL" | sed 's|.*/canal/||')
  
  RESPONSE=$(curl -s -w "\n%{http_code}" -I "$API_BASE/canal/$CHANNEL_PATH?token=$TOKEN")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
  
  if [ "$HTTP_CODE" = "302" ]; then
    LOCATION=$(echo "$RESPONSE" | grep -i "^location:" | cut -d' ' -f2 | tr -d '\r')
    echo -e "${GREEN}✅ PASS: Channel redirect${NC}"
    echo "Redirect to: ${LOCATION:0:70}..."
    ((TESTS_PASSED++))
  else
    echo -e "${RED}❌ FAIL: Channel redirect${NC}"
    echo "Expected 302, got: $HTTP_CODE"
    ((TESTS_FAILED++))
  fi
else
  echo -e "${YELLOW}⚠️ SKIP: No channels in playlist${NC}"
  ((TESTS_FAILED++))
fi
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# TEST 7: Stats Endpoint
# ═══════════════════════════════════════════════════════════════════════════

echo -e "${YELLOW}[7/$TOTAL_TESTS] Testing Stats Endpoint...${NC}"

RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE/stats")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ PASS: Stats endpoint${NC}"
  if [ "$VERBOSE" = "true" ]; then
    echo "$BODY" | head -n 10
  fi
  ((TESTS_PASSED++))
else
  echo -e "${RED}❌ FAIL: Stats endpoint${NC}"
  echo "HTTP Code: $HTTP_CODE"
  ((TESTS_FAILED++))
fi
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# TEST 8: Unauthorized Access (debe fallar)
# ═══════════════════════════════════════════════════════════════════════════

echo -e "${YELLOW}[8/$TOTAL_TESTS] Testing Unauthorized Access (should fail)...${NC}"

RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE/playlist.m3u8")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

if [ "$HTTP_CODE" = "401" ]; then
  echo -e "${GREEN}✅ PASS: Unauthorized access blocked correctly${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}❌ FAIL: Unauthorized access should return 401, got $HTTP_CODE${NC}"
  ((TESTS_FAILED++))
fi
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# RESUMEN FINAL
# ═══════════════════════════════════════════════════════════════════════════

echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  TEST RESULTS                                                ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Total Tests:${NC} $TOTAL_TESTS"
echo -e "${GREEN}Passed:${NC} $TESTS_PASSED"
echo -e "${RED}Failed:${NC} $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ✅ ALL TESTS PASSED - DEPLOYMENT OK                         ║${NC}"
  echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
  exit 0
else
  echo -e "${RED}╔═══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  ❌ SOME TESTS FAILED - REVIEW LOGS                          ║${NC}"
  echo -e "${RED}╚═══════════════════════════════════════════════════════════════╝${NC}"
  exit 1
fi

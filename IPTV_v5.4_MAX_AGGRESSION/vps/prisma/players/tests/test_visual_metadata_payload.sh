#!/bin/bash
# Test read-only del Metadata Visual Payload Layer (sin device).
# Valida: JSON válido · do_not_fake · algorithm_stack · no fake claims.
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PAYLOAD="${DIR}/../lib/visual_metadata_payload.sh"
PASS=0; FAIL=0
chk() { if eval "$2"; then PASS=$((PASS+1)); echo "  PASS $1"; else FAIL=$((FAIL+1)); echo "  FAIL $1"; fi; }

# Decisión simulada (CRYSTAL_UHD_SAFE)
export VP_PROFILE=CRYSTAL_UHD_SAFE VP_VARIANT=best.m3u8 VP_VARIANT_POLICY=best_visual
export VP_CODEC=hevc VP_RES=2160p VP_FPS=match_display VP_HDR=hdr_if_proven
export VP_MEMC=enable VP_SR=enable VP_SHARP=adaptive_safe VP_COLOR=oled_vivid_safe
export VP_ANTIREBUFFER=visual_priority VP_REASON="test" VP_CONF=0.8
export APE_DEVICE_ID=dev1 APE_CHANNEL_ID=ch1 APE_PLAYER=ottnavigator
. "$PAYLOAD"
JSON="$(build_visual_payload_json | tr -d '\n')"

echo "== JSON payload =="
echo "$JSON"
echo ""

# 1. JSON válido (parseable por python si existe)
if command -v python >/dev/null 2>&1 || command -v python3 >/dev/null 2>&1; then
    PY=python; command -v python >/dev/null 2>&1 || PY=python3
    echo "$JSON" | $PY -c 'import json,sys; json.load(sys.stdin); print("  json: parseable")' \
        && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "  FAIL json parse"; }
else
    chk "json_braces" '[ "${JSON:0:1}" = "{" ] && [ "${JSON: -1}" = "}" ]'
fi

# 2. Contiene do_not_fake con los 4 flags
chk "do_not_fake_present" 'echo "$JSON" | grep -q "\"do_not_fake\":{\"hdr\":true,\"4k\":true,\"codec\":true,\"fps\":true}"'
# 3. Contiene algorithm_stack
chk "algorithm_stack_present" 'echo "$JSON" | grep -q "\"algorithm_stack\""'
# 4. algorithm_stack incluye anti-judder/anti-blur/anti-fake_hdr
chk "guard_judder" 'echo "$JSON" | grep -q "soap_opera_judder"'
chk "guard_blur" 'echo "$JSON" | grep -q "over_denoise"'
chk "guard_fake_hdr" 'echo "$JSON" | grep -q "fake_hdr"'
# 5. No declara codec falso: respeta el codec dado (hevc), no inventa
chk "codec_preference" 'echo "$JSON" | grep -q "\"codec_preference\":\"hevc\""'
# 6. version sello
chk "version" 'echo "$JSON" | grep -q "ape_visual_version"'

# 7. Caso TRUTHFUL: codec source, no fake (cambiar decisión)
export VP_PROFILE=TRUTHFUL_SOURCE_SAFE VP_CODEC=source VP_RES=source VP_HDR=disable_fake_hdr VP_MEMC=disable
JSON2="$(build_visual_payload_json | tr -d '\n')"
chk "truthful_codec_source" 'echo "$JSON2" | grep -q "\"codec_preference\":\"source\""'
chk "truthful_no_fake_hdr" 'echo "$JSON2" | grep -q "\"hdr_policy\":\"disable_fake_hdr\""'

echo ""
echo "RESULT: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]

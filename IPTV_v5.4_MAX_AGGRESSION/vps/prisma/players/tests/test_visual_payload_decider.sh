#!/bin/bash
# Tests read-only del Visual Payload Decider + apply non-ADB (sin device).
# Cubre la verificación del anexo Crystal UHD. Ejecutar: bash test_visual_payload_decider.sh
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
DEC="${DIR}/../lib/visual_payload_decider.sh"
APPLY="${DIR}/../lib/visual_payload_apply.sh"
PASS=0; FAIL=0

base() {  # estado "ideal" 4K
    TEL_FG_PKG=studio.scillarium.ottnavigator; TEL_CODEC_VIDEO=hevc; TEL_HW_DECODE=true
    TEL_BUFFER=ok; TEL_DROPPED=0; TEL_JUDDER=false; TEL_HDR=hdr10
    CAP_SOC_FAMILY=amlogic; CAP_CAN_MEMC=true
    TV_RES_MAX=3840x2160; TV_UPSCALER=true; TV_SR=available; TV_MEMC=available; TV_HDR=hdr10
    NET_SCORE=high; NET_ZAPPING=false; NET_PROVIDER=stable
    MV_STATUS=ok; MV_HAS_4K=true; MV_HAS_HEVC=true; MV_HAS_HDR=true
    MV_BEST_VISUAL=best.m3u8; MV_SAFEST=safe.m3u8; MV_ANTIREBUFFER=anti.m3u8
}
run() { . "$DEC"; visual_payload_decider >/dev/null 2>&1; }
chk() { local n="$1" v="$2" e="$3" g="${!2}"; if [ "$g" = "$e" ]; then PASS=$((PASS+1)); echo "  PASS $n: $v=$g"; else FAIL=$((FAIL+1)); echo "  FAIL $n: $v=$g (esp $e)"; fi; }

echo "== 1: 4K+HEVC+HW+buffer ok+net high+TV2160 → CRYSTAL_UHD_EXTREME =="
base; run; chk extreme VP_PROFILE CRYSTAL_UHD_EXTREME; chk extreme_var VP_VARIANT best.m3u8

echo "== 2: 4K pero rebuffer → STABLE_1080P_PREMIUM =="
base; TEL_BUFFER=rebuffer; run; chk rebuffer VP_PROFILE STABLE_1080P_PREMIUM

echo "== 3: HEVC software decode → STABLE + H264 =="
base; TEL_HW_DECODE=false; run; chk sw VP_PROFILE STABLE_1080P_PREMIUM; chk sw_codec VP_CODEC h264

echo "== 4: judder → MEMC avoid =="
base; TEL_JUDDER=true; run; chk judder VP_MEMC avoid_due_to_judder

echo "== 5: HDR no probado (player sdr, sin hdr en fuente) → disable_fake_hdr =="
base; TEL_HDR=sdr; MV_HAS_HDR=false; run; chk fakehdr VP_HDR disable_fake_hdr

echo "== 8: codec desconocido → TRUTHFUL_SOURCE_SAFE =="
base; TEL_CODEC_VIDEO=unknown; run; chk unknown VP_PROFILE TRUTHFUL_SOURCE_SAFE

echo "== 9: manifest sin variantes (FAILED) → no inventa 4K (TRUTHFUL) =="
base; MV_STATUS=FAILED; MV_HAS_4K=false; run; chk novar VP_PROFILE TRUTHFUL_SOURCE_SAFE; chk novar_codec VP_CODEC source

echo "== dropped altos → STABLE + MEMC off =="
base; TEL_DROPPED=120; run; chk dropped VP_PROFILE STABLE_1080P_PREMIUM; chk dropped_memc VP_MEMC disable

echo "== net baja → LOW_LATENCY_SAFE =="
base; NET_SCORE=low; run; chk lowlat VP_PROFILE LOW_LATENCY_SAFE

echo "== 6/7: Roku/Apple (non-ADB) → apply manifest_only, sin device write =="
CONTROL_PLANE=roku_ecp; VP_VARIANT=best.m3u8; VP_CODEC=source; VP_RES=source; VP_HDR=source
out="$(. "$APPLY"; visual_payload_apply 1.2.3.4 2>&1)"
case "$out" in *manifest_only*NOT_SUPPORTED*) PASS=$((PASS+1)); echo "  PASS roku_apply: manifest_only/NOT_SUPPORTED";; *) FAIL=$((FAIL+1)); echo "  FAIL roku_apply: $out";; esac

echo ""
echo "RESULT: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]

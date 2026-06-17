#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# Tests read-only del Playback Profile Decider (sin device, sin ADB).
# Valida las reglas del anexo: HEVC/HW→CRYSTAL, sw/rebuffer→downgrade,
# dropped/judder→MEMC off/avoid, codec unknown→TRUTHFUL, no-foreground→no agresivo,
# fake HDR off. Ejecutar: bash test_playback_decider.sh
# ══════════════════════════════════════════════════════════════════════════
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
DECIDER="${DIR}/../lib/playback_profile_decider.sh"
PASS=0; FAIL=0

reset_vars() {
    TEL_FG_PKG=studio.scillarium.ottnavigator; TEL_PLAYER=ottnavigator
    TEL_CODEC_VIDEO=hevc; TEL_HW_DECODE=true; TEL_BUFFER=ok
    TEL_DROPPED=0; TEL_JUDDER=false; TEL_HDR=unknown; TEL_FPS=60; TEL_RES=3840x2160
    CAP_SOC_FAMILY=amlogic; CAP_CAN_MEMC=true
}
run() { . "$DECIDER"; playback_profile_decider >/dev/null 2>&1; }
chk() {  # <case> <var> <expected>
    local name="$1" var="$2" exp="$3" got="${!2}"
    if [ "$got" = "$exp" ]; then PASS=$((PASS+1)); echo "  PASS  $name : $var=$got";
    else FAIL=$((FAIL+1)); echo "  FAIL  $name : $var=$got (esperado $exp)"; fi
}

echo "== Caso 1: sin player foreground → no agresivo =="
reset_vars; TEL_FG_PKG=unknown; TEL_PLAYER=unknown; run
chk "no_foreground" REC_PROFILE TRUTHFUL_SOURCE_SAFE
chk "no_foreground_memc" MEMC_POLICY disable

echo "== Caso 2: foreground + HEVC + HW + buffer ok → CRYSTAL_UHD_SAFE =="
reset_vars; run
chk "hevc_hw_ok" REC_PROFILE CRYSTAL_UHD_SAFE
chk "hevc_hw_codec" REC_CODEC hevc

echo "== Caso 3a: HEVC software decode → downgrade =="
reset_vars; TEL_HW_DECODE=false; run
chk "hevc_sw" REC_PROFILE STABLE_1080P_PREMIUM
chk "hevc_sw_codec" REC_CODEC h264

echo "== Caso 3b: rebuffer → downgrade =="
reset_vars; TEL_BUFFER=rebuffer; run
chk "rebuffer" REC_PROFILE STABLE_1080P_PREMIUM

echo "== Caso 4a: dropped frames altos → MEMC off + downgrade =="
reset_vars; TEL_DROPPED=120; run
chk "dropped" MEMC_POLICY disable
chk "dropped_profile" REC_PROFILE STABLE_1080P_PREMIUM

echo "== Caso 4b: judder → MEMC avoid, sin 60 fake =="
reset_vars; TEL_JUDDER=true; run
chk "judder_memc" MEMC_POLICY avoid_due_to_judder
chk "judder_fps" REC_FPS source

echo "== Caso 5: codec desconocido → TRUTHFUL_SOURCE_SAFE =="
reset_vars; TEL_CODEC_VIDEO=unknown; run
chk "codec_unknown" REC_PROFILE TRUTHFUL_SOURCE_SAFE
chk "codec_unknown_codec" REC_CODEC source

echo "== Caso 6: HDR no probado (sdr) → disable_fake_hdr =="
reset_vars; TEL_HDR=sdr; run
chk "fake_hdr_off" HDR_POLICY disable_fake_hdr

echo "== Caso 7: SoC sin MEMC (generic) → not_supported =="
reset_vars; CAP_SOC_FAMILY=generic; CAP_CAN_MEMC=false; run
chk "memc_unsupported" MEMC_POLICY not_supported

echo ""
echo "RESULT: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]

#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# Test — Daemon Reactive Authority Boundary (15 validaciones del GO).
# PRUEBA que el daemon NO gobierna apps: ningún script operativo emite comandos
# de control de app/UI/playback; el guard bloquea; TTL/codec/MEMC se respetan.
# Ejecutar: bash test_daemon_authority_boundary.sh
# ══════════════════════════════════════════════════════════════════════════
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT="$(cd "$DIR/../../../.." && pwd)"   # → IPTV_v5.4_MAX_AGGRESSION
GUARD="$DIR/../lib/daemon_authority_guard.sh"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  PASS $1"; }
bad() { FAIL=$((FAIL+1)); echo "  FAIL $1"; }

# Scripts OPERATIVOS del daemon (excluye el guard que DEFINE los patrones, y los tests)
SCRIPTS="
vps/sentinel/profiles/generic_player.sh
vps/sentinel/profiles/onn_4k.sh
vps/prisma/players/lib/visual_payload_apply.sh
vps/prisma/players/lib/qoe_feedback_loop.sh
vps/prisma/players/lib/visual_metadata_payload.sh
vps/prisma/players/adb/collect_player_telemetry.sh
vps/prisma/players/ape-universal-player-orchestrator.sh
vps/prisma/adb/ape-player-autoinstall.sh
vps/prisma/adb/ape-wake-worker.sh
vps/prisma/install/ape-daemon-bootstrap.sh
"
scan() {  # <label> <regex>   → PASS si 0 ocurrencias en COMANDOS (no comentarios)
    local label="$1" rx="$2" hits=0 f
    for f in $SCRIPTS; do
        [ -f "$ROOT/$f" ] || continue
        # Ignora líneas de comentario (^# ...): solo cuentan comandos ejecutables.
        if grep -vE '^[[:space:]]*#' "$ROOT/$f" 2>/dev/null | grep -qE "$rx"; then
            hits=$((hits+1)); echo "    ↳ $f"
        fi
    done
    [ "$hits" -eq 0 ] && ok "$label (0 ocurrencias ejecutables)" || bad "$label ($hits archivos)"
}

echo "== Invariantes: NINGÚN script operativo gobierna apps =="
scan "1.no am start"        '\bam start'
scan "2.no force-stop"      'force-stop'
scan "3.no input keyevent"  'input[[:space:]]+keyevent'
scan "3b.no input tap"      'input[[:space:]]+tap'
scan "4.no monkey"          '\bmonkey\b'
scan "5.no pm clear/disable/uninstall" 'pm[[:space:]]+(clear|disable|uninstall|hide)'
scan "5b.no kill -9 / killall" '(kill[[:space:]]+-9|kill[[:space:]]+-KILL|killall)'
scan "14.no nginx/url/provider mutation" '(nginx[[:space:]]+-s|proxy_pass|upstream[[:space:]])'

echo "== Guard funcional =="
if [ -f "$GUARD" ]; then
    # shellcheck source=/dev/null
    . "$GUARD"
    ape_authority_selftest && ok "6.guard selftest (bloquea prohibidos, permite settings/broadcast/wake)" || bad "6.guard selftest"
    # 7. TTL: payload viejo rechazado / fresco aceptado
    ape_payload_fresh "$(( $(date +%s) - 999999 ))" 30000 && bad "7.TTL caduco aceptado" || ok "7.TTL caduco rechazado"
    ape_payload_fresh "$(date +%s)" 30000 && ok "7b.TTL fresco aceptado" || bad "7b.TTL fresco rechazado"
    # 10/11. L156 no default, L153 default
    [ "$(ape_codec_level false false)" = "hvc1.2.4.L153.B0" ] && ok "11.L153 default safe" || bad "11.L153 default"
    [ "$(ape_codec_level true true)" = "hvc1.2.4.L156.B0" ] && ok "10.L156 solo si 120Hz+buffer probados" || bad "10.L156 gated"
    # guard bloquea de verdad (no ejecuta)
    ( ape_guarded_adb_shell 1.2.3.4 "am force-stop ar.tvplayer.tv" >/dev/null 2>&1; [ $? -eq 99 ]; ) \
        && ok "5c.guarded_adb_shell rechaza force-stop (rc=99)" || bad "5c.guarded_adb_shell"
else
    bad "guard ausente"
fi

echo "== MEMC judder guard + codec policy en payload =="
# 9. MEMC con judder → visual_payload_decider pone avoid_due_to_judder
DEC="$DIR/../lib/visual_payload_decider.sh"
if [ -f "$DEC" ]; then
    TEL_FG_PKG=x TEL_PLAYER=ott TEL_CODEC_VIDEO=hevc TEL_HW_DECODE=true TEL_BUFFER=ok \
    TEL_JUDDER=true CAP_SOC_FAMILY=amlogic CAP_CAN_MEMC=true MV_STATUS=ok
    export TEL_FG_PKG TEL_PLAYER TEL_CODEC_VIDEO TEL_HW_DECODE TEL_BUFFER TEL_JUDDER CAP_SOC_FAMILY CAP_CAN_MEMC MV_STATUS
    . "$DEC"; visual_payload_decider >/dev/null 2>&1
    [ "${VP_MEMC:-}" = "avoid_due_to_judder" ] && ok "9.MEMC con judder → avoid" || bad "9.MEMC judder ($VP_MEMC)"
fi
# 8/12. codec_policy presente en payload + L153 preferred
PAY="$DIR/../lib/visual_metadata_payload.sh"
if [ -f "$PAY" ]; then
    export VP_PROFILE=CRYSTAL_UHD_SAFE VP_CODEC=hevc VP_CODEC_LEVEL=hvc1.2.4.L153.B0
    . "$PAY"; J="$(build_visual_payload_json | tr -d '\n')"
    echo "$J" | grep -q '"forbidden_default":"hvc1.2.4.L156.B0"' && ok "12.codec_policy bloquea L156 default" || bad "12.codec_policy"
    echo "$J" | grep -q '"ttl_ms"' && ok "8.payload lleva ttl_ms" || bad "8.ttl_ms ausente"
    echo "$J" | grep -q '"preferred":"hvc1.2.4.L153.B0"' && ok "11b.payload preferred L153" || bad "11b.preferred"
fi

echo ""
echo "RESULT: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]

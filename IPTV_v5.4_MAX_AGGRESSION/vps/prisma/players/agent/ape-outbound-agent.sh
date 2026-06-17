#!/system/bin/sh
# ══════════════════════════════════════════════════════════════════════════
# APE — Outbound Player Agent (corre EN el device · NAT-friendly · NO WG · NO ADB-in)
#
# POR QUÉ: el VPS no puede ADB-in a un Fire Stick tras NAT. Este agente vive EN el
# device (instalado 1 vez por ADB) y resuelve la mejora visual sin que el VPS entre:
#   (1) WAKE-ON-ZAP LOCAL: detecta CADA zap (cambio de canal/media) leyendo el player
#       localmente y RE-APLICA el perfil visual al instante. Cero dependencia de red →
#       dispara en cada zap aunque el VPS/WG estén caídos. (es "cada zapping = un wake")
#   (2) SYNC OUTBOUND: poll saliente al VPS por TLS:443 (atraviesa NAT) por comandos del
#       operador (reapply/profile) + (opcional) post de QoE. Sin inbound, sin WG.
#
# SEGURIDAD: autentica con token por-device (archivo local). Solo ejecuta un ALLOWLIST
# de tipos de comando (wake|refresh|apply_profile|noop) → acción LOCAL. NUNCA evalúa ni
# ejecuta shell recibido del wire (si el VPS se compromete, no hay RCE en el device).
#
# DOCTRINA: nunca mata el player, idempotente (get→compare→put), single-instance, clean.
# Portabilidad: POSIX sh (mksh/toybox de Android). HTTP best-effort (curl|wget|toybox).
#
# Uso (on-device, lanzado por el bootstrap con clean-detach):
#   setsid sh /data/local/tmp/ape-outbound-agent.sh </dev/null >/dev/null 2>&1 &
# ══════════════════════════════════════════════════════════════════════════
set -u

DEV_ID="${APE_DEV_ID:-$(getprop ro.serialno 2>/dev/null)}"
TOKFILE="/data/local/tmp/ape-agent.token"
chmod 600 "$TOKFILE" 2>/dev/null || true        # [sec review HIGH#2] token NO world-readable (self-heal)
TOKEN="$(cat "$TOKFILE" 2>/dev/null || true)"
PULL_FAILS=0                                     # [sec review] backoff ante VPS caído/5xx
VPS_URL="${APE_VPS_URL:-https://iptv-ape.duckdns.org}"
PULL_URL="$VPS_URL/prisma/api/ape-pull.php"
MATCH_URL="$VPS_URL/prisma/api/ape-match.php"      # iData loop: real(logcat)→VPS→carga China Box
POLL="${APE_AGENT_POLL:-12}"          # s entre ciclos
ZAP_POLL="${APE_ZAP_POLL:-2}"         # s entre chequeos de zap (más fino que el sync)
LOCK="/data/local/tmp/ape-outbound-agent.lock"
LOG="/data/local/tmp/ape-outbound-agent.log"

log() {
    echo "$(date 2>/dev/null || echo '?') $*" >> "$LOG" 2>/dev/null || true
    # trim a 500 líneas (sin depender de tail -i)
    L="$(wc -l < "$LOG" 2>/dev/null || echo 0)"
    [ "${L:-0}" -gt 800 ] 2>/dev/null && { tail -n 400 "$LOG" > "$LOG.t" 2>/dev/null && mv "$LOG.t" "$LOG" 2>/dev/null; } || true
}

# ── single-instance (best-effort: flock si existe, si no marcador de PID) ──
if command -v flock >/dev/null 2>&1; then
    exec 9>"$LOCK" 2>/dev/null || true
    flock -n 9 2>/dev/null || { log "ya corriendo (flock) — salgo"; exit 0; }
else
    if [ -f "$LOCK" ]; then
        oldpid="$(cat "$LOCK" 2>/dev/null)"
        if [ -n "${oldpid:-}" ] && kill -0 "$oldpid" 2>/dev/null; then log "ya corriendo (pid $oldpid) — salgo"; exit 0; fi
    fi
    echo "$$" > "$LOCK" 2>/dev/null || true
fi

# ── HTTP GET saliente best-effort (Android no trae curl por defecto) ──
# [sec review HIGH#1] El token va por HEADER Authorization (NO en la URL) → no queda en access.log.
http_get() {  # <url-sin-token>  → stdout body, rc!=0 si no hay cliente HTTP
    AUTH="Authorization: Bearer ${TOKEN:-}"
    if command -v curl >/dev/null 2>&1; then curl -fsS --max-time 30 -H "$AUTH" "$1" 2>/dev/null; return $?; fi
    if command -v wget >/dev/null 2>&1; then wget -q -T 30 --header="$AUTH" -O - "$1" 2>/dev/null; return $?; fi
    if command -v toybox >/dev/null 2>&1; then toybox wget --header="$AUTH" -O - "$1" 2>/dev/null; return $?; fi
    return 127
}

# ── apply LOCAL (corre EN el device → settings/setprop DIRECTO, sin adb -s) ──
put_if_diff() {  # <ns> <key> <val>
    cur="$(settings get "$1" "$2" 2>/dev/null)"
    [ "$cur" = "$3" ] || settings put "$1" "$2" "$3" 2>/dev/null || true
}
setprop_if_diff() {  # <prop> <val>
    cur="$(getprop "$1" 2>/dev/null)"
    [ "$cur" = "$2" ] || setprop "$1" "$2" 2>/dev/null || true
}

apply_profile_local() {
    # base AndroidTV
    put_if_diff global match_content_frame_rate 1
    # China Box por SoC (best-effort; SDR-safe). hdr_policy=SOURCE NO fuerza HDR en TV SDR.
    plat="$(getprop ro.board.platform 2>/dev/null)$(getprop ro.hardware 2>/dev/null)"
    case "$plat" in
        *amlogic*|*s905*|*s922*|*t9*)
            put_if_diff system aipq_enable 1
            put_if_diff system aisr_enable 1
            put_if_diff system ai_sr_mode 3
            put_if_diff system memc_enable 1
            setprop_if_diff persist.sys.memc.enable 1
            echo 1 > /sys/module/am_vecm/parameters/hdr_policy 2>/dev/null || true
            su -c 'echo 1 > /sys/module/am_vecm/parameters/hdr_policy' 2>/dev/null || true
            am broadcast -a com.droidlogic.tv.action.MEMC_ENABLE --ei enable 1 >/dev/null 2>&1 || true
            am broadcast -a com.droidlogic.tv.action.AISR_ENABLE --ei enable 1 >/dev/null 2>&1 || true
            ;;
        *mt8*|*mt6*|*mediatek*)
            setprop_if_diff persist.vendor.mtk.memc.enable 1
            setprop_if_diff persist.vendor.tv.sr.enable 1
            ;;
    esac
    setprop_if_diff persist.ape.profile.applied_ts "$(date +%s 2>/dev/null || echo 0)"
}

# ── iData MATCH (esperado+real → carga China Box) · OUTBOUND NAT-friendly ──────
# El daemon lee la REALIDAD del decoder (logcat) y la manda al VPS; el VPS responde
# la CARGA (a la conexión saliente → atraviesa NAT) y la aplicamos local.
# Best-effort y NO BLOQUEANTE: si falla, el zap ya quedó mejorado por apply_profile_local.
b64url() { printf '%s' "$1" | base64 2>/dev/null | tr -d '\n' | tr '+/' '-_' | tr -d '='; }

read_real_decode() {  # → JSON {"codec","res","fps","hdr"} (campos no vacíos) = realidad del player
    L="$(logcat -d -t 300 2>/dev/null | grep -iE 'video|format|mediacodec|videosize|resolution' 2>/dev/null | tail -40)"
    res="$(printf '%s' "$L" | grep -oE '[0-9]{3,4}x[0-9]{3,4}' 2>/dev/null | tail -1)"
    codec=""
    printf '%s' "$L" | grep -qiE 'hevc|hvc1|hev1|h\.?265' 2>/dev/null && codec="hevc"
    printf '%s' "$L" | grep -qiE 'av01|av1[^0-9]'        2>/dev/null && codec="av1"
    printf '%s' "$L" | grep -qiE 'dolby|dvhe|dvh1'       2>/dev/null && codec="dvhe"
    fps="$(printf '%s' "$L" | grep -oiE 'fps[=: ]*[0-9]+' 2>/dev/null | grep -oE '[0-9]+' | tail -1)"
    hdr=""
    printf '%s' "$L" | grep -qiE 'hdr10|st2084|smpte2084' 2>/dev/null && hdr="PQ"
    printf '%s' "$L" | grep -qiE 'hlg|arib-b67'           2>/dev/null && hdr="HLG"
    o=""
    [ -n "$codec" ] && o="$o\"codec\":\"$codec\","
    [ -n "$res" ]   && o="$o\"res\":\"$res\","
    [ -n "$fps" ]   && o="$o\"fps\":$fps,"
    [ -n "$hdr" ]   && o="$o\"hdr\":\"$hdr\","
    o="$(printf '%s' "$o" | sed 's/,$//' 2>/dev/null || printf '%s' "$o")"
    printf '{%s}' "$o"
}

apply_carga() {  # <carga-json> → aplica settings HONESTOS (idempotente, SDR-safe)
    c="$1"
    put_if_diff global match_content_frame_rate 1
    vr="$(printf '%s' "$c" | grep -oE '"video_range":"[A-Z]*"' 2>/dev/null | sed 's/.*:"//; s/"$//')"
    if [ "$vr" = "PQ" ] || [ "$vr" = "HLG" ]; then
        put_if_diff global hdr_conversion_mode 1   # HDR passthrough SOLO si el real lo probó (NO fake)
    fi
    log "carga aplicada (vr=${vr:-none})"
}

match_and_apply() {  # <media-sig> → real(logcat)→VPS→carga. Best-effort, NO bloquea el zap.
    [ -n "${DEV_ID:-}" ] && [ -n "${TOKEN:-}" ] || return 0
    real="$(read_real_decode)"; [ -n "$real" ] || real="{}"
    ch="$(printf '%s' "${1:-}" | tr -cd 'A-Za-z0-9_.-' | cut -c1-40)"
    enc="$(b64url "{\"ch\":\"$ch\",\"real\":$real}")"
    [ -n "$enc" ] || return 0
    carga="$(http_get "$MATCH_URL?device=$DEV_ID&idata=$enc")" || { PULL_FAILS=$((PULL_FAILS + 1)); return 0; }
    PULL_FAILS=0
    [ -n "$carga" ] || return 0
    apply_carga "$carga"
}

# ── detección de ZAP LOCAL: firma del media en curso (sin tool de hash externo) ──
current_media_sig() {
    # description= cambia al cambiar de canal/contenido. Barato, no toca el player.
    dumpsys media_session 2>/dev/null | grep -m1 -E "description=" 2>/dev/null
}

# ── comandos del VPS: ALLOWLIST ESTRICTA (nunca shell del wire) ──
dispatch_cmd() {  # <type>
    case "$1" in
        wake|refresh|apply_profile) log "cmd '$1' → apply_profile_local"; apply_profile_local ;;
        noop) : ;;
        *) log "cmd desconocido IGNORADO: $1" ;;
    esac
}

pull_vps() {
    [ -n "${DEV_ID:-}" ] && [ -n "${TOKEN:-}" ] || return 0
    resp="$(http_get "$PULL_URL?device=$DEV_ID")" || { PULL_FAILS=$((PULL_FAILS + 1)); return 0; }
    PULL_FAILS=0
    [ -n "$resp" ] || return 0
    # parse SEGURO: extrae solo los valores de "type":"<enum>" — NO se evalúa nada del wire.
    echo "$resp" | grep -oE '"type":"[a-z_]+"' 2>/dev/null | sed 's/.*:"//; s/"$//' 2>/dev/null | while IFS= read -r t; do
        [ -n "$t" ] && dispatch_cmd "$t"
    done
}

main() {
    log "agent START dev=${DEV_ID:-?} url=$VPS_URL poll=${POLL}s zap_poll=${ZAP_POLL}s"
    apply_profile_local                 # apply inicial
    LAST_SIG=""
    ACC=0
    while true; do
        sig="$(current_media_sig)"
        if [ -n "$sig" ] && [ "$sig" != "$LAST_SIG" ]; then
            LAST_SIG="$sig"
            log "ZAP local → wake (apply_profile_local)"
            apply_profile_local         # cada zap = wake LOCAL (sin red)
            match_and_apply "$sig"      # iData: real(logcat)→VPS→carga China Box (best-effort, no bloquea)
        fi
        # sync outbound cada ~POLL con BACKOFF suave ante VPS caído/5xx (no hammering)
        ACC=$((ACC + ZAP_POLL))
        m="$PULL_FAILS"; [ "$m" -gt 5 ] && m=5
        eff=$(( POLL * (1 + m) ))
        if [ "$ACC" -ge "$eff" ]; then ACC=0; pull_vps; fi
        sleep "$ZAP_POLL" 2>/dev/null || sleep 2
    done
}

case "${1:-run}" in
    run)   main ;;
    once)  apply_profile_local; pull_vps ;;
    apply) apply_profile_local ;;
    *)     echo "uso: $0 {run|once|apply}"; exit 1 ;;
esac

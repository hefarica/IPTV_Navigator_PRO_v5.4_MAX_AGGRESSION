#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# APE — Daemon Authority Guard (CONTRATO DE AUTORIDAD)
# El daemon es un REACTOR técnico despertado por el VPS. NO gobierna apps.
# Esta librería es el chokepoint que HACE CUMPLIR la frontera: bloquea cualquier
# comando ADB que gobierne apps/UI/playback, valida TTL del payload y la política
# de codec (L153 seguro por defecto, L156 solo con capability probada).
#
# Source:  . daemon_authority_guard.sh
#   ape_guarded_adb_shell <T> <shell-cmd...>   → ejecuta SOLO si no viola la frontera
#   ape_payload_fresh <issued_at_epoch> <ttl_ms>
#   ape_codec_level <tv_120_capable bool> <buffer_ok bool>  → L153 default / L156 si probado
#   ape_authority_selftest                     → 0 si las invariantes se respetan
# ══════════════════════════════════════════════════════════════════════════

# ── Invariantes duras (documentadas + verificables) ───────────────────────
APE_DAEMON_MUST_NOT_LAUNCH_APPS=true
APE_DAEMON_MUST_NOT_CLOSE_APPS=true
APE_DAEMON_MUST_NOT_SWITCH_CHANNELS=true
APE_DAEMON_MUST_NOT_CONTROL_UI=true
APE_DAEMON_MUST_NOT_NAVIGATE_MENUS=true
APE_DAEMON_MUST_NOT_FORCE_PLAYBACK=true
APE_DAEMON_MUST_NOT_LOGIN=true
APE_DAEMON_MUST_NOT_CHANGE_PROVIDER_URLS=true
APE_DAEMON_MUST_NOT_TOUCH_NGINX=true
APE_DAEMON_MUST_NOT_TOUCH_SHIELDED_URLS=true
APE_DAEMON_MUST_NOT_KILL_PROTECTED_PLAYER=true
APE_DAEMON_MUST_NOT_CREATE_SECOND_WATCHDOG=true

APE_GUARD_LOG="${APE_GUARD_LOG:-/opt/netshield/state/ape-authority-guard.log}"
ape_guard_log() { echo "$(date -u +%FT%TZ 2>/dev/null) [AUTH-GUARD] $*" >>"$APE_GUARD_LOG" 2>/dev/null || true; }

# ── ¿comando prohibido? (gobierna app/UI/playback) → 0 = PROHIBIDO ─────────
# Permitido: settings get/put, getprop/setprop, am broadcast (técnico), cmd deviceidle
#            whitelist, test/cat, pkill -USR1 (señal de wake a NUESTRO sentinel).
# Prohibido: lanzar/cerrar/forzar apps, input, monkey, pm destructivo, kill de players.
ape_cmd_forbidden() {  # <shell-cmd-string>
    local c="$1"
    case "$c" in
        *"am start"*|*"am start-activity"*|*"start-foreground-service"*) return 0 ;;  # lanzar app
        *"force-stop"*|*"am kill"*|*"am kill-all"*|*killall*)             return 0 ;;  # cerrar/matar app
        *"input keyevent"*|*"input tap"*|*"input swipe"*|*"input text"*|*"input "*) return 0 ;;  # navegar UI
        *monkey*)                                                         return 0 ;;  # fuzz UI
        *"pm clear"*|*"pm disable"*|*"pm uninstall"*|*"pm hide"*|*"pm suspend"*) return 0 ;;  # destructivo
        *"svc "*)                                                         return 0 ;;  # power/data/wifi toggle
        *"reboot"*|*"setprop ctl."*)                                      return 0 ;;  # reinicios/servicios
    esac
    # kill genérico de procesos que NO sean señal de wake al sentinel → prohibido
    case "$c" in
        *"pkill -USR1"*ape-sentinel*|*"pkill -USR1"*ape_sentinel*) return 1 ;;  # PERMITIDO (wake)
        *kill\ -9*|*"pkill -9"*|*"kill -KILL"*)                    return 0 ;;  # matar procesos
    esac
    return 1
}

# ── Wrapper ADB con frontera (único punto de ejecución de shell remoto) ────
ape_guarded_adb_shell() {  # <T> <shell-cmd...>
    local T="$1"; shift
    local cmd="$*"
    if ape_cmd_forbidden "$cmd"; then
        ape_guard_log "REFUSED (authority boundary): [$T] $cmd"
        return 99
    fi
    timeout "${ADB_TO:-6}" adb -s "$T" shell "$cmd" </dev/null 2>/dev/null
}

# ── TTL: payload caduco no se aplica ──────────────────────────────────────
ape_payload_fresh() {  # <issued_at_epoch> <ttl_ms>
    local issued="${1:-}" ttl_ms="${2:-30000}" now age
    [ -z "$issued" ] && return 1
    now="$(date +%s 2>/dev/null || echo 0)"
    age=$(( (now - issued) * 1000 ))
    [ "$age" -ge 0 ] && [ "$age" -le "$ttl_ms" ]
}

# ── Política de codec: L153 (4K@60 CORONA) seguro por defecto. ────────────
# L156 (4K@120) SOLO si 120Hz + buffer estable probados. Nunca L156 default universal.
ape_codec_level() {  # <tv_120_capable bool> <buffer_ok bool>
    if [ "${1:-false}" = true ] && [ "${2:-false}" = true ]; then
        echo "hvc1.2.4.L156.B0"
    else
        echo "hvc1.2.4.L153.B0"
    fi
}

# ── Self-test (usado por los tests + arranque) ────────────────────────────
ape_authority_selftest() {
    ape_cmd_forbidden "am start -n com.x/.Main" || return 1          # debe prohibir
    ape_cmd_forbidden "am force-stop ar.tvplayer.tv" || return 1     # debe prohibir
    ape_cmd_forbidden "input keyevent 26" || return 1                # debe prohibir
    ape_cmd_forbidden "monkey -p x 1" || return 1                    # debe prohibir
    ape_cmd_forbidden "pm clear org.xbmc.kodi" || return 1           # debe prohibir
    ape_cmd_forbidden "settings put system aisr_enable 1" && return 1 # debe PERMITIR
    ape_cmd_forbidden "am broadcast -a com.droidlogic.tv.action.MEMC_ENABLE" && return 1 # PERMITIR
    ape_cmd_forbidden "pkill -USR1 -f ape-sentinel" && return 1      # PERMITIR (wake)
    [ "$(ape_codec_level false false)" = "hvc1.2.4.L153.B0" ] || return 1  # L153 default
    [ "$(ape_codec_level true true)" = "hvc1.2.4.L156.B0" ] || return 1    # L156 si probado
    return 0
}

if [ "${BASH_SOURCE[0]:-$0}" = "${0}" ]; then
    ape_authority_selftest && echo "authority-guard selftest: PASS" || { echo "authority-guard selftest: FAIL"; exit 1; }
fi

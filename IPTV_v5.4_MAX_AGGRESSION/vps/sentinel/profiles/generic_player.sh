#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
# APE SENTINEL — Generic Polymorphic Player Profile (idempotent)
# Superset of onn_4k.sh: universal AndroidTV base + per-SoC enhancements +
# MEMC (best-effort) + per-player tweaks. Idempotent (get→compare→put +
# persist.ape.enh.version marker). NEVER kills the player, never destructive.
#
# Usage (sourced by orchestrator/autoinstall):
#     . generic_player.sh ; apply_generic_profile <device_ip:port>
# Respects: iptv-adb-guardian-watchdog-surgery, iptv-onn-sentinel-never-down.
# ══════════════════════════════════════════════════════════════════════════

_gp_self="${BASH_SOURCE[0]:-$0}"
_GP_DIR="$(cd "$(dirname "${_gp_self}")" 2>/dev/null && pwd)"
_GP_LIB="$(cd "${_GP_DIR}/../lib" 2>/dev/null && pwd)"

: "${APE_ENH_VERSION:=2026.06-universal-1}"

# ── Idempotent helpers (get → compare → put SOLO si difiere) ───────────────
put_if_diff() {  # <namespace> <key> <value>   (settings put)
    local ns="$1" key="$2" val="$3" cur
    cur="$(adb -s "$T" shell "settings get $ns $key" 2>/dev/null | tr -d '\r\n')"
    [ "$cur" = "$val" ] && return 0
    adb -s "$T" shell "settings put $ns $key $val" >/dev/null 2>&1 || true
}
setprop_if_diff() {  # <prop> <value>
    local prop="$1" val="$2" cur
    cur="$(adb -s "$T" shell "getprop $prop" 2>/dev/null | tr -d '\r\n')"
    [ "$cur" = "$val" ] && return 0
    adb -s "$T" shell "setprop $prop $val" >/dev/null 2>&1 || true
}
broadcast_if_available() {  # <intent-action> [extras...]  (best-effort, nunca rompe)
    adb -s "$T" shell "am broadcast -a $* " >/dev/null 2>&1 || true
}
safe_adb_shell() { adb -s "$T" shell "$@" >/dev/null 2>&1 || true; }

# ── Base universal (CUALQUIER AndroidTV — no rompe devices genéricos) ──────
apply_universal() {
    put_if_diff global match_content_frame_rate 1
    put_if_diff global hdr_conversion_mode 1
    put_if_diff global user_preferred_resolution_height 2160
    put_if_diff global user_preferred_resolution_width 3840
    put_if_diff global stay_on_while_plugged_in 3
    put_if_diff system screen_off_timeout 2147483647
    put_if_diff secure screensaver_enabled 0
    put_if_diff global transition_animation_scale 0.0
    put_if_diff global window_animation_scale 0.0
    put_if_diff global animator_duration_scale 0.0
}

# ── Amlogic (AIPQ/AISR + MEMC real, best-effort) ───────────────────────────
apply_amlogic() {
    for kv in "aipq_enable 1" "aisr_enable 1" "ai_pq_mode 3" "ai_sr_mode 3"; do
        # shellcheck disable=SC2086
        put_if_diff system $kv
    done
    put_if_diff global aipq_enable 1
    put_if_diff global aisr_enable 1
    put_if_diff global ai_pic_mode 3
    put_if_diff global ai_sr_level 3
    # MEMC (FPS de novela) — best-effort, nunca obligatorio
    put_if_diff system memc_enable 1
    put_if_diff global memc_enable 1
    setprop_if_diff persist.sys.memc.enable 1
    broadcast_if_available "com.droidlogic.tv.action.AIPQ_ENABLE --ei enable 1"
    broadcast_if_available "com.droidlogic.tv.action.AISR_ENABLE --ei enable 1"
    broadcast_if_available "com.droidlogic.tv.action.MEMC_ENABLE --ei enable 1"
}

# ── MediaTek (best-effort) ─────────────────────────────────────────────────
apply_mediatek() {
    setprop_if_diff persist.vendor.tv.mdp.pq 1
    setprop_if_diff persist.vendor.mtk.memc.enable 1
    setprop_if_diff persist.vendor.tv.sr.enable 1
}

# ── Realtek (best-effort) ──────────────────────────────────────────────────
apply_realtek() {
    setprop_if_diff persist.vendor.rtk.pq 1
    setprop_if_diff persist.vendor.rtk.memc 1
}

# ── Rockchip (best-effort) ─────────────────────────────────────────────────
apply_rockchip() {
    setprop_if_diff persist.vendor.rkpq.enable 1
    setprop_if_diff persist.sys.rkmemc.enable 1
}

# ── Qualcomm (best-effort, conservador) ────────────────────────────────────
apply_qualcomm() {
    setprop_if_diff persist.vendor.display.pp.enable 1
}

# ── Por player (whitelist anti-doze; NUNCA mata/borra) ─────────────────────
apply_player() {
    local p="$1"
    case "$p" in
        ottnavigator) safe_adb_shell "cmd deviceidle whitelist +studio.scillarium.ottnavigator" ;;
        tivimate)     safe_adb_shell "cmd deviceidle whitelist +ar.tvplayer.tv" ;;
        kodi)         safe_adb_shell "cmd deviceidle whitelist +org.xbmc.kodi" ;;
        vlc)          safe_adb_shell "cmd deviceidle whitelist +org.videolan.vlc" ;;
    esac
}

# ── Entry point (idempotente + polimórfico) ────────────────────────────────
apply_generic_profile() {
    T="$1"
    [ -z "$T" ] && { echo "[GENERIC_PROFILE] no target"; return 1; }

    # Cargar capacidades (SOC_FAMILY, PLAYER, ENH_VER, ADB_OK)
    if [ -f "${_GP_LIB}/detect_capabilities.sh" ]; then
        # shellcheck source=/dev/null
        . "${_GP_LIB}/detect_capabilities.sh" "$T"
    fi
    [ "${ADB_OK:-false}" = true ] || { echo "[GENERIC_PROFILE] $T adb not responding — skip"; return 0; }

    # Idempotencia: si ya está en esta versión, no reprocesar
    if [ "${ENH_VER:-}" = "$APE_ENH_VERSION" ]; then
        echo "idempotent skip $T (enh=$ENH_VER soc=${SOC_FAMILY:-?} player=${PLAYER:-?})"
        return 0
    fi

    echo "[GENERIC_PROFILE] applying $T soc=${SOC_FAMILY:-generic} player=${PLAYER:-unknown}"
    apply_universal
    case "${SOC_FAMILY:-generic}" in
        amlogic)  apply_amlogic ;;
        mediatek) apply_mediatek ;;
        realtek)  apply_realtek ;;
        rockchip) apply_rockchip ;;
        qualcomm) apply_qualcomm ;;
        generic)  : ;;  # solo universal — NO props de SoC ajeno
    esac
    apply_player "${PLAYER:-unknown}"

    # Marca instalado (idempotencia futura)
    setprop_if_diff persist.ape.enh.version "$APE_ENH_VERSION"
    echo "[GENERIC_PROFILE] done $T marker=$APE_ENH_VERSION"
}

# Standalone: apply_generic_profile <target>
if [ "${_gp_self}" = "${0}" ] && [ -n "${1:-}" ]; then
    apply_generic_profile "$1"
fi

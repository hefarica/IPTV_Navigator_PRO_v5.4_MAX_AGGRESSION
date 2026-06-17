#!/bin/sh
# ══════════════════════════════════════════════════════════════════════════
# APE — Daemon Bootstrap Installer (served by URL)
# Se ejecuta DESDE EL HOST CON ADB (tu PC o el VPS vía WireGuard), NO desde el player.
#   curl -fsSL https://iptv-ape.duckdns.org/prisma/install/ape-daemon.sh | sh
#   APE_TARGET=10.200.0.3:5555 curl -fsSL .../ape-daemon.sh | sh     # device explícito
#
# Qué hace (idempotente, honesto):
#   1) Verifica que adb exista en el host.
#   2) Intenta conectar el device. Si ADB NO está habilitado/autorizado → INSTRUYE
#      cómo encenderlo (no lo fuerza — es imposible remotamente) y sale 10.
#   3) Si conecta → instala+lanza el daemon (clean-detach, un solo daemon) y registra.
# NO toca nginx/URLs/SHIELDED/proveedor. Solo ADB al device.
# ══════════════════════════════════════════════════════════════════════════
set -u
APE_TARGET="${APE_TARGET:-${1:-10.200.0.3:5555}}"
APE_BASE="${APE_BASE:-https://iptv-ape.duckdns.org}"
REMOTE_SENTINEL="/data/local/tmp/ape-sentinel.sh"
ENH_VERSION="2026.06-universal-1"

say() { printf '%s\n' "[APE-INSTALL] $*"; }

# 1) adb presente?
if ! command -v adb >/dev/null 2>&1; then
    say "ERROR: 'adb' no está en este host."
    say "  Instala platform-tools:"
    say "    Linux:   sudo apt install android-tools-adb   (o descarga platform-tools de Google)"
    say "    Windows: winget install Google.PlatformTools   |  macOS: brew install android-platform-tools"
    say "  Luego re-ejecuta este instalador."
    exit 2
fi

# 2) Conectar + verificar ADB habilitado/autorizado
say "Conectando a $APE_TARGET ..."
adb connect "$APE_TARGET" >/dev/null 2>&1
sleep 1
STATE="$(adb -s "$APE_TARGET" get-state 2>/dev/null | tr -d '\r\n')"

if [ "$STATE" != "device" ]; then
    # ¿unauthorized? (ADB on pero falta aceptar el diálogo) vs ¿offline/no-adb?
    if adb devices 2>/dev/null | grep -q "${APE_TARGET}.*unauthorized"; then
        say "ADB está ENCENDIDO pero NO AUTORIZADO en este host."
        say "  → En el device acepta el diálogo 'Permitir depuración USB/red' (marca 'Siempre permitir')."
    else
        say "ADB NO está habilitado/alcanzable en $APE_TARGET."
        say "  Habilítalo en el device (NO se puede hacer remotamente):"
        say "   1. Ajustes → Acerca de → pulsa 7 veces 'Número de compilación' (activa Opciones de desarrollador)."
        say "   2. Ajustes → Opciones de desarrollador → activa 'Depuración USB' y 'Depuración por red/ADB inalámbrico'."
        say "   3. Anota la IP:puerto del device (normalmente :5555) y re-ejecuta:"
        say "        APE_TARGET=<ip:5555> curl -fsSL ${APE_BASE}/prisma/install/ape-daemon.sh | sh"
    fi
    exit 10
fi
say "ADB OK ($APE_TARGET = device)."

# 3) Idempotencia: ya instalado?
CUR="$(adb -s "$APE_TARGET" shell getprop persist.ape.enh.version 2>/dev/null | tr -d '\r\n')"
if [ "$CUR" = "$ENH_VERSION" ] && adb -s "$APE_TARGET" shell "test -f $REMOTE_SENTINEL" </dev/null >/dev/null 2>&1; then
    say "Ya instalado (enh=$CUR) — nada que hacer (idempotente)."
    exit 0
fi

# Descarga el perfil/daemon polimórfico (o usa el local si este script vive junto al repo)
SELF_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd || echo /tmp)"
PROFILE_LOCAL="$(CDPATH= cd -- "${SELF_DIR}/../../sentinel/profiles" 2>/dev/null && pwd || echo '')/generic_player.sh"
TMP_PROFILE="/tmp/ape-generic_player.$$.sh"
if [ -f "$PROFILE_LOCAL" ]; then
    cp "$PROFILE_LOCAL" "$TMP_PROFILE" 2>/dev/null
else
    curl -fsSL "${APE_BASE}/prisma/install/generic_player.sh" -o "$TMP_PROFILE" 2>/dev/null || {
        say "ERROR: no pude obtener generic_player.sh (local ni remoto)."; exit 3; }
fi

say "Aplicando perfil + instalando daemon (clean-detach, un solo daemon)..."
T="$APE_TARGET"
# shellcheck source=/dev/null
. "$TMP_PROFILE" 2>/dev/null || true
if command -v apply_generic_profile >/dev/null 2>&1; then
    apply_generic_profile "$APE_TARGET" || true
fi
# Instalar sentinel on-device SOLO si falta (clean-detach: </dev/null ambos lados)
if ! adb -s "$APE_TARGET" shell "test -f $REMOTE_SENTINEL" </dev/null >/dev/null 2>&1; then
    adb -s "$APE_TARGET" push "$TMP_PROFILE" "$REMOTE_SENTINEL" </dev/null >/dev/null 2>&1 || true
    adb -s "$APE_TARGET" shell "chmod 755 $REMOTE_SENTINEL" </dev/null >/dev/null 2>&1 || true
    adb -s "$APE_TARGET" shell "setsid sh $REMOTE_SENTINEL daemon </dev/null >/dev/null 2>&1 &" </dev/null >/dev/null 2>&1 || true
    say "Daemon instalado y lanzado en el device."
else
    say "Daemon ya presente — no se duplica."
fi
rm -f "$TMP_PROFILE" 2>/dev/null || true

# Registrar (best-effort)
curl -s -m 4 -X POST "${APE_BASE}/prisma/api/device-register.php" \
    -H 'Content-Type: application/json' \
    -d "{\"device_id\":\"$APE_TARGET\",\"device_ip\":\"$APE_TARGET\",\"settings_applied\":1,\"notes\":\"bootstrap enh=$ENH_VERSION\"}" \
    >/dev/null 2>&1 || true

say "LISTO. El daemon queda idle y despertará en ms cuando reproduzcas una lista (wake-on-playback)."
exit 0

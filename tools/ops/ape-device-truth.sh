#!/system/bin/sh
# ═══════════════════════════════════════════════════════════════════════════════
# ape-device-truth.sh — VIGILANTE DEL DISPOSITIVO. Mide la VERDAD, no la leyenda.
#
# POR QUE EXISTE
#   El operador lo dijo con estas palabras:
#     "Estoy mamado que estos parametros y el ottshim no funcione bien y tu no te
#      des cuenta o no hagas nada para que no suceda y una vive convencido que el
#      sistema esta funcionando correctamente cuando esta a medias o se caen de
#      manera inadvertida los servicios"
#
#   Y tenia razon. Medido el 2026-11-14 13:17 UTC en el ONN 4K:
#     - el panel decia "crystal_uhd · HDR: HDR10, HLG, HDR10+" mientras
#       dataspace=UNKNOWN (0) en LAS DIEZ capas de SurfaceFlinger: cero HDR real
#     - el panel decia "shim" con su estado, y el shim NO tenia ni un socket
#       abierto (el uid del agente, 10124, con cero LISTEN)
#     - el watchdog de la propia app solo hacia "poll pkg": comprobaba que el
#       PAQUETE estuviera instalado, nunca que el proxy funcionara
#     - el agente pedia display_size_forced=3840x2160 cada 3 segundos y el
#       sistema lo RECHAZABA cada vez, en bucle, porque
#       ro.surface_flinger.max_graphics_height=1080 es de solo lectura
#     - "APPLIED=4 STORED=29 DECLARED=8": 4 de 41 presets realmente aplicados
#
#   Este script no adivina ni repite la leyenda del panel. Comprueba cada cosa
#   con la fuente primaria del sistema y emite un veredicto con sus razones.
#
# SALIDA
#   Clave=valor por linea, prefijo de seccion. Siempre termina en:
#     VERDICT=<OK|DEGRADADO|ROTO>
#     REASON=<lista separada por ;>
#   Con --json emite un objeto JSON equivalente (una sola linea).
#
# EXIT
#   0 = OK · 1 = DEGRADADO · 2 = ROTO
#
# USO
#   adb shell sh /data/local/tmp/ape-device-truth.sh
#   adb shell sh /data/local/tmp/ape-device-truth.sh --json
# ═══════════════════════════════════════════════════════════════════════════════

PKG="${APE_PKG:-com.ape.crystalagent}"
JSON=0
[ "${1:-}" = "--json" ] && JSON=1

REASON=""
add_reason() { if [ -z "$REASON" ]; then REASON="$1"; else REASON="$REASON; $1"; fi; }
emit() { [ "$JSON" -eq 0 ] && printf '%s\n' "$1"; }

# ── 1. EL AGENTE ─────────────────────────────────────────────────────────────
A_PID=$(pgrep -f "$PKG" 2>/dev/null | head -1)
A_VERSION=$(dumpsys package "$PKG" 2>/dev/null | grep -oE 'versionName=[^ ]+' | head -1 | cut -d= -f2)
A_APPID=$(dumpsys package "$PKG" 2>/dev/null | grep -oE 'appId=[0-9]+' | head -1 | cut -d= -f2)
[ -z "$A_APPID" ] && A_APPID=0
A_SERVICES=$(dumpsys activity services "$PKG" 2>/dev/null | grep -c 'ServiceRecord')
emit "AGENTE.pid=$A_PID"
emit "AGENTE.version=$A_VERSION"
emit "AGENTE.appid=$A_APPID"
emit "AGENTE.servicios=$A_SERVICES"
if [ -z "$A_PID" ]; then
  add_reason "agente no corre"
fi

# ── 2. EL SHIM: LA PRUEBA QUE EL WATCHDOG DE LA APP NO HACE ──────────────────
#    Un socket en LISTEN del uid del agente es la unica prueba de que el proxy
#    existe. Ojo: NO se comprueba el 10042 — en este dispositivo ese puerto es
#    de com.google.android.apps.mediashell (uid 10050), no del shim. Confundirlos
#    fue el error de medicion que hizo creer que el shim estaba vivo.
SHIM_PORTS=""
if [ "$A_APPID" != "0" ]; then
  SHIM_PORTS=$(awk -v u="$A_APPID" '$4=="0A" && $8==u {split($2,a,":"); p=strtonum("0x" a[2]); if (p>0) print p}' \
                 /proc/net/tcp /proc/net/tcp6 2>/dev/null | sort -un | tr '\n' ' ' | sed 's/ $//')
fi
SHIM_SOCKETS=0
[ -n "$SHIM_PORTS" ] && SHIM_SOCKETS=$(echo "$SHIM_PORTS" | wc -w)
emit "SHIM.puertos=$SHIM_PORTS"
emit "SHIM.sockets=$SHIM_SOCKETS"
# ¿Responde? Sin curl en el device (no existe): se usa toybox nc, que si existe.
SHIM_ACEPTA=0
if [ -n "$SHIM_PORTS" ]; then
  P=$(echo "$SHIM_PORTS" | awk '{print $1}')
  R=$(printf 'GET / HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n' | timeout 3 toybox nc 127.0.0.1 "$P" 2>/dev/null | head -c 20)
  [ -n "$R" ] && SHIM_ACEPTA=1
fi
emit "SHIM.acepta=$SHIM_ACEPTA"
if [ "$SHIM_SOCKETS" -eq 0 ]; then
  add_reason "shim sin socket: el proxy no escucha"
fi

# ── 3. EL DISPLAY: fisico vs override vs modo activo ─────────────────────────
PHYS=$(wm size 2>/dev/null | grep -i physical | grep -oE '[0-9]+x[0-9]+')
OVER=$(wm size 2>/dev/null | grep -i override | grep -oE '[0-9]+x[0-9]+')
ACTIVE_MODE=$(dumpsys display 2>/dev/null | grep -oE 'mActiveModeId=[0-9]+' | head -1 | cut -d= -f2)
MODE_LINE=$(dumpsys display 2>/dev/null | grep -oE "id=$ACTIVE_MODE, width=[0-9]+, height=[0-9]+, fps=[0-9.]+" | head -1)
SF_MAXW=$(getprop ro.surface_flinger.max_graphics_width)
SF_MAXH=$(getprop ro.surface_flinger.max_graphics_height)
FORCED=$(settings get global display_size_forced 2>/dev/null)
emit "DISPLAY.fisico=$PHYS"
emit "DISPLAY.override=$OVER"
emit "DISPLAY.modo_activo=$ACTIVE_MODE"
emit "DISPLAY.modo_detalle=$MODE_LINE"
emit "DISPLAY.sf_tope=${SF_MAXW}x${SF_MAXH}"
emit "DISPLAY.forced_setting=$FORCED"
# Override por debajo del fisico = el compositor trabaja a menos resolucion.
if [ -n "$OVER" ] && [ -n "$PHYS" ] && [ "$OVER" != "$PHYS" ]; then
  add_reason "override $OVER distinto del fisico $PHYS: el compositor no trabaja a resolucion nativa"
fi
# El agente pidiendo un tamano que el sistema rechaza por encima del tope.
if [ -n "$FORCED" ] && [ "$FORCED" != "null" ]; then
  FW=$(echo "$FORCED" | cut -dx -f1)
  if [ -n "$SF_MAXW" ] && [ "$FW" -gt "$SF_MAXW" ] 2>/dev/null; then
    add_reason "el agente pide display_size_forced=$FORCED y el tope del compositor es ${SF_MAXW}x${SF_MAXH}: lo rechaza en bucle"
  fi
fi

# ── 4. EL HDR DE VERDAD: dataspace de las capas, no la leyenda del panel ─────
DS_TOTAL=$(dumpsys SurfaceFlinger 2>/dev/null | grep -c 'dataspace=')
DS_UNKNOWN=$(dumpsys SurfaceFlinger 2>/dev/null | grep -c 'dataspace=UNKNOWN (0)')
DS_HDR=$(dumpsys SurfaceFlinger 2>/dev/null | grep 'dataspace=' | grep -cviE 'UNKNOWN|SDR')
emit "HDR.capas_totales=$DS_TOTAL"
emit "HDR.capas_dataspace_unknown=$DS_UNKNOWN"
emit "HDR.capas_no_sdr=$DS_HDR"
emit "HDR.conversion_mode=$(settings get global hdr_conversion_mode 2>/dev/null)"
if [ "$DS_TOTAL" -gt 0 ] && [ "$DS_HDR" -eq 0 ]; then
  add_reason "dataspace: $DS_UNKNOWN/$DS_TOTAL capas en UNKNOWN y CERO en HDR (el panel puede decir otra cosa)"
fi

# ── 5. LOS SETTINGS: aplicados vs RECHAZADOS (el 12/12 no es 12 de 14) ───────
LOGW=$(logcat -d -t 4000 2>/dev/null)
APPLIED=$(echo "$LOGW" | grep -oE 'aplicados=[0-9]+' | tail -1 | cut -d= -f2)
REJECTED=$(echo "$LOGW" | grep -oE 'rechazados=[0-9]+' | tail -1 | cut -d= -f2)
LEDGER=$(echo "$LOGW" | grep -oE 'APPLIED=[0-9]+ STORED=[0-9]+ DECLARED=[0-9]+ total=[0-9]+' | tail -1)
emit "SETTINGS.aplicados=${APPLIED:-?}"
emit "SETTINGS.rechazados=${REJECTED:-?}"
emit "SETTINGS.ledger=${LEDGER:-?}"
REJ_LOOP=$(echo "$LOGW" | grep -c 'RECHAZADO')
emit "SETTINGS.rechazos_en_ventana=$REJ_LOOP"
if [ -n "$REJECTED" ] && [ "$REJECTED" -gt 0 ] 2>/dev/null; then
  add_reason "$REJECTED settings rechazados de forma persistente"
fi
if [ "$REJ_LOOP" -ge 5 ]; then
  add_reason "$REJ_LOOP rechazos en la ventana de log: el agente reintenta algo imposible"
fi

# ── 6. LOS LEVERS DE VPP: existen en este firmware? ─────────────────────────
VPP=0
for k in pq_ai_sr_enable ai_sr_level pq_sharpness_enable pq_hdr_mode; do
  V=$(settings get global "$k" 2>/dev/null)
  emit "VPP.$k=${V:-null}"
  [ "$V" != "null" ] && [ -n "$V" ] && VPP=$((VPP+1))
done
emit "VPP.levers_presentes=$VPP"
if [ "$VPP" -eq 0 ]; then
  add_reason "VPP: ninguno de los 4 levers existe en este firmware (el panel muestra 'sin dato' porque NO HAY)"
fi

# ── 7. LA REPRODUCCION: capa de video con contenido real ────────────────────
PLAYER_LAYER=$(dumpsys SurfaceFlinger 2>/dev/null | grep -A2 'PlayerActivity' | grep -oE 'geomBufferSize=\[[^]]*\]' | head -1)
emit "PLAY.geomBufferSize=${PLAYER_LAYER:-none}"
# Un buffer vacio es [0 0 -1 -1]; con contenido lleva dimensiones positivas.
if echo "$PLAYER_LAYER" | grep -q '\-1'; then
  add_reason "capa del player sin buffer: no hay video compuesto (reproduccion detenida o rota)"
fi

# ── 8. EL PUERTO 10042: se deja claro de quiEN es para no volver a confundirlo ─
MEDIA_UID=$(awk '$2 ~ /:273A$/ {print $8; exit}' /proc/net/tcp6 2>/dev/null)
emit "RUIDO.puerto_10042_uid=${MEDIA_UID:-libre}"
if [ -n "$MEDIA_UID" ] && [ "$A_APPID" != "0" ] && [ "$MEDIA_UID" = "$A_APPID" ]; then
  emit "RUIDO.puerto_10042_es=AGENTE"
elif [ -n "$MEDIA_UID" ]; then
  emit "RUIDO.puerto_10042_es=OTRO_APP (uid $MEDIA_UID, no el agente $A_APPID)"
fi

# ── VEREDICTO ───────────────────────────────────────────────────────────────
# ROTO    : el shim no escucha O no hay agente
# DEGRADADO: hay agente y shim, pero el HDR es falso, el display no es nativo o
#            el agente esta en bucle de rechazos
# OK      : nada de lo anterior
VERDICT="OK"; RC=0
if [ -z "$A_PID" ] || [ "$SHIM_SOCKETS" -eq 0 ]; then
  VERDICT="ROTO"; RC=2
elif [ -n "$REASON" ]; then
  VERDICT="DEGRADADO"; RC=1
fi

if [ "$JSON" -eq 1 ]; then
  esc=$(printf '%s' "$REASON" | sed 's/"/\\"/g')
  printf '{"pkg":"%s","version":"%s","agent_pid":"%s","agent_servicios":%s,"shim_ports":"%s","shim_sockets":%s,"shim_accepts":%s,"display_phys":"%s","display_override":"%s","display_mode":"%s","sf_max":"%sx%s","hdr_layers":%s,"hdr_unknown":%s,"hdr_non_sdr":%s,"hdr_conversion_mode":"%s","settings_applied":"%s","settings_rejected":"%s","settings_ledger":"%s","reject_loop":%s,"vpp_levers":%s,"play_geombuffersize":"%s","media_uid_10042":"%s","verdict":"%s","reason":"%s"}\n' \
    "$PKG" "$A_VERSION" "$A_PID" "${A_SERVICES:-0}" "$SHIM_PORTS" "$SHIM_SOCKETS" "$SHIM_ACEPTA" \
    "$PHYS" "$OVER" "$ACTIVE_MODE" "$SF_MAXW" "$SF_MAXH" \
    "$DS_TOTAL" "$DS_UNKNOWN" "$DS_HDR" "$(settings get global hdr_conversion_mode 2>/dev/null)" \
    "${APPLIED:-}" "${REJECTED:-}" "${LEDGER:-}" "$REJ_LOOP" "$VPP" \
    "${PLAYER_LAYER:-none}" "${MEDIA_UID:-}" "$VERDICT" "$esc"
else
  emit "VERDICT=$VERDICT"
  emit "REASON=${REASON:-ninguna}"
fi

exit $RC

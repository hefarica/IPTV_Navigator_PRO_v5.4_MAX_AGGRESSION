#!/usr/bin/env bash
# =====================================================================
# ape-live-capture.sh — captura VIVA de todos los modulos APE.  [t50]
#
# El operador pidio: "yo voy a zappear y tu evaluas y tomas los datos,
# mediras tiempo de zapping, como se comporta el buffer, que dice el vps,
# como se comporta el canary, el jit, las url2, la apk, absolutamente
# todo, haz una captura de toda la data que cada modulo este generando
# en vivo, como funcionan los archivos .json, los php, los lua".
#
# DISENO:
#   - UNA pasada = todos los modulos. Cada dato lleva su FUENTE citada
#     (archivo, comando o endpoint) para poder reproducirlo.
#   - Distingue NO_COMPUTADO de CERO. Un modulo sin productor no es un 0:
#     imprime "NO_COMPUTADO: <razon>". Un contador que vale 0 de verdad
#     imprime 0.
#   - SOLO LECTURA: no escribe nada, ni en el VPS ni fuera. No usa mktemp,
#     no redirige a fichero, no toca systemd ni iptables. Solo lee.
#   - --watch N: repite cada N s para que el operador zapee y se vea el
#     cambio. Los datos caros de la lista grande (sha256, #EXTINF) se
#     cachean en memoria y solo se recalculan si cambia el mtime.
#
# Uso:
#   ape-live-capture.sh                      -> una captura a stdout
#   ape-live-capture.sh --watch 5            -> cada 5 s (Ctrl-C para salir)
#   ape-live-capture.sh --watch 5 --count 12 -> 12 pasadas y sale
#   ape-live-capture.sh --minutes 15         -> ventana de logs (def. 10 min)
#
# Ejecucion sin escribir en el VPS:
#   ssh host 'bash -s' < tools/ops/ape-live-capture.sh
# (bash lee el script de stdin: el fichero no llega al disco remoto)
#
# DEFECTOS CORREGIDOS respecto de la version anterior (t43 las midio):
#   1. Curleaba http://127.0.0.1:8787/health y lo etiquetaba "JIT /health".
#      :8787 es ape-list-probe, NO el JIT. El JIT esta en :3099
#      (Environment=PORT=3099 en ape-jit.service). Errores de puerto
#      etiquetados como salud del modulo = dato falso con formato de dato.
#   2. Imprimia "este log NO tiene $request_time -> latencia = NO_COMPUTADO".
#      FALSO desde que nginx.conf:77 anadio rt=/urt=. La nota estaba
#      hardcodeada y sobrevivio al cambio: una etiqueta vieja leida como
#      si describiera la realidad.
#   3. No tenia seccion SHIM, ni separaba 200 de 502 en la latencia, ni
#      separaba 4xx de bots de 4xx reales, ni citaba fuente por dato.
#   4. systemctl show 'ape-canary@*' no expande globs de unidad: devolvia
#      vacio y se imprimia como si fuera un resultado.
# =====================================================================
set -uo pipefail

WATCH=0
COUNT=0
MINUTOS=10
while [ $# -gt 0 ]; do
  case "$1" in
    --watch)   WATCH="${2:-5}"; shift 2 ;;
    --count)   COUNT="${2:-0}"; shift 2 ;;
    --minutes) MINUTOS="${2:-10}"; shift 2 ;;
    -h|--help) sed -n '2,45p' "$0" 2>/dev/null || echo "ver cabecera del script"; exit 0 ;;
    *) echo "argumento no reconocido: $1" >&2; exit 2 ;;
  esac
done

ahora() { date -u +%Y-%m-%dT%H:%M:%SZ; }
# NO_COMPUTADO con su razon. Nunca se imprime 0 cuando no hay productor.
nc() { echo "   NO_COMPUTADO: $*"; }
hay() { [ -e "$1" ] && [ -s "$1" ]; }      # existe y NO esta vacio
existe() { [ -e "$1" ]; }                   # existe aunque este vacio: un log vacio es un CERO legitimo,
                                            # no un NO_COMPUTADO. Confundirlos es el error que este script evita.
sha16() { if hay "$1"; then sha256sum "$1" 2>/dev/null | cut -c1-16; else echo "NO_COMPUTADO"; fi; }

# Cache en memoria para los datos caros de la lista grande (solo dentro
# del proceso; no escribe nada). Se invalida si cambia el mtime.
C_LIST_MTIME=""; C_EXTINF=""; C_SHA=""; C_BYTES=""
# Contadores de la pasada anterior, para el DELTA con --watch.
P_HITS=""; P_200=""; P_499=""; P_502=""; P_ZAPS=""

capturar() {
  local L=/var/log/nginx/playlist_access.log
  local E=/var/log/nginx/error.log
  local DESDE; DESDE="$(date -u -d "-${MINUTOS} minutes" '+%d/%b/%Y:%H:%M:%S')"

  echo "=============================================================="
  echo " APE LIVE CAPTURE  $(ahora)   (ventana logs: ${MINUTOS} min)"
  echo "=============================================================="

  # ---------- 1. VPS BASE ----------
  echo ""
  echo "## 1. VPS BASE"
  echo "   [FUENTE: /proc/loadavg, nproc, free -m, df -h, systemctl show]"
  echo -n "   load (1/5/15): "; awk '{print $1" "$2" "$3}' /proc/loadavg 2>/dev/null || nc "/proc/loadavg ilegible"
  echo -n "   cpu cores: "; nproc 2>/dev/null || echo "NO_COMPUTADO"
  if command -v free >/dev/null; then
    echo -n "   mem: "; free -m | awk '/^Mem:/{printf "%d/%d MB (%d%%)\n", $3, $2, ($3*100)/$2}'
  else nc "free no instalado"; fi
  echo -n "   disco /: "; df -h / 2>/dev/null | awk 'NR==2{print $3"/"$2" ("$5")"}' || nc "df falla"
  local svc=""
  for u in nginx php8.1-fpm php8.2-fpm php8.3-fpm php-fpm; do
    local st; st="$(systemctl is-active "$u" 2>/dev/null)"
    [ -n "$st" ] && [ "$st" != "inactive" ] && svc="$svc $u=$st"
  done
  echo "   servicios:${svc:- NO_COMPUTADO (ningun unit php-fpm/nginx reconocido)}"
  echo -n "   nginx restarts: "; systemctl show nginx -p NRestarts --value 2>/dev/null || nc "systemctl show falla"
  echo -n "   uptime: "; uptime -p 2>/dev/null || echo "NO_COMPUTADO"

  # ---------- 2. LISTA SERVIDA ----------
  echo ""
  echo "## 2. LISTA SERVIDA"
  local META=""
  for c in /opt/ape-jit/current/meta.json /opt/ape-jit/meta.json; do
    [ -e "$c" ] && { META="$c"; break; }
  done
  if [ -n "$META" ] && hay "$META"; then
    echo "   [FUENTE: $META]"
    local SRCLIST
    SRCLIST="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("source",""))' "$META" 2>/dev/null)"
    echo "   fuente declarada por el JIT: ${SRCLIST:-NO_COMPUTADO}"
    if [ -n "$SRCLIST" ] && hay "$SRCLIST"; then
      local MT; MT="$(stat -c%y "$SRCLIST")"
      echo "   [FUENTE: stat + sha256sum + grep -c '^#EXTINF' sobre $SRCLIST]"
      if [ "$MT" != "$C_LIST_MTIME" ]; then
        C_LIST_MTIME="$MT"
        C_BYTES="$(stat -c%s "$SRCLIST")"
        C_EXTINF="$(grep -c '^#EXTINF' "$SRCLIST" 2>/dev/null || echo NO_COMPUTADO)"
        C_SHA="$(sha256sum "$SRCLIST" 2>/dev/null | cut -c1-16)"
      fi
      echo "   bytes  : $C_BYTES"
      echo "   mtime  : $MT"
      echo "   sha256 : ${C_SHA}…"
      echo "   #EXTINF: $C_EXTINF"
    else
      nc "la lista que el JIT declara como fuente no existe en disco (${SRCLIST:-sin declarar})"
    fi
  else
    nc "no hay meta.json del JIT en /opt/ape-jit/current/ ni /opt/ape-jit/"
  fi

  # ---------- 3. JIT ----------
  echo ""
  echo "## 3. JIT (127.0.0.1:3099 · ape-jit.service)"
  echo "   [FUENTE: systemctl is-active, curl :3099, journalctl]"
  echo -n "   unit: "; systemctl is-active ape-jit.service 2>/dev/null || echo "NO_COMPUTADO"
  local jh jc
  jh="$(curl -s --max-time 3 http://127.0.0.1:3099/health 2>/dev/null)"
  if [ -n "$jh" ]; then echo "   /health: ${jh:0:400}"; else nc "/health no responde en :3099"; fi
  jc="$(curl -s --max-time 3 http://127.0.0.1:3099/capabilities.json 2>/dev/null)"
  if [ -n "$jc" ]; then echo "   /capabilities.json: ${jc:0:400}"; else nc "/capabilities.json no responde"; fi
  echo -n "   canales (channels.json): "
  if hay /opt/ape-jit/current/channels.json; then
    python3 -c 'import json;d=json.load(open("/opt/ape-jit/current/channels.json"));print(len(d) if isinstance(d,(list,dict)) else "NO_COMPUTADO")' 2>/dev/null || echo NO_COMPUTADO
  else nc "/opt/ape-jit/current/channels.json no existe"; fi
  echo "   [FUENTE: journalctl -u ape-jit-reconcile.service -n 3]"
  journalctl -u ape-jit-reconcile.service -n 3 --no-pager 2>/dev/null | cut -c1-150 | sed 's/^/     /' || nc "journalctl no disponible"

  # ---------- 4. CANARY ----------
  echo ""
  echo "## 4. CANARY"
  echo "   [FUENTE: systemctl, pgrep, ls, journalctl -u ape-pulse-canary]"
  echo -n "   canary.enabled: "; [ -f /etc/ara/pulse/canary.enabled ] && echo "PRESENTE" || echo "AUSENTE (no se encola)"
  # grep -c y pgrep -c IMPRIMEN 0 y salen con 1 cuando no hay match: el "|| echo 0" añadia un
  # segundo cero y se leia "0\n0". Con "|| :" se imprime el 0 real una sola vez.
  echo -n "   unidades canary activas: "; systemctl list-units 'ape-canary@*' --no-legend 2>/dev/null | grep -c running || :
  echo -n "   ffmpeg corriendo: "; pgrep -c ffmpeg 2>/dev/null || :
  echo -n "   worker service: "; systemctl is-active ape-pulse-canary.service 2>/dev/null || echo "NO_COMPUTADO"
  if [ -d /var/lib/ara/canary/queue ]; then
    echo "   cola: $(ls -1 /var/lib/ara/canary/queue 2>/dev/null | wc -l) tickets"
    ls -1t /var/lib/ara/canary/queue 2>/dev/null | head -3 | sed 's/^/     /'
  else nc "/var/lib/ara/canary/queue no existe"; fi
  if [ -d /var/lib/ara/canary/out ]; then
    local ULT; ULT="$(ls -1t /var/lib/ara/canary/out 2>/dev/null | head -1)"
    if [ -n "$ULT" ]; then
      echo "   ultimo artefacto: $ULT"
      [ -f "/var/lib/ara/canary/out/$ULT/out0.ts" ] && echo "     out0.ts: $(stat -c%s "/var/lib/ara/canary/out/$ULT/out0.ts") B"
      [ -f "/var/lib/ara/canary/out/$ULT/meta.json" ] && { echo -n "     meta.json: "; head -c 220 "/var/lib/ara/canary/out/$ULT/meta.json"; echo; }
    else
      echo "   out/ existe pero VACIO -> cero artefactos producidos (no es cero canaries ejecutados)"
    fi
  else
    nc "/var/lib/ara/canary/out NO EXISTE -> sin productor: el canary no ha escrito NUNCA un artefacto"
  fi
  echo -n "   timer: "; systemctl is-active ape-pulse-canary.timer 2>/dev/null || echo "NO_COMPUTADO"
  echo "   [FUENTE: journalctl -u ape-pulse-canary.service --since -2h | grep gate]"
  local GD; GD="$(journalctl -u ape-pulse-canary.service --since "-2 hours" --no-pager 2>/dev/null | grep -Ei 'DENY|ALLOW|reason=|gate' | tail -5 | cut -c1-160)"
  if [ -n "$GD" ]; then echo "$GD" | sed 's/^/     /'; else nc "sin decisiones del gate en 2 h"; fi

  # ---------- 5. SHIM ----------
  echo ""
  echo "## 5. SHIM (127.0.0.1:40213)"
  echo "   [FUENTE: curl /health, ss -tln]"
  local shim
  shim="$(curl -s --max-time 3 http://127.0.0.1:40213/health 2>/dev/null)"
  if [ -n "$shim" ]; then
    echo "   /health (crudo):"
    echo "$shim" | head -c 1800 | sed 's/^/     /'
  else
    nc "el shim NO responde en :40213 -> sin productor, no es un cero"
    echo -n "   ¿hay listener en 40213?: "
    ss -tln 2>/dev/null | grep -q ':40213' && echo "SI (pero no contesta /health)" || echo "NO"
  fi

  # ---------- 6. LUA ----------
  echo ""
  echo "## 6. LUA"
  echo "   [FUENTE: find, nginx -T, error.log]"
  echo -n "   ficheros .lua desplegados: "; find /etc/nginx /usr/local/openresty /usr/share/nginx /var/www -name '*.lua' 2>/dev/null | wc -l
  echo -n "   shared_dicts CARGADOS (nginx -T): "
  if command -v nginx >/dev/null; then
    local SD; SD="$(nginx -T 2>/dev/null | grep -oE 'lua_shared_dict [a-zA-Z0-9_]+' | awk '{print $2}' | sort -u | tr '\n' ' ')"
    if [ -n "$SD" ]; then echo "$SD"; else nc "nginx -T no declara lua_shared_dict"; fi
    # Ojo: declarado en un fichero != cargado. Un snippet que nadie incluye se ve con grep
    # pero NO existe para nginx. Se reportan los dos numeros y la diferencia.
    local DCL; DCL="$(grep -rhoE 'lua_shared_dict [a-zA-Z0-9_]+' /etc/nginx 2>/dev/null | awk '{print $2}' | sort -u | tr '\n' ' ')"
    echo "   shared_dicts DECLARADOS en ficheros: $(echo "$DCL" | wc -w)"
    local FALT; FALT=""
    for d in $DCL; do echo "$SD" | grep -qw "$d" || FALT="$FALT $d"; done
    [ -n "$FALT" ] && echo "   OJO declarados pero NO cargados por nginx:$FALT (snippet no incluido)"
  else nc "nginx no en PATH"; fi
  echo -n "   lineas con 'lua' en error.log: "
  if hay "$E"; then grep -c 'lua' "$E" 2>/dev/null || :
  elif existe "$E"; then echo "0 (el fichero EXISTE y esta vacio: cero errores. No es 'no computado')"
  else nc "$E no existe"; fi

  # ---------- 7. PHP ----------
  echo ""
  echo "## 7. PHP"
  echo "   [FUENTE: sha256sum por fichero + curl -w %{http_code}]"
  local DIR=/var/www/html/prisma/api
  if [ -d "$DIR" ]; then
    echo "   endpoints desplegados: $(ls -1 "$DIR"/*.php 2>/dev/null | wc -l)"
    printf "     %-40s %-17s %s\n" "ENDPOINT" "SHA256(16)" "HTTP"
    local f b
    for f in $(ls -1 "$DIR"/*.php 2>/dev/null | head -60); do
      b="$(basename "$f")"
      printf "     %-40s %-17s %s\n" "$b" "$(sha16 "$f")" "-"
    done
    echo "   codigos HTTP de los endpoints con contrato publico:"
    local ep code
    for ep in pulse.php conviva-event.php channel-hdcp-bulk.php ara-enroll.php ara-sync.php ape-match.php ape-last.php; do
      code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 4 "https://iptv-ape.duckdns.org/prisma/api/$ep" 2>/dev/null)"
      printf "     %-40s %s\n" "$ep" "${code:-NO_COMPUTADO}"
    done
  else nc "$DIR no existe"; fi

  # ---------- 8. 4xx/5xx SEPARADOS ----------
  echo ""
  echo "## 8. ERRORES ultimos ${MINUTOS} min (SEPARADOS: 5xx / 4xx reales / 4xx bots / raiz)"
  echo "   [FUENTE: $L]"
  if hay "$L"; then
    local W; W="$(awk -v D="$DESDE" '{ i=index($0,"["); if (substr($0,i+1,20) >= D) print }' "$L" 2>/dev/null)"
    if [ -z "$W" ]; then
      echo "   sin hits en la ventana de ${MINUTOS} min (no es 'cero errores': es que no hay trafico)"
    else
      echo -n "   hits en ventana: "; echo "$W" | grep -c . || echo 0
      echo "   --- 5xx (trafico real de la ruta) ---"
      local S5; S5="$(echo "$W" | awk '$9>=500 {print $9, $7}' | sed 's/[?].*//' | sort | uniq -c | sort -rn | head -8)"
      [ -n "$S5" ] && echo "$S5" | sed 's/^/     /' || echo "     ninguno"
      echo "   --- 4xx REALES (rutas APE: /pulse /lists /prisma /ara /jit /image) ---"
      local S4; S4="$(echo "$W" | awk '$9>=400 && $9<500 { p=$7; sub(/[?].*/,"",p);
        if (p ~ /^\/(pulse|lists|prisma|ara|jit|image)\//) print $9, p }' | sort | uniq -c | sort -rn | head -10)"
      [ -n "$S4" ] && echo "$S4" | sed 's/^/     /' || echo "     ninguno"
      echo "   --- 4xx de BOTS (fuera de APE y raiz) ---"
      echo "$W" | awk '$9>=400 && $9<500 { p=$7; sub(/[?].*/,"",p);
        if (p !~ /^\/(pulse|lists|prisma|ara|jit|image)\// && p!="/" && p!="/favicon.ico") n++ }
        END { if (n) print "     " n " hits de escaner"; else print "     ninguno" }'
      echo "   --- 4xx de RAIZ ---"
      local SR; SR="$(echo "$W" | awk '$9>=400 && $9<500 { p=$7; sub(/[?].*/,"",p);
        if (p=="/" || p=="/favicon.ico") print $9, p }' | sort | uniq -c | sort -rn | head -5)"
      [ -n "$SR" ] && echo "$SR" | sed 's/^/     /' || echo "     ninguno"
    fi
  else nc "$L no existe"; fi

  # ---------- 9. JSON VIVOS ----------
  echo ""
  echo "## 9. ARCHIVOS .json VIVOS  (NO_EXISTE != vacio)"
  echo "   [FUENTE: stat + sha256sum]"
  local j
  for j in /etc/ara/skills/skills.json /var/www/ape-uhdx/last-sentinel.json \
           /opt/ape-jit/current/meta.json /var/www/ape-uhdx/netshield_sentinel.json \
           /etc/ara/pulse/prisma_key.json /var/lib/ara/sync/last.json; do
    printf "   %-46s " "$j"
    if hay "$j"; then
      printf "%s B | %s | sha %s…\n" "$(stat -c%s "$j")" "$(stat -c%y "$j" | cut -c1-19)" "$(sha16 "$j")"
    else
      echo "NO_EXISTE (sin productor)"
    fi
  done

  # ---------- 10. ZAPPING ----------
  echo ""
  echo "## 10. ZAPPING (rt=total, urt=proveedor) — 200 SEPARADO de 502"
  echo "   [FUENTE: $L · campos rt=/urt= del log_format ape_playlist (nginx.conf)]"
  if hay "$L"; then
    local T; T="$(grep '/pulse/' "$L" 2>/dev/null | grep -c 'rt=' || echo 0)"
    if [ "$T" = "0" ]; then
      nc "0 hits /pulse con rt= -> latencia NO_COMPUTADO (sin muestras no hay percentil)"
    else
      echo "   muestras /pulse con rt= : $T"
      echo "   --- SOLO 200 (zaps realmente servidos) ---"
      grep '/pulse/' "$L" | grep 'rt=' | awk '{
        match($0,/" [0-9][0-9][0-9] /); st=substr($0,RSTART+2,3);
        n=split($0,a," "); for(k=1;k<=n;k++){ if(a[k] ~ /^rt=/) rt=substr(a[k],4); if(a[k] ~ /^urt=/) urt=substr(a[k],5) }
        if (st==200) print rt, urt }' \
      | sort -n | awk '{ a[NR]=$1; if($2!="-"){d=$1-$2; if(d<0)d=-d; ov+=d; no++}; s+=$1 } END{
        n=NR; if(n==0){ print "     NO_COMPUTADO: ningun 200 con rt="; exit }
        printf "     n=%d  min=%.3f  p50=%.3f  p90=%.3f  p99=%.3f  max=%.3f  media=%.3f\n", n, a[1], a[int(n*0.50)], a[int(n*0.90)], a[int(n*0.99)], a[n], s/n
        if(no) printf "     overhead |rt-urt| medio=%.6f s  (%.3f %% de la media)\n", ov/no, (ov/no)/(s/n)*100
      }'
      echo "   --- SOLO 502 (fallos: NO son muestras de zapping bueno) ---"
      grep '/pulse/' "$L" | grep 'rt=' | awk '{
        match($0,/" [0-9][0-9][0-9] /); st=substr($0,RSTART+2,3);
        n=split($0,a," "); for(k=1;k<=n;k++){ if(a[k] ~ /^rt=/) rt=substr(a[k],4) }
        if (st==502) print rt }' \
      | sort -n | awk '{ a[NR]=$1; s+=$1 } END{
        n=NR; if(n==0){ print "     ningun 502 con rt= en el log"; exit }
        printf "     n=%d  min=%.3f  p50=%.3f  max=%.3f  media=%.3f\n", n, a[1], a[int(n*0.50)], a[n], s/n
        print "     (la media de los 502 NO es tiempo de zapping: es tiempo perdido hasta el error)"
      }'
      echo "   --- reparto por estado ---"
      grep '/pulse/' "$L" | grep 'rt=' | awk '{ match($0,/" [0-9][0-9][0-9] /); print substr($0,RSTART+2,3) }' | sort | uniq -c | sort -rn | sed 's/^/     /'
      echo "   NOTA: 499 = el cliente cerro la conexion antes de recibir respuesta."
      echo "         NO es un fallo del VPS: es el zapping (el operador cambia antes de que acabe)."
      echo "         Si 499 sube en el DELTA, el zapping se esta moviendo de verdad."
    fi
  else nc "$L no existe"; fi

  # ---------- 11. SIN PRODUCTOR ----------
  echo ""
  echo "## 11. MODULOS SIN PRODUCTOR  (NO_COMPUTADO != cero)"
  echo "   [FUENTE: comprobacion directa en esta misma pasada]"
  local nsp=0
  curl -s --max-time 2 http://127.0.0.1:40213/health >/dev/null 2>&1 || { echo "   - SHIM :40213            : no escucha -> sin productor"; nsp=$((nsp+1)); }
  [ -d /var/lib/ara/canary/out ] || { echo "   - CANARY out/            : no existe -> ningun artefacto producido jamas"; nsp=$((nsp+1)); }
  [ -e /var/lib/ara/sync ] || { echo "   - APK / ARA-X-SYNC       : /var/lib/ara/sync no existe -> el device no ha sincronizado"; nsp=$((nsp+1)); }
  [ -e /etc/ara/pulse/prisma_key.json ] || { echo "   - prisma_key.json        : no existe -> sin productor"; nsp=$((nsp+1)); }
  [ -e /var/www/ape-uhdx/netshield_sentinel.json ] || { echo "   - netshield_sentinel.json: no existe en esa ruta (el productor vivo es last-sentinel.json)"; nsp=$((nsp+1)); }
  [ "$nsp" = "0" ] && echo "   (ninguno: todos los modulos de la lista tienen productor en esta pasada)"

  # ---------- 12. DELTA (solo util con --watch) ----------
  echo ""
  echo "## 12. DELTA respecto de la pasada anterior"
  echo "   [FUENTE: contadores del log comparados entre iteraciones de ESTE proceso]"
  if hay "$L"; then
    local h2 n2 k2 f2 z2
    h2="$(grep -c . "$L" 2>/dev/null || :)"
    n2="$(awk '$9==200' "$L" 2>/dev/null | wc -l)"
    k2="$(awk '$9==499' "$L" 2>/dev/null | wc -l)"
    f2="$(awk '$9==502' "$L" 2>/dev/null | wc -l)"
    z2="$(grep '/pulse/' "$L" 2>/dev/null | grep -c 'rt=' || :)"
    if [ -z "$P_HITS" ]; then
      echo "   primera pasada: hits=$h2  200=$n2  499=$k2  502=$f2  zaps_con_rt=$z2"
      echo "   (lanza con --watch N para ver el cambio mientras zapeas)"
    else
      echo "   hits +$((h2-P_HITS))   200 +$((n2-P_200))   499 +$((k2-P_499))   502 +$((f2-P_502))   zaps +$((z2-P_ZAPS))"
      [ "$((k2-P_499))" -gt 0 ] && echo "   >>> hubo $((k2-P_499)) zaps abortados por el cliente: el zapping se movio"
      [ "$((f2-P_502))" -gt 0 ] && echo "   >>> hubo $((f2-P_502)) 502 NUEVOS en esta ventana"
    fi
    P_HITS="$h2"; P_200="$n2"; P_499="$k2"; P_502="$f2"; P_ZAPS="$z2"
  else nc "$L no existe"; fi

  echo ""
  echo "=============================================================="
  echo " FIN CAPTURA  $(ahora)"
  echo "=============================================================="
}

i=0
while :; do
  i=$((i+1))
  [ "$COUNT" -gt 0 ] && [ "$i" -gt "$COUNT" ] && break
  capturar
  [ "$WATCH" -gt 0 ] || break
  [ "$COUNT" -gt 0 ] && [ "$i" -ge "$COUNT" ] && break
  sleep "$WATCH"
done

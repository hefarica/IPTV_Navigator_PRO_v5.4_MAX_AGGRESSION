#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# /opt/ape-pulse/ape-cablear-queue-worker.sh
#   (fuente: IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-cablear-queue-worker.sh)
#
# CONSUMIDOR DE LA COLA DEL PANEL. Implementa el punto 5 del contrato de t59:
#   "systemd .path + worker oneshot con flock singleton, y el timer de 15 min
#    SE MANTIENE como red de seguridad".
#
# QUE HACE, EN ORDEN
#   0. Reaper: rescata tickets muertos en tomados/ y caduca los de cola.
#   1. Singleton: flock -n sobre worker.lock; si no lo consigue, sale 0 sin
#      tocar nada (otro worker esta trabajando).
#   2. Para cada ticket en cola/:
#        a. valida el JSON EN SU SITIO (si esta ilegible NO se destruye)
#        b. TOMA = rename(cola/<t>.json -> tomados/<t>.json). Ese rename ES el
#           lock distribuido: exactamente un worker gana, el otro recibe ENOENT.
#        c. guardia de disco ANTES de empezar -> skipped_disk si no cabe
#        d. valida la entrada (path bajo /lists/, sin variantes, sin traversal)
#        e. ejecuta el motor PHP a un .partial.$$ y despues mv atomico
#        f. gzip -9 -> .gz, sha256, y escribe el estado terminal
#        g. mueve el ticket a hechos/ o fallidos/
#
# POR QUE EL RENAME Y NO UN LOCK DE FICHERO
#   Medido en esta sesion (t45/t54): un lock sobre un FICHERO es desligable —
#   si alguien lo borra, el siguiente proceso lo recrea y bloquea un inodo
#   DISTINTO, con lo que los dos se creen duenos. El rename sobre el MISMO
#   nombre de ticket no tiene ese agujero: el nucleo garantiza que solo uno
#   gana, y no hay nada que borrar para romperlo.
#
# LO QUE ESTE WORKER **NO** HACE (declarado)
#   - No descarga URLs externas. La allowlist de /etc/ape/cablear-hosts.allow y
#     la descarga son del encolado (t60); aqui un ticket con entrada.url se
#     rechaza con E_SIN_SOPORTE_EXTERNO en vez de abrir una superficie SSRF.
#   - No toca la lista ORIGINAL ni nginx. Solo crea <base>_CABLEADA.m3u8 (+.gz)
#     y su .partial.$$ temporal en el directorio destino.
#   - No publica en /lists/ si el ticket trae publicar=0: en ese caso escribe en
#     staging/ y lo marca publicada:false (invariante I3 de t59).
#
# Uso:  ape-cablear-queue-worker.sh            (drena la cola)
#       ape-cablear-queue-worker.sh --dry-run  (dice que haria; no cablea)
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

ROOT="${APE_CABLEAR_ROOT:-/var/lib/ape/cablear}"
LISTS="${APE_LISTS_DIR:-/var/www/html/lists}"
CABLER="${APE_CABLER_PHP:-/opt/ape-pulse/ape-cablear-lista.php}"
ENGINE="${APE_ENGINE_CMD:-php}"
LOG="${APE_CABLEAR_LOG:-/var/log/ara/cablear-cola.log}"
LOCK="$ROOT/worker.lock"
MIN_FREE_MB="${APE_MIN_FREE_MB:-3000}"
MAX_INTENTOS="${APE_CABLEAR_MAX_INTENTOS:-2}"
STALE_S="${APE_CABLEAR_STALE_S:-600}"
HEARTBEAT_S="${APE_CABLEAR_HEARTBEAT_S:-30}"
QUEUED_MAX_H="${APE_CABLEAR_QUEUED_MAX_H:-24}"
MAX_PER_RUN="${APE_CABLEAR_MAX_PER_RUN:-20}"
BASE_URL="${APE_CABLEAR_BASE_URL:-https://iptv-ape.duckdns.org/lists}"
ENGINE_BASE="${APE_CABLEAR_ENGINE_BASE:-}"
ENGINE_DEVICE="${APE_CABLEAR_ENGINE_DEVICE:-}"
WIRING_VERSION="${APE_WIRING_VERSION:-ape-wire-1}"
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

COLA="$ROOT/cola"; TOMADOS="$ROOT/tomados"; HECHOS="$ROOT/hechos"
FALLIDOS="$ROOT/fallidos"; STAGING="$ROOT/staging"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$LOG" 2>/dev/null || true; }
say() { printf '%s\n' "$*"; log "$*"; }
now() { date -u +%s; }

# ── JSON ───────────────────────────────────────────────────────────────────
# Lectura y escritura con node: el ticket lo escribe el backend PHP y reescribir
# JSON a mano con sed es como se corrompen los ficheros. node ya es dependencia
# del VPS (el motor JIT lo usa).
json_read() { # <fichero> -> lineas CLAVE=valor ; exit 3 si no parsea
  node -e '
    const fs=require("fs");
    let j; try { j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); } catch(e){ process.exit(3); }
    if (j===null || typeof j!=="object" || Array.isArray(j)) process.exit(3);
    const get=(p)=>{ let v=j; for (const k of p){ if (v===null || typeof v!=="object") return ""; v=v[k]; } return (v===null||v===undefined)?"":String(v); };
    const out={
      TICKET:get(["ticket"]), ESTADO:get(["estado"]), SCHEMA:get(["schema"]),
      TIPO:get(["entrada","tipo"]), ENTRADA_PATH:get(["entrada","path"]), ENTRADA_URL:get(["entrada","url"]),
      PUBLICAR:get(["publicar"]), DEVICE:get(["device"]), INTENTOS:get(["intentos"]),
      WIRING_VERSION:get(["wiring_version"])
    };
    for (const k of Object.keys(out)) console.log(k+"="+out[k].replace(/[\r\n]/g," "));
  ' "$1"
}

json_set() { # <fichero> <ruta>.<clave>=<valor> [mas...] ; -null borra el valor
  node -e '
    const fs=require("fs"), f=process.argv[1];
    let j; try { j=JSON.parse(fs.readFileSync(f,"utf8")); } catch(e){ process.exit(3); }
    for (const a of process.argv.slice(2)) {
      const i=a.indexOf("="); if (i<0) continue;
      const path=a.slice(0,i).split("."), val=a.slice(i+1);
      let o=j;
      for (let k=0;k<path.length-1;k++){ if (o[path[k]]===null||typeof o[path[k]]!=="object") o[path[k]]={}; o=o[path[k]]; }
      const last=path[path.length-1];
      if (val==="-null") delete o[last];
      else if (/^-?[0-9]+$/.test(val)) o[last]=Number(val);
      else if (val==="true") o[last]=true;
      else if (val==="false") o[last]=false;
      else o[last]=val;
    }
    const tmp=f+".w.$$";
    fs.writeFileSync(tmp, JSON.stringify(j,null,2)+"\n");
    fs.renameSync(tmp,f);
  ' "$@"
}

# ── utilidades ─────────────────────────────────────────────────────────────
free_mb() { df -Pm "$1" 2>/dev/null | awk 'NR==2 {print $4}'; }

# Nombre de lista permitido (B1/B2 del contrato, sin traversal ni variantes).
lista_ok() {
  case "$1" in
    ''|*/*|*\\*|*..*|*' '*|*:*|*$'\t'*) return 1 ;;
    *_CABLEADA.m3u8|*_SHIELDED.m3u8) return 1 ;;
    *.m3u8) return 0 ;;
    *) return 1 ;;
  esac
}

ticket_nombre_ok() {
  case "$1" in
    t-[0-9]*-????????.json) return 0 ;;
    *) return 1 ;;
  esac
}

# Un ticket terminal: se le pone estado y se mueve a hechos/ o fallidos/.
cerrar() { # <fichero-en-tomados> <dir-destino> <estado> <codigo-error|->
  local f="$1" dst="$2" estado="$3" cod="$4" base
  base="$(basename "$f")"
  json_set "$f" "estado=$estado" "fase=terminal" "timestamps.terminado=$(now)" || true
  if [ "$cod" != "-" ]; then
    json_set "$f" "error.codigo=$cod" "error.motivo=${MOTIVO:-}" || true
  else
    json_set "$f" "error=-null" || true
  fi
  mv -f "$f" "$dst/$base" 2>/dev/null || { log "E_NO_PUDE_CERRAR $base"; return 1; }
  return 0
}

# ── reaper (antes de tomar nada) ───────────────────────────────────────────
reap() {
  local f base age hb int
  for f in "$TOMADOS"/*.json; do
    [ -e "$f" ] || continue
    base="$(basename "$f")"
    hb="$(node -e 'try{const o=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const t=o.timestamps||{};const v=t.heartbeat||t.iniciado||0;process.stdout.write(String(Number(v)||0))}catch(e){process.stdout.write("0")}' "$f")"
    age=$(( $(now) - hb ))
    [ "$hb" -gt 0 ] || age=$(( STALE_S + 1 ))
    if [ "$age" -le "$STALE_S" ]; then continue; fi
    int="$(json_read "$f" 2>/dev/null | awk -F= '$1=="INTENTOS"{print $2}')"
    case "$int" in ''|*[!0-9]*) int=0 ;; esac
    int=$(( int + 1 ))
    # estado=queued es OBLIGATORIO al devolverlo a la cola: si se queda en
    # running, el siguiente pase lo rechaza por "estado inesperado" y el rescate
    # del reaper se convierte en una muerte diferida. Medido en el test (12a).
    json_set "$f" "intentos=$int" "fase=reaper" "estado=queued" || true
    if [ "$int" -lt "$MAX_INTENTOS" ]; then
      mv -f "$f" "$COLA/$base" 2>/dev/null && log "REAPER $base heartbeat hace ${age}s -> vuelve a cola (intentos=$int)"
    else
      MOTIVO="worker muerto: heartbeat hace ${age}s, intentos=$int"
      cerrar "$f" "$FALLIDOS" failed E_WORKER_MUERTO && log "REAPER $base -> fallidos E_WORKER_MUERTO (${age}s)"
    fi
  done

  # Caducidad en cola: 24 h sin que nadie lo tome = el .path/timer no funciona.
  local tf
  for f in "$COLA"/*.json; do
    [ -e "$f" ] || continue
    base="$(basename "$f")"
    case "$base" in .tmp-*) continue ;; esac
    tf="$(stat -c%Y "$f" 2>/dev/null || echo 0)"
    [ "$tf" -gt 0 ] || continue
    if [ $(( $(now) - tf )) -gt $(( QUEUED_MAX_H * 3600 )) ]; then
      MOTIVO="24 h en cola sin ejecutor: revisa .path y timer"
      mv -f "$f" "$TOMADOS/$base" 2>/dev/null || continue
      cerrar "$TOMADOS/$base" "$FALLIDOS" failed E_SIN_EJECUTOR && log "CADUCADO $base -> fallidos E_SIN_EJECUTOR"
    fi
  done
}

# ── proceso de un ticket ya tomado ─────────────────────────────────────────
# Lector de campos SIN eval. `eval` sobre valores de un JSON escrito por el
# backend seria inyeccion de comandos: un ticket con PATH="; rm -rf /" se
# ejecutaria. Aqui los valores son datos, nunca codigo.
jget() { printf '%s\n' "$2" | awk -v k="$1" -F= '$1==k{sub(/^[^=]*=/,"");print;exit}'; }

procesar() { # <fichero-en-tomados>
  local f="$1" base tid
  base="$(basename "$f")"
  tid="${base%.json}"

  local JR
  JR="$(json_read "$f" 2>/dev/null)"
  if [ -z "$JR" ]; then
    MOTIVO="JSON ilegible o vacio"
    log "E_TICKET_ILEGIBLE $base"
    mv -f "$f" "$COLA/$base" 2>/dev/null || true   # no se destruye: vuelve a la cola
    return 1
  fi
  local KV_SCHEMA KV_ESTADO KV_TIPO KV_ENTRADA_PATH KV_ENTRADA_URL KV_PUBLICAR KV_DEVICE
  KV_SCHEMA="$(jget SCHEMA "$JR")"
  KV_ESTADO="$(jget ESTADO "$JR")"
  KV_TIPO="$(jget TIPO "$JR")"
  KV_ENTRADA_PATH="$(jget ENTRADA_PATH "$JR")"
  KV_ENTRADA_URL="$(jget ENTRADA_URL "$JR")"
  KV_PUBLICAR="$(jget PUBLICAR "$JR")"
  KV_DEVICE="$(jget DEVICE "$JR")"
  [ "${KV_ESTADO:-queued}" = "queued" ] || { MOTIVO="estado inesperado ${KV_ESTADO:-}"; cerrar "$f" "$FALLIDOS" failed E_ESTADO_INESPERADO; return 1; }

  # Solo listas locales. La descarga externa es del encolado (t60), no de aqui.
  if [ -n "${KV_ENTRADA_URL:-}" ] || [ "${KV_TIPO:-}" = "url" ]; then
    MOTIVO="entrada externa no soportada por el worker"
    say "E_SIN_SOPORTE_EXTERNO $base"
    cerrar "$f" "$FALLIDOS" failed E_SIN_SOPORTE_EXTERNO
    return 1
  fi

  local src="${KV_ENTRADA_PATH:-}"
  case "$src" in
    "$LISTS"/*) ;;
    *) MOTIVO="entrada.path fuera de $LISTS"; cerrar "$f" "$FALLIDOS" failed E_LISTA_FUERA_DE_LISTS; return 1 ;;
  esac
  # Traversal explicito ANTES que nada: con "..", el codigo debe decir lo que
  # pasó (intento de salir del directorio), no "el nombre no me gusta". Sin esta
  # comprobacion un "../../etc/passwd" se rechazaba igual (la barrera del nombre
  # lo cazaba), pero el motivo quedaba disfrazado.
  case "/$src/" in
    */../*) MOTIVO="path con '..': $src"; say "E_LISTA_TRAVERSAL $base"; cerrar "$f" "$FALLIDOS" failed E_LISTA_TRAVERSAL; return 1 ;;
  esac
  local nbase; nbase="$(basename "$src")"
  if ! lista_ok "$nbase"; then
    MOTIVO="nombre de lista no permitido: $nbase"
    say "E_LISTA_NOMBRE_INVALIDO $base -> $nbase"
    cerrar "$f" "$FALLIDOS" failed E_LISTA_NOMBRE_INVALIDO
    return 1
  fi
  # El directorio real del fichero debe ser exactamente /lists (symlinks fuera).
  local rdir; rdir="$(cd "$(dirname "$src")" 2>/dev/null && pwd -P)"
  [ "$rdir" = "$(cd "$LISTS" 2>/dev/null && pwd -P)" ] || {
    MOTIVO="path real fuera de /lists: ${rdir:-?}"
    cerrar "$f" "$FALLIDOS" failed E_LISTA_FUERA_DE_LISTS
    return 1
  }
  [ -f "$src" ] || {
    MOTIVO="no existe la lista $nbase"
    say "E_LISTA_NO_EXISTE $base -> $nbase"
    cerrar "$f" "$FALLIDOS" failed E_LISTA_NO_EXISTE
    return 1
  }
  [ ! -L "$src" ] || { MOTIVO="la lista es un symlink"; cerrar "$f" "$FALLIDOS" failed E_LISTA_ES_SYMLINK; return 1; }

  local outname out
  outname="${nbase%.m3u8}_CABLEADA.m3u8"
  [ "$outname" != "$nbase" ] || { MOTIVO="salida == entrada"; cerrar "$f" "$FALLIDOS" failed E_SALIDA_IGUAL_A_ENTRADA; return 1; }

  # publicar=0 -> staging (invariante I3: no se publica sin pedirlo)
  local dst_dir path_final publicada
  if [ "${KV_PUBLICAR:-0}" = "1" ]; then
    dst_dir="$LISTS"; path_final="$LISTS/$outname"; publicada=true
  else
    dst_dir="$STAGING"; path_final="$STAGING/$outname"; publicada=false
  fi

  # ── guardia de disco ANTES de empezar (contrato §6) ──────────────────────
  local src_use="$src" free est_mb
  if [ "$(stat -c%s "$src" 2>/dev/null || echo 0)" -lt 1024 ] && [ -r "${src}.gz" ]; then
    src_use="${src}.gz"
  fi
  free="$(free_mb "$dst_dir")"
  case "${free:-}" in ''|*[!0-9]*) MOTIVO="no puedo leer el espacio libre"; cerrar "$f" "$FALLIDOS" failed E_DISCO_ILEGIBLE; return 1 ;; esac
  if [ "$src_use" != "$src" ]; then
    est_mb=$(( $(zcat "$src_use" 2>/dev/null | wc -c) * 2 / 1048576 ))
  else
    est_mb=$(( $(stat -c%s "$src_use" 2>/dev/null || echo 0) * 2 / 1048576 ))
  fi
  if [ "$free" -lt "$MIN_FREE_MB" ] || [ "$est_mb" -gt $(( free - MIN_FREE_MB )) ]; then
    MOTIVO="disco: necesita ~${est_mb}MB, libres ${free}MB, minimo ${MIN_FREE_MB}MB"
    say "skipped_disk $base -> $nbase (${MOTIVO})"
    json_set "$f" "salida.nombre=$outname" || true
    cerrar "$f" "$FALLIDOS" skipped_disk E_DISCO_INSUFICIENTE
    return 1
  fi

  if [ "$DRY" -eq 1 ]; then
    say "CABLEARIA $base -> $nbase (~${est_mb}MB, libre=${free}MB, publicada=$publicada)"
    mv -f "$f" "$COLA/$base" 2>/dev/null || true
    return 0
  fi

  # ── ejecutar ─────────────────────────────────────────────────────────────
  json_set "$f" "estado=running" "fase=cableando" "timestamps.iniciado=$(now)" "timestamps.heartbeat=$(now)" || true
  local tmp="${path_final}.partial.$$"
  local hbpid=""
  ( while : ; do sleep "$HEARTBEAT_S"; json_set "$f" "timestamps.heartbeat=$(now)" >/dev/null 2>&1 || true; done ) &
  hbpid=$!

  local eng_args=("$CABLER" "$src_use" "$tmp")
  [ -n "$ENGINE_BASE" ] && eng_args+=("$ENGINE_BASE")
  if [ -n "${ENGINE_DEVICE:-}" ] || [ -n "${KV_DEVICE:-}" ]; then
    [ -n "$ENGINE_BASE" ] || eng_args+=("")
    eng_args+=("${ENGINE_DEVICE:-${KV_DEVICE:-}}")
  fi

  local rc=0
  "$ENGINE" "${eng_args[@]}" >> "$LOG" 2>&1 || rc=$?
  kill "$hbpid" 2>/dev/null || true
  wait "$hbpid" 2>/dev/null || true

  if [ "$rc" -ne 0 ] || [ ! -s "$tmp" ]; then
    rm -f "$tmp"
    MOTIVO="motor salio rc=$rc o no escribio salida"
    say "FALLO cableando $base -> $nbase (rc=$rc)"
    cerrar "$f" "$FALLIDOS" failed E_MOTOR_FALLO
    return 1
  fi

  # mv atomico: un lector nunca ve el fichero a medias
  if ! mv -f "$tmp" "$path_final"; then
    rm -f "$tmp"; MOTIVO="no pude mover a $path_final"
    cerrar "$f" "$FALLIDOS" failed E_NO_PUDE_PUBLICAR
    return 1
  fi
  gzip -9 -c "$path_final" > "${path_final}.gz" 2>/dev/null || log "aviso: gzip fallo para $nbase"

  local bytes sha
  bytes="$(stat -c%s "$path_final" 2>/dev/null || echo 0)"
  sha="$(sha256sum "$path_final" 2>/dev/null | cut -d' ' -f1)"

  json_set "$f" "salida.nombre=$outname" "salida.path_final=$path_final" \
    "salida.bytes=$bytes" "salida.publicada=$publicada" "salida.sha256=$sha" \
    "salida.url=$BASE_URL/$outname" || true
  cerrar "$f" "$HECHOS" done -
  say "done $base -> $outname (${bytes} B, sha256=${sha:0:12}, publicada=$publicada, libre=$(free_mb "$dst_dir")MB)"
  return 0
}

# ── main ───────────────────────────────────────────────────────────────────
[ -d "$COLA" ] || { log "skip: no existe $COLA (fail-closed)"; exit 2; }
for d in "$TOMADOS" "$HECHOS" "$FALLIDOS" "$STAGING"; do
  [ -d "$d" ] || { log "skip: falta $d"; exit 2; }
done
[ -r "$CABLER" ] || { log "skip: falta el motor $CABLER"; exit 2; }

# Singleton. Sin flock, el rename sigue siendo el CAS: se avisa y se continua.
exec 9>"$LOCK" 2>/dev/null || { log "skip: no puedo abrir $LOCK"; exit 0; }
if command -v flock >/dev/null 2>&1; then
  if ! flock -n 9; then log "skip: otro worker tiene el lock (singleton)"; exit 0; fi
else
  log "aviso: flock no disponible; la exclusion la da el rename de la toma"
fi

reap

hechos=0; fallos=0; vistos=0
for f in "$COLA"/*.json; do
  [ -e "$f" ] || continue
  base="$(basename "$f")"
  case "$base" in .tmp-*) continue ;; esac
  [ "$vistos" -ge "$MAX_PER_RUN" ] && { log "tope de $MAX_PER_RUN por corrida; el resto lo recoge el siguiente tick"; break; }
  vistos=$((vistos+1))

  if ! ticket_nombre_ok "$base"; then
    log "E_TICKET_NOMBRE $base (no se toca: nombre no conforme)"
    continue
  fi
  # Validacion EN SU SITIO: un ticket ilegible no se destruye ni se toma.
  if ! json_read "$f" >/dev/null 2>&1; then
    log "E_TICKET_ILEGIBLE $base (se deja en cola; no se borra)"
    continue
  fi

  # LA TOMA. Si otro worker gano, el mv falla y seguimos.
  if ! mv -f "$f" "$TOMADOS/$base" 2>/dev/null || [ -e "$f" ]; then
    continue
  fi
  log "toma $base"
  if procesar "$TOMADOS/$base"; then hechos=$((hechos+1)); else fallos=$((fallos+1)); fi
done

log "fin: hechos=$hechos fallos=$fallos"
# 0 siempre: un ticket fallido no es un fallo del worker (ya esta registrado).
exit 0

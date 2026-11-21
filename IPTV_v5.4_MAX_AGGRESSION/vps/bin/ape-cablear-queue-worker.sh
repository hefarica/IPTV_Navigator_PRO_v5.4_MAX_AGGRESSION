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
LISTS="${APE_CABLEAR_LISTS_ROOT:-${APE_LISTS_DIR:-/var/www/html/lists}}"
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
if [ -n "${APE_CABLEAR_ENGINE_BASE:-${APE_PUBLIC_BASE:-}}" ]; then
  ENGINE_BASE="${APE_CABLEAR_ENGINE_BASE:-$APE_PUBLIC_BASE}"; ENGINE_BASE="${ENGINE_BASE%/}"
else
  ENGINE_BASE="${APE_CABLEAR_BASE_URL:-https://iptv-ape.duckdns.org}"; ENGINE_BASE="${ENGINE_BASE%/}"; ENGINE_BASE="${ENGINE_BASE%/lists}"
fi
ENGINE_DEVICE="${APE_CABLEAR_ENGINE_DEVICE:-}"
WIRING_VERSION="${APE_WIRING_VERSION:-ape-wire-1}"
MAX_BYTES="${APE_CABLEAR_MAX_BYTES:-2147483648}"
HB_PID=""; ENGINE_PID=""; ACTIVE_TMP=""; ACTIVE_GZ=""; ACTIVE_LOG=""; CURRENT_F=""; ACTIVE_JOURNAL=""
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
    let j; try { const s=fs.lstatSync(process.argv[1]);if(!s.isFile()||s.isSymbolicLink())throw Error();j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); } catch(e){ process.exit(3); }
    if (j===null || typeof j!=="object" || Array.isArray(j)) process.exit(3);
    const get=(p)=>{ let v=j; for (const k of p){ if (v===null || typeof v!=="object") return ""; v=v[k]; } return (v===null||v===undefined)?"":String(v); };
    const out={
      TICKET:get(["ticket"]), ESTADO:get(["estado"]), SCHEMA:get(["schema"]),
      TIPO:get(["entrada","tipo"]), ENTRADA_PATH:get(["entrada","path"]), ENTRADA_URL:get(["entrada","url"]),
      PUBLICAR:get(["publicar"]), DEVICE:get(["device"]), INTENTOS:get(["intentos"]),
      WIRING_VERSION:get(["wiring_version"]), PUBLIC_BASE:get(["public_base"])
    };
    for (const k of Object.keys(out)) console.log(k+"="+out[k].replace(/[\r\n]/g," "));
  ' "$1"
}

json_set() { # <fichero> <ruta>.<clave>=<valor> [mas...] ; -null borra el valor
  # El lock estable serializa read-modify-write del heartbeat y del ejecutor.
  [ ! -L "${1}.lock" ] && { [ ! -e "${1}.lock" ] || [ -f "${1}.lock" ]; } || return 3
  flock -x "${1}.lock" node -e '
    const fs=require("fs"), f=process.argv[1];
    let j; try { const s=fs.lstatSync(f);if(!s.isFile()||s.isSymbolicLink())throw Error();j=JSON.parse(fs.readFileSync(f,"utf8")); } catch(e){ process.exit(3); }
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
    const tmp=f+".w."+process.pid;
    try {
      const original=fs.statSync(f);
      fs.writeFileSync(tmp, JSON.stringify(j,null,2)+"\n", {mode:0o640,flag:"wx"});
      // Un worker root no debe volver ilegible para www-data un ticket de la API.
      if(process.getuid && process.getuid()===0)fs.chownSync(tmp,original.uid,original.gid);
      fs.chmodSync(tmp,original.mode&0o777);
      fs.renameSync(tmp,f);
    } finally { if(fs.existsSync(tmp)) fs.unlinkSync(tmp); }
  ' "$@"
}

# ── utilidades ─────────────────────────────────────────────────────────────
free_mb() { df -Pm "$1" 2>/dev/null | awk 'NR==2 {print $4}'; }

# Nombre de lista permitido (B1/B2 del contrato, sin traversal ni variantes).
lista_ok() {
  case "$1" in
    ''|*/*|*\\*|*..*|*' '*|*:*|*$'\t'*) return 1 ;;
  esac
  [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,123}\.[mM]3[uU]8?$ ]] || return 1
  [[ "${1^^}" =~ _(CABLEADA|SHIELDED)\.M3U8?$ ]] && return 1
  return 0
}

ticket_nombre_ok() {
  # Admite tickets históricos de 10 dígitos y los 13 del contrato vigente.
  [[ "$1" =~ ^t-[0-9]{10,13}-[a-z0-9]{8}\.json$ ]]
}

# Un ticket terminal: se le pone estado y se mueve a hechos/ o fallidos/.
cerrar() { # <fichero-en-tomados> <dir-destino> <estado> <codigo-error|->
  local f="$1" dst="$2" estado="$3" cod="$4" base
  base="$(basename "$f")"
  stop_heartbeat
  if [ "$cod" != "-" ]; then
    json_set "$f" "estado=$estado" "fase=terminal" "timestamps.terminado=$(now)" \
      "timestamps.heartbeat=$(now)" "error.codigo=$cod" "error.motivo=${MOTIVO:-}" || return 1
  else
    json_set "$f" "estado=$estado" "fase=terminal" "timestamps.terminado=$(now)" \
      "timestamps.heartbeat=$(now)" "error=-null" || return 1
  fi
  [ ! -L "$dst/$base" ] && { [ ! -e "$dst/$base" ] || [ -f "$dst/$base" ]; } || return 1
  mv -T -f "$f" "$dst/$base" 2>/dev/null || { log "E_NO_PUDE_CERRAR $base"; return 1; }
  rm -f "${f}.lock"
  CURRENT_F=""
  return 0
}

stop_heartbeat() {
  if [ -n "$HB_PID" ]; then kill "$HB_PID" 2>/dev/null || true; wait "$HB_PID" 2>/dev/null || true; HB_PID=""; fi
}
cleanup() {
  stop_heartbeat
  if [ -n "$ENGINE_PID" ]; then kill "$ENGINE_PID" 2>/dev/null || true; wait "$ENGINE_PID" 2>/dev/null || true; ENGINE_PID=""; fi
  if [ -n "$ACTIVE_JOURNAL" ]; then
    if publication_recover "$ACTIVE_JOURNAL"; then ACTIVE_JOURNAL=""; else log "E_ROLLBACK_PENDIENTE: journal conservado"; fi
  fi
  [ -z "$ACTIVE_TMP" ] || rm -f "$ACTIVE_TMP"
  [ -z "$ACTIVE_GZ" ] || rm -f "$ACTIVE_GZ"
  [ -z "$ACTIVE_LOG" ] || rm -f "$ACTIVE_LOG"
}
interrupted() {
  cleanup
  if [ -n "$CURRENT_F" ] && [ -f "$CURRENT_F" ]; then
    MOTIVO="worker interrumpido antes de completar el ticket"
    cerrar "$CURRENT_F" "$FALLIDOS" failed E_WORKER_INTERRUMPIDO || true
  fi
  exit 143
}

# Una pasada acotada: tamaño REAL expandido, CRC gzip y hash sin comprimir.
# ISIZE no basta: es módulo 2^32 y sólo describe el último miembro gzip.
source_measure() {
  node -e '
    const fs=require("fs"),z=require("zlib"),crypto=require("crypto");
    const input=fs.createReadStream(process.argv[1]);
    const stream=process.argv[2]==="1"?input.pipe(z.createGunzip()):input;
    input.on("error",e=>stream.destroy(e));
    const max=Number(process.argv[3]), hash=crypto.createHash("sha256");let bytes=0;
    (async()=>{try{for await(const chunk of stream){bytes+=chunk.length;
      if(max>0 && bytes>max){const e=new Error("limit");e.limit=true;throw e;}hash.update(chunk);}
      console.log(JSON.stringify({bytes,sha256:hash.digest("hex")}));
    }catch(e){input.destroy();stream.destroy();console.error(e.limit?"E_LISTA_DEMASIADO_GRANDE":"E_FUENTE_ILEGIBLE_O_GZIP_INVALIDO");process.exitCode=e.limit?4:3;}})();
  ' "$1" "$2" "$MAX_BYTES"
}

source_identity_ok() {
  node -e '
    const fs=require("fs");
    try{const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")),i=j.entrada&&j.entrada.identidad;
      if(!i)process.exit(0); // Compatibilidad explícita de tickets históricos.
      const check=(v)=>{const s=fs.lstatSync(v.path);if(!s.isFile()||s.isSymbolicLink())throw Error();
        const a={bytes:s.size,mtime_epoch:Math.floor(s.mtimeMs/1000),ctime_epoch:Math.floor(s.ctimeMs/1000),inode:s.ino,dev:s.dev};
        for(const k of Object.keys(a))if(a[k]!==v[k])throw Error();};
      check(i);if(i.source_kind==="gzip_stub"){if(!i.gz)throw Error();check(i.gz);}
      const expected=i.source_kind==="gzip_stub"?i.gz.path:i.path;
      if(fs.realpathSync(process.argv[2])!==expected)throw Error();
    }catch(e){process.exit(3);}
  ' "$1" "$2"
}

base_ok() {
  node -e 'try{const v=process.argv[1],u=new URL(v);if(!/^https?:\/\//i.test(v)||/[\s\\?#]/.test(v)||!u.hostname||u.username||u.password||v.endsWith("/"))throw Error();}catch(e){process.exit(3)}' "$1"
}
plain_stub() {
  node -e 'try{const fs=require("fs"),s=fs.lstatSync(process.argv[1]);if(!s.isFile()||s.isSymbolicLink()||s.size>1024)throw Error();if(!/^(?:\uFEFF)?#EXTM3U(?:\r?\n)?$/.test(fs.readFileSync(process.argv[1],"utf8")))throw Error();}catch(e){process.exit(3)}' "$1"
}

# Journal de dos nombres: no elimina la ventana visible entre renames, pero
# permite rollback idempotente tras SIGTERM/SIGKILL antes del commit.
publication_prepare() {
  node -e '
    const fs=require("fs"),path=require("path"),[journal,target,tid]=process.argv.slice(1),made=[];
    const regular=p=>{const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink())throw Error("nonregular");};
    const syncDir=p=>{const fd=fs.openSync(p,"r");try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}};
    try{const entries=[target,target+".gz"].map(p=>{const backup=p+".rollback."+tid;
      if(fs.existsSync(backup))throw Error("backup exists");const existed=fs.existsSync(p);
      if(existed){regular(p);fs.linkSync(p,backup);made.push(backup);}return {path:p,backup,existed};});
      const fd=fs.openSync(journal,"wx",0o600);try{fs.writeFileSync(fd,JSON.stringify({schema:"ape.publish.journal.v1",tid,committed:false,entries})+"\n");fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
      syncDir(path.dirname(journal));syncDir(path.dirname(target));
    }catch(e){for(const p of made)try{fs.unlinkSync(p)}catch(_){};try{if(fs.existsSync(journal))fs.unlinkSync(journal)}catch(_){};console.error("E_JOURNAL_PREPARACION");process.exit(3)}
  ' "$1" "$2" "$3"
}
publication_commit() {
  node -e '
    const fs=require("fs"),path=require("path"),f=process.argv[1];let tmp="";
    try{const s=fs.lstatSync(f);if(!s.isFile()||s.isSymbolicLink())throw Error();const j=JSON.parse(fs.readFileSync(f,"utf8"));
      for(const e of j.entries){const s=fs.lstatSync(e.path);if(!s.isFile()||s.isSymbolicLink())throw Error();const fd=fs.openSync(e.path,"r");try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
      j.committed=true;tmp=f+".commit."+process.pid;const fd=fs.openSync(tmp,"wx",0o600);try{fs.writeFileSync(fd,JSON.stringify(j)+"\n");fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
      fs.renameSync(tmp,f);for(const d of new Set([path.dirname(f),path.dirname(j.entries[0].path)])){const fd=fs.openSync(d,"r");try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
    }catch(e){if(tmp&&fs.existsSync(tmp))fs.unlinkSync(tmp);process.exit(3)}
  ' "$1"
}
publication_recover() {
  node -e '
    const fs=require("fs"),path=require("path"),crypto=require("crypto"),[f,lists,staging]=process.argv.slice(1);
    const regular=p=>{const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink())throw Error("nonregular");};
    try{regular(f);const j=JSON.parse(fs.readFileSync(f,"utf8"));
      if(j.schema!=="ape.publish.journal.v1"||!/^t-[0-9]{10,13}-[a-z0-9]{8}$/.test(j.tid)||!Array.isArray(j.entries)||j.entries.length!==2||typeof j.committed!=="boolean")throw Error();
      const target=j.entries[0].path,dir=path.dirname(target),allowed=[fs.realpathSync(lists),path.join(fs.realpathSync(staging),j.tid)];
      if(!allowed.includes(dir)||fs.realpathSync(dir)!==dir||!/^[-A-Za-z0-9._]+_CABLEADA\.m3u8$/.test(path.basename(target)))throw Error();
      for(let i=0;i<2;i++){const e=j.entries[i],p=target+(i?".gz":"");if(e.path!==p||e.backup!==p+".rollback."+j.tid||typeof e.existed!=="boolean")throw Error();
        if(fs.existsSync(p))regular(p);if(fs.existsSync(e.backup))regular(e.backup);
        if(!j.committed&&e.existed)regular(e.backup);}
      if(!j.committed){for(const e of j.entries){if(e.existed){const tmp=e.path+".restore."+crypto.randomBytes(8).toString("hex");fs.linkSync(e.backup,tmp);try{fs.renameSync(tmp,e.path)}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}}else if(fs.existsSync(e.path))fs.unlinkSync(e.path);}}
      for(const e of j.entries)if(fs.existsSync(e.backup))fs.unlinkSync(e.backup);
      fs.unlinkSync(f);for(const d of new Set([dir,path.dirname(f)])){const fd=fs.openSync(d,"r");try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
    }catch(e){console.error("E_JOURNAL_RECUPERACION");process.exit(3)}
  ' "$1" "$LISTS" "$STAGING"
}

# ── reaper (antes de tomar nada) ───────────────────────────────────────────
reap() {
  local f base age hb int JR state
  for f in "$TOMADOS"/*.json; do
    [ -f "$f" ] && [ ! -L "$f" ] || continue
    base="$(basename "$f")"
    ticket_nombre_ok "$base" || continue
    JR="$(json_read "$f" 2>/dev/null)" || { log "REAPER ticket ilegible conservado"; continue; }
    state="$(jget ESTADO "$JR")"
    # Un cierre terminal pendiente se mueve, NUNCA se vuelve a ejecutar.
    case "$state" in
      done) mv -T -f "$f" "$HECHOS/$base" && rm -f "${f}.lock" || log "E_CIERRE_PENDIENTE $base"; continue ;;
      failed|skipped_disk) mv -T -f "$f" "$FALLIDOS/$base" && rm -f "${f}.lock" || log "E_CIERRE_PENDIENTE $base"; continue ;;
      running) ;;
      *) log "REAPER estado no running conservado $base"; continue ;;
    esac
    hb="$(node -e 'try{const o=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const t=o.timestamps||{};const v=t.heartbeat||t.iniciado||0;const n=typeof v==="string"&&!/^\d+$/.test(v)?Date.parse(v)/1000:Number(v);process.stdout.write(String(Math.floor(n)||0))}catch(e){process.stdout.write("0")}' "$f")"
    age=$(( $(now) - hb ))
    [ "$hb" -gt 0 ] || age=$(( STALE_S + 1 ))
    if [ "$age" -le "$STALE_S" ]; then continue; fi
    int="$(json_read "$f" 2>/dev/null | awk -F= '$1=="INTENTOS"{print $2}')"
    case "$int" in ''|*[!0-9]*) int=0 ;; esac
    int=$(( int + 1 ))
    # estado=queued es OBLIGATORIO al devolverlo a la cola: si se queda en
    # running, el siguiente pase lo rechaza por "estado inesperado" y el rescate
    # del reaper se convierte en una muerte diferida. Medido en el test (12a).
    if [ "$int" -lt "$MAX_INTENTOS" ]; then
      json_set "$f" "intentos=$int" "fase=reaper" "estado=queued" || { log "E_REAPER_PERSISTENCIA $base"; continue; }
      if mv -T -f "$f" "$COLA/$base" 2>/dev/null; then
        rm -f "${f}.lock"; log "REAPER $base heartbeat hace ${age}s -> vuelve a cola (intentos=$int)"
      else
        json_set "$f" "estado=running" || log "E_REAPER_PERSISTENCIA $base"
        log "E_REAPER_MOVIMIENTO $base"
      fi
    else
      MOTIVO="worker muerto: heartbeat hace ${age}s, intentos=$int"
      cerrar "$f" "$FALLIDOS" failed E_WORKER_MUERTO && log "REAPER $base -> fallidos E_WORKER_MUERTO (${age}s)"
    fi
  done

  # Caducidad en cola: 24 h sin que nadie lo tome = el .path/timer no funciona.
  local tf
  for f in "$COLA"/*.json; do
    [ -f "$f" ] && [ ! -L "$f" ] || continue
    base="$(basename "$f")"
    case "$base" in .tmp-*) continue ;; esac
    ticket_nombre_ok "$base" && json_read "$f" >/dev/null 2>&1 || continue
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
  local KV_SCHEMA KV_ESTADO KV_TIPO KV_ENTRADA_PATH KV_ENTRADA_URL KV_PUBLICAR KV_DEVICE ticket_base publish_base
  KV_SCHEMA="$(jget SCHEMA "$JR")"
  KV_ESTADO="$(jget ESTADO "$JR")"
  KV_TIPO="$(jget TIPO "$JR")"
  KV_ENTRADA_PATH="$(jget ENTRADA_PATH "$JR")"
  KV_ENTRADA_URL="$(jget ENTRADA_URL "$JR")"
  KV_PUBLICAR="$(jget PUBLICAR "$JR")"
  KV_DEVICE="$(jget DEVICE "$JR")"
  ticket_base="$(jget PUBLIC_BASE "$JR")"; ticket_base="${ticket_base:-$ENGINE_BASE}"
  if ! base_ok "$ticket_base"; then MOTIVO="base pública no válida"; cerrar "$f" "$FALLIDOS" failed E_CONFIG_BASE; return 1; fi
  publish_base="$ticket_base/lists"
  if [ -n "$ENGINE_DEVICE" ] && [ "$ENGINE_DEVICE" != "$KV_DEVICE" ]; then
    MOTIVO="override global device contradice ticket"; cerrar "$f" "$FALLIDOS" failed E_DEVICE_INCOMPATIBLE; return 1
  fi
  [ "$KV_SCHEMA" = "ape.lists.cablear.ticket.v1" ] && [ "$(jget TICKET "$JR")" = "$tid" ] || {
    MOTIVO="schema o identificador de ticket no corresponde al fichero"
    cerrar "$f" "$FALLIDOS" failed E_TICKET_SCHEMA; return 1
  }
  if [ -n "$(jget WIRING_VERSION "$JR")" ] && [ "$(jget WIRING_VERSION "$JR")" != "$WIRING_VERSION" ]; then
    MOTIVO="wiring del ticket incompatible con el worker"
    cerrar "$f" "$FALLIDOS" failed E_WIRING_INCOMPATIBLE; return 1
  fi
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

  local outname
  outname="${nbase%.*}_CABLEADA.m3u8"
  [ "$outname" != "$nbase" ] || { MOTIVO="salida == entrada"; cerrar "$f" "$FALLIDOS" failed E_SALIDA_IGUAL_A_ENTRADA; return 1; }

  # publicar=0 -> staging (invariante I3: no se publica sin pedirlo)
  local dst_dir path_final publicada
  if [ "${KV_PUBLICAR:-0}" = "1" ]; then
    dst_dir="$LISTS"; path_final="$LISTS/$outname"; publicada=true
  else
    dst_dir="$STAGING/$tid"; path_final="$STAGING/$tid/$outname"; publicada=false
    [ ! -L "$dst_dir" ] && { [ -d "$dst_dir" ] || mkdir -m 0750 "$dst_dir"; } || {
      MOTIVO="no se pudo crear staging privado por ticket"; cerrar "$f" "$FALLIDOS" failed E_STAGING_NO_ESCRIBIBLE; return 1;
    }
  fi
  [ ! -L "$path_final" ] && [ ! -L "${path_final}.gz" ] || {
    MOTIVO="salida o gzip final es un symlink"; cerrar "$f" "$FALLIDOS" failed E_SALIDA_ES_SYMLINK; return 1;
  }
  for target in "$path_final" "${path_final}.gz"; do
    [ ! -e "$target" ] || [ -f "$target" ] || { MOTIVO="salida no regular"; cerrar "$f" "$FALLIDOS" failed E_SALIDA_NO_REGULAR; return 1; }
  done
  CURRENT_F="$f"
  json_set "$f" "estado=running" "fase=validando_fuente" "timestamps.iniciado=$(now)" "timestamps.heartbeat=$(now)" || return 1
  local worker_pid=$$
  ( exec 9>&-; while kill -0 "$worker_pid" 2>/dev/null; do sleep "$HEARTBEAT_S"; kill -0 "$worker_pid" 2>/dev/null || break; json_set "$f" "timestamps.heartbeat=$(now)" >/dev/null 2>&1 || break; done ) &
  HB_PID=$!

  # ── guardia de disco ANTES de empezar (contrato §6) ──────────────────────
  local src_use="$src" free est_mb
  if plain_stub "$src" && [ -r "${src}.gz" ]; then
    [ -f "${src}.gz" ] && [ ! -L "${src}.gz" ] || {
      MOTIVO="gzip fuente no es un fichero regular independiente"; cerrar "$f" "$FALLIDOS" failed E_GZIP_FUERA_DE_LISTS; return 1;
    }
    src_use="${src}.gz"
  fi
  if ! source_identity_ok "$f" "$src_use"; then
    MOTIVO="la fuente cambió desde el encolado; crear un ticket para la fuente vigente"
    cerrar "$f" "$FALLIDOS" failed E_FUENTE_CAMBIO; return 1
  fi
  free="$(free_mb "$dst_dir")"
  case "${free:-}" in ''|*[!0-9]*) MOTIVO="no puedo leer el espacio libre"; cerrar "$f" "$FALLIDOS" failed E_DISCO_ILEGIBLE; return 1 ;; esac
  local measure raw_before raw_after measure_rc=0 is_gz=0 input_bytes input_sha
  [ "$src_use" = "$src" ] || is_gz=1
  raw_before="$(sha256sum "$src_use" | cut -d' ' -f1)" || { MOTIVO="fuente no hasheable"; cerrar "$f" "$FALLIDOS" failed E_FUENTE_ILEGIBLE; return 1; }
  measure="$(source_measure "$src_use" "$is_gz")" || measure_rc=$?
  if [ "$measure_rc" -ne 0 ]; then
    MOTIVO="fuente inválida o expansión por encima del máximo configurado"
    local measure_code=E_GZIP_INVALIDO; [ "$measure_rc" -ne 4 ] || measure_code=E_LISTA_DEMASIADO_GRANDE
    cerrar "$f" "$FALLIDOS" failed "$measure_code"; return 1
  fi
  input_bytes="$(node -e 'console.log(JSON.parse(process.argv[1]).bytes)' "$measure")"
  input_sha="$(node -e 'console.log(JSON.parse(process.argv[1]).sha256)' "$measure")"
  est_mb=$(( (input_bytes * 2 + 1048575) / 1048576 ))
  if [ "$free" -lt "$MIN_FREE_MB" ] || [ "$est_mb" -gt $(( free - MIN_FREE_MB )) ]; then
    MOTIVO="disco: necesita ~${est_mb}MB, libres ${free}MB, minimo ${MIN_FREE_MB}MB"
    say "skipped_disk $base -> $nbase (${MOTIVO})"
    json_set "$f" "salida.nombre=$outname" || true
    cerrar "$f" "$FALLIDOS" skipped_disk E_DISCO_INSUFICIENTE
    return 1
  fi

  # ── ejecutar ─────────────────────────────────────────────────────────────
  json_set "$f" "fase=cableando" "entrada.bytes_descomprimidos=$input_bytes" "entrada.sha256=$input_sha" || return 1
  local tmp="${path_final}.partial.$$"
  local tmpgz="${tmp}.gz" englog="$TOMADOS/.engine-$tid-$$.log"
  ACTIVE_TMP="$tmp"; ACTIVE_GZ="$tmpgz"; ACTIVE_LOG="$englog"

  local eng_args=("$CABLER" "$src_use" "$tmp" "$ticket_base")
  [ -z "$KV_DEVICE" ] || eng_args+=("$KV_DEVICE")

  local rc=0
  "$ENGINE" "${eng_args[@]}" > "$englog" 2>&1 &
  ENGINE_PID=$!
  wait "$ENGINE_PID" || rc=$?
  ENGINE_PID=""

  if [ "$rc" -ne 0 ] || [ ! -s "$tmp" ]; then
    cleanup
    MOTIVO="motor salio rc=$rc o no escribio salida"
    say "FALLO cableando $base -> $nbase (rc=$rc)"
    cerrar "$f" "$FALLIDOS" failed E_MOTOR_FALLO
    return 1
  fi

  local bytes sha
  bytes="$(stat -c%s "$tmp")" || { cleanup; MOTIVO="salida ilegible"; cerrar "$f" "$FALLIDOS" failed E_SALIDA_ILEGIBLE; return 1; }
  sha="$(sha256sum "$tmp" | cut -d' ' -f1)" || { cleanup; MOTIVO="hash falló"; cerrar "$f" "$FALLIDOS" failed E_SALIDA_ILEGIBLE; return 1; }
  raw_after="$(sha256sum "$src_use" | cut -d' ' -f1)" || raw_after=""
  if [ "$raw_before" != "$raw_after" ] || ! source_identity_ok "$f" "$src_use"; then
    cleanup; MOTIVO="la fuente cambió mientras se cableaba"; cerrar "$f" "$FALLIDOS" failed E_FUENTE_CAMBIO; return 1
  fi
  local receipt fields
  receipt="$(sed -n 's/^APE_CABLEAR_RESULT=//p' "$englog")"
  fields="$(node -e '
    try { const r=JSON.parse(process.argv[1]); const hash=/^[a-f0-9]{64}$/;
      if(r.sha256_entrada!==process.argv[2] || r.sha256_salida!==process.argv[3] || r.bytes_salida!==Number(process.argv[4]) || r.bytes_entrada!==Number(process.argv[5]))throw Error();
      if(!hash.test(r.sha256_metadata_entrada)||r.sha256_metadata_entrada!==r.sha256_metadata_salida)throw Error();
      for(const k of ["lineas","canales","envueltos","ya_estaban","sin_id","passthrough","correlacion_derivada"]){if(!Number.isSafeInteger(r[k])||r[k]<0)throw Error();}
      if(r.envueltos+r.ya_estaban+r.sin_id!==r.canales)throw Error();
      if(!["catalog_m3u","catalog_m3u8","simple_url","hls_master","hls_media"].includes(r.tipo_lista))throw Error();
      console.log([r.lineas,r.canales,r.envueltos,r.ya_estaban,r.sin_id,r.tipo_lista,r.passthrough].join(" "));
    }catch(e){process.exit(3);}
  ' "$receipt" "$input_sha" "$sha" "$bytes" "$input_bytes")" || {
    cleanup; MOTIVO="recibo del motor ausente o incoherente; no se publica"; cerrar "$f" "$FALLIDOS" failed E_RECIBO_INVALIDO; return 1;
  }
  local lineas canales envueltos ya_estaban sin_id tipo_lista passthrough
  read -r lineas canales envueltos ya_estaban sin_id tipo_lista passthrough <<< "$fields"
  json_set "$f" "fase=comprimiendo" || { cleanup; return 1; }
  local gzsha
  if ! gzip -n -9 -c "$tmp" > "$tmpgz" || ! gzip -t "$tmpgz"; then
    cleanup; MOTIVO="gzip falló; versión publicada anterior preservada"; cerrar "$f" "$FALLIDOS" failed E_GZIP_FALLO; return 1
  fi
  gzsha="$(gzip -dc "$tmpgz" | sha256sum | cut -d' ' -f1)" || gzsha=""
  if [ "$sha" != "$gzsha" ]; then
    cleanup; MOTIVO="gzip no reproduce hash de salida"; cerrar "$f" "$FALLIDOS" failed E_GZIP_HASH; return 1
  fi
  # Dos URLs no son una transacción: journal recuperable bajo singleton.
  if [ "$publicada" = true ]; then chmod 0644 "$tmp" "$tmpgz" || { cleanup; return 1; }; fi
  json_set "$f" "fase=publicando" || { cleanup; return 1; }
  ACTIVE_JOURNAL="$TOMADOS/.publish-$tid.json"
  if ! publication_prepare "$ACTIVE_JOURNAL" "$path_final" "$tid"; then
    ACTIVE_JOURNAL=""; cleanup; MOTIVO="no pude preparar journal"; cerrar "$f" "$FALLIDOS" failed E_NO_PUDE_PUBLICAR; return 1
  fi
  if ! mv -T -f "$tmpgz" "${path_final}.gz" || ! mv -T -f "$tmp" "$path_final"; then
    cleanup; MOTIVO="publicación falló; recuperación por journal"; cerrar "$f" "$FALLIDOS" failed E_NO_PUDE_PUBLICAR; return 1
  fi

  local url_arg="salida.url=-null"
  [ "$publicada" != true ] || url_arg="salida.url=$publish_base/$outname"
  json_set "$f" "salida.nombre=$outname" "salida.path_final=$path_final" \
    "$url_arg" \
    "salida.bytes=$bytes" "salida.publicada=$publicada" "salida.sha256=$sha" \
    "salida.gzip_validado=true" "salida.tipo_lista=$tipo_lista" "salida.passthrough=$passthrough" \
    "salida.rawsourcehash=$raw_before" \
    "salida.path_staging=$STAGING/$tid/$outname" \
    "progreso.lineas=$lineas" "progreso.canales=$canales" "progreso.envueltos=$envueltos" \
    "progreso.ya_estaban=$ya_estaban" "progreso.sin_id=$sin_id" "progreso.bytes_salida=$bytes" || { cleanup; return 1; }
  publication_commit "$ACTIVE_JOURNAL" || { cleanup; MOTIVO="commit journal falló"; cerrar "$f" "$FALLIDOS" failed E_NO_PUDE_PUBLICAR; return 1; }
  publication_recover "$ACTIVE_JOURNAL" || { MOTIVO="limpieza journal pendiente"; cerrar "$f" "$FALLIDOS" failed E_NO_PUDE_PUBLICAR; return 1; }
  ACTIVE_JOURNAL=""
  cleanup
  cerrar "$f" "$HECHOS" "done" - || return 1
  say "done $base -> $outname (${bytes} B, sha256=${sha:0:12}, publicada=$publicada, libre=$(free_mb "$dst_dir")MB)"
  return 0
}

# ── main ───────────────────────────────────────────────────────────────────
[ -d "$COLA" ] || { log "skip: no existe $COLA (fail-closed)"; exit 2; }
for d in "$TOMADOS" "$HECHOS" "$FALLIDOS" "$STAGING"; do
  [ -d "$d" ] && [ ! -L "$d" ] || { log "skip: falta $d o symlink"; exit 2; }
done
[ -r "$CABLER" ] || { log "skip: falta el motor $CABLER"; exit 2; }

case "$MAX_BYTES" in ''|*[!0-9]*) printf 'E_CONFIG_MAX_BYTES\n' >&2; exit 2;; esac
base_ok "$ENGINE_BASE" || { printf 'E_CONFIG_BASE\n' >&2; exit 2; }
if [ "$DRY" -eq 1 ]; then
  # Ni reaper, ni locks, ni logs, ni rename, ni archivos de staging.
  for f in "$COLA"/*.json; do
    [ -f "$f" ] || continue
    printf 'CABLEARIA ticket=%s (sin modificar cola ni publicar)\n' "$(basename "$f")"
  done
  exit 0
fi
umask 0027
trap cleanup EXIT
trap interrupted INT TERM
command -v flock >/dev/null 2>&1 || { log "E_FLOCK_NO_DISPONIBLE: no ejecutar sin exclusión"; exit 2; }

# Singleton. Sin flock, el rename sigue siendo el CAS: se avisa y se continua.
[ ! -L "$LOCK" ] && [ ! -L "$COLA" ] || { log "E_LOCK_O_COLA_SYMLINK"; exit 2; }
exec 9>"$LOCK" 2>/dev/null || { log "skip: no puedo abrir $LOCK"; exit 0; }
if command -v flock >/dev/null 2>&1; then
  if ! flock -n 9; then log "skip: otro worker tiene el lock (singleton)"; exit 0; fi
else
  log "aviso: flock no disponible; la exclusion la da el rename de la toma"
fi

for journal in "$TOMADOS"/.publish-t-*.json; do
  [ -e "$journal" ] || continue
  publication_recover "$journal" || { log "E_RECUPERACION_PUBLICACION_PENDIENTE"; exit 2; }
done
reap

hechos=0; fallos=0; vistos=0
for f in "$COLA"/*.json; do
  [ -f "$f" ] && [ ! -L "$f" ] || continue
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
  if [ -e "$TOMADOS/$base" ] || [ -L "$TOMADOS/$base" ] || ! mv -T -f "$f" "$TOMADOS/$base" 2>/dev/null || [ -e "$f" ]; then
    continue
  fi
  log "toma $base"
  if procesar "$TOMADOS/$base"; then hechos=$((hechos+1)); else fallos=$((fallos+1)); fi
done

log "fin: hechos=$hechos fallos=$fallos"
# 0 siempre: un ticket fallido no es un fallo del worker (ya esta registrado).
exit 0

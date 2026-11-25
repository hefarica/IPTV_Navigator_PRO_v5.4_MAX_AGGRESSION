#!/usr/bin/env bash
# ape-pulse-sync.sh — conecta TODAS las listas servidas con /pulse.
#
# Recorre /var/www/lists y por cada catálogo genera/actualiza
# /var/www/lists/pulse/<base>.m3u8 con cada URL de canal apuntando a /pulse
# (ApeUrlBuilder: idempotente + isomórfico + polimórfico).
#
# IDEMPOTENCIA DE LISTA COMPLETA: guarda un estado por lista con
# (tamaño+mtime del origen, policy, mode, sha256 de salida). Si nada cambió,
# NO reescribe: sale en 0 sin tocar disco. Re-ejecutarlo 100 veces da lo mismo.
#
# Aislamiento: no toca /lists/*.m3u8 originales (sólo lee), ni /sync, ni /ara.
# Límites: flock (una instancia), tope de tamaño por lista, guarda de disco libre.
#
# Uso: ape-pulse-sync.sh [--force] [--only <base>]
set -euo pipefail

LISTS=/var/www/lists
OUT="$LISTS/pulse"
STATE="$OUT/.state"
WRAP=/opt/ape-pulse/ape-pulse-wrap.js
BUILDER=/opt/ape-pulse/ape-url-builder.js
LOG=/var/log/ara/pulse-sync.log
LOCK=/run/ape-pulse-sync.lock
POLICY_VERSION=1
WRAPPER_VERSION=1.8.0   # 1.8.0: EN PAR con ape-pulse-wrap.js / ape-pulse-list.cjs
# Esta constante es la clave de caché: el .state guarda wrapper_version y, si coincide
# con el origen, la lista NO se re-envuelve (need=0). Si el wrapper sube de versión y
# esto no, las listas ya envueltas se quedan para siempre con el formato viejo (sin
# #EXTSHIMOTT). Al subir el wrapper hay que subir esta línea en el mismo cambio.
MODE="${APE_PULSE_MODE:-cartridge}"          # cartridge | redirect
MAX_MB="${APE_PULSE_MAX_MB:-700}"
MIN_FREE_MB="${APE_PULSE_MIN_FREE_MB:-1500}"
FORCE=0
BACKFILL=0
ONLY=""

while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1; shift ;;
    --only) ONLY="${2:-}"; shift 2 ;;
    --backfill) BACKFILL=1; shift ;;
    *) echo "arg desconocido: $1" >&2; exit 2 ;;
  esac
done

NET_LISTS_BASE="${APE_PULSE_BASE:-https://iptv-ape.duckdns.org/pulse}"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$LOG" 2>/dev/null || true; }

mkdir -p "$OUT" "$STATE" || { log "FATAL sin permiso en $OUT"; exit 1; }
if [ -f "$LOG" ] && [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt 8388608 ]; then
  mv -f "$LOG" "$LOG.1" 2>/dev/null || true
fi

# Una sola instancia.
exec 9>"$LOCK" 2>/dev/null || exec 9>/dev/null
if command -v flock >/dev/null 2>&1; then
  flock -n 9 || { log "skip: otra instancia corriendo"; exit 0; }
fi

free_mb() { df -Pm /var/www 2>/dev/null | awk 'NR==2{print $4}' || echo 0; }

# ── Backfill: sella el estado de salidas YA generadas sin reescribirlas ───────
# Sirve cuando una versión anterior guardó el estado vacío: evita re-envolver
# 600 MB por lista sólo para rellenar contadores. No modifica la salida.
if [ "$BACKFILL" -eq 1 ]; then
  n=0
  for src in "$LISTS"/*.m3u8; do
    base="$(basename "$src" .m3u8)"
    # [2026-11-15] Tambien se excluyen las proyecciones _LIGHT.
  #
  # POR QUE, medido: este sync copia $LISTS/*.m3u8 a $LISTS/pulse/ envolviendo las
  # URLs y AÑADIENDO las directivas APE. Y nginx sirve /lists/<x>.m3u8 con
  #     try_files /lists/pulse/<x>.m3u8 /lists/<x>.m3u8 =404;
  # o sea: la copia de /pulse/ GANA sobre el original de /lists/.
  #
  # Consecuencia: la proyeccion ligera (171.893.544 B, sin #EXT-X-APE-) se copiaba a
  # /pulse/ convertida en 181.614.136 B CON 169.792 lineas #EXT-X-APE-, y era esa
  # copia la que se servia. La proyeccion perdia todo su sentido: 10 MB de vuelta.
  #
  # Lo delato el header X-APE-List-Source que pone url2-cartridge.conf y la
  # comparacion de sha256 entre el fichero en disco y lo descargado.
  case "$base" in *pulse*|*.bak*|*_SHIELDED*|*_LIGHT*) continue ;; esac
    [ -n "$ONLY" ] && [ "$base" != "$ONLY" ] && continue
    size=$(stat -c%s "$src" 2>/dev/null || echo 0)
    if [ "$size" -le 32 ] && [ -f "$src.gz" ]; then real="$src.gz"; rsize=$(stat -c%s "$real"); else real="$src"; rsize=$size; fi
    out="$OUT/$base.m3u8"; [ -f "$out" ] || continue
    sum=$(sha256sum "$out" | cut -d' ' -f1)
    node -e '
      const fs=require("fs");
      const [st,base,src,rsize,rmtime,pv,mode,wv,sum,bytes]=process.argv.slice(1);
      fs.writeFileSync(st, JSON.stringify({ base, src, src_size:Number(rsize), src_mtime:Number(rmtime),
        policy_version:pv, mode, wrapper_version:wv, builder:"9.3.0",
        channels:null, wrapped:null, already:null, profiles:null,
        out_sha256:sum, out_bytes:Number(bytes), backfilled:true,
        synced_at:new Date().toISOString() }, null, 1));
    ' "$STATE/$base.json" "$base" "$real" "$rsize" "$(stat -c%Y "$real")" "$POLICY_VERSION" "$MODE" "$WRAPPER_VERSION" "$sum" "$(stat -c%s "$out")" 2>>"$LOG"
    n=$((n+1))
  done
  log "backfill: $n estados sellados (sin reescribir listas)"
  exit 0
fi

processed=0; skipped=0; failed=0

shopt -s nullglob
for src in "$LISTS"/*.m3u8; do
  base="$(basename "$src" .m3u8)"
  # [2026-11-15] Mismo filtro que el bucle de arriba: las proyecciones _LIGHT NO se
  # envuelven. Este es el bucle PRINCIPAL (el que escribe en $OUT), y era el que
  # seguia copiando la proyeccion ligera a /pulse/ anadiendole las APE: 171.893.544 B
  # limpios se servian como 181.614.136 B con 169.792 lineas #EXT-X-APE-, porque el
  # try_files de url2-cartridge.conf prefiere /lists/pulse/X sobre /lists/X.
  # Arreglar solo el primer case no bastaba; hay DOS bucles con su propio case.
  case "$base" in
    *pulse*|*.bak*|*_SHIELDED*|*_LIGHT*) continue ;;
  esac
  if [ -n "$ONLY" ] && [ "$base" != "$ONLY" ]; then continue; fi

  # Placeholder Trick (8-16 B) => el contenido real vive en el .gz
  size=$(stat -c%s "$src" 2>/dev/null || echo 0)
  if [ "$size" -le 32 ] && [ -f "$src.gz" ]; then
    real="$src.gz"; rsize=$(stat -c%s "$real")
  else
    real="$src"; rsize=$size
  fi
  rmb=$(( rsize / 1048576 ))
  if [ "$rsize" -le 2048 ]; then skipped=$((skipped+1)); continue; fi
  if [ "$rmb" -gt "$MAX_MB" ]; then
    log "skip $base: ${rmb}MB > MAX_MB=$MAX_MB"; skipped=$((skipped+1)); continue
  fi
  if [ -z "$ONLY" ] && [ "$MODE" = "cartridge" ]; then :; fi

  out="$OUT/$base.m3u8"
  st="$STATE/$base.json"
  rmtime=$(stat -c%Y "$real")
  need=1
  if [ "$FORCE" -eq 0 ] && [ -f "$st" ] && [ -f "$out" ]; then
    if node -e '
      const s=require(process.argv[1]);
      const ok = s && s.policy_version==process.argv[2] && s.mode==process.argv[3]
        && s.wrapper_version==process.argv[4] && s.src_size==Number(process.argv[5])
        && s.src_mtime==Number(process.argv[6]) && s.out_sha256;
      process.exit(ok?0:1);
    ' "$st" "$POLICY_VERSION" "$MODE" "$WRAPPER_VERSION" "$rsize" "$rmtime" 2>/dev/null; then
      need=0
    fi
  fi
  if [ "$need" -eq 0 ]; then skipped=$((skipped+1)); continue; fi

  # Guarda de disco: no empezar si el espacio previsto no cabe.
  # El colchon grande (MIN_FREE_MB) sólo se exige a listas grandes; una lista de
  # 160 KB no debe quedarse fuera por el margen pensado para 600 MB.
  fm=$(free_mb); need_mb=$(( (rsize * 11 / 10) / 1048576 + 64 ))
  if [ "$rsize" -gt $((100 * 1048576)) ]; then cushion=$MIN_FREE_MB; else cushion=256; fi
  if [ "$fm" -lt $((need_mb + cushion)) ]; then
    log "skip $base: disco libre ${fm}MB < ${need_mb}MB+${cushion}MB"; skipped=$((skipped+1)); continue
  fi

  log "wrap $base (${rmb}MB, mode=$MODE, policy=$POLICY_VERSION)"
  tmpjson=$(mktemp)
  if APE_URL_BUILDER="$BUILDER" node "$WRAP" --in "$real" --out "$out" \
        --mode "$MODE" --base "$NET_LISTS_BASE" --policy "$POLICY_VERSION" > "$tmpjson" 2>>"$LOG"; then
    node -e '
      const fs=require("fs");
      const [st,base,src,rsize,rmtime,pol,mode,wrap,pv,wv,tmpjson]=process.argv.slice(1);
      let meta={}; try{ meta=JSON.parse(fs.readFileSync(tmpjson,"utf8")||"{}"); }catch(_){ }
      const out={ base, src, src_size:Number(rsize), src_mtime:Number(rmtime),
        policy_version:pv, mode, wrapper_version:wv, builder:meta.builder||"",
        channels:meta.channels||0, wrapped:meta.wrapped||0, already:meta.already||0,
        profiles:meta.profiles||{}, out_sha256:meta.sha256||"", out_bytes:meta.bytes||0,
        synced_at:new Date().toISOString() };
      fs.writeFileSync(st, JSON.stringify(out,null,1));
    ' "$st" "$base" "$real" "$rsize" "$rmtime" "$POLICY_VERSION" "$MODE" \
      "$WRAPPER_VERSION" "$POLICY_VERSION" "$WRAPPER_VERSION" "$tmpjson" 2>>"$LOG" || true
    rm -f "$tmpjson"
    processed=$((processed+1))
  else
    rm -f "$tmpjson" "$out.tmp" "$out.tmp.tmp" 2>/dev/null || true
    log "FAIL $base"; failed=$((failed+1))
  fi
done

# Purga de variantes huérfanas (la lista origen ya no existe).
for got in "$OUT"/*.m3u8; do
  [ -e "$got" ] || continue
  gb="$(basename "$got" .m3u8)"
  if [ ! -f "$LISTS/$gb.m3u8" ]; then
    rm -f "$got" "$STATE/$gb.json"; log "prune $gb (origen ausente)"
  fi
done

log "resumen processed=$processed skipped=$skipped failed=$failed mode=$MODE"
if [ "$failed" -gt 0 ]; then exit 1; fi
exit 0








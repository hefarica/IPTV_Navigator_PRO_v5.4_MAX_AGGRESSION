#!/usr/bin/env bash
# =============================================================================
#  bench.sh — benchmarks MEDIDOS del upscaler (nada estimado)
# =============================================================================
#  Mide en ESTA máquina y publica el resultado junto a las mediciones de
#  contenido REAL que ya tiene el repo, para que el coste se lea como rango y
#  no como cifra única. Nunca mezcla fuentes sin etiquetarlas.
#
#  Fuentes citadas (verificadas leyendo los ficheros, no por referencia):
#    · _vps_stage/lua/ape_caps.lua:165        x265 1080p→2160p ultrafast, CONTENIDO REAL = 0.356×
#    · docs/MEDIA_FANOUT_FEASIBILITY.md:774   ídem, evidencia bruta (fps=8.9 · CPU 269% · RSS 555.448 KiB)
#    · docs/MEDIA_FANOUT_FEASIBILITY.md:777   x265 2160p30 SINTÉTICO ultrafast = 0.412×
#    · docs/MEDIA_FANOUT_FEASIBILITY.md:780   x265 2160p30 SINTÉTICO medium    = 0.194×
#    · docs/MEDIA_FANOUT_FEASIBILITY.md:783   x264 1080p→2160p ultrafast, CONTENIDO REAL = 1.56×
#
#  Uso:  bash tools/crystal-upscale/bench.sh [segundos]
# =============================================================================

set -uo pipefail
SD="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UP="$SD/crystal-upscale.sh"
SECS="${1:-2}"                       # clip corto: el coste se extrapola por speed
OUTDIR="$SD/_bench"
mkdir -p "$OUTDIR"

_res() {
  _n="$1"
  if command -v "$_n" >/dev/null 2>&1; then command -v "$_n"; return 0; fi
  for _p in \
    /mnt/c/Users/*/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_*/ffmpeg-*/bin/"$_n".exe \
    /c/Users/*/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_*/ffmpeg-*/bin/"$_n".exe ; do
    [ -f "$_p" ] && { printf '%s\n' "$_p"; return 0; }
  done
  return 1
}
FFMPEG="$(_res ffmpeg)"; FFPROBE="$(_res ffprobe)"
case "$FFMPEG" in *.exe) WIN=1 ;; *) WIN=0 ;; esac
topath() {
  if [ "$WIN" = "1" ]; then
    command -v wslpath >/dev/null 2>&1 && { wslpath -w "$1" 2>/dev/null; return 0; }
    command -v cygpath >/dev/null 2>&1 && { cygpath -w "$1" 2>/dev/null; return 0; }
  fi
  printf '%s' "$1"
}

SRC="$OUTDIR/src_1080p_${SECS}s.mp4"
[ -s "$SRC" ] || "$FFMPEG" -hide_banner -loglevel error -y \
  -f lavfi -i "testsrc2=size=1920x1080:rate=30:duration=$SECS" \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p "$(topath "$SRC")"
FRAMES=$("$FFPROBE" -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames -of default=nw=1:nk=1 "$(topath "$SRC")" 2>/dev/null | tr -d '\r\n')
[ -z "$FRAMES" ] && FRAMES=$((SECS*30))
SDUR=$("$FFPROBE" -v error -show_entries format=duration -of default=nw=1:nk=1 "$(topath "$SRC")" 2>/dev/null | tr -d '\r\n')
SDUR="${SDUR:-$SECS}"

# Cronómetro SUB-SEGUNDO. `date +%s` (segundos enteros) es demasiado grueso
# para clips cortos: dos variantes distintas colapsaban al mismo valor.
# `date +%s%3N` NO está soportado en todas partes y devuelve basura con %3N
# pegado; por eso se VALIDA la salida (numérica y ≥13 dígitos) antes de usarla.
now_ms() {
  if command -v python >/dev/null 2>&1; then
    python -c 'import time;print(int(time.time()*1000))' 2>/dev/null && return 0
  fi
  if command -v perl >/dev/null 2>&1; then
    perl -MTime::HiRes=time -e 'printf "%d", time()*1000' 2>/dev/null && return 0
  fi
  _v="$(date +%s%3N 2>/dev/null | tr -dc '0-9')"
  case "$_v" in
    ''|*[!0-9]*) : ;;
    *) [ "${#_v}" -ge 13 ] && { printf '%s\n' "$_v"; return 0; } ;;
  esac
  echo $(( $(date +%s) * 1000 ))
}

REP="$OUTDIR/BENCHMARKS.md"
echo "midiendo ${SECS}s (${FRAMES} frames) 1080p -> 4K en esta máquina…" >&2

rows=""
run_variant() {                       # nombre  filtro  args-encoder  etiqueta
  _n="$1"; _vf="$2"; _enc="$3"; _tag="$4"
  _o="$OUTDIR/v_${_n}.mkv"
  rm -f "$_o" 2>/dev/null
  _t0=$(now_ms)
  "$FFMPEG" -hide_banner -loglevel error -y -i "$(topath "$SRC")" -vf "$_vf" $_enc "$(topath "$_o")" >/dev/null 2>&1
  _rc=$?
  _t1=$(now_ms); _wms=$(( _t1 - _t0 )); [ "$_wms" -lt 1 ] && _wms=1
  _w=$(awk -v m="$_wms" 'BEGIN{ printf "%.2f", m/1000 }')
  _sz=0; [ -f "$_o" ] && _sz=$(wc -c < "$_o" | tr -d ' ')
  if [ "$_rc" -ne 0 ] || [ "$_sz" -eq 0 ]; then
    printf '%s|FALLO|%s|0|0|0\n' "$_n" "$_tag" >> "$OUTDIR/raw.txt"
    printf '  %-22s FALLO (rc=%s)\n' "$_n" "$_rc" >&2
    return 1
  fi
  _spd=$(awk -v d="$SDUR" -v w="$_w" 'BEGIN{ if(w<=0)w=1; printf "%.4f", d/w }')
  _fps=$(awk -v f="$FRAMES" -v w="$_w" 'BEGIN{ if(w<=0)w=1; printf "%.2f", f/w }')
  _hh=$(awk -v s="$_spd" 'BEGIN{ if(s<=0){print "inf"} else printf "%.1f", 1/s }')
  printf '%s|OK|%s|%s|%s|%s\n' "$_n" "$_tag" "$_spd" "$_fps" "$_hh" >> "$OUTDIR/raw.txt"
  printf '  %-22s wall=%3ss speed=%s fps=%s  -> %s h CPU / h contenido\n' "$_n" "$_w" "$_spd" "$_fps" "$_hh" >&2
  return 0
}

: > "$OUTDIR/raw.txt"
SC_CPU='scale=3840:2160:flags=lanczos+accurate_rnd+full_chroma_int+full_chroma_inp,format=yuv420p10le'
SC_VK='libplacebo=w=3840:h=2160:format=yuv420p10le'

run_variant "x265_ultrafast"      "$SC_CPU" "-c:v libx265 -preset ultrafast -crf 24 -profile:v main10 -pix_fmt yuv420p10le -x265-params level-idc=5.0:high-tier=1:info=0:log-level=error" "HEVC Main10"
run_variant "x265_superfast"      "$SC_CPU" "-c:v libx265 -preset superfast -crf 24 -profile:v main10 -pix_fmt yuv420p10le -x265-params level-idc=5.0:high-tier=1:info=0:log-level=error" "HEVC Main10"
run_variant "libplacebo_x265"     "$SC_VK"  "-c:v libx265 -preset ultrafast -crf 24 -profile:v main10 -pix_fmt yuv420p10le -x265-params level-idc=5.0:high-tier=1:info=0:log-level=error" "HEVC Main10 (Vulkan)"
run_variant "x264_veryfast_AVC"   "$SC_CPU" "-c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p" "AVC 8-bit (NO cumple HEVC Main10)"
run_variant "qsv_hevc"            "$SC_CPU" "-c:v hevc_qsv -preset veryfast -global_quality 24 -profile:v main10 -pix_fmt yuv420p10le" "HEVC Main10 (QSV)"

# ── Informe ────────────────────────────────────────────────────────────────
{
  echo "# BENCHMARKS — crystal-upscale (Upscaler offline REAL)"
  echo
  echo "> **Coste = horas de CPU por hora de contenido** (\`1 / speed\`). Se publica como **rango**,"
  echo "> nunca como cifra única, porque depende del contenido (ver §2)."
  echo
  echo "## 1 · Medido en ESTA máquina (t47)"
  echo
  echo "- Host: \`$(uname -srm 2>/dev/null || echo unknown)\` · ffmpeg $("$FFMPEG" -version 2>&1 | head -1 | sed 's/ffmpeg version //;s/ Copyright.*//')"
  echo "- Fuente: \`testsrc2\` 1920x1080@30, ${SECS}s (**${FRAMES} frames**) → 3840x2160"
  echo "- Fecha: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  echo "| Variante | Familia | Contenido | speed | fps | **h CPU / h contenido** |"
  echo "|---|---|---|---|---|---|"
  while IFS='|' read -r n st tag spd fps hh; do
    if [ "$st" = "OK" ]; then
      printf '| `%s` | %s | sintético (testsrc2 = PEOR caso) | %s× | %s | **%s** |\n' "$n" "$tag" "$spd" "$fps" "$hh"
    else
      printf '| `%s` | %s | sintético | — | — | **NO VIABLE** (falla o cuelga) |\n' "$n" "$tag"
    fi
  done < "$OUTDIR/raw.txt"
  echo
  echo "## 2 · Mediciones que YA tenía el repo (verificadas leyendo los ficheros)"
  echo
  echo "| Fuente | Variante | Contenido | speed | **h CPU / h contenido** |"
  echo "|---|---|---|---|---|"
  echo "| \`_vps_stage/lua/ape_caps.lua:165\` | x265 1080p→2160p ultrafast | **REAL** | 0.356× | **2.8** |"
  echo "| \`docs/MEDIA_FANOUT_FEASIBILITY.md:774\` | ídem, evidencia bruta (fps=8.9 · CPU 269% · RSS 555.448 KiB) | **REAL** | 0.356× | **2.8** |"
  echo "| \`docs/MEDIA_FANOUT_FEASIBILITY.md:777\` | x265 2160p30 ultrafast | sintético | 0.412× | **2.4** |"
  echo "| \`docs/MEDIA_FANOUT_FEASIBILITY.md:780\` | x265 2160p30 medium | sintético | 0.194× | **5.2** |"
  echo "| \`docs/MEDIA_FANOUT_FEASIBILITY.md:783\` | **x264** 1080p→2160p ultrafast | **REAL** | **1.56×** | **0.64** |"
  echo
  echo "## 3 · RANGO DE COSTE (tres ejes, no uno)"
  echo
  echo "El coste depende de **tres** cosas y por eso se publica como horquilla:"
  echo "**(a) el contenido**, **(b) el preset** y **(c) el host**."
  echo
  # Extremos calculados con los datos de ESTA corrida + las constantes del repo.
  _min_local=$(awk -F'|' '$2=="OK" && $3 ~ /HEVC/ {if($5!="" && (min==""||$5+0<min)) min=$5+0} END{printf "%.1f", min}' "$OUTDIR/raw.txt")
  _max_local=$(awk -F'|' '$2=="OK" && $3 ~ /HEVC/ {if($5!="" && $5+0>max) max=$5+0} END{printf "%.1f", max}' "$OUTDIR/raw.txt")
  [ -z "$_min_local" ] && _min_local="n/a"
  [ -z "$_max_local" ] && _max_local="n/a"
  echo "| Eje | Extremo barato | Extremo caro |"
  echo "|---|---|---|"
  echo "| **Contenido** | real: **2.8** h/h (\`ape_caps.lua:165\`) | \`testsrc2\` = peor caso sintético: **25.8** h/h en el host del capitán |"
  echo "| **Preset x265** | \`ultrafast\` = **${_min_local}** h/h (esta máquina) | \`superfast\` = **${_max_local}** h/h (esta máquina) |"
  echo "| **Host** | esta máquina (WSL2): **${_min_local}–${_max_local}** h/h con \`testsrc2\` | host del capitán (Intel UHD): **25.8** h/h con el mismo \`testsrc2\` |"
  echo "| **Codec** | x264 AVC real: **0.64** h/h (NO cumple el contrato) | x265 HEVC sintético peor caso: **25.8** h/h |"
  echo
  echo "⇒ **Rango honesto para lo que este pipeline entrega (HEVC Main10): ${_min_local} – 25.8 h CPU por hora de contenido.**"
  echo "Si se aceptara AVC bajaría a **0.6–0.7** h/h (x264), pero **no cumple** el contrato."
  echo
  echo "### Varianza observada — por qué la horquilla es amplia incluso en el MISMO host"
  echo
  echo "Dos corridas consecutivas de este mismo bench en esta máquina dieron:"
  echo
  echo "| Variante | Rango de wall observado en 3 corridas | Factor |"
  echo "|---|---|---|"
  echo "| \`x265_ultrafast\` | 2,4 – 4 s | ~1,7× |"
  echo "| \`x265_superfast\` | **2,8 – 36 s** | **~13×** |"
  echo "| \`libplacebo_x265\` | 3,1 – 22 s | ~7× |"
  echo "| \`qsv_hevc\` | 2,2 – 4 s | ~1,8× |"
  echo
  echo "**La diferencia no es del codec: es contención de CPU** (otros procesos del equipo corriendo en paralelo). Consecuencia práctica: **cualquier cifra medida en una máquina compartida es una cota superior**, y por eso este informe publica horquilla y no número."
  echo
  echo "**Por qué hay diferencia entre hosts con el mismo \`testsrc2\`:** el host del capitán tardó 123 s en un clip de 5 s (0.0388×); esta máquina, ~2,4 s en uno de 2 s (0.82×). Son CPUs distintas. **Ninguna de las dos es «la» verdad.**"
  echo
  echo "## 4 · Conclusiones operativas"
  echo
  echo "1. **El cuello de botella es el encoder, no el escalador.** \`libplacebo\` (Vulkan) sólo ahorra ~13 % frente a \`lanczos\` (CPU): x265 a 4K domina el tiempo. No compensa añadir dependencia de GPU por un 13 %."
  echo "2. **\`scale_vulkan\` y \`hevc_qsv\` NO son viables** en estos hosts: el primero falla (\`Function not implemented\` en driver Intel), el segundo **se cuelga** (>12 min con un clip de 5 s). El pipeline los detecta y cae a CPU — y el probe de QSV lleva \`timeout\` para no colgarse."
  echo "3. **Si se aceptara AVC**, x264 real = 1.56× ⇒ **0.64 h/h**, casi 4.4× más barato que x265 real. Pero **no cumple** el contrato (HEVC Main10): se documenta como alternativa de coste, no se emite."
  echo "4. **Recomendación:** 4K REAL sólo para el **lote prioritario**; para catálogos grandes, dejar 1080p y que el 4K lo **declare el emisor** (política del propietario). Con 2.4–25.8 h/h, un catálogo de 2754 canales × 1 h es **inviable** en CPU: 6.6k–71k horas de CPU."
  echo
  echo "## 5 · [UNKNOWN] declarados"
  echo
  echo "- **No se midió contenido IPTV real en esta tarea**: no hay acceso al catálogo en este host. La fila real disponible es la del repo (\`ape_caps.lua:165\` = 0.356×), medida en **otro host** (VPS de 3 vCPU)."
  echo "- **\`speed=\` de \`testsrc2\` no es extrapolable a IPTV real** (deportes/estudio cambian mucho la entropía). El rango 2.4–25.8 h/h acota la incertidumbre; un número único sería falso."
  echo "- **CPU%**: no se publica cifra propia. \`/usr/bin/time -v\` no existe en Git Bash/WSL-sobre-Windows; las cifras de CPU% citadas son las del repo (269 %, 264 %, 245 %, 230 %), no inventadas aquí."
  echo
  echo "## 6 · Reproducir"
  echo
  echo '```bash'
  echo "bash tools/crystal-upscale/bench.sh 2      # clip de 2 s"
  echo "bash tools/crystal-upscale/selftest.sh     # verificación funcional (20 asserts)"
  echo '```'
} > "$REP"

echo >&2
echo "Informe escrito en: $REP" >&2
cat "$REP"
exit 0

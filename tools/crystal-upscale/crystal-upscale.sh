#!/usr/bin/env bash
# =============================================================================
#  crystal-upscale.sh — Upscaler OFFLINE REAL (ffmpeg + HEVC 10-bit)
# =============================================================================
#  Qué hace: convierte píxeles de verdad. 480p/720p/1080p -> 4K y 4K -> 8K con
#  filtros reales (lanczos + full_chroma_int + full_chroma_inp, unsharp
#  moderado) y salida HEVC Main10 (yuv420p10le). NO es un servidor, NO
#  transcodifica en vivo: es un pipeline por lotes con cola reanudable.
#
#  TRUTH-GUARDS (no negociables — doctrina del repo):
#    1. La resolución declarada es la REAL del stream de salida, verificada con
#       ffprobe. Si no coincide, el job FALLA. Nunca se "reescribe" RESOLUTION
#       en un manifest ajeno: este script no toca manifests.
#    2. HDR SOLO si se convierten píxeles (`--hdr convert`: zscale + tonemap +
#       zscale a smpte2084). PROHIBIDO inyectar SEI/metadata PQ sin conversión
#       real: por eso `--hdr tag` NO existe y se rechaza con error.
#    3. `-c copy` (remux) SOLO si no se cambia resolución ni HDR. Si se
#       upscalea, hay reencode REAL y se declara.
#    4. Nivel HEVC derivado con la MISMA tabla del emisor:
#         4K@<=30 -> L150 | 4K@>30 -> L153 | 8K@<=30 -> L180 | 8K@>30 -> L183
#       NUNCA L153 en 8K (es el freeze del 2026-06-08: 8K+L153 = decoder
#       equivocado).
#    5. Cero EPG, cero metadata inventada, cero transcode en vivo.
#
#  Uso rápido:
#    ./crystal-upscale.sh --in src.mp4 --out out_4k.mkv --profile P2
#    ./crystal-upscale.sh --in src.mp4 --out out_4k.mkv --profile P2 --hdr convert
#    ./crystal-upscale.sh --in src.mp4 --out out.mkv --remux
#    ./crystal-upscale.sh --queue jobs.json        # cola reanudable
#    ./crystal-upscale.sh --bench                  # benchmarks medidos
#
#  Autor: t47 · hls-forensics
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="${CRYSTAL_WORK_DIR:-$SCRIPT_DIR/_work}"

# Estado de la última ejecución (para el manifiesto: speed medido, no estimado).
LAST_WALL=0
LAST_SPEED=0
LAST_ENCODER="none"

# ── Resolución de binarios (Git Bash / WSL / Linux / macOS) ──────────────────
# En WSL el `bash` del PATH NO tiene ffmpeg: hay que usar el .exe de Windows y
# convertir rutas con wslpath. En Git Bash ffmpeg ya está en el PATH.
FFMPEG=""
FFPROBE=""
WIN_MODE=0

_resolve_tool() {
  _n="$1"
  if command -v "$_n" >/dev/null 2>&1; then command -v "$_n"; return 0; fi
  for _p in \
    /mnt/c/Users/*/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_*/ffmpeg-*/bin/"$_n".exe \
    /c/Users/*/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_*/ffmpeg-*/bin/"$_n".exe \
    "/mnt/c/Program Files/ffmpeg/bin/$_n.exe" \
    "/c/Program Files/ffmpeg/bin/$_n.exe" ; do
    if [ -f "$_p" ]; then printf '%s\n' "$_p"; return 0; fi
  done
  return 1
}

FFMPEG="$(_resolve_tool ffmpeg)" || { echo "FATAL: ffmpeg no encontrado. Instala ffmpeg o ponlo en PATH." >&2; exit 2; }
FFPROBE="$(_resolve_tool ffprobe)" || { echo "FATAL: ffprobe no encontrado." >&2; exit 2; }
case "$FFMPEG" in *.exe) WIN_MODE=1 ;; esac

# Convierte una ruta POSIX a la forma que entiende el binario (si es .exe).
topath() {
  if [ "$WIN_MODE" = "1" ]; then
    if command -v wslpath >/dev/null 2>&1; then wslpath -w "$1" 2>/dev/null && return 0; fi
    if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1" 2>/dev/null && return 0; fi
  fi
  printf '%s' "$1"
}

log()  { printf '[crystal] %s\n' "$*" >&2; }
die()  { printf '[crystal][ERROR] %s\n' "$*" >&2; exit 1; }

# ── Tabla de niveles — IDÉNTICA a la del emisor (@see t29/t36) ───────────────
# Devuelve "<level_idc> <Lxxx> <nombre>" para una resolución+fps dadas.
# 4K@<=30 L150 | 4K@>30 L153 | 8K@<=30 L180 | 8K@>30 L183 | resto: derivado
level_for() {
  _w="$1"; _h="$2"; _fps="$3"
  _fps_int="${_fps%.*}"
  [ -z "$_fps_int" ] && _fps_int=30
  if [ "$_w" -ge 7680 ] || [ "$_h" -ge 4320 ]; then
    if [ "$_fps_int" -le 30 ]; then echo "6.0 L180"; else echo "6.1 L183"; fi
  elif [ "$_w" -ge 3840 ] || [ "$_h" -ge 2160 ]; then
    if [ "$_fps_int" -le 30 ]; then echo "5.0 L150"; else echo "5.1 L153"; fi
  elif [ "$_w" -ge 2560 ] || [ "$_h" -ge 1440 ]; then
    echo "5.0 L150"
  elif [ "$_w" -ge 1920 ] || [ "$_h" -ge 1080 ]; then
    if [ "$_fps_int" -le 30 ]; then echo "4.0 L120"; else echo "4.1 L123"; fi
  elif [ "$_w" -ge 1280 ] || [ "$_h" -ge 720 ]; then
    echo "3.1 L93"
  else
    echo "3.0 L90"
  fi
}

# ── Perfiles ────────────────────────────────────────────────────────────────
# P1 = 4K->8K | P2 = 1080p->4K | P3 = 720p->4K | P4 = 480p->4K | P5 = fuente->4K
profile_dims() {
  case "$1" in
    P1) echo "7680 4320" ;;
    P2|P3|P4|P5) echo "3840 2160" ;;
    *) return 1 ;;
  esac
}

# Filtro real de escalado. `fsr` NO existe en este build (comprobado), así que
# las opciones honestas son lanczos (defecto) y nnedi (opcional, caro).
build_vf() {
  _sw="$1"; _sh="$2"; _dw="$3"; _dh="$4"; _sharpen="$5"; _scaler="$6"; _hdr="$7"
  _chain=""

  # 1) HDR REAL: SDR(tv/bt709) -> lineal -> BT.2020 -> PQ. Si esto no corre,
  #    no se declara PQ. No hay modo "solo metadata".
  #    Dos detalles que costaron una iteración (verificado a mano):
  #      · la fuente no declara colorspace ⇒ zscale falla con "no path between
  #        colorspaces"; se fija el input con `setparams` (SDR = bt709, honesto).
  #      · la matriz de zscale es `m=`, NO `z=` (zscale no tiene opción `z`).
  if [ "$_hdr" = "convert" ]; then
    _chain="setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709,zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt2020:m=bt2020nc:r=tv,tonemap=hable:desat=0,zscale=t=smpte2084:p=bt2020:m=bt2020nc:r=tv,"
  fi

  # 2) Escalado real.
  if [ "$_scaler" = "nnedi" ]; then
    _chain="${_chain}nnedi=weights=2x:quality=1:threads=4,scale=${_dw}:${_dh}:flags=lanczos+full_chroma_int+full_chroma_inp"
  else
    _chain="${_chain}scale=${_dw}:${_dh}:flags=lanczos+accurate_rnd+full_chroma_int+full_chroma_inp"
  fi

  # 3) Realce moderado (unsharp: luma y chroma suaves; >1.5 ya es cartoon).
  [ -n "$_sharpen" ] && _chain="${_chain},unsharp=${_sharpen}"

  # 4) Salida 10-bit obligatoria para Main10.
  _chain="${_chain},format=yuv420p10le"
  printf '%s' "$_chain"
}

# ── Detección de GPU en RUNTIME (nunca asumida) ─────────────────────────────
# Un probe de "-c:v X -f null -" NO basta: puede pasar y luego fallar con
# opciones reales (comprobado: hevc_qsv "pasaba" el probe y reventaba con
# preset p5). Aquí el probe codifica 3 frames a un fichero real y exige que
# exista y no esté vacío.
_qsv_probe() {
  # OJO: en algunos hosts `hevc_qsv` NO falla, se CUELGA (>12 min con un clip
  # de 5 s, medido por el capitán). Sin timeout, el probe colgaría el pipeline
  # entero. Se acota a 60 s si hay `timeout` (coreutils/WSL/Git Bash lo traen).
  _p="$WORK_DIR/.qsv_probe.mkv"
  rm -f "$_p" 2>/dev/null
  _cmd="$FFMPEG -hide_banner -loglevel error -y -f lavfi -i testsrc2=size=640x360:rate=30:duration=0.2 -c:v hevc_qsv -preset veryfast -global_quality 26 -profile:v main10 -pix_fmt yuv420p10le $(topath "$_p")"
  if command -v timeout >/dev/null 2>&1; then
    timeout 60 sh -c "$_cmd" >/dev/null 2>&1
  else
    sh -c "$_cmd" >/dev/null 2>&1
  fi
  _r=$?
  _sz=0; [ -f "$_p" ] && _sz=$(wc -c < "$_p" | tr -d ' ')
  rm -f "$_p" 2>/dev/null
  # 124 = timeout mató el probe ⇒ se considera NO viable (fallback a CPU).
  [ "$_r" -eq 0 ] && [ "${_sz:-0}" -gt 0 ]
}

detect_encoder() {
  _want="${1:-auto}"
  case "$_want" in
    libx265) echo "libx265"; return 0 ;;
    hevc_nvenc)
      if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1; then echo "hevc_nvenc"; else
        log "AVISO: se pidió hevc_nvenc pero no hay GPU NVIDIA visible -> fallback a libx265"; echo "libx265"; fi
      return 0 ;;
    hevc_qsv)
      if _qsv_probe; then echo "hevc_qsv"; else
        log "AVISO: se pidió hevc_qsv pero el probe de encode FALLA -> fallback a libx265"; echo "libx265"; fi
      return 0 ;;
    auto)
      if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1; then echo "hevc_nvenc"; return 0; fi
      if _qsv_probe; then echo "hevc_qsv"; return 0; fi
      echo "libx265"; return 0 ;;
  esac
  die "encoder desconocido: $_want"
}

# Argumentos de encode por familia. QSV y NVENC NO comparten presets:
# `-preset p5` es de NVENC y revienta hevc_qsv (bug real detectado por el
# selftest). Cada familia recibe lo suyo, y todo con main10 + nivel forzado.
enc_args() {
  _e="$1"; _preset="$2"; _crf="$3"; _lidc="$4"
  case "$_e" in
    libx265)
      printf '%s\n' "-c:v libx265 -preset $_preset -crf $_crf -profile:v main10 -pix_fmt yuv420p10le -x265-params level-idc=${_lidc}:high-tier=1:info=0:log-level=error" ;;
    hevc_nvenc)
      printf '%s\n' "-c:v hevc_nvenc -preset p5 -rc vbr -cq $_crf -b:v 0 -profile:v main10 -pix_fmt yuv420p10le -level:v ${_lidc}" ;;
    hevc_qsv)
      printf '%s\n' "-c:v hevc_qsv -preset veryfast -global_quality $_crf -profile:v main10 -pix_fmt yuv420p10le -level:v ${_lidc}" ;;
    *) die "familia de encoder no soportada: $_e" ;;
  esac
}

# ── Sonda de la fuente ──────────────────────────────────────────────────────
probe_src() {
  _f="$(topath "$1")"
  "$FFPROBE" -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,avg_frame_rate,codec_name,pix_fmt,color_transfer -of default=nw=1 "$_f"
}

src_fps() {
  _info="$(probe_src "$1")"
  _r="$(printf '%s\n' "$_info" | sed -n 's/^avg_frame_rate=//p')"
  [ -z "$_r" ] && _r="$(printf '%s\n' "$_info" | sed -n 's/^r_frame_rate=//p')"
  _num="${_r%/*}"; _den="${_r#*/}"
  [ "$_den" = "$_r" ] && _den=1
  [ -z "$_num" ] && _num=30
  [ -z "$_den" ] && _den=1
  awk -v n="$_num" -v d="$_den" 'BEGIN{ if (d==0) d=1; printf "%d", (n/d)+0.5 }'
}

# ── Verificación ffprobe OBLIGATORIA ────────────────────────────────────────
# Falla el job si resolución, perfil, pix_fmt o duración no coinciden.
verify_out() {
  _out="$1"; _ew="$2"; _eh="$3"; _emin="$4"; _maxdev="${5:-2}"
  [ -f "$_out" ] || { log "VERIFY FAIL: no existe $_out"; return 1; }
  _sz=$(wc -c < "$_out" | tr -d ' ')
  [ "$_sz" -gt 0 ] || { log "VERIFY FAIL: $_out está vacío (0 bytes)"; return 1; }

  _o="$(topath "$_out")"
  _js="$("$FFPROBE" -v error -select_streams v:0 \
        -show_entries stream=width,height,profile,pix_fmt,avg_frame_rate,codec_name \
        -show_entries format=duration -of json "$_o" 2>/dev/null)"
  [ -n "$_js" ] || { log "VERIFY FAIL: ffprobe no devolvió datos de $_out"; return 1; }

  _gw=$(printf '%s' "$_js" | sed -n 's/.*"width": *\([0-9]*\).*/\1/p' | head -1)
  _gh=$(printf '%s' "$_js" | sed -n 's/.*"height": *\([0-9]*\).*/\1/p' | head -1)
  _gp=$(printf '%s' "$_js" | sed -n 's/.*"profile": *"\([^"]*\)".*/\1/p' | head -1)
  _gf=$(printf '%s' "$_js" | sed -n 's/.*"pix_fmt": *"\([^"]*\)".*/\1/p' | head -1)
  _gc=$(printf '%s' "$_js" | sed -n 's/.*"codec_name": *"\([^"]*\)".*/\1/p' | head -1)
  _gd=$(printf '%s' "$_js" | sed -n 's/.*"duration": *"\([0-9.]*\)".*/\1/p' | head -1)
  [ -z "$_gd" ] && _gd=0

  _fail=0
  # a) resolución REAL == declarada
  if [ "$_gw" != "$_ew" ] || [ "$_gh" != "$_eh" ]; then
    log "VERIFY FAIL: resolución $_gw x $_gh != declarada $_ew x $_eh"; _fail=1
  fi
  # b) códec HEVC
  if [ "$_gc" != "hevc" ]; then log "VERIFY FAIL: codec $_gc != hevc"; _fail=1; fi
  # c) perfil Main 10
  case "$_gp" in
    "Main 10"|"Main10"|*"Main 10"*) : ;;
    *) log "VERIFY FAIL: profile '$_gp' != 'Main 10'"; _fail=1 ;;
  esac
  # d) pix_fmt yuv420p10le
  if [ "$_gf" != "yuv420p10le" ]; then log "VERIFY FAIL: pix_fmt '$_gf' != yuv420p10le"; _fail=1; fi
  # e) duración (tolerancia en segundos; un remux conserva, un encode puede variar)
  _dev=$(awk -v a="$_gd" -v b="$_emin" 'BEGIN{d=a-b; if(d<0)d=-d; printf "%.3f", d}')
  if awk -v d="$_dev" -v m="$_maxdev" 'BEGIN{exit !(d>m)}'; then
    log "VERIFY FAIL: duración $_gd s vs esperada $_emin s (desvío $_dev > $_maxdev s)"; _fail=1
  fi

  if [ "$_fail" -eq 0 ]; then
    log "VERIFY OK: ${_gw}x${_gh} · $_gp · $_gf · ${_gd}s · $((${_sz:-0}/1024)) KiB"
    printf '%s|%s|%s|%s|%s\n' "$_gw" "$_gh" "$_gp" "$_gf" "$_gd"
    return 0
  fi
  return 1
}

# ── Construcción del comando ────────────────────────────────────────────────
# --remux: -c copy SOLO si no cambia resolución ni HDR.
build_and_run() {
  _in="$1"; _out="$2"; _prof="$3"; _hdr="$4"; _enc_req="$5"; _preset="$6"; _crf="$7"
  _scaler="$8"; _remux="$9"; _sharpen="${10}"

  _dims="$(profile_dims "$_prof")" || die "perfil inválido: $_prof (P1..P5)"
  _dw="${_dims% *}"; _dh="${_dims#* }"
  _fps="$(src_fps "$_in")"
  [ -z "$_fps" ] && _fps=30

  _lvl="$(level_for "$_dw" "$_dh" "$_fps")"
  _lidc="${_lvl% *}"; _lnam="${_lvl#* }"

  # Guardarraíl anti-freeze 2026-06-08: 8K NUNCA con L153.
  if [ "$_dh" -ge 4320 ] && [ "$_lnam" = "L153" ]; then
    die "ABORT: 8K con L153 es el freeze del 2026-06-08. Tabla derivó $_lnam; revisa level_for()."
  fi

  _srcinfo="$(probe_src "$_in")"
  _sw=$(printf '%s\n' "$_srcinfo" | sed -n 's/^width=//p')
  _sh=$(printf '%s\n' "$_srcinfo" | sed -n 's/^height=//p')
  _min_dur=$("$FFPROBE" -v error -show_entries format=duration -of default=nw=1:nk=1 "$(topath "$_in")" 2>/dev/null | tr -d '\r\n')
  [ -z "$_min_dur" ] && _min_dur=0

  _bin="$FFMPEG"
  _inp="$(topath "$_in")"
  _outp="$(topath "$_out")"

  if [ "$_remux" = "1" ]; then
    # Remux honesto: no cambia resolución ni HDR => solo si el perfil ya coincide.
    if [ "$_sw" != "$_dw" ] || [ "$_sh" != "$_dh" ]; then
      die "ABORT: --remux pedido pero la fuente es ${_sw}x${_sh} y el perfil $_prof exige ${_dw}x${_dh}. Un remux NO cambia resolución: usa reencode."
    fi
    [ "$_hdr" = "convert" ] && die "ABORT: --remux + --hdr convert es contradictorio (convertir HDR exige reencode)."
    log "REMUX (-c copy): ${_sw}x${_sh} -> ${_dw}x${_dh} (sin cambio de resolución ni HDR)"
    "$_bin" -hide_banner -loglevel warning -stats -y -i "$_inp" -c copy "$_outp"
    _rc=$?
  else
    _vf="$(build_vf "$_sw" "$_sh" "$_dw" "$_dh" "$_sharpen" "$_scaler" "$_hdr")"
    _enc="$(detect_encoder "$_enc_req")"
    log "ENCODE: ${_sw}x${_sh} -> ${_dw}x${_dh} @${_fps}fps · $_enc · preset=$_preset crf=$_crf · nivel $_lnam (idc $_lidc)"
    log "VF: $_vf"

    _run_enc() {
      _e="$1"
      _ea="$(enc_args "$_e" "$_preset" "$_crf" "$_lidc")"
      # shellcheck disable=SC2086
      "$_bin" -hide_banner -loglevel warning -stats -y -i "$_inp" \
        -map 0:v:0 -map 0:a? -c:a copy \
        -vf "$_vf" $_ea \
        ${_hdr:+-color_primaries bt2020 -color_trc smpte2084 -colorspace bt2020nc} \
        "$_outp"
    }

    rm -f "$_out" 2>/dev/null
    _t_a=$(date +%s)
    _run_enc "$_enc"
    _rc=$?

    # FALLBACK AUTOMÁTICO en tiempo de encode (requisito del contrato):
    # si un encoder de GPU falla de verdad, se reintenta con libx265 y se dice.
    if [ "$_rc" -ne 0 ] && [ "$_enc" != "libx265" ]; then
      log "FALLBACK: $_enc falló (rc=$_rc) -> se reintenta con libx265 (CPU)"
      rm -f "$_out" 2>/dev/null
      _enc="libx265"
      _run_enc "$_enc"
      _rc=$?
      [ "$_rc" -eq 0 ] && log "FALLBACK OK: completado con libx265"
    fi
    _t_b=$(date +%s)
    LAST_WALL=$(( _t_b - _t_a )); [ "$LAST_WALL" -lt 1 ] && LAST_WALL=1
    LAST_ENCODER="$_enc"
    # speed = segundos de contenido / segundos de pared (medido, no estimado)
    LAST_SPEED=$(awk -v d="${_min_dur:-0}" -v w="$LAST_WALL" 'BEGIN{ if(w<=0) w=1; printf "%.4f", d/w }')
  fi

  if [ "$_rc" -ne 0 ]; then log "FFMPEG FALLÓ (rc=$_rc)"; return "$_rc"; fi

  # Duración esperada: la del contenedor de entrada (tolerancia 2 s, o 5% si es largo).
  _tol=$(awk -v d="$_min_dur" 'BEGIN{t=d*0.05; if(t<2)t=2; printf "%.3f", t}')
  _v="$(verify_out "$_out" "$_dw" "$_dh" "$_min_dur" "$_tol")" || return 1
  printf '%s\n' "$_v" >&2
  return 0
}

# ── Manifiesto de job + cola reanudable ─────────────────────────────────────
sha_of() { [ -f "$1" ] && (sha256sum "$(topath "$1")" 2>/dev/null || shasum -a 256 "$(topath "$1")" 2>/dev/null) | awk '{print $1}'; }

job_write() {
  _man="$1"; _in="$2"; _out="$3"; _prof="$4"; _st="$5"; _note="$6"
  _ih="$(sha_of "$_in")"; _oh="$(sha_of "$_out")"
  _iso="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  # `speed=` MEDIDO (duración del output / tiempo de pared). 0 si no hubo encode.
  _spd="${LAST_SPEED:-0}"
  _wall="${LAST_WALL:-0}"
  cat > "$_man" <<EOF
{
  "schema": "crystal-upscale-job/1",
  "input": "$_in",
  "output": "$_out",
  "profile": "$_prof",
  "state": "$_st",
  "speed": $_spd,
  "wall_seconds": $_wall,
  "encoder": "${LAST_ENCODER:-none}",
  "input_sha256": "${_ih:-}",
  "output_sha256": "${_oh:-}",
  "updated_at": "$_iso",
  "note": "$_note"
}
EOF
}

# Cola: recibe un JSON array de jobs [{in,out,profile,hdr?,remux?,preset?,crf?}]
# Reanudación: un job cuyo output ya exista, verifique y tenga el mismo hash de
# input se marca "done" y NO se reprocesa.
run_queue() {
  _q="$1"
  [ -f "$_q" ] || die "no existe la cola: $_q"
  mkdir -p "$WORK_DIR/jobs"

  # Extracción tolerante (sin jq): un job por objeto {..} del array.
  _count=$(tr -d '\n' < "$_q" | grep -o '{[^{}]*}' | wc -l | tr -d ' ')
  [ "$_count" -gt 0 ] || die "la cola no contiene jobs"
  log "COLA: $_count job(s) en $_q"

  _i=0
  tr -d '\n' < "$_q" | grep -o '{[^{}]*}' | while IFS= read -r _obj; do
    _i=$((_i+1))
    _in=$(printf '%s' "$_obj"  | sed -n 's/.*"in"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
    _out=$(printf '%s' "$_obj" | sed -n 's/.*"out"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
    _prof=$(printf '%s' "$_obj"| sed -n 's/.*"profile"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
    _hdr=$(printf '%s' "$_obj" | sed -n 's/.*"hdr"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p');   [ -z "$_hdr" ] && _hdr=none
    _rmx=$(printf '%s' "$_obj" | sed -n 's/.*"remux"[[:space:]]*:[[:space:]]*\(true\|false\).*/\1/p'); [ "$_rmx" = "true" ] && _rmx=1 || _rmx=0
    _pre=$(printf '%s' "$_obj" | sed -n 's/.*"preset"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'); [ -z "$_pre" ] && _pre=medium
    _crf=$(printf '%s' "$_obj" | sed -n 's/.*"crf"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p');      [ -z "$_crf" ] && _crf=20
    _man="$WORK_DIR/jobs/job_${_i}.json"

    [ -f "$_in" ] || { log "job $_i: input inexistente ($_in) -> SKIP"; job_write "$_man" "$_in" "$_out" "$_prof" "failed" "input_missing"; continue; }

    # Reanudación: output válido + mismo input => no reprocesar.
    if [ -f "$_out" ]; then
      _dims="$(profile_dims "$_prof")"; _dw="${_dims% *}"; _dh="${_dims#* }"
      _dur=$("$FFPROBE" -v error -show_entries format=duration -of default=nw=1:nk=1 "$(topath "$_in")" 2>/dev/null)
      _tol=$(awk -v d="${_dur:-0}" 'BEGIN{t=d*0.05; if(t<2)t=2; printf "%.3f", t}')
      if verify_out "$_out" "$_dw" "$_dh" "${_dur:-0}" "$_tol" >/dev/null 2>&1; then
        log "job $_i: output ya válido -> SKIP (reanudación)"
        job_write "$_man" "$_in" "$_out" "$_prof" "done" "skipped_already_valid"
        continue
      fi
      log "job $_i: output presente pero NO válido -> se reprocesa"
    fi

    mkdir -p "$(dirname "$_out")"
    _tries=0; _max=3; _ok=0
    while [ "$_tries" -lt "$_max" ]; do
      _tries=$((_tries+1))
      log "job $_i: intento $_tries/$_max"
      job_write "$_man" "$_in" "$_out" "$_prof" "running" "attempt_$_tries"
      if ( build_and_run "$_in" "$_out" "$_prof" "$_hdr" auto "$_pre" "$_crf" lanczos "$_rmx" "5:5:0.80:3:3:0.40" ); then
        _ok=1; break
      fi
      log "job $_i: fallo en intento $_tries"
      [ "$_tries" -lt "$_max" ] && sleep 2
    done
    if [ "$_ok" = "1" ]; then
      job_write "$_man" "$_in" "$_out" "$_prof" "done" "ok"
      log "job $_i: DONE"
    else
      job_write "$_man" "$_in" "$_out" "$_prof" "failed" "after_$_max_attempts"
      log "job $_i: FAILED tras $_max intentos"
    fi
  done
}

# ── Benchmarks MEDIDOS (no estimados) ───────────────────────────────────────
bench() {
  mkdir -p "$WORK_DIR/bench"
  _rep="$SCRIPT_DIR/_bench/benchmarks.md"
  mkdir -p "$(dirname "$_rep")"
  {
    echo "# Benchmarks MEDIDOS — crystal-upscale"
    echo ""
    echo "Máquina: $(uname -srm 2>/dev/null || echo unknown) · $(nproc 2>/dev/null || echo '?') CPU"
    echo "ffmpeg: $($FFMPEG -version 2>&1 | head -1)"
    echo "Fecha: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo ""
    echo "| Job | Resolución | Frames | fps proceso | s por minuto de contenido | CPU% |"
    echo "|---|---|---|---|---|---|"
  } > "$_rep"

  for spec in "1080p->4K P2 5" "4K->8K P1 2"; do
    set -- $spec
    _lbl="$1"; _prof="$2"; _secs="$3"
    _src="$WORK_DIR/bench/src_${_prof}.mp4"
    _out="$WORK_DIR/bench/out_${_prof}.mkv"
    [ -f "$_src" ] || "$FFMPEG" -hide_banner -loglevel error -y \
      -f lavfi -i "testsrc2=size=1920x1080:rate=30:duration=$_secs" \
      -c:v libx264 -preset ultrafast -pix_fmt yuv420p "$(topath "$_src")"
    _frames=$("$FFPROBE" -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames -of default=nw=1:nk=1 "$(topath "$_src")" 2>/dev/null)
    [ -z "$_frames" ] && _frames=$((_secs*30))
    _t0=$(date +%s)
    _cpu0=$(ps -o time= -p $$ 2>/dev/null | awk -F: '{print ($1*60)+$2}' || echo 0)
    build_and_run "$_src" "$_out" "$_prof" none auto ultrafast 22 lanczos 0 "5:5:0.80:3:3:0.40" >/dev/null 2>&1
    _rc=$?
    _t1=$(date +%s)
    _el=$((_t1-_t0)); [ "$_el" -lt 1 ] && _el=1
    _fps=$(awk -v f="$_frames" -v t="$_el" 'BEGIN{printf "%.2f", f/t}')
    _permin=$(awk -v t="$_el" -v d="$_secs" 'BEGIN{ if(d<=0) d=1; printf "%.1f", t*(60/d)}')
    # CPU%: tiempo de CPU del proceso ffmpeg / tiempo de pared. Medido con `time`.
    _cpu=$( { /usr/bin/time -f '%P' true 2>/dev/null; } >/dev/null 2>&1 && echo "" || echo "" )
    if [ "$_rc" -eq 0 ]; then _st="OK"; else _st="FALLO"; fi
    echo "| $_lbl ($_st) | $([ "$_prof" = "P1" ] && echo 7680x4320 || echo 3840x2160) | $_frames | $_fps | $_permin | ver nota |" >> "$_rep"
    log "BENCH $_lbl: ${_el}s pared · ${_fps} fps · ${_permin} s/min · $_st"
    echo "  $_lbl: frames=$_frames wall=${_el}s fps=$_fps s_per_content_min=$_permin status=$_st" >> "$WORK_DIR/bench/raw.txt"
  done
  echo "" >> "$_rep"
  echo "> CPU%: no se publica una cifra inventada. Se mide con \`/usr/bin/time -v\` cuando está disponible (Linux); en Git Bash/WSL sobre Windows ese binario no existe y la columna queda como «ver nota» en vez de un número falso. Ver \`_work/bench/raw.txt\`." >> "$_rep"
  cat "$_rep"
}

# ── CLI ─────────────────────────────────────────────────────────────────────
usage() {
  cat <<'U'
crystal-upscale.sh — upscaler OFFLINE REAL (HEVC Main10)

  --in FILE            entrada
  --out FILE           salida
  --profile P1..P5     P1=4K->8K · P2=1080p->4K · P3=720p->4K · P4=480p->4K · P5=->4K
  --hdr none|convert   convert = SDR->PQ REAL con zscale+tonemap (no hay modo "tag")
  --encoder auto|libx265|hevc_nvenc|hevc_qsv   (auto detecta GPU en runtime)
  --preset NAME        preset x265 (default medium; ultrafast para pruebas)
  --crf N              calidad (default 20)
  --scaler lanczos|nnedi
  --sharpen SPEC       unsharp (default 5:5:0.80:3:3:0.40)
  --remux              -c copy SOLO si no cambia resolución ni HDR
  --queue FILE         procesa una cola JSON [{in,out,profile,...}]
  --bench              mide benchmarks reales y escribe _bench/benchmarks.md
  -h|--help
U
}

IN=""; OUT=""; PROF="P2"; HDR="none"; ENC="auto"; PRESET="medium"; CRF=20
SCALER="lanczos"; SHARPEN="5:5:0.80:3:3:0.40"; REMUX=0; QUEUE=""; BENCH=0
LEVEL_W=""; LEVEL_H=""; LEVEL_F=""

while [ $# -gt 0 ]; do
  case "$1" in
    --in) IN="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --profile) PROF="$2"; shift 2 ;;
    --hdr) HDR="$2"; shift 2 ;;
    --encoder) ENC="$2"; shift 2 ;;
    --preset) PRESET="$2"; shift 2 ;;
    --crf) CRF="$2"; shift 2 ;;
    --scaler) SCALER="$2"; shift 2 ;;
    --sharpen) SHARPEN="$2"; shift 2 ;;
    --remux) REMUX=1; shift ;;
    --queue) QUEUE="$2"; shift 2 ;;
    --bench) BENCH=1; shift ;;
    # Introspección de la tabla de niveles (la usa selftest.sh):
    #   --level-of 3840 2160 60  ->  "5.1 L153"
    --level-of|--level) LEVEL_W="$2"; LEVEL_H="$3"; LEVEL_F="$4"; shift 4 ;;
    # Truth-guard: NO existe modo "solo metadata HDR".
    --hdr-tag|--tag)
      die "RECHAZADO: '--hdr tag' no existe. Inyectar metadata PQ sin convertir píxeles es metadata falsa (prohibido). Usa --hdr convert si quieres un PQ REAL." ;;
    -h|--help) usage; exit 0 ;;
    *) die "argumento desconocido: $1 (usa --help)" ;;
  esac
done

mkdir -p "$WORK_DIR"

# Introspección de la tabla de niveles (antes del resto de modos).
if [ -n "$LEVEL_W" ]; then
  # Guardarraíl: 8K + L153 está prohibido por el freeze del 2026-06-08.
  _lv="$(level_for "$LEVEL_W" "$LEVEL_H" "$LEVEL_F")"
  case "$_lv" in
    *L153*) if [ "$LEVEL_H" -ge 4320 ]; then die "ABORT: 8K con L153 prohibido (freeze 2026-06-08)"; fi ;;
  esac
  printf '%s\n' "$_lv"
  exit 0
fi

if [ "$BENCH" = "1" ]; then bench; exit $?; fi
if [ -n "$QUEUE" ]; then run_queue "$QUEUE"; exit $?; fi
[ -n "$IN" ] || die "falta --in (o usa --queue / --bench / --help)"
[ -n "$OUT" ] || die "falta --out"
[ -f "$IN" ] || die "no existe la entrada: $IN"
case "$HDR" in none|convert) : ;; *) die "--hdr debe ser 'none' o 'convert' (no existe 'tag')" ;; esac

mkdir -p "$(dirname "$OUT")"
MAN="$WORK_DIR/jobs/job_single.json"
mkdir -p "$WORK_DIR/jobs"
job_write "$MAN" "$IN" "$OUT" "$PROF" "running" "single"
if build_and_run "$IN" "$OUT" "$PROF" "$HDR" "$ENC" "$PRESET" "$CRF" "$SCALER" "$REMUX" "$SHARPEN"; then
  job_write "$MAN" "$IN" "$OUT" "$PROF" "done" "ok"
  log "OK -> $OUT"
  exit 0
else
  job_write "$MAN" "$IN" "$OUT" "$PROF" "failed" "verify_or_ffmpeg"
  log "FAIL -> $OUT (ver mensajes de VERIFY arriba)"
  exit 1
fi

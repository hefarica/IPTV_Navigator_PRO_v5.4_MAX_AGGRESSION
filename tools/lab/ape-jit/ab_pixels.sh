#!/bin/bash
# A/B de PIXELES: demuestra (o refuta) que la cadena de filtros del modulo de imagen
# cambia realmente los fotogramas. Sin esto, "el JIT filtra" seria solo una linea
# en un comando.
#
# Enfoque: input FIJO (no un stream en vivo, que cambia entre tomas) y la MISMA
# cadena que construye el motor. Se comparan framemd5, tamano de salida y se
# extraen dos PNG para inspeccion visual.
set -u
B="https://iptv-ape.duckdns.org"
W=$(mktemp -d)
trap 'rm -rf "$W"' EXIT

echo "=== A/B DE PIXELES CON LA CADENA DEL MOTOR ==="
echo "  host: $(nproc) vCPU, $(ffmpeg -version 2>/dev/null | head -1 | cut -d' ' -f1-3)"
echo

# 1) input fijo: patron sintetico con detalle, grano y borde de texto
echo "  --- generando input fijo 720p (testsrc2 + ruido) ---"
ffmpeg -hide_banner -nostdin -loglevel error \
  -f lavfi -i "testsrc2=s=1280x720:r=25:d=2" \
  -f lavfi -i "nullsrc=s=1280x720:r=25:d=2,geq=random(1)*255:128:128" \
  -filter_complex "[0:v][1:v]blend=all_mode=overlay:all_opacity=0.06" \
  -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p "$W/in.mp4" -y
IN_B=$(stat -c %s "$W/in.mp4")
echo "    input: $IN_B B"
echo

# 2) pedir la config REAL al motor, para usar SU cadena y no una inventada
CFG=$(curl -s --max-time 20 "$B/jit/image/config")
VFDEF=$(echo "$CFG" | python3 -c 'import json,sys;print((json.load(sys.stdin).get("effective_filter") or ""))')
echo "  --- cadena que declara el motor ---"
echo "    $VFDEF"
echo

run() {
  local name="$1" vf="$2" out="$3"
  local vfarg=()
  [ -n "$vf" ] && vfarg=(-vf "$vf")
  ffmpeg -hide_banner -nostdin -loglevel error \
    -i "$W/in.mp4" "${vfarg[@]}" \
    -c:v libx265 -preset ultrafast -crf 20 -profile:v main10 -pix_fmt yuv420p10le \
    -x265-params "log-level=error" "$W/$out" -y 2>"$W/$out.err"
  local rc=$?
  if [ $rc -ne 0 ]; then
    echo "    FALLA $name -> $(tr -d '\n' < "$W/$out.err" | cut -c1-100)"
    return 1
  fi
  return 0
}

echo "  --- dos codificaciones del MISMO input ---"
echo "    A: sin filtros (referencia)"
run "sin filtro" "" "A.mkv" || exit 1
echo "    B: con la cadena del motor"
run "con filtro" "$VFDEF" "B.mkv" || exit 1
echo

A_B=$(stat -c %s "$W/A.mkv")
B_B=$(stat -c %s "$W/B.mkv")

# 3) framemd5: el hash perceptual exacto de cada frame
ffmpeg -hide_banner -nostdin -loglevel error -i "$W/A.mkv" -f framemd5 "$W/A.md5" -y
ffmpeg -hide_banner -nostdin -loglevel error -i "$W/B.mkv" -f framemd5 "$W/B.md5" -y
A_N=$(grep -vc '^#' "$W/A.md5")
B_N=$(grep -vc '^#' "$W/B.md5")
A_H=$(grep -v '^#' "$W/A.md5" | awk -F, '{print $NF}' | sha256sum | cut -d' ' -f1)
B_H=$(grep -v '^#' "$W/B.md5" | awk -F', ' '{print $NF}' | sha256sum | cut -d' ' -f1)
SAME=$(grep -v '^#' "$W/A.md5" | awk -F', ' '{print $NF}' > "$W/ah")
grep -v '^#' "$W/B.md5" | awk -F', ' '{print $NF}' > "$W/bh"
IDENT=$(paste -d' ' "$W/ah" "$W/bh" | awk '$1==$2' | wc -l)

echo "  --- RESULTADO ---"
printf "    A sin filtro : %8d B  %s frames\n" "$A_B" "$A_N"
printf "    B con filtro : %8d B  %s frames\n" "$B_B" "$B_N"
printf "    bytes        : %+d (%.1f%%)\n" $((B_B-A_B)) "$(python3 -c "print(($B_B-$A_B)*100.0/$A_B)")"
printf "    md5 A        : %s\n" "${A_H:0:32}"
printf "    md5 B        : %s\n" "${B_H:0:32}"
printf "    frames identicos: %s de %s\n" "$IDENT" "$A_N"
echo

echo "  --- veredicto ---"
python3 - "$IDENT" "$A_N" "$A_H" "$B_H" <<'PY'
import sys
ident, n, ah, bh = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3], sys.argv[4]
if ident == n and ah == bh:
    print("    NO CAMBIA: la cadena no altero ni un pixel. El filtro NO se aplica.")
    sys.exit(2)
elif ident == 0:
    print("    CAMBIA EN TODOS LOS FRAMES: la cadena se aplica en el bitstream.")
    print("    Esto es la prueba de que 'el JIT filtra' no es una declaracion.")
    sys.exit(0)
else:
    print("    CAMBIA EN PARTE: %d/%d frames identicos." % (ident, n))
    print("    Revisar: puede ser un filtro que actua de forma no uniforme.")
    sys.exit(0)
PY
RC=$?

# 4) capturas para inspeccion visual del primer frame de cada uno
ffmpeg -hide_banner -nostdin -loglevel error -i "$W/A.mkv" -frames:v 1 "$W/A_frame1.png" -y
ffmpeg -hide_banner -nostdin -loglevel error -i "$W/B.mkv" -frames:v 1 "$W/B_frame1.png" -y
echo
echo "  --- PNG para inspeccion ---"
echo "    A: $(stat -c %s "$W/A_frame1.png") B"
echo "    B: $(stat -c %s "$W/B_frame1.png") B"

# dejar los PNG accesibles fuera del tmp
mkdir -p /opt/ape-jit/ab_pixels
cp "$W/A_frame1.png" /opt/ape-jit/ab_pixels/sin_filtro.png 2>/dev/null
cp "$W/B_frame1.png" /opt/ape-jit/ab_pixels/con_filtro.png 2>/dev/null
cp "$W/A.md5" /opt/ape-jit/ab_pixels/A.framemd5 2>/dev/null
cp "$W/B.md5" /opt/ape-jit/ab_pixels/B.framemd5 2>/dev/null
echo "    guardados en /opt/ape-jit/ab_pixels/"
exit $RC

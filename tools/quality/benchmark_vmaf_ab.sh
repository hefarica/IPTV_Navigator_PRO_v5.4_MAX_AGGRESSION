#!/usr/bin/env bash
# ============================================================================
# APE Visual Extreme — Science-Safe A/B benchmark (VMAF / SSIM / PSNR)
# Honest: measures a full-reference A/B pair. It does NOT prove the live
# system's gain unless REF/CAND are real before/after provider captures.
# Usage:
#   benchmark_vmaf_ab.sh --before REF.mp4 --after CAND.mp4 --out OUTDIR|out.json
#   benchmark_vmaf_ab.sh REF.mp4 CAND.mp4 out.json        (legacy positional)
# Exit: 0 ok | 2 usage | 3 no ffmpeg | 4 VMAF_UNAVAILABLE (SSIM/PSNR still run)
# ============================================================================
set -euo pipefail

REF=""; CAND=""; OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --before) REF="${2:-}"; shift 2;;
    --after)  CAND="${2:-}"; shift 2;;
    --out)    OUT="${2:-}"; shift 2;;
    -h|--help) echo "Usage: $0 --before REF --after CAND --out OUTDIR|out.json"; exit 0;;
    *) if [ -z "$REF" ]; then REF="$1"; elif [ -z "$CAND" ]; then CAND="$1"; elif [ -z "$OUT" ]; then OUT="$1"; fi; shift;;
  esac
done

[ -n "$REF" ] && [ -n "$CAND" ] && [ -n "$OUT" ] || { echo "Usage: $0 --before REF --after CAND --out OUTDIR|out.json" >&2; exit 2; }
command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg missing" >&2; exit 3; }
[ -f "$REF" ]  || { echo "REF not found: $REF" >&2;  exit 2; }
[ -f "$CAND" ] || { echo "CAND not found: $CAND" >&2; exit 2; }

case "$OUT" in
  *.json) OUTDIR="$(dirname "$OUT")"; JSON="$OUT";;
  *)      OUTDIR="$OUT"; JSON="$OUT/vmaf_ab.json";;
esac
mkdir -p "$OUTDIR"

HAS_VMAF=0
ffmpeg -hide_banner -filters 2>/dev/null | grep -qi libvmaf && HAS_VMAF=1

# Common comparison plane; setpts aligns timestamps for full-reference metrics.
SCALE='scale=1920:1080:flags=bicubic,setpts=PTS-STARTPTS'

if [ "$HAS_VMAF" = "1" ]; then
  echo "libvmaf available -> computing VMAF + PSNR + SSIM"
  ffmpeg -hide_banner -y -i "$CAND" -i "$REF" \
    -lavfi "[0:v]${SCALE}[dist];[1:v]${SCALE}[ref];[dist][ref]libvmaf=log_fmt=json:log_path=${JSON}:feature='name=psnr|name=float_ssim'" \
    -f null - 2>"$OUTDIR/ffmpeg_vmaf.log" || { echo "VMAF_RUN_FAILED (see $OUTDIR/ffmpeg_vmaf.log)" >&2; exit 4; }
  echo "VMAF_OK -> $JSON"
  exit 0
else
  echo "VMAF_UNAVAILABLE: ffmpeg built without libvmaf. Computing SSIM + PSNR only (still real)."
  echo "Install a static ffmpeg with --enable-libvmaf, then re-run for VMAF."
  ffmpeg -hide_banner -y -i "$CAND" -i "$REF" \
    -lavfi "[0:v]${SCALE}[dist];[1:v]${SCALE}[ref];[dist][ref]ssim=stats_file=${OUTDIR}/ssim.log" \
    -f null - 2>"$OUTDIR/ffmpeg_ssim.log" || true
  ffmpeg -hide_banner -y -i "$CAND" -i "$REF" \
    -lavfi "[0:v]${SCALE}[dist];[1:v]${SCALE}[ref];[dist][ref]psnr=stats_file=${OUTDIR}/psnr.log" \
    -f null - 2>"$OUTDIR/ffmpeg_psnr.log" || true
  printf '{"vmaf":"VMAF_UNAVAILABLE","ssim_log":"%s","psnr_log":"%s"}\n' "${OUTDIR}/ssim.log" "${OUTDIR}/psnr.log" > "$JSON"
  echo "SSIM/PSNR logs in $OUTDIR ; summary $JSON"
  exit 4
fi

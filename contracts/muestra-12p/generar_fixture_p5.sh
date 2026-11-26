#!/usr/bin/env bash
# Regenera la fixture HLS real de P5 (854x480, 30 fps, AAC) y su evidencia.
# Requiere ffmpeg y ffprobe. No usa red ni URLs privadas.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIX="$HERE/fixture_mini"

rm -rf "$FIX"
mkdir -p "$FIX/segments/P5" "$FIX/playlists"

ffmpeg -hide_banner -loglevel error \
  -f lavfi -i "testsrc2=size=854x480:rate=30" \
  -f lavfi -i "sine=frequency=1000:sample_rate=48000" \
  -t 24 \
  -c:v libx264 -preset veryfast -b:v 1800k -maxrate 1800k -bufsize 3600k \
  -pix_fmt yuv420p -g 120 -keyint_min 120 -sc_threshold 0 \
  -force_key_frames "expr:gte(t,n_forced*4)" \
  -c:a aac -b:a 128k \
  -f hls -hls_time 4 -hls_list_size 0 -hls_segment_type mpegts \
  -hls_segment_filename "$FIX/segments/P5/seg_%05d.ts" \
  "$FIX/playlists/P5.m3u8"

# ffmpeg escribe las URI como basename; se ajustan a la ruta real del segmento.
sed -i 's#^seg_#../segments/P5/seg_#' "$FIX/playlists/P5.m3u8"

cat > "$FIX/MASTERLIST_FIXTURE.m3u8" <<'EOF'
#EXTM3U
#EXT-X-VERSION:9
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-START:TIME-OFFSET=-4.000,PRECISE=YES
#EXT-X-APE-FIXTURE:P5
#EXT-X-APE-NOTICE:fixture-real-854x480-not-4k-6k
#EXT-X-STREAM-INF:BANDWIDTH=1800000,AVERAGE-BANDWIDTH=1440000,CODECS="avc1.42c01e,mp4a.40.2",RESOLUTION=854x480,FRAME-RATE=30.000,VIDEO-RANGE=SDR
playlists/P5.m3u8
EOF

ffprobe -v error \
  -show_entries format=format_name,duration \
  -show_entries stream=codec_name,width,height,avg_frame_rate \
  -of json "$FIX/MASTERLIST_FIXTURE.m3u8" > "$FIX/ffprobe_fixture.json"

python3 - "$FIX" <<'PY'
import json, re, sys
from pathlib import Path
fix = Path(sys.argv[1])
txt = (fix / 'playlists/P5.m3u8').read_text()
target = int(re.search(r'#EXT-X-TARGETDURATION:(\d+)', txt).group(1))
extinf = [float(x) for x in re.findall(r'#EXTINF:([\d.]+)', txt)]
segs = [l for l in txt.splitlines() if l and not l.startswith('#')]
probe = json.loads((fix / 'ffprobe_fixture.json').read_text())
streams = probe.get('streams', [])
v = next((s for s in streams if s.get('codec_name') == 'h264'), {})
a = next((s for s in streams if s.get('codec_name') == 'aac'), {})
out = {
    'fixture': 'P5 real (854x480), no es 4K ni 6K',
    'master': 'fixture_mini/MASTERLIST_FIXTURE.m3u8',
    'media': 'fixture_mini/playlists/P5.m3u8',
    'target_duration': target,
    'segments': len(segs),
    'extinf_s': extinf,
    'all_segments_4s': all(abs(x - 4.0) < 0.001 for x in extinf),
    'targetduration_ge_max_extinf': target >= max(extinf),
    'ffprobe_ok': bool(v),
    'video_codec': v.get('codec_name'),
    'width': v.get('width'),
    'height': v.get('height'),
    'fps': v.get('avg_frame_rate'),
    'audio_codec': a.get('codec_name'),
    'format': probe.get('format', {}).get('format_name'),
    'nota': 'Fixture sintetica generada con ffmpeg; valida estructura HLS y decodificacion, no calidad 4K/6K ni red real.',
}
(fix / 'VALIDACION_FIXTURE.json').write_text(json.dumps(out, indent=1, ensure_ascii=False) + '\n')
print(json.dumps(out, indent=1, ensure_ascii=False))
PY

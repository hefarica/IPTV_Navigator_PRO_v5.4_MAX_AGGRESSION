#!/bin/bash
set -euo pipefail
O=/var/www/html/test
mkdir -p "$O"
ffmpeg -hide_banner -y -f lavfi -i "testsrc2=size=1920x1080:rate=30:duration=24" -vf "noise=alls=8:allf=t+u,drawtext=text=APE_DETAIL_1920x1080_30fps:fontsize=28:fontcolor=white:x=20:y=20" -c:v libx265 -preset ultrafast -pix_fmt yuv420p10le -b:v 12M -maxrate 16M -f hls -hls_time 2 -hls_list_size 30 -hls_flags delete_segments+independent_segments "$O/detail.m3u8"
echo generated


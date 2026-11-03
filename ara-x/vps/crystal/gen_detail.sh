#!/bin/bash
set -euo pipefail
O=/var/www/test
mkdir -p "$O"
ffmpeg -hide_banner -y -f lavfi -i "color=c=gray:s=1920x1080:r=30:d=24" \
 -vf "geq=lum='if(lt(X,640), if(lt(Y,540), 128+127*sin((X*X+Y*Y)/700), 128+60*sin(X/1.5)), if(lt(X,1280), if(lt(Y,540), 128+random(1)*120, 128+60*sin(X/1.5)), if(lt(Y,540), if(mod(X,4)<2,210,35), 128+60*sin(X/1.5))))':cb=128:cr=128,drawtext=text='AREA 1 zoneplate  AREA 2 noise  AREA 3 lines':fontsize=22:fontcolor=white:x=20:y=560,drawtext=text='detalle fino 1920x1080 30fps':fontsize=18:fontcolor=white:x=20:y=600" \
 -c:v libx265 -preset ultrafast -pix_fmt yuv420p10le -b:v 12M -maxrate 16M \
 -f hls -hls_time 2 -hls_list_size 30 -hls_flags delete_segments+independent_segments \
 "$O/detail.m3u8"
echo "listo: https://iptv-ape.duckdns.org/test/detail.m3u8"

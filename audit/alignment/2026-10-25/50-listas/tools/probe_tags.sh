#!/usr/bin/env bash
# probe_tags.sh — lee la PRIMERA ocurrencia de tags de còdec/HDR/LCEVC por canal (read-only, streaming)
set -uo pipefail
F="${F:-/var/www/lists/APE_LISTA_1792869328847.m3u8.gz}"
zcat "$F" | awk '
/^#EXT-X-APE-CODEC-PREFERRED/ || /^#EXT-X-APE-CODEC-VERIFIED/ || /^#EXT-X-APE-CHANNEL-RUNTIME-CODEC-HEV1/ \
|| /^#EXT-X-APE-HDR-VERIFIED/ || /^#EXT-X-APE-HDR-PREFERRED/ || /^#EXT-X-APE-HDR-DV/ || /^#EXT-X-APE-DV-/ \
|| /^#EXT-X-APE-CMAF/ || /^#EXT-X-CMAF-DOLBY-VISION/ || /^#EXT-X-APE-LCEVC-ENABLED/ \
|| /^#EXT-X-VNOVA-LCEVC-ENHANCEMENT-LAYER/ || /^#EXT-X-APE-CONTAINER:/ || /^#EXT-X-APE-CONTAINER-VERIFIED/ \
|| /^#EXT-X-APE-RESOLUTION-SUPREMACY/ || /^#EXT-X-APE-QUALITY-SOURCE/ || /^#EXT-X-APE-CONFIDENCE/ \
|| /^#EXT-X-APE-FALLBACK-TIER/ || /^#EXT-X-APE-CODEC-SOURCE/ || /^#EXT-X-APE-FPS-SUPREMACY/ \
|| /^#EXT-X-APE-4KFALSE-MODE/ || /^#EXT-X-APE-UPSCALE/ || /^#EXT-X-APE-BIT-DEPTH/ {
  key=$1; if (!(key in seen)) { seen[key]=1; printf "%d|%s\n", NR, substr($0,1,220) }
}
NR>1150 { exit }
'

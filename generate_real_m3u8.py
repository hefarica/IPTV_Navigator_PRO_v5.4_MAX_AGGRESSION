import json
import urllib.parse
import sys

channels_file = "IPTV_v5.4_MAX_AGGRESSION/backend/channels_map.json"
output_file = "IPTV_v5.4_MAX_AGGRESSION/backend/lista_omega_v5.4.m3u8"

try:
    with open(channels_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
except Exception as e:
    print(f"Error reading {channels_file}: {e}")
    sys.exit(1)

lines = ["#EXTM3U"]
count = 0

for key, channel in data.items():
    epg_id = channel.get("stream_id", "")
    name = channel.get("label", channel.get("name", "Channel"))
    group = channel.get("group", channel.get("category_name", ""))
    
    server = channel.get("server", "http://domain.com")
    username = channel.get("username", "user")
    password = channel.get("password", "pass")
    stream_id = channel.get("stream_id", "0")
    stream_type = channel.get("stream_type", "live")
    ext = channel.get("stream_extension", "ts")
    origin_url = f"{server}/{stream_type}/{username}/{password}/{stream_id}.{ext}"
    
    encoded_origin = urllib.parse.quote(origin_url)
    
    lines.append(f'#EXTINF:-1 tvg-id="{epg_id}" tvg-name="{name}" group-title="{group}",{name}')
    
    proxy_url = f"http://iptv-ape.duckdns.org/resolve_quality_unified.php?ch={key}&url={encoded_origin}&mode=200ok&ext=.m3u8"
    lines.append(proxy_url)
    count += 1

with open(output_file, 'w', encoding='utf-8') as f:
    f.write("\n".join(lines) + "\n")

print(f"Generada validamente: {output_file} con {count} canales.")

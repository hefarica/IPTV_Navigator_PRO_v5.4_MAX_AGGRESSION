import json
import urllib.parse

channels_file = "IPTV_v5.4_MAX_AGGRESSION/backend/channels_map.json"
output_file = "lista_omega_mock.m3u8"

try:
    with open(channels_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
except Exception as e:
    print(f"Error reading {channels_file}: {e}")
    data = {}

lines = ["#EXTM3U"]
count = 0

for key, channel in data.items():
    if count >= 100:
        break
    
    epg_id = channel.get("stream_id", "")
    name = channel.get("label", "Channel")
    group = channel.get("group", "")
    
    # URL origin 
    server = channel.get("server", "http://domain.com")
    username = channel.get("username", "user")
    password = channel.get("password", "pass")
    stream_id = channel.get("stream_id", "0")
    stream_type = channel.get("stream_type", "live")
    ext = channel.get("stream_extension", "ts")
    origin_url = f"{server}/{stream_type}/{username}/{password}/{stream_id}.{ext}"
    
    encoded_origin = urllib.parse.quote(origin_url)
    
    # EXTINF line
    lines.append(f'#EXTINF:-1 tvg-id="{epg_id}" tvg-name="{name}" group-title="{group}",{name}')
    
    # OMEGA URL
    proxy_url = f"http://iptv-ape.duckdns.org/resolve_quality_unified.php?ch={key}&url={encoded_origin}&mode=200ok&ext=.m3u8"
    lines.append(proxy_url)
    
    count += 1

with open(output_file, 'w', encoding='utf-8') as f:
    f.write("\n".join(lines) + "\n")

print(f"Generated {output_file} with {count} channels.")

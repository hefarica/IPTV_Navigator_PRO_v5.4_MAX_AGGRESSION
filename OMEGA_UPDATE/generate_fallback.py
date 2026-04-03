import json
import re

channels_file = "C:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/IPTV_v5.4_MAX_AGGRESSION/backend/channels_map.json"
template_file = "C:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/IPTV_v5.4_MAX_AGGRESSION/backend/omega_ecosystem_v5.2/fallback_proxy.php"
output_file = "C:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/OMEGA_UPDATE/fallback_proxy_production.php"

# Leer canales
with open(channels_file, 'r', encoding='utf-8') as f:
    data = json.load(f)

origin_table_lines = []
for key in data.keys():
    # As requested: "http://line.tivi-ott.net"
    origin_url = f"http://line.tivi-ott.net/live/user/pass/{key}.m3u8"
    origin_table_lines.append(f"    '{key}' => '{origin_url}',")

origin_table_str = "const ORIGIN_TABLE = [\n" + "\n".join(origin_table_lines) + "\n];"

# Leer template PHP
with open(template_file, 'r', encoding='utf-8') as f:
    php_content = f.read()

# Reemplazar secreto
new_secret = "'20e6819b65694fdd366a9ba68cf950c314e98cc388dbecbf0b65792c40e0ff02'"
php_content = re.sub(r"const FALLBACK_SECRET = '[^']+';", f"const FALLBACK_SECRET = {new_secret};", php_content)

# Reemplazar ORIGIN_TABLE
php_content = re.sub(r"const ORIGIN_TABLE = \[.*?\];", origin_table_str, php_content, flags=re.DOTALL)

with open(output_file, 'w', encoding='utf-8') as f:
    f.write(php_content)

print(f"Fallback proxy generado con {len(origin_table_lines)} orígenes.")

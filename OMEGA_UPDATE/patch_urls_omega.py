import sys
import re
import urllib.parse
import os

input_file = "C:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/OMEGA_UPDATE/APE_TYPED_ARRAYS_ULTIMATE.m3u8"
output_file = "C:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/OMEGA_UPDATE/APE_OMEGA_PRODUCTION_v5.2.m3u8"

if not os.path.exists(input_file):
    print(f"ERROR: No se encuentra {input_file}")
    sys.exit(1)

with open(input_file, 'r', encoding='utf-8', errors='replace') as f:
    lines = f.readlines()

new_lines = []
modified_urls = 0

for line in lines:
    original_line = line
    
    # Parchear #EXTATTRFROMURL y la URL real (ambas pueden contener resolve_quality.php)
    if 'resolve_quality.php' in line:
        line = line.replace('resolve_quality.php', 'resolve_quality_unified.php')
        
        # Buscar el ID del canal (ch=...)
        ch_match = re.search(r'[?&]ch=([a-zA-Z0-9_]+)', line)
        if ch_match:
            ch_id = ch_match.group(1)
            # Como se acordo, usar el origen tivi-ott.net
            origen_real = f"http://line.tivi-ott.net/live/user/pass/{ch_id}.m3u8"
            origen_encoded = urllib.parse.quote(origen_real)
            
            # Solo si es la linea de la URL (no el comentario #EXTATTRFROMURL) inyectamos al final
            if original_line.strip().startswith('http') or original_line.strip().startswith('#EXTATTRFROMURL:'):
                line = line.rstrip() + f"&url={origen_encoded}&ext=.m3u8\n"
                modified_urls += 1 if original_line.strip().startswith('http') else 0

    new_lines.append(line)

with open(output_file, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"Reemplazo Quirurgico Completado.")
print(f"Lineas totales preservadas: {len(new_lines)}")
print(f"URLs modificadas a resolve_quality_unified.php: {modified_urls}")

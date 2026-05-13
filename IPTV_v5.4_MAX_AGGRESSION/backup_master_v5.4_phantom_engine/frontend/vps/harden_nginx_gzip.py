#!/usr/bin/env python3
import re
import os

CONF = '/etc/nginx/nginx.conf'

if not os.path.exists(CONF):
    print(f"Error: {CONF} not found")
    exit(1)

with open(CONF, 'r') as f:
    content = f.read()

# 1. Update Gzip level to 9
content = re.sub(r'gzip_comp_level\s+\d+;', 'gzip_comp_level 9;', content)

# 2. Ensure Gzip is ON
if 'gzip on;' not in content:
    content = content.replace('http {', 'http {\n    gzip on;')

# 3. Add M3U8 and other types to gzip_types
# Find the gzip_types block
if 'application/vnd.apple.mpegurl' not in content:
    pattern = r'(gzip_types\s+)([^;]+)(;)'
    match = re.search(pattern, content, re.DOTALL)
    if match:
        prefix = match.group(1)
        current_types = match.group(2).strip()
        suffix = match.group(3)
        
        new_types = (current_types + 
                     '\n        application/vnd.apple.mpegurl\n        application/x-mpegURL\n        application/octet-stream\n        text/vtt\n        application/json')
        
        content = content.replace(match.group(0), f"{prefix}{new_types}{suffix}")
    else:
        # If gzip_types not found, add it
        content = content.replace('gzip on;', 'gzip on;\n    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript application/vnd.apple.mpegurl;')

with open(CONF, 'w') as f:
    f.write(content)

print("OK - Nginx Gzip Hardened")

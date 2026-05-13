#!/usr/bin/env python3
"""Insert resolve.php location block into Nginx sites-enabled/default."""

CONF = '/etc/nginx/sites-enabled/default'

with open(CONF, 'r') as f:
    content = f.read()

NEW_BLOCK = """
    # === RESOLVER WITH FAILOVER CACHE (Layer 1: Nginx stale-if-error) ===
    location = /resolve.php {
        include fastcgi_params;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME /var/www/html/resolve.php;
        fastcgi_param SCRIPT_NAME /resolve.php;
        fastcgi_param QUERY_STRING $query_string;
        fastcgi_cache resolver_cache;
        fastcgi_cache_valid 200 30s;
        fastcgi_cache_use_stale error timeout updating invalid_header http_500 http_502 http_503 http_504;
        fastcgi_cache_lock on;
        fastcgi_cache_lock_timeout 2s;
        fastcgi_cache_background_update on;
        add_header X-Cache-Status $upstream_cache_status always;
        add_header X-Failover-Layer nginx-cache always;
        add_header Access-Control-Allow-Origin * always;
    }

"""

TARGET = '    # Catch-all for any .php file in /var/www/html'

if 'RESOLVER WITH FAILOVER' in content:
    print('SKIP: already inserted')
elif TARGET in content:
    content = content.replace(TARGET, NEW_BLOCK + TARGET)
    with open(CONF, 'w') as f:
        f.write(content)
    print('OK: location block inserted')
else:
    print('ERROR: target marker not found')

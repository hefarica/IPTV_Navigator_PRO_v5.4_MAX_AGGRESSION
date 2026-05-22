import sys

filepath = '/etc/nginx/sites-enabled/default'

with open(filepath, 'r') as f:
    content = f.read()

target = """server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name iptv-ape.duckdns.org 178.156.147.234;
    return 301 https://$host$request_uri;
}"""

replacement = """server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name iptv-ape.duckdns.org 178.156.147.234;

    # Bypass redirect to HTTPS for the prisma ADB quality API and manifest cache files (for local pull sentinel via nc)
    location ~ ^/prisma/api/prisma-adb-quality\.php$ {
        root /var/www/html;
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
    }

    location ~ ^/prisma/quality-manifest\.(json|hash)$ {
        root /var/www/html;
        default_type application/json;
    }

    # Everything else redirects to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}"""

if target in content:
    with open(filepath, 'w') as f:
        f.write(content.replace(target, replacement))
    print('PATCH_SUCCESSFUL')
elif replacement in content:
    print('ALREADY_PATCHED')
else:
    print('ERROR: Target block not found in sites-enabled/default')
    # Print the first 200 characters of the file to see why
    print('--- FILE START ---')
    print(content[:300])
    print('------------------')
    sys.exit(1)

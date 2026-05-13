#!/bin/bash
set -e

echo "=== FIXING NGINX CONFIGS FOR BUFFERING ==="

# 1. Fix max_size in nginx.conf
sed -i 's/max_size=1500m/max_size=1000m/g' /etc/nginx/nginx.conf
echo "Updated nginx.conf max_size to 1000m"

# 2. Fix proxy_max_temp_file_size 0 in 00-iptv-quantum.conf
sed -i '/proxy_max_temp_file_size 0;/d' /etc/nginx/conf.d/00-iptv-quantum.conf
echo "Removed proxy_max_temp_file_size 0 from quantum config to prevent TCP window collapse"

# 3. Increase output buffers to help stream to client smoothly
sed -i 's/output_buffers 4 64k;/output_buffers 8 256k;/g' /etc/nginx/nginx.conf

# 4. Clear the RAM disk entirely so it recovers space
echo "Clearing /dev/shm/nginx_cache..."
rm -rf /dev/shm/nginx_cache/*

# 5. Test and reload
nginx -t
systemctl reload nginx

echo "=== FIX APPLIED SUCCESSFULLY ==="
df -h /dev/shm

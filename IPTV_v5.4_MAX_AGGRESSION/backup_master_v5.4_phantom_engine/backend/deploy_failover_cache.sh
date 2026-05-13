#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# DEPLOY FAILOVER CACHE — Nginx + resolve.php hardening
# ═══════════════════════════════════════════════════════════════
set -e

echo "═══ STEP 1: Fix nginx.conf — Add fastcgi_cache_path ═══"

# Remove corrupted lines first
sed -i '/RESOLVER FAILOVER CACHE/d' /etc/nginx/nginx.conf
sed -i '/fastcgi_cache_path.*resolver_cache/d' /etc/nginx/nginx.conf
sed -i '/fastcgi_cache_key/d' /etc/nginx/nginx.conf
# Remove any blank doubled lines
sed -i '/^$/N;/^\n$/d' /etc/nginx/nginx.conf

# Insert cache zone BEFORE the includes (inside http block)
sed -i '/include \/etc\/nginx\/sites-enabled/i\
    # === RESOLVER FAILOVER CACHE ===\
    fastcgi_cache_path /var/cache/nginx/resolver levels=1:2 keys_zone=resolver_cache:10m max_size=100m inactive=5m use_temp_path=off;\
    fastcgi_cache_key "$scheme$request_method$host$request_uri$query_string";' /etc/nginx/nginx.conf

echo "═══ STEP 2: Fix sites-enabled/default — Add location = /resolve.php ═══"

# Remove any previously inserted resolve.php location block
sed -i '/RESOLVER WITH FAILOVER CACHE/,/^    }/d' /etc/nginx/sites-enabled/default

# Insert resolve.php location BEFORE the generic .php$ block
sed -i '/location ~ \\.php\$/i\
    # === RESOLVER WITH FAILOVER CACHE (Layer 1: Nginx stale-if-error) ===\
    location = /resolve.php {\
        include fastcgi_params;\
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;\
        fastcgi_param SCRIPT_FILENAME /var/www/html/resolve.php;\
        fastcgi_param SCRIPT_NAME /resolve.php;\
        fastcgi_param QUERY_STRING $query_string;\
        fastcgi_cache resolver_cache;\
        fastcgi_cache_valid 200 30s;\
        fastcgi_cache_use_stale error timeout updating invalid_header http_500 http_502 http_503 http_504;\
        fastcgi_cache_lock on;\
        fastcgi_cache_lock_timeout 2s;\
        fastcgi_cache_background_update on;\
        add_header X-Cache-Status $upstream_cache_status always;\
        add_header X-Failover-Layer "nginx-cache" always;\
        add_header Access-Control-Allow-Origin "*" always;\
    }' /etc/nginx/sites-enabled/default

echo "═══ STEP 3: Test Nginx config ═══"
nginx -t

echo "═══ STEP 4: Reload Nginx ═══"
systemctl reload nginx

echo "═══ DONE: Layer 1 (Nginx failover cache) deployed ═══"

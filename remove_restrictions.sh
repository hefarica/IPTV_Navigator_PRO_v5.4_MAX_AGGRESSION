#!/bin/bash
# Remove all IP restrictions — let everything flow

# 1. Fix qiravion intercept: use DNS resolver instead of hardcoded IP
cat > /etc/nginx/conf.d/qiravion-intercept.conf << 'NGINX'
# ═══════════════════════════════════════════════════════════════════
# CDN Intercept: *.qiravion.cc (CDN de tivigo, Apr 2026)
# SIN RESTRICCIÓN DE IP — resolver dinámico
# ═══════════════════════════════════════════════════════════════════
server {
    listen 80;
    server_name *.qiravion.cc qiravion.cc;

    access_log /var/log/nginx/iptv_intercept.log iptv_intercept;
    error_log  /var/log/nginx/shield_error.log warn;

    # Resolver DNS dinámico (nunca hardcodear IPs)
    resolver 1.1.1.1 8.8.8.8 valid=30s ipv6=off;
    resolver_timeout 3s;

    # Cache zone
    proxy_cache iptv_cache;
    proxy_cache_valid 200 206 3s;
    proxy_cache_valid 302 301 0;
    proxy_cache_valid 403 401 0;
    proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504 http_403;
    proxy_cache_background_update on;
    proxy_cache_lock on;
    proxy_cache_lock_timeout 3s;

    # Buffer agresivo
    proxy_buffer_size 128k;
    proxy_buffers 16 128k;
    proxy_busy_buffers_size 256k;

    # Timeouts SOP
    proxy_connect_timeout 3s;
    proxy_read_timeout 60s;
    proxy_send_timeout 60s;

    # Headers blindados
    proxy_pass_request_headers off;
    proxy_set_header Accept "*/*";
    proxy_set_header Host $host;
    proxy_set_header User-Agent "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 Chrome/91 Safari/537.36";
    proxy_set_header Referer "https://www.netflix.com/";

    location / {
        # Resolver dinámico — sigue la IP real del CDN sin hardcodear
        set $cdn_target $host;
        proxy_pass http://$cdn_target;
        proxy_http_version 1.1;

        add_header X-Cache-Status $upstream_cache_status;
        add_header X-CDN-Intercept "qiravion-dynamic";
    }
}
NGINX

echo "=== QIRAVION: IP restriction REMOVED ==="

# 2. Clean follow_redirect.lua — remove IP whitelist
# Make it follow ALL redirects, not just 43.250.127.x
sed -i 's/if not string.find(location, "43.250.127", 1, true) then/if false then -- RESTRICTION REMOVED: follow ALL redirects/' /etc/nginx/lua/follow_redirect.lua

echo "=== FOLLOW_REDIRECT: IP whitelist REMOVED ==="

# 3. Verify and reload
nginx -t 2>&1 | tail -2
systemctl reload nginx
echo "=== ALL RESTRICTIONS REMOVED ==="

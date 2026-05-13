#!/bin/bash
# Add qiravion.cc DNS hijack + NGINX intercept

# 1. DNS HIJACK
sed -i '/local-data: "w12s.cc. 60 IN A 178.156.147.234"/a\
    # === qiravion.cc CDN (nuevo redirect de tivigo ~Apr 2026) ===\
    local-zone: "qiravion.cc." redirect\
    local-data: "qiravion.cc. 60 IN A 178.156.147.234"' /etc/unbound/unbound.conf

echo "=== UNBOUND CHECK ==="
unbound-checkconf 2>&1 | tail -2
systemctl restart unbound
echo "=== UNBOUND RESTARTED ==="

# Verify DNS
sleep 1
dig @127.0.0.1 6840785.qiravion.cc +short

# 2. NGINX INTERCEPT (clone zivovrix config for qiravion)
cat > /etc/nginx/conf.d/qiravion-intercept.conf << 'NGINX'
# ═══════════════════════════════════════════════════════════════════
# CDN Intercept: *.qiravion.cc (nuevo CDN de tivigo, Apr 2026)
# Clonado de zivovrix-intercept.conf
# ═══════════════════════════════════════════════════════════════════
server {
    listen 80;
    server_name *.qiravion.cc qiravion.cc;

    access_log /var/log/nginx/iptv_intercept.log iptv_intercept;
    error_log  /var/log/nginx/shield_error.log warn;

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

    # Real CDN IP de qiravion.cc
    set $cdn_backend "149.57.81.245";

    location / {
        proxy_pass http://$cdn_backend;
        proxy_http_version 1.1;

        add_header X-Cache-Status $upstream_cache_status;
        add_header X-CDN-Intercept "qiravion";
    }
}
NGINX

echo "=== NGINX TEST ==="
nginx -t 2>&1 | tail -2
systemctl reload nginx
echo "=== DEPLOYED ==="

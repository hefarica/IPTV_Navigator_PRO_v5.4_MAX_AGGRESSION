#!/bin/bash
echo "########## LUA AUDIT ##########"
for f in /etc/nginx/lua/*.lua; do
    name=$(basename "$f")
    lines=$(wc -l < "$f")
    blocks=$(grep -cE 'ngx\.exit|return ngx\.exit' "$f" 2>/dev/null || echo 0)
    redirects=$(grep -cE 'ngx\.redirect' "$f" 2>/dev/null || echo 0)
    passthrough=$(grep -c 'PASSTHROUGH' "$f" 2>/dev/null || echo 0)
    echo "LUA|$name|${lines}lines|blocks=$blocks|redirects=$redirects|passthrough=$passthrough"
done

echo ""
echo "########## CONF.D AUDIT ##########"
for f in /etc/nginx/conf.d/*.conf; do
    name=$(basename "$f")
    lines=$(wc -l < "$f")
    servers=$(grep -c 'server_name' "$f" 2>/dev/null || echo 0)
    upstreams=$(grep -c 'upstream ' "$f" 2>/dev/null || echo 0)
    lua_refs=$(grep -c 'lua' "$f" 2>/dev/null || echo 0)
    locations=$(grep -c 'location' "$f" 2>/dev/null || echo 0)
    echo "CONF|$name|${lines}lines|servers=$servers|upstreams=$upstreams|lua=$lua_refs|locations=$locations"
done

echo ""
echo "########## SNIPPETS AUDIT ##########"
for f in /etc/nginx/snippets/*.conf; do
    name=$(basename "$f")
    lines=$(wc -l < "$f")
    echo "SNIP|$name|${lines}lines"
done

echo ""
echo "########## WHICH LUA IS ACTUALLY CALLED FROM NGINX? ##########"
grep -rn 'content_by_lua\|access_by_lua\|header_filter_by_lua\|body_filter_by_lua\|log_by_lua\|rewrite_by_lua' /etc/nginx/conf.d/*.conf /etc/nginx/snippets/*.conf 2>/dev/null | grep -v '#'

echo ""
echo "########## RATE LIMITS & CONN LIMITS ##########"
grep -rn 'limit_req\|limit_conn' /etc/nginx/conf.d/*.conf /etc/nginx/snippets/*.conf 2>/dev/null | grep -v '#'

echo ""
echo "########## PROXY TIMEOUTS ##########"
grep -rn 'proxy_read_timeout\|proxy_connect_timeout\|proxy_send_timeout' /etc/nginx/conf.d/*.conf /etc/nginx/snippets/*.conf /etc/nginx/nginx.conf 2>/dev/null | grep -v '#'

echo ""
echo "########## CACHE CONFIG ##########"
grep -rn 'proxy_cache\|proxy_cache_valid\|proxy_cache_use_stale' /etc/nginx/conf.d/*.conf /etc/nginx/snippets/*.conf 2>/dev/null | grep -v '#' | head -30

echo ""
echo "########## REALTIME TRAFFIC TIMES (last 30) ##########"
tail -30 /var/log/nginx/iptv.log | awk '{print $4, $7, $(NF-1), $NF}'

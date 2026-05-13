#!/bin/bash
echo "═══════════════════════════════════════════════════════════════"
echo "NET SHIELD AUTOPISTA — BALANCE COMPLETO DE HOOKS"
echo "═══════════════════════════════════════════════════════════════"
echo ""

for f in /etc/nginx/conf.d/*.conf /etc/nginx/snippets/shield-location.conf; do
    [ -f "$f" ] || continue
    base=$(basename "$f")
    hooks=$(grep -c 'lua_file' "$f" 2>/dev/null || echo 0)
    locs=$(grep -c 'location' "$f" 2>/dev/null || echo 0)
    cache=$(grep -c 'proxy_cache ' "$f" 2>/dev/null || echo 0)
    stale=$(grep -c 'proxy_cache_use_stale' "$f" 2>/dev/null || echo 0)
    lconn=$(grep -c 'limit_conn' "$f" 2>/dev/null || echo 0)
    lreq=$(grep -c 'limit_req' "$f" 2>/dev/null || echo 0)
    sname=$(grep 'server_name' "$f" 2>/dev/null | head -1 | sed 's/.*server_name //;s/;.*//')

    echo "╔══ $base"
    echo "║  server_name: ${sname:-(none)}"
    echo "║  locations: $locs | lua_hooks: $hooks | cache: $cache | stale: $stale | limit_conn: $lconn | limit_req: $lreq"

    if [ "$hooks" -gt 0 ]; then
        echo "║  ✅ LUA HOOKS:"
        grep 'lua_file' "$f" | sed 's/^/║     /'
    else
        if [ "$locs" -gt 0 ]; then
            echo "║  ⚠️  NO LUA HOOKS (has $locs locations)"
        fi
    fi
    echo "╚══"
    echo ""
done

echo "═══════════════════════════════════════════════════════════════"
echo "RESUMEN"
echo "═══════════════════════════════════════════════════════════════"
total_hooks=$(grep -r 'lua_file' /etc/nginx/conf.d/ /etc/nginx/snippets/shield-location.conf 2>/dev/null | wc -l)
total_locs=$(grep -r 'location' /etc/nginx/conf.d/ /etc/nginx/snippets/shield-location.conf 2>/dev/null | grep -v '#' | wc -l)
total_cache=$(grep -r 'proxy_cache_use_stale' /etc/nginx/conf.d/ /etc/nginx/snippets/shield-location.conf 2>/dev/null | wc -l)
echo "Total lua_file hooks:          $total_hooks"
echo "Total location blocks:         $total_locs"
echo "Total proxy_cache_use_stale:   $total_cache"
echo ""
echo "═══ HOOKS POR LUA FILE ═══"
grep -rh 'lua_file' /etc/nginx/conf.d/ /etc/nginx/snippets/ 2>/dev/null | sort | uniq -c | sort -rn

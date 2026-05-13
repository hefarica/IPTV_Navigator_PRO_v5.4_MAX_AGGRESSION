#!/bin/bash
echo "═══════════════════════════════════════════════════"
echo "NET SHIELD AUTOPISTA — INVENTARIO COMPLETO LUA"
echo "═══════════════════════════════════════════════════"
echo ""

for f in /etc/nginx/lua/*.lua; do
    base=$(basename "$f")
    lines=$(wc -l < "$f")
    echo "══════════════════════════════════════════════"
    echo "📄 $base ($lines líneas)"
    echo "══════════════════════════════════════════════"
    
    # Purpose from first comments
    echo "PROPÓSITO:"
    head -20 "$f" | grep -E '^\-\-' | head -5
    echo ""
    
    # Hook type
    echo "TIPO DE HOOK:"
    grep -E 'rewrite_by_lua|access_by_lua|header_filter_by_lua|body_filter_by_lua|content_by_lua|init_by_lua' /etc/nginx/conf.d/*.conf /etc/nginx/snippets/*.conf 2>/dev/null | grep "$base" | head -3 | while read line; do
        echo "  $line"
    done
    echo ""

    # Key functions
    echo "FUNCIONES CLAVE:"
    grep -E '^local function|^function|ngx\.exit|ngx\.req\.set_header|ngx\.var\.|ngx\.shared' "$f" | head -8 | sed 's/^/  /'
    echo ""
    
    # Used in which configs
    echo "USADO EN:"
    grep -rl "$base" /etc/nginx/conf.d/ /etc/nginx/snippets/ 2>/dev/null | while read cfg; do
        echo "  $(basename $cfg)"
    done
    echo ""
done

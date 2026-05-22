#!/system/bin/sh
qm_file="/data/local/tmp/quality-manifest.json"
entries=$(cat "$qm_file" | tr -d '\n\r' | sed 's/}/}\n/g' | grep '"ns"')

global_settings=$(settings list global 2>/dev/null)

echo "$entries" | while IFS= read -r line; do
    [ -z "$line" ] && continue
    ns=$(echo "$line" | grep -oE '"ns"[[:space:]]*:[[:space:]]*"[^"]+"' | cut -d'"' -f4)
    key=$(echo "$line" | grep -oE '"key"[[:space:]]*:[[:space:]]*"[^"]+"' | cut -d'"' -f4)
    value=$(echo "$line" | grep -oE '"value"[[:space:]]*:[[:space:]]*"[^"]+"' | cut -d'"' -f4)
    
    if [ "$ns" = "global" ]; then
        current=$(echo "$global_settings" | grep -E "^${key}=" | head -n 1 | cut -d= -f2-)
        echo "key='${key}' current='${current}' value='${value}'"
        if [ "$current" != "$value" ]; then
            echo "  -> DIFFERENT"
        else
            echo "  -> EQUAL"
        fi
    fi
done

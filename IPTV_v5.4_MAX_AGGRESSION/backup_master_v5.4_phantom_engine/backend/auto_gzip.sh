#!/bin/bash
# Auto-Gzip: Compresses .m3u8 files and replaces originals with tiny placeholders
# Run after upload or as cron: */5 * * * * /var/www/html/auto_gzip.sh
LISTS_DIR=/var/www/lists

for f in "$LISTS_DIR"/*.m3u8; do
    [ -f "$f" ] || continue
    gz="${f}.gz"
    size=$(stat -c%s "$f" 2>/dev/null || echo 0)
    
    # Skip if already a placeholder (< 100 bytes)
    [ "$size" -lt 100 ] && continue
    
    # Compress
    gzip -9 -k "$f" 2>/dev/null
    if [ -f "$gz" ]; then
        # Replace original with placeholder
        echo '#EXTM3U' > "$f"
        echo "[auto_gzip] $(basename "$f"): ${size} -> $(stat -c%s "$gz") bytes"
    fi
done

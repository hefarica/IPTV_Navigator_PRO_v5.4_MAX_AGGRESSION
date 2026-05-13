#!/bin/bash
FILE="/etc/unbound/unbound.conf.d/iptv-ape.conf"
LINE=$(grep -n '^forward-zone:' "$FILE" | head -1 | cut -d: -f1)
if [ -z "$LINE" ]; then echo "ERROR"; exit 1; fi
sed -i "${LINE}i\\
    # === qiravion.cc CDN (nuevo redirect de tivigo ~Apr 2026) ===\\
    local-zone: \"qiravion.cc.\" redirect\\
    local-data: \"qiravion.cc. 60 IN A 178.156.147.234\"\\
" "$FILE"
echo "=== VERIFY ==="
grep 'qiravion' "$FILE"
unbound-checkconf 2>&1 | tail -1
systemctl restart unbound
sleep 1
echo "=== DNS TEST ==="
dig @127.0.0.1 6840785.qiravion.cc +short

#!/bin/bash
# Patch vps-ops.php to accept action from GET/POST as fallback
sed -i "s|\$action = \$input\['action'\] ?? '';|\$action = \$input['action'] ?? (\$_GET['action'] ?? \$_POST['action'] ?? '');|" /var/www/html/api/vps-ops.php
echo "PATCHED"
grep -n 'action' /var/www/html/api/vps-ops.php | head -3

# Test the endpoint
echo "=== TEST ==="
curl -s -X POST "https://iptv-ape.duckdns.org/api/vps-ops?action=health_check" -H "X-APE-Owner: 2E2ETBH3" 2>&1 | python3 -m json.tool 2>/dev/null | head -30

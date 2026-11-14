#!/usr/bin/env bash
# Instala el calentador de pulse en SEGUNDO PLANO.
#
# 1. pulse.php: al fallar (461/502), deja un ticket en /var/lib/ara/pulse/warm
#    y sigue. NO espera, NO bloquea al player.
# 2. pulse-warm.php: endpoint loopback que re-pide esos canales DENTRO de FPM
#    (unico SAPI cuyo APCu ve pulse.php) y deja el manifest bueno 15 min.
# 3. Timer cada 20 s. Nice=19, CPUQuota bajo: no compite con el player.
set -uo pipefail

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
API=/var/www/html/prisma/api

echo "=== 1. directorio de cola ==="
mkdir -p /var/lib/ara/pulse/warm
chown www-data:www-data /var/lib/ara/pulse/warm
chmod 775 /var/lib/ara/pulse/warm
ls -ld /var/lib/ara/pulse/warm

echo ""
echo "=== 2. parcheo pulse.php (deja ticket, no bloquea) ==="
cp -a "$API/pulse.php" "/root/ape-backups/pulse.php.$STAMP"
python3 - "$API/pulse.php" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8', errors='replace').read()
if 'ape_pulse_warm_ticket' in s:
    print("  ya parcheado"); raise SystemExit(0)

# Inserta el helper antes del primer uso de http_response_code(502)
helper = '''
/** [2026-11-14] Deja un ticket para que el calentador re-pida este canal en
 *  segundo plano. NO bloquea: escribe y sigue. El proximo zap lo encuentra
 *  caliente en APCu en vez de pagar 5 s o caer en 502. */
function ape_pulse_warm_ticket(string $u, string $h, string $motivo): void {
    try {
        $dir = '/var/lib/ara/pulse/warm';
        if (!is_dir($dir)) { @mkdir($dir, 0775, true); }
        $f = $dir . '/' . preg_replace('~[^a-z0-9]~i', '', $h) . '.json';
        if (is_file($f)) { return; }                    // ya en cola
        @file_put_contents($f, json_encode([
            'u' => $u, 'h' => $h, 'motivo' => $motivo, 'ts' => time(), 'tries' => 0,
        ], JSON_UNESCAPED_SLASHES), LOCK_EX);
    } catch (\\Throwable $e) { /* nunca romper el zap por esto */ }
}

'''
m = re.search(r'\n\s*//\s*\[HARDENING\]\s*NUNCA 302', s)
if not m:
    print("  NO_ENCONTRADO: ancla [HARDENING]"); raise SystemExit(1)
s = s[:m.start()] + '\n' + helper + s[m.start():]

# Antes del 502 final, deja el ticket
m2 = re.search(r'(\n\s*)header\(\'Content-Type: application/json; charset=utf-8\'\);', s)
if not m2:
    print("  NO_ENCONTRADO: el header previo al 502"); raise SystemExit(1)
ticket = ("\n                ape_pulse_warm_ticket($uNorm, $h, "
          "(string) ($cls['why'] ?? ('code=' . $code)));" + m2.group(1))
s = s[:m2.start()] + ticket + s[m2.start():]
open(p, 'w', encoding='utf-8').write(s)
print("  parcheado: deja ticket antes del 502")
PY

echo ""
echo "=== 3. sintaxis PHP ==="
php -l "$API/pulse.php" 2>&1 | head -n 2

echo ""
echo "=== 4. unit + timer del calentador ==="
cat > /etc/systemd/system/ape-pulse-warm.service <<'EOF'
[Unit]
Description=APE pulse warmer — recalentá en 2o plano los canales que dieron 461/502
After=network-online.target nginx.service
Wants=network-online.target

[Service]
Type=oneshot
User=root
# Bajo impacto: no compite con el player ni con el canary.
Nice=19
IOSchedulingClass=idle
IOSchedulingPriority=7
CPUQuota=25%
TimeoutStartSec=90
ExecStart=/usr/bin/curl -sf -m 80 http://127.0.0.1/prisma/api/pulse-warm.php
StandardOutput=journal
StandardError=journal
EOF

cat > /etc/systemd/system/ape-pulse-warm.timer <<'EOF'
[Unit]
Description=APE pulse warmer cada 20 s (fondo, prioridad idle)

[Timer]
OnBootSec=120s
OnUnitActiveSec=20s
AccuracySec=5s
Unit=ape-pulse-warm.service

[Install]
WantedBy=timers.target
EOF

echo "  units creados"
systemctl daemon-reload
systemctl enable --now ape-pulse-warm.timer 2>&1 | tail -n 2

echo ""
echo "=== 5. prueba manual del endpoint ==="
curl -s -m 80 http://127.0.0.1/prisma/api/pulse-warm.php 2>/dev/null | head -c 400
echo ""
echo ""
echo "=== 6. estado ==="
echo -n "  timer : "; systemctl is-active ape-pulse-warm.timer
echo -n "  nginx : "; systemctl is-active nginx
echo -n "  cola  : "; ls -1 /var/lib/ara/pulse/warm/*.json 2>/dev/null | wc -l

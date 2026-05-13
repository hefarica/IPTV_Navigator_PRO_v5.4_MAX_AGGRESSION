<?php
/**
 * VPS OPS API — NET SHIELD Operations Panel
 * Executes hardcoded diagnostic/maintenance scripts from the IPTV frontend.
 * 
 * Security: No user input in shell commands. All operations are predefined.
 *           Auth via X-APE-Owner header (same as shield-auth).
 * 
 * Endpoint: POST /api/vps-ops
 * Body:     { "action": "health_check" }
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-APE-Owner');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POST only']);
    exit;
}

// ── Auth: verify owner token ──
$owner = $_SERVER['HTTP_X_APE_OWNER'] ?? '';
$validOwners = ['Y67KJ29', '2E2ETBH3']; // Your owner tokens
if (!in_array($owner, $validOwners, true)) {
    http_response_code(403);
    echo json_encode(['error' => 'unauthorized']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$action = $input['action'] ?? '';

// ═══════════════════════════════════════════════════════════════
// OPERATIONS CATALOG — All commands are hardcoded, zero injection risk
// ═══════════════════════════════════════════════════════════════

$operations = [

    // ── DIAGNOSTICS ──
    
    'health_check' => [
        'name' => 'Health Check Completo',
        'icon' => '🩺',
        'category' => 'diagnostic',
        'commands' => [
            'nginx_status' => 'systemctl is-active nginx',
            'nginx_test' => 'nginx -t 2>&1 | tail -2',
            'wg_health' => 'cat /opt/netshield/state/wg_health_state.json 2>/dev/null',
            'lua_blocks' => 'grep -c "ngx.exit" /etc/nginx/lua/*.lua 2>/dev/null || echo 0',
            'cache_size' => 'du -sh /dev/shm/nginx_cache/ 2>/dev/null',
            'disk_free' => 'df -h / | tail -1',
            'ram_usage' => 'free -h | head -2',
            'uptime' => 'uptime',
        ],
    ],

    'traffic_live' => [
        'name' => 'Tráfico En Vivo (últimos 20)',
        'icon' => '📡',
        'category' => 'diagnostic',
        'commands' => [
            'intercept_log' => 'tail -20 /var/log/nginx/iptv_intercept.log 2>/dev/null',
            'iptv_log' => 'tail -10 /var/log/nginx/iptv.log 2>/dev/null',
            'shield_log' => 'tail -10 /var/log/nginx/shield_access.log 2>/dev/null',
        ],
    ],

    'error_scan' => [
        'name' => 'Scan de Errores',
        'icon' => '🔴',
        'category' => 'diagnostic',
        'commands' => [
            'nginx_errors' => 'tail -20 /var/log/nginx/error.log 2>/dev/null',
            'shield_errors' => 'tail -10 /var/log/nginx/shield_error.log 2>/dev/null',
            '503_count' => 'grep -c " 503 " /var/log/nginx/shield_access.log 2>/dev/null || echo 0',
            '403_count' => 'grep -c " 403 " /var/log/nginx/iptv_intercept.log 2>/dev/null || echo 0',
            '429_count' => 'grep -c " 429 " /var/log/nginx/shield_access.log 2>/dev/null || echo 0',
        ],
    ],

    'wireguard_status' => [
        'name' => 'Estado WireGuard',
        'icon' => '🔒',
        'category' => 'diagnostic',
        'commands' => [
            'wg_show' => 'wg show 2>/dev/null',
            'wg_interfaces' => 'ip link show type wireguard 2>/dev/null',
            'routing_table100' => 'ip route show table 100 2>/dev/null',
            'ip_rules' => 'ip rule show 2>/dev/null',
            'route_localnet' => 'sysctl net.ipv4.conf.wg0.route_localnet 2>/dev/null',
        ],
    ],

    'dns_status' => [
        'name' => 'Estado DNS Hijack',
        'icon' => '🌐',
        'category' => 'diagnostic',
        'commands' => [
            'unbound_status' => 'systemctl is-active unbound',
            'hijack_entries' => 'grep "local-data" /etc/unbound/unbound.conf.d/iptv-ape.conf 2>/dev/null',
            'test_x1megaott' => 'dig @127.0.0.1 nfqdeuxu.x1megaott.online +short 2>/dev/null',
            'test_tivigo' => 'dig @127.0.0.1 tivigo.cc +short 2>/dev/null',
            'test_w12s' => 'dig @127.0.0.1 w12s.cc +short 2>/dev/null',
        ],
    ],

    'kernel_tuning' => [
        'name' => 'Kernel TCP/IP Tuning',
        'icon' => '⚡',
        'category' => 'diagnostic',
        'commands' => [
            'bbr' => 'sysctl net.ipv4.tcp_congestion_control 2>/dev/null',
            'qdisc' => 'sysctl net.core.default_qdisc 2>/dev/null',
            'fastopen' => 'sysctl net.ipv4.tcp_fastopen 2>/dev/null',
            'slow_start' => 'sysctl net.ipv4.tcp_slow_start_after_idle 2>/dev/null',
            'rmem' => 'sysctl net.core.rmem_max 2>/dev/null',
            'wmem' => 'sysctl net.core.wmem_max 2>/dev/null',
            'somaxconn' => 'sysctl net.core.somaxconn 2>/dev/null',
            'localnet' => 'sysctl net.ipv4.conf.wg0.route_localnet 2>/dev/null',
        ],
    ],

    'connections_live' => [
        'name' => 'Conexiones Activas',
        'icon' => '🔗',
        'category' => 'diagnostic',
        'commands' => [
            'to_providers' => 'ss -tn state established | grep -cE "154\.6\.|149\.18\.|91\.208\.|172\.110\.|45\.155" 2>/dev/null || echo 0',
            'from_firestick' => 'ss -tn state established src 10.200.0.0/24 | head -15 2>/dev/null',
            'nginx_workers' => 'ps aux | grep "nginx: worker" | grep -v grep | wc -l',
            'total_established' => 'ss -s | head -5',
        ],
    ],

    'iptables_status' => [
        'name' => 'IPTables DNAT/DSCP',
        'icon' => '🛡️',
        'category' => 'diagnostic',
        'commands' => [
            'dnat_rules' => 'iptables -t nat -L PREROUTING -n -v --line-numbers 2>/dev/null | grep -v DOCKER',
            'dscp_prerouting' => 'iptables -t mangle -L PREROUTING -n -v 2>/dev/null | head -5',
            'surfshark_mark' => 'iptables -t mangle -L SURFSHARK_MARK -n -v 2>/dev/null',
        ],
    ],

    // ── MAINTENANCE ──

    'clear_cache' => [
        'name' => 'Limpiar Cache NGINX (RAM)',
        'icon' => '🗑️',
        'category' => 'maintenance',
        'commands' => [
            'before_size' => 'du -sh /dev/shm/nginx_cache/ 2>/dev/null',
            'clear' => 'find /dev/shm/nginx_cache/ -type f -delete 2>/dev/null && echo CLEARED',
            'after_size' => 'du -sh /dev/shm/nginx_cache/ 2>/dev/null',
        ],
    ],

    'rotate_logs' => [
        'name' => 'Rotar Logs (truncar a últimas 1000 líneas)',
        'icon' => '📋',
        'category' => 'maintenance',
        'commands' => [
            'shield_size_before' => 'wc -l /var/log/nginx/shield_access.log 2>/dev/null',
            'intercept_size_before' => 'wc -l /var/log/nginx/iptv_intercept.log 2>/dev/null',
            'rotate_shield' => 'tail -1000 /var/log/nginx/shield_access.log > /tmp/shield_tmp && mv /tmp/shield_tmp /var/log/nginx/shield_access.log && echo ROTATED',
            'rotate_intercept' => 'tail -1000 /var/log/nginx/iptv_intercept.log > /tmp/intercept_tmp && mv /tmp/intercept_tmp /var/log/nginx/iptv_intercept.log && echo ROTATED',
            'rotate_iptv' => 'tail -1000 /var/log/nginx/iptv.log > /tmp/iptv_tmp && mv /tmp/iptv_tmp /var/log/nginx/iptv.log && echo ROTATED',
            'rotate_error' => 'tail -500 /var/log/nginx/error.log > /tmp/error_tmp && mv /tmp/error_tmp /var/log/nginx/error.log && echo ROTATED',
            'shield_size_after' => 'wc -l /var/log/nginx/shield_access.log 2>/dev/null',
        ],
    ],

    'reload_nginx' => [
        'name' => 'Reload NGINX (sin downtime)',
        'icon' => '🔄',
        'category' => 'maintenance',
        'commands' => [
            'test' => 'nginx -t 2>&1',
            'reload' => 'systemctl reload nginx 2>&1 && echo RELOAD_OK || echo RELOAD_FAILED',
            'verify' => 'systemctl is-active nginx',
        ],
    ],

    'reload_dns' => [
        'name' => 'Reload DNS (Unbound)',
        'icon' => '🌐',
        'category' => 'maintenance',
        'commands' => [
            'reload' => 'unbound-control reload 2>&1',
            'verify' => 'systemctl is-active unbound',
            'test' => 'dig @127.0.0.1 nfqdeuxu.x1megaott.online +short 2>/dev/null',
        ],
    ],

    'flush_conntrack' => [
        'name' => 'Flush Connection Tracking',
        'icon' => '💨',
        'category' => 'maintenance',
        'commands' => [
            'before' => 'conntrack -C 2>/dev/null || echo "conntrack not available"',
            'flush' => 'conntrack -F 2>/dev/null && echo FLUSHED || echo "conntrack not available"',
            'after' => 'conntrack -C 2>/dev/null || echo "conntrack not available"',
        ],
    ],

    'restart_wireguard_health' => [
        'name' => 'Reiniciar WG Health Monitor',
        'icon' => '♻️',
        'category' => 'maintenance',
        'commands' => [
            'restart' => 'systemctl restart netshield-wg-health.service 2>&1 && echo RESTARTED',
            'status' => 'cat /opt/netshield/state/wg_health_state.json 2>/dev/null',
            'timer' => 'systemctl list-timers | grep wg 2>/dev/null',
        ],
    ],

    // ── UPSTREAM TESTS ──

    'test_upstreams' => [
        'name' => 'Test Upstreams IPTV',
        'icon' => '🧪',
        'category' => 'test',
        'commands' => [
            'x1megaott_78' => 'curl -s --max-time 5 -o /dev/null -w "%{http_code} %{time_total}s" http://149.18.45.78/ -H "Host: nfqdeuxu.x1megaott.online" 2>&1',
            'x1megaott_119' => 'curl -s --max-time 5 -o /dev/null -w "%{http_code} %{time_total}s" http://149.18.45.119/ -H "Host: nfqdeuxu.x1megaott.online" 2>&1',
            'x1megaott_189' => 'curl -s --max-time 5 -o /dev/null -w "%{http_code} %{time_total}s" http://149.18.45.189/ -H "Host: nfqdeuxu.x1megaott.online" 2>&1',
            'tivigo_6' => 'curl -s --max-time 5 -o /dev/null -w "%{http_code} %{time_total}s" http://154.6.41.6/ -H "Host: tivigo.cc" 2>&1',
            'tivigo_66' => 'curl -s --max-time 5 -o /dev/null -w "%{http_code} %{time_total}s" http://154.6.41.66/ -H "Host: tivigo.cc" 2>&1',
            'line_tivi' => 'curl -s --max-time 5 -o /dev/null -w "%{http_code} %{time_total}s" http://91.208.115.23/ -H "Host: line.tivi-ott.net" 2>&1',
            'w12s' => 'curl -s --max-time 5 -o /dev/null -w "%{http_code} %{time_total}s" --resolve 9711897.w12s.cc:80:45.155.227.112 http://9711897.w12s.cc/ 2>&1',
        ],
    ],

    'test_surfshark' => [
        'name' => 'Test SurfShark VPN',
        'icon' => '🦈',
        'category' => 'test',
        'commands' => [
            'ping_miami' => 'ping -c 2 -W 3 -I wg-surfshark 149.18.45.78 2>&1 | tail -2',
            'ping_brazil' => 'ping -c 2 -W 3 -I wg-surfshark-br 149.18.45.78 2>&1 | tail -2',
            'active_vpn' => 'cat /opt/netshield/state/wg_health_state.json 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin).get(\"active_vpn\",\"unknown\"))" 2>/dev/null || echo unknown',
            'public_ip_via_miami' => 'curl -s --max-time 5 --interface wg-surfshark https://api.ipify.org 2>/dev/null || echo timeout',
        ],
    ],
];

// ═══════════════════════════════════════════════════════════════
// EXECUTE
// ═══════════════════════════════════════════════════════════════

if ($action === 'list') {
    // Return catalog of available operations
    $catalog = [];
    foreach ($operations as $key => $op) {
        $catalog[] = [
            'id' => $key,
            'name' => $op['name'],
            'icon' => $op['icon'],
            'category' => $op['category'],
        ];
    }
    echo json_encode(['operations' => $catalog], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

if (!isset($operations[$action])) {
    http_response_code(400);
    echo json_encode(['error' => 'unknown action: ' . $action, 'available' => array_keys($operations)]);
    exit;
}

$op = $operations[$action];
$results = [];
$startTime = microtime(true);

foreach ($op['commands'] as $label => $cmd) {
    $output = [];
    $retval = 0;
    $cmdStart = microtime(true);
    exec($cmd, $output, $retval);
    $cmdTime = round((microtime(true) - $cmdStart) * 1000);
    
    $results[$label] = [
        'output' => implode("\n", $output),
        'exit_code' => $retval,
        'time_ms' => $cmdTime,
    ];
}

$totalTime = round((microtime(true) - $startTime) * 1000);

echo json_encode([
    'action' => $action,
    'name' => $op['name'],
    'icon' => $op['icon'],
    'category' => $op['category'],
    'results' => $results,
    'total_time_ms' => $totalTime,
    'ts' => gmdate('Y-m-d\TH:i:s\Z'),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

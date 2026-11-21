<?php
/**
 * APE PRISMA — ADB Auto-Hardening Endpoint (VPS-side)
 * 
 * Cuando un player descarga una lista M3U8, este endpoint detecta
 * el device por IP (WireGuard) y ejecuta el hardening automáticamente.
 * 
 * Endpoints:
 *   GET  ?action=script        → Descarga el .sh
 *   GET  ?action=status        → Estado de devices conocidos
 *   GET  ?action=commands      → Comandos ADB para copiar
 *   POST ?action=apply&device= → Ejecuta hardening desde el VPS via ADB
 *   POST ?action=auto          → Auto-detect device por IP y hardening
 * 
 * Requisito VPS: apt install android-tools-adb
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ═══ Configuración ═══
define('ADB_BIN', '/usr/bin/adb');
define('SCRIPT_PATH', __DIR__ . '/ape-adb-hardening.sh');
define('LOG_PATH', '/var/log/ape-adb-hardening.log');

$DEVICES = [
    'onn_4k' => [
        'name'     => 'ONN 4K (Buga)',
        'ip'       => '192.168.10.28',
        'port'     => 5555,
        'platform' => 'amlogic_s905x4',
        'network'  => 'lan',
        'reachable_from_vps' => false, // LAN del usuario, no accesible desde VPS
    ],
    'firetv_4k' => [
        'name'     => 'Fire TV Stick 4K Max',
        'ip'       => '10.200.0.3',
        'port'     => 5555,
        'platform' => 'mediatek_mt8696',
        'network'  => 'wireguard',
        'reachable_from_vps' => true, // Accesible via WireGuard tunnel
    ]
];

// ═══ IP → Device mapping (auto-detect) ═══
$IP_MAP = [
    '10.200.0.3' => 'firetv_4k',
    '10.200.0.4' => 'onn_4k', // Si el ONN se conecta via WireGuard
];

$action = $_GET['action'] ?? $_POST['action'] ?? 'status';

switch ($action) {
    case 'script':
        serveScript();
        break;
    case 'status':
        showStatus($DEVICES);
        break;
    case 'commands':
        showCommands($DEVICES);
        break;
    case 'apply':
        applyHardening($DEVICES);
        break;
    case 'auto':
        autoHardening($DEVICES, $IP_MAP);
        break;
    case 'hook':
        // Llamado por NGINX post_action cuando se sirve un .m3u8
        hookOnListDownload($DEVICES, $IP_MAP);
        break;
    default:
        echo json_encode(['error' => 'Unknown action']);
}

// ═══ Funciones ═══

function serveScript() {
    if (file_exists(SCRIPT_PATH)) {
        header('Content-Type: application/x-sh');
        header('Content-Disposition: attachment; filename="ape-adb-hardening.sh"');
        readfile(SCRIPT_PATH);
    } else {
        http_response_code(404);
        echo json_encode(['error' => 'Script not found']);
    }
}

function showStatus(array $devices) {
    $results = [];
    foreach ($devices as $id => $dev) {
        $reachable = false;
        if ($dev['reachable_from_vps'] && file_exists(ADB_BIN)) {
            // Ping test
            exec("timeout 2 bash -c 'echo > /dev/tcp/{$dev['ip']}/{$dev['port']}' 2>/dev/null", $out, $rc);
            $reachable = ($rc === 0);
        }
        $results[$id] = array_merge($dev, ['adb_reachable' => $reachable]);
    }
    echo json_encode([
        'version'    => '2.0',
        'adb_installed' => file_exists(ADB_BIN),
        'devices'    => $results,
        'timestamp'  => date('c'),
    ], JSON_PRETTY_PRINT);
}

function showCommands(array $devices) {
    $deviceId = $_GET['device'] ?? 'firetv_4k';
    $dev = $devices[$deviceId] ?? $devices['firetv_4k'];
    $target = "{$dev['ip']}:{$dev['port']}";
    
    echo json_encode([
        'device' => $dev['name'],
        'target' => $target,
        'commands' => [
            'connect'   => "adb connect {$target}",
            'push'      => "adb -s {$target} push ape-adb-hardening.sh /data/local/tmp/",
            'execute'   => "adb -s {$target} shell 'sh /data/local/tmp/ape-adb-hardening.sh'",
            'one_liner' => "adb connect {$target} && adb -s {$target} push ape-adb-hardening.sh /data/local/tmp/ && adb -s {$target} shell 'chmod 755 /data/local/tmp/ape-adb-hardening.sh && sh /data/local/tmp/ape-adb-hardening.sh'"
        ]
    ], JSON_PRETTY_PRINT);
}

function applyHardening(array $devices) {
    $deviceId = $_POST['device'] ?? $_GET['device'] ?? 'firetv_4k';
    $dev = $devices[$deviceId] ?? null;
    
    if (!$dev) {
        echo json_encode(['error' => "Device '{$deviceId}' not found"]);
        return;
    }
    
    if (!$dev['reachable_from_vps']) {
        echo json_encode([
            'error' => "Device '{$dev['name']}' not reachable from VPS (network: {$dev['network']})",
            'hint'  => 'Use the .bat file from your Windows PC instead'
        ]);
        return;
    }
    
    if (!file_exists(ADB_BIN)) {
        echo json_encode([
            'error' => 'ADB not installed on VPS',
            'fix'   => 'apt install android-tools-adb'
        ]);
        return;
    }
    
    $result = executeAdbHardening($dev);
    logAction($deviceId, $result);
    echo json_encode($result, JSON_PRETTY_PRINT);
}

function autoHardening(array $devices, array $ipMap) {
    // Detectar device por IP del request
    $clientIp = $_SERVER['REMOTE_ADDR'] ?? '';
    $deviceId = $ipMap[$clientIp] ?? null;
    
    if (!$deviceId) {
        echo json_encode([
            'status'    => 'skip',
            'client_ip' => $clientIp,
            'reason'    => 'IP not mapped to any known device',
            'known_ips' => array_keys($ipMap)
        ]);
        return;
    }
    
    $dev = $devices[$deviceId];
    if (!$dev['reachable_from_vps']) {
        echo json_encode([
            'status'    => 'skip',
            'device'    => $dev['name'],
            'reason'    => 'Device not reachable from VPS'
        ]);
        return;
    }
    
    $result = executeAdbHardening($dev);
    logAction($deviceId, $result);
    echo json_encode($result, JSON_PRETTY_PRINT);
}

function hookOnListDownload(array $devices, array $ipMap) {
    // Llamado automáticamente por NGINX cuando se sirve un .m3u8
    // Solo aplica a devices WireGuard (accesibles desde VPS)
    $clientIp = $_SERVER['REMOTE_ADDR'] ?? '';
    $deviceId = $ipMap[$clientIp] ?? null;
    
    if (!$deviceId) {
        echo json_encode(['hook' => 'skip', 'reason' => 'unknown_device']);
        return;
    }
    
    $dev = $devices[$deviceId];
    
    // Rate limit: no aplicar más de 1 vez cada 5 minutos por device
    $lockFile = "/tmp/ape_adb_lock_{$deviceId}";
    if (file_exists($lockFile) && (time() - filemtime($lockFile)) < 300) {
        echo json_encode([
            'hook'    => 'skip',
            'device'  => $dev['name'],
            'reason'  => 'rate_limited',
            'next_at' => date('c', filemtime($lockFile) + 300)
        ]);
        return;
    }
    
    touch($lockFile);
    
    // Ejecutar en background para no bloquear la descarga del M3U8
    $cmd = sprintf(
        'nohup bash -c "%s connect %s:%d && %s -s %s:%d shell sh /data/local/tmp/ape-adb-hardening.sh" > %s 2>&1 &',
        ADB_BIN, $dev['ip'], $dev['port'],
        ADB_BIN, $dev['ip'], $dev['port'],
        LOG_PATH
    );
    exec($cmd);
    
    echo json_encode([
        'hook'   => 'triggered',
        'device' => $dev['name'],
        'target' => "{$dev['ip']}:{$dev['port']}",
        'async'  => true
    ]);
}

function executeAdbHardening(array $dev): array {
    $target = "{$dev['ip']}:{$dev['port']}";
    $startTime = microtime(true);
    
    // 1. Conectar
    exec(ADB_BIN . " connect {$target} 2>&1", $connectOut, $connectRc);
    
    // 2. Verificar conexión
    exec(ADB_BIN . " -s {$target} shell echo PING 2>&1", $pingOut, $pingRc);
    if ($pingRc !== 0 || !in_array('PING', $pingOut)) {
        return [
            'status'  => 'error',
            'device'  => $dev['name'],
            'error'   => 'Device not responding to ADB',
            'connect' => implode("\n", $connectOut),
        ];
    }
    
    // 3. Push script si no existe
    exec(ADB_BIN . " -s {$target} shell '[ -f /data/local/tmp/ape-adb-hardening.sh ] && echo EXISTS' 2>&1", $existsOut);
    if (!in_array('EXISTS', $existsOut)) {
        exec(ADB_BIN . " -s {$target} push " . SCRIPT_PATH . " /data/local/tmp/ape-adb-hardening.sh 2>&1", $pushOut, $pushRc);
        exec(ADB_BIN . " -s {$target} shell chmod 755 /data/local/tmp/ape-adb-hardening.sh 2>&1");
    }
    
    // 4. Ejecutar
    exec(ADB_BIN . " -s {$target} shell 'sh /data/local/tmp/ape-adb-hardening.sh' 2>&1", $execOut, $execRc);
    
    $elapsed = round((microtime(true) - $startTime) * 1000);
    $output = implode("\n", $execOut);
    $success = strpos($output, 'ALL_OK') !== false;
    
    return [
        'status'  => $success ? 'success' : 'partial',
        'device'  => $dev['name'],
        'target'  => $target,
        'elapsed' => "{$elapsed}ms",
        'output'  => $output,
    ];
}

function logAction(string $deviceId, array $result) {
    $entry = date('c') . " | {$deviceId} | {$result['status']} | " . 
             ($result['elapsed'] ?? '?') . "\n";
    @file_put_contents(LOG_PATH, $entry, FILE_APPEND);
}

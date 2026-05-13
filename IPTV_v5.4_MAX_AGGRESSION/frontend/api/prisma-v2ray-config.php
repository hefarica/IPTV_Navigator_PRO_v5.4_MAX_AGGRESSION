<?php
/**
 * APE v2rayNG Config Manager
 * Serves and updates the v2rayNG client config from the VPS.
 * 
 * GET  ?action=get_config     → Returns current client config JSON
 * POST ?action=update_config  → Updates client config (body = JSON)
 * GET  ?action=xray_status    → Xray service health
 * POST ?action=restart_xray   → Restart Xray service
 * POST ?action=push_to_onn    → Push config to ONN via ADB file import
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Prisma-Key');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$CONFIG_PATH = '/var/www/html/prisma/v2rayng-client-config.json';
$XRAY_SERVER_CONFIG = '/usr/local/etc/xray/config.json';
$ONN_IP = '192.168.10.28:5555';
$ADB = '/usr/bin/adb';

$action = $_GET['action'] ?? $_POST['action'] ?? '';

switch ($action) {

case 'get_config':
    if (!file_exists($CONFIG_PATH)) {
        echo json_encode(['ok' => false, 'error' => 'Config file not found']);
        exit;
    }
    $config = json_decode(file_get_contents($CONFIG_PATH), true);
    $mtime = filemtime($CONFIG_PATH);
    echo json_encode([
        'ok' => true,
        'config' => $config,
        'last_modified' => date('c', $mtime),
        'size_bytes' => filesize($CONFIG_PATH),
    ]);
    break;

case 'update_config':
    $body = file_get_contents('php://input');
    $json = json_decode($body, true);
    if (!$json) {
        echo json_encode(['ok' => false, 'error' => 'Invalid JSON body']);
        exit;
    }
    // Backup current
    if (file_exists($CONFIG_PATH)) {
        copy($CONFIG_PATH, $CONFIG_PATH . '.bak.' . date('Ymd_His'));
    }
    // Validate minimum structure
    if (empty($json['outbounds']) || empty($json['routing'])) {
        echo json_encode(['ok' => false, 'error' => 'Missing required fields: outbounds, routing']);
        exit;
    }
    // Stamp update time
    $json['_updated'] = date('c');
    $json['_comment'] = $json['_comment'] ?? 'APE v2rayNG Client Config';
    file_put_contents($CONFIG_PATH, json_encode($json, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    echo json_encode([
        'ok' => true,
        'message' => 'Config updated',
        'last_modified' => date('c'),
        'size_bytes' => filesize($CONFIG_PATH),
    ]);
    break;

case 'xray_status':
    $active = trim(shell_exec('systemctl is-active xray 2>/dev/null') ?? '');
    $pid = trim(shell_exec('pidof xray 2>/dev/null') ?? '');
    $listen = trim(shell_exec("ss -tlnp 2>/dev/null | grep ':8443'" ) ?? '');
    $uptime = trim(shell_exec("systemctl show xray --property=ActiveEnterTimestamp 2>/dev/null | cut -d= -f2") ?? '');
    $mem = trim(shell_exec("systemctl show xray --property=MemoryCurrent 2>/dev/null | cut -d= -f2") ?? '');
    $lastErr = trim(shell_exec("tail -5 /var/log/xray/error.log 2>/dev/null") ?? '');
    echo json_encode([
        'ok' => ($active === 'active'),
        'active' => $active,
        'pid' => $pid ?: null,
        'listening' => !empty($listen),
        'port' => 8443,
        'uptime_since' => $uptime,
        'memory' => $mem,
        'last_errors' => $lastErr,
    ]);
    break;

case 'restart_xray':
    // Backup first
    if (file_exists($XRAY_SERVER_CONFIG)) {
        copy($XRAY_SERVER_CONFIG, $XRAY_SERVER_CONFIG . '.bak.' . date('Ymd_His'));
    }
    $out = shell_exec('systemctl restart xray 2>&1');
    sleep(2);
    $active = trim(shell_exec('systemctl is-active xray 2>/dev/null') ?? '');
    $pid = trim(shell_exec('pidof xray 2>/dev/null') ?? '');
    echo json_encode([
        'ok' => ($active === 'active'),
        'active' => $active,
        'pid' => $pid ?: null,
        'output' => $out,
    ]);
    break;

case 'push_to_onn':
    // Push config to ONN via ADB — user imports via v2rayNG
    $connected = trim(shell_exec("timeout 3 {$ADB} -s {$ONN_IP} shell echo OK 2>/dev/null") ?? '');
    if ($connected !== 'OK') {
        shell_exec("timeout 5 {$ADB} connect {$ONN_IP} 2>/dev/null");
        sleep(2);
        $connected = trim(shell_exec("timeout 3 {$ADB} -s {$ONN_IP} shell echo OK 2>/dev/null") ?? '');
    }
    if ($connected !== 'OK') {
        echo json_encode(['ok' => false, 'error' => 'Cannot reach ONN via ADB']);
        exit;
    }
    // Push config file to ONN storage
    $tmpPath = '/data/local/tmp/v2rayng-config-update.json';
    shell_exec("timeout 10 {$ADB} -s {$ONN_IP} push {$CONFIG_PATH} {$tmpPath} 2>/dev/null");
    // Try to import via v2rayNG intent
    $intent = "am start -a android.intent.action.VIEW -t application/json -d file://{$tmpPath} -n com.v2ray.ang/.ui.MainActivity 2>/dev/null";
    shell_exec("timeout 10 {$ADB} -s {$ONN_IP} shell \"{$intent}\"");
    echo json_encode([
        'ok' => true,
        'message' => 'Config pushed to ONN at ' . $tmpPath,
        'note' => 'User may need to manually import from v2rayNG if auto-import fails',
    ]);
    break;

default:
    echo json_encode([
        'ok' => false,
        'error' => 'Unknown action',
        'actions' => ['get_config', 'update_config', 'xray_status', 'restart_xray', 'push_to_onn'],
    ]);
}

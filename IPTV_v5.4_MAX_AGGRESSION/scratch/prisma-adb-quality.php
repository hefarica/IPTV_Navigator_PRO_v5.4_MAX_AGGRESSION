<?php
/**
 * APE Quality Manifest API — ONN 4K Settings Bridge
 * Reads/writes Android settings via ADB and manages the guardian daemon.
 * 
 * GET  ?action=read_all           → Read all 58 manifest settings
 * GET  ?action=guardian_status    → Guardian PID + alive check
 * POST ?action=set&key=X&value=Y&ns=global  → Write setting + update guardian
 * POST ?action=restart_guardian   → Kill + restart guardian daemon
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Prisma-Key');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$ONN_IP = '192.168.10.28:5555';
$ADB = '/usr/bin/adb';
$GUARDIAN_PATH = '/data/local/tmp/ape-sentinel.sh';
$GUARDIAN_LOCK = '/data/local/tmp/ape-sentinel.lock';
$ENABLE_VPS_ADB = false; // Decouple VPS ADB in pure Pull Mode

// ── ADB helpers ──────────────────────────────────────────────────────────
function adb_cmd($cmd, $timeout = 5) {
    global $ONN_IP, $ADB;
    $full = "timeout {$timeout} {$ADB} -s {$ONN_IP} shell " . escapeshellarg($cmd) . " 2>/dev/null";
    $out = trim(shell_exec($full) ?? '');
    return $out;
}

function adb_ensure_connected() {
    global $ONN_IP, $ADB, $ENABLE_VPS_ADB;
    if (!$ENABLE_VPS_ADB) {
        return false;
    }
    $cache_file = '/tmp/adb_connection_status.json';
    $now = time();
    
    if (file_exists($cache_file)) {
        $cache = json_decode(@file_get_contents($cache_file), true);
        if ($cache && isset($cache['connected']) && isset($cache['ts'])) {
            // Cache successful connection for 30s, failed connection for 20s to prevent web server request lockups
            $cache_duration = $cache['connected'] ? 30 : 20;
            if ($now - $cache['ts'] < $cache_duration) {
                return $cache['connected'];
            }
        }
    }
    
    $check = trim(shell_exec("timeout 2 {$ADB} -s {$ONN_IP} shell echo OK 2>/dev/null") ?? '');
    if ($check === 'OK') {
        @file_put_contents($cache_file, json_encode(['connected' => true, 'ts' => $now]));
        return true;
    }
    
    shell_exec("timeout 3 {$ADB} connect {$ONN_IP} 2>/dev/null");
    usleep(500000); // 0.5s sleep
    
    $check = trim(shell_exec("timeout 2 {$ADB} -s {$ONN_IP} shell echo OK 2>/dev/null") ?? '');
    $connected = ($check === 'OK');
    
    @file_put_contents($cache_file, json_encode(['connected' => $connected, 'ts' => $now]));
    return $connected;
}

// ── Settings manifest definition ─────────────────────────────────────────
// Each entry: [namespace, key, expected_value, group, label, type, options]
// type: 'toggle'|'select'|'number'|'readonly'
$MANIFEST = [
    // AI PICTURE QUALITY
    ['system', 'aipq_enable',        '1',   'ai', 'AI PQ Enable',           'toggle', null],
    ['system', 'aisr_enable',        '1',   'ai', 'AI SR Enable',           'toggle', null],
    ['system', 'ai_pq_mode',        '3',   'ai', 'AI PQ Mode',            'select', ['0'=>'Off','1'=>'Low','2'=>'Mid','3'=>'High']],
    ['system', 'ai_sr_mode',        '3',   'ai', 'AI SR Mode',            'select', ['0'=>'Off','1'=>'Low','2'=>'Mid','3'=>'High']],
    ['global', 'ai_pic_mode',       '3',   'ai', 'AI Picture Mode',       'select', ['0'=>'Off','1'=>'Low','2'=>'Mid','3'=>'High']],
    ['global', 'ai_sr_level',       '3',   'ai', 'AI SR Level',           'select', ['0'=>'Off','1'=>'Low','2'=>'Mid','3'=>'High']],
    ['global', 'pq_ai_dnr_enable',  '1',   'ai', 'AI Digital NR',         'toggle', null],
    ['global', 'pq_ai_fbc_enable',  '1',   'ai', 'AI Film Bias Comp',     'toggle', null],
    ['global', 'pq_ai_sr_enable',   '1',   'ai', 'AI SR Global',          'toggle', null],
    ['global', 'pq_nr_enable',      '1',   'ai', 'Noise Reduction',       'toggle', null],
    ['global', 'pq_sharpness_enable','1',   'ai', 'Sharpness',             'toggle', null],
    ['global', 'pq_dnr_enable',     '1',   'ai', 'Digital NR',            'toggle', null],
    ['global', 'smart_illuminate_enabled','1','ai','Smart Illuminate',     'toggle', null],

    // DISPLAY
    ['global', 'user_preferred_resolution_height','2160','display','Resolution Height','readonly', null],
    ['global', 'user_preferred_resolution_width', '3840','display','Resolution Width', 'readonly', null],
    ['global', 'user_preferred_refresh_rate',     '60.0','display','Refresh Rate',     'select', ['23.976'=>'23.976','24.0'=>'24','29.97'=>'29.97','30.0'=>'30','50.0'=>'50','59.94'=>'59.94','60.0'=>'60']],
    ['global', 'display_color_mode',              '3',   'display','Color Mode',       'select', ['0'=>'Native','1'=>'Boosted','2'=>'Saturated','3'=>'HDR']],
    ['global', 'match_content_frame_rate_pref',   '2',   'display','Match Frame Rate', 'select', ['0'=>'Never','1'=>'Non-Seamless','2'=>'Seamless']],
    ['global', 'match_content_frame_rate',        '1',   'display','Frame Match ON',   'toggle', null],

    // HDR
    ['global', 'hdr_conversion_mode',       '0',   'hdr', 'HDR Conversion',     'select', ['0'=>'Passthrough','1'=>'System','2'=>'SDR','3'=>'Force']],
    ['global', 'hdr_output_type',           '4',   'hdr', 'HDR Output Type',    'select', ['0'=>'None','1'=>'HDR10','2'=>'HLG','3'=>'DolbyVision','4'=>'Auto-Best']],
    ['global', 'hdr_force_conversion_type', '-1',  'hdr', 'Force Conversion',   'select', ['-1'=>'Disabled','1'=>'HDR10','2'=>'HLG','3'=>'DolbyVision']],
    ['global', 'hdr_brightness_boost',      '100', 'hdr', 'HDR Brightness',     'number', ['min'=>0,'max'=>100]],
    ['global', 'sdr_brightness_in_hdr',     '100', 'hdr', 'SDR in HDR Bright',  'number', ['min'=>0,'max'=>100]],
    ['global', 'peak_luminance',            '8000','hdr', 'Peak Luminance',     'number', ['min'=>100,'max'=>10000]],
    ['global', 'pq_hdr_enable',             '1',   'hdr', 'HDR Engine',         'toggle', null],
    ['global', 'pq_hdr_mode',              '1',   'hdr', 'HDR Processing',     'toggle', null],
    ['global', 'always_hdr',               '0',   'hdr', 'Always HDR',         'toggle', null],

    // COLOR
    ['global', 'hdmi_color_space',    '2',  'color', 'HDMI Color Space', 'select', ['0'=>'RGB','1'=>'YCbCr 4:4:4','2'=>'YCbCr 4:2:2','3'=>'YCbCr 4:2:0']],
    ['global', 'color_depth',         '10', 'color', 'Color Depth',      'select', ['8'=>'8-bit','10'=>'10-bit','12'=>'12-bit']],
    ['global', 'color_mode_ycbcr422', '1',  'color', 'YCbCr 4:2:2',     'toggle', null],

    // AUDIO
    ['global', 'encoded_surround_output', '2', 'audio', 'Surround Output', 'select', ['0'=>'Never','1'=>'Auto','2'=>'Always']],
    ['global', 'enable_dolby_atmos',      '0', 'audio', 'Dolby Atmos',     'toggle', null],
    ['global', 'db_id_sound_spdif_output_enable','1','audio','SPDIF Output','toggle', null],

    // BRIGHTNESS
    ['global', 'video_brightness',  '100', 'brightness', 'Video Brightness',  'number', ['min'=>0,'max'=>100]],
    ['system', 'screen_brightness', '255', 'brightness', 'Screen Brightness', 'number', ['min'=>0,'max'=>255]],

    // GPU
    ['global', 'force_gpu_rendering',                  '1', 'gpu', 'Force GPU',       'toggle', null],
    ['global', 'force_hw_ui',                          '1', 'gpu', 'Force HW UI',     'toggle', null],
    ['global', 'hardware_accelerated_rendering_enabled','1', 'gpu', 'HW Accel',        'toggle', null],

    // POWER
    ['system', 'screen_off_timeout', '2147483647', 'power', 'Screen Timeout', 'select', ['60000'=>'1min','300000'=>'5min','1800000'=>'30min','2147483647'=>'Never']],

    // ── [2026-05-21] WIRED: features that were daemon-only, now visible in the widget ──
    // VPN / Xray
    ['secure', 'always_on_vpn_app',        'com.v2ray.ang', 'vpn', 'VPN App (Xray)',   'readonly', null],
    ['secure', 'always_on_vpn_lockdown',   '1',             'vpn', 'VPN Lockdown',     'toggle',   null],
    // Red / Sistema
    ['global', 'tcp_default_init_rwnd',    '60',            'net', 'TCP Init RWND',    'number',   ['min'=>1,'max'=>1000]],
    ['global', 'private_dns_specifier',    'dns.google',    'net', 'Private DNS',      'text',     null],
    ['global', 'stay_on_while_plugged_in', '3',             'net', 'Stay On (plug)',   'toggle',   null],
    // AFR Anti-Judder
    ['daemon', 'afr_anti_judder',          '1',             'afr', 'AFR Anti-Judder',  'toggle',   null],
    // QoE Telemetry
    ['daemon', 'qoe_report',               '1',             'qoe', 'QoE -> Heartbeat', 'toggle',   null],
    ['daemon', 'qoe_interval_s',           '30',            'qoe', 'QoE Sample (s)',   'number',   ['min'=>10,'max'=>300]],
    // Daemon Behavior
    ['daemon', 'kill_bandwidth_thieves',   '1',             'daemon', 'Kill BW Thieves', 'toggle', null],
    ['daemon', 'drop_caches',              '1',             'daemon', 'Drop Caches',     'toggle', null],
    ['daemon', 'tcp_lowlatency_tuning',    '1',             'daemon', 'TCP Low-Latency', 'toggle', null],
];

// ── Actions ──────────────────────────────────────────────────────────────
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$MANIFEST_FILE = '/var/www/html/prisma/quality-manifest.json';

// save_manifest and get_manifest don't need ADB
if ($action === 'save_manifest') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!$body || !isset($body['manifest'])) {
        echo json_encode(['ok' => false, 'error' => 'Missing manifest in body']);
        exit;
    }
    $body['saved_at'] = date('c');
    $body['saved_by'] = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    // Backup previous
    if (file_exists($MANIFEST_FILE)) {
        copy($MANIFEST_FILE, $MANIFEST_FILE . '.bak');
    }
    $written = file_put_contents($MANIFEST_FILE, json_encode($body, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    chmod($MANIFEST_FILE, 0644);

    // Set pending manifest trigger file
    $pending_file = '/var/www/html/prisma/quality-manifest.pending';
    @file_put_contents($pending_file, '1');
    @chmod($pending_file, 0644);

    $manifest_hash = file_exists($MANIFEST_FILE) ? md5_file($MANIFEST_FILE) : "";
    if ($manifest_hash) {
        file_put_contents('/var/www/html/prisma/quality-manifest.hash', $manifest_hash);
        chmod('/var/www/html/prisma/quality-manifest.hash', 0644);
    }

    echo json_encode([
        'ok' => ($written !== false),
        'bytes' => $written,
        'path' => $MANIFEST_FILE,
        'ts' => date('c'),
        'settings_count' => count($body['manifest']),
        'manifest_hash' => $manifest_hash,
        'queued' => true,
        'manifest_ready_for_pull' => true,
        'guardian_mode' => 'sentinel_pull',
        'source' => 'vps_api'
    ]);
    exit;
}

if ($action === 'manifest_hash') {
    $pending_file = '/var/www/html/prisma/quality-manifest.pending';
    $queued = file_exists($pending_file);
    $manifest_hash = '';
    
    // Check if hash file exists, otherwise generate in-place
    $hash_file = '/var/www/html/prisma/quality-manifest.hash';
    if (file_exists($hash_file)) {
        $manifest_hash = trim(file_get_contents($hash_file));
    } elseif (file_exists($MANIFEST_FILE)) {
        $manifest_hash = md5_file($MANIFEST_FILE);
        file_put_contents($hash_file, $manifest_hash);
        chmod($hash_file, 0644);
    }
    
    echo json_encode([
        'ok' => true,
        'manifest_hash' => $manifest_hash,
        'queued' => $queued,
        'ts' => date('c'),
        'guardian_mode' => 'sentinel_pull'
    ]);
    exit;
}

if ($action === 'server_apply_pending') {
    $pending_file = '/var/www/html/prisma/quality-manifest.pending';
    
    if (!file_exists($pending_file)) {
        echo json_encode(['ok' => true, 'applied' => false, 'reason' => 'No pending manifest']);
        exit;
    }

    if (!adb_ensure_connected()) {
        echo json_encode(['ok' => false, 'applied' => false, 'error' => 'ADB unreachable', 'device' => $ONN_IP]);
        exit;
    }

    global $ONN_IP, $ADB, $GUARDIAN_LOCK;
    $pushed = shell_exec("timeout 5 {$ADB} -s {$ONN_IP} push " . escapeshellarg($MANIFEST_FILE) . " /data/local/tmp/quality-manifest.json 2>/dev/null");
    $manifest_pushed = ($pushed !== null);

    // Touch the trigger file for immediate apply bypass clamp
    adb_cmd("echo 1 > /data/local/tmp/ape-qm-apply-now");
    $apply_triggered = true;

    $pid = trim(adb_cmd("cat {$GUARDIAN_LOCK}"));
    $signaled = false;
    if ($pid && is_numeric($pid)) {
        adb_cmd("kill -USR1 {$pid}");
        $signaled = true;
    }

    @unlink($pending_file);

    $manifest_hash = file_exists($MANIFEST_FILE) ? md5_file($MANIFEST_FILE) : "";

    echo json_encode([
        'ok' => true,
        'applied' => true,
        'signaled' => $signaled,
        'manifest_pushed' => $manifest_pushed,
        'apply_triggered' => $apply_triggered,
        'manifest_hash' => $manifest_hash,
        'guardian_mode' => 'applied'
    ]);
    exit;
}

if ($action === 'get_manifest') {
    if (!file_exists($MANIFEST_FILE)) {
        echo json_encode(['ok' => false, 'error' => 'No manifest saved yet']);
        exit;
    }
    $data = json_decode(file_get_contents($MANIFEST_FILE), true);
    $data['ok'] = true;
    echo json_encode($data);
    exit;
}

$HEARTBEAT_FILE = '/var/www/html/prisma/guardian-heartbeat.json';

// Guardian heartbeat: POST = store, GET = read
if ($action === 'guardian_heartbeat') {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        // Guardian on ONN sends heartbeat every cycle
        $body = json_decode(file_get_contents('php://input'), true) ?: [];
        $heartbeat = [
            'alive' => true,
            'ts' => date('c'),
            'epoch' => time(),
            'pid' => $body['pid'] ?? null,
            'ram_avail_mb' => $body['ram_avail_mb'] ?? null,
            'vpn_status' => $body['vpn_status'] ?? null,
            'player_status' => $body['player_status'] ?? null,
            'wifi_rssi' => $body['wifi_rssi'] ?? null,
            'manifest_hash' => $body['manifest_hash'] ?? null,
            'cycle' => $body['cycle'] ?? null,
            'uptime' => $body['uptime'] ?? null,
            'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
        ];
        file_put_contents($HEARTBEAT_FILE, json_encode($heartbeat, JSON_PRETTY_PRINT));

        // Closed-loop control: delete pending trigger file if device confirms it applied the current manifest hash
        $incoming_hash = $body['manifest_hash'] ?? null;
        $current_hash = file_exists($MANIFEST_FILE) ? md5_file($MANIFEST_FILE) : '';
        $pending_file = '/var/www/html/prisma/quality-manifest.pending';
        if ($incoming_hash && $current_hash && $incoming_hash === $current_hash) {
            if (file_exists($pending_file)) {
                @unlink($pending_file);
            }
        }

        echo json_encode(['ok' => true, 'received' => true]);
    } else {
        // Dynamically verify guardian status via ADB to update heartbeat file
        if (adb_ensure_connected()) {
            $pid = trim(adb_cmd("cat {$GUARDIAN_LOCK}"));
            $alive = false;
            if ($pid && is_numeric($pid)) {
                $check = adb_cmd("kill -0 " . trim($pid) . " 2>/dev/null && echo YES || echo NO");
                $alive = (trim($check) === 'YES');
            }
            if ($alive) {
                $ram = adb_cmd("grep MemAvailable /proc/meminfo | awk '{print int(\$2/1024)}'");
                $vpn = adb_cmd("ip link show tun0 2>/dev/null | grep -c UP");
                $heartbeat = [
                    'alive' => true,
                    'ts' => date('c'),
                    'epoch' => time(),
                    'pid' => (int)$pid,
                    'ram_avail_mb' => (int)trim($ram),
                    'vpn_status' => (trim($vpn) === '1' ? 'UP' : 'DOWN'),
                    'method' => 'adb_status',
                ];
                file_put_contents($HEARTBEAT_FILE, json_encode($heartbeat, JSON_PRETTY_PRINT));
            } else {
                $heartbeat = [
                    'alive' => false,
                    'ts' => date('c'),
                    'epoch' => time(),
                    'pid' => null,
                    'method' => 'adb_status',
                ];
                file_put_contents($HEARTBEAT_FILE, json_encode($heartbeat, JSON_PRETTY_PRINT));
            }
        }

        // Widget reads last heartbeat
        if (!file_exists($HEARTBEAT_FILE)) {
            echo json_encode(['ok' => true, 'alive' => false, 'reason' => 'No heartbeat received yet']);
            exit;
        }
        $data = json_decode(file_get_contents($HEARTBEAT_FILE), true);
        $age = time() - ($data['epoch'] ?? 0);
        $data['age_seconds'] = $age;
        $data['alive'] = ($age < 60 && ($data['alive'] ?? false)); // alive if heartbeat < 60s old and recorded as alive
        $data['ok'] = true;
        echo json_encode($data);
    }
    exit;
}

if ($action === 'sentinel_trigger') {
    $routine = $_GET['routine'] ?? $_POST['routine'] ?? '';
    $allowed = ['vps_recovery', 'dns_recover', 'xray_health', 'wg_failover', 'cache_warm', 'qoe_snapshot', 'route_diagnose'];
    if (!in_array($routine, $allowed, true)) {
        echo json_encode(['ok' => false, 'error' => 'Invalid routine name']);
        exit;
    }
    
    $script = "/opt/netshield/scripts/sentinel-{$routine}.sh";
    if (!is_file($script)) {
        echo json_encode(['ok' => false, 'error' => "Script not found on VPS: {$script}"]);
        exit;
    }
    
    // Non-blocking execution using sudo
    $cmd = "sudo " . escapeshellarg($script) . " > /dev/null 2>&1 &";
    exec($cmd);
    
    echo json_encode([
        'ok' => true,
        'routine' => $routine,
        'executed' => true,
        'ts' => date('c')
    ]);
    exit;
}

if ($action === 'read_all') {
    $results = [];
    $groups = [];
    $has_adb = adb_ensure_connected();
    
    $vps_manifest = [];
    if (!$has_adb && file_exists($MANIFEST_FILE)) {
        $json = json_decode(@file_get_contents($MANIFEST_FILE), true);
        if ($json && isset($json['manifest'])) {
            foreach ($json['manifest'] as $item) {
                $vps_manifest[$item['ns'] . '.' . $item['key']] = $item['value'];
            }
        }
    }

    foreach ($MANIFEST as $entry) {
        [$ns, $key, $expected, $group, $label, $type, $options] = $entry;
        if ($has_adb) {
            $current = adb_cmd("settings get {$ns} {$key}");
            if ($current === '' || $current === 'null') $current = null;
            $synced = ($current === $expected);
        } else {
            $current = $vps_manifest[$ns . '.' . $key] ?? $expected;
            $synced = true;
        }
        $results[] = [
            'ns' => $ns, 'key' => $key, 'current' => $current,
            'expected' => $expected, 'synced' => $synced,
            'group' => $group, 'label' => $label,
            'type' => $type, 'options' => $options,
        ];
        if (!isset($groups[$group])) $groups[$group] = 0;
        if (!$synced) $groups[$group]++;
    }
    // Guardian status (fast check via heartbeat file first)
    $pid = null;
    $alive = false;
    $HEARTBEAT_FILE = '/var/www/html/prisma/guardian-heartbeat.json';
    if (file_exists($HEARTBEAT_FILE)) {
        $hb = json_decode(@file_get_contents($HEARTBEAT_FILE), true);
        if ($hb && isset($hb['epoch'])) {
            $age = time() - $hb['epoch'];
            if ($age < 60 && ($hb['alive'] ?? false)) {
                $pid = $hb['pid'] ?? null;
                $alive = true;
            }
        }
    }
    if (!$alive && $has_adb) {
        $pid = adb_cmd("cat {$GUARDIAN_LOCK}");
        if ($pid && is_numeric(trim($pid))) {
            $check = adb_cmd("kill -0 " . trim($pid) . " 2>/dev/null && echo YES || echo NO");
            $alive = (trim($check) === 'YES');
        }
    }
    $pending_file = '/var/www/html/prisma/quality-manifest.pending';
    $queued = file_exists($pending_file);
    echo json_encode([
        'ok' => true, 'settings' => $results, 'drift_by_group' => $groups,
        'guardian' => ['pid' => $pid ?: null, 'alive' => $alive],
        'total' => count($MANIFEST), 'ts' => date('c'),
        'queued' => $queued,
        'worker_pending' => $queued
    ]);
    exit;
}

if ($action === 'guardian_status') {
    $pid = null;
    $alive = false;
    $HEARTBEAT_FILE = '/var/www/html/prisma/guardian-heartbeat.json';
    if (file_exists($HEARTBEAT_FILE)) {
        $hb = json_decode(@file_get_contents($HEARTBEAT_FILE), true);
        if ($hb && isset($hb['epoch'])) {
            $age = time() - $hb['epoch'];
            if ($age < 60 && ($hb['alive'] ?? false)) {
                $pid = $hb['pid'] ?? null;
                $alive = true;
            }
        }
    }
    $has_adb = adb_ensure_connected();
    if (!$alive && $has_adb) {
        $pid = adb_cmd("cat {$GUARDIAN_LOCK}");
        if ($pid && is_numeric(trim($pid))) {
            $check = adb_cmd("kill -0 " . trim($pid) . " 2>/dev/null && echo YES || echo NO");
            $alive = (trim($check) === 'YES');
        }
    }
    $log = '';
    if ($has_adb) {
        $log = adb_cmd("tail -5 /data/local/tmp/ape-sentinel.log");
    }
    $pending_file = '/var/www/html/prisma/quality-manifest.pending';
    $queued = file_exists($pending_file);
    echo json_encode([
        'ok' => true, 
        'pid' => $pid ?: null, 
        'alive' => $alive, 
        'log' => $log,
        'queued' => $queued,
        'worker_pending' => $queued
    ]);
    exit;
}

if (!adb_ensure_connected()) {
    echo json_encode(['ok' => false, 'error' => 'ADB unreachable', 'device' => $ONN_IP]);
    exit;
}

switch ($action) {

case 'set':
    $key = $_GET['key'] ?? $_POST['key'] ?? '';
    $value = $_GET['value'] ?? $_POST['value'] ?? '';
    $ns = $_GET['ns'] ?? $_POST['ns'] ?? 'global';
    if (!$key || $value === '') {
        echo json_encode(['ok' => false, 'error' => 'Missing key or value']);
        exit;
    }
    // 1. Ensure guardian alive
    $pid = trim(adb_cmd("cat {$GUARDIAN_LOCK}"));
    if ($pid && is_numeric($pid)) {
        $alive = trim(adb_cmd("kill -0 {$pid} 2>/dev/null && echo YES || echo NO"));
        if ($alive !== 'YES') {
            adb_cmd("rm -f {$GUARDIAN_LOCK}; chmod 755 {$GUARDIAN_PATH}; nohup {$GUARDIAN_PATH} daemon > /dev/null 2>&1 &", 10);
            sleep(3);
        }
    } else {
        adb_cmd("rm -f {$GUARDIAN_LOCK}; chmod 755 {$GUARDIAN_PATH}; nohup {$GUARDIAN_PATH} daemon > /dev/null 2>&1 &", 10);
        sleep(3);
    }

    // 2. Apply setting
    adb_cmd("settings put {$ns} {$key} {$value}");
    sleep(1);

    // 3. Verify
    $readback = adb_cmd("settings get {$ns} {$key}");
    $applied = (trim($readback) === trim($value));

    // 4. Update guardian manifest in-place (sed)
    // Find the line with this key and update the expected value
    $sed_safe_key = str_replace('/', '\\/', $key);
    $sed_safe_val = str_replace('/', '\\/', $value);
    // Pattern: [ "$varname" != "oldvalue" ] && { settings put ns key oldvalue
    // We update both the comparison and the put command
    adb_cmd("sed -i 's/\\(.*{$sed_safe_key}.*!= \"\\)[^\"]*\\(\".*settings put {$ns} {$sed_safe_key} \\)[^ ]*/\\1{$sed_safe_val}\\2{$sed_safe_val}/' {$GUARDIAN_PATH}", 5);

    // 5. Check guardian still alive
    $pid2 = trim(adb_cmd("cat {$GUARDIAN_LOCK}"));
    $still_alive = false;
    if ($pid2 && is_numeric($pid2)) {
        $check = trim(adb_cmd("kill -0 {$pid2} 2>/dev/null && echo YES || echo NO"));
        $still_alive = ($check === 'YES');
    }
    if (!$still_alive) {
        adb_cmd("rm -f {$GUARDIAN_LOCK}; chmod 755 {$GUARDIAN_PATH}; nohup {$GUARDIAN_PATH} daemon > /dev/null 2>&1 &", 10);
        sleep(3);
        $pid2 = trim(adb_cmd("cat {$GUARDIAN_LOCK}"));
    }

    // 6. Detect hardware rejection (value reverts within 2s)
    sleep(2);
    $final = adb_cmd("settings get {$ns} {$key}");
    $hw_rejected = (trim($final) !== trim($value));

    echo json_encode([
        'ok' => $applied, 'key' => $key, 'value' => $value,
        'readback' => trim($readback), 'final' => trim($final),
        'hw_rejected' => $hw_rejected,
        'guardian_pid' => $pid2, 'guardian_alive' => $still_alive || ($pid2 && is_numeric($pid2)),
    ]);
    break;

case 'stop_guardian':
    $pid = trim(adb_cmd("cat {$GUARDIAN_LOCK}"));
    if ($pid && is_numeric($pid)) {
        adb_cmd("kill {$pid}");
    }
    adb_cmd("rm -f {$GUARDIAN_LOCK}");
    echo json_encode(['ok' => true]);
    break;

case 'restart_guardian':
    $pid = trim(adb_cmd("cat {$GUARDIAN_LOCK}"));
    if ($pid && is_numeric($pid)) {
        adb_cmd("kill {$pid}");
    }
    adb_cmd("rm -f {$GUARDIAN_LOCK}; chmod 755 {$GUARDIAN_PATH}; nohup {$GUARDIAN_PATH} daemon > /dev/null 2>&1 &", 10);
    sleep(5);
    $newpid = trim(adb_cmd("cat {$GUARDIAN_LOCK}"));
    $alive = false;
    if ($newpid && is_numeric($newpid)) {
        $check = trim(adb_cmd("kill -0 " . trim($newpid) . " 2>/dev/null && echo YES || echo NO"));
        $alive = ($check === 'YES');
    }
    echo json_encode(['ok' => $alive, 'pid' => $newpid, 'alive' => $alive]);
    break;

default:
    echo json_encode(['ok' => false, 'error' => 'Unknown action', 'actions' => ['read_all','guardian_status','set','restart_guardian','stop_guardian','save_manifest','get_manifest','sentinel_trigger']]);
}

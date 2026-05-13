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
$GUARDIAN_PATH = '/data/local/tmp/ape-ram-guardian.sh';
$GUARDIAN_LOCK = '/data/local/tmp/ape-ram-guardian.lock';

// ── ADB helpers ──────────────────────────────────────────────────────────
function adb_cmd($cmd, $timeout = 5) {
    global $ONN_IP, $ADB;
    $full = "timeout {$timeout} {$ADB} -s {$ONN_IP} shell " . escapeshellarg($cmd) . " 2>/dev/null";
    $out = trim(shell_exec($full) ?? '');
    return $out;
}

function adb_ensure_connected() {
    global $ONN_IP, $ADB;
    $check = trim(shell_exec("timeout 3 {$ADB} -s {$ONN_IP} shell echo OK 2>/dev/null") ?? '');
    if ($check === 'OK') return true;
    shell_exec("timeout 5 {$ADB} connect {$ONN_IP} 2>/dev/null");
    sleep(2);
    $check = trim(shell_exec("timeout 3 {$ADB} -s {$ONN_IP} shell echo OK 2>/dev/null") ?? '');
    return $check === 'OK';
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
    ['global', 'color_depth',         '12', 'color', 'Color Depth',      'select', ['8'=>'8-bit','10'=>'10-bit','12'=>'12-bit']],
    ['global', 'color_mode_ycbcr422', '1',  'color', 'YCbCr 4:2:2',     'toggle', null],

    // AUDIO
    ['global', 'encoded_surround_output', '2', 'audio', 'Surround Output', 'select', ['0'=>'Never','1'=>'Auto','2'=>'Always']],
    ['global', 'enable_dolby_atmos',      '1', 'audio', 'Dolby Atmos',     'toggle', null],
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
];

// ── Actions ──────────────────────────────────────────────────────────────
$action = $_GET['action'] ?? $_POST['action'] ?? '';

if (!adb_ensure_connected()) {
    echo json_encode(['ok' => false, 'error' => 'ADB unreachable', 'device' => $ONN_IP]);
    exit;
}

switch ($action) {

case 'read_all':
    $results = [];
    $groups = [];
    foreach ($MANIFEST as $entry) {
        [$ns, $key, $expected, $group, $label, $type, $options] = $entry;
        $current = adb_cmd("settings get {$ns} {$key}");
        if ($current === '' || $current === 'null') $current = null;
        $synced = ($current === $expected);
        $results[] = [
            'ns' => $ns, 'key' => $key, 'current' => $current,
            'expected' => $expected, 'synced' => $synced,
            'group' => $group, 'label' => $label,
            'type' => $type, 'options' => $options,
        ];
        if (!isset($groups[$group])) $groups[$group] = 0;
        if (!$synced) $groups[$group]++;
    }
    // Guardian status
    $pid = adb_cmd("cat {$GUARDIAN_LOCK}");
    $alive = false;
    if ($pid && is_numeric(trim($pid))) {
        $check = adb_cmd("kill -0 " . trim($pid) . " 2>/dev/null && echo YES || echo NO");
        $alive = (trim($check) === 'YES');
    }
    echo json_encode([
        'ok' => true, 'settings' => $results, 'drift_by_group' => $groups,
        'guardian' => ['pid' => $pid ?: null, 'alive' => $alive],
        'total' => count($MANIFEST), 'ts' => date('c'),
    ]);
    break;

case 'guardian_status':
    $pid = adb_cmd("cat {$GUARDIAN_LOCK}");
    $alive = false;
    if ($pid && is_numeric(trim($pid))) {
        $check = adb_cmd("kill -0 " . trim($pid) . " 2>/dev/null && echo YES || echo NO");
        $alive = (trim($check) === 'YES');
    }
    $log = adb_cmd("tail -5 /data/local/tmp/ape-ram-guardian.log");
    echo json_encode(['ok' => true, 'pid' => $pid ?: null, 'alive' => $alive, 'log' => $log]);
    break;

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
        $check = trim(adb_cmd("kill -0 {$newpid} 2>/dev/null && echo YES || echo NO"));
        $alive = ($check === 'YES');
    }
    echo json_encode(['ok' => $alive, 'pid' => $newpid, 'alive' => $alive]);
    break;

default:
    echo json_encode(['ok' => false, 'error' => 'Unknown action', 'actions' => ['read_all','guardian_status','set','restart_guardian']]);
}

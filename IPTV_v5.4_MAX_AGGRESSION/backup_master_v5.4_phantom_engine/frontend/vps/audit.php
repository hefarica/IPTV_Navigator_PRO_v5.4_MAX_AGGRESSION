<?php
/**
 * Credential Audit API Endpoint
 * URL: /api/audit
 * 
 * Triggers the credential audit script and returns JSON results.
 * Called automatically after channels_map.json upload, or manually via GET.
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: *');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$script = __DIR__ . '/audit_credentials_vps.py';
$reportPath = __DIR__ . '/audit_report.json';

// Optional: specify M3U8 file via query param
$m3u8 = isset($_GET['m3u8']) ? basename($_GET['m3u8']) : null;
$m3u8Arg = '';
if ($m3u8 && preg_match('/^[A-Za-z0-9._() -]+\.m3u8$/', $m3u8)) {
    $m3u8Full = '/var/www/iptv-ape/lists/' . $m3u8;
    if (is_file($m3u8Full)) {
        $m3u8Arg = ' ' . escapeshellarg($m3u8Full);
    }
}

// Run audit
$cmd = 'python3 ' . escapeshellarg($script) . $m3u8Arg . ' 2>&1';
$output = shell_exec($cmd);

if ($output === null) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Failed to execute audit script',
        'hint' => 'Check python3 is installed and script permissions'
    ]);
    exit;
}

// Try to parse the JSON output
$json = json_decode($output, true);
if ($json === null) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Audit script returned invalid JSON',
        'raw_output' => substr($output, 0, 1000)
    ]);
    exit;
}

// Add timestamp
$json['audit_timestamp'] = date('c');
$json['triggered_by'] = $_GET['trigger'] ?? 'manual';

echo json_encode($json, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

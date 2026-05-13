<?php
/**
 * APE Resolve Quality v3.0 — Pipeline Trace Log CSV Export
 * Endpoint: /iptv-ape/resolve_logs_csv.php
 * Reads pipeline_trace.log (JSON-per-line) and outputs CSV
 */
declare(strict_types=1);

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="APE_Resolve_v3_Logs_' . date('Ymd_His') . '.csv"');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-cache');

$logFile = __DIR__ . '/logs/pipeline_trace.log';

if (!file_exists($logFile)) {
    echo "error,No log file found\n";
    exit;
}

$lines = file($logFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
if (empty($lines)) {
    echo "error,Log file is empty\n";
    exit;
}

// Determine all unique keys across all entries
$allKeys = [];
$entries = [];
foreach ($lines as $line) {
    $data = @json_decode($line, true);
    if (!$data || !is_array($data)) continue;
    $entries[] = $data;
    foreach (array_keys($data) as $k) {
        $allKeys[$k] = true;
    }
}

if (empty($entries)) {
    echo "error,No valid JSON entries in log\n";
    exit;
}

// Sort keys for consistent column order, prioritizing important ones first
$priorityKeys = ['ts', 'timestamp', 'event', 'ch_id', 'channel_name', 'profile', 'sniper_status', 'sniper_label',
    'hevc_profile', 'color_space', 'hdr_transfer_func', 'peak_nits', 'avg_nits', 'color_volume',
    'max_bitrate_mbps', 'min_bitrate_mbps', 'resolution', 'quality_lock', 'cooldown_s',
    'dscp', 'prefetch', 'aggression', 'escalation', 'rate_control'];
$remainingKeys = array_diff(array_keys($allKeys), $priorityKeys);
$orderedKeys = array_merge(
    array_intersect($priorityKeys, array_keys($allKeys)),
    $remainingKeys
);

// Output CSV header
$out = fopen('php://output', 'w');
fputcsv($out, $orderedKeys);

// Output data rows
foreach ($entries as $entry) {
    $row = [];
    foreach ($orderedKeys as $key) {
        $val = $entry[$key] ?? '';
        if (is_array($val) || is_object($val)) {
            $val = json_encode($val, JSON_UNESCAPED_SLASHES);
        }
        $row[] = $val;
    }
    fputcsv($out, $row);
}

fclose($out);

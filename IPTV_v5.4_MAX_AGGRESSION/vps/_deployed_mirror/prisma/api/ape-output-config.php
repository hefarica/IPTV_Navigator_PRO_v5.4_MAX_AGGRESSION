<?php
declare(strict_types=1);
/**
 * Authorized output configuration for the APE generator.
 * POST {delta_pct: 1..90, rule, source, generated_at}
 * Stores the last accepted value in /dev/shm so the VPS and the generator agree.
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Pragma: no-cache');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $file = '/dev/shm/ape_output_config.json';
    if (!is_file($file)) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'NO_CONFIG_YET']);
        exit;
    }
    $stored = json_decode((string)@file_get_contents($file), true);
    if (!is_array($stored)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'STORE_CORRUPT']);
        exit;
    }
    $stored['ok'] = true;
    $stored['readback'] = true;
    echo json_encode($stored, JSON_UNESCAPED_SLASHES);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'POST_ONLY']);
    exit;
}
$raw = file_get_contents('php://input', false, null, 0, 8192);
if ($raw === false || $raw === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'EMPTY_BODY']);
    exit;
}
$in = json_decode($raw, true);
if (!is_array($in)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'BAD_JSON']);
    exit;
}
$delta = filter_var($in['delta_pct'] ?? null, FILTER_VALIDATE_INT);
if ($delta === false) $delta = null;

$deltaArray = [];
$rawArray = $in['delta_array'] ?? null;
if (is_array($rawArray)) {
    foreach ($rawArray as $k => $v) {
        $key = preg_replace('/[^A-Za-z0-9_.-]/', '', (string)$k);
        $val = filter_var($v, FILTER_VALIDATE_INT);
        if ($key !== '' && $val !== false && $val >= 1 && $val <= 90) $deltaArray[$key] = $val;
    }
}
if (empty($deltaArray) && $delta !== null && $delta >= 1 && $delta <= 90) {
    $deltaArray['default'] = $delta;
}
if (empty($deltaArray)) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'DELTA_ARRAY_REQUIRED', 'allowed' => [1, 90]]);
    exit;
}
if ($delta === null || $delta < 1 || $delta > 90) {
    $vals = array_values($deltaArray);
    $delta = (int)$vals[0];
}
$rule = 'IN >= OUT * (1 + delta)';
$record = [
    'ok' => true,
    'delta_pct' => $delta,
    'delta_array' => $deltaArray,
    'array_dynamic' => true,
    'rule' => $rule,
    'source' => preg_replace('/[^A-Za-z0-9_.:-]/', '', (string)($in['source'] ?? 'generator')),
    'generated_at' => (string)($in['generated_at'] ?? gmdate('c')),
    'stored_at' => gmdate('c'),
    'remote' => (string)($_SERVER['REMOTE_ADDR'] ?? ''),
];
$file = '/dev/shm/ape_output_config.json';
if (@file_put_contents($file, json_encode($record, JSON_UNESCAPED_SLASHES) . "\n", LOCK_EX) === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'STORE_FAILED']);
    exit;
}
echo json_encode($record, JSON_UNESCAPED_SLASHES);

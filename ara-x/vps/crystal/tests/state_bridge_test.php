<?php
declare(strict_types=1);

require_once __DIR__ . '/../state_bridge.php';

$fail = 0;
$check = static function (string $name, bool $ok) use (&$fail): void {
    echo ($ok ? 'PASS ' : 'FAIL ') . $name . "\n";
    if (!$ok) $fail++;
};

$db = sys_get_temp_dir() . '/ape_state_bridge_' . getmypid() . '.sqlite';
@unlink($db);
$base = ['device_id' => 'dev-1', 'flags' => ['kind' => 'DETAIL', 'luma' => 10.5, 'lap' => 2.5, 'motion' => 1.0, 'frames' => 30]];
$id = ApeStateBridge::append($base, $db);
$check('inserts row', is_int($id) && $id > 0);
$pdo = new PDO('sqlite:' . $db);
$row = $pdo->query('SELECT target_device_id, delta_type, source, payload_json FROM policy_deltas')->fetch(PDO::FETCH_ASSOC);
$check('device stored', ($row['target_device_id'] ?? null) === 'dev-1');
$check('type classifier.state', ($row['delta_type'] ?? null) === 'classifier.state');
$check('source ara_classifier', ($row['source'] ?? null) === 'ara_classifier');
$payload = json_decode((string) ($row['payload_json'] ?? ''), true);
$check('class kept', ($payload['class'] ?? null) === 'DETAIL');
$check('no device -> null', ApeStateBridge::append(['flags' => ['kind' => 'DETAIL']], $db) === null);
$check('invalid kind -> null', ApeStateBridge::append(['device_id' => 'dev-1', 'flags' => ['kind' => 'BOGUS']], $db) === null);
@unlink($db);

echo $fail === 0 ? "ALL_OK\n" : "FAILURES={$fail}\n";
exit($fail === 0 ? 0 : 1);

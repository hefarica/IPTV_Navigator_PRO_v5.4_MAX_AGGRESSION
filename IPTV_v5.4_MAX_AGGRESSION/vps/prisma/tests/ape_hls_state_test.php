<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/ape_hls_state.php';

$fail = 0;
$check = static function (string $name, bool $ok) use (&$fail): void {
    echo ($ok ? 'PASS ' : 'FAIL ') . $name . "\n";
    if (!$ok) {
        $fail++;
    }
};

$base = '/dev/shm/ape_hls_test_' . getmypid();
@mkdir($base, 0770, true);
$now = 1761921600; // 2025-10-31T14:40:00Z

$first = ApeHlsState::transition($base, '100', $now);
$check('first start sequence 0', $first['discontinuity_sequence'] === 0);
$check('first start no discontinuity', $first['discontinuity'] === false);
$check('program date time is UTC', $first['program_date_time'] === '2025-10-31T14:40:00.000Z');

$same = ApeHlsState::transition($base, '100', $now + 2);
$check('same pid no discontinuity', $same['discontinuity'] === false);
$check('same pid sequence stays 0', $same['discontinuity_sequence'] === 0);

$restart = ApeHlsState::transition($base, '200', $now + 4);
$check('new pid discontinuity true', $restart['discontinuity'] === true);
$check('new pid sequence increments', $restart['discontinuity_sequence'] === 1);

$after = ApeHlsState::transition($base, '200', $now + 6);
$check('after restart no repeated discontinuity', $after['discontinuity'] === false);
$check('after restart sequence stays 1', $after['discontinuity_sequence'] === 1);

@unlink($base . '/.ape_hls_state.json');
@rmdir($base);

echo $fail === 0 ? "ALL_OK\n" : "FAILURES={$fail}\n";
exit($fail === 0 ? 0 : 1);

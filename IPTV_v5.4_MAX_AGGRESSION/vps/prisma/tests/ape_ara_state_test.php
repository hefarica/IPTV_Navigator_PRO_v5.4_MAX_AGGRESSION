<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/ape_ara_state.php';

$fail = 0;
$check = static function (string $name, bool $ok) use (&$fail): void {
    echo ($ok ? 'PASS ' : 'FAIL ') . $name . "\n";
    if (!$ok) {
        $fail++;
    }
};

$base = '/dev/shm/ape_state_test_' . getmypid();
@mkdir($base, 0770, true);

$check('missing file is null', ApeAraState::load('CH1', $base) === null);

$good = [
    'class' => 'DETAIL',
    'confidence' => 0.91,
    'buffer_pct' => 72,
    'bitrate_bps' => 16000000,
    'media_sequence' => 777,
    'timestamp' => '2026-10-31T16:00:00.000Z',
];
file_put_contents($base . '/CH1.json', json_encode($good));
$state = ApeAraState::load('CH1', $base);
$check('loads valid state', is_array($state) && ($state['class'] ?? null) === 'DETAIL');
$check('normalizes confidence', is_array($state) && abs(($state['confidence'] ?? 0) - 0.91) < 0.0001);
$check('tag is dynamic', ApeAraState::tag($state) === '#EXT-X-APE-ARA-STATE:' . json_encode($state));

file_put_contents($base . '/CH1.json', json_encode(['class' => 'BOGUS']));
$check('invalid class is null', ApeAraState::load('CH1', $base) === null);
file_put_contents($base . '/CH1.json', json_encode($good + ['confidence' => 2.0, 'buffer_pct' => 999]));
$clamped = ApeAraState::load('CH1', $base);
$check('clamps confidence/buffer', is_array($clamped) && $clamped['confidence'] <= 1.0 && $clamped['buffer_pct'] <= 100);
$check('no state -> empty tag', ApeAraState::tag(null) === '');

@unlink($base . '/CH1.json');
@rmdir($base);

echo $fail === 0 ? "ALL_OK\n" : "FAILURES={$fail}\n";
exit($fail === 0 ? 0 : 1);

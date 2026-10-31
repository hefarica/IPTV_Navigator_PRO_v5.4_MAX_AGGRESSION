<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/ape_cmaf_bootstrap.php';

$fail = 0;
$check = static function (string $name, bool $ok) use (&$fail): void {
    echo ($ok ? 'PASS ' : 'FAIL ') . $name . "\n";
    if (!$ok) {
        $fail++;
    }
};

$metrics = '/dev/shm/ape_metrics_test_' . getmypid();
$cmaf = '/dev/shm/ape_cmaf_test_' . getmypid();
$ch = 'I06-TEST';

$ok = ApeCmafBootstrap::ensure(
    $ch,
    'https://provider.example/live/channel.m3u8',
    $cmaf,
    ['codec_tag' => 'hvc1', 'list_id' => 'list-1'],
    $metrics,
    '',
    false
);
$check('ensure returns true', $ok === true);
$check('origin_url written', is_file($metrics . '/' . $ch . '/origin_url.txt'));
$check('target_dna written', is_file($metrics . '/' . $ch . '/target_dna.json'));
$check('origin content exact', trim((string) file_get_contents($metrics . '/' . $ch . '/origin_url.txt')) === 'https://provider.example/live/channel.m3u8');
$dna = json_decode((string) file_get_contents($metrics . '/' . $ch . '/target_dna.json'), true);
$check('dna codec_tag', is_array($dna) && ($dna['codec_tag'] ?? null) === 'hvc1');
$check('dna list_id', is_array($dna) && ($dna['list_id'] ?? null) === 'list-1');

$bad = ApeCmafBootstrap::ensure($ch, 'file:///etc/passwd', $cmaf, [], $metrics, '', false);
$check('rejects non-http origin', $bad === false);

@unlink($metrics . '/' . $ch . '/origin_url.txt');
@unlink($metrics . '/' . $ch . '/target_dna.json');
@rmdir($metrics . '/' . $ch);
@rmdir($metrics);
@rmdir($cmaf);

echo $fail === 0 ? "ALL_OK\n" : "FAILURES={$fail}\n";
exit($fail === 0 ? 0 : 1);

<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/ape_window.php';

$fail = 0;
$check = static function (string $name, bool $ok) use (&$fail): void {
    echo ($ok ? 'PASS ' : 'FAIL ') . $name . "\n";
    if (!$ok) {
        $fail++;
    }
};

$base = '/dev/shm/ape_window_test_' . getmypid();
$ch = 'I02-TEST';
$dir = $base . '/' . $ch;
@mkdir($dir, 0770, true);
for ($i = 1; $i <= 45; $i++) {
    file_put_contents(sprintf('%s/chunk-%05d.m4s', $dir, $i), str_repeat('x', 16));
}

$window = new ApeWindow($base);
$check('initial 45 segments', count($window->segments($ch)) === 45);

$result = $window->prune($ch);
$check('prune deletes down to 30', $result['deleted'] === 15 && $result['remaining'] === 30);
$check('oldest removed', !is_file($dir . '/chunk-00001.m4s'));
$check('newest retained', is_file($dir . '/chunk-00045.m4s'));

$again = $window->prune($ch);
$check('normal prune is idempotent', $again['deleted'] === 0 && $again['remaining'] === 30);

$check('state write', $window->writeState($ch, ['last_delivered' => 45]));
$state = $window->readState($ch);
$check('state read', is_array($state) && ($state['last_delivered'] ?? null) === 45);

$deleted = $window->resetOnChannelChange($ch);
$check('channel change clears 30 segments', $deleted === 30);
$check('channel change clears state', $window->readState($ch) === null);

@unlink($dir . '/.ape_window.json');
@rmdir($dir);
@rmdir($base);

echo $fail === 0 ? "ALL_OK\n" : "FAILURES={$fail}\n";
exit($fail === 0 ? 0 : 1);

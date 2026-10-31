<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/ape_resume.php';

$fail = 0;
$check = static function (string $name, bool $ok) use (&$fail): void {
    echo ($ok ? 'PASS ' : 'FAIL ') . $name . "\n";
    if (!$ok) {
        $fail++;
    }
};

$segments = [];
for ($i = 100; $i <= 110; $i++) {
    $segments[] = '/dev/shm/fake/chunk-stream0-' . $i . '.m4s';
}

$window = ApeResume::window($segments, 106);
$check('window starts at 106', count($window) === 5 && ApeResume::firstSequence($window) === 106);
$check('window excludes 105', !in_array('/dev/shm/fake/chunk-stream0-105.m4s', $window, true));
$check('window includes 110', in_array('/dev/shm/fake/chunk-stream0-110.m4s', $window, true));

$fallback = ApeResume::window($segments, 999);
$check('missing resume falls back to last 5', count($fallback) === 5 && ApeResume::firstSequence($fallback) === 106);

$noCursor = ApeResume::window($segments, 1);
$check('no cursor keeps last 5', count($noCursor) === 5 && ApeResume::firstSequence($noCursor) === 106);

$urls = ApeResume::prefetchUrls('https://example.test/seg', 'CH 1', 105, 2);
$check('prefetch has 2 URLs', count($urls) === 2);
$check('prefetch URL +1', str_contains($urls[0], 'chunk-stream0-106.m4s') && str_contains($urls[0], 'sid=CH%201'));
$check('prefetch URL +2', str_contains($urls[1], 'chunk-stream0-107.m4s'));

echo $fail === 0 ? "ALL_OK\n" : "FAILURES={$fail}\n";
exit($fail === 0 ? 0 : 1);

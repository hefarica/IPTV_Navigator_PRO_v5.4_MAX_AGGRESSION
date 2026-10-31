<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/ape_hls_timing.php';

$fail = 0;
$check = static function (string $name, bool $ok) use (&$fail): void {
    echo ($ok ? 'PASS ' : 'FAIL ') . $name . "\n";
    if (!$ok) {
        $fail++;
    }
};

$check('dna 6 -> target 6', ApeHlsTiming::targetDuration(['seg_dur' => 6]) === 6);
$check('dna 4 -> target 4', ApeHlsTiming::targetDuration(['seg_dur' => 4]) === 4);
$check('dna 1 clamps to 6', ApeHlsTiming::targetDuration(['seg_dur' => 1]) === 6);
$check('dna 20 clamps to 6', ApeHlsTiming::targetDuration(['seg_dur' => 20]) === 6);
$check('missing dna -> 6', ApeHlsTiming::targetDuration([]) === 6);
$check('independent false by default', ApeHlsTiming::independentSegments([]) === false);
$check('independent true only when proven', ApeHlsTiming::independentSegments(['independent_segments' => true]) === true);

echo $fail === 0 ? "ALL_OK\n" : "FAILURES={$fail}\n";
exit($fail === 0 ? 0 : 1);

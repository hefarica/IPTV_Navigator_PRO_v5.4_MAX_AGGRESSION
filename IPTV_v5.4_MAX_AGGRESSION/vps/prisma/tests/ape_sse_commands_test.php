<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/ape_sse_commands.php';

$fail = 0;
$check = static function (string $name, bool $ok) use (&$fail): void {
    echo ($ok ? 'PASS ' : 'FAIL ') . $name . "\n";
    if (!$ok) {
        $fail++;
    }
};

$check('PRE_FILL_MAX allowed', ApeSseCommands::isAllowed('PRE_FILL_MAX'));
$check('CRYSTAL-UHD-MAX allowed', ApeSseCommands::isAllowed('CRYSTAL-UHD-MAX'));
$check('unknown rejected', !ApeSseCommands::isAllowed('DROP_TABLE'));

$out = ApeSseCommands::normalize('PRE_FILL_MAX', ['segments' => 12, 'requested_at' => '2026-10-31T16:00:00Z']);
$check('normalizes segments', is_array($out) && ($out['segments'] ?? null) === 12);
$check('keeps command', is_array($out) && ($out['command'] ?? null) === 'PRE_FILL_MAX');

$fromDelta = ApeSseCommands::fromDelta('EMERGENCY_FILL', ['buffer_pct' => 3]);
$check('fromDelta accepts command', is_array($fromDelta) && ($fromDelta['command'] ?? null) === 'EMERGENCY_FILL');
$check('fromDelta keeps buffer', is_array($fromDelta) && ($fromDelta['buffer_pct'] ?? null) === 3);
$check('fromDelta rejects unknown', ApeSseCommands::fromDelta('policy.delta', ['command' => 'rm -rf /']) === null);
$check('normalize rejects unknown', ApeSseCommands::normalize('rm -rf /', []) === null);

echo $fail === 0 ? "ALL_OK\n" : "FAILURES={$fail}\n";
exit($fail === 0 ? 0 : 1);

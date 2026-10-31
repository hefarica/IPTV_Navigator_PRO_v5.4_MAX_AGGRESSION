<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/ape_cursor.php';

$fail = 0;
$check = static function (string $name, bool $ok) use (&$fail): void {
    echo ($ok ? 'PASS ' : 'FAIL ') . $name . "\n";
    if (!$ok) {
        $fail++;
    }
};

$ipA = '203.0.113.10';
$ipB = '203.0.113.11';
$ch  = 'I01-TEST';

ApeCursor::clear($ipA, $ch);
ApeCursor::clear($ipB, $ch);

$check('key is md5(ip+ch)' , ApeCursor::key($ipA, $ch) === md5($ipA . '+' . $ch));
$check('different clients -> different keys', ApeCursor::key($ipA, $ch) !== ApeCursor::key($ipB, $ch));

$check('write client A', ApeCursor::write($ipA, $ch, [
    'media_sequence' => 41,
    'segment_uri' => '/seg/41.ts',
    'byte_offset' => 1234,
    'pts' => 90000,
    'program_date_time' => '2026-10-31T15:00:00.000Z',
    'last_delivered' => 41,
]));

$cursorA = ApeCursor::read($ipA, $ch);
$cursorB = ApeCursor::read($ipB, $ch);
$check('read client A', is_array($cursorA) && ($cursorA['last_delivered'] ?? null) === 41);
$check('client A resumes at 42', ApeCursor::startSequence($cursorA) === 42);
$check('client B is isolated', $cursorB === null);
$check('client B starts at 1', ApeCursor::startSequence($cursorB) === 1);

$path = ApeCursor::path($ipA, $ch);
@touch($path, time() - (ApeCursor::TTL_S + 1));
$check('expired cursor is null', ApeCursor::read($ipA, $ch) === null);
$check('expired cursor file removed', !is_file($path));

ApeCursor::clear($ipA, $ch);
ApeCursor::clear($ipB, $ch);
$check('cleanup A', ApeCursor::read($ipA, $ch) === null);
$check('cleanup B', ApeCursor::read($ipB, $ch) === null);

$headers = [
    'HTTP_X_APE_RESUME_SEQ' => '77',
    'HTTP_X_APE_CURSOR' => '/seg/77.ts',
];
$check('writeFromHeaders writes cursor', ApeCursor::writeFromHeaders($ipA, $ch, $headers) === true);
$fromHeaders = ApeCursor::read($ipA, $ch);
$check('header cursor last_delivered 77', is_array($fromHeaders) && ($fromHeaders['last_delivered'] ?? null) === 77);
$check('header cursor segment_uri', is_array($fromHeaders) && ($fromHeaders['segment_uri'] ?? null) === '/seg/77.ts');
$check('missing header does not write', ApeCursor::writeFromHeaders($ipA, $ch, []) === false);
ApeCursor::clear($ipA, $ch);

echo $fail === 0 ? "ALL_OK\n" : "FAILURES={$fail}\n";
exit($fail === 0 ? 0 : 1);

<?php
// F-consolidation: apply user's values to the live quality-manifest.json
// Changes: peak_luminance=8000, color_depth=10, enable_dolby_atmos=0
// Safe: backup + only touches those 3 keys + regenerates hash/pending.
$f = '/var/www/html/prisma/quality-manifest.json';
if (!is_file($f)) { fwrite(STDERR, "manifest not found\n"); exit(1); }
$bak = $f . '.bak_' . date('Ymd_His') . '_PRE_USERVALS';
copy($f, $bak);
$data = json_decode(file_get_contents($f), true);
if (!isset($data['manifest']) || !is_array($data['manifest'])) { fwrite(STDERR, "bad manifest\n"); exit(1); }

$want = ['peak_luminance' => '8000', 'color_depth' => '10', 'enable_dolby_atmos' => '0'];
$changed = [];
foreach ($data['manifest'] as &$s) {
    if (isset($s['key'], $want[$s['key']])) {
        $old = $s['value'];
        $s['value'] = $want[$s['key']];
        $changed[] = $s['key'] . ': ' . $old . ' -> ' . $s['value'];
    }
}
unset($s);

$data['saved_at'] = date('c');
$data['saved_by'] = 'consolidation_uservals_20260521';
file_put_contents($f, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

$hash = md5_file($f);
file_put_contents('/var/www/html/prisma/quality-manifest.hash', $hash);
@chmod('/var/www/html/prisma/quality-manifest.hash', 0644);
file_put_contents('/var/www/html/prisma/quality-manifest.pending', '1');

echo "backup: $bak\n";
echo "changed:\n  " . implode("\n  ", $changed) . "\n";
echo "new hash: $hash\n";
echo "total settings: " . count($data['manifest']) . "\n";

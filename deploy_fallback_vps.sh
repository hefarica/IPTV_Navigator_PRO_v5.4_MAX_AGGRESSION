#!/usr/bin/env bash
set -euo pipefail
TS=$(date -u +%Y%m%dT%H%M%SZ)
BASE=/var/www/m3u8
cp -a "$BASE/ape_profiles.php" "$BASE/ape_profiles.php.bak_$TS"
cp -a "$BASE/ape_hls_generators.php" "$BASE/ape_hls_generators.php.bak_$TS"
install -m 644 /tmp/ape_fallback_matrix.php "$BASE/ape_fallback_matrix.php"
python3 - <<'PY'
from pathlib import Path
p = Path('/var/www/m3u8/ape_profiles.php')
s = p.read_text()
repls = [
    ("'codec_v'  => 'hvc1.2.4.L183.B0',\n        'codec_vf' => 'hvc1.2.4.L180.B0',",
     "'codec_v'  => 'hvc1.2.4.L183.B0',\n        'codec_vf' => 'hvc1.2.4.L156.B0',"),
    ("'codec_v'  => 'hvc1.2.4.L153.B0',\n        'codec_vf' => 'avc1.640034',",
     "'codec_v'  => 'hvc1.2.4.L153.B0',\n        'codec_vf' => 'hvc1.2.4.L150.B0',"),
    ("'codec_v'  => 'hvc1.1.6.L120.B0',\n        'codec_vf' => 'avc1.640028',",
     "'codec_v'  => 'hvc1.2.4.L120.B0',\n        'codec_vf' => 'hvc1.2.4.L93.B0',"),
]
for a, b in repls:
    if a not in s:
        raise SystemExit('missing profile pattern: ' + a[:70])
    s = s.replace(a, b, 1)
p.write_text(s)

g = Path('/var/www/m3u8/ape_hls_generators.php')
s = g.read_text()
req = "require_once __DIR__ . '/ape_profiles.php';"
new_req = req + "\nrequire_once __DIR__ . '/ape_fallback_matrix.php';"
if new_req not in s:
    if req not in s:
        raise SystemExit('missing profiles require')
    s = s.replace(req, new_req, 1)
needle = '    $header .= "#EXT-X-APE-PROFILE-{$key}-CODEC-FALLBACK:{$p[\'codec_vf\']}\\n";'
add = needle + '''
    $fbChain = function_exists('ape_fallback_codecs')
        ? ape_fallback_codecs((string) $p['codec_v'], (string) $p['res'], (float) $p['fps'])
        : [];
    if ($fbChain) {
        $header .= "#EXT-X-APE-PROFILE-{$key}-CODEC-FALLBACK-CHAIN:" . implode(',', $fbChain) . "\\n";
        $header .= "#EXT-X-APE-PROFILE-{$key}-FALLBACK-POLICY:BEST_4K_THEN_NATIVE\\n";
    }'''
if 'CODEC-FALLBACK-CHAIN' not in s:
    if needle not in s:
        raise SystemExit('missing fallback line')
    s = s.replace(needle, add, 1)
g.write_text(s)
print('patched')
PY
php -l "$BASE/ape_profiles.php"
php -l "$BASE/ape_hls_generators.php"
php -l "$BASE/ape_fallback_matrix.php"
echo "backup=$TS"

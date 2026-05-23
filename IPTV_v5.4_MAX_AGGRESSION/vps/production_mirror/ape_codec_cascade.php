<?php
declare(strict_types=1);
/**
 * Module:       ape_codec_cascade.php (production mirror)
 * Purpose:      Server-side HEVC codec cascade CSV parser.
 *               Provides the same tier-resolution logic as ape-hevc-cascade.js
 *               so nginx/PHP can resolve codec strings without loading JS.
 *               Used by ape_hls_generators.php and resolve_quality_unified.php
 *               when quality-manifest.json is not yet seeded (cold start).
 * Relationship: Mirrors ape-hevc-cascade.js tier table. PHP-only, no JS runtime.
 *               GOLDEN RULE enforced: $tier['codec'] = hvc1.*, $tier['codec_hev1'] = hev1.*
 */

// ── 13-tier ascending cascade (T1=min L30, T9=CORONA 4K@60, T13=8K@120) ────
// Codec strings must match ape-hevc-cascade.js DEFAULT_CASCADE exactly.
const APE_CODEC_CASCADE = [
    // tier, codec (hvc1—STREAM-INF), codec_hev1 (hev1—KODIPROP/EXTVLCOPT), label
    ['tier'=>1,  'codec'=>'hvc1.2.4.L30.B0',  'codec_hev1'=>'hev1.2.4.L30.B0',  'label'=>'Sub-QVGA  128×96'],
    ['tier'=>2,  'codec'=>'hvc1.2.4.L60.B0',  'codec_hev1'=>'hev1.2.4.L60.B0',  'label'=>'QVGA      320×180'],
    ['tier'=>3,  'codec'=>'hvc1.2.4.L63.B0',  'codec_hev1'=>'hev1.2.4.L63.B0',  'label'=>'480p      854×480'],
    ['tier'=>4,  'codec'=>'hvc1.2.4.L90.B0',  'codec_hev1'=>'hev1.2.4.L90.B0',  'label'=>'720p@30   1280×720'],
    ['tier'=>5,  'codec'=>'hvc1.2.4.L93.B0',  'codec_hev1'=>'hev1.2.4.L93.B0',  'label'=>'720p@60   1280×720'],
    ['tier'=>6,  'codec'=>'hvc1.2.4.L120.B0', 'codec_hev1'=>'hev1.2.4.L120.B0', 'label'=>'FHD@30    1920×1080'],
    ['tier'=>7,  'codec'=>'hvc1.2.4.L123.B0', 'codec_hev1'=>'hev1.2.4.L123.B0', 'label'=>'FHD@60    1920×1080'],
    ['tier'=>8,  'codec'=>'hvc1.2.4.L150.B0', 'codec_hev1'=>'hev1.2.4.L150.B0', 'label'=>'4K@30     3840×2160'],
    ['tier'=>9,  'codec'=>'hvc1.2.4.L153.B0', 'codec_hev1'=>'hev1.2.4.L153.B0', 'label'=>'4K@60 CORONA'],
    ['tier'=>10, 'codec'=>'hvc1.2.4.L156.B0', 'codec_hev1'=>'hev1.2.4.L156.B0', 'label'=>'4K@120    3840×2160'],
    ['tier'=>11, 'codec'=>'hvc1.2.4.L180.B0', 'codec_hev1'=>'hev1.2.4.L180.B0', 'label'=>'8K@30     7680×4320'],
    ['tier'=>12, 'codec'=>'hvc1.2.4.L183.B0', 'codec_hev1'=>'hev1.2.4.L183.B0', 'label'=>'8K@60     7680×4320'],
    ['tier'=>13, 'codec'=>'hvc1.2.4.L186.B0', 'codec_hev1'=>'hev1.2.4.L186.B0', 'label'=>'8K@120    7680×4320'],
];

const CORONA_TIER_NUMBER = 9;  // T9 = hvc1.2.4.L153.B0 = 4K@60 UHD

/**
 * Return a tier entry by tier number.
 * @param int $tierNum  1–13
 * @return array|null
 */
function ape_get_tier(int $tierNum): ?array {
    foreach (APE_CODEC_CASCADE as $t) {
        if ($t['tier'] === $tierNum) return $t;
    }
    return null;
}

/**
 * Resolve the codec tier for a given profile + resolution + fps.
 * Returns tier array with 'codec' (hvc1—STREAM-INF) and 'codec_hev1' (hev1—runtime).
 *
 * @param string $profile     P0-P5 or AUTO
 * @param string $resolution  WxH (e.g. '3840x2160')
 * @param float  $fps
 * @return array
 */
function ape_resolve_tier(string $profile, string $resolution = '1920x1080', float $fps = 30.0): array {
    $fallback = ape_get_tier(6) ?? APE_CODEC_CASCADE[5]; // FHD@30

    $height = 1080;
    if (preg_match('/^\d+x(\d+)$/', $resolution, $m)) {
        $height = (int)$m[1];
    }

    $target = match (strtoupper($profile)) {
        'P0'    => ($fps >= 100) ? 10 : CORONA_TIER_NUMBER,
        'P1'    => ($height >= 2160) ? CORONA_TIER_NUMBER : 8,
        'P2'    => ($fps >= 60) ? 7 : 8,
        'P3'    => ($fps >= 60) ? 7 : 6,
        'P4'    => 5,
        'P5'    => 3,
        default => ($height >= 2160) ? CORONA_TIER_NUMBER : (($height >= 1080) ? 6 : 4),
    };

    return ape_get_tier($target) ?? $fallback;
}

/**
 * Build codec string for #EXT-X-STREAM-INF CODECS attribute.
 * Appends audio codec.
 *
 * @param string $profile
 * @param string $resolution
 * @param float  $fps
 * @param string $audioCodec  e.g. 'mp4a.40.2'
 * @return string  e.g. 'hvc1.2.4.L153.B0,mp4a.40.2'
 */
function ape_stream_inf_codecs(
    string $profile,
    string $resolution = '1920x1080',
    float  $fps        = 30.0,
    string $audioCodec = 'mp4a.40.2'
): string {
    $tier = ape_resolve_tier($profile, $resolution, $fps);
    // hvc1.* ONLY in STREAM-INF (GOLDEN RULE)
    return $tier['codec'] . ',' . $audioCodec;
}

/**
 * Parse a 7-column dual cascade CSV (same format as frontend ape-hevc-cascade.js).
 * Columns: Tier;Codec String hvc1;Codec String hev1;Profile;Level;Capacidad;Rol
 *
 * @param string $csv  Raw CSV content
 * @return array       Parsed tier objects
 */
function ape_parse_cascade_csv(string $csv): array {
    $tiers = [];
    $lines = preg_split('/\r?\n/', trim($csv));
    if (empty($lines)) return [];

    // Detect header
    $startIdx = 0;
    if (!is_numeric(trim(explode(';', $lines[0])[0] ?? ''))) {
        $startIdx = 1; // Skip header row
    }

    for ($i = $startIdx; $i < count($lines); $i++) {
        $cols = explode(';', trim($lines[$i]));
        if (count($cols) < 2) continue;
        $tierNum = (int)trim($cols[0]);
        $hvc1    = trim($cols[1] ?? '');
        $hev1    = trim($cols[2] ?? '') ?: str_replace('hvc1.', 'hev1.', $hvc1);
        if ($tierNum < 1 || $tierNum > 20 || $hvc1 === '') continue;
        $tiers[] = [
            'tier'       => $tierNum,
            'codec'      => $hvc1,      // hvc1.* — STREAM-INF
            'codec_hev1' => $hev1,      // hev1.* — KODIPROP/EXTVLCOPT
            'profile'    => trim($cols[3] ?? ''),
            'level'      => trim($cols[4] ?? ''),
            'label'      => trim($cols[6] ?? $cols[5] ?? ''),
        ];
    }

    usort($tiers, fn($a, $b) => $a['tier'] <=> $b['tier']);
    return $tiers;
}

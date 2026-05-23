<?php
declare(strict_types=1);
/**
 * Module:       resolve_quality_unified.php
 * Purpose:      Unified quality resolution endpoint — extends resolve.php with cascade
 *               lookup and PERCEPTUAL 4K mode. Delegates core Xtream credential / token
 *               logic to resolve.php; this wrapper adds the codec-cascade tier overlay.
 * Relationship: Called by generator JS via EXTATTRFROMURL when cascade mode is active.
 *               Reads quality-manifest.json written by prisma-adb-quality.php.
 *               Mirrors: vps/production_mirror/resolve_quality_unified.php
 */

$start = microtime(true);

// ── Cascade manifest (written by prisma-adb-quality.php save_manifest) ──────
define('QUALITY_MANIFEST_PATH', '/var/www/html/prisma/quality-manifest.json');
define('CASCADE_CACHE_TTL', 30);

/**
 * Load the codec cascade from the quality manifest JSON.
 * Returns array of tier objects [{tier, codec, codec_hev1, profile, level, ...}]
 * or empty array on failure.
 */
function loadCascadeFromManifest(): array {
    static $cache = null;
    static $cacheTs = 0;

    $now = time();
    if ($cache !== null && ($now - $cacheTs) < CASCADE_CACHE_TTL) {
        return $cache;
    }

    if (!is_file(QUALITY_MANIFEST_PATH)) {
        $cache = [];
        $cacheTs = $now;
        return [];
    }

    $raw = file_get_contents(QUALITY_MANIFEST_PATH);
    if ($raw === false) {
        $cache = [];
        $cacheTs = $now;
        return [];
    }

    $data = json_decode($raw, true);
    if (!is_array($data) || empty($data['codec_cascade'])) {
        $cache = [];
        $cacheTs = $now;
        return [];
    }

    $cache   = $data['codec_cascade'];
    $cacheTs = $now;
    return $cache;
}

/**
 * Resolve codec tier for a given profile + resolution + fps.
 * Returns ['codec' => 'hvc1.2.4.Lxxx.B0', 'codec_hev1' => 'hev1.2.4.Lxxx.B0', 'tier' => N]
 * Falls back to safe hvc1.2.4.L120.B0 (FHD) on any failure.
 *
 * GOLDEN RULE: codec = hvc1.* for STREAM-INF / codec_hev1 = hev1.* for runtime.
 */
function resolveCascadeTier(string $profile, string $resolution = '1920x1080', float $fps = 30.0): array {
    $fallback = ['codec' => 'hvc1.2.4.L120.B0', 'codec_hev1' => 'hev1.2.4.L120.B0', 'tier' => 6];

    $cascade = loadCascadeFromManifest();
    if (empty($cascade)) {
        return $fallback;
    }

    // Parse resolution
    $width = 0; $height = 0;
    if (preg_match('/^(\d+)x(\d+)$/', $resolution, $m)) {
        $width  = (int)$m[1];
        $height = (int)$m[2];
    }

    // Target tier by profile + resolution
    $targetTier = 6; // Default FHD@30
    switch (strtoupper($profile)) {
        case 'P0':
            $targetTier = ($fps >= 100) ? 10 : 9;  // 4K@120 or CORONA 4K@60
            break;
        case 'P1':
            $targetTier = ($height >= 2160) ? 9 : 8;
            break;
        case 'P2':
            $targetTier = ($fps >= 60) ? 7 : 8;
            break;
        case 'P3':
            $targetTier = ($fps >= 60) ? 7 : 6;
            break;
        case 'P4':
            $targetTier = 5;
            break;
        case 'P5':
            $targetTier = 3;
            break;
        default:
            $targetTier = ($height >= 2160) ? 9 : (($height >= 1080) ? 6 : 4);
    }

    // Find tier in cascade array (ascending: tier 1=min, tier 9=CORONA, tier 13=8K)
    foreach ($cascade as $entry) {
        if (!isset($entry['tier'])) continue;
        if ((int)$entry['tier'] === $targetTier) {
            $hvc1 = $entry['codec']      ?? $entry['codec_hvc1'] ?? 'hvc1.2.4.L120.B0';
            $hev1 = $entry['codec_hev1'] ?? str_replace('hvc1.', 'hev1.', $hvc1);
            return ['codec' => $hvc1, 'codec_hev1' => $hev1, 'tier' => $targetTier];
        }
    }

    return $fallback;
}

// ── Request parameters ────────────────────────────────────────────────────────
$profile    = strtoupper(trim($_GET['p']        ?? $_GET['profile'] ?? 'AUTO'));
$resolution = trim($_GET['res']                 ?? '1920x1080');
$fps        = (float)($_GET['fps']              ?? 30.0);
$mode       = trim($_GET['mode']                ?? 'quality');
$p4k        = (isset($_GET['p4k']) && $_GET['p4k'] === '1');

// ── JSON-only mode: return resolved tier ────────────────────────────────────
if ($mode === 'quality' || $mode === 'cascade') {
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    header('Access-Control-Allow-Origin: *');

    $tier = resolveCascadeTier($profile, $resolution, $fps);

    // PERCEPTUAL 4K: add ADB HDR display mode directives
    $adbDirectives = [];
    if ($p4k) {
        $adbDirectives = [
            'settings put global display_mode_hdr 1',
            'settings put global display_mode_resolution 2160',
            'settings put secure display_color_mode 1',
        ];
    }

    $elapsed = round((microtime(true) - $start) * 1000, 2);
    echo json_encode([
        'ok'            => true,
        'profile'       => $profile,
        'resolution'    => $resolution,
        'fps'           => $fps,
        'tier'          => $tier['tier'],
        'codec'         => $tier['codec'],         // hvc1.* for STREAM-INF
        'codec_hev1'    => $tier['codec_hev1'],    // hev1.* for KODIPROP/EXTVLCOPT
        'perceptual_4k' => $p4k,
        'adb_directives'=> $adbDirectives,
        'elapsed_ms'    => $elapsed,
        'source'        => 'resolve_quality_unified',
    ], JSON_UNESCAPED_SLASHES);
    exit;
}

// ── M3U fragment mode: delegate to resolve.php ───────────────────────────────
// Core credential/token resolution stays in resolve.php (Single Source of Truth).
// This wrapper only overlays the codec tier before output.
if (is_file(__DIR__ . '/resolve.php')) {
    require __DIR__ . '/resolve.php';
}

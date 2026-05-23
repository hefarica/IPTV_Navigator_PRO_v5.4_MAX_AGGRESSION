<?php
declare(strict_types=1);
/**
 * Module:       resolve_quality_unified.php (production mirror)
 * Purpose:      Production mirror of vps/resolve_quality_unified.php.
 *               Delegates to this directory's resolve.php for credential/token logic.
 * Relationship: Served by production nginx; reads same quality-manifest.json as VPS.
 *               Source of truth: vps/resolve_quality_unified.php
 */

// Delegate to vps/resolve_quality_unified.php behavior via local resolve.php
// Production mirror keeps same API surface with local path adjustments.

define('QUALITY_MANIFEST_PATH', '/var/www/html/prisma/quality-manifest.json');
define('CASCADE_CACHE_TTL', 30);

function loadCascadeFromManifest(): array {
    static $cache = null;
    static $cacheTs = 0;
    $now = time();
    if ($cache !== null && ($now - $cacheTs) < CASCADE_CACHE_TTL) return $cache;
    if (!is_file(QUALITY_MANIFEST_PATH)) { $cache = []; $cacheTs = $now; return []; }
    $raw = file_get_contents(QUALITY_MANIFEST_PATH);
    if ($raw === false)  { $cache = []; $cacheTs = $now; return []; }
    $data = json_decode($raw, true);
    if (!is_array($data) || empty($data['codec_cascade'])) { $cache = []; $cacheTs = $now; return []; }
    $cache = $data['codec_cascade']; $cacheTs = $now;
    return $cache;
}

function resolveCascadeTier(string $profile, string $resolution = '1920x1080', float $fps = 30.0): array {
    $fallback = ['codec' => 'hvc1.2.4.L120.B0', 'codec_hev1' => 'hev1.2.4.L120.B0', 'tier' => 6];
    $cascade = loadCascadeFromManifest();
    if (empty($cascade)) return $fallback;

    $height = 0;
    if (preg_match('/^\d+x(\d+)$/', $resolution, $m)) $height = (int)$m[1];

    $targetTier = match (strtoupper($profile)) {
        'P0'    => ($fps >= 100) ? 10 : 9,
        'P1'    => ($height >= 2160) ? 9 : 8,
        'P2'    => ($fps >= 60) ? 7 : 8,
        'P3'    => ($fps >= 60) ? 7 : 6,
        'P4'    => 5,
        'P5'    => 3,
        default => ($height >= 2160) ? 9 : (($height >= 1080) ? 6 : 4),
    };

    foreach ($cascade as $entry) {
        if (isset($entry['tier']) && (int)$entry['tier'] === $targetTier) {
            $hvc1 = $entry['codec'] ?? $entry['codec_hvc1'] ?? 'hvc1.2.4.L120.B0';
            $hev1 = $entry['codec_hev1'] ?? str_replace('hvc1.', 'hev1.', $hvc1);
            return ['codec' => $hvc1, 'codec_hev1' => $hev1, 'tier' => $targetTier];
        }
    }
    return $fallback;
}

$start   = microtime(true);
$profile = strtoupper(trim($_GET['p']    ?? $_GET['profile'] ?? 'AUTO'));
$res     = trim($_GET['res']             ?? '1920x1080');
$fps     = (float)($_GET['fps']          ?? 30.0);
$mode    = trim($_GET['mode']            ?? 'quality');
$p4k     = (isset($_GET['p4k']) && $_GET['p4k'] === '1');

if ($mode === 'quality' || $mode === 'cascade') {
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    header('Access-Control-Allow-Origin: *');

    $tier = resolveCascadeTier($profile, $res, $fps);
    $adb  = $p4k ? [
        'settings put global display_mode_hdr 1',
        'settings put global display_mode_resolution 2160',
        'settings put secure display_color_mode 1',
    ] : [];

    echo json_encode([
        'ok'            => true,
        'profile'       => $profile,
        'resolution'    => $res,
        'fps'           => $fps,
        'tier'          => $tier['tier'],
        'codec'         => $tier['codec'],      // hvc1.* — STREAM-INF only (GOLDEN RULE)
        'codec_hev1'    => $tier['codec_hev1'], // hev1.* — KODIPROP/EXTVLCOPT only
        'perceptual_4k' => $p4k,
        'adb_directives'=> $adb,
        'elapsed_ms'    => round((microtime(true) - $start) * 1000, 2),
        'source'        => 'resolve_quality_unified_mirror',
    ], JSON_UNESCAPED_SLASHES);
    exit;
}

if (is_file(__DIR__ . '/resolve.php')) {
    require __DIR__ . '/resolve.php';
}

<?php
/**
 * Resolve v7.1 — ATOMIC CREDENTIAL RESOLVER (HTTP 200)
 *
 * ARCHITECTURE:
 *   Lista M3U8 = Autoridad Estática (EXTVLCOPT, KODIPROP, codecs, filtros, HDR)
 *   Resolver   = Puente Dinámico (credenciales, buffer adaptativo)
 *
 * PROHIBIDO: Redirecciones (301/302), directivas estáticas, proxy/fetch
 * OBLIGATORIO: HTTP 200 con fragmento M3U mínimo
 */

declare(strict_types=1);

$start = microtime(true);

// ═══════════════════════════════════════════════════════════════════════
// 1. FUNCIONES CORE
// ═══════════════════════════════════════════════════════════════════════

function q(string $k, string $default = ''): string {
    return isset($_GET[$k]) ? trim((string)$_GET[$k]) : $default;
}

/**
 * Decodifica el srv token: base64(host|user|pass)
 */
function decodeSrvToken(string $token): ?array {
    if ($token === '') return null;
    $decoded = base64_decode($token, true);
    if ($decoded === false) return null;
    $parts = explode('|', $decoded, 3);
    if (count($parts) !== 3) return null;
    $host = trim($parts[0]);
    $user = trim($parts[1]);
    $pass = trim($parts[2]);
    if ($host === '' || $user === '' || $pass === '') return null;
    if (!preg_match('/^[A-Za-z0-9._:-]{3,128}$/', $host)) return null;
    return ['host' => $host, 'user' => $user, 'pass' => $pass];
}

// ═══════════════════════════════════════════════════════════════════════
// 2. LEGACY ORIGINS FALLBACK
//    Si no llega srv token, usar origins hardcoded
// ═══════════════════════════════════════════════════════════════════════

const ORIGINS = [
    // [host, user, pass]
    ['line.tivi-ott.net',            '3JHFTC',        'U56BDP'],
    ['line.dndnscloud.ru',           'f828e5e261',     'e1372a7053f1'],
    ['126958958431.4k-26com.com:80', 'ujgd4kiltx',    'p5c00kxjc7'],
];

function resolveFromOrigins(string $requestedHost): array {
    foreach (ORIGINS as $entry) {
        if (is_array($entry) && count($entry) >= 3 && $entry[0] === $requestedHost) {
            return ['host' => $entry[0], 'user' => $entry[1], 'pass' => $entry[2]];
        }
    }
    // Default: first origin
    if (!empty(ORIGINS) && is_array(ORIGINS[0]) && count(ORIGINS[0]) >= 3) {
        return ['host' => ORIGINS[0][0], 'user' => ORIGINS[0][1], 'pass' => ORIGINS[0][2]];
    }
    return ['host' => '', 'user' => '', 'pass' => ''];
}

// ═══════════════════════════════════════════════════════════════════════
// 3. INPUT
// ═══════════════════════════════════════════════════════════════════════

$ch       = q('ch', '');
$sid      = q('sid', $ch);
$srvToken = q('srv', '');
$origin   = q('origin', '');
$bw_kbps  = (int)q('bw_kbps', '100000');
$profile  = q('p', 'P2');
$labelReq = q('label', '');

// CORS
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: *');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($ch === '') {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo "ERR: missing ch\n";
    exit;
}

// ═══════════════════════════════════════════════════════════════════════
// 4. RESOLVE CREDENTIALS — srv token first, ORIGINS fallback
// ═══════════════════════════════════════════════════════════════════════

$creds = decodeSrvToken($srvToken);

if ($creds === null) {
    // Fallback: try ORIGINS with origin param or default
    $requestedHost = ($origin !== '' && preg_match('/^[A-Za-z0-9._:-]{1,128}$/', $origin))
        ? $origin
        : ((!empty(ORIGINS) && is_array(ORIGINS[0])) ? ORIGINS[0][0] : '');
    $creds = resolveFromOrigins($requestedHost);
}

if ($creds['host'] === '' || $creds['user'] === '' || $creds['pass'] === '') {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo "ERR: no valid credentials (srv token or ORIGINS)\n";
    exit;
}

$streamId = $sid;

// URL final — directa, limpia
$finalUrl = "http://" . $creds['host'] . "/live/"
    . rawurlencode($creds['user']) . "/"
    . rawurlencode($creds['pass']) . "/"
    . rawurlencode($streamId) . ".m3u8";

// ═══════════════════════════════════════════════════════════════════════
// 5. DYNAMIC PARAMETERS ONLY
// ═══════════════════════════════════════════════════════════════════════

$networkCaching = match (true) {
    $bw_kbps < 5000  => 10000,
    $bw_kbps < 15000 => 30000,
    $bw_kbps < 50000 => 45000,
    default          => 60000
};

$liveCaching = (int)($networkCaching * 0.8);

$uaIn = $_SERVER['HTTP_USER_AGENT'] ?? '';
$deviceClass = 'generic_tv';
if (stripos($uaIn, 'AFT') !== false) $deviceClass = 'firetv_4k';
elseif (stripos($uaIn, 'Android TV') !== false || stripos($uaIn, 'Leanback') !== false) $deviceClass = 'onn_4k';

$uaOut = match ($deviceClass) {
    'firetv_4k' => 'Mozilla/5.0 (Linux; Android 11; AFTKM) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'onn_4k'    => 'Mozilla/5.0 (Linux; Android 12; Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    default     => 'Mozilla/5.0 (Linux; Android 11; TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

$sessionId = 'SES_' . bin2hex(random_bytes(8));
$exthttp = [
    'User-Agent'            => $uaOut,
    'Origin'                => 'http://' . $creds['host'],
    'Referer'               => 'http://' . $creds['host'] . '/',
    'Accept'                => 'application/vnd.apple.mpegurl;q=1.0, */*;q=0.1',
    'Connection'            => 'keep-alive',
    'X-Playback-Session-Id' => $sessionId,
    'X-Bandwidth-Available' => (string)$bw_kbps,
    'X-Device-Class'        => $deviceClass,
    'X-Resolver-Mode'       => 'ATOMIC_200',
    'X-Resolver-Version'    => '7.1',
];

// ═══════════════════════════════════════════════════════════════════════
// 6. OUTPUT — HTTP 200 ALWAYS
// ═══════════════════════════════════════════════════════════════════════

header('Content-Type: application/x-mpegURL; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=3');
header('X-APE-Resolver: v7.1-ATOMIC');
http_response_code(200);

$labelFinal = $labelReq !== '' ? $labelReq : "Channel {$ch}";

echo "#EXTINF:-1 ape-resolver=\"v7.1\",{$labelFinal}\n";
echo '#EXTHTTP:' . json_encode($exthttp, JSON_UNESCAPED_SLASHES) . "\n";
echo "#EXTVLCOPT:http-user-agent={$uaOut}\n";
echo "#EXTVLCOPT:http-referrer=http://{$creds['host']}/\n";
echo "#EXTVLCOPT:network-caching={$networkCaching}\n";
echo "#EXTVLCOPT:live-caching={$liveCaching}\n";
echo "#EXTVLCOPT:http-reconnect=true\n";
echo "#EXTVLCOPT:http-continuous=true\n";
echo $finalUrl . "\n";

// ═══════════════════════════════════════════════════════════════════════
// 7. LOG
// ═══════════════════════════════════════════════════════════════════════
$duration = microtime(true) - $start;
$logEntry = sprintf("[%s] ch=%s host=%s bw=%d cache=%d ms=%.2f resolver=v7.1\n",
    date('Y-m-d H:i:s'), $ch, $creds['host'], $bw_kbps, $networkCaching, $duration * 1000);
if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
@file_put_contents('/var/log/iptv-ape/resolver.log', $logEntry, FILE_APPEND | LOCK_EX);
exit;

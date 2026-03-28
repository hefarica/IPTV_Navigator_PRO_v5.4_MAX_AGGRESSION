<?php
/**
 * Resolve Quality v7.1 — ATOMIC CREDENTIAL RESOLVER (HTTP 200)
 *
 * ARCHITECTURE:
 *   Lista M3U8 = Autoridad Estática (EXTVLCOPT, KODIPROP, codecs, filtros, HDR)
 *   Resolver   = Puente Dinámico (credenciales, buffer adaptativo, AI metrics)
 *
 * PROHIBIDO:
 *   - Redirecciones HTTP (301/302)
 *   - Inyección de directivas estáticas (codec, sharpen, contrast, HDR)
 *   - Proxy/fetch del manifiesto upstream
 *
 * FLUJO:
 *   1. Recibe &ch=ID &srv=base64(host|user|pass) &bw_kbps=N
 *   2. Decodifica credenciales del srv token
 *   3. Calcula parámetros dinámicos (buffer basado en BW real)
 *   4. Devuelve HTTP 200 con fragmento M3U mínimo + URL final
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
 * Mirrors the Xtream Codes API flow: frontend logs in → knows creds → passes them
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
// 2. INPUT — Parámetros de entrada
// ═══════════════════════════════════════════════════════════════════════

$ch       = q('ch', '');
$sid      = q('sid', $ch);       // Stream ID (numérico)
$srvToken = q('srv', '');        // base64(host|user|pass)
$bw_kbps  = (int)q('bw_kbps', '100000'); // Bandwidth actual en kbps
$profile  = q('p', 'P2');        // Perfil solicitado
$labelReq = q('label', '');      // Label del canal (opcional)

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
// 3. RESOLVER CREDENCIALES (Dinámico)
// ═══════════════════════════════════════════════════════════════════════

$creds = decodeSrvToken($srvToken);

if ($creds === null) {
    // Fallback: sin credenciales válidas
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo "ERR: invalid or missing srv token\n";
    exit;
}

$effectiveHost = $creds['host'];
$effectiveUser = $creds['user'];
$effectivePass = $creds['pass'];

// SID override: si se pasó un sid numérico explícito, usarlo
$streamId = $sid;

// Construir URL final (limpia, directa, sin proxy)
$finalUrl = "http://" . $effectiveHost . "/live/"
    . rawurlencode($effectiveUser) . "/"
    . rawurlencode($effectivePass) . "/"
    . rawurlencode($streamId) . ".m3u8";

// ═══════════════════════════════════════════════════════════════════════
// 4. PARÁMETROS DINÁMICOS (Lo único que el resolver inyecta)
//    Basados en el estado actual de la red, NO en config estática
// ═══════════════════════════════════════════════════════════════════════

// A. Buffer Adaptativo — basado en BW real del momento
$networkCaching = match (true) {
    $bw_kbps < 5000  => 10000,  // < 5 Mbps  → 10s buffer (inicio rápido)
    $bw_kbps < 15000 => 30000,  // < 15 Mbps → 30s buffer
    $bw_kbps < 50000 => 45000,  // < 50 Mbps → 45s buffer
    default          => 60000   // 50+ Mbps  → 60s buffer (seguridad máxima)
};

$liveCaching = (int)($networkCaching * 0.8);

// B. User-Agent (dinámico: depende del dispositivo que pide)
$uaIn = $_SERVER['HTTP_USER_AGENT'] ?? '';
$deviceClass = 'generic_tv';
if (stripos($uaIn, 'AFT') !== false) $deviceClass = 'firetv_4k';
elseif (stripos($uaIn, 'Android TV') !== false || stripos($uaIn, 'Leanback') !== false) $deviceClass = 'onn_4k';

$uaOut = match ($deviceClass) {
    'firetv_4k' => 'Mozilla/5.0 (Linux; Android 11; AFTKM) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'onn_4k'    => 'Mozilla/5.0 (Linux; Android 12; Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    default     => 'Mozilla/5.0 (Linux; Android 11; TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

// C. EXTHTTP Dinámicos (estado del sistema, AI, telemetría)
$sessionId = 'SES_' . bin2hex(random_bytes(8));
$exthttp = [
    // Identidad
    'User-Agent'               => $uaOut,
    'Origin'                   => 'http://' . $effectiveHost,
    'Referer'                  => 'http://' . $effectiveHost . '/',
    'Accept'                   => 'application/vnd.apple.mpegurl;q=1.0, audio/mpegurl;q=0.99, */*;q=0.1',
    'Connection'               => 'keep-alive',
    // Telemetría dinámica
    'X-Playback-Session-Id'    => $sessionId,
    'X-Bandwidth-Available'    => (string)$bw_kbps,
    'X-AI-Engine'              => 'v4.1',
    'X-AI-Profile'             => $profile,
    'X-Buffer-Strategy'        => 'ADAPTIVE_DYNAMIC',
    'X-Device-Class'           => $deviceClass,
    'X-Resolver-Mode'          => 'ATOMIC_200',
    'X-Resolver-Version'       => '7.1',
];

// ═══════════════════════════════════════════════════════════════════════
// 5. AI SUPER RESOLUTION ENGINE — Bandwidth-Reactive Metrics (Dinámico)
//    Inyecta señales de escalación al motor de buffer/modem
// ═══════════════════════════════════════════════════════════════════════

if (file_exists(__DIR__ . '/cmaf_engine/modules/ai_super_resolution_engine.php')) {
    require_once __DIR__ . '/cmaf_engine/modules/ai_super_resolution_engine.php';
}

$vlcopt_dynamic = [];

if (class_exists('AISuperResolutionEngine', false)) {
    // Determine height from profile for AI engine
    $profileHeights = ['P0' => 2160, 'P1' => 4320, 'P2' => 2160, 'P3' => 1080, 'P4' => 720, 'P5' => 480];
    $height = $profileHeights[strtoupper($profile)] ?? 1080;
    AISuperResolutionEngine::injectBandwidthMetrics(
        $bw_kbps, $height, $exthttp, $vlcopt_dynamic
    );
}

// ═══════════════════════════════════════════════════════════════════════
// 6. SALIDA ATÓMICA (HTTP 200) — Fragmento M3U mínimo
//    SOLO parámetros dinámicos. CERO directivas estáticas.
// ═══════════════════════════════════════════════════════════════════════

header('Content-Type: application/x-mpegURL; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=3');
header('X-APE-Refresh-Interval: 3');
header('X-APE-Resolver: v7.1-ATOMIC');
http_response_code(200); // SIEMPRE 200 — NUNCA 301/302

echo "#EXTM3U\n";

// EXTINF: identidad del canal
$labelFinal = $labelReq !== '' ? $labelReq : "Channel {$ch}";
echo '#EXTINF:-1 '
    . 'ape-profile="' . htmlspecialchars($profile) . '" '
    . 'ape-resolver="v7.1" '
    . ',' . $labelFinal . "\n";

// EXTHTTP: headers dinámicos (telemetría, AI, sesión)
echo '#EXTHTTP:' . json_encode($exthttp, JSON_UNESCAPED_SLASHES) . "\n";

// EXTVLCOPT Dinámicos: SOLO los que dependen del momento actual
echo "#EXTVLCOPT:http-user-agent=" . $uaOut . "\n";
echo "#EXTVLCOPT:http-referrer=http://" . $effectiveHost . "/\n";
echo "#EXTVLCOPT:network-caching=" . $networkCaching . "\n";
echo "#EXTVLCOPT:live-caching=" . $liveCaching . "\n";
echo "#EXTVLCOPT:http-reconnect=true\n";
echo "#EXTVLCOPT:http-continuous=true\n";

// AI Engine dynamic EXTVLCOPT (bandwidth escalation signals)
if (!empty($vlcopt_dynamic)) {
    echo implode("\n", $vlcopt_dynamic) . "\n";
}

// URL Final — directa, limpia, sin redirect
echo $finalUrl . "\n";

// ═══════════════════════════════════════════════════════════════════════
// 7. LOG (Non-blocking)
// ═══════════════════════════════════════════════════════════════════════
$duration = microtime(true) - $start;
$logEntry = sprintf("[%s] ch=%s sid=%s host=%s bw=%d cache=%d dev=%s ms=%.2f atomic=v7.1\n",
    date('Y-m-d H:i:s'), $ch, $streamId, $effectiveHost,
    $bw_kbps, $networkCaching, $deviceClass, $duration * 1000);
if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
@file_put_contents('/var/log/iptv-ape/resolver.log', $logEntry, FILE_APPEND | LOCK_EX);
exit;

<?php
/**
 * pulse-warm.php — calienta en SEGUNDO PLANO los canales que dieron 461/502.
 *
 * POR QUE EXISTE
 *   pulse.php ya sirve stale 60 s. Mas alla de eso, si el proveedor mantiene el
 *   throttle (461 medido), el siguiente zap vuelve a pagar 5 s o falla con 502.
 *   Este endpoint re-pide esos canales por detras y deja el manifest bueno en
 *   APCu, de modo que el proximo zap lo encuentre caliente.
 *
 * POR QUE ES UN ENDPOINT Y NO UN SCRIPT CLI
 *   APCu es memoria compartida POR SAPI. Un `php script.php` por CLI escribe en
 *   OTRA memoria: no la ve PHP-FPM. La unica forma de poblar el APCu que usa
 *   pulse.php es ejecutar dentro de FPM. De ahi este endpoint.
 *
 * SEGURIDAD
 *   Solo acepta peticiones de loopback. No expone nada al exterior.
 *   No toca la lista del operador. No escribe ficheros fuera de su cola.
 *
 * NO BLOQUEA AL PLAYER
 *   El timer lo llama aparte. pulse.php solo deja un ticket y sigue.
 */

declare(strict_types=1);

$REMOTE = $_SERVER['REMOTE_ADDR'] ?? '';
if (!in_array($REMOTE, ['127.0.0.1', '::1'], true)) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'error' => 'loopback_only']);
    exit;
}

$WARM_DIR = '/var/lib/ara/pulse/warm';
$MAX      = 6;          // canales por pasada: no saturar 3 vCPU
$TIMEOUT  = 6;          // por upstream
$TTL_GOOD = 900;        // 15 min de manifest bueno (antes 60 s)

if (!is_dir($WARM_DIR)) { @mkdir($WARM_DIR, 0775, true); }

$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    . '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Pide el upstream y devuelve [body, http_code]. */
function warm_fetch(string $url, string $ua, int $timeout): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 3,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_USERAGENT      => $ua,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_HTTPHEADER     => ['Accept: */*', 'Accept-Encoding: identity'],
    ]);
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [is_string($body) ? $body : '', $code];
}

/** Absolutiza URIs de segmento contra la URL efectiva. */
function warm_absolutize(string $body, string $base): string
{
    if (!preg_match('~^(https?://[^/]+)(.*)$~i', $base, $m)) { return $body; }
    $origin = $m[1];
    $dir    = rtrim(dirname($m[2]), '/');
    $out    = [];
    foreach (preg_split('~\R~', $body) as $ln) {
        $t = trim($ln);
        if ($t === '' || $t[0] === '#') { $out[] = $ln; continue; }
        if (preg_match('~^https?://~i', $t)) { $out[] = $ln; continue; }
        if (str_starts_with($t, '/')) { $out[] = $origin . $t; continue; }
        $out[] = $origin . $dir . '/' . $t;
    }
    return implode("\n", $out);
}

$hechos = [];
$fallos = [];
$t0 = microtime(true);

$tickets = glob($WARM_DIR . '/*.json') ?: [];
shuffle($tickets);

foreach (array_slice($tickets, 0, $MAX) as $f) {
    $t = json_decode((string) @file_get_contents($f), true);
    if (!is_array($t) || empty($t['u'])) { @unlink($f); continue; }
    $u = (string) $t['u'];
    if (!preg_match('~^https?://~i', $u)) { @unlink($f); continue; }

    [$raw, $code] = warm_fetch($u, $UA, $TIMEOUT);
    $esPlaylist = (stripos($raw, '#EXTM3U') !== false);

    if ($code === 200 && $esPlaylist) {
        $body = warm_absolutize($raw, $u);
        if (function_exists('apcu_store')) {
            $h = $t['h'] ?? hash('xxh3', $u);
            apcu_store('ape_pulse_pl_'   . $h, ['body' => $body, 'kind' => 'media'], 2);
            apcu_store('ape_pulse_good_' . $h, ['body' => $body], $TTL_GOOD);
        }
        $hechos[] = ['u' => $u, 'code' => $code, 'bytes' => strlen($body)];
        @unlink($f);
    } else {
        // Sigue fallando: se queda en cola, con contador para no ser eterno.
        $t['tries'] = (int) ($t['tries'] ?? 0) + 1;
        if ($t['tries'] >= 12) {
            @unlink($f);              // 12 intentos y fuera: no es transitorio
        } else {
            @file_put_contents($f, json_encode($t), LOCK_EX);
        }
        $fallos[] = ['u' => $u, 'code' => $code, 'tries' => $t['tries']];
    }
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo json_encode([
    'ok'          => true,
    'calentados'  => $hechos,
    'siguen_mal'  => $fallos,
    'en_cola'     => count(glob($WARM_DIR . '/*.json') ?: []),
    'wall_s'      => round(microtime(true) - $t0, 3),
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

<?php
/**
 * qoe-peek.php — ventana de sólo lectura a la observación del VPS (2026-11-04)
 *
 * PARA QUÉ
 *   Saber, mientras el operador hace zapping en su lista, qué está sirviendo el VPS y qué
 *   está observando. Sin esto, la única forma de verlo es entrar por SSH.
 *
 * QUÉ EXPONE
 *   - si el observer y el flush worker están vivos
 *   - el contenido de /var/cache/ara/qoe-last-flush.json (bps por canal)
 *   - la cola de wake /dev/shm/ape_wake_queue (qué canal pidió el device y cuándo)
 *   - las últimas peticiones .m3u8 del access log, con su código
 *
 * SEGURIDAD
 *   Sólo lectura. No escribe, no muta, no dispara nada. Las URLs de canal se REDACTAN
 *   (pueden llevar el par cuenta/clave). Sólo se muestran rutas y códigos.
 *   Requiere ?k=<token> para no quedar expuesto a Internet abierto: el token no se
 *   hardcodea, se lee de /etc/ara/peek.token si existe; si no existe, el endpoint exige
 *   haber sido llamado desde loopback.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-APE-Peek: v1');

// ── Autorización mínima ──────────────────────────────────────────────────────
$tokenFile = '/etc/ara/peek.token';
$tok = isset($_GET['k']) ? (string)$_GET['k'] : '';
$local = in_array((string)($_SERVER['REMOTE_ADDR'] ?? ''), ['127.0.0.1', '::1'], true);
$ok = false;
if (is_readable($tokenFile)) {
    $esperado = trim((string)@file_get_contents($tokenFile));
    $ok = $esperado !== '' && hash_equals($esperado, $tok);
} else {
    // Sin token configurado: sólo se sirve a loopback. Nunca abierto a Internet.
    $ok = $local;
}
if (!$ok) {
    http_response_code(403);
    echo json_encode([
        'ok' => false,
        'error' => 'forbidden',
        'hint' => is_readable($tokenFile)
            ? 'pasa ?k=<token de /etc/ara/peek.token>'
            : 'no hay /etc/ara/peek.token; sólo se sirve desde 127.0.0.1',
    ]);
    exit;
}

$safe = function (callable $fn, $dflt = null) {
    try { return $fn(); } catch (Throwable $e) { return $dflt; }
};

$out = [
    'ok'      => true,
    'now'     => gmdate('c'),
    'host'    => gethostname() ?: '?',
    'readonly'=> true,
];

// ── 1. ¿El observer y el flush worker están activos en nginx? ────────────────
$confDirs = ['/etc/nginx/nginx.conf', '/etc/nginx/conf.d', '/etc/nginx/snippets'];
$found = ['observer' => [], 'flush' => [], 'wake' => [], 'dict' => []];
$scan = function (string $p) use (&$scan, &$found) {
    if (!file_exists($p)) { return; }
    if (is_dir($p)) {
        foreach (glob($p . '/*') ?: [] as $c) { $scan($c); }
        return;
    }
    $txt = @file_get_contents($p);
    if ($txt === false) { return; }
    if (strpos($txt, 'qoe_server_side_observer') !== false) { $found['observer'][] = $p; }
    if (strpos($txt, 'qoe_flush_worker') !== false)         { $found['flush'][]    = $p; }
    if (strpos($txt, 'ape_wake_on_manifest') !== false)     { $found['wake'][]     = $p; }
    if (preg_match('/lua_shared_dict\s+([a-z_]+)\s+(\d+[kmg])?/i', $txt, $m)) {
        $found['dict'][] = $m[1] . (isset($m[2]) ? ' ' . $m[2] : '');
    }
};
foreach ($confDirs as $d) { $safe(fn() => $scan($d)); }

$out['nginx'] = [
    'observer_active' => count($found['observer']) > 0,
    'flush_active'    => count($found['flush']) > 0,
    'wake_active'     => count($found['wake']) > 0,
    'shared_dicts'    => array_values(array_unique($found['dict'])),
    'where_observer'  => array_slice($found['observer'], 0, 3),
    'where_flush'     => array_slice($found['flush'], 0, 3),
    'where_wake'      => array_slice($found['wake'], 0, 3),
    // Si observer_active es false, NO habrá bitrate_proxy: el flush no recibe nada.
    'consequence'     => count($found['observer']) > 0
        ? 'el observer corre en log_by_lua'
        : 'SIN observer: no hay qoe_metrics, el flush no tendrá métricas',
];

// ── 2. El último flush publicado ────────────────────────────────────────────
$flushPath = '/var/cache/ara/qoe-last-flush.json';
$flush = null;
if (is_readable($flushPath)) {
    $raw = @file_get_contents($flushPath);
    $j = $raw !== false ? json_decode($raw, true) : null;
    if (is_array($j)) {
        $ch = isset($j['channels']) && is_array($j['channels']) ? $j['channels'] : [];
        $flush = [
            'file_mtime'    => gmdate('c', (int)@filemtime($flushPath)),
            'age_s'         => time() - (int)@filemtime($flushPath),
            'ts'            => $j['ts'] ?? null,
            'bucket'        => $j['bucket'] ?? null,
            'channel_count' => count($ch),
            'channels'      => array_slice($ch, 0, 20, true),
        ];
    } else {
        $flush = ['error' => 'json invalido', 'bytes' => is_string($raw) ? strlen($raw) : 0];
    }
} else {
    $flush = [
        'error' => 'no existe',
        'hint'  => 'el flush worker corre cada 60 s; si nunca corrió, el fichero no aparece',
        'dir_writable' => is_writable('/var/cache/ara'),
    ];
}
$out['flush'] = $flush;

// ── 3. La cola de zapping ───────────────────────────────────────────────────
$qPath = '/dev/shm/ape_wake_queue';
$q = ['path' => $qPath, 'exists' => is_file($qPath)];
if (is_file($qPath)) {
    $q['bytes'] = (int)@filesize($qPath);
    $q['mtime'] = gmdate('c', (int)@filemtime($qPath));
    $q['age_s'] = time() - (int)@filemtime($qPath);
    $lines = @file($qPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    // formato: ts \t dev \t ch \t list \t cip
    $last = array_slice($lines, -10);
    $q['last_10'] = [];
    foreach ($last as $ln) {
        $p = explode("\t", $ln);
        $q['last_10'][] = [
            'ts'    => $p[0] ?? '',
            'dev'   => $p[1] ?? '',
            'ch'    => $p[2] ?? '',
            'list'  => $p[3] ?? '',
            'ip'    => $p[4] ?? '',
            'ago_s' => isset($p[0]) && is_numeric($p[0]) ? time() - (int)$p[0] : null,
        ];
    }
}
$out['wake_queue'] = $q;

// ── 4. Últimas peticiones .m3u8 en el access log (redactadas) ───────────────
$logCandidates = [
    '/var/log/nginx/access.log',
    '/var/log/nginx/iptv-access.log',
    '/var/log/nginx/prisma-access.log',
];
$logs = [];
foreach ($logCandidates as $lp) {
    if (!is_readable($lp)) { continue; }
    $size = (int)@filesize($lp);
    $fh = @fopen($lp, 'r');
    if (!$fh) { continue; }
    $tailBytes = min($size, 200000);
    @fseek($fh, max(0, $size - $tailBytes));
    $chunk = (string)@stream_get_contents($fh);
    @fclose($fh);
    $rows = [];
    foreach (array_reverse(explode("\n", $chunk)) as $ln) {
        if (count($rows) >= 15) { break; }
        if ($ln === '' || strpos($ln, '.m3u8') === false) { continue; }
        // Redactar la URL completa: puede llevar usuario/clave del proveedor.
        // Sólo se conserva la ruta y el código.
        $status = null;
        if (preg_match('/"\s+(\d{3})\s+/', $ln, $m)) { $status = (int)$m[1]; }
        $uri = null;
        if (preg_match('/"(?:GET|HEAD|POST)\s+(\S+)/', $ln, $m)) {
            $u = $m[1];
            $parts = parse_url($u);
            $uri = ($parts['path'] ?? $u);
            if (isset($parts['query'])) { $uri .= '?' . preg_replace('/=[^&]*/', '=***', $parts['query']); }
        }
        $bytes = null;
        if (preg_match('/"\s+\d{3}\s+(\d+)/', $ln, $m)) { $bytes = (int)$m[1]; }
        $rows[] = ['uri' => $uri, 'status' => $status, 'bytes' => $bytes];
    }
    $logs[$lp] = ['size' => $size, 'recent_m3u8' => $rows];
}
$out['access_logs'] = $logs;

echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);

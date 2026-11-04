<?php
/**
 * ape-last.php — qué cartucho se sirvió, para leerlo con un curl (2026-11-04)
 *
 * POR QUÉ EXISTE
 *   Para la prueba de zapping en vivo el operador necesita que yo pueda decirle, sin SSH y sin
 *   que él pegue nada, qué recibió su player. El registro lo escribe url2-cartridge.php; este
 *   endpoint lo devuelve.
 *
 * QUÉ NO EXPONE — y por eso es público
 *   NUNCA la URL del canal. El registro guarda channel id, nombre, perfil, nivel de realce,
 *   bps observado, fuente de la decisión, soc/max_h/ram_mb del device, seed y user-agent.
 *   Ni una URL, ni credenciales, ni rutas del proveedor. Es un latido de configuración.
 *
 * QUÉ SÍ EXPONE
 *   El último cartucho servido y hasta 20 anteriores, con su antigüedad en segundos, para
 *   poder decir "a las 11:20 se sirvió el canal X con perfil P1 y nivel 0".
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-APE-Last: v1');

$last = '/var/cache/ara/ape-last-served.json';
$hist = '/var/cache/ara/ape-served-history.jsonl';

$out = [
    'ok'   => true,
    'now'  => gmdate('c'),
    'ts'   => time(),
];

// ── Último servido ──────────────────────────────────────────────────────────
if (!is_file($last)) {
    $out['last'] = null;
    $out['last_error'] = 'no existe /var/cache/ara/ape-last-served.json';
    $out['dir'] = [
        'exists'   => is_dir('/var/cache/ara'),
        'writable' => is_writable('/var/cache/ara'),
    ];
    // Si el directorio no es escribible por www-data, el cartucho no puede registrar.
    if (is_dir('/var/cache/ara')) {
        $out['dir']['listing'] = array_slice(@scandir('/var/cache/ara') ?: [], 0, 20);
    }
} else {
    $raw = @file_get_contents($last);
    $j = $raw !== false ? json_decode($raw, true) : null;
    $mtime = (int)@filemtime($last);
    $out['last'] = is_array($j) ? $j : ['error' => 'json invalido', 'bytes' => is_string($raw) ? strlen($raw) : 0];
    $out['last_age_s'] = time() - $mtime;
    $out['last_mtime'] = gmdate('c', $mtime);
}

// ── Historial ───────────────────────────────────────────────────────────────
if (is_file($hist)) {
    $lines = @file($hist, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    $out['history_count'] = count($lines);
    $out['history'] = [];
    foreach (array_slice($lines, -20) as $ln) {
        $j = json_decode($ln, true);
        if (is_array($j)) {
            $out['history'][] = $j;
        }
    }
} else {
    $out['history'] = [];
    $out['history_count'] = 0;
}

// ── Qué canales distintos se sirvieron (resumen) ────────────────────────────
$porCanal = [];
foreach (($out['history'] ?? []) as $h) {
    $ch = (string)($h['channel'] ?? '?');
    if (!isset($porCanal[$ch])) {
        $porCanal[$ch] = ['channel' => $ch, 'name' => (string)($h['name'] ?? ''), 'veces' => 0, 'niveles' => []];
    }
    $porCanal[$ch]['veces']++;
    $porCanal[$ch]['niveles'][] = (string)($h['nivel'] ?? '?');
}
$out['channels_seen'] = array_values($porCanal);

// ── Diagnóstico del flush (vía 2) ───────────────────────────────────────────
$flushPath = '/var/cache/ara/qoe-last-flush.json';
if (is_file($flushPath)) {
    $fr = @file_get_contents($flushPath);
    $fj = $fr !== false ? json_decode($fr, true) : null;
    $out['flush'] = [
        'exists' => true,
        'age_s'  => time() - (int)@filemtime($flushPath),
        'channels' => is_array($fj) && isset($fj['channels']) ? count($fj['channels']) : 0,
    ];
} else {
    $out['flush'] = ['exists' => false, 'note' => 'el flush worker corre cada 60 s; si nunca corrió, no aparece'];
}

// ── Cola de zapping ────────────────────────────────────────────────────────
$q = '/dev/shm/ape_wake_queue';
if (is_file($q)) {
    $ql = @file($q, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    $tail = [];
    foreach (array_slice($ql, -5) as $ln) {
        $p = explode("\t", $ln);
        $tail[] = [
            'ts' => $p[0] ?? '', 'dev' => $p[1] ?? '', 'ch' => $p[2] ?? '',
            'list' => $p[3] ?? '', 'ago_s' => isset($p[0]) && is_numeric($p[0]) ? time() - (int)$p[0] : null,
        ];
    }
    $out['wake_queue'] = [
        'exists' => true,
        'mtime'  => gmdate('c', (int)@filemtime($q)),
        'age_s'  => time() - (int)@filemtime($q),
        'entries'=> count($ql),
        'tail'   => $tail,
    ];
} else {
    $out['wake_queue'] = ['exists' => false];
}

echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);

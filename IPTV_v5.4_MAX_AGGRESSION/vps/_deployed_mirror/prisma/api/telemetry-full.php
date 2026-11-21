<?php
/**
 * telemetry-full.php — telemetria del dispositivo y del flujo, en un solo GET.
 *
 * POR QUE EXISTE
 *   Medido el 2026-11-15: 141 peticiones a /prisma/api/telemetry-full devolvian 404, y
 *   las hacia el DEVICE (181.130.154.235). El cliente pide telemetria completa y el
 *   endpoint no existia. Se sirve lo que el VPS PUEDE medir; lo que no, se declara.
 *
 * HONESTIDAD
 *   El VPS no ve la tasa de fotogramas, ni los dropped del decoder, ni el buffer del
 *   player: eso vive en el device. Aqui se devuelve lo observable desde el servidor y
 *   se marcan como null los campos que solo el cliente puede aportar, con su razon.
 *   Un null declarado no es un cero.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$now = time();

/** Lee el ultimo estado sellado de un vigilante. */
function tf_json(string $path): array {
    if (!is_file($path)) { return array('present' => false, 'reason' => 'no existe'); }
    $raw = @file_get_contents($path);
    if ($raw === false) { return array('present' => false, 'reason' => 'no legible'); }
    $j = json_decode($raw, true);
    if (!is_array($j)) { return array('present' => true, 'valid' => false); }
    $j['_age_s'] = max(0, time() - (int)@filemtime($path));
    return $j;
}

/** Codigos HTTP de las ultimas N lineas del log de playlists. */
function tf_status_counts(string $log, int $tailLines): array {
    if (!is_file($log) || !is_readable($log)) {
        return array('present' => false, 'reason' => 'no legible', 'path' => $log);
    }
    $fh = @fopen($log, 'r');
    if (!$fh) { return array('present' => false, 'reason' => 'no se pudo abrir'); }
    // leer desde el final: nos quedamos con las ultimas ~256 KB
    $size = filesize($log);
    $from = max(0, $size - 262144);
    fseek($fh, $from);
    $chunk = fread($fh, 262144);
    fclose($fh);
    $lines = explode("\n", (string)$chunk);
    if ($from > 0 && count($lines)) { array_shift($lines); }
    $lines = array_slice($lines, -$tailLines);
    $c = array();
    foreach ($lines as $l) {
        if ($l === '') { continue; }
        if (preg_match('/"\s(\d{3})\s/', $l, $m)) { $c[$m[1]] = ($c[$m[1]] ?? 0) + 1; }
    }
    ksort($c);
    return array('present' => true, 'window_lines' => count($lines), 'by_status' => $c);
}

$light = '/var/www/html/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8';
$watchdog = tf_json('/var/lib/ape/module-watchdog.json');

$out = array(
    'ok'         => true,
    'checked_at' => gmdate('c'),
    'source'     => 'vps',
    'list' => array(
        'path'    => $light,
        'present' => is_file($light),
        'bytes'   => is_file($light) ? filesize($light) : null,
        'age_s'   => is_file($light) ? max(0, $now - filemtime($light)) : null,
    ),
    'watchdog'   => $watchdog,
    'playlist_http' => tf_status_counts('/var/log/nginx/playlist_access.log', 500),
    'load' => array(
        'loadavg' => function_exists('sys_getloadavg') ? sys_getloadavg() : null,
        'disk_free_bytes' => @disk_free_space('/') === false ? null : @disk_free_space('/'),
    ),
    // Lo que SOLO el device puede aportar. Se declara null con su razon:
    'player' => array(
        'fps_rendered'   => array('value' => null, 'reason' => 'se mide en el device, no en el VPS'),
        'dropped_frames' => array('value' => null, 'reason' => 'se mide en el device, no en el VPS'),
        'buffer_ms'      => array('value' => null, 'reason' => 'se mide en el device, no en el VPS'),
        'player_name'    => array('value' => null, 'reason' => 'el VPS no inspecciona el reproductor'),
    ),
);

echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), "\n";
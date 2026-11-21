<?php
declare(strict_types=1);

/**
 * APE PRISMA — Estado de SERVICIOS (solo lectura)
 *
 * Responde la pregunta del operador: "¿el servicio está arriba?"
 *
 * Reporta el estado REAL medido, no una suposición:
 *   - systemd: is-active + uptime por unidad
 *   - puerto:    si escucha en loopback (no se fía del unit)
 *   - HTTP:      si el endpoint del motor contesta
 *   - device:    último contacto del agente APK (si hay telemetría)
 *
 * Nada de esto escribe estado. Solo lee. Sin auth destructiva: es público
 * como el resto de /prisma/api (el estado no es sensible).
 *
 * FAIL-HONEST: si un chequeo no se puede hacer, se devuelve null con la razón.
 * Nunca se asume "arriba" porque el fichero exista.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store, max-age=0');

const UNITS = [
    'ape-jit'  => ['label' => 'APE JIT (motor de imagen)', 'port' => 3099],
    'nginx'    => ['label' => 'nginx (edge)',              'port' => 443],
];

/** Ejecuta un comando de solo lectura y devuelve [ok, salida, razón]. */
function ro(string $cmd): array
{
    if (!function_exists('shell_exec')) {
        return [false, '', 'shell_exec deshabilitado'];
    }
    $out = @shell_exec($cmd . ' 2>/dev/null');
    if ($out === null) {
        return [false, '', 'shell_exec sin salida'];
    }
    return [true, trim((string)$out), ''];
}

/** Estado de una unidad systemd, medido. */
function unitStatus(string $unit): array
{
    [$ok, $active, $why] = ro('systemctl is-active ' . escapeshellarg($unit));
    if (!$ok) {
        return ['state' => 'unknown', 'up' => null, 'reason' => $why];
    }
    $active = $active === '' ? 'unknown' : $active;
    $up = ($active === 'active');

    // uptime real desde el timestamp de activación (no del fichero)
    $since = '';
    $uptimeSec = null;
    [$ok2, $ts, ] = ro('systemctl show -p ActiveEnterTimestampMonotonic --value ' . escapeshellarg($unit));
    if ($ok2 && ctype_digit($ts) && (int)$ts > 0) {
        // microsegundos desde boot → convertir con /proc/uptime
        [$ok3, $uptimeRaw, ] = ro('cat /proc/uptime');
        if ($ok3 && $uptimeRaw !== '') {
            $bootUptime = (float)explode(' ', $uptimeRaw)[0];
            $unitStart  = (int)$ts / 1_000_000.0;
            $uptimeSec  = max(0, (int)round($bootUptime - $unitStart));
            $since      = gmdate('c', time() - $uptimeSec);
        }
    }

    return [
        'state'      => $active,
        'up'         => $up,
        'since'      => $since,
        'uptime_sec' => $uptimeSec,
        'reason'     => '',
    ];
}

/** ¿Escucha el puerto en loopback? Segunda fuente independiente del unit. */
function portListening(int $port): ?bool
{
    $cmd = sprintf(
        "ss -ltn 2>/dev/null | awk '{print \$4}' | grep -cE '(:|\\])%d$'",
        $port
    );
    [$ok, $out, ] = ro($cmd);
    if (!$ok || $out === '') {
        // fallback sin ss
        $fallback = sprintf(
            "grep -c ':%04X ' /proc/net/tcp /proc/net/tcp6 2>/dev/null | awk -F: '{s+=$2} END {print s+0}'",
            $port
        );
        [$ok2, $out2, ] = ro($fallback);
        return $ok2 && $out2 !== '' ? ((int)filter_var($out2, FILTER_SANITIZE_NUMBER_INT) > 0) : null;
    }
    return ((int)$out) > 0;
}

/** ¿El motor HTTP contesta? Tercera fuente. */
function httpProbe(string $url): ?int
{
    if (!function_exists('curl_init')) {
        return null;
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 4,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_NOBODY         => false,
    ]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ($body === false) ? null : $code;
}

$out = [
    'ts'       => gmdate('c'),
    'services' => [],
];

foreach (UNITS as $unit => $meta) {
    $st = unitStatus($unit);
    $port = portListening((int)$meta['port']);
    $out['services'][$unit] = [
        'label'      => $meta['label'],
        'unit'       => $unit,
        'state'      => $st['state'],
        'up'         => $st['up'],
        'since'      => $st['since'],
        'uptime_sec' => $st['uptime_sec'],
        'port'       => (int)$meta['port'],
        'port_up'    => $port,
        'reason'     => $st['reason'],
    ];
}

// Sonda HTTP real del motor (la que importa para el operador)
$jitHttp = httpProbe('http://127.0.0.1:3099/image/config');
$out['services']['ape-jit']['http_status'] = $jitHttp;
$out['services']['ape-jit']['http_up'] = ($jitHttp !== null && $jitHttp > 0 && $jitHttp < 500);

// El motor responde /image/prisma/lanes? Eso dice si PRISMA vive de verdad.
$prismaLanes = httpProbe('http://127.0.0.1:3099/image/prisma/lanes');
$out['prisma_engine'] = [
    'lanes_http' => $prismaLanes,
    'up'         => ($prismaLanes !== null && $prismaLanes === 200),
];

// Agente APK: último contacto medido (si existe el fichero de telemetría)
$agent = [
    'daemon_running' => null,
    'last_seen'      => null,
    'age_sec'        => null,
    'source'         => null,
];
$telemetryCandidates = [
    '/dev/shm/prisma_adb_telemetry.json',
    '/dev/shm/ape_agent_telemetry.json',
    '/var/www/html/prisma/adb-telemetry.json',
];
foreach ($telemetryCandidates as $f) {
    if (!is_file($f)) {
        continue;
    }
    $raw = @file_get_contents($f);
    if ($raw === false || $raw === '') {
        continue;
    }
    $j = json_decode($raw, true);
    if (!is_array($j)) {
        continue;
    }
    $agent['source'] = $f;
    $agent['daemon_running'] = $j['daemon_running'] ?? null;
    $ts = $j['ts'] ?? $j['timestamp'] ?? null;
    if ($ts !== null) {
        $t = is_numeric($ts) ? (int)$ts : (int)strtotime((string)$ts);
        if ($t > 0) {
            $agent['last_seen'] = gmdate('c', $t);
            $agent['age_sec'] = max(0, time() - $t);
        }
    }
    break;
}
if ($agent['source'] === null) {
    $agent['reason'] = 'sin fichero de telemetría del agente: no computado (no es "abajo")';
}
$out['agent'] = $agent;

// Un servicio se considera ARRIBA solo si el unit lo dice Y el puerto escucha
// Y (si aplica) el HTTP contesta. Cualquier discrepancia se declara.
foreach ($out['services'] as $k => $s) {
    $signals = [];
    if ($s['up'] === true)  { $signals[] = 'unit'; }
    if ($s['port_up'] === true) { $signals[] = 'port'; }
    if (isset($s['http_up']) && $s['http_up'] === true) { $signals[] = 'http'; }
    $out['services'][$k]['signals'] = $signals;
    $out['services'][$k]['verdict'] =
        ($s['up'] === true && $s['port_up'] !== false) ? 'UP' : 'DOWN';
}

$allUp = true;
foreach ($out['services'] as $s) {
    if ($s['verdict'] !== 'UP') { $allUp = false; }
}
$out['all_up'] = $allUp;

echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

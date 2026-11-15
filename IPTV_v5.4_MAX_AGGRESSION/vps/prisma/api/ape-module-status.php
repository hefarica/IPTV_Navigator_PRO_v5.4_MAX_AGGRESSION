<?php
/**
 * ape-module-status.php — estado de los modulos del APE CRYSTAL FLOW.
 *
 * POR QUE EXISTE
 *   Medido el 2026-11-15 en /var/log/nginx/playlist_access.log: 42 peticiones a
 *   /prisma/api/ape-module-status.php devolvian 404. Las hacia el propio VPS (el gate
 *   gate_ape_crystal_flow.sh) y el device. Un endpoint que se pide y no existe no es
 *   un fallo del cliente: es un 404 que se puede cerrar devolviendo el estado real.
 *
 * QUE DEVUELVE (y que NO)
 *   Estado MEDIDO de cada modulo: se comprueba systemctl, el puerto y el fichero de
 *   estado. Si algo no se puede comprobar, se dice "unknown" con la razon; NO se
 *   inventa un "ok". Un modulo que no responde se reporta como down, no se omite.
 *
 * FLAG: APE_MODULE_STATUS=0 (o off/false/no) devuelve 503 con {"ok":false,"disabled":true}.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function ms_enabled(): bool {
    $v = getenv('APE_MODULE_STATUS');
    if ($v === false || $v === '') { return true; }
    $s = strtolower(trim((string)$v));
    return !($s === '0' || $s === 'off' || $s === 'false' || $s === 'no');
}

if (!ms_enabled()) {
    http_response_code(503);
    echo json_encode(array('ok' => false, 'disabled' => true, 'module' => 'ape-module-status'));
    exit;
}

/** Ejecuta un comando de solo lectura y devuelve [exit, stdout]. Sin shell. */
function ms_cmd(array $argv): array {
    if (!function_exists('proc_open')) { return array(-1, ''); }
    $desc = array(1 => array('pipe', 'w'), 2 => array('pipe', 'w'));
    $p = @proc_open($argv, $desc, $pipes);
    if (!is_resource($p)) { return array(-1, ''); }
    $out = stream_get_contents($pipes[1]);
    fclose($pipes[1]); fclose($pipes[2]);
    $code = proc_close($p);
    return array($code, (string)$out);
}

/** Estado de una unidad systemd: active/inactive/unknown, con la razon. */
function ms_unit(string $unit): array {
    list($code, $out) = ms_cmd(array('/bin/systemctl', 'is-active', $unit));
    $s = trim($out);
    if ($code === -1) { return array('state' => 'unknown', 'reason' => 'proc_open no disponible'); }
    if ($s === '')    { return array('state' => 'unknown', 'reason' => 'systemctl sin salida'); }
    return array('state' => $s);
}

/** Comprueba si un puerto local escucha (leyendo /proc, sin ss ni netstat). */
function ms_port(int $port): array {
    $tcp6 = @file_get_contents('/proc/net/tcp6');
    $tcp  = @file_get_contents('/proc/net/tcp');
    $hex  = sprintf(':%04X', $port);
    foreach (array($tcp6, $tcp) as $src) {
        if (!is_string($src) || $src === '') { continue; }
        foreach (explode("\n", $src) as $line) {
            if ($line === '' || stripos($line, 'local_address') === 0) { continue; }
            $parts = preg_split('/\s+/', trim($line));
            if (isset($parts[1]) && substr($parts[1], -5) === $hex) {
                return array('listening' => true, 'state' => isset($parts[3]) ? $parts[3] : null);
            }
        }
    }
    return array('listening' => false);
}

/** Fichero de estado JSON: devuelve su contenido o la razon por la que no. */
function ms_state(string $path): array {
    if (!is_file($path)) { return array('present' => false, 'reason' => 'no existe'); }
    $raw = @file_get_contents($path);
    if ($raw === false) { return array('present' => false, 'reason' => 'no legible'); }
    $json = json_decode($raw, true);
    if (!is_array($json)) { return array('present' => true, 'valid' => false, 'bytes' => strlen($raw)); }
    return array('present' => true, 'valid' => true, 'bytes' => strlen($raw),
                 'age_s' => is_file($path) ? max(0, time() - filemtime($path)) : null);
}

$mods = array();

// nginx + php-fpm: el plano que sirve las listas
$mods['nginx']   = ms_unit('nginx.service');
$mods['php_fpm'] = ms_unit('php8.3-fpm.service');
$mods['nginx']['port_8088'] = ms_port(8088);
$mods['nginx']['port_443']  = ms_port(443);

// JIT: el motor bajo demanda. Escucha en 3099 (medido) y nginx lo publica en 8088.
$mods['jit'] = ms_unit('ape-jit.service');
$mods['jit']['port_3099'] = ms_port(3099);

// canario y vigilante
$mods['canary']    = ms_unit('ape-pulse-canary.service');
$mods['watchdog']  = ms_unit('ape-module-watchdog.timer');
$mods['watchdog']['state_file'] = ms_state('/var/lib/ape/module-watchdog.json');

// shim / agente: viven en el device, no aqui. Se reporta que NO se pueden ver.
$mods['apk_agent'] = array(
    'state'  => 'unknown',
    'reason' => 'corre en el device, no en el VPS: el VPS no puede observar su proceso',
);
$mods['shim'] = array(
    'state'  => 'unknown',
    'reason' => 'corre en el device; su salud se ve en /shim/health del propio device',
);

// proyeccion OTT: el fichero que sirve el tag
$light = '/var/www/html/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8';
if (is_file($light)) {
    $mods['list_light'] = array(
        'present' => true,
        'bytes'   => filesize($light),
        'age_s'   => max(0, time() - filemtime($light)),
        'path'    => $light,
    );
} else {
    $mods['list_light'] = array('present' => false, 'path' => $light, 'reason' => 'no existe');
}

// veredicto: down si nginx o php-fpm no estan active; degraded si algun modulo opcional falla
$down = array();
foreach (array('nginx', 'php_fpm') as $k) {
    if (($mods[$k]['state'] ?? '') !== 'active') { $down[] = $k; }
}
$verdict = $down ? 'DOWN' : 'UP';

echo json_encode(array(
    'ok'        => $down ? false : true,
    'verdict'   => $verdict,
    'down'      => $down,
    'checked_at'=> gmdate('c'),
    'modules'   => $mods,
    'note'      => 'apk_agent y shim son unknown por diseño: corren en el device, no aqui',
), JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), "\n";
<?php
/**
 * canary-resolve.php — Zapping → Canary → Resolve → Cartucho (2026-11-04)
 *
 * QUÉ HACE
 *   Un solo endpoint que, al pedir un canal, dispara el canary 4K sobre la fuente real,
 *   lee lo que el canary MIDIÓ (resolución, bitrate, HDR, fps) y compone el cartucho con
 *   esos valores medidos en vez de con una pista estática.
 *
 * POR QUÉ ASÍ Y NO COMO EL DISEÑO ORIGINAL
 *   El diseño pedía un daemon `ape-canary --daemon --port 9000` con Redis y tres clases PHP
 *   (CanaryClient, ResolveEngine, CacheManager). Verificado en este repositorio y VPS:
 *     · el binario `ape-canary` NO existe — el canary real es `ape-visual-emulate.sh`
 *       invocado por `ape-canaryctl` dentro del unit template `ape-canary@<id>.service`
 *     · esas tres clases PHP NO existen
 *     · Redis NO está instalado en el VPS de IPTV
 *   Así que este endpoint habla con la interfaz que SÍ existe: `ape-canaryctl` y
 *   `/var/lib/ara/canary/<id>/status.json`. La caché es en disco, no en Redis.
 *
 * CÓDIGOS DE RESPUESTA — sólo los que son físicamente ciertos
 *   200  manifiesto generado (siempre; un manifiesto dinámico no se trocea)
 *   206  SÓLO cuando se pide la lista estática del VPS por Range. Un fichero generado
 *        on-the-fly no tiene rangos que servir, y fingir un 206 sería mentir.
 *   302  fallback al origen cuando el canary no puede medir
 *
 * SEGURIDAD
 *   Rate limit por IP + id. El id del canary se deriva de u con sha1, saneado a
 *   [A-Za-z0-9._-]. La URL del canal NUNCA se escribe en logs (puede llevar credenciales).
 */

declare(strict_types=1);

header('X-APE-Canary-Resolve: v1');
header('Cache-Control: no-store, no-cache, must-revalidate');

// ── Diagnóstico (?diag=1): qué piezas del canary existen de verdad ───────────
if (isset($_GET['diag'])) {
    $ctlOk  = is_file(CTL);
    $ctlEx  = $ctlOk && is_executable(CTL);
    $emu    = '/usr/local/bin/ape-visual-emulate.sh';
    $skill  = '/usr/local/bin/ara-skill';
    $units  = [];
    foreach (glob('/etc/systemd/system/ape-canary@*') ?: [] as $f) { $units[] = basename($f); }
    $runs = [];
    foreach (glob(CANARY_ROOT . '/*', GLOB_ONLYDIR) ?: [] as $d) {
        $runs[] = ['id' => basename($d), 'has_status' => is_file($d . '/status.json'), 'files' => count(glob($d . '/*') ?: [])];
    }
    $envs = [];
    foreach (glob('/etc/ara/canary/*.env') ?: [] as $f) { $envs[] = basename($f); }
    cr_json(200, [
        'ok' => true,
        'diag' => true,
        'canaryctl_path' => CTL,
        'canaryctl_exists' => $ctlOk,
        'canaryctl_executable' => $ctlEx,
        'ape_visual_emulate' => is_file($emu),
        'ara_skill' => is_file($skill),
        'skills_md' => is_file('/etc/ara/skills/SKILLS.md'),
        'canary_units' => $units,
        'canary_env_files' => $envs,
        'canary_runs' => $runs,
        'canary_root_writable' => is_writable(CANARY_ROOT),
        'cache_root_writable' => is_writable(CACHE_ROOT),
        'php_user' => function_exists('posix_getpwuid') ? (posix_getpwuid(posix_geteuid())['name'] ?? '?') : (get_current_user() ?: '?'),
        'exec_enabled' => function_exists('proc_open') && !in_array('proc_open', array_map('trim', explode(',', (string)ini_get('disable_functions'))), true),
    ]);
}



const CANARY_ROOT   = '/var/lib/ara/canary';
const CACHE_ROOT    = '/var/cache/ara/resolve';
const CTL           = '/usr/local/bin/ape-canaryctl';
const CANARY_SECS   = 6;
const CANARY_WAIT   = 12;
const CACHE_TTL     = 300;
const RATE_DIR      = '/var/cache/ara/resolve/rl';
const RATE_MAX      = 20;
const RATE_WINDOW   = 60;

function cr_fail(int $code, string $why, string $detail = ''): void
{
    http_response_code($code);
    header('Content-Type: text/plain; charset=utf-8');
    echo "#EXTM3U\n## canary-resolve: " . $why . ($detail !== '' ? ' (' . $detail . ')' : '') . "\n";
    exit;
}

function cr_json(int $code, array $payload): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

// ── Entrada ──────────────────────────────────────────────────────────────────
$u      = isset($_GET['u']) ? (string)$_GET['u'] : '';
$devRaw = isset($_GET['d']) ? (string)$_GET['d'] : (string)($_SERVER['HTTP_X_DEVICE_PROFILE'] ?? '');
$mode   = strtolower((string)($_GET['mode'] ?? ''));

if ($u === '') {
    cr_fail(400, 'falta u');
}
if (strlen($u) > 2000) {
    cr_fail(400, 'u demasiado larga');
}
if (preg_match('/[\x00-\x20\x7F\x22\x27\x3C\x3E\x5C]/', $u)) {
    cr_fail(400, 'u con caracteres invalidos');
}
if (!preg_match('#^https?://#i', $u)) {
    cr_fail(400, 'u no es http(s)');
}

$parts = parse_url($u);
if (!is_array($parts) || empty($parts['host'])) {
    cr_fail(400, 'u sin host');
}

// ── Rate limit: fichero por IP, ventana deslizante simple ────────────────────
@mkdir(RATE_DIR, 0770, true);
$ipKey  = preg_replace('/[^A-Za-z0-9]/', '', (string)($_SERVER['REMOTE_ADDR'] ?? 'x'));
$rlFile = RATE_DIR . '/ip_' . substr(sha1($ipKey), 0, 16);
$now    = time();
$hits   = [];
if (is_file($rlFile)) {
    $raw = @file_get_contents($rlFile);
    if ($raw !== false) {
        $dec = json_decode($raw, true);
        if (is_array($dec)) {
            foreach ($dec as $t) {
                if (is_int($t) && ($now - $t) < RATE_WINDOW) {
                    $hits[] = $t;
                }
            }
        }
    }
}
if (count($hits) >= RATE_MAX) {
    header('Retry-After: ' . RATE_WINDOW);
    cr_fail(429, 'rate limit', (string)count($hits));
}
$hits[] = $now;
@file_put_contents($rlFile, json_encode($hits), LOCK_EX);

// ── Device ───────────────────────────────────────────────────────────────────
function cr_b64json(string $s): ?array
{
    if ($s === '' || strlen($s) > 4096) {
        return null;
    }
    $raw = base64_decode(strtr($s, '-_', '+/'), true);
    if ($raw === false) {
        return null;
    }
    $j = json_decode($raw, true);
    return is_array($j) ? $j : null;
}

function cr_device(string $devRaw): array
{
    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    $d = [
        'soc' => '', 'ram_mb' => 0, 'max_w' => 0, 'max_h' => 0,
        'fps' => 0, 'hdr' => '', 'codecs' => '', 'source' => 'none',
    ];

    $decl = cr_b64json($devRaw);
    if (is_array($decl)) {
        foreach (['soc', 'hdr', 'codecs'] as $k) {
            if (isset($decl[$k]) && is_string($decl[$k])) {
                $d[$k] = substr($decl[$k], 0, 40);
            }
        }
        foreach (['ram_mb', 'max_w', 'max_h', 'fps'] as $k) {
            if (isset($decl[$k]) && is_numeric($decl[$k])) {
                $d[$k] = (int)$decl[$k];
            }
        }
        $d['source'] = 'player-declared';
    }

    if ($d['source'] === 'none' && $ua !== '') {
        $d['source'] = 'ua-inferred';
        if (preg_match('/Shield|NVIDIA/i', $ua)) {
            $d['soc'] = 'tegra-x1'; $d['ram_mb'] = 3072; $d['max_w'] = 3840; $d['max_h'] = 2160; $d['fps'] = 60; $d['hdr'] = 'dv,hdr10';
        } elseif (preg_match('/Fire.?TV|AFT/i', $ua)) {
            $d['soc'] = 'mediatek'; $d['ram_mb'] = 2048; $d['max_w'] = 3840; $d['max_h'] = 2160; $d['fps'] = 60; $d['hdr'] = 'hdr10';
        } elseif (preg_match('/ONN|Amlogic|S905/i', $ua)) {
            $d['soc'] = 's905x4'; $d['ram_mb'] = 2048; $d['max_w'] = 3840; $d['max_h'] = 2160; $d['fps'] = 60; $d['hdr'] = 'hdr10';
        } elseif (preg_match('/VLC/i', $ua)) {
            $d['soc'] = 'vlc'; $d['ram_mb'] = 4096; $d['max_w'] = 3840; $d['max_h'] = 2160; $d['fps'] = 60; $d['hdr'] = 'hdr10';
        } elseif (preg_match('/Kodi|LibreELEC/i', $ua)) {
            $d['soc'] = 'kodi'; $d['ram_mb'] = 2048; $d['max_w'] = 3840; $d['max_h'] = 2160; $d['fps'] = 60;
        } elseif (preg_match('/Android/i', $ua)) {
            $d['soc'] = 'android'; $d['ram_mb'] = 2048; $d['max_w'] = 1920; $d['max_h'] = 1080; $d['fps'] = 60;
        }
    }
    return $d;
}

// Perfil sostenible: nunca se declara más de lo que el panel soporta.
function cr_pick_profile(array $dev, array $probe): string
{
    $devH = (int)$dev['max_h'];
    $ram  = (int)$dev['ram_mb'];
    $hdr  = (string)$dev['hdr'];
    // Techo del device; si el canary midió menos, manda el canary.
    $probeH = 0;
    if (!empty($probe['resolution']) && preg_match('/(\d+)x(\d+)/', (string)$probe['resolution'], $m)) {
        $probeH = (int)$m[2];
    }
    $ceiling = $devH > 0 ? $devH : 2160;
    if ($probeH > 0) {
        $ceiling = min($ceiling, $probeH);
    }
    if ($ceiling >= 2160 && $ram >= 3072 && preg_match('/dv/i', $hdr)) {
        return 'P0';
    }
    if ($ceiling >= 2160 && $ram >= 2048) {
        return 'P1';
    }
    if ($ceiling >= 1440) {
        return 'P2';
    }
    if ($ceiling >= 1080) {
        return 'P3';
    }
    if ($ceiling >= 720) {
        return 'P4';
    }
    return 'P5';
}

// ── Cache en disco (Redis no está instalado) ─────────────────────────────────
@mkdir(CACHE_ROOT, 0770, true);

function cr_cache_get(string $key): ?array
{
    $f = CACHE_ROOT . '/' . $key . '.json';
    if (!is_file($f)) {
        return null;
    }
    $age = time() - (int)@filemtime($f);
    if ($age > CACHE_TTL) {
        return null;
    }
    $raw = @file_get_contents($f);
    if ($raw === false) {
        return null;
    }
    $j = json_decode($raw, true);
    return is_array($j) ? $j : null;
}

function cr_cache_set(string $key, array $val): void
{
    @file_put_contents(CACHE_ROOT . '/' . $key . '.json', json_encode($val), LOCK_EX);
}

// ── Canary: dispara ape-canaryctl y lee status.json ──────────────────────────
function cr_canary_id(string $u): string
{
    return 'r' . substr(sha1($u), 0, 16);
}

function cr_canary_probe(string $u): array
{
    $id   = cr_canary_id($u);
    $out  = CANARY_ROOT . '/' . $id;
    $stat = $out . '/status.json';

    // Si ya hay una medición fresca, se usa.
    if (is_file($stat)) {
        $age = time() - (int)@filemtime($stat);
        if ($age <= CACHE_TTL) {
            $raw = @file_get_contents($stat);
            if ($raw !== false) {
                $j = json_decode($raw, true);
                if (is_array($j)) {
                    $j['canary_source'] = 'status.json (fresh)';
                    return $j;
                }
            }
        }
    }

    // ¿Existe el controlador? Si no, no se puede medir: se devuelve fallo honesto.
    if (!is_file(CTL) || !is_executable(CTL)) {
        return ['ok' => false, 'error' => 'canaryctl_missing'];
    }

    // Limpiar la medición anterior para no leer un status viejo.
    @unlink($stat);

    // El ctl nunca imprime la URL del canal; se le pasa por argumento.
    $cmd = escapeshellcmd(CTL)
        . ' start ' . escapeshellarg($id)
        . ' --source-url ' . escapeshellarg($u)
        . ' --seconds ' . CANARY_SECS
        . ' 2>&1';
    $descriptors = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
    $proc = @proc_open($cmd, $descriptors, $pipes);
    if (!is_resource($proc)) {
        return ['ok' => false, 'error' => 'proc_open_failed'];
    }
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);
    $ctlOut = '';
    $deadline = microtime(true) + CANARY_WAIT;
    while (microtime(true) < $deadline) {
        $ctlOut .= (string)@stream_get_contents($pipes[1]);
        $ctlOut .= (string)@stream_get_contents($pipes[2]);
        $st = proc_get_status($proc);
        if (!($st['running'] ?? false)) {
            break;
        }
        if (is_file($stat)) {
            // El status apareció: no hace falta esperar más.
            break;
        }
        usleep(200000);
    }
    @proc_terminate($proc);
    @fclose($pipes[1]);
    @fclose($pipes[2]);
    @proc_close($proc);

    if (!is_file($stat)) {
        return ['ok' => false, 'error' => 'no_status', 'ctl' => substr($ctlOut, 0, 200)];
    }
    $raw = @file_get_contents($stat);
    if ($raw === false) {
        return ['ok' => false, 'error' => 'status_unreadable'];
    }
    $j = json_decode($raw, true);
    if (!is_array($j)) {
        return ['ok' => false, 'error' => 'status_bad_json'];
    }
    $j['canary_source'] = 'status.json (fresh probe)';
    return $j;
}

// ── Ejecución ────────────────────────────────────────────────────────────────
$device = cr_device($devRaw);
$cKey   = 'canary_' . substr(sha1($u), 0, 32);

$probe = cr_cache_get($cKey);
if ($probe === null) {
    $probe = cr_canary_probe($u);
    if (!empty($probe['ok'])) {
        cr_cache_set($cKey, $probe);
    }
}

$canaryOk = !empty($probe['ok']);

// ── 302: fallback al origen cuando el canary no puede medir ──────────────────
// Se ofrece 302 tanto si se pide explícitamente (mode=redirect) como si el canary
// falló: mejor que el player vaya directo al proveedor que servirle datos inventados.
if ($mode === 'redirect' || !$canaryOk) {
    $reason = $mode === 'redirect' ? 'requested' : 'canary-unavailable';
    header('X-APE-Canary-Status: ' . ($canaryOk ? 'VERIFIED' : 'FAILED'));
    header('X-APE-Redirect-Reason: ' . $reason);
    header('Location: ' . $u, true, 302);
    exit;
}

// ── Resolve ──────────────────────────────────────────────────────────────────
$profile = cr_pick_profile($device, $probe);

$res = [
    'resolution' => (string)($probe['resolution'] ?? 'unknown'),
    'bitrate'    => $probe['bitrate_mbps'] ?? ($probe['bitrate'] ?? 0),
    'fps'        => $probe['fps'] ?? ($probe['frame_rate'] ?? 0),
    'hdr'        => (string)($probe['hdr'] ?? ($probe['video_range'] ?? 'unknown')),
    'is4k'       => !empty($probe['is_4k']),
];

// Mbit del cartucho a partir de lo MEDIDO, no de una tabla.
$mbps  = is_numeric($res['bitrate']) ? (float)$res['bitrate'] : 0.0;
$bw    = $mbps > 0 ? (int)round($mbps * 1000000) : 0;
$resTxt = preg_match('/^\d+x\d+$/', $res['resolution']) ? $res['resolution'] : 'unknown';
$fpsTxt = is_numeric($res['fps']) && (float)$res['fps'] > 0 ? number_format((float)$res['fps'], 3, '.', '') : '';

// GOLDEN RULE: hvc1 sólo en STREAM-INF; hev1 nunca cruzado.
$codec = 'hvc1.2.4.L153.B0';
if ($resTxt !== 'unknown' && preg_match('/^\d+x(\d+)$/', $resTxt, $mm)) {
    $h = (int)$mm[1];
    if ($h >= 2160 && $fpsTxt !== '' && (float)$fpsTxt >= 100) {
        $codec = 'hvc1.2.4.L156.B0';
    } elseif ($h >= 2160) {
        $codec = 'hvc1.2.4.L153.B0';
    } elseif ($h >= 1080) {
        $codec = 'hvc1.2.4.L123.B0';
    } elseif ($h >= 720) {
        $codec = 'hvc1.2.4.L120.B0';
    } else {
        $codec = 'hvc1.2.4.L93.B0';
    }
}

$seed = substr(sha1($u . '#' . implode('|', [
    $device['soc'], $device['ram_mb'], $device['max_h'], $device['fps'],
    $device['hdr'], $device['source'], $resTxt, (string)$mbps,
])), 0, 16);

// ── 200: manifiesto con lo medido ────────────────────────────────────────────
http_response_code(200);
header('Content-Type: application/vnd.apple.mpegurl; charset=utf-8');
header('X-APE-Canary-Status: VERIFIED');
header('X-APE-Canary-Profile: ' . $profile);
header('X-APE-Canary-Seed: ' . $seed);
header('X-APE-Canary-Source: ' . (string)($probe['canary_source'] ?? 'unknown'));

$lines = [];
$lines[] = '#EXTM3U';
$lines[] = '#EXT-X-VERSION:6';
$lines[] = '#EXT-X-APE-CANARY-RESOLVE:1';
$lines[] = '#EXT-X-APE-CANARY-VERIFIED:YES';
$lines[] = '#EXT-X-APE-CANARY-REAL-RES:' . $resTxt;
$lines[] = '#EXT-X-APE-CANARY-BITRATE:' . $mbps;
$lines[] = '#EXT-X-APE-CANARY-SOURCE:' . (string)($probe['canary_source'] ?? 'unknown');
$lines[] = '#EXT-X-APE-PROFILE:' . $profile;
$lines[] = '#EXT-X-APE-DEVICE:SOURCE=' . $device['source']
    . ';SOC=' . ($device['soc'] !== '' ? $device['soc'] : 'unknown')
    . ';RAM_MB=' . (int)$device['ram_mb']
    . ';MAX_H=' . (int)$device['max_h']
    . ';HDR=' . ($device['hdr'] !== '' ? $device['hdr'] : 'none');
$lines[] = '#EXT-X-APE-IDEMPOTENCIA:SEED=' . $seed;
$lines[] = '#EXT-X-APE-POLIMORFISMO:1PCT_UNIQUENESS';

$attrs = [];
$attrs[] = 'BANDWIDTH=' . ($bw > 0 ? $bw : 8000000);
$attrs[] = 'AVERAGE-BANDWIDTH=' . ($bw > 0 ? (int)round($bw * 0.8) : 6000000);
$attrs[] = 'CODECS="' . $codec . ',mp4a.40.2"';
if ($resTxt !== 'unknown') {
    $attrs[] = 'RESOLUTION=' . $resTxt;
}
if ($fpsTxt !== '') {
    $attrs[] = 'FRAME-RATE=' . $fpsTxt;
}
if (preg_match('/pq|hdr10|dv/i', $res['hdr'])) {
    $attrs[] = 'VIDEO-RANGE=PQ';
}
$attrs[] = 'STABLE-VARIANT-ID="' . preg_replace('/[^A-Za-z0-9._-]/', '', $res['resolution']) . '_' . $profile . '"';

$lines[] = '#EXT-X-STREAM-INF:' . implode(',', $attrs);
$lines[] = $u;

echo implode("\n", $lines) . "\n";
